const puppeteer = require('puppeteer-core');
const http = require('http'); const fs = require('fs'); const path = require('path');
const CHROME = process.env.CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT = path.join(__dirname, '..', '..'); const PORT = 8284;
const MOCK = `export async function initializeWishlistCloud(o){setTimeout(()=>{o.onUserChanged&&o.onUserChanged(null);o.onStatus&&o.onStatus('local','');},0);
 return {get user(){return null},signIn:async()=>{},signOut:async()=>{},syncItems:async()=>{},uploadImage:async()=>''};}`;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.jfif': 'image/jpeg', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  const f = path.join(ROOT, p === '/' ? '/wishlist.html' : p);
  fs.readFile(f, (e, d) => {
    if (e) { res.writeHead(404); return res.end('nf'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream' });
    res.end(d);
  });
});
(async () => {
  await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--force-device-scale-factor=1'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.evaluateOnNewDocument(() => {
    localStorage.clear();
    localStorage.setItem('wishlist.guest.items', JSON.stringify(Array.from({ length: 8 }, (_, i) => ({
      id: 'p' + i, name: 'Sản phẩm số ' + (i + 1), price: 1000000 + i * 111, status: 'wish', priority: 'medium',
      category: 'Công nghệ', note: 'ghi chú ngắn', createdAt: 1700000000000 + i
    }))));
  });
  await page.setRequestInterception(true);
  page.on('request', (r) => /wishlist-cloud\.js/.test(r.url())
    ? r.respond({ status: 200, contentType: 'application/javascript', body: MOCK })
    : r.continue());
  await page.goto(`http://127.0.0.1:${PORT}/wishlist.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelectorAll('#grid > *').length > 4, { timeout: 15000 });
  await new Promise((r) => setTimeout(r, 900));
  const out = await page.evaluate(() => {
    const g = document.getElementById('grid');
    const kids = [...g.children].map((el) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return {
        tag: el.tagName, cls: (el.className || '').slice(0, 90),
        display: s.display, gridColumn: s.gridColumn, gridRow: s.gridRow,
        opacity: s.opacity, transform: s.transform, visibility: s.visibility,
        reveal: el.getAttribute('data-dv-reveal'), box: [Math.round(r.width), Math.round(r.height)]
      };
    });
    const frame = g.querySelector('.product-media__frame');
    const img = g.querySelector('.product-media__image');
    const fs2 = frame ? getComputedStyle(frame) : null;
    return {
      gridRows: getComputedStyle(g).gridTemplateRows,
      gridAutoRows: getComputedStyle(g).gridAutoRows,
      kids,
      frame: fs2 ? {
        position: fs2.position, inset: fs2.inset, width: fs2.width, height: fs2.height,
        margin: fs2.margin, padding: fs2.padding, borderRadius: fs2.borderRadius,
        transform: fs2.transform, box: (() => { const r = frame.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; })()
      } : null,
      img: img ? (() => {
        const s = getComputedStyle(img); const r = img.getBoundingClientRect();
        return { width: s.width, height: s.height, objectFit: s.objectFit, margin: s.margin, padding: s.padding, box: [Math.round(r.width), Math.round(r.height)] };
      })() : null
    };
  });
  const under = await page.evaluate(() => {
    const pr = document.querySelector('#grid .product-card__price');
    if (!pr) return null;
    pr.scrollIntoView({ block: 'center' });
    const r = pr.getBoundingClientRect();
    const y = Math.round(r.bottom + 1);
    const x = Math.round(r.left + r.width / 2);
    const els = document.elementsFromPoint(x, y).slice(0, 6).map((el) => {
      const s = getComputedStyle(el);
      return {
        tag: el.tagName, cls: (el.className || '').slice(0, 70),
        deco: s.textDecorationLine, borderBottom: s.borderBottomWidth + ' ' + s.borderBottomStyle + ' ' + s.borderBottomColor,
        bgImage: s.backgroundImage.slice(0, 60), boxShadow: s.boxShadow.slice(0, 60),
        pseudoAfter: getComputedStyle(el, '::after').content
      };
    });
    return { point: [x, y], priceRect: [r.left, r.top, r.width, r.bottom], els };
  });
  console.log(JSON.stringify({ under }, null, 2));
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
  await page.evaluate(() => { const el = document.querySelector('#grid .wishlist-card'); if (el) el.scrollIntoView({ block: 'center' }); });
  await new Promise((r) => setTimeout(r, 400));
  const card = await page.$('#grid .wishlist-card');
  if (card) await card.screenshot({ path: path.join(ROOT, 'qa-out', 'redesign', 'card-zoom.png') });
  await browser.close(); server.close();
})().catch((e) => { console.error(e); process.exit(1); });
