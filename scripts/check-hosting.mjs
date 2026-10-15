// V15 hosting audit — prove what the OLD config would publish vs the NEW allowlist.
// Run: node scripts/check-hosting.mjs
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
const cssCount = distInner.filter(r => /^css\/.*\.css$/.test(r)).length;
const missingRuntime = requiredRuntime.filter(r => !distInner.includes(r));

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
    config: 'public: "dist" built by scripts/build-hosting.mjs (explicit allowlist)',
    distExists,
    publishedFileCount: distInner.length,
    cssCount,
    missingRuntime,
    leakCount: newLeaks.length,
    leaks: newLeaks,
  },
};
const ok = distExists && missingRuntime.length === 0 && newLeaks.length === 0 && cssCount === 46;
report.verdict = ok ? 'PASS — no repo internals published; all runtime assets present' : 'FAIL — see missingRuntime/leaks';

writeFileSync(join(ROOT, 'docs', 'qa', 'dream-vault-v15', 'hosting-audit.json'), JSON.stringify(report, null, 1));
console.log(JSON.stringify(report, null, 1));
process.exit(ok ? 0 : 1);
