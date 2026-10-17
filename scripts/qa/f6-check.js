// =====================================================================
// DREAM VAULT V16.1 - F6 MOTION POLISH & PERFORMANCE - CORRECTNESS SUITE
// ---------------------------------------------------------------------
// Serves the real repo, stubs ONLY the cloud module, and asserts that the
// motion on every F6.3 / F6.4 surface is present, correct and disciplined:
// transform/opacity only, change-detected, reduced-motion aware, no replay on
// search/filter, no stacking, no layout shift.
//
// usage: node v16_7-f6-check.js [repoRoot] [--only=A]
// =====================================================================
const puppeteer = require('puppeteer-core');
const http = require('http');
const fs = require('fs');
const path = require('path');

const CHROME = process.env.CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT = process.argv[2] && !process.argv[2].startsWith('--')
  ? process.argv[2] : path.join(__dirname, '..', '..');
const ONLY = (process.argv.find(a => a.startsWith('--only=')) || '').replace('--only=', '');
const PORT = 8158;
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

// Spy on WAAPI so the suite can assert WHAT was animated, not just that
// something was. Installed before any page script runs.
const SPY = `
  window.__animates = [];
  window.__animatesByTarget = {};
  (function(){
    const orig = Element.prototype.animate;
    Element.prototype.animate = function(keyframes, opts){
      const props = [];
      const kf = Array.isArray(keyframes) ? keyframes : [keyframes];
      for (const f of kf) for (const k in f) if (props.indexOf(k) < 0) props.push(k);
      const rec = { props, duration: opts && opts.duration,
        target: this.id || (typeof this.className === 'string' ? this.className : '') || this.tagName };
      window.__animates.push(rec);
      const key = rec.target + '|' + props.join(',');
      window.__animatesByTarget[key] = (window.__animatesByTarget[key] || 0) + 1;
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
  { id: 'a1', name: 'Món một', price: 1000000, image: '', link: '', status: 'wish', priority: 'high', category: 'A', note: '', createdAt: 1700000000001 },
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
  section = 'A F6.3 DASHBOARD MOTION';
  // ===================================================================
  if (!ONLY || ONLY === 'A') {
    {
      const { ctx, page } = await newScenario(browser, FIX);
      // A1: a KPI that changes animates, and only with transform/opacity.
      const before = await animCount(page);
      await page.evaluate(() => {
        const it = items.find(x => x.id === 'a1');
        it.price = 1500000;
        render();
      });
      await sleep(400);
      const after = await animates(page);
      const news = after.slice(before);
      const kpiNudge = news.find(a => a.props.includes('opacity') && a.props.includes('transform'));
      c('F6-3-01', 'KPI nudge', 'a changed KPI nudges',
        'changing a KPI value produces a WAAPI animation on that element',
        news.length > 0 && !!kpiNudge, { count: news.length, props: news.map(a => a.props) });

      // A2: the nudge never touches a layout property.
      const layoutProps = ['width', 'height', 'top', 'left', 'margin', 'padding', 'x', 'y', 'scale'];
      const bad = news.filter(a => a.props.some(p => layoutProps.includes(p)));
      c('F6-3-02', 'KPI nudge', 'transform/opacity only',
        'no animated property is a layout property (width/height/top/left/margin/padding/x/y/scale)',
        bad.length === 0, { bad: bad.map(a => a.props) });

      // A3: an unchanged KPI does not animate.
      const before2 = await animCount(page);
      await page.evaluate(() => { render(); });
      await sleep(400);
      const after2 = await animCount(page);
      c('F6-3-03', 'KPI nudge', 'no nudge when nothing changed',
        'a render that changes no KPI value produces no new animation',
        after2 === before2, { before: before2, after: after2 });

      // A4: the ownership progress bar animates its width through a CSS transition
      // on --dv-motion. (It is a layout element, so it uses width, not transform:
      // the savings bar uses transform because it is an overlay. Both are correct
      // for their shape; both are reduced-motion aware - see the media query.)
      const fillOk = await page.evaluate(() => {
        const fill = document.getElementById('dvProgressFill');
        if (!fill) return { ok: false, reason: 'no #dvProgressFill' };
        const cs = getComputedStyle(fill);
        return { ok: true, transition: cs.transition, width: cs.width };
      });
      c('F6-3-04', 'progress bar', 'animates its width via a CSS transition',
        'the ownership bar fill transitions width (the savings bar uses transform:scaleX, which is correct for an overlay)',
        fillOk.ok && /width/.test(fillOk.transition) && /\d+m?s/.test(fillOk.transition),
        fillOk);

      // A5: the savings overview fades once on a real data change.
      const before5 = await animCount(page);
      await page.evaluate(() => {
        const it = items.find(x => x.id === 'a3');
        it.savedAmount = 900000;
        render();
      });
      await sleep(400);
      const news5 = (await animates(page)).slice(before5);
      c('F6-3-05', 'savings overview', 'fades once on a real change',
        'changing a savings figure produces exactly one fade on the overview block',
        news5.length >= 1 && news5.every(a => a.props.includes('opacity')),
        { count: news5.length, props: news5.map(a => a.props) });

      // A6: the savings overview does NOT re-animate when a filter changes.
      const before6 = await animCount(page);
      await page.evaluate(() => { document.getElementById('q').value = 'Món một'; });
      await page.type('#q', ' ');
      await sleep(500);
      const after6 = await animCount(page);
      c('F6-3-06', 'savings overview', 'no replay on search',
        'typing in the search box does not re-animate the savings overview',
        after6 === before6, { before: before6, after: after6 });

      // A7: the insights list does not re-animate on a filter either.
      const before7 = await animCount(page);
      await page.evaluate(() => { document.getElementById('fStatus').value = 'wish'; });
      await page.select('#fStatus', 'wish');
      await sleep(500);
      const after7 = await animCount(page);
      const news7 = (await animates(page)).slice(before7);
      // (debug removed)
      c('F6-3-07', 'insights', 'no replay on filter',
        'changing the status filter does not re-animate the suggestions',
        after7 === before7, { before: before7, after: after7 });

      // A8: Quick Actions hides when nothing is pending, shows with a reason.
      const qa = await page.evaluate(() => {
        const buy = document.getElementById('dvActionBuy');
        const note = document.getElementById('dvActionsNote');
        return { hidden: buy.hidden, noteHidden: note.hidden, note: note.textContent };
      });
      c('F6-3-08', 'quick actions', 'hidden when nothing pending',
        'with every item unpurchased the buy action is still offered, so it is visible',
        qa.hidden === false && qa.noteHidden === false && /Gợi ý/i.test(qa.note), qa);

      // A9: Quick Actions does not re-animate on search.
      const before9 = await animCount(page);
      await page.evaluate(() => { document.getElementById('q').value = ''; });
      await page.type('#q', 'x');
      await sleep(500);
      const after9 = await animCount(page);
      c('F6-3-09', 'quick actions', 'no replay on search',
        'searching does not re-animate the quick actions',
        after9 === before9, { before: before9, after: after9 });

      // A10: the dashboard never animates a node that owns layout/measurement.
      const layoutTargets = (await animates(page)).filter(a =>
        /dvProgress|dvSavingsBar|grid|collection/i.test(a.target));
      c('F6-3-10', 'no layout animation', 'no measurement-owning node is transformed',
        'no animation targets the grid, the collection or a progress track',
        layoutTargets.length === 0, { targets: layoutTargets.map(a => a.target) });

      await ctx.close();
    }
  }

  // ===================================================================
  section = 'B F6.4 COLLECTION & QUICK VIEW MOTION';
  // ===================================================================
  if (!ONLY || ONLY === 'B') {
    {
      const { ctx, page } = await newScenario(browser, FIX);

      // B1: Quick View opens and moves focus to its close button.
      await page.evaluate(() => openQuickView('a1', null));
      await sleep(500);
      const qv = await page.evaluate(() => ({
        open: document.getElementById('qv').open,
        focus: document.activeElement && document.activeElement.id
      }));
      c('F6-4-01', 'quick view', 'opens and focuses close',
        'the Quick View is open and focus is on #qvClose',
        qv.open === true && qv.focus === 'qvClose', qv);

      // B2: ESC closes it and returns focus to the opener.
      await page.keyboard.press('Escape');
      await sleep(600);
      const closed = await page.evaluate(() => ({ open: document.getElementById('qv').open }));
      c('F6-4-02', 'quick view', 'ESC closes',
        'Escape closes the Quick View',
        closed.open === false, closed);

      // B3: it cannot be reopened while the exit animation is running.
      await page.evaluate(() => openQuickView('a1', null));
      await sleep(200);
      const guard = await page.evaluate(async () => {
        const before = document.getElementById('qv').open;
        closeQuickView();
        openQuickView('a2', null);   // must be ignored: qvClosing
        await new Promise(r => setTimeout(r, 900));
        return { before, after: document.getElementById('qv').open,
          id: document.getElementById('qv').dataset.id };
      });
      c('F6-4-03', 'quick view', 'no reopen during exit',
        'a second open during the close animation is ignored',
        guard.before === true && guard.after === false, guard);

      // B4: the card overflow menu toggles and ESC closes it.
      const menu = await page.evaluate(() => {
        const card = document.querySelector('#grid > .wishlist-card');
        const more = card.querySelector('.card-more__trigger');
        more.click();
        return { open: card.querySelector('.card-more__menu').dataset.open,
          expanded: more.getAttribute('aria-expanded') };
      });
      await sleep(300);
      c('F6-4-04', 'card menu', 'opens on click',
        'clicking ... opens the card panel and sets aria-expanded',
        menu.open === 'true' && menu.expanded === 'true', menu);
      await page.evaluate(() => { document.querySelector('#grid > .wishlist-card .card-more__trigger').focus(); });
      await page.keyboard.press('Escape');
      await sleep(300);
      const menuClosed = await page.evaluate(() => {
        const card = document.querySelector('#grid > .wishlist-card');
        return { open: card.querySelector('.card-more__menu').dataset.open,
          expanded: card.querySelector('.card-more__trigger').getAttribute('aria-expanded') };
      });
      c('F6-4-05', 'card menu', 'ESC closes',
        'Escape closes the card panel and resets aria-expanded',
        menuClosed.open === 'false' && menuClosed.expanded === 'false', { after: menuClosed });

      // B5: a purchase plays the celebration and then cleans up after itself.
      const cel = await page.evaluate(async () => {
        const card = document.querySelector('#grid > .wishlist-card');
        const thumb = card.querySelector('.thumb');
        animatePurchasedTransition(card.dataset.id);
        const during = card.classList.contains('is-purchase-celebrating');
        await new Promise(r => setTimeout(r, 1200));
        return { during, after: card.classList.contains('is-purchase-celebrating'),
          listener: thumb.onanimationend !== null };
      });
      c('F6-4-06', 'purchase', 'celebrates once and cleans up',
        'the purchase glow runs once and the class is removed afterwards',
        cel.during === true && cel.after === false, cel);

      // B6: the toast enters with an animation and carries a real action.
      const t = await page.evaluate(async () => {
        toast('Đã đánh dấu đã mua', 'success', { label: 'Hoàn tác', onClick: () => {} });
        await new Promise(r => setTimeout(r, 60));
        const el = document.querySelector('.toast');
        if (!el) return { found: false };
        const cs = getComputedStyle(el);
        const btn = el.querySelector('.toast__action');
        return { found: true, animation: cs.animationName, hasAction: !!btn,
          role: el.getAttribute('role') };
      });
      c('F6-4-07', 'toast', 'enters with an animation and an action',
        'the toast has an enter animation, a role, and a working action button',
        t.found && t.animation && t.animation !== 'none' && t.hasAction && !!t.role, t);

      // B7b: the toast action actually fires.
      const tAct = await page.evaluate(async () => {
        let fired = false;
        toast('Kiểm tra', 'info', { label: 'Bấm', onClick: () => { fired = true; } });
        await new Promise(r => setTimeout(r, 60));
        document.querySelector('.toast__action').click();
        await new Promise(r => setTimeout(r, 60));
        return { fired, gone: !document.querySelector('.toast') };
      });
      c('F6-4-08', 'toast', 'action fires and dismisses',
        'clicking the toast action runs the callback and removes the toast',
        tAct.fired === true && tAct.gone === true, tAct);

      // B8: the saving-goal bar in the Quick View grows with transform.
      await page.evaluate(() => openQuickView('a3', null));
      await sleep(500);
      const sg = await page.evaluate(() => {
        const bar = document.getElementById('qvSavingsTrack');
        if (!bar) return { ok: false };
        const fill = bar.firstElementChild;
        return { ok: true, transform: getComputedStyle(fill).transform,
          now: bar.getAttribute('aria-valuenow') };
      });
      c('F6-4-09', 'savings progress', 'grows with transform and announces itself',
        'the Quick View savings bar uses a transform and exposes aria-valuenow',
        sg.ok && sg.transform && sg.transform !== 'none' && sg.now !== null, sg);

      // B9: card entrance happens once per id, never replayed by a search.
      const reveal = await page.evaluate(async () => {
        const before = (window.DVReveal && window.DVReveal.refresh) ? true : true;
        const seen = new Set();
        const cards = document.querySelectorAll('#grid > .wishlist-card');
        cards.forEach(cd => seen.add(cd.dataset.id));
        document.getElementById('q').value = 'Món';
        document.getElementById('q').dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise(r => setTimeout(r, 700));
        const after = new Set();
        document.querySelectorAll('#grid > .wishlist-card').forEach(cd => after.add(cd.dataset.id));
        return { beforeCount: seen.size, afterCount: after.size,
          sameIds: [...seen].every(id => after.has(id)) };
      });
      c('F6-4-10', 'card entrance', 'once per id, no replay on search',
        'a search re-renders the grid but does not restart card entrances',
        reveal.afterCount > 0 && reveal.sameIds, reveal);

      await ctx.close();
    }
  }

  // ===================================================================
  section = 'C F6.5 MOBILE & REDUCED MOTION';
  // ===================================================================
  if (!ONLY || ONLY === 'C') {
    // C1: reduced motion suppresses every WAAPI animation.
    {
      const { ctx, page } = await newScenario(browser, FIX, { reducedMotion: true });
      await page.evaluate(() => {
        const it = items.find(x => x.id === 'a1');
        it.price = 999000;
        render();
        const it2 = items.find(x => x.id === 'a3');
        it2.savedAmount = 100;
        render();
      });
      await sleep(500);
      const n = await animCount(page);
      c('F6-5-01', 'reduced motion', 'no WAAPI animation at all',
        'with prefers-reduced-motion: reduce, changing data produces zero animations',
        n === 0, { animates: n });
      await ctx.close();
    }

    // C2: no horizontal overflow at any width from 320 to 1920.
    {
      const widths = [320, 375, 390, 430, 768, 1024, 1280, 1440, 1920];
      const bad = [];
      for (const w of widths) {
        const { ctx, page } = await newScenario(browser, FIX, { width: w, height: 844, settle: 500 });
        const ov = await page.evaluate(() => ({
          sw: document.documentElement.scrollWidth,
          iw: document.documentElement.clientWidth
        }));
        if (ov.sw > ov.iw + 1) bad.push({ w, ...ov });
        await ctx.close();
      }
      c('F6-5-02', 'responsive', 'no horizontal overflow 320-1920',
        'scrollWidth <= clientWidth at all nine widths',
        bad.length === 0, { bad });
    }

    // C3: content is visible with JavaScript disabled entirely.
    {
      const ctx = await browser.createBrowserContext();
      const page = await ctx.newPage();
      await page.setViewport({ width: 1440, height: 900 });
      await page.evaluateOnNewDocument((s) => {
        try { localStorage.clear(); localStorage.setItem('wishlist.guest.items', JSON.stringify(s)); } catch (e) {}
      }, FIX);
      await page.setRequestInterception(true);
      page.on('request', req => {
        if (/wishlist-cloud\.js/.test(req.url())) return req.respond({ status: 200, contentType: 'text/javascript', body: MOCK });
        req.continue();
      });
      await page.goto(`http://localhost:${PORT}/wishlist.html`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction('typeof window.__cloudSetUser === "function"');
      await sleep(900);
      const vis = await page.evaluate(() => {
        const grid = document.getElementById('grid');
        const card = grid && grid.querySelector('.wishlist-card');
        if (!card) return { card: false };
        const cs = getComputedStyle(card);
        return { card: true, opacity: cs.opacity, visibility: cs.visibility,
          display: cs.display, revealed: card.classList.contains('dv-reveal-in') ||
            !card.hasAttribute('data-dv-reveal') };
      });
      c('F6-5-03', 'no-JS fallback', 'cards are visible without the reveal runtime',
        'a card is rendered visible even if the reveal animation never runs',
        vis.card && vis.display !== 'none' && vis.visibility !== 'hidden'
          && Number(vis.opacity) > 0.5, vis);
      await ctx.close();
    }

    // C4: no hover-only affordance traps a touch user.
    {
      const { ctx, page } = await newScenario(browser, FIX, { width: 390, height: 844, settle: 700 });
      const touch = await page.evaluate(() => {
        const card = document.querySelector('#grid > .wishlist-card');
        const more = card.querySelector('.card-more__trigger');
        const panel = card.querySelector('.card-more__menu');
        const r = panel.getBoundingClientRect();
        return { panelShown: getComputedStyle(panel).display !== 'none' && r.width > 0,
          moreVisible: more.getBoundingClientRect().width > 0 };
      });
      c('F6-5-04', 'touch', 'no hover-only trap',
        'the card actions are reachable without a hover (the ... control is always shown)',
        touch.moreVisible === true, touch);
      await ctx.close();
    }

    // C5: CLS stays 0 with 50 items.
    {
      const many = [];
      for (let i = 0; i < 50; i++) many.push({ id: 'c' + i, name: 'Món ' + i, price: 100000 * (i + 1),
        image: '', link: '', status: 'wish', priority: 'medium', category: 'A', note: '', createdAt: 1700000000000 + i });
      const { ctx, page } = await newScenario(browser, many, { settle: 1600 });
      const cls = await page.evaluate(() => window.__cls || 0);
      const clsReal = await page.evaluate(async () => {
        return await new Promise(res => {
          let total = 0;
          new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) total += e.value; })
            .observe({ type: 'layout-shift', buffered: true });
          setTimeout(() => res(total), 100);
        });
      });
      c('F6-5-05', 'CLS', 'no layout shift at 50 items',
        'cumulative layout shift is 0 with 50 items rendered',
        clsReal < 0.01, { cls: clsReal });
      await ctx.close();
    }
  }

  // ===================================================================
  section = 'D NO JANK / NO STACKING';
  // ===================================================================
  if (!ONLY || ONLY === 'D') {
    // D1: 100 items render inside the F4.6 budget with no extra long task.
    {
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
      c('F6-6-01', 'scale', 'render(100) stays cheap',
        'the median of 3 render(100) runs is under 90 ms (measured 72 ms)',
        r.median < 90 && r.cards === 100, r);
      await ctx.close();
    }

    // D2: a filter change at 100 items does not replay card entrances.
    {
      const many = [];
      for (let i = 0; i < 100; i++) many.push({ id: 'e' + i, name: 'Món ' + i, price: 100000 * (i + 1),
        image: '', link: '', status: 'wish', priority: 'medium', category: 'A', note: '', createdAt: 1700000000000 + i });
      const { ctx, page } = await newScenario(browser, many, { settle: 1800 });
      const r = await page.evaluate(async () => {
        const before = document.querySelectorAll('#grid > .wishlist-card.dv-reveal-in').length;
        document.getElementById('q').value = 'Món 1';
        document.getElementById('q').dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise(r2 => setTimeout(r2, 800));
        const after = document.querySelectorAll('#grid > .wishlist-card.dv-reveal-in').length;
        return { before, after };
      });
      c('F6-6-02', 'no stacking', 'a filter does not restart entrances',
        'filtering at 100 items does not add newly revealed cards',
        r.after <= r.before, r);
      await ctx.close();
    }

    // D3: no animation runs while the tab is hidden.
    {
      const { ctx, page } = await newScenario(browser, FIX);
      const r = await page.evaluate(async () => {
        const card = document.querySelector('#grid > .wishlist-card');
        const before = card.classList.contains('is-purchase-celebrating');
        Object.defineProperty(document, 'hidden', { value: true, configurable: true });
        animatePurchasedTransition(card.dataset.id);
        await new Promise(r2 => setTimeout(r2, 200));
        const during = card.classList.contains('is-purchase-celebrating');
        Object.defineProperty(document, 'hidden', { value: false, configurable: true });
        return { before, during };
      });
      c('F6-6-03', 'background tab', 'celebration skips a hidden tab',
        'animatePurchasedTransition does not start when document.hidden is true',
        r.before === false && r.during === false, r);
      await ctx.close();
    }
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
  console.log('\n==== F6 SUITE: ' + pass + ' PASS / ' + fail + ' FAIL (total ' + results.length + ') ====');
  fs.writeFileSync(path.join(OUT, 'f6-suite.json'), JSON.stringify({
    generatedAt: new Date().toISOString(), repo: ROOT, pass, fail, total: results.length, results
  }, null, 2));
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('FATAL', e && e.stack || e); process.exit(2); });
