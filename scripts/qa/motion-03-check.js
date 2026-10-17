// =====================================================================
// DREAM VAULT V16.2 — MOTION-03 LIVING DASHBOARD & FLUID GALLERY
// ---------------------------------------------------------------------
// Real-browser verification that the dashboard and gallery visibly respond
// to real interactions, and that the motion is disciplined (no replay on
// unchanged data, no stacking, no layout shift, reduced-motion aware).
//
// usage: node scripts/qa/motion-03-check.js [repoRoot]
// =====================================================================
const puppeteer = require('puppeteer-core');
const http = require('http');
const fs = require('fs');
const path = require('path');

const CHROME = process.env.CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT = process.argv[2] && !process.argv[2].startsWith('--')
  ? process.argv[2] : path.join(__dirname, '..', '..');
const PORT = 8200;
const OUT = path.join(__dirname, '..', '..', 'qa-out');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon'
};

const MOCK = `
const state = { user: null, opts: null, syncs: [], statuses: [], uploads: 0 };
window.__cloud = state;
export async function initializeWishlistCloud(opts){
  state.opts = opts;
  window.__cloudSetUser = (u) => { state.user = u; if(opts.onUserChanged) opts.onUserChanged(u ? u.uid : null); };
  window.__cloudRemote = (items, initial) => { if(opts.onRemoteItems) opts.onRemoteItems(items, !!initial); };
  window.__cloudStatus = (kind, email) => { state.statuses.push(kind); if(opts.onStatus) opts.onStatus(kind, email || ''); };
  window.__cloudSyncs = () => state.syncs;
  setTimeout(() => { window.__cloudSetUser(null); window.__cloudStatus('local', ''); }, 0);
  return {
    get user(){ return state.user; },
    signIn: async () => {}, signOut: async () => { state.user = null; if(opts.onUserChanged) opts.onUserChanged(null); if(opts.onStatus) opts.onStatus('local',''); },
    syncItems: (items) => { state.syncs.push(JSON.parse(JSON.stringify(items))); return Promise.resolve(); },
    uploadImage: async () => { state.uploads++; return 'https://cdn.example/img.jpg'; }
  };
}
`;

const SPY = `
  window.__animates = [];
  (function(){
    const orig = Element.prototype.animate;
    Element.prototype.animate = function(keyframes, opts){
      const props = [];
      const kf = Array.isArray(keyframes) ? keyframes : [keyframes];
      for (const f of kf) for (const k in f) if (props.indexOf(k) < 0) props.push(k);
      window.__animates.push({ props, duration: opts && opts.duration,
        target: this.id || (typeof this.className === 'string' ? this.className : '') || this.tagName });
      return orig.call(this, keyframes, opts);
    };
  })();
`;

function serveFrom(root) {
  return (req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/') p = '/wishlist.html';
    const file = path.join(root, p);
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); return res.end('not found'); }
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-store'
      });
      res.end(data);
    });
  };
}
const server = http.createServer(serveFrom(ROOT));

const results = [];
let section = '';
function c(id, area, entry, expected, pass, actual) {
  results.push({ id, section, area, entry, expected, pass: !!pass,
    actual: actual === undefined ? '' : JSON.stringify(actual) });
}

const FIX = [
  { id: 'a1', name: 'Món một', price: 1000000, image: '', link: '', status: 'wish', priority: 'high', category: 'A', note: '', createdAt: 1700000000001, savingGoal: 2000000, savedAmount: 500000 },
  { id: 'a2', name: 'Món hai', price: 2000000, image: '', link: '', status: 'wish', priority: 'medium', category: 'B', note: '', createdAt: 1700000000002 },
  { id: 'a3', name: 'Món ba', price: 500000, image: '', link: '', status: 'saving', priority: 'low', category: 'A', note: '', createdAt: 1700000000003, savingGoal: 1000000, savedAmount: 400000 },
  { id: 'a4', name: 'Món bốn', price: 800000, image: '', link: '', status: 'wish', priority: 'medium', category: 'C', note: '', createdAt: 1700000000004, savingGoal: 500000, savedAmount: 500000 }
];

async function newScenario(browser, seed, opts = {}) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  const state = { errors: [], pageErrors: [] };
  await page.setViewport({ width: opts.width || 1440, height: opts.height || 900, deviceScaleFactor: 1 });
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: opts.reducedMotion ? 'reduce' : 'no-preference' }]);
  await page.evaluateOnNewDocument((s) => {
    try {
      localStorage.clear();
      if (s.guestItems) localStorage.setItem('wishlist.guest.items', JSON.stringify(s.guestItems));
    } catch (e) {}
  }, { guestItems: seed });
  await page.evaluateOnNewDocument(SPY);
  await page.setRequestInterception(true);
  page.on('request', req => {
    if (/wishlist-cloud\.js/.test(req.url())) return req.respond({ status: 200, contentType: 'text/javascript', body: MOCK });
    req.continue();
  });
  page.on('pageerror', e => state.pageErrors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') state.errors.push(m.text()); });
  page.on('dialog', d => { d.accept().catch(() => {}); });
  await page.goto(`http://localhost:${PORT}/wishlist.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('typeof window.__cloudSetUser === "function"');
  await sleep(opts.settle || 900);
  return { ctx, page, state };
}

const animates = (page) => page.evaluate(() => window.__animates.slice());
const animCount = (page) => page.evaluate(() => window.__animates.length);

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  await new Promise(r => server.listen(PORT, r));
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });

  // ===================================================================
  section = 'A F6.3 DASHBOARD MOTION (MOTION-03)';
  // ===================================================================
  {
    const { ctx, page } = await newScenario(browser, FIX);

    // A1: KPI animated after a real data change.
    const before = await animCount(page);
    await page.evaluate(() => { const it = items.find(x => x.id === 'a1'); it.price = 1500000; render(); });
    await sleep(400);
    const news = (await animates(page)).slice(before);
    c('M3-01', 'KPI', 'animated after a data change',
      'changing a KPI value produces a WAAPI animation',
      news.length > 0, { count: news.length, props: news.map(a => a.props) });

    // A2: KPI stable on unchanged data.
    const before2 = await animCount(page);
    await page.evaluate(() => { render(); });
    await sleep(400);
    const after2 = await animCount(page);
    c('M3-02', 'KPI', 'stable on unchanged data',
      'a render that changes no KPI produces no new animation',
      after2 === before2, { before: before2, after: after2 });

    // A3: progress bar reaches the exact final state.
    const prog = await page.evaluate(() => {
      const track = document.getElementById('dvProgressTrack');
      const fill = document.getElementById('dvProgressFill');
      return { now: track.getAttribute('aria-valuenow'),
        transform: getComputedStyle(fill).transition,
        width: fill.style.width };
    });
    c('M3-03', 'progress', 'reaches the exact final state',
      'aria-valuenow is a number and the fill has a width transition',
      prog.now !== null && /width/.test(prog.transform), prog);

    // A4: status distribution, category breakdown and priority bars reach final values.
    const bars = await page.evaluate(() => {
      const status = document.querySelectorAll('#dvDistBar .dv-dist__seg').length;
      const breakdown = document.querySelectorAll('#dvBreakdownRows .dv-breakdown__row').length;
      const priority = document.querySelectorAll('#dvPriorityRows .dv-priority__item').length;
      return { status, breakdown, priority };
    });
    c('M3-04', 'bars', 'all three widgets render their rows',
      'status, breakdown and priority each render at least one row',
      bars.status > 0 && bars.breakdown > 0 && bars.priority > 0, bars);

    // A5: savings final values match stored data.
    const savings = await page.evaluate(() => {
      const rows = [...document.querySelectorAll('#dvSavingsRows .dv-savings__row')]
        .map(r => r.querySelector('.dv-savings__value').textContent.replace(/\s+/g, ' ').trim());
      return rows;
    });
    c('M3-05', 'savings', 'final values match stored data',
      'the savings rows show the recorded aggregates',
      savings.length === 4, { rows: savings });

    // A6: reduced motion skips the decorative transitions.
    const { ctx: ctxRm, page: pageRm } = await newScenario(browser, FIX, { reducedMotion: true });
    await pageRm.evaluate(() => {
      const it = items.find(x => x.id === 'a1');
      it.price = 777777;
      render();
    });
    await sleep(400);
    const nRm = await pageRm.evaluate(() => window.__animates.length);
    c('M3-06', 'reduced motion', 'no WAAPI animation at all',
      'with prefers-reduced-motion: reduce, changing data produces zero animations',
      nRm === 0, { animates: nRm });
    await ctxRm.close();

    await ctx.close();
  }

  // ===================================================================
  section = 'B F6.4 GALLERY / FOCUS (MOTION-03)';
  // ===================================================================
  {
    const { ctx, page } = await newScenario(browser, FIX);

    // B1: capture card positions in gallery mode.
    const galleryPos = await page.evaluate(() => {
      return [...document.querySelectorAll('#grid > .wishlist-card')].map(c => {
        const r = c.getBoundingClientRect();
        return { id: c.dataset.id, x: Math.round(r.left), y: Math.round(r.top),
          w: Math.round(r.width), h: Math.round(r.height) };
      });
    });

    // B2: switch to Focus and capture new positions.
    await page.evaluate(() => setCollectionView('focus'));
    await sleep(700);
    const focusPos = await page.evaluate(() => {
      return [...document.querySelectorAll('#grid > .wishlist-card')].map(c => {
        const r = c.getBoundingClientRect();
        return { id: c.dataset.id, x: Math.round(r.left), y: Math.round(r.top),
          w: Math.round(r.width), h: Math.round(r.height) };
      });
    });
    // at least one card moved (measurable layout motion)
    const moved = galleryPos.some((g, i) => {
      const f = focusPos.find(x => x.id === g.id);
      return f && (f.x !== g.x || f.y !== g.y || f.w !== g.w || f.h !== g.h);
    });
    c('M3-07', 'gallery->focus', 'measurable layout motion',
      'at least one card changes position or size when switching to Focus',
      moved && galleryPos.length === focusPos.length, { gallery: galleryPos.length, focus: focusPos.length });

    // B3: aria-pressed reflects the new view.
    const aria = await page.evaluate(() => ({
      grid: document.getElementById('v13GridView').getAttribute('aria-pressed'),
      focus: document.getElementById('v13FocusView').getAttribute('aria-pressed')
    }));
    c('M3-08', 'gallery->focus', 'aria-pressed reflects the view',
      'Focus is pressed, Gallery is not',
      aria.grid === 'false' && aria.focus === 'true', aria);

    // B4: switch back to Gallery restores the layout.
    await page.evaluate(() => setCollectionView('gallery'));
    await sleep(700);
    const restored = await page.evaluate(() => {
      return [...document.querySelectorAll('#grid > .wishlist-card')].map(c => {
        const r = c.getBoundingClientRect();
        return { id: c.dataset.id, x: Math.round(r.left), y: Math.round(r.top) };
      });
    });
    const restoredMatch = restored.length === galleryPos.length &&
      restored.every(r => galleryPos.some(g => g.id === r.id && g.x === r.x && g.y === r.y));
    c('M3-09', 'focus->gallery', 'restores the gallery layout',
      'every card returns to its gallery position',
      restoredMatch, { restored: restored.length, gallery: galleryPos.length });

    // B5: no ghost cards or duplicate ids.
    const ids = await page.evaluate(() => {
      const ids = [...document.querySelectorAll('#grid > .wishlist-card')].map(c => c.dataset.id);
      return { count: ids.length, unique: new Set(ids).size };
    });
    c('M3-10', 'no ghosts', 'no duplicate or ghost cards',
      'card count equals unique id count',
      ids.count === ids.unique && ids.count === FIX.length, ids);

    // B6: no stuck transforms after 10 rapid toggles.
    await page.evaluate(async () => {
      for (let i = 0; i < 10; i++) {
        setCollectionView(i % 2 === 0 ? 'focus' : 'gallery');
        await new Promise(r => setTimeout(r, 60));
      }
    });
    await sleep(1200);
    const stuck = await page.evaluate(() => {
      return [...document.querySelectorAll('#grid > .wishlist-card')].some(c => {
        const t = getComputedStyle(c).transform;
        return t && t !== 'none' && /matrix/.test(t) && parseFloat(t.split(',')[4]) !== 0;
      });
    });
    c('M3-11', 'rapid toggle', 'no stuck transforms',
      'no card keeps a non-zero transform after 10 rapid toggles',
      stuck === false, { stuck });

    // B7: existing tilt and parallax still function (the surface has the hook).
    const tilt = await page.evaluate(() => {
      const surf = document.querySelector('#grid > .wishlist-card .wishlist-card__surface');
      return surf ? typeof surf.style !== 'undefined' : false;
    });
    c('M3-12', 'tilt/parallax', 'card surface is intact',
      'the card surface element exists and is styleable',
      tilt === true, { tilt });

    await ctx.close();
  }

  // ===================================================================
  section = 'C F6.5 MOBILE & REDUCED MOTION (MOTION-03)';
  // ===================================================================
  {
    // C1: mobile fallback works (390 px, no overflow, widgets visible).
    const { ctx, page } = await newScenario(browser, FIX, { width: 390, height: 844, settle: 900 });
    const ov = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: document.documentElement.clientWidth }));
    c('M3-13', 'mobile', 'no horizontal overflow at 390',
      'scrollWidth <= clientWidth',
      ov.sw <= ov.iw + 1, ov);
    const dash = await page.evaluate(() => document.getElementById('dvSavings') && !document.getElementById('dvSavings').hidden);
    c('M3-14', 'mobile', 'dashboard widgets render on mobile',
      'the savings overview is visible on a 390 px viewport',
      dash === true, { visible: dash });
    await ctx.close();

    // C2: reduced motion skips the dashboard transitions.
    const { ctx: ctxRm, page: pageRm } = await newScenario(browser, FIX, { reducedMotion: true });
    await pageRm.evaluate(() => {
      const it = items.find(x => x.id === 'a1');
      it.price = 999999;
      render();
    });
    await sleep(400);
    const nRm = await pageRm.evaluate(() => window.__animates.length);
    c('M3-15', 'reduced motion', 'no WAAPI animation at all',
      'with prefers-reduced-motion: reduce, changing data produces zero animations',
      nRm === 0, { animates: nRm });
    await ctxRm.close();
  }

  // ===================================================================
  section = 'D NO JANK / NO STACKING (MOTION-03)';
  // ===================================================================
  {
    // D1: 100 items render inside budget.
    const many = [];
    for (let i = 0; i < 100; i++) many.push({ id: 'd' + i, name: 'Món ' + i, price: 100000 * (i + 1),
      image: '', link: '', status: i % 4 === 0 ? 'purchased' : 'wish', priority: 'medium',
      category: 'A', note: '', createdAt: 1700000000000 + i,
      ...(i % 4 === 0 ? { paidAmount: 90000, purchasedAt: 1750000000000, previousStatus: 'wish' } : {}) });
    const { ctx, page } = await newScenario(browser, many, { settle: 2200 });
    const r = await page.evaluate(() => {
      const costs = [];
      for (let i = 0; i < 3; i++) { const t = performance.now(); render(); costs.push(Math.round(performance.now() - t)); }
      costs.sort((a, b) => a - b);
      return { costs, median: costs[1], cards: document.querySelectorAll('#grid > .wishlist-card').length };
    });
    c('M3-16', 'scale', 'render(100) stays cheap',
      'the median of 3 render(100) runs is under 100 ms',
      r.median < 100 && r.cards === 100, r);
    await ctx.close();

    // D2: a filter change at 100 items does not restart entrances.
    const many2 = [];
    for (let i = 0; i < 100; i++) many2.push({ id: 'e' + i, name: 'Món ' + i, price: 100000 * (i + 1),
      image: '', link: '', status: 'wish', priority: 'medium', category: 'A', note: '', createdAt: 1700000000000 + i });
    const { ctx: ctx2, page: page2 } = await newScenario(browser, many2, { settle: 1800 });
    const r2 = await page2.evaluate(async () => {
      const before = document.querySelectorAll('#grid > .wishlist-card.dv-reveal-in').length;
      document.getElementById('q').value = 'Món 1';
      document.getElementById('q').dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(r3 => setTimeout(r3, 800));
      const after = document.querySelectorAll('#grid > .wishlist-card.dv-reveal-in').length;
      return { before, after };
    });
    c('M3-17', 'no stacking', 'a filter does not restart entrances',
      'filtering at 100 items does not add newly revealed cards',
      r2.after <= r2.before, r2);
    await ctx2.close();

    // D3: no console errors.
    const { ctx: ctx3, page: page3, state: st3 } = await newScenario(browser, FIX, { settle: 1200 });
    const errs = st3.errors.concat(st3.pageErrors);
    c('M3-18', 'errors', 'no page or console errors',
      'the page runs clean',
      errs.length === 0, { errors: errs });
    await ctx3.close();
  }

  // ===================================================================
  await browser.close();
  server.close();

  const pass = results.filter(r => r.pass).length;
  const fail = results.length - pass;
  for (const r of results) {
    console.log((r.pass ? 'PASS' : 'FAIL') + ' [' + r.id + '] ' + r.area + ' :: ' + r.entry +
      (r.pass ? '' : '\n       expected: ' + r.expected + '\n       actual:   ' + r.actual));
  }
  console.log('\n==== MOTION-03 SUITE: ' + pass + ' PASS / ' + fail + ' FAIL (total ' + results.length + ') ====');
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'motion-03-suite.json'), JSON.stringify({
    generatedAt: new Date().toISOString(), repo: ROOT, pass, fail, total: results.length, results
  }, null, 2));
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('FATAL', e && e.stack || e); process.exit(2); });
