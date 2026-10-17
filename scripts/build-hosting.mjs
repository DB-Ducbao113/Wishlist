// V16 hosting build — assemble ONLY the runtime allowlist into ./dist
// Run: node scripts/build-hosting.mjs
// $0, no dependencies. Fail-closed: aborts if any expected asset is missing.
//
// V16.1 F6.2: the 52 source stylesheets are concatenated into ONE published
// file, css/app.css, in the exact <link> order the source document declares.
// The source tree keeps 52 separately-maintainable files; the published
// surface makes 1 render-blocking request instead of 52.
//
// This is safe because the CSS contains 0 url() references and 0 @import
// rules, so no relative path or import order exists to break. It is verified
// on every build by scripts/check-hosting.mjs, which re-computes the
// expected concatenation and requires byte equality.
import { rmSync, mkdirSync, cpSync, existsSync, readdirSync, statSync, writeFileSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const OUT = join(ROOT, 'dist');

// Explicit publish allowlist. Anything NOT listed here is never published.
const ALLOW = [
  'wishlist.html',
  'wishlist-cloud.js',
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

// The published stylesheet order is the order the source document links them.
// Reading it from the HTML (rather than hard-coding a list) means a sheet
// added or reordered in source can never be silently dropped or duplicated.
function stylesheetOrder() {
  const html = readFileSync(join(ROOT, 'wishlist.html'), 'utf8');
  const order = [...html.matchAll(/<link[^>]+href=["']?(\.\/css\/[^"'\s>]+\.css)/gi)]
    .map(m => m[1].replace(/^\.\//, ''));
  if (order.length === 0) { console.error('FATAL: no stylesheets linked from wishlist.html'); process.exit(1); }
  if (new Set(order).size !== order.length) { console.error('FATAL: duplicate stylesheet link in wishlist.html'); process.exit(1); }
  const missing = order.filter(f => !existsSync(join(ROOT, f)));
  if (missing.length) { console.error('FATAL: linked stylesheet missing: ' + missing.join(', ')); process.exit(1); }
  return order;
}

function buildAppCss(order) {
  const parts = order.map(f => '/* ==== ' + f + ' ==== */\n' + readFileSync(join(ROOT, f), 'utf8'));
  return parts.join('\n') + '\n';
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

// --- generated: the single published stylesheet ---
const order = stylesheetOrder();
const appCss = buildAppCss(order);
mkdirSync(join(OUT, 'css'), { recursive: true });
writeFileSync(join(OUT, 'css', 'app.css'), appCss);

// --- generated: the same document, pointing at that one stylesheet ---
let htmlOut = readFileSync(join(OUT, 'wishlist.html'), 'utf8');
const linkRe = /^[ \t]*<link[^>]+href=["']?\.\/css\/[^"'\s>]+\.css[^>]*>[ \t]*\r?$/gm;
const found = htmlOut.match(linkRe) || [];
if (found.length !== order.length) {
  console.error(`FATAL: expected ${order.length} stylesheet links in wishlist.html, found ${found.length}`);
  process.exit(1);
}
htmlOut = htmlOut.replace(linkRe, '');
htmlOut = htmlOut.replace('<head>', '<head>\n<link rel="stylesheet" href="css/app.css">');
writeFileSync(join(OUT, 'wishlist.html'), htmlOut);

// Cloudflare Pages platform files (ignored by Firebase Hosting; harmless there).
// Cloudflare serves index.html at "/" by default, but our entry is wishlist.html,
// so we provide an explicit rewrite plus the same safe headers as firebase.json.
const PLATFORM = {
  '_redirects': '/  /wishlist.html  200\n',
  '_headers': '/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n',
};
for (const [name, content] of Object.entries(PLATFORM)) writeFileSync(join(OUT, name), content);

const files = walk(OUT).map(p => relative(OUT, p).split('\\').join('/')).sort();
const violations = files.filter(f => FORBIDDEN.test(f));
if (violations.length) {
  console.error('FATAL: forbidden file(s) in dist: ' + violations.join(', '));
  process.exit(1);
}

const platformFiles = files.filter(f => f in PLATFORM);
const assetFiles = files.filter(f => !(f in PLATFORM));
const manifest = {
  generatedBy: 'scripts/build-hosting.mjs',
  allowlist: ALLOW,
  generated: ['css/app.css'],
  stylesheetSourceCount: order.length,
  stylesheetOrder: order,
  fileCount: files.length,
  assetCount: assetFiles.length,
  platformFiles,
  totalBytes: files.reduce((a, f) => a + statSync(join(OUT, f)).size, 0),
  files,
};
writeFileSync(join(ROOT, 'docs', 'qa', 'dream-vault-v15', 'hosting-manifest.json'), JSON.stringify(manifest, null, 1));
console.log(`dist built: ${files.length} files (${assetFiles.length} assets + ${platformFiles.length} platform), ${manifest.totalBytes} bytes`);
console.log(`stylesheets: ${order.length} source files -> 1 published css/app.css (${appCss.length} bytes)`);
console.log('allowlist: ' + ALLOW.join(', ') + ' + generated css/app.css');
