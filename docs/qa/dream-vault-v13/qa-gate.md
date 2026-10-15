# Dream Vault V13 — Interactive Collection
Baseline: `ui-v12.0.0`. Branch: `feature/interactive-collection-v13`.
Status: **IMPLEMENTED PARTIALLY / HOLD** — browser tests not run.

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
