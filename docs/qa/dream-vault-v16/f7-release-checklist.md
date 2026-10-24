# Dream Vault V16.1 - Release Checklist (F7.7)

Every gate below is judged on the F6 delivery tree (`f1f1d65`) plus the F7
deliverables. Evidence is a file in `docs/qa/dream-vault-v16/` or a command
output captured in this session.

| Gate | Status | Evidence |
| --- | --- | --- |
| Functional | **PASS** | 787 checks, 0 FAIL (`npm run qa`, F1 107 / F2 168 / F3 167 / F4 65 / F5 97 / F6 28 / V16 36 / M1 28 / M2 31 / M3 32 / M4 28) |
| Data integrity | **PASS** | f7-data-compatibility.md - additive fields, no migration, no data loss, guest/account isolation |
| Auth & privacy | **PASS** | f7-security-audit.md - per-user rules, session isolation, no XSS, no secrets |
| Firebase live | **BLOCKED** | no real Firebase account in this environment; owner must run the live smoke tests (see F7.4) |
| Cloudinary live | **BLOCKED** | no real Cloudinary credentials in this environment; owner must run a signed upload |
| Browser & mobile | **PASS (Desktop/Chrome)** | no overflow 320-1920, CLS 0, reduced motion verified; **NOT VERIFIED** on Safari/iPhone (real device only) |
| Security | **PASS** | f7-security-audit.md - leakCount 0, no private file published, no secret in repo |
| Hosting | **PASS** | `npm run build` + `npm run check:hosting`: 5 files, 1 stylesheet, leakCount 0 |
| Performance | **PASS** | f7-performance.json - gzip 122.5 KB, 2 requests, mobile 100, desktop 89, CLS 0 |
| CI | **PASS** | `npm ci` clean (114 packages, 0 vulnerabilities), `npm run qa` green, build + check green |

## Not verified (explicitly)

- Real Firebase Auth / Firestore sync (mocked only).
- Real Cloudinary signed upload.
- Two-device sync.
- Safari and iPhone behaviour.
- Production deployment.

These are marked BLOCKED / NOT VERIFIED, not PASS. They require owner-side
access that is not available in this environment (see f7-security-audit.md and
f7-report.md).

## Release procedure

Not executed in F7. The owner, after approving this audit, follows the steps in
the F7 brief (merge PR #1 -> develop, regression on develop, PR develop -> main,
CI + review, merge main, tag `ui-v16.1.0` at the release SHA, deploy, smoke tests,
rollback plan). The rollback plan is `f7-rollback-plan.md`.
