// Offline Worker test suite — no dependencies (Node built-ins only).
// Run: node workers/cloudinary-sign/test/worker.test.mjs
//
// Mints RS256 Firebase-style ID tokens with a locally generated key, stubs the
// Google JWKS endpoint, and drives the Worker's fetch handler directly.
import { generateKeyPairSync, createSign, createHash } from "node:crypto";
import assert from "node:assert/strict";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const KID = "test-key-1";
const jwk = { ...publicKey.export({ format: "jwk" }), kid: KID, alg: "RS256", use: "sig" };

const PROJECT = "wishlist-787d2";
const ALLOWED = "https://wishlist-787d2.web.app";
const PREVIEW = "https://wishlist-787d2--image-sync-v1-abc123.web.app";
const SECRET = "test-secret-do-not-use";
const env = {
  CLOUDINARY_API_SECRET: SECRET,
  CLOUDINARY_API_KEY: "123456789012345",
  CLOUDINARY_CLOUD_NAME: "herun6yp",
  FIREBASE_PROJECT_ID: PROJECT,
  ALLOWED_ORIGINS: `${ALLOWED},${PREVIEW}`,
};

const realFetch = globalThis.fetch;
let jwksMode = "unavailable"; // "unavailable" first so the JWKS-failure path is exercised on a cold cache
globalThis.fetch = async (url, opts) => {
  if (String(url).startsWith("https://www.googleapis.com/")) {
    if (jwksMode === "unavailable") throw new Error("simulated network failure");
    if (jwksMode === "empty") return new Response(JSON.stringify({ keys: [] }), { status: 200 });
    return new Response(JSON.stringify({ keys: [jwk] }), { status: 200, headers: { "Content-Type": "application/json" } });
  }
  return realFetch(url, opts);
};

const b64url = value => Buffer.from(value).toString("base64url");
function mint(payload, header = {}) {
  const h = b64url(JSON.stringify({ alg: "RS256", kid: KID, typ: "JWT", ...header }));
  const p = b64url(JSON.stringify(payload));
  const signer = createSign("RSA-SHA256");
  signer.update(`${h}.${p}`);
  signer.end();
  return `${h}.${p}.${b64url(signer.sign(privateKey))}`;
}
const nowSec = () => Math.floor(Date.now() / 1000);
const validPayload = (sub, over = {}) => ({
  aud: PROJECT,
  iss: `https://securetoken.google.com/${PROJECT}`,
  sub,
  exp: nowSec() + 3600,
  iat: nowSec() - 10,
  auth_time: nowSec() - 10,
  ...over,
});

const worker = (await import("../src/index.js")).default;
const URL_SIGN = "https://wishlist-images.example.workers.dev/sign";
function call({ method = "POST", origin = ALLOWED, token, ip = "203.0.113.10", url = URL_SIGN } = {}) {
  const headers = {};
  if (origin !== null) headers.Origin = origin;
  if (token) headers.Authorization = `Bearer ${token}`;
  headers["CF-Connecting-IP"] = ip;
  return worker.fetch(new Request(url, { method, headers }), env);
}

let passed = 0;
const failures = [];
async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`PASS  ${name}`);
  } catch (error) {
    failures.push(`${name}: ${error.message}`);
    console.log(`FAIL  ${name} -> ${error.message}`);
  }
}

// ---- Origin / method ----
await test("OPTIONS preflight from allowed origin returns 204", async () => {
  const res = await call({ method: "OPTIONS" });
  assert.equal(res.status, 204);
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), ALLOWED);
});
await test("disallowed origin is forbidden (403)", async () => {
  const res = await call({ origin: "https://evil.example" });
  assert.equal(res.status, 403);
});
await test("missing origin is forbidden (403)", async () => {
  const res = await call({ origin: null });
  assert.equal(res.status, 403);
});
await test("GET /sign is not found (404)", async () => {
  const res = await call({ method: "GET" });
  assert.equal(res.status, 404);
});
await test("wrong path is not found (404)", async () => {
  const res = await call({ url: "https://wishlist-images.example.workers.dev/other" });
  assert.equal(res.status, 404);
});

// ---- Auth failures (no JWKS needed) ----
await test("missing Authorization is 401", async () => {
  const res = await call({});
  assert.equal(res.status, 401);
});
await test("malformed token is 401", async () => {
  const res = await call({ token: "not.a.jwt" });
  assert.equal(res.status, 401);
});
await test("oversized Authorization header is 401", async () => {
  const res = await call({ token: "x".repeat(5000) });
  assert.equal(res.status, 401);
});
await test("expired token is 401", async () => {
  const res = await call({ token: mint(validPayload("u1", { exp: nowSec() - 7200 })) });
  assert.equal(res.status, 401);
});
await test("wrong audience is 401", async () => {
  const res = await call({ token: mint(validPayload("u2", { aud: "someone-else" })) });
  assert.equal(res.status, 401);
});
await test("wrong issuer is 401", async () => {
  const res = await call({ token: mint(validPayload("u3", { iss: "https://securetoken.google.com/other" })) });
  assert.equal(res.status, 401);
});
await test("alg=none token is 401", async () => {
  const res = await call({ token: mint(validPayload("u4"), { alg: "none" }) });
  assert.equal(res.status, 401);
});

// ---- JWKS failure on cold cache ----
await test("JWKS unavailable -> 401 (fail closed)", async () => {
  jwksMode = "unavailable";
  const res = await call({ token: mint(validPayload("u5")) });
  assert.equal(res.status, 401);
});

// ---- Happy path ----
jwksMode = "ok";
await test("valid token returns signed params scoped to uid", async () => {
  const uid = "uid-happy-0001";
  const res = await call({ token: mint(validPayload(uid)), ip: "203.0.113.21" });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), ALLOWED);
  const body = await res.json();
  assert.equal(body.cloud_name, "herun6yp");
  assert.equal(body.folder, `dream-vault/${uid}`);
  assert.equal(body.allowed_formats, "jpg");
  assert.ok(body.api_key && body.timestamp && body.signature);
  const expected = createHash("sha1")
    .update(`allowed_formats=jpg&folder=dream-vault/${uid}&timestamp=${body.timestamp}${SECRET}`)
    .digest("hex");
  assert.equal(body.signature, expected);
});
await test("preview origin is accepted when allowlisted", async () => {
  const res = await call({ token: mint(validPayload("uid-preview-1")), origin: PREVIEW, ip: "203.0.113.22" });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), PREVIEW);
});
await test("tampered signature is 401", async () => {
  const token = mint(validPayload("uid-tamper-1"));
  const parts = token.split(".");
  const tampered = `${parts[0]}.${b64url(JSON.stringify(validPayload("uid-tamper-1", { extra: "x" })))}.${parts[2]}`;
  const res = await call({ token: tampered, ip: "203.0.113.23" });
  assert.equal(res.status, 401);
});

// ---- Rate limiting ----
await test("per-UID rate limit returns 429 after 20 requests", async () => {
  const uid = "uid-rate-0001";
  const token = mint(validPayload(uid));
  let last = 0;
  for (let i = 0; i < 21; i += 1) {
    const res = await call({ token, ip: `198.51.100.${i}` });
    last = res.status;
  }
  assert.equal(last, 429);
});
await test("per-IP rate limit returns 429 after 30 requests", async () => {
  const ip = "192.0.2.77";
  let last = 0;
  for (let i = 0; i < 31; i += 1) {
    const res = await call({ token: mint(validPayload(`uid-ip-${i}`)), ip });
    last = res.status;
  }
  assert.equal(last, 429);
});

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
