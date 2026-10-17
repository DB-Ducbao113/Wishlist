// =====================================================================
// DREAM VAULT V16.1 - F3 DASHBOARD 2.0 - FUNCTIONAL SUITE
// ---------------------------------------------------------------------
// Serves the real repo, stubs ONLY the cloud module (no Firebase network),
// drives the real entry points, and asserts observable behaviour.
//
// usage: node v16_3-f3-check.js [repoRoot]
// =====================================================================
const puppeteer = require('puppeteer-core');
const http = require('http');
const fs = require('fs');
const path = require('path');

const CHROME = process.env.CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT = process.argv[2] && !process.argv[2].startsWith('--')
  ? process.argv[2]
  : path.join(__dirname, '..', '..');
const PORT = 8134;
const ONLY = process.argv[3] || '';
const OUT = path.join(__dirname, '..', '..', 'qa-out');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
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
    signIn: async () => {},
    signOut: async () => { state.user = null; if(opts.onUserChanged) opts.onUserChanged(null); if(opts.onStatus) opts.onStatus('local',''); },
    syncItems: (items) => { state.syncs.push(JSON.parse(JSON.stringify(items))); return Promise.resolve(); },
    uploadImage: async () => { state.uploads++; return 'https://cdn.example/img.jpg'; }
  };
}
`;

const results = [];
let section = '';
const CHECK = (id, area, entry, expected, name, cond, actual, gate = true) => {
  results.push({
    id, area, entry, expected,
    name, pass: !!cond, gate,
    actual: actual === undefined ? '' : JSON.stringify(actual)
  });
};
const section$ = s => { section = s; };
const c = (id, area, entry, expected, cond, actual, gate) =>
  CHECK(id, area, entry, expected, section + ' \u00b7 ' + area, cond, actual, gate);

// ---------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------
// 10 items: wish 3 (30%), saving 2 (20%), ordered 1 (10%), purchased 4 (40%).
// Two of the four purchased rows carry a real paidAmount, the other two
// deliberately do not, so the "unpriced" path stays exercised.
const distItems = () => {
  const out = [];
  const push = (id, status, price, extra) => out.push(Object.assign({
    id, name: 'M\u00f3n ' + id, price, image: '', link: '',
    status, priority: 'medium', category: 'Nh\u00f3m A', note: '',
    createdAt: 1700000000000 + out.length
  }, extra || {}));
  push('w1', 'wish', 1000000);
  push('w2', 'wish', 2000000);
  push('w3', 'wish', 500000);
  push('s1', 'saving', 3000000);
  push('s2', 'saving', 1500000);
  push('o1', 'ordered', 700000);
  push('p1', 'purchased', 2200000, { paidAmount: 2000000, purchasedAt: 1750000000000, previousStatus: 'ordered', category: 'Nh\u00f3m B' });
  push('p2', 'purchased', 1800000, { paidAmount: 1600000, purchasedAt: 1751000000000, previousStatus: 'wish', category: 'Nh\u00f3m B' });
  push('p3', 'purchased', 900000, { previousStatus: 'saving', category: '' });
  push('p4', 'purchased', 600000, { previousStatus: 'wish', category: '' });
  return out;
};
const EXPECT_DIST = { wish: 3, saving: 2, ordered: 1, purchased: 4, total: 10 };
const EXPECT_KPI = {
  pendingValue: 8700000, ownedValue: 5500000, actualSpent: 3600000,
  unpriced: 2, progress: '40%'
};

// 36 items over 8 categories with counts 8,7,6,5,4,3,2,1 so the six-row cap
// and the "Khác" aggregate are both exercised. Alphabetical names make the
// sort order readable in the failure output.
const CAT_COUNTS = [8, 7, 6, 5, 4, 3, 2, 1];
const CAT_NAMES = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta', 'Theta'];
const catItems = () => {
  const out = [];
  CAT_NAMES.forEach((name, i) => {
    for (let k = 0; k < CAT_COUNTS[i]; k++) {
      out.push({
        id: 'c' + i + '-' + k, name: 'M\u00f3n ' + i + '-' + k,
        price: 100000, image: '', link: '',
        status: 'wish', priority: 'medium', category: name,
        note: '', createdAt: 1700000000000 + out.length
      });
    }
  });
  return out;
};

// high 0, medium 3 (one already bought), low 2. The highest rank PRESENT is
// therefore medium, not high - that is what the accent outline must follow.
const prioItems = () => ([
  { id: 'm1', name: 'M\u00f3n m1', price: 1000000, image: '', link: '', status: 'wish', priority: 'medium', category: 'X', note: '', createdAt: 1700000000001 },
  { id: 'm2', name: 'M\u00f3n m2', price: 2000000, image: '', link: '', status: 'saving', priority: 'medium', category: 'X', note: '', createdAt: 1700000000002 },
  { id: 'm3', name: 'M\u00f3n m3', price: 500000, image: '', link: '', status: 'purchased', priority: 'medium', category: 'X', note: '', createdAt: 1700000000003, paidAmount: 400000, purchasedAt: 1750000000000, previousStatus: 'wish' },
  { id: 'l1', name: 'M\u00f3n l1', price: 300000, image: '', link: '', status: 'wish', priority: 'low', category: 'X', note: '', createdAt: 1700000000004 },
  { id: 'l2', name: 'M\u00f3n l2', price: 700000, image: '', link: '', status: 'ordered', priority: 'low', category: 'X', note: '', createdAt: 1700000000005 }
]);

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/wishlist.html';
  const file = path.join(ROOT, p);
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    res.end(data);
  });
});

async function newScenario(browser, seed = {}, opts = {}) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  const state = { errors: [], dialogs: [], acceptDialogs: opts.acceptDialogs !== false, pageErrors: [] };

  await page.setViewport({ width: opts.width || 1280, height: opts.height || 900, deviceScaleFactor: 1 });
  await page.emulateMediaFeatures([{
    name: 'prefers-reduced-motion',
    value: opts.reducedMotion ? 'reduce' : 'no-preference'
  }]);

  await page.evaluateOnNewDocument((s) => {
    try {
      localStorage.clear();
      if (s.guestItems) localStorage.setItem('wishlist.guest.items', JSON.stringify(s.guestItems));
      if (s.accountItems) localStorage.setItem('wishlist.account.' + (s.uid || 'uid-demo'), JSON.stringify(s.accountItems));
    } catch (e) {}
  }, seed);

  page.on('pageerror', e => { state.pageErrors.push(String(e && e.message || e)); });
  page.on('console', m => { if (m.type() === 'error') state.errors.push(m.text()); });
  page.on('dialog', async d => {
    state.dialogs.push(d.message());
    try { state.acceptDialogs ? await d.accept() : await d.dismiss(); } catch (e) {}
  });

  await page.setRequestInterception(true);
  page.on('request', req => {
    if (/wishlist-cloud\.js/.test(req.url())) {
      return req.respond({ status: 200, contentType: 'text/javascript', body: MOCK });
    }
    req.continue();
  });

  await page.goto(`http://localhost:${PORT}/wishlist.html`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForFunction('typeof window.__cloudSetUser === "function"', { timeout: 15000 });
  await sleep(450);

  return { ctx, page, state };
}

const SNAP = () => {
  const $id = (i) => document.getElementById(i);
  const txt = (i) => { const el = $id(i); return el ? el.textContent : null; };
  const attr = (i, a) => { const el = $id(i); return el ? el.getAttribute(a) : null; };
  const q = (i) => { const el = $id(i); return el ? el.value : null; };
  const norm = (s) => (s === null || s === undefined) ? s : String(s).replace(/\s+/g, ' ').trim();
  // Reads the horizontal scale actually applied to a bar. Parsed by hand (no
  // regex) so this stays readable inside an injected page function.
  const scaledX = (el) => {
    const t = getComputedStyle(el).transform;
    if (!t || t === 'none') return 1;
    const open = t.indexOf('(');
    const comma = t.indexOf(',', open);
    if (open < 0 || comma < 0) return null;
    const v = Number(t.slice(open + 1, comma));
    return Number.isFinite(v) ? Math.round(v * 1000) / 1000 : null;
  };
  const cards = [...document.querySelectorAll('#grid .wishlist-card')];
  const storage = {};
  try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); storage[k] = localStorage.getItem(k); } } catch (e) {}
  let metrics = null;
  try { metrics = globalMetrics(); } catch (e) { metrics = { error: String(e && e.message || e) }; }
  return {
    kpi: {
      total: norm(txt('sumTotal')), spent: norm(txt('sumSpent')), count: norm(txt('sumCount')),
      progress: txt('dvProgressValue'),
      actualSpent: norm(txt('dvActualSpent')),
      unpriced: norm(txt('dvUnpriced')),
      caption: txt('dvProgressCaption'),
      ariaNow: attr('dvProgressTrack', 'aria-valuenow'),
      result: norm(txt('resultStatus'))
    },
    metrics,
    items: items.map(x => Object.assign({}, x)),
    itemCount: items.length,
    cardCount: cards.length,
    cardIds: cards.map(x => x.dataset.id),
    cardStatuses: cards.map(x => {
      const it = items.find(i => String(i.id) === String(x.dataset.id));
      return it ? it.status : null;
    }),
    toast: norm((() => { const t = document.querySelector('.toast'); return t ? t.textContent : null; })()),
    filters: {
      q: q('q'), status: q('fStatus'), priority: q('fPriority'),
      category: q('fCategoryFilter'), sort: q('fSort')
    },
    tabs: {
      all: attr('tabAll', 'aria-pressed'),
      pending: attr('tabPending', 'aria-pressed'),
      owned: attr('tabOwned', 'aria-pressed')
    },
    dist: {
      barHidden: $id('dvDistBar') ? $id('dvDistBar').hidden : null,
      legendHidden: $id('dvDistLegend') ? $id('dvDistLegend').hidden : null,
      emptyHidden: $id('dvDistEmpty') ? $id('dvDistEmpty').hidden : null,
      emptyText: norm(txt('dvDistEmpty')),
      total: norm(txt('dvDistTotal')),
      barLabel: attr('dvDistBar', 'aria-label'),
      barRole: attr('dvDistBar', 'role'),
      segs: [...document.querySelectorAll('#dvDistBar .dv-dist__seg')].map(s => ({
        status: s.dataset.status || null,
        grow: s.style.flexGrow
      })),
      rows: [...document.querySelectorAll('#dvDistLegend .dv-dist__item')].map(r => ({
        tag: r.tagName,
        status: r.dataset.status || null,
        pressed: r.getAttribute('aria-pressed'),
        staticRow: r.classList.contains('dv-dist__item--static'),
        name: norm((r.querySelector('.dv-dist__name') || {}).textContent),
        count: norm((r.querySelector('.dv-dist__count') || {}).textContent),
        share: norm((r.querySelector('.dv-dist__share') || {}).textContent)
      }))
    },
    breakdown: {
      hidden: $id('dvBreakdown') ? $id('dvBreakdown').hidden : null,
      rows: [...document.querySelectorAll('#dvBreakdownRows .dv-breakdown__row')].map(r => ({
        tag: r.tagName,
        category: r.dataset.category || null,
        staticRow: r.classList.contains('dv-breakdown__row--static'),
        pressed: r.getAttribute('aria-pressed'),
        name: norm((r.querySelector('.dv-breakdown__name') || {}).textContent),
        value: norm((r.querySelector('.dv-breakdown__value') || {}).textContent),
        fill: (() => {
          const f = r.querySelector('.dv-breakdown__bar-fill');
          if (!f) return null;
          const v = Number(f.style.getPropertyValue('--dv-fill'));
          return Number.isFinite(v) ? Math.round(v * 100) + '%' : null;
        })(),
        fillScale: (() => {
          const f = r.querySelector('.dv-breakdown__bar-fill');
          return f ? scaledX(f) : null;
        })()
      }))
    },
    priority: {
      hidden: $id('dvPriority') ? $id('dvPriority').hidden : null,
      rows: [...document.querySelectorAll('#dvPriorityRows .dv-priority__item')].map(r => ({
        tag: r.tagName,
        priority: r.dataset.priority || null,
        emphasis: r.dataset.emphasis || null,
        disabled: r.getAttribute('aria-disabled'),
        pressed: r.getAttribute('aria-pressed'),
        label: r.getAttribute('aria-label'),
        name: norm((r.querySelector('.dv-priority__name') || {}).textContent),
        count: norm((r.querySelector('.dv-priority__count') || {}).textContent),
        value: norm((r.querySelector('.dv-priority__value') || {}).textContent),
        fill: (() => {
          const f = r.querySelector('.dv-priority__bar-fill');
          if (!f) return null;
          const v = Number(f.style.getPropertyValue('--dv-fill'));
          return Number.isFinite(v) ? Math.round(v * 100) + '%' : null;
        })(),
        fillScale: (() => {
          const f = r.querySelector('.dv-priority__bar-fill');
          return f ? scaledX(f) : null;
        })()
      }))
    },
    categoryOptions: [...document.querySelectorAll('#fCategoryFilter option')]
      .map(o => ({ value: o.value, label: o.textContent })),
    pd: {
      open: $id('pd') ? $id('pd').open : null,
      amount: q('pdAmount'),
      date: q('pdDate')
    },
    dlg: {
      open: $id('dlg') ? $id('dlg').open : null,
      title: norm(txt('dlgTitle')),
      fId: q('fId'),
      focused: document.activeElement ? document.activeElement.id : null
    },
    actions: {
      buttons: [...document.querySelectorAll('#dvActions .dv-actions__btn')].map(b => ({
        id: b.id,
        tag: b.tagName,
        hidden: b.hidden,
        text: norm(b.textContent),
        ariaLabel: b.getAttribute('aria-label')
      })),
      note: norm(txt('dvActionsNote')),
      noteHidden: $id('dvActionsNote') ? $id('dvActionsNote').hidden : null
    },
    focusIsCollection: document.activeElement === $id('collection'),
    storage
  };
};
const snap = page => page.evaluate(SNAP);

// ---------------------------------------------------------------------
// Interaction helpers
// ---------------------------------------------------------------------
const clickId = (page, id) => page.evaluate((i) => document.getElementById(i).click(), id);

const clickDist = (page, key) => page.evaluate((k) => {
  const row = document.querySelector('#dvDistLegend .dv-dist__item[data-status="' + k + '"]');
  if (!row) throw new Error('no distribution row for ' + k);
  row.click();
}, key);

const setStatusFilter = (page, value) => page.evaluate((v) => {
  const el = document.getElementById('fStatus');
  el.value = v;
  el.dispatchEvent(new Event('change', { bubbles: true }));
}, value);

const clickBreakdown = (page, categoryValue) => page.evaluate((v) => {
  const row = document.querySelector('#dvBreakdownRows .dv-breakdown__row[data-category="' + v + '"]');
  if (!row) throw new Error('no breakdown row for ' + v);
  row.click();
}, categoryValue);

const clickPriority = (page, key) => page.evaluate((k) => {
  const row = document.querySelector('#dvPriorityRows .dv-priority__item[data-priority="' + k + '"]');
  if (!row) throw new Error('no priority row for ' + k);
  row.click();
}, key);

const sum = (a) => a.reduce((x, y) => x + y, 0);
// #resultStatus is the FILTERED-result line, so it is expected to change when a
// filter is applied. Every other KPI field is global and must not move.
const kpiOnly = (k) => JSON.stringify({
  total: k.total, spent: k.spent, count: k.count, progress: k.progress,
  actualSpent: k.actualSpent, unpriced: k.unpriced, caption: k.caption, ariaNow: k.ariaNow
});

// =====================================================================
// S1 - STATUS DISTRIBUTION (F3.3)
// =====================================================================
async function s1_status(browser) {
  section$('S1 STATUS');
  const { ctx, page, state } = await newScenario(browser, { guestItems: distItems() });
  let s = await snap(page);

  const rows = s.dist.rows;
  const byStatus = (k) => rows.find(r => r.status === k);

  // --- structure -----------------------------------------------------
  c('DIST-01', 'structure', '.dv-dist legend', 'four rows, in wish -> saving -> ordered -> purchased order',
    rows.map(r => r.status).join(',') === 'wish,saving,ordered,purchased',
    rows.map(r => r.status));

  c('DIST-02', 'structure', '.dv-dist row tag', 'the four status rows are real <button> elements',
    rows.filter(r => r.tag === 'BUTTON').length === 4 &&
    rows.every(r => ['wish', 'saving', 'ordered', 'purchased'].includes(r.status) ? r.tag === 'BUTTON' : true),
    rows.map(r => r.tag + ':' + r.status));

  c('DIST-03', 'structure', 'row text', 'every row states its label, count and share as text (colour is never the only signal)',
    rows.every(r => r.name && /^\d+ m\u00f3n$/.test(r.count) && /^\d+%$/.test(r.share)),
    rows.map(r => [r.name, r.count, r.share]));

  c('DIST-04', 'structure', 'row accessible name', 'the button name reads label + count + share',
    (() => {
      const b = byStatus('wish');
      return b.name === 'Mu\u1ed1n mua' && b.count === '3 m\u00f3n' && b.share === '30%';
    })(),
    byStatus('wish'));

  // --- counts and shares --------------------------------------------
  c('DIST-05', 'counts', 'legend counts', 'wish 3, saving 2, ordered 1, purchased 4',
    byStatus('wish').count === '3 m\u00f3n' && byStatus('saving').count === '2 m\u00f3n' &&
    byStatus('ordered').count === '1 m\u00f3n' && byStatus('purchased').count === '4 m\u00f3n',
    rows.map(r => r.status + '=' + r.count));

  c('DIST-06', 'counts', 'legend shares', 'share is a fraction of the whole collection, and sums to 100',
    (() => {
      const shares = ['wish', 'saving', 'ordered', 'purchased'].map(k => parseInt(byStatus(k).share, 10));
      return shares.join(',') === '30,20,10,40' && sum(shares) === 100;
    })(),
    rows.map(r => r.status + '=' + r.share));

  c('DIST-07', 'counts', '.dv-dist__total', 'states the collection size the shares are taken from',
    s.dist.total === '10 m\u00f3n', s.dist.total);

  c('DIST-08', 'counts', 'bar segments', 'one segment per non-empty status, in the same order as the legend',
    s.dist.segs.map(x => x.status).join(',') === 'wish,saving,ordered,purchased',
    s.dist.segs);

  c('DIST-09', 'counts', 'segment widths', 'each segment carries its exact count, so widths cannot drift from rounding',
    s.dist.segs.map(x => x.grow).join(',') === '3,2,1,4',
    s.dist.segs.map(x => x.grow));

  c('DIST-10', 'a11y', '#dvDistBar', 'is role="img" with a text alternative naming every status, count and share',
    s.dist.barRole === 'img' &&
    /Mu\u1ed1n mua 3 m\u00f3n, 30%/.test(s.dist.barLabel) &&
    /\u0110ang \u0111\u1ec3 d\u00e0nh 2 m\u00f3n, 20%/.test(s.dist.barLabel) &&
    /\u0110\u00e3 \u0111\u1eb7t h\u00e0ng 1 m\u00f3n, 10%/.test(s.dist.barLabel) &&
    /\u0110\u00e3 mua 4 m\u00f3n, 40%/.test(s.dist.barLabel),
    s.dist.barLabel);

  c('DIST-11', 'a11y', 'segment elements', 'segments are decorative (the bar label already carries the data)',
    await page.evaluate(() => [...document.querySelectorAll('#dvDistBar .dv-dist__seg')]
      .every(s => s.getAttribute('aria-hidden') === 'true')),
    null);

  // --- interaction ---------------------------------------------------
  const before = JSON.parse(JSON.stringify({
    items: s.items, storage: s.storage, kpi: s.kpi
  }));

  await clickDist(page, 'purchased');
  await sleep(700);
  let t = await snap(page);

  c('DIST-12', 'interaction', 'click a legend row', '#fStatus is set to that status',
    t.filters.status === 'purchased', t.filters.status);

  c('DIST-13', 'interaction', 'click a legend row', 'the collection shows exactly those items',
    t.cardCount === EXPECT_DIST.purchased &&
    t.cardIds.slice().sort().join(',') === 'p1,p2,p3,p4' &&
    t.cardStatuses.every(st => st === 'purchased'),
    { count: t.cardCount, ids: t.cardIds, statuses: t.cardStatuses });

  c('DIST-14', 'interaction', 'click a legend row', 'pressed state follows the filter, and only on that row',
    t.dist.rows.filter(r => r.pressed === 'true').map(r => r.status).join(',') === 'purchased',
    t.dist.rows.map(r => r.status + '=' + r.pressed));

  c('DIST-15', 'interaction', 'click a legend row', 'the quick tab returns to "T\u1ea5t c\u1ea3" so the two views cannot contradict each other',
    t.tabs.all === 'true' && t.tabs.pending === 'false' && t.tabs.owned === 'false',
    t.tabs);

  c('DIST-16', 'interaction', 'click a legend row', 'focus moves to the collection so a keyboard user is not left behind',
    t.focusIsCollection === true, t.focusIsCollection);

  c('DIST-17', 'interaction', 'dashboard click', 'never edits an item and never writes storage',
    JSON.stringify(t.items) === JSON.stringify(before.items) &&
    JSON.stringify(t.storage) === JSON.stringify(before.storage),
    { itemsChanged: JSON.stringify(t.items) !== JSON.stringify(before.items), storageChanged: JSON.stringify(t.storage) !== JSON.stringify(before.storage) });

  c('DIST-18', 'invariants', 'dashboard click', 'every KPI keeps the same value — filtering never re-sums the collection',
    t.kpi.count === before.kpi.count && t.kpi.spent === before.kpi.spent &&
    t.kpi.total === before.kpi.total && t.kpi.progress === before.kpi.progress &&
    t.kpi.actualSpent === before.kpi.actualSpent && t.kpi.unpriced === before.kpi.unpriced,
    { before: before.kpi, after: t.kpi });

  await clickDist(page, 'purchased');
  await sleep(500);
  t = await snap(page);
  c('DIST-19', 'interaction', 'click the active row again', 'clears the filter (toggle off)',
    t.filters.status === '' && t.cardCount === EXPECT_DIST.total,
    { status: t.filters.status, cards: t.cardCount });

  // The select and the legend must share one source of truth.
  await setStatusFilter(page, 'saving');
  await sleep(400);
  t = await snap(page);
  c('DIST-20', 'interaction', 'change #fStatus directly', 'the legend pressed state follows the select',
    t.dist.rows.filter(r => r.pressed === 'true').map(r => r.status).join(',') === 'saving',
    t.dist.rows.map(r => r.status + '=' + r.pressed));

  c('DIST-21', 'errors', 'S1 scenario', 'no console errors',
    state.pageErrors.length === 0 && state.errors.length === 0,
    { pageErrors: state.pageErrors, errors: state.errors });

  await ctx.close();
}

// =====================================================================
// S2 - EMPTY + DEGENERATE STATES (F3.3)
// =====================================================================
async function s2_empty(browser) {
  section$('S2 EMPTY');

  // --- 0 items -------------------------------------------------------
  {
    const { ctx, page, state } = await newScenario(browser, { guestItems: [] });
    const s = await snap(page);

    c('DIST-30', 'zero items', 'empty state', 'keeps ONE empty track (no segments) and the message, instead of four zero rows',
      s.dist.barHidden === false && s.dist.legendHidden === true &&
      s.dist.emptyHidden === false && s.dist.segs.length === 0,
      { bar: s.dist.barHidden, legend: s.dist.legendHidden, empty: s.dist.emptyHidden, segs: s.dist.segs.length });

    c('DIST-31', 'zero items', 'bar label', 'says there is nothing to distribute',
      s.dist.barLabel === 'Ph\u00e2n b\u1ed1 tr\u1ea1ng th\u00e1i: ch\u01b0a c\u00f3 m\u00f3n n\u00e0o' &&
      s.dist.emptyText === 'Ch\u01b0a c\u00f3 m\u00f3n n\u00e0o \u0111\u1ec3 ph\u00e2n b\u1ed1.',
      { label: s.dist.barLabel, text: s.dist.emptyText });

    c('DIST-32', 'zero items', 'shares', 'no divide-by-zero: percentages stay finite and 0',
      await page.evaluate(() => {
        const out = [shareOf(0, 0), shareOf(1, 0), shareOf(0, 1), shareOf(3, 10)];
        return out.every(n => Number.isFinite(n) && !Number.isNaN(n));
      }), null);

    c('DIST-33', 'zero items', 'total', 'reads 0 m\u00f3n, never "NaN m\u00f3n"',
      s.dist.total === '0 m\u00f3n', s.dist.total);

    c('DIST-34', 'zero items', 'KPI band', 'all figures stay finite and the progress caption is the empty one',
      s.kpi.count === '0 m\u00f3n' && s.kpi.progress === '0%' &&
      s.kpi.caption === 'Ch\u01b0a c\u00f3 m\u00f3n n\u00e0o trong b\u1ed9 s\u01b0u t\u1eadp.' &&
      !/NaN/.test(JSON.stringify(s.kpi)),
      s.kpi);

    c('DIST-35', 'zero items', 'errors', 'no console errors', state.pageErrors.length === 0 && state.errors.length === 0,
      { pageErrors: state.pageErrors, errors: state.errors });

    await ctx.close();
  }

  // --- one item, and a status that is empty --------------------------
  {
    const one = distItems().filter(x => x.id === 'p1');
    const { ctx, page, state } = await newScenario(browser, { guestItems: one });
    const s = await snap(page);
    const kpiBefore = JSON.parse(JSON.stringify(s.kpi));

    c('DIST-36', 'degenerate', 'single purchased item', 'shares read 100% for the only status present',
      s.dist.rows.find(r => r.status === 'purchased').share === '100%' &&
      s.dist.rows.find(r => r.status === 'wish').share === '0%',
      s.dist.rows.map(r => r.status + '=' + r.share));

    c('DIST-37', 'degenerate', 'statuses with 0 items', 'still appear in the legend, so the four states are always discoverable',
      s.dist.rows.length === 4 && s.dist.rows.every(r => r.count === '0 m\u00f3n' || r.count === '1 m\u00f3n'),
      s.dist.rows.map(r => r.status + '=' + r.count));

    c('DIST-38', 'degenerate', 'statuses with 0 items', 'produce no bar segment (nothing invisible to read)',
      s.dist.segs.length === 1 && s.dist.segs[0].status === 'purchased',
      s.dist.segs);

    await clickDist(page, 'wish');
    await sleep(600);
    const t = await snap(page);

    c('DIST-39', 'degenerate', 'clicking an empty status', 'leaves every global KPI figure untouched',
      kpiOnly(t.kpi) === kpiOnly(kpiBefore),
      { before: kpiBefore, after: t.kpi });

    c('DIST-40', 'degenerate', 'clicking an empty status', 'tells the user there is nothing in that state',
      t.toast === 'Kh\u00f4ng c\u00f3 m\u00f3n n\u00e0o \u1edf tr\u1ea1ng th\u00e1i \u201cMu\u1ed1n mua\u201d.',
      t.toast);

    c('DIST-41', 'degenerate', 'errors', 'no console errors', state.pageErrors.length === 0 && state.errors.length === 0,
      { pageErrors: state.pageErrors, errors: state.errors });

    await ctx.close();
  }

  // --- legacy row with an unreadable status --------------------------
  {
    const legacy = distItems().concat([Object.assign({}, distItems()[0], {
      id: 'legacy-1', name: 'M\u00f3n c\u0169', status: 'khong-het-ton-tai', category: ''
    })]);
    const { ctx, page, state } = await newScenario(browser, { guestItems: legacy });
    const s = await snap(page);

    c('DIST-42', 'legacy status', 'an unreadable status', 'is not silently dropped: it is reported as one extra bucket',
      s.dist.total === '11 m\u00f3n' && s.dist.rows.length === 5,
      { total: s.dist.total, rows: s.dist.rows.map(r => r.status || 'other') });

    c('DIST-43', 'legacy status', 'the extra bucket', 'is a plain row, not a button, because no filter exists for it',
      (() => {
        const r = s.dist.rows[4];
        return r && r.staticRow === true && r.tag === 'SPAN' && r.pressed === null &&
          r.name === 'Ch\u01b0a x\u00e1c \u0111\u1ecbnh';
      })(),
      s.dist.rows[4]);

    c('DIST-44', 'legacy status', 'the bar', 'covers the whole collection including the unreadable row',
      s.dist.segs.map(x => x.grow).join(',') === '3,2,1,4,1',
      s.dist.segs.map(x => x.grow));

    c('DIST-45', 'legacy status', 'shares', 'are still taken from the full collection size',
      s.dist.rows.map(r => r.share).join(',') === '27%,18%,9%,36%,9%',
      s.dist.rows.map(r => r.share));

    c('DIST-46', 'legacy status', 'the four filterable rows', 'still work; the extra bucket is not clickable',
      await page.evaluate(() => {
        const other = document.querySelector('#dvDistLegend .dv-dist__item--static');
        const buttons = document.querySelectorAll('#dvDistLegend button.dv-dist__item');
        return !!other && other.tagName !== 'BUTTON' && buttons.length === 4;
      }), null);

    c('DIST-47', 'legacy status', 'errors', 'no console errors', state.pageErrors.length === 0 && state.errors.length === 0,
      { pageErrors: state.pageErrors, errors: state.errors });

    await ctx.close();
  }
}

// =====================================================================
// S3 - MOBILE LAYOUT (F3.3)
// =====================================================================
async function s3_mobile(browser) {
  section$('S3 MOBILE');
  for (const w of [320, 375, 430]) {
    const { ctx, page, state } = await newScenario(browser,
      { guestItems: distItems() }, { width: w, height: 880, isMobile: true, hasTouch: true });

    const geo = await page.evaluate(() => {
      const dist = document.getElementById('dvDist');
      const bar = document.getElementById('dvDistBar');
      const rows = [...document.querySelectorAll('#dvDistLegend .dv-dist__item')];
      const r = dist.getBoundingClientRect();
      const overflowing = rows.filter(x => x.getBoundingClientRect().right > window.innerWidth + 0.5);
      return {
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
        width: Math.round(r.width),
        barWidth: Math.round(bar.getBoundingClientRect().width),
        rowCount: rows.length,
        overflowing: overflowing.length,
        minRowHeight: Math.round(Math.min(...rows.map(x => x.getBoundingClientRect().height)))
      };
    });

    const tag = 'w' + w;
    c('DIST-M1-' + tag, 'layout ' + w, 'page', 'no horizontal overflow',
      geo.scrollWidth <= geo.innerWidth, { sw: geo.scrollWidth, iw: geo.innerWidth });

    c('DIST-M2-' + tag, 'layout ' + w, '.dv-dist', 'fits the viewport, keeps all four rows, and no row spills out',
      geo.width <= geo.innerWidth && geo.rowCount === 4 && geo.overflowing === 0 &&
      geo.barWidth <= geo.innerWidth,
      geo);

    c('DIST-M3-' + tag, 'layout ' + w, 'legend rows', 'stay at a comfortable tap height (>= 38px)',
      geo.minRowHeight >= 38, geo.minRowHeight);

    c('DIST-M4-' + tag, 'errors', 'layout ' + w, 'no console errors',
      state.pageErrors.length === 0 && state.errors.length === 0,
      { pageErrors: state.pageErrors, errors: state.errors });

    await ctx.close();
  }
}

// =====================================================================
// S4 - CATEGORY BREAKDOWN (F3.4)
// =====================================================================
async function s4_breakdown(browser) {
  section$('S4 BREAKDOWN');

  // --- top-6 + "Khác" ------------------------------------------------
  {
    const { ctx, page, state } = await newScenario(browser, { guestItems: catItems() });
    const s = await snap(page);
    const rows = s.breakdown.rows;

    c('BREAK-01', 'ranking', '.dv-breakdown rows', 'ranked by item count, descending',
      rows.map(r => r.name).join('|') === 'Alpha|Beta|Gamma|Delta|Epsilon|Zeta|Kh\u00e1c (2 danh m\u1ee5c)',
      rows.map(r => r.name));

    c('BREAK-02', 'ranking', '.dv-breakdown rows', 'at most six real categories, then one "Kh\u00e1c" aggregate',
      rows.length === 7 &&
      rows.slice(0, 6).every(r => r.category && !r.staticRow) &&
      rows[6].staticRow === true && !rows[6].category,
      rows.map(r => r.category || 'other'));

    c('BREAK-03', 'ranking', 'the aggregate', 'reports how many categories it folded together, and is not a button',
      rows[6].name === 'Kh\u00e1c (2 danh m\u1ee5c)' && rows[6].tag === 'DIV' &&
      rows[6].value === '3 m\u00f3n',
      rows[6]);

    c('BREAK-04', 'values', 'row values', 'are text ("N m\u00f3n"), not only bar length',
      rows.map(r => r.value).join(',') === '8 m\u00f3n,7 m\u00f3n,6 m\u00f3n,5 m\u00f3n,4 m\u00f3n,3 m\u00f3n,3 m\u00f3n',
      rows.map(r => r.value));

    c('BREAK-05', 'values', 'bar fill', 'is the share of the whole collection (8/36 -> 22%), not of the largest row',
      rows.map(r => r.fill).join(',') === '22%,19%,17%,14%,11%,8%,8%',
      rows.map(r => r.fill));

    c('BREAK-06', 'structure', 'row elements', 'every filterable row is a real <button>',
      rows.filter(r => !r.staticRow).every(r => r.tag === 'BUTTON'),
      rows.map(r => r.tag));

    // F3.6 — now that the length is a transform, prove the rendered geometry
    // really follows the data: every bar is drawn, at most full length, and
    // the drawn lengths are ordered exactly like the counts.
    c('BREAK-07', 'motion', 'bar geometry', 'is drawn with transform:scaleX (not width) at the row\'s real share',
      rows.every(r => r.fillScale !== null && r.fillScale > 0 && r.fillScale <= 1) &&
      rows.every((r, i) => i === 0 || rows[i - 1].fillScale >= r.fillScale),
      rows.map(r => r.fill + '/' + r.fillScale));

    c('BREAK-08', 'errors', 'S4 scenario', 'no console errors',
      state.pageErrors.length === 0 && state.errors.length === 0,
      { pageErrors: state.pageErrors, errors: state.errors });

    await ctx.close();
  }

  // --- "Chưa phân loại" as a real select option ----------------------
  {
    const { ctx, page, state } = await newScenario(browser, { guestItems: distItems() });
    const s = await snap(page);
    const rows = s.breakdown.rows;
    const uncat = rows.find(r => r.name === 'Ch\u01b0a ph\u00e2n lo\u1ea1i');
    const opt = s.categoryOptions.find(o => o.label === 'Ch\u01b0a ph\u00e2n lo\u1ea1i');

    c('BREAK-10', 'uncategorised', 'items with no category', 'fold into one "Ch\u01b0a ph\u00e2n lo\u1ea1i" bucket, ranked with the rest',
      !!uncat && uncat.value === '2 m\u00f3n' &&
      rows.map(r => r.name).join('|') === 'Nh\u00f3m A|Ch\u01b0a ph\u00e2n lo\u1ea1i|Nh\u00f3m B',
      rows.map(r => r.name + '=' + r.value));

    c('BREAK-11', 'uncategorised', '#fCategoryFilter', 'offers the same bucket as a real option, so the dashboard uses the existing filter',
      !!opt && opt.value === uncat.category && opt.value === '__uncategorised__',
      { option: opt, row: uncat && uncat.category });

    const before = JSON.parse(JSON.stringify(s.kpi));
    await clickBreakdown(page, uncat.category);
    await sleep(600);
    const t = await snap(page);

    c('BREAK-12', 'uncategorised', 'clicking it', 'shows exactly the uncategorised items',
      t.filters.category === '__uncategorised__' &&
      t.cardIds.slice().sort().join(',') === 'p3,p4',
      { filter: t.filters.category, ids: t.cardIds });

    c('BREAK-13', 'uncategorised', 'clicking it', 'marks only that row as the active filter',
      t.breakdown.rows.filter(r => r.pressed === 'true').map(r => r.name).join(',') === 'Ch\u01b0a ph\u00e2n lo\u1ea1i',
      t.breakdown.rows.map(r => r.name + '=' + r.pressed));

    c('BREAK-14', 'invariants', 'dashboard click', 'leaves every global KPI untouched',
      kpiOnly(t.kpi) === kpiOnly(before), { before, after: t.kpi });

    await clickBreakdown(page, uncat.category);
    await sleep(500);
    const t2 = await snap(page);
    c('BREAK-15', 'uncategorised', 'clicking again', 'clears the filter',
      t2.filters.category === '' && t2.cardCount === 10,
      { filter: t2.filters.category, cards: t2.cardCount });

    // A named category behaves the same way.
    await clickBreakdown(page, 'Nh\u00f3m B');
    await sleep(600);
    const t3 = await snap(page);
    c('BREAK-16', 'named category', 'clicking a category', 'sets the existing category filter and shows its items',
      t3.filters.category === 'Nh\u00f3m B' && t3.cardIds.slice().sort().join(',') === 'p1,p2',
      { filter: t3.filters.category, ids: t3.cardIds });

    c('BREAK-17', 'named category', 'the select', 'keeps the filter the dashboard applied (no second mechanism)',
      await page.evaluate(() => document.getElementById('fCategoryFilter').value) === 'Nh\u00f3m B',
      null);

    c('BREAK-18', 'errors', 'S4 scenario', 'no console errors',
      state.pageErrors.length === 0 && state.errors.length === 0,
      { pageErrors: state.pageErrors, errors: state.errors });

    await ctx.close();
  }

  // --- degenerate ----------------------------------------------------
  {
    const { ctx, page } = await newScenario(browser, { guestItems: [] });
    const s = await snap(page);
    c('BREAK-20', 'degenerate', 'zero items', 'the block is hidden, not left as an empty shell',
      s.breakdown.hidden === true && s.breakdown.rows.length === 0 &&
      s.priority.hidden === true && s.priority.rows.length === 0,
      { breakdown: s.breakdown.hidden, priority: s.priority.hidden });
    await ctx.close();
  }

  {
    const one = catItems().filter(x => x.category === 'Alpha');
    const { ctx, page } = await newScenario(browser, { guestItems: one });
    const s = await snap(page);
    c('BREAK-21', 'degenerate', 'one category', 'the only bar reads 100%',
      s.breakdown.rows.length === 1 && s.breakdown.rows[0].fill === '100%',
      s.breakdown.rows);
    await ctx.close();
  }
}

// =====================================================================
// S5 - PRIORITY WIDGET (F3.4)
// =====================================================================
async function s5_priority(browser) {
  section$('S5 PRIORITY');
  const { ctx, page, state } = await newScenario(browser, { guestItems: prioItems() });
  const s = await snap(page);
  const rows = s.priority.rows;
  const byKey = (k) => rows.find(r => r.priority === k);

  const m3000 = await page.evaluate(() => fmtMoney(3000000));
  const m1000 = await page.evaluate(() => fmtMoney(1000000));
  const m0 = await page.evaluate(() => fmtMoney(0));
  // The snapshot collapses whitespace, and fmtMoney uses a non-breaking space,
  // so the "as rendered" expectations need the same treatment.
  const normText = (s) => String(s).replace(/\s+/g, ' ').trim();

  c('PRIO-01', 'structure', '.dv-priority rows', 'three chips, in low -> medium -> high order, all real buttons',
    rows.map(r => r.priority).join(',') === 'low,medium,high' && rows.every(r => r.tag === 'BUTTON'),
    rows.map(r => r.tag + ':' + r.priority));

  c('PRIO-02', 'structure', 'chip text', 'shows both the count and the pending value as text',
    byKey('medium').count === '3 m\u00f3n' &&
    byKey('medium').value === normText(m3000 + ' ch\u01b0a mua') &&
    byKey('low').count === '2 m\u00f3n' &&
    byKey('low').value === normText(m1000 + ' ch\u01b0a mua'),
    rows.map(r => [r.priority, r.count, r.value]));

  c('PRIO-03', 'a11y', 'accessible name', 'reads "\u01afu ti\u00ean {label}: {count} m\u00f3n, {money}"',
    byKey('medium').label === '\u01afu ti\u00ean Trung b\u00ecnh: 3 m\u00f3n, ' + m3000 &&
    byKey('high').label === '\u01afu ti\u00ean Cao: 0 m\u00f3n, ' + m0,
    rows.map(r => r.label));

  c('PRIO-04', 'emphasis', 'the highest rank PRESENT', 'gets the accent outline - "Cao" is empty here, so "Trung b\u00ecnh" takes it',
    byKey('medium').emphasis === 'true' &&
    byKey('high').emphasis === null && byKey('low').emphasis === null,
    rows.map(r => r.priority + '=' + r.emphasis));

  c('PRIO-05', 'states', 'a priority with no items', 'is aria-disabled (still readable by keyboard) and cannot be activated',
    byKey('high').disabled === 'true' && byKey('medium').disabled === null &&
    byKey('low').disabled === null,
    rows.map(r => r.priority + '=' + r.disabled));

  c('PRIO-06', 'values', 'bar length', 'is the pending value relative to the largest pending value',
    byKey('medium').fill === '100%' && byKey('low').fill === '33%' && byKey('high').fill === '0%',
    rows.map(r => r.priority + '=' + r.fill));

  // F3.6 — the same rendered-geometry proof as the breakdown panel.
  c('PRIO-06b', 'motion', 'bar geometry', 'is drawn with transform:scaleX, full for the largest and empty for a zero one',
    byKey('medium').fillScale === 1 &&
    byKey('low').fillScale > 0 && byKey('low').fillScale < 0.4 &&
    byKey('high').fillScale === 0,
    rows.map(r => r.priority + '=' + r.fillScale));

  // A priority whose items have all been bought already.
  {
    const allBought = prioItems().map(it => it.priority === 'medium'
      ? Object.assign({}, it, {
        status: 'purchased', paidAmount: 100, purchasedAt: 1750000000000, previousStatus: 'wish'
      })
      : it);
    const { ctx, page } = await newScenario(browser, { guestItems: allBought });
    const t = await snap(page);
    const med = t.priority.rows.find(r => r.priority === 'medium');
    c('PRIO-07', 'values', 'a priority with items but no pending value', 'says so in words instead of showing a bare 0',
      med.value === 'Kh\u00f4ng c\u00f2n gi\u00e1 tr\u1ecb ch\u01b0a mua' && med.fill === '0%' &&
      med.count === '3 m\u00f3n',
      med);
    await ctx.close();
  }

  // --- interaction ---------------------------------------------------
  const before = JSON.parse(JSON.stringify(s.kpi));

  await clickPriority(page, 'high');
  await sleep(500);
  let t = await snap(page);
  c('PRIO-08', 'interaction', 'clicking an aria-disabled chip', 'does nothing at all',
    t.filters.priority === '' && t.cardCount === 5 && t.toast === null,
    { filter: t.filters.priority, cards: t.cardCount, toast: t.toast });

  await clickPriority(page, 'medium');
  await sleep(700);
  t = await snap(page);
  c('PRIO-09', 'interaction', 'clicking a chip', 'sets the existing priority filter and shows exactly those items',
    t.filters.priority === 'medium' && t.cardIds.slice().sort().join(',') === 'm1,m2,m3',
    { filter: t.filters.priority, ids: t.cardIds });

  c('PRIO-10', 'interaction', 'clicking a chip', 'marks only that chip as pressed',
    t.priority.rows.filter(r => r.pressed === 'true').map(r => r.priority).join(',') === 'medium',
    t.priority.rows.map(r => r.priority + '=' + r.pressed));

  c('PRIO-11', 'invariants', 'clicking a chip', 'leaves every global KPI untouched',
    kpiOnly(t.kpi) === kpiOnly(before), { before, after: t.kpi });

  await clickPriority(page, 'medium');
  await sleep(500);
  t = await snap(page);
  c('PRIO-12', 'interaction', 'clicking again', 'clears the filter',
    t.filters.priority === '' && t.cardCount === 5,
    { filter: t.filters.priority, cards: t.cardCount });

  // The select and the chips share one source of truth.
  await page.evaluate(() => {
    const el = document.getElementById('fPriority');
    el.value = 'low';
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await sleep(400);
  t = await snap(page);
  c('PRIO-13', 'interaction', 'changing #fPriority directly', 'the chips follow the select',
    t.priority.rows.filter(r => r.pressed === 'true').map(r => r.priority).join(',') === 'low',
    t.priority.rows.map(r => r.priority + '=' + r.pressed));

  c('PRIO-14', 'errors', 'S5 scenario', 'no console errors',
    state.pageErrors.length === 0 && state.errors.length === 0,
    { pageErrors: state.pageErrors, errors: state.errors });

  await ctx.close();
}

// =====================================================================
// S6 - MOBILE LAYOUT FOR THE INSIGHT PANELS (F3.4)
// =====================================================================
async function s6_mobile_insight(browser) {
  section$('S6 MOBILE-INSIGHT');
  for (const w of [320, 375, 430]) {
    const { ctx, page, state } = await newScenario(browser,
      { guestItems: catItems() }, { width: w, height: 900, isMobile: true, hasTouch: true });

    const geo = await page.evaluate(() => {
      const boxes = ['dvBreakdown', 'dvPriority'].map(id => document.getElementById(id).getBoundingClientRect());
      const rows = [...document.querySelectorAll('#dvBreakdownRows .dv-breakdown__row, #dvPriorityRows .dv-priority__item')];
      const spill = rows.filter(r => r.getBoundingClientRect().right > window.innerWidth + 0.5);
      return {
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
        maxPanelWidth: Math.round(Math.max(...boxes.map(b => b.width))),
        rowCount: rows.length,
        spill: spill.length,
        minRowHeight: Math.round(Math.min(...rows.map(r => r.getBoundingClientRect().height)))
      };
    });

    const tag = 'w' + w;
    c('INS-M1-' + tag, 'layout ' + w, 'page', 'no horizontal overflow',
      geo.scrollWidth <= geo.innerWidth, { sw: geo.scrollWidth, iw: geo.innerWidth });

    c('INS-M2-' + tag, 'layout ' + w, '.dv-breakdown + .dv-priority', 'fit the viewport and stack in one column without spilling',
      geo.maxPanelWidth <= geo.innerWidth && geo.spill === 0 && geo.rowCount === 10,
      geo);

    c('INS-M3-' + tag, 'layout ' + w, 'rows', 'stay at a comfortable tap height (>= 38px)',
      geo.minRowHeight >= 38, geo.minRowHeight);

    c('INS-M4-' + tag, 'errors', 'layout ' + w, 'no console errors',
      state.pageErrors.length === 0 && state.errors.length === 0,
      { pageErrors: state.pageErrors, errors: state.errors });

    await ctx.close();
  }
}

// =====================================================================
// S7 - QUICK ACTIONS (F3.5)
// =====================================================================
async function s7_actions(browser) {
  section$('S7 ACTIONS');
  const { ctx, page, state } = await newScenario(browser, { guestItems: prioItems() });
  let s = await snap(page);

  const btn = (id) => s.actions.buttons.find(b => b.id === id);
  const REQUIRED = [
    ['dvActionAdd', 'Thêm món mới'],
    ['dvActionPending', 'Xem món chưa mua'],
    ['dvActionOwned', 'Xem món đã mua'],
    ['dvActionHigh', 'Xem món ưu tiên cao'],
    ['dvActionClear', 'Xóa bộ lọc'],
    ['dvActionExport', 'Xuất JSON'],
    ['dvActionImport', 'Nhập JSON']
  ];

  // --- structure -----------------------------------------------------
  c('ACT-01', 'structure', '.dv-actions', 'offers exactly the seven contracted actions',
    REQUIRED.every(([id, label]) => {
      const b = btn(id);
      return b && b.text.indexOf(label) >= 0;
    }),
    s.actions.buttons.map(b => b.id + '=' + b.text));

  c('ACT-02', 'structure', 'action elements', 'every one is a real <button> with a visible text label (no icon-only control)',
    s.actions.buttons.filter(b => !b.hidden).every(b => b.tag === 'BUTTON' && b.text.length > 0),
    s.actions.buttons.map(b => b.tag + ':' + b.text));

  c('ACT-03', 'a11y', 'the primary action', 'says what it does in words, and its + mark is decorative only',
    btn('dvActionAdd').text.indexOf('Thêm món mới') >= 0 &&
    await page.evaluate(() => {
      const g = document.querySelector('#dvActionAdd .dv-actions__glyph');
      return !!g && g.getAttribute('aria-hidden') === 'true';
    }),
    btn('dvActionAdd').text);

  // --- add item delegates to the one existing form -------------------
  await clickId(page, 'dvActionAdd');
  await sleep(500);
  let t = await snap(page);

  c('ACT-04', 'add', 'Thêm món mới', 'opens the existing add form (not a copy of it)',
    t.dlg.open === true && t.dlg.title === 'Thêm món' && t.dlg.fId === '',
    t.dlg);

  c('ACT-05', 'add', 'Thêm món mới', 'creates nothing on its own',
    t.itemCount === 5 && t.dlg.focused === 'fName',
    { items: t.itemCount, focused: t.dlg.focused });

  await page.keyboard.press('Escape');
  await sleep(350);

  // --- view filters --------------------------------------------------
  const kpiBefore = JSON.parse(JSON.stringify((await snap(page)).kpi));
  const itemsBefore = JSON.stringify((await snap(page)).items);

  // Leave a contradictory filter behind first, so the absolute-intent
  // behaviour of a quick action is actually exercised.
  await setStatusFilter(page, 'purchased');
  await sleep(350);

  await clickId(page, 'dvActionPending');
  await sleep(700);
  t = await snap(page);

  c('ACT-06', 'view', 'Xem món chưa mua', 'selects the existing Chưa mua tab and shows only unpurchased items',
    t.tabs.pending === 'true' && t.tabs.all === 'false' &&
    t.cardIds.slice().sort().join(',') === 'l1,l2,m1,m2',
    { tabs: t.tabs, ids: t.cardIds });

  c('ACT-07', 'view', 'Xem món chưa mua', 'clears a leftover status filter that would have contradicted the button',
    t.filters.status === '', t.filters);

  c('ACT-08', 'invariants', 'a view action', 'leaves every global KPI untouched',
    kpiOnly(t.kpi) === kpiOnly(kpiBefore), { before: kpiBefore, after: t.kpi });

  c('ACT-09', 'a11y', 'a view action', 'moves focus to the collection',
    t.focusIsCollection === true, t.focusIsCollection);

  await clickId(page, 'dvActionOwned');
  await sleep(700);
  t = await snap(page);
  c('ACT-10', 'view', 'Xem món đã mua', 'selects the Đã mua tab and shows only purchased items',
    t.tabs.owned === 'true' && t.cardIds.slice().join(',') === 'm3',
    { tabs: t.tabs, ids: t.cardIds });

  await clickId(page, 'dvActionHigh');
  await sleep(700);
  t = await snap(page);
  c('ACT-11', 'view', 'Xem món ưu tiên cao', 'sets the existing priority filter to high',
    t.filters.priority === 'high', t.filters);

  c('ACT-12', 'view', 'Xem món ưu tiên cao', 'with no high-priority item: no results, and it says so',
    t.cardCount === 0 && t.toast.indexOf('Không có món nào ở mức ưu tiên') === 0,
    { cards: t.cardCount, toast: t.toast });

  await clickId(page, 'dvActionClear');
  await sleep(700);
  t = await snap(page);
  c('ACT-13', 'clear', 'Xóa bộ lọc', 'clears every filter through the same clear button the toolbar already uses',
    t.filters.status === '' && t.filters.priority === '' && t.filters.category === '' &&
    t.tabs.all === 'true' && t.cardCount === 5,
    { filters: t.filters, tabs: t.tabs, cards: t.cardCount });

  c('ACT-14', 'clear', 'Xóa bộ lọc', 'leaves the search box alone (that is a deliberate query, not a filter)',
    t.filters.q === '', t.filters.q);

  c('ACT-15', 'invariants', 'every view + clear action', 'never edited an item',
    JSON.stringify(t.items) === itemsBefore, { changed: JSON.stringify(t.items) !== itemsBefore });

  c('ACT-16', 'invariants', 'every view + clear action', 'never changed a global KPI',
    kpiOnly(t.kpi) === kpiOnly(kpiBefore), { before: kpiBefore, after: t.kpi });

  // --- export delegates to the existing handler ----------------------
  await clickId(page, 'dvActionExport');
  await sleep(600);
  t = await snap(page);
  c('ACT-17', 'export', 'Xuất JSON', 'runs the existing export handler (its own toast, its own file)',
    t.toast.indexOf('Đã xuất') === 0 && t.toast.indexOf('ra tệp JSON.') > 0, t.toast);

  c('ACT-18', 'export', 'Xuất JSON', 'created no item and wrote no storage',
    t.itemCount === 5 && JSON.stringify(t.items) === itemsBefore, { items: t.itemCount });

  // --- import delegates to the existing file input -------------------
  let chooserOpened = false;
  try {
    const [chooser] = await Promise.all([
      page.waitForFileChooser({ timeout: 6000 }),
      clickId(page, 'dvActionImport')
    ]);
    chooserOpened = !!chooser;
    await chooser.cancel();
  } catch (e) {
    chooserOpened = false;
  }
  c('ACT-19', 'import', 'Nhập JSON', 'opens the existing #importFile picker instead of re-implementing import',
    chooserOpened === true, chooserOpened);

  // --- the purchase short-cut is never one-click ---------------------
  t = await snap(page);
  const buy = t.actions.buttons.find(b => b.id === 'dvActionBuy');
  c('ACT-20', 'purchase', 'the purchase short-cut', 'is visible and names the exact item it would mark',
    buy && buy.hidden === false &&
    buy.text === 'Đánh dấu đã mua' &&
    buy.ariaLabel.indexOf('Đánh dấu đã mua: ') === 0 &&
    t.actions.noteHidden === false &&
    t.actions.note.indexOf('Gợi ý tiếp theo: ') === 0,
    { buy, note: t.actions.note });

  // prioItems has no high row, so the suggestion must be the highest
  // priority that is actually unpurchased: medium.
  c('ACT-21', 'purchase', 'the suggestion', 'never points at an item that is already bought',
    await page.evaluate(() => {
      const x = highestPriorityPending();
      return !!x && x.status !== 'purchased' && x.priority === 'medium';
    }), null);

  await clickId(page, 'dvActionBuy');
  await sleep(600);
  t = await snap(page);

  c('ACT-22', 'purchase', 'clicking the purchase short-cut', 'does NOT buy: it opens the F2 confirmation dialog',
    t.pd.open === true && t.items.find(i => i.id === 'm2').status !== 'purchased',
    { pd: t.pd.open, m2: t.items.find(i => i.id === 'm2').status });

  c('ACT-23', 'purchase', 'the confirmation dialog', 'arrives empty, so the user still chooses the amount and date',
    t.pd.amount === '', t.pd);

  await page.evaluate(() => {
    const el = document.getElementById('pdAmount');
    el.value = '1990000';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    const dd = document.getElementById('pdDate');
    if (dd) {
      dd.value = '2026-05-20';
      dd.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
  await clickId(page, 'pdConfirm');
  await sleep(700);
  t = await snap(page);

  c('ACT-24', 'purchase', 'confirming', 'is the only way an item becomes purchased',
    t.pd.open === false && (() => {
      const i = t.items.find(x => x.id === 'm2');
      return i.status === 'purchased' && i.paidAmount === 1990000;
    })(),
    t.items.find(x => x.id === 'm2'));

  c('ACT-25', 'purchase', 'after the purchase', 'the suggestion advances to the next item',
    t.actions.buttons.find(b => b.id === 'dvActionBuy').hidden === false &&
    t.actions.note !== s.actions.note,
    { before: s.actions.note, after: t.actions.note });

  c('ACT-26', 'errors', 'S7 scenario', 'no console errors',
    state.pageErrors.length === 0 && state.errors.length === 0,
    { pageErrors: state.pageErrors, errors: state.errors });

  await ctx.close();

  // --- no pending item => the short-cut withdraws --------------------
  {
    const allBought = prioItems().map(it => Object.assign({}, it, {
      status: 'purchased', paidAmount: 100000, purchasedAt: 1750000000000, previousStatus: 'wish'
    }));
    const empty = await newScenario(browser, { guestItems: allBought });
    const t2 = await snap(empty.page);

    c('ACT-27', 'purchase', 'with nothing left to buy', 'the short-cut hides itself rather than failing on click',
      t2.actions.buttons.find(b => b.id === 'dvActionBuy').hidden === true &&
      t2.actions.noteHidden === true,
      t2.actions.buttons.filter(b => b.id === 'dvActionBuy'));

    c('ACT-28', 'errors', 'S7 empty-purchase scenario', 'no console errors',
      empty.state.pageErrors.length === 0 && empty.state.errors.length === 0,
      { pageErrors: empty.state.pageErrors, errors: empty.state.errors });

    await empty.ctx.close();
  }
}

// =====================================================================
// S8 - MOTION (F3.6)
// ---------------------------------------------------------------------
// Proves the two things the brief actually asks for and can be measured:
// the sections still use the V16 reveal, and a data change is expressed
// with opacity/transform only - no fake counting, no layout animation.
// =====================================================================
// Runs inside the page: push one item, re-render, and report what the KPI
// value and the chart did in the very same frame.
const MOT_APPLY = () => {
  items.push({
    id: 'mot-probe', name: 'Món đo chuyển động', price: 1000, image: '', link: '',
    status: 'wish', priority: 'medium', category: '', note: '',
    createdAt: Date.now()
  });
  renderImmediately();
  const el = document.getElementById('sumCount');
  const anims = (el.getAnimations ? el.getAnimations() : []).filter(a => a.playState === 'running');
  const props = [];
  anims.forEach(a => {
    const kfs = (a.effect && a.effect.getKeyframes) ? a.effect.getKeyframes() : [];
    kfs.forEach(k => Object.keys(k).forEach(n => { if (props.indexOf(n) < 0) props.push(n); }));
  });
  const bar = document.querySelector('#dvBreakdownRows .dv-breakdown__bar-fill');
  const scale = (() => {
    if (!bar) return null;
    const t = getComputedStyle(bar).transform;
    if (!t || t === 'none') return 1;
    const open = t.indexOf('(');
    const comma = t.indexOf(',', open);
    return (open < 0 || comma < 0) ? null : Number(t.slice(open + 1, comma));
  })();
  return {
    before: null,
    after: el.textContent,
    real: items.length,
    animated: anims.length,
    props,
    scale,
    motionClass: document.documentElement.classList.contains('dv-motion')
  };
};

const MOT_BASELINE = () => {
  const el = document.getElementById('sumCount');
  return { text: el.textContent, real: items.length };
};

const motionStyleProbe = () => {
  const pick = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const cs = getComputedStyle(el);
    return {
      property: cs.transitionProperty,
      duration: cs.transitionDuration,
      reveal: el.hasAttribute('data-dv-section')
    };
  };
  return {
    barFill: pick('.dv-breakdown__bar-fill'),
    seg: pick('.dv-dist__seg'),
    action: pick('.dv-actions__btn'),
    progress: pick('#dvProgressFill'),
    panelReveal: (() => {
      const p = document.querySelector('.dashboard-panel');
      if (!p) return null;
      return { reveal: p.hasAttribute('data-dv-section'), opacity: getComputedStyle(p).opacity };
    })()
  };
};

async function s8_motion(browser) {
  section$('S8 MOTION');

  // --- motion allowed -------------------------------------------------
  {
    const { ctx, page, state } = await newScenario(browser, { guestItems: distItems() });
    const base = await page.evaluate(MOT_BASELINE);
    const probe = await page.evaluate(MOT_APPLY);

    c('MOT-01', 'kpi', 'adding an item', 'shows the final number in the same frame - there is no count-up animation',
      probe.after !== base.text && probe.after === probe.real + ' món' && probe.real === base.real + 1,
      { before: base.text, after: probe.after, real: probe.real });

    c('MOT-02', 'kpi', 'the KPI transition', 'touches opacity and transform only, never the content',
      probe.animated > 0 &&
      probe.props.indexOf('transform') >= 0 && probe.props.indexOf('opacity') >= 0 &&
      probe.props.every(p => ['opacity', 'transform', 'offset', 'computedOffset', 'easing', 'composite'].indexOf(p) >= 0),
      { animated: probe.animated, props: probe.props });

    c('MOT-03', 'chart', 'the breakdown bars', 'are redrawn at the new share immediately',
      probe.scale !== null && probe.scale > 0 && probe.scale <= 1,
      { scale: probe.scale });

    const styles = await page.evaluate(motionStyleProbe);

    c('MOT-04', 'chart', '.dv-breakdown__bar-fill', 'animates transform, not width, so no layout runs per frame',
      styles.barFill && styles.barFill.property.indexOf('transform') >= 0 &&
      styles.barFill.property.indexOf('width') < 0,
      styles.barFill);

    c('MOT-05', 'chart', '.dv-dist__seg', 'does not animate its flex-grow (the length is the data)',
      styles.seg && styles.seg.property.indexOf('flex-grow') < 0,
      styles.seg);

    c('MOT-06', 'chart', '#dvProgressFill', 'keeps the documented width transition of the V16 progress bar',
      styles.progress && styles.progress.property.indexOf('width') >= 0,
      styles.progress);

    c('MOT-07', 'reveal', 'with motion allowed', 'the V16 section reveal is active',
      probe.motionClass === true && styles.panelReveal !== null,
      { motionClass: probe.motionClass, panel: styles.panelReveal });

    c('MOT-08', 'action', '.dv-actions__btn', 'has a transition when motion is allowed',
      styles.action && styles.action.duration !== '0s',
      styles.action);

    c('MOT-09', 'errors', 'S8 scenario', 'no console errors',
      state.pageErrors.length === 0 && state.errors.length === 0,
      { pageErrors: state.pageErrors, errors: state.errors });

    await ctx.close();
  }

  // --- motion reduced -------------------------------------------------
  {
    const { ctx, page, state } = await newScenario(browser, { guestItems: distItems() }, { reducedMotion: true });
    const base = await page.evaluate(MOT_BASELINE);
    const probe = await page.evaluate(MOT_APPLY);
    const styles = await page.evaluate(motionStyleProbe);

    c('MOT-10', 'reduced', 'a data change', 'creates no animation at all',
      probe.animated === 0, { animated: probe.animated, props: probe.props });

    c('MOT-11', 'reduced', 'data still updates', 'the number and the bar are correct even with motion off',
      probe.after === probe.real + ' món' && probe.real === base.real + 1 &&
      probe.scale !== null && probe.scale > 0 && probe.scale <= 1,
      { after: probe.after, real: probe.real, scale: probe.scale });

    c('MOT-12', 'reduced', 'the reveal decoration', 'is switched off entirely',
      probe.motionClass === false, { motionClass: probe.motionClass });

    c('MOT-13', 'reduced', '.dv-actions__btn', 'has no transition',
      styles.action && styles.action.duration === '0s',
      styles.action);

    c('MOT-14', 'reduced', '.dv-breakdown__bar-fill', 'has no transition',
      styles.barFill && styles.barFill.duration === '0s',
      styles.barFill);

    c('MOT-15', 'reduced', 'the dashboard panel', 'is fully visible and not staged for a reveal',
      styles.panelReveal !== null && Number(styles.panelReveal.opacity) === 1,
      styles.panelReveal);

    c('MOT-16', 'errors', 'S8 reduced-motion scenario', 'no console errors',
      state.pageErrors.length === 0 && state.errors.length === 0,
      { pageErrors: state.pageErrors, errors: state.errors });

    await ctx.close();
  }
}

// =====================================================================
// S9 - ACCESSIBILITY (F3.6)
// =====================================================================
const A11Y_CONTRAST = () => {
  const parse = (c) => {
    if (!c || c.indexOf('rgb') !== 0) return null;
    const inner = c.slice(c.indexOf('(') + 1, c.indexOf(')'));
    const p = inner.split(',').map(x => Number(x.trim()));
    if (p.length < 3 || p.some(n => !Number.isFinite(n))) return null;
    return { rgb: [p[0], p[1], p[2]], a: p.length > 3 ? p[3] : 1 };
  };
  const lin = (v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const lum = (rgb) => 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);

  const opaqueBg = (el) => {
    let n = el;
    while (n && n.nodeType === 1) {
      const cs = getComputedStyle(n);
      // A gradient is painted on top of the background colour and cannot be
      // sampled from computed style, so say so instead of guessing wrong.
      if (cs.backgroundImage && cs.backgroundImage !== 'none') return null;
      const bg = parse(cs.backgroundColor);
      if (bg && bg.a >= 0.999) return bg.rgb;
      n = n.parentElement;
    }
    return [255, 255, 255];
  };

  const ratio = (el) => {
    const fg = parse(getComputedStyle(el).color);
    const bg = opaqueBg(el);
    if (!fg || !bg) return null;
    const a = lum(fg.rgb);
    const b = lum(bg);
    const hi = Math.max(a, b);
    const lo = Math.min(a, b);
    return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
  };

  const coloursIn = (s) => {
    const out = [];
    let i = 0;
    while (i < s.length) {
      const j = s.indexOf('rgb', i);
      if (j < 0) break;
      const open = s.indexOf('(', j);
      const close = s.indexOf(')', open);
      if (open < 0 || close < 0) break;
      const p = s.slice(open + 1, close).split(',').map(x => Number(x.trim()));
      if (p.length >= 3 && p.slice(0, 3).every(n => Number.isFinite(n))) {
        out.push({ rgb: p.slice(0, 3), a: p.length > 3 ? p[3] : 1 });
      }
      i = close + 1;
    }
    return out;
  };

  // Worst-case contrast of white text over a gradient card: every colour stop
  // is composited with the strongest white glow painted over the gradient.
  const worstTextRatio = (card) => {
    if (!card) return null;
    const cols = coloursIn(getComputedStyle(card).backgroundImage);
    const stops = cols.filter(c => c.a >= 0.999);
    if (!stops.length) return null;
    const glow = cols
      .filter(c => c.a < 0.999 && c.rgb.every(v => v >= 200))
      .reduce((m, c) => Math.max(m, c.a), 0);
    const label = card.querySelector('.stat-card__label') || card;
    const fg = parse(getComputedStyle(label).color) || { rgb: [255, 255, 255], a: 1 };

    let worst = Infinity;
    stops.forEach(s => {
      const base = [0, 1, 2].map(i => (1 - glow) * s.rgb[i] + glow * 255);
      const txt = [0, 1, 2].map(i => (1 - fg.a) * base[i] + fg.a * fg.rgb[i]);
      const a = lum(txt);
      const b = lum(base);
      const hi = Math.max(a, b);
      const lo = Math.min(a, b);
      worst = Math.min(worst, (hi + 0.05) / (lo + 0.05));
    });
    return Math.round(worst * 100) / 100;
  };

  const out = {};
  const targets = {
    kpiValue2: '.stats-dashboard > .stat-card:nth-child(2) .stat-card__value',
    metricLabel: '.dv-metrics__label',
    metricHint: '.dv-metrics__hint',
    progressCaption: '.dv-progress__caption',
    distShare: '.dv-dist__share',
    breakdownValue: '.dv-breakdown__value',
    breakdownName: '.dv-breakdown__name',
    priorityValue: '.dv-priority__value',
    actionLead: '.dv-actions__lead',
    actionNote: '.dv-actions__note',
    actionButton: '.dv-actions__btn',
    emptyTitle: '#emptyTitle'
  };

  Object.keys(targets).forEach(k => {
    const el = document.querySelector(targets[k]);
    out[k] = el ? ratio(el) : null;
  });

  // The dominant KPI card is a gradient, so it gets the worst-case gradient
  // maths instead of a computed-style guess.
  out.kpiGradient = worstTextRatio(document.querySelector('.stats-dashboard > .stat-card'));

  const empty = document.getElementById('emptyAction');
  out.emptyAction = empty ? ratio(empty) : null;
  out.emptyActionFont = empty ? (getComputedStyle(empty).fontSize + '/' + getComputedStyle(empty).fontWeight) : null;

  // Interactive elements inside the dashboard must be real buttons.
  const dash = document.querySelector('.dashboard-panel');
  const interactive = dash ? [...dash.querySelectorAll('button, [role="button"], a, [tabindex]')] : [];
  out.clickableDivs = interactive
    .filter(el => el.getAttribute('role') === 'button' && el.tagName !== 'BUTTON')
    .map(el => el.tagName + '.' + (el.className || ''));
  out.dashboardControls = interactive.length;
  out.nameless = interactive
    .filter(el => el.tagName === 'BUTTON')
    .filter(el => {
      const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
      return !t && !el.getAttribute('aria-label') && !el.getAttribute('title');
    })
    .map(el => el.id || el.className);

  // Target size of the new controls.
  const small = [];
  ['.dv-dist__item', '.dv-breakdown__row', '.dv-priority__item', '.dv-actions__btn'].forEach(sel => {
    document.querySelectorAll(sel).forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.height > 0 && r.height < 24) small.push(sel + ':' + Math.round(r.height));
    });
  });
  out.smallTargets = small;

  // Each new control must be reachable by keyboard.
  const unfocusable = [];
  ['.dv-dist__item', '.dv-breakdown__row', '.dv-priority__item', '.dv-actions__btn', '.dv-add']
    .forEach(sel => {
      document.querySelectorAll(sel).forEach(el => {
        el.focus();
        if (document.activeElement !== el) unfocusable.push(sel);
      });
    });
  out.unfocusable = unfocusable;

  // focus-visible rules must exist for the new controls.
  const wanted = ['.dv-actions__btn', '.dv-breakdown__row', '.dv-priority__item', '.dv-dist__item', '.dv-add'];
  const withFocusRing = {};
  wanted.forEach(w => { withFocusRing[w] = false; });
  const seen = [];
  const sample = [];
  const walk = (list) => {
    for (const rule of Array.from(list || [])) {
      // Read the selector FIRST: since Chrome 112 a plain style rule also has
      // an (empty) cssRules list, so checking cssRules first would skip every
      // rule in the sheet.
      const sel = rule.selectorText;
      if (sel) {
        if (sample.length < 40) sample.push(sel.slice(0, 70));
        if (sel.toLowerCase().indexOf('focus-visible') >= 0) {
          seen.push(sel);
          wanted.forEach(w => { if (sel.indexOf(w) >= 0) withFocusRing[w] = true; });
        }
      }
      if (rule.cssRules && rule.cssRules.length) walk(rule.cssRules);
    }
  };
  let ruleTotal = 0;
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      ruleTotal += sheet.cssRules ? sheet.cssRules.length : 0;
      walk(sheet.cssRules);
    } catch (e) {}
  }
  out.focusVisible = withFocusRing;
  out.focusVisibleSeen = seen.slice(0, 6);
  out.sheets = { count: document.styleSheets.length, rules: ruleTotal };
  out.sample = sample.slice(0, 12);
  out.hrefs = Array.from(document.styleSheets).map(s => (s.href || 'inline').split('/').pop()).slice(0, 20);

  // Chart labels.
  const bar = document.querySelector('.dv-dist__bar');
  out.chart = bar ? {
    role: bar.getAttribute('role'),
    label: (bar.getAttribute('aria-label') || '').slice(0, 60),
    hiddenSegments: [...bar.querySelectorAll('.dv-dist__seg')].every(s => s.getAttribute('aria-hidden') === 'true')
  } : null;

  return out;
};

async function s9_a11y(browser) {
  section$('S9 A11Y');
  const { ctx, page, state } = await newScenario(browser, { guestItems: distItems() });
  const a = await page.evaluate(A11Y_CONTRAST);

  const keys = [
    'kpiValue2', 'metricLabel', 'metricHint', 'progressCaption', 'distShare',
    'breakdownValue', 'breakdownName', 'priorityValue', 'actionLead', 'actionNote',
    'actionButton', 'emptyTitle', 'kpiGradient'
  ];
  const resolved = keys.filter(k => typeof a[k] === 'number');
  const failing = resolved.filter(k => a[k] < 4.5);

  c('A11Y-01', 'contrast', 'text in the dashboard', 'meets 4.5:1 everywhere (WCAG AA, body text)',
    failing.length === 0 && resolved.length >= 10,
    { failing: failing.map(k => k + '=' + a[k]), resolved: resolved.length });

  c('A11Y-02', 'contrast', 'the dominant gradient KPI card', 'still reaches 4.5:1 for its white label at every stop (worst case)',
    typeof a.kpiGradient === 'number' && a.kpiGradient >= 4.5, a.kpiGradient);

  c('A11Y-03', 'contrast', 'the secondary metrics', 'labels and hints meet 4.5:1',
    a.metricLabel >= 4.5 && a.metricHint >= 4.5, { label: a.metricLabel, hint: a.metricHint });

  // Non-gated: the raw measurement table for the F3 report.
  CHECK('A11Y-P1', 'probe', 'contrast measurements', 'reported for the record',
    'A11Y measured ratios', true,
    resolved.map(k => k + '=' + a[k]).concat(['emptyAction=' + a.emptyAction]), false);

  c('A11Y-04', 'semantics', 'every interactive element in the dashboard', 'is a real <button>, never a clickable div',
    a.clickableDivs.length === 0 && a.dashboardControls > 0,
    { divs: a.clickableDivs, controls: a.dashboardControls });

  c('A11Y-05', 'names', 'every dashboard button', 'has an accessible name (text or aria-label)',
    a.nameless.length === 0, a.nameless);

  c('A11Y-06', 'keyboard', 'every new control', 'is focusable',
    a.unfocusable.length === 0, a.unfocusable);

  c('A11Y-07', 'focus', 'every new control', 'defines a :focus-visible ring',
    Object.keys(a.focusVisible).every(k => a.focusVisible[k] === true),
    { rings: a.focusVisible, seen: a.focusVisibleSeen, sheets: a.sheets, sample: a.sample, hrefs: a.hrefs });

  c('A11Y-08', 'targets', 'the legend, breakdown, priority and action rows', 'are at least 24px tall',
    a.smallTargets.length === 0, a.smallTargets);

  c('A11Y-09', 'charts', 'the status bar', 'is a labelled role="img" whose segments are hidden from the reading order',
    a.chart && a.chart.role === 'img' && a.chart.label.length > 20 && a.chart.hiddenSegments === true,
    a.chart);

  // --- the empty state's action button (P2-2) -------------------------
  await page.evaluate(() => {
    const q = document.getElementById('q');
    q.value = 'zzzzzzzz';
    q.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await sleep(700);
  const emptyState = await page.evaluate(A11Y_CONTRAST);

  c('A11Y-10', 'contrast', '#emptyAction in the no-results state', 'meets 4.5:1 (P2-2 fixed, or left alone if it already passed)',
    emptyState.emptyAction !== null && emptyState.emptyAction >= 4.5,
    { ratio: emptyState.emptyAction, font: emptyState.emptyActionFont });

  c('A11Y-11', 'errors', 'S9 scenario', 'no console errors',
    state.pageErrors.length === 0 && state.errors.length === 0,
    { pageErrors: state.pageErrors, errors: state.errors });

  await ctx.close();
}

// =====================================================================
// S10 - SCALE (F3.6)
// ---------------------------------------------------------------------
// The brief calls out empty / 1 / 50 products. Empty is S2, and every other
// scenario runs 5-36 items; this one pins the two ends and stresses the KPI
// invariance rule at 50 items.
// =====================================================================
const normalizeMoney = (s) => String(s).replace(/\s+/g, ' ').trim();

const manyItems = (n) => {
  const cats = ['Nhóm A', 'Nhóm B', 'Nhóm C', 'Nhóm D', 'Nhóm E', 'Nhóm F', 'Nhóm G', 'Nhóm H', ''];
  const st = ['wish', 'saving', 'ordered', 'purchased'];
  const pri = ['low', 'medium', 'high'];
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({
      id: 's' + (i + 1),
      name: 'Món ' + (i + 1),
      price: 100000 * ((i % 9) + 1),
      image: '',
      link: '',
      note: '',
      status: st[i % 4],
      priority: pri[i % 3],
      category: cats[i % cats.length],
      createdAt: 1700000000000 + i
    });
  }
  return out;
};

const geoProbe = () => ({
  scrollWidth: document.documentElement.scrollWidth,
  innerWidth: window.innerWidth,
  widest: Math.max(...[...document.querySelectorAll('.dashboard-panel *')]
    .map(el => el.getBoundingClientRect().right))
});

async function s10_scale(browser) {
  section$('S10 SCALE');

  // --- exactly one product -------------------------------------------
  {
    const one = manyItems(1);
    const { ctx, page, state } = await newScenario(browser, { guestItems: one });
    const s = await snap(page);

    c('SCALE-01', '1 product', 'the KPI count', 'reads "1 món" (not "1 móns" or "0")',
      s.kpi.count === '1 món', s.kpi.count);

    c('SCALE-02', '1 product', 'the progress caption', 'reads "0 trên 1 món đã sở hữu."',
      s.kpi.caption === '0 trên 1 món đã sở hữu.' && s.kpi.progress === '0%',
      { caption: s.kpi.caption, progress: s.kpi.progress });

    c('SCALE-03', '1 product', 'the panels', 'each show their single row instead of hiding',
      s.breakdown.hidden === false && s.breakdown.rows.length === 1 &&
      s.priority.hidden === false && s.priority.rows.length === 3 &&
      s.dist.segs.length >= 1,
      {
        breakdownRows: s.breakdown.rows.length,
        priorityRows: s.priority.rows.length,
        segments: s.dist.segs.length
      });

    c('SCALE-04', '1 product', 'errors', 'no console errors',
      state.pageErrors.length === 0 && state.errors.length === 0,
      { pageErrors: state.pageErrors, errors: state.errors });

    await ctx.close();
  }

  // --- fifty products -------------------------------------------------
  {
    const fifty = manyItems(50);
    const pending = fifty.filter(x => x.status !== 'purchased').reduce((n, x) => n + x.price, 0);
    const { ctx, page, state } = await newScenario(browser, { guestItems: fifty });
    const expectedTotal = await page.evaluate(v => fmtMoney(v), pending);
    const s = await snap(page);

    c('SCALE-05', '50 products', 'the KPI count and value', 'are correct at scale',
      s.kpi.count === '50 món' && s.kpi.total === normalizeMoney(expectedTotal) &&
      s.metrics.totalCount === 50 && s.metrics.ownedCount === 12 && s.metrics.pendingCount === 38,
      { count: s.kpi.count, total: s.kpi.total, expected: expectedTotal, metrics: s.metrics });

    c('SCALE-06', '50 products', 'ownership', 'is 12/50 = 24%',
      s.kpi.progress === '24%' && s.kpi.caption === '12 trên 50 món đã sở hữu.' &&
      Math.round(s.metrics.ownershipRate * 100) === 24,
      { progress: s.kpi.progress, caption: s.kpi.caption, rate: s.metrics.ownershipRate });

    const rowCounts = s.breakdown.rows.map(r => Number(String(r.value).replace(/[^0-9]/g, '')));

    c('SCALE-07', '50 products', 'the category panel', 'still caps at six real rows plus one "Khác" that holds the rest',
      s.breakdown.rows.length === 7 && s.breakdown.rows[6].staticRow === true &&
      s.breakdown.rows[6].name === 'Khác (3 danh mục)' &&
      rowCounts.slice(0, 6).every((n, i) => i === 0 || rowCounts[i - 1] >= n) &&
      rowCounts.slice(0, 6).reduce((a, b) => a + b, 0) + rowCounts[6] === 50,
      s.breakdown.rows.map(r => r.name + '=' + r.value));

    c('SCALE-08', '50 products', 'the priority panel', 'shows all three ranks',
      s.priority.rows.length === 3 && s.priority.rows.every(r => r.disabled === null),
      s.priority.rows.map(r => r.priority + '=' + r.count));

    const kpiAt50 = JSON.parse(JSON.stringify(s.kpi));

    // Search, sort and filter must not move a single KPI digit.
    await page.evaluate(() => {
      const q = document.getElementById('q');
      q.value = 'Món 1';
      q.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await sleep(600);
    const searched = await snap(page);

    c('SCALE-09', '50 products', 'typing a search', 'narrows the grid but leaves every KPI untouched',
      searched.cardCount < 50 && kpiOnly(searched.kpi) === kpiOnly(kpiAt50),
      { cards: searched.cardCount, before: kpiAt50, after: searched.kpi });

    await page.evaluate(() => {
      const q = document.getElementById('q');
      q.value = '';
      q.dispatchEvent(new Event('input', { bubbles: true }));
      const sort = document.getElementById('fSort');
      sort.value = 'price-desc';
      sort.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await sleep(600);
    const sorted = await snap(page);

    c('SCALE-10', '50 products', 'changing the sort', 'reorders the grid but leaves every KPI untouched',
      kpiOnly(sorted.kpi) === kpiOnly(kpiAt50),
      { before: kpiAt50, after: sorted.kpi });

    await page.evaluate(() => {
      const st = document.getElementById('fStatus');
      st.value = 'wish';
      st.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await sleep(600);
    const filtered = await snap(page);

    c('SCALE-11', '50 products', 'filtering by status', 'narrows the grid and leaves every KPI untouched',
      filtered.cardCount > 0 && filtered.cardCount < 50 &&
      kpiOnly(filtered.kpi) === kpiOnly(kpiAt50),
      { cards: filtered.cardCount, before: kpiAt50, after: filtered.kpi });

    const wide = await page.evaluate(geoProbe);
    c('SCALE-12', '50 products', 'at 1280px', 'nothing overflows horizontally',
      wide.scrollWidth <= wide.innerWidth && wide.widest <= wide.innerWidth + 0.5,
      wide);

    c('SCALE-13', '50 products', 'errors', 'no console errors',
      state.pageErrors.length === 0 && state.errors.length === 0,
      { pageErrors: state.pageErrors, errors: state.errors });

    await ctx.close();
  }

  // --- fifty products on a phone --------------------------------------
  {
    const { ctx, page, state } = await newScenario(browser,
      { guestItems: manyItems(50) }, { width: 390, height: 880, isMobile: true, hasTouch: true });
    await sleep(300);
    const geo = await page.evaluate(geoProbe);

    c('SCALE-14', '50 products at 390px', 'the whole dashboard', 'does not overflow horizontally',
      geo.scrollWidth <= 390 && geo.widest <= 390.5, geo);

    c('SCALE-15', '50 products at 390px', 'errors', 'no console errors',
      state.pageErrors.length === 0 && state.errors.length === 0,
      { pageErrors: state.pageErrors, errors: state.errors });

    await ctx.close();
  }
}

// =====================================================================
const scenarios = [
  ['S1 STATUS', s1_status],
  ['S2 EMPTY', s2_empty],
  ['S3 MOBILE', s3_mobile],
  ['S4 BREAKDOWN', s4_breakdown],
  ['S5 PRIORITY', s5_priority],
  ['S6 MOBILE-INSIGHT', s6_mobile_insight],
  ['S7 ACTIONS', s7_actions],
  ['S8 MOTION', s8_motion],
  ['S9 A11Y', s9_a11y],
  ['S10 SCALE', s10_scale]
];

(async () => {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
  await new Promise(r => server.listen(PORT, r));
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--hide-scrollbars']
  });

  try {
    for (const [label, fn] of scenarios) {
      if (ONLY && label.indexOf(ONLY) < 0) continue;
      try {
        await fn(browser);
      } catch (e) {
        CHECK('HARNESS-' + label, 'Harness', label, 'scenario completes',
          'HARNESS ' + label, false, String(e && e.message || e));
      }
    }
  } finally {
    await browser.close();
    server.close();
  }

  let current = '';
  results.forEach(r => {
    const g = r.name.split(' · ')[0];
    if (g !== current) {
      current = g;
      console.log('');
      console.log('--- ' + current + ' ---');
    }
    const tag = r.gate ? '' : ' (probe)';
    console.log((r.pass ? 'PASS ' : 'FAIL ') + '[' + r.id + '] ' + r.area + ' :: ' + r.entry + tag + (r.pass ? '' : '  :: ' + r.actual));
  });

  const gated = results.filter(r => r.gate);
  const pass = gated.filter(r => r.pass).length;
  const fails = gated.filter(r => !r.pass);
  console.log('');
  console.log('======================================');
  console.log('F3 SUITE: ' + pass + ' PASS / ' + fails.length + ' FAIL  (gated total ' + gated.length + ')');
  if (fails.length) {
    console.log('');
    console.log('FAILURES:');
    fails.forEach(f => console.log('  ' + f.id + ' - ' + f.area + ' :: ' + f.entry + ' :: ' + f.actual));
  }
  fs.writeFileSync(path.join(OUT, 'f3-results.json'), JSON.stringify(results, null, 2), 'utf8');
  process.exit(fails.length ? 1 : 0);
})().catch(e => {
  console.error(e);
  try { server.close(); } catch (_) {}
  process.exit(2);
});
