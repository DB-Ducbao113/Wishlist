# Bài 12B.1 — Before / After

Commit: `3756553`
Debounce: 120 ms (`SEARCH_DEBOUNCE_MS`)
Date: 2026-10-13

## Method

- Same environment for both versions: Chrome 155 headless, 1440x900,
  fresh browser context per run, local isolated data (no cloud sync).
- Before: worktree at `fbb4d37` (pre-debounce). After: working tree at
  `3756553`. Versions alternated per run to cancel machine drift.
- Same dataset generator for both (20/50/100 items, long names,
  mixed statuses/categories/notes).
- Bursts are separated: S1 search-only (type 5 chars, 30 ms gaps),
  S2 filter/sort-only (4 status changes + 3 sort changes, 60 ms apart).
- 3 runs per size (100-item third After run missing — runner timeout;
  2 runs recorded, consistent with the others).
- Limitation: the render-call counter wraps `window.render`, but the
  Before listeners hold the original function reference, so Before
  render counts read 0 and Before keystroke latency hit the 3 s poll
  timeout. Before per-burst render count (5 renders per 5 chars) is a
  code fact (`input` → `render` directly), not a measured value.

## Results

### Renders per 5-character search burst

| Items | Before | After |
|------:|-------:|------:|
| 20 | 5 (by construction) | 1 |
| 50 | 5 (by construction) | 1 |
| 100 | 5 (by construction) | 1 |

### Keystroke-to-result latency (last keystroke → rendered result)

| Items | Before | After |
|------:|-------:|------:|
| 20 | n/a (renders synchronously per key) | ~100 ms |
| 50 | n/a | ~101 ms |
| 100 | n/a | ~101 ms |

~100 ms polling aligns with the 120 ms debounce. No uncomfortable wait.

### Single `render()` time (20 iterations, median / p95)

| Items | Before | After |
|------:|-------:|------:|
| 20 | 2.9–3.4 / 4.5–5.1 ms | 2.4–3.0 / 3.2–4.2 ms |
| 50 | 6.8–7.6 / 9.6–14.4 ms | 6.7–8.0 / 8.9–11.0 ms |
| 100 | 13.4–15.4 / 17.2–19.6 ms | 14.1–17.2 / 19.1–24.5 ms |

Within run-to-run noise (separate A/B alternation showed overlapping
ranges both directions). No consistent >10% regression; expected, since
the change adds one null-check per `render()`.

### Long tasks in search-only burst (max entry per run)

| Items | Before | After |
|------:|-------:|------:|
| 20 | 74–86 ms | 57–73 ms |
| 50 | 175–187 ms | 162–192 ms |
| 100 | 326–363 ms | 318–397 ms |

Small and noisy in both versions. Filter/sort-only bursts produced
zero long tasks on both versions. No JS errors, no overflow, running
animations settle to 0 everywhere.

## Additional measurements

- Layout and paint cost: not separately instrumented; single-render
  scripting above excludes full paint/GPU.
- Test device and browser: desktop CPU, Chrome 155 headless — not a
  target mobile device.
- Repeated runs / variation: 3 alternating runs per size (2 at one cell);
  machine variance dominates single-render timing (±20%).
- Functional regression: type→filter (1 render, correct), type→clear
  (full list, no replay), CRUD during pending search (immediate,
  correct filter), celebration wiring intact — all PASS, 0 console errors.
- INP: not measured (needs real interaction hardware).

## Conclusion

- Debounce collapses each search burst from 5 full rebuilds to 1 and
  removes renders from the typing path, with ~100 ms result latency.
- It does **not** make one full rebuild cheaper: worst-case long tasks
  persist at similar magnitude on both versions.
- 12B.2 (keyed DOM reconciliation) stays **HOLD** until device-level
  traces show the remaining single-rebuild cost actually harms the
  target experience. No Firebase or storage logic was touched.
