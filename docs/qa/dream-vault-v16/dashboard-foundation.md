# Dream Vault V16.1 — Dashboard 2.0 Foundation

**Scope of F1:** metric contract + design tokens + component specification.
Nothing beyond the Ownership Progress block is built yet. F2 builds the
remaining components against this contract.

**Non-negotiable:** the Light Lavender system stays. The dark-purple dashboard
in the reference image is **not** copied — not its palette, not its density,
not its elevation model.

---

## 1. Metric contract (implemented in F1)

Everything the dashboard renders comes from one object shape. No component is
allowed to add up prices or count items on its own.

```js
computeMetrics(list) -> {
  totalCount,      // list.length            — whole collection
  ownedCount,      // status === "purchased"
  pendingCount,    // everything else
  ownedValue,      // Σ price of purchased items
  pendingValue,    // Σ price of every item not yet purchased
  trackedValue,    // ownedValue + pendingValue
  progress,        // ownedCount / totalCount, 0 when totalCount === 0
  progressPercent  // Math.round(progress * 100)
}
```

Two entry points, same shape:

| Function | Source | Used by |
| --- | --- | --- |
| `globalMetrics()` | the whole `items` array | KPI cards, Ownership Progress, every dashboard widget |
| `filteredMetrics()` | `visibleItems()` (search + filters + sort) | the “Đang hiển thị x trên y món” status line only |

**Rules**

1. Search, filter and sort **never** move a global number. They only change
   `filteredMetrics()`.
2. `totalCount` is `items.length`, never the visible count.
3. Missing, negative, non-finite or non-numeric prices count as `0` — a KPI can
   never become `NaN`.
4. `totalCount === 0` ⇒ `progress === 0` (never `NaN`, never a division error).
5. `ownedValue` is the **recorded list price** of owned items. Until F2 stores an
   actual paid amount, the UI must not call it “spent” — it is “giá trị đã sở hữu”.
6. No component writes sample/demo data. Empty means empty.

---

## 2. Design tokens

The brand palette already exists in `css/dreamscape-v5-tokens.css` and stays the
single source of truth. `css/dashboard-v16.css` only **names the dashboard roles**
so components stop hard-coding colours.

### 2.1 Foundation (from the brand palette)

| Role | Token | Value |
| --- | --- | --- |
| Background | `--dv-bg` | `#F8F6FF` |
| Surface | `--dv-surface` | `#FFFFFF` |
| Secondary surface | `--dv-surface-2` | `#F3EFFF` |
| Accent | `--dv-accent` | `#6850BC` |
| Accent (hover/press) | `--dv-accent-hover` | `#543F9E` |
| Highlight | `--dv-highlight` | `#A88BF7` |
| Ink | `--dv-ink` | `#19152C` |
| Muted ink | `--dv-muted` | `#625979` |
| Mist | `--dv-mist` | `#DED5FF` |
| Border | `--dv-border` | `#E5DDF6` |

### 2.2 Shapes, elevation, spacing, motion

| Role | Token | Value |
| --- | --- | --- |
| Card radius | `--dv-radius-card` | `22px` |
| Inner radius | `--dv-radius-inner` | `16px` |
| Pill radius | `--dv-radius-pill` | `999px` |
| Elevation 1 | `--dv-elev-1` | `--dream-shadow-soft` |
| Elevation 2 | `--dv-elev-2` | `--dream-shadow-glass` |
| Gap steps | `--dv-gap-1..4` | `8 / 12 / 16 / 24 px` |
| KPI figure | `--dv-text-kpi` | `clamp(22px, 2.2vw, 30px)` |
| Label | `--dv-text-label` | `11px`, tracking `.12em`, uppercase |
| Caption | `--dv-text-caption` | `12.5px` |
| Motion | `--dv-motion` | `--dream-motion-normal` |
| Easing | `--dv-ease-out` | `--dream-ease` |

### 2.3 Semantics

Status colours are traceable to what the cards already render, so a dashboard
chip and a card chip never disagree.

| Role | Token | Value | Source |
| --- | --- | --- | --- |
| Status: wish | `--dv-status-wish` | `#6850BC` | `badge.b-wish` |
| Status: saving | `--dv-status-saving` | `#8B7ED8` | `badge.b-saving` |
| Status: ordered | `--dv-status-ordered` | `#A88BF7` | `badge.b-ordered` |
| Status: purchased | `--dv-status-purchased` | `#19152C` | `badge.b-purchased` |
| Soft chips | `--dv-status-*-soft` | `#E8EDF1 / #DCECFF / #EFE4FF / #DFF3E6` | `legacy.css` |
| Priority: low / medium / high | `--dv-priority-*` | `#9A93AD / #8B7ED8 / #B3261E` | `.quick-view__ring--p-*` |
| Positive / negative | `--dv-positive` / `--dv-negative` | `#2F7D5B` / `#B3261E` | new |

**Data-visualisation ramp** — sequential lavender, ordered so adjacent slices
stay distinguishable; slot 1 is the accent so the primary metric reads as brand.

```
--dv-chart-1 #6850BC   --dv-chart-2 #8B7ED8   --dv-chart-3 #A88BF7
--dv-chart-4 #C7BEF2   --dv-chart-5 #DED5FF
```

**Hard rules**

- Never encode state with colour alone; every coloured element carries a label,
  an icon or an `aria-*` value.
- No purple-on-purple text. Text on `--dv-accent` is `#FFFFFF`; text on
  `--dv-surface` is `--dv-ink` or `--dv-muted`.
- Body text contrast ≥ 4.5:1. `--dv-muted` on `--dv-surface` is 6.9:1.
- Numbers always use `font-variant-numeric: tabular-nums` so figures do not
  jitter when a count changes.

---

## 3. Layout contract

Dashboard grid lives inside the existing `.dashboard-panel` section, above the
collection section (`#collection`), inside a `[data-dv-section]` element so the
V16 reveal system already applies.

| Breakpoint | Grid |
| --- | --- |
| ≥ 1200px | 12-col, 24px gutter. KPI row 3-up; progress full width |
| 768–1199px | 6-col, 20px gutter. KPI row 3-up; progress full width |
| < 768px | 1-col, 16px gutter. KPI stacked; progress full width |

Ownership Progress is **always** its own full-width row — it summarises the whole
collection and must never be squeezed into a KPI column.

---

## 4. Component contract

Each entry gives the data source (from `globalMetrics()`), the DOM contract, the
states that must be handled, and the behaviour that must not regress.

### 4.1 KPI Card — *built in F1*

- **Data:** `pendingValue`, `ownedValue`, `totalCount`.
- **DOM contract (existing markup, reused):**
  `.stat-card` › `.stat-card__header` › (`.stat-card__label`, `.stat-card__icon`) +
  `.stat-card__value` (id `sumTotal` / `sumSpent` / `sumCount`) +
  `.stat-card__description`.
- **Copy contract**
  - Card 1 — label **“Giá trị chưa mua”**, value `fmtMoney(pendingValue)`,
    description “Tổng giá của tất cả món chưa mua”.
  - Card 2 — label **“Giá trị đã sở hữu”**, value `fmtMoney(ownedValue)`,
    description “Tổng giá ghi nhận của món đã mua — chưa phải chi tiêu thực tế”.
  - Card 3 — label **“Bộ sưu tập”**, value `` `${totalCount} món` ``,
    description “Tổng số món trong bộ sưu tập”.
- **States:** `totalCount === 0` ⇒ `0 ₫` / `0 ₫` / `0 món`, never blank and never
  `NaN`.
- **Do not:** rename card 2 to “Đã chi” until F2 stores a real paid amount.
- **A11y:** values are text, not colour-coded. The group keeps
  `role="group"` + `aria-label="Thống kê wishlist"`.

### 4.2 Ownership Progress — *built in F1*

- **Data:** `ownedCount`, `totalCount`, `progressPercent`.
- **DOM contract:**
  `.dv-progress` (id `dvProgress`) › `.dv-progress__head` ›
  (`.dv-progress__label`, `.dv-progress__value` id `dvProgressValue`) +
  `.dv-progress__track` (id `dvProgressTrack`, `role="progressbar"`,
  `aria-valuemin="0"`, `aria-valuemax="100"`, `aria-valuenow`, `aria-valuetext`)
  › `.dv-progress__fill` (id `dvProgressFill`) + `.dv-progress__caption`
  (id `dvProgressCaption`).
- **Behaviour:** `fill.style.width = percent + '%'`; caption reads
  `“{ownedCount} trên {totalCount} món đã sở hữu.”`; `aria-valuetext` mirrors
  `“{percent}% — {ownedCount} trên {totalCount} món đã sở hữu”`.
- **States:** `totalCount === 0` ⇒ `0%`, width `0%`, caption
  “Chưa có món nào trong bộ sưu tập.” Never `NaN`.
- **Motion:** width transition only, disabled under `prefers-reduced-motion`.
- **Do not:** use the bar to show the *filtered* share. It is a collection-wide
  truth and must ignore filters.

### 4.3 Status Distribution — *F2*

- **Data:** count per `STATUSES` key, computed from `items` (not from
  `visibleItems()`); denominator is `globalMetrics().totalCount`.
- **Shape:** four segments on the `--dv-chart-*` ramp, ordered wish → saving →
  ordered → purchased so “further along” is further right.
- **DOM contract:** one `.dv-dist` block containing `.dv-dist__bar`
  (`role="img"`, `aria-label` summarising every segment) plus a
  `.dv-dist__legend` list where **each legend row is the accessible unit**
  (`.dv-dist__item` › label + `count` + `percent`). Colour is decoration only.
- **States:** zero items ⇒ single `--dv-surface-2` track with no segments and the
  caption “Chưa có món nào để phân bố.”; a status with `0` still appears in the
  legend (with `0`) so the legend order never reshuffles.
- **Do not:** use a pie chart. Segments must be readable at 320px.

### 4.4 Category Breakdown — *F2*

- **Data:** `items` grouped by `category` (items with an empty category fold into
  a single “Chưa phân loại” bucket). Ranked by count, then by `pendingValue`.
- **Shape:** horizontal bar list, max 6 rows + “Khác” aggregate. Bar length is
  the share of `totalCount`.
- **DOM contract:** `.dv-breakdown` › `.dv-breakdown__row` ›
  (`.dv-breakdown__name`, `.dv-breakdown__bar`, `.dv-breakdown__value`).
  Values are text, not only bar length.
- **States:** no categories ⇒ the block is removed from the DOM (not an empty
  shell). One category ⇒ bar reads 100% and rows stay aligned.
- **Do not:** re-use the same `--dv-chart-*` slot for two rows in the same chart.

### 4.5 Priority Widget — *F2*

- **Data:** count + `pendingValue` per `PRIORITIES` key, from `items`.
- **Shape:** three stacked chips on `--dv-priority-*`, each showing count and
  pending value; the highest rank present gets the accent outline.
- **DOM contract:** `.dv-priority` › `.dv-priority__item` with
  `data-priority="low|medium|high"` and an accessible name of the form
  `“Ưu tiên {label}: {count} món, {fmtMoney(pendingValue)}”`.
- **Interaction:** activating a chip applies that priority to `#fPriority` and
  calls `renderImmediately()` — it filters the **collection view only** and must
  leave every KPI untouched.
- **States:** all count 0 ⇒ widget hidden.

### 4.6 Quick Actions — *F2*

- **Data:** none (pure navigation).
- **Actions:** `+ Thêm món` (reuses `openForm(null)`), `Xóa bộ lọc`
  (reuses `#btnClearFilter`), `Xuất JSON` / `Nhập JSON` (reuse `exportJson` /
  `importJson` — do not fork the logic), `Đánh dấu đã mua` for the highest
  priority unpurchased item.
- **DOM contract:** `.dv-actions` › `<button class="dv-actions__btn">` — always
  real `<button>` elements, never clickable `<div>`s.
- **A11y:** every button has a visible label; icon-only variants are forbidden;
  focus-visible ring comes from the global `:focus-visible` rule.
- **Do not:** put destructive actions in Quick Actions. Delete stays on the card,
  behind its own `confirm()`.

---

## 5. Component build order for F2

1. Status Distribution (uses only existing status data).
2. Priority Widget (unlocks the “what should I buy next” answer).
3. Category Breakdown (needs the “Chưa phân loại” bucket defined above).
4. Quick Actions (last — it only wires existing handlers).
5. Purchase Flow (record real paid amount/date/store, then split
   `ownedValue` into *recorded* vs *actual*).

Each step must add tests in the same style as F1: drive the real entry point,
assert the observable number, and prove the KPI did not move.
