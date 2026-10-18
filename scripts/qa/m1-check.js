// V16 M1 — auth session & logout isolation.
// Stubs wishlist-cloud.js via request interception so the session lifecycle
// (login / logout / A -> B) can be driven deterministically without Firebase.
const puppeteer = require('puppeteer-core');
const http = require('http');
const fs = require('fs');
const path = require('path');

const CHROME = process.env.CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT = process.argv[2] || path.join(__dirname, '..', '..');
const PORT = Number(process.argv[3] || 8123);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

const MOCK = `
const state = { user: null, opts: null, syncs: [], statuses: [] };
window.__cloud = state;
export async function initializeWishlistCloud(opts){
  state.opts = opts;
  window.__cloudSetUser = (u) => { state.user = u; if(opts.onUserChanged) opts.onUserChanged(u ? u.uid : null); };
  window.__cloudRemote = (items, initial) => { if(opts.onRemoteItems) opts.onRemoteItems(items, !!initial); };
  window.__cloudStatus = (kind, email) => { state.statuses.push(kind); if(opts.onStatus) opts.onStatus(kind, email || ''); };
  window.__cloudError = (m) => { if(opts.onError) opts.onError(m); };
  window.__cloudSyncs = () => state.syncs;
  // Mimic onAuthStateChanged firing asynchronously with the initial (guest) state.
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

const results = [];
function check(name, cond, extra) {
  results.push({ name, pass: !!cond, extra: extra === undefined ? '' : JSON.stringify(extra) });
}

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/wishlist.html';
  const file = path.join(ROOT, p);
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
});

async function openPage(browser, seedItems) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  if (seedItems) {
    await page.evaluateOnNewDocument(items => {
      try { localStorage.setItem('wishlist.items', JSON.stringify(items)); } catch (e) {}
    }, seedItems);
  }
  await page.setRequestInterception(true);
  page.on('request', req => {
    if (/wishlist-cloud\.js/.test(req.url())) {
      return req.respond({ status: 200, contentType: 'text/javascript', body: MOCK });
    }
    req.continue();
  });
  await page.goto(`http://localhost:${PORT}/wishlist.html`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForFunction('typeof window.__cloudSetUser === "function"', { timeout: 15000 });
  await sleep(200);
  return { ctx, page };
}

const snapshot = page => page.evaluate(() => {
  const ls = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    ls[k] = localStorage.getItem(k);
  }
  const cards = [...document.querySelectorAll('#grid .wishlist-card')].map(c => c.dataset.id);
  return {
    ls,
    cards,
    syncStatus: document.getElementById('syncStatus').textContent.trim(),
    accountState: document.getElementById('syncAccountState').textContent.trim(),
    listState: document.getElementById('syncListState').textContent.trim(),
    signInHidden: document.getElementById('btnSignIn').classList.contains('hidden'),
    signOutHidden: document.getElementById('btnSignOut').classList.contains('hidden'),
    emptyShown: !document.getElementById('empty').classList.contains('hidden')
  };
});

const j = s => { try { return JSON.parse(s); } catch (e) { return null; } };

const ITEM = (id, name) => ({ id, name: name || id, price: 1000, image: '', link: '', status: 'wish', priority: 'medium', category: '', note: '', createdAt: 1700000000000 });
// Ảnh legacy của fixture phải là một JPEG THẬT (2x2, giải mã được).
// Bản cũ là một JPEG cụt 6 byte (`/9j/AAAA`) mà không decoder nào nhận: khi đó
// assertion chỉ còn đúng nhờ việc Chrome *chưa từng thử* tải URL đó — thẻ
// trong #grid nằm cách đáy viewport ~2100px nên `loading="lazy"` hoãn vô hạn.
// Chỉ cần một chỗ nào đó giải mã URL ấy ngay (ví dụ thẻ hero FUSION-01, vốn
// hiển thị ảnh wishlist thật ở trên màn hình đầu) là cơ chế "ảnh lỗi → ảnh
// thay thế" của app chạy đúng, và assertion fail dù ảnh legacy VẪN được giữ.
// Ảnh giải mã được kiểm tra đúng điều định kiểm: view tài khoản giữ ảnh
// local của khách cho cùng id.
const IMG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADb/2wBDAA0JCgsKCA0LCgsODg0PEyAVExISEyccHhcgLikxMC4pLSwzOko+MzZGNywtQFdBRkxOUlNSMj5aYVpQYEpRUk//2wBDAQ4ODhMREyYVFSZPNS01T09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0//wAARCAACAAIDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAP/xAAXEAEBAQEAAAAAAAAAAAAAAAABAgAR/8QAFQEBAQAAAAAAAAAAAAAAAAAAAgX/xAAVEQEBAAAAAAAAAAAAAAAAAAAAAf/aAAwDAQACEQMRAD8ArVVdNUtUvVXquZmoQn//2Q==';

(async () => {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--hide-scrollbars'] });

  // ---------- T1: fresh guest ----------
  {
    const { ctx, page } = await openPage(browser);
    const s = await snapshot(page);
    check('T1 fresh guest: no cards', s.cards.length === 0, s.cards);
    check('T1 fresh guest: no sample data', !s.cards.some(id => /^sample-/.test(String(id))), s.cards);
    check('T1 fresh guest: empty state shown', s.emptyShown === true);
    check('T1 fresh guest: sync state local', /thiết bị/i.test(s.syncStatus), s.syncStatus);
    check('T1 fresh guest: account = Chưa đăng nhập', s.accountState === 'Chưa đăng nhập', s.accountState);
    check('T1 fresh guest: no account keys', !Object.keys(s.ls).some(k => k.startsWith('wishlist.account.')), Object.keys(s.ls));
    await ctx.close();
  }

  // ---------- T2..T8: legacy -> guest -> A -> logout -> refresh -> A -> B ----------
  const legacy = [ITEM('g1', 'GuestOne'), { ...ITEM('g2', 'GuestTwo'), image: IMG }];
  const aItems = [ITEM('A1', 'AccountA')];
  const bItems = [ITEM('B1', 'AccountB')];
  {
    const { ctx, page } = await openPage(browser, legacy);
    let s = await snapshot(page);
    check('T2 legacy shows as guest list', s.cards.join(',') === 'g1,g2', s.cards);
    check('T2 backup key created with legacy data', JSON.stringify(j(s.ls['wishlist.items.legacy-backup-v16']) || null) === JSON.stringify(legacy));
    check('T2 legacy key untouched', JSON.stringify(j(s.ls['wishlist.items']) || null) === JSON.stringify(legacy));
    check('T2 guest key written', JSON.stringify(j(s.ls['wishlist.guest.items']) || null) === JSON.stringify(legacy));
    check('T2 no cloud sync while guest', (await page.evaluate(() => window.__cloudSyncs())).length === 0);

    // ---- T3: sign in as A ----
    await page.evaluate(() => { window.__cloudSetUser({ uid: 'A', email: 'a@example.com' }); });
    await sleep(60);
    await page.evaluate(items => { window.__cloudRemote(items, true); }, aItems);
    await page.evaluate(() => { window.__cloudStatus('synced', 'a@example.com'); });
    await sleep(80);
    s = await snapshot(page);
    const syncsA = await page.evaluate(() => window.__cloudSyncs());
    check('T3 login A: only A items (no guest mix)', s.cards.join(',') === 'A1', s.cards);
    check('T3 account cache written', JSON.stringify(j(s.ls['wishlist.account.A']) || null) === JSON.stringify(aItems));
    check('T3 guest list preserved separately', JSON.stringify(j(s.ls['wishlist.guest.items']) || null) === JSON.stringify(legacy));
    check('T3 A items pushed to Firestore', JSON.stringify(syncsA[syncsA.length - 1]) === JSON.stringify(['A1']), syncsA);
    check('T3 signed-in UI state', s.accountState === 'a@example.com' && s.signOutHidden === false && s.signInHidden === true, s.accountState);

    // ---- T4: logout ----
    await page.evaluate(() => { window.__cloudSetUser(null); window.__cloudStatus('local', ''); });
    await sleep(80);
    s = await snapshot(page);
    const syncsOut = await page.evaluate(() => window.__cloudSyncs());
    check('T4 logout: guest list restored', s.cards.join(',') === 'g1,g2', s.cards);
    check('T4 logout: no syncItems([]) wipe', !syncsOut.some(ids => ids.length === 0), syncsOut);
    check('T4 logout: UI back to guest', s.accountState === 'Chưa đăng nhập' && s.signInHidden === false && s.signOutHidden === true, s.accountState);

    // ---- T5: refresh after logout ----
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction('typeof window.__cloudSetUser === "function"', { timeout: 15000 });
    await sleep(250);
    s = await snapshot(page);
    check('T5 refresh after logout: still guest', s.cards.join(',') === 'g1,g2', s.cards);
    check('T5 refresh after logout: not signed in', s.accountState === 'Chưa đăng nhập', s.accountState);

    // ---- T6: login A again ----
    await page.evaluate(() => { window.__cloudSetUser({ uid: 'A', email: 'a@example.com' }); });
    await sleep(60);
    await page.evaluate(items => { window.__cloudRemote(items, true); }, aItems);
    await sleep(80);
    s = await snapshot(page);
    check('T6 login A again: A data restored', s.cards.join(',') === 'A1', s.cards);

    // ---- T7: A -> B ----
    await page.evaluate(() => { window.__cloudSetUser(null); });
    await sleep(40);
    await page.evaluate(() => { window.__cloudSetUser({ uid: 'B', email: 'b@example.com' }); });
    await sleep(40);
    await page.evaluate(items => { window.__cloudRemote(items, true); }, bItems);
    await page.evaluate(() => { window.__cloudStatus('synced', 'b@example.com'); });
    await sleep(80);
    s = await snapshot(page);
    check('T7 A -> B: only B items', s.cards.join(',') === 'B1', s.cards);
    check('T7 B cache written', JSON.stringify(j(s.ls['wishlist.account.B']) || null) === JSON.stringify(bItems));
    check('T7 A cache intact', JSON.stringify(j(s.ls['wishlist.account.A']) || null) === JSON.stringify(aItems));

    // ---- T8: stale snapshot after logout is ignored ----
    await page.evaluate(() => { window.__cloudSetUser(null); });
    await sleep(60);
    await page.evaluate(items => { window.__cloudRemote(items, false); }, bItems);
    await sleep(80);
    s = await snapshot(page);
    check('T8 stale snapshot ignored after logout', s.cards.join(',') === 'g1,g2', s.cards);

    await ctx.close();
  }

  // ---------- T9: legacy images preserved for the account ----------
  {
    const { ctx, page } = await openPage(browser, legacy);
    await page.evaluate(() => { window.__cloudSetUser({ uid: 'C', email: 'c@example.com' }); });
    await sleep(60);
    // Firestore copy of g2 has no image (data-URLs are never stored there).
    await page.evaluate(items => { window.__cloudRemote(items, true); }, [{ ...ITEM('g2', 'GuestTwo'), image: '' }]);
    await sleep(80);
    const img = await page.evaluate(() => {
      const c = document.querySelector('#grid .wishlist-card');
      const im = c && c.querySelector('.product-media__image');
      return im ? im.getAttribute('src') : null;
    });
    const s = await snapshot(page);
    check('T9 account view keeps guest local image for same id', img && img.indexOf('data:image/jpeg') === 0, img ? img.slice(0, 30) : img);
    check('T9 legacy-only item not merged into account list', s.cards.join(',') === 'g2', s.cards);
    await ctx.close();
  }

  await browser.close();
  server.close();

  const pass = results.filter(r => r.pass).length;
  results.forEach(r => console.log((r.pass ? 'PASS ' : 'FAIL ') + r.name + (r.extra ? '  :: ' + r.extra : '')));
  console.log(`\nM1 RESULT: ${pass} PASS / ${results.length - pass} FAIL  (total ${results.length})`);
  process.exit(results.some(r => !r.pass) ? 1 : 0);
})().catch(e => { console.error(e); try { server.close(); } catch (_) {} process.exit(2); });
