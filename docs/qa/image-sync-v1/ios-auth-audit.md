# Dream Vault — Phase 2A: iOS Firebase Auth Root-Cause Audit

Branch: `feature/cloudinary-image-sync-v1`
Code commit: `f92744c` (pushed) · Preview channel: `image-sync-v1` (version `c1b5dba36244f889`)
Production: `https://wishlist-787d2.web.app` — **không thay đổi**

## 1. Kết luận nhanh (TL;DR)

**Nguyên nhân gốc đã được xác định và tái hiện 100%:** tính năng đăng nhập Google trên
Preview thất bại vì **`authDomain` và OAuth redirect URI lệch cấu hình**, dẫn tới Google trả về
`Error 400: redirect_uri_mismatch`.

| | Origin trang (app) | `authDomain` (auth helper) | Google OAuth | Kết quả |
|---|---|---|---|---|
| **Production** | `wishlist-787d2.web.app` | `wishlist-787d2.web.app` (same-origin) | `https://wishlist-787d2.web.app/__/auth/handler` → **được phép** | ✅ Đăng nhập OK |
| **Preview (hiện tại)** | `…--image-sync-v1-efzo5nzk.web.app` | `…--image-sync-v1-efzo5nzk.web.app` (same-origin) | `https://…--image-sync-v1-efzo5nzk.web.app/__/auth/handler` → **BỊ CHẶN** | ❌ `redirect_uri_mismatch` |

→ Code đã đúng hướng (same-origin, theo Firebase Option 1). **Phần còn thiếu là cấu hình
phía Google/Firebase: tên miền Preview chưa được cấp phép làm OAuth redirect domain.**
Xem §8 (việc chủ dự án cần làm) — đây là **khối chặn duy nhất còn lại**.

## 2. Phạm vi audit

Đã rà soát trong `wishlist-cloud.js` + `wishlist.html`:
`initializeApp` · `authDomain` · `setPersistence` (local/session/memory) · `onAuthStateChanged` ·
`getRedirectResult` · `signInWithRedirect` / `signInWithPopup` · vòng đời module (cache-bust `?v=`),
luồng đăng nhập 2 bước, và khả năng khôi phục phiên sau redirect trên Safari.

## 3. Nguyên nhân gốc — bằng chứng tái hiện

Chạy trực tiếp luồng đăng nhập thật trên Preview (mobile emulation) và bắt URL OAuth mà Firebase
gửi đi (`docs/qa/image-sync-v1/raw/auth-oauth-probe.txt`):

```
redirect_uri = https://wishlist-787d2--image-sync-v1-efzo5nzk.web.app/__/auth/handler
client_id    = 444123301601-i8di1kmj4em9jk2j7b8bg1o0mscjt37l.apps.googleusercontent.com
→ Google: "Access blocked: This app's request is invalid"  ·  Error 400: redirect_uri_mismatch
```

Đối chứng trên Production (cùng client_id) → Google hiện màn hình chọn tài khoản bình thường.

Đã xác nhận thêm:
- Firebase Hosting **có** phục vụ `/__/auth/handler`, `/__/auth/iframe`, `/__/firebase/init.json`
  trên tên miền Preview (HTTP 200) → hạ tầng handler OK, không phải lỗi thiếu file.
- Vấn đề nằm ở **danh sách redirect URI được cấp phép cho OAuth client** (phía Google), không
  phải ở hosting.

## 4. Vì sao trước đây "Google đăng nhập thành công nhưng app vẫn chưa đăng nhập"

Đây là **cấu hình cũ** (trước commit `cca8b91`): Preview dùng `authDomain = wishlist-787d2.web.app`
(origin khác với trang Preview). Khi đó:
1. Redirect sang `wishlist-787d2.web.app/__/auth/handler` → Google **được phép** → đăng nhập thành công.
2. Kết quả xác thực được ghi vào vùng lưu trữ của **origin auth helper** (`wishlist-787d2.web.app`).
3. Trang Preview (origin khác) đọc lại kết quả đó → **Safari chặn (third-party storage/ITP)** →
   `onAuthStateChanged` trả về `null` → app hiển thị "chưa đăng nhập".

Đúng theo tài liệu Firebase *Best practices for signInWithRedirect on browsers that block
third-party storage access*: app trên `*.web.app`/custom domain **phải** đặt `authDomain` cùng
origin với app (Option 1) — **và** thêm origin đó vào danh sách **authorized redirect URIs**.
Bước 1 đã làm; **bước 2 chưa làm** → sinh ra lỗi `redirect_uri_mismatch` hiện tại.

## 5. Thay đổi (đã commit `f92744c`)

| File | Thay đổi |
|---|---|
| `wishlist-cloud.js` | **authDomain** suy ra từ `location.hostname` cho mọi origin thuộc Hosting (`*.web.app`, `*.firebaseapp.com`) → giữ same-origin (Firebase Option 1) và **không còn hard-code** tên miền kênh preview (bền với hash kênh). Production vẫn là `wishlist-787d2.web.app`; `localhost` giữ mặc định. |
| `wishlist-cloud.js` | **Diagnostics tạm thời** (`?authdebug=1` hoặc `localStorage.dreamVaultAuthDebug="1"`): ghi lại *state transitions*, *persistence kind*, *Firebase error code*, *authDomain* — **tuyệt đối không ghi token/email/UID/dữ liệu**. Buffer ở `window.__dvAuthLog` (tối đa 200 mục). |
| `wishlist-cloud.js` | Gắn `onAuthStateChanged` **trước** khi gọi `getRedirectResult`, và **bọc try/catch**: lỗi khi khôi phục redirect không còn làm hỏng toàn bộ khởi tạo đồng bộ. |
| `wishlist.html` | `describeAuthError()`: dịch mã lỗi Firebase thành câu tiếng Việt hành động được (unauthorized-domain, popup-blocked, operation-not-supported…). |
| `wishlist.html` | Bump cache-bust module `wishlist-cloud.js?v=8 → ?v=9`. |

Không thay đổi: logic CRUD/đồng bộ, schema Firestore, luồng Cloudinary/Worker, dữ liệu người dùng,
và **Production**.

## 6. Cách bật chẩn đoán trên iPhone

Mở: `https://wishlist-787d2--image-sync-v1-efzo5nzk.web.app/wishlist.html?authdebug=1`

- Console Safari (hoặc `window.__dvAuthLog`) sẽ có các dòng `[dv-auth]`:
  `init :: authDomain=…` · `persistence :: local|session|memory` · `state :: signed-in|signed-out` ·
  `redirect-result` / `redirect-error` · `sign-in :: mode=redirect|popup`.
- Không cần devtools: có thể xem mục cuối `window.__dvAuthLog` hoặc lỗi hiển thị ngay trên thanh đồng bộ.

> Bloc này được đánh dấu **TEMPORARY** trong code — sẽ gỡ sau khi iPhone xác nhận PASS.

## 7. Kiểm thử đã chạy

| Bộ test | Kết quả |
|---|---|
| `tmp-auth-diag.js` (logic authDomain + diagnostics + privacy + mapping + CRUD, tại `localhost:8115`) | **25 PASS / 0 FAIL** |
| `tmp-auth-live.js` (Preview thật: asset khớp `dist` byte-for-byte, authDomain same-origin, chế độ redirect, privacy) | **13 PASS / 0 FAIL** |
| Regression sweep V8b–V16 | **533 PASS / 21 FAIL** — y hệt baseline trước thay đổi (21 lỗi pre-existing) |

Chi tiết log thô: `docs/qa/image-sync-v1/raw/auth-*.txt`.

**Kiểm chứng quyền riêng tư:** log chẩn đoán không chứa JWT (`eyJ…`), không email, không "bearer".

## 8. Việc chủ dự án cần làm (KHỐI CHẶN — không thể làm từ repo)

1. **Firebase Console → Authentication → Settings → Authorized domains** → thêm
   `wishlist-787d2--image-sync-v1-efzo5nzk.web.app`.
2. **Google Cloud Console → APIs & Services → Credentials** → OAuth 2.0 Client ID
   `444123301601-i8di1kmj4em9jk2j7b8bg1o0mscjt37l` *(Web client – auto created by Google Service)* →
   **Authorized redirect URIs** → thêm
   `https://wishlist-787d2--image-sync-v1-efzo5nzk.web.app/__/auth/handler`.
   (Đây là bước trực tiếp gỡ lỗi `redirect_uri_mismatch`.)
3. (nếu cần) **Authorized JavaScript origins** → thêm `https://wishlist-787d2--image-sync-v1-efzo5nzk.web.app`.
4. Kiểm chứng lại: URL authorize phải hiện **màn hình chọn tài khoản Google** (không còn "Access blocked").

Lưu ý: hash kênh `efzo5nzk` ổn định → chỉ cần làm **một lần**. Nếu xoá/tạo lại kênh với hash khác
thì tên miền đổi và phải thêm lại.

## 9. Trạng thái Acceptance Criteria

| Tiêu chí | Trạng thái |
|---|---|
| Google Login thành công trên iPhone Safari | ⏳ **Chờ** — cần §8 + test máy thật |
| Khôi phục đúng trạng thái đã xác thực sau OAuth | ⏳ Chờ (code same-origin đã đúng; chờ cấp phép domain) |
| Phiên đăng nhập tồn tại qua reload theo persistence | ✅ Code + diagnostics sẵn sàng (ghi rõ `local/session/memory`) |
| Firestore tải dữ liệu đúng UID | ✅ Logic không đổi; xác nhận lại khi đã đăng nhập |
| Google Login trên desktop vẫn hoạt động | ✅ Giữ nguyên (authDomain production + popup desktop) |
| Không lộ token/secret/PII | ✅ Đã kiểm chứng |
| Production V15 không đổi | ✅ Không chạm |

## 10. Release gate

**HOLD.** Không merge `main`, không deploy Production, không tạo tag. Chỉ mở khoá sau khi §8 được
thực hiện và test thật trên iPhone xác nhận đủ các hành vi xác thực.
