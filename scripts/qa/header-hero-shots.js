// =====================================================================
// Header + Hero shots — real browser evidence for the Phase 4A redesign.
//
//   node scripts/qa/header-hero-shots.js before|after   [viewports]
//
// Every width renders the REAL wishlist.html (served locally, wishlist-cloud
// stubbed like dashboard-shots.js does) at a real desktop/mobile viewport:
//   * first-screen  -> exactly one viewport tall, header + hero as seen
//   * header-strip  -> the fixed header band only
//   * hero-block    -> the hero element itself, element-clipped
// and writes header-hero-metrics.json next to the images.
//
// NOTHING here changes the app: no ids, no events, no Firebase code. The
// script only measures and photographs.
// =====================================================================
const puppeteer = require('puppeteer-core');
const http = require('http');
const fs = require('fs');
const path = require('path');

const CHROME = process.env.CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT = path.join(__dirname, '..', '..');
const PORT = 8293;
const LABEL = (process.argv[2] || 'before').replace(/[^a-z0-9_-]/gi, '');
const ONLY = (process.argv[3] || '').split(',').filter(Boolean);
const OUT = path.join(ROOT, 'qa-out', 'redesign', 'header-hero', LABEL);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.jfif': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon'
};
const MOCK = `export async function initializeWishlistCloud(o){setTimeout(()=>{o.onUserChanged&&o.onUserChanged(null);o.onStatus&&o.onStatus('local','');},0);
 return {get user(){return null},signIn:async()=>{},signOut:async()=>{},syncItems:async()=>{},uploadImage:async()=>''};}`;

const server = http.createServer((req, res) => {
  let p;
  try { p = decodeURIComponent(req.url.split('?')[0]); } catch (e) { p = req.url.split('?')[0]; }
  if (p === '/') p = '/wishlist.html';
  fs.readFile(path.join(ROOT, p), (e, d) => {
    if (e) { res.writeHead(404); return res.end('nf'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(d);
  });
});

const MIME_BY_EXT = { '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.jfif': 'image/jpeg' };
const imgData = (file) => {
  try {
    const p = path.join(ROOT, 'image', file);
    return 'data:' + (MIME_BY_EXT[path.extname(p).toLowerCase()] || 'image/jpeg') + ';base64,' + fs.readFileSync(p).toString('base64');
  } catch (e) { return ''; }
};

const NAMES = [
  ['Tai nghe Bose QC Ultra', 7490000, 'wish', 'high', 'Công nghệ', 'NH1000XM5 đã bị chốt; chờ sale cuối năm.'],
  ['MacBook Air M2 13 inch', 22900000, 'saving', 'high', 'Công nghệ', 'Bản 16GB/512GB, màu Midnight.'],
  ['Kem trị thâm mụn', 320000, 'wish', 'medium', 'Chăm sóc', 'Dùng buổi tối, tránh nắng ban ngày.'],
  ['Bàn phím cơ HI75C Pro', 1890000, 'ordered', 'medium', 'Công nghệ', 'Bản núm xoay, switch linear.'],
  ['Nước hoa After Shave', 650000, 'saving', 'medium', 'Chăm sóc', 'Mùi gỗ nhẹ, dùng hằng ngày.'],
  ['Sữa rửa mặt CeraVe', 385000, 'purchased', 'low', 'Chăm sóc', ''],
  ['Tämä laser máy chỉnh mắt', 2450000, 'wish', 'low', 'Công nghệ', 'Đặt hàng qua Shopee Korea.'],
  ['Đèn học beyerdynamic Solo', 1150000, 'wish', 'medium', 'Công nghệ', '']
];
const FILES = ['HI75C Pro.webp', 'After Shave.webp', 'M650 Mouse.webp', 'Macbook.jpg', 'PreStyling-CLMenstore.jfif', 'Trị Thâm mụn.webp'];
const seed = NAMES.map((n, i) => ({
  id: 'hh-' + i, name: n[0], price: n[1], image: imgData(FILES[i % FILES.length]),
  link: 'https://example.com/mua', status: n[2], priority: n[3], category: n[4], note: n[5],
  createdAt: 1700000000000 + i * 86400000
}));

const VIEWPORTS = [
  { w: 1440, h: 900, name: '1440' },
  { w: 1024, h: 768, name: '1024' },
  { w: 768, h: 1024, name: '768', touch: true },
  { w: 390, h: 844, name: '390', touch: true },
  { w: 320, h: 720, name: '320', touch: true }
].filter((v) => !ONLY.length || ONLY.includes(v.name));

// Everything the design gate asks to measure, in one round-trip.
const METRICS = () => {
  const R = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), b: Math.round(r.bottom) };
  };
  const S = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), b: Math.round(r.bottom),
      display: s.display, position: s.position, fs: s.fontSize, fw: s.fontWeight, lh: s.lineHeight,
      color: s.color, bg: s.backgroundColor, radius: s.borderRadius, gap: s.gap, pad: s.padding,
      margin: s.margin, ff: s.fontFamily.split(',')[0].replace(/"/g, ''), zi: s.zIndex
    };
  };
  const head = document.querySelector('.site-header');
  const hero = document.querySelector('.hero');
  const hr = head ? head.getBoundingClientRect() : null;
  const her = hero ? hero.getBoundingClientRect() : null;
  const cs = (sel, prop) => { const el = document.querySelector(sel); return el ? getComputedStyle(el)[prop] : null; };
  const doc = document.documentElement;
  return {
    viewport: { w: innerWidth, h: innerHeight },
    overflowX: doc.scrollWidth > doc.clientWidth ? doc.scrollWidth - doc.clientWidth : 0,
    scrollWidth: doc.scrollWidth,
    header: S('.site-header'),
    headerBottom: hr ? Math.round(hr.bottom + scrollY) : null,
    nav: S('.site-nav'),
    navHeight: S('.site-nav') ? S('.site-nav').h : null,
    navAccount: S('.nav-account'),
    syncPanel: S('.sync-panel'),
    syncStatus: S('#syncStatus'),
    signInBtn: S('#btnSignIn'),
    signOutBtn: S('#btnSignOut'),
    signOutVisible: !!(document.querySelector('#btnSignOut') && !document.querySelector('#btnSignOut').classList.contains('hidden')),
    brand: S('.nav-brand'),
    brandMark: S('.nav-brand__mark'),
    brandTagline: S('.nav-brand__tagline'),
    workspaceNav: S('.v11-workspace-nav'),
    navAdd: S('#btnAdd'),
    navMore: S('.nav-more summary'),
    hero: S('.hero'),
    heroTop: her ? Math.round(her.top + scrollY) : null,
    heroBottom: her ? Math.round(her.bottom + scrollY) : null,
    heroHeight: her ? Math.round(her.height) : null,
    heroContent: S('.hero__content'),
    heroEyebrow: S('.hero__eyebrow'),
    heroTitle: S('.hero__title'),
    heroTitleSpan: S('.hero__title > span'),
    heroDesc: S('.hero__description'),
    heroActions: S('.hero-v3__actions'),
    // The hero's ONE primary is the collection link; #heroAddWish is the
    // quiet secondary pill. Both are measured, by role.
    heroPrimary: S('.hero-v3__primary'),
    heroSecondary: S('#heroAddWish'),
    heroPrimaryHref: (document.querySelector('.hero-v3__primary') || {}).getAttribute
      ? document.querySelector('.hero-v3__primary').getAttribute('href') : null,
    heroAddWishIsButton: !!document.querySelector('button#heroAddWish'),
    heroFooter: S('.hero__footer'),
    heroVisual: S('.hero__visual'),
    scene: S('.v9-scene'),
    sceneNo: S('.v9-scene__no'),
    sceneCaption: S('.v9-scene__caption'),
    heroGhost: S('.pv-hero-ghost'),
    stage: S('.pv-stage'),
    cardMain: S('.pv-card--main'),
    cardA: S('.pv-card--a'),
    cardB: S('.pv-card--b'),
    marquee: S('.pv-marquee'),
    firstSectionAfterHero: (() => {
      const s = document.querySelector('.dashboard-panel');
      return s ? { y: Math.round(s.getBoundingClientRect().y + scrollY) } : null;
    })(),
    collectionAnchor: S('#collection'),
    collectionScrollMargin: cs('#collection', 'scrollMarginTop'),
    htmlScrollPadding: cs('html', 'scrollPaddingTop'),
    dvHeaderInset: getComputedStyle(doc).getPropertyValue('--dv-header-inset').trim(),
    mainPadTop: cs('#main-content', 'paddingTop'),
    mainScrollMargin: cs('#main-content', 'scrollMarginTop'),
    heroPrimaryVisibleInFold: !!(document.querySelector('.hero-v3__primary') && document.querySelector('.hero-v3__primary').getBoundingClientRect().bottom <= innerHeight),
    heroSecondaryVisibleInFold: !!(document.querySelector('#heroAddWish') && document.querySelector('#heroAddWish').getBoundingClientRect().bottom <= innerHeight),
    syncPanelVisibleInFold: !!(document.querySelector('.sync-panel') && document.querySelector('.sync-panel').getBoundingClientRect().bottom <= innerHeight),
    // Every control in the fixed band must stay a reachable target.
    targets: ['.nav-more summary', '#btnAdd', '#btnSignIn', '#btnSignOut', '.hero-v3__primary', '#heroAddWish', '.v11-workspace-nav__link']
      .map((sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { sel, w: Math.round(r.width), h: Math.round(r.height), visible: r.width > 0 && r.height > 0 };
      }).filter(Boolean),
    // Nothing in the band may overlap the brand mark or the primary nav.
    headerOverlap: (() => {
      const boxes = ['.nav-brand', '.v11-workspace-nav', '.nav-account', '.nav-actions']
        .map((s) => { const e = document.querySelector(s); return e && e.getBoundingClientRect().width ? { s, r: e.getBoundingClientRect() } : null; })
        .filter(Boolean);
      const out = [];
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i].r, b = boxes[j].r;
        const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (ox > 1 && oy > 1) out.push(boxes[i].s + ' x ' + boxes[j].s);
      }
      return out;
    })()
  };
};

async function newPage(browser, vp) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: vp.w, height: vp.h, deviceScaleFactor: 1, isMobile: !!vp.touch, hasTouch: !!vp.touch });
  await page.evaluateOnNewDocument((s) => {
    try { localStorage.clear(); localStorage.setItem('wishlist.guest.items', JSON.stringify(s)); } catch (e) {}
  }, seed);
  await page.setRequestInterception(true);
  page.on('request', (r) => /wishlist-cloud\.js/.test(r.url())
    ? r.respond({ status: 200, contentType: 'application/javascript', body: MOCK })
    : r.continue());
  await page.goto(`http://127.0.0.1:${PORT}/wishlist.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelectorAll('#grid > .wishlist-card').length === seed.length, { timeout: 20000 }).catch(() => {});
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(250);
  // settle reveal animations so the frames show the resting state
  await page.evaluate(() => new Promise(r => { let y = 0; const t = setInterval(() => { y += 900; scrollTo(0, y); if (y > 4000) { clearInterval(t); scrollTo(0, 0); r(); } }, 60); }));
  await sleep(1200);
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(300);
  return page;
}

(async () => {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--force-device-scale-factor=1', '--hide-scrollbars'] });
  fs.mkdirSync(OUT, { recursive: true });
  const metrics = { label: LABEL, date: new Date().toISOString(), pages: {} };

  for (const vp of VIEWPORTS) {
    const page = await newPage(browser, vp);
    await page.screenshot({ path: path.join(OUT, 'firstscreen-' + vp.name + '.png') });

    const header = await page.$('.site-header');
    if (header) await header.screenshot({ path: path.join(OUT, 'header-' + vp.name + '.png') });

    const heroEl = await page.$('.hero');
    if (heroEl) await heroEl.screenshot({ path: path.join(OUT, 'hero-' + vp.name + '.png') });

    metrics.pages[vp.name] = await page.evaluate(METRICS);
    await page.close();
  }

  fs.writeFileSync(path.join(OUT, 'header-hero-metrics.json'), JSON.stringify(metrics, null, 1));
  console.log('captured ' + VIEWPORTS.length + ' viewports -> ' + OUT);
  await browser.close();
  server.close();
})().catch((e) => { console.error(e); process.exit(1); });
