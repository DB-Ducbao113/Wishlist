// UX-04 before/after screenshots for the product surfaces.
const puppeteer = require('puppeteer-core');
const http = require('http'); const fs = require('fs'); const path = require('path');
const CHROME = process.env.CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT = path.join(__dirname, '..', '..');
const PORT = 8231; const sleep = ms => new Promise(r => setTimeout(r, ms));
const OUT = path.join(ROOT, 'qa-out', 'ux04');
const MIME = { '.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.ico':'image/x-icon' };
const MOCK = `export async function initializeWishlistCloud(o){setTimeout(()=>{o.onUserChanged&&o.onUserChanged(null);o.onStatus&&o.onStatus('local','');},0);
 return {get user(){return null},signIn:async()=>{},signOut:async()=>{},syncItems:async()=>{},uploadImage:async()=>''};}`;
const server = http.createServer((req,res)=>{ let p=decodeURIComponent(req.url.split('?')[0]); if(p==='/')p='/wishlist.html';
 const f=path.join(ROOT,p); fs.readFile(f,(e,d)=>{ if(e){res.writeHead(404);return res.end('nf');}
 res.writeHead(200,{'Content-Type':MIME[path.extname(f).toLowerCase()]||'application/octet-stream','Cache-Control':'no-store'}); res.end(d);});});

const IMG = ['Tai nghe chống ồn','Nồi chiên không dầu','Bàn phím cơ','Ghế công thái học','Đèn bàn Bắc Âu','Kính mắt mèo','Loa Marshall','Vali du lịch'];
const seed = IMG.map((n,i)=>({ id:'ux4-'+(i+1), name:n, price:450000+i*370000, image:'', link: i%2? 'https://example.com/mua':'',
  status:['wish','saving','ordered','purchased'][i%4], priority:['low','medium','high'][i%3],
  category:['Công nghệ','Nhà cửa','Thời trang','Sách'][i%4], note:'Ghi chú cho '+n, createdAt:1700000000000+i,
  ...(i%3===0 ? {savingGoal:900000, savedAmount:250000} : {}) }));

async function shot(browser, w, h, tag, mobile, fn){
  const ctx=await browser.createBrowserContext(); const page=await ctx.newPage();
  await page.setViewport({width:w,height:h,deviceScaleFactor:1,isMobile:!!mobile,hasTouch:!!mobile});
  await page.evaluateOnNewDocument(s=>{ try{localStorage.setItem('wishlist.guest.items',JSON.stringify(s));}catch(e){} }, seed);
  await page.setRequestInterception(true);
  page.on('request',r=>{ if(/wishlist-cloud\.js/.test(r.url())) return r.respond({status:200,contentType:'application/javascript',body:MOCK}); return r.continue(); });
  await page.goto(`http://127.0.0.1:${PORT}/wishlist.html`,{waitUntil:'domcontentloaded'});
  await page.waitForSelector('#grid .wishlist-card',{timeout:15000});
  await sleep(800);
  if (fn) await fn(page);
  await sleep(500);
  const file = path.join(OUT, tag + '.png');
  await page.screenshot({ path: file });
  console.log('  ' + tag + '  ->  ' + path.basename(file));
  await ctx.close();
}

(async()=>{
 fs.mkdirSync(OUT,{recursive:true});
 await new Promise(r=>server.listen(PORT,'127.0.0.1',r));
 const browser=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox','--hide-scrollbars','--force-device-scale-factor=1']});
 const tag = process.argv[2] || 'before';
 // card close-up at desktop
 await shot(browser,1440,900,tag+'-card-1440',false, async p=>{
   await p.evaluate(()=>{ document.querySelector('#grid .wishlist-card').scrollIntoView({block:'center'}); });
 });
 // add dialog desktop
 await shot(browser,1440,900,tag+'-add-1440',false, async p=>{ await p.click('#btnAdd'); await sleep(500); });
 // add dialog mobile
 await shot(browser,390,844,tag+'-add-390',true, async p=>{ await p.click('#btnAdd'); await sleep(500); });
 // quick view desktop
 await shot(browser,1440,900,tag+'-qv-1440',false, async p=>{ await p.click('#grid .wishlist-card .product-card__view'); await sleep(900); });
 // quick view mobile
 await shot(browser,390,844,tag+'-qv-390',true, async p=>{ await p.click('#grid .wishlist-card .product-card__view'); await sleep(1000); });
 // quick view mobile scrolled to the note area
 await shot(browser,390,844,tag+'-qv-390-note',true, async p=>{
   await p.click('#grid .wishlist-card .product-card__view'); await sleep(900);
   await p.evaluate(()=>{ const n=document.getElementById('qvNote'); if(n) n.scrollIntoView({block:'center'}); });
   await sleep(500);
 });
 await browser.close(); server.close();
})().catch(e=>{console.error('FATAL',e);process.exit(1);});
