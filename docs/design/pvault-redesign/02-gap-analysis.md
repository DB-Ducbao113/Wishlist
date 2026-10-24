# PVault — Reference-first redesign, milestone 2: Quick View + Add/Edit

Status: implemented on `feature/motion-auth-reset` (commit SHA at the end of
this document).
Scope: the **dialog surfaces only** — Quick View (`#qv`) and the Add/Edit
form (`#dlg`), as one coherent product experience consistent with the
Collection V17 language. The purchase capture dialog (`#pd`) sat inside the
journey scope and was verified, not restyled.
Out of scope (next milestones): dashboard/hero voice, `#pd` consistency pass,
mobile dock polish.

---

## 1. Reference set — unchanged

Same incomplete reference as milestone 1 (see `01-gap-analysis.md` §1): the
only surviving artefact is the prototype
`references/someday-vault-motion-reference.html`. It has no dialog screens,
so this milestone compares the dialogs against **the Collection V17 visual
language already established in the app** (ink `#19152C`, muted `#625979`,
accent `#6850BC`, bold sans 800 display, micro-labels, `<22px` pill chrome)
and against the prototype's principles (no blur decoration, tinted plates,
kicker → title → facts reading order). No missing reference imagery has been
invented.

---

## 2. Method

Everything below is measured, not eyeballed.

* `scripts/qa/dialog-shots.js` (port 8287) seeds isolated guest data, mocks
  `wishlist-cloud.js`, and captures the dialogs BEFORE and AFTER at
  1440 / 390 / 320: `qv`, `add`, `add-more`, `edit` plus `-bottom` scroll
  variants → `qa-out/redesign/dialogs/before/` and `/after/`, with
  `dialog-metrics.json` (computed geometry: header heights, CTA positions,
  focus rings, target sizes).
* `scripts/qa/qv-top-probe.js` proved the sticky Quick View top bar survives
  a panel scroll (top stays at y=46, h=71 while the panel catches up
  `scrollTop=338`).
* `scripts/qa/dialogs-journey.js` (port 8291) runs **ten real user journeys**
  with real clicks/typing against isolated storage — no DOM shortcuts for
  user actions, `window.confirm` handlers exercised by the real dialog path:
  * J1 add with only a name · J2 add with every optional field
  * J3 edit every saved field · J4 cancel keeps the store
  * J5 open/close Quick View (incl. Esc + focus return)
  * J6 edit straight from Quick View (no stacked modals)
  * J7 mark purchased → the purchase capture writes the real record
  * J8 reopen and verify persistence + undo
  * J9 invalid price / link / image each explain beside the field
  * J10 keyboard contract; T block covers 390×844 and 320×844 touch
* Functional gates: `scripts/qa/ux05-browser-qa.js` (121 checks) and
  `scripts/qa/qa-run.js` (full battery) — both run before the commit; no
  assertion was skipped, deleted or loosened to “anything passes”.

---

## 3. Before state (measured from `qa-out/redesign/dialogs/before/`)

`qv-1440.png`, `add-1440.png`, `add-more-1440.png`, `edit-*-320.png` +
`dialog-metrics.json`:

1. A **166px gradient Quick View header** with a serif-italic display title —
   the voice milestone 1 removed from the collection.
2. The **primary CTA sat below the fold** at 1440 (y > 900) and the mobile
   action band had transparency issues (content showed through).
3. **Double focus rings** on inputs (legacy outline + new shadow ring).
4. The optional-fields disclosure opened **below the fold**, invisible at
   the moment you click it.
5. A native **“Choose file” label** for the image input leaked into the form.
6. Mobile: the exhibit plaque **overlapped** the image; the `#qvObject` free
   product-name line duplicated the panel title.
7. Add/Edit carried a large gradient cream header and inconsistent field
   heights; the dialog title did not say *what you are doing* (add vs edit).

---

## 4. Gap analysis

| # | Area | V17 collection language | Before | Resolution in this milestone |
| --- | --- | --- | --- | --- |
| G1 | QV shell | stage + facts panel reading order | stacked gradient card | 1120px sheet, 44–46% stage \| 54–56% panel, panel padding 32px (36 at ≥1366) |
| G2 | QV title voice | bold sans 27px→18px/800 + accent price 24px/800 + hairline | serif italic | sans title + price with the 1px hairline reused from the card price rule |
| G3 | QV top bar | opaque chrome, hairline separation | 166px gradient + browser blur | white opaque sticky bar (backdrop-filter removed), 18px fade strip |
| G4 | QV CTA | one primary, always reachable | primary below fold; 3 equal buttons | sticky opaque band at every width: `#qvPurchase` full-width primary, `#qvBuy` outlined, `#qvNoLink` quiet |
| G5 | QV facts | label-plate pattern | raw dl + plaque | tinted facts plate (V17 savings language), plaque + `#qvObject` removed from paint (asserted text kept) |
| G6 | QV status | 2×2 grid, current state gradient | four flat options | 2×2 grid 44px, current marked with the V17 status gradient |
| G7 | Form header | compact sans head | 150px+ gradient panel header | white compact header ≈100px: title 27px/800, eyebrow 10px, subtitle `#dlgSubtitle` states add vs edit |
| G8 | Form sections | micro-labels 10.5px uppercase + rule | bold serif captions | micro-labels + 1px rule; optional groups (savings/purchase) as tinted plates |
| G9 | Inputs | 48px/12px radius, single ring | mixed heights + double rings | uniform 48px (name 54px/16px) with one focus ring (`outline:none` + border + 3px shadow); selects with chevron SVG |
| G10 | Image field | no native file chrome visible | “Choose file” leak | styled 148px preview tile + `Gỡ ảnh` beside it, label styled away |
| G11 | Disclosure | must be visible when opened | opened below the fold | `fMoreToggle` now `scrollIntoView({block:'start'})` on `#fMorePanel` |
| G12 | Error copy | concise | verbose redundant hint | `#fPriceHint` shortened to “Không bắt buộc — bỏ trống nếu chưa biết giá.” |
| G13 | Footer | V17 pill buttons | wide rectangular pair | pill 46px pair, submit primary |

---

## 5. What shipped

**One new scoped sheet, loaded last:** `css/dialogs-v18.css` (~700 lines)
linked **after `css/collection-v17.css`** (which itself stays after
`css/fusion-04-mobile.css`). Everything is anchored on
`body.dreamscape-v5 dialog#qv[open]` / `dialog#dlg`, so closed-dialog rules
paint nothing and the collection, focus and board styles are untouched.

Five small changes, four in `wishlist.html` (no rewrites, no new state, no
contract changes):
1. `wishlist.html` — the stylesheet link.
2. `wishlist.html` — `#dlgSubtitle` node; the open/add/edit path sets
   “Cập nhật thông tin cho món này.” when editing (hidden ≤360px).
3. `wishlist.html` — `#fPriceHint` copy shortened.
4. `wishlist.html` — `#fMoreToggle` opens → `scrollIntoView` reveal.
5. Every other change is CSS only.

All existing hooks are preserved: field ids (`#fName #fPrice #fCategory
#fNote #fLink #fImageUrl #fFile #fSavingGoal #fSavedAmount #fPaidAmount
#fPurchasedAt #fStatus2 #fPriority2 #fMoreToggle #fMorePanel`), `#qv*`,
`#pd*`, the persistence shape, the double-submit guard, the QV shared-element
flight and the swipe-to-dismiss gesture choreography.

### Bounded overrides

The legacy dialog sheets each style the same nodes, so `dialogs-v18.css`
overrides exactly the painted properties it must (surface, padding, type
scale, CTA band) while inheriting the interaction styles (in/out animations,
`v8-qv-in`, purchase celebration) it does not own. No `!important` outside
the documented reduced-motion/coarse gates; no new animation; no
`backdrop-filter`.

---

## 6. Remaining mismatches (honest list)

1. **`#pd` (purchase capture) keeps its pre-V18 voice** — it was verified
   inside J7 and the MOTION-06/FUSION-04 purchase gates (writes, focus
   return, 44px) but was not restyled; its header is close to the new
   language but not derived from the same tokens. A small consistency pass
   could fold it into `dialogs-v18.css`.
2. **Fonts**: same limitation as milestone 1 — Inter → Segoe UI stack, no
   web fonts offline.
3. **The reference set is incomplete** (see §1); “consistent” here means
   consistent with Collection V17, the surviving prototype’s principles.
4. **`#qvObject` is `display:none`** rather than removed from the DOM
   because `f4-check` F4-3-03 asserts its text value; painted nothing.
5. The 320px add form legitimately reaches ~1.2 screens of scroll
   (`779/645`) — inside the ≤1.8 contract, six stacked fields is what the
   content is.

---

## 7. Test contracts that were rewritten (and why)

| Check | Old expectation | New expectation (same intent) |
| --- | --- | --- |
| `F03-A01` | `collection-v17.css` is the single trailing stylesheet | the trailing pair is exactly `collection-v17.css` → `dialogs-v18.css` (last); anything unknown after it still fails |
| `F04-A01` | `collection-v17.css` is the single trailing stylesheet | same ordered pair, nothing unknown after `dialogs-v18.css` |

No check was skipped, deleted or made more permissive otherwise. The full
battery source gates keep their “no cascade surprises” intent.

**Real issues found by the journeys and fixed (not test edits):** the J9
block initially “passed” with Chrome-tolerant data (`not an url` is parsed
and percent-encoded as `https://not%20an%20url/` by Chrome 155); the invalid
data was corrected to `example.com:abc` (invalid port), which exposes the
real sequential field validation. The undo expectation was corrected to the
item’s previous status (seed `wish`), matching `f2`’s contract.

---

## 8. Evidence

Before / after, identical data, same harness:

```
qa-out/redesign/dialogs/before/{qv,add,add-more,edit}-{1440,390,320}.png (+ -bottom)
qa-out/redesign/dialogs/before/dialog-metrics.json
qa-out/redesign/dialogs/after/{qv,add,add-more,edit}-{1440,390,320}.png (+ -bottom)
qa-out/redesign/dialogs/after/dialog-metrics.json
qa-out/redesign/dialogs/probe-scroll.png        (sticky top bar proof)
qa-out/redesign/journeys/*.png                  (add-full-filled, add-errors,
                                                 qv-open, purchase-dialog,
                                                 qv-purchased, add-mobile-*)
```

Functional verification for this milestone:

* `node scripts/qa/dialogs-journey.js` → **40 / 40 PASS** (ten journeys,
  desktop + touch).
* `node scripts/qa/ux05-browser-qa.js` → **121 / 121 PASS**.
* `node scripts/qa/qa-run.js` → 1,365 / 1,367 (20 suites), with:
  * `FUSION-02 F01-08 “a still page schedules no frames at all”`
    (measures ≤0 rAF in 700ms; reports 2–5) — **verified pre-existing** by
    running the unchanged battery on a disposable worktree of the
    re-baseline commit `c79103d` (same failure there); Chrome 155 reports a
    few benign idle frames. The check itself was not modified.
  * 1 timing-classified failure (`F4-6-04` render budget in one run, `M3-16`
    in another, `M4` T1 pill geometry in a third) — each passes in isolation
    (`M4 28/28`, `F4 62/62`, `M3 18/18`) and is machine-load-sensitive by
    design, same as documented in milestone 1.
* Per-suite isolated state after this milestone: dialogs-journey 40/40,
  ux05 121/121, F1 107, F2 168, F3 167, F4 65, F5 97, F6 28, MOTION-02..06
  219, FUSION-01 89, FUSION-02 80+pre-existing, FUSION-03 80, FUSION-04 111,
  V16 36, M1 28, M2 31, M3 32, M4 28.

---

## 9. Commit

`feature/motion-auth-reset` — see `git log` for the exact SHA of
`feat(dialogs): reference-first redesign of Quick View + Add/Edit…`
(files: `wishlist.html`, `css/dialogs-v18.css`,
`scripts/qa/dialogs-journey.js`, `scripts/qa/dialog-shots.js`,
`docs/design/pvault-redesign/02-gap-analysis.md`).

## 10. Next milestones

1. `#pd` purchase-dialog consistency pass (fold into `dialogs-v18.css`).
2. Dashboard / hero voice.
3. Mobile adaptation polish (dock spacing, 320px header overflow —
   pre-existing, unrelated to this sheet).
