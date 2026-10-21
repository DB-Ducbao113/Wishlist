// Identify the node that paints the thin rule under a card price, using CDP
// hit-testing plus matched styles. One-off diagnostic.
//   usage: node scripts/qa/redesign-lineprobe.js
const puppeteer = require('puppeteer-core');
const http = require('http');
const fs = require('fs');
const path = require('path');

const CHROME = process.env.CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT = path.join(__dirname, '..', '..');
const PORT = 8285;
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
    localStorage.setItem('wishlist.guest.items', JSON.stringify(Array.from({ length: 4 }, (_, i) => ({
      id: 'p' + i, name: 'Sản phẩm ' + (i + 1), price: 2190000 + i, status: 'wish', priority: 'medium',
      category: 'Nhà cửa', note: i === 0 ? '' : 'ghi chú ngắn', createdAt: 1700000000000 + i
    }))));
  });
  await page.setRequestInterception(true);
  page.on('request', (r) => /wishlist-cloud\.js/.test(r.url())
    ? r.respond({ status: 200, contentType: 'application/javascript', body: MOCK })
    : r.continue());
  await page.goto(`http://127.0.0.1:${PORT}/wishlist.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelectorAll('#grid > .wishlist-card').length > 1, { timeout: 15000 });
  await new Promise((r) => setTimeout(r, 1000));
  await page.evaluate(() => {
    const el = document.querySelector('#grid .product-card__price');
    if (el) el.scrollIntoView({ block: 'center' });
  });
  await new Promise((r) => setTimeout(r, 500));

  const rect = await page.evaluate(() => {
    const el = document.querySelector('#grid .product-card__price');
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return {
      x: r.left, y: r.top, w: r.width, h: r.height, b: r.bottom,
      deco: s.textDecorationLine, decoColor: s.textDecorationColor, decoStyle: s.textDecorationStyle,
      border: s.borderTop + ' | ' + s.borderBottom,
      bg: s.backgroundImage, bgColor: s.backgroundColor, shadow: s.boxShadow,
      before: getComputedStyle(el, '::before').content, beforeDisplay: getComputedStyle(el, '::before').display,
      beforeBg: getComputedStyle(el, '::before').backgroundColor, beforeH: getComputedStyle(el, '::before').height,
      beforePos: getComputedStyle(el, '::before').position,
      after: getComputedStyle(el, '::after').content, afterBg: getComputedStyle(el, '::after').backgroundColor
    };
  });

  const client = await page.target().createCDPSession();
  await client.send('DOM.enable');
  await client.send('CSS.enable');
  const doc = await client.send('DOM.getDocument', { depth: -1 });
  const found = await client.send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: '#grid .product-card__price' });
  const styles = await client.send('CSS.getMatchedStylesForNode', { nodeId: found.nodeId });

  const interesting = [];
  for (const m of styles.matchedCSSRules || []) {
    for (const p of m.rule.style.cssProperties || []) {
      if (/decoration|border-bottom|border-top|background|box-shadow/i.test(p.name) && p.value && p.value !== 'none' && p.value !== '0px') {
        interesting.push({ selector: m.rule.selectorList.text, prop: p.name, value: p.value, important: !!p.important });
      }
    }
  }
  const pseudo = (styles.pseudoElements || []).map((ps) => ({
    pseudoType: ps.pseudoType,
    rules: (ps.matches || []).flatMap((m) => (m.rule.style.cssProperties || [])
      .filter((p) => p.value && p.value !== 'none')
      .map((p) => ({ selector: m.rule.selectorList.text, prop: p.name, value: p.value })))
  }));

  // Hit-test a vertical column through the rule.
  const hits = [];
  for (let dy = -2; dy <= 6; dy++) {
    const y = Math.round(rect.b + dy);
    const r = await client.send('DOM.getNodeForLocation', { x: Math.round(rect.x + 30), y, includeUserAgentShadowDOM: false }).catch(() => null);
    if (!r) { hits.push({ dy, node: null }); continue; }
    const desc = await client.send('DOM.describeNode', { nodeId: r.nodeId, depth: 0 }).catch(() => null);
    hits.push({ dy, backendNodeId: r.backendNodeId, nodeName: desc && desc.node ? desc.node.nodeName : null, attrs: desc && desc.node ? desc.node.attributes : null });
  }

  console.log(JSON.stringify({ rect, interesting, pseudo, hits }, null, 2));
  await browser.close();
  server.close();
})().catch((e) => { console.error(e); process.exit(1); });
