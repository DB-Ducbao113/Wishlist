// V16 M4 — sliding workspace navigation indicator.
const puppeteer = require('puppeteer-core');
const http = require('http');
const fs = require('fs');
const path = require('path');

const CHROME = process.env.CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT = process.argv[2] || path.join(__dirname, '..', '..');
const PORT = Number(process.argv[3] || 8129);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

const MOCK = `
const state = { user: null, opts: null, syncs: [], statuses: [] };
window.__cloud = state;
export async function initializeWishlistCloud(opts){
  state.opts = opts;
  window.__cloudSetUser = (u) => { state.user = u; if(opts.onUserChanged) opts.onUserChanged(u ? u.uid : null); };
  window.__cloudRemote = (items, initial) => { if(opts.onRemoteItems) opts.onRemoteItems(items, !!initial); };
  window.__cloudStatus = (kind, email) => { state.statuses.push(kind); if(opts.onStatus) opts.onStatus(kind, email || ''); };
  window.__cloudError = (m) => { if(opts.onError) opts.onError(m); };
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

const ITEM = i => ({ id: 'm4-' + i, name: 'Món ' + i, price: 1000 * i, image: '', link: '', status: 'wish', priority: 'medium', category: 'Nhóm ' + (i % 3), note: '', createdAt: 1700000000000 + i });

const results = [];
const check = (name, cond, extra) => results.push({ name, pass: !!cond, extra: extra === undefined ? '' : JSON.stringify(extra) });

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/wishlist.html';
  fs.readFile(path.join(ROOT, p), (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
});

const SEVERE = /(uncaught|is not defined|is not a function|cannot read|typeerror|referenceerror|syntaxerror|failed to load module|importing a module script failed)/i;

async function open(browser, { width = 1440, height = 900, reduced = false } = {}) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: reduced ? 'reduce' : 'no-preference' }]);
  await page.evaluateOnNewDocument(items => {
    try {
      localStorage.setItem('wishlist.guest.items', JSON.stringify(items));
      localStorage.setItem('wishlist.items', JSON.stringify(items));
    } catch (e) {}
  }, Array.from({ length: 8 }, (_, i) => ITEM(i + 1)));

  const errors = [];
  page.on('console', m => { if (m.type() === 'error' && SEVERE.test(m.text())) errors.push(m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.setRequestInterception(true);
  page.on('request', req => {
    if (/wishlist-cloud\.js/.test(req.url())) return req.respond({ status: 200, contentType: 'text/javascript', body: MOCK });
    req.continue();
  });
  await page.goto(`http://localhost:${PORT}/wishlist.html`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForFunction('typeof window.__cloudSetUser === "function"', { timeout: 15000 });
  await sleep(700);
  return { ctx, page, errors };
}

const measure = () => {
  const nav = document.querySelector('.v11-workspace-nav');
  const indicator = document.querySelector('.v11-workspace-nav__indicator');
  const links = [...nav.querySelectorAll('.v11-workspace-nav__link')];
  const active = nav.querySelector('.v11-workspace-nav__link.is-active');
  const navRect = nav.getBoundingClientRect();
  const tx = new DOMMatrixReadOnly(getComputedStyle(indicator).transform).m41;
  return {
    navDisplay: getComputedStyle(nav).display,
    navWidth: Math.round(navRect.width),
    navHeight: Math.round(navRect.height),
    navTop: Math.round(navRect.top),
    ready: nav.hasAttribute('data-v11-nav-ready'),
    indicatorAriaHidden: indicator.getAttribute('aria-hidden'),
    indicatorOpacity: Number(getComputedStyle(indicator).opacity),
    indicatorWidth: getComputedStyle(indicator).width,
    indicatorTransition: getComputedStyle(indicator).transitionDuration,
    indicatorTx: tx,
    activeHref: active ? active.getAttribute('href') : '',
    activeOffsetLeft: active ? active.offsetLeft : -1,
    activeOffsetWidth: active ? active.offsetWidth : -1,
    ariaCurrent: links.filter(l => l.getAttribute('aria-current') === 'true').map(l => l.getAttribute('href')),
    docHeight: document.documentElement.scrollHeight
  };
};

(async () => {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--hide-scrollbars'] });

  // ---- T1: indicator geometry matches the active link, no layout change ----
  {
    const { ctx, page, errors } = await open(browser);
    const first = await page.evaluate(measure);
    check('T1 nav visible on desktop', first.navDisplay === 'flex' || first.navDisplay === 'inline-flex', first.navDisplay);
    check('T1 indicator ready', first.ready === true, first.ready);
    check('T1 indicator is decorative for AT', first.indicatorAriaHidden === 'true', first.indicatorAriaHidden);
    check('T1 indicator is opaque once ready', first.indicatorOpacity === 1, first.indicatorOpacity);
    check('T1 indicator width equals active link width', Math.round(parseFloat(first.indicatorWidth)) === first.activeOffsetWidth, { pill: first.indicatorWidth, link: first.activeOffsetWidth });
    check('T1 indicator offset equals active link offset', Math.round(first.indicatorTx) === first.activeOffsetLeft, { tx: first.indicatorTx, link: first.activeOffsetLeft });
    check('T1 exactly one aria-current', first.ariaCurrent.length === 1 && first.ariaCurrent[0] === first.activeHref, first.ariaCurrent);
    check('T1 indicator motion 200-360ms', parseFloat(first.indicatorTransition) >= 0.2 && parseFloat(first.indicatorTransition) <= 0.36, first.indicatorTransition);

    // Removing the pill from the flow must mean zero layout impact: swipe the
    // properties to wild values and confirm the nav box never moves.
    const shifted = await page.evaluate(() => {
      const nav = document.querySelector('.v11-workspace-nav');
      const before = nav.getBoundingClientRect();
      nav.style.setProperty('--v11-nav-x', '400px');
      nav.style.setProperty('--v11-nav-w', '900px');
      const after = nav.getBoundingClientRect();
      return {
        sameWidth: Math.round(before.width) === Math.round(after.width),
        sameHeight: Math.round(before.height) === Math.round(after.height),
        sameLeft: Math.round(before.left) === Math.round(after.left)
      };
    });
    check('T1 indicator never changes nav layout', shifted.sameWidth && shifted.sameHeight && shifted.sameLeft, shifted);
    check('T1 no severe console errors', errors.length === 0, errors.slice(0, 3));
    await ctx.close();
  }

  // ---- T2: the pill actually travels when the active section changes ----
  {
    const { ctx, page, errors } = await open(browser);
    const start = await page.evaluate(measure);
    await page.evaluate(() => window.scrollTo(0, document.getElementById('collection').offsetTop + 200));
    await sleep(700);
    const end = await page.evaluate(measure);
    check('T2 scrolling moves the active item', start.activeHref !== end.activeHref, { from: start.activeHref, to: end.activeHref });
    check('T2 pill travels to the new active item', Math.round(end.indicatorTx) === end.activeOffsetLeft, { tx: end.indicatorTx, link: end.activeOffsetLeft });
    check('T2 pill still matches width', Math.round(parseFloat(end.indicatorWidth)) === end.activeOffsetWidth, { pill: end.indicatorWidth, link: end.activeOffsetWidth });
    check('T2 aria-current follows the active item', end.ariaCurrent.length === 1 && end.ariaCurrent[0] === end.activeHref, end.ariaCurrent);
    check('T2 scrolling causes no layout growth', start.docHeight === end.docHeight, { start: start.docHeight, end: end.docHeight });
    check('T2 nav box unchanged after travel', start.navWidth === end.navWidth && start.navHeight === end.navHeight, { start: start.navWidth, end: end.navWidth });
    check('T2 no severe console errors', errors.length === 0, errors.slice(0, 3));
    await ctx.close();
  }

  // ---- T3: resize re-measures ----
  {
    const { ctx, page, errors } = await open(browser);
    await page.setViewport({ width: 1100, height: 900, deviceScaleFactor: 1 });
    await sleep(600);
    const m = await page.evaluate(measure);
    check('T3 still ready after resize', m.ready === true, m.ready);
    check('T3 geometry re-measured after resize', Math.round(m.indicatorTx) === m.activeOffsetLeft && Math.round(parseFloat(m.indicatorWidth)) === m.activeOffsetWidth, { tx: m.indicatorTx, left: m.activeOffsetLeft, w: m.indicatorWidth, lw: m.activeOffsetWidth });
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    await sleep(600);
    const back = await page.evaluate(measure);
    check('T3 geometry still correct after growing back', Math.round(back.indicatorTx) === back.activeOffsetLeft, { tx: back.indicatorTx, left: back.activeOffsetLeft });
    check('T3 no severe console errors', errors.length === 0, errors.slice(0, 3));
    await ctx.close();
  }

  // ---- T4: reduced motion teleports, never animates ----
  {
    const { ctx, page, errors } = await open(browser, { reduced: true });
    const m = await page.evaluate(measure);
    check('T4 reduced motion: no transition on the pill', m.indicatorTransition.split(',').every(v => parseFloat(v) === 0), m.indicatorTransition);
    check('T4 reduced motion: pill still lands correctly', Math.round(m.indicatorTx) === m.activeOffsetLeft && m.indicatorOpacity === 1, { tx: m.indicatorTx, left: m.activeOffsetLeft, opacity: m.indicatorOpacity });
    await page.evaluate(() => window.scrollTo(0, document.getElementById('collection').offsetTop + 200));
    await sleep(500);
    const after = await page.evaluate(measure);
    check('T4 reduced motion: travels instantly to the new item', Math.round(after.indicatorTx) === after.activeOffsetLeft, { tx: after.indicatorTx, left: after.activeOffsetLeft });
    check('T4 no severe console errors', errors.length === 0, errors.slice(0, 3));
    await ctx.close();
  }

  // ---- T5: mobile hides the whole nav (no stray pill) ----
  {
    const { ctx, page, errors } = await open(browser, { width: 390, height: 844 });
    const m = await page.evaluate(measure);
    check('T5 nav hidden on mobile', m.navDisplay === 'none', m.navDisplay);
    check('T5 pill hidden on mobile', m.indicatorOpacity === 0, m.indicatorOpacity);
    check('T5 no severe console errors', errors.length === 0, errors.slice(0, 3));
    await ctx.close();
  }

  await browser.close();
  server.close();

  const pass = results.filter(r => r.pass).length;
  results.forEach(r => console.log((r.pass ? 'PASS ' : 'FAIL ') + r.name + (r.extra ? '  :: ' + r.extra : '')));
  console.log(`\nM4 RESULT: ${pass} PASS / ${results.length - pass} FAIL  (total ${results.length})`);
  process.exit(results.some(r => !r.pass) ? 1 : 0);
})().catch(e => { console.error(e); try { server.close(); } catch (_) {} process.exit(2); });
