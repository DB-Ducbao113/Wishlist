# Dream Vault V13 — Interactive Collection
Baseline: `ui-v12.0.0`. Branch: `feature/interactive-collection-v13`.
Status: **QA COMPLETE — GO (release candidate); awaiting owner final review before tagging `ui-v13.0.0`.** See `final-report.md`.

## Implemented
- Accessible Gallery / Focus toggle with `aria-pressed`, `aria-controls`.
- An actual alternate horizontal product exhibit layout (desktop) with stacked mobile fallback.
- No new dependency, no changes intended to CRUD/Firebase/Auth/Sync/persistence; view preference is transient.
- Existing Card Tilt, Quick View, card Buy/Edit/Delete/status actions remain owned by existing handlers.
- Scope: `wishlist.html`, `css/interactive-v13-collection.css`.

## Mandatory finalization for coding agent — single sprint
1. Inspect Focus mode at 1280/1440/1920, 768/1024, 320x568, 375x667, 375x812 and 430x932. Verify featured, 1/2/12/50 cards and empty state. Correct possible legacy grid CSS specificity conflicts with actual browser computed style, not by guessing.
2. Ensure mode switch works through search/filter/sort, add/edit/delete, status cycling, imported items, and restores correct pressed state; never duplicate product cards.
3. Test Card Tilt, keyboard Tab/Enter/Space, focus outlines, QV Escape/close/edit/restore-focus, no-link, placeholders, broken image and reduced motion. Check controls reachable at narrow widths and mobile Dock doesn't obscure them.
4. Visual before/after using same dataset: V12 Gallery vs V13 Focus desktop/mobile; evaluate actual visual differentiation. Improve or replace weak design rather than just adding gradients.
5. Run complete inherited V9/V10/V11/V12 regression suites with the documented V11EQ layout exceptions, plus new V13 tests. Record original exceptions separately; do not silently skip tests.
6. A/B benchmark V12 vs V13 on identical headless browser/dataset, including 4x CPU, scroll FPS, p95/max frame gap, long tasks, CLS, QV open/close latency; disclose device limits.
7. Commit `docs/qa/dream-vault-v13/final-report.md`, machine-readable test and performance JSON, and paired screenshots. State exact release candidate SHA and GO/HOLD/NO-GO. Fix all P0/P1 before GO; rerun full suite.
8. Do not edit frozen releases/tags or create `ui-v13.0.0` until review. $0 budget.

**Important:** Do not claim release-ready from CSS/source alone.

---

## QA execution log (2026-10-15)

| Gate item | Status | Evidence |
| --- | --- | --- |
| 1. Inspect Focus at all viewports + fix specificity by computed style | DONE | 9 viewports; **P1 specificity defect found & fixed** (`#grid…gallery--v2/4/6[data-v13-view="focus"]`) |
| 2. Switch works through search/filter/sort/CRUD/status/import; no duplicates | DONE | V13 Y4–Y6, Y14–Y16 |
| 3. Tilt / keyboard / QV / no-link / broken / reduced motion / dock | DONE | V13 Y7–Y9, Y11–Y13 |
| 4. Visual before/after V12 vs V13 | DONE | matched pairs in `img/` (gallery vs focus, all viewports) |
| 5. Full inherited regression + V13 | DONE | V9 **128**, V10 **26**, V11 **34**, V12 **40**, V13 **50** = **278/278** |
| 6. A/B benchmark V12 vs V13 (+ Focus, 4× CPU, QV) | DONE | `img/perf-v12-v13.json` |
| 7. Report + machine-readable JSON + screenshots + SHA | DONE | `final-report.md`, JSON in `img/` |
| 8. No tag; $0; P0/P1 fixed + rerun | DONE | D1 fixed; no `ui-v13.0.0` |

Defect fixed this sprint: **D1** — Focus layout lost CSS specificity to legacy gallery rules
(grid stayed 3 columns ≥1025; featured card stayed a stacked flex hero ≤1024). Fixed by repeating
the legacy class chain + `[data-v13-view="focus"]`. No other P0/P1.

**Verdict: GO (release candidate).** Do not create `ui-v13.0.0` before the owner's final review.
