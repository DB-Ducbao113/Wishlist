// =====================================================================
// UX-04 AUDIT — Quick Add / product cards / Quick View / journeys.
// Serves the real repo, stubs ONLY the cloud module, and measures the
// real DOM/computed styles in a real browser. Read-only: it changes no
// product data beyond what a test journey must.
// usage: node scripts/qa/ux04-audit.js
// =====================================================================
const puppeteer = require('puppeteer-core');
const http = require('http');
const fs = require('fs');
const path = require('path');

const CHROME = process.env.CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT = path.join(__dirname, '..', '..');
const PORT = 8230;
const OUT = path.join(ROOT, 'qa-out', 'ux04');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon'
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

const ITEM = i => ({
  id: 'ux4-' + i, name: 'Món ' + i, price: 100000 + i * 1000, image: '', link: '',
  status: ['wish', 'saving', 'ordered', 'purchased'][i % 4],
  priority: ['low', 'medium', 'high'][i % 3], category: 'Nhóm ' + (i % 3),
  note: 'ghi chú ' + i, createdAt: 1700000000000 + i
});
const makeItems = n => Array.from({ length: n }, (_, i) => ITEM(i + 1));

async function page(browser, w, h, seed, mobile) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 1, isMobile: !!mobile, hasTouch: !!mobile });
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
  await page.evaluateOnNewDocument((s) => {
    try {
      localStorage.clear();
      if (s && s.length) localStorage.setItem('wishlist.guest.items', JSON.stringify(s));
    } catch (e) {}
    window.__cloudStatus = () => {};
  }, seed);
  await page.setRequestInterception(true);
  page.on('request', (r) => {
    if (/wishlist-cloud\.js/.test(r.url())) return r.respond({ status: 200, contentType: 'application/javascript', body: MOCK });
    return r.continue();
  });
  // The delete / reset confirmations are native confirm() dialogs. Accept them
  // so the journey can be driven end to end.
  page.on('dialog', async (d) => { try { await d.accept(); } catch (e) {} });
  await page.goto(`http://127.0.0.1:${PORT}/wishlist.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => {
    const g = document.getElementById('grid');
    return g && (g.children.length > 0 || !document.getElementById('empty').classList.contains('hidden'));
  }, { timeout: 15000 });
  await sleep(500);
  return { ctx, page };
}

const log = (...a) => console.log(...a);
const head = (s) => console.log('\n=== ' + s + ' ===');
const R = {};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--hide-scrollbars', '--force-device-scale-factor=1']
  });

  // ===================================================================
  head('A. DUPLICATE IDS (live DOM)');
  {
    const { ctx, page } = await page_(browser, 1440, 900, makeItems(3));
    const dupes = await page.evaluate(() => {
      const seen = new Map();
      document.querySelectorAll('[id]').forEach(el => {
        const id = el.id;
        seen.set(id, (seen.get(id) || 0) + 1);
      });
      return [...seen.entries()].filter(([, n]) => n > 1).map(([id, n]) => ({ id, n }));
    });
    log('  duplicate ids: ' + (dupes.length ? JSON.stringify(dupes) : 'none'));
    R.duplicateIds = dupes;
    await ctx.close();
  }

  // ===================================================================
  head('B. QUICK ADD — form shape and friction');
  {
    const { ctx, page } = await page_(browser, 1440, 900, makeItems(3));
    await page.click('#btnAdd');
    await sleep(500);
    const f = await page.evaluate(() => {
      const dlg = document.getElementById('dlg');
      const body = dlg.querySelector('.product-dialog__body');
      const fields = [...dlg.querySelectorAll('input, select, textarea')].map(el => ({
        id: el.id, tag: el.tagName.toLowerCase(), required: el.required,
        inSection: el.closest('section') ? el.closest('section').getAttribute('aria-label') : null,
        visible: (() => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; })()
      }));
      const sections = [...dlg.querySelectorAll('.product-dialog__section')].map(s => ({
        label: s.getAttribute('aria-label'),
        h: Math.round(s.getBoundingClientRect().height),
        fields: s.querySelectorAll('input, select, textarea').length
      }));
      return {
        open: dlg.open,
        activeEl: document.activeElement ? (document.activeElement.id || document.activeElement.tagName) : null,
        bodyScrollH: body ? body.scrollHeight : 0,
        bodyClientH: body ? body.clientHeight : 0,
        totalFields: fields.length,
        requiredFields: fields.filter(x => x.required).map(x => x.id),
        fields, sections,
        dlgRect: dlg.getBoundingClientRect().toJSON()
      };
    });
    log('  dialog open: ' + f.open + '   focus on open: ' + f.activeEl);
    log('  body scrollHeight/clientHeight: ' + f.bodyScrollH + ' / ' + f.bodyClientH +
        '  (scrollable: ' + (f.bodyScrollH > f.bodyClientH + 2) + ')');
    log('  total fields: ' + f.totalFields + '   required: ' + JSON.stringify(f.requiredFields));
    log('  sections:');
    f.sections.forEach(s => log('    - ' + s.label + '  fields=' + s.fields + ' h=' + s.h));
    R.addForm = f;
    await ctx.close();
  }

  // ===================================================================
  head('C. QUICK ADD — name only (no price)');
  {
    const { ctx, page } = await page_(browser, 1440, 900, []);
    await page.click('#btnAdd');
    await sleep(300);
    await page.type('#fName', 'Chỉ có tên');
    await page.click('#form button[type="submit"]');
    await sleep(600);
    const res = await page.evaluate(() => ({
      dlgOpen: document.getElementById('dlg').open,
      toast: (document.querySelector('.toast') || {}).textContent || null,
      items: items.length,
      cards: document.querySelectorAll('#grid .wishlist-card').length
    }));
    log('  name-only submit -> ' + JSON.stringify(res));
    R.nameOnly = res;
    await ctx.close();
  }

  // ===================================================================
  head('D. QUICK ADD — double submit (duplicate submission)');
  {
    const { ctx, page } = await page_(browser, 1440, 900, []);
    await page.click('#btnAdd');
    await sleep(300);
    await page.type('#fName', 'Nhân đôi');
    await page.type('#fPrice', '1000');
    // two submits in the same tick, like a double click
    await page.evaluate(() => {
      const b = document.querySelector('#form button[type="submit"]');
      b.click(); b.click(); b.click();
    });
    await sleep(900);
    const res = await page.evaluate(() => ({
      items: items.length,
      names: items.map(i => i.name),
      dlgOpen: document.getElementById('dlg').open
    }));
    log('  triple-click submit -> ' + JSON.stringify(res));
    log('  DUPLICATE SUBMISSION: ' + (res.items > 1 ? 'YES (bug)' : 'no'));
    R.doubleSubmit = res;
    await ctx.close();
  }

  // ===================================================================
  head('E. QUICK ADD — unsaved input preserved on failure');
  {
    const { ctx, page } = await page_(browser, 1440, 900, []);
    await page.click('#btnAdd');
    await sleep(300);
    await page.type('#fName', 'Giữ dữ liệu');
    await page.type('#fPrice', '4200');
    await page.type('#fNote', 'ghi chú quan trọng');
    // The link lives in the optional group, so open it first — that is the
    // whole point of the progressive disclosure.
    await page.click('#fMoreToggle');
    await sleep(350);
    const openState = await page.evaluate(() => ({
      expanded: document.getElementById('fMoreToggle').getAttribute('aria-expanded'),
      panelHidden: document.getElementById('fMorePanel').hidden,
      linkVisible: (() => { const r = document.getElementById('fLink').getBoundingClientRect(); return r.width > 0; })()
    }));
    log('  disclosure open: ' + JSON.stringify(openState));
    await page.type('#fLink', 'http://');
    await page.click('#form button[type="submit"]');
    await sleep(700);
    const res = await page.evaluate(() => ({
      dlgOpen: document.getElementById('dlg').open,
      toast: (document.querySelector('.toast') || {}).textContent || null,
      inlineError: (document.getElementById('fLinkError').textContent || '').trim(),
      ariaInvalid: document.getElementById('fLink').getAttribute('aria-invalid'),
      name: document.getElementById('fName').value,
      price: document.getElementById('fPrice').value,
      note: document.getElementById('fNote').value,
      link: document.getElementById('fLink').value
    }));
    log('  invalid link submit -> ' + JSON.stringify(res));
    R.preserveInput = res;
    R.disclosure = openState;
    await ctx.close();
  }

  // ===================================================================
  head('E2. QUICK ADD — inline validation on the name');
  {
    const { ctx, page } = await page_(browser, 1440, 900, []);
    await page.click('#btnAdd');
    await sleep(300);
    await page.click('#form button[type="submit"]');
    await sleep(500);
    const res = await page.evaluate(() => ({
      dlgOpen: document.getElementById('dlg').open,
      toast: (document.querySelector('.toast') || {}).textContent || null,
      inlineError: (document.getElementById('fNameError').textContent || '').trim(),
      inlineHidden: document.getElementById('fNameError').hidden,
      ariaInvalid: document.getElementById('fName').getAttribute('aria-invalid'),
      describedBy: document.getElementById('fName').getAttribute('aria-describedby'),
      focus: document.activeElement ? document.activeElement.id : null
    }));
    log('  empty name submit -> ' + JSON.stringify(res));
    // typing clears the inline error
    await page.type('#fName', 'A');
    await sleep(200);
    const after = await page.evaluate(() => ({
      inlineHidden: document.getElementById('fNameError').hidden,
      ariaInvalid: document.getElementById('fName').getAttribute('aria-invalid')
    }));
    log('  after typing -> ' + JSON.stringify(after));
    R.inlineValidation = { first: res, afterTyping: after };
    await ctx.close();
  }

  // ===================================================================
  head('E3. QUICK ADD — disclosure restores hidden values on edit');
  {
    const { ctx, page } = await page_(browser, 1440, 900, []);
    await page.click('#btnAdd');
    await sleep(300);
    await page.type('#fName', 'Có mục tiêu');
    await page.click('#fMoreToggle');
    await sleep(300);
    await page.evaluate(() => { document.getElementById('fSavingGoal').value = '900000'; });
    await page.click('#form button[type="submit"]');
    await sleep(700);
    // reopen the edit form for that item
    await page.evaluate(() => {
      const it = items.find(x => x.name === 'Có mục tiêu');
      openForm(it);
    });
    await sleep(500);
    const res = await page.evaluate(() => ({
      expanded: document.getElementById('fMoreToggle').getAttribute('aria-expanded'),
      panelHidden: document.getElementById('fMorePanel').hidden,
      goal: document.getElementById('fSavingGoal').value
    }));
    log('  edit an item with a goal -> ' + JSON.stringify(res));
    R.disclosureRestore = res;
    await ctx.close();
  }

  // ===================================================================
  head('F. PRODUCT CARD — hierarchy, buttons, keyboard reachability');
  {
    const { ctx, page } = await page_(browser, 1440, 900, makeItems(4));
    const card = await page.evaluate(() => {
      const c = document.querySelector('#grid .wishlist-card');
      const R2 = e => { const r = e.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
      const btns = [...c.querySelectorAll('button, a')].map(b => ({
        tag: b.tagName.toLowerCase(),
        cls: b.className,
        text: (b.textContent || '').trim().slice(0, 22),
        tabIndex: b.tabIndex,
        rect: R2(b),
        visible: R2(b).w > 0 && R2(b).h > 0,
        opacity: getComputedStyle(b).opacity,
        display: getComputedStyle(b).display
      }));
      const badges = [...c.querySelectorAll('.product-card__badges .badge')].map(b => b.textContent.trim());
      return {
        title: (c.querySelector('.product-card__title') || {}).textContent,
        price: (c.querySelector('.product-card__price') || {}).textContent,
        badges, buttonCount: btns.length, buttons: btns,
        hasImage: !!c.querySelector('.product-media__frame img'),
        hasStatus: !!c.querySelector('.status-chip, .badge'),
        cardRect: R2(c)
      };
    });
    log('  title="' + card.title + '"  price=' + card.price);
    log('  badges: ' + JSON.stringify(card.badges));
    log('  buttons on the card: ' + card.buttonCount);
    card.buttons.forEach(b => log('    <' + b.tag + '> "' + b.text + '" tabIndex=' + b.tabIndex +
      ' visible=' + b.visible + ' op=' + b.opacity + ' disp=' + b.display + ' cls=' + String(b.cls).slice(0, 40)));
    R.card = card;
    await ctx.close();
  }

  // ===================================================================
  head('G. PRODUCT CARD — keyboard traversal of a card');
  {
    const { ctx, page } = await page_(browser, 1440, 900, makeItems(4));
    // focus the first card's view button, then Tab through the card
    const seq = [];
    await page.evaluate(() => {
      const b = document.querySelector('#grid .wishlist-card .product-card__view');
      b.focus();
    });
    for (let i = 0; i < 7; i++) {
      const s = await page.evaluate(() => {
        const a = document.activeElement;
        return { tag: a ? a.tagName.toLowerCase() : null, cls: a ? String(a.className).slice(0, 34) : null, text: a ? (a.textContent || '').trim().slice(0, 18) : null };
      });
      seq.push(s.tag + ':' + s.text);
      await page.keyboard.press('Tab');
    }
    log('  tab order from the card view button:');
    log('    ' + seq.join('  ->  '));
    R.cardTabOrder = seq;
    await ctx.close();
  }

  // ===================================================================
  head('H. PRODUCT CARD — touch: the "⋯" menu without hover');
  {
    const { ctx, page } = await page_(browser, 390, 844, makeItems(3), true);
    const res = await page.evaluate(async () => {
      const trig = document.querySelector('#grid .wishlist-card .card-more__trigger');
      const cs = getComputedStyle(trig);
      const r = trig.getBoundingClientRect();
      const before = document.querySelector('.card-more__menu').dataset.open;
      trig.click();
      await new Promise(r2 => setTimeout(r2, 350));
      const menu = document.querySelector('.card-more__menu');
      const mr = menu.getBoundingClientRect();
      const items = [...menu.querySelectorAll('button')].map(b => ({ text: b.textContent.trim(), tabIndex: b.tabIndex, h: Math.round(b.getBoundingClientRect().height) }));
      return {
        triggerVisible: r.width > 0 && r.height > 0,
        triggerH: Math.round(r.height), display: cs.display,
        before, after: menu.dataset.open,
        menuVisible: mr.width > 0 && mr.height > 0,
        menuRect: { x: Math.round(mr.x), y: Math.round(mr.y), w: Math.round(mr.width), h: Math.round(mr.height) },
        items, docW: document.documentElement.scrollWidth, winW: window.innerWidth
      };
    });
    log('  trigger visible=' + res.triggerVisible + ' h=' + res.triggerH + ' display=' + res.display);
    log('  menu open ' + res.before + ' -> ' + res.after + '   visible=' + res.menuVisible);
    log('  menu items: ' + JSON.stringify(res.items));
    log('  horizontal overflow: ' + (res.docW > res.winW + 1));
    R.touchMenu = res;
    await ctx.close();
  }

  // ===================================================================
  head('I. QUICK VIEW — desktop split');
  {
    const { ctx, page } = await page_(browser, 1440, 900, makeItems(3));
    await page.click('#grid .wishlist-card .product-card__view');
    await sleep(800);
    const qv = await page.evaluate(() => {
      const d = document.getElementById('qv');
      const R2 = e => { if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
      const panel = d.querySelector('.quick-view__panel');
      const stage = d.querySelector('.quick-view__stage');
      const cta = d.querySelector('.quick-view__cta');
      return {
        open: d.open,
        stage: R2(stage), panel: R2(panel), cta: R2(cta),
        panelScrollH: panel ? panel.scrollHeight : 0,
        panelClientH: panel ? panel.clientHeight : 0,
        title: (d.querySelector('#qvTitle') || {}).textContent,
        price: (d.querySelector('#qvPrice') || {}).textContent,
        status: (d.querySelector('#qvStatus') || {}).textContent,
        priority: (d.querySelector('#qvPriority') || {}).textContent,
        ctaButtons: [...d.querySelectorAll('.quick-view__cta button, .quick-view__cta a')].map(b => ({
          id: b.id, text: (b.textContent || '').trim(), hidden: b.hidden,
          rect: R2(b), h: Math.round(b.getBoundingClientRect().height)
        })),
        activeEl: document.activeElement ? (document.activeElement.id || document.activeElement.tagName) : null,
        docW: document.documentElement.scrollWidth, winW: window.innerWidth
      };
    });
    log('  open=' + qv.open + '  focus=' + qv.activeEl);
    log('  stage=' + JSON.stringify(qv.stage) + '  panel=' + JSON.stringify(qv.panel));
    log('  panel scrollHeight/clientHeight: ' + qv.panelScrollH + '/' + qv.panelClientH);
    log('  cta=' + JSON.stringify(qv.cta));
    log('  cta buttons: ' + JSON.stringify(qv.ctaButtons));
    R.qvDesktop = qv;
    await ctx.close();
  }

  // ===================================================================
  head('J. QUICK VIEW — mobile bottom sheet');
  for (const W of [390, 320]) {
    const { ctx, page } = await page_(browser, W, 844, makeItems(3), true);
    await page.click('#grid .wishlist-card .product-card__view');
    await sleep(900);
    const qv = await page.evaluate(() => {
      const d = document.getElementById('qv');
      const R2 = e => { if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), bottom: Math.round(r.bottom) }; };
      const panel = d.querySelector('.quick-view__panel');
      const cs = getComputedStyle(panel);
      const dcs = getComputedStyle(d);
      const cta = d.querySelector('.quick-view__cta');
      const close = d.querySelector('#qvClose');
      const cr = close ? close.getBoundingClientRect() : null;
      // is any CTA overlapping the note / savings text?
      const note = d.querySelector('#qvNote');
      const nr = note ? note.getBoundingClientRect() : null;
      const ctar = cta ? cta.getBoundingClientRect() : null;
      const overlap = (nr && ctar) ? !(nr.bottom < ctar.top || nr.top > ctar.bottom) : false;
      // UX-04.3 — does any content show THROUGH the action bar? The bar is
      // sampled at the pixel level: an opaque band must not reveal the text
      // that scrolls behind it.
      const ctaCs = cta ? getComputedStyle(cta) : null;
      const ctaBg = ctaCs ? ctaCs.backgroundColor : '';
      const ctaImage = ctaCs ? ctaCs.backgroundImage : 'none';
      // measure a title that is currently behind the band
      const title = d.querySelector('#qvTitle');
      const tr = title ? title.getBoundingClientRect() : null;
      const titleBehindBand = !!(tr && ctar && tr.bottom > ctar.top && tr.top < ctar.bottom);
      return {
        dialogRect: R2(d), panelRect: R2(panel),
        panelPosition: cs.position, panelOverflowY: cs.overflowY,
        panelScrollH: panel ? panel.scrollHeight : 0, panelClientH: panel ? panel.clientHeight : 0,
        ctaRect: R2(cta), ctaPosition: cta ? getComputedStyle(cta).position : null,
        ctaBg, ctaImage, ctaOpaque: /rgba\(0, 0, 0, 0\)/.test(ctaBg) ? false : true,
        ctaHasGradient: ctaImage && ctaImage !== 'none',
        titleBehindBand,
        closeRect: cr ? { x: Math.round(cr.x), y: Math.round(cr.y), w: Math.round(cr.width), h: Math.round(cr.height) } : null,
        closeInViewport: cr ? (cr.top >= 0 && cr.bottom <= window.innerHeight && cr.left >= 0 && cr.right <= window.innerWidth) : false,
        noteCtaOverlap: overlap,
        ctaButtons: [...d.querySelectorAll('.quick-view__cta button, .quick-view__cta a')].map(b => ({
          id: b.id, text: (b.textContent || '').trim(), hidden: b.hidden,
          h: Math.round(b.getBoundingClientRect().height), w: Math.round(b.getBoundingClientRect().width),
          visible: b.getBoundingClientRect().width > 0
        })),
        docW: document.documentElement.scrollWidth, winW: window.innerWidth,
        winH: window.innerHeight
      };
    });
    log('  --- ' + W + 'px ---');
    log('  dialog=' + JSON.stringify(qv.dialogRect));
    log('  panel pos=' + qv.panelPosition + ' overflowY=' + qv.panelOverflowY + ' scroll=' + qv.panelScrollH + '/' + qv.panelClientH);
    log('  cta pos=' + qv.ctaPosition + ' rect=' + JSON.stringify(qv.ctaRect));
    log('  cta background=' + qv.ctaBg + '  opaque=' + qv.ctaOpaque + '  gradient=' + qv.ctaHasGradient);
    log('  title behind the band=' + qv.titleBehindBand + '  (ghosting risk)');
    log('  close btn=' + JSON.stringify(qv.closeRect) + ' inViewport=' + qv.closeInViewport);
    log('  note/cta overlap=' + qv.noteCtaOverlap + '   horizontal overflow=' + (qv.docW > qv.winW + 1));
    log('  cta buttons: ' + JSON.stringify(qv.ctaButtons));
    R['qvMobile' + W] = qv;
    await ctx.close();
  }

  // ===================================================================
  head('K. JOURNEYS');
  {
    const { ctx, page } = await page_(browser, 1440, 900, []);

    // J1 empty -> add first item
    await page.click('#emptyAction');
    await sleep(400);
    await page.type('#fName', 'Món đầu tiên');
    await page.type('#fPrice', '150000');
    await page.click('#form button[type="submit"]');
    await sleep(700);
    const j1 = await page.evaluate(() => ({
      cards: document.querySelectorAll('#grid .wishlist-card').length,
      emptyHidden: document.getElementById('empty').classList.contains('hidden'),
      toast: (document.querySelector('.toast') || {}).textContent || null
    }));
    log('  J1 empty -> add first: ' + JSON.stringify(j1));

    // J2 open quick view
    await page.click('#grid .wishlist-card .product-card__view');
    await sleep(700);
    const j2 = await page.evaluate(() => ({
      open: document.getElementById('qv').open,
      title: document.getElementById('qvTitle').textContent
    }));
    log('  J2 open quick view: ' + JSON.stringify(j2));

    // J3 quick view -> edit -> save
    await page.click('#qvEdit');
    await sleep(800);
    const j3a = await page.evaluate(() => ({
      dlgOpen: document.getElementById('dlg').open,
      qvOpen: document.getElementById('qv').open,
      name: document.getElementById('fName').value,
      focus: document.activeElement ? (document.activeElement.id || document.activeElement.tagName) : null
    }));
    await page.evaluate(() => { document.getElementById('fName').value = 'Đã sửa tên'; });
    await page.click('#form button[type="submit"]');
    await sleep(700);
    const j3b = await page.evaluate(() => ({
      name: items[0] && items[0].name,
      cardTitle: (document.querySelector('#grid .product-card__title') || {}).textContent
    }));
    log('  J3 QV -> edit: ' + JSON.stringify(j3a) + '  then save: ' + JSON.stringify(j3b));

    // J4 change status from the card menu
    await page.click('#grid .wishlist-card .card-more__trigger');
    await sleep(300);
    await page.click('#grid .wishlist-card .card-more__menu .status-chip');
    await sleep(500);
    const j4 = await page.evaluate(() => ({ status: items[0] && items[0].status }));
    log('  J4 change status (card menu): ' + JSON.stringify(j4));

    // J5 mark purchased -> confirm dialog
    await page.click('#grid .wishlist-card .mark-purchased');
    await sleep(600);
    const j5a = await page.evaluate(() => ({
      pdOpen: document.getElementById('pd').open,
      qvOpen: document.getElementById('qv').open,
      dlgOpen: document.getElementById('dlg').open
    }));
    await page.click('#pdConfirm');
    await sleep(700);
    const j5b = await page.evaluate(() => ({
      status: items[0] && items[0].status, pdOpen: document.getElementById('pd').open
    }));
    log('  J5 mark purchased: dialog=' + JSON.stringify(j5a) + ' after confirm=' + JSON.stringify(j5b));

    // J6 savings goal from quick view
    await page.click('#grid .wishlist-card .product-card__view');
    await sleep(700);
    await page.evaluate(() => { document.getElementById('qvSavingGoal').value = '500000'; document.getElementById('qvSavedAmount').value = '120000'; });
    await page.click('#qvSavingsSave');
    await sleep(600);
    const j6 = await page.evaluate(() => ({
      goal: items[0] && items[0].savingGoal, saved: items[0] && items[0].savedAmount,
      summaryHidden: document.getElementById('qvSavingsSummary').hidden
    }));
    log('  J6 savings goal from QV: ' + JSON.stringify(j6));
    await page.keyboard.press('Escape');
    await sleep(500);

    // J7 delete -> undo
    await page.click('#grid .wishlist-card .card-more__trigger');
    await sleep(300);
    await page.click('#grid .wishlist-card .card-more__menu .danger');
    await sleep(600);
    const j7c = await page.evaluate(() => ({
      items: items.length, cards: document.querySelectorAll('#grid .wishlist-card').length,
      toast: (document.querySelector('.toast') || {}).textContent || null,
      toastAction: !!(document.querySelector('.toast .toast__action')),
      toastActionText: (document.querySelector('.toast .toast__action') || {}).textContent || null
    }));
    log('  J7 delete -> ' + JSON.stringify(j7c));
    // J7b: undo restores the item
    let j7d = null;
    if (j7c.toastAction) {
      await page.click('.toast .toast__action');
      await sleep(700);
      j7d = await page.evaluate(() => ({
        items: items.length, cards: document.querySelectorAll('#grid .wishlist-card').length
      }));
      log('  J7b undo -> ' + JSON.stringify(j7d));
    }
    R.journeys = { j1, j2, j3a, j3b, j4, j5a, j5b, j6, j7c, j7d };
    await ctx.close();
  }

  await browser.close();
  server.close();
  fs.writeFileSync(path.join(OUT, 'ux04-audit.json'), JSON.stringify(R, null, 2));
  log('\nreport: ' + path.join(OUT, 'ux04-audit.json'));
})().catch(e => { console.error('FATAL', e); process.exit(1); });

// local alias so the helper name does not shadow `page`
function page_(browser, w, h, seed, mobile) { return page(browser, w, h, seed, mobile); }
