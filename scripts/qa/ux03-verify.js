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
    let sticky = null;
    if (w === 1440) {
      sticky = await page.evaluate(() => {
        const rail = document.getElementById('collection');
        const workspace = document.querySelector('.v11-workspace');
        workspace.scrollIntoView({ block: 'start', behavior: 'instant' });
        const startY = rail.getBoundingClientRect().top;
        const beforeScroll = window.scrollY;
        window.scrollBy(0, 220);
        const endY = rail.getBoundingClientRect().top;
        const inset = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
        const railClientHeight = rail.clientHeight;
        const railScrollHeight = rail.scrollHeight;
        rail.scrollTop = rail.scrollHeight;
        const railRect = rail.getBoundingClientRect();
        const footer = rail.querySelector('.collection-toolbar__footer');
        const footerRect = footer ? footer.getBoundingClientRect() : null;
        return {
          position: getComputedStyle(rail).position,
          stickyTop: parseFloat(getComputedStyle(rail).top),
          startY: Math.round(startY),
          endY: Math.round(endY),
          railBottom: Math.round(railRect.bottom),
          railClientHeight,
          railScrollHeight,
          footerBottom: footerRect ? Math.round(footerRect.bottom) : null,
          footerReachable: !!footerRect && footerRect.top >= inset && footerRect.bottom <= window.innerHeight,
          scrollDelta: Math.round(window.scrollY - beforeScroll),
          inset,
          pinned: Math.abs(endY - inset) <= 2
        };
      });
    }
    report.layout.push({ width: w, ...audit, sticky });
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
    if (sticky) line('  sticky rail after scroll: ' + JSON.stringify(sticky));

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
    const { ctx, page } = await makePage(browser, 1440, 900, makeItems(12));
    const steps = [];
    const step = async (name, fn) => {
      try { const v = await fn(); steps.push({ name, ok: true, v }); }
      catch (e) { steps.push({ name, ok: false, v: String(e.message || e) }); }
    };

    await step('add item', async () => {
      const before = await page.$$eval('#grid .wishlist-card', els => els.length);
      await page.click('#btnAdd');
      await sleep(400);
      await page.type('#fName', 'Tai nghe chống ồn');
      await page.type('#fPrice', '2500000');
      await page.type('#fCategory', 'UX-03 audit');
      await page.click('#form button[type="submit"], #btnSave');
      await page.waitForFunction(() => document.getElementById('dlg').open === false, { timeout: 5000 });
      await page.waitForFunction(n => document.querySelectorAll('#grid .wishlist-card').length === n + 1, { timeout: 5000 }, before);
      const n = await page.$$eval('#grid .wishlist-card', els => els.length);
      const names = await page.$$eval('#grid .product-card__title', els => els.map(e => e.textContent.trim()));
      if (!names.includes('Tai nghe chống ồn')) throw new Error('added item is not rendered');
      return { cards: n, names };
    });

    await step('search by name', async () => {
      const el = await page.$('#q');
      await el.click();
      await el.type('Tai nghe');
      await page.waitForFunction(() => document.querySelectorAll('#grid .wishlist-card').length === 1, { timeout: 5000 });
      const n = await page.$$eval('#grid .wishlist-card', els => els.length);
      const status = await page.$eval('#resultStatus', e => e.textContent.trim());
      if (n !== 1 || !/1 trên 13/.test(status)) throw new Error('search did not narrow to the added item: ' + status);
      return { cards: n, status };
    });

    await step('clear via search', async () => {
      await page.click('#btnClearFilter');
      await page.waitForFunction(() => document.getElementById('q').value === '' && document.querySelectorAll('#grid .wishlist-card').length === 13, { timeout: 5000 });
      const q = await page.$eval('#q', e => e.value);
      return { q, cards: await page.$$eval('#grid .wishlist-card', e => e.length) };
    });

    await step('filter by category', async () => {
      const sel = await page.$('#fCategoryFilter');
      if (!sel) throw new Error('no category select');
      const opts = await page.$$eval('#fCategoryFilter option', o => o.map(x => x.value));
      if (opts.length < 2) throw new Error('category select not populated: ' + JSON.stringify(opts));
      if (!opts.includes('UX-03 audit')) throw new Error('added item category missing from options: ' + JSON.stringify(opts));
      await page.select('#fCategoryFilter', 'UX-03 audit');
      await page.waitForFunction(() => document.querySelectorAll('#grid .wishlist-card').length === 1, { timeout: 5000 });
      const names = await page.$$eval('#grid .product-card__title', els => els.map(e => e.textContent.trim()));
      if (names[0] !== 'Tai nghe chống ồn') throw new Error('category filter returned the wrong item: ' + JSON.stringify(names));
      return { opts, cards: names.length, names };
    });

    await step('sort by newest', async () => {
      await page.click('#btnClearFilter');
      await page.waitForFunction(() => document.getElementById('fCategoryFilter').value === '' && document.querySelectorAll('#grid .wishlist-card').length === 13, { timeout: 5000 });
      await page.select('#fSort', 'newest');
      await page.waitForFunction(() => document.querySelector('#grid .product-card__title')?.textContent.trim() === 'Tai nghe chống ồn', { timeout: 5000 });
      const v = await page.$eval('#fSort', e => e.value);
      if (v !== 'newest') throw new Error('sort selection did not persist: ' + v);
      return { value: v };
    });

    await step('gallery -> focus -> board -> gallery', async () => {
      const out = {};
      await page.click('#v13FocusView');
      await page.waitForFunction(() => document.getElementById('grid').dataset.v13View === 'focus' && document.getElementById('v13FocusView').getAttribute('aria-pressed') === 'true', { timeout: 5000 });
      out.focus = await page.evaluate(() => ({
        pressed: document.getElementById('v13FocusView').getAttribute('aria-pressed'),
        gridPressed: document.getElementById('v13GridView').getAttribute('aria-pressed'),
        dataView: document.getElementById('grid').dataset.v13View,
        cols: getComputedStyle(document.getElementById('grid')).gridTemplateColumns
      }));
      if (out.focus.pressed !== 'true' || out.focus.gridPressed !== 'false' || out.focus.dataView !== 'focus') {
        throw new Error('focus view state did not activate: ' + JSON.stringify(out.focus));
      }
      await page.click('#v13BoardView');
      await page.waitForFunction(() => document.getElementById('v13BoardView').getAttribute('aria-pressed') === 'true' && getComputedStyle(document.getElementById('board')).display !== 'none', { timeout: 5000 });
      out.board = await page.evaluate(() => ({
        pressed: document.getElementById('v13BoardView').getAttribute('aria-pressed'),
        boardVisible: !!document.getElementById('board') && getComputedStyle(document.getElementById('board')).display !== 'none',
        gridHidden: document.getElementById('grid').classList.contains('hidden'),
        columns: document.querySelectorAll('#board .board__column').length
      }));
      if (out.board.pressed !== 'true' || !out.board.boardVisible || !out.board.gridHidden || out.board.columns !== 4) {
        throw new Error('board view state did not activate: ' + JSON.stringify(out.board));
      }
      await page.click('#v13GridView');
      await page.waitForFunction(() => document.getElementById('grid').dataset.v13View === 'gallery' && document.getElementById('v13GridView').getAttribute('aria-pressed') === 'true', { timeout: 5000 });
      out.gallery = await page.evaluate(() => ({
        pressed: document.getElementById('v13GridView').getAttribute('aria-pressed'),
        dataView: document.getElementById('grid').dataset.v13View
      }));
      if (out.gallery.pressed !== 'true' || out.gallery.dataView !== 'gallery') {
        throw new Error('gallery view did not restore: ' + JSON.stringify(out.gallery));
      }
      return out;
    });

    await step('open quick view', async () => {
      const target = await page.$('#grid .wishlist-card .product-card__view');
      if (!target) throw new Error('no .product-card__view trigger on the card');
      await target.click();
      await page.waitForFunction(() => document.getElementById('qv').open === true, { timeout: 5000 });
      const open = await page.$eval('#qv', d => d.open);
      const title = await page.$eval('#qv', d => d.querySelector('#qvTitle')?.textContent.trim() || null);
      if (!open || title !== 'Tai nghe chống ồn') throw new Error('Quick View did not open for the selected item: ' + JSON.stringify({ open, title }));
      return { open, title };
    });

    await step('change status via quick view', async () => {
      const before = await page.$eval('#qvStatus', e => e.textContent.trim()).catch(() => null);
      const btn = await page.$('#qvStatusOptions button[data-status-key="saving"]');
      if (!btn) throw new Error('no status option button inside #qvStatusOptions');
      const target = await btn.evaluate(el => el.dataset.statusKey);
      if (target === 'wish') throw new Error('status target must differ from the current status');
      await btn.click();
      await page.waitForFunction(key => document.querySelector('#qvStatusOptions button[aria-pressed="true"]')?.dataset.statusKey === key, { timeout: 5000 }, target);
      const after = await page.$eval('#qvStatus', e => e.textContent.trim()).catch(() => null);
      const pressed = await page.$eval('#qvStatusOptions button[data-status-key="' + target + '"]', e => e.getAttribute('aria-pressed'));
      if (before === after || pressed !== 'true' || after !== 'Đang để dành') {
        throw new Error('status did not change: ' + JSON.stringify({ before, after, pressed }));
      }
      await page.click('#qvClose');
      await page.waitForFunction(() => document.getElementById('qv').open === false, { timeout: 5000 });
      return { before, after, changed: before !== after, clicked: target, ariaPressed: pressed };
    });

    await step('clear filters restores', async () => {
      await page.click('#btnClearFilter');
      await page.waitForFunction(() => document.getElementById('q').value === '' && document.getElementById('fStatus').value === '' && document.querySelectorAll('#grid .wishlist-card').length === 13, { timeout: 5000 });
      const result = await page.evaluate(() => ({
        q: document.getElementById('q').value,
        status: document.getElementById('fStatus').value,
        cards: document.querySelectorAll('#grid .wishlist-card').length
      }));
      if (result.q !== '' || result.status !== '' || result.cards !== 13) throw new Error('clear filters did not restore the collection: ' + JSON.stringify(result));
      return result;
    });

    report.interaction.desktop = steps;
    steps.forEach(s => line('  ' + (s.ok ? 'OK  ' : 'FAIL') + ' ' + s.name + ' :: ' + JSON.stringify(s.v)));
    await ctx.close();
  }

  // C2 — MOBILE toolbar reachability (the critical UX-03 question)
  head('PART C2 — mobile toolbar functional reachability (390px)');
  {
    const { ctx, page } = await makePage(browser, 390, 844, makeItems(12));
    const sidebarVisible = await page.evaluate(() => {
      const sidebar = document.querySelector('.collection-sidebar');
      return !!sidebar && getComputedStyle(sidebar).display !== 'none' && sidebar.getBoundingClientRect().width > 0;
    });
    if (sidebarVisible) throw new Error('legacy sidebar is visible on mobile');
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
    const searchProbe = await page.evaluate(() => {
      const vis = Array.from(document.querySelectorAll('#q')).find(el => {
        const cs = getComputedStyle(el); const r = el.getBoundingClientRect();
        return cs.display !== 'none' && r.width > 0 && r.height > 0;
      });
      return vis ? {
        before: document.querySelectorAll('#grid .wishlist-card').length,
        appReadsFrom: document.getElementById('q').closest('.collection-sidebar') ? 'SIDEBAR' : 'toolbar',
        visibleIsToolbar: !!vis.closest('.collection-toolbar')
      } : { error: 'no visible #q' };
    });
    if (searchProbe.error) throw new Error(searchProbe.error);
    await page.click('#q');
    await page.type('#q', 'Món 3');
    await page.waitForFunction(() => document.querySelectorAll('#grid .wishlist-card').length === 1, { timeout: 5000 });
    searchProbe.after = await page.$$eval('#grid .wishlist-card', els => els.length);
    searchProbe.reacted = searchProbe.before !== searchProbe.after;
    line('\n  MOBILE SEARCH PROBE: ' + JSON.stringify(searchProbe));
    if (!searchProbe.reacted || !searchProbe.visibleIsToolbar) throw new Error('mobile search is not connected to the visible toolbar: ' + JSON.stringify(searchProbe));
    report.interaction.mobileSearchProbe = searchProbe;

    // functional proof: change the VISIBLE mobile status select.
    // At <=640px the four selects live behind the F4.4 disclosure, so the
    // toggle has to be opened first — that IS the phone contract.
    // The search box is cleared first so the ONLY predicate is the status.
    await page.click('#btnClearFilter');
    await page.waitForFunction(() => document.getElementById('q').value === '' && document.querySelectorAll('#grid .wishlist-card').length === 12, { timeout: 5000 });
    const toggleVisible = await page.$eval('#filterToggle', el => getComputedStyle(el).display !== 'none');
    if (!toggleVisible) throw new Error('mobile filter disclosure is not visible');
    await page.click('#filterToggle');
    await page.waitForFunction(() => document.getElementById('filterToggle').getAttribute('aria-expanded') === 'true' &&
      getComputedStyle(document.getElementById('fStatus')).display !== 'none', { timeout: 5000 });
    const visibleControls = await page.evaluate(() => ['fStatus', 'fPriority', 'fCategoryFilter', 'fSort', 'fSavings'].map(id => {
      const el = document.getElementById(id), r = el.getBoundingClientRect();
      return { id, visible: getComputedStyle(el).display !== 'none' && r.width > 0 && r.height > 0,
        options: el.tagName === 'SELECT' ? el.options.length : 0 };
    }));
    const before = await page.$$eval('#grid .wishlist-card', els => els.length);
    await page.select('#fStatus', 'purchased');
    await page.waitForFunction(n => document.querySelectorAll('#grid .wishlist-card').length < n, { timeout: 5000 }, before);
    const after = await page.$$eval('#grid .wishlist-card', els => els.length);
    const status = await page.$eval('#resultStatus', el => el.textContent.trim());
    const selectProbe = {
      disclosureOpened: true,
      visibleOptions: visibleControls,
      before,
      after,
      narrowed: after < before,
      status
    };
    await page.select('#fStatus', '');
    await page.waitForFunction(n => document.querySelectorAll('#grid .wishlist-card').length === n, { timeout: 5000 }, before);
    line('  MOBILE STATUS SELECT PROBE: ' + JSON.stringify(selectProbe));
    if (!selectProbe.disclosureOpened || !selectProbe.narrowed ||
        visibleControls.some(c => !c.visible || c.options < 2)) {
      throw new Error('mobile status filter is not usable through the disclosure: ' + JSON.stringify(selectProbe));
    }
    report.interaction.mobileSelectProbe = selectProbe;

    // functional proof: the phone clear-filters button
    const clearBefore = await page.$$eval('#grid .wishlist-card', els => els.length);
    await page.locator('#q').fill('Món 1');
    await page.waitForFunction(() => document.querySelectorAll('#grid .wishlist-card').length < 12, { timeout: 5000 });
    const filteredCount = await page.$$eval('#grid .wishlist-card', els => els.length);
    await page.click('#btnClearFilter');
    await page.waitForFunction(() => document.getElementById('q').value === '' && document.querySelectorAll('#grid .wishlist-card').length === 12, { timeout: 5000 });
    const clearProbe = {
      before: clearBefore,
      filtered: filteredCount,
      afterClear: await page.$$eval('#grid .wishlist-card', els => els.length),
      q: await page.$eval('#q', el => el.value)
    };
    line('  MOBILE CLEAR-FILTERS PROBE: ' + JSON.stringify(clearProbe));
    if (clearProbe.filtered >= clearProbe.before || clearProbe.afterClear !== clearProbe.before || clearProbe.q !== '') {
      throw new Error('mobile clear filters did not restore the search results: ' + JSON.stringify(clearProbe));
    }
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

  const failedSteps = (report.interaction.desktop || []).filter(s => !s.ok);
  const layoutFailures = report.layout.filter(a => a.overflow ||
    (a.overlap && a.overlap.area > 0) ||
    a.viewButtons.some(b => !b.visible) ||
    (a.width === 1440 && (!a.sticky || !a.sticky.pinned || a.sticky.position !== 'sticky' || !a.sticky.footerReachable)) ||
    Object.keys(a.reachable).some(k => ['q', 'btnClearFilter'].includes(k) && a.reachable[k].visibleCount === 0));
  if (failedSteps.length || layoutFailures.length ||
      !report.interaction.mobileSearchProbe?.reacted ||
      !report.interaction.mobileSelectProbe?.narrowed ||
      !report.interaction.mobileClearProbe ||
      report.interaction.view01Repeatability.filter(Boolean).length !== 10) {
    console.error('\nUX-03 VERIFICATION FAILED: ' + JSON.stringify({
      failedSteps: failedSteps.map(s => ({ name: s.name, error: s.v })),
      layoutFailures: layoutFailures.map(a => a.width),
      mobileSearch: report.interaction.mobileSearchProbe,
      mobileStatus: report.interaction.mobileSelectProbe,
      mobileClear: report.interaction.mobileClearProbe,
      view01Passes: report.interaction.view01Repeatability.filter(Boolean).length
    }, null, 2));
    process.exitCode = 1;
  }

  await browser.close();
  server.close();

  fs.writeFileSync(path.join(OUT, 'ux03-report.json'), JSON.stringify(report, null, 2));
  line('\nReport written: ' + path.join(OUT, 'ux03-report.json'));
  line('Screenshots: ' + report.screenshots.join(', '));
})().catch(e => { console.error('FATAL', e); process.exit(1); });
