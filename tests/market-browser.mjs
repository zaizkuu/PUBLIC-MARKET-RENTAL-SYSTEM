import { createServer, request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { createMapAPI } from '../server/map-api.mjs';
import puppeteer from 'puppeteer';

// Every map write in this test goes to an isolated database, never office data.
const api = createMapAPI(':memory:');
const server = createServer((req, res) => api.middleware(req, res, () => {
 const upstream = request('http://127.0.0.1:5173' + req.url, {
  method: req.method, headers: { ...req.headers, host: '127.0.0.1:5173' },
 }, response => { res.writeHead(response.statusCode, response.headers); response.pipe(res); });
 req.pipe(upstream);
 upstream.on('error', error => { res.writeHead(502); res.end(error.message); });
}));
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
 browser = await puppeteer.launch({ headless: true, executablePath: process.env.MARKET_TEST_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
 const page = await browser.newPage();
 const errors = [];
 page.on('pageerror', error => errors.push(error.message));
 const clickText = async text => {
  const clicked = await page.evaluate(value => {
   const button = [...document.querySelectorAll('.public-market-map button')].find(element => element.textContent.trim() === value || element.lastChild?.textContent.trim() === value);
   if (!button) return false;
   button.click();
   return true;
  }, text);
  assert.ok(clicked, 'Button ' + text + ' exists');
 };
 const publicLayout = () => page.evaluate(async () => (await (await fetch('/api/market/public')).json()).layout);
 const screenshot = async name => (await page.$('.public-market-map')).screenshot({ path: join(tmpdir(), name) });
 const fillEditorField = async (label, value) => {
  const handle = await page.evaluateHandle(text => [...document.querySelectorAll('.market-editor fieldset label')].find(element => element.firstChild?.textContent.trim() === text)?.querySelector('input'), label);
  const input = handle.asElement();
  assert.ok(input, 'Editor field ' + label + ' exists');
  await input.click();
  await page.keyboard.down('Control'); await page.keyboard.press('A'); await page.keyboard.up('Control');
  await input.type(value);
  await handle.dispose();
 };

 await page.setViewport({ width: 1440, height: 1100 });
 await page.goto('http://127.0.0.1:' + server.address().port, { waitUntil: 'networkidle0' });
 await page.waitForSelector('.market-stall');
 await page.$eval('.public-market-map', element => element.scrollIntoView());
 const beforeEditing = await publicLayout();
 assert.equal(beforeEditing.revision, 0);
 assert.equal(beforeEditing.records.length, 0);
 assert.ok(beforeEditing.stalls.every(unit => !unit.recordId), 'opening the map does not assign rental records');

 await clickText('Saved stall map');
 await page.waitForSelector('.market-stall');
 assert.equal(await page.$$eval('.market-section', elements => elements.length), 3);
 await page.click('.market-stall');
 assert.match(await page.$eval('.market-place', element => element.textContent), /no verified stall ID/);
 assert.equal(await page.$eval('.market-directions-box .market-primary', element => element.disabled), true);
 await page.type('[aria-label="Search market floor plan"]', 'FV-01');
 await page.keyboard.press('Enter');
 assert.match(await page.$eval('.market-place', element => element.textContent), /FV-01/);
 assert.match(await page.$eval('.market-place', element => element.textContent), /Location not yet assigned/);
 if (await page.$('[aria-label="Clear search"]')) await page.click('[aria-label="Clear search"]');
 await screenshot('market-saved-plan.png');

 await page.click('.market-admin-toggle');
 await page.waitForSelector('.market-login');
 await page.type('.market-login input[autocomplete="username"]', 'browser-admin');
 await page.type('.market-login input[type="password"]', 'browser-test-password');
 await page.click('.market-login button.market-primary');
 await page.waitForSelector('.market-editor');
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

 await clickText('Public view');
 await page.waitForSelector('[aria-label="Search market floor plan"]');
 await page.type('[aria-label="Search market floor plan"]', 'FV-01');
 await page.keyboard.press('Enter');
 await page.waitForSelector('.market-stall[aria-pressed="true"][aria-label^="FV-01,"]');
 const publicDetails = await page.$eval('.market-place', element => element.textContent);
 assert.match(publicDetails, /Not publicly shared/);
 assert.doesNotMatch(publicDetails, /Private browser-test/);
 assert.doesNotMatch(publicDetails, /Location not yet assigned/);
 assert.equal(await page.$eval('.market-directions-box .market-primary', element => element.disabled), true);
 await page.setViewport({ width: 600, height: 900 });
 assert.equal(await page.$eval('.public-market-map', element => element.scrollWidth <= element.clientWidth), true, 'saved map fits narrow screens');
 await screenshot('market-saved-mobile.png');
 assert.equal((await publicLayout()).revision, published.revision, 'switching views does not mutate the saved map');
 assert.deepEqual(errors, []);
 console.log('PASS: saved-map search, isolated administration, draft privacy, publication, mapped stall selection, unverified routing, and narrow layouts.');
} finally {
 await browser?.close();
 server.closeAllConnections();
 await new Promise(resolve => server.close(resolve));
 api.close();
}
