# Dream Vault — Final UX Fix & Image Sync — QA Report

- **Branch:** `feature/cloudinary-image-sync-v1`
- **Base SHA:** `bed2558` (docs: sprint scope)
- **Report/UX commit:** `e00ac6a`
- **Ngày:** 2026-10-16
- **Phạm vi:** 4 hạng mục UX (Quick View, sync header, bỏ dữ liệu mẫu, "Đánh dấu đã mua" + hoàn tác) + xác thực đồng bộ ảnh 2 thiết bị.
- **Ràng buộc:** giữ `ui-v15.0.0` frozen, không redesign/V16, không tag, không deploy production, không sửa Firebase Rules, không xóa dữ liệu thật.

---

## 1. Kết luận nhanh (GO/HOLD)

| Hạng mục | Kết quả | Quyết định |
|---|---|---|
| P0 Quick View repair | PASS | **GO** |
| P1 Header/sync communication | PASS | **GO** |
| P1 Bỏ trải nghiệm dữ liệu mẫu (an toàn) | PASS | **GO** |
| P1 "Đánh dấu đã mua" + hoàn tác (card + Quick View) | PASS | **GO** |
| Regression V9–V15 + V16 | PASS (chỉ 1 lỗi tồn tại trước) | **GO** |
| A11y / Responsive / Performance | Không hồi quy | **GO** |
| Xác thực ảnh thật 2 thiết bị (0/6) | **BỊ CHẶN** bởi Worker `503 not configured` + preview Auth domain | **HOLD** |

> **Tổng:** Phần sửa UX **GO** (đã kiểm thử đầy đủ). Phần xác thực đồng bộ ảnh thật 2 thiết bị **HOLD** — phụ thuộc thao tác Cloudflare/Firebase của chủ dự án (mục 6). Không tag, không merge, không deploy production.

---

## 2. Thay đổi mã (6 tệp nguồn)

| Tệp | Thay đổi |
|---|---|
| `wishlist.html` | Xoá nút + handler `btnDeleteSample`, `hasSamples()`, `sampleItems()`; `load()` khởi tạo danh sách **rỗng** cho người dùng mới (không seed, **không tự xoá** dữ liệu cũ kể cả id `sample-*`). Dựng lại panel đồng bộ (`#syncListState`, `#syncAccountState`, `#imageSyncBar`, `#imageSyncStatus`, `#btnImageRetry`); notice mới: *"Ảnh mới sẽ đồng bộ sau khi tải lên và lưu thành công."*. Thêm `SYNC_STATES`, `applySyncState(kind,email)`, `setImageSync(state,msg)`, `imageRetryAction`. Thêm `markPurchased()` / `undoPurchased()` / `statusBefore()`, nút `.mark-purchased` trên card và nút `#qvPurchase` trong Quick View (nhãn "Đánh dấu đã mua"/"Hoàn tác"), kèm `aria-label`. |
| `wishlist-cloud.js` | `onStatus` phát **kind** (`unconfigured`/`local`/`syncing`/`synced`/`offline`/`error`) thay vì chuỗi tiếng người — UI tự quyết định câu chữ. "Đã đồng bộ" chỉ hiển thị khi `kind === "synced"` (server xác nhận). |
| `css/immersive-v8-quick-view.css` | Desktop Quick View: flex 2 cột 56/44 (≥1366: 58/42), chiều cao theo nội dung + `max-height: min(860px,92dvh)`, panel cuộn khi ghi chú dài. Sửa sticky top (bỏ margin âm gây đè tiêu đề). |
| `css/premium-v9-signature.css` | Đồng bộ `padding-top:0` cho panel + margin sticky top (đây là lớp override thực tế, tải sau `immersive-v8`). |
| `css/editorial-v10-workspace.css` | Style `.sync-summary`, `.image-sync*`, chấm trạng thái theo `data-state`; **ẩn `.sync-summary` trên mobile ≤640** để giữ khoảng trống Hero-CTA ↔ Dock. |
| `css/purchased-motion.css` | Nhấn mạnh nút `.mark-purchased`. |

---

## 3. Kết quả kiểm thử

### 3.1 Bộ kiểm thử mới V16 (13/13 PASS)

Chạy trên static server Node (`shot/serve.js`) tại `http://127.0.0.1:8115/wishlist.html`:

```
PASS T1  Người dùng mới: danh sách TRỐNG, không tự tạo dữ liệu mẫu
PASS T2  Dữ liệu cũ (kể cả id sample-*) KHÔNG bị tự xóa; không còn nút xóa mẫu
PASS T3a Header mặc định "Chỉ lưu trên thiết bị", notice mới, không còn tuyên bố lỗi thời
PASS T3b applySyncState("synced") hiển thị đúng "Đã đồng bộ" + tài khoản
PASS T3c "Đã đồng bộ" KHÔNG hiện ở trạng thái lỗi/offline/local
PASS T3d Thanh ảnh: lỗi hiện + Retry; đang tải không có Retry; idle ẩn
PASS T4a "Đánh dấu đã mua": status=purchased, card is-purchased, nút đổi "Hoàn tác", stats cập nhật
PASS T4b "Hoàn tác": về ordered, nút trở lại "Đánh dấu đã mua"
PASS T5  Quick View desktop: 2 cột, ảnh trong sân khấu, không tràn viewport, nút đóng truy cập được
PASS T5b Quick View: "Đánh dấu đã mua" cập nhật trạng thái + nhãn + hoàn tác được
PASS T5c Quick View ghi chú dài: panel cuộn được, dialog không tràn viewport, nút đóng thấy
PASS T6  Quick View mobile: 1 cột, contained, nút đóng trong dialog
PASS T7  Console JS errors = 0 (toàn bộ kịch bản V16)
==== V16 SUMMARY: 13/13 PASS, 0 FAIL ====
```

### 3.2 Regression kế thừa V9–V15 (317/318)

| Bộ | Kết quả | Ghi chú |
|---|---|---|
| v9 | 127/128 | `A2` — lỗi tồn tại trước (xem mục 5) |
| v10 | 26/26 | |
| v11 | 34/34 | (V11EQ=1) |
| v12 | 40/40 | |
| v13 | 50/50 | |
| v14 | 25/25 | |
| v15 | 15/15 | |
| **Tổng** | **317/318** | Đúng bằng V15 baseline + 13 test mới, trừ 1 lỗi môi trường tồn tại trước |

### 3.3 A11y — không hồi quy

So sánh trực tiếp BEFORE (`8116`, base `bed2558`) vs AFTER (`8115`):

| Chỉ số | Before | After |
|---|---|---|
| landmarks (header/nav/main/h1) | 1/2/1/1 | 1/2/1/1 |
| điều khiển tương tác | 46 | 53 |
| **thiếu tên (unnamed)** | **0** | **0** |
| ảnh thiếu alt | 0 | 0 |
| live regions | 4 | **5** (thêm `#imageSyncBar`) |
| `badAriaLabel` / `focusNoVisible` | `SUMMARY.` / 1 INPUT | **giống hệt** (tồn tại trước) |

→ Mọi điều khiển mới (nút đánh dấu/hoàn tác, Retry, qvPurchase) đều có tên; thêm 1 vùng `aria-live` cho trạng thái tải ảnh.

### 3.4 Performance — không hồi quy

Medians (headless Chrome lab, localhost; CWV field cần real-user — chưa xác thực):

| Lần chạy | LCP | CLS | TBT | Longest task |
|---|---|---|---|---|
| AFTER (run 3) | **592 ms** | 0.0009 | **85 ms** | 135 ms |
| BEFORE (run 1) | 952 ms | 0.0009 | 165 ms | 215 ms |
| BEFORE (run 2) | 1144 ms | 0.0009 | 144 ms | 194 ms |

→ AFTER tốt hơn baseline. (Một lần chạy AFTER cho 2312 ms là outlier do tải hệ thống, đã xác nhận lại.)

### 3.5 Quick View — kiểm chứng hình học

Đo `getBoundingClientRect` sau khi mở (trước khi cuộn): **không còn chồng lấn** giữa thanh dính và tiêu đề; **nút đóng vẫn hiện** sau khi cuộn xuống đáy panel ở 1440/390/375:

| Viewport | overlap (trước cuộn) | nút đóng hiện sau cuộn | dialog cao |
|---|---|---|---|
| 1440×900 | false | true | 648 |
| 390×844 | false | true | 776 |
| 375×667 | false | true | 614 |

### 3.6 Console

`net::ERR_CONNECTION_REFUSED` trước đây là hiện tượng của `python http.server` khi tải CSS dồn dập; chuyển sang static server Node → **0 JS error** trong V16 và console-diagnostic.

---

## 4. Ảnh trước / sau

Thư mục: `docs/qa/image-sync-v1/screenshots/` (before = base `bed2558` @8116; after = bản sửa @8115).

| Sau | Trước | Nội dung |
|---|---|---|
| `01-new-user-empty.png` | `01b-new-user-before.png` | Header sync mới vs header cũ (tuyên bố lỗi thời) |
| `02-header-default.png` | `02b-header-before.png` | Panel đồng bộ dựng lại vs bản cũ |
| `03-purchased.png` | `03b-cardactions-before.png` | Toast "Đã đánh dấu…" + có nút đánh dấu vs hàng nút cũ không có đánh dấu |
| `04-qv-desktop.png` | `04b-qv-desktop-before.png` | Quick View desktop: tiêu đề hết bị đè, có nút "Đánh dấu đã mua" |
| `05-qv-mobile.png` | `05b-qv-mobile-before.png` | Quick View mobile 1 cột |
| `06-qv-longnote.png` | — | Quick View ghi chú dài: panel cuộn, không cắt, nút đóng dính |

---

## 5. Lỗi tồn tại trước (không phải hồi quy)

- **v9 `A2`** — test kỳ vọng ngày `12/10/2026`, môi trường render `13/10/2026` (lệch múi giờ so với dữ liệu test cố định). **Tái hiện y hệt trên base `bed2558`**.
- **a11y `badAriaLabel: SUMMARY.`** và **1 INPUT không viền focus** — giống hệt trước/sau (phần tử có sẵn của app).
- **Quick View tiêu đề bị thanh dính đè** — *tồn tại trước*, đã **sửa** trong sprint này (bỏ margin âm lớn ở sticky; `padding-top` do chính thanh sticky đảm nhiệm), xác minh không còn chồng lấn.

---

## 6. Chặn còn lại (cần chủ dự án thao tác)

1. **Cloudflare Worker trả `503 {"error":"not configured"}`** — code mới đã deploy nhưng cấu hình runtime mất khi redeploy. Cần đặt `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` thành **encrypted Worker secrets** và `ALLOWED_ORIGINS = https://wishlist-787d2.web.app,https://wishlist-787d2--image-sync-v1-efzo5nzk.web.app`. Sau đó `POST /sign` phải trả **401** (không phải 503).
2. **Firebase Auth → Authorized domains**: thêm `wishlist-787d2--image-sync-v1-efzo5nzk.web.app`.

Chi tiết ở `docs/qa/image-sync-v1/preview-and-qa.md`. Sau khi 2 bước trên xong mới chạy được 6 kịch bản ảnh thật 2 thiết bị (hiện **0/6**).

---

## 7. Phạm vi an toàn dữ liệu (đã tuân thủ)

- Không sửa Firebase Rules.
- Không xoá dữ liệu production; **không** tự xoá item cũ (kể cả id `sample-*`) vì có thể là dữ liệu người dùng đã đồng bộ.
- "Đánh dấu đã mua" chỉ đổi trạng thái `purchased` hiện có; hoàn tác khôi phục trạng thái trước theo `statusBefore()` — **không** thêm trường/loại trạng thái mới, không migrate schema.
- Firestore chỉ lưu URL HTTPS; Worker giữ secret, ký upload Cloudinary (`allowed_formats=jpg`, kiểm tra Origin, rate limit).
