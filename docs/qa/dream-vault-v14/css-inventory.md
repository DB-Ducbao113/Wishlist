# Dream Vault V14 — CSS Inventory & Architecture Audit

**Base:** `ui-v13.0.0` · **Branch:** `feature/final-ux-architecture-v14` · **Budget:** $0

This is the evidence behind workstream A (CSS Architecture). It records what was measured,
what was **proven dead**, what was removed, and what was deliberately **kept** — with the
raw machine-readable results under `img/`.

> Guardrail honoured: nothing was deleted or merged on a hunch. Every removal is backed by
> (1) 0% CSS coverage across a state matrix, (2) zero matching DOM elements / source
> references, and (3) an **identical computed-style snapshot** before vs after
> (`img/computed-style-invariance.json`, 12 states × 543 elements × 40 properties, 0 diffs).

---

## 1. Headline

| Metric | Before (`ui-v13.0.0`) | After (V14) | Δ |
| --- | --- | --- | --- |
| `<link rel="stylesheet">` count | **48** | **46** | −2 |
| Total CSS bytes | **273,846** | **261,229** | **−12,617 (−4.6%)** |
| Proven-dead rule blocks removed | — | **59 hero-scene rules + 4 legacy layout blocks** | — |
| Fully dead stylesheets removed | — | **2** (`motion.css`, `cinematic-v7-hero.css`) | — |
| Computed-style regressions | — | **0** (identical snapshot) | — |

We intentionally did **not** chase an arbitrary file-count target. The two removed files and
the `hero-scene` rule set are unambiguously dead; the remaining low-coverage files are
state-dependent (see §4) and were **kept**.

---

## 2. Methodology

1. **Coverage** (`v14-coverage.js` → `img/css-coverage.json`): Chrome CSS coverage, unioned
   across 14 states — desktop/tablet/320/375/430, gallery/focus, 0/1/7/12 items, Quick View
   open, add-dialog open, reduced motion, hover/focus. Reports used vs unused bytes per file.
2. **Selector liveness** (`v14-selectors.js` → `img/selector-liveness.json`): enumerates every
   CSS rule, strips pseudo-classes/elements, and tests `querySelectorAll` on a populated DOM
   across 8 states. 830 selectors: 728 live, **89 never matched**, 13 untestable.
3. **Source cross-check**: each "never matched" cluster was grep-checked against `wishlist.html`
   and the JS for the class/tag it targets.
4. **Invariance proof** (`v14-snapshot.js` → `img/computed-style-invariance.json`): a canonical
   computed-style snapshot of *every* body element (40 properties) at 12 states, taken before
   and after the changes and diffed. **0 differences.**
5. Full regression V9–V13 + V14 suite re-run on the V14 build (`img/regression-*.json`,
   `img/browser-qa.json`).

---

## 3. Proven-dead CSS — removed

| Item | Evidence | Action |
| --- | --- | --- |
| `motion.css` (`.motion-button`) | 0% coverage; `motion-button` appears **0** times in HTML/JS | file deleted, `<link>` removed |
| `cinematic-v7-hero.css` (`.hero--v7 .hero-scene__*`) | 0% coverage; `hero-scene__card/glow/product` **0** occurrences in DOM/JS | file deleted, `<link>` removed; its orphan `@keyframes v7-float-*` (referenced only by removed rules) went with it |
| `.hero-scene*` rules in `hero.css`, `hero-v2.css`, `dreamscape-v5-hero.css`, `desktop-showroom-v6-hero.css`, `cinematic-v7-mobile.css`, `cinematic-v7-visual-overhaul.css`, `premium-v9-signature.css` | 63 occurrences across 8 files; **0** in DOM/JS; all removed rules were standalone (0 grouped-selector trims — no live selector shared a block) | 59 rule blocks removed |
| `layout.css`: `.app-shell`, `.stats`, `.wishlist-grid`, bare `main` | 0 DOM matches (no `<main>`, no `.stats`/`.app-shell`/`.wishlist-grid` elements) | 4 blocks removed; `.site-nav`/`.wrap` kept |

`hero-scene` was the single largest dead component in the project. Removing it lifted several
hero files from ~37–57% to 74–88% coverage (see the audit table).

---

## 4. Low coverage but **kept** (with reasons)

These are intentionally **not** dead — coverage only proves a rule didn't match *in the
recorded states*. Removing them would be a real regression.

- **`:focus-visible` rules** (many) — only "fire" during keyboard focus, which the coverage
  capture doesn't hold. Verified live in the V14 a11y tab-through.
- **`toast.css` (reported 0%)** — a measurement artifact: the coverage matrix never triggered
  a toast. `.toast` is created by `toast()` (`wishlist.html` line 983) with `role`/`aria-atomic`.
  The `desktop-toast` snapshot state confirms it renders. **Kept.**
- **`#qv .quick-view__ring--{saving,ordered,purchased,p-low,p-medium}`, `.is-purchased`,
  `.is-purchase-celebrating`** — status-dependent; not all statuses existed in the dataset.
- **`grid-entrance.css`, `purchased-motion.css`** — driven by JS (`animateGridEntrance`,
  celebration). Low coverage because animation runs once / per state.
- **`@media (prefers-reduced-motion: reduce)` blocks** — only evaluated under the reduced-motion
  run.
- **`legacy.css` (52%)**, **`cinematic-v7-workspace.css` (44%)**, **`cinematic-v7-gallery-lighting.css`
  (47%)** — partially used; the unused portion is interleaved with live rules and/or state-dependent.
  Consolidating them is higher risk than reward in a stabilization sprint, so they are **preserved**
  and listed here for V15.

---

## 5. Audit table (post-V14 coverage)

Per-file used bytes vs size, from `img/css-coverage.json` (union of 14 states). Sorted by usage.
"Unused" is bytes not matched in the recorded states and therefore an **upper bound** on dead CSS
(see §4 caveats).

| File | Bytes | Used | Unused |
| --- | ---: | ---: | ---: |
| `css/tokens.css` | 2169 | 94.8% | 112 |
| `css/homepage-v3.css` | 2044 | 93.8% | 127 |
| `css/dreamscape-v5-tokens.css` | 1389 | 91.6% | 116 |
| `css/cinematic-v7-visual-overhaul.css` | 21999 | 88.8% | 2465 |
| `css/hero-v2.css` | 2920 | 88.2% | 344 |
| `css/collection-v3.css` | 3575 | 85.1% | 534 |
| `css/gallery.css` | 3823 | 83.8% | 621 |
| `css/stats-v2.css` | 4311 | 83.8% | 700 |
| `css/dialog.css` | 5693 | 81.7% | 1039 |
| `css/stats.css` | 2751 | 81.7% | 504 |
| `css/controls.css` | 3766 | 80.3% | 741 |
| `css/editorial-v10-workspace.css` | 17325 | 79.9% | 3476 |
| `css/base.css` | 1196 | 78.3% | 259 |
| `css/empty-state.css` | 1846 | 78% | 406 |
| `css/dreamscape-v5-dashboard-collection.css` | 5630 | 77.1% | 1291 |
| `css/dreamscape-v5-hero.css` | 4947 | 76.3% | 1172 |
| `css/mobile-products-v4.css` | 2682 | 76.3% | 635 |
| `css/dreamscape-v5-surfaces.css` | 3457 | 74.5% | 883 |
| `css/gallery-v4.css` | 2970 | 74% | 771 |
| `css/hero.css` | 2156 | 73.9% | 562 |
| `css/cinematic-v7-mobile.css` | 32242 | 73.8% | 8441 |
| `css/card-interactions-v4.css` | 2906 | 73.4% | 772 |
| `css/polish-v2.css` | 2811 | 73.2% | 752 |
| `css/immersive-v8-gallery.css` | 21057 | 73% | 5690 |
| `css/gallery-v2.css` | 3929 | 72.9% | 1064 |
| `css/interactive-v13-collection.css` | 4327 | 72.6% | 1185 |
| `css/desktop-showroom-v6-workspace.css` | 4292 | 71.9% | 1205 |
| `css/product-v12-presentation.css` | 5629 | 71.9% | 1579 |
| `css/navigation.css` | 3106 | 70.2% | 926 |
| `css/desktop-showroom-v6-gallery.css` | 2864 | 69.8% | 866 |
| `css/mobile-v3.css` | 4630 | 69.5% | 1414 |
| `css/premium-v9-signature.css` | 23018 | 69.5% | 7026 |
| `css/dialog-v3.css` | 4496 | 69.4% | 1378 |
| `css/dreamscape-v5-mobile-interactions.css` | 4922 | 66.7% | 1639 |
| `css/immersive-v11-workspace.css` | 8237 | 66% | 2803 |
| `css/immersive-v8-quick-view.css` | 15596 | 64% | 5622 |
| `css/desktop-showroom-v6-mobile.css` | 2301 | 63.8% | 832 |
| `css/product-card.css` | 2765 | 62.8% | 1029 |
| `css/desktop-showroom-v6-hero.css` | 1785 | 57.6% | 757 |
| `css/layout.css` | 649 | 53% | 305 |
| `css/legacy.css` | 5231 | 52% | 2512 |
| `css/cinematic-v7-gallery-lighting.css` | 1935 | 46.9% | 1027 |
| `css/cinematic-v7-workspace.css` | 2482 | 44% | 1390 |
| `css/grid-entrance.css` | 477 | 42.6% | 274 |
| `css/purchased-motion.css` | 1480 | 31.6% | 1013 |
| `css/toast.css` | 1413 | 0%\* | 1413 |

\* `toast.css` 0% is a capture artifact (no toast fired during the coverage run); it is live — see §4.

---

## 6. Selector conflicts

V13 fixed a real specificity collision (`#grid…gallery--v2/4/6` chains beating the Focus
selectors). For V14 we re-ran the selector liveness scan and the full computed-style snapshot;
**no new collision affects rendering** — the before/after snapshot is byte-identical. Latent
duplicate selectors across legacy layers remain (documented by the liveness JSON) but are
out of scope for a stabilization sprint, which is exactly the moment *not* to re-order the
cascade.

---

## 7. How to reproduce

```
cd <shot dir>
node v14-coverage.js      # -> v14-out/css-coverage.json
node v14-selectors.js     # -> v14-out/selector-liveness.json
node v14-snapshot.js before
# apply changes
node v14-snapshot.js after
node v14-snapshot-diff.js # expect RESULT: IDENTICAL
```
