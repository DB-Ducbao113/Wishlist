// =====================================================================
// DREAM VAULT V16.2 — MOTION-06 MOBILE GESTURES & ADAPTIVE MOTION
// Real-browser verification with touch/pointer events:
//   1) QV swipe-down dismissal       2) insufficient swipe → snap-back
//   3) horizontal swipe never closes 4) scrollable QV content stays native
//   5) Escape + close button intact  6) reduced-motion fallback
//   7) gesture cancellation          8) no pointer/listener leaks (30 cycles)
//   9) no stale shared-element proxy
//  10) touch card press never opens accidentally
//  11) board touch drag (deliberate) + fallback select + horizontal scroll
//  12) focus restoration after swipe dismissal
//  13) no uncaught browser errors
//  14) mobile viewports overflow (320/375/390/430/768)
//  15) purchase + savings flows unchanged on touch
//  16) adaptive motion budget (evidence-based, no UA sniffing)
// =====================================================================
const puppeteer = require('puppeteer-core');
const http = require('http');
const fs = require('fs');
const path = require('path');

const CHROME = process.env.CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : path.join(__dirname, '..', '..');
const PORT = 8207;
const OUT = path.join(__dirname, '..', '..', 'qa-out');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

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
    signIn: async () => {}, signOut: async () => { state.user = null; if(opts.onUserChanged) opts.onUserChanged(null); if(opts.onStatus) opts.onStatus('local',''); },
    syncItems: (items) => { state.syncs.push(JSON.parse(JSON.stringify(items))); return Promise.resolve(); },
    uploadImage: async () => { state.uploads++; return 'https://cdn.example/img.jpg'; }
  };
}
`;

function serveFrom(root) {
  return (req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/') p = '/wishlist.html';
    const file = path.join(root, p);
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); return res.end('not found'); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(data);
    });
  };
}
const server = http.createServer(serveFrom(ROOT));
const results = [];
let section = '';
function c(id, area, entry, expected, pass, actual) { results.push({ id, section, area, entry, expected, pass: !!pass, actual: actual === undefined ? '' : JSON.stringify(actual) }); }
function mk(id, status, extra) { return Object.assign({ id, name: 'Món ' + id, price: 500000, image: '', link: '', status, priority: 'medium', category: 'A', note: '', createdAt: 1700000000000 }, extra || {}); }
const FIX = [mk('a1', 'wish'), mk('a2', 'saving'), mk('a3', 'ordered'), mk('a4', 'purchased', { paidAmount: 200000, purchasedAt: 1700000000500, previousStatus: 'wish' })];

// Đếm listener document (add − remove theo loại): bất biến "0 rò rỉ" kiểm
// chứng bằng chênh lệch giữa hai mốc thời gian trong cùng trang.
const LEAK_HEADER = `
(function(){
  window.__leakTally = {};
  const oa = document.addEventListener.bind(document);
  const or_ = document.removeEventListener.bind(document);
  document.addEventListener = function(t, l, o){ window.__leakTally[t] = (window.__leakTally[t]||0)+1; return oa(t,l,o); };
  document.removeEventListener = function(t, l, o){ window.__leakTally[t] = (window.__leakTally[t]||0)-1; return or_(t,l,o); };
})();
`;

async function newScenario(browser, seed, opts = {}) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  const state = { errors: [], pageErrors: [] };
  if (opts.touch !== false) {
    await page.emulate({ viewport: { width: opts.width || 390, height: opts.height || 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' });
  } else {
    await page.setViewport({ width: opts.width || 1440, height: opts.height || 900, deviceScaleFactor: 1 });
  }
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: opts.reducedMotion ? 'reduce' : 'no-preference' }]);
  await page.evaluateOnNewDocument(LEAK_HEADER);
  await page.evaluateOnNewDocument((s) => { try { localStorage.clear(); if (s.guestItems) localStorage.setItem('wishlist.guest.items', JSON.stringify(s.guestItems)); } catch (e) {} }, { guestItems: seed });
  await page.setRequestInterception(true);
  page.on('request', req => { if (/wishlist-cloud\.js/.test(req.url())) return req.respond({ status: 200, contentType: 'text/javascript', body: MOCK }); req.continue(); });
  page.on('pageerror', e => state.pageErrors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') state.errors.push(m.text()); });
  page.on('dialog', d => { d.dismiss().catch(() => {}); });
  await page.goto(`http://localhost:${PORT}/wishlist.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('typeof window.__cloudSetUser === "function"');
  await sleep(opts.settle || 800);
  return { ctx, page, state };
}

// Chuỗi PointerEvent touch thật (pointerdown → move … → up/cancel).
async function touchDrag(page, cfg) {
  return page.evaluate((cfg) => {
    const top = document.querySelector('#qv .quick-view__top');
    if (!top) return { ok: false, reason: 'no top' };
    const r = top.getBoundingClientRect();
    const sx = cfg.sx !== undefined ? cfg.sx : r.left + Math.max(20, r.width * 0.25);
    const sy = cfg.sy !== undefined ? cfg.sy : r.top + Math.max(14, Math.min(r.height - 6, r.height * 0.5));
    const pid = cfg.pointerId || 11;
    const fire = (type, x, y) => {
      const el = document.elementFromPoint(x, y) || top;
      el.dispatchEvent(new PointerEvent(type, {
        bubbles: true, cancelable: true, composed: true,
        pointerId: pid, pointerType: 'touch', isPrimary: true,
        clientX: x, clientY: y, buttons: type === 'pointermove' || type === 'pointerdown' ? 1 : 0, button: 0
      }));
    };
    fire('pointerdown', sx, sy);
    const steps = cfg.steps == null ? 10 : cfg.steps;
    for (let i = 1; i <= steps; i++) {
      fire(cfg.moves || 'pointermove', sx + ((cfg.dx || 0) * i) / steps, sy + ((cfg.dy || 0) * i) / steps);
    }
    if (cfg.end === 'none') return { ok: true, sx, sy };
    fire(cfg.end === 'cancel' ? 'pointercancel' : 'pointerup', sx + (cfg.dx || 0), sy + (cfg.dy || 0));
    return { ok: true, sx, sy };
  }, cfg);
}

// Nhả tay ở vị trí đang giữ (stroke còn dang: thrùng by pointerId).
async function touchRelease(page, cfg) {
  return page.evaluate((cfg) => {
    const top = document.querySelector('#qv .quick-view__top');
    if (!top) return { ok: false };
    const r = top.getBoundingClientRect();
    top.dispatchEvent(new PointerEvent('pointerup', {
      bubbles: true, cancelable: true, composed: true,
      pointerId: cfg.pointerId || 11, pointerType: 'touch', isPrimary: true,
      clientX: r.left + 40, clientY: r.top + 30 + (cfg.dy || 0), buttons: 0, button: 0
    }));
    return { ok: true };
  }, cfg);
}

// Chuỗi touch trên mọi node bất kỳ (thẻ/board).
async function touchSeq(page, cfg) {
  return page.evaluate((arg) => {
    const el = document.querySelector(arg.sel);
    if (!el) return { ok: false, reason: 'no el' };
    const r = el.getBoundingClientRect();
    const sx = r.left + Math.max(6, r.width * (arg.fx || 0.5));
    const sy = r.top + Math.max(6, r.height * (arg.fy || 0.5));
    const pid = arg.pointerId || 21;
    const fire = (type, x, y) => {
      const tgt = arg.hitTest === false ? el : (document.elementFromPoint(x, y) || el);
      tgt.dispatchEvent(new PointerEvent(type, {
        bubbles: true, cancelable: true, composed: true,
        pointerId: pid, pointerType: 'touch', isPrimary: true,
        clientX: x, clientY: y, buttons: type === 'pointerup' ? 0 : 1, button: 0
      }));
    };
    fire('pointerdown', sx, sy);
    const steps = arg.steps == null ? 6 : arg.steps;
    for (let i = 1; i <= steps; i++) fire(arg.moves || 'pointermove', sx + ((arg.dx || 0) * i) / steps, sy + ((arg.dy || 0) * i) / steps);
    if (arg.end === 'none') return { ok: true, sx, sy };
    fire(arg.end === 'cancel' ? 'pointercancel' : 'pointerup', sx + (arg.dx || 0), sy + (arg.dy || 0));
    return { ok: true, sx, sy };
  }, cfg);
}

async function openQvFromCard(page, id = 'a1') {
  await page.evaluate((x) => {
    const card = document.querySelector('#grid > .wishlist-card[data-id="' + x + '"]');
    if (!card) return;
    card.scrollIntoView({ block: 'center', behavior: 'instant' });
    const btn = card.querySelector('.product-card__view');
    if (btn) btn.click();
  }, id);
  await page.waitForFunction(() => document.getElementById('qv').open === true, { timeout: 3000 });
}

function snapQv(page) {
  return page.evaluate(() => {
    const qv = document.getElementById('qv');
    const panel = document.querySelector('#qv .quick-view__panel');
    return {
      open: qv.open,
      classes: qv.className,
      inline: qv.getAttribute('style') || '',
      prox: document.querySelectorAll('.qv-proxy').length,
      panelScroll: panel ? panel.scrollTop : -1
    };
  });
}

async function run() {
  await new Promise(r => server.listen(PORT, r));
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });

  // ===================================================================
  section = 'M06.2 SWIPE-TO-DISMISS';
  // ===================================================================
  {
    const { ctx, page, state } = await newScenario(browser, FIX, { width: 390, height: 844 });
    await openQvFromCard(page, 'a1');
    const grab = await page.evaluate(() => {
      const g = document.querySelector('#qv .quick-view__top .quick-view__grabber');
      const top = document.querySelector('#qv .quick-view__top');
      return { grab: !!g, disp: g ? getComputedStyle(g).display : null, touch: getComputedStyle(top).touchAction };
    });
    c('M06-01', 'gesture region', 'grabber rendered on touch viewport', 'block', grab.grab && grab.disp === 'block', grab);
    c('M06-02', 'gesture region', 'top bar touch-action none on sheet widths', 'none', grab.touch === 'none', grab.touch);

    // Giữ tay 160px (chưa nhả) → kiểm chứng trạng thái giữa stroke.
    await touchDrag(page, { dy: 160, steps: 8, end: 'none' });
    await sleep(140);
    const mid = await snapQv(page);
    c('M06-03', 'swipe', 'mid-drag: sheet translated + progress var', 'dragging + translateY + progress>0',
      mid.open === true && /qv--dragging/.test(mid.classes) && /translateY/.test(mid.inline) && /--qv-swipe-progress:\s*0?\.\d/.test(mid.inline), mid);
    c('M06-04', 'swipe', 'mid-drag: bounded <= 260px', 'no ceiling breach', !/translateY\(\s*[2-9]\d\d/.test(mid.inline), mid.inline);

    // Nhả tay tại chỗ giữ → dismissal qua kênh chính tắc.
    await touchRelease(page, { dy: 160 });
    await page.waitForFunction(() => document.getElementById('qv').open === false, { timeout: 3500 });
    const after = await snapQv(page);
    c('M06-05', 'swipe', 'swipe-down dismisses QV', 'closed', true, await page.evaluate(() => document.getElementById('qv').open));
    c('M06-06', 'swipe', 'dismiss session recorded', 'qvSwipeSessions === 1', await page.evaluate(() => qvSwipeSessions) === 1, await page.evaluate(() => qvSwipeSessions));
    c('M06-07', 'proxy', 'no stale shared-element proxy after dismissal', '0 proxies', after.prox === 0, after.prox);
    c('M06-08', 'swipe', 'classes/inline fully reset after dismissal', 'clean', !/qv--dragging|qv--drag-closing/.test(after.classes) && after.inline === '', after);
    // 'close' là task xếp lệnh (fired ~15-20ms sau close()) — CHỜ focus
    // thực sự trở về opener thay vì đo ngay.
    await page.waitForFunction(() => {
      const ae = document.activeElement;
      const card = document.querySelector('#grid > .wishlist-card[data-id="a1"]');
      return !!(ae && card && card.contains(ae) && ae.classList.contains('product-card__view'));
    }, { timeout: 2500 });
    c('M06-09', 'focus', 'focus restored to the opening card button', 'opener focused', true, await page.evaluate(() => document.activeElement && document.activeElement.className));
    c('M06-10', 'errors', 'no errors (swipe dismissal)', 'clean', (state.errors.concat(state.pageErrors)).length === 0, state.errors.concat(state.pageErrors));
    await ctx.close();
  }

  // ===================================================================
  section = 'M06.2 SNAP-BACK / HORIZONTAL / SCROLL / CANCEL';
  // ===================================================================
  {
    const { ctx, page, state } = await newScenario(browser, FIX, { width: 390, height: 844 });
    await openQvFromCard(page, 'a1');
    // Mốc listener: chờ flight mở và mọi cặp add/remove tạm thời KẾT THÚC
    // (flight onVis v.v.) trước khi lấy baseline, để delta chỉ đo RÒ RỈ thật.
    await sleep(700);
    const tallyBefore = await page.evaluate(() => JSON.parse(JSON.stringify(window.__leakTally)));

    // (2) lượt không đủ → snap-back, vẫn mở.
    await touchDrag(page, { dy: 60, steps: 10 });
    await sleep(430);
    const back = await snapQv(page);
    c('M06-11', 'snap-back', 'insufficient swipe keeps dialog open', 'open', back.open === true, back);
    c('M06-12', 'snap-back', 'sheet springs back to origin', 'no transform/drag class', !/translateY/.test(back.inline) && !/qv--dragging/.test(back.classes), back);

    // (3) stroke ngang KHÔNG bao giờ đóng.
    await touchDrag(page, { dx: -130, dy: 4, steps: 8 });
    await sleep(280);
    const horiz = await snapQv(page);
    c('M06-13', 'horizontal', 'horizontal swipe never dismisses', 'open + no drag class', horiz.open === true && !/qv--dragging/.test(horiz.classes), horiz);
    c('M06-14', 'horizontal', 'horizontal abort leaves no listeners', 'net add−remove delta = 0', await page.evaluate((b) => {
      const t = window.__leakTally;
      return ['pointermove', 'pointerup', 'pointercancel', 'keydown', 'visibilitychange'].every(k => (t[k] || 0) - (b[k] || 0) === 0);
    }, tallyBefore), await page.evaluate(() => window.__leakTally));

    // (4) nội dung cuộn bên trong giữ cuộn tự nhiên; khi đang cuộn sâu,
    //     thanh tiêu đề từ chối mở gesture.
    await page.evaluate(() => { document.querySelector('#qv .quick-view__panel').scrollTop = 180; });
    await sleep(80);
    await touchDrag(page, { dy: 200, steps: 8 });
    await sleep(300);
    const scrolled = await snapQv(page);
    c('M06-15', 'native scroll', 'panel scrollTop preserved (native scroll intact)', '180-ish', scrolled.panelScroll >= 150 && scrolled.panelScroll <= 220, scrolled.panelScroll);
    c('M06-16', 'native scroll', 'scrolled state refuses the swipe (no translate)', 'open, no transform', scrolled.open === true && !/translateY/.test(scrolled.inline), scrolled);
    const content = await page.evaluate(() => {
      const t = document.getElementById('qvTitle');
      const r = t && t.getBoundingClientRect();
      return r ? { h: Math.round(r.height) } : null;
    });
    c('M06-17', 'native scroll', 'content measurable after scroll', 'height > 0', content && content.h > 0, content);
    await page.evaluate(() => { document.querySelector('#qv .quick-view__panel').scrollTop = 0; });
    await sleep(80);
    await touchDrag(page, { dy: 150, steps: 6 });
    await page.waitForFunction(() => document.getElementById('qv').open === false, { timeout: 3500 });
    c('M06-18', 'native scroll', 're-armed at top: swipe closes', 'closed', true, await page.evaluate(() => document.getElementById('qv').open));

    // (7) pointercancel giữa stroke → huỷ an toàn.
    await openQvFromCard(page, 'a2');
    await touchDrag(page, { dy: 70, steps: 6, end: 'cancel' });
    await sleep(420);
    const cancelled = await snapQv(page);
    c('M06-19', 'cancellation', 'pointercancel keeps dialog open', 'open', cancelled.open === true, cancelled);
    c('M06-20', 'cancellation', 'pointercancel resets styles', 'clean', cancelled.inline === '' && !/qv--dragging/.test(cancelled.classes), cancelled);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.getElementById('qv').open === false, { timeout: 2500 });
    c('M06-21', 'cancel path', 'Escape still closes QV', 'closed', true, await page.evaluate(() => document.getElementById('qv').open));
    c('M06-22', 'cancel path', 'Escape afterwards leaves zero proxies', '0 proxies', await page.evaluate(() => document.querySelectorAll('.qv-proxy').length) === 0, await page.evaluate(() => document.querySelectorAll('.qv-proxy').length));

    // (7b) tab bị ẩn giữa stroke → abort tức thời.
    await openQvFromCard(page, 'a3');
    await touchDrag(page, { dy: 60, steps: 6, end: 'none' });
    await sleep(120);
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await sleep(300);
    const visOff = await snapQv(page);
    c('M06-23', 'cancellation', 'hidden tab aborts gesture safely', 'open + reset', visOff.open === true && !/qv--dragging/.test(visOff.classes) && visOff.inline === '', visOff);
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    // (5) Escape giữa stroke ĐÃ tương tác → cản stroke, KHÔNG đóng hộp.
    const midEsc = await page.evaluate(() => {
      const top = document.querySelector('#qv .quick-view__top');
      const r = top.getBoundingClientRect();
      const fire = (type, x, y) => top.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, composed: true, pointerId: 33, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, buttons: 1, button: 0 }));
      fire('pointerdown', r.left + 40, r.top + 20);
      for (let i = 1; i <= 5; i++) fire('pointermove', r.left + 40, r.top + 20 + (i * 70) / 5);
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      return { open: document.getElementById('qv').open };
    });
    await sleep(380);
    const escMid = await snapQv(page);
    c('M06-24', 'cancellation', 'Escape mid-stroke cancels stroke, dialog stays open', 'open', midEsc.open === true && escMid.open === true, escMid);
    c('M06-25', 'cancellation', 'stroke transform released after Escape cancel', 'no drag class/transform', !/qv--dragging/.test(escMid.classes) && !/translateY/.test(escMid.inline), escMid);
    await page.evaluate(() => document.getElementById('qvClose').click());
    await page.waitForFunction(() => document.getElementById('qv').open === false, { timeout: 2500 });
    c('M06-26', 'cancel path', 'close button still works after all gesture paths', 'closed', true, await page.evaluate(() => document.getElementById('qv').open));
    c('M06-27', 'errors', 'no errors (cancel/scroll scenario)', 'clean', (state.errors.concat(state.pageErrors)).length === 0, state.errors.concat(state.pageErrors));
    await ctx.close();
  }

  // ===================================================================
  section = 'M06.7-9 STABILITY: 30 touch cycles';
  // ===================================================================
  {
    const { ctx, page, state } = await newScenario(browser, FIX, { width: 390, height: 844 });
    const before = await page.evaluate(() => JSON.parse(JSON.stringify(window.__leakTally)));
    for (let i = 0; i < 30; i++) {
      await openQvFromCard(page, 'a1');
      if (i % 2 === 0) {
        // Luôn drag đủ ngưỡng (>=120px): strokes ngắn giờ nảy về đúng chỗ.
        await touchDrag(page, { dy: 160, steps: 6 });
        await sleep(320);
      } else {
        await page.evaluate(() => document.getElementById('qvClose').click());
      }
      await page.waitForFunction(() => document.getElementById('qv').open === false, { timeout: 4000 });
      await sleep(60);
    }
    const last = await snapQv(page);
    const after = await page.evaluate(() => window.__leakTally);
    const balanced = ['pointermove', 'pointerup', 'pointercancel', 'keydown', 'visibilitychange'].every(k => (after[k] || 0) - (before[k] || 0) === 0);
    c('M06-28', 'stability', '30 touch cycles complete: closed, clean', 'closed + 0 proxies + no inline', last.open === false && last.prox === 0 && last.inline === '', last);
    c('M06-29', 'stability', 'no document listener leaks (net add−remove = 0)', 'all balanced', balanced, after);
    const sessions = await page.evaluate(() => qvSwipeSessions);
    c('M06-30', 'stability', 'dismiss sessions = 15 (even cycles swipe)', '15', sessions === 15, sessions);
    c('M06-31', 'errors', 'no errors (30 cycles)', 'clean', (state.errors.concat(state.pageErrors)).length === 0, state.errors.concat(state.pageErrors));
    await ctx.close();
  }

  // ===================================================================
  section = 'M06.6 REDUCED MOTION FALLBACK';
  // ===================================================================
  {
    const { ctx, page, state } = await newScenario(browser, FIX, { width: 390, height: 844, reducedMotion: true });
    await openQvFromCard(page, 'a1');
    const rm = await page.evaluate(() => {
      const g = document.querySelector('#qv .quick-view__top .quick-view__grabber');
      return { grabber: g ? getComputedStyle(g).display : '(missing)' };
    });
    c('M06-32', 'reduced motion', 'grabber hidden under reduced motion', 'none', rm.grabber === 'none', rm);
    await touchDrag(page, { dy: 200, steps: 8 });
    await sleep(420);
    const noDrag = await snapQv(page);
    c('M06-33', 'reduced motion', 'drag disabled: dialog never closes from swipe', 'open', noDrag.open === true, noDrag);
    c('M06-34', 'reduced motion', 'no sheet transform under reduced motion', 'inline empty', noDrag.inline === '', noDrag);
    await page.evaluate(() => document.getElementById('qvClose').click());
    await page.waitForFunction(() => document.getElementById('qv').open === false, { timeout: 2500 });
    c('M06-35', 'reduced motion', 'close button remains available', 'closed', true, await page.evaluate(() => document.getElementById('qv').open));
    c('M06-36', 'errors', 'no errors (reduced)', 'clean', (state.errors.concat(state.pageErrors)).length === 0, state.errors.concat(state.pageErrors));
    await ctx.close();
  }

  // ===================================================================
  section = 'M06.3-4 TOUCH CARDS + BOARD';
  // ===================================================================
  {
    const { ctx, page, state } = await newScenario(browser, FIX, { width: 390, height: 844 });
    // (10) chuỗi touch trên nút Xem chi tiết KHÔNG bắn click → QV không mở.
    await touchSeq(page, { sel: '#grid > .wishlist-card[data-id="a1"] .product-card__view', dy: 90, dx: 3, steps: 6 });
    await sleep(300);
    c('M06-37', 'touch cards', 'touch press chain without click never opens QV', 'qv closed', await page.evaluate(() => !document.getElementById('qv').open) === true, null);
    await page.evaluate(() => document.querySelector('#grid > .wishlist-card[data-id="a1"] .product-card__view').click());
    await page.waitForFunction(() => document.getElementById('qv').open === true, { timeout: 2500 });
    c('M06-38', 'touch cards', 'real click still opens QV on touch', 'opened', true, await page.evaluate(() => document.getElementById('qv').open));
    await page.evaluate(() => document.getElementById('qvClose').click());
    await page.waitForFunction(() => document.getElementById('qv').open === false, { timeout: 2500 });
    const cardCss = await page.evaluate(() => {
      const card = document.querySelector('#grid > .wishlist-card[data-id="a1"]');
      const btn = card.querySelector('.product-card__view');
      return {
        cardTouch: getComputedStyle(card).touchAction,
        btnTouch: getComputedStyle(btn).touchAction,
        surfaceTransform: getComputedStyle(card.querySelector('.wishlist-card__surface')).transform
      };
    });
    c('M06-39', 'touch cards', 'card/button touch-action manipulation', 'manipulation', cardCss.cardTouch === 'manipulation' && cardCss.btnTouch === 'manipulation', cardCss);
    c('M06-40', 'touch cards', 'no simulated 3D hover on touch (surface transform none)', 'neutral', cardCss.surfaceTransform === 'none' || cardCss.surfaceTransform === 'matrix(1, 0, 0, 1, 0, 0)', cardCss.surfaceTransform);

    // (11) BOARD — fallback + deliberate touch drag + cuộn ngang.
    await page.evaluate(() => { const b = document.getElementById('v13BoardView'); if (b) b.click(); });
    await sleep(450);
    const boardPre = await page.evaluate(() => {
      const wrap = document.querySelector('.board__columns') || document.getElementById('board');
      return {
        cols: document.querySelectorAll('.board__column').length,
        sel: !!document.querySelector('.board__status-select'),
        sw: wrap ? wrap.scrollWidth : 0,
        cw: wrap ? wrap.clientWidth : 0
      };
    });
    c('M06-41', 'board', '4 columns + touch select present', 'ok', boardPre.cols === 4 && boardPre.sel, boardPre);
    c('M06-42', 'board', 'board horizontally scrollable', 'scrollWidth > clientWidth', boardPre.sw > boardPre.cw, boardPre);

    // Touch dưới ngưỡng = chạm thường: KHÔNG drag session.
    await touchSeq(page, { sel: '.board__card[data-id="a1"] .board__handle', dy: 5, steps: 4 });
    await sleep(280);
    const noDrag = await page.evaluate(() => ({
      preview: document.querySelectorAll('.board__preview').length,
      dragging: document.querySelectorAll('.board__card.dragging').length
    }));
    c('M06-43', 'board', 'sub-8px touch never engages drag', 'no preview/dragging', noDrag.preview === 0 && noDrag.dragging === 0, noDrag);

    // Touch drag TUỴ NGHIỆT: engage (8px+), cuộn ngang board tới cột đích
    // (cũng chứng minh board vẫn cuộn ngang được), thả vào cột ordered.
    // Board có thể nằm sâu dưới trang → CUỘN board vào giữa màn hình trước
    // khi đo tọa độ (elementFromPoint chỉ hoạt động trong viewport).
    // Giai đoạn 1: pointerdown + engage + hướng về cột ordered (chưa nhả).
    // Lớp 'drag-over'/preview được áp trong rAF → CHỜ (sleep) trước khi đọc.
    await page.evaluate(() => {
      const handle = document.querySelector('.board__card[data-id="a1"] .board__handle');
      handle.scrollIntoView({ block: 'center', behavior: 'instant' });
      const hr = handle.getBoundingClientRect();
      const pid = 41;
      const fire = (type, x, y, btns) => {
        const tgt = document.elementFromPoint(x, y) || handle;
        tgt.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, composed: true, pointerId: pid, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, buttons: btns, button: 0 }));
      };
      fire('pointerdown', hr.left + hr.width / 2, hr.top + hr.height / 2, 1);
      for (let i = 1; i <= 3; i++) fire('pointermove', hr.left + hr.width / 2, hr.top + hr.height / 2 + (i * 16) / 3, 1);
      // board đang giữ session — cuộn ngang sang cột ordered (nếu cần).
      const wrap = document.querySelector('.board__columns') || document.getElementById('board');
      const col = document.querySelector('.board__column[data-status="ordered"]');
      let cr = col.getBoundingClientRect();
      if (cr.left < 0 || cr.right > window.innerWidth) {
        wrap.scrollLeft += Math.round((cr.left < 0 ? cr.left : cr.right - window.innerWidth));
        cr = col.getBoundingClientRect();
      }
      const tx = cr.left + cr.width / 2, ty = cr.top + 70;
      for (let i = 1; i <= 4; i++) fire('pointermove', hr.left + hr.width / 2 + ((tx - hr.left - hr.width / 2) * i) / 4, hr.top + hr.height / 2 + 16 + ((ty - hr.top - hr.height / 2 - 16) * i) / 4, 1);
    });
    await sleep(120);
    const engaged = await page.evaluate(() => {
      // ĐỌC trạng thái TRƯỚC khi nhả (pointerup xoá 'drag-over' ngay lập tức).
      const state1 = {
        preview: document.querySelectorAll('.board__preview').length,
        dragging: document.querySelectorAll('.board__card.dragging').length,
        dragOver: Array.from(document.querySelectorAll('.board__column.drag-over')).map(e => e.dataset.status)
      };
      const col = document.querySelector('.board__column[data-status="ordered"]');
      const cr = col.getBoundingClientRect();
      const src = document.querySelector('.board__card.dragging .board__handle') || document.querySelector('.board__handle');
      src.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, composed: true, pointerId: 41, pointerType: 'touch', isPrimary: true, clientX: cr.left + cr.width / 2, clientY: cr.top + 66, buttons: 0, button: 0 }));
      return state1;
    });
    c('M06-44', 'board', 'deliberate touch drag engages (preview + dragging + drop target)', 'engaged', engaged.preview === 1 && engaged.dragging === 1 && engaged.dragOver.indexOf('ordered') >= 0, engaged);
    await sleep(500);
    const moved = await page.evaluate(() => ({
      status: JSON.parse(localStorage.getItem('wishlist.guest.items') || '[]').find(i => i.id === 'a1').status,
      preview: document.querySelectorAll('.board__preview').length,
      dragging: document.querySelectorAll('.board__card.dragging').length,
      flash: !!document.querySelector('.board__column--confirm')
    }));
    c('M06-45', 'board', 'touch drag drops into column and persists', 'a1 → ordered, clean', moved.status === 'ordered' && moved.preview === 0 && moved.dragging === 0, moved);
    c('M06-46', 'board', 'column confirm flash on touch drop', 'flash class', moved.flash === true, moved);
    // fallback select vẫn hoạt động ngay sau touch drag.
    await page.select('.board__card[data-id="a2"] .board__status-select', 'wish');
    await sleep(320);
    const selMoved = await page.evaluate(() => JSON.parse(localStorage.getItem('wishlist.guest.items') || '[]').find(i => i.id === 'a2').status);
    c('M06-47', 'board', 'status select fallback works on touch', 'a2 → wish', selMoved === 'wish', selMoved);
    c('M06-48', 'errors', 'no errors (cards + board touch)', 'clean', (state.errors.concat(state.pageErrors)).length === 0, state.errors.concat(state.pageErrors));
    await ctx.close();
  }

  // ===================================================================
  section = 'M06.5 ADAPTIVE MOTION BUDGET';
  // ===================================================================
  {
    const { ctx, page, state } = await newScenario(browser, FIX, { width: 390, height: 844 });
    const dec = await page.evaluate(() => ({
      fast: motionBudgetFromDeltas(new Array(24).fill(16.6)),
      slow: motionBudgetFromDeltas(new Array(24).fill(40)),
      mixed: motionBudgetFromDeltas(Array.from({ length: 24 }, (_, i) => (i % 2 ? 40 : 15))),
      few: motionBudgetFromDeltas([40, 40, 40]),
      heavy: motionBudgetFromDeltas(Array.from({ length: 24 }, (_, i) => (i % 3 ? 45 : 16.6)))
    }));
    c('M06-49', 'motion budget', 'healthy 60fps frames → no lite', 'false', dec.fast === false, dec.fast);
    c('M06-50', 'motion budget', 'all frames slow → lite', 'true', dec.slow === true, dec.slow);
    c('M06-51', 'motion budget', 'half/half jitter → not lite', 'false', dec.mixed === false, dec.mixed);
    c('M06-52', 'motion budget', 'undersized sample rejected', 'false', dec.few === false, dec.few);
    c('M06-53', 'motion budget', 'median slow + 2/3 slow → lite', 'true', dec.heavy === true, dec.heavy);
    const sampled = await page.evaluate(() => sampleMotionBudget().then(v => ({ isBool: typeof v === 'boolean', lite: document.documentElement.classList.contains('motion-lite') })));
    c('M06-54', 'motion budget', 'live sampler resolves boolean, healthy page not lite', 'true / no lite', sampled.isBool === true && sampled.lite === false, sampled);
    const applyTwice = await page.evaluate(() => { applyMotionBudget(); applyMotionBudget(); return document.documentElement.classList.contains('motion-lite'); });
    c('M06-55', 'motion budget', 'applyMotionBudget never misfires on healthy page', 'lite stays off', applyTwice === false, applyTwice);
    c('M06-56', 'errors', 'no errors (adaptive)', 'clean', (state.errors.concat(state.pageErrors)).length === 0, state.errors.concat(state.pageErrors));
    await ctx.close();
  }

  // ===================================================================
  section = 'M06.6 MOBILE VIEWPORTS';
  // ===================================================================
  {
    const viewports = [[320, 700], [375, 812], [390, 844], [430, 932], [768, 1024]];
    let over = 0;
    for (const vp of viewports) {
      const { ctx, page, state } = await newScenario(browser, FIX, { width: vp[0], height: vp[1] });
      const base = await page.evaluate(() => {
        const cta = document.querySelector('.hero-v3__primary');
        const cr = cta && cta.getBoundingClientRect();
        const dash = document.querySelector('.dv-dash');
        return {
          overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
          cta: !!(cr && cr.left < window.innerWidth && cr.right > 0 && cr.top < window.innerHeight && cr.bottom > 0),
          dash: !!dash,
          dock: (() => { const d = document.querySelector('.mobile-dock'); return d ? d.getBoundingClientRect().height > 0 : false; })()
        };
      });
      c('M06-57-' + vp[0], 'viewport ' + vp.join('x'), 'no horizontal page overflow', 'free', base.overflow === false, base.overflow);
      if (base.overflow) over++;
      c('M06-58-' + vp[0], 'viewport ' + vp.join('x'), 'hero CTA visible', 'visible', base.cta === true, base.cta);
      c('M06-59-' + vp[0], 'viewport ' + vp.join('x'), 'dashboard widgets present', 'rendered', base.dash === true, base.dash);
      if (vp[0] < 400) c('M06-60-' + vp[0], 'viewport ' + vp.join('x'), 'mobile dock rendered', 'height>0', base.dock === true, base.dock);
      // Sheet QV mở: không tràn + nằm gọn trong viewport.
      // Đợi animation vào xong (frame đầu của v8-qv-sheet-in còn
      // translateY(48px) làm bottom tạm vượt nhẹ) rồi mới đo.
      await openQvFromCard(page, 'a1');
      await sleep(450);
      const qvv = await page.evaluate(() => {
        const r = document.getElementById('qv').getBoundingClientRect();
        return {
          overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
          fits: r.top >= -2 && r.bottom <= window.innerHeight + 2 && r.width <= window.innerWidth + 2
        };
      });
      c('M06-61-' + vp[0], 'viewport ' + vp.join('x'), 'QV sheet inside viewport', 'fits', qvv.overflow === false && qvv.fits === true, qvv);
      await page.evaluate(() => document.getElementById('qv').close());
      c('M06-70-' + vp[0], 'viewport ' + vp.join('x'), 'no uncaught errors', 'clean', (state.errors.concat(state.pageErrors)).length === 0, state.errors.concat(state.pageErrors));
      await ctx.close();
    }
    c('M06-62', 'viewports', 'aggregate: ' + viewports.length + ' viewports overflow-free', '0 overflow', over === 0, over);
  }

  // ===================================================================
  section = 'M06.15 PURCHASE + SAVINGS UNCHANGED (touch)';
  // ===================================================================
  {
    const { ctx, page, state } = await newScenario(browser, FIX, { width: 390, height: 844 });
    // Tiết kiệm qua QV: lưu mục tiêu → localStorage + toast success.
    await openQvFromCard(page, 'a2');
    await page.evaluate(() => {
      const goal = document.getElementById('qvSavingGoal');
      if (goal) {
        goal.value = '300000';
        goal.dispatchEvent(new Event('input', { bubbles: true }));
      }
      const b = document.getElementById('qvSavingsSave');
      if (b) b.click();
    });
    await sleep(500);
    const saved = await page.evaluate(() => {
      const its = JSON.parse(localStorage.getItem('wishlist.guest.items') || '[]');
      const t = document.querySelector('.toast');
      return { goal: its.find(i => i.id === 'a2').savingGoal, toast: t ? t.className : null };
    });
    c('M06-63', 'savings touch', 'savings goal persists via unchanged flow', '300000', saved.goal === 300000, saved.goal);
    c('M06-64', 'savings touch', 'success feedback toast', 'toast--success', /toast--success/.test(saved.toast || ''), saved.toast);
    await page.evaluate(() => document.getElementById('qv').close());
    await sleep(250);

    // Mua hàng qua Card → #pd → skip → dữ liệu đổi đúng.
    await page.evaluate(() => {
      const card = document.querySelector('#grid > .wishlist-card[data-id="a3"]');
      card.scrollIntoView({ block: 'center', behavior: 'instant' });
      card.querySelector('.mark-purchased').click();
    });
    await page.waitForFunction(() => document.getElementById('pd').open === true, { timeout: 2500 });
    const pdFit = await page.evaluate(() => {
      const r = document.getElementById('pd').getBoundingClientRect();
      return { open: document.getElementById('pd').open, fits: r.top >= -2 && r.bottom <= window.innerHeight + 2 };
    });
    c('M06-65', 'purchase touch', 'purchase dialog opens and fits on phone', 'open + fits', pdFit.open && pdFit.fits, pdFit);
    // Stroke vuốt đầy đủ TRÊN hộp mua hàng: không có gesture mounted → không bao giờ tự đóng.
    const pdDrag = await page.evaluate(() => {
      const d = document.getElementById('pd');
      const head = d.querySelector('h2, header, .purchase-dialog__head') || d;
      const r = head.getBoundingClientRect();
      const fire = (type, x, y, b) => head.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, composed: true, pointerId: 99, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, buttons: b, button: 0 }));
      fire('pointerdown', r.left + 40, r.top + 12, 1);
      for (let i = 1; i <= 6; i++) fire('pointermove', r.left + 40, r.top + 12 + (i * 260) / 6, 1);
      fire('pointerup', r.left + 40, r.top + 260, 0);
      return { open: d.open };
    });
    const pdAfter = await page.evaluate(() => document.getElementById('pd').open);
    c('M06-67', 'purchase touch', 'purchase dialog never closes from a swipe', 'still open', pdDrag.open === true && pdAfter === true, { pdDrag, pdAfter });
    await page.evaluate(() => document.getElementById('pdCancel').click());
    await sleep(200);
    const pdClosed = await page.evaluate(() => !document.getElementById('pd').open);
    c('M06-68', 'purchase touch', 'purchase dialog closes via its own controls', 'closed', pdClosed === true, pdClosed);

    // Real confirm qua pdSkip (không ghi giá) — ngữ nghĩa F2 nguyên vẹn.
    await page.evaluate(() => {
      const card = document.querySelector('#grid > .wishlist-card[data-id="a1"]');
      card.scrollIntoView({ block: 'center', behavior: 'instant' });
      card.querySelector('.mark-purchased').click();
    });
    await page.waitForFunction(() => document.getElementById('pd').open === true, { timeout: 2500 });
    await page.evaluate(() => document.getElementById('pdSkip').click());
    await sleep(400);
    const purchase = await page.evaluate(() => JSON.parse(localStorage.getItem('wishlist.guest.items') || '[]').find(i => i.id === 'a1').status);
    c('M06-66', 'purchase touch', 'purchase confirm persists (unchanged semantics)', 'purchased', purchase === 'purchased', purchase);
    const focusBack = await page.evaluate(() => !!document.activeElement && document.activeElement.classList && document.activeElement.classList.contains('mark-purchased'));
    c('M06-71', 'focus', 'focus returns to the card purchase button after dialog', 'mark-purchased focused', focusBack, await page.evaluate(() => document.activeElement && document.activeElement.className));
    c('M06-69', 'errors', 'no errors (purchase/savings on touch)', 'clean', (state.errors.concat(state.pageErrors)).length === 0, state.errors.concat(state.pageErrors));
    await ctx.close();
  }

  await browser.close();
  server.close();
  const pass = results.filter(r => r.pass).length, fail = results.length - pass;
  for (const r of results) console.log((r.pass ? 'PASS' : 'FAIL') + ' [' + r.id + '] ' + r.section + ' :: ' + r.entry + (r.pass ? '' : '\n       expected: ' + r.expected + '\n       actual:   ' + r.actual));
  console.log('\n==== MOTION-06 SUITE: ' + pass + ' PASS / ' + fail + ' FAIL (total ' + results.length + ') ====');
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'motion-06-suite.json'), JSON.stringify({ generatedAt: new Date().toISOString(), repo: ROOT, pass, fail, total: results.length, results }, null, 2));
  process.exit(fail === 0 ? 0 : 1);
}

run().catch(e => { console.error('FATAL', e); try { server.close(); } catch (_) {} process.exit(3); });
