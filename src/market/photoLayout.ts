// Positions transcribed from the six supplied layout photographs.
// Units are schematic: the photos do not establish measured dimensions or
// the relative location of the separate fish, meat and produce sheets.
// 'upper' is the 2nd floor, which has its own view and never joins the ground-floor overview.
export type PhotoArea = 'produce' | 'meat' | 'fish-a' | 'fish-b' | 'upper';
export type PhotoView = PhotoArea | 'all';
// 'All sections' does not join these sheets together: it follows the office's
// sketch of the whole floor instead (overviewLayout.ts).
// `face` is the way a counter opens: 1 (or left out) toward the street, -1 away from it.
export type PhotoPosition = { number: number; area: PhotoArea; x: number; z: number; w: number; d: number; face?: 1 | -1 };
export const PHOTO_AREAS: { id: PhotoArea; name: string; caption: string }[] = [
  { id: 'produce', name: 'Vegetable & dry goods', caption: 'Vegetable, fruits/duma, dried fish/eggs and kakanin · photos 1–2' },
  { id: 'meat', name: 'Chicken, beef & pork', caption: 'Two facing rows · photos 3–4' },
  { id: 'fish-a', name: 'Fish · 105–116 / 138–149', caption: 'Two facing rows with the left access gap · photo 5' },
  { id: 'fish-b', name: 'Fish · 117–137', caption: 'Power room, stairs and facing stalls · photo 6' },
];
export const PHOTO_POSITIONS: PhotoPosition[] = [];
const add = (number: number, area: PhotoArea, x: number, z: number, w = 1.8) => PHOTO_POSITIONS.push({ number, area, x, z, w, d: 1.7 });
const col = (i: number) => i * 1.9 + Math.floor(i / 2) * .65;
// Upper islands, left to right. The CR occupies columns 6–7 in rows 1–2.
[14,13,12,11].forEach((n,i)=>add(n,'produce',col(i+2),0));
for(let n=10;n>=1;n--)add(n,'produce',col(18-n),0);
for(let n=63;n<=67;n++)add(n,'produce',col(n-62),1.8);
for(let n=68;n<=77;n++)add(n,'produce',col(n-60),1.8);
for(let n=95;n>=78;n--)add(n,'produce',col(95-n),3.6);
// Lower islands. The final dried-fish strip is one shared area on the photo;
// its numbered positions are shown without asserting physical partitions.
for(let n=159;n<=172;n++)add(n,'produce',col(n-159),7.4);
for(let n=173;n<=179;n++)add(n,'produce',col(14)+(n-173)*1.16,7.4,1.08);
for(let n=193;n>=180;n--)add(n,'produce',col(193-n),9.2);
for(let n=194;n<=207;n++)add(n,'produce',col(n-194),11);
for(let n=208;n<=212;n++)add(n,'produce',col(14)+(n-208)*1.63,11,1.5);
// Chicken continues directly into the red meat rows across sheets 3 and 4.
for(let n=38;n>=15;n--)add(n,'meat',(38-n)*1.9+(n<=27?.65:0),0);
for(let n=39;n<=62;n++)add(n,'meat',(n-39)*1.9+(n>=50?.65:0),4);
for(let n=116;n>=105;n--)add(n,'fish-a',(116-n)*1.9+(n<116?.65:0),0);
for(let n=138;n<=149;n++)add(n,'fish-a',(n-138)*1.9+(n>138?.65:0),4);
add(125,'fish-b',0,0);add(124,'fish-b',1.9,0);
for(let n=123;n>=117;n--)add(n,'fish-b',(128-n)*1.9,0);
for(let n=126;n<=137;n++)add(n,'fish-b',(n-126)*1.9,4);
export const PHOTO_FEATURES = [
  {area:'produce',label:'CR',x:col(6),z:0,w:4.35,d:3.5},
  {area:'produce',label:'R-1 / R-2',x:0,z:0,w:1.8,d:3.5},
  {area:'fish-b',label:'STAIRS',x:3.8,z:0,w:5.6,d:1.7},
  {area:'fish-b',label:'POWER ROOM',x:-2,z:0,w:1.1,d:5.7},
] as const;
export const PHOTO_COLORS: Record<string,string> = { VS:'#7caa3d', FD:'#a3b739', DS:'#ca8f6d', KS:'#9f8bc1', CS:'#d4ae30', MS:'#c95e67', FS:'#63a9cb', PS:'#3f9a92' };
export const SECTION_LABELS: Record<string,string> = { VS:'Vegetable', FD:'Fruits/Duma', DS:'Dried fish/Eggs', KS:'Kakanin', CS:'Chicken', MS:'Beef & Pork', FS:'Fish', PS:'2nd Floor' };

// The 2nd floor. Its vendor list (secondFloor.ts) gives stall numbers but no
// drawing, so the stalls are set out schematically in number order: a wall
// row, a back-to-back island and a second wall row, with a cross aisle every
// seven stalls. The list has no PS-51, so neither does the plan.
export const UPPER_POSITIONS: PhotoPosition[] = [];
const upperCol = (i: number) => i * 1.9 + Math.floor(i / 7) * 1.3;
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
([[range(1, 14), 0], [range(15, 28), 3.6], [range(29, 42), 5.3], [range(43, 54).filter((n) => n !== 51), 8.9]] as [number[], number][])
  .forEach(([numbers, z]) => numbers.forEach((number, i) => UPPER_POSITIONS.push({ number, area: 'upper', x: upperCol(i), z, w: 1.8, d: 1.7 })));

// Stalls on the layout that are not rented to anyone.
export const FACILITY_IDS = new Set(['VS-95']);

// Occupancy as the map groups it. "Not operating" covers every status where a
// stall is held but not trading, or not usable.
export type StatusFilter = '' | 'Available' | 'Occupied' | 'Inactive';
export const INACTIVE_STATUSES = ['Temporarily Closed', 'Closed', 'Abandoned', 'Maintenance'];
export function statusGroup(status: string): Exclude<StatusFilter, ''> {
  return status === 'Available' ? 'Available' : INACTIVE_STATUSES.includes(status) ? 'Inactive' : 'Occupied';
}
export const FILTER_TINTS: Record<Exclude<StatusFilter, ''>, string> = { Available: '#20a675', Occupied: '#397ed6', Inactive: '#d08a1e' };
export const STATUS_COLORS: Record<string, string> = {
  Occupied: '#397ed6', Available: '#20a675', 'Temporarily Closed': '#e0a133', Maintenance: '#e07b39', Closed: '#9b6b5c', Abandoned: '#c0504d',
};
export const FACILITY_COLOR = '#8296aa';
