# Dream Vault V15 — Release Runbook & 6-Step Production Gate

**Branch**: `feature/production-hardening-v15` · **RC commit**: `aa26ba3`
**Mục tiêu**: đóng 3 release gate UNVERIFIED (§3–§5) rồi phát hành `ui-v15.0.0` (§6).
**Nguyên tắc**: $0 · không đổi dữ liệu production khi chưa sao lưu · không tạo tag trước khi duyệt GO.

> Trạng thái hiện tại: **RC = GO · Production = HOLD**.
> Tiến độ gate thủ công: `0/6`.

---

## Bước 0 (BẮT BUỘC) — Sao lưu trước mọi thao tác production

Không deploy và không sửa rules trước khi có bản sao lưu.

**0.1 Dữ liệu phía người dùng (localStorage) — $0, làm được ngay**
Với mỗi trình duyệt/thiết bị đang dùng:
1. Mở website → **Xuất JSON** (nút Xuất) → lưu tệp `wishlist-YYYY-MM-DD.json`.
2. (Tuỳ chọn) Kiểm tra nhanh nội dung trong DevTools Console:
   ```js
   copy(JSON.stringify(JSON.parse(localStorage.getItem('wishlist.items')), null, 2))
   ```
   → dán ra một tệp `.json` để đối chiếu.

**0.2 Dữ liệu Firestore (đã đồng bộ cloud)**
- Đường $0: export từng tài khoản qua website (mục 0.1) sau khi đăng nhập, hoặc đọc trực tiếp trong Firebase Console → Firestore → `users/{uid}/items`.
- Managed export `gcloud firestore export ...` **yêu cầu gói Blaze (trả phí)** → không nằm trong ngân sách $0; bỏ qua hoặc dùng thủ công nếu bạn đã có Blaze.

**0.3 Ảnh chụp cấu hình hiện tại**
```powershell
git rev-parse HEAD                                   # ghi lại commit đang cân nhắc phát hành
firebase projects:list                               # xác nhận đúng project wishlist-787d2
# lưu lại firestore.rules hiện tại trên Console để rollback nếu cần
```

---

## Gate 1 — Firestore Rules (emulator + truy cập chéo tài khoản)

**Điều kiện**: Java 11+ và Firebase CLI.
```powershell
Set-Location "E:\Buying Checklist"
java -version                                        # phải in ra phiên bản JVM
npm i -D @firebase/rules-unit-testing firebase       # node_modules đã được .gitignore
firebase emulators:exec --only firestore --project wishlist-787d2 "node scripts/test-firestore-rules.mjs"
```
**Kỳ vọng**: `RULES: 9 PASS, 0 FAIL`. Kịch bản kiểm tra: chủ sở hữu đọc/ghi được dữ liệu của mình; **bob không đọc/ghi được của alice**; ẩn danh bị chặn; collection lạ bị default-deny.

**Đối chiếu rules đã deploy** (không deploy trong bước này):
```powershell
firebase deploy --only firestore:rules --dry-run     # xem diff, KHÔNG áp dụng
```
Đối chiếu nội dung với `firestore.rules` trong repo. Nếu khác → ghi lại khác biệt, quyết định trước khi phát hành.

**Bằng chứng cần lưu**: output `RULES: ...` + ảnh chụp diff dry-run.

---

## Gate 2 — Google Login/Logout & Sync đa thiết bị

Chuẩn bị: 1 tài khoản Google test (được phép dùng).
1. **Login**: mở site trên **máy A** → đăng nhập Google → thêm 1 món.
2. **Sync sang máy B**: mở site trên **máy B** (khác trình duyệt/thiết bị) → đăng nhập **cùng tài khoản** → món vừa thêm xuất hiện.
3. **Hai chiều**: sửa/xoá trên B → làm mới A → thay đổi phản ánh.
4. **Logout**: đăng xuất trên A → dữ liệu cloud không còn tự đồng bộ; dữ liệu cục bộ vẫn còn.
5. **Lỗi kết nối**: ngắt mạng → thao tác → phải hiện banner "Không đồng bộ được với Firebase…", dữ liệu vẫn lưu cục bộ, không mất.
6. **Kiểm tra Console**: Firebase Console → Authentication → Users có tài khoản test; Firestore → `users/{uid}/items` có document.

**Bằng chứng cần lưu**: ảnh chụp hai thiết bị cùng danh sách + màn hình Console.

---

## Gate 3 — Build `dist/` và xác minh chỉ có runtime assets

```powershell
node scripts/build-hosting.mjs     # dựng dist/ từ allowlist
node scripts/check-hosting.mjs     # in hosting-audit.json
Get-ChildItem dist -Recurse -File | Measure-Object   # kỳ vọng 48 file
```
**Kỳ vọng**: `verdict: PASS — no repo internals published; all runtime assets present`; **0 rò rỉ**; `cssCount = 46`; có `wishlist.html`, `wishlist-cloud.js`.
**Phải có**: `docs/`, `firebase.json`, `firestore.rules`, `FIREBASE_SETUP.md`, `.firebaserc`, mọi dotfile **KHÔNG** xuất hiện trong `dist/`.

---

## Gate 4 — Deploy (chỉ sau khi Gate 0–3 PASS và có phê duyệt)

**4.1 Preview channel trước (không ảnh hưởng site thật)**
```powershell
node scripts/build-hosting.mjs
firebase hosting:channel:deploy v15-rc --expires 7d
```
→ Mở URL preview: kiểm tra trang chủ render, asset CSS 200, Console không lỗi.

**4.2 Production (sau khi preview PASS + bạn phê duyệt GO)**
```powershell
node scripts/build-hosting.mjs
firebase deploy --only hosting,firestore:rules
```

**Rollback nếu sự cố**:
- Hosting: `firebase hosting:rollback` (quay lại bản release trước) hoặc `firebase hosting:channel` như cũ.
- Rules: khôi phục bằng Console (Rules history) hoặc deploy lại `firestore.rules` đã sao lưu ở §0.3.

> `public` đã = `dist`. Nếu quên build, `dist/` rỗng/thiếu → deploy publish sai/không publish (fail-closed). **Luôn build ngay trước khi deploy.**

---

## Gate 5 — Smoke test trên URL production

Chạy trên URL thật (desktop + mobile):
- [ ] `https://` truy cập được, HTTP tự chuyển HTTPS.
- [ ] Headers: `curl -I https://<domain>/` → có `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, HSTS.
- [ ] Trang chủ 200; `dist` asset tải 200 (`/css/*.css`, `/wishlist-cloud.js`).
- [ ] `docs/...` **không** truy cập được (ví dụ `/docs/qa/dream-vault-v15/final-report.md` → 404).
- [ ] CRUD: thêm/sửa/xoá món, xuất/nhập JSON, Quick View, dialog — không lỗi Console.
- [ ] Sync: lặp lại Gate 2 trên môi trường production.
- [ ] Không có lỗi Console/JS; responsive 375/1440 không tràn.

**Bằng chứng cần lưu**: ảnh chụp header, 404 cho `docs/`, các bước CRUD + sync.

---

## Gate 6 — Đối chiếu release, tạo tag `ui-v15.0.0`, công bố 1.0 Stable

Chỉ thực hiện khi **tất cả gate trên PASS**.
```powershell
Set-Location "E:\Buying Checklist"
git switch feature/production-hardening-v15
git pull --ff-only origin feature/production-hardening-v15
git status --porcelain                    # phải rỗng
git rev-parse HEAD                        # ghi lại SHA phát hành

# xác nhận lại build/audit trên đúng commit này
node scripts/build-hosting.mjs
node scripts/check-hosting.mjs            # kỳ vọng PASS, 0 rò rỉ

# (tuỳ chọn) chạy lại regression V9–V14 + V15 trước khi tag

git tag -a ui-v15.0.0 -m "Dream Vault V15.0.0 - Production Hardening"
git push origin ui-v15.0.0

# kiểm tra tag trỏ đúng commit đã deploy
git rev-list -n 1 ui-v15.0.0
```
- [ ] `git rev-list -n 1 ui-v15.0.0` == SHA đã deploy == HEAD.
- [ ] 13 tag cũ (`ui-v2.0.0` … `ui-v14.0.0`) không bị sửa.
- [ ] Công bố Dream Vault 1.0 Stable.

---

## Điều KHÔNG được làm

- Không deploy / sửa rules production trước khi có sao lưu (§0) và Gate 1–3 PASS.
- Không tạo tag `ui-v15.0.0` trước khi bạn duyệt GO.
- Không chỉnh sửa các tag đã đóng băng (`ui-v2.0.0` … `ui-v14.0.0`).
- Không commit `dist/`, `node_modules/`, `.firebase/` (đã `.gitignore`).
- Không hay đổi thiết kế/UI trong giai đoạn phát hành — sự cố phát sinh thì sửa trên branch mới, không sửa tag.
