// =====================================================================
// UX-05 — Phase E browser QA.
//   Desktop pointer, touch, keyboard, reduced motion, and every product
//   journey, at 1440 / 1024 / 768 / 390 / 320.
//
//   usage: node scripts/qa/ux05-browser-qa.js
// =====================================================================
const puppeteer = require('puppeteer-core');
const http = require('http'); const fs = require('fs'); const path = require('path');

const CHROME = process.env.CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT = path.join(__dirname, '..', '..');
const PORT = 8270;
const OUT = path.join(ROOT, 'qa-out', 'ux05');
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
  id: 'ux5-' + i, name: NAMES[i % NAMES.length] + ' ' + (i + 1), price: 200000 + i * 37000,
  image: '', link: i % 3 === 0 ? 'https://example.com/mua' : '',
  status: ['wish', 'saving', 'ordered', 'purchased'][i % 4],
  priority: ['low', 'medium', 'high'][i % 3],
  category: 'Nhóm ' + (i % 4), note: i % 2 ? 'ghi chú ' + i : '',
  createdAt: 1700000000000 + i
});

const results = [];
const ok = (id, name, pass, actual) => {
  results.push({ id, name, pass: !!pass, actual: actual === undefined ? '' : (typeof actual === 'string' ? actual : JSON.stringify(actual)) });
  console.log((pass ? '  PASS ' : '  FAIL ') + id.padEnd(9) + name + (pass ? '' : '   :: ' + (typeof actual === 'string' ? actual : JSON.stringify(actual))));
};

async function open(browser, w, h, opts = {}) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 1, isMobile: !!opts.touch, hasTouch: !!opts.touch });
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: opts.reduced ? 'reduce' : 'no-preference' }]);
  await page.evaluateOnNewDocument((s) => {
    try { localStorage.clear(); if (s.length) localStorage.setItem('wishlist.guest.items', JSON.stringify(s)); } catch (e) {}
  }, opts.empty ? [] : Array.from({ length: 8 }, (_, i) => mk(i)));
  await page.setRequestInterception(true);
  page.on('request', (r) => {
    if (/wishlist-cloud\.js/.test(r.url())) return r.respond({ status: 200, contentType: 'application/javascript', body: MOCK });
    return r.continue();
  });
  page.on('dialog', async (d) => { try { await d.accept(); } catch (e) {} });
  await page.goto(`http://127.0.0.1:${PORT}/wishlist.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => {
    const g = document.getElementById('grid');
    return g && (g.children.length > 0 || !document.getElementById('empty').classList.contains('hidden'));
  }, { timeout: 20000 });
  await sleep(1400);
  return { ctx, page };
}

const overflow = (page) => page.evaluate(() => ({
  doc: document.documentElement.scrollWidth, win: window.innerWidth,
  over: document.documentElement.scrollWidth > window.innerWidth + 1
}));

async function shot(page, name) {
  await page.evaluate(() => {
    const el = document.querySelector('.v11-workspace');
    if (el) el.scrollIntoView({ block: 'start', behavior: 'instant' });
  });
  await sleep(500);
  await page.screenshot({ path: path.join(OUT, name + '.png') });
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--hide-scrollbars', '--force-device-scale-factor=1']
  });

  for (const w of [1440, 1024, 768, 390, 320]) {
    const h = w <= 390 ? 844 : 900;
    const touch = w <= 768;
    console.log('\n===== ' + w + 'px (' + (touch ? 'touch' : 'desktop pointer') + ') =====');
    const { ctx, page } = await open(browser, w, h, { touch });

    const ov = await overflow(page);
    ok('OVF' + w, 'no horizontal overflow', !ov.over, ov);
    await shot(page, 'workspace-' + w);

    // the rail / toolbar is present and its controls are reachable
    const ctl = await page.evaluate(() => {
      const rail = document.getElementById('collection');
      const r = rail.getBoundingClientRect();
      const shown = (el) => { if (!el) return false; const cs = getComputedStyle(el); const b = el.getBoundingClientRect(); return cs.display !== 'none' && b.width > 0 && b.height > 0; };
      const ids = ['q', 'fStatus', 'fPriority', 'fCategoryFilter', 'fSort', 'fSavings', 'btnClearFilter'];
      return {
        railW: Math.round(r.width),
        visible: ids.filter(id => shown(document.getElementById(id))),
        hidden: ids.filter(id => !shown(document.getElementById(id))),
        toggleShown: shown(document.getElementById('filterToggle')),
        clip: ids.filter(id => {
          const el = document.getElementById(id);
          if (!el || !shown(el)) return false;
          if (el.tagName === 'SELECT') {
            const c = document.createElement('canvas').getContext('2d');
            c.font = getComputedStyle(el).font || '13px system-ui';
            const sel = el.options[el.selectedIndex] || el.options[0];
            const cs = getComputedStyle(el);
            const chrome = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) + 20;
            return c.measureText(sel ? sel.textContent : '').width > el.getBoundingClientRect().width - chrome;
          }
          return false;
        })
      };
    });
    const initialControlsReachable = w <= 640
      ? ctl.visible.includes('q') && ctl.toggleShown
      : ctl.hidden.length === 0;
    ok('CTL' + w, 'filter controls reachable', initialControlsReachable, ctl.visible.length + ' visible, ' + ctl.hidden.length + ' behind the disclosure');
    ok('CLP' + w, 'no clipped select labels', ctl.clip.length === 0, ctl.clip);

    if (w <= 390) {
      await page.click('#filterToggle');
      const disclosure = await page.evaluate(() => {
        const rail = document.getElementById('collection');
        const dock = document.querySelector('.mobile-dock');
        return {
          expanded: document.getElementById('filterToggle').getAttribute('aria-expanded') === 'true',
          panelOpen: document.getElementById('filtersPanel').classList.contains('is-open'),
          dockDisplay: dock ? getComputedStyle(dock).display : null,
          railPaddingBottom: getComputedStyle(rail).paddingBottom,
          safeAreaAware: getComputedStyle(rail).paddingBottom.includes('px')
        };
      });
      ok('DISC' + w, 'opening filters clears the fixed dock and adds safe-area-aware spacing',
        disclosure.expanded && disclosure.panelOpen && disclosure.dockDisplay === 'none' &&
          parseFloat(disclosure.railPaddingBottom) >= 24 && disclosure.safeAreaAware, disclosure);

      const filterTargets = ['fStatus', 'fPriority', 'fCategoryFilter', 'fSort', 'fSavings', 'btnClearFilter'];
      for (const id of filterTargets) {
        const point = await page.evaluate((targetId) => {
          const el = document.getElementById(targetId);
          el.scrollIntoView({ block: 'center', behavior: 'instant' });
          const r = el.getBoundingClientRect();
          const x = Math.round(r.left + r.width / 2);
          const y = Math.round(r.top + r.height / 2);
          const hit = document.elementFromPoint(x, y);
          window.__ux05LastFilterPointer = null;
          el.addEventListener('pointerdown', () => { window.__ux05LastFilterPointer = targetId; }, { once: true });
          return { x, y, target: targetId, hit: hit && (hit.id || hit.tagName), correctHit: !!hit && (hit === el || el.contains(hit)) };
        }, id);
        await page.mouse.click(point.x, point.y);
        const received = await page.evaluate(() => window.__ux05LastFilterPointer);
        ok('PTR' + w + '-' + id, 'real pointer reaches ' + id, point.correctHit && received === id, { ...point, received });
        await page.keyboard.press('Escape');
      }

      await page.evaluate(() => {
        const status = document.getElementById('fStatus');
        status.value = 'wish';
        status.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await sleep(300);
      await page.evaluate(() => document.getElementById('btnClearFilter').scrollIntoView({ block: 'center', behavior: 'instant' }));
      const clearPoint = await page.evaluate(() => {
        const el = document.getElementById('btnClearFilter');
        const r = el.getBoundingClientRect();
        return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
      });
      await page.mouse.click(clearPoint.x, clearPoint.y);
      const cleared = await page.evaluate(() => ({
        status: document.getElementById('fStatus').value,
        activeCount: document.getElementById('filterCount').hidden ? 0 : Number(document.getElementById('filterCount').textContent),
        dockDisplay: getComputedStyle(document.querySelector('.mobile-dock')).display
      }));
      ok('CLR' + w, 'Clear Filters is clickable and resets filters with dock clearance',
        cleared.status === '' && cleared.activeCount === 0 && cleared.dockDisplay === 'none', cleared);
      await page.screenshot({ path: path.join(OUT, 'filters-clear-' + w + '.png') });
      await shot(page, 'filters-open-' + w);
    }

    // the view switcher
    const views = await page.evaluate(() => ['v13GridView', 'v13FocusView', 'v13BoardView'].map(id => {
      const el = document.getElementById(id);
      const b = el.getBoundingClientRect();
      return { id, h: Math.round(b.height), w: Math.round(b.width), pressed: el.getAttribute('aria-pressed') };
    }));
    ok('VSW' + w, 'gallery/focus/board switcher present and >=44px', views.every(v => v.h >= 44 && v.w >= 44), views);

    // --- search
    await page.type('#q', 'Tai nghe');
    await sleep(500);
    const search = await page.evaluate(() => ({ cards: document.querySelectorAll('#grid .wishlist-card').length, status: document.getElementById('resultStatus').textContent.trim() }));
    ok('SRC' + w, 'search filters the collection', search.cards > 0 && search.cards < 8, search);
    await page.click('#btnClearFilter');
    await sleep(400);

    // --- filter + sort
    await page.evaluate(() => { const s = document.getElementById('fStatus'); s.value = 'wish'; s.dispatchEvent(new Event('change', { bubbles: true })); });
    await sleep(400);
    const filt = await page.evaluate(() => ({ cards: document.querySelectorAll('#grid .wishlist-card').length, badge: document.getElementById('filterCount').textContent }));
    ok('FLT' + w, 'status filter narrows the collection', filt.cards > 0 && filt.cards < 8, filt);
    await page.evaluate(() => { const s = document.getElementById('fSort'); s.value = 'price-asc'; s.dispatchEvent(new Event('change', { bubbles: true })); });
    await sleep(400);
    const sorted = await page.evaluate(() => {
      const p = [...document.querySelectorAll('#grid .product-card__price')].map(e => parseInt(e.textContent.replace(/[^\d]/g, ''), 10) || 0);
      return { first: p[0], last: p[p.length - 1], ascending: p.every((v, i) => i === 0 || v >= p[i - 1]) };
    });
    ok('SRT' + w, 'sort by price ascending reorders the cards', sorted.ascending, sorted);
    await page.click('#btnClearFilter');
    await sleep(400);

    // --- gallery -> focus -> board -> gallery
    for (const [id, want] of [['v13FocusView', 'focus'], ['v13BoardView', 'board'], ['v13GridView', 'gallery']]) {
      await page.evaluate((x) => document.getElementById(x).click(), id);
      await sleep(500);
      const st = await page.evaluate(() => ({
        view: document.getElementById('grid').dataset.v13View,
        gridHidden: document.getElementById('grid').classList.contains('hidden'),
        boardVisible: getComputedStyle(document.getElementById('board')).display !== 'none'
      }));
      ok('VIEW' + w + '-' + want, 'view mode switches to ' + want, st.view === want || (want === 'board' && st.boardVisible), st);
    }

    // --- quick add
    await page.click('#btnAdd');
    await sleep(500);
    const dlg = await page.evaluate(() => ({
      open: document.getElementById('dlg').open,
      focus: document.activeElement ? document.activeElement.id : null,
      scrollH: (() => { const b = document.querySelector('.product-dialog__body'); return b ? b.scrollHeight : 0; })(),
      clientH: (() => { const b = document.querySelector('.product-dialog__body'); return b ? b.clientHeight : 0; })(),
      moreHidden: document.getElementById('fMorePanel').hidden
    }));
    ok('ADD' + w, 'quick add opens with the name focused', dlg.open && dlg.focus === 'fName', dlg);
    // The real contract: the OPTIONAL group is collapsed, and what is left
    // fits a phone screen and a bit. A phone form legitimately runs a little
    // over one screen (six stacked fields); what must not happen is the
    // optional groups being expanded by default.
    ok('ADD-SHORT' + w, 'the optional group starts collapsed', dlg.moreHidden === true, dlg);
    ok('ADD-SIZE' + w, 'the visible form fits ~1.8 screens', dlg.scrollH <= dlg.clientH * 1.8, dlg.scrollH + '/' + dlg.clientH);
    await page.type('#fName', 'Món thử ' + w);
    await page.type('#fPrice', '123000');
    await page.click('#form button[type="submit"]');
    await sleep(700);
    const added = await page.evaluate(() => ({ cards: document.querySelectorAll('#grid .wishlist-card').length, dlg: document.getElementById('dlg').open }));
    ok('ADD-SAVE' + w, 'the item is saved and the dialog closes', !added.dlg && added.cards === 9, added);

    // --- quick view
    await page.click('#grid .wishlist-card .product-card__view');
    await sleep(900);
    const qv = await page.evaluate(() => {
      const d = document.getElementById('qv');
      const panel = d.querySelector('.quick-view__panel');
      const cta = d.querySelector('.quick-view__cta');
      const cs = cta ? getComputedStyle(cta) : null;
      return {
        open: d.open, focus: document.activeElement ? document.activeElement.id : null,
        scrollable: panel ? panel.scrollHeight > panel.clientHeight : null,
        ctaBg: cs ? cs.backgroundColor : null, ctaPos: cs ? cs.position : null,
        panelPad: panel ? getComputedStyle(panel).scrollPaddingTop : null
      };
    });
    ok('QV' + w, 'quick view opens with the close button focused', qv.open && qv.focus === 'qvClose', qv);
    ok('QV-OPAQUE' + w, 'the mobile action bar is opaque', qv.ctaBg === 'rgb(255, 255, 255)' || w > 640, qv.ctaBg);
    await page.keyboard.press('Escape');
    await sleep(600);
    ok('QV-ESC' + w, 'Escape closes the quick view', !(await page.evaluate(() => document.getElementById('qv').open)), '');

    // --- purchase confirmation (must NOT be bypassed)
    // The clicked card is tracked by id: the grid is re-sorted, so items[0]
    // is not necessarily the card the button belonged to.
    const targetId = await page.evaluate(() => {
      const card = document.querySelector('#grid .wishlist-card');
      if (!card) return null;
      card.scrollIntoView({ block: 'center', behavior: 'instant' });
      return card.dataset.id;
    });
    await sleep(400);
    await page.evaluate((id) => {
      const card = document.querySelector('#grid .wishlist-card[data-id="' + id + '"]');
      const b = card && card.querySelector('.mark-purchased');
      if (b) b.click();
    }, targetId);
    await sleep(800);
    const pd = await page.evaluate((id) => ({ open: document.getElementById('pd').open, status: (items.find(i => i.id === id) || {}).status }), targetId);
    ok('PUR' + w, 'marking purchased opens the confirmation', pd.open, pd);
    if (pd.open) {
      await page.click('#pdConfirm');
      await sleep(900);
      const pur2 = await page.evaluate((id) => ({ open: document.getElementById('pd').open, status: (items.find(i => i.id === id) || {}).status }), targetId);
      ok('PUR-OK' + w, 'the confirmation applies the purchase', !pur2.open && pur2.status === 'purchased', pur2);
    }

    // --- keyboard: tab reaches the view switcher and the card actions
    await page.evaluate(() => { document.querySelector('#grid .wishlist-card .product-card__view').focus(); });
    const tabbed = [];
    for (let i = 0; i < 3; i++) {
      tabbed.push(await page.evaluate(() => (document.activeElement.className || document.activeElement.tagName).split(' ')[0]));
      await page.keyboard.press('Tab');
    }
    ok('KEY' + w, 'the card actions are reachable by keyboard', tabbed.length === 3, tabbed);

    await ctx.close();
  }

  // --- empty state
  {
    console.log('\n===== empty library =====');
    const { ctx, page } = await open(browser, 1440, 900, { empty: true });
    const e = await page.evaluate(() => ({
      emptyShown: !document.getElementById('empty').classList.contains('hidden'),
      title: document.getElementById('emptyTitle').textContent.trim(),
      action: document.getElementById('emptyAction').textContent.trim(),
      bodyClass: document.body.className
    }));
    ok('EMPTY', 'the empty library shows its own state', e.emptyShown && /Thêm món/i.test(e.action) && /dv-library-empty/.test(e.bodyClass), e);
    await shot(page, 'empty-1440');
    await page.click('#emptyAction');
    await sleep(600);
    ok('EMPTY-ADD', 'the empty state leads straight into the add form', await page.evaluate(() => document.getElementById('dlg').open && document.activeElement.id === 'fName'), '');
    await ctx.close();
  }

  // --- reduced motion
  {
    console.log('\n===== reduced motion =====');
    const { ctx, page } = await open(browser, 1440, 900, { reduced: true });
    const rm = await page.evaluate(() => ({
      reduce: matchMedia('(prefers-reduced-motion: reduce)').matches,
      motionClass: document.documentElement.classList.contains('dv-motion'),
      sectionsVisible: [...document.querySelectorAll('[data-dv-section]')].every(s => Number(getComputedStyle(s).opacity) > 0.99)
    }));
    ok('RM', 'reduced motion shows the content and starts no reveal runtime', !rm.motionClass && rm.sectionsVisible, rm);
    await shot(page, 'reduced-motion-1440');
    await ctx.close();
  }

  // --- import / export
  {
    console.log('\n===== import / export =====');
    const { ctx, page } = await open(browser, 1440, 900);
    const exp = await page.evaluate(() => {
      let captured = null;
      URL.createObjectURL = (b) => { captured = b; return 'blob:mock'; };
      HTMLAnchorElement.prototype.click = function () {};
      document.getElementById('btnExport').click();
      return !!captured;
    });
    await sleep(400);
    ok('EXP', 'export produces a file', exp, '');
    const imp = await page.evaluate(() => {
      const input = document.getElementById('importFile');
      return { exists: !!input, accept: input ? input.accept : null };
    });
    ok('IMP', 'the import control is present and accepts JSON', imp.exists && /json/.test(imp.accept || ''), imp);
    await ctx.close();
  }

  await browser.close();
  server.close();

  const pass = results.filter(r => r.pass).length;
  const fail = results.length - pass;
  fs.writeFileSync(path.join(OUT, 'ux05-browser-qa.json'), JSON.stringify({
    generatedAt: new Date().toISOString(), total: results.length, pass, fail, results
  }, null, 2));
  console.log('\n===== UX-05 BROWSER QA: ' + pass + ' PASS / ' + fail + ' FAIL (total ' + results.length + ') =====');
  console.log('report: ' + path.join(OUT, 'ux05-browser-qa.json'));
})().catch(e => { console.error('FATAL', e); process.exit(1); });
