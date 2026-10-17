// =====================================================================
// DREAM VAULT V16.1 - F4 PAYLOAD REPORT
// ---------------------------------------------------------------------
// Reports the transfer cost of the app the way Cloudflare serves it:
// raw bytes and gzip bytes, split by asset class. Run it against any
// checkout of the repo to compare milestones.
//
// usage: node f4-payload.js [repoRoot] [label]
// =====================================================================
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = process.argv[2] || path.join(__dirname, '..', '..');
const LABEL = process.argv[3] || 'checkout';

const html = fs.readFileSync(path.join(ROOT, 'wishlist.html'), 'utf8');

const linkRe = /<link[^>]+href="([^"]+\.css)[^"]*"[^>]*>/gi;
const cssFiles = [];
let m;
while ((m = linkRe.exec(html)) !== null) {
  const href = m[1].split('?')[0];
  if (!cssFiles.includes(href)) cssFiles.push(href);
}

const scriptRe = /<script[^>]+src="([^"]+\.js)[^"]*"[^>]*>/gi;
const jsFiles = [];
while ((m = scriptRe.exec(html)) !== null) {
  const src = m[1].split('?')[0];
  if (!jsFiles.includes(src)) jsFiles.push(src);
}

// The app's own logic lives in inline <script> blocks; measure them too.
const inlineRe = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
let inlineBytes = 0;
let inlineCount = 0;
while ((m = inlineRe.exec(html)) !== null) {
  inlineBytes += Buffer.byteLength(m[1], 'utf8');
  inlineCount++;
}

const gz = (buf) => zlib.gzipSync(buf, { level: 9 }).length;

const read = (rel) => {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) return null;
  return fs.readFileSync(abs);
};

const htmlBuf = Buffer.from(html, 'utf8');
const cssBufs = cssFiles.map((f) => ({ f, buf: read(f) })).filter(x => x.buf);
const jsBufs = jsFiles.map((f) => ({ f, buf: read(f) })).filter(x => x.buf);

const cssRaw = cssBufs.reduce((n, x) => n + x.buf.length, 0);
const cssGz = cssBufs.reduce((n, x) => n + gz(x.buf), 0);
const jsRaw = jsBufs.reduce((n, x) => n + x.buf.length, 0);
const jsGz = jsBufs.reduce((n, x) => n + gz(x.buf), 0);

const report = {
  generatedAt: new Date().toISOString(),
  label: LABEL,
  root: ROOT,
  html: {
    file: 'wishlist.html',
    raw: htmlBuf.length,
    gzip: gz(htmlBuf),
    inlineScriptBlocks: inlineCount,
    inlineScriptBytes: inlineBytes
  },
  css: {
    files: cssBufs.length,
    raw: cssRaw,
    gzip: cssGz,
    largest: cssBufs
      .map(x => ({ file: x.f, raw: x.buf.length, gzip: gz(x.buf) }))
      .sort((a, b) => b.raw - a.raw)
      .slice(0, 8)
  },
  js: {
    files: jsBufs.length,
    raw: jsRaw,
    gzip: jsGz,
    list: jsBufs.map(x => ({ file: x.f, raw: x.buf.length, gzip: gz(x.buf) }))
  },
  total: {
    raw: htmlBuf.length + cssRaw + jsRaw,
    gzip: gz(htmlBuf) + cssGz + jsGz,
    requests: 1 + cssBufs.length + jsBufs.length
  }
};

fs.writeFileSync(
  path.join(path.dirname(__filename), 'v16_4-out', 'f4-payload-' + LABEL + '.json'),
  JSON.stringify(report, null, 1)
);

const kb = (n) => (n / 1024).toFixed(1).padStart(8);

console.log('== PAYLOAD REPORT: ' + LABEL + ' ==');
console.log('                      raw       gzip');
console.log('html          ' + kb(report.html.raw) + '  ' + kb(report.html.gzip) +
  '   (inline js ' + kb(report.html.inlineScriptBytes) + ')');
console.log('css  x' + String(report.css.files).padEnd(3) + '    ' + kb(cssRaw) + '  ' + kb(cssGz));
console.log('js   x' + String(report.js.files).padEnd(3) + '    ' + kb(jsRaw) + '  ' + kb(jsGz));
console.log('TOTAL         ' + kb(report.total.raw) + '  ' + kb(report.total.gzip) +
  '   in ' + report.total.requests + ' requests');
console.log('');
console.log('largest stylesheets:');
report.css.largest.forEach(x =>
  console.log('  ' + kb(x.raw) + '  ' + kb(x.gzip) + '   ' + x.file));
