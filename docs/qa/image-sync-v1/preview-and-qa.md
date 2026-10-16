# Image Sync 1.0 — Preview & QA tracking

## Endpoints

| Thành phần | Giá trị |
|---|---|
| Worker URL | `https://wishlist-images.ducbao147258.workers.dev/sign` |
| Cloudinary cloud | `herun6yp` |
| Production origin | `https://wishlist-787d2.web.app` |
| **Preview origin** | `https://wishlist-787d2--image-sync-v1-efzo5nzk.web.app` |
| Preview channel | `image-sync-v1` (hết hạn 2026-10-23, version `d19e3a8a31cc74fc`) |
| Branch | `feature/cloudinary-image-sync-v1` (HEAD `699e914`) |

## Việc cần chủ dự án làm trên Cloudflare (Bước 2)

1. **Khôi phục cấu hình Worker** (bản redeploy hiện trả `503 not configured`):
   - Đặt `CLOUDINARY_API_KEY` và `CLOUDINARY_API_SECRET` thành **encrypted Worker secrets**
     (để tồn tại qua mỗi lần `wrangler deploy` — plaintext var khai báo ngoài `wrangler.toml` sẽ bị xoá).
   - Sau đó kiểm tra: `POST /sign` từ origin hợp lệ, không auth → phải là **401** (không phải 503).
2. **Cho phép Preview Origin** — đặt biến:
   ```
   ALLOWED_ORIGINS = https://wishlist-787d2.web.app,https://wishlist-787d2--image-sync-v1-efzo5nzk.web.app
   ```
   (giữ nguyên kiểm tra Origin, không dùng `*`).

## Việc cần làm trên Firebase (Bước 2)

- **Authentication → Settings → Authorized domains**: thêm `wishlist-787d2--image-sync-v1-efzo5nzk.web.app`.
- Nếu API key có giới hạn referrer: thêm `https://wishlist-787d2--image-sync-v1-efzo5nzk.web.app/*`.

## Kiểm thử ảnh thật (Bước 3) — 0/6

| # | Tình huống | Trạng thái |
|---|---|---|
| 1 | Upload ảnh từ laptop → Cloudinary (URL HTTPS trả về) | ☐ chưa |
| 2 | Firestore lưu HTTPS URL (không phải `data:image`) | ☐ chưa |
| 3 | iPhone hiển thị ảnh đã upload | ☐ chưa |
| 4 | Upload ảnh từ iPhone → xem trên laptop | ☐ chưa |
| 5 | Ảnh còn sau reload + đăng nhập lại | ☐ chưa |
| 6 | Upload lỗi không làm mất ảnh cũ | ☐ chưa |

Chỉ đánh dấu hoàn thành khi có kết quả thực tế trên thiết bị.
