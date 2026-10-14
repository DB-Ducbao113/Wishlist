# Dream Vault V5 — Final Visual QA (Bài 15F)

Date: 2026-10-14. Branch: `feature/dreamscape-v5` @ `b5edd18`.
V4 baseline: tag `ui-v4.0.0` (`29fb11c`).
Method: headless Chrome 155, fresh browser context per case, identical
seeded dataset (real image + no-image + no-link + long name/note +
purchased), no cloud sync. Tilt smoke via synthetic `pointermove`
(CDP mouse does not reliably fire pointer events in this harness —
identical on both versions, not a V5 signal).

## Screenshots

| File | Content |
|------|---------|
| `screenshots/v4-desktop-1440.png` | V4 gallery @1440 |
| `screenshots/v5-desktop-1440.png` | V5 gallery @1440 |
| `screenshots/v4-mobile-375.png` | V4 gallery @375 |
| `screenshots/v5-mobile-375.png` | V5 gallery @375 |
| `screenshots/v5-mobile-320.png` | V5 full page @320 |
| `screenshots/v5-mobile-430.png` | V5 full page @430 |
| `screenshots/v5-tablet-768.png` | V5 full page @768 |
| `screenshots/v5-dialog-mobile.png` | V5 add dialog @375 |
| `screenshots/v5-dialog-keyboard.png` | V5 dialog, body scrolled, input focused |

## Gate results (18/18)

| # | Check | Result |
|---|-------|--------|
| 1 | V4 vs V5 @1440 same dataset | PASS — same layout skeleton (3 cols, featured `span 2`), Dreamscape palette/ink/type applied, no breakage |
| 2 | V4 vs V5 @375 same dataset | PASS — 1 col both, no overflow either version |
| 3 | Layout 320/430/768, no overflow | PASS — 0 overflow, 0 console errors on all 8 runs |
| 4 | Hero 3D covers no text/CTA | PASS — 3 glass cards, SVG centered in foreground card |
| 5 | Dashboard + Collection unified | PASS — ink numerals, dream accents, coherent with hero |
| 6 | Gallery V4 / featured intact | PASS — featured composition + actions unchanged |
| 7 | Add/Edit/Delete + validation | PASS — add persists (+1), edit prefills "Sửa món", invalid submit blocked + toast |
| 8 | Search/Filter/Sort | PASS — search narrows, sort reorders, clear restores |
| 9 | Mobile dock + search focus | PASS — dock hides on `#q` focus, returns on blur; search jump focuses input |
| 10 | Dialog footer with keyboard focus | PASS (headless) — footer visible after scrolling body; real virtual keyboard NOT VERIFIED on hardware |
| 11 | Focus-visible / Reduced Motion | PASS — 3px dream-accent rings; `reduce` yields 0 running animations |
| 12 | Tilt / Purchased Celebration | PASS — synthetic tilt rotates (rx 2.95°/ry 4.13°) and damps to ~0; chip advances to `Đã mua` + toast |
| 13 | Console | PASS — 0 errors across all runs |
| 14 | Diff scope | PASS — 15E touched `wishlist.html` + `dreamscape-v5-mobile-interactions.css` only |
| 15 | Firebase/Auth/Sync | PASS — untouched; sync never initialized in QA |
| 16 | Tag `ui-v4.0.0` | PASS — intact, no V5 tag created in this gate |
| 17 | P0/P1 issues | PASS — none found; one known nuance below |
| 18 | Report + screenshots in repo | PASS — this file + `screenshots/` (9 PNG) |

## Known nuance (not a blocker)

At 320x700 with the page at scroll-top, the fixed mobile dock overlaps
the hero secondary CTA; the tap lands on the dock's Collection anchor
(elementFromPoint verified). The primary CTA stays tappable and the
fallback destination is equivalent (collection region). Standard
fixed-dock behavior on short viewports.

## Limits (honest)

- Real Android/iOS virtual-keyboard behavior NOT VERIFIED — headless
  cannot open one. Do not claim mobile-keyboard PASS for production.
- Performance traces (FPS/INP on hardware) remain open from Bài 12C.
- Tilt proven via synthetic events; CDP-mouse hover could not trigger
  it in this harness (equal on V4/V5).

## Decision input

No P0/P1 found. UI freeze tag `ui-v5.0.0` decision is with review —
this gate does not create it.
