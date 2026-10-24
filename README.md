# Personal Vault (PVault)

> **Không gian lưu giữ ước mơ & kế hoạch mua sắm cá nhân**  
> *A minimalist, privacy-focused personal wishlist & dream tracker application.*

🌐 **Trải nghiệm trực tiếp:** [https://wishlist-787d2.web.app](https://wishlist-787d2.web.app)

---

## ✨ Tính năng nổi bật

* **3 Chế độ hiển thị linh hoạt:**
  * **Dạng lưới (Gallery View):** Hiển thị thẻ sản phẩm chuẩn tỷ lệ, hình ảnh bao trọn không cắt xén, huy hiệu trạng thái rõ ràng.
  * **Dạng tập trung (Focus View):** Trải nghiệm tạp chí 2 cột, nổi bật từng vật phẩm với thông tin chi tiết.
  * **Dạng bảng (Board View):** Quản lý tiến độ mua sắm theo cột Kanban (*Muốn mua*, *Đang để dành*, *Đã đặt hàng*, *Đã mua*).
* **Bảng thống kê tài chính trực quan:** Tự động tổng hợp số lượng món, tổng ngân sách cần tích lũy và số tiền đã chi trả.
* **Bộ lọc & Tìm kiếm tức thì:** Tìm kiếm theo tên, phân loại theo độ ưu tiên, danh mục và sắp xếp đa chiều.
* **Menu thao tác nhanh (⋯):** Chuyển đổi trạng thái 1-click, chỉnh sửa hoặc xóa món với tính năng hoàn tác (Undo) an toàn.
* **Lưu trữ & Đồng bộ:**
  * **Offline-first / Guest Mode:** Toàn bộ dữ liệu được lưu an toàn trên trình duyệt (`localStorage`).
  * **Cloud Sync:** Tùy chọn đăng nhập bằng tài khoản để đồng bộ hóa đa thiết bị qua Firebase Firestore.
  * **Xuất/Nhập dữ liệu:** Sao lưu và phục hồi danh sách dễ dàng qua tệp JSON.

---

## 🛠️ Công nghệ sử dụng

* **Frontend:** Vanilla HTML5, Modern CSS (Glassmorphism, CSS Grid, Custom Design System), Vanilla JavaScript (ES Modules).
* **Cloud & Hosting:** Firebase Hosting, Cloud Firestore, Firebase Authentication.
* **Kiểm thử tự động (QA):** Bộ harness kiểm thử tự động với Puppeteer & Lighthouse (F1, F4, V16 Responsive).

---

## 🚀 Khởi chạy cục bộ

```bash
# Cài đặt công cụ kiểm thử (nếu cần)
npm install

# Kiểm tra cú pháp và chất lượng giao diện
npm run qa:syntax
npm run qa:f4

# Đóng gói và kiểm tra bản build hosting
npm run build
npm run check:hosting

# Khởi chạy máy chủ cục bộ
# Mở trực tiếp wishlist.html trên trình duyệt hoặc dùng Live Server / npx serve
```
