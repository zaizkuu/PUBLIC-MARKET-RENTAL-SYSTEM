/* ============================================================
   Market Stall Directory
   ============================================================

   The stall register as the market office handed it over: the "Market Stall
   Directory" compiled from the final layout sheets — 194 stalls in seven
   sections, each with its vendor as printed on the sheet. Names are kept
   exactly as printed (some sheets put the surname first, some last), because
   reordering them would mean guessing which word is the surname.

   Stall numbers are the ones painted on the layout, unique across the whole
   market. A stall's ID is its section code followed by that number exactly as
   the directory prints it, so stall 1 in the Kakanin section is KS-1 and
   stall 105 in Fish is FS-105 — found on the sheet by the same number.

   Plain TypeScript with no imports, so the Node test runner can load it as-is
   (see tests/directory.test.mjs).
   ============================================================ */

export type SectionInfo = {
  /** The section's name as the directory prints it. */
  name: string;
  /** Two-letter prefix of every stall ID in the section. */
  code: string;
  /** Monthly rent under Section 43 (chicken is charged as meat). */
  rate: number;
  /** Fits a graph axis or a narrow column. */
  short: string;
};

/* In the directory's own order. Change a code here and nothing else needs
   editing: every stall ID, form and rate lookup reads this list. */
export const SECTION_LIST: SectionInfo[] = [
  { name: 'Kakanin', code: 'KS', rate: 1000, short: 'Kakanin' },
  { name: 'Dried Fish/Eggs', code: 'DS', rate: 1000, short: 'Dried Fish' },
  { name: 'Fruits/Duma', code: 'FD', rate: 1000, short: 'Fruits/Duma' },
  { name: 'Vegetable', code: 'VS', rate: 1000, short: 'Vegetable' },
  { name: 'Fish', code: 'FS', rate: 1000, short: 'Fish' },
  { name: 'Meat - Chicken', code: 'CS', rate: 1500, short: 'Chicken' },
  { name: 'Meat - Carabeef/Beef & Pork', code: 'MS', rate: 1500, short: 'Beef & Pork' },
];

export const SECTION_NAMES = SECTION_LIST.map((s) => s.name);

/* Prefixes the register used before the directory, kept only so a backup
   restored from that time still quotes the right rent. */
const LEGACY_RATES: Record<string, number> = { FV: 1000, KK: 1000 };

export function sectionInfo(section: string): SectionInfo | undefined {
  return SECTION_LIST.find((s) => s.name === section);
}

export function sectionByCode(code: string): SectionInfo | undefined {
  const upper = code.toUpperCase();
  return SECTION_LIST.find((s) => s.code === upper);
}

/** KS + 1 → KS-1: the number as the directory prints it, no leading zeros. */
export function stallIdFor(code: string, number: number): string {
  return `${code.toUpperCase()}-${number}`;
}

/* Stall IDs in number order — KS-2 before KS-10 — rather than letter order. */
export function compareStallIds(a: string, b: string): number {
  return a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' });
}

/* The directory's own order: by the number on the layout, whatever the
   section — KS-4, DS-5, DS-6, FD-7… IDs without a number go last. */
export function compareStallNumbers(a: string, b: string): number {
  const x = stallNumber(a);
  const y = stallNumber(b);
  if (Number.isFinite(x) && Number.isFinite(y) && x !== y) return x - y;
  if (Number.isFinite(x) !== Number.isFinite(y)) return Number.isFinite(x) ? -1 : 1;
  return compareStallIds(a, b);
}

/** The number painted on the stall, or NaN for an ID that carries none. */
export function stallNumber(id: string): number {
  const digits = id.match(/(\d+)\s*$/);
  return digits ? parseInt(digits[1], 10) : NaN;
}

/** The highest stall number in use plus one — what a new stall is numbered. */
export function nextStallNumber(ids: string[]): number {
  const numbers = ids.map(stallNumber).filter((n) => Number.isFinite(n));
  return (numbers.length > 0 ? Math.max(...numbers) : 0) + 1;
}

/** The monthly rate a stall pays, read from its prefix. */
export function rateForStallId(stallId: string): number {
  const prefix = stallId.slice(0, 2).toUpperCase();
  return sectionByCode(prefix)?.rate ?? LEGACY_RATES[prefix] ?? 0;
}

/**
 * Reads what an officer typed into a Stall ID box for a stall in `section`.
 * A bare number takes the section's prefix ("74" → "KS-74"); a full ID is
 * tidied ("ks-074" → "KS-74"). A prefix belonging to another section, or
 * anything that is not a stall ID at all, comes back as an error.
 */
export function parseStallId(typed: string, section: string): { id: string } | { error: string } {
  const info = sectionInfo(section);
  const text = typed.trim().toUpperCase().replace(/\s+/g, '');
  const bare = text.match(/^(\d{1,4})$/);
  const full = text.match(/^([A-Z]{2})-?(\d{1,4})$/);
  if (!info) return text ? { id: text } : { error: 'Enter a stall ID.' };
  if (bare) return { id: stallIdFor(info.code, parseInt(bare[1], 10)) };
  if (full) {
    if (full[1] !== info.code) return { error: `Stall IDs in the ${info.name} section start with ${info.code}- (for example ${stallIdFor(info.code, 1)}).` };
    return { id: stallIdFor(info.code, parseInt(full[2], 10)) };
  }
  return { error: `Enter the stall number, or a stall ID such as ${stallIdFor(info.code, 1)}.` };
}

/** The same stall number under another section's prefix. */
export function renumberForSection(stallId: string, section: string): string {
  const info = sectionInfo(section);
  const number = stallNumber(stallId);
  if (!info || !Number.isFinite(number)) return stallId;
  return stallIdFor(info.code, number);
}

/* ---------- The directory itself ----------

   [stall number, vendor as printed, section code, note from the sheet].
   'Vacant' is a stall the sheet marks vacant. NO_NAME is an open area with
   nothing written on the layout — the directory does not count those among
   its vacancies, so they are kept apart here too. */

export const VACANT = 'Vacant';
export const NO_NAME = '(no name written)';
const ILLEGIBLE = 'Handwritten edits on photo (illegible); printed name shown';
const SMUDGED = 'Number smudged on photo';
const OPEN_AREA = 'Open pink area, no name on the layout';
const NOT_A_VENDOR = 'Not a vendor stall';

/** Stalls that are on the layout but are not rented to a vendor. */
export const NON_VENDOR_STALLS = new Set(['PNP/Guard Station']);

export type DirectoryRow = [number, string, string, string?];

export const DIRECTORY_ROWS: DirectoryRow[] = [
  [1, 'Norida Lerios', 'KS'],
  [2, 'Narcisa Redona', 'KS'],
  [3, 'Mary Joy Aguillon', 'KS'],
  [4, 'Jade Modesto', 'KS'],
  [5, 'Operio Jenefer', 'DS'],
  [6, 'Caimoy Genevieve', 'DS'],
  [7, 'Cinco Jacquiline', 'FD'],
  [8, 'Saclay Julieta', 'FD'],
  [9, 'Ladan Mae Merlyn', 'FD'],
  [10, 'Ladan Mae Merlyn', 'FD'],
  [11, 'Duquilla Irene', 'VS'],
  [12, 'Basihan Josephine', 'VS'],
  [13, 'Camposano Lisa', 'VS'],
  [14, 'Marabut Myra', 'VS'],
  [15, 'Romeo Lipayon', 'MS', ILLEGIBLE],
  [16, 'Lorena Lipayon', 'MS', ILLEGIBLE],
  [17, 'Fernando Borrel', 'MS', ILLEGIBLE],
  [18, 'Gemma Gamez', 'MS', ILLEGIBLE],
  [19, 'Leymar Loteyro', 'MS', ILLEGIBLE],
  [20, 'Nida Salve', 'MS'],
  [21, 'Nida Salve', 'MS'],
  [22, 'Fatima Gaven', 'MS'],
  [23, 'Desiderio Camero', 'MS'],
  [24, VACANT, 'MS'],
  [25, VACANT, 'MS'],
  [26, 'Regiie Bigoy', 'MS'],
  [27, 'Aiza Odtuhan', 'MS'],
  [28, 'Joy Almaden (P)', 'CS'],
  [29, 'Alwin Magdua', 'CS'],
  [30, 'Percival Cervantes', 'CS'],
  [31, 'Solidad Cervantes', 'CS'],
  [32, 'Jetro Villero', 'CS'],
  [33, 'Jetro Villero', 'CS'],
  [34, 'Ashley Magdua', 'CS'],
  [35, VACANT, 'CS'],
  [36, VACANT, 'CS'],
  [37, 'Baby J Arcena', 'CS'],
  [38, 'Baby J Arcena', 'CS'],
  [39, 'Eileen Dapitan', 'CS'],
  [40, 'Eileen Dapitan', 'CS'],
  [41, 'Marites Laurino', 'CS'],
  [42, VACANT, 'CS'],
  [43, VACANT, 'CS'],
  [44, 'Eliza Tizon', 'CS'],
  [45, 'Vilma Lanza', 'CS'],
  [46, 'Chritine Ripalda', 'CS'],
  [47, 'Martha Lonzaga', 'CS'],
  [48, 'Jennifer Almaden (P)', 'CS'],
  [49, 'Celeste Banez (P)', 'CS'],
  [50, 'Jingjing Terado', 'MS'],
  [51, 'C Godwin Magdua', 'MS'],
  [52, 'Mary Ann Almaden', 'MS'],
  [53, 'Leo Lanza', 'MS'],
  [54, 'Leo Lanza', 'MS'],
  [55, 'Ronalyn Bigoy', 'MS'],
  [56, 'Ronalyn Bigoy', 'MS'],
  [57, 'Jaime Oringo', 'MS'],
  [58, 'Jaime Oringo', 'MS'],
  [59, 'Caroline Emoylan', 'MS'],
  [60, 'Caroline Emoylan', 'MS'],
  [61, 'Gerry Lipayon', 'MS'],
  [62, 'Leodegario Gerilla', 'MS'],
  [63, 'Dulce Duzon', 'VS', "Handwritten over 'Vacant'"],
  [64, 'Vertudes Kate', 'VS'],
  [65, VACANT, 'VS'],
  [66, VACANT, 'VS'],
  [67, VACANT, 'VS'],
  [68, 'Ladan Mae Merlyn', 'FD'],
  [69, 'Ladan Mae Merlyn', 'FD'],
  [70, 'Saclay Julieta', 'FD'],
  [71, 'Cinco Jacquiline', 'FD'],
  [72, VACANT, 'DS'],
  [73, 'Operio Jenefer', 'DS'],
  [74, VACANT, 'KS'],
  [75, VACANT, 'KS'],
  [76, 'Rosario Elardo', 'KS'],
  [77, 'Joel Arellano', 'KS'],
  [78, 'Marthy Medrano', 'KS'],
  [79, 'Catherine Flores', 'KS'],
  [80, 'Jacquiline Flores', 'KS'],
  [81, 'Rhodora Cesar', 'KS'],
  [82, VACANT, 'DS'],
  [83, VACANT, 'DS'],
  [84, 'Cinco Jocelyn', 'FD'],
  [85, 'Cinco Jocelyn', 'FD'],
  [86, 'Ponferada Victoriano', 'FD'],
  [87, 'Ponferada Victoriano', 'FD'],
  [88, 'Anos Diane', 'VS'],
  [89, 'Martos Sylvia', 'VS'],
  [90, 'Pelino Florentina', 'VS'],
  [91, 'Magdua Genevieve', 'VS'],
  [92, 'Guardaya Ma. Lourcel', 'VS'],
  [93, 'Telemban Esmeralda', 'VS'],
  [94, 'Gasing Nestor', 'VS'],
  [95, 'PNP/Guard Station', 'VS', NOT_A_VENDOR],
  [105, 'Gloria Aguilar', 'FS'],
  [106, 'Felisa Abas', 'FS'],
  [107, 'Joey Abando', 'FS'],
  [108, 'Marilyn Candela', 'FS'],
  [109, 'Melvin Flores', 'FS'],
  [110, 'Renalyn Melo', 'FS'],
  [111, 'Melba Melo', 'FS'],
  [112, 'Abelardo Pardales', 'FS'],
  [113, 'Merly Baguisa', 'FS'],
  [114, 'Colita Baguisa', 'FS'],
  [115, 'Daniel Tomanda', 'FS'],
  [116, 'Milo Duzon', 'FS'],
  [117, 'Corazon Dela Cruz', 'FS'],
  [118, 'Lyza Dela Cruz', 'FS'],
  [119, 'Mary Ann Salano', 'FS', "Name crossed out; handwritten 'Jefer John' above it"],
  [120, 'Nilda Ubaldo', 'FS'],
  [121, 'Eric Vertudez', 'FS'],
  [122, VACANT, 'FS'],
  [123, VACANT, 'FS'],
  [124, VACANT, 'FS'],
  [125, VACANT, 'FS'],
  [126, 'Regine Garcia', 'FS'],
  [127, VACANT, 'FS'],
  [128, VACANT, 'FS'],
  [129, VACANT, 'FS'],
  [130, 'Janith Cinco', 'FS'],
  [131, 'Janith Cinco', 'FS', "Handwritten 'Vacant' nearby; 'Cinco' marked on photo"],
  [132, VACANT, 'FS'],
  [133, 'Sandro Aguillon', 'FS', "Name crossed out; handwritten 'Vacant'"],
  [134, 'Princess Plaba', 'FS'],
  [135, 'Ma. Clariss Aguillon', 'FS'],
  [136, 'Charina Ordame', 'FS'],
  [137, 'Danilo Abanag', 'FS'],
  [138, 'Alma Abanag', 'FS'],
  [139, 'Laila Barcilla', 'FS'],
  [140, 'Jovita Plaba', 'FS'],
  [141, 'Dennis Abano', 'FS'],
  [142, 'Haide Abano', 'FS'],
  [143, 'John Drandreb Gerilla', 'FS'],
  [144, 'John Drandreb Gerilla', 'FS'],
  [145, 'Reshile Labrado', 'FS'],
  [146, 'Benecio Costimiano', 'FS'],
  [147, 'Karen Laurente', 'FS'],
  [148, 'Ricardo Ordame', 'FS'],
  [149, 'Rine Ordame', 'FS'],
  [159, 'Villero Crisanta', 'VS'],
  [160, 'Modesto Jade', 'VS'],
  [161, 'Villero Ester', 'VS'],
  [162, 'Albao Darwin', 'VS'],
  [163, 'Podol Ramil', 'VS'],
  [164, 'Udtohan Neil', 'VS'],
  [165, 'Vilma Garcia', 'VS'],
  [166, 'Paranas Lyn', 'VS'],
  [167, 'Tolibas Roslyn', 'VS'],
  [168, 'Lagarto Mary Jean', 'VS'],
  [169, 'Sheryl Zialcita', 'VS'],
  [170, 'Salcedo Sofia Mae', 'VS'],
  [171, 'Lancaran Isabelita', 'DS'],
  [172, VACANT, 'DS', 'Covered by tape on the photo'],
  [173, 'Florita Soriano', 'DS', 'Handwritten; replaces crossed-out Dulce Duzon'],
  [174, VACANT, 'DS'],
  [175, VACANT, 'DS'],
  [176, VACANT, 'DS'],
  [177, VACANT, 'DS'],
  [178, 'Julife Esjaban', 'DS', 'Spelling hard to read'],
  [179, 'Ervin Peralta', 'DS'],
  [180, VACANT, 'DS'],
  [181, VACANT, 'DS'],
  [182, 'Salcedo Shaine Marie', 'VS'],
  [183, VACANT, 'VS'],
  [184, 'Garcia Roberto III', 'VS'],
  [185, 'Rellona Evangeline', 'VS'],
  [186, VACANT, 'VS'],
  [187, 'Blase Maricel', 'VS'],
  [188, 'Amistoso Jonathan', 'VS'],
  [189, 'Dumalaoron Estelita', 'VS'],
  [190, 'Royeras Francisco', 'VS', SMUDGED],
  [191, 'Camino Cheenee', 'VS'],
  [192, 'Marabut Mylene', 'VS'],
  [193, 'Menaya Roy', 'VS'],
  [194, 'Lamoste Rey', 'VS'],
  [195, 'Karen G Villegas', 'VS'],
  [196, 'Olguira Angeila Ca Mae', 'VS'],
  [197, 'Yepes Oscar', 'VS', SMUDGED],
  [198, 'Cordero Ma. Nilda', 'VS'],
  [199, 'Solano Wilson', 'VS'],
  [200, 'Boco Ria', 'VS'],
  [201, 'Dangco Jamel Rose', 'VS'],
  [202, 'Catan Rosario', 'VS'],
  [203, 'Nerja Nerly', 'VS'],
  [204, 'Madelyn Canayon', 'VS'],
  [205, 'Estember Cheremae', 'VS'],
  [206, 'Joy Dadizon', 'DS'],
  [207, NO_NAME, 'DS', OPEN_AREA],
  [208, NO_NAME, 'DS', OPEN_AREA],
  [209, NO_NAME, 'DS', OPEN_AREA],
  [210, NO_NAME, 'DS', OPEN_AREA],
  [211, NO_NAME, 'DS', OPEN_AREA],
  [212, NO_NAME, 'DS', OPEN_AREA],
];

/** Bumped whenever the rows above change, so an installation knows to reload them.
    The "b" edition numbers stalls as printed (KS-1) and starts every record afresh. */
export const DIRECTORY_EDITION = 'market-stall-directory-2026-10b';

export type DirectoryStall = {
  id: string;
  section: string;
  tenant: string;
  status: 'Occupied' | 'Available';
  permit: 'Not Recorded';
  lastInspection: string;
  note: string;
};

/** A vendor's hold on one stall — a tenant record before the app adds its own fields.
    `number` is the stall's number in the directory, which also numbers the tenant record. */
export type DirectoryTenancy = { number: number; stallId: string; name: string; section: string; rent: number };

/**
 * The register the directory describes: every stall in stall-number order,
 * and one tenancy per stall a vendor holds. A vendor on several stalls holds
 * several tenancies, the same way the office bills them.
 */
export function buildDirectory(): { stalls: DirectoryStall[]; tenancies: DirectoryTenancy[] } {
  const stalls: DirectoryStall[] = [];
  const tenancies: DirectoryTenancy[] = [];
  for (const [number, vendor, code, note = ''] of [...DIRECTORY_ROWS].sort((a, b) => a[0] - b[0])) {
    const section = sectionByCode(code);
    if (!section) throw new Error(`Directory row ${number} names an unknown section code ${code}.`);
    const id = stallIdFor(code, number);
    const open = vendor === VACANT || vendor === NO_NAME;
    stalls.push({
      id,
      section: section.name,
      tenant: open ? VACANT : vendor,
      status: open ? 'Available' : 'Occupied',
      permit: 'Not Recorded',
      lastInspection: '-',
      note,
    });
    if (!open && !NON_VENDOR_STALLS.has(vendor)) {
      tenancies.push({ number, stallId: id, name: vendor, section: section.name, rent: section.rate });
    }
  }
  return { stalls, tenancies };
}
