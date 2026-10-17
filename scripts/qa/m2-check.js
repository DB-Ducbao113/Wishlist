// V16 M2 — premium scroll motion: reveal correctness, stagger band, no replay,
// reduced-motion and no-IntersectionObserver fallbacks.
const puppeteer = require('puppeteer-core');
const http = require('http');
const fs = require('fs');
const path = require('path');

const CHROME = process.env.CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT = process.argv[2] || path.join(__dirname, '..', '..');
const PORT = Number(process.argv[3] || 8125);
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

const ITEM = i => ({ id: 'm2-' + i, name: 'Món ' + i, price: 1000 * i, image: '', link: '', status: 'wish', priority: 'medium', category: 'Nhóm ' + (i % 3), note: '', createdAt: 1700000000000 + i });

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

async function open(browser, { count = 12, reduced = false, noIO = false, width = 1280, height = 800 } = {}) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  if (reduced) await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  else await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
  await page.evaluateOnNewDocument((items, dropIO) => {
    try {
      localStorage.setItem('wishlist.guest.items', JSON.stringify(items));
      localStorage.setItem('wishlist.items', JSON.stringify(items));
      if (dropIO) { delete window.IntersectionObserver; }
    } catch (e) {}
  }, Array.from({ length: count }, (_, i) => ITEM(i + 1)), noIO);

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
  await sleep(200);
  return { ctx, page, errors };
}

async function scrollThrough(page) {
  await page.evaluate(async () => {
    const step = Math.max(200, window.innerHeight * 0.5);
    for (let y = 0; y <= document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise(r => setTimeout(r, 70));
    }
    window.scrollTo(0, 0);
    await new Promise(r => setTimeout(r, 300));
  });
  await sleep(900);
}

(async () => {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--hide-scrollbars'] });

  // ---- T1: reveal works, everything ends visible ----
  {
    const { ctx, page, errors } = await open(browser);
    const before = await page.evaluate(() => ({
      dvMotion: document.documentElement.classList.contains('dv-motion'),
      sections: document.querySelectorAll('[data-dv-section]').length,
      pending: document.querySelectorAll('[data-dv-reveal]:not(.dv-reveal-in)').length,
      cards: document.querySelectorAll('#grid .wishlist-card').length
    }));
    check('T1 dv-motion enabled when IO supported', before.dvMotion === true, before);
    check('T1 four reveal sections registered', before.sections === 4, before.sections);
    check('T1 cards pending reveal at load', before.pending > 0, before.pending);
    check('T1 twelve cards rendered', before.cards === 12, before.cards);

    await scrollThrough(page);
    const after = await page.evaluate(() => ({
      pending: document.querySelectorAll('[data-dv-reveal]:not(.dv-reveal-in)').length,
      invisible: [...document.querySelectorAll('#grid .wishlist-card')].filter(c => Number(getComputedStyle(c).opacity) < 0.99).length,
      sectionInvisible: [...document.querySelectorAll('[data-dv-section]')].filter(c => Number(getComputedStyle(c).opacity) < 0.99).length,
      leftoverAttrs: document.querySelectorAll('[data-dv-reveal]').length
    }));
    check('T1 all reveals resolved after scroll', after.pending === 0, after.pending);
    check('T1 no invisible cards', after.invisible === 0, after.invisible);
    check('T1 no invisible sections', after.sectionInvisible === 0, after.sectionInvisible);
    check('T1 reveal attributes cleaned up', after.leftoverAttrs === 0, after.leftoverAttrs);
    check('T1 no severe console errors', errors.length === 0, errors.slice(0, 3));
    await ctx.close();
  }

  // ---- T2: stagger band + travel distance (deterministic probes) ----
  {
    const { ctx, page } = await open(browser);
    const m = await page.evaluate(() => {
      const ty = v => (v === 'none' ? 0 : new DOMMatrixReadOnly(v).m42);

      const grid = document.getElementById('grid');
      const probeCard = document.createElement('article');
      probeCard.className = 'card wishlist-card';
      probeCard.dataset.id = '__probe_card__';
      grid.appendChild(probeCard);
      window.DVReveal.observe(probeCard, 3);
      const csCard = getComputedStyle(probeCard);
      const card = {
        delay: parseFloat(probeCard.style.getPropertyValue('--dv-reveal-delay')) || 0,
        shift: parseFloat(csCard.getPropertyValue('--dv-reveal-shift')) || 0,
        duration: parseFloat(csCard.getPropertyValue('--dv-reveal-duration')) || 0,
        opacity: parseFloat(csCard.opacity),
        translateY: ty(csCard.transform)
      };
      probeCard.remove();

      const probeSection = document.createElement('div');
      probeSection.setAttribute('data-dv-section', '');
      document.getElementById('main-content').appendChild(probeSection);
      window.DVReveal.observe(probeSection, 2);
      const csSec = getComputedStyle(probeSection);
      const section = {
        delay: parseFloat(probeSection.style.getPropertyValue('--dv-reveal-delay')) || 0,
        opacity: parseFloat(csSec.opacity),
        translateY: ty(csSec.transform)
      };
      probeSection.remove();

      return { card, section };
    });
    const c = m.card, s = m.section;
    check('T2 stagger step in 50-70ms band', c.delay / 3 >= 50 && c.delay / 3 <= 70, c.delay + 'ms at index 3');
    check('T2 card travel in 16-24px band', c.shift >= 16 && c.shift <= 24, c.shift);
    check('T2 section travel in 16-24px band', s.translateY >= 16 && s.translateY <= 24, s.translateY);
    check('T2 card transition duration 250-700ms', c.duration >= 250 && c.duration <= 700, c.duration);
    check('T2 pending card starts hidden + offset', c.opacity < 0.01 && c.translateY >= 16, { opacity: c.opacity, ty: c.translateY });
    check('T2 pending section starts hidden + offset', s.opacity < 0.01 && s.translateY >= 16, { opacity: s.opacity, ty: s.translateY });
    await ctx.close();
  }

  // ---- T3: search/filter must not replay the reveal ----
  {
    const { ctx, page, errors } = await open(browser);
    await scrollThrough(page);
    await page.evaluate(() => {
      const q = document.getElementById('q');
      q.value = 'Món 1';
      q.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await sleep(600);
    const s = await page.evaluate(() => ({
      cards: document.querySelectorAll('#grid .wishlist-card').length,
      pending: document.querySelectorAll('#grid .wishlist-card[data-dv-reveal]').length,
      invisible: [...document.querySelectorAll('#grid .wishlist-card')].filter(c => Number(getComputedStyle(c).opacity) < 0.99).length
    }));
    check('T3 filter still renders cards', s.cards > 0, s.cards);
    check('T3 no replay: no re-registered cards', s.pending === 0, s.pending);
    check('T3 no replay: all visible immediately', s.invisible === 0, s.invisible);
    check('T3 no severe console errors', errors.length === 0, errors.slice(0, 3));
    await ctx.close();
  }

  // ---- T4: reduced motion never hides anything ----
  {
    const { ctx, page, errors } = await open(browser, { reduced: true });
    const first = await page.evaluate(() => ({
      dvMotion: document.documentElement.classList.contains('dv-motion'),
      sections: [...document.querySelectorAll('[data-dv-section]')].filter(e => Number(getComputedStyle(e).opacity) < 0.99).length,
      cards: [...document.querySelectorAll('#grid .wishlist-card')].filter(e => Number(getComputedStyle(e).opacity) < 0.99).length,
      totalCards: document.querySelectorAll('#grid .wishlist-card').length
    }));
    check('T4 reduced motion: dv-motion not added', first.dvMotion === false, first.dvMotion);
    check('T4 reduced motion: sections visible', first.sections === 0, first.sections);
    check('T4 reduced motion: cards visible', first.cards === 0 && first.totalCards === 12, first);
    check('T4 reduced motion: no severe console errors', errors.length === 0, errors.slice(0, 3));
    await ctx.close();
  }

  // ---- T5: no IntersectionObserver => no blank content ----
  {
    const { ctx, page, errors } = await open(browser, { noIO: true });
    const s = await page.evaluate(() => ({
      hasIO: 'IntersectionObserver' in window,
      dvMotion: document.documentElement.classList.contains('dv-motion'),
      hidden: [...document.querySelectorAll('[data-dv-section]')].filter(e => Number(getComputedStyle(e).opacity) < 0.99).map(e => e.className + '@' + getComputedStyle(e).opacity),
      hiddenCards: [...document.querySelectorAll('#grid .wishlist-card')].filter(e => Number(getComputedStyle(e).opacity) < 0.99).length,
      cards: document.querySelectorAll('#grid .wishlist-card').length
    }));
    check('T5 IntersectionObserver really removed', s.hasIO === false);
    check('T5 no dv-motion without IO', s.dvMotion === false);
    check('T5 all content visible without IO', s.hidden.length === 0 && s.hiddenCards === 0 && s.cards === 12, s);
    check('T5 no severe console errors', errors.length === 0, errors.slice(0, 3));
    await ctx.close();
  }

  // ---- T6: cleanup on pagehide reveals everything ----
  {
    const { ctx, page, errors } = await open(browser);
    await page.evaluate(() => window.DVReveal.off());
    const s = await page.evaluate(() => ({
      dvMotion: document.documentElement.classList.contains('dv-motion'),
      leftoverMarkers: document.querySelectorAll('[data-dv-reveal], [data-dv-section]').length,
      invisible: [...document.querySelectorAll('#grid .wishlist-card, [data-dv-section]')].filter(e => Number(getComputedStyle(e).opacity) < 0.99).length
    }));
    check('T6 teardown removes dv-motion (nothing can stay hidden)', s.dvMotion === false, s);
    check('T6 teardown clears pending markers', s.leftoverMarkers === 0, s.leftoverMarkers);
    check('T6 teardown leaves nothing invisible', s.invisible === 0, s.invisible);
    check('T6 no severe console errors', errors.length === 0, errors.slice(0, 3));
    await ctx.close();
  }

  await browser.close();
  server.close();

  const pass = results.filter(r => r.pass).length;
  results.forEach(r => console.log((r.pass ? 'PASS ' : 'FAIL ') + r.name + (r.extra ? '  :: ' + r.extra : '')));
  console.log(`\nM2 RESULT: ${pass} PASS / ${results.length - pass} FAIL  (total ${results.length})`);
  process.exit(results.some(r => !r.pass) ? 1 : 0);
})().catch(e => { console.error(e); try { server.close(); } catch (_) {} process.exit(2); });
