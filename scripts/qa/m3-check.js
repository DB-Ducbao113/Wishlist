// V16 M3 — product image motion, pointer parallax, gallery/focus switch,
// Quick View entrance + exit.
const puppeteer = require('puppeteer-core');
const http = require('http');
const fs = require('fs');
const path = require('path');

const CHROME = process.env.CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT = process.argv[2] || path.join(__dirname, '..', '..');
const PORT = Number(process.argv[3] || 8128);
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

const ITEM = i => ({ id: 'm3-' + i, name: 'Món ' + i, price: 1000 * i, image: '', link: 'https://example.com/' + i, status: 'wish', priority: 'medium', category: 'Nhóm ' + (i % 3), note: 'ghi chú ' + i, createdAt: 1700000000000 + i });

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

async function open(browser, { isMobile = false, hasTouch = false, width = 1280, height = 900 } = {}) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width, height, isMobile, hasTouch, deviceScaleFactor: 1 });
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
  await page.evaluateOnNewDocument(items => {
    try {
      localStorage.setItem('wishlist.guest.items', JSON.stringify(items));
      localStorage.setItem('wishlist.items', JSON.stringify(items));
    } catch (e) {}
  }, Array.from({ length: 6 }, (_, i) => ITEM(i + 1)));

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
  await sleep(900);
  return { ctx, page, errors };
}

const CARD = '#grid .wishlist-card';
const IMG = '#grid .wishlist-card .product-media__image';

(async () => {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--hide-scrollbars'] });

  // ---- T1: hover scale + duration + no filter transition ----
  {
    const { ctx, page, errors } = await open(browser);
    const base = await page.evaluate(sel => {
      const img = document.querySelector(sel);
      const cs = getComputedStyle(img);
      return { transform: cs.transform, duration: cs.transitionDuration, props: cs.transitionProperty, hasParallaxAttr: document.querySelector('#grid .wishlist-card').hasAttribute('data-dv-parallax') };
    }, IMG);
    check('T1 image idle transform is identity', base.transform === 'none' || /matrix\(1,\s*0,\s*0,\s*1/.test(base.transform), base.transform);
    check('T1 image transition 250-400ms', parseFloat(base.duration) >= 0.25 && parseFloat(base.duration) <= 0.4, base.duration);
    check('T1 image transition never animates filter/blur', !/filter/.test(base.props), base.props);
    check('T1 desktop card opts into pointer parallax', base.hasParallaxAttr === true, base.hasParallaxAttr);

    const box = await page.evaluate(sel => {
      const el = document.querySelector(sel);
      el.scrollIntoView({ block: 'center', behavior: 'instant' });
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }, CARD);
    await sleep(300);
    const box2 = await page.evaluate(sel => {
      const r = document.querySelector(sel).getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }, CARD);
    await page.mouse.move(box2.x - 40, box2.y - 40);
    await page.mouse.move(box2.x, box2.y);
    await sleep(500);
    const hoverInfo = await page.evaluate(() => ({
      hovered: !!document.querySelector('#grid .wishlist-card:hover'),
      topEl: (document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2) || {}).className || ''
    }));
    const hovered = await page.evaluate(sel => {
      const img = document.querySelector(sel);
      const m = new DOMMatrixReadOnly(getComputedStyle(img).transform);
      return { scale: m.a, ty: m.f };
    }, IMG);
    check('T1 hover scale in 1.03-1.05 band', hovered.scale >= 1.03 && hovered.scale <= 1.05, { scale: hovered.scale, hoverInfo });
    check('T1 no severe console errors', errors.length === 0, errors.slice(0, 3));
    await ctx.close();
  }

  // ---- T2: pointer parallax moves only the image ----
  {
    const { ctx, page, errors } = await open(browser);
    const box = await page.evaluate(sel => {
      const el = document.querySelector(sel);
      el.scrollIntoView({ block: 'center', behavior: 'instant' });
      return null;
    }, CARD);
    await sleep(300);
    const rect = await page.evaluate(sel => {
      const r = document.querySelector(sel).getBoundingClientRect();
      return { left: r.left, top: r.top, w: r.width, h: r.height };
    }, CARD);
    // Aim at a corner so the offset is clearly non-zero.
    await page.mouse.move(rect.left + rect.w * 0.5, rect.top + rect.h * 0.5);
    await page.mouse.move(rect.left + rect.w * 0.85, rect.top + rect.h * 0.2);
    await sleep(500);
    const moved = await page.evaluate(sel => {
      const card = document.querySelector('#grid .wishlist-card');
      const img = card.querySelector('.product-media__image');
      const surface = card.querySelector('.wishlist-card__surface');
      const cs = getComputedStyle(img);
      const translate = cs.translate || cs.getPropertyValue('translate');
      return {
        px: card.style.getPropertyValue('--dv-parallax-x'),
        py: card.style.getPropertyValue('--dv-parallax-y'),
        translate,
        surfaceTransform: getComputedStyle(surface).transform,
        parallaxOnSurface: surface.hasAttribute('data-dv-parallax')
      };
    }, IMG);
    const px = parseFloat(moved.px) || 0;
    const py = parseFloat(moved.py) || 0;
    check('T2 parallax offsets published on the card', Math.abs(px) > 0.5 || Math.abs(py) > 0.5, { px: moved.px, py: moved.py });
    check('T2 parallax shifts the image, not the tilt surface', moved.parallaxOnSurface === false, moved.parallaxOnSurface);
    check('T2 surface keeps its own transform owner', typeof moved.surfaceTransform === 'string');
    check('T2 no severe console errors', errors.length === 0, errors.slice(0, 3));
    await ctx.close();
  }

  // ---- T3: mobile never fakes hover ----
  {
    const { ctx, page, errors } = await open(browser, { isMobile: true, hasTouch: true, width: 390, height: 844 });
    const m = await page.evaluate(sel => ({
      hoverNone: matchMedia('(hover: none)').matches,
      coarse: matchMedia('(pointer: coarse)').matches,
      transform: getComputedStyle(document.querySelector(sel)).transform,
      parallaxAttr: document.querySelector('#grid .wishlist-card').hasAttribute('data-dv-parallax')
    }), IMG);
    check('T3 mobile media queries are coarse/no-hover', m.hoverNone || m.coarse, { hoverNone: m.hoverNone, coarse: m.coarse });
    check('T3 mobile image has no transform', m.transform === 'none', m.transform);
    check('T3 mobile does not set up parallax', m.parallaxAttr === false, m.parallaxAttr);
    check('T3 no severe console errors', errors.length === 0, errors.slice(0, 3));
    await ctx.close();
  }

  // ---- T4: gallery <-> focus switch stays clean ----
  {
    const { ctx, page, errors } = await open(browser);
    const before = await page.evaluate(() => ({
      view: document.getElementById('grid').dataset.v13View,
      cards: document.querySelectorAll('#grid .wishlist-card').length
    }));
    await page.click('#v13FocusView');
    await sleep(500);
    const focus = await page.evaluate(() => ({
      view: document.getElementById('grid').dataset.v13View,
      cards: document.querySelectorAll('#grid .wishlist-card').length,
      invisible: [...document.querySelectorAll('#grid .wishlist-card')].filter(c => Number(getComputedStyle(c).opacity) < 0.99).length,
      overflow: document.documentElement.scrollWidth - window.innerWidth
    }));
    await page.click('#v13GridView');
    await sleep(500);
    const gallery = await page.evaluate(() => ({
      view: document.getElementById('grid').dataset.v13View,
      cards: document.querySelectorAll('#grid .wishlist-card').length,
      overflow: document.documentElement.scrollWidth - window.innerWidth
    }));
    check('T4 starts in gallery view', before.view === 'gallery', before.view);
    check('T4 focus view applies + keeps all cards', focus.view === 'focus' && focus.cards === before.cards && focus.invisible === 0, focus);
    check('T4 focus view has no overflow', focus.overflow <= 0, focus.overflow);
    check('T4 back to gallery view', gallery.view === 'gallery' && gallery.cards === before.cards, gallery);
    check('T4 gallery view has no overflow', gallery.overflow <= 0, gallery.overflow);
    check('T4 no severe console errors', errors.length === 0, errors.slice(0, 3));
    await ctx.close();
  }

  // ---- T5: quick view entrance + exit ----
  {
    const { ctx, page, errors } = await open(browser);
    const opened = await page.evaluate(() => {
      const card = document.querySelector('#grid .wishlist-card');
      openQuickView(card.dataset.id, card);
      const qv = document.getElementById('qv');
      return { open: qv.open, anim: getComputedStyle(qv).animationName, id: qv.dataset.id };
    });
    check('T5 quick view opens', opened.open === true, opened);
    check('T5 quick view entrance animation present', /v8-qv-in|v8-qv-sheet-in/.test(opened.anim), opened.anim);

    await page.evaluate(() => { document.getElementById('qvClose').click(); });
    await sleep(60);
    const during = await page.evaluate(() => {
      const qv = document.getElementById('qv');
      return { open: qv.open, closing: qv.classList.contains('qv-closing'), anim: getComputedStyle(qv).animationName };
    });
    check('T5 exit animation starts before closing', during.closing === true && during.open === true, during);
    check('T5 exit animation is the out variant', /v8-qv-out|v8-qv-sheet-out/.test(during.anim), during.anim);

    await sleep(500);
    const after = await page.evaluate(() => {
      const qv = document.getElementById('qv');
      return { open: qv.open, closing: qv.classList.contains('qv-closing') };
    });
    check('T5 quick view fully closed afterwards', after.open === false && after.closing === false, after);

    // ESC path must animate too.
    const esc = await page.evaluate(() => {
      const card = document.querySelector('#grid .wishlist-card');
      openQuickView(card.dataset.id, card);
      const qv = document.getElementById('qv');
      qv.dispatchEvent(new Event('cancel', { cancelable: true }));
      return { open: qv.open, closing: qv.classList.contains('qv-closing') };
    });
    check('T5 ESC triggers the exit animation instead of an instant close', esc.open === true && esc.closing === true, esc);
    await sleep(500);
    const escAfter = await page.evaluate(() => document.getElementById('qv').open);
    check('T5 ESC path closes afterwards', escAfter === false, escAfter);
    check('T5 no severe console errors', errors.length === 0, errors.slice(0, 3));
    await ctx.close();
  }

  // ---- T6: reduced motion disables media + quick view motion ----
  {
    const { ctx, page, errors } = await open(browser);
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction('typeof window.__cloudSetUser === "function"', { timeout: 15000 });
    await sleep(500);
    const m = await page.evaluate(() => {
      const img = document.querySelector('#grid .wishlist-card .product-media__image');
      const cs = getComputedStyle(img);
      const card = document.querySelector('#grid .wishlist-card');
      openQuickView(card.dataset.id, card);
      const qv = document.getElementById('qv');
      document.getElementById('qvClose').click();
      return {
        imgTransform: cs.transform,
        imgTransition: cs.transitionDuration,
        qvOpenImmediatelyAfterClose: qv.open,
        qvAnim: getComputedStyle(qv).animationName
      };
    });
    check('T6 reduced motion: image transform disabled', m.imgTransform === 'none', m.imgTransform);
    check('T6 reduced motion: image transition disabled', parseFloat(m.imgTransition) === 0, m.imgTransition);
    check('T6 reduced motion: quick view closes immediately', m.qvOpenImmediatelyAfterClose === false, m.qvOpenImmediatelyAfterClose);
    check('T6 no severe console errors', errors.length === 0, errors.slice(0, 3));
    await ctx.close();
  }

  await browser.close();
  server.close();

  const pass = results.filter(r => r.pass).length;
  results.forEach(r => console.log((r.pass ? 'PASS ' : 'FAIL ') + r.name + (r.extra ? '  :: ' + r.extra : '')));
  console.log(`\nM3 RESULT: ${pass} PASS / ${results.length - pass} FAIL  (total ${results.length})`);
  process.exit(results.some(r => !r.pass) ? 1 : 0);
})().catch(e => { console.error(e); try { server.close(); } catch (_) {} process.exit(2); });
