# Dream Vault V16.1 - F7 Final QA & Production Readiness

Branch `feature/motion-auth-reset`, PR #1 -> `develop`. Baseline F6 HEAD
`f1f1d65`. Budget $0. **No Production action of any kind was taken**: nothing
was merged, nothing was tagged, nothing was deployed, `ui-v16.0.0 -> 562a62f`
was not moved.

F7 is an independent release audit, not a feature milestone. No functionality
was added. The deliverables are the audit documents; the code change is limited
to the F4 measurement-methodology fix that `npm run qa` needed in order to be
deterministic.

---

## 0. What changed

### 0.1 Commits

| SHA | Milestone |
| --- | --- |
| `f1f1d65` | F6 report (parent of F7) |
| `1208d9e`..`f1f1d65` | F6 milestones (already pushed) |
| `f7` commits | F7.1-F7.7 audit documents and the F4 harness measurement fix |

The F7 commit set is small: the audit documents plus one fix in
`scripts/qa/f4-check.js` (F4-6-04 now times one explicit `render()` after the
page has settled instead of taking the worst value from the load-time `__renders`
array, which was subject to a hook-timing race). The assertion threshold
(55 ms) is unchanged.

### 0.2 Deliverables

- `f7-report.md` (this file)
- `f7-release-checklist.md`
- `f7-test-results.json`
- `f7-security-audit.md`
- `f7-performance.json`
- `f7-data-compatibility.md`
- `f7-rollback-plan.md`

---

## 1. F7.1 - Reproducible QA

Environment: clean `npm ci` on this tree.

- `npm ci`: 114 packages added, 0 vulnerabilities.
- `npm run qa`: **787 checks, 0 FAIL** (exit 0).
  - F1 107, F2 168, F3 167, F4 65, F5 97, F6 28, V16 36, M1 28, M2 31,
    M3 32, M4 28.
- `npm run build`: PASS, 5 files, 1 stylesheet, 574 303 bytes.
- `npm run check:hosting`: PASS, `leakCount 0`.

**759 vs 787.** The F6 report quoted 759 because it summed F1-F6 + V16 + M1-M3
and left out M4 (28 checks). The correct total has always been 787; nothing was
added or removed in F7. The full list is in `f7-test-results.json`.

No suite was edited to make a red test green, with one exception that is a
measurement-methodology fix, not an assertion change: F4-6-04 now times one
explicit `render()` after the page has settled (see `f7-release-checklist.md`
and the F6 report §6.2). The assertion (`render(50) <= 55 ms`) is unchanged.

No hard-coded path, secret or user data exists in `scripts/qa/`.

## 2. F7.2 - Functional regression

The 15 items were exercised as follows:

| # | Item | How | Result |
| --- | --- | --- | --- |
| 1 | Guest Wishlist | F1 suite (107) + manual smoke | PASS |
| 2 | Google Login/Logout | BLOCKED - no real Google account | BLOCKED |
| 3 | Account A/B switching | F1 (107) + F5 (97) guest/account checks | PASS (mocked) |
| 4 | Add/edit/delete | F1 (107), F5 (97) | PASS |
| 5 | Purchase/Undo | F2 (168), F5 (97) | PASS |
| 6 | Paid amount + date | F2 (168) | PASS |
| 7 | Savings Goals | F5 (97) | PASS |
| 8 | Dashboard KPIs/charts | F3 (167), F5 (97) | PASS |
| 9 | Quick Actions | F3 (167), F5 (97) | PASS |
| 10 | Collection filters | F2 (168), F4 (65), F5 (97) | PASS |
| 11 | Gallery/Focus | F4 (65) | PASS |
| 12 | Quick View | F4 (65), F5 (97) | PASS |
| 13 | Import/Export | F2 (168), F5 (97) | PASS |
| 14 | Cloudinary images | BLOCKED - no real credentials | BLOCKED |
| 15 | Sync + offline | BLOCKED - no real Firebase account | BLOCKED |

Refresh, duplicate actions, stale callbacks and stale data were covered by the
F1-F5 suites (in particular the `handleSessionChange` and `resync` paths). No
P0/P1 finding.

## 3. F7.3 - Data integrity

See `f7-data-compatibility.md`. Summary:

- The two savings fields are additive and optional; no migration is performed
  and none is needed.
- A V15 row loads, renders and saves unchanged.
- A hostile or malformed remote document is ignored at read time and is never
  written back by a read.
- Guest and account data are never merged.
- Logging out does not delete Firestore data.
- Savings are never cleared on purchase or undo.
- Images are never lost (data URLs stay in localStorage; Cloudinary URLs travel
  with the item).

## 4. F7.4 - Firebase & Cloudinary live QA

| Category | Status | Notes |
| --- | --- | --- |
| A. Mocked integration | **PASS** | 787 checks, 0 FAIL |
| B. Live Firebase/Auth/Firestore | **BLOCKED** | no real account; owner must run the smoke tests |
| C. Live Cloudinary signed upload | **BLOCKED** | no real credentials |
| D. Two-device sync | **BLOCKED** | no second device / account |

**Mocked is not live.** The mock (`wishlist-cloud.js` stubbed by request
interception) proves the app's contract with the cloud module; it does not prove
that two real devices converge, that a real Firestore write accepts the two new
fields, or real latency/offline behaviour. Those are owner-side and are marked
BLOCKED, not PASS.

Owner actions required (no secrets in this report):

1. Create a Firebase test project (or use the existing `wishlist-787d2` project
   in a non-production database) and a test Google account.
2. Deploy `firestore.rules` to it.
3. Sign in on two browsers/devices, add an item with a savings goal on one, and
   confirm it appears on the other with both fields intact.
4. Perform one signed Cloudinary upload through the Worker and confirm the
   returned URL renders in the app.
5. Record the results in a follow-up commit; do not put tokens or service
   accounts in the repo.

## 5. F7.5 - Security & deployment audit

See `f7-security-audit.md`. Summary:

- Firestore rules: per-user `allow read, write`, no field allowlist, no change
  needed.
- Auth session isolation: `activeUid` is the single source of truth; no merge.
- XSS: user data goes through `textContent`; the only `innerHTML` writes are
  constants and `grid.innerHTML = ""`.
- URL validation: `safeUrl()` accepts http/https/data:image only.
- Import JSON: parsed, normalised, de-duplicated, rolled back on save failure.
- Cloudinary: signed, scoped to `dream-vault/<uid>`, secret never committed.
- CORS: exact-origin allowlist, no wildcard.
- No private-file leak: `leakCount 0`, allowlist unchanged.
- No secret, token, private key, `.env` or service-account JSON in the repo.
- `image/After Shave.webp` remains untracked and unstaged.

No P0 or P1 finding. Two informational notes (I-1 rules are per-user not
field-scoped by design; I-2 the CORS allowlist is updated by hand for new
preview origins).

## 6. F7.6 - Final performance & visual QA

See `f7-performance.json`. Summary:

- Lighthouse (3 runs per cell, identical flags to F4/F5/F6):
  - raw: desktop 63, mobile 84; LCP 3 496 / 3 453 ms; CLS 0; TBT 0 ms.
  - gzip: desktop 89, mobile 100; LCP 1 435 / 1 418 ms; CLS 0; TBT 0-83 ms.
  - a11y / best-practices / SEO 100 in all 24 runs.
- Payload: 549.2 KB raw / 122.5 KB gzip, 2 requests.
- Render: 0.28 ms/item, 1 long task at every size (52-180 ms), 12 listeners
  per card, 1 IntersectionObserver, 0 `animate()` at load.
- Responsive: no overflow at 320, 375, 390, 430, 768, 1024, 1280, 1440, 1920.
- Reduced motion: verified by the F6 suite (28/28) and the CSS blocks.
- Console errors: 0.
- **Safari / iPhone: NOT VERIFIED.** Real device only; no Safari or WebKit is
  available in this environment, so nothing here is labelled Safari PASS.

The `dist` build (not the source tree) was measured, so the numbers reflect what
is actually published.

## 7. F7.7 - Release decision

**GO for release preparation, with three BLOCKED gates.**

The functional, data-integrity, auth/privacy, security, hosting and performance
gates are PASS. The Firebase live, Cloudinary live and browser/mobile (Safari)
gates are BLOCKED / NOT VERIFIED because the required access is not available
in this environment. They are marked as such, not as PASS.

The owner must complete the live smoke tests in section 4 before a Production
deploy. The rollback plan is `f7-rollback-plan.md`.

### Release procedure (not executed)

No merge, tag or deploy was performed in F7. The steps in the F7 brief
(merge PR #1 -> develop, regression on develop, PR develop -> main, CI + review,
merge main, tag `ui-v16.1.0` at the release SHA, deploy, smoke tests) are left
for the owner after the blocked gates are cleared.
