# Thiết lập đồng bộ Wishlist bằng Firebase

Wishlist hiện vẫn lưu cục bộ nếu chưa cấu hình Firebase. Sau khi làm các bước bên dưới, đăng nhập cùng một tài khoản Google trên máy tính và điện thoại để đồng bộ.

## 1. Tạo Firebase project

1. Tạo project tại [Firebase Console](https://console.firebase.google.com/).
2. Trong **Authentication → Sign-in method**, bật **Google**.
3. Trong **Authentication → Settings → Authorized domains**, thêm tên miền sẽ lưu trữ trang Wishlist.
4. Tạo cơ sở dữ liệu tại **Firestore Database**. Không cần bật Firebase Storage.
5. Trong **Project settings → Your apps**, tạo một ứng dụng Web và sao chép cấu hình Firebase.

## 2. Điền Web App config

`wishlist-cloud.js` đã được điền cấu hình Web App của project này. Nếu tạo project Firebase khác, thay các giá trị trong `firebaseConfig` bằng cấu hình Web App mới. Đây là cấu hình phía trình duyệt, không phải khóa quản trị hay service-account private key.

## 3. Cài quy tắc bảo mật

Sao chép nội dung `firestore.rules` vào **Firestore Database → Rules**, sau đó Publish. Quy tắc giới hạn mỗi tài khoản chỉ đọc/ghi dữ liệu của chính tài khoản đó.

## 4. Triển khai lên Firebase Hosting

Trong Firebase Console, mở **Hosting** và bắt đầu thiết lập nếu được yêu cầu. Cài Firebase CLI, đăng nhập rồi chạy đúng các lệnh sau trong PowerShell:

```powershell
npm install -g firebase-tools
firebase login
Set-Location "E:\Buying Checklist"
firebase use wishlist-787d2
firebase deploy --only hosting,firestore:rules
```

Tệp `firebase.json` cấu hình thư mục Hosting hiện tại và rewrite URL gốc `/` sang nội dung `wishlist.html` mà không đổi địa chỉ trên thanh trình duyệt; `.firebaserc` chọn project `wishlist-787d2`.

Sau khi deploy thành công, chỉ cần mở `https://wishlist-787d2.web.app/`; trang wishlist sẽ hiển thị ngay tại URL gốc. Nếu trang chưa cập nhật, chạy lại lệnh deploy từ đúng thư mục ở trên và kiểm tra dòng project trong output.

Nếu vẫn thấy trang 404 sau khi deploy, mở trực tiếp `https://wishlist-787d2.web.app/wishlist.html`. Nếu đường dẫn này cũng báo 404, kiểm tra phần đầu output lệnh deploy để xác nhận đúng project `wishlist-787d2` và đúng thư mục `E:\Buying Checklist` (thư mục đó phải có `wishlist.html`, `wishlist-cloud.js` và `firebase.json`). Nếu lệnh báo chưa có Firestore database hoặc chưa kích hoạt Hosting, hoàn tất bước khởi tạo đó trong Firebase Console rồi chạy lại.

Trang cần chạy trên HTTPS (hoặc `localhost` khi phát triển); đăng nhập Google không hoạt động từ địa chỉ `file://`.

Danh sách, ghi chú và URL ảnh được đồng bộ qua Firestore. Firestore chỉ lưu dữ liệu dạng tài liệu, không tải/lưu ảnh như một dịch vụ lưu trữ tệp. Ảnh tải từ thiết bị được giữ cục bộ và không gửi lên Firebase; để ảnh hiện trên thiết bị khác, dùng URL ảnh công khai. Khi thêm hoặc sửa món, điền URL trực tiếp tới ảnh vào ô **Đường dẫn ảnh** thay vì tải tệp từ thiết bị.

## Chuyển danh sách hiện có từ máy tính

`localStorage` của địa chỉ `file://` không được chia sẻ với website HTTPS. Trên trang đang dùng ở máy tính, chọn **Xuất JSON** để sao lưu danh sách. Sau khi triển khai và mở website HTTPS trên máy tính, chọn **Nhập JSON** trước khi đăng nhập để nạp bản sao lưu thay cho dữ liệu mẫu. Sau đó đăng nhập Google; danh sách sẽ được tải lên và có thể mở trên điện thoại bằng cùng tài khoản.

## Lưu ý

- Danh sách chưa đăng nhập vẫn hoạt động bằng bộ nhớ cục bộ của trình duyệt.
- Bản mẫu tự thêm dữ liệu minh họa ở lần mở đầu tiên. Xóa dữ liệu mẫu trước khi đăng nhập nếu không muốn đưa chúng lên tài khoản.
- Không đưa service-account key hoặc private key vào các tệp của trang web.

---

## V15 - Build before deploy (hosting allowlist)

`firebase.json` now publishes the staging directory `dist/` only, assembled from an
explicit allowlist by `scripts/build-hosting.mjs`. This prevents repository internals
(`docs/` QA + design material, config files, dotfiles) from being served publicly.

Deploy steps:

```powershell
Set-Location "E:\Buying Checklist"
node scripts/build-hosting.mjs        # writes ./dist (wishlist.html, wishlist-cloud.js, css/)
node scripts/check-hosting.mjs        # verifies allowlist / no leaks
firebase use wishlist-787d2
firebase deploy --only hosting,firestore:rules
```

If `dist/` is absent the deploy fails closed (nothing is published). Re-run the build
after every content change.
