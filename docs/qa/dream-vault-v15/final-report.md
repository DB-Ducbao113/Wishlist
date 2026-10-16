# Dream Vault V15 — Production Hardening (Final Report)

**Branch**: `feature/production-hardening-v15`
**Baseline**: `ui-v14.0.0` (`ad4c38a`)
**Budget**: $0 · Không thêm tính năng UI · Không đổi thiết kế đã chốt
**Ngày**: 2026-10-15

---

## 0. Verdict

| Hạng mục | Kết quả |
|---|---|
| Hosting / secrets (code-side) | **GO** — lỗ hổng publish tài liệu nội bộ đã sửa + kiểm chứng |
| Data integrity (localStorage, CRUD, import/export, dữ liệu lỗi) | **GO** — 15/15 test V15 |
| Security (XSS, URL scheme, rò rỉ token) | **GO** |
| Regression V9–V14 | **GO** — 303/303 |
| Accessibility / Responsive / Performance (lab) | **GO** (không regression) |
| Firebase Sync (read/write/cách ly) thật | **VERIFIED** — đọc/ghi sync hoạt động; token Google thật đọc dữ liệu của mình 200, uid khác 403 |
| Google Login cho người dùng **mới** | **🔴 NO-GO — P1** — popup trả `redirect_uri_mismatch` |
| Firestore Rules đã deploy trên production | **VERIFIED** — rules deploy khớp tuyệt đối với source; ẩn danh `403`; cách ly UID `403` |
| URL production thật (HTTPS, headers, asset, 404 nội bộ, smoke) | **VERIFIED** — smoke 10/10 PASS; mọi đường dẫn nội bộ đều 404 |

**P0 = 0. P1 = 1 (ĐANG MỞ — Google OAuth `redirect_uri_mismatch`, xem §10).**

> V15 RC **đã được deploy lên production** (`https://wishlist-787d2.web.app`). Verification production ở §9: Hosting, headers, Firestore Rules và sync read/write đều **VERIFIED** — nhưng **đăng nhập Google cho người dùng mới đang hỏng (P1)**. Do đó **Dream Vault 1.0 Stable = NO-GO** tới khi P1 ở §10 được sửa và xác minh lại.

---

## 1. Thay đổi trong V15 (4 file + 3 script mới)

| File | Thay đổi |
|---|---|
| `firebase.json` | `public: "."` → `public: "dist"` (staging allowlist); thêm `headers` an toàn (`X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`) |
| `scripts/build-hosting.mjs` | **Mới** — dựng `dist/` từ allowlist tường minh, fail-closed |
| `scripts/check-hosting.mjs` | **Mới** — chứng minh phơi bày cũ vs allowlist mới |
| `scripts/test-firestore-rules.mjs` | **Mới** — kịch bản test rules cho owner (cần Java) |
| `.gitignore` | **Mới** — `dist/`, `.firebase/`, `node_modules/` |
| `FIREBASE_SETUP.md` | Thêm mục "V15 — Build before deploy" |
| `wishlist.html` | Thêm landmark `<main id="main-content">` (không đổi CSS, không đổi geometry) |

Không xóa/đổi bất kỳ file CSS nào (vẫn 46 stylesheet). Không đổi logic app.

---

## 2. Workstream A — Hosting & Deployment

### A1. Phát hiện (P1) và cách sửa
Cấu hình cũ `"public": "."` publish **toàn bộ repo** trừ một ignore-list nhỏ. Mô phỏng chính xác lựa chọn file của Firebase Hosting (`scripts/check-hosting.mjs`):

| | File sẽ publish | Rò rỉ nội bộ |
|---|---|---|
| **Cũ** (`public: "."`) | **719** | **616** (toàn bộ `docs/design/*`, `docs/qa/*`, ảnh QA/JSON nội bộ) |
| **Mới** (`public: "dist"` allowlist) | **48** (`wishlist.html`, `wishlist-cloud.js`, 46 CSS) | **0** |

→ Đây là rò rỉ thông tin nội bộ thật (tài liệu thiết kế, bằng chứng QA, đường dẫn repo). Đã sửa bằng **staging allowlist** (đúng ưu tiên trong spec), fail-closed: thiếu `dist/` thì deploy không publish gì.

Bằng chứng: `hosting-audit.json`, `hosting-manifest.json`.

### A2. Runtime assets
Xác minh chỉ `wishlist.html`, `wishlist-cloud.js`, `css/**` được tham chiếu lúc chạy. `image/` (5 file) **không** được tham chiếu bởi HTML/CSS/JS → không đưa vào allowlist (asset thừa). `worker/` rỗng. `docs/` (615 file tracked) nội bộ → không publish.

### A3. Secrets
Quét toàn repo: **không** có private key / service account / `.env` / token bị commit. Chuỗi `AIza...` duy nhất nằm trong `wishlist-cloud.js` là **Firebase Web API key** (công khai theo thiết kế, không phải bí mật).

### A4. Firestore Rules — **VERIFIED trên production**
`firestore.rules`: `allow read, write: if request.auth != null && request.auth.uid == userId;` cho `/users/{userId}/items/{itemId}` → bắt buộc đăng nhập, cách ly theo UID, default-deny cho mọi path khác.
Đã xác minh trên production (xem §9.3): ruleset đã deploy khớp tuyệt đối source; và kiểm chứng thực tế bằng **ID token Google thật** — đọc dữ liệu của chính mình = **200**, đọc uid khác (items + parent doc) và list `users` = **403**, ẩn danh = **403**.
Bằng chứng: `img/prod-firestore-rules.json`, `img/prod-rules-live.json`. Emulator cục bộ không chạy được (máy không có Java) → đã thay thế bằng kiểm chứng live trên production. `scripts/test-firestore-rules.mjs` vẫn kèm cho owner muốn chạy emulator.

### A5. HTTPS / headers
Production = Firebase Hosting → HTTPS mặc định (không xác minh được ở localhost). Header phía localhost chỉ là `SimpleHTTP` (không có security header) — **không** đại diện production. Đã thêm 2 header an toàn vào config hosting; các header mạnh hơn (CSP, X-Frame-Options) **chưa bật** vì có thể phá auth/popup và không kiểm thử được production → khuyến nghị ở §7.

---

## 3. Workstream B — Data Integrity (D1–D8)

| ID | Nội dung | Kết quả |
|---|---|---|
| D1 | CRUD 0→1 (add/edit/delete) + persistence 12 & 50 món qua reload | PASS |
| D2 | Export → Import roundtrip **byte-identical** (unicode, emoji, `"` `<b>`, xuống dòng, note 500 ký tự, ảnh data-URL) | PASS |
| D3 | JSON hỏng → báo lỗi rõ, dữ liệu không đổi, không crash | PASS |
| D4 | Trùng `id` + bản ghi sai shape → bỏ bản ghi lỗi, id hoá duy nhất, status/priority về mặc định | PASS |
| D5 | Giá âm/chữ/null/float/Infinity → số nguyên ≥ 0, không NaN | PASS |
| D6 | XSS qua import (name/category/note) → không thực thi, text nguyên văn | PASS |
| D7 | localStorage đầy → báo "bộ nhớ đầy", dialog giữ nguyên, **dữ liệu cũ nguyên vẹn** (backup+resync) | PASS |
| D8 | Guard ảnh: từ chối tệp không phải ảnh; chặn ảnh thứ 13 (giới hạn 12) | PASS |

Ghi nhận code: `normalizeItem()` là hàng rào nhập liệu tốt (validate name, clamp price, whitelist status/priority, cắt category 40 / note 500). `save()` có try/catch → không mất dữ liệu khi quota.

---

## 4. Workstream C — Security (S1–S6)

| ID | Nội dung | Kết quả |
|---|---|---|
| S1 | `safeUrl()` chỉ cho `http(s)://` và `data:image/`; chặn `javascript:`/`vbscript:`/`data:text/html` | PASS |
| S2 | XSS qua form (name/category/note) → không chèn thẻ, không thực thi | PASS |
| S2b | Form chặn link `javascript:` (báo lỗi, không thêm món) | PASS |
| S3 | Link mua ngoài: `target="_blank"` + `rel="noopener noreferrer"` | PASS |
| S4 | Không lưu token/secret dễ lộ trong localStorage/sessionStorage | PASS |
| S6 | Console JS errors = 0 trên toàn bộ kịch bản | PASS |

Cơ chế XSS-safe theo cấu trúc: mọi trường dữ liệu (name/category/note/price/meta) render bằng `textContent`; ảnh/link qua `safeUrl`/`validImageSrc`. Ảnh upload đi qua `compressImage` (canvas → data-URL).

---

## 5. Regression, Accessibility, Responsive, Performance

### Regression V9–V14 (chạy lại trên code V15)
`V14 25/25 · V13 50/50 · V12 40/40 · V11 34/34 · V10 26/26 · V9 128/128` → **303/303 PASS**.
Cộng **V15 15/15** → **318/318 PASS**. P0/P1 = 0.

### Accessibility
- **Đã đóng** mục tồn đọng từ V14: thêm `<main id="main-content">` → `main` landmark 0→1. Không lồng `<header>`/banner vào main.
- Bất biến hình học được chứng minh: `geom-with-main.json` vs `geom-without-main.json` **giống hệt** (scrollHeight 4264, scrollWidth 1440, mọi rect của `header/site-nav/hero/#collection/.v11-workspace/#grid/.stats-dashboard` trùng khớp). Ảnh full-page 1440 & 375 **pixel-identical** (SHA-256 trùng).
- Không issue mới so với V14. Tồn đọng (giống V14, không phải lỗi WCAG): `<summary aria-label>` (nhãn trùng nội dung hiển thị), một `<input>` có vòng focus do `:focus-within` của khối cha (đã xác minh V14). Không có skip-link — **không bắt buộc**: WCAG 2.4.1 (Bypass Blocks) được thoả qua landmark + heading.

### Responsive
Không đổi CSS; V14 đã phủ 12 viewport không tràn. V15 tái xác nhận qua regression V13/V14 (gồm kiểm tra tràn + focus 1 cột) — PASS.

### Performance (Core Web Vitals, lab headless, median 3)
| Chỉ số | Seed (4 mẫu) | 50 món |
|---|---|---|
| LCP | 384 ms | 408 ms |
| CLS | 0.0017 | 0.0017 |
| TBT | 0 ms | 29 ms |
| Long task dài nhất | 0 ms | ~80 ms |
| DOMContentLoaded / load | ~186 / ~216 ms | ~198 / ~254 ms |
| Render 50 món (P1) | — | < 400 ms, đủ 50 card |

Đây là số **lab localhost**; Core Web Vitals thực địa (real-user) chưa đo → §6. Không regression so với V14.

---

## 6. Gate còn lại / đã xác minh

**🔴 Blocker còn lại (1):**
1. **Google Login cho người dùng MỚI** — popup trả `redirect_uri_mismatch` (P1). Nguyên nhân + cách sửa: `production-blocker-oauth.md` và §10.

**Đã xác minh trong review này:**
2. **Dữ liệu sync thật** — app đọc danh sách từ máy chủ và ghi lên Firestore (admin read xác nhận document xuất hiện); dữ liệu **cách ly theo UID** (ID token Google thật: đọc dữ liệu của mình 200, đọc uid khác 403).
3. **Firestore Rules trên production** — rules deploy khớp tuyệt đối với `firestore.rules` repo; ẩn danh bị `403 PERMISSION_DENIED`.
4. **Production thật** — HTTPS + headers (HSTS/nosniff/Referrer-Policy); 46 CSS + `wishlist-cloud.js` 200; mọi đường dẫn nội bộ **404**; smoke browser 10/10.

**Chưa làm:**
5. **Thiết bị thật / mạng yếu** — perf trên điện thoại thật, background-tab throttling, 50+ sản phẩm trên máy yếu.

---

## 7. Khuyến nghị trước/sau khi chuyển 1.0 Stable

- **Trước cutover**: **sửa P1 OAuth** (thêm redirect URI `https://wishlist-787d2.web.app/__/auth/handler` trong Google Cloud Console, hoặc đổi `authDomain` về `firebaseapp.com`) → rồi đăng nhập Google thử trên 2 thiết bị; đối chiếu rules deploy (`firebase emulators:exec ...` nếu có Java — máy này không có, đã thay bằng kiểm chứng live ở §9.3); deploy lên preview channel rồi kiểm tra header/HTTPS.
- **Cân nhắc thêm** (không bắt buộc, cần test production trước khi bật): CSP tối thiểu (`default-src 'self'; script-src 'self' https://www.gstatic.com; img-src 'self' data: https:; connect-src 'self' https://*.googleapis.com https://*.firebaseio.com; frame-src https://wishlist-787d2.firebaseapp.com`), `X-Frame-Options`/`frame-ancestors`, siết shape dữ liệu trong Firestore rules.
- Dọn asset thừa `image/` (5 file không tham chiếu) và thư mục rỗng `worker/` khi thuận tiện.

---

## 8. Bằng chứng (`docs/qa/dream-vault-v15/`)

- `sprint-spec.md` — brief (commit `f7d4ca4`).
- `final-report.md` — báo cáo này.
- `release-runbook.md` — runbook 6 bước đóng 3 release gate + checklist phát hành `ui-v15.0.0`.
- `hosting-audit.json`, `hosting-manifest.json` — Workstream A.
- `firestore-rules-static.json` — phân tích rules tĩnh (đã được kiểm chứng live ở §9.3).
- `production-blocker-oauth.md` — P1 Google Login `redirect_uri_mismatch` + cách sửa. **ĐỌC TRƯỚC KHI PHÁT HÀNH.**
- `img/prod-firestore-rules.json`, `img/prod-rules-live.json` — rules deploy + kiểm chứng cách ly UID bằng token thật.
- `img/prod-login-detail.json` — chi tiết lỗi OAuth trên production (đã che email/uid).
- `img/prod-browser.json`, `img/prod-auth-probe.json`, `img/production-hosting-paths.json` — smoke/hosting production.
- `img/browser-qa.json` (15/15), `img/a11y.json`, `img/perf-vitals.json`, `img/render-50.json`, `img/static-headers.json`.
- `img/geom-with-main.json`, `img/geom-without-main.json` — bất biến hình học của `<main>`.
- `img/regression-v9.json` … `img/regression-v14.json` — 303/303.
- `img/v15-*.png`, `img/v15base-*.png` — before/after `<main>` (pixel-identical).
- `img/state-*.jpg` — empty / single / 50 món / mobile / quick-view / dialog / focus.

### Lệnh tái lập
```powershell
Set-Location "E:\Buying Checklist"
node scripts/build-hosting.mjs      # dựng dist/ allowlist
node scripts/check-hosting.mjs      # in hosting-audit.json (mong đợi 0 rò rỉ)
# server tĩnh: python -m http.server 8115 --bind 127.0.0.1  (từ repo root)
node <harness>/v15-check.js         # 15/15
node <harness>/v15-a11y.js
node <harness>/v15-perf.js
# regression: v9..v14-check.js (V11EQ=1 cho v9/v10)
```

---

## 9. Production Verification (sau khi deploy)

**URL**: `https://wishlist-787d2.web.app` (và `https://wishlist-787d2.firebaseapp.com`) — HTTP 200, HTTPS.

### 9.1 Hosting / allowlist trên production — VERIFIED
Mọi đường dẫn nội bộ trả **404**, chỉ runtime asset 200:

| Đường dẫn | Status |
|---|---|
| `/` · `/wishlist.html` | 200 |
| `/css/layout.css` · `/wishlist-cloud.js` | 200 |
| `/docs/qa/...final-report.md` · `/docs/design/...` | **404** |
| `/docs/qa/.../browser-qa.json` | **404** |
| `/firebase.json` · `/firestore.rules` · `/.firebaserc` · `/FIREBASE_SETUP.md` | **404** |
| `/scripts/build-hosting.mjs` | **404** |
| `/image/Macbook.jpg` (asset thừa) · `/worker/` | **404** |

→ Lỗ hổng `public: "."` đã được khắc phục **trên production thật**, không chỉ trên config.
Headers: `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`.
Bằng chứng: `img/production-hosting-paths.json`.

### 9.2 Smoke browser trên production — 10/10 PASS
HTTPS đúng origin · 46 stylesheet, 0 request 4xx nội bộ · `<main>` hiện diện, header ngoài main · render 7 món · **0 JS error** · CRUD local · export JSON hợp lệ · responsive 1440/375/320 không tràn · reduced-motion tắt animation · Firebase SDK (app/auth/firestore) nạp + nút đăng nhập.
Bằng chứng: `img/prod-browser.json`.

### 9.3 Firestore Rules production — VERIFIED
Đọc ruleset đã deploy qua Rules API:
`projects/wishlist-787d2/releases/cloud.firestore` → ruleset `dc7e9d94-445a-4ec9-b420-2b78ec93ee3f`.
**Nội dung khớp tuyệt đối** với `firestore.rules` trong repo.

**Kiểm chứng cách ly tài khoản bằng ID token Google thật** (GET Firestore REST, chỉ đọc):

| Truy vấn (có/không token) | Kết quả |
|---|---|
| Đọc `/users/{uid của mình}/items` (đã xác thực) | **200** |
| Đọc `/users/{uid khác}/items` (đã xác thực) | **403** |
| Đọc `/users/{uid khác}` parent doc | **403** |
| List `/users` (đã xác thực) | **403** |
| Đọc `/users/{uid}/items` (ẩn danh) | **403** |

Bằng chứng: `img/prod-firestore-rules.json`, `img/prod-rules-live.json`.

### 9.4 Google Auth — 🔴 đăng nhập MỚI HỎNG (P1)
SDK nạp từ `gstatic.com/firebasejs/10.14.1`; bấm "Đăng nhập" mở popup tới `/__/auth/handler`. Tuy nhiên popup Google trả:

> Access blocked: This app's request is invalid — **Error 400: redirect_uri_mismatch**

Redirect URI bị từ chối: `https://wishlist-787d2.web.app/__/auth/handler` (do `authDomain` = `wishlist-787d2.web.app` chưa được đăng ký trong OAuth client).
→ **Người dùng mới không thể đăng nhập.** Chi tiết + cách sửa: `production-blocker-oauth.md` và §10.

Trong khi đó, **sync với phiên đã đăng nhập cũ hoạt động**: app đọc danh sách từ máy chủ (`Đã nhận dữ liệu từ máy chủ`), và bản ghi thêm mới đã xuất hiện trên Firestore (xác nhận qua admin read rồi dọn sạch).
Bằng chứng: `img/prod-auth-probe.json`, `img/prod-login-detail.json`.

### 9.5 Tổng kết 6 bước
| Bước | Trạng thái |
|---|---|
| 0. Sao lưu | ⚠️ Chưa có bằng chứng (nên xác nhận trước thao tác tiếp theo) |
| 1. Firestore Rules (deployed + ẩn danh + chéo 2 tài khoản) | ✅ **VERIFIED** (token thật: của mình 200 / uid khác 403) |
| 2. Google Login/Sync | 🔴 **NO-GO** — sync OK, nhưng **đăng nhập mới hỏng** (`redirect_uri_mismatch`) |
| 3. Build `dist/` + audit | ✅ VERIFIED (local 48/0; production chỉ runtime asset) |
| 4. Deploy | ✅ Do chủ dự án thực hiện |
| 5. Smoke production | ✅ 10/10 PASS |
| 6. Tag `ui-v15.0.0` | ⛔ **HOLD** — chờ sửa P1 (§10) + phê duyệt GO |

---

## 10. P1 — Google Login `redirect_uri_mismatch` (blocker)

**Mức độ**: P1 — chặn phát hành 1.0 Stable.
**Nguyên nhân**: `wishlist-cloud.js` đặt `authDomain: "wishlist-787d2.web.app"` → Firebase Auth dùng
`https://wishlist-787d2.web.app/__/auth/handler` làm OAuth redirect URI, nhưng URI này **chưa được đăng ký**
trong Google OAuth 2.0 Client (auto-created) → Google từ chối.
**Vì sao khó thấy**: tài khoản đã đăng nhập trước đó vẫn sync bình thường; lỗi chỉ lộ khi **đăng nhập mới**.

**Cách sửa**
- **A (khuyến nghị, không cần deploy lại)**: Google Cloud Console → APIs & Services → Credentials → OAuth 2.0
  Client ID *(auto created by Google Service)* → Authorized redirect URIs → thêm
  `https://wishlist-787d2.web.app/__/auth/handler` → Save.
- **B (cần sửa code + deploy lại)**: đổi `authDomain` về `wishlist-787d2.firebaseapp.com` (handler mặc định
  đã được đăng ký sẵn).

**Xác minh sau khi sửa**: đăng xuất/ẩn danh → đăng nhập Google thành công; thêm món → có document trên Firestore;
đăng nhập trên thiết bị thứ hai → thấy món đó.

Chi tiết đầy đủ: `production-blocker-oauth.md`.

