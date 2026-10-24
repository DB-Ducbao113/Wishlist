# Dream Vault V16.1 — Motion Inventory (MOTION-01)

Audit of every motion system in the codebase as of F7 (`640bf87`).
Nothing was changed to produce this; it is a read-only inventory.

## 1. CSS-driven motion

| Selector / element | Effect | Trigger | Owner | Cleanup | Reduced motion |
| --- | --- | --- | --- | --- | --- |
| `.dv-reveal-in` (sections) | fade + slide-up entrance | IntersectionObserver | `DVReveal` (`<head>`) | `animationend` + 250 ms timeout | disabled by `motion-v16.css` media query |
| `.toast` | `toast-enter` 250 ms slide-in | `toast()` | CSS | 3.2 / 6 s timeout removes node | disabled |
| `.quick-view` (open) | `v8-qv-in` / `v8-qv-backdrop` / `v8-qv-sheet-in` | `openQuickView()` | CSS + JS (`qvClosing` guard) | animationend + fallback timeout | disabled |
| `.quick-view.qv-closing` | `v8-qv-out` / `v8-qv-sheet-out` / `v8-qv-backdrop-out` | `closeQuickView()` | JS (`qvClosing`) | Promise resolves on animation end | disabled |
| `.card-more__menu` | opacity 130 ms | `.card-more__trigger` click | delegated `onCardActionClick` | ESC / click-outside | disabled |
| `.dv-progress__fill` | `width` transition on `--dv-motion` | `renderDashboardProgress` | CSS | none (CSS transition) | disabled |
| `.dv-dist__seg`, `.dv-breakdown__row`, `.dv-priority__item`, `.dv-savings__row`, `.dv-insights__row` | `dvFadeOnce` opacity 240 ms | `dvFadeOnce()` on data change | JS (signature guard) | WAAPI auto-cleanup | suppressed by `dvPrefersReducedMotion()` |
| KPI text nodes | `dvNudge` opacity + translateY 240 ms | `setDashText()` on value change | JS (`dvTextCache` WeakMap) | WAAPI auto-cleanup | suppressed |
| `.is-purchase-celebrating .thumb` | `purchase-glow` keyframe | `animatePurchasedTransition()` | JS (animationend + 1.2 s fallback) | class + listener removed | suppressed |
| `.dv-tabs__tab` | background/border on `--dv-motion` | tab click | CSS | none | disabled |
| `.dv-actions__btn` | background/border on `--dv-motion` | hover/focus | CSS | none | disabled |
| `.v11-nav__indicator` (nav pill) | `--v11-nav-x/w` via `scheduleWorkspaceIndicator` | scroll/resize/font-load | rAF + rAFId | cancel on dispose | disabled |

## 2. JS-driven motion (WAAPI / rAF)

| Function | Element(s) | Property written | Trigger | Cleanup | Reduced motion |
| --- | --- | --- | --- | --- | --- |
| `dvNudge(el)` | any KPI text | `opacity`, `transform` | `setDashText` on value change | WAAPI (240 ms) | yes |
| `dvFadeOnce(el)` | dashboard rowsHost | `opacity` | data-signature change | WAAPI (240 ms) | yes |
| `dvSetFill(bar, ratio)` | `#dvProgressFill`, `.dv-*__bar` first child | `--dv-fill` (CSS `scaleX`) | `renderDashboard*` | none (CSS transition) | n/a (transform only) |
| `animatePurchasedTransition(id)` | `.thumb` | `is-purchase-celebrating` class | purchase action | `animationend` + 1.2 s fallback | yes (+ hidden tab) |
| `setupCardTilt(card, surface)` | `.wishlist-card__surface` | `--rotate-x`, `--rotate-y` | pointermove (hover/fine only) | `pointerleave` + `disposed` flag + rAF cancel | yes |
| `setupImageParallax(card, image)` | `.wishlist-card` (CSS vars) | `--dv-parallax-x/y` | pointermove (hover/fine only) | rAF cancel + removeProperty | yes |
| `reveal(el)` / `observe(el, index)` | `[data-dv-section]` + cards | `dv-reveal-in` class + `--dv-reveal-delay` | IntersectionObserver | unobserve + settle timeout | CSS-disabled |
| `revealGridCards(grid)` | `#grid > .wishlist-card` | (delegated to DVReveal) | `render()` | once per id (`revealedGridIds` Set) | CSS-disabled |
| `openQuickView` / `closeQuickView` | `#qv` | class `qv-closing`, focus | user click / ESC / backdrop | `qvClosing` guard + Promise | yes |
| `openCardMenuFor` / `closeCardMenu` | `.card-more__menu` | `dataset.open`, `aria-expanded`, `tabIndex` | click / keyboard | `openCardMenu` singleton + ESC | n/a (instant) |
| `syncWorkspaceNav` / `scheduleWorkspaceIndicator` | `.v11-nav__indicator` | `--v11-nav-x`, `--v11-nav-w` | scroll / resize / font-load | rAF cancel | n/a (layout) |
| `setCollectionView(mode)` | `#grid` | `dataset.v13View` | tab click | none (CSS handles) | n/a |

## 3. Motion ownership (transform writers)

| Element | Transform owner | CSS variables written | Conflict risk |
| --- | --- | --- | --- |
| `.wishlist-card__surface` | card tilt (rAF) | `--rotate-x`, `--rotate-y` | **none** - single owner |
| `.wishlist-card` (root) | parallax (rAF) | `--dv-parallax-x`, `--dv-parallax-y` | **none** - single owner, different vars from tilt |
| `.dv-progress__fill` | CSS transition | `width` (not transform) | none |
| `.dv-*-__bar` first child | `dvSetFill` | `--dv-fill` (CSS `scaleX`) | none |
| `#dvProgress` track | none | - | none |
| KPI text nodes | `dvNudge` (WAAPI) | `opacity`, `transform` (translateY) | **low** - only on value change, short-lived |
| dashboard rowsHost | `dvFadeOnce` (WAAPI) | `opacity` | **low** - only on data change |
| `[data-dv-section]` | CSS keyframe `dv-reveal` | class toggle | none - runs once |
| `.quick-view` | CSS keyframes `v8-qv-*` | class toggle | none - guarded by `qvClosing` |
| `.toast` | CSS keyframe `toast-enter` | class (element recreated each time) | none |
| `.thumb` (celebration) | CSS keyframe `purchase-glow` | class toggle | none - listener removed after |
| `.v11-nav__indicator` | `scheduleWorkspaceIndicator` (rAF) | `--v11-nav-x/w` | none - single owner |

**Conclusion: no two motion systems currently write to the same transform property
on the same element.** The tilt and parallax are deliberately split across the
*surface* and the *card root*, and each owns a disjoint set of CSS variables.
The composition happens in CSS, not in JS.

## 4. Trigger inventory

| Trigger | What it fires | Notes |
| --- | --- | --- |
| scroll | `syncWorkspaceNav` (passive) + reveal IO callbacks | passive, no layout |
| resize | `syncWorkspaceNav` + `scheduleWorkspaceIndicator` | rAF-scheduled |
| font load | `scheduleWorkspaceIndicator` | one-shot |
| pointermove (hover/fine only) | card tilt + image parallax | guarded by `matchMedia("(hover: hover) and (pointer: fine)")` |
| pointerleave / blur | tilt reset, parallax reset | rAF cancelled |
| IntersectionObserver entry | `reveal()` | once per element |
| CRUD / purchase / undo | `render()` -> `setDashText` / `dvFadeOnce` / `dvSetFill` / `animatePurchasedTransition` | signature-guarded |
| search / filter / sort | `render()` -> grid rebuild + (guarded) dashboard updates | no replay of entrances or fades on unchanged data |
| tab click | `setCollectionView` | CSS handles the switch |
| Quick View open/close | `showModal`/`close` + class toggle | `qvClosing` guard prevents stacking |
| card `...` click | `openCardMenuFor` | singleton, ESC/click-outside close |
| toast action | `dismissToast` + callback | 6 s for actionable, 3.2 s otherwise |

## 5. Cleanup audit

| System | Cleanup mechanism | Leak risk |
| --- | --- | --- |
| card tilt | `disposed` flag, `cancelAnimationFrame`, listener removal on `pointerleave` | none |
| image parallax | `cancelAnimationFrame`, `removeProperty` on dispose | none |
| reveal | `observer.unobserve`, `pending.delete`, `animationend` listener removal, 250 ms timeout fallback | none |
| `dvNudge` / `dvFadeOnce` | WAAPI auto-cleanup after 240 ms | none |
| `animatePurchasedTransition` | `animationend` listener removed, class removed, 1.2 s fallback | none |
| Quick View exit | `qvClosing` flag cleared on animation end | none |
| nav indicator | rAF cancelled on each new schedule | none |

No `setInterval` is left running after init. The only intervals in the code are
the 2 ms poll that installs the `render()` hook (dev-only, guarded by
`__hooked`) and the toast timeout (cleared on dismiss).

## 6. Reduced-motion audit

- `dvPrefersReducedMotion()` gates `dvNudge` and `dvFadeOnce`.
- `animatePurchasedTransition` checks `matchMedia("(prefers-reduced-motion: reduce)")` and `document.hidden`.
- `setupCardTilt` and `setupImageParallax` return a no-op disposer when the query
  matches.
- The reveal runtime (`DVReveal`) is CSS-driven; `motion-v16.css` disables the
  keyframes under `prefers-reduced-motion: reduce`.
- Every one of the 52 source stylesheets carries a `prefers-reduced-motion`
  block, preserved verbatim by the F6.2 concatenation.
- The F6 motion suite (`scripts/qa/f6-check.js`) asserts zero WAAPI animations
  under reduced motion and passes.

## 7. Conflict risks found

None at the transform level: tilt and parallax own disjoint CSS variables on
different elements. The only shared surface is `transform` itself, and it is
composed in CSS from the variables, not written by JS.

Two low-level risks, both already mitigated:

- **A1** - `dvNudge` runs on the same element that the reveal animation
  just finished on. Both use `transform`/`opacity`, but `dvNudge` only fires
  after the reveal has settled (the `firstPaint` guard + the nudge's own
  240 ms), and `dvNudge` uses WAAPI which layers on top of the CSS animation
  rather than fighting it. Verified by `F6-3-01..03`.
- **A2** - `render()` can fire while a `dvFadeOnce` is still running. The
  `dvTextCache` / signature guards prevent a re-fade on unchanged data, and
  `replaceChildren` on the rows host clears the old nodes before the new fade
  starts. Verified by `F6-3-06/07` and `F6-6-02`.

## 8. What MOTION-01 does NOT change

- No new animation library, no new keyframe beyond the existing set, no new
  design token, no new palette.
- No change to the data model, the Firestore rules, the Worker or the auth flow.
- No change to any motion timing that already shipped (240 ms nudge, 320 ms
  tilt, 260 ms panel reveal, 250 ms toast).
- No new feature or widget. The deliverables below are documentation and a safe
  foundation only.
