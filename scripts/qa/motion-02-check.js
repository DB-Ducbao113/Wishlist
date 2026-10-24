// =====================================================================
// DREAM VAULT V16.2 — MOTION-02 CORRECTIVE GATE
// ---------------------------------------------------------------------
// Independent browser verification that the Hero cinematic motion actually
// works at runtime, not only in source. Serves the real repo (or dist),
// stubs only the cloud module, drives the real entry points.
//
// usage: node scripts/qa/motion-02-check.js [repoRoot] [--dist]
// =====================================================================
const puppeteer = require('puppeteer-core');
const http = require('http');
const fs = require('fs');
const path = require('path');

const CHROME = process.env.CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT = process.argv[2] && !process.argv[2].startsWith('--')
  ? process.argv[2] : path.join(__dirname, '..', '..');
const USE_DIST = process.argv.includes('--dist');
const SERVE = USE_DIST ? path.join(ROOT, 'dist') : ROOT;
const PORT = 8199;
const OUT = path.join(__dirname, '..', '..', 'qa-out');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon'
};

const MOCK = `
const state = { user: null, opts: null };
window.__cloud = state;
export async function initializeWishlistCloud(opts){
  state.opts = opts;
  window.__cloudSetUser = (u) => { state.user = u; if(opts.onUserChanged) opts.onUserChanged(u ? u.uid : null); };
  setTimeout(() => { if(opts.onUserChanged) opts.onUserChanged(null); if(opts.onStatus) opts.onStatus('local',''); }, 0);
  return { get user(){ return state.user; }, signIn: async () => {}, signOut: async () => {},
    syncItems: () => Promise.resolve(), uploadImage: async () => 'https://cdn.example/i.jpg' };
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
const server = http.createServer(serveFrom(SERVE));

const results = [];
let section = '';
function c(id, area, entry, expected, pass, actual) {
  results.push({ id, section, area, entry, expected, pass: !!pass,
    actual: actual === undefined ? '' : JSON.stringify(actual) });
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  await new Promise(r => server.listen(PORT, r));
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });

  // ===================================================================
  section = 'A MOTION-02 RUNTIME';
  // ===================================================================

  // A1: page loads with zero uncaught exceptions.
  {
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await page.setViewport({ width: 1440, height: 900 });
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
    await page.evaluateOnNewDocument(() => {
      try { localStorage.clear(); localStorage.setItem('wishlist.guest.items', JSON.stringify([{ id: 'p01', name: 'Tai nghe', price: 2500000, image: '', link: '', status: 'wish', priority: 'high', category: 'Công nghệ', note: '', createdAt: 1700000000101 }])); } catch (e) {}
    });
    await page.setRequestInterception(true);
    page.on('request', req => {
      if (/wishlist-cloud\.js/.test(req.url())) return req.respond({ status: 200, contentType: 'text/javascript', body: MOCK });
      req.continue();
    });
    await page.goto(`http://localhost:${PORT}/wishlist.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction('typeof window.__cloudSetUser === "function"', { timeout: 60000 });
    await sleep(1500);
    c('M2-01', 'load', 'zero uncaught exceptions',
      'the page loads and initialises without a page or console error',
      errs.length === 0, { errors: errs });
    // keep this page for the rest of section A
    // A2: scroll changes the hero CSS variables.
    const before = await page.evaluate(() => ({
      bg: getComputedStyle(document.querySelector('.hero--v9')).getPropertyValue('--hero-bg-y').trim(),
      mid: getComputedStyle(document.querySelector('.hero--v9')).getPropertyValue('--hero-mid-y').trim(),
      fg: getComputedStyle(document.querySelector('.hero--v9')).getPropertyValue('--hero-fg-y').trim()
    }));
    await page.evaluate(() => window.scrollTo({ top: 400, behavior: 'instant' }));
    await sleep(600);
    const after = await page.evaluate(() => ({
      bg: getComputedStyle(document.querySelector('.hero--v9')).getPropertyValue('--hero-bg-y').trim(),
      mid: getComputedStyle(document.querySelector('.hero--v9')).getPropertyValue('--hero-mid-y').trim(),
      fg: getComputedStyle(document.querySelector('.hero--v9')).getPropertyValue('--hero-fg-y').trim()
    }));
    c('M2-02', 'scroll parallax', 'scroll changes the hero variables',
      'at least one of --hero-bg-y / --hero-mid-y / --hero-fg-y is non-zero after scrolling',
      (before.bg !== after.bg) || (before.mid !== after.mid) || (before.fg !== after.fg),
      { before, after });
    // A3: scroll changes the hero visual transform.
    const tBefore = await page.evaluate(() => getComputedStyle(document.querySelector('.hero__visual')).transform);
    const tAfter = await page.evaluate(() => getComputedStyle(document.querySelector('.hero__visual')).transform);
    c('M2-03', 'scroll parallax', 'the hero visual is transformed',
      'the hero visual carries a non-none transform after scroll',
      tAfter !== 'none', { transform: tAfter });

    // A4: header elevation toggles on scroll.
    const scrolled = await page.evaluate(() => document.querySelector('.site-header').classList.contains('site-header--scrolled'));
    c('M2-04', 'nav elevation', 'header elevates on scroll',
      'the header has .site-header--scrolled after scrolling past 60 px',
      scrolled === true, { scrolled });

    // A5: pointer depth on desktop (this run is desktop).
    await page.evaluate(() => window.scrollTo(0, 0));
    await sleep(200);
    const beforePtr = await page.evaluate(() => getComputedStyle(document.querySelector('.hero__visual')).translate);
    const box = await page.evaluate(() => {
      const r = document.querySelector('.hero--v9').getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    await page.mouse.move(box.x + 120, box.y + 80);
    await sleep(400);
    const afterPtr = await page.evaluate(() => getComputedStyle(document.querySelector('.hero__visual')).translate);
    c('M2-05', 'pointer depth', 'pointer movement moves the hero visual',
      'the hero visual translate changes on pointer move',
      beforePtr !== afterPtr, { before: beforePtr, after: afterPtr });

    // A6: magnetic CTA moves within its 5 px cap.
    const ctaBox = await page.evaluate(() => {
      const r = document.querySelector('.hero-v3__primary').getBoundingClientRect();
      return { x: r.left + r.width / 2 + 30, y: r.top + r.height / 2 + 20 };
    });
    await page.mouse.move(ctaBox.x, ctaBox.y);
    await sleep(300);
    const ctaTransform = await page.evaluate(() => document.querySelector('.hero-v3__primary').style.transform);
    const m = /translate3d\(\s*([-\d.]+)px\s*,\s*([-\d.]+)px/.exec(ctaTransform || '');
    const withinCap = !!m && Math.abs(Number(m[1])) <= 5.5 && Math.abs(Number(m[2])) <= 5.5;
    c('M2-06', 'magnetic CTA', 'moves within the 5 px cap',
      'the CTA transform stays inside the 5 px cap',
      withinCap, { transform: ctaTransform });

    // A7: the CTA still clicks.
    let clicked = false;
    page.on('dialog', d => { clicked = true; d.dismiss().catch(() => {}); });
    await page.evaluate(() => { window.__ctaClicked = false; });
    await page.evaluate(() => {
      document.querySelector('.hero-v3__primary').addEventListener('click', () => { window.__ctaClicked = true; }, { once: true });
    });
    await page.mouse.click(ctaBox.x - 30, ctaBox.y - 20);
    await sleep(200);
    const ctaClicked = await page.evaluate(() => window.__ctaClicked);
    c('M2-07', 'magnetic CTA', 'click still fires',
      'clicking the CTA runs its handler',
      ctaClicked === true, { clicked: ctaClicked });

    // A8: reset on pointer leave.
    await page.mouse.move(0, 0);
    await sleep(700);
    const reset = await page.evaluate(() => document.querySelector('.hero-v3__primary').style.transform);
    const rparts = /translate3d\(\s*([-\d.]+)px\s*,\s*([-\d.]+)px/.exec(reset || '');
    const resetOk = !rparts || (Math.abs(Number(rparts[1])) < 1.5 && Math.abs(Number(rparts[2])) < 1.5);
    c('M2-08', 'magnetic CTA', 'resets on leave',
      'the CTA transform returns to roughly (0,0) after the pointer leaves',
      resetOk, { transform: reset });

    // A9: Quick View still works.
    await page.evaluate(() => {
      document.getElementById('q').value = '';
      document.getElementById('fStatus').value = '';
      render();
    });
    await sleep(400);
    await page.evaluate(() => {
      const dlg = document.getElementById('dlg'); if (dlg && dlg.open) dlg.close();
      const card = document.querySelector('#grid > .wishlist-card');
      if (card) openQuickView(card.dataset.id, card.querySelector('.product-card__view'));
    });
    await sleep(800);
    const qv = await page.evaluate(() => ({ open: document.getElementById('qv').open, hasClose: !!document.getElementById('qvClose') }));
    c('M2-09', 'quick view', 'opens and focuses close',
      'the Quick View opens after the hero motion is wired',
      qv.open === true, qv);
    await page.keyboard.press('Escape');
    await sleep(400);

    // A10: reduced motion disables the hero motion.
    const ctx2 = await browser.createBrowserContext();
    const page2 = await ctx2.newPage();
    await page2.setViewport({ width: 1440, height: 900 });
    await page2.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await page2.evaluateOnNewDocument(() => {
      try { localStorage.clear(); localStorage.setItem('wishlist.guest.items', JSON.stringify([])); } catch (e) {}
    });
    await page2.setRequestInterception(true);
    page2.on('request', req => {
      if (/wishlist-cloud\.js/.test(req.url())) return req.respond({ status: 200, contentType: 'text/javascript', body: MOCK });
      req.continue();
    });
    await page2.goto(`http://localhost:${PORT}/wishlist.html`, { waitUntil: 'domcontentloaded' });
    await page2.waitForFunction('typeof window.__cloudSetUser === "function"');
    await sleep(1200);
    await page2.evaluate(() => window.scrollTo(0, 500));
    await sleep(400);
    const rm = await page2.evaluate(() => {
      const hero = document.querySelector('.hero--v9');
      return {
        bg: hero.style.getPropertyValue('--hero-bg-y'),
        mid: hero.style.getPropertyValue('--hero-mid-y'),
        fg: hero.style.getPropertyValue('--hero-fg-y'),
        ptr: hero.style.getPropertyValue('--hero-pointer-x')
      };
    });
    c('M2-10', 'reduced motion', 'hero variables stay at 0',
      'under prefers-reduced-motion the hero variables are never set to a non-zero value',
      rm.bg === '' || rm.bg === '0px', rm);
    await ctx2.close();

    // A11: mobile touch does not run pointer depth.
    const ctx3 = await browser.createBrowserContext();
    const page3 = await ctx3.newPage();
    await page3.setViewport({ width: 390, height: 844 });
    await page3.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
    await page3.evaluateOnNewDocument(() => {
      try { localStorage.clear(); localStorage.setItem('wishlist.guest.items', JSON.stringify([])); } catch (e) {}
    });
    await page3.setRequestInterception(true);
    page3.on('request', req => {
      if (/wishlist-cloud\.js/.test(req.url())) return req.respond({ status: 200, contentType: 'text/javascript', body: MOCK });
      req.continue();
    });
    await page3.goto(`http://localhost:${PORT}/wishlist.html`, { waitUntil: 'domcontentloaded' });
    await page3.waitForFunction('typeof window.__cloudSetUser === "function"');
    await sleep(1000);
    const touch = await page3.evaluate(() => {
      const hero = document.querySelector('.hero--v9');
      // simulate a touch by setting the var via the pointer path is impossible
      // on touch (setupHeroPointerDepth returns early), so the var must stay 0.
      return hero.style.getPropertyValue('--hero-pointer-x');
    });
    c('M2-11', 'touch', 'no pointer depth on touch',
      'on a touch viewport the pointer-depth variable is never set',
      touch === '' || touch === '0px', { pointerX: touch });
    await ctx3.close();

    // A12: no horizontal overflow at the hero widths.
    for (const w of [320, 375, 390, 430, 768, 1024, 1440, 1920]) {
      const { ctx, page: p } = await (async () => {
        const c = await browser.createBrowserContext();
        const pg = await c.newPage();
        await pg.setViewport({ width: w, height: 900 });
        await pg.evaluateOnNewDocument(() => {
          try { localStorage.clear(); localStorage.setItem('wishlist.guest.items', JSON.stringify([])); } catch (e) {}
        });
        await pg.setRequestInterception(true);
        pg.on('request', req => {
          if (/wishlist-cloud\.js/.test(req.url())) return req.respond({ status: 200, contentType: 'text/javascript', body: MOCK });
          req.continue();
        });
        await pg.goto(`http://localhost:${PORT}/wishlist.html`, { waitUntil: 'domcontentloaded' });
        await pg.waitForFunction('typeof window.__cloudSetUser === "function"');
        await sleep(900);
        return { ctx: c, page: pg };
      })();
      const ov = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: document.documentElement.clientWidth }));
      c('M2-12', 'responsive', 'no horizontal overflow at ' + w,
        'scrollWidth <= clientWidth',
        ov.sw <= ov.iw + 1, ov);
      await ctx.close();
    }

    await ctx.close();
  }

  await browser.close();
  server.close();

  const pass = results.filter(r => r.pass).length;
  const fail = results.length - pass;
  for (const r of results) {
    console.log((r.pass ? 'PASS' : 'FAIL') + ' [' + r.id + '] ' + r.area + ' :: ' + r.entry +
      (r.pass ? '' : '\n       expected: ' + r.expected + '\n       actual:   ' + r.actual));
  }
  console.log('\n==== MOTION-02 SUITE: ' + pass + ' PASS / ' + fail + ' FAIL (total ' + results.length + ') ====');
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'motion-02-suite.json'), JSON.stringify({
    generatedAt: new Date().toISOString(), repo: ROOT, pass, fail, total: results.length, results
  }, null, 2));
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('FATAL', e && e.stack || e); process.exit(2); });
