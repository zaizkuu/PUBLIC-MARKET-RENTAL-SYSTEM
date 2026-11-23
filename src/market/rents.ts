/* Monthly rent, set at two levels.

   A section has a rate: what every stall in it pays unless told otherwise.
   It starts at the Section 43 figure kept beside the section's code in
   ./directory.ts, and the office can change it from Stall Management.

   A stall can carry its own rate instead (`ownRent`), for a corner stall, a
   double stall or anything the office has agreed separately. An individual
   rate always wins: changing the section rate passes over those stalls.
   `ownRent` of 0 means the stall follows its section.

   The tenant record keeps the rent actually charged (`rent`), which is what
   the rent roll and receipts read. The helpers here keep that figure in step
   with the stall and section it comes from. Payments already recorded hold
   their own amount, so none of this rewrites a past month. */

import { SECTION_LIST, sectionByCode, rateForStallId } from './directory.ts';

export type SectionRent = { id: string; rent: number };

type StallLike = { id: string; section: string; ownRent?: number };
type TenantLike = { stallId: string; rent: number };

const amount = (v: unknown) => {
  const n = Math.round(Number(v) * 100) / 100;
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/** The Section 43 rates, one row per directory section. */
export function defaultSectionRents(): SectionRent[] {
  return SECTION_LIST.map((s) => ({ id: s.name, rent: s.rate }));
}

/**
 * Section rates read back from storage or a backup. Every directory section is
 * present (a section the saved list lacks takes its Section 43 rate), and a
 * section the office added beyond the directory is kept.
 */
export function normalizeSectionRents(raw: unknown): SectionRent[] {
  const saved = new Map<string, number>();
  if (Array.isArray(raw)) {
    for (const row of raw) {
      const id = row && typeof row === 'object' && typeof (row as SectionRent).id === 'string' ? (row as SectionRent).id.trim() : '';
      if (id && !saved.has(id)) saved.set(id, amount((row as SectionRent).rent));
    }
  }
  const list = defaultSectionRents().map((d) => (saved.has(d.id) ? { id: d.id, rent: saved.get(d.id)! } : d));
  saved.forEach((rent, id) => { if (!list.some((r) => r.id === id)) list.push({ id, rent }); });
  return list;
}

/** The rate a section charges, or 0 when none is set. */
export function sectionRate(rates: SectionRent[], section: string): number {
  const row = rates.find((r) => r.id === section);
  if (row) return row.rent;
  return SECTION_LIST.find((s) => s.name === section)?.rate ?? 0;
}

/** The section rate for a stall ID, read off its prefix (KS-4 → Kakanin). */
export function sectionRateForStallId(rates: SectionRent[], stallId: string): number {
  const section = sectionByCode(stallId.slice(0, 2))?.name;
  return section ? sectionRate(rates, section) : rateForStallId(stallId);
}

/** What a stall pays each month: its own rate if it has one, else its section's. */
export function stallRent(rates: SectionRent[], stall: StallLike): number {
  const own = amount(stall.ownRent);
  return own > 0 ? own : sectionRate(rates, stall.section);
}

/** True when the stall carries a rate of its own rather than its section's. */
export function hasOwnRent(stall: StallLike): boolean {
  return amount(stall.ownRent) > 0;
}

/**
 * The `ownRent` a stall should carry when its rent is set to `rent`. A figure
 * equal to the section rate is not an individual rate: the stall goes back to
 * following its section, so a later section change still reaches it.
 */
export function ownRentFor(rates: SectionRent[], section: string, rent: number): number {
  const value = amount(rent);
  return value === sectionRate(rates, section) ? 0 : value;
}

/**
 * Sets a section's rate and brings every tenant on a stall that follows the
 * section up to it. Stalls with their own rate are left as they are. Returns
 * the new rates, the new tenant list, and the IDs of the stalls whose tenants
 * changed.
 */
export function applySectionRate<T extends TenantLike>(
  rates: SectionRent[], stalls: StallLike[], tenants: T[], section: string, rent: number,
): { rates: SectionRent[]; tenants: T[]; changed: string[]; kept: string[] } {
  const value = amount(rent);
  const nextRates = rates.some((r) => r.id === section)
    ? rates.map((r) => (r.id === section ? { ...r, rent: value } : r))
    : [...rates, { id: section, rent: value }];
  const inSection = stalls.filter((s) => s.section === section);
  const following = new Set(inSection.filter((s) => !hasOwnRent(s)).map((s) => s.id));
  const kept = inSection.filter((s) => hasOwnRent(s)).map((s) => s.id);
  const changed: string[] = [];
  const nextTenants = tenants.map((t) => {
    if (!following.has(t.stallId) || t.rent === value) return t;
    changed.push(t.stallId);
    return { ...t, rent: value };
  });
  return { rates: nextRates, tenants: nextTenants, changed, kept };
}

/**
 * Stalls saved before individual rates existed carry none. Where a tenant's
 * rent already differs from the section rate — set by hand on the tenant
 * record — that figure becomes the stall's own rate, so it is shown as an
 * individual rate and a section change does not overwrite it.
 */
export function adoptTenantRents<S extends StallLike>(rates: SectionRent[], stalls: S[], tenants: TenantLike[]): S[] {
  const rentByStall = new Map(tenants.map((t) => [t.stallId, t.rent]));
  return stalls.map((s) => {
    if (s.ownRent !== undefined && s.ownRent !== null) return s;
    const rent = rentByStall.get(s.id);
    const own = rent !== undefined && rent > 0 ? ownRentFor(rates, s.section, rent) : 0;
    return { ...s, ownRent: own };
  });
}
