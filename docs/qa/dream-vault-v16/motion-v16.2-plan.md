# Dream Vault V16.1 — Motion V16.2 Plan (MOTION-01)

Audit, architecture and safe foundation only. No visual redesign, no new feature
or widget, no new dependency.

## 1. Goal

Prepare Dream Vault for an immersive premium motion experience (cinematic
scrolling, interactive galleries, drag-and-drop status management, fluid layout
transitions, tactile microinteractions) without rebuilding what already exists.
The experience must visibly respond to scroll, pointer, drag and touch — not
merely fade in.

## 2. Audit result (motion-inventory.md)

The codebase already has a mature, disciplined motion system:

- one IntersectionObserver for the whole reveal system
- 12 listeners per card, constant, no leak
- card tilt (rAF, hover/fine only, reduced-motion aware, rAF cancelled)
- image parallax (rAF, separate from tilt, owns different CSS variables)
- Quick View open/close (keyframes + `qvClosing` guard + focus return)
- purchase celebration (keyframe + cleanup)
- toast (enter keyframe + action)
- dashboard KPI nudge + fade-on-data-change (signature-guarded)
- nav indicator (rAF, scroll/resize/font-load)
- reduced-motion blocks in all 52 stylesheets

**No conflict was found at the transform level.** The only real defect was the
three dashboard widgets re-animating on a filter change (fixed in F6.3). The
motion-inventory.md file is the full table.

## 3. Architecture (motion-ownership.md)

Ownership boundaries are defined so that MOTION-02..05 can add motion without
colliding. The single rule: no two systems write the same transform property on
the same element; composition happens in CSS from owned variables. The full
table and the four ownership rules are in motion-ownership.md.

## 4. Interaction specifications

### 4.1 Scroll parallax and hero (MOTION-02)
- Trigger: `scroll` (passive) + `IntersectionObserver` for in-view detection.
- Duration: continuous, tied to scroll progress.
- Easing: linear mapping of scroll offset to translate.
- Rollback: reset to 0 on `scroll` end / tab hidden.
- Accessibility: disabled under `prefers-reduced-motion: reduce`.
- Cleanup: cancel rAF on dispose; unobserve on removal.
- Owner: hero layers only (`--dv-parallax-x/y` on `.hero--v3` children).
- Must NOT touch `.wishlist-card` (tilt owns it).

### 4.2 Dashboard transitions (MOTION-03)
- Trigger: data change (CRUD, purchase, undo, savings edit).
- Duration: 240 ms (`--dv-motion`), opacity/transform only.
- Rollback: `dvTextCache` / signature guards prevent replay on unchanged data.
- Accessibility: suppressed under reduced motion.
- Cleanup: WAAPI auto-cleanup; signature guards prevent stacking.

### 4.3 Gallery / Focus FLIP (MOTION-03)
- Trigger: view toggle click.
- Duration: 260 ms (`cubic-bezier(.22, .68, .24, 1)`).
- Rollback: CSS `dataset.v13View` switch; no JS animation.
- Accessibility: `aria-pressed` on the toggle; reduced motion disables the
  transition.
- Cleanup: none (CSS-driven).

### 4.4 Drag & drop status board (MOTION-03)
- Trigger: pointer drag on a card (or keyboard alternative).
- Duration: continuous follow + 160 ms settle.
- Rollback: on cancel, card returns to its origin (no state change).
- Accessibility: keyboard alternative (Enter to open status menu, arrows to
  pick, Enter to confirm); touch long-press.
- Cleanup: single overlay node owns its transform; the dragged card keeps its
  transform untouched.
- Data safety: status change reuses the existing `setStatus`/`save` path; drop
  into "purchased" opens the F2 purchase dialog and preserves cancel/undo.
- No new Firebase field unless demonstrably necessary (none planned).

### 4.5 Quick View transitions (MOTION-04)
- Trigger: card click / ESC / backdrop click.
- Duration: 320 ms open, 240 ms close.
- Rollback: `qvClosing` guard; Promise resolves when the dialog is actually closed.
- Accessibility: focus to `#qvClose` on open, return to opener on close.
- Cleanup: class removal + listener cleanup on animation end.

### 4.6 Navigation and microinteractions (MOTION-04)
- Trigger: scroll / resize / font load.
- Duration: rAF-scheduled (no fixed duration).
- Rollback: cancel rAF on new schedule.
- Accessibility: passive listeners, no layout shift.
- Cleanup: rAF cancel.

### 4.7 Mobile touch (MOTION-04)
- Trigger: touch (no hover).
- Duration: same as desktop where applicable.
- Rollback: identical.
- Accessibility: `matchMedia("(hover: hover) and (pointer: fine)")` gates
  tilt/parallax; reduced motion disables everything.
- Cleanup: identical.

## 5. Performance baseline (F6.1, unchanged)

Reference: `docs/qa/dream-vault-v16/f6-baseline.md` and `.json`.

- 52 stylesheets, 343 504 raw bytes, 0 url(), 0 @import.
- Concatenation (F6.2): -28 299 gzip bytes (-30.3%), -51 requests.
- render(): 0.28 ms/item, 1 long task at every size.
- Lighthouse (gzip): desktop 89, mobile 100, transfer 124 KB, 2 requests.
- CLS 0, TBT 0-83 ms, a11y/BP/SEO 100.

MOTION-02..05 must not regress these numbers. Any new motion system is measured
against this baseline before it ships.

## 6. Drag & drop data safety (spec)

- The board is a **view** over the existing `items` array, not a second store.
- Status change reuses `setStatus` / `save` / `render` exactly as the Quick
  View does.
- Drop into "purchased" opens the F2 purchase dialog; cancel leaves the item
  where it was; undo remains available.
- No new Firebase field. The two existing optional fields (`savingGoal`,
  `savedAmount`) are untouched.
- Keyboard alternative and touch behavior are specified in 4.4.
- No live production writes during QA (mocked cloud module, as in all suites).

## 7. What MOTION-01 commits

- `docs/qa/dream-vault-v16/motion-inventory.md`
- `docs/qa/dream-vault-v16/motion-ownership.md`
- `docs/qa/dream-vault-v16/motion-v16.2-plan.md`
- `docs/qa/dream-vault-v16/motion-performance-baseline.json`

No code changes. No visual redesign. No new feature or widget.

## 8. Verification

- `npm run qa` (787 checks, 0 FAIL)
- `npm run build` (PASS, 5 files, 1 stylesheet, leakCount 0)
- `npm run check:hosting` (PASS)

After MOTION-01 PASS, proceed to MOTION-02 (Cinematic Scroll & Hero) on the same
branch.
