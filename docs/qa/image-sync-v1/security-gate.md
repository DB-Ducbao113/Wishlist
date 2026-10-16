# Image Sync 1.0 — Security Gate (Cloudflare Worker)

Ngày: 2026-10-16 · Branch: `feature/cloudinary-image-sync-v1`
Phạm vi: `workers/cloudinary-sign/` + phần upload trong `wishlist-cloud.js`.

## Bối cảnh
Worker ký upload Cloudinary (SHA-1) sau khi xác thực Firebase ID token. Trước gate này,
Worker đã chạy được nhưng thiếu rate limiting, fetch JWK mỗi request, và chữ ký Cloudinary
chưa ràng buộc định dạng/kích thước.

## Thay đổi (hardening)

| # | Vấn đề trước | Xử lý |
|---|---|---|
| 1 | Chỉ 1 `ALLOWED_ORIGIN` | **`ALLOWED_ORIGINS`** allowlist nhiều origin (phẩy), khớp **chính xác**; vẫn fail-closed nếu rỗng; hỗ trợ tương thích ngược `ALLOWED_ORIGIN` |
| 2 | Không giới hạn tần suất | Rate limit best-effort trong Worker: **per-IP 30/phút** (trước auth) + **per-UID 20/phút** (sau auth) → `429` + `Retry-After` |
| 3 | JWK fetch mỗi request | Cache JWK theo TTL 1 giờ + `cf.cacheTtl`; lỗi JWKS → `401` (fail closed) |
| 4 | Xử lý lỗi token thô | Phân loại lỗi (`malformed/header/audience/issuer/subject/expired/iat/auth_time/unknown-key/signature`), log nội bộ, trả `401` chung (không lộ chi tiết); thêm dung sai clock `±60s`; giới hạn độ dài token (`4096`) |
| 5 | Chữ ký Cloudinary chỉ có `folder`+`timestamp` | Bổ sung **`allowed_formats=jpg`** vào chữ ký (đúng thứ tự alphabet) → Cloudinary từ chối định dạng khác; frontend gửi kèm tham số và kiểm tra lại `allowed_formats==="jpg"` |
| 6 | — | Reset chữ ký scope theo `uid` phía server (không cho client chọn `folder`/`public_id`); headers `no-store`, `nosniff`, `Vary: Origin` |

## Kiểm thử tự động (offline, không dependency)
`workers/cloudinary-sign/test/worker.test.mjs` — tự sinh cặp khóa RSA, tự ký JWT RS256, stub JWKS, gọi trực tiếp `fetch` handler:

```
18 passed, 0 failed
```
Bao phủ: preflight 204 · origin sai/thiếu → 403 · method/path sai → 404 · thiếu token/malformed/quá dài → 401 ·
expired/wrong-aud/wrong-iss/alg=none → 401 · JWKS lỗi → 401 · token hợp lệ → 200 (kiểm chữ ký SHA-1 khớp) ·
preview origin hợp lệ → 200 · chữ ký bị sửa → 401 · rate limit per-UID và per-IP → 429.

## Còn lại — cần chủ dự án (không thể $0 tự động hoàn toàn)
1. **Rate limiting ở edge (khuyến nghị)**: thêm Cloudflare Rate Limiting rule cho route Worker (best-effort trong isolate không đảm bảo toàn cục).
2. **Ràng buộc Cloudinary account**: đặt "Maximum image file size" (≈1.5 MB) và allow format JPG trong Cloudinary Console — chữ ký là uỷ quyền, **không** phải hàng đợi/định mức.
3. **Privacy**: URL delivery mặc định là công khai; cần chủ dự án chấp nhận hoặc chọn chiến lược private media (ngoài phạm vi 1.0).
4. **Preview origin**: khi có preview channel, thêm origin đó vào biến `ALLOWED_ORIGINS` trên Cloudflare (không tắt kiểm tra Origin).

## Trạng thái
Security Gate (Bước 1): **PASS** — code + test.
Phát hiện khi verify deploy: bản Worker redeploy (code mới, có header `nosniff`) đang trả **503 `not configured`**
→ cấu hình (`CLOUDINARY_API_KEY`/`CLOUDINARY_API_SECRET`) bị mất sau redeploy. Cần khôi phục dạng **encrypted secrets**
(xem `preview-and-qa.md`). Sau khi khôi phục, `POST` không auth phải trả **401**.
Chưa test upload ảnh thật (Bước 3) — vẫn **HOLD** phát hành.
