# UX-05 — Motion, Visual Polish & Regression Recovery

Branch: `feature/motion-auth-reset`
Baseline: `7eeccc453971e57d125b831a1ab4a1929b6b57ad`
Reference: `references/dream-vault-motion-reference.html`

---

## 1. What was wrong, and what fixed it

UX-05 is a recovery milestone: the motion defects listed in the registry were
**real**, they were **pre-existing** (they failed at `2e34d89` *and* at
`1d24b10`), and they are now fixed with runtime evidence for every root
cause.

### 1.1 FUSION-01 `F02-28` / `F02-29` — the hero pointer depth never moved

**Symptom.** `--hero-pointer-x` stayed `0px`; the featured card and the side
card never separated by depth (`dMain: 0, dSide: 0`).

**Evidence.** A real-browser probe of the F02-28 scenario:

```
hero box (viewport): {"x":80,"y":-148,"w":1280,"h":720}
.v9-scene box:      {"x":788,"y":-9,"w":480,"h":450,"cx":1028}
first mouse target : 380,52   -> elementFromPoint: SPAN.nav-brand__tagline
second mouse target: 720,212  -> elementFromPoint: DIV.hero__content
after 2nd move: inline "-5.04px"  mainTx "calc(-50% - 5.796px)"  sideTx "calc(-50% - 9.576px)"
```

The probe's second pointer position is **exactly the hero's horizontal
centre** (`(720 - 80) / 1280 - 0.5 = 0`), so the normalised value was exactly
zero and the cards stood still.

**Root cause.** The depth was normalised against the **hero**, which is
1280px wide — a move across the composition is a rounding error there. The
reference prototype normalises against the **stage** (the 3D showcase, 480px
wide), which is the thing that actually moves.

**Fix.** `setupHeroPointerDepth()` now measures against the stage. The
multiplier (±8) and the clamp are unchanged, so the featured card still
tracks the visual within the F02-27 tolerance (`0.15 × 8 = 1.2px ≤ 2px`).

**Result.** Featured card **5.80px**, side card **9.58px** — different rates,
both above the 3px floor. FUSION-01: **89 / 89**.

### 1.2 FUSION-02 `F01-02` / `F01-04` / `F01-05` — the scroll rail read stale

**Symptom.** At the bottom of the document the bar still read `scaleX(0.5)`
while the page was at `y: 4644` of `max: 4644`.

**Root cause (a) — a frame that never came.** The rail was painted from a
`requestAnimationFrame` scheduled by the scroll handler. A scroll event that
arrives while a frame is already pending does **not** schedule another one,
so one late frame left the rail at the previous ratio for good.

**Root cause (b) — the measurement read a mid-animation position.**
`html { scroll-behavior: smooth }` animated every programmatic
`window.scrollTo()`. The probe, with the smooth scroll, reached only
`y: 457` of a 3753px document 140ms after the scroll; with the scroll made
instant it reaches `y: 3753` and the bar reads `scaleX(1)`.

**Fix (a).** The rail is painted **in the same frame as the scroll**. A scroll
event already fires at most once per frame and the bar is a composited
`scaleX`, so the direct write costs no extra layout pass and no extra frame —
and the rail can never be a frame behind the page it measures.

**Fix (b).** The root stylesheet now scrolls programmatically **instantly**.
The eased navigation the user sees is kept where it belongs: the in-page link
handler requests it explicitly, and the app's own `scrollIntoView` calls
already passed an explicit `behavior`.

**`F01-02` — a test that could not pass.** The check read `+cs.z`, the CSS
Grid/Flex item *ordering* property, which always computes to `auto` on a
`position: fixed` element, so `+cs.z` was `NaN`. It now reads `cs.zIndex`,
the property that actually decides the stacking (400 > 50). The assertion is
unchanged.

**Result.** FUSION-02: **81 / 81**, twice in a row.

### 1.3 FUSION-04 `F04-A02` / `F04-A03` — the coarse-pointer sheet leaked

**Root cause.** The UX-01/UX-02 rules (compact desktop hero, adaptive empty
dashboard) had been added **inside** `css/fusion-04-mobile.css`, whose
contract is that it declares only `min-width` / `min-height` / `will-change`
and that every rule sits inside the coarse-pointer gate. The sheet was
therefore measured to leak layout, colour and typography rules onto fine
pointers.

**Fix.** The rules moved to `css/ux-01-02-compact.css` — the sheet that owns
them — linked at the **same cascade position** (immediately before
`fusion-04-mobile.css`), so not one pixel changed. `fusion-04-mobile.css` is
still the last sheet, so F04-A01 still holds.

**Result.** FUSION-04: **ALL GREEN (111 checks)**.

### 1.4 M2 — three sections stayed invisible

**Symptom.** `all reveals resolved after scroll`, `no invisible sections`,
`reveal attributes cleaned up` — three sections never revealed.

**Root cause (a).** A pending reveal element is `opacity: 0`
(`motion-v16.css`). The IntersectionObserver only ever reports the
**current** intersection state, so an element the reader passed in a single
frame — a fast flick, an anchor jump, a scroll restoration — was never
reported as intersecting, stayed pending, and therefore stayed **invisible**.

**Root cause (b).** The smooth root scroll meant the M2 sweep, which issues a
new `window.scrollTo()` every 70ms, never actually reached the lower part of
the document: each new scroll interrupted the one in flight.

**Fix (a).** A scroll-driven pass reveals every pending element at or above
the lower edge of the viewport — anything the reader has *reached* is shown.
All the reads happen before any write, so it is one layout flush, not one per
element. It runs on **scroll only**: calling it from `render()` would measure
every pending element right after a rebuild, which measured **+6.4ms** on a
100-card render, so that call was removed again (the observer already covers a
card built inside the viewport).

**Fix (b).** The instant programmatic scroll.

**Result.** M2: **31 / 31**. Content can no longer stay hidden because an
animation failed to run.

---

## 2. Visual consistency

### 2.1 The collection rail's truncation — measured, then fixed

The registry recorded the sort select showing "Mới tl" and the search
placeholder clipped to "Tên món, danh mục". The measurement showed why, and
showed that a 280px rail cannot hold the filter set at all:

| select | longest value | needed | room at 280px | room at 320px |
|--------|---------------|--------|---------------|---------------|
| Trạng thái | "Đang để dành" | 93px | 57px ✗ | 215px ✓ |
| Ưu tiên | "Trung bình" | 71px | 57px ✗ | 215px ✓ |
| Danh mục | (user data) | 68px | 57px ✗ | 81px ✓ |
| Sắp xếp | "Ưu tiên thấp trước" | 122px | 57px ✗ | 81px ✓ |
| Tiết kiệm | "Chưa đạt mục tiêu" | 121px | 57px ✗ | 215px ✓ |

**Fix.** The rail is back to **320px** (the width the V11 design itself uses);
the status, priority and savings take the full rail width; the sort's option
*labels* were shortened while its option *values* stayed exactly as they were;
the placeholder is "Tìm món…" with the full sentence kept in the
`aria-label`; and the rail drops the description line that only restates its
heading.

**Result:** zero clipped labels at 1440 / 1024 / 768 / 390 / 320, and no
horizontal overflow at any of them. The rail is also 40px *shorter* than it
was at 280px, because the heading fits on one line.

### 2.2 The Quick View's translucent action bar

On a phone the sticky action bar was `rgba(255,255,255,.97)`, so the title
and price scrolled under it and **ghosted through the buttons** (visible as
pale text behind them in `qa-out/ux04/before-qv-390-note.png`). The bar is now
solid and the soft transition lives in a separate fade strip **above** it, so
no content can show through an action. The panel also gained a scroll inset so
a scrolled-to line clears the sticky header.

### 2.3 The audit of the other surfaces

Header, hero, dashboard, product cards, add/edit dialog, mobile dock were
reviewed at all five widths. No inconsistent spacing, oversized decorative
element, misaligned button, low-contrast text or shadow conflict was found
that a change would have improved; the card's badge treatment is a **tested
contract** (FUSION-03 `F03-B06` / `F03-B07` / `F03-I01`: four distinct
non-transparent status backgrounds, three distinct priority colours, exactly
two badges per card with no ARIA role) and was deliberately left alone.

### 2.4 The mobile advanced-filter panel

At 390px and 320px the fixed dock could cover the lower edge of an expanded
filter panel. While the disclosure is open, the dock now hides and the rail
adds `24px + env(safe-area-inset-bottom)` after the controls. The page's
existing bottom padding and the dock's safe-area positioning remain intact.
The browser audit opened the disclosure, hit each of the five selects and
Clear Filters with real pointer input, and verified Clear Filters resets the
active facet at both widths. All those checks passed.

---

## 3. Performance

`scripts/qa/ux05-perf.js`, same machine, same conditions, one run each.

| items | load | build median | frame median | DOM nodes |
|-------|------|--------------|--------------|-----------|
| 0 | 480ms | 0.7ms | 33.3ms | 646 |
| 10 | 514ms | 12.1ms | 33.4ms | 1029 |
| 50 | 613ms | 45.5ms | 83.4ms | 2132 |
| 100 | 698ms | **94.4ms** | 152.2ms | 3511 |

The build cost is linear at roughly 1ms per card.

**Attribution of the failing gates.** The same benchmark on the untouched
baseline tree `3f1fc4d`, minutes earlier on the same machine:

| tree | render(100) median | F6-6-01 budget (90ms) | M3-16 budget (100ms) |
|------|--------------------|------------------------|------------------------|
| baseline `3f1fc4d` | **92.8ms** | fails | on the line |
| UX-05 tree | **94.4ms** | fails | passes |

The **untouched baseline already fails** these gates on this machine, and the
UX-05 tree is within 1.6ms (1.7%) of it. The gates also flip on the same
tree with the same code depending on load (`F4-6-04` measured 86ms and FAILED
under concurrent load, 45ms and PASSED idle). They are wall-clock
measurements of the machine, not behavioural assertions. **No threshold was
raised and no test was weakened.**

One real regression was found and fixed during this milestone: the first
version of the reveal pass called `revealReached()` from `render()`, which
measured every pending element right after a rebuild and cost **+6.4ms** on a
100-card render. It now runs on scroll only.

---

## 4. Browser QA

`scripts/qa/ux05-browser-qa.js` — **121 / 121**, at 1440, 1024, 768, 390 and
320, desktop pointer and touch:

* no horizontal overflow at any width
* every filter control reachable, **no clipped select label**
* mobile disclosure, all five filter controls and Clear Filters verified with real pointer input; no fixed-dock obstruction at 390px or 320px
* the gallery / focus / board switcher present with ≥44px targets
* search, status filter and price sort all narrow and reorder the collection
* quick add opens with the name focused, the optional group collapsed, and saves
* quick view opens with the close button focused, its action bar opaque, Escape closes it
* marking purchased opens the **confirmation** — it is never bypassed — and the confirmation applies it
* the card actions are reachable by keyboard
* the empty library shows its own state and leads straight into the add form
* reduced motion shows the content and starts no reveal runtime
* export produces a file; the import control accepts JSON

MOTION-06 initially reproduced as **92 / 93** in an isolated run while the
Quick View opening flight was still active. The harness now synchronizes to
the proxy/flight lifecycle and waits for the real drag styles; three isolated
repetitions passed **93 / 93**. This fixes a test timing race without
weakening the assertion. See the known-issues registry for runtime evidence.

Screenshots: `qa-out/ux05/` — `workspace-{1440,1024,768,390,320}.png`,
`filters-open-{390,320}.png`, `filters-clear-{390,320}.png`,
`empty-1440.png`, `reduced-motion-1440.png`.

---

## 5. Files changed

| File | Change |
|------|--------|
| `css/base.css` | The root scroll behaviour is now instant; the eased in-page navigation is requested explicitly by the link handler. |
| `css/immersive-v11-workspace.css` | The rail is 320px; the status / priority / savings facets take the full rail width; the select padding in the rail is tighter; the rail drops its redundant description. |
| `css/dreamscape-v5-mobile-interactions.css` | The fixed dock hides while the advanced-filter disclosure is open. |
| `css/ux-01-02-compact.css` | **New** — the UX-01/UX-02 rules, moved out of the coarse-pointer sheet, at the same cascade position. |
| `css/fusion-04-mobile.css` | The coarse-pointer sheet is back to its contract: two blocks, three property families. |
| `wishlist.html` | The pointer depth is normalised against the stage; the reveal runtime reveals what the reader has reached; the in-page link handler keeps the eased scroll; the rail's sort labels and the search placeholder are shortened; the field classes let the rail give the long-value selects the full width. |
| `scripts/qa/fusion-02-check.js` | `F01-02` reads `cs.zIndex` instead of the `cs.z` grid-ordering property. **The assertion is unchanged** — it now measures the property the contract is about, and it could never have passed before. |
| `scripts/qa/qa-run.js`, `qa-report.js` | **New** — the runner and the machine-readable aggregator. |
| `scripts/qa/ux05-*.js` | **New** — the motion probe, the rail measurement, the performance benchmark and the browser QA harness. The browser audit exercises actual mobile filter pointer targets; MOTION-06 now waits on animation lifecycle and measured drag state. |
| `docs/qa/dream-vault-ux04/known-issues.md` | The registry, updated with the status and the evidence for every entry. |

---

## 6. Recommendation

**GO.**

Motion is reliable again: the hero pointer depth moves at real depth with
different rates per layer, the scroll rail is never stale, the reveal runtime
can no longer strand content, and the coarse-pointer sheet no longer leaks
onto fine pointers. The rail's truncation is gone at every width, with no
horizontal overflow. The render cost is within 1.7% of the untouched
baseline, so the two failing render-cost gates are machine-bound — they fail
on the pristine baseline too — and their thresholds were deliberately left
alone.

The machine-bound render-cost gates remain open and are documented with
baseline evidence. The MOTION-06 sample race is fixed in the harness and
passes repeated isolated runs; no performance budget was changed.
