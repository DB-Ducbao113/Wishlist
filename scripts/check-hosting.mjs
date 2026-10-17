// V16 hosting audit — prove what the OLD config would publish vs the NEW allowlist.
// Run: node scripts/check-hosting.mjs
//
// V16.1 F6.2: the CSS invariant is now byte-exact, not a file count. The old
// check asserted "dist publishes exactly the stylesheets that exist under
// css/". The build now publishes ONE generated file, so the invariant became
// stronger: dist/css/app.css must be byte-identical to the concatenation of
// every repo stylesheet in the order wishlist.html links them, and no other
// CSS may be published at all.
import { readdirSync, statSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const OUT = join(ROOT, 'dist');

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === '.git') { out.push(join(dir, name)); continue; } // don't descend
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}
const rel = p => relative(ROOT, p).split('\\').join('/');

// --- OLD exposure: public:"." with the previous ignore list ---
const OLD_IGNORE_LITERAL = new Set(['firebase.json', 'FIREBASE_SETUP.md', 'firestore.rules']);
function oldIgnored(r) {
  if (OLD_IGNORE_LITERAL.has(r)) return true;
  const parts = r.split('/');
  if (parts.some(p => p.startsWith('.'))) return true;        // **/.*
  if (parts.includes('node_modules')) return true;            // **/node_modules/**
  return false;
}
const allRepo = walk(ROOT);
const oldPublished = allRepo.map(rel).filter(r => !oldIgnored(r));
const SENSITIVE = /(^|\/)(docs|\.git|\.firebase|worker)(\/|$)|firebase\.json$|firestore\.rules$|FIREBASE_SETUP\.md$|\.firebaserc$|\.(map|bak|zip|log|pem|p12|key|env)$|serviceAccount/i;
const oldLeaks = oldPublished.filter(r => SENSITIVE.test(r));

// --- NEW exposure: dist allowlist ---
const distExists = existsSync(OUT);
const distFiles = distExists ? walk(OUT).map(rel).filter(r => r !== 'dist') : [];
const distInner = distFiles.map(r => r.replace(/^dist\//, ''));
const newLeaks = distInner.filter(r => SENSITIVE.test(r));
const requiredRuntime = ['wishlist.html', 'wishlist-cloud.js'];
const missingRuntime = requiredRuntime.filter(r => !distInner.includes(r));

// --- the CSS invariant: byte-exact, not a count ---
const repoCss = readdirSync(join(ROOT, 'css')).filter(n => n.endsWith('.css'));
const html = readFileSync(join(ROOT, 'wishlist.html'), 'utf8');
const order = [...html.matchAll(/<link[^>]+href=["']?(\.\/css\/[^"'\s>]+\.css)/gi)]
  .map(m => m[1].replace(/^\.\//, ''));
const expectedCss = order.map(f => '/* ==== ' + f + ' ==== */\n' + readFileSync(join(ROOT, f), 'utf8')).join('\n') + '\n';
const appCssPath = join(OUT, 'css', 'app.css');
const appCss = existsSync(appCssPath) ? readFileSync(appCssPath, 'utf8') : null;
const publishedCss = distInner.filter(r => /^css\/.*\.css$/.test(r));
const strayCss = publishedCss.filter(r => r !== 'css/app.css');
const cssByteIdentical = appCss === expectedCss;
const htmlLinksAppCss = existsSync(join(OUT, 'wishlist.html'))
  ? /href=["']?css\/app\.css/.test(readFileSync(join(OUT, 'wishlist.html'), 'utf8'))
  : false;
const htmlLinksNoSourceSheet = existsSync(join(OUT, 'wishlist.html'))
  ? !/href=["']?\.\/css\/[^"'\s>]+\.css/.test(readFileSync(join(OUT, 'wishlist.html'), 'utf8'))
  : false;

const report = {
  generatedAt: new Date().toISOString(),
  old: {
    config: 'public: "." with ignore [firebase.json, FIREBASE_SETUP.md, firestore.rules, **/.*, **/node_modules/**]',
    publishedFileCount: oldPublished.length,
    leakCount: oldLeaks.length,
    leakedSamples: oldLeaks.slice(0, 40),
    leakedCategories: {
      docs: oldLeaks.filter(r => r.startsWith('docs/')).length,
      config: oldLeaks.filter(r => /firebase\.json|firestore\.rules|FIREBASE_SETUP|\.firebaserc/.test(r)).length,
    },
  },
  new: {
    config: 'public: "dist" built by scripts/build-hosting.mjs (explicit allowlist + generated css/app.css)',
    distExists,
    publishedFileCount: distInner.length,
    cssCount: publishedCss.length,
    missingRuntime,
    leakCount: newLeaks.length,
    leaks: newLeaks,
    cssInvariant: {
      repoStylesheetCount: repoCss.length,
      linkedStylesheetCount: order.length,
      everyRepoSheetLinked: order.length === repoCss.length && repoCss.every(f => order.some(o => o.endsWith('/' + f))),
      appCssExists: appCss !== null,
      appCssByteIdenticalToSourceConcatenation: cssByteIdentical,
      strayCssFilesPublished: strayCss,
      publishedHtmlLinksAppCss: htmlLinksAppCss,
      publishedHtmlLinksNoSourceSheet: htmlLinksNoSourceSheet
    }
  },
};
const cssOk = order.length === repoCss.length
  && repoCss.every(f => order.some(o => o.endsWith('/' + f)))
  && appCss !== null
  && cssByteIdentical
  && strayCss.length === 0
  && htmlLinksAppCss
  && htmlLinksNoSourceSheet;
const ok = distExists && missingRuntime.length === 0 && newLeaks.length === 0 && cssOk;
report.verdict = ok
  ? 'PASS — no repo internals published; all runtime assets present; css/app.css is the exact concatenation of every linked source sheet'
  : 'FAIL — see missingRuntime/leaks/cssInvariant';

writeFileSync(join(ROOT, 'docs', 'qa', 'dream-vault-v15', 'hosting-audit.json'), JSON.stringify(report, null, 1));
console.log(JSON.stringify(report, null, 1));
process.exit(ok ? 0 : 1);
