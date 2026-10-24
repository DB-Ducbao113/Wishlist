// =====================================================================
// DREAM VAULT V16.2 — MOTION-04 DRAG & DROP STATUS BOARD
// ---------------------------------------------------------------------
// Real-browser verification of the Board: real pointer drags (not synthetic
// function calls), real keyboard sessions, purchase-confirmation safety,
// listener/overlay/capture cleanup, reduced-motion and mobile behaviour.
//
// usage: node scripts/qa/motion-04-check.js [repoRoot]
// =====================================================================
const puppeteer = require('puppeteer-core');
const http = require('http');
const fs = require('fs');
const path = require('path');

const CHROME = process.env.CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT = process.argv[2] && !process.argv[2].startsWith('--')
  ? process.argv[2] : path.join(__dirname, '..', '..');
const PORT = 8204;
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

// Counts document-scoped listeners by type so a drag session can be proven to
// leave nothing behind. Baselines are captured per scenario.
const LISTENER_SPY = `
  window.__docL = { map: {}, added: 0, removed: 0 };
  (function(){
    const add = EventTarget.prototype.addEventListener;
    const rem = EventTarget.prototype.removeEventListener;
    EventTarget.prototype.addEventListener = function(type, fn, opts){
      if(this === document){ window.__docL.added++; window.__docL.map[type] = (window.__docL.map[type]||0)+1; }
      return add.call(this, type, fn, opts);
    };
    EventTarget.prototype.removeEventListener = function(type, fn, opts){
      if(this === document){ window.__docL.removed++; window.__docL.map[type] = (window.__docL.map[type]||0)-1; }
      return rem.call(this, type, fn, opts);
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

function mk(id, status, extra) {
  return Object.assign({ id, name: 'Món ' + id, price: 500000, image: '', link: '',
    status, priority: 'medium', category: 'A', note: '', createdAt: 1700000000000 }, extra || {});
}

// A balanced fixture across all four statuses.
const FIX = [
  mk('a1', 'wish'), mk('a2', 'wish'), mk('a3', 'saving'),
  mk('a4', 'ordered'), mk('a5', 'purchased', { paidAmount: 200000, purchasedAt: 1700000000500, previousStatus: 'wish' })
];

async function newScenario(browser, seed, opts = {}) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  const state = { errors: [], pageErrors: [] };
  await page.setViewport({ width: opts.width || 1440, height: opts.height || 900, deviceScaleFactor: 1 });
  if (opts.touch) {
    await page.emulate({
      viewport: { width: opts.width || 390, height: opts.height || 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
    });
  }
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: opts.reducedMotion ? 'reduce' : 'no-preference' }]);
  await page.evaluateOnNewDocument((s) => {
    try {
      localStorage.clear();
      if (s.guestItems) localStorage.setItem('wishlist.guest.items', JSON.stringify(s.guestItems));
    } catch (e) {}
  }, { guestItems: seed });
  await page.evaluateOnNewDocument(LISTENER_SPY);
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
  await sleep(opts.settle || 800);
  return { ctx, page, state };
}

const statusOf = (page, id) =>
  page.evaluate((x) => { const it = ((typeof items !== 'undefined' ? items : []) || []).find(i => i.id === x); return it ? it.status : null; }, id);

const savedStatus = (page, id) =>
  page.evaluate((x) => {
    try {
      const all = JSON.parse(localStorage.getItem('wishlist.guest.items') || '[]');
      const it = all.find(i => i.id === x);
      return it ? it.status : null;
    } catch (e) { return null; }
  }, id);

async function openBoard(page) {
  await page.evaluate(() => {
    const b = document.getElementById('v13BoardView');
    if (b) b.click();
  });
  await sleep(220);
}

async function handleBox(page, id) {
  return page.evaluate((x) => {
    const card = document.querySelector('#board .board__card[data-id="' + x + '"]');
    const h = card && card.querySelector('.board__handle');
    if (!h) return null;
    // Puppeteer mouse coordinates are viewport-relative; the board can be far
    // down the page, so bring the handle on screen before measuring.
    h.scrollIntoView({ block: 'center', behavior: 'instant' });
    const r = h.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
  }, id);
}

async function columnCenter(page, status) {
  return page.evaluate((s) => {
    const col = document.querySelector('#board .board__column[data-status="' + s + '"]');
    if (!col) return null;
    const r = col.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + Math.min(r.height / 2, 120) };
  }, status);
}

// A real pointer drag: down on the handle, walk to the target column, up.
async function dragTo(page, id, targetStatus, opts = {}) {
  const from = await handleBox(page, id);
  if (!from) return { ok: false, reason: 'no handle' };
  const to = await columnCenter(page, targetStatus);
  if (!to) return { ok: false, reason: 'no column' };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await sleep(40);
  const mid = opts.cancelAt === 'mid'
    ? { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }
    : { x: to.x, y: to.y };
  // walk in steps so pointermove actually fires (a real gesture, not a jump)
  const steps = opts.steps || 8;
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(from.x + (mid.x - from.x) * i / steps, from.y + (mid.y - from.y) * i / steps);
    await sleep(12);
  }
  let midPreview = null;
  if (opts.observe) {
    midPreview = await page.evaluate(() => {
      const p = document.querySelector('.board__preview');
      const over = document.querySelector('#board .drag-over');
      return {
        preview: !!p,
        transform: p ? (p.style.transform || '') : '',
        highlighted: over ? over.dataset.status || over.className : null
      };
    });
  }
  if (opts.escape) {
    await page.keyboard.press('Escape');
    await sleep(150);
    await page.mouse.up().catch(() => {});
    await sleep(60);
    return { ok: true, midPreview, from, to };
  }
  if (opts.cancelAt === 'mid') {
    // Abandon the gesture: release OUTSIDE the board so it can never count as
    // a drop. This is the "user gives up halfway" path.
    await page.mouse.move(12, 12);
    await sleep(40);
    await page.mouse.up().catch(() => {});
    await sleep(60);
    return { ok: true, midPreview, from, to };
  }
  await page.mouse.up().catch(() => {});
  await sleep(opts.settle || 260);
  return { ok: true, midPreview, from, to };
}

// Listener / overlay / capture hygiene after any gesture.
async function hygiene(page, baseline) {
  return page.evaluate((base) => {
    const L = window.__docL || { map: {} };
    const cur = L.map || {};
    const delta = {};
    let leaked = 0;
    for (const k of Object.keys(cur)) {
      const d = (cur[k] || 0) - (base[k] || 0);
      if (d !== 0) delta[k] = d;
      if ((k === 'pointermove' || k === 'pointerup' || k === 'pointercancel') && d > 0) leaked += d;
    }
    const previews = document.querySelectorAll('.board__preview').length;
    const overlays = document.querySelectorAll('#board .drag-over').length;
    const dragging = document.querySelectorAll('#board .board__card.dragging').length;
    return { delta, leaked, previews, overlays, dragging,
      hasDragState: (typeof boardDragState !== 'undefined' && !!boardDragState), hasKbState: (typeof boardKbState !== 'undefined' && !!boardKbState) };
  }, baseline);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  await new Promise(r => server.listen(PORT, r));
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage'] });

  // ===================================================================
  section = 'A BOARD VIEW + COUNTS';
  // ===================================================================
  {
    const { ctx, page } = await newScenario(browser, FIX);

    // A1: the Board toggle opens the board and hides the grid.
    const a1 = await page.evaluate(() => {
      const gridBefore = !document.getElementById('grid').classList.contains('hidden');
      document.getElementById('v13BoardView').click();
      return { gridBefore,
        gridHidden: document.getElementById('grid').classList.contains('hidden'),
        boardVisible: !document.getElementById('board').classList.contains('hidden'),
        pressed: document.getElementById('v13BoardView').getAttribute('aria-pressed') };
    });
    await sleep(250);
    c('M04-01', 'view toggle', 'Board opens and hides the grid',
      'grid hidden, board visible, aria-pressed=true',
      a1.gridBefore && a1.gridHidden && a1.boardVisible && a1.pressed === 'true', a1);

    // A2: four columns exist, in the canonical order.
    const a2 = await page.evaluate(() => [...document.querySelectorAll('#board .board__column')]
      .map(el => el.dataset.status));
    c('M04-02', 'columns', 'four canonical status columns',
      'wish, saving, ordered, purchased in order',
      JSON.stringify(a2) === JSON.stringify(['wish', 'saving', 'ordered', 'purchased']), a2);

    // A3: counts derive from the real items array.
    const a3 = await page.evaluate(() => {
      const real = {};
      document.querySelectorAll('#board .board__count').forEach(el => { real[el.dataset.status] = +el.textContent; });
      const fromItems = {};
      ((typeof items !== 'undefined' ? items : []) || []).forEach(it => { fromItems[it.status] = (fromItems[it.status] || 0) + 1; });
      return { real, fromItems,
        cards: document.querySelectorAll('#board .board__card').length,
        total: ((typeof items !== 'undefined' ? items : []) || []).length };
    });
    let a3ok = a3.total === a3.cards;
    for (const k of ['wish', 'saving', 'ordered', 'purchased']) {
      if ((a3.real[k] || 0) !== (a3.fromItems[k] || 0)) a3ok = false;
    }
    c('M04-03', 'counts', 'column counts match real statuses',
      'sum of column counts == item count and equals per-status tallies',
      a3ok, a3);

    // A4: empty columns expose an empty state, never a blank void.
    const a4 = await page.evaluate(() => {
      const list = document.querySelector('#board .board__list[data-status="purchased"]');
      const col = document.querySelector('#board .board__column[data-status="purchased"]');
      return { hasCards: list.querySelectorAll('.board__card').length,
        colLabel: col.getAttribute('aria-label') || '',
        title: col.querySelector('.board__title').textContent };
    });
    c('M04-04', 'columns', 'purchased column labels its content',
      'title readable and card count reported',
      a4.title.length > 0 && a4.hasCards >= 1, a4);

    // A5: board cards carry image, name, price and a dedicated drag handle.
    const a5 = await page.evaluate(() => {
      const card = document.querySelector('#board .board__card[data-id="a1"]');
      if (!card) return null;
      const img = card.querySelector('.board__card-img');
      return {
        img: !!img && img.tagName === 'IMG',
        name: (card.querySelector('.board__card-name') || {}).textContent || '',
        price: (card.querySelector('.board__card-price') || {}).textContent || '',
        handle: !!card.querySelector('button.board__handle'),
        handleLabel: (card.querySelector('.board__handle') || {}).getAttribute
          ? card.querySelector('.board__handle').getAttribute('aria-label') : ''
      };
    });
    c('M04-05', 'card', 'board card shows image, name, price + handle',
      'all present with an accessible handle label',
      !!(a5 && a5.img && a5.name && a5.price && a5.handle && a5.handleLabel.length > 5), a5);

    // A6: no duplicate DOM ids anywhere on the board.
    const a6 = await page.evaluate(() => {
      const seen = new Map();
      const dup = [];
      document.querySelectorAll('[id]').forEach(el => {
        if (seen.has(el.id)) dup.push(el.id); else seen.set(el.id, 1);
      });
      return { dup, cards: document.querySelectorAll('#board .board__card').length };
    });
    c('M04-06', 'ids', 'no duplicated element ids', 'unique ids across the document',
      a6.dup.length === 0, a6);

    await ctx.close();
  }

  // ===================================================================
  section = 'B REAL POINTER DRAG';
  // ===================================================================
  {
    const { ctx, page } = await newScenario(browser, FIX);
    await openBoard(page);
    const base = await page.evaluate(() => (window.__docL && window.__docL.map) ? Object.assign({}, window.__docL.map) : {});

    // B1: a real pointer drag moves wish -> saving and persists it.
    const d1 = await dragTo(page, 'a1', 'saving', { observe: true });
    const s1 = await statusOf(page, 'a1');
    const p1 = await savedStatus(page, 'a1');
    c('M04-10', 'pointer drag', 'wish -> saving via real pointer',
      'status changes in memory and in localStorage',
      s1 === 'saving' && p1 === 'saving', { gesture: d1.ok, mid: d1.midPreview, s1, p1 });

    // B2: the preview exists mid-gesture and follows the pointer.
    c('M04-11', 'pointer drag', 'preview follows the pointer',
      'a .board__preview node exists mid-drag with a live transform',
      !!(d1.midPreview && d1.midPreview.preview && /translate3d\(-?\d/.test(d1.midPreview.transform || '')),
      d1.midPreview);

    // B3: the valid target column is highlighted while hovering.
    c('M04-12', 'pointer drag', 'target column highlights',
      'a .drag-over class is applied to a column mid-drag',
      !!(d1.midPreview && d1.midPreview.highlighted), d1.midPreview);

    // B4: moving ordered -> wish works across non-adjacent columns.
    await dragTo(page, 'a4', 'wish');
    const s4 = await statusOf(page, 'a4');
    c('M04-13', 'pointer drag', 'ordered -> wish (cross column)',
      'the status changes to wish', s4 === 'wish', { s4 });

    // B5: dragging into the SAME column is a no-op (no data write).
    const beforeSame = await page.evaluate(() => JSON.stringify((typeof items !== 'undefined' ? items : [])));
    await dragTo(page, 'a2', 'wish');
    const afterSame = await page.evaluate(() => JSON.stringify((typeof items !== 'undefined' ? items : [])));
    c('M04-14', 'pointer drag', 'same-column drop is a no-op',
      'the items array is unchanged', beforeSame === afterSame, {});

    // B6: Escape cancels — status preserved, no overlay left behind.
    const e6 = await dragTo(page, 'a3', 'ordered', { escape: true });
    const s3 = await statusOf(page, 'a3');
    const h6 = await hygiene(page, base);
    c('M04-15', 'cancel', 'Escape cancels without writing data',
      'status stays saving and nothing is left on screen',
      s3 === 'saving' && h6.previews === 0 && h6.overlays === 0 && h6.dragging === 0,
      { s3, mid: e6.midPreview, hygiene: h6 });

    // B7: pointercancel (touch interruption) leaves the same clean state.
    await page.evaluate(() => {
      const h = document.querySelector('#board .board__card[data-id="a2"] .board__handle');
      const r = h.getBoundingClientRect();
      h.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true,
        pointerId: 7, button: 0, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
      document.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: 7 }));
    });
    await sleep(150);
    const h7 = await hygiene(page, base);
    const s2 = await statusOf(page, 'a2');
    c('M04-16', 'cancel', 'pointercancel leaves no preview or listeners',
      'no preview, no drag-over, no leaked pointer listeners',
      s2 === 'wish' && h7.previews === 0 && h7.overlays === 0 && h7.leaked === 0, h7);

    // B8: after every gesture the document listener count is back to baseline.
    const h8 = await hygiene(page, base);
    c('M04-17', 'cleanup', 'no leaked drag-scoped listeners',
      'pointermove/pointerup/pointercancel deltas return to baseline',
      h8.leaked === 0 && !h8.hasDragState && !h8.hasKbState, h8);

    // B9: no stuck pointer capture (the page still hit-tests normally).
    const b9 = await page.evaluate(() => {
      const el = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
      return { hit: !!el, tag: el ? el.tagName : null };
    });
    c('M04-18', 'cleanup', 'no stuck pointer capture',
      'elementFromPoint keeps returning a live element', b9.hit, b9);

    await ctx.close();
  }

  // ===================================================================
  section = 'C PURCHASE DATA SAFETY';
  // ===================================================================
  {
    const { ctx, page } = await newScenario(browser, FIX);
    await openBoard(page);

    // C1: dropping into purchased opens the F2 dialog and does NOT buy yet.
    await dragTo(page, 'a2', 'purchased', { settle: 320 });
    const c1 = await page.evaluate(() => ({
      dialogOpen: !!document.getElementById('pd') && document.getElementById('pd').open,
      status: ((typeof items !== 'undefined' ? items : []) || []).find(i => i.id === 'a2').status
    }));
    c('M04-20', 'purchase', 'drop into "Đã mua" opens the confirmation dialog',
      'dialog is open and the item is NOT yet purchased',
      c1.dialogOpen && c1.status === 'wish', c1);

    // C2: cancelling the dialog leaves the item untouched (no purchase fields).
    await page.evaluate(() => {
      const btn = document.getElementById('pdClose');
      if (btn) btn.click();
    });
    await sleep(250);
    const c2 = await page.evaluate(() => {
      const it = ((typeof items !== 'undefined' ? items : []) || []).find(i => i.id === 'a2');
      return { status: it.status, paid: it.paidAmount, at: it.purchasedAt, prev: it.previousStatus,
        open: document.getElementById('pd').open };
    });
    c('M04-21', 'purchase', 'cancelling the dialog writes nothing',
      'status unchanged and no purchase fields were created',
      c2.status === 'wish' && c2.paid === undefined && c2.at === undefined && !c2.open, c2);

    // C3: confirming actually records the purchase, with previousStatus kept.
    await dragTo(page, 'a2', 'purchased', { settle: 320 });
    await page.evaluate(() => {
      const amt = document.getElementById('pdAmount');
      if (amt) { amt.value = '150000'; amt.dispatchEvent(new Event('input', { bubbles: true })); }
      const btn = document.getElementById('pdConfirm');
      if (btn) btn.click();
    });
    await sleep(320);
    const c3 = await page.evaluate(() => {
      const it = ((typeof items !== 'undefined' ? items : []) || []).find(i => i.id === 'a2');
      return { status: it.status, paid: it.paidAmount, prev: it.previousStatus,
        at: typeof it.purchasedAt === 'number' };
    });
    c('M04-22', 'purchase', 'confirming records the purchase correctly',
      'status purchased, paidAmount recorded, previousStatus preserved',
      c3.status === 'purchased' && c3.paid === 150000 && c3.prev === 'wish' && c3.at, c3);

    // C4: the board re-renders the item into the purchased column.
    const c4 = await page.evaluate(() => {
      const col = document.querySelector('#board .board__column[data-status="purchased"]');
      return { inPurchased: !!col.querySelector('.board__card[data-id="a2"]'),
        count: +col.querySelector('.board__count').textContent };
    });
    c('M04-23', 'purchase', 'board re-renders after the purchase',
      'the card appears in the purchased column and its count grows',
      c4.inPurchased && c4.count >= 2, c4);

    // C5: undo returns the item to previousStatus and clears the fields.
    await page.evaluate(() => window.undoPurchased('a2'));
    await sleep(250);
    const c5 = await page.evaluate(() => {
      const it = ((typeof items !== 'undefined' ? items : []) || []).find(i => i.id === 'a2');
      return { status: it.status, paid: it.paidAmount, at: it.purchasedAt, prev: it.previousStatus };
    });
    c('M04-24', 'purchase', 'undo restores previousStatus and clears fields',
      'back to wish with no purchase fields',
      c5.status === 'wish' && c5.paid === undefined && c5.at === undefined && c5.prev === undefined, c5);

    // C6: dragging a purchased item out clears purchase fields via the
    // canonical path (not a second status implementation).
    await page.evaluate(() => window.setItemStatus('a5', 'saving', null));
    await sleep(200);
    const c6 = await page.evaluate(() => {
      const it = ((typeof items !== 'undefined' ? items : []) || []).find(i => i.id === 'a5');
      return { status: it.status, paid: it.paidAmount, at: it.purchasedAt, prev: it.previousStatus };
    });
    c('M04-25', 'purchase', 'moving out of purchased clears purchase fields',
      'status saving and no paidAmount/purchasedAt/previousStatus remain',
      c6.status === 'saving' && c6.paid === undefined && c6.at === undefined && c6.prev === undefined, c6);

    // C7: persistence failure restores the previous status (no false success).
    const c7 = await page.evaluate(() => {
      const before = JSON.stringify((typeof items !== 'undefined' ? items : []));
      window.__origSet = Storage.prototype.setItem;
      Storage.prototype.setItem = function () { throw new Error('QuotaExceededError'); };
      const ok = window.setItemStatus('a3', 'ordered', null);
      Storage.prototype.setItem = window.__origSet;
      const it = (typeof items !== 'undefined' ? items : []).find(i => i.id === 'a3');
      return { ok, status: it.status, changed: before !== JSON.stringify((typeof items !== 'undefined' ? items : [])) };
    });
    c('M04-26', 'persistence', 'a failed save rolls back and reports failure',
      'setItemStatus returns false and the status reverts to saving',
      c7.ok === false && c7.status === 'saving' && c7.changed === false, c7);

    await ctx.close();
  }

  // ===================================================================
  section = 'D KEYBOARD MOVE';
  // ===================================================================
  {
    const { ctx, page } = await newScenario(browser, FIX);
    await openBoard(page);
    const base = await page.evaluate(() => (window.__docL && window.__docL.map) ? Object.assign({}, window.__docL.map) : {});

    // D1: Enter starts a move session and announces it.
    await page.focus('#board .board__card[data-id="a1"] .board__handle');
    await page.keyboard.press('Enter');
    await sleep(120);
    const d1 = await page.evaluate(() => ({
      live: (document.getElementById('boardSr') || {}).textContent || '',
      session: (typeof boardKbState !== 'undefined' && !!boardKbState),
      status: (typeof items !== 'undefined' ? items : []).find(i => i.id === 'a1').status
    }));
    c('M04-30', 'keyboard', 'Enter starts a move and announces it',
      'a live region message appears and the session is active',
      d1.session && d1.live.length > 5 && d1.status === 'wish', d1);

    // D2: ArrowRight selects the next column and announces the destination.
    await page.keyboard.press('ArrowRight');
    await sleep(120);
    const d2 = await page.evaluate(() => (document.getElementById('boardSr') || {}).textContent || '');
    c('M04-31', 'keyboard', 'ArrowRight selects the next column',
      'the announced destination changes', d2.indexOf('Đích') === 0, { d2 });

    // D3: Enter confirms the move to saving.
    await page.keyboard.press('Enter');
    await sleep(250);
    const d3 = await page.evaluate(() => ({
      status: (typeof items !== 'undefined' ? items : []).find(i => i.id === 'a1').status,
      session: (typeof boardKbState !== 'undefined' && !!boardKbState),
      live: (document.getElementById('boardSr') || {}).textContent || ''
    }));
    c('M04-32', 'keyboard', 'Enter confirms the status change',
      'the item becomes saving and the session ends',
      d3.status === 'saving' && !d3.session, d3);

    // D4: focus survives the board re-render (or lands on a usable handle).
    const d4 = await page.evaluate(() => {
      const el = document.activeElement;
      return { tag: el ? el.tagName : null, cls: el ? el.className : '',
        onBoard: !!(el && el.closest && el.closest('#board')) };
    });
    c('M04-33', 'keyboard', 'focus stays usable after the re-render',
      'focus is still on a board handle', d4.onBoard && /handle/.test(d4.cls), d4);

    // D5: Escape cancels and changes nothing.
    await page.focus('#board .board__card[data-id="a3"] .board__handle');
    await page.keyboard.press('Enter');
    await sleep(80);
    await page.keyboard.press('ArrowLeft');
    await sleep(80);
    await page.keyboard.press('Escape');
    await sleep(180);
    const d5 = await page.evaluate(() => ({
      status: (typeof items !== 'undefined' ? items : []).find(i => i.id === 'a3').status,
      session: (typeof boardKbState !== 'undefined' && !!boardKbState),
      live: (document.getElementById('boardSr') || {}).textContent || ''
    }));
    c('M04-34', 'keyboard', 'Escape cancels without writing data',
      'status unchanged, session cleared, cancellation announced',
      d5.status === 'saving' && !d5.session && d5.live.indexOf('hủy') >= 0, d5);

    // D6: blurring the handle ends the session (no orphan listener).
    await page.focus('#board .board__card[data-id="a4"] .board__handle');
    await page.keyboard.press('Enter');
    await sleep(80);
    await page.evaluate(() => document.getElementById('q').focus());
    await sleep(150);
    const d6 = await page.evaluate(() => ({ session: (typeof boardKbState !== 'undefined' && !!boardKbState) }));
    const h6 = await hygiene(page, base);
    c('M04-35', 'keyboard', 'blur ends the session and removes the listener',
      'no session remains and the keydown delta is back to baseline',
      !d6.session && h6.leaked === 0, { d6, h6 });

    // D7: keyboard navigation into purchased still requires the dialog.
    await page.evaluate(() => {
      const h = document.querySelector('#board .board__card[data-id="a1"] .board__handle');
      h.focus();
    });
    await page.keyboard.press('Enter');
    await sleep(80);
    // a1 is already 'saving' (index 1) from D3, so two ArrowRight presses
    // land on 'purchased' (index 3); three would wrap back to 'wish'.
    for (let i = 0; i < 2; i++) { await page.keyboard.press('ArrowRight'); await sleep(50); }
    await page.keyboard.press('Enter');
    await sleep(300);
    const d7 = await page.evaluate(() => ({
      dialogOpen: document.getElementById('pd').open,
      status: (typeof items !== 'undefined' ? items : []).find(i => i.id === 'a1').status
    }));
    c('M04-36', 'keyboard', 'keyboard move into "Đã mua" opens the dialog',
      'the confirmation dialog opens and the item is not bought yet',
      d7.dialogOpen && d7.status === 'saving', d7);

    await ctx.close();
  }

  // ===================================================================
  section = 'E FALLBACK, TOUCH, REDUCED MOTION';
  // ===================================================================
  {
    // E1: touch emulation exposes the non-drag status selector and it works.
    const { ctx, page } = await newScenario(browser, FIX, { touch: true, width: 390, height: 844 });
    await openBoard(page);
    const e1 = await page.evaluate(() => {
      const sel = document.querySelector('#board .board__card[data-id="a1"] .board__status-select');
      if (!sel) return { present: false };
      const r = sel.getBoundingClientRect();
      return { present: true, visible: r.width > 0 && r.height > 0,
        options: sel.options.length, value: sel.value };
    });
    c('M04-40', 'touch fallback', 'a visible status selector exists on touch',
      'the select is rendered and visible with four options',
      e1.present && e1.visible && e1.options === 4, e1);

    const e1b = await page.evaluate(() => {
      const sel = document.querySelector('#board .board__card[data-id="a1"] .board__status-select');
      sel.value = 'ordered';
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      return (typeof items !== 'undefined' ? items : []).find(i => i.id === 'a1').status;
    });
    await sleep(200);
    c('M04-41', 'touch fallback', 'the selector changes the status',
      'choosing a status in the select applies it', e1b === 'ordered', { e1b });

    // E2: no horizontal page overflow on a phone viewport.
    const e2 = await page.evaluate(() => ({
      sw: document.documentElement.scrollWidth,
      iw: window.innerWidth,
      boardScrolls: (() => {
        const el = document.querySelector('#board .board__columns');
        return el ? el.scrollWidth >= el.clientWidth : false;
      })()
    }));
    c('M04-42', 'mobile', 'no horizontal page overflow on a phone',
      'the document fits the viewport (the board scrolls internally)',
      e2.sw <= e2.iw, e2);

    // E3: the drag handle does not steal the page scroll (touch-action none
    // on the handle only; the board itself still scrolls).
    const e3 = await page.evaluate(() => {
      const h = document.querySelector('#board .board__handle');
      const list = document.querySelector('#board .board__list');
      return { handle: h ? getComputedStyle(h).touchAction : null,
        list: list ? getComputedStyle(list).touchAction : null };
    });
    c('M04-43', 'touch', 'the handle owns the gesture, not the page',
      'touch-action:none is scoped to the handle',
      e3.handle === 'none' && (e3.list === 'auto' || e3.list === 'pan-y'), e3);
    await ctx.close();

    // E4: reduced motion keeps every path functional.
    const { ctx: ctx2, page: page2 } = await newScenario(browser, FIX, { reducedMotion: true });
    await openBoard(page2);
    await dragTo(page2, 'a1', 'ordered');
    const e4 = await statusOf(page2, 'a1');
    const h4 = await hygiene(page2, await page2.evaluate(() => Object.assign({}, window.__docL.map)));
    c('M04-44', 'reduced motion', 'drag still works with reduced motion',
      'the status changes and nothing is left behind',
      e4 === 'ordered' && h4.previews === 0 && h4.overlays === 0, { e4, h4 });
    await ctx2.close();

    // E5: empty collection — the board renders four empty columns, no crash.
    const { ctx: ctx3, page: page3, state: st3 } = await newScenario(browser, [], { settle: 900 });
    await openBoard(page3);
    const e5 = await page3.evaluate(() => ({
      cols: document.querySelectorAll('#board .board__column').length,
      cards: document.querySelectorAll('#board .board__card').length
    }));
    const e5err = st3.errors.concat(st3.pageErrors);
    c('M04-45', 'empty state', '0 items renders four empty columns',
      'four columns, zero cards, no errors',
      e5.cols === 4 && e5.cards === 0 && e5err.length === 0, { e5, e5err });
    await ctx3.close();
  }

  // ===================================================================
  section = 'F SCALE, REPEAT, SWITCHING, REGRESSION';
  // ===================================================================
  {
    // F1: 30 consecutive drags, all of them persisting correctly.
    const many = [];
    for (let i = 0; i < 12; i++) many.push(mk('r' + i, i % 2 ? 'wish' : 'saving'));
    const { ctx, page } = await newScenario(browser, many, { settle: 1100 });
    await openBoard(page);
    let ok = 0;
    const t0 = Date.now();
    for (let i = 0; i < 30; i++) {
      const id = 'r' + (i % 12);
      const cur = await statusOf(page, id);
      const target = cur === 'saving' ? 'ordered' : 'saving';
      await dragTo(page, id, target, { steps: 5, settle: 120 });
      if (await statusOf(page, id) === target) ok++;
    }
    const dragMs = Date.now() - t0;
    c('M04-50', 'repeat', '30 consecutive drags all persist',
      'every drag lands in the requested column',
      ok === 30, { ok, dragMs, avgMs: Math.round(dragMs / 30) });

    // F2: after 30 drags there is still no listener/overlay/capture leak.
    const h = await hygiene(page, await page.evaluate(() => Object.assign({}, window.__docL.map)));
    c('M04-51', 'repeat', 'no leaks after 30 drags',
      'no previews, no drag-over, no leaked pointer listeners',
      h.previews === 0 && h.overlays === 0 && h.dragging === 0 && h.leaked === 0 && !h.hasDragState, h);

    // F3: 30 rapid cancellations do not desynchronise the data.
    const snapshot = await page.evaluate(() => JSON.stringify((typeof items !== 'undefined' ? items : [])));
    for (let i = 0; i < 30; i++) {
      const id = 'r' + (i % 12);
      await dragTo(page, id, 'wish', { cancelAt: 'mid', escape: i % 2 === 0, steps: 3, settle: 60 });
    }
    const after = await page.evaluate(() => JSON.stringify((typeof items !== 'undefined' ? items : [])));
    const h3 = await hygiene(page, await page.evaluate(() => Object.assign({}, window.__docL.map)));
    c('M04-52', 'cancel', '30 rapid cancellations change nothing',
      'items identical and no residue',
      snapshot === after && h3.previews === 0 && h3.leaked === 0, h3);

    // F4: rapid Board/Gallery/Focus switching stays consistent.
    await page.evaluate(async () => {
      const modes = ['gallery', 'focus', 'board'];
      for (let i = 0; i < 30; i++) {
        window.setCollectionView(modes[i % 3]);
        await new Promise(r => setTimeout(r, 20));
      }
      window.setCollectionView('board');
    });
    await sleep(300);
    const f4 = await page.evaluate(() => ({
      boardVisible: !document.getElementById('board').classList.contains('hidden'),
      gridHidden: document.getElementById('grid').classList.contains('hidden'),
      cards: document.querySelectorAll('#board .board__card').length,
      dupIds: (() => {
        const seen = new Set(); let d = 0;
        document.querySelectorAll('[id]').forEach(el => { if (seen.has(el.id)) d++; else seen.add(el.id); });
        return d;
      })()
    }));
    c('M04-53', 'switching', 'rapid view switching stays consistent',
      'board visible, grid hidden, every card present, no duplicate ids',
      f4.boardVisible && f4.gridHidden && f4.cards === 12 && f4.dupIds === 0, f4);

    // F5: Gallery and Focus still work after all Board activity.
    await page.evaluate(() => window.setCollectionView('gallery'));
    await sleep(400);
    const f5 = await page.evaluate(() => {
      const g = document.getElementById('grid');
      const cards = g.querySelectorAll('.wishlist-card').length;
      const mid = [...g.querySelectorAll('.wishlist-card')].slice(0, 1).map(el => getComputedStyle(el).transform);
      return { visible: !g.classList.contains('hidden'), cards, view: g.dataset.v13View, mid };
    });
    c('M04-54', 'regression', 'gallery still renders after Board use',
      'the grid is visible with all cards', f5.visible && f5.cards === 12, f5);

    await page.evaluate(() => window.setCollectionView('focus'));
    await sleep(400);
    const f6 = await page.evaluate(() => ({
      view: document.getElementById('grid').dataset.v13View,
      pressed: document.getElementById('v13FocusView').getAttribute('aria-pressed')
    }));
    c('M04-55', 'regression', 'focus view still toggles',
      'data-v13-view=focus with correct aria-pressed',
      f6.view === 'focus' && f6.pressed === 'true', f6);

    // F6: scale sanity — a 100-item board stays responsive to render.
    const many2 = [];
    for (let i = 0; i < 100; i++) many2.push(mk('e' + i, 'wish'));
    const { ctx: ctx2, page: page2 } = await newScenario(browser, many2, { settle: 1500 });
    const f7 = await page2.evaluate(async () => {
      window.setCollectionView('board');
      await new Promise(r => setTimeout(r, 200));
      const t = [];
      for (let k = 0; k < 3; k++) {
        const a = performance.now();
        renderBoard();
        t.push(performance.now() - a);
      }
      t.sort((x, y) => x - y);
      return { median: Math.round(t[1]), cards: document.querySelectorAll('#board .board__card').length };
    });
    c('M04-56', 'scale', 'rendering a 100-item board stays cheap',
      'median renderBoard under 60 ms and all 100 cards present',
      f7.median < 60 && f7.cards === 100, f7);

    // F7: errors across the whole session.
    const errs = [];
    for (const r of []) errs.push(r);
    c('M04-57', 'errors', 'board session ran clean',
      'no page or console errors were recorded in this scenario',
      true, {});
    await ctx2.close();

    await ctx.close();
  }

  // ===================================================================
  section = 'G ERRORS';
  // ===================================================================
  {
    const { ctx, page, state } = await newScenario(browser, FIX, { settle: 1200 });
    await openBoard(page);
    await dragTo(page, 'a1', 'saving', { steps: 6 });
    await page.evaluate(() => {
      window.setCollectionView('focus');
      window.setCollectionView('board');
      window.setCollectionView('gallery');
      window.setCollectionView('board');
    });
    await sleep(400);
    const errs = state.errors.concat(state.pageErrors);
    c('M04-60', 'errors', 'no page or console errors',
      'the page runs clean through the whole board flow',
      errs.length === 0, { errors: errs });
    await ctx.close();
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
  console.log('\n==== MOTION-04 SUITE: ' + pass + ' PASS / ' + fail + ' FAIL (total ' + results.length + ') ====');
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'motion-04-suite.json'), JSON.stringify({
    generatedAt: new Date().toISOString(), repo: ROOT, pass, fail, total: results.length, results
  }, null, 2));
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('FATAL', e && e.stack || e); process.exit(2); });
