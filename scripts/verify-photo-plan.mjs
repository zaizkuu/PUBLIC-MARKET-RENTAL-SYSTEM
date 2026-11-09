import puppeteer from 'puppeteer';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
const browser=await puppeteer.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--enable-unsafe-swiftshader','--use-angle=swiftshader','--no-sandbox']});
try {
 const page=await browser.newPage();await page.setViewport({width:1440,height:1100,deviceScaleFactor:1});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5175',{waitUntil:'networkidle0'});
 // Isolated component fixture: no sign-in or office records are modified.
 await page.evaluate(async()=>{
  const {default:React}=await import('/node_modules/.vite/deps/react.js');
  const {default:ReactDOM}=await import('/node_modules/.vite/deps/react-dom_client.js');
  const {default:Plan}=await import('/src/market/PhotoFloorPlan.tsx');
  const {buildDirectory}=await import('/src/market/directory.ts');
  document.body.innerHTML='<main id="photo-fixture" style="padding:24px;max-width:1440px;margin:auto"></main>';
  const records=buildDirectory().stalls;
  records.find(s=>s.id==='CS-38').status='Available'; // Current record differs from the photograph.
  ReactDOM.createRoot(document.getElementById('photo-fixture')).render(React.createElement(Plan,{existingStalls:records}));
 });
 await page.waitForSelector('.photo-canvas canvas');
 assert.equal(await page.$('.photo-toolbar'),null);
 assert.equal(await page.$('.photo-current-area'),null);
 assert.equal(await page.$('.photo-stall-list'),null);
 await page.click('::-p-text(2D plan)');
 assert.equal(await page.$$eval('.photo-flat g[role="button"]',els=>els.length),194);
 await page.click('.photo-status-filter .available');
 assert.equal(await page.$eval('g[aria-label^="CS-38,"]',el=>el.getAttribute('opacity')),'1','Available uses the current record, not the photograph');
 assert.equal(await page.$eval('g[aria-label^="CS-38,"] rect',el=>el.getAttribute('fill')),'#20a675');
 assert.equal(await page.$eval('g[aria-label^="MS-26,"]',el=>el.getAttribute('opacity')), '0.3');
 assert.equal(await page.$$eval('.photo-flat g[role="button"][opacity="1"]',els=>els.length),Number(await page.$eval('.photo-status-filter .available b',el=>el.textContent)));
 await page.click('.photo-status-filter .occupied');
 assert.equal(await page.$eval('g[aria-label^="CS-38,"]',el=>el.getAttribute('opacity')), '0.3');
 assert.equal(await page.$eval('g[aria-label^="MS-26,"] rect',el=>el.getAttribute('fill')),'#397ed6');
 assert.equal(await page.$eval('g[aria-label^="VS-95,"]',el=>el.getAttribute('opacity')), '0.3','Guard station is not a tenant stall');
 await page.click('.photo-status-filter button:first-child');
 await page.click('g[aria-label^="MS-26,"]');
 assert.match(await page.$eval('.photo-owner',el=>el.textContent),/BIGOY/);
 await page.select('select[aria-label="Market section"]','produce');
 assert.equal(await page.$$eval('.photo-flat g[role="button"]',els=>els.length),101);
 await page.click('g[aria-label^="VS-159,"]');
 assert.match(await page.$eval('.photo-owner',el=>el.textContent),/VILLERO, CRISANTA/);
 await page.click('::-p-text(3D perspective)');
 await page.waitForSelector('.photo-canvas canvas');
 assert.equal(await page.$eval('select[aria-label="Market section"]',el=>el.value),'all');
 mkdirSync('reports',{recursive:true});
 await page.screenshot({path:'reports/all-sections-plan.png',fullPage:true});
 await page.click('.photo-status-filter .available');
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 await page.screenshot({path:'reports/available-stalls.png',fullPage:true});
 const lightBackground=await page.$eval('.photo-stage',el=>getComputedStyle(el).backgroundColor);
 const lightScene=await page.$eval('.photo-canvas canvas',el=>{const gl=el.getContext('webgl2');return Array.from(gl.getParameter(gl.COLOR_CLEAR_VALUE)).slice(0,3).reduce((a,b)=>a+b,0);});
 await page.evaluate(()=>{window.photoCanvasBeforeTheme=document.querySelector('.photo-canvas canvas');document.documentElement.dataset.theme='dark';});
 await page.waitForFunction(()=>getComputedStyle(document.querySelector('.photo-stage')).backgroundColor==='rgb(16, 27, 42)');
 await page.waitForFunction(old=>{const gl=document.querySelector('.photo-canvas canvas').getContext('webgl2');return Array.from(gl.getParameter(gl.COLOR_CLEAR_VALUE)).slice(0,3).reduce((a,b)=>a+b,0)<old;}, {}, lightScene);
 assert.ok(await page.evaluate(()=>window.photoCanvasBeforeTheme===document.querySelector('.photo-canvas canvas')));
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>{document.querySelector('.photo-canvas canvas').getContext('webgl2').finish();resolve();}))));
 await page.screenshot({path:'reports/all-sections-dark.png',fullPage:true});
 await page.click('::-p-text(Full screen)');
 await page.waitForFunction(()=>document.fullscreenElement?.classList.contains('photo-scene'));
 await page.click('::-p-text(Exit full screen)');
 await page.waitForFunction(()=>!document.fullscreenElement);
 await page.evaluate(()=>{document.documentElement.dataset.theme='light';});
 await page.waitForFunction(bg=>getComputedStyle(document.querySelector('.photo-stage')).backgroundColor===bg,{},lightBackground);
 await page.click('::-p-text(Top view)');
 const canvas=await page.$('.photo-canvas canvas');const bounds=await canvas.boundingBox();let hit=false;
 for(let y=.2;y<=.8&&!hit;y+=.15)for(let x=.15;x<=.85&&!hit;x+=.1){
  await page.mouse.click(bounds.x+bounds.width*x,bounds.y+bounds.height*y);
  hit=await page.$eval('.photo-details h4',el=>el.textContent!=='VS-159');
 }
 assert.ok(hit,'3D raycast selects a stall');
 await page.setViewport({width:390,height:844,deviceScaleFactor:1});
 assert.ok(await page.$$eval('.photo-status-filter button',els=>els.every(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth;})));
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.screenshot({path:'reports/all-sections-mobile.png',fullPage:true});
 assert.deepEqual(errors,[]);
 console.log('Passed: section dropdown, current-record occupancy highlights and counts, clear filter, owner selection, dark mode, fullscreen and mobile layout.');
} finally {await browser.close();}
