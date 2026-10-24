# Known Issues Registry — Dream Vault

Branch: `feature/motion-auth-reset`
Baseline for this milestone: `7eeccc453971e57d125b831a1ab4a1929b6b57ad`

Every entry records whether it is **fixed**, **open**, or **deferred**, and
the evidence that proves it. "Pre-existing?" is answered by re-running the
check against two older trees:

| Tree | SHA | Meaning |
|------|-----|---------|
| pre-6 | `2e34d89` | the branch before the six design commits landed on the remote |
| remote-6 | `1d24b10` | the branch HEAD the UX-05 milestone started from |

A defect that fails on **both** trees cannot have been introduced by UX-04 or
UX-05.

---

## 1. FUSION-01 `F02-28` / `F02-29` — hero pointer depth

| | |
|---|---|
| Status | **FIXED in UX-05** — 89 / 89 |
| Symptom | `--hero-pointer-x` stayed `0px`; the featured and side cards never separated by depth (`dMain: 0, dSide: 0`) |
| Pre-existing? | Yes — failed at `2e34d89` **and** `1d24b10` |
| Root cause | The depth was normalised against the **hero**, which is 1280px wide. A pointer move across the composition is a rounding error there: the FUSION-01 probe's second position sits exactly at the hero's horizontal centre, so the normalised value was exactly `0` and the cards stood still. The reference prototype normalises against the **stage** (the 3D showcase), which is the thing that actually moves. |
| Fix | `setupHeroPointerDepth()` now measures the pointer against the stage (`(clientX - stage centre) / stage width`), the same model as `references/someday-vault-motion-reference.html`. The multiplier and the ±8px clamp are unchanged, so the featured card still tracks the visual within the F02-27 tolerance (0.15 × 8 = 1.2px ≤ 2px). Measured after the fix: the featured card moves 5.80px and the side card 9.58px — different rates, both above the 3px floor. |

## 2. FUSION-02 `F01-02` / `F01-04` / `F01-05` — scroll progress rail

| | |
|---|---|
| Status | **FIXED in UX-05** — 81 / 81 |
| Symptom | The rail was not provably above the sticky header; the bar did not reach its final value at the end of the document; the "transform only" contract could not be read |
| Pre-existing? | Yes — failed at `2e34d89` **and** `1d24b10` |
| Root cause | Two separate causes.<br>**(a)** The rail was painted from a `requestAnimationFrame` scheduled by the scroll handler. A scroll event that arrives while a frame is already pending does not schedule another one, so a single late frame left the rail stuck at the previous ratio for good — measured: at the bottom of the document the bar still read `scaleX(0.5)`.<br>**(b)** `html { scroll-behavior: smooth }` made every programmatic `window.scrollTo()` animate, so a measurement taken 140ms after a scroll read a mid-animation position (`y: 457` of a 4644px document). |
| Fix | **(a)** The rail is now painted **in the same frame as the scroll**. A scroll event already fires at most once per frame and the bar is a composited `scaleX`, so the direct write costs no extra layout pass and no extra frame — and the rail can never be a frame behind the page it measures.<br>**(b)** The root stylesheet now scrolls programmatically **instantly**. The user-facing eased navigation is kept: it is requested explicitly by the in-page link handler, which is the only place a slow scroll is wanted. |
| Note on `F01-02` | The check read `+cs.z` — the CSS Grid/Flex item *ordering* property, which always computes to `auto` on a `position: fixed` element, so `+cs.z` was `NaN` and the check could never pass for **any** implementation. It now reads `cs.zIndex`, which is the property that actually decides whether the rail is drawn above the sticky header (400 > 50). The assertion itself is unchanged. |

## 3. FUSION-04 `F04-A02` / `F04-A03` — coarse-pointer ownership

| | |
|---|---|
| Status | **FIXED in UX-05** — ALL GREEN (111 checks) |
| Symptom | The Quick View mobile sheet declared more than the two allowed property families, and its rules were not all inside the coarse-pointer gate |
| Pre-existing? | Yes — the offending block was added by `1d24b10` (UX-01/UX-02), and it fails at `2e34d89` **and** `1d24b10` |
| Root cause | The UX-01/UX-02 rules (compact desktop hero, adaptive empty dashboard) were added **inside** `css/fusion-04-mobile.css`, whose contract is that it declares only `min-width` / `min-height` / `will-change` and that every rule sits inside `@media (hover: none), (pointer: coarse)`. The sheet was therefore measured to leak layout, colour and typography rules onto fine pointers. |
| Fix | The rules moved to `css/ux-01-02-compact.css`, the sheet that owns them, linked at the **same cascade position** (immediately before `fusion-04-mobile.css`), so not one pixel changed — only the ownership was corrected. `fusion-04-mobile.css` is still the last sheet in the cascade, so F04-A01 still holds. |

## 4. M2 — the reveal runtime

| | |
|---|---|
| Status | **FIXED in UX-05** — 31 / 31 |
| Symptom | Three sections stayed unrevealed: `all reveals resolved after scroll`, `no invisible sections`, `reveal attributes cleaned up` |
| Pre-existing? | Yes — `28 PASS / 3 FAIL` at `2e34d89` **and** at `1d24b10` |
| Root cause | Two causes, both real.<br>**(a)** A pending reveal element is `opacity: 0` (motion-v16.css). The IntersectionObserver only ever reports the **current** intersection state, so an element the reader passed in a single frame (a fast flick, an anchor jump, a scroll restoration) was never reported as intersecting and stayed pending — and therefore stayed **invisible**.<br>**(b)** `html { scroll-behavior: smooth }` meant that the M2 scroll sweep, which issues a new `window.scrollTo()` every 70ms, never actually reached the lower part of the document: each new scroll interrupted the one in flight. |
| Fix | **(a)** A scroll-driven pass now reveals every pending element at or above the lower edge of the viewport — anything the reader has *reached* is shown. It runs on scroll only (never from `render()`: measuring the pending elements right after a rebuild forces a layout of every one of them, measured at **+6.4ms** on a 100-card render). All the reads happen before any write, so it is one layout flush, not one per element.<br>**(b)** The instant programmatic scroll above. |
| Guarantee | Content can no longer remain hidden because an animation failed to run. |

## 5. Sidebar text truncation

| | |
|---|---|
| Status | **FIXED in UX-05** |
| Symptom | In the collection rail the sort select showed "Mới tl" and the search placeholder was clipped to "Tên món, danh mục" |
| Cause | A two-column filter grid in a 280px rail leaves each select about **57px** of text room once the select's own padding (12px a side) and its arrow are taken off. The measured longest labels are "Chưa đạt mục tiêu" (121px), "Đang để dành" (93px), "Trung bình" (71px) and "Ưu tiên thấp trước" (122px) — none of them fit, so the labels were clipped mid-word. |
| Fix | Measured, not guessed.<br>• The rail is back to **320px**, the width the V11 design itself uses. At 280px the filter set cannot be shown without clipping at any column count that keeps the rail short enough to fit under the fixed header.<br>• The status, the priority and the savings facet take the **full rail width**; the category and the sort share the remaining row. Their longest labels now have 81–215px of room.<br>• The sort's option labels were shortened ("Mới nhất", "Cũ nhất", "Giá tăng", "Giá giảm", "Cao nhất", "Thấp nhất"). The option **values** are unchanged, so `visibleItems()` and the QA suites are unaffected.<br>• The search placeholder is now "Tìm món…"; the full sentence stays in the input's `aria-label`.<br>• The rail's redundant description line is dropped in the rail only (the heading already says "Tìm món bạn yêu thích."); the tablet and phone layouts keep it.<br>Result: **zero clipped labels** at 1440, 1024, 768, 390 and 320, and no horizontal overflow at any of them. |
| Trade-off | The rail is 320px rather than the 260–280px named in the UX-03 brief. The measurement is the reason: at 280px the filter set does not fit. The rail is also 40px **shorter** than it was at 280px (the heading fits on one line), and it still fits under the fixed header. |

## 6. `F4-6-04` / `F6-6-01` / `M3-16` — the render-cost gates

| | |
|---|---|
| Status | **OPEN — machine-bound, not a regression** |
| Symptom | "render(50 items) is within 35% of the pre-F4 baseline", "render(100) stays cheap" (under 90ms and under 100ms) |
| Evidence | Measured with `scripts/qa/ux05-perf.js` on the **untouched** baseline tree `3f1fc4d` and on the UX-05 tree, same machine, same conditions:<br><br>· baseline `3f1fc4d`: render(100) median **92.8ms** — already above the 90ms `F6-6-01` budget and on the 100ms `M3-16` line.<br>· UX-05 tree: **94.4ms** — within 1.6ms (1.7%) of the untouched baseline, i.e. **no regression from the UX-05 changes**.<br>· The gates also flip on the same tree with the same code depending on load: `F4-6-04` measured 86ms (FAIL) under concurrent load and 45ms (PASS) idle.<br>· The gate compares the **worst** of three render samples, and the first sample is a cold-start outlier (187–232ms) that dominates the figure. |
| Conclusion | These are wall-clock measurements of the machine, not behavioural assertions. The thresholds are **not** raised and the tests are **not** weakened. |
| Remediation | Measure the **median** of the render samples, or discard the first cold sample, and re-baseline the budget. That is a change to the QA gate and needs its own review. |

## 7. `MOTION-06 M06-03` — the mid-drag sample

| | |
|---|---|
| Status | **FIXED in the QA harness — animation lifecycle race** |
| Symptom | `M06-03` sometimes found the dialog open but without a drag class, inline transform, or swipe-progress variable. |
| Evidence | An isolated failure recorded `qv--flying`, one live `.qv-proxy`, and an empty inline style. `openQvFromCard()` waited only for `dialog.open`, then the test used a fixed 140ms wait before sampling. Thus the sample/gesture could overlap the shared-element opening flight; the failure reproduced without concurrent QA. A pre-settle hit-test probe found the pointer target inside `.quick-view__top` and observed its `pointerdown`, so the evidence does not indicate a layout or hit-target miss. |
| Fix | The harness now waits for the opening flight class and proxy to clear, and M06-03 waits for the actual drag class, translation, and progress style rather than assuming a fixed delay. No application gesture code or assertion threshold was changed. |
| Verification | Three post-fix isolated runs: **93/93 each**. Instrumented open-flight intervals ranged from **559ms to 1,325ms**, confirming that a fixed 140ms boundary was not reliable. |

---

## Summary

| # | Issue | Status | Pre-existing | Fixed in UX-05 |
|---|-------|--------|--------------|----------------|
| 1 | FUSION-01 F02-28/29 | **fixed** | yes | yes |
| 2 | FUSION-02 F01-02/04/05 | **fixed** | yes | yes |
| 3 | FUSION-04 F04-A02/A03 | **fixed** | yes | yes |
| 4 | M2 reveal runtime | **fixed** | yes | yes |
| 5 | Sidebar truncation | **fixed** | yes (UX-03) | yes |
| 6 | F4-6-04 / F6-6-01 / M3-16 | open — machine-bound | yes | no (deliberately not) |
| 7 | MOTION-06 M06-03 | **fixed in QA harness** | yes | yes |

Nothing above was introduced by the UX-04 or UX-05 changes, no QA test was
weakened, and no performance threshold was changed to obtain a PASS. The
M06-03 synchronization changes only the test's readiness boundary; the
application's behavior during the opening flight is not asserted by that
gesture test.
