// =====================================================================
// UX-05 — diagnostics for the four motion defects.
//   A) FUSION-01 F02-28/29  hero pointer depth
//   B) FUSION-02 F01-04/05  scroll progress rail at the bottom
//   C) FUSION-02 F01-02     the rail's stacking
//   D) M2                   the reveal runtime stranding content
// usage: node scripts/qa/ux05-motion-probe.js
// =====================================================================
const puppeteer = require('puppeteer-core');
const http = require('http');
const fs = require('fs');
const path = require('path');

const CHROME = process.env.CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT = path.join(__dirname, '..', '..');
const PORT = 8240;
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

const STAGE_ITEMS = [
  { id: 's1', name: 'Tai nghe chống ồn', price: 2500000, image: '', link: '', status: 'wish', priority: 'high', category: 'Công nghệ', note: '', createdAt: 1700000000000 },
  { id: 's2', name: 'Nồi chiên không dầu', price: 1900000, image: '', link: '', status: 'wish', priority: 'medium', category: 'Nhà cửa', note: '', createdAt: 1700000000001 },
  { id: 's3', name: 'Bàn phím cơ', price: 3200000, image: '', link: '', status: 'purchased', priority: 'low', category: 'Công nghệ', note: '', createdAt: 1700000000002 }
];

async function newPage(browser, w, h, items) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
  await page.evaluateOnNewDocument((s) => {
    try { localStorage.setItem('wishlist.guest.items', JSON.stringify(s)); } catch (e) {}
    // the FUSION-02 harness counts rAF requests — reproduce that here so a
    // late frame is visible
    window.__rafCount = 0;
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = function (cb) { window.__rafCount++; return raf(cb); };
  }, items || STAGE_ITEMS);
  await page.setRequestInterception(true);
  page.on('request', (r) => {
    if (/wishlist-cloud\.js/.test(r.url())) return r.respond({ status: 200, contentType: 'application/javascript', body: MOCK });
    return r.continue();
  });
  await page.goto(`http://127.0.0.1:${PORT}/wishlist.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#grid .wishlist-card', { timeout: 15000 });
  await sleep(1200);
  return { ctx, page };
}

(async () => {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--hide-scrollbars', '--force-device-scale-factor=1']
  });

  // =================================================================
  console.log('\n===== A) FUSION-01 F02-28/29 — hero pointer depth =====');
  {
    const { ctx, page } = await newPage(browser, 1440, 900);
    // count pointermove events that reach the hero
    await page.evaluate(() => {
      const hero = document.querySelector('.hero--v9');
      window.__heroMoves = 0;
      window.__lastMove = null;
      hero.addEventListener('pointermove', (e) => {
        window.__heroMoves++;
        window.__lastMove = { x: e.clientX, y: e.clientY, target: e.target.className || e.target.tagName };
      });
    });
    await page.evaluate(() => document.getAnimations().forEach(a => a.pause()));
    await page.evaluate(() => window.scrollTo(0, 260));
    await sleep(900);

    const heroBox = await page.evaluate(() => {
      const r = document.querySelector('.hero--v9').getBoundingClientRect();
      const hdr = document.querySelector('.site-header').getBoundingClientRect();
      const st = document.querySelector('.v9-scene');
      const sr = st ? st.getBoundingClientRect() : null;
      const pv = document.querySelector('.pv-stage');
      const pr = pv ? pv.getBoundingClientRect() : null;
      return {
        hero: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), bottom: Math.round(r.bottom) },
        header: { y: Math.round(hdr.y), h: Math.round(hdr.height), bottom: Math.round(hdr.bottom) },
        scene: sr ? { x: Math.round(sr.x), y: Math.round(sr.y), w: Math.round(sr.width), h: Math.round(sr.height), cx: Math.round(sr.x + sr.width / 2) } : null,
        stage: pr ? { x: Math.round(pr.x), y: Math.round(pr.y), w: Math.round(pr.width), h: Math.round(pr.height), cx: Math.round(pr.x + pr.width / 2) } : null,
        scrollY: Math.round(window.scrollY)
      };
    });
    console.log('hero box (viewport):', JSON.stringify(heroBox.hero));
    console.log('header box:', JSON.stringify(heroBox.header), ' scrollY:', heroBox.scrollY);
    console.log('.v9-scene box:', JSON.stringify(heroBox.scene));
    console.log('.pv-stage box:', JSON.stringify(heroBox.stage));

    const cx = Math.round(heroBox.hero.x + 300), cy = Math.round(heroBox.hero.y + 200);
    console.log('first mouse target :', cx + ',' + cy,
      ' -> over the header?', cy < heroBox.header.bottom);

    const hit1 = await page.evaluate(([x, y]) => {
      const el = document.elementFromPoint(x, y);
      return el ? el.tagName + '.' + String(el.className).slice(0, 40) : null;
    }, [cx, cy]);
    console.log('elementFromPoint  :', hit1);

    await page.mouse.move(cx, cy);
    await sleep(900);
    const s1 = await page.evaluate(() => {
      const ctr = (sel) => { const b = document.querySelector(sel).getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; };
      return {
        moves: window.__heroMoves,
        last: window.__lastMove,
        inline: document.querySelector('.hero--v9').style.getPropertyValue('--hero-pointer-x'),
        computed: getComputedStyle(document.querySelector('.hero--v9')).getPropertyValue('--hero-pointer-x').trim(),
        main: ctr('.pv-card--main'),
        side: ctr('.pv-card--a'),
        mainTx: getComputedStyle(document.querySelector('.pv-card--main')).translate,
        sideTx: getComputedStyle(document.querySelector('.pv-card--a')).translate
      };
    });
    console.log('after 1st move    :', JSON.stringify(s1));

    const cx2 = cx + 340, cy2 = cy + 160;
    const hit2 = await page.evaluate(([x, y]) => {
      const el = document.elementFromPoint(x, y);
      return el ? el.tagName + '.' + String(el.className).slice(0, 40) : null;
    }, [cx2, cy2]);
    console.log('second mouse target:', cx2 + ',' + cy2, ' -> elementFromPoint:', hit2,
      ' over the header?', cy2 < heroBox.header.bottom,
      ' over the hero?', cy2 < heroBox.hero.bottom && cy2 > heroBox.hero.y);

    await page.mouse.move(cx2, cy2);
    await sleep(900);
    const s2 = await page.evaluate(() => {
      const ctr = (sel) => { const b = document.querySelector(sel).getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; };
      return {
        moves: window.__heroMoves, last: window.__lastMove,
        inline: document.querySelector('.hero--v9').style.getPropertyValue('--hero-pointer-x'),
        computed: getComputedStyle(document.querySelector('.hero--v9')).getPropertyValue('--hero-pointer-x').trim(),
        main: ctr('.pv-card--main'), side: ctr('.pv-card--a'),
        mainTx: getComputedStyle(document.querySelector('.pv-card--main')).translate,
        sideTx: getComputedStyle(document.querySelector('.pv-card--a')).translate
      };
    });
    console.log('after 2nd move    :', JSON.stringify(s2));
    const translateOffset = (value) => {
      const match = String(value).match(/calc\([^)]*([+-])\s*([\d.]+)px\)/);
      return match ? (match[1] === '-' ? -1 : 1) * Number(match[2]) : 0;
    };
    console.log('pointer translation deltas =',
      'main ' + Math.abs(translateOffset(s2.mainTx) - translateOffset(s1.mainTx)).toFixed(2) + 'px,',
      'side ' + Math.abs(translateOffset(s2.sideTx) - translateOffset(s1.sideTx)).toFixed(2) + 'px');
    await ctx.close();
  }

  // =================================================================
  console.log('\n===== B) FUSION-02 F01-04/05 — scroll rail at the bottom =====');
  {
    // the FUSION-02 fixture: five items, two of them with data-URL images
    const dataImage = (label, a, b) => 'data:image/svg+xml;utf8,' + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="' + a + '"/><text x="40" y="300" fill="' + b + '">' + label + '</text></svg>');
    const F2_ITEMS = [
      { id: 'a1', name: 'Máy ảnh', price: 42000000, status: 'wish', priority: 'high', image: dataImage('IMG1', '#e6dcff', '#6850bc'), savedAmount: 27000000, savingGoal: 42000000, category: 'Nhiếp ảnh' },
      { id: 'a2', name: 'Tai nghe', price: 7490000, status: 'saving', priority: 'high', image: dataImage('IMG2', '#dff0ff', '#3a7bd5'), savedAmount: 1200000, savingGoal: 7490000, category: 'Âm thanh' },
      { id: 'a3', name: 'Giày chạy bộ', price: 2450000, status: 'ordered', priority: 'medium', image: dataImage('IMG3', '#cfe6ff', '#7fa8f0'), category: 'Giày' },
      { id: 'a4', name: 'Máy đọc sách', price: 3190000, status: 'purchased', priority: 'low', image: dataImage('IMG4', '#d9f2e4', '#7fcfae'), paidAmount: 3100000, purchasedAt: 1700000100000, previousStatus: 'wish', category: 'Sách' },
      { id: 'a5', name: 'Ống kính 50mm', price: 8900000, status: 'wish', priority: 'medium', image: '', category: 'Máy' }
    ];
    const { ctx, page } = await newPage(browser, 1440, 900, F2_ITEMS);
    const ratio = async (r) => {
      const before = await page.evaluate(() => window.__rafCount);
      await page.evaluate((rr) => {
        const doc = document.documentElement;
        const max = Math.max(0, doc.scrollHeight - window.innerHeight);
        window.scrollTo(0, Math.round(max * rr));
      }, r);
      await sleep(140);
      return page.evaluate((b) => {
        const doc = document.documentElement;
        const max = Math.max(1, doc.scrollHeight - window.innerHeight);
        const el = document.querySelector('.pv-progress__bar');
        const m = getComputedStyle(el).transform;
        return {
          y: Math.round(window.scrollY), max: Math.round(max),
          docH: doc.scrollHeight, innerH: window.innerHeight,
          inline: el.style.transform,
          transform: m,
          scale: m && m !== 'none' ? parseFloat(m.replace(/matrix3?d?\(/, '').replace(/\)/, '').split(',')[0]) : null,
          rafBefore: b, rafAfter: window.__rafCount
        };
      }, before);
    };
    const r0 = await ratio(0);
    console.log('ratio 0  :', JSON.stringify(r0));
    const r5 = await ratio(0.5);
    console.log('ratio 0.5:', JSON.stringify(r5));
    const r1 = await ratio(1);
    console.log('ratio 1  :', JSON.stringify(r1));
    await sleep(500);
    const r1b = await page.evaluate(() => {
      const el = document.querySelector('.pv-progress__bar');
      const m = getComputedStyle(el).transform;
      return { y: Math.round(window.scrollY), docH: document.documentElement.scrollHeight, inline: el.style.transform, transform: m };
    });
    console.log('ratio 1 +500ms:', JSON.stringify(r1b));
    const rail = await page.evaluate(() => {
      const el = document.querySelector('.pv-progress');
      const cs = getComputedStyle(el);
      return { z: cs.z, zIndex: cs.zIndex, position: cs.position, height: cs.height, pe: cs.pointerEvents };
    });
    console.log('rail computed:', JSON.stringify(rail));
    await ctx.close();
  }

  // =================================================================
  console.log('\n===== C) M2 — reveal runtime =====');
  {
    const { ctx, page } = await newPage(browser, 1280, 900);
    const before = await page.evaluate(() => ({
      sections: document.querySelectorAll('[data-dv-section]').length,
      pending: document.querySelectorAll('[data-dv-reveal]:not(.dv-reveal-in)').length,
      attrs: document.querySelectorAll('[data-dv-reveal]').length
    }));
    console.log('before scroll:', JSON.stringify(before));
    // scroll the whole document fast, in steps
    await page.evaluate(async () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      for (let i = 0; i <= 10; i++) {
        window.scrollTo(0, Math.round(max * (i / 10)));
        await new Promise(r => setTimeout(r, 60));
      }
    });
    await sleep(1200);
    const after = await page.evaluate(() => {
      const stranded = [...document.querySelectorAll('[data-dv-reveal]')].map(el => ({
        tag: el.tagName, cls: String(el.className).slice(0, 40),
        id: el.id, section: el.getAttribute('data-dv-section') !== null,
        top: Math.round(el.getBoundingClientRect().top),
        opacity: getComputedStyle(el).opacity
      }));
      return {
        pending: document.querySelectorAll('[data-dv-reveal]:not(.dv-reveal-in)').length,
        attrs: document.querySelectorAll('[data-dv-reveal]').length,
        invisibleSections: [...document.querySelectorAll('[data-dv-section]')].filter(c => Number(getComputedStyle(c).opacity) < 0.99).length,
        stranded
      };
    });
    console.log('after fast scroll:', JSON.stringify(after, null, 1));
    await ctx.close();
  }

  await browser.close();
  server.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
