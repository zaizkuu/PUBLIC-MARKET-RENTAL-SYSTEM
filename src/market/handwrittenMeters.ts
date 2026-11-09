// User-supplied annotated missing-meter sheet, received 2026-11-10.
// Serial numbers only: handwriting does not establish a calibration result.
export const HANDWRITTEN_METERS = [
  ['FS-107', 'Joey Abando', '586854'],
  ['FS-109', 'Melvin Flores', '587243'],
  ['FS-110', 'Renalyn Melo', '202305055621'],
  ['FS-137', 'Danilo Abanag', '2023094892811'],
  ['FS-148', 'Ricardo Ordame', '202304779091'],
  ['FD-8', 'Saclay Julieta', '228775112'],
  // Confirmed by the user: both stalls share this meter.
  ['FD-68', 'Ladan Mae Merlyn', '202492330431'],
  ['FD-69', 'Ladan Mae Merlyn', '202492330431'],
  ['FD-84', 'Cinco Jocelyn', '2022053058691'],
  ['FD-85', 'Cinco Jocelyn', '2022053058691'],
  ['FD-86', 'Ponferada Victoriano', '62010375'],
  ['FD-87', 'Ponferada Victoriano', '62010375'],
  ['MS-16', 'Lorena Lipayon', '220078024'],
  ['MS-17', 'Fernando Borrel', '2105374231'],
  ['MS-18', 'Gemma Gamez', '491236'],
  ['MS-58', 'Jaime Oringo', '587455'],
  ['MS-59', 'Caroline Emoylan', '587782'],
] as const;

/** Green printed serials on the same supplied sheet. Keep suffix I as a letter. */
export const GREEN_PRINTED_METERS = [
  ['DS-73', 'Operio Jenefer', '23040184265'],
  ['FS-116', 'Milo Duzon', 'KW202392137224I'],
  ['FS-131', 'Janith Cinco', '210527309I'],
  ['FS-144', 'John Drandreb Gerilla', '586848'],
  ['KS-1', 'Norida Lerios', 'KW202392137204I'],
  ['KS-3', 'Mary Joy Aguillon', 'KW202392136742I'],
  ['MS-21', 'Nida Salve', '202205304699I'],
  ['MS-54', 'Leo Lanza', '587794'],
] as const;

// Additional numbers and individual assignments explicitly confirmed by the user.
// Directory spellings are retained to match the existing tenant records.
export const CONFIRMED_METERS = [
  ['MS-60', 'Caroline Emoylan', '22007578'],
  ['VS-184', 'Garcia Roberto III', '20106271079'],
  ['CS-28', 'Joy Almaden (P)', '2022031869311'],
  ['CS-31', 'Solidad Cervantes', '2022053064051'],
  ['CS-34', 'Ashley Magdua', '2023054901611'],
  ['FS-118', 'Lyza Dela Cruz', '2025929829481'],
  ['MS-56', 'Ronalyn Bigoy', '250121231841'],
  ['FD-71', 'Cinco Jacquiline', '202205305666I'],
  ['FD-70', 'Saclay Julieta', '42312.2'],
  ['CS-33', 'Jetro Villero', '2509162516'],
  ['CS-38', 'Baby J Arcena', '586957'],
  ['CS-40', 'Eileen Dapitan', '201800005435'],
  ['VS-160', 'Modesto Jade', 'WJF95902029'],
  ['VS-185', 'Rellona Evangeline', '2018000045793'],
  ['VS-187', 'Blase Maricel', '586853'],
  ['VS-192', 'Marabut Mylene', '23040184894'],
] as const;

export const PHOTO_METERS = [...HANDWRITTEN_METERS, ...GREEN_PRINTED_METERS, ...CONFIRMED_METERS];

const nameKey = (name: string) => name.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean).sort().join(' ');

/** Match both stall and holder; do not transfer a former holder's meter. */
export function fillHandwrittenMeters<T extends { stallId: string; name: string; meters: { Electricity: string; Water: string } }>(tenants: T[]): T[] {
  return tenants.map(tenant => {
    if (tenant.meters.Electricity.trim()) return tenant;
    const row = PHOTO_METERS.find(([stall, name]) => stall === tenant.stallId && nameKey(name) === nameKey(tenant.name));
    return row ? { ...tenant, meters: { ...tenant.meters, Electricity: row[2] } } : tenant;
  });
}
