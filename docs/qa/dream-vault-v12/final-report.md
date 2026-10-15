# Dream Vault V12 — Product Presentation 3.0 — Final QA Report

**Branch:** `feature/product-presentation-v12`
**Baseline:** `ui-v11.0.0` (`955521612179891ee53b1d0aa2f76b6f4c9fc628`)
**Budget:** $0 — no paid libraries, no external fonts, no new services
**Status:** **QA COMPLETE — GO (release candidate)**. Tag `ui-v12.0.0` intentionally NOT created before the owner's final review.

> Honesty note: all browser evidence was produced with headless Chrome on the QA machine
> (`127.0.0.1`, Python static server). It does **not** represent real devices. Every number
> below is reproducible from the harness scripts and JSON kept in `docs/qa/dream-vault-v12/img/`.

---

## 1. Scope of change vs `ui-v11.0.0`

| File | Change |
| --- | --- |
| `css/product-v12-presentation.css` | New isolated presentation layer (stage gradients, product mount, featured exhibit, content/action hierarchy, Quick View backdrop, responsive + reduced-motion). |
| `wishlist.html` | Loads the V12 CSS after V11; appends one decorative `aria-hidden` stage caption to each product stage. **No** Firebase/Auth/Sync/CRUD/schema change. |
| `docs/qa/dream-vault-v12/` | This report, `qa-gate.md`, machine-readable JSON, before/after screenshots. |

Functional contract preserved: all element IDs, form owners, event handlers, and the
`#grid` / `#empty` / `#resultStatus` nodes are untouched. The V12 layer loads **last**, after
`immersive-v11-workspace.css`, so it can only refine — never restructure — the V11 workspace.

---

## 2. Defects found and fixed during the sprint

### D1 — **P1 layout defect: product frame collapsed → 128px dead band (FIXED)**
The committed V12 CSS set `.product-media__frame { position: relative; z-index: 1 }`.
`gallery.css` positions that frame `absolute; inset: 0` to **fill** the stage. Overriding
`position` collapsed the frame to content height, leaving ~128px of empty stage on **every**
card (measured: media 354px, frame 227px). The first screenshot pass showed the cards looking
broken.

Fix: keep `position` untouched and rely on `z-index` only (an absolutely-positioned element
already accepts `z-index`). Measured after fix: media 538px → frame 537px (featured),
354px → 317px (regular, the remaining 18px is the intended mount inset, see §3).

### D2 — **Repeated decorative label (FIXED)**
`PRIVATE COLLECTION` was rendered on **every** card, duplicating the existing `OBJECT 00X`
plaque and violating the V11 visual language ("no duplicate object labels"). The caption is
now reserved for the flagship (first) exhibit only.

### D3 — **Ornament cleanup (FIXED)**
The stage ring used a double `box-shadow` halo; reduced to a single soft ring.

### D4 — Test-only issues (NOT app bugs, documented)
- Broken-image fallback: an external `.invalid` host **hung** instead of erroring in this
  environment (DNS wildcard), and the lazy-loaded card was below the fold. The app fallback is
  correct — verified with a same-origin `404` and an explicit `scrollIntoView`. The suite now
  scopes the “0 console errors” assertion to JavaScript errors and reports resource-network
  errors separately (a bad user image URL legitimately logs a resource error).

---

## 3. Substantial composition improvement (not only shadow/animation)

Per the V12 gate ("if staging appears too decorative, improve composition"), the product stage
was changed at the layout level, not merely decorated:

- **Product mount:** the image frame is now an **inset mount board**
  (`inset: clamp(10px,1.6vw,18px)`, rounded, hairline edge) sitting inside the lit stage — the
  product reads as *displayed on a mount*, with a real geometry change (frame width < media
  width, verified programmatically).
- **Lit stage:** a deliberate two-layer gradient backdrop replacing the flat V11 stage.
- **Flagship exhibit:** full-canvas span kept; distinct gradient + larger serif title + the
  single caption.
- **Hierarchy:** actions separated by a hairline rule, `Xem chi tiết` raised to a 44px primary
  target with a 3px focus-visible ring; title/price typography tightened.

Gallery and Quick View now share one visual language (same stage treatment, matching ring).

---

## 4. Test results

### 4.1 V12 browser suite — **40 / 40 PASS**
`img/browser-qa.json` — covers: CSS loaded & applied; image/media containment and no horizontal
overflow at **11 viewports** (1280/1440/1920 · 768/1024 · 320/375/430 ×2 heights); stage caption
once-per-card and **visible only on the featured exhibit**; featured span + larger title;
purchased signal preserved; **Card Tilt safety** (V12 CSS does not touch
`.wishlist-card__surface`); view-detail focus/keyboard/Edit bridge/focus-restore; no-link card;
broken-image → placeholder; 0/1/2/50 items; rail visible; hero CTA + dock hit-testing;
accessibility; reduced motion; JavaScript console errors = 0.

### 4.2 Regression (full, on the V12 build)

| Suite | Result | Evidence |
| --- | --- | --- |
| V9 regression | **128 / 128 PASS** | `img/regression-v9.json` |
| V10 regression | **26 / 26 PASS** | `img/regression-v10.json` |
| V11 suite | **34 / 34 PASS** | `img/regression-v11.json` |
| V12 suite | **40 / 40 PASS** | `img/browser-qa.json` |

V9/V10 run in the documented **`V11EQ` equivalent mode** (run against the V11/V12 workspace).
The same six assertions that V11 intentionally superseded remain superseded identically under
V12 — V12 does not change card widths, the featured full-canvas span, or the V10 toolbar, so no
*new* divergences are introduced beyond the already-approved V11 set.

---

## 5. Performance benchmark — V11 (`ui-v11.0.0`) vs V12

Same machine, same headless Chrome, same dataset, same viewport; median of 3 runs.
`img/perf-v11-v12.json`.

| Scenario | V11 idle/scroll fps | V12 idle/scroll fps | V11/V12 max gap | long tasks | CLS |
| --- | --- | --- | --- | --- | --- |
| Mobile 375×812 | 60.6 / 60.0 | 60.6 / 60.0 | 19.0 / 18.3 ms | 0 / 0 | 0 / 0 |
| Desktop 1440 | 59.9 / 60.0 | 59.9 / 60.0 | 16.9 / 16.8 ms | 0 / 0 | 0 / 0 |
| Gallery 1 / 12 / 50 items | 60.0 | 60.0 | ~19 / ~18.6 ms | 0 / 0 | 0 / 0 |
| CPU throttle 4× (mobile) | 60.8 / 59.9 | 60.9 / 59.8 | 17.7 / 17.7 ms | 0 / 0 | 0 / 0 |
| Reduced motion (mobile) | 60.6 / 60.0 | 60.6 / 60.0 | 18.6 / 18.3 ms | 0 / 0 | 0 / 0 |

Quick View open/close: V11 open median **31.8 ms** / V12 **31.3 ms**; close 33.4 ms both.
**Conclusion: no measurable performance regression from V12.**

---

## 6. Accessibility

`img/a11y.json`.

| Check | V11 | V12 |
| --- | --- | --- |
| Interactive elements with an accessible name | 24 / 24 | 24 / 24 |
| Product images missing `alt` | 0 | 0 |
| Decorative plaque/caption `aria-hidden` | yes | yes |
| Title/price text contrast | 16.56 : 1 | 16.56 : 1 |
| Focus-visible outline on view button | 2px solid | **3px solid** |
| Reduced-motion honoured | yes | yes |

The primary button uses a **background gradient**, so its text contrast could not be computed
from `backgroundColor` alone (automated value not meaningful); visually it is white text on a
violet gradient and matches the frozen V9 primary. No accessibility regression.

---

## 7. Before / after screenshots (same dataset, V11 vs V12)

`docs/qa/dream-vault-v12/img/` — 28 matched pairs (`v11-*` vs `v12-*`), full-page and element
crops: desktop 1280/1440/1920, tablet 768/1024, mobile 320/375/430, gallery grid, featured
exhibit, long-title, purchased, no-link, Quick View (desktop + mobile), add dialog, empty/single/
12-item states. Representative set:

- `v11-grid-1440.jpg` / `v12-grid-1440.jpg` — the mount + lit stage vs the flat V11 stage
- `v11-card4-1440.jpg` / `v12-card4-1440.jpg` — the D1 dead-band fix on a regular card
- `v11-card1-1440.jpg` / `v12-card1-1440.jpg` — flagship exhibit
- `v11-qv-1440.jpg` / `v12-qv-1440.jpg` — Quick View unified treatment
- `v11-mcard-375x812.jpg` / `v12-mcard-375x812.jpg` — mobile card
- `v11-mgrid-320x568.jpg` / `v12-mgrid-320x568.jpg` — 320px containment

---

## 8. Honest visual assessment

V11 delivered the **structural** redesign (two-column Discovery Rail + Collection Canvas). V12
is a **presentation refinement** on top of it: a lit product stage, an inset product mount, a
de-duplicated flagship caption, and a unified Gallery↔Quick View language. After the D1 fix the
cards no longer look broken and the composition reads as intentional; the delta versus V11 is
**clear but incremental**, not another structural overhaul. It meets the gate's "not merely 1–2
shadows" bar because the change is at the layout/geometry level (mount inset, stage restructure,
hierarchy) plus a genuine defect fix.

---

## 9. Deferred / not attempted (carried, unchanged)

- Real-device performance and background-tab throttling.
- 50+ products on weak hardware.
- CSS V2–V5 consolidation debt.
- Full WCAG audit (axe) — only the targeted checks in §6 were run.
- Card min-width behaviour with real product imagery (263–285px observation from V11).

---

## 10. Verdict

**GO (release candidate).** Every required suite passes on the V12 build (V12 40/40, V9 128/128,
V10 26/26, V11 34/34), performance is unchanged, accessibility is not regressed, and the two
real defects found (D1 P1 layout, D2 duplicated label) are fixed. `ui-v12.0.0` is **not** created
here — awaiting the owner's final review. Any future defect will be fixed forward on a branch,
never by editing frozen tags.

**Branch HEAD at QA time:** `571b7f477b7fdcfff368ef51121a0e3b137573b1` (+ this report commit).
