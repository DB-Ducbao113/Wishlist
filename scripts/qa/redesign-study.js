// =====================================================================
// Redesign study — read the reference prototype with a real browser.
//   Produces screenshots and computed metrics for the reference file and
//   (optionally) the live app, so BEFORE/AFTER and prototype/live can be
//   compared on the same footing.
//
//   usage: node scripts/qa/redesign-study.js
// =====================================================================
const puppeteer = require('puppeteer-core');
const http = require('http');
const fs = require('fs');
const path = require('path');

const CHROME = process.env.CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT = path.join(__dirname, '..', '..');
const PORT = 8281;
const OUT = path.join(ROOT, 'qa-out', 'redesign');
const REF = '/references/someday-vault-motion-reference.html';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.jfif': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = REF;
  const f = path.join(ROOT, p);
  fs.readFile(f, (e, d) => {
    if (e) { res.writeHead(404); return res.end('nf'); }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    res.end(d);
  });
});

const VIEWPORTS = [
  { w: 1440, h: 900, name: '1440' },
  { w: 1024, h: 768, name: '1024' },
  { w: 768, h: 1024, name: '768' },
  { w: 390, h: 844, name: '390', touch: true },
  { w: 320, h: 568, name: '320', touch: true }
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// CSS declarations of a selector, straight from the prototype's own sheet.
const cssFor = (doc, selector) => doc.querySelector(selector);

async function metrics(page) {
  return page.evaluate(() => {
    const cs = (el) => (el ? getComputedStyle(el) : null);
    const pick = (el, props) => {
      const s = cs(el);
      if (!s) return null;
      const o = {};
      props.forEach((p) => { o[p] = s.getPropertyValue(p); });
      return o;
    };
    const root = getComputedStyle(document.documentElement);
    const vars = {};
    for (let i = 0; i < root.length; i++) {
      const p = root[i];
      if (p.startsWith('--')) vars[p] = root.getPropertyValue(p).trim();
    }
    const card = document.querySelector('#grid .card');
    const box = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y) };
    };
    return {
      viewport: { w: innerWidth, h: innerHeight, dpr: devicePixelRatio },
      docWidth: document.documentElement.scrollWidth,
      vars,
      body: pick(document.body, ['background-color', 'color', 'font-family', 'font-size', 'line-height']),
      nav: {
        box: box(document.querySelector('header, nav')),
        inner: pick(document.querySelector('header, nav'), ['height', 'background', 'backdrop-filter', 'border-bottom', 'position']),
        links: Array.from(document.querySelectorAll('header a, nav a')).slice(0, 8).map((a) => ({
          text: a.textContent.trim().replace(/\s+/g, ' ').slice(0, 30),
          size: getComputedStyle(a).fontSize,
          weight: getComputedStyle(a).fontWeight,
          padding: getComputedStyle(a).padding
        }))
      },
      type: {
        h1: pick(document.querySelector('h1'), ['font-size', 'font-weight', 'line-height', 'letter-spacing', 'font-family']),
        h2: pick(document.querySelector('h2'), ['font-size', 'font-weight', 'line-height', 'letter-spacing']),
        h3: pick(document.querySelector('.card h3, h3'), ['font-size', 'font-weight', 'line-height']),
        body: pick(document.querySelector('.lede, p'), ['font-size', 'line-height', 'color'])
      },
      toolbar: {
        box: box(document.querySelector('.toolbar')),
        style: pick(document.querySelector('.toolbar'), ['display', 'grid-template-columns', 'gap', 'padding', 'background', 'border', 'border-radius', 'backdrop-filter']),
        fields: Array.from(document.querySelectorAll('.toolbar .field')).map((f) => ({
          label: f.querySelector('label') ? f.querySelector('label').textContent.trim() : '',
          box: box(f),
          input: pick(f.querySelector('input, select'), ['font-size', 'height', 'padding', 'border-radius', 'background', 'border', 'color'])
        }))
      },
      summary: {
        box: box(document.querySelector('.summary-line')),
        style: pick(document.querySelector('.summary-line'), ['display', 'justify-content', 'font-size', 'color', 'padding'])
      },
      grid: {
        box: box(document.querySelector('#grid')),
        style: pick(document.querySelector('#grid'), ['display', 'grid-template-columns', 'gap'])
      },
      card: {
        box: box(card),
        style: pick(card, ['display', 'background', 'border', 'border-radius', 'box-shadow', 'overflow', 'transform', 'grid-template-columns']),
        thumb: pick(document.querySelector('#grid .thumb'), ['height', 'aspect-ratio', 'border-radius', 'background']),
        title: pick(document.querySelector('#grid .card h3'), ['font-size', 'font-weight', 'line-height', 'margin']),
        price: pick(document.querySelector('#grid .price'), ['font-size', 'font-weight', 'color', 'letter-spacing']),
        cat: pick(document.querySelector('#grid .cat'), ['font-size', 'color']),
        chip: pick(document.querySelector('#grid .chip'), ['font-size', 'padding', 'border-radius', 'background', 'color']),
        body: pick(document.querySelector('#grid .card-body'), ['padding', 'gap', 'display'])
      },
      sections: Array.from(document.querySelectorAll('section')).map((s) => ({
        id: s.id, box: box(s), padding: getComputedStyle(s).padding
      }))
    };
  });
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--force-device-scale-factor=1']
  });
  const report = { reference: REF, generatedAt: new Date().toISOString(), viewports: {} };

  for (const vp of VIEWPORTS) {
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    await page.setViewport({
      width: vp.w, height: vp.h, deviceScaleFactor: 1,
      isMobile: !!vp.touch, hasTouch: !!vp.touch
    });
    await page.goto(`http://127.0.0.1:${PORT}${REF}`, { waitUntil: 'networkidle2', timeout: 60000 });
    await sleep(1200);

    const dir = path.join(OUT, 'prototype');
    fs.mkdirSync(dir, { recursive: true });
    await page.screenshot({ path: path.join(dir, `full-${vp.name}.png`), fullPage: false });
    for (const id of ['overview', 'collection']) {
      const el = await page.$(`#${id}`);
      if (el) {
        try { await el.screenshot({ path: path.join(dir, `${id}-${vp.name}.png`) }); } catch (e) { /* offscreen */ }
      }
    }
    report.viewports[vp.name] = await metrics(page);
    await ctx.close();
  }

  fs.writeFileSync(path.join(OUT, 'prototype-metrics.json'), JSON.stringify(report, null, 2));
  console.log(`prototype metrics -> ${path.join(OUT, 'prototype-metrics.json')}`);
  await browser.close();
  server.close();
})().catch((e) => { console.error(e); process.exit(1); });
