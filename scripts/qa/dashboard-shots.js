// =====================================================================
// Dashboard/Hero shots — hero + dashboard BEFORE/AFTER, real app.
//
//   usage: node scripts/qa/dashboard-shots.js <label>   e.g. before|after
//          DASH_EMPTY=1  node scripts/qa/dashboard-shots.js before   (empty run)
//          DASH_VP=390   node scripts/qa/dashboard-shots.js after    (single width)
//
// Writes qa-out/redesign/dashboard/<label>/ and dashboard-metrics.json.
// =====================================================================
const puppeteer = require('puppeteer-core');
const http = require('http');
const fs = require('fs');
const path = require('path');

const CHROME = process.env.CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT = path.join(__dirname, '..', '..');
const PORT = 8288;
const LABEL = (process.argv[2] || 'before').replace(/[^a-z0-9_-]/gi, '');
const OUT = process.env.DASH_OUT ? path.resolve(process.env.DASH_OUT) : path.join(ROOT, 'qa-out', 'redesign', 'dashboard');
const EMPTY = !!process.env.DASH_EMPTY;
const ONLYVP = process.env.DASH_VP || '';
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
  try { p = decodeURIComponent(req.url.split('?')[0]); } catch (e) { p = req.url.split('?')[0].replace(/%[0-9a-fA-F]*/g, ''); }
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

// Eight real-ish items — the prototype's collection size, mixed statuses,
// three saving goals, one purchased (so owned/total and spent are meaningful).
const NAMES = [
  ['Tai nghe Bose QC Ultra', 7490000, 'wish', 'high', 'Công nghệ', 'NH1000XM5 đã bị chốt; chờ sale cuối năm.', 'Công nghệ'],
  ['MacBook Air M2 13 inch', 22900000, 'saving', 'high', 'Công nghệ', 'Bản 16GB/512GB, màu Midnight.', 'Công nghệ'],
  ['Kem trị thâm mụn', 320000, 'wish', 'medium', 'Chăm sóc', 'Dùng buổi tối, tránh nắng ban ngày.', 'Chăm sóc'],
  ['Bàn phím cơ HI75C Pro', 1890000, 'ordered', 'medium', 'Công nghệ', 'Bản núm xoay, switch linear.', 'Công nghệ'],
  ['Nước hoa After Shave', 650000, 'saving', 'medium', 'Chăm sóc', 'Mùi gỗ nhẹ, dùng hằng ngày.', 'Chăm sóc'],
  ['Sữa rửa mặt CeraVe', 385000, 'purchased', 'low', 'Chăm sóc', '', 'Chăm sóc'],
  ['Tämä laser máy chỉnh mắt', 2450000, 'wish', 'low', 'Công nghệ', 'Đặt hàng qua Shopee Korea.', 'Đồ gia dụng'],
  ['Đèn học beyerdynamic Solo', 1150000, 'wish', 'medium', 'Công nghệ', '', 'Công nghệ']
];
const GOALS = { 1: 22900000, 4: 650000, 6: 950000 }; // index -> [goal, saved]
const SAVED = { 1: 8200000, 4: 240000, 6: 300000 };

const seed = EMPTY ? [] : NAMES.map((n, i) => ({
  id: 'dash-' + i,
  name: n[0],
  price: n[1],
  image: imgData(NAMES[i % NAMES.length] === n ? '' : ''),
  link: 'https://example.com/mua',
  status: n[2],
  priority: n[3],
  category: n[4],
  note: n[5],
  savingGoal: GOALS[i] || null,
  savedAmount: SAVED[i] || null,
  createdAt: 1700000000000 + i * 86400000
}));
// images: reuse the tracked photos across the 8 items for populated realism
if (!EMPTY) {
  const files = ['HI75C Pro.webp', 'After Shave.webp', 'M650 Mouse.webp', 'Macbook.jpg', 'PreStyling-CLMenstore.jfif', 'Trị Thâm mụn.webp'];
  seed.forEach((it, i) => { it.image = imgData(files[i % files.length]); });
}

const VIEWPORTS = [
  { w: 1440, h: 900, name: '1440' },
  { w: 1024, h: 768, name: '1024' },
  { w: 768, h: 1024, name: '768', touch: true },
  { w: 390, h: 844, name: '390', touch: true },
  { w: 320, h: 844, name: '320', touch: true }
].filter(v => !ONLYVP || ONLYVP === v.name);

const METRICS = () => {
  const box = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return {
      x: Math.round(r.x + scrollX), y: Math.round(r.y + scrollY), w: Math.round(r.width), h: Math.round(r.height),
      vh: r.height >= innerHeight ? 'offscreen' : 'fits',
      fs: s.fontSize, fw: s.fontWeight, ff: s.fontFamily.split(',')[0].replace(/"/g, ''),
      color: s.color, bg: s.backgroundColor, radius: s.borderRadius, just: s.justifyContent, disp: s.display
    };
  };
  const firstCard = document.querySelector('#grid > .wishlist-card');
  return {
    viewport: { w: innerWidth, h: innerHeight },
    docScrollH: document.documentElement.scrollHeight,
    hero: box('.hero'), heroContent: box('.hero__content'), heroTitle: box('.hero__title'),
    heroDesc: box('.hero__description'), heroPrimary: box('#heroAddWish'),
    heroSecondary: box('.hero-v3__secondary'), heroActions: box('.hero-v3__actions'),
    heroVisual: box('.hero__visual'), heroGhost: box('.pv-hero-ghost'),
    stage: box('.pv-stage'), stageBadge: box('.pv-stage__badge'),
    cardMain: box('.pv-card--main'), cardA: box('.pv-card--a'), cardB: box('.pv-card--b'),
    marquee: box('.pv-marquee'),
    dash: box('.dashboard-panel'), dashHead: box('.dashboard-panel .list-heading--v3, .dashboard-panel .dv-head'),
    dashHeadings: [...document.querySelectorAll('.dashboard-panel h2, .dashboard-panel .dv-head')].map(h => ({
      sel: h.className, text: (h.textContent || '').trim().slice(0, 60), fs: getComputedStyle(h).fontSize, fw: getComputedStyle(h).fontWeight
    })),
    statsTotal: box('.stats-dashboard'), dvAdd: box('#dvAddItem'),
    dvMetrics: box('#dvMetrics'), dvProgress: box('#dvProgress'),
    dvDist: box('#dvDist'), dvBreakdown: box('#dvBreakdown'),
    dvTabs: box('.dv-tabs'),
    firstCard: firstCard ? { y: Math.round(firstCard.getBoundingClientRect().y + scrollY) } : null,
    grid: box('#grid'),
    savedStrings: {
      total: (document.querySelector('.stats-dashboard') || document.body).textContent.includes('28.880.000')
    }
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
  // settle the reveal animations so the measurements are the resting state
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(250);
  await page.evaluate(() => new Promise(r => { let y = 0; const t = setInterval(() => { y += 900; scrollTo(0, y); if (y > 4000) { clearInterval(t); scrollTo(0, 0); r(); } }, 60); }));
  await sleep(1200);
  return page;
}

(async () => {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--force-device-scale-factor=1', '--hide-scrollbars'] });
  const dir = path.join(OUT, LABEL);
  fs.mkdirSync(dir, { recursive: true });
  const metrics = { label: LABEL, empty: EMPTY, date: new Date().toISOString(), pages: {} };

  for (const vp of VIEWPORTS) {
    const page = await newPage(browser, vp);
    // full first screen (hero occupies the scroll start)
    await page.evaluate(() => window.scrollTo(0, 0));
    await sleep(300);
    await page.screenshot({ path: path.join(dir, 'hero-' + vp.name + '.png') });

    // dashboard section, whole element
    const dash = await page.$('.dashboard-panel');
    if (dash) { await sleep(200); await dash.screenshot({ path: path.join(dir, 'dash-' + vp.name + '.png') }); }

    // hero with real floating cards (populated run only): already in hero-*.png
    metrics.pages[vp.name] = await page.evaluate(METRICS);
    await page.close();
  }

  // ---- empty-state dedicated frames (separate contexts, same widths) ----
  if (!EMPTY) {
    const page = await newPage(browser, VIEWPORTS[0]); // quick sanity of populated metrics
    await page.close();
  }
  fs.writeFileSync(path.join(dir, 'dashboard-metrics.json'), JSON.stringify(metrics, null, 1));

  console.log('captured ' + VIEWPORTS.length + ' viewports -> ' + dir);
  await browser.close();
  server.close();
})().catch(e => { console.error(e); process.exit(1); });
