// =====================================================================
// Dialogs journey — real functional pass over Quick View + Add/Edit.
// Ten journeys against isolated guest data, fresh storage per page,
// real clicks/typing (no DOM shortcuts for user actions).
//
//   usage: node scripts/qa/dialogs-journey.js [touch|desktop]
//   DLG_JOURNEY_OUT=<dir>  screenshot folder (default qa-out/redesign/journeys)
// =====================================================================
const puppeteer = require('puppeteer-core');
const http = require('http');
const fs = require('fs');
const path = require('path');

const CHROME = process.env.CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT = path.join(__dirname, '..', '..');
const PORT = 8291;
const MODE = (process.argv[2] || 'both');
const OUT = process.env.DLG_JOURNEY_OUT ? path.resolve(process.env.DLG_JOURNEY_OUT) : path.join(ROOT, 'qa-out', 'redesign', 'journeys');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp' };
const MOCK = `export async function initializeWishlistCloud(o){setTimeout(()=>{o.onUserChanged&&o.onUserChanged(null);o.onStatus&&o.onStatus('local','');},0);
 return {get user(){return null},signIn:async()=>{},signOut:async()=>{},syncItems:async()=>{},uploadImage:async()=>''};}`;

let failures = 0, checks = 0;
const c = (id, want, got, extra) => {
  checks++;
  const ok = want === true;
  if (!ok) { failures++; console.log('  FAIL ' + id + ' :: ' + JSON.stringify(got) + (extra ? ' extra=' + JSON.stringify(extra) : '')); }
  else console.log('  ok   ' + id);
};

const PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

const server = http.createServer((req, res) => {
  const raw = req.url.split('?')[0];
  let p;
  try { p = decodeURIComponent(raw); } catch (e) { p = raw.replace(/%[0-9a-fA-F]*/g, ''); }
  if (p === '/') p = '/wishlist.html';
  fs.readFile(path.join(ROOT, p), (e, d) => {
    if (e) { res.writeHead(404); return res.end('nf'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(d);
  });
});

async function newPage(browser, opts) {
  const o = Object.assign({ w: 1440, h: 900, touch: false, seed: [] }, opts);
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: o.w, height: o.h, deviceScaleFactor: 1, isMobile: !!o.touch, hasTouch: !!o.touch });
  await page.evaluateOnNewDocument((items) => {
    localStorage.clear();
    localStorage.setItem('wishlist.guest.items', JSON.stringify(items));
  }, o.seed);
  await page.setRequestInterception(true);
  page.on('request', (r) => /wishlist-cloud\.js/.test(r.url())
    ? r.respond({ status: 200, contentType: 'application/javascript', body: MOCK })
    : r.continue());
  page.on('dialog', (d) => { global.__confirms = (global.__confirms || 0) + 1; d.accept(); });
  await page.goto(`http://127.0.0.1:${PORT}/wishlist.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelectorAll('#grid > .wishlist-card').length === (o.seed.length), { timeout: 20000 }).catch(() => {});
  await sleep(900);
  return { ctx, page };
}

const readStore = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('wishlist.guest.items') || '[]'));

// Replace the whole value the way a user's select-all + typing does
// (triple-click selection is unreliable under automation), keep keyboard
// typing itself real.
const type = async (page, sel, value) => {
  await page.click(sel);
  await page.evaluate((s) => document.querySelector(s).select(), sel);
  await page.type(sel, value);
};
const pick = async (page, sel, value) => page.select(sel, value);

(async () => {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--force-device-scale-factor=1', '--hide-scrollbars'] });
  fs.mkdirSync(OUT, { recursive: true });
  const shots = async (page, name) => page.screenshot({ path: path.join(OUT, name + '.png') }).catch(() => {});
  fs.writeFileSync(path.join(OUT, 'README.txt'), JSON.stringify({ mode: MODE, date: new Date().toISOString() }));

  const base = [{ id: 'seed-1', name: 'Bàn phím cơ HI75C Pro', price: 1890000, image: '', link: 'https://example.com/mua', status: 'wish', priority: 'high', category: 'Công nghệ', note: 'Chờ sale.', savingGoal: 1890000, savedAmount: 900000, createdAt: 1700000000000 }];

  if (MODE === 'both' || MODE === 'desktop') {
    console.log('== DESKTOP journeys (1440x900, fine pointer) ==');

    // ------------------------------------------------------------------
    console.log('J1/J2 — add with only a name · add with every optional field');
    {
      const { ctx, page } = await newPage(browser, { seed: base });

      await page.click('#btnAdd'); await sleep(400);
      // J1: only the name
      await page.type('#fName', 'Ai bằng lone');
      await page.click('#fSubmit'); await sleep(700);
      let store = await readStore(page);
      c('J1-1 add with only a name saves and closes',
        store.length === 2 && store.some(x => x.name === 'Ai bằng lone') && !(await page.evaluate(() => document.getElementById('dlg').open)),
        { count: store.length, open: await page.evaluate(() => document.getElementById('dlg').open) });
      const j1 = store.find(x => x.name === 'Ai bằng lone') || {};
      c('J1-2 name-only item keeps the default contract (price 0, default status kept)',
        (j1.price || 0) === 0 && !!j1.id, { price: j1.price, id: !!j1.id });

      // J2: every optional field
      await page.click('#btnAdd'); await sleep(400);
      await type(page, '#fName', 'Sữa rửa mặt CeraVe');
      await type(page, '#fPrice', '385000');
      await type(page, '#fCategory', 'Chăm sóc');
      await pick(page, '#fStatus2', 'saving');
      await pick(page, '#fPriority2', 'medium');
      await type(page, '#fNote', 'Dùng buổi tối, dạng bọt.');
      await page.click('#fMoreToggle'); await sleep(300);   // auto-scroll reveal
      await type(page, '#fSavingGoal', '385000');
      await type(page, '#fSavedAmount', '120000');
      await type(page, '#fLink', 'https://shopee.vn/cerave');
      await type(page, '#fImageUrl', 'http://127.0.0.1:' + PORT + '/image/After%20Shave.webp');
      await sleep(400);
      await shots(page, 'add-full-filled');
      await page.click('#fSubmit'); await sleep(800);
      store = await readStore(page);
      const j2 = store.find(x => x.name === 'Sữa rửa mặt CeraVe') || {};
      c('J2-1 item with all optional fields saves everything',
        !!j2.name && j2.price === 385000 && j2.status === 'saving' && j2.priority === 'medium' &&
        j2.savingGoal === 385000 && j2.savedAmount === 120000 &&
        j2.link === 'https://shopee.vn/cerave' && /^http:\/\/127\.0\.0\.1/.test(j2.image || '') &&
        j2.note === 'Dùng buổi tối, dạng bọt.',
        j2);

      // savings progress visible on the card after save
      const cardHasGoal = await page.evaluate(() => {
        const card = [...document.querySelectorAll('#grid > .wishlist-card')].find(x => (x.textContent || '').includes('CeraVe'));
        return !!card && /385\.000|sav|tiết kiệm/i.test(card.textContent) && !!card.querySelector('.cat');
      });
      c('J2-2 saved goal shows on the card', cardHasGoal, cardHasGoal);
      await ctx.close();
    }

    // ------------------------------------------------------------------
    console.log('J3/J4 — edit every field · cancel keeps the store');
    {
      const { ctx, page } = await newPage(browser, { seed: base });
      await page.evaluate(() => document.querySelector('#grid > .wishlist-card .product-card__view').click());
      await sleep(900);
      await page.evaluate(() => document.getElementById('qvEdit').click());
      await sleep(1100);
      let editPrefill = await page.evaluate(() => ({
        open: document.getElementById('dlg').open, title: document.getElementById('dlgTitle').textContent,
        name: document.getElementById('fName').value, price: document.getElementById('fPrice').value,
        note: document.getElementById('fNote').value, goal: document.getElementById('fSavingGoal').value,
        saved: document.getElementById('fSavedAmount').value, moreOpen: document.getElementById('fMorePanel').hidden === false
      }));
      c('J3-0 edit opens prefilled with the saved values',
        editPrefill.open && editPrefill.name === base[0].name && editPrefill.price === '1890000' &&
        editPrefill.goal === '1890000' && editPrefill.saved === '900000' && editPrefill.moreOpen === true,
        editPrefill);

      // edit every saved field
      await type(page, '#fName', 'Bàn phím cơ HI75C Pro bản núm xoay');
      await type(page, '#fPrice', '1750000');
      await type(page, '#fCategory', 'Công nghệ - Kênh game');
      await pick(page, '#fStatus2', 'ordered');
      await pick(page, '#fPriority2', 'medium');
      await type(page, '#fNote', 'Đã đặt cọc 200k.');
      await type(page, '#fSavingGoal', '1750000');
      await type(page, '#fSavedAmount', '1400000');
      await type(page, '#fLink', 'https://example.com/nux-roll');
      await page.click('#fSubmit'); await sleep(800);
      let store = await readStore(page);
      const it = store.find(x => x.id === 'seed-1') || {};
      c('J3-1 every field round-trips',
        it.name === 'Bàn phím cơ HI75C Pro bản núm xoay' && it.price === 1750000 && it.category === 'Công nghệ - Kênh game' &&
        it.status === 'ordered' && it.priority === 'medium' && it.note === 'Đã đặt cọc 200k.' &&
        it.savingGoal === 1750000 && it.savedAmount === 1400000 && it.link === 'https://example.com/nux-roll',
        it);

      // J4: cancel an edit -> nothing is written
      await page.evaluate(() => document.querySelector('#grid > .wishlist-card .product-card__view').click());
      await sleep(900);
      await page.evaluate(() => document.getElementById('qvEdit').click());
      await sleep(1100);
      await type(page, '#fName', 'CANCELLED EDIT');
      await type(page, '#fPrice', '1');
      await page.click('#btnCancel'); await sleep(500);
      store = await readStore(page);
      c('J4 cancel discards the edit and never writes',
        store.length === 1 && store[0].name === 'Bàn phím cơ HI75C Pro bản núm xoay' && store[0].price === 1750000 &&
        !(await page.evaluate(() => document.getElementById('dlg').open)),
        store[0] && { name: store[0].name, open: await page.evaluate(() => document.getElementById('dlg').open) });
      await ctx.close();
    }

    // ------------------------------------------------------------------
    console.log('J5/J6 — open/close Quick View · edit straight from it');
    {
      const { ctx, page } = await newPage(browser, { seed: base });
      const opener = await page.evaluateHandle(() => document.querySelector('#grid > .wishlist-card .product-card__view'));
      await opener.asElement().click(); await sleep(900);
      c('J5-1 quick view opens with focus on the close button',
        await page.evaluate(() => document.getElementById('qv').open && document.activeElement.id === 'qvClose'),
        await page.evaluate(() => ({ open: document.getElementById('qv').open, focus: document.activeElement.id })));
      await shots(page, 'qv-open');
      await page.keyboard.press('Escape'); await sleep(800);
      let back = await page.evaluate(() => document.getElementById('qv').open === false &&
        document.activeElement && document.activeElement.className.includes('product-card__view'));
      c('J5-2 Escape closes it and focus returns to the card action', back, await page.evaluate(() => document.activeElement.className));

      // edit straight from QV
      await opener.asElement().click(); await sleep(900);
      await page.evaluate(() => document.getElementById('qvEdit').click());
      await sleep(1100);
      c('J6-1 the form opens after the QV closes (no stacked modals)',
        await page.evaluate(() => !document.getElementById('qv').open && document.getElementById('dlg').open),
        await page.evaluate(() => ({ qv: document.getElementById('qv').open, dlg: document.getElementById('dlg').open })));
      c('J6-2 the form is prefilled from the item',
        await page.evaluate(() => document.getElementById('fName').value === 'Bàn phím cơ HI75C Pro'),
        await page.evaluate(() => document.getElementById('fName').value));
      await page.evaluate(() => document.getElementById('btnCancel').click()); await sleep(400);
      await ctx.close();
    }

    // ------------------------------------------------------------------
    console.log('J7/J8 — mark purchased from Quick View · reopen and verify');
    {
      const { ctx, page } = await newPage(browser, { seed: base });
      await page.evaluate(() => document.querySelector('#grid > .wishlist-card .product-card__view').click());
      await sleep(900);
      await page.evaluate(() => document.getElementById('qvPurchase').click());
      await sleep(600);
      const pdState = await page.evaluate(() => ({
        pd: document.getElementById('pd').open, name: document.getElementById('pdName').textContent,
        price: document.getElementById('pdPrice').textContent, qvStays: document.getElementById('qv').open
      }));
      c('J7-1 the purchase capture opens instead of guessing', pdState.pd === true, pdState);
      await shots(page, 'purchase-dialog');
      await type(page, '#pdAmount', '1650000');
      await page.click('#pdConfirm'); await sleep(1100);
      let store = await readStore(page);
      const it = store.find(x => x.id === 'seed-1') || {};
      c('J7-2 the purchase is real: status, paid amount and date are written',
        it.status === 'purchased' && it.paidAmount === 1650000 && !!it.purchasedAt,
        { status: it.status, paid: it.paidAmount, at: !!it.purchasedAt });
      const qvAfter = await page.evaluate(() => ({
        btn: document.getElementById('qvPurchase').textContent,
        paidItem: document.getElementById('qvPaidItem').hidden,
        paid: document.getElementById('qvPaid').textContent,
        status: document.getElementById('qvStatus').textContent
      }));
      c('J7-3 the open panel flips to the undo state with the real price',
        /Hoàn tác/.test(qvAfter.btn) && qvAfter.paidItem === false && /165\.000\.000|1\.650\.000/.test(qvAfter.paid) &&
        qvAfter.status === 'Đã mua', qvAfter);
      await shots(page, 'qv-purchased');

      // J8: reopen the item fresh and verify everything persisted
      await page.evaluate(() => document.getElementById('qvClose').click());
      await sleep(900);
      await page.evaluate(() => document.querySelector('#grid > .wishlist-card .product-card__view').click());
      await sleep(900);
      const reopened = await page.evaluate(() => ({
        status: document.getElementById('qvStatus').textContent,
        paid: document.getElementById('qvPaid').textContent,
        goal: document.getElementById('qvSavingsGoal').textContent,
        cat: document.getElementById('qvCat').textContent
      }));
      c('J8-1 reopening shows the persisted purchase and goal',
        reopened.status === 'Đã mua' && /1\.650\.000/.test(reopened.paid) && /1\.890\.000/.test(reopened.goal) &&
        reopened.cat === 'Công nghệ', reopened);
      // undo path still works (f2's contract, exercised for real)
      await page.evaluate(() => document.getElementById('qvPurchase').click());
      await sleep(700);
      store = await readStore(page);
      c('J8-2 undo returns the item to its previous status (seed was "wish")',
        (store.find(x => x.id === 'seed-1') || {}).status === 'wish', store[0] && store[0].status);
      await ctx.close();
    }

    // ------------------------------------------------------------------
    console.log('J9 — invalid price, link and image are explained beside the field');
    {
      const { ctx, page } = await newPage(browser, { seed: base });
      await page.click('#btnAdd'); await sleep(400);
      await type(page, '#fName', 'Ánh xạ HDR');
      await type(page, '#fPrice', 'abc');
      await page.click('#fSubmit'); await sleep(600);
      let err = await page.evaluate(() => ({
        shown: document.getElementById('fPriceError').hidden === false,
        text: document.getElementById('fPriceError').textContent,
        invalid: document.getElementById('fPrice').getAttribute('aria-invalid'),
        open: document.getElementById('dlg').open
      }));
      c('J9-1 bad price: the error appears beside the field and the save is rejected',
        err.shown && err.invalid === 'true' && err.open === true && err.text.length > 4, err);

      await type(page, '#fPrice', '450000');
      await page.click('#fMoreToggle'); await sleep(400);
      // Browsers tolerate almost any wording (Chrome normalizes even spaces,
      // so "not an url" parses); a non-numeric port is reliably rejected.
      await type(page, '#fLink', 'example.com:abc');
      await type(page, '#fImageUrl', 'example.com:abc');
      await page.click('#fSubmit'); await sleep(600);
      const linkErr = await page.evaluate(() => ({
        shown: document.getElementById('fLinkError').hidden === false,
        text: document.getElementById('fLinkError').textContent,
        imgShown: document.getElementById('fImageUrlError').hidden === false,
        open: document.getElementById('dlg').open
      }));
      const lenAfterLink = (await readStore(page)).length;
      c('J9-2 bad link: the field explains itself and nothing is saved',
        linkErr.shown && linkErr.text.length > 4 && linkErr.imgShown === false && linkErr.open === true && lenAfterLink === 1,
        { linkErr, lenAfterLink });
      await shots(page, 'add-errors');

      // fixing the field drops the inline error as you type (UX-04.1)
      await type(page, '#fLink', 'https://example.com/a');
      const cleared = await page.evaluate(() => document.getElementById('fLinkError').hidden === true);
      c('J9-3 the inline error clears as soon as the field is fixed', cleared,
        await page.evaluate(() => ({ l: document.getElementById('fLinkError').hidden, i: document.getElementById('fImageUrlError').hidden })));

      // validation is sequential: the next bad control takes its turn
      await page.click('#fSubmit'); await sleep(600);
      const imgErr = await page.evaluate(() => ({
        shown: document.getElementById('fImageUrlError').hidden === false,
        text: document.getElementById('fImageUrlError').textContent,
        open: document.getElementById('dlg').open
      }));
      c('J9-4 bad image URL is called out once the link is valid', imgErr.shown && imgErr.text.length > 4 && imgErr.open === true, imgErr);

      // a real, loadable image (served by this harness) then saves – note the
      // http(s) contract: a path-only value is a designed rejection above.
      await type(page, '#fImageUrl', 'http://127.0.0.1:' + PORT + '/image/After%20Shave.webp');
      await sleep(500);
      await page.click('#fSubmit'); await sleep(700);
      const saved2 = await readStore(page);
      c('J9-5 the corrected form saves with the working image URL',
        saved2.length === 2 && saved2.some(x => x.image && x.image.startsWith('http://127.0.0.1')),
        { len: saved2.length, dlgOpen: await page.evaluate(() => document.getElementById('dlg').open) });
      await ctx.close();
    }

    // ------------------------------------------------------------------
    console.log('J10 — keyboard contract on the form');
    {
      const { ctx, page } = await newPage(browser, { seed: base });
      await page.click('#btnAdd'); await sleep(400);
      const focus0 = await page.evaluate(() => document.activeElement.id);
      c('J10-1 the form opens with the name focused', focus0 === 'fName', focus0);
      await page.keyboard.press('Tab');
      const tab1 = await page.evaluate(() => document.activeElement.id);
      c('J10-2 tab moves into the real controls', tab1 !== 'fName' && tab1.length > 0, tab1);
      await page.evaluate(() => document.getElementById('fName').focus());
      await page.keyboard.press('Escape'); await sleep(500);
      c('J10-3 Escape closes the form without saving',
        !(await page.evaluate(() => document.getElementById('dlg').open)) && (await readStore(page)).length === 1,
        await page.evaluate(() => document.getElementById('dlg').open));
      await ctx.close();
    }
  }

  if (MODE === 'both' || MODE === 'touch') {
    console.log('== TOUCH journeys (390x844 and 320x844) ==');
    // ------------------------------------------------------------------
    console.log('T — mobile Quick View + Add/Edit usability');
    {
    // Viewports mirror ux05-browser-qa.js so the gates are one contract: any
    // width <= 390 gets an 844px phone height, 320 included.
    for (const w of [{ w: 390, h: 844 }, { w: 320, h: 844 }]) {
        const tag = w.w + 'x' + w.h;
        const { ctx, page } = await newPage(browser, { seed: base, w: w.w, h: w.h, touch: true });

        const open = await page.evaluate(() => {
          const card = document.querySelector('#grid > .wishlist-card .product-card__view');
          const r = card.getBoundingClientRect();
          return { w: Math.round(r.width), h: Math.round(r.height) };
        });
        c('T-' + tag + '-0 the card action is a real thumb target', open.w >= 44 && open.h >= 44, open);

        await page.evaluate(() => document.querySelector('#grid > .wishlist-card .product-card__view').click());
        await sleep(900);
        const qv = await page.evaluate(() => {
          const d = document.getElementById('qv');
          const panel = d.querySelector('.quick-view__panel');
          const cta = d.querySelector('.quick-view__cta');
          const cs = cta ? getComputedStyle(cta) : null;
          // only controls the user can actually see interact (getClientRects
          // is empty for anything inside display:none / hidden ancestors)
          const targets = [...d.querySelectorAll('button, a[href], input, select, textarea')].filter(e => {
            const s = getComputedStyle(e); return s.display !== 'none' && s.visibility !== 'hidden' && e.getClientRects().length > 0;
          }).map(e => { const r = e.getBoundingClientRect(); return Math.min(r.width, r.height); });
          return {
            open: d.open, bg: cs ? cs.backgroundColor : null, pos: cs ? cs.position : null,
            panelScroll: panel.scrollHeight > panel.clientHeight,
            minTarget: targets.length ? Math.round(Math.min(...targets)) : null,
            visible: cta ? cta.getBoundingClientRect().top < window.innerHeight : null
          };
        });
        c('T-' + tag + '-1 the action band is opaque, sticky and visible',
          qv.bg === 'rgb(255, 255, 255)' && qv.pos === 'sticky' && qv.visible === true, qv);
        c('T-' + tag + '-2 every open-dialog control is at least 44px',
          qv.minTarget >= 44, qv.minTarget);
        c('T-' + tag + '-3 the panel scrolls its content (nothing is clipped away)',
          qv.panelScroll === true, qv);

        // the primary action is reachable and works from the mobile band
        await page.evaluate(() => document.getElementById('qvPurchase').click());
        await sleep(600);
        c('T-' + tag + '-4 the purchase dialog runs from the mobile band',
          await page.evaluate(() => document.getElementById('pd').open),
          await page.evaluate(() => document.getElementById('pd').open));
        await page.evaluate(() => document.getElementById('pdCancel').click());
        await sleep(400);
        await page.evaluate(() => document.getElementById('qvClose').click());
        await sleep(900);

        // mobile add form
        await page.evaluate(() => document.getElementById('btnAdd').click());
        await sleep(600);
        const dlg = await page.evaluate(() => {
          const d = document.getElementById('dlg');
          const body = d.querySelector('.product-dialog__body');
          const controls = [...d.querySelectorAll('input:not([type=hidden]):not([type=file]), select, textarea, button')].filter(e => {
            const s = getComputedStyle(e); return s.display !== 'none' && e.getClientRects().length > 0;
          }).map(e => { const r = e.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; });
          return {
            open: d.open, focus: document.activeElement.id,
            scrollH: body.scrollHeight, clientH: body.clientHeight,
            minTarget: controls.length ? Math.min(...controls.map(x => Math.min(x.w, x.h))) : 0
          };
        });
        c('T-' + tag + '-5 the add form opens focused and fits ~1.8 screens',
          dlg.open && dlg.focus === 'fName' && dlg.scrollH <= dlg.clientH * 1.8, dlg);
        c('T-' + tag + '-6 every form control clears 44px', dlg.minTarget >= 44, dlg.minTarget);
        await shots(page, 'add-mobile-' + w.w);

        // type + save from the mobile keyboard path
        await page.type('#fName', 'Kiểm tra ' + w.w);
        await page.click('#fSubmit'); await sleep(700);
        c('T-' + tag + '-7 saving from the phone works',
          (await readStore(page)).length === 2 && !(await page.evaluate(() => document.getElementById('dlg').open)),
          await page.evaluate(() => document.getElementById('dlg').open));
        await ctx.close();
      }
    }
  }

  await browser.close();
  server.close();
  console.log('\njourneys: ' + checks + ' checks, ' + failures + ' failed');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
