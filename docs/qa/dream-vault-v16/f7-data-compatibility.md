# Dream Vault V16.1 - F7 Data Compatibility Matrix

Built from `normalizeItem()` (wishlist.html ~1600), `setPurchaseFields`/`clearPurchaseFields`
(~1404), `setSavingsFields`/`clearSavingsFields` (~1620), the export/import paths and
`wishlist-cloud.js:229` (`setDoc(doc(itemsRef, documentId), { ...item, id, image })`).

## 1. Field inventory

| Field | Type | Optional | Written when | Cleared when | Notes |
| --- | --- | --- | --- | --- | --- |
| `id`, `name`, `price`, `image`, `link`, `status`, `priority`, `category`, `note`, `createdAt` | core | no (defaults applied) | always | - | V15 baseline, unchanged |
| `paidAmount`, `purchasedAt`, `previousStatus` | purchase | yes | status becomes `purchased` | status leaves `purchased` | F2 pattern; cleared on undo |
| `savingGoal`, `savedAmount` | savings | yes | user supplies a value | user clears both fields or hits reset | F5; **never** cleared on purchase |
| `image` (data URL) | media | yes | upload | delete | stored as data URL in localStorage; Firestore stores the Cloudinary URL |

## 2. Compatibility matrix (stored shape -> F6 behaviour)

| Stored shape | `normalizeItem` result | Rendered? | Data lost? |
| --- | --- | --- | --- |
| V15 row, no purchase/savings keys | unchanged | yes | no |
| V15 row with `paidAmount` but no `purchasedAt` | `purchasedAt` stays absent; `fmtDate` returns empty | yes | no |
| V15 row, `status: "purchased"` with no purchase fields | treated as purchased with no recorded payment; "chưa ghi nhận" | yes | no |
| V16 row, `savingGoal: 0` | treated as "no goal"; key dropped on next normalise | no progress bar | the `0` only |
| V16 row, `savingGoal: -5` / `NaN` / `Infinity` / `1e30` | dropped | nothing | the invalid value only |
| V16 row, `savingGoal: "1500000"` (numeric string) | accepted, stored as integer | yes | no |
| V16 row, `savedAmount > savingGoal` | both stored untouched; `savingsReached = true`, bar capped at 100 % | "Đã đạt mục tiêu" | no |
| V16 row, purchased, with savings keys | **keys kept** (diverges from purchase fields on purpose) | hidden from dashboard, shown in Quick View | no |
| Guest row exported to JSON | keys travel with `JSON.stringify(items)` | yes | no |
| Imported JSON with hostile values | `normalizeItem` sanitises; bad values dropped | yes | bad values only |
| Remote document with a malformed value | reader returns `null`/`0`; value is not written back by a read | nothing renders | no (remote untouched until save) |
| Account A row read while logged in as B | impossible: `wishlist.account.<uid>` is per-uid; the cloud sync is gated on `activeUid` | n/a | no |
| V15 row with a data-URL image | kept; Cloudinary upload replaces it only on edit | yes | no |

## 3. Guest / account isolation

- Guest data lives in `wishlist.guest.items`. Account data in `wishlist.account.<uid>`.
- `handleSessionChange(uid)` swaps `items` and calls `render()`; it never merges.
- A cloud sync only runs when `activeUid` is set and `cloudSync.user.uid === activeUid`.
- Logging out does not delete Firestore data; it only stops syncing.
- `legacyPending` is written to the guest key exactly once, on first upgrade.

## 4. Purchase / undo / savings independence

- Marking an item purchased writes `paidAmount` + `purchasedAt` + `previousStatus`.
- Undoing restores `previousStatus` and clears the three purchase fields.
- **Savings fields are never cleared by purchase or undo** (F5-1-12, F5-1-19, F5-1-20).
- A savings goal can exist before the item is bought; buying does not un-save.
- "Goal reached" and "purchased" are independent states and are never conflated
  in copy or in `computeMetrics()`.

## 5. Migration

No migration is performed and none is needed: the fields are additive and
optional, there is no version bump, no rewrite pass, no new collection. An old
row loads, renders and saves unchanged. A hostile or malformed remote document
is ignored at read time and is never written back by a read.

## 6. Verified by

- `scripts/qa/f5-check.js` section A (25 checks): validators, `normalizeItem`
  round-trips for valid/legacy/negative/string/NaN/Infinity/over-saved/purchased/
  goal-0 rows, `computeSavings` on unpurchased-only/empty/purchased-only lists,
  purchase + undo, guest -> account -> guest, localStorage round-trip.
- `scripts/qa/f1-check.js` (107 checks): legacy data paths.
- `scripts/qa/f2-check.js` (168 checks): purchase fields, paid amount, undo.
- `scripts/qa/f5-check.js` sections B/C/D: form, Quick View, dashboard, import/export.

All of the above are in `npm run qa` and pass on this tree.
