import { FACILITY_IDS } from './photoLayout';
import type { PhotoArea } from './photoLayout';
import { registerName } from './registerNames';

type Owned = { id: string; area: PhotoArea; number: number; status: string; tenant: string };

/* Who the map names on a stall: the facility it is, VACANT, or the tenant as the
   register writes them. Placeholders such as "(no name on the list)" are shown
   as they are rather than reordered like a name. */
export function ownerLabel(s: Owned): string {
  if (FACILITY_IDS.has(s.id)) return 'PNP / GUARD STATION';
  if (s.area !== 'upper' && s.number >= 207) return 'NO NAME ON SHEET';
  if (s.status === 'Available') return 'VACANT';
  const tenant = s.tenant.trim();
  if (!tenant || tenant.startsWith('(')) return (tenant || 'No name recorded').toUpperCase();
  return registerName(tenant);
}

/* Whether the sheet draws this position as part of a shared strip rather than
   a partitioned stall (ground floor, dried fish/eggs). */
export function isSharedStrip(s: { area: PhotoArea; number: number }): boolean {
  return s.area === 'produce' && (s.number >= 173 && s.number <= 179 || s.number >= 207);
}

/* Lower-case, without accents, so "redona" finds REDOÑA. */
export function searchKey(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}
