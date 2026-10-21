// =====================================================================
// Redesign shots — real screenshots of the live app for BEFORE/AFTER.
//   Seeds a fixed dataset, then captures the collection in every view and
//   state at the five acceptance widths.
//
//   usage: node scripts/qa/redesign-shots.js <label>     e.g. before|after
//          node scripts/qa/redesign-shots.js probe
// =====================================================================
const puppeteer = require('puppeteer-core');
const http = require('http');
const fs = require('fs');
const path = require('path');

const CHROME = process.env.CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT = path.join(__dirname, '..', '..');
const PORT = 8282;
const OUT = process.env.RD_OUT ? path.resolve(process.env.RD_OUT) : path.join(ROOT, 'qa-out', 'redesign');
const LABEL = (process.argv[2] || 'before').replace(/[^a-z0-9_-]/gi, '');
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
  { name: 'Bàn phím cơ HI75C Pro', price: 1890000, image: imgData('HI75C Pro.webp'), status: 'wish', priority: 'high', category: 'Công nghệ', note: 'Bản núm xoay, switch linear. Chờ đợt sale 10.10.', goal: 1890000, saved: 900000 },
  { name: 'Nước hoa After Shave', price: 650000, image: imgData('After Shave.webp'), status: 'saving', priority: 'medium', category: 'Chăm sóc', note: 'Mùi gỗ nhẹ, dùng hằng ngày.', goal: 650000, saved: 240000 },
  { name: 'Chuột không dây Logitech M650', price: 650000, image: imgData('M650 Mouse.webp'), status: 'ordered', priority: 'low', category: 'Công nghệ', note: '', goal: 0, saved: 0 },
  { name: 'MacBook Air M2 13 inch', price: 22900000, image: imgData('Macbook.jpg'), status: 'wish', priority: 'high', category: 'Công nghệ', note: 'Bản 16GB/512GB, màu Midnight.', goal: 22900000, saved: 8200000 },
  { name: 'Sản phẩm chăm sóc da PreStyling', price: 450000, image: imgData('PreStyling-CLMenstore.jfif'), status: 'purchased', priority: 'low', category: 'Chăm sóc', note: '', goal: 0, saved: 0 },
  { name: 'Kem trị thâm mụn', price: 320000, image: imgData('Trị Thâm mụn.webp'), status: 'wish', priority: 'medium', category: 'Chăm sóc', note: 'Dùng buổi tối, tránh nắng ban ngày.', goal: 320000, saved: 120000 },
  { name: 'Đồng hồ thông minh Garmin Venu 3', price: 7490000, image: '', status: 'saving', priority: 'high', category: 'Thể thao', note: 'Theo dõi giấc ngủ và nhịp tim, pin 14 ngày.', goal: 7490000, saved: 2600000 },
  { name: 'Nồi chiên không dầu 5.5L', price: 2190000, image: '', status: 'purchased', priority: 'medium', category: 'Nhà cửa', note: '', goal: 0, saved: 0 }
];

const mk = (i) => {
  const s = SEED[i % SEED.length];
  return {
    id: 'rd-' + i,
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
  { w: 1024, h: 768, name: '1024' },
  { w: 768, h: 1024, name: '768' },
  { w: 390, h: 844, name: '390', touch: true },
  { w: 320, h: 568, name: '320', touch: true }
];

async function newPage(browser, vp, items) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: vp.w, height: vp.h, deviceScaleFactor: 1, isMobile: !!vp.touch, hasTouch: !!vp.touch });
  await page.evaluateOnNewDocument((s) => {
    try {
      localStorage.clear();
      localStorage.setItem('wishlist.guest.items', JSON.stringify(s));
    } catch (e) {}
  }, items);
  await page.setRequestInterception(true);
  page.on('request', (r) => {
    if (/wishlist-cloud\.js/.test(r.url())) {
      return r.respond({ status: 200, contentType: 'application/javascript', body: MOCK });
    }
    return r.continue();
  });
  page.on('dialog', async (d) => { try { await d.accept(); } catch (e) {} });
  await page.goto(`http://127.0.0.1:${PORT}/wishlist.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => {
    const g = document.getElementById('grid');
    const e = document.getElementById('empty');
    return g && (g.children.length > 0 || (e && !e.classList.contains('hidden')));
  }, { timeout: 20000 }).catch(() => {});
  await sleep(1500);
  // Product cards are revealed on scroll (data-dv-reveal). Walk the page once
  // so a screenshot of the whole collection shows every card, then return.
  await page.evaluate(async () => {
    const step = 400;
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 50));
    }
    window.scrollTo(0, 0);
  }).catch(() => {});
  await sleep(900);
  if (process.env.RD_DEBUG) {
    await page.addStyleTag({ content: process.env.RD_DEBUG }).catch(() => {});
    await sleep(300);
  }
  if (process.env.RD_DUMP) {
    const dump = await page.evaluate(() => {
      const pr = document.querySelector('#grid .product-card__price');
      if (!pr) return null;
      const s = getComputedStyle(pr);
      const chain = [];
      let el = pr;
      while (el && el !== document.body) {
        const cs = getComputedStyle(el);
        chain.push({
          tag: el.tagName, cls: (el.className || '').slice(0, 60),
          deco: cs.textDecorationLine, decoColor: cs.textDecorationColor,
          borderBottom: cs.borderBottomWidth + ' ' + cs.borderBottomStyle + ' ' + cs.borderBottomColor,
          bgImage: cs.backgroundImage.slice(0, 40), boxShadow: cs.boxShadow.slice(0, 40),
          after: getComputedStyle(el, '::after').content
        });
        el = el.parentElement;
      }
      return { html: pr.outerHTML, chain };
    });
    console.log(JSON.stringify(dump, null, 2));
    const lineProbe = await page.evaluate(() => {
      const content = document.querySelector('#grid .product-card__content');
      const r = content.getBoundingClientRect();
      const out = [];
      for (let dy = 0; dy < r.height; dy += 1) {
        const els = document.elementsFromPoint(Math.round(r.left + 40), Math.round(r.top + dy));
        const hit = els.find((el) => {
          const s = getComputedStyle(el);
          return /solid/.test(s.borderBottomStyle) || /solid/.test(s.borderTopStyle) || s.backgroundImage !== 'none' || s.boxShadow !== 'none';
        });
        if (hit) {
          const s = getComputedStyle(hit);
          out.push({ dy, tag: hit.tagName, cls: (hit.className || '').slice(0, 40), bb: s.borderBottomWidth + '/' + s.borderBottomStyle, bt: s.borderTopWidth + '/' + s.borderTopStyle, bg: s.backgroundImage.slice(0, 30) });
        }
      }
      return { rect: [r.left, r.top, r.width, r.height], hits: out.slice(0, 20) };
    });
    console.log(JSON.stringify(lineProbe, null, 2));
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 4 });
    await page.evaluate(() => {
      const el = document.querySelector('#grid .product-card__price');
      if (el) el.scrollIntoView({ block: 'center' });
    });
    await sleep(400);
    const prEl = await page.$('#grid .product-card__price');
    if (prEl) await prEl.screenshot({ path: path.join(OUT, 'price-zoom.png') }).catch(() => {});
    const bodyEl = await page.$('#grid .product-card__content');
    if (bodyEl) await bodyEl.screenshot({ path: path.join(OUT, 'body-zoom.png') }).catch(() => {});
  }
  return { ctx, page };
}

const shotOf = async (page, sel, file) => {
  if (sel) {
    const el = await page.$(sel);
    if (!el) return false;
    await el.screenshot({ path: file });
    return true;
  }
  await page.screenshot({ path: file });
  return true;
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--force-device-scale-factor=1']
  });

  if (LABEL === 'probe') {
    const { ctx, page } = await newPage(browser, VIEWPORTS[0], Array.from({ length: 8 }, (_, i) => mk(i)));
    const info = await page.evaluate(() => {
      const g = document.getElementById('grid');
      const card = g && g.firstElementChild;
      const wrapper = card ? card.parentElement : null;
      const cs = (el) => { if (!el) return null; const s = getComputedStyle(el); return { display: s.display, gridTemplateColumns: s.gridTemplateColumns, gap: s.gap, width: s.width, padding: s.padding, borderRadius: s.borderRadius, background: s.backgroundColor, boxShadow: s.boxShadow, font: s.fontFamily }; };
      const rules = [];
      for (const sheet of Array.from(document.styleSheets)) {
        let rs;
        try { rs = sheet.cssRules; } catch (e) { continue; }
        for (const r of Array.from(rs || [])) {
          if (!r.selectorText) continue;
          if (!/\.card|\.wishlist-card|#grid/.test(r.selectorText)) continue;
          const t = r.style && r.style.cssText ? r.style.cssText : '';
          if (/grid-column|grid-template-columns|(^|;)\s*width:/.test(t)) {
            rules.push({ file: (sheet.href || '').split('/').pop(), selector: r.selectorText.slice(0, 160), css: t.slice(0, 220) });
          }
        }
      }
      return {
        title: document.title,
        gridViewAttr: g ? g.getAttribute('data-v13-view') : null,
        cardGridColumn: card ? getComputedStyle(card).gridColumn : null,
        spanRules: (() => {
          if (!card) return [];
          const out = [];
          for (const sheet of Array.from(document.styleSheets)) {
            let rs;
            try { rs = sheet.cssRules; } catch (e) { continue; }
            for (const r of Array.from(rs || [])) {
              if (!r.selectorText || !r.style) continue;
              if (!/grid-column/.test(r.style.cssText)) continue;
              let hit = false;
              for (const sel of r.selectorText.split(',')) {
                try { if (card.matches(sel.trim())) { hit = true; break; } } catch (e) {}
              }
              if (hit) out.push({ file: (sheet.href || '').split('/').pop(), selector: r.selectorText.slice(0, 200), css: r.style.cssText.slice(0, 160) });
            }
          }
          return out;
        })(),
        layoutRules: rules.slice(0, 40),
        grid: cs(g),
        gridClass: g ? g.className : null,
        cardOuter: card ? card.outerHTML.slice(0, 2500) : null,
        cardRect: card ? card.getBoundingClientRect().toJSON() : null,
        cardStyle: cs(card),
        collectionSection: (() => {
          let el = g; while (el && el.tagName !== 'SECTION' && el.tagName !== 'MAIN') el = el.parentElement;
          return el ? { tag: el.tagName, id: el.id, cls: el.className, style: cs(el) } : null;
        })(),
        toolbarCandidates: Array.from(document.querySelectorAll('[class*=filter], [class*=toolbar], [class*=rail], [class*=control]')).slice(0, 20).map((e) => ({ tag: e.tagName, id: e.id, cls: e.className })),
        viewButtons: Array.from(document.querySelectorAll('[data-view], [data-mode], .view-btn, #viewGrid, #viewFocus, #viewBoard')).map((e) => ({ id: e.id, cls: e.className, text: e.textContent.trim().slice(0, 20), active: e.getAttribute('aria-pressed') || e.className }))
      };
    });
    fs.writeFileSync(path.join(OUT, 'probe.json'), JSON.stringify(info, null, 2));
    console.log(JSON.stringify(info, null, 2).slice(0, 6000));
    await ctx.close();
    await browser.close(); server.close(); return;
  }

  const dir = path.join(OUT, LABEL);
  fs.mkdirSync(dir, { recursive: true });
  const manifest = [];
  const vps = process.env.RD_ONLY ? VIEWPORTS.filter((v) => v.name === process.env.RD_ONLY) : VIEWPORTS;
  for (const vp of vps) {
    // populated
    {
      const { ctx, page } = await newPage(browser, vp, Array.from({ length: 8 }, (_, i) => mk(i)));
      await shotOf(page, null, path.join(dir, `full-${vp.name}.png`));
      await shotOf(page, '#collection', path.join(dir, `toolbar-${vp.name}.png`));
      await page.evaluate(() => {
        const el = document.querySelector('#collection');
        if (el) window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 160);
      });
      await sleep(700);
      await shotOf(page, null, path.join(dir, `collection-${vp.name}.png`));
      await shotOf(page, '#grid', path.join(dir, `grid-${vp.name}.png`));
      await page.evaluate(() => window.scrollTo(0, document.scrollingElement.scrollHeight));
      await sleep(700);
      await shotOf(page, null, path.join(dir, `bottom-${vp.name}.png`));
      manifest.push(`${vp.name}: full, collection, grid, bottom`);
      await ctx.close();
    }
    // empty state
    {
      const { ctx, page } = await newPage(browser, vp, []);
      await page.evaluate(() => {
        const el = document.querySelector('#collection');
        if (el) window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 160);
      });
      await sleep(700);
      await shotOf(page, null, path.join(dir, `empty-${vp.name}.png`));
      await ctx.close();
    }
  }

  // desktop interactions: views + quick view
  if (!process.env.RD_ONLY) {
    const { ctx, page } = await newPage(browser, VIEWPORTS[0], Array.from({ length: 8 }, (_, i) => mk(i)));
    for (const view of ['focus', 'board', 'gallery']) {
      const id = { focus: 'v13FocusView', board: 'v13BoardView', gallery: 'v13GridView' }[view];
      await page.evaluate((buttonId) => {
        const b = document.getElementById(buttonId);
        if (b) b.click();
      }, id);
      await sleep(900);
      await page.evaluate(() => {
        const el = document.querySelector('#collection');
        if (el) window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 160);
      });
      await sleep(600);
      await shotOf(page, null, path.join(dir, `view-${view}-1440.png`));
    }
    // open quick view on the first card action
    const opened = await page.evaluate(() => {
      const card = document.querySelector('#grid > *');
      if (!card) return null;
      const b = card.querySelector('[data-action="quick-view"], .qv-open, [aria-label*="Xem"], button');
      if (b) { b.click(); return b.textContent.trim().slice(0, 30); }
      return null;
    });
    await sleep(1200);
    await shotOf(page, null, path.join(dir, 'quick-view-1440.png'));
    manifest.push(`quick-view opened: ${opened}`);
    await ctx.close();
  }

  fs.writeFileSync(path.join(dir, 'manifest.txt'), manifest.join('\n'));
  console.log(`shots -> ${dir}`);
  console.log(manifest.join('\n'));
  await browser.close();
  server.close();
})().catch((e) => { console.error(e); process.exit(1); });
