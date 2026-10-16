# Dream Vault — Image Sync UX & Quick View Repair Sprint

Baseline: feature/cloudinary-image-sync-v1. Keep ui-v15.0.0 frozen. Budget $0.

## Confirmed source facts
- Cloud-status header still claims uploaded device images are local-only even with the new signed Cloudinary upload implementation.
- Quick View is a native dialog (#qv) with .quick-view__stage and .quick-view__panel. Screenshot shows oversized stage obscuring content and a floating top header.
- load() initializes sampleItems() whenever localStorage is absent. btnDeleteSample deletes items whose ids begin sample-. Status model already has wish / saving / ordered / purchased and cycleStatus().
- Do not treat existing synced items (even those with sample-* IDs) as safe to delete automatically.

## Integrated implementation scope — one sprint
### P0: Quick View repair
- Use real browser computed styles to find CSS cascade owner; stop stage from obscuring the details panel. Ensure two-column layout at desktop with stage and panel contained inside the dialog; one-column layout at mobile; close button remains visible during scroll, title/price/meta/actions present and accessible; display meaningful placeholder without hiding details.
- Check scroll lock, Escape, focus trap/restore, Edit bridge, 320/375/430/768/1024/1280/1440/1920 widths and long notes. No backdrop or CTA bleed.

### P1: Header & sync communication
- Make a concise responsive account/sync bar: sync state (connected/syncing/error), account and logout, image upload status (uploading/failed/retry), and clear text: 'Ảnh tải lên sẽ đồng bộ sau khi lưu thành công' when signed in. Never claim upload success before Cloudinary and Firestore acknowledgment. Don't expose account email in public screenshots.
- Preserve Google login/logout and status aria-live; distinguish image upload from Firestore metadata sync. Visible progress and actionable retry; compact mobile.

### P1: Remove demo experience safely
- On a fresh profile with no local data, initialize to [] rather than sampleItems(). Remove 'Xóa dữ liệu mẫu' button, its click handler, legacy sample helper/UI references and obsolete sampleActive assumption. No automatic destructive cleanup of existing local/Firestore records.
- Existing sample records may already be synced as genuine user documents. Offer opt-in migration/cleanup only after confirming item ownership and backed-up data; never blanket delete sample-* from Firestore. Test never deleting user records or changing real item IDs.

### P1: Bought/completion UX
- Existing status purchased is implemented, so promote a clear accessible 'Đánh dấu đã mua' action on card and Quick View, with confirmation/undo or reversible status, completed visual state, and accurate dashboard spent/pending. Preserve current status choices (wish/saving/ordered/purchased), and avoid duplicate handlers or destructive data schema migration.
- Keyboard, reduced motion, mobile hit targets, clear status and optional completed filter using existing controls.

## Data/image safety
- New JPEG upload must complete and Firestore write be acknowledged before presenting synced image as confirmed. Keep local photo on error and retry; no lost item or overwritten remote image from stale local data. Check concurrent device actions and ownership separation.
- Keep Firebase Auth/Firestore rules untouched unless an explicitly reviewed defect is proven. Secure Cloudinary secret stays Worker-only; rate limits and signed upload remain mandatory.

## QA and release
- Screenshot V15/current vs updated: header signed in/out/loading/error desktop+mobile, Quick View with/without image, long note, completed/purchased, zero-item empty state, 320x568/375x812/768/1440.
- Full 318 inherited V15 regression tests (or precise documented equivalents), new tests for visual structure, sync error recovery, sample-free fresh install, purchased status and data integrity; report actual PASS/FAIL logs and screenshots.
- Verify upload laptop→iPhone & reverse, reload, logout/login, cloud URL in Firestore, and no demo item reappearance. Do not test destructive migration against real production data.
- A/B performance check, WCAG keyboard, focus, reduced-motion, CLS, no overflow.
- Deliver docs/qa/image-sync-v1/final-ux-report.md with exact SHA and GO/HOLD. No tag, merge or production deploy without explicit approval.
