// =====================================================================
// DREAM VAULT V16.1 - F2 PURCHASE FLOW 2.0 - FUNCTIONAL SUITE
// ---------------------------------------------------------------------
// Serves the real repo, stubs ONLY the cloud module (no Firebase network),
// drives the real entry points, and asserts observable behaviour.
// localStorage seeding simulates a returning user.
//
// usage: node v16_2-f2-check.js [repoRoot] [--shots]
// =====================================================================
const puppeteer = require('puppeteer-core');
const http = require('http');
const fs = require('fs');
const path = require('path');

const CHROME = process.env.CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT = process.argv[2] && !process.argv[2].startsWith('--')
  ? process.argv[2]
  : path.join(__dirname, '..', '..');
const PORT = 8133;
const SHOTS = process.argv.includes('--shots');
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

// Cloud stub. Records the EXACT payload handed to syncItems so the Firestore
// write path can be proven to carry the new purchase fields.
const MOCK = `
const state = { user: null, opts: null, syncs: [], statuses: [], uploads: 0 };
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
const ITEM = i => ({
  id: 'f2-' + i,
  name: 'M\u00f3n ' + i,
  price: 100000 + i * 1000,
  image: '', link: '',
  status: ['wish', 'saving', 'ordered', 'purchased'][i % 4],
  priority: ['low', 'medium', 'high'][i % 3],
  category: 'Nh\u00f3m ' + (i % 3),
  note: 'ghi ch\u00fa ' + i,
  createdAt: 1700000000000 + i
});
const makeItems = n => Array.from({ length: n }, (_, i) => ITEM(i + 1));

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
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);

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
  const cards = [...document.querySelectorAll('#grid .wishlist-card')];
  const storage = {};
  try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); storage[k] = localStorage.getItem(k); } } catch (e) {}
  let metrics = null;
  try { metrics = globalMetrics(); } catch (e) { metrics = { error: String(e && e.message || e) }; }
  const q = (i) => { const el = $id(i); return el ? el.value : null; };
  return {
    kpi: {
      total: txt('sumTotal'), spent: txt('sumSpent'), count: txt('sumCount'),
      progress: txt('dvProgressValue'),
      actualSpent: txt('dvActualSpent'),
      unpriced: txt('dvUnpriced'),
      caption: txt('dvProgressCaption'),
      ariaNow: attr('dvProgressTrack', 'aria-valuenow'),
      result: txt('resultStatus')
    },
    metrics,
    items: items.map(x => Object.assign({}, x)),
    itemCount: items.length,
    cards: cards.length,
    cardIds: cards.map(x => x.dataset.id),
    toast: (() => { const t = document.querySelector('.toast'); return t ? t.textContent : null; })(),
    toastAction: (() => { const a = document.querySelector('.toast__action'); return a ? a.textContent : null; })(),
    dlgOpen: $id('dlg').open,
    qvOpen: $id('qv').open,
    pdOpen: $id('pd') ? $id('pd').open : null,
    pd: {
      name: txt('pdName'), price: txt('pdPrice'),
      amount: q('pdAmount'), date: q('pdDate'),
      error: txt('pdError'),
      errorHidden: $id('pdError') ? $id('pdError').classList.contains('hidden') : null,
      confirmDisabled: $id('pdConfirm') ? $id('pdConfirm').disabled : null,
      confirmBusy: attr('pdConfirm', 'aria-busy')
    },
    tabs: {
      all: attr('tabAll', 'aria-pressed'),
      pending: attr('tabPending', 'aria-pressed'),
      owned: attr('tabOwned', 'aria-pressed')
    },
    empty: {
      hidden: $id('empty').classList.contains('hidden'),
      title: txt('emptyTitle'),
      action: txt('emptyAction')
    },
    view: $id('grid').dataset.v13View,
    storage
  };
};
const snap = page => page.evaluate(SNAP);

// ---------------------------------------------------------------------
// Shared interaction helpers
// ---------------------------------------------------------------------
const clickCard = (page, id, label) => page.evaluate((i, lab) => {
  const card = [...document.querySelectorAll('#grid .wishlist-card')].find(el => el.dataset.id === String(i));
  if (!card) throw new Error('card ' + i + ' not found');
  const btn = [...card.querySelectorAll('button')].find(b => b.textContent.trim() === lab);
  if (!btn) throw new Error('button ' + lab + ' not found on ' + i);
  btn.click();
}, id, label);

const setPdAmount = (page, amount, date) => page.evaluate((a, d) => {
  const el = document.getElementById('pdAmount');
  el.value = a;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  if (d !== undefined) {
    const dd = document.getElementById('pdDate');
    dd.value = d;
    dd.dispatchEvent(new Event('input', { bubbles: true }));
  }
}, amount, date);

const clickId = (page, id) => page.evaluate((i) => document.getElementById(i).click(), id);

const hasKey = (obj, k) => !!obj && Object.prototype.hasOwnProperty.call(obj, k);

const todayISO = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
};

// =====================================================================
// S0 - MODEL + METRICS (pure functions, no interaction)
// =====================================================================
async function s0_model(browser) {
  section$('S0 MODEL');
  const { ctx, page, state } = await newScenario(browser, { guestItems: [] });

  const model = await page.evaluate(() => {
    const base = (over) => Object.assign({
      id: 'x', name: 'n', price: 1000, image: '', link: '',
      status: 'wish', priority: 'medium', category: '', note: '', createdAt: 1
    }, over || {});

    // The same 50-item fixture the other scenarios use, rebuilt in-page.
    const FIFTY = Array.from({ length: 50 }, (_, i) => ({
      id: 'f2-' + (i + 1), name: 'Mon ' + (i + 1), price: 100000 + (i + 1) * 1000,
      image: '', link: '',
      status: ['wish', 'saving', 'ordered', 'purchased'][(i + 1) % 4],
      priority: ['low', 'medium', 'high'][(i + 1) % 3],
      category: 'Nhom ' + ((i + 1) % 3), note: '', createdAt: 1700000000000 + (i + 1)
    }));

    function B(o){ return Object.assign({ name: 'n', image: '', link: '', priority: 'medium', category: '', note: '', createdAt: 1 }, o); }

    return {
      keepPaid: normalizeItem(base({ status: 'purchased', paidAmount: 12345 })),
      keepAt: normalizeItem(base({ status: 'purchased', purchasedAt: 1710000000000 })),
      keepPrev: normalizeItem(base({ status: 'purchased', previousStatus: 'saving' })),
      legacyKeys: Object.keys(normalizeItem(base())),
      dropZeroString: normalizeItem(base({ status: 'purchased', paidAmount: '' })),
      dropNull: normalizeItem(base({ status: 'purchased', paidAmount: null })),
      dropNeg: normalizeItem(base({ status: 'purchased', paidAmount: -5 })),
      dropNaN: normalizeItem(base({ status: 'purchased', paidAmount: 'abc' })),
      dropInf: normalizeItem(base({ status: 'purchased', paidAmount: Infinity })),
      dropHuge: normalizeItem(base({ status: 'purchased', paidAmount: 1e30 })),
      zeroIsReal: normalizeItem(base({ status: 'purchased', paidAmount: 0 })),
      dropPrevPurchased: normalizeItem(base({ status: 'purchased', previousStatus: 'purchased' })),
      dropPrevBogus: normalizeItem(base({ status: 'purchased', previousStatus: 'khong-ton-tai' })),
      dropAtZero: normalizeItem(base({ status: 'purchased', purchasedAt: 0 })),
      strippedWhenNotPurchased: normalizeItem(base({ status: 'wish', paidAmount: 999, purchasedAt: 1710000000000, previousStatus: 'wish' })),

      vpa: [validPaidAmount(0), validPaidAmount('1500'), validPaidAmount(-1), validPaidAmount(''), validPaidAmount(null), validPaidAmount(1.6), validPaidAmount(1e30), validPaidAmount(Infinity)],
      vpat: [validPurchasedAt(0), validPurchasedAt(1710000000000), validPurchasedAt(-1), validPurchasedAt('abc'), validPurchasedAt('')],
      vps: [validPreviousStatus('wish'), validPreviousStatus('purchased'), validPreviousStatus('nope'), validPreviousStatus(null), validPreviousStatus(7)],

      restoreSaved: restoreStatusKey(base({ status: 'purchased', previousStatus: 'saving' })),
      restoreFallback: restoreStatusKey(base({ status: 'purchased' })),
      restoreNeverPurchased: restoreStatusKey(base({ status: 'purchased', previousStatus: 'purchased' })),
      restoreFromWish: restoreStatusKey(base({ status: 'wish' })),

      dateRoundTrip: epochToDateInput(dateInputToEpoch('2026-03-04')),
      dateBad: [dateInputToEpoch('2026-02-31'), dateInputToEpoch('nope'), dateInputToEpoch(''), dateInputToEpoch('2026-3-4')],

      m_empty: computeMetrics([]),
      m_skipped: computeMetrics([
        B({ id: 'a', price: 500000, status: 'purchased' }),
        B({ id: 'b', price: 300000, status: 'purchased', paidAmount: 250000 }),
        B({ id: 'c', price: 100000, status: 'wish' })
      ]),
      m_allPriced: computeMetrics([
        B({ id: 'a', price: 500000, status: 'purchased', paidAmount: 400000 }),
        B({ id: 'b', price: 300000, status: 'purchased', paidAmount: 0 })
      ]),
      m_paidOnUnpurchased: computeMetrics([
        B({ id: 'a', price: 500000, status: 'wish', paidAmount: 123 })
      ]),
      m_junkPaid: computeMetrics([
        B({ id: 'a', price: 1000, status: 'purchased', paidAmount: 'abc' }),
        B({ id: 'b', price: 2000, status: 'purchased', paidAmount: -3 })
      ]),
      m_50: computeMetrics(FIFTY)
    };
  });

  c('M-01', 'normalizeItem', 'valid paidAmount carried', 'kept as a number',
    model.keepPaid.paidAmount === 12345, model.keepPaid.paidAmount);
  c('M-02', 'normalizeItem', 'valid purchasedAt carried', 'kept as a number',
    model.keepAt.purchasedAt === 1710000000000, model.keepAt.purchasedAt);
  c('M-03', 'normalizeItem', 'valid previousStatus carried', 'kept',
    model.keepPrev.previousStatus === 'saving', model.keepPrev.previousStatus);
  c('M-04', 'normalizeItem', 'legacy row without the fields', 'no paidAmount / purchasedAt / previousStatus invented',
    model.legacyKeys.filter(k => /paidAmount|purchasedAt|previousStatus/.test(k)).length === 0,
    model.legacyKeys);
  c('M-05', 'normalizeItem', 'empty string / null / negative / NaN / Infinity / 1e30 paidAmount', 'all dropped, never stored as 0',
    !hasKey(model.dropZeroString, 'paidAmount') && !hasKey(model.dropNull, 'paidAmount') &&
    !hasKey(model.dropNeg, 'paidAmount') && !hasKey(model.dropNaN, 'paidAmount') &&
    !hasKey(model.dropInf, 'paidAmount') && !hasKey(model.dropHuge, 'paidAmount'),
    { s: model.dropZeroString.paidAmount, n: model.dropNull.paidAmount, g: model.dropNeg.paidAmount, a: model.dropNaN.paidAmount, i: model.dropInf.paidAmount, h: model.dropHuge.paidAmount });
  c('M-06', 'normalizeItem', 'paidAmount = 0', 'kept - a real 0 is not the same as skipped',
    hasKey(model.zeroIsReal, 'paidAmount') && model.zeroIsReal.paidAmount === 0, model.zeroIsReal);
  c('M-07', 'normalizeItem', 'previousStatus = "purchased" or unknown', 'dropped',
    !hasKey(model.dropPrevPurchased, 'previousStatus') && !hasKey(model.dropPrevBogus, 'previousStatus'),
    { p: model.dropPrevPurchased.previousStatus, b: model.dropPrevBogus.previousStatus });
  c('M-08', 'normalizeItem', 'purchasedAt = 0', 'dropped (never a fake date)',
    !hasKey(model.dropAtZero, 'purchasedAt'), model.dropAtZero.purchasedAt);
  c('M-09', 'normalizeItem', 'not purchased but carrying purchase fields', 'fields stripped - invariant enforced',
    !hasKey(model.strippedWhenNotPurchased, 'paidAmount') &&
    !hasKey(model.strippedWhenNotPurchased, 'purchasedAt') &&
    !hasKey(model.strippedWhenNotPurchased, 'previousStatus'), model.strippedWhenNotPurchased);

  c('M-10', 'validPaidAmount', '0 / "1500" / -1 / "" / null / 1.6 / 1e30 / Infinity',
    '0, 1500 kept; -1, "", null, 1e30, Infinity dropped; 1.6 rounds to 2',
    JSON.stringify(model.vpa) === JSON.stringify([0, 1500, null, null, null, 2, null, null]), model.vpa);
  c('M-11', 'validPurchasedAt', '0 / epoch / -1 / "abc" / ""', 'only a positive finite epoch survives',
    JSON.stringify(model.vpat) === JSON.stringify([null, 1710000000000, null, null, null]), model.vpat);
  c('M-12', 'validPreviousStatus', 'wish / purchased / unknown / null / 7', 'only a real non-purchased status survives',
    JSON.stringify(model.vps) === JSON.stringify(['wish', null, null, null, null]), model.vps);

  c('M-13', 'restoreStatusKey', 'previousStatus saved', 'returns the saved status',
    model.restoreSaved === 'saving', model.restoreSaved);
  c('M-14', 'restoreStatusKey', 'legacy purchased row, no previousStatus', 'falls back to the step before purchased ("ordered")',
    model.restoreFallback === 'ordered', model.restoreFallback);
  c('M-15', 'restoreStatusKey', 'previousStatus invalid', 'never returns "purchased"',
    model.restoreNeverPurchased !== 'purchased' && model.restoreNeverPurchased === 'ordered', model.restoreNeverPurchased);
  c('M-16', 'restoreStatusKey', 'item that is not purchased (wish)', 'stays on the default status, no crash',
    model.restoreFromWish === 'wish', model.restoreFromWish);

  c('M-17', 'date helpers', 'date input round-trip', '"2026-03-04" survives both directions',
    model.dateRoundTrip === '2026-03-04', model.dateRoundTrip);
  c('M-18', 'date helpers', 'over-flow / garbage / empty / non-padded dates', 'all rejected as null',
    model.dateBad.every(v => v === null), model.dateBad);

  c('M-20', 'computeMetrics', '0 items', 'every field 0/absent, no NaN',
    model.m_empty.totalCount === 0 && model.m_empty.progress === 0 &&
    model.m_empty.actualSpent === 0 && model.m_empty.unpricedOwnedCount === 0 &&
    model.m_empty.hasActualSpending === false, model.m_empty);
  c('M-21', 'computeMetrics', '2 purchased (1 skipped) + 1 pending',
    'owned 800000, actualSpent 250000, unpriced 1, pending 100000',
    model.m_skipped.ownedCount === 2 && model.m_skipped.ownedValue === 800000 &&
    model.m_skipped.actualSpent === 250000 && model.m_skipped.unpricedOwnedCount === 1 &&
    model.m_skipped.pricedOwnedCount === 1 && model.m_skipped.pendingValue === 100000,
    model.m_skipped);
  c('M-22', 'computeMetrics', 'all purchased items priced (incl. a real 0)', 'actualSpent 400000, unpricedOwnedCount 0',
    model.m_allPriced.actualSpent === 400000 && model.m_allPriced.unpricedOwnedCount === 0 &&
    model.m_allPriced.pricedOwnedCount === 2 && model.m_allPriced.hasActualSpending === true,
    model.m_allPriced);
  c('M-23', 'computeMetrics', 'paidAmount on a NON-purchased item', 'never counted as spending',
    model.m_paidOnUnpurchased.actualSpent === 0 && model.m_paidOnUnpurchased.unpricedOwnedCount === 0, model.m_paidOnUnpurchased);
  c('M-24', 'computeMetrics', '"abc" and -3 paidAmount', 'both treated as skipped, never NaN',
    model.m_junkPaid.actualSpent === 0 && model.m_junkPaid.unpricedOwnedCount === 2 &&
    Number.isFinite(model.m_junkPaid.actualSpent), model.m_junkPaid);
  c('M-25', 'computeMetrics', 'ownedValue is NOT actualSpent', 'the two are separate fields',
    ('ownedValue' in model.m_skipped) && ('actualSpent' in model.m_skipped) &&
    model.m_skipped.ownedValue !== model.m_skipped.actualSpent, null);
  c('M-26', 'computeMetrics', '50-item fixture', 'ownershipRate === progress, progressPercent 24, all fields finite',
    model.m_50.ownershipRate === model.m_50.progress && model.m_50.progressPercent === 24 &&
    model.m_50.totalCount === 50 && [model.m_50.ownedValue, model.m_50.actualSpent, model.m_50.pendingValue].every(Number.isFinite),
    { rate: model.m_50.ownershipRate, p: model.m_50.progress, pc: model.m_50.progressPercent });

  c('M-30', 'Contract', 'F1 fields still present', 'totalCount/ownedCount/pendingCount/ownedValue/pendingValue/trackedValue/progress/progressPercent',
    ['totalCount', 'ownedCount', 'pendingCount', 'ownedValue', 'pendingValue', 'trackedValue', 'progress', 'progressPercent']
      .every(k => k in model.m_50), Object.keys(model.m_50));

  c('BUG-0', 'Console', 'model scenario', 'no page errors',
    state.pageErrors.length === 0, state.pageErrors.slice(0, 3));
  await ctx.close();
}

// =====================================================================
// S1 - PURCHASE CAPTURE (F2.2)
// =====================================================================
const SEED3 = () => ([
  { id: 'i1', name: '\u00c1o kho\u00e1c', price: 500000, image: '', link: '', status: 'wish', priority: 'high', category: '\u00c1o', note: 'note1', createdAt: 1700000000001 },
  { id: 'i2', name: 'Gi\u00e0y', price: 900000, image: '', link: '', status: 'saving', priority: 'low', category: 'Gi\u00e0y', note: '', createdAt: 1700000000002 },
  { id: 'i3', name: 'T\u00fai', price: 300000, image: '', link: '', status: 'purchased', priority: 'medium', category: 'T\u00fai', note: 'note3', createdAt: 1700000000003 }
]);

async function s1_capture(browser) {
  section$('S1 CAPTURE');
  const { ctx, page, state } = await newScenario(browser, { guestItems: SEED3() });
  let s = await snap(page);

  c('P-01', 'entry', 'initial state', '3 items, one already purchased', s.itemCount === 3 && s.cards === 3, { n: s.itemCount, cards: s.cards });

  // ---- opening the dialog must not touch data -------------------------
  await clickCard(page, 'i1', '\u0110\u00e1nh d\u1ea5u \u0111\u00e3 mua');
  await sleep(140);
  s = await snap(page);
  const i1row = s.items.find(i => i.id === 'i1');
  c('P-02', 'card button', 'click Danh dau da mua', 'opens #pd, writes nothing yet',
    s.pdOpen === true && i1row.status === 'wish' && !hasKey(i1row, 'paidAmount'), { open: s.pdOpen, status: i1row.status });
  c('P-03', 'dialog content', 'product name + expected price', 'shows the name and 500.000',
    s.pd.name.indexOf('\u00c1o kho\u00e1c') > -1 && /500/.test(s.pd.price || ''), { n: s.pd.name, p: s.pd.price });
  c('P-04', 'dialog defaults', 'empty amount, today date, no error, confirm enabled',
    s.pd.amount === '' && s.pd.date === todayISO() && s.pd.errorHidden === true && s.pd.confirmDisabled === false,
    { a: s.pd.amount, d: s.pd.date, e: s.pd.errorHidden, dis: s.pd.confirmDisabled });
  c('P-05', 'dialog a11y', 'confirm button at rest', 'aria-busy = "false"',
    s.pd.confirmBusy === 'false', s.pd.confirmBusy);
  c('P-06', 'dialog a11y', 'focus starts in the amount field', '#pdAmount is the active element',
    await page.evaluate(() => document.activeElement && document.activeElement.id) === 'pdAmount',
    await page.evaluate(() => document.activeElement && document.activeElement.id));

  // ---- cancel ---------------------------------------------------------
  await clickId(page, 'pdCancel');
  await sleep(140);
  s = await snap(page);
  c('P-07', 'Huy', 'cancel the dialog', 'closes, zero data change',
    s.pdOpen === false && s.items.find(i => i.id === 'i1').status === 'wish' && s.itemCount === 3, s.pdOpen);
  c('P-08', 'Huy', 'focus returns to the card button', 'focus is on .mark-purchased',
    await page.evaluate(() => !!document.activeElement && document.activeElement.classList.contains('mark-purchased')),
    await page.evaluate(() => document.activeElement && document.activeElement.className));

  // ---- Escape ---------------------------------------------------------
  await clickCard(page, 'i1', '\u0110\u00e1nh d\u1ea5u \u0111\u00e3 mua');
  await sleep(120);
  await page.keyboard.press('Escape');
  await sleep(180);
  s = await snap(page);
  c('P-09', 'Escape', 'close with Escape', 'closes, zero data change',
    s.pdOpen === false && s.items.find(i => i.id === 'i1').status === 'wish' && s.itemCount === 3, s.pdOpen);

  // ---- invalid amount -> error + disabled -----------------------------
  await clickCard(page, 'i1', '\u0110\u00e1nh d\u1ea5u \u0111\u00e3 mua');
  await sleep(120);
  await setPdAmount(page, '1e30');
  await sleep(80);
  s = await snap(page);
  c('P-10', 'validation', 'amount = 1e30', 'error shown, Xac nhan disabled, nothing written',
    s.pd.errorHidden === false && s.pd.confirmDisabled === true && s.items.find(i => i.id === 'i1').status === 'wish',
    { e: s.pd.error, dis: s.pd.confirmDisabled });
  c('P-11', 'validation', 'aria-invalid on the amount input', 'set to "true" while invalid',
    await page.evaluate(() => document.getElementById('pdAmount').getAttribute('aria-invalid')) === 'true', null);

  await setPdAmount(page, '-5');
  await sleep(80);
  s = await snap(page);
  c('P-12', 'validation', 'amount = -5', 'error shown, Xac nhan disabled',
    s.pd.errorHidden === false && s.pd.confirmDisabled === true, s.pd.error);

  // a disabled confirm must be a no-op
  await clickId(page, 'pdConfirm');
  await sleep(100);
  s = await snap(page);
  c('P-13', 'validation', 'click a disabled Xac nhan', 'dialog stays open, no data change',
    s.pdOpen === true && s.items.find(i => i.id === 'i1').status === 'wish', s.pdOpen);

  // ---- valid amount ---------------------------------------------------
  await setPdAmount(page, '450000', '2026-03-04');
  await sleep(80);
  s = await snap(page);
  c('P-14', 'validation', 'amount back to a valid value', 'error cleared, Xac nhan enabled',
    s.pd.errorHidden === true && s.pd.confirmDisabled === false, s.pd.error);

  await clickId(page, 'pdConfirm');
  await sleep(240);
  s = await snap(page);
  const i1 = s.items.find(i => i.id === 'i1');
  c('P-15', '+Xac nhan', 'confirm a priced purchase', 'dialog closed, purchased with exact fields',
    s.pdOpen === false && i1.status === 'purchased' && i1.paidAmount === 450000 &&
    i1.previousStatus === 'wish' && i1.purchasedAt === new Date(2026, 2, 4).getTime(),
    { st: i1.status, paid: i1.paidAmount, prev: i1.previousStatus, at: i1.purchasedAt });
  c('P-16', '+Xac nhan', 'untouched fields survive', 'name/price/note/category/priority/image/link kept',
    i1.name === '\u00c1o kho\u00e1c' && i1.price === 500000 && i1.note === 'note1' &&
    i1.category === '\u00c1o' && i1.priority === 'high' && i1.image === '' && i1.link === '', i1);
  c('P-17', 'toast', 'success feedback with an action', 'toast shown with a "Hoan tac" button',
    /\u0111\u00e3 ghi/i.test(s.toast || '') && s.toastAction === 'Ho\u00e0n t\u00e1c', { t: s.toast, a: s.toastAction });
  c('P-18', 'KPI', 'global numbers move immediately', 'ownedValue 800000, actualSpent 450000, unpriced 1',
    s.metrics.ownedValue === 800000 && s.metrics.actualSpent === 450000 &&
    s.metrics.unpricedOwnedCount === 1, s.metrics);
  c('P-19', 'card', 'button flips to undo', 'text is "Hoan tac"',
    await page.evaluate(() => {
      const el = [...document.querySelectorAll('#grid .wishlist-card')].find(e => e.dataset.id === 'i1');
      return el.querySelector('.mark-purchased').textContent;
    }) === 'Ho\u00e0n t\u00e1c', null);
  c('P-20', 'toast action', 'click the toast action', 'invokes undo, item leaves purchased',
    await (async () => {
      await page.evaluate(() => document.querySelector('.toast__action').click());
      await sleep(220);
      const after = await snap(page);
      return after.items.find(i => i.id === 'i1').status !== 'purchased';
    })(), null);

  // ---- skip the price -------------------------------------------------
  await clickCard(page, 'i2', '\u0110\u00e1nh d\u1ea5u \u0111\u00e3 mua');
  await sleep(140);
  await clickId(page, 'pdSkip');
  await sleep(240);
  s = await snap(page);
  const i2 = s.items.find(i => i.id === 'i2');
  c('P-21', '+Bo qua gia', 'skip the price', 'purchased, NO paidAmount key at all, previousStatus kept',
    i2.status === 'purchased' && !hasKey(i2, 'paidAmount') &&
    i2.previousStatus === 'saving' && Number.isFinite(i2.purchasedAt),
    { st: i2.status, paid: i2.paidAmount, keys: Object.keys(i2), prev: i2.previousStatus });
  c('P-22', '+Bo qua gia', 'skipped price is not spending', 'actualSpent 0, unpriced 2 (i2 + the legacy i3)',
    s.metrics.actualSpent === 0 && s.metrics.unpricedOwnedCount === 2 && s.metrics.pricedOwnedCount === 0,
    s.metrics);
  c('P-23', '+Bo qua gia', 'toast says the price was skipped', 'mentions chua ghi gia thuc te',
    /ch\u01b0a ghi gi\u00e1 th\u1ef1c t\u1ebf/i.test(s.toast || ''), s.toast);

  // ---- confirm with an empty amount = optional price ------------------
  await page.evaluate(() => { const it = items.find(x => x.id === 'i3'); it.status = 'wish'; delete it.previousStatus; save(); render(); });
  await sleep(140);
  await clickCard(page, 'i3', '\u0110\u00e1nh d\u1ea5u \u0111\u00e3 mua');
  await sleep(140);
  await setPdAmount(page, '');
  await clickId(page, 'pdConfirm');
  await sleep(240);
  s = await snap(page);
  const i3 = s.items.find(i => i.id === 'i3');
  c('P-24', '+Xac nhan (empty)', 'confirm with an empty amount', 'purchased, no paidAmount, but a real date',
    i3.status === 'purchased' && !hasKey(i3, 'paidAmount') && Number.isFinite(i3.purchasedAt), i3);

  // ---- Quick View -----------------------------------------------------
  await page.evaluate(() => { const it = items.find(x => x.id === 'i1'); it.status = 'wish'; delete it.paidAmount; delete it.purchasedAt; delete it.previousStatus; save(); render(); });
  await sleep(140);
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('#grid .wishlist-card')].find(e => e.dataset.id === 'i1');
    el.querySelector('.product-card__view').click();
  });
  await sleep(300);
  s = await snap(page);
  c('P-25', 'Quick View', 'open QV on a non-purchased item', 'QV open, primary button says Danh dau da mua',
    s.qvOpen === true &&
    (await page.evaluate(() => document.getElementById('qvPurchase').textContent)) === '\u0110\u00e1nh d\u1ea5u \u0111\u00e3 mua', s.qvOpen);
  c('P-26', 'Quick View', 'purchase rows hidden while not purchased', 'both #qvPaidItem and #qvPurchasedItem hidden',
    await page.evaluate(() => document.getElementById('qvPaidItem').hidden && document.getElementById('qvPurchasedItem').hidden), null);

  await clickId(page, 'qvPurchase');
  await sleep(220);
  s = await snap(page);
  c('P-27', 'Quick View', 'QV purchase button', 'opens #pd on top of the still-open Quick View',
    s.pdOpen === true && s.qvOpen === true && s.items.find(i => i.id === 'i1').status === 'wish',
    { pd: s.pdOpen, qv: s.qvOpen });

  await setPdAmount(page, '400000', '2026-05-06');
  await clickId(page, 'pdConfirm');
  await sleep(300);
  s = await snap(page);
  const i1b = s.items.find(i => i.id === 'i1');
  c('P-28', 'Quick View', 'confirm from the QV', 'purchased, QV still open, panel refreshed in place',
    i1b.status === 'purchased' && i1b.paidAmount === 400000 && s.qvOpen === true, { st: i1b.status, qv: s.qvOpen });
  c('P-29', 'Quick View', 'QV now shows the recorded purchase', 'button is Hoan tac da mua and both rows visible',
    (await page.evaluate(() => document.getElementById('qvPurchase').textContent)) === 'Ho\u00e0n t\u00e1c \u0111\u00e3 mua' &&
    (await page.evaluate(() => document.getElementById('qvPaidItem').hidden)) === false &&
    (await page.evaluate(() => document.getElementById('qvPurchasedItem').hidden)) === false,
    await page.evaluate(() => ({
      btn: document.getElementById('qvPurchase').textContent,
      paid: document.getElementById('qvPaid').textContent,
      at: document.getElementById('qvPurchasedAt').textContent
    })));
  c('P-30', 'Quick View', 'toast is mounted inside the top layer', 'parent element is a DIALOG while a modal is open',
    await page.evaluate(() => {
      const t = document.querySelector('.toast');
      return !!t && !!t.parentElement && t.parentElement.tagName === 'DIALOG';
    }), null);

  await page.keyboard.press('Escape');
  await sleep(350);
  await page.keyboard.press('Escape');
  await sleep(350);
  s = await snap(page);
  c('P-31', 'Quick View', 'Escape closes the layers', 'QV closed, list intact',
    s.qvOpen === false && s.itemCount === 3, s.qvOpen);

  // ---- edit form: a genuinely legacy purchased row --------------------
  await page.evaluate(() => {
    const it = items.find(x => x.id === 'i3');
    it.status = 'purchased';
    delete it.paidAmount; delete it.purchasedAt; delete it.previousStatus;
    save(); render();
  });
  await sleep(180);
  await clickCard(page, 'i3', 'S\u1eeda');
  await sleep(240);
  s = await snap(page);
  c('P-32', 'edit form', 'open the form on a purchased row', 'purchase section visible, dialog open',
    s.dlgOpen === true && (await page.evaluate(() => !document.getElementById('purchaseSection').classList.contains('hidden'))), s.dlgOpen);
  c('P-33', 'edit form', 'legacy purchased row', 'date + amount empty (no fake date invented)',
    (await page.evaluate(() => [document.getElementById('fPaidAmount').value, document.getElementById('fPurchasedAt').value]))[0] === '' &&
    (await page.evaluate(() => [document.getElementById('fPaidAmount').value, document.getElementById('fPurchasedAt').value]))[1] === '',
    await page.evaluate(() => ({ paid: document.getElementById('fPaidAmount').value, at: document.getElementById('fPurchasedAt').value })));

  await page.evaluate(() => {
    document.getElementById('fPaidAmount').value = '275000';
    document.getElementById('fPurchasedAt').value = '2026-01-02';
  });
  await page.evaluate(() => document.getElementById('form').requestSubmit());
  await sleep(300);
  s = await snap(page);
  const i3b = s.items.find(i => i.id === 'i3');
  c('P-34', 'edit form', 'fill in the missing price later', 'paidAmount saved, date saved, previousStatus NOT invented',
    i3b.paidAmount === 275000 && i3b.purchasedAt === new Date(2026, 0, 2).getTime() &&
    !hasKey(i3b, 'previousStatus'),
    { paid: i3b.paidAmount, at: i3b.purchasedAt, prev: i3b.previousStatus });
  c('P-35', 'edit form', 'the unpriced counter drops', 'unpricedOwnedCount 1, actualSpent 675000',
    s.metrics.unpricedOwnedCount === 1 && s.metrics.actualSpent === 675000, s.metrics);

  // move a purchased row back out of purchased
  await clickCard(page, 'i3', 'S\u1eeda');
  await sleep(220);
  await page.evaluate(() => {
    const sel = document.getElementById('fStatus2');
    sel.value = 'wish';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await sleep(100);
  c('P-36', 'edit form', 'status select left Da mua', 'purchase section hides',
    (await page.evaluate(() => document.getElementById('purchaseSection').classList.contains('hidden'))) === true, null);
  await page.evaluate(() => document.getElementById('form').requestSubmit());
  await sleep(300);
  s = await snap(page);
  const i3c = s.items.find(i => i.id === 'i3');
  c('P-37', 'edit form', 'save a row that is no longer purchased', 'purchase fields cleared',
    i3c.status === 'wish' && !hasKey(i3c, 'paidAmount') && !hasKey(i3c, 'purchasedAt') && !hasKey(i3c, 'previousStatus'), i3c);
  c('P-38', 'KPI', 'metrics follow the row out', 'actualSpent 400000, ownedCount 2',
    s.metrics.actualSpent === 400000 && s.metrics.ownedCount === 2, s.metrics);

  // ---- Firestore write path -------------------------------------------
  await page.evaluate(() => {
    localStorage.setItem('wishlist.account.uid-demo', JSON.stringify(items));
  });
  await page.evaluate(() => window.__cloudSetUser({ uid: 'uid-demo', email: 'a@b.c' }));
  await sleep(300);
  await page.evaluate(() => { save(true); });
  await sleep(300);
  const lastSync = await page.evaluate(() => {
    const all = window.__cloudSyncs();
    return all.length ? all[all.length - 1] : null;
  });
  const sent = lastSync && lastSync.find(x => x.id === 'i1');
  c('P-39', 'Firestore path', 'syncItems payload carries the new fields', 'paidAmount + purchasedAt + previousStatus present',
    !!sent && sent.paidAmount === 400000 && Number.isFinite(sent.purchasedAt) && sent.previousStatus === 'wish', sent);
  const sentLegacy = lastSync && lastSync.find(x => x.id === 'i2');
  c('P-40', 'Firestore path', 'skipped price is not written as 0', 'no paidAmount key in the payload',
    !!sentLegacy && !hasKey(sentLegacy, 'paidAmount') && sentLegacy.status === 'purchased', sentLegacy);

  c('BUG-1', 'console', 'entire capture scenario', 'no page errors',
    state.pageErrors.length === 0, state.pageErrors.slice(0, 3));

  if (SHOTS) {
    await page.screenshot({ path: path.join(OUT, 's1-desktop.png') });
  }
  await ctx.close();
}

// =====================================================================
// S2 - CORRECT UNDO (F2.3)
// =====================================================================
const SEEDU = () => ([
  { id: 'u1', name: 'A', price: 100000, image: '', link: 'https://e.com/a', status: 'purchased', previousStatus: 'wish', paidAmount: 90000, purchasedAt: 1750000000000, priority: 'high', category: 'C1', note: 'n1', createdAt: 1700000000011 },
  { id: 'u2', name: 'B', price: 200000, image: '', link: '', status: 'purchased', previousStatus: 'saving', priority: 'low', category: 'C2', note: 'n2', createdAt: 1700000000012 },
  { id: 'u3', name: 'C', price: 300000, image: '', link: '', status: 'purchased', previousStatus: 'ordered', paidAmount: 50000, priority: 'medium', category: 'C1', note: '', createdAt: 1700000000013 },
  { id: 'u4', name: 'D', price: 400000, image: 'data:image/png;base64,iVBORw0KGgo=', link: 'https://e.com/d', status: 'purchased', priority: 'high', category: 'C3', note: 'legacy-note', createdAt: 1700000000014 },
  { id: 'u5', name: 'E', price: 500000, image: '', link: '', status: 'wish', priority: 'low', category: 'C2', note: 'untouched', createdAt: 1700000000015 },
  { id: 'u6', name: 'F', price: 600000, image: '', link: '', status: 'saving', priority: 'medium', category: 'C3', note: '', createdAt: 1700000000016 }
]);

const clickChip = (page, id) => page.evaluate((i) => {
  const card = [...document.querySelectorAll('#grid .wishlist-card')].find(el => el.dataset.id === String(i));
  if (!card) throw new Error('card ' + i);
  const chip = card.querySelector('.status-chip');
  if (!chip) throw new Error('no chip on ' + i);
  chip.click();
}, id);

const byId = (s, id) => s.items.find(x => x.id === id);

async function s2_undo(browser) {
  section$('S2 UNDO');
  const { ctx, page, state } = await newScenario(browser, { guestItems: SEEDU() });
  let s = await snap(page);

  c('U-01', 'seed', 'four purchased rows, two pending', '6 items, 4 owned, actualSpent 140000',
    s.itemCount === 6 && s.metrics.ownedCount === 4 && s.metrics.actualSpent === 140000 &&
    s.metrics.unpricedOwnedCount === 2, s.metrics);

  // ---- previousStatus is authoritative ---------------------------------
  await clickCard(page, 'u1', 'Ho\u00e0n t\u00e1c');
  await sleep(200);
  s = await snap(page);
  const u1 = byId(s, 'u1');
  c('U-02', 'undo', 'previousStatus = wish', 'restores exactly "wish"',
    u1.status === 'wish', u1.status);
  c('U-03', 'undo', 'purchase fields cleared', 'paidAmount / purchasedAt / previousStatus all gone',
    !hasKey(u1, 'paidAmount') && !hasKey(u1, 'purchasedAt') && !hasKey(u1, 'previousStatus'),
    { p: u1.paidAmount, a: u1.purchasedAt, v: u1.previousStatus });
  c('U-04', 'undo', 'nothing else is touched', 'price/note/image/link/category/priority/createdAt/name kept',
    u1.price === 100000 && u1.note === 'n1' && u1.image === '' && u1.link === 'https://e.com/a' &&
    u1.category === 'C1' && u1.priority === 'high' && u1.createdAt === 1700000000011 && u1.name === 'A',
    u1);
  c('U-05', 'undo', 'toast names the restored status', 'mentions "Muốn mua"',
    /\u0110\u00e3 ho\u00e0n t\u00e1c/.test(s.toast || '') && /Mu\u1ed1n mua/.test(s.toast || ''), s.toast);
  c('U-06', 'undo', 'card button flips back', 'text is "Đánh dấu đã mua"',
    await page.evaluate(() => {
      const el = [...document.querySelectorAll('#grid .wishlist-card')].find(e => e.dataset.id === 'u1');
      return el.querySelector('.mark-purchased').textContent;
    }) === '\u0110\u00e1nh d\u1ea5u \u0111\u00e3 mua', null);

  // ---- other previousStatus values ------------------------------------
  await clickCard(page, 'u2', 'Ho\u00e0n t\u00e1c');
  await sleep(200);
  s = await snap(page);
  c('U-07', 'undo', 'previousStatus = saving', 'restores "saving", no fields written',
    byId(s, 'u2').status === 'saving' && !hasKey(byId(s, 'u2'), 'paidAmount'), byId(s, 'u2'));

  await clickCard(page, 'u3', 'Ho\u00e0n t\u00e1c');
  await sleep(200);
  s = await snap(page);
  c('U-08', 'undo', 'previousStatus = ordered', 'restores "ordered", paidAmount 50000 removed',
    byId(s, 'u3').status === 'ordered' && !hasKey(byId(s, 'u3'), 'paidAmount'), byId(s, 'u3'));

  // ---- legacy row without previousStatus ------------------------------
  await clickCard(page, 'u4', 'Ho\u00e0n t\u00e1c');
  await sleep(200);
  s = await snap(page);
  const u4 = byId(s, 'u4');
  c('U-09', 'undo (legacy)', 'no previousStatus stored', 'falls back to the step before purchased ("ordered")',
    u4.status === 'ordered', u4.status);
  c('U-10', 'undo (legacy)', 'a legacy image / note / link survive', 'image, note and link unchanged',
    u4.image === 'data:image/png;base64,iVBORw0KGgo=' && u4.note === 'legacy-note' &&
    u4.link === 'https://e.com/d' && u4.price === 400000, u4);

  // ---- nothing else moved ---------------------------------------------
  c('U-11', 'isolation', 'the two pending rows are untouched', 'u5 wish / u6 saving, notes intact',
    byId(s, 'u5').status === 'wish' && byId(s, 'u6').status === 'saving' &&
    byId(s, 'u5').note === 'untouched' && byId(s, 'u5').price === 500000, { u5: byId(s, 'u5'), u6: byId(s, 'u6') });
  c('U-12', 'isolation', 'list is still complete', '6 items, 0 purchased, 6 cards on screen',
    s.itemCount === 6 && s.metrics.ownedCount === 0 && s.cards === 6, { m: s.metrics, cards: s.cards });
  c('U-13', 'KPI', 'actualSpent is back to zero', 'ownedValue 0, pendingValue 2100000',
    s.metrics.actualSpent === 0 && s.metrics.ownedValue === 0 && s.metrics.pendingValue === 2100000, s.metrics);

  // ---- undo of a non-purchased row is a no-op -------------------------
  const noop = await page.evaluate(() => undoPurchased('u5'));
  s = await snap(page);
  c('U-14', 'undo', 'undo a NON-purchased row', 'returns false and changes nothing',
    noop === false && byId(s, 'u5').status === 'wish', { r: noop, st: byId(s, 'u5').status });

  // ---- status chip into purchased -------------------------------------
  await clickChip(page, 'u6');
  await sleep(140);
  s = await snap(page);
  c('U-15', 'status chip', 'saving -> ordered', 'ordered, no purchase fields yet',
    byId(s, 'u6').status === 'ordered' && !hasKey(byId(s, 'u6'), 'paidAmount'), byId(s, 'u6'));
  await clickChip(page, 'u6');
  await sleep(160);
  s = await snap(page);
  const u6 = byId(s, 'u6');
  c('U-16', 'status chip', 'ordered -> purchased', 'records previousStatus = ordered, NO invented price or date',
    u6.status === 'purchased' && u6.previousStatus === 'ordered' &&
    !hasKey(u6, 'paidAmount') && !hasKey(u6, 'purchasedAt'),
    { st: u6.status, prev: u6.previousStatus, keys: Object.keys(u6) });
  c('U-17', 'KPI', 'chip purchase counts as owned but not as spending', 'ownedCount 1, actualSpent 0, unpriced 1',
    s.metrics.ownedCount === 1 && s.metrics.actualSpent === 0 && s.metrics.unpricedOwnedCount === 1, s.metrics);

  await clickCard(page, 'u6', 'Ho\u00e0n t\u00e1c');
  await sleep(200);
  s = await snap(page);
  c('U-18', 'status chip + undo', 'undo a chip purchase', 'returns to "ordered", fields cleared',
    byId(s, 'u6').status === 'ordered' && !hasKey(byId(s, 'u6'), 'previousStatus'), byId(s, 'u6'));

  // ---- Quick View undo -------------------------------------------------
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('#grid .wishlist-card')].find(e => e.dataset.id === 'u3');
    el.querySelector('.product-card__view').click();
  });
  await sleep(300);
  // make u3 purchased again through the dialog, then undo it from the QV
  await page.evaluate(() => {
    const it = items.find(x => x.id === 'u3');
    it.status = 'purchased'; it.paidAmount = 77000; it.purchasedAt = 1750000000000; it.previousStatus = 'saving';
    save(); render();
  });
  await sleep(200);
  await page.evaluate(() => { const id = document.getElementById('qv').dataset.id; });
  // QV was opened for u3 before the state change; refresh it
  // closeQuickView() returns a Promise that resolves when the exit animation
  // has actually finished, so awaiting it is deterministic instead of guessing
  // a sleep that the main thread might not honour under load.
  await page.evaluate(() => closeQuickView());
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('#grid .wishlist-card')].find(e => e.dataset.id === 'u3');
    el.querySelector('.product-card__view').click();
  });
  await sleep(300);
  s = await snap(page);
  c('U-19', 'Quick View', 'QV on a purchased row', 'button is "Hoàn tác đã mua", paid row visible',
    (await page.evaluate(() => document.getElementById('qvPurchase').textContent)) === 'Ho\u00e0n t\u00e1c \u0111\u00e3 mua' &&
    (await page.evaluate(() => document.getElementById('qvPaidItem').hidden)) === false, s.qvOpen);
  await clickId(page, 'qvPurchase');
  await sleep(300);
  s = await snap(page);
  c('U-20', 'Quick View', 'undo from the panel', 'status "saving", fields cleared, panel refreshed in place',
    byId(s, 'u3').status === 'saving' && !hasKey(byId(s, 'u3'), 'paidAmount') &&
    (await page.evaluate(() => document.getElementById('qvPurchase').textContent)) === '\u0110\u00e1nh d\u1ea5u \u0111\u00e3 mua' &&
    (await page.evaluate(() => document.getElementById('qvPaidItem').hidden)) === true,
    byId(s, 'u3'));
  await page.keyboard.press('Escape');
  await sleep(350);

  // ---- two-way sync does not resurrect the undone purchase ------------
  await page.evaluate(() => {
    const it = items.find(x => x.id === 'u1');
    it.status = 'purchased'; it.paidAmount = 111000; it.purchasedAt = 1750000000000; it.previousStatus = 'wish';
    save(); render();
  });
  await page.evaluate(() => { localStorage.setItem('wishlist.account.uid-demo', JSON.stringify(items)); });
  await page.evaluate(() => window.__cloudSetUser({ uid: 'uid-demo', email: 'a@b.c' }));
  await sleep(300);
  await page.evaluate(() => { save(true); });
  await sleep(250);
  await clickCard(page, 'u1', 'Ho\u00e0n t\u00e1c');
  await sleep(250);
  await page.evaluate(() => { save(true); });
  await sleep(250);
  s = await snap(page);
  const syncU1 = await page.evaluate(() => {
    const all = window.__cloudSyncs();
    const last = all[all.length - 1];
    return last.find(x => x.id === 'u1');
  });
  c('U-21', 'two-way sync', 'payload after an undo', 'the uploaded document carries no purchase fields',
    !!syncU1 && syncU1.status === 'wish' && !hasKey(syncU1, 'paidAmount') &&
    !hasKey(syncU1, 'purchasedAt') && !hasKey(syncU1, 'previousStatus'), syncU1);
  c('U-22', 'two-way sync', 'local row after the push', 'still not purchased',
    byId(s, 'u1').status === 'wish' && !hasKey(byId(s, 'u1'), 'paidAmount'), byId(s, 'u1'));

  await page.evaluate(() => {
    const last = window.__cloudSyncs();
    window.__cloudRemote(JSON.parse(JSON.stringify(last[last.length - 1])), false);
  });
  await sleep(250);
  s = await snap(page);
  c('U-23', 'two-way sync', 'server snapshot echoes the undo', 'item stays out of purchased',
    byId(s, 'u1').status === 'wish' && !hasKey(byId(s, 'u1'), 'paidAmount'), byId(s, 'u1'));

  c('BUG-2', 'console', 'entire undo scenario', 'no page errors',
    state.pageErrors.length === 0, state.pageErrors.slice(0, 3));

  await ctx.close();
}

// =====================================================================
// S3 - COLLECTION QUICK TABS (F2.4)
// =====================================================================
const SEEDT = () => ([
  { id: 't1', name: 'Alpha wish', price: 100000, image: '', link: '', status: 'wish', priority: 'high', category: 'X', note: 'findme', createdAt: 1700000000021 },
  { id: 't2', name: 'Beta saving', price: 200000, image: '', link: '', status: 'saving', priority: 'low', category: 'X', note: '', createdAt: 1700000000022 },
  { id: 't3', name: 'Gamma ordered', price: 300000, image: '', link: '', status: 'ordered', priority: 'medium', category: 'Y', note: '', createdAt: 1700000000023 },
  { id: 't4', name: 'Delta owned', price: 400000, image: '', link: '', status: 'purchased', paidAmount: 380000, purchasedAt: 1750000000000, previousStatus: 'ordered', priority: 'high', category: 'Y', note: 'findme-owned', createdAt: 1700000000024 },
  { id: 't5', name: 'Epsilon owned', price: 500000, image: '', link: '', status: 'purchased', previousStatus: 'wish', priority: 'low', category: 'X', note: '', createdAt: 1700000000025 }
]);

const clickTab = (page, which) => page.evaluate((w) => document.getElementById('tab' + w).click(), which);

async function s3_tabs(browser) {
  section$('S3 TABS');
  const { ctx, page, state } = await newScenario(browser, { guestItems: SEEDT() });
  let s = await snap(page);

  const baseMetrics = JSON.stringify(s.metrics);

  c('T-01', 'default', 'initial tab', '"Tất cả" pressed, all 5 cards',
    s.tabs.all === 'true' && s.tabs.pending === 'false' && s.tabs.owned === 'false' && s.cards === 5,
    { t: s.tabs, cards: s.cards });

  // ---- Chua mua -------------------------------------------------------
  await clickTab(page, 'Pending');
  await sleep(160);
  s = await snap(page);
  c('T-02', 'Chua mua', 'filter to not-purchased', '3 cards, only non-purchased ids',
    s.cards === 3 && s.cardIds.slice().sort().join(',') === 't1,t2,t3', { cards: s.cardIds, pressed: s.tabs });
  c('T-03', 'Chua mua', 'aria-pressed', 'only "Chưa mua" is pressed',
    s.tabs.pending === 'true' && s.tabs.all === 'false' && s.tabs.owned === 'false', s.tabs);
  c('T-04', 'KPI independence', 'switch tabs', 'every global number is byte-identical',
    JSON.stringify(s.metrics) === baseMetrics, { before: baseMetrics, after: JSON.stringify(s.metrics) });
  c('T-05', 'resultStatus', 'live count line', '"Đang hiển thị 3 trên 5 món."',
    s.kpi.result === '\u0110ang hi\u1ec3n th\u1ecb 3 tr\u00ean 5 m\u00f3n.', s.kpi.result);

  // ---- Da mua ---------------------------------------------------------
  await clickTab(page, 'Owned');
  await sleep(160);
  s = await snap(page);
  c('T-06', 'Da mua', 'filter to purchased', '2 cards, only purchased ids',
    s.cards === 2 && s.cardIds.slice().sort().join(',') === 't4,t5', s.cardIds);

  // ---- Tat ca ---------------------------------------------------------
  await clickTab(page, 'All');
  await sleep(160);
  s = await snap(page);
  c('T-07', 'Tat ca', 'back to everything', '5 cards',
    s.cards === 5 && s.tabs.all === 'true', s.cards);

  // ---- composes with search -------------------------------------------
  await clickTab(page, 'Pending');
  await sleep(140);
  await page.evaluate(() => {
    const q = document.getElementById('q');
    q.value = 'findme-owned';
    q.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await sleep(320);
  s = await snap(page);
  c('T-08', 'tab + search', 'pending tab + a term that only matches an owned item', '0 cards, empty panel visible',
    s.cards === 0 && s.empty.hidden === false, { cards: s.cards, hidden: s.empty.hidden });
  c('T-09', 'empty copy', 'tab-specific wording', 'names the tab, not "no search results"',
    /ch\u1edd mua/.test(s.empty.title || '') && s.empty.action === 'Xem t\u1ea5t c\u1ea3', s.empty);

  await clickId(page, 'emptyAction');
  await sleep(200);
  s = await snap(page);
  c('T-10', 'empty action', '"Xem tất cả"', 'tab resets to Tất cả, the search term stays (1 card)',
    s.tabs.all === 'true' && s.cards === 1, { tabs: s.tabs, cards: s.cards });

  await page.evaluate(() => {
    const q = document.getElementById('q');
    q.value = '';
    q.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await sleep(320);

  // ---- composes with the advanced status filter -----------------------
  await page.evaluate(() => {
    const sel = document.getElementById('fStatus');
    sel.value = 'purchased';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await sleep(200);
  s = await snap(page);
  c('T-11', 'tab + fStatus', 'Tất cả + status=purchased', '2 cards',
    s.cards === 2 && s.cardIds.slice().sort().join(',') === 't4,t5', s.cardIds);

  await clickTab(page, 'Pending');
  await sleep(200);
  s = await snap(page);
  c('T-12', 'tab + fStatus', 'Chưa mua + status=purchased', 'honest AND: 0 cards',
    s.cards === 0, s.cards);

  await clickId(page, 'btnClearFilter');
  await sleep(220);
  s = await snap(page);
  c('T-13', 'clear filter', 'Xóa bộ lọc', 'resets the tab to "Tất cả" as well',
    s.tabs.all === 'true' && s.cards === 5, { tabs: s.tabs, cards: s.cards });

  // ---- sort + view mode -----------------------------------------------
  await clickTab(page, 'Owned');
  await sleep(160);
  await page.evaluate(() => {
    const sel = document.getElementById('fSort');
    sel.value = 'price-asc';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await sleep(200);
  s = await snap(page);
  c('T-14', 'tab + sort', 'Đã mua + price ascending', 'owned items in price order',
    s.cardIds.join(',') === 't4,t5', s.cardIds);

  await clickId(page, 'v13FocusView');
  await sleep(200);
  await clickTab(page, 'Pending');
  await sleep(240);
  s = await snap(page);
  c('T-15', 'tab + view mode', 'switch tabs while in focus view', 'focus view is preserved',
    s.view === 'focus' && s.cards === 3, { view: s.view, cards: s.cards });
  await clickId(page, 'v13GridView');
  await sleep(200);
  await clickId(page, 'btnClearFilter');
  await sleep(220);

  // ---- purchase while on the "Chua mua" tab ---------------------------
  await clickTab(page, 'Pending');
  await sleep(200);
  s = await snap(page);
  c('T-16', 'purchase on tab', 'starting point', '3 pending cards',
    s.cards === 3 && s.tabs.pending === 'true', s.cards);

  await clickCard(page, 't1', '\u0110\u00e1nh d\u1ea5u \u0111\u00e3 mua');
  await sleep(160);
  await setPdAmount(page, '95000', '2026-04-05');
  await clickId(page, 'pdConfirm');
  await sleep(280);
  s = await snap(page);
  c('T-17', 'purchase on tab', 'confirm while on "Chưa mua"', 'the card leaves the list',
    s.cards === 2 && s.cardIds.indexOf('t1') === -1 && s.tabs.pending === 'true', { cards: s.cardIds });
  c('T-18', 'purchase on tab', 'no surprise navigation', 'still on the "Chưa mua" tab',
    s.tabs.pending === 'true' && s.tabs.owned === 'false', s.tabs);
  c('T-19', 'purchase on tab', 'toast offers the owned tab', 'action label is "Xem đã mua"',
    s.toastAction === 'Xem \u0111\u00e3 mua', s.toastAction);
  c('T-20', 'KPI independence', 'purchase changed global numbers, not the view', 'actualSpent 475000',
    s.metrics.actualSpent === 475000 && s.metrics.ownedCount === 3, s.metrics);

  await page.evaluate(() => document.querySelector('.toast__action').click());
  await sleep(300);
  s = await snap(page);
  c('T-21', 'purchase on tab', 'click "Xem đã mua"', 'tab is Đã mua and t1 is there',
    s.tabs.owned === 'true' && s.cardIds.indexOf('t1') > -1 && s.cards === 3, { tabs: s.tabs, cards: s.cardIds });

  // ---- purchase while on "Tat ca" -------------------------------------
  await clickTab(page, 'All');
  await sleep(200);
  s = await snap(page);
  const before = s.cardIds.join(',');
  await clickCard(page, 't2', '\u0110\u00e1nh d\u1ea5u \u0111\u00e3 mua');
  await sleep(160);
  await clickId(page, 'pdSkip');
  await sleep(280);
  s = await snap(page);
  c('T-22', 'purchase on "Tất cả"', 'the card stays in place', 'same ids in the same order',
    s.cardIds.join(',') === before && s.cards === 5, { before: before, after: s.cardIds.join(',') });
  c('T-23', 'purchase on "Tất cả"', 'state changed, position did not', 't2 is now purchased',
    byId(s, 't2').status === 'purchased', byId(s, 't2'));
  c('T-24', 'purchase on "Tất cả"', 'toast offers undo here', 'action label is "Hoàn tác"',
    s.toastAction === 'Ho\u00e0n t\u00e1c', s.toastAction);

  // ---- the tab is UI state only ---------------------------------------
  c('T-25', 'not persisted', 'localStorage keys', 'no tab / purchase-tab key was written',
    Object.keys(s.storage).every(k => !/tab/i.test(k.replace('wishlist.ge', ''))) &&
    Object.keys(s.storage).filter(k => /^wishlist\./.test(k)).sort().join(',') ===
      'wishlist.guest.items',
    Object.keys(s.storage));

  c('BUG-3', 'console', 'entire tabs scenario', 'no page errors',
    state.pageErrors.length === 0, state.pageErrors.slice(0, 3));

  await ctx.close();
}

// =====================================================================
// S4 - DASHBOARD METRICS (F2.5)
// =====================================================================
const SEEDD = () => ([
  { id: 'd1', name: 'D1', price: 200000, image: '', link: '', status: 'purchased', paidAmount: 100000, purchasedAt: 1750000000000, previousStatus: 'saving', priority: 'high', category: 'C', note: '', createdAt: 1700000000031 },
  { id: 'd2', name: 'D2', price: 300000, image: '', link: '', status: 'purchased', previousStatus: 'wish', priority: 'low', category: 'C', note: '', createdAt: 1700000000032 },
  { id: 'd3', name: 'D3', price: 400000, image: '', link: '', status: 'purchased', paidAmount: 0, purchasedAt: 1750000000000, previousStatus: 'ordered', priority: 'medium', category: 'C', note: '', createdAt: 1700000000033 },
  { id: 'd4', name: 'D4', price: 500000, image: '', link: '', status: 'wish', priority: 'high', category: 'C', note: '', createdAt: 1700000000034 },
  { id: 'd5', name: 'D5', price: 700000, image: '', link: '', status: 'ordered', priority: 'low', category: 'C', note: '', createdAt: 1700000000035 }
]);

const money = (page, n) => page.evaluate(v => fmtMoney(v), n);

async function s4_dashboard(browser) {
  section$('S4 DASHBOARD');
  const { ctx, page, state } = await newScenario(browser, { guestItems: SEEDD() });
  let s = await snap(page);

  const m200 = await money(page, 900000);
  const m1200 = await money(page, 1200000);
  const m100 = await money(page, 100000);

  c('D-01', 'KPI triad', 'three headline numbers', 'owned 900000 / pending 1200000 / 5 món',
    s.kpi.spent === m200 && s.kpi.total === m1200 && s.kpi.count === '5 m\u00f3n',
    { spent: s.kpi.spent, total: s.kpi.total, count: s.kpi.count });
  c('D-02', 'recorded spending', 'the new figure', '#dvActualSpent shows 100000 (only real paidAmounts)',
    s.kpi.actualSpent === m100, s.kpi.actualSpent);
  c('D-03', 'recorded spending', 'owned value vs actual spending', 'the two figures are different numbers',
    s.kpi.spent !== s.kpi.actualSpent, { owned: s.kpi.spent, spent: s.kpi.actualSpent });
  c('D-04', 'unpriced counter', 'one owned row without a price', '#dvUnpriced says "1 món"',
    s.kpi.unpriced === '1 m\u00f3n', s.kpi.unpriced);
  c('D-05', 'ownership rate', 'purchased / total by item count', '60%',
    s.kpi.progress === '60%' && s.metrics.progressPercent === 60, s.kpi.progress);
  c('D-06', 'labelling', '"Giá trị đã sở hữu" disclaimer', 'its description says it is not actual spending',
    await page.evaluate(() => {
      const cards = [...document.querySelectorAll('.stat-card')];
      const card = cards.find(c => c.querySelector('#sumSpent'));
      const txt = card.querySelector('.stat-card__description').textContent;
      return /ch\u01b0a ph\u1ea3i chi ti\u00eau th\u1ef1c t\u1ebf/.test(txt);
    }), null);

  // ---- independent of search / filter / tab ---------------------------
  // `result` is the one field that is SUPPOSED to follow the view, so it is
  // excluded from the "nothing moved" comparison.
  const kpiCore = (snapObj) => {
    const k = Object.assign({}, snapObj.kpi);
    delete k.result;
    return k;
  };
  const before = JSON.stringify({ k: kpiCore(s), m: s.metrics });
  await page.evaluate(() => {
    const q = document.getElementById('q');
    q.value = 'zzz-no-match';
    q.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await sleep(320);
  s = await snap(page);
  c('D-07', 'independent of search', 'search that matches nothing', 'every global KPI byte-identical',
    JSON.stringify({ k: kpiCore(s), m: s.metrics }) === before, { after: kpiCore(s) });
  c('D-08', 'independent of search', 'result line still reports the view', '0 cards but the KPI line is unchanged',
    s.cards === 0 && s.kpi.spent === m200, { cards: s.cards, spent: s.kpi.spent });

  await page.evaluate(() => {
    const q = document.getElementById('q');
    q.value = '';
    q.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await sleep(320);
  await clickTab(page, 'Pending');
  await sleep(220);
  s = await snap(page);
  c('D-09', 'independent of the tabs', 'on the "Chưa mua" tab', 'still 900000 / 100000 / 60%',
    s.kpi.spent === m200 && s.kpi.actualSpent === m100 && s.kpi.progress === '60%',
    { spent: s.kpi.spent, actual: s.kpi.actualSpent, p: s.kpi.progress });
  await clickTab(page, 'All');
  await sleep(200);

  // ---- live update on purchase / undo ---------------------------------
  await clickCard(page, 'd4', '\u0110\u00e1nh d\u1ea5u \u0111\u00e3 mua');
  await sleep(160);
  await setPdAmount(page, '650000', '2026-06-07');
  await clickId(page, 'pdConfirm');
  await sleep(300);
  s = await snap(page);
  c('D-10', 'live update', 'purchase a priced item', 'actualSpent 750000, owned 1400000, 80%',
    s.kpi.actualSpent === (await money(page, 750000)) &&
    s.kpi.spent === (await money(page, 1400000)) &&
    s.kpi.progress === '80%', { spent: s.kpi.actualSpent, owned: s.kpi.spent, p: s.kpi.progress });
  c('D-11', 'live update', 'unpriced counter', 'still 1 món (D2)',
    s.kpi.unpriced === '1 m\u00f3n', s.kpi.unpriced);

  await clickCard(page, 'd4', 'Ho\u00e0n t\u00e1c');
  await sleep(300);
  s = await snap(page);
  c('D-12', 'live update', 'undo it again', 'every number returns exactly',
    s.kpi.actualSpent === m100 && s.kpi.spent === m200 && s.kpi.progress === '60%' &&
    s.kpi.unpriced === '1 m\u00f3n', { spent: s.kpi.actualSpent, owned: s.kpi.spent, p: s.kpi.progress });
  c('D-13', 'live update', 'the undone row left no trace', 'no paidAmount anywhere on d4',
    !hasKey(byId(s, 'd4'), 'paidAmount'), byId(s, 'd4'));

  // ---- empty state ----------------------------------------------------
  await page.evaluate(() => { items = []; save(); render(); });
  await sleep(200);
  s = await snap(page);
  c('D-14', 'empty collection', '0 items', 'no NaN anywhere, 0% and honest empty wording',
    s.kpi.spent === await money(page, 0) && s.kpi.total === await money(page, 0) &&
    s.kpi.count === '0 m\u00f3n' && s.kpi.progress === '0%' &&
    s.kpi.actualSpent === 'Ch\u01b0a ghi nh\u1eadn' && s.kpi.unpriced === 'Kh\u00f4ng c\u00f2n m\u00f3n n\u00e0o' &&
    s.kpi.ariaNow === '0',
    { k: s.kpi });
  c('D-15', 'empty collection', 'search / filter / tab still cannot move it', 'identical after touching every control',
    await (async () => {
      await clickTab(page, 'Owned');
      await sleep(180);
      const a = await snap(page);
      await clickId(page, 'btnClearFilter');
      await sleep(200);
      return a.kpi.actualSpent === 'Ch\u01b0a ghi nh\u1eadn' && a.kpi.progress === '0%';
    })(), null);

  c('BUG-4a', 'console', 'dashboard scenario', 'no page errors',
    state.pageErrors.length === 0, state.pageErrors.slice(0, 3));
  await ctx.close();

  // ---- 1 item, purchased and unpriced ---------------------------------
  const one = await newScenario(browser, {
    guestItems: [{ id: 's1', name: 'Solo', price: 123000, image: '', link: '', status: 'purchased', priority: 'medium', category: '', note: '', createdAt: 1700000000041 }]
  });
  let s1 = await snap(one.page);
  c('D-16', '1 item', 'single purchased row without a price', 'owned 123000, actualSpent empty, unpriced 1, 100%',
    s1.kpi.spent === await money(one.page, 123000) &&
    s1.kpi.actualSpent === 'Ch\u01b0a ghi nh\u1eadn' &&
    s1.kpi.unpriced === '1 m\u00f3n' && s1.kpi.progress === '100%' &&
    s1.metrics.actualSpent === 0 && s1.kpi.ariaNow === '100', { k: s1.kpi, m: s1.metrics });
  c('BUG-4b', 'console', '1-item page', 'no page errors', one.state.pageErrors.length === 0, one.state.pageErrors.slice(0, 3));
  await one.ctx.close();

  // ---- 50 items -------------------------------------------------------
  const fifty = await newScenario(browser, { guestItems: makeItems(50) });
  const f = fifty.page;
  const fm = await snap(f);
  const expectOwned = await f.evaluate(() => computeMetrics(items).ownedValue);
  const expectSpent = await f.evaluate(() => computeMetrics(items).actualSpent);
  c('D-17', '50 items', 'the KPI text matches a freshly computed expectation',
    'owned / actualSpent / count / 24% all agree',
    fm.kpi.spent === (await money(f, expectOwned)) &&
    fm.kpi.actualSpent === (expectSpent === 0 ? 'Ch\u01b0a ghi nh\u1eadn' : await money(f, expectSpent)) &&
    fm.kpi.count === '50 m\u00f3n' && fm.kpi.progress === '24%',
    { owned: fm.kpi.spent, expectOwned: expectOwned, spent: fm.kpi.actualSpent, expectSpent: expectSpent, p: fm.kpi.progress });
  c('D-18', '50 items', 'unpriced counter', 'equals ownedCount here (no paidAmount in the fixture)',
    fm.kpi.unpriced === fm.metrics.ownedCount + ' m\u00f3n', { dom: fm.kpi.unpriced, owned: fm.metrics.ownedCount });
  c('BUG-4c', 'console', '50-item page', 'no page errors', fifty.state.pageErrors.length === 0, fifty.state.pageErrors.slice(0, 3));
  await fifty.ctx.close();
}

// =====================================================================
// S5 - SESSION + ISOLATION WITH PURCHASE DATA
// =====================================================================
const SEED_G = () => ([
  { id: 'g-1', name: 'Khach 1', price: 100000, image: '', link: '', status: 'wish', priority: 'low', category: 'G', note: '', createdAt: 1700000000051 },
  { id: 'g-2', name: 'Khach 2', price: 200000, image: '', link: '', status: 'ordered', priority: 'low', category: 'G', note: '', createdAt: 1700000000052 }
]);
const SEED_A = () => ([
  { id: 'a-1', name: 'Tai khoan 1', price: 300000, image: '', link: '', status: 'purchased', paidAmount: 280000, purchasedAt: 1750000000000, previousStatus: 'saving', priority: 'medium', category: 'A', note: 'account-note', createdAt: 1700000000053 },
  { id: 'a-2', name: 'Tai khoan 2', price: 400000, image: '', link: '', status: 'purchased', previousStatus: 'wish', priority: 'medium', category: 'A', note: '', createdAt: 1700000000054 },
  { id: 'a-3', name: 'Tai khoan 3', price: 500000, image: '', link: '', status: 'wish', priority: 'high', category: 'A', note: '', createdAt: 1700000000055 }
]);
const SEED_B = () => ([
  { id: 'b-1', name: 'Tai khoan B', price: 900000, image: '', link: '', status: 'saving', priority: 'low', category: 'B', note: 'b-note', createdAt: 1700000000056 }
]);

async function s5_session(browser) {
  section$('S5 SESSION');
  const { ctx, page, state } = await newScenario(browser, {
    guestItems: SEED_G(),
    accountItems: SEED_A(),
    uid: 'uid-demo'
  });
  await page.evaluate(() => {
    localStorage.setItem('wishlist.account.uid-b', JSON.stringify([
      { id: 'b-1', name: 'Tai khoan B', price: 900000, image: '', link: '', status: 'saving', priority: 'low', category: 'B', note: 'b-note', createdAt: 1700000000056 }
    ]));
  });

  let s = await snap(page);
  c('S5-01', 'guest boot', 'first resolved session', 'guest list, 2 items, no purchase fields leak',
    s.itemCount === 2 && s.items.every(i => !hasKey(i, 'paidAmount')) && s.metrics.actualSpent === 0,
    { n: s.itemCount, m: s.metrics });

  // ---- sign in as A ---------------------------------------------------
  await page.evaluate(() => window.__cloudSetUser({ uid: 'uid-demo', email: 'a@example.com' }));
  await sleep(400);
  s = await snap(page);
  c('S5-02', 'sign in (A)', 'account cache adopted', '3 items, none from the guest list',
    s.itemCount === 3 && !s.items.some(i => i.id.startsWith('g-')), s.cardIds);
  const a1 = byId(s, 'a-1');
  c('S5-03', 'sign in (A)', 'recorded purchase survives the round-trip', 'paidAmount 280000, date, previousStatus all intact',
    a1.paidAmount === 280000 && a1.purchasedAt === 1750000000000 && a1.previousStatus === 'saving', a1);
  c('S5-04', 'sign in (A)', 'the new KPI reads the account data', 'actualSpent 280000, unpriced 1',
    s.metrics.actualSpent === 280000 && s.metrics.unpricedOwnedCount === 1, s.metrics);

  // ---- purchase while signed in ---------------------------------------
  await page.evaluate(() => {
    localStorage.setItem('wishlist.account.uid-demo', JSON.stringify(items));
  });
  await page.evaluate(() => { activeUid = 'uid-demo'; });
  await clickCard(page, 'a-3', '\u0110\u00e1nh d\u1ea5u \u0111\u00e3 mua');
  await sleep(200);
  await setPdAmount(page, '470000', '2026-07-08');
  await clickId(page, 'pdConfirm');
  await sleep(350);
  const synced = await page.evaluate(() => {
    const all = window.__cloudSyncs();
    const last = all[all.length - 1] || [];
    return last.find(x => x.id === 'a-3') || null;
  });
  c('S5-05', 'purchase while signed in', 'Firestore write path', 'a-3 uploaded with paidAmount/date/previousStatus',
    !!synced && synced.status === 'purchased' && synced.paidAmount === 470000 &&
    synced.previousStatus === 'wish' && Number.isFinite(synced.purchasedAt), synced);

  // ---- sign out -------------------------------------------------------
  await page.evaluate(() => window.__cloudSetUser(null));
  await sleep(400);
  s = await snap(page);
  c('S5-06', 'sign out', 'back to the guest session', 'guest list returns, account rows gone',
    s.itemCount === 2 && !s.items.some(i => i.id.startsWith('a-')), s.cardIds);
  c('S5-07', 'sign out', 'the guest list was not polluted', 'still 0 recorded spending',
    s.metrics.actualSpent === 0 && s.items.every(i => !hasKey(i, 'paidAmount')), s.metrics);

  // ---- sign back in as A ---------------------------------------------
  await page.evaluate(() => window.__cloudSetUser({ uid: 'uid-demo', email: 'a@example.com' }));
  await sleep(400);
  s = await snap(page);
  c('S5-08', 'sign in again (A)', 'the account cache is re-read', 'the purchase is still recorded',
    byId(s, 'a-1').paidAmount === 280000 && byId(s, 'a-1').previousStatus === 'saving' &&
    s.itemCount === 3, { a1: byId(s, 'a-1'), n: s.itemCount });

  // ---- A -> B ---------------------------------------------------------
  await page.evaluate(() => window.__cloudSetUser({ uid: 'uid-b', email: 'b@example.com' }));
  await sleep(450);
  s = await snap(page);
  c('S5-09', 'A -> B', 'switch account', 'only B rows, zero A leakage',
    s.itemCount === 1 && s.cardIds.join(',') === 'b-1' && !s.items.some(i => i.id.startsWith('a-')),
    s.cardIds);
  c('S5-10', 'A -> B', 'no A purchase fields leak into B', 'no paidAmount/purchasedAt/previousStatus anywhere',
    s.items.every(i => !hasKey(i, 'paidAmount') && !hasKey(i, 'purchasedAt') && !hasKey(i, 'previousStatus')) &&
    s.metrics.actualSpent === 0, { items: s.items, m: s.metrics });

  // ---- back to A, then undo -------------------------------------------
  await page.evaluate(() => window.__cloudSetUser({ uid: 'uid-demo', email: 'a@example.com' }));
  await sleep(450);
  await page.evaluate(() => { save(true); });
  await sleep(250);
  await clickCard(page, 'a-1', 'Ho\u00e0n t\u00e1c');
  await sleep(300);
  s = await snap(page);
  c('S5-11', 'undo while signed in', 'restores previousStatus', 'a-1 back to \"saving\", fields cleared',
    byId(s, 'a-1').status === 'saving' && !hasKey(byId(s, 'a-1'), 'paidAmount'), byId(s, 'a-1'));
  const afterUndo = await page.evaluate(() => {
    const all = window.__cloudSyncs();
    const last = all[all.length - 1] || [];
    return last.find(x => x.id === 'a-1') || null;
  });
  c('S5-12', 'undo while signed in', 'uploaded document', 'status saving and no purchase fields at all',
    !!afterUndo && afterUndo.status === 'saving' && !hasKey(afterUndo, 'paidAmount') &&
    !hasKey(afterUndo, 'purchasedAt') && !hasKey(afterUndo, 'previousStatus'), afterUndo);

  c('BUG-5', 'console', 'session scenario', 'no page errors',
    state.pageErrors.length === 0, state.pageErrors.slice(0, 3));
  await ctx.close();
}

// =====================================================================
// S6 - IMPORT / EXPORT + VIEW MODES + MOBILE WIDTHS
// =====================================================================
const SEED_IO = () => ([
  { id: 'e1', name: 'Ghe cong thai hoc', price: 4200000, image: '', link: 'https://e.com/e1', status: 'purchased', paidAmount: 3900000, purchasedAt: 1750000000000, previousStatus: 'saving', priority: 'high', category: 'Noi that', note: 'lung luoi', createdAt: 1700000000061 },
  { id: 'e2', name: 'Den ban (cu)', price: 700000, image: '', link: '', status: 'purchased', priority: 'medium', category: 'Noi that', note: 'legacy', createdAt: 1700000000062 },
  { id: 'e3', name: 'Ke sach', price: 111111, image: '', link: '', status: 'wish', priority: 'low', category: 'Noi that', note: '', createdAt: 1700000000063 }
]);

async function s6_io(browser) {
  section$('S6 IMPORT / EXPORT + MOBILE');
  const { ctx, page, state } = await newScenario(browser, { guestItems: SEED_IO() });

  // ---- export ---------------------------------------------------------
  await page.click('.nav-more summary');
  await sleep(220);
  await page.evaluate(() => {
    window.__exportBlob = null;
    window.__exportName = null;
    URL.createObjectURL = (blob) => { window.__exportBlob = blob; return 'blob:mock-export'; };
    HTMLAnchorElement.prototype.click = function () { window.__exportName = this.download; };
  });
  await page.click('#btnExport');
  await sleep(420);
  const exported = await page.evaluate(async () => {
    const text = window.__exportBlob ? await window.__exportBlob.text() : null;
    return { text, name: window.__exportName };
  });
  let parsed = null;
  try { parsed = JSON.parse(exported.text); } catch (e) {}
  const ex1 = Array.isArray(parsed) ? parsed.find(x => x.id === 'e1') : null;
  c('S6-01', 'export', 'the purchase fields go out with the row', 'paidAmount/date/previousStatus exported verbatim',
    !!ex1 && ex1.paidAmount === 3900000 && ex1.purchasedAt === 1750000000000 &&
    ex1.previousStatus === 'saving', ex1);
  const ex2 = Array.isArray(parsed) ? parsed.find(x => x.id === 'e2') : null;
  c('S6-02', 'export', 'a legacy owned row', 'exported with no invented price or date',
    !!ex2 && !hasKey(ex2, 'paidAmount') && !hasKey(ex2, 'purchasedAt') &&
    !hasKey(ex2, 'previousStatus'), ex2);

  // ---- round-trip -----------------------------------------------------
  const roundPath = path.join(OUT, 'f2-roundtrip.json');
  fs.writeFileSync(roundPath, exported.text, 'utf8');
  await page.evaluate(() => { document.querySelector('.nav-more').open = true; });
  await sleep(120);
  state.acceptDialogs = true;
  await (await page.$('#importFile')).uploadFile(roundPath);
  await sleep(900);
  let s = await snap(page);
  const r1 = byId(s, 'e1');
  c('S6-03', 'import', 'round-trip of our own export', 'e1 identical: same id, fields and extras',
    s.itemCount === 3 && !!r1 && r1.paidAmount === 3900000 &&
    r1.purchasedAt === 1750000000000 && r1.previousStatus === 'saving' &&
    r1.name === 'Ghe cong thai hoc' && r1.price === 4200000 && r1.note === 'lung luoi' &&
    r1.link === 'https://e.com/e1' && r1.priority === 'high' && r1.category === 'Noi that', r1);
  c('S6-04', 'import', 'the legacy row came back plain', 'no purchase fields appeared',
    !hasKey(byId(s, 'e2'), 'paidAmount') && !hasKey(byId(s, 'e2'), 'purchasedAt'), byId(s, 'e2'));
  c('S6-05', 'KPI after round-trip', 'metrics recomputed from the file',
    'owned 4900000, actualSpent 3900000, unpriced 1, 67%',
    s.metrics.ownedValue === 4900000 && s.metrics.actualSpent === 3900000 &&
    s.metrics.unpricedOwnedCount === 1 && s.kpi.progress === '67%', s.metrics);

  // ---- hostile import -------------------------------------------------
  const badPath = path.join(OUT, 'f2-bad-purchase.json');
  fs.writeFileSync(badPath, JSON.stringify([
    { id: 'x1', name: 'Bad price', price: 100000, status: 'purchased', paidAmount: 'abc', purchasedAt: 'not-a-date', previousStatus: 'purchased' },
    { id: 'x2', name: 'Not owned', price: 200000, status: 'wish', paidAmount: 99999, purchasedAt: 1750000000000, previousStatus: 'wish' },
    { id: 'x3', name: 'Huge', price: 300000, status: 'purchased', paidAmount: 1e30 }
  ], null, 2), 'utf8');
  await page.evaluate(() => { document.querySelector('.nav-more').open = true; });
  await sleep(120);
  await (await page.$('#importFile')).uploadFile(badPath);
  await sleep(900);
  s = await snap(page);
  c('S6-06', 'import', 'corrupt / impossible purchase values', 'all dropped, previousStatus purchased dropped',
    !!byId(s, 'x1') && !hasKey(byId(s, 'x1'), 'paidAmount') && !hasKey(byId(s, 'x1'), 'purchasedAt') &&
    !hasKey(byId(s, 'x1'), 'previousStatus'), byId(s, 'x1'));
  c('S6-07', 'import', 'purchase fields on a NON-purchased row', 'stripped by the invariant',
    !!byId(s, 'x2') && !hasKey(byId(s, 'x2'), 'paidAmount') &&
    !hasKey(byId(s, 'x2'), 'purchasedAt') && !hasKey(byId(s, 'x2'), 'previousStatus'), byId(s, 'x2'));
  c('S6-08', 'import', 'a 1e30 price', 'dropped, never stored as a number',
    !!byId(s, 'x3') && !hasKey(byId(s, 'x3'), 'paidAmount'), byId(s, 'x3'));
  c('S6-09', 'KPI after hostile import', 'no NaN can reach the dashboard',
    'actualSpent 0, unpriced 2, every field finite',
    s.metrics.actualSpent === 0 && s.metrics.unpricedOwnedCount === 2 &&
    [s.metrics.ownedValue, s.metrics.pendingValue, s.metrics.actualSpent].every(Number.isFinite) &&
    s.kpi.actualSpent === 'Ch\u01b0a ghi nh\u1eadn', s.metrics);

  // ---- view modes -----------------------------------------------------
  await clickId(page, 'v13FocusView');
  await sleep(220);
  s = await snap(page);
  c('S6-10', 'view mode', '#v13FocusView', 'focus view holds all 3 cards',
    s.view === 'focus' && s.cards === 3, { v: s.view, c: s.cards });
  await clickTab(page, 'Owned');
  await sleep(220);
  s = await snap(page);
  c('S6-11', 'view mode + tab', 'focus view survives the toggle', 'still focus, 2 owned cards',
    s.view === 'focus' && s.cards === 2, { v: s.view, c: s.cards });
  await clickId(page, 'v13GridView');
  await sleep(220);
  await clickId(page, 'btnClearFilter');
  await sleep(220);

  // ---- mobile widths --------------------------------------------------
  const widths = [320, 390, 430];
  for (const w of widths) {
    await page.setViewport({ width: w, height: 780, deviceScaleFactor: 1 });
    await sleep(320);
    const geo = await page.evaluate(() => {
      const de = document.documentElement;
      const tabs = document.getElementById('purchaseTabs').getBoundingClientRect();
      const cards = [...document.querySelectorAll('#grid .wishlist-card')];
      const worst = cards.reduce((acc, c) => {
        const r = c.getBoundingClientRect();
        return Math.max(acc, r.right);
      }, 0);
      return {
        scrollW: de.scrollWidth,
        clientW: de.clientWidth,
        tabsLeft: tabs.left,
        tabsRight: tabs.right,
        tabsVisible: tabs.width > 0 && tabs.height > 0,
        worstRight: worst,
        cardCount: cards.length
      };
    });
    c('S6-' + (20 + widths.indexOf(w)), 'mobile ' + w + 'px', 'no horizontal overflow',
      'document and every card fit the viewport, tabs visible',
      geo.scrollW <= geo.clientW + 1 && geo.worstRight <= w + 1 &&
      geo.tabsVisible && geo.tabsLeft >= -0.5 && geo.tabsRight <= w + 0.5,
      geo);
  }

  // ---- the purchase dialog on the narrowest phone ---------------------
  await page.setViewport({ width: 320, height: 780, deviceScaleFactor: 1 });
  await sleep(260);
  // The hostile import replaced the list, so open the dialog on a row that is
  // actually there: x2 is the pending one.
  await clickCard(page, 'x2', '\u0110\u00e1nh d\u1ea5u \u0111\u00e3 mua');
  await sleep(320);
  const dlgGeo = await page.evaluate(() => {
    const d = document.getElementById('pd').getBoundingClientRect();
    const ids = ['pdConfirm', 'pdSkip', 'pdCancel'];
    const btns = ids.map(id => {
      const r = document.getElementById(id).getBoundingClientRect();
      return { id: id, left: r.left, right: r.right, w: r.width, h: r.height };
    });
    return { left: d.left, right: d.right, top: d.top, bottom: d.bottom, w: d.width, btns: btns };
  });
  c('S6-23', 'mobile 320px dialog', 'the capture dialog', 'fits the viewport, every button is fully inside',
    dlgGeo.left >= -0.5 && dlgGeo.right <= 320.5 &&
    dlgGeo.btns.every(b => b.w > 0 && b.h > 0 && b.left >= -0.5 && b.right <= 320.5),
    dlgGeo);
  await clickId(page, 'pdCancel');
  await sleep(260);

  if (SHOTS) {
    await page.screenshot({ path: path.join(OUT, 's6-mobile-320.png') });
  }

  c('BUG-6', 'console', 'import/export + mobile scenario', 'no page errors',
    state.pageErrors.length === 0, state.pageErrors.slice(0, 3));
  await ctx.close();
}

// =====================================================================
const scenarios = [
  ['S0 MODEL', s0_model],
  ['S1 CAPTURE', s1_capture],
  ['S2 UNDO', s2_undo],
  ['S3 TABS', s3_tabs],
  ['S4 DASHBOARD', s4_dashboard],
  ['S5 SESSION', s5_session],
  ['S6 IMPORT/MOBILE', s6_io]
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
      try {
        await fn(browser);
      } catch (e) {
        CHECK('HARNESS-' + label, 'Harness', label, 'scenario completes',
          'S? ' + label + ' harness', false, String(e && e.message || e));
      }
    }
  } finally {
    await browser.close();
    server.close();
  }

  let current = '';
  results.forEach(r => {
    const g = r.name.split(' \u00b7 ')[0];
    if (g !== current) { current = g; console.log('\n--- ' + current + ' ---'); }
    const tag = r.gate ? '' : ' (probe)';
    console.log((r.pass ? 'PASS ' : 'FAIL ') + '[' + r.id + '] ' + r.area + ' :: ' + r.entry + tag + (r.pass ? '' : '  :: ' + r.actual));
  });

  const gated = results.filter(r => r.gate);
  const pass = gated.filter(r => r.pass).length;
  const fails = gated.filter(r => !r.pass);
  console.log('\n======================================');
  console.log(`F2 SUITE: ${pass} PASS / ${fails.length} FAIL  (gated total ${gated.length})`);
  if (fails.length) {
    console.log('\nFAILURES:');
    fails.forEach(f => console.log('  ' + f.id + ' - ' + f.area + ' :: ' + f.entry + ' :: ' + f.actual));
  }
  fs.writeFileSync(path.join(OUT, 'f2-results.json'), JSON.stringify(results, null, 2), 'utf8');
  process.exit(fails.length ? 1 : 0);
})().catch(e => {
  console.error(e);
  try { server.close(); } catch (_) {}
  process.exit(2);
});
