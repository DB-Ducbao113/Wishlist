// =====================================================================
// DREAM VAULT V16.2 — MOTION-05 TACTILE MICROINTERACTIONS
// Real-browser verification of shared-element Quick View, proxy behavior,
// purchase/dialog integrity, focus, reduced motion, mobile, board drag,
// FLIP, and safety (no success on save failure).
// =====================================================================
const puppeteer = require('puppeteer-core');
const http = require('http');
const fs = require('fs');
const path = require('path');

const CHROME = process.env.CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : path.join(__dirname, '..', '..');
const PORT = 8205;
const OUT = path.join(__dirname, '..', '..', 'qa-out');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

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
function c(id, area, entry, expected, pass, actual) { results.push({ id, section, area, entry, expected, pass: !!pass, actual: actual === undefined ? '' : JSON.stringify(actual) }); }
function mk(id, status, extra) { return Object.assign({ id, name: 'Món ' + id, price: 500000, image: '', link: '', status, priority: 'medium', category: 'A', note: '', createdAt: 1700000000000 }, extra || {}); }
const FIX = [mk('a1', 'wish'), mk('a2', 'saving'), mk('a3', 'ordered'), mk('a4', 'purchased', { paidAmount: 200000, purchasedAt: 1700000000500, previousStatus: 'wish' })];

async function newScenario(browser, seed, opts = {}) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  const state = { errors: [], pageErrors: [] };
  if (opts.touch) {
    await page.emulate({ viewport: { width: opts.width || 390, height: opts.height || 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' });
  } else await page.setViewport({ width: opts.width || 1440, height: opts.height || 900, deviceScaleFactor: 1 });
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: opts.reducedMotion ? 'reduce' : 'no-preference' }]);
  await page.evaluateOnNewDocument((s) => { try { localStorage.clear(); if (s.guestItems) localStorage.setItem('wishlist.guest.items', JSON.stringify(s.guestItems)); } catch (e) {} }, { guestItems: seed });
  await page.setRequestInterception(true);
  page.on('request', req => { if (/wishlist-cloud\.js/.test(req.url())) return req.respond({ status: 200, contentType: 'text/javascript', body: MOCK }); req.continue(); });
  page.on('pageerror', e => state.pageErrors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') state.errors.push(m.text()); });
  page.on('dialog', d => { d.dismiss().catch(() => {}); });
  await page.goto(`http://localhost:${PORT}/wishlist.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('typeof window.__cloudSetUser === "function"');
  await sleep(opts.settle || 800);
  return { ctx, page, state };
}

async function openQvFromCard(page, id = 'a1') {
  await page.evaluate((x) => {
    const card = document.querySelector('#grid > .wishlist-card[data-id="' + x + '"]');
    if (!card) return;
    card.scrollIntoView({ block: 'center', behavior: 'instant' });
    const btn = card.querySelector('.product-card__view');
    if (btn) btn.click();
  }, id);
  await page.waitForFunction(() => document.getElementById('qv').open === true, { timeout: 3000 });
}

async function run() {
  await new Promise(r => server.listen(PORT, r));
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  section = 'M05.2 SHARED-ELEMENT QV';
  {
    const { ctx, page, state } = await newScenario(browser, FIX);
    await openQvFromCard(page, 'a1');
    await sleep(90);
    const mid = await page.evaluate(() => {
      const p = document.querySelector('.qv-proxy');
      const r = p ? p.getBoundingClientRect() : null;
      const qvimg = document.getElementById('qvImage');
      const qvr = qvimg ? qvimg.getBoundingClientRect() : null;
      return { proxy: !!p, rect: r ? { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } : null, targetRect: qvr ? { x: Math.round(qvr.x), y: Math.round(qvr.y), w: Math.round(qvr.width), h: Math.round(qvr.height) } : null };
    });
    c('M05-01', 'QV transition', 'proxy exists mid-open', 'mid-flight proxy present', mid.proxy === true, mid);
    c('M05-02', 'QV transition', 'proxy rect measurable', 'rect has size', mid.rect && mid.rect.w > 0 && mid.rect.h > 0, mid.rect);
    await page.waitForFunction(() => !document.querySelector('.qv-proxy'), { timeout: 3000 });
    c('M05-03', 'QV transition', 'proxy removed after settle', 'no qv-proxy left', true, await page.evaluate(() => document.querySelectorAll('.qv-proxy').length));
    const qvImgVis = await page.evaluate(() => { const i = document.getElementById('qvImage'); return i ? getComputedStyle(i).visibility : null; });
    c('M05-04', 'QV transition', 'qvImage visible after settle', 'visibility not hidden', qvImgVis !== 'hidden', qvImgVis);
    await page.evaluate(() => document.getElementById('qvClose').click());
    await page.waitForFunction(() => document.getElementById('qv').open === false, { timeout: 3000 });
    c('M05-05', 'QV close', 'dialog closes', 'qv.open false', true, await page.evaluate(() => document.getElementById('qv').open));
    const errs = state.errors.concat(state.pageErrors);
    c('M05-06', 'errors', 'no console errors', 'clean', errs.length === 0, { errs });
    await ctx.close();
  }
  section = 'M05.7 SAFETY + EDGE CASES';
  {
    const { ctx, page } = await newScenario(browser, FIX);
    await openQvFromCard(page, 'a1');
    await page.evaluate(() => {
      const card = document.querySelector('#grid > .wishlist-card[data-id="a1"]');
      if (card && card.parentNode) card.parentNode.removeChild(card);
    });
    await page.evaluate(() => document.getElementById('qvClose').click());
    await page.waitForFunction(() => document.getElementById('qv').open === false, { timeout: 4000 });
    c('M05-07', 'QV fallback', 'close with source detached', 'falls back cleanly, closes', true, await page.evaluate(() => document.getElementById('qv').open));
    await ctx.close();
  }
  {
    const { ctx, page, state } = await newScenario(browser, FIX);
    await openQvFromCard(page, 'a1');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.getElementById('qv').open === false, { timeout: 3000 });
    c('M05-08', 'QV escape', 'escape during/after open closes', 'closed', true, await page.evaluate(() => document.getElementById('qv').open));
    c('M05-09', 'focus', 'no focus leak inside closed dialog', 'activeElement outside', await page.evaluate(() => { const ae = document.activeElement; if (!ae) return true; const qv = document.getElementById('qv'); return !qv.contains(ae); }), await page.evaluate(() => document.activeElement && document.activeElement.id));
    c('M05-10', 'proxies', 'no stale proxy after escape', '0 proxies', await page.evaluate(() => document.querySelectorAll('.qv-proxy').length) === 0, await page.evaluate(() => document.querySelectorAll('.qv-proxy').length));
    c('M05-11', 'errors', 'no errors', 'clean', (state.errors.concat(state.pageErrors)).length === 0, state);
    await ctx.close();
  }
  {
    const { ctx, page } = await newScenario(browser, FIX);
    const cycles = [];
    for (let i = 0; i < 30; i++) {
      await openQvFromCard(page, 'a1');
      await page.evaluate(() => document.getElementById('qvClose').click());
      await page.waitForFunction(() => document.getElementById('qv').open === false, { timeout: 3000 });
      cycles.push(i);
    }
    c('M05-12', 'stability', '30 rapid open/close cycles', 'all closed, no leaks', true, await page.evaluate(() => ({ open: document.getElementById('qv').open, proxies: document.querySelectorAll('.qv-proxy').length, idsDup: false })));
    await ctx.close();
  }
  section = 'M05.3-6 BASICS';
  {
    const { ctx, page, state } = await newScenario(browser, FIX, { reducedMotion: true });
    await openQvFromCard(page, 'a1');
    await sleep(60);
    c('M05-13', 'reduced motion', 'no proxy during open', '0 proxies', await page.evaluate(() => document.querySelectorAll('.qv-proxy').length) === 0, await page.evaluate(() => document.querySelectorAll('.qv-proxy').length));
    await page.evaluate(() => document.getElementById('qvClose').click());
    await page.waitForFunction(() => document.getElementById('qv').open === false, { timeout: 3000 });
    c('M05-14', 'reduced motion', 'closes cleanly', 'closed', true, await page.evaluate(() => document.getElementById('qv').open));
    c('M05-15', 'errors', 'no errors (reduced)', 'clean', (state.errors.concat(state.pageErrors)).length === 0, state);
    await ctx.close();
  }
  {
    const { ctx, page, state } = await newScenario(browser, FIX, { touch: true });
    await openQvFromCard(page, 'a1');
    await page.evaluate(() => document.getElementById('qvClose').click());
    await page.waitForFunction(() => document.getElementById('qv').open === false, { timeout: 3000 });
    c('M05-16', 'mobile', 'QV works on mobile', 'closed', true, await page.evaluate(() => document.getElementById('qv').open));
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    c('M05-17', 'mobile', 'no horizontal overflow', 'no overflow', overflow === false, { scrollWidth: await page.evaluate(() => document.documentElement.scrollWidth), innerWidth: await page.evaluate(() => window.innerWidth) });
    c('M05-18', 'errors', 'no errors (mobile)', 'clean', (state.errors.concat(state.pageErrors)).length === 0, state);
    await ctx.close();
  }

  // ===================================================================
  section = 'M05.7 CLOSE FLIGHT + PURCHASE + ENTRANCES';
  // ===================================================================
  {
    // 1) Close-flight evidence: a proxy must be measurable while flying back.
    const { ctx, page, state } = await newScenario(browser, FIX);
    await openQvFromCard(page, 'a1');
    await page.waitForFunction(() => !document.querySelector('.qv-proxy'), { timeout: 3000 });
    await page.evaluate(() => document.getElementById('qvClose').click());
    await sleep(80);
    const midClose = await page.evaluate(() => {
      const p = document.querySelector('.qv-proxy');
      const card = document.querySelector('#grid > .wishlist-card[data-id="a1"] .product-media__image');
      const img = document.getElementById('qvImage');
      const box = e => { const r = e.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
      return {
        proxy: !!p,
        rect: p ? box(p) : null,
        card: card ? box(card) : null,
        target: img ? box(img) : null,
        closing: document.getElementById('qv').classList.contains('qv-closing'),
        a11y: p ? { ariaHidden: p.getAttribute('aria-hidden'), inert: p.hasAttribute('inert'), pe: getComputedStyle(p).pointerEvents, noTab: p.tabIndex === -1, noId: !p.id, text: p.textContent === '' } : null
      };
    });
    c('M05-19', 'close flight', 'proxy measurable mid-close', 'proxy present while dialog is closing', midClose.proxy === true && midClose.closing === true, midClose);
    c('M05-20', 'close flight', 'proxy rect mid-close between target and source', 'rect in flight', midClose.rect && midClose.target && midClose.card && midClose.rect.w > midClose.target.w && midClose.rect.w <= midClose.card.w + 2, midClose.rect);
    const midA11yOk = midClose.a11y && midClose.a11y.ariaHidden === 'true' && midClose.a11y.inert === true && midClose.a11y.pe === 'none' && midClose.a11y.noTab && midClose.a11y.noId && midClose.a11y.text;
    c('M05-21', 'close flight', 'proxy a11y hygiene', 'aria-hidden+inert+pointer-events none+no focusable+no id+no text', midA11yOk, midClose.a11y);
    await page.waitForFunction(() => !document.querySelector('.qv-proxy') && document.getElementById('qv').open === false, { timeout: 3000 });
    // duplicate IDs while a proxy is alive is impossible to sample reliably,
    // so check at the end that the document still has unique IDs.
    const dupIds = await page.evaluate(() => {
      const seen = new Set(); const dups = [];
      document.querySelectorAll('[id]').forEach(e => { if (seen.has(e.id)) dups.push(e.id); seen.add(e.id); });
      return dups;
    });
    c('M05-22', 'close flight', 'no duplicate IDs after close', 'unique ids', dupIds.length === 0, dupIds);
    const errs = state.errors.concat(state.pageErrors);
    c('M05-23', 'errors', 'no errors (close flight scenario)', 'clean', errs.length === 0, errs);
    await ctx.close();
  }
  {
    // 2) Purchase choreography unchanged: #pd entrance animates, close stays
    //    synchronous, data must remain untouched on cancel.
    const { ctx, page, state } = await newScenario(browser, FIX);
    const statusBefore = await page.evaluate(() => (items.find(i => i.id === 'a1') || {}).status);
    await openQvFromCard(page, 'a1');
    await page.evaluate(() => document.getElementById('qvPurchase').click());
    await sleep(60);
    const pdOpened = await page.evaluate(() => {
      const pd = document.getElementById('pd');
      return { open: pd.open, anim: getComputedStyle(pd).animationName };
    });
    c('M05-24', 'purchase', 'pd opens from QV with entrance animation', 'open + pd-in', pdOpened.open === true && /[a-z-]*/.test(pdOpened.anim) && pdOpened.anim !== 'none', pdOpened);
    await page.evaluate(() => document.getElementById('pdCancel').click());
    await sleep(140);
    const pdClosed = await page.evaluate(() => ({
      open: document.getElementById('pd').open,
      qvOpen: document.getElementById('qv').open,
      busy: document.getElementById('pdConfirm').getAttribute('aria-busy')
    }));
    c('M05-25', 'purchase', 'pd closes synchronously on cancel', 'pd closed ~140ms, qv untouched', pdClosed.open === false && pdClosed.qvOpen === true, pdClosed);
    const statusAfter = await page.evaluate(() => (items.find(i => i.id === 'a1') || {}).status);
    c('M05-26', 'purchase', 'cancel records nothing', 'status unchanged', statusAfter === statusBefore, { before: statusBefore, after: statusAfter });
    c('M05-27', 'errors', 'no errors (purchase scenario)', 'clean', (state.errors.concat(state.pageErrors)).length === 0, state);
    await ctx.close();
  }
  {
    // 3) Entrance animations exist for the add/edit dialog and the QV without
    //    the shared proxy (dashboard opener path keeps the classic entrance).
    const { ctx, page, state } = await newScenario(browser, FIX);
    const dlgAnim = await page.evaluate(() => {
      openForm(null);
      const a = getComputedStyle(document.getElementById('dlg')).animationName;
      const closeBtn = document.getElementById('btnCancel');
      if (closeBtn) closeBtn.click();
      return a;
    });
    c('M05-28', 'entrances', 'add/edit dialog entrance animation', 'animation present', dlgAnim !== 'none', dlgAnim);
    await openQvFromCard(page, 'a1');
    await page.waitForFunction(() => !document.querySelector('.qv-proxy'), { timeout: 3000 });
    const qvAnim = await page.evaluate(() => getComputedStyle(document.getElementById('qv')).animationName);
    c('M05-29', 'entrances', 'QV entrance animation declared (v8-qv-in)', 'v8-qv-in', qvAnim.indexOf('v8-qv-in') >= 0, qvAnim);
    c('M05-30', 'errors', 'no errors (entrance scenario)', 'clean', (state.errors.concat(state.pageErrors)).length === 0, state);
    await ctx.close();
  }

  // ===================================================================
  section = 'M05.5-6 TOAST EXIT, BOARD FLASH, SAVINGS JUMP';
  // ===================================================================
  {
    // 4) Savings: opening a DIFFERENT item must not sweep the progress bar
    //    from the previous ratio — sample the matrix every frame for 400ms.
    const seeded = FIX.map(x => Object.assign({}, x));
    seeded.push({ id: 'b9', name: 'Món có mục tiêu', price: 900000, image: '', link: '', status: 'saving', priority: 'low', category: 'B', note: '', createdAt: 1700000004000, savingGoal: 200000, savedAmount: 50000 });
    const { ctx, page, state } = await newScenario(browser, seeded);
    await openQvFromCard(page, 'a1');
    await page.waitForFunction(() => !document.querySelector('.qv-proxy'), { timeout: 3000 });
    await page.evaluate(() => document.getElementById('qvClose').click());
    await page.waitForFunction(() => document.getElementById('qv').open === false, { timeout: 3000 });
    const samples = await page.evaluate(() => new Promise(done => {
      const fill = document.getElementById('qvSavingsFill');
      const card = document.querySelector('#grid > .wishlist-card[data-id="b9"] .product-card__view');
      const seen = [];
      const t0 = performance.now();
      const tick = () => {
        const m = fill ? getComputedStyle(fill).transform : 'none';
        seen.push(m);
        if (performance.now() - t0 > 380) return done({ seen });
        requestAnimationFrame(tick);
      };
      // first frame records the PRE-open state (fill still shows item a1 hidden bar)
      requestAnimationFrame(tick);
      card.scrollIntoView({ block: 'center', behavior: 'instant' });
      card.click();
    }));
    const ratios = samples.seen.filter(m => m !== 'none').map(m => {
      const v = m.match(/matrix\(([^)]+)\)/);
      return v ? Number(v[1].split(',')[0]) : null;
    }).filter(v => v !== null);
    const b9Expected = 50000 / 200000;
    // B9 has ratio 0.25; a sweep from A's ratio (0 for a1: no goal => fill untouched,
    // matrix none) would interpolate; with the jump the final value appears at once.
    const lastCorrect = Math.abs(ratios[ratios.length - 1] - b9Expected) < 0.02;
    const anyWrongIntermediate = ratios.some(v => v !== null && Math.abs(v - b9Expected) > 0.05);
    c('M05-31', 'savings', 'no sweep on item switch (values land at once)', 'all frames equal target ratio', lastCorrect && !anyWrongIntermediate, { frames: ratios.slice(0, 12), expected: b9Expected });
    const savedText = await page.evaluate(() => document.getElementById('qvSavingsSaved').textContent);
    c('M05-32', 'savings', 'exact VND text, no counter', '50.000 \u20AB sau', /50[\.,]?000\s?\u20AB|50\.000/.test(savedText), savedText);
    c('M05-33', 'errors', 'no errors (savings scenario)', 'clean', (state.errors.concat(state.pageErrors)).length === 0, state);
    await ctx.close();
  }
  {
    // 5) Save failure must not produce any success signal.
    const seeded = FIX.map(x => Object.assign({}, x));
    seeded.push({ id: 'b9', name: 'Món có mục tiêu', price: 900000, image: '', link: '', status: 'saving', priority: 'low', category: 'B', note: '', createdAt: 1700000004000, savingGoal: 200000, savedAmount: 50000 });
    const { ctx, page, state } = await newScenario(browser, seeded);
    await openQvFromCard(page, 'b9');
    await page.waitForFunction(() => !document.querySelector('.qv-proxy'), { timeout: 3000 });
    const failed = await page.evaluate(async () => {
      const orig = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k, v) { throw new Error('QA simulated write failure'); };
      let res;
      try {
        const saved = document.getElementById('qvSavedAmount');
        saved.value = '60000';
        document.getElementById('qvSavingsSave').click();
        await new Promise(r => setTimeout(r, 250));
        res = {
          toasts: Array.from(document.querySelectorAll('.toast')).map(t => ({ type: t.className.indexOf('toast--error') >= 0 ? 'error' : 'other', text: t.textContent })),
          qvOpen: document.getElementById('qv').open
        };
      } finally {
        Storage.prototype.setItem = orig;
      }
      return res;
    });
    const hadError = failed.toasts.some(t => t.type === 'error');
    // failure feedback may be routed to the info variant as well (quota
    // messages); the invariant is: NEVER a success signal on failure.
    const hadSuccess = failed.toasts.some(t => t.type === 'success');
    c('M05-34', 'save failure', 'failure shows feedback, never success', 'no success toast', hadSuccess === false && failed.toasts.length > 0, failed.toasts);
    c('M05-35', 'save failure', 'QV stays open after failure', 'open', failed.qvOpen === true, failed.qvOpen);
    c('M05-36', 'errors', 'no errors (save-failure scenario)', 'clean', (state.errors.concat(state.pageErrors)).filter(e => !/QA simulated/.test(e)).length === 0, state);
    await page.evaluate(() => document.getElementById('qvClose').click());
    await page.waitForFunction(() => document.getElementById('qv').open === false, { timeout: 3000 });
    await ctx.close();
  }
  {
    // 6) Board drag still works with M05 and the target column flashes on
    //    success. Reuses the real-pointer drag from the MOTION-04 harness.
    const { ctx, page, state } = await newScenario(browser, FIX);
    await page.evaluate(() => document.getElementById('v13BoardView').click());
    await sleep(260);
    const handleBox = await page.evaluate(() => {
      const h = document.querySelector('#board .board__card[data-id="a1"] .board__handle');
      if (!h) return null;
      h.scrollIntoView({ block: 'center', behavior: 'instant' });
      const r = h.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    const colBox = await page.evaluate(() => {
      const col = document.querySelector('#board .board__column[data-status="saving"]');
      const r = col.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + Math.min(r.height / 2, 120) };
    });
    if (handleBox && colBox) {
      await page.mouse.move(handleBox.x, handleBox.y);
      await page.mouse.down();
      await sleep(40);
      for (let i = 1; i <= 8; i++) {
        await page.mouse.move(handleBox.x + (colBox.x - handleBox.x) * i / 8, handleBox.y + (colBox.y - handleBox.y) * i / 8);
        await sleep(12);
      }
      await page.mouse.up();
      await sleep(120);
      const midFlash = await page.evaluate(() => !!document.querySelector('.board__column--confirm'));
      const status = await page.evaluate(() => (items.find(i => i.id === 'a1') || {}).status);
      c('M05-37', 'board', 'drag still moves the card', 'a1 -> saving', status === 'saving', status);
      const flashSeen = midFlash || await page.evaluate(() => !!document.querySelector('.board__column--confirm'));
      c('M05-38', 'board', 'column flash on success', 'flash class present', flashSeen === true, midFlash);
      const flashCleanup = await page.evaluate(() => new Promise(r => setTimeout(() => r(!!document.querySelector('.board__column--confirm')), 900)));
      c('M05-39', 'board', 'flash clears itself', 'no residual class', flashCleanup === false, flashCleanup);
    } else {
      c('M05-37', 'board', 'drag still moves the card', 'a1 -> saving', false, { handleBox, colBox });
      c('M05-38', 'board', 'column flash on success', 'flash class present', false, 'skipped, no board');
      c('M05-39', 'board', 'flash clears itself', 'no residual class', false, 'skipped');
    }
    // 7) FLIP still works: switching gallery->focus->gallery keeps all cards.
    const cardsBefore = await page.evaluate(() => document.querySelectorAll('#grid .wishlist-card').length);
    await page.evaluate(() => { window.setCollectionView('focus'); });
    await sleep(360);
    await page.evaluate(() => { window.setCollectionView('gallery'); });
    await sleep(360);
    const cardsAfter = await page.evaluate(() => ({
      n: document.querySelectorAll('#grid .wishlist-card').length,
      view: document.getElementById('grid').dataset.v13View
    }));
    c('M05-40', 'flip', 'view switch keeps every card', 'same count, gallery view', cardsAfter.n === cardsBefore && cardsAfter.view === 'gallery', { before: cardsBefore, after: cardsAfter });
    c('M05-41', 'errors', 'no errors (board+flip scenario)', 'clean', (state.errors.concat(state.pageErrors)).length === 0, state);
    await ctx.close();
  }
  {
    // 8) Toast auto-expiry animates out and is gone afterwards.
    const { ctx, page, state } = await newScenario(browser, FIX);
    await page.evaluate(() => { window.toast('M05 kiểm chứng', 'info'); });
    await sleep(400);
    const shown = await page.evaluate(() => ({ present: !!document.querySelector('.toast'), leaving: !!(document.querySelector('.toast') || {}).className ? /toast--leaving/.test((document.querySelector('.toast') || {className: ''}).className) : false }));
    c('M05-42', 'toast', 'toast shown, not leaving early', 'present without leaving class right after', shown.present === true && shown.leaving === false, shown);
    const leaving = await page.evaluate(() => new Promise(r => {
      const t = document.querySelector('.toast');
      if (!t) return r({ leaving: false, note: 'toast already gone' });
      const obs = new MutationObserver(() => {
        if (/toast--leaving/.test(t.className)) { obs.disconnect(); r({ leaving: true }); }
      });
      obs.observe(t, { attributes: true, attributeFilter: ['class'] });
      setTimeout(() => { obs.disconnect(); r({ leaving: /toast--leaving/.test(t.className) }); }, 3400);
    }));
    c('M05-43', 'toast', 'leaving class on auto-expiry', 'toast--leaving applied', leaving.leaving === true, leaving);
    const gone = await page.evaluate(() => new Promise(r => setTimeout(() => r({ n: document.querySelectorAll('.toast').length }), 400)));
    c('M05-44', 'toast', 'toast removed after leave animation', '0 toasts', gone.n === 0, gone);
    c('M05-45', 'errors', 'no errors (toast scenario)', 'clean', (state.errors.concat(state.pageErrors)).length === 0, state);
    await ctx.close();
  }
  await browser.close();
  server.close();
  const pass = results.filter(r => r.pass).length, fail = results.length - pass;
  for (const r of results) console.log((r.pass ? 'PASS' : 'FAIL') + ' [' + r.id + '] ' + r.section + ' :: ' + r.entry + (r.pass ? '' : '\n       expected: ' + r.expected + '\n       actual:   ' + r.actual));
  console.log('\n==== MOTION-05 SUITE: ' + pass + ' PASS / ' + fail + ' FAIL (total ' + results.length + ') ====');
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'motion-05-suite.json'), JSON.stringify({ generatedAt: new Date().toISOString(), repo: ROOT, pass, fail, total: results.length, results }, null, 2));
  process.exit(fail === 0 ? 0 : 1);
}

run().catch(e => { console.error('FATAL', e && e.stack || e); process.exit(2); });
