# Dream Vault V2 — Performance Baseline

Measured for Bài 12A. No UI/algorithm changes were made for this report.
Test data was generated locally; cloud sync was never initialized
(headless page served from `127.0.0.1`, no sign-in performed).

## Environment
- Branch: `feature/apple-minimal-3d` (tag `ui-v2.0.0`, commit `cee7c5a`)
- Browser: Chrome 155.0.8059.40, headless (`--force-device-scale-factor=1`)
- OS: Windows (win32), desktop CPU
- Viewport for scripting metrics: 1440x900, `prefers-reduced-motion: no-preference`
- Lighthouse: mobile form factor, 375x667 @2x, simulated throttling
- Test data: local isolated (`wishlist.items` in a fresh browser context), no cloud sync
- Date: 2026-10-13

## Render measurements (`render()` sync execution, 20 iterations)

| Items | Rendered cards | Median | p95 | Max |
|------:|---------------:|-------:|----:|----:|
| 0 | 0 | 0.10 ms | 0.20 ms | 0.30 ms |
| 1 | 1 | 0.30 ms | 1.10 ms | 1.30 ms |
| 20 | 20 | 3.20 ms | 5.00 ms | 5.10 ms |
| 50 | 50 | 8.70 ms | 14.00 ms | 16.70 ms |
| 100 | 100 | 12.30 ms | 15.50 ms | 17.10 ms |

Single `render()` stays within one 60 Hz frame (16.7 ms) up to 100 items
on this machine. Growth is approximately linear (full DOM rebuild).

## Keystroke cost (5 chars typed, each triggers `render()` + sync layout)

| Items | Keystroke median | Keystroke max | Long tasks in filter burst |
|------:|-----------------:|--------------:|----------------------------|
| 0 | 0.60 ms | 0.80 ms | none |
| 1 | 1.70 ms | 3.10 ms | none |
| 20 | 13.00 ms | 16.70 ms | 1 x 172 ms |
| 50 | 22.50 ms | 23.50 ms | 1 x 354 ms |
| 100 | 35.70 ms | 43.10 ms | 1 x 543 ms |

Long tasks were observed during a burst of 7 rapid filter/sort changes
(not per single keystroke). No horizontal overflow and no JS errors at
any size (0/1/20/50/100). `document.getAnimations()` running count is 0
after entrance settles.

## Lighthouse mobile (4 seeded sample items)

- Performance score: **0.98**
- FCP: 1.8 s, LCP: 1.8 s, Speed Index: 1.8 s
- Total Blocking Time: 0 ms
- CLS: 0

## UX spot checks (headless screenshots, 320/375/768/1440)

- Touch targets on mobile measure 44 px (buy buttons) and 45 px
  (status chips), meeting the 44 px minimum.
- Dialog opens with focus on the name field; footer actions reachable.
- Featured gallery spans 2 columns on desktop, single column on mobile.
- Empty and no-results states render with working CTA.

## Core Web Vitals vs targets

- LCP target <= 2.5 s: measured 1.8 s (4-item page, simulated) — PASS
- CLS target <= 0.1: measured 0 — PASS
- INP target <= 200 ms: **not measured** — requires real interaction
  input on hardware; do not infer from keystroke scripting time.
- New JS errors: 0 at all sizes — PASS

## Observed issues

- Issue: long tasks grow with item count during rapid search/filter
  bursts (172 ms @20, 354 ms @50, 543 ms @100).
- Reproduction: type 5 characters quickly, then switch status filter
  and sort 7 times in a row on a 50–100 item list.
- Evidence: PerformanceObserver `longtask` entries from Bài 12A bench
  run (`bench-raw.json` methodology, headless Chrome 155).
- Severity: medium — single renders fit in a frame, but sustained
  typing at 100 items approaches jank territory once paint and image
  decode are included (not captured here).

## Conclusion

- Baseline established: YES (scripting + Lighthouse + UX spot checks)
- Optimization priorities for Bài 12B:
  1. Full gallery re-render on every keystroke (debounce or
     differential DOM update) — only if a follow-up benchmark with
     real paint confirms the issue on target hardware.
  2. Measure INP on a real device before claiming the <= 200 ms target.
  3. Re-run this matrix at 20/50/100 items after any optimization.
