# Dream Vault — QA harnesses

All test harnesses live under `scripts/qa/`. They drive the **real** single-file
app (`wishlist.html`) in a real browser, stubbing only the cloud module
(`wishlist-cloud.js`) so no Firebase network is needed. Nothing here requires a
real Google account, a real Firestore project, or an iPhone.

## Dependencies

- Node.js >= 20
- Google Chrome (any recent version). Override the location with `CHROME=...`.
- `puppeteer-core` 25.13.0 and `lighthouse` 13.5.0.

Install once:

    npm install

## Run

One command, all suites:

    npm run qa

Or individually:

    node scripts/qa/syntax.js [repoRoot]          # 0 / 0 literal-\\n / doubled \\u
    node scripts/qa/f1-check.js [repoRoot]        # 107
    node scripts/qa/f2-check.js [repoRoot]        # 168
    node scripts/qa/f3-check.js [repoRoot]        # 167
    node scripts/qa/f4-check.js [repoRoot]        # 65
    node scripts/qa/f5-check.js [repoRoot]        # 97
    node scripts/qa/f6-check.js [repoRoot]        # 28
    node scripts/qa/v16-qa.js [repoRoot]          # 36
    node scripts/qa/m1-check.js ... m4-check.js   # 28 / 31 / 32 / 28

`repoRoot` defaults to the repository root, so the commands above work as-is.
Each suite writes its results to `qa-out/` at the repository root.

## Lighthouse / payload / audit (extra)

    node scripts/qa/payload.js [root] [label]     # HTML/CSS byte report
    node scripts/qa/audit.js [root] [width]        # interaction audit (1440 / 375)
    node scripts/qa/f6-lighthouse.js [root] [label]  # Lighthouse, raw or gzip (GZIP=1)

## Suites that stay in the QA directory

The measurement harnesses (`f6-render-baseline.js`, `f6-probe-filters.js`,
`f6-audit-static.js`, `f6-audit-runtime.js`, `f5-shots.js`, `f5-lighthouse.js`,
`f5-render-ab.js`, `f5-shot-filter.js`) are deliberately NOT committed: they are
ad-hoc diagnostics, they write screenshots and reports, and several of them
serve the app from a fixed port. They are kept in the QA directory and are
re-runnable from there.

## What is NOT tested here

- Real Firebase / Firestore sync (the cloud module is stubbed by request
  interception; see docs/qa/dream-vault-v16/f5-report.md §2.2).
- Real Google sign-in.
- iPhone / Safari.
- Production deployment.
