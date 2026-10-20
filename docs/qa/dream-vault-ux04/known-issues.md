# UX-04 — Known Issues Registry

Branch: `feature/motion-auth-reset`
Baseline: `3f1fc4d760c9f5ab499f78fbcd453bcfe9580d2b`

This registry records every defect that is **not** caused by the UX-04 work,
with the evidence that proves it pre-dates this milestone. Nothing here was
silently ignored: each entry states whether it is fixed, still open, or out of
scope for UX-04, and why.

## How "pre-existing" was established

Each entry was re-run against two trees:

| Tree | SHA | Meaning |
|------|-----|---------|
| pre-6 | `2e34d89` | the branch before the six design commits landed on the remote |
| remote-6 | `1d24b10` | the branch HEAD this milestone started from |

A defect that fails on **both** trees cannot have been introduced by UX-04.

---

## 1. FUSION-01 `F02-28` / `F02-29` — hero pointer depth

| | |
|---|---|
| Status | **OPEN — out of scope for UX-04** |
| Symptom | `--hero-pointer-x` stays `0px`; the featured and side cards never separate by depth (`dMain: 0, dSide: 0`) |
| Pre-existing? | Yes — fails at `2e34d89` **and** `1d24b10` |
| Area | FUSION-01 hero parallax, not the product surfaces |
| Why not fixed here | The fix lives in the hero pointer-depth runtime and the `premium-v9` / `fusion-01` card transforms. UX-04 does not touch the hero, and changing the shared transform owners there would put 87 passing FUSION-01 checks at risk for a defect this milestone did not cause. |
| Remediation | Separate hero-parallax milestone. |

## 2. FUSION-02 `F01-02` / `F01-04` / `F01-05` — scroll progress rail

| | |
|---|---|
| Status | **OPEN — out of scope for UX-04** (2 of 5 were fixed as a side effect) |
| Symptom | The rail is not drawn above the sticky header; the bar does not reach its final value at the end of the document; the bar is expected to animate with `transform` only |
| Pre-existing? | Yes — fails at `2e34d89` **and** `1d24b10` |
| Side effect | UX-04's `scroll-padding-top` fix (UX-03) incidentally repaired `F01-07` (a content change re-measures the bar) and `F01-08` (a still page schedules no frames): the remote-6 tree failed **5**, the current tree fails **3**. |
| Why not fixed here | The remaining three are the scroll-rail's own geometry and animation contract (`fusion-02-cinematic-scroll.css` + its runtime), which is a different feature area. |
| Remediation | Separate scroll-rail milestone. |

## 3. FUSION-04 `F04-A02` / `F04-A03` — coarse-pointer ownership

| | |
|---|---|
| Status | **OPEN — out of scope for UX-04** |
| Symptom | The Quick View bottom sheet declares more than the two allowed property families, and its rules are not all inside the coarse-pointer gate |
| Pre-existing? | Yes — identical failure on `2e34d89` and `1d24b10` |
| Area | `css/fusion-04-mobile.css` — the coarse-pointer sheet |
| Interaction with UX-04 | UX-04 edited `css/immersive-v8-quick-view.css` (the sheet's own owner) and **not** `fusion-04-mobile.css`, so the gate is unchanged. UX-04's new mobile rule is scoped to `max-width: 640px` inside the Quick View's own file. |
| Remediation | Fold into the FUSION-04 ownership cleanup. |

## 4. M2 — three reveal-runtime checks

| | |
|---|---|
| Status | **OPEN — out of scope for UX-04** |
| Symptom | `all reveals resolved after scroll`, `no invisible sections`, `reveal attributes cleaned up` — three sections stay unrevealed |
| Pre-existing? | Yes — identical `28 PASS / 3 FAIL` on `2e34d89` and `1d24b10` |
| Area | The page-level `DVReveal` IntersectionObserver runtime in `<head>` |
| Remediation | Separate reveal-runtime milestone. |

## 5. Sidebar cosmetic truncation

| | |
|---|---|
| Status | **OPEN — cosmetic, known** |
| Symptom | In the 280px collection rail the `SẮP XẾP` select shows "Mới tl" and the search placeholder is clipped to "Tên món, danh mục" |
| Cause | The rail is 280px (the brief's 260–280px band) and holds a two-column filter grid, so each select is ~100px wide |
| Introduced by | UX-03, not UX-04 |
| Why not fixed here | The two options are (a) shorten the option labels, which is copy the QA contract reads, or (b) widen the rail, which would leave the brief's band. Both are a design decision, not a UX-04 defect. |
| Remediation | Decide the label copy, or move the sort select to its own full-width row in the rail. |

## 6. `F4-6-04` performance variability

| | |
|---|---|
| Status | **OPEN — flaky by construction, documented** |
| Symptom | "render(50 items) is within 35% (+5ms) of the pre-F4 baseline" fails on a loaded machine and passes on an idle one |
| Evidence | Same tree, same code: **FAIL** at 86ms under concurrent load, **PASS** at 45ms idle. The gate compares the *worst* of three render samples against a budget derived from a much older baseline tree. The first sample is a cold-start outlier (187–232ms) and dominates the "worst" figure. |
| Also seen | `F6-6-01` (render(100) under 90ms) and `M3-16` (render(100) under 100ms) behave the same way: they pass in isolation and fail under contention. A direct probe of both trees measured 43–58ms with fully overlapping distributions. |
| Pre-existing? | Yes — the same variability was measured at `2e34d89` and `1d24b10` |
| Remediation | Measure the **median** of the render samples instead of the worst, or discard the first cold sample. That is a change to the QA gate and needs its own review. |

---

## Summary

| # | Issue | Status | Pre-existing | Fixed in UX-04 |
|---|-------|--------|--------------|----------------|
| 1 | FUSION-01 F02-28/29 | open | yes | no |
| 2 | FUSION-02 F01-02/04/05 | open (2 of 5 repaired) | yes | no |
| 3 | FUSION-04 F04-A02/A03 | open | yes | no |
| 4 | M2 reveal checks (3) | open | yes | no |
| 5 | Sidebar truncation | open, cosmetic | yes (UX-03) | no |
| 6 | F4-6-04 / F6-6-01 / M3-16 perf | open, flaky | yes | no |

No entry above was introduced by the UX-04 changes, and no QA test was
weakened, skipped or re-scoped to make the milestone pass.
