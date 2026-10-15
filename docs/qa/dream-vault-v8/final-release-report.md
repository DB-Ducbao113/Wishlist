# Dream Vault V8-C — Final Visual QA & Release Report

**Milestone:** V8-C "Final Visual QA & Release Gate"
**Repo:** `DB-Ducbao113/Wishlist` · **Branch:** `feature/immersive-product-v8`
**Baseline:** tag `ui-v7.0.0` (`ce75465`)
**Ngân sách:** $0 — không dependency mới, không asset trả phí, system fonts
**QA suite:** 122/122 PASS · 0 console error · Perf parity vs V7 (headless)

> **RECOMMENDATION: GO** — với 2 điều kiện: (1) người dùng xem lại UI thật
> trên 2 URL review trước khi tạo tag; (2) các mục Outstanding bên dưới được
> chấp nhận như đã nêu. Chi tiết ở §8.

---

## 1. Commit SHA

| Vai trò | SHA | Ghi chú |
|---|---|---|
| **V8-C implementation (code fix + evidence)** | **`24fdb8da78a7e31cda1a333822a9e4cabf362930`** (`24fdb8d`) | 2 fix CSS + 29 ảnh JPEG + 2 JSON QA/perf |
| **V8-C report (commit này)** | **`cf518b55d5f91df6f263a0a5b74920d9963ef14e`** (`cf518b5`) | `final-release-report.md` |
| V8-B implementation (trước đó) | `dabb915` | gallery + quick view |
| V8-B QA docs | `329cc51` | implementation-report |
| V8-A design | `70dbe06` | mockup + prototype |
| V7 frozen (baseline) | `ce75465` | tag `ui-v7.0.0` |

**Tag `ui-v8.0.0`: CHƯA TẠO** — chờ người dùng chốt sau khi đọc report này.

---

## 2. Source diff summary (so với `ui-v7.0.0`)

```
git diff ui-v7.0.0 --stat
 css/immersive-v8-gallery.css      | 780 ++++ (mới, V8-B)
 css/immersive-v8-quick-view.css   | 609 ++++ (mới, V8-B + 44 dòng fix V8-C)
 wishlist.html                     | 220 ++++ (additive, V8-B)
 docs/design/* (V8-A)              | ~800 dòng + 6 file mockup/prototype
 docs/qa/dream-vault-v8/*          | reports + 50 ảnh + 4 JSON
```

**Bất biến đã kiểm chứng lại trong V8-C:**

| Kiểm tra | Kết quả |
|---|---|
| `git diff ui-v7.0.0 -- wishlist.html` dòng bị xóa | **đúng 1 dòng**: `body.append(badges, h3, price)` → `body.append(index, h3, price, badges)` |
| Diff added chứa firebase/auth/fetch/localStorage/indexedDB/CRUD keyword | **0 match** |
| `git diff ui-v7.0.0 -- css/` file V7 bị sửa | **0 file** — chỉ 2 file CSS mới |
| Tag `ui-v2.0.0` … `ui-v7.0.0` | còn nguyên (7 tag) |
| Force-push | **không** — mọi commit push thường |
| Dependency mới / package.json | **không có** |
| Thay đổi duy nhất trong V8-C | `css/immersive-v8-quick-view.css` (+41/−3) — 2 fix §3 |

---

## 3. Visual review findings — 2 defect thật, đã sửa

Toàn bộ tìm thấy bằng **nhìn ảnh chụp thật** (matrix 29 ảnh × 5 viewport
desktop/tablet/mobile + zoom state), không suy đoán từ CSS computed:

### DEFECT 1 — Nút đóng Quick View biến mất khi panel cuộn (Severity: HIGH)

- **Mức độ:** ảnh hưởng **cả desktop lẫn mobile** khi ghi chú dài làm panel
  tràn (`scrollHeight 1067 > clientH 860`).
- **Bằng chứng trước fix:** desktop đo `closeTop: -136px` (ra khỏi viewport,
  không còn nút đóng nào thấy được — chỉ Escape); mobile 375 ảnh
  `v8c-quickview-mobile-scrolled-BEFORE-fix.jpg` → kicker + × trôi mất.
- **Root cause:** `.quick-view__top` (chứa nút ×) là child đầu của scroller,
  cuộn theo nội dung; không có vị trí sticky.
- **Fix:** `.quick-view__top` → `position: sticky; top: 0` + full-bleed
  (`margin` âm theo đúng padding panel ở 3 breakpoint: base/desktop/short)
  + nền `rgba(255,255,255,.88)` + `backdrop-filter: blur(10px)`.
- **Sau fix (đo bằng automation):** `closeTop: 131` cố định, hit-test trả
  đúng `#qvClose` (bấm được), mobile `inViewport: true` khi scroll 300px.

### DEFECT 2 — Chữ nội dung lòi xuyên khối CTA mobile (Severity: MEDIUM)

- **Mức độ:** @320×568 và mọi mobile khi content tràn — meta/story text hiện
  xuyên qua nền CTA dính đáy; thấy rõ "TRẠNG THÁI/THÊM NGÀY" lộ dưới hàng
  nút, heading "THE STORY BEHIND THIS WISH" bị che mờ.
- **Bằng chứng trước fix:** `v8c-quickview-320x568-BEFORE-fix.jpg`.
- **Root cause:** CTA mobile dùng gradient `rgba(255,255,255,0) → .94`
  (đầu trong suốt); panel còn `padding-bottom: 20px` tạo dải trống dưới CTA
  nơi chữ lòi ra.
- **Fix:** (a) nền CTA base đổi `#fff` đục + `border-top` phân tách;
  (b) mobile gradient `.97 → #fff`; (c) `panel padding-bottom: 0` dồn vào
  `cta padding-bottom` — CTA chạm đáy sheet, hết dải lòi chữ.
- **Sau fix (đo):** alpha `.97 ≥ .9`, `cta.bottom == panel.bottom`, quét
  `elementFromPoint` dưới CTA → **0 node text**.

### Các điểm review đạt (không phải defect)

| Hạng mục | Kết luận bằng ảnh |
|---|---|
| **Hierarchy nút actions** (lo ngại của user) | **Đạt.** "Xem chi tiết" gradient tím đặc chiếm ưu thế tuyệt đối; "Mở nơi bán" ghost viền tím (medium); Sửa/Xóa ghost neutral nhạt. Buy/Edit/Delete **không cạnh tranh** với View Detail. |
| **Featured wrap 2 dòng nút** (4 nút khi có link) | **Đúng mockup V8-A** — mockup `gallery-desktop-1440.html` cũng wrap `Xem/Mở nơi bán` / `Sửa/Xóa`. Không phải defect. |
| **OBJECT 00X có 2 nơi** (plaque stage + index content) | **Đúng mockup** — mockup regular card có plaque `Object 002` trên ảnh (line 172) VÀ index `Object 002` trong body (line 180). Featured: plaque `…— Curated wish` ≠ index `Object 001` → không lặp nguyên văn (assert V4a/V4b PASS). |
| **Featured thiếu note → khoảng trắng** (lo ngại của user) | `justify-content: center` + meta không còn `margin-top:auto` → nhóm nội dung lơ lửng giữa, khoảng trắng **phân bố đều 2 bên** (ảnh `v8c-zoom-featured-no-note.jpg`). Với note đầy đủ story lấp kín (`…-with-note.jpg`). **Chấp nhận được.** |
| **Ảnh vuông / có nền / placeholder trong Product Stage** (lo ngại) | Square SVG có nền → hiện như "tranh có khung", hài hòa với stage lavender. Placeholder xám `? Chưa có ảnh` có viền frame → trung tính, không vỡ tông. Broken-image → fallback cùng placeholder, đồng nhất. **Đạt** (xem 3 ảnh zoom). |
| **QV điện thoại thấp 320×568** (lo ngại) | Stage `16/9`, title 3 dòng + CTA vừa khít, **nút × luôn thấy** (sticky), CTA đục, hành động ≥52px. **Đạt.** |
| **Hierarchy featured vs regular** | Featured: stage 1.18fr + story panel + ghost `01` + drop-shadow; regular: uniform card. Tách bạch rõ. |
| **Tablet 768/1024** (V8-B suite chưa cover — V8-C bổ sung) | 2 cột, 0 card cắt nút, dock ẩn, QV sheet dọc 680px vừa viewport. **Đạt.** |

---

## 4. Screenshots before/after

`docs/qa/dream-vault-v8/img/` (JPEG q82, 29 file V8-C):

**So sánh V7 → V8 (cùng viewport, cùng dataset):**

| Trước (V7) | Sau (V8) |
|---|---|
| `v8c-gallery-desktop-1280-before.jpg` | `v8c-gallery-desktop-1280-after.jpg` |
| `v8c-gallery-desktop-1920-before.jpg` | `v8c-gallery-desktop-1920-after.jpg` |
| `v8c-gallery-tablet-768-before.jpg` | `v8c-gallery-tablet-768.jpg` |
| `v8c-gallery-mobile-320-before.jpg` | `v8c-gallery-mobile-320.jpg` |

*(baseline 1440/375 đã có ở V8-B: `gallery-desktop-1440-before/after.jpg`, `gallery-mobile-375-before/after.jpg`)*

**Before/After 2 defect V8-C:**

| Trước khi fix | Sau khi fix |
|---|---|
| `v8c-quickview-desktop-long-scroll-BEFORE-fix.jpg` (× biến mất) | `v8c-quickview-desktop-long-scroll-sticky-close.jpg` (× sticky) |
| `v8c-quickview-mobile-scrolled-BEFORE-fix.jpg` (kicker + × trôi mất) | `v8c-quickview-mobile-scrolled-after-fix.jpg` |
| `v8c-quickview-320x568-BEFORE-fix.jpg` (chữ lòi qua CTA) | `v8c-quickview-320x568-after-fix.jpg` |

**State / viewport khác:** `v8c-zoom-featured-no-note|with-note.jpg`,
`v8c-zoom-card-regular|placeholder|broken-image|long-title.jpg`,
`v8c-gallery-featured-with-note.jpg`, `v8c-gallery-tablet-1024.jpg`,
`v8c-gallery-mobile-430.jpg`, `v8c-quickview-desktop-1280|1920.jpg`,
`v8c-quickview-tablet-768.jpg`, `v8c-quickview-purchased-placeholder.jpg`,
`v8c-quickview-mobile-long-title.jpg`.

---

## 5. Functional QA — 122/122 PASS

Suite `v8c-check.js` = 101 check V8-B **còn nguyên** + 21 check mới:

| Nhóm | Test | Nội dung |
|---|---:|---|
| A/B/R1/C/M/S/K/S7/F (V8-B kế thừa) | 101 | QV function, card behavior, QV→Edit, desktop ×3, mobile ×4, states, keyboard, reduced-motion, console=0 — **không regression** |
| **T — Tablet (mới)** | 8 | 768 & 1024: 0 tràn ngang, 0 card cắt nút, dock ẩn, QV vừa viewport |
| **V1 — Sticky close (mới)** | 4 | Desktop note dài: panel tràn >0, × vẫn `inViewport` + hit-test đúng; mobile scrolled × vẫn thấy |
| **V2 — CTA opaque (mới)** | 3 | position sticky, alpha ≥.9, CTA chạm đáy panel + 0 text lòi dưới |
| **V3 — Add-item (mới)** | 4 | Mở form Thêm → submit → card mới **đầu grid** (newest-first), index `OBJECT 001` unique, form đóng; dọn QA xóa về 7 |
| **V4 — Mockup conformance (mới)** | 2 | plaque stage ≠ index story (không lặp nguyên văn); cả 2 đều visible |

Kết quả JSON: `docs/qa/dream-vault-v8/v8c-browser-qa-results.json`.

**Test bug ghi nhận (không phải lỗi sản phẩm):**
1. `V3a` lần 1 fail — đo `dlg.open` *sau* khi dispatch submit
   (`method=dialog` tự đóng) → sửa đo trước submit.
2. `V3b` lần 1 fail — assertion tìm item mới ở **cuối** grid; app newest-first
   → item mới ở **đầu** → sửa test.
3. `F2` 1 lần `ERR_CONNECTION_REFUSED` — transient (server vẫn 200 khi kiểm
   lại), lần chạy sau PASS.
4. Mobile before-fix probe báo `inViewport:true` dù ảnh cho thấy × biến mất —
   race: đo rect trước khi scroll settle. **Ảnh chụp là bằng chứng quyết định.**

---

## 6. Performance — parity vs V7 (headless Chrome, median of 3, cùng dataset)

| Hạng目 | Metric | V8 | V7 |
|---|---|---|---|
| **A/B** mobile 375×812 | FPS idle/scroll | 61.2 / 60.0 | 60.4 / 60.2 |
| | maxGap / longtask / CLS | 18.2ms / 0 / 0 | 19.3ms / 0 / 0 |
| **A/B** desktop 1440 | FPS idle/scroll | 60.2 / 59.6 | 59.7 / 60.0 |
| | maxGap / longtask / CLS | 18.0ms / 0 / 0 | 18.7ms / 0 / 0 |
| **Gallery 1 item** (m) | scroll FPS / maxGap | 60.3 / 18.7 | 60.0 / 18.4 |
| **Gallery 12 items** (m) | scroll FPS / maxGap | 60.0 / 32.6 ⚠ | 60.0 / 19.0 |
| **Gallery 50 items** (m) | scroll FPS / maxGap | 60.0 / 17.5 | 59.8 / 20.0 |
| **CPU throttle 4x** (m) | FPS idle/scroll / maxGap | 60.7 / 59.9 / 25.2 | 60.4 / 59.9 / 28.8 |
| **Reduced Motion** (m, V8) | FPS idle/scroll / CLS | 61.1 / 60.0 / 0 | — |
| **QV open/close** (V8) | median | open **31.4ms**, close **33.4ms**, max frame gap khi mở 17ms | V7 không có QV |

- ⚠ **12 items V8 maxGap 32.6ms** cao hơn V7 (19.0) — **0 longtask, 0 CLS,
  FPS vẫn 60**; là 1 frame gap đơn lẻ trong 1 lần đo, không lặp ở 1/50 items.
  **Theo dõi, không chặn release.**
- `lastCardAppearMs ≈ 0` ở mọi cỡ gallery (render không bottleneck).
- **Disclaimer bắt buộc:** mọi số liệu này từ **headless Chrome trên 1 máy**.
  **Không đại diện** cho thiết bị thật/touch thật — perf trên tay máy người
  dùng vẫn cần đo riêng (giữ deferred từ V7).
- JSON: `docs/qa/dream-vault-v8/v8c-perf-results.json`.

---

## 7. Safety & Release checklist

| Yêu cầu | Kết quả |
|---|---|
| Không Firebase/Auth/Sync/CRUD/schema change | ✅ diff 0 match persistence keyword (§2) |
| Không lib trả phí / service mới | ✅ 0 dependency |
| Giữ tag V4–V7 | ✅ 7 tag còn nguyên |
| Source change trên V8 branch | ✅ `feature/immersive-product-v8` |
| Chưa tạo tag V8 | ✅ `ui-v8.0.0` **chưa tồn tại** |
| Không force-push | ✅ |
| V7 CSS bất biến | ✅ 0 file V7 sửa |

---

## 8. Outstanding issues theo mức độ

**Không có blocker.**

| Mức | Issue | Quyết định |
|---|---|---|
| **LOW (chấp nhận)** | Dải 20px dưới sticky top bar desktop thấy 1 dòng price khi scroll (content trôi sau bar blur) — hành vi scroll container bình thường | Chấp nhận |
| **LOW (chấp nhận)** | 12-item maxGap 32.6ms (1 sample, 0 longtask) | Theo dõi ở release tiếp |
| **LOW (theo dõi)** | Chưa đo tay-kept: thiết bị thật, phím thật, CPU thật, 50+ items trên máy yếu | Deferred từ V7, giữ nguyên |
| **INFO** | Title QV không clamp (hiển thị full) — chủ đích cho detail view | Giữ (V8-B đã ghi) |
| **INFO** | Regular-card art không drop-shadow — tuân thủ guardrail "2 spot" | Giữ |
| **INFO** | Dataset test SVG có nền → look "tranh có khung"; ảnh thật sẽ nổi đúng | Không phải code |

**Không thêm animation/trang trí mới trong V8-C** — đúng chỉ đạo của user:
chỉ sửa defect làm giảm chất lượng giao diện.

---

## 9. Quyết định

| Milestone | Trạng thái |
|---|---|
| V8-A Design | PASS (đã chốt) |
| V8-B Implementation | SOURCE PASS (đã chốt) |
| **V8-C Final Visual QA** | **GO** — 122/122, 2 defect tìm thấy bằng ảnh thật & đã sửa, perf parity, safety toàn vẹn |
| Tag `ui-v8.0.0` | **CHỜ NGƯỜI DÙNG CHẤP SAU ĐỌC REPORT NÀY** |

**RECOMMENDATION: GO.**

Lý do (ưu tiên chất lượng thị giác + khả năng dùng, không chỉ số test):
1. Gallery và Quick View **khác biệt thực chất** so với V7 (featured hero,
   plaque/object system, editorial typography, QV split/sheet) — xác nhận lại
   bằng before/after cùng viewport.
2. 2 defect giảm chất lượng thật (mất nút đóng khi cuộn, chữ lòi qua CTA)
   đã tìm thấy bằng **screenshot inspection** và sửa có bằng chứng
   before/after.
3. Không regression ở 101 check V8-B; tablet (khu V8-B bỏ sót) giờ cover.
4. Perf parity toàn diện kể cả 50 items và CPU 4x.
5. Toàn vẹn V7: 0 file V7 sửa, 1 dòng HTML đổi, tag cũ nguyên.

**URL review:**
- V8: `http://127.0.0.1:8115/wishlist.html`
- V7 baseline: `http://127.0.0.1:8116/wishlist.html`
