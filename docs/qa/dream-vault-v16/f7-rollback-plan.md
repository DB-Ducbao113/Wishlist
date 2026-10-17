# Dream Vault V16.1 - Rollback Plan

## Scope

This plan covers a rollback of the V16.1 changes on `feature/motion-auth-reset`
after they have reached `develop` or `main`. It does not cover a rollback of the
V16.0.0 release (`ui-v16.0.0 -> 562a62f`), which is untouched and remains the
last known-good tag.

## What V16.1 changed

- `wishlist.html` (+33 insertions in F6.3; the F5 savings feature before that)
- `css/f5-savings-v16.css` (new, F5)
- `scripts/build-hosting.mjs`, `scripts/check-hosting.mjs` (F6.2)
- `scripts/qa/*`, `package.json`, `package-lock.json` (F6.6)
- `docs/qa/dream-vault-v16/*` (reports and artifacts)

No Firestore collection, no rules change, no Worker change, no new origin.

## Risk profile

- The savings fields are additive and optional. A rollback removes the UI and
  the helpers but leaves the two keys on any document that was written in the
  meantime. That is harmless: an old client ignores unknown fields, and the
  compatibility matrix (f7-data-compatibility.md) shows a row with savings keys
  simply loads as a row without progress.
- The build change (one concatenated stylesheet) is fully reversible: reverting
  `scripts/build-hosting.mjs` restores the 52-file published set. No source CSS
  was changed, so the stylesheet content is byte-identical either way.
- The reproducible QA harnesses are additive; reverting them only removes tests.

## Rollback steps

1. Revert the F6.6 commit(s) first (harnesses + package.json) - lowest risk.
2. Revert F6.2 (build-hosting.mjs, check-hosting.mjs) - restores 52 published
   CSS files.
3. Revert F6.3 (the three signature guards) - restores the pre-F6 motion.
4. Revert F5 (f5-savings-v16.css + the savings code in wishlist.html) - the
   savings UI disappears; the two fields stay on stored documents and are ignored.
5. Revert F4, F3 if required - same pattern as before.

Each revert is a normal commit on the branch; nothing is force-pushed.

## Verification after rollback

- `npm run qa` must still be green (or the appropriate subset if harnesses were
  reverted).
- `npm run build && npm run check:hosting` must report PASS.
- Lighthouse must return to the F5 numbers (desktop 71 / mobile 93 compressed).
- No document should be deleted or rewritten; verify a sample row still loads.

## What does NOT need rollback

- Firestore data: nothing was migrated, so there is nothing to un-migrate.
- Cloudinary: no new upload path was added in F6.
- Auth: untouched.
- The `ui-v16.0.0` tag: never moved.

## Rollback owner

The repository owner (PR #1 reviewer) approves and executes. No automated
rollback is performed in F7.
