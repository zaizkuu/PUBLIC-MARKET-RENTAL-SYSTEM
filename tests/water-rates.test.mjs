import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultWaterRates, normalizeWaterRates, waterCharge, waterRate } from '../src/market/waterRates.ts';

const rates = defaultWaterRates();
const due = (cum, r = rates) => waterCharge(cum, r).amount;

test('the default rates are the ones on the office\'s meter reading sheet', () => {
  assert.deepEqual(rates, [
    { id: 'minimum', rate: 498.96 },
    { id: '11-20', rate: 54.93 },
    { id: '21-30', rate: 63.84 },
    { id: '31-up', rate: 73.43 },
  ]);
});

test('rows from the October 2026 sheet come out as the sheet has them', () => {
  assert.equal(due(2), 498.96);   // Aquitaña, Karen
  assert.equal(due(7), 498.96);   // Modesto, Kathrine
  assert.equal(due(14), 718.68);  // Palita, Imee: 498.96 + 4 × 54.93 (219.72)
  assert.equal(due(1), 498.96);   // Lumbre, Mario
  assert.equal(due(0), 0);        // "Same Reading"
});

test('every tier boundary', () => {
  assert.equal(due(10), 498.96);
  assert.equal(due(11), 553.89);                 // 498.96 + 54.93
  assert.equal(due(20), 1048.26);                // 498.96 + 10 × 54.93
  assert.equal(due(21), 1112.10);                // 1048.26 + 63.84
  assert.equal(due(30), 1686.66);                // 1048.26 + 10 × 63.84
  assert.equal(due(31), 1760.09);                // 1686.66 + 73.43
  assert.equal(due(45), 2788.11);                // 1686.66 + 15 × 73.43 (1101.45)
});

test('the breakdown lists each tier reached with its cu.m and subtotal', () => {
  const { lines } = waterCharge(25, rates);
  assert.deepEqual(lines.map((l) => [l.id, l.units, l.subtotal]), [
    ['minimum', 10, 498.96],
    ['11-20', 10, 549.3],
    ['21-30', 5, 319.2],
  ]);
  assert.deepEqual(waterCharge(7, rates).lines.map((l) => [l.id, l.units, l.subtotal]), [['minimum', 7, 498.96]]);
  assert.deepEqual(waterCharge(0, rates).lines, []);
});

test('fractional readings charge the fraction in its tier, rounded to the centavo', () => {
  assert.equal(due(12.5), 636.29);              // 498.96 + 2.5 × 54.93 = 636.285
  assert.equal(waterCharge(12.3, rates).lines[1].units, 2.3);
});

test('edited rates are used, and a negative or missing consumption pays nothing', () => {
  const edited = normalizeWaterRates([{ id: 'minimum', rate: 520 }, { id: '11-20', rate: 60 }]);
  assert.equal(waterRate(edited, 'minimum'), 520);
  assert.equal(waterRate(edited, '21-30'), 63.84);
  assert.equal(due(14, edited), 760);
  assert.equal(due(-3), 0);
  assert.equal(due(NaN), 0);
});

test('stored rates are read back as all four tiers in order; junk falls back to the sheet', () => {
  assert.deepEqual(normalizeWaterRates(undefined), rates);
  assert.deepEqual(normalizeWaterRates([{ id: '31-up', rate: '80' }, { id: 'minimum', rate: -1 }, { id: 'other', rate: 5 }, null]), [
    { id: 'minimum', rate: 498.96 },
    { id: '11-20', rate: 54.93 },
    { id: '21-30', rate: 63.84 },
    { id: '31-up', rate: 80 },
  ]);
});
