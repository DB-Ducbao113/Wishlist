# Dream Vault V16.1 - F7 Security Audit

Read-only audit of the F6 delivery tree. No configuration was changed.

## 1. Firebase Security Rules

`firestore.rules`:

    rules_version = '2';
    service cloud.firestore {
      match /databases/{database}/documents {
        match /users/{userId}/items/{itemId} {
          allow read, write: if request.auth != null && request.auth.uid == userId;
        }
      }
    }

- Per-user isolation: a signed-in user can only read/write their own `items`.
- No field allowlist: the two new F5 fields (`savingGoal`, `savedAmount`) flow
  through without a rules change. That is a feature, not a gap - the rules are
  owner-scoped, not field-scoped.
- No change was made and none is needed.

## 2. Auth session isolation

- `activeUid` is the single source of truth for "whose data is on screen".
- `handleSessionChange(uid)` swaps `items` and re-renders; it never merges.
- Cloud sync runs only when `activeUid` is set and `cloudSync.user.uid === activeUid`.
- Logging out stops syncing; it does not delete Firestore data.
- `legacyPending` is migrated to the guest key exactly once.

## 3. XSS

- User data (name, note, category, link) is rendered with `textContent`, never
  `innerHTML`. The only `innerHTML` writes are `grid.innerHTML = ""` (clearing)
  and option lists built from the constant `STATUSES` / `PRIORITIES` arrays.
- `safeUrl()` accepts only `^https?://` and `^data:image/`; everything else
  becomes `""`.
- `validImageSrc()` rejects non-image data URLs.
- The Quick View and the card use `textContent` throughout; the aria-labels are
  built from escaped text.

Result: **no XSS vector found.**

## 4. URL validation

- `safeUrl()` (wishlist.html ~1929): http/https only, plus data:image URLs.
- `javascript:`, `data:text`, `vbscript:` and relative URLs are all rejected.
- External links are opened with `target="_blank" rel="noopener noreferrer"`
  (verified in the card and Quick View markup).

## 5. Import JSON validation

`importJson()` (wishlist.html ~5763):
- `JSON.parse` is wrapped; invalid JSON shows a toast and aborts.
- Accepts either an array or `{ items: [...] }`.
- Every row passes through `normalizeItem()` (sanitises negatives, NaN, Infinity,
  absurd values, numeric strings).
- Empty result is rejected.
- Duplicate ids are de-duplicated.
- The write is rolled back on save failure (`items = backup; resync()`).
- A confirm dialog names the count and warns that the current list is replaced.

## 6. Cloudinary signed upload

- The Worker (`workers/cloudinary-sign/src/index.js`) signs with
  `CLOUDINARY_API_SECRET`, which is an encrypted Worker secret and is never
  committed. `wrangler.toml` contains only non-secret vars (cloud name, project
  id, allowed origins).
- The signature is scoped to `dream-vault/<uid>` with `allowed_formats=jpg`.
- The Firebase ID token is verified server-side before signing.
- `ALLOWED_ORIGINS` is an exact-origin allowlist; `*` is never used and the
  check is always enforced.
- The Worker is NOT in the hosting allowlist (the FORBIDDEN regex blocks
  `worker`), so it is never published with the app.

## 7. CORS / origin allowlist

- The Worker allowlist contains the production origin and the specific preview
  origin. No wildcard.
- The hosting `_headers` and `firebase.json` set `X-Content-Type-Options: nosniff`
  and `Referrer-Policy: strict-origin-when-cross-origin`.

## 8. No private-file leak

`scripts/check-hosting.mjs` (exit 0, verdict PASS):

- `leakCount: 0`, `leaks: []`.
- Published file count: 56 (54 assets + 2 platform files).
- CSS count: 1 (`css/app.css`), byte-identical to the source concatenation.
- `missingRuntime: []`.
- The allowlist is `wishlist.html`, `wishlist-cloud.js`, `css` (generated).
- The FORBIDDEN regex blocks `docs`, `.git`, `.firebase`, `node_modules`,
  `worker`, and all secret-bearing extensions (`.map`, `.pem`, `.key`, `.env`,
  etc.).

## 9. Environment separation

- `wrangler.toml` declares `workers_dev = true` and a `[previews]` block so
  non-production branches get preview builds; production deploys are unaffected.
- The production branch in Cloudflare Builds is `main`; this work is on
  `feature/motion-auth-reset`, which is a preview.
- No Production deployment was performed in F7 (or in any earlier milestone).

## 10. Findings

No P0 or P1 finding.

Two informational notes, both already recorded in earlier reports:

- **I-1** - the Firestore rules are per-user `allow read, write` with no field
  allowlist. That is the intended model and is what lets the two new savings
  fields flow through without a rules change; it is not a gap.
- **I-2** - the Cloudinary Worker's CORS allowlist must be updated by hand when
  a new preview origin is created (see `wrangler.toml` comment). Owner-side.

No secret, token, private key, `.env` file or service-account JSON exists in the
repository. `git status` shows only `image/After Shave.webp` as untracked, which
is user content and was never staged.
