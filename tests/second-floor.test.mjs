import test from 'node:test';
import assert from 'node:assert/strict';
import { SECOND_FLOOR_ROWS, SECOND_FLOOR_SECTION, buildSecondFloor, missingSecondFloor } from '../src/market/secondFloor.ts';
import { SECTION_LIST } from '../src/market/directory.ts';
import { registerName } from '../src/market/registerNames.ts';

test('the list runs PS-01 to PS-54 with no PS-51, each number once', () => {
  const numbers = SECOND_FLOOR_ROWS.map((r) => r.number);
  assert.equal(numbers.length, 53);
  assert.equal(new Set(numbers).size, 53);
  assert.deepEqual(numbers, Array.from({ length: 54 }, (_, i) => i + 1).filter((n) => n !== 51));
});

test('stalls take the register\'s IDs, section and statuses', () => {
  const { stalls, tenancies } = buildSecondFloor();
  assert.equal(stalls[0].id, 'PS-1');
  assert.ok(stalls.every((s) => s.section === SECOND_FLOOR_SECTION));
  assert.equal(SECTION_LIST.find((s) => s.name === SECOND_FLOOR_SECTION)?.code, 'PS');
  const count = (status) => stalls.filter((s) => s.status === status).length;
  assert.equal(count('Occupied'), 37);
  assert.equal(count('Temporarily Closed'), 6, 'named vendors in the "Temporarily vacated" block still hold their stalls');
  assert.equal(count('Abandoned'), 2);
  assert.equal(count('Available'), 8);
  assert.equal(tenancies.length, 43);
  assert.deepEqual(stalls.filter((s) => s.status === 'Temporarily Closed').map((s) => s.id), ['PS-47', 'PS-48', 'PS-50', 'PS-52', 'PS-53', 'PS-54']);
  assert.deepEqual(stalls.filter((s) => s.status === 'Abandoned').map((s) => s.id), ['PS-39', 'PS-40']);
});

test('rows read as printed on the sheet', () => {
  const { stalls, tenancies } = buildSecondFloor();
  const stall = (id) => stalls.find((s) => s.id === id);
  assert.equal(stall('PS-1').tenant, 'AQUITANIA, KAREN KAPUNAN');
  assert.match(stall('PS-1').note, /LCA expired/);
  assert.match(stall('PS-4').note, /Under close monitoring/);
  assert.match(stall('PS-8').note, /LCA 6\.2022/);
  assert.match(stall('PS-9').note, /No LCA/);
  assert.equal(stall('PS-35').status, 'Available');
  assert.match(stall('PS-35').note, /Heginio Redona/);
  assert.match(stall('PS-43').note, /^Vacated/);
  assert.match(stall('PS-50').note, /#35/);
  // A vendor on two stalls holds two tenancies.
  assert.equal(tenancies.filter((t) => t.name === 'ONDAP, NICANORA ANINO').length, 2);
  assert.equal(tenancies.filter((t) => t.name === 'SALCEDO, MYRASOL VELASCO').length, 2);
  // Every vendor marked WITH BP; open stalls have none recorded.
  for (const s of stalls) assert.equal(s.permit, tenancies.some((t) => t.stallId === s.id) ? 'With BP' : 'Not Recorded', s.id);
  // The sheet's LCA column, tallied over the vendors.
  const vendorRows = SECOND_FLOOR_ROWS.filter((r) => r.vendor);
  assert.equal(vendorRows.filter((r) => r.lca === 'EXPIRED').length, 17);
  assert.equal(vendorRows.filter((r) => r.lca === 'NONE').length, 24);
  assert.deepEqual(vendorRows.filter((r) => /\d/.test(r.lca)).map((r) => r.number), [8, 53]);
});

test('names are already in register form, so the register shows them unchanged', () => {
  for (const { vendor } of SECOND_FLOOR_ROWS.filter((r) => r.vendor)) {
    assert.match(vendor, /^[^,a-z]+, [^a-z]+$/, vendor);
    assert.equal(registerName(vendor), vendor);
  }
});

test('only what the records do not hold yet is added', () => {
  const all = missingSecondFloor(['KS-1', 'FS-105'], ['KS-1']);
  assert.equal(all.stalls.length, 53);
  assert.equal(all.tenancies.length, 43);
  const some = missingSecondFloor(['PS-1', 'ps-2'], ['PS-3']);
  assert.equal(some.stalls.length, 51);
  assert.ok(!some.tenancies.some((t) => ['PS-1', 'PS-2', 'PS-3'].includes(t.stallId)));
  assert.equal(some.tenancies.length, 40);
});
