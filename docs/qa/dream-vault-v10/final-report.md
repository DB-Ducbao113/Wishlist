# Dream Vault V10 — The Editorial Workspace · Final Report

**Branch:** `feature/editorial-workspace-v10`
**Baseline:** `ui-v9.0.0` (commit `ce4ef11`)
**Release candidate (code):** `fd98cdacb21c325b2e41a28fb0549ddf5edb5d7b`
**Budget:** STRICTLY $0 — no paid libraries, no external fonts, no new network requests, no animation dependencies.
**Scope guard:** no Firebase / Auth / Cloud Sync / storage / CRUD / data-model / schema change. Existing `sumTotal`, `sumSpent`, `sumCount`, `q`, `fStatus`, `fPriority`, `fCategoryFilter`, `fSort`, `btnClearFilter`, `btnAdd`, `btnExport`, `btnImport`, `btnDeleteSample`, `importFile`, `syncStatus`, `syncEmail`, `btnSignIn`, `btnSignOut`, `syncError` and all event listeners preserved. No V4–V9 frozen CSS file was modified. No V4–V9 release tag was touched.

**Verdict: GO** (release candidate ready; tag `ui-v10.0.0` intentionally NOT created — awaiting a single final review per brief).

---

## 1. What changed (and what did not)

V10 deliberately does **not** touch the Hero or the Gallery (already elevated through V9). It rebuilds the three areas users live in daily — **Header, Dashboard, Collection**.

| # | File | Status | Net |
|---|------|--------|-----|
| 1 | `wishlist.html` | modified | +29 / −7 |
| 2 | `css/editorial-v10-workspace.css` | **new** | 634 lines |

`wishlist.html` edits are all surgical and behaviour-preserving:
- Brand block: wordmark `Wishlist.` → `Dream Vault.` + tagline `The Editorial Workspace`; nav `aria-label` → "Điều hướng Dream Vault".
- Overview: new heading block `01 — Your collection at a glance` / *The value of your dreams* before the stats grid.
- Primary stat description → "Giá trị những giấc mơ phía trước".
- Discovery studio eyebrow → `02 — Discover your wishes`.
- Action labels wrapped in `<span class="nav-add__label">` / `<span class="nav-more__label">` and `aria-label="Thêm món"` added to `#btnAdd` (labels are visually condensed to icons on very small phones — accessible names preserved).
- One `<link>` for the new V10 stylesheet, loaded **last**.

All V10 styling lives in the single scoped layer `css/editorial-v10-workspace.css`, which overrides V5/V6/V7 selectors at equal-or-higher specificity (no `!important`, no edits to frozen files).

---

## 2. Workstream results

### A — Collection Overview (Dashboard)
Replaced three equal cards with an **editorial asymmetric overview**:
- Section kicker `01 — Your collection at a glance` + serif-italic headline.
- A **dominant signature card** (violet gradient, value `clamp(3rem,4.6vw,5rem)`) spanning both rows, with two coordinated secondary cards (`Đã chi`, `Bộ sưu tập`) stacked beside it.
- Removed the legacy `01/02/03` decorative watermarks (they duplicated the new editorial numbering) and replaced card hierarchy with real type scale.
- Tablet: same dominant-left / stacked-right composition. Phone: primary full-width, secondary pair side-by-side.
- `sumTotal` / `sumSpent` / `sumCount` and their dynamic update path verified live (G2e).

### B — Discovery Studio (`#collection`)
Redesigned — not recoloured — into a full-width editorial console:
- Kicker `02 — Discover your wishes` + dominant serif headline; the description now sits in a coordinated right column (desktop).
- **Dominant search** (78px on desktop → 58px on phone).
- Four filters in a single clean row on desktop (2×2 on tablet/phone).
- Quiet "Refine your collection" hint + a low-emphasis ghost **Xóa bộ lọc** that no longer competes with Search.
- Search/Filter/Sort algorithms untouched — verified functionally (G3d, G3e).

### C — Premium Header
- Stronger **Dream Vault** identity: gradient ✦ mark + wordmark + editorial tagline.
- Clear action hierarchy: primary `+ Thêm món`, tools in a `Công cụ` disclosure.
- **Cloud Sync state made explicit**: a slim status bar with a status dot + status text + email + sign-in button, and the sync notice as a quieter secondary line.
- Mobile Dock untouched; all header IDs/listeners intact (G1c).

### D — Design System & Responsive
- One new scoped layer; zero edits to V4–V9 CSS.
- Verified at desktop 1280/1440/1920 · tablet 768/1024 · phone 320×568 / 320×700 / 375×667 / 375×812 / 430×932.
- Phone layout is **deliberately re-stacked**, not a compressed desktop: single-row header with icon-condensed actions ≤374px, full-width primary card, 2-column filters.
- No horizontal overflow and CTA hit-testing pass at every required viewport (G4). (See §6 for the defect found and fixed here.)

### E — Full Regression
| Suite | Result |
|-------|--------|
| V9 functional regression (`v9-check.js`, complete V8/V9 suite on V10 code) | **128 / 128 PASS, 0 FAIL** |
| New V10 suite (`v10-check.js`) | **26 / 26 PASS, 0 FAIL** |
| Console errors | **0** |

V10 suite coverage: header identity/IDs/sync dot (G1), overview heading + dominance + watermark removal + IDs + live sums (G2), discovery studio numbering/IDs/dominant search/filter row/search/sort (G3), responsive overflow + `#btnAdd` hit-test at all 10 viewports (G4), reduced motion (G5).

Functional areas exercised by the V9 suite on V10 code include: Quick View open/close (trusted Escape, focus restore), edit bridge, keyboard controls, status-cycle + Purchased Celebration, card tilt, dialogs, add/edit/delete, search/filter/sort, export/import, 0/1/12/50 items, broken images, missing links, long content, responsive overflow and hit testing.

### F — Performance & Visual Evidence
Headless Chrome A/B, V10 (port 8115) vs V9 `ui-v9.0.0` (port 8118), identical machine/browser/dataset, median of 3. **No material regression.** Full data in `perf-comparison.json`.

| Scenario | Metric | V10 | V9 |
|----------|--------|-----|----|
| mobile 375×812 | fps idle / scroll | 60 / 60 | 60.6 / 60 |
| mobile 375×812 | long tasks / CLS | 0 / 0 | 0 / 0 |
| desktop 1440 | fps idle / scroll | 60 / 60 | 59.9 / 60 |
| gallery 1 / 12 / 50 items | fps scroll | 60 / 60 / 60 | 60 / 60 / 60 |
| gallery 1 / 12 / 50 | long tasks / CLS | 0 / 0 | 0 / 0 |
| QV open (median of 5) | ms | 31.9 | 31.8 |
| QV open frame gap | ms | 16.8 | 16.8 |
| CPU throttle 4× (mobile) | fps scroll / long tasks | 60 / 0 | 59.8 / 0 |
| reduced motion (mobile) | fps scroll / long tasks | 60 / 0 | 60 / 0 |

- Rare single-run `maxGap` spikes (e.g. 33ms on one mobile V10 run vs 18ms) are headless vsync hiccups — they do not reproduce across runs, produce **no long tasks**, and fps stays at 60. Reported honestly, not claimed as improved or regressed.
- Evidence: 49 paired before/after screenshots in `img/` (V9 `v9-*` vs V10 `v10-*`) covering header, dashboard, collection, full page (1280/1440/1920), tablet, all 5 phone sizes, 0/1/12-item states, dialog and Quick View; plus `browser-qa.json`, `perf-comparison.json`, `v9-regression.json`.

---

## 3. Visual quality assessment (independent of technical correctness)

Reviewed paired V9/V10 shots at desktop, tablet and phone. The three target areas change **materially and coherently**:
- Header reads as a premium branded workspace with an explicit sync state.
- Dashboard is now a true asymmetric overview with a genuine focal point instead of three equal tiles.
- Collection reads as a search-led studio with an editorial hierarchy.

No CSS-only "changed but looks the same" outcome. The Hero and Gallery remain the V9 signature work, providing continuity.

---

## 4. Release gate

| Gate | Status |
|------|--------|
| 1. Dashboard/Collection/Header materially improved & coherent | ✅ |
| 2. All required automated regression passes | ✅ (128/128 + 26/26) |
| 3. Zero unresolved P0/P1 | ✅ |
| 4. No material unexplained performance regression | ✅ |
| 5. No data/auth/storage/schema change | ✅ |
| 6. V4–V9 tags untouched | ✅ |
| 7. Budget $0 | ✅ |
| 8. Before/after screenshots, logs, machine-readable QA evidence | ✅ |

---

## 5. Defects found during V10 and their resolution

1. **[Fixed] Decorative `01/02/03` watermarks still painted over the redesigned overview cards.** Root cause: V7 `…:nth-child(2/3)::after` rules had higher specificity than the initial reset. Fix: reset via `…:nth-child(n)::after { content: none }` (equal specificity, later layer wins). Verified (G2c).
2. **[Fixed] Mobile header overflow — `Công cụ` clipped at 375/430px.** Root cause: the lighter, longer brand ("Dream Vault." + tagline) pushed `.nav-actions` past the header edge, clipping the tools control (V9 baseline fit by <10px). Fix: hide the tagline on phones, tighten action sizing, and switch the two action labels to icons ≤374px (accessible names retained via `aria-label`). Verified across 320–430 (G4, nav-width probe: 0 overflow at every required width).
3. **[Fixed during fix #2] Wrap fallback regressed the hero CTA/dock clearance.** An earlier 2-row fallback made the header taller and pushed the hero CTA behind the fixed mobile dock (M11 @375×667, clearance −5). Fix: keep the header strictly single-row; re-verified M11 and 128/128 regression.
4. **[Non-defect, documented] `#dashboard-panel` `scrollWidth > clientWidth`.** A pre-existing clipped decorative pseudo-element (identical values in the V9 baseline); it causes **no** document horizontal overflow. V10's overflow test measures visible descendant geometry, which is clean.

---

## 6. Outstanding issues (by severity)

- **P0 / P1:** none.
- **P2 (carried, unproven):** none introduced by V10. (V9's QV-open wall-clock variance does not reproduce here — V10 and V9 are effectively identical at 31.9 vs 31.8 ms with identical 16.8 ms frame gap.)
- **P3 (cosmetic / deferred):**
  - Header action labels collapse to icons on phones ≤374px by design (accessibility preserved); a labelled overflow menu is a possible future refinement.
  - Real-device performance, background-tab throttling, and 50+ items on weak hardware remain untested (headless only) — carried from V9.
  - CSS V2–V5 consolidation debt remains (deferred).

---

## 7. Honesty notes

- All results are **headless Chrome only** — they do not substitute for physical-device testing.
- No test assertions were weakened to manufacture a PASS; the one regression that appeared (M11) was fixed at its cause and the full suite re-run.
- Unsupported physical-device claims are not made.

---

## 8. Reproduce

```
# baseline V9 (tag ui-v9.0.0) served on :8118, V10 branch served on :8115
node v9-check.js      # 128/128 — full V9 functional regression on V10 code
node v10-check.js     # 26/26  — new V10 UI/responsive suite
node v10-perf.js      # A/B V10 vs V9 perf
```
Harness lives outside the repo at `%LOCALAPPDATA%\Temp\opencode\shot\`.

**Verdict: GO** — do not tag until the single final review is complete.
