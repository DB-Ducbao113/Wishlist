# Dream Vault V7 — Final Release Report (17G)

> **Repo:** `DB-Ducbao113/Wishlist` · **Branch:** `feature/cinematic-motion-v7`
> **Ngày:** 14/10/2026 · **Ngân sách:** $0 · **Tag:** `ui-v7.0.0`
> Phụ lục của [Mobile Visual Review 17F](mobile-visual-review.md) — xử lý tồn đọng §7/§10 của báo cáo đó (CTA phụ / Mobile Dock overlap trên màn hình ngắn).

## 1. Tổng kết

| Hạng mục | Kết quả |
| --- | --- |
| Hotfix CTA/Dock (17G) | ✅ **47/47 PASS**, console 0 lỗi |
| 17F suite rerun trên bản hotfix | ✅ **91/91 PASS**, console 0 lỗi |
| Desktop 1280/1440/1920 | ✅ SHA256 byte-identical (không đổi) |
| 375×812 / 430×932 / 768 / 1024 | ✅ SHA256 byte-identical so với 17F (không đổi) |
| Performance @375×812 | ✅ 0 longtask, CLS 0.0000 (xem §6) |
| Firebase/Auth/Sync/CRUD | ✅ Không file nào bị thay đổi |
| Tags V4/V5/V6 | ✅ Còn nguyên |
| **Quyết định** | **PASS — gắn tag `ui-v7.0.0`** |

## 2. Vấn đề được sửa (tồn đọng 17F §7/§10 — pre-existing từ V5)

Tại scroll 0 trên màn hình ngắn, CTA phụ của Hero nằm một phần sau Mobile Dock:

| Viewport | CTA phụ bottom | Dock top | Lỗi overlap (trước) |
| --- | --- | --- | --- |
| 375×667 | 605px | 583px | **−22px** (đuôi nút bị che) |
| 320×700 | 630px | 616px | **−14px** |

## 3. Cách sửa — rhythm dọc tại tier màn hình ngắn

Thêm đúng **một media block** vào cuối `css/cinematic-v7-mobile.css` (file 17F, vẫn là stylesheet duy nhất của V7 trên mobile):

```css
@media (max-width: 640px) and (max-height: 740px) { /* cùng trigger với hotfix V5 */ 
  .hero.hero--v5 { padding-top: 16px; }          /* 24 */
  .hero--v7 .hero__eyebrow { margin-bottom: 8px; } /* 12 */
  .hero--v7 .hero__description { margin-top: 6px; }/* 12 */
  .hero--v7 .hero-v3__actions { margin-top: 8px; gap: 6px; } /* 16 / 8 */
  .hero--v7 .hero-v3__primary,
  .hero--v7 .hero-v3__secondary { min-height: 48px; } /* 52 / 50 */
}
```

- **Không** ẩn CTA phụ, **không** tắt Dock, **không** đụng `z-index` (tránh phá Dialog/sticky), **không** đụng safe-area (`bottom: max(10px, env(safe-area-inset-bottom))` của Dock giữ nguyên).
- Chỉ nén nhịp dọc cùng tier với hotfix V5 sẵn có (`≤640w × ≤740h`) → **375×812, 430×932, tablet, desktop không nhận thay đổi nào** (chứng minh §5).
- Target nút 48px ≥ 44px (touch target tối thiểu).
- `grid gap`, line-height description (1.5), footer, visual stage, plaque — giữ nguyên.

## 4. Số đo trước/sau (scroll 0, dataset DS5)

| Viewport | Primary | Secondary | Dock top | Clearance (trước → sau) |
| --- | --- | --- | --- | --- |
| 320×700 | 494.2–542.7 (h48.5) | 548.7–**596.7** (h48) | 616 | −14 → **+19.3px** ✅ |
| 375×667 | 468.7–517.2 (h48.5) | 523.2–**571.2** (h48) | 583 | −22 → **+11.8px** ✅ |
| 375×812 | 550.3–602.3 (h52) | 614.3–664.3 (h50) | 728 | +63.7px (tier không kích hoạt) |
| 430×932 | 526.2–578.2 (h52) | 590.2–640.2 (h50) | 848 | +207.8px (tier không kích hoạt) |

## 5. Bằng chứng

### 5.1 Ảnh before/after (viewport, scroll 0)

| Before (17F, overlap) | After (17G, thông thoáng) |
| --- | --- |
| <img src="img/fx-b-view375.jpg" width="270" alt="375×667 trước"> | <img src="img/fx-a-view375.jpg" width="270" alt="375×667 sau"> |
| <img src="img/fx-b-view320.jpg" width="270" alt="320×700 trước"> | <img src="img/fx-a-view320.jpg" width="270" alt="320×700 sau"> |
| <img src="img/fx-b-view375x812.jpg" width="270" alt="375×812 trước"> | <img src="img/fx-a-view375x812.jpg" width="270" alt="375×812 sau — không đổi"> |

Ảnh full-page: `img/fx-b-full320.jpg` ↔ `img/fx-a-full320.jpg`, `img/fx-b-full375x667.jpg` ↔ `img/fx-a-full375x667.jpg`.

### 5.2 Hash — chỉ 2 size ngắn thay đổi, mọi thứ khác byte-identical

Full-page PNG SHA256 (headless, `prefers-reduced-motion`):

| Size | 17F (trước hotfix) | 17G (sau hotfix) | Kết luận |
| --- | --- | --- | --- |
| 320×700 | (khác) | `520297ed6e06abbb…ab24cef6` | thay đổi — **mong đợi** (tier hotfix) |
| 375×667 | (khác) | `6b0e8a379f27cc34…c14107d67` | thay đổi — **mong đợi** (tier hotfix) |
| 375×812 | `72997b74…` | `72997b747715e149…6809d76b1` | **giữ nguyên** |
| 430×932 | `bbada351…` | `bbada351939f5d44…e1aa8ff9` | **giữ nguyên** |
| 768×1024 | `a84df9f9…` | `a84df9f9af66d907…73e42cef4` | **giữ nguyên** |
| 1024×768 | `71c75e41…` | `71c75e412731b7a8…a1c8f30` | **giữ nguyên** |
| 1280×900 | `90139b63…` | `90139b63a79f6c14…749cd8271` | **giữ nguyên** (desktop frozen) |
| 1440×900 | `8748c342…` | `8748c34230db4a44…80cafb02` | **giữ nguyên** |
| 1920×1080 | `29b672aa…` | `29b672aa510995c5…8099f6715` | **giữ nguyên** |

### 5.3 Required QA (spec 17G)

| # | Check | Kết quả |
| --- | --- | --- |
| 1 | `elementFromPoint` tâm **và** gần đáy cả 2 CTA = chính CTA đó | PASS @4 size |
| 2 | Giao điểm rect CTA × rect Dock (2D area) = **0** | PASS @4 size |
| 3 | CTA chính mở dialog (dock tự ẩn khi dialog mở — rule V3) | PASS |
| 4 | Click thực (CDP mouse) vào tâm **và** điểm đáy CTA phụ → nhảy `#grid` | PASS |
| 5 | Dock ẩn khi Search focus / hiện lại sau blur | PASS |
| 6 | 320×700, 375×667, 375×812, 430×932 | PASS (47/47) |
| 7 | Tablet 768/1024 + desktop 1280/1440/1920: dock ẩn, tier không kích hoạt, 0 tràn ngang, 0 console lỗi | PASS |
| 8 | Ảnh before/after | §5.1 |
| 9 | Báo cáo này | `final-release-report.md` |

Ngoài ra: suite 17F đầy đủ rerun trên bản hotfix — **91/91 PASS** (gồm functional CRUD/search/filter/sort/dialog/dock A-B, reduced-motion, edge cases, desktop frozen proof).

## 6. Performance @375×812 (2 lượt, `17f-perf.js`)

| Lượt | Idle 6s | Scroll 10s | FPS | Long tasks | CLS |
| --- | --- | --- | --- | --- | --- |
| 1 | 0.06s | 0.31s | 130 | 0 | 0.0000 |
| 2 | 0.07s | 0.29s | 130 | 0 | 0.0000 |

Baseline 17F: idle 0.05, scroll 0.25–0.26, FPS 129–130. Chênh lệch trong biên độ đo của headless benchmark; 375×812 nằm ngoài tier hotfix và **byte-identical** (§5.2) nên không có thay đổi render nào ở size đo perf. **Không regression P1.** Hardware FPS/INP trên thiết bị thật: NOT VERIFIED (không có thiết bị trong budget $0).

## 7. Checklist Final 17G Release Gate

| # | Item | Trạng thái |
| --- | --- | --- |
| 1 | 17F Mobile QA 91/91 PASS | ✅ (rerun trên bản hotfix: 91/91) |
| 2 | Desktop V7 visual regression PASS | ✅ SHA256 byte-identical 1280/1440/1920 |
| 3 | Cả hai Hero CTA không bị Dock che | ✅ clearance +19.3px @320, +11.8px @375×667; overlap area = 0 @4 size |
| 4 | Search/Filter/CRUD/Status PASS | ✅ theo suite 17F section C |
| 5 | Reduced Motion và focus-visible PASS | ✅ suite 17F section D |
| 6 | Mobile 320/375/430 không overflow | ✅ suite 17F sections B/G |
| 7 | Tablet 768/1024 PASS | ✅ hash giữ nguyên + structural |
| 8 | Desktop 1280/1440/1920 PASS | ✅ hash giữ nguyên |
| 9 | Performance không regression P1 | ✅ §6 |
| 10 | Không thay Firebase/Auth/Sync/CRUD | ✅ diff V7 = 1 CSS + 1 dòng link (+ QA docs) |
| 11 | Final release report đã push | ✅ file này |
| 12 | Tags V4/V5/V6 nguyên vẹn | ✅ `ui-v2.0.0`…`ui-v6.0.0` không đổi |

## 8. Hạn chế / NOT VERIFIED (giữ nguyên từ 17F)

- Touch/keyboard/hardware perf trên thiết bị thật, background-tab throttling, 50+ sản phẩm: NOT VERIFIED (không có thiết bị/thời gian trong budget).
- Nợ tích lũy CSS V2–V5 và giám sát chi phí `drop-shadow`: để lại cho vòng phát hành sau.

## 9. Kết luận

Hotfix 17G giải quyết dứt điểm tồn đọng CTA/Dock cuối cùng của V5 với **một media block CSS** (41 dòng, cùng trigger với hotfix V5 sẵn có), không đụng Dock/z-index/safe-area, không ảnh hưởng bất kỳ size nào ngoài tier màn hình ngắn. **Khuyến nghị: PASS — gắn tag `ui-v7.0.0`.**
