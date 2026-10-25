/* ============================================================
   Staff assigned to the market office by office order
   ============================================================

   The Municipal Mayor's office orders of October 2026 that put people in the
   market office: one designation (No. 226, 5 October) and six reassignments
   "to Market Office ... under the supervision of ENGR. LUZ M. MADERAZO –
   Market Supervisor III" (6 October). Each order is transcribed as printed,
   including the second order numbered 226 — Andres A. Redoña's — although the
   run of numbers suggests it was meant to be 230.

   The designation names no supervisor; the Market Operations Manager is
   seated under the Market Supervisor like everyone else in the office, and
   the office can move the seat from the Officers page if that is not how it
   runs.

   An installation that already has a board gets these seats once, at
   start-up, recorded by ROSTER_EDITION beside the records: anyone already on
   the board by name is left as they are, and someone the office later
   removes is not put back.

   Plain TypeScript with no imports, so the Node test runner loads it as-is
   (see tests/office-orders.test.mjs).
   ============================================================ */

export type OfficeOrderSeat = {
  name: string;
  position: string;
  /* The order that put the person here, as printed on it. */
  order: string;
  /* The day the order took effect, YYYY-MM-DD. */
  appointed: string;
  /* Positions this seat is listed after on the board: it goes after the last
     seat holding any of them, or at the end if there is none. */
  after: string[];
};

export const ROSTER_EDITION = 'office-orders-2026-10';

/* Whoever the orders place the staff under. */
export const SUPERVISOR = { name: 'Engr. Luz M. Maderazo', position: 'Market Supervisor III' };

const COS_AFTER = ['Contract of Service', 'Market Collector'];

export const OFFICE_ORDER_STAFF: OfficeOrderSeat[] = [
  { name: 'Dominico G. Tobilla', position: 'Market Operations Manager', order: 'Office Order No. 226, s. 2026', appointed: '2026-10-05', after: [SUPERVISOR.position] },
  { name: 'Andres A. Redoña', position: 'Clerk II', order: 'Office Order No. 226, s. 2026', appointed: '2026-10-06', after: ['Clerk II', 'Clerk I'] },
  { name: 'Ariel N. Almarines', position: 'Contract of Service', order: 'Office Order No. 227, s. 2026', appointed: '2026-10-06', after: COS_AFTER },
  { name: 'Margarito E. Gempis Jr.', position: 'Contract of Service', order: 'Office Order No. 228, s. 2026', appointed: '2026-10-06', after: COS_AFTER },
  { name: 'Julius V. Fabre', position: 'Contract of Service', order: 'Office Order No. 229, s. 2026', appointed: '2026-10-06', after: COS_AFTER },
  { name: 'Jojit C. Bajas', position: 'Contract of Service', order: 'Office Order No. 231, s. 2026', appointed: '2026-10-06', after: COS_AFTER },
  { name: 'Rexly C. Cumpio', position: 'Contract of Service', order: 'Office Order No. 232, s. 2026', appointed: '2026-10-06', after: COS_AFTER },
];

/* A name reduced to what identifies it, so "Andres A. Redona" typed without
   the tilde, or in capitals as on the order, is still the same person. */
export function nameKey(name: string): string {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** The seats from the orders whose person is not on the board yet. */
export function missingStaff(namesOnBoard: string[]): OfficeOrderSeat[] {
  const present = new Set(namesOnBoard.map(nameKey));
  return OFFICE_ORDER_STAFF.filter((seat) => !present.has(nameKey(seat.name)));
}

/**
 * The board with each addition slotted in after the last seat holding one of
 * its `after` positions, so a clerk joins the clerks rather than landing below
 * the sweepers. The seats already there keep their order.
 */
export function placeStaff<T extends { position: string }>(board: T[], additions: Array<{ after: string[]; seat: T }>): T[] {
  const out = [...board];
  for (const { after, seat } of additions) {
    let at = -1;
    out.forEach((o, i) => { if (after.includes(o.position)) at = i; });
    out.splice(at === -1 ? out.length : at + 1, 0, seat);
  }
  return out;
}
