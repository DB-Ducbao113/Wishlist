# Dream Vault V16.1 - F3 Dashboard 2.0

F3 turns the three-card dashboard into a **Personal Wishlist Command Center**.
It does not redo F1 or F2, and it does not touch Production, the Worker,
Cloudinary, Firebase Rules or the user's data.

Branch: `feature/motion-auth-reset`. PR: **#1 -> develop**. No new branch, no
worktree, no tag, no merge, no deploy.

---

## 0. What changed

### 0.1 Commits

| Commit | Step | Files | Diff |
| --- | --- | --- | --- |
| `524a8bd` | F3.1 - restructure the dashboard into a command center | 2 | +161 / -17 |
| `807aef3` | F3.2 - harden the KPI band and promote the recording figures | 2 | +77 / -21 |
| `dfd4b0f` | F3.3 - add the status distribution panel | 2 | +446 |
| `bfd6cc0` | F3.4 - add the category breakdown and priority widget | 2 | +600 / -10 |
| `2c84606` | F3.5 - add the quick actions block | 2 | +327 / -11 |
| F3.6 | motion, accessibility, QA, hosting and this report | 6 | see 1 below |

Baseline for the whole step is F2 at `332258f`. The two source files are
`wishlist.html` and `css/dashboard-v16.css` - nothing else. F3.1-F3.5 together
are 1598 insertions across those two files.

### 0.2 Files

| File | Role |
| --- | --- |
| `wishlist.html` | the dashboard markup (`.dv-dash`, `.dv-actions`), the renderers (`renderDashboardProgress` / `Metrics` / `Status` / `Breakdown` / `Priority` / `Actions`), the shared helpers (`setDashText`, `setDashAttr`, `dvSetFill`, `dvNudge`, `dvFadeOnce`, `shareOf`, `applyDashboardFilter`, `dashboardScrollToCollection`, `dvCell`, `dvSwatch`, `dvBar`, `itemPrice`, `highestPriorityPending`), the `UNCATEGORISED` sentinel and its `#fCategoryFilter` option, and the delegated listeners |
| `css/dashboard-v16.css` | every `--dv-*` rule for the dashboard: the KPI band, progress, `.dv-dist`, `.dv-breakdown`, `.dv-priority`, `.dv-actions`, the focus rings, the reduced-motion block, and the AA contrast fix on the dominant KPI card |
| `css/empty-state.css` | the P2-2 contrast fix for `#emptyAction` |
| `docs/qa/dream-vault-v16/f3-report.md` | this file |
| `docs/qa/dream-vault-v16/f3-audit-results.json` | all 167 checks, machine readable |
| `docs/qa/dream-vault-v16/f3-lighthouse.json` | the A/B numbers and the payload analysis |
| `docs/qa/dream-vault-v16/img/f3-*.png` | 14 screenshots |

---

## 1. What was built

The five bands the brief asks for, in the order it asks for them:

1. **Heading** - section number, eyebrow, `Giá trị những giấc mơ của bạn`, and
   `Thêm món` as a real button that calls the one existing `openForm(null)`.
2. **KPI band** - `Giá trị chưa mua` (dominant) / `Giá trị đã sở hữu` /
   `Bộ sưu tập`, then the two recording figures
   `Chi tiêu thực tế đã ghi nhận` and `Món đã mua chưa nhập giá thực tế` as
   promoted tiles with their own one-line hints.
3. **Ownership progress + status distribution** - the horizontal progressbar
   with `N trên M món đã sở hữu.`, beside a segmented `.dv-dist` bar and a
   legend whose every row is a button that filters the collection.
4. **Category breakdown + priority widget** - up to six categories plus one
   `Khác (N danh mục)` row, beside `Cao / Trung bình / Thấp` with count and
   unpurchased value each.
5. **Quick actions** - `Thêm món mới`, `Xem món chưa mua`, `Xem món đã mua`,
   `Xem món ưu tiên cao`, `Xóa bộ lọc`, `Xuất JSON`, `Nhập JSON`, plus the
   foundation doc's one purchase short-cut `Đánh dấu đã mua`.

Layout: a 12-column grid at 1200px and up (7/5 split for band 3 and band 4),
two columns down to tablet, and stacked or 2-up at 767px and below. Measured
with no horizontal overflow at **1920, 1440, 1280, 1024, 768, 430, 390, 375 and
320px**.

### 1.1 Deliberate deviations from the foundation doc

These are decisions, not oversights. Each one is also recorded next to the code.

| Foundation doc says | Built instead | Why |
| --- | --- | --- |
| `.dv-dist` segments use the `--dv-chart-*` colour ramp (section 4.3) | the segments use `--dv-status-wish/_saving/_ordered/_purchased` | the chart and the collection's status chips then speak one colour language. Slot 4 of the chart ramp (`#C7BEF2`) is too close to slot 3 at 320px, and the whole point of the legend is that a colour maps to one status |
| a progress **ring** | the horizontal `#dvProgress` progressbar stays | `MOBILE-02` in the existing suite asserts `#dvProgressFill` renders about `trackWidth * ratio`. Replacing it with a ring would break a shipped contract for a cosmetic gain |
| Quick actions named in the brief in English (`Export JSON`, `Import JSON`) | `Xuất JSON` / `Nhập JSON` | the UI is 100% Vietnamese, and those are the exact labels the existing toolbar buttons already use |
| section 4.6 also contracts a `Đánh dấu đã mua` shortcut | built, but it opens the F2 confirmation dialog and is **never** a one-click purchase | a dashboard click must never change purchase state (one of the brief's own F3.5 rules) |
| charts "transition via transform/opacity" (brief, F3.6) | horizontal bars animate `transform: scaleX()`; the **segmented** bar does not animate its `flex-grow` at all, and fades once instead | `scaleX` is a compositor-only property, so it is literally what the brief asks for. The segmented bar's segment lengths *are* the data, and animating `flex-grow` would run layout every frame; so it changes instantly and the chart fades once, which is still transform/opacity only |

One more: the attachment you sent was explicitly "Minh họa bố cục và bảng màu,
không phải dữ liệu thật". Its layout intent and its Light Lavender palette were
followed; its English heading text was not adopted, and neither were its
numbers. The existing Vietnamese heading stays.

---

## 2. How this was tested - and what was stubbed

### 2.1 Real

The real `wishlist.html`, the real CSS, the real inline render pipeline, the
real `computeMetrics()` / `globalMetrics()`, the real `visibleItems()`, the real
`renderImmediately()`, the real dialogs (`#dlg`, `#pd`), the real
`openForm()` / `markPurchased()` / `openPurchaseDialog()` /
`applyPurchase()` / `undoPurchased()`, the real export and import path
(`#btnExport`, `#btnImport`, `#importFile`, `importJson`), the real
`localStorage` seeding and the real DOM events. Every assertion reads the
running page, not a copy of the logic.

### 2.2 Stubbed - stated plainly

* **`wishlist-cloud.js` is intercepted** and replaced with a small module that
  exposes `__cloudSetUser` / `__cloudStatus` / `__cloudRemote` / `__cloudSyncs`
  and never opens a socket. So: no Firebase, no network, no real Google
  account. Everything about the *dashboard* is real; the *sync transport* is
  not exercised here (F1/F2 cover it, and the same caveat applies).
* Nothing else is stubbed. No dashboard function is monkey-patched.

### 2.3 The harness

`v16_3-f3-check.js` (kept alongside the other QA harnesses, not committed -
same as F1 and F2). It serves the repo on `localhost` (not `127.0.0.1`, because
`initializeCloudSync()` only runs on a real host), drives the real entry points,
and writes every check to `f3-audit-results.json`. It takes an optional
scenario filter: `node v16_3-f3-check.js <repo> S9`.

---

## 3. F3 QA gate - 167 PASS / 0 FAIL

| Section | Checks | Result |
| --- | --- | --- |
| S1 STATUS | 21 | PASS |
| S2 EMPTY | 18 | PASS |
| S3 MOBILE | 12 | PASS |
| S4 BREAKDOWN | 19 | PASS |
| S5 PRIORITY | 15 | PASS |
| S6 MOBILE-INSIGHT | 12 | PASS |
| S7 ACTIONS | 28 | PASS |
| S8 MOTION | 16 | PASS |
| S9 A11Y | 11 | PASS |
| S10 SCALE | 15 | PASS |
| **Total** | **167** | **PASS** |

### 3.1 The six gate items, item by item

**KPI correctness and independence (F3.2).** All six figures exist, are produced
by the one shared metrics pass, and are never recomputed per widget. The suite
proves the band does not move when the user searches, changes sort, switches
filter or switches tab (`DIST-*`, `SCALE-09`, `SCALE-10`, `SCALE-11`), that
`#resultStatus` *is* allowed to move while the KPIs are not (`kpiOnly()` excludes
it deliberately), and that no `NaN` can reach the DOM at 50 items or at 0.
Values are only written when they actually change (`setDashText` /
`setDashAttr` over a `WeakMap`), so a keystroke does not rewrite the band, but
`fill.style` is still written on every pass so the bar can never go stale.

**Distribution (F3.3).** Four statuses, one segmented bar, a legend with count
and percentage per row, and every legend row is a real `<button>` that filters
the collection. Colour is never the only signal - each row carries its label,
its count and its share as text, the bar itself is `role="img"` with a full
`aria-label`, and the segments are `aria-hidden`. At zero items it renders one
empty track plus a caption and hides the legend: no divide-by-zero anywhere
(`shareOf` guards the total, and the empty path is asserted separately).
Legacy rows with an unknown status get their own bucket that is **not**
clickable rather than being silently dropped (`DIST-44`-`DIST-46`).

**Breakdown and priority (F3.4).** Built from the global item list, not from the
filtered one. Six categories plus one `Khác (N danh mục)` aggregate, ranked by
count, then by unpurchased value, then by name. Empty category becomes
`Chưa phân loại`, which is a real sentinel `<option>` in `#fCategoryFilter`
(`UNCATEGORISED`), so clicking it filters the collection through the *existing*
mechanism instead of a parallel one. The priority widget shows count and total
unpurchased value per rank; a rank with no items keeps `aria-disabled="true"`
rather than `disabled`, so it stays keyboard-reachable and its `0 món` stays
readable, with the click guarded. Neither panel is allowed to move the global
KPIs, and both are hidden entirely at zero items rather than shown as an empty
shell.

**Quick actions (F3.5).** Every entry is a real `<button>` with a visible text
label - the only glyph is a decorative `+` with `aria-hidden="true"`. Nothing
here is a copy: `Thêm món mới` calls `openForm(null)`, `Xóa bộ lọc` clicks the
toolbar's own `#btnClearFilter`, export and import click `#btnExport` /
`#btnImport`, and the three view actions route through `applyDashboardFilter()`.
The purchase short-cut opens the F2 dialog and buys nothing on its own; when
there is nothing left to buy it hides itself. Every action leaves item data and
every KPI byte-identical (`ACT-15`, `ACT-16`), and `highestPriorityPending()`
never points at an item that is already owned (`ACT-21`).

**Motion and accessibility (F3.6).** See sections 5 and 6.

**Responsiveness.** See section 8.3.

---

## 4. Regression suites - all green

| Suite | Result |
| --- | --- |
| F1 audit | 107 PASS / 0 FAIL |
| F2 suite | 168 PASS / 0 FAIL |
| V16 QA (v16-qa) | 36 PASS / 0 FAIL |
| M1 | 28 PASS / 0 FAIL |
| M2 | 31 PASS / 0 FAIL |
| M3 | 32 PASS / 0 FAIL |
| M4 | 28 PASS / 0 FAIL |
| JS syntax (`syntax-check.mjs`) | 3 inline scripts, 0 failures |

No F1 or F2 assertion had to be changed for F3 - and that is the point, since
F3's whole brief is "do not redo F1/F2". The contracts that were most at risk
were held deliberately: `.total.stats-dashboard > .stat-card` stays three
direct children, `#sumTotal` / `#sumSpent` / `#sumCount` keep their ids and
meanings, `#dvProgressFill` still renders about `trackWidth * ratio`,
`#dvProgressCaption` still reads `N trên M món đã sở hữu.`, and the
`.stat-card__description` disclaimer text is untouched.

The one structural change worth naming: `.dv-metrics` moved **above** the
progress block. Nothing asserts its position, but it is a visual reorder, so it
is called out here rather than buried.

---

## 5. Hosting build + security gate - PASS

```
dist built: 54 files (52 assets + 2 platform), 502337 bytes
allowlist: wishlist.html, wishlist-cloud.js, css
verdict: PASS - no repo internals published; all runtime assets present
```

`leakCount: 0` on the new build; the old (V15-era) config is the only one still
carrying `docs` leaks, and it is not what `firebase.json` points at. No
Production deploy was performed.

---

## 6. Lighthouse A/B - same flags, both trees

Identical command, identical throttling, both sides served as plain static files
over `127.0.0.1` so the Firebase SDK never loads. The baseline side is
`git archive 332258f` (F2); the F3 side is the working tree. Two full A/B runs
were executed back to back and differed by at most **3 ms** on LCP, so these
numbers are stable, not noise.

| | F2 desktop | **F3 desktop** | F2 mobile | **F3 mobile** |
| --- | --- | --- | --- | --- |
| Performance | 61 | **59** | 79 | **74** |
| Accessibility | 96 | **100** | 96 | **100** |
| Best practices | 100 | **100** | 100 | **100** |
| SEO | 100 | **100** | 100 | **100** |
| FCP / LCP | 3.93 s | **4.36 s** | 3.91 s | **4.36 s** |
| CLS | 0 | **0** | 0 | **0** |
| TBT | 0 ms | **0 ms** | 0 ms | **0 ms** |
| Transfer | 440 KB | **489 KB** | 440 KB | **489 KB** |

**The performance delta is payload, and only payload.** F3 adds
**+33 729 bytes** to `wishlist.html` (the new markup plus the inline render
code) and **+16 692 bytes** to the CSS (of which `css/dashboard-v16.css` alone
went 9 393 -> 32 573 bytes) - **+50 231 bytes total**, which matches the +49 KB
transfer. It is uncompressed: the harness serves raw files with no gzip. This
app is one render-blocking HTML file plus CSS, and FCP == LCP in every single
run, so extra render-blocking bytes move LCP close to 1:1 under simulated
throttling. No new origin, no new font, no new image, no new third-party
script - and **TBT stays 0 ms on both form factors**, so there is no new
main-thread work, and **CLS stays 0**, which was the actual target.

Accessibility went **96 -> 100 on both form factors**. Two real findings were
fixed to get there, both measured on the running page:

| Element | Before | After | How |
| --- | --- | --- | --- |
| `#emptyAction` (the P2-2 that F1 and F2 both carried) | **4.39:1** - 15px/400 dark text on `#7565e8` | **6.07:1** - white on `#6850BC`, hover `#543F9E` 8.13:1 | one `#emptyAction` rule in `css/empty-state.css` |
| the dominant gradient KPI card's label and description | **2.09:1** worst case - measured across *every* gradient stop composited with the `.28` white glow | **4.88:1** worst case | gradient re-based on the palette's own `#543F9E -> #6850BC`, the white glow dropped .28 -> .10, the two small lines set to full white. The rule mirrors the editorial selector exactly, so no `!important` |

The second one is worth being blunt about: it is the largest visual change in
F3.6, and it is a **pre-existing** problem (the purple gradient came from the
V7/editorial baseline, not from F1-F3). Small uppercase text needs 4.5:1, and
2.09:1 was nowhere near it. The card is still the dominant card, and every
colour in it was already in the Light Lavender palette.

Other text measured after the fix, for the record: secondary labels and hints
**6.51:1**, the action buttons **6.07:1**, the breakdown category names
**17.72:1**.

**No frame-rate number is claimed anywhere in this report.** The motion work is
described only by what is measurable: which properties animate, that
reduced-motion removes them, and that TBT is 0 ms and CLS is 0.

---

## 7. Requirement-by-requirement

### 7.1 IA, palette and layout - done

Light Lavender only, straight from the aliases (`#F8F6FF`, `#FFFFFF`, `#F3EFFF`,
`#6850BC`, `#A88BF7`, `#19152C` plus the existing muted/border tokens). No dark
purple from the reference theme, no new palette. Desktop 12-column grid with a
7/5 split, adaptive tablet, stacked or 2-up at 767px and below.

### 7.2 Metrics - done

Reuses `computeMetrics()` / `globalMetrics()` unchanged; nothing recounts per
widget. All six figures are present and the dashboard refreshes after CRUD,
purchase, undo, import and any auth/snapshot change (the render pipeline is the
existing one - the dashboard renderers are called from `render()`). KPIs are
independent of search, filter, sort and tab. No invented trends anywhere.

### 7.3 Status distribution - done

Four statuses, segmented bar, legend with count and percentage, every row an
accessible button that filters, colour never the only signal, real empty state
with no divide-by-zero, and no chart library - it is flexbox and two `<span>`s.

### 7.4 Category breakdown and priority widget - done

Global items, six plus `Khác`, `Chưa phân loại` handled through a real select
option, horizontal bars, click filters the collection and stays in sync with the
existing category filter (read back from `#fCategoryFilter.value`, so changing
the select by hand keeps the panel in sync). Priorities show count and total
unpurchased value, click applies a collection filter, global KPIs do not move,
empty and disabled states are real. No gradient or effect abuse - the priority
ramp is a semantic severity scale and every row also carries its text label.

### 7.5 Quick actions - done

Built entirely by delegation to the existing entry points; no CRUD, import or
export code was copied or rewritten. Each click applies the right filter,
scrolls to the collection smoothly (instantly when reduced motion is on), moves
focus to `#collection`, and toasts when there is nothing to show. A dashboard
click never changes purchase state. The single purchase short-cut confirms
through the existing F2 dialog and is hidden when there is nothing left to buy.

### 7.6 Motion and UX polish - done

The V16 section reveal still runs exactly once per section. A changed KPI figure
gets a 240ms opacity+translate nudge - **not** a count-up: the final number is
in the DOM in the same frame, and the check asserts the animation's keyframes
touch only `opacity`/`transform`, never content. The progress bar keeps its
documented width transition. The breakdown and priority bars now animate
`transform: scaleX()`; the segmented bar changes instantly and fades once.
`prefers-reduced-motion: reduce` removes all of it - no nudge, no fade, no
transitions, and the reveal module returns before it ever adds `dv-motion`. No
`filter`, `backdrop-filter` or `blur` animation exists in the dashboard CSS at
all. The 3D card surface transform is untouched: the two CSS files F3 edits
contain no rule for it.

### 7.7 Accessibility - done

Contrast: 4.5:1 or better on every dashboard text node, with the two real
findings fixed (section 6). Keyboard: every new control is focusable, reachable
in order, and has a `:focus-visible` ring. Semantics: every interactive element
in the dashboard is a real `<button>` - asserted by scanning the panel for
anything with `role="button"` that is not a `<button>`, which returns empty.
Accessible names: no button without text or `aria-label`. Charts: the
distribution bar is a labelled `role="img"`, and the legend, breakdown and
priority rows read their value as text. Target size: every legend, breakdown,
priority and action row is at least 24px tall.

### 7.8 QA and performance - done

Empty (0), 1 and 50 products are all covered - by S2 and by the new S10 SCALE,
which pins `1 món`, `24%`, `12 trên 50 món đã sở hữu.`, the six-plus-`Khác`
cap at 50 items, and KPI invariance at 50 items under search, sort and filter.
Search, filter, sort, purchase, undo, dashboard-click-to-filter, guest/login/
logout/account isolation, import/export, Quick View, Gallery/Focus and image
handling are all covered by F1, F2, v16-qa and m1-m4. Syntax and hosting checks
pass. Lighthouse numbers are above, with the payload explanation and no
unsupported FPS claim.

---

## 8. Screenshots

Files live in `docs/qa/dream-vault-v16/img/`.

| File | Shows |
| --- | --- |
| `f3-desktop-dashboard-1920.png` | the full command center at 1920px |
| `f3-desktop-dashboard-1440.png` | the same at 1440px: five bands, 7/5 split |
| `f3-desktop-dashboard-1280.png` | the narrowest desktop grid |
| `f3-tablet-dashboard-1024.png` | the tablet grid |
| `f3-tablet-dashboard-768.png` | the tablet breakpoint edge |
| `f3-mobile-430/390/375/320-dashboard.png` | the stacked mobile board at each review width |
| `f3-desktop-50items.png` | 50 products, including the six-plus-`Khác` cap |
| `f3-desktop-empty.png` | 0 products: no divide-by-zero, both insight panels withdrawn, the purchase short-cut hidden |
| `f3-desktop-reduced-motion.png` | the same board with `prefers-reduced-motion: reduce` - identical layout, no decoration |
| `f3-mobile-390-actions.png` | the quick actions block at 390px: 2 columns, the create action full width |
| `f3-mobile-390-insight.png` | the breakdown and priority panels at 390px |

---

## 9. Audit matrix - 167 checks

Full detail, including the expected and actual values of every check, is in
`f3-audit-results.json`. Section counts are in section 3.

The checks worth reading first, because they are the ones that would have caught
a regression:

* `ACT-01`/`ACT-02` - the seven contracted actions exist and every one is a real
  `<button>` with a visible label.
* `ACT-15`/`ACT-16` - no quick action edited an item or moved a KPI.
* `ACT-22`/`ACT-24` - clicking the purchase short-cut does **not** buy; only
  confirming the F2 dialog does.
* `ACT-27` - with nothing left to buy, the short-cut hides itself.
* `MOT-01`/`MOT-02` - the KPI number is final in the same frame, and the
  animation touches only compositor properties.
* `MOT-10`-`MOT-15` - with reduced motion, no animation is created at all, and
  the data still updates correctly.
* `A11Y-04` - no clickable div anywhere in the dashboard.
* `A11Y-02` - the gradient card's worst-case contrast, computed across every
  gradient stop, not sampled at one point.
* `SCALE-09`-`SCALE-11` - at 50 items, searching, sorting and filtering leave
  every KPI byte-identical.

---

## 10. Known gaps and carried over

### Not done, on purpose

* **No Production deploy.** Withheld pending release approval, as instructed.
* **No merge.** `develop` and `main` are untouched, and PR #1 stays open.
* **No F3 tag.** `ui-v16.0.0` was not moved and no new tag was created.
* **The current-adjustment request in the analysis plugin is unchanged.** Nothing
  was raised or lowered in live functionality; the whole step is the dashboard.
* **No new images or user data were added, renamed or deleted.** The untracked
  `image/After Shave.webp` is untouched and uncommitted.

### Still blocked, exactly as before F3

* The Cloudflare preview build stays red until the deployment is retried in the
  dashboard - a hosting-side action, not a code one.
* iPhone Google sign-in on Preview still needs owner-side Console changes
  (Firebase authorised domain + Google Cloud OAuth redirect URI).
* Image Sync and two-device QA cannot be run from here: no iPhone, no real
  Google/Firebase account.
* `scripts/test-firestore-rules.mjs` still cannot run (missing
  `@firebase/rules-unit-testing`). `firestore.rules` was not touched.

### Pre-existing P2 items

| Id | Status after F3 |
| --- | --- |
| P2-2 `#emptyAction` contrast | **fixed** (4.39:1 -> 6.07:1) |
| P2-3 misleading `importJson()` comment | still open, untouched |
| P2-4 `#fCategoryFilter` rebuilt every render | still open; F3.4 added the `UNCATEGORISED` sentinel option inside that rebuild, so the behaviour is unchanged |
| P2-5 `ownedValue` is list price, not spending | still open; the card keeps its disclaimer, and F3 did not merge it with `actualSpent` |

### F2 items carried

F2-N1 (the status chip records no `purchasedAt`), F2-N2 (no upper bound on
`paidAmount` beyond finiteness) and F2-N4 (the QA harnesses are intentionally
not committed) all stand unchanged. F2-N3 (real-device sync) needs the owner's
phone.

---

## 11. Decision

# GO - for F3 continuation on `feature/motion-auth-reset` only

F3 is complete: 167/167 on its own gate, every earlier suite still green,
hosting gate PASS, accessibility up 4 points on both form factors, CLS 0 and
TBT 0 ms. The mobile performance score moves 79 -> 74 and that is a real,
reproducible cost of +50 KB of render-blocking payload - reported here rather
than smoothed over.

This GO is for **continuing on the branch**. It is not approval to merge, not
approval to tag, and not approval to deploy. The two owner-side blockers
(Cloudflare preview, iPhone Google sign-in) still have to be cleared by you
before anything can be verified on a real device.
