# Bài 12C — Real-Device Performance

## Environment
- Branch: `feature/apple-minimal-3d`
- Commit: `a2f7859` (12B.1 report; app code at `3756553`)
- Browser: TBD (real device)
- Device: TBD
- OS: TBD
- Screen resolution: TBD
- Test date: TBD
- Test data: local isolated
- Firebase Sync: not initialized

## Results (real device — to be filled)

| Items | Render p95 | Search latency | Long task max | UX |
|------:|-----------:|---------------:|--------------:|----|
| 20    | TBD        | TBD            | TBD           | TBD |
| 50    | TBD        | TBD            | TBD           | TBD |
| 100   | TBD        | TBD            | TBD           | TBD |

## Supplementary: CPU x4 throttling emulation (NOT a real device)

Headless Chrome 155, mobile emulation 390x844, `Emulation.setCPUThrottlingRate: 4`,
same dataset generator as 12A/12B.1. Directional signal only.

| Items | Render median | Render p95 | Render max | Long tasks in search+filter flow |
|------:|--------------:|-----------:|-----------:|----------------------------------|
| 20 | 17.8 ms | 20.6 ms | 20.8 ms | 187, 61 ms |
| 50 | 49.2 ms | 54.2 ms | 75.0 ms | 527, 106, 67, 50 ms |
| 100 | 70.7 ms | 83.0 ms | 84.0 ms | 738, 124, 84, 77 ms |

Reading: under a 4x-slowed CPU, one full rebuild already exceeds a
60 Hz frame at 20 items and exceeds 50 ms per render at 50–100 items.
If the target phone behaves like this profile, the single-rebuild cost
(not just burst frequency) needs 12B.2. Confirm on hardware before acting.

## Performance trace (real device — to be filled)
- Scripting:
- Rendering:
- Painting:
- Dropped frames:
- Main-thread bottleneck:

## Web Vitals (real device — to be filled)
- LCP:
- CLS:
- INP: measured / not measured

## Functional regression (to be confirmed on device)
- Search:
- Filter:
- Sort:
- Purchased:
- CRUD:
- Reduced Motion:
- Console errors:

## Ready-to-paste snippets

Dataset seeder (same generator as 12A/12B.1, run in test profile console):

```js
(() => {
  const statuses = ["wish", "saving", "ordered", "purchased"];
  const now = Date.now();
  const items = [];
  for (let i = 0; i < 100; i++) items.push({
    id: "t12c-" + i,
    name: "Sản phẩm benchmark số " + (i + 1),
    price: (i * 137000) % 20000000, image: "",
    link: "", status: statuses[i % 4], priority: "medium",
    category: "Test", note: "", createdAt: now - i * 86400000,
  });
  localStorage.setItem("wishlist.items", JSON.stringify(items));
  location.reload();
})();
```

Long-task observer (run before interacting):

```js
const longTaskEntries = [];
const longTaskObserver = new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    longTaskEntries.push({
      startMs: Number(entry.startTime.toFixed(1)),
      durationMs: Number(entry.duration.toFixed(1)),
    });
  }
});
longTaskObserver.observe({ type: "longtask", buffered: true });
function reportLongTasks() {
  console.table(longTaskEntries);
  return {
    count: longTaskEntries.length,
    maxMs: Math.max(0, ...longTaskEntries.map((x) => x.durationMs)),
    totalMs: longTaskEntries.reduce((s, x) => s + x.durationMs, 0),
  };
}
```

Temporary render instrumentation (benchmark build only, never commit):

```js
function render() {
  const startedAt = performance.now();
  try {
    // existing render() body stays here
  } finally {
    performance.measure("wishlist-render", { start: startedAt, end: performance.now() });
  }
}
```

## Decision
- Keyed DOM reconciliation: HOLD (pending real-device evidence)
- Evidence: x4-throttle emulation suggests risk at 50–100 items on slow
  CPUs, but emulation is not a device measurement.
- Risks: keyed reconciliation touches Tilt Engine, card lifecycle and
  Purchased Celebration; do not proceed without hardware confirmation.
