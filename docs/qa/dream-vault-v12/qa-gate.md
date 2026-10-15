# Dream Vault V12 — Product Presentation 3.0

**Branch:** `feature/product-presentation-v12`
**Baseline:** `ui-v11.0.0`
**Budget:** $0
**Current gate:** **HOLD — browser visual QA and regression not yet run.**

## Source implemented
- `css/product-v12-presentation.css`: new independent presentation layer for Gallery product stages, featured exhibit, action hierarchy, and Quick View. Respects reduced motion.
- `wishlist.html`: loads V12 CSS after V11; appends a decorative, `aria-hidden` caption to each product stage. No CRUD/Firebase/Auth/Sync/data schema changes intended.
- No release tag created.

## Mandatory acceptance test — finish before claiming DONE
1. Re-run **all** V11 regression suites (V9-equivalent 128, V10-equivalent 26, V11 34), report raw + equivalent layout assertions transparently.
2. Add V12 assertions for CSS loaded, gallery/QV product image containment, stage caption only once, featured state, purchased styles, Card Tilt transform, view-detail focus/keyboard/Edit bridge.
3. Browser functional regression: Add/Edit/Delete, search/filter/sort/reset, status, import/export, QV, Escape, focus restoration, no-link, placeholder, broken image, 0/1/2/12/50 products.
4. Visual screenshots baseline V11 vs V12 **same dataset** at 1280/1440/1920, 768/1024, 320x568/375x667/375x812/430x932. Include gallery and QV. Inspect actual product photos, unusually narrow art, SVG placeholder, multi-line long titles.
5. Validate desktop Discovery Rail remains visible and no card exceeds canvas; hero CTA/Dock mobile remains clickable; no horizontal overflow at every viewport.
6. A/B headless Chrome V11 and V12 FPS, long tasks, CLS, p95/max frame gap, QV open latency, 4x CPU, reduced motion; disclose device limitations.
7. Document exact test commands, *actual outputs*, screenshot paths, files changed, SHA, P0/P1 defects and GO/HOLD/NO-GO in `docs/qa/dream-vault-v12/final-report.md`. Machine-readable results required.
8. Fix every P0/P1 and rerun regression. No paid services/dependencies; no frozen tags edited. **Do not create `ui-v12.0.0` yet.**

## UI quality bar
- Presentation needs to feel substantially better in screenshots, not merely 1–2 minor shadows. If product staging appears too decorative, improve composition instead of adding more ornamentation.
- Product actions readable and operable; no overlay obscures image or button, especially at 320px.
- No refactor of storage logic/Firebase/Auth/Sync/CRUD.

**Note:** This file records implementation and required QA only, not a completed test result.
