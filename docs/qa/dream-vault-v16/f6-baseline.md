# Dream Vault V16.1 - F6.1 Baseline & Performance Diagnosis

Branch `feature/motion-auth-reset`, PR #1 -> `develop`. Baseline F5 HEAD
`4852b13`, verified with `git fetch` + `git rev-parse` (local == origin == HEAD,
working tree clean apart from the untracked `image/After Shave.webp`).

Everything below is measured on the F5 delivery tree. Nothing was changed to
produce these numbers. Raw data: `f6-baseline.json`, `f6-render-baseline.json`,
`f6-lighthouse-f5-src-{raw,gzip}.json`, `f6-lighthouse-f5-dist-{raw,gzip}.json`.

---

## 1. Static audit

| What | Value |
| --- | --- |
| CSS files on disk | **52** |
| CSS raw bytes (working tree) | 343 504 |
| `wishlist.html` | 219 639 (CRLF) / 213 826 (LF) |
| `wishlist-cloud.js` | 11 838 |
| `<link rel=stylesheet>` tags | **52, all in `<head>`** |
| render-blocking CSS requests | **52** |
| `url()` references in CSS | **0** |
| `@import` rules | **0** |
| `@media` blocks | 210 |
| `@keyframes` | 14 |
| selectors defined in more than one sheet | 124 (~14 KB of selector lines) |

**The 52 stylesheets are all genuinely referenced.** There is no unreferenced CSS
to delete. The 124 duplicate selectors are the milestone layering itself
(`legacy` -> `v2` -> ... -> `v16`); each sheet overrides the one before it, so
merging them would break the cascade. That is the architecture, not dead code.

`scripts/build-hosting.mjs` copies the whole `css/` directory into `dist`, so the
published surface is also 52 stylesheets.

## 2. The one safe, large lever

Because there are **0 `url()` references and 0 `@import` rules**, the 52 sheets
can be concatenated without breaking a single relative path or import order.

| | raw | gzip | requests |
| --- | --- | --- | --- |
| 52 separate sheets | 343 504 | 93 337 (sum of parts) | 52 |
| one concatenated sheet | 345 721 | **65 038** | 1 |
| **saving** | +2 217 | **-28 299 (-30.3 %)** | **-51** |

The raw number goes *up* slightly (one file header instead of 52) and the gzip
number goes down by 28 KB, because a single gzip stream shares one dictionary
across all 52 sheets instead of resetting it 52 times. That is the entire
benefit, and it needs no source change: it happens in the build.

## 3. Render benchmark

3 runs per size, medians. `firstRender` is the initial paint; `forced` is three
explicit `render()` calls after load (the app issues no re-render while idle, so
a steady-state number has to be forced).

| items | firstRender | forced `render()` | long tasks | LT max | FCP=LCP | CLS | DOM nodes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | 1 ms | 1 ms | 0-1 | 52 ms | 280 ms | 0 | 531 |
| 1 | 2 ms | 1 ms | 1 | 57-75 ms | 324 ms | 0.002 | 605 |
| 12 | 6 ms | 4 ms | 1 | 92-103 ms | 288 ms | 0.002 | 946 |
| 50 | 18 ms | 11 ms | 1 | 120-142 ms | 300 ms | 0.002 | 1 924 |
| 100 | 37 ms | 21 ms | 1-3 | 157-180 ms | 312 ms | 0.002 | 3 212 |

* `render()` costs **0.28 ms per item**. At 100 items the first paint is 37 ms.
* **Exactly one long task at every size** (the initial render), growing from
  52 ms to 180 ms with item count. The forced re-renders at 100 items occasionally
  add two more.
* FCP == LCP at every size: the first paint *is* the largest paint.
* CLS is 0.002 everywhere - the reveal animation, and it is negligible.

## 4. Runtime audit

| What | Value |
| --- | --- |
| `IntersectionObserver` instances | **1** (one for the whole reveal system) |
| `Element.animate()` calls at load | **0** (motion is user-triggered only) |
| `addEventListener` calls, 0 items | 73 |
| `addEventListener` calls, 12 / 50 / 100 items | 217 / 673 / 1 273 |
| **listeners per card** | **12, constant** |
| `updateCategoryFilter()` at 12 / 50 / 100 items | **0 ms** (max 0.3 ms) |

The listener count is 12 per card at every size - no leak, no growth anomaly,
and far below the pre-F4 figure of 20.69 per card. `updateCategoryFilter()` is
free, so P2-4 is a code-cleanliness note and **not** a performance problem. It is
left alone.

## 5. Lighthouse baseline

3 runs per cell, both transports, identical flags/categories/throttling to the
F4 and F5 runners. `dist` and source measure the same within noise.

| transport | form | perf (runs) | LCP (runs) | CLS | TBT | transfer | requests |
| --- | --- | --- | --- | --- | --- | --- | --- |
| raw | desktop | 58, 58, 58 | 4688, 4664, 4664 | 0 | 0 ms | 561 KB | 53 |
| raw | mobile | 71, 71, 71 | 4663, 4664, 4670 | 0 | 0 ms | 561 KB | 53 |
| gzip | desktop | 71, 71, 71 | 2594, 2574, 2573 | 0 | 0 ms | 162 KB | 53 |
| gzip | mobile | 93, 93, 93 | 2569, 2582, 2586 | 0 | 0 ms | 162 KB | 53 |

a11y 100, best-practices 100, SEO 100 in all 24 runs.

The spread inside a cell is 0-6 ms on LCP and 0 points on perf, so any F6
delta smaller than that is noise.

## 6. Diagnosis

1. **The payload is the problem, not the render.** 52 render-blocking requests
   and 561 KB raw / 162 KB gzip on the critical path, against a render cost of
   0.28 ms/item and one long task.
2. **The runtime is already healthy.** One observer, 12 listeners per card,
   zero `animate()` at load, CLS 0.002, TBT 0 ms. There is no listener leak or
   animation leak to clean up.
3. **The one lever that is both safe and large is build-time CSS
   concatenation**: -28 299 gzip bytes and -51 requests, with no source change
   and no cascade risk (0 `url()`, 0 `@import`).
4. Everything else in the F6.2 priority list is either not a problem
   (`updateCategoryFilter`, duplicate selectors) or is explicitly out of scope
   (minify that could break semantics, risky refactors).

**Conclusion for F6.2:** do the build-time concatenation, prove equivalence by
running the full F1-F5 suites against `dist`, and do not touch the source CSS.
