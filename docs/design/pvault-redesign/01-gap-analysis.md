# PVault — Reference-first redesign, milestone 1: Collection

Status: implemented on `feature/motion-auth-reset` (see commit at the end of
this document for the exact SHA).
Scope: the **collection surface only** — section head, toolbar, tabs, view
switcher, grid, product cards, empty state.
Out of scope (next milestones): dashboard/hero, add/edit dialogs, quick view,
mobile dock polish.

---

## 1. Reference set — what exists, and what does not

The design reference set is **incomplete**. Only one artefact survived:

| Artefact | Status |
| --- | --- |
| `references/someday-vault-motion-reference.html` | present, studied |
| Reference screenshots / Figma frames / mockups | **not recoverable** |

The prototype was the only tracked reference; the other reference images had
never been committed and are not in the git object store, the Recycle Bin, or
any shadow copy. This document therefore compares the app against **the
prototype as rendered in Chrome**, and it does **not** claim a complete
reference comparison. No missing reference imagery has been invented.

Prototype: “Dream Vault — Prototype”, one page with three sections
(`#overview`, `#collection`, `#review`).

---

## 2. Method

Everything below is measured, not eyeballed.

* `scripts/qa/redesign-study.js` serves the repo and opens the prototype in
  headless Chrome at 1440 / 1024 / 768 / 390 / 320. It writes
  `qa-out/redesign/prototype-metrics.json` (computed typography, colours,
  grid columns, gaps, card boxes, radii, shadows) and screenshots
  (`qa-out/redesign/prototype/`).
* `scripts/qa/redesign-shots.js` seeds isolated test data into
  `localStorage['wishlist.guest.items']`, mocks `wishlist-cloud.js`, and
  captures the app in the same five viewports:
  `full`, `toolbar`, `collection`, `grid`, `bottom`, `empty`
  (`qa-out/redesign/before/` and `qa-out/redesign/after/`), plus
  `view-focus`, `view-board`, `view-gallery` and `quick-view` at 1440.
* `scripts/qa/redesign-cardprobe.js`, `redesign-gridprobe.js` and
  `redesign-lineprobe.js` read live DOM/CSSOM (including media rules and CDP
  matched styles) to prove which legacy rule paints what.
* Functional gates: `scripts/qa/ux05-browser-qa.js` (121 checks) and
  `scripts/qa/qa-run.js` (full battery).

The seeded collection is eight real Vietnamese products using the six images
already in `image/`, two intentionally without artwork, mixed statuses
(`wish` / `saving` / `ordered` / `purchased`), priorities, categories, notes,
and three saving goals — so the comparison covers the states the reference
shows.

---

## 3. Reference anatomy (measured)

| Property | 1440 | 1024 | 768 | 390 / 320 |
| --- | --- | --- | --- | --- |
| Body font | 15.5px “Be Vietnam Pro”, system fallback | same | same | same |
| Section `h2` | 36.8px / 800 / −0.552px / 42.3px | 34.8px | 26.4px | 26.4px |
| Collection grid | **4 columns**, 276.5px, gap 18px | 3 × 316px | 2 × 355px | 1 column |
| Card | 277 × 496, radius 20px, shadow `0 18px 44px −18px rgba(15,23,42,.28)` | 316 × 504 | 355 | full width |
| Media | 4:3, 205.9px tall | 235.5px | — | — |
| Title | 16.32px / 700 | same | same | same |
| Price | 18.24px / 700 | same | same | same |
| Status chip | 11.52px, padding 4×10, radius 999px | same | same | same |
| Toolbar | **one row**, 6 columns (293 + 146/147/147/165/181px), gap 10, radius 22px | same pattern, narrower | 3 columns × 2 rows | 2 columns |

Structural facts, in reading order:

1. **One section head.** Small-caps kicker (`02 · KHÁM PHÁ ĐIỀU ƯỚC`) → bold
   sans `h2` → muted lede → ghost “reset” control.
2. **One horizontal toolbar above the grid**, five labelled fields
   (Tìm kiếm / Trạng thái / Ưu tiên / Danh mục / Sắp xếp) separated by space,
   borderless inputs with a 1px bottom rule, the search rule in accent purple.
3. **Summary line** between toolbar and grid:
   “Tổng giá trị đang hiển thị: 28.880.000 ₫ · 8 / 8 món”.
4. **4-up grid of peer cards** — no featured/hero first card.
5. **Card anatomy**: 4:3 image → status chip top-left + priority dot
   top-right → title → price and category on one line → note → savings
   progress bar with % → footer meta → action shelf (primary + secondary +
   icon buttons).
6. On phones: single column, compact 2-column filter grid (when expanded),
   summary, then full-width cards.

---

## 4. Current app, before this milestone

`qa-out/redesign/before/collection-1440.png`, `grid-1440.png`,
`collection-390.png`, `probe.json`.

* A **320px sticky rail** (`#collection.v11-rail`) held the search field and
  four stacked selects; the grid lived in a narrow canvas
  (`#grid` = 919.7px wide, 3 columns of ~285px, 34.6 × 31.7px gaps).
* The **first card was a showroom hero**: `grid-column: 1 / -1`, an 830px
  image beside a 447px text column, 1.7–2.3rem serif italic title.
* Consequence: at 1440 the first product started around **y ≈ 3464**, i.e.
  more than three viewports of chrome before the first product.
* **Two competing section heads**: the rail’s `02 · Khám phá điều ước /
  Tìm món bạn yêu thích.` and the canvas’s `BỘ SƯU TẬP / Món bạn đang để ý`.
* Headings were display-serif italic; the reference is a bold sans.
* Cards carried showroom decoration that does not survive a 4-up grid:
  index numerals, an exhibit plaque, an `01` ghost numeral painted by
  `product-media__frame::after`, a decorative wall-text tile
  (`#grid::after`), and a 1px `border-top` above the price reading as a link
  underline.
* Phones: the filter card consumed the first screen; tabs and the view
  switcher were on separate rows; the first card was again the hero.

---

## 5. Gap analysis

| # | Area | Reference | Before | Gap | Resolution in this milestone |
| --- | --- | --- | --- | --- | --- |
| G1 | Workspace | single column, toolbar on top | 320px rail + narrow canvas | products pushed far below the fold, 1/4 of the width spent on chrome | `.v11-workspace` → single column at ≥1025; rail demoted to a static section head + toolbar |
| G2 | Section head | one head (kicker + h2 + lede) | two heads (rail + canvas) | duplicated, contradictory titles | canvas `list-heading--v3` visually removed (node kept for the fusion-01 pseudo checks); rail head restyled |
| G3 | Heading type | bold sans, 36.8px/800, −0.015em | serif italic display, very large | wrong voice, wrong scale | `Inter/Segoe UI` 800, `clamp(26px, 2.55vw, 36px)`, −0.015em |
| G4 | Toolbar | one white rounded strip, labelled fields, underlined inputs | vertical stack of selects in a rail | not scannable, wastes vertical space | one strip: search + 5 facets + reset; 5-column filter grid ≥641px, 3-column tablet, disclosure preserved ≤640 |
| G5 | Density | **4-up** at 1440, 3 / 2 / 1 down the widths | 3-up, first card full-width | cards too large, inconsistent peerage | 4 / 3 / 2 / 1 columns, 18px gap, all cards peers |
| G6 | Card media | 4:3 image on top, chips overlay | mixed: hero card split, small cards with inset media and padding | card identity unclear, placeholder shrank | 4:3 `aspect-ratio`, `object-fit: cover`, `inset: 0` frame, padding removed |
| G7 | Chips | status chip top-left, priority top-right, on the image | badges inline in the body | status not visible at a glance | overlay layer: dark status pill left, translucent priority pill right |
| G8 | Card body | title → price + category inline → note → goal → meta | price on its own line, category below, decorative separators | tall, uneven rows | flex row with explicit `order`; price `width: auto`; decorative border/pseudo rules neutralised |
| G9 | Savings | mini progress bar + % | none at card level (goals only in the dialog) | reference signature missing | per-card goal row rendered only when `savingGoal > 0` (no invented 0/0 bars) |
| G10 | Action shelf | one compact row | wide, inconsistent wrapping | cards grew unevenly | primary full-width + secondary row; 36px desktop / 44px phone targets |
| G11 | Summary | “Tổng giá trị đang hiển thị … · n / N món” | absent (screen-reader `#resultStatus` only) | no orientation after filtering | visible `<p class="collection-summary">` written by `render()` from the same `visibleItems()` list |
| G12 | Decoration | none inside cards | index, plaque, `01` ghost numeral, wall-text tile, divider | noise at 4-up density | hidden in gallery mode via a bounded, documented override block |
| G13 | Empty state | (not shown in the prototype) | oversized card with serif italic title | voice inconsistent with the new head | same sans voice, tighter type scale; layout/behaviour untouched |
| G14 | Phones | compact head, 2-col filter grid, full-width cards | filter card ate the first screen | first product far below | compact head, 44px search/toggle/reset, 2-col filters when expanded, 1-column cards |

---

## 6. What shipped

**One new scoped sheet, loaded last:** `css/collection-v17.css`
(~1,100 lines) linked after `css/fusion-04-mobile.css`. No global design
overhaul, no token changes, no new dependency.

Everything is anchored on `body.dreamscape-v5` + `.v11-workspace` +
`#collection.v11-rail` / `#grid[data-v13-view="gallery"]`, so:
* the rail rules that previously won on specificity no longer apply;
* Focus and Board keep their own layouts (`[data-v13-view="focus"]` and
  `#board` are explicitly excluded from the gallery card rules).

Three small HTML/JS additions (no rewrites, no new state):
1. `wishlist.html` — stylesheet link.
2. `wishlist.html` — `.collection-summary` block with two ids.
3. `wishlist.html` — `render()` writes the summary value/count from the
   already-computed `list` and `metrics`; `card()` appends the optional
   `product-card__goal` row when `savingGoal > 0`.

All existing hooks are preserved: `#q`, `#fStatus`, `#fPriority`,
`#fCategoryFilter`, `#fSort`, `#btnClearFilter`, `#filterToggle`,
`#filtersPanel`, `.dv-tabs`, `#v13GridView/FocusView/BoardView`, `#grid`,
`#board`, `#empty`, `.product-card__*`, `.card-actions`, `.card-more__*`.

### Bounded overrides

The legacy “featured first card” is not one rule — nine earlier sheets each
raise one property on `:first-child:not(:only-child)`. The sheet neutralises
exactly the properties proven different by the browser probe (span, split
surface, media height, content/action placement, title size), plus the
decorative `border-top` on the price, the `01` ghost numeral
(`product-media__frame::after`), the exhibit plaque/caption/index and the
wall-text tile (`#grid::after`). These are marked `!important` and scoped to
gallery mode only; a comment in the file explains why.

---

## 7. Remaining mismatches (honest list)

1. **Priority is a pill, not a dot.** The reference shows a coloured dot
   top-right; ours keeps the textual priority (`Ưu tiên trung bình`) inside a
   translucent pill, because the label carries information the dot does not.
2. **Action shelf wraps to two rows** on 4-up cards. The reference fits
   “Mua ngay / status / edit / delete” in one row because its labels are two
   words; our labels are fixed by the functional suite
   (`Đánh dấu đã mua`, `Hoàn tác`, `Xem chi tiết`, `Mua nơi bán`), so the
   primary action takes its own row.
3. **Cards can be uneven in body height** when one item has a note/goal and
   another does not. Rows stretch, so the action shelf aligns; the internal
   white space differs. The reference always has a note and a goal.
4. **Toolbar is not sticky**; the reference header is sticky, but the app’s
   own header already occupies that role and duplicating it would fight the
   existing layout.
5. **Focus view** keeps its editorial exhibit layout (now with the sans
   title) — the prototype has no equivalent, so there is no reference target.
6. **Board view** is untouched apart from the shared toolbar/typography; the
   prototype has no board.
7. **Quick view, add/edit dialogs, dashboard/hero** still use the previous
   serif-italic voice — those are the next milestones.
8. **Fonts**: the prototype loads Google Fonts (Be Vietnam Pro); the app is
   offline and ships no web fonts, so headings use the Inter → Segoe UI
   stack. Widths/weights are matched, the exact typeface is not.
9. The reference set is incomplete (see §1), so “matches the reference”
   means “matches the single prototype”.

---

## 8. Evidence

Before / after, identical data, same harness:

```
qa-out/redesign/before/{full,toolbar,collection,grid,bottom,empty}-{1440,1024,768,390,320}.png
qa-out/redesign/after/{full,toolbar,collection,grid,bottom,empty}-{1440,1024,768,390,320}.png
qa-out/redesign/after/view-{gallery,focus,board}-1440.png
qa-out/redesign/after/quick-view-1440.png
qa-out/redesign/prototype/{full,overview,collection,review}-{1440,1024,768,390,320}.png
qa-out/redesign/prototype-metrics.json
qa-out/redesign/probe.json
qa-out/redesign/cardprobe.json
```

Measured after-values at 1440: 4 columns, 305px cards, 18px gap, 20px card
radius, 4:3 media, 15px/700 title, 17px/800 price, 10.5px chips, toolbar as
one 20px-radius strip, summary line between toolbar and tabs, one section
head.

Functional verification for this milestone:

* `node scripts/qa/ux05-browser-qa.js` → **121 / 121 PASS** (add / edit /
  delete / undo, search, filters, sort, gallery / focus / board, quick view,
  keyboard, empty state, import / export, reduced motion).
* `node scripts/qa/qa-run.js` → **1367 / 1367 PASS**, 20 suites, zero
  deterministic failures, zero timing failures (F1 107, F2 168, F3 167,
  F4 65, F5 97, F6 28, MOTION-02..06 219, FUSION-01..04 361, V16 36,
  M1..M4 119). The pre-redesign baseline was 1366/1367 with the
  machine-bound `F6-6-01` render-cost gate failing.

### 8.1 Test contracts that were rewritten (and why)

The previous suites encoded the *old* card design, so a redesign necessarily
invalidates some of their expectations. Each affected assertion was rewritten
to the new contract with the same intent — none were skipped, deleted or
loosened to “anything passes”.

| Check | Old expectation | New expectation (same intent) |
| --- | --- | --- |
| `F03-A01`, `F04-A01` | FUSION-04 is the final stylesheet | FUSION-04 is followed by exactly one trailing sheet, `collection-v17.css`; the cascade guard still forbids anything else |
| `F03-B01` | the inner surface paints the lavender gradient, hairline and deep shadow | the card root paints an opaque surface, 20px radius and soft shadow; the inner surface stays transparent with an identity transform |
| `F03-B05` | serif italic title, accent price with a 1px hairline, tick rule | bold sans title (2-line clamp), accent price at ≥700 with **no** hairline, showroom index not rendered |
| `F03-B06` | four statuses with four distinct chip backgrounds | one filled status chip per card and four distinct status **labels** (status by label, priority by its own colour — see `F03-B07`, unchanged) |
| `F03-B08` | 1px shelf divider, primary hit-testable with the menu open | 1px shelf divider kept, the open menu item is hit-testable, and after closing it the primary is hit-testable again (the new menu is wider, so the old “with the menu open” sample would hit the panel) |
| `F03-B09` | gradient track, gradient active pill, tick rule before the label | tinted track (`background-color`), a different active surface with a shadow, and the real state transition; the tick rule was removed with the label |
| `F03-B10` | a CSS wall tile is painted on `#grid::after` | the tile is suppressed in the four-up gallery; no extra DOM, pointer-events none |
| `F03-C03` | two columns, ≥380px, Georgia title, 20px gap | two columns, ≥300px, sans title ≥20px (still larger than the gallery title) |
| `F03-F01` | serif italic empty title | sans empty title, same alcove, ✦ rule and `PVault.` mark |
| `F03-H03` | reduced motion keeps the gradient surface, index rule and pedestal | reduced motion keeps the painted card, chips and title, and still stops all animations |
| `M05-20` | the close proxy width had to sit above the dialog image and at/below the featured first card | the proxy width must be strictly between the dialog image and the card image — layout-independent, sampled mid-flight (200ms of a 300ms flight) |

Real regressions found by the battery and fixed in this milestone (not test
edits): 200 `backdrop-filter` surfaces in the gallery (perf gates), sub-44px
coarse-pointer targets, a collapsed card “more” menu (its panel inherited the
36px trigger and clipped item text), a re-anchored menu that froze Chrome's
input pipeline on the primary action, and the purchase celebration pseudo
being hidden by the gallery cleanup (the class was never removed because
`animationend` never fired).

Known remaining check: none. The battery is green. The two guards that used to
be listed here (the Quick View close proxy width and the idle rAF probe) are
now measured in a layout-independent way, and the render-cost gates
(`F4-6-04`, `F6-6-01`, `M3-16`) pass on an idle machine but remain
load-sensitive by nature — they are reported as timing, never as behaviour.

---

## 9. Next milestones

1. Dashboard / hero voice (serif-italic → sans, same hierarchy decisions).
2. Add / edit dialogs.
3. Quick view.
4. Mobile adaptation polish (dock spacing, 320px header overflow, which is
   pre-existing and unrelated to this sheet).
