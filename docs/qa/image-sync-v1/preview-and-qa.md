# Image Sync 1.0 — Preview & QA tracking

## Endpoints

| Thành phần | Giá trị |
|---|---|
| Worker URL | `https://wishlist-images.ducbao147258.workers.dev/sign` |
| Cloudinary cloud | `herun6yp` |
| Production origin | `https://wishlist-787d2.web.app` |
| **Preview origin** | `https://wishlist-787d2--image-sync-v1-efzo5nzk.web.app` |
| Preview channel | `image-sync-v1` (hết hạn 2026-10-23, version `c1b5dba36244f889`) |
| Branch | `feature/cloudinary-image-sync-v1` (HEAD `f92744c`) |

## Cloudflare Worker — TRẠNG THÁI (cập nhật 2026-10-16)

✅ **Đã xong** (chủ dự án khôi phục cấu hình + thêm preview origin). Kiểm chứng **live** trên
`https://wishlist-images.ducbao147258.workers.dev/sign`:

| Trường hợp | Kết quả | Kỳ vọng |
|---|---|---|
| Origin production, không auth | 401 | 401 ✅ |
| **Origin preview, không auth** | **401** | 401 ✅ (trước là 403) |
| Origin lạ (`evil.example`) | 403 | 403 ✅ |
| `OPTIONS` preflight | 204 | 204 ✅ |
| `GET` (sai method) | 404 | 404 ✅ |

`wrangler.toml`: `name = "wishlist-images"`,
`ALLOWED_ORIGINS = "https://wishlist-787d2.web.app,https://wishlist-787d2--image-sync-v1-efzo5nzk.web.app"`.

## Firebase Auth (Bước 2) — iPhone redirect

> **Xem báo cáo audit đầy đủ: [`ios-auth-audit.md`](./ios-auth-audit.md) (Phase 2A).**
> Nguyên nhân gốc đã xác định: `Error 400: redirect_uri_mismatch` — tên miền Preview chưa được
> cấp phép làm OAuth redirect domain. **Khối chặn duy nhất còn lại** là cấu hình Console (§8 báo cáo).

- **Authentication → Settings → Authorized domains**: thêm `wishlist-787d2--image-sync-v1-efzo5nzk.web.app`. *(Cần chủ dự án làm — không thể từ repo.)*
- **Google Cloud Console → Credentials → OAuth client `…i8di1kmj4em9jk2j7b8bg1o0mscjt37l`**: thêm redirect URI `https://wishlist-787d2--image-sync-v1-efzo5nzk.web.app/__/auth/handler`.
- **Auth helper cùng origin (Safari redirect)**: `wishlist-cloud.js` suy ra `authDomain` từ `location.hostname` (same-origin, Firebase Option 1). Mobile: `signInWithRedirect`; desktop: `signInWithPopup` (giữ nguyên hành vi cũ).
- **Chẩn đoán trên máy thật**: mở `…/wishlist.html?authdebug=1` → đọc `window.__dvAuthLog` (không chứa token/PII).

## Nhật ký deploy Preview (Firebase Hosting channel `image-sync-v1`)

| Thời điểm | Version | Nội dung |
|---|---|---|
| 2026-10-16 (đầu) | `d19e3a8a31cc74fc` | Bản trước khi đồng bộ |
| 2026-10-16 | `ed1dd18ca0880271` | UI/UX mới: CTA pill gradient, tiếng Việt, header responsive, placeholder lavender |
| 2026-10-16 | `033bc604dcc05089` | + 4 bản vá Firebase Auth cho iOS Safari (authDomain cùng origin, popup user-activation, cache-bust `?v=8`) |
| 2026-10-16 | `c1b5dba36244f889` | Phase 2A: authDomain suy ra từ page host + diagnostics `?authdebug=1` + hardening redirect (`?v=9`) |

Kiểm chứng sau deploy cuối (`node tmp-preview.js`): **17/17 PASS** — asset trên Live khớp byte với `dist`
(SHA-256), CTA `radius:999px` + viền gradient, UI tiếng Việt, CRUD thêm món OK, 0 console error.
Build: `node scripts/build-hosting.mjs` → 49 files. Deploy: `firebase hosting:channel:deploy image-sync-v1 --project wishlist-787d2`.

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
