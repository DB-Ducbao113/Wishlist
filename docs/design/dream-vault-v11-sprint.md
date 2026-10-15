# Dream Vault V11 — Immersive Workspace 2.0

**Baseline:** `ui-v10.0.0`
**Branch:** `feature/immersive-workspace-v11`
**Budget:** $0
**Status:** Sprint specification; implementation and tests pending.

## Outcome (substantial UI change, not CSS polish)
At desktop widths >= 1200px, replace the stacked Collection controls -> Gallery flow with a cohesive **two-column workspace**:
- Left discovery rail (roughly 300px, max ~30% width): collection heading, prominent search, filters, clear/reset. Make it sticky only while the surrounding workspace remains visible and never obscure nav.
- Right collection canvas: heading, primary add/view controls, gallery with large visual tiles and comfortable action spacing.
- The rail and gallery must share a wrapper in the DOM. Preserve ALL original field IDs, existing form owners, event handlers, and `#grid`/ `#empty`/ `#resultStatus`; prefer moving existing nodes rather than copying them.
- For 768–1199px: rail stacks as an elegantly compact toolbar above gallery, not a narrow sidebar. For mobile: search-first one-column collection, collapsible advanced filters only if JS state and accessibility are fully tested. Otherwise keep filters plainly visible.

## Secondary experience
- Improve Gallery ↔ Product Quick View flow with a prominent, reliable view-detail affordance; never turn the entire card into a click surface that conflicts with Edit/Delete/Buy/status.
- Preserve V8 Quick View `#qv` native modal, sticky close, Escape, focus restoration, edit bridge, safe links.
- Desktop navigation should visually orient users to workspace vs home; do not create fake navigation routes. Reuse existing anchors and IDs.

## Visual language
Continue V10 Light Lavender × Premium Editorial. Produce a distinctive workspace with strong structural separation, generous white space, refined headings, controlled shadows, and obvious interaction hierarchy. Avoid new glassmorphism layers, generic gradients, duplicate object labels, or gratuitous animation.

## Source safety
- Audit `wishlist.html` markup around `#collection`, `.list-heading`, `#grid`, `#empty`, `#resultStatus`, dashboard and dialog before changing.
- Add a scoped `css/immersive-v11-workspace.css` loaded after V10; touch `wishlist.html` only for necessary semantic wrappers/presentation controls.
- Keep Firebase/Auth/Sync/localStorage/CRUD/data schema, all existing functional IDs, accessibility behaviors, hero V9, and V10 dashboard intact.
- Keep frozen tags V4–V10 untouched.
- Do not modify card Tilt transform.

## Single-sprint execution
1. Implement desktop, tablet, mobile layouts fully.
2. Run V10 full regression (128 V9 inherited + 26 V10 tests, or their current equivalents) AND new V11 layout/interaction tests; all required tests must pass.
3. Test 0, 1, 2, 12 and 50 items, search/filter/sort/reset, Add/Edit/Delete, purchased status, dialog, keyboard navigation, reduced motion, mobile dock, empty states, long names, broken images, no links, import/export.
4. Visual QA with same sample dataset: before/after 1280/1440/1920, 768/1024, 320x568/375x667/375x812/430x932. Check bounding boxes, actual clicks, focus and overflow.
5. Performance A/B against V10 on same headless Chrome machine/dataset, including scrolling, CLS, long tasks, QV latency and CPU 4x.
6. Fix defects and rerun all affected tests plus complete regression suite. Never falsify evidence.

## Required artifacts
- `docs/qa/dream-vault-v11/final-report.md`: exact SHA, file diff, evidence, measurable before/after UI change, outstanding issues by severity, GO/HOLD/NO-GO.
- Machine-readable QA and perf JSON, before/after screenshots.
- No `ui-v11.0.0` tag until final review.

**Gate:** structural visual redesign of Collection, zero P0/P1, regression PASS, $0, no major unexplained performance regression. If not met, HOLD.
