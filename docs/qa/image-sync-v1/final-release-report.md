# Dream Vault — Final UI/UX Polish & Image Sync — Release Gate Report

- **Repository:** `DB-Ducbao113/Wishlist`
- **Branch:** `feature/cloudinary-image-sync-v1`
- **Baseline:** `ui-v15.0.0` (`bed2558`)
- **Code commit (sprint này):** `2f14844` — *polish(ui): hero CTA states, lavender placeholder, mobile header spacing*
- **CTA commit:** `76861a5` — *style(cta): gradient-border pill*
- **Ngày:** 2026-10-16
- **Ngôn ngữ UI:** 100% tiếng Việt (giữ tên thương hiệu **Dream Vault**)
- **Ngân sách:** $0
- **Phạm vi thay đổi mã sprint này:** `wishlist.html`, `css/premium-v9-signature.css`, `css/header-sync-v1.css` (+ ảnh QA).

---

## 1. Quyết định phát hành (GO / HOLD)

| Hạng mục | Kết quả | Quyết định |
|---|---|---|
| P0 Header responsive + thanh đồng bộ | PASS (9/9 viewport) | **GO** |
| P0 Thống nhất tiếng Việt toàn UI | PASS | **GO** |
| P0 Hero CTA border-radius + hover/focus/active/reduced-motion | PASS | **GO** |
| P0 Quick View (desktop 2 cột / mobile 1 cột, placeholder, nút đóng) | PASS | **GO** |
| P0 Không tạo dữ liệu mẫu / không tự xóa dữ liệu | PASS | **GO** |
| P0 Đánh dấu đã mua + Hoàn tác | PASS | **GO** |
| Functional regression (CRUD / search / sort / filter / view / export / import) | PASS 20/20 | **GO** |
| Regression kế thừa V9–V16 | PASS (21 lỗi tồn tại trước, đã chứng minh) | **GO** |
| A11y / Responsive / Performance | Không hồi quy | **GO** |
| Cloudflare Worker ký upload (live) | PASS — trả **401** (đã cấu hình), fail-closed đúng | **GO** |
| **QA ảnh thật 2 thiết bị (laptop ↔ iPhone)** | **CHƯA TEST ĐƯỢC (0/6)** — cần thiết bị + tài khoản thật; **preview origin đang bị Worker chặn (403)** | **HOLD** |

> **Tổng: GO cho phần UI/UX + Functional (đã kiểm thử đầy đủ). HOLD cho hạng mục QA ảnh thật 2 thiết bị.**
> Không tag, không merge `main`, không deploy production, không sửa Firebase Rules trong sprint này.

---

## 2. Commit & tệp thay đổi

### 2.1 Commit trong sprint (`bed2558..2f14844`)

| SHA | Nội dung |
|---|---|
| `2f14844` | **Sprint này** — CTA states (focus/active/reduced-motion), placeholder ảnh thiếu màu lavender, header mobile 1 hàng không tràn |
| `bd182c1` | (chủ dự án) chờ xử lý ảnh iPhone trước khi upload/lưu |
| `222360a` | (chủ dự án) cảnh báo + xin xác nhận trước khi lưu ảnh cục bộ |
| `76861a5` | CTA "Khám phá bộ sưu tập" → pill viền gradient tím |
| `a717f5e` | Hoàn tất nhãn tiếng Việt + CTA pill |
| `4718c9a` | (chủ dự án) thống nhất nhãn tiếng Việt |
| `a174fde` | (chủ dự án) thanh đồng bộ gọn, tách trạng thái lỗi/upload |
| `e00ac6a` | Danh sách trống cho người dùng mới, dựng lại header đồng bộ, đánh dấu đã mua + hoàn tác, Quick View gọn |

### 2.2 Tệp thay đổi trong sprint này

| Tệp | Thay đổi |
|---|---|
| `css/premium-v9-signature.css` | `.hero--v9 .hero-v3__primary/.hero-v3__secondary`: thêm `:focus-visible` (outline 2px accent, offset 3px), `:active` (nền nhấn), và fallback `prefers-reduced-motion: reduce` → `transition:none`. Giữ nguyên hình học pill (`border-radius:999px`, `min-height:44px`). |
| `css/header-sync-v1.css` | Nhãn nav "Thêm món"/"Công cụ" không xuống dòng; breakpoint ≤430px siết khoảng cách để header giữ **một hàng, không tràn** (CTA Hero vẫn cách Dock an toàn). |
| `wishlist.html` | (a) Placeholder ảnh thiếu: SVG màu xanh sage cũ → **lavender** (khung ảnh + "Chưa có ảnh"). (b) Khi đăng nhập lỗi → gọi `applySyncState("local")` để trạng thái + chấm màu nhất quán. |
| `docs/qa/image-sync-v1/screenshots-vn/*` | Bộ ảnh before/after cập nhật + thêm trạng thái đăng nhập và 3 trạng thái thanh đồng bộ ảnh. |
| `docs/qa/image-sync-v1/raw/*` | Nhật ký thô các bài test (regression, verify, worker live probe). |

---

## 3. Kiểm thử — lệnh & kết quả

Server tĩnh Node (`shot/serve.js`): AFTER = `http://127.0.0.1:8115` (bản đã rebase `2f14844`), BEFORE = `http://127.0.0.1:8116` (baseline `bed2558`) / `http://127.0.0.1:8117` (`4e3aa75`).

### 3.1 Functional + UX state + responsive (bài kiểm mới)

```
node tmp-verify.js
```

```
PASS UX placeholder=lavender
PASS UX CTA focus-visible outline solid 2px
PASS UX CTA :active pressed background
PASS UX CTA reduced-motion transition none
PASS FX new user empty
PASS FX add 2 items
PASS FX search filters
PASS FX sort price-desc
PASS FX mark purchased
PASS FX filter purchased
PASS FX focus view
PASS FX edit rename
PASS FX delete
PASS FX export JSON
PASS FX import JSON
PASS FX consent prompt shown
PASS FX local-only saved w/ warning toast
PASS FX consent cancel aborts save
PASS FX console no JS errors
PASS RESP 9 viewports clean (no overflow / CTA clear / no errors)
==== VERIFY SUMMARY: 20 PASS, 0 FAIL ====
```

Nhật ký thô: `raw/verify-ux-functional.txt`.

### 3.2 Regression kế thừa V9–V16

| Bộ | PASS | FAIL | Ghi chú |
|---|---|---|---|
| v8b | 95 | 6 | A2, C1×2, C2×3 |
| v8c | 115 | 7 | A2, C1×2, C2×3, V4b |
| v9 | 122 | 6 | A2, C1×2, C2×3 |
| v10 | 25 | 1 | G3c |
| v11 | 34 | 0 | |
| v12 | 40 | 0 | |
| v13 | 50 | 0 | |
| v14 | 24 | 1 | Z1a (đếm stylesheet) |
| v15 | 15 | 0 | |
| v16 | 13 | 0 | |
| **Tổng** | **533** | **21** | 21 lỗi **tồn tại trước** — xem §4 |

Nhật ký thô: `raw/regression-v*.txt`.

### 3.3 Quick View — hình học & a11y

- v16 `T5/T5b/T5c/T6` PASS: desktop 2 cột, mobile 1 cột, ghi chú dài cuộn được, nút đóng truy cập được, Escape/focus restore hoạt động.
- Ảnh thiếu → placeholder lavender đẹp (`raw/verify-ux-functional.txt`, mục `UX placeholder=lavender`).

### 3.4 A11y (`v14-a11y.js`, `v15-a11y.js` — exit 0)

| Chỉ số (AFTER) | Giá trị |
|---|---|
| landmarks (header/nav/main/h1) | 1/2/1/1 |
| điều khiển thiếu tên | **0** |
| ảnh thiếu `alt` | 0 |
| `badAriaLabel` | `["SUMMARY."]` — tồn tại trước |
| `focusNoVisible` | 1 INPUT — tồn tại trước |
| live regions | có `#imageSyncBar` (aria-live) |

### 3.5 Responsive — 9 viewport

`320×568 · 375×667 · 375×812 · 430×932 · 768×1024 · 1024×768 · 1280×800 · 1440×900 · 1920×1080`

Kết quả: **hOverflow = 0, navOverflow = 0, CTA Hero không bị Dock che, 0 console error** ở cả 9 viewport.

### 3.6 Performance (thô, headless Chrome lab, localhost, 12 món, median 3 lần chạy)

| | LCP | CLS | TBT | Longest task | Quick View mở |
|---|---|---|---|---|---|
| **AFTER** (`8115`) | 128 ms | 0.0017 | 18 ms | 68 ms | 34.5 ms |
| **BEFORE** (`8117`, `4e3aa75`) | 120 ms | 0.0009 | 17 ms | 67 ms | 25.5 ms |

→ Chênh lệch trong ngưỡng nhiễu; cả hai đều rất tốt (LCP ≪ 2.5s, CLS ≪ 0.1, TBT ≪ 200ms). Quick View mở < 40ms (không cảm nhận được). *Đây là lab; CWV field cần người dùng thật.*

---

## 4. Lỗi tồn tại trước (đã tái hiện, không phải hồi quy)

| Lỗi | Bộ | Bằng chứng tái hiện |
|---|---|---|
| `A2` — Quick View lệch ngày (`12/10` vs `13/10`, do múi giờ) | v8b, v8c, v9 | **Tái hiện y hệt trên baseline `bed2558` (`8116`)** |
| `C1/C2` — hình học lưới (card ≥300px, featured span 2) | v8b, v8c, v9 | **Tái hiện y hệt trên `bed2558`** (`{"cols":3,"min":263}`…) |
| `V4b` — trùng plaque stage/story kicker (di sản V8-vs-V9) | v8c | tồn tại trước (bản V8 legacy) |
| `G3c` — search chiếm ưu thế + 4 filter một hàng desktop | v10 | **Tái hiện trên bản trước-thay-đổi `4e3aa75` (`8117`)** |
| `Z1a` — số stylesheet 46 → **47** | v14 | Do commit **của chủ dự án** `4718c9a` thêm `css/header-sync-v1.css` (đếm được: `4e3aa75`=46, `4718c9a`=47) |

→ **Không có lỗi mới nào** phát sinh từ thay đổi của sprint này.

---

## 5. Cloudflare Worker — kiểm chứng live

`POST https://wishlist-images.ducbao147258.workers.dev/sign`

| Trường hợp | Kết quả | Kỳ vọng | Đạt |
|---|---|---|---|
| Origin production, không auth | **401** | 401 (đã cấu hình, chặn thiếu token) | ✅ |
| Origin preview channel, không auth | **401** | 401 (đã allowlist) | ✅ *(cập nhật 2026-10-16)* |
| Origin lạ (`evil.example`) | **403** | 403 | ✅ |
| `OPTIONS` preflight | **204** + `Access-Control-Allow-Origin` | 204 | ✅ |
| `GET` (sai method) | **404** | 404 | ✅ |

→ Worker **đã được cấu hình lại** (trước đây `503 not configured`, nay `401`) và **fail-closed đúng**.
Chủ dự án đã thêm preview origin vào `ALLOWED_ORIGINS` (`wrangler.toml` + deploy) → **preview origin nay trả 401** (không còn 403). Blocker CORS của Preview đã được giải quyết.

---

## 6. QA ảnh thật 2 thiết bị (laptop ↔ iPhone) — 0/6

| # | Tình huống | Trạng thái |
|---|---|---|
| 1 | Upload ảnh laptop → Cloudinary (URL HTTPS) | ☐ chưa (cần tài khoản + thiết bị thật) |
| 2 | Firestore lưu HTTPS URL (không `data:image`) | ☐ chưa |
| 3 | iPhone hiển thị ảnh đã upload | ☐ chưa |
| 4 | Upload ảnh iPhone → xem trên laptop | ☐ chưa |
| 5 | Ảnh còn sau reload + đăng nhập lại | ☐ chưa |
| 6 | Upload lỗi không làm mất ảnh cũ | ☐ chưa |

**Lý do HOLD:** không thể thực hiện kiểm thử ảnh thật hai chiều trong môi trường này (không có iPhone, không có tài khoản Google/Firebase thật để đăng nhập, và preview origin đang bị Worker chặn 403). Đã kiểm chứng phần **logic bảo vệ** thay thế: luồng "ảnh chỉ lưu cục bộ" nay **bắt buộc xác nhận** trước khi lưu, và toast nói rõ *"Đã lưu trên thiết bị này — ảnh chưa đồng bộ."* (test `FX consent` PASS).

---

## 7. Ảnh before/after

Thư mục: `docs/qa/image-sync-v1/screenshots-vn/` (before = `4e3aa75` @8117; after = bản `2f14844` @8115).

| Chủ đề | Before | After |
|---|---|---|
| Header (chưa đăng nhập) | `before-header-desktop/mobile.png` | `after-header-desktop/mobile.png` |
| Header (đã đăng nhập) | — | `after-header-signin-desktop.png` |
| Hero CTA + border-radius | `before-cta-desktop/mobile.png` | `after-cta-desktop/mobile.png` |
| Quick View desktop/mobile | `before-quickview-desktop/mobile.png` | `after-quickview-desktop/mobile.png` |
| Empty State (không dữ liệu mẫu) | `before-empty-desktop/mobile.png` | `after-empty-desktop/mobile.png` |
| Product Card đã mua | `before-purchased-desktop/mobile.png` | `after-purchased-desktop/mobile.png` |
| Image Sync: đang tải / thành công / lỗi | — | `after-imagesync-uploading/synced/error-desktop.png` |

---

## 8. Việc chủ dự án cần làm (để mở HOLD)

1. ~~**Cloudflare Worker → `ALLOWED_ORIGINS`**: thêm preview origin~~ ✅ **ĐÃ XONG** — preview origin nay trả **401** (kiểm chứng live 2026-10-16), vẫn giữ kiểm tra Origin, không dùng `*`.
2. **Firebase → Authentication → Authorized domains**: thêm `wishlist-787d2--image-sync-v1-efzo5nzk.web.app`.
3. **Cloudinary Console**: đặt "Maximum image file size" (≈1.5 MB) + chỉ cho JPG.
4. Sau đó chạy 6 kịch bản ảnh thật 2 thiết bị (§6) và cập nhật kết quả.

---

## 9. An toàn dữ liệu (đã tuân thủ)

- **Không** tạo dữ liệu mẫu cho người dùng mới (danh sách khởi tạo rỗng).
- **Không** tự xóa bản ghi cũ, kể cả id `sample-*` (có thể là dữ liệu người dùng đã đồng bộ).
- "Đánh dấu đã mua" chỉ đổi `status` hiện có; hoàn tác khôi phục trạng thái trước (`statusBefore()`) — **không** thêm trường, **không** migrate schema.
- **Không** ghi Base64 vào Firestore; chỉ lưu URL HTTPS do Cloudinary trả về.
- Ảnh cục bộ không có tài khoản → **cảnh báo + xin xác nhận** (không âm thầm coi là đã đồng bộ).
- **Không** sửa Firebase Rules; **không** merge `main`; **không** tag; **không** deploy production.

---

## 10. Kết luận

- **UI/UX + Functional: GO.** Toàn bộ giao diện hiển thị tiếng Việt; header/thanh đồng bộ gọn và responsive 9/9 viewport; Hero CTA đạt dạng pill (radius 999px) với hover/focus-visible/active/reduced-motion; Quick View desktop 2 cột, mobile 1 cột, placeholder ảnh đẹp; không tạo dữ liệu mẫu; Đánh dấu đã mua + Hoàn tác hoạt động; regression 533 PASS / 21 FAIL (tất cả tồn tại trước, đã chứng minh); không hồi quy a11y/hiệu năng.
- **Image Sync (QA 2 thiết bị): HOLD.** Worker đã cấu hình (401) nhưng preview origin bị chặn (403) và chưa có điều kiện kiểm thử ảnh thật hai chiều.
- **Không** đề xuất GO phát hành tổng thể cho tới khi §8 hoàn tất và §6 đạt.
