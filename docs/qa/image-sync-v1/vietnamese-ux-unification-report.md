# Dream Vault — Thống nhất tiếng Việt toàn bộ UI + tinh chỉnh CTA

- **Branch:** `feature/cloudinary-image-sync-v1`
- **Base SHA:** `4e3aa75` (điểm trước sprint này; sạch, == origin)
- **Ngày:** 2026-10-16
- **Phạm vi:** (1) thống nhất **toàn bộ** chữ hiển thị sang tiếng Việt (giữ "Dream Vault" là tên thương hiệu);
  (2) sửa CTA "Khám phá bộ sưu tập" thành pill bo tròn mềm/premium; (3) rà lại câu chữ header/đồng bộ khi đã đăng nhập.
- **Ràng buộc đã giữ:** `ui-v15.0.0` frozen, không redesign/không mở phiên bản UI mới, không tag, không merge `main`,
  không deploy production, không sửa Firebase Rules/Auth/CRUD, không xoá dữ liệu thật, không đụng Cloudinary Worker.
- **Kết quả:** **GO** cho thay đổi (regression không phát sinh lỗi mới).

---

## 1. Kết luận nhanh (GO/HOLD)

| Hạng mục | Kết quả | Quyết định |
|---|---|---|
| Thống nhất UI tiếng Việt (HTML + JS sinh chữ) | PASS — không còn chuỗi UI tiếng Anh | **GO** |
| CTA "Khám phá bộ sưu tập" bo tròn mềm/premium | PASS — `border-radius: 999px`, nền lavender nhạt | **GO** |
| Header/đồng bộ khi đăng nhập | PASS — câu chữ khớp thực tế, không còn "chỉ lưu tại thiết bị" sai ngữ cảnh | **GO** |
| Regression kế thừa (V9–V16) | PASS — không lỗi mới | **GO** |
| A11y / Responsive | PASS — `unnamed:0`, `noAlt:0`, contrast ok, focus ring 3px | **GO** |
| Deploy production / tag / merge | Không thực hiện | **HOLD** (chờ duyệt) |

---

## 2. Thay đổi chữ hiển thị (trước → sau)

Tất cả chuỗi UI tiếng Anh đã được Việt hoá. Giữ nguyên tên thương hiệu **Dream Vault**.

| # | Vị trí | Trước (EN) | Sau (VI) |
|---|---|---|---|
| 1 | Tagline thương hiệu | The Editorial Workspace | Không gian sưu tập |
| 2 | Hero eyebrow | PRIVATE SHOWROOM / 09 | TRƯNG BÀY RIÊNG / 09 |
| 3 | Hero headline | Everything / you wish for. | Mọi điều / hằng mong. |
| 4 | Hero footer | Curated by you. Made for your dreams. | Do bạn tuyển chọn. Cho những giấc mơ của bạn. |
| 5 | Alcove caption | Object 001 — Curated Wish | Vật phẩm 001 — Điều ước đã chọn |
| 6 | Tổng quan eyebrow | Your collection at a glance | Toàn cảnh bộ sưu tập |
| 7 | Tổng quan tiêu đề | The value of your dreams | Giá trị những giấc mơ của bạn |
| 8 | Khám phá eyebrow | Discover your wishes | Khám phá điều ước |
| 9 | Khám phá tiêu đề | Find something you love. | Tìm món bạn yêu thích. |
| 10 | Khám phá mô tả | Tìm kiếm… sắp xếp wishlist. | Tìm kiếm… sắp xếp bộ sưu tập. |
| 11 | Gợi ý bộ lọc | Refine your collection | Tinh chỉnh bộ sưu tập |
| 12 | Nhãn danh sách | THE COLLECTION | BỘ SƯU TẬP |
| 13 | Thanh chế độ | EXHIBITION MODE | CHẾ ĐỘ TRƯNG BÀY |
| 14 | Nút chế độ | Gallery / Focus | Thư viện / Tiêu điểm |
| 15 | Empty eyebrow | YOUR DREAM VAULT | KHO ĐIỀU ƯỚC CỦA BẠN |
| 16 | Empty tiêu đề | Your wishlist starts here. | Bộ sưu tập của bạn bắt đầu từ đây. |
| 17 | Dialog eyebrow | YOUR COLLECTION | BỘ SƯU TẬP CỦA BẠN |
| 18 | Quick View plaque | OBJECT STUDY | NGHIÊN CỨU VẬT PHẨM |
| 19 | Quick View kicker | PRODUCT SHOWCASE | TRƯNG BÀY SẢN PHẨM |
| 20 | Quick View object | OBJECT | VẬT PHẨM |
| 21 | Quick View story | The story behind this wish | Câu chuyện phía sau điều ước này |
| 22 | Quick View back | Quay lại Gallery | Quay lại thư viện |
| 23 | Nhãn card (JS) | OBJECT 001 | VẬT PHẨM 001 |
| 24 | Plaque featured (JS) | OBJECT 001 — CURATED WISH | VẬT PHẨM 001 — ĐIỀU ƯỚC ĐÃ CHỌN |
| 25 | Quick View object (JS) | OBJECT 007 — PRIVATE VIEW | VẬT PHẨM 007 — XEM RIÊNG |
| 26 | Caption card (JS) | PRIVATE COLLECTION | BỘ SƯU TẬP RIÊNG |
| 27 | Plaque featured (CSS, đang bị V8 tắt) | 01 / THE FEATURED DREAM | 01 / TÁC PHẨM NỔI BẬT |

**Ghi chú 1:** Hai chuỗi CSS `content: "01 / THE FEATURED DREAM"` (`cinematic-v7-mobile.css`, `cinematic-v7-visual-overhaul.css`)
đã bị V8 tắt (`content: none`) nên **không hiển thị ra UI**; vẫn được Việt hoá để nhất quán nguồn (không ảnh hưởng hiển thị).
**Ghi chú 2:** Các nội dung trước đó **đã là tiếng Việt** được giữ nguyên: header/đồng bộ, thẻ thống kê, mô tả hero,
CTA "Thêm món yêu thích", điều hướng, "Xuất/Nhập JSON", Quick View.

---

## 3. CTA "Khám phá bộ sưu tập" — trước/sau

CTA là `.hero-v3__secondary` trong khu vực hero. Trước đây là **link chữ gạch chân** (không có bo góc, nhìn "thô").

| Thuộc tính | Trước | Sau |
|---|---|---|
| `border-radius` | `0px` | `999px` (pill) |
| `background` | `transparent` | `rgba(124,105,198,.10)` (lavender nhạt) |
| `border` | `none` | `1px solid rgba(124,105,198,.30)` |
| `padding` | `0 6px` | `0 22px` |
| Gạch chân `::after` | hiện (1px) | ẩn (`content:none`) |
| `box-shadow` | — | `0 10px 24px rgba(84,63,158,.10)` |
| `min-height` | `44px` | `44px` (giữ — tránh đè Dock ở màn hình thấp) |
| Hover | gạch chân đậm | nền/viền/đổ bóng nhấn nhẹ |

Đã kiểm tra computed style thực tế trong trình duyệt ở 1440 / 768 / 375 → `radius: 999px`, nền lavender, gạch chân đã ẩn.

---

## 4. Regression (trước → sau)

Chạy trên worktree `wt-imagesync` phục vụ tại `http://127.0.0.1:8115` (bản "sau"), đối chiếu baseline
`http://127.0.0.1:8116` (`wt-baseline` @ `bed2558`).

| Suite | Trước (baseline) | Sau | Ghi chú |
|---|---|---|---|
| `v9-check.js` | 122 PASS / 6 FAIL | **122 PASS / 6 FAIL** | 6 lỗi tồn tại từ trước (drift ngày ở A2, hình học C1/C2 @1280/1440/1920) — **không phát sinh mới** |
| `v8b-check.js` | — | 95 PASS / 6 FAIL | Cùng nhóm lỗi tồn tại (A2, C1, C2) |
| `v8c-check.js` | — | 115 PASS / 7 FAIL | Cùng nhóm + V4b (legacy V8 vs V9 dedup plaque) |
| `v10-check.js` | 25 PASS / 1 FAIL | **25 PASS / 1 FAIL** | G3c tồn tại từ trước — không đổi |
| `v11-check.js` | 34 PASS / 0 FAIL | **34 PASS / 0 FAIL** | xanh |
| `v12-check.js` | 40 PASS / 0 FAIL | **40 PASS / 0 FAIL** | xanh (QV keyboard/focus) |
| `v13-check.js` | 50 PASS / 0 FAIL | **50 PASS / 0 FAIL** | xanh (gallery/focus, sau khi cập nhật nhãn) |
| `v15-check.js` | — | **15 PASS / 0 FAIL** | xanh (production hardening) |
| `v16-imagesync-ux.js` | 13 PASS / 0 FAIL | **13 PASS / 0 FAIL** | xanh (empty state, mua/hoàn tác, Quick View) |
| `v14-a11y.js` / `v15-a11y.js` | exit 0 | exit 0 | `unnamed:0`, `noAlt:0`, contrast ok, focus ring 3px |

> **Không** tăng số lỗi ở bất kỳ suite nào. Các lỗi còn lại ở `v9/v8b/v8c/v10` là **delta tồn tại từ trước**
> do tầng V11 thay đổi bố cục (grid 3 cột/card ≥300px, ngày seed, một số kỳ vọng V8 cũ) — không liên quan bản sửa này.

### 4.1 Cập nhật harness (minh bạch)

Vì đây là **thay đổi chữ có chủ đích**, các assertion kiểm tra *literal text* trong harness QA tạm
(`C:\...\shot\*.js`, không nằm trong repo) đã được cập nhật để khớp:
`OBJECT→VẬT PHẨM`, `PRIVATE VIEW→XEM RIÊNG`, `PRIVATE SHOWROOM→TRƯNG BÀY RIÊNG`, `CURATED→ĐIỀU ƯỚC`
(`v9/v8b/v8c`); `Editorial Workspace→Không gian sưu tập`, `collection at a glance→Toàn cảnh bộ sưu tập`,
`discover your wishes→Khám phá điều ước` (`v10`); `Gallery/Focus→Thư viện/Tiêu điểm` (`v13`);
`starts here→bắt đầu từ đây` (`v16`); `01 / THE FEATURED DREAM→01 / TÁC PHẨM NỔI BẬT` (`17f`).
**Toàn bộ assertion cấu trúc/chức năng giữ nguyên** — chỉ literal chữ được đồng bộ với bản Việt hoá.

Trong quá trình này phát hiện & xử lý 1 lỗi tạm do bản dịch dài hơn: eyebrow/headline dài làm hero cao thêm,
CTA chạm Dock ở 375×667 (M11). Đã rút gọn câu chữ tự nhiên (`TRƯNG BÀY RIÊNG / 09`, `Mọi điều hằng mong.`)
→ clearance CTA–Dock **+39px** (baseline +21px).

---

## 5. Ảnh trước/sau

Thư mục: `docs/qa/image-sync-v1/screenshots-vn/` (mỗi ảnh có cặp `before-*` / `after-*`, ở desktop 1440×900 và mobile 375×812):

- `*-header-*` — thanh thương hiệu + điều hướng + panel đồng bộ
- `*-cta-*` — khu CTA hero ("Thêm món yêu thích" + "Khám phá bộ sưu tập")
- `*-quickview-*` — hộp thoại chi tiết
- `*-purchased-*` — thẻ ở trạng thái "Đã mua"
- `*-empty-*` — trạng thái danh sách trống

---

## 6. Tệp thay đổi

| Tệp | Thay đổi |
|---|---|
| `wishlist.html` | Việt hoá 22 chuỗi UI tĩnh + 6 chuỗi do JS sinh (nhãn card, plaque, Quick View, empty). Tinh chỉnh câu chữ hero cho vừa 1 dòng ở màn hình hẹp. |
| `css/premium-v9-signature.css` | `.hero--v9 .hero-v3__secondary` → pill bo tròn mềm (radius 999px, nền lavender nhạt, viền, đổ bóng, hover); ẩn gạch chân `::after`. |
| `css/cinematic-v7-mobile.css` | Việt hoá chuỗi `content` của plaque (đang bị V8 tắt). |
| `css/cinematic-v7-visual-overhaul.css` | Việt hoá chuỗi `content` của plaque (đang bị V8 tắt). |
| `docs/qa/image-sync-v1/vietnamese-ux-unification-report.md` | Báo cáo này. |
| `docs/qa/image-sync-v1/screenshots-vn/*` | 20 ảnh trước/sau. |

---

## 7. Ghi chú & giới hạn

- Không thay đổi dữ liệu, schema, Firebase Auth/Firestore, Cloudinary Worker, luồng đồng bộ.
- Vẫn còn một số **nhãn nhỏ mang tính trang trí** giữ phong cách "bảo tàng" nhưng **đã là tiếng Việt** (ví dụ "VẬT PHẨM 001",
  "BỘ SƯU TẬP RIÊNG"); đây là lựa chọn art-direction, không phải chữ tiếng Anh còn sót.
- Các suite `v12-a11y.js` / `v13-a11y.js` có lỗi điều hướng tới các cổng build đóng băng `8120/8121` (không chạy) —
  **lỗi tồn tại từ trước**, không do bản sửa này; phần chạy trên build hiện tại (`8115`) đều đạt.

---

## 8. Kết luận

**GO** cho các thay đổi UI (Việt hoá + CTA + rà câu chữ header). Regression không phát sinh lỗi mới.
**HOLD** deploy production / tag / merge `main` cho tới khi có duyệt.
