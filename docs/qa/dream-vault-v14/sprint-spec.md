# Dream Vault V14 — Final UX & Architecture Stabilization

**Base:** `ui-v13.0.0` · **Branch:** `feature/final-ux-architecture-v14` · **Budget:** $0

## Mission
Complete ONE consolidated stabilization sprint. This is the final UI/UX stabilization gate before V15 production launch, **not a feature or visual redesign sprint**. Current `wishlist.html` imports **48 stylesheets** spanning legacy through V13. Reduce measurable cascade/redundancy risk WITHOUT visually regressing the frozen V13 design.

## Guardrails
- No changes to Firebase/Auth/Cloud Sync, localStorage, CRUD, data model, import/export semantics, product actions, view modes, or frozen tags.
- Maintain V13 Gallery/Focus, product Tilt, dialogs, sticky close, keyboard focus restore, mobile dock, Hero CTA and all IDs/listeners.
- No paid tools, dependencies, fonts, or new network services.
- Do not blindly delete/merge early CSS layers or re-order imports. First prove rules obsolete via computed styles and coverage at all responsive breakpoints and interaction states.
- Don't assume 48 files is intrinsically a performance problem; use evidence. Prefer removing demonstrably dead declarations; preserve provenance in a migration inventory.

## Implementation work — one sprint
### A. CSS/Rendering Audit
1. Inventory all 48 stylesheet imports, transfer sizes, selector ownership, duplicate/dead rules and specificity collisions; record true CSS coverage with representative states.
2. Identify low-risk consolidation candidates, isolate into a stable layer or reduce redundant overrides. For every removed/moved rule identify whether it is still used in any test state or breakpoint.
3. Verify V9 Hero, V10 Dashboard, V11 workspace, V12 stages and V13 Gallery/Focus computed styles and pixels remain equivalent. Avoid broad `!important`, expensive filters and `will-change` abuse.
4. If safe consolidation cannot be proven, leave legacy structure in place and document clearly; do not sacrifice stability for an arbitrary file-count KPI.

### B. UX/A11y and real interaction hardening
- Inspect and fix genuine P0/P1 issues in keyboard traversal (Tab/Shift+Tab, Enter/Space, Escape), dialog focus, reduced motion, active view announcements, labels, color contrast and focus rings.
- Audit narrow screens 320x568, 320x700, 375x667, 375x812, 430x932; tablets 768/1024; desktop 1280/1440/1920. Test actual hit boxes, horizontal overflow, no overlapping mobile dock/CTA, search/filter visibility.
- Test Gallery and Focus with 0/1/2/12/50 items, image failures/placeholders, no-link, long title/note, purchased and all filters/search/sort states.
- Do not introduce accessibility fixes that alter state semantics or storage unknowingly.

### C. Full regression and perf
- Rerun inherited suites V9 128, V10 26, V11 34, V12 40 and V13 50 (or documented precise equivalents); keep **the original six superseded layout assertions** separately visible. No suppressed failures.
- Add V14 tests validating no accessibility regression, view toggle, stylesheets and representative computed styles; user data and import/export intact.
- A/B benchmark V13 vs V14 on same machine/browser/data for CSS transfer, parse/evaluate cost where possible, LCP/CLS, FPS, p95/max gap, long tasks, Quick View latency, 4x CPU and reduced motion. Don't invent improvements.
- Capture paired screenshots of entire page and closeups on all breakpoints, both view modes, focus and modal states. Pixel-diff meaningful areas; manually adjudicate antialiasing differences.
- Run source syntax checks and project test/build commands where present. Verify deployed preview only if accessible; don't call localhost production.
- Fix all P0/P1, rerun full tests after final fix.

## Required evidence
`docs/qa/dream-vault-v14/final-report.md`, `css-inventory.md`, machine-readable QA/perf results, V13/V14 paired screenshots, exact code and report SHAs. Mark GO/HOLD/NO-GO based on **real test results**.

**Release gate:** Zero unresolved P0/P1; all required regression tests PASS; no visual or material performance regression; CSS changes justified by measurements; data and Auth untouched. **No `ui-v14.0.0` tag until final external review.**

## State at planning commit
Branch created and specification committed. **Implementation, test execution, and visual QA are NOT complete.**
