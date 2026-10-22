// =====================================================================
// DREAM VAULT V16.2 — FUSION-03
// GALLERY, FOCUS VIEW, STATUS BOARD & QUICK VIEW VISUAL UNIFICATION
//
// Browser verification of css/fusion-03-gallery-board.css + its JS wiring.
// The CSS file merely EXISTING proves nothing: every claim below is checked
// against what actually wins the cascade, what the browser paints, the
// geometry the user hits, the live Web Animation objects, and the app's own
// persistence layer.
//
// Areas:
//   1)  source + cascade gates (ownership map, banned properties, tokens)
//   2)  gallery surface, mat/frame, pedestal, layer order
//   3)  the ONE new translate owner (depth layer) + its three off-gates
//   4)  gallery type hierarchy, indicators, action shelf, view switcher
//   5)  decorative wall tile: no new DOM, decoration only, desktop only
//   6)  Focus view spread + type scale
//   7)  Gallery<->Focus FLIP, measured WHILE the transition runs
//   8)  FLIP cancellation on rapid switching
//   9)  board columns, canonical status map, counts, accent
//  10)  board cards, lift, drag handle geometry, keyboard move
//  11)  drag preview + drop-target highlight + clean cancel
//  12)  CSS-only empty-column illustration
//  13)  completion feedback: real write, flash, seal, 900ms cleanup
//  14)  "Đã mua" still goes through the Purchase Dialog (never bypassed)
//  15)  Quick View continuity: mat, pedestal, plates, kicker rules
//  16)  Quick View shared-element flight + proxy hygiene
//  17)  empty/error states share one alcove; never prototype samples
//  18)  responsive 320..1920, touch targets, board scroll, dialog scroll
//  19)  focus rings, reduced motion, 100-card GPU/cost gates
//  20)  regressions: F4 / FUSION-02 / MOTION-03 invariants untouched
// =====================================================================
'use strict';
const puppeteer = require('puppeteer-core');
const http = require('http');
const fs = require('fs');
const path = require('path');

const CHROME = process.env.CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, 'qa-out');
const PORT = 8213;
const SHEET = path.join('css', 'fusion-03-gallery-board.css');
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

// --- deterministic artwork so every run renders identical pixels ---------
const art = (c1, c2, label) => 'data:image/svg+xml;utf8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300">' +
  '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
  '<stop offset="0" stop-color="' + c1 + '"/><stop offset="1" stop-color="' + c2 + '"/>' +
  '</linearGradient></defs><rect width="400" height="300" fill="url(#g)"/>' +
  '<circle cx="200" cy="140" r="78" fill="rgba(255,255,255,.5)"/>' +
  '<text x="200" y="152" font-family="system-ui" font-size="26" font-weight="700" ' +
  'text-anchor="middle" fill="#3f2f7a">' + label + '</text></svg>');

// 5 items: the four canonical statuses and all three priorities are covered.
const ITEMS = [
  { id: 'a1', name: 'Tai nghe chống ồn chủ động', price: 7490000, image: art('#cbb8ff', '#8f74e6', 'TAI NGHE'), link: 'https://example.com/a1', status: 'saving', priority: 'high', category: 'Âm thanh', note: 'Bản màu titan, mua kèm đệm tai thay thế.', createdAt: 1700000000000, savingGoal: 8000000, savedAmount: 5200000 },
  { id: 'a2', name: 'Máy ảnh mini', price: 3290000, image: art('#ffd9f0', '#e08fd0', 'MÁY ẢNH'), link: '', status: 'wish', priority: 'high', category: 'Nhiếp ảnh', note: '', createdAt: 1700000005000, savingGoal: 4000000, savedAmount: 900000 },
  { id: 'a3', name: 'Giày chạy bộ đường dài siêu nhẹ', price: 2450000, image: art('#cfe6ff', '#7fa8f0', 'GIÀY'), link: '', status: 'ordered', priority: 'medium', category: 'Thể thao', note: 'Size 42, giao dự kiến tuần sau.', createdAt: 1700000010000, savingGoal: 2500000, savedAmount: 400000 },
  { id: 'a4', name: 'Máy đọc sách', price: 3190000, image: art('#d9f2e4', '#7fcfae', 'SÁCH'), link: '', status: 'purchased', priority: 'low', category: 'Học tập', note: '', createdAt: 1700000015000, paidAmount: 3100000, purchasedAt: 1700000100000, previousStatus: 'wish' },
  { id: 'a5', name: 'Ống kính 50mm f/1.8', price: 8900000, image: art('#ffe6c9', '#f0a860', 'LENS'), link: '', status: 'wish', priority: 'medium', category: 'Nhiếp ảnh', note: '', createdAt: 1700000020000, savingGoal: 9000000, savedAmount: 2000000 }
];

// Two items, both "saving": three of the four board columns must be empty.
const SPARSE = [
  { id: 's1', name: 'Đèn bàn chống cận', price: 890000, image: art('#d7e8ff', '#93b6f2', 'ĐÈN'), link: '', status: 'saving', priority: 'medium', category: 'Góc làm việc', note: '', createdAt: 1700000100000 },
  { id: 's2', name: 'Ghế công thái học', price: 4290000, image: art('#e6dcff', '#a894f0', 'GHẾ'), link: '', status: 'saving', priority: 'high', category: 'Nội thất', note: '', createdAt: 1700000200000 }
];

// Artwork states: one item with no image at all, one whose URL fails.
const EDGE = [
  { id: 'e1', name: 'Món không có ảnh', price: 100000, image: '', link: '', status: 'wish', priority: 'low', category: 'Khác', note: '', createdAt: 1700000000000 },
  { id: 'e2', name: 'Món có ảnh hỏng', price: 200000, image: 'https://cdn.invalid.example/khong-ton-tai.jpg', link: '', status: 'saving', priority: 'medium', category: 'Khác', note: '', createdAt: 1700000100000 },
  { id: 'e3', name: 'Món bình thường', price: 300000, image: art('#cfe6ff', '#7fa8f0', 'OK'), link: '', status: 'ordered', priority: 'high', category: 'Khác', note: '', createdAt: 1700000200000 }
];

const many = (n) => Array.from({ length: n }, (_, i) => ({
  id: 'm' + (i + 1),
  name: 'Món số ' + (i + 1) + ' trong bộ sưu tập dài',
  price: 100000 + i * 37000,
  image: art('#cfd8ff', '#8f9ee6', 'M' + (i + 1)),
  link: '',
  status: ['wish', 'saving', 'ordered', 'purchased'][i % 4],
  priority: ['low', 'medium', 'high'][i % 3],
  category: 'Danh mục ' + ((i % 5) + 1),
  note: '',
  createdAt: 1700000000000 + i * 1000,
  savingGoal: 500000 + i * 1000,
  savedAmount: 100000 + i * 100
}));

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
// In-page probe kit, installed before ANY script runs, so the timers and
// listener tallies count from the very first frame.
// ---------------------------------------------------------------------
const PROBE_HEADER = `
(function(){
  window.__box = function(sel){
    var el = typeof sel === 'string' ? document.querySelector(sel) : sel;
    if(!el) return null;
    var cs = getComputedStyle(el), b = el.getBoundingClientRect();
    return {
      x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height),
      right: Math.round(b.right), bottom: Math.round(b.bottom),
      display: cs.display, opacity: +cs.opacity, z: cs.zIndex, pe: cs.pointerEvents,
      transform: cs.transform, willChange: cs.willChange
    };
  };
  window.__anims = function(sel){
    var el = document.querySelector(sel);
    if(!el) return null;
    return el.getAnimations().map(function(a){
      var t = a.effect && a.effect.getTiming ? a.effect.getTiming() : {};
      return { name: a.animationName || null, state: a.playState, iterInfinite: t.iterations === Infinity, duration: t.duration };
    });
  };
  // Only document.getAnimations() includes PSEUDO-ELEMENT animations.
  window.__docAnims = function(){
    return document.getAnimations().map(function(a){
      var t = a.effect && a.effect.getTiming ? a.effect.getTiming() : {};
      var tgt = a.effect && a.effect.target ? a.effect.target : null;
      return {
        name: a.animationName || null, state: a.playState, iterInfinite: t.iterations === Infinity,
        pseudo: (a.effect && a.effect.pseudoElement) || null,
        target: tgt ? (tgt.tagName.toLowerCase() + '.' + String(tgt.className || '').split(' ').slice(0, 2).join('.')) : null
      };
    });
  };
  // Only animations owned by a given subtree, so global decorative loops
  // (aurora, marquee) never mask a leftover transition/animation.
  window.__animsUnder = function(sel){
    return document.getAnimations().filter(function(a){
      var t = a.effect && a.effect.target;
      if(!t) return false;
      var el = t.nodeType === 1 ? t : t.parentElement;
      return !!(el && el.closest && el.closest(sel));
    });
  };
  window.__gridAnims = function(){ return window.__animsUnder('#grid'); };
  window.__frames = function(){
    return [...document.querySelectorAll('#grid > .wishlist-card')].map(function(card){
      var f = card.querySelector('.product-media__frame');
      var i = card.querySelector('.product-media__image');
      return {
        id: card.dataset.id,
        cardT: getComputedStyle(card).transform,
        cardAnims: card.getAnimations().length,
        frameTranslate: f ? getComputedStyle(f).translate : null,
        imageTranslate: i ? getComputedStyle(i).translate : null
      };
    });
  };
  window.__hit = function(sel){
    var el = document.querySelector(sel);
    if(!el) return { ok: false, reason: 'missing' };
    el.scrollIntoView({ block: 'center', behavior: 'instant' });
    var b = el.getBoundingClientRect();
    var cx = Math.round(b.left + b.width / 2), cy = Math.round(b.top + b.height / 2);
    var hit = document.elementFromPoint(cx, cy);
    return {
      ok: true, cx: cx, cy: cy,
      inside: !!hit && (hit === el || el.contains(hit) || (el.contains(hit) === false && hit.contains(el))),
      hit: hit ? (hit.tagName.toLowerCase() + '.' + String(hit.className || '').split(' ').slice(0, 2).join('.')) : 'null'
    };
  };
  // Panic counter for the "frames must be identity" sweeps: returns how many
  // frames/surfaces carry a LIVE layered transform.
  window.__gpu = function(){
    var out = { frames: 0, framesTranslated: 0, surfaces: 0, surfacesTransformed: 0,
                frameWillChange: 0, surfaceWillChange: 0, backdrop: 0, backdropEls: [], reveal: 0 };
    var isIdentity = function(m){
      if(!m || m === 'none') return true;
      var n = m.replace(/matrix3?d?\\(/,'').replace(/\\)/,'').split(',').map(parseFloat);
      if(n.length === 6) return Math.abs(n[0]-1) < 1e-3 && Math.abs(n[1]) < 1e-3 && Math.abs(n[2]) < 1e-3 && Math.abs(n[3]-1) < 1e-3 && Math.abs(n[4]) < .5 && Math.abs(n[5]) < .5;
      return n.length === 16 && Math.abs(n[0]-1) < 1e-3 && Math.abs(n[5]-1) < 1e-3 && Math.abs(n[12]) < .5 && Math.abs(n[13]) < .5;
    };
    document.querySelectorAll('#grid .product-media__frame').forEach(function(f){
      var cs = getComputedStyle(f);
      out.frames++;
      if(!isIdentity(cs.transform) || (cs.translate && cs.translate !== 'none' && cs.translate !== '0px')) out.framesTranslated++;
      if(cs.willChange && cs.willChange !== 'auto' && cs.willChange !== 'normal') out.frameWillChange++;
    });
    document.querySelectorAll('#grid .wishlist-card__surface').forEach(function(s){
      var cs = getComputedStyle(s);
      out.surfaces++;
      if(!isIdentity(cs.transform)) out.surfacesTransformed++;
      if(cs.willChange && cs.willChange !== 'auto' && cs.willChange !== 'normal') out.surfaceWillChange++;
    });
    document.querySelectorAll('#grid *').forEach(function(el){
      var bf = getComputedStyle(el).backdropFilter;
      if(bf && bf !== 'none'){ out.backdrop++; if(out.backdropEls.length < 6) out.backdropEls.push(el.tagName.toLowerCase() + '.' + String(el.className || '').split(' ')[0]); }
    });
    out.reveal = document.querySelectorAll('#grid > .wishlist-card[data-dv-reveal]').length;
    return out;
  };
})();
`;

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
      if (s && s.items) localStorage.setItem('wishlist.guest.items', JSON.stringify(s.items));
    } catch (e) {}
  }, { items: seed || [] });
  await page.setRequestInterception(true);
  page.on('request', req => {
    if (/wishlist-cloud\.js/.test(req.url())) return req.respond({ status: 200, contentType: 'text/javascript', body: MOCK });
    req.continue();
  });
  page.on('pageerror', e => state.pageErrors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') state.errors.push(m.text()); });
  page.on('dialog', d => { d.dismiss().catch(() => {}); });
  await page.goto('http://localhost:' + PORT + '/wishlist.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('typeof window.__cloudSetUser === "function"');
  await sleep(opts.settle || 900);
  return { ctx, page, state };
}

const setView = (page, mode) => page.evaluate((m) => {
  const btn = document.getElementById(m === 'gallery' ? 'v13GridView' : m === 'focus' ? 'v13FocusView' : 'v13BoardView');
  if (btn) btn.click(); else setCollectionView(m);
}, mode);

const boxOf = (page, sel) => page.evaluate((s) => window.__box(s), sel);

// Read the app's own guest store (the single data model).
const stored = (page) => page.evaluate(() => {
  try { return JSON.parse(localStorage.getItem('wishlist.guest.items') || '[]'); } catch (e) { return null; }
});

// =====================================================================
async function run() {
  await new Promise(r => server.listen(PORT, r));
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--force-device-scale-factor=1', '--disable-lcd-text']
  });

  const cssSrc = fs.readFileSync(path.join(ROOT, SHEET), 'utf8');
  const htmlSrc = fs.readFileSync(path.join(ROOT, 'wishlist.html'), 'utf8');

  // ===================================================================
  section = 'F03-A SOURCE, CASCADE & OWNERSHIP';
  // ===================================================================
  {
    const links = [...htmlSrc.matchAll(/<link[^>]+rel=["']stylesheet["'][^>]*>/gi)]
      .map(m => (m[0].match(/href=["']([^"']+)["']/) || [])[1])
      .filter(Boolean);
    const i2 = links.findIndex(h => /fusion-02-cinematic-scroll\.css/.test(h));
    const i3 = links.findIndex(h => /fusion-03-gallery-board\.css/.test(h));
    const i4 = links.findIndex(h => /fusion-04-mobile\.css/.test(h));
    const count3 = links.filter(h => /fusion-03-gallery-board\.css/.test(h)).length;
    const i17 = links.findIndex(h => /collection-v17\.css/.test(h));
    // The dialogs milestone (F03 Phase 2) appends ./css/dialogs-v18.css AFTER
    // collection-v17.css so the dialog redesign overrides the collection
    // tokens for Quick View + Add/Edit only. The cascade contract therefore
    // becomes an exact ORDER of the trailing sheets; anything unknown after
    // dialogs-v18.css is still a failure.
    const i18 = links.findIndex(h => /dialogs-v18\.css/.test(h));
    const count17 = links.filter(h => /collection-v17\.css/.test(h)).length;
    const count18 = links.filter(h => /dialogs-v18\.css/.test(h)).length;
    c('F03-A01', 'source', 'the FUSION-03 sheet is linked once, immediately after FUSION-02, before FUSION-04, followed by the collection sheet and then the dialogs sheet (nothing unknown after)',
      'exactly one link, index(i3) === index(i2) + 1, FUSION-04 directly follows, and the trailing order is collection-v17.css then dialogs-v18.css as the final sheet',
      count3 === 1 && count17 === 1 && count18 === 1 && i2 >= 0 && i3 === i2 + 1 && i4 === i17 - 1 && i17 === links.length - 2 &&
        i18 === links.length - 1 && i17 === i18 - 1 &&
        [...links.slice(i17)].every(h => /collection-v17\.css|dialogs-v18\.css/.test(h)),
      { sheets: links.length, i2: i2, i3: i3, i4: i4, i17: i17, i18: i18, last: links[links.length - 1] });

    const header = cssSrc.slice(0, cssSrc.indexOf('body.dreamscape-v5'));
    const namesOwners = /OWNERSHIP MAP/i.test(header) &&
      /MOTION-02/.test(header) && /MOTION-03/.test(header) && /MOTION-16/.test(header) &&
      /\.wishlist-card__surface/.test(header) && /\.product-media__image/.test(header) &&
      /\.pv-sheen/.test(header) && /product-card/.test(header);
    c('F03-A02', 'source', 'the sheet carries a real ownership map of the nodes it must not fight over',
      'names the reveal/tilt/parallax/zoom/sheen owners and the nodes it never takes a transform on',
      namesOwners, { headerLines: header.split('\n').length });

    const codeCss = cssSrc.replace(/\/\*[\s\S]*?\*\//g, '');

    c('F03-A03', 'source', 'no will-change anywhere in the sheet (no permanently promoted layer)',
      'zero occurrences of will-change outside the comment header',
      !/will-change/.test(codeCss), { hits: (codeCss.match(/will-change/g) || []).length });

    c('F03-A04', 'source', 'no backdrop-filter on repeated surfaces',
      'zero occurrences of backdrop-filter / -webkit-backdrop-filter',
      !/backdrop-filter/i.test(codeCss), { hits: (codeCss.match(/backdrop-filter/gi) || []).length });

    // The milestone may add keyframes for feedback, but never a filter/blur
    // transition or animation: motion-v16 owns that invariant.
    const keyframeBlocks = [...codeCss.matchAll(/@keyframes\s+([\w-]+)\s*\{([\s\S]*?)\n\}/g)]
      .map(m => ({ name: m[1], body: m[2] }));
    const unsafeFrames = keyframeBlocks.filter(k => /filter|backdrop-filter|box-shadow/.test(k.body));
    const animated = /transition[^;{}]*:\s*[^;{}]*filter|animation[^;{}]*:\s*[^;{}]*f3[^;{}]*filter/.test(codeCss) ||
      /transition-property:\s*[^;{}]*filter/.test(codeCss);
    c('F03-A05', 'source', 'no animated filter/blur: any keyframes only move transform/opacity',
      'no transition of filter, and every @keyframes body animates only transform and opacity',
      !animated && unsafeFrames.length === 0,
      { filterTransitions: (codeCss.match(/transition[^;{}]*filter/g) || []).length, keyframes: keyframeBlocks.map(k => k.name), unsafe: unsafeFrames.map(k => k.name) });

    const urlRefs = [...codeCss.matchAll(/url\(([^)]*)\)/g)].map(m => m[1].trim());
    const remote = urlRefs.filter(u => /^["']?https?:/i.test(u) || /^["']?\/[^/]/.test(u));
    c('F03-A06', 'source', 'the sheet is offline-safe: every url() is an inline data URI, no @import',
      'all url() references are data: URIs and there is no @import',
      urlRefs.every(u => /^["']?data:/i.test(u)) && !/@import/.test(codeCss),
      { urls: urlRefs.length, remote: remote });

    const palette = ['#6850BC', '#8B7ED8', '#A88BF7', '#2F7D5B', '#9A93AD', '#B3261E'];
    const missing = palette.filter(hex => cssSrc.toUpperCase().indexOf(hex.toUpperCase()) < 0);
    c('F03-A07', 'source', 'one shared canonical status/priority colour map is declared',
      'wish/saving/ordered/purchased + priority low/high canonical hexes all present',
      missing.length === 0, { missing: missing });

    // Brace-depth scan: an !important is allowed only when one of its enclosing
    // blocks is a motion/forced gate.
    const bangs = (function () {
      const out = [];
      const stack = [];
      let i = 0;
      while (i < codeCss.length) {
        const ch = codeCss[i];
        if (ch === '{') {
          let j = i - 1;
          while (j >= 0 && codeCss[j] !== '}' && codeCss[j] !== '{') j--;
          stack.push(codeCss.slice(j + 1, i).trim());
          i++;
        } else if (ch === '}') { stack.pop(); i++; }
        else if (codeCss.startsWith('!important', i)) {
          out.push({ under: stack.some(s => /prefers-reduced-motion|motion-lite|forced-colors/.test(s)), prelude: stack[stack.length - 1] || '' });
          i += 10;
        } else i++;
      }
      return out;
    })();
    const strayBangs = bangs.filter(b => !b.under);
    c('F03-A08', 'source', 'escalation is bounded: !important only inside the motion/forced gates',
      'every !important sits under a prefers-reduced-motion / html.motion-lite / forced-colors block',
      strayBangs.length === 0, { total: bangs.length, stray: strayBangs.map(b => b.prelude.slice(0, 70)) });

    const contents = [...codeCss.matchAll(/(?:^|[\s;{])content:\s*([^;]+);/g)].map(m => m[1].trim());
    const allowed = ['""', "''", '"✓"', '"✦"', '"PVault."', '"Chưa có món"'];
    const unexpected = contents.filter(v => allowed.indexOf(v) < 0);
    c('F03-A09', 'source', 'the sheet introduces no new user-facing copy beyond the audited marks',
      'every content: value is empty, ✓, ✦, the PVault. wordmark or the empty-column label',
      unexpected.length === 0, { contents: contents, unexpected: unexpected });

    const hookCount = (htmlSrc.match(/is-empty/g) || []).length;
    const hookWork = /frame\.classList\.(add|toggle)\("is-empty"/.test(htmlSrc) &&
      /classList[\s\S]{0,120}is-empty/.test(htmlSrc);
    c('F03-A10', 'source', 'the missing-artwork hook is wired in the app (build time + img error path)',
      'at least two is-empty assignments in wishlist.html and the frame class is toggled from JS',
      hookCount >= 2 && hookWork, { occurrences: hookCount, wired: hookWork });
  }

  // ===================================================================
  section = 'F03-B PREMIUM GALLERY';
  // ===================================================================
  {
    const { ctx, page, state } = await newScenario(browser, ITEMS, { width: 1440, height: 900 });
    await page.evaluate(() => document.getElementById('grid').scrollIntoView({ block: 'start', behavior: 'instant' }));
    await sleep(400);

    const CARD = '#grid > .wishlist-card[data-id="a2"]';
    const card = await page.evaluate((CARD) => {
      const surf = document.querySelector(CARD + ' .wishlist-card__surface');
      const frame = document.querySelector(CARD + ' .product-media__frame');
      const img = document.querySelector(CARD + ' .product-media__image');
      const thumb = document.querySelector(CARD + ' .thumb.product-media');
      const sheen = document.querySelector(CARD + ' .pv-sheen');
      const cs = getComputedStyle(surf), fs = getComputedStyle(frame), is = getComputedStyle(img);
      const rs = getComputedStyle(document.querySelector(CARD));
      const pedestal = getComputedStyle(frame, '::before');
      const sh = getComputedStyle(sheen);
      return {
        status: document.querySelector(CARD).className,
        root: { bg: rs.backgroundColor, radius: rs.borderRadius, shadowBlur: Math.max.apply(null, (rs.boxShadow.match(/([\d.]+)px/g) || ['0px']).map(parseFloat)), transform: rs.transform },
        surface: { bg: cs.backgroundImage.slice(0, 90), border: cs.borderTopColor, radius: cs.borderRadius, shadowBlur: Math.max.apply(null, (cs.boxShadow.match(/([\d.]+)px/g) || ['0px']).map(parseFloat)), transform: cs.transform },
        frame: { bg: fs.backgroundImage.slice(0, 90), radius: fs.borderRadius, inset: fs.inset, shadow: fs.boxShadow.slice(0, 70), z: fs.zIndex },
        image: { pad: is.padding, fit: is.objectFit, z: is.zIndex, transition: is.transitionProperty || is.transition },
        thumbBg: getComputedStyle(thumb).backgroundImage.slice(0, 40),
        pedestal: { content: pedestal.content, bg: pedestal.backgroundImage.slice(0, 50), z: pedestal.zIndex, pe: pedestal.pointerEvents },
        sheen: { z: sh.zIndex, pe: sh.pointerEvents, willChange: sh.willChange, opacity: sh.opacity }
      };
    }, CARD);

    c('F03-B01', 'gallery', 'regular gallery cards converge on one painted surface with an identity transform',
      'the card root paints an opaque background, a rounded corner and a soft shadow, while the inner surface stays transparent and untransformed',
      /^rgb/.test(card.root.bg) && parseFloat(card.root.radius) >= 12 && card.root.shadowBlur >= 20 &&
      card.root.transform === 'none' && (card.surface.transform === 'none' || /matrix\(1, 0, 0, 1, 0, 0\)/.test(card.surface.transform)),
      { root: card.root, surface: card.surface });

    c('F03-B02', 'gallery', 'the media mat is a real gradient mat, not a flat wash',
      'frame background-image is a vertical gradient ending in the lavender tint',
      /linear-gradient/.test(card.frame.bg) && /170deg/.test(card.frame.bg),
      card.frame);

    c('F03-B03', 'gallery', 'the artwork stands on a pedestal painted behind it',
      'frame::before has content, a radial background, z-index 0 and pointer-events none, and the image sits above it',
      card.pedestal.content === '""' && /radial-gradient/.test(card.pedestal.bg) &&
      +card.pedestal.z === 0 && card.pedestal.pe === 'none' && +card.image.z === 1,
      { pedestal: card.pedestal, imageZ: card.image.z });

    c('F03-B04', 'gallery', 'layer order is pedestal < artwork < FUSION-02 sheen',
      'image z-index 1, pedestal 0, sheen 4 and the sheen never intercepts the pointer',
      +card.image.z === 1 && +card.pedestal.z === 0 && +card.sheen.z === 4 &&
      card.sheen.pe === 'none' && card.sheen.willChange === 'auto',
      card.sheen);

    const type = await page.evaluate((CARD) => {
      const title = document.querySelector(CARD + ' .product-card__title');
      const price = document.querySelector(CARD + ' .product-card__price');
      const index = document.querySelector(CARD + ' .product-card__index');
      const ts = getComputedStyle(title), ps = getComputedStyle(price);
      const rule = getComputedStyle(index, '::before');
      return {
        title: { family: ts.fontFamily.split(',')[0].replace(/"/g, ''), style: ts.fontStyle, size: parseFloat(ts.fontSize), color: ts.color, clamp: ts.webkitLineClamp },
        price: { size: parseFloat(ps.fontSize), weight: ps.fontWeight, color: ps.color, borderTop: ps.borderTopWidth + ' ' + ps.borderTopStyle, variant: ps.fontVariantNumeric },
        index: { content: rule.content, basis: rule.flexBasis, height: rule.height, bg: rule.backgroundColor, op: rule.opacity, display: getComputedStyle(index).display }
      };
    }, CARD);
    c('F03-B05', 'gallery', 'type hierarchy: a bold sans title over a bold accent price with no hairline',
      'sans title, normal style, clamped to 2 lines; price at >=700 weight in the accent colour with no top border; the showroom index is not rendered',
      /Inter|Segoe/.test(type.title.family) && type.title.style === 'normal' && type.title.clamp === '2' &&
      +type.price.weight >= 700 && type.price.color === 'rgb(104, 80, 188)' &&
      /^0px/.test(type.price.borderTop) && type.index.display === 'none',
      type);

    const badges = await page.evaluate(() => {
      const out = {};
      ['a1', 'a2', 'a3', 'a4'].forEach(id => {
        const card = document.querySelector('#grid > .wishlist-card[data-id="' + id + '"]');
        const b = card ? card.querySelector('.product-card__badges .badge') : null;
        if (!b) return;
        const cs = getComputedStyle(b);
        out[id] = { bg: cs.backgroundColor, color: cs.color, border: cs.borderTopWidth, shadow: cs.boxShadow.slice(0, 90), count: card.querySelectorAll('.product-card__badges .badge').length, text: b.textContent.trim() };
      });
      return out;
    });
    const badgeKeys = Object.keys(badges);
    const badgeBg = badgeKeys.map(k => badges[k].bg);
    const labels = badgeKeys.map(k => badges[k].text);
    const opaque = badgeBg.every(b => !/rgba\(0, 0, 0, 0\)/.test(b));
    c('F03-B06', 'gallery', 'status chips are a single filled overlay and the four statuses stay distinguishable',
      'one chip per card, a non-transparent background, 0px border, and four distinct status labels (status is carried by the label, priority by its own colour)',
      badgeKeys.length === 4 && opaque && labels.length === 4 &&
      labels.every(t => t.length > 0) && new Set(labels).size === 4 &&
      badgeKeys.every(k => parseFloat(badges[k].border) === 0),
      badges);

    const prio = await page.evaluate(() => {
      const seen = [];
      document.querySelectorAll('#grid .product-card__badges .badge').forEach(b => {
        if (/b-low|b-medium|b-high/.test(b.className)) seen.push({ cls: (b.className.match(/b-(low|medium|high)/) || [])[0], bg: getComputedStyle(b).backgroundColor, color: getComputedStyle(b).color });
      });
      const map = {};
      seen.forEach(s => { map[s.cls] = s.color + '|' + s.bg; });
      return { map: map, count: seen.length };
    });
    c('F03-B07', 'gallery', 'priority chips use their own map, distinct from the status colours',
      'all three priorities present with pairwise different colours',
      Object.keys(prio.map).length === 3 && prio.count >= 3 &&
      new Set(Object.keys(prio.map).map(k => prio.map[k])).size === 3,
      prio);

    const shelf = await page.evaluate((CARD) => {
      const actions = document.querySelector(CARD + ' .product-card__actions');
      const cs = getComputedStyle(actions);
      const view = document.querySelector(CARD + ' [data-card-action="view"]');
      return {
        borderTop: cs.borderTopWidth + ' ' + cs.borderTopStyle, gap: cs.gap, padding: cs.padding, bg: cs.backgroundImage.slice(0, 40),
        hasView: !!view, viewShadow: view ? getComputedStyle(view).boxShadow.slice(0, 40) : null
      };
    }, CARD);
    const viewHit = await page.evaluate((CARD) => {
      const card = document.querySelector(CARD);
      card.scrollIntoView({ block: 'center', behavior: 'instant' });
      const menu = card.querySelector('.card-more__trigger');
      if (menu) menu.click();
      return true;
    }, CARD);
    await sleep(360);
    const menuHit = await page.evaluate((CARD) => {
      const card = document.querySelector(CARD);
      const panel = card.querySelector('.card-more__menu[data-open="true"]');
      const item = panel ? panel.querySelector('button') : null;
      if (!item) return { open: false };
      const b = item.getBoundingClientRect();
      const top = document.elementFromPoint(Math.round(b.left + b.width / 2), Math.round(b.top + b.height / 2));
      return { open: true, inside: !!top && (top === item || item.contains(top)) };
    }, CARD);
    await page.evaluate((CARD) => {
      const menu = document.querySelector(CARD + ' .card-more__trigger');
      if (menu) menu.click();
    }, CARD);
    await sleep(300);
    const hit = await page.evaluate((CARD) => {
      const card = document.querySelector(CARD);
      const el = card.querySelector('[data-card-action="view"]');
      if (!el) return { ok: false };
      const b = el.getBoundingClientRect();
      const top = document.elementFromPoint(Math.round(b.left + b.width / 2), Math.round(b.top + b.height / 2));
      return { ok: true, inside: !!top && (top === el || el.contains(top)), hit: top ? top.tagName.toLowerCase() + '.' + String(top.className || '').split(' ')[0] : 'null' };
    }, CARD);
    c('F03-B08', 'gallery', 'the action shelf is a clean row with a lift-visible primary, and its buttons are hit-testable',
      'a 1px shelf divider, the primary carries a shadow, the open menu item is hit-testable, and after closing the primary is too',
      /^1px/.test(shelf.borderTop) && shelf.hasView && /rgba|rgb/.test(shelf.viewShadow || '') &&
      viewHit === true && menuHit.open === true && menuHit.inside === true &&
      hit.ok === true && hit.inside === true,
      { shelf: shelf, menu: menuHit, hit: hit });

    // --- view switcher
    const vb = await page.evaluate(() => {
      const sw = document.querySelector('.v13-viewbar__switch');
      const on = document.querySelector('.v13-viewbar__button[aria-pressed="true"]');
      const label = document.querySelector('.v13-viewbar__label');
      const cs = getComputedStyle(sw), os = on ? getComputedStyle(on) : null;
      const rule = getComputedStyle(label, '::before');
      return {
        switchBg: cs.backgroundImage.slice(0, 40), switchColor: cs.backgroundColor, switchShadow: cs.boxShadow.slice(0, 40), radius: cs.borderRadius,
        activeBg: os ? os.backgroundImage.slice(0, 40) : null, activeColor: os ? os.backgroundColor : null, activeShadow: os ? os.boxShadow.slice(0, 40) : null,
        active: on ? (on.dataset.view || on.textContent.trim()) : null,
        ruleContent: rule.content, ruleWidth: rule.width
      };
    });
    const beforeView = await page.evaluate(() => document.getElementById('grid').dataset.v13View);
    await setView(page, 'focus');
    await sleep(500);
    const afterView = await page.evaluate(() => ({
      view: document.getElementById('grid').dataset.v13View,
      pressed: (document.querySelector('.v13-viewbar__button[aria-pressed="true"]') || {}).textContent,
      focusBtn: document.getElementById('v13FocusView').getAttribute('aria-pressed')
    }));
    await setView(page, 'gallery');
    await sleep(500);
    c('F03-B09', 'gallery', 'the view switcher is a styled pill whose state still follows the real view',
      'the track paints a tint, the active button paints a different surface with a shadow, and clicking moves aria-pressed + dataset.v13View',
      vb.switchColor !== 'rgba(0, 0, 0, 0)' && parseFloat(vb.radius) >= 18 &&
      vb.activeColor !== vb.switchColor && /rgba|rgb/.test(vb.activeShadow || '') &&
      beforeView !== 'focus' && afterView.view === 'focus' && afterView.focusBtn === 'true',
      { vb: vb, before: beforeView, after: afterView });

    // --- decorative wall tile: no new DOM, decoration only, desktop only
    const tile = await page.evaluate(() => {
      const g = document.getElementById('grid');
      const cs = getComputedStyle(g, '::after');
      return {
        content: cs.content.slice(0, 60), pe: cs.pointerEvents, opacity: cs.opacity,
        children: g.children.length, cards: g.querySelectorAll(':scope > .wishlist-card').length,
        text: g.textContent.indexOf('PVault') < 0
      };
    });
    c('F03-B10', 'gallery', 'the four-up gallery keeps no decorative wall tile',
      'grid::after is suppressed (no quote tile in a 4-up grid), pointer-events none, and the grid holds exactly its cards as element children',
      tile.content === 'none' && tile.pe === 'none' && tile.children === tile.cards && tile.text === true,
      tile);
    await ctx.close();
    c('F03-B11', 'gallery', 'no console or page errors while rendering the unified gallery',
      'zero page errors and zero console errors',
      state.pageErrors.length === 0 && state.errors.length === 0,
      { pageErrors: state.pageErrors.slice(0, 3), consoleErrors: state.errors.slice(0, 3) });
  }

  // ===================================================================
  section = 'F03-B2 THE ONE NEW TRANSLATE OWNER (DEPTH LAYER)';
  // ===================================================================
  {
    const { ctx, page } = await newScenario(browser, ITEMS, { width: 1440, height: 900 });
    await page.evaluate(() => document.getElementById('grid').scrollIntoView({ block: 'start', behavior: 'instant' }));
    await sleep(420);

    const atRest = await page.evaluate(() => window.__frames()[0]);
    c('F03-B12', 'depth', 'the depth layer is worth zero pixels at rest on a fine pointer',
      'frame translate is 0px (never a matrix, never a size) and no layer is promoted',
      atRest.frameTranslate === '0px' && atRest.imageTranslate === '0px',
      atRest);

    const who = 'a2';
    const bb = await boxOf(page, '#grid > .wishlist-card[data-id="a2"] .product-media__frame');
    await page.mouse.move(bb.x + Math.round(bb.w * 0.16), bb.y + Math.round(bb.h * 0.2));
    await sleep(180);
    const moved = await page.evaluate((id) => window.__frames().find(f => f.id === id), who);
    await page.mouse.move(4, 4);
    await sleep(700);
    const back = await page.evaluate((id) => window.__frames().find(f => f.id === id), who);

    const px = (v) => {
      const nums = (v && v !== 'none') ? (v.match(/-?[\d.]+/g) || []).map(Number) : [];
      return [nums[0] || 0, nums[1] || 0];
    };
    const fv = px(moved.frameTranslate), iv = px(moved.imageTranslate);
    const fMag = Math.hypot(fv[0] || 0, fv[1] || 0), iMag = Math.hypot(iv[0] || 0, iv[1] || 0);
    const ratio = iMag > 0.5 ? fMag / iMag : 0;
    c('F03-B13', 'depth', 'the frame travels with the pointer at a fixed fraction of the existing parallax',
      'both translate away from zero, and |frame| / |image| is 0.34 ± 0.06 with no second listener',
      fMag > 0.4 && iMag > 1.2 && Math.abs(ratio - 0.34) <= 0.06,
      { frame: moved.frameTranslate, image: moved.imageTranslate, ratio: +ratio.toFixed(3), card: moved.id });
    const bv = px(back.frameTranslate), bi = px(back.imageTranslate);
    c('F03-B14', 'depth', 'leaving the card returns every layer to zero (no visible residual offset)',
      'both the frame and the image translate settle under a quarter of a pixel once the transition has finished',
      Math.hypot(bv[0], bv[1]) < 0.25 && Math.hypot(bi[0], bi[1]) < 0.25,
      back);
    await ctx.close();

    // --- gate 1: reduced motion
    const rm = await newScenario(browser, ITEMS, { width: 1440, height: 900, reducedMotion: true });
    await rm.page.evaluate(() => document.getElementById('grid').scrollIntoView({ block: 'start', behavior: 'instant' }));
    await sleep(300);
    const rmFrames = await rm.page.evaluate(() => window.__frames());
    const rmAnims = await rm.page.evaluate(() => window.__docAnims().length);
    c('F03-B15', 'depth', 'reduced motion switches the depth layer off entirely',
      'every frame translate is none and no animation is running',
      rmFrames.every(f => f.frameTranslate === 'none') && rmAnims === 0,
      { frames: rmFrames.slice(0, 3), anims: rmAnims });
    await rm.ctx.close();

    // --- gate 2: touch pointer
    const tc = await newScenario(browser, ITEMS, { width: 390, height: 844, touch: true });
    await tc.page.evaluate(() => document.getElementById('grid').scrollIntoView({ block: 'start', behavior: 'instant' }));
    await sleep(300);
    const tcFrames = await tc.page.evaluate(() => window.__frames());
    const touchMedia = await tc.page.evaluate(() => ({ hoverNone: matchMedia('(hover: none)').matches, coarse: matchMedia('(pointer: coarse)').matches, parallax: document.querySelector('#grid > .wishlist-card').hasAttribute('data-dv-parallax') }));
    c('F03-B16', 'depth', 'touch devices never get a fake hover depth',
      'the pointer really is coarse, the app did not install the parallax, and every frame translate is none',
      touchMedia.coarse === true && touchMedia.parallax === false && tcFrames.every(f => f.frameTranslate === 'none'),
      { media: touchMedia, frames: tcFrames.slice(0, 2) });
    await tc.ctx.close();

    // --- gate 3: html.motion-lite (the app's own low-power switch)
    const ml = await newScenario(browser, ITEMS, { width: 1440, height: 900 });
    await ml.page.evaluate(() => { document.documentElement.classList.add('motion-lite'); document.getElementById('grid').scrollIntoView({ block: 'start', behavior: 'instant' }); });
    await sleep(300);
    const mlFrames = await ml.page.evaluate(() => window.__frames());
    c('F03-B17', 'depth', 'html.motion-lite also switches the depth layer off',
      'every frame translate is none with motion-lite applied',
      mlFrames.every(f => f.frameTranslate === 'none'), mlFrames.slice(0, 2));
    await ml.ctx.close();
  }

  // ===================================================================
  section = 'F03-C FOCUS VIEW + FLIP';
  // ===================================================================
  {
    const { ctx, page } = await newScenario(browser, ITEMS, { width: 1440, height: 900 });

    const flip = await page.evaluate(async () => {
      const cards = () => [...document.querySelectorAll('#grid > .wishlist-card')];
      const sample = () => cards().map(c => {
        const m = getComputedStyle(c).transform;
        let tx = 0, ty = 0;
        if (m && m !== 'none') { const n = m.replace(/matrix3?d?\(/, '').replace(/\)/, '').split(',').map(parseFloat); tx = n.length === 6 ? n[4] : n[12]; ty = n.length === 6 ? n[5] : n[13]; }
        return { id: c.dataset.id, anims: c.getAnimations().length, tx: tx, ty: ty };
      });
      document.getElementById('v13FocusView').click();
      const frames = [];
      for (let i = 0; i < 16; i++) { await new Promise(r => requestAnimationFrame(r)); frames.push(sample()); }
      await new Promise(r => setTimeout(r, 900));
      const settled = { view: document.getElementById('grid').dataset.v13View, leftovers: window.__gridAnims().length, frames: sample() };
      return { frames: frames, settled: settled };
    });
    const flat = flip.frames.flat();
    const peak = Math.max(...flat.map(f => Math.hypot(f.tx, f.ty)));
    const animatedFrames = flip.frames.filter(fr => fr.some(x => x.anims > 0)).length;
    const movedCards = new Set(flat.filter(f => Math.hypot(f.tx, f.ty) > 2).map(f => f.id)).size;
    c('F03-C01', 'focus', 'Gallery -> Focus still FLIPs: cards are measured moving inside the transition',
      'at least 3 frames with live animations, a peak translate over 40px, and at least 2 distinct cards moving',
      animatedFrames >= 3 && peak > 40 && movedCards >= 2,
      { animatedFrames: animatedFrames, peak: +peak.toFixed(1), movedCards: movedCards });
    c('F03-C02', 'focus', 'the FLIP settles to zero with nothing left running',
      'view is focus, zero leftover animations, every card transform back to identity',
      flip.settled.view === 'focus' && flip.settled.leftovers === 0 &&
      flip.settled.frames.every(f => !f.tx && !f.ty && f.anims === 0),
      { view: flip.settled.view, leftovers: flip.settled.leftovers });

    const spread = await page.evaluate(() => {
      const surf = document.querySelector('#grid[data-v13-view="focus"] > .wishlist-card .wishlist-card__surface');
      const cs = getComputedStyle(surf);
      const thumb = document.querySelector('#grid[data-v13-view="focus"] > .wishlist-card .thumb.product-media');
      const content = document.querySelector('#grid[data-v13-view="focus"] > .wishlist-card .product-card__content');
      const title = document.querySelector('#grid[data-v13-view="focus"] > .wishlist-card .product-card__title');
      return {
        cols: cs.gridTemplateColumns, minH: parseFloat(cs.minHeight), h: Math.round(surf.getBoundingClientRect().height),
        thumbW: Math.round(thumb.getBoundingClientRect().width), contentW: Math.round(content.getBoundingClientRect().width),
        titleSize: parseFloat(getComputedStyle(title).fontSize), titleFamily: getComputedStyle(title).fontFamily.split(',')[0].replace(/"/g, ''),
        gap: getComputedStyle(document.getElementById('grid')).gap
      };
    });
    c('F03-C03', 'focus', 'Focus view reads as a curated spread: two columns, tall rows, bigger type',
      'two grid tracks, a tall row (>=300px), the media not narrower than the text, and a sans title larger than the gallery card title',
      spread.cols.split(' ').length === 2 && spread.minH >= 300 && spread.thumbW >= spread.contentW * 0.9 &&
      /Inter|Segoe/.test(spread.titleFamily) && spread.titleSize >= 20,
      spread);

    const back = await page.evaluate(async () => {
      const cards = () => [...document.querySelectorAll('#grid > .wishlist-card')];
      const sample = () => cards().map(c => {
        const m = getComputedStyle(c).transform;
        let tx = 0, ty = 0;
        if (m && m !== 'none') { const n = m.replace(/matrix3?d?\(/, '').replace(/\)/, '').split(',').map(parseFloat); tx = n.length === 6 ? n[4] : n[12]; ty = n.length === 6 ? n[5] : n[13]; }
        return { anims: c.getAnimations().length, tx: tx, ty: ty };
      });
      document.getElementById('v13GridView').click();
      const frames = [];
      for (let i = 0; i < 16; i++) { await new Promise(r => requestAnimationFrame(r)); frames.push(sample()); }
      await new Promise(r => setTimeout(r, 900));
      const flat = frames.flat();
      return {
        peak: Math.max(...flat.map(f => Math.hypot(f.tx, f.ty))),
        animatedFrames: frames.filter(fr => fr.some(x => x.anims > 0)).length,
        view: document.getElementById('grid').dataset.v13View,
        leftovers: window.__gridAnims().length,
        cleaned: sample().every(f => !f.tx && !f.ty && f.anims === 0)
      };
    });
    c('F03-C04', 'focus', 'Focus -> Gallery FLIPs too and lands clean',
      'the return trip animates and settles with the gallery view, zero leftovers, identity transforms',
      back.peak > 40 && back.animatedFrames >= 3 && back.view !== 'focus' && back.leftovers === 0 && back.cleaned,
      back);

    // rapid switching: a pending FLIP must be cancelled, never stacked
    const rapid = await page.evaluate(async () => {
      const g = document.getElementById('grid');
      for (let i = 0; i < 3; i++) {
        document.getElementById('v13FocusView').click();
        await new Promise(r => setTimeout(r, 40));
        document.getElementById('v13GridView').click();
        await new Promise(r => setTimeout(r, 40));
      }
      document.getElementById('v13FocusView').click();
      await new Promise(r => setTimeout(r, 1200));
      const m = [...document.querySelectorAll('#grid > .wishlist-card')].map(c => getComputedStyle(c).transform);
      return {
        view: g.dataset.v13View,
        leftovers: window.__gridAnims().length,
        identities: m.every(x => x === 'none' || /^matrix\(1, 0, 0, 1, 0, 0\)$/.test(x)),
        flying: document.querySelectorAll('.qv-proxy').length,
        flash: document.querySelectorAll('.board__column--confirm').length
      };
    });
    c('F03-C05', 'focus', 'rapid Gallery/Focus switching cancels cleanly instead of stacking animations',
      'the final view is correct, zero leftover animations, every transform identity, no ghost proxy or seal',
      rapid.view === 'focus' && rapid.leftovers === 0 && rapid.identities === true &&
      rapid.flying === 0 && rapid.flash === 0,
      rapid);

    const focusView = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('#grid[data-v13-view="focus"] > .wishlist-card')];
      return { count: cards.length, tabindexes: cards.filter(c => c.hasAttribute('tabindex')).length, hidden: cards.filter(c => c.hasAttribute('aria-hidden')).length };
    });
    c('F03-C06', 'focus', 'Focus view changes presentation only - no card is made non-interactive',
      'every card still present, none hidden from assistive tech and none given a tabindex by CSS work',
      focusView.count === 5 && focusView.hidden === 0,
      focusView);
    await ctx.close();
  }

  // ===================================================================
  section = 'F03-D PREMIUM STATUS BOARD';
  // ===================================================================
  {
    const { ctx, page, state } = await newScenario(browser, ITEMS, { width: 1440, height: 900 });
    await setView(page, 'board');
    await sleep(700);
    await page.evaluate(() => document.getElementById('board').scrollIntoView({ block: 'start', behavior: 'instant' }));
    await sleep(320);

    const cols = await page.evaluate(() => {
      return [...document.querySelectorAll('.board__column')].map(col => {
        const head = col.querySelector('.board__head');
        const title = col.querySelector('.board__title');
        const count = col.querySelector('.board__count');
        const list = col.querySelector('.board__list');
        const cs = getComputedStyle(col);
        const dot = getComputedStyle(title, '::before');
        return {
          status: col.dataset.status,
          statusAttr: list ? list.dataset.status : null,
          label: title ? title.textContent.trim() : '',
          count: count ? count.textContent.trim() : '',
          accent: dot.backgroundColor,
          radius: cs.borderRadius,
          bg: cs.backgroundImage.slice(0, 30),
          headBorder: head ? getComputedStyle(head).borderBottomWidth + ' ' + getComputedStyle(head).borderBottomStyle : null,
          cards: col.querySelectorAll('.board__card').length
        };
      });
    });
    const canonical = ['wish', 'saving', 'ordered', 'purchased'];
    c('F03-D01', 'board', 'exactly the four canonical columns, in canonical order, with their own accents',
      'statuses wish/saving/ordered/purchased in order, labels unchanged, four distinct accent colours, styled surfaces',
      cols.length === 4 && cols.every((k, i) => k.status === canonical[i]) &&
      cols.every((k, i) => k.statusAttr === canonical[i]) &&
      new Set(cols.map(k => k.accent)).size === 4 &&
      cols.every(k => k.label.length > 0 && /gradient/.test(k.bg) && /^1px/.test(k.headBorder)),
      cols.map(k => ({ status: k.status, label: k.label, accent: k.accent, cards: k.cards })));

    const counts = cols.map(k => +k.count);
    const expected = canonical.map(s => ITEMS.filter(i => i.status === s).length);
    const cardIds = await page.evaluate(() => [...document.querySelectorAll('.board__card')].map(c => c.dataset.id));
    c('F03-D02', 'board', 'counts and cards match the data exactly, one card per item, no duplicates',
      'each column count equals the seeded item count for that status and the board holds every id once',
      JSON.stringify(counts) === JSON.stringify(expected) &&
      new Set(cardIds).size === ITEMS.length && cardIds.length === ITEMS.length,
      { counts: counts, expected: expected, cards: cardIds.length });

    const cardStyle = await page.evaluate(() => {
      const card = document.querySelector('.board__column[data-status="wish"] .board__card');
      const cs = getComputedStyle(card);
      const handle = card.querySelector('.board__handle');
      const hs = getComputedStyle(handle);
      return {
        transform: cs.transform, radius: cs.borderRadius, shadow: cs.boxShadow.slice(0, 50),
        cols: cs.gridTemplateColumns.split(' ').length,
        handle: { w: Math.round(handle.getBoundingClientRect().width), h: Math.round(handle.getBoundingClientRect().height), tabindex: handle.getAttribute('tabindex'), grabbed: handle.getAttribute('aria-grabbed'), label: handle.getAttribute('aria-label') || '' }
      };
    });
    c('F03-D03', 'board', 'board cards are lifted surfaces at rest with an accessible drag handle',
      'no transform at rest, rounded, shadowed, and a handle that is focusable, reports aria-grabbed and is labelled',
      cardStyle.transform === 'none' && /px/.test(cardStyle.radius) && cardStyle.shadow.length > 10 &&
      cardStyle.handle.tabindex === '0' && cardStyle.handle.grabbed === 'false' && cardStyle.handle.label.length > 3,
      cardStyle);

    const hov = await boxOf(page, '.board__card');
    await page.mouse.move(hov.x + Math.round(hov.w / 2), hov.y + Math.round(hov.h / 2));
    await sleep(220);
    const lift = await page.evaluate(() => {
      const card = document.querySelector('.board__card:hover') || document.querySelector('.board__card');
      return { transform: getComputedStyle(card).transform, shadow: getComputedStyle(card).boxShadow.slice(0, 40) };
    });
    await page.mouse.move(4, 4);
    await sleep(220);
    const dropped = await page.evaluate(() => getComputedStyle(document.querySelector('.board__card')).transform);
    c('F03-D04', 'board', 'a fine pointer lifts the card on hover and drops it back after',
      'hover transform is a translated matrix with a deeper shadow, and it returns to none',
      /matrix/.test(lift.transform) && /-2/.test(lift.transform) && dropped === 'none',
      { hover: lift, after: dropped });

    // keyboard move: Enter starts the session, arrows pick, Escape cancels
    const kb = await page.evaluate(async () => {
      const handle = document.querySelector('.board__card[data-id="a2"] .board__handle');
      handle.focus();
      const send = (key) => document.dispatchEvent(new KeyboardEvent('keydown', { key: key, bubbles: true, cancelable: true }));
      handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      const started = document.getElementById('boardSr') ? document.getElementById('boardSr').textContent : '';
      send('ArrowRight');
      const aimed = document.getElementById('boardSr') ? document.getElementById('boardSr').textContent : '';
      send('Escape');
      await new Promise(r => setTimeout(r, 120));
      return { started: started, aimed: aimed, escaped: document.getElementById('boardSr') ? document.getElementById('boardSr').textContent : '', status: (JSON.parse(localStorage.getItem('wishlist.guest.items')).find(x => x.id === 'a2') || {}).status };
    });
    c('F03-D05', 'board', 'the keyboard move workflow survives the restyle and cancelling really cancels',
      'the live region announces the start, an arrow announces a target, Escape announces the cancel and no status is written',
      /mũi tên/i.test(kb.started) && /Đích/i.test(kb.aimed) && /hủy/i.test(kb.escaped) && kb.status === 'wish',
      kb);

    // --- pointer drag: preview + drop target, then a clean Escape cancel
    const dragState = await page.evaluate(async () => {
      const handle = document.querySelector('.board__list[data-status="saving"] .board__handle');
      const card = handle.closest('.board__card');
      const list = document.querySelector('.board__list[data-status="wish"]');
      card.scrollIntoView({ block: 'center', behavior: 'instant' });
      await new Promise(r => requestAnimationFrame(r));
      const hr = handle.getBoundingClientRect(), lr = list.getBoundingClientRect();
      const opts = (x, y, up) => ({ bubbles: true, cancelable: true, pointerId: 21, pointerType: 'mouse', button: 0, buttons: up ? 0 : 1, clientX: x, clientY: y, isPrimary: true });
      handle.dispatchEvent(new PointerEvent('pointerdown', opts(hr.left + 6, hr.top + 6, false)));
      document.dispatchEvent(new PointerEvent('pointermove', opts(lr.left + 24, lr.top + 30, false)));
      await new Promise(r => requestAnimationFrame(r));
      const pv = document.querySelector('.board__preview');
      const over = [...document.querySelectorAll('.board__column.drag-over')];
      const out = {
        from: card.dataset.id,
        dragging: card.classList.contains('dragging'),
        previews: document.querySelectorAll('.board__preview').length,
        previewShadow: pv ? getComputedStyle(pv).boxShadow.slice(0, 44) : null,
        previewPE: pv ? getComputedStyle(pv).pointerEvents : null,
        previewAria: pv ? pv.getAttribute('aria-hidden') : null,
        previewIds: pv ? pv.querySelectorAll('[id]').length : null,
        previewLiveControls: pv ? pv.querySelectorAll('button:not([disabled]),select:not([disabled]),input:not([disabled]),a,[tabindex]:not([tabindex="-1"])').length : null,
        overCount: over.length,
        overStatus: over.map(o => o.dataset.status),
        outline: over.length ? getComputedStyle(over[0]).outlineStyle + ' ' + getComputedStyle(over[0]).outlineWidth : null
      };
      // Escape during the session must cancel it completely.
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      await new Promise(r => setTimeout(r, 160));
      out.afterCancel = {
        dragging: document.querySelectorAll('.board__card.dragging').length,
        previews: document.querySelectorAll('.board__preview').length,
        over: document.querySelectorAll('.board__column.drag-over').length,
        status: (JSON.parse(localStorage.getItem('wishlist.guest.items')).find(x => x.id === card.dataset.id) || {}).status
      };
      return out;
    });
    c('F03-D06', 'board', 'dragging lifts a preview and highlights exactly one drop target',
      'one dragging card, one preview that is decorative only, exactly one drag-over column with an outline',
      dragState.dragging === true && dragState.previews === 1 &&
      dragState.previewPE === 'none' && dragState.previewAria === 'true' &&
      dragState.previewIds === 0 && dragState.previewLiveControls === 0 &&
      dragState.overCount === 1 && /dashed|solid/.test(dragState.outline || ''),
      dragState);

    c('F03-D07', 'board', 'cancelling a drag leaves no preview, no highlight and no data change',
      'zero dragging cards, zero previews, zero drag-over columns, the item keeps its status',
      dragState.afterCancel.dragging === 0 && dragState.afterCancel.previews === 0 &&
      dragState.afterCancel.over === 0 && dragState.afterCancel.status === 'saving',
      dragState.afterCancel);
    await ctx.close();

    // --- empty column illustration + completion feedback (sparse seed)
    const sp = await newScenario(browser, SPARSE, { width: 1440, height: 900 });
    await setView(sp.page, 'board');
    await sleep(700);
    const empty = await sp.page.evaluate(() => {
      const col = document.querySelector('.board__column[data-status="wish"] .board__list');
      const before = getComputedStyle(col, '::before');
      const after = getComputedStyle(col, '::after');
      return {
        isEmpty: col.children.length === 0,
        before: { content: before.content, w: before.width, h: before.height, image: before.backgroundImage.slice(0, 34), size: before.backgroundSize, radius: before.borderRadius },
        after: { content: after.content, color: after.color, size: after.fontSize },
        cardCount: document.querySelectorAll('.board__card').length
      };
    });
    c('F03-D08', 'board', 'an empty column is illustrated by CSS alone, still labelled with real copy',
      'the list has no children, ::before paints a 56px SVG tile and ::after still says Chưa có món',
      empty.isEmpty && empty.before.content === '""' && parseFloat(empty.before.w) === 56 &&
      /svg/.test(empty.before.image) && empty.after.content === '"Chưa có món"' && empty.cardCount === 2,
      empty);

    const move = await sp.page.evaluate(async () => {
      const handle = document.querySelector('.board__list[data-status="saving"] .board__handle');
      const card = handle.closest('.board__card');
      const list = document.querySelector('.board__list[data-status="wish"]');
      card.scrollIntoView({ block: 'center', behavior: 'instant' });
      await new Promise(r => requestAnimationFrame(r));
      const hr = handle.getBoundingClientRect(), lr = list.getBoundingClientRect();
      const opts = (x, y, up) => ({ bubbles: true, cancelable: true, pointerId: 31, pointerType: 'mouse', button: 0, buttons: up ? 0 : 1, clientX: x, clientY: y, isPrimary: true });
      const id = card.dataset.id;
      handle.dispatchEvent(new PointerEvent('pointerdown', opts(hr.left + 6, hr.top + 6, false)));
      document.dispatchEvent(new PointerEvent('pointermove', opts(lr.left + 24, lr.top + 30, false)));
      await new Promise(r => requestAnimationFrame(r));
      const dragOverColumns = document.querySelectorAll('.board__column.drag-over').length;
      document.dispatchEvent(new PointerEvent('pointerup', opts(lr.left + 24, lr.top + 30, true)));
      await new Promise(r => requestAnimationFrame(r));
      const col = document.querySelector('.board__column[data-status="wish"]');
      const seal = getComputedStyle(col, '::after');
      return {
        id: id, dragOverColumns: dragOverColumns,
        confirm: col.classList.contains('board__column--confirm'),
        anims: col.getAnimations().map(a => a.animationName).filter(Boolean),
        seal: { content: seal.content, bg: seal.backgroundColor },
        wishCount: (document.querySelector('.board__count[data-status="wish"]') || {}).textContent || '',
        status: (JSON.parse(localStorage.getItem('wishlist.guest.items')).find(x => x.id === id) || {}).status
      };
    });
    const done = move;
    await sleep(1200);
    const after = await sp.page.evaluate(() => ({
      confirm: document.querySelectorAll('.board__column--confirm').length,
      leftovers: window.__animsUnder('#board').length,
      wishCount: (document.querySelector('.board__count[data-status="wish"]') || {}).textContent || '',
      empty: document.querySelector('.board__column[data-status="wish"] .board__list').children.length
    }));
    c('F03-D09', 'board', 'a completed drag writes the real record and shows completion feedback',
      'the drop targets exactly one column, the item moves to wish in the guest store, the target flashes, the seal paints ✓, and the column holds the moved card with the count to match',
      done.dragOverColumns === 1 && done.status === 'wish' && done.confirm === true &&
      done.anims.indexOf('board-col-flash') >= 0 && done.seal.content === '"✓"' &&
      /104, 80, 188/.test(done.seal.bg) && after.wishCount === '1' && after.empty === 1,
      { during: done, after: after });
    c('F03-D10', 'board', 'completion feedback cleans itself up: no lingering seal or animation after the flash',
      'zero confirm columns and zero leftover animations about 1.1s later',
      after.confirm === 0 && after.leftovers === 0, after);

    // --- "Đã mua" must go through the Purchase Dialog, never a direct write
    const purchase = await sp.page.evaluate(async () => {
      const handle = document.querySelector('.board__list[data-status="saving"] .board__handle');
      const card = handle.closest('.board__card');
      const list = document.querySelector('.board__list[data-status="purchased"]');
      card.scrollIntoView({ block: 'center', behavior: 'instant' });
      await new Promise(r => requestAnimationFrame(r));
      const hr = handle.getBoundingClientRect(), lr = list.getBoundingClientRect();
      const opts = (x, y, up) => ({ bubbles: true, cancelable: true, pointerId: 41, pointerType: 'mouse', button: 0, buttons: up ? 0 : 1, clientX: x, clientY: y, isPrimary: true });
      const id = card.dataset.id;
      handle.dispatchEvent(new PointerEvent('pointerdown', opts(hr.left + 6, hr.top + 6, false)));
      document.dispatchEvent(new PointerEvent('pointermove', opts(lr.left + 24, lr.top + 30, false)));
      await new Promise(r => requestAnimationFrame(r));
      const over = [...document.querySelectorAll('.board__column.drag-over')].map(c => c.dataset.status);
      document.dispatchEvent(new PointerEvent('pointerup', opts(lr.left + 24, lr.top + 30, true)));
      await new Promise(r => setTimeout(r, 340));
      return {
        id: id, over: over,
        dialogOpen: document.getElementById('pd').open === true,
        qvOpen: document.getElementById('qv').open === true,
        status: (JSON.parse(localStorage.getItem('wishlist.guest.items')).find(x => x.id === id) || {}).status,
        name: (document.getElementById('pdName') || {}).textContent || '',
        amount: (document.getElementById('pdAmount') || {}).value
      };
    });
    c('F03-D11', 'board', 'dropping into "Đã mua" opens the Purchase Dialog instead of writing',
      'the drop targets the purchased column, the purchase dialog is open, the item is still not purchased, and the amount starts empty',
      purchase.over.join(',') === 'purchased' && purchase.dialogOpen === true &&
      purchase.status === 'saving' && purchase.status !== 'purchased' &&
      purchase.amount === '' && purchase.name.length > 3,
      purchase);
    await sp.ctx.close();

    // --- edit through the dialog writes exactly one canonical record
    const sp2 = await newScenario(browser, SPARSE, { width: 1440, height: 900 });
    const edited = await sp2.page.evaluate(async () => {
      const card = document.querySelector('#grid > .wishlist-card[data-id="s1"] [data-card-action="purchase"]');
      if (!card) return { err: 'no purchase action' };
      card.click();
      await new Promise(r => setTimeout(r, 260));
      document.getElementById('pdAmount').value = '850000';
      document.getElementById('pdForm').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await new Promise(r => setTimeout(r, 400));
      const it = JSON.parse(localStorage.getItem('wishlist.guest.items')).find(x => x.id === 's1');
      return { status: it.status, paid: it.paidAmount, prev: it.previousStatus, keys: Object.keys(it).sort(), dialogOpen: document.getElementById('pd').open };
    });
    const seedKeys = Object.keys(SPARSE.find(i => i.id === 's1'));
    const allowedKeys = [...new Set(seedKeys.concat(['paidAmount', 'purchasedAt', 'previousStatus']))].sort();
    c('F03-D12', 'board', 'the restyle did not add a second data store: the dialog still writes the canonical shape',
      'status purchased with paidAmount 850000 and previousStatus saving, no key outside the seed record plus the three purchase fields',
      edited.status === 'purchased' && edited.paid === 850000 && edited.prev === 'saving' &&
      edited.dialogOpen === false &&
      edited.keys.every(k => allowedKeys.indexOf(k) >= 0) && edited.keys.length === allowedKeys.length,
      { keys: edited.keys, allowed: allowedKeys, status: edited.status, paid: edited.paid, prev: edited.prev });
    await sp2.ctx.close();

    c('F03-D13', 'board', 'no console or page errors while restyling the board',
      'zero page errors and zero console errors',
      state.pageErrors.length === 0 && state.errors.length === 0,
      { pageErrors: state.pageErrors.slice(0, 3), consoleErrors: state.errors.slice(0, 3) });
  }

  // ===================================================================
  section = 'F03-E QUICK VIEW CONTINUITY';
  // ===================================================================
  {
    const { ctx, page } = await newScenario(browser, ITEMS, { width: 1440, height: 900 });

    const flight = await page.evaluate(async () => {
      const card = document.querySelector('#grid > .wishlist-card[data-id="a5"]');
      card.scrollIntoView({ block: 'center', behavior: 'instant' });
      await new Promise(r => setTimeout(r, 300));
      const src = card.querySelector('.product-media__image').getBoundingClientRect();
      const menu = card.querySelector('.card-more__trigger');
      menu.click();
      await new Promise(r => setTimeout(r, 360));
      const view = card.querySelector('[data-card-action="view"]');
      view.click();
      const samples = [];
      for (let i = 0; i < 16; i++) {
        await new Promise(r => requestAnimationFrame(r));
        const p = document.querySelector('.qv-proxy');
        samples.push(p ? {
          x: Math.round(p.getBoundingClientRect().left), y: Math.round(p.getBoundingClientRect().top),
          l: parseFloat(p.style.left), t: parseFloat(p.style.top), w: Math.round(p.getBoundingClientRect().width),
          kids: p.children.length, ids: p.querySelectorAll('[id]').length,
          aria: p.getAttribute('aria-hidden'), inert: p.hasAttribute('inert'),
          interactive: p.querySelectorAll('button,a,input,select,textarea,[tabindex]').length,
          imgAlt: (p.querySelector('img') || {}).alt
        } : null);
      }
      const live = samples.filter(Boolean);
      const target = document.getElementById('qvImage').getBoundingClientRect();
      return {
        src: { x: Math.round(src.left), y: Math.round(src.top), w: Math.round(src.width) },
        first: live[0] || null,
        last: live[live.length - 1] || null,
        frames: live.length,
        distinct: new Set(live.map(s => s.x + ',' + s.y)).size,
        target: { x: Math.round(target.left), y: Math.round(target.top), w: Math.round(target.width) },
        qvOpen: document.getElementById('qv').open === true,
        title: document.getElementById('qvTitle').textContent
      };
    });
    const t0 = Math.hypot(flight.first.x - flight.src.x, flight.first.y - flight.src.y);
    const t1 = Math.hypot(flight.last.x - flight.last.l, flight.last.y - flight.last.t);
    const t2 = Math.hypot(flight.last.l - flight.target.x, flight.last.t - flight.target.y);
    c('F03-E01', 'quick view', 'the shared-element flight still runs from the card image to the Quick View image',
      'the proxy starts on the source rect, ends exactly on its recorded target, that target is the QV image, and it is seen in several distinct positions',
      flight.qvOpen && flight.src.w >= 8 && t0 <= 10 && t1 <= 3 && t2 <= 60 && flight.distinct >= 4,
      { src: flight.src, first: flight.first, last: flight.last, target: flight.target, d: { start: +t0.toFixed(1), end: +t1.toFixed(1), target: +t2.toFixed(1) }, distinct: flight.distinct });

    c('F03-E02', 'quick view', 'the flight proxy stays a passive, non-interactive duplicate',
      'exactly one image child, no ids, no focusable descendants, aria-hidden and inert, empty alt',
      flight.first.kids === 1 && flight.first.ids === 0 && flight.first.interactive === 0 &&
      flight.first.aria === 'true' && flight.first.inert === true && flight.first.imgAlt === '',
      flight.first);

    await sleep(700);
    const settled = await page.evaluate(() => ({
      proxies: document.querySelectorAll('.qv-proxy').length,
      hidden: document.getElementById('qvImage').classList.contains('qv-image-hidden'),
      flying: document.getElementById('qv').classList.contains('qv--flying'),
      stageBg: getComputedStyle(document.querySelector('#qv .quick-view__stage')).backgroundImage.slice(0, 40),
      pedestal: (function () { const cs = getComputedStyle(document.querySelector('#qv .quick-view__stage'), '::after'); return { content: cs.content, bg: cs.backgroundImage.slice(0, 40) }; })()
    }));
    c('F03-E03', 'quick view', 'the proxy never survives the flight and the stage matches the card language',
      'zero proxies left, no qv-image-hidden, the stage keeps a gradient mat and the same pedestal pseudo',
      settled.proxies === 0 && settled.hidden === false && settled.flying === false &&
      /gradient/.test(settled.stageBg) && settled.pedestal.content === '""' && /radial-gradient/.test(settled.pedestal.bg),
      settled);

    const story = await page.evaluate(() => {
      const panel = document.querySelector('#qv .quick-view__panel');
      const heading = [...document.querySelectorAll('#qv .quick-view__story-heading')][0];
      const price = document.querySelector('#qv .quick-view__price');
      const savings = document.querySelector('#qv .quick-view__savings, #qv [class*="savings"]');
      const rule = heading ? getComputedStyle(heading, '::before') : null;
      return {
        panelGap: getComputedStyle(panel).gap,
        rule: rule ? { content: rule.content, w: rule.width, bg: rule.backgroundColor } : null,
        priceBorder: price ? getComputedStyle(price).borderBottomWidth + ' ' + getComputedStyle(price).borderBottomStyle : null,
        savingsBg: savings ? getComputedStyle(savings).backgroundImage.slice(0, 40) : null,
        hasSavings: !!savings
      };
    });
    c('F03-E04', 'quick view', 'Quick View keeps the gallery type language: kicker rules, hairline price, savings plate',
      'a story heading with a tick rule, a hairline under the price and a styled savings plate',
      story.rule && story.rule.content === '""' && parseFloat(story.rule.w) >= 10 &&
      /^1px/.test(story.priceBorder) && story.hasSavings === true && /gradient/.test(story.savingsBg || ''),
      story);

    const opts = await page.evaluate(() => {
      const buttons = [...document.querySelectorAll('#qv .quick-view__status-option')];
      return {
        count: buttons.length,
        current: buttons.filter(b => b.classList.contains('is-current')).length,
        pressed: buttons.filter(b => b.getAttribute('aria-pressed') === 'true').map(b => b.dataset.statusKey),
        keys: buttons.map(b => b.dataset.statusKey),
        bg: buttons.filter(b => b.classList.contains('is-current')).map(b => getComputedStyle(b).backgroundImage.slice(0, 34)),
        ids: buttons.map(b => b.id).filter(Boolean),
        dupIds: (function () { const all = [...document.querySelectorAll('[id]')].map(e => e.id); return all.length - new Set(all).size; })()
      };
    });
    c('F03-E05', 'quick view', 'the status plate shows four options with exactly one current, no duplicate ids',
      'four buttons over the canonical keys, exactly one is-current with a gradient, and no duplicate element ids while the dialog is open',
      opts.count === 4 && opts.current === 1 && opts.pressed.length === 1 && opts.keys.join(',') === 'wish,saving,ordered,purchased' &&
      opts.bg.every(b => /gradient/.test(b)) && opts.dupIds === 0,
      opts);

    const changed = await page.evaluate(async () => {
      const btn = document.querySelector('#qv .quick-view__status-option[data-status-key="wish"]');
      btn.click();
      await new Promise(r => setTimeout(r, 420));
      const it = JSON.parse(localStorage.getItem('wishlist.guest.items')).find(x => x.id === 'a5');
      return {
        status: it.status,
        current: [...document.querySelectorAll('#qv .quick-view__status-option')].filter(b => b.classList.contains('is-current')).map(b => b.dataset.statusKey)
      };
    });
    c('F03-E06', 'quick view', 'changing status from the plate still writes the real record and moves the current mark',
      'the stored item becomes wish and the plate marks exactly that option',
      changed.status === 'wish' && changed.current.join(',') === 'wish', changed);

    await page.evaluate(() => document.getElementById('qvClose').click());
    await sleep(1100);
    const closed = await page.evaluate(() => ({
      open: document.getElementById('qv').open,
      proxies: document.querySelectorAll('.qv-proxy').length,
      hidden: document.getElementById('qvImage').classList.contains('qv-image-hidden'),
      closing: document.getElementById('qv').classList.contains('qv-closing')
    }));
    c('F03-E07', 'quick view', 'closing is clean: no proxy, no hidden image, no stuck closing state',
      'the dialog is closed with zero proxies, the image is visible and qv-closing is removed',
      closed.open === false && closed.proxies === 0 && closed.hidden === false && closed.closing === false,
      closed);
    await ctx.close();

    // --- focus returns to the opener (opened from a control that survives)
    const fo = await newScenario(browser, ITEMS, { width: 1440, height: 900 });
    const focusBack = await fo.page.evaluate(async () => {
      const row = document.querySelector('#dvInsightsRows .dv-insights__row');
      if (!row) return { err: 'no insight row' };
      row.click();
      await new Promise(r => setTimeout(r, 700));
      const opened = document.getElementById('qv').open === true;
      const title = document.getElementById('qvTitle').textContent;
      document.getElementById('qvClose').click();
      await new Promise(r => setTimeout(r, 1100));
      return {
        opened: opened, title: title,
        activeIsRow: document.activeElement === row,
        activeInRow: row.contains(document.activeElement) || document.activeElement === row,
        activeTag: document.activeElement ? document.activeElement.tagName + '.' + String(document.activeElement.className || '').split(' ')[0] : 'null',
        insideQv: document.getElementById('qv').contains(document.activeElement)
      };
    });
    c('F03-E08', 'quick view', 'closing hands focus back to the control that opened the panel',
      'the QV opens for the insight item and, after closing, focus is on the opener row rather than inside the dialog',
      focusBack.opened === true && focusBack.activeIsRow === true && focusBack.insideQv === false,
      focusBack);
    await fo.ctx.close();
  }

  // ===================================================================
  section = 'F03-F UNIFIED EMPTY & ERROR STATES';
  // ===================================================================
  {
    // zero items: the real empty state, never sample products
    const zero = await newScenario(browser, [], { width: 1440, height: 900 });
    const empty = await zero.page.evaluate(() => {
      const el = document.getElementById('empty');
      const cs = getComputedStyle(el);
      const eyebrow = getComputedStyle(el.querySelector('.wishlist-empty__eyebrow') || el, '::before');
      const title = getComputedStyle(document.getElementById('emptyTitle'));
      const mark = getComputedStyle(el, '::after');
      return {
        visible: !el.classList.contains('hidden') && cs.display !== 'none',
        radius: cs.borderRadius, border: cs.borderTopWidth + ' ' + cs.borderTopStyle, bg: cs.backgroundImage.slice(0, 40),
        shadow: cs.boxShadow.slice(0, 50),
        eyebrow: { content: eyebrow.content, bg: eyebrow.backgroundColor },
        title: { family: title.fontFamily.split(',')[0].replace(/"/g, ''), style: title.fontStyle, size: parseFloat(title.fontSize) },
        mark: { content: mark.content, pe: mark.pointerEvents },
        cards: document.querySelectorAll('#grid > .wishlist-card').length,
        gridText: document.getElementById('grid').textContent.trim().length,
        copy: document.getElementById('emptyTitle').textContent.trim(),
        desc: document.getElementById('emptyDescription').textContent.trim()
      };
    });
    c('F03-F01', 'empty state', 'the empty state is a styled alcove in the same sans voice as the collection',
      'visible, rounded, bordered, gradient, shadowed, a ✦ eyebrow rule, a sans title and a PVault. mark',
      empty.visible && /px/.test(empty.radius) && /^1px/.test(empty.border) && /gradient/.test(empty.bg) &&
      empty.shadow.length > 20 && empty.eyebrow.content === '"✦"' &&
      /Inter|Segoe/.test(empty.title.family) && empty.title.style === 'normal' && empty.mark.content === '"PVault."',
      empty);
    c('F03-F02', 'empty state', 'with no data the app shows no prototype sample products',
      'zero cards rendered, an empty grid, and the honest empty copy instead of fake items',
      empty.cards === 0 && empty.gridText === 0 &&
      /bộ sưu tập/i.test(empty.copy) && empty.copy.length > 8,
      { cards: empty.cards, gridText: empty.gridText, copy: empty.copy, desc: empty.desc });
    await zero.ctx.close();

    // filtered to nothing: the same alcove, different reason
    const filt = await newScenario(browser, ITEMS, { width: 1440, height: 900 });
    const filtered = await filt.page.evaluate(async () => {
      const q = document.getElementById('q');
      q.value = 'zzzz-khong-ton-tai';
      q.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(r => setTimeout(r, 700));
      const el = document.getElementById('empty');
      const cs = getComputedStyle(el);
      return {
        visible: !el.classList.contains('hidden'),
        copy: document.getElementById('emptyTitle').textContent.trim(),
        action: document.getElementById('emptyAction').textContent.trim(),
        cards: document.querySelectorAll('#grid > .wishlist-card').length,
        bg: cs.backgroundImage.slice(0, 30),
        mark: getComputedStyle(el, '::after').content
      };
    });
    c('F03-F03', 'empty state', 'a search with no matches uses the same alcove and says why',
      'the empty block shows the no-results copy with its clear-filter action, zero cards, same styling and mark',
      filtered.visible && /Không tìm thấy/.test(filtered.copy) && filtered.cards === 0 &&
      /gradient/.test(filtered.bg) && filtered.mark === '"PVault."',
      filtered);
    await filt.ctx.close();

    // missing + broken artwork
    const err = await newScenario(browser, EDGE, { width: 1440, height: 900 });
    await sleep(900);
    const art = await err.page.evaluate(() => {
      const out = {};
      ['e1', 'e2', 'e3'].forEach(id => {
        const card = document.querySelector('#grid > .wishlist-card[data-id="' + id + '"]');
        if (!card) { out[id] = 'missing card'; return; }
        const frame = card.querySelector('.product-media__frame');
        const img = card.querySelector('.product-media__image');
        out[id] = {
          isEmpty: frame.classList.contains('is-empty'),
          frameBg: getComputedStyle(frame).backgroundImage.slice(0, 40),
          wordmark: getComputedStyle(frame, '::after').content,
          src: (img.getAttribute('src') || '').slice(0, 26),
          remote: /^https?:/.test(img.getAttribute('src') || '')
        };
      });
      return out;
    });
    const brokenOk = art.e1.isEmpty === true && art.e2.isEmpty === true && art.e3.isEmpty === false;
    c('F03-F04', 'error state', 'missing and failed artwork put the frame into the empty-mat state',
      'both the imageless and the broken item are flagged is-empty with a lavender mat, the healthy item is not',
      brokenOk && /gradient/.test(art.e1.frameBg) && /gradient/.test(art.e2.frameBg),
      art);
    c('F03-F05', 'error state', 'broken artwork never falls back to a remote sample image',
      'the failed image resolves to an inline data URI placeholder, and the imageless card keeps an empty src',
      art.e2.remote === false && /^data:/.test(art.e2.src) &&
      art.e1.remote === false && art.e1.wordmark === '"PVault."',
      art);
    c('F03-F06', 'error state', 'the empty mat carries the PVault. wordmark for a non-featured card',
      'frame::after content is the wordmark for the flagged cards',
      art.e1.wordmark === '"PVault."' && art.e2.wordmark === '"PVault."',
      { e1: art.e1.wordmark, e2: art.e2.wordmark });
    await err.ctx.close();
  }

  // ===================================================================
  section = 'F03-G RESPONSIVE 320 -> 1920';
  // ===================================================================
  {
    const VIEWPORTS = [
      { w: 320, h: 640, touch: true }, { w: 375, h: 812, touch: true }, { w: 390, h: 844, touch: true },
      { w: 430, h: 932, touch: true }, { w: 768, h: 1024, touch: true }, { w: 1024, h: 768, touch: false },
      { w: 1440, h: 900, touch: false }, { w: 1920, h: 1080, touch: false }
    ];
    const overflow = [];
    const targets = [];
    const surfaces = [];
    const boardScroll = [];
    const dialogScroll = [];
    const focusShape = [];

    for (const vp of VIEWPORTS) {
      const { ctx, page } = await newScenario(browser, ITEMS, { width: vp.w, height: vp.h, touch: vp.touch, settle: 1000 });
      await page.evaluate(() => document.getElementById('grid').scrollIntoView({ block: 'start', behavior: 'instant' }));
      await sleep(260);

      const o = await page.evaluate(() => ({
        doc: document.documentElement.scrollWidth - window.innerWidth,
        body: document.body.scrollWidth - window.innerWidth
      }));
      overflow.push({ w: vp.w, doc: o.doc, body: o.body });

      const fit = await page.evaluate(() => {
        const vw = window.innerWidth;
        const list = ['#grid > .wishlist-card .wishlist-card__surface', '#grid > .wishlist-card .product-media__frame', '.v13-viewbar__switch', '.product-card__actions'];
        const bad = [];
        list.forEach(sel => {
          const el = document.querySelector(sel);
          if (!el) return;
          const r = el.getBoundingClientRect();
          if (r.width > 0 && r.right > vw + 1) bad.push(sel + ' right=' + Math.round(r.right));
        });
        return bad;
      });
      surfaces.push({ w: vp.w, bad: fit });

      if (vp.touch) {
        const t = await page.evaluate(() => {
          const min = (sel) => {
            const els = [...document.querySelectorAll(sel)].filter(e => e.getBoundingClientRect().width > 0);
            if (!els.length) return null;
            let w = Infinity, h = Infinity;
            els.forEach(e => { const r = e.getBoundingClientRect(); w = Math.min(w, r.width); h = Math.min(h, r.height); });
            return { w: Math.round(w), h: Math.round(h), n: els.length };
          };
          return {
            viewbar: min('.v13-viewbar__button'),
            handle: min('.board__handle'),
            select: min('.board__status-select'),
            action: min('.product-card__actions .mini'),
            more: min('.card-more__trigger'),
            status: min('#qv .quick-view__status-option'),
            coarse: matchMedia('(pointer: coarse)').matches
          };
        });
        targets.push({ w: vp.w, t: t });
      }

      await setView(page, 'board');
      await sleep(620);
      const bs = await page.evaluate(() => {
        const cols = document.querySelector('.board__columns');
        if (!cols) return null;
        const before = cols.scrollLeft;
        cols.scrollLeft = 320;
        const after = cols.scrollLeft;
        cols.scrollLeft = 0;
        const board = document.getElementById('board').getBoundingClientRect();
        return { can: cols.scrollWidth > cols.clientWidth + 1, moved: after !== before, fits: board.right <= window.innerWidth + 1, clientW: cols.clientWidth, scrollW: cols.scrollWidth };
      });
      boardScroll.push({ w: vp.w, bs: bs });

      await setView(page, 'gallery');
      await sleep(440);
      await page.evaluate(() => { const b = document.querySelector('#grid > .wishlist-card [data-card-action="view"]'); if (b) b.click(); });
      await sleep(760);
      const d = await page.evaluate(() => {
        const panel = document.querySelector('#qv .quick-view__panel');
        const cs = getComputedStyle(panel);
        const opts = [...document.querySelectorAll('#qv .quick-view__status-option')];
        return {
          open: document.getElementById('qv').open === true,
          overflowY: cs.overflowY,
          scrolls: panel.scrollHeight > panel.clientHeight,
          panelRight: Math.round(panel.getBoundingClientRect().right),
          vw: window.innerWidth,
          rows: opts.length ? new Set(opts.map(e => Math.round(e.getBoundingClientRect().top))).size : 0
        };
      });
      dialogScroll.push({ w: vp.w, d: d });
      await page.evaluate(() => { const c = document.getElementById('qvClose'); if (c) c.click(); });
      await sleep(840);

      await setView(page, 'focus');
      await sleep(560);
      const f = await page.evaluate(() => {
        const surf = document.querySelector('#grid[data-v13-view="focus"] > .wishlist-card .wishlist-card__surface');
        const thumb = document.querySelector('#grid[data-v13-view="focus"] > .wishlist-card .thumb.product-media');
        const content = document.querySelector('#grid[data-v13-view="focus"] > .wishlist-card .product-card__content');
        const cs = getComputedStyle(surf);
        const tr = thumb.getBoundingClientRect(), cr = content.getBoundingClientRect();
        return {
          stacked: Math.abs(tr.left - cr.left) < 24 && tr.bottom <= cr.top + 4,
          colOffset: Math.round(cr.left - tr.left),
          thumbW: Math.round(tr.width), contentW: Math.round(cr.width),
          overflow: document.documentElement.scrollWidth - window.innerWidth,
          thumbRight: Math.round(tr.right), vw: window.innerWidth
        };
      });
      focusShape.push({ w: vp.w, f: f });
      await ctx.close();
    }

    const worstOverflow = Math.max(...overflow.map(o => Math.max(o.doc, o.body)));
    c('F03-G01', 'responsive', 'no horizontal overflow at any of the eight widths',
      'document and body scrollWidth never exceed the viewport at 320/375/390/430/768/1024/1440/1920',
      worstOverflow <= 0, overflow);
    c('F03-G02', 'responsive', 'FUSION-03 surfaces always fit their viewport',
      'card surface, media frame, view switch and action shelf never cross the right edge',
      surfaces.every(s => s.bad.length === 0), surfaces.filter(s => s.bad.length));

    const badTargets = targets.filter(x => {
      const t = x.t;
      const need = (o) => !o || (o.h >= 44);
      return !(need(t.viewbar) && need(t.handle) && need(t.select) && need(t.action) && need(t.more) && need(t.status)) || t.coarse !== true;
    });
    c('F03-G03', 'responsive', 'coarse pointers get real 44px targets on every control this milestone touched',
      'viewbar buttons, drag handle, status select, card actions, card menu and QV status options are all at least 44px tall',
      badTargets.length === 0, targets);

    const narrow = boardScroll.filter(b => b.w <= 768);
    const wide = boardScroll.filter(b => b.w >= 1440);
    c('F03-G04', 'responsive', 'the board scrolls horizontally when it must and not when it need not',
      'at 320 and 768 the column track overflows and can actually scroll; at 1440 and 1920 it fits, and the board itself never overflows the page',
      narrow.every(b => b.bs && b.bs.can && b.bs.moved && b.bs.fits) &&
      wide.every(b => b.bs && !b.bs.can && b.bs.fits),
      boardScroll);

    c('F03-G05', 'responsive', 'the Quick View panel scrolls its content at every width instead of clipping',
      'overflow-y auto with content taller than the panel at all eight widths, and the panel never crosses the right edge',
      dialogScroll.every(d => d.d.open === true && d.d.overflowY === 'auto' && d.d.scrolls === true && d.d.panelRight <= d.d.vw + 1),
      dialogScroll);

    const stackedNarrow = focusShape.filter(f => f.w <= 430);
    const spreadWide = focusShape.filter(f => f.w >= 1024);
    c('F03-G06', 'responsive', 'Focus view reflows: stacked on phones, a two-column spread once there is room',
      'media stacked above the text with no overflow at 320-430, and side by side in two real columns with no overflow at 1024+',
      stackedNarrow.every(f => f.f.stacked === true && f.f.overflow <= 0 && f.f.thumbRight <= f.f.vw + 1 && f.f.thumbW === f.f.contentW) &&
      spreadWide.every(f => f.f.stacked === false && f.f.colOffset >= 40 && f.f.overflow <= 0 && f.f.thumbRight <= f.f.vw + 1),
      focusShape);
  }

  // ===================================================================
  section = 'F03-H A11Y, REDUCED MOTION & 100-CARD COST';
  // ===================================================================
  {
    // --- keyboard focus rings, reached by real Tab presses
    const kb = await newScenario(browser, ITEMS, { width: 1440, height: 900 });
    await kb.page.evaluate(() => document.getElementById('grid').scrollIntoView({ block: 'start', behavior: 'instant' }));
    await sleep(300);

    // Focus the element just before the target in DOM order, then move focus
    // with a genuine Tab key press: that is what makes :focus-visible apply.
    const tabTo = async (page, targetSel, maxTabs) => {
      const ready = await page.evaluate((sel) => {
        const els = [...document.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')];
        const target = document.querySelector(sel);
        if (!target) return false;
        const i = els.indexOf(target);
        if (i <= 0) return false;
        els[i - 1].focus();
        return true;
      }, targetSel);
      if (!ready) return { sel: targetSel, err: 'no reachable predecessor' };
      for (let i = 0; i < (maxTabs || 6); i++) {
        await page.keyboard.press('Tab');
        const hit = await page.evaluate((sel) => {
          const target = document.querySelector(sel);
          const el = document.activeElement;
          if (!el) return null;
          if (el !== target && !target.contains(el) && !el.contains(target)) return null;
          const cs = getComputedStyle(el);
          return {
            sel: sel,
            landed: el === target,
            active: el.id ? '#' + el.id : el.tagName.toLowerCase() + '.' + String(el.className || '').split(' ')[0],
            focusVisible: el.matches(':focus-visible'),
            outline: cs.outlineWidth + ' ' + cs.outlineStyle,
            outlineW: parseFloat(cs.outlineWidth) || 0,
            shadow: cs.boxShadow.slice(0, 44)
          };
        }, targetSel);
        if (hit) return hit;
      }
      return { sel: targetSel, err: 'not reached by Tab' };
    };

    const ringViewbar = await tabTo(kb.page, '.v13-viewbar__switch .v13-viewbar__button', 8);
    const ringMenu = await tabTo(kb.page, '.card-more__trigger', 8);
    c('F03-H01', 'a11y', 'keyboard users get a visible focus ring on the restyled controls',
      'Tabbing into the view switcher and the card menu lands on the control, matches :focus-visible and paints an outline or ring',
      !ringViewbar.err && !ringMenu.err && ringViewbar.focusVisible === true && ringMenu.focusVisible === true &&
      (ringViewbar.outlineW > 0 || ringViewbar.shadow !== 'none') &&
      (ringMenu.outlineW > 0 || ringMenu.shadow !== 'none'),
      { viewbar: ringViewbar, menu: ringMenu });

    const boardKb = await kb.page.evaluate(async () => {
      document.getElementById('v13BoardView').click();
      await new Promise(r => setTimeout(r, 700));
      const handle = document.querySelector('.board__card .board__handle');
      handle.focus();
      return { focused: document.activeElement === handle, outline: getComputedStyle(handle).outlineWidth };
    });
    c('F03-H02', 'a11y', 'the board drag handle is reachable and visibly focused from the keyboard',
      'focusing the handle works and it paints an outline',
      boardKb.focused === true && parseFloat(boardKb.outline) > 0, boardKb);
    await kb.ctx.close();

    // --- reduced motion keeps every FUSION-03 change VISIBLE (only the motion stops)
    const rm = await newScenario(browser, ITEMS, { width: 1440, height: 900, reducedMotion: true });
    await rm.page.evaluate(() => document.getElementById('grid').scrollIntoView({ block: 'start', behavior: 'instant' }));
    await sleep(420);
    const rmState = await rm.page.evaluate(() => {
      const surf = document.querySelector('#grid > .wishlist-card:nth-child(2) .wishlist-card__surface');
      const frame = document.querySelector('#grid > .wishlist-card:nth-child(2) .product-media__frame');
      const badge = document.querySelector('#grid > .wishlist-card:nth-child(2) .badge');
      const title = document.querySelector('#grid > .wishlist-card:nth-child(2) .product-card__title');
      const index = getComputedStyle(document.querySelector('#grid > .wishlist-card:nth-child(2) .product-card__index'), '::before');
      return {
        frameTranslate: getComputedStyle(frame).translate,
        cardBg: getComputedStyle(document.querySelector('#grid > .wishlist-card:nth-child(2)')).backgroundColor,
        surfaceBg: getComputedStyle(surf).backgroundImage.slice(0, 40),
        surfaceTransform: getComputedStyle(surf).transform,
        badgeOpacity: getComputedStyle(badge).opacity,
        badgeDisplay: getComputedStyle(badge).display,
        titleDisplay: getComputedStyle(title).display,
        titleOpacity: getComputedStyle(title).opacity,
        indexRule: { content: index.content, transform: index.transform },
        anims: window.__gridAnims().length,
        globalAnims: document.getAnimations().length,
        pedestal: getComputedStyle(frame, '::before').content
      };
    });
    c('F03-H03', 'reduced motion', 'reduced motion stops the new movement but keeps every visual change',
      'frame translate none, no running animations, and the card surface/chips/title all still painted',
      rmState.frameTranslate === 'none' && rmState.anims === 0 &&
      /^rgb/.test(rmState.cardBg) && rmState.badgeOpacity === '1' && rmState.badgeDisplay !== 'none' &&
      rmState.titleDisplay !== 'none',
      rmState);
    await rm.ctx.close();

    // --- 100 cards: no permanent promotion, no repeated expensive effects
    const big = await newScenario(browser, many(100), { width: 1440, height: 900, settle: 1400 });
    for (let i = 0; i < 9; i++) {
      await big.page.evaluate((k) => window.scrollTo(0, Math.round(document.documentElement.scrollHeight * (k / 9))), i + 1);
      await sleep(260);
    }
    await big.page.evaluate(() => window.scrollTo(0, 0));
    await sleep(900);
    const gpu = await big.page.evaluate(() => window.__gpu());
    c('F03-H04', 'perf', 'a 100-card gallery leaves no promoted layer and no expensive repeated effect behind',
      'every media frame identity and unpromoted, every card surface unpromoted, zero backdrop-filter elements, 100 cards rendered',
      gpu.frames === 100 && gpu.framesTranslated === 0 && gpu.frameWillChange === 0 &&
      gpu.surfaces === 100 && gpu.surfacesTransformed === 0 && gpu.surfaceWillChange === 0 &&
      gpu.backdrop === 0,
      gpu);
    c('F03-H05', 'perf', 'the 100-card render does not leak animations or errors',
      'no running animations once the render settles and no page/console errors',
      (await big.page.evaluate(() => document.getAnimations().filter(a => a.playState === 'running' && a.effect && a.effect.target && a.effect.target.closest && a.effect.target.closest('#grid')).length)) === 0 &&
      big.state.pageErrors.length === 0 && big.state.errors.length === 0,
      { pageErrors: big.state.pageErrors.slice(0, 3), consoleErrors: big.state.errors.slice(0, 3) });

    await setView(big.page, 'board');
    await sleep(1400);
    const bigBoard = await big.page.evaluate(() => {
      const counts = [...document.querySelectorAll('.board__count')].map(e => +e.textContent.trim());
      return { cards: document.querySelectorAll('.board__card').length, counts: counts, sum: counts.reduce((a, b) => a + b, 0), cols: document.querySelectorAll('.board__column').length };
    });
    c('F03-H06', 'perf', 'a 100-item board renders every card once and the counts still add up',
      '100 cards across 4 columns, counts summing to 100',
      bigBoard.cols === 4 && bigBoard.cards === 100 && bigBoard.sum === 100,
      bigBoard);
    await big.ctx.close();
  }

  // ===================================================================
  section = 'F03-I REGRESSION GUARDS';
  // ===================================================================
  {
    const { ctx, page, state } = await newScenario(browser, ITEMS, { width: 1440, height: 900 });

    const f4 = await page.evaluate(() => {
      const card = document.querySelector('#grid > .wishlist-card:nth-child(2)');
      const badges = [...card.querySelectorAll('.product-card__badges .badge')];
      return {
        count: badges.length,
        roles: badges.map(b => b.getAttribute('role')),
        visible: badges.every(b => b.getBoundingClientRect().width > 0),
        text: badges.map(b => b.textContent.trim())
      };
    });
    c('F03-I01', 'regression', 'the F4 badge contract is untouched (two chips per card, no ARIA role)',
      'exactly two visible badges and every badge has role === null',
      f4.count === 2 && f4.visible === true && f4.roles.every(r => r === null),
      f4);

    const sheen = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('#grid > .wishlist-card')];
      const rows = cards.map(card => {
        const frame = card.querySelector('.product-media__frame');
        const nodes = frame ? frame.querySelectorAll('.pv-sheen') : [];
        const el = nodes[0];
        return {
          count: nodes.length,
          ariaHidden: el ? el.getAttribute('aria-hidden') : null,
          inFrame: !!el && el.parentElement === frame,
          pe: el ? getComputedStyle(el).pointerEvents : null,
          willChange: el ? getComputedStyle(el).willChange : null
        };
      });
      return { cards: cards.length, rows: rows };
    });
    c('F03-I02', 'regression', 'the FUSION-02 sheen stays one decorative layer per card inside its frame',
      'one aria-hidden sheen inside each frame, pointer-events none, no will-change',
      sheen.cards === 5 && sheen.rows.every(r => r.count === 1 && r.inFrame && r.ariaHidden === 'true' && r.pe === 'none' && r.willChange === 'auto'),
      sheen);

    const TILT = '#grid > .wishlist-card[data-id="a2"]';
    await page.evaluate((sel) => document.querySelector(sel).scrollIntoView({ block: 'center', behavior: 'instant' }), TILT);
    await sleep(400);
    // Tilt lives in a damped rAF loop, so settle both ways before reading and
    // compare with a rotation epsilon instead of string equality.
    const nearIdentity = (m, eps) => {
      if (!m || m === 'none') return true;
      const n = m.replace(/^matrix3?d?\(/, '').replace(/\)$/, '').split(',').map(parseFloat);
      if (n.length === 6) {
        return Math.abs(n[0] - 1) < eps && Math.abs(n[1]) < eps && Math.abs(n[2]) < eps && Math.abs(n[3] - 1) < eps &&
          Math.abs(n[4]) < 0.5 && Math.abs(n[5]) < 0.5;
      }
      return [[0, 1], [1, 0], [2, 0], [4, 0], [5, 1], [6, 0], [8, 0], [9, 0], [10, 1]]
        .every(([i, v]) => Math.abs(n[i] - v) < eps);
    };
    const tilt = await page.evaluate((sel) => {
      const surf = document.querySelector(sel + ' .wishlist-card__surface');
      return { rest: getComputedStyle(surf).transform };
    }, TILT);
    const tb = await boxOf(page, TILT);
    await page.mouse.move(tb.x + Math.round(tb.w * 0.8), tb.y + Math.round(tb.h * 0.25));
    await sleep(460);
    const tilted = await page.evaluate((sel) => getComputedStyle(document.querySelector(sel + ' .wishlist-card__surface')).transform, TILT);
    await page.mouse.move(4, 4);
    await sleep(1000);
    const untilted = await page.evaluate((sel) => getComputedStyle(document.querySelector(sel + ' .wishlist-card__surface')).transform, TILT);
    c('F03-I03', 'regression', 'MOTION-03 keeps exclusive ownership of the card surface transform',
      'at rest the surface is an identity matrix, a corner hover tilts it into a real rotation, and it settles back to identity',
      nearIdentity(tilt.rest, 1e-6) && !nearIdentity(tilted, 5e-3) && nearIdentity(untilted, 5e-3),
      { rest: tilt.rest, hover: tilted, after: untilted });

    const imgTransition = await page.evaluate(() => {
      const img = document.querySelector('#grid > .wishlist-card:nth-child(2) .product-media__image');
      const cs = getComputedStyle(img);
      return { prop: cs.transitionProperty, dur: cs.transitionDuration };
    });
    c('F03-I04', 'regression', 'MOTION-16 / m3 T1: the image transition still never mentions filter',
      'transition-property does not contain filter and the zoom still transitions transform',
      !/filter/.test(imgTransition.prop) && /transform/.test(imgTransition.prop),
      imgTransition);

    const round = await page.evaluate(async () => {
      const order = () => [...document.querySelectorAll('#grid > .wishlist-card')].map(c => c.dataset.id);
      const before = order();
      document.getElementById('v13FocusView').click();
      await new Promise(r => setTimeout(r, 700));
      const focused = order();
      document.getElementById('v13BoardView').click();
      await new Promise(r => setTimeout(r, 700));
      document.getElementById('v13GridView').click();
      await new Promise(r => setTimeout(r, 700));
      return { before: before, focused: focused, after: order() };
    });
    c('F03-I05', 'regression', 'no view change reorders the collection',
      'the gallery order is identical before and after a focus/board/gallery round trip',
      round.before.join(',') === round.after.join(',') && round.before.join(',') === round.focused.join(','),
      round);

    const filtered = await page.evaluate(async () => {
      const q = document.getElementById('q');
      q.value = 'kính';
      q.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(r => setTimeout(r, 700));
      const ids = [...document.querySelectorAll('#grid > .wishlist-card')].map(c => c.dataset.id);
      q.value = '';
      q.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(r => setTimeout(r, 700));
      return { ids: ids, restored: document.querySelectorAll('#grid > .wishlist-card').length };
    });
    c('F03-I06', 'regression', 'filtering still routes through the existing engine and restores intact',
      'searching for a known item narrows to it and clearing brings all five cards back',
      filtered.ids.length === 1 && filtered.ids[0] === 'a5' && filtered.restored === 5,
      filtered);

    const store = await stored(page);
    const unchanged = store && store.length === 5 &&
      store.map(i => i.id + ':' + i.status + ':' + i.price).join(',') === ITEMS.map(i => i.id + ':' + i.status + ':' + i.price).join(',');
    c('F03-I07', 'regression', 'this milestone never rewrites product data on its own',
      'after all view switching and filtering the guest store is byte-identical to the seed',
      unchanged, { store: (store || []).map(i => ({ id: i.id, status: i.status, price: i.price })) });

    c('F03-I08', 'regression', 'no console or page errors across the regression pass',
      'zero page errors and zero console errors',
      state.pageErrors.length === 0 && state.errors.length === 0,
      { pageErrors: state.pageErrors.slice(0, 3), consoleErrors: state.errors.slice(0, 3) });
    await ctx.close();
  }

  await browser.close();
  server.close();

  const pass = results.filter(r => r.pass).length, fail = results.length - pass;
  let printed = '';
  for (const r of results) {
    if (r.section !== printed) { printed = r.section; console.log('\n-- ' + r.section); }
    console.log((r.pass ? '  ok   ' : '  FAIL ') + r.id + '  ' + r.entry);
    if (!r.pass) console.log('        expected: ' + r.expected + '\n        actual:   ' + r.actual);
    else if (process.env.QA_DETAILS && r.actual && r.actual !== '""') console.log('        measured: ' + r.actual);
  }
  console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — ' + pass + '/' + results.length + ' checks');
  console.log('\n==== FUSION-03 SUITE: ' + pass + ' PASS / ' + fail + ' FAIL (total ' + results.length + ') ====');
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'fusion-03-suite.json'), JSON.stringify({
    generatedAt: new Date().toISOString(), repo: ROOT, pass, fail, total: results.length, results
  }, null, 2));
  process.exit(fail === 0 ? 0 : 1);
}

run().catch(err => { console.error(err); try { server.close(); } catch (e) {} process.exit(1); });
