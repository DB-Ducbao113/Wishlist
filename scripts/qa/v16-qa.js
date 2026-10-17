// V16 QA harness — reusable across M1..M5.
// Serves the repo, stubs the cloud module (no Firebase network), then checks
// console health, horizontal overflow, render integrity and reduced-motion
// fallbacks at every required viewport. Optional screenshots.
//
// usage: node v16-qa.js <repoRoot> [port] [--shots] [--count=12]
const puppeteer = require('puppeteer-core');
const http = require('http');
const fs = require('fs');
const path = require('path');

const CHROME = process.env.CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT = process.argv[2] || path.join(__dirname, '..', '..');
const PORT = Number((process.argv.find(a => /^\d+$/.test(a)) || 0)) || 8124;
const SHOTS = process.argv.includes('--shots');
const COUNT = Number((process.argv.find(a => a.startsWith('--count=')) || '--count=12').split('=')[1]);
const OUT = path.join(__dirname, '..', '..', 'qa-out');
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

const VIEWPORTS = [
  { name: 'desktop-1280', width: 1280, height: 800 },
  { name: 'desktop-1440', width: 1440, height: 900 },
  { name: 'desktop-1920', width: 1920, height: 1080 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'mobile-430', width: 430, height: 932, isMobile: true, hasTouch: true },
  { name: 'mobile-375', width: 375, height: 667, isMobile: true, hasTouch: true },
  { name: 'mobile-320', width: 320, height: 568, isMobile: true, hasTouch: true }
];

const results = [];
const check = (name, cond, extra) => results.push({ name, pass: !!cond, extra: extra === undefined ? '' : JSON.stringify(extra) });

const ITEM = i => ({
  id: 'qa-' + i,
  name: 'Món ' + i,
  price: 100000 + i * 1000,
  image: '',
  link: '',
  status: ['wish', 'saving', 'ordered', 'purchased'][i % 4],
  priority: ['low', 'medium', 'high'][i % 3],
  category: 'Nhóm ' + (i % 3),
  note: 'ghi chú ' + i,
  createdAt: 1700000000000 + i
});

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/wishlist.html';
  const file = path.join(ROOT, p);
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
});

const SEVERE = /(uncaught|is not defined|is not a function|cannot read|typeerror|referenceerror|syntaxerror|failed to load module|importing a module script failed)/i;

async function runViewport(browser, vp, opts = {}) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: vp.width, height: vp.height, isMobile: !!vp.isMobile, hasTouch: !!vp.hasTouch, deviceScaleFactor: 1 });
  if (opts.reducedMotion) await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  else await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
  await page.evaluateOnNewDocument(items => {
    try {
      localStorage.setItem('wishlist.guest.items', JSON.stringify(items));
      localStorage.setItem('wishlist.items', JSON.stringify(items));
    } catch (e) {}
  }, Array.from({ length: COUNT }, (_, i) => ITEM(i + 1)));

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
  await sleep(500);

  // Scroll the whole page slowly to trigger reveals.
  await page.evaluate(async () => {
    const step = Math.max(200, window.innerHeight * 0.6);
    for (let y = 0; y <= document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise(r => setTimeout(r, 60));
    }
    window.scrollTo(0, 0);
    await new Promise(r => setTimeout(r, 250));
  });
  await sleep(300);

  const tag = vp.name + (opts.reducedMotion ? '-reduced-motion' : '');
  const data = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('#grid .wishlist-card')];
    const invisible = cards.filter(c => {
      const s = getComputedStyle(c);
      return s.display === 'none' || Number(s.opacity) < 0.99 || s.visibility === 'hidden';
    }).length;
    return {
      cards: cards.length,
      invisible,
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
      bodyScrollWidth: document.body.scrollWidth,
      imgCount: document.querySelectorAll('#grid .product-media__image').length
    };
  });

  check(tag + ': cards rendered', data.cards === COUNT, data.cards);
  check(tag + ': no invisible (blank) cards', data.invisible === 0, data.invisible);
  check(tag + ': no horizontal overflow', data.scrollWidth <= data.innerWidth + 1, { sw: data.scrollWidth, iw: data.innerWidth });
  check(tag + ': no severe console errors', errors.length === 0, errors.slice(0, 3));

  if (SHOTS) {
    if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
    await page.screenshot({ path: path.join(OUT, `v16-${tag}.png`), fullPage: false });
  }
  await ctx.close();
  return page;
}

(async () => {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--hide-scrollbars'] });
  for (const vp of VIEWPORTS) await runViewport(browser, vp);
  await runViewport(browser, VIEWPORTS[1], { reducedMotion: true });
  await runViewport(browser, VIEWPORTS[5], { reducedMotion: true });
  await browser.close();
  server.close();

  const pass = results.filter(r => r.pass).length;
  results.forEach(r => console.log((r.pass ? 'PASS ' : 'FAIL ') + r.name + (r.extra ? '  :: ' + r.extra : '')));
  console.log(`\nQA RESULT: ${pass} PASS / ${results.length - pass} FAIL  (total ${results.length})`);
  process.exit(results.some(r => !r.pass) ? 1 : 0);
})().catch(e => { console.error(e); try { server.close(); } catch (_) {} process.exit(2); });
