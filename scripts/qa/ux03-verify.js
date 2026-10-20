// =====================================================================
// UX-03 VERIFICATION — Collection Workspace integrity gate.
// ---------------------------------------------------------------------
// Serves the real repo, stubs ONLY the cloud module, then:
//   A) inventories the filter controls and proves which element the app
//      actually reads versus which one a user can touch at each
//      breakpoint (RUNTIME evidence, not inspection),
//   B) audits the collection layout for overflow / overlap / hidden or
//      unpopulated controls at 1440 / 1024 / 768 / 390 / 320,
//   C) drives the real interactions: add, search, filter, sort, view
//      switch, quick view, status change, clear filters, and both
//      empty states (empty library vs zero search results),
//   D) repeats the F1 VIEW-01 view-switch assertion 10x.
//
// Screenshots: scripts/qa/ux03-shots.js (writes to qa-out/ux03/).
//
// usage: node scripts/qa/ux03-verify.js
// =====================================================================
const puppeteer = require('puppeteer-core');
const http = require('http');
const fs = require('fs');
const path = require('path');

const CHROME = process.env.CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT = path.join(__dirname, '..', '..');
const PORT = 8177;
const OUT = path.join(ROOT, 'qa-out', 'ux03');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon'
};

const MOCK = `
const state = { user: null, opts: null, syncs: [], statuses: [] };
window.__cloud = state;
export async function initializeWishlistCloud(opts){
  state.opts = opts;
  window.__cloudSetUser = (u) => { state.user = u; if(opts.onUserChanged) opts.onUserChanged(u ? u.uid : null); };
  window.__cloudRemote = (items, initial) => { if(opts.onRemoteItems) opts.onRemoteItems(items, !!initial); };
  window.__cloudStatus = (kind, label) => { state.statuses.push(kind); if(opts.onStatus) opts.onStatus(kind, label || ''); };
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

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/wishlist.html';
  const file = path.join(ROOT, p);
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    res.end(data);
  });
});

const ITEM = i => ({
  id: 'ux3-' + i,
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
const makeItems = n => Array.from({ length: n }, (_, i) => ITEM(i + 1));

const WIDTHS = [1440, 1024, 768, 390, 320];

function line(s) { console.log(s); }
function head(s) { console.log('\n=== ' + s + ' ==='); }

async function makePage(browser, width, height, seed) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
  await page.evaluateOnNewDocument((s) => {
    try {
      localStorage.setItem('wishlist.guest.items', JSON.stringify(s));
      localStorage.setItem('wishlist.items', JSON.stringify(s));
    } catch (e) { /* ignore */ }
    window.__cloudStatus = () => {};
  }, seed);
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    if (/wishlist-cloud\.js/.test(req.url())) {
      return req.respond({ status: 200, contentType: 'application/javascript', body: MOCK });
    }
    return req.continue();
  });
  await page.goto(`http://127.0.0.1:${PORT}/wishlist.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => {
    const g = document.getElementById('grid');
    return g && (g.children.length > 0 || !document.getElementById('empty').classList.contains('hidden'));
  }, { timeout: 15000 });
  await sleep(400);
  return { ctx, page };
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));

  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--hide-scrollbars', '--force-device-scale-factor=1']
  });

  const seed = makeItems(12);
  const report = { duplicateIds: [], layout: [], interaction: {}, screenshots: [] };

  // -------------------------------------------------------------------
  // PART A — duplicate control inventory (static DOM truth)
  // -------------------------------------------------------------------
  head('PART A — duplicate control inventory');
  {
    const { ctx, page } = await makePage(browser, 1440, 900, seed);
    const inv = await page.evaluate(() => {
      const ids = ['q', 'fStatus', 'fPriority', 'fCategoryFilter', 'fSort', 'fSavings',
                   'btnClearFilter', 'filtersPanel', 'filterToggle'];
      const out = {};
      ids.forEach(id => {
        const all = Array.from(document.querySelectorAll('#' + id));
        out[id] = {
          count: all.length,
          optionCounts: all.map(el => el.tagName === 'SELECT' ? el.options.length : null),
          visible: all.map(el => {
            const r = el.getBoundingClientRect();
            const cs = getComputedStyle(el);
            return r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden';
          }),
          inSidebar: all.map(el => !!el.closest('.collection-sidebar')),
          inToolbar: all.map(el => !!el.closest('.collection-toolbar'))
        };
      });
      // Which element does the app actually read?
      const read = {};
      ids.forEach(id => {
        const el = document.getElementById(id);
        read[id] = el ? {
          inSidebar: !!el.closest('.collection-sidebar'),
          inToolbar: !!el.closest('.collection-toolbar')
        } : null;
      });
      return { out, read };
    });
    Object.keys(inv.out).forEach(id => {
      const o = inv.out[id];
      if (o.count > 1) {
        report.duplicateIds.push({ id, count: o.count, optionCounts: o.optionCounts });
        line('DUPLICATE id="' + id + '" x' + o.count +
             '  options=' + JSON.stringify(o.optionCounts) +
             '  appReadsFrom=' + (inv.read[id].inSidebar ? 'SIDEBAR' : 'toolbar'));
      }
    });
    line('single-instance ids: ' + Object.keys(inv.out)
      .filter(i => inv.out[i].count === 1).map(i => i + '(toolbar=' + inv.out[i].inToolbar[0] + ')').join(', '));
    await ctx.close();
  }

  // -------------------------------------------------------------------
  // PART B — layout audit at 5 widths
  // -------------------------------------------------------------------
  head('PART B — layout audit');
  for (const w of WIDTHS) {
    const { ctx, page } = await makePage(browser, w, w <= 390 ? 844 : 900, seed);
    const audit = await page.evaluate(() => {
      const q = s => document.querySelector(s);
      const box = el => { if (!el) return null; const r = el.getBoundingClientRect();
        return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
      const shown = el => { if (!el) return false; const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0; };

      const sidebar = q('.collection-sidebar');
      const toolbar = q('.collection-toolbar');
      const panel = q('#collection');
      const grid = q('#grid');
      const viewbar = q('.v13-viewbar');
      const board = q('#board');

      const sidebarBox = box(sidebar);
      const toolbarBox = box(toolbar);

      // horizontal overflow
      const docW = document.documentElement.scrollWidth;
      const winW = window.innerWidth;

      // overlap between the rail and the canvas that follows it
      const canvas = q('.v11-workspace > .v11-canvas');
      const workspace = q('.v11-workspace');
      const canvasBox = box(canvas);

      // are all the filter controls reachable by a USER (visible) at this width?
      const ctrlIds = ['q', 'fStatus', 'fPriority', 'fCategoryFilter', 'fSort', 'fSavings', 'btnClearFilter'];
      const reachable = {};
      ctrlIds.forEach(id => {
        const els = Array.from(document.querySelectorAll('#' + id));
        reachable[id] = {
          total: els.length,
          visibleCount: els.filter(shown).length,
          visibleOptions: els.filter(shown).map(el => el.tagName === 'SELECT' ? el.options.length : null)
        };
      });

      // view switcher
      const viewButtons = ['v13GridView', 'v13FocusView', 'v13BoardView'].map(id => {
        const el = document.getElementById(id);
        return { id, visible: shown(el), box: box(el), pressed: el ? el.getAttribute('aria-pressed') : null };
      });

      // sticky / two-column evidence
      const panelCs = panel ? getComputedStyle(panel) : null;
      const wsCs = workspace ? getComputedStyle(workspace) : null;

      return {
        winW, docW, overflow: docW > winW + 1,
        sidebarExists: !!sidebar,
        sidebarVisible: shown(sidebar), sidebarBox, sidebarPosition: sidebar ? getComputedStyle(sidebar).position : null,
        toolbarVisible: shown(toolbar), toolbarBox,
        panelBox: box(panel), gridBox: box(grid), canvasBox,
        panelPosition: panelCs ? panelCs.position : null,
        workspaceDisplay: wsCs ? wsCs.display : null,
        workspaceCols: wsCs ? wsCs.gridTemplateColumns : null,
        viewbarVisible: shown(viewbar), viewButtons,
        boardVisible: shown(board),
        overlap: (sidebarVisibleIn(box(panel), canvasBox)),
        reachable
      };
      function sidebarVisibleIn(a, b) {
        if (!a || !b) return null;
        const ox = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
        const oy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
        return { x: ox, y: oy, area: ox * oy };
      }
    });
    report.layout.push({ width: w, ...audit });
    line('\n-- ' + w + 'px --');
    line('  overflow: ' + audit.overflow + ' (doc ' + audit.docW + ' / win ' + audit.winW + ')');
    line('  workspace display: ' + audit.workspaceDisplay + ' cols=' + audit.workspaceCols);
    line('  rail #collection: pos=' + audit.panelPosition + ' box=' + JSON.stringify(audit.panelBox));
    line('  canvas: ' + JSON.stringify(audit.canvasBox));
    line('  toolbar visible: ' + audit.toolbarVisible + ' box=' + JSON.stringify(audit.toolbarBox));
    line('  legacy .collection-sidebar block present: ' + audit.sidebarExists);
    line('  overlap rail/canvas: ' + JSON.stringify(audit.overlap));
    line('  viewbar visible: ' + audit.viewbarVisible + ' buttons=' + JSON.stringify(audit.viewButtons.map(b => b.id + ':' + b.visible)));
    const bad = Object.keys(audit.reachable).filter(k => audit.reachable[k].visibleCount === 0);
    line('  controls with 0 visible instances: ' + (bad.length ? bad.join(', ') : 'none'));
    const empty = Object.keys(audit.reachable).filter(k => (audit.reachable[k].visibleOptions || []).some(o => o !== null && o <= 1));
    line('  selects with <=1 option (unpopulated): ' + (empty.length ? empty.join(', ') : 'none'));

    // screenshot
    const file = path.join(OUT, 'ux03-' + w + '.png');
    await page.screenshot({ path: file, fullPage: false });
    report.screenshots.push(file);
    await ctx.close();
  }

  // -------------------------------------------------------------------
  // PART C — real interaction verification
  // -------------------------------------------------------------------
  head('PART C — interaction verification');
  {
    // C1 desktop: add item -> search -> filter -> sort -> views -> QV -> status -> clear
    const { ctx, page } = await makePage(browser, 1440, 900, []);
    const steps = [];
    const step = async (name, fn) => {
      try { const v = await fn(); steps.push({ name, ok: true, v }); }
      catch (e) { steps.push({ name, ok: false, v: String(e.message || e) }); }
    };

    await step('add item', async () => {
      await page.click('#btnAdd');
      await sleep(400);
      await page.type('#fName', 'Tai nghe chống ồn');
      await page.type('#fPrice', '2500000');
      await page.click('#form button[type="submit"], #btnSave');
      await sleep(700);
      const n = await page.$$eval('#grid .wishlist-card', els => els.length);
      const names = await page.$$eval('#grid .product-card__title', els => els.map(e => e.textContent.trim()));
      return { cards: n, names };
    });

    await step('search by name', async () => {
      const el = await page.$('#q');
      await el.click();
      await el.type('Tai nghe');
      await sleep(600);
      const n = await page.$$eval('#grid .wishlist-card', els => els.length);
      const status = await page.$eval('#resultStatus', e => e.textContent.trim());
      return { cards: n, status };
    });

    await step('clear via search', async () => {
      await page.click('#btnClearFilter');
      await sleep(500);
      const q = await page.$eval('#q', e => e.value);
      return { q, cards: await page.$$eval('#grid .wishlist-card', e => e.length) };
    });

    await step('filter by category', async () => {
      const sel = await page.$('#fCategoryFilter');
      if (!sel) throw new Error('no category select');
      const opts = await page.$$eval('#fCategoryFilter option', o => o.map(x => x.value));
      if (opts.length < 2) throw new Error('category select not populated: ' + JSON.stringify(opts));
      await page.select('#fCategoryFilter', opts[1]);
      await sleep(600);
      return { opts, cards: await page.$$eval('#grid .wishlist-card', e => e.length) };
    });

    await step('sort by newest', async () => {
      await page.select('#fSort', 'newest');
      await sleep(500);
      const v = await page.$eval('#fSort', e => e.value);
      return { value: v };
    });

    await step('gallery -> focus -> board -> gallery', async () => {
      const out = {};
      await page.click('#v13FocusView'); await sleep(400);
      out.focus = await page.evaluate(() => ({
        pressed: document.getElementById('v13FocusView').getAttribute('aria-pressed'),
        gridPressed: document.getElementById('v13GridView').getAttribute('aria-pressed'),
        dataView: document.getElementById('grid').dataset.v13View,
        cols: getComputedStyle(document.getElementById('grid')).gridTemplateColumns
      }));
      await page.click('#v13BoardView'); await sleep(500);
      out.board = await page.evaluate(() => ({
        pressed: document.getElementById('v13BoardView').getAttribute('aria-pressed'),
        boardVisible: !!document.getElementById('board') && getComputedStyle(document.getElementById('board')).display !== 'none',
        gridHidden: document.getElementById('grid').classList.contains('hidden'),
        columns: document.querySelectorAll('#board .board__column').length
      }));
      await page.click('#v13GridView'); await sleep(400);
      out.gallery = await page.evaluate(() => ({
        pressed: document.getElementById('v13GridView').getAttribute('aria-pressed'),
        dataView: document.getElementById('grid').dataset.v13View
      }));
      return out;
    });

    await step('open quick view', async () => {
      const target = await page.$('#grid .wishlist-card .product-card__view');
      if (!target) throw new Error('no .product-card__view trigger on the card');
      await target.click();
      await sleep(800);
      const open = await page.$eval('#qv', d => d.open).catch(() => false);
      const title = await page.$eval('#qv', d => {
        const t = d.querySelector('#qvTitle'); return t ? t.textContent.trim() : null;
      }).catch(() => null);
      return { open, title };
    });

    await step('change status via quick view', async () => {
      const before = await page.$eval('#qvStatus', e => e.textContent.trim()).catch(() => null);
      const btn = await page.$('#qvStatusOptions button[data-status-key]');
      if (!btn) throw new Error('no status option button inside #qvStatusOptions');
      const target = await btn.evaluate(el => el.dataset.statusKey);
      await btn.click();
      await sleep(900);
      const after = await page.$eval('#qvStatus', e => e.textContent.trim()).catch(() => null);
      const pressed = await page.$eval('#qvStatusOptions button[data-status-key="' + target + '"]',
        e => e.getAttribute('aria-pressed')).catch(() => null);
      await page.keyboard.press('Escape');
      await sleep(500);
      return { before, after, changed: before !== after, clicked: target, ariaPressed: pressed };
    });

    await step('clear filters restores', async () => {
      await page.click('#btnClearFilter');
      await sleep(600);
      return await page.evaluate(() => ({
        q: document.getElementById('q').value,
        status: document.getElementById('fStatus').value,
        cards: document.querySelectorAll('#grid .wishlist-card').length
      }));
    });

    report.interaction.desktop = steps;
    steps.forEach(s => line('  ' + (s.ok ? 'OK  ' : 'FAIL') + ' ' + s.name + ' :: ' + JSON.stringify(s.v)));
    await ctx.close();
  }

  // C2 — MOBILE toolbar reachability (the critical UX-03 question)
  head('PART C2 — mobile toolbar functional reachability (390px)');
  {
    const { ctx, page } = await makePage(browser, 390, 844, makeItems(12));
    const mob = await page.evaluate(() => {
      const shown = el => { if (!el) return false; const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0; };
      const ids = ['q', 'fStatus', 'fPriority', 'fCategoryFilter', 'fSort', 'fSavings', 'btnClearFilter'];
      const out = {};
      ids.forEach(id => {
        const els = Array.from(document.querySelectorAll('#' + id));
        const vis = els.filter(shown);
        out[id] = {
          total: els.length,
          visible: vis.length,
          visibleOptions: vis.map(el => el.tagName === 'SELECT' ? el.options.length : null),
          appReads: (() => { const e = document.getElementById(id);
            return e ? (e.closest('.collection-sidebar') ? 'SIDEBAR(hidden)' : 'toolbar') : null; })()
        };
      });
      return out;
    });
    report.interaction.mobile = mob;
    Object.keys(mob).forEach(k => line('  ' + k + ' :: ' + JSON.stringify(mob[k])));

    // functional proof: type in the VISIBLE mobile search and see if the grid reacts
    const searchProbe = await page.evaluate(async () => {
      const vis = Array.from(document.querySelectorAll('#q')).filter(el => {
        const cs = getComputedStyle(el); const r = el.getBoundingClientRect();
        return cs.display !== 'none' && r.width > 0 && r.height > 0;
      })[0];
      if (!vis) return { error: 'no visible #q' };
      const before = document.querySelectorAll('#grid .wishlist-card').length;
      vis.value = 'Món 3';
      vis.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(r => setTimeout(r, 500));
      const after = document.querySelectorAll('#grid .wishlist-card').length;
      const readBy = document.getElementById('q').closest('.collection-sidebar') ? 'SIDEBAR' : 'toolbar';
      return { before, after, reacted: before !== after, appReadsFrom: readBy,
               visibleIsToolbar: !!vis.closest('.collection-toolbar') };
    });
    line('\n  MOBILE SEARCH PROBE: ' + JSON.stringify(searchProbe));
    report.interaction.mobileSearchProbe = searchProbe;

    // functional proof: change the VISIBLE mobile status select.
    // At <=640px the four selects live behind the F4.4 disclosure, so the
    // toggle has to be opened first — that IS the phone contract.
    // The search box is cleared first so the ONLY predicate is the status.
    const selectProbe = await page.evaluate(async () => {
      const q = document.getElementById('q');
      q.value = ''; q.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(r => setTimeout(r, 400));
      const toggle = document.getElementById('filterToggle');
      const toggleVisible = toggle && getComputedStyle(toggle).display !== 'none';
      if (toggleVisible) { toggle.click(); await new Promise(r => setTimeout(r, 400)); }
      const vis = Array.from(document.querySelectorAll('#fStatus')).filter(el => {
        const cs = getComputedStyle(el); const r = el.getBoundingClientRect();
        return cs.display !== 'none' && r.width > 0 && r.height > 0;
      })[0];
      if (!vis) return { error: 'no visible #fStatus even after opening the disclosure' };
      const before = document.querySelectorAll('#grid .wishlist-card').length;
      const opts = Array.from(vis.options).map(o => o.value);
      vis.value = 'purchased';
      vis.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise(r => setTimeout(r, 700));
      const after = document.querySelectorAll('#grid .wishlist-card').length;
      const status = document.getElementById('resultStatus').textContent.trim();
      // restore
      vis.value = ''; vis.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise(r => setTimeout(r, 500));
      return { disclosureOpened: !!toggleVisible, visibleOptions: opts, before, after,
               narrowed: after < before, status };
    });
    line('  MOBILE STATUS SELECT PROBE: ' + JSON.stringify(selectProbe));
    report.interaction.mobileSelectProbe = selectProbe;

    // functional proof: the phone clear-filters button
    const clearProbe = await page.evaluate(async () => {
      const before = document.querySelectorAll('#grid .wishlist-card').length;
      const vis = Array.from(document.querySelectorAll('#q')).filter(el => {
        const cs = getComputedStyle(el); const r = el.getBoundingClientRect();
        return cs.display !== 'none' && r.width > 0 && r.height > 0;
      })[0];
      if (vis) { vis.value = 'Món 1'; vis.dispatchEvent(new Event('input', { bubbles: true })); }
      await new Promise(r => setTimeout(r, 500));
      const filtered = document.querySelectorAll('#grid .wishlist-card').length;
      document.getElementById('btnClearFilter').click();
      await new Promise(r => setTimeout(r, 600));
      return { before, filtered, afterClear: document.querySelectorAll('#grid .wishlist-card').length,
               q: document.getElementById('q').value };
    });
    line('  MOBILE CLEAR-FILTERS PROBE: ' + JSON.stringify(clearProbe));
    report.interaction.mobileClearProbe = clearProbe;

    const file = path.join(OUT, 'ux03-390-toolbar.png');
    await page.screenshot({ path: file });
    report.screenshots.push(file);
    await ctx.close();
  }

  // C3 — empty library vs zero search results
  head('PART C3 — empty states');
  {
    const { ctx, page } = await makePage(browser, 1440, 900, []);
    const emptyLib = await page.evaluate(() => ({
      emptyVisible: !document.getElementById('empty').classList.contains('hidden'),
      title: document.getElementById('emptyTitle').textContent.trim(),
      desc: document.getElementById('emptyDescription').textContent.trim(),
      action: document.getElementById('emptyAction').textContent.trim(),
      bodyClass: document.body.className
    }));
    line('  EMPTY LIBRARY: ' + JSON.stringify(emptyLib));

    // Seed ONE item and reload. evaluateOnNewDocument re-seeds on every
    // navigation, so the single-item fixture has to be written in the same
    // hook — otherwise the reload restores the original (empty) seed.
    const one = [{
      id: 'x1', name: 'Món một', price: 100, image: '', link: '',
      status: 'wish', priority: 'medium', category: 'A', note: '', createdAt: 1
    }];
    const ctx2 = await browser.createBrowserContext();
    const page2 = await ctx2.newPage();
    await page2.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    await page2.evaluateOnNewDocument((s) => {
      try {
        localStorage.setItem('wishlist.guest.items', JSON.stringify(s));
        localStorage.setItem('wishlist.items', JSON.stringify(s));
      } catch (e) { /* ignore */ }
      window.__cloudStatus = () => {};
    }, one);
    await page2.setRequestInterception(true);
    page2.on('request', (req) => {
      if (/wishlist-cloud\.js/.test(req.url())) {
        return req.respond({ status: 200, contentType: 'application/javascript', body: MOCK });
      }
      return req.continue();
    });
    await page2.goto(`http://127.0.0.1:${PORT}/wishlist.html`, { waitUntil: 'domcontentloaded' });
    await page2.waitForSelector('#grid .wishlist-card', { timeout: 10000 });
    await sleep(600);
    await page2.type('#q', 'khong-ton-tai-abc');
    await sleep(800);
    const zeroRes = await page2.evaluate(() => ({
      emptyVisible: !document.getElementById('empty').classList.contains('hidden'),
      title: document.getElementById('emptyTitle').textContent.trim(),
      desc: document.getElementById('emptyDescription').textContent.trim(),
      action: document.getElementById('emptyAction').textContent.trim(),
      cards: document.querySelectorAll('#grid .wishlist-card').length
    }));
    line('  ZERO RESULTS: ' + JSON.stringify(zeroRes));
    const file = path.join(OUT, 'ux03-zero-results.png');
    await page2.screenshot({ path: file });
    report.screenshots.push(file);
    report.interaction.emptyStates = { emptyLib, zeroRes };
    await ctx2.close();
  }

  // -------------------------------------------------------------------
  // PART D — VIEW-01 repeatability (10 runs)
  // -------------------------------------------------------------------
  head('PART D — VIEW-01 repeatability');
  {
    const runs = [];
    for (let i = 0; i < 10; i++) {
      const { ctx, page } = await makePage(browser, 1280, 900, makeItems(6));
      await page.click('#v13FocusView');
      await sleep(300);
      const v = await page.evaluate(() => ({
        view: document.getElementById('grid').dataset.v13View,
        focus: document.getElementById('v13FocusView').getAttribute('aria-pressed'),
        grid: document.getElementById('v13GridView').getAttribute('aria-pressed')
      }));
      const ok = v.view === 'focus' && v.focus === 'true' && v.grid === 'false';
      runs.push(ok);
      if (!ok) line('  run ' + (i + 1) + ' FAILED: ' + JSON.stringify(v));
      await ctx.close();
    }
    line('  VIEW-01 style check: ' + runs.filter(Boolean).length + '/10 passes');
    report.interaction.view01Repeatability = runs;
  }

  await browser.close();
  server.close();

  fs.writeFileSync(path.join(OUT, 'ux03-report.json'), JSON.stringify(report, null, 2));
  line('\nReport written: ' + path.join(OUT, 'ux03-report.json'));
  line('Screenshots: ' + report.screenshots.join(', '));
})().catch(e => { console.error('FATAL', e); process.exit(1); });
