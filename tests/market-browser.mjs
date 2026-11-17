import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { createMapAPI } from '../server/map-api.mjs';
import puppeteer from 'puppeteer';

// Build first. Every write uses an isolated database and browser profile, never office data.
const distRoot = fileURLToPath(new URL('../dist/', import.meta.url));
const entry = join(distRoot, 'index.html');
await readFile(entry);
const api = createMapAPI(':memory:');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };
const server = createServer((req, res) => api.middleware(req, res, async () => {
 try {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const filename = pathname === '/' ? entry : resolve(distRoot, '.' + pathname);
  if (!filename.startsWith(resolve(distRoot) + sep)) { res.writeHead(403); res.end(); return; }
  const contents = await readFile(filename);
  res.writeHead(200, { 'Content-Type': mime[extname(filename)] || 'application/octet-stream' });
  res.end(contents);
 } catch { res.writeHead(404); res.end('Not found'); }
}));
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
 browser = await puppeteer.launch({ headless: true, executablePath: process.env.MARKET_TEST_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', args: ['--allow-file-access-from-files', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
 const page = await browser.newPage();
 const errors = [];
 page.on('pageerror', error => errors.push(error.message));
 const clickText = async (text, target = page) => {
  const clicked = await target.evaluate(value => {
   const button = [...document.querySelectorAll('.public-market-map button')].find(element => element.textContent.trim() === value || element.lastChild?.textContent.trim() === value);
   if (!button) return false;
   button.click();
   return true;
  }, text);
  assert.ok(clicked, 'Button ' + text + ' exists');
 };
 const publicLayout = () => page.evaluate(async () => (await (await fetch('/api/market/public')).json()).layout);
 const screenshot = async (name, target = page) => (await target.$('.public-market-map')).screenshot({ path: join(tmpdir(), name) });
 const clearSearch = async (target = page) => { if (await target.$('[aria-label="Clear search"]')) await target.click('[aria-label="Clear search"]'); };
 // Count actual scene draw calls rather than accepting an empty WebGL canvas.
 const observeRendering = target => target.evaluateOnNewDocument(() => {
  window.__marketDraws = new WeakMap();
  for (const prototype of [window.WebGLRenderingContext?.prototype, window.WebGL2RenderingContext?.prototype]) {
   if (!prototype) continue;
   for (const method of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) {
    const draw = prototype[method];
    if (typeof draw !== 'function') continue;
    prototype[method] = function (...args) {
     const result = draw.apply(this, args);
     window.__marketDraws.set(this.canvas, (window.__marketDraws.get(this.canvas) || 0) + 1);
     return result;
    };
   }
  }
 });
 const check3D = async target => {
  await target.waitForSelector('.market-three-host canvas');
  await target.$eval('.market-three-host', element => element.scrollIntoView({ block: 'center' }));
  await target.waitForFunction(() => {
   const canvas = document.querySelector('.market-three-host canvas');
   return canvas?.width > 0 && canvas?.height > 0 && window.__marketDraws?.get(canvas) > 0;
  });
  assert.equal(await target.$eval('[aria-label="3D view"]', element => element.getAttribute('aria-pressed')), 'true');
 };
 const use2D = async (target = page) => {
  await target.click('[aria-label="2D view"]');
  await target.waitForSelector('.market-stall');
  assert.equal(await target.$('.market-three-host canvas'), null, '2D mode releases the 3D canvas');
 };
 const checkOverflow = async target => {
  const overflowing = await target.$$eval('.public-market-map, .market-main-view, .market-information, .market-three, .market-three-host', elements => elements.filter(element => element.scrollWidth > element.clientWidth + 1).map(element => element.className));
  assert.deepEqual(overflowing, [], 'floor plan and selection details fit their available width');
 };
 const fillEditorField = async (label, value) => {
  const handle = await page.evaluateHandle(text => [...document.querySelectorAll('.market-editor fieldset label')].find(element => element.firstChild?.textContent.trim() === text)?.querySelector('input'), label);
  const input = handle.asElement();
  assert.ok(input, 'Editor field ' + label + ' exists');
  await input.click();
  await page.keyboard.down('Control'); await page.keyboard.press('A'); await page.keyboard.up('Control');
  await input.type(value);
  await handle.dispose();
 };

 await observeRendering(page);
 await page.setViewport({ width: 1440, height: 1100 });
 await page.goto('http://127.0.0.1:' + server.address().port, { waitUntil: 'networkidle0' });
 await page.waitForSelector('.market-admin-toggle');
 await page.$eval('.public-market-map', element => element.scrollIntoView());
 assert.equal(await page.$('.public-market-map iframe'), null, 'floor plan has no remote map iframe');
 assert.doesNotMatch(await page.$eval('.public-market-map', element => element.textContent), /Street View|Market overview|Explore Inside Market/);
 await check3D(page);
 assert.equal(await page.$('.market-information'), null, 'default 3D view has no market guide sidebar');
 await checkOverflow(page);
 await screenshot('market-floor-plan-3d.png');
 await page.setViewport({ width: 600, height: 900 });
 await check3D(page);
 await checkOverflow(page);
 await screenshot('market-floor-plan-3d-mobile.png');
 await page.setViewport({ width: 1440, height: 1100 });
 await use2D();
 assert.equal(await page.$$eval('.market-section', elements => elements.length), 3);
 assert.equal(await page.$$eval('.market-section-card', elements => elements.length), 0);
 assert.equal(await page.$('.market-information'), null, 'default floor plan has no market guide sidebar');
 assert.equal(await page.$$eval('.market-stall', elements => elements.length), 11);
 assert.match(await page.$eval('.market-map-footer', element => element.textContent), /Published floor plan/);
 const initialLayout = await publicLayout();
 assert.equal(initialLayout.revision, 0);
 assert.equal(initialLayout.records.length, 0);
 assert.ok(initialLayout.stalls.every(unit => !unit.recordId), 'opening the floor plan does not assign official stall records');
 await checkOverflow(page);
 await screenshot('market-floor-plan.png');
 await page.$eval('.market-section', element => element.focus());
 await page.keyboard.press('Enter');
 assert.ok(await page.$('.market-section[aria-pressed="true"]'), 'sections support keyboard selection');
 await clickText('Entire floor plan');
 assert.equal(await page.$('.market-information'), null, 'returning to the entire floor plan hides selection details');
 await page.click('.market-stall');
 assert.match(await page.$eval('.market-place', element => element.textContent), /stall record has not been assigned/);
 assert.equal(await page.$('.market-directions-box'), null, 'unverified floor plans do not offer walking directions');
 await page.type('[aria-label="Search market floor plan"]', 'FV-01');
 await page.keyboard.press('Enter');
 assert.match(await page.$eval('.market-place', element => element.textContent), /FV-01/);
 assert.match(await page.$eval('.market-place', element => element.textContent), /Location not yet assigned/);
 await clearSearch();
 await page.type('[aria-label="Search market floor plan"]', 'no-such-market-space');
 await page.waitForSelector('.market-empty-state');
 assert.equal(await page.$$eval('.market-search-results > button', elements => elements.length), 0, 'empty search does not show unrelated sections');
 await clickText('Clear filters');
 assert.equal(await page.$eval('[aria-label="Search market floor plan"]', element => element.value), '');

 await page.click('[aria-label="3D view"]');
 await check3D(page);
 await clickText('Manage layout');
 await page.waitForSelector('.market-login');
 await page.type('.market-login input[autocomplete="username"]', 'browser-admin');
 await page.type('.market-login input[type="password"]', 'browser-test-password');
 await page.click('.market-login button.market-primary');
 await page.waitForSelector('.market-editor');
 assert.equal(await page.$('.market-three-host canvas'), null, 'layout administration uses editable 2D geometry');
 assert.ok(await page.$('.market-stall'), 'admin can edit the same layout in 2D');
 await clickText('Import existing stall IDs and statuses');
 await page.select('.market-editor select', 'ref-v1');
 await page.evaluate(() => {
  const label = [...document.querySelectorAll('.market-editor label')].find(element => element.textContent.includes('Assigned directory record'));
  const select = label.querySelector('select');
  select.value = 'FV-01';
  select.dispatchEvent(new Event('change', { bubbles: true }));
 });
 await page.waitForFunction(() => document.querySelector('.market-editor fieldset')?.textContent.includes('FV-01'));
 await fillEditorField('Vendor name', 'Private browser-test vendor');
 await fillEditorField('Contact details', 'Private browser-test contact');
 assert.equal(await page.$eval('.market-editor fieldset input[type="checkbox"]', element => element.checked), false, 'private vendor information is not automatically authorized for publication');
 const unitSelector = '.market-stall[aria-pressed="true"]';
 await page.$eval(unitSelector, element => element.scrollIntoView({ block: 'center' }));
 const before = await page.$eval(unitSelector, element => Number(element.querySelector('rect').getAttribute('x')));
 const unitBox = await (await page.$(unitSelector)).boundingBox();
 await page.mouse.move(unitBox.x + unitBox.width / 2, unitBox.y + unitBox.height / 2);
 await page.mouse.down();
 await page.mouse.move(unitBox.x + unitBox.width / 2 + 8, unitBox.y + unitBox.height / 2, { steps: 4 });
 await page.mouse.up();
 const after = await page.$eval(unitSelector, element => Number(element.querySelector('rect').getAttribute('x')));
 assert.ok(after > before, 'dragging changes only the draft geometry');
 await page.evaluate(() => {
  const details = [...document.querySelectorAll('.market-editor details')].find(element => element.querySelector('summary').textContent === 'Entrances and walkable graph');
  details.open = true;
 });
 assert.equal(await page.$eval('.market-editor textarea[rows="5"]', element => element.value.split('\n').length), 4, 'aisle connections remain individually editable');
 await clickText('Save draft');
 await page.waitForFunction(() => document.querySelector('.market-feedback')?.textContent.includes('saved'));
 const saved = await page.evaluate(async () => (await (await fetch('/api/market/draft')).json()).layout);
 assert.equal(saved.records.find(record => record.id === 'FV-01').vendorName, 'Private browser-test vendor');
 assert.equal(saved.records.find(record => record.id === 'FV-01').contact, 'Private browser-test contact');
 assert.equal((await publicLayout()).records.length, 0, 'saving a draft does not publish assignments or private fields');
 await clickText('Publish');
 await page.waitForFunction(() => document.querySelector('.market-feedback')?.textContent.includes('published successfully'));
 const published = await publicLayout();
 assert.equal(published.stalls.find(unit => unit.id === 'ref-v1').recordId, 'FV-01');
 assert.equal(published.records.find(record => record.id === 'FV-01').vendorName, '');
 assert.equal(published.records.find(record => record.id === 'FV-01').contact, '');
 assert.equal(published.verified, false, 'publication does not verify entrances');

 assert.ok(await page.$$eval('.market-version-history p', elements => elements.length >= 2), 'saved and published versions appear in history');
 await clickText('Back to floor plan');
 await page.waitForSelector('[aria-label="Search market floor plan"]');
 await use2D();
 await page.type('[aria-label="Search market floor plan"]', 'FV-01');
 await page.keyboard.press('Enter');
 await page.waitForSelector('.market-stall[aria-pressed="true"][aria-label^="FV-01,"]');
 const publicDetails = await page.$eval('.market-place', element => element.textContent);
 assert.match(publicDetails, /Not publicly shared/);
 assert.doesNotMatch(publicDetails, /Private browser-test/);
 assert.doesNotMatch(publicDetails, /Location not yet assigned/);
 assert.equal(await page.$('.market-directions-box'), null);
 await page.setViewport({ width: 600, height: 900 });
 await checkOverflow(page);
 await screenshot('market-floor-plan-mobile.png');
 assert.equal((await publicLayout()).revision, published.revision, 'browsing does not mutate the published map');

 // Reload without the local map service: the last public projection remains usable.
 await page.setRequestInterception(true);
 page.on('request', request => request.url().includes('/api/market/') ? request.abort() : request.continue());
 await page.reload({ waitUntil: 'networkidle0' });
 await page.waitForFunction(() => document.querySelector('.market-map-footer')?.textContent.includes('Last saved floor plan'));
 assert.equal(await page.$('.market-error'), null, 'an unavailable service leaves the cached floor plan usable');
 await check3D(page);
 await use2D();
 await page.type('[aria-label="Search market floor plan"]', 'FV-01');
 await page.keyboard.press('Enter');
 await page.waitForSelector('.market-stall[aria-pressed="true"][aria-label^="FV-01,"]');
 assert.doesNotMatch(await page.$eval('.market-place', element => element.textContent), /Private browser-test/);

 // Fresh file:// content mirrors the desktop renderer without opening its database.
 const offline = await browser.newPage();
 offline.on('pageerror', error => errors.push(error.message));
 await observeRendering(offline);
 const externalRequests = [], mapRequests = [];
 await offline.setRequestInterception(true);
 offline.on('request', request => {
  if (request.url().includes('/api/market/')) mapRequests.push(request.url());
  if (/^https?:/i.test(request.url())) { externalRequests.push(request.url()); void request.abort(); }
  else void request.continue();
 });
 await offline.setViewport({ width: 1440, height: 1100 });
 await offline.goto(pathToFileURL(entry).href, { waitUntil: 'networkidle0' });
 await check3D(offline);
 await offline.$eval('.public-market-map', element => element.scrollIntoView());
 assert.match(await offline.$eval('.market-map-footer', element => element.textContent), /Built-in floor plan/);
 assert.equal(await offline.$('.public-market-map iframe'), null);
 assert.equal(await offline.$('.market-error'), null);
 assert.equal(await offline.$('.market-admin-toggle'), null, 'offline viewing does not offer unavailable administration');
 assert.equal(await offline.$$eval('.market-section-card', elements => elements.length), 0);
 assert.equal(await offline.$('.market-information'), null, 'default offline floor plan has no market guide sidebar');
 await clickText('Fruit & Vegetables', offline);
 assert.match(await offline.$eval('.market-place h4', element => element.textContent), /Fruit & Vegetables/);
 await check3D(offline);
 await offline.click('[aria-label="Zoom into 3D map"]');
 await offline.click('[aria-label="Reset 3D view"]');
 await clickText('Entire floor plan', offline);
 assert.equal(await offline.$('.market-information'), null, 'resetting the entire 3D floor plan closes selection details');
 await screenshot('market-floor-plan-offline-3d.png', offline);
 for (const width of [1024, 600]) {
  await offline.setViewport({ width, height: 900 });
  await check3D(offline);
  await checkOverflow(offline);
 }
 await screenshot('market-floor-plan-offline-3d-mobile.png', offline);
 await offline.setViewport({ width: 1440, height: 1100 });
 await use2D(offline);
 await clickText('Fruit & Vegetables', offline);
 await offline.waitForFunction(() => document.querySelector('.market-zoom-value')?.textContent.includes('180%'));
 await clickText('Entire floor plan', offline);
 await offline.waitForFunction(() => document.querySelector('.market-zoom-value')?.textContent.includes('100%'));
 assert.equal(await offline.$('.market-information'), null, 'returning to the entire offline floor plan hides selection details');
 await offline.click('[aria-label="Zoom in"]');
 await offline.waitForFunction(() => document.querySelector('.market-zoom-value')?.textContent.includes('125%'));
 await offline.click('[aria-label="Reset map view"]');
 await offline.waitForFunction(() => document.querySelector('.market-zoom-value')?.textContent.includes('100%'));
 await offline.type('[aria-label="Search market floor plan"]', 'Sketch V1');
 await offline.keyboard.press('Enter');
 assert.match(await offline.$eval('.market-place h4', element => element.textContent), /Sketch V1/);
 await clearSearch(offline);
 await offline.type('[aria-label="Search market floor plan"]', 'no-such-market-space');
 await offline.waitForSelector('.market-empty-state');
 await clickText('Clear filters', offline);
 await clickText('Entire floor plan', offline);
 await checkOverflow(offline);
 await screenshot('market-floor-plan-offline.png', offline);
 for (const width of [1024, 600]) {
  await offline.setViewport({ width, height: 900 });
  await checkOverflow(offline);
 }
 await screenshot('market-floor-plan-offline-mobile.png', offline);
 assert.deepEqual(mapRequests, [], 'desktop floor plan never requests an HTTP or file map API');
 assert.deepEqual(externalRequests, [], 'desktop floor plan requests no internet resources');

 // Unsupported graphics must leave the offline floor plan fully usable.
 const fallback = await browser.newPage();
 fallback.on('pageerror', error => errors.push(error.message));
 await fallback.evaluateOnNewDocument(() => {
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
   if (/webgl/i.test(kind)) return null;
   return getContext.call(this, kind, ...args);
  };
 });
 await fallback.setViewport({ width: 600, height: 900 });
 await fallback.goto(pathToFileURL(entry).href, { waitUntil: 'networkidle0' });
 await fallback.waitForSelector('.market-stall');
 assert.equal(await fallback.$eval('[aria-label="2D view"]', element => element.getAttribute('aria-pressed')), 'true', 'unsupported WebGL automatically opens the 2D floor plan');
 assert.equal(await fallback.$('.market-three-host canvas'), null);
 assert.match(await fallback.$eval('.market-view-notice', element => element.textContent), /2D/);
 await clickText('Fruit & Vegetables', fallback);
 assert.match(await fallback.$eval('.market-place h4', element => element.textContent), /Fruit & Vegetables/);
 await checkOverflow(fallback);
 await screenshot('market-floor-plan-2d-fallback.png', fallback);
 assert.deepEqual(errors, [], 'public and offline rendering have no JavaScript errors');
 console.log('PASS: default 3D draws, 2D switching, keyboard sections, search, empty states, isolated 2D administration, draft privacy, publication/version history, public cache fallback, file:// offline 3D rendering without internet requests, zoom/reset, narrow layouts, and automatic WebGL fallback.');
} finally {
 await browser?.close();
 server.closeAllConnections();
 await new Promise(resolve => server.close(resolve));
 api.close();
}
