# Dream Vault V13 — Interactive Collection — Final QA Report

**Branch:** `feature/interactive-collection-v13`
**Baseline:** `ui-v12.0.0` (`ca240c9e8c87240a6b76782aa50ed93058b77173`)
**Budget:** $0 — no paid libraries, no external fonts, no new services
**Status:** **QA COMPLETE — GO (release candidate).** Tag `ui-v13.0.0` intentionally NOT created before the owner's final review.

> All browser evidence was produced with headless Chrome on the QA machine (`127.0.0.1`,
> Python static server). It does **not** represent real devices. Every number is reproducible
> from the harness scripts and JSON kept in `docs/qa/dream-vault-v13/img/`.

---

## 1. Scope of change vs `ui-v12.0.0`

| File | Change |
| --- | --- |
| `css/interactive-v13-collection.css` | New isolated layer: viewbar styling + a real **Focus** layout (full-width horizontal exhibits) with stacked mobile fallback. |
| `wishlist.html` | Loads the V13 CSS after V12; adds an accessible Gallery/Focus toggle (`aria-pressed`, `aria-controls`) and the `setCollectionView()` UI-only function. No CRUD/Firebase/Auth/Sync/persistence change; view state is transient. |
| `docs/qa/dream-vault-v13/` | This report, `qa-gate.md`, machine-readable JSON, paired screenshots. |

The V13 layer loads **last**, after `product-v12-presentation.css`, and only acts when
`#grid[data-v13-view="focus"]` is set. Gallery mode is byte-for-byte the V12 layout plus the new
viewbar row. Card Tilt, Quick View, card Buy/Edit/Delete and status handlers remain owned by the
existing code paths.

---

## 2. Defect found and fixed during the sprint

### D1 — **P1: Focus mode was silently overridden by legacy CSS specificity (FIXED)**
The committed V13 selectors (`body.dreamscape-v5 .v11-canvas #grid[data-v13-view="focus"] …`,
specificity (1,3,1)…(1,5,1)) **lost** to legacy gallery rules:

- Grid columns at ≥1025px: `body.dreamscape-v5 #grid.grid.gallery--v4.gallery--v6`
  = **(1,4,0)** beat V13 → Focus stayed a **3-column grid** (masked only by
  `grid-column: 1/-1`, so it looked stacked but the grid geometry was wrong).
- The **featured first card** at ≤1024px:
  `…#grid.gallery--v2.gallery--v4.gallery--v6 > .wishlist-card:first-child:not(:only-child) .wishlist-card__surface`
  = **(1,7,0)** beat V13 (1,5,1) → the first card's surface stayed `display:flex`, rendering a
  **707px-tall** stacked hero at 1024 and an inconsistent aspect at 375.

Diagnosed with computed style + matched-rule enumeration (not guessing). Fix: repeat the legacy
class chain and append the attribute — `#grid.grid.gallery--v2.gallery--v4.gallery--v6[data-v13-view="focus"]`
(→ (1,8,1)/(1,9,1)) — so Focus wins deterministically. After the fix, Focus is a genuine 1-column
layout at every width and the featured card adopts the Focus grid like the rest.

Screen evidence: `img/v13-focus-workspace-1024.jpg`, `img/v13-focus-card1-1440.jpg`.

---

## 3. The Focus experience (design intent)

Focus is a **different interaction model**, not a re-skin: each product becomes a full-width
horizontal exhibit — mount + image on the left, a large serif title, price, status/priority
badges, category/date and the action row on the right; one exhibit per row. Mobile stacks to a
single column (media on top). Gallery keeps the V12 card grid. The toggle lives in a new
"EXHIBITION MODE" viewbar directly under the canvas heading.

---

## 4. Test results

### 4.1 V13 browser suite — **50 / 50 PASS**
`img/browser-qa.json`. Covers: viewbar structure + `aria-pressed`/`aria-controls`; toggle & real
computed-style layout switch at **9 viewports**; featured-card parity at every width (P1 guard);
no duplicate cards across repeated toggles; Focus persistence through **search / filter / sort /
add / delete / status-cycle / edit / import**; Card Tilt ownership (`matrix`, CSS free of
`transform` on the surface); keyboard (Enter/Space) + focus-visible; Quick View open/Escape/
focus-restore from Focus; accessibility; responsive (no overflow; viewbar reachable, dock not
obscuring); empty / no-link / broken-image; reduced motion; JS console errors = 0.

### 4.2 Full inherited regression (on the V13 build)

| Suite | Result | Evidence |
| --- | --- | --- |
| V9 regression | **128 / 128 PASS** | `img/regression-v9.json` |
| V10 regression | **26 / 26 PASS** | `img/regression-v10.json` |
| V11 suite | **34 / 34 PASS** | `img/regression-v11.json` |
| V12 suite | **40 / 40 PASS** | `img/regression-v12.json` |
| V13 suite | **50 / 50 PASS** | `img/browser-qa.json` |
| **Total** | **278 / 278 PASS** | |

V9/V10 run in the documented **`V11EQ` equivalent mode**. The same six assertions that V11
superseded remain the only documented divergence — V13 introduces **no new** superseded
assertions (its target is `[data-v13-view="focus"]`, which is absent in the gallery default).

---

## 5. Performance benchmark — V12 (`ui-v12.0.0`) vs V13 (incl. Focus)

Same machine/browser/dataset/viewport; median of 3 runs. `img/perf-v12-v13.json`.

| Scenario | fps idle / scroll | max frame gap | long tasks | CLS |
| --- | --- | --- | --- | --- |
| Gallery mobile 375 — V12 / V13 | 60.6/60.6 · 60.6/60.6 | 19 / 19 ms | 0 / 0 | 0 / 0 |
| Gallery desktop 1440 — V12 / V13 | 60/60 · 60/60 | 16.9 / 16.9 ms | 0 / 0 | 0 / 0 |
| **Focus** desktop 1440 / mobile 375 (V13) | 60/60 · 60.6/60.6 | 17 / 18.4 ms | 0 | 0 |
| Gallery 1 / 12 / 50 items (V13) | ~60.7 / ~60 | ~18.5 ms | 0 | 0 |
| CPU throttle 4× (V13 gallery / focus / V12) | 60.8/59.8 · 60.8/59.8 · 60.6/60.1 | ≤18.8 ms | 0 | 0 |
| Reduced motion (V13 focus / V12) | 60.6/60 · 60.6/60 | ≤18.5 ms | 0 | 0 |

Quick View open/close: V13 gallery **31.8 ms** / V13 focus **30.3 ms** / V12 **30.5 ms**; close ≈33.5 ms.
**No measurable performance regression; Focus costs nothing observable vs Gallery.**

---

## 6. Accessibility

`img/a11y.json`.

| Check | V13 Gallery | V13 Focus | V12 Gallery |
| --- | --- | --- | --- |
| Interactive elements with an accessible name | 26 / 26 | 26 / 26 | 24 / 24 |
| Product images missing `alt` | 0 | 0 | 0 |
| Decorative plaque/caption `aria-hidden` | yes | yes | yes |
| Title contrast | 16.56:1 | 16.56:1 | 16.56:1 |
| Active (Focus) toggle contrast | **6.07:1** | 6.07:1 | — |
| Idle toggle contrast | **5.63:1** | 5.63:1 | — |
| Focus-visible outline on view button | 3px solid | 3px solid | 3px solid |

Toggle is a labelled `role="group"` with two `aria-pressed` buttons — meets WCAG AA for text.
No accessibility regression; the keyboard path (Tab → Enter/Space) is verified in the suite.

---

## 7. Before / after screenshots (same dataset)

`docs/qa/dream-vault-v13/img/` — matched V12-gallery vs V13-gallery vs V13-focus at
1280/1440/1920, 768/1024, 320/375/430, plus `focus-grid`, `focus-viewbar`, `focus-card1/4`,
featured-long / purchased / no-link, empty / single / 12-item, Quick View (desktop + mobile) and
the add dialog. Representative:

- `v12-gallery-workspace-1440.jpg` → `v13-focus-workspace-1440.jpg` — grid → horizontal exhibits
- `v13-focus-workspace-1024.jpg` — the P1 fix: featured no longer a giant stacked hero
- `v13-focus-workspace-375.jpg` — mobile single-column Focus
- `v13-focus-viewbar-1440.jpg` — the EXHIBITION MODE toggle

Gallery mode is visually unchanged apart from the new viewbar (`v12-gallery-workspace-1440.jpg`
vs `v13-gallery-workspace-1440.jpg`).

---

## 8. Honest assessment

Focus is a **real, clearly different interaction mode** — full-width editorial exhibits vs the
card grid — not another cosmetic layer. After the D1 fix the featured card behaves like every
other exhibit at all widths. The delta versus V12 is unmistakable in the screenshots. Remaining
nit (not a defect): at 768px the action row can wrap one secondary button ("Xóa") to a second
line on cards that also show "Mở nơi bán"; it stays fully operable and is left as-is to avoid
destabilising the frozen card markup.

---

## 9. Deferred / not attempted (carried)

- Real-device performance and background-tab throttling.
- 50+ products on weak hardware.
- CSS V2–V5 consolidation debt.
- Full WCAG/axe audit (only the targeted checks in §6 were run).
- Focus mode persistence across reloads (explicitly out of scope: view state is transient).
- Real product photography (QA dataset uses placeholders).

---

## 10. Verdict

**GO (release candidate).** V13 50/50, V9 128/128, V10 26/26, V11 34/34, V12 40/40 (278/278),
performance unchanged including the new Focus mode, accessibility not regressed, and the one real
defect (D1 specificity) is fixed. `ui-v13.0.0` is **not** created here — awaiting the owner's
final review. Future defects will be fixed forward on a branch, never by editing frozen tags.

**Branch HEAD at QA time:** `8242b8ccd804940f61cdbd301e5e2dea7b857bc7` (+ this fix/report commit).
