// UX-03 collection-workspace screenshots (real browser, real DOM).
const puppeteer = require('puppeteer-core');
const http = require('http'); const fs = require('fs'); const path = require('path');
const CHROME = process.env.CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT = path.join(__dirname, '..', '..');
const PORT = 8203; const sleep = ms => new Promise(r => setTimeout(r, ms));
const OUT = path.join(ROOT, 'qa-out', 'ux03');
const MIME = { '.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.ico':'image/x-icon' };
const MOCK = `export async function initializeWishlistCloud(o){setTimeout(()=>{o.onUserChanged&&o.onUserChanged(null);o.onStatus&&o.onStatus('local','');},0);
 return {get user(){return null},signIn:async()=>{},signOut:async()=>{},syncItems:async()=>{},uploadImage:async()=>''};}`;
const server = http.createServer((req,res)=>{ let p=decodeURIComponent(req.url.split('?')[0]); if(p==='/')p='/wishlist.html';
 const f=path.join(ROOT,p); fs.readFile(f,(e,d)=>{ if(e){res.writeHead(404);return res.end('nf');}
 res.writeHead(200,{'Content-Type':MIME[path.extname(f).toLowerCase()]||'application/octet-stream','Cache-Control':'no-store'}); res.end(d);});});

const IMG = ['Sơ mi linen','Tai nghe chống ồn','Nồi chiên không dầu','Bàn phím cơ','Ghế công thái học','Đèn bàn Bắc Âu','Kính mắt mèo','Loa Marshall','Sách lập trình','Vali du lịch'];
const seed = IMG.map((n,i)=>({
  id:'ux3-'+(i+1), name:n, price: 450000 + i*370000, image:'', link:'',
  status: ['wish','saving','ordered','purchased'][i%4],
  priority: ['low','medium','high'][i%3],
  category: ['Công nghệ','Nhà cửa','Thời trang','Sách'][i%4],
  note:'ghi chú cho '+n, createdAt: 1700000000000 + i
}));

async function shoot(browser, w, h, label, opts={}) {
  const ctx=await browser.createBrowserContext(); const page=await ctx.newPage();
  await page.setViewport({width:w,height:h,deviceScaleFactor:1});
  await page.evaluateOnNewDocument(s=>{ try{localStorage.setItem('wishlist.guest.items',JSON.stringify(s));localStorage.setItem('wishlist.items',JSON.stringify(s));}catch(e){} }, seed);
  await page.setRequestInterception(true);
  page.on('request',r=>{ if(/wishlist-cloud\.js/.test(r.url())) return r.respond({status:200,contentType:'application/javascript',body:MOCK}); return r.continue(); });
  await page.goto(`http://127.0.0.1:${PORT}/wishlist.html`,{waitUntil:'domcontentloaded'});
  await page.waitForSelector('#grid .wishlist-card',{timeout:15000});
  await sleep(900);
  if (opts.view) { await page.evaluate(v=>document.getElementById(v).click(), opts.view); await sleep(700); }
  if (opts.openFilters) {
    await page.evaluate(()=>{ const t=document.getElementById('filterToggle'); if(t && getComputedStyle(t).display!=='none') t.click(); });
    await sleep(500);
  }
  // scroll the collection workspace into view using the browser's own
  // scroll-into-view (which now honours the fixed-header scroll inset)
  await page.evaluate(()=>{
    const el = document.querySelector('.v11-workspace');
    el.scrollIntoView({ block: 'start', behavior: 'instant' });
  });
  await sleep(700);
  const file = path.join(OUT, 'collection-' + label + '.png');
  await page.screenshot({ path: file });
  // metrics for the report
  const m = await page.evaluate(()=>{
    const r=document.querySelector('.v11-workspace').getBoundingClientRect();
    return { workspaceTop: Math.round(r.top), docW: document.documentElement.scrollWidth, winW: window.innerWidth };
  });
  console.log(label.padEnd(22)+' file='+path.basename(file)+'  workspaceTop='+m.workspaceTop+'  overflow='+(m.docW>m.winW+1));
  await ctx.close();
  return file;
}

(async()=>{
 fs.mkdirSync(OUT,{recursive:true});
 await new Promise(r=>server.listen(PORT,'127.0.0.1',r));
 const browser=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox','--hide-scrollbars','--force-device-scale-factor=1']});
 const files=[];
 files.push(await shoot(browser,1440,900,'1440-gallery'));
 files.push(await shoot(browser,1440,900,'1440-focus',{view:'v13FocusView'}));
 files.push(await shoot(browser,1440,900,'1440-board',{view:'v13BoardView'}));
 files.push(await shoot(browser,1024,900,'1024-gallery'));
 files.push(await shoot(browser,768,900,'768-gallery'));
 files.push(await shoot(browser,390,844,'390-gallery'));
 files.push(await shoot(browser,390,844,'390-filters-open',{openFilters:true}));
 files.push(await shoot(browser,320,844,'320-gallery'));
 files.push(await shoot(browser,320,844,'320-filters-open',{openFilters:true}));
 console.log('\n'+files.join('\n'));
 await browser.close(); server.close();
})().catch(e=>{console.error('FATAL',e);process.exit(1);});
