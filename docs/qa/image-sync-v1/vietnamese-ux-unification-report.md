# Dream Vault — Thống nhất tiếng Việt (phần còn lại) + tinh chỉnh CTA

- **Branch:** `feature/cloudinary-image-sync-v1`
- **Base SHA (đầu sprint này):** `4718c9a` — đã gồm 2 commit của chủ dự án: `a174fde` (header/sync bar gọn, tiếng Việt) và `4718c9a` (Việt hoá một phần nhãn UI).
- **Ngày:** 2026-10-16
- **Phạm vi:** hoàn tất nốt các nhãn UI còn tiếng Anh mà 2 commit trên **chưa** chuyển, + sửa CTA "Khám phá bộ sưu tập" thành pill bo tròn mềm/premium.
- **Ràng buộc đã giữ:** `ui-v15.0.0` frozen, **giữ nguyên câu chữ mà chủ dự án đã chọn** ở các nhãn trùng; không redesign, không tag, không merge `main`, không deploy production, không sửa Firebase Rules/Auth/CRUD, không xoá dữ liệu thật, không đụng Cloudinary Worker.
- **Kết quả:** **GO** (regression không phát sinh lỗi mới).

> **Bối cảnh phối hợp:** Remote đã có 2 commit Việt hoá song song của chủ dự án. Sprint này **không ghi đè** mà chỉ *ghép phần còn thiếu + CTA* lên trên, giữ nguyên lịch sử commit của chủ dự án.

---

## 1. Kết luận nhanh (GO/HOLD)

| Hạng mục | Kết quả | Quyết định |
|---|---|---|
| Việt hoá nốt các nhãn UI còn tiếng Anh | PASS — không còn chuỗi UI tiếng Anh | **GO** |
| CTA "Khám phá bộ sưu tập" bo tròn mềm/premium | PASS — `border-radius: 999px`, nền lavender nhạt | **GO** |
| Giữ câu chữ chủ dự án đã chọn ở nhãn trùng | PASS — không đổi | **GO** |
| Regression kế thừa (V9–V16) | PASS — không lỗi mới | **GO** |
| A11y / Responsive | PASS — `unnamed:0`, `noAlt:0`, focus ring 3px | **GO** |
| Deploy production / tag / merge | Không thực hiện | **HOLD** (chờ duyệt) |

---

## 2. Bối cảnh: hai commit song song của chủ dự án

| Commit | Nội dung | Ảnh hưởng tới sprint này |
|---|---|---|
| `a174fde` | Thêm `css/header-sync-v1.css`: sync bar dạng grid gọn, ẩn `.sync-summary`/`.nav-account__notice` | **Giữ nguyên.** Sprint này không chạm header. |
| `4718c9a` | Việt hoá ~14 nhãn trong `wishlist.html` (tagline, hero, viewbar, một phần Quick View…) | **Giữ nguyên câu chữ.** Sprint này chỉ bổ sung phần thiếu. |

Sprint này **không đổi** câu chữ của các nhãn đã được Việt hoá ở `4718c9a` (dù có khác biệt từ ngữ so với đề xuất ban đầu của tôi):
tagline *"Không gian lưu giữ ước mơ"*, eyebrow *"KHÔNG GIAN ƯỚC MƠ"*, hero *"Mọi điều / bạn mong ước."*,
viewbar *"CHẾ ĐỘ HIỂN THỊ"* + *"Dạng lưới" / "Tập trung"*, QV plaque *"CHI TIẾT SẢN PHẨM"*, QV story *"Ghi chú về món đồ"*, QV object *"… — XEM CHI TIẾT"*.

---

## 3. Các nhãn UI còn tiếng Anh đã chuyển (bổ sung)

| # | Vị trí | Trước (EN) | Sau (VI) |
|---|---|---|---|
| 1 | Alcove caption | Object 001 — Curated Wish | Vật phẩm 001 — Điều ước đã chọn |
| 2 | Tổng quan eyebrow | Your collection at a glance | Toàn cảnh bộ sưu tập |
| 3 | Tổng quan tiêu đề | The value of your dreams | Giá trị những giấc mơ của bạn |
| 4 | Khám phá eyebrow | Discover your wishes | Khám phá điều ước |
| 5 | Khám phá tiêu đề | Find something you love. | Tìm món bạn yêu thích. |
| 6 | Khám phá mô tả | … sắp xếp wishlist. | … sắp xếp bộ sưu tập. |
| 7 | Empty eyebrow | YOUR DREAM VAULT | KHO ĐIỀU ƯỚC CỦA BẠN |
| 8 | Empty tiêu đề (tĩnh) | Your wishlist starts here. | Bộ sưu tập của bạn bắt đầu từ đây. |
| 9 | Empty tiêu đề (JS) | Your wishlist starts here. | Bộ sưu tập của bạn bắt đầu từ đây. |
| 10 | Dialog eyebrow | YOUR COLLECTION | BỘ SƯU TẬP CỦA BẠN |
| 11 | Quick View object (tĩnh) | OBJECT | VẬT PHẨM |
| 12 | Quick View back | Quay lại Gallery | Quay lại thư viện |
| 13 | Nhãn card (JS) | OBJECT 001 | VẬT PHẨM 001 |
| 14 | Plaque featured (JS) | OBJECT 001 — CURATED WISH | VẬT PHẨM 001 — ĐIỀU ƯỚC ĐÃ CHỌN |
| 15 | Fallback sceneNo (JS) | OBJECT 001 | VẬT PHẨM 001 |
| 16 | Plaque featured (CSS, V8 đã tắt) | 01 / THE FEATURED DREAM | 01 / TÁC PHẨM NỔI BẬT |

**Ghi chú:** hai chuỗi CSS `content` ở mục 16 đã bị V8 tắt (`content: none`) nên **không hiển thị**; vẫn Việt hoá để nhất quán nguồn.

---

## 4. CTA "Khám phá bộ sưu tập" — trước/sau

| Thuộc tính | Trước | Sau |
|---|---|---|
| `border-radius` | `0px` | `999px` (pill) |
| `background` | `transparent` | `rgba(124,105,198,.10)` (lavender nhạt) |
| `border` | `none` | `1px solid rgba(124,105,198,.30)` |
| `padding` | `0 6px` | `0 22px` |
| Gạch chân `::after` | hiện (1px) | ẩn (`content:none`) |
| `box-shadow` | — | `0 10px 24px rgba(84,63,158,.10)` |
| `min-height` | `44px` | `44px` (giữ — không đổi chiều cao hàng CTA) |
| Hover | gạch chân đậm | nền/viền/đổ bóng nhấn nhẹ |

Kiểm tra computed style thật trong trình duyệt tại 1440/768/375 → `radius: 999px`, nền lavender, gạch chân đã ẩn.

---

## 5. Regression

Chạy trên bản sau (`http://127.0.0.1:8115`, reconciled) đối chiếu baseline trước sprint (`http://127.0.0.1:8117` @ `4e3aa75`).

| Suite | Trước* | Sau | Ghi chú |
|---|---|---|---|
| `v9-check.js` | 122 / 6 | **122 / 6** | 6 lỗi tồn tại (drift ngày A2, hình học C1/C2 @1280/1440/1920) — **không mới** |
| `v8b-check.js` | 95 / 6 | **95 / 6** | cùng nhóm lỗi tồn tại |
| `v8c-check.js` | 115 / 7 | **115 / 7** | cùng nhóm + V4b (legacy V8 vs V9 dedup) |
| `v10-check.js` | 25 / 1 | **25 / 1** | G3c tồn tại. *(G1d được cập nhật — xem §6.)* |
| `v11-check.js` | 34 / 0 | **34 / 0** | xanh |
| `v12-check.js` | 40 / 0 | **40 / 0** | xanh |
| `v13-check.js` | 50 / 0 | **50 / 0** | xanh |
| `v15-check.js` | 15 / 0 | **15 / 0** | xanh |
| `v16-imagesync-ux.js` | 13 / 0 | **13 / 0** | xanh |
| `v14-a11y.js` / `v15-a11y.js` | exit 0 | exit 0 | `unnamed:0`, `noAlt:0`, focus ring 3px |

\* Baseline V9/V8b/V8c/V10 lấy từ bản `4e3aa75` (trước khi Việt hoá); các lỗi còn lại là **delta tồn tại từ trước** do tầng V11 đổi bố cục / drift dữ liệu test — không liên quan bản sửa này.

### 5.1 Kiểm tra mobile (chống hồi quy hero)

Câu chữ hero dài hơn có thể đẩy CTA chạm Dock ở 375×667. Đã đo lại: eyebrow 1 dòng, clearance CTA ↔ Dock = **+52px** (baseline `4e3aa75` +21px). Không hồi quy.

---

## 6. Cập nhật harness (minh bạch)

Harness QA nằm ngoài repo (`C:\...\shot\*.js`). Do thay đổi chữ là **có chủ đích**, các assertion kiểm tra *literal text* đã được đồng bộ với **câu chữ cuối cùng** của chủ dự án:
`OBJECT→VẬT PHẨM`, `PRIVATE VIEW→XEM CHI TIẾT`, `CURATED→ĐIỀU ƯỚC`, eyebrow hero→`KHÔNG GIAN ƯỚC MƠ` (`v9/v8b/v8c`);
`Editorial Workspace→Không gian lưu giữ ước mơ`, `collection at a glance→Toàn cảnh bộ sưu tập`, `discover your wishes→Khám phá điều ước` (`v10`);
`Gallery/Focus→Dạng lưới/Tập trung` (`v13`); `starts here→bắt đầu từ đây` (`v16`);
`01 / THE FEATURED DREAM→01 / TÁC PHẨM NỔI BẬT` (`17f`).

Thêm: **`v10 G1d`** trước đây yêu cầu `.sync-panel{display:flex}`. Commit `a174fde` của chủ dự án **cố ý** đổi sang `grid`, nên assertion được nới thành `flex || grid` (chỉ literal/bố cục header đổi, không đổi ngữ nghĩa chức năng).
**Toàn bộ assertion cấu trúc/chức năng khác giữ nguyên.**

---

## 7. Ảnh trước/sau

`docs/qa/image-sync-v1/screenshots-vn/` — mỗi ảnh có cặp `before-*` (bản `4e3aa75`) / `after-*` (bản reconciled), ở desktop 1440×900 và mobile 375×812:

- `*-header-*` — thương hiệu + điều hướng + panel đồng bộ
- `*-cta-*` — khu CTA hero ("Thêm món yêu thích" + "Khám phá bộ sưu tập")
- `*-quickview-*` — hộp thoại chi tiết
- `*-purchased-*` — thẻ trạng thái "Đã mua"
- `*-empty-*` — trạng thái danh sách trống

---

## 8. Tệp thay đổi

| Tệp | Thay đổi |
|---|---|
| `wishlist.html` | Việt hoá 11 nhãn tĩnh còn lại + 4 nhãn do JS sinh (nhãn card, plaque, sceneNo, empty fallback). |
| `css/premium-v9-signature.css` | `.hero--v9 .hero-v3__secondary` → pill bo tròn mềm; ẩn gạch chân `::after`; hover mới. |
| `css/cinematic-v7-mobile.css` | Việt hoá chuỗi `content` plaque (V8 đã tắt). |
| `css/cinematic-v7-visual-overhaul.css` | Việt hoá chuỗi `content` plaque (V8 đã tắt). |
| `docs/qa/image-sync-v1/vietnamese-ux-unification-report.md` | Báo cáo này. |
| `docs/qa/image-sync-v1/screenshots-vn/*` | 20 ảnh trước/sau. |

---

## 9. Ghi chú & giới hạn

- Không thay đổi dữ liệu, schema, Firebase Auth/Firestore, Cloudinary Worker, luồng đồng bộ.
- Vẫn còn các nhãn trang trí phong cách "bảo tàng" nhưng **đã là tiếng Việt** (ví dụ "VẬT PHẨM 001", "BỘ SƯU TẬP RIÊNG") — chọn lựa art-direction, không phải chữ Anh còn sót.
- Suite `v12-a11y.js` / `v13-a11y.js` có lỗi điều hướng tới cổng build đóng băng `8120/8121` (không chạy) — **tồn tại từ trước**, không do sprint này; phần chạy trên build hiện tại đều đạt.

---

## 10. Kết luận

**GO** cho thay đổi (Việt hoá phần còn lại + CTA pill), giữ nguyên câu chữ chủ dự án. Regression không phát sinh lỗi mới.
**HOLD** deploy production / tag / merge `main` cho tới khi có duyệt.
