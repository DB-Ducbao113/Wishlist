# Dream Vault V16.1 — Motion Ownership Boundaries (MOTION-01)

The single rule: **no two motion systems may write to the same transform
property on the same element.** Composition happens in CSS from owned variables.

## 1. Ownership table (existing systems)

| Layer | Element | Owns | Must NOT touch |
| --- | --- | --- | --- |
| Page wrapper (scroll scene) | `body` / `#app` | `transform` of the whole scene (future) | card tilt, parallax, nav indicator |
| Hero | `.hero--v3`, `.hero__*` | parallax `transform` (future) | card tilt |
| Card outer wrapper | `.wishlist-card` (root) | reveal class, `--dv-parallax-x/y` | tilt's `--rotate-*` |
| Card surface | `.wishlist-card__surface` | `--rotate-x`, `--rotate-y` (tilt) | parallax vars, layout |
| Product image | `.product-media__image` | `translate` (parallax) | tilt |
| Overlay / dialog | `#qv`, `#pd`, `#dlg` | open/close class, focus | card tilt |
| Dashboard widgets | `.dv-*__rows` host | `opacity` (fade) | layout |
| Drag overlay (future) | a single overlay node | `transform` of the overlay only | the card being dragged |
| Nav indicator | `.v11-nav__indicator` | `--v11-nav-x/w` | everything else |

## 2. Ownership rules

1. **One writer per (element, property).** If a new motion needs `transform` on
   an element that already owns one, it must either (a) use a different property
   (`opacity`, `filter`), (b) compose through a CSS variable that the existing
   owner does not read, or (c) run on a child/wrapper element.
2. **CSS variables are the contract.** JS writes `--dv-*` / `--v11-*` variables;
   CSS composes the actual `transform`/`opacity`. No JS writes `style.transform`
   directly except the nav indicator (legacy, single owner).
3. **rAF ownership is exclusive.** A new rAF loop must not share a target with
   an existing one. The tilt and parallax loops are separate and target
   different elements/variables.
4. **Reduced motion is mandatory.** Every new motion checks
   `prefers-reduced-motion: reduce` (JS via `dvPrefersReducedMotion()` or CSS via
   the media query) and degrades to instant.
5. **No layout shift.** Motion uses `transform` and `opacity` only. `width`,
   `height`, `top`, `left`, `margin`, `padding` are never animated (the
   ownership-progress bar's `width` transition is the one deliberate exception,
   and it is a CSS transition on a single element, not WAAPI).
6. **Cleanup is part of the feature.** Every rAF, listener and timeout has a
   disposer or a guard. No motion runs on a detached node (`isConnected` check).
7. **No animation stacking.** A new animation on an element that is already
   animating must either wait (Promise) or be ignored (guard flag), never
   overlap. See `qvClosing` and `revealedGridIds` for the pattern.

## 3. Boundaries for the MOTION-02..05 work

The upcoming milestones (cinematic scroll, drag & drop, microinteractions,
performance) must respect the table in section 1. Concretely:

- **Scroll parallax** (MOTION-02) goes on `.hero--v3` and its children, using
  `--dv-parallax-x/y`-style variables. It must not touch `.wishlist-card` (tilt
  owns it) or `.wishlist-card__surface`.
- **Drag & drop** (MOTION-03) renders a single overlay node that owns its own
  `transform`. The dragged card keeps its transform untouched; the overlay
  follows the pointer.
- **FLIP layout transitions** (MOTION-03) animate the *container*'s children
  through a temporary wrapper, never the card surface's tilt transform.
- **Dashboard microinteractions** (MOTION-04) go through `setDashText` /
  `dvNudge` / `dvFadeOnce` / `dvSetFill`, which already guard on data change.
- **No new motion token.** Reuse `--dv-motion`, `--dv-ease-out`, `--dv-gap-*`,
  `--dv-accent`. No new duration or easing constant.

## 4. Verification

Ownership is verified by the F6 motion suite (28/28) and the F4.1 interaction
audit (0 tiny, 0 unnamed, 0 div-as-button). A new motion system is not
considered done until it passes both, plus a reduced-motion run and a 100-item
render check.
