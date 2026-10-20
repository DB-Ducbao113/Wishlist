// Why is the rail stale at the bottom?
const puppeteer = require('puppeteer-core');
const http = require('http'); const fs = require('fs'); const path = require('path');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT = path.join(__dirname, '..', '..');
const PORT = 8280; const sleep = ms => new Promise(r => setTimeout(r, ms));
const MIME = { '.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.ico':'image/x-icon' };
const MOCK = `export async function initializeWishlistCloud(o){setTimeout(()=>{o.onUserChanged&&o.onUserChanged(null);o.onStatus&&o.onStatus('local','');},0);
 return {get user(){return null},signIn:async()=>{},signOut:async()=>{},syncItems:async()=>{},uploadImage:async()=>''};}`;
const server = http.createServer((req,res)=>{ let p=decodeURIComponent(req.url.split('?')[0]); if(p==='/')p='/wishlist.html';
 const f=path.join(ROOT,p); fs.readFile(f,(e,d)=>{ if(e){res.writeHead(404);return res.end('nf');}
 res.writeHead(200,{'Content-Type':MIME[path.extname(f).toLowerCase()]||'application/octet-stream','Cache-Control':'no-store'}); res.end(d);});});
const ITEMS = Array.from({length:5}, (_, k) => ({ id:'a'+(k+1), name:'Món '+(k+1), price:500000+k, image:'', link:'', status:'wish', priority:'medium', category:'A', note:'', createdAt:1700000000000+k }));
(async()=>{
 await new Promise(r=>server.listen(PORT,'127.0.0.1',r));
 const browser=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox','--hide-scrollbars']});
 const ctx=await browser.createBrowserContext(); const page=await ctx.newPage();
 await page.setViewport({width:1440,height:900,deviceScaleFactor:1});
 await page.evaluateOnNewDocument(s=>{ try{localStorage.clear(); localStorage.setItem('wishlist.guest.items',JSON.stringify(s));}catch(e){} }, ITEMS);
 await page.setRequestInterception(true);
 page.on('request',r=>{ if(/wishlist-cloud\.js/.test(r.url())) return r.respond({status:200,contentType:'application/javascript',body:MOCK}); return r.continue(); });
 await page.goto(`http://127.0.0.1:${PORT}/wishlist.html`,{waitUntil:'domcontentloaded'});
 await page.waitForSelector('#grid .wishlist-card', { timeout: 20000 });
 await sleep(1200);
 // count scroll events and watch the bar
 await page.evaluate(()=>{
   window.__scrolls = 0;
   window.addEventListener('scroll', ()=>{ window.__scrolls++; }, {passive:true});
 });
 const ratio = async (r, label)=>{
   await page.evaluate((rr)=>{
     const doc=document.documentElement;
     const max=Math.max(0, doc.scrollHeight - window.innerHeight);
     window.scrollTo(0, Math.round(max*rr));
   }, r);
   await sleep(140);
   const s = await page.evaluate(()=>{
     const doc=document.documentElement;
     const el=document.getElementById('pvProgressBar');
     const m=getComputedStyle(el).transform;
     return { scrolls: window.__scrolls, y: Math.round(window.scrollY),
       max: Math.round(Math.max(1, doc.scrollHeight-window.innerHeight)),
       docH: doc.scrollHeight, inline: el.style.transform, computed: m,
       isSame: el === (window.__bar||el) };
   });
   console.log(label.padEnd(8), JSON.stringify(s));
   return s;
 };
 await ratio(0, 'ratio0');
 await ratio(0.5, 'ratio.5');
 await ratio(1, 'ratio1');
 await sleep(600);
 const s = await page.evaluate(()=>{
   const doc=document.documentElement;
   const el=document.getElementById('pvProgressBar');
   return { scrolls: window.__scrolls, y: Math.round(window.scrollY),
     max: Math.round(Math.max(1, doc.scrollHeight-window.innerHeight)),
     inline: el.style.transform, computed: getComputedStyle(el).transform };
 });
 console.log('after 600ms ', JSON.stringify(s));
 await browser.close(); server.close();
})().catch(e=>{console.error('FATAL',e);process.exit(1);});
