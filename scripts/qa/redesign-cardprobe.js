// Compare the legacy "featured first card" against a normal card, so the
// redesign sheet can neutralise exactly the properties that differ.
//   usage: node scripts/qa/redesign-cardprobe.js
const puppeteer = require('puppeteer-core');
const http = require('http');
const fs = require('fs');
const path = require('path');
const CHROME = process.env.CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT = path.join(__dirname, '..', '..');
const PORT = 8283;
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

const PROPS = ['display', 'gridColumn', 'gridRow', 'gridTemplateColumns', 'gridTemplateRows', 'minHeight', 'height', 'aspectRatio', 'padding', 'margin', 'position', 'overflow', 'borderRadius', 'flexDirection'];
const read = (el, props) => {
  const s = getComputedStyle(el);
  const o = {};
  for (const p of props) o[p] = s[p];
  o._box = (() => { const r = el.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; })();
  return o;
};

(async () => {
  await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--force-device-scale-factor=1'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.evaluateOnNewDocument(() => {
    localStorage.clear();
    localStorage.setItem('wishlist.guest.items', JSON.stringify(Array.from({ length: 6 }, (_, i) => ({
      id: 'p' + i, name: 'Sản phẩm ' + (i + 1), price: 1000000 + i, status: 'wish', priority: 'medium',
      category: 'Công nghệ', note: 'ghi chú', createdAt: 1700000000000 + i
    }))));
  });
  await page.setRequestInterception(true);
  page.on('request', (r) => /wishlist-cloud\.js/.test(r.url())
    ? r.respond({ status: 200, contentType: 'application/javascript', body: MOCK })
    : r.continue());
  await page.goto(`http://127.0.0.1:${PORT}/wishlist.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelectorAll('#grid .wishlist-card').length > 2, { timeout: 15000 });
  await new Promise((r) => setTimeout(r, 800));

  const out = await page.evaluate((PROPS) => {
    const cards = [...document.querySelectorAll('#grid > .wishlist-card')];
    const first = cards[0];
    const odd = [...first.querySelectorAll('*')].filter((el) => {
      const t = (el.textContent || '').trim();
      return el.children.length === 0 && (t === '01' || /SƯU TẬP RIÊNG/i.test(t));
    }).map((el) => ({ tag: el.tagName, cls: el.className, text: el.textContent.trim().slice(0, 30), display: getComputedStyle(el).display }));
    const badges = first.querySelector('.product-card__badges');
    const content = first.querySelector('.product-card__content');
    const bo = badges && badges.offsetParent;
    const cs = getComputedStyle(content);
    const pseudo = (el) => ({
      before: { content: getComputedStyle(el, '::before').content, display: getComputedStyle(el, '::before').display },
      after: { content: getComputedStyle(el, '::after').content, display: getComputedStyle(el, '::after').display }
    });
    const thumb = first.querySelector('.thumb.product-media');
    const frame = first.querySelector('.product-media__frame');
    const extra = {
      contentPosition: cs.position,
      contentTransform: cs.transform,
      contentFilter: cs.filter,
      contentContain: cs.contain,
      contentWillChange: cs.willChange,
      contentContainerType: cs.containerType,
      contentPerspective: cs.perspective,
      surfaceTransform: getComputedStyle(first.querySelector('.wishlist-card__surface')).transform,
      badgesOffsetParent: bo ? bo.tagName + '.' + bo.className : null,
      badgesPosition: getComputedStyle(badges).position,
      badgeTop: getComputedStyle(badges).top,
      priceDeco: (() => { const pr = first.querySelector('.product-card__price'); const s = getComputedStyle(pr); return { textDecorationLine: s.textDecorationLine, borderBottom: s.borderBottom, backgroundImage: s.backgroundImage, boxShadow: s.boxShadow, before: { content: getComputedStyle(pr, '::before').content, display: getComputedStyle(pr, '::before').display }, after: { content: getComputedStyle(pr, '::after').content, display: getComputedStyle(pr, '::after').display } }; })(),
      titleSize: getComputedStyle(first.querySelector('.product-card__title')).fontSize,
      priceSize: getComputedStyle(first.querySelector('.product-card__price')).fontSize,
      thumbPseudo: pseudo(thumb),
      framePseudo: pseudo(frame),
      oddNodes: odd
    };
    const pick = (el) => {
      if (!el) return null;
      const s = getComputedStyle(el);
      const o = {};
      for (const p of PROPS) o[p] = s[p];
      const r = el.getBoundingClientRect();
      o._box = [Math.round(r.width), Math.round(r.height)];
      return o;
    };
    const parts = (c) => ({
      card: pick(c),
      surface: pick(c.querySelector('.wishlist-card__surface')),
      thumb: pick(c.querySelector('.thumb.product-media')),
      content: pick(c.querySelector('.product-card__content')),
      actions: pick(c.querySelector('.product-card__actions')),
      title: pick(c.querySelector('.product-card__title'))
    });
    return { view: document.getElementById('grid').getAttribute('data-v13-view'), extra, first: parts(cards[0]), second: parts(cards[1]) };
  }, PROPS);
  fs.writeFileSync(path.join(ROOT, 'qa-out', 'redesign', 'cardprobe.json'), JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  await browser.close();
  server.close();
})().catch((e) => { console.error(e); process.exit(1); });
