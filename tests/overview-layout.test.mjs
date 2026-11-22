import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOverview } from '../src/market/overviewLayout.ts';
import { buildDirectory } from '../src/market/directory.ts';
import { PHOTO_POSITIONS } from '../src/market/photoLayout.ts';

/* The ground floor's stalls where the layout sheets put them, as the map passes them in. */
const directory = buildDirectory().stalls;
const stalls = PHOTO_POSITIONS.map((p) => ({ ...p, id: directory.find((s) => Number(s.id.split('-')[1]) === p.number).id }));
const plan = buildOverview(stalls);
const slots = [...plan.slots.entries()].map(([id, s]) => ({ id, code: id.split('-')[0], number: Number(id.split('-')[1]), ...s }));
const overlaps = (a, b) => a.x < b.x + b.w - 0.001 && a.x + a.w > b.x + 0.001 && a.z < b.z + b.d - 0.001 && a.z + a.d > b.z + 0.001;

test('every ground-floor stall in the directory has one place in the overview', () => {
  assert.deepEqual([...plan.slots.keys()].sort(), stalls.map((s) => s.id).sort());
});

test('stalls never overlap each other, the hallway or the entrance, and stay on the floor', () => {
  for (let i = 0; i < slots.length; i++) for (let j = i + 1; j < slots.length; j++) {
    assert.ok(!overlaps(slots[i], slots[j]), `Overlap: ${slots[i].id} and ${slots[j].id}`);
  }
  for (const s of slots) {
    assert.ok(!overlaps(s, plan.hallway), `${s.id} stands in the hallway`);
    assert.ok(!overlaps(s, plan.entrance), `${s.id} stands in the entrance`);
    assert.ok(s.x >= plan.floor.minX && s.x + s.w <= plan.floor.maxX && s.z >= plan.floor.minZ && s.z + s.d <= plan.floor.maxZ, `${s.id} is off the floor`);
  }
});

test('from the entrance: Kakanin, then Vegetables, then Fish, Meat and Chicken, on both sides of the hallway', () => {
  const order = [['KS'], ['VS', 'FD', 'DS'], ['FS'], ['MS'], ['CS']];
  for (const side of ['left', 'right']) {
    const groups = order.map((codes) => slots.filter((s) => s.side === side && codes.includes(s.code)));
    groups.forEach((g, i) => assert.ok(g.length > 0, `${order[i].join('/')} has no stalls on the ${side}`));
    for (let i = 1; i < groups.length; i++) {
      const nearer = Math.min(...groups[i - 1].map((s) => s.z)), further = Math.max(...groups[i].map((s) => s.z + s.d));
      assert.ok(further <= nearer, `${order[i].join('/')} reaches nearer the entrance than ${order[i - 1].join('/')} on the ${side}`);
    }
  }
  for (const s of slots) {
    const besideHallway = s.side === 'left' ? s.x + s.w <= plan.hallway.x : s.x >= plan.hallway.x + plan.hallway.w;
    assert.ok(besideHallway, `${s.id} is on the wrong side of the hallway`);
  }
  assert.deepEqual(plan.boards.toSorted((a, b) => b.z - a.z).map((b) => b.text), ['KAKANIN', 'VEGETABLES', 'FISH', 'MEAT', 'CHICKEN']);
});

test('each section is split evenly between the sides of the hallway', () => {
  for (const code of new Set(slots.map((s) => s.code))) {
    const left = slots.filter((s) => s.code === code && s.side === 'left').length, right = slots.filter((s) => s.code === code && s.side === 'right').length;
    assert.ok(Math.abs(left - right) <= 3, `${code} is split ${left}/${right}`);
  }
});

test('stalls keep the order and neighbours of the layout sheets', () => {
  const at = (id) => plan.slots.get(id);
  const sideOf = (ids) => [...new Set(ids.map((id) => at(id).side))];
  const range = (code, from, to) => Array.from({ length: to - from + 1 }, (_, i) => `${code}-${from + i}`);
  /* Facing rows on the meat and fish sheets face each other across the hallway. */
  assert.deepEqual(sideOf(range('MS', 15, 27)), ['right']); assert.deepEqual(sideOf(range('MS', 50, 62)), ['left']);
  assert.deepEqual(sideOf(range('CS', 28, 38)), ['right']); assert.deepEqual(sideOf(range('CS', 39, 49)), ['left']);
  assert.deepEqual(sideOf(range('FS', 105, 125)), ['right']); assert.deepEqual(sideOf(range('FS', 126, 149)), ['left']);
  /* Neighbours on a sheet row stand side by side in the same row. */
  for (const [a, b] of [['KS-1', 'KS-2'], ['KS-2', 'KS-3'], ['MS-15', 'MS-16'], ['CS-28', 'CS-29'], ['FS-117', 'FS-118'], ['FS-108', 'FS-109'], ['VS-11', 'VS-12'], ['DS-5', 'DS-6'], ['FD-7', 'FD-8']]) {
    assert.equal(at(a).z, at(b).z, `${a} and ${b} are not in one row`);
    assert.ok(Math.abs(Math.abs(at(a).x - at(b).x) - 1.9) < 0.001, `${a} and ${b} are not side by side`);
  }
  /* Read from the Kakanin end: KS-1 is the first stall in from the entrance, beside the hallway. */
  const kakanin = slots.filter((s) => s.code === 'KS' && s.side === 'right');
  assert.equal(at('KS-1').z, Math.max(...kakanin.map((s) => s.z)));
  assert.ok(Math.abs(at('KS-1').x - (plan.hallway.x + plan.hallway.w)) < 1.5, 'KS-1 is beside the hallway');
  /* In Vegetables, dried fish/eggs come first from the entrance, then fruits/duma, then vegetables. */
  for (const side of ['left', 'right']) {
    const near = (code) => Math.min(...slots.filter((s) => s.code === code && s.side === side).map((s) => s.z));
    const far = (code) => Math.max(...slots.filter((s) => s.code === code && s.side === side).map((s) => s.z));
    assert.ok(far('FD') < near('DS') && far('VS') < near('FD'), `Vegetables are out of the sheet's order on the ${side}`);
  }
});

test('the entrance opens the front of the hall onto the hallway, wider than it, as sketched', () => {
  const { entrance: e, hallway: h, floor } = plan;
  assert.equal(e.z + e.d, floor.maxZ, 'the entrance reaches the front');
  assert.equal(h.z + h.d, e.z, 'the hallway starts where the entrance ends');
  assert.ok(Math.abs((e.x + e.w / 2) - (h.x + h.w / 2)) < 0.001 && Math.abs((floor.minX + floor.maxX) / 2 - (h.x + h.w / 2)) < 0.001, 'hallway and entrance are centred');
  assert.ok(e.w > 2 * h.w, 'the entrance is wider than the hallway');
  const length = floor.maxZ - floor.minZ, width = floor.maxX - floor.minX;
  assert.ok(length > 1.4 * width, 'the hall is long and narrow, entered from one end');
  assert.ok(e.d > 0.2 * length, 'the entrance is a large open area');
});

test('rows stand back to back in pairs, counters opening onto the aisles', () => {
  const rows = new Map();
  for (const s of slots) rows.set(`${s.side}:${s.z.toFixed(3)}`, s);
  /* A row that opens away from the entrance always has a row behind it that
     opens toward it; only a block's odd last row stands alone. */
  for (const s of slots.filter((s) => s.face === -1)) {
    const partner = rows.get(`${s.side}:${(s.z + s.d).toFixed(3)}`);
    assert.ok(partner && partner.face === 1, `${s.id} has no row back to back with it`);
  }
  assert.ok(slots.filter((s) => s.face === -1).length > slots.length / 3, 'most rows are paired');
});
