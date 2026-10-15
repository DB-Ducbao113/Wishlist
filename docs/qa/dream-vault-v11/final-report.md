# Dream Vault V11 — Immersive Workspace 2.0 — Final Report

**Branch:** `feature/immersive-workspace-v11`
**Baseline:** `ui-v10.0.0` (commit `e800ca7`, tag object `9f92df9`)
**Code + evidence commit:** `f3c62080a591bd95e35ac90c57b6f60b7687d0d4`
**Budget:** $0 (no paid library, no external font, no new runtime dependency)
**Release tag:** none — `ui-v11.0.0` intentionally **not** created (per brief).
**Frozen tags V4–V10:** untouched.

---

## 1. Verdict

> **GO.** The Collection is now a real two-column **Immersive Workspace**
> (Discovery Rail + Collection Canvas) at desktop ≥1200px, a compact toolbar
> above the gallery at 768–1199px, and a search-first single column on phones.
> Zero P0/P1. Full regression PASS. No material performance regression.

| Gate | Result |
| --- | --- |
| Structural visual redesign of Collection | ✅ two-column discovery rail + canvas |
| Zero P0/P1 | ✅ none open |
| Regression PASS | ✅ V9 128/128, V10 26/26, V11 34/34 |
| $0 budget | ✅ |
| No major unexplained perf regression | ✅ ~60fps, 0 long tasks, CLS 0 |
| No `ui-v11.0.0` tag | ✅ |

---

## 2. Scope & constraints honoured

- Baseline `ui-v10.0.0`; new branch; single sprint (implementation + responsive +
  visual QA + full regression + V10/V11 benchmark).
- **No** Firebase / Auth / Cloud Sync / localStorage / CRUD / schema change.
- All existing functional IDs, form owners, event handlers, `#grid` / `#empty` /
  `#resultStatus` preserved — **nodes moved, never copied**.
- Hero V9 and V10 dashboard untouched.
- Arbiter ("Immersive Workspace") markup is a **real implementation**, not a mock.
- Card Tilt transform not modified.

---

## 3. What changed (exact file diff)

```
wishlist.html                        | 21 insertions(+), 1 deletion(-)
css/immersive-v11-workspace.css      |  NEW — 289 lines
docs/qa/dream-vault-v11/*            |  evidence (8 JSON + 85 screenshots)
```

- New scoped layer `css/immersive-v11-workspace.css`, loaded **last** (after
  `editorial-v10-workspace.css`). No frozen CSS file edited (V1–V10 intact).
- `wishlist.html` edits (presentation only):
  1. Added `<div class="v11-workspace">` wrapper around the Collection.
  2. `#collection` gained class `v11-rail` (same element/ID; still
     `aria-labelledby="collection-controls-title"`).
  3. Added `<div class="v11-canvas">` wrapping the existing
     `.list-heading` + `#grid` + `#empty` + `#resultStatus` (moved, not copied).
  4. Added desktop orientation nav `.v11-workspace-nav` reusing existing anchors
     `#top` / `#collection` (no fake routes).
  5. Added the V11 stylesheet `<link>`.

---

## 4. The redesign — measured before/after

### Desktop ≥1200px — Discovery Rail (left) + Collection Canvas (right)

| Metric | V10 (before) | V11 (after) |
| --- | --- | --- |
| `.v11-workspace` display | (n/a — stacked) | `grid`, 2 columns |
| Rail | full-width studio panel above gallery | `#collection` sticky rail, **320px** |
| Rail / workspace width | 100% | **0.24–0.25** (≤ 30 % target) |
| Rail position | static | `sticky` (top 22px; header scrolls away, never obscured) |
| Gallery owner | page flow | inside `.v11-canvas` |
| Featured card (OBJECT 001) | span 2 of 3 columns | spans **full canvas** (comfortable media+content) |

Verified at **1280 / 1440 / 1920** (assertions W2, W2b).

### Tablet 768–1199px — compact toolbar above gallery
Rail collapses to a full-width toolbar (heading + search + a single tidy filter
row + reset) sitting **above** the canvas; `#collection` back to `static`.
Verified at **768 / 1024** (assertion W5).

### Mobile ≤767px — search-first, single column
One column; the rail (search-first) renders **before** the canvas in DOM order;
gallery is a single column; bottom dock (home / collection / add / search) fully
usable; zero horizontal overflow. Verified at **320×568, 320×700, 375×667,
375×812, 430×932** (assertion W6).

> Advanced-filter collapsing on mobile was **not** added: the spec permits
> "collapsible advanced filters **only if** JS state and accessibility are fully
> tested. Otherwise keep filters plainly visible." To avoid introducing unproven
> JS state into a frozen-functionality surface, filters remain plainly visible.

### Secondary
- Gallery ↔ Quick View: unchanged reliable affordance — the dedicated
  `button.mini.product-card__view` ("Xem chi tiết"); the card is **not** a click
  surface. QV native `<dialog>` + Escape + focus restore verified (W7d/W7e).
- Desktop orientation nav: `.v11-workspace-nav` (`Trang chủ` → `#top`,
  `Bộ sưu tập` → `#collection`) shown ≥1025px, hidden on mobile (W4).

### Screenshots (before/after)
`docs/qa/dream-vault-v11/img/` — 85 images:
- **before (`v10-*`)**: V10 stacked studio — `v10-full-1440.jpg`, `v10-full-1280.jpg`, `v10-rail-1440.jpg`, …
- **after (`v11-*`)**: workspace — `v11-workspace-1280/1440/1920.jpg`, `v11-rail-*`, `v11-workspace-768/1024`, `v11-mworkspace-320x568…430x932`, `v11-dialog-*`, `v11-qv-1440`, `v11-grid-1440`, empty/single/12-item states.

---

## 5. Regression & QA (machine-readable)

| Suite | Build | Result | Evidence |
| --- | --- | --- | --- |
| V9 inherited (128) | **V11** | **128/128 PASS, 0 FAIL** | `v9-regression.json` |
| V10 (26) | **V11** | **26/26 PASS, 0 FAIL** | `v10-regression.json` |
| V11 new (34) | **V11** | **34/34 PASS, 0 FAIL** | `browser-qa.json` |
| V9 inherited (128) | baseline `ui-v10.0.0` | 128/128 PASS | `baseline-v9.json` |
| V10 (26) | baseline `ui-v10.0.0` | 26/26 PASS | `baseline-v10.json` |

**Console errors across every suite: 0.**

V11 suite coverage (`browser-qa.json`): workspace wrapper + node ownership
(W1), desktop rail/canvas geometry + featured span (W2 ×3 vp), sticky rail +
nav non-overlap (W3), desktop orientation nav visible/clickable/hidden (W4),
tablet toolbar (W5 ×2), mobile single-column/search-first/dock/no-overflow
(W6 ×5), post-move functionality — search/sort/reset/Add/Edit/Delete/QuickView
(W7/W8), states 0/1/2/12 items + empty (W9), reduced motion (W10).

### 5a. Superseded layout expectations (transparent)

Six inherited assertions encode the **pre-V11 single-column gallery** and are
intentionally replaced by the workspace. They are **not** functional
regressions. Raw divergence captured in
`divergence-v9-original-expectations.json` (123/128) and
`divergence-v10-original-expectations.json` (25/26).

| Assertion | Original expectation | Actual on V11 | V11 equivalent (PASS) |
| --- | --- | --- | --- |
| V9 C1 @1280 | 3 cols, card ≥300px | 3 cols, min **263px** | W2 canvas gallery |
| V9 C1 @1440 | 3 cols, card ≥300px | 3 cols, min **285px** | W2 canvas gallery |
| V9 C2 @1280 | featured = 2×card+gap (554) | featured = **844** (full canvas) | W2b |
| V9 C2 @1440 | featured = 2×card+gap (598) | featured = **920** (full canvas) | W2b |
| V9 C2 @1920 | featured = 2×card+gap (702) | featured = **1076** (full canvas) | W2b |
| V10 G3c | search ≥70px + 4 filters in 1 row | search **54px** + filters **2 rows** (rail) | W6 / V11 rail |

Why it is arithmetically unavoidable: at a 1280 viewport the content box is
1200px. A ~300px rail + a gap leaves ≤ ~860px for a 3-column gallery
(≈263–285px/card). A ≥300px card **and** a ~300px rail cannot coexist at 1280px.
The regression suites were therefore run in a documented `V11EQ` mode that
re-expresses exactly these six layout assertions as their **current
equivalents** (spec: "*or their current equivalents*"), while the original
assertions still PASS 128/128 and 26/26 on the frozen `ui-v10.0.0` baseline
(proof they are baseline-layout-specific, not functional failures). All
non-layout / functional assertions pass unchanged.

---

## 6. Performance A/B (V11 vs V10) — headless Chrome only

*Same machine, same Chrome, same dataset (DS_V8 / 1·12·50 items), median of 3
runs.* **Not representative of physical devices.**

| Scenario | V11 | V10 | Δ |
| --- | --- | --- | --- |
| Mobile 375×812 idle / scroll fps | 60.7 / 60.0 | 60.6 / 60.0 | ~0 |
| Desktop 1440 idle / scroll fps | 59.9 / 60.0 | 60.0 / 60.0 | ~0 |
| Gallery 1 / 12 / 50 items (scroll fps) | 60.0 / 60.0 / 60.0 | 60.0 / 60.0 / 60.0 | 0 |
| QV open (median) | **30.7 ms** | 31.5 ms | −0.8 ms |
| QV close (median) | 33.5 ms | 33.4 ms | +0.1 ms |
| CPU throttle 4× (scroll fps) | 60.4 | 59.8 | ~0 |
| Reduced motion (scroll fps) | 60.0 | 60.0 | 0 |
| Long tasks (all scenarios) | **0** | **0** | 0 |
| CLS (all scenarios) | **0** | **0** | 0 |
| Max frame gap | 16.9–18.4 ms | 16.9–18.2 ms | ~0 |

Full data: `perf-comparison.json`. **No material regression.**

---

## 7. Defects found during the sprint (fixed before completion)

| # | Sev | Defect | Fix |
| --- | --- | --- | --- |
| 1 | **P1** | Featured card (OBJECT 001) squeezed in the narrower canvas — title broke as “Everyda / y / essenti…” | Featured spans the **full canvas width**; min-height + title size rebalanced. Re-verified W2b. |
| 2 | P3 | Element screenshots of the sticky rail captured at the wrong scroll offset (capture artifact) | QA harness neutralises `position: sticky` for deterministic element shots (harness only). |
| 3 | n/a | Test bug — `W7c` expected `#fStatus === "all"` | App correctly resets to `""` (verified in source); test corrected. **Test bug, not an app bug.** |

---

## 8. Outstanding issues by severity

- **P0:** none.
- **P1:** none.
- **P2 (deferred / pre-existing, unchanged by V11):**
  - CSS layering debt V2–V5 (carried from V10; consolidation is a separate effort).
  - The six inherited layout assertions above are *superseded by design* and are
    documented rather than deleted.
- **P3 / out of scope (not evaluable here):**
  - Real physical-device performance.
  - Background-tab rAF throttling.
  - 50+ products on weak hardware.
  - Mobile advanced-filter collapsing (kept plainly visible per spec option).

---

## 9. Evidence index

```
docs/qa/dream-vault-v11/
  final-report.md                              (this file)
  browser-qa.json                              V11 suite 34/34
  perf-comparison.json                         V11 vs V10 A/B
  v9-regression.json                           V9 (128) on V11 — 128/128
  v10-regression.json                          V10 (26) on V11 — 26/26
  baseline-v9.json                             V9 (128) on ui-v10.0.0 — 128/128
  baseline-v10.json                            V10 (26) on ui-v10.0.0 — 26/26
  divergence-v9-original-expectations.json     V9 original expectations on V11 — 123/128
  divergence-v10-original-expectations.json    V10 original expectations on V11 — 25/26
  img/                                         85 before/after screenshots
```

---

## 10. Reproduce

```bash
# V11 build
python -m http.server 8115 --bind 127.0.0.1         # repo (branch V11)
# V10 baseline (ui-v10.0.0)
python -m http.server 8119 --bind 127.0.0.1         # extracted baseline dir

node v11-check.js                                   # 34/34
PORT=8115 V11EQ=1 node v9-check.js                  # 128/128
PORT=8115 V11EQ=1 node v10-check.js                 # 26/26
PORT=8119 node v9-check.js                          # baseline 128/128
PORT=8119 node v10-check.js                         # baseline 26/26
node v11-perf.js                                    # A/B V11 vs V10
node v11-shot.js v11 && node v11-shot.js v10        # screenshots
```

---

## 11. Decision

**GO.** The Collection is a genuinely restructured Immersive Workspace with an
obvious before/after change, all functional behaviour preserved, full regression
PASS, no P0/P1, and no material performance regression. No `ui-v11.0.0` tag is
created — pending final review.
