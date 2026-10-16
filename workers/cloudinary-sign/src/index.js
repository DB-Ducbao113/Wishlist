// Cloudflare Worker: signed Cloudinary upload authorization for Dream Vault.
// Deploy with secrets CLOUDINARY_API_SECRET and vars CLOUDINARY_API_KEY,
// FIREBASE_PROJECT_ID=wishlist-787d2, CLOUDINARY_CLOUD_NAME=herun6yp, ALLOWED_ORIGIN.
// No credentials should be embedded in browser code.
const encoder = new TextEncoder();
const fail = (message,status,origin) => new Response(JSON.stringify({error:message}),{status,headers:headers(origin)});
function headers(origin){return {"Content-Type":"application/json","Access-Control-Allow-Origin":origin,"Access-Control-Allow-Headers":"Authorization, Content-Type","Access-Control-Allow-Methods":"POST, OPTIONS","Vary":"Origin","Cache-Control":"no-store"};}
const toBytes = b64 => Uint8Array.from(atob(b64.replace(/-/g,"+").replace(/_/g,"/").padEnd(Math.ceil(b64.length/4)*4,"=")), c=>c.charCodeAt(0));
async function verifyFirebaseToken(token,project){
  const parts=token.split(".");
  if(parts.length!==3) throw Error("invalid token");
  const h=JSON.parse(new TextDecoder().decode(toBytes(parts[0])));
  const p=JSON.parse(new TextDecoder().decode(toBytes(parts[1])));
  const now=Math.floor(Date.now()/1000);
  if(h.alg!=="RS256"||!h.kid||p.aud!==project||p.iss!==`https://securetoken.google.com/${project}`||
     !p.sub||p.sub.length>128||!Number.isFinite(p.exp)||p.exp<=now||
     !Number.isFinite(p.iat)||p.iat>now||p.auth_time>now)throw Error("invalid claims");
  const res=await fetch("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com");
  if(!res.ok)throw Error("cannot verify identity");
  const jwks=await res.json();const jwk=jwks.keys.find(x=>x.kid===h.kid);
  if(!jwk)throw Error("unknown key");
  const key=await crypto.subtle.importKey("jwk",jwk,{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["verify"]);
  const valid=await crypto.subtle.verify("RSASSA-PKCS1-v1_5",key,toBytes(parts[2]),encoder.encode(parts[0]+"."+parts[1]));
  if(!valid)throw Error("bad signature");
  return p.sub;
}
async function sha1Hex(str){const digest=await crypto.subtle.digest("SHA-1",encoder.encode(str));return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,"0")).join("");}
export default {async fetch(request,env){
  const origin=request.headers.get("Origin")||"";
  if(!env.ALLOWED_ORIGIN||origin!==env.ALLOWED_ORIGIN)return fail("origin forbidden",403,"null");
  if(request.method==="OPTIONS")return new Response(null,{status:204,headers:headers(origin)});
  if(request.method!=="POST"||new URL(request.url).pathname!=="/sign")return fail("not found",404,origin);
  if(!env.CLOUDINARY_API_SECRET||!env.CLOUDINARY_API_KEY||!env.CLOUDINARY_CLOUD_NAME||!env.FIREBASE_PROJECT_ID)return fail("not configured",503,origin);
  const match=/^Bearer (\S+)$/.exec(request.headers.get("Authorization")||"");
  if(!match)return fail("authentication required",401,origin);
  let uid;try{uid=await verifyFirebaseToken(match[1],env.FIREBASE_PROJECT_ID);}catch{return fail("invalid authentication",401,origin);}
  // Limit signature to a scoped folder and tightly controlled parameters.
  // Firebase UID is server-derived; no caller-controlled folder/public_id.
  const timestamp=Math.floor(Date.now()/1000);
  const folder=`dream-vault/${uid}`;
  const stringToSign=`folder=${folder}&timestamp=${timestamp}${env.CLOUDINARY_API_SECRET}`;
  const signature=await sha1Hex(stringToSign);
  return new Response(JSON.stringify({api_key:env.CLOUDINARY_API_KEY,cloud_name:env.CLOUDINARY_CLOUD_NAME,folder,timestamp,signature}),{headers:headers(origin)});
}};
