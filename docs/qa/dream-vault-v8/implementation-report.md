# Dream Vault V8-B — Implementation Report

**Milestone:** V8-B "Full UI Implementation" — Immersive Product Experience ("The Private Exhibition")
**Branch:** `feature/immersive-product-v8`
**Implementation commit:** `dabb915738b066d0d7fd642c1c65b86af445f460` (`dabb915`)
**Base:** tag `ui-v7.0.0` (`ce75465`) — V7 đóng băng, không sửa trong V8-B
**Ngân sách:** $0 — system fonts, inline SVG hiện hữu, tokens V5/V7 tái dùng, không dependency mới
**Verdict: GO** — 101/101 kiểm thử trình duyệt PASS, 0 console error, perf parity với V7.
*(Chờ review UI thật của người dùng trước khi mở V8-C Release Gate; chưa tạo tag `ui-v8.0.0`.)*

---

## 1. Files thay đổi

| File | Trạng thái | Thay đổi |
|---|---|---|
| `wishlist.html` | sửa | **+219/−1** — thuần additive: 2 `<link>` CSS mới, `<dialog id="qv">` mới sau `#dlg`, nút `Xem chi tiết` (`.product-card__view`) + 2 phần tử trang trí (`.product-card__index`, `.product-card__plaque`) trong `card()`, `updateObjectIndices()` gọi sau mỗi `render()`, `openQuickView()/closeQuickView()/editFromQuickView()` + listener `close` trả focus, QV listeners trong `init()`. Dòng duy nhất bị thay: `body.append(badges, h3, price)` → `body.append(index, h3, price, badges)` (đảo thứ tự DOM cho khớp thứ tự nhìn thấy). |
| `css/immersive-v8-gallery.css` | **mới** | 780 dòng — Phase 1 Gallery Exhibition (scoped `body.dreamscape-v5`, nạp sau cùng). |
| `css/immersive-v8-quick-view.css` | **mới** | 567 dòng — Phase 2+3 Quick View desktop/tablet/mobile. |

**Bất biến V7 đã kiểm chứng:**
- `git diff ui-v7.0.0 -- css/` → chỉ 2 file mới; **0 file CSS V5/V6/V7 nào bị sửa**.
- `wishlist.html` chỉ có thay đổi additive của V8 (1 dòng đổi thứ tự append).
- Firebase/Auth/Cloud Sync/storage/CRUD/validation/import-export: **không chạm**.
- Không force-push; tag V4–V7 còn nguyên; **chưa tạo `ui-v8.0.0`**.

---

## 2. Gallery Exhibition (Phase 1 + 4 + 5)

- **Stage** `--ex-stage` (radial lavender + linear `#F3EEFF→#E3D8FC`), ảnh `object-fit: contain` + padding; featured desktop stage gradient riêng + **drop-shadow spot #1** (giới hạn toàn trang: chỉ 2 chỗ).
- **Nhãn `OBJECT 00X`**: 2 phần tử trang trí per card — plaque trên stage và dòng index đầu content; **cập nhật theo đúng thứ tự render hiện tại** (`updateObjectIndices()` chạy cuối `render()` → đúng sau Search/Filter/Sort). Plaque featured mang hậu tố `— CURATED WISH`.
- **Nút `Xem chi tiết`** (gradient `#7E66D6→#6850BC`, `flex: 1 1 110px`, cao ≥44px, `white-space: nowrap`) — lối vào QV duy nhất; **không** bind click trên surface (tránh xung đột với `role="button"` status chip và Tilt).
- **Title Georgia italic**, price tabular `--ex-ink`, status/priority còn chip nhưng mặc **vòng outline** (`border: 1.5px currentColor` + chấm tròn) — hành vi cycle và Purchased Celebration giữ nguyên.
- **Featured** `:first-child:not(:only-child)` desktop ≥1025: split 1.18fr/0.82fr, story panel, ghost number `01` (`.product-media__frame::after`), min-height 580. ≤1024 trả về nhịp thẻ thường (chặn trọn override featured của `cinematic-v7-mobile.css` bằng selector chain bằng specificity + nạp sau). 1 item → không featured (giữ guard V7), plaque chỉ `OBJECT 001`.
- **Wall text tile** `#grid:not(:empty)::after` — chỉ desktop ≥1025, `pointer-events: none`, tự ẩn khi grid rỗng.
- **Không transform trên `.wishlist-card__surface`** (Tilt sở hữu transform — xác nhận runtime: surface nhận `matrix3d` khi hover). Hover chỉ đổi viền/đổ bóng. Motion duy nhất: transitions theo `prefers-reduced-motion`, không animation vòng lặp.

**Quyết định R4 (1920):** giữ **3 cột ở mọi desktop** (không thêm 4 cột) — ưu tiên chất lượng ảnh + khả năng thao tác: @1920 card ≥300px, 4 nút 1 hàng không cắt chữ (test C1–C4 @1280/1440/1920 PASS).

---

## 3. Quick View (Phase 2 + 3 + 4)

- `<dialog id="qv">` **riêng** với `#dlg` — native `showModal()`, Escape native, backdrop blur.
- `openQuickView(id, opener)`: **đọc lại item mới nhất theo ID tại thời điểm mở**; guard `if ($("dlg").open) return` → không bao giờ chồng modal; ảnh fallback placeholder cùng luật `card()`; mọi chuỗi người dùng qua **`textContent`** (không `innerHTML` từ dữ liệu); link mua qua `safeUrl()` hiện hữu (`_blank` + `noopener`).
- **Edit bridge:** `editFromQuickView()` = `qvOpener = null` → `qv.close()` → `openForm(item)` — QV đóng trước, focus vào `fName`, focus **không** quay về nút Gallery khi form còn mở (R1 PASS kể cả sau khi `close` event fire).
- **Focus management:** opener giữ trong closure; listener `close` trả focus nếu `opener.isConnected` **và** `#dlg` không mở (R2 PASS — re-render khi QV đang mở không làm crash hay focus node cũ).
- **Layout:** desktop ≥1025 split **56/44** (≥1366: **58/42**), panel `overflow-y:auto`; 641–1024 sheet dọc max 680px; ≤640 bottom sheet bo 28px, `max-height:92dvh`, dính đáy, CTA sticky + `env(safe-area-inset-bottom)`; ≤380 siết padding CTA giữ 1 dòng; ≤740-height stage `16/9`. **Mobile Dock ẩn khi QV mở** (`body:has(#qv[open])`) và hiện lại khi đóng.
- **A11y:** nút × có `aria-label`, dialog `aria-labelledby`, focus ring `--ex-highlight` rõ, hint `ESC để đóng · TAB để di chuyển`. Native dialog trap xác minh: Tab/Shift+Tab **không bao giờ** focus được control nào phía sau (trang inert hoàn toàn; chuyển qua `body` rồi quay lại dialog là hành vi native — xem §6).

---

## 4. QA trình duyệt — 101/101 PASS

Suite: `v8b-check.js` (harness ngoài repo, Chrome thật + puppeteer-core). Kết quả đầy đủ:
`docs/qa/dream-vault-v8/browser-qa-results.json` · log: `browser-qa-log.txt`.

| Nhóm | Số test | Nội dung chính |
|---|---:|---|
| A — Quick View function | 16 | mở bằng nút thật, nội dung đủ 7 trường, nhãn OBJECT, link an toàn, `object-fit: contain`, Escape/×/Quay lạiGallery đóng + trả focus, ghi chú dài, không có link, ảnh hỏng fallback, nhẫn purchased, không mutate dữ liệu, không chồng modal, id không tồn tại/đã xóa an toàn |
| B — Card behaviors | 10 | status chip `role=button` cycle + **không mở QV**, Purchased Celebration (`is-purchase-celebrating` + `is-purchased`), Buy/Edit/Delete giữ nguyên, **Sort/Search/Filter đánh lại chỉ số theo thứ tự render (R3)**, dashboard sums `34.690.000/320.000/7 món`, **Tilt còn hoạt động (B7)**, re-render khi QV mở an toàn (R2), không mutate |
| R1 — QV→Edit | 3 | đóng trước → form mở → focus `fName`; sau close event vẫn trong form; sửa xong mở lại QV thấy dữ liệu **mới nhất theo ID** |
| C — Desktop layout ×1280/1440/1920 | 18 | 3 cột, card ≥300px, featured span 2 cột, nút không cắt/không thấp, title dài không tràn, QV split 56/58±0.04, QV trong viewport + panel scroll + bo góc |
| M — Mobile ×4 size (320×700, 375×667, 375×812, 430×932) | 41 | không tràn ngang, 1 cột, nút ≥44px, dock ẩn/mở đúng lúc, bottom sheet dính đáy ≤92dvh bo 28px, × 44px, CTA ≥48px không cắt chữ, panel cuộn note dài, **17G hotfix hero-clearance @375×667 giữ nguyên** |
| S — States | 3 | 1 item (không featured, QV mở được), 12 item @1920 (đủ `OBJECT 012`, không tràn, entrance xong), empty (không wall tile) |
| K — Keyboard/A11y/Motion | 7 | Enter mở QV→focus ×, Tab/Shift+Tab không focus được control phía sau, focus ring visible, Escape trả focus, chip cycle bằng Enter, không animation `infinite` trong QV/gallery |
| S7 — Reduced Motion | 1 | QV + backdrop `animation: none` khi `prefers-reduced-motion: reduce` |
| F — Global | 2 | grid entrance xong (không kẹt opacity 0), **console errors = 0 toàn suite** |

### Perf A/B (cùng `DS_V8`, cùng Chrome, trung vị 3 lần, `no-preference`)

| Viewport | Metric | **V8** | **V7** |
|---|---|---|---|
| mobile 375×812 | FPS idle/scroll | 60.4 / 60.2 | 60.7 / 59.9 |
| | max frame gap | 18.4 ms | 18.4 ms |
| | longtask / CLS | 0 ms / 0 | 0 ms / 0 |
| | idle lag | 3.38 ms | 3.34 ms |
| desktop 1440 | FPS idle/scroll | 59.5 / 60.0 | 60.5 / 59.9 |
| | max frame gap | 18.4 ms | 18.2 ms |
| | longtask / CLS | 0 ms / 0 | 0 ms / 0 |
| | idle lag | 3.37 ms | 3.35 ms |

→ **Parity**: V8 không đánh đổi hiệu năng so với V7. (`perf-ab-results.json`)

---

## 5. Bugs sản phẩm tìm thấy & đã sửa trong V8-B

Toàn bộ phát hiện trong quá trình QA hình ảnh/độ trễ (trước khi PASS):

1. **Nút `Xem chi tiết` mất gradient** — chính rule `.mini` trong cùng file thắng specificity (`1,6,1 > 1,3,1`) → sửa selector `.mini.product-card__view` (1,7,1).
2. **Nút Sửa/Xóa wrap 2 dòng** (`flex-shrink` + thiếu `nowrap`) → `white-space: nowrap` + `flex: 0 1 auto` + siết padding/basis.
3. **Featured có khoảng trống lớn** khi item không có note (`meta margin-top:auto` đẩy meta xuống đáy) → bỏ auto trong featured.
4. **Kicker `✦✦` nhân đôi** (HTML + CSS `::before` cùng thêm) → bỏ ký tự trong HTML.
5. **Plaque QV bị tĩnh** `"OBJECT STUDY"` → JS điền theo chỉ số render hiện tại.
6. **Title QV height = 0** — `display:-webkit-box` + line-clamp bị Chrome blockify → `flow-root` khi là flex item → đổi sang `display: block` không clamp (detail view được hiển thị full title — chấp nhận, đúng yêu cầu "không cắt nội dung").
7. **CTA wrap 2 dòng @320** → media ≤380 siết padding/font.

---

## 6. Bugs harness (test bug — không phải lỗi sản phẩm)

Ghi nhận trung thực để tránh đánh giá sai:

1. **B7 "Tilt fail" ban đầu** — card nằm dưới fold, `page.mouse.move` ra ngoài viewport → không có `pointermove`. **Sửa test**: `scrollIntoView` trước → Tilt **hoạt động bình thường** (surface nhận `matrix3d`).
2. **M5 "bottom sheet fail"** — đo rect ngay khi animation mở `translateY(48px)` còn chạy → lệch 48px. **Sửa test**: chờ 500ms sau mở.
3. **K2 "Tab thoát dialog"** — expectation sai: native dialog cho phép focus nhảy qua `body` (trang inert, không focus được control nào phía sau) rồi quay lại. **Chuẩn lại assertion**: quan trọng là không bao giờ focus được control phía sau → PASS.
4. **K3 crash `Unknown key: "Shift+Tab"`** — puppeteer cần `down('Shift')` + `press('Tab')` → sửa harness.
5. **M9 @430×932 fail** — viewport lớn note vừa khít không cần cuộn → assertion cứng `scrollTop>100` sai → chấp nhận `maxScroll===0`.
6. **Probe CSSOM** — `CSSStyleRule` cũng có property `cssRules` (rỗng, truthy) làm walk bỏ sót mọi style rule → `matched: []` giả. Sửa walk theo `selectorText`.

---

## 7. Evidence (`docs/qa/dream-vault-v8/img/`, JPEG q82)

| File | Nội dung |
|---|---|
| `gallery-desktop-1440-before/after.jpg` | So sánh Gallery V7 → V8 @1440 |
| `gallery-desktop-1280-after.jpg`, `gallery-desktop-1920-after.jpg` | V8 @1280/1920 |
| `gallery-mobile-375-before/after.jpg` | So sánh mobile 375 |
| `card-detail-zoom-1440.jpg`, `featured-detail-zoom-1440.jpg` | Zoom card thường / featured V8 |
| `quickview-desktop-1440.jpg` | QV desktop split 58/42 |
| `quickview-long-note-desktop.jpg`, `quickview-broken-image.jpg`, `quickview-purchased.jpg`, `quickview-no-link.jpg` | State QV |
| `quickview-mobile-375.jpg`, `quickview-mobile-375x667-short.jpg`, `quickview-mobile-320x700-short.jpg`, `quickview-mobile-long-scroll.jpg` | QV mobile sheet / viewport ngắn / cuộn note |
| `state-1item-before/after.jpg`, `state-empty-before/after.jpg` | 1 item & empty state |

---

## 8. Outstanding issues (báo cáo trung thực)

1. **Featured story thiếu note** → khoảng trắng giữa nhóm nội dung và actions (đã giảm bằng `justify-content: center`; item có note đầy đủ hơn).
2. **Title QV không clamp 3 dòng** (thay bằng hiển thị full) — hệ quả kỹ thuật của blockify Chrome; chấp nhận cho detail view.
3. **Tab vượt phần tử cuối của dialog** → focus qua `body`/browser chrome rồi quay lại — hành vi native của `<dialog>` modal (inert cả trang); **không** focus được control nào phía sau. Đã assert đúng chuẩn này.
4. **Ảnh stage card thường không drop-shadow** — tuân thủ guardrail "chỉ 2 drop-shadow" (featured stage + QV stage); khác nhẹ mockup tĩnh.
5. **Dataset test dùng SVG có nền panel** → ảnh trông như "tranh có khung"; ảnh sản phẩm thật (nền trong/trắng) sẽ nổi trên stage đúng như mockup.
6. **Wall text tile chỉ desktop** — mobile/tablet ẩn (decorative).
7. Deferred từ V7 (không đổi): thiết bị thật/touch thật, hậu thuẫn tab nền, 50+ sản phẩm, gộp nợ CSS V2–V5.

---

## 9. Bốn rủi ro đã chỉ định — kết quả

| # | Rủi ro | Kết quả |
|---|---|---|
| 1 | Đóng QV trước khi mở form sửa; focus không về Gallery khi form mở | **PASS** (R1 ×3 — kể cả sau `close` event) |
| 2 | Sau re-render không giữ node cũ (`isConnected`) | **PASS** (B8) |
| 3 | Chỉ số OBJECT theo thứ tự render, 1 item vẫn xem được nhưng không featured | **PASS** (B5/B5b/S1/S2) |
| 4 | 1920 không được nhồi nút/ảnh | **PASS** — giữ 3 cột, C1–C4 @1920 |

---

## 10. Tiếp theo

- Người dùng review UI thật (Gallery + QV) trên `feature/immersive-product-v8` → **V8-C Visual QA & Release Gate** → nếu PASS mới tạo tag `ui-v8.0.0`.
- Chưa push tag nào; tag V4–V7 bất biến.
