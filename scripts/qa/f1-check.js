// =====================================================================
// DREAM VAULT V16.1 — F1 FUNCTIONAL AUDIT + KPI VERIFICATION
// ---------------------------------------------------------------------
// Serves the real repo, stubs ONLY the cloud module (no Firebase network),
// then drives the real entry points (buttons, selects, form, file input)
// and asserts observable behaviour. Nothing here sets app state directly
// except seeding localStorage before load, which is how a returning user
// is simulated.
//
// usage: node v16_1-f1-check.js [repoRoot] [--shots]
// =====================================================================
const puppeteer = require('puppeteer-core');
const http = require('http');
const fs = require('fs');
const path = require('path');

const CHROME = process.env.CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT = process.argv[2] && !process.argv[2].startsWith('--')
  ? process.argv[2]
  : path.join(__dirname, '..', '..');
const PORT = 8131;
const SHOTS = process.argv.includes('--shots');
const TMP = path.join(__dirname, '..', '..', 'qa-out');
const OUT = path.join(TMP, 'v16_1-out');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon'
};

// Cloud stub: records syncs so we can prove what did / did not reach storage.
const MOCK = `
const state = { user: null, opts: null, syncs: [], statuses: [] };
window.__cloud = state;
export async function initializeWishlistCloud(opts){
  state.opts = opts;
  window.__cloudSetUser = (u) => { state.user = u; if(opts.onUserChanged) opts.onUserChanged(u ? u.uid : null); };
  window.__cloudRemote = (items, initial) => { if(opts.onRemoteItems) opts.onRemoteItems(items, !!initial); };
  window.__cloudStatus = (kind, email) => { state.statuses.push(kind); if(opts.onStatus) opts.onStatus(kind, email || ''); };
  window.__cloudError = (m) => { if(opts.onError) opts.onError(m); };
  window.__cloudSyncs = () => state.syncs;
  setTimeout(() => { window.__cloudSetUser(null); window.__cloudStatus('local', ''); }, 0);
  return {
    get user(){ return state.user; },
    signIn: async () => {},
    signOut: async () => { state.user = null; if(opts.onUserChanged) opts.onUserChanged(null); if(opts.onStatus) opts.onStatus('local',''); },
    syncItems: (items) => { state.syncs.push(items.map(i => String(i.id))); return Promise.resolve(); },
    uploadImage: async () => ''
  };
}
`;

// ---------------------------------------------------------------------
// Result bookkeeping
// ---------------------------------------------------------------------
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
  CHECK(id, area, entry, expected, section + ' · ' + area, cond, actual, gate);
// A probe documents real, observed behaviour of an out-of-scope defect.
// It is reported but does not gate the suite.
const probe = (id, area, entry, expected, cond, actual) =>
  CHECK(id, area, entry, expected, section + ' · ' + area, cond, actual, false);

// ---------------------------------------------------------------------
// Deterministic fixture — same generator the QA harness uses.
// ---------------------------------------------------------------------
const ITEM = i => ({
  id: 'f1-' + i,
  name: 'Món ' + i,
  price: 100000 + i * 1000,
  image: '',
  link: '',
  status: ['wish', 'saving', 'ordered', 'purchased'][i % 4],
  priority: ['low', 'medium', 'high'][i % 3],
  category: 'Nhóm ' + (i % 3),
  note: 'ghi chú ' + i,
  createdAt: 1700000000000 + i
});

function makeItems(n) { return Array.from({ length: n }, (_, i) => ITEM(i + 1)); }

// Independent (Node-side) expectation for computeMetrics — no app code reused.
function expectMetrics(list) {
  let ownedCount = 0, ownedValue = 0, pendingCount = 0, pendingValue = 0;
  for (const it of list) {
    const p = Number.isFinite(Number(it.price)) && Number(it.price) > 0 ? Number(it.price) : 0;
    if (it.status === 'purchased') { ownedCount++; ownedValue += p; }
    else { pendingCount++; pendingValue += p; }
  }
  const totalCount = list.length;
  const progress = totalCount === 0 ? 0 : ownedCount / totalCount;
  return { totalCount, ownedCount, pendingCount, ownedValue, pendingValue, progressPercent: Math.round(progress * 100) };
}

// ---------------------------------------------------------------------
// Static server
// ---------------------------------------------------------------------
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

// ---------------------------------------------------------------------
// Page factory
// ---------------------------------------------------------------------
async function newScenario(browser, seed = {}, opts = {}) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  const state = { errors: [], dialogs: [], acceptDialogs: opts.acceptDialogs !== false, pageErrors: [] };

  await page.setViewport({
    width: opts.width || 1280, height: opts.height || 900, deviceScaleFactor: 1
  });
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);

  await page.evaluateOnNewDocument((s) => {
    try {
      localStorage.clear();
      if (s.guestItems) localStorage.setItem('wishlist.guest.items', JSON.stringify(s.guestItems));
      if (s.legacyItems) localStorage.setItem('wishlist.items', JSON.stringify(s.legacyItems));
      if (s.accountItems) localStorage.setItem('wishlist.account.' + (s.uid || 'uid-demo'), JSON.stringify(s.accountItems));
      if (s.rawKeys) Object.keys(s.rawKeys).forEach(k => localStorage.setItem(k, s.rawKeys[k]));
    } catch (e) { /* storage unavailable — tests will report it */ }
  }, seed);

  page.on('pageerror', e => { state.pageErrors.push(String(e && e.message || e)); });
  page.on('console', m => { if (m.type() === 'error') state.errors.push(m.text()); });
  page.on('dialog', async d => {
    state.dialogs.push(d.message());
    try { state.acceptDialogs ? await d.accept() : await d.dismiss(); } catch (e) { /* gone */ }
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

// ---------------------------------------------------------------------
// In-page readers
// ---------------------------------------------------------------------
const SNAP = () => {
  const $id = (i) => document.getElementById(i);
  const txt = (i) => { const el = $id(i); return el ? el.textContent : null; };
  const track = $id('dvProgressTrack');
  const fill = $id('dvProgressFill');
  const cards = [...document.querySelectorAll('#grid .wishlist-card')];
  const storage = {};
  try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); storage[k] = localStorage.getItem(k); } } catch (e) {}
  let metrics = null;
  try { metrics = globalMetrics(); } catch (e) { metrics = { error: String(e && e.message || e) }; }
  let filtered = null;
  try { filtered = filteredMetrics(); } catch (e) { filtered = { error: String(e && e.message || e) }; }
  return {
    kpi: {
      total: txt('sumTotal'), spent: txt('sumSpent'), count: txt('sumCount'),
      progress: txt('dvProgressValue'),
      caption: txt('dvProgressCaption'),
      ariaNow: track ? track.getAttribute('aria-valuenow') : null,
      ariaMin: track ? track.getAttribute('aria-valuemin') : null,
      ariaMax: track ? track.getAttribute('aria-valuemax') : null,
      ariaText: track ? track.getAttribute('aria-valuetext') : null,
      role: track ? track.getAttribute('role') : null,
      fillWidth: fill ? fill.style.width : null,
      result: txt('resultStatus')
    },
    labels: {
      l1: document.querySelectorAll('.stat-card')[0] ? document.querySelectorAll('.stat-card')[0].querySelector('.stat-card__label').textContent.trim() : null,
      l2: document.querySelectorAll('.stat-card')[1] ? document.querySelectorAll('.stat-card')[1].querySelector('.stat-card__label').textContent.trim() : null,
      l3: document.querySelectorAll('.stat-card')[2] ? document.querySelectorAll('.stat-card')[2].querySelector('.stat-card__label').textContent.trim() : null,
      d2: document.querySelectorAll('.stat-card')[1] ? document.querySelectorAll('.stat-card')[1].querySelector('.stat-card__description').textContent.trim() : null
    },
    metrics, filtered,
    storage,
    cards: cards.length,
    cardIds: cards.map(x => x.dataset.id),
    cardTitles: cards.map(x => (x.querySelector('.product-card__title') || {}).textContent || ''),
    empty: {
      hidden: $id('empty').classList.contains('hidden'),
      title: txt('emptyTitle'),
      action: txt('emptyAction')
    },
    items: items.map(x => ({ id: x.id, name: x.name, price: x.price, status: x.status, priority: x.priority, category: x.category })),
    itemCount: items.length,
    toast: (() => { const t = document.querySelector('.toast'); return t ? t.textContent : null; })(),
    dlgOpen: $id('dlg').open, qvOpen: $id('qv').open,
    sync: {
      status: txt('syncStatus'),
      account: txt('syncAccountState'),
      email: txt('syncEmail'),
      listState: txt('syncListState')
    },
    view: $id('grid').dataset.v13View
  };
};

const snap = page => page.evaluate(SNAP);

const fmt = (page, n) => page.evaluate(v => fmtMoney(v), n);

// =====================================================================
// SCENARIO 1 — EMPTY
// =====================================================================
async function s1_empty(browser) {
  section$('S1 EMPTY');
  const { ctx, page, state } = await newScenario(browser, { guestItems: [] });
  const s = await snap(page);
  const zero = await fmt(page, 0);

  c('KPI-01', 'KPI', 'sumTotal/sumSpent/sumCount', 'all zero, count "0 món"',
    s.kpi.total === zero && s.kpi.spent === zero && s.kpi.count === '0 món', s.kpi);
  c('KPI-02', 'KPI', 'globalMetrics()', 'totalCount 0, progress 0 (not NaN)',
    s.metrics && s.metrics.totalCount === 0 && s.metrics.progress === 0 &&
    Number.isFinite(s.metrics.progress) && s.metrics.progressPercent === 0, s.metrics);
  c('KPI-03', 'KPI', '#dvProgressValue / aria', '0% and aria-valuenow 0',
    s.kpi.progress === '0%' && s.kpi.ariaNow === '0' && s.kpi.fillWidth === '0%', s.kpi);
  c('KPI-04', 'KPI', '#dvProgressCaption', 'explicit empty message, no NaN',
    s.kpi.caption === 'Chưa có món nào trong bộ sưu tập.', s.kpi.caption);
  c('KPI-05', 'KPI', '#resultStatus', '"Đang hiển thị 0 trên 0 món."',
    s.kpi.result === 'Đang hiển thị 0 trên 0 món.', s.kpi.result);
  c('KPI-06', 'KPI', 'progressbar a11y', 'role=progressbar with min/max set',
    s.kpi.role === 'progressbar' && s.kpi.ariaMin === '0' && s.kpi.ariaMax === '100', s.kpi);
  c('KPI-07', 'KPI', 'no sample data', 'items stays empty (no fixtures injected)',
    s.itemCount === 0 && s.cards === 0 && (s.metrics || {}).totalCount === 0, s.itemCount);
  c('UI-01', 'Empty state', '#empty panel', 'visible with first-run copy',
    s.empty.hidden === false && s.empty.title === 'Bộ sưu tập của bạn bắt đầu từ đây.', s.empty);
  c('UI-02', 'Empty state', '#emptyAction', 'offers "+ Thêm món đầu tiên"',
    s.empty.action === '+ Thêm món đầu tiên', s.empty.action);

  if (SHOTS) await page.screenshot({ path: path.join(OUT, 'f1-s1-empty-desktop.png') });
  const leaks = state.pageErrors.concat(state.errors).filter(t => /NaN|undefined is not|TypeError/i.test(t));
  c('BUG-00', 'Console', 'page load', 'no NaN/TypeError noise',
    leaks.length === 0, leaks.slice(0, 3));

  await ctx.close();
}

// =====================================================================
// SCENARIO 2 — ONE ITEM + PURCHASED / UNDO
// =====================================================================
// V16.1 F2: "Đánh dấu đã mua" now opens the purchase-capture dialog
// (#pd) and writes nothing until it is answered. These F1 scenarios keep every
// original assertion; they just answer the dialog, because the interaction
// contract legitimately changed. "Bỏ qua giá" records the purchase without a
// price, which is exactly what these checks assume.
async function answerPurchase(page, how = 'skip') {
  await sleep(260);
  await page.click(how === 'skip' ? '#pdSkip' : '#pdConfirm');
  await sleep(400);
}

async function s2_single(browser) {
  section$('S2 ONE ITEM');
  const one = [{ id: 'one-1', name: 'Tai nghe', price: 250000, image: '', link: '', status: 'wish', priority: 'high', category: 'Công nghệ', note: '', createdAt: 1700000000000 }];
  const { ctx, page, state } = await newScenario(browser, { guestItems: one });

  let s = await snap(page);
  const exp0 = expectMetrics(one);
  c('KPI-10', 'KPI', 'globalMetrics() 1 item', 'owned 0 / pending 1 / pendingValue 250000',
    s.metrics.ownedCount === exp0.ownedCount && s.metrics.pendingCount === exp0.pendingCount &&
    s.metrics.pendingValue === exp0.pendingValue && s.metrics.ownedValue === exp0.ownedValue, s.metrics);
  c('KPI-11', 'KPI', '#sumCount', '"1 món"', s.kpi.count === '1 món', s.kpi.count);
  c('KPI-12', 'KPI', 'progress 0/1', '0%', s.kpi.progress === '0%' && s.kpi.ariaNow === '0', s.kpi);
  c('UI-03', 'Card render', '#grid', 'exactly 1 card', s.cards === 1, s.cards);

  // --- entry point: card button "Đánh dấu đã mua"
  const btnLabel = await page.$eval('#grid .wishlist-card .mark-purchased', b => b.textContent);
  c('CRUD-01', 'Mark purchased', '.mark-purchased button', 'labelled "Đánh dấu đã mua" when not owned',
    btnLabel === 'Đánh dấu đã mua', btnLabel);
  await page.click('#grid .wishlist-card .mark-purchased');
  await answerPurchase(page, 'skip');
  s = await snap(page);
  c('CRUD-02', 'Mark purchased', '.mark-purchased click + "Bỏ qua giá"', 'status -> purchased, toast confirms',
    s.items[0].status === 'purchased' && /đã mua/.test(s.toast || ''), { st: s.items[0].status, toast: s.toast });
  c('KPI-13', 'KPI', 'after mark purchased', 'progress 100%, owned 250000, pending 0',
    s.metrics.ownedCount === 1 && s.metrics.ownedValue === 250000 && s.metrics.pendingValue === 0 &&
    s.kpi.progress === '100%' && s.kpi.ariaNow === '100' &&
    s.kpi.spent === await fmt(page, 250000) && s.kpi.total === await fmt(page, 0), s.metrics);
  c('KPI-14', 'KPI', '#dvProgressCaption', '1 trên 1 món đã sở hữu',
    s.kpi.caption === '1 trên 1 món đã sở hữu.', s.kpi.caption);
  c('PERSIST-01', 'Persistence', 'localStorage guest list', 'status persisted as purchased',
    JSON.parse(s.items ? JSON.stringify(one) : '[]') !== null &&
    (s.items[0] || {}).status === 'purchased', s.items[0]);
  const storedStatus = await page.evaluate(() => JSON.parse(localStorage.getItem('wishlist.guest.items'))[0].status);
  c('PERSIST-02', 'Persistence', 'wishlist.guest.items', 'stored status === "purchased"',
    storedStatus === 'purchased', storedStatus);

  // --- entry point: undo
  const undoLabel = await page.$eval('#grid .wishlist-card .mark-purchased', b => b.textContent);
  c('CRUD-03', 'Undo purchased', '.mark-purchased button', 'labelled "Hoàn tác" when owned',
    undoLabel === 'Hoàn tác', undoLabel);
  await page.click('#grid .wishlist-card .mark-purchased');
  await sleep(350);
  s = await snap(page);
  // V16.1 F2 — the item was 'wish' before it was marked purchased, and undo now
  // restores that exact status instead of guessing "the step before purchased"
  // (which used to send it to 'ordered'). This is the F2 fix, asserted here.
  c('CRUD-04', 'Undo purchased', '.mark-purchased click', 'status -> wish (the real previous status), progress 0%',
    s.items[0].status === 'wish' && s.kpi.progress === '0%' && s.metrics.ownedCount === 0,
    { st: s.items[0].status, p: s.kpi.progress });
  c('KPI-15', 'KPI', 'after undo', 'pending value back to 250000',
    s.metrics.pendingValue === 250000 && s.metrics.ownedValue === 0, s.metrics);

  if (SHOTS) {
    await page.evaluate(() => window.scrollTo(0, document.querySelector('.dashboard-panel').offsetTop - 80));
    await sleep(300);
    await page.screenshot({ path: path.join(OUT, 'f1-s2-single-desktop.png') });
  }
  c('BUG-01', 'Console', 'single item flow', 'no console errors',
    state.pageErrors.length === 0, state.pageErrors.slice(0, 3));
  await ctx.close();
}

// =====================================================================
// SCENARIO 3 — 50 ITEMS: KPI INTEGRITY UNDER SEARCH / FILTER / SORT
// =====================================================================
async function s3_fifty(browser) {
  section$('S3 50 ITEMS');
  const list = makeItems(50);
  const exp = expectMetrics(list);
  const { ctx, page, state } = await newScenario(browser, { guestItems: list });

  let s = await snap(page);
  c('KPI-20', 'KPI', 'globalMetrics() 50 items', 'matches independent Node expectation',
    s.metrics.totalCount === exp.totalCount && s.metrics.ownedCount === exp.ownedCount &&
    s.metrics.pendingCount === exp.pendingCount && s.metrics.ownedValue === exp.ownedValue &&
    s.metrics.pendingValue === exp.pendingValue, { got: s.metrics, want: exp });
  c('KPI-21', 'KPI', '#sumCount', '"50 món" (whole collection)', s.kpi.count === '50 món', s.kpi.count);
  c('KPI-22', 'KPI', 'progress 12/50', '24%', s.kpi.progress === '24%' && s.kpi.ariaNow === '24', s.kpi);
  c('KPI-23', 'KPI', '#sumTotal / #sumSpent', 'text equals fmtMoney(independent expectation)',
    s.kpi.total === await fmt(page, exp.pendingValue) && s.kpi.spent === await fmt(page, exp.ownedValue),
    { total: s.kpi.total, spent: s.kpi.spent });
  c('UI-04', 'Card render', '#grid', 'all 50 cards rendered', s.cards === 50, s.cards);

  const baseline = { ...s.kpi };

  // ---- search
  await page.click('#q');
  await page.type('#q', 'Món 4');
  await sleep(400);
  s = await snap(page);
  c('FILTER-01', 'Search', '#q input (debounced)', 'resultStatus reflects the filtered subset',
    /^Đang hiển thị (1[0-9]) trên 50 món\.$/.test(s.kpi.result), s.kpi.result);
  c('KPI-30', 'KPI under search', '#q = "Món 4"', 'globalMetrics + all 6 KPI texts unchanged',
    s.kpi.total === baseline.total && s.kpi.spent === baseline.spent && s.kpi.count === baseline.count &&
    s.kpi.progress === baseline.progress && s.kpi.ariaNow === baseline.ariaNow &&
    s.metrics.totalCount === 50 && s.metrics.ownedCount === exp.ownedCount &&
    s.metrics.pendingValue === exp.pendingValue && s.metrics.ownedValue === exp.ownedValue,
    { kpi: s.kpi, metrics: s.metrics });
  c('FILTER-02', 'Search', 'search must not mutate data', 'items.length still 50 and no write spike',
    s.itemCount === 50, s.itemCount);

  // ---- clear filters (button)
  await page.click('#btnClearFilter');
  await sleep(250);
  s = await snap(page);
  c('FILTER-03', 'Clear filters', '#btnClearFilter', 'search box, selects reset and 50 cards return',
    (await page.$eval('#q', el => el.value)) === '' && s.cards === 50, s.cards);

  // ---- status filter
  await page.select('#fStatus', 'wish');
  await sleep(250);
  s = await snap(page);
  const wishCount = list.filter(i => i.status === 'wish').length;
  c('FILTER-04', 'Status filter', '#fStatus = "wish"', 'resultStatus counts filtered subset only',
    s.kpi.result === 'Đang hiển thị ' + wishCount + ' trên 50 món.', s.kpi.result);
  c('KPI-31', 'KPI under filter', '#fStatus = "wish"', 'all 6 KPI texts unchanged',
    s.kpi.total === baseline.total && s.kpi.spent === baseline.spent && s.kpi.count === baseline.count &&
    s.kpi.progress === baseline.progress && s.metrics.totalCount === 50,
    { got: { t: s.kpi.total, s: s.kpi.spent, c: s.kpi.count, p: s.kpi.progress } });

  // ---- priority filter
  await page.select('#fPriority', 'high');
  await sleep(250);
  s = await snap(page);
  c('KPI-32', 'KPI under filter', '#fPriority = "high"', 'all 6 KPI texts unchanged',
    s.kpi.total === baseline.total && s.kpi.spent === baseline.spent && s.kpi.count === baseline.count &&
    s.kpi.progress === baseline.progress, { t: s.kpi.total, c: s.kpi.count });

  // ---- category filter
  await page.select('#fPriority', '');
  await page.select('#fStatus', '');
  await page.select('#fCategoryFilter', 'Nhóm 1');
  await sleep(250);
  s = await snap(page);
  c('KPI-33', 'KPI under filter', '#fCategoryFilter = "Nhóm 1"', 'all 6 KPI texts unchanged',
    s.kpi.total === baseline.total && s.kpi.spent === baseline.spent && s.kpi.count === baseline.count &&
    s.kpi.progress === baseline.progress, { t: s.kpi.total, c: s.kpi.count });

  // ---- sort
  await page.select('#fCategoryFilter', '');
  const beforeSort = (await snap(page)).cardIds.join(',');
  await page.select('#fSort', 'price-asc');
  await sleep(250);
  s = await snap(page);
  const afterSort = s.cardIds.join(',');
  c('SORT-01', 'Sort', '#fSort = "price-asc"', 'card order actually changes',
    beforeSort !== afterSort && s.cards === 50, { changed: beforeSort !== afterSort });
  c('SORT-02', 'Sort', 'price-asc correctness', 'first card is the cheapest, last the dearest',
    s.cardIds[0] === list.reduce((a, b) => (a.price <= b.price ? a : b)).id &&
    s.cardIds[49] === list.reduce((a, b) => (a.price >= b.price ? a : b)).id,
    { first: s.cardIds[0], last: s.cardIds[49] });
  c('KPI-34', 'KPI under sort', '#fSort = "price-asc"', 'all 6 KPI texts unchanged',
    s.kpi.total === baseline.total && s.kpi.spent === baseline.spent && s.kpi.count === baseline.count &&
    s.kpi.progress === baseline.progress, { t: s.kpi.total, c: s.kpi.count });

  // ---- combined
  await page.type('#q', 'Món');
  await page.select('#fStatus', 'purchased');
  await page.select('#fSort', 'price-desc');
  await sleep(400);
  s = await snap(page);
  c('KPI-35', 'KPI combined', 'search + status + sort together', 'KPI still equal to full-collection values',
    s.metrics.totalCount === 50 && s.metrics.ownedCount === exp.ownedCount &&
    s.kpi.count === '50 món' && s.kpi.progress === '24%', { m: s.metrics, kpi: s.kpi });

  // ---- empty result must not zero the KPI
  await page.click('#btnClearFilter');
  await sleep(200);
  await page.type('#q', 'zzz-khong-co-gi');
  await sleep(400);
  s = await snap(page);
  c('KPI-36', 'KPI empty filter result', 'search with 0 matches', 'cards 0, KPI untouched, progress kept',
    s.cards === 0 && s.metrics.totalCount === 50 && s.kpi.count === '50 món' &&
    s.kpi.progress === '24%' && s.kpi.result === 'Đang hiển thị 0 trên 50 món.',
    { cards: s.cards, count: s.kpi.count, result: s.kpi.result });
  c('UI-05', 'Empty state', 'filters active, items exist', 'distinguishes "no match" from "no data"',
    s.empty.title === 'Không tìm thấy món phù hợp' && s.empty.action === 'Xóa bộ lọc',
    { t: s.empty.title, a: s.empty.action });

  await page.click('#btnClearFilter');
  await sleep(250);
  s = await snap(page);
  c('FILTER-05', 'Clear filters', '#btnClearFilter after empty result', '50 cards restored, KPI unchanged',
    s.cards === 50 && s.kpi.total === baseline.total && s.kpi.progress === baseline.progress, s.cards);

  if (SHOTS) {
    await page.evaluate(() => window.scrollTo(0, document.querySelector('.dashboard-panel').offsetTop - 80));
    await sleep(300);
    await page.screenshot({ path: path.join(OUT, 'f1-s3-fifty-desktop.png') });
  }
  c('BUG-02', 'Console', '50 item + filter flow', 'no console errors',
    state.pageErrors.length === 0 && state.errors.length === 0,
    state.pageErrors.concat(state.errors).slice(0, 3));
  await ctx.close();
}

// =====================================================================
// SCENARIO 4 — CRUD THROUGH THE REAL FORM
// =====================================================================
async function s4_crud(browser) {
  section$('S4 CRUD');
  const { ctx, page, state } = await newScenario(browser, { guestItems: [] });

  // create
  await page.click('#btnAdd');
  await sleep(250);
  c('CRUD-10', 'Create', '#btnAdd', 'dialog opens on the add form',
    await page.$eval('#dlg', d => d.open) && (await page.$eval('#dlgTitle', t => t.textContent)) === 'Thêm món',
    await page.$eval('#dlgTitle', t => t.textContent));

  await page.type('#fName', 'Áo khoác mùa đông');
  await page.type('#fPrice', '850000');
  await page.type('#fCategory', 'Thời trang');
  await page.select('#fPriority2', 'high');
  await page.type('#fNote', 'cần size M');
  await page.click('#form button[type="submit"]');
  await sleep(400);

  let s = await snap(page);
  c('CRUD-11', 'Create', 'form submit', 'item saved, dialog closed, card rendered',
    s.dlgOpen === false && s.cards === 1 && s.items[0].name === 'Áo khoác mùa đông' &&
    s.items[0].price === 850000 && s.items[0].priority === 'high' && s.items[0].category === 'Thời trang',
    s.items[0]);
  c('KPI-40', 'KPI after create', '#sumTotal', 'pending value = 850000, count "1 món"',
    s.metrics.pendingValue === 850000 && s.kpi.count === '1 món' &&
    s.kpi.total === await fmt(page, 850000) && s.kpi.progress === '0%', s.metrics);
  const newId = s.items[0].id;

  // validation: blank name
  await page.click('#btnAdd');
  await sleep(200);
  await page.type('#fPrice', '1000');
  await page.click('#form button[type="submit"]');
  await sleep(250);
  s = await snap(page);
  c('CRUD-12', 'Create validation', 'submit without name', 'rejected with toast, dialog stays open',
    s.dlgOpen === true && s.itemCount === 1 && /tên món/.test(s.toast || ''), { toast: s.toast, items: s.itemCount });
  await page.click('#btnCancel');
  await sleep(250);

  // validation: non-numeric price
  await page.click('#btnAdd');
  await sleep(200);
  await page.type('#fName', 'Món giá lỗi');
  await page.type('#fPrice', 'abc');
  await page.click('#form button[type="submit"]');
  await sleep(250);
  s = await snap(page);
  c('CRUD-13', 'Create validation', 'submit with non-numeric price', 'rejected with toast, nothing saved',
    s.dlgOpen === true && s.itemCount === 1 && /Giá/.test(s.toast || ''), { toast: s.toast, items: s.itemCount });
  await page.click('#btnCancel');
  await sleep(250);

  // update
  await page.click('#grid .wishlist-card .mini:not(.danger):not(.mark-purchased):not(.product-card__view)');
  await sleep(300);
  c('CRUD-14', 'Update', 'card "Sửa" button', 'form pre-filled with existing values',
    await page.$eval('#fName', i => i.value) === 'Áo khoác mùa đông' &&
    await page.$eval('#fPrice', i => i.value) === '850000' &&
    await page.$eval('#dlgTitle', t => t.textContent) === 'Sửa món',
    { name: await page.$eval('#fName', i => i.value), price: await page.$eval('#fPrice', i => i.value) });

  await page.$eval('#fName', i => { i.value = ''; });
  await page.type('#fName', 'Áo khoác mùa đông (đã sửa)');
  await page.click('#form button[type="submit"]');
  await sleep(400);
  s = await snap(page);
  c('CRUD-15', 'Update', 'form submit', 'same id, name changed, price preserved, count still 1',
    s.cards === 1 && s.items[0].id === newId && s.items[0].name === 'Áo khoác mùa đông (đã sửa)' &&
    s.items[0].price === 850000 && s.metrics.totalCount === 1, s.items[0]);
  c('KPI-41', 'KPI after update', '#sumTotal', 'still 850000 — edit must not double-count',
    s.metrics.pendingValue === 850000, s.metrics.pendingValue);

  // delete — dismissed
  state.acceptDialogs = false;
  await page.click('#grid .wishlist-card .mini.danger');
  await sleep(300);
  s = await snap(page);
  c('CRUD-16', 'Delete', 'card "Xóa" + confirm dismissed', 'item survives, confirm text names the item',
    s.itemCount === 1 && s.cards === 1 && /Xóa "Áo khoác/.test(state.dialogs[state.dialogs.length - 1] || ''),
    { items: s.itemCount, dialog: state.dialogs[state.dialogs.length - 1] });

  // delete — accepted
  state.acceptDialogs = true;
  await page.click('#grid .wishlist-card .mini.danger');
  await sleep(400);
  s = await snap(page);
  c('CRUD-17', 'Delete', 'card "Xóa" + confirm accepted', 'item removed, empty state returns',
    s.itemCount === 0 && s.cards === 0 && s.empty.hidden === false, { items: s.itemCount });
  c('KPI-42', 'KPI after delete', '#sumTotal/sumCount', 'back to zero / "0 món"',
    s.metrics.totalCount === 0 && s.metrics.pendingValue === 0 && s.kpi.count === '0 món' &&
    s.kpi.progress === '0%', s.metrics);

  c('BUG-03', 'Console', 'CRUD flow', 'no console errors',
    state.pageErrors.length === 0, state.pageErrors.slice(0, 3));
  await ctx.close();
}

// =====================================================================
// SCENARIO 5 — STATUS CYCLE, QUICK VIEW, VIEW MODES
// =====================================================================
async function s5_status_qv(browser) {
  section$('S5 STATUS / QUICK VIEW');
  const one = [{ id: 'qv-1', name: 'Máy ảnh cũ', price: 3200000, image: '', link: 'https://example.com/mua', status: 'wish', priority: 'medium', category: 'Công nghệ', note: 'bản limited', createdAt: 1700000000000 }];
  const { ctx, page, state } = await newScenario(browser, { guestItems: one });

  // status chip cycles one step per click
  const seq = [];
  for (let i = 0; i < 4; i++) {
    const has = await page.$('#grid .wishlist-card .status-chip');
    if (!has) break;
    await page.click('#grid .wishlist-card .status-chip');
    await sleep(300);
    seq.push((await snap(page)).items[0].status);
  }
  c('STATUS-01', 'Status cycle', '.status-chip click', 'wish -> saving -> ordered -> purchased, then stops',
    seq.join('>') === 'saving>ordered>purchased', seq);
  let s = await snap(page);
  c('STATUS-02', 'Status cycle', 'after 4 clicks', 'chip is no longer actionable at purchased',
    s.items[0].status === 'purchased' && (await page.$('#grid .wishlist-card .status-chip')) === null,
    s.items[0].status);
  c('KPI-50', 'KPI', 'status cycle to purchased', 'progress 100% and owned value recorded',
    s.kpi.progress === '100%' && s.metrics.ownedValue === 3200000 && s.metrics.pendingValue === 0, s.metrics);

  // quick view
  await page.click('#grid .wishlist-card .product-card__view');
  await sleep(400);
  s = await snap(page);
  const qv = await page.evaluate(() => ({
    title: document.getElementById('qvTitle').textContent,
    price: document.getElementById('qvPrice').textContent,
    status: document.getElementById('qvStatus').textContent,
    purchase: document.getElementById('qvPurchase').textContent,
    buy: !document.getElementById('qvBuy').hidden,
    href: document.getElementById('qvBuy').getAttribute('href')
  }));
  c('QV-01', 'Quick View', '.product-card__view click', 'dialog opens with this item, read-only fields correct',
    s.qvOpen === true && qv.title === 'Máy ảnh cũ' && qv.status === 'Đã mua', qv);
  c('QV-02', 'Quick View', 'purchase button', 'reflects purchased state as "Hoàn tác đã mua"',
    qv.purchase === 'Hoàn tác đã mua', qv.purchase);

  // undo from quick view
  await page.click('#qvPurchase');
  await sleep(400);
  s = await snap(page);
  c('QV-03', 'Quick View', '#qvPurchase click (undo)', 'item back to ordered, KPI progress resets',
    s.items[0].status === 'ordered' && s.kpi.progress === '0%' && s.cards === 1, { st: s.items[0].status, p: s.kpi.progress });

  // --- the open Quick View must refresh its own labels in place
  const qvAfterUndo = await page.evaluate(() => ({
    ring: document.getElementById('qvStatusRing').textContent,
    btn: document.getElementById('qvPurchase').textContent
  }));
  c('QV-07', 'Quick View', '#qvPurchase (undo) then read the open panel',
    'panel status ring + button label refresh in place',
    qvAfterUndo.ring === 'Đã đặt hàng' && qvAfterUndo.btn === 'Đánh dấu đã mua',
    { observed: qvAfterUndo, itemStatus: s.items[0].status });

  // mark purchased from quick view (F2: opens the capture dialog on top)
  await page.click('#qvPurchase');
  await answerPurchase(page, 'skip');
  s = await snap(page);
  c('QV-04', 'Quick View', '#qvPurchase click (mark)', 'item purchased again, progress 100%',
    s.items[0].status === 'purchased' && s.kpi.progress === '100%', { st: s.items[0].status });

  const qvAfterMark = await page.evaluate(() => ({
    ring: document.getElementById('qvStatusRing').textContent,
    btn: document.getElementById('qvPurchase').textContent
  }));
  c('QV-08', 'Quick View', '#qvPurchase (mark) then read the open panel',
    'panel status ring + button label refresh in place',
    qvAfterMark.ring === 'Đã mua' && qvAfterMark.btn === 'Hoàn tác đã mua',
    { observed: qvAfterMark, itemStatus: s.items[0].status });

  // edit from quick view: never stack two modals
  await page.click('#qvEdit');
  await sleep(700);
  const modal = await page.evaluate(() => ({ qvOpen: document.getElementById('qv').open, dlgOpen: document.getElementById('dlg').open }));
  c('QV-05', 'Quick View', '#qvEdit', 'quick view closes BEFORE the form opens (no stacked modals)',
    modal.qvOpen === false && modal.dlgOpen === true, modal);
  await page.click('#btnCancel');
  await sleep(300);

  // close button
  await page.click('#grid .wishlist-card .product-card__view');
  await sleep(400);
  await page.click('#qvClose');
  await sleep(600);
  c('QV-06', 'Quick View', '#qvClose', 'dialog closes cleanly',
    (await page.$eval('#qv', d => d.open)) === false, await page.$eval('#qv', d => d.open));

  // gallery / focus view
  await page.click('#v13FocusView');
  await sleep(250);
  let view = await snap(page);
  c('VIEW-01', 'View mode', '#v13FocusView', 'grid switches to focus + aria-pressed toggles',
    view.view === 'focus' && (await page.$eval('#v13FocusView', b => b.getAttribute('aria-pressed'))) === 'true' &&
    (await page.$eval('#v13GridView', b => b.getAttribute('aria-pressed'))) === 'false', view.view);
  c('VIEW-02', 'View mode', 'focus view', 'KPI unaffected by view mode',
    view.kpi.count === '1 món' && view.metrics.totalCount === 1, view.metrics);

  await page.click('#v13GridView');
  await sleep(250);
  view = await snap(page);
  c('VIEW-03', 'View mode', '#v13GridView', 'back to gallery',
    view.view === 'gallery' && (await page.$eval('#v13GridView', b => b.getAttribute('aria-pressed'))) === 'true', view.view);

  c('BUG-04', 'Console', 'status + quick view flow', 'no console errors',
    state.pageErrors.length === 0, state.pageErrors.slice(0, 3));
  await ctx.close();
}

// =====================================================================
// SCENARIO 6 — IMPORT / EXPORT
// =====================================================================
async function s6_io(browser) {
  section$('S6 IMPORT / EXPORT');
  const one = [{ id: 'io-1', name: 'Ghế công thái học', price: 4200000, image: '', link: '', status: 'saving', priority: 'high', category: 'Nội thất', note: 'lưng lưới', createdAt: 1700000000000 }];
  const { ctx, page, state } = await newScenario(browser, { guestItems: one });

  // export lives behind the "Công cụ" details menu
  await page.click('.nav-more summary');
  await sleep(200);
  const exportVisible = await page.$eval('#btnExport', b => {
    const r = b.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
  c('IO-00', 'Export', '.nav-more summary', 'opens the tools menu and reveals "#btnExport"',
    exportVisible, exportVisible);

  await page.evaluate(() => {
    window.__exportBlob = null;
    window.__exportName = null;
    URL.createObjectURL = (blob) => { window.__exportBlob = blob; return 'blob:mock-export'; };
    HTMLAnchorElement.prototype.click = function () { window.__exportName = this.download; };
  });
  await page.click('#btnExport');
  await sleep(400);
  const exported = await page.evaluate(async () => {
    const text = window.__exportBlob ? await window.__exportBlob.text() : null;
    return { text, name: window.__exportName };
  });
  let parsed = null;
  try { parsed = JSON.parse(exported.text); } catch (e) {}
  c('IO-01', 'Export', '#btnExport', 'downloads a JSON array of the whole list',
    Array.isArray(parsed) && parsed.length === 1 && parsed[0].id === 'io-1', { name: exported.name, parsed });
  c('IO-02', 'Export', 'filename', 'dated .json filename',
    /^wishlist-\d{4}-\d{2}-\d{2}\.json$/.test(exported.name || ''), exported.name);
  c('IO-03', 'Export', 'toast', 'confirms how many items were written',
    /Đã xuất 1 món/.test((await snap(page)).toast || ''), (await snap(page)).toast);

  // import — invalid JSON
  const badPath = path.join(TMP, 'f1-import-bad.json');
  fs.writeFileSync(badPath, '{ not json', 'utf8');
  const input = await page.$('#importFile');
  await input.uploadFile(badPath);
  await sleep(600);
  let s = await snap(page);
  c('IO-04', 'Import', '#importFile with malformed JSON', 'rejected, existing list untouched',
    s.itemCount === 1 && /JSON hợp lệ/.test(s.toast || ''), { items: s.itemCount, toast: s.toast });

  // import — wrong shape
  const shapePath = path.join(TMP, 'f1-import-shape.json');
  fs.writeFileSync(shapePath, JSON.stringify({ hello: 'world' }), 'utf8');
  await (await page.$('#importFile')).uploadFile(shapePath);
  await sleep(600);
  s = await snap(page);
  c('IO-05', 'Import', '#importFile with wrong shape', 'rejected, existing list untouched',
    s.itemCount === 1 && /cần một danh sách món/.test(s.toast || ''), { items: s.itemCount, toast: s.toast });

  // import — valid, replaces list (confirm accepted)
  const goodPath = path.join(TMP, 'f1-import-good.json');
  const incoming = [
    { id: 'imp-1', name: 'Bàn làm việc', price: 2500000, status: 'wish', priority: 'low', category: 'Nội thất', note: '' },
    { id: 'imp-2', name: 'Đèn bàn', price: 500000, status: 'purchased', priority: 'medium', category: 'Nội thất', note: '' }
  ];
  fs.writeFileSync(goodPath, JSON.stringify(incoming, null, 2), 'utf8');
  state.acceptDialogs = true;
  await (await page.$('#importFile')).uploadFile(goodPath);
  await sleep(800);
  s = await snap(page);
  c('IO-06', 'Import', '#importFile valid + confirm', 'list replaced by the file contents',
    s.itemCount === 2 && s.cards === 2 && s.items.some(i => i.name === 'Bàn làm việc'), { items: s.items });
  c('IO-07', 'Import', 'confirm prompt', 'asks before replacing the current list',
    state.dialogs.some(d => /Nhập 2 món/.test(d)), state.dialogs);
  c('KPI-60', 'KPI after import', 'globalMetrics()', 'recomputed from the imported list',
    s.metrics.totalCount === 2 && s.metrics.ownedCount === 1 && s.metrics.pendingValue === 2500000 &&
    s.metrics.ownedValue === 500000 && s.kpi.progress === '50%', s.metrics);

  // dismiss import → unchanged
  const thirdPath = path.join(TMP, 'f1-import-third.json');
  fs.writeFileSync(thirdPath, JSON.stringify([{ id: 'imp-9', name: 'Sẽ không nhập', price: 1 }]), 'utf8');
  state.acceptDialogs = false;
  await (await page.$('#importFile')).uploadFile(thirdPath);
  await sleep(600);
  s = await snap(page);
  c('IO-08', 'Import', 'confirm dismissed', 'list left exactly as it was',
    s.itemCount === 2 && !s.items.some(i => i.name === 'Sẽ không nhập'), s.items.map(i => i.name));

  c('BUG-05', 'Console', 'import/export flow', 'no console errors',
    state.pageErrors.length === 0, state.pageErrors.slice(0, 3));
  await ctx.close();
}

// =====================================================================
// SCENARIO 7 — GUEST / AUTH SESSION ISOLATION (V16 M1 regression + KPI)
// =====================================================================
async function s7_session(browser) {
  section$('S7 SESSION');
  const guest = [
    { id: 'g-1', name: 'Khách 1', price: 100000, image: '', link: '', status: 'wish', priority: 'low', category: 'G', note: '', createdAt: 1700000000000 },
    { id: 'g-2', name: 'Khách 2', price: 200000, image: '', link: '', status: 'purchased', priority: 'low', category: 'G', note: '', createdAt: 1700000000000 }
  ];
  const account = [
    { id: 'a-1', name: 'Tài khoản 1', price: 300000, image: '', link: '', status: 'wish', priority: 'high', category: 'A', note: '', createdAt: 1700000000000 },
    { id: 'a-2', name: 'Tài khoản 2', price: 400000, image: '', link: '', status: 'saving', priority: 'high', category: 'A', note: '', createdAt: 1700000000000 },
    { id: 'a-3', name: 'Tài khoản 3', price: 500000, image: '', link: '', status: 'purchased', priority: 'high', category: 'A', note: '', createdAt: 1700000000000 }
  ];
  const { ctx, page, state } = await newScenario(browser, {
    guestItems: guest, accountItems: account, uid: 'uid-demo'
  });

  let s = await snap(page);
  c('SESSION-01', 'Guest boot', 'first resolved session is guest', 'guest list shown with guest KPI',
    s.itemCount === 2 && s.cards === 2 && s.metrics.totalCount === 2 && s.metrics.pendingValue === 100000 &&
    s.metrics.ownedValue === 200000, s.metrics);

  // honour the redirect / popup result: user appears
  await page.evaluate(() => {
    window.__cloudSetUser({ uid: 'uid-demo', email: 'demo@example.com' });
    window.__cloudStatus('synced', 'demo@example.com');
  });
  await sleep(400);
  s = await snap(page);
  c('SESSION-02', 'Sign in', 'onUserChanged(uid-demo)', 'list swaps to the ACCOUNT cache (no guest mix)',
    s.itemCount === 3 && s.cards === 3 && !s.items.some(i => i.id.startsWith('g-')) &&
    s.metrics.totalCount === 3 && s.metrics.pendingValue === 700000 && s.metrics.ownedValue === 500000, s.metrics);
  c('SESSION-03', 'Sign in', 'KPI after sign in', 'progress 1/3 -> 33%, count "3 món"',
    s.kpi.progress === '33%' && s.kpi.count === '3 món', { p: s.kpi.progress, c: s.kpi.count });
  c('SESSION-04', 'Sign in', '#syncAccountState', 'shows the signed-in email',
    s.sync.account === 'demo@example.com', s.sync.account);

  // a real Firestore snapshot arrives (initial) — merge, KPI recomputed
  await page.evaluate(() => window.__cloudRemote([
    { id: 'a-1', name: 'Tài khoản 1', price: 300000, status: 'wish', priority: 'high', category: 'A' },
    { id: 'a-2', name: 'Tài khoản 2', price: 400000, status: 'saving', priority: 'high', category: 'A' },
    { id: 'a-3', name: 'Tài khoản 3', price: 500000, status: 'purchased', priority: 'high', category: 'A' },
    { id: 'a-4', name: 'Tài khoản 4', price: 600000, status: 'wish', priority: 'low', category: 'A' }
  ], true));
  await sleep(400);
  s = await snap(page);
  c('SESSION-05', 'Remote snapshot', 'onRemoteItems(initial)', 'union by id, KPI recomputed from merged list',
    s.itemCount === 4 && s.metrics.totalCount === 4 && s.metrics.pendingValue === 1300000 &&
    s.metrics.ownedValue === 500000, s.metrics);
  c('SESSION-06', 'Remote snapshot', 'KPI after merge', 'progress 1/4 -> 25%',
    s.kpi.progress === '25%' && s.kpi.count === '4 món', { p: s.kpi.progress, c: s.kpi.count });

  // logout through the real button
  await page.click('#btnSignOut');
  await sleep(500);
  s = await snap(page);
  c('SESSION-07', 'Sign out', '#btnSignOut', 'returns to the GUEST list, KPI back to guest values',
    s.itemCount === 2 && s.cards === 2 && s.metrics.pendingValue === 100000 && s.metrics.ownedValue === 200000 &&
    s.kpi.count === '2 món' && s.kpi.progress === '50%',
    { m: s.metrics, kpi: s.kpi });
  c('SESSION-08', 'Sign out', 'account data untouched', 'account cache still holds all 4 account items',
    JSON.parse(s.storage['wishlist.account.uid-demo'] || '[]').length === 4,
    JSON.parse(s.storage['wishlist.account.uid-demo'] || '[]').length);
  c('SESSION-09', 'Sign out', 'guest data untouched', 'guest list unchanged by the A->guest swap',
    JSON.parse(s.storage['wishlist.guest.items'] || '[]').length === 2,
    JSON.parse(s.storage['wishlist.guest.items'] || '[]').length);

  // stale snapshot after logout must be ignored
  await page.evaluate(() => window.__cloudRemote([
    { id: 'a-1', name: 'Tài khoản 1', price: 300000, status: 'wish', priority: 'high', category: 'A' }
  ], false));
  await sleep(400);
  s = await snap(page);
  c('SESSION-10', 'Stale snapshot', 'onRemoteItems after logout', 'ignored — guest list unchanged (M1 guard)',
    s.itemCount === 2 && !s.items.some(i => i.id.startsWith('a-')), s.items.map(i => i.id));

  // logging out must not push the guest list into the account
  const syncs = await page.evaluate(() => window.__cloudSyncs());
  c('SESSION-11', 'Sync safety', 'window.__cloud.syncs after logout', 'no sync recorded for the guest session',
    !syncs.some(batch => batch.includes('g-1')), syncs);

  // re-login restores exactly the account data
  await page.evaluate(() => {
    window.__cloudSetUser({ uid: 'uid-demo', email: 'demo@example.com' });
    window.__cloudStatus('synced', 'demo@example.com');
  });
  await sleep(500);
  s = await snap(page);
  c('SESSION-12', 'Re-login', 'onUserChanged(uid-demo) again', 'account list restored exactly (4 items)',
    s.itemCount === 4 && s.metrics.totalCount === 4 && s.metrics.pendingValue === 1300000, s.metrics);

  // A -> B must not mix
  await page.evaluate(() => {
    localStorage.setItem('wishlist.account.uid-other', JSON.stringify([
      { id: 'b-1', name: 'Tài khoản B', price: 900000, status: 'wish', priority: 'low', category: 'B' }
    ]));
    window.__cloudSetUser({ uid: 'uid-other', email: 'other@example.com' });
    window.__cloudStatus('synced', 'other@example.com');
  });
  await sleep(500);
  s = await snap(page);
  c('SESSION-13', 'A -> B', 'onUserChanged(uid-other)', 'B sees only B data, no A leakage',
    s.itemCount === 1 && s.items[0].id === 'b-1' && s.metrics.totalCount === 1 &&
    !s.items.some(i => i.id.startsWith('a-')), s.items.map(i => i.id));

  c('BUG-06', 'Console', 'session flow', 'no console errors',
    state.pageErrors.length === 0, state.pageErrors.slice(0, 3));
  await ctx.close();
}

// =====================================================================
// SCENARIO 8 — DEFENSIVE METRICS (corrupt prices, non-numeric)
// =====================================================================
async function s8_defensive(browser) {
  section$('S8 DEFENSIVE KPI');
  const dirty = [
    { id: 'd-1', name: 'Giá null', price: null, status: 'wish', priority: 'low', category: 'D', createdAt: 1 },
    { id: 'd-2', name: 'Giá chữ', price: 'abc', status: 'wish', priority: 'low', category: 'D', createdAt: 2 },
    { id: 'd-3', name: 'Giá âm', price: -5000, status: 'wish', priority: 'low', category: 'D', createdAt: 3 },
    { id: 'd-4', name: 'Giá hợp lệ', price: 750000, status: 'wish', priority: 'low', category: 'D', createdAt: 4 },
    { id: 'd-5', name: 'Không có giá', status: 'purchased', priority: 'low', category: 'D', createdAt: 5 }
  ];
  const { ctx, page, state } = await newScenario(browser, { guestItems: dirty });
  const s = await snap(page);

  c('KPI-70', 'KPI robustness', 'corrupt prices in storage', 'each bad price counts as 0, total is finite',
    Number.isFinite(s.metrics.pendingValue) && s.metrics.pendingValue === 750000 &&
    Number.isFinite(s.metrics.ownedValue) && s.metrics.ownedValue === 0, s.metrics);
  c('KPI-71', 'KPI robustness', '#sumTotal', 'renders as a number, never "NaN"',
    !/NaN/.test(s.kpi.total || '') && s.kpi.total === await fmt(page, 750000), s.kpi.total);
  c('KPI-72', 'KPI robustness', 'progress with 5 items / 1 owned', '20%, no division by zero',
    s.kpi.progress === '20%' && s.kpi.ariaNow === '20', s.kpi.progress);
  c('KPI-73', 'KPI robustness', 'items without a price field', 'counted in count, excluded from value',
    s.metrics.totalCount === 5 && s.metrics.ownedCount === 1 && s.metrics.pendingCount === 4, s.metrics);

  c('BUG-07', 'Console', 'corrupt data', 'no console errors while rendering',
    state.pageErrors.length === 0, state.pageErrors.slice(0, 3));
  await ctx.close();
}

// =====================================================================
// SCENARIO 9 — MOBILE LAYOUT OF THE NEW DASHBOARD BLOCK
// =====================================================================
async function s9_mobile(browser) {
  section$('S9 MOBILE');
  const list = makeItems(50);
  const { ctx, page, state } = await newScenario(browser, { guestItems: list }, { width: 390, height: 844, isMobile: true, hasTouch: true });
  const s = await snap(page);

  const geo = await page.evaluate(() => {
    const p = document.getElementById('dvProgress');
    const track = document.getElementById('dvProgressTrack');
    const r = p.getBoundingClientRect();
    return {
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
      width: Math.round(r.width),
      trackWidth: Math.round(track.getBoundingClientRect().width),
      fillWidth: Math.round(document.getElementById('dvProgressFill').getBoundingClientRect().width),
      fillStyle: document.getElementById('dvProgressFill').style.width
    };
  });
  c('MOBILE-01', 'Layout', 'dashboard at 390px', 'no horizontal overflow',
    geo.scrollWidth <= geo.innerWidth + 1, geo);
  c('MOBILE-02', 'Layout', 'progress track', 'fill is 24% of the track width',
    Math.abs(geo.fillWidth - geo.trackWidth * 0.24) <= 2, geo);
  c('MOBILE-03', 'Layout', 'progress block', 'fits inside the viewport',
    geo.width <= geo.innerWidth, geo);
  c('KPI-80', 'KPI', 'mobile', 'same numbers as desktop (metrics are layout independent)',
    s.kpi.count === '50 món' && s.kpi.progress === '24%', { c: s.kpi.count, p: s.kpi.progress });

  if (SHOTS) {
    await page.evaluate(() => window.scrollTo(0, document.querySelector('.dashboard-panel').offsetTop - 60));
    await sleep(300);
    await page.screenshot({ path: path.join(OUT, 'f1-s9-mobile-dashboard.png') });
  }
  c('BUG-08', 'Console', 'mobile', 'no console errors',
    state.pageErrors.length === 0, state.pageErrors.slice(0, 3));
  await ctx.close();
}

// =====================================================================
// MAIN
// =====================================================================
(async () => {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
  await new Promise(r => server.listen(PORT, r));
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--hide-scrollbars']
  });

  try {
    const scenarios = [
      ['S1 EMPTY', s1_empty],
      ['S2 ONE ITEM', s2_single],
      ['S3 50 ITEMS', s3_fifty],
      ['S4 CRUD', s4_crud],
      ['S5 STATUS / QUICK VIEW', s5_status_qv],
      ['S6 IMPORT / EXPORT', s6_io],
      ['S7 SESSION', s7_session],
      ['S8 DEFENSIVE KPI', s8_defensive],
      ['S9 MOBILE', s9_mobile]
    ];
    for (const [label, fn] of scenarios) {
      try {
        await fn(browser);
      } catch (e) {
        CHECK('HARNESS-' + label, 'Harness', label, 'scenario completes',
          'S0 ' + label + ' harness', false, String(e && e.message || e));
      }
    }
  } finally {
    await browser.close();
    server.close();
  }

  let current = '';
  results.forEach(r => {
    if (r.area && r.name.split(' · ')[0] !== current) {
      current = r.name.split(' · ')[0];
      console.log('\n--- ' + current + ' ---');
    }
    const tag = r.gate ? '' : ' (probe)';
    console.log((r.pass ? 'PASS ' : 'FAIL ') + '[' + r.id + '] ' + r.name + tag + (r.actual ? '  :: ' + r.actual : ''));
  });

  const gated = results.filter(r => r.gate);
  const pass = gated.filter(r => r.pass).length;
  const fails = gated.filter(r => !r.pass);
  const probes = results.filter(r => !r.gate);

  console.log('\n======================================');
  console.log(`F1 AUDIT: ${pass} PASS / ${fails.length} FAIL  (gated total ${gated.length})`);
  console.log(`Probes (out-of-scope defects, not gated): ${probes.length}`);
  probes.forEach(p => console.log('  ' + (p.pass ? 'BEHAVED' : 'DEFECT ') + p.id + ' — ' + p.name + ' :: ' + p.actual));
  if (fails.length) {
    console.log('\nFAILURES:');
    fails.forEach(f => console.log('  ' + f.id + ' — ' + f.name + ' :: ' + f.actual));
  }
  fs.writeFileSync(path.join(OUT, 'f1-audit-results.json'), JSON.stringify(results, null, 2), 'utf8');
  process.exit(fails.length ? 1 : 0);
})().catch(e => {
  console.error(e);
  try { server.close(); } catch (_) {}
  process.exit(2);
});
