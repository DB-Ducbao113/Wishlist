// =====================================================================
// DREAM VAULT V16.1 - F5 SAVINGS & PRODUCT INTELLIGENCE - FUNCTIONAL SUITE
// ---------------------------------------------------------------------
// Serves the real repo, stubs ONLY the cloud module (no Firebase network),
// drives the real entry points, and asserts observable behaviour.
//
// Covers:
//   A  F5.1  data model, compatibility and hostile input
//   B  F5.2  savings fields in the Add/Edit form
//   C  F5.2  savings block in the Quick View
//   D  F5.3  dashboard savings overview + its link back to the Collection
//   E  F5.4  "Nên xem tiếp" shortlist: rules, reasons, stable order
//   F  F5.5  responsive / payload / F4 non-regression
//
// usage: node v16_6-f5-check.js [repoRoot] [--only=A]
// =====================================================================
const puppeteer = require('puppeteer-core');
const http = require('http');
const fs = require('fs');
const path = require('path');

const CHROME = process.env.CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT = process.argv[2] && !process.argv[2].startsWith('--')
  ? process.argv[2]
  : path.join(__dirname, '..', '..');
const ONLY = (process.argv.find(a => a.startsWith('--only=')) || '').replace('--only=', '');
const PORT = 8156;
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

// ---------------------------------------------------------------------
// Fixtures
//
// The savings fixture is built so every aggregate below is an exact number:
//   goals on UNPURCHASED rows   g2 3000000 + g3 1000000 + g4 500000
//                               + g5 100000 + g8 200000        = 4,800,000
//   saved on those rows         0 + 400000 + 500000 + 250000
//                               + 200000                       = 1,350,000
//   remaining (sum of own gaps) 3000000 + 600000 + 0 + 0 + 0    = 3,600,000
//   reached their goal          g4, g5, g8                      = 3
//   g7 is PURCHASED with a full goal: it must be excluded from all four.
// ---------------------------------------------------------------------
const F5FIX = [
  { id: 'g1', name: 'Món không mục tiêu', price: 1000000, image: '', link: '',
    status: 'wish', priority: 'medium', category: 'A', note: '', createdAt: 1700000000001 },
  { id: 'g2', name: 'Món có mục tiêu chưa ghi', price: 2000000, image: '', link: '',
    status: 'wish', priority: 'low', category: 'B', note: '', createdAt: 1700000000002,
    savingGoal: 3000000 },
  { id: 'g3', name: 'Món để dành dở', price: 500000, image: '', link: '',
    status: 'saving', priority: 'medium', category: 'A', note: '', createdAt: 1700000000003,
    savingGoal: 1000000, savedAmount: 400000 },
  { id: 'g4', name: 'Món đạt mục tiêu', price: 800000, image: '', link: '',
    status: 'wish', priority: 'medium', category: 'C', note: '', createdAt: 1700000000004,
    savingGoal: 500000, savedAmount: 500000 },
  { id: 'g5', name: 'Món vượt mục tiêu', price: 900000, image: '', link: '',
    status: 'saving', priority: 'low', category: 'C', note: '', createdAt: 1700000000005,
    savingGoal: 100000, savedAmount: 250000 },
  { id: 'g6', name: 'Món ưu tiên cao', price: 400000, image: '', link: '',
    status: 'wish', priority: 'high', category: 'A', note: '', createdAt: 1700000000006 },
  { id: 'g7', name: 'Món đã mua có mục tiêu', price: 600000, image: '', link: '',
    status: 'purchased', priority: 'medium', category: 'B', note: '', createdAt: 1700000000007,
    savingGoal: 700000, savedAmount: 700000, paidAmount: 600000,
    purchasedAt: 1750000000000, previousStatus: 'wish' },
  { id: 'g8', name: 'Món đủ tiền ưu tiên cao', price: 700000, image: '', link: '',
    status: 'wish', priority: 'high', category: 'D', note: '', createdAt: 1700000000008,
    savingGoal: 200000, savedAmount: 200000 }
];

// ---------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------
const results = [];
let section = '';
function c(id, area, entry, expected, pass, actual) {
  results.push({
    id, section, area, entry, expected,
    pass: !!pass,
    actual: actual === undefined ? '' : JSON.stringify(actual)
  });
}

// ---------------------------------------------------------------------
// Scenario helper
// ---------------------------------------------------------------------
async function newScenario(browser, seed, opts = {}) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  const state = { errors: [], dialogs: [], acceptDialogs: opts.acceptDialogs !== false, pageErrors: [] };

  await page.setViewport({
    width: opts.width || 1440,
    height: opts.height || 900,
    deviceScaleFactor: 1
  });
  await page.emulateMediaFeatures([{
    name: 'prefers-reduced-motion',
    value: opts.reducedMotion ? 'reduce' : 'no-preference'
  }]);

  await page.evaluateOnNewDocument((s) => {
    try {
      localStorage.clear();
      if (s.guestItems) localStorage.setItem('wishlist.guest.items', JSON.stringify(s.guestItems));
      if (s.accountItems) localStorage.setItem('wishlist.account.' + (s.uid || 'uid-demo'), JSON.stringify(s.accountItems));
      window.__shifts = [];
      try {
        new PerformanceObserver((list) => {
          list.getEntries().forEach(e => { if (!e.hadRecentInput) window.__shifts.push(Number(e.value.toFixed(5))); });
        }).observe({ entryTypes: ['layout-shift'] });
      } catch (e) {}
    } catch (e) {}
  }, seed || {});

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

// ---------------------------------------------------------------------
// In-page probes
// ---------------------------------------------------------------------
const NORM = `const norm = (s) => String(s == null ? '' : s).replace(/\\s+/g, ' ').trim();`;

const SAVINGS_UI = `(() => {
  ${NORM}
  const el = (id) => document.getElementById(id);
  const host = el('dvSavings');
  return {
    hostHidden: host ? host.hidden : null,
    hostDisplay: host ? getComputedStyle(host).display : null,
    emptyShown: el('dvSavingsEmpty') ? !el('dvSavingsEmpty').hidden : null,
    barNow: el('dvSavingsBar') ? el('dvSavingsBar').getAttribute('aria-valuenow') : null,
    barText: el('dvSavingsBar') ? norm(el('dvSavingsBar').getAttribute('aria-valuetext')) : null,
    barFill: el('dvSavingsBarFill') ? getComputedStyle(el('dvSavingsBarFill')).transform : null,
    rows: [...document.querySelectorAll('#dvSavingsRows .dv-savings__row')].map(r => ({
      filter: r.dataset.savings || '',
      name: norm((r.querySelector('.dv-savings__name') || {}).textContent),
      value: norm((r.querySelector('.dv-savings__value') || {}).textContent),
      note: norm((r.querySelector('.dv-savings__note') || {}).textContent),
      label: norm(r.getAttribute('aria-label')),
      tag: r.tagName
    }))
  };
})()`;

const INSIGHTS_UI = `(() => {
  ${NORM}
  const el = (id) => document.getElementById(id);
  const host = el('dvInsights');
  return {
    hostHidden: host ? host.hidden : null,
    emptyShown: el('dvInsightsEmpty') ? !el('dvInsightsEmpty').hidden : null,
    rows: [...document.querySelectorAll('#dvInsightsRows .dv-insights__row')].map(r => ({
      id: r.dataset.insightId || '',
      name: norm((r.querySelector('.dv-insights__name') || {}).textContent),
      price: norm((r.querySelector('.dv-insights__price') || {}).textContent),
      reason: norm((r.querySelector('.dv-insights__reason') || {}).textContent),
      go: norm((r.querySelector('.dv-insights__go') || {}).textContent),
      label: norm(r.getAttribute('aria-label')),
      tag: r.tagName
    }))
  };
})()`;

const STORED = `(() => {
  try { return JSON.parse(localStorage.getItem('wishlist.guest.items') || '[]'); }
  catch (e) { return null; }
})()`;

const QV_SAVINGS = `(() => {
  ${NORM}
  const el = (id) => document.getElementById(id);
  const vis = (id) => {
    const n = el(id);
    if (!n) return null;
    const r = n.getBoundingClientRect();
    return { hidden: !!n.hidden, w: Math.round(r.width), h: Math.round(r.height) };
  };
  return {
    open: el('qv').open,
    id: el('qv').dataset.id || '',
    heading: norm((el('qvSavingsHeading') || {}).textContent),
    summary: vis('qvSavingsSummary'),
    empty: vis('qvSavingsEmpty'),
    badgeHidden: el('qvSavingsBadge') ? el('qvSavingsBadge').hidden : null,
    badge: norm((el('qvSavingsBadge') || {}).textContent),
    saved: norm((el('qvSavingsSaved') || {}).textContent),
    goal: norm((el('qvSavingsGoal') || {}).textContent),
    remaining: norm((el('qvSavingsRemaining') || {}).textContent),
    barNow: el('qvSavingsTrack') ? el('qvSavingsTrack').getAttribute('aria-valuenow') : null,
    barText: el('qvSavingsTrack') ? norm(el('qvSavingsTrack').getAttribute('aria-valuetext')) : null,
    goalInput: el('qvSavingGoal') ? el('qvSavingGoal').value : null,
    savedInput: el('qvSavedAmount') ? el('qvSavedAmount').value : null,
    resetHidden: el('qvSavingsReset') ? el('qvSavingsReset').hidden : null,
    status: norm((el('qvStatus') || {}).textContent)
  };
})()`;

const COLLECTION = `(() => {
  ${NORM}
  const el = (id) => document.getElementById(id);
  return {
    savings: el('fSavings') ? el('fSavings').value : null,
    status: el('fStatus').value,
    priority: el('fPriority').value,
    category: el('fCategoryFilter').value,
    sort: el('fSort').value,
    query: el('q').value,
    activeTab: [...document.querySelectorAll('#purchaseTabs .dv-tabs__tab')]
      .filter(b => b.getAttribute('aria-pressed') === 'true').map(b => b.dataset.tab),
    cards: [...document.querySelectorAll('#grid > .wishlist-card')].map(x => x.dataset.id),
    resultStatus: norm(el('resultStatus').textContent),
    filterCount: el('filterCount') ? norm(el('filterCount').textContent) : null,
    filterCountHidden: el('filterCount') ? el('filterCount').hidden : null
  };
})()`;

const byId = (list, id) => (list || []).find(x => x.id === id) || null;
const hasKey = (o, k) => !!(o && Object.prototype.hasOwnProperty.call(o, k));

// ---------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------
(async () => {
  await new Promise(r => server.listen(PORT, r));
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--force-device-scale-factor=1']
  });

  const run = async (label, fn) => {
    if (ONLY && !label.startsWith(ONLY)) return;
    try { await fn(); }
    catch (e) {
      c('HARNESS-' + label, label, 'scenario', 'no uncaught error', false, String(e && e.message || e));
    }
  };

  // ===================================================================
  // A - F5.1 data model / compatibility
  // ===================================================================
  await run('A', async () => {
    section = 'A F5.1 DATA MODEL';
    const { page, state } = await newScenario(browser, { guestItems: F5FIX });

    // ---- field validators, straight from the one source of truth -------
    const unit = await page.evaluate(() => {
      const v = (f, x) => { try { return f(x); } catch (e) { return 'THREW'; } };
      return {
        goals: [0, -1, -0.4, NaN, Infinity, -Infinity, 'abc', '', null, undefined, 1e30, 1500.4, '2500']
          .map(x => [String(x), v(validSavingGoal, x)]),
        saveds: [0, -1, NaN, Infinity, 'abc', '', null, undefined, 1e30, 1500.4, '2500']
          .map(x => [String(x), v(validSavedAmount, x)]),
        read: [readSavingGoal({}), readSavedAmount({}), savedOf({}), hasSavingGoal({}),
               savingsReached({}), savingsRemaining({}), savingsProgress({})],
        reached: [
          savingsReached({ savingGoal: 100, savedAmount: 99 }),
          savingsReached({ savingGoal: 100, savedAmount: 100 }),
          savingsReached({ savingGoal: 100, savedAmount: 250 })
        ],
        remainingOver: savingsRemaining({ savingGoal: 100, savedAmount: 250 }),
        progressOver: savingsProgress({ savingGoal: 100, savedAmount: 250 })
      };
    });

    c('F5-1-01', 'validators', 'validSavingGoal',
      'goal must be a finite safe integer > 0; 0, negatives, NaN, Infinity, junk and 1e30 are all rejected',
      unit.goals[0][1] === null && unit.goals[1][1] === null && unit.goals[2][1] === null &&
      unit.goals[3][1] === null && unit.goals[4][1] === null && unit.goals[5][1] === null &&
      unit.goals[6][1] === null && unit.goals[7][1] === null && unit.goals[8][1] === null &&
      unit.goals[9][1] === null && unit.goals[10][1] === null &&
      unit.goals[11][1] === 1500 && unit.goals[12][1] === 2500, unit.goals);

    c('F5-1-02', 'validators', 'validSavedAmount',
      'saved must be a finite safe integer >= 0; negative, NaN, Infinity, junk and 1e30 are rejected; an explicit 0 is kept',
      unit.saveds[0][1] === 0 && unit.saveds[1][1] === null && unit.saveds[2][1] === null &&
      unit.saveds[3][1] === null && unit.saveds[4][1] === null && unit.saveds[5][1] === null &&
      unit.saveds[6][1] === null && unit.saveds[7][1] === null && unit.saveds[8][1] === null &&
      unit.saveds[9][1] === 1500 && unit.saveds[10][1] === 2500, unit.saveds);

    c('F5-1-03', 'readers', 'a row with no savings fields',
      'reads as "no goal", saved 0, not reached, remaining/progress null — never NaN',
      unit.read[0] === null && unit.read[1] === null && unit.read[2] === 0 &&
      unit.read[3] === false && unit.read[4] === false &&
      unit.read[5] === null && unit.read[6] === null, unit.read);

    c('F5-1-04', 'savingsReached', 'saved below / equal / above the goal',
      'below = false, equal = true, above = true',
      unit.reached[0] === false && unit.reached[1] === true && unit.reached[2] === true, unit.reached);

    c('F5-1-05', 'savingsReached', 'savedAmount ABOVE savingGoal',
      'the data is never clamped: remaining floors at 0 and progress caps at 1 for display only',
      unit.remainingOver === 0 && unit.progressOver === 1, {
        remainingOver: unit.remainingOver, progressOver: unit.progressOver
      });

    // ---- normalizeItem: the import path's only transform ---------------
    const norm = await page.evaluate(() => {
      const base = { name: 'X', price: 1000 };
      const out = {};
      out.valid = normalizeItem(Object.assign({}, base, { savingGoal: 500000, savedAmount: 120000 }));
      out.legacy = normalizeItem(Object.assign({}, base));
      out.hostile = normalizeItem(Object.assign({}, base, {
        savingGoal: -5, savedAmount: -5
      }));
      out.strings = normalizeItem(Object.assign({}, base, {
        savingGoal: '700000', savedAmount: '250.9'
      }));
      out.nan = normalizeItem(Object.assign({}, base, { savingGoal: NaN, savedAmount: Infinity }));
      out.over = normalizeItem(Object.assign({}, base, { savingGoal: 100, savedAmount: 900 }));
      out.purchased = normalizeItem(Object.assign({}, base, {
        status: 'purchased', savingGoal: 1000, savedAmount: 500
      }));
      out.zeroGoal = normalizeItem(Object.assign({}, base, { savingGoal: 0, savedAmount: 250 }));
      return out;
    });

    c('F5-1-06', 'normalizeItem', 'a row carrying valid savings',
      'goal and saved survive the round-trip verbatim',
      norm.valid.savingGoal === 500000 && norm.valid.savedAmount === 120000, norm.valid);

    c('F5-1-07', 'normalizeItem', 'a legacy row without the fields',
      'no savingGoal / savedAmount is invented',
      !hasKey(norm.legacy, 'savingGoal') && !hasKey(norm.legacy, 'savedAmount'), norm.legacy);

    c('F5-1-08', 'normalizeItem', 'negative savings values',
      'dropped entirely instead of stored as a negative number',
      !hasKey(norm.hostile, 'savingGoal') && !hasKey(norm.hostile, 'savedAmount'), norm.hostile);

    c('F5-1-09', 'normalizeItem', 'numeric strings',
      'coerced to safe integers, rounded, and nothing fake appears',
      norm.strings.savingGoal === 700000 && norm.strings.savedAmount === 251, norm.strings);

    c('F5-1-10', 'normalizeItem', 'NaN / Infinity',
      'both removed; the item is still imported',
      !hasKey(norm.nan, 'savingGoal') && !hasKey(norm.nan, 'savedAmount') &&
      norm.nan.name === 'X', norm.nan);

    c('F5-1-11', 'normalizeItem', 'saved greater than the goal',
      'kept as-is — the over-saved value is real user data, not an error to trim',
      norm.over.savingGoal === 100 && norm.over.savedAmount === 900, norm.over);

    c('F5-1-12', 'normalizeItem', 'savings on a PURCHASED row',
      'kept (unlike the purchase fields, savings are not tied to the status)',
      norm.purchased.savingGoal === 1000 && norm.purchased.savedAmount === 500, norm.purchased);

    c('F5-1-13', 'normalizeItem', 'goal 0 with a recorded amount',
      'goal 0 is not a goal and is dropped; the recorded amount is still kept',
      !hasKey(norm.zeroGoal, 'savingGoal') && norm.zeroGoal.savedAmount === 250, norm.zeroGoal);

    // ---- aggregates -----------------------------------------------------
    const agg = await page.evaluate(() => computeSavings(items));
    c('F5-1-14', 'computeSavings', 'goals on unpurchased rows only',
      'goalCount 5, goalTotal 4,800,000, savedTotal 1,350,000, remainingTotal 3,600,000, readyCount 3',
      agg.goalCount === 5 && agg.goalTotal === 4800000 && agg.savedTotal === 1350000 &&
      agg.remainingTotal === 3600000 && agg.readyCount === 3, agg);

    c('F5-1-15', 'computeSavings', 'the purchased row is excluded',
      'g7 (purchased, goal fully saved) contributes to no figure',
      agg.goalCount === 5 && agg.savedTotal === 1350000, {
        goalCount: agg.goalCount, savedTotal: agg.savedTotal
      });

    c('F5-1-16', 'computeSavings', 'over-saving does not cancel another gap',
      'remainingTotal stays the SUM of each item\'s own gap (3,000,000 + 600,000)',
      agg.remainingTotal === 3600000, { remainingTotal: agg.remainingTotal });

    const aggEmpty = await page.evaluate(() => computeSavings([]));
    c('F5-1-17', 'computeSavings', 'empty list',
      'all figures 0, progress 0, no NaN',
      aggEmpty.goalCount === 0 && aggEmpty.goalTotal === 0 && aggEmpty.progress === 0 &&
      Number.isFinite(aggEmpty.progress), aggEmpty);

    const aggPurchased = await page.evaluate(() =>
      computeSavings(items.filter(x => x.status === 'purchased')));
    c('F5-1-18', 'computeSavings', 'a list of purchased rows only',
      'nothing is counted — buying leaves the savings loop',
      aggPurchased.goalCount === 0 && aggPurchased.savedTotal === 0, aggPurchased);

    // ---- purchase / undo must not touch savings -------------------------
    const before = await page.evaluate(() => {
      const it = items.find(x => x.id === 'g3');
      return { goal: it.savingGoal, saved: it.savedAmount, status: it.status };
    });
    await page.evaluate(() => markPurchased('g3'));
    await sleep(260);
    await page.click('#pdSkip');
    await sleep(420);
    const afterBuy = await page.evaluate(() => {
      const it = items.find(x => x.id === 'g3');
      return { goal: it.savingGoal, saved: it.savedAmount, status: it.status, prev: it.previousStatus };
    });
    await page.evaluate(() => undoPurchased('g3'));
    await sleep(420);
    const afterUndo = await page.evaluate(() => {
      const it = items.find(x => x.id === 'g3');
      return { goal: it.savingGoal, saved: it.savedAmount, status: it.status };
    });

    c('F5-1-19', 'purchase', 'marking an item as bought',
      'status changes to purchased and BOTH savings fields are untouched',
      afterBuy.status === 'purchased' && afterBuy.goal === before.goal &&
      afterBuy.saved === before.saved, { before, afterBuy });

    c('F5-1-20', 'undo', 'undoing the purchase',
      'the status comes back and the savings are still exactly as recorded',
      afterUndo.status === before.status && afterUndo.goal === before.goal &&
      afterUndo.saved === before.saved, { before, afterUndo });

    c('F5-1-21', 'status', 'a fully-saved item is not "đã mua"',
      'g4/g5/g8 are reached but still unpurchased',
      await page.evaluate(() => ['g4', 'g5', 'g8']
        .every(id => items.find(x => x.id === id).status !== 'purchased')));

    // ---- persistence + guest/account isolation --------------------------
    const persisted = await page.evaluate(() => JSON.parse(localStorage.getItem('wishlist.guest.items') || '[]'));
    const p3 = persisted.find(x => x.id === 'g3');
    c('F5-1-22', 'localStorage', 'savings survive a write',
      'g3 in storage carries savingGoal 1000000 and savedAmount 400000',
      !!p3 && p3.savingGoal === 1000000 && p3.savedAmount === 400000, p3);

    const iso = await page.evaluate(() => {
      const snapshot = JSON.parse(localStorage.getItem('wishlist.guest.items'));
      localStorage.setItem('wishlist.account.uid-demo',
        JSON.stringify([{ id: 'a1', name: 'Của tài khoản', price: 1000, status: 'wish',
          priority: 'medium', createdAt: 1, savingGoal: 900000, savedAmount: 100000 }]));
      window.__cloudSetUser({ uid: 'uid-demo', email: 'a@b.c' });
      const acct = items.map(x => ({ id: x.id, goal: x.savingGoal, saved: x.savedAmount }));
      window.__cloudSetUser(null);
      const guest = items.map(x => ({ id: x.id, goal: x.savingGoal, saved: x.savedAmount }));
      return { acct, guest, snapshotIds: snapshot.map(x => x.id) };
    });
    await sleep(320);
    const isoGuest = await page.evaluate(() => items.map(x => ({ id: x.id, goal: x.savingGoal })));

    c('F5-1-23', 'accounts', 'switching to an account',
      'the account list (with its own savings) replaces the guest list entirely',
      iso.acct.length === 1 && iso.acct[0].id === 'a1' &&
      iso.acct[0].goal === 900000 && iso.acct[0].saved === 100000, iso.acct);

    c('F5-1-24', 'accounts', 'switching back to guest',
      'the guest savings come back unchanged — no leak from the account',
      isoGuest.length === F5FIX.length &&
      byId(isoGuest, 'g3').goal === 1000000 &&
      !isoGuest.some(x => x.id === 'a1'), isoGuest);

    c('F5-1-25', 'errors', 'console', 'no page or console errors in the data-model scenario',
      state.pageErrors.length === 0 && state.errors.length === 0,
      { pageErrors: state.pageErrors.slice(0, 2), errors: state.errors.slice(0, 2) });

    await page.close();
  });

  // ===================================================================
  // B - F5.2 form
  // ===================================================================
  await run('B', async () => {
    section = 'B F5.2 FORM';
    const { page, state } = await newScenario(browser, { guestItems: F5FIX });

    const fields = await page.evaluate(() => {
      const el = (id) => document.getElementById(id);
      return {
        hasSection: !!el('savingsSection'),
        goalLabel: !!document.querySelector('label[for="fSavingGoal"]'),
        savedLabel: !!document.querySelector('label[for="fSavedAmount"]'),
        goalType: el('fSavingGoal') ? el('fSavingGoal').type : null,
        savedType: el('fSavedAmount') ? el('fSavedAmount').type : null,
        previewTag: el('fSavingPreview') ? el('fSavingPreview').tagName : null
      };
    });
    c('F5-2-01', 'markup', 'the form has a labelled savings section',
      'two named number inputs with an explicit <label for>, plus a preview block',
      fields.hasSection && fields.goalLabel && fields.savedLabel &&
      fields.goalType === 'number' && fields.savedType === 'number', fields);

    // ---- prefill: existing values --------------------------------------
    await page.evaluate(() => openForm(items.find(x => x.id === 'g3')));
    await sleep(320);
    const prefilled = await page.evaluate(() => {
      const el = (id) => document.getElementById(id);
      return {
        goal: el('fSavingGoal').value, saved: el('fSavedAmount').value,
        previewHidden: el('fSavingPreview').hidden,
        text: el('fSavingText').textContent.replace(/\s+/g, ' ').trim(),
        now: el('fSavingTrack').getAttribute('aria-valuenow')
      };
    });
    c('F5-2-02', 'prefill', 'editing an item that already has a goal',
      'inputs show 1000000 / 400000 and the preview reports the 600,000 still missing',
      prefilled.goal === '1000000' && prefilled.saved === '400000' &&
      prefilled.previewHidden === false && /Còn thiếu 600\.000/.test(prefilled.text) &&
      prefilled.now === '40', prefilled);

    // ---- prefill: no goal -> preview hidden ----------------------------
    await page.evaluate(() => { $('dlg').close(); openForm(items.find(x => x.id === 'g1')); });
    await sleep(300);
    const noGoal = await page.evaluate(() => ({
      goal: $('fSavingGoal').value, saved: $('fSavedAmount').value,
      previewHidden: $('fSavingPreview').hidden
    }));
    c('F5-2-03', 'prefill', 'editing an item with no goal',
      'inputs are empty and the progress preview stays hidden (no 0/0 bar)',
      noGoal.goal === '' && noGoal.saved === '' && noGoal.previewHidden === true, noGoal);

    // ---- live preview reacts while typing ------------------------------
    await page.evaluate(() => {
      $('fSavingGoal').value = '200000';
      $('fSavingGoal').dispatchEvent(new Event('input', { bubbles: true }));
    });
    await sleep(120);
    const live = await page.evaluate(() => ({
      hidden: $('fSavingPreview').hidden,
      text: $('fSavingText').textContent.replace(/\s+/g, ' ').trim(),
      now: $('fSavingTrack').getAttribute('aria-valuenow')
    }));
    c('F5-2-04', 'preview', 'typing a goal without a saved amount',
      'the preview appears immediately and asks for the full 200,000',
      live.hidden === false && /Còn thiếu 200\.000/.test(live.text) && live.now === '0', live);

    // ---- an invalid goal does not break the preview --------------------
    await page.evaluate(() => {
      $('fSavingGoal').value = '-50';
      $('fSavingGoal').dispatchEvent(new Event('input', { bubbles: true }));
    });
    await sleep(100);
    const invalidPreview = await page.evaluate(() => ({
      hidden: $('fSavingPreview').hidden,
      text: $('fSavingText').textContent.replace(/\s+/g, ' ').trim()
    }));
    c('F5-2-05', 'preview', 'a negative goal in the field',
      'treated as "no goal": the preview hides instead of printing NaN or -50/0',
      invalidPreview.hidden === true && !/NaN|Infinity/.test(invalidPreview.text), invalidPreview);

    // ---- reached text --------------------------------------------------
    await page.evaluate(() => {
      $('fSavingGoal').value = '100000';
      $('fSavingGoal').dispatchEvent(new Event('input', { bubbles: true }));
      $('fSavedAmount').value = '150000';
      $('fSavedAmount').dispatchEvent(new Event('input', { bubbles: true }));
    });
    await sleep(120);
    const overText = await page.evaluate(() => ({
      text: $('fSavingText').textContent.replace(/\s+/g, ' ').trim(),
      now: $('fSavingTrack').getAttribute('aria-valuenow')
    }));
    c('F5-2-06', 'preview', 'saving more than the goal',
      'reports the goal as reached and caps the bar at 100%',
      /Đã đạt mục tiêu tiết kiệm/.test(overText.text) && overText.now === '100', overText);

    // ---- create a brand new item with savings --------------------------
    await page.evaluate(() => { $('dlg').close(); openForm(null); });
    await sleep(300);
    await page.evaluate(() => {
      $('fName').value = 'Món mới F5';
      $('fPrice').value = '1200000';
      $('fSavingGoal').value = '900000';
      $('fSavedAmount').value = '300000';
    });
    await page.click('#form button[type="submit"]');
    await sleep(500);
    const created = await page.evaluate(() => {
      const it = items.find(x => x.name === 'Món mới F5');
      return it ? { id: it.id, goal: it.savingGoal, saved: it.savedAmount,
        price: it.price, status: it.status, keys: Object.keys(it) } : null;
    });
    c('F5-2-07', 'create', 'a new item with a goal and a recorded amount',
      'both fields are written and the list price is NOT used as the saved amount',
      !!created && created.goal === 900000 && created.saved === 300000 &&
      created.price === 1200000 && created.status !== 'purchased', created);

    // ---- empty fields write nothing (compatibility) --------------------
    await page.evaluate(() => { openForm(null); });
    await sleep(260);
    await page.evaluate(() => {
      $('fName').value = 'Món không tiết kiệm';
      $('fPrice').value = '500000';
      $('fSavingGoal').value = '';
      $('fSavedAmount').value = '';
    });
    await page.click('#form button[type="submit"]');
    await sleep(500);
    const plain = await page.evaluate(() => {
      const it = items.find(x => x.name === 'Món không tiết kiệm');
      return it ? { hasGoal: 'savingGoal' in it, hasSaved: 'savedAmount' in it } : null;
    });
    c('F5-2-08', 'create', 'a new item with both fields left empty',
      'no savings key is written at all — not 0, and definitely not the price',
      !!plain && plain.hasGoal === false && plain.hasSaved === false, plain);

    // ---- goal = 0 is not a goal ---------------------------------------
    await page.evaluate(() => { openForm(null); });
    await sleep(260);
    await page.evaluate(() => {
      $('fName').value = 'Món goal 0';
      $('fPrice').value = '700000';
      $('fSavingGoal').value = '0';
      $('fSavedAmount').value = '200000';
    });
    await page.click('#form button[type="submit"]');
    await sleep(500);
    const zero = await page.evaluate(() => {
      const it = items.find(x => x.name === 'Món goal 0');
      return it ? { hasGoal: 'savingGoal' in it, saved: it.savedAmount } : null;
    });
    c('F5-2-09', 'create', 'a goal of 0',
      'rejected as a goal (no key) while the recorded 200,000 is kept',
      !!zero && zero.hasGoal === false && zero.saved === 200000, zero);

    // ---- hostile goal blocks the save ----------------------------------
    await page.evaluate(() => { openForm(null); });
    await sleep(260);
    await page.evaluate(() => {
      $('fName').value = 'Món dữ liệu xấu';
      $('fPrice').value = '100000';
      $('fSavingGoal').value = '-1';
    });
    await page.click('#form button[type="submit"]');
    await sleep(420);
    const hostile = await page.evaluate(() => ({
      stillOpen: $('dlg').open,
      wroteIt: items.some(x => x.name === 'Món dữ liệu xấu'),
      toast: document.querySelector('.toast') ? document.querySelector('.toast').textContent.replace(/\s+/g, ' ').trim() : ''
    }));
    c('F5-2-10', 'validation', 'a negative goal',
      'the save is refused, the dialog stays open and nothing is written',
      hostile.stillOpen === true && hostile.wroteIt === false &&
      /Mục tiêu tiết kiệm/.test(hostile.toast), hostile);

    // ---- edit: change then clear ---------------------------------------
    await page.evaluate(() => {
      $('dlg').close();
      openForm(items.find(x => x.id === 'g2'));
    });
    await sleep(300);
    await page.evaluate(() => { $('fSavedAmount').value = '1500000'; });
    await page.click('#form button[type="submit"]');
    await sleep(500);
    const edited = await page.evaluate(() => {
      const it = items.find(x => x.id === 'g2');
      return { goal: it.savingGoal, saved: it.savedAmount };
    });
    c('F5-2-11', 'edit', 'changing the recorded amount',
      'goal 3000000 kept, saved updated to 1500000',
      edited.goal === 3000000 && edited.saved === 1500000, edited);

    await page.evaluate(() => openForm(items.find(x => x.id === 'g2')));
    await sleep(300);
    await page.evaluate(() => { $('fSavingGoal').value = ''; $('fSavedAmount').value = ''; });
    await page.click('#form button[type="submit"]');
    await sleep(500);
    const cleared = await page.evaluate(() => {
      const it = items.find(x => x.id === 'g2');
      return { hasGoal: 'savingGoal' in it, hasSaved: 'savedAmount' in it };
    });
    c('F5-2-12', 'edit', 'clearing both fields and saving',
      'both keys are removed from the row — the form is the explicit reset path',
      cleared.hasGoal === false && cleared.hasSaved === false, cleared);

    c('F5-2-13', 'errors', 'console', 'no page or console errors in the form scenario',
      state.pageErrors.length === 0 && state.errors.length === 0,
      { pageErrors: state.pageErrors.slice(0, 2), errors: state.errors.slice(0, 2) });

    await page.close();
  });

  // ===================================================================
  // C - F5.2 Quick View
  // ===================================================================
  await run('C', async () => {
    section = 'C F5.2 QUICK VIEW';
    const { page, state } = await newScenario(browser, { guestItems: F5FIX });

    await page.evaluate(() => openQuickView('g3', null));
    await sleep(520);
    const qv1 = await page.evaluate(QV_SAVINGS);
    c('F5-2-14', 'quick view', 'an item with a partly-funded goal',
      'summary visible, empty copy hidden, heading present, inputs prefilled, badge hidden',
      qv1.open === true && qv1.summary.hidden === false && qv1.empty.hidden === true &&
      /Mục tiêu tiết kiệm/.test(qv1.heading) && qv1.goalInput === '1000000' &&
      qv1.savedInput === '400000' && qv1.badgeHidden === true, qv1);

    c('F5-2-15', 'quick view', 'the progress read-out',
      '400.000 ₫ / 1.000.000 ₫, 40%, còn thiếu 600.000 ₫, reset offered',
      /400\.000/.test(qv1.saved) && /1\.000\.000/.test(qv1.goal) &&
      qv1.barNow === '40' && /Còn thiếu 600\.000/.test(qv1.remaining) &&
      qv1.resetHidden === false, qv1);

    await page.evaluate(() => closeQuickView());
    await sleep(500);
    await page.evaluate(() => openQuickView('g1', null));
    await sleep(520);
    const qv2 = await page.evaluate(QV_SAVINGS);
    c('F5-2-16', 'quick view', 'an item with no goal',
      'empty copy shown, summary hidden, reset not offered',
      qv2.summary.hidden === true && qv2.empty.hidden === false && qv2.resetHidden === true, qv2);

    // ---- set a goal from the Quick View --------------------------------
    await page.evaluate(() => {
      $('qvSavingGoal').value = '2500000';
      $('qvSavedAmount').value = '1000000';
      $('qvSavingsSave').click();
    });
    await sleep(520);
    const qv3 = await page.evaluate(QV_SAVINGS);
    const stored3 = await page.evaluate(() => {
      const it = items.find(x => x.id === 'g1');
      return { goal: it.savingGoal, saved: it.savedAmount, status: it.status };
    });
    c('F5-2-17', 'quick view', 'setting a goal from the QV',
      'the row is written (2500000 / 1000000) and the QV stays open on the same item',
      stored3.goal === 2500000 && stored3.saved === 1000000 &&
      qv3.open === true && qv3.id === 'g1' && qv3.barNow === '40', { qv3, stored3 });

    c('F5-2-18', 'status', 'recording savings never buys the item',
      'the status is still not "purchased" and the QV status line is unchanged',
      stored3.status !== 'purchased' && qv3.status === 'Muốn mua', {
        status: stored3.status, qvStatus: qv3.status
      });

    // ---- reached badge -------------------------------------------------
    await page.evaluate(() => {
      $('qvSavedAmount').value = '3000000';
      $('qvSavingsSave').click();
    });
    await sleep(520);
    const qv4 = await page.evaluate(QV_SAVINGS);
    c('F5-2-19', 'quick view', 'saving MORE than the goal from the QV',
      'the "Đã đạt mục tiêu" badge appears, the bar caps at 100%, and the copy says it is still not bought',
      qv4.badgeHidden === false && /Đã đạt mục tiêu/.test(qv4.badge) && qv4.barNow === '100' &&
      /vẫn chưa được đánh dấu là đã mua/.test(qv4.remaining), qv4);

    const stored4 = await page.evaluate(() => {
      const it = items.find(x => x.id === 'g1');
      return { goal: it.savingGoal, saved: it.savedAmount };
    });
    c('F5-2-20', 'quick view', 'the over-saved value is stored intact',
      '3000000 is NOT clamped down to the 2500000 goal',
      stored4.goal === 2500000 && stored4.saved === 3000000, stored4);

    // ---- invalid input in the QV ---------------------------------------
    await page.evaluate(() => {
      $('qvSavedAmount').value = '-5';
      $('qvSavingsSave').click();
    });
    await sleep(420);
    const qvBad = await page.evaluate(() => {
      const it = items.find(x => x.id === 'g1');
      return { saved: it.savedAmount, open: $('qv').open };
    });
    c('F5-2-21', 'quick view', 'an invalid amount in the QV',
      'refused with a message, nothing written, the QV stays open',
      qvBad.saved === 3000000 && qvBad.open === true, qvBad);

    // ---- goal = 0 in the QV --------------------------------------------
    await page.evaluate(() => {
      $('qvSavingGoal').value = '0';
      $('qvSavedAmount').value = '150000';
      $('qvSavingsSave').click();
    });
    await sleep(520);
    const qvZero = await page.evaluate(() => {
      const it = items.find(x => x.id === 'g1');
      return { hasGoal: 'savingGoal' in it, saved: it.savedAmount };
    });
    const qvZeroUi = await page.evaluate(QV_SAVINGS);
    c('F5-2-22', 'quick view', 'a goal of 0 in the QV',
      'the goal is dropped, the amount is kept, and the summary falls back to the empty copy',
      qvZero.hasGoal === false && qvZero.saved === 150000 &&
      qvZeroUi.summary.hidden === true && qvZeroUi.empty.hidden === false, {
        qvZero, summaryHidden: qvZeroUi.summary.hidden
      });

    // ---- reset requires a confirmation ---------------------------------
    await page.evaluate(() => closeQuickView());
    await sleep(500);
    await page.evaluate(() => openQuickView('g4', null));
    await sleep(520);
    state.acceptDialogs = false;
    await page.click('#qvSavingsReset');
    await sleep(300);
    const afterDismiss = await page.evaluate(() => {
      const it = items.find(x => x.id === 'g4');
      return { goal: it.savingGoal, saved: it.savedAmount };
    });
    c('F5-2-23', 'reset', 'dismissing the confirmation',
      'nothing is deleted (goal 500000 / saved 500000 intact)',
      afterDismiss.goal === 500000 && afterDismiss.saved === 500000, afterDismiss);

    state.acceptDialogs = true;
    await page.click('#qvSavingsReset');
    await sleep(520);
    const afterAccept = await page.evaluate(() => {
      const it = items.find(x => x.id === 'g4');
      return { hasGoal: 'savingGoal' in it, hasSaved: 'savedAmount' in it,
        status: it.status };
    });
    const qvReset = await page.evaluate(QV_SAVINGS);
    c('F5-2-24', 'reset', 'accepting the confirmation',
      'both fields are removed, the QV falls back to the empty copy, the status is untouched',
      afterAccept.hasGoal === false && afterAccept.hasSaved === false &&
      afterAccept.status === 'wish' && qvReset.summary.hidden === true &&
      qvReset.goalInput === '', { afterAccept, resetHidden: qvReset.resetHidden });

    c('F5-2-25', 'dialogs', 'the reset confirmation',
      'the user is asked exactly once, in Vietnamese, naming the item',
      state.dialogs.length >= 2 && /g4|Món đạt mục tiêu/.test(state.dialogs[state.dialogs.length - 1]),
      { dialogs: state.dialogs.slice(-2) });

    c('F5-2-26', 'errors', 'console', 'no page or console errors in the Quick View scenario',
      state.pageErrors.length === 0 && state.errors.length === 0,
      { pageErrors: state.pageErrors.slice(0, 2), errors: state.errors.slice(0, 2) });

    await page.close();
  });

  // ===================================================================
  // D - F5.3 dashboard savings overview
  // ===================================================================
  await run('D', async () => {
    section = 'D F5.3 SAVINGS OVERVIEW';
    const { page, state } = await newScenario(browser, { guestItems: F5FIX });

    const ui = await page.evaluate(SAVINGS_UI);
    c('F5-3-01', 'widget', 'four figures, one per row',
      'Mục tiêu đang theo dõi / Đã tích lũy / Còn thiếu / Đủ tiền, chưa mua',
      ui.hostHidden === false && ui.rows.length === 4 &&
      ui.rows.map(r => r.name).join('|') ===
        'Mục tiêu đang theo dõi|Đã tích lũy|Còn thiếu|Đủ tiền, chưa mua',
      ui.rows.map(r => r.name));

    c('F5-3-02', 'widget', 'the four values',
      '4.800.000 ₫ / 1.350.000 ₫ / 3.600.000 ₫ / 3 món',
      /4\.800\.000/.test(ui.rows[0].value) && /1\.350\.000/.test(ui.rows[1].value) &&
      /3\.600\.000/.test(ui.rows[2].value) && ui.rows[3].value === '3 món',
      ui.rows.map(r => r.value));

    c('F5-3-03', 'widget', 'the aggregate progressbar',
      'aria-valuenow 28% and a readable aria-valuetext, never NaN',
      ui.barNow === '28' && /đã để dành/.test(ui.barText) && !/NaN/.test(ui.barText),
      { barNow: ui.barNow, barText: ui.barText });

    c('F5-3-04', 'widget', 'each row is a real button',
      'four <button> rows carrying their own filter value and a full aria-label',
      ui.rows.every(r => r.tag === 'BUTTON') &&
      ui.rows.map(r => r.filter).join(',') === 'goal,saving,short,ready' &&
      ui.rows.every(r => r.label.length > 10), ui.rows.map(r => [r.tag, r.filter, r.label]));

    c('F5-3-05', 'widget', 'the purchased row is excluded',
      'g7 is not part of any figure: goalTotal is 4,800,000, not 5,500,000',
      !/5\.500\.000/.test(ui.rows[0].value) && /4\.800\.000/.test(ui.rows[0].value),
      ui.rows[0].value);

    // ---- the empty state removes the card -------------------------------
    const bare = await newScenario(browser, { guestItems: F5FIX.filter(x => x.id === 'g1') });
    await sleep(200);
    const bareUi = await bare.page.evaluate(SAVINGS_UI);
    c('F5-3-06', 'empty', 'no item has a goal',
      'the whole savings card is removed (display:none), not left as a shell of zeros',
      bareUi.hostHidden === true && bareUi.hostDisplay === 'none', {
        hidden: bareUi.hostHidden, display: bareUi.hostDisplay
      });
    await bare.page.close();

    const onlyPurchased = await newScenario(browser,
      { guestItems: F5FIX.filter(x => x.id === 'g7') });
    await sleep(200);
    const onlyPurchasedUi = await onlyPurchased.page.evaluate(SAVINGS_UI);
    c('F5-3-07', 'empty', 'only a PURCHASED item has a goal',
      'still removed — a bought item has left the savings loop',
      onlyPurchasedUi.hostHidden === true, { hidden: onlyPurchasedUi.hostHidden });
    await onlyPurchased.page.close();

    // ---- the link back to the Collection --------------------------------
    const landing = {};
    for (const filter of ['goal', 'saving', 'short', 'ready']) {
      await page.evaluate((f) => {
        document.querySelector('#dvSavingsRows .dv-savings__row[data-savings="' + f + '"]').click();
      }, filter);
      await sleep(420);
      landing[filter] = await page.evaluate(COLLECTION);
    }

    c('F5-3-08', 'link', 'clicking "Mục tiêu đang theo dõi"',
      '#fSavings = goal, the tab is "Chưa mua", and the grid holds the 5 goal-bearing unpurchased items',
      landing.goal.savings === 'goal' && landing.goal.activeTab.join(',') === 'pending' &&
      landing.goal.cards.length === 5 && !landing.goal.cards.includes('g7'), landing.goal);

    c('F5-3-09', 'link', 'the landing count matches the widget figure',
      '"Đủ tiền, chưa mua" says 3 món and exactly 3 cards land',
      landing.ready.savings === 'ready' && landing.ready.cards.length === 3 &&
      landing.ready.cards.sort().join(',') === 'g4,g5,g8', landing.ready.cards);

    c('F5-3-10', 'link', '"Đã tích lũy" lands on the rows that contribute',
      'saving + pending holds the 4 goal-bearing rows with a recorded amount',
      landing.saving.savings === 'saving' && landing.saving.cards.length === 4 &&
      landing.saving.cards.sort().join(',') === 'g3,g4,g5,g8', landing.saving.cards);

    c('F5-3-11', 'link', '"Còn thiếu" lands on the unfinished goals',
      'short + pending holds g2 and g3 only',
      landing.short.savings === 'short' && landing.short.cards.length === 2 &&
      landing.short.cards.sort().join(',') === 'g2,g3', landing.short.cards);

    c('F5-3-12', 'link', 'the shortcut resets the other facets',
      'status / priority / category / search are cleared, only the savings facet survives',
      landing.goal.status === '' && landing.goal.priority === '' &&
      landing.goal.category === '' && landing.goal.query === '', landing.goal);

    c('F5-3-13', 'link', 'the collapsed-filter badge counts the facet',
      'the phone badge reports one active filter',
      landing.goal.filterCount === '1' && landing.goal.filterCountHidden === false,
      { count: landing.goal.filterCount, hidden: landing.goal.filterCountHidden });

    // ---- clearing restores everything ----------------------------------
    await page.click('#btnClearFilter');
    await sleep(420);
    const cleared = await page.evaluate(COLLECTION);
    c('F5-3-14', 'link', 'one control resets the savings facet',
      '"Xóa bộ lọc" clears #fSavings, the tab and the badge',
      cleared.savings === '' && cleared.activeTab.join(',') === 'all' &&
      cleared.filterCountHidden === true && cleared.cards.length === F5FIX.length, cleared);

    // ---- no layout shift from the widget --------------------------------
    await page.evaluate(() => { window.__shifts.length = 0; });
    await page.evaluate(() => {
      document.querySelector('#dvSavingsRows .dv-savings__row[data-savings="goal"]').click();
    });
    await sleep(500);
    await page.click('#btnClearFilter');
    await sleep(500);
    const shifts = await page.evaluate(() => window.__shifts.slice());
    const clsTotal = Number(shifts.reduce((n, v) => n + v, 0).toFixed(5));
    c('F5-3-15', 'layout', 'the dashboard widget and its shortcut',
      'filtering / clearing from the widget keeps cumulative layout shift at 0',
      clsTotal === 0, { shifts, cls: clsTotal });

    c('F5-3-16', 'errors', 'console', 'no page or console errors in the dashboard scenario',
      state.pageErrors.length === 0 && state.errors.length === 0,
      { pageErrors: state.pageErrors.slice(0, 2), errors: state.errors.slice(0, 2) });

    await page.close();
  });

  // ===================================================================
  // E - F5.4 insights
  // ===================================================================
  await run('E', async () => {
    section = 'E F5.4 INSIGHTS';
    const { page, state } = await newScenario(browser, { guestItems: F5FIX });

    const ui = await page.evaluate(INSIGHTS_UI);
    c('F5-4-01', 'widget', 'the shortlist order',
      'rank1 high priority (g6, g8) then rank2 reached (g4, g5); the 4-item cap applies',
      ui.hostHidden === false && ui.rows.map(r => r.id).join(',') === 'g6,g8,g4,g5',
      ui.rows.map(r => r.id));

    c('F5-4-02', 'widget', 'every suggestion explains itself',
      'g6 "Ưu tiên cao", g8 both reasons, g4/g5 "Đã đạt mục tiêu tiết kiệm"',
      ui.rows[0].reason === 'Ưu tiên cao' &&
      ui.rows[1].reason === 'Ưu tiên cao · đã đạt mục tiêu tiết kiệm' &&
      ui.rows[2].reason === 'Đã đạt mục tiêu tiết kiệm' &&
      ui.rows[3].reason === 'Đã đạt mục tiêu tiết kiệm', ui.rows.map(r => r.reason));

    c('F5-4-03', 'widget', 'a real name, a real price and an explicit "Xem món"',
      'each row is a button showing the name, the list price and the action label',
      ui.rows.every(r => r.tag === 'BUTTON' && r.name.length > 0 && /₫/.test(r.price) &&
        r.go === 'Xem món'),
      ui.rows.map(r => [r.name, r.price, r.go]));

    // ---- money wording for the "small gap" rule --------------------------
    const gap = await page.evaluate(() => {
      const picked = buildInsights(items).map(p => p.it.id);
      const reasonFor = (id) => insightReason(items.find(x => x.id === id),
        savingsRank(items.find(x => x.id === id)));
      return { picked, g3: reasonFor('g3'), g2: reasonFor('g2'), g1: reasonFor('g1'),
        rank3order: buildInsights(items.filter(x => ['g2', 'g3'].includes(x.id))).map(p => p.it.id) };
    });
    c('F5-4-04', 'rules', 'the "small gap" rule',
      'among goals still short, the smallest gap ranks first (g3 600,000 before g2 3,000,000)',
      gap.rank3order.join(',') === 'g3,g2' && /Còn thiếu 600\.000\s*₫ tới mục tiêu/.test(gap.g3),
      gap);

    c('F5-4-05', 'rules', 'the catch-all rule',
      'an unpurchased item with no goal and no high priority is still suggested, as "Chưa mua"',
      gap.g1 === 'Chưa mua' && gap.rank3order.length === 2, { g1: gap.g1 });

    // ---- the rules never include a purchased item ------------------------
    const purchasedPick = await page.evaluate(() => {
      const onlyBought = items.filter(x => x.status === 'purchased');
      return {
        picks: buildInsights(onlyBought).map(p => p.it.id),
        ranks: onlyBought.map(x => savingsRank(x))
      };
    });
    c('F5-4-06', 'rules', 'a purchased item is never suggested',
      'savingsRank returns null for it and the shortlist is empty',
      purchasedPick.picks.length === 0 && purchasedPick.ranks.every(r => r === null),
      purchasedPick);

    // ---- stable tie-break -------------------------------------------------
    const stable = await page.evaluate(() => {
      const A = { id: 'b1', name: 'B', status: 'wish', priority: 'high', createdAt: 500 };
      const B = { id: 'a2', name: 'A', status: 'wish', priority: 'high', createdAt: 500 };
      const Cc = { id: 'c0', name: 'C', status: 'wish', priority: 'high', createdAt: 400 };
      return {
        forward: buildInsights([A, B, Cc]).map(p => p.it.id),
        reversed: buildInsights([Cc, B, A]).map(p => p.it.id)
      };
    });
    c('F5-4-07', 'rules', 'exact ties',
      'ordered by createdAt then id, so the result does not depend on array order',
      stable.forward.join(',') === 'c0,a2,b1' && stable.forward.join(',') === stable.reversed.join(','),
      stable);

    const cap = await page.evaluate(() => buildInsights(items).length);
    c('F5-4-08', 'rules', 'the widget stays short',
      'at most 4 suggestions, so the dashboard cannot grow into a second collection list',
      cap === 4, { count: cap });

    // ---- the button opens the Quick View and changes nothing -------------
    const beforeStatus = await page.evaluate(() => items.map(x => [x.id, x.status]));
    await page.click('#dvInsightsRows .dv-insights__row[data-insight-id="g6"]');
    await sleep(560);
    const opened = await page.evaluate(() => ({
      open: $('qv').open, id: $('qv').dataset.id, title: $('qvTitle').textContent,
      goalInput: $('qvSavingGoal').value, savedInput: $('qvSavedAmount').value
    }));
    const afterStatus = await page.evaluate(() => items.map(x => [x.id, x.status]));
    c('F5-4-09', 'action', '"Xem" opens the Quick View for that item',
      'the QV is open on g6 with its own savings fields loaded',
      opened.open === true && opened.id === 'g6' && /Món ưu tiên cao/.test(opened.title) &&
      opened.goalInput === '', opened);

    c('F5-4-10', 'action', 'opening a suggestion changes nothing',
      'no status changed and no purchase was recorded',
      JSON.stringify(beforeStatus) === JSON.stringify(afterStatus), {
        changed: beforeStatus.filter((x, i) => x[1] !== afterStatus[i][1])
      });

    // ---- the widget never claims affordability --------------------------
    const wording = await page.evaluate(() => {
      const rows = [...document.querySelectorAll('#dvInsightsRows .dv-insights__row')];
      const text = rows.map(r => r.textContent).join(' ');
      return {
        text: text.replace(/\s+/g, ' ').trim(),
        hasBadWords: /đủ khả năng|đủ tiền để mua|nên mua|hãy mua/i.test(text)
      };
    });
    c('F5-4-11', 'copy', 'the wording',
      'no sentence claims the user can afford anything or should buy — reasons are facts about the data',
      wording.hasBadWords === false && wording.text.length > 0, wording);

    // ---- the accessible name carries the whole row -----------------------
    const names = await page.evaluate(() => [...document.querySelectorAll('#dvInsightsRows .dv-insights__row')]
      .map(r => r.getAttribute('aria-label').replace(/\s+/g, ' ').trim()));
    c('F5-4-15', 'a11y', 'the accessible name of a suggestion',
      'the aria-label repeats the action, the item and its reason, so the reason is not lost to a screen reader',
      names.length === 4 && names.every((n, i) =>
        /^Xem món /.test(n) && n.includes(ui.rows[i].name) && n.includes(ui.rows[i].reason) &&
        /Giá ghi nhận/.test(n)), names);

    // ---- hidden when nothing is left to see -----------------------------
    const done = await newScenario(browser, {
      guestItems: F5FIX.map(x => Object.assign({}, x, { status: 'purchased' }))
    });
    await sleep(220);
    const doneUi = await done.page.evaluate(INSIGHTS_UI);
    c('F5-4-12', 'empty', 'everything is bought',
      'the insights widget removes itself',
      doneUi.hostHidden === true, { hidden: doneUi.hostHidden });
    await done.page.close();

    // ---- reduced motion ---------------------------------------------------
    const rm = await newScenario(browser, { guestItems: F5FIX }, { reducedMotion: true });
    await sleep(260);
    const rmUi = await rm.page.evaluate(SAVINGS_UI);
    c('F5-4-13', 'motion', 'prefers-reduced-motion: reduce',
      'the widget still renders its figures (motion is the only thing dropped)',
      rmUi.hostHidden === false && rmUi.rows.length === 4, { hidden: rmUi.hostHidden });
    await rm.page.close();

    c('F5-4-14', 'errors', 'console', 'no page or console errors in the insights scenario',
      state.pageErrors.length === 0 && state.errors.length === 0,
      { pageErrors: state.pageErrors.slice(0, 2), errors: state.errors.slice(0, 2) });

    await page.close();
  });

  // ===================================================================
  // F - F5.5 responsive / payload / F4 non-regression
  // ===================================================================
  await run('F', async () => {
    section = 'F F5.5 RESPONSIVE + NON-REGRESSION';

    // ---- no horizontal overflow at the smallest phones -------------------
    for (const w of [320, 390, 430]) {
      const s = await newScenario(browser, { guestItems: F5FIX }, { width: w, height: 780 });
      await sleep(320);
      const geo = await s.page.evaluate(() => {
        const de = document.documentElement;
        const worst = (sel) => {
          const el = document.querySelector(sel);
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return { right: Math.round(r.right), left: Math.round(r.left), w: Math.round(r.width) };
        };
        return {
          scrollW: de.scrollWidth, clientW: de.clientWidth,
          savings: worst('#dvSavings'), insights: worst('#dvInsights'),
          gridCols: getComputedStyle(document.querySelector('.dv-grid--f5')).gridTemplateColumns
        };
      });
      c('F5-5-01-' + w, 'responsive', 'phone ' + w + 'px',
        'the document never widens and both F5 widgets fit inside it',
        geo.scrollW <= geo.clientW + 1 &&
        (!geo.savings || (geo.savings.right <= w + 1 && geo.savings.left >= -1)) &&
        (!geo.insights || (geo.insights.right <= w + 1 && geo.insights.left >= -1)), geo);
      await s.page.close();
    }

    // ---- desktop: the two widgets share one row --------------------------
    const desk = await newScenario(browser, { guestItems: F5FIX }, { width: 1440 });
    await sleep(360);
    const cols = await desk.page.evaluate(() => {
      const grid = document.querySelector('.dv-grid--f5');
      const kids = [...grid.children].filter(el => !el.hidden);
      return {
        columns: getComputedStyle(grid).gridTemplateColumns.split(' ').length,
        visible: kids.length,
        sameRow: kids.length === 2 &&
          Math.abs(kids[0].getBoundingClientRect().top - kids[1].getBoundingClientRect().top) < 2
      };
    });
    c('F5-5-02', 'responsive', 'desktop 1440px',
      'both widgets are visible and sit side by side in one two-column row',
      cols.visible === 2 && cols.columns >= 2 && cols.sameRow === true, cols);

    // ---- a single visible widget stretches ------------------------------
    const one = await newScenario(browser, { guestItems: [F5FIX[5]] });   // g6 only
    await sleep(320);
    const full = await one.page.evaluate(() => {
      const grid = document.querySelector('.dv-grid--f5');
      const vis = [...grid.children].filter(el => !el.hidden);
      const gw = grid.getBoundingClientRect().width;
      const cw = vis[0] ? vis[0].getBoundingClientRect().width : 0;
      return { visible: vis.length, gridW: Math.round(gw), childW: Math.round(cw) };
    });
    c('F5-5-03', 'responsive', 'only one widget has something to say',
      'it stretches across the whole row instead of leaving an empty column (savings hidden, insights shown)',
      full.visible === 1 && full.childW >= full.gridW - 2, full);
    await one.page.close();

    // ---- no new network dependency ---------------------------------------
    const requests = [];
    const cdp = await desk.page.target().createCDPSession();
    await cdp.send('Network.enable');
    cdp.on('Network.requestWillBeSent', e => {
      requests.push(e.request.url);
    });
    await desk.page.reload({ waitUntil: 'domcontentloaded' });
    await sleep(1400);
    const local = requests.filter(u => /localhost|127\.0\.0\.1/.test(u));
    // A third-party library is any script/stylesheet that is NOT served from the
    // app's own origin.
    const libs = requests.filter(u => /\.(js|css)(\?|$)/.test(u) && !/localhost|127\.0\.0\.1/.test(u));
    // V16.1 F6.2: the published build concatenates the source sheets into one
    // css/app.css, so the stylesheet count is no longer a fixed number. The
    // invariant that matters is origin, not filename: every stylesheet the app
    // loads must come from the app itself, and nothing third-party may load.
    const cssReqs = requests.filter(u => /\.css(\?|$)/.test(u));
    const allCssLocal = cssReqs.length > 0 && cssReqs.every(u => /localhost|127\.0\.0\.1/.test(u));
    c('F5-5-04', 'payload', 'the app stylesheet and nothing else',
      'every stylesheet is served from the app origin and there is no third-party script or stylesheet',
      allCssLocal && libs.length === 0,
      { localCss: local.filter(u => /\.css(\?|$)/.test(u)).length, libs });

    const ctxErr = await desk.page.evaluate(() => ({
      errors: 0
    }));
    c('F5-5-05', 'payload', 'no new runtime dependency',
      'the F5 code is inline in wishlist.html plus one stylesheet — nothing else to load',
      ctxErr.errors === 0);
    await desk.page.close();

    // ---- F4 surfaces are untouched ----------------------------------------
    const f4 = await newScenario(browser, { guestItems: F5FIX }, { width: 390, height: 780 });
    await sleep(360);
    const d = await f4.page.evaluate(() => {
      const el = (id) => document.getElementById(id);
      const toggle = el('filterToggle');
      const panel = el('filtersPanel');
      const count = el('filterCount');
      return {
        toggleShown: toggle ? getComputedStyle(toggle).display !== 'none' : false,
        panelClosed: panel ? getComputedStyle(panel).display === 'none' : false,
        selects: ['fStatus', 'fPriority', 'fCategoryFilter', 'fSort']
          .filter(id => !!el(id)).length,
        savingsSelectPresent: !!el('fSavings'),
        badgeHidden: count ? count.hidden : null
      };
    });
    c('F5-5-06', 'non-regression', 'the F4.4 phone disclosure',
      'still collapses the panel on a phone with all five selects in the DOM',
      d.toggleShown === true && d.panelClosed === true && d.selects === 4 &&
      d.savingsSelectPresent === true && d.badgeHidden === true, d);

    await f4.page.click('#filterToggle');
    await sleep(320);
    const d2 = await f4.page.evaluate(() => {
      const el = (id) => document.getElementById(id);
      const r = el('fSavings') ? el('fSavings').getBoundingClientRect() : null;
      return {
        expanded: el('filterToggle').getAttribute('aria-expanded'),
        panelOpen: getComputedStyle(el('filtersPanel')).display !== 'none',
        savingsVisible: !!r && r.width > 1 && r.height > 1
      };
    });
    c('F5-5-07', 'non-regression', 'expanding the panel on a phone',
      'the new savings select is revealed with the other four',
      d2.expanded === 'true' && d2.panelOpen === true && d2.savingsVisible === true, d2);

    // card menu (F4.2) still works
    await f4.page.evaluate(() => { document.getElementById('qv').close(); });
    const menu = await f4.page.evaluate(() => {
      const card = document.querySelector('#grid > .wishlist-card');
      const trigger = card.querySelector('.card-more__trigger');
      trigger.click();
      const panel = card.querySelector('.card-more__menu');
      return {
        hasTrigger: !!trigger,
        open: panel ? panel.getAttribute('data-open') : null,
        items: card.querySelectorAll('.card-more__menu .card-more__item').length
      };
    });
    c('F5-5-08', 'non-regression', 'the F4.2 card menu',
      'the ⋯ panel still opens with its relocated legacy controls',
      menu.hasTrigger === true && menu.open === 'true' && menu.items >= 2, menu);

    const storageShape = await f4.page.evaluate(() => {
      const arr = JSON.parse(localStorage.getItem('wishlist.guest.items') || '[]');
      return { count: arr.length, allObjects: arr.every(x => x && typeof x === 'object') };
    });
    c('F5-5-09', 'data', 'the guest list after an F5 session',
      'still a plain array of item objects — no wrapper, no schema change',
      storageShape.count === F5FIX.length && storageShape.allObjects === true, storageShape);

    c('F5-5-10', 'errors', 'console', 'no page or console errors in the responsive scenario',
      f4.state.pageErrors.length === 0 && f4.state.errors.length === 0,
      { pageErrors: f4.state.pageErrors.slice(0, 2), errors: f4.state.errors.slice(0, 2) });

    await f4.page.close();

    // ---- many items: the widgets must hold up at collection scale ---------
    const many = [];
    for (let i = 0; i < 40; i++) {
      const row = {
        id: 'm' + i,
        name: 'Món số ' + i,
        price: 100000 * (i + 1),
        image: '', link: '',
        status: i % 5 === 0 ? 'purchased' : (i % 3 === 0 ? 'saving' : 'wish'),
        priority: i % 4 === 0 ? 'high' : (i % 4 === 1 ? 'medium' : 'low'),
        category: 'Nhóm ' + (i % 3), note: '',
        createdAt: 1700000000000 + i
      };
      // Two thirds carry a goal; a third of those have already reached it.
      if (i % 3 !== 2) {
        row.savingGoal = 500000 * (i + 1);
        row.savedAmount = i % 2 === 0 ? 500000 * (i + 1) : Math.round(250000 * (i + 1));
      }
      many.push(row);
    }
    const scale = await newScenario(browser, { guestItems: many }, { width: 390, height: 780 });
    await sleep(420);
    const scaleUi = await scale.page.evaluate((rows) => {
      const norm = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
      const grid = document.querySelector('.dv-grid--f5');
      const s = computeSavings(items);
      const expectedGoal = rows.filter(r => r.status !== 'purchased' && r.savingGoal)
        .reduce((n, r) => n + r.savingGoal, 0);
      const expectedSaved = rows.filter(r => r.status !== 'purchased' && r.savingGoal)
        .reduce((n, r) => n + (r.savedAmount || 0), 0);
      const expectedCount = rows.filter(r => r.status !== 'purchased' && r.savingGoal).length;
      return {
        scrollW: document.documentElement.scrollWidth,
        clientW: document.documentElement.clientWidth,
        goalCount: s.goalCount,
        goalTotal: s.goalTotal,
        savedTotal: s.savedTotal,
        expectedGoal, expectedSaved, expectedCount,
        savingsRows: document.querySelectorAll('#dvSavingsRows .dv-savings__row').length,
        insightsRows: document.querySelectorAll('#dvInsightsRows .dv-insights__row').length,
        widgetW: Math.round(grid.getBoundingClientRect().width),
        stillFits: [...grid.children].every(el => el.getBoundingClientRect().right <= window.innerWidth + 1)
      };
    }, many);
    c('F5-5-11', 'scale', '40 items, most of them carrying a goal',
      'the aggregates still match a recomputation and the insight list is still capped',
      scaleUi.goalCount === scaleUi.expectedCount && scaleUi.expectedCount > 10 &&
      scaleUi.goalTotal === scaleUi.expectedGoal &&
      scaleUi.savedTotal === scaleUi.expectedSaved && scaleUi.savingsRows === 4 &&
      scaleUi.insightsRows === 4, scaleUi);
    c('F5-5-12', 'scale', 'the dashboard at 390px with 40 items',
      'no horizontal overflow and both widgets stay inside the viewport',
      scaleUi.scrollW <= scaleUi.clientW + 1 && scaleUi.stillFits === true,
      { scrollW: scaleUi.scrollW, clientW: scaleUi.clientW, stillFits: scaleUi.stillFits });
    c('F5-5-13', 'scale', 'console', 'no page or console errors at 40 items',
      scale.state.pageErrors.length === 0 && scale.state.errors.length === 0,
      { pageErrors: scale.state.pageErrors.slice(0, 2), errors: scale.state.errors.slice(0, 2) });
    await scale.page.close();
  });

  // ===================================================================
  // Report
  // ===================================================================
  await browser.close();
  server.close();

  const pass = results.filter(r => r.pass).length;
  const fail = results.length - pass;

  let lastSection = '';
  results.forEach(r => {
    if (r.section !== lastSection) {
      lastSection = r.section;
      console.log('');
      console.log('--- ' + lastSection + ' ---');
    }
    console.log((r.pass ? 'PASS' : 'FAIL') + ' [' + r.id + '] ' + r.area + ' :: ' + r.expected +
      (r.pass ? '' : '  ::  got ' + r.actual));
    if (!r.pass) console.log('      expected >> ' + JSON.stringify(r.entry));
  });
  console.log('');
  console.log('==== F5 SUITE: ' + pass + ' PASS / ' + fail + ' FAIL (total ' + results.length + ') ====');

  fs.writeFileSync(path.join(OUT, 'f5-suite.json'), JSON.stringify({
    generatedAt: new Date().toISOString(),
    repo: ROOT,
    pass, fail, total: results.length,
    results
  }, null, 1));

  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('FATAL ' + (e && e.stack || e)); process.exit(2); });
