import test from 'node:test';
import assert from 'node:assert/strict';
import { OFFICE_ORDER_STAFF, SUPERVISOR, missingStaff, nameKey, placeStaff } from '../src/market/officeOrders.ts';

/* The board as the office's own roster seeded it, before the office orders. */
const ROSTER = [
  ['Engr. Luz M. Maderazo', 'Market Supervisor III'],
  ['Manuel G. Mercado', 'In Charge — Market Operation'],
  ['Felmar Pica', 'In Charge — Market Operation'],
  ['Louwhie Jane Bengero', 'Clerk I'],
  ['Lorna Tangpuz', 'Market Collector'],
  ['Ericson Aguipo', 'Market Collector'],
  ['Stephen Lopez', 'Market Collector'],
  ['Virginia Montilla', 'Sweeper'],
  ['Bonifacio Lopez', 'Sweeper'],
].map(([name, position]) => ({ name, position }));

test('the seven people the office orders assign to the market office, as printed', () => {
  assert.deepEqual(OFFICE_ORDER_STAFF.map((s) => [s.name, s.position, s.order, s.appointed]), [
    ['Dominico G. Tobilla', 'Market Operations Manager', 'Office Order No. 226, s. 2026', '2026-10-05'],
    ['Andres A. Redoña', 'Clerk II', 'Office Order No. 226, s. 2026', '2026-10-06'],
    ['Ariel N. Almarines', 'Contract of Service', 'Office Order No. 227, s. 2026', '2026-10-06'],
    ['Margarito E. Gempis Jr.', 'Contract of Service', 'Office Order No. 228, s. 2026', '2026-10-06'],
    ['Julius V. Fabre', 'Contract of Service', 'Office Order No. 229, s. 2026', '2026-10-06'],
    ['Jojit C. Bajas', 'Contract of Service', 'Office Order No. 231, s. 2026', '2026-10-06'],
    ['Rexly C. Cumpio', 'Contract of Service', 'Office Order No. 232, s. 2026', '2026-10-06'],
  ]);
  assert.equal(SUPERVISOR.name, 'Engr. Luz M. Maderazo');
});

test('someone already on the board is not added twice, however the name is typed', () => {
  assert.equal(missingStaff(ROSTER.map((o) => o.name)).length, 7);
  const missing = missingStaff([...ROSTER.map((o) => o.name), 'ANDRES A. REDONA', 'Julius V.  Fabre']);
  assert.deepEqual(missing.map((s) => s.name), ['Dominico G. Tobilla', 'Ariel N. Almarines', 'Margarito E. Gempis Jr.', 'Jojit C. Bajas', 'Rexly C. Cumpio']);
  assert.equal(nameKey('Andres A. Redoña'), nameKey('andres a redona'));
  assert.equal(missingStaff(OFFICE_ORDER_STAFF.map((s) => s.name)).length, 0);
});

test('each new seat joins the posts like it, and the seats already there keep their order', () => {
  const additions = OFFICE_ORDER_STAFF.map((s) => ({ after: s.after, seat: { name: s.name, position: s.position } }));
  const board = placeStaff(ROSTER, additions);
  assert.deepEqual(board.map((o) => o.name), [
    'Engr. Luz M. Maderazo', 'Dominico G. Tobilla',
    'Manuel G. Mercado', 'Felmar Pica',
    'Louwhie Jane Bengero', 'Andres A. Redoña',
    'Lorna Tangpuz', 'Ericson Aguipo', 'Stephen Lopez',
    'Ariel N. Almarines', 'Margarito E. Gempis Jr.', 'Julius V. Fabre', 'Jojit C. Bajas', 'Rexly C. Cumpio',
    'Virginia Montilla', 'Bonifacio Lopez',
  ]);
  // A board with none of those posts takes them at the end, in order.
  assert.deepEqual(placeStaff([{ name: 'A', position: 'Guard' }], additions.slice(2, 4)).map((o) => o.name), ['A', 'Ariel N. Almarines', 'Margarito E. Gempis Jr.']);
});
