import test from 'node:test';
import assert from 'node:assert/strict';
import { PHOTO_METERS, GREEN_PRINTED_METERS, fillHandwrittenMeters } from '../src/market/handwrittenMeters.ts';
import { buildDirectory } from '../src/market/directory.ts';

const tenants = buildDirectory().tenancies.map(t => ({ ...t, meters: { Electricity: '', Water: 'water-kept' } }));
test('all 41 photo stall assignments match their directory holders', () => {
  const filled = fillHandwrittenMeters(tenants);
  assert.equal(filled.filter(t => t.meters.Electricity).length, 41);
  for (const [stall, , serial] of PHOTO_METERS) {
    assert.equal(filled.find(t => t.stallId === stall).meters.Electricity, serial);
  }
  assert.ok(filled.every(t => t.meters.Water === 'water-kept'));
});
test('printed meters preserve letter suffixes, including the subsequently confirmed Cinco entry', () => {
  assert.equal(GREEN_PRINTED_METERS.length, 8);
  const filled = fillHandwrittenMeters(tenants);
  assert.equal(filled.find(t => t.stallId === 'FS-116').meters.Electricity, 'KW202392137224I');
  assert.equal(filled.find(t => t.stallId === 'MS-21').meters.Electricity, '202205304699I');
  assert.equal(filled.find(t => t.stallId === 'FD-71').meters.Electricity, '202205305666I');
});
test('existing serials, other tenants, and unconfirmed rows are preserved', () => {
  const original = tenants.find(t => t.stallId === 'FS-107');
  const existing = { ...original, meters: { ...original.meters, Electricity: 'OFFICE-ENTRY' } };
  const replacement = { ...original, name: 'New tenant' };
  assert.equal(fillHandwrittenMeters([existing])[0], existing);
  assert.equal(fillHandwrittenMeters([replacement])[0], replacement);
  for (const stall of ['DS-173']) {
    assert.equal(fillHandwrittenMeters(tenants).find(t => t.stallId === stall)?.meters.Electricity ?? '', '');
  }
});
test('new confirmed serials preserve punctuation and the other Saclay stall', () => {
  const filled = fillHandwrittenMeters(tenants);
  const serial = stall => filled.find(t => t.stallId === stall).meters.Electricity;
  assert.equal(serial('FD-70'), '42312.2');
  assert.equal(serial('FD-8'), '228775112');
  assert.equal(serial('VS-160'), 'WJF95902029');
  assert.equal(serial('CS-40'), '201800005435');
  assert.equal(serial('VS-185'), '2018000045793');
});
test('confirmed individual meters stay separate and Emoylan retains the other stall meter', () => {
  const filled = fillHandwrittenMeters(tenants);
  const serial = stall => filled.find(t => t.stallId === stall).meters.Electricity;
  assert.equal(serial('FS-118'), '2025929829481');
  assert.equal(serial('MS-56'), '250121231841');
  assert.equal(serial('FD-71'), '202205305666I');
  assert.equal(serial('MS-60'), '22007578');
  assert.equal(serial('MS-59'), '587782');
});
test('import is idempotent and accepts surname-first formatting', () => {
  const filled = fillHandwrittenMeters(tenants);
  assert.deepEqual(fillHandwrittenMeters(filled), filled);
  const holder = { ...tenants.find(t => t.stallId === 'FS-107'), name: 'ABANDO, JOEY' };
  assert.equal(fillHandwrittenMeters([holder])[0].meters.Electricity, '586854');
});
