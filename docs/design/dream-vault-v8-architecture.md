# Dream Vault V8 — Architecture (Immersive Product Experience)

> **Baseline:** `ui-v7.0.0` (`ce75465`) · **Branch:** `feature/immersive-product-v8`
> **Giai đoạn:** V8-A — Design & UX Architecture. Tài liệu này mô tả V8 sẽ **đi vào code ở đâu** dựa trên source thật, trước khi triển khai V8-B.
> Ngân sách $0 · Không thêm dependency · Không đổi dữ liệu/hậu trường.

---

## 1. Source audit — hiện trạng V7 (đọc tại tag `ui-v7.0.0`)

### 1.1 Dữ liệu sản phẩm

```js
// wishlist.html:760-773
STATUSES = wish | saving | ordered | purchased   // chip là nút bấm được (cycleStatus)
PRIORITIES = low | medium | high
// item = { id, name, price, category, status, priority, link, image, note, createdAt }
```

- `image`: URL http(s) **hoặc** `data:` (tối đa 12 ảnh upload, ≤1.5MB sau nén — `wishlist.html:776-779`).
- `link`: tùy chọn, qua `safeUrl()` (`:869`) — không hợp lệ thì ẩn nút "Mở nơi bán".
- Ảnh thiếu/lỗi → `PLACEHOLDER` SVG inline (`:789`) + `error` handler (`:1452`).

### 1.2 `card(it)` — cấu trúc thật (`wishlist.html:1428-1530`)

```
article.card.wishlist-card[data-id]            (+ .is-purchased)
└─ .wishlist-card__surface                     ← tilt target
   ├─ .thumb.product-media                     ← ảnh stage (aspect 4/3 thường)
   │  └─ .product-media__frame > img.product-media__image
   ├─ .card-body.product-card__content
   │  ├─ .badges (chip trạng thái [role=button] + chip ưu tiên)
   │  ├─ h3.product-card__title
   │  ├─ .price.product-card__price
   │  ├─ .cat / .note / .meta (nếu có)
   └─ .card-actions.product-card__actions
     ├─ a.buy "Mở nơi bán"  (nếu link hợp lệ)
     ├─ button.mini "Sửa"    → openForm(it)
     └─ button.mini.danger "Xóa" → removeItem(it.id)
+ setupCardTilt(el, surface)                   ← chỉ hover:fine, tắt khi reduced-motion
```

### 1.3 Render & dialog hiện có

| Thành phần | Vị trí | Hành vi |
| --- | --- | --- |
| `render()` | `:1062` | đổ `#grid`, toggle `#empty`, cập nhật `#sumTotal/#sumSpent/#sumCount`, entrance animation 1 lần |
| Featured card | CSS | `#grid > .wishlist-card:first-child:not(:only-child)` — V7 visual-overhaul đặt stage 1.24fr/0.76fr, min-height 560px, plaque "01 / THE FEATURED DREAM" |
| `openForm(item, draft)` | `:1637` | điền `#f*`, `$("dlg").showModal()`, focus `#fName`; `#btnCancel` → `dlg.close()` (`:1824`); Escape xử lý bởi native `<dialog>` |
| `#dlg` | `:577` | `<dialog class="product-dialog product-dialog--v3">`, max-width 740px — **form thêm/sửa, không phải Quick View** |
| CSS cascade | `:74-120` | 26+ stylesheet; V7 nằm cuối: `cinematic-v7-hero` → `gallery-lighting` → `workspace` → `visual-overhaul` → `cinematic-v7-mobile` |
| Body scope | `:123` | `<body class="dreamscape-v5">` — mọi rule V5–V7 (và V8) đều scoped theo class này |

### 1.4 Ràng buộc kỹ thuật thừa hưởng (KHÔNG sửa)

- Tilt: `setupCardTilt(el, surface)` — V8 **không** đổi cách gắn, không đổi transform của surface.
- Chip trạng thái là nút bấm được (`role="button"` + Enter/Space) — giữ nguyên.
- `body:has(dialog[open]) .mobile-dock { display: none }` (mobile-v3) — tự động áp dụng cho dialog mới.
- Firebase/Auth/Sync/CRUD/import-export: ngoài phạm vi.

---

## 2. UX architecture V8 — ba trải nghiệm

### 2.1 Gallery Exhibition (sửa tầng presentation của `#grid`)

- **Featured = "Object of Honour":** card đầu tiên (`:first-child:not(:only-child)` — đúng selector V7 đang dùng) thành stage lớn: ảnh `contain` trên nền radial lavender, plaque số hiệu "OBJECT 001", nhãn "CURATED WISH".
- **Regular = "Curated Objects":** 3 cột @1440 (4 cột @≥1680), mỗi card có số hiệu index (`OBJECT 002`…), museum-label typography (small caps giãn .24em), trạng thái dạng **ring tag** thay vì chip tròn.
- **Hành động mới:** mỗi card thêm đúng **một** nút `Xem chi tiết` (class mới `qv-trigger`, không đổi nút Sửa/Xóa/Mua cũ) → `openQuickView(id)`.
- Selector/ID hiện có (`#grid`, `.wishlist-card`, con bên trong) **giữ nguyên** để entrance animation, purchased celebration, tilt, filters không vỡ.

### 2.2 Quick View — dialog chỉ-đọc, mới hoàn toàn

```html
<dialog id="qv" class="quick-view quick-view--v8" aria-labelledby="qvTitle"> … </dialog>
```

- **Tách khỏi `#dlg`** — không tái sử dụng form, không có trường nhập, không `save()`.
- `openQuickView(id)`:
  1. `items.find(x => x.id === id)` — **đọc lại theo ID tại thời điểm mở** (dữ liệu luôn mới nhất; item bị xóa → đóng + toast).
  2. Điền nội dung (textContent — không `innerHTML` với dữ liệu người dùng).
  3. `qv.showModal()`; ghi nhớ `document.activeElement` làm **opener**.
- **Đóng:** nút `×` / Escape (native) / nút "Quay lại Gallery". Trả focus về opener (`close` event).
- **Không chồng modal:** nếu `#dlg` đang mở thì bỏ qua lệnh mở QV; trong QV, nút "Sửa món này" = `qv.close()` → `openForm(item)` (chỉ khi người dùng chủ động chọn Sửa).
- **Không ghi dữ liệu:** QV không đụng `save()`, không đổi `items`.
- Layout desktop 1280/1440/1920: stage ảnh **58–62%** / panel info **38–42%**; panel info cuộn riêng (`overflow-y: auto`) khi ghi chú dài — stage cố định.
- Mobile ≤640: một cột, sheet-ish (radius trên 28px, `max-height: 92dvh`, vùng an toàn `env(safe-area-inset-bottom)`).

### 2.3 Flow tương tác

```
Gallery ──[Xem chi tiết]──▶ Quick View ──[×/Esc/Quay lại]──▶ Gallery (focus về nút mở)
                                │
                                ├──[Mở nơi bán ↗]──▶ target=_blank rel=noopener (nếu có link)
                                └──[Sửa món này]──▶ close QV ──▶ openForm(item)  (dialog cũ)
```

---

## 3. Files V8-B sẽ thêm/sửa

| File | Thay đổi | Loại |
| --- | --- | --- |
| `wishlist.html` | thêm `<dialog id="qv">` (markup tĩnh, ~40 dòng) + `<link>` CSS V8; trong `card()`: thêm nút `Xem chi tiết` (additive, sau nút Sửa) + ~30 dòng JS (`openQuickView`, close/focus handler) | sửa **tối thiểu**, additive |
| `css/immersive-v8-gallery.css` | exhibition layout cho `#grid` (scoped `body.dreamscape-v5`), load **sau** `cinematic-v7-mobile.css` | mới |
| `css/immersive-v8-quick-view.css` | Quick View desktop + mobile, scoped `body.dreamscape-v5` | mới |

Không file nào trong V4–V7 bị sửa nội dung; V7 CSS giữ nguyên thứ tự và giá trị.

## 4. Trạng thái & edge cases (spec cho V8-B)

| Trạng thái | Xử lý |
| --- | --- |
| Không có ảnh / ảnh lỗi | Placeholder V7 (`PLACEHOLDER` + error handler) — stage lavender, không giả có ảnh |
| Không có link | Ẩn "Mở nơi bán"; trong QV hiện dòng chữ phụ "Chưa có liên kết mua" |
| Đã mua | Card: ring "ĐÃ MUA" + giảm tương phản; QV: badge "ĐÃ MUA", primary CTA chuyển về "Xem lại món" (không còn link mua vẫn OK) |
| Tên/giá dài | Title clamp 2 dòng ở card, wrap ở QV; giá luôn `fmtMoney()` |
| Ghi chú dài | Card: clamp 2 dòng; QV: cuộn panel info |
| Collection rỗng / 1 phần | Không có card đầu → không có featured/Quick View trigger; empty state V7 giữ nguyên |
| Đổi dữ liệu khi QV đang mở (CRUD từ nơi khác) | Mở lại theo ID là đọc mới nhất; item biến mất → close + toast |
| Reduced motion | Không transition mở/đóng QV; tilt đã tự tắt sẵn |
| Keyboard | Native focus trap của `<dialog>`; thứ tự Tab: `×` → CTA mua → Sửa → Quay lại |

## 5. Ngân sách & an toàn

- $0: font hệ thống (Georgia display + system sans), SVG line-art inline, token màu sẵn có của V5/V7.
- Không dependency mới, không tracking, không API mới, không field dữ liệu mới, không multi-image.
- Firebase/Auth/Sync/localStorage CRUD: **không đụng**.
- Tags V4–V7: **không sửa**. Tag `ui-v8.0.0`: **chỉ tạo sau V8-C**.
