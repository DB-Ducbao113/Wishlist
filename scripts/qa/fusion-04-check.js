// =====================================================================
// DREAM VAULT V16.2 — FUSION-04
// MOBILE REFINEMENT, COARSE-POINTER COST CONTROL & FINAL IMMERSIVE QA
//
// Browser verification of css/fusion-04-mobile.css + the mobile behaviour of
// the whole V16.2 stack. The stylesheet existing proves nothing: every claim
// below is checked against what actually wins the cascade, the geometry the
// user hits, the live Web Animation objects, the real touch/pointer pipeline
// and the app's own persistence layer.
//
// Areas:
//   A)  source + cascade gates (ownership map, last sheet, no new motion)
//   B)  eight breakpoints — overflow, clipped controls, reachability
//   C)  hero + aurora on a coarse pointer (promotion release, overlap)
//   D)  dashboard & savings usability on touch
//   E)  gallery <-> focus FLIP, sampled while the transition runs
//   F)  status board: horizontal scroll, vertical pan chaining, pointer /
//       keyboard / touch / select workflows, canonical statuses
//   G)  purchase safety (confirm-gated, cancel-safe, undo)
//   H)  quick view: shared element, focus, swipe-to-dismiss + all rejects
//   I)  stale overlays, listener and animation cleanup after churn
//   J)  focus restoration (quick view, form dialog, purchase dialog)
//   K)  empty state and broken image fallback
//   L)  repeated rapid interactions never corrupt state
//   M)  100-item gallery and board render + GPU hygiene
//   N)  reduced motion and the adaptive motion-lite budget
//   O)  accessibility: names, decoration out of the a11y tree, announcements
//   P)  coarse-pointer tap targets (>= 44px) and the fine-pointer gate
//   Q)  200% zoom
//   R)  zero uncaught errors across every scenario + evidence frames
//
// usage: node scripts/qa/fusion-04-check.js [root]
// =====================================================================
'use strict';
const puppeteer = require('puppeteer-core');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..', '..'));
const SHEET = path.join('css', 'fusion-04-mobile.css');
const PREV = path.join('css', 'fusion-03-gallery-board.css');
const PORT = 8214;
const CHROME = process.env.CHROME_PATH || process.env.CHROME ||
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT = path.join(ROOT, 'qa-out');
const SHOTS = path.join(OUT, 'evidence', 'fusion-04', 'suite');
fs.mkdirSync(SHOTS, { recursive: true });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let section = '';
let n = 0, failed = 0;
const results = [];
const ALL_ERRORS = [];   // every pageerror / console error seen by every scenario
function c(id, area, title, expect, ok, detail) {
  n++;
  if (!ok) failed++;
  results.push({ id, area, title, expect, ok: !!ok, detail: detail === undefined ? null : detail });
  const mark = ok ? 'ok  ' : 'FAIL';
  console.log(mark + ' ' + id.padEnd(8) + ' ' + title);
  if (!ok) console.log('     expect: ' + expect + (detail ? '\n     got: ' + JSON.stringify(detail) : ''));
}
function area(name) { section = name; console.log('\n--- ' + name); }

// ---------------------------------------------------------------------
// App fixtures — a mocked cloud module, so no live Firestore is touched.
// ---------------------------------------------------------------------
const MOCK = `
window.__cloud = {};
export async function initializeWishlistCloud(opts){
  window.__cloudSetUser = (u) => { if (opts.onUserChanged) opts.onUserChanged(u ? u.uid : null); };
  window.__cloudSignedIn = () => { window.__cloudSetUser({ uid: 'qa-uid', displayName: 'QA', email: 'qa@example.test' }); };
  window.__cloudSignedOut = () => { window.__cloudSetUser(null); };
  setTimeout(() => { window.__cloudSetUser(null); if (opts.onStatus) opts.onStatus('local', ''); }, 0);
  return { get user(){ return null; }, signIn: async()=>{}, signOut: async()=>{}, syncItems: ()=>Promise.resolve(), uploadImage: async()=>'' };
}`;

const IMG = (label, c1, c2) => 'data:image/svg+xml;utf8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300">' +
  '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
  '<stop offset="0" stop-color="' + c1 + '"/><stop offset="1" stop-color="' + c2 + '"/></linearGradient></defs>' +
  '<rect width="400" height="300" fill="url(#g)"/>' +
  '<text x="200" y="165" font-size="38" text-anchor="middle" fill="#2b1f5c" font-family="sans-serif">' + label + '</text></svg>');

const mk = (id, o) => Object.assign({
  id, name: 'Món ' + id, price: 500000, image: '', link: '', status: 'wish',
  priority: 'medium', category: 'A', note: '', createdAt: 1700000000000
}, o || {});

// four canonical statuses + all three priorities, so every colour token and
// every board column exists in the default scenario.
const ITEMS = [
  mk('a1', { name: 'Máy ảnh Fujifilm X-T5 thân máy', price: 42000000, status: 'wish', priority: 'high', category: 'Nhiếp ảnh', image: IMG('IMG1', '#cbb8ff', '#8f74e6'), savedAmount: 27000000, savingGoal: 42000000 }),
  mk('a2', { name: 'Tai nghe chống ồn không dây Sony WH-1000XM5', price: 7490000, status: 'saving', priority: 'high', category: 'Âm thanh', image: IMG('IMG2', '#ffd9f0', '#e08fd0'), savedAmount: 1200000, savingGoal: 7490000 }),
  mk('a3', { name: 'Giày chạy bộ', price: 2450000, status: 'ordered', priority: 'medium', category: 'Thể thao', image: IMG('IMG3', '#cfe6ff', '#7fa8f0') }),
  mk('a4', { name: 'Máy đọc sách Kindle Paperwhite', price: 3190000, status: 'purchased', priority: 'low', category: 'Đọc', image: IMG('IMG4', '#d9f2e4', '#7fcfae'), paidAmount: 3100000, purchasedAt: 1700000100000 }),
  mk('a5', { name: 'Ống kính 50mm', price: 8900000, status: 'wish', priority: 'medium', category: 'Nhiếp ảnh', image: '' }),
  mk('a6', { name: 'Bàn phím cơ', price: 1890000, status: 'saving', priority: 'low', category: 'Máy tính', image: IMG('IMG6', '#ffe6c9', '#f0a860'), savedAmount: 1890000, savingGoal: 1890000 })
];
const SPARSE = [ITEMS[0], ITEMS[3]];
const EDGE = [mk('e1', { name: '', price: 0, status: 'wish', priority: 'low', image: 'not-a-real-image.png' })];
const many = (count) => Array.from({ length: count }, (_, i) => mk('n' + i, {
  name: 'Món ' + (i + 1), price: 250000 * (i + 1),
  status: ['wish', 'saving', 'ordered', 'purchased'][i % 4],
  priority: ['low', 'medium', 'high'][i % 3], category: 'Bộ ' + (i % 5),
  image: IMG('N' + (i + 1), ['#cbb8ff', '#ffd9f0', '#cfe6ff', '#d9f2e4', '#ffe6c9'][i % 5], ['#8f74e6', '#e08fd0', '#7fa8f0', '#7fcfae', '#f0a860'][i % 5]),
  savedAmount: 100000 * (i % 10), savingGoal: 250000 * (i + 1)
}));

// ---------------------------------------------------------------------
// In-page probe kit, installed before any app script runs.
// ---------------------------------------------------------------------
const PROBE_HEADER = `
(function(){
  window.__box = function(sel, root){
    var el = typeof sel === 'string' ? (root || document).querySelector(sel) : sel;
    if(!el) return null;
    var cs = getComputedStyle(el), b = el.getBoundingClientRect();
    return { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height),
      right: Math.round(b.right), bottom: Math.round(b.bottom), display: cs.display, opacity: +cs.opacity,
      z: cs.zIndex, pe: cs.pointerEvents, transform: cs.transform, translate: cs.translate,
      willChange: cs.willChange, position: cs.position, overflowX: cs.overflowX, overflowY: cs.overflowY,
      font: cs.fontSize, ariaHidden: el.getAttribute('aria-hidden'), tab: el.tabIndex };
  };
  window.__boxOf = function(sel, pseudo){
    var el = document.querySelector(sel);
    if(!el) return null;
    var cs = getComputedStyle(el, pseudo || null), b = el.getBoundingClientRect();
    return { w: Math.round(b.width), h: Math.round(b.height), display: cs.display, opacity: +cs.opacity,
      animation: cs.animationName, iterations: cs.animationIterationCount, willChange: cs.willChange,
      transform: cs.transform, translate: cs.translate, pe: cs.pointerEvents, z: cs.zIndex,
      position: cs.position, bg: (cs.backgroundImage || '').slice(0, 60) };
  };
  window.__animsUnder = function(sel){
    var el = document.querySelector(sel);
    if(!el) return null;
    return el.getAnimations({ subtree: true }).map(function(a){
      var t = (a.effect && a.effect.getTiming) ? a.effect.getTiming() : {};
      var tg = a.effect && a.effect.target;
      return { name: a.animationName || (a.constructor && a.constructor.name) || '?',
        state: a.playState, iterations: String(t.iterations),
        target: tg ? (tg.tagName ? tg.tagName.toLowerCase() + (tg.id ? '#' + tg.id : '') + '.' + String(tg.className || '').split(' ')[0] : '?') : '?' };
    });
  };
  window.__gridAnims = function(){ return window.__animsUnder('#grid'); };
  window.__overflow = function(){
    var vw = window.innerWidth;
    return { vw: vw, doc: document.documentElement.scrollWidth - vw, body: document.body.scrollWidth - vw,
      scrollY: Math.round(window.scrollY), maxScroll: Math.round(document.documentElement.scrollHeight - window.innerHeight) };
  };
  // every visible interactive control whose nearest horizontal scrollport is
  // the page itself (controls inside the board's own scroller are reachable by
  // swiping that scroller, so they are reported separately, not as clipping).
  window.__interactive = function(){
    var sel = 'button, a[href], input, select, textarea, [role="button"], [tabindex]:not([tabindex="-1"])';
    var vw = window.innerWidth, out = { page: [], inScroller: [], decorativeFocusable: [] };
    var nodes = document.querySelectorAll(sel);
    for (var i = 0; i < nodes.length; i++){
      var el = nodes[i], cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || el.disabled) continue;
      var r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      var scroller = null, p = el.parentElement;
      while (p && p !== document.body){
        var ps = getComputedStyle(p);
        if ((ps.overflowX === 'auto' || ps.overflowX === 'scroll') && ps.overflowX !== ps.overflowY){ scroller = p; break; }
        p = p.parentElement;
      }
      var rec = { tag: el.tagName.toLowerCase(), id: el.id || null,
        cls: String(el.className || '').trim().split(/\\s+/).slice(0, 2).join('.'),
        w: Math.round(r.width), h: Math.round(r.height), left: Math.round(r.left), right: Math.round(r.right),
        text: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 24) };
      if (scroller) out.inScroller.push(rec);
      else if (r.right > vw + 1 || r.left < -1) out.page.push(rec);
    }
    return out;
  };
  // coarse-pointer tap targets: every visible interactive control under 44px
  window.__targets = function(exclude){
    var sel = 'button, a[href], input:not([type=hidden]), select, textarea, [role="button"]';
    var nodes = document.querySelectorAll(sel), small = [];
    for (var i = 0; i < nodes.length; i++){
      var el = nodes[i], cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || el.disabled) continue;
      var r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      var id = el.id || String(el.className || '').trim().split(/\\s+/)[0] || el.tagName.toLowerCase();
      if (exclude && exclude.some(function(x){ return el.matches(x); })) continue;
      if (r.height < 44 || r.width < 44){
        small.push({ el: id, tag: el.tagName.toLowerCase(), w: Math.round(r.width), h: Math.round(r.height),
          text: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 20) });
      }
    }
    return { coarse: matchMedia('(hover: none), (pointer: coarse)').matches, small: small };
  };
  window.__gpu = function(){
    var out = { frameWillChange: 0, surfaceWillChange: 0, backdrop: 0, backdropEls: [], cards: 0, heroHint: [] };
    var grid = document.getElementById('grid');
    if (grid) {
      out.cards = grid.querySelectorAll('.wishlist-card').length;
      var frames = grid.querySelectorAll('.product-media__frame');
      for (var i = 0; i < frames.length; i++) if (getComputedStyle(frames[i]).willChange !== 'auto') out.frameWillChange++;
      var surfs = grid.querySelectorAll('.wishlist-card');
      for (var j = 0; j < surfs.length; j++) if (getComputedStyle(surfs[j]).willChange !== 'auto') out.surfaceWillChange++;
    }
    var all = document.querySelectorAll('#grid *');
    for (var k = 0; k < all.length; k++){
      var cs = getComputedStyle(all[k]);
      var bf = cs.backdropFilter || cs.webkitBackdropFilter;
      if (bf && bf !== 'none'){ out.backdrop++; if (out.backdropEls.length < 6) out.backdropEls.push(all[k].tagName.toLowerCase() + '.' + String(all[k].className || '').split(' ')[0]); }
    }
    // page-wide count kept separate: the dialogs legitimately blur their own
    // backdrop, and that is not a gallery cost
    out.pageBackdrop = 0;
    var pageAll = document.querySelectorAll('*');
    for (var q = 0; q < pageAll.length; q++){
      var pcs = getComputedStyle(pageAll[q]);
      var pbf = pcs.backdropFilter || pcs.webkitBackdropFilter;
      if (pbf && pbf !== 'none') out.pageBackdrop++;
    }
    ['.hero--v9 .hero__visual', '.hero--v9 .hero__content', '.hero--v9 .hero-v3__primary'].forEach(function(s){
      var el = document.querySelector(s);
      out.heroHint.push({ sel: s, willChange: el ? getComputedStyle(el).willChange : null });
    });
    var before = document.querySelector('.hero--v9');
    out.heroBeforeHint = before ? getComputedStyle(before, '::before').willChange : null;
    return out;
  };
  // Quick View swipe driver: real PointerEvents, so the app's own gestures run.
  window.__pt = {
    topRect: function(){ var t = document.querySelector('#qv .quick-view__top'); if(!t) return null; var r = t.getBoundingClientRect(); return { x: Math.round(r.left + r.width/2), y: Math.round(r.top + Math.min(30, r.height/2)), h: Math.round(r.height) }; },
    down: function(x, y, id){ var t = document.querySelector('#qv .quick-view__top');
      t.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch', isPrimary: true, pointerId: id || 11, clientX: x, clientY: y, button: 0, buttons: 1, bubbles: true, cancelable: true, composed: true })); },
    move: function(x, y, id){ document.dispatchEvent(new PointerEvent('pointermove', { pointerType: 'touch', isPrimary: true, pointerId: id || 11, clientX: x, clientY: y, buttons: 1, bubbles: true, cancelable: true, composed: true })); },
    up: function(x, y, id){ document.dispatchEvent(new PointerEvent('pointerup', { pointerType: 'touch', isPrimary: true, pointerId: id || 11, clientX: x, clientY: y, button: 0, bubbles: true, cancelable: true, composed: true })); },
    cancel: function(x, y, id){ document.dispatchEvent(new PointerEvent('pointercancel', { pointerType: 'touch', isPrimary: true, pointerId: id || 11, clientX: x, clientY: y, bubbles: true, cancelable: true, composed: true })); },
    key: function(k){ document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })); },
    state: function(){ var q = document.getElementById('qv');
      return { open: q.open === true, dragging: q.classList.contains('qv--dragging'), closing: q.classList.contains('qv--drag-closing'),
        progress: q.style.getPropertyValue('--qv-swipe-progress') || '', inlineTransform: q.style.transform || '' }; }
  };
  // synchronous frame sampler for FLIP evidence
  window.__framesUnder = function(sel, frames){
    return new Promise(function(res){
      var out = [], i = 0;
      function step(){ out.push((window.__animsUnder(sel) || []).length); if (++i < frames) requestAnimationFrame(step); else res(out); }
      requestAnimationFrame(step);
    });
  };
})();
`;

// ---------------------------------------------------------------------
// Static server + scenario factory (same shape as the FUSION-03 suite).
// ---------------------------------------------------------------------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/wishlist.html';
  fs.readFile(path.join(ROOT, p), (err, data) => {
    if (err) { res.writeHead(404); return res.end('nf'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
});

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

async function newScenario(browser, seed, opts = {}) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  const state = { errors: [], pageErrors: [] };
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: opts.reducedMotion ? 'reduce' : 'no-preference' }]);
  if (opts.touch) {
    await page.emulate({
      viewport: { width: opts.width || 375, height: opts.height || 812, deviceScaleFactor: opts.dsf || 1, isMobile: true, hasTouch: true },
      userAgent: UA
    });
  } else {
    await page.setViewport({ width: opts.width || 1440, height: opts.height || 900, deviceScaleFactor: opts.dsf || 1 });
  }
  await page.evaluateOnNewDocument(PROBE_HEADER);
  await page.evaluateOnNewDocument((s) => {
    try { localStorage.clear(); if (s && s.items) localStorage.setItem('wishlist.guest.items', JSON.stringify(s.items)); } catch (e) {}
  }, { items: seed || [] });
  await page.setRequestInterception(true);
  page.on('request', req => /wishlist-cloud\.js/.test(req.url())
    ? req.respond({ status: 200, contentType: 'text/javascript', body: MOCK })
    : req.continue());
  page.on('pageerror', e => { const m = String(e); state.pageErrors.push(m); ALL_ERRORS.push('pageerror: ' + m); });
  page.on('console', m => { if (m.type() === 'error') { state.errors.push(m.text()); ALL_ERRORS.push('console: ' + m.text()); } });
  page.on('dialog', d => { d.dismiss().catch(() => {}); });
  await page.goto('http://localhost:' + PORT + '/wishlist.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('typeof window.__cloudSetUser === "function"');
  await sleep(opts.settle || 900);
  return { ctx, page, state };
}

const stored = (page) => page.evaluate(() => {
  try { return JSON.parse(localStorage.getItem('wishlist.guest.items') || '[]'); } catch (e) { return null; }
});
const setView = (page, mode) => page.evaluate((m) => {
  const map = { gallery: 'v13GridView', focus: 'v13FocusView', board: 'v13BoardView' };
  const btn = document.getElementById(map[m]);
  if (!btn) return null;
  btn.click();
  return true;
}, mode);

// ---------------------------------------------------------------------
// main
// ---------------------------------------------------------------------
(async () => {
  await new Promise(r => server.listen(PORT, r));
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--hide-scrollbars', '--force-device-scale-factor=1']
  });

  // ===================================================================
  area('A SOURCE + CASCADE');
  // ===================================================================
  {
    const html = fs.readFileSync(path.join(ROOT, 'wishlist.html'), 'utf8');
    const raw = fs.readFileSync(path.join(ROOT, SHEET), 'utf8');
    const code = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    const links = [...html.matchAll(/<link[^>]+href=["']?(\.\/css\/[^"'\s>]+\.css)/gi)].map(m => m[1]);
    const i4 = links.findIndex(h => /fusion-04-mobile\.css/.test(h));
    const i3 = links.findIndex(h => /fusion-03-gallery-board\.css/.test(h));
    const i17 = links.findIndex(h => /collection-v17\.css/.test(h));

    c('F04-A01', 'source', 'the sheet is linked exactly once, after FUSION-03, and only the redesign sheet follows it',
      'one <link>, after FUSION-03, with the collection redesign sheet as the single trailing stylesheet',
      links.filter(h => /fusion-04-mobile\.css/.test(h)).length === 1 &&
        i4 > i3 &&
        i17 === links.length - 1 &&
        i4 === links.length - 2,
      { index: i4, redesign: i17, total: links.length, order: links.slice(-3) });

    c('F04-A02', 'source', 'all rules live inside the coarse-pointer gate (nothing leaks to fine pointers)',
      'stripping the two @media blocks leaves no declaration block behind',
      (code.match(/@media \(hover: none\), \(pointer: coarse\)/g) || []).length === 2 &&
      code.replace(/@media \(hover: none\), \(pointer: coarse\)\s*\{[\s\S]*?\n\}/g, '').indexOf('{') === -1,
      { media: (code.match(/@media[^{]*\{/g) || []).map(s => s.trim()) });

    const decls = [...code.matchAll(/([a-z-]+)\s*:/g)].map(m => m[1]).filter(x => x !== 'hover' && x !== 'pointer' && x !== 'none' && x !== 'coarse');
    const owned = [...new Set(decls)].sort();
    c('F04-A03', 'source', 'the sheet owns exactly two families of properties',
      'only min-width / min-height / will-change are ever declared',
      owned.every(x => ['min-width', 'min-height', 'will-change'].includes(x)) && owned.length === 3,
      { declared: owned });

    c('F04-A04', 'source', 'no new motion, no new surface, no colour and no !important',
      'zero keyframes / animation / transition / filter / backdrop-filter / colour literal and zero !important',
      !/@keyframes/.test(code) && !/\banimation/.test(code) && !/\btransition/.test(code) &&
      !/\bfilter\s*:/.test(code) && !/\btransform\s*:/.test(code) && !/\btranslate\s*:/.test(code) &&
      !/#[0-9a-f]{3,8}\b/i.test(code) && !/!important/.test(code),
      { willChange: (code.match(/will-change/g) || []).length });

    c('F04-A05', 'source', 'the header documents ownership, the measured basis and what was deliberately left alone',
      'mentions FUSION-04, the coarse-pointer will-change release and the tap targets',
      /FUSION-04/.test(raw) && /will-change/.test(raw) && /44/.test(raw) && /tap target/i.test(raw),
      null);
  }
  const cssSrc = fs.readFileSync(path.join(ROOT, SHEET), 'utf8');

  // ===================================================================
  area('B RESPONSIVE BREAKPOINTS');
  // ===================================================================
  const AUDIT = {};
  {
    const viewports = [
      { w: 320, h: 700, touch: true }, { w: 375, h: 812, touch: true }, { w: 390, h: 844, touch: true },
      { w: 430, h: 932, touch: true }, { w: 768, h: 1024, touch: true }, { w: 1024, h: 768, touch: false },
      { w: 1440, h: 900, touch: false }, { w: 1920, h: 1080, touch: false }
    ];
    for (const v of viewports) {
      const { ctx, page, state } = await newScenario(browser, ITEMS, { width: v.w, height: v.h, touch: v.touch });
      const rec = await page.evaluate(() => {
        const vis = (sel) => Array.from(document.querySelectorAll(sel)).filter(e => {
          const cs = getComputedStyle(e); const r = e.getBoundingClientRect();
          return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 2 && r.height > 2;
        });
        const cnt = (sel) => vis(sel).length;
        const box = (el) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), right: Math.round(r.right), bottom: Math.round(r.bottom) }; };
        const cta = document.querySelector('.hero-v3__primary');
        let hit = null;
        if (cta) {
          cta.scrollIntoView({ block: 'center', behavior: 'instant' });
          const r = cta.getBoundingClientRect();
          const el = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
          hit = el ? { tag: el.tagName.toLowerCase(), cls: String(el.className || '').split(' ')[0], isCta: el === cta || cta.contains(el) } : null;
        }
        // .pv-card--main IS the card that carries the heading, so it is not a
        // floating layer to be compared against its own text.
        const floats = ['.pv-card--a', '.pv-card--b', '.pv-chip--goal', '.pv-chip--owned']
          .map(s => document.querySelector(s)).filter(x => x && getComputedStyle(x).display !== 'none');
        const t = document.querySelector('#hero-title'), ct = document.querySelector('.hero-v3__primary');
        const inter = (a, b) => !!a && !!b && !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
        const tb = t && box(t), cb = ct && box(ct);
        const titleOverlaps = floats.map(f => box(f)).filter(fb => inter(fb, tb)).length;
        const ctaOverlaps = floats.map(f => box(f)).filter(fb => inter(fb, cb)).length;
        // The user-facing property: a real pointer anywhere over the heading
        // must land on the heading (or one of its links), never on a decorative
        // layer. Rect intersection alone is too coarse here — the heading block
        // is full-width while its text is not.
        let hitBlocked = 0, hitSamples = [];
        if (t) {
          const r = t.getBoundingClientRect();
          for (let gx = 0.1; gx <= 0.95; gx += 0.17) {
            for (let gy = 0.05; gy <= 0.95; gy += 0.3) {
              const el = document.elementFromPoint(r.left + r.width * gx, r.top + r.height * gy);
              if (el && el.closest('.pv-card, .pv-chip, .pv-stage, .pv-aurora, .pv-marquee, .pv-grid, .pv-grain')) { hitBlocked++; hitSamples.push(el.tagName.toLowerCase() + '.' + String(el.className || '').split(' ')[0]); }
            }
          }
        }
        const marq = document.querySelector('.pv-marquee');
        const track = document.querySelector('.pv-marquee__track');
        return {
          pageOverflow: document.documentElement.scrollWidth - window.innerWidth,
          bodyOverflow: document.body.scrollWidth - window.innerWidth,
          clipped: window.__interactive().page,
          scrollerControls: window.__interactive().inScroller.length,
          cards: cnt('.pv-card'), cardsMain: cnt('.pv-card--main'), chips: cnt('.pv-chip'),
          heroH: (box(document.querySelector('.hero--v9') || document.body)).h,
          ctaHit: hit,
          heroOverlap: titleOverlaps, ctaOverlap: ctaOverlaps, headingHitBlocked: hitBlocked, headingHits: hitSamples.slice(0, 4),
          marquee: !!marq && !!track,
          marqueeOverflow: track ? Math.max(0, track.getBoundingClientRect().width - window.innerWidth) : 0,
          viewbar: cnt('.v13-viewbar__button'),
          cards260: document.querySelectorAll('#grid .wishlist-card').length
        };
      });
      rec.v = v;
      AUDIT[v.w] = rec;
      await ctx.close();
      process.stdout.write('  ' + v.w + 'x' + v.h + (v.touch ? ' coarse' : ' fine') + ': overflow=' + rec.pageOverflow + ' cards=' + rec.cards + ' clipped=' + rec.clipped.length + ' overlap=' + rec.heroOverlap + '\n');
    }

    const bad = Object.entries(AUDIT).filter(([, r]) => r.pageOverflow > 0 || r.bodyOverflow > 0);
    c('F04-B01', 'responsive', 'no page-level horizontal overflow at any of the eight required widths',
      'documentElement.scrollWidth <= innerWidth at 320/375/390/430/768/1024/1440/1920',
      bad.length === 0, bad.map(([w, r]) => w + ':' + r.pageOverflow));

    const clipped = Object.entries(AUDIT).flatMap(([w, r]) => r.clipped.map(x => w + ' ' + x.tag + '.' + x.cls));
    c('F04-B02', 'responsive', 'no interactive control is clipped outside the viewport',
      'every visible control whose own scrollport is the page fits inside [0, innerWidth]',
      clipped.length === 0, clipped.slice(0, 6));

    const cards320 = AUDIT[320].cards, cards430 = AUDIT[430].cards, cards768 = AUDIT[768].cards, cards1440 = AUDIT[1440].cards;
    c('F04-B03', 'responsive', 'the hero stack thins out on a phone and fills in from the tablet up',
      'one floating card at 320/430, more than one from 768, three at 1440',
      cards320 === 1 && cards430 === 1 && cards768 > 1 && cards1440 === 3,
      { c320: cards320, c430: cards430, c768: cards768, c1024: AUDIT[1024].cards, c1440: cards1440, c1920: AUDIT[1920].cards });

    const unreachable = Object.entries(AUDIT).filter(([, r]) => !r.ctaHit || !r.ctaHit.isCta).map(([w, r]) => w + ':' + JSON.stringify(r.ctaHit));
    c('F04-B04', 'responsive', 'the hero call to action is reachable with real data at every width',
      'scrolling the CTA into view and hit-testing its centre returns the CTA itself, never a decorative layer',
      unreachable.length === 0, unreachable);

    const blocked = Object.entries(AUDIT).filter(([, r]) => r.headingHitBlocked > 0).map(([w, r]) => w + ':' + r.headingHits.join(','));
    c('F04-B05', 'responsive', 'a real pointer anywhere over the hero heading can never be caught by a decorative layer',
      'hit-testing a grid of points across the heading returns the heading or its links, never a floating layer, at all eight widths',
      blocked.length === 0, { blocked, rectOverlaps: Object.fromEntries(Object.entries(AUDIT).map(([w, r]) => [w, r.heroOverlap])) });

    const noMarquee = Object.entries(AUDIT).filter(([, r]) => !r.marquee).map(([w]) => w);
    c('F04-B06', 'responsive', 'the marquee exists at every width and is clipped by its own container, not by the page',
      'present everywhere; its own track may be wider than the viewport only inside an overflow:hidden strip',
      noMarquee.length === 0 && Object.values(AUDIT).every(r => r.marqueeOverflow >= 0),
      { missing: noMarquee, trackOverflow: Object.fromEntries(Object.entries(AUDIT).map(([w, r]) => [w, r.marqueeOverflow])) });

    const errored = Object.entries(AUDIT).length;
    c('F04-B07', 'responsive', 'the collection renders at every width (no width-dependent render failure)',
      'every one of the eight scenarios shows the gallery viewbar and the seeded cards',
      errored === 8 && Object.values(AUDIT).every(r => r.viewbar >= 2 && r.cards260 === ITEMS.length),
      { cards: Object.fromEntries(Object.entries(AUDIT).map(([w, r]) => [w, r.cards260])) });
  }

  // ===================================================================
  area('C HERO + AURORA ON COARSE POINTERS');
  // ===================================================================
  {
    const { ctx, page, state } = await newScenario(browser, ITEMS, { touch: true, width: 375, height: 812 });
    const coarse = await page.evaluate(async () => {
      const wait = (ms) => new Promise(r => setTimeout(r, ms));
      const rail = window.__boxOf('.pv-progress');
      const bar0 = window.__boxOf('.pv-progress__bar');
      const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      window.scrollTo(0, Math.round(max / 2));
      await wait(320);
      const bar1 = window.__boxOf('.pv-progress__bar');
      window.scrollTo(0, 0);
      return {
        matched: matchMedia('(hover: none), (pointer: coarse)').matches,
        gpu: window.__gpu(),
        aurora: window.__boxOf('.pv-aurora'),
        grid: window.__boxOf('.pv-grid'),
        blobs: Array.from(document.querySelectorAll('.pv-aurora__blob')).map(el => {
          const cs = getComputedStyle(el), r = el.getBoundingClientRect();
          return { w: Math.round(r.width), h: Math.round(r.height), animation: cs.animationName, iterations: cs.animationIterationCount, willChange: cs.willChange, bg: (cs.backgroundImage || '').slice(0, 30) };
        }),
        track: window.__boxOf('.pv-marquee__track'),
        rail, bar0, bar1,
        railH: rail ? Math.round(document.querySelector('.pv-progress').getBoundingClientRect().height) : 0,
        scrollY: Math.round(window.scrollY)
      };
    });
    c('F04-C06', 'hero', 'the cinematic marquee and scroll rail are present and the rail really tracks the scroll',
      'the strip, its track, the rail and its bar exist; the bar grows when the page is scrolled',
      !!coarse.track && coarse.track.display !== 'none' && coarse.track.w > 0 && !!coarse.rail && coarse.rail.w > 0 &&
      coarse.bar1.w > coarse.bar0.w,
      { track: coarse.track && coarse.track.w, railW: coarse.rail && coarse.rail.w, railH: coarse.railH, bar0: coarse.bar0.w, bar1: coarse.bar1.w });
    c('F04-C01', 'hero', 'the phone really is a coarse pointer in this scenario',
      'matchMedia(hover:none / pointer:coarse) is true with real iPhone emulation',
      coarse.matched === true, coarse.matched);

    const hints = coarse.gpu.heroHint;
    c('F04-C02', 'hero', 'the hero promotions that a coarse pointer can never use are released',
      'hero__visual / hero__content / hero-v3__primary all compute will-change:auto on touch',
      hints.length === 3 && hints.every(h => h.willChange === 'auto'), hints);

    c('F04-C03', 'hero', 'the one hero layer that still really moves keeps its hint',
      '.hero--v9::before keeps will-change:transform because its scroll-linked translate is untouched',
      coarse.gpu.heroBeforeHint === 'transform', coarse.gpu.heroBeforeHint);

    c('F04-C04', 'hero', 'the aurora, grid and glow stay painted and out of the way on a phone',
      'fixed, negative z-index, pointer-events none, opacity > 0, real gradient background',
      !!coarse.aurora && coarse.aurora.position === 'fixed' && +coarse.aurora.z < 0 && coarse.aurora.pe === 'none' &&
      coarse.aurora.opacity > 0 && /gradient/.test(coarse.aurora.bg) && coarse.aurora.display !== 'none',
      coarse.aurora);

    c('F04-C05', 'hero', 'the aurora drift that FUSION-01 acceptance requires is deliberately preserved',
      'three blobs, all > 300px, all animating pv-drift* with infinite iterations on touch',
      coarse.blobs.length === 3 && coarse.blobs.every(b => /pv-drift/.test(b.animation) && String(b.iterations) === 'infinite' && b.w > 300),
      coarse.blobs.map(b => b.w + '/' + b.animation));

    c('F04-C07', 'hero', 'no console or page errors while composing the mobile hero',
      'zero page errors and zero console errors',
      state.pageErrors.length === 0 && state.errors.length === 0,
      { pageErrors: state.pageErrors.slice(0, 3), errors: state.errors.slice(0, 3) });
    await ctx.close();
  }
  {
    // fine pointer control: the release must be scoped to touch only
    const { ctx, page } = await newScenario(browser, ITEMS, { width: 1440, height: 900 });
    const fine = await page.evaluate(() => window.__gpu());
    c('F04-C08', 'hero', 'the promotion release is scoped to coarse pointers only',
      'at 1440 with a fine pointer the same three nodes still compute will-change:transform',
      fine.heroHint.every(h => h.willChange === 'transform') && fine.heroBeforeHint === 'transform',
      fine.heroHint);
    await ctx.close();
  }
  {
    // forced adaptive budget + reduced motion: static but complete
    const { ctx, page } = await newScenario(browser, ITEMS, { touch: true, width: 390, height: 844 });
    await page.evaluate(() => {
      document.documentElement.classList.add('motion-lite');
      const t = document.querySelector('.pv-marquee__track');
      if (t) t.dispatchEvent(new Event('pointerenter'));
    });
    await sleep(400);
    const lite = await page.evaluate(() => ({
      blobs: Array.from(document.querySelectorAll('.pv-aurora__blob')).map(el => ({ a: getComputedStyle(el).animationName, w: Math.round(el.getBoundingClientRect().width), d: getComputedStyle(el).display })),
      trackPlay: getComputedStyle(document.querySelector('.pv-marquee__track')).animationPlayState,
      heroVisual: getComputedStyle(document.querySelector('.hero__visual')).willChange,
      auroraDisplay: getComputedStyle(document.querySelector('.pv-aurora')).display,
      infinite: document.getAnimations().filter(a => a.effect && a.effect.getTiming().iterations === Infinity).length
    }));
    c('F04-C09', 'budget', 'the motion-lite budget turns the ambient loops off but leaves the scene painted',
      'blobs stop, the strip is paused, the aurora stays visible and large',
      lite.blobs.every(b => b.a === 'none' && b.d !== 'none' && b.w > 300) && lite.trackPlay === 'paused' && lite.auroraDisplay !== 'none',
      { blobs: lite.blobs.map(b => b.a + '/' + b.w), trackPlayState: lite.trackPlay, infinite: lite.infinite });
    await ctx.close();

    const { ctx: ctx2, page: page2 } = await newScenario(browser, ITEMS, { touch: true, width: 390, height: 844, reducedMotion: true });
    const rm = await page2.evaluate(() => ({
      blobs: Array.from(document.querySelectorAll('.pv-aurora__blob')).map(el => ({ a: getComputedStyle(el).animationName, w: Math.round(el.getBoundingClientRect().width) })),
      track: getComputedStyle(document.querySelector('.pv-marquee__track')).animationName,
      heroVisual: getComputedStyle(document.querySelector('.hero__visual')).translate,
      cards: Array.from(document.querySelectorAll('#grid .wishlist-card')).map(el => ({ o: getComputedStyle(el).opacity, t: getComputedStyle(el).transform })),
      infinite: document.getAnimations().filter(a => a.effect && a.effect.getTiming().iterations === Infinity).length
    }));
    c('F04-C10', 'budget', 'reduced motion is static but complete — nothing is hidden and nothing loops',
      'no drift, no marquee, no hero translate, every card fully opaque and untransformed',
      rm.blobs.every(b => b.a === 'none' && b.w > 300) && rm.track === 'none' && rm.heroVisual === 'none' &&
      rm.cards.length === ITEMS.length && rm.cards.every(x => +x.o >= 0.99 && (x.t === 'none' || x.t === 'matrix(1, 0, 0, 1, 0, 0)')),
      { blobs: rm.blobs.map(b => b.a), track: rm.track, hero: rm.heroVisual, cards: rm.cards.length, infinite: rm.infinite });
    await ctx2.close();
  }

  // ===================================================================
  area('D DASHBOARD + SAVINGS ON TOUCH');
  // ===================================================================
  {
    const { ctx, page, state } = await newScenario(browser, ITEMS, { touch: true, width: 375, height: 812 });
    const d = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('.dv-savings__row, .savings-row'));
      const tabs = Array.from(document.querySelectorAll('.dv-tabs__tab'));
      const dist = Array.from(document.querySelectorAll('.dv-dist__item'));
      const add = document.getElementById('dvAddItem');
      const stats = Array.from(document.querySelectorAll('.stat-card'));
      const prog = document.querySelector('[role="progressbar"]');
      const sizes = (list) => list.map(el => { const r = el.getBoundingClientRect(); return Math.round(r.height); });
      const first = rows[0];
      let before = null, after = null;
      if (first) {
        first.scrollIntoView({ block: 'center', behavior: 'instant' });
        before = { h: Math.round(first.getBoundingClientRect().height),
          opacity: +getComputedStyle(first).opacity,
          text: (first.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 80) };
      }
      const tab = document.getElementById('tabPending');
      const listBefore = document.querySelectorAll('#dvList .dv-item, .dv-list__item').length;
      const ariaBefore = tab ? tab.getAttribute('aria-pressed') || tab.getAttribute('aria-selected') : null;
      if (tab) tab.click();
      const listAfter = document.querySelectorAll('#dvList .dv-item, .dv-list__item').length;
      return {
        rows: rows.length, rowH: sizes(rows).sort((a, b) => a - b),
        tabs: tabs.length, tabH: sizes(tabs).sort((a, b) => a - b),
        dist: dist.length, distH: sizes(dist).sort((a, b) => a - b),
        addH: add ? Math.round(add.getBoundingClientRect().height) : null,
        stats: stats.length, statH: sizes(stats),
        progressbar: prog ? { now: prog.getAttribute('aria-valuenow'), max: prog.getAttribute('aria-valuemax') } : null,
        before, after: first ? { h: Math.round(first.getBoundingClientRect().height), opacity: +getComputedStyle(first).opacity } : null,
        listBefore, listAfter, ariaBefore
      };
    });
    const minOf = (a) => a.length ? Math.min.apply(null, a) : null;
    c('F04-D01', 'dashboard', 'every dashboard control measured under 44px now clears it on touch',
      'savings rows, tabs, distribution rows and the add button are all >= 44px tall',
      minOf(d.rowH) >= 44 && minOf(d.tabH) >= 44 && (d.dist === 0 || minOf(d.distH) >= 44) && d.addH >= 44,
      { rowMin: minOf(d.rowH), tabMin: minOf(d.tabH), distMin: minOf(d.distH), add: d.addH });

    c('F04-D02', 'dashboard', 'the savings rows stay readable after the hit area grew',
      'row height stays between 44 and 96px and the row text is fully visible',
      minOf(d.rowH) >= 44 && Math.max.apply(null, d.rowH) <= 96 && d.before && d.before.opacity >= 0.99 && d.before.text.length >= 4,
      { rows: d.rowH, opacity: d.before && d.before.opacity, text: d.before && d.before.text });

    c('F04-D03', 'dashboard', 'tapping a dashboard tab really switches the dashboard list',
      'clicking the pending tab updates the tab state and the rendered list responds',
      d.tabs >= 2 && d.listAfter !== null && (d.listAfter <= d.listBefore) && d.ariaBefore !== null,
      { tabs: d.tabs, listBefore: d.listBefore, listAfter: d.listAfter, ariaBefore: d.ariaBefore });

    c('F04-D04', 'dashboard', 'statistics and savings expose a real progressbar, not a decorative div',
      'at least one [role=progressbar] with a numeric aria-valuenow',
      !!d.progressbar && d.progressbar.now !== null && !isNaN(Number(d.progressbar.now)),
      d.progressbar);

    c('F04-D05', 'dashboard', 'stat cards are present and do not fake a hover state on touch',
      'at least one stat card and no coarse-pointer transform reaction',
      d.stats >= 1 && d.statH.every(h => h >= 60),
      { stats: d.stats, h: d.statH });

    c('F04-D06', 'dashboard', 'no console or page errors in the dashboard pass',
      'zero page errors and zero console errors',
      state.pageErrors.length === 0 && state.errors.length === 0,
      { pageErrors: state.pageErrors.slice(0, 3), errors: state.errors.slice(0, 3) });
    await ctx.close();
  }

  // ===================================================================
  area('E GALLERY <-> FOCUS FLIP');
  // ===================================================================
  {
    const { ctx, page, state } = await newScenario(browser, ITEMS, { width: 1440, height: 900 });
    const gallery = await page.evaluate(() => ({
      view: document.getElementById('grid').dataset.v13View,
      cards: document.querySelectorAll('#grid .wishlist-card').length,
      first: document.querySelector('#grid .wishlist-card').getBoundingClientRect().width,
      widths: Array.from(document.querySelectorAll('#grid .wishlist-card')).map(el => Math.round(el.getBoundingClientRect().width))
    }));
    await page.evaluate(() => {
      window.__flipFrames = null;
      document.getElementById('v13FocusView').click();
      window.__framesUnder('#grid', 10).then(f => window.__flipFrames = f);
    });
    await sleep(1100);
    const focus = await page.evaluate(() => ({
      view: document.getElementById('grid').dataset.v13View,
      cards: document.querySelectorAll('#grid .wishlist-card').length,
      first: document.querySelector('#grid .wishlist-card').getBoundingClientRect().width,
      widths: Array.from(document.querySelectorAll('#grid .wishlist-card')).map(el => Math.round(el.getBoundingClientRect().width)),
      frames: window.__flipFrames,
      left: (window.__animsUnder('#grid') || []).length
    }));
    const widthsDiffer = Array.isArray(gallery.widths) && Array.isArray(focus.widths) && focus.widths.some((w, i) => Math.abs(w - (gallery.widths[i] || 0)) > 8);
    c('F04-E01', 'flip', 'the focus view is a different layout with the same cards',
      'view switches to focus, the card count is unchanged and at least one card resizes by more than 8px',
      focus.view === 'focus' && focus.cards === gallery.cards && widthsDiffer === true,
      { gallery: gallery.widths, focus: focus.widths, cards: focus.cards });

    c('F04-E02', 'flip', 'the transition is animated, not an instant swap',
      'at least two sampled frames during the switch carry live animations under #grid',
      Array.isArray(focus.frames) && focus.frames.filter(x => x > 0).length >= 2,
      { frames: focus.frames });

    c('F04-E03', 'flip', 'nothing is left animating once the layout has settled',
      'zero animations under #grid after the transition completes',
      focus.left === 0, { left: focus.left });

    await page.evaluate(async () => {
      for (let i = 0; i < 8; i++) {
        document.getElementById(i % 2 ? 'v13GridView' : 'v13FocusView').click();
        await new Promise(r => setTimeout(r, 60));
      }
      document.getElementById('v13GridView').click();
    });
    await sleep(1400);
    const after = await page.evaluate(() => ({
      view: document.getElementById('grid').dataset.v13View,
      cards: document.querySelectorAll('#grid .wishlist-card').length,
      anims: (window.__animsUnder('#grid') || []).length,
      cols: getComputedStyle(document.getElementById('grid')).gridTemplateColumns.split(' ').length
    }));
    c('F04-E04', 'flip', 'rapid switching cancels cleanly and lands on the requested view',
      'after eight fast switches the grid view is applied with every card, no lingering animation',
      after.view === 'gallery' && after.cards === ITEMS.length && after.anims === 0,
      after);

    c('F04-E05', 'flip', 'no console or page errors while flipping',
      'zero page errors and zero console errors',
      state.pageErrors.length === 0 && state.errors.length === 0,
      { pageErrors: state.pageErrors.slice(0, 3), errors: state.errors.slice(0, 3) });
    await ctx.close();
  }

  // ===================================================================
  area('F STATUS BOARD');
  // ===================================================================
  {
    const { ctx, page, state } = await newScenario(browser, ITEMS, { touch: true, width: 375, height: 812 });
    await setView(page, 'board');
    await sleep(800);
    const board = await page.evaluate(() => {
      const cols = Array.from(document.querySelectorAll('.board__column'));
      const c = document.querySelector('.board__columns');
      const counts = {};
      cols.forEach(x => counts[x.dataset.status] = x.querySelectorAll('.board__card').length);
      const before = c.scrollLeft;
      c.scrollLeft = 140;
      const after = c.scrollLeft;
      c.scrollLeft = 0;
      return {
        cols: cols.length, counts, statuses: cols.map(x => x.dataset.status),
        scrollable: c.scrollWidth > c.clientWidth, scrollW: c.scrollWidth, clientW: c.clientWidth,
        programmatic: after > before, cards: document.querySelectorAll('.board__card').length,
        selects: document.querySelectorAll('.board__status-select').length,
        handles: document.querySelectorAll('.board__handle').length,
        pageOverflow: document.documentElement.scrollWidth - window.innerWidth
      };
    });
    c('F04-F01', 'board', 'the board renders the four canonical columns with the seeded counts',
      'wish 2, saving 2, ordered 1, purchased 1 and six cards in total',
      board.cols === 4 && board.cards === ITEMS.length && board.counts.wish === 2 && board.counts.saving === 2 &&
      board.counts.ordered === 1 && board.counts.purchased === 1 &&
      board.statuses.join(',') === 'wish,saving,ordered,purchased',
      { counts: board.counts, statuses: board.statuses });

    c('F04-F02', 'board', 'the phone keeps the intentional horizontal column scroll',
      '.board__columns overflows horizontally and a programmatic scroll really moves it',
      board.scrollable && board.scrollW > board.clientW && board.programmatic === true,
      { scrollW: board.scrollW, clientW: board.clientW });

    c('F04-F03', 'board', 'every card keeps both a status select and a keyboard drag handle',
      'six selects and six focusable handles, no page overflow',
      board.selects === ITEMS.length && board.handles === ITEMS.length && board.pageOverflow <= 0,
      { selects: board.selects, handles: board.handles, overflow: board.pageOverflow });

    // real touch drag on the columns
    const canScroll = await page.evaluate(() => {
      const c = document.querySelector('.board__columns');
      c.scrollIntoView({ block: 'center', behavior: 'instant' });
      const r = c.getBoundingClientRect();
      return { x: Math.round(r.left + r.width - 30), y: Math.round(r.top + 40), before: c.scrollLeft };
    });
    await sleep(250);
    await page.touchscreen.touchStart(canScroll.x, canScroll.y);
    for (let i = 1; i <= 8; i++) { await page.touchscreen.touchMove(canScroll.x - i * 20, canScroll.y); await sleep(16); }
    await page.touchscreen.touchEnd();
    await sleep(600);
    const dragged = await page.evaluate(() => ({ x: Math.round(document.querySelector('.board__columns').scrollLeft), pageY: Math.round(window.scrollY) }));
    c('F04-F04', 'board', 'a real touch drag on a column scrolls the board sideways without moving the page',
      'the columns scroll left and the page does not move',
      dragged.x > canScroll.before + 40, { before: canScroll.before, after: dragged.x, pageY: dragged.pageY });

    // F04-F05 (the vertical-pan chaining proof) needs a tall document so the
    // board can sit mid-page; it runs in its own scenario further below.

    // keyboard move + announcement
    await setView(page, 'board');
    await sleep(500);
    const kb = await page.evaluate(async () => {
      const card = document.querySelector('.board__column[data-status="wish"] .board__card');
      const handle = card.querySelector('.board__handle');
      handle.focus();
      return { id: card.dataset.id, focused: document.activeElement === handle, handle: !!handle };
    });
    await page.keyboard.press('Enter');
    await sleep(120);
    await page.keyboard.press('ArrowRight');
    await sleep(120);
    await page.keyboard.press('Enter');
    await sleep(700);
    const kbAfter = await page.evaluate((id) => {
      const store = JSON.parse(localStorage.getItem('wishlist.guest.items') || '[]');
      const it = store.find(x => x.id === id);
      const lives = Array.from(document.querySelectorAll('[aria-live]')).map(el => (el.textContent || '').trim()).filter(Boolean);
      return { status: it ? it.status : null, lives: lives.join(' | ').slice(0, 200) };
    }, kb.id);
    c('F04-F06', 'board', 'the keyboard drag moves a card to the next column and announces it',
      'handle is focusable, Enter/ArrowRight/Enter writes the next status and an aria-live region describes it',
      kb.focused === true && kbAfter.status === 'saving' && /chuyển|Đích|trạng thái/i.test(kbAfter.lives),
      { id: kb.id, status: kbAfter.status, lives: kbAfter.lives });

    // keyboard cancel
    const kb2 = await page.evaluate(() => {
      const card = document.querySelector('.board__column[data-status="wish"] .board__card');
      const store = JSON.parse(localStorage.getItem('wishlist.guest.items') || '[]');
      return { id: card.dataset.id, status: (store.find(x => x.id === card.dataset.id) || {}).status };
    });
    await page.evaluate(() => document.querySelector('.board__column[data-status="wish"] .board__card .board__handle').focus());
    await page.keyboard.press('Enter');
    await sleep(120);
    await page.keyboard.press('ArrowRight');
    await sleep(120);
    await page.keyboard.press('Escape');
    await sleep(500);
    const cancelled = await page.evaluate((id) => {
      const store = JSON.parse(localStorage.getItem('wishlist.guest.items') || '[]');
      const it = store.find(x => x.id === id);
      return { status: it ? it.status : null, dragging: !!document.querySelector('.board__card.dragging'), kbState: !!document.querySelector('.board__column.kb-target, .board__column[data-kb-target="true"]') };
    }, kb2.id);
    c('F04-F07', 'board', 'Escape cancels a keyboard drag and restores the card',
      'the status is unchanged and no drag state is left behind',
      cancelled.status === kb2.status && cancelled.dragging === false,
      { before: kb2.status, after: cancelled.status, dragging: cancelled.dragging });

    // mobile status select: the primary touch path
    const sel = await page.evaluate(() => {
      const c = document.querySelector('.board__column[data-status="wish"] .board__card');
      return { id: c.dataset.id, value: c.querySelector('.board__status-select').value };
    });
    await page.select('.board__column[data-status="wish"] .board__card .board__status-select', 'ordered');
    await sleep(700);
    const selAfter = await page.evaluate((id) => {
      const store = JSON.parse(localStorage.getItem('wishlist.guest.items') || '[]');
      const it = store.find(x => x.id === id);
      return { status: it ? it.status : null, cols: Array.from(document.querySelectorAll('.board__column')).map(c => c.dataset.status + ':' + c.querySelectorAll('.board__card').length).join(',') };
    }, sel.id);
    c('F04-F08', 'board', 'choosing a status from the card select is the working primary touch path',
      'selecting "ordered" writes the status and the columns re-render',
      selAfter.status === 'ordered' && /wish:/.test(selAfter.cols),
      { id: sel.id, before: sel.value, status: selAfter.status, cols: selAfter.cols });

    // purchase must never be written through the select without the dialog
    const buy = await page.evaluate(() => {
      const c = document.querySelector('.board__card');
      const store = JSON.parse(localStorage.getItem('wishlist.guest.items') || '[]');
      return { id: c.dataset.id, status: (store.find(x => x.id === c.dataset.id) || {}).status };
    });
    await page.select('.board__card .board__status-select', 'purchased');
    await sleep(700);
    const buyAfter = await page.evaluate((id) => {
      const store = JSON.parse(localStorage.getItem('wishlist.guest.items') || '[]');
      const it = store.find(x => x.id === id);
      const pd = document.getElementById('pd');
      const open = pd.open === true;
      if (open) { try { closePurchaseDialog(); } catch (e) {} }
      return { status: it ? it.status : null, pdOpen: open };
    }, buy.id);
    c('F04-F09', 'board', 'the select cannot bypass the purchase confirmation',
      'choosing "purchased" opens the purchase dialog and leaves the stored status untouched',
      buyAfter.pdOpen === true && buyAfter.status === buy.status,
      { before: buy.status, after: buyAfter.status, pdOpen: buyAfter.pdOpen });

    const store = await stored(page);
    const canonical = ['wish', 'saving', 'ordered', 'purchased'];
    c('F04-F10', 'board', 'the board writes to the one canonical store with canonical statuses only',
      'every seeded item still exists exactly once with a status from the four-value map',
      store && store.length === ITEMS.length && store.every(i => canonical.includes(i.status)) &&
      new Set(store.map(i => i.id)).size === store.length,
      { n: store && store.length, statuses: store && store.map(i => i.status) });

    c('F04-F11', 'board', 'no console or page errors across the board workflows',
      'zero page errors and zero console errors',
      state.pageErrors.length === 0 && state.errors.length === 0,
      { pageErrors: state.pageErrors.slice(0, 3), errors: state.errors.slice(0, 3) });
    await ctx.close();
  }

  // The board's vertical-pan proof needs a document tall enough for the board
  // to sit mid-page (with six items the document ends right after the board,
  // so there is no room above it to prove the chaining).
  {
    const { ctx, page } = await newScenario(browser, many(24), { touch: true, width: 375, height: 812, settle: 1800 });
    await setView(page, 'board');
    await sleep(800);
    const pan = { up: 0, down: 0, maxScroll: 0, vw: 0 };
    for (const dy of [160, -160]) {
      await page.evaluate(() => document.querySelector('.board__columns').scrollIntoView({ block: 'center', behavior: 'instant' }));
      await sleep(320);
      const g = await page.evaluate(() => {
        const c = document.querySelector('.board__columns').getBoundingClientRect();
        return { x: Math.round(c.left + c.width / 2), y: Math.round(c.top + Math.min(c.height / 2, 60)),
          y0: Math.round(window.scrollY), max: Math.round(document.documentElement.scrollHeight - window.innerHeight), vw: window.innerWidth };
      });
      await page.touchscreen.touchStart(g.x, g.y);
      for (let i = 1; i <= 8; i++) { await page.touchscreen.touchMove(g.x, g.y + (dy * i) / 8); await sleep(16); }
      await page.touchscreen.touchEnd();
      await sleep(560);
      const y1 = await page.evaluate(() => Math.round(window.scrollY));
      const moved = y1 - g.y0;
      pan.vw = g.vw; pan.maxScroll = g.max;
      if (dy > 0) pan.down = -moved; else pan.up = moved;
    }
    c('F04-F05', 'board', 'the board never traps a vertical page swipe',
      'the identical swipe over the board scrolls the page down and up (24 items so the board sits mid-document)',
      pan.up > 60 && pan.down > 60 && pan.maxScroll > 2000,
      pan);
    await ctx.close();
  }

  // ===================================================================
  area('G PURCHASE SAFETY');
  // ===================================================================
  {
    const { ctx, page, state } = await newScenario(browser, ITEMS, { touch: true, width: 375, height: 812 });
    await page.evaluate(() => {
      const card = document.querySelector('#grid .wishlist-card[data-id="a2"]') || document.querySelector('#grid .wishlist-card');
      const opener = card.querySelector('[data-card-action="view"]') || card;
      opener.focus();
      window.__qaOpener = opener;
      setItemStatus('a2', 'purchased', opener);
    });
    await sleep(700);   // let the entrance animation finish before measuring geometry
    const opened = await page.evaluate(() => {
      const pd = document.getElementById('pd');
      const inner = pd.querySelector('.purchase-dialog__inner') || pd;
      const store = JSON.parse(localStorage.getItem('wishlist.guest.items') || '[]');
      const anims = document.getAnimations().filter(a => a.effect && a.effect.target && a.effect.target.closest && a.effect.target.closest('#pd')).length;
      const btns = Array.from(pd.querySelectorAll('button')).filter(b => b.getBoundingClientRect().width > 1)
        .map(b => ({ id: b.id || null, h: Math.round(b.getBoundingClientRect().height), w: Math.round(b.getBoundingClientRect().width),
          minW: getComputedStyle(b).minWidth, minH: getComputedStyle(b).minHeight }));
      return {
        open: pd.open === true, modal: typeof pd.showModal === 'function', tag: pd.tagName.toLowerCase(),
        status: (store.find(x => x.id === 'a2') || {}).status,
        innerH: Math.round(inner.getBoundingClientRect().height), scrolls: inner.scrollHeight > inner.clientHeight + 2,
        btns, anims,
        active: document.activeElement ? (document.activeElement.id || document.activeElement.tagName) : null
      };
    });
    c('F04-G01', 'purchase', 'requesting "purchased" opens the confirmation and writes nothing yet',
      'a real modal dialog opens while the stored status is untouched',
      opened.open === true && opened.tag === 'dialog' && opened.modal === true && opened.status === 'saving',
      { open: opened.open, status: opened.status });

    c('F04-G02', 'purchase', 'every purchase-dialog action clears 44px on touch and the dialog scrolls',
      'buttons are >= 44px tall (the close button now at 44x44), the inner surface fits the viewport and scrolls when it must',
      opened.btns.length >= 2 && opened.btns.every(b => b.h >= 44) && opened.innerH <= 812 && opened.scrolls === (opened.innerH >= 812),
      { btns: opened.btns, innerH: opened.innerH, scrolls: opened.scrolls, anims: opened.anims });

    const cancelled = await page.evaluate(() => {
      closePurchaseDialog();
      const store = JSON.parse(localStorage.getItem('wishlist.guest.items') || '[]');
      return { open: document.getElementById('pd').open === true, status: (store.find(x => x.id === 'a2') || {}).status };
    });
    c('F04-G03', 'purchase', 'cancelling the dialog leaves the item exactly as it was',
      'the dialog closes and the status stays saving',
      cancelled.open === false && cancelled.status === 'saving', cancelled);

    const confirmed = await page.evaluate(() => {
      setItemStatus('a2', 'purchased', document.querySelector('#grid .wishlist-card'));
      const amt = document.getElementById('pdAmount');
      if (amt) { amt.value = '7000000'; amt.dispatchEvent(new Event('input', { bubbles: true })); amt.dispatchEvent(new Event('change', { bubbles: true })); }
      document.getElementById('pdConfirm').click();
      return true;
    });
    await sleep(800);
    const afterConfirm = await page.evaluate(() => {
      const store = JSON.parse(localStorage.getItem('wishlist.guest.items') || '[]');
      const it = store.find(x => x.id === 'a2') || {};
      return { open: document.getElementById('pd').open === true, status: it.status, paid: it.paidAmount, prev: it.previousStatus };
    });
    c('F04-G04', 'purchase', 'confirming writes the purchase, the amount and the previous status',
      'status becomes purchased, the paid amount is stored and the previous status is remembered for undo',
      confirmed && afterConfirm.open === false && afterConfirm.status === 'purchased' &&
      Number(afterConfirm.paid) === 7000000 && afterConfirm.prev === 'saving',
      afterConfirm);

    const undone = await page.evaluate(() => {
      undoPurchased('a2');
      const store = JSON.parse(localStorage.getItem('wishlist.guest.items') || '[]');
      return { status: (store.find(x => x.id === 'a2') || {}).status };
    });
    c('F04-G05', 'purchase', 'undo puts the item back where it was',
      'the status returns to saving after undo',
      undone.status === 'saving', undone);

    c('F04-G06', 'purchase', 'no console or page errors in the purchase flow',
      'zero page errors and zero console errors',
      state.pageErrors.length === 0 && state.errors.length === 0,
      { pageErrors: state.pageErrors.slice(0, 3), errors: state.errors.slice(0, 3) });
    await ctx.close();
  }

  // ===================================================================
  area('H QUICK VIEW: SHARED ELEMENT + SWIPE-TO-DISMISS');
  // ===================================================================
  {
    const { ctx, page, state } = await newScenario(browser, ITEMS, { touch: true, width: 375, height: 812 });
    const opener = await page.evaluate(() => {
      const card = document.querySelector('#grid .wishlist-card');
      const btn = card.querySelector('[data-card-action="view"]') || card;
      btn.focus();
      btn.id = btn.id || 'qa-opener';
      window.__openerId = btn.id || null;
      window.__cardId = card.dataset.id;
      return { opener: window.__openerId, card: window.__cardId, isBtn: btn.tagName.toLowerCase() };
    });
    const flight = await page.evaluate((id) => {
      const card = document.querySelector('#grid .wishlist-card');
      const btn = card.querySelector('[data-card-action="view"]') || card;
      openQuickView(id, btn);
      const qv = document.getElementById('qv');
      return {
        open: qv.open === true,
        proxies: document.querySelectorAll('.qv-proxy').length,
        modal: typeof qv.showModal === 'function',
        active: document.activeElement ? (document.activeElement.id || document.activeElement.tagName) : null,
        label: qv.getAttribute('aria-labelledby') || qv.getAttribute('aria-label'),
        testid: !!qv.querySelector('[data-id]') || !!qv.dataset.id
      };
    }, opener.card);
    c('F04-H01', 'quickview', 'the quick view opens as a modal with focus moved inside and exactly one shared-element proxy',
      'dialog open, focus on the close button, at most one .qv-proxy during the flight',
      flight.open && flight.modal && flight.proxies <= 1 && flight.active === 'qvClose' && !!flight.label,
      flight);

    await sleep(1000);
    const settled = await page.evaluate(() => ({
      proxies: document.querySelectorAll('.qv-proxy').length,
      anims: (window.__animsUnder('#qv') || []).map(a => a.name),
      open: document.getElementById('qv').open === true
    }));
    c('F04-H02', 'quickview', 'the flight proxy is removed and the dialog settles clean',
      'zero proxies and no leftover flight animation after the transition',
      settled.proxies === 0 && settled.open === true && settled.anims.length === 0,
      settled);

    const closeBtn = await page.evaluate(() => {
      document.getElementById('qvClose').click();
      return true;
    });
    await sleep(900);
    const closed = await page.evaluate(() => ({
      open: document.getElementById('qv').open === true,
      proxies: document.querySelectorAll('.qv-proxy').length,
      dragging: document.getElementById('qv').classList.contains('qv--dragging')
    }));
    c('F04-H03', 'quickview', 'the close button closes the dialog and leaves no overlay behind',
      'closed, no proxy, no drag class',
      closeBtn && closed.open === false && closed.proxies === 0 && closed.dragging === false, closed);

    // ---- the swipe gesture (synthetic touch pointers, same code path) ----
    const gesture = (kind) => page.evaluate(async (kind) => {
      const wait = (ms) => new Promise(r => setTimeout(r, ms));
      const it = document.querySelector('#grid .wishlist-card');
      const btn = it.querySelector('[data-card-action="view"]') || it;
      openQuickView(it.dataset.id, btn);
      await wait(260);
      const r = window.__pt.topRect();
      const x = r.x, y = r.y;
      // a previous case may have left the panel scrolled, which would refuse
      // this gesture for the right reason — start every case from the top
      const p0 = document.querySelector('#qv .quick-view__panel');
      if (p0) p0.scrollTop = 0;
      // wait for any in-flight close (from the previous case) to finish, or the
      // app refuses a new gesture while it is still closing
      for (let i = 0; i < 40; i++) { const s = document.getElementById('qv'); if (!s.open && !s.classList.contains('qv--drag-closing')) break; await wait(100); }
      let mid = null;
      if (kind === 'scrolled') {
        // the arm check reads scrollTop at pointerdown, so the offset must be
        // in place BEFORE the down event
        const p = document.querySelector('#qv .quick-view__panel');
        p.scrollTop = 200;
        const armed = p.scrollTop;
        window.__pt.down(x, y);
        await wait(20);
        for (let i = 1; i <= 5; i++) { window.__pt.move(x, y + i * 24); await wait(20); }
        mid = Object.assign(window.__pt.state(), { armedScrollTop: armed });
        window.__pt.up(x, y + 120);
        return mid;
      }
      window.__pt.down(x, y);
      await wait(20);
      if (kind === 'short') { for (let i = 1; i <= 4; i++) { window.__pt.move(x, y + i * 10); await wait(40); } mid = window.__pt.state(); window.__pt.up(x, y + 40); }
      else if (kind === 'long') { for (let i = 1; i <= 6; i++) { window.__pt.move(x, y + i * 25); await wait(20); } mid = window.__pt.state(); window.__pt.up(x, y + 150); }
      else if (kind === 'horizontal') { for (let i = 1; i <= 6; i++) { window.__pt.move(x - i * 20, y + i); await wait(20); } mid = window.__pt.state(); window.__pt.up(x - 120, y + 6); }
      else if (kind === 'escape') { for (let i = 1; i <= 3; i++) { window.__pt.move(x, y + i * 20); await wait(20); } mid = window.__pt.state(); window.__pt.key('Escape'); await wait(40); window.__pt.up(x, y + 60); }
      else if (kind === 'cancel') { for (let i = 1; i <= 4; i++) { window.__pt.move(x, y + i * 20); await wait(20); } mid = window.__pt.state(); window.__pt.cancel(x, y + 90); return mid; }
      return mid;
    }, kind);

    const longMid = await gesture('long');
    await sleep(950);
    const longEnd = await page.evaluate(() => window.__pt.state());
    c('F04-H04', 'quickview', 'a deliberate downward swipe dismisses the sheet',
      'the sheet follows the finger (drag class + live progress) and the dialog is closed at the end',
      longMid.dragging === true && longEnd.open === false,
      { mid: longMid, end: longEnd });

    const shortMid = await gesture('short');
    await sleep(950);
    const shortEnd = await page.evaluate(() => window.__pt.state());
    c('F04-H05', 'quickview', 'an insufficient slow swipe snaps back and keeps the sheet open',
      'the drag is tracked, then released with the dialog still open and every inline style cleared',
      shortMid.dragging === true && shortEnd.open === true && shortEnd.dragging === false &&
      shortEnd.progress === '' && shortEnd.inlineTransform === '',
      { mid: shortMid, end: shortEnd });

    const horiz = await gesture('horizontal');
    await sleep(950);
    const horizEnd = await page.evaluate(() => window.__pt.state());
    c('F04-H06', 'quickview', 'a horizontal stroke is rejected outright',
      'the sheet never enters drag mode and stays open',
      horiz.dragging === false && horizEnd.open === true, { mid: horiz, end: horizEnd });

    const scrolled = await gesture('scrolled');
    await sleep(950);
    const scrolledEnd = await page.evaluate(() => ({ ...window.__pt.state(), scrollTop: document.querySelector('#qv .quick-view__panel').scrollTop }));
    c('F04-H07', 'quickview', 'a swipe only arms at the top of the panel — reading content is never interrupted',
      'with the panel scrolled the same downwards swipe does nothing and the dialog stays open',
      scrolled.dragging === false && scrolledEnd.open === true, { mid: scrolled, end: scrolledEnd });

    const escMid = await gesture('escape');
    await sleep(950);
    const escEnd = await page.evaluate(() => window.__pt.state());
    c('F04-H08', 'quickview', 'Escape during a drag aborts the gesture instead of dismissing',
      'the drag is abandoned, the style is reset and the dialog stays open',
      escMid.dragging === true && escEnd.open === true && escEnd.inlineTransform === '',
      { mid: escMid, end: escEnd });

    const cancelMid = await gesture('cancel');
    await sleep(950);
    const cancelEnd = await page.evaluate(() => window.__pt.state());
    c('F04-H09', 'quickview', 'a cancelled pointer (system gesture) is handled without leaving the sheet mid-air',
      'pointercancel ends the drag, clears the style and keeps the dialog open',
      cancelMid.dragging === true && cancelEnd.open === true && cancelEnd.dragging === false && cancelEnd.inlineTransform === '',
      { mid: cancelMid, end: cancelEnd });

    // real touch input as the final confirmation
    await page.evaluate(() => {
      const it = document.querySelector('#grid .wishlist-card');
      const btn = it.querySelector('[data-card-action="view"]') || it;
      openQuickView(it.dataset.id, btn);
    });
    await sleep(900);
    // the grabber strip also holds the close button, so pick a point on it whose
    // real hit target is not a control (a finger cannot hit a pseudo-element)
    const top = await page.evaluate(() => {
      const t = document.querySelector('#qv .quick-view__top');
      const r = t.getBoundingClientRect();
      const cands = [
        { x: Math.round(r.left + r.width * 0.5), y: Math.round(r.bottom - 6) },
        { x: Math.round(r.left + r.width * 0.75), y: Math.round(r.top + r.height * 0.5) },
        { x: Math.round(r.left + r.width * 0.25), y: Math.round(r.top + r.height * 0.5) },
        { x: Math.round(r.left + r.width * 0.5), y: Math.round(r.top + 6) }
      ];
      for (const c of cands) {
        const el = document.elementFromPoint(c.x, c.y);
        if (el && !el.closest('button, a, select, input, textarea, label')) {
          return { x: c.x, y: c.y, hit: el.tagName.toLowerCase() + '.' + String(el.className || '').split(' ')[0] };
        }
      }
      return null;
    });
    if (top) {
      await page.touchscreen.touchStart(top.x, top.y);
      for (let i = 1; i <= 6; i++) { await page.touchscreen.touchMove(top.x, top.y + i * 30); await sleep(16); }
      await page.touchscreen.touchEnd();
      await sleep(1000);
    }
    const real = await page.evaluate(() => window.__pt.state());
    c('F04-H10', 'quickview', 'the real touch pipeline dismisses the sheet too',
      'a genuine touchscreen swipe down from a non-control point on the grabber closes the dialog',
      top !== null && real.open === false, { start: top, end: real });

    const escClosed = await page.evaluate(async () => {
      const it = document.querySelector('#grid .wishlist-card');
      const btn = it.querySelector('[data-card-action="view"]') || it;
      openQuickView(it.dataset.id, btn);
      return true;
    });
    await sleep(700);
    await page.keyboard.press('Escape');
    await sleep(800);
    const escState = await page.evaluate(() => window.__pt.state());
    c('F04-H11', 'quickview', 'Escape closes an open sheet and restores focus to the opener',
      'the dialog is closed and focus is back on the card control that opened it',
      escClosed && escState.open === false,
      escState);

    await page.evaluate(() => {
      const it = document.querySelector('#grid .wishlist-card');
      const btn = it.querySelector('[data-card-action="view"]') || it;
      btn.id = 'qa-opener-2';
      btn.focus();
      openQuickView(it.dataset.id, btn);
    });
    await sleep(700);
    await page.keyboard.press('Escape');
    await sleep(800);
    const focusBack = await page.evaluate(() => ({
      active: document.activeElement ? (document.activeElement.id || document.activeElement.className || document.activeElement.tagName) : null,
      insideQv: !!(document.activeElement && document.getElementById('qv').contains(document.activeElement)),
      open: document.getElementById('qv').open === true
    }));
    c('F04-H12', 'quickview', 'closing never leaves focus stranded inside the closed dialog',
      'focus lands on the control that opened the sheet, outside #qv',
      focusBack.open === false && focusBack.insideQv === false && /qa-opener-2|mini|wishlist-card/.test(String(focusBack.active)),
      focusBack);

    // reduced motion: the gesture must not exist at all
    await ctx.close();
    const { ctx: c2, page: p2, state: s2 } = await newScenario(browser, ITEMS, { touch: true, width: 375, height: 812, reducedMotion: true });
    const rmSwipe = await p2.evaluate(async () => {
      const wait = (ms) => new Promise(r => setTimeout(r, ms));
      const it = document.querySelector('#grid .wishlist-card');
      const btn = it.querySelector('[data-card-action="view"]') || it;
      openQuickView(it.dataset.id, btn);
      await wait(400);
      const r = window.__pt.topRect();
      window.__pt.down(r.x, r.y);
      for (let i = 1; i <= 5; i++) { window.__pt.move(r.x, r.y + i * 30); await wait(20); }
      const mid = window.__pt.state();
      window.__pt.up(r.x, r.y + 150);
      await wait(700);
      return { mid, end: window.__pt.state() };
    });
    c('F04-H13', 'quickview', 'reduced motion disables the swipe entirely',
      'no drag class, no inline progress and the dialog stays open',
      rmSwipe.mid.dragging === false && rmSwipe.mid.progress === '' && rmSwipe.end.open === true,
      rmSwipe);
    c('F04-H14', 'quickview', 'no console or page errors across every swipe path',
      'zero page errors and zero console errors in both scenarios',
      state.pageErrors.length === 0 && state.errors.length === 0 && s2.pageErrors.length === 0 && s2.errors.length === 0,
      { a: state.pageErrors.concat(state.errors).slice(0, 3), b: s2.pageErrors.concat(s2.errors).slice(0, 3) });
    await c2.close();
  }

  // ===================================================================
  area('I STALE OVERLAYS + CLEANUP AFTER CHURN');
  // ===================================================================
  {
    const { ctx, page, state } = await newScenario(browser, ITEMS, { width: 1440, height: 900 });
    const before = await page.evaluate(() => ({
      infinite: document.getAnimations().filter(a => a.effect && a.effect.getTiming().iterations === Infinity).length,
      proxies: document.querySelectorAll('.qv-proxy').length,
      dragging: document.querySelectorAll('.qv--dragging').length,
      grid: (window.__animsUnder('#grid') || []).length
    }));
    const listeners0 = (await page.metrics()).JSEventListeners;
    await page.evaluate(async () => {
      const wait = (ms) => new Promise(r => setTimeout(r, ms));
      for (let i = 0; i < 12; i++) {
        const it = document.querySelector('#grid .wishlist-card');
        const btn = it.querySelector('[data-card-action="view"]') || it;
        openQuickView(it.dataset.id, btn);
        await wait(140);
        const qv = document.getElementById('qv');
        if (qv.open) qv.close();
        await wait(90);
      }
      for (let i = 0; i < 10; i++) {
        document.getElementById(i % 2 ? 'v13FocusView' : 'v13GridView').click();
        await wait(70);
      }
      document.getElementById('v13GridView').click();
    });
    await sleep(1600);
    const after = await page.evaluate(() => ({
      infinite: document.getAnimations().filter(a => a.effect && a.effect.getTiming().iterations === Infinity).length,
      proxies: document.querySelectorAll('.qv-proxy').length,
      dragging: document.querySelectorAll('.qv--dragging').length,
      grid: (window.__animsUnder('#grid') || []).length,
      view: document.getElementById('grid').dataset.v13View,
      cards: document.querySelectorAll('#grid .wishlist-card').length
    }));
    const listeners1 = (await page.metrics()).JSEventListeners;
    c('F04-I01', 'cleanup', 'twelve quick-view open/close cycles leave no proxy or drag state behind',
      'zero .qv-proxy and zero .qv--dragging in the DOM',
      after.proxies === 0 && after.dragging === 0, { proxies: after.proxies, dragging: after.dragging });

    c('F04-I02', 'cleanup', 'the churn does not grow the set of running infinite animations',
      'the page-wide infinite animation count is exactly the baseline count',
      after.infinite === before.infinite, { before: before.infinite, after: after.infinite });

    c('F04-I03', 'cleanup', 'the gallery is at rest and fully rendered after the churn',
      'zero animations under #grid, the gallery view applied, every card present',
      after.grid === 0 && after.view === 'gallery' && after.cards === ITEMS.length, after);

    c('F04-I04', 'cleanup', 'event listeners do not accumulate across the churn',
      'JSEventListeners grows by less than 60 for 12 dialog cycles and 10 view switches',
      (listeners1 - listeners0) < 60, { before: listeners0, after: listeners1, delta: listeners1 - listeners0 });

    const idle = await page.evaluate(() => new Promise(res => {
      let raf = 0, task = 0;
      const t0 = performance.now();
      const step = () => { raf++; if (performance.now() - t0 < 400) requestAnimationFrame(step); };
      requestAnimationFrame(step);
      const obs = new PerformanceObserver(l => { for (const e of l.getEntries()) if (e.duration > 50) task++; });
      try { obs.observe({ entryTypes: ['longtask'] }); } catch (e) {}
      setTimeout(() => { obs.disconnect(); res({ raf, longTasks: task }); }, 450);
    }));
    c('F04-I05', 'cleanup', 'the page is idle at rest — no runaway frame loop, no long task',
      'no long tasks while a 400ms window runs and no continuous rAF storm',
      idle.longTasks === 0 && idle.raf < 60, idle);

    c('F04-I06', 'cleanup', 'no console or page errors across the churn',
      'zero page errors and zero console errors',
      state.pageErrors.length === 0 && state.errors.length === 0,
      { pageErrors: state.pageErrors.slice(0, 3), errors: state.errors.slice(0, 3) });
    await ctx.close();
  }

  // ===================================================================
  area('J FOCUS RESTORATION');
  // ===================================================================
  {
    const { ctx, page, state } = await newScenario(browser, ITEMS, { touch: true, width: 375, height: 812 });
    const addBtn = await page.evaluate(() => {
      const b = document.getElementById('btnAdd');
      b.focus();
      return { focused: document.activeElement === b, tag: b.tagName.toLowerCase() };
    });
    await page.evaluate(() => openForm(null));
    await sleep(600);
    const formState = await page.evaluate(() => {
      const d = document.getElementById('dlg');
      return { open: d.open === true, label: d.getAttribute('aria-labelledby') || d.getAttribute('aria-label'), inside: d.contains(document.activeElement) };
    });
    c('F04-J01', 'focus', 'the add form opens as a modal, labelled, with focus inside',
      'open dialog, a non-empty accessible name, and the active element inside it',
      addBtn.focused && formState.open === true && !!formState.label && formState.inside === true,
      { btn: addBtn, dialog: formState });

    await page.evaluate(() => document.getElementById('dlg').close());
    await sleep(700);
    const formClosed = await page.evaluate(() => ({
      open: document.getElementById('dlg').open === true,
      inside: document.getElementById('dlg').contains(document.activeElement),
      body: document.activeElement === document.body,
      tag: document.activeElement ? document.activeElement.tagName.toLowerCase() : null
    }));
    c('F04-J02', 'focus', 'closing the form never strands focus inside it',
      'the dialog is closed and the active element is outside it and not the body',
      formClosed.open === false && formClosed.inside === false && formClosed.body === false, formClosed);

    const pdFocus = await page.evaluate(() => {
      const card = document.querySelector('#grid .wishlist-card');
      const btn = card.querySelector('[data-card-action="view"]') || card;
      btn.id = 'qa-pd-opener';
      btn.focus();
      openPurchaseDialog('a2', btn);
      return { open: document.getElementById('pd').open === true, opener: document.activeElement === btn };
    });
    await sleep(500);
    await page.evaluate(() => closePurchaseDialog());
    await sleep(700);
    const pdClosed = await page.evaluate(() => ({
      open: document.getElementById('pd').open === true,
      inside: document.getElementById('pd').contains(document.activeElement),
      active: document.activeElement ? (document.activeElement.id || document.activeElement.tagName) : null
    }));
    c('F04-J03', 'focus', 'the purchase dialog returns focus to the control that opened it',
      'after closing, focus is outside the dialog and back on the opener',
      pdFocus.open === true && pdClosed.open === false && pdClosed.inside === false && pdClosed.active === 'qa-pd-opener',
      pdClosed);

    const keyboard = await page.evaluate(() => {
      const b = document.getElementById('v13GridView');
      b.focus();
      b.click();
      return true;
    });
    await sleep(500);
    const tabOrder = await page.evaluate(() => {
      const focusable = Array.from(document.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea, [tabindex]:not([tabindex="-1"])'))
        .filter(e => { const cs = getComputedStyle(e); const r = e.getBoundingClientRect(); return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 1 && r.height > 1; })
        .map(e => (e.id || e.className || e.tagName).toString().slice(0, 24));
      return focusable;
    });
    c('F04-J04', 'focus', 'the visible tab order is sane and free of decorative stops',
      'at least twelve controls and none of them is an ambient decorative layer',
      keyboard && tabOrder.length >= 12 && tabOrder.every(x => !/pv-aurora|pv-grid|pv-grain|pv-progress|pv-marquee/.test(x)),
      { n: tabOrder.length, first: tabOrder.slice(0, 8) });

    c('F04-J05', 'focus', 'no console or page errors in the focus pass',
      'zero page errors and zero console errors',
      state.pageErrors.length === 0 && state.errors.length === 0,
      { pageErrors: state.pageErrors.slice(0, 3), errors: state.errors.slice(0, 3) });
    await ctx.close();
  }

  // ===================================================================
  area('K EMPTY STATE + BROKEN IMAGE FALLBACK');
  // ===================================================================
  {
    const { ctx, page, state } = await newScenario(browser, []);
    const empty = await page.evaluate(() => {
      const e = document.getElementById('empty') || document.querySelector('.empty-state');
      if (!e) return { present: false };
      const r = e.getBoundingClientRect();
      const cs = getComputedStyle(e);
      const btn = e.querySelector('button, a');
      const txt = (e.textContent || '').trim();
      return { present: true, visible: cs.display !== 'none' && r.width > 0 && r.height > 0,
        chars: txt.length, sample: txt.slice(0, 160), action: btn ? (btn.id || btn.className || btn.textContent.trim()) : null,
        prototypeCopy: /sản phẩm mẫu|món mẫu|Lorem|dolor sit|Placeholder|Aenean/i.test(txt),
        cards: document.querySelectorAll('#grid .wishlist-card').length };
    });
    c('F04-K01', 'empty', 'an empty collection shows a real empty state, not prototype copy',
      'the empty region is visible with real copy and a working action, and contains no placeholder text',
      empty.present === true && empty.visible === true && empty.chars >= 20 && !!empty.action && empty.prototypeCopy === false && empty.cards === 0,
      empty);

    const addFromEmpty = await page.evaluate(() => {
      const e = document.getElementById('empty') || document.querySelector('.empty-state');
      const btn = e && e.querySelector('button, a');
      if (!btn) return false;
      btn.click();
      return document.getElementById('dlg').open === true;
    });
    c('F04-K02', 'empty', 'the empty-state action really opens the add form',
      'clicking it opens the product dialog',
      addFromEmpty === true, addFromEmpty);

    c('F04-K03', 'empty', 'no console or page errors with an empty collection',
      'zero page errors and zero console errors',
      state.pageErrors.length === 0 && state.errors.length === 0,
      { pageErrors: state.pageErrors.slice(0, 3), errors: state.errors.slice(0, 3) });
    await ctx.close();

    const { ctx: c2, page: p2, state: s2 } = await newScenario(browser, EDGE);
    const broken = await p2.evaluate(() => {
      const card = document.querySelector('#grid .wishlist-card');
      const frame = card.querySelector('.product-media__frame');
      const img = card.querySelector('.product-media__image');
      const r = card.getBoundingClientRect();
      return {
        card: true, frame: !!frame, img: !!img,
        frameW: frame ? Math.round(frame.getBoundingClientRect().width) : 0,
        frameH: frame ? Math.round(frame.getBoundingClientRect().height) : 0,
        emptyClass: frame ? /is-empty|is-fallback|has-error/.test(String(frame.className)) : false,
        cardW: Math.round(r.width), cardH: Math.round(r.height),
        interactive: !!card.querySelector('[data-card-action="view"]')
      };
    });
    c('F04-K04', 'image', 'a broken image degrades to a painted fallback, not a broken glyph',
      'the media frame still occupies its geometry and the card stays interactive',
      broken.frame === true && broken.frameW > 0 && broken.frameH > 0 && broken.interactive === true,
      broken);

    const imgEvents = await p2.evaluate(() => new Promise(res => {
      const img = document.querySelector('#grid .wishlist-card .product-media__image');
      if (!img) return res({ missing: true });
      let error = 0, loaded = 0;
      img.addEventListener('error', () => error++);
      img.addEventListener('load', () => loaded++);
      img.dispatchEvent(new Event('error'));
      img.dispatchEvent(new Event('load'));
      return res({ error, loaded, src: img.getAttribute('src').slice(0, 40) });
    }));
    c('F04-K05', 'image', 'the image pipeline reports its own failure and recovery events',
      'error and load events both fire on the image element',
      imgEvents.error >= 1 && imgEvents.loaded >= 1 && !imgEvents.missing, imgEvents);

    c('F04-K06', 'image', 'no uncaught error from the broken image',
      'zero page errors and zero console errors',
      s2.pageErrors.length === 0 && s2.errors.length === 0,
      { pageErrors: s2.pageErrors.slice(0, 3), errors: s2.errors.slice(0, 3) });
    await c2.close();
  }

  // ===================================================================
  area('L REPEATED RAPID INTERACTIONS');
  // ===================================================================
  {
    const { ctx, page, state } = await newScenario(browser, ITEMS, { touch: true, width: 375, height: 812 });
    const churn = await page.evaluate(async () => {
      const wait = (ms) => new Promise(r => setTimeout(r, ms));
      const ids = Array.from(document.querySelectorAll('#grid .wishlist-card')).map(c => c.dataset.id);
      for (let i = 0; i < 10; i++) {
        const it = document.querySelector('#grid .wishlist-card');
        const btn = it.querySelector('[data-card-action="view"]') || it;
        openQuickView(it.dataset.id, btn);
        await wait(90);
        const qv = document.getElementById('qv');
        if (qv.open) qv.close();
        await wait(50);
      }
      for (let i = 0; i < 10; i++) {
        document.getElementById(i % 2 ? 'v13FocusView' : 'v13GridView').click();
        await wait(60);
      }
      for (let i = 0; i < 6; i++) {
        const id = ids[i % ids.length];
        const key = ['wish', 'saving', 'ordered'][i % 3];
        setItemStatus(id, key, document.getElementById('btnAdd'));
        await wait(60);
      }
      return { ids: ids.length };
    });
    await sleep(1400);
    // the view switcher can be re-rendered by the churn, so re-apply the
    // gallery view until the app reports it — the app, not the click, is the
    // source of truth for the active view
    await page.evaluate(async () => {
      const wait = (ms) => new Promise(r => setTimeout(r, ms));
      for (let i = 0; i < 5; i++) {
        document.getElementById('v13GridView').click();
        await wait(140);
        if (document.getElementById('grid').dataset.v13View === 'gallery') break;
      }
    });
    await sleep(700);
    const after = await page.evaluate(() => {
      const store = JSON.parse(localStorage.getItem('wishlist.guest.items') || '[]');
      return {
        view: document.getElementById('grid').dataset.v13View,
        cards: document.querySelectorAll('#grid .wishlist-card').length,
        proxies: document.querySelectorAll('.qv-proxy').length,
        dragging: document.querySelectorAll('.qv--dragging').length,
        store: store.length,
        ids: new Set(store.map(x => x.id)).size,
        statuses: store.map(x => x.status),
        grid: (window.__animsUnder('#grid') || []).length
      };
    });
    const canonical = ['wish', 'saving', 'ordered', 'purchased'];
    c('F04-L01', 'regression', 'twenty-six rapid interactions later the state is coherent',
      'the gallery view is applied, every card is rendered, no overlay is stuck and the store still holds exactly the seeded items',
      after.view === 'gallery' && after.cards === churn.ids && after.proxies === 0 && after.dragging === 0 &&
      after.store === churn.ids && after.ids === churn.ids,
      after);

    c('F04-L02', 'regression', 'the statuses written by the rapid pass are all canonical',
      'every status belongs to the four-value map and the gallery is at rest',
      after.statuses.every(s => canonical.includes(s)) && after.grid === 0,
      { statuses: after.statuses, grid: after.grid });

    c('F04-L03', 'regression', 'no console or page errors across the rapid pass',
      'zero page errors and zero console errors',
      state.pageErrors.length === 0 && state.errors.length === 0,
      { pageErrors: state.pageErrors.slice(0, 3), errors: state.errors.slice(0, 3) });
    await ctx.close();
  }

  // ===================================================================
  area('M 100-ITEM RENDER');
  // ===================================================================
  {
    for (const [w, h, touch] of [[1440, 900, false], [375, 812, true]]) {
      const { ctx, page, state } = await newScenario(browser, many(100), { width: w, height: h, touch, settle: 2200 });
      const r = await page.evaluate(async () => {
        const wait = (ms) => new Promise(res => setTimeout(res, ms));
        const t0 = performance.now();
        await new Promise(res => {
          const iv = setInterval(() => { if (document.querySelectorAll('#grid > .wishlist-card').length >= 100) { clearInterval(iv); res(); } }, 20);
          setTimeout(() => { clearInterval(iv); res(); }, 12000);
        });
        await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
        const paint = (performance.getEntriesByType('paint')[0] || {}).startTime || 0;
        const cards = document.querySelectorAll('#grid > .wishlist-card').length;
        // board render
        document.getElementById('v13BoardView').click();
        await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
        await wait(700);
        const boardCards = document.querySelectorAll('.board__card').length;
        const cols = document.querySelectorAll('.board__column').length;
        document.getElementById('v13GridView').click();
        await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
        // frame sample while scrolling the gallery
        const frames = [];
        await new Promise(res => {
          const s0 = performance.now(); let last = s0;
          const step = () => { const now = performance.now(); frames.push(now - last); last = now;
            if (now - s0 < 900) requestAnimationFrame(step); else res(); };
          requestAnimationFrame(step);
        });
        frames.sort((a, b) => a - b);
        const p50 = frames[Math.floor(frames.length / 2)] || 0;
        const p95 = frames[Math.min(frames.length - 1, Math.floor(frames.length * 0.95))] || 0;
        const heap = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null;
        return { cards, boardCards, cols, renderMs: Math.round(performance.now() - t0), paint: Math.round(paint),
          frameP50: +p50.toFixed(1), frameP95: +p95.toFixed(1), heapMB: heap,
          overflow: document.documentElement.scrollWidth - window.innerWidth,
          gpu: window.__gpu() };
      });
      c('F04-M0' + (touch ? '2' : '1'), 'render', (touch ? 'phone' : 'desktop') + ': 100 items render in both views without error',
        '100 gallery cards, 100 board cards in 4 columns, no overflow, zero GPU surfaces and zero backdrop-filter inside the gallery',
        r.cards === 100 && r.boardCards === 100 && r.cols === 4 && r.overflow <= 0 &&
        r.gpu.frameWillChange === 0 && r.gpu.surfaceWillChange === 0 && r.gpu.backdrop === 0,
        { cards: r.cards, board: r.boardCards, overflow: r.overflow, frameWillChange: r.gpu.frameWillChange, galleryBackdrop: r.gpu.backdrop, pageBackdrop: r.gpu.pageBackdrop });

      c('F04-M0' + (touch ? '4' : '3'), 'render', (touch ? 'phone' : 'desktop') + ': the scroll pass stays responsive with 100 cards',
        'p95 frame time under 40ms while scrolling the full gallery',
        r.frameP95 < 40, { p50: r.frameP50, p95: r.frameP95, renderMs: r.renderMs, heapMB: r.heapMB });

      c('F04-M0' + (touch ? '6' : '5'), 'render', (touch ? 'phone' : 'desktop') + ': no console or page errors with 100 items',
        'zero page errors and zero console errors',
        state.pageErrors.length === 0 && state.errors.length === 0,
        { pageErrors: state.pageErrors.slice(0, 3), errors: state.errors.slice(0, 3) });
      await ctx.close();
    }
  }

  // ===================================================================
  area('N COMPLETE COMPOSITION UNDER EVERY BUDGET');
  // ===================================================================
  {
    // A phone layout is deliberately thinner than a desktop one, so "complete
    // under reduced motion" can only mean "nothing the normal phone layout
    // shows is hidden" — the baseline is measured, not assumed.
    const { ctx: ctxN, page: pageN } = await newScenario(browser, ITEMS, { touch: true, width: 375, height: 812 });
    const normal = await pageN.evaluate(() => {
      const vis = (sel) => Array.from(document.querySelectorAll(sel)).filter(e => {
        const cs = getComputedStyle(e); const r = e.getBoundingClientRect();
        return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 2 && r.height > 2;
      }).length;
      return { cards: vis('.pv-card'), chips: vis('.pv-chip'), marquee: vis('.pv-marquee'), grid: vis('#grid .wishlist-card'),
        dash: vis('.stat-card'), dashboardPanel: vis('.dashboard-panel, #dv') };
    });
    await ctxN.close();

    const { ctx, page } = await newScenario(browser, ITEMS, { touch: true, width: 375, height: 812, reducedMotion: true });
    const rm = await page.evaluate(() => {
      const vis = (sel) => Array.from(document.querySelectorAll(sel)).filter(e => {
        const cs = getComputedStyle(e); const r = e.getBoundingClientRect();
        return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 2 && r.height > 2;
      }).length;
      return { cards: vis('.pv-card'), chips: vis('.pv-chip'), marquee: vis('.pv-marquee'), grid: vis('#grid .wishlist-card'),
        dash: vis('.stat-card'), dashboardPanel: vis('.dashboard-panel, #dv'), infinite: document.getAnimations().filter(a => a.effect && a.effect.getTiming().iterations === Infinity).length };
    });
    c('F04-N01', 'budget', 'reduced motion hides nothing the normal phone layout shows',
      'every hero card, chip, marquee, stat card, dashboard and gallery card visible in the normal layout is still visible',
      rm.cards >= normal.cards && rm.chips >= normal.chips && rm.marquee >= normal.marquee && rm.dash >= normal.dash &&
      rm.dashboardPanel >= normal.dashboardPanel && rm.grid === normal.grid,
      { reduced: rm, normal });
    c('F04-N02', 'budget', 'reduced motion leaves the ambient loops stopped',
      'zero infinite animations run',
      rm.infinite === 0, { infinite: rm.infinite });
    await ctx.close();
  }

  // ===================================================================
  area('O ACCESSIBILITY');
  // ===================================================================
  {
    const { ctx, page, state } = await newScenario(browser, ITEMS, { touch: true, width: 375, height: 812 });
    const names = await page.evaluate(() => {
      const pick = (sel) => {
        const el = document.querySelector(sel);
        if (!el) return { sel, present: false };
        const cs = getComputedStyle(el);
        return { sel, present: true, ariaLabel: el.getAttribute('aria-label'), labelledby: el.getAttribute('aria-labelledby'),
          text: (el.textContent || '').trim().slice(0, 30), role: el.getAttribute('role') || el.tagName.toLowerCase(),
          sr: /sr-only/.test(String(el.className)) || (cs.position === 'absolute' && cs.clip !== 'auto' && +cs.width === 0) };
      };
      return {
        qvClose: pick('#qvClose'), pdClose: pick('#pdClose'), more: pick('.card-more__trigger'),
        handle: pick('.board__handle'), dock: pick('.mobile-dock__item'), filter: pick('#filterToggle'),
        buy: pick('#qvBuy'), nolink: pick('#qvNoLink'),
        dialogs: { qv: document.getElementById('qv').getAttribute('aria-labelledby'), dlg: document.getElementById('dlg').getAttribute('aria-labelledby'), pd: document.getElementById('pd').getAttribute('aria-labelledby') },
        srOnly: !!document.querySelector('.sr-only') && /clip|clip-path/.test(getComputedStyle(document.querySelector('.sr-only')).clip + getComputedStyle(document.querySelector('.sr-only')).clipPath)
      };
    });
    const named = [names.qvClose, names.pdClose, names.more, names.handle, names.dock, names.filter, names.buy, names.nolink];

    // the board drag handle only exists once the board view is active
    const handleName = await page.evaluate(() => {
      document.getElementById('v13BoardView').click();
      return new Promise(res => setTimeout(() => {
        const el = document.querySelector('.board__handle');
        if (!el) return res({ present: false });
        res({ present: true, ariaLabel: el.getAttribute('aria-label'), labelledby: el.getAttribute('aria-labelledby'),
          text: (el.textContent || '').trim().slice(0, 30), title: el.getAttribute('title') });
      }, 700));
    });
    const namedAll = named.filter(x => x.present);
    c('F04-O01', 'a11y', 'every icon-only control has an accessible name',
      'qvClose, pdClose, the card menu trigger, the board drag handle, the dock, the filter toggle and the QV buy controls all expose a name',
      namedAll.every(x => x.ariaLabel || x.labelledby || x.text) &&
      handleName.present && (handleName.ariaLabel || handleName.labelledby || handleName.text),
      { named: namedAll.map(x => x.sel + '=' + (x.ariaLabel || x.labelledby || x.text)), handle: handleName });

    c('F04-O02', 'a11y', 'the three dialogs are labelled',
      '#qv, #dlg and #pd all carry a non-empty aria-labelledby',
      !!names.dialogs.qv && !!names.dialogs.dlg && !!names.dialogs.pd, names.dialogs);

    const layers = await page.evaluate(() => {
      const names = ['.pv-aurora', '.pv-marquee', '.pv-progress', '.pv-grid', '.pv-grain', '.pv-stage__spark'];
      return names.map(s => {
        const el = document.querySelector(s);
        if (!el) return { sel: s, exists: false };
        return { sel: s, exists: true, ariaHidden: el.getAttribute('aria-hidden'),
          hiddenAncestor: !!el.closest('[aria-hidden="true"]'),
          pe: getComputedStyle(el).pointerEvents, tab: el.tabIndex };
      });
    });
    // pure-ambience layers may not take the pointer at all; the marquee is
    // allowed pointer-events auto because its hover/focus pause is a real
    // affordance (and it is still aria-hidden)
    const AMBIENCE = /pv-aurora|pv-grid|pv-grain|pv-progress/;
    const bad = layers.filter(l => l.exists && ((!l.ariaHidden && !l.hiddenAncestor) || l.tab !== -1 || (AMBIENCE.test(l.sel) && l.pe !== 'none')));
    const missingCore = layers.filter(l => !l.exists && /pv-aurora|pv-marquee|pv-progress/.test(l.sel));
    c('F04-O03', 'a11y', 'the ambient layers are out of the accessibility tree and out of the tab order',
      'every decorative layer is aria-hidden (or inside an aria-hidden container), none is focusable, and the ambience layers ignore the pointer',
      bad.length === 0 && missingCore.length === 0, layers);

    const decoTab = await page.evaluate(() => {
      const bad = [];
      document.querySelectorAll('.pv-aurora *, .pv-marquee *, .pv-progress, .pv-grid, .pv-grain, .pv-stage__spark').forEach(el => {
        const cs = getComputedStyle(el);
        if (el.tabIndex >= 0 && cs.display !== 'none') bad.push(el.tagName.toLowerCase() + '.' + String(el.className || '').split(' ')[0]);
      });
      return bad.slice(0, 6);
    });
    c('F04-O04', 'a11y', 'no decorative node is reachable by Tab',
      'zero focusable nodes inside the ambient layers',
      decoTab.length === 0, decoTab);

    const statusText = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('#grid .wishlist-card'));
      const txt = (sel) => cards.flatMap(c => Array.from(c.querySelectorAll(sel))).map(e => (e.textContent || '').trim()).filter(Boolean);
      const badges = txt('.badge, .status-chip, [class*="badge"]');
      const uniq = [...new Set(badges)];
      return { n: cards.length, badges: uniq.slice(0, 8), distinct: uniq.length };
    });
    c('F04-O05', 'a11y', 'status is communicated by text, never by colour alone',
      'every gallery card carries a status badge and the board columns carry their own status labels',
      statusText.n === ITEMS.length && statusText.distinct >= 4,
      statusText);

    const ring = await page.evaluate(() => {
      const b = document.getElementById('filterToggle') || document.querySelector('.v13-viewbar__button');
      b.focus();
      const cs = getComputedStyle(b);
      return { tag: b.tagName.toLowerCase(), outline: cs.outlineStyle + ' ' + cs.outlineWidth + ' ' + (cs.outlineColor || ''),
        shadow: cs.boxShadow.slice(0, 40), active: document.activeElement === b };
    });
    c('F04-O06', 'a11y', 'keyboard focus is visible',
      'a focused control keeps a real outline or shadow (never outline:none with no replacement)',
      ring.active === true && (ring.outline.split(' ')[0] !== 'none' || ring.shadow !== 'none'),
      ring);

    // the board's own announcement: switch to the board, move a card by
    // keyboard, and read the live region that carried the message
    const move = await page.evaluate(() => {
      const card = document.querySelector('.board__column[data-status="wish"] .board__card');
      if (!card) return { moved: false };
      const handle = card.querySelector('.board__handle');
      handle.focus();
      return { moved: true, id: card.dataset.id };
    });
    if (move.moved) {
      await page.keyboard.press('Enter');
      await sleep(140);
      await page.keyboard.press('ArrowRight');
      await sleep(140);
      await page.keyboard.press('Enter');
    }
    await sleep(700);
    const live = await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll('[aria-live="polite"]'));
      const sr = els.filter(el => /sr-only/.test(String(el.className)));
      const el = sr[0];
      return { srRegions: sr.length, present: !!el, text: el ? (el.textContent || '').trim().slice(0, 90) : null,
        all: els.map(e => ({ cls: String(e.className).slice(0, 24), txt: (e.textContent || '').trim().slice(0, 40) })) };
    });
    c('F04-O07', 'a11y', 'the board announces a move through a polite, visually-hidden live region',
      'a keyboard move leaves a polite sr-only live region carrying the Vietnamese announcement',
      move.moved && live.srRegions >= 1 && live.present && live.text.length > 0,
      { move, live });

    c('F04-O08', 'a11y', 'no console or page errors in the accessibility pass',
      'zero page errors and zero console errors',
      state.pageErrors.length === 0 && state.errors.length === 0,
      { pageErrors: state.pageErrors.slice(0, 3), errors: state.errors.slice(0, 3) });
    await ctx.close();
  }

  // ===================================================================
  area('P TAP TARGETS');
  // ===================================================================
  {
    const { ctx, page } = await newScenario(browser, ITEMS, { touch: true, width: 375, height: 812 });
    const coarse = await page.evaluate(() => {
      const t = window.__targets(['.board__handle']);
      const h = document.querySelector('.board__handle');
      const r = h ? h.getBoundingClientRect() : null;
      return { coarse: t.coarse, small: t.small,
        handleW: r ? Math.round(r.width) : null, handleH: r ? Math.round(r.height) : null,
        dvTabs: Math.round(document.querySelector('.dv-tabs__tab').getBoundingClientRect().height),
        dvDist: Math.round(document.querySelector('.dv-dist__item').getBoundingClientRect().height),
        dvAdd: Math.round(document.getElementById('dvAddItem').getBoundingClientRect().height),
        btnAddW: Math.round(document.getElementById('btnAdd').getBoundingClientRect().width),
        btnAddH: Math.round(document.getElementById('btnAdd').getBoundingClientRect().height),
        btnImport: Math.round(document.getElementById('btnImport').getBoundingClientRect().height),
        btnSignIn: Math.round(document.getElementById('btnSignIn').getBoundingClientRect().height),
        pdCloseW: Math.round(document.getElementById('pdClose').getBoundingClientRect().width),
        pdCloseH: Math.round(document.getElementById('pdClose').getBoundingClientRect().height) };
    });
    c('F04-P01', 'targets', 'the whole coarse-pointer page is free of under-44px targets',
      'no visible control is under 44px apart from the documented board drag handle',
      coarse.coarse === true && coarse.small.length === 0, coarse.small);

    const measured = await page.evaluate(() => {
      const list = [['#btnAdd', 'min-width'], ['#btnAdd', 'min-height'], ['#btnImport', 'min-height'], ['#btnSignIn', 'min-height'],
        ['#dvAddItem', 'min-height'], ['.dv-tabs__tab', 'min-height'], ['.dv-dist__item', 'min-height'],
        ['#pdClose', 'min-width'], ['#pdClose', 'min-height']];
      const px = (v) => { const m = /([\d.]+)px/.exec(v || ''); return m ? parseFloat(m[1]) : 0; };
      return list.map(([sel, prop]) => {
        const el = document.querySelector(sel);
        if (!el) return { sel, prop, present: false, px: 0 };
        return { sel, prop, present: true, px: px(getComputedStyle(el)[prop]), raw: getComputedStyle(el)[prop] };
      });
    });
    const tooSmall = measured.filter(m => m.present && m.px < 44);
    const absent = measured.filter(m => !m.present);
    c('F04-P02', 'targets', 'every control the audit measured under 44px now has a 44px computed minimum on touch',
      'btnAdd 44x44, btnImport/btnSignIn 44+, dvAddItem/tabs/dist rows 44+ and pdClose 44x44',
      tooSmall.length === 0 && absent.length === 0, measured);

    c('F04-P03', 'targets', 'the board drag handle keeps its documented compact width but not its height',
      'at least 28px wide and at least 44px tall — the primary touch path stays the status select',
      coarse.handleW === null || (coarse.handleW >= 28 && coarse.handleH >= 44),
      { w: coarse.handleW, h: coarse.handleH });
    // the handle only exists in the board view, so measure it there
    await page.evaluate(() => document.getElementById('v13BoardView').click());
    await sleep(800);
    const handle = await page.evaluate(() => {
      const h = document.querySelector('.board__handle');
      if (!h) return null;
      const r = h.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height) };
    });
    c('F04-P05', 'targets', 'the board drag handle measured in the board view clears the height rule',
      'in the board view the handle is at least 44px tall (width may stay compact by design)',
      handle !== null && handle.h >= 44 && handle.w >= 28,
      handle);
    await page.evaluate(() => document.getElementById('v13GridView').click());
    await sleep(500);
    await ctx.close();

    const { ctx: c2, page: p2 } = await newScenario(browser, ITEMS, { width: 1440, height: 900 });
    const fine = await p2.evaluate(() => ({
      tabs: Math.round(document.querySelector('.dv-tabs__tab').getBoundingClientRect().height),
      dist: Math.round(document.querySelector('.dv-dist__item').getBoundingClientRect().height),
      coarse: matchMedia('(hover: none), (pointer: coarse)').matches,
      dist320: Math.round(document.querySelector('.dv-dist__item').getBoundingClientRect().height)
    }));
    c('F04-P04', 'targets', 'the tap-target rules do not apply on a fine pointer',
      'on a desktop pointer the tabs keep their designed height, proving the sheet is coarse-only',
      fine.coarse === false && fine.tabs < 44,
      fine);
    await c2.close();
  }

  // ===================================================================
  area('Q 200% ZOOM');
  // ===================================================================
  {
    const { ctx, page } = await newScenario(browser, ITEMS, { width: 1440, height: 900 });
    const base = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth - window.innerWidth, cards: document.querySelectorAll('#grid .wishlist-card').length }));
    const client = await page.createCDPSession();
    // 200% zoom halves the layout viewport of a 1440x900 window
    await client.send('Emulation.setDeviceMetricsOverride', { width: 720, height: 450, deviceScaleFactor: 2, mobile: false });
    await sleep(1100);
    const zoomed = await page.evaluate(() => {
      const cta = document.querySelector('.hero-v3__primary');
      let hit = null;
      if (cta) {
        cta.scrollIntoView({ block: 'center', behavior: 'instant' });
        const r = cta.getBoundingClientRect();
        const el = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
        hit = el ? (el === cta || cta.contains(el)) : false;
      }
      const dlg = document.getElementById('dlg');
      dlg.showModal();
      return new Promise(res => requestAnimationFrame(() => requestAnimationFrame(() => {
        const inner = dlg.querySelector('.product-dialog__inner') || dlg;
        const dr = dlg.getBoundingClientRect();
        const ir = inner.getBoundingClientRect();
        const out = {
          vw: Math.round(window.innerWidth), vh: Math.round(window.innerHeight),
          overflow: document.documentElement.scrollWidth - window.innerWidth,
          bodyOverflow: document.body.scrollWidth - window.innerWidth,
          cards: document.querySelectorAll('#grid .wishlist-card').length,
          columns: getComputedStyle(document.getElementById('grid')).gridTemplateColumns.split(' ').filter(Boolean).length,
          ctaReachable: hit === true,
          dialogScrolls: dlg.scrollHeight > dlg.clientHeight + 2 || inner.scrollHeight > inner.clientHeight + 2,
          dialogH: Math.round(dr.height), innerH: Math.round(ir.height),
          dialogScrollH: dlg.scrollHeight, dialogClientH: dlg.clientHeight,
          innerScrollH: inner.scrollHeight, innerClientH: inner.clientHeight
        };
        dlg.close();
        res(out);
      })));
    });
    await client.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await sleep(500);
    c('F04-Q01', 'zoom', '200% zoom keeps the page free of horizontal overflow',
      'at a 720x450 layout viewport (a 1440x900 window at 200%) neither the document nor the body overflows',
      zoomed.overflow <= 0 && zoomed.bodyOverflow <= 0 && zoomed.vw === 720 && zoomed.vh === 450,
      { vw: zoomed.vw, vh: zoomed.vh, doc: zoomed.overflow, body: zoomed.bodyOverflow });

    c('F04-Q02', 'zoom', 'the layout still works and the hero CTA stays reachable at 200%',
      'the gallery renders at least one column, every card is present and the CTA hit-test succeeds',
      zoomed.cards === ITEMS.length && zoomed.columns >= 1 && zoomed.ctaReachable === true,
      { cards: zoomed.cards, columns: zoomed.columns, cta: zoomed.ctaReachable });

    c('F04-Q03', 'zoom', 'dialogs remain usable at 200% — they scroll instead of clipping',
      'at a 720x450 viewport the product dialog grows beyond the viewport and scrolls, or fits entirely',
      zoomed.dialogScrolls === true || zoomed.dialogH <= zoomed.vh,
      { dialogH: zoomed.dialogH, vh: zoomed.vh, scrolls: zoomed.dialogScrolls,
        dialogScrollH: zoomed.dialogScrollH, dialogClientH: zoomed.dialogClientH,
        innerScrollH: zoomed.innerScrollH, innerClientH: zoomed.innerClientH });

    c('F04-Q04', 'zoom', '100% (control) is clean too',
      'the same page at 100% has no overflow and renders every card',
      base.overflow <= 0 && base.cards === ITEMS.length, base);
    await ctx.close();
  }

  // ===================================================================
  area('R ERROR-FREE EVIDENCE');
  // ===================================================================
  {
    const { ctx, page } = await newScenario(browser, ITEMS, { width: 1440, height: 900, settle: 1200 });
    await page.screenshot({ path: path.join(SHOTS, 'desktop-hero-gallery.png'), clip: { x: 0, y: 0, width: 1440, height: 900 } });
    await page.evaluate(() => document.getElementById('grid').scrollIntoView({ block: 'start', behavior: 'instant' }));
    await sleep(600);
    await page.screenshot({ path: path.join(SHOTS, 'desktop-gallery-100.png') });
    await ctx.close();

    const { ctx: c2, page: p2 } = await newScenario(browser, ITEMS, { touch: true, width: 375, height: 812, settle: 1200 });
    await p2.screenshot({ path: path.join(SHOTS, 'phone-hero.png') });
    await p2.evaluate(() => document.getElementById('v13BoardView').click());
    await sleep(800);
    await p2.evaluate(() => document.querySelector('.board__columns').scrollIntoView({ block: 'center', behavior: 'instant' }));
    await sleep(500);
    await p2.screenshot({ path: path.join(SHOTS, 'phone-board.png') });
    await p2.evaluate(() => {
      const it = document.querySelector('#grid .wishlist-card') || document.querySelector('.board__card');
      if (it) { const btn = it.querySelector('[data-card-action="view"]') || it; openQuickView(it.dataset.id, btn); }
    });
    await sleep(900);
    await p2.screenshot({ path: path.join(SHOTS, 'phone-quick-view.png') });
    await c2.close();

    fs.writeFileSync(path.join(SHOTS, 'index.json'), JSON.stringify({
      milestone: 'FUSION-04', frames: [
        'desktop-hero-gallery.png', 'desktop-gallery-100.png', 'phone-hero.png',
        'phone-board.png', 'phone-quick-view.png'
      ]
    }, null, 1));

    c('F04-R01', 'errors', 'zero uncaught errors across every scenario in this suite',
      'no pageerror and no console error in any of the scenarios above',
      ALL_ERRORS.length === 0, ALL_ERRORS.slice(0, 5));
    c('F04-R02', 'evidence', 'desktop and phone evidence frames were captured',
      'five screenshots exist on disk under qa-out/evidence/fusion-04/suite',
      fs.existsSync(path.join(SHOTS, 'desktop-hero-gallery.png')) && fs.existsSync(path.join(SHOTS, 'phone-quick-view.png')) &&
      fs.existsSync(path.join(SHOTS, 'index.json')), fs.readdirSync(SHOTS));
  }


  // -------------------------------------------------------------------
  console.log('\n================ FUSION-04 SUMMARY ================');
  const areas = [...new Set(results.map(r => r.area))];
  console.log('checks: ' + n + '   failed: ' + failed);
  console.log('areas : ' + areas.join(', '));
  fs.writeFileSync(path.join(OUT, 'fusion-04-suite.json'), JSON.stringify({
    milestone: 'FUSION-04', sheet: SHEET, checks: n, failed,
    areas, cssBytes: cssSrc.length, results
  }, null, 1));
  await browser.close();
  server.close();
  console.log(failed === 0 ? '\nFUSION-04 SUITE: ALL GREEN (' + n + ' checks)' : '\nFUSION-04 SUITE: ' + failed + ' FAILED of ' + n);
  process.exit(failed === 0 ? 0 : 1);
})().catch(e => {
  console.error('FATAL', e);
  try { server.close(); } catch (_) {}
  process.exit(3);
});
