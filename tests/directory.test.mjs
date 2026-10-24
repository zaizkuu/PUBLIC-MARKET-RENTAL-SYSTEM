import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DIRECTORY_ROWS, SECTION_LIST, VACANT, NO_NAME, buildDirectory,
  parseStallId, renumberForSection, nextStallNumber, rateForStallId, stallIdFor,
} from '../src/market/directory.ts';

/* The summary table on page 1 of the Market Stall Directory. */
const PDF_SUMMARY = {
  'Kakanin': { stalls: 12, vacant: 2 },
  'Dried Fish/Eggs': { stalls: 24, vacant: 10 },
  'Fruits/Duma': { stalls: 12, vacant: 0 },
  'Vegetable': { stalls: 53, vacant: 5 },
  'Fish': { stalls: 45, vacant: 8 },
  'Meat - Chicken': { stalls: 22, vacant: 4 },
  'Meat - Carabeef/Beef & Pork': { stalls: 26, vacant: 2 },
};

test('the transcription matches the directory summary, section by section', () => {
  assert.equal(DIRECTORY_ROWS.length, 194, 'Total stalls listed: 194');
  for (const section of SECTION_LIST) {
    const rows = DIRECTORY_ROWS.filter(([, , code]) => code === section.code);
    assert.equal(rows.length, PDF_SUMMARY[section.name].stalls, `${section.name} stalls`);
    assert.equal(rows.filter(([, vendor]) => vendor === VACANT).length, PDF_SUMMARY[section.name].vacant, `${section.name} vacancies`);
  }
  assert.deepEqual(SECTION_LIST.map((s) => s.name), Object.keys(PDF_SUMMARY));
});

test('every stall number appears once and every section code is distinct', () => {
  const numbers = DIRECTORY_ROWS.map(([n]) => n);
  assert.equal(new Set(numbers).size, numbers.length);
  assert.equal(new Set(SECTION_LIST.map((s) => s.code)).size, SECTION_LIST.length);
});

test('stall IDs carry the section code and the number on the layout', () => {
  const { stalls, tenancies } = buildDirectory();
  assert.equal(stalls[0].id, 'KS-001');
  assert.equal(stalls[0].section, 'Kakanin');
  assert.equal(stalls.find((s) => s.id === 'DS-005')?.tenant, 'Operio Jenefer');
  assert.equal(stalls.find((s) => s.id === 'MS-015')?.section, 'Meat - Carabeef/Beef & Pork');
  assert.equal(stalls.find((s) => s.id === 'CS-028')?.section, 'Meat - Chicken');
  assert.equal(stalls.find((s) => s.id === 'FD-007')?.section, 'Fruits/Duma');
  assert.equal(stalls.find((s) => s.id === 'VS-011')?.section, 'Vegetable');
  assert.equal(stalls.find((s) => s.id === 'FS-105')?.section, 'Fish');
  for (const stall of stalls) {
    const code = SECTION_LIST.find((s) => s.name === stall.section).code;
    assert.ok(stall.id.startsWith(`${code}-`), `${stall.id} is in ${stall.section}`);
  }
  // Vacant and unnamed stalls are open; the guard post is held but rents to nobody.
  assert.equal(stalls.find((s) => s.id === 'KS-074')?.status, 'Available');
  assert.equal(stalls.find((s) => s.id === 'DS-207')?.status, 'Available');
  assert.equal(stalls.find((s) => s.id === 'VS-095')?.status, 'Occupied');
  assert.ok(!tenancies.some((t) => t.stallId === 'VS-095'));
  const open = DIRECTORY_ROWS.filter(([, v]) => v === VACANT || v === NO_NAME).length;
  assert.equal(tenancies.length, 194 - open - 1);
  // Section 43 rates: chicken is charged as meat.
  assert.equal(tenancies.find((t) => t.stallId === 'CS-029')?.rent, 1500);
  assert.equal(tenancies.find((t) => t.stallId === 'KS-001')?.rent, 1000);
});

test('typed stall IDs are read against the chosen section', () => {
  assert.deepEqual(parseStallId('74', 'Kakanin'), { id: 'KS-074' });
  assert.deepEqual(parseStallId('ks-74', 'Kakanin'), { id: 'KS-074' });
  assert.deepEqual(parseStallId(' KS 213 ', 'Kakanin'), { id: 'KS-213' });
  assert.match(parseStallId('FS-12', 'Kakanin').error, /start with KS-/);
  assert.match(parseStallId('stall twelve', 'Kakanin').error, /stall number/);
  assert.equal(renumberForSection('KS-074', 'Fish'), 'FS-074');
  assert.equal(nextStallNumber(['KS-001', 'DS-212', 'STL-007']), 213);
  assert.equal(stallIdFor('vs', 5), 'VS-005');
  assert.equal(rateForStallId('MS-050'), 1500);
  assert.equal(rateForStallId('KK-01'), 1000, 'legacy prefixes still quote');
});
