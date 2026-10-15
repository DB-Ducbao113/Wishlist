# Dream Vault V15 — Production Hardening & 1.0 Stable Launch

**Branch**: `feature/production-hardening-v15`
**Baseline**: `ui-v14.0.0`
**Budget**: $0
**Goal**: ship **Dream Vault 1.0 Stable** only after verified functional, data, security, accessibility, performance, and production gates.

## Repository facts verified
- Firebase project alias from `.firebaserc`: `wishlist-787d2`.
- `firebase.json` sets Hosting `public: "."` and rewrites `/` to `/wishlist.html`. This may publish repository documents or unused files; audit and restrict deploy artifacts *before* deploy.
- `firestore.rules` scopes `/users/{userId}/items/{itemId}` access with `request.auth != null && request.auth.uid == userId`. Test both local rules and deployed production rules; repo rules alone do not prove production security.
- Setup docs advertise Google auth and Firestore sync; live integration still requires testing, not assumed.
- Latest frozen UI `ui-v14.0.0`; no new UI feature work in this sprint.

## Workstream A — Hosting and deployment
1. Inventory Firebase Hosting published files using `firebase.json` and a dry-run/build review. Identify and prevent publication of `docs/`, QA screenshots/results, source maps, local backups, private credentials, developer notes, repositories, tooling files and any other unneeded files. Prefer deploy staging directory with an explicit allowlist or safe ignore rules, preserving all actual runtime assets.
2. Verify `/`, `/wishlist.html`, CSS, JS, image assets respond with correct MIME, HTTPS, status, redirect/rewrite and cache headers. Check invalid route behavior and ensure production URL has the right build.
3. Validate Firestore rules via emulator and deployed rules, with anonymous user, authenticated owner, and a second authenticated user. Owner reads/writes own; other user cannot access owner's data.
4. Do not include any service-account/private secret in client or Hosting files. Firebase Web SDK config is public by design and is not a service-account secret.
5. Never deploy production, change Firestore rules, erase data, or edit main without explicit owner approval and passing release gate.

## Workstream B — Data durability
1. 0/1/12/50 items: Add, Edit, Delete, status, categories, priorities, search/filter/sort; reload and browser restart.
2. Export JSON → import into clean isolated browser profile → verify exact semantic roundtrip and item counts, Unicode/emoji, long notes, product links, uploaded local image behavior.
3. Test corrupt JSON, duplicate IDs, invalid prices, overly large images, failed localStorage/quota, and security of unsafe URLs.
4. Backup an existing user dataset before any destructive test. Never run destructive tests on real user data/accounts.
5. Sync integration: login, logout, signed-in reload, cross-device/cross-profile sync, offline/reconnect, ownership separation, duplicate/conflict scenarios, and error recovery. If unable to test with authorized staging accounts, mark this gate UNVERIFIED and block claiming cross-device sync ready.

## Workstream C — Security & privacy
- XSS through product title, category, note, image URL and imported JSON, URL scheme controls, DOM injection, external link `rel`, error sanitization.
- Check browser console/network for tokens/private data leakage; confirm no admin/service-account credentials committed.
- Test auth enforcement and rules; validate CSP/security header compatibility in browser before enabling potentially breaking policy.
- Document findings with severity and remediation; no unfounded 'secure' claim from a source scan alone.

## Workstream D — Complete regression / a11y / performance
- Run V9–V14 inherited regression suites and add V15 production/data/security tests; document V11EQ layout-equivalent assertions separately and preserve raw failures.
- Validate Gallery/Focus, Quick View, keyboard navigation, Escape, focus restore, reduced motion, real image fallback, empty state, purchased, import/export.
- Test 320x568, 375x667/812, 430x932, 768/1024, 1280/1440/1920 with actual hit testing and no horizontal overflow.
- Run full axe or equivalent accessibility audit where feasible and perform keyboard-only walkthrough.
- Headless Lighthouse/Core Web Vitals lab measurement and independent real-device testing when available. Compare V14/V15 with same machine/dataset, LCP, CLS, INP proxy where measurable, long tasks, FPS, p95/max frame gap, transfer sizes and 4x CPU.
- Fix every P0/P1, rerun affected and full tests. Avoid introducing new animations or design changes.

## Workstream E — Release verification
1. Save machine-readable QA/perf/security results, clear reproduction commands, actual screenshots and `docs/qa/dream-vault-v15/final-report.md`; record exact code commit SHA.
2. CI / deploy gate must validate successful hosting deployment AND functional smoke on actual preview/production URL, including correct version/build; no fabricated log or test results.
3. A report can recommend **GO** only if functional, data, security, a11y, performance and deploy gates are verified. Distinguish **GO for release candidate** from **PRODUCTION LIVE**.
4. Tag `ui-v15.0.0` only after review. Declare **Dream Vault 1.0 Stable** only when release deployed and verified on production, including any advertised Firebase cross-device sync.
5. No production deployment, Firestore rules deployment, production user-data mutation or new tag without the owner's explicit authorization.
6. If staging/test accounts or physical devices are unavailable, clearly mark remaining checks UNVERIFIED/HOLD rather than claim all tests passed.

## Scope protection
Preserve Auth, Firebase, CRUD, schema and V14 UX unless a demonstrated bug requires a focused change. Keep previous tags immutable. $0 only. One consolidated implementation and QA sprint.

**Current state:** plan committed; implementation, integration tests, live production verification and release **not yet complete**.
