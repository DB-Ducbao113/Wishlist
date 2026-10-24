// =====================================================================
// Dialog shots — Quick View + Add/Edit BEFORE/AFTER, real app, seeded data.
//
//   usage: node scripts/qa/dialog-shots.js <label>     e.g. before|after
//          DLG_ONLY=390 node scripts/qa/dialog-shots.js after
//
// Writes qa-out/redesign/dialogs/<label>/ and dialog-metrics.json.
// =====================================================================
const puppeteer = require('puppeteer-core');
const http = require('http');
const fs = require('fs');
const path = require('path');

const CHROME = process.env.CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT = path.join(__dirname, '..', '..');
const PORT = 8287;
const LABEL = (process.argv[2] || 'before').replace(/[^a-z0-9_-]/gi, '');
const OUT = process.env.DLG_OUT ? path.resolve(process.env.DLG_OUT) : path.join(ROOT, 'qa-out', 'redesign', 'dialogs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.jfif': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon'
};
const MOCK = `export async function initializeWishlistCloud(o){setTimeout(()=>{o.onUserChanged&&o.onUserChanged(null);o.onStatus&&o.onStatus('local','');},0);
 return {get user(){return null},signIn:async()=>{},signOut:async()=>{},syncItems:async()=>{},uploadImage:async()=>''};}`;

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/wishlist.html';
  const f = path.join(ROOT, p);
  fs.readFile(f, (e, d) => {
    if (e) { res.writeHead(404); return res.end('nf'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
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

const SEED = [
  { name: 'Bàn phím cơ HI75C Pro', price: 1890000, image: imgData('HI75C Pro.webp'), status: 'wish', priority: 'high', category: 'Công nghệ', note: 'Bản núm xoay, switch linear. Chờ đợt sale 10.10 — nếu không giảm thì mua bản thường.', goal: 1890000, saved: 900000 },
  { name: 'Nước hoa After Shave', price: 650000, image: imgData('After Shave.webp'), status: 'saving', priority: 'medium', category: 'Chăm sóc', note: 'Mùi gỗ nhẹ, dùng hằng ngày.', goal: 650000, saved: 240000 },
  { name: 'Chuột không dây Logitech M650', price: 650000, image: imgData('M650 Mouse.webp'), status: 'ordered', priority: 'low', category: 'Công nghệ', note: '', goal: 0, saved: 0 },
  { name: 'MacBook Air M2 13 inch', price: 22900000, image: imgData('Macbook.jpg'), status: 'wish', priority: 'high', category: 'Công nghệ', note: 'Bản 16GB/512GB, màu Midnight.', goal: 22900000, saved: 8200000 },
  { name: 'Sản phẩm chăm sóc da PreStyling', price: 450000, image: imgData('PreStyling-CLMenstore.jfif'), status: 'purchased', priority: 'low', category: 'Chăm sóc', note: '', goal: 0, saved: 0 },
  { name: 'Kem trị thâm mụn', price: 320000, image: imgData('Trị Thâm mụn.webp'), status: 'wish', priority: 'medium', category: 'Chăm sóc', note: 'Dùng buổi tối, tránh nắng ban ngày.', goal: 320000, saved: 120000 }
];

const mk = (i) => {
  const s = SEED[i % SEED.length];
  return {
    id: 'dlg-' + i,
    name: s.name,
    price: s.price,
    image: s.image,
    link: i % 3 === 0 ? 'https://example.com/mua' : '',
    status: s.status,
    priority: s.priority,
    category: s.category,
    note: s.note,
    savingGoal: s.goal || null,
    savedAmount: s.saved || null,
    createdAt: 1700000000000 + i * 86400000
  };
};

const VIEWPORTS = [
  { w: 1440, h: 900, name: '1440' },
  { w: 390, h: 844, name: '390', touch: true },
  { w: 320, h: 568, name: '320', touch: true }
];

const MEASURE = () => {
  const box = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return {
      x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
      fs: s.fontSize, fw: s.fontWeight, ff: s.fontFamily.split(',')[0].replace(/"/g, ''),
      color: s.color, bg: s.backgroundColor, radius: s.borderRadius,
      display: s.display, scrollH: el.scrollHeight, clientH: el.clientHeight
    };
  };
  return {
    viewport: { w: innerWidth, h: innerHeight },
    qv: box('#qv'), qvStage: box('#qv .quick-view__stage'), qvImage: box('#qvImage'),
    qvPanel: box('#qv .quick-view__panel'), qvTitle: box('#qvTitle'), qvPrice: box('#qvPrice'),
    qvMeta: box('#qv .quick-view__meta'), qvClose: box('#qvClose'),
    qvCta: box('#qv .quick-view__cta'), qvPurchase: box('#qvPurchase'),
    qvEdit: box('#qvEdit'), qvNote: box('#qvNote'),
    dlg: box('#dlg'), dlgHead: box('#dlg .product-dialog__header'), dlgBody: box('#dlg .product-dialog__body'),
    dlgFoot: box('#dlg .product-dialog__footer'), dlgTitle: box('#dlgTitle'),
    fName: box('#fName'), fPrice: box('#fPrice'), moreToggle: box('#fMoreToggle'),
    submit: box('#fSubmit'), cancel: box('#btnCancel'),
    name: (document.getElementById('fName') || {}).value,
    price: (document.getElementById('fPrice') || {}).value,
    openQv: !!(document.getElementById('qv') || {}).open,
    openDlg: !!(document.getElementById('dlg') || {}).open,
    active: (document.activeElement && (document.activeElement.id || document.activeElement.className)) || '',
    dlgScroll: (() => { const d = document.getElementById('dlg'); return d ? { scrollH: d.scrollHeight, clientH: d.clientHeight } : null; })()
  };
};

async function newPage(browser, vp) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: vp.w, height: vp.h, deviceScaleFactor: 1, isMobile: !!vp.touch, hasTouch: !!vp.touch });
  await page.evaluateOnNewDocument((s) => {
    try { localStorage.clear(); localStorage.setItem('wishlist.guest.items', JSON.stringify(s)); } catch (e) {}
  }, Array.from({ length: 6 }, (_, i) => mk(i)));
  await page.setRequestInterception(true);
  page.on('request', (r) => /wishlist-cloud\.js/.test(r.url())
    ? r.respond({ status: 200, contentType: 'application/javascript', body: MOCK })
    : r.continue());
  page.on('dialog', async (d) => { try { await d.accept(); } catch (e) {} });
  await page.goto(`http://127.0.0.1:${PORT}/wishlist.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelectorAll('#grid > .wishlist-card').length > 0, { timeout: 20000 }).catch(() => {});
  await sleep(1400);
  await page.evaluate(async () => {
    for (let y = 0; y < document.documentElement.scrollHeight; y += 400) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 40));
    }
    window.scrollTo(0, 0);
  }).catch(() => {});
  await sleep(600);
  return { ctx, page };
}

(async () => {
  await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--force-device-scale-factor=1', '--hide-scrollbars']
  });
  const dir = path.join(OUT, LABEL);
  fs.mkdirSync(dir, { recursive: true });
  const metrics = {};
  const vps = process.env.DLG_ONLY ? VIEWPORTS.filter((v) => v.name === process.env.DLG_ONLY) : VIEWPORTS;

  for (const vp of vps) {
    const { ctx, page } = await newPage(browser, vp);
    const shot = async (name) => page.screenshot({ path: path.join(dir, name + '-' + vp.name + '.png') });
    metrics[vp.name] = {};

    // ---- Quick View (first card: image, note, goal, link)
    await page.evaluate(() => {
      const card = document.querySelector('#grid > .wishlist-card');
      const btn = card && card.querySelector('.product-card__view');
      if (btn) btn.click();
    });
    await sleep(900);
    metrics[vp.name].qv = await page.evaluate(MEASURE);
    await shot('qv');
    // mobile: the panel scrolls; capture the lower half too
    const scrolled = await page.evaluate(() => {
      const p = document.querySelector('#qv .quick-view__panel');
      if (!p) return false;
      const sc = p.scrollHeight > p.clientHeight + 4 ? p : document.getElementById('qv');
      sc.scrollTop = sc.scrollHeight;
      return sc.scrollTop > 0;
    });
    await sleep(500);
    if (scrolled) await shot('qv-bottom');
    await page.evaluate(() => document.getElementById('qvClose').click());
    await sleep(700);

    // ---- Add (empty form)
    await page.evaluate(() => document.getElementById('btnAdd').click());
    await sleep(700);
    metrics[vp.name].add = await page.evaluate(MEASURE);
    await shot('add');
    await page.evaluate(() => document.getElementById('fMoreToggle').click());
    await sleep(500);
    metrics[vp.name].addMore = await page.evaluate(MEASURE);
    await shot('add-more');
    await page.evaluate(() => document.getElementById('btnCancel').click());
    await sleep(500);

    // ---- Edit (via Quick View → "Sửa món này")
    await page.evaluate(() => {
      const card = document.querySelector('#grid > .wishlist-card');
      const btn = card && card.querySelector('.product-card__view');
      if (btn) btn.click();
    });
    await sleep(800);
    await page.evaluate(() => document.getElementById('qvEdit').click());
    await sleep(900);
    metrics[vp.name].edit = await page.evaluate(MEASURE);
    await shot('edit');
    const scrolledDlg = await page.evaluate(() => {
      const d = document.getElementById('dlg');
      const sc = d.scrollHeight > d.clientHeight + 4 ? d : document.querySelector('#dlg .product-dialog__body');
      if (!sc) return false;
      sc.scrollTop = sc.scrollHeight;
      return sc.scrollTop > 0;
    });
    await sleep(400);
    if (scrolledDlg) await shot('edit-bottom');

    await ctx.close();
    console.log(vp.name + ': qv, add, add-more, edit' + (scrolled ? ', qv-bottom' : '') + (scrolledDlg ? ', edit-bottom' : ''));
  }

  fs.writeFileSync(path.join(OUT, LABEL, 'dialog-metrics.json'), JSON.stringify(metrics, null, 2));
  await browser.close();
  server.close();
  console.log('shots -> ' + path.join(OUT, LABEL));
})().catch((e) => { console.error(e); process.exit(1); });
