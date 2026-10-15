# Dream Vault V8 — Product Experience Design (The Private Exhibition)

> **Phase:** V8-A — Visual Specification · **Baseline:** `ui-v7.0.0`
> **Art direction:** Light Lavender × Premium Editorial × Cinematic Exhibition × Soft Glass
> **Ngân sách:** $0 · Font hệ thống · SVG inline · Token màu V5/V7 hiện có
> Mockups (đính kèm, xem §10): `docs/design/img/v8-concept/*.png` — dựng từ HTML prototype ngoài production.

---

## 1. Triết lý

V7 làm cho **trang** đẹp. V8 làm cho **sản phẩm** đẹp. Gallery không còn là "danh sách card" mà là một **phòng trưng bày riêng tư**: mỗi món đồ có số hiệu, sân khấu (stage) riêng, nhãn bảo tàng và một câu chuyện. Quick View là dịp duy nhất để kể câu chuyện đó đầy đủ — nên nó phải được thiết kế như một **trang tạp chí triển lãm**, không phải hộp thoại thông tin.

Giữ nguyên toàn bộ hành vi cũ (tilt, chip trạng thái cycle, CRUD, filters, dock, dialog form). V8 chỉ **thêm lớp trưng bày** bên ngoài surface và thêm **một dialog chỉ-đọc**.

## 2. Sample data dùng chung cho mọi mockup

| # | Tên | Giá | Trạng thái | Ưu tiên | Ảnh | Link |
| --- | --- | --- | --- | --- | --- | --- |
| 001 | Tai nghe không dây chống ồn chủ động thế hệ mới | 4.990.000 ₫ | Muốn mua | Cao | có (SVG stand-in) | có |
| 002 | Everyday essentials | 2.400.000 ₫ | Đang để dành | Trung bình | có | không |
| 003 | The dream camera | 12.500.000 ₫ | Đã đặt hàng | Cao | có | có |
| 004 | Sách thiết kế hệ thống | 320.000 ₫ | Đã mua | Thấp | **không** (placeholder) | không |

Mockup Gallery dùng đủ 4 món; mockup Quick View mở món **001** — để đối chiếu trực tiếp.

## 3. Tokens V8 (mở rộng, không thay token cũ)

| Token | Giá trị | Dùng cho |
| --- | --- | --- |
| `--ex-ink` | `#19152C` (`--dream-ink`) | tiêu đề, giá |
| `--ex-muted` | `#625979` | nhãn, meta |
| `--ex-accent` | `#6850BC` | plaque, số hiệu, CTA |
| `--ex-highlight` | `#A88BF7` | ✦, ring tag, focus ring |
| `--ex-stage` | `radial-gradient(ellipse 80% 55% at 50% 28%, rgba(168,139,247,.42), transparent 70%), linear-gradient(168deg,#F3EEFF,#E3D8FC)` | nền sân khấu ảnh (mượn từ featured V7) |
| `--ex-glass` | `rgba(255,255,255,.86)` + blur 12px | plaque, quick-view panel |
| `--ex-radius-card` | 28px · `--ex-radius-sheet` 32px · `--ex-radius-pill` 999px | đồng bộ V7 |
| `--ex-shadow-stage` | `0 40px 100px rgba(65,43,139,.16), inset 0 0 0 1px rgba(255,255,255,.85)` | featured + QV |
| `--ex-motion` | 260ms `cubic-bezier(.22,1,.36,1)` | mọi transition (0ms khi reduced-motion) |

Font: display = `Georgia, 'Times New Roman', serif` italic (đồng bộ hero V7); UI = system sans. Không tải font mới.

## 4. Gallery Exhibition — desktop (1280 / 1440 / 1920)

### 4.1 Khung lưới

| Width | Cột | Featured | Regular card |
| --- | --- | --- | --- |
| 1280 | 3 (grid 1fr×3, gap 26px) | span 2 cột, cao ≥540px | 1 cột, stage 4/5 |
| 1440 | 3 (gap 28px) | span 2, cao ≥580px | stage 4/5 |
| 1920 | 4 (gap 30px, container mở 1440px) | span 2, cao ≥620px | stage 4/5 |

Container: `--dream-container` 1280px → V8 gallery container 1440px @≥1680. Section spacing giữ nhịp V7.

### 4.2 Featured — "The Centrepiece" (`:first-child:not(:only-child)`)

- Surface chia 1.18fr (stage) / .82fr (story panel) — lệch so với V7 (1.24/.76) để panel rộng hơn cho "Xem chi tiết".
- Stage: nền `--ex-stage`, ảnh `object-fit: contain`, padding `clamp(28px, 3vw, 52px)`, `drop-shadow(0 26px 40px rgba(65,43,139,.28))` — ảnh là **vật thể trưng bày**, không cắt xén.
- Plaque stage (trang trí, `pointer-events: none`, không đè control): `OBJECT 001 — CURATED WISH` + số thứ tự mờ `01` cỡ 120px ở góc dưới trái.
- Story panel (trái → phải): kicker `✦ DRAFT OF A DREAM` → tiêu đề serif italic 2 dòng max → giá `2rem` tabular-nums → ring tag trạng thái + danh mục → excerpt ghi chú 2 dòng → **CTA nhóm**: `Xem chi tiết ↗` (primary tím), `Mở nơi bán` (secondary glass), `Sửa` / `Xóa` (ghost, nhỏ).
- Hover (chỉ `(hover:hover) and (pointer:fine)`): lift 6px + shadow lên `--ex-shadow-stage`; **không** đổi tilt.

### 4.3 Regular card — "Curated Object"

- Thứ tự trong surface: stage (4/5, contain, nền `--ex-stage` nhẹ 60% opacity) → **index line** `OBJECT 00X` (10px, .26em, accent) → tên (serif italic, clamp 2 dòng) → giá (tabular) → **ring tag** trạng thái (viền màu theo status, thay chip pill — đây là dấu hiệu "triển lãm" rõ nhất) → divider mảnh → actions.
- Actions: `Xem chi tiết ↗` chiếm 50% đầu (primary nhẹ), `Mua`/`Sửa`/`Xóa` thành 3 nút ghost 44px còn lại. Mọi nút cũ giữ aria-label.
- Card đã mua: stage grayscale 25%, ring "ĐÃ MUA" tím đậm, title opacity .75 — vẫn đọc được.
- Card placeholder ảnh: stage giữ gradient, SVG placeholder V7 căn giữa, nhãn `NO IMAGE — OBJECT 00X` ở plaque.

### 4.4 rhythm thị giác

Khoảng cách: plaque→index 14px, index→title 8px, title→price 10px, price→ring 12px, ring→divider 16px, divider→actions 14px. Divider: `1px solid rgba(104,80,188,.14)`.

## 5. Quick View — "The Object Study"

### 5.1 Khung desktop (priority 1440; hiệu lực 1280–1920)

- `<dialog id="qv">`, `max-width: 1160px`, `max-height: min(860px, 92dvh)`, radius 32px, shadow `--ex-shadow-stage` + viền `rgba(255,255,255,.9)`.
- Grid: **stage 58% / panel 42%** (@1280: 56/44). Backdrop: `rgba(25,21,44,.42)` + blur 8px (giữ nhịp backdrop V3).
- Stage: `--ex-stage`, ảnh `contain` max `min(56vh, 520px)`, plaque góc trên trái `OBJECT 00X — PRIVATE VIEW`, hàng chip trạng thái/ưu tiên dưới ảnh. Ảnh lỗi → placeholder V7 + nhãn.
- Panel (cuộn riêng `overflow-y:auto`, padding 44px 40px, nền glass trắng):
  1. Dòng đầu: `✦ MONG MUỐN` (ring tag) + nút `×` (44px, góc phải, label "Đóng hộp thoại chi tiết").
  2. Kicker `PRODUCT SHOWCASE` + tiêu đề serif italic `clamp(1.9rem, 2.6vw, 2.5rem)` (wrap, không clamp — đây là trang chi tiết duy nhất).
  3. Giá `2.1rem` font-weight 760, tabular-nums.
  4. Meta grid 2×2 (Danh mục / Ưu tiên / Trạng thái / Thêm ngày) — label 10px .2em muted, value 14px.
  5. Section `THE STORY BEHIND THIS WISH` — ghi chú đầy đủ (không clamp), line-height 1.75. Không có ghi chú → dòng placeholder "Chưa có ghi chú cho món này."
  6. CTA hierarchy: `Mở nơi bán ↗` (primary, full-width, 52px) → `Sửa món này` (secondary glass 48px) → `Quay lại Gallery` (ghost, 44px). Không link → primary đổi thành disabled-look + dòng `Chưa có liên kết mua`.

### 5.2 Mobile (≤640, plan đầy đủ cho V8-B)

- Sheet: radius 28px trên, `max-height: 92dvh`, slide-up 260ms (0ms reduced-motion).
- Một cột: stage 4/3 (contain) → panel padding 22px 20px + `padding-bottom: calc(20px + env(safe-area-inset-bottom))`.
- CTA dính đáy panel (sticky bottom bar glass) để姆 ngón cái 48px; `×` vẫn góc trên phải.

### 5.3 Bàn phím / a11y / motion

- Mở: `showModal()` (native focus trap), focus vào `×`. Đóng: `×`, Escape, "Quay lại Gallery" → **trả focus về nút card đã mở** (`close` event).
- Không chồng modal: lệnh mở QV bị bỏ qua nếu `#dlg` open; `Sửa món này` = close QV → `openForm(item)`.
- Chỉ đọc: không `save()`, không đổi `items`; mở theo ID → luôn dữ liệu mới nhất.
- Focus-visible: ring `2px solid var(--ex-highlight)` offset 3px trên mọi control.
- Reduced motion: mọi transition V8 = 0ms; không autoplay.

## 6. Bảng trạng thái ( Definition of Done cho V8-B )

| State | Gallery | Quick View |
| --- | --- | --- |
| Empty | Empty state V7 giữ nguyên | không mở được (không có trigger) |
| 1 item | không featured (only-child guard V7 giữ nguyên) | bình thường |
| Ảnh lỗi | placeholder + plaque NO IMAGE | placeholder + nhãn |
| Tên dài (120 ký tự) | clamp 2 dòng, không tràn | wrap đầy đủ |
| Ghi chú dài (500+ ký tự) | clamp 2 dòng | panel cuộn, stage đứng yên |
| Đã mua | grayscale nhẹ + ring ĐÃ MUA | badge ĐÃ MUA, ảnh vẫn màu |
| Không link | ẩn nút Mua | "Chưa có liên kết mua" |
| 12+ items | grid 4 cột @1920, entrance ≤12 giữ nguyên | — |

## 7. Performance guardrails

- Không `backdrop-filter` trên card grid (chỉ trên QV panel/plaque — 1 vùng nhỏ).
- Không `will-change` dư thừa; QV dùng transform/opacity để animate.
- Ảnh `loading="lazy"` giữ nguyên; QV ảnh preload khi mở (1 ảnh, data-URI sẵn sàng).
- Monitor `drop-shadow` (nợ V7 ghi nhận): chỉ 2 chỗ dùng (featured stage, QV stage).

## 8. Ranh giới an toàn (kiểm tra ở V8-C)

- Firebase/Auth/Sync/CRUD/localStorage: không file nào ngoài 2 CSS mới + `wishlist.html` (additive).
- Tags V4–V7 nguyên vẹn; Tilt/celebration/filters/dock: không sửa JS cũ.
- Desktop V7 khác biệt có chủ đích ở **Gallery** (theo yêu cầu V8); Hero/Dashboard/Collection không đổi.

## 9. Giao diện V7 → V8 (tóm tắt để so sánh ở V8-C)

| | V7 | V8 |
| --- | --- | --- |
| Featured | stage 1.24/.76, plaque "01 / THE FEATURED DREAM" | stage 1.18/.82 + story panel + CTA Xem chi tiết, plaque OBJECT 001 |
| Regular card | chip pill, actions ngang equal | index line + ring tag + CTA Xem chi tiết dẫn đầu |
| Chi tiết món | không có (note/meta kẹp trong card) | Quick View dialog riêng, chỉ-đọc, journal-style |
| Số hiệu | chỉ featured | mỗi món có số hiệu triển lãm |

## 10. Mockups đính kèm

| File | Nội dung |
| --- | --- |
| `docs/design/img/v8-concept/gallery-desktop-1440.png` | Exhibition gallery @1440, 4 món (featured 001 + 002/003/004) |
| `docs/design/img/v8-concept/product-detail-desktop-1440.png` | Quick View món 001 @1440 |
| `docs/design/img/v8-concept/product-detail-mobile-375.png` | Quick View món 001 @375 (mobile sheet) |

Nguồn prototype: `docs/design/v8-prototype/*.html` (HTML tĩnh ngoài production, dùng chung sample data §2).
