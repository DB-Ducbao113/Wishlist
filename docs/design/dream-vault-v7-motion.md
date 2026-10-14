# Dream Vault V7 — Motion Design Specification

**Giai đoạn:** 17A–17B — Motion Art Direction, Baseline & Cinematic Hero Motion
**Ngày:** 14/10/2026
**Nhánh:** `feature/cinematic-motion-v7` (cắt từ tag `ui-v6.0.0`)
**Trạng thái:** 17A PASS (source) · 17B code `hero--v7` + `cinematic-v7-hero.css` đã implement & QA desktop · chờ review 17B
**Triết lý:** Dream Vault trở thành showroom desktop có chiều sâu và tương tác tinh tế — **không** phải website có thật nhiều animation.

---

## 1. Quy tắc bảo vệ hiệu năng (bắt buộc toàn V7)

1. Không thêm Three.js, GSAP hay animation library mới.
2. Không thêm hiệu ứng theo dõi con trỏ trên toàn bộ trang.
3. Không animate `filter: blur()` liên tục trên nhiều đối tượng.
4. Không ghi đè `transform` của Product Card Tilt.
5. Không cho hàng chục sản phẩm chạy animation đồng thời.
6. Không dùng chuyển động trang trí khi người dùng bật Reduced Motion.
7. Không thêm Firebase reads/writes hoặc thay đổi state/persistence.

Với animation theo scroll: chỉ triển khai sau khi có baseline và phải đảm bảo phần tử **vẫn hiển thị nếu hiệu ứng không chạy** (opacity/transform chỉ là trang trí thêm, không phải điều kiện hiện hữu).

Nếu ambient animation làm tăng tải CPU/GPU hoặc gây mất tập trung → **ưu tiên loại bỏ** thay vì cố giữ.

## 2. Cơ chế hiện tại — PHẢI GIỮ NGUYÊN, KHÔNG XÂY LẠI

### 2.1 Tilt (Product Card)

- **JS** (`wishlist.html`, ~dòng 1200–1380): loop `requestAnimationFrame` với damping hàm mũ:
  - `DAMPING = 8` (higher = faster response), giới hạn `MAX_X = 5deg`, `MAX_Y = 7deg`.
  - Ghi biến inline `--rotate-x` / `--rotate-y` lên `.wishlist-card__surface`.
  - Listeners: `pointermove` (tính target) + `pointerleave` (reset về 0).
- **Gate an toàn** (`canAnimate()`): `pointer: fine` khớp, `prefers-reduced-motion` **không** khớp, trang không `document.hidden`, card còn `isConnected`.
- **Phân chia trách nhiệm** (comment trong `grid-entrance.css`): card ngoài (`.wishlist-card`) sở hữu entrance opacity/translate — inner surface sở hữu 3D rotation. V7 không đổi phân chia này.
- **CSS V6** không đặt `transform` nào trên `.wishlist-card__surface` (V6 chỉ dùng border/shadow/lighting). V7 duy trì nguyên tắc: mọi hiệu ứng mới của card phải dùng `border-color`, `box-shadow`, `opacity` hoặc custom property — **không** đụng `transform` mà Tilt/JS đang sở hữu.

### 2.2 Purchased Celebration

- `purchased-motion.css`: sau khi **local save thành công**, JS thêm class `.is-purchase-celebrating` → `.thumb::after` chạy `animation: purchase-glow 550ms ease-out both` (one-shot, radial-gradient opacity 0→1→…).
- Trạng thái mua bền vững: `.is-purchased .wishlist-card__surface { border-color }`, thumb nền gradient — các class này là presentation, V7 chỉ được mở rộng chứ không thay đổi trigger.

### 2.3 Các cơ chế motion khác đang có

| File | Cơ chế | Ghi chú |
| --- | --- | --- |
| `css/motion.css` | `.motion-button` transition + `:hover` / `:active`; reduced-motion → `transition: none` | Nền tảng phản hồi nút — V7 kế thừa duration, chỉ tinh chỉnh trong scope V7 nếu cần |
| `css/hero.css` | `hero-enter 650ms/750ms` one-shot khi tải; reduce → `animation: none` | Entrance hero kiểu cũ (V1–V4), vẫn chạy trước CSS V6/V7 |
| `css/grid-entrance.css` | Card ngoài: entrance opacity/translate; reduce → `opacity:1, translate:none` | Bảo đảm card luôn hiển thị dù effect không chạy |
| `css/purchased-motion.css` | Celebration 550ms one-shot | Xem mục 2.2 |

## 3. Motion Specification (mục tiêu thiết kế — CHƯA PHẢI SỐ ĐO)

| Thành phần | Motion | Duration mục tiêu |
| --- | --- | --- |
| Hero glass objects | Floating rất nhẹ | 6–9 giây/chu kỳ |
| Hero light | Ánh sáng dịch chuyển chậm | 8–12 giây/chu kỳ |
| CTA | Hover lift và shadow | 160–220ms |
| Featured Card | Lighting reaction | 180–260ms |
| Regular Card | Giữ Tilt V6 | Không thay |
| Dashboard | Hover elevation | 180–260ms |
| Collection | Focus illumination | 160–220ms |
| Section reveal | Nhẹ, chỉ khi có điều kiện phù hợp | 300–500ms |

Nguyên tắc chọn duration: bước nhảy theo bội số của ~20ms (120/160/200/240/260ms…), easing ưu tiên `cubic-bezier(0.22, 1, 0.36, 1)` (ease-out nhanh – chậm) cho phản hồi, `ease-in-out` cho ambient.

## 4. Cinematic Hero Motion — thiết kế theo breakpoint

Đối tượng: `section.hero.hero--v5.hero--v6` (class V7 sẽ thêm khi làm 17B) với scene hiện có:
`.hero-scene__glow`, `.hero-scene__card--back`, `--middle`, `--front`, `.hero-scene__sparkle`, `.hero-scene__product`.

**Chiều sâu bằng ánh sáng, không Three.js:**

1. **Floating nhẹ** cho 3 glass card: `translateY` biên độ nhỏ (≤ 6px) + xoay ≤ 0.6°, chu kỳ 6–9s, **stagger** (back 0s, middle −2.5s, front −5s) để tạo nhịp parallax giả lập — chỉ `transform`/`opacity`, compositor-friendly.
2. **Light sweep** trên `.hero-scene__glow`: dịch chuyển `background-position` hoặc `translate` gradient rất chậm, chu kỳ 8–12s. **Không** animate `filter: blur()`.
3. **Phân cấp nội dung:** animation chỉ ở layer trang trí (`.hero__visual`, `aria-hidden="true"`); text/CTA (`hero__content`) đứng yên — entrance theo `hero-enter` cũ, không thêm movement mới vào chữ.
4. **Breakpoint:**
   - **1280px:** scene hẹp — giảm biên độ float ~25% (≤ 4px), glow chỉ dịch chuyển dọc.
   - **1440px:** thông số chuẩn (biên độ ≤ 6px).
   - **1920px:** giữ nguyên biên độ (không scale to thêm theo viewport — tránh hiệu ứng "rộn"), glow rộng hơn theo `.wrap` 1568px hiện có.
5. **Chỉ 1 ambient loop cho cả hero** (glow + 3 card dùng chung nhịp có stagger), dừng khi: tab ẩn (`document.hidden`), `prefers-reduced-motion: reduce`, hoặc hero ra khỏi viewport (nếu dùng IntersectionObserver — chỉ sau khi có baseline 17D/17E).

## 5. Hover / Active / Focus Motion

| Target | Hover | Active | Focus |
| --- | --- | --- | --- |
| CTA hero (`.hero-v3__primary`) | lift `translateY(-1px…-2px)` + shadow sâu hơn, 160–220ms | scale ~0.98, 120–160ms | giữ nguyên `focus-visible` outline hiện có (không đổi màu/độ dày) |
| Search input | Focus illumination: border/glow nhẹ 160–220ms | — | outline không bị box-shadow che |
| Filter select / Clear | Border phản hồi 160–220ms | scale nhẹ | như trên |
| Featured Card | Lighting reaction: `box-shadow`/`border-color` sáng dần 180–260ms — **chỉ** shadow/border/opacity | — | — |
| Regular Card | **Giữ nguyên Tilt V6** — không thêm hiệu ứng hover mới chồng lên | — | — |
| Dashboard `.stat-card` | Hover elevation: shadow + `translateY(-2px)` 180–260ms | — | — |
| Section reveal | Khi vào viewport: opacity 0→1 + `translateY(8px→10px max)` 300–500ms, one-shot | — | — |

Quy tắc chung:

- Không hover-effect nào được đổi layout (`width`, `margin`, `padding` gây reflow).
- `transition` khai báo **cụ thể property** (`transform`, `box-shadow`, `border-color`, `opacity`), không dùng `transition: all`.
- Hover chỉ áp cho card khi `(hover: hover) and (pointer: fine)` (kế thừa bài 16F).

## 6. Reduced Motion & giới hạn animation

- **Toàn bộ** rule V7 nằm trong media query pairing:
  - Ambient: `@media (prefers-reduced-motion: no-preference)` để mặc định **tắt**, hoặc có block `@media (prefers-reduced-motion: reduce) { animation: none; transition: none }` tương ứng — không để "chạy trước, tắt sau".
  - Match cơ chế sẵn có của `motion.css`, `hero.css`, `grid-entrance.css`.
- **Giới hạn số lượng:**
  - Ambient loop **chỉ hero** — tối đa 4 phần tử (glow + 3 card). Không ambient ở gallery/dashboard.
  - Card animation đồng thời: **tối đa 1 card** (card đang hover/focus). Không pulse nhấp nháy hàng loạt.
  - Section reveal: one-shot, tối đa ~4 section (Hero, Dashboard, Collection, Gallery heading), không re-trigger khi cuộn lên/xuống lặp lại.
- Không theo dõi con trỏ ở cấp document/body.
- Không blur động > 0px ở runtime (glow dùng gradient có sẵn, static blur layer được phép nếu chỉ đổi `opacity`/`transform`).

## 7. Baseline V6 (đo trước, đặt ngưỡng regression sau)

### 7.1 Screenshot baseline — code tại tag `ui-v6.0.0`

Dataset 5 món giống hệt QA 16E (1 ảnh data-URI, 1 ảnh lỗi, 3 không ảnh, giá 320.000 → 12.500.000 ₫), headless Chrome, DSF=1, zoom 100%, full-page:

| File | `.wrap` | Overflow |
| --- | --- | --- |
| `docs/design/img/v7-baseline/v6-desktop-1280.png` | 1280px | Không |
| `docs/design/img/v7-baseline/v6-desktop-1440.png` | 1376px | Không |
| `docs/design/img/v7-baseline/v6-desktop-1920.png` | 1568px | Không |

### 7.2 Số đo hiệu năng baseline — @1440×900, 5 món

**Phương pháp:** CDP `Performance.getMetrics` (cùng nguồn dữ liệu với DevTools Performance panel) + `PerformanceObserver('longtask')` + bộ đếm frame `requestAnimationFrame`, chạy trên headless Chrome, cùng phiên đo cho before/after.

| Kịch bản | Thời lượng | FPS | Long tasks (tổng / max) | Main-thread task time | Script time | Layout / Style recalc | Heap delta |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **A — Trang idle** (không cuộn, không input) | 6.13s | **60.0** | 0 / 0ms | 0.06s (~1%) | 0.01s | 0 / 0 | +0.01MB |
| **B — Cuộn Hero → Dashboard → Collection → Gallery → footer** (90 bước, ~100ms/bước, cuộn mượt) | 9.67s | **60.0** | 0 / 0ms | 0.10s (~1%) | 0.01s | 0 / 0 | +0.04MB |

**Đọc số liệu:**

- **Kết quả 17B (có ambient animation) @1440×900, dataset 5 món — lặp 3 lần, rất ổn định:**

| Kịch bản | FPS | Long task >50ms | TaskDuration (main-thread) | Recalc style | Layout |
| --- | --- | --- | --- | --- | --- |
| Idle ~6s | **60.0–60.2** | **0** | 0.12–0.14s | ~364 | 0 |
| Cuộn ~9.5s | **59.9–60.1** | **0** | 0.21–0.25s | ~574 | 0 |

- **Baseline V6 (không animation) cùng môi trường:** idle 60.0 FPS / 0.06s / 0 recalc; scroll 60.0 FPS / 0.10s / 0 recalc.
- **Cô lập nguyên nhân (probe có bug `animation:none` specificity, đã sửa và đo lại):** bật/tắt stagger (-2.5s/-5s) KHÔNG làm đổi chi phí — cả hai đều 0.18s / recalc 364. Chi phí ~+0.11s (idle) và ~+0.12s (scroll) đến từ bản thân 4 animation vô hạn chạy trên **main-thread SwiftShader (headless không GPU)**, cộng dồn theo số element animate.
- **Kết luận trung thực:** FPS giữ 60.0 và 0 long task ở mọi kịch bản → không có jank. Cửa sổ main-thread vượt gate nội bộ (idle ≤0.12s, scroll ≤0.20s) chỉ xuất hiện trong môi trường headless software-render. Trên trình duyệt có GPU/compositor (d3d11 probe: recalc 0, task về ~0.13s), transform/opacity là compositor-thread và gần như free.

**Giới hạn trung thực (NOT VERIFIED / môi trường):**

- Đo trên **headless Chrome (SwiftShader)**, không phải DevTools Performance trên máy người dùng thật/monitor thật. TaskDuration + Recalc ở đây KHÔNG phản ánh đúng chi phí compositor-thread sẽ thấy ở trình duyệt có GPU — **không suy rộng thành số liệu thực tế mọi thiết bị**.
- FPS và long-task (2 chỉ số phản ánh jank thật) **PASS** toàn bộ: 60 FPS, 0 long task >50ms.
- Chưa đo GPU frame time, paint flashing, FPS với ~50+ sản phẩm, behavior tab nền (background throttling).
- **Cần kiểm tra ở 17E:** animation tự dừng khi Hero ra khỏi viewport và khi tab bị ẩn — CSS 17B KHÔNG chưa cơ chế đó (đúng spec: chỉ yêu cầu reduced-motion). Không coi là hoàn thành.
- Hướng giảm chi phí nội bộ (nếu 17E/17G cần): giảm số element ambient (giữ front-card + glow, bỏ back/middle) hoặc dùng `will-change`/`content-visibility` đúng chỗ — ưu tiên giảm/triệt tiêu ambient trước khi tối ưu khác.

**Giới hạn trung thực (NOT VERIFIED):**

- Đo trên **headless Chrome cùng máy CI/dev**, không phải DevTools Performance trên máy người dùng thật/monitor thật — số tuyệt đối sẽ khác phần cứng.
- Chưa đo GPU frame time, Paint/paint flashing, FPS khi có ~50+ sản phẩm (dataset 5 món).
- Chưa đo behavior khi tab chạy nền (background throttling).

## 8. Checklist 17A — Foundation Gate

| # | Hạng mục | Trạng thái |
| --- | --- | --- |
| 1 | Tag `ui-v6.0.0` đã push và xác minh (`8d37a0f` trên remote) | ✅ |
| 2 | Tạo nhánh `feature/cinematic-motion-v7` từ V6 (`69fa1c7`) | ✅ |
| 3 | Tài liệu Motion Design Specification (tài liệu này) | ✅ |
| 4 | Liệt kê rõ cơ chế Tilt và Purchased hiện tại (mục 2) | ✅ |
| 5 | Thiết kế Hero Motion desktop 1280/1440/1920 (mục 4) | ✅ |
| 6 | Xác định hover/active/focus motion (mục 5) | ✅ |
| 7 | Quy định Reduced Motion và giới hạn animation (mục 6) | ✅ |
| 8 | Screenshot baseline V6 desktop (mục 7.1) | ✅ |
| 9 | Số đo hiệu năng baseline (mục 7.2) | ✅ |
| 10 | Không sửa CSS/JS production trong 17A | ✅ (chỉ thêm docs + ảnh) |
| 11 | Không sửa Firebase/Auth/Sync/CRUD | ✅ |

## 8b. 17B — Cinematic Hero Gate (đã implement & QA desktop)

**Code:** thêm class `hero--v7` vào `.hero`, import `css/cinematic-v7-hero.css` (cuối stylesheet, sau V6 mobile). Không sửa DOM bên trong Hero, CTA, SVG, JS.

**Cơ chế:** 3 glass card (`--back`/`--middle`/`--front`) `float` rất nhẹ + glow `breathe` (chỉ `opacity`, KHÔNG animate `filter: blur()`). Keyframes **giữ nguyên toàn bộ chuỗi transform gốc V5** (`rotate`/`rotateY`/`scale`/`translateX(-50%)`/`translateZ(90px)`) rồi cộng `translateY(-4…-5px)` — không ghi đè transform, không phá bố cục 3D. Gate `@media (min-width:1025px) and (prefers-reduced-motion:no-preference)`; desktop nhỏ (1025–1350px) kéo `animation-duration` 10s (yên hơn); `prefers-reduced-motion:reduce` → `animation:none !important`.

**Kết quả QA desktop (headless Chrome, dataset 5 món):**

| Hạng mục | 1280px | 1440px | 1920px |
| --- | --- | --- | --- |
| Hero class `hero--v7` | ✅ | ✅ | ✅ |
| Wrap width | 1280 | 1376 | 1568 |
| Overflow | Không | Không | Không |
| 3 card float + glow breathe (infinite, stagger) | ✅ | ✅ | ✅ |
| Duration (1025–1350 / base) | 10s | 8/7/9s | 8/7/9s |
| Glass card trong khung hero (không cắt) | ✅ | ✅ | ✅ |
| Lỗi console | 0 | 0 | 0 |

| Viewport | Kết quả |
| --- | --- |
| 1024 / 768 / 375px | `animation:none` trên 3 card + glow — layout V6 giữ nguyên, không overflow, 0 console error |
| Reduced Motion @1440 | animation none; back/middle transform tĩnh **khớp hệt V5**; glow filter `blur(44px)` tĩnh, opacity tĩnh 0.95 (V6) |
| CTA Hero @1440 | Click mở dialog Thêm sản phẩm — PASS |
| 320×700 | CTA bottom 575px < dock top 616px — **không bị Dock che** |

**Hiệu năng (xem mục 7.2):** FPS 60.0–60.2 và **0 long task >50ms** ở cả idle lẫn scroll (PASS). Main-thread TaskDuration/Recalc trong headless SwiftShader vượt gate nội bộ vì animation chạy main-thread ở môi trường không GPU — **giới hạn môi trường, không phải jank** (trình duyệt có GPU: compositor-thread, recalc 0). Chưa kiểm cơ chế tự dừng khi Hero ra khỏi viewport / tab ẩn → **dành cho 17E**.

## 9. Roadmap V7

| Bài | Công việc | Ưu tiên |
| --- | --- | --- |
| 17A | Motion Art Direction & Baseline | P0 — tài liệu + baseline |
| 17B | Cinematic Hero Motion | P0 |
| 17C | Gallery Interactive Lighting | P1 |
| 17D | Dashboard & Collection Transitions | P1 |
| 17E | Desktop Motion QA & Freeze | P0 |
| 17F | Mobile Motion Adaptation | P2 |
| 17G | Final V7 Release Gate | P0 |

Desktop 1280/1440/1920 hoàn thiện và nghiệm thu trước (17A–17E). Không động đến mobile trước 17F.
