// =====================================================================
// UX-05 — Phase D performance benchmark.
//   Renders 0 / 10 / 50 / 100 items and measures the synchronous grid
//   build, the frame cost of the same, and the input responsiveness
//   (search) under each load. Same machine, same conditions, one run.
//
//   usage: node scripts/qa/ux05-perf.js
// =====================================================================
const puppeteer = require('puppeteer-core');
const http = require('http'); const fs = require('fs'); const path = require('path');

const CHROME = process.env.CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT = path.join(__dirname, '..', '..');
const PORT = 8260;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const MOCK = `export async function initializeWishlistCloud(o){setTimeout(()=>{o.onUserChanged&&o.onUserChanged(null);o.onStatus&&o.onStatus('local','');},0);
 return {get user(){return null},signIn:async()=>{},signOut:async()=>{},syncItems:async()=>{},uploadImage:async()=>''};}`;
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/wishlist.html';
  const f = path.join(ROOT, p);
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); return res.end('nf'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(d); });
});

const NAMES = ['Tai nghe chống ồn', 'Nồi chiên không dầu', 'Bàn phím cơ', 'Ghế công thái học', 'Đèn bàn Bắc Âu', 'Kính mắt mèo', 'Loa Marshall', 'Vali du lịch', 'Sách lập trình', 'Máy ảnh mirrorless'];
const mk = (i) => ({
  id: 'perf-' + i, name: NAMES[i % NAMES.length] + ' ' + (i + 1), price: 200000 + i * 37000,
  image: '', link: i % 3 === 0 ? 'https://example.com/mua' : '',
  status: ['wish', 'saving', 'ordered', 'purchased'][i % 4],
  priority: ['low', 'medium', 'high'][i % 3],
  category: 'Nhóm ' + (i % 4), note: i % 2 ? 'ghi chú ' + i : '',
  createdAt: 1700000000000 + i,
  ...(i % 5 === 0 ? { savingGoal: 900000 + i, savedAmount: 120000 } : {})
});

async function bench(browser, n) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument((s) => {
    try { localStorage.setItem('wishlist.guest.items', JSON.stringify(s)); } catch (e) {}
  }, Array.from({ length: n }, (_, i) => mk(i)));
  await page.setRequestInterception(true);
  page.on('request', (r) => {
    if (/wishlist-cloud\.js/.test(r.url())) return r.respond({ status: 200, contentType: 'application/javascript', body: MOCK });
    return r.continue();
  });
  const t0 = Date.now();
  await page.goto(`http://127.0.0.1:${PORT}/wishlist.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => {
    const g = document.getElementById('grid');
    return g && (g.children.length > 0 || !document.getElementById('empty').classList.contains('hidden'));
  }, { timeout: 20000 });
  const loadMs = Date.now() - t0;
  await sleep(2200);   // let the entrance animations settle

  const r = await page.evaluate(async () => {
    // 1) synchronous grid build
    const builds = [];
    for (let i = 0; i < 5; i++) { const t = performance.now(); render(); builds.push(performance.now() - t); }
    builds.sort((a, b) => a - b);

    // 2) frame cost of the same build (rAF-to-rAF)
    const frames = [];
    for (let i = 0; i < 5; i++) {
      await new Promise(res => requestAnimationFrame(res));
      const t0 = performance.now();
      render();
      await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
      frames.push(performance.now() - t0);
    }
    frames.sort((a, b) => a - b);

    // 3) input responsiveness: how long a keystroke takes to be reflected
    const q = document.getElementById('q');
    const lat = [];
    for (const term of ['T', 'Tai', 'Tai n', 'Tai nghe']) {
      const t = performance.now();
      q.value = term;
      q.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(r => setTimeout(r, 220));
      lat.push(performance.now() - t);
    }
    q.value = ''; q.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 250));

    return {
      builds: builds.map(x => +x.toFixed(1)),
      buildMedian: +builds[2].toFixed(1),
      frames: frames.map(x => +x.toFixed(1)),
      frameMedian: +frames[2].toFixed(1),
      latency: lat.map(x => +x.toFixed(1)),
      cards: document.querySelectorAll('#grid > .wishlist-card').length,
      nodes: document.querySelectorAll('*').length,
      listeners: 0
    };
  });
  await ctx.close();
  return { n, loadMs, ...r };
}

(async () => {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--hide-scrollbars', '--force-device-scale-factor=1']
  });
  const out = [];
  for (const n of [0, 10, 50, 100]) {
    const r = await bench(browser, n);
    out.push(r);
    console.log(
      String(n).padStart(4) + ' items | load ' + String(r.loadMs).padStart(5) + 'ms | build median ' +
      String(r.buildMedian).padStart(6) + 'ms [' + r.builds.join(' ') + '] | frame median ' +
      String(r.frameMedian).padStart(6) + 'ms | search latency ' + r.latency.join('/') + 'ms | cards ' +
      r.cards + ' | DOM nodes ' + r.nodes
    );
  }
  fs.mkdirSync(path.join(ROOT, 'qa-out'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'qa-out', 'ux05-perf.json'), JSON.stringify({
    generatedAt: new Date().toISOString(),
    machine: { platform: process.platform, node: process.version, chrome: CHROME },
    results: out
  }, null, 2));
  await browser.close();
  server.close();
  console.log('\nreport: qa-out/ux05-perf.json');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
