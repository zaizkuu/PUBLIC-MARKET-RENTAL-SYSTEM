import test from 'node:test';
import assert from 'node:assert/strict';
import { CALIBRATION_ROWS, ROW_OWNERS, rowKey, electricMetersByStall } from '../src/market/meters.ts';
import { buildDirectory } from '../src/market/directory.ts';

const tenancies = buildDirectory().tenancies.map((t) => [t.stallId, t.name]);
const vendors = new Set(tenancies.map(([, name]) => name));
const meters = electricMetersByStall(tenancies);
const serialOn = (stall) => meters.get(stall)?.[3];

test('every row is transcribed once, and every match names a row and a directory vendor', () => {
  const keys = CALIBRATION_ROWS.map(rowKey);
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(CALIBRATION_ROWS.length, 203);
  for (const [key, vendor] of Object.entries(ROW_OWNERS)) {
    assert.ok(keys.includes(key), `${key} is a row on a sheet`);
    assert.ok(vendors.has(vendor), `${vendor} is in the directory`);
  }
  for (const row of CALIBRATION_ROWS) assert.match(row[3], /^[A-Z0-9-]+$/, `${rowKey(row)} serial`);
});

test('the latest calibration is the meter on record, given to the vendor\'s stalls in order', () => {
  assert.equal(serialOn('KS-81'), 'WJF095902025');      // one stall, one row
  assert.equal(serialOn('FS-121'), '586946');            // 8/27 and 9/4 replaced on 9/11
  assert.equal(serialOn('FS-139'), '586944');            // 9/4 replaced on 9/11
  assert.equal(serialOn('MS-15'), '582655');             // 9/17 replaced on 9/24
  assert.equal(serialOn('FD-9'), '23040184267');         // two meters the same day…
  assert.equal(serialOn('FD-10'), '23040184264');        // …go to the first two stalls
  assert.equal(serialOn('FD-68'), undefined);            // the rest wait for the office
  assert.equal(serialOn('KS-4'), 'WJF95902029');         // "Jade Modesto", not "Modesto Jade"
  assert.equal(serialOn('VS-160'), undefined);
  assert.equal(serialOn('FS-119'), '26012B631591');      // directory note: Jefer John
  assert.equal(meters.size, 107);
});
