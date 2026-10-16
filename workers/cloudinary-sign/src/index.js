// Cloudflare Worker: signed Cloudinary upload authorization for Dream Vault.
//
// Security model:
//  - Strict Origin allowlist (never disabled; supports multiple exact origins).
//  - Firebase ID token verified server-side (RS256 via Google JWK, cached).
//  - Cloudinary signature scoped to dream-vault/<uid> with allowed_formats=jpg.
//  - Best-effort rate limiting (per-IP pre-auth, per-UID post-auth).
//  - No credentials embedded in browser code.
//
// Vars:  CLOUDINARY_API_KEY, CLOUDINARY_CLOUD_NAME, FIREBASE_PROJECT_ID, ALLOWED_ORIGINS
// Secret: CLOUDINARY_API_SECRET (encrypted Worker secret; never committed)

const encoder = new TextEncoder();

const JWKS_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
const JWK_TTL_MS = 60 * 60 * 1000;      // refresh Google signing keys hourly
const CLOCK_SKEW_SECONDS = 60;          // tolerate small client/Google clock drift
const MAX_TOKEN_CHARS = 4096;           // bound the work an unauthenticated request can cause
const ALLOWED_FORMATS = "jpg";          // Cloudinary will reject anything else

const RATE_IP = { windowMs: 60_000, max: 30 };
const RATE_UID = { windowMs: 60_000, max: 20 };
const rateBuckets = new Map();          // best-effort, per-isolate

let jwksCache = { keys: null, fetchedAt: 0 };

function jsonHeaders(origin) {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  };
}

function fail(message, status, origin, extra = {}) {
  return new Response(JSON.stringify({ error: message }), { status, headers: { ...jsonHeaders(origin), ...extra } });
}

function allowedOrigins(env) {
  const raw = `${env.ALLOWED_ORIGINS || ""},${env.ALLOWED_ORIGIN || ""}`;
  return raw.split(",").map(s => s.trim()).filter(Boolean);
}

function rateLimited(key, limit, now) {
  const bucket = rateBuckets.get(key);
  if (!bucket || now >= bucket.reset) {
    rateBuckets.set(key, { count: 1, reset: now + limit.windowMs });
    return false;
  }
  bucket.count += 1;
  return bucket.count > limit.max;
}

function pruneBuckets(now) {
  if (rateBuckets.size < 5000) return;
  for (const [key, bucket] of rateBuckets) if (now >= bucket.reset) rateBuckets.delete(key);
}

// base64url -> Uint8Array
function b64urlToBytes(input) {
  const remainder = input.length % 4;
  if (remainder === 1) throw new Error("bad base64");
  const padded = input.replace(/-/g, "+").replace(/_/g, "/") + (remainder ? "=".repeat(4 - remainder) : "");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function getJwks() {
  const now = Date.now();
  if (jwksCache.keys && now - jwksCache.fetchedAt < JWK_TTL_MS) return jwksCache.keys;
  const response = await fetch(JWKS_URL, { cf: { cacheTtl: 3600, cacheEverything: true } });
  if (!response.ok) throw new Error("jwks-unavailable");
  const data = await response.json();
  if (!Array.isArray(data.keys) || data.keys.length === 0) throw new Error("jwks-empty");
  jwksCache = { keys: data.keys, fetchedAt: now };
  return data.keys;
}

async function verifyFirebaseToken(token, project) {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("token-malformed");

  let header;
  let payload;
  try {
    header = JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[0])));
    payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[1])));
  } catch {
    throw new Error("token-malformed");
  }

  const now = Math.floor(Date.now() / 1000);
  if (header.alg !== "RS256" || !header.kid) throw new Error("token-header");
  if (payload.aud !== project) throw new Error("token-audience");
  if (payload.iss !== `https://securetoken.google.com/${project}`) throw new Error("token-issuer");
  if (typeof payload.sub !== "string" || payload.sub.length === 0 || payload.sub.length > 128) throw new Error("token-subject");
  if (!Number.isFinite(payload.exp) || payload.exp <= now - CLOCK_SKEW_SECONDS) throw new Error("token-expired");
  if (!Number.isFinite(payload.iat) || payload.iat > now + CLOCK_SKEW_SECONDS) throw new Error("token-iat");
  if (!Number.isFinite(payload.auth_time) || payload.auth_time > now + CLOCK_SKEW_SECONDS) throw new Error("token-auth_time");

  const keys = await getJwks();
  const jwk = keys.find(candidate => candidate.kid === header.kid);
  if (!jwk) throw new Error("token-unknown-key");

  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64urlToBytes(parts[2]), encoder.encode(`${parts[0]}.${parts[1]}`));
  if (!valid) throw new Error("token-signature");

  return payload.sub;
}

async function sha1Hex(value) {
  const digest = await crypto.subtle.digest("SHA-1", encoder.encode(value));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const permitted = allowedOrigins(env);

    // Fail closed if the allowlist is not configured, and never disable the check.
    if (permitted.length === 0 || !permitted.includes(origin)) {
      return fail("origin forbidden", 403, "null");
    }

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: jsonHeaders(origin) });
    }

    if (request.method !== "POST" || new URL(request.url).pathname !== "/sign") {
      return fail("not found", 404, origin);
    }

    if (!env.CLOUDINARY_API_SECRET || !env.CLOUDINARY_API_KEY || !env.CLOUDINARY_CLOUD_NAME || !env.FIREBASE_PROJECT_ID) {
      return fail("not configured", 503, origin);
    }

    const now = Date.now();
    pruneBuckets(now);
    const clientIp = request.headers.get("CF-Connecting-IP") || "unknown";
    if (rateLimited(`ip:${clientIp}`, RATE_IP, now)) {
      return fail("too many requests", 429, origin, { "Retry-After": "60" });
    }

    const authorization = request.headers.get("Authorization") || "";
    if (authorization.length > MAX_TOKEN_CHARS + 16) return fail("invalid authentication", 401, origin);
    const match = /^Bearer (\S+)$/.exec(authorization);
    if (!match) return fail("authentication required", 401, origin);

    let uid;
    try {
      uid = await verifyFirebaseToken(match[1], env.FIREBASE_PROJECT_ID);
    } catch (error) {
      console.log("auth rejected:", error.message); // Workers Logs only; not returned to caller
      return fail("invalid authentication", 401, origin);
    }

    if (rateLimited(`uid:${uid}`, RATE_UID, now)) {
      return fail("too many requests", 429, origin, { "Retry-After": "60" });
    }

    // Signed params are scoped server-side; the caller cannot influence folder or public_id.
    // Signature covers folder + allowed_formats + timestamp (alphabetical, per Cloudinary).
    const timestamp = Math.floor(now / 1000);
    const folder = `dream-vault/${uid}`;
    const stringToSign = `allowed_formats=${ALLOWED_FORMATS}&folder=${folder}&timestamp=${timestamp}${env.CLOUDINARY_API_SECRET}`;
    const signature = await sha1Hex(stringToSign);

    return new Response(
      JSON.stringify({
        cloud_name: env.CLOUDINARY_CLOUD_NAME,
        api_key: env.CLOUDINARY_API_KEY,
        folder,
        allowed_formats: ALLOWED_FORMATS,
        timestamp,
        signature
      }),
      { headers: jsonHeaders(origin) }
    );
  }
};
