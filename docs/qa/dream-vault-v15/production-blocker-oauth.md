# P1 Blocker — Google Sign-in trả `redirect_uri_mismatch`

**Mức độ**: P1 — chặn phát hành 1.0 Stable (người dùng mới không đăng nhập được).
**Phát hiện**: 2026-10-16, kiểm thử trên `https://wishlist-787d2.web.app`.

## Triệu chứng
Bấm **Đăng nhập** → popup Google hiện:
> Access blocked: This app's request is invalid
> Error 400: **redirect_uri_mismatch**

URL lỗi: `https://accounts.google.com/signin/oauth/error?authError=…redirect_uri_mismatch…`
Redirect URI bị từ chối: `https://wishlist-787d2.web.app/__/auth/handler`
OAuth client: `444123301601-i8di1kmj4em9jk2j7b8bg1o0mscjt37l.apps.googleusercontent.com`

## Nguyên nhân
`wishlist-cloud.js` đặt `authDomain: "wishlist-787d2.web.app"`, nên Firebase Auth dùng
`https://wishlist-787d2.web.app/__/auth/handler` làm redirect URI. URI này **chưa được đăng ký**
trong OAuth 2.0 Client (auto-created) của project → Google từ chối.

Vì sao khó thấy: phiên cũ (tài khoản đã đăng nhập trước đó) vẫn hoạt động và sync bình thường,
nên chỉ kiểm thử bằng tài khoản đã đăng nhập sẽ không lộ lỗi. Lỗi chỉ xuất hiện khi **đăng nhập mới**.

## Cách sửa

### Cách A — Không cần deploy lại (khuyến nghị, ~1 phút)
Google Cloud Console → **APIs & Services → Credentials** → OAuth 2.0 Client ID
*(tên "Web client (auto created by Google Service)", ID `...mscjt37l`)* →
**Authorized redirect URIs → Add URI**:
```
https://wishlist-787d2.web.app/__/auth/handler
```
Nên thêm cả (nếu muốn dự phòng):
```
https://wishlist-787d2.firebaseapp.com/__/auth/handler
```
→ **Save**. Chờ ~1–5 phút rồi thử đăng nhập lại.

### Cách B — Sửa code + deploy lại
Đổi `authDomain` trong `wishlist-cloud.js` về mặc định Firebase:
```js
authDomain: "wishlist-787d2.firebaseapp.com",
```
Handler mặc định này đã được đăng ký sẵn → không cần đổi Console. Cần rebuild `dist/` + deploy lại.
(Đánh đổi: auth iframe/popup chạy trên `firebaseapp.com` thay vì cùng site `web.app`.)

## Xác minh sau khi sửa
1. Mở site ở cửa sổ ẩn danh/hoặc đăng xuất → bấm Đăng nhập → hoàn tất Google → `#syncEmail` hiển thị email.
2. Thêm 1 món → kiểm tra Firestore `/users/{uid}/items` có document.
3. Mở thiết bị/trình duyệt thứ hai, đăng nhập cùng tài khoản → thấy món đó (sync 2 chiều).

## Trạng thái các phần khác của Gate 2 (đã VERIFIED)
- **Sync read**: app nhận danh sách từ máy chủ (`Đã nhận dữ liệu từ máy chủ`) — OK.
- **Sync write**: món thêm vào đã xuất hiện trên Firestore (xác nhận qua admin read) — OK.
- **Cách ly dữ liệu**: token thật đọc dữ liệu của mình = 200, đọc uid khác = 403 — OK.
- Chỉ **đăng nhập mới** là hỏng.
