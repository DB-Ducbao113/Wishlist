// V15 hosting build — assemble ONLY the runtime allowlist into ./dist
// Run: node scripts/build-hosting.mjs
// $0, no dependencies. Fail-closed: aborts if any expected asset is missing.
import { rmSync, mkdirSync, cpSync, existsSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const OUT = join(ROOT, 'dist');

// Explicit publish allowlist. Anything NOT listed here is never published.
const ALLOW = [
  'wishlist.html',
  'wishlist-cloud.js',
  'css',
];

// Never allow these to slip in, even if someone adds them to ALLOW by mistake.
const FORBIDDEN = /(^|\/)(docs|\.git|\.firebase|node_modules)(\/|$)|\.(map|bak|zip|log|pem|p12|key|env)$|firebase\.json$|firestore\.rules$|FIREBASE_SETUP\.md$|\.firebaserc$/i;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

for (const entry of ALLOW) {
  const src = join(ROOT, entry);
  if (!existsSync(src)) {
    console.error(`FATAL: allowlisted entry missing: ${entry}`);
    process.exit(1);
  }
  cpSync(src, join(OUT, entry), { recursive: true });
}

const files = walk(OUT).map(p => relative(OUT, p).split('\\').join('/')).sort();
const violations = files.filter(f => FORBIDDEN.test(f));
if (violations.length) {
  console.error('FATAL: forbidden file(s) in dist: ' + violations.join(', '));
  process.exit(1);
}

const manifest = {
  generatedBy: 'scripts/build-hosting.mjs',
  allowlist: ALLOW,
  fileCount: files.length,
  totalBytes: files.reduce((a, f) => a + statSync(join(OUT, f)).size, 0),
  files,
};
writeFileSync(join(ROOT, 'docs', 'qa', 'dream-vault-v15', 'hosting-manifest.json'), JSON.stringify(manifest, null, 1));
console.log(`dist built: ${files.length} files, ${manifest.totalBytes} bytes`);
console.log('allowlist: ' + ALLOW.join(', '));
