/* The Lease of Contract Agreement a tenant signs with the market office for a
   stall. It belongs to the tenancy, not the stall: a new tenant on the same
   stall signs a new contract, and when a tenancy ends its lease is kept with
   the ended record. The stall record shows the lease of whoever holds it now.

   Every field may be blank: most tenancies in the register were opened from
   the stall directory before any contract was keyed in, and a blank lease
   reads as "No lease on file" rather than as an expired one. */

export type Lease = {
  /** The number written on the signed contract. */
  contractNo: string;
  /** The day the contract was signed. YYYY-MM-DD, or blank. */
  dateSigned: string;
  /** The first day the contract covers. YYYY-MM-DD, or blank. */
  startDate: string;
  /** The last day the contract covers. YYYY-MM-DD, or blank. */
  endDate: string;
  /** Anything else the office wants kept with it. */
  remarks: string;
};

export type LeaseStatus = 'No Lease on File' | 'Active' | 'Expiring' | 'Expired' | 'Not Yet Started';

export const LEASE_STATUSES: LeaseStatus[] = ['Active', 'Expiring', 'Expired', 'Not Yet Started', 'No Lease on File'];

/** How many days before its end date a lease is flagged for renewal. */
export const LEASE_EXPIRING_DAYS = 30;

export const BLANK_LEASE: Lease = { contractNo: '', dateSigned: '', startDate: '', endDate: '', remarks: '' };

const isDay = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

/** A lease read back from storage or an old backup. Anything missing or malformed is blank. */
export function normalizeLease(raw: unknown): Lease {
  const loose = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof Lease, unknown>>;
  return {
    contractNo: text(loose.contractNo),
    dateSigned: isDay(loose.dateSigned) ? loose.dateSigned : '',
    startDate: isDay(loose.startDate) ? loose.startDate : '',
    endDate: isDay(loose.endDate) ? loose.endDate : '',
    remarks: text(loose.remarks),
  };
}

/** True when nothing at all has been recorded for the lease. */
export function leaseIsBlank(lease: Lease): boolean {
  return !lease.contractNo && !lease.dateSigned && !lease.startDate && !lease.endDate && !lease.remarks;
}

/** Whole days from `fromIso` to `toIso` (negative when `toIso` is earlier). */
export function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.UTC(+fromIso.slice(0, 4), +fromIso.slice(5, 7) - 1, +fromIso.slice(8, 10));
  const b = Date.UTC(+toIso.slice(0, 4), +toIso.slice(5, 7) - 1, +toIso.slice(8, 10));
  return Math.round((b - a) / 86_400_000);
}

/**
 * Where a lease stands on `today` (YYYY-MM-DD). A lease is on file once it has
 * a contract number or an end date. With no end date it is taken as running;
 * the end date itself is still covered, so a lease ending today is Expiring,
 * and Expired from the day after.
 */
export function leaseStatus(lease: Lease, today: string): LeaseStatus {
  if (!lease.contractNo && !lease.endDate) return 'No Lease on File';
  if (lease.startDate && daysBetween(today, lease.startDate) > 0) return 'Not Yet Started';
  if (!lease.endDate) return 'Active';
  const left = daysBetween(today, lease.endDate);
  if (left < 0) return 'Expired';
  if (left <= LEASE_EXPIRING_DAYS) return 'Expiring';
  return 'Active';
}

/** A problem with the dates as typed, or '' when they are fine. */
export function leaseProblem(lease: Lease): string {
  if (lease.startDate && lease.endDate && daysBetween(lease.startDate, lease.endDate) < 0) {
    return 'The lease end date cannot be earlier than its start date.';
  }
  return '';
}

/** The term as people say it: "1 year", "6 months", "1 year 6 months". '' without both dates. */
export function leaseTerm(lease: Lease): string {
  if (!lease.startDate || !lease.endDate || leaseProblem(lease)) return '';
  // A contract from 1 Jan to 31 Dec is a year, so the end day counts.
  const [sy, sm, sd] = lease.startDate.split('-').map(Number);
  const end = new Date(Date.UTC(+lease.endDate.slice(0, 4), +lease.endDate.slice(5, 7) - 1, +lease.endDate.slice(8, 10) + 1));
  let months = (end.getUTCFullYear() - sy) * 12 + (end.getUTCMonth() + 1 - sm);
  if (end.getUTCDate() < sd) months -= 1;
  if (months <= 0) {
    const days = daysBetween(lease.startDate, lease.endDate) + 1;
    return `${days} day${days === 1 ? '' : 's'}`;
  }
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return [years ? `${years} year${years === 1 ? '' : 's'}` : '', rest ? `${rest} month${rest === 1 ? '' : 's'}` : ''].filter(Boolean).join(' ');
}
