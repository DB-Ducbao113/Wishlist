// =====================================================================
// DREAM VAULT V16.1 - F4 INTERACTION AUDIT
// ---------------------------------------------------------------------
// Serves the real repo, stubs ONLY the cloud module, seeds a fixture set,
// then, in a real browser:
//   1. enumerates every interactive element on eight surfaces
//      (hero, dashboard, collection, product card, quick view, form,
//       purchase dialog, account, mobile dock)
//   2. measures which CSS rules were actually used during load (CDP
//      CSS rule coverage) and which JS bytes ran (page coverage)
//   3. reports small targets, unnamed controls and layout overflow
//
// usage: node v16_4-f4-audit.js [repoRoot] [width]
// =====================================================================
const puppeteer = require('puppeteer-core');
const http = require('http');
const fs = require('fs');
const path = require('path');

const CHROME = process.env.CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT = process.argv[2] || path.join(__dirname, '..', '..');
const WIDTH = Number(process.argv[3]) || 1440;
const PORT = 8140;
const OUT = path.join(__dirname, '..', '..', 'qa-out');
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
const state = { user: null, opts: null, syncs: [], statuses: [], uploads: 0 };
window.__cloud = state;
export async function initializeWishlistCloud(opts){
  state.opts = opts;
  window.__cloudSetUser = (u) => { state.user = u; if(opts.onUserChanged) opts.onUserChanged(u ? u.uid : null); };
  window.__cloudRemote = (items, initial) => { if(opts.onRemoteItems) opts.onRemoteItems(items, !!initial); };
  window.__cloudStatus = (kind, email) => { state.statuses.push(kind); if(opts.onStatus) opts.onStatus(kind, email || ''); };
  window.__cloudSyncs = () => state.syncs;
  setTimeout(() => { window.__cloudSetUser(null); window.__cloudStatus('local', ''); }, 0);
  return {
    get user(){ return state.user; },
    signIn: async () => {},
    signOut: async () => { state.user = null; if(opts.onUserChanged) opts.onUserChanged(null); if(opts.onStatus) opts.onStatus('local',''); },
    syncItems: (items) => { state.syncs.push(JSON.parse(JSON.stringify(items))); return Promise.resolve(); },
    uploadImage: async () => { state.uploads++; return 'https://cdn.example/img.jpg'; }
  };
}
`;

const FIXTURE = () => {
  const st = ['wish', 'saving', 'ordered', 'purchased'];
  const pr = ['high', 'medium', 'low'];
  const cats = ['Công nghệ', 'Nhà bếp', 'Thể thao', ''];
  const out = [];
  for (let i = 0; i < 12; i++) {
    const item = {
      id: 'a' + (i + 1),
      name: 'Món kiểm thử ' + (i + 1),
      price: 1000000 * ((i % 5) + 1),
      image: '',
      link: i % 3 === 0 ? 'https://example.com/mua/' + i : '',
      status: st[i % 4],
      priority: pr[i % 3],
      category: cats[i % cats.length],
      note: i % 2 === 0 ? 'Ghi chú cho món ' + (i + 1) : '',
      createdAt: 1700000000000 + i
    };
    if (item.status === 'purchased') {
      item.paidAmount = item.price - 100000;
      item.purchasedAt = 1750000000000 + i;
      item.previousStatus = 'wish';
    }
    out.push(item);
  }
  return out;
};

// ---------------------------------------------------------------------
// In-page scanner
// ---------------------------------------------------------------------
const SCAN = () => {
  const norm = (s) => {
    if (s === null || s === undefined) return '';
    const str = String(s);
    let out = '';
    let pending = false;
    for (let i = 0; i < str.length; i++) {
      const ch = str[i];
      const isSpace = ch.trim() === '';
      if (isSpace) { pending = out.length > 0; continue; }
      if (pending) { out += ' '; pending = false; }
      out += ch;
    }
    return out;
  };

  const SECTION_SELECTORS = [
    ['quickview', '#qv'],
    ['form', '#dlg'],
    ['purchase-dialog', '#pd'],
    ['dock', '.mobile-dock'],
    ['product-card', '.wishlist-card'],
    ['dashboard', '.dashboard-panel'],
    ['collection-toolbar', '.collection-toolbar'],
    ['hero', '[class*="hero"]'],
    ['account', '[class*="sync"]'],
    ['header', 'header'],
    ['footer', 'footer']
  ];

  const sectionOf = (el) => {
    let n = el;
    while (n && n.nodeType === 1 && n !== document.documentElement) {
      for (const [name, sel] of SECTION_SELECTORS) {
        try { if (n.matches(sel)) return name; } catch (e) {}
      }
      n = n.parentElement;
    }
    return 'other';
  };

  const name = (el) => {
    const aria = el.getAttribute('aria-label');
    if (aria) return norm(aria);
    const labelledby = el.getAttribute('aria-labelledby');
    if (labelledby) {
      const host = document.getElementById(labelledby);
      if (host) return norm(host.textContent);
    }
    // A real <label for="…"> is an accessible name too. Resolving it here is
    // why the earlier "1 unnamed control" (#fFile) was a scanner false
    // positive: the label has always existed, the scanner never looked for it.
    if (el.id) {
      const lab = document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
      if (lab) return norm(lab.textContent).slice(0, 60);
    }
    const t = norm(el.textContent);
    if (t) return t.slice(0, 60);
    const title = el.getAttribute('title');
    if (title) return norm(title);
    const ph = el.getAttribute('placeholder');
    if (ph) return norm(ph);
    const val = el.value;
    if (val) return norm(val).slice(0, 60);
    return '';
  };

  const selector = 'button, a[href], input, select, textarea, summary, [role="button"], [onclick], [tabindex]';
  const els = [...document.querySelectorAll(selector)];

  const rows = els.map((el, i) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const tag = el.tagName;
    const nativeFocusable = tag === 'BUTTON' || tag === 'A' || tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || tag === 'SUMMARY';
    const isDialogHost = el === el.closest('dialog');
    const visible = r.width > 1 && r.height > 1 && cs.visibility !== 'hidden';
    return {
      i,
      surface: sectionOf(el),
      tag,
      id: el.id || '',
      cls: (el.className && typeof el.className === 'string' ? el.className : '').split(' ').filter(Boolean).slice(0, 3).join(' '),
      type: el.getAttribute('type') || '',
      role: el.getAttribute('role') || '',
      name: name(el),
      w: Math.round(r.width),
      h: Math.round(r.height),
      visible,
      inDialog: !!el.closest('dialog'),
      disabled: el.disabled === true || el.getAttribute('aria-disabled') === 'true',
      rawDisabled: el.disabled === true,
      pressed: el.getAttribute('aria-pressed'),
      expanded: el.getAttribute('aria-expanded'),
      haspopup: el.getAttribute('aria-haspopup'),
      controls: el.getAttribute('aria-controls'),
      tabindex: el.getAttribute('tabindex'),
      nativeFocusable,
      divButton: !nativeFocusable && el.getAttribute('role') === 'button',
      tiny: visible && (r.height < 24 || r.width < 24),
      unnamed: !name(el),
      href: el.getAttribute('href') || '',
      target: el.getAttribute('target') || '',
      rel: el.getAttribute('rel') || ''
    };
  });

  const geo = {
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
    bodyScrollWidth: document.body.scrollWidth
  };

  return { rows, geo };
};

// ---------------------------------------------------------------------
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

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });

  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  const errors = [];
  const dialogs = [];

  await page.setViewport({ width: WIDTH, height: 1000, deviceScaleFactor: 1 });
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
  await page.evaluateOnNewDocument((items) => {
    try {
      localStorage.clear();
      localStorage.setItem('wishlist.guest.items', JSON.stringify(items));
    } catch (e) {}
  }, FIXTURE());

  page.on('pageerror', e => errors.push('pageerror: ' + String(e && e.message || e)));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('dialog', async d => { dialogs.push(d.message()); try { await d.accept(); } catch (e) {} });

  await page.setRequestInterception(true);
  page.on('request', req => {
    if (/wishlist-cloud\.js/.test(req.url())) {
      return req.respond({ status: 200, contentType: 'text/javascript', body: MOCK });
    }
    req.continue();
  });

  // ---- CDP: style sheet inventory + CSS rule coverage ------------------
  const client = await page.target().createCDPSession();
  await client.send('DOM.enable');
  await client.send('CSS.enable');
  const sheets = new Map();
  client.on('CSS.styleSheetAdded', (ev) => {
    sheets.set(ev.header.styleSheetId, {
      href: ev.header.sourceURL || '(inline)',
      length: ev.header.length || 0
    });
  });

  await page.coverage.startJSCoverage({ reportAnonymousScripts: true });
  await client.send('CSS.startRuleUsageTracking');

  await page.goto(`http://localhost:${PORT}/wishlist.html`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction('typeof window.__cloudSetUser === "function"', { timeout: 15000 });
  await sleep(1200);

  // ---- surface 1: the base page ---------------------------------------
  const base = await page.evaluate(SCAN);
  const metrics = await page.metrics();

  // ---- surface 2: Quick View ------------------------------------------
  const qvId = await page.evaluate(() => items[0].id);
  await page.evaluate((id) => openQuickView(id, document.getElementById('btnAdd')), qvId);
  await sleep(600);
  const quickview = await page.evaluate(SCAN);
  await page.evaluate(() => closeQuickView());
  await sleep(600);

  // ---- surface 3: the add/edit form ----------------------------------
  await page.evaluate(() => openForm(null));
  await sleep(500);
  const form = await page.evaluate(SCAN);
  await page.evaluate(() => document.getElementById('dlg').close());
  await sleep(400);

  // ---- surface 4: the purchase dialog ---------------------------------
  const pendingId = await page.evaluate(() => {
    const it = items.find(x => x.status !== 'purchased');
    return it ? it.id : null;
  });
  if (pendingId) {
    await page.evaluate((id) => openPurchaseDialog(id, document.getElementById('btnAdd')), pendingId);
    await sleep(500);
  }
  const purchase = await page.evaluate(SCAN);
  await page.evaluate(() => { const pd = document.getElementById('pd'); if (pd.open) pd.close(); });
  await sleep(400);

  // ---- coverage -------------------------------------------------------
  const ruleUsage = await client.send('CSS.stopRuleUsageTracking');
  const jsCoverage = await page.coverage.stopJSCoverage();

  // Aggregate rule coverage per sheet.
  const perSheet = new Map();
  const addSheet = (href, length) => {
    if (!perSheet.has(href)) perSheet.set(href, { href, bytes: length, rules: 0, used: 0, usedBytes: 0, unusedBytes: 0 });
    return perSheet.get(href);
  };
  // Seed from the DOM-CSS inventory so 0-rule sheets still appear.
  for (const s of sheets.values()) addSheet(s.href, s.length);

  let totalRules = 0;
  let totalUsed = 0;
  ruleUsage.ruleUsage.forEach((r) => {
    const meta = sheets.get(r.styleSheetId);
    if (!meta) return;
    const rec = addSheet(meta.href, meta.length);
    const size = Math.max(0, (r.endOffset || 0) - (r.startOffset || 0));
    rec.rules++;
    totalRules++;
    if (r.used) { rec.used++; totalUsed++; rec.usedBytes += size; }
    else { rec.unusedBytes += size; }
  });

  const js = jsCoverage.map(s => ({
    url: s.url,
    total: s.text.length,
    used: s.ranges.reduce((n, r) => n + (r.end - r.start), 0)
  })).sort((a, b) => b.total - a.total);

  const flat = [...base.rows, ...quickview.rows, ...form.rows, ...purchase.rows];

  const report = {
    generatedAt: new Date().toISOString(),
    repo: ROOT,
    width: WIDTH,
    metrics,
    errors,
    nativeDialogs: dialogs,
    surfaces: {
      base: base.rows,
      quickview: quickview.rows,
      form: form.rows,
      purchase: purchase.rows
    },
    geom: { base: base.geo, quickview: quickview.geo, form: form.geo, purchase: purchase.geo },
    css: {
      sheets: [...perSheet.values()].sort((a, b) => b.unusedBytes - a.unusedBytes),
      totalRules,
      totalUsed,
      totalUnused: totalRules - totalUsed,
      lastRunUnusedBytes: [...perSheet.values()].reduce((n, s) => n + s.unusedBytes, 0),
      lastRunUsedBytes: [...perSheet.values()].reduce((n, s) => n + s.usedBytes, 0)
    },
    js,
    counts: {
      interactive: flat.length,
      visible: flat.filter(r => r.visible).length,
      tiny: base.rows.filter(r => r.visible && r.tiny).length,
      unnamed: flat.filter(r => r.visible && r.unnamed).length,
      divButton: base.rows.filter(r => r.divButton).length
    }
  };

  fs.writeFileSync(path.join(OUT, 'f4-audit.json'), JSON.stringify(report, null, 1));

  // ---- console summary -------------------------------------------------
  console.log('== F4 AUDIT @ ' + WIDTH + 'px ==');
  console.log('errors: ' + errors.length + (errors.length ? ' -> ' + errors.slice(0, 3).join(' | ') : ''));
  console.log('native dialogs seen: ' + dialogs.length + (dialogs.length ? ' -> ' + dialogs.slice(0, 3).join(' | ') : ''));
  console.log('');
  ['base', 'quickview', 'form', 'purchase'].forEach(s => {
    const rows = report.surfaces[s].filter(r => r.visible);
    console.log('--- surface ' + s + ': ' + rows.length + ' visible controls ---');
    rows.forEach(r => {
      console.log('  ' + [
        r.tag + (r.type ? '[' + r.type + ']' : ''),
        (r.id ? '#' + r.id : '.' + r.cls),
        r.surface,
        r.w + 'x' + r.h,
        r.role ? 'role=' + r.role : '',
        r.disabled ? (r.rawDisabled ? 'disabled' : 'aria-disabled') : '',
        r.tiny ? 'TINY' : '',
        r.divButton ? 'DIV-BUTTON' : '',
        r.unnamed ? 'NO-NAME' : '',
        JSON.stringify(r.name)
      ].filter(Boolean).join('  '));
    });
  });
  console.log('');
  console.log('== CSS rule coverage (Chrome, this load) ==');
  console.log('bookkeeping rules: ' + totalRules + '  used: ' + totalUsed + '  unused: ' + (totalRules - totalUsed));
  console.log('used bytes: ' + report.css.lastRunUsedBytes + '  unused bytes: ' + report.css.lastRunUnusedBytes);
  console.log('stylesheets: ' + [...perSheet.values()].length);
  console.log('top 15 by unused bytes:');
  report.css.sheets.slice(0, 15).forEach(s => {
    console.log('  ' + String(s.unusedBytes).padStart(7) + ' unused  ' +
      String(s.used).padStart(4) + '/' + String(s.rules).padStart(4) + ' rules  ' +
      s.href.split('/').slice(-1)[0]);
  });
  console.log('');
  console.log('== JS coverage ==');
  js.slice(0, 6).forEach(s => {
    console.log('  ' + String(s.total - s.used).padStart(7) + ' unused of ' + String(s.total).padStart(7) +
      '  ' + (s.url ? s.url.split('/').slice(-1)[0] : '(inline)'));
  });
  console.log('');
  console.log('== element counts ==');
  console.log(JSON.stringify(report.counts));
  console.log('');
  console.log('== metrics ==');
  console.log('Nodes: ' + metrics.Nodes + '  Listeners: ' + metrics.JSEventListeners +
    '  JSHeapUsed: ' + metrics.JSHeapUsedSize + '  Layouts: ' + metrics.LayoutCount);
  console.log('wrote ' + path.join(OUT, 'f4-audit.json'));

  await browser.close();
  server.close();
})();

server.listen(PORT, () => {});
