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
| Firebase Sync thật (login, đa thiết bị, xung đột) | **UNVERIFIED / HOLD** |
| Firestore Rules đã deploy trên production | **UNVERIFIED / HOLD** |
| Xác minh trên URL production thật / thiết bị thật | **UNVERIFIED / HOLD** |

**P0 = 0. P1 = 1 (đã sửa).** Không có lỗi P0/P1 tồn đọng trong phần xác minh được.

> GO cho toàn bộ hạng mục kiểm thử được ở client. **Chưa nên coi là 1.0 Stable production** cho tới khi chủ dự án đóng 3 mục UNVERIFIED ở §6 (cần Java cho emulator, tài khoản test, và một lần deploy thật).

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

### A4. Firestore Rules — **UNVERIFIED**
`firestore.rules` tĩnh: `allow read, write: if request.auth != null && request.auth.uid == userId;` cho `/users/{userId}/items/{itemId}` → đúng: bắt buộc đăng nhập, cách ly theo UID, default-deny cho mọi path khác. **Chưa** xác minh được:
- Rules **đã deploy** có khớp source không (không truy cập production).
- Hành vi thực tế (không có tài khoản test; không có JVM để chạy emulator).

Đã cung cấp sẵn `scripts/test-firestore-rules.mjs` + hướng dẫn để owner tự chạy. Phân tích: `firestore-rules-static.json`.

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

## 6. UNVERIFIED / HOLD (chính xác phần còn thiếu)

1. **Firebase Sync thật** — login Google, logout, đồng bộ đa thiết bị, xử lý xung đột/offline. *Thiếu*: tài khoản test được phép + môi trường có mạng tới Firebase. *(Code: nút Sync, `wishlist-cloud.js`, persistence `browserSession/Local` đã review tĩnh; chưa chạy end-to-end.)*
2. **Firestore Rules đã deploy** — *thiếu*: JVM để chạy emulator (máy kiểm thử không có Java) + quyền đọc/đối chiếu rules production. Kịch bản đã sẵn (`scripts/test-firestore-rules.mjs`).
3. **Production thật** — URL thật, HTTPS, headers thực tế, deploy `--only hosting` sau khi build. *Thiếu*: quyền deploy + `firebase login` (sprint này **không** deploy theo yêu cầu).
4. **Thiết bị thật / mạng yếu** — perf trên điện thoại thật, background-tab throttling, 50+ sản phẩm trên máy yếu.

---

## 7. Khuyến nghị trước/sau khi chuyển 1.0 Stable

- **Trước cutover**: chạy `firebase emulators:exec --only firestore --project wishlist-787d2 "node scripts/test-firestore-rules.mjs"` (cần Java) → đối chiếu rules deploy; đăng nhập Google thử trên 2 thiết bị; deploy lên preview channel rồi kiểm tra header/HTTPS.
- **Cân nhắc thêm** (không bắt buộc, cần test production trước khi bật): CSP tối thiểu (`default-src 'self'; script-src 'self' https://www.gstatic.com; img-src 'self' data: https:; connect-src 'self' https://*.googleapis.com https://*.firebaseio.com; frame-src https://wishlist-787d2.firebaseapp.com`), `X-Frame-Options`/`frame-ancestors`, siết shape dữ liệu trong Firestore rules.
- Dọn asset thừa `image/` (5 file không tham chiếu) và thư mục rỗng `worker/` khi thuận tiện.

---

## 8. Bằng chứng (`docs/qa/dream-vault-v15/`)

- `sprint-spec.md` — brief (commit `f7d4ca4`).
- `final-report.md` — báo cáo này.
- `release-runbook.md` — runbook 6 bước đóng 3 release gate + checklist phát hành `ui-v15.0.0`.
- `hosting-audit.json`, `hosting-manifest.json` — Workstream A.
- `firestore-rules-static.json` — phân tích rules + phần UNVERIFIED.
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
