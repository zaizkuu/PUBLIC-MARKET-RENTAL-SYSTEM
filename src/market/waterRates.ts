/* Water is billed on the market's tiered schedule, the same way the office's
   own water meter reading sheet works it out:

     0–10 cu.m     a flat minimum charge (₱498.96), whatever was used within it
     11–20 cu.m    each cu.m over 10 at the 11–20 rate (₱54.93)
     21–30 cu.m    each cu.m over 20 at the 21–30 rate (₱63.84)
     31 cu.m & up  each cu.m over 30 at the 31-and-up rate (₱73.43)

   So 14 cu.m is 498.96 + 4 × 54.93 = 718.68. A meter that has not moved
   ("Same Reading" on the sheet) is charged nothing.

   Each tier's subtotal is rounded to the centavo, as the sheet writes it, and
   the amount due is the sum of those subtotals.

   The office can change any of the four figures from Utility Billing. A bill
   keeps the rates it was worked out on (`UtilityBill.waterRates`), so changing
   them later never rewrites a past bill. */

export type WaterRateId = 'minimum' | '11-20' | '21-30' | '31-up';
export type WaterRate = { id: WaterRateId; rate: number };

export type WaterTier = {
  id: WaterRateId;
  /** The bracket as the sheet heads it. */
  label: string;
  /** cu.m already covered before this tier starts charging. */
  above: number;
  /** cu.m this tier covers at most; Infinity for the last one. */
  span: number;
  /** True for the flat minimum charge, false for a rate per cu.m. */
  flat: boolean;
};

export const WATER_TIERS: WaterTier[] = [
  { id: 'minimum', label: '0–10 cu.m', above: 0, span: 10, flat: true },
  { id: '11-20', label: '11–20 cu.m', above: 10, span: 10, flat: false },
  { id: '21-30', label: '21–30 cu.m', above: 20, span: 10, flat: false },
  { id: '31-up', label: '31 cu.m & up', above: 30, span: Infinity, flat: false },
];

const DEFAULTS: Record<WaterRateId, number> = {
  minimum: 498.96,
  '11-20': 54.93,
  '21-30': 63.84,
  '31-up': 73.43,
};

/* To the centavo, half up. toPrecision first, so 2.5 × 54.93 (137.325, held as
   137.32499999…) rounds to 137.33 as it does on paper. */
const cents = (n: number) => Math.round(Number((n * 100).toPrecision(12))) / 100;

const amount = (v: unknown) => {
  const n = cents(Number(v));
  return Number.isFinite(n) && n >= 0 ? n : null;
};

/** The rates on the office's sheet, one row per tier. */
export function defaultWaterRates(): WaterRate[] {
  return WATER_TIERS.map((t) => ({ id: t.id, rate: DEFAULTS[t.id] }));
}

/**
 * Rates read back from storage, a backup or an old bill. Always all four
 * tiers, in order; a tier missing or unreadable takes the sheet's figure.
 */
export function normalizeWaterRates(raw: unknown): WaterRate[] {
  const saved = new Map<string, number>();
  if (Array.isArray(raw)) {
    for (const row of raw) {
      if (!row || typeof row !== 'object') continue;
      const id = (row as WaterRate).id;
      const rate = amount((row as WaterRate).rate);
      if (typeof id === 'string' && rate !== null && !saved.has(id)) saved.set(id, rate);
    }
  }
  return WATER_TIERS.map((t) => ({ id: t.id, rate: saved.has(t.id) ? saved.get(t.id)! : DEFAULTS[t.id] }));
}

/** One tier's rate, or the sheet's figure when the list lacks it. */
export function waterRate(rates: WaterRate[], id: WaterRateId): number {
  return rates.find((r) => r.id === id)?.rate ?? DEFAULTS[id];
}

export type WaterChargeLine = {
  id: WaterRateId;
  label: string;
  /** cu.m charged in this tier (for the minimum: cu.m used within 0–10). */
  units: number;
  rate: number;
  flat: boolean;
  subtotal: number;
};

/**
 * What a water bill comes to for the cu.m used. `lines` holds every tier the
 * consumption reached, in order, for the calculator and the receipt to show.
 */
export function waterCharge(consumption: number, rates: WaterRate[]): { amount: number; lines: WaterChargeLine[] } {
  const used = Number.isFinite(consumption) && consumption > 0 ? consumption : 0;
  if (used === 0) return { amount: 0, lines: [] };
  const lines: WaterChargeLine[] = [];
  for (const tier of WATER_TIERS) {
    const units = Math.min(Math.max(used - tier.above, 0), tier.span);
    if (units <= 0) break;
    const rate = waterRate(rates, tier.id);
    // Tidy float noise from fractional readings (e.g. 12.3 − 10 = 2.3000000000000007).
    const charged = Math.round(units * 1000) / 1000;
    lines.push({
      id: tier.id,
      label: tier.label,
      units: charged,
      rate,
      flat: tier.flat,
      subtotal: tier.flat ? cents(rate) : cents(charged * rate),
    });
  }
  return { amount: cents(lines.reduce((s, l) => s + l.subtotal, 0)), lines };
}
