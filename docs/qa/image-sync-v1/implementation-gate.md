# Dream Vault — Cloudinary Image Sync 1.0 (Implementation Gate)

Status: **PHASE A scaffold only; HOLD (not usable in production).**

Baseline `ui-v15.0.0`. Branch `feature/cloudinary-image-sync-v1`.
Cloudinary cloud name (public): `herun6yp`. No secrets checked in.

## Current defect
`wishlist-cloud.js` deliberately replaces every `data:image/...` in Firestore with an empty image string. Existing file uploads remain browser-local. Never store Base64 in Firestore to work around this.

## Scaffold committed
`workers/cloudinary-sign/src/index.js`: verifies Firebase ID JWT using Google's public JWK, checks audience, issuer, signature, expiry and UID, requires a single permitted Origin, returns a short-lived Cloudinary SHA-1 signed upload params scoped to `dream-vault/<uid>`. Secret stays Worker-side. This is **not deployed or browser-integrated**.

## Owner setup (do not send keys in chat)
1. Create or use Cloudinary Free cloud `herun6yp`. Find its API key and API secret in Cloudinary Console. Secret must never be put in frontend or GitHub.
2. Create Cloudflare Worker Free and configure vars `CLOUDINARY_CLOUD_NAME=herun6yp`, `FIREBASE_PROJECT_ID=wishlist-787d2`, `ALLOWED_ORIGIN=https://wishlist-787d2.web.app`, `CLOUDINARY_API_KEY`. Add **secret** `CLOUDINARY_API_SECRET` using encrypted Worker secrets. Configure rate limiting and abuse controls prior to public release.
3. Test worker URL privately with valid/invalid Firebase ID tokens and wrong Origin. Make explicit CORS origin handling and test JSON errors.

## Remaining mandatory implementation
- Include `wrangler.toml` without credentials, and actual Worker test suite. Verify JWK failure, invalid token, cross-user folder, CORS and rate limits. Cloudinary signed upload allows clients to select file; enforce size/type in client AND via Cloudinary account/preset constraints. A signed URL is authorization, **not** a quota guarantee.
- Integrate upload in existing photo form with Firebase `getIdToken`, send Authorization Bearer to Worker, receive signature, upload selected compressed Blob to `https://api.cloudinary.com/v1_1/herun6yp/image/upload`; only trust secure_url matching expected Cloudinary delivery domain. No secrets in source.
- Save canonical HTTPS Cloudinary `secure_url` as `image` in Firestore, keep local Base64 until upload + Firestore write acknowledged; on upload failure keep original photo and show retry.
- Crucial multi-device merge: remote image URL must take priority over stale `data:image`, including reload/reconnect. Handle concurrent edits, account change mid-upload and cancellation. Avoid destructive overwrite from client with unuploaded local image.
- Preview images using URL or local image fallback, show accessible progress and Retry. Existing URL mode must remain supported.
- Migration for old local Base64 on owner device, opt-in, idempotent, confirm each upload; never auto-delete source. Do not promise images migrate from a device no longer holding local copy.
- Deletion lifecycle: require authenticated *server-side* authorization against Firestore item ownership before deleting CDN image; do not expose Cloudinary delete signing to arbitrary clients; orphan cleanup policy.
- Privacy: default public delivery URL is not access-controlled; warn and ask owner to accept, or choose a private media strategy.

## Release gate
- Test iPhone→laptop and laptop→iPhone with images uploaded both ways; reload, logout/login, offline/retry, bad network, malformed files, full quota, 0/1/12/50 items, edit/delete, long filenames, malicious URLs, concurrent edits, multi-user separation.
- Source tests and full inherited 318 regressions, a11y, mobile responsive, performance, no console secrets; report artifacts + SHA.
- No Firebase/Auth/CRUD breaking changes; no live deploy or release tag before approval. Budget $0. HOLD until Cloudflare Worker config and end-to-end are tested.
