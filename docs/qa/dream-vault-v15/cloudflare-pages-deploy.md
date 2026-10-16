# Deploy lên Cloudflare Pages (Git integration)

Bản publish của dự án nằm ở `dist/` và được **sinh ra lúc build** bởi `scripts/build-hosting.mjs`
(chỉ dùng Node built-in, **không cần `npm install`**). Cloudflare phải chạy script này, nếu không sẽ báo
*"Could not detect a directory containing static files"*.

## Cấu hình trên Cloudflare (Workers & Pages → Create → Pages → Connect to Git)

| Cài đặt | Giá trị |
|---|---|
| Repository | `DB-Ducbao113/Wishlist` |
| Production branch | nhánh bạn muốn (vd `feature/production-hardening-v15` hoặc `main`) |
| Framework preset | **None** |
| Build command | `node scripts/build-hosting.mjs` |
| Build output directory | `dist` |
| Environment variable | `NODE_VERSION = 20` (khuyến nghị) |

Sau khi build, `dist/` chứa **50 file**: 48 asset (`wishlist.html`, `wishlist-cloud.js`, 46 CSS)
+ 2 file nền tảng cho Cloudflare (`_redirects`, `_headers`).

## Những gì đã được xử lý sẵn

- **Trang gốc `/`**: Cloudflare mặc định phục vụ `index.html`, nhưng entry của ta là `wishlist.html`.
  `dist/_redirects` đã có:
  ```
  /  /wishlist.html  200
  ```
- **Headers an toàn**: `dist/_headers` khai báo `X-Content-Type-Options: nosniff` và
  `Referrer-Policy: strict-origin-when-cross-origin` (giống `firebase.json`).
- **Không rò rỉ nội bộ**: allowlist chỉ copy `wishlist.html`, `wishlist-cloud.js`, `css/**`;
  `docs/`, cấu hình, ảnh thừa… không bao giờ được publish.

## Cần làm thêm phía Firebase (vì app chạy trên domain Cloudflare)

1. **Authorized domains**: nếu mở app từ `https://<du-an>.pages.dev`, thêm domain đó vào
   **Firebase Console → Authentication → Settings → Authorized domains**, nếu không đăng nhập Google sẽ bị chặn.
2. **API key referrer**: nếu Firebase Web API key có giới hạn HTTP referrer,
   thêm `https://<du-an>.pages.dev/*` trong **Google Cloud Console → Credentials → API key**.
3. **Firestore Rules** không đổi (áp dụng ở phía máy chủ).

## Phương án thay thế — tải trực tiếp bằng wrangler

```powershell
Set-Location "<repo>"
node scripts/build-hosting.mjs
npx wrangler pages deploy dist --project-name=<du-an>
```

## Lệnh build cục bộ để kiểm tra trước

```powershell
node scripts/build-hosting.mjs     # sinh dist/ (50 file)
node scripts/check-hosting.mjs     # kỳ vọng: verdict PASS, 0 rò rỉ, cssCount 46
```
