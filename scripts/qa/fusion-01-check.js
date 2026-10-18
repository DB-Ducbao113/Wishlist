// =====================================================================
// DREAM VAULT V16.2 — FUSION-01 — AURORA ATMOSPHERE & FLOATING 3D HERO
// Real-browser verification. Nothing here is a "the CSS file exists" test:
// every visual claim is checked against computed styles, real geometry,
// hit-testing and decoded screenshot pixels.
//
//   1) ambience layers present, behind the page, gradient-only (no blur)
//   2) ambience actually PAINTED (PNG pixel proof, isolated on/off delta)
//   3) hero-local aurora actually painted
//   4) cursor glow follows the pointer, bounded rAF, stops when settled
//   5) touch never simulates a pointer; hidden tab pauses; reduced motion
//      keeps a complete but static atmosphere
//   6) stage skeleton + brand seal, no competing transform owners
//   7) real collection data drives image / name / price / savings / owned
//   8) empty collection → neutral branded composition, no fabricated item
//   9) live re-render when the data changes through the real UI
//  10) MOTION-02 scroll + pointer depth still reach the composition
//  11) floating motion has measurable intermediate states
//  12) ghost word, staggered entrance, gradient highlight, section numerals
//  13) 320 / 375 / 390 / 430 / 768 / 1024 / 1440: no overflow, CTA never
//      covered, hero copy never covered
//  14) no listener or animation leaks, no uncaught errors
//  15) source-level gates: no blur/backdrop-filter, reduced-motion kill
//      switch for every animated selector, sheet loaded last
// =====================================================================
const puppeteer = require('puppeteer-core');
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const CHROME = process.env.CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : path.join(__dirname, '..', '..');
const PORT = 8211;
const OUT = path.join(__dirname, '..', '..', 'qa-out');
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
// Minimal, dependency-free PNG reader (8-bit, non-interlaced) so the suite
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

function meanRgb(png, region) {
  const { data, channels, width } = png;
  const x0 = Math.max(0, region ? region.x : 0), y0 = Math.max(0, region ? region.y : 0);
  const x1 = Math.min(width, region ? region.x + region.w : width);
  const y1 = Math.min(png.height, region ? region.y + region.h : png.height);
  let r = 0, g = 0, b = 0, n = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * width + x) * channels;
      r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
    }
  }
  return n === 0 ? [0, 0, 0] : [r / n, g / n, b / n];
}

function meanDelta(a, b) {
  return (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2])) / 3;
}

async function regionMean(page, clip) {
  const rect = {
    x: clip.x || 0, y: clip.y || 0,
    width: clip.w != null ? clip.w : clip.width,
    height: clip.h != null ? clip.h : clip.height
  };
  const base64 = await page.screenshot({ clip: rect, encoding: 'base64' });
  return meanRgb(decodePng(Buffer.from(base64, 'base64')), null);
}

async function withStyle(page, css, fn) {
  const tag = await page.addStyleTag({ content: css });
  try { return await fn(); } finally { await tag.evaluate(el => el.remove()); }
}

// =====================================================================
// Fixtures
// =====================================================================
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

// a1 = featured (wish, high, most valuable of its rank)   a2 = second
// a3 = third (wish, medium)   a4 = already owned   a5 = no image at all
const STAGE_ITEMS = [
  mk('a1', { name: 'Tai nghe chống ồn', price: 7490000, status: 'wish', priority: 'high', image: IMG1, savingGoal: 8000000, savedAmount: 5200000 }),
  mk('a2', { name: 'Máy ảnh mini', price: 3290000, status: 'wish', priority: 'high', image: IMG2, savingGoal: 4000000, savedAmount: 900000 }),
  mk('a3', { name: 'Giày chạy bộ', price: 2450000, status: 'ordered', priority: 'medium', image: dataImage('IMG3', '#cfe6ff', '#7fa8f0') }),
  mk('a4', { name: 'Máy đọc sách', price: 3190000, status: 'purchased', priority: 'low', image: dataImage('IMG4', '#d9f2e4', '#7fcfae'), paidAmount: 3100000, purchasedAt: 1700000100000, previousStatus: 'wish' }),
  mk('a5', { name: 'Ống kính 50mm', price: 8900000, status: 'wish', priority: 'medium', image: '' })
];

// =====================================================================
// Browser-side probes (injected, so page.evaluate only needs a one-liner)
// =====================================================================
const PROBE_HEADER = `
(function(){
  window.__leakTally = {};
  var oa = document.addEventListener.bind(document);
  var or_ = document.removeEventListener.bind(document);
  document.addEventListener = function(t, l, o){ window.__leakTally[t] = (window.__leakTally[t]||0)+1; return oa(t,l,o); };
  document.removeEventListener = function(t, l, o){ window.__leakTally[t] = (window.__leakTally[t]||0)-1; return or_(t,l,o); };
  window.__rafCount = 0;
  var raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = function(cb){ window.__rafCount++; return raf(cb); };

  window.__box = function(sel){
    var el = document.querySelector(sel);
    if(!el) return null;
    var cs = getComputedStyle(el), b = el.getBoundingClientRect();
    return {
      x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height),
      right: Math.round(b.right), bottom: Math.round(b.bottom),
      display: cs.display, opacity: +cs.opacity, z: cs.zIndex, pe: cs.pointerEvents,
      transform: cs.transform, translate: cs.translate
    };
  };
  window.__allBoxes = function(sel){
    return [].slice.call(document.querySelectorAll(sel)).map(function(el, i){
      var cs = getComputedStyle(el), b = el.getBoundingClientRect();
      return {
        i: i, cls: el.className, text: el.textContent.replace(/\\s+/g,' ').trim(),
        off: el.classList.contains('pv-off'), display: cs.display, z: cs.zIndex,
        x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height),
        right: Math.round(b.right), bottom: Math.round(b.bottom)
      };
    });
  };
  window.__pvProbe = function(){
    var stage = document.querySelector('.pv-stage');
    var prod = document.querySelector('.v9-scene__product');
    var ghost = document.querySelector('.pv-hero-ghost');
    var glow = document.getElementById('pvCursorGlow');
    var hero = document.querySelector('.hero--v9');
    return {
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
      stageExists: !!stage,
      stageText: stage ? stage.textContent.replace(/\\s+/g,' ').trim() : '',
      hasItemsClass: !!(stage && stage.closest('.v9-scene') && stage.closest('.v9-scene').classList.contains('pv-has-items')),
      alcoveProductOpacity: prod ? +getComputedStyle(prod).opacity : null,
      cards: window.__allBoxes('[data-pv-card]'),
      chips: window.__allBoxes('[data-pv-chip]'),
      imgSrcs: [].slice.call(document.querySelectorAll('[data-pv-card] .pv-card__img')).map(function(i){ return i.getAttribute('src') || ''; }),
      noimg: [].slice.call(document.querySelectorAll('[data-pv-card]')).map(function(el){ return el.classList.contains('pv-noimg'); }),
      capTitles: [].slice.call(document.querySelectorAll('[data-pv-card] [data-pv-card-title]')).map(function(el){ return el.textContent.replace(/\\s+/g,' ').trim(); }),
      capMetas: [].slice.call(document.querySelectorAll('[data-pv-card] [data-pv-card-meta]')).map(function(el){ return el.textContent.replace(/\\s+/g,' ').trim(); }),
      ring: window.__box('.pv-stage__ring'),
      halo: window.__box('.pv-stage__halo'),
      badge: window.__box('.pv-stage__badge'),
      badgeText: (function(){ var t = document.querySelector('.pv-stage__badge text'); return t ? t.textContent.trim() : ''; })(),
      hero: window.__box('.hero--v9'),
      content: window.__box('.hero__content'),
      title: window.__box('#hero-title'),
      cta: window.__box('.hero-v3__primary'),
      cta2: window.__box('.hero-v3__secondary'),
      visual: window.__box('.hero__visual'),
      ghost: window.__box('.pv-hero-ghost'),
      ghostText: ghost ? ghost.textContent.trim() : '',
      glow: window.__box('#pvCursorGlow'),
      glowX: glow ? getComputedStyle(glow).getPropertyValue('--pv-cursor-x').trim() : '',
      glowY: glow ? getComputedStyle(glow).getPropertyValue('--pv-cursor-y').trim() : '',
      cursorOn: document.documentElement.classList.contains('pv-cursor-on'),
      heroPointerX: hero ? getComputedStyle(hero).getPropertyValue('--hero-pointer-x').trim() : '',
      heroMidY: hero ? getComputedStyle(hero).getPropertyValue('--hero-mid-y').trim() : '',
      visualTranslate: getComputedStyle(document.querySelector('.hero__visual')).translate,
      enterClass: document.documentElement.classList.contains('pv-enter'),
      animCount: document.getAnimations().length,
      leakTally: JSON.parse(JSON.stringify(window.__leakTally))
    };
  };
  window.__pvStageAndItems = function(){
    var its = JSON.parse(localStorage.getItem('wishlist.guest.items') || '[]');
    return {
      stage: window.__pvProbe(),
      meta: { owned: its.filter(function(i){ return i.status === 'purchased'; }).length, total: its.length, ids: its.map(function(i){ return i.id + ':' + i.status; }) }
    };
  };
})();
`;

// =====================================================================
async function newScenario(browser, seed, opts = {}) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  const state = { errors: [], pageErrors: [] };
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

const probe = (page) => page.evaluate(() => window.__pvProbe());
const boxOf = (page, sel) => page.evaluate((s) => window.__box(s), sel);

function intersects(a, b) {
  if (!a || !b || a.w === 0 || b.w === 0 || a.display === 'none' || b.display === 'none') return false;
  return a.x < b.right && b.x < a.right && a.y < b.bottom && b.y < a.bottom;
}

// Hit-test thật tại tâm một phần tử (sau khi cuộn nó vào giữa màn hình).
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

// =====================================================================
async function run() {
  await new Promise(r => server.listen(PORT, r));
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--force-device-scale-factor=1', '--disable-lcd-text']
  });

  // ===================================================================
  section = 'F01.1 AMBIENT LAYERS';
  // ===================================================================
  {
    const { ctx, page, state } = await newScenario(browser, STAGE_ITEMS, { width: 1440, height: 900 });
    const layers = await page.evaluate(() => {
      const read = (sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const cs = getComputedStyle(el);
        return {
          z: cs.zIndex, pe: cs.pointerEvents, display: cs.display, mix: cs.mixBlendMode,
          bg: cs.backgroundImage.slice(0, 90), filter: cs.filter,
          backdrop: cs.backdropFilter || cs.webkitBackdropFilter,
          opacity: +cs.opacity, pos: cs.position
        };
      };
      return {
        aurora: read('.pv-aurora'),
        blobs: [...document.querySelectorAll('.pv-aurora__blob')].map(el => ({
          filter: getComputedStyle(el).filter,
          backdrop: getComputedStyle(el).backdropFilter || getComputedStyle(el).webkitBackdropFilter,
          bg: getComputedStyle(el).backgroundImage.slice(0, 70),
          animation: getComputedStyle(el).animationName,
          iterations: getComputedStyle(el).animationIterationCount,
          w: Math.round(el.getBoundingClientRect().width)
        })),
        grid: read('.pv-grid'),
        grain: read('.pv-grain'),
        glow: read('#pvCursorGlow')
      };
    });
    c('F01-01', 'ambience', 'aurora layer + 3 drift blobs + grid + grain + glow exist',
      'aurora, 3 blobs, grid, grain, glow',
      !!layers.aurora && layers.blobs.length === 3 && !!layers.grid && !!layers.grain && !!layers.glow,
      { aurora: !!layers.aurora, blobs: layers.blobs.length, grid: !!layers.grid, grain: !!layers.grain, glow: !!layers.glow });
    c('F01-02', 'ambience', 'every ambience layer sits BEHIND the page (negative z-index, fixed, input-transparent)',
      'aurora -3 / grid -2 / grain -1, position fixed, pointer-events none',
      layers.aurora.z === '-3' && layers.grid.z === '-2' && layers.grain.z === '-1' &&
      [layers.aurora, layers.grid, layers.grain].every(l => l.pos === 'fixed' && l.pe === 'none'),
      { z: [layers.aurora.z, layers.grid.z, layers.grain.z], pos: layers.aurora.pos, pe: layers.aurora.pe });
    c('F01-03', 'ambience', 'softness comes from gradients only — no filter / backdrop-filter (prototype used blur(70px))',
      'filter none, backdrop-filter none, grain opacity < .1 and no blend mode',
      layers.aurora.filter === 'none' && layers.aurora.backdrop === 'none' &&
      layers.blobs.every(b => b.filter === 'none' && b.backdrop === 'none' && /radial-gradient/.test(b.bg)) &&
      layers.grid.backdrop === 'none' && layers.grain.opacity < 0.1 && layers.grain.mix === 'normal',
      { blobFilters: layers.blobs.map(b => b.filter), grainOpacity: layers.grain.opacity, grainMix: layers.grain.mix });
    c('F01-04', 'ambience', 'drift is a CSS keyframe animation of real size (no JS motion loop)',
      'animation-name pv-drift*, infinite iterations, blobs > 300px',
      layers.blobs.every(b => /pv-drift/.test(b.animation) && b.iterations === 'infinite' && b.w > 300),
      { names: layers.blobs.map(b => b.animation), iter: layers.blobs.map(b => b.iterations), w: layers.blobs.map(b => b.w) });

    // pixel proof: the atmosphere is really painted. The page content is
    // hidden for the measurement so only the ambience layers can be
    // responsible for the difference (the hero's own shadow would otherwise
    // mask it).
    const hideWrap = 'body.dreamscape-v5 .wrap{visibility:hidden !important}';
    const clip = { x: 60, y: 120, width: 400, height: 400 };
    const on = await withStyle(page, hideWrap, () => regionMean(page, clip));
    const off = await withStyle(page, hideWrap + 'body.dreamscape-v5 .pv-aurora{display:none !important}', () => regionMean(page, clip));
    const delta = meanDelta(on, off);
    c('F01-05', 'ambience', 'pixel proof — the aurora is painted (page background, aurora on vs off, content hidden)',
      'mean channel delta > 8', delta > 8,
      { on: on.map(v => Math.round(v)), off: off.map(v => Math.round(v)), delta: +delta.toFixed(2) });
    c('F01-06', 'ambience', 'pixel proof — the layer really covers the viewport (not a 0×0 box)',
      'aurora box wider and taller than the viewport',
      await page.evaluate(() => {
        const b = document.querySelector('.pv-aurora').getBoundingClientRect();
        return b.width > window.innerWidth && b.height > window.innerHeight;
      }), null);

    // pixel proof: the hero-local aurora paints inside the card (isolated)
    const hb = await boxOf(page, '.hero--v9');
    const heroClip = { x: Math.round(hb.x + hb.w * 0.76 - 120), y: Math.round(hb.y + 30), width: 240, height: 130 };
    const decor = 'body.dreamscape-v5 .pv-hero-ghost{display:none !important}body.dreamscape-v5 .pv-stage{display:none !important}';
    const heroOn = await withStyle(page, decor, () => regionMean(page, heroClip));
    const heroOff = await withStyle(page, decor + 'body.dreamscape-v5 .hero.hero--v9::before{content:none !important}', () => regionMean(page, heroClip));
    const heroDelta = meanDelta(heroOn, heroOff);
    c('F01-07', 'ambience', 'pixel proof — the hero-local aurora layer is painted inside the hero card',
      'mean channel delta > 3', heroDelta > 3,
      { on: heroOn.map(v => Math.round(v)), off: heroOff.map(v => Math.round(v)), delta: +heroDelta.toFixed(2) });
    c('F01-08', 'ambience', 'no errors while painting the atmosphere',
      'clean', (state.errors.concat(state.pageErrors)).length === 0,
      state.errors.concat(state.pageErrors));
    await ctx.close();
  }

  // ===================================================================
  section = 'F01.2 CURSOR GLOW';
  // ===================================================================
  {
    const { ctx, page, state } = await newScenario(browser, STAGE_ITEMS, { width: 1440, height: 900 });
    const before = await probe(page);
    await page.mouse.move(300, 300);
    await sleep(700);
    const at1 = await probe(page);
    await page.mouse.move(900, 620);
    await sleep(700);
    const at2 = await probe(page);
    const center = (s) => ({ x: Math.round(s.glow.x + s.glow.w / 2), y: Math.round(s.glow.y + s.glow.h / 2) });
    const g1 = center(at1), g2 = center(at2);
    c('F01-09', 'cursor glow', 'glow follows the desktop pointer (real geometry, lerped)',
      'centre within 12px of the pointer, and it moved with the pointer',
      Math.abs(g1.x - 300) < 12 && Math.abs(g1.y - 300) < 12 &&
      Math.abs(g2.x - 900) < 12 && Math.abs(g2.y - 620) < 12 &&
      Math.abs(g2.x - g1.x) > 400,
      { at300: g1, at900: g2 });
    c('F01-10', 'cursor glow', 'the layer is transparent until the pointer arrives, then visible',
      'opacity 0 before / 1 after, pv-cursor-on toggled',
      before.glow.opacity === 0 && !before.cursorOn && at2.cursorOn && at2.glow.opacity === 1,
      { before: before.glow.opacity, after: at2.glow.opacity, on: at2.cursorOn });
    c('F01-11', 'cursor glow', 'the offset travels in custom properties (no second transform owner)',
      '--pv-cursor-x/y in px',
      /^-?\d+(\.\d+)?px$/.test(at2.glowX) && /^-?\d+(\.\d+)?px$/.test(at2.glowY),
      { x: at2.glowX, y: at2.glowY });

    await page.mouse.move(500, 400);
    await sleep(120);
    const afterMove = await page.evaluate(() => window.__rafCount);
    await sleep(700);
    const settled = await page.evaluate(() => window.__rafCount);
    await sleep(600);
    const idle = await page.evaluate(() => window.__rafCount);
    c('F01-12', 'cursor glow', 'a pointer move really schedules frames (the effect is alive, not dead CSS)',
      'at least 1 frame in the 120ms after the move', afterMove > 0, { frames: afterMove });
    c('F01-13', 'cursor glow', 'BOUNDED — no infinite rAF loop: ~0 frames while the pointer is idle (600ms window)',
      '≤ 2 frames', idle - settled <= 2, { framesInIdleWindow: idle - settled, settled, idle });

    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => window.__pvHidden === true });
      window.__pvHidden = true;
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await sleep(700);   // the glow fades out over its 420ms transition
    const paused = await page.evaluate(() => ({
      cls: document.documentElement.classList.contains('pv-fx-hidden'),
      play: getComputedStyle(document.querySelector('.pv-aurora__blob--1')).animationPlayState,
      glowOpacity: +getComputedStyle(document.getElementById('pvCursorGlow')).opacity,
      cursorOn: document.documentElement.classList.contains('pv-cursor-on')
    }));
    c('F01-14', 'cursor glow', 'a hidden tab pauses every ambient animation and parks the glow',
      'html.pv-fx-hidden + animation-play-state paused + glow transparent',
      paused.cls && paused.play === 'paused' && paused.glowOpacity === 0 && !paused.cursorOn, paused);
    const resumed = await page.evaluate(() => {
      window.__pvHidden = false;
      document.dispatchEvent(new Event('visibilitychange'));
      return {
        cls: document.documentElement.classList.contains('pv-fx-hidden'),
        play: getComputedStyle(document.querySelector('.pv-aurora__blob--1')).animationPlayState
      };
    });
    c('F01-15', 'cursor glow', 'returning to a visible tab resumes the ambience',
      'class removed, animation-play-state running',
      !resumed.cls && resumed.play === 'running', resumed);
    c('F01-16', 'cursor glow', 'no errors in the glow lifecycle',
      'clean', (state.errors.concat(state.pageErrors)).length === 0, state.errors.concat(state.pageErrors));
    await ctx.close();
  }

  // ===================================================================
  section = 'F01.3 TOUCH + REDUCED MOTION';
  // ===================================================================
  {
    const { ctx, page } = await newScenario(browser, STAGE_ITEMS, { width: 390, height: 844, touch: true });
    const touch = await page.evaluate(() => {
      const el = document.querySelector('.pv-card--main');
      el.scrollIntoView({ block: 'center', behavior: 'instant' });
      const b = el.getBoundingClientRect();
      const x = b.left + b.width / 2, y = b.top + b.height / 2;
      const read = () => ({
        translate: getComputedStyle(el).translate,
        vx: getComputedStyle(document.getElementById('pvCursorGlow')).getPropertyValue('--pv-cursor-x')
      });
      const bef = read();
      for (const type of ['pointerover', 'pointerenter', 'pointermove']) {
        el.dispatchEvent(new PointerEvent(type, {
          bubbles: true, cancelable: true, composed: true, pointerId: 7, pointerType: 'touch',
          isPrimary: true, clientX: x, clientY: y, buttons: type === 'pointermove' ? 1 : 0
        }));
      }
      return {
        before: bef, after: read(),
        glowDisplay: getComputedStyle(document.getElementById('pvCursorGlow')).display,
        cursorOn: document.documentElement.classList.contains('pv-cursor-on')
      };
    });
    c('F01-17', 'touch', 'touch never simulates a cursor glow: the layer is not even rendered',
      'display none on a touch device', touch.glowDisplay === 'none', { display: touch.glowDisplay });
    c('F01-18', 'touch', 'touch never installs the pointer handler (var stays unset, no pv-cursor-on)',
      '--pv-cursor-x stays empty and html.pv-cursor-on absent',
      touch.after.vx === '' && !touch.cursorOn, { before: touch.before.vx, after: touch.after.vx, cursorOn: touch.cursorOn });
    c('F01-19', 'touch', 'touch never writes a hover transform on the floating cards (no expensive touch hover)',
      'translate identical before/after the touch sequence',
      touch.before.translate === touch.after.translate,
      { before: touch.before.translate, after: touch.after.translate });
    await ctx.close();
  }
  {
    const { ctx, page } = await newScenario(browser, STAGE_ITEMS, { width: 1440, height: 900, reducedMotion: true });
    const rm = await page.evaluate(() => {
      const anims = [...document.querySelectorAll('.pv-aurora__blob, .pv-stage__ring, .pv-stage__badge svg, .pv-stage__spark, .pv-card__float, .pv-chip')]
        .map(el => getComputedStyle(el).animationName);
      const card = document.querySelector('.pv-card--main');
      const b = card.getBoundingClientRect();
      return {
        enterClass: document.documentElement.classList.contains('pv-enter'),
        animations: [...new Set(anims)],
        titleAnim: getComputedStyle(document.querySelector('#hero-title')).animationName,
        titleTransform: getComputedStyle(document.querySelector('#hero-title')).transform,
        cardVisible: b.width > 0 && b.height > 0 && +getComputedStyle(card).opacity === 1,
        glowDisplay: getComputedStyle(document.getElementById('pvCursorGlow')).display,
        gridDisplay: getComputedStyle(document.querySelector('.pv-grid')).display,
        ghostDisplay: getComputedStyle(document.querySelector('.pv-hero-ghost')).display,
        glowVar: getComputedStyle(document.getElementById('pvCursorGlow')).getPropertyValue('--pv-cursor-x')
      };
    });
    c('F01-20', 'reduced motion', 'no ambient animation under prefers-reduced-motion (drift/float/spin/spark all off)',
      "every animation-name 'none'", rm.animations.length === 1 && rm.animations[0] === 'none', { names: rm.animations });
    c('F01-21', 'reduced motion', 'the staged entrance is skipped and the copy sits at its final position',
      "pv-enter absent, animationName 'none', transform 'none'",
      !rm.enterClass && rm.titleAnim === 'none' && rm.titleTransform === 'none',
      { enter: rm.enterClass, anim: rm.titleAnim, transform: rm.titleTransform });
    c('F01-22', 'reduced motion', 'the composition stays COMPLETE (cards + layers painted, glow disabled)',
      'card visible, grid painted, ghost painted, glow display none',
      rm.cardVisible && rm.gridDisplay === 'block' && rm.ghostDisplay === 'block' && rm.glowDisplay === 'none',
      { card: rm.cardVisible, grid: rm.gridDisplay, ghost: rm.ghostDisplay, glow: rm.glowDisplay });
    const clip = { x: 60, y: 120, width: 400, height: 400 };
    const hideWrap = 'body.dreamscape-v5 .wrap{visibility:hidden !important}';
    const on = await withStyle(page, hideWrap, () => regionMean(page, clip));
    const off = await withStyle(page, hideWrap + 'body.dreamscape-v5 .pv-aurora{display:none !important}', () => regionMean(page, clip));
    c('F01-23', 'reduced motion', 'pixel proof — the static atmosphere is still painted under reduced motion',
      'mean channel delta > 8', meanDelta(on, off) > 8,
      { on: on.map(v => Math.round(v)), off: off.map(v => Math.round(v)), delta: +meanDelta(on, off).toFixed(2) });
    await ctx.close();
  }

  // ===================================================================
  section = 'F02.1 STAGE COMPOSITION';
  // ===================================================================
  {
    const { ctx, page, state } = await newScenario(browser, STAGE_ITEMS, { width: 1440, height: 900 });
    const s = await probe(page);
    const sparks = await page.evaluate(() => document.querySelectorAll('.pv-stage__spark').length);
    c('F02-01', 'stage', 'stage skeleton exists inside the V9 alcove (ring, halo, 3 sparks, rotating seal)',
      'stage in .v9-scene with all decorative parts',
      s.stageExists && !!s.ring && !!s.halo && !!s.badge && sparks === 3,
      { stage: s.stageExists, ring: !!s.ring, halo: !!s.halo, badge: !!s.badge, sparks });
    c('F02-02', 'stage', 'the seal carries the real brand',
      'seal text mentions PERSONAL VAULT', /PERSONAL VAULT/i.test(s.badgeText), s.badgeText);
    c('F02-03', 'stage', 'decorative layers never intercept input',
      'pointer-events none on ring / halo / badge', s.ring.pe === 'none' && s.halo.pe === 'none' && s.badge.pe === 'none',
      { ring: s.ring.pe, halo: s.halo.pe, badge: s.badge.pe });
    const owners = await page.evaluate(() => [...document.querySelectorAll('.pv-card')].map(card => ({
      outer: getComputedStyle(card).transform,
      outerTranslate: getComputedStyle(card).translate,
      inner: getComputedStyle(card.querySelector('.pv-card__float')).transform,
      innerTranslate: getComputedStyle(card.querySelector('.pv-card__float')).translate
    })));
    c('F02-04', 'stage', 'no competing transform owners: the depth wrapper owns translate, the float node owns transform',
      "outer transform 'none' and inner translate 'none' for every card",
      owners.length === 3 && owners.every(o => (o.outer === 'none' || o.outer === '') && (o.innerTranslate === 'none' || o.innerTranslate === 'auto' || o.innerTranslate === '')),
      owners);
    c('F02-05', 'stage', 'the composition layers stack in the intended order (featured 6 < side 7 < chips 8)',
      'main 6, side 7, chips 8',
      s.cards[0].z === '6' && s.cards[1].z === '7' && s.cards[2].z === '7' && s.chips.every(ch => ch.z === '8'),
      { cards: s.cards.map(x => x.z), chips: s.chips.map(x => x.z) });
    c('F02-06', 'stage', 'no errors while building the composition',
      'clean', (state.errors.concat(state.pageErrors)).length === 0, state.errors.concat(state.pageErrors));
    await ctx.close();
  }

  // ===================================================================
  section = 'F02.2 REAL DATA DRIVES THE VISUALS';
  // ===================================================================
  {
    const { ctx, page, state } = await newScenario(browser, STAGE_ITEMS, { width: 1440, height: 900 });
    const s = await probe(page);
    c('F02-07', 'real data', 'all three floating cards are shown when the collection has 3+ items',
      '3 visible cards', s.cards.filter(x => x.display !== 'none').length === 3, s.cards.map(x => x.display));
    c('F02-08', 'real data', 'the featured card shows the REAL featured image (data-URI from the collection)',
      'img src === IMG1', s.imgSrcs[0] === IMG1, { got: s.imgSrcs[0].slice(0, 40), want: IMG1.slice(0, 40) });
    c('F02-09', 'real data', 'the featured caption shows the real name and the real price',
      'Tai nghe chống ồn / 7.490.000 ₫',
      s.capTitles[0] === 'Tai nghe chống ồn' && /7\.490\.000/.test(s.capMetas[0]) && /₫/.test(s.capMetas[0]),
      { title: s.capTitles[0], meta: s.capMetas[0] });
    c('F02-10', 'real data', 'featured order is honest: an unpurchased item wins over an owned one',
      'main is a1 (wish/high), never the purchased row; alcove switches to has-items',
      s.capTitles[0].indexOf('Máy đọc sách') === -1 && s.hasItemsClass === true,
      { titles: s.capTitles, hasItems: s.hasItemsClass });
    c('F02-11', 'real data', 'secondary card shows a real item and its REAL savings progress (900k/4M = 23%)',
      'Máy ảnh mini / 23%', s.capTitles[1] === 'Máy ảnh mini' && s.capMetas[1] === '23%',
      { title: s.capTitles[1], meta: s.capMetas[1] });
    c('F02-12', 'real data', 'an item without a usable image gets a branded panel, never a fake photo',
      'third card has pv-noimg and no src', s.noimg[2] === true && s.imgSrcs[2] === '',
      { noimg: s.noimg, src: s.imgSrcs[2] });
    const branded = await page.evaluate(() => {
      const el = document.querySelector('[data-pv-card="b"] .pv-card__mark');
      return { text: el ? el.textContent.trim() : '', display: el ? getComputedStyle(el.parentElement).display : '' };
    });
    c('F02-13', 'real data', 'the branded panel really renders the PVault. mark',
      'mark text PVault., panel displayed', branded.text === 'PVault.' && branded.display === 'grid', branded);
    c('F02-14', 'real data', 'ownership chip carries the REAL owned/total figure (1 of 5)',
      'Đã sở hữu 1 / 5 món',
      /1 \/ 5 món/.test(s.chips[1].text) && s.chips[1].display !== 'none',
      { text: s.chips[1].text, display: s.chips[1].display });
    c('F02-15', 'real data', 'savings chip carries the REAL best-progress item and its real percentage',
      'Tai nghe chống ồn · 65%',
      /Tai nghe chống ồn · 65%/.test(s.chips[0].text) && s.chips[0].display !== 'none', { text: s.chips[0].text });
    const stageMoney = (s.stageText.match(/[\d.]+ ₫/g) || []);
    c('F02-16', 'real data', 'every money string in the stage belongs to a real item price on a visible caption',
      'stage money ⊆ caption money',
      stageMoney.length > 0 && stageMoney.every(m => s.capMetas.some(meta => meta.indexOf(m) !== -1)),
      { stageMoney, capMetas: s.capMetas });
    c('F02-17', 'real data', 'with items present the pedestal product steps aside for the featured card',
      'alcove product opacity 0', s.alcoveProductOpacity === 0, { opacity: s.alcoveProductOpacity });
    c('F02-18', 'real data', 'no errors while binding real data',
      'clean', (state.errors.concat(state.pageErrors)).length === 0, state.errors.concat(state.pageErrors));
    await ctx.close();
  }
  {
    const { ctx, page } = await newScenario(browser, [], { width: 1440, height: 900 });
    const s = await probe(page);
    c('F02-19', 'empty state', 'an empty collection shows NO floating card and NO chip',
      'all cards and chips display none',
      s.cards.every(x => x.display === 'none') && s.chips.every(x => x.display === 'none'),
      { cards: s.cards.map(x => x.display), chips: s.chips.map(x => x.display) });
    c('F02-20', 'empty state', 'the neutral branded composition stays complete (product + ring + seal)',
      'product opacity 1, no has-items class, ring/seal painted',
      s.alcoveProductOpacity === 1 && s.hasItemsClass === false && s.ring.display !== 'none' && s.badge.display !== 'none',
      { product: s.alcoveProductOpacity, hasItems: s.hasItemsClass, ring: s.ring.display });
    c('F02-21', 'empty state', 'no fabricated product leaks into the empty stage (no money, no item names)',
      'stage text free of money strings and fixture names',
      !/[\d.]+ ₫/.test(s.stageText) && !/Món a/.test(s.stageText) && !/Tai nghe|Máy ảnh|Giày|Ống kính/.test(s.stageText),
      { stageText: s.stageText.slice(0, 140) });
    await ctx.close();
  }
  {
    // live re-render through the real UI
    const { ctx, page, state } = await newScenario(browser, STAGE_ITEMS, { width: 1440, height: 900 });
    const before = await probe(page);
    await page.evaluate(() => {
      const card = document.querySelector('#grid > .wishlist-card[data-id="a1"]');
      card.scrollIntoView({ block: 'center', behavior: 'instant' });
      card.querySelector('.mark-purchased').click();
    });
    await page.waitForFunction(() => document.getElementById('pd').open === true, { timeout: 3000 });
    await page.evaluate(() => document.getElementById('pdSkip').click());
    await sleep(700);
    const after = await page.evaluate(() => window.__pvStageAndItems());
    c('F02-22', 'live update', 'buying the featured item re-renders the stage from the new data',
      'featured switched away from a1',
      before.capTitles[0] === 'Tai nghe chống ồn' && after.stage.capTitles[0] !== 'Tai nghe chống ồn',
      { before: before.capTitles[0], after: after.stage.capTitles[0], ids: after.meta.ids });
    c('F02-23', 'live update', 'the ownership chip follows the same render (1 → 2 owned)',
      'owned 2 / 5', /2 \/ 5 món/.test(after.stage.chips[1].text),
      { chip: after.stage.chips[1].text, meta: after.meta });
    c('F02-24', 'live update', 'no errors during the live update',
      'clean', (state.errors.concat(state.pageErrors)).length === 0, state.errors.concat(state.pageErrors));
    await ctx.close();
  }

  // ===================================================================
  section = 'F02.3 MOTION INTEGRATION + TEXT PROTECTION';
  // ===================================================================
  {
    const { ctx, page, state } = await newScenario(browser, STAGE_ITEMS, { width: 1440, height: 900 });
    const measure = () => page.evaluate(() => {
      const dtop = (sel) => document.querySelector(sel).getBoundingClientRect().top + window.scrollY;
      return {
        visual: dtop('.hero__visual'),
        main: dtop('.pv-card--main'),
        mid: window.__pvProbe().heroMidY,
        visualTranslate: getComputedStyle(document.querySelector('.hero__visual')).translate
      };
    });
    await page.evaluate(() => document.getAnimations().forEach(a => a.pause()));
    const a0 = await measure();
    await page.evaluate(() => window.scrollTo(0, 260));
    await sleep(800);
    const a1 = await measure();
    await page.evaluate(() => document.getAnimations().forEach(a => a.play()));
    c('F02-25', 'integration', 'MOTION-02 still publishes the scroll parallax variables',
      '--hero-mid-y is a px value that changes with the scroll',
      a0.mid !== a1.mid && /px$/.test(a1.mid), { before: a0.mid, after: a1.mid });
    c('F02-26', 'integration', 'the hero visual (and therefore the composition) rides that parallax',
      'visual does not move like a plain page scroll',
      (a1.visual - a0.visual) !== -260 && Math.abs(a1.visual - a0.visual) < 260,
      { moved: +(a1.visual - a0.visual).toFixed(1), translate: a1.visualTranslate });
    c('F02-27', 'integration', 'the floating cards inherit the same depth channel — one owner, no fight',
      'card offset tracks the visual within 2px',
      Math.abs((a1.main - a0.main) - (a1.visual - a0.visual)) <= 2,
      { card: +(a1.main - a0.main).toFixed(1), visual: +(a1.visual - a0.visual).toFixed(1) });

    const hero = await boxOf(page, '.hero--v9');
    const cx = Math.round(hero.x + 300), cy = Math.round(hero.y + 200);
    const readPts = () => page.evaluate(() => {
      const ctr = (sel) => { const b = document.querySelector(sel).getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; };
      return { main: ctr('.pv-card--main'), side: ctr('.pv-card--a'), px: window.__pvProbe().heroPointerX };
    });
    await page.mouse.move(cx, cy);
    await sleep(900);
    const p0 = await readPts();
    await page.mouse.move(cx + 340, cy + 160);
    await sleep(900);
    const p1 = await readPts();
    const dMain = Math.abs(p1.main.x - p0.main.x);
    const dSide = Math.abs(p1.side.x - p0.side.x);
    c('F02-28', 'integration', 'pointer depth reaches the composition through the shared var channel',
      '--hero-pointer-x changes and both cards move', p0.px !== p1.px && dMain > 3 && dSide > 3,
      { px: [p0.px, p1.px], dMain: +dMain.toFixed(1), dSide: +dSide.toFixed(1) });
    c('F02-29', 'integration', 'the layers move at DIFFERENT rates (real depth, not a copied transform)',
      'side card travels further than the featured card', dSide > dMain + 1,
      { dMain: +dMain.toFixed(1), dSide: +dSide.toFixed(1) });

    const frames = [];
    for (let i = 0; i < 5; i++) {
      frames.push(await page.evaluate(() => ({
        main: getComputedStyle(document.querySelector('.pv-card--main .pv-card__float')).transform,
        ring: getComputedStyle(document.querySelector('.pv-stage__ring')).transform,
        blob: getComputedStyle(document.querySelector('.pv-aurora__blob--1')).transform
      })));
      await sleep(230);
    }
    c('F02-30', 'motion', 'the floating card really moves (≥ 3 distinct frame states in ~1s)',
      '≥ 3 distinct float transforms', new Set(frames.map(f => f.main)).size >= 3,
      { distinct: new Set(frames.map(f => f.main)).size });
    c('F02-31', 'motion', 'the orbit ring really rotates (≥ 2 distinct ring transforms)',
      '≥ 2 distinct', new Set(frames.map(f => f.ring)).size >= 2, { distinct: new Set(frames.map(f => f.ring)).size });
    c('F02-32', 'motion', 'the aurora really drifts (≥ 2 distinct blob transforms)',
      '≥ 2 distinct', new Set(frames.map(f => f.blob)).size >= 2, { distinct: new Set(frames.map(f => f.blob)).size });

    const s = await probe(page);
    const floats = [s.cards[0], s.cards[1], s.cards[2], s.chips[0], s.chips[1], s.badge].filter(x => x && x.display !== 'none');
    const ctaOverlap = floats.filter(f => intersects(f, s.cta) || intersects(f, s.cta2));
    const copyOverlap = floats.filter(f => intersects(f, s.title) || intersects(f, s.content));
    c('F02-33', 'protection', 'no floating layer intersects the hero CTAs (geometry)',
      'zero intersections', ctaOverlap.length === 0, { overlapping: ctaOverlap.map(x => x.text.slice(0, 18)) });
    c('F02-34', 'protection', 'no floating layer intersects the hero copy (geometry)',
      'zero intersections', copyOverlap.length === 0, { overlapping: copyOverlap.map(x => x.text.slice(0, 18)) });
    const hit1 = await hitTestAt(page, '.hero-v3__primary');
    const hit2 = await hitTestAt(page, '.hero-v3__secondary');
    c('F02-35', 'protection', 'the primary CTA is the top element at its own centre (real hit-test)',
      'hit-test lands on the CTA', hit1.inside, hit1);
    c('F02-36', 'protection', 'the secondary CTA is the top element at its own centre (real hit-test)',
      'hit-test lands on the CTA', hit2.inside, hit2);
    c('F02-37', 'protection', 'no errors during the integration scenario',
      'clean', (state.errors.concat(state.pageErrors)).length === 0, state.errors.concat(state.pageErrors));
    await ctx.close();
  }

  // ===================================================================
  section = 'F02 BROKEN IMAGE FALLBACK';
  // ===================================================================
  // A real wishlist image URL can be dead (expired Cloudinary link, corrupt
  // data-URI). The hero card must then fall back to the same neutral branded
  // panel as an item without an image — never a broken-image glyph, never a
  // fabricated photo — and keep the real caption.
  {
    const BROKEN = 'data:image/jpeg;base64,/9j/AAAA';   // undecodable on purpose
    const brokenItems = [{
      id: 'br1', name: 'Món ảnh hỏng', price: 1234000, image: BROKEN, link: '',
      status: 'wish', priority: 'high', category: '', note: '', createdAt: 1700000000000,
      savingGoal: 2000000, savedAmount: 500000
    }];
    const { ctx, page, state } = await newScenario(browser, brokenItems, { width: 1440, height: 900 });
    await sleep(600);                                    // let the decode fail
    const b = await page.evaluate(() => {
      const card = document.querySelector('[data-pv-card="main"]');
      const img = card && card.querySelector('.pv-card__img');
      const mark = card && card.querySelector('.pv-card__mark');
      const panel = mark ? mark.parentElement : null;
      return {
        noimg: !!(card && card.classList.contains('pv-noimg')),
        src: img ? (img.getAttribute('src') || '') : null,
        complete: img ? img.complete : null,
        naturalWidth: img ? img.naturalWidth : null,
        panelDisplay: panel ? getComputedStyle(panel).display : null,
        panelVisible: panel ? panel.getBoundingClientRect().width > 40 : false,
        title: card ? card.querySelector('[data-pv-card-title]').textContent.trim() : '',
        meta: card ? card.querySelector('[data-pv-card-meta]').textContent.trim() : ''
      };
    });
    c('F02-38', 'broken image', 'an undecodable real image URL falls back to the branded panel (no broken-image glyph)',
      'card has pv-noimg, src dropped, panel visible',
      b.noimg === true && b.src === '' && b.panelDisplay === 'grid' && b.panelVisible === true, b);
    c('F02-39', 'broken image', 'the fallback keeps the real caption — no data is lost when the photo fails',
      'Món ảnh hỏng / 1.234.000 ₫',
      b.title === 'Món ảnh hỏng' && /1\.234\.000/.test(b.meta), { title: b.title, meta: b.meta });
    c('F02-40', 'broken image', 'no errors while recovering from the broken image',
      'clean', (state.errors.concat(state.pageErrors)).length === 0, state.errors.concat(state.pageErrors));
    await ctx.close();
  }

  // ===================================================================
  section = 'F03 CINEMATIC TYPOGRAPHY';
  // ===================================================================
  {
    const { ctx, page, state } = await newScenario(browser, STAGE_ITEMS, { width: 1440, height: 900 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await sleep(200);
    const g = await page.evaluate(() => {
      const el = document.querySelector('.pv-hero-ghost');
      const cs = getComputedStyle(el);
      const hero = document.querySelector('.hero--v9').getBoundingClientRect();
      const b = el.getBoundingClientRect();
      return {
        text: el.textContent.trim(), display: cs.display, z: cs.zIndex, pe: cs.pointerEvents,
        stroke: cs.webkitTextStrokeWidth, insideHero: b.left >= hero.left - 1 && b.right <= hero.right + 1,
        w: Math.round(b.width), h: Math.round(b.height)
      };
    });
    c('F03-01', 'typography', 'the ghost word exists behind the hero (desktop only)',
      'visible at 1440px, z-index 0, inside the hero, input-transparent',
      g.display === 'block' && g.text.length > 0 && g.z === '0' && g.insideHero && g.pe === 'none' && g.stroke !== '0px',
      g);
    {
      const m = await newScenario(browser, STAGE_ITEMS, { width: 390, height: 844, touch: true });
      const r = await m.page.evaluate(() => getComputedStyle(document.querySelector('.pv-hero-ghost')).display);
      await m.ctx.close();
      c('F03-02', 'typography', 'the ghost word is dropped on phones so the headings stay clean',
        "display 'none' at 390px", r === 'none', { display: r });
    }

    // staggered entrance: real animation + real stagger + never transparent
    const sample = await page.evaluate(() => new Promise(resolve => {
      const sels = ['.hero__eyebrow', '#hero-title', '#hero-title > span', '.hero__description', '.hero-v3__actions', '.hero__footer'];
      const read = () => sels.map(sel => {
        const cs = getComputedStyle(document.querySelector(sel));
        return { sel, name: cs.animationName, delay: cs.animationDelay, transform: cs.transform, opacity: +cs.opacity };
      });
      const root = document.documentElement;
      root.classList.remove('pv-enter');
      void document.body.offsetHeight;
      root.classList.add('pv-enter');
      const first = read();
      setTimeout(() => resolve({ first, later: read() }), 1500);
    }));
    const delays = sample.first.map(x => parseFloat(x.delay) * 1000);
    const staggered = delays.every((d, i) => i === 0 || d > delays[i - 1]);
    c('F03-03', 'typography', 'the editorial entrance is staggered across six copy elements',
      'pv-rise animations with strictly increasing delays',
      staggered && sample.first.every(x => /pv-rise/.test(x.name)),
      { delays: sample.first.map(x => x.delay), names: [...new Set(sample.first.map(x => x.name))] });
    const moving = sample.first.filter((x, i) => x.transform !== sample.later[i].transform);
    c('F03-04', 'typography', 'the entrance really animates (transform differs between frames)',
      'at least 4 of the 6 elements travel', moving.length >= 4, { moving: moving.map(x => x.sel) });
    c('F03-05', 'typography', 'the entrance never hides the copy (transform-only keyframes, opacity never animates)',
      'every sampled opacity stays ≥ .85 in both samples, and no keyframe touches opacity',
      sample.first.every(x => x.opacity >= 0.85) && sample.later.every(x => x.opacity >= 0.85) &&
      sample.first.every((x, i) => x.opacity === sample.later[i].opacity),
      { first: sample.first.map(x => x.opacity), later: sample.later.map(x => x.opacity) });
    await sleep(400);
    const finalPos = await page.evaluate(() => {
      const cs = getComputedStyle(document.querySelector('#hero-title'));
      return { transform: cs.transform, opacity: +cs.opacity };
    });
    c('F03-06', 'typography', 'after the entrance the copy is at rest and fully readable',
      'identity transform (or none) and opacity 1',
      /^(none|matrix\(1, 0, 0, 1, 0, 0\))$/.test(finalPos.transform) && finalPos.opacity === 1, finalPos);

    // gradient highlight on the signature line
    const grad = await page.evaluate(() => {
      const el = document.querySelector('#hero-title > span');
      const cs = getComputedStyle(el);
      const b = el.getBoundingClientRect();
      return {
        bg: cs.backgroundImage.slice(0, 70),
        clip: cs.webkitBackgroundClip || cs.backgroundClip,
        fill: cs.webkitTextFillColor,
        rect: { x: Math.round(b.left + 8), y: Math.round(b.top + 10), w: 130, h: 34 }
      };
    });
    c('F03-07', 'typography', 'the signature line carries a refined gradient highlight',
      'background-clip text + linear-gradient + transparent fill',
      /linear-gradient/.test(grad.bg) && grad.clip === 'text' && /transparent|rgba\(0, 0, 0, 0\)/.test(grad.fill),
      { bg: grad.bg, clip: grad.clip, fill: grad.fill });
    const hiOn = await regionMean(page, grad.rect);
    const hiOff = await withStyle(page,
      'body.dreamscape-v5 .hero--v9 .hero__title > span{background-image:none !important;-webkit-text-fill-color:#17122E !important;color:#17122E !important}',
      () => regionMean(page, grad.rect));
    c('F03-08', 'typography', 'pixel proof — the highlight really paints (same line with the fill forced to ink)',
      'mean channel delta > 8', meanDelta(hiOn, hiOff) > 8,
      { highlighted: hiOn.map(v => Math.round(v)), inked: hiOff.map(v => Math.round(v)), delta: +meanDelta(hiOn, hiOff).toFixed(2) });

    // section ghost numerals
    const nums = await page.evaluate(() => {
      const read = (sel) => {
        const cs = getComputedStyle(document.querySelector(sel), '::after');
        return { content: cs.content, z: cs.zIndex, pe: cs.pointerEvents, color: cs.color, size: cs.fontSize };
      };
      return { overview: read('.overview-heading'), list: read('.list-heading--v3') };
    });
    const alphaOf = (col) => {
      const m = /rgba?\(([^)]+)\)/.exec(col || '');
      if (!m) return 1;
      const parts = m[1].split(',').map(s => parseFloat(s));
      return parts.length === 4 ? parts[3] : 1;
    };
    c('F03-09', 'typography', 'the two main headings get a restrained ghost numeral (01 / 02)',
      'content "01" and "02", z-index -1, input-transparent',
      nums.overview.content === '"01"' && nums.list.content === '"02"' &&
      nums.overview.z === '-1' && nums.list.z === '-1' && nums.overview.pe === 'none', nums);
    c('F03-10', 'typography', 'the ghost numerals stay far below readable contrast (cannot hurt legibility)',
      'alpha ≤ .12', alphaOf(nums.overview.color) <= 0.12 && alphaOf(nums.list.color) <= 0.12,
      { overview: nums.overview.color, list: nums.list.color });
    c('F03-11', 'typography', 'no errors while painting the typography',
      'clean', (state.errors.concat(state.pageErrors)).length === 0, state.errors.concat(state.pageErrors));
    await ctx.close();
  }

  // ===================================================================
  section = 'F04 RESPONSIVE';
  // ===================================================================
  {
    const viewports = [
      { w: 320, h: 640, touch: true }, { w: 375, h: 812, touch: true }, { w: 390, h: 844, touch: true },
      { w: 430, h: 932, touch: true }, { w: 768, h: 1024, touch: true }, { w: 1024, h: 768, touch: false },
      { w: 1440, h: 900, touch: false }
    ];
    let over = 0, covered = 0, hiddenCopy = 0;
    const detail = [];
    for (const v of viewports) {
      const { ctx, page } = await newScenario(browser, STAGE_ITEMS, { width: v.w, height: v.h, touch: v.touch });
      const r = await probe(page);
      const floats = [r.cards[0], r.cards[1], r.cards[2], r.chips[0], r.chips[1], r.badge].filter(x => x && x.display !== 'none');
      const ctaCovered = floats.some(f => intersects(f, r.cta) || intersects(f, r.cta2));
      const copyCovered = floats.some(f => intersects(f, r.title) || intersects(f, r.content));
      const hit = await hitTestAt(page, '.hero-v3__primary');
      const overflow = r.scrollWidth > r.innerWidth + 1;
      if (overflow) over++;
      if (ctaCovered || !hit.inside) covered++;
      if (copyCovered) hiddenCopy++;
      detail.push({
        w: v.w, scroll: r.scrollWidth, inner: r.innerWidth, overflow, ctaCovered, copyCovered,
        hit: hit.inside ? 'cta' : hit.hit,
        cards: r.cards.filter(x => x.display !== 'none').length,
        chips: r.chips.filter(x => x.display !== 'none').length,
        ghost: r.ghost.display
      });
      await ctx.close();
    }
    c('F04-01', 'responsive', 'no horizontal overflow at 320 / 375 / 390 / 430 / 768 / 1024 / 1440',
      '7/7 overflow-free', over === 0, { failures: over, scroll: detail.map(d => d.w + ':' + d.scroll + '/' + d.inner) });
    c('F04-02', 'responsive', 'the hero CTA is never covered and always wins the hit-test at every width',
      '7/7', covered === 0, { failures: covered, hits: detail.map(d => d.w + ':' + d.hit) });
    c('F04-03', 'responsive', 'no floating layer covers the hero copy at any width',
      '7/7 clean', hiddenCopy === 0, { failures: hiddenCopy, detail: detail.filter(d => d.copyCovered).map(d => d.w) });
    c('F04-04', 'responsive', 'phones (≤ 430px) simplify: one feature card, no chips, no ghost word',
      'at 320/375/390/430: cards 1, chips 0, ghost none',
      detail.filter(d => d.w <= 430).every(d => d.cards === 1 && d.chips === 0 && d.ghost === 'none'),
      detail.filter(d => d.w <= 430).map(d => d.w + ': cards ' + d.cards + ', chips ' + d.chips + ', ghost ' + d.ghost));
    c('F04-05', 'responsive', 'tablet and desktop keep the full three-card composition',
      'at 768/1024/1440: cards 3, chips 2',
      detail.filter(d => d.w >= 768).every(d => d.cards === 3 && d.chips === 2),
      detail.filter(d => d.w >= 768).map(d => d.w + ': cards ' + d.cards + ', chips ' + d.chips));
  }

  // ===================================================================
  section = 'F05 INTERACTION + PERFORMANCE GATES';
  // ===================================================================
  {
    const { ctx, page, state } = await newScenario(browser, STAGE_ITEMS, { width: 1440, height: 900 });
    const before = await probe(page);
    for (let i = 0; i < 12; i++) {
      await page.setViewport({ width: 1200 + (i % 3) * 40, height: 860, deviceScaleFactor: 1 });
      await page.mouse.move(200 + i * 7, 260 + i * 5);
      await sleep(30);
    }
    for (let i = 0; i < 6; i++) {
      await page.evaluate(() => {
        const card = document.querySelector('#grid > .wishlist-card[data-id="a2"]');
        card.scrollIntoView({ block: 'center', behavior: 'instant' });
        const open = card.querySelector('.quick-view, .product-card__open') || card;
        open.click();
      });
      await sleep(280);
      const opened = await page.evaluate(() => document.getElementById('qv').open === true);
      if (opened) {
        await page.evaluate(() => document.getElementById('qvClose').click());
        await sleep(320);
      }
    }
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    await sleep(800);
    const after = await probe(page);
    const diffs = Object.keys(after.leakTally).filter(k => after.leakTally[k] !== (before.leakTally[k] || 0))
      .map(k => k + ':' + (before.leakTally[k] || 0) + '→' + after.leakTally[k]);
    c('F05-01', 'gates', 'no document listener leak after 12 viewport changes, pointer churn and 6 quick-view cycles',
      'listener tally delta 0', diffs.length === 0, { before: before.leakTally, after: after.leakTally, diffs });
    c('F05-02', 'gates', 'the ambient animation set is finite and does not grow with interaction',
      'same animation count before/after, ≤ 40', before.animCount === after.animCount && after.animCount <= 40,
      { before: before.animCount, after: after.animCount });
    const app = await page.evaluate(() => ({
      cards: document.querySelectorAll('#grid > .wishlist-card').length,
      dashText: (document.querySelector('.stats-dashboard') || document.body).textContent.replace(/\s+/g, ' ').trim().length,
      qvClosed: document.getElementById('qv').open === false,
      stageCards: [...document.querySelectorAll('[data-pv-card]')].filter(el => getComputedStyle(el).display !== 'none').length
    }));
    c('F05-03', 'gates', 'the app itself is untouched and still working (grid + dashboard + dialogs closed + stage rebuilt)',
      '5 cards, dashboard text present, no dialog open, 3 stage cards',
      app.cards === 5 && app.dashText > 40 && app.qvClosed && app.stageCards === 3, app);
    c('F05-04', 'gates', 'no uncaught errors during the interaction stress',
      'clean', (state.errors.concat(state.pageErrors)).length === 0, state.errors.concat(state.pageErrors));
    await ctx.close();
  }

  // ===================================================================
  section = 'F05 SOURCE GATES';
  // ===================================================================
  {
    const css = fs.readFileSync(path.join(ROOT, 'css', 'fusion-01-aurora-hero.css'), 'utf8');
    const cssNoComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
    const html = fs.readFileSync(path.join(ROOT, 'wishlist.html'), 'utf8');
    c('F05-05', 'source', 'the FUSION sheet is loaded LAST (after motion-v18-mobile.css)',
      'fusion link index > motion-v18 link index',
      html.indexOf('fusion-01-aurora-hero.css') > html.indexOf('motion-v18-mobile.css') &&
      html.indexOf('fusion-01-aurora-hero.css') !== -1, null);
    c('F05-06', 'source', 'no blur / backdrop-filter anywhere in the FUSION sheet (comments stripped)',
      'zero matches in the rule text', !/filter\s*:\s*[^;]*blur|backdrop-filter\s*:\s*(?!none)/.test(cssNoComments), null);
    const animSelectors = [...css.matchAll(/([^{}]+)\{([^}]*animation\s*:[^;}]+)[^}]*\}/g)]
      .map(m => m[1].trim().split(',').map(s => s.trim())).flat()
      .filter(sel => !/pv-fx-hidden|motion-lite|prefers-reduced-motion/.test(sel));
    const rmStart = css.indexOf('@media (prefers-reduced-motion: reduce)');
    const rmBlock = rmStart === -1 ? '' : css.slice(rmStart);
    const missing = [...new Set(animSelectors.map(sel => {
      const cls = (sel.match(/\.[a-z0-9_-]+/gi) || []).pop();
      return cls ? cls.replace(/--[a-z0-9_-]+$/i, '') : '';
    }))].filter(cls => cls && !rmBlock.includes(cls));
    c('F05-07', 'source', 'every animated selector has a reduced-motion kill switch',
      'no animated base class missing from the reduced-motion block',
      missing.length === 0 && /animation:\s*none\s*!important/.test(rmBlock),
      { animated: animSelectors.length, missing });
    c('F05-08', 'source', 'the empty-state switch is a real rule (cards/chips can be hidden, not merely unrendered)',
      '.pv-off defined with display none', /\.pv-off\s*\{[^}]*display:\s*none/.test(css), null);
    c('F05-09', 'source', 'the sheet documents its ownership limits (bounded rAF, consumer of the MOTION-02 vars, motion-lite)',
      'header mentions bounded rAF + --hero-pointer-x + motion-lite',
      /bounded rAF/i.test(css) && /--hero-pointer-x/.test(css) && /motion-lite/.test(css), null);
    c('F05-10', 'source', 'wishlist.html wires the stage into render() and the setup into init',
      'renderHeroStage() called from render(), setupFusion* called from init',
      /updateObjectIndices\(\);[\s\S]{0,400}?renderHeroStage\(\);/.test(html) &&
      /setupFusionAurora\(\);/.test(html) && /setupFusionTypography\(\);/.test(html), null);
  }

  await browser.close();
  server.close();
  const pass = results.filter(r => r.pass).length, fail = results.length - pass;
  for (const r of results) {
    console.log((r.pass ? 'PASS' : 'FAIL') + ' [' + r.id + '] ' + r.section + ' :: ' + r.entry +
      (r.pass ? '' : '\n       expected: ' + r.expected + '\n       actual:   ' + r.actual));
  }
  console.log('\n==== FUSION-01 SUITE: ' + pass + ' PASS / ' + fail + ' FAIL (total ' + results.length + ') ====');
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'fusion-01-suite.json'), JSON.stringify({
    generatedAt: new Date().toISOString(), repo: ROOT, pass, fail, total: results.length, results
  }, null, 2));
  process.exit(fail === 0 ? 0 : 1);
}

run().catch(e => { console.error('FATAL', e); try { server.close(); } catch (_) {} process.exit(3); });
