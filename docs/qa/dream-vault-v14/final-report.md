# Dream Vault V14 — Final UX & Architecture Stabilization — Final QA Report

**Branch:** `feature/final-ux-architecture-v14`
**Baseline:** `ui-v13.0.0` (`69c7a56f56c2137404f7052278405e05e60df884`)
**Budget:** $0 — no paid tools, deps, fonts, or new services
**Status:** **QA COMPLETE — GO (release candidate).** Tag `ui-v14.0.0` intentionally NOT created before the owner's final review.

> All evidence produced with headless Chrome on the QA machine (`127.0.0.1`, Python static server).
> It does **not** represent real devices. Every number is reproducible from the harness scripts and
> the JSON under `docs/qa/dream-vault-v14/img/`.

---

## 1. Scope vs `ui-v13.0.0`

V14 is a **stabilization** sprint — no visual redesign, no feature work, no changes to
Firebase/Auth/Sync, localStorage, CRUD, data model, import/export, product actions or view modes.

| File | Change |
| --- | --- |
| `css/motion.css` | **Deleted** — proven dead (`.motion-button`, 0 refs) |
| `css/cinematic-v7-hero.css` | **Deleted** — proven dead (`.hero-scene__*`, 0 in DOM/JS) |
| 7 CSS files (`hero.css`, `hero-v2.css`, `dreamscape-v5-hero.css`, `desktop-showroom-v6-hero.css`, `cinematic-v7-mobile.css`, `cinematic-v7-visual-overhaul.css`, `premium-v9-signature.css`) | 59 dead `.hero-scene` rule blocks removed |
| `css/layout.css` | 4 dead blocks removed (`.app-shell`, `.stats`, `.wishlist-grid`, bare `main`) |
| `wishlist.html` | 2 dead `<link>` removed; a11y fixes (see §3) |
| `docs/qa/dream-vault-v14/` | this report, `css-inventory.md`, machine-readable JSON, before/after screenshots |

Net: **48 → 46 stylesheets**, **273,846 → 261,229 CSS bytes (−12,617 B, −4.6%)**.
Full evidence in `css-inventory.md`.

---

## 2. Workstream A — CSS architecture (evidence-based)

Method: CSS coverage unioned over 14 states, selector-liveness scan (830 selectors → 89 never
matched), source cross-check, and a **computed-style snapshot invariant** (every body element,
40 properties, 12 states) taken before and after.

**Result: the before/after computed-style snapshot is byte-identical — 0 differences across all
12 states and 543 elements** (`img/computed-style-invariance.json`). Removing the dead CSS changed
nothing on screen, which is exactly the point.

The largest dead component was the entire `.hero-scene*` family — **63 occurrences across 8 files,
0 in the live DOM/JS**. Removing it lifted `hero.css` from 37.3% → 73.9% used, `hero-v2.css` 56.9%
→ 88.2%, `dreamscape-v5-hero.css` 56.1% → 76.3%. Low-coverage files that are **state-dependent**
(`:focus-visible`, toasts, QV status rings, reduced-motion, entrance/celebration animations) were
deliberately **kept** — see `css-inventory.md` §4.

---

## 3. Workstream B — Accessibility

| Finding | Severity | Action |
| --- | --- | --- |
| Search input `#q` had **no accessible name** (placeholder only) | **P1** | Added `aria-label="Tìm kiếm món, danh mục hoặc ghi chú"` |
| `.v13-viewbar__switch` had `aria-label` on a role-less `<div>` (label not exposed) | P2 | Added `role="group"` |
| `.total.stats-dashboard` had `aria-label` on a role-less `<div>` | P2 | Added `role="group"` |

Verified **not** defects: the search field's visible focus is provided by the
`.collection-search__input-wrap:focus-within` ring (border → solid + 4px ring, confirmed at 1440
and 375); the `<summary aria-label="Công cụ wishlist">` contains its visible text "Công cụ"
(WCAG 2.5.3 satisfied); toasts already carry `role`/`aria-atomic`.

Post-fix audit (`img/a11y.json`): all interactive elements named, 0 images missing `alt`,
landmarks present (`header`, `nav×2`, `h1×1`), focus-visible on the tab-through path.

---

## 4. Workstream C — Responsive

V14 suite checks **12 viewports** — 320×568, 360×640, 375×667, 375×812, 390×844, 414×896,
430×932, 768×1024, 1024×900, 1280×800, 1440×900, 1920×1080: no horizontal overflow in Gallery or
Focus, the viewbar toggle is hit-testable (mobile dock does not obscure it), and Focus is a true
single column. **12/12 PASS.**

---

## 5. Workstream D — Functional

Full inherited regression re-run on the V14 build:

| Suite | Result | Evidence |
| --- | --- | --- |
| V9 regression | **128 / 128 PASS** | `img/regression-v9.json` |
| V10 regression | **26 / 26 PASS** | `img/regression-v10.json` |
| V11 suite | **34 / 34 PASS** | `img/regression-v11.json` |
| V12 suite | **40 / 40 PASS** | `img/regression-v12.json` |
| V13 suite | **50 / 50 PASS** | `img/regression-v13.json` |
| V14 suite (new) | **25 / 25 PASS** | `img/browser-qa.json` |
| **Total** | **303 / 303 PASS** | |

V9/V10 run in documented `V11EQ` mode (same 6 superseded assertions as V11/V13; no new divergences).
The V14 suite covers: dead-layer removal (no `motion.css`/`cinematic-v7-hero.css` link, 46 sheets,
no residual `hero-scene`/`motion-button` selectors, files 404), the a11y fixes, 12-viewport
responsive, a CRUD/search/QV/tilt smoke, reduced motion, dialog modal focus + Escape, and console
errors = 0.

---

## 6. Workstream E — Performance A/B (`ui-v13.0.0` vs V14)

Median of 3, same machine/browser/dataset/viewport. `img/perf-v13-v14.json`.

| Scenario | fps idle / scroll | max frame gap | long tasks | CLS |
| --- | --- | --- | --- | --- |
| Gallery mobile 375 — V13 / V14 | 60.7/60 · 60.6/60 | 18.3 / 18.6 ms | 0 / 0 | 0 / 0 |
| Gallery desktop 1440 — V13 / V14 | 59.9/60 · 59.9/60 | 17 / 17 ms | 0 / 0 | 0 / 0 |
| Focus mobile / desktop (V14) | 60.6/60 · 59.9/60 | 18.3 / 17.1 ms | 0 | 0 |
| Gallery 50 items mobile — V13 / V14 | 60.6/60 · 60.6/60 | 17.9 / 18 ms | 0 / 0 | 0 / 0 |
| CPU throttle 4× — V13 / V14 | 60.8/60 · 60.8/60 | ≤18 ms | 0 | 0 |
| Reduced motion — V13 / V14 | 60.6/60 · 60.6/60 | 18.3 / 18.3 ms | 0 | 0 |

Quick View open/close: V14 **31.3 ms** / V13 **32.0 ms**; close 33.3 ms both.
**No performance regression.** As expected for dead-CSS removal the numbers are equivalent — the
win is maintainability and bytes, not fps, and we report it honestly rather than claiming a speedup.

---

## 7. Workstream F — Release QA / before-after

`docs/qa/dream-vault-v14/img/` — matched V13 vs V14 pairs at 1440/1024/768/375/320/1920 for
Gallery and Focus workspaces, plus empty / single / 12-item, Quick View and the add dialog
(40 screenshots). Because the computed-style snapshot is identical, the pairs are visually the same
by design; they are kept as the required before/after evidence.

---

## 8. Honest assessment

- The headline outcome is **evidence, not a cosmetic win**: 2 dead stylesheets and 59 dead rule
  blocks removed, proven dead three ways, with a computed-style snapshot proving zero visual change.
- Structured layers that are *partially* dead (`legacy.css`, `cinematic-v7-workspace.css`,
  `cinematic-v7-gallery-lighting.css`, and the many `:hover`/`:focus-visible`/state rules) were
  **kept** — consolidating them would re-order a 48-file cascade and risk the frozen V13 design.
  Per the sprint guardrail, stability was chosen over a file-count KPI, and the candidates are
  documented for V15.
- Accessibility: one real **P1** (unlabeled search input) and two P2 ARIA role issues fixed. No P0/P1
  remain.

---

## 9. Deferred / not attempted (carried)

- A `<main>` landmark is still absent. It is a best-practice (not a WCAG failure), and introducing a
  `<main>` element would activate legacy `main` selectors and change container geometry — too risky
  for a stabilization sprint. Deferred to V15 with rationale.
- Deep consolidation/merging of the partially-dead legacy layers (documented in `css-inventory.md`).
- Real-device performance, background-tab throttling, 50+ products on weak hardware.
- Full automated WCAG/axe sweep (only targeted checks were run).

---

## 10. Verdict

**GO (release candidate).** V14 25/25, V9 128/128, V10 26/26, V11 34/34, V12 40/40, V13 50/50
(**303/303**), performance unchanged, accessibility not regressed and improved on one P1 + two P2,
and the CSS-architecture cleanup is proven visually inert by an identical computed-style snapshot.
`ui-v14.0.0` is **not** created here — awaiting the owner's final review. Future defects will be
fixed forward on a branch, never by editing frozen tags.
