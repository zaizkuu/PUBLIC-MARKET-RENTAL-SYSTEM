/* ============================================================
   2nd floor vendors
   ============================================================

   The market office's "List of 2nd Floor Vendors as of September 30, 2026",
   transcribed row by row. Its columns are NO., LAST NAME, (first name —
   printed as a second LAST NAME heading), MIDDLE NAME, WITH BP, WITH LCA,
   WITH METER and STATUS OF STALL.

   - Stall IDs follow the rest of the register: the sheet's PS-01 is PS-1.
     2nd floor numbers restart at 1, so they repeat ground-floor numbers; the
     2nd floor is listed after the ground floor rather than mixed into it.
   - Names are written the way the register writes them, SURNAME, GIVEN
     MIDDLE, from the sheet's own columns, spelled exactly as printed.
   - The sheet lists no PS-51: it goes from PS-50 to PS-52.
   - Rows PS-39 to PS-54 are highlighted and marked "Temporarily vacated" in
     the status column. A vendor named there still holds the stall, so it is
     Temporarily Closed rather than Available.
   - PS-35 is printed VACANT with "Heginio Redona — TEMPORARY" and a meter;
     PS-50's vendor, Hegino Redoña, has "#35" in the meter column. PS-35 stays
     available, with the arrangement in its note.
   - The sheet has no rent figure. The rate lives in SECTION_LIST
     (src/market/directory.ts) under code PS.

   Plain TypeScript with no imports, so the Node test runner loads it as-is
   (see tests/second-floor.test.mjs).
   ============================================================ */

export const SECOND_FLOOR_SECTION = '2nd Floor';
export const SECOND_FLOOR_CODE = 'PS';
export const SECOND_FLOOR_AS_OF = 'September 30, 2026';

/* Written into the logbook when the list is added, so it is added once. */
export const SECOND_FLOOR_IMPORT = 'List of 2nd Floor Vendors as of September 30, 2026';

export type SecondFloorRow = {
  number: number;
  /** SURNAME, GIVEN MIDDLE — blank where the sheet names no vendor. */
  vendor: string;
  /** What the name column says when there is no vendor. */
  mark?: 'Vacant' | 'Vacated' | 'Abandoned';
  /** A slash in the WITH BP column. */
  bp: boolean;
  /** The WITH LCA column as printed: EXPIRED, NONE, a date, or blank. */
  lca: string;
  /** Inside the block marked "Temporarily vacated". */
  away?: boolean;
  /** Anything else written on the row. */
  remark?: string;
};

const row = (number: number, vendor: string, lca: string, remark?: string): SecondFloorRow => ({ number, vendor, bp: true, lca, ...(remark ? { remark } : {}) });
const away = (number: number, vendor: string, lca: string, remark?: string): SecondFloorRow => ({ ...row(number, vendor, lca, remark), away: true });
const open = (number: number, mark: 'Vacant' | 'Vacated' | 'Abandoned', lca = '', remark?: string): SecondFloorRow => ({ number, vendor: '', mark, bp: false, lca, ...(remark ? { remark } : {}), ...(number >= 39 ? { away: true } : {}) });

export const SECOND_FLOOR_ROWS: SecondFloorRow[] = [
  row(1, 'AQUITANIA, KAREN KAPUNAN', 'EXPIRED'),
  row(2, 'MODESTO, JANET BOLLENA', 'EXPIRED'),
  row(3, 'PALETA, IMEE CAYAS', 'EXPIRED'),
  row(4, 'CESAR, EARL BRIGGER', 'EXPIRED', 'Under close monitoring'),
  row(5, 'ONDAP, NICANORA ANINO', 'EXPIRED'),
  row(6, 'ONDAP, NICANORA ANINO', 'EXPIRED'),
  row(7, 'MESIAS, ARLENE CALABRIA', 'EXPIRED'),
  row(8, 'DALOGDOG, FIEL CALIPUSAN', '6.2022'),
  row(9, 'ADVINCULA, MARY JOYCE CALABRIA', 'NONE'),
  row(10, 'LUMBRE, MARIO LAGUNAY', 'EXPIRED'),
  row(11, 'CHAVEZ, LEONISA PUNO', 'NONE'),
  row(12, 'BILBAO, ORLANDO MIRANDA', 'EXPIRED'),
  row(13, 'SALCEDO, MYRASOL VELASCO', 'EXPIRED'),
  row(14, 'SALCEDO, MYRASOL VELASCO', 'NONE'),
  row(15, 'ALVAREZ, MICHAEL MABINI', 'NONE'),
  row(16, 'ALMENARIO, MARIA IVY', 'NONE'),
  row(17, 'AVILA, VINA CORNEJO', 'NONE'),
  row(18, 'MANITO, EDUARDO DE LA CRUZ', 'EXPIRED'),
  row(19, 'CABUEÑAS, JANICE CAÑEDA', 'EXPIRED'),
  row(20, 'POLICARPIO, CENON SARMIENTO', 'NONE'),
  row(21, 'DALOGDOG, NILMA CASALTA', 'EXPIRED'),
  row(22, 'BOCO, JORGE ROY DALOGDOG', 'NONE'),
  row(23, 'ALABAR, MA. JESSA CALABRIA', 'NONE'),
  row(24, 'LINGGAS, BELINDA DEL ROSARIO', 'NONE'),
  row(25, 'FLORENDO, PAUL BORELA', 'NONE'),
  row(26, 'QUIZOL, MA. DOLORES CUMPIO (TANGPUZ)', 'NONE'),
  row(27, 'ALBAO, JIM KAYE GOLES', 'NONE'),
  row(28, 'BOCO, JOJIT OZOA', 'NONE'),
  row(29, 'PITA, MA. ELISA JIMENEZ', 'EXPIRED'),
  row(30, 'ABANO, ROSALINDA', 'NONE'),
  row(31, 'GAMEZ, MELCHOR CABAÑERO', 'NONE'),
  row(32, 'COMBINIDO, AILEEN GRANADA', 'EXPIRED'),
  row(33, 'BAYARONG, EDNA ABUG', 'NONE'),
  row(34, 'AGUILAR, MICHELLE ORTEZA', 'NONE'),
  open(35, 'Vacant', '', 'Used temporarily by Heginio Redona (vendor of PS-50); with meter'),
  row(36, 'CLAVILLAS, VENUS CAMPOSANO', 'NONE'),
  row(37, 'SABALZA, AILYN ESPADA', 'NONE'),
  row(38, 'ABREMATEA, VIRGILIO DE PAZ', 'NONE'),
  open(39, 'Abandoned', 'EXPIRED'),
  open(40, 'Abandoned', 'NONE'),
  open(41, 'Vacant'),
  open(42, 'Vacant'),
  open(43, 'Vacated', 'EXPIRED'),
  open(44, 'Vacant'),
  open(45, 'Vacant', '6.27.2022'),
  open(46, 'Vacant', 'NONE'),
  away(47, 'VASQUEZ, JOANNE / COBANCHA, MELANIE', 'NONE'),
  away(48, 'PELINO, BRIX / PELINO, JAN JIX', 'NONE'),
  open(49, 'Vacant'),
  away(50, 'REDOÑA, HEGINO DUMA', 'EXPIRED', 'Meter column reads #35 — using PS-35 for now'),
  away(52, 'PEPITO, ROSELYN RICARTE', 'EXPIRED'),
  away(53, 'ARELLANO, GILDA CATAN', '6.28.2022'),
  away(54, 'VERTUDES, ERIC', 'NONE'),
];

export type SecondFloorStall = {
  id: string;
  section: string;
  tenant: string;
  status: 'Occupied' | 'Available' | 'Temporarily Closed' | 'Abandoned';
  permit: 'With BP' | 'Not Recorded';
  lastInspection: string;
  note: string;
};

export type SecondFloorTenancy = { number: number; stallId: string; name: string; section: string };

/* What the row says beyond its status, for the stall's note. */
function noteFor(r: SecondFloorRow): string {
  const lca = r.lca === 'EXPIRED' ? 'LCA expired' : r.lca === 'NONE' ? 'No LCA' : r.lca ? `LCA ${r.lca}` : '';
  return [r.mark === 'Vacated' ? 'Vacated' : '', r.remark ?? '', r.away && r.vendor ? 'Temporarily vacated' : '', lca, `2nd floor list, ${SECOND_FLOOR_AS_OF}`]
    .filter(Boolean).join('; ');
}

/**
 * The 2nd floor as stall rows and tenancies, in number order. A vendor on
 * two stalls holds two tenancies, the same way the ground floor is billed.
 */
export function buildSecondFloor(): { stalls: SecondFloorStall[]; tenancies: SecondFloorTenancy[] } {
  const stalls: SecondFloorStall[] = [];
  const tenancies: SecondFloorTenancy[] = [];
  for (const r of [...SECOND_FLOOR_ROWS].sort((a, b) => a.number - b.number)) {
    const id = `${SECOND_FLOOR_CODE}-${r.number}`;
    const status = r.vendor ? (r.away ? 'Temporarily Closed' : 'Occupied') : r.mark === 'Abandoned' ? 'Abandoned' : 'Available';
    stalls.push({
      id,
      section: SECOND_FLOOR_SECTION,
      tenant: r.vendor || (r.mark === 'Abandoned' ? '(no name on the list)' : 'Vacant'),
      status,
      permit: r.bp ? 'With BP' : 'Not Recorded',
      lastInspection: '-',
      note: noteFor(r),
    });
    if (r.vendor) tenancies.push({ number: r.number, stallId: id, name: r.vendor, section: SECOND_FLOOR_SECTION });
  }
  return { stalls, tenancies };
}

/**
 * The stalls and tenancies an installation does not have yet, by stall ID,
 * so running the import over records that already hold some of the 2nd floor
 * leaves those as the office has them.
 */
export function missingSecondFloor(stallIds: string[], tenantStallIds: string[]) {
  const haveStall = new Set(stallIds.map((id) => id.toUpperCase()));
  const haveTenant = new Set(tenantStallIds.map((id) => id.toUpperCase()));
  const { stalls, tenancies } = buildSecondFloor();
  return {
    stalls: stalls.filter((s) => !haveStall.has(s.id)),
    tenancies: tenancies.filter((t) => !haveStall.has(t.stallId) && !haveTenant.has(t.stallId)),
  };
}
