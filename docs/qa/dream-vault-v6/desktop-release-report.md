# Dream Vault V6 — Desktop Release QA Report (Bài 16E)

**Ngày:** 14/10/2026
**Nhánh kiểm thử:** `feature/desktop-showroom-v6`
**Commit V6:** `5f7aeee` — feat(ui): build V6 desktop collection workspace
**Baseline V5:** tag `ui-v5.0.0` — `e9bcdfb` (worktree độc lập, cổng 8116)
**Công cụ:** Headless Chrome (Puppeteer + puppeteer-core), device scale factor 1, zoom 100%
**Dữ liệu:** dataset cục bộ ghi vào `localStorage` (không khởi tạo/đụng tới Firebase trong QA)

---

## 1. Bằng chứng screenshot (9/9 file)

| File | Ghi chú |
| --- | --- |
| `screenshots/v5-desktop-1280.png` | Baseline V5 tại 1280px (full-page) |
| `screenshots/v6-desktop-1280.png` | V6 tại 1280px (full-page) |
| `screenshots/v5-desktop-1440.png` | Baseline V5 tại 1440px (full-page) |
| `screenshots/v6-desktop-1440.png` | V6 tại 1440px (full-page) |
| `screenshots/v5-desktop-1920.png` | Baseline V5 tại 1920px (full-page) |
| `screenshots/v6-desktop-1920.png` | V6 tại 1920px (full-page) |
| `screenshots/v6-featured-with-image.png` | Featured card có ảnh @1440 |
| `screenshots/v6-featured-no-image.png` | Featured card không ảnh (placeholder) @1440 |
| `screenshots/v6-collection-filters.png` | Collection workspace + filter 2×2 @1440 |

Dataset giống hệt nhau ở cả V5 và V6: 5 món, gồm 1 ảnh hợp lệ, 1 ảnh lỗi (404), 3 không ảnh; đủ 4 trạng thái; tên dài + ghi chú dài; giá từ 320.000 → 12.500.000 ₫.

## 2. Số liệu layout (computed, cùng dataset)

| Viewport | `.wrap` V5 | `.wrap` V6 | Hero V6 | Overflow X | Collection | Filters | Gallery |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1280 | 1240 | **1280** | 1200 | Không | 2 cột | 2×2 (select 341px) | 3 cột, featured `span 2` |
| 1440 | 1240 | **1376** | 1280 | Không | 2 cột | 2×2 (select 320px) | 3 cột, featured `span 2` |
| 1920 | 1240 | **1568** | 1440 | Không | 2 cột | 2×2 (select 354px) | 3 cột, featured `span 2` |
| 1024 | 1240 | 1240 (V5) | — | Không | 1 cột (V5) | 4 cột (V5) | 2 cột (V5) |
| 768 | — | V5 | — | Không | 1 cột (V5) | V5 | 2 cột (V5) |
| 375 | — | V5 | — | Không | 1 cột (V5) | 1 cột (V5) | 1 cột (V5) |
| 320×700 | — | V5 | — | Không | 1 cột (V5) | 1 cột (V5) | 1 cột (V5) |

**Nhận xét hình ảnh (đã xem tay từng ảnh):**

- **1280/1440/1920:** V5 bị kẹp cứng ở 1240px (lề trắng rất lớn tại 1440/1920). V6 mở rộng dần 1280 → 1376 → 1568px; hero, dashboard, collection và gallery đều tận dụng không gian thêm mà không bị kéo giãn mất cân đối.
- Hero: chữ và 3 thẻ cảnh không bị cắt; CTA "Thêm món yêu thích" hiển thị đủ.
- Collection: editorial 2 cột (heading trái, search + filter 2×2 phải) — nhãn và giá trị filter đọc rõ ở cả 3 kích thước (select ≥ 320px).
- Gallery: featured 2 cột với ảnh lớn hơn V5, các card thường cân đối 3 cột; typography tiêu đề/giá không bị cắt.
- Featured có ảnh và không ảnh đều cân đối (ảnh/placeholder chiếm cột trái, content + actions cột phải, nút không bị đẩy ra ngoài).
- Dashboard 3 stat-card đều dùng chung rhythm, số liệu không tràn.

## 3. Kết quả kiểm thử chức năng — 32/32 PASS

Chạy thật trên trình duyệt (không khai báo PASS dựa trên DOM suông):

| Nhóm | Trường hợp | Kết quả |
| --- | --- | --- |
| CRUD | Validation tên rỗng (dialog mở, `checkValidity=false`, không thêm item) | PASS |
| CRUD | Add (dialog submit) → 5→6 món, dashboard `21.090.000 → 21.790.000 ₫` | PASS |
| CRUD | Edit → giá 700k→900k, dashboard `21.990.000 ₫`, vẫn 6 món | PASS |
| CRUD | Delete → native confirm `Xóa "Món thêm QA"?` → 5 món, dashboard `21.090.000 ₫` | PASS |
| Status | Status chip click cycle: `Muốn mua → Đang để dành` | PASS |
| Search | Theo tên / danh mục / ghi chú — mỗi truy vấn đúng 1 kết quả | PASS |
| Filter | Status=purchased → 1; Priority=high → 2; Category=Công nghệ → 3 | PASS |
| Sort | price-asc, price-desc, newest, priority-desc — thứ tự đúng | PASS |
| Dashboard | Số liệu cập nhật đúng sau Add/Edit/Delete (xem trên) | PASS |
| Gallery | 1 món (featured `auto`, không span); 2 món (featured `span 2`); 5 món (3 cột, span 2) | PASS |
| Images | Ảnh hợp lệ hiển thị; placeholder "Chưa có ảnh"; ảnh 404 không vỡ layout | PASS |
| Long text | Tên 100+ ký tự, ghi chú dài, giá 999.999.999 ₫ → không tràn, không cắt tiêu đề | PASS |
| Interaction | Tilt: `--rotate-x/y` set khi pointermove, reset về 0 sau pointerleave | PASS |
| Interaction | `elementFromPoint` tại `#heroAddWish`, nút Buy, `#q`, `#fSort` — không bị lớp trang trí che | PASS |
| A11y | Focus-visible: outline `solid 3px rgb(117,101,232)` thấy rõ | PASS |
| A11y | `prefers-reduced-motion: reduce` → `transition-duration: 0s`, `animation: 0s` | PASS |
| Browser | Console/pageerror = 0 trong toàn bộ suite | PASS |
| Layout | 1280/1440/1920: không overflow, 2 cột, filter 2×2, gallery 3 cột, featured span 2 | PASS |
| Regression | 1024/768/375/320: giữ layout V5, không overflow | PASS |

Chi tiết từng dòng: `functional-results.json` (32 mục, 0 FAIL) — output máy đọc từ lần chạy cuối.

## 4. Gate 16E — Desktop Freeze

| # | Hạng mục | Trạng thái |
| --- | --- | --- |
| 1 | V5/V6 1280px screenshot | ✅ PASS |
| 2 | V5/V6 1440px screenshot | ✅ PASS |
| 3 | V5/V6 1920px screenshot | ✅ PASS |
| 4 | Featured card có ảnh / không ảnh | ✅ PASS |
| 5 | Dataset 1/2/nhiều món | ✅ PASS |
| 6 | Không overflow 1280/1440/1920 | ✅ PASS |
| 7 | Collection Filter 2×2 đọc rõ | ✅ PASS (select 320–354px) |
| 8 | Search/Filter/Sort/Clear | ✅ PASS |
| 9 | Add/Edit/Delete/Status | ✅ PASS |
| 10 | Dashboard values cập nhật đúng | ✅ PASS |
| 11 | Tilt hoạt động và reset | ✅ PASS |
| 12 | Focus-visible / Reduced Motion | ✅ PASS |
| 13 | Mobile 375 và 320×700 không regression | ✅ PASS |
| 14 | Console không lỗi mới | ✅ PASS (0 lỗi) |
| 15 | Không đổi Firebase/Auth/Sync/CRUD | ✅ PASS (diff chỉ `wishlist.html` + 3 CSS V6 + docs) |
| 16 | Báo cáo QA và ảnh push lên repo | ✅ PASS (commit này) |

**Không có P0/P1 mở.** Theo quy tắc quyết định: mọi gate bắt buộc đạt → **GO đề xuất cho Desktop Freeze** — quyết định tag `ui-v6.0.0` vẫn chờ Final Review của bạn.

## 5. NOT VERIFIED (trung thực)

- **Performance (FPS/render time):** chưa có số đo — chưa chạy benchmark; chỉ xác nhận không có chậm/timeout bất thường trong lúc QA thủ công trên headless.
- **Thiết bị thật:** monitor vật lý 1280/1440/1920 và touch device chưa kiểm tra — chỉ headless Chrome.
- **Tilt:** chứng minh bằng `PointerEvent('pointermove')` tổng hợp (CDP mouse không kích hoạt tilt trong harness này); cùng cơ chế với phần so sánh V5 nên tương đương, nhưng hành vi hover bằng chuột thật chưa xác minh riêng.
- **Firebase/Auth/Cloud sync:** cố tình không khởi tạo trong QA (theo yêu cầu) — chỉ kiểm tra luồng cục bộ.

## 6. Cam kết an toàn

- Diff V6 so với `ui-v5.0.0`: chỉ `wishlist.html` (thêm class + import), `css/desktop-showroom-v6-{hero,gallery,workspace}.css`, tài liệu/ảnh QA. **Không file Firebase, Auth, Sync, storage, thuật toán CRUD.**
- Mọi rule V6 đều nằm trong `@media (min-width: 1025px)` + selector scoped `body.dreamscape-v5` → mobile/tablet dùng nguyên layer V5.
- Không force-push; không sửa tag cũ (`ui-v4.0.0`, `ui-v5.0.0` còn nguyên).
