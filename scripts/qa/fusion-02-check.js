// =====================================================================
// DREAM VAULT V16.2 — FUSION-02
// CINEMATIC SCROLL, EDITORIAL TYPOGRAPHY & LIVING DASHBOARD
// Real-browser verification.
//
// Nothing here is a "the CSS file exists" test. Every claim is checked
// against computed styles, real geometry, hit-testing, live animation
// objects (element.getAnimations), decoded screenshot pixels, the app's
// own persistence and the leak counters injected before the page loads:
//
//   1)  the scroll rail is decorative and follows the REAL scroll position
//   2)  it reaches its final value at the end of the document
//   3)  resize and content changes re-measure it
//   4)  it is transform-only (scaleX), never a width animation
//   5)  it does no idle rAF work while the page is still
//   6)  the marquee sits in the hero-to-dashboard transition, is
//       aria-hidden and carries no invented statistics
//   7)  it moves measurably and wraps seamlessly (two identical groups)
//   8)  it pauses on hover, on keyboard focus, on a hidden tab and under
//       html.motion-lite
//   9)  reduced motion resolves it to a static, complete strip
//  10)  the ghost typography is aria-hidden, behind the heading and never
//       over a control, with no readability loss (pixel proof)
//  11)  the heading entrance is keyed to the EXISTING reveal system and
//       settles back to the resolved state
//  12)  the scroll-linked typography depth is real (root scroll timeline)
//       and responds to the scroll position
//  13)  the dashboard rail light runs once, on reveal
//  14)  the PRE-EXISTING stat-card elevation still works and FUSION-02
//       adds no fourth transform owner for it
//  15)  both meters keep their own progress owner and only gain light
//  16)  the gallery sheen is a new node, paints subtly, desktop-hover only
//  17)  the card surface transform is identical with the sheen on and off
//  18)  Gallery/Focus FLIP, Quick View, Board and purchase confirmation
//       all still work
//  19)  FUSION-01 aurora + floating hero are untouched
//  20)  no horizontal overflow and no browser errors at 7 widths
//  21)  no listener growth, no permanent will-change, no blur/backdrop
// =====================================================================
const puppeteer = require('puppeteer-core');
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const CHROME = process.env.CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : path.join(__dirname, '..', '..');
const PORT = 8212;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml' };

const MOCK = `
const state = { user: null, opts: null };
window.__cloud = state;
export async function initializeWishlistCloud(opts){
  state.opts = opts;
  window.__cloudSetUser = (u) => { state.user = u; if(opts.onUserChanged) opts.onUserChanged(u ? u.uid : null); };
  setTimeout(() => { window.__cloudSetUser(null); if(opts.onStatus) opts.onStatus('local', ''); }, 0);
  return {
    get user(){ return state.user; },
    signIn: async () => {}, signOut: async () => {},
    syncItems: () => Promise.resolve(),
    uploadImage: async () => 'https://cdn.example/img.jpg'
  };
}
`;

function serveFrom(root) {
  return (req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/') p = '/wishlist.html';
    const file = path.join(root, p);
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); return res.end('not found'); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(data);
    });
  };
}
const server = http.createServer(serveFrom(ROOT));

const results = [];
let section = '';
function c(id, area, entry, expected, pass, actual) {
  results.push({ id, section, area, entry, expected, pass: !!pass, actual: actual === undefined ? '' : JSON.stringify(actual) });
}

// ---------------------------------------------------------------------
// Minimal dependency-free PNG reader (8-bit, non-interlaced) so the suite
// can prove a layer is really painted instead of trusting a CSS rule.
// ---------------------------------------------------------------------
function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a png');
  let off = 8, w = 0, h = 0, depth = 0, colorType = 0, interlace = 0;
  const idat = [];
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      depth = data[8]; colorType = data[9]; interlace = data[12];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  if (depth !== 8 || interlace !== 0) throw new Error('unsupported png (depth ' + depth + ', interlace ' + interlace + ')');
  const ch = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 0 ? 1 : colorType === 4 ? 2 : 0;
  if (!ch) throw new Error('unsupported png color type ' + colorType);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * ch;
  const out = Buffer.alloc(stride * h);
  let pos = 0;
  for (let y = 0; y < h; y++) {
    const filter = raw[pos++];
    const line = raw.subarray(pos, pos + stride); pos += stride;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? cur[i - ch] : 0;
      const b = prev ? prev[i] : 0;
      const cpx = prev && i >= ch ? prev[i - ch] : 0;
      let v = line[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - cpx;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - cpx);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : cpx);
      }
      cur[i] = v & 0xff;
    }
  }
  return { width: w, height: h, channels: ch, data: out };
}

// Region mean over a decoded screenshot. The whole VIEWPORT is captured
// (no clip), so viewport coordinates are exact and there is no ambiguity
// about clip vs. document space.
function meanRgb(png, region) {
  const { data, channels, width, height } = png;
  const x0 = Math.max(0, Math.min(width, Math.round(region ? region.x : 0)));
  const y0 = Math.max(0, Math.min(height, Math.round(region ? region.y : 0)));
  const x1 = Math.max(x0, Math.min(width, Math.round(region ? region.x + region.w : width)));
  const y1 = Math.max(y0, Math.min(height, Math.round(region ? region.y + region.h : height)));
  let r = 0, g = 0, b = 0, n = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = (y * width + x) * channels;
    r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
  }
  return n === 0 ? null : [r / n, g / n, b / n];
}

function meanDelta(a, b) {
  if (!a || !b) return -1;
  return (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2])) / 3;
}

async function regionMean(page, region) {
  const base64 = await page.screenshot({ encoding: 'base64' });
  return meanRgb(decodePng(Buffer.from(base64, 'base64')), region);
}

async function shotPng(page) {
  const base64 = await page.screenshot({ encoding: 'base64' });
  return decodePng(Buffer.from(base64, 'base64'));
}

// Per-pixel diff of two screenshots over one region: how many pixels changed
// at all, and by how much the STRONGEST pixel changed. A mean over a large
// area drowns a very low-alpha layer (the ghost ink is 5.5%): this does not.
function diffRegion(a, b, region) {
  const wa = a.width, ha = a.height, ca = a.channels, cb = b.channels;
  const x0 = Math.max(0, Math.min(wa, Math.round(region.x)));
  const y0 = Math.max(0, Math.min(ha, Math.round(region.y)));
  const x1 = Math.max(x0, Math.min(wa, Math.round(region.x + region.w)));
  const y1 = Math.max(y0, Math.min(ha, Math.round(region.y + region.h)));
  let changed = 0, max = 0, total = 0, n = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = (y * wa + x) * ca, j = (y * wa + x) * cb;
    const d = Math.max(Math.abs(a.data[i] - b.data[j]), Math.abs(a.data[i + 1] - b.data[j + 1]), Math.abs(a.data[i + 2] - b.data[j + 2]));
    if (d >= 1) changed++;
    if (d > max) max = d;
    total += d; n++;
  }
  return { changed, max, mean: +(n ? total / n : 0).toFixed(3), pixels: n };
}

async function withStyle(page, css, fn) {
  const tag = await page.addStyleTag({ content: css });
  try { return await fn(); } finally { await tag.evaluate(el => el.remove()); }
}

function dataImage(mark, c1, c2) {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300">' +
    '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
    '<stop offset="0" stop-color="' + c1 + '"/><stop offset="1" stop-color="' + c2 + '"/></linearGradient></defs>' +
    '<rect width="400" height="300" fill="url(#g)"/>' +
    '<text x="200" y="160" font-family="system-ui" font-size="34" font-weight="700" text-anchor="middle" fill="#2b1f5c">' + mark + '</text></svg>';
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}
const IMG1 = dataImage('IMG1', '#cbb8ff', '#8f74e6');
const IMG2 = dataImage('IMG2', '#ffd9f0', '#e08fd0');

function mk(id, over) {
  return Object.assign({
    id, name: 'Món ' + id, price: 500000, image: '', link: '',
    status: 'wish', priority: 'medium', category: 'A', note: '', createdAt: 1700000000000
  }, over || {});
}

// a1 featured, a2 second, a3 ordered, a4 already purchased, a5 image-less
// savingGoal/savedAmount are the fields the savings widget reads, so a1/a2
// produce real rows and a real --dv-fill for the meter assertions below.
const ITEMS = [
  mk('a1', { name: 'Máy ảnh', price: 42000000, status: 'wish', priority: 'high', image: IMG1, savedAmount: 27000000, savingGoal: 42000000, category: 'Nhiếp ảnh' }),
  mk('a2', { name: 'Tai nghe', price: 7490000, status: 'saving', priority: 'high', image: IMG2, savedAmount: 1200000, savingGoal: 7490000, category: 'Âm thanh' }),
  mk('a3', { name: 'Giày chạy bộ', price: 2450000, status: 'ordered', priority: 'medium', image: dataImage('IMG3', '#cfe6ff', '#7fa8f0') }),
  mk('a4', { name: 'Máy đọc sách', price: 3190000, status: 'purchased', priority: 'low', image: dataImage('IMG4', '#d9f2e4', '#7fcfae'), paidAmount: 3100000, purchasedAt: 1700000100000, previousStatus: 'wish' }),
  mk('a5', { name: 'Ống kính 50mm', price: 8900000, status: 'wish', priority: 'medium', image: '' })
];

// =====================================================================
// Browser-side probes (injected before any app code runs)
// =====================================================================
const PROBE_HEADER = `
(function(){
  window.__leakTally = { doc: {}, win: {} };
  var oda = document.addEventListener.bind(document), rda = document.removeEventListener.bind(document);
  var owa = window.addEventListener.bind(window), rwa = window.removeEventListener.bind(window);
  document.addEventListener = function(t, l, o){ window.__leakTally.doc[t] = (window.__leakTally.doc[t]||0)+1; return oda(t,l,o); };
  document.removeEventListener = function(t, l, o){ window.__leakTally.doc[t] = (window.__leakTally.doc[t]||0)-1; return rda(t,l,o); };
  window.addEventListener = function(t, l, o){ window.__leakTally.win[t] = (window.__leakTally.win[t]||0)+1; return owa(t,l,o); };
  window.removeEventListener = function(t, l, o){ window.__leakTally.win[t] = (window.__leakTally.win[t]||0)-1; return rwa(t,l,o); };

  window.__rafCount = 0;
  var raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = function(cb){ window.__rafCount++; return raf(cb); };

  window.__box = function(sel){
    var el = typeof sel === 'string' ? document.querySelector(sel) : sel;
    if(!el) return null;
    var cs = getComputedStyle(el), b = el.getBoundingClientRect();
    return {
      x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height),
      right: Math.round(b.right), bottom: Math.round(b.bottom),
      display: cs.display, opacity: +cs.opacity, z: cs.zIndex, pe: cs.pointerEvents,
      transform: cs.transform, animation: cs.animationName, playState: cs.animationPlayState,
      willChange: cs.willChange
    };
  };
  window.__anims = function(sel){
    var el = document.querySelector(sel);
    if(!el) return null;
    return el.getAnimations().map(function(a){
      var t = a.effect && a.effect.getTiming ? a.effect.getTiming() : {};
      return {
        name: a.animationName || null,
        state: a.playState,
        iterations: t.iterations,
        // Infinity does not survive the CDP JSON round-trip (it becomes
        // null), so the comparison is resolved here, in the page.
        iterInfinite: t.iterations === Infinity,
        duration: t.duration,
        timeline: a.timeline ? (a.timeline.constructor && a.timeline.constructor.name) : 'none'
      };
    });
  };
  // document.getAnimations() is the only list that includes PSEUDO-ELEMENT
  // animations (element.getAnimations() omits them).
  window.__docAnims = function(){
    return document.getAnimations().map(function(a){
      var t = a.effect && a.effect.getTiming ? a.effect.getTiming() : {};
      var tgt = a.effect && a.effect.target ? a.effect.target : null;
      return {
        name: a.animationName || null,
        state: a.playState,
        iterInfinite: t.iterations === Infinity,
        pseudo: (a.effect && a.effect.pseudoElement) || null,
        target: tgt ? (tgt.tagName.toLowerCase() + '.' + String(tgt.className || '').split(' ').slice(0, 2).join('.')) : null
      };
    });
  };
  window.__matrixScaleX = function(sel){
    var el = typeof sel === 'string' ? document.querySelector(sel) : sel;
    if(!el) return null;
    var m = getComputedStyle(el).transform;
    if(!m || m === 'none') return null;
    var nums = m.replace(/matrix3?d?\\(/,'').replace(/\\)/,'').split(',').map(parseFloat);
    return nums[0];
  };
  window.__scrollInfo = function(){
    var doc = document.documentElement;
    var max = Math.max(1, doc.scrollHeight - window.innerHeight);
    return { y: window.scrollY || doc.scrollTop || 0, max: max, ratio: (window.scrollY || 0) / max,
             height: doc.scrollHeight, innerHeight: window.innerHeight,
             scrollWidth: doc.scrollWidth, innerWidth: window.innerWidth };
  };
  window.__rafProbe = function(ms){
    return new Promise(function(res){
      var start = window.__rafCount;
      setTimeout(function(){ res(window.__rafCount - start); }, ms);
    });
  };
  // Replaces every media frame's sheen with a deterministic mid-sweep pose,
  // so a single screenshot proves the sweep layer actually paints.
  window.__f02Style = function(id, css){
    var tag = document.getElementById(id);
    if(!tag){ tag = document.createElement('style'); tag.id = id; document.head.appendChild(tag); }
    tag.textContent = css;
  };
})();
`;

async function newScenario(browser, seed, opts = {}) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  const state = { errors: [], pageErrors: [], requests: [] };
  if (opts.touch) {
    await page.emulate({
      viewport: { width: opts.width || 390, height: opts.height || 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
    });
  } else {
    await page.setViewport({ width: opts.width || 1440, height: opts.height || 900, deviceScaleFactor: 1 });
  }
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: opts.reducedMotion ? 'reduce' : 'no-preference' }]);
  await page.evaluateOnNewDocument(PROBE_HEADER);
  await page.evaluateOnNewDocument((s) => {
    try {
      localStorage.clear();
      if (s.items) localStorage.setItem('wishlist.guest.items', JSON.stringify(s.items));
    } catch (e) {}
  }, { items: seed });
  await page.setRequestInterception(true);
  page.on('request', req => {
    state.requests.push(req.url());
    if (/wishlist-cloud\.js/.test(req.url())) return req.respond({ status: 200, contentType: 'text/javascript', body: MOCK });
    req.continue();
  });
  page.on('pageerror', e => state.pageErrors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') state.errors.push(m.text()); });
  page.on('dialog', d => { d.dismiss().catch(() => {}); });
  await page.goto(`http://localhost:${PORT}/wishlist.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('typeof window.__cloudSetUser === "function"');
  await sleep(opts.settle || 900);
  return { ctx, page, state };
}

const boxOf = (page, sel) => page.evaluate((s) => window.__box(s), sel);

function intersects(a, b) {
  if (!a || !b || a.w === 0 || b.w === 0 || a.display === 'none' || b.display === 'none') return false;
  return a.x < b.right && b.x < a.right && a.y < b.bottom && b.y < a.bottom;
}

async function hitTestAt(page, sel) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return { ok: false, reason: 'missing' };
    el.scrollIntoView({ block: 'center', behavior: 'instant' });
    const b = el.getBoundingClientRect();
    const cx = Math.round(b.left + b.width / 2), cy = Math.round(b.top + b.height / 2);
    const hit = document.elementFromPoint(cx, cy);
    return {
      ok: true, cx, cy,
      inside: !!hit && (hit === el || el.contains(hit)),
      hit: hit ? (hit.tagName.toLowerCase() + '.' + String(hit.className || '').split(' ').slice(0, 2).join('.')) : 'null'
    };
  }, sel);
}

// Scroll to a ratio of the *real* maximum, then report where we landed so
// every assertion can compare against measured geometry, never against the
// requested number (robust to any scroll-behaviour policy).
async function scrollToRatio(page, ratio) {
  await page.evaluate((r) => {
    const doc = document.documentElement;
    const max = Math.max(0, doc.scrollHeight - window.innerHeight);
    window.scrollTo(0, Math.round(max * r));
  }, ratio);
  await sleep(140);
  return page.evaluate(() => window.__scrollInfo());
}

// =====================================================================
async function run() {
  await new Promise(r => server.listen(PORT, r));
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--force-device-scale-factor=1', '--disable-lcd-text']
  });

  const cssSrc = fs.readFileSync(path.join(ROOT, 'css', 'fusion-02-cinematic-scroll.css'), 'utf8');
  const htmlSrc = fs.readFileSync(path.join(ROOT, 'wishlist.html'), 'utf8');

  // ===================================================================
  section = 'F01 SCROLL PROGRESS RAIL';
  // ===================================================================
  {
    const { ctx, page, state } = await newScenario(browser, ITEMS, { width: 1440, height: 900 });
    await scrollToRatio(page, 0);

    const rail = await page.evaluate(() => {
      const el = document.querySelector('.pv-progress');
      const bar = document.getElementById('pvProgressBar');
      if (!el || !bar) return null;
      const cs = getComputedStyle(el), bs = getComputedStyle(bar);
      return {
        ariaHidden: el.getAttribute('aria-hidden'),
        position: cs.position, height: parseFloat(cs.height), pe: cs.pointerEvents, z: +cs.z,
        barWidth: parseFloat(bs.width), railWidth: parseFloat(cs.width),
        background: bs.backgroundImage,
        scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth
      };
    });
    c('F01-01', 'rail', 'a decorative 2-3px rail sits at the top of the viewport',
      'fixed, aria-hidden, pointer-events none, 2-3px, gradient',
      !!rail && rail.ariaHidden === 'true' && rail.position === 'fixed' &&
      rail.height >= 2 && rail.height <= 3 && rail.pe === 'none' && /gradient/.test(rail.background),
      rail);

    const headerZ = await page.evaluate(() => {
      const h = document.querySelector('.site-header');
      return h ? +getComputedStyle(h).zIndex : null;
    });
    c('F01-02', 'rail', 'the rail is drawn above the sticky header',
      'rail z-index > header z-index',
      !!rail && (!headerZ || rail.z > headerZ), { railZ: rail && rail.z, headerZ });

    // Scroll to the real middle and compare with the measured position.
    const mid = await scrollToRatio(page, 0.5);
    const midScale = await page.evaluate(() => window.__matrixScaleX('.pv-progress__bar'));
    const midExpected = Math.min(1, Math.max(0, mid.y / mid.max));
    c('F01-03', 'rail', 'the bar follows the real scroll position',
      'scaleX == scrollY / (scrollHeight - innerHeight) within 0.02',
      midScale !== null && Math.abs(midScale - midExpected) <= 0.02,
      { scale: midScale, expected: +midExpected.toFixed(4), y: mid.y, max: mid.max });

    // Bottom of the document.
    const bottom = await scrollToRatio(page, 1);
    const bottomScale = await page.evaluate(() => window.__matrixScaleX('.pv-progress__bar'));
    c('F01-04', 'rail', 'the bar reaches its final value at the end of the document',
      'scaleX >= 0.99 at the bottom',
      bottomScale !== null && bottomScale >= 0.99,
      { scale: bottomScale, y: bottom.y, max: bottom.max });

    c('F01-05', 'rail', 'the bar animates with transform only, never with width',
      'width == rail width and the transform carries the ratio',
      !!rail && Math.abs(rail.barWidth - rail.railWidth) <= 1 && bottomScale > 0.9 &&
      /bar\.style\.transform = "scaleX\(/.test(htmlSrc) && !/pvProgressBar[^\n]*style\.width/.test(htmlSrc),
      { barWidth: rail && rail.barWidth, railWidth: rail && rail.railWidth });

    // ---- resize re-measures
    const beforeResize = await page.evaluate(() => ({ ...window.__scrollInfo(), scale: window.__matrixScaleX('.pv-progress__bar') }));
    await page.setViewport({ width: 1440, height: 560, deviceScaleFactor: 1 });
    await sleep(220);
    const afterResize = await page.evaluate(() => ({ ...window.__scrollInfo(), scale: window.__matrixScaleX('.pv-progress__bar') }));
    const resizeExpected = Math.min(1, Math.max(0, afterResize.y / afterResize.max));
    c('F01-06', 'rail', 'a viewport resize re-measures the bar',
      'scaleX matches the new maximum after the resize',
      Math.abs(afterResize.scale - resizeExpected) <= 0.02 && afterResize.max !== beforeResize.max,
      { before: { max: beforeResize.max, scale: beforeResize.scale }, after: { max: afterResize.max, scale: afterResize.scale, expected: +resizeExpected.toFixed(4) } });
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    await sleep(200);

    // ---- content change re-measures
    const beforeFilter = await scrollToRatio(page, 0.5);
    const beforeScale = await page.evaluate(() => window.__matrixScaleX('.pv-progress__bar'));
    await page.evaluate(() => {
      const input = document.querySelector('#search') || document.querySelector('.collection-search input') || document.querySelector('input[type="search"]');
      input.value = 'Máy ảnh';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await sleep(500);
    const afterFilter = await page.evaluate(() => ({ ...window.__scrollInfo(), scale: window.__matrixScaleX('.pv-progress__bar'), cards: document.querySelectorAll('#grid > .wishlist-card').length }));
    const filterExpected = Math.min(1, Math.max(0, afterFilter.y / afterFilter.max));
    c('F01-07', 'rail', 'a content change re-measures the bar (shorter document, same scroll)',
      'the document shrank and scaleX was re-derived (not left stale)',
      afterFilter.height < beforeFilter.height && Math.abs(afterFilter.scale - filterExpected) <= 0.02 &&
      Math.abs(afterFilter.scale - beforeScale) > 0.05,
      { before: { h: beforeFilter.height, scale: beforeScale }, after: { h: afterFilter.height, scale: afterFilter.scale, expected: +filterExpected.toFixed(4), cards: afterFilter.cards } });

    // ---- no idle work
    await page.evaluate(() => { const i = document.querySelector('#search') || document.querySelector('input[type="search"]'); i.value = ''; i.dispatchEvent(new Event('input', { bubbles: true })); });
    await sleep(600);
    const idleRaf = await page.evaluate(() => window.__rafProbe(700));
    c('F01-08', 'rail', 'a still page schedules no frames at all',
      '0 rAF requests in 700ms of idle time',
      idleRaf === 0, { rafRequests: idleRaf });

    c('F01-09', 'rail', 'no browser errors while driving the rail',
      'clean',
      (state.errors.concat(state.pageErrors)).length === 0, state.errors.concat(state.pageErrors));
    await ctx.close();
  }

  // ===================================================================
  section = 'F01 SCROLL PROGRESS RAIL — REDUCED MOTION';
  // ===================================================================
  {
    const { ctx, page } = await newScenario(browser, ITEMS, { width: 1440, height: 900, reducedMotion: true });
    await scrollToRatio(page, 0.5);
    const info = await page.evaluate(() => {
      const bar = document.getElementById('pvProgressBar');
      const cs = getComputedStyle(bar);
      return { scale: window.__matrixScaleX(bar), transition: cs.transitionProperty + ' ' + cs.transitionDuration, anims: bar.getAnimations().length };
    });
    const at = await page.evaluate(() => window.__scrollInfo());
    c('F01-10', 'rail', 'reduced motion keeps a complete but instant indicator',
      'the bar still tracks the position, with no transition and no animation',
      info.scale !== null && Math.abs(info.scale - Math.min(1, at.y / at.max)) <= 0.02 &&
      /none/.test(info.transition) && info.anims === 0,
      { scale: info.scale, transition: info.transition, anims: info.anims });
    await ctx.close();
  }

  // ===================================================================
  section = 'F02 MARQUEE';
  // ===================================================================
  {
    const { ctx, page, state } = await newScenario(browser, ITEMS, { width: 1440, height: 900 });

    const dom = await page.evaluate(() => {
      const mq = document.querySelector('.pv-marquee');
      if (!mq) return null;
      const groups = [...mq.querySelectorAll('.pv-marquee__group')].map(g => g.textContent.replace(/\s+/g, ' ').trim());
      const hero = document.querySelector('.hero--v9');
      const dash = document.querySelector('.dashboard-panel');
      const position = (el) => { let i = 0, n = el; while (n.previousElementSibling) { n = n.previousElementSibling; i++; } return i; };
      return {
        ariaHidden: mq.getAttribute('aria-hidden'),
        groupCount: groups.length,
        groupsEqual: groups.length === 2 && groups[0] === groups[1],
        text: groups[0] || '',
        words: [...mq.querySelectorAll('.pv-marquee__word')].map(w => w.textContent.trim()),
        seps: mq.querySelectorAll('.pv-marquee__sep').length,
        afterHero: hero.compareDocumentPosition(mq) === Node.DOCUMENT_POSITION_FOLLOWING,
        beforeDashboard: mq.compareDocumentPosition(dash) === Node.DOCUMENT_POSITION_FOLLOWING,
        imgTags: mq.querySelectorAll('img, script, iframe, a').length,
        focusable: mq.querySelectorAll('a, button, input, select, textarea, [tabindex]').length
      };
    });
    c('F02-01', 'marquee', 'one marquee sits in the hero-to-dashboard transition',
      'aria-hidden, positioned after the hero and before the dashboard',
      !!dom && dom.ariaHidden === 'true' && dom.afterHero && dom.beforeDashboard, dom && { ariaHidden: dom.ariaHidden, afterHero: dom.afterHero, beforeDashboard: dom.beforeDashboard });

    c('F02-02', 'marquee', 'the strip carries brand words and no invented statistics',
      'no digits, no currency, no percentage, no image/script/link inside it',
      !!dom && dom.words.length >= 6 && !/[0-9₫%]/.test(dom.text) &&
      dom.words.some(w => /Personal Vault/.test(w)) && dom.words.some(w => /PVault\./.test(w)) &&
      dom.imgTags === 0,
      dom && { words: dom.words, text: dom.text.slice(0, 90) });

    c('F02-03', 'marquee', 'the loop is seamless: two identical groups inside the track',
      'two groups with the same words, so the -50% wrap has no visible seam',
      !!dom && dom.groupCount === 2 && dom.groupsEqual,
      dom && { groups: dom.groupCount, equal: dom.groupsEqual });

    c('F02-04', 'marquee', 'the wrap keyframe and the loop are the only animation on the strip',
      'pv-marquee-scroll ends at translate3d(-50%,0,0) and the shorthand asks for infinite',
      /@keyframes pv-marquee-scroll[\s\S]{0,220}?translate3d\(-50%, 0, 0\)/.test(cssSrc) &&
      /pv-marquee-scroll 48s linear infinite/.test(cssSrc) &&
      (cssSrc.match(/pv-marquee-scroll/g) || []).length === 2, null);

    const marqueeBox = await boxOf(page, '.pv-marquee');
    const t1 = await page.evaluate(() => getComputedStyle(document.querySelector('.pv-marquee__track')).transform);
    await sleep(320);
    const t2 = await page.evaluate(() => getComputedStyle(document.querySelector('.pv-marquee__track')).transform);
    const anims = await page.evaluate(() => window.__anims('.pv-marquee__track'));
    const nums = (m) => (m || 'none').replace(/matrix\(|\)/g, '').split(',').map(parseFloat);
    const moved = Math.abs(nums(t1)[4] - nums(t2)[4]);
    c('F02-05', 'marquee', 'the track moves measurably',
      'the translate changes between two samples and the animation is running + infinite',
      moved > 1 && anims && anims.length === 1 && anims[0].state === 'running' && anims[0].iterInfinite === true,
      { pxMoved: +moved.toFixed(1), anims });

    // ---- hover pause
    await page.evaluate(() => document.querySelector('.pv-marquee').scrollIntoView({ block: 'center', behavior: 'instant' }));
    await sleep(160);
    const mqBox = await boxOf(page, '.pv-marquee');
    await page.mouse.move(mqBox.x + mqBox.w / 2, mqBox.y + mqBox.h / 2);
    await sleep(160);
    const hoverState = await page.evaluate(() => ({
      playState: getComputedStyle(document.querySelector('.pv-marquee__track')).animationPlayState,
      live: (document.querySelector('.pv-marquee__track').getAnimations()[0] || {}).playState || null
    }));
    const h1 = await page.evaluate(() => getComputedStyle(document.querySelector('.pv-marquee__track')).transform);
    await sleep(400);
    const h2 = await page.evaluate(() => getComputedStyle(document.querySelector('.pv-marquee__track')).transform);
    c('F02-06', 'marquee', 'it pauses while the pointer hovers it',
      'animation-play-state paused and the transform stops changing',
      hoverState.playState === 'paused' && h1 === h2,
      { playState: hoverState.playState, live: hoverState.live, frozen: h1 === h2 });
    await page.mouse.move(4, 4);
    await sleep(200);

    // ---- keyboard focus pause
    await page.keyboard.press('Tab');
    await sleep(200);
    const focusState = await page.evaluate(() => ({
      playState: getComputedStyle(document.querySelector('.pv-marquee__track')).animationPlayState,
      hasFocusVisible: !!document.querySelector(':focus-visible')
    }));
    c('F02-07', 'marquee', 'keyboard focus freezes the strip',
      ':focus-visible matches after Tab and the track is paused',
      focusState.hasFocusVisible && focusState.playState === 'paused', focusState);

    // ---- hidden tab (integration with the app's own pv-fx-hidden switch)
    const hidden = await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
      return {
        root: document.documentElement.classList.contains('pv-fx-hidden'),
        playState: getComputedStyle(document.querySelector('.pv-marquee__track')).animationPlayState
      };
    });
    c('F02-08', 'marquee', 'a hidden tab pauses the strip through the app own switch',
      'html.pv-fx-hidden plus animation-play-state paused',
      hidden.root && hidden.playState === 'paused', hidden);
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    await sleep(150);

    // ---- motion-lite
    const lite = await page.evaluate(() => {
      document.documentElement.classList.add('motion-lite');
      const s = getComputedStyle(document.querySelector('.pv-marquee__track')).animationPlayState;
      document.documentElement.classList.remove('motion-lite');
      return s;
    });
    c('F02-09', 'marquee', 'the evidence-based motion-lite budget also pauses it',
      'html.motion-lite -> paused',
      lite === 'paused', { playState: lite });

    c('F02-10', 'marquee', 'no listener or animation cleanup problem on the strip',
      'no console/page errors driving the pause states',
      (state.errors.concat(state.pageErrors)).length === 0, state.errors.concat(state.pageErrors));
    await ctx.close();
  }

  // ===================================================================
  section = 'F02 MARQUEE — REDUCED MOTION + TOUCH';
  // ===================================================================
  {
    const { ctx, page } = await newScenario(browser, ITEMS, { width: 1440, height: 900, reducedMotion: true });
    const rm = await page.evaluate(() => {
      const track = document.querySelector('.pv-marquee__track');
      const groups = [...document.querySelectorAll('.pv-marquee__group')];
      const cs = getComputedStyle(track);
      return {
        animation: cs.animationName,
        anims: track.getAnimations().length,
        groupsDisplay: groups.map(g => getComputedStyle(g).display),
        words: document.querySelectorAll('.pv-marquee__word').length,
        exists: !!document.querySelector('.pv-marquee')
      };
    });
    c('F02-11', 'marquee', 'reduced motion resolves the strip to a static, complete presentation',
      'no animation, the duplicate group hidden, the words still present',
      rm.exists && rm.animation === 'none' && rm.anims === 0 &&
      rm.groupsDisplay.filter(d => d !== 'none').length === 1 && rm.words >= 6,
      rm);

    const t1 = await page.evaluate(() => getComputedStyle(document.querySelector('.pv-marquee__track')).transform);
    await sleep(350);
    const t2 = await page.evaluate(() => getComputedStyle(document.querySelector('.pv-marquee__track')).transform);
    c('F02-12', 'marquee', 'reduced motion really is static (no motion at all)',
      'the transform does not change over time',
      t1 === t2, { t1, t2 });
    await ctx.close();

    const touch = await newScenario(browser, ITEMS, { touch: true, width: 390, height: 844 });
    const tm = await touch.page.evaluate(() => {
      const track = document.querySelector('.pv-marquee__track');
      return {
        exists: !!document.querySelector('.pv-marquee'),
        playState: getComputedStyle(track).animationPlayState,
        overflow: document.documentElement.scrollWidth - window.innerWidth
      };
    });
    c('F02-13', 'marquee', 'the strip is present on mobile with no horizontal overflow',
      'exists, no overflow at 390px',
      tm.exists && tm.overflow <= 0, tm);
    await touch.ctx.close();
  }

  // ===================================================================
  section = 'F03 EDITORIAL TYPOGRAPHY';
  // ===================================================================
  {
    const { ctx, page, state } = await newScenario(browser, ITEMS, { width: 1440, height: 900 });

    const ghosts = await page.evaluate(() => [...document.querySelectorAll('.pv-ghost')].map(g => ({
      cls: g.className,
      text: g.textContent.trim(),
      ariaHidden: g.getAttribute('aria-hidden'),
      display: getComputedStyle(g).display,
      z: +getComputedStyle(g).zIndex,
      pe: getComputedStyle(g).pointerEvents,
      fontSize: getComputedStyle(g).fontSize,
      parent: g.parentElement.className.split(' ')[0]
    })));
    c('F03-01', 'typography', 'two dashed-off oversized ghost words exist, desktop only',
      '2 aria-hidden ghosts with brand words, display block at 1440px',
      ghosts.length === 2 && ghosts.every(g => g.ariaHidden === 'true' && g.display === 'block' && g.text.length > 2),
      ghosts);
    c('F03-02', 'typography', 'they are decorative copies only, never the prototype branding',
      'no PVault/Personal Vault duplication and no digits inside the ghost words',
      ghosts.every(g => !/Personal Vaul|PVault/.test(g.text)) && !ghosts.some(g => /[0-9]/.test(g.text)),
      ghosts.map(g => g.text));
    c('F03-03', 'typography', 'they paint behind their heading and can never intercept a control',
      'z-index -1 inside a positioned heading, pointer-events none',
      ghosts.length === 2 && ghosts.every(g => g.z === -1 && g.pe === 'none'), ghosts.map(g => ({ z: g.z, pe: g.pe })));

    const hitAdd = await hitTestAt(page, '#dvAddItem');
    const hitTitle = await hitTestAt(page, '.overview-heading__title');
    c('F03-04', 'typography', 'a real hit test on the dashboard button and title still reaches them',
      'elementFromPoint returns the control, not the ghost',
      hitAdd.ok && hitAdd.inside && hitTitle.ok && hitTitle.inside, { hitAdd, hitTitle });

    // Readability pixel proof. Two frames are compared with the ghost ON vs
    // OFF, but only once the page is PROVEN still: the reveal runtime
    // translates this heading while .dv-reveal-in is present, and a frame
    // captured inside that window shifts the whole region (measured: >95% of
    // pixels changing, strongest delta 216/255) — that would measure the
    // entrance, not the ghost. So: wait for rest, then require two
    // consecutive captures to be byte-identical before trusting the third.
    await page.evaluate(() => document.querySelector('.overview-heading__title').scrollIntoView({ block: 'center', behavior: 'instant' }));
    await page.waitForFunction(() => {
      const p = document.querySelector('.dashboard-panel');
      const t = document.querySelector('.overview-heading__title');
      return !p.classList.contains('dv-reveal-in') && t.getAnimations().length === 0 && getComputedStyle(t).transform === 'none';
    }, { timeout: 5000 }).catch(() => {});
    await sleep(200);

    const boxes = await page.evaluate(() => {
      const g = document.querySelector('.pv-ghost--dash');
      const t = document.querySelector('.overview-heading__title');
      const gb = g.getBoundingClientRect(), tb = t.getBoundingClientRect();
      const m = getComputedStyle(g).color.match(/rgba?\(([^)]+)\)/);
      const parts = m ? m[1].split(',').map(s => parseFloat(s)) : [];
      // The ghost's OWN box, clipped to the viewport: that is where its ink
      // can actually paint, and the area stays small enough that a 5.5%-alpha
      // layer still moves real pixels.
      const gx = Math.max(0, gb.left), gy = Math.max(0, gb.top);
      const gx2 = Math.min(window.innerWidth, gb.right), gy2 = Math.min(window.innerHeight, gb.bottom);
      return {
        ghost: { x: Math.round(gb.left), y: Math.round(gb.top), w: Math.round(gb.width), h: Math.round(gb.height) },
        title: { x: Math.round(tb.left), y: Math.round(tb.top), w: Math.round(tb.width), h: Math.round(tb.height) },
        ghostRegion: { x: gx, y: gy, w: Math.max(1, gx2 - gx), h: Math.max(1, gy2 - gy) },
        alpha: parts.length === 4 ? parts[3] : 1
      };
    });
    const region = boxes.ghostRegion;

    let still = null, stillDelta = null;
    for (let attempt = 0; attempt < 4 && !still; attempt++) {
      const a = await shotPng(page);
      const b = await shotPng(page);
      const s = diffRegion(a, b, region);
      if (s.max === 0) { still = a; stillDelta = s; } else { await sleep(220); }
    }
    const offPng = await withStyle(page, '.pv-ghost{display:none !important}', () => shotPng(page));
    const diff = still ? diffRegion(still, offPng, region) : { changed: -1, max: -1, mean: -1, pixels: -1 };
    c('F03-05', 'typography', 'the ghost really paints, but its ink stays far too weak to affect reading',
      'two idle frames are identical first (so the page is provably still), then the ghost paints (>= 200 pixels change) while its strongest pixel change stays <= 40/255 and its declared ink is <= 8% alpha',
      still !== null && diff.changed >= 200 && diff.max <= 40 && boxes.alpha <= 0.08,
      { idleFramesIdentical: still !== null, stillDelta, changedPixels: diff.changed, strongestPixelDelta: diff.max, meanDelta: diff.mean, sampledPixels: diff.pixels, alpha: boxes.alpha, region: { x: Math.round(region.x), y: Math.round(region.y), w: Math.round(region.w), h: Math.round(region.h) }, ghost: boxes.ghost, title: boxes.title });

    c('F03-06', 'typography', 'FUSION-02 adds no second reveal observer',
      'the sheet constructs no IntersectionObserver and only keys off .dv-reveal-in',
      !/new\s+IntersectionObserver/.test(cssSrc) && /\.dv-reveal-in/.test(cssSrc), null);

    const noObs = await page.evaluate(() => ({
      sections: document.querySelectorAll('[data-dv-section]').length,
      pending: document.querySelectorAll('[data-dv-reveal]').length
    }));
    c('F03-07', 'typography', 'the existing reveal inventory is untouched',
      'the section/card reveal runtime still owns its own markers',
      noObs.sections >= 1 && noObs.pending >= 1, noObs);

    await ctx.close();
    {
      // ---- entrance is keyed to the existing reveal, on a viewport short
      // enough that the dashboard is definitely below the fold first.
      const s2 = await newScenario(browser, ITEMS, { width: 1440, height: 560 });
      const before = await s2.page.evaluate(() => {
        const panel = document.querySelector('.dashboard-panel');
        const title = document.querySelector('.overview-heading__title');
        return {
          revealed: panel.classList.contains('dv-reveal-in'),
          hasMarker: panel.hasAttribute('data-dv-reveal'),
          panelY: Math.round(panel.getBoundingClientRect().top),
          innerHeight: window.innerHeight,
          anims: window.__anims('.overview-heading__title'),
          transform: getComputedStyle(title).transform
        };
      });
      await s2.page.evaluate(() => document.querySelector('.dashboard-panel').scrollIntoView({ block: 'start', behavior: 'instant' }));
      await sleep(90);
      const during = await s2.page.evaluate(() => ({
        revealed: document.querySelector('.dashboard-panel').classList.contains('dv-reveal-in'),
        anims: window.__anims('.overview-heading__title'),
        transform: getComputedStyle(document.querySelector('.overview-heading__title')).transform,
        eyebrow: getComputedStyle(document.querySelector('.overview-heading__eyebrow')).transform
      }));
      await sleep(1400);
      const after = await s2.page.evaluate(() => ({
        revealed: document.querySelector('.dashboard-panel').classList.contains('dv-reveal-in'),
        settled: document.querySelector('.dashboard-panel').hasAttribute('data-dv-reveal') === false,
        anims: window.__anims('.overview-heading__title'),
        transform: getComputedStyle(document.querySelector('.overview-heading__title')).transform,
        opacity: +getComputedStyle(document.querySelector('.overview-heading__title')).opacity
      }));
      const names = (during.anims || []).map(a => a.name);
      c('F03-08', 'typography', 'the heading entrance only starts when the EXISTING reveal fires',
        'not revealed before entry, then pv-head-in runs as a child of dv-reveal-in',
        before.revealed === false && before.hasMarker === true && during.revealed === true &&
        names.includes('pv-head-in'),
        { before: before.revealed, marker: before.hasMarker, during: names });
      c('F03-09', 'typography', 'the entrance is transform-only and settles back to the resolved state',
        'translate while running, identity transform and full opacity once settled',
        during.transform !== 'none' && after.transform === 'none' && after.opacity === 1 && after.revealed === false,
        { during: during.transform, after: after.transform, opacity: after.opacity });

      // The depth rides on the ROOT scroll timeline (see the sheet header:
      // view() is pinned for anything inside the overflow:hidden dashboard
      // panel). Two far-apart scroll positions are sampled, because the
      // travel is deliberately spread over the whole document.
      const drift = await s2.page.evaluate(() => {
        const g = document.querySelector('.pv-ghost--dash');
        const a = g.getAnimations()[0];
        return {
          supported: CSS.supports('animation-timeline: scroll()'),
          anims: g.getAnimations().map(x => ({ name: x.animationName, timeline: x.timeline ? x.timeline.constructor.name : 'none', state: x.playState })),
          range: getComputedStyle(g).animationRange,
          docHeight: document.documentElement.scrollHeight
        };
      });
      await s2.page.evaluate(() => window.scrollTo(0, 600));
      await sleep(220);
      const driftA = await s2.page.evaluate(() => getComputedStyle(document.querySelector('.pv-ghost--dash')).transform);
      await s2.page.evaluate(() => window.scrollTo(0, 2200));
      await sleep(220);
      const driftB = await s2.page.evaluate(() => getComputedStyle(document.querySelector('.pv-ghost--dash')).transform);
      c('F03-10', 'typography', 'the ghost keeps a real scroll-linked depth (root scroll timeline)',
        'a ScrollTimeline animation exists, is active, and its transform changes with the scroll position',
        drift.supported
          ? (drift.anims.some(a => a.name === 'pv-ghost-drift' && a.timeline === 'ScrollTimeline' && a.state === 'running') && driftA !== driftB)
          : true,
        { supported: drift.supported, anims: drift.anims, range: drift.range, a: driftA, b: driftB });

      // Same mechanism for the savings heading, which lives in the same
      // pinned panel as the ghost word.
      const savingsDrift = await s2.page.evaluate(() => {
        const el = document.querySelector('.dv-savings__title');
        return el.getAnimations().map(a => ({ name: a.animationName, timeline: a.timeline ? a.timeline.constructor.name : 'none', state: a.playState }));
      });
      await s2.page.evaluate(() => window.scrollTo(0, 900));
      await sleep(220);
      const sd1 = await s2.page.evaluate(() => getComputedStyle(document.querySelector('.dv-savings__title')).transform);
      await s2.page.evaluate(() => window.scrollTo(0, 2500));
      await sleep(220);
      const sd2 = await s2.page.evaluate(() => getComputedStyle(document.querySelector('.dv-savings__title')).transform);
      c('F03-11', 'typography', 'the savings heading carries the same scroll-linked depth',
        'pv-savings-in runs on the root scroll timeline and its transform changes with the scroll',
        drift.supported ? (savingsDrift.some(a => a.name === 'pv-savings-in' && a.timeline === 'ScrollTimeline') && sd1 !== sd2) : true,
        { anims: savingsDrift, a: sd1, b: sd2 });

      // Mobile: ghost typography must be gone, the heading must stay readable.
      await s2.page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
      await sleep(320);
      const mobile = await s2.page.evaluate(() => ({
        display: getComputedStyle(document.querySelector('.pv-ghost--dash')).display,
        overflow: document.documentElement.scrollWidth - window.innerWidth
      }));
      c('F03-12', 'typography', 'below 1025px the ghost words are dropped entirely',
        'display none at 390px, no horizontal overflow',
        mobile.display === 'none' && mobile.overflow <= 0, mobile);
      await s2.ctx.close();
    }
  }

  // ===================================================================
  section = 'F04 LIVING DASHBOARD';
  // ===================================================================
  {
    // Short viewport on purpose: the dashboard panel is still below the fold
    // when the page finishes loading, so the reveal (and its rail light) has
    // not fired yet and can be observed from its real start.
    const { ctx, page, state } = await newScenario(browser, ITEMS, { width: 1440, height: 560 });

    const railLight = await page.evaluate(() => {
      const head = document.querySelector('.overview-heading');
      const cs = getComputedStyle(head, '::before');
      return {
        content: cs.content, height: cs.height, position: cs.position, pe: cs.pointerEvents,
        opacity: cs.opacity, revealed: document.querySelector('.dashboard-panel').classList.contains('dv-reveal-in')
      };
    });
    c('F04-01', 'dashboard', 'the heading carries a one-shot light rail (resting state invisible)',
      'a ::before exists, is positioned, pointer-events none, rests at opacity 0 and is not yet animating',
      railLight.content !== 'none' && railLight.position === 'absolute' &&
      railLight.pe === 'none' && parseFloat(railLight.opacity) === 0 && railLight.revealed === false,
      railLight);

    await page.evaluate(() => document.querySelector('.dashboard-panel').scrollIntoView({ block: 'start', behavior: 'instant' }));
    await sleep(90);
    // The rail light lives on a PSEUDO-ELEMENT, so it only appears in
    // document.getAnimations() — element.getAnimations() omits it. Its
    // progress is proven the same way: two computed-pseudostyle samples.
    const railPseudoA = await page.evaluate(() => {
      const cs = getComputedStyle(document.querySelector('.overview-heading'), '::before');
      return { opacity: +cs.opacity, transform: cs.transform };
    });
    const railAnim = await page.evaluate(() => window.__docAnims().filter(a => a.name === 'pv-rail-light'));
    await sleep(420);
    const railPseudoB = await page.evaluate(() => {
      const cs = getComputedStyle(document.querySelector('.overview-heading'), '::before');
      return { opacity: +cs.opacity, transform: cs.transform };
    });
    c('F04-02', 'dashboard', 'the rail light runs exactly once, when the dashboard reveals',
      'pv-rail-light is running on the heading pseudo, it is finite, and its opacity/scale really advance',
      railAnim.length >= 1 && railAnim.every(a => a.iterInfinite === false) && railAnim.some(a => a.state === 'running') &&
      (railPseudoA.opacity !== railPseudoB.opacity || railPseudoA.transform !== railPseudoB.transform),
      { anims: railAnim, a: railPseudoA, b: railPseudoB });

    await sleep(1300);
    const railDone = await page.evaluate(() => {
      const list = window.__docAnims().filter(a => a.name === 'pv-rail-light');
      const cs = getComputedStyle(document.querySelector('.overview-heading'), '::before');
      return {
        total: list.length,
        running: list.filter(a => a.state === 'running').length,
        states: list.map(a => a.state),
        revealed: document.querySelector('.dashboard-panel').classList.contains('dv-reveal-in'),
        opacity: cs.opacity,
        transform: cs.transform
      };
    });
    c('F04-03', 'dashboard', 'the rail light is gone once it has run (no loop, no residue)',
      'nothing is still RUNNING, the pseudo is back to opacity 0 and no residual scale is left',
      railDone.running === 0 && railDone.revealed === false && parseFloat(railDone.opacity) === 0,
      railDone);

    c('F04-04', 'dashboard', 'no browser errors while driving the dashboard reveal',
      'clean', (state.errors.concat(state.pageErrors)).length === 0, state.errors.concat(state.pageErrors));
    await ctx.close();
  }

  // ===================================================================
  section = 'F04 LIVING DASHBOARD — HOVER, TOUCH, SAVINGS, SOURCE';
  // ===================================================================
  {
    // Comments are stripped before any source-effect gate: the sheet's own
    // header discusses the effects it rules OUT ("no backdrop-filter"), and
    // a naive regex would read the documentation as a violation.
    const cssCode = cssSrc.replace(/\/\*[\s\S]*?\*\//g, '');
    const { ctx, page } = await newScenario(browser, ITEMS, { width: 1440, height: 900 });
    await page.evaluate(() => document.querySelector('.stats-dashboard').scrollIntoView({ block: 'center', behavior: 'instant' }));
    await sleep(320);

    const card = await boxOf(page, '.stats-dashboard > .stat-card');
    await page.mouse.move(card.x + card.w / 2, card.y + card.h / 2);
    await sleep(420);
    const hovered = await page.evaluate(() => {
      const el = document.querySelector('.stats-dashboard > .stat-card');
      const cs = getComputedStyle(el);
      const m = (cs.transform || 'none').replace(/matrix\(|\)/g, '').split(',').map(parseFloat);
      return { transform: cs.transform, ty: m.length === 6 ? m[5] : 0, shadow: cs.boxShadow, border: cs.borderColor };
    });
    c('F04-05', 'dashboard', 'the stat card keeps the elevation the dashboard already owned',
      'the card still lifts on hover (ty < 0) with a shadow, and the new sheet adds NO transform for it',
      hovered.ty < 0 && /rgba?\(/.test(hovered.shadow) &&
      !/\.stat-card[^{]*\{[^}]*transform\s*:/.test(cssCode),
      { ...hovered, sheetTransform: /\.stat-card[^{]*\{[^}]*transform\s*:/.test(cssCode) });

    await page.mouse.move(4, 4);
    await sleep(420);
    const rested = await page.evaluate(() => {
      const cs = getComputedStyle(document.querySelector('.stats-dashboard > .stat-card'));
      const m = (cs.transform || 'none').replace(/matrix\(|\)/g, '').split(',').map(parseFloat);
      return { transform: cs.transform, ty: m.length === 6 ? m[5] : 0 };
    });
    c('F04-06', 'dashboard', 'the elevation is a hover response only (resolved state is flat)',
      'transform back to identity when the pointer leaves',
      rested.transform === 'none' || rested.ty === 0, rested);

    // ---- active savings rows: refined border + light, no transform owner
    await page.evaluate(() => { const r = document.querySelector('.dv-savings__row'); if (r) r.scrollIntoView({ block: 'center', behavior: 'instant' }); });
    await sleep(320);
    const rowBox = await boxOf(page, '.dv-savings__row');
    const rowRest = await page.evaluate(() => {
      const cs = getComputedStyle(document.querySelector('.dv-savings__row'));
      return { shadow: cs.boxShadow, border: cs.borderColor };
    });
    await page.mouse.move(rowBox.x + rowBox.w / 2, rowBox.y + rowBox.h / 2);
    await sleep(460);
    const rowHover = await page.evaluate(() => {
      const cs = getComputedStyle(document.querySelector('.dv-savings__row'));
      return { shadow: cs.boxShadow, border: cs.borderColor, transition: cs.transitionProperty };
    });
    c('F04-11', 'dashboard', 'the active savings rows gain a refined border and light on hover',
      'shadow + border change on hover, a box-shadow transition is declared, and no transform is re-declared',
      rowRest.shadow !== rowHover.shadow && rowRest.border !== rowHover.border &&
      /box-shadow/.test(rowHover.transition) &&
      !/\.dv-savings__row[^{]*\{[^}]*transform\s*:/.test(cssCode),
      { rest: rowRest, hover: rowHover });
    await page.mouse.move(4, 4);

    const meters = await page.evaluate(() => {
      const read = (id) => {
        const el = document.getElementById(id);
        const cs = getComputedStyle(el);
        const m = (cs.transform || 'none').replace(/matrix\(|\)/g, '').split(',').map(parseFloat);
        return { shadow: cs.boxShadow, transform: cs.transform, scaleX: m.length === 6 ? m[0] : null, fillVar: cs.getPropertyValue('--dv-fill').trim() };
      };
      return { savings: read('dvSavingsBarFill'), ownership: read('dvProgressFill'), rows: document.querySelectorAll('.dv-savings__row').length };
    });
    c('F04-07', 'dashboard', 'both meters keep their own progress owner and only gain light',
      'the savings fill still scales by --dv-fill, never by a transform of ours, and both fills carry the new inset light',
      meters.rows >= 1 && /rgba/.test(meters.savings.shadow) && /rgba/.test(meters.ownership.shadow) &&
      (!meters.savings.fillVar || meters.savings.scaleX === null ||
        Math.abs(meters.savings.scaleX - parseFloat(meters.savings.fillVar)) < 0.002) &&
      !/\.dv-(savings__bar|progress)__fill[^{]*\{[^}]*transform\s*:/.test(cssCode),
      meters);

    c('F04-08', 'dashboard', 'the new sheet avoids the expensive effects the brief rules out',
      'no backdrop-filter, no blur(), no width-animated progress rail, only the marquee loops',
      !/backdrop-filter/.test(cssCode) && !/blur\(/.test(cssCode) &&
      (cssCode.match(/infinite/g) || []).length <= 1 &&
      !/\.pv-progress__bar\s*\{[^}]*width:\s*0/.test(cssCode),
      { infinite: (cssCode.match(/infinite/g) || []).length });

    c('F04-09', 'dashboard', 'the sheet documents its ownership limits',
      'header mentions ownership, bounded rAF, no backdrop-filter and the motion gates',
      /OWNERSHIP MAP/i.test(cssSrc) && /bounded/i.test(cssSrc) && /aria-hidden/.test(cssSrc) && /motion-lite/.test(cssSrc),
      null);
    await ctx.close();

    const touch = await newScenario(browser, ITEMS, { touch: true, width: 390, height: 844 });
    await touch.page.evaluate(() => document.querySelector('.stats-dashboard').scrollIntoView({ block: 'center', behavior: 'instant' }));
    await sleep(300);
    const tbox = await boxOf(touch.page, '.stats-dashboard > .stat-card');
    await touch.page.touchscreen.tap(tbox.x + tbox.w / 2, tbox.y + tbox.h / 2);
    await sleep(420);
    const touchCard = await touch.page.evaluate(() => {
      const card = document.querySelector('.stats-dashboard > .stat-card');
      const row = document.querySelector('.dv-savings__row');
      return {
        transform: getComputedStyle(card).transform,
        rowTransform: row ? getComputedStyle(row).transform : 'none'
      };
    });
    c('F04-10', 'dashboard', 'a touch device never gets the hover-only dashboard response',
      'after a tap the stat card and the savings row are still flat, and the new rules sit behind a hover media query',
      touchCard.transform === 'none' && touchCard.rowTransform === 'none' &&
      /@media \(hover: hover\) and \(pointer: fine\)/.test(cssCode), touchCard);
    await touch.ctx.close();
  }

  // ===================================================================
  section = 'F05 GALLERY IMAGE SHEEN';
  // ===================================================================
  {
    const { ctx, page, state } = await newScenario(browser, ITEMS, { width: 1440, height: 900 });

    const sheens = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('#grid > .wishlist-card')];
      return {
        cards: cards.length,
        sheens: cards.map(card => {
          const frame = card.querySelector('.product-media__frame');
          const nodes = frame ? frame.querySelectorAll('.pv-sheen') : [];
          const el = nodes[0];
          return {
            count: nodes.length,
            ariaHidden: el ? el.getAttribute('aria-hidden') : null,
            inFrame: !!el && el.parentElement === frame,
            pe: el ? getComputedStyle(el).pointerEvents : null,
            willChange: el ? getComputedStyle(el).willChange : null,
            opacity: el ? +getComputedStyle(el).opacity : null
          };
        })
      };
    });
    c('F05-01', 'sheen', 'every grid card gained exactly one decorative sheen inside its media frame',
      'one aria-hidden .pv-sheen per card, inside .product-media__frame, pointer-events none, no will-change',
      sheens.cards >= 5 && sheens.sheens.every(s => s.count === 1 && s.ariaHidden === 'true' && s.inFrame && s.pe === 'none' && (s.willChange === 'auto' || s.willChange === 'none')),
      { cards: sheens.cards, sample: sheens.sheens[0] });

    c('F05-02', 'sheen', 'no permanent will-change is declared for the cards (source)',
      'the sheet contains no will-change for cards and selects only .pv-sheen for its effects',
      !/will-change/.test(cssSrc) && /\.pv-sheen\b/.test(cssSrc), null);

    // Deterministic pixel proof: the sweep layer really paints, and it is
    // a subtle light rather than a white flash.
    await page.evaluate(() => document.querySelector('#grid > .wishlist-card').scrollIntoView({ block: 'center', behavior: 'instant' }));
    await sleep(500);
    const mediaBox = await page.evaluate(() => {
      const frame = document.querySelector('#grid > .wishlist-card .product-media__frame');
      const b = frame.getBoundingClientRect();
      return { x: Math.round(b.left) + 2, y: Math.round(b.top) + 2, w: Math.round(b.width) - 4, h: Math.round(b.height) - 4 };
    });
    const sheenOff = await withStyle(page, '.pv-sheen{display:none !important}', () => regionMean(page, mediaBox));
    const sheenOn = await withStyle(page,
      '.pv-sheen{opacity:1 !important; transition:none !important}' +
      '.pv-sheen::before{transition:none !important; transform:translate3d(120%,0,0) rotate(6deg) !important}',
      () => regionMean(page, mediaBox));
    const sheenDelta = meanDelta(sheenOn, sheenOff);
    c('F05-03', 'sheen', 'the sweep layer is really painted, and it is a subtle light (pixel proof)',
      'pixel delta with the layer mid-sweep is > 1 and < 40',
      sheenDelta > 1 && sheenDelta < 40,
      { delta: +sheenDelta.toFixed(2), on: sheenOn.map(v => +v.toFixed(1)), off: sheenOff.map(v => +v.toFixed(1)) });

    // Desktop hover: it rises and the band sweeps.
    const cardBox = await page.evaluate(() => {
      const card = document.querySelector('#grid > .wishlist-card');
      const b = card.getBoundingClientRect();
      return { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height * 0.3) };
    });
    await page.mouse.move(cardBox.x, cardBox.y);
    await sleep(200);
    const hoverA = await page.evaluate(() => {
      const el = document.querySelector('#grid > .wishlist-card .pv-sheen');
      return { opacity: +getComputedStyle(el).opacity, band: getComputedStyle(el, '::before').transform };
    });
    await sleep(260);
    const hoverB = await page.evaluate(() => getComputedStyle(document.querySelector('#grid > .wishlist-card .pv-sheen'), '::before').transform);
    c('F05-04', 'sheen', 'on a hover-capable desktop the layer rises and the band sweeps',
      'opacity 1 while hovered and the band transform advances',
      hoverA.opacity === 1 && hoverA.band !== hoverB && hoverA.band !== 'none',
      { opacity: hoverA.opacity, bandA: hoverA.band, bandB: hoverB });

    // The sheen is a separate visual layer: it owns no transform on the card
    // and no transform-declaring rule of this sheet reaches the card surface
    // or the media frame except through .pv-sheen.
    const sheenOwn = await page.evaluate(() => {
      const el = document.querySelector('#grid > .wishlist-card .pv-sheen');
      return {
        sheenTransform: el ? getComputedStyle(el).transform : null,
        sheenZ: el ? +getComputedStyle(el).zIndex : null,
        surfaceTransform: getComputedStyle(document.querySelector('#grid > .wishlist-card .wishlist-card__surface')).transform
      };
    });
    const cssCode5 = cssSrc.replace(/\/\*[\s\S]*?\*\//g, '');
    const transformBlocks = (cssCode5.match(/[^{}]+\{[^{}]*\}/g) || [])
      .filter(b => /transform\s*:/.test(b) && /\.wishlist-card|\.product-media|\.thumb\b/.test(b.split('{')[0]));
    const foreign = transformBlocks.filter(b => !/\.pv-sheen/.test(b.split('{')[0]));
    c('F05-05', 'sheen', 'the sheen is a separate layer and never takes over the card transform',
      'the .pv-sheen node itself is untransformed on hover, and every transform-declaring rule that mentions the card/media is scoped to .pv-sheen',
      sheenOwn.sheenTransform === 'none' && foreign.length === 0,
      { sheenTransform: sheenOwn.sheenTransform, foreignRules: foreign, scoped: transformBlocks.length });
    await page.mouse.move(4, 4);

    c('F05-06', 'sheen', 'no browser errors while exercising the gallery layer',
      'clean', (state.errors.concat(state.pageErrors)).length === 0, state.errors.concat(state.pageErrors));
    await ctx.close();

    // Touch / reduced motion: it must never appear.
    const touch = await newScenario(browser, ITEMS, { touch: true, width: 390, height: 844 });
    await touch.page.evaluate(() => document.querySelector('#grid > .wishlist-card').scrollIntoView({ block: 'center', behavior: 'instant' }));
    await sleep(300);
    const tSheen = await touch.page.evaluate(() => {
      const el = document.querySelector('#grid > .wishlist-card .pv-sheen');
      return { opacity: +getComputedStyle(el).opacity, exists: !!el };
    });
    c('F05-07', 'sheen', 'a touch device never shows the sweep',
      'the layer exists but stays at opacity 0',
      tSheen.exists && tSheen.opacity === 0, tSheen);
    await touch.ctx.close();

    const rm = await newScenario(browser, ITEMS, { width: 1440, height: 900, reducedMotion: true });
    await rm.page.evaluate(() => document.querySelector('#grid > .wishlist-card').scrollIntoView({ block: 'center', behavior: 'instant' }));
    await sleep(300);
    const rmSheen = await rm.page.evaluate(() => {
      const el = document.querySelector('#grid > .wishlist-card .pv-sheen');
      return { display: getComputedStyle(el).display, opacity: +getComputedStyle(el).opacity };
    });
    c('F05-08', 'sheen', 'reduced motion removes the sweep entirely',
      'display none and opacity 0',
      rmSheen.display === 'none' && rmSheen.opacity === 0, rmSheen);
    await rm.ctx.close();
  }

  // ===================================================================
  section = 'F06 REGRESSION + ADAPTIVE MOTION';
  // ===================================================================
  {
    const { ctx, page, state } = await newScenario(browser, ITEMS, { width: 1440, height: 900 });

    // --- Gallery / Focus FLIP
    // The collection view state lives on #grid.dataset.v13View (not as a
    // class on the canvas), and the restore control is #v13GridView.
    const flip = await page.evaluate(async () => {
      const ids = () => [...document.querySelectorAll('#grid > .wishlist-card')].map(c => c.dataset.id).join(',');
      const view = () => document.getElementById('grid').dataset.v13View;
      const before = ids();
      const beforeView = view();
      document.getElementById('v13FocusView').click();
      await new Promise(r => setTimeout(r, 700));
      const focusedView = view();
      const focusedIds = ids();
      document.getElementById('v13GridView').click();
      await new Promise(r => setTimeout(r, 700));
      return { before, after: ids(), beforeView, focusedView, focusedIds, restoredView: view(), cards: document.querySelectorAll('#grid > .wishlist-card').length };
    });
    c('F06-01', 'regression', 'Gallery/Focus FLIP still works with the new sheen layers in place',
      'the view switches to focus and back, and the same cards survive the round-trip',
      flip.beforeView !== 'focus' && flip.focusedView === 'focus' && flip.restoredView !== 'focus' &&
      flip.before === flip.after && flip.before === flip.focusedIds && flip.cards >= 5,
      flip);

    // --- Quick View flight + close, opened through the card's own menu
    const qv = await page.evaluate(async () => {
      const card = document.querySelector('#grid > .wishlist-card[data-id="a5"]');
      card.scrollIntoView({ block: 'center', behavior: 'instant' });
      await new Promise(r => setTimeout(r, 260));
      const trig = card.querySelector('.card-more__trigger');
      if (!trig) return { err: 'no card menu trigger' };
      trig.click();
      await new Promise(r => setTimeout(r, 420));
      const view = card.querySelector('[data-card-action="view"]');
      if (!view) return { err: 'no view action', actions: [...card.querySelectorAll('[data-card-action]')].map(a => a.dataset.cardAction) };
      view.click();
      await new Promise(r => setTimeout(r, 620));
      const opened = document.getElementById('qv').open === true;
      const title = (document.getElementById('qvTitle') || {}).textContent || '';
      document.getElementById('qvClose').click();
      await new Promise(r => setTimeout(r, 520));
      return { opened, title, closed: document.getElementById('qv').open === false };
    });
    c('F06-02', 'regression', 'Quick View still opens and closes over the new layers',
      'the dialog opens with the right item and closes again',
      qv.opened === true && qv.closed === true && /Ống kính/.test(qv.title || ''), qv);

    // --- Board + purchase confirmation (a REAL data change, through the
    // confirmation dialog the app requires: "purchased" never writes directly)
    const board = await page.evaluate(async () => {
      document.getElementById('v13BoardView').click();
      await new Promise(r => setTimeout(r, 600));
      const board = document.getElementById('board');
      const cols = board.querySelectorAll('.board__column').length;
      const cards = board.querySelectorAll('.board__card').length;
      const handles = board.querySelectorAll('.board__handle').length;
      const select = board.querySelector('select[data-status-select="a2"]');
      const out = { cols, cards, handles, boardHidden: board.classList.contains('hidden'), openedPd: false, statusAfter: null };
      if (select) {
        select.value = 'purchased';
        select.dispatchEvent(new Event('change', { bubbles: true }));
        await new Promise(r => setTimeout(r, 500));
        const pd = document.getElementById('pd');
        out.openedPd = !!(pd && pd.open);
        if (pd && pd.open) {
          const amt = document.getElementById('pdAmount');
          if (amt && !amt.value) { amt.value = '7490000'; amt.dispatchEvent(new Event('input', { bubbles: true })); }
          const date = document.getElementById('pdDate');
          if (date && !date.value) { date.value = '2026-01-14'; date.dispatchEvent(new Event('input', { bubbles: true })); }
          document.getElementById('pdConfirm').click();
          await new Promise(r => setTimeout(r, 900));
          const stored = JSON.parse(localStorage.getItem('wishlist.guest.items') || '[]');
          out.statusAfter = (stored.find(i => i.id === 'a2') || {}).status || null;
          out.pdClosed = pd.open === false;
        }
      }
      document.getElementById('v13GridView').click();
      await new Promise(r => setTimeout(r, 500));
      return out;
    });
    c('F06-03', 'regression', 'the Board still renders and a purchase confirmation still writes the real record',
      '4 columns, one drag handle per card, the fallback selector opens the confirmation and a2 ends up purchased',
      board.cols === 4 && board.cards >= 5 && board.handles === board.cards && board.openedPd === true && board.statusAfter === 'purchased',
      board);

    // --- aurora + floating hero untouched
    const fusion1 = await page.evaluate(() => {
      const blobs = document.querySelectorAll('.pv-aurora__blob');
      const float = document.querySelector('.pv-card__float');
      return {
        blobs: blobs.length,
        auroraFilter: blobs[0] ? getComputedStyle(blobs[0]).filter : null,
        badge: !!document.querySelector('.pv-stage__badge'),
        floatAnim: float ? float.getAnimations().length : 0,
        stageCards: [...document.querySelectorAll('[data-pv-card]')].filter(el => getComputedStyle(el).display !== 'none').length,
        enter: document.documentElement.classList.contains('pv-enter')
      };
    });
    c('F06-04', 'regression', 'FUSION-01 aurora and floating hero still work',
      '3 blobs with no filter, the floating card still animating, the stage still built',
      fusion1.blobs === 3 && (fusion1.auroraFilter === 'none' || fusion1.auroraFilter === null) &&
      fusion1.badge && fusion1.floatAnim >= 1 && fusion1.stageCards === 3 && fusion1.enter,
      fusion1);

    // --- listener hygiene
    const leakBefore = await page.evaluate(() => JSON.parse(JSON.stringify(window.__leakTally)));
    for (let i = 0; i < 24; i++) {
      await page.evaluate((y) => window.scrollTo(0, y), 400 + i * 90);
      await sleep(24);
    }
    await page.setViewport({ width: 1280, height: 880, deviceScaleFactor: 1 });
    await sleep(200);
    const leakAfter = await page.evaluate(() => JSON.parse(JSON.stringify(window.__leakTally)));
    const scrollDelta = (leakAfter.win.scroll || 0) - (leakBefore.win.scroll || 0);
    const resizeDelta = (leakAfter.win.resize || 0) - (leakBefore.win.resize || 0);
    c('F06-05', 'regression', 'scrolling and resizing never adds another listener',
      'the scroll/resize listener counts do not grow',
      scrollDelta === 0 && resizeDelta === 0, { scrollDelta, resizeDelta, leakAfter: leakAfter.win });

    c('F06-06', 'regression', 'no browser errors during the whole regression pass',
      'clean', (state.errors.concat(state.pageErrors)).length === 0, state.errors.concat(state.pageErrors));
    await ctx.close();
  }

  // ===================================================================
  section = 'F06 ADAPTIVE — SEVEN WIDTHS';
  // ===================================================================
  {
    const widths = [320, 375, 390, 430, 768, 1024, 1440];
    const rows = [];
    let allClean = true;
    for (const w of widths) {
      const { ctx, page, state } = await newScenario(browser, ITEMS, { width: w, height: 900, settle: 700 });
      const info = await page.evaluate(() => {
        const hero = document.querySelector('.hero--v9');
        const title = document.getElementById('hero-title');
        const ctas = ['.hero-v3__primary', '.hero-v3__secondary'].map(s => document.querySelector(s)).filter(Boolean);
        const marquee = document.querySelector('.pv-marquee');
        const overlapsCta = ctas.some(a => {
          const ab = a.getBoundingClientRect();
          if (!marquee) return false;
          const mb = marquee.getBoundingClientRect();
          return ab.bottom > mb.top && ab.top < mb.bottom;
        });
        const cs = title ? getComputedStyle(title) : null;
        return {
          scrollWidth: document.documentElement.scrollWidth,
          innerWidth: window.innerWidth,
          heroTitleSize: cs ? parseFloat(cs.fontSize) : 0,
          heroVisible: hero ? getComputedStyle(hero).display !== 'none' : false,
          marqueeOverlapsCta: overlapsCta,
          ghostDisplay: getComputedStyle(document.querySelector('.pv-ghost--dash')).display,
          railHeight: parseFloat(getComputedStyle(document.querySelector('.pv-progress')).height),
          ctaCount: ctas.length
        };
      });
      const overflow = info.scrollWidth - info.innerWidth;
      const ok = overflow <= 1 && info.heroVisible && info.heroTitleSize >= 20 &&
        !info.marqueeOverlapsCta && info.ctaCount === 2 && info.railHeight >= 2;
      if (!ok) allClean = false;
      rows.push({ w, overflow, title: +info.heroTitleSize.toFixed(1), ghost: info.ghostDisplay, ok });
      c('F06-07-' + w, 'adaptive', 'width ' + w + 'px: no overflow, readable hero, CTAs clear of the marquee',
        'scrollWidth <= innerWidth+1, hero title >= 20px, 2 CTAs not overlapped',
        ok, { overflow, title: +info.heroTitleSize.toFixed(1), ghost: info.ghostDisplay, overlapsCta: info.marqueeOverlapsCta });
      c('F06-08-' + w, 'adaptive', 'width ' + w + 'px: no browser errors',
        'clean', (state.errors.concat(state.pageErrors)).length === 0, state.errors.concat(state.pageErrors));
      await ctx.close();
    }
    c('F06-09', 'adaptive', 'all seven widths pass together',
      'every width clean', allClean, rows);
  }

  // ===================================================================
  section = 'F06 SOURCE GATES';
  // ===================================================================
  {
    c('F06-10', 'source', 'the sheet is linked AFTER FUSION-01 (cascade ownership)',
      'fusion-02 link follows the fusion-01 link',
      htmlSrc.indexOf('fusion-01-aurora-hero.css') < htmlSrc.indexOf('fusion-02-cinematic-scroll.css'), null);

    c('F06-11', 'source', 'the new runtime is wired next to the existing FUSION setup',
      'setupFusionCinematic() called from init and pvProgressSync() from render()',
      /setupFusionTypography\(\);[\s\S]{0,400}?setupFusionCinematic\(\);/.test(htmlSrc) &&
      /renderHeroStage\(\);[\s\S]{0,200}?pvProgressSync\(\);/.test(htmlSrc), null);

    c('F06-12', 'source', 'the marquee markup is decorative and self-contained',
      'aria-hidden on the strip, no link/img/script inside it, no digits',
      /<div class="pv-marquee" aria-hidden="true">/.test(htmlSrc), null);

    c('F06-13', 'source', 'the ghost words are real aria-hidden nodes, not pseudo content',
      'both ghosts are declared with aria-hidden="true"',
      (htmlSrc.match(/class="pv-ghost pv-ghost--/g) || []).length === 2 &&
      /class="pv-ghost pv-ghost--dash" aria-hidden="true"/.test(htmlSrc) &&
      /class="pv-ghost pv-ghost--collection" aria-hidden="true"/.test(htmlSrc), null);

    c('F06-14', 'source', 'the brand stays Personal Vault / PVault. (no truncated or prototype copy)',
      'no "Personal Vaul" in the app or the new sheet, the strip uses PVault. and the real tagline',
      !/Personal Vaul[^t]/.test(htmlSrc) && !/Personal Vaul[^t]/.test(cssSrc) &&
      /PVault\./.test(htmlSrc) && /Không gian lưu giữ ước mơ/.test(htmlSrc), null);

    c('F06-15', 'source', 'FUSION-02 asks for no network resource',
      'the sheet has no url() fetch and the marquee markup has no src',
      !/url\(\s*['"]?https?:/i.test(cssSrc) && !/@import/.test(cssSrc), null);
  }

  await browser.close();
  server.close();
  const pass = results.filter(r => r.pass).length, fail = results.length - pass;
  for (const r of results.slice().sort((a, b) => (a.section > b.section ? 1 : a.section < b.section ? -1 : 0))) {
    if (r.pass) continue;
    console.log('FAIL ' + r.id + ' [' + r.section + '] ' + r.entry + '\n     expected: ' + r.expected + '\n     actual:   ' + r.actual);
  }
  let printed = '';
  for (const r of results) {
    if (r.section !== printed) { printed = r.section; console.log('\n-- ' + r.section); }
    console.log((r.pass ? '  ok   ' : '  FAIL ') + r.id + '  ' + r.entry);
    // opt-in: QA_DETAILS=1 also prints the measured values of PASSING checks,
    // which is what the evidence for the report is drawn from.
    if (process.env.QA_DETAILS && r.pass && r.actual && r.actual !== '""') console.log('        measured: ' + r.actual);
  }
  console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — ' + pass + '/' + results.length + ' checks');
  process.exit(fail === 0 ? 0 : 1);
}

run().catch(err => { console.error(err); server.close(); process.exit(1); });
