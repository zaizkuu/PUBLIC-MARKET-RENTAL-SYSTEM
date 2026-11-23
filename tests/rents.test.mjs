import test from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultSectionRents, normalizeSectionRents, sectionRate, sectionRateForStallId, stallRent,
  ownRentFor, applySectionRate, adoptTenantRents,
} from '../src/market/rents.ts';

test('every directory section starts on its Section 43 rate, and saved rates win', () => {
  const rates = normalizeSectionRents([{ id: 'Fish', rent: 1200 }, { id: 'Annex', rent: 800 }]);
  assert.equal(sectionRate(rates, 'Fish'), 1200);
  assert.equal(sectionRate(rates, 'Kakanin'), 1000);
  assert.equal(sectionRate(rates, 'Meat - Chicken'), 1500);
  assert.equal(sectionRate(rates, 'Annex'), 800);
  assert.equal(sectionRateForStallId(rates, 'FS-12'), 1200);
  assert.equal(normalizeSectionRents(undefined).length, defaultSectionRents().length);
});

test('an individual rate wins over the section rate', () => {
  const rates = defaultSectionRents();
  assert.equal(stallRent(rates, { id: 'FS-1', section: 'Fish', ownRent: 0 }), 1000);
  assert.equal(stallRent(rates, { id: 'FS-2', section: 'Fish', ownRent: 1800 }), 1800);
  // Setting a stall to exactly its section rate puts it back on the section rate.
  assert.equal(ownRentFor(rates, 'Fish', 1000), 0);
  assert.equal(ownRentFor(rates, 'Fish', 1250), 1250);
});

test('a section change reaches stalls following it and passes over individual rates', () => {
  const rates = defaultSectionRents();
  const stalls = [
    { id: 'FS-1', section: 'Fish', ownRent: 0 },
    { id: 'FS-2', section: 'Fish', ownRent: 1800 },
    { id: 'FS-3', section: 'Fish', ownRent: 0 },
    { id: 'KS-4', section: 'Kakanin', ownRent: 0 },
  ];
  const tenants = [
    { id: 'T1', stallId: 'FS-1', rent: 1000 },
    { id: 'T2', stallId: 'FS-2', rent: 1800 },
    { id: 'T4', stallId: 'KS-4', rent: 1000 },
  ];
  const result = applySectionRate(rates, stalls, tenants, 'Fish', 1100);
  assert.equal(sectionRate(result.rates, 'Fish'), 1100);
  assert.deepEqual(result.tenants.map((t) => t.rent), [1100, 1800, 1000]);
  assert.deepEqual(result.changed, ['FS-1']);
  assert.deepEqual(result.kept, ['FS-2']);
  // The input is left alone.
  assert.equal(tenants[0].rent, 1000);
});

test('rent set by hand before per-stall rates existed becomes the stall\'s own rate', () => {
  const rates = defaultSectionRents();
  const stalls = adoptTenantRents(rates, [
    { id: 'FS-1', section: 'Fish' },
    { id: 'FS-2', section: 'Fish' },
    { id: 'FS-3', section: 'Fish' },
    { id: 'FS-4', section: 'Fish', ownRent: 0 },
  ], [
    { stallId: 'FS-1', rent: 1000 },
    { stallId: 'FS-2', rent: 1600 },
    { stallId: 'FS-4', rent: 1600 },
  ]);
  assert.deepEqual(stalls.map((s) => s.ownRent), [0, 1600, 0, 0]);
});
