// UX-05 — measure the collection rail's control truncation at each width.
const puppeteer = require('puppeteer-core');
const http = require('http'); const fs = require('fs'); const path = require('path');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT = path.join(__dirname, '..', '..');
const PORT = 8250; const sleep = ms => new Promise(r => setTimeout(r, ms));
const MIME = { '.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.ico':'image/x-icon' };
const MOCK = `export async function initializeWishlistCloud(o){setTimeout(()=>{o.onUserChanged&&o.onUserChanged(null);o.onStatus&&o.onStatus('local','');},0);
 return {get user(){return null},signIn:async()=>{},signOut:async()=>{},syncItems:async()=>{},uploadImage:async()=>''};}`;
const server = http.createServer((req,res)=>{ let p=decodeURIComponent(req.url.split('?')[0]); if(p==='/')p='/wishlist.html';
 const f=path.join(ROOT,p); fs.readFile(f,(e,d)=>{ if(e){res.writeHead(404);return res.end('nf');}
 res.writeHead(200,{'Content-Type':MIME[path.extname(f).toLowerCase()]||'application/octet-stream','Cache-Control':'no-store'}); res.end(d);});});
const ITEMS = [
  {id:'a1',name:'Máy ảnh',price:42000000,image:'',link:'',status:'wish',priority:'high',category:'Nhiếp ảnh',note:'',createdAt:1700000000000},
  {id:'a2',name:'Tai nghe',price:7490000,image:'',link:'',status:'saving',priority:'medium',category:'Âm thanh',note:'',createdAt:1700000000001},
  {id:'a3',name:'Giày',price:2450000,image:'',link:'',status:'ordered',priority:'low',category:'Giày',note:'',createdAt:1700000000002}
];
(async()=>{
 await new Promise(r=>server.listen(PORT,'127.0.0.1',r));
 const browser=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox','--hide-scrollbars']});
 for (const w of [1440, 1024, 768, 390, 320]) {
   const ctx=await browser.createBrowserContext(); const page=await ctx.newPage();
   await page.setViewport({width:w,height:900,deviceScaleFactor:1});
   await page.evaluateOnNewDocument(s=>{ try{localStorage.setItem('wishlist.guest.items',JSON.stringify(s));}catch(e){} }, ITEMS);
   await page.setRequestInterception(true);
   page.on('request',r=>{ if(/wishlist-cloud\.js/.test(r.url())) return r.respond({status:200,contentType:'application/javascript',body:MOCK}); return r.continue(); });
   await page.goto(`http://127.0.0.1:${PORT}/wishlist.html`,{waitUntil:'domcontentloaded'});
   await page.waitForSelector('#grid .wishlist-card',{timeout:15000});
   await sleep(900);
   const m = await page.evaluate(()=>{
     const rail = document.getElementById('collection');
     const railRect = rail.getBoundingClientRect();
     const out = { railW: Math.round(railRect.width), railH: Math.round(railRect.height),
                   vh: window.innerHeight, headH: Math.round(document.querySelector('.site-header').getBoundingClientRect().height),
                   parts: [], controls: [] };
     [...rail.children].forEach(c=>{
       const r = c.getBoundingClientRect();
       out.parts.push({ cls: String(c.className).slice(0,42), h: Math.round(r.height), disp: getComputedStyle(c).display });
     });
     const hd = rail.querySelector('.collection-panel__heading');
     if (hd) {
       [...hd.querySelectorAll('*')].forEach(e=>{
         const r = e.getBoundingClientRect();
         if (r.height > 0) out.parts.push({ cls: 'H ' + e.tagName + '.' + String(e.className).slice(0,30), h: Math.round(r.height), disp: getComputedStyle(e).display });
       });
     }
     const q = document.getElementById('q');
     const qr = q.getBoundingClientRect();
     out.search = { w: Math.round(qr.width), placeholder: q.getAttribute('placeholder') };
     // does the placeholder fit?  (canvas measure)
     const c = document.createElement('canvas').getContext('2d');
     c.font = getComputedStyle(q).font || '13px system-ui';
     const ph = q.getAttribute('placeholder') || '';
     out.search.placeholderPx = Math.round(c.measureText(ph).width);
     out.search.availablePx = Math.round(qr.width - 20 /*icon*/ - 32 /*padding*/);
     ['fStatus','fPriority','fCategoryFilter','fSort','fSavings'].forEach(id=>{
       const el = document.getElementById(id);
       if(!el) return;
       const r = el.getBoundingClientRect();
       const sel = el.options[el.selectedIndex] || el.options[0];
       const label = sel ? sel.textContent : '';
       const cc = document.createElement('canvas').getContext('2d');
       cc.font = getComputedStyle(el).font || '13px system-ui';
       const textPx = Math.round(cc.measureText(label).width);
       const cs = getComputedStyle(el);
       const chrome = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) + 20;
       const avail = Math.round(r.width - chrome);
       // the LONGEST option of this select is what can clip
       let worst = { text: '', px: 0 };
       for (const o of el.options) {
         const px = Math.round(cc.measureText(o.textContent).width);
         if (px > worst.px) worst = { text: o.textContent, px };
       }
       out.controls.push({ id, w: Math.round(r.width), label, textPx, avail,
                           clipped: textPx > avail,
                           worstText: worst.text, worstPx: worst.px,
                           worstClipped: worst.px > avail });
     });
     return out;
   });
   console.log('\n--- ' + w + 'px  rail=' + m.railW + 'px  railHeight=' + m.railH + 'px  viewport=' + m.vh + '  header=' + m.headH +
     '  stickyTop=22 -> spaceBelow=' + (m.vh - 22) + '  fits=' + (m.railH <= m.vh - 22));
   m.parts.forEach(p=>console.log('    ' + String(p.h).padStart(4) + 'px  ' + p.disp.padEnd(8) + p.cls));
   console.log('  search: avail=' + m.search.availablePx + 'px text=' + m.search.placeholderPx + 'px  "' + m.search.placeholder + '"' +
     (m.search.placeholderPx > m.search.availablePx ? '   <-- CLIPPED' : ''));
   m.controls.forEach(c=>{
     console.log('  ' + c.id.padEnd(16) + ' w=' + String(c.w).padStart(4) + ' room=' + String(c.avail).padStart(4) +
       ' longest="' + c.worstText + '" ' + String(c.worstPx).padStart(4) + 'px' + (c.worstClipped ? '   <-- CLIPPED' : '   ok'));
   });
   await ctx.close();
 }
 await browser.close(); server.close();
})().catch(e=>{console.error('FATAL',e);process.exit(1);});
