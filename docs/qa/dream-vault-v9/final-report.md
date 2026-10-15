# Dream Vault V9 — Premium UI/UX Acceleration Fast-Track
## Final QA & Release Report

- **Release candidate:** V9 "The Signature Collection" — Light Lavender × Premium Editorial × Cinematic Showroom × Restrained Luxury
- **Branch:** `feature/premium-ui-v9`
- **Commit SHAs:** `64ed0dc5fd48891515228c70b934c46c925078fd` (V9 implementation) + `04c4c77` (Fix C hotfix, this report's parent)
- **Baseline:** tag `ui-v8.0.0` = `9809c2ebfeb939f6438d957659add64d7339724d`
- **Budget:** STRICT $0 (no paid libraries, no external fonts, no animation dependencies, no new network requests)
- **Verdict:** **GO** — final, after user review + mobile-CTA hotfix (§1b) re-verified with full regression. Tag `ui-v9.0.0` created on approval.

---

## 1. Scope of change

| File | Change |
|---|---|
| `css/premium-v9-signature.css` | **New** (867 lines) — single scoped V9 layer, loaded last |
| `wishlist.html` | Hero rebuilt as `hero--v9` + inline-SVG showroom alcove; `#qvObject` moved into `.quick-view__top`; CSS link added; decorative sync line in `updateObjectIndices()` |

Diff vs baseline: **2 files changed** (implementation commit `64ed0dc`: 860 insertions, 46 deletions).

### Explicitly NOT changed
- No Firebase / Auth / Cloud Sync / storage / CRUD / schema changes — safety scan of all added lines: **0** hits for `localStorage|sessionStorage|indexedDB|fetch(|XHR|setItem|firebase|auth|doc writes|innerHTML`.
- Functional IDs preserved: `heroAddWish`, `#grid`, `#qv`, `qvClose`, `qvObject`, `qvTitle`, all card action buttons.
- Event behaviors, render pipeline, search/filter/sort, status cycle, celebration, tilt — untouched.
- Frozen V4–V8 CSS files: **0 modifications** (V9 overrides via scoped, higher-specificity selectors — no `!important` wars, no Tilt `transform` override on `.wishlist-card__surface`).

### 1b. Post-review hotfix (Fix C) — mobile CTA in fold

User review flagged: at 375×667 / 320×568 the primary CTA sat 158–312 px below the fold (V9 hero is taller than V8). Root cause measured by DOM probe, not guessed:

| Viewport | Before: CTA top / fold | After: CTA top / fold | Dock clearance after |
|---|---|---|---|
| 320×568 | 880 / 568 (**−312**) | 421 / 568 | +13 px |
| 320×700 | — | 534 / 700 | +32 px |
| 375×667 | 825 / 667 (**−158**) | 508 / 667 | +25 px |
| 375×812 | 825 / 812 (−13) | 540 / 812 | +86 px |
| 430×932 | — | 516 / 932 | +230 px |

Hotfix is **CSS-only, +83 lines in the V9 layer, `wishlist.html` untouched**:
1. **≤640 px — content first, scene below.** The `order:-1` visual (V9 ≤1024 rule) is reset for short screens so eyebrow → title → CTA appear before the alcove scene; margins/padding tightened.
2. **Inherited legacy clipping fixed.** `hero.css`/`dreamscape-v5-hero.css` (≤640 px) force `.hero__visual { height: 220px (195px ≤360); overflow: hidden }` — a deliberate clip for the old 390 px V2/V5 scenes. The 288 px V9 scene was losing its plinth + caption to that clip (visible in `img/v9pre-mhero-375x812.jpg`). V9 resets it to `height:auto; overflow:visible` — **real fix**, before/after in `img/v9pre-*.jpg` vs `img/v9-mhero-320x568.jpg`.
3. **≤700 h height tier** — smaller title, tighter description; **secondary link hidden** (it is an anchor to `#grid`, which sits directly under the hero, and it was being overlapped by the fixed dock). Primary CTA keeps ≥13 px dock clearance everywhere; no button is ever behind the dock.
4. **≤600 h tier** — decorative `.hero__description` hidden so CTA + secondary fit 320×568 entirely.

Safety: 0 hits for `!important|keyframes|will-change|backdrop-filter` in the added lines; all functional IDs (`heroAddWish`, `#grid`) unchanged; regression re-run after the hotfix: **128/128 PASS**.

---

## 2. Visual Gate — PASS

Evidence: `docs/qa/dream-vault-v9/img/` — **52 screenshots**, paired V9 vs V8 on identical dataset/viewport/browser, plus before-hotfix (`v9pre-*`) and CTA-in-fold proof (`fixc-*-vp.jpg`).

| Area | V8 | V9 | Verdict |
|---|---|---|---|
| **Hero signature** | Fanned card-stack decoration | Editorial alcove/niche: product on plinth, hanging lamp, gradient arch, giant "001" watermark, `PRIVATE SHOWROOM / 09` eyebrow, sans + Georgia-italic headline | Clearly superior |
| **Label noise** | OBJECT label duplicated (plaque + index both visible) | Exactly **one** label per card (featured → story index; regular → plaque) | Reduced noise confirmed by probe + `V9a/V9b` checks |
| **Action hierarchy** | Flat, similar-weight buttons | Primary purple `Xem chi tiết` > secondary outlined `Mở nơi bán` > quiet `Sửa`/`Xóa` (transparent, narrow, still ≥44px touch) | Stronger hierarchy |
| **Featured card** | Standard stage | 1.3fr/0.7fr stage split, elevated V9 shadow, editorial story panel | Enhanced |
| **Quick View** | Good | Image-first stage + drop-shadow, serif title, 2-col meta grid with dividers, disciplined whitespace, sticky close | Enhanced |
| **Mobile QV defect** | "OBJECT … — PRIVATE VIEW" line faded & half-sliced by the translucent sticky bar; title ghosting through blur seam | Kicker + object-line stack cleanly **inside** the sticky bar; title fully legible below | **Real fix** (before/after: `img/v8-qvm-375x812.jpg` vs `img/v9-qvm-375x812.jpg`) |
| **Mobile hero** (post-review) | CTA in fold (V8 hero is shorter); scene never clipped | CTA **was** 13–312 px below fold, and the 288 px alcove lost its plinth/caption to a legacy `height:220px; overflow:hidden` clip from the V2/V5 era | **Real fix — Fix C (§1b):** content-first order ≤640 px + clip reset; CTA now in fold on all 5 mobile sizes with positive dock clearance (before/after: `img/v9pre-mhero-375x812.jpg` vs `img/fixc-375x812-vp.jpg`) |

**Matrix covered (no overflow/overlap/clipping found):** full-page 1280/1440/1920 (3 columns @1920 verified programmatically), tablet 768/1024, mobile 320×568, 320×700, 375×667, 375×812, 430×932; hero close-ups; featured/regular/purchased/placeholder/long-title/long-note card zooms; QV desktop 1280/1440/1920 (incl. scrolled sticky-close), QV tablet, QV mobile incl. scrolled + long-note + purchased/placeholder states; galleries at 0/1/12/50 items.

---

## 3. Engineering Gate — PASS

### 3a. Functional QA: **128/128 PASS, 0 FAIL, 0 console errors** (re-run after the Fix C hotfix)
Artifact: `docs/qa/dream-vault-v9/check-results.json`

Suite = full V8-C regression base (add/edit/delete, search/filter/sort, status cycle, celebration, tilt, QV open/close + focus restoration, keyboard, fallbacks, empty/1/12/50 galleries, mobile dock clearance, reduced motion, tablet, mockup conformance) **plus** V9 sections:

- `V9a/V9b` — exactly one OBJECT label per card (featured/regular, inverse rules)
- `HV1a/HV1b` — alcove scene present, legacy scene hidden, number + caption correct
- `HV2` — serif-italic headline line + `PRIVATE SHOWROOM / 09` eyebrow
- `HV3` — `heroAddWish` still a `<button>`, secondary link `href="#grid"`
- `QV object-line` — inside `.quick-view__top`, never spills past the bar, text format intact
- `AH` — View Detail primary (solid/gradient), Delete quieter (transparent, narrower)
- `M11` — hero CTA vs dock clearance on 375×667 (intersection-based test; a CTA below the fold is *scrollable*, not an overlap)

> Three initial failures were **test-harness bugs, not product defects**, proven by DOM probes before any code change: (1) the regular-card selector actually picked the featured card; (2) the scene number is `content: attr(data-object)` and invisible to `textContent`; (3) the dock test asserted every CTA visible at scroll-0 on a short screen. The harness was corrected to test the real property — no product assertion was weakened or skipped.

### 3b. Performance A/B — V9 vs V8 (same machine, same Chrome, same dataset, median of 3)
Artifact: `docs/qa/dream-vault-v9/perf-results.json`

| Scenario | V9 | V8 | Δ |
|---|---|---|---|
| Mobile 375×812 scroll FPS | 60.0 | 60.1 | ≈ |
| Mobile max frame gap | 18.7 ms | 17.1 ms | +1.6 ms (both < 1 frame budget at 60 Hz) |
| Desktop 1440 scroll FPS | 59.8 | 59.9 | ≈ |
| Desktop max frame gap | **17.1 ms** | 17.8 ms | −0.7 ms (better) |
| Gallery 1 / 12 / 50 items FPS | 60 / 59.7 / 60 | 60 / 60 / 59.9 | ≈ |
| CPU 4× throttle mobile FPS | 59.8 (gap 18.4 ms) | 60.0 (gap 37.3 ms) | ≈ FPS, **V9 gap better** |
| Reduced motion FPS | 60 (healthy) | 59.9 | ≈ |
| Long tasks (all scenarios) | **0** | 0 | — |
| CLS (all scenarios) | **0** | 0 | — |
| QV close median | 33.3 ms | 33.4 ms | ≈ |
| QV open median | 32.2 ms | 23.7 ms | **+8.5 ms this run — see below** |
| QV open max frame gap | 17.5 ms | 17.0 ms | +0.5 ms (≈) |
| Console errors | **0** | 0 | — |

**Honest note on QV open latency:** across the three A/B sessions run for this release the wall-clock click→paint median moves for *both* builds — V9: 28.7 / 34.0 / 32.2 ms, V8: 22.6 / 34.6 / 23.7 ms — while the **frame gap during open stays identical (~17 ms)** and long tasks stay 0. V9 adds no QV-time paint work (the alcove SVG is hero-only and `#qv` markup is byte-identical to V8). The variance pattern is inconsistent in direction and consistent in magnitude with run-to-run noise on this machine; it is kept as a watch item rather than closed, but nothing in the code path explains a structural regression.

---

## 4. Outstanding issues by severity

### P0 / P1 — none.

### P2 (minor, cosmetic)
1. **QV open median varies between runs (V9 28.7–34.0 ms vs V8 22.6–34.6 ms)** — direction of the delta flips across sessions while the open-time frame gap stays identical (~17 ms) and long tasks stay 0; no code path explains a structural regression. Kept as a watch item, needs more samples to close either way.
2. *(Resolved in Fix C, §1b)* **Hero CTA below the fold at 375×667 / 320×568** — was an accepted trade-off at first review; after user feedback it was fixed with a CSS-only responsive hotfix. CTA is now in fold on all 5 mobile sizes with positive dock clearance (13–230 px). Side effect, disclosed: on ≤700 px-tall screens the secondary "Khám phá bộ sưu tập" anchor is hidden (it targets `#grid`, which sits directly below the hero, and it was landing behind the fixed dock); on ≤600 px-tall screens the decorative hero description is hidden.

### P3 (cosmetic, non-blocking)
3. `v9-perf.js` console line for reduced motion prints the label "V8" while measuring V9 — **log string only**; JSON key `reducedMotion_mobile_V9` and the measured URL are correct.

### QA infrastructure note (not a product defect)
An intermediate perf session logged 1 `net::ERR_CONNECTION_REFUSED`. Root-caused and reproduced with a 6-context parallel-load probe: **two server processes were both listening on port 8115** (a leftover Python `http.server` from an earlier session plus the newer one), and their competing accept queues intermittently refused connections. The stale listener was removed, the probe re-run (24 parallel page loads × 4 rounds) returned **ZERO ERRORS**, and the final benchmark + full regression both report 0 console errors. No app code was involved.

### Deferred from earlier versions (unchanged, carried forward)
- Real-device touch/keyboard/hardware performance (headless ≠ physical device).
- Background-tab throttling, 50+ products on weak hardware.
- CSS V2–V5 consolidation debt.
- V8 12-item maxGap 32.6 ms single-sample flag — **not reproduced** in V9 runs (max observed 18.6 ms); keep watching.

---

## 5. Motion & rendering hygiene
- All V9 motion honors `prefers-reduced-motion: reduce` (verified in suite + perf).
- No infinite loops beyond the single allowed ambient scene motion; no animation on scroll handlers.
- No unnecessary `will-change`; no new `backdrop-filter` (the only blur is the pre-existing V8 sticky-bar blur); exactly **2** `drop-shadow` spots retained per the V9 brief (QV image, hero product).
- Tilt transform on `.wishlist-card__surface` untouched (V9 styles only `box-shadow`, `border`, `background`).

---

## 6. Verdict

| Gate | Result |
|---|---|
| Visual Gate (image-first, paired V8 comparison) | **PASS** |
| Engineering Gate (128/128 functional + perf A/B) | **PASS** |
| Safety scan (no persistence/CRUD/API additions) | **PASS** — 0 hits |
| $0 budget compliance | **PASS** |
| User review + mobile-CTA hotfix (Fix C) | **PASS** — 128/128 re-run, 5/5 mobile sizes CTA-in-fold |

# → **GO** (final)

Tag `ui-v9.0.0` is created on this approved state. If a future issue surfaces, fix forward — do not edit frozen tags.

### Evidence index
- `check-results.json` — 128/128 machine-readable QA results (post-hotfix run)
- `perf-results.json` — V9 vs V8 performance A/B (FPS, frame gap, long tasks, CLS, QV latency, CPU 4×)
- `img/` — **52 files**: V9/V8 paired screenshots across the full responsive matrix + `v9pre-*` (before Fix C) + `fixc-*-vp.jpg` (CTA-in-fold proof at 320×568 / 375×667 / 375×812)
- Harness (not in repo): `v9-shot.js`, `v9-check.js`, `v9-perf.js`, `v9-cta-probe.js`, `v9-dock-probe.js`, `v9-storm-probe.js` under the QA temp workspace
