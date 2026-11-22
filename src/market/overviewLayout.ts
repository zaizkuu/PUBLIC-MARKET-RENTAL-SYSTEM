/* ============================================================
   The ground floor as the market office sketched it
   ============================================================

   One long hall entered from the street end. Past the entrance a hallway runs
   straight down the middle to the far wall, with the same run of sections on
   both sides of it, nearest the entrance first:

     Kakanin → Vegetables (with fruits/duma and dried fish/eggs) → Fish → Meat → Chicken

   The stalls keep the order of the layout sheets (photoLayout.ts), so they
   sit beside the same neighbours wherever the sketch's blocks allow. The
   sheets put Kakanin at the right-hand end of the produce rows, and the sketch
   puts Kakanin at the entrance, so every sheet is read from its right-hand
   end: row by row from the top, each row right to left, with the two fish
   sheets side by side as the market map has always shown them.

   Each section then goes to the two sides of the hallway. Where the two sides
   of the sheet's own aisle fit the block (fish, meat and chicken), the top
   side goes on the right of the hallway and the bottom side on the left, so
   facing rows still face each other. Otherwise the section is split evenly in
   sheet order, the first half (the top rows) on the right. Each side is laid
   into the block's rows from the entrance inward, each row from the hallway
   outward, long sheet rows folded to the block's width. Within Vegetables that
   puts dried fish/eggs nearest Kakanin, then fruits/duma, then vegetables, as
   on the sheet. The rows stand across the hall, back to back in pairs with an
   aisle between pairs. Distances are schematic, like the sketch.

   Plain TypeScript with no imports, so the Node test runner can load it. */

export type Rect = { x: number; z: number; w: number; d: number };
/** Where a stall stands in the overview. `face` is the side its counter opens
    to: 1 toward the entrance, -1 toward the far wall. */
export type OverviewSlot = Rect & { face: 1 | -1; side: 'left' | 'right' };
export type OverviewBlock = Rect & { key: string; side: 'left' | 'right'; tone: string };
/** A section sign hung over the hallway, centred on (x, z). */
export type OverviewBoard = { text: string; x: number; z: number };
export type OverviewPlan = {
  /** The tiled hall floor the building is built round (the walkway lies outside it). */
  floor: { minX: number; maxX: number; minZ: number; maxZ: number };
  /** The open entrance area, from the first stalls to the front of the floor. */
  entrance: Rect;
  hallway: Rect;
  /** A clear stretch of the hallway where its name is painted. */
  hallwayLabel: Rect;
  blocks: OverviewBlock[];
  boards: OverviewBoard[];
  slots: Map<string, OverviewSlot>;
};

const COL = 1.9, W = 1.8, D = 1.7;
const AISLE = 1.5;        // between two pairs of rows
const CROSS = 2.6;        // between Kakanin, Vegetables and Fish/Meat/Chicken
const HALL = 6;           // the hallway
const CLEAR = 1.2;        // from the hallway to the nearest stall
const MARGIN = 2.5;       // floor round the stalls, inside the walkway
const LOBBY = 17.4;       // the entrance area, from the first stalls to the walkway
const ENTRANCE_W = 14.4;  // about twice and a half the hallway, as sketched
const WIDEST = 6;         // stalls in the longest row

/* Nearest the entrance first. A block is one outlined box on the sketch. */
const BLOCKS: { key: string; codes: string[]; perRow: number; tone: string }[] = [
  { key: 'kakanin', codes: ['KS'], perRow: 3, tone: '#ddd8e3' },
  { key: 'vegetables', codes: ['DS', 'FD', 'VS'], perRow: 6, tone: '#dcdbcf' },
  { key: 'fish-meat-chicken', codes: ['FS', 'MS', 'CS'], perRow: 6, tone: '#d5d9da' },
];
const BOARDS: Record<string, string> = { KS: 'KAKANIN', VS: 'VEGETABLES', FS: 'FISH', MS: 'MEAT', CS: 'CHICKEN' };
/* The two fish sheets side by side, row A to the left of row B, as the map shows them. */
const SHEET_X: Record<string, number> = { 'fish-b': 27 };

const pairStep = 2 * D + AISLE;
/** Distance of row k from the front of its block. */
const rowAt = (k: number) => Math.floor(k / 2) * pairStep + (k % 2) * D;
/** `n` stalls over `rows` rows, as evenly as they go, the longer rows first. */
const spread = (n: number, rows: number) => Array.from({ length: rows }, (_, i) => Math.floor(n / rows) + (i < n % rows ? 1 : 0));

/** `stalls` are the ground floor's stalls where the layout sheets put them. */
export function buildOverview(stalls: { id: string; area: string; x: number; z: number }[]): OverviewPlan {
  /* Each section in sheet order: top row first, each row from its right-hand end. */
  const sheetOrder = [...stalls].sort((a, b) => a.z - b.z || (b.x + (SHEET_X[b.area] ?? 0)) - (a.x + (SHEET_X[a.area] ?? 0)));
  /* Each sheet has an aisle through it (the widest gap between its rows): the rows
     above it are its top side. */
  const split = new Map<string, number>();
  for (const area of new Set(stalls.map((s) => s.area))) {
    const zs = [...new Set(stalls.filter((s) => s.area === area).map((s) => s.z))].sort((a, b) => a - b);
    let at = zs[0] - 1, widest = 0;
    for (let i = 1; i < zs.length; i++) if (zs[i] - zs[i - 1] > widest) { widest = zs[i] - zs[i - 1]; at = (zs[i] + zs[i - 1]) / 2; }
    split.set(area, at);
  }
  const onTop = new Set(stalls.filter((s) => s.z < split.get(s.area)!).map((s) => s.id));
  const byCode = new Map<string, string[]>();
  for (const s of sheetOrder) {
    const code = s.id.split('-')[0];
    (byCode.get(code) ?? byCode.set(code, []).get(code)!).push(s.id);
  }
  const placed = new Set(BLOCKS.flatMap((b) => b.codes));
  const missing = [...byCode.keys()].filter((code) => !placed.has(code));
  if (missing.length) throw new Error(`The overview has no place for section ${missing.join(', ')}`);

  const x0 = HALL / 2 + CLEAR + W + (WIDEST - 1) * COL;           // the hallway's centre line
  const columnX = (side: 'left' | 'right', j: number) => side === 'left' ? x0 - HALL / 2 - CLEAR - W - j * COL : x0 + HALL / 2 + CLEAR + j * COL;

  /* Lay everything out by distance `t` from the entrance end of the stalls,
     then turn that into z, which grows toward the entrance. */
  type Row = { t: number; ids: string[]; side: 'left' | 'right'; face: 1 | -1 };
  const rows: Row[] = [];
  const blockSpans: { key: string; tone: string; t0: number; t1: number; perRow: number }[] = [];
  const boardSpans: { text: string; t0: number; t1: number }[] = [];
  let t = 0;
  for (const block of BLOCKS) {
    let k = 0;
    for (const code of block.codes) {
      const ids = byCode.get(code) ?? [];
      if (!ids.length) continue;
      /* The sheet's own two sides of its aisle go to the two sides of the hallway
         when that takes no more rows than an even split (fish, meat, chicken);
         otherwise the section is split evenly in sheet order. */
      const top = ids.filter((id) => onTop.has(id)), bottom = ids.filter((id) => !onTop.has(id));
      const even = Math.ceil(Math.ceil(ids.length / 2) / block.perRow);
      const bySheet = Math.ceil(Math.max(top.length, bottom.length) / block.perRow);
      const sheetSides = top.length > 0 && bottom.length > 0 && bySheet <= even;
      const half = Math.ceil(ids.length / 2);
      const [rightIds, leftIds] = sheetSides ? [top, bottom] : [ids.slice(0, half), ids.slice(half)];
      const count = sheetSides ? bySheet : even;
      const first = k;
      for (const [side, list] of [['right', rightIds], ['left', leftIds]] as const) {
        let from = 0;
        spread(list.length, count).forEach((n, i) => {
          rows.push({ t: t + rowAt(first + i), ids: list.slice(from, from + n), side, face: (first + i) % 2 === 0 ? 1 : -1 });
          from += n;
        });
      }
      k += count;
      if (BOARDS[code]) boardSpans.push({ text: BOARDS[code], t0: t + rowAt(first), t1: t + rowAt(k - 1) + D });
    }
    if (!k) continue;
    const depth = rowAt(k - 1) + D;
    blockSpans.push({ key: block.key, tone: block.tone, t0: t, t1: t + depth, perRow: block.perRow });
    t += depth + CROSS;
  }
  const total = t - CROSS;                                     // far end of the last block
  const z = (tFromEntrance: number) => total - tFromEntrance;  // the far end of the stalls is z = 0

  const slots = new Map<string, OverviewSlot>();
  for (const row of rows) row.ids.forEach((id, j) => {
    slots.set(id, { x: columnX(row.side, j), z: z(row.t) - D, w: W, d: D, face: row.face, side: row.side });
  });

  const pad = 0.35;
  const blocks: OverviewBlock[] = blockSpans.flatMap((b) => (['left', 'right'] as const).map((side) => {
    const inner = side === 'left' ? columnX(side, 0) + W : columnX(side, 0);
    const outer = side === 'left' ? columnX(side, b.perRow - 1) : columnX(side, b.perRow - 1) + W;
    const x = Math.min(inner, outer) - pad, w = Math.abs(outer - inner) + 2 * pad;
    return { key: b.key, side, tone: b.tone, x, w, z: z(b.t1) - pad, d: b.t1 - b.t0 + 2 * pad };
  }));
  const boards = boardSpans.map((b) => ({ text: b.text, x: x0, z: z((b.t0 + b.t1) / 2) }));

  /* The hallway's name goes in the longest stretch with no sign over it. Seen
     from the street the signs hang above, so they look to stand about 4 units
     further in than they do from overhead: the name keeps clear of both. */
  const signs = boards.map((b) => b.z).sort((a, b) => a - b);
  let gap = { from: 0, to: 0 };
  for (let i = 1; i < signs.length; i++) if (signs[i] - signs[i - 1] > gap.to - gap.from) gap = { from: signs[i - 1], to: signs[i] };
  const clearFrom = gap.from + 0.7, clearTo = gap.to - 5.1;
  const labelLength = Math.max(0, Math.min(10, (clearTo - clearFrom) * 0.9));

  const right = columnX('right', WIDEST - 1) + W;
  return {
    floor: { minX: -MARGIN, maxX: right + MARGIN, minZ: -1.5, maxZ: total + LOBBY },
    entrance: { x: x0 - ENTRANCE_W / 2, z: total, w: ENTRANCE_W, d: LOBBY },
    hallway: { x: x0 - HALL / 2, z: 0, w: HALL, d: total },
    hallwayLabel: { x: x0 - HALL * 0.31, z: (clearFrom + clearTo) / 2 - labelLength / 2, w: HALL * 0.62, d: labelLength },
    blocks,
    boards,
    slots,
  };
}
