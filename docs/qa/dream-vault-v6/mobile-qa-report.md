# Dream Vault V6 — Mobile Adaptation QA Report (Bài 16F)

**Ngày:** 14/10/2026
**Nhánh:** `feature/desktop-showroom-v6`
**Commit code 16F:** `afdf5c1` — style(ui): adapt V6 showroom to mobile
**Công cụ:** Headless Chrome (Puppeteer + puppeteer-core), device scale factor 1, zoom 100%, `isMobile`/`hasTouch` ở viewport ≤640px
**Dữ liệu:** dataset cục bộ ghi vào `localStorage` (không khởi tạo/đụng Firebase trong QA)

---

## 1. Thay đổi scope trước khi QA (yêu cầu mục 3 của 16F)

Trong `css/desktop-showroom-v6-gallery.css`:

- Rule `:hover` của Gallery: `@media (hover: hover) and (pointer: fine)` → **`@media (min-width: 1025px) and (hover: hover) and (pointer: fine)`**
- Rule `prefers-reduced-motion` của Gallery → **`@media (min-width: 1025px) và (prefers-reduced-motion: reduce)`**

Bằng chứng xác minh bằng probe hover thật (chuột di chuyển vào card, xác nhận điểm dưới con trỏ bằng `elementFromPoint`):

| Viewport | Border khi hover | Kết luận |
| --- | --- | --- |
| 768px | `rgba(145,122,230,.48)` (style V5, **không** phải V6) | Hover V6 KHÔNG áp dụng ✅ |
| 1024px | `rgba(145,122,230,.48)` (V5) | Hover V6 KHÔNG áp dụng ✅ |
| 1440px | `rgba(168,139,247,.55)` — đúng giá trị V6 | Hover V6 vẫn hoạt động ✅ |

## 2. File mới & import

- `css/desktop-showroom-v6-mobile.css` — chỉ CSS presentation, scope `body.dreamscape-v5`, `@media (max-width: 640px)` + `max-width: 380px` + reduced-motion. **Không `transform`, không override `:has(dialog[open])`, không đụng sân khấu Hero 320×700.**
- Import cuối trong `wishlist.html` sau `desktop-showroom-v6-workspace.css`. Không đổi HTML ID/JavaScript.

## 3. Viewport matrix — 9/9 PASS

| Viewport | Kết quả | Chi tiết computed |
| --- | --- | --- |
| 320×700 | ✅ | 1 cột, không overflow |
| 375×667 | ✅ | 1 cột, không overflow |
| 375×812 | ✅ | 1 cột, không overflow |
| 430×932 | ✅ | collection 1 cột, filter 2×2 (V5), gallery 1 cột |
| 768×1024 | ✅ | tablet V5: collection 1 cột, gallery 2 cột, dashboard 3 cột |
| 1024×800 | ✅ | tablet V5: filter 4 cột (V5), gallery 2 cột |
| 1280×900 | ✅ | desktop V6: wrap 1280, collection 2, filter 2×2, gallery 3 |
| 1440×900 | ✅ | desktop V6: wrap **1376** (không đổi so với 16E) |
| 1920×1080 | ✅ | desktop V6: wrap **1568** (không đổi so với 16E) |

Không viewport nào có overflow ngang; không có lỗi console/pageerror ngoài 404 cố ý (mục 5).

## 4. Kết quả kiểm thử chức năng — 28/28 PASS

Nguồn máy đọc: `mobile-functional-results.json` (0 FAIL).

| Nhóm | Trường hợp | Kết quả |
| --- | --- | --- |
| CTA/Dock | 320×700 và 375×667: `elementFromPoint` giữa `#heroAddWish` trả về chính CTA; Dock hiển thị, không giao chữ với CTA | PASS |
| Dialog | Mở từ Hero CTA → Add `Món mobile` 500.000 ₫ → 5 món, dashboard `1.007.589.999 ₫` | PASS |
| CRUD | Edit → 600.000 ₫ → `1.007.689.999 ₫`; Delete → native confirm → 4 món, `1.007.089.999 ₫` | PASS |
| Status | Chip cycle `Muốn mua → Đang để dành` | PASS |
| Search/Filter/Sort | Search `Sách` → 1; Filter purchased → 1; Sort price-desc → đúng món giá cao nhất; Clear OK | PASS |
| Dock + bàn phím | **Đúng hành vi V5 13D.1:** input focus → Dock `display:none` (nhường bàn phím); blur → Dock hiện lại, focus item được, outline `solid 3px rgb(104,80,188)`, kích thước 91×54 trong viewport | PASS |
| Ảnh | Ảnh 404 (`missing-404.png`) được app fallback → 4/4 img render, không vỡ layout; ảnh data-URI OK; không ảnh → placeholder | PASS |
| Long text | Tên 90+ ký tự (bị cắt có chủ đích theo V5), ghi chú dài, giá `999.999.999 ₫` → không tràn khung | PASS |
| Reduced Motion | `max-width:640 + reduce` → `transition-duration: 0s` | PASS |
| Hover scope | Tablet 768/1024 KHÔNG dính hover V6; desktop 1440 vẫn có hover V6 | PASS |
| Regression | Desktop 1280/1440/1920 giữ nguyên wrap/cột số từ 16E | PASS |

## 5. Console

- **0 lỗi JS/pageerror.**
- 6 log `Failed to load resource: 404` là **network log cố ý** từ URL ảnh `missing-404.png` dùng để kiểm chứng fallback — không phải lỗi mới. (Lọc theo URL trong test; các lỗi khác = 0.)

## 6. Screenshot (đã xem tay)

| File | Nội dung |
| --- | --- |
| `screenshots/v6-mobile-320x700-hero-dock.png` | 320×700: Hero + CTA nhìn thấy, Dock fixed phía dưới không che CTA |
| `screenshots/v6-mobile-375x812-full.png` | 375×812 full-page: 1 cột, dashboard, filter xếp dọc, gallery 1 cột, card có ảnh/không ảnh/tên dài |
| `screenshots/v6-mobile-430x932-full.png` | 430×932 full-page: Hero/Dashboard/Collection cân đối, filter 2×2 (V5) |

## 7. Checklist 16F — 15/15

| # | Hạng mục | Trạng thái |
| --- | --- | --- |
| 1 | Giới hạn Gallery V6 hover/reduced-motion ở desktop (`min-width:1025px`) | ✅ PASS (probe hover) |
| 2 | Tạo `desktop-showroom-v6-mobile.css` | ✅ PASS |
| 3 | CSS mobile import cuối | ✅ PASS |
| 4 | 320×700 và 375×667 CTA không bị Dock che | ✅ PASS |
| 5 | 375 và 430px không overflow | ✅ PASS |
| 6 | Gallery 1 cột, featured card không regression | ✅ PASS |
| 7 | Collection Search/Filter hoạt động | ✅ PASS |
| 8 | Dialog và Dock hoạt động đúng (kể cả nhường bàn phím V5) | ✅ PASS |
| 9 | Add/Edit/Delete, status chip | ✅ PASS |
| 10 | Ảnh lỗi, không ảnh, tên dài | ✅ PASS |
| 11 | Reduced Motion và focus-visible | ✅ PASS |
| 12 | Tablet 768/1024 giữ V5 | ✅ PASS |
| 13 | Desktop 1280/1440/1920 không đổi | ✅ PASS |
| 14 | Screenshot + báo cáo QA mobile | ✅ PASS (tài liệu này) |
| 15 | Diff không có Firebase/Auth/Sync/CRUD | ✅ PASS |

**Diff 16F:** `wishlist.html` (1 import link), `css/desktop-showroom-v6-gallery.css` (2 media query scope), `css/desktop-showroom-v6-mobile.css` (mới) + tài liệu/ảnh QA. Không file Firebase/Auth/Sync/storage/CRUD.

## 8. NOT VERIFIED (trung thực)

- **Bàn phím ảo phần cứng thật (Android/iOS):** headless Chrome không mô phỏng được — hành vi nhường bàn phím chỉ xác minh bằng rule CSS `:has(input:focus)` + computed style. **NOT VERIFIED trên thiết bị thật.**
- **Touch/đường đẫn cảm ứng thật, monitor vật lý:** chưa kiểm tra — chỉ headless với `hasTouch` flag.
- **Performance (FPS/INP):** chưa có số đo.
- **Firebase/Auth/Cloud:** cố tình không khởi tạo trong QA.

**Kết luận:** 16F đạt 15/15 checklist, 28/28 test — sẵn sàng cho Final V6 Review (quyết định tag `ui-v6.0.0` của bạn).
