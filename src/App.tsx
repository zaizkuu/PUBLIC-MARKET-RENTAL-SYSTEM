import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import {
  loadStored, persist, clearStored,
  usingDatabase, backendName, databaseStats, backupDatabase, checkIntegrity,
  revealDataFolder, formatBytes,
} from './db';
import type { DatabaseStats, IdCounters } from './db';

/* ============================================================
   Types
   ============================================================ */

type ModuleKey =
  | 'dashboard'
  | 'stalls'
  | 'tenants'
  | 'applicants'
  | 'utilities'
  | 'violations'
  | 'analytics'
  | 'logbook'
  | 'officers'
  | 'settings'
  | 'support';

/* 'No BP' is a sitting stallholder the occupancy survey marked X in the WITH
   BP column — trading without a business permit. It is not a stage of an
   application, it is a compliance flag that clears when the permit is filed. */
type ApplicantStatus = 'Pending Review' | 'Incomplete' | 'Approved' | 'Rejected' | 'No BP';
/* 'Temporarily Closed' and 'Abandoned' come straight off the occupancy sheet:
   a closed stall is still held by its tenant, an abandoned one is not yet
   released. Neither is Available — the stall cannot be reassigned as it stands. */
type StallStatus = 'Occupied' | 'Available' | 'Maintenance' | 'Temporarily Closed' | 'Closed' | 'Abandoned';

/* Whether a business permit was sighted for the stall on the last survey.
   'Not Recorded' is its own answer — the sheet leaves the column blank. */
type PermitStatus = 'With BP' | 'No BP' | 'Not Recorded';

type ViolationStatus = 'Open' | 'Resolved';

type UtilityType = 'Electricity' | 'Water';
type BillStatus = 'Unpaid' | 'Paid';

/* Rent standing for one month. 'Overdue' is not a state anyone sets — it is
   what 'Unpaid' becomes once the due date has passed. */
type RentStatus = 'Paid' | 'Unpaid' | 'Overdue';

/* One receipt on a sheet. `label` names which copy it is when the same bill is
   printed more than once (tenant's, office's); it is blank when a sheet is
   carrying four different bills. */
type PrintReceipt = { bill: UtilityBill; label: string };

/* `single` distinguishes one bill printed in several copies from a batch of
   different bills tiled onto the same sheets. */
type PrintRequest = { bills: UtilityBill[]; single: boolean };

/* ---------- Stall / space verification ----------

   The slip the market office hands a stallholder to take to the licensing
   office. It is what says the stall is really theirs, that the rent and the
   utilities are settled, and that nothing is outstanding against it — the
   licensing office will not issue or renew a business permit without one.

   Whether it is a first permit or a renewal is the same slip with a different
   set of boxes ticked, which is how the paper pad has always worked. */
type VerificationPurpose = 'Issuance' | 'Renewal';

type VerificationSlip = {
  /* The number on the leaf. Its whole point is that a slip presented at the
     licensing office can be traced back to the one this office issued. */
  controlNo: string;
  purpose: VerificationPurpose;
  issuedTo: string;
  section: string;
  stallNo: string;
  /* Which of the checklist lines were ticked, by their exact printed wording. */
  checked: string[];
  /* The write-in on the "Others" line. */
  others: string;
  dateIssued: string;
  validUntil: string;
  issuedBy: string;
};

/* A whole register laid out for paper — every row a page is showing, not the
   ten of them on screen. The active filters carry into the print, so a single
   market section is printed by filtering to it first, which is how the office
   keeps its occupancy sheets. */
type RegisterJob = {
  title: string;
  subtitle: string;
  columns: string[];
  rows: string[][];
  printedAt: string;
};

type ModalType =
  | null
  | 'add-stall' | 'add-applicant' | 'add-tenant' | 'add-log' | 'assign-stall' | 'add-violation'
  | 'add-officer'
  | 'view-stall' | 'view-applicant' | 'view-tenant' | 'view-bill' | 'view-violation'
  | 'view-officer'
  | 'edit-tenant' | 'edit-stall' | 'edit-applicant' | 'edit-violation' | 'edit-officer'
  | 'confirm-logout' | 'confirm-reset' | 'confirm-delete-bill' | 'confirm-delete-stall'
  | 'confirm-delete-tenant' | 'confirm-delete-applicant' | 'confirm-delete-log'
  | 'confirm-delete-violation' | 'confirm-delete-officer';

/* ---------- The market office's own people ----------

   An officer is a seat on the organizational board, not a user account. The
   board is drawn from `reportsTo`, which holds another officer's id, so the
   office arranges its own hierarchy rather than the app assuming one. A seat
   with no name on it is a vacancy the board still has to show. */
type OfficerStatus = 'Active' | 'On Leave' | 'Vacant';

type Officer = {
  id: string;
  name: string;
  position: string;
  office: string;
  /* Another officer's id, or '' for a seat at the head of the board. */
  reportsTo: string;
  phone: string;
  email: string;
  status: OfficerStatus;
  /* When this person took the seat, as YYYY-MM-DD. Blank when not recorded. */
  appointed: string;
};

type Applicant = {
  id: string;
  name: string;
  phone: string;
  /* The stall this record concerns: the vacancy an applicant asked for, or
     the stall a sitting holder already occupies while working off a missing
     requirement. Absent when no particular stall has been settled on. */
  stallId?: string;
  status: ApplicantStatus;
  dateApplied: string;
  requirements: string[];
};

/* A stall may be tended by more than one person — a spouse on market days, a
   hired helper on the rest — so a tenant carries a list of them. */
type Stallkeeper = {
  id: string;
  name: string;
  phone: string;
  relation: string;
  barangay: string;
};

/* One month's rent settled by a tenant. Held on the tenant record under the
   period it settles, so a month can only ever be paid once. */
type RentPayment = {
  period: string;
  paidOn: string;
  /* What was actually collected, kept as its own figure so a later change to
     the monthly rent never rewrites what a past month was paid. Already net of
     `discount` — this is the peso figure that went in the drawer. */
  amount: number;
  /* The early-payment discount taken off, if the month was settled on or
     before its due date. Held separately so a past payment can still show why
     it came to less than the monthly rent, and so changing the discount rate
     later never rewrites what an earlier month was actually given. */
  discount: number;
};

/* The meters serving a tenant's stall, by utility. The number is a property of
   the tenancy, not of any one bill — every bill copies it as it stood. */
type MeterNumbers = Record<UtilityType, string>;

type Tenant = {
  id: string;
  name: string;
  phone: string;
  barangay: string;
  stallId: string;
  section: string;
  rent: number;
  status: string;
  applicantId?: string;
  keepers: Stallkeeper[];
  meters: MeterNumbers;
  /* Day of the month rent falls due, and every month settled so far. */
  rentDueDay: number;
  rentPayments: Record<string, RentPayment>;
};

type Stall = {
  id: string;
  section: string;
  tenant: string;
  status: StallStatus;
  permit: PermitStatus;
  lastInspection: string;
  /* Anything the occupancy sheet noted in the margin — a deceased former
     tenant, a newly issued stall. Empty for most rows. */
  note: string;
};

type Violation = {
  id: string;
  tenant: string;
  issue: string;
  status: ViolationStatus;
  points: number;
  dateRecorded: string;
  dateResolved: string;
  notes: string;
};

type UtilityBill = {
  id: string;
  type: UtilityType;
  stallId: string;
  tenantId: string;
  tenantName: string;
  section: string;
  /* The meter the readings came off, copied from the tenant record when the
     bill is raised so the receipt can be traced back to a physical meter. */
  meterNumber: string;
  /* `period` is the YYYY-MM the bill belongs to — it groups and de-duplicates
     bills by month. `periodStart`/`periodEnd` are the actual days covered,
     which is what the tenant is shown. */
  period: string;
  periodStart: string;
  periodEnd: string;
  previousReading: number;
  currentReading: number;
  consumption: number;
  rate: number;
  /* `amount` is the usage charge alone (consumption × rate) — the market
     dropped the fixed/service charge, so it no longer has a second component
     to add in. A late surcharge is deliberately not folded in here: it is not
     something a bill is ever "worth" in the record, only something a receipt
     picks up at the moment it happens to be printed past the due date. See
     `surchargeAmount`. */
  amount: number;
  status: BillStatus;
  dateIssued: string;
  dueDate: string;
  notes: string;
};

type LogEntry = {
  id: string;
  date: string;
  time: string;
  type: string;
  details: string;
};

type ActivityItem = {
  id: string;
  icon: string;
  iconColor: string;
  text: string;
  highlight: string;
  time: string;
};

/* ============================================================
   Constants
   ============================================================ */

const ITEMS_PER_PAGE = 10;
const MAX_ACTIVITIES = 50;
const SECTIONS = ['Meat & Poultry', 'Fish & Seafood', 'Vegetables & Fruits', 'Dry Goods'];
const STALL_STATUSES: StallStatus[] = ['Occupied', 'Available', 'Maintenance', 'Temporarily Closed', 'Closed', 'Abandoned'];
const PERMIT_STATUSES: PermitStatus[] = ['With BP', 'No BP', 'Not Recorded'];
/* A stall in one of these states is spoken for — it cannot be let to anyone
   else, whether or not the tenant is trading today. */
const HELD_STATUSES: StallStatus[] = ['Occupied', 'Temporarily Closed', 'Closed', 'Abandoned'];
const countStatus = (stalls: Stall[], status: StallStatus) => stalls.filter((s) => s.status === status).length;
const KEEPER_RELATIONS = ['Self (tenant tends the stall)', 'Spouse', 'Child', 'Parent', 'Sibling', 'Other Relative', 'Hired Helper'];
const LOG_TYPES = ['Inspection', 'Incident', 'Maintenance', 'Collection', 'Announcement'];
const VIOLATION_ISSUES = [
  'Late document submission',
  'Improper stall cleanup',
  'Health code violation',
  'Unpaid rent or utilities',
  'Operating beyond stall boundary',
  'Unauthorized subleasing',
  'Fire safety non-compliance',
  'Obstruction of walkway',
];
/* Records are read and written through ./db — a SQLite database in the desktop
   application, localStorage in a plain browser. */

/* Who last printed a receipt — offered back as the default the next time, so
   the officer on duty types their name once a shift rather than once a bill. */
const printedByKey = 'pmrms-printed-by';

/* Four receipts to an A4 sheet, in two columns of two, cut apart afterwards. */
const RECEIPTS_PER_SHEET = 4;
/* Which copy each of the four is, when one bill is issued in duplicate or more.
   The office keeps its own copy of anything a tenant is handed. */
const RECEIPT_COPY_LABELS = ["Tenant's Copy", 'Market Office Copy', "Treasurer's Copy", 'File Copy'];

/* Print-preview zoom. FIT is the scale at which a whole A4 sheet sits inside
   the dialog; 1 is the sheet at its true printed size, which is what the
   Actual size button snaps to for checking small print on a receipt. */
const FIT_ZOOM = 0.62;
const MIN_ZOOM = 0.35;
const MAX_ZOOM = 2;

/* Four verification slips to an A4 sheet as well, cut apart into a pad. */
const SLIPS_PER_SHEET = 4;

/* Who last issued a verification slip, kept the same way the receipt printer's
   name is — typed once a shift rather than once a slip. */
const verifiedByKey = 'pmrms-verified-by';

/* The checklist, in the order the printed pad has it. The wording is the
   office's own and is reproduced exactly, because a licensing clerk reads the
   slip against the pad they already know — the one correction is "Clearance",
   which the printed pad has misspelled. */
const VERIFICATION_CHECKLIST = [
  'Latest Business Permit (Original)',
  'DTI Registration',
  'OR of Last Monthly Rental Paid',
  'OR of Last Electric/Water Bill Paid',
  "Meat Inspector's Clearance",
  'Existing Lessee',
  'Inspection of Stall',
  'New Lessee',
];

/* What each errand ticks by default. A renewal is an existing lessee proving
   the year just past was paid up; a first issuance is a new lessee whose stall
   has to be inspected before anything is signed. Meat clearance is left to the
   counter either way — it only applies to the meat and poultry section. */
const VERIFICATION_DEFAULTS: Record<VerificationPurpose, string[]> = {
  Renewal: [
    'Latest Business Permit (Original)',
    'OR of Last Monthly Rental Paid',
    'OR of Last Electric/Water Bill Paid',
    'Existing Lessee',
  ],
  Issuance: [
    'DTI Registration',
    'OR of Last Monthly Rental Paid',
    'Inspection of Stall',
    'New Lessee',
  ],
};

/* A slip is good for one week. Long enough to get to the licensing office,
   short enough that the standing it certifies cannot have gone stale — a stall
   can fall behind on rent in a month, so a month-old slip proves nothing. */
const VERIFICATION_VALID_DAYS = 7;

/* ---------- Philippine time ----------

   Every date the system reasons about is Philippine Standard Time, whatever
   the computer itself is set to. A market office in Tanauan should not get a
   different answer about whose rent is overdue because a machine came back
   from repair on the wrong timezone. PST has no daylight saving, so the offset
   never moves; reading it through Intl rather than a fixed +08:00 keeps it
   correct regardless. */
const MARKET_TIME_ZONE = 'Asia/Manila';

const manilaPartsFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: MARKET_TIME_ZONE,
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
});

/* The wall-clock reading in Tanauan right now, broken into parts. */
function manilaParts(when: Date = new Date()): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of manilaPartsFmt.formatToParts(when)) out[part.type] = part.value;
  // hour12:false reports midnight as 24 in some engines; the day has rolled by then.
  if (out.hour === '24') out.hour = '00';
  return out;
}

const manilaDateFmt = new Intl.DateTimeFormat('en-US', { timeZone: MARKET_TIME_ZONE, month: 'short', day: 'numeric', year: 'numeric' });
const manilaTimeFmt = new Intl.DateTimeFormat('en-US', { timeZone: MARKET_TIME_ZONE, hour: '2-digit', minute: '2-digit', hour12: true });
const manilaLongFmt = new Intl.DateTimeFormat('en-PH', { timeZone: MARKET_TIME_ZONE, dateStyle: 'long', timeStyle: 'short' });
/* The clock face in the topbar. */
const clockDateFmt = new Intl.DateTimeFormat('en-PH', { timeZone: MARKET_TIME_ZONE, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const clockTimeFmt = new Intl.DateTimeFormat('en-PH', { timeZone: MARKET_TIME_ZONE, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });

function todayStr() {
  return manilaDateFmt.format(new Date());
}

function nowTimeStr() {
  return manilaTimeFmt.format(new Date());
}

/* A full date and time stamp, for receipts and reports. */
function manilaStamp(when: Date = new Date()) {
  return `${manilaLongFmt.format(when)} PHT`;
}

const DEFAULT_RENT_DUE_DAY = 5;
/* Every month has a 28th, so a due day is never dragged forward in February. */
const MAX_RENT_DUE_DAY = 28;

/* Settling a month's rent on or before its due date earns this much off, as a
   percentage of the monthly rent — the market's incentive for paying early.
   Unlike the utility surcharge, this IS recorded on the payment: a discount
   changes what was actually collected, so the ledger has to hold it. */
const EARLY_RENT_DISCOUNT_PCT = 20;

/* What the office collects before an application is complete. The contract of
   lease is last because it is last in fact: Title VII, Section 31 has the
   successful applicant sign it, so the box is ticked once the signed copy is
   back over the counter, after the rest of the papers are in. Approving an
   application does not wait on it — Approved and Rejected are set by hand and
   `deriveStatus` leaves them alone. */
const REQUIREMENTS = [
  'Business Permit',
  'Barangay Clearance',
  'Community Tax Certificate (Cedula)',
  'Health / Sanitary Permit',
  '2x2 ID Photo',
  'Signed Contract of Lease',
];

const UTILITY_TYPES: UtilityType[] = ['Electricity', 'Water'];

const UTILITY_PRESETS: Record<UtilityType, { rate: number; unit: string; icon: string }> = {
  Electricity: { rate: 11.5, unit: 'kWh', icon: 'bolt' },
  Water: { rate: 25, unit: 'cu.m', icon: 'water_drop' },
};

/* Late-payment surcharge, as a percentage of the bill — the market's fee
   schedule penalizes an overdue electricity connection differently from an
   overdue water one. Kept as the plain percentage (not the 0.0335 fraction)
   so a receipt can print "3.35%" straight off the constant with no rounding
   artifact from multiplying it back out. See `surchargeAmount`. */
const SURCHARGE_RATES: Record<UtilityType, number> = {
  Electricity: 3.35,
  Water: 10,
};

/* ---------- The market office ---------- */

const OFFICER_STATUSES: OfficerStatus[] = ['Active', 'On Leave', 'Vacant'];
/* The offices a market seat can belong to. Free text is allowed on the form —
   this list is only what the picker offers first. */
const OFFICE_UNITS = [
  'Office of the Municipal Mayor',
  'Market Office',
  'Market Board',
  'Municipal Treasurer’s Office',
  'Business Permit & Licensing Office',
  'Municipal Health Office',
  'Municipal Engineering Office',
  'Sangguniang Bayan',
];

/* ---------- Section 43. Market Stall Rates ----------

   The schedule of rates the market charges, transcribed from the ordinance
   sheet. `monthly` is what a stall of that description pays each month; the
   two market-day lines are charged by the day instead, which is why they carry
   no monthly figure.

   Only five of these descriptions correspond to stalls the register currently
   holds (fish, meat, chicken, fruit & vegetable, kakanin). The rest are kept
   because they are the office's own schedule and the stalls exist on the
   ground, whether or not a row has been opened for them yet. */
const STALL_RATE_SCHEDULE: Array<{
  description: string;
  stalls: number | null;
  area: string;
  perSqM: number | null;
  monthly: number | null;
  perMarketDay?: number;
}> = [
  { description: 'Peripheral stalls', stalls: 83, area: '25 sq. meters', perSqM: 180, monthly: 4000 },
  { description: 'Corner stall at peripheral', stalls: 5, area: '25 sq. meters', perSqM: 200, monthly: 5000 },
  { description: 'Fish stalls', stalls: 94, area: '1.2 sq. meters', perSqM: null, monthly: 800 },
  { description: 'Meat stalls', stalls: 46, area: '1.8 sq. meters', perSqM: null, monthly: 1000 },
  { description: 'Fruit & vegetable stalls', stalls: 64, area: '1m x 1.8m', perSqM: null, monthly: 500 },
  { description: 'Kakanin stalls (local delicacies)', stalls: 18, area: '1m x 1.8m', perSqM: null, monthly: 500 },
  { description: 'Lechon', stalls: 16, area: '.7m x 1.25m', perSqM: null, monthly: 1000 },
  { description: 'Dried fish and eggs', stalls: 12, area: '1m x 1.8m', perSqM: null, monthly: 500 },
  { description: 'Ground & 2nd floor agora', stalls: 2, area: '330 sq. meters', perSqM: 300, monthly: 99000 },
  { description: 'Dry goods', stalls: 46, area: '9 sq. meters', perSqM: 166.67, monthly: 1500 },
  { description: 'Tents (during market days)', stalls: null, area: '', perSqM: null, monthly: null, perMarketDay: 100 },
  { description: 'Tables (during market days)', stalls: null, area: '', perSqM: null, monthly: null, perMarketDay: 40 },
];

/* The monthly rate a stall pays, worked out from its number. Chicken stalls
   are charged as meat stalls, which is how the schedule lists them. */
const STALL_PREFIX_RATE: Record<string, number> = {
  FS: 800,    // Fish stalls
  MS: 1000,   // Meat stalls
  CS: 1000,   // Chicken, charged as meat
  FV: 500,    // Fruit & vegetable stalls
  KK: 500,    // Kakanin
};

function monthlyRentForStall(stallId: string): number {
  return STALL_PREFIX_RATE[stallId.slice(0, 2).toUpperCase()] ?? 0;
}

/* ============================================================
   Initial Data
   ============================================================ */

/* The register opens on the 2026 Status of Market Occupancy surveys for
   Tanauan, Leyte — Meat Section (July 20, 2026), Kakanin (July 21, 2026),
   Fish Section (July 22, 2026) and Fruits & Vegetable Section (July 23, 2026).
   Every stall below is a row of one of those sheets; nothing here is
   illustrative. The Kakanin sheet is filed under Dry Goods, which is why its
   stalls keep a KK- number and say so in their note. */

const initialState = {
  applicants: [] as Applicant[],
  tenants: [
    { id: 'TEN-001', name: 'LOTEYRO, LEEMAR', phone: '', stallId: 'MS-01', section: 'Meat & Poultry', rent: 1000, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-002', name: 'LIPAYON, LORENA', phone: '', stallId: 'MS-02', section: 'Meat & Poultry', rent: 1000, status: 'Temporarily Closed', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-003', name: 'EMOYLAN, CAROLINE', phone: '', stallId: 'MS-03', section: 'Meat & Poultry', rent: 1000, status: 'Temporarily Closed', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-004', name: 'BORREL, FERDINAND', phone: '', stallId: 'MS-04', section: 'Meat & Poultry', rent: 1000, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-005', name: 'GAMEZ, GEMMA BERDAN', phone: '', stallId: 'MS-05', section: 'Meat & Poultry', rent: 1000, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-006', name: 'SALVE, NIDA MONTE', phone: '', stallId: 'MS-06', section: 'Meat & Poultry', rent: 1000, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-007', name: 'SALVE, NIDA MONTE', phone: '', stallId: 'MS-07', section: 'Meat & Poultry', rent: 1000, status: 'Temporarily Closed', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-008', name: 'GEVEN, MA. FATIMA VALLER', phone: '', stallId: 'MS-08', section: 'Meat & Poultry', rent: 1000, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-009', name: 'AUCILA, GILBERT NIRZA', phone: '', stallId: 'MS-09', section: 'Meat & Poultry', rent: 1000, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-010', name: 'CAMERO, DESIDERIO NUEVAS', phone: '', stallId: 'MS-12', section: 'Meat & Poultry', rent: 1000, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-011', name: 'BANEZ, CELESTE A', phone: '', stallId: 'MS-17', section: 'Meat & Poultry', rent: 1000, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-012', name: 'RIZALDO BIGOY', phone: '', stallId: 'MS-20', section: 'Meat & Poultry', rent: 1000, status: 'Abandoned', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-013', name: 'LIPAYON, GERRY INDIC', phone: '', stallId: 'MS-21', section: 'Meat & Poultry', rent: 1000, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-014', name: 'EMOYLAN, CAROLINE ALMERIA', phone: '', stallId: 'MS-22', section: 'Meat & Poultry', rent: 1000, status: 'Temporarily Closed', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-015', name: 'EMOYLAN, CAROLINE ALMERIA', phone: '', stallId: 'MS-23', section: 'Meat & Poultry', rent: 1000, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-016', name: 'ORINGO, JAIME COBACHA', phone: '', stallId: 'MS-24', section: 'Meat & Poultry', rent: 1000, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-017', name: 'ORINGO, JAIME COBACHA', phone: '', stallId: 'MS-25', section: 'Meat & Poultry', rent: 1000, status: 'Temporarily Closed', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-018', name: 'BIGOY, RONALYN CORRALES', phone: '', stallId: 'MS-27', section: 'Meat & Poultry', rent: 1000, status: 'Temporarily Closed', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-019', name: 'BIGOY, RONALYN CORRALES', phone: '', stallId: 'MS-28', section: 'Meat & Poultry', rent: 1000, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-020', name: 'GEVEN, FATIMA VALLER', phone: '', stallId: 'MS-29', section: 'Meat & Poultry', rent: 1000, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-021', name: 'OGRIMEN, EDUARDO LACE', phone: '', stallId: 'MS-31', section: 'Meat & Poultry', rent: 1000, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-022', name: 'LANZA, LEO CAYUBIT', phone: '', stallId: 'MS-32', section: 'Meat & Poultry', rent: 1000, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-023', name: 'LANZA, LEO CAYUBIT', phone: '', stallId: 'MS-33', section: 'Meat & Poultry', rent: 1000, status: 'Temporarily Closed', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-024', name: 'ALMADEN, MARY ANN KEMPIS', phone: '', stallId: 'MS-34', section: 'Meat & Poultry', rent: 1000, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-025', name: 'ALMADEN, MARY ANN KEMPIS', phone: '', stallId: 'MS-35', section: 'Meat & Poultry', rent: 1000, status: 'Temporarily Closed', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-026', name: 'MAGDUA, CHARLES GODWIN ALMERIA', phone: '', stallId: 'MS-36', section: 'Meat & Poultry', rent: 1000, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-027', name: 'BIGOY, REGIE', phone: '', stallId: 'MS-37', section: 'Meat & Poultry', rent: 1000, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-028', name: 'TERADO, JINGJING MORALITA', phone: '', stallId: 'MS-38', section: 'Meat & Poultry', rent: 1000, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-029', name: 'ODTUHAN, AIZA SONGALIA', phone: '', stallId: 'MS-40', section: 'Meat & Poultry', rent: 1000, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-030', name: 'GERILLA, LEODEGARIO DUMASIG', phone: '', stallId: 'MS-41', section: 'Meat & Poultry', rent: 1000, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-031', name: 'LIPAYON, ROMEO L', phone: '', stallId: 'MS-44', section: 'Meat & Poultry', rent: 1000, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-032', name: 'ARCENA, BABY JANE TOLIBAS', phone: '', stallId: 'CS-01', section: 'Meat & Poultry', rent: 1000, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-033', name: 'ARCENA, BABY JANE TOLIBAS', phone: '', stallId: 'CS-02', section: 'Meat & Poultry', rent: 1000, status: 'Temporarily Closed', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-034', name: 'LONZAGA, MANUEL, JR. AGUIRRE', phone: '', stallId: 'CS-03', section: 'Meat & Poultry', rent: 1000, status: 'Temporarily Closed', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-035', name: 'LONZAGA, MANUEL, JR. AGUIRRE', phone: '', stallId: 'CS-04', section: 'Meat & Poultry', rent: 1000, status: 'Temporarily Closed', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-036', name: 'MAGDUA, ASHLEY SIBYL AGUILLON', phone: '', stallId: 'CS-05', section: 'Meat & Poultry', rent: 1000, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-037', name: 'CERVANTES, JOSE PERCIVAL ESPADA', phone: '', stallId: 'CS-06', section: 'Meat & Poultry', rent: 1000, status: 'Temporarily Closed', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-038', name: 'VILLERO, JETRO FARON', phone: '', stallId: 'CS-07', section: 'Meat & Poultry', rent: 1000, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-039', name: 'VILLERO, JETRO FARON', phone: '', stallId: 'CS-08', section: 'Meat & Poultry', rent: 1000, status: 'Temporarily Closed', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-040', name: 'CERVANTES, SOLEDAD LLEGE', phone: '', stallId: 'CS-09', section: 'Meat & Poultry', rent: 1000, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-041', name: 'CERVANTES, SOLEDAD LLEGE', phone: '', stallId: 'CS-10', section: 'Meat & Poultry', rent: 1000, status: 'Temporarily Closed', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-042', name: 'MAGDUA, ALWIN AMARILLA', phone: '', stallId: 'CS-11', section: 'Meat & Poultry', rent: 1000, status: 'Temporarily Closed', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-043', name: 'DAPITAN, ELAINE ANGELICA ALMERIA', phone: '', stallId: 'CS-12', section: 'Meat & Poultry', rent: 1000, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-044', name: 'DAPITAN, ELAINE ANGELICA ALMERIA', phone: '', stallId: 'CS-13', section: 'Meat & Poultry', rent: 1000, status: 'Temporarily Closed', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-045', name: 'LAURINO, MARITES RABINA', phone: '', stallId: 'CS-14', section: 'Meat & Poultry', rent: 1000, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-046', name: 'MAGDUA, ALWIN AMARILLA', phone: '', stallId: 'CS-16', section: 'Meat & Poultry', rent: 1000, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-047', name: 'MAGDUA, ALWIN AMARILLA', phone: '', stallId: 'CS-17', section: 'Meat & Poultry', rent: 1000, status: 'Temporarily Closed', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-048', name: 'TIZON, ELIZA ALMERIA', phone: '', stallId: 'CS-18', section: 'Meat & Poultry', rent: 1000, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-049', name: 'LANZA, VILMA ALBAO', phone: '', stallId: 'CS-19', section: 'Meat & Poultry', rent: 1000, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-050', name: 'RIPALDA, CHRISTINE MAE FARON', phone: '', stallId: 'CS-20', section: 'Meat & Poultry', rent: 1000, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-051', name: 'RIPALDA, CHRISTINE MAE FARON', phone: '', stallId: 'CS-21', section: 'Meat & Poultry', rent: 1000, status: 'Temporarily Closed', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-052', name: 'LONZAGA, MARTHA MACARAY', phone: '', stallId: 'CS-22', section: 'Meat & Poultry', rent: 1000, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-053', name: 'CINCO, MA. JOCELYN ROSENDE', phone: '', stallId: 'FV-01', section: 'Vegetables & Fruits', rent: 500, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-054', name: 'CINCO, MA. JOCELYN ROSENDE', phone: '', stallId: 'FV-02', section: 'Vegetables & Fruits', rent: 500, status: 'Temporarily Closed', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-055', name: 'SACLAY, JULIETA REDOÑA', phone: '', stallId: 'FV-03', section: 'Vegetables & Fruits', rent: 500, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-056', name: 'SACLAY, JULIETA REDOÑA', phone: '', stallId: 'FV-04', section: 'Vegetables & Fruits', rent: 500, status: 'Temporarily Closed', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-057', name: 'LADAN, MAE MERLYN ANCHITA', phone: '', stallId: 'FV-05', section: 'Vegetables & Fruits', rent: 500, status: 'Temporarily Closed', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-058', name: 'LADAN, MAE MERLYN ANCHITA', phone: '', stallId: 'FV-06', section: 'Vegetables & Fruits', rent: 500, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-059', name: 'LADAN, MAE MERLYN ANCHITA', phone: '', stallId: 'FV-07', section: 'Vegetables & Fruits', rent: 500, status: 'Temporarily Closed', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-060', name: 'LADAN, MAE MERLYN ANCHITA', phone: '', stallId: 'FV-08', section: 'Vegetables & Fruits', rent: 500, status: 'Temporarily Closed', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-061', name: 'CINCO, MA. JACQUILINE ROSENDE', phone: '', stallId: 'FV-09', section: 'Vegetables & Fruits', rent: 500, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-062', name: 'CINCO, MA. JACQUILINE ROSENDE', phone: '', stallId: 'FV-10', section: 'Vegetables & Fruits', rent: 500, status: 'Temporarily Closed', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-063', name: 'CINCO, MA. JACQUILINE ROSENDE', phone: '', stallId: 'FV-11', section: 'Vegetables & Fruits', rent: 500, status: 'Temporarily Closed', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-064', name: 'MARABUT, MYRA SORILA', phone: '', stallId: 'FV-12', section: 'Vegetables & Fruits', rent: 500, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-065', name: 'ESTEMBER, CHERIEMAE HEMBRA', phone: '', stallId: 'FV-13', section: 'Vegetables & Fruits', rent: 500, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-066', name: 'CANAYON, MADELYN SUYOM', phone: '', stallId: 'FV-14', section: 'Vegetables & Fruits', rent: 500, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-067', name: 'CANAYON, MADELYN SUYOM', phone: '', stallId: 'FV-15', section: 'Vegetables & Fruits', rent: 500, status: 'Temporarily Closed', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-068', name: 'MARTOS, SYLVIA', phone: '', stallId: 'FV-16', section: 'Vegetables & Fruits', rent: 500, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-069', name: 'MARTOS, SYLVIA', phone: '', stallId: 'FV-17', section: 'Vegetables & Fruits', rent: 500, status: 'Temporarily Closed', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-070', name: 'PELINO, FLORENTINA ANCHITA', phone: '', stallId: 'FV-18', section: 'Vegetables & Fruits', rent: 500, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-071', name: 'MAGDUA, GENEVIEVE BUHAWE', phone: '', stallId: 'FV-19', section: 'Vegetables & Fruits', rent: 500, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-072', name: 'GUARDAYA, MA. LOURCEL GARCIA', phone: '', stallId: 'FV-20', section: 'Vegetables & Fruits', rent: 500, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-073', name: 'VERTUDES, KATE MARABUT', phone: '', stallId: 'FV-21', section: 'Vegetables & Fruits', rent: 500, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-074', name: 'TELEMBAN, ESMERALDA', phone: '', stallId: 'FV-22', section: 'Vegetables & Fruits', rent: 500, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-075', name: 'SALCEDO, SOFIA MARIE', phone: '', stallId: 'FV-23', section: 'Vegetables & Fruits', rent: 500, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-076', name: 'SALCEDO, SHAINE MARIE HEMBRA', phone: '', stallId: 'FV-24', section: 'Vegetables & Fruits', rent: 500, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-077', name: 'GARCIA, ROBERTO III CORNEJO', phone: '', stallId: 'FV-25', section: 'Vegetables & Fruits', rent: 500, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-078', name: 'CAMPOSANO, LISA MOLINA', phone: '', stallId: 'FV-26', section: 'Vegetables & Fruits', rent: 500, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-079', name: 'ZIALCITA, SHERYL', phone: '', stallId: 'FV-27', section: 'Vegetables & Fruits', rent: 500, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-080', name: 'LAGARTO, MARY JEAN', phone: '', stallId: 'FV-28', section: 'Vegetables & Fruits', rent: 500, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-081', name: 'TOLIBAS, ROSELYN LANTAJO', phone: '', stallId: 'FV-29', section: 'Vegetables & Fruits', rent: 500, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-082', name: 'PARANAS, LYN C', phone: '', stallId: 'FV-30', section: 'Vegetables & Fruits', rent: 500, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-083', name: 'GARCIA, VELMA CINCO', phone: '', stallId: 'FV-31', section: 'Vegetables & Fruits', rent: 500, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-084', name: 'UDTOHAN, NEIL ALBAO', phone: '', stallId: 'FV-32', section: 'Vegetables & Fruits', rent: 500, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-085', name: 'UDTOHAN, NEIL ALBAO', phone: '', stallId: 'FV-33', section: 'Vegetables & Fruits', rent: 500, status: 'Temporarily Closed', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-086', name: 'PODOL, RAMIL M', phone: '', stallId: 'FV-34', section: 'Vegetables & Fruits', rent: 500, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-087', name: 'ALBAO, DARWIN', phone: '', stallId: 'FV-35', section: 'Vegetables & Fruits', rent: 500, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-088', name: 'VILLERO, ESTER FARON', phone: '', stallId: 'FV-36', section: 'Vegetables & Fruits', rent: 500, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-089', name: 'MODESTO, JADE', phone: '', stallId: 'FV-37', section: 'Vegetables & Fruits', rent: 500, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-090', name: 'MODESTO, JADE', phone: '', stallId: 'FV-38', section: 'Vegetables & Fruits', rent: 500, status: 'Temporarily Closed', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-091', name: 'VILLERO, CRISANTA CASIO', phone: '', stallId: 'FV-39', section: 'Vegetables & Fruits', rent: 500, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-092', name: 'PONFERRADA, VICTORINO CINCO', phone: '', stallId: 'FV-40', section: 'Vegetables & Fruits', rent: 500, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-093', name: 'PONFERRADA, VICTORINO CINCO', phone: '', stallId: 'FV-41', section: 'Vegetables & Fruits', rent: 500, status: 'Temporarily Closed', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-094', name: 'RELLONA, EVANGELINE ALBA', phone: '', stallId: 'FV-42', section: 'Vegetables & Fruits', rent: 500, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-095', name: 'ANOS, DIANNE CORRAL', phone: '', stallId: 'FV-43', section: 'Vegetables & Fruits', rent: 500, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-096', name: 'BLASE, MARICEL LASE', phone: '', stallId: 'FV-44', section: 'Vegetables & Fruits', rent: 500, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-097', name: 'AMISTOSO, JONATHAN', phone: '', stallId: 'FV-45', section: 'Vegetables & Fruits', rent: 500, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-098', name: 'DUMALAORON, ESTELITA MESIAS', phone: '', stallId: 'FV-46', section: 'Vegetables & Fruits', rent: 500, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-099', name: 'ROYERAS, FRANCISCO CINCO', phone: '', stallId: 'FV-47', section: 'Vegetables & Fruits', rent: 500, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-100', name: 'CAMINO, CHENEE MARABUT', phone: '', stallId: 'FV-48', section: 'Vegetables & Fruits', rent: 500, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-101', name: 'CAMINO, CHENEE MARABUT', phone: '', stallId: 'FV-49', section: 'Vegetables & Fruits', rent: 500, status: 'Temporarily Closed', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-102', name: 'MARABUT, MYLENE SORILA', phone: '', stallId: 'FV-50', section: 'Vegetables & Fruits', rent: 500, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-103', name: 'MARABUT, MYLENE SORILA', phone: '', stallId: 'FV-51', section: 'Vegetables & Fruits', rent: 500, status: 'Temporarily Closed', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-104', name: 'MENAYA, ROY G', phone: '', stallId: 'FV-52', section: 'Vegetables & Fruits', rent: 500, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-105', name: 'MENAYA, ROY G', phone: '', stallId: 'FV-53', section: 'Vegetables & Fruits', rent: 500, status: 'Temporarily Closed', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-106', name: 'NERJA, NERLY ANDO', phone: '', stallId: 'FV-54', section: 'Vegetables & Fruits', rent: 500, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-107', name: 'NERJA, NERLY ANDO', phone: '', stallId: 'FV-55', section: 'Vegetables & Fruits', rent: 500, status: 'Temporarily Closed', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-108', name: 'CATAN, ROSARIO V.', phone: '', stallId: 'FV-56', section: 'Vegetables & Fruits', rent: 500, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-109', name: 'DANGCO, JAMEL ROSE PEREZ', phone: '', stallId: 'FV-57', section: 'Vegetables & Fruits', rent: 500, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-110', name: 'BOCO, ORFIEL RECOTE', phone: '', stallId: 'FV-58', section: 'Vegetables & Fruits', rent: 500, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-111', name: 'SOLANO, WILSON S', phone: '', stallId: 'FV-59', section: 'Vegetables & Fruits', rent: 500, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-112', name: 'CORDERO, MARIA NILDA P.', phone: '', stallId: 'FV-60', section: 'Vegetables & Fruits', rent: 500, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-113', name: 'CORDERO, MARIA NILDA P.', phone: '', stallId: 'FV-61', section: 'Vegetables & Fruits', rent: 500, status: 'Temporarily Closed', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-114', name: 'YEPES, OSCAR MENDIOLA', phone: '', stallId: 'FV-62', section: 'Vegetables & Fruits', rent: 500, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-115', name: 'YEPES, OSCAR MENDIOLA', phone: '', stallId: 'FV-63', section: 'Vegetables & Fruits', rent: 500, status: 'Temporarily Closed', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-116', name: 'OLGUIRA, ANGEILA MAE L.', phone: '', stallId: 'FV-64', section: 'Vegetables & Fruits', rent: 500, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-117', name: 'OLGUIRA, CARMILO RUEL L.', phone: '', stallId: 'FV-65', section: 'Vegetables & Fruits', rent: 500, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-118', name: 'VILLEGAS, KAREN GRACE M', phone: '', stallId: 'FV-66', section: 'Vegetables & Fruits', rent: 500, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-119', name: 'LAMOSTE, REY CAYANES', phone: '', stallId: 'FV-67', section: 'Vegetables & Fruits', rent: 500, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-120', name: 'ALVAREZ, RUBY DEOANNE MACEDA', phone: '', stallId: 'FV-68', section: 'Vegetables & Fruits', rent: 500, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-121', name: 'BETASOLO, GENEVIEVE TOLIBAS', phone: '', stallId: 'FV-69', section: 'Vegetables & Fruits', rent: 500, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-122', name: 'RECOSANA, ROMEL NOLASCO', phone: '', stallId: 'FV-70', section: 'Vegetables & Fruits', rent: 500, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-123', name: 'BOCO, IVY RICOTE', phone: '', stallId: 'FV-71', section: 'Vegetables & Fruits', rent: 500, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-124', name: 'MARTOS, SYLDY', phone: '', stallId: 'FV-72', section: 'Vegetables & Fruits', rent: 500, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-125', name: 'GASING, NESTOR MAGALLON', phone: '', stallId: 'FV-73', section: 'Vegetables & Fruits', rent: 500, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-126', name: 'GASING, NESTOR MAGALLON', phone: '', stallId: 'FV-74', section: 'Vegetables & Fruits', rent: 500, status: 'Temporarily Closed', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-127', name: 'GASING, NESTOR MAGALLON', phone: '', stallId: 'FV-75', section: 'Vegetables & Fruits', rent: 500, status: 'Temporarily Closed', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-128', name: 'GASING, NESTOR MAGALLON', phone: '', stallId: 'FV-76', section: 'Vegetables & Fruits', rent: 500, status: 'Temporarily Closed', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-129', name: 'LANCANAN, ISABELITA BALMES', phone: '', stallId: 'FV-77', section: 'Vegetables & Fruits', rent: 500, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-130', name: 'OPERIO, JENEFER CHUCA', phone: '', stallId: 'FV-78', section: 'Vegetables & Fruits', rent: 500, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-131', name: 'OPERIO, JENEFER CHUCA', phone: '', stallId: 'FV-79', section: 'Vegetables & Fruits', rent: 500, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-132', name: 'CAIMOY, GENEVIEVE OPERIO', phone: '', stallId: 'FV-80', section: 'Vegetables & Fruits', rent: 500, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-133', name: 'GARCIA, ROBERTO II CORNEJO', phone: '', stallId: 'FV-81', section: 'Vegetables & Fruits', rent: 500, status: 'Closed', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-134', name: 'GARCIA, ROBERTO II CORNEJO', phone: '', stallId: 'FV-82', section: 'Vegetables & Fruits', rent: 500, status: 'Closed', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-135', name: 'GARCIA, ROBERTO II CORNEJO', phone: '', stallId: 'FV-83', section: 'Vegetables & Fruits', rent: 500, status: 'Closed', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-136', name: 'PEPITO, ROSELYN RICARTE', phone: '', stallId: 'FV-84', section: 'Vegetables & Fruits', rent: 500, status: 'Closed', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-137', name: 'PEPITO, ROSELYN RICARTE', phone: '', stallId: 'FV-85', section: 'Vegetables & Fruits', rent: 500, status: 'Closed', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-138', name: 'MENDIOLA, ALDWIN G.', phone: '', stallId: 'FV-86', section: 'Vegetables & Fruits', rent: 500, status: 'Closed', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-139', name: 'MENDIOLA, ALDWIN G.', phone: '', stallId: 'FV-87', section: 'Vegetables & Fruits', rent: 500, status: 'Closed', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-140', name: 'DUQUILLA, IRENE TESTON', phone: '', stallId: 'FV-88', section: 'Vegetables & Fruits', rent: 500, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-141', name: 'BASIHAN, JOSEPHINE', phone: '', stallId: 'FV-89', section: 'Vegetables & Fruits', rent: 500, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-142', name: 'DUZON, DULCE CORAZON TAYANES', phone: '', stallId: 'FS-01', section: 'Fish & Seafood', rent: 800, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-143', name: 'MORANTE, ELSA TAYANES', phone: '', stallId: 'FS-02', section: 'Fish & Seafood', rent: 800, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-144', name: 'CREER, HERSHEY', phone: '', stallId: 'FS-03', section: 'Fish & Seafood', rent: 800, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-145', name: 'CREER, HERSHEY', phone: '', stallId: 'FS-04', section: 'Fish & Seafood', rent: 800, status: 'Temporarily Closed', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-146', name: 'ESPADA, EVELYN BALTAZAR', phone: '', stallId: 'FS-05', section: 'Fish & Seafood', rent: 800, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-147', name: 'CRISOLOGO, CRISPIN SINDAY', phone: '', stallId: 'FS-06', section: 'Fish & Seafood', rent: 800, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-148', name: 'SABALZA, DARLYNA', phone: '', stallId: 'FS-07', section: 'Fish & Seafood', rent: 800, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-149', name: 'PALABIO, FRANCISCO GHRAY JR. ORDAME', phone: '', stallId: 'FS-08', section: 'Fish & Seafood', rent: 800, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-150', name: 'MONSAGA, MICHELLE LERIOS', phone: '', stallId: 'FS-09', section: 'Fish & Seafood', rent: 800, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-151', name: 'ORDAME, RINE LERIOS', phone: '', stallId: 'FS-10', section: 'Fish & Seafood', rent: 800, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-152', name: 'ORDAME, RICARDO LERIOS', phone: '', stallId: 'FS-11', section: 'Fish & Seafood', rent: 800, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-153', name: 'LAURENTE, KAREN CALIPAYAN', phone: '', stallId: 'FS-12', section: 'Fish & Seafood', rent: 800, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-154', name: 'COSTIMIANO, BENECIO', phone: '', stallId: 'FS-13', section: 'Fish & Seafood', rent: 800, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-155', name: 'LABRADO, RESHILE', phone: '', stallId: 'FS-14', section: 'Fish & Seafood', rent: 800, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-156', name: 'GERILLA, JOHN DRANDREB', phone: '', stallId: 'FS-15', section: 'Fish & Seafood', rent: 800, status: 'Temporarily Closed', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-157', name: 'GERILLA, JOHN DRANDREB', phone: '', stallId: 'FS-16', section: 'Fish & Seafood', rent: 800, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-158', name: 'ABANO, HAIDE TAYANES', phone: '', stallId: 'FS-17', section: 'Fish & Seafood', rent: 800, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-159', name: 'ABANO, DENNIS ALMADEN', phone: '', stallId: 'FS-18', section: 'Fish & Seafood', rent: 800, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-160', name: 'PLABA, JOVITA', phone: '', stallId: 'FS-19', section: 'Fish & Seafood', rent: 800, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-161', name: 'BARCILLA, LAILA BADE', phone: '', stallId: 'FS-20', section: 'Fish & Seafood', rent: 800, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-162', name: 'ABANAG, ALMA', phone: '', stallId: 'FS-21', section: 'Fish & Seafood', rent: 800, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-163', name: 'ABANAG, DANILO ABADIANO', phone: '', stallId: 'FS-22', section: 'Fish & Seafood', rent: 800, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-164', name: 'ORDAME, CHARINA MELO', phone: '', stallId: 'FS-23', section: 'Fish & Seafood', rent: 800, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-165', name: 'AGUILLON, MARIA CLARISS CAJEPE', phone: '', stallId: 'FS-24', section: 'Fish & Seafood', rent: 800, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-166', name: 'PLABA, PRINCESS CABE', phone: '', stallId: 'FS-25', section: 'Fish & Seafood', rent: 800, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-167', name: 'AGUILLON, SANDRO LABRADO', phone: '', stallId: 'FS-26', section: 'Fish & Seafood', rent: 800, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-168', name: 'CINCO, JANITH ABANO', phone: '', stallId: 'FS-28', section: 'Fish & Seafood', rent: 800, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-169', name: 'CINCO, JANITH ABANO', phone: '', stallId: 'FS-29', section: 'Fish & Seafood', rent: 800, status: 'Temporarily Closed', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-170', name: 'GARCIA, REGINE', phone: '', stallId: 'FS-33', section: 'Fish & Seafood', rent: 800, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-171', name: 'AVILA, DAISY BAHIA', phone: '', stallId: 'FS-34', section: 'Fish & Seafood', rent: 800, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-172', name: 'TAYANES, ARIEL VERUTIAO', phone: '', stallId: 'FS-35', section: 'Fish & Seafood', rent: 800, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-173', name: 'TAYANES, JENNIFER CAINDOY', phone: '', stallId: 'FS-36', section: 'Fish & Seafood', rent: 800, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-174', name: 'ABANDO, KIRBY ASDILLA', phone: '', stallId: 'FS-37', section: 'Fish & Seafood', rent: 800, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-175', name: 'AGUILAR, JOEL FUENTES', phone: '', stallId: 'FS-38', section: 'Fish & Seafood', rent: 800, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-176', name: 'AGUILAR, JOVE', phone: '', stallId: 'FS-39', section: 'Fish & Seafood', rent: 800, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-177', name: 'IMPORTA, SONNY LUIS', phone: '', stallId: 'FS-40', section: 'Fish & Seafood', rent: 800, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-178', name: 'ALBAO, NICANORA LAGO', phone: '', stallId: 'FS-41', section: 'Fish & Seafood', rent: 800, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-179', name: 'AGUILAR, GLENN FUENTES', phone: '', stallId: 'FS-42', section: 'Fish & Seafood', rent: 800, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-180', name: 'AGUILAR, GLORIA', phone: '', stallId: 'FS-43', section: 'Fish & Seafood', rent: 800, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-181', name: 'ABAS, FELISA TIBE', phone: '', stallId: 'FS-44', section: 'Fish & Seafood', rent: 800, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-182', name: 'ABANDO, JOEY B.', phone: '', stallId: 'FS-45', section: 'Fish & Seafood', rent: 800, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-183', name: 'CANDELA, MARILYN ORDAME', phone: '', stallId: 'FS-46', section: 'Fish & Seafood', rent: 800, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-184', name: 'FLORES, MELVIN', phone: '', stallId: 'FS-47', section: 'Fish & Seafood', rent: 800, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-185', name: 'MELO, RENALYN', phone: '', stallId: 'FS-48', section: 'Fish & Seafood', rent: 800, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-186', name: 'MELO, MELBA', phone: '', stallId: 'FS-49', section: 'Fish & Seafood', rent: 800, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-187', name: 'PARDALES, ABELARDO NAPOLES', phone: '', stallId: 'FS-50', section: 'Fish & Seafood', rent: 800, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-188', name: 'BAGUISA, MERLY ABANG', phone: '', stallId: 'FS-51', section: 'Fish & Seafood', rent: 800, status: 'Temporarily Closed', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-189', name: 'BAGUISA, COLITA ABANAG', phone: '', stallId: 'FS-52', section: 'Fish & Seafood', rent: 800, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-190', name: 'TOMANDA, DANIEL OGARO', phone: '', stallId: 'FS-53', section: 'Fish & Seafood', rent: 800, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-191', name: 'DUZON, MILO LOPEZ', phone: '', stallId: 'FS-54', section: 'Fish & Seafood', rent: 800, status: 'Temporarily Closed', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-192', name: 'DE LA CRUZ, LYZA/CORAZON AVILA', phone: '', stallId: 'FS-55', section: 'Fish & Seafood', rent: 800, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-193', name: 'DE LA CRUZ, LYZA/CORAZON AVILA', phone: '', stallId: 'FS-56', section: 'Fish & Seafood', rent: 800, status: 'Temporarily Closed', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-194', name: 'SALAÑO, JEFER JOHN ABON', phone: '', stallId: 'FS-57', section: 'Fish & Seafood', rent: 800, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-195', name: 'UBALDO, NILDA', phone: '', stallId: 'FS-58', section: 'Fish & Seafood', rent: 800, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-196', name: 'VERTUDES, ERIC', phone: '', stallId: 'FS-59', section: 'Fish & Seafood', rent: 800, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-197', name: 'ARELLANO, JOEL ASTILLERO', phone: '', stallId: 'KK-01', section: 'Dry Goods', rent: 500, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-198', name: 'ARELLANO, JOEL ASTILLERO', phone: '', stallId: 'KK-02', section: 'Dry Goods', rent: 500, status: 'Temporarily Closed', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-199', name: 'DUZON, DULCE CORAZON/MELODY TAYANES', phone: '', stallId: 'KK-03', section: 'Dry Goods', rent: 500, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-200', name: 'FLORES, CATHERINE VERONA', phone: '', stallId: 'KK-04', section: 'Dry Goods', rent: 500, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-201', name: 'FLORES, JACQUILINE NOVIO', phone: '', stallId: 'KK-05', section: 'Dry Goods', rent: 500, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-202', name: 'FLORES, JACQUILINE NOVIO', phone: '', stallId: 'KK-06', section: 'Dry Goods', rent: 500, status: 'Temporarily Closed', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-203', name: 'MEDRANO, MARTHY PALARON', phone: '', stallId: 'KK-07', section: 'Dry Goods', rent: 500, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-204', name: 'AGUILLON, MARY JOY DELA CERNA', phone: '', stallId: 'KK-08', section: 'Dry Goods', rent: 500, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-205', name: 'ELARDO, ROSARIO', phone: '', stallId: 'KK-09', section: 'Dry Goods', rent: 500, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-206', name: 'ESLABAN, JULIFE PERALTA', phone: '', stallId: 'KK-10', section: 'Dry Goods', rent: 500, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-207', name: 'REDONA, NARCISA', phone: '', stallId: 'KK-11', section: 'Dry Goods', rent: 500, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-208', name: 'PERALTA, ERVIN PAULO MAQUILAN', phone: '', stallId: 'KK-12', section: 'Dry Goods', rent: 500, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-209', name: 'CESAR, RHODORA LAMATA', phone: '', stallId: 'KK-13', section: 'Dry Goods', rent: 500, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-210', name: 'LERIOS, NORIDAN', phone: '', stallId: 'KK-14', section: 'Dry Goods', rent: 500, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
    { id: 'TEN-211', name: 'MODESTO, JADE', phone: '', stallId: 'KK-15', section: 'Dry Goods', rent: 500, status: 'Active', barangay: '', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: DEFAULT_RENT_DUE_DAY, rentPayments: {} },
  ] satisfies Tenant[] as Tenant[],
  stalls: [
    { id: 'MS-01', section: 'Meat & Poultry', tenant: 'LOTEYRO, LEEMAR', status: 'Occupied' as StallStatus, permit: 'No BP' as PermitStatus, lastInspection: 'Jul 20, 2026', note: '' },
    { id: 'MS-02', section: 'Meat & Poultry', tenant: 'LIPAYON, LORENA', status: 'Temporarily Closed' as StallStatus, permit: 'Not Recorded' as PermitStatus, lastInspection: 'Jul 20, 2026', note: '' },
    { id: 'MS-03', section: 'Meat & Poultry', tenant: 'EMOYLAN, CAROLINE', status: 'Temporarily Closed' as StallStatus, permit: 'Not Recorded' as PermitStatus, lastInspection: 'Jul 20, 2026', note: '' },
    { id: 'MS-04', section: 'Meat & Poultry', tenant: 'BORREL, FERDINAND', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 20, 2026', note: '' },
    { id: 'MS-05', section: 'Meat & Poultry', tenant: 'GAMEZ, GEMMA BERDAN', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 20, 2026', note: '' },
    { id: 'MS-06', section: 'Meat & Poultry', tenant: 'SALVE, NIDA MONTE', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 20, 2026', note: '' },
    { id: 'MS-07', section: 'Meat & Poultry', tenant: 'SALVE, NIDA MONTE', status: 'Temporarily Closed' as StallStatus, permit: 'Not Recorded' as PermitStatus, lastInspection: 'Jul 20, 2026', note: '' },
    { id: 'MS-08', section: 'Meat & Poultry', tenant: 'GEVEN, MA. FATIMA VALLER', status: 'Occupied' as StallStatus, permit: 'No BP' as PermitStatus, lastInspection: 'Jul 20, 2026', note: '' },
    { id: 'MS-09', section: 'Meat & Poultry', tenant: 'AUCILA, GILBERT NIRZA', status: 'Occupied' as StallStatus, permit: 'Not Recorded' as PermitStatus, lastInspection: 'Jul 20, 2026', note: '' },
    { id: 'MS-10', section: 'Meat & Poultry', tenant: 'Vacant', status: 'Available' as StallStatus, permit: 'Not Recorded' as PermitStatus, lastInspection: '-', note: '' },
    { id: 'MS-11', section: 'Meat & Poultry', tenant: 'Vacant', status: 'Available' as StallStatus, permit: 'Not Recorded' as PermitStatus, lastInspection: '-', note: '' },
    { id: 'MS-12', section: 'Meat & Poultry', tenant: 'CAMERO, DESIDERIO NUEVAS', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 20, 2026', note: '' },
    { id: 'MS-13', section: 'Meat & Poultry', tenant: 'Vacant', status: 'Available' as StallStatus, permit: 'Not Recorded' as PermitStatus, lastInspection: '-', note: '' },
    { id: 'MS-14', section: 'Meat & Poultry', tenant: 'Vacant', status: 'Available' as StallStatus, permit: 'Not Recorded' as PermitStatus, lastInspection: '-', note: '' },
    { id: 'MS-15', section: 'Meat & Poultry', tenant: 'Vacant', status: 'Available' as StallStatus, permit: 'Not Recorded' as PermitStatus, lastInspection: '-', note: '' },
    { id: 'MS-16', section: 'Meat & Poultry', tenant: 'Vacant', status: 'Available' as StallStatus, permit: 'Not Recorded' as PermitStatus, lastInspection: '-', note: '' },
    { id: 'MS-17', section: 'Meat & Poultry', tenant: 'BANEZ, CELESTE A', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 20, 2026', note: '' },
    { id: 'MS-18', section: 'Meat & Poultry', tenant: 'Vacant', status: 'Available' as StallStatus, permit: 'Not Recorded' as PermitStatus, lastInspection: '-', note: '' },
    { id: 'MS-19', section: 'Meat & Poultry', tenant: 'Vacant', status: 'Available' as StallStatus, permit: 'Not Recorded' as PermitStatus, lastInspection: '-', note: '' },
    { id: 'MS-20', section: 'Meat & Poultry', tenant: 'RIZALDO BIGOY', status: 'Abandoned' as StallStatus, permit: 'Not Recorded' as PermitStatus, lastInspection: 'Jul 20, 2026', note: 'Recorded on the sheet as ABANDONED; occupant entered as RIZALDO / BIGOY.' },
    { id: 'MS-21', section: 'Meat & Poultry', tenant: 'LIPAYON, GERRY INDIC', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 20, 2026', note: '' },
    { id: 'MS-22', section: 'Meat & Poultry', tenant: 'EMOYLAN, CAROLINE ALMERIA', status: 'Temporarily Closed' as StallStatus, permit: 'Not Recorded' as PermitStatus, lastInspection: 'Jul 20, 2026', note: '' },
    { id: 'MS-23', section: 'Meat & Poultry', tenant: 'EMOYLAN, CAROLINE ALMERIA', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 20, 2026', note: '' },
    { id: 'MS-24', section: 'Meat & Poultry', tenant: 'ORINGO, JAIME COBACHA', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 20, 2026', note: '' },
    { id: 'MS-25', section: 'Meat & Poultry', tenant: 'ORINGO, JAIME COBACHA', status: 'Temporarily Closed' as StallStatus, permit: 'Not Recorded' as PermitStatus, lastInspection: 'Jul 20, 2026', note: '' },
    { id: 'MS-26', section: 'Meat & Poultry', tenant: 'Vacant', status: 'Available' as StallStatus, permit: 'Not Recorded' as PermitStatus, lastInspection: '-', note: 'Former tenant DIORICO — recorded as deceased.' },
    { id: 'MS-27', section: 'Meat & Poultry', tenant: 'BIGOY, RONALYN CORRALES', status: 'Temporarily Closed' as StallStatus, permit: 'Not Recorded' as PermitStatus, lastInspection: 'Jul 20, 2026', note: '' },
    { id: 'MS-28', section: 'Meat & Poultry', tenant: 'BIGOY, RONALYN CORRALES', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 20, 2026', note: '' },
    { id: 'MS-29', section: 'Meat & Poultry', tenant: 'GEVEN, FATIMA VALLER', status: 'Occupied' as StallStatus, permit: 'Not Recorded' as PermitStatus, lastInspection: 'Jul 20, 2026', note: '' },
    { id: 'MS-30', section: 'Meat & Poultry', tenant: 'Vacant', status: 'Available' as StallStatus, permit: 'Not Recorded' as PermitStatus, lastInspection: '-', note: '' },
    { id: 'MS-31', section: 'Meat & Poultry', tenant: 'OGRIMEN, EDUARDO LACE', status: 'Occupied' as StallStatus, permit: 'No BP' as PermitStatus, lastInspection: 'Jul 20, 2026', note: '' },
    { id: 'MS-32', section: 'Meat & Poultry', tenant: 'LANZA, LEO CAYUBIT', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 20, 2026', note: '' },
    { id: 'MS-33', section: 'Meat & Poultry', tenant: 'LANZA, LEO CAYUBIT', status: 'Temporarily Closed' as StallStatus, permit: 'Not Recorded' as PermitStatus, lastInspection: 'Jul 20, 2026', note: '' },
    { id: 'MS-34', section: 'Meat & Poultry', tenant: 'ALMADEN, MARY ANN KEMPIS', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 20, 2026', note: '' },
    { id: 'MS-35', section: 'Meat & Poultry', tenant: 'ALMADEN, MARY ANN KEMPIS', status: 'Temporarily Closed' as StallStatus, permit: 'Not Recorded' as PermitStatus, lastInspection: 'Jul 20, 2026', note: '' },
    { id: 'MS-36', section: 'Meat & Poultry', tenant: 'MAGDUA, CHARLES GODWIN ALMERIA', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 20, 2026', note: '' },
    { id: 'MS-37', section: 'Meat & Poultry', tenant: 'BIGOY, REGIE', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 20, 2026', note: 'Marked New on the sheet.' },
    { id: 'MS-38', section: 'Meat & Poultry', tenant: 'TERADO, JINGJING MORALITA', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 20, 2026', note: '' },
    { id: 'MS-39', section: 'Meat & Poultry', tenant: 'Vacant', status: 'Available' as StallStatus, permit: 'Not Recorded' as PermitStatus, lastInspection: '-', note: '' },
    { id: 'MS-40', section: 'Meat & Poultry', tenant: 'ODTUHAN, AIZA SONGALIA', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 20, 2026', note: '' },
    { id: 'MS-41', section: 'Meat & Poultry', tenant: 'GERILLA, LEODEGARIO DUMASIG', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 20, 2026', note: '' },
    { id: 'MS-42', section: 'Meat & Poultry', tenant: 'Vacant', status: 'Available' as StallStatus, permit: 'Not Recorded' as PermitStatus, lastInspection: '-', note: '' },
    { id: 'MS-43', section: 'Meat & Poultry', tenant: 'Vacant', status: 'Available' as StallStatus, permit: 'Not Recorded' as PermitStatus, lastInspection: '-', note: '' },
    { id: 'MS-44', section: 'Meat & Poultry', tenant: 'LIPAYON, ROMEO L', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 20, 2026', note: '' },
    { id: 'MS-45', section: 'Meat & Poultry', tenant: 'Vacant', status: 'Available' as StallStatus, permit: 'Not Recorded' as PermitStatus, lastInspection: '-', note: '' },
    { id: 'MS-46', section: 'Meat & Poultry', tenant: 'Vacant', status: 'Available' as StallStatus, permit: 'Not Recorded' as PermitStatus, lastInspection: '-', note: '' },
    { id: 'CS-01', section: 'Meat & Poultry', tenant: 'ARCENA, BABY JANE TOLIBAS', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 20, 2026', note: '' },
    { id: 'CS-02', section: 'Meat & Poultry', tenant: 'ARCENA, BABY JANE TOLIBAS', status: 'Temporarily Closed' as StallStatus, permit: 'Not Recorded' as PermitStatus, lastInspection: 'Jul 20, 2026', note: '' },
    { id: 'CS-03', section: 'Meat & Poultry', tenant: 'LONZAGA, MANUEL, JR. AGUIRRE', status: 'Temporarily Closed' as StallStatus, permit: 'Not Recorded' as PermitStatus, lastInspection: 'Jul 20, 2026', note: '' },
    { id: 'CS-04', section: 'Meat & Poultry', tenant: 'LONZAGA, MANUEL, JR. AGUIRRE', status: 'Temporarily Closed' as StallStatus, permit: 'Not Recorded' as PermitStatus, lastInspection: 'Jul 20, 2026', note: '' },
    { id: 'CS-05', section: 'Meat & Poultry', tenant: 'MAGDUA, ASHLEY SIBYL AGUILLON', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 20, 2026', note: '' },
    { id: 'CS-06', section: 'Meat & Poultry', tenant: 'CERVANTES, JOSE PERCIVAL ESPADA', status: 'Temporarily Closed' as StallStatus, permit: 'Not Recorded' as PermitStatus, lastInspection: 'Jul 20, 2026', note: '' },
    { id: 'CS-07', section: 'Meat & Poultry', tenant: 'VILLERO, JETRO FARON', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 20, 2026', note: '' },
    { id: 'CS-08', section: 'Meat & Poultry', tenant: 'VILLERO, JETRO FARON', status: 'Temporarily Closed' as StallStatus, permit: 'Not Recorded' as PermitStatus, lastInspection: 'Jul 20, 2026', note: '' },
    { id: 'CS-09', section: 'Meat & Poultry', tenant: 'CERVANTES, SOLEDAD LLEGE', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 20, 2026', note: '' },
    { id: 'CS-10', section: 'Meat & Poultry', tenant: 'CERVANTES, SOLEDAD LLEGE', status: 'Temporarily Closed' as StallStatus, permit: 'Not Recorded' as PermitStatus, lastInspection: 'Jul 20, 2026', note: '' },
    { id: 'CS-11', section: 'Meat & Poultry', tenant: 'MAGDUA, ALWIN AMARILLA', status: 'Temporarily Closed' as StallStatus, permit: 'Not Recorded' as PermitStatus, lastInspection: 'Jul 20, 2026', note: '' },
    { id: 'CS-12', section: 'Meat & Poultry', tenant: 'DAPITAN, ELAINE ANGELICA ALMERIA', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 20, 2026', note: '' },
    { id: 'CS-13', section: 'Meat & Poultry', tenant: 'DAPITAN, ELAINE ANGELICA ALMERIA', status: 'Temporarily Closed' as StallStatus, permit: 'Not Recorded' as PermitStatus, lastInspection: 'Jul 20, 2026', note: '' },
    { id: 'CS-14', section: 'Meat & Poultry', tenant: 'LAURINO, MARITES RABINA', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 20, 2026', note: '' },
    { id: 'CS-15', section: 'Meat & Poultry', tenant: 'Vacant', status: 'Available' as StallStatus, permit: 'Not Recorded' as PermitStatus, lastInspection: '-', note: '' },
    { id: 'CS-16', section: 'Meat & Poultry', tenant: 'MAGDUA, ALWIN AMARILLA', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 20, 2026', note: '' },
    { id: 'CS-17', section: 'Meat & Poultry', tenant: 'MAGDUA, ALWIN AMARILLA', status: 'Temporarily Closed' as StallStatus, permit: 'Not Recorded' as PermitStatus, lastInspection: 'Jul 20, 2026', note: '' },
    { id: 'CS-18', section: 'Meat & Poultry', tenant: 'TIZON, ELIZA ALMERIA', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 20, 2026', note: '' },
    { id: 'CS-19', section: 'Meat & Poultry', tenant: 'LANZA, VILMA ALBAO', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 20, 2026', note: '' },
    { id: 'CS-20', section: 'Meat & Poultry', tenant: 'RIPALDA, CHRISTINE MAE FARON', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 20, 2026', note: '' },
    { id: 'CS-21', section: 'Meat & Poultry', tenant: 'RIPALDA, CHRISTINE MAE FARON', status: 'Temporarily Closed' as StallStatus, permit: 'Not Recorded' as PermitStatus, lastInspection: 'Jul 20, 2026', note: '' },
    { id: 'CS-22', section: 'Meat & Poultry', tenant: 'LONZAGA, MARTHA MACARAY', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 20, 2026', note: '' },
    { id: 'FV-01', section: 'Vegetables & Fruits', tenant: 'CINCO, MA. JOCELYN ROSENDE', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 23, 2026', note: 'Row 1' },
    { id: 'FV-02', section: 'Vegetables & Fruits', tenant: 'CINCO, MA. JOCELYN ROSENDE', status: 'Temporarily Closed' as StallStatus, permit: 'Not Recorded' as PermitStatus, lastInspection: 'Jul 23, 2026', note: 'Row 1' },
    { id: 'FV-03', section: 'Vegetables & Fruits', tenant: 'SACLAY, JULIETA REDOÑA', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 23, 2026', note: 'Row 1' },
    { id: 'FV-04', section: 'Vegetables & Fruits', tenant: 'SACLAY, JULIETA REDOÑA', status: 'Temporarily Closed' as StallStatus, permit: 'Not Recorded' as PermitStatus, lastInspection: 'Jul 23, 2026', note: 'Row 1' },
    { id: 'FV-05', section: 'Vegetables & Fruits', tenant: 'LADAN, MAE MERLYN ANCHITA', status: 'Temporarily Closed' as StallStatus, permit: 'Not Recorded' as PermitStatus, lastInspection: 'Jul 23, 2026', note: 'Row 2' },
    { id: 'FV-06', section: 'Vegetables & Fruits', tenant: 'LADAN, MAE MERLYN ANCHITA', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 23, 2026', note: 'Row 2' },
    { id: 'FV-07', section: 'Vegetables & Fruits', tenant: 'LADAN, MAE MERLYN ANCHITA', status: 'Temporarily Closed' as StallStatus, permit: 'Not Recorded' as PermitStatus, lastInspection: 'Jul 23, 2026', note: 'Row 2' },
    { id: 'FV-08', section: 'Vegetables & Fruits', tenant: 'LADAN, MAE MERLYN ANCHITA', status: 'Temporarily Closed' as StallStatus, permit: 'Not Recorded' as PermitStatus, lastInspection: 'Jul 23, 2026', note: 'Row 2' },
    { id: 'FV-09', section: 'Vegetables & Fruits', tenant: 'CINCO, MA. JACQUILINE ROSENDE', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 23, 2026', note: 'Row 2' },
    { id: 'FV-10', section: 'Vegetables & Fruits', tenant: 'CINCO, MA. JACQUILINE ROSENDE', status: 'Temporarily Closed' as StallStatus, permit: 'Not Recorded' as PermitStatus, lastInspection: 'Jul 23, 2026', note: 'Row 2' },
    { id: 'FV-11', section: 'Vegetables & Fruits', tenant: 'CINCO, MA. JACQUILINE ROSENDE', status: 'Temporarily Closed' as StallStatus, permit: 'Not Recorded' as PermitStatus, lastInspection: 'Jul 23, 2026', note: 'Row 2' },
    { id: 'FV-12', section: 'Vegetables & Fruits', tenant: 'MARABUT, MYRA SORILA', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 23, 2026', note: 'Row 2' },
    { id: 'FV-13', section: 'Vegetables & Fruits', tenant: 'ESTEMBER, CHERIEMAE HEMBRA', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 23, 2026', note: 'Row 2' },
    { id: 'FV-14', section: 'Vegetables & Fruits', tenant: 'CANAYON, MADELYN SUYOM', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 23, 2026', note: 'Row 2' },
    { id: 'FV-15', section: 'Vegetables & Fruits', tenant: 'CANAYON, MADELYN SUYOM', status: 'Temporarily Closed' as StallStatus, permit: 'Not Recorded' as PermitStatus, lastInspection: 'Jul 23, 2026', note: 'Row 2' },
    { id: 'FV-16', section: 'Vegetables & Fruits', tenant: 'MARTOS, SYLVIA', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 23, 2026', note: 'Row 2' },
    { id: 'FV-17', section: 'Vegetables & Fruits', tenant: 'MARTOS, SYLVIA', status: 'Temporarily Closed' as StallStatus, permit: 'Not Recorded' as PermitStatus, lastInspection: 'Jul 23, 2026', note: 'Row 2' },
    { id: 'FV-18', section: 'Vegetables & Fruits', tenant: 'PELINO, FLORENTINA ANCHITA', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 23, 2026', note: 'Row 2' },
    { id: 'FV-19', section: 'Vegetables & Fruits', tenant: 'MAGDUA, GENEVIEVE BUHAWE', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 23, 2026', note: 'Row 2' },
    { id: 'FV-20', section: 'Vegetables & Fruits', tenant: 'GUARDAYA, MA. LOURCEL GARCIA', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 23, 2026', note: 'Row 2' },
    { id: 'FV-21', section: 'Vegetables & Fruits', tenant: 'VERTUDES, KATE MARABUT', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 23, 2026', note: 'Row 2' },
    { id: 'FV-22', section: 'Vegetables & Fruits', tenant: 'TELEMBAN, ESMERALDA', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 23, 2026', note: 'Row 2' },
    { id: 'FV-23', section: 'Vegetables & Fruits', tenant: 'SALCEDO, SOFIA MARIE', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 23, 2026', note: 'Row 3' },
    { id: 'FV-24', section: 'Vegetables & Fruits', tenant: 'SALCEDO, SHAINE MARIE HEMBRA', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 23, 2026', note: 'Row 3' },
    { id: 'FV-25', section: 'Vegetables & Fruits', tenant: 'GARCIA, ROBERTO III CORNEJO', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 23, 2026', note: 'Row 3' },
    { id: 'FV-26', section: 'Vegetables & Fruits', tenant: 'CAMPOSANO, LISA MOLINA', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 23, 2026', note: 'Row 3' },
    { id: 'FV-27', section: 'Vegetables & Fruits', tenant: 'ZIALCITA, SHERYL', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 23, 2026', note: 'Row 3' },
    { id: 'FV-28', section: 'Vegetables & Fruits', tenant: 'LAGARTO, MARY JEAN', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 23, 2026', note: 'Row 3' },
    { id: 'FV-29', section: 'Vegetables & Fruits', tenant: 'TOLIBAS, ROSELYN LANTAJO', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 23, 2026', note: 'Row 3' },
    { id: 'FV-30', section: 'Vegetables & Fruits', tenant: 'PARANAS, LYN C', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 23, 2026', note: 'Row 3' },
    { id: 'FV-31', section: 'Vegetables & Fruits', tenant: 'GARCIA, VELMA CINCO', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 23, 2026', note: 'Row 3' },
    { id: 'FV-32', section: 'Vegetables & Fruits', tenant: 'UDTOHAN, NEIL ALBAO', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 23, 2026', note: 'Row 3' },
    { id: 'FV-33', section: 'Vegetables & Fruits', tenant: 'UDTOHAN, NEIL ALBAO', status: 'Temporarily Closed' as StallStatus, permit: 'Not Recorded' as PermitStatus, lastInspection: 'Jul 23, 2026', note: 'Row 3' },
    { id: 'FV-34', section: 'Vegetables & Fruits', tenant: 'PODOL, RAMIL M', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 23, 2026', note: 'Row 3' },
    { id: 'FV-35', section: 'Vegetables & Fruits', tenant: 'ALBAO, DARWIN', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 23, 2026', note: 'Row 3' },
    { id: 'FV-36', section: 'Vegetables & Fruits', tenant: 'VILLERO, ESTER FARON', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 23, 2026', note: 'Row 3' },
    { id: 'FV-37', section: 'Vegetables & Fruits', tenant: 'MODESTO, JADE', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 23, 2026', note: 'Row 3' },
    { id: 'FV-38', section: 'Vegetables & Fruits', tenant: 'MODESTO, JADE', status: 'Temporarily Closed' as StallStatus, permit: 'Not Recorded' as PermitStatus, lastInspection: 'Jul 23, 2026', note: 'Row 3' },
    { id: 'FV-39', section: 'Vegetables & Fruits', tenant: 'VILLERO, CRISANTA CASIO', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 23, 2026', note: 'Row 3' },
    { id: 'FV-40', section: 'Vegetables & Fruits', tenant: 'PONFERRADA, VICTORINO CINCO', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 23, 2026', note: 'Row 4' },
    { id: 'FV-41', section: 'Vegetables & Fruits', tenant: 'PONFERRADA, VICTORINO CINCO', status: 'Temporarily Closed' as StallStatus, permit: 'Not Recorded' as PermitStatus, lastInspection: 'Jul 23, 2026', note: 'Row 4' },
    { id: 'FV-42', section: 'Vegetables & Fruits', tenant: 'RELLONA, EVANGELINE ALBA', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 23, 2026', note: 'Row 4' },
    { id: 'FV-43', section: 'Vegetables & Fruits', tenant: 'ANOS, DIANNE CORRAL', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 23, 2026', note: 'Row 4' },
    { id: 'FV-44', section: 'Vegetables & Fruits', tenant: 'BLASE, MARICEL LASE', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 23, 2026', note: 'Row 4' },
    { id: 'FV-45', section: 'Vegetables & Fruits', tenant: 'AMISTOSO, JONATHAN', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 23, 2026', note: 'Row 4' },
    { id: 'FV-46', section: 'Vegetables & Fruits', tenant: 'DUMALAORON, ESTELITA MESIAS', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 23, 2026', note: 'Row 4' },
    { id: 'FV-47', section: 'Vegetables & Fruits', tenant: 'ROYERAS, FRANCISCO CINCO', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 23, 2026', note: 'Row 4' },
    { id: 'FV-48', section: 'Vegetables & Fruits', tenant: 'CAMINO, CHENEE MARABUT', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 23, 2026', note: 'Row 4' },
    { id: 'FV-49', section: 'Vegetables & Fruits', tenant: 'CAMINO, CHENEE MARABUT', status: 'Temporarily Closed' as StallStatus, permit: 'Not Recorded' as PermitStatus, lastInspection: 'Jul 23, 2026', note: 'Row 4' },
    { id: 'FV-50', section: 'Vegetables & Fruits', tenant: 'MARABUT, MYLENE SORILA', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 23, 2026', note: 'Row 4' },
    { id: 'FV-51', section: 'Vegetables & Fruits', tenant: 'MARABUT, MYLENE SORILA', status: 'Temporarily Closed' as StallStatus, permit: 'Not Recorded' as PermitStatus, lastInspection: 'Jul 23, 2026', note: 'Row 4' },
    { id: 'FV-52', section: 'Vegetables & Fruits', tenant: 'MENAYA, ROY G', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 23, 2026', note: 'Row 4' },
    { id: 'FV-53', section: 'Vegetables & Fruits', tenant: 'MENAYA, ROY G', status: 'Temporarily Closed' as StallStatus, permit: 'Not Recorded' as PermitStatus, lastInspection: 'Jul 23, 2026', note: 'Row 4' },
    { id: 'FV-54', section: 'Vegetables & Fruits', tenant: 'NERJA, NERLY ANDO', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 23, 2026', note: 'Row 4' },
    { id: 'FV-55', section: 'Vegetables & Fruits', tenant: 'NERJA, NERLY ANDO', status: 'Temporarily Closed' as StallStatus, permit: 'Not Recorded' as PermitStatus, lastInspection: 'Jul 23, 2026', note: 'Row 4' },
    { id: 'FV-56', section: 'Vegetables & Fruits', tenant: 'CATAN, ROSARIO V.', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 23, 2026', note: 'Row 4' },
    { id: 'FV-57', section: 'Vegetables & Fruits', tenant: 'DANGCO, JAMEL ROSE PEREZ', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 23, 2026', note: 'Row 4' },
    { id: 'FV-58', section: 'Vegetables & Fruits', tenant: 'BOCO, ORFIEL RECOTE', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 23, 2026', note: 'Row 4' },
    { id: 'FV-59', section: 'Vegetables & Fruits', tenant: 'SOLANO, WILSON S', status: 'Occupied' as StallStatus, permit: 'No BP' as PermitStatus, lastInspection: 'Jul 23, 2026', note: 'Row 4' },
    { id: 'FV-60', section: 'Vegetables & Fruits', tenant: 'CORDERO, MARIA NILDA P.', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 23, 2026', note: 'Row 4' },
    { id: 'FV-61', section: 'Vegetables & Fruits', tenant: 'CORDERO, MARIA NILDA P.', status: 'Temporarily Closed' as StallStatus, permit: 'Not Recorded' as PermitStatus, lastInspection: 'Jul 23, 2026', note: 'Row 4' },
    { id: 'FV-62', section: 'Vegetables & Fruits', tenant: 'YEPES, OSCAR MENDIOLA', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 23, 2026', note: 'Row 4' },
    { id: 'FV-63', section: 'Vegetables & Fruits', tenant: 'YEPES, OSCAR MENDIOLA', status: 'Temporarily Closed' as StallStatus, permit: 'Not Recorded' as PermitStatus, lastInspection: 'Jul 23, 2026', note: 'Row 4' },
    { id: 'FV-64', section: 'Vegetables & Fruits', tenant: 'OLGUIRA, ANGEILA MAE L.', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 23, 2026', note: 'Row 4' },
    { id: 'FV-65', section: 'Vegetables & Fruits', tenant: 'OLGUIRA, CARMILO RUEL L.', status: 'Occupied' as StallStatus, permit: 'Not Recorded' as PermitStatus, lastInspection: 'Jul 23, 2026', note: 'Row 4' },
    { id: 'FV-66', section: 'Vegetables & Fruits', tenant: 'VILLEGAS, KAREN GRACE M', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 23, 2026', note: 'Row 4' },
    { id: 'FV-67', section: 'Vegetables & Fruits', tenant: 'LAMOSTE, REY CAYANES', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 23, 2026', note: 'Row 4' },
    { id: 'FV-68', section: 'Vegetables & Fruits', tenant: 'ALVAREZ, RUBY DEOANNE MACEDA', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 23, 2026', note: 'Other' },
    { id: 'FV-69', section: 'Vegetables & Fruits', tenant: 'BETASOLO, GENEVIEVE TOLIBAS', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 23, 2026', note: 'Other' },
    { id: 'FV-70', section: 'Vegetables & Fruits', tenant: 'RECOSANA, ROMEL NOLASCO', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 23, 2026', note: 'Other' },
    { id: 'FV-71', section: 'Vegetables & Fruits', tenant: 'BOCO, IVY RICOTE', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 23, 2026', note: 'Other' },
    { id: 'FV-72', section: 'Vegetables & Fruits', tenant: 'MARTOS, SYLDY', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 23, 2026', note: 'Other' },
    { id: 'FV-73', section: 'Vegetables & Fruits', tenant: 'GASING, NESTOR MAGALLON', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 23, 2026', note: 'Other' },
    { id: 'FV-74', section: 'Vegetables & Fruits', tenant: 'GASING, NESTOR MAGALLON', status: 'Temporarily Closed' as StallStatus, permit: 'Not Recorded' as PermitStatus, lastInspection: 'Jul 23, 2026', note: 'Other' },
    { id: 'FV-75', section: 'Vegetables & Fruits', tenant: 'GASING, NESTOR MAGALLON', status: 'Temporarily Closed' as StallStatus, permit: 'Not Recorded' as PermitStatus, lastInspection: 'Jul 23, 2026', note: 'Other' },
    { id: 'FV-76', section: 'Vegetables & Fruits', tenant: 'GASING, NESTOR MAGALLON', status: 'Temporarily Closed' as StallStatus, permit: 'Not Recorded' as PermitStatus, lastInspection: 'Jul 23, 2026', note: 'Other' },
    { id: 'FV-77', section: 'Vegetables & Fruits', tenant: 'LANCANAN, ISABELITA BALMES', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 23, 2026', note: 'Other' },
    { id: 'FV-78', section: 'Vegetables & Fruits', tenant: 'OPERIO, JENEFER CHUCA', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 23, 2026', note: 'Other' },
    { id: 'FV-79', section: 'Vegetables & Fruits', tenant: 'OPERIO, JENEFER CHUCA', status: 'Occupied' as StallStatus, permit: 'Not Recorded' as PermitStatus, lastInspection: 'Jul 23, 2026', note: 'Other' },
    { id: 'FV-80', section: 'Vegetables & Fruits', tenant: 'CAIMOY, GENEVIEVE OPERIO', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 23, 2026', note: 'Other' },
    { id: 'FV-81', section: 'Vegetables & Fruits', tenant: 'GARCIA, ROBERTO II CORNEJO', status: 'Closed' as StallStatus, permit: 'Not Recorded' as PermitStatus, lastInspection: 'Jul 23, 2026', note: 'Other' },
    { id: 'FV-82', section: 'Vegetables & Fruits', tenant: 'GARCIA, ROBERTO II CORNEJO', status: 'Closed' as StallStatus, permit: 'Not Recorded' as PermitStatus, lastInspection: 'Jul 23, 2026', note: 'Other' },
    { id: 'FV-83', section: 'Vegetables & Fruits', tenant: 'GARCIA, ROBERTO II CORNEJO', status: 'Closed' as StallStatus, permit: 'Not Recorded' as PermitStatus, lastInspection: 'Jul 23, 2026', note: 'Other' },
    { id: 'FV-84', section: 'Vegetables & Fruits', tenant: 'PEPITO, ROSELYN RICARTE', status: 'Closed' as StallStatus, permit: 'Not Recorded' as PermitStatus, lastInspection: 'Jul 23, 2026', note: 'Other' },
    { id: 'FV-85', section: 'Vegetables & Fruits', tenant: 'PEPITO, ROSELYN RICARTE', status: 'Closed' as StallStatus, permit: 'Not Recorded' as PermitStatus, lastInspection: 'Jul 23, 2026', note: 'Other' },
    { id: 'FV-86', section: 'Vegetables & Fruits', tenant: 'MENDIOLA, ALDWIN G.', status: 'Closed' as StallStatus, permit: 'Not Recorded' as PermitStatus, lastInspection: 'Jul 23, 2026', note: 'Other' },
    { id: 'FV-87', section: 'Vegetables & Fruits', tenant: 'MENDIOLA, ALDWIN G.', status: 'Closed' as StallStatus, permit: 'Not Recorded' as PermitStatus, lastInspection: 'Jul 23, 2026', note: 'Other' },
    { id: 'FV-88', section: 'Vegetables & Fruits', tenant: 'DUQUILLA, IRENE TESTON', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 23, 2026', note: 'Other' },
    { id: 'FV-89', section: 'Vegetables & Fruits', tenant: 'BASIHAN, JOSEPHINE', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 23, 2026', note: 'Other' },
    { id: 'FS-01', section: 'Fish & Seafood', tenant: 'DUZON, DULCE CORAZON TAYANES', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 22, 2026', note: '' },
    { id: 'FS-02', section: 'Fish & Seafood', tenant: 'MORANTE, ELSA TAYANES', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 22, 2026', note: '' },
    { id: 'FS-03', section: 'Fish & Seafood', tenant: 'CREER, HERSHEY', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 22, 2026', note: '' },
    { id: 'FS-04', section: 'Fish & Seafood', tenant: 'CREER, HERSHEY', status: 'Temporarily Closed' as StallStatus, permit: 'Not Recorded' as PermitStatus, lastInspection: 'Jul 22, 2026', note: '' },
    { id: 'FS-05', section: 'Fish & Seafood', tenant: 'ESPADA, EVELYN BALTAZAR', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 22, 2026', note: '' },
    { id: 'FS-06', section: 'Fish & Seafood', tenant: 'CRISOLOGO, CRISPIN SINDAY', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 22, 2026', note: '' },
    { id: 'FS-07', section: 'Fish & Seafood', tenant: 'SABALZA, DARLYNA', status: 'Occupied' as StallStatus, permit: 'No BP' as PermitStatus, lastInspection: 'Jul 22, 2026', note: '' },
    { id: 'FS-08', section: 'Fish & Seafood', tenant: 'PALABIO, FRANCISCO GHRAY JR. ORDAME', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 22, 2026', note: '' },
    { id: 'FS-09', section: 'Fish & Seafood', tenant: 'MONSAGA, MICHELLE LERIOS', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 22, 2026', note: '' },
    { id: 'FS-10', section: 'Fish & Seafood', tenant: 'ORDAME, RINE LERIOS', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 22, 2026', note: 'Marked New on the sheet.' },
    { id: 'FS-11', section: 'Fish & Seafood', tenant: 'ORDAME, RICARDO LERIOS', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 22, 2026', note: '' },
    { id: 'FS-12', section: 'Fish & Seafood', tenant: 'LAURENTE, KAREN CALIPAYAN', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 22, 2026', note: '' },
    { id: 'FS-13', section: 'Fish & Seafood', tenant: 'COSTIMIANO, BENECIO', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 22, 2026', note: '' },
    { id: 'FS-14', section: 'Fish & Seafood', tenant: 'LABRADO, RESHILE', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 22, 2026', note: '' },
    { id: 'FS-15', section: 'Fish & Seafood', tenant: 'GERILLA, JOHN DRANDREB', status: 'Temporarily Closed' as StallStatus, permit: 'Not Recorded' as PermitStatus, lastInspection: 'Jul 22, 2026', note: '' },
    { id: 'FS-16', section: 'Fish & Seafood', tenant: 'GERILLA, JOHN DRANDREB', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 22, 2026', note: '' },
    { id: 'FS-17', section: 'Fish & Seafood', tenant: 'ABANO, HAIDE TAYANES', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 22, 2026', note: '' },
    { id: 'FS-18', section: 'Fish & Seafood', tenant: 'ABANO, DENNIS ALMADEN', status: 'Occupied' as StallStatus, permit: 'No BP' as PermitStatus, lastInspection: 'Jul 22, 2026', note: '' },
    { id: 'FS-19', section: 'Fish & Seafood', tenant: 'PLABA, JOVITA', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 22, 2026', note: '' },
    { id: 'FS-20', section: 'Fish & Seafood', tenant: 'BARCILLA, LAILA BADE', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 22, 2026', note: '' },
    { id: 'FS-21', section: 'Fish & Seafood', tenant: 'ABANAG, ALMA', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 22, 2026', note: '' },
    { id: 'FS-22', section: 'Fish & Seafood', tenant: 'ABANAG, DANILO ABADIANO', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 22, 2026', note: '' },
    { id: 'FS-23', section: 'Fish & Seafood', tenant: 'ORDAME, CHARINA MELO', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 22, 2026', note: '' },
    { id: 'FS-24', section: 'Fish & Seafood', tenant: 'AGUILLON, MARIA CLARISS CAJEPE', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 22, 2026', note: '' },
    { id: 'FS-25', section: 'Fish & Seafood', tenant: 'PLABA, PRINCESS CABE', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 22, 2026', note: '' },
    { id: 'FS-26', section: 'Fish & Seafood', tenant: 'AGUILLON, SANDRO LABRADO', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 22, 2026', note: '' },
    { id: 'FS-27', section: 'Fish & Seafood', tenant: 'Vacant', status: 'Available' as StallStatus, permit: 'Not Recorded' as PermitStatus, lastInspection: '-', note: '' },
    { id: 'FS-28', section: 'Fish & Seafood', tenant: 'CINCO, JANITH ABANO', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 22, 2026', note: '' },
    { id: 'FS-29', section: 'Fish & Seafood', tenant: 'CINCO, JANITH ABANO', status: 'Temporarily Closed' as StallStatus, permit: 'Not Recorded' as PermitStatus, lastInspection: 'Jul 22, 2026', note: '' },
    { id: 'FS-30', section: 'Fish & Seafood', tenant: 'Vacant', status: 'Available' as StallStatus, permit: 'Not Recorded' as PermitStatus, lastInspection: '-', note: '' },
    { id: 'FS-31', section: 'Fish & Seafood', tenant: 'Vacant', status: 'Available' as StallStatus, permit: 'Not Recorded' as PermitStatus, lastInspection: '-', note: '' },
    { id: 'FS-32', section: 'Fish & Seafood', tenant: 'Vacant', status: 'Available' as StallStatus, permit: 'Not Recorded' as PermitStatus, lastInspection: '-', note: 'Row left entirely blank on the sheet — no tenant and no status recorded.' },
    { id: 'FS-33', section: 'Fish & Seafood', tenant: 'GARCIA, REGINE', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 22, 2026', note: '' },
    { id: 'FS-34', section: 'Fish & Seafood', tenant: 'AVILA, DAISY BAHIA', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 22, 2026', note: '' },
    { id: 'FS-35', section: 'Fish & Seafood', tenant: 'TAYANES, ARIEL VERUTIAO', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 22, 2026', note: '' },
    { id: 'FS-36', section: 'Fish & Seafood', tenant: 'TAYANES, JENNIFER CAINDOY', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 22, 2026', note: '' },
    { id: 'FS-37', section: 'Fish & Seafood', tenant: 'ABANDO, KIRBY ASDILLA', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 22, 2026', note: '' },
    { id: 'FS-38', section: 'Fish & Seafood', tenant: 'AGUILAR, JOEL FUENTES', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 22, 2026', note: '' },
    { id: 'FS-39', section: 'Fish & Seafood', tenant: 'AGUILAR, JOVE', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 22, 2026', note: '' },
    { id: 'FS-40', section: 'Fish & Seafood', tenant: 'IMPORTA, SONNY LUIS', status: 'Occupied' as StallStatus, permit: 'No BP' as PermitStatus, lastInspection: 'Jul 22, 2026', note: '' },
    { id: 'FS-41', section: 'Fish & Seafood', tenant: 'ALBAO, NICANORA LAGO', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 22, 2026', note: '' },
    { id: 'FS-42', section: 'Fish & Seafood', tenant: 'AGUILAR, GLENN FUENTES', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 22, 2026', note: '' },
    { id: 'FS-43', section: 'Fish & Seafood', tenant: 'AGUILAR, GLORIA', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 22, 2026', note: '' },
    { id: 'FS-44', section: 'Fish & Seafood', tenant: 'ABAS, FELISA TIBE', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 22, 2026', note: '' },
    { id: 'FS-45', section: 'Fish & Seafood', tenant: 'ABANDO, JOEY B.', status: 'Occupied' as StallStatus, permit: 'No BP' as PermitStatus, lastInspection: 'Jul 22, 2026', note: '' },
    { id: 'FS-46', section: 'Fish & Seafood', tenant: 'CANDELA, MARILYN ORDAME', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 22, 2026', note: '' },
    { id: 'FS-47', section: 'Fish & Seafood', tenant: 'FLORES, MELVIN', status: 'Occupied' as StallStatus, permit: 'No BP' as PermitStatus, lastInspection: 'Jul 22, 2026', note: '' },
    { id: 'FS-48', section: 'Fish & Seafood', tenant: 'MELO, RENALYN', status: 'Occupied' as StallStatus, permit: 'No BP' as PermitStatus, lastInspection: 'Jul 22, 2026', note: '' },
    { id: 'FS-49', section: 'Fish & Seafood', tenant: 'MELO, MELBA', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 22, 2026', note: '' },
    { id: 'FS-50', section: 'Fish & Seafood', tenant: 'PARDALES, ABELARDO NAPOLES', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 22, 2026', note: '' },
    { id: 'FS-51', section: 'Fish & Seafood', tenant: 'BAGUISA, MERLY ABANG', status: 'Temporarily Closed' as StallStatus, permit: 'Not Recorded' as PermitStatus, lastInspection: 'Jul 22, 2026', note: '' },
    { id: 'FS-52', section: 'Fish & Seafood', tenant: 'BAGUISA, COLITA ABANAG', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 22, 2026', note: '' },
    { id: 'FS-53', section: 'Fish & Seafood', tenant: 'TOMANDA, DANIEL OGARO', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 22, 2026', note: '' },
    { id: 'FS-54', section: 'Fish & Seafood', tenant: 'DUZON, MILO LOPEZ', status: 'Temporarily Closed' as StallStatus, permit: 'Not Recorded' as PermitStatus, lastInspection: 'Jul 22, 2026', note: '' },
    { id: 'FS-55', section: 'Fish & Seafood', tenant: 'DE LA CRUZ, LYZA/CORAZON AVILA', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 22, 2026', note: '' },
    { id: 'FS-56', section: 'Fish & Seafood', tenant: 'DE LA CRUZ, LYZA/CORAZON AVILA', status: 'Temporarily Closed' as StallStatus, permit: 'Not Recorded' as PermitStatus, lastInspection: 'Jul 22, 2026', note: '' },
    { id: 'FS-57', section: 'Fish & Seafood', tenant: 'SALAÑO, JEFER JOHN ABON', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 22, 2026', note: '' },
    { id: 'FS-58', section: 'Fish & Seafood', tenant: 'UBALDO, NILDA', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 22, 2026', note: '' },
    { id: 'FS-59', section: 'Fish & Seafood', tenant: 'VERTUDES, ERIC', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 22, 2026', note: '' },
    { id: 'FS-60', section: 'Fish & Seafood', tenant: 'Vacant', status: 'Available' as StallStatus, permit: 'Not Recorded' as PermitStatus, lastInspection: '-', note: '' },
    { id: 'FS-61', section: 'Fish & Seafood', tenant: 'Vacant', status: 'Available' as StallStatus, permit: 'Not Recorded' as PermitStatus, lastInspection: '-', note: '' },
    { id: 'FS-62', section: 'Fish & Seafood', tenant: 'Vacant', status: 'Available' as StallStatus, permit: 'Not Recorded' as PermitStatus, lastInspection: '-', note: '' },
    { id: 'FS-63', section: 'Fish & Seafood', tenant: 'Vacant', status: 'Available' as StallStatus, permit: 'Not Recorded' as PermitStatus, lastInspection: '-', note: '' },
    { id: 'KK-01', section: 'Dry Goods', tenant: 'ARELLANO, JOEL ASTILLERO', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 21, 2026', note: 'Kakanin sheet, row 1.' },
    { id: 'KK-02', section: 'Dry Goods', tenant: 'ARELLANO, JOEL ASTILLERO', status: 'Temporarily Closed' as StallStatus, permit: 'Not Recorded' as PermitStatus, lastInspection: 'Jul 21, 2026', note: 'Kakanin sheet, row 2.' },
    { id: 'KK-03', section: 'Dry Goods', tenant: 'DUZON, DULCE CORAZON/MELODY TAYANES', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 21, 2026', note: 'Kakanin sheet, row 3.' },
    { id: 'KK-04', section: 'Dry Goods', tenant: 'FLORES, CATHERINE VERONA', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 21, 2026', note: 'Kakanin sheet, row 4.' },
    { id: 'KK-05', section: 'Dry Goods', tenant: 'FLORES, JACQUILINE NOVIO', status: 'Occupied' as StallStatus, permit: 'No BP' as PermitStatus, lastInspection: 'Jul 21, 2026', note: 'Kakanin sheet, row 5.' },
    { id: 'KK-06', section: 'Dry Goods', tenant: 'FLORES, JACQUILINE NOVIO', status: 'Temporarily Closed' as StallStatus, permit: 'Not Recorded' as PermitStatus, lastInspection: 'Jul 21, 2026', note: 'Kakanin sheet, row 6.' },
    { id: 'KK-07', section: 'Dry Goods', tenant: 'MEDRANO, MARTHY PALARON', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 21, 2026', note: 'Kakanin sheet, row 7.' },
    { id: 'KK-08', section: 'Dry Goods', tenant: 'AGUILLON, MARY JOY DELA CERNA', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 21, 2026', note: 'Kakanin sheet, row 8.' },
    { id: 'KK-09', section: 'Dry Goods', tenant: 'ELARDO, ROSARIO', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 21, 2026', note: 'Kakanin sheet, row 9.' },
    { id: 'KK-10', section: 'Dry Goods', tenant: 'ESLABAN, JULIFE PERALTA', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 21, 2026', note: 'Kakanin sheet, row 10.' },
    { id: 'KK-11', section: 'Dry Goods', tenant: 'REDONA, NARCISA', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 21, 2026', note: 'Kakanin sheet, row 11.' },
    { id: 'KK-12', section: 'Dry Goods', tenant: 'PERALTA, ERVIN PAULO MAQUILAN', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 21, 2026', note: 'Kakanin sheet, row 12.' },
    { id: 'KK-13', section: 'Dry Goods', tenant: 'CESAR, RHODORA LAMATA', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 21, 2026', note: 'Kakanin sheet, row 13.' },
    { id: 'KK-14', section: 'Dry Goods', tenant: 'LERIOS, NORIDAN', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 21, 2026', note: 'Kakanin sheet, row 14.' },
    { id: 'KK-15', section: 'Dry Goods', tenant: 'MODESTO, JADE', status: 'Occupied' as StallStatus, permit: 'With BP' as PermitStatus, lastInspection: 'Jul 21, 2026', note: 'Kakanin sheet, row 15.' },
  ] satisfies Stall[],
  violations: [] as Violation[],

  /* The market office's own board, seeded as the seats rather than the people
     — the office types in who holds each one. A seat stays on the board while
     it is vacant, because the post exists whether or not anybody holds it. */
  /* The market office as it actually stands, from the office's own roster:
     the supervisor, two officers in charge of market operation, a clerk,
     three collectors and nine sweepers. The roster names no reporting line
     below the supervisor, so everyone is seated under her rather than
     inventing a hierarchy the office has not set. */
  officers: [
    { id: 'OFC-001', name: 'Engr. Luz M. Maderazo', position: 'Market Supervisor III', office: 'Market Office', reportsTo: '', phone: '', email: '', status: 'Active' as OfficerStatus, appointed: '' },
    { id: 'OFC-002', name: 'Manuel G. Mercado', position: 'In Charge — Market Operation', office: 'Market Office', reportsTo: 'OFC-001', phone: '', email: '', status: 'Active' as OfficerStatus, appointed: '' },
    { id: 'OFC-003', name: 'Felmar Pica', position: 'In Charge — Market Operation', office: 'Market Office', reportsTo: 'OFC-001', phone: '', email: '', status: 'Active' as OfficerStatus, appointed: '' },
    { id: 'OFC-004', name: 'Louwhie Jane Bengero', position: 'Clerk I', office: 'Market Office', reportsTo: 'OFC-001', phone: '', email: '', status: 'Active' as OfficerStatus, appointed: '' },
    { id: 'OFC-005', name: 'Lorna Tangpuz', position: 'Market Collector', office: 'Market Office', reportsTo: 'OFC-001', phone: '', email: '', status: 'Active' as OfficerStatus, appointed: '' },
    { id: 'OFC-006', name: 'Ericson Aguipo', position: 'Market Collector', office: 'Market Office', reportsTo: 'OFC-001', phone: '', email: '', status: 'Active' as OfficerStatus, appointed: '' },
    { id: 'OFC-007', name: 'Stephen Lopez', position: 'Market Collector', office: 'Market Office', reportsTo: 'OFC-001', phone: '', email: '', status: 'Active' as OfficerStatus, appointed: '' },
    { id: 'OFC-008', name: 'Virginia Montilla', position: 'Sweeper', office: 'Market Office', reportsTo: 'OFC-001', phone: '', email: '', status: 'Active' as OfficerStatus, appointed: '' },
    { id: 'OFC-009', name: 'Ponciano Lugasan', position: 'Sweeper', office: 'Market Office', reportsTo: 'OFC-001', phone: '', email: '', status: 'Active' as OfficerStatus, appointed: '' },
    { id: 'OFC-010', name: 'Lolito Cuna', position: 'Sweeper', office: 'Market Office', reportsTo: 'OFC-001', phone: '', email: '', status: 'Active' as OfficerStatus, appointed: '' },
    { id: 'OFC-011', name: 'Niel Salarda', position: 'Sweeper', office: 'Market Office', reportsTo: 'OFC-001', phone: '', email: '', status: 'Active' as OfficerStatus, appointed: '' },
    { id: 'OFC-012', name: 'Joseph Mendiola', position: 'Sweeper', office: 'Market Office', reportsTo: 'OFC-001', phone: '', email: '', status: 'Active' as OfficerStatus, appointed: '' },
    { id: 'OFC-013', name: 'Ronhelito Mendiola', position: 'Sweeper', office: 'Market Office', reportsTo: 'OFC-001', phone: '', email: '', status: 'Active' as OfficerStatus, appointed: '' },
    { id: 'OFC-014', name: 'Carmelo Villero', position: 'Sweeper', office: 'Market Office', reportsTo: 'OFC-001', phone: '', email: '', status: 'Active' as OfficerStatus, appointed: '' },
    { id: 'OFC-015', name: 'Junel Guiron', position: 'Sweeper', office: 'Market Office', reportsTo: 'OFC-001', phone: '', email: '', status: 'Active' as OfficerStatus, appointed: '' },
    { id: 'OFC-016', name: 'Bonifacio Lopez', position: 'Sweeper', office: 'Market Office', reportsTo: 'OFC-001', phone: '', email: '', status: 'Active' as OfficerStatus, appointed: '' },
  ] satisfies Officer[],

  utilities: [] as UtilityBill[],

  /* Every stall/space verification slip this office has issued. A slip is a
     controlled document — the licensing office may ring up to ask whether
     number 042 is really ours and who it was written for — so the register is
     kept rather than the number simply being burned off a counter. */
  verifications: [] as VerificationSlip[],

  logs: [] as LogEntry[],
  activities: [] as ActivityItem[],
};

type AppState = typeof initialState;

/* ============================================================
   Navigation Config
   ============================================================ */

const navigation: Array<{ key: ModuleKey; label: string; icon: string }> = [
  { key: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
  { key: 'stalls', label: 'Stall Management', icon: 'storefront' },
  { key: 'tenants', label: 'Tenant Records', icon: 'groups' },
  { key: 'applicants', label: 'Applicants', icon: 'person_add' },
  { key: 'utilities', label: 'Utility Billing', icon: 'bolt' },
  { key: 'violations', label: 'Violations', icon: 'gavel' },
  { key: 'analytics', label: 'Analytics', icon: 'analytics' },
  { key: 'logbook', label: 'Logbook', icon: 'menu_book' },
  { key: 'officers', label: 'Officers', icon: 'account_tree' },
];

const searchPlaceholders: Record<ModuleKey, string> = {
  dashboard: 'Search tenants, stalls, applicants, bills, violations...',
  stalls: 'Search stall ID, tenant, or section...',
  tenants: 'Search tenant name, ID, or stall...',
  applicants: 'Search applicant name, phone, or stall type...',
  utilities: 'Search bill ID, stall number, or tenant...',
  violations: 'Search violation ID, tenant, or issue...',
  analytics: 'Search is not used on Analytics',
  logbook: 'Search log details or type...',
  officers: 'Search officer name, position, or office...',
  settings: 'Search is not used on Settings',
  support: 'Search is not used on Support',
};

const searchableModules: ModuleKey[] = ['dashboard', 'stalls', 'tenants', 'applicants', 'utilities', 'violations', 'logbook', 'officers'];

/* ============================================================
   Helpers
   ============================================================ */

function normalizeApplicant(raw: Applicant): Applicant {
  const legacy = raw as unknown as { requirementsUploaded?: unknown };
  const requirements = Array.isArray(raw?.requirements)
    ? raw.requirements.filter((r) => typeof r === 'string' && REQUIREMENTS.includes(r))
    : REQUIREMENTS.slice(0, Math.min(REQUIREMENTS.length, Math.max(0, Number(legacy?.requirementsUploaded) || 0)));
  return {
    id: raw.id,
    name: raw.name,
    phone: raw.phone,
    stallId: typeof raw.stallId === 'string' ? raw.stallId : undefined,
    status: raw.status,
    dateApplied: raw.dateApplied,
    requirements,
  };
}

/* A tenant used to hold one stallkeeper in four flat fields. Those records are
   read as a list of one, so nothing filed before this change is lost. */
function normalizeTenant(raw: Tenant): Tenant {
  const legacy = raw as unknown as { keeperName?: unknown; keeperPhone?: unknown; keeperRelation?: unknown; keeperBarangay?: unknown };
  const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const fromList = Array.isArray(raw?.keepers)
    ? raw.keepers
        .map((k, i) => ({
          id: text((k as Stallkeeper)?.id) || `KPR-${i + 1}`,
          name: text((k as Stallkeeper)?.name),
          phone: text((k as Stallkeeper)?.phone),
          relation: text((k as Stallkeeper)?.relation),
          barangay: text((k as Stallkeeper)?.barangay),
        }))
        .filter((k) => k.name)
    : text(legacy.keeperName)
      ? [{ id: 'KPR-1', name: text(legacy.keeperName), phone: text(legacy.keeperPhone), relation: text(legacy.keeperRelation), barangay: text(legacy.keeperBarangay) }]
      : [];
  /* Records saved before rent was tracked carry no payments and no meters —
     they read as a tenant who has simply not paid anything yet. */
  const rawMeters = (raw as { meters?: Partial<MeterNumbers> })?.meters;
  const meters = { Electricity: text(rawMeters?.Electricity), Water: text(rawMeters?.Water) };

  const rentPayments: Record<string, RentPayment> = {};
  const rawPayments = (raw as { rentPayments?: unknown })?.rentPayments;
  if (rawPayments && typeof rawPayments === 'object') {
    Object.entries(rawPayments as Record<string, Partial<RentPayment>>).forEach(([key, value]) => {
      const period = /^\d{4}-\d{2}$/.test(key) ? key : text(value?.period).slice(0, 7);
      if (!/^\d{4}-\d{2}$/.test(period)) return;
      const amount = Number(value?.amount);
      const discount = Number(value?.discount);
      rentPayments[period] = {
        period,
        paidOn: typeof value?.paidOn === 'string' ? value.paidOn : '',
        amount: Number.isFinite(amount) ? amount : Number(raw?.rent) || 0,
        /* A payment recorded before the discount existed keeps a discount of
           zero. It is not back-dated into one: that month really was collected
           in full, and inventing a discount now would falsify the ledger. */
        discount: Number.isFinite(discount) && discount > 0 ? discount : 0,
      };
    });
  }

  return {
    id: raw.id,
    name: raw.name,
    phone: typeof raw?.phone === 'string' && raw.phone ? raw.phone : '—',
    barangay: text(raw?.barangay),
    stallId: raw.stallId,
    section: raw.section,
    /* Records filed before Section 43 was entered carry no rent at all. Rather
       than leave the register showing nothing owed, a stall with no rent on it
       takes the schedule's rate for its kind; a rent already set is left alone. */
    rent: Number.isFinite(Number(raw?.rent)) && Number(raw.rent) > 0
      ? Number(raw.rent)
      : monthlyRentForStall(typeof raw?.stallId === 'string' ? raw.stallId : ''),
    status: raw.status,
    applicantId: raw.applicantId,
    keepers: fromList,
    meters,
    rentDueDay: clampDueDay(raw?.rentDueDay),
    rentPayments,
  };
}

/* Bills used to carry only the month they covered. An older bill keeps that
   month and is read as running from its first day to its last.

   Bills also used to carry a fixed/service charge, folded into `amount`
   before the market dropped that charge. An old bill's `amount` is left
   exactly as recorded — it was genuinely billed at that figure — and any
   leftover `fixedCharge` key from before is simply never read again. */
function normalizeBill(raw: UtilityBill): UtilityBill {
  const period = typeof raw?.period === 'string' && raw.period ? raw.period.slice(0, 7) : currentPeriod();
  const isDay = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
  const periodStart = isDay(raw?.periodStart) ? raw.periodStart : monthStartIso(period);
  const periodEnd = isDay(raw?.periodEnd) ? raw.periodEnd : monthEndIso(period);
  const meterNumber = typeof raw?.meterNumber === 'string' ? raw.meterNumber.trim() : '';
  return { ...raw, meterNumber, period: periodOf(periodEnd) || period, periodStart, periodEnd };
}

/* A stall saved before the occupancy sheet was imported carries no permit or
   note. A missing permit is 'Not Recorded' — the sheet's own answer for a
   blank cell — never an assumption that the stall has no permit. */
function normalizeStall(s: Stall): Stall {
  const loose = s as Partial<Stall>;
  return {
    ...s,
    permit: PERMIT_STATUSES.includes(loose.permit as PermitStatus) ? (loose.permit as PermitStatus) : 'Not Recorded',
    note: typeof loose.note === 'string' ? loose.note : '',
  };
}

/* An officer read back from storage or an imported backup. Every field is
   forced to the shape the rest of the app relies on: a bad `reportsTo` would
   otherwise drop a seat off the board, and an unknown status would fall
   through every badge and filter. `reportsTo` is only checked for shape here;
   it is resolved against the other officers in `linkOfficers`, which is the
   only place that can see the whole board at once. */
function normalizeOfficer(raw: Officer): Officer {
  const loose = (raw ?? {}) as Partial<Officer>;
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const name = str(loose.name);
  const status = OFFICER_STATUSES.includes(loose.status as OfficerStatus) ? (loose.status as OfficerStatus) : 'Active';
  return {
    id: str(loose.id),
    name,
    position: str(loose.position),
    office: str(loose.office),
    reportsTo: str(loose.reportsTo),
    phone: digitsOnly(str(loose.phone)),
    email: str(loose.email),
    /* Vacancy is not a status somebody can be in — it is what a seat with
       nobody in it is. Naming a seat makes it Active unless the record says
       the holder is away; emptying it makes it vacant again. */
    status: name ? (status === 'Vacant' ? 'Active' : status) : 'Vacant',
    appointed: /^\d{4}-\d{2}-\d{2}$/.test(str(loose.appointed)) ? str(loose.appointed) : '',
  };
}

/* Makes the board a tree that can actually be walked. Four things can go
   wrong with `reportsTo` and all four are repaired here rather than left for
   the renderer to trip over:

     - a seat reporting to an id no longer on the board (its superior was
       deleted) is lifted to the head of the board;
     - a seat reporting to itself is lifted the same way;
     - a cycle — A under B, B under A — is cut at the seats that are actually
       in it, and only those. A seat that merely reports into a cycle keeps
       its superior, because once the cycle is cut that link is sound again;
     - a seat with a blank or duplicated id is dropped, because two seats
       sharing an id make every lookup in the module ambiguous.

   The result is always a forest: every seat is reachable from some head. */
function linkOfficers(list: Officer[]): Officer[] {
  const seenIds = new Set<string>();
  const board: Officer[] = [];
  for (const officer of list) {
    if (!officer.id || seenIds.has(officer.id)) continue;
    seenIds.add(officer.id);
    board.push({ ...officer });
  }
  const byId = new Map(board.map((o) => [o.id, o]));

  // Self-references and superiors that are not on the board.
  for (const officer of board) {
    if (officer.reportsTo && (officer.reportsTo === officer.id || !byId.has(officer.reportsTo))) {
      officer.reportsTo = '';
    }
  }

  /* Cut only the seats that close a cycle. Walking up from a seat and
     arriving back at that same seat is what says it is in one; meeting some
     other seat twice means the loop is further up, and whichever seat closes
     it will be cut when the walk reaches it. Links already cut are visible to
     later walks, so one pass settles the whole board. */
  for (const officer of board) {
    const walked = new Set<string>();
    let cursor = officer.reportsTo ? byId.get(officer.reportsTo) : undefined;
    while (cursor) {
      if (cursor.id === officer.id) { officer.reportsTo = ''; break; }
      if (walked.has(cursor.id)) break;
      walked.add(cursor.id);
      cursor = cursor.reportsTo ? byId.get(cursor.reportsTo) : undefined;
    }
  }

  return board;
}

function mergeState(input: unknown): AppState {
  const parsed = (input && typeof input === 'object' ? input : {}) as Partial<AppState>;
  const pick = <K extends keyof AppState>(key: K): AppState[K] =>
    (Array.isArray(parsed[key]) ? parsed[key] : initialState[key]) as AppState[K];
  return {
    applicants: pick('applicants').map(normalizeApplicant),
    tenants: pick('tenants').map(normalizeTenant),
    officers: linkOfficers(pick('officers').map(normalizeOfficer)),
    logs: pick('logs').map((l) => ({ ...l, date: typeof l?.date === 'string' ? l.date : '' })),
    activities: pick('activities').slice(0, MAX_ACTIVITIES),
    stalls: pick('stalls').map(normalizeStall),
    violations: pick('violations').map((v) => ({
      ...v,
      points: Math.max(0, Number(v?.points) || 0),
      dateRecorded: typeof v?.dateRecorded === 'string' ? v.dateRecorded : '',
      dateResolved: typeof v?.dateResolved === 'string' ? v.dateResolved : '',
      notes: typeof v?.notes === 'string' ? v.notes : '',
    })),
    utilities: pick('utilities').map(normalizeBill),
    verifications: pick('verifications').map((v) => ({
      ...v,
      checked: Array.isArray(v?.checked) ? v.checked : [],
      others: typeof v?.others === 'string' ? v.others : '',
    })),
  };
}

/* Turns whatever storage handed back into a usable set of records. Nothing
   filed yet — a brand new installation — starts from the sample records. */
function stateFrom(raw: unknown | null): AppState {
  if (!raw) return initialState;
  try { return mergeState(raw); } catch { return initialState; }
}

function money(value: number) {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 2 }).format(value);
}

function moneyShort(value: number) {
  if (value >= 1_000_000) return `₱${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1000) return `₱${(value / 1000).toFixed(0)}K`;
  return money(value);
}

function percent(value: number) {
  return `${value.toFixed(1)}%`;
}

function ratio(part: number, total: number) {
  return total > 0 ? (part / total) * 100 : 0;
}

function submittedCount(a: Applicant) {
  return REQUIREMENTS.filter((r) => a.requirements.includes(r)).length;
}

/* Ticking Business Permit on an application is the office recording that the
   permit is in hand, so the stall it names stops reading No BP without anyone
   having to go and edit the stall as well.

   It only ever upgrades. Clearing the tick is treated as a correction to the
   application, not as a permit being revoked on the stall — that is a
   decision for the stall record, made deliberately. */
function stallGainingPermit(stalls: Stall[], applicant: Applicant): Stall | undefined {
  if (!applicant.stallId || !applicant.requirements.includes('Business Permit')) return undefined;
  return stalls.find((st) => st.id === applicant.stallId && st.permit !== 'With BP');
}

function applyPermitFromApplicant(stalls: Stall[], applicant: Applicant): Stall[] {
  if (!stallGainingPermit(stalls, applicant)) return stalls;
  return stalls.map((st) => (st.id === applicant.stallId ? { ...st, permit: 'With BP' as PermitStatus } : st));
}

function deriveStatus(current: ApplicantStatus, requirements: string[]): ApplicantStatus {
  if (current === 'Approved' || current === 'Rejected') return current;
  const settled = REQUIREMENTS.every((r) => requirements.includes(r)) ? 'Pending Review' : 'Incomplete';
  /* Only a record already flagged No BP behaves this way, so a normal
     application still runs Incomplete → Pending Review as it always did. */
  if (current === 'No BP') return requirements.includes('Business Permit') ? settled : 'No BP';
  return settled;
}

function toNumber(raw: string) {
  const n = parseFloat(raw);
  return isNaN(n) ? 0 : n;
}

function toAmount(raw: string) {
  return Math.max(0, toNumber(raw));
}

function isNegative(raw: string) {
  return toNumber(raw) < 0;
}

function getInitials(name: string) {
  return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
}

const avatarColors = ['blue', 'teal', 'purple', 'rose', 'amber'];
function getAvatarColor(i: number) { return avatarColors[i % avatarColors.length]; }

/* ---------- Stallkeepers ---------- */

/* A row in the stallkeeper editor. `base` is the person already on record:
   their inputs open blank and a blank field keeps what is filed, exactly like
   every other field on an edit form. A row with no `base` is a new entry, so
   its inputs are the values themselves. */
type KeeperDraft = {
  key: string;
  base?: Stallkeeper;
  name: string;
  phone: string;
  relation: string;
  barangay: string;
};

function newKeeperKey() {
  return `KPR-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

function blankKeeperDraft(): KeeperDraft {
  return { key: newKeeperKey(), name: '', phone: '', relation: '', barangay: '' };
}

function keeperDraftsFrom(keepers: Stallkeeper[]): KeeperDraft[] {
  return keepers.map((k) => ({ key: k.id, base: k, name: '', phone: '', relation: '', barangay: '' }));
}

/* What a single row amounts to: the person on record with whatever has been
   typed over them, or the new entry as typed. */
function resolveKeeperDraft(d: KeeperDraft): Stallkeeper {
  return d.base
    ? {
        ...d.base,
        name: keepText(d.name, d.base.name),
        phone: keepText(d.phone, d.base.phone),
        relation: d.relation || d.base.relation,
        barangay: keepText(d.barangay, d.base.barangay),
      }
    : { id: d.key, name: d.name.trim(), phone: d.phone.trim(), relation: d.relation, barangay: d.barangay.trim() };
}

/* What the rows amount to once saved. A new row left without a name is one the
   officer opened and did not use, so it is dropped. */
function resolveKeepers(drafts: KeeperDraft[]): Stallkeeper[] {
  return drafts.map(resolveKeeperDraft).filter((k) => k.name);
}

/* Anything typed into a row counts as a change, even a row that would resolve
   away — otherwise a half-filled entry leaves Save disabled and the officer is
   never told why it is being ignored. */
function keeperDraftsTouched(drafts: KeeperDraft[]) {
  return drafts.some((d) => d.name.trim() || d.phone.trim() || d.relation || d.barangay.trim());
}

/* '' when the rows can be saved, otherwise what is wrong with them. An entry is
   named in the complaint, never numbered — the officer knows the person, not
   their position in the list. */
function keeperDraftsProblem(drafts: KeeperDraft[]) {
  for (const d of drafts) {
    const who = d.base ? `${d.base.name}'s` : 'The new stallkeeper’s';
    const badPhone = phoneProblem(d.phone, `${who} contact number`);
    if (badPhone) return badPhone;
    if (!d.base && !d.name.trim() && (d.phone.trim() || d.relation || d.barangay.trim())) {
      return 'The new stallkeeper needs a name — enter one, or remove the entry.';
    }
  }
  const names = resolveKeepers(drafts).map((k) => k.name.toLowerCase());
  const repeated = names.find((name, i) => names.indexOf(name) !== i);
  if (repeated) return 'The same stallkeeper is listed twice. Remove the duplicate entry.';
  return '';
}

function keeperSummary(keepers: Stallkeeper[]) {
  if (keepers.length === 0) return '';
  return keepers.map((k) => (k.relation ? `${k.name} — ${k.relation}` : k.name)).join('; ');
}

/* ---------- Contact numbers ---------- */

/* A Philippine mobile number: eleven digits, 09 prefix. Contact fields accept
   nothing but digits — letters and punctuation are dropped as they are typed
   rather than reported back afterwards. */
const PHONE_LENGTH = 11;

function digitsOnly(raw: string) {
  return raw.replace(/\D/g, '').slice(0, PHONE_LENGTH);
}

/* Groups a stored number for reading: 09171234567 → 0917 123 4567. Anything
   that is not a full mobile number (legacy records, '—') is left as it is. */
function formatPhone(raw?: string) {
  const value = (raw ?? '').trim();
  const digits = value.replace(/\D/g, '');
  if (digits.length !== PHONE_LENGTH) return value;
  return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
}

/* '' when the typed number is acceptable, otherwise why it is not. Blank is
   acceptable — a contact number is optional everywhere it appears. */
function phoneProblem(typed: string, label = 'Mobile number') {
  const digits = typed.trim();
  if (!digits) return '';
  if (digits.length !== PHONE_LENGTH || !digits.startsWith('09')) {
    return `${label} must be 11 digits starting with 09 — for example 09171234567.`;
  }
  return '';
}

/* The highest number handed out per record prefix (TEN, APP, UTL...). Held here
   so an ID can still be produced the instant a form needs one, and written to
   storage with the records it belongs to. A deleted record's number is never
   reissued, which keeps every reference in the paper files pointing at one
   record for good. */
let idCounters: IdCounters = {};

function seedIdCounters(values: IdCounters) {
  idCounters = { ...values };
}

function currentIdCounters(): IdCounters {
  return idCounters;
}

function resetIdCounters() {
  idCounters = {};
}

/* The numbers that would be handed out next, without handing them out. The
   verification preview needs this: the slip on screen has to show the control
   number that will actually print, but a preview the officer backs out of must
   not tear a number off the pad. Nothing is claimed until it prints. */
function peekIds(prefix: string, existingIds: string[], count: number) {
  const nums = existingIds.map((id) => parseInt(id.replace(/\D/g, ''), 10)).filter((n) => !isNaN(n));
  const maxExisting = nums.length > 0 ? Math.max(...nums) : 0;
  const previous = typeof idCounters[prefix] === 'number' ? idCounters[prefix] : 0;
  const base = Math.max(maxExisting, previous);
  return Array.from({ length: count }, (_, i) => `${prefix}-${String(base + i + 1).padStart(3, '0')}`);
}

/* Takes a run of numbers and moves the counter past them, so a sheet of four
   slips claims four numbers in one go and the next sheet starts after them.
   The counter belongs to the records, and is written out with them. */
function claimIds(prefix: string, existingIds: string[], count: number) {
  const ids = peekIds(prefix, existingIds, count);
  if (ids.length === 0) return ids;
  idCounters[prefix] = parseInt(ids[ids.length - 1].replace(/\D/g, ''), 10);
  return ids;
}

function nextId(prefix: string, existingIds: string[]) {
  return claimIds(prefix, existingIds, 1)[0];
}

/* ---------- Graph data ---------- */

const STALL_STATUS_SERIES: GraphSeries[] = [
  { key: 'Occupied', label: 'Occupied', tone: 'occupied' },
  { key: 'Available', label: 'Available', tone: 'available' },
  { key: 'Maintenance', label: 'Maintenance', tone: 'maintenance' },
  { key: 'Temporarily Closed', label: 'Temp. Closed', tone: 'closed' },
  { key: 'Closed', label: 'Closed', tone: 'shut' },
  { key: 'Abandoned', label: 'Abandoned', tone: 'abandoned' },
];

const UTILITY_SERIES: GraphSeries[] = [
  { key: 'Electricity', label: 'Electricity', tone: 'electricity' },
  { key: 'Water', label: 'Water', tone: 'water' },
];

/* Axis labels have a column's width to live in — 'Vegetables & Fruits' does not
   fit, but the part before the ampersand names the section unambiguously. */
function shortSection(section: string) {
  return section.split(' & ')[0];
}

/* One column per market section, stacked by stall status. Shared by the
   dashboard overview graph and the analytics report so both read alike. */
function sectionOccupancyColumns(stalls: Stall[]): GraphColumn[] {
  return Array.from(new Set(stalls.map((s) => s.section))).map((section) => {
    const inSection = stalls.filter((s) => s.section === section);
    return {
      label: shortSection(section),
      caption: `${inSection.length} stall${inSection.length === 1 ? '' : 's'}`,
      values: {
        Occupied: inSection.filter((s) => s.status === 'Occupied').length,
        Available: inSection.filter((s) => s.status === 'Available').length,
        Maintenance: inSection.filter((s) => s.status === 'Maintenance').length,
        'Temporarily Closed': inSection.filter((s) => s.status === 'Temporarily Closed').length,
        Closed: inSection.filter((s) => s.status === 'Closed').length,
        Abandoned: inSection.filter((s) => s.status === 'Abandoned').length,
      },
    };
  });
}

function paginate<T>(items: T[], page: number, perPage = ITEMS_PER_PAGE) {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * perPage;
  return {
    items: items.slice(start, start + perPage),
    totalPages,
    total,
    start: total > 0 ? start + 1 : 0,
    end: Math.min(start + perPage, total),
    page: safePage,
  };
}

/* ---------- Utility billing helpers ---------- */

function isoDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/* Today in Tanauan, as YYYY-MM-DD. Every overdue test is a string comparison
   against this, so the whole system turns over at midnight Philippine time. */
function todayIso() {
  const p = manilaParts();
  return `${p.year}-${p.month}-${p.day}`;
}

function isoPlusDays(iso: string, days: number) {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return isoDate(dt);
}

function formatIsoDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso || '—';
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function currentPeriod() {
  const p = manilaParts();
  return `${p.year}-${p.month}`;
}

function formatPeriod(period: string) {
  const [y, m] = period.split('-').map(Number);
  if (!y || !m) return period || '—';
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

/* "Aug 2026" — for column headings and buttons, where the long form crowds. */
function formatPeriodShort(period: string) {
  const [y, m] = period.split('-').map(Number);
  if (!y || !m) return period || '—';
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

/* ---------- Monthly rent ---------- */

function clampDueDay(raw: unknown) {
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_RENT_DUE_DAY;
  return Math.min(MAX_RENT_DUE_DAY, n);
}

/* The day this tenant's rent falls due in a given month. */
function rentDueIso(tenant: Tenant, period: string) {
  return `${period}-${String(clampDueDay(tenant.rentDueDay)).padStart(2, '0')}`;
}

function rentPaymentFor(tenant: Tenant, period: string): RentPayment | undefined {
  return tenant.rentPayments[period];
}

/* Whether a month settled on `paidOn` qualifies for the early-payment
   discount. "Early" is on or before the due date — paying on the due date
   itself still counts, which is how the office has always read it. */
function qualifiesForRentDiscount(tenant: Tenant, period: string, paidOn: string) {
  return !!paidOn && paidOn <= rentDueIso(tenant, period);
}

/* What the discount comes to for this tenant's monthly rent. Rounded to
   centavos so the ledger never carries a fraction it cannot collect. */
function rentDiscountAmount(rent: number) {
  return Math.round(rent * (EARLY_RENT_DISCOUNT_PCT / 100) * 100) / 100;
}

/* What a month would cost this tenant if it were settled today — used by the
   register and the tenant sheet to show the incentive while it is still
   available, before anything is recorded. */
function rentQuoteToday(tenant: Tenant, period: string) {
  const early = qualifiesForRentDiscount(tenant, period, todayIso());
  const discount = early ? rentDiscountAmount(tenant.rent) : 0;
  return { early, discount, payable: Math.round((tenant.rent - discount) * 100) / 100 };
}

/* Unpaid rent turns overdue on its own the day after it falls due — nothing has
   to be run, clicked or rolled over for the register to go red. */
function rentStatusOf(tenant: Tenant, period: string): RentStatus {
  if (rentPaymentFor(tenant, period)) return 'Paid';
  return rentDueIso(tenant, period) < todayIso() ? 'Overdue' : 'Unpaid';
}

function rentDaysLate(tenant: Tenant, period: string) {
  if (rentStatusOf(tenant, period) !== 'Overdue') return 0;
  return Math.max(0, periodDays(rentDueIso(tenant, period), todayIso()) - 1);
}

/* Every month this tenant has settled, newest first. */
function rentPaymentHistory(tenant: Tenant): RentPayment[] {
  return Object.values(tenant.rentPayments).sort((a, b) => b.period.localeCompare(a.period));
}

/* What one tenant has paid across every month. Reads the payments unsorted —
   only the ledger needs them in order. */
function rentTotalPaid(tenant: Tenant) {
  return Object.values(tenant.rentPayments).reduce((s, p) => s + p.amount, 0);
}

/* Every peso of rent ever recorded as collected, across all tenants. */
function rentCollectedToDate(tenants: Tenant[]) {
  return tenants.reduce((sum, t) => sum + rentTotalPaid(t), 0);
}

/* Where one month's rent stands across the whole register. `due` is the rent
   roll — what the market is contracted to earn in a month. */
function rentRollFor(tenants: Tenant[], period: string) {
  const due = tenants.reduce((s, t) => s + t.rent, 0);
  const paid = tenants.filter((t) => rentStatusOf(t, period) === 'Paid');
  const collected = paid.reduce((s, t) => s + (rentPaymentFor(t, period)?.amount ?? t.rent), 0);
  const discounted = paid.reduce((s, t) => s + (rentPaymentFor(t, period)?.discount ?? 0), 0);
  return {
    due,
    collected,
    /* Total early-payment discount given this month — the gap between the rent
       roll and the cash, which is otherwise unexplained once discounts exist. */
    discounted,
    /* What is still owed, summed from the tenants who have not settled — not
       `due - collected`. With an early-payment discount those two differ by the
       discount given, so the subtraction would report a fully-collected month
       as still partly outstanding. */
    outstanding: tenants.filter((t) => rentStatusOf(t, period) !== 'Paid').reduce((s, t) => s + t.rent, 0),
    paidCount: paid.length,
    unpaidCount: tenants.length - paid.length,
    overdueCount: tenants.filter((t) => rentStatusOf(t, period) === 'Overdue').length,
  };
}

/* ---------- Billing period (the days a bill covers) ---------- */

/* The month a dated period belongs to — bills are still grouped and
   de-duplicated by month even though they are read to the day. */
function periodOf(endIso: string) {
  return endIso.slice(0, 7);
}

function monthStartIso(period: string) {
  return `${period}-01`;
}

function monthEndIso(period: string) {
  const [y, m] = period.split('-').map(Number);
  if (!y || !m) return period;
  return isoDate(new Date(y, m, 0)); // day 0 of the next month is the last of this one
}

/* "Sep 1 – 30, 2023", collapsing whatever the two dates share. */
function formatPeriodRange(start: string, end: string) {
  if (!start || !end) return formatPeriod(periodOf(end || start));
  if (start === end) return formatIsoDate(start);
  const [sy, sm, sd] = start.split('-').map(Number);
  const [ey, em, ed] = end.split('-').map(Number);
  if (!sy || !ey) return formatPeriod(periodOf(end));
  const from = new Date(sy, sm - 1, sd);
  const to = new Date(ey, em - 1, ed);
  const month = (d: Date) => d.toLocaleDateString('en-US', { month: 'short' });
  if (sy === ey && sm === em) return `${month(from)} ${sd} – ${ed}, ${ey}`;
  if (sy === ey) return `${month(from)} ${sd} – ${month(to)} ${ed}, ${ey}`;
  return `${month(from)} ${sd}, ${sy} – ${month(to)} ${ed}, ${ey}`;
}

function billPeriodText(bill: UtilityBill) {
  return formatPeriodRange(bill.periodStart, bill.periodEnd);
}

/* Days covered, inclusive of both ends — a 1st-to-30th period is 30 days. */
function periodDays(start: string, end: string) {
  const [sy, sm, sd] = start.split('-').map(Number);
  const [ey, em, ed] = end.split('-').map(Number);
  if (!sy || !ey) return 0;
  const ms = new Date(ey, em - 1, ed).getTime() - new Date(sy, sm - 1, sd).getTime();
  return Math.round(ms / 86400000) + 1;
}

function computeBill(previousReading: number, currentReading: number, rate: number) {
  const consumption = Math.max(0, currentReading - previousReading);
  const amount = Math.round(consumption * rate * 100) / 100;
  return { consumption, amount };
}

function isOverdue(bill: UtilityBill) {
  return bill.status === 'Unpaid' && !!bill.dueDate && bill.dueDate < todayIso();
}

/* The surcharge a bill picks up at the moment it is printed, not before. It is
   `isOverdue` — the exact same test already driving the OVERDUE badge on the
   Billing Records table — so a receipt's surcharge can never disagree with
   what the office is looking at when it decides to print. A bill paid off
   before it is ever printed late never carries one; printing the same overdue
   bill twice adds it both times, because both are genuinely late. */
function surchargeAmount(bill: UtilityBill) {
  return isOverdue(bill) ? Math.round(bill.amount * (SURCHARGE_RATES[bill.type] / 100) * 100) / 100 : 0;
}

function amountWithSurcharge(bill: UtilityBill) {
  return Math.round((bill.amount + surchargeAmount(bill)) * 100) / 100;
}

function lastReadingFor(bills: UtilityBill[], stallId: string, type: UtilityType) {
  const matches = bills
    .filter((b) => b.stallId === stallId && b.type === type)
    .sort((a, b) => a.period.localeCompare(b.period));
  return matches.length > 0 ? matches[matches.length - 1].currentReading : null;
}

/* Fallback for a stall whose tenant has no meter on file — the number the last
   bill for that stall was raised against. */
function lastMeterFor(bills: UtilityBill[], stallId: string, type: UtilityType) {
  const matches = bills
    .filter((b) => b.stallId === stallId && b.type === type && b.meterNumber)
    .sort((a, b) => a.period.localeCompare(b.period));
  return matches.length > 0 ? matches[matches.length - 1].meterNumber : '';
}

function downloadJSON(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function csvCell(value: string) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function downloadCSV(headers: string[], rows: string[][], filename: string) {
  const csv = [headers.map(csvCell).join(','), ...rows.map((r) => r.map(csvCell).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

/* ============================================================
   Main App Component
   ============================================================ */

/* What start-up read out of storage, handed to the app once it is ready. */
type BootData = {
  state: AppState;
  savedAt: string;
  /* Set when the stored records could not be read. Saving is held back for the
     rest of the session so a screen full of defaults is never written over
     records that are still on disk. */
  problem: string;
  /* Set when records were carried over from a version that stored them in the
     browser, so the operator can be told it happened. */
  imported: boolean;
};

function App({ boot }: { boot: BootData }) {
  const [active, setActive] = useState<ModuleKey>('dashboard');
  const [state, setState] = useState<AppState>(boot.state);
  const [searchTerm, setSearchTerm] = useState('');
  const [modal, setModal] = useState<{ type: ModalType; data?: unknown }>({ type: null });
  const [toasts, setToasts] = useState<Array<{ id: number; message: string }>>([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const toastSeq = useRef(0);

  const [lastSaved, setLastSaved] = useState<string>(boot.savedAt);
  const storageWarned = useRef(false);

  /* Printing runs in two steps: `printRequest` is what the preview dialog is
     open on, `printJob` is the sheet already laid out on the page. The sheet is
     hidden on screen and is the only thing the print stylesheet lets through. */
  const [printRequest, setPrintRequest] = useState<PrintRequest | null>(null);
  const [printJob, setPrintJob] = useState<{ receipts: PrintReceipt[]; printedBy: string; printedAt: string } | null>(null);
  const [registerJob, setRegisterJob] = useState<RegisterJob | null>(null);

  /* Verification slips run the same two steps. `verifyRequest` carries the
     stall the slip was started from, when it was started from one. */
  const [verifyRequest, setVerifyRequest] = useState<{ stall?: Stall } | null>(null);
  const [verifyJob, setVerifyJob] = useState<VerificationSlip[] | null>(null);

  const requestPrint = (bill: UtilityBill) => setPrintRequest({ bills: [bill], single: true });
  /* A batch of different bills tiled onto sheets — one receipt each, no copy
     labels, since each quarter goes to a different stall. */
  const requestPrintBatch = (batch: UtilityBill[]) => {
    if (batch.length === 0) { showToast('Select at least one bill to print'); return; }
    setPrintRequest({ bills: batch, single: false });
  };

  /* One tick so the receipt is laid out before the print dialog snapshots it.
     The body class is what narrows the print stylesheet down to the receipt —
     without it, the desktop app's own File > Print would print a blank page.

     The job is dropped again as soon as the print dialog closes, whether it was
     printed or cancelled. Leaving it mounted would leave the page in its
     printing state, and the next plain Ctrl+P would silently reprint the last
     receipt instead of the screen the officer is looking at. */
  useEffect(() => {
    if (!printJob) return;
    document.body.classList.add('printing');
    const finish = () => setPrintJob(null);
    window.addEventListener('afterprint', finish);
    const timer = window.setTimeout(() => window.print(), 80);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('afterprint', finish);
      document.body.classList.remove('printing');
    };
  }, [printJob]);

  /* Printing files the bill. A receipt is the office's word that the charge
     exists, so anything on the sheet that was still a draft goes onto the
     record here, under the number it prints with — the bill numbers are
     claimed at this moment and nowhere else, so a preview backed out of files
     nothing. Bills already on record are reprinted, not re-filed. */
  const confirmPrint = (receipts: PrintReceipt[], printedBy: string) => {
    try { localStorage.setItem(printedByKey, printedBy); } catch { /* full storage must not stop a receipt printing */ }

    const onSheet = receipts.map((r) => r.bill);
    const pending = unsavedBills(onSheet);
    const numbered = numberBills(onSheet, claimIds('UTL', state.utilities.map((b) => b.id), pending.length));
    const filed = [...numbered.values()];
    /* Every copy of a bill picks up the number its original was just given. */
    const printed = receipts.map((r) => ({ ...r, bill: numbered.get(r.bill) ?? r.bill }));

    if (filed.length > 0) {
      setState((p) => ({
        ...p,
        /* Newest first, the order `addBill` files a single bill in. */
        utilities: [...filed.slice().reverse(), ...p.utilities],
        activities: filed.reduce((acc, b) => withActivity(acc, UTILITY_PRESETS[b.type].icon, b.type === 'Electricity' ? 'amber' : 'blue', `${b.type} bill ${b.id}`, ` of ${money(b.amount)} issued to stall ${b.stallId} on printing.`), p.activities),
        logs: filed.reduce((acc, b) => [...acc, makeLog(acc, 'Collection', `${b.type} bill ${b.id} (${billPeriodText(b)}) issued to stall ${b.stallId}${b.tenantName ? ` — ${b.tenantName}` : ''}: ${money(b.amount)}. Filed on printing.`)], p.logs),
      }));
    }

    setPrintJob({ receipts: printed, printedBy, printedAt: manilaStamp() });
    setPrintRequest(null);
    const sheets = Math.ceil(receipts.length / RECEIPTS_PER_SHEET);
    const sent = `${receipts.length} receipt${receipts.length === 1 ? '' : 's'} on ${sheets} sheet${sheets === 1 ? '' : 's'} sent to print`;
    showToast(filed.length === 0
      ? sent
      : `${sent} — ${filed.length === 1 ? `bill ${filed[0].id} saved to records` : `${filed.length} bills saved to records (${filed[0].id}–${filed[filed.length - 1].id})`}`);
  };

  /* The control numbers are torn off the pad here and nowhere else — a preview
     that was cancelled leaves the counter where it was. Each slip goes onto the
     register as it is numbered, so the office can answer for any number that
     comes back to it later. */
  const confirmVerification = (drafts: Omit<VerificationSlip, 'controlNo'>[]) => {
    if (drafts.length === 0) return;
    const issuedBy = drafts[0].issuedBy;
    try { localStorage.setItem(verifiedByKey, issuedBy); } catch { /* full storage must not stop a slip printing */ }

    const numbers = claimIds('SSV', state.verifications.map((v) => v.controlNo), drafts.length);
    const slips: VerificationSlip[] = drafts.map((d, i) => ({ ...d, controlNo: numbers[i] }));
    const span = slips.length === 1 ? slips[0].controlNo : `${slips[0].controlNo}–${slips[slips.length - 1].controlNo}`;
    const forWhom = slips[0].issuedTo
      ? `${slips[0].issuedTo}${slips[0].stallNo ? ` (stall ${slips[0].stallNo})` : ''}`
      : 'blank, to be filled in at the counter';

    setState((p) => ({
      ...p,
      verifications: [...p.verifications, ...slips],
      logs: [...p.logs, makeLog(p.logs, 'Announcement', `Stall/space verification ${span} issued for business permit ${slips[0].purpose.toLowerCase()} — ${forWhom}. Valid until ${formatIsoDate(slips[0].validUntil)}.`)],
      activities: withActivity(p.activities, 'fact_check', 'blue', span, ` issued for business permit ${slips[0].purpose.toLowerCase()}.`),
    }));

    setVerifyJob(slips);
    setVerifyRequest(null);
    showToast(`Verification ${span} issued and sent to print`);
  };

  /* Same two-step as a receipt, and the job is dropped when the dialog closes
     so a later plain Ctrl+P does not silently reprint a numbered slip. */
  useEffect(() => {
    if (!verifyJob) return;
    document.body.classList.add('printing');
    const finish = () => setVerifyJob(null);
    window.addEventListener('afterprint', finish);
    const timer = window.setTimeout(() => window.print(), 80);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('afterprint', finish);
      document.body.classList.remove('printing');
    };
  }, [verifyJob]);

  const showToast = useCallback((message: string) => {
    const id = ++toastSeq.current;
    setToasts((prev) => [...prev, { id, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3000);
  }, []);

  /* Every list page prints through here, so one sheet layout serves them all. */
  const printRegister = useCallback((title: string, subtitle: string, columns: string[], rows: string[][]) => {
    if (rows.length === 0) {
      showToast('Nothing to print — no records match the current filters');
      return;
    }
    setRegisterJob({ title, subtitle, columns, rows, printedAt: manilaStamp() });
  }, [showToast]);

  /* Same two-step as a receipt: lay the sheet out, let the print stylesheet cut
     everything else away, then drop it so a later plain Ctrl+P prints the
     screen rather than silently reprinting this register. */
  useEffect(() => {
    if (!registerJob) return;
    document.body.classList.add('printing');
    const finish = () => setRegisterJob(null);
    window.addEventListener('afterprint', finish);
    const timer = window.setTimeout(() => window.print(), 80);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('afterprint', finish);
      document.body.classList.remove('printing');
    };
  }, [registerJob]);

  /* Every change to the records is written straight back to storage. The short
     delay collapses a burst of edits into one write; the guard makes sure a
     failed read earlier never turns into a destructive write now. */
  useEffect(() => {
    if (boot.problem) return;
    let dropped = false;
    const timer = setTimeout(() => {
      persist(state, currentIdCounters())
        .then((stamp) => {
          if (dropped) return;
          setLastSaved(stamp);
          storageWarned.current = false;
        })
        .catch(() => {
          if (dropped || storageWarned.current) return;
          storageWarned.current = true;
          showToast(
            usingDatabase()
              ? 'Could not save to the records database — export a backup from Support.'
              : 'Could not save to browser storage — export a backup from Support.',
          );
        });
    }, 150);
    return () => { dropped = true; clearTimeout(timer); };
  }, [state, showToast, boot.problem]);

  /* Said once, at start-up: records were brought over, or cannot be read. */
  useEffect(() => {
    if (boot.problem) {
      showToast('The records database could not be opened — changes will not be saved.');
    } else if (boot.imported) {
      showToast('Existing records moved into the database.');
    }
  }, [boot.problem, boot.imported, showToast]);

  const closeModal = useCallback(() => setModal({ type: null }), []);

  useEffect(() => {
    if (!modal.type) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeModal(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modal.type, closeModal]);

  const occupiedCount = useMemo(() => state.stalls.filter((s) => s.status === 'Occupied').length, [state.stalls]);
  const availableCount = useMemo(() => state.stalls.filter((s) => s.status === 'Available').length, [state.stalls]);
  const maintenanceCount = useMemo(() => state.stalls.filter((s) => s.status === 'Maintenance').length, [state.stalls]);
  const pendingApplicants = useMemo(() => state.applicants.filter((a) => a.status === 'Pending Review').length, [state.applicants]);
  const incompleteApplicants = useMemo(() => state.applicants.filter((a) => a.status === 'Incomplete').length, [state.applicants]);
  const approvedApplicants = useMemo(() => state.applicants.filter((a) => a.status === 'Approved').length, [state.applicants]);
  const unpaidBills = useMemo(() => state.utilities.filter((b) => b.status === 'Unpaid'), [state.utilities]);
  const outstandingUtilities = useMemo(() => unpaidBills.reduce((sum, b) => sum + b.amount, 0), [unpaidBills]);

  const notifications = useMemo(() => {
    const items: Array<{ id: string; icon: string; tone: string; title: string; detail: string; target: ModuleKey }> = [];
    const rentPeriod = currentPeriod();
    const rentLate = state.tenants.filter((t) => rentStatusOf(t, rentPeriod) === 'Overdue');
    if (rentLate.length > 0) items.push({ id: 'n-rent', icon: 'payments', tone: 'danger', title: `${rentLate.length} tenant${rentLate.length > 1 ? 's' : ''} past due on rent`, detail: `${money(rentLate.reduce((s, t) => s + t.rent, 0))} uncollected for ${formatPeriod(rentPeriod)}`, target: 'tenants' });
    const overdue = state.utilities.filter(isOverdue);
    if (overdue.length > 0) items.push({ id: 'n-overdue', icon: 'receipt_long', tone: 'danger', title: `${overdue.length} overdue utility bill${overdue.length > 1 ? 's' : ''}`, detail: `${money(overdue.reduce((s, b) => s + b.amount, 0))} past due`, target: 'utilities' });
    if (unpaidBills.length > 0) items.push({ id: 'n-unpaid', icon: 'payments', tone: 'warning', title: `${unpaidBills.length} unpaid utility bill${unpaidBills.length > 1 ? 's' : ''}`, detail: `${money(outstandingUtilities)} outstanding`, target: 'utilities' });
    if (pendingApplicants > 0) items.push({ id: 'n-applicants', icon: 'person_add', tone: 'warning', title: `${pendingApplicants} applicant${pendingApplicants > 1 ? 's' : ''} awaiting review`, detail: 'Open the Applicants module', target: 'applicants' });
    const expiring = state.tenants.filter((t) => t.status === 'Expiring Soon').length;
    if (expiring > 0) items.push({ id: 'n-expiring', icon: 'schedule', tone: 'warning', title: `${expiring} lease${expiring > 1 ? 's' : ''} expiring soon`, detail: 'Review tenant records', target: 'tenants' });
    if (maintenanceCount > 0) items.push({ id: 'n-maintenance', icon: 'build', tone: 'danger', title: `${maintenanceCount} stall${maintenanceCount > 1 ? 's' : ''} under maintenance`, detail: 'Check stall management', target: 'stalls' });
    const openViolations = state.violations.filter((v) => v.status === 'Open').length;
    if (openViolations > 0) items.push({ id: 'n-violations', icon: 'gavel', tone: 'danger', title: `${openViolations} open violation${openViolations > 1 ? 's' : ''}`, detail: 'Open the Violations register', target: 'violations' });
    return items;
  }, [state.utilities, state.tenants, state.violations, unpaidBills, outstandingUtilities, pendingApplicants, maintenanceCount]);

  /* A modal holds the record as it was when it opened. A save made from one
     form leaves that snapshot stale, so detail sheets and the "on record"
     hints read the live copy instead. */
  const liveStall = (s: Stall) => state.stalls.find((x) => x.id === s.id) ?? s;
  const liveTenant = (t: Tenant) => state.tenants.find((x) => x.id === t.id) ?? t;
  const liveApplicant = (a: Applicant) => state.applicants.find((x) => x.id === a.id) ?? a;
  const liveViolation = (v: Violation) => state.violations.find((x) => x.id === v.id) ?? v;
  const liveOfficer = (o: Officer) => state.officers.find((x) => x.id === o.id) ?? o;

  const withActivity = (list: ActivityItem[], icon: string, iconColor: string, highlight: string, text: string): ActivityItem[] =>
    [{ id: `ACT-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, icon, iconColor, highlight, text, time: 'Just now' }, ...list].slice(0, MAX_ACTIVITIES);

  const makeLog = (existing: LogEntry[], type: string, details: string): LogEntry =>
    ({ id: nextId('LOG', existing.map((l) => l.id)), date: todayIso(), time: nowTimeStr(), type, details });

  const addStall = (stall: Stall) => { setState((p) => ({ ...p, stalls: [...p.stalls, stall], activities: withActivity(p.activities, 'storefront', 'blue', stall.id, ` added as new stall in ${stall.section}.`) })); showToast(`Stall ${stall.id} added successfully`); closeModal(); };
  const addApplicant = (app: Applicant) => {
    const permitted = stallGainingPermit(state.stalls, app);
    setState((p) => ({
      ...p,
      applicants: [...p.applicants, app],
      stalls: applyPermitFromApplicant(p.stalls, app),
      activities: withActivity(p.activities, 'person_add', 'green', app.name, ` applied${app.stallId ? ` for stall ${app.stallId}` : ''}.`),
      ...(permitted
        ? { logs: [...p.logs, makeLog(p.logs, 'Announcement', `Stall ${permitted.id} recorded as With BP from application ${app.id} (${app.name}).`)] }
        : {}),
    }));
    showToast(permitted ? `Applicant ${app.name} added — stall ${permitted.id} is now With BP` : `Applicant ${app.name} added successfully`);
    closeModal();
  };
  const addLog = (l: LogEntry) => { setState((p) => ({ ...p, logs: [...p.logs, l] })); showToast('Log entry added'); closeModal(); };

  const addTenant = (t: Tenant) => {
    setState((p) => ({
      ...p,
      tenants: [...p.tenants, t],
      stalls: p.stalls.map((s) => (s.id === t.stallId ? { ...s, tenant: t.name, status: 'Occupied' as StallStatus, lastInspection: s.lastInspection === '-' ? todayStr() : s.lastInspection } : s)),
      activities: withActivity(p.activities, 'groups', 'blue', t.name, ` added as tenant at stall ${t.stallId}.`),
    }));
    showToast(`Tenant ${t.name} added successfully`);
    closeModal();
  };

  const addBill = (bill: UtilityBill) => {
    setState((p) => ({
      ...p,
      utilities: [bill, ...p.utilities],
      activities: withActivity(p.activities, UTILITY_PRESETS[bill.type].icon, bill.type === 'Electricity' ? 'amber' : 'blue', `${bill.type} bill`, ` of ${money(bill.amount)} issued to stall ${bill.stallId}.`),
      logs: [...p.logs, makeLog(p.logs, 'Collection', `${bill.type} bill ${bill.id} (${billPeriodText(bill)}) issued to stall ${bill.stallId}${bill.tenantName ? ` — ${bill.tenantName}` : ''}: ${money(bill.amount)}.`)],
    }));
    showToast(`${bill.type} bill ${bill.id} saved to stall ${bill.stallId}`);
  };

  const toggleBillStatus = (id: string) => {
    setState((p) => ({ ...p, utilities: p.utilities.map((b) => (b.id === id ? { ...b, status: b.status === 'Paid' ? 'Unpaid' : 'Paid' } : b)) }));
    const bill = state.utilities.find((b) => b.id === id);
    showToast(bill?.status === 'Paid' ? `${id} marked as unpaid` : `${id} marked as paid`);
  };

  /* Rent is settled a month at a time. Marking a month paid stamps the day it
     was collected; unmarking removes the month again, which is how a payment
     entered against the wrong tenant is undone. */
  const setRentPaid = (tenantId: string, period: string, paid: boolean) => {
    const tenant = state.tenants.find((t) => t.id === tenantId);
    if (!tenant || !!rentPaymentFor(tenant, period) === paid) return;
    const label = formatPeriod(period);
    /* Settled today, so the discount is decided against today's date. It is
       fixed onto the payment at this moment and never recomputed — the month
       stays collected at what was actually taken, whatever the rate becomes. */
    const paidOn = todayIso();
    const early = qualifiesForRentDiscount(tenant, period, paidOn);
    const discount = early ? rentDiscountAmount(tenant.rent) : 0;
    const collected = Math.round((tenant.rent - discount) * 100) / 100;

    setState((p) => ({
      ...p,
      tenants: p.tenants.map((t) => {
        if (t.id !== tenantId) return t;
        const next = { ...t.rentPayments };
        if (paid) next[period] = { period, paidOn, amount: collected, discount };
        else delete next[period];
        return { ...t, rentPayments: next };
      }),
      activities: withActivity(
        p.activities,
        paid ? 'payments' : 'undo',
        paid ? 'green' : 'amber',
        tenant.name,
        paid
          ? ` paid ${money(collected)} rent for ${label}${early ? ` — ${EARLY_RENT_DISCOUNT_PCT}% early-payment discount applied.` : '.'}`
          : `'s rent for ${label} was set back to unpaid.`,
      ),
      logs: [...p.logs, makeLog(p.logs, 'Collection', paid
        ? `Rent for ${label} collected from ${tenant.name} (${tenant.id}${tenant.stallId && tenant.stallId !== '—' ? `, stall ${tenant.stallId}` : ''}): ${money(collected)}${early ? ` (${money(tenant.rent)} less ${EARLY_RENT_DISCOUNT_PCT}% early-payment discount of ${money(discount)}, settled on or before ${formatIsoDate(rentDueIso(tenant, period))})` : ''}.`
        : `Rent payment for ${label} by ${tenant.name} (${tenant.id}) was reversed.`)],
    }));
    showToast(paid
      ? (early
        ? `${tenant.name} paid ${money(collected)} for ${label} — ${EARLY_RENT_DISCOUNT_PCT}% early discount`
        : `${tenant.name} marked paid for ${label}`)
      : `${tenant.name} marked unpaid for ${label}`);
  };

  /* A meter number typed into the calculator for a tenant who has none on file
     is kept on the tenant record, where it belongs. A number already on record
     is never overwritten from a bill — that is an edit to the tenant. */
  const recordMeterNumber = (tenantId: string, type: UtilityType, meterNumber: string) => {
    const trimmed = meterNumber.trim();
    if (!tenantId || !trimmed) return;
    const tenant = state.tenants.find((t) => t.id === tenantId);
    if (!tenant || tenant.meters[type]) return;
    setState((p) => ({
      ...p,
      tenants: p.tenants.map((t) => (t.id === tenantId ? { ...t, meters: { ...t.meters, [type]: trimmed } } : t)),
    }));
    showToast(`${type} meter ${trimmed} saved to ${tenant.name}`);
  };

  const updateApplicant = (updated: Applicant, opts: SaveOpts = {}, snapshot?: Applicant, promptAssign?: boolean) => {
    const { log = true, close = true } = opts;
    // `snapshot` is the record as it stood when the form opened, so a second
    // save in the same session still logs against its true starting point.
    const previous = snapshot ?? state.applicants.find((a) => a.id === updated.id);
    const statusChanged = !!previous && previous.status !== updated.status;
    const permitted = stallGainingPermit(state.stalls, updated);
    setState((p) => ({
      ...p,
      applicants: p.applicants.map((a) => (a.id === updated.id ? updated : a)),
      stalls: applyPermitFromApplicant(p.stalls, updated),
      ...(log
        ? {
            activities: withActivity(p.activities, 'person_add', updated.status === 'Approved' ? 'green' : updated.status === 'Rejected' ? 'red' : 'amber', updated.name, statusChanged ? `'s application was marked ${updated.status}.` : `'s application details were updated.`),
            logs: [
              ...p.logs,
              makeLog(p.logs, 'Announcement', statusChanged && previous ? `Application ${updated.id} (${updated.name}) changed from ${previous.status} to ${updated.status}.` : `Application ${updated.id} (${updated.name}) was updated.`),
              ...(permitted ? [makeLog(p.logs, 'Announcement', `Stall ${permitted.id} recorded as With BP from application ${updated.id} (${updated.name}).`)] : []),
            ],
          }
        : {}),
    }));
    if (log) showToast(permitted ? `${updated.name} updated — stall ${permitted.id} is now With BP` : statusChanged ? `${updated.name} marked as ${updated.status}` : `${updated.name} updated`);
    if (promptAssign) setModal({ type: 'assign-stall', data: updated });
    else if (close) closeModal();
  };

  const addViolation = (v: Violation) => {
    setState((p) => ({
      ...p,
      violations: [v, ...p.violations],
      activities: withActivity(p.activities, 'gavel', 'red', v.tenant, ` was cited for ${v.issue.toLowerCase()}.`),
      logs: [...p.logs, makeLog(p.logs, 'Incident', `Violation ${v.id} recorded against ${v.tenant}: ${v.issue} (${v.points} point${v.points === 1 ? '' : 's'}).`)],
    }));
    showToast(`Violation ${v.id} recorded against ${v.tenant}`);
    closeModal();
  };

  const updateViolation = (updated: Violation, opts: SaveOpts = {}, snapshot?: Violation) => {
    const { log = true, close = true } = opts;
    const previous = snapshot ?? state.violations.find((v) => v.id === updated.id);
    const statusChanged = !!previous && previous.status !== updated.status;
    setState((p) => ({
      ...p,
      violations: p.violations.map((v) => (v.id === updated.id ? updated : v)),
      ...(log
        ? {
            activities: withActivity(p.activities, 'gavel', updated.status === 'Resolved' ? 'green' : 'red', updated.tenant, statusChanged ? `'s violation ${updated.id} was marked ${updated.status}.` : `'s violation ${updated.id} was updated.`),
            logs: [...p.logs, makeLog(p.logs, 'Incident', statusChanged && previous ? `Violation ${updated.id} (${updated.tenant}) changed from ${previous.status} to ${updated.status}.` : `Violation ${updated.id} (${updated.tenant}) was updated.`)],
          }
        : {}),
    }));
    if (log) showToast(statusChanged ? `${updated.id} marked as ${updated.status}` : `Violation ${updated.id} updated`);
    if (close) closeModal();
  };

  const deleteViolation = (violation: Violation) => {
    setState((p) => ({
      ...p,
      violations: p.violations.filter((v) => v.id !== violation.id),
      activities: withActivity(p.activities, 'gavel', 'red', violation.id, ` was removed from the violation register.`),
      logs: [...p.logs, makeLog(p.logs, 'Incident', `Violation ${violation.id} (${violation.tenant} — ${violation.issue}) was deleted.`)],
    }));
    showToast(`Violation ${violation.id} deleted`);
    closeModal();
  };

  const updateTenant = (updated: Tenant, opts: SaveOpts = {}, snapshot?: Tenant) => {
    const { log = true, close = true } = opts;
    setState((p) => {
      const previous = p.tenants.find((t) => t.id === updated.id);
      const oldStallId = previous?.stallId ?? '';
      const movedStall = oldStallId !== updated.stallId;
      const loggedFrom = snapshot ?? previous;
      const loggedMove = !!loggedFrom && loggedFrom.stallId !== updated.stallId;
      return {
        ...p,
        tenants: p.tenants.map((t) => (t.id === updated.id ? updated : t)),
        stalls: p.stalls.map((s) => {
          if (movedStall && s.id === oldStallId) return { ...s, tenant: 'Vacant', status: 'Available' as StallStatus };
          if (s.id === updated.stallId) return { ...s, tenant: updated.name, status: 'Occupied' as StallStatus, lastInspection: s.lastInspection === '-' ? todayStr() : s.lastInspection };
          return s;
        }),
        utilities: previous && previous.name !== updated.name
          ? p.utilities.map((b) => (b.tenantId === updated.id ? { ...b, tenantName: updated.name } : b))
          : p.utilities,
        ...(log
          ? {
              activities: withActivity(p.activities, 'groups', 'blue', updated.name, `'s tenant record was updated.`),
              logs: [...p.logs, makeLog(p.logs, 'Announcement', `Tenant ${updated.id} (${updated.name}) was updated${loggedMove && loggedFrom ? `; stall changed from ${loggedFrom.stallId || '—'} to ${updated.stallId || '—'}` : ''}.`)],
            }
          : {}),
      };
    });
    if (log) showToast(`Tenant ${updated.name} updated`);
    if (close) closeModal();
  };

  const updateStall = (updated: Stall, opts: SaveOpts = {}) => {
    const { log = true, close = true } = opts;
    setState((p) => {
      const occupant = p.tenants.find((t) => t.stallId === updated.id);
      /* Released: the stall is being handed back, so the tenancy on it ends. */
      const released = updated.status === 'Available' && !!occupant;
      const stall = released ? { ...updated, tenant: 'Vacant' } : updated;
      return {
        ...p,
        stalls: p.stalls.map((s) => (s.id === updated.id ? stall : s)),
        tenants: released
          ? p.tenants.filter((t) => t.id !== occupant.id)
          : occupant && occupant.section !== updated.section
            ? p.tenants.map((t) => (t.id === occupant.id ? { ...t, section: updated.section } : t))
            : p.tenants,
        ...(log
          ? {
              activities: withActivity(p.activities, 'storefront', released ? 'red' : 'blue', updated.id, released ? ` was released to Available; ${occupant.name} was removed from tenant records.` : ' was updated in stall management.'),
              logs: [...p.logs, makeLog(p.logs, 'Maintenance', released
                ? `Stall ${updated.id} was released to Available — tenant ${occupant.id} (${occupant.name}) was removed from tenant records.`
                : `Stall ${updated.id} was updated — ${updated.section}, ${updated.status}, tenant: ${updated.tenant}.`)],
            }
          : {}),
      };
    });
    if (log) showToast(`Stall ${updated.id} updated`);
    if (close) closeModal();
  };

  const deleteStall = (id: string) => {
    setState((p) => ({
      ...p,
      stalls: p.stalls.filter((s) => s.id !== id),
      activities: withActivity(p.activities, 'storefront', 'red', id, ' was removed from stall management.'),
      logs: [...p.logs, makeLog(p.logs, 'Maintenance', `Stall ${id} was removed from the stall registry.`)],
    }));
    showToast(`Stall ${id} deleted`);
    closeModal();
  };

  const deleteTenant = (tenant: Tenant) => {
    setState((p) => ({
      ...p,
      tenants: p.tenants.filter((t) => t.id !== tenant.id),
      stalls: p.stalls.map((s) => (s.id === tenant.stallId ? { ...s, tenant: 'Vacant', status: 'Available' as StallStatus } : s)),
      activities: withActivity(p.activities, 'groups', 'red', tenant.name, ` was removed from tenant records.`),
      logs: [...p.logs, makeLog(p.logs, 'Announcement', `Tenant ${tenant.id} (${tenant.name}) was removed${tenant.stallId && tenant.stallId !== '—' ? `; stall ${tenant.stallId} released to Available` : ''}.`)],
    }));
    showToast(`Tenant ${tenant.name} deleted`);
    closeModal();
  };

  const deleteApplicant = (applicant: Applicant) => {
    setState((p) => ({
      ...p,
      applicants: p.applicants.filter((a) => a.id !== applicant.id),
      activities: withActivity(p.activities, 'person_add', 'red', applicant.name, `'s application was deleted.`),
      logs: [...p.logs, makeLog(p.logs, 'Announcement', `Application ${applicant.id} (${applicant.name}) was deleted.`)],
    }));
    showToast(`Applicant ${applicant.name} deleted`);
    closeModal();
  };

  const deleteLog = (log: LogEntry) => {
    setState((p) => ({ ...p, logs: p.logs.filter((l) => l.id !== log.id) }));
    showToast(`Log entry ${log.id} deleted`);
    closeModal();
  };

  const deleteBill = (id: string) => {
    setState((p) => ({ ...p, utilities: p.utilities.filter((b) => b.id !== id) }));
    showToast(`Bill ${id} deleted`);
    closeModal();
  };

  /* Clears the stored records before the defaults are put back, so nothing from
     the old set can survive in a table the defaults do not mention. */
  const resetData = () => {
    closeModal();
    clearStored()
      .then(() => {
        resetIdCounters();
        setState(initialState);
        showToast('Data reset to defaults');
      })
      .catch(() => showToast('Could not reset the records — please try again.'));
  };

  /* ---------- The market office's board ---------- */

  const addOfficer = (officer: Officer) => {
    setState((p) => ({
      ...p,
      officers: linkOfficers([...p.officers, officer]),
      activities: withActivity(p.activities, 'account_tree', 'blue', officer.position, ` was added to the market office board${officer.name ? ` — ${officer.name}` : ' as a vacant seat'}.`),
      logs: [...p.logs, makeLog(p.logs, 'Announcement', `${officer.position} (${officer.id}) added to the office board${officer.name ? `: ${officer.name}` : ' as a vacant seat'}.`)],
    }));
    showToast(officer.name ? `${officer.name} added to the board` : `${officer.position} added as a vacant seat`);
    closeModal();
  };

  const updateOfficer = (updated: Officer) => {
    const previous = state.officers.find((o) => o.id === updated.id);
    setState((p) => ({
      ...p,
      officers: linkOfficers(p.officers.map((o) => (o.id === updated.id ? updated : o))),
      activities: withActivity(p.activities, 'account_tree', 'amber', updated.position, previous && previous.name !== updated.name
        ? ` is now held by ${updated.name || 'nobody — the seat is vacant'}.`
        : `'s details were updated.`),
      logs: [...p.logs, makeLog(p.logs, 'Announcement', previous && previous.name !== updated.name
        ? `${updated.position} (${updated.id}) changed from ${previous.name || 'vacant'} to ${updated.name || 'vacant'}.`
        : `${updated.position} (${updated.id}) was updated on the office board.`)],
    }));
    showToast(`${updated.position} updated`);
    closeModal();
  };

  /* Removing a seat must not orphan the seats under it: everyone who reported
     to it is lifted to whoever it reported to, so the board stays one tree
     and nobody quietly disappears off the bottom of it. */
  const deleteOfficer = (officer: Officer) => {
    const reassignTo = officer.reportsTo;
    const reports = state.officers.filter((o) => o.reportsTo === officer.id);
    setState((p) => ({
      ...p,
      officers: linkOfficers(
        p.officers
          .filter((o) => o.id !== officer.id)
          .map((o) => (o.reportsTo === officer.id ? { ...o, reportsTo: reassignTo } : o)),
      ),
      activities: withActivity(p.activities, 'account_tree', 'red', officer.position, ' was removed from the office board.'),
      logs: [...p.logs, makeLog(p.logs, 'Announcement', `${officer.position} (${officer.id}${officer.name ? ` — ${officer.name}` : ''}) removed from the office board.${reports.length > 0 ? ` ${reports.length} seat${reports.length === 1 ? '' : 's'} reassigned.` : ''}`)],
    }));
    showToast(`${officer.position} removed from the board`);
    closeModal();
  };


  const handleNewEntry = () => setModal({ type: 'add-log' });

  const handleLogout = () => setModal({ type: 'confirm-logout' });

  const downloadReport = () => {
    downloadJSON({ generatedAt: new Date().toISOString(), summary: { tenants: state.tenants.length, applicants: state.applicants.length, stalls: state.stalls.length, officers: state.officers.length }, data: state }, 'civic-market-core-report.json');
    showToast('Report downloaded');
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-logo"><img src="./logo.jpg" alt="Municipality of Tanauan official seal" /></div>
          <div className="brand-info"><h1>Tanauan Public Market</h1><p>Market Office</p></div>
        </div>
        <nav className="nav-main">
          {navigation.map((item) => (
            <button key={item.key} type="button" aria-current={active === item.key ? 'page' : undefined} className={`nav-item${active === item.key ? ' active' : ''}`} onClick={() => { setActive(item.key); setSearchTerm(''); }}>
              <span className="material-symbols-outlined" aria-hidden="true">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <nav className="nav-bottom">
          <button type="button" aria-current={active === 'settings' ? 'page' : undefined} className={`nav-item${active === 'settings' ? ' active' : ''}`} onClick={() => setActive('settings')}>
            <span className="material-symbols-outlined" aria-hidden="true">settings</span><span>Settings</span>
          </button>
          <button type="button" aria-current={active === 'support' ? 'page' : undefined} className={`nav-item${active === 'support' ? ' active' : ''}`} onClick={() => setActive('support')}>
            <span className="material-symbols-outlined" aria-hidden="true">help</span><span>Support</span>
          </button>
          <button type="button" className="nav-item" onClick={handleLogout}>
            <span className="material-symbols-outlined" aria-hidden="true">logout</span><span>Log Out</span>
          </button>
        </nav>
      </aside>

      <main className="main-content">
        <header className="topbar">
          {searchableModules.includes(active) ? (
            <div className="search-wrapper">
              <span className="material-symbols-outlined">search</span>
              <input className="search-input" type="text" placeholder={searchPlaceholders[active]} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
              {searchTerm && <button className="search-clear" title="Clear search" onClick={() => setSearchTerm('')}><span className="material-symbols-outlined">close</span></button>}
            </div>
          ) : <div className="topbar-spacer" />}
          <div className="topbar-actions">
            <MarketClock />
            <div className="notif-wrapper">
              <button className="icon-btn" title="Notifications" onClick={() => setNotifOpen((v) => !v)}>
                <span className="material-symbols-outlined">notifications</span>
                {notifications.length > 0 && <span className="notif-dot" />}
              </button>
              {notifOpen && (
                <>
                  <div className="notif-backdrop" onClick={() => setNotifOpen(false)} />
                  <div className="notif-panel">
                    <div className="notif-panel-header">Notifications<span>{notifications.length}</span></div>
                    {notifications.length === 0 && <div className="notif-empty">You're all caught up.</div>}
                    {notifications.map((n) => (
                      <button className="notif-row" key={n.id} onClick={() => { setActive(n.target); setNotifOpen(false); }}>
                        <span className={`material-symbols-outlined ${n.tone}`}>{n.icon}</span>
                        <span><strong>{n.title}</strong><span className="notif-sub">{n.detail}</span></span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            <div className="user-avatar" title="Admin">AD</div>
            {active === 'dashboard' && <button className="btn-primary" onClick={handleNewEntry}><span className="material-symbols-outlined">add</span>New Log Entry</button>}
          </div>
        </header>

        <div className="page-content">
          {active === 'dashboard' && <DashboardPage state={state} search={searchTerm} occupiedCount={occupiedCount} pendingApplicants={pendingApplicants} outstandingUtilities={outstandingUtilities} unpaidBillCount={unpaidBills.length} onNavigate={setActive} />}
          {active === 'utilities' && <UtilityBillingPage onPrintList={printRegister} bills={state.utilities} tenants={state.tenants} stalls={state.stalls} search={searchTerm} onAdd={addBill} onView={(b) => setModal({ type: 'view-bill', data: b })} onToggleStatus={toggleBillStatus} onDelete={(b) => setModal({ type: 'confirm-delete-bill', data: b })} onPrint={requestPrint} onPrintBatch={requestPrintBatch} onRecordMeter={recordMeterNumber} onExport={() => { downloadCSV(['Bill ID','Type','Stall','Tenant','Section','Meter No.','Period Covered','Period Start','Period End','Previous','Current','Consumption','Unit','Rate','Amount','Surcharge %','Surcharge If Printed Today','Total If Printed Today','Status','Issued','Due'], state.utilities.map((b) => [b.id, b.type, b.stallId, b.tenantName || '—', b.section || '—', b.meterNumber || '—', billPeriodText(b), formatIsoDate(b.periodStart), formatIsoDate(b.periodEnd), String(b.previousReading), String(b.currentReading), String(b.consumption), UTILITY_PRESETS[b.type].unit, b.rate.toFixed(2), b.amount.toFixed(2), String(SURCHARGE_RATES[b.type]), surchargeAmount(b).toFixed(2), amountWithSurcharge(b).toFixed(2), isOverdue(b) ? 'Overdue' : b.status, formatIsoDate(b.dateIssued), formatIsoDate(b.dueDate)]), 'utility-bills.csv'); showToast('Utility bills exported'); }} />}
          {active === 'stalls' && <StallManagementPage onVerify={(s) => setVerifyRequest({ stall: s })} onPrintList={printRegister} stalls={state.stalls} occupiedCount={occupiedCount} availableCount={availableCount} maintenanceCount={maintenanceCount} search={searchTerm} onAdd={() => setModal({ type: 'add-stall' })} onView={(s) => setModal({ type: 'view-stall', data: s })} onDelete={(s) => setModal({ type: 'confirm-delete-stall', data: s })} />}
          {active === 'tenants' && <TenantRecordsPage onPrintList={printRegister} tenants={state.tenants} search={searchTerm} onAdd={() => setModal({ type: 'add-tenant' })} onView={(t) => setModal({ type: 'view-tenant', data: t })} onDelete={(t) => setModal({ type: 'confirm-delete-tenant', data: t })} onSetRentPaid={setRentPaid} />}
          {active === 'applicants' && <ApplicantManagementPage onPrintList={printRegister} applicants={state.applicants} pendingApplicants={pendingApplicants} incompleteApplicants={incompleteApplicants} approvedApplicants={approvedApplicants} search={searchTerm} onAdd={() => setModal({ type: 'add-applicant' })} onView={(a) => setModal({ type: 'view-applicant', data: a })} onEdit={(a) => setModal({ type: 'edit-applicant', data: a })} onDelete={(a) => setModal({ type: 'confirm-delete-applicant', data: a })} />}
          {active === 'violations' && <ViolationsPage onPrintList={printRegister} violations={state.violations} search={searchTerm} onAdd={() => setModal({ type: 'add-violation' })} onView={(v) => setModal({ type: 'view-violation', data: v })} onEdit={(v) => setModal({ type: 'edit-violation', data: v })} onDelete={(v) => setModal({ type: 'confirm-delete-violation', data: v })} onExport={() => { downloadCSV(['Violation ID','Tenant','Issue','Points','Status','Date Recorded','Date Resolved','Notes'], state.violations.map((v) => [v.id, v.tenant, v.issue, String(v.points), v.status, v.dateRecorded ? formatIsoDate(v.dateRecorded) : '—', v.dateResolved ? formatIsoDate(v.dateResolved) : '—', v.notes]), 'violations.csv'); showToast('Violations exported'); }} />}
          {active === 'analytics' && <AnalyticsPage state={state} occupiedCount={occupiedCount} availableCount={availableCount} maintenanceCount={maintenanceCount} onExport={downloadReport} onNavigate={setActive} />}
          {active === 'logbook' && <LogbookPage onPrintList={printRegister} logs={state.logs} search={searchTerm} onAdd={() => setModal({ type: 'add-log' })} onDelete={(l) => setModal({ type: 'confirm-delete-log', data: l })} onExport={() => { downloadCSV(['Date','Time','Type','Details'], state.logs.map(l => [l.date ? formatIsoDate(l.date) : '—', l.time, l.type, l.details]), 'logbook.csv'); showToast('Log exported'); }} />}
          {active === 'officers' && <OfficersPage officers={state.officers} search={searchTerm} onAdd={() => setModal({ type: 'add-officer' })} onView={(o) => setModal({ type: 'view-officer', data: o })} onEdit={(o) => setModal({ type: 'edit-officer', data: o })} onDelete={(o) => setModal({ type: 'confirm-delete-officer', data: o })} onPrintList={printRegister} onExport={() => { downloadCSV(['Officer ID', 'Name', 'Position', 'Office', 'Reports To', 'Status', 'Contact', 'Email', 'Appointed'], state.officers.map((o) => [o.id, o.name || 'Vacant', o.position, o.office, officerLabel(state.officers.find((x) => x.id === o.reportsTo)), o.status, formatPhone(o.phone) || '—', o.email || '—', o.appointed ? formatIsoDate(o.appointed) : '—']), 'market-office-board.csv'); showToast('Office board exported'); }} />}
          {active === 'settings' && <SettingsPage state={state} lastSaved={lastSaved} onReset={() => setModal({ type: 'confirm-reset' })} onExport={downloadReport} onImport={(data: AppState) => { setState(data); showToast('Data imported successfully'); }} />}
          {active === 'support' && <SupportPage state={state} onRestore={(data: AppState) => { setState(data); showToast('Data restored successfully from backup'); }} onBackup={() => { downloadJSON(state, `pmrms-backup-${new Date().toISOString().slice(0,10)}.json`); showToast('Backup downloaded successfully'); }} />}
        </div>
      </main>

      {modal.type === 'add-stall' && <Modal title="Add New Stall" onClose={closeModal}><AddStallForm existingIds={state.stalls.map(s => s.id)} onSubmit={addStall} onCancel={closeModal} /></Modal>}
      {modal.type === 'add-applicant' && <Modal title="Add New Applicant" onClose={closeModal}><AddApplicantForm existingIds={state.applicants.map(a => a.id)} stalls={state.stalls} tenants={state.tenants} applicants={state.applicants} onSubmit={addApplicant} onCancel={closeModal} /></Modal>}
      {modal.type === 'add-tenant' && <Modal title="Add New Tenant" wide onClose={closeModal}><AddTenantForm existingIds={state.tenants.map(t => t.id)} stalls={state.stalls} tenants={state.tenants} onSubmit={addTenant} onCancel={closeModal} /></Modal>}
      {modal.type === 'assign-stall' && <Modal title="Assign Stall & Create Tenant" wide onClose={closeModal}><AssignStallForm applicant={modal.data as Applicant} stalls={state.stalls} tenants={state.tenants} onSubmit={addTenant} onSkip={closeModal} /></Modal>}
      {modal.type === 'add-log' && <Modal title="Add Log Entry" onClose={closeModal}><AddLogForm existingIds={state.logs.map(l => l.id)} onSubmit={addLog} onCancel={closeModal} /></Modal>}
      {modal.type === 'add-officer' && <Modal title="Add Officer" subtitle="A seat on the market office board." wide onClose={closeModal}><OfficerForm officers={state.officers} onSubmit={addOfficer} onCancel={closeModal} /></Modal>}
      {modal.type === 'edit-officer' && <Modal title="Edit Officer" subtitle="Update the seat, who holds it, and where it sits on the board." wide onClose={closeModal}><OfficerForm officers={state.officers} officer={liveOfficer(modal.data as Officer)} onSubmit={updateOfficer} onCancel={closeModal} /></Modal>}
      {modal.type === 'view-officer' && <Modal title="Officer Details" sheet onClose={closeModal}><OfficerDetailView officer={liveOfficer(modal.data as Officer)} officers={state.officers} onEdit={() => setModal({ type: 'edit-officer', data: modal.data })} onClose={closeModal} /></Modal>}
      {modal.type === 'add-violation' && <Modal title="Record a Violation" wide onClose={closeModal}><ViolationForm existingIds={state.violations.map(v => v.id)} tenants={state.tenants} onSubmit={addViolation} onCancel={closeModal} /></Modal>}
      {modal.type === 'view-violation' && <Modal title="Violation Details" sheet onClose={closeModal}><ViolationDetailView violation={liveViolation(modal.data as Violation)} onEdit={() => setModal({ type: 'edit-violation', data: modal.data })} onClose={closeModal} /></Modal>}
      {modal.type === 'edit-violation' && <Modal title="Edit Violation" wide onClose={closeModal}><ViolationEditForm violation={modal.data as Violation} current={liveViolation(modal.data as Violation)} tenants={state.tenants} onSave={updateViolation} onClose={closeModal} /></Modal>}
      {modal.type === 'view-stall' && <Modal title="Stall Details" sheet onClose={closeModal}><StallDetailView stall={liveStall(modal.data as Stall)} occupant={state.tenants.find((t) => t.stallId === (modal.data as Stall).id)} bills={state.utilities.filter((b) => b.stallId === (modal.data as Stall).id)} onEdit={() => setModal({ type: 'edit-stall', data: modal.data })} onVerify={() => { const s = liveStall(modal.data as Stall); closeModal(); setVerifyRequest({ stall: s }); }} onClose={closeModal} /></Modal>}
      {modal.type === 'edit-stall' && <Modal title="Edit Stall Details" wide onClose={closeModal}><StallEditForm stall={liveStall(modal.data as Stall)} occupant={state.tenants.find((t) => t.stallId === (modal.data as Stall).id)} bills={state.utilities.filter((b) => b.stallId === (modal.data as Stall).id)} onSave={updateStall} onClose={closeModal} /></Modal>}
      {modal.type === 'view-applicant' && <Modal title="Applicant Details" sheet onClose={closeModal}><ApplicantDetailView applicant={liveApplicant(modal.data as Applicant)} onReview={() => setModal({ type: 'edit-applicant', data: modal.data })} onClose={closeModal} /></Modal>}
      {modal.type === 'edit-applicant' && <Modal title="Review Applicant" wide onClose={closeModal}><ApplicantReviewForm applicant={modal.data as Applicant} current={liveApplicant(modal.data as Applicant)} onSave={updateApplicant} onClose={closeModal} /></Modal>}
      {modal.type === 'view-tenant' && <Modal title="Tenant Details" sheet onClose={closeModal}><TenantDetailView tenant={liveTenant(modal.data as Tenant)} bills={state.utilities.filter((b) => b.tenantId === (modal.data as Tenant).id || b.stallId === (modal.data as Tenant).stallId)} onSetRentPaid={setRentPaid} onEdit={() => setModal({ type: 'edit-tenant', data: modal.data })} onClose={closeModal} /></Modal>}
      {modal.type === 'edit-tenant' && <Modal title="Edit Tenant Details" wide onClose={closeModal}><TenantEditForm tenant={modal.data as Tenant} current={liveTenant(modal.data as Tenant)} tenants={state.tenants} stalls={state.stalls} onSave={updateTenant} onClose={closeModal} /></Modal>}
      {modal.type === 'view-bill' && <Modal title="Utility Bill Details" sheet onClose={closeModal}><BillDetailView bill={modal.data as UtilityBill} onToggleStatus={toggleBillStatus} onPrint={requestPrint} onClose={closeModal} /></Modal>}
      {modal.type === 'confirm-logout' && <ConfirmDialog icon="logout" iconStyle="warning" title="Log Out?" description="Are you sure you want to log out? All data is saved locally." confirmLabel="Log Out" onConfirm={() => { showToast('Logged out successfully'); closeModal(); }} onCancel={closeModal} />}
      {modal.type === 'confirm-reset' && <ConfirmDialog icon="delete_forever" iconStyle="danger" title="Reset All Data?" description="This will permanently reset all data to factory defaults. This cannot be undone." confirmLabel="Reset Data" confirmDanger onConfirm={resetData} onCancel={closeModal} />}
      {modal.type === 'confirm-delete-stall' && (() => {
        const stall = modal.data as Stall;
        const occupant = state.tenants.find((t) => t.stallId === stall.id);
        const billCount = state.utilities.filter((b) => b.stallId === stall.id).length;
        if (occupant) {
          return <ConfirmDialog icon="block" iconStyle="warning" title="Cannot delete this stall"
            description={`Stall ${stall.id} is currently assigned to ${occupant.name} (${occupant.id}). Remove or reassign that tenant record first, then delete the stall.`}
            hideConfirm cancelLabel="Close" onConfirm={closeModal} onCancel={closeModal} />;
        }
        return <ConfirmDialog icon="delete_forever" iconStyle="danger" title={`Delete stall ${stall.id}?`}
          description={`${stall.id} will be removed from stall management.${billCount > 0 ? ` Its ${billCount} utility bill${billCount === 1 ? '' : 's'} will be kept as billing history.` : ''} This cannot be undone.`}
          confirmLabel="Delete Stall" confirmDanger onConfirm={() => deleteStall(stall.id)} onCancel={closeModal} />;
      })()}
      {modal.type === 'confirm-delete-tenant' && (() => {
        const tenant = modal.data as Tenant;
        const bills = state.utilities.filter((b) => b.tenantId === tenant.id || b.stallId === tenant.stallId);
        const unpaid = bills.filter((b) => b.status === 'Unpaid');
        const hasStall = tenant.stallId && tenant.stallId !== '—';
        return <ConfirmDialog icon="person_remove" iconStyle="danger" title={`Delete tenant ${tenant.name}?`}
          description={`${tenant.id} will be removed from tenant records.${hasStall ? ` Stall ${tenant.stallId} will be released and marked Available.` : ''}${bills.length > 0 ? ` Their ${bills.length} utility bill${bills.length === 1 ? '' : 's'} will be kept as billing history${unpaid.length > 0 ? `, including ${money(unpaid.reduce((s, b) => s + b.amount, 0))} still unpaid` : ''}.` : ''} This cannot be undone.`}
          confirmLabel="Delete Tenant" confirmDanger onConfirm={() => deleteTenant(tenant)} onCancel={closeModal} />;
      })()}
      {modal.type === 'confirm-delete-applicant' && (() => {
        const applicant = modal.data as Applicant;
        return <ConfirmDialog icon="person_remove" iconStyle="danger" title={`Delete applicant ${applicant.name}?`}
          description={`Application ${applicant.id} (${applicant.status}) will be permanently removed. This cannot be undone.`}
          confirmLabel="Delete Applicant" confirmDanger onConfirm={() => deleteApplicant(applicant)} onCancel={closeModal} />;
      })()}
      {modal.type === 'confirm-delete-officer' && (() => {
        const officer = modal.data as Officer;
        const reports = state.officers.filter((o) => o.reportsTo === officer.id);
        const superior = state.officers.find((o) => o.id === officer.reportsTo);
        return <ConfirmDialog icon="person_remove" iconStyle="danger" title={`Remove ${officer.name || officer.position} from the board?`}
          description={`${officer.position} (${officer.id}) will be removed from the market office board.${reports.length > 0 ? ` The ${reports.length} seat${reports.length === 1 ? '' : 's'} reporting to it will be moved under ${superior ? `${superior.position}` : 'the head of the board'}.` : ''} This cannot be undone.`}
          confirmLabel="Remove Officer" confirmDanger onConfirm={() => deleteOfficer(officer)} onCancel={closeModal} />;
      })()}
      {modal.type === 'confirm-delete-log' && (() => {
        const log = modal.data as LogEntry;
        return <ConfirmDialog icon="delete" iconStyle="danger" title="Delete this log entry?"
          description={`"${log.details}" will be removed from the logbook. The logbook is your operational audit trail, so remove entries only if they were recorded in error.`}
          confirmLabel="Delete Entry" confirmDanger onConfirm={() => deleteLog(log)} onCancel={closeModal} />;
      })()}
      {modal.type === 'confirm-delete-violation' && (() => {
        const violation = modal.data as Violation;
        return <ConfirmDialog icon="delete_forever" iconStyle="danger" title={`Delete violation ${violation.id}?`}
          description={`The ${violation.status.toLowerCase()} citation against ${violation.tenant} for "${violation.issue}" will be permanently removed from the register.${violation.status === 'Open' ? ' Resolve it instead if it was served and settled — delete only if it was recorded in error.' : ' Delete only if it was recorded in error; resolved citations are the register’s history.'} This cannot be undone.`}
          confirmLabel="Delete Violation" confirmDanger onConfirm={() => deleteViolation(violation)} onCancel={closeModal} />;
      })()}
      {printRequest && <PrintPreviewDialog request={printRequest} billsOnRecord={state.utilities} onConfirm={confirmPrint} onCancel={() => setPrintRequest(null)} />}
      {printJob && <div className="print-area"><ReceiptSheets receipts={printJob.receipts} printedBy={printJob.printedBy} printedAt={printJob.printedAt} /></div>}
      {registerJob && <div className="print-area"><RegisterSheet job={registerJob} /></div>}
      {verifyRequest && (
        <VerificationPrintDialog
          stall={verifyRequest.stall}
          tenantName={verifyRequest.stall ? (state.tenants.find((t) => t.stallId === verifyRequest.stall!.id)?.name ?? verifyRequest.stall.tenant) : undefined}
          existingIds={state.verifications.map((v) => v.controlNo)}
          onConfirm={confirmVerification}
          onCancel={() => setVerifyRequest(null)}
        />
      )}
      {verifyJob && <div className="print-area"><VerificationSheets slips={verifyJob} /></div>}

      {modal.type === 'confirm-delete-bill' && <ConfirmDialog icon="delete" iconStyle="danger" title="Delete this bill?" description={`Bill ${(modal.data as UtilityBill).id} for stall ${(modal.data as UtilityBill).stallId} will be removed from the records. This cannot be undone.`} confirmLabel="Delete Bill" confirmDanger onConfirm={() => deleteBill((modal.data as UtilityBill).id)} onCancel={closeModal} />}

      {toasts.length > 0 && (
        <div className="toast-container">
          {toasts.map((t) => (
            <div className="toast" key={t.id}>
              <span className="material-symbols-outlined">check_circle</span>
              {t.message}
              <button type="button" className="toast-close" onClick={() => setToasts((p) => p.filter((x) => x.id !== t.id))}>×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   Dashboard Page
   ============================================================ */

function DashboardPage({ state, search, occupiedCount, pendingApplicants, outstandingUtilities, unpaidBillCount, onNavigate }: { state: AppState; search: string; occupiedCount: number; pendingApplicants: number; outstandingUtilities: number; unpaidBillCount: number; onNavigate: (k: ModuleKey) => void }) {
  const occupancyPct = ratio(occupiedCount, state.stalls.length);
  const activeTenants = state.tenants.filter(t => t.status === 'Active').length;

  /* Breakdowns for the caption line under each stat. Every figure is counted
     from live records — the cards used to carry a fabricated sparkline, and a
     real split of the same total is worth more than a decorative curve. */
  const availableCount = state.stalls.filter(s => s.status === 'Available').length;
  const maintenanceCount = state.stalls.filter(s => s.status === 'Maintenance').length;
  const expiringTenants = state.tenants.filter(t => t.status === 'Expiring Soon').length;
  const incompleteApplicants = state.applicants.filter(a => a.status === 'Incomplete').length;
  const overdueBillCount = state.utilities.filter(isOverdue).length;

  const occupancyColumns = useMemo(() => sectionOccupancyColumns(state.stalls), [state.stalls]);

  /* What the market earns. The rent roll is what every tenancy on record is
     contracted to pay in a month; collected is what has actually come in. */
  const rentPeriod = currentPeriod();
  const roll = useMemo(() => rentRollFor(state.tenants, rentPeriod), [state.tenants, rentPeriod]);
  const rentToDate = useMemo(() => rentCollectedToDate(state.tenants), [state.tenants]);
  const utilitiesCollected = useMemo(
    () => state.utilities.filter((b) => b.status === 'Paid').reduce((s, b) => s + b.amount, 0),
    [state.utilities],
  );
  const collectionPct = ratio(roll.collected, roll.due);

  /* Global search. The dashboard has no table of its own, so the topbar
     search looks across every record set and offers a jump to the module
     that owns the match. */
  const q = search.trim().toLowerCase();
  const hits = useMemo(() => {
    if (!q) return [];
    const has = (...vals: (string | undefined)[]) => vals.some((v) => (v || '').toLowerCase().includes(q));
    const out: { key: string; module: ModuleKey; icon: string; label: string; detail: string; kind: string }[] = [];
    state.tenants.filter((t) => has(t.name, t.id, t.stallId, ...t.keepers.map((k) => k.name))).forEach((t) =>
      out.push({ key: `t${t.id}`, module: 'tenants', icon: 'groups', label: t.name, detail: `${t.id} \u00b7 Stall ${t.stallId} \u00b7 ${t.section}`, kind: 'Tenant' }));
    state.stalls.filter((st) => has(st.id, st.tenant, st.section)).forEach((st) =>
      out.push({ key: `s${st.id}`, module: 'stalls', icon: 'storefront', label: `Stall ${st.id}`, detail: `${st.section} \u00b7 ${st.tenant}`, kind: 'Stall' }));
    state.applicants.filter((a) => has(a.name, a.id, a.phone, a.stallId ?? '')).forEach((a) =>
      out.push({ key: `a${a.id}`, module: 'applicants', icon: 'assignment_ind', label: a.name, detail: `${a.id}${a.stallId ? ` \u00b7 ${a.stallId}` : ''}`, kind: 'Applicant' }));
    state.utilities.filter((b) => has(b.id, b.stallId, b.tenantName)).forEach((b) =>
      out.push({ key: `b${b.id}`, module: 'utilities', icon: 'receipt_long', label: `${b.type} \u2014 Stall ${b.stallId}`, detail: `${b.id} \u00b7 ${billPeriodText(b)} \u00b7 ${money(b.amount)}`, kind: 'Bill' }));
    state.violations.filter((v) => has(v.id, v.tenant, v.issue)).forEach((v) =>
      out.push({ key: `v${v.id}`, module: 'violations', icon: 'gavel', label: v.issue, detail: `${v.id} \u00b7 ${v.tenant}`, kind: 'Violation' }));
    state.officers.filter((o) => has(o.id, o.name, o.position, o.office)).forEach((o) =>
      out.push({ key: `o${o.id}`, module: 'officers', icon: 'account_tree', label: o.name || `${o.position} (vacant)`, detail: `${o.id} · ${o.position}${o.office ? ` · ${o.office}` : ''}`, kind: 'Officer' }));
    return out.slice(0, 24);
  }, [q, state]);

  if (q) {
    return (
      <>
        <div className="page-header">
          <div>
            <h2 className="page-title">Search Results</h2>
            <p className="page-subtitle">{hits.length === 0 ? `Nothing on record matches "${search.trim()}".` : `${hits.length} record${hits.length === 1 ? '' : 's'} matching "${search.trim()}".`}</p>
          </div>
        </div>
        <div className="panel">
          {hits.length === 0 ? (
            <div className="empty-state"><span className="material-symbols-outlined">search_off</span>Try a name, record ID, or stall number.</div>
          ) : (
            <div className="search-results">
              {hits.map((h) => (
                <button className="search-result" key={h.key} onClick={() => onNavigate(h.module)}>
                  <span className="material-symbols-outlined">{h.icon}</span>
                  <span className="search-result-text">
                    <span className="search-result-label">{h.label}</span>
                    <span className="search-result-detail">{h.detail}</span>
                  </span>
                  <span className="search-result-kind">{h.kind}</span>
                  <span className="material-symbols-outlined search-result-go">chevron_right</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </>
    );
  }

  return (
    <>
      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-header"><span className="stat-label">Total Stalls</span><span className="material-symbols-outlined stat-icon">grid_view</span></div>
          <div className="stat-value">{state.stalls.length}</div>
          <div className="stat-caption">{occupiedCount} Occupied, {availableCount} Available{countStatus(state.stalls, 'Temporarily Closed') > 0 ? `, ${countStatus(state.stalls, 'Temporarily Closed')} Temp. Closed` : ''}{countStatus(state.stalls, 'Closed') > 0 ? `, ${countStatus(state.stalls, 'Closed')} Closed` : ''}{countStatus(state.stalls, 'Abandoned') > 0 ? `, ${countStatus(state.stalls, 'Abandoned')} Abandoned` : ''}{maintenanceCount > 0 ? `, ${maintenanceCount} Maintenance` : ''}</div>
        </div>
        <div className="stat-card">
          <div className="stat-header"><span className="stat-label">Occupancy</span><span className="material-symbols-outlined stat-icon primary">check_circle</span></div>
          <div className="stat-value">{occupiedCount}<span className="stat-fraction">/ {state.stalls.length}</span></div>
          <div className="stat-caption">{percent(occupancyPct)} of stalls in use</div>
          <div className="stat-progress"><div className="stat-progress-fill" style={{ width: `${occupancyPct}%` }} /></div>
        </div>
        <div className="stat-card">
          <div className="stat-header"><span className="stat-label">Active Tenants</span><span className="material-symbols-outlined stat-icon primary">groups</span></div>
          <div className="stat-value">{activeTenants}</div>
          <div className="stat-caption">{state.tenants.length} on record, {expiringTenants} Expiring</div>
          <button type="button" className="stat-link" onClick={() => onNavigate('tenants')}>View Tenants</button>
        </div>
        <div className="stat-card">
          <div className="stat-header"><span className="stat-label">Pending Applicants</span><span className="material-symbols-outlined stat-icon warning">pending_actions</span></div>
          <div className="stat-value">{pendingApplicants}</div>
          <div className="stat-caption">{incompleteApplicants} Incomplete, {state.applicants.length} Total</div>
          <button type="button" className="stat-link" onClick={() => onNavigate('applicants')}>Review Now</button>
        </div>
        <div className="stat-card">
          <div className="stat-header"><span className="stat-label">Unpaid Utilities</span><span className="material-symbols-outlined stat-icon danger">bolt</span></div>
          <div className="stat-value danger">{moneyShort(outstandingUtilities)}</div>
          <div className="stat-caption">{unpaidBillCount} Unpaid, {overdueBillCount} Overdue</div>
          <button type="button" className="stat-link" onClick={() => onNavigate('utilities')}>{unpaidBillCount} bill{unpaidBillCount === 1 ? '' : 's'} outstanding</button>
        </div>
      </div>

      <div className="panel earnings-panel">
        <div className="panel-header">
          <div className="panel-heading">
            <h3 className="panel-title">Market Earnings</h3>
            <span className="panel-caption">Rent income for {formatPeriod(rentPeriod)} · {state.tenants.length} tenanc{state.tenants.length === 1 ? 'y' : 'ies'} on the rent roll</span>
          </div>
          <button className="btn-outline-sm" onClick={() => onNavigate('tenants')}>Open Rent Register</button>
        </div>
        <div className="earnings-body">
          <div className="earnings-headline">
            <span className="earnings-label">Rent Collected — {formatPeriod(rentPeriod)}</span>
            <strong className="earnings-value">{money(roll.collected)}</strong>
            <span className="earnings-basis">of {money(roll.due)} contracted for the month</span>
            <div className="earnings-meter">
              <div className={`earnings-meter-fill${roll.overdueCount > 0 ? ' danger' : ''}`} style={{ width: `${collectionPct}%` }} />
            </div>
            <span className="earnings-basis">
              {percent(collectionPct)} collected · {roll.paidCount} of {state.tenants.length} tenants paid
              {roll.discounted > 0 && ` · ${money(roll.discounted)} given as early-payment discounts`}
            </span>
          </div>
          <div className="earnings-grid">
            <EarningsFigure label="Monthly Rent Roll" value={money(roll.due)} basis="Contracted rent from every tenancy on record" />
            <EarningsFigure label="Rent Outstanding" value={money(roll.outstanding)} tone={roll.outstanding > 0 ? 'danger' : 'success'} basis={`${roll.unpaidCount} unpaid · ${roll.overdueCount} past due`} />
            {roll.discounted > 0
              ? <EarningsFigure label={`Early-Payment Discounts (${EARLY_RENT_DISCOUNT_PCT}%)`} value={money(roll.discounted)} basis={`Taken off for settling on or before the due date — why collected sits below the roll`} />
              : <EarningsFigure label="Rent Collected to Date" value={money(rentToDate)} tone="success" basis="Every month recorded as settled" />}
            <EarningsFigure label="Utilities Collected" value={money(utilitiesCollected)} basis={`${money(outstandingUtilities)} still outstanding`} />
          </div>
          <div className="earnings-total">
            <span>Total Market Earnings to Date</span>
            <strong>{money(rentToDate + utilitiesCollected)}</strong>
          </div>
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="panel">
          <div className="panel-header">
            <div className="panel-heading">
              <h3 className="panel-title">Stall Occupancy Analytics</h3>
              <span className="panel-caption">Stalls by section and current status · {percent(occupancyPct)} occupied overall</span>
            </div>
            <button className="btn-outline-sm" onClick={() => onNavigate('analytics')}>Full Report</button>
          </div>
          <StackedBarGraph columns={occupancyColumns} series={STALL_STATUS_SERIES} emptyText="No stalls are on record yet." />
        </div>
        <div className="panel">
          <div className="panel-header">
            <div className="panel-heading">
              <h3 className="panel-title">Recent Activity</h3>
              <span className="panel-caption">{state.activities.length} entr{state.activities.length === 1 ? 'y' : 'ies'} on record</span>
            </div>
          </div>
          <div className="activity-list">
            {state.activities.length === 0 && (
              <div className="activity-empty"><span className="material-symbols-outlined">history</span>No activity recorded yet.</div>
            )}
            {state.activities.map((act) => (
              <div className="activity-item" key={act.id}>
                <div className={`activity-icon ${act.iconColor}`}><span className="material-symbols-outlined">{act.icon}</span></div>
                <div><p className="activity-text"><strong>{act.highlight}</strong>{act.text}</p><span className="activity-time">{act.time}</span></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

/* ============================================================
   Stall Management Page
   ============================================================ */

function StallManagementPage({ stalls, occupiedCount, availableCount, maintenanceCount, search, onAdd, onView, onDelete, onPrintList, onVerify }: { stalls: Stall[]; occupiedCount: number; availableCount: number; maintenanceCount: number; search: string; onAdd: () => void; onView: (s: Stall) => void; onDelete: (s: Stall) => void; onPrintList: (title: string, subtitle: string, columns: string[], rows: string[][]) => void; onVerify: (s?: Stall) => void; }) {
  /* Prints every row the filters are showing, not the page of them on screen. */
  const printList = () => onPrintList(
    sectionFilter || 'All Sections',
    `${statusFilter || 'All statuses'}${search ? ` · matching “${search}”` : ''}`,
    ['Stall ID', 'Section', 'Tenant', 'Status', 'Permit'],
    filtered.map((s) => [s.id, s.section, s.tenant, s.status, s.permit === 'Not Recorded' ? '—' : s.permit]),
  );
  const [sectionFilter, setSectionFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => { setPage(1); }, [search]);

  const filtered = useMemo(() => {
    return stalls.filter((s) => {
      if (sectionFilter && s.section !== sectionFilter) return false;
      if (statusFilter && s.status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!s.id.toLowerCase().includes(q) && !s.tenant.toLowerCase().includes(q) && !s.section.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [stalls, sectionFilter, statusFilter, search]);

  const paged = paginate(filtered, page);

  return (
    <>
      <div className="page-header">
        <div><h2 className="page-title">Stall Management</h2><p className="page-subtitle">Monitor occupancy, status, and tenant details.</p></div>
        <div className="page-actions">
          <button className="btn-outline" onClick={() => { setSectionFilter(''); setStatusFilter(''); }}><span className="material-symbols-outlined">tune</span>Clear Filters</button>
          <button className="btn-outline" disabled={filtered.length === 0} title={filtered.length === 0 ? 'No records match the current filters' : undefined} onClick={printList}><span className="material-symbols-outlined">print</span>Print List</button>
          <button className="btn-outline" onClick={() => onVerify()}><span className="material-symbols-outlined">fact_check</span>Stall / Space Verification</button>
          <button className="btn-primary" onClick={onAdd}><span className="material-symbols-outlined">add</span>New Stall</button>
        </div>
      </div>
      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-header"><span className="stat-label">Total Stalls</span><span className="material-symbols-outlined stat-icon">grid_view</span></div>
          <div className="stat-value">{stalls.length}</div>
          <div className="stat-caption">{occupiedCount} Occupied, {availableCount} Available{countStatus(stalls, 'Closed') > 0 ? `, ${countStatus(stalls, 'Closed')} Closed` : ''}{countStatus(stalls, 'Abandoned') > 0 ? `, ${countStatus(stalls, 'Abandoned')} Abandoned` : ''}</div>
        </div>
        <div className="stat-card">
          <div className="stat-header"><span className="stat-label">Occupied</span><span className="material-symbols-outlined stat-icon primary">check_circle</span></div>
          <div className="stat-value primary">{occupiedCount}</div>
          <div className="stat-caption">{percent(ratio(occupiedCount, stalls.length))} of {stalls.length} stalls</div>
        </div>
        <div className="stat-card">
          <div className="stat-header"><span className="stat-label">Available</span><span className="material-symbols-outlined stat-icon">inventory_2</span></div>
          <div className="stat-value">{availableCount}</div>
          <div className="stat-caption">{percent(ratio(availableCount, stalls.length))} of {stalls.length} stalls</div>
        </div>
        <div className="stat-card">
          <div className="stat-header"><span className="stat-label">Maintenance</span><span className="material-symbols-outlined stat-icon danger">build</span></div>
          <div className="stat-value danger">{maintenanceCount}</div>
          <div className="stat-caption">{maintenanceCount === 0 ? 'None out of service' : `${maintenanceCount} out of service`}</div>
        </div>
        <div className="stat-card">
          <div className="stat-header"><span className="stat-label">Temporarily Closed</span><span className="material-symbols-outlined stat-icon">pause_circle</span></div>
          <div className="stat-value">{countStatus(stalls, 'Temporarily Closed')}</div>
          <div className="stat-caption">Held by a tenant, not trading</div>
        </div>
      </div>
      <div className="panel">
        <div className="filter-row">
          <select className="filter-select" value={sectionFilter} onChange={(e) => { setSectionFilter(e.target.value); setPage(1); }}><option value="">All Sections</option>{SECTIONS.map(s => <option key={s} value={s}>{s}</option>)}</select>
          <select className="filter-select" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}><option value="">All Statuses</option>{STALL_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</select>
          <span className="table-info">Showing {paged.start}-{paged.end} of {paged.total} stalls</span>
        </div>
        <div className="table-wrap">
          <table className="data-table"><thead><tr><th>Stall ID</th><th>Section</th><th>Tenant</th><th>Status</th><th>Permit</th><th>Last Inspection</th><th>Action</th></tr></thead>
            <tbody>
              {paged.items.map((s) => (<tr key={s.id}><td><strong>{s.id}</strong></td><td>{s.section}</td><td className={s.status === 'Available' ? 'tenant-cell' : ''}>{s.tenant}</td><td><StatusBadge status={s.status} /></td><td><PermitBadge permit={s.permit} /></td><td>{s.lastInspection}</td><td><div className="row-actions"><button type="button" className="row-icon-btn" title="View details" aria-label="View details" onClick={() => onView(s)}><span className="material-symbols-outlined">visibility</span></button><button type="button" className="row-icon-btn" title="Issue verification slip" aria-label="Issue verification slip" onClick={() => onVerify(s)}><span className="material-symbols-outlined">fact_check</span></button><button type="button" className="row-icon-btn danger" title="Delete stall" aria-label="Delete stall" onClick={() => onDelete(s)}><span className="material-symbols-outlined">delete</span></button></div></td></tr>))}
              {paged.items.length === 0 && <tr><td colSpan={7}><div className="empty-state"><span className="material-symbols-outlined">storefront</span>No stalls match the current filters.</div></td></tr>}
            </tbody>
          </table>
        </div>
        <PaginationBar info={`Showing ${paged.start}-${paged.end} of ${paged.total}`} page={paged.page} totalPages={paged.totalPages} onPage={setPage} />
      </div>
    </>
  );
}

/* ============================================================
   Applicant Management Page
   ============================================================ */

function ApplicantManagementPage({ applicants, pendingApplicants, incompleteApplicants, approvedApplicants, search, onAdd, onView, onEdit, onDelete, onPrintList }: { applicants: Applicant[]; pendingApplicants: number; incompleteApplicants: number; approvedApplicants: number; search: string; onAdd: () => void; onView: (a: Applicant) => void; onEdit: (a: Applicant) => void; onDelete: (a: Applicant) => void; onPrintList: (title: string, subtitle: string, columns: string[], rows: string[][]) => void; }) {
  const printList = () => onPrintList(
    'Applicants',
    `${statusFilter || 'All statuses'}${search ? ` · matching “${search}”` : ''}`,
    ['Applicant ID', 'Name', 'Stall', 'Status', 'Requirements'],
    filtered.map((a) => [a.id, a.name, a.stallId || '—', a.status, `${a.requirements.length} of ${REQUIREMENTS.length}`]),
  );
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => { setPage(1); }, [search]);

  const filtered = useMemo(() => applicants.filter((a) => {
    if (statusFilter && a.status !== statusFilter) return false;
    if (search) { const q = search.toLowerCase(); if (!a.name.toLowerCase().includes(q) && !a.phone.includes(q) && !(a.stallId ?? '').toLowerCase().includes(q)) return false; }
    return true;
  }), [applicants, statusFilter, search]);

  const paged = paginate(filtered, page);

  return (
    <>
      <div className="page-header">
        <div><h2 className="page-title">Applicant Management</h2><p className="page-subtitle">Review stall applications and verify requirement submissions.</p></div>
        <div className="page-actions">
          <button className="btn-outline" onClick={() => setStatusFilter('')}><span className="material-symbols-outlined">tune</span>Clear Filter</button>
          <button className="btn-outline" disabled={filtered.length === 0} title={filtered.length === 0 ? 'No records match the current filters' : undefined} onClick={printList}><span className="material-symbols-outlined">print</span>Print List</button>
          <button className="btn-primary" onClick={onAdd}><span className="material-symbols-outlined">add</span>New Applicant</button>
        </div>
      </div>
      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-header"><span className="stat-label">Total Applicants</span></div>
          <div className="stat-value">{applicants.length}</div>
          <div className="stat-caption">{pendingApplicants} Pending, {approvedApplicants} Approved</div>
        </div>
        <div className="stat-card">
          <div className="stat-header"><span className="stat-label">Pending Review</span></div>
          <div className="stat-value">{pendingApplicants}</div>
          <div className="stat-caption">{percent(ratio(pendingApplicants, applicants.length))} of all applicants</div>
        </div>
        <div className="stat-card">
          <div className="stat-header"><span className="stat-label">Incomplete Docs</span></div>
          <div className="stat-value">{incompleteApplicants}</div>
          <div className="stat-caption">{incompleteApplicants === 0 ? 'None at this stage' : 'Awaiting requirements'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-header"><span className="stat-label">No Business Permit</span></div>
          <div className="stat-value danger">{applicants.filter((a) => a.status === 'No BP').length}</div>
          <div className="stat-caption">Trading without a permit on file</div>
        </div>
        <div className="stat-card">
          <div className="stat-header"><span className="stat-label">Approved (This Mo.)</span></div>
          <div className="stat-value">{approvedApplicants}</div>
          <div className="stat-caption">{applicants.filter(a => a.status === 'Rejected').length} Rejected, {applicants.length} Total</div>
        </div>
      </div>
      <div className="panel">
        <div className="filter-row">
          <select className="filter-select" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}><option value="">All Statuses</option><option value="Pending Review">Pending Review</option><option value="Incomplete">Incomplete</option><option value="No BP">No BP</option><option value="Approved">Approved</option><option value="Rejected">Rejected</option></select>
          <span className="table-info">Showing {paged.start}-{paged.end} of {paged.total}</span>
        </div>
        <div className="table-wrap">
          <table className="data-table"><thead><tr><th>Applicant Name</th><th>Stall</th><th>Date Applied</th><th>Requirements</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {paged.items.map((a, i) => {
                const done = submittedCount(a);
                return (
                  <tr key={a.id}>
                    <td><div className="applicant-cell"><div className={`avatar-initials ${getAvatarColor(i)}`}>{getInitials(a.name)}</div><div className="applicant-info"><div className="name">{a.name}</div><div className="phone">{formatPhone(a.phone)}</div></div></div></td><td className="no-wrap">{a.stallId || '—'}</td>
                    <td>{a.dateApplied}</td>
                    <td>
                      <div className="req-marks" title={REQUIREMENTS.map((r) => `${a.requirements.includes(r) ? '✓' : '✗'} ${r}`).join('\n')}>
                        {REQUIREMENTS.map((r) => (
                          <span key={r} className={`material-symbols-outlined req-mark ${a.requirements.includes(r) ? 'done' : 'missing'}`}>
                            {a.requirements.includes(r) ? 'check_circle' : 'radio_button_unchecked'}
                          </span>
                        ))}
                        <span className={`req-text${done === REQUIREMENTS.length ? ' complete' : ''}`}>{done}/{REQUIREMENTS.length}</span>
                      </div>
                    </td>
                    <td><StatusBadge status={a.status} /></td>
                    <td><div className="row-actions"><button type="button" className="row-icon-btn" title="View details" aria-label="View details" onClick={() => onView(a)}><span className="material-symbols-outlined">visibility</span></button><button type="button" className="row-icon-btn edit" title="Review applicant" aria-label="Review applicant" onClick={() => onEdit(a)}><span className="material-symbols-outlined">edit</span></button><button type="button" className="row-icon-btn danger" title="Delete applicant" aria-label="Delete applicant" onClick={() => onDelete(a)}><span className="material-symbols-outlined">delete</span></button></div></td>
                  </tr>
                );
              })}
              {paged.items.length === 0 && <tr><td colSpan={6}><div className="empty-state"><span className="material-symbols-outlined">person_search</span>No applicants match the current filters.</div></td></tr>}
            </tbody>
          </table>
        </div>
        <PaginationBar info={`Showing ${paged.start}-${paged.end} of ${paged.total}`} page={paged.page} totalPages={paged.totalPages} onPage={setPage} />
      </div>
    </>
  );
}

function EarningsFigure({ label, value, basis, tone }: { label: string; value: string; basis: string; tone?: string }) {
  return (
    <div className="earnings-figure">
      <span className="earnings-figure-label">{label}</span>
      <strong className={`earnings-figure-value${tone ? ` ${tone}` : ''}`}>{value}</strong>
      <span className="earnings-figure-basis">{basis}</span>
    </div>
  );
}

/* ============================================================
   Tenant Records Page
   ============================================================ */

function TenantRecordsPage({ tenants, search, onAdd, onView, onDelete, onSetRentPaid, onPrintList }: { tenants: Tenant[]; search: string; onAdd: () => void; onView: (t: Tenant) => void; onDelete: (t: Tenant) => void; onSetRentPaid: (tenantId: string, period: string, paid: boolean) => void; onPrintList: (title: string, subtitle: string, columns: string[], rows: string[][]) => void; }) {
  const printList = () => onPrintList(
    sectionFilter || 'All Sections',
    `Tenant register · rent for ${formatPeriodShort(period)}${search ? ` · matching “${search}”` : ''}`,
    ['Tenant ID', 'Name', 'Stall ID', 'Section', 'Monthly Rent', `Rent ${formatPeriodShort(period)}`, 'Collected', 'Discount', 'Status'],
    filtered.map((t) => {
      const payment = rentPaymentFor(t, period);
      return [
        t.id, t.name, t.stallId, t.section, money(t.rent), rentStatusOf(t, period),
        payment ? money(payment.amount) : '—',
        payment && payment.discount > 0 ? `−${money(payment.discount)}` : '—',
        t.status,
      ];
    }),
  );
  const [sectionFilter, setSectionFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [rentFilter, setRentFilter] = useState('');
  /* Rent is recorded a month at a time. The register opens on the current
     month; the picker is how a payment is entered against an earlier one. */
  const [period, setPeriod] = useState(currentPeriod);
  const [page, setPage] = useState(1);

  const activeCount = tenants.filter(t => t.status === 'Active').length;
  const expiringCount = tenants.filter(t => t.status === 'Expiring Soon').length;
  const monthlyRent = tenants.reduce((s, t) => s + t.rent, 0);
  const roll = useMemo(() => rentRollFor(tenants, period), [tenants, period]);

  useEffect(() => { setPage(1); }, [search]);

  const filtered = useMemo(() => tenants.filter((t) => {
    if (sectionFilter && t.section !== sectionFilter) return false;
    if (statusFilter && t.status !== statusFilter) return false;
    if (rentFilter) {
      const rent = rentStatusOf(t, period);
      // "Unpaid" covers everything not settled, overdue months included.
      if (rentFilter === 'Paid' && rent !== 'Paid') return false;
      if (rentFilter === 'Unpaid' && rent === 'Paid') return false;
      if (rentFilter === 'Overdue' && rent !== 'Overdue') return false;
    }
    if (search) { const q = search.toLowerCase(); if (!t.name.toLowerCase().includes(q) && !t.stallId.toLowerCase().includes(q) && !t.id.toLowerCase().includes(q) && !t.keepers.some((k) => k.name.toLowerCase().includes(q))) return false; }
    return true;
  }), [tenants, sectionFilter, statusFilter, rentFilter, period, search]);

  const paged = paginate(filtered, page);

  return (
    <>
      <div className="page-header">
        <div><h2 className="page-title">Tenant Records</h2><p className="page-subtitle">View and manage all tenant information and lease details.</p></div>
        <div className="page-actions">
          <button className="btn-outline" onClick={() => { setSectionFilter(''); setStatusFilter(''); setRentFilter(''); }}><span className="material-symbols-outlined">tune</span>Clear Filters</button>
          <button className="btn-outline" disabled={filtered.length === 0} title={filtered.length === 0 ? 'No records match the current filters' : undefined} onClick={printList}><span className="material-symbols-outlined">print</span>Print List</button>
          <button className="btn-primary" onClick={onAdd}><span className="material-symbols-outlined">add</span>New Tenant</button>
        </div>
      </div>
      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-header"><span className="stat-label">Total Tenants</span><span className="material-symbols-outlined stat-icon primary">groups</span></div>
          <div className="stat-value">{tenants.length}</div>
          <div className="stat-caption">{activeCount} Active, {expiringCount} Expiring</div>
        </div>
        <div className="stat-card">
          <div className="stat-header"><span className="stat-label">Active</span><span className="material-symbols-outlined stat-icon success">check_circle</span></div>
          <div className="stat-value success">{activeCount}</div>
          <div className="stat-caption">{percent(ratio(activeCount, tenants.length))} of all tenants</div>
        </div>
        <div className="stat-card">
          <div className="stat-header"><span className="stat-label">Expiring Soon</span><span className="material-symbols-outlined stat-icon warning">schedule</span></div>
          <div className="stat-value">{expiringCount}</div>
          <div className="stat-caption">{expiringCount === 0 ? 'No leases due' : 'Leases due for renewal'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-header"><span className="stat-label">Monthly Revenue</span><span className="material-symbols-outlined stat-icon primary">payments</span></div>
          <div className="stat-value">{moneyShort(monthlyRent)}</div>
          <div className="stat-caption">{money(Math.round(monthlyRent / Math.max(tenants.length, 1)))} average rent</div>
        </div>
        <div className="stat-card">
          <div className="stat-header"><span className="stat-label">Rent Collected</span><span className={`material-symbols-outlined stat-icon ${roll.overdueCount > 0 ? 'danger' : 'success'}`}>account_balance_wallet</span></div>
          <div className={`stat-value${roll.overdueCount > 0 ? ' danger' : ''}`}>{moneyShort(roll.collected)}</div>
          <div className="stat-caption">{formatPeriodShort(period)} · {roll.paidCount} paid, {roll.overdueCount} overdue</div>
          <div className="stat-progress"><div className="stat-progress-fill" style={{ width: `${ratio(roll.collected, roll.due)}%` }} /></div>
        </div>
      </div>
      <div className="panel">
        <div className="filter-row">
          <select className="filter-select" value={sectionFilter} onChange={(e) => { setSectionFilter(e.target.value); setPage(1); }}><option value="">All Sections</option>{SECTIONS.map(s => <option key={s} value={s}>{s}</option>)}</select>
          <select className="filter-select" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}><option value="">All Statuses</option><option value="Active">Active</option><option value="Expiring Soon">Expiring Soon</option></select>
          <select className="filter-select" value={rentFilter} onChange={(e) => { setRentFilter(e.target.value); setPage(1); }}><option value="">All Rent</option><option value="Paid">Rent Paid</option><option value="Unpaid">Rent Unpaid</option><option value="Overdue">Rent Overdue</option></select>
          <label className="filter-month">
            <span>Rent month</span>
            <input type="month" value={period} onChange={(e) => { setPeriod(e.target.value || currentPeriod()); setPage(1); }} />
          </label>
          <span className="table-info">Showing {paged.start}-{paged.end} of {paged.total} tenants</span>
        </div>
        <div className="table-wrap">
          <table className="data-table"><thead><tr><th>Tenant ID</th><th>Name</th><th>Stall ID</th><th>Section</th><th>Monthly Rent</th><th>Rent — {formatPeriodShort(period)}</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>
              {paged.items.map((t) => {
                const rentStatus = rentStatusOf(t, period);
                const paid = rentStatus === 'Paid';
                const payment = rentPaymentFor(t, period);
                const late = rentDaysLate(t, period);
                const quote = rentQuoteToday(t, period);
                const rentTitle = paid
                  ? `Paid ${payment?.paidOn ? formatIsoDate(payment.paidOn) : 'on an unrecorded date'}${payment && payment.discount > 0 ? ` — ${money(payment.amount)} after a ${money(payment.discount)} early-payment discount` : ''} — tick to undo`
                  : `Falls due ${formatIsoDate(rentDueIso(t, period))}${late > 0 ? ` · ${late} day${late === 1 ? '' : 's'} past due` : ''}${quote.early ? ` · pays ${money(quote.payable)} today with the ${EARLY_RENT_DISCOUNT_PCT}% early discount` : ''} — tick once collected`;
                return (
                  <tr key={t.id}>
                    <td><strong>{t.id}</strong></td>
                    <td className="no-wrap">{t.name}</td>
                    <td className="no-wrap">{t.stallId}</td>
                    <td className="no-wrap">{t.section}</td>
                    <td>{money(t.rent)}</td>
                    <td>
                      <label className="rent-toggle" title={rentTitle}>
                        <input type="checkbox" checked={paid} onChange={(e) => onSetRentPaid(t.id, period, e.target.checked)} aria-label={`Rent paid for ${formatPeriod(period)} by ${t.name}`} />
                        <RentStatusBadge status={rentStatus} />
                      </label>
                      {paid && payment && payment.discount > 0 && (
                        <span className="rent-discount-tag" title={`${money(t.rent)} less ${EARLY_RENT_DISCOUNT_PCT}% for paying on or before the due date`}>
                          −{money(payment.discount)} early
                        </span>
                      )}
                      {!paid && quote.early && quote.discount > 0 && (
                        <span className="rent-discount-tag muted" title={`Settled on or before ${formatIsoDate(rentDueIso(t, period))}, this month costs ${money(quote.payable)}`}>
                          {money(quote.payable)} if paid today
                        </span>
                      )}
                    </td>
                    <td><TenantStatusBadge status={t.status} /></td>
                    <td><div className="row-actions"><button type="button" className="row-icon-btn" title="View details" aria-label="View details" onClick={() => onView(t)}><span className="material-symbols-outlined">visibility</span></button><button type="button" className="row-icon-btn danger" title="Delete tenant" aria-label="Delete tenant" onClick={() => onDelete(t)}><span className="material-symbols-outlined">delete</span></button></div></td>
                  </tr>
                );
              })}
              {paged.items.length === 0 && <tr><td colSpan={8}><div className="empty-state"><span className="material-symbols-outlined">groups</span>No tenants match the current filters.</div></td></tr>}
            </tbody>
          </table>
        </div>
        <PaginationBar info={`Showing ${paged.start}-${paged.end} of ${paged.total}`} page={paged.page} totalPages={paged.totalPages} onPage={setPage} />
      </div>
    </>
  );
}

/* ============================================================
   Utility Billing Page — electricity & water calculator + records
   ============================================================ */

function UtilityBillingPage({ bills, tenants, stalls, search, onAdd, onView, onToggleStatus, onDelete, onPrint, onPrintBatch, onRecordMeter, onExport, onPrintList }: {
  bills: UtilityBill[]; tenants: Tenant[]; stalls: Stall[]; search: string;
  onAdd: (b: UtilityBill) => void; onView: (b: UtilityBill) => void;
  onToggleStatus: (id: string) => void; onDelete: (b: UtilityBill) => void;
  onPrint: (b: UtilityBill) => void;
  onPrintBatch: (bills: UtilityBill[]) => void;
  onRecordMeter: (tenantId: string, type: UtilityType, meterNumber: string) => void;
  onExport: () => void;
  onPrintList: (title: string, subtitle: string, columns: string[], rows: string[][]) => void;
}) {
  const printList = () => onPrintList(
    'Utility Billing',
    `${typeFilter || 'Electricity and water'} · ${statusFilter || 'All statuses'}${search ? ` · matching “${search}”` : ''}`,
    ['Bill ID', 'Type', 'Stall', 'Tenant', 'Amount', 'Due', 'Status'],
    filtered.map((b) => [b.id, b.type, b.stallId, b.tenantName || '—', money(b.amount), formatIsoDate(b.dueDate), isOverdue(b) ? 'Overdue' : b.status]),
  );
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => { setPage(1); }, [search]);

  const filtered = useMemo(() => bills.filter((b) => {
    if (typeFilter && b.type !== typeFilter) return false;
    if (statusFilter === 'Overdue') { if (!isOverdue(b)) return false; }
    else if (statusFilter && b.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!b.id.toLowerCase().includes(q) && !b.stallId.toLowerCase().includes(q) && !b.tenantName.toLowerCase().includes(q) && !billPeriodText(b).toLowerCase().includes(q)) return false;
    }
    return true;
  }), [bills, typeFilter, statusFilter, search]);

  const paged = paginate(filtered, page);

  /* Bills ticked for a batch print, held by id so the set survives paging and
     refiltering. Ids that fall out of the records entirely are dropped when
     the batch is built, so a deleted bill can never reach the printer. */
  const [selected, setSelected] = useState<string[]>([]);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const selectedBills = useMemo(
    () => selected.map((id) => bills.find((b) => b.id === id)).filter((b): b is UtilityBill => !!b),
    [selected, bills],
  );

  const toggleOne = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  /* The header box acts on the rows in view, which is what the officer can
     actually see — not the whole filtered set behind the pagination. */
  const pageIds = paged.items.map((b) => b.id);
  const allOnPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedSet.has(id));
  const togglePage = () =>
    setSelected((prev) => (allOnPageSelected
      ? prev.filter((id) => !pageIds.includes(id))
      : [...prev, ...pageIds.filter((id) => !prev.includes(id))]));

  const totals = useMemo(() => {
    const period = currentPeriod();
    return {
      billed: bills.reduce((s, b) => s + b.amount, 0),
      thisMonth: bills.filter((b) => b.period === period).reduce((s, b) => s + b.amount, 0),
      electricity: bills.filter((b) => b.type === 'Electricity').reduce((s, b) => s + b.amount, 0),
      water: bills.filter((b) => b.type === 'Water').reduce((s, b) => s + b.amount, 0),
      unpaid: bills.filter((b) => b.status === 'Unpaid').reduce((s, b) => s + b.amount, 0),
      unpaidCount: bills.filter((b) => b.status === 'Unpaid').length,
      paidCount: bills.filter((b) => b.status === 'Paid').length,
      overdueCount: bills.filter(isOverdue).length,
      kwh: bills.filter((b) => b.type === 'Electricity').reduce((s, b) => s + b.consumption, 0),
      cubic: bills.filter((b) => b.type === 'Water').reduce((s, b) => s + b.consumption, 0),
    };
  }, [bills]);

  return (
    <>
      <div className="page-header">
        <div><h2 className="page-title">Utility Billing</h2><p className="page-subtitle">Compute electricity and water charges and post them to a stall or tenant record.</p></div>
        <div className="page-actions">
          <button className="btn-outline" onClick={() => { setTypeFilter(''); setStatusFilter(''); }}><span className="material-symbols-outlined">tune</span>Clear Filters</button>
          <button className="btn-outline" disabled={filtered.length === 0} title={filtered.length === 0 ? 'No records match the current filters' : undefined} onClick={printList}><span className="material-symbols-outlined">print</span>Print List</button>
          <button className="btn-outline" onClick={onExport}><span className="material-symbols-outlined">download</span>Export CSV</button>
        </div>
      </div>

      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-header"><span className="stat-label">Total Billed</span><span className="material-symbols-outlined stat-icon primary">receipt_long</span></div>
          <div className="stat-value">{moneyShort(totals.billed)}</div>
          <div className="stat-caption">{bills.length} bill{bills.length === 1 ? '' : 's'} on record, {totals.paidCount} Paid</div>
        </div>
        <div className="stat-card">
          <div className="stat-header"><span className="stat-label">Electricity</span><span className="material-symbols-outlined stat-icon warning">bolt</span></div>
          <div className="stat-value">{moneyShort(totals.electricity)}</div>
          <div className="stat-caption">{totals.kwh.toLocaleString()} {UTILITY_PRESETS.Electricity.unit} billed</div>
        </div>
        <div className="stat-card">
          <div className="stat-header"><span className="stat-label">Water</span><span className="material-symbols-outlined stat-icon primary">water_drop</span></div>
          <div className="stat-value">{moneyShort(totals.water)}</div>
          <div className="stat-caption">{totals.cubic.toLocaleString()} {UTILITY_PRESETS.Water.unit} billed</div>
        </div>
        <div className="stat-card">
          <div className="stat-header"><span className="stat-label">Outstanding</span><span className="material-symbols-outlined stat-icon danger">payments</span></div>
          <div className="stat-value danger">{moneyShort(totals.unpaid)}</div>
          <div className="stat-caption">{totals.unpaidCount} Unpaid, {totals.overdueCount} Overdue</div>
        </div>
      </div>

      <BillCalculator bills={bills} tenants={tenants} stalls={stalls} onAdd={onAdd} onPrint={onPrint} onRecordMeter={onRecordMeter} />

      <div className="panel" style={{ marginTop: '20px' }}>
        <div className="panel-header"><h3 className="panel-title">Billing Records</h3></div>
        <div className="filter-row">
          <select className="filter-select" value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}><option value="">All Utilities</option>{UTILITY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select>
          <select className="filter-select" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}><option value="">All Statuses</option><option value="Unpaid">Unpaid</option><option value="Paid">Paid</option><option value="Overdue">Overdue</option></select>
          <span className="table-info">Showing {paged.start}-{paged.end} of {paged.total} bills</span>
        </div>

        {/* Only appears once something is ticked, so the table is unchanged
            for the ordinary one-bill-at-a-time way of working. */}
        {selectedBills.length > 0 && (
          <div className="batch-bar">
            <span className="batch-count">
              <span className="material-symbols-outlined">checklist</span>
              {selectedBills.length} bill{selectedBills.length === 1 ? '' : 's'} selected
              <span className="batch-sheets">· {Math.ceil(selectedBills.length / RECEIPTS_PER_SHEET)} A4 sheet{Math.ceil(selectedBills.length / RECEIPTS_PER_SHEET) === 1 ? '' : 's'}, {RECEIPTS_PER_SHEET} receipts to a sheet</span>
            </span>
            <div className="batch-actions">
              <button type="button" className="btn-outline" onClick={() => setSelected([])}>Clear Selection</button>
              <button type="button" className="btn-primary" onClick={() => onPrintBatch(selectedBills)}>
                <span className="material-symbols-outlined">print</span>Print {selectedBills.length} Receipt{selectedBills.length === 1 ? '' : 's'}
              </button>
            </div>
          </div>
        )}

        <div className="table-wrap">
          <table className="data-table">
            <thead><tr>
              <th className="check-col">
                <input
                  type="checkbox"
                  aria-label={allOnPageSelected ? 'Clear selection on this page' : 'Select every bill on this page'}
                  checked={allOnPageSelected}
                  disabled={pageIds.length === 0}
                  onChange={togglePage}
                />
              </th>
              <th>Bill ID</th><th>Utility</th><th>Stall No.</th><th>Meter No.</th><th>Tenant</th><th>Period</th><th>Consumption</th><th>Amount</th><th>Status</th><th>Action</th>
            </tr></thead>
            <tbody>
              {paged.items.map((b) => (
                <tr key={b.id} className={selectedSet.has(b.id) ? 'row-selected' : undefined}>
                  <td className="check-col">
                    <input
                      type="checkbox"
                      aria-label={`Select bill ${b.id} for printing`}
                      checked={selectedSet.has(b.id)}
                      onChange={() => toggleOne(b.id)}
                    />
                  </td>
                  <td><strong>{b.id}</strong></td>
                  <td><span className={`utility-tag ${b.type.toLowerCase()}`}><span className="material-symbols-outlined">{UTILITY_PRESETS[b.type].icon}</span>{b.type}</span></td>
                  <td><strong>{b.stallId}</strong></td>
                  <td className={b.meterNumber ? '' : 'tenant-cell'}>{b.meterNumber || 'Not on record'}</td>
                  <td className={b.tenantName ? '' : 'tenant-cell'}>{b.tenantName || 'Unassigned'}</td>
                  <td>{billPeriodText(b)}</td>
                  <td>{b.consumption.toLocaleString()} {UTILITY_PRESETS[b.type].unit}</td>
                  <td><strong>{money(b.amount)}</strong></td>
                  <td><BillStatusBadge bill={b} /></td>
                  <td>
                    <div className="row-actions">
                      <button type="button" className="row-icon-btn" title="View bill" aria-label="View bill" onClick={() => onView(b)}><span className="material-symbols-outlined">visibility</span></button>
                      <button type="button" className="row-icon-btn" title={b.status === 'Paid' ? 'Mark unpaid' : 'Mark paid'} aria-label={b.status === 'Paid' ? 'Mark unpaid' : 'Mark paid'} onClick={() => onToggleStatus(b.id)}><span className="material-symbols-outlined">{b.status === 'Paid' ? 'undo' : 'check_circle'}</span></button>
                      <button type="button" className="row-icon-btn" title="Print receipt" aria-label="Print receipt" onClick={() => onPrint(b)}><span className="material-symbols-outlined">print</span></button>
                      <button type="button" className="row-icon-btn danger" title="Delete bill" aria-label="Delete bill" onClick={() => onDelete(b)}><span className="material-symbols-outlined">delete</span></button>
                    </div>
                  </td>
                </tr>
              ))}
              {paged.items.length === 0 && <tr><td colSpan={11}><div className="empty-state"><span className="material-symbols-outlined">receipt_long</span>No utility bills match the current filters.</div></td></tr>}
            </tbody>
          </table>
        </div>
        <PaginationBar info={`Showing ${paged.start}-${paged.end} of ${paged.total}`} page={paged.page} totalPages={paged.totalPages} onPage={setPage} />
      </div>
    </>
  );
}

function BillCalculator({ bills, tenants, stalls, onAdd, onPrint, onRecordMeter }: {
  bills: UtilityBill[]; tenants: Tenant[]; stalls: Stall[];
  onAdd: (b: UtilityBill) => void; onPrint: (b: UtilityBill) => void;
  onRecordMeter: (tenantId: string, type: UtilityType, meterNumber: string) => void;
}) {
  const [type, setType] = useState<UtilityType>('Electricity');
  const [stallId, setStallId] = useState('');
  const [tenantId, setTenantId] = useState('');
  const [meterNumber, setMeterNumber] = useState('');
  /* The period is read to the day. It still belongs to the month its end date
     falls in, which is what groups and de-duplicates bills. */
  const [periodStart, setPeriodStart] = useState(() => monthStartIso(currentPeriod()));
  const [periodEnd, setPeriodEnd] = useState(() => monthEndIso(currentPeriod()));
  const period = periodOf(periodEnd);

  const applyPeriodEnd = (next: string) => {
    setPeriodEnd(next);
    if (!dueTouched && next) setDueDate(isoPlusDays(next, 15));
    setError('');
  };
  const [previous, setPrevious] = useState('');
  const [current, setCurrent] = useState('');
  const [rate, setRate] = useState(String(UTILITY_PRESETS.Electricity.rate));
  /* The bill falls due after the period it covers. Moving the period end drags
     the due date with it, until the officer sets one of their own. */
  const [dueDate, setDueDate] = useState(() => isoPlusDays(monthEndIso(currentPeriod()), 15));
  const [dueTouched, setDueTouched] = useState(false);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [duplicatePrompt, setDuplicatePrompt] = useState<UtilityBill | null>(null);

  const preset = UTILITY_PRESETS[type];

  const stallOptions = useMemo(() => {
    const ids = new Set<string>();
    stalls.forEach((s) => ids.add(s.id));
    tenants.forEach((t) => { if (t.stallId && t.stallId !== '—') ids.add(t.stallId); });
    return Array.from(ids).sort();
  }, [stalls, tenants]);

  const tenantForStall = useCallback((sid: string) => tenants.find((t) => t.stallId === sid), [tenants]);

  const selectedTenant = tenants.find((t) => t.id === tenantId);
  const section = useMemo(() => {
    if (selectedTenant) return selectedTenant.section;
    return stalls.find((s) => s.id === stallId)?.section ?? '';
  }, [selectedTenant, stalls, stallId]);

  /* Picking a stall, a tenant or a utility refills the two things that are
     already on record for them: the meter serving that tenancy, and the closing
     reading of their last bill of the same utility. Both stay editable. */
  const fillFromRecords = (sid: string, tenant: Tenant | undefined, nextType: UtilityType) => {
    const last = sid ? lastReadingFor(bills, sid, nextType) : null;
    setPrevious(last !== null ? String(last) : '');
    // `||`, not `??`: a tenant with no meter on file holds '', and an empty
    // string has to fall through to the number the last bill was raised against.
    setMeterNumber(tenant?.meters[nextType] || lastMeterFor(bills, sid, nextType));
  };

  const applyType = (next: UtilityType) => {
    setType(next);
    setRate(String(UTILITY_PRESETS[next].rate));
    fillFromRecords(stallId, tenants.find((t) => t.id === tenantId), next);
    setError('');
  };

  const applyStall = (sid: string) => {
    setStallId(sid);
    const t = tenantForStall(sid);
    setTenantId(t ? t.id : '');
    fillFromRecords(sid, t, type);
    setError('');
  };


  /* Where the meter number in the box came from, so nobody has to guess whether
     it was filled in for them or is about to be recorded for the first time. */
  const meterHint = (() => {
    if (!stallId && !selectedTenant) return 'Select a stall or tenant and the meter on record fills in here.';
    if (selectedTenant?.meters[type]) return `On record for ${selectedTenant.name}.`;
    if (lastMeterFor(bills, stallId, type)) return `Carried over from the last ${type.toLowerCase()} bill for ${stallId}.`;
    if (selectedTenant) return `No ${type.toLowerCase()} meter on record for ${selectedTenant.name} — what you enter is saved to the tenant.`;
    return 'No meter on record for this stall yet.';
  })();

  const prevNum = toAmount(previous);
  const currNum = toAmount(current);
  const rateNum = toAmount(rate);
  const { consumption, amount } = computeBill(prevNum, currNum, rateNum);
  const readingsInverted = current !== '' && currNum < prevNum;
  /* A live heads-up, not an enforced figure — the bill is not on record yet,
     so nothing here is what actually prints; it just warns the officer before
     they save or print that the due date they picked has already passed. */
  const wouldBeOverdue = !!dueDate && dueDate < todayIso();
  /* What the surcharge would come to. Worked out whether or not the bill has
     gone late, so the officer can tell the tenant what waits for them; it is
     added to the total only once the due date has actually passed. */
  const previewSurcharge = Math.round(amount * (SURCHARGE_RATES[type] / 100) * 100) / 100;

  const resetForm = () => {
    setCurrent(''); setNotes(''); setError('');
  };

  /* Everything both Save and Print insist on before a bill is worth issuing. */
  const validate = () => {
    if (!stallId) return 'Select the stall number this bill belongs to.';
    if (current === '') return 'Enter the current meter reading.';
    if (isNegative(previous) || isNegative(current)) return 'Meter readings cannot be negative.';
    if (readingsInverted) return 'Current reading cannot be lower than the previous reading.';
    if (rateNum <= 0) return 'Rate per unit must be greater than zero.';
    if (!periodStart || !periodEnd) return 'Set the days this billing period covers.';
    if (periodEnd < periodStart) return 'The billing period cannot end before it starts.';
    if (dueDate && dueDate < periodEnd) return 'The due date falls before the billing period ends.';
    return '';
  };

  /* The bill as the form currently reads it, with no ID — it has no number
     until it is on record. */
  const draftBill = (): UtilityBill => {
    const tenant = tenants.find((t) => t.id === tenantId);
    return {
      id: '',
      type,
      stallId,
      tenantId: tenant?.id ?? '',
      tenantName: tenant?.name ?? '',
      section,
      meterNumber: meterNumber.trim(),
      period,
      periodStart,
      periodEnd,
      previousReading: prevNum,
      currentReading: currNum,
      consumption,
      rate: rateNum,
      amount,
      status: 'Unpaid',
      dateIssued: todayIso(),
      dueDate,
      notes: notes.trim(),
    };
  };

  const handleSave = () => {
    const problem = validate();
    if (problem) { setError(problem); return; }
    const duplicate = bills.find((b) => b.stallId === stallId && b.type === type && b.period === period);
    if (duplicate) { setDuplicatePrompt(duplicate); return; }
    commitBill();
  };

  const commitBill = () => {
    setDuplicatePrompt(null);
    onAdd({ ...draftBill(), id: nextId('UTL', bills.map((b) => b.id)) });
    // A meter typed in for a tenant who had none on file belongs on the tenant.
    onRecordMeter(tenantId, type, meterNumber);

    setPrevious(String(currNum));
    resetForm();
  };

  /* A receipt carries a bill number only when this exact bill is already on
     record — matched on the stall, utility and month that identify a bill here,
     and on the figures, so an edited form never prints under an old number. */
  const handlePrint = () => {
    const problem = validate();
    if (problem) { setError(problem); return; }
    const onRecord = bills.find((b) =>
      b.stallId === stallId && b.type === type && b.period === period
      && b.previousReading === prevNum && b.currentReading === currNum && b.amount === amount);
    onPrint(onRecord ?? draftBill());
  };

  return (
    <div className="panel calc-panel">
      <div className="panel-header">
        <h3 className="panel-title">Utility Bill Calculator</h3>
        <div className="utility-toggle">
          {UTILITY_TYPES.map((t) => (
            <button key={t} className={`utility-toggle-btn ${t.toLowerCase()}${type === t ? ' active' : ''}`} onClick={() => applyType(t)}>
              <span className="material-symbols-outlined">{UTILITY_PRESETS[t].icon}</span>{t}
            </button>
          ))}
        </div>
      </div>

      <div className="calc-grid">
        <div className="calc-form">
          {/* The stall is the only thing asked for: it already names its tenant,
              and carries the meter and the last reading with it. A separate
              tenant field only invited the two to disagree. */}
          <div className="form-group">
            <label className="form-label">Stall Number *</label>
            <select className="form-select" value={stallId} onChange={(e) => applyStall(e.target.value)}>
              <option value="">Select stall…</option>
              {stallOptions.map((sid) => {
                const t = tenantForStall(sid);
                return <option key={sid} value={sid}>{sid}{t ? ` — ${t.name}` : ' — vacant'}</option>;
              })}
            </select>
            <span className="form-hint">
              {selectedTenant
                ? `Billed to ${selectedTenant.name}. Meter number and last reading filled in from the record.`
                : stallId
                  ? 'No tenant on file for this stall — the bill is charged to the stall itself.'
                  : 'Choosing a stall fills in the tenant, the meter number and the last reading on record.'}
            </span>
          </div>

          <div className="form-group">
            <label className="form-label">{type} Meter Number</label>
            <input className="form-input" value={meterNumber} onChange={(e) => { setMeterNumber(e.target.value); setError(''); }} placeholder={`e.g. ${type === 'Electricity' ? 'EM-1101' : 'WM-2301'}`} />
            <span className="form-hint">{meterHint}</span>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Period Covered — From *</label>
              <input className="form-input" type="date" value={periodStart} onChange={(e) => { setPeriodStart(e.target.value); setError(''); }} />
              <span className="form-hint">First day the reading covers.</span>
            </div>
            <div className="form-group">
              <label className="form-label">Period Covered — To *</label>
              <input className="form-input" type="date" min={periodStart} value={periodEnd} onChange={(e) => applyPeriodEnd(e.target.value)} />
              <span className="form-hint">{periodEnd && periodStart && periodEnd >= periodStart ? `${periodDays(periodStart, periodEnd)} day${periodDays(periodStart, periodEnd) === 1 ? '' : 's'} · filed under ${formatPeriod(period)}.` : 'Day the meter was read.'}</span>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Due Date</label>
              <input className="form-input" type="date" min={periodEnd} value={dueDate} onChange={(e) => { setDueTouched(true); setDueDate(e.target.value); setError(''); }} />
            </div>
            <div className="form-group">
              <label className="form-label">Whole Month</label>
              <button
                className="btn-outline"
                type="button"
                onClick={() => {
                  setPeriodStart(monthStartIso(period));
                  applyPeriodEnd(monthEndIso(period));
                }}
              >
                <span className="material-symbols-outlined">event_repeat</span>Cover all of {formatPeriod(period)}
              </button>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Previous Reading ({preset.unit})</label>
              <input className="form-input" type="number" min="0" step="any" value={previous} onChange={(e) => { setPrevious(e.target.value); setError(''); }} placeholder="0" />
              <span className="form-hint">{stallId && lastReadingFor(bills, stallId, type) !== null ? `Carried over from the last ${type.toLowerCase()} bill for ${stallId}.` : 'No previous bill found — enter the starting reading.'}</span>
            </div>
            <div className="form-group">
              <label className="form-label">Current Reading ({preset.unit}) *</label>
              <input className="form-input" type="number" min="0" step="any" value={current} onChange={(e) => { setCurrent(e.target.value); setError(''); }} placeholder="0" />
              {readingsInverted && <span className="form-hint error">Must be at least {prevNum.toLocaleString()}.</span>}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Rate per {preset.unit} (₱)</label>
            <input className="form-input" type="number" min="0" step="0.01" value={rate} onChange={(e) => { setRate(e.target.value); setError(''); }} />
            <span className="form-hint">The market's fee schedule sets this at {money(UTILITY_PRESETS[type].rate)} per {preset.unit} for {type.toLowerCase()} — editable per bill if a stall is metered on a different rate.</span>
          </div>

          <div className="form-group">
            <label className="form-label">Notes</label>
            <input className="form-input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional remarks for this billing period" />
          </div>
        </div>

        <div className="calc-summary">
          <div className={`calc-summary-head ${type.toLowerCase()}`}>
            <span className="material-symbols-outlined">{preset.icon}</span>
            <div>
              <strong>{type} Bill</strong>
              <span>{stallId ? `Stall ${stallId}` : 'No stall selected'}{selectedTenant ? ` · ${selectedTenant.name}` : ''}</span>
            </div>
          </div>
          <div className="calc-row"><span>Meter number</span><strong>{meterNumber.trim() || 'Not on record'}</strong></div>
          <div className="calc-row"><span>Period covered</span><strong>{formatPeriodRange(periodStart, periodEnd)}</strong></div>
          <div className="calc-row"><span>Previous reading</span><strong>{prevNum.toLocaleString()} {preset.unit}</strong></div>
          <div className="calc-row"><span>Current reading</span><strong>{currNum.toLocaleString()} {preset.unit}</strong></div>
          <div className="calc-row highlight"><span>Consumption</span><strong>{consumption.toLocaleString()} {preset.unit}</strong></div>
          <div className="calc-row"><span>Rate per {preset.unit}</span><strong>{money(rateNum)}</strong></div>
          <div className="calc-row"><span>{consumption.toLocaleString()} {preset.unit} × {money(rateNum)}</span><strong>{money(amount)}</strong></div>
          {/* The surcharge is always shown, so the tenant can be told what
              lateness costs before it costs it. It joins the total only after
              the due date, and never joins the amount saved to records. */}
          <div className={`calc-row${wouldBeOverdue ? ' warning' : ' muted'}`}>
            <span>Late Surcharge ({SURCHARGE_RATES[type]}%){wouldBeOverdue ? ' — due date already passed' : ` — only if unpaid after ${formatIsoDate(dueDate)}`}</span>
            <strong>{wouldBeOverdue ? '+' : ''}{money(previewSurcharge)}</strong>
          </div>
          <div className="calc-total"><span>{wouldBeOverdue ? 'Total if Printed Today' : 'Total Amount Due'}</span><strong>{money(wouldBeOverdue ? amount + previewSurcharge : amount)}</strong></div>
          <p className="calc-surcharge-note">
            {wouldBeOverdue
              ? `This due date has already passed, so a receipt printed today carries the surcharge automatically. The amount saved to records stays ${money(amount)} — the surcharge applies only to what prints.`
              : `Not applied yet. If this bill is still unpaid after ${formatIsoDate(dueDate)}, a receipt printed from then on carries ${money(previewSurcharge)} on top, bringing it to ${money(amount + previewSurcharge)}. The amount on record stays ${money(amount)}.`}
          </p>
          <div className="calc-row"><span>Due date</span><strong>{formatIsoDate(dueDate)}</strong></div>
          {error && <div className="calc-error"><span className="material-symbols-outlined">error</span>{error}</div>}
          <div className="calc-actions">
            <button className="btn-outline" onClick={() => { setStallId(''); setTenantId(''); setMeterNumber(''); setPrevious(''); setCurrent(''); setNotes(''); setError(''); }}>Clear</button>
            <button className="btn-outline" onClick={handlePrint}><span className="material-symbols-outlined">print</span>Print Receipt</button>
            <button className="btn-primary" onClick={handleSave}><span className="material-symbols-outlined">save</span>Save to Records</button>
          </div>
        </div>
      </div>

      {duplicatePrompt && (
        <ConfirmDialog
          icon="content_copy" iconStyle="warning"
          title="A bill already exists for this period"
          description={`Stall ${stallId} already has ${type === 'Electricity' ? 'an' : 'a'} ${type.toLowerCase()} bill for ${formatPeriod(period)} (${duplicatePrompt.id}, ${money(duplicatePrompt.amount)}). Issue another one anyway?`}
          confirmLabel="Issue Anyway"
          onConfirm={commitBill}
          onCancel={() => setDuplicatePrompt(null)}
        />
      )}
    </div>
  );
}

/* ============================================================
   Violations Page — the register of citations issued to tenants
   ============================================================ */

function ViolationsPage({ violations, search, onAdd, onView, onEdit, onDelete, onExport, onPrintList }: {
  violations: Violation[]; search: string;
  onAdd: () => void; onView: (v: Violation) => void; onEdit: (v: Violation) => void;
  onDelete: (v: Violation) => void; onExport: () => void;
  onPrintList: (title: string, subtitle: string, columns: string[], rows: string[][]) => void;
}) {
  const printList = () => onPrintList(
    'Violations',
    `${statusFilter || 'All statuses'}${search ? ` · matching “${search}”` : ''}`,
    ['Violation ID', 'Tenant', 'Issue', 'Points', 'Status', 'Recorded'],
    ordered.map((v) => [v.id, v.tenant, v.issue, String(v.points), v.status, v.dateRecorded ? formatIsoDate(v.dateRecorded) : '—']),
  );
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => { setPage(1); }, [search]);

  const filtered = useMemo(() => violations.filter((v) => {
    if (statusFilter && v.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!v.id.toLowerCase().includes(q) && !v.tenant.toLowerCase().includes(q) && !v.issue.toLowerCase().includes(q) && !v.notes.toLowerCase().includes(q)) return false;
    }
    return true;
  }), [violations, statusFilter, search]);

  const ordered = useMemo(
    () => [...filtered].sort((a, b) =>
      (a.status === b.status ? 0 : a.status === 'Open' ? -1 : 1)
      || (b.dateRecorded || '').localeCompare(a.dateRecorded || '')
      || b.id.localeCompare(a.id)),
    [filtered],
  );

  const paged = paginate(ordered, page);

  const openList = useMemo(() => violations.filter((v) => v.status === 'Open'), [violations]);
  const openPoints = useMemo(() => openList.reduce((s, v) => s + v.points, 0), [openList]);

  const repeatOffenders = useMemo(() => {
    const map = new Map<string, { count: number; points: number }>();
    openList.forEach((v) => {
      const entry = map.get(v.tenant) ?? { count: 0, points: 0 };
      map.set(v.tenant, { count: entry.count + 1, points: entry.points + v.points });
    });
    return [...map.entries()].sort((a, b) => b[1].points - a[1].points || b[1].count - a[1].count).slice(0, 6);
  }, [openList]);

  return (
    <>
      <div className="page-header">
        <div><h2 className="page-title">Violations</h2><p className="page-subtitle">Record citations issued to tenants and track them through to resolution.</p></div>
        <div className="page-actions">
          <button className="btn-outline" onClick={() => setStatusFilter('')}><span className="material-symbols-outlined">tune</span>Clear Filter</button>
          <button className="btn-outline" onClick={onExport}><span className="material-symbols-outlined">download</span>Export CSV</button>
          <button className="btn-outline" disabled={ordered.length === 0} title={ordered.length === 0 ? 'No records match the current filters' : undefined} onClick={printList}><span className="material-symbols-outlined">print</span>Print List</button>
          <button className="btn-primary" onClick={onAdd}><span className="material-symbols-outlined">add</span>Record Violation</button>
        </div>
      </div>

      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-header"><span className="stat-label">Total Violations</span><span className="material-symbols-outlined stat-icon">gavel</span></div>
          <div className="stat-value">{violations.length}</div>
          <div className="stat-caption">{openList.length} Open, {violations.length - openList.length} Resolved</div>
        </div>
        <div className="stat-card">
          <div className="stat-header"><span className="stat-label">Open</span><span className="material-symbols-outlined stat-icon danger">error</span></div>
          <div className="stat-value danger">{openList.length}</div>
          <div className="stat-caption">{percent(ratio(openList.length, violations.length))} of all cases</div>
        </div>
        <div className="stat-card">
          <div className="stat-header"><span className="stat-label">Resolved</span><span className="material-symbols-outlined stat-icon success">check_circle</span></div>
          <div className="stat-value success">{violations.length - openList.length}</div>
          <div className="stat-caption">{percent(ratio(violations.length - openList.length, violations.length))} of all cases</div>
        </div>
        <div className="stat-card">
          <div className="stat-header"><span className="stat-label">Open Demerit Points</span><span className="material-symbols-outlined stat-icon warning">warning</span></div>
          <div className="stat-value">{openPoints}</div>
          <div className="stat-caption">Across {openList.length} open case{openList.length === 1 ? '' : 's'}</div>
        </div>
      </div>

      {repeatOffenders.length > 0 && (
        <div className="panel" style={{ marginBottom: '20px' }}>
          <div className="panel-header"><h3 className="panel-title">Open Points by Tenant</h3></div>
          <div className="analytics-stats">
            {repeatOffenders.map(([tenant, s]) => (
              <div className="stat-pill" key={tenant}><span>{tenant} · {s.count} open</span><strong>{s.points} pt{s.points === 1 ? '' : 's'}</strong></div>
            ))}
          </div>
        </div>
      )}

      <div className="panel">
        <div className="filter-row">
          <select className="filter-select" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}><option value="">All Statuses</option><option value="Open">Open</option><option value="Resolved">Resolved</option></select>
          <span className="table-info">Showing {paged.start}-{paged.end} of {paged.total} violations</span>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Violation ID</th><th>Tenant</th><th>Issue</th><th>Points</th><th>Recorded</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {paged.items.map((v) => (
                <tr key={v.id}>
                  <td><strong>{v.id}</strong></td>
                  <td>{v.tenant}</td>
                  <td>{v.issue}</td>
                  <td><strong>{v.points}</strong></td>
                  <td>{v.dateRecorded ? formatIsoDate(v.dateRecorded) : '—'}</td>
                  <td><StatusBadge status={v.status} /></td>
                  <td>
                    <div className="row-actions">
                      <button type="button" className="row-icon-btn" title="View violation" aria-label="View violation" onClick={() => onView(v)}><span className="material-symbols-outlined">visibility</span></button>
                      <button type="button" className="row-icon-btn edit" title="Edit violation — resolve or reopen it here" aria-label="Edit violation" onClick={() => onEdit(v)}><span className="material-symbols-outlined">edit</span></button>
                      <button type="button" className="row-icon-btn danger" title="Delete violation" aria-label="Delete violation" onClick={() => onDelete(v)}><span className="material-symbols-outlined">delete</span></button>
                    </div>
                  </td>
                </tr>
              ))}
              {paged.items.length === 0 && <tr><td colSpan={7}><div className="empty-state"><span className="material-symbols-outlined">gavel</span>{violations.length === 0 ? 'No violations recorded. Use "Record Violation" to cite a tenant.' : 'No violations match the current filters.'}</div></td></tr>}
            </tbody>
          </table>
        </div>
        <PaginationBar info={`Showing ${paged.start}-${paged.end} of ${paged.total}`} page={paged.page} totalPages={paged.totalPages} onPage={setPage} />
      </div>
    </>
  );
}

/**
 * One form for both recording and editing a citation — the fields are identical,
 * so splitting them would only duplicate the validation.
 */
function ViolationForm({ violation, existingIds, tenants, onSubmit, onCancel }: {
  violation?: Violation; existingIds: string[]; tenants: Tenant[];
  onSubmit: (v: Violation) => void; onCancel: () => void;
}) {
  const [tenant, setTenant] = useState(violation?.tenant ?? '');
  const [issue, setIssue] = useState(violation?.issue ?? '');
  const [points, setPoints] = useState(violation?.points ?? 1);
  const [status, setStatus] = useState<ViolationStatus>(violation?.status ?? 'Open');
  const [dateRecorded, setDateRecorded] = useState(violation?.dateRecorded || todayIso());
  const [dateResolved, setDateResolved] = useState(violation?.dateResolved ?? '');
  const [notes, setNotes] = useState(violation?.notes ?? '');
  const [error, setError] = useState('');

  const applyStatus = (next: ViolationStatus) => {
    setStatus(next);
    setDateResolved(next === 'Resolved' ? (dateResolved || todayIso()) : '');
    setError('');
  };

  const handleSubmit = () => {
    if (!tenant.trim()) { setError('Enter the tenant or party being cited.'); return; }
    if (!issue.trim()) { setError('Describe the violation.'); return; }
    if (dateResolved && dateRecorded && dateResolved < dateRecorded) { setError('Resolution date cannot be earlier than the date recorded.'); return; }
    onSubmit({
      ...(violation ?? {}),
      id: violation?.id ?? nextId('VIO', existingIds),
      tenant: tenant.trim(),
      issue: issue.trim(),
      points,
      status,
      dateRecorded,
      dateResolved: status === 'Resolved' ? (dateResolved || todayIso()) : '',
      notes: notes.trim(),
    });
  };

  return (
    <div className="form-grid">
      {violation && (
        <div className="form-row">
          <div className="form-group"><label className="form-label">Violation ID</label><input className="form-input" value={violation.id} disabled /></div>
          <div className="form-group"><label className="form-label">Current Status</label><div style={{ paddingTop: '8px' }}><StatusBadge status={violation.status} /></div></div>
        </div>
      )}
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Tenant / Party Cited *</label>
          <input className="form-input" list="violation-tenant-options" placeholder="e.g. GERILLA, JOHN DRANDREB" value={tenant} onChange={(e) => { setTenant(e.target.value); setError(''); }} />
          <datalist id="violation-tenant-options">{tenants.map((t) => <option key={t.id} value={t.name}>{t.stallId}</option>)}</datalist>
          <span className="form-hint">Pick a tenant on record, or type any other party.</span>
        </div>
        <div className="form-group">
          <label className="form-label">Demerit Points</label>
          <input className="form-input" type="number" min="0" step="1" value={points} onChange={(e) => setPoints(toAmount(e.target.value))} />
          <span className="form-hint">Weight of the offence — open points are totalled per tenant.</span>
        </div>
      </div>
      <div className="form-group">
        <label className="form-label">Violation *</label>
        <input className="form-input" list="violation-issue-options" placeholder="e.g. Health code violation" value={issue} onChange={(e) => { setIssue(e.target.value); setError(''); }} />
        <datalist id="violation-issue-options">{VIOLATION_ISSUES.map((v) => <option key={v} value={v} />)}</datalist>
      </div>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Status</label>
          <select className="form-select" value={status} onChange={(e) => applyStatus(e.target.value as ViolationStatus)}><option value="Open">Open</option><option value="Resolved">Resolved</option></select>
        </div>
        <div className="form-group">
          <label className="form-label">Date Recorded</label>
          <input className="form-input" type="date" value={dateRecorded} onChange={(e) => { setDateRecorded(e.target.value); setError(''); }} />
        </div>
      </div>
      {status === 'Resolved' && (
        <div className="form-group">
          <label className="form-label">Date Resolved</label>
          <input className="form-input" type="date" value={dateResolved} onChange={(e) => { setDateResolved(e.target.value); setError(''); }} />
        </div>
      )}
      <div className="form-group">
        <label className="form-label">Notes</label>
        <textarea className="form-textarea" placeholder="What was observed, what action was taken..." value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      {error && <div className="form-error"><span className="material-symbols-outlined">error</span>{error}</div>}
      <div className="modal-footer" style={{ padding: 0, borderTop: 'none', justifyContent: 'flex-end' }}>
        <button className="btn-outline" onClick={onCancel}>Cancel</button>
        <button className="btn-primary" onClick={handleSubmit}>{violation ? 'Save Changes' : 'Record Violation'}</button>
      </div>
    </div>
  );
}

function ViolationEditForm({ violation, current, tenants, onSave, onClose }: {
  violation: Violation; current: Violation; tenants: Tenant[];
  onSave: (v: Violation, opts?: SaveOpts, previous?: Violation) => void; onClose: () => void;
}) {
  // Blank draft — anything left blank keeps what the citation already has.
  const [tenant, setTenant] = useState('');
  const [issue, setIssue] = useState('');
  const [points, setPoints] = useState('');
  const [status, setStatus] = useState<'' | ViolationStatus>('');
  const [dateRecorded, setDateRecorded] = useState('');
  const [dateResolved, setDateResolved] = useState('');
  const [notes, setNotes] = useState('');

  const effectiveStatus: ViolationStatus = status || current.status;
  const dirty = !!(tenant.trim() || issue.trim() || points.trim() || status || dateRecorded || dateResolved || notes.trim());

  const merged = (): Violation => {
    const resolvedOn = dateResolved || current.dateResolved || todayIso();
    return {
      ...current,
      tenant: keepText(tenant, current.tenant),
      issue: keepText(issue, current.issue),
      points: points.trim() ? toAmount(points) : current.points,
      status: effectiveStatus,
      dateRecorded: dateRecorded || current.dateRecorded,
      dateResolved: effectiveStatus === 'Resolved' ? resolvedOn : '',
      notes: keepText(notes, current.notes ?? ''),
    };
  };

  const commit = () => {
    const next = merged();
    if (next.dateResolved && next.dateRecorded && next.dateResolved < next.dateRecorded) {
      return 'Resolution date cannot be earlier than the date recorded.';
    }
    onSave(next, {}, violation);
    return '';
  };

  const form = useSaveChanges(dirty, commit);
  const edit = <T,>(set: (v: T) => void) => (value: T) => { form.clearError(); set(value); };

  return (
    <div className="form-grid">
      <SaveNote error={form.error} />
      <div className="form-row">
        <div className="form-group"><label className="form-label">Violation ID</label><input className="form-input" value={current.id} disabled /></div>
        <div className="form-group">
          <label className="form-label">Status</label>
          <select className="form-select" value={status} onChange={(e) => edit(setStatus)(e.target.value as ViolationStatus)}>
            <option value="">— Keep {current.status}</option>
            <option value="Open">Open</option><option value="Resolved">Resolved</option>
          </select>
          <span className="form-hint">
            {current.status === 'Open'
              ? 'Set this to Resolved to close the citation — the resolution date is stamped when you save.'
              : 'Set this back to Open to reopen the citation — the resolution date is cleared when you save.'}
          </span>
        </div>
      </div>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Tenant / Party Cited</label>
          <input className="form-input" list="violation-edit-tenant-options" placeholder={keepHint(current.tenant)} value={tenant} onChange={(e) => edit(setTenant)(e.target.value)} />
          <datalist id="violation-edit-tenant-options">{tenants.map((t) => <option key={t.id} value={t.name}>{t.stallId}</option>)}</datalist>
        </div>
        <div className="form-group">
          <label className="form-label">Demerit Points</label>
          <input className="form-input" type="number" min="0" step="1" placeholder={keepHint(String(current.points))} value={points} onChange={(e) => edit(setPoints)(e.target.value)} />
        </div>
      </div>
      <div className="form-group">
        <label className="form-label">Violation</label>
        <input className="form-input" list="violation-edit-issue-options" placeholder={keepHint(current.issue)} value={issue} onChange={(e) => edit(setIssue)(e.target.value)} />
        <datalist id="violation-edit-issue-options">{VIOLATION_ISSUES.map((v) => <option key={v} value={v} />)}</datalist>
      </div>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Date Recorded</label>
          <input className="form-input" type="date" value={dateRecorded} onChange={(e) => edit(setDateRecorded)(e.target.value)} />
          <span className="form-hint">{keepHint(current.dateRecorded ? formatIsoDate(current.dateRecorded) : '')}</span>
        </div>
        {effectiveStatus === 'Resolved' && (
          <div className="form-group">
            <label className="form-label">Date Resolved</label>
            <input className="form-input" type="date" value={dateResolved} onChange={(e) => edit(setDateResolved)(e.target.value)} />
            <span className="form-hint">{current.dateResolved ? keepHint(formatIsoDate(current.dateResolved)) : 'Left blank, resolving stamps today.'}</span>
          </div>
        )}
      </div>
      <div className="form-group">
        <label className="form-label">Notes</label>
        <textarea className="form-textarea" placeholder={keepHint(current.notes)} value={notes} onChange={(e) => edit(setNotes)(e.target.value)} />
      </div>
      <EditActions dirty={dirty} onSave={form.save} onCancel={onClose} />
    </div>
  );
}

/* ============================================================
   Analytics Page
   ============================================================ */

/* The analytics module is presented as an official operations report: a
   masthead, numbered sections, and figures set in tables rather than in
   decorative cards, so it can be read — or printed — as a document. */

function ReportSection({ index, title, summary, action, children }: {
  index: string; title: string; summary: string; action?: ReactNode; children: ReactNode;
}) {
  return (
    <section className="report-section">
      <header className="report-section-head">
        <span className="report-index">{index}</span>
        <div className="report-section-title">
          <h3>{title}</h3>
          <p>{summary}</p>
        </div>
        {action && <div className="report-section-action">{action}</div>}
      </header>
      {children}
    </section>
  );
}

function ReportFigure({ label, value, basis, tone, meter }: {
  label: string; value: string; basis: string; tone?: string; meter?: number;
}) {
  return (
    <div className="report-figure">
      <span className="report-figure-label">{label}</span>
      <strong className={`report-figure-value${tone ? ` ${tone}` : ''}`}>{value}</strong>
      <span className="report-figure-basis">{basis}</span>
      {typeof meter === 'number' && (
        <div className="report-meter">
          <div className={`report-meter-fill${tone ? ` ${tone}` : ''}`} style={{ width: `${Math.min(100, Math.max(0, meter))}%` }} />
        </div>
      )}
    </div>
  );
}

/* Proportion cell — the rule carries the comparison, the figure carries the
   precision, so a column of them can be scanned or quoted. */
function ReportShare({ value, tone }: { value: number; tone?: string }) {
  return (
    <div className="report-share">
      <div className="report-share-track">
        <div className={`report-share-fill${tone ? ` ${tone}` : ''}`} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
      </div>
      <span>{percent(value)}</span>
    </div>
  );
}

function AnalyticsPage({ state, occupiedCount, availableCount, maintenanceCount, onExport, onNavigate }: { state: AppState; occupiedCount: number; availableCount: number; maintenanceCount: number; onExport: () => void; onNavigate: (k: ModuleKey) => void }) {
  /* Stamped once when the report is opened — every figure below is read from
     the records as they stood at that moment. */
  const [generatedAt] = useState(() => new Date());
  const totalStalls = state.stalls.length;

  const sections = useMemo(
    () => Array.from(new Set([...state.stalls.map((s) => s.section), ...state.tenants.map((t) => t.section)])),
    [state.stalls, state.tenants],
  );

  const activeTenants = useMemo(() => state.tenants.filter((t) => t.status === 'Active').length, [state.tenants]);
  const expiringTenants = useMemo(() => state.tenants.filter((t) => t.status === 'Expiring Soon').length, [state.tenants]);
  const monthlyRent = useMemo(() => state.tenants.reduce((s, t) => s + t.rent, 0), [state.tenants]);

  const applicantRows = useMemo(() => {
    const statuses: ApplicantStatus[] = ['Pending Review', 'Incomplete', 'No BP', 'Approved', 'Rejected'];
    return statuses.map((status) => ({ status, count: state.applicants.filter((a) => a.status === status).length }));
  }, [state.applicants]);
  const pendingApplicants = applicantRows[0].count;
  const incompleteApplicants = applicantRows[1].count;
  const approvedApplicants = applicantRows[2].count;

  const openViolations = useMemo(() => state.violations.filter((v) => v.status === 'Open').length, [state.violations]);
  const resolvedViolations = state.violations.length - openViolations;
  const demeritPoints = useMemo(() => state.violations.reduce((s, v) => s + v.points, 0), [state.violations]);
  const recentViolations = useMemo(
    () => [...state.violations].sort((a, b) => (b.dateRecorded || '').localeCompare(a.dateRecorded || '')).slice(0, 5),
    [state.violations],
  );

  const occupancyColumns = useMemo(() => sectionOccupancyColumns(state.stalls), [state.stalls]);

  const tenancyRows = useMemo(() => sections.map((section) => {
    const stalls = state.stalls.filter((s) => s.section === section);
    const tenants = state.tenants.filter((t) => t.section === section);
    return {
      section,
      stalls: stalls.length,
      occupied: stalls.filter((s) => s.status === 'Occupied').length,
      tenants: tenants.length,
      rent: tenants.reduce((s, t) => s + t.rent, 0),
    };
  }), [sections, state.stalls, state.tenants]);

  const utilityRows = useMemo(() => UTILITY_TYPES.map((type) => {
    const list = state.utilities.filter((b) => b.type === type);
    const billed = list.reduce((s, b) => s + b.amount, 0);
    const collected = list.filter((b) => b.status === 'Paid').reduce((s, b) => s + b.amount, 0);
    return {
      type,
      count: list.length,
      consumption: list.reduce((s, b) => s + b.consumption, 0),
      unit: UTILITY_PRESETS[type].unit,
      billed,
      collected,
      outstanding: billed - collected,
    };
  }), [state.utilities]);

  const billedTotal = utilityRows.reduce((s, r) => s + r.billed, 0);
  const collectedTotal = utilityRows.reduce((s, r) => s + r.collected, 0);
  const outstandingTotal = billedTotal - collectedTotal;
  const overdueCount = useMemo(() => state.utilities.filter(isOverdue).length, [state.utilities]);

  const utilityColumns = useMemo<GraphColumn[]>(() => {
    const keys = Array.from(new Set(state.utilities.map((b) => b.section || 'Unassigned')));
    return keys.map((section) => {
      const inSection = state.utilities.filter((b) => (b.section || 'Unassigned') === section);
      return {
        label: shortSection(section),
        caption: `${inSection.length} bill${inSection.length === 1 ? '' : 's'}`,
        values: {
          Electricity: inSection.filter((b) => b.type === 'Electricity').reduce((s, b) => s + b.amount, 0),
          Water: inSection.filter((b) => b.type === 'Water').reduce((s, b) => s + b.amount, 0),
        },
      };
    });
  }, [state.utilities]);

  const logRows = useMemo(
    () => LOG_TYPES.map((type) => ({ type, count: state.logs.filter((l) => l.type === type).length })),
    [state.logs],
  );

  const occupancyRate = ratio(occupiedCount, totalStalls);
  const collectionRate = ratio(collectedTotal, billedTotal);
  const stallRows: Array<{ label: string; count: number; tone: string }> = [
    { label: 'Occupied', count: occupiedCount, tone: 'occupied' },
    { label: 'Available', count: availableCount, tone: 'available' },
    { label: 'Maintenance', count: maintenanceCount, tone: 'maintenance' },
    { label: 'Temporarily Closed', count: countStatus(state.stalls, 'Temporarily Closed'), tone: 'closed' },
    { label: 'Closed', count: countStatus(state.stalls, 'Closed'), tone: 'shut' },
    { label: 'Abandoned', count: countStatus(state.stalls, 'Abandoned'), tone: 'abandoned' },
  ];

  const reference = `PMRMS-AR-${isoDate(generatedAt).replace(/-/g, '')}`;
  const stamp = manilaStamp(generatedAt);

  return (
    <div className="report">
      <header className="report-masthead">
        <div className="report-seal"><img src="./logo.jpg" alt="" aria-hidden="true" /></div>
        <div className="report-identity">
          <span className="report-office">Municipality of Tanauan, Leyte &middot; Market Office</span>
          <h2 className="report-title">Market Operations Analytics Report</h2>
          <span className="report-meta">Reference {reference} &middot; Compiled from live records as of {stamp}</span>
        </div>
        <div className="report-actions">
          <button className="btn-primary" onClick={onExport}><span className="material-symbols-outlined">download</span>Export Report</button>
        </div>
      </header>

      <ReportSection index="I" title="Executive Summary" summary="Headline indicators for the market as currently recorded.">
        <div className="report-figures">
          <ReportFigure label="Stall Occupancy" value={percent(occupancyRate)} basis={`${occupiedCount} of ${totalStalls} stalls occupied`} meter={occupancyRate} />
          <ReportFigure label="Active Tenancies" value={String(activeTenants)} basis={`${state.tenants.length} on record · ${expiringTenants} expiring`} tone="success" />
          <ReportFigure label="Applications Pending" value={String(pendingApplicants)} basis={`${incompleteApplicants} incomplete · ${state.applicants.length} filed`} tone="warning" />
          <ReportFigure label="Collection Efficiency" value={billedTotal > 0 ? percent(collectionRate) : '—'} basis={`${money(outstandingTotal)} outstanding`} meter={billedTotal > 0 ? collectionRate : undefined} tone={collectionRate >= 75 || billedTotal === 0 ? 'success' : 'danger'} />
          <ReportFigure label="Open Violations" value={String(openViolations)} basis={`${demeritPoints} demerit point${demeritPoints === 1 ? '' : 's'} on register`} tone={openViolations > 0 ? 'danger' : 'success'} />
        </div>
      </ReportSection>

      <ReportSection index="II" title="Stall Utilization" summary="Distribution of stalls across market sections and their present condition.">
        <div className="report-split">
          <div className="report-panel">
            <div className="report-panel-head">Stalls by section and status</div>
            <StackedBarGraph columns={occupancyColumns} series={STALL_STATUS_SERIES} emptyText="No stalls are on record yet." />
          </div>
          <div className="report-panel">
            <div className="report-panel-head">Status summary</div>
            <div className="report-table-wrap">
              <table className="report-table">
              <thead><tr><th>Status</th><th className="num">Stalls</th><th className="share">Share</th></tr></thead>
              <tbody>
                {stallRows.map((row) => (
                  <tr key={row.label}>
                    <td>{row.label}</td>
                    <td className="num">{row.count}</td>
                    <td className="share"><ReportShare value={ratio(row.count, totalStalls)} tone={row.tone} /></td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr><td>Total stalls</td><td className="num">{totalStalls}</td><td className="share">{totalStalls > 0 ? '100.0%' : '—'}</td></tr></tfoot>
              </table>
            </div>
          </div>
        </div>
      </ReportSection>

      <ReportSection index="III" title="Applicant Processing" summary="Standing of every application filed with the market office." action={<button className="btn-outline-sm" onClick={() => onNavigate('applicants')}>Open Applicants</button>}>
        <div className="report-table-wrap">
          <table className="report-table">
          <thead><tr><th>Application Status</th><th className="num">Applications</th><th className="share">Share of filings</th></tr></thead>
          <tbody>
            {applicantRows.map((row) => (
              <tr key={row.status}>
                <td>{row.status}</td>
                <td className="num">{row.count}</td>
                <td className="share"><ReportShare value={ratio(row.count, state.applicants.length)} /></td>
              </tr>
            ))}
            {state.applicants.length === 0 && <tr><td colSpan={3} className="report-empty">No applications have been filed yet.</td></tr>}
          </tbody>
          <tfoot><tr><td>Total filed</td><td className="num">{state.applicants.length}</td><td className="share">{approvedApplicants} approved to date</td></tr></tfoot>
          </table>
        </div>
      </ReportSection>

      <ReportSection index="IV" title="Tenancy and Rental Coverage" summary="Tenants and contracted monthly rent by market section.">
        <div className="report-table-wrap">
          <table className="report-table">
          <thead><tr><th>Section</th><th className="num">Stalls</th><th className="num">Occupied</th><th className="num">Tenants</th><th className="num">Monthly Rent</th><th className="share">Occupancy</th></tr></thead>
          <tbody>
            {tenancyRows.map((row) => (
              <tr key={row.section}>
                <td>{row.section}</td>
                <td className="num">{row.stalls}</td>
                <td className="num">{row.occupied}</td>
                <td className="num">{row.tenants}</td>
                <td className="num">{money(row.rent)}</td>
                <td className="share"><ReportShare value={ratio(row.occupied, row.stalls)} tone="occupied" /></td>
              </tr>
            ))}
            {tenancyRows.length === 0 && <tr><td colSpan={6} className="report-empty">No sections are on record yet.</td></tr>}
          </tbody>
          <tfoot>
            <tr>
              <td>All sections</td>
              <td className="num">{totalStalls}</td>
              <td className="num">{occupiedCount}</td>
              <td className="num">{state.tenants.length}</td>
              <td className="num">{money(monthlyRent)}</td>
              <td className="share">{percent(occupancyRate)}</td>
            </tr>
          </tfoot>
          </table>
        </div>
      </ReportSection>

      <ReportSection index="V" title="Utility Billing and Collection" summary="Electricity and water charged to stalls, and how much of it has been settled." action={<button className="btn-outline-sm" onClick={() => onNavigate('utilities')}>Open Billing</button>}>
        <div className="report-split table-wide">
          <div className="report-panel">
            <div className="report-panel-head">Amount billed by section</div>
            <StackedBarGraph columns={utilityColumns} series={UTILITY_SERIES} format={(n) => (n >= 1000 ? `₱${(n / 1000).toFixed(1)}K` : `₱${Math.round(n)}`)} emptyText="No utility bills have been issued yet." />
          </div>
          <div className="report-panel">
            <div className="report-panel-head">Collection standing</div>
            <div className="report-table-wrap">
              <table className="report-table">
              <thead><tr><th>Utility</th><th className="num">Consumption</th><th className="num">Billed</th><th className="num">Collected</th><th className="num">Outstanding</th></tr></thead>
              <tbody>
                {utilityRows.map((row) => (
                  <tr key={row.type}>
                    <td>{row.type}<small>{row.count} bill{row.count === 1 ? '' : 's'}</small></td>
                    <td className="num">{row.consumption.toLocaleString()} {row.unit}</td>
                    <td className="num">{money(row.billed)}</td>
                    <td className="num">{money(row.collected)}</td>
                    <td className={`num${row.outstanding > 0 ? ' danger' : ''}`}>{money(row.outstanding)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>All utilities</td>
                  <td className="num">{state.utilities.length} bill{state.utilities.length === 1 ? '' : 's'}</td>
                  <td className="num">{money(billedTotal)}</td>
                  <td className="num">{money(collectedTotal)}</td>
                  <td className={`num${outstandingTotal > 0 ? ' danger' : ''}`}>{money(outstandingTotal)}</td>
                </tr>
              </tfoot>
              </table>
            </div>
            <p className="report-note">{overdueCount > 0 ? `${overdueCount} bill${overdueCount === 1 ? ' is' : 's are'} past the due date and should be served a demand notice.` : 'No bill is past its due date.'}</p>
          </div>
        </div>
      </ReportSection>

      <ReportSection index="VI" title="Compliance and Violations" summary="Citations issued against tenants and their present standing." action={<button className="btn-outline-sm" onClick={() => onNavigate('violations')}>Open Register</button>}>
        <div className="report-figures compact">
          <ReportFigure label="Open Citations" value={String(openViolations)} basis="Awaiting compliance" tone={openViolations > 0 ? 'danger' : 'success'} />
          <ReportFigure label="Resolved" value={String(resolvedViolations)} basis={`${percent(ratio(resolvedViolations, state.violations.length))} of the register`} tone="success" />
          <ReportFigure label="Demerit Points" value={String(demeritPoints)} basis={`Across ${state.violations.length} citation${state.violations.length === 1 ? '' : 's'}`} />
        </div>
        <div className="report-table-wrap">
          <table className="report-table">
          <thead><tr><th>Reference</th><th>Party Cited</th><th>Violation</th><th className="num">Points</th><th>Recorded</th><th>Status</th></tr></thead>
          <tbody>
            {recentViolations.map((v) => (
              <tr key={v.id}>
                <td>{v.id}</td>
                <td>{v.tenant}</td>
                <td>{v.issue}</td>
                <td className="num">{v.points}</td>
                <td>{v.dateRecorded ? formatIsoDate(v.dateRecorded) : '—'}</td>
                <td><StatusBadge status={v.status} /></td>
              </tr>
            ))}
            {recentViolations.length === 0 && <tr><td colSpan={6} className="report-empty">No violations have been recorded.</td></tr>}
          </tbody>
          </table>
        </div>
      </ReportSection>

      <ReportSection index="VII" title="Logbook Activity" summary="Entries recorded in the market office logbook, by type." action={<button className="btn-outline-sm" onClick={() => onNavigate('logbook')}>Open Logbook</button>}>
        <div className="report-table-wrap">
          <table className="report-table">
          <thead><tr><th>Entry Type</th><th className="num">Entries</th><th className="share">Share of logbook</th></tr></thead>
          <tbody>
            {logRows.map((row) => (
              <tr key={row.type}>
                <td>{row.type}</td>
                <td className="num">{row.count}</td>
                <td className="share"><ReportShare value={ratio(row.count, state.logs.length)} /></td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr><td>Total entries</td><td className="num">{state.logs.length}</td><td className="share">{state.logs.length > 0 ? '100.0%' : '—'}</td></tr></tfoot>
          </table>
        </div>
      </ReportSection>

      <footer className="report-footer">
        <span className="material-symbols-outlined">verified</span>
        <p>
          This report is compiled automatically from the records held on this workstation and is
          unsigned. Export it for filing, or have it certified by the Market Supervisor before it is
          used outside the office.
        </p>
      </footer>
    </div>
  );
}

/* ============================================================
   Logbook Page
   ============================================================ */

function LogbookPage({ logs, search, onAdd, onDelete, onExport, onPrintList }: { logs: LogEntry[]; search: string; onAdd: () => void; onDelete: (l: LogEntry) => void; onExport: () => void; onPrintList: (title: string, subtitle: string, columns: string[], rows: string[][]) => void; }) {
  const printList = () => onPrintList(
    'Logbook',
    `${typeFilter || 'All entry types'}${dayFilter ? ` · ${formatIsoDate(dayFilter)}` : ''}${search ? ` · matching “${search}”` : ''}`,
    ['Date', 'Time', 'Type', 'Details'],
    ordered.map((l) => [l.date ? formatIsoDate(l.date) : '—', l.time, l.type, l.details]),
  );
  const [typeFilter, setTypeFilter] = useState('');
  const [dayFilter, setDayFilter] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => { setPage(1); }, [search]);

  const days = useMemo(
    () => Array.from(new Set(logs.map((l) => l.date).filter(Boolean))).sort((a, b) => b.localeCompare(a)),
    [logs],
  );

  const filtered = useMemo(() => logs.filter((l) => {
    if (typeFilter && l.type !== typeFilter) return false;
    if (dayFilter && l.date !== dayFilter) return false;
    if (search) { const q = search.toLowerCase(); if (!l.details.toLowerCase().includes(q) && !l.type.toLowerCase().includes(q)) return false; }
    return true;
  }), [logs, typeFilter, dayFilter, search]);

  const ordered = useMemo(
    () => [...filtered].sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.id.localeCompare(a.id)),
    [filtered],
  );

  const paged = paginate(ordered, page);

  return (
    <>
      <div className="page-header">
        <div><h2 className="page-title">Logbook</h2><p className="page-subtitle">Operational history and daily activity logs.</p></div>
        <div className="page-actions"><button className="btn-outline" onClick={onExport}><span className="material-symbols-outlined">download</span>Export Log</button><button className="btn-outline" disabled={ordered.length === 0} title={ordered.length === 0 ? 'No records match the current filters' : undefined} onClick={printList}><span className="material-symbols-outlined">print</span>Print List</button><button className="btn-primary" onClick={onAdd}><span className="material-symbols-outlined">add</span>New Entry</button></div>
      </div>
      <div className="panel">
        <div className="panel-header">
          <h3 className="panel-title">Activity Log</h3>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <select className="filter-select" value={dayFilter} onChange={(e) => { setDayFilter(e.target.value); setPage(1); }}>
              <option value="">All Dates</option>
              {days.map((d) => <option key={d} value={d}>{formatIsoDate(d)}</option>)}
            </select>
            <select className="filter-select" value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}><option value="">All Types</option>{LOG_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select>
            <span className="table-info">{ordered.length} entries</span>
          </div>
        </div>
        <div className="log-list">
          {paged.items.map((log) => (
            <div className="log-item" key={log.id}>
              <span className="log-date">{log.date ? formatIsoDate(log.date) : '—'}</span>
              <span className="log-time">{log.time}</span>
              <span className="log-type">{log.type}</span>
              <span className="log-details">{log.details}</span>
              <button type="button" className="row-icon-btn danger" title="Delete log entry" aria-label="Delete log entry" onClick={() => onDelete(log)}><span className="material-symbols-outlined">delete</span></button>
            </div>
          ))}
          {paged.items.length === 0 && <div className="empty-state"><span className="material-symbols-outlined">menu_book</span>No log entries found.</div>}
        </div>
        <PaginationBar compact info={`Showing ${paged.start}-${paged.end} of ${paged.total}`} page={paged.page} totalPages={paged.totalPages} onPage={setPage} />
      </div>
    </>
  );
}

/* ============================================================
   Settings Page
   ============================================================ */

/* Reads a backup file and hands back the state it holds. Shared by the Settings
   import and the Support restore so both accept exactly the same files. */
function useBackupFile(onLoaded: (data: AppState, file: File) => void) {
  const [problem, setProblem] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const choose = () => { setProblem(''); inputRef.current?.click(); };

  const complain = (message: string) => {
    setProblem(message);
    setTimeout(() => setProblem(''), 6000);
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // so choosing the same file twice still fires
    if (!file) return;
    const reader = new FileReader();
    reader.onerror = () => complain('That file could not be read. Try downloading the backup again.');
    reader.onload = (evt) => {
      try {
        const parsed = JSON.parse(evt.target?.result as string);
        const requiredKeys: (keyof AppState)[] = ['applicants', 'tenants', 'stalls', 'logs', 'activities'];
        const looksRight = parsed && typeof parsed === 'object' && requiredKeys.every((k) => k in parsed);
        if (!looksRight) {
          complain('That is not a system backup — the file is missing the tenant, stall, or applicant records.');
          return;
        }
        onLoaded(mergeState(parsed), file);
      } catch {
        complain('That file could not be read as a backup. Select the .json file downloaded from this system.');
      }
    };
    reader.readAsText(file);
  };

  const field = <input ref={inputRef} type="file" accept="application/json,.json" onChange={onFile} style={{ display: 'none' }} />;

  return { choose, problem, field };
}

function SettingsPage({ state, lastSaved, onReset, onExport, onImport }: { state: AppState; lastSaved: string; onReset: () => void; onExport: () => void; onImport: (data: AppState) => void }) {
  /* An import replaces every record on this workstation, so the file is read
     first and its contents shown before anything is overwritten. */
  const [pending, setPending] = useState<{ data: AppState; fileName: string } | null>(null);
  const backup = useBackupFile((data, file) => setPending({ data, fileName: file.name }));

  const countOf = (data: AppState) =>
    data.stalls.length + data.tenants.length + data.applicants.length + data.logs.length + data.violations.length + data.utilities.length + data.officers.length;

  /* Read straight from the database rather than counted off the screen, so the
     figures shown are the ones actually on disk. Re-read after every save. */
  const [dbInfo, setDbInfo] = useState<DatabaseStats | null>(null);
  const [dbCheck, setDbCheck] = useState('');
  useEffect(() => { databaseStats().then(setDbInfo); }, [lastSaved]);

  const runIntegrityCheck = () => {
    setDbCheck('Checking…');
    checkIntegrity()
      .then((result) => setDbCheck(result?.ok ? 'No problems found — the records file is intact.' : `Reported: ${result?.result ?? 'unknown'}`))
      .catch((error: unknown) => setDbCheck(error instanceof Error ? error.message : 'The check could not be run.'));
  };

  const saveDatabaseCopy = () => {
    setDbCheck('');
    backupDatabase()
      .then((result) => { if (result && !result.canceled) setDbCheck(`Copy saved to ${result.filePath}`); })
      .catch((error: unknown) => setDbCheck(error instanceof Error ? error.message : 'The copy could not be saved.'));
  };

  return (
    <>
      <div className="page-header"><div><h2 className="page-title">Settings</h2><p className="page-subtitle">System configuration and data management.</p></div></div>
      <div className="settings-grid">
        <div className="settings-section">
          <div className="settings-section-header">System Information</div>
          <div className="settings-section-body">
            <div className="settings-item"><span className="settings-item-label">Application</span><span className="settings-item-value">Tanauan Public Market v1.0</span></div>
            <div className="settings-item"><span className="settings-item-label">Storage</span><span className="settings-item-value">{backendName()}</span></div>
            <div className="settings-item"><span className="settings-item-label">Total Records</span><span className="settings-item-value">{state.stalls.length + state.tenants.length + state.applicants.length + state.logs.length + state.violations.length + state.utilities.length + state.officers.length}</span></div>
            <div className="settings-item"><span className="settings-item-label">Last Saved</span><span className="settings-item-value">{lastSaved ? new Date(lastSaved).toLocaleString() : 'Not yet saved'}</span></div>
          </div>
        </div>
        <div className="settings-section">
          <div className="settings-section-header">Section 43 — Market Stall Rates</div>
          <div className="settings-section-body">
            <p className="settings-note">The schedule the market charges by. A stall picked on a new tenancy starts on the rate for its kind.</p>
            <div className="table-wrap">
              <table className="mini-table">
                <thead><tr><th>Description</th><th className="num">Stalls</th><th>Area per stall</th><th className="num">Per sq. m</th><th className="num">Monthly</th></tr></thead>
                <tbody>
                  {STALL_RATE_SCHEDULE.map((r) => (
                    <tr key={r.description}>
                      <td>{r.description}</td>
                      <td className="num">{r.stalls ?? '—'}</td>
                      <td>{r.area || '—'}</td>
                      <td className="num">{r.perSqM === null ? '—' : money(r.perSqM)}</td>
                      <td className="num"><strong>{r.monthly === null ? `${money(r.perMarketDay ?? 0)} / market day` : money(r.monthly)}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        <div className="settings-section">
          <div className="settings-section-header">Quick Stats</div>
          <div className="settings-section-body">
            <div className="settings-item"><span className="settings-item-label">Total Stalls</span><span className="settings-item-value">{state.stalls.length}</span></div>
            <div className="settings-item"><span className="settings-item-label">Active Tenants</span><span className="settings-item-value">{state.tenants.filter(t => t.status === 'Active').length}</span></div>
            <div className="settings-item"><span className="settings-item-label">Pending Applicants</span><span className="settings-item-value">{state.applicants.filter(a => a.status === 'Pending Review').length}</span></div>
            <div className="settings-item"><span className="settings-item-label">Utility Bills Issued</span><span className="settings-item-value">{state.utilities.length}</span></div>
            <div className="settings-item"><span className="settings-item-label">Open Violations</span><span className="settings-item-value">{state.violations.filter(v => v.status === 'Open').length}</span></div>
            <div className="settings-item"><span className="settings-item-label">Unpaid Utilities</span><span className="settings-item-value">{money(state.utilities.filter(b => b.status === 'Unpaid').reduce((s, b) => s + b.amount, 0))}</span></div>
          </div>
        </div>
        {/* Only shown in the installed application — a browser has no file to
            report on, and none of these actions would do anything there. */}
        {dbInfo && (
          <div className="settings-section full">
            <div className="settings-section-header">Records Database</div>
            <div className="settings-section-body">
              <p className="settings-lead">
                Every record is kept in one SQLite database file on this computer. The system never connects to the internet, and copying this file copies the whole system.
              </p>
              <div className="settings-item"><span className="settings-item-label">Database file</span><span className="settings-item-value" style={{ wordBreak: 'break-all' }}>{dbInfo.file}</span></div>
              <div className="settings-item"><span className="settings-item-label">File size</span><span className="settings-item-value">{formatBytes(dbInfo.bytes)}</span></div>
              <div className="settings-item"><span className="settings-item-label">Schema version</span><span className="settings-item-value">{dbInfo.schemaVersion}</span></div>
              <div className="settings-item"><span className="settings-item-label">Rows stored</span><span className="settings-item-value">
                {`${Object.values(dbInfo.counts).reduce((sum, n) => sum + n, 0)} — ${dbInfo.counts.tenants ?? 0} tenants, ${dbInfo.counts.stalls ?? 0} stalls, ${dbInfo.counts.applicants ?? 0} applicants, ${dbInfo.counts.utilities ?? 0} bills`}
              </span></div>
              <div className="settings-actions">
                <button className="btn-primary" onClick={saveDatabaseCopy}><span className="material-symbols-outlined">save</span>Save a Copy of the Database</button>
                <button className="btn-outline" onClick={() => { void revealDataFolder(); }}><span className="material-symbols-outlined">folder_open</span>Open Data Folder</button>
                <button className="btn-outline" onClick={runIntegrityCheck}><span className="material-symbols-outlined">health_and_safety</span>Check for Damage</button>
              </div>
              {dbCheck && (
                <p className="settings-note">
                  <span className="material-symbols-outlined">info</span>
                  {dbCheck}
                </p>
              )}
            </div>
          </div>
        )}
        <div className="settings-section full">
          <div className="settings-section-header">Data Management</div>
          <div className="settings-section-body">
            <p className="settings-lead">Export the records held on this workstation, import them onto another, or reset the system to factory defaults. Everything stays on this computer.</p>
            <div className="settings-actions">
              <button className="btn-primary" onClick={onExport}><span className="material-symbols-outlined">download</span>Export All Data</button>
              <button className="btn-outline" onClick={backup.choose}><span className="material-symbols-outlined">upload</span>Import Data</button>
              {/* Held apart from the two routine actions: it destroys the record. */}
              <button className="btn-outline-danger" onClick={onReset}><span className="material-symbols-outlined">delete_forever</span>Reset to Defaults</button>
            </div>
            {backup.field}
            <p className="settings-note">
              <span className="material-symbols-outlined">info</span>
              Importing reads a file exported from this system and replaces every record currently held. Export the present data first if it has not been filed elsewhere.
            </p>
            {backup.problem && <div className="form-error" style={{ marginTop: '12px' }}><span className="material-symbols-outlined">error</span>{backup.problem}</div>}
          </div>
        </div>
      </div>

      {pending && (
        <ConfirmDialog
          icon="upload_file"
          iconStyle="warning"
          title="Import and replace all records?"
          description={`"${pending.fileName}" holds ${countOf(pending.data)} records — ${pending.data.tenants.length} tenants, ${pending.data.stalls.length} stalls, ${pending.data.applicants.length} applicants, ${pending.data.utilities.length} utility bills, ${pending.data.violations.length} violations, ${pending.data.logs.length} logbook entries, and ${pending.data.officers.length} seats on the office board. Importing replaces the ${countOf(state)} records on this workstation. This cannot be undone.`}
          confirmLabel="Import and Replace"
          onConfirm={() => { onImport(pending.data); setPending(null); }}
          onCancel={() => setPending(null)}
        />
      )}
    </>
  );
}

/* ============================================================
   Support Page
   ============================================================ */

const faqs = [
  { q: 'How do I add a new stall?', a: 'Navigate to Stall Management and click the "+ New Stall" button. Fill in the stall ID, section, and status, then click "Add Stall".' },
  { q: 'How do I manage applicants?', a: 'Go to the Applicants page to see all applicant records. Click "Review" on any row to edit their details, tick off the requirements they have submitted, and approve or reject the application. You can also filter by status and add new applicants.' },
  { q: 'How are requirements recorded?', a: 'Requirements are a simple checklist — tick the box for each document the applicant has physically handed in. Nothing is uploaded or stored as a file. While an application is still in progress the status follows the checklist automatically (Incomplete until all boxes are ticked, then Pending Review). Once you approve or reject it, that decision stays put and ticking boxes will not change it.' },
  { q: 'How do I compute an electricity or water bill?', a: 'Open Utility Billing, pick Electricity or Water, then choose the stall number or the tenant — selecting one fills in the other. Enter the previous and current meter readings (the previous reading is carried over automatically from the last bill for that stall), adjust the rate or fixed charge if needed, and the total is computed live. Click "Save to Records" to post the bill.' },
  { q: 'Where do saved utility bills appear?', a: 'Every saved bill is listed under Utility Billing → Billing Records, attached to the stall and tenant you selected. It also shows up in that tenant\'s and stall\'s detail modal, in the Analytics utility panel, in the Logbook as a Collection entry, and in exports and backups.' },
  { q: 'How do I record and resolve a violation?', a: 'Open the Violations page and click "Record Violation". Enter the tenant (pick one on record or type any other party), the offence, and how many demerit points it carries. Every citation starts Open. When it has been settled, click "Resolve" on its row — the resolution date is stamped automatically, and "Reopen" clears it again if the matter is not closed after all. Open points are totalled per tenant at the top of the page so repeat offenders are easy to spot.' },
  { q: 'Where can I view analytics?', a: 'The Analytics page provides a comprehensive view of stall occupancy, applicant pipeline, tenant distribution, violations summary, utility consumption and billing, and logbook activity.' },
  { q: 'Where is my data stored?', a: 'In a SQLite database file on this computer, kept in the application data folder — open it from Settings → Records Database, or Help → Open Data Folder. Nothing is sent anywhere: the system works with no internet connection at all. Copying that one file copies every record.' },
  { q: 'How do I export reports?', a: 'You can export data from the Analytics page or Settings. Reports are available as JSON files. The Logbook page also offers CSV export.' },
  { q: 'How do I move records to another computer?', a: 'On the computer holding the records, open Settings → Data Management and click "Export All Data" to download a JSON file. Carry that file to the other computer, open Settings there, and click "Import Data". You will be shown what the file holds and what it will replace before anything is overwritten — nothing changes until you confirm. Importing replaces every record on that workstation, so export its current data first if it has not been filed elsewhere.' },
  { q: 'How do I backup and restore data?', a: 'Use the "Download Full Backup" button on this Support page to download all system data as a JSON file. To restore on another computer, click "Upload Backup" and select the previously downloaded file. The system will load all data from the backup.' },
];

const contactList = [
  { name: 'Jon Jon Albao', email: 'jonjonalbao65@gmail.com', phone: '+639198451397', avatar: 'JA', color: 'blue' },
  { name: 'Kyra Joyce Tondo', email: 'kyrajoycet@gmail.com', phone: '+639164258038', avatar: 'KT', color: 'teal' },
  { name: 'Shila Mae Marteja', email: 'shilamaemarteja18@gmail.com', phone: '+639854528964', avatar: 'SM', color: 'purple' },
];

function SupportPage({ state, onRestore, onBackup }: { state: AppState; onRestore: (data: AppState) => void; onBackup: () => void }) {
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  /* Same reader as the Settings import, so both accept the same files. */
  const [restored, setRestored] = useState(false);
  const backup = useBackupFile((data) => {
    onRestore(data);
    setRestored(true);
    setTimeout(() => setRestored(false), 5000);
  });
  return (
    <>
      <div className="page-header"><div><h2 className="page-title">Support</h2><p className="page-subtitle">Help center, contacts, and data backup.</p></div></div>
      <div className="support-grid">
        <div className="support-card"><span className="material-symbols-outlined">menu_book</span><h4>User Guide</h4><p>Step-by-step instructions for using all features of Tanauan Public Market.</p></div>
        <div className="support-card"><span className="material-symbols-outlined">mail</span><h4>Contact Support</h4><p>Reach out to our team for technical issues or system concerns.</p></div>
        <div className="support-card"><span className="material-symbols-outlined">update</span><h4>System Updates</h4><p>Current version: v1.0. All systems running normally.</p></div>
        <div className="support-card"><span className="material-symbols-outlined">shield</span><h4>Data Privacy</h4><p>All data is stored locally. No information is transmitted to external servers.</p></div>
      </div>

      <div className="panel" style={{ marginTop: '20px' }}>
        <div className="panel-header"><h3 className="panel-title">Contact Information</h3></div>
        <div className="contact-list">
          {contactList.map((c) => (
            <div className="contact-card" key={c.email}>
              <div className={`contact-avatar ${c.color}`}>{c.avatar}</div>
              <div className="contact-info">
                <div className="contact-name">{c.name}</div>
                <div className="contact-detail"><span className="material-symbols-outlined">mail</span><a href={`mailto:${c.email}`}>{c.email}</a></div>
                <div className="contact-detail"><span className="material-symbols-outlined">phone</span><a href={`tel:${c.phone}`}>{c.phone}</a></div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="panel" style={{ marginTop: '20px' }}>
        <div className="panel-header"><h3 className="panel-title">Backup & Restore</h3></div>
        <div className="backup-section">
          <div className="backup-info">
            <div className="backup-info-row">
              <span className="material-symbols-outlined backup-icon download">cloud_download</span>
              <div>
                <h4>Download Full Backup</h4>
                <p>Export all system data (stalls, tenants, applicants, logs, settings) as a single JSON file. Use this to transfer data to another computer running this system.</p>
                <p className="backup-meta">Current records: {state.stalls.length} stalls · {state.tenants.length} tenants · {state.applicants.length} applicants · {state.utilities.length} utility bills · {state.violations.length} violations · {state.logs.length} logs · {state.officers.length} office seats</p>
              </div>
            </div>
            <button className="btn-primary" onClick={onBackup}><span className="material-symbols-outlined">download</span>Download Full Backup</button>
          </div>
          <div className="backup-divider" />
          <div className="backup-info">
            <div className="backup-info-row">
              <span className="material-symbols-outlined backup-icon upload">cloud_upload</span>
              <div>
                <h4>Upload Backup</h4>
                <p>Restore data from a previously downloaded backup file. This will <strong>replace all current data</strong> with the contents of the backup file.</p>
              </div>
            </div>
            <button className="btn-outline upload-btn" onClick={backup.choose}>
              <span className="material-symbols-outlined">upload_file</span>Upload Backup File
            </button>
            {backup.field}
          </div>
          {(backup.problem || restored) && (
            <div className={`restore-status ${backup.problem ? 'error' : 'success'}`}>
              <span className="material-symbols-outlined">{backup.problem ? 'error' : 'check_circle'}</span>
              {backup.problem || 'Data restored successfully.'}
            </div>
          )}
        </div>
      </div>

      <div className="panel" style={{ marginTop: '20px' }}>
        <div className="panel-header"><h3 className="panel-title">Frequently Asked Questions</h3></div>
        <div className="faq-list">
          {faqs.map((f, i) => (
            <div className="faq-item" key={i}>
              <button type="button" className="faq-question" aria-expanded={openFaq === i} onClick={() => setOpenFaq(openFaq === i ? null : i)}>
                <span>{f.q}</span><span className="material-symbols-outlined">{openFaq === i ? 'expand_less' : 'expand_more'}</span>
              </button>
              {openFaq === i && <p className="faq-answer">{f.a}</p>}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

/* ============================================================
   Saving edits — shared by every edit form
   ============================================================

   Edit forms open with their inputs blank. A blank field means
   "keep whatever is on record", so the form only ever carries the
   changes the officer is making right now. Nothing is written until
   Save Changes is pressed: until then the record on file is
   untouched and closing the form discards the draft. Closing and
   reopening remounts the form, so the inputs are blank again.       */

/* Every record update goes through these options. `log` writes the
   activity feed and logbook entry; `close` dismisses the modal. Both
   default to true, which is what every caller wants. */
type SaveOpts = { log?: boolean; close?: boolean };

/**
 * Wires up a form's Save Changes button. `commit()` returns '' when it
 * saved, or the reason the draft cannot be saved yet — which is shown
 * above the form until the officer fixes it.
 */
function useSaveChanges(dirty: boolean, commit: () => string) {
  const [error, setError] = useState('');

  const save = () => {
    if (!dirty) return;
    const problem = commit();
    setError(problem);
  };

  // A fresh keystroke clears a stale complaint about the previous attempt.
  const clearError = () => setError('');

  return { error, save, clearError, showError: setError };
}

function SaveNote({ error }: { error: string }) {
  if (error) {
    return <div className="form-error"><span className="material-symbols-outlined">error</span>{error}</div>;
  }
  return (
    <div className="save-note">
      <span className="material-symbols-outlined">edit_note</span>
      <span>Fill in only what you are changing — every blank field keeps the value on record. Nothing is saved until you press <strong>Save Changes</strong>.</span>
    </div>
  );
}

/* The footer every edit form closes with. Save Changes stays disabled
   until something has actually been changed. */
function EditActions({ dirty, onSave, onCancel, saveLabel = 'Save Changes' }: {
  dirty: boolean; onSave: () => void; onCancel: () => void; saveLabel?: string;
}) {
  return (
    <div className="modal-footer" style={{ padding: '16px 0 0', borderTop: 'none', justifyContent: 'flex-end' }}>
      <button className="btn-outline" onClick={onCancel}>Cancel</button>
      <button className="btn-primary" onClick={onSave} disabled={!dirty} title={dirty ? undefined : 'Change a field first'}>
        <span className="material-symbols-outlined">save</span>{saveLabel}
      </button>
    </div>
  );
}

/* Placeholder text that tells the officer what the blank field currently holds. */
function keepHint(current?: string) {
  const shown = current && current !== '—' && current !== '-' ? current : '';
  return shown ? `On record: ${shown} — leave blank to keep` : 'Leave blank if none';
}

/* A blank draft field keeps the recorded value. */
function keepText(draft: string, current: string) {
  return draft.trim() || current;
}

/* ============================================================
   Modal Component
   ============================================================ */

/* `stacked` is for a dialog opened from inside another one: it sits on a higher
   layer and swallows Escape before the form underneath sees it, so closing the
   sub-dialog never dismisses the record being edited. */
function Modal({ title, subtitle, onClose, wide, narrow, stacked, sheet, children }: {
  title: string; subtitle?: string; onClose: () => void; wide?: boolean; narrow?: boolean; stacked?: boolean; sheet?: boolean; children: ReactNode;
}) {
  useEffect(() => {
    if (!stacked) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      /* stopImmediatePropagation, not just stopPropagation: the form beneath
         listens on window too, and a plain stop would leave it to fire. */
      e.stopImmediatePropagation();
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true); // capture: ahead of the form below
    return () => window.removeEventListener('keydown', onKey, true);
  }, [stacked, onClose]);

  return (
    <div className={`modal-overlay${stacked ? ' stacked' : ''}`} onClick={onClose}>
      <div className={`modal-card${wide ? ' wide' : ''}${sheet ? ' sheet' : ''}${narrow ? ' narrow' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-heading">
            <h3>{title}</h3>
            {subtitle && <p className="modal-subtitle">{subtitle}</p>}
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close"><span className="material-symbols-outlined">close</span></button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

function ConfirmDialog({ icon, iconStyle, title, description, confirmLabel, confirmDanger, hideConfirm, cancelLabel = 'Cancel', onConfirm, onCancel }: { icon: string; iconStyle: string; title: string; description: string; confirmLabel?: string; confirmDanger?: boolean; hideConfirm?: boolean; cancelLabel?: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className={`confirm-card ${iconStyle}`} onClick={(e) => e.stopPropagation()}>
        <div className="confirm-head">
          <span className={`confirm-icon ${iconStyle}`}><span className="material-symbols-outlined">{icon}</span></span>
          <h4 className="confirm-title">{title}</h4>
        </div>
        <div className="confirm-body">
          <p>{description}</p>
        </div>
        <div className="confirm-actions">
          <button className="btn-outline" onClick={onCancel}>{cancelLabel}</button>
          {!hideConfirm && <button className={confirmDanger ? 'btn-danger' : 'btn-primary'} onClick={onConfirm}>{confirmLabel}</button>}
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   Add Forms
   ============================================================ */

function AddStallForm({ existingIds, onSubmit, onCancel }: { existingIds: string[]; onSubmit: (s: Stall) => void; onCancel: () => void }) {
  const [id, setId] = useState('');
  const [section, setSection] = useState(SECTIONS[0]);
  const [tenant, setTenant] = useState('');
  const [status, setStatus] = useState<StallStatus>('Available');
  const [permit, setPermit] = useState<PermitStatus>('Not Recorded');
  const [error, setError] = useState('');

  const handleSubmit = () => {
    if (HELD_STATUSES.includes(status) && !tenant.trim()) {
      setError('Enter the tenant holding this stall, or set the status to Available.');
      return;
    }
    const typedId = id.trim();
    if (typedId && existingIds.some((existing) => existing.toLowerCase() === typedId.toLowerCase())) {
      setError(`Stall ${typedId} already exists. Use a different stall ID.`);
      return;
    }
    const stallId = typedId || nextId('STL', existingIds);
    onSubmit({ id: stallId, section, tenant: status === 'Available' ? 'Vacant' : (tenant.trim() || 'Vacant'), status, permit, lastInspection: status === 'Available' ? '-' : todayStr(), note: '' });
  };

  return (
    <div className="form-grid">
      <div className="form-row">
        <div className="form-group"><label className="form-label">Stall ID</label><input className="form-input" placeholder="Auto-generated if empty" value={id} onChange={(e) => { setId(e.target.value); setError(''); }} /></div>
        <div className="form-group"><label className="form-label">Section</label><select className="form-select" value={section} onChange={(e) => setSection(e.target.value)}>{SECTIONS.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
      </div>
      <div className="form-row">
        <div className="form-group"><label className="form-label">Tenant{status === 'Occupied' ? ' *' : ''}</label><input className="form-input" placeholder={status === 'Occupied' ? 'Required for an occupied stall' : 'Leave blank if vacant'} value={tenant} onChange={(e) => { setTenant(e.target.value); setError(''); }} /></div>
        <div className="form-group"><label className="form-label">Status</label><select className="form-select" value={status} onChange={(e) => { setStatus(e.target.value as StallStatus); setError(''); }}>{STALL_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</select></div>
      </div>
      <div className="form-row">
        <div className="form-group"><label className="form-label">Business Permit</label><select className="form-select" value={permit} onChange={(e) => setPermit(e.target.value as PermitStatus)}>{PERMIT_STATUSES.map((p) => <option key={p} value={p}>{p}</option>)}</select></div>
        <div className="form-group" />
      </div>
      {error && <div className="form-error"><span className="material-symbols-outlined">error</span>{error}</div>}
      <div className="modal-footer" style={{ padding: 0, borderTop: 'none', justifyContent: 'flex-end' }}><button className="btn-outline" onClick={onCancel}>Cancel</button><button className="btn-primary" onClick={handleSubmit}>Add Stall</button></div>
    </div>
  );
}

/* The documentary requirements, presented as the ruled register the office
   actually keeps: one document per line, each carrying its own standing. */
function RequirementsChecklist({ selected, onChange }: { selected: string[]; onChange: (next: string[]) => void }) {
  const toggle = (req: string) => {
    onChange(selected.includes(req) ? selected.filter((r) => r !== req) : [...selected, req]);
  };
  const done = REQUIREMENTS.filter((r) => selected.includes(r)).length;
  const complete = done === REQUIREMENTS.length;

  return (
    <section className="form-section req-section">
      <header className="form-section-head">
        <div className="form-section-title">
          <h4>Documentary Requirements</h4>
          <span className="form-section-note">Tick each document as it is handed in over the counter.</span>
        </div>
        <span className={`req-tally${complete ? ' complete' : ''}`}>{done} of {REQUIREMENTS.length} submitted</span>
      </header>

      <ul className="req-register">
        {REQUIREMENTS.map((req) => {
          const checked = selected.includes(req);
          return (
            <li key={req}>
              <label className={`req-row${checked ? ' done' : ''}`}>
                <input type="checkbox" checked={checked} onChange={() => toggle(req)} />
                <span className="material-symbols-outlined req-mark">{checked ? 'check_box' : 'check_box_outline_blank'}</span>
                <span className="req-name">{req}</span>
                <span className="req-state">{checked ? 'Submitted' : 'Not submitted'}</span>
              </label>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function AddApplicantForm({ existingIds, stalls, tenants, applicants, onSubmit, onCancel }: { existingIds: string[]; stalls: Stall[]; tenants: Tenant[]; applicants: Applicant[]; onSubmit: (a: Applicant) => void; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [section, setSection] = useState(SECTIONS[0]);
  const [stallId, setStallId] = useState('');
  const [requirements, setRequirements] = useState<string[]>([]);
  const [error, setError] = useState('');

  /* Offerable means the office marked it Available and no tenant record holds
     it. An existing application naming the stall does not withhold it — the
     applicant list is a queue of requests, not a set of reservations. */
  const takenByTenant = useMemo(() => new Set(tenants.map((t) => t.stallId)), [tenants]);
  const openStalls = useMemo(
    () => stalls.filter((st) => st.section === section && st.status === 'Available' && !takenByTenant.has(st.id)),
    [stalls, section, takenByTenant],
  );
  /* Who already asked for each stall, so the clerk is told rather than blocked. */
  const requestedBy = useMemo(() => {
    const map = new Map<string, string>();
    applicants.forEach((a) => { if (a.stallId && !map.has(a.stallId)) map.set(a.stallId, a.name); });
    return map;
  }, [applicants]);

  const handleSubmit = () => {
    if (!name.trim()) { setError('Full name is required.'); return; }
    const badPhone = phoneProblem(phone);
    if (badPhone) { setError(badPhone); return; }
    onSubmit({
      id: nextId('APP', existingIds),
      name: name.trim(),
      phone: phone.trim() || '—',
      stallId: stallId || undefined,
      status: deriveStatus('Incomplete', requirements),
      dateApplied: todayStr(),
      requirements,
    });
  };

  return (
    <div className="form-grid">
      <div className="form-row">
        <div className="form-group"><label className="form-label">Full Name *</label><input className="form-input" placeholder="e.g. Juan Santos" value={name} onChange={(e) => { setName(e.target.value); setError(''); }} /></div>
        <div className="form-group">
          <label className="form-label">Mobile Number</label>
          <PhoneInput value={phone} onChange={(v) => { setPhone(v); setError(''); }} />
          <span className="form-hint">Digits only — 11-digit mobile number.</span>
        </div>
      </div>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Section</label>
          <select className="form-select" value={section} onChange={(e) => { setSection(e.target.value); setStallId(''); setError(''); }}>
            {SECTIONS.map((sec) => <option key={sec} value={sec}>{sec}</option>)}
          </select>
          <span className="form-hint">Choosing a section lists the stalls still free in it.</span>
        </div>
        <div className="form-group">
          <label className="form-label">Preferred Stall</label>
          <select className="form-select" value={stallId} disabled={openStalls.length === 0} onChange={(e) => { setStallId(e.target.value); setError(''); }}>
            <option value="">{openStalls.length === 0 ? '— None free in this section' : '— Decide later'}</option>
            {openStalls.map((st) => <option key={st.id} value={st.id}>{st.id}{requestedBy.has(st.id) ? ` · also asked for by ${requestedBy.get(st.id)}` : ''}</option>)}
          </select>
          <span className="form-hint">{openStalls.length} stall{openStalls.length === 1 ? '' : 's'} free in {section}.</span>
        </div>
      </div>
      <RequirementsChecklist selected={requirements} onChange={setRequirements} />
      {error && <div className="form-error"><span className="material-symbols-outlined">error</span>{error}</div>}
      <div className="modal-footer" style={{ padding: 0, borderTop: 'none', justifyContent: 'flex-end' }}><button className="btn-outline" onClick={onCancel}>Cancel</button><button className="btn-primary" onClick={handleSubmit}>Add Applicant</button></div>
    </div>
  );
}

function AssignStallForm({ applicant, stalls, tenants, onSubmit, onSkip }: { applicant: Applicant; stalls: Stall[]; tenants: Tenant[]; onSubmit: (t: Tenant) => void; onSkip: () => void }) {
  const takenStalls = useMemo(() => new Set(tenants.map((t) => t.stallId)), [tenants]);
  const vacantStalls = useMemo(
    () => stalls.filter((s) => s.status === 'Available' && !takenStalls.has(s.id)),
    [stalls, takenStalls],
  );

  /* Open on the stall the applicant asked for, as long as it is still free. */
  const requested = useMemo(
    () => (applicant.stallId ? vacantStalls.find((v) => v.id === applicant.stallId) : undefined),
    [applicant.stallId, vacantStalls],
  );
  const opening = requested ?? vacantStalls[0];
  const [stallId, setStallId] = useState(opening?.id ?? '');
  const [name, setName] = useState(applicant.name);
  const [phone, setPhone] = useState(() => digitsOnly(applicant.phone));
  const [section, setSection] = useState(() => opening?.section ?? SECTIONS[0]);
  const [rent, setRent] = useState(3500);
  const [status, setStatus] = useState('Active');
  const [error, setError] = useState('');

  const duplicate = tenants.find((t) => t.name.trim().toLowerCase() === name.trim().toLowerCase());

  const applyStall = (id: string) => {
    setStallId(id);
    setError('');
    const match = stalls.find((s) => s.id === id);
    if (match && SECTIONS.includes(match.section)) setSection(match.section);
    /* Section 43 sets what a stall of this kind pays; the officer can still
       change it, but the schedule is the starting figure. */
    const scheduled = monthlyRentForStall(id);
    if (scheduled > 0) setRent(scheduled);
  };

  const handleSubmit = () => {
    if (!name.trim()) { setError('Tenant name is required.'); return; }
    if (!stallId) { setError('Select a stall to assign, or skip for now.'); return; }
    const badPhone = phoneProblem(phone);
    if (badPhone) { setError(badPhone); return; }
    onSubmit({
      id: nextId('TEN', tenants.map((t) => t.id)),
      keepers: [],
      barangay: '',
      name: name.trim(),
      phone: phone.trim() || '—',
      stallId,
      section,
      rent,
      status,
      applicantId: applicant.id,
      /* Meters are read off the stall later; rent starts unpaid for the month. */
      meters: { Electricity: '', Water: '' },
      rentDueDay: DEFAULT_RENT_DUE_DAY,
      rentPayments: {},
    });
  };

  return (
    <div className="form-grid">
      <div className="approved-banner">
        <span className="material-symbols-outlined">check_circle</span>
        <div>
          <strong>{applicant.name}'s application is approved</strong>
          <span>Assign a stall and confirm the tenancy details to create their tenant record.</span>
        </div>
      </div>

      {vacantStalls.length === 0 ? (
        <div className="form-error">
          <span className="material-symbols-outlined">error</span>
          No vacant stalls are available. Add a stall or free one up, then create this tenant from Tenant Records.
        </div>
      ) : (
        <>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Assign Stall *</label>
              <select className="form-select" value={stallId} onChange={(e) => applyStall(e.target.value)}>
                {vacantStalls.map((s) => <option key={s.id} value={s.id}>{s.id} — {s.section}</option>)}
              </select>
              <span className="form-hint">{vacantStalls.length} vacant stall{vacantStalls.length === 1 ? '' : 's'} available. Assigning marks it Occupied.</span>
            </div>
            <div className="form-group">
              <label className="form-label">Section</label>
              <select className="form-select" value={section} onChange={(e) => setSection(e.target.value)}>{SECTIONS.map((s) => <option key={s} value={s}>{s}</option>)}</select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group"><label className="form-label">Tenant Name *</label><input className="form-input" value={name} onChange={(e) => { setName(e.target.value); setError(''); }} /></div>
            <div className="form-group"><label className="form-label">Mobile Number</label><PhoneInput value={phone} onChange={(v) => { setPhone(v); setError(''); }} /></div>
          </div>

          <div className="form-row">
            <div className="form-group"><label className="form-label">Monthly Rent (₱)</label><input className="form-input" type="number" min="0" step="500" value={rent} onChange={(e) => setRent(toAmount(e.target.value))} /></div>
            <div className="form-group"><label className="form-label">Lease Status</label><select className="form-select" value={status} onChange={(e) => setStatus(e.target.value)}><option value="Active">Active</option><option value="Expiring Soon">Expiring Soon</option></select></div>
          </div>

          {duplicate && <span className="form-hint error">A tenant named "{duplicate.name}" ({duplicate.id}) already exists — check this is not a duplicate.</span>}
        </>
      )}

      {error && <div className="form-error"><span className="material-symbols-outlined">error</span>{error}</div>}

      <div className="modal-footer" style={{ padding: 0, borderTop: 'none', justifyContent: 'space-between' }}>
        <button className="btn-outline" onClick={onSkip}>Skip for now</button>
        {vacantStalls.length > 0 && <button className="btn-primary" onClick={handleSubmit}><span className="material-symbols-outlined">how_to_reg</span>Create Tenant Record</button>}
      </div>
    </div>
  );
}

function AddTenantForm({ existingIds, stalls, tenants, onSubmit, onCancel }: { existingIds: string[]; stalls: Stall[]; tenants: Tenant[]; onSubmit: (t: Tenant) => void; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [stallId, setStallId] = useState('');
  const [section, setSection] = useState(SECTIONS[0]);
  const [rent, setRent] = useState(3500);
  const [rentDueDay, setRentDueDay] = useState(DEFAULT_RENT_DUE_DAY);
  const [status, setStatus] = useState('Active');
  const [barangay, setBarangay] = useState('');
  const [electricMeter, setElectricMeter] = useState('');
  const [waterMeter, setWaterMeter] = useState('');
  const [keeperDrafts, setKeeperDrafts] = useState<KeeperDraft[]>([]);
  const [error, setError] = useState('');

  const applyStall = (value: string) => {
    setStallId(value);
    setError('');
    const match = stalls.find((s) => s.id.toLowerCase() === value.trim().toLowerCase());
    if (match && SECTIONS.includes(match.section)) setSection(match.section);
  };

  const handleSubmit = () => {
    if (!name.trim()) { setError('Tenant name is required.'); return; }
    const trimmedStall = stallId.trim();
    if (trimmedStall) {
      const occupant = tenants.find((t) => t.stallId.toLowerCase() === trimmedStall.toLowerCase());
      if (occupant) { setError(`Stall ${trimmedStall} is already assigned to ${occupant.name}.`); return; }
    }
    const problem = phoneProblem(phone) || keeperDraftsProblem(keeperDrafts);
    if (problem) { setError(problem); return; }
    onSubmit({
      id: nextId('TEN', existingIds), name: name.trim(), phone: phone.trim() || '—', barangay: barangay.trim(),
      stallId: trimmedStall || '—', section, rent, status,
      keepers: resolveKeepers(keeperDrafts),
      meters: { Electricity: electricMeter.trim(), Water: waterMeter.trim() },
      rentDueDay: clampDueDay(rentDueDay),
      rentPayments: {},
    });
  };

  return (
    <div className="form-grid">
      <div className="form-row">
        <div className="form-group"><label className="form-label">Tenant Name *</label><input className="form-input" placeholder="e.g. DUZON, DULCE CORAZON" value={name} onChange={(e) => { setName(e.target.value); setError(''); }} /></div>
        <div className="form-group">
          <label className="form-label">Mobile Number</label>
          <PhoneInput value={phone} onChange={(v) => { setPhone(v); setError(''); }} />
          <span className="form-hint">Digits only — 11-digit mobile number.</span>
        </div>
      </div>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Barangay</label>
          <input className="form-input" placeholder="e.g. Barangay Poblacion" value={barangay} onChange={(e) => { setBarangay(e.target.value); setError(''); }} />
        </div>
        <div className="form-group">
          <label className="form-label">Stall ID</label>
          <input className="form-input" placeholder="e.g. M-101" list="stall-id-options" value={stallId} onChange={(e) => applyStall(e.target.value)} />
          <datalist id="stall-id-options">{stalls.filter((s) => s.status === 'Available').map((s) => <option key={s.id} value={s.id}>{s.section}</option>)}</datalist>
          <span className="form-hint">Assigning a stall marks it as occupied and enables utility billing for it.</span>
        </div>
      </div>
      <div className="form-row">
        <div className="form-group"><label className="form-label">Section</label><select className="form-select" value={section} onChange={(e) => setSection(e.target.value)}>{SECTIONS.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
        <div className="form-group"><label className="form-label">Monthly Rent (₱)</label><input className="form-input" type="number" min="0" step="500" value={rent} onChange={(e) => setRent(toAmount(e.target.value))} /></div>
      </div>
      <div className="form-row">
        <div className="form-group"><label className="form-label">Status</label><select className="form-select" value={status} onChange={(e) => setStatus(e.target.value)}><option value="Active">Active</option><option value="Expiring Soon">Expiring Soon</option></select></div>
        <div className="form-group">
          <label className="form-label">Rent Due Day</label>
          <RentDueDaySelect value={String(rentDueDay)} onChange={(v) => setRentDueDay(clampDueDay(v))} />
          <span className="form-hint">Rent unpaid after this day of the month is flagged overdue.</span>
        </div>
      </div>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Electricity Meter Number</label>
          <input className="form-input" placeholder="e.g. EM-1101" value={electricMeter} onChange={(e) => setElectricMeter(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Water Meter Number</label>
          <input className="form-input" placeholder="e.g. WM-2301" value={waterMeter} onChange={(e) => setWaterMeter(e.target.value)} />
          <span className="form-hint">Both fill in automatically when this tenant is billed.</span>
        </div>
      </div>
      <StallkeeperEditor drafts={keeperDrafts} onChange={(next) => { setKeeperDrafts(next); setError(''); }} />
      {error && <div className="form-error"><span className="material-symbols-outlined">error</span>{error}</div>}
      <div className="modal-footer" style={{ padding: 0, borderTop: 'none', justifyContent: 'flex-end' }}><button className="btn-outline" onClick={onCancel}>Cancel</button><button className="btn-primary" onClick={handleSubmit}>Add Tenant</button></div>
    </div>
  );
}

function AddLogForm({ existingIds, onSubmit, onCancel }: { existingIds: string[]; onSubmit: (l: LogEntry) => void; onCancel: () => void }) {
  const [type, setType] = useState(LOG_TYPES[0]);
  const [details, setDetails] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = () => {
    if (!details.trim()) { setError('Enter the details of this log entry.'); return; }
    onSubmit({ id: nextId('LOG', existingIds), date: todayIso(), time: nowTimeStr(), type, details: details.trim() });
  };

  return (
    <div className="form-grid">
      <div className="form-group"><label className="form-label">Entry Type</label><select className="form-select" value={type} onChange={(e) => setType(e.target.value)}>{LOG_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
      <div className="form-group"><label className="form-label">Details *</label><textarea className="form-textarea" placeholder="Describe the event or activity..." value={details} onChange={(e) => { setDetails(e.target.value); setError(''); }} /></div>
      {error && <div className="form-error"><span className="material-symbols-outlined">error</span>{error}</div>}
      <div className="modal-footer" style={{ padding: 0, borderTop: 'none', justifyContent: 'flex-end' }}><button className="btn-outline" onClick={onCancel}>Cancel</button><button className="btn-primary" onClick={handleSubmit}>Add Entry</button></div>
    </div>
  );
}

/* ============================================================
   Detail Views
   ============================================================ */

function StallDetailView({ stall, occupant, bills, onEdit, onClose, onVerify }: { stall: Stall; occupant?: Tenant; bills: UtilityBill[]; onEdit: () => void; onClose: () => void; onVerify: () => void }) {
  const billed = bills.reduce((sum, b) => sum + b.amount, 0);
  const unpaid = bills.filter((b) => b.status === 'Unpaid').reduce((sum, b) => sum + b.amount, 0);

  return (<>
    <RecordSheet
      title={`Stall ${stall.id}`}
      subtitle={`${stall.section} \u00b7 Last inspected ${stall.lastInspection && stall.lastInspection !== '-' ? stall.lastInspection : 'not yet recorded'}`}
      badge={<StatusBadge status={stall.status} />}
    >
      <RecordSection title="Stall Particulars" icon="storefront">
        <div className="record-grid">
          <RecordRow label="Stall Number" value={stall.id} />
          <RecordRow label="Market Section" value={stall.section} />
          <RecordRow label="Occupancy Status" node={<StatusBadge status={stall.status} />} />
          <RecordRow label="Last Inspection" value={stall.lastInspection === '-' ? '' : stall.lastInspection} />
          <RecordRow label="Business Permit" node={<PermitBadge permit={stall.permit} />} />
          <RecordRow label="Sheet Note" value={stall.note} />
        </div>
      </RecordSection>

      <RecordSection title="Assigned Tenant" icon="person">
        {occupant ? (
          <div className="record-grid">
            <RecordRow label="Tenant Name" value={occupant.name} />
            <RecordRow label="Tenant Record" value={occupant.id} />
            <RecordRow label="Contact Number" value={formatPhone(occupant.phone)} />
            <RecordRow label="Monthly Rent" value={money(occupant.rent)} />
          </div>
        ) : <RecordNote>This stall has no tenant record assigned to it.</RecordNote>}
      </RecordSection>

      <RecordSection title={(occupant?.keepers.length ?? 0) > 1 ? `Stallkeepers (${occupant?.keepers.length})` : 'Stallkeeper Information'} icon="storefront">
        <StallkeeperRecord
          keepers={occupant?.keepers ?? []}
          emptyText={occupant ? 'No stallkeeper has been registered for this tenant.' : 'No stallkeeper on record — the stall is unassigned.'}
        />
      </RecordSection>

      <RecordSection title="Utility Summary" icon="bolt">
        <div className="record-grid">
          <RecordRow label="Total Billed" value={money(billed)} />
          <RecordRow label="Bills Issued" value={String(bills.length)} />
        </div>
        <RecordTotal label="Outstanding Balance" value={money(unpaid)} />
      </RecordSection>
    </RecordSheet>

    <BillHistory bills={bills} emptyText={`No electricity or water bills have been issued for stall ${stall.id} yet.`} />
    <div className="modal-footer" style={{ padding: '16px 0 0', borderTop: 'none', justifyContent: 'flex-end' }}>
      <button className="btn-outline" onClick={onClose}>Close</button>
      <button className="btn-outline" onClick={onVerify}><span className="material-symbols-outlined">fact_check</span>Stall / Space Verification</button>
      <button className="btn-primary" onClick={onEdit}><span className="material-symbols-outlined">edit</span>Edit Details</button>
    </div>
  </>);
}

function StallEditForm({ stall, occupant, bills, onSave, onClose }: { stall: Stall; occupant?: Tenant; bills: UtilityBill[]; onSave: (s: Stall, opts?: SaveOpts, previous?: Stall) => void; onClose: () => void }) {
  // Blank draft — anything left blank keeps what the stall already has.
  const [section, setSection] = useState('');
  const [tenant, setTenant] = useState('');
  const [status, setStatus] = useState<'' | StallStatus>('');
  const [permit, setPermit] = useState<'' | PermitStatus>('');
  const [lastInspection, setLastInspection] = useState('');

  const locked = !!occupant;
  const recordedTenant = stall.tenant === 'Vacant' ? '' : stall.tenant;
  const dirty = !!(section || tenant.trim() || status || permit || lastInspection.trim());
  /* A tenant record holds the stall, but it does not mean the stall is trading —
     a temporarily closed or abandoned one keeps that state through an edit. */
  const heldFallback: StallStatus = HELD_STATUSES.includes(stall.status) ? stall.status : 'Occupied';
  const effectiveStatus: StallStatus = locked ? (status || heldFallback) : (status || stall.status);
  /* Choosing Available on a held stall ends the tenancy — flagged in the form
     before it is saved, because the tenant record does not come back. */
  const releasing = locked && effectiveStatus === 'Available';

  const merged = (): Stall => {
    const nextTenant = effectiveStatus === 'Available'
      ? 'Vacant'
      : locked ? occupant.name : (keepText(tenant, recordedTenant) || 'Vacant');
    return {
      ...stall,
      section: section || stall.section,
      tenant: nextTenant,
      status: effectiveStatus,
      permit: permit || stall.permit,
      lastInspection: keepText(lastInspection, stall.lastInspection) || '-',
    };
  };

  const commit = () => {
    const next = merged();
    if (!locked && HELD_STATUSES.includes(next.status) && next.tenant === 'Vacant') {
      return 'Enter the tenant holding this stall, or set the status back to Available.';
    }
    onSave(next, {}, stall);
    return '';
  };

  const form = useSaveChanges(dirty, commit);
  const edit = <T,>(set: (v: T) => void) => (value: T) => { form.clearError(); set(value); };

  return (<>
    <div className="form-grid">
      <SaveNote error={form.error} />
      <div className="form-row">
        <div className="form-group"><label className="form-label">Stall ID</label><input className="form-input" value={stall.id} disabled /></div>
        <div className="form-group">
          <label className="form-label">Section</label>
          <select className="form-select" value={section} onChange={(e) => edit(setSection)(e.target.value)}>
            <option value="">— Keep {stall.section}</option>
            {[...new Set([stall.section, ...SECTIONS])].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Tenant</label>
          <input className="form-input" value={locked ? occupant.name : tenant} disabled={locked} placeholder={locked ? '' : keepHint(recordedTenant || 'Vacant')} onChange={(e) => edit(setTenant)(e.target.value)} />
          {locked && <span className="form-hint">Held by tenant record {occupant.id}. Rename or reassign from Tenant Records.</span>}
        </div>
        <div className="form-group">
          <label className="form-label">Status</label>
          <select className="form-select" value={status} onChange={(e) => edit(setStatus)(e.target.value as StallStatus)}>
            <option value="">— Keep {stall.status}</option>
            {STALL_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          {locked && !releasing && <span className="form-hint">Held by tenant record {occupant.id}. Setting this to Available hands the stall back and removes that record.</span>}
          {releasing && (
            <span className="form-hint error">
              Saving will remove tenant {occupant.id} ({occupant.name}) from tenant records and leave {stall.id} vacant. Their utility bills are kept as billing history. This cannot be undone.
            </span>
          )}
        </div>
        <div className="form-group">
          <label className="form-label">Business Permit</label>
          <select className="form-select" value={permit} onChange={(e) => edit(setPermit)(e.target.value as PermitStatus)}>
            <option value="">— Keep {stall.permit}</option>
            {PERMIT_STATUSES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
      </div>
      <div className="form-group">
        <label className="form-label">Last Inspection</label>
        <div className="form-row" style={{ gap: '10px' }}>
          <input className="form-input" value={lastInspection} placeholder={keepHint(stall.lastInspection)} onChange={(e) => edit(setLastInspection)(e.target.value)} />
          <button className="btn-outline" type="button" onClick={() => edit(setLastInspection)(todayStr())}>Inspected Today</button>
        </div>
      </div>
      {occupant && (
        <div className="detail-grid">
          <div className="detail-field">
            <span className="detail-label">Stallkeeper{occupant.keepers.length > 1 ? 's' : ''}</span>
            <span className={`detail-value${occupant.keepers.length ? '' : ' muted'}`}>{keeperSummary(occupant.keepers) || 'None registered'}</span>
          </div>
          <div className="detail-field">
            <span className="detail-label">Contact Number{occupant.keepers.length > 1 ? 's' : ''}</span>
            <span className={`detail-value${occupant.keepers.some((k) => k.phone) ? '' : ' muted'}`}>
              {occupant.keepers.filter((k) => k.phone).map((k) => formatPhone(k.phone)).join(', ') || '—'}
            </span>
          </div>
          <div className="detail-field">
            <span className="detail-label">Managed From</span>
            <span className={`detail-value${occupant.keepers.some((k) => k.barangay) ? '' : ' muted'}`}>
              {[...new Set(occupant.keepers.map((k) => k.barangay).filter(Boolean))].join(', ') || '—'}
            </span>
          </div>
        </div>
      )}
    </div>
    <BillHistory bills={bills} emptyText={`No electricity or water bills have been issued for stall ${stall.id} yet.`} />
    <EditActions dirty={dirty} onSave={form.save} onCancel={onClose} />
  </>);
}

function ApplicantDetailView({ applicant, onReview, onClose }: { applicant: Applicant; onReview: () => void; onClose: () => void }) {
  const missing = REQUIREMENTS.filter((r) => !applicant.requirements.includes(r));

  return (<>
    <RecordSheet
      title={applicant.name}
      subtitle={`Application ${applicant.id} \u00b7 Filed ${applicant.dateApplied || 'date not recorded'}`}
      badge={<StatusBadge status={applicant.status} />}
    >
      <RecordSection title="Applicant Particulars" icon="badge">
        <div className="record-grid">
          <RecordRow label="Full Name" value={applicant.name} />
          <RecordRow label="Contact Number" value={formatPhone(applicant.phone)} />
          <RecordRow label="Date Applied" value={applicant.dateApplied} />
        </div>
      </RecordSection>

      <RecordSection title="Documentary Requirements" icon="fact_check">
        <div className="record-checklist">
          {REQUIREMENTS.map((r) => {
            const submitted = applicant.requirements.includes(r);
            return (
              <div className={`record-check${submitted ? ' done' : ''}`} key={r}>
                <span className="material-symbols-outlined">{submitted ? 'check_circle' : 'radio_button_unchecked'}</span>
                <span className="record-check-label">{r}</span>
                <span className="record-check-state">{submitted ? 'Submitted' : 'Not submitted'}</span>
              </div>
            );
          })}
        </div>
        <RecordTotal label="Requirements Complete" value={`${applicant.requirements.length} of ${REQUIREMENTS.length}`} />
        {missing.length > 0 && <RecordNote>Still outstanding: {missing.join(', ')}.</RecordNote>}
      </RecordSection>
    </RecordSheet>

    <div className="modal-footer" style={{ padding: '16px 0 0', borderTop: 'none', justifyContent: 'flex-end' }}>
      <button className="btn-outline" onClick={onClose}>Close</button>
      <button className="btn-primary" onClick={onReview}><span className="material-symbols-outlined">fact_check</span>Review Application</button>
    </div>
  </>);
}

function ApplicantReviewForm({ applicant, current, onSave, onClose }: { applicant: Applicant; current: Applicant; onSave: (a: Applicant, opts?: SaveOpts, previous?: Applicant, promptAssign?: boolean) => void; onClose: () => void }) {
  // Blank draft — anything left blank keeps what the application already has.
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [status, setStatus] = useState<'' | ApplicantStatus>('');

  /* The checklist is ticked in the draft like every other field, so a document
     can be ticked and un-ticked freely before any of it is committed. */
  const [requirements, setRequirements] = useState<string[]>(() => [...current.requirements]);
  const complete = REQUIREMENTS.every((r) => requirements.includes(r));
  const missing = REQUIREMENTS.length - requirements.length;
  const reqsChanged = REQUIREMENTS.some((r) => requirements.includes(r) !== current.requirements.includes(r));
  const dirty = !!(name.trim() || phone.trim() || status || reqsChanged);

  const merged = (overrideStatus?: ApplicantStatus): Applicant => {
    const base = status || current.status;
    return {
      ...current,
      name: keepText(name, current.name),
      phone: keepText(phone, current.phone) || '—',
      requirements,
      /* A tick that completes or breaks the checklist moves the standing with
         it, unless the officer chose a status explicitly. */
      status: overrideStatus ?? (reqsChanged && !status ? deriveStatus(base, requirements) : base),
    };
  };

  const commit = () => {
    const badPhone = phoneProblem(phone);
    if (badPhone) return badPhone;
    onSave(merged(), {}, applicant);
    return '';
  };

  const form = useSaveChanges(dirty, commit);
  const edit = <T,>(set: (v: T) => void) => (value: T) => { form.clearError(); set(value); };

  /* Approving or rejecting is a decision in its own right: it saves the draft
     along with it, so there is no separate Save Changes step to remember. */
  const decide = (nextStatus: ApplicantStatus) => {
    const badPhone = phoneProblem(phone);
    if (badPhone) { form.showError(badPhone); return; }
    onSave(merged(nextStatus), { close: true }, applicant, nextStatus === 'Approved' && applicant.status !== 'Approved');
  };

  return (<>
    <div className="form-grid">
      <SaveNote error={form.error} />
      <div className="form-row">
        <div className="form-group"><label className="form-label">Applicant ID</label><input className="form-input" value={current.id} disabled /></div>
        <div className="form-group"><label className="form-label">Date Applied</label><input className="form-input" value={current.dateApplied} disabled /></div>
      </div>
      <div className="form-row">
        <div className="form-group"><label className="form-label">Full Name</label><input className="form-input" value={name} placeholder={keepHint(current.name)} onChange={(e) => edit(setName)(e.target.value)} /></div>
        <div className="form-group"><label className="form-label">Mobile Number</label><PhoneInput value={phone} placeholder={keepHint(formatPhone(current.phone))} onChange={edit(setPhone)} /></div>
      </div>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Status</label>
          <select className="form-select" value={status} onChange={(e) => edit(setStatus)(e.target.value as ApplicantStatus)}>
            <option value="">— Keep {current.status}</option>
            <option value="Pending Review">Pending Review</option>
            <option value="Incomplete">Incomplete</option>
            <option value="No BP">No BP</option>
            <option value="Approved">Approved</option>
            <option value="Rejected">Rejected</option>
          </select>
        </div>
      </div>

      <RequirementsChecklist selected={requirements} onChange={edit(setRequirements)} />
      {!complete && current.status !== 'Rejected' && (
        <span className="form-hint">{missing} requirement(s) still missing — you can still approve, but the checklist will show it as incomplete.</span>
      )}

      <div className="applicant-decision">
        <div className="applicant-decision-left">
          <button className="btn-outline" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={form.save} disabled={!dirty} title={dirty ? undefined : 'Change a field first'}>
            <span className="material-symbols-outlined">save</span>Save Changes
          </button>
        </div>
        <div className="applicant-decision-right">
          {current.status !== 'Rejected' && <button className="btn-outline-danger" onClick={() => decide('Rejected')}>Reject</button>}
          {current.status !== 'Approved' && <button className="btn-outline-success" onClick={() => decide('Approved')}>Approve</button>}
        </div>
      </div>
    </div>
  </>);
}

/* ============================================================
   Record Sheet — shared formal read-only detail presentation
   ============================================================ */

function RecordSheet({ title, subtitle, badge, children }: { title: string; subtitle: string; badge?: ReactNode; children: ReactNode }) {
  return (
    <div className="record-sheet">
      <header className="record-header">
        <div>
          <h3 className="record-title">{title}</h3>
          <p className="record-subtitle">{subtitle}</p>
        </div>
        {badge}
      </header>
      {children}
    </div>
  );
}

function RecordSection({ title, icon, children }: { title: string; icon?: string; children: ReactNode }) {
  return (
    <section className="record-section">
      <h4 className="record-section-title">
        {icon && <span className="material-symbols-outlined">{icon}</span>}
        {title}
      </h4>
      {children}
    </section>
  );
}

function RecordRow({ label, value, node }: { label: string; value?: string; node?: ReactNode }) {
  const text = value && value.trim() && value.trim() !== '\u2014' ? value.trim() : '';
  return (
    <div className="record-row">
      <span className="record-label">{label}</span>
      {node ? <span className="record-value">{node}</span>
            : <span className={`record-value${text ? '' : ' empty'}`}>{text || 'Not on record'}</span>}
    </div>
  );
}

function RecordTotal({ label, value }: { label: string; value: string }) {
  return (
    <div className="record-total">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function RecordNote({ children }: { children: ReactNode }) {
  return <p className="record-note">{children}</p>;
}

function TenantDetailView({ tenant, bills, onSetRentPaid, onEdit, onClose }: { tenant: Tenant; bills: UtilityBill[]; onSetRentPaid: (tenantId: string, period: string, paid: boolean) => void; onEdit: () => void; onClose: () => void }) {
  const utilitiesBilled = bills.reduce((sum, b) => sum + b.amount, 0);
  const period = currentPeriod();
  const rentStatus = rentStatusOf(tenant, period);
  const paid = rentStatus === 'Paid';
  const payment = rentPaymentFor(tenant, period);
  const late = rentDaysLate(tenant, period);
  const collected = rentTotalPaid(tenant);

  return (<>
    <RecordSheet
      title={tenant.name}
      subtitle={`Tenant Record ${tenant.id}${tenant.applicantId ? ` \u00b7 From Application ${tenant.applicantId}` : ''}`}
      badge={<TenantStatusBadge status={tenant.status} />}
    >
      <RecordSection title="Tenant Particulars" icon="badge">
        <div className="record-grid">
          <RecordRow label="Full Name" value={tenant.name} />
          <RecordRow label="Contact Number" value={formatPhone(tenant.phone)} />
          <RecordRow label="Barangay" value={tenant.barangay} />
          <RecordRow label="Stall Assignment" value={tenant.stallId} />
          <RecordRow label="Market Section" value={tenant.section} />
        </div>
      </RecordSection>

      <RecordSection title={tenant.keepers.length > 1 ? `Stallkeepers (${tenant.keepers.length})` : 'Stallkeeper Information'} icon="storefront">
        <StallkeeperRecord keepers={tenant.keepers} emptyText="No stallkeeper has been registered for this tenant." />
      </RecordSection>

      <RecordSection title="Utility Meters" icon="speed">
        <div className="record-grid">
          <RecordRow label="Electricity Meter No." value={tenant.meters.Electricity} />
          <RecordRow label="Water Meter No." value={tenant.meters.Water} />
        </div>
      </RecordSection>

      <RecordSection title="Rent Account" icon="payments">
        <div className="record-grid">
          <RecordRow label="Monthly Rent" value={money(tenant.rent)} />
          <RecordRow label="Falls Due" value={`Day ${clampDueDay(tenant.rentDueDay)} of each month`} />
          <RecordRow label={`${formatPeriod(period)} Rent`} node={<RentStatusBadge status={rentStatus} />} />
          <RecordRow
            label={paid ? 'Date Paid' : 'Due Date'}
            value={paid ? (payment?.paidOn ? formatIsoDate(payment.paidOn) : '') : formatIsoDate(rentDueIso(tenant, period))}
          />
          {paid && payment && payment.discount > 0 && (<>
            <RecordRow label={`Early-Payment Discount (${EARLY_RENT_DISCOUNT_PCT}%)`} value={`−${money(payment.discount)}`} />
            <RecordRow label="Amount Collected" value={money(payment.amount)} />
          </>)}
        </div>
        {paid && payment && payment.discount > 0 && (
          <RecordNote>Settled on {formatIsoDate(payment.paidOn)}, on or before the due date, so {EARLY_RENT_DISCOUNT_PCT}% of the {money(tenant.rent)} monthly rent was taken off. {money(payment.amount)} was collected.</RecordNote>
        )}
        {!paid && rentQuoteToday(tenant, period).early && (
          <RecordNote>Settled today, this month qualifies for the {EARLY_RENT_DISCOUNT_PCT}% early-payment discount: {money(rentQuoteToday(tenant, period).payable)} instead of {money(tenant.rent)}. The discount is lost after {formatIsoDate(rentDueIso(tenant, period))}.</RecordNote>
        )}
        {rentStatus === 'Overdue' && (
          <RecordNote>Rent for {formatPeriod(period)} fell due on {formatIsoDate(rentDueIso(tenant, period))} and is {late} day{late === 1 ? '' : 's'} past due.</RecordNote>
        )}
        <RecordTotal label="Rent Collected to Date" value={money(collected)} />
      </RecordSection>

      <RecordSection title="Account Summary" icon="receipt_long">
        <div className="record-grid">
          <RecordRow label="Rent Collected" value={money(collected)} />
          <RecordRow label="Utilities Billed" value={money(utilitiesBilled)} />
        </div>
        <RecordTotal label="Rent + Utilities (to date)" value={money(collected + utilitiesBilled)} />
      </RecordSection>
    </RecordSheet>

    <RentLedger tenant={tenant} />
    <BillHistory bills={bills} emptyText={`No electricity or water bills have been issued to ${tenant.name} yet.`} />
    <div className="modal-footer" style={{ padding: '16px 0 0', borderTop: 'none', justifyContent: 'flex-end' }}>
      <button className="btn-outline" onClick={onClose}>Close</button>
      <button className="btn-outline" onClick={() => onSetRentPaid(tenant.id, period, !paid)}>
        <span className="material-symbols-outlined">{paid ? 'undo' : 'payments'}</span>
        {paid ? `Undo ${formatPeriodShort(period)} Rent` : `Record ${formatPeriodShort(period)} Rent Paid`}
      </button>
      <button className="btn-primary" onClick={onEdit}><span className="material-symbols-outlined">edit</span>Edit Details</button>
    </div>
  </>);
}

function TenantEditForm({ tenant, current, tenants, stalls, onSave, onClose }: { tenant: Tenant; current: Tenant; tenants: Tenant[]; stalls: Stall[]; onSave: (t: Tenant, opts?: SaveOpts, previous?: Tenant) => void; onClose: () => void }) {
  // Blank draft — anything left blank keeps what the tenant record already has.
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [stallId, setStallId] = useState('');
  const [section, setSection] = useState('');
  const [rent, setRent] = useState('');
  const [rentDueDay, setRentDueDay] = useState('');
  const [status, setStatus] = useState('');
  const [barangay, setBarangay] = useState('');
  const [electricMeter, setElectricMeter] = useState('');
  const [waterMeter, setWaterMeter] = useState('');

  /* One row per stallkeeper on record, each opening blank like every other
     field. Adding a row registers someone new; removing one takes them off the
     record — both only once the form is saved. */
  const [keeperDrafts, setKeeperDrafts] = useState<KeeperDraft[]>(() => keeperDraftsFrom(current.keepers));

  const recordedPhone = current.phone === '—' ? '' : current.phone;
  const keepersChanged = JSON.stringify(resolveKeepers(keeperDrafts)) !== JSON.stringify(current.keepers)
    || keeperDraftsTouched(keeperDrafts);
  const dirty = !!(name.trim() || phone.trim() || stallId || section || rent.trim() || rentDueDay || status || barangay.trim() || electricMeter.trim() || waterMeter.trim() || keepersChanged);

  const merged = (): Tenant => ({
    ...current,
    name: keepText(name, current.name),
    phone: keepText(phone, recordedPhone) || '—',
    barangay: keepText(barangay, current.barangay),
    stallId: stallId || current.stallId,
    section: section || current.section,
    rent: rent.trim() ? toAmount(rent) : current.rent,
    rentDueDay: rentDueDay ? clampDueDay(rentDueDay) : clampDueDay(current.rentDueDay),
    status: status || current.status,
    keepers: resolveKeepers(keeperDrafts),
    meters: {
      Electricity: keepText(electricMeter, current.meters.Electricity),
      Water: keepText(waterMeter, current.meters.Water),
    },
  });

  const commit = () => {
    const next = merged();
    const clash = tenants.find((t) => t.id !== current.id && t.stallId === next.stallId && next.stallId !== '—');
    if (clash) return `Stall ${next.stallId} is already assigned to ${clash.name}.`;
    const problem = phoneProblem(phone) || keeperDraftsProblem(keeperDrafts);
    if (problem) return problem;
    onSave(next, {}, tenant);
    return '';
  };

  const form = useSaveChanges(dirty, commit);
  const edit = <T,>(set: (v: T) => void) => (value: T) => { form.clearError(); set(value); };

  const stallOptions = useMemo(() => {
    const taken = new Set(tenants.filter((t) => t.id !== current.id).map((t) => t.stallId));
    const ids = stalls.filter((s) => !taken.has(s.id) && (s.id === current.stallId || s.status === 'Available')).map((s) => s.id);
    if (current.stallId && current.stallId !== '—' && !ids.includes(current.stallId)) ids.unshift(current.stallId);
    return ids;
  }, [stalls, tenants, current]);

  /* Picking a stall pulls its section across with it. */
  const applyStall = (value: string) => {
    form.clearError();
    setStallId(value);
    const match = stalls.find((s) => s.id === value);
    if (match && SECTIONS.includes(match.section)) setSection(match.section);
  };

  return (<>
    <div className="form-grid">
      <SaveNote error={form.error} />
      <div className="form-row">
        <div className="form-group"><label className="form-label">Tenant ID</label><input className="form-input" value={current.id} disabled /></div>
        <div className="form-group"><label className="form-label">Barangay</label><input className="form-input" value={barangay} placeholder={keepHint(current.barangay)} onChange={(e) => edit(setBarangay)(e.target.value)} /></div>
      </div>
      <div className="form-row">
        <div className="form-group"><label className="form-label">Name</label><input className="form-input" value={name} placeholder={keepHint(current.name)} onChange={(e) => edit(setName)(e.target.value)} /></div>
        <div className="form-group"><label className="form-label">Mobile Number</label><PhoneInput value={phone} placeholder={keepHint(formatPhone(recordedPhone))} onChange={edit(setPhone)} /></div>
      </div>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Stall ID</label>
          <select className="form-select" value={stallId} onChange={(e) => applyStall(e.target.value)}>
            <option value="">— Keep {current.stallId && current.stallId !== '—' ? current.stallId : 'no stall'}</option>
            <option value="—">Release the stall — no stall assigned</option>
            {stallOptions.map((id) => <option key={id} value={id}>{id}</option>)}
          </select>
          <span className="form-hint">Reassigning releases the old stall and marks the new one Occupied.</span>
        </div>
        <div className="form-group">
          <label className="form-label">Section</label>
          <select className="form-select" value={section} onChange={(e) => edit(setSection)(e.target.value)}>
            <option value="">— Keep {current.section}</option>
            {[...new Set([current.section, ...SECTIONS])].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>
      <div className="form-row">
        <div className="form-group"><label className="form-label">Monthly Rent (₱)</label><input className="form-input" type="number" min="0" step="500" placeholder={keepHint(money(current.rent))} value={rent} onChange={(e) => edit(setRent)(e.target.value)} /></div>
        <div className="form-group">
          <label className="form-label">Status</label>
          <select className="form-select" value={status} onChange={(e) => edit(setStatus)(e.target.value)}>
            <option value="">— Keep {current.status}</option>
            <option value="Active">Active</option><option value="Expiring Soon">Expiring Soon</option>
          </select>
        </div>
      </div>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Rent Due Day</label>
          <RentDueDaySelect value={rentDueDay} keepLabel={`— Keep day ${clampDueDay(current.rentDueDay)}`} onChange={(v) => edit(setRentDueDay)(v)} />
          <span className="form-hint">Rent unpaid after this day of the month is flagged overdue.</span>
        </div>
        <div className="form-group">
          <label className="form-label">Electricity Meter Number</label>
          <input className="form-input" value={electricMeter} placeholder={keepHint(current.meters.Electricity)} onChange={(e) => edit(setElectricMeter)(e.target.value)} />
        </div>
      </div>
      <div className="form-group">
        <label className="form-label">Water Meter Number</label>
        <input className="form-input" value={waterMeter} placeholder={keepHint(current.meters.Water)} onChange={(e) => edit(setWaterMeter)(e.target.value)} />
        <span className="form-hint">Both meter numbers fill in automatically whenever this tenant is billed.</span>
      </div>
      <StallkeeperEditor drafts={keeperDrafts} onChange={(next) => { form.clearError(); setKeeperDrafts(next); }} />
    </div>
    <EditActions dirty={dirty} onSave={form.save} onCancel={onClose} />
  </>);
}

/* ============================================================
   Shared Components
   ============================================================ */

/* Contact number field. Non-digits never reach state: they are blocked at the
   keystroke and stripped again on change, which also covers pasting. A blocked
   character is not silently swallowed — it says why nothing appeared. */
function PhoneInput({ value, onChange, placeholder = 'e.g. 09171234567', disabled }: {
  value: string; onChange: (next: string) => void; placeholder?: string; disabled?: boolean;
}) {
  const [notice, setNotice] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const say = (message: string) => {
    setNotice(message);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setNotice(''), 4000);
  };

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <>
      <input
        className={`form-input${notice ? ' invalid' : ''}`}
        type="tel"
        inputMode="numeric"
        autoComplete="tel"
        maxLength={PHONE_LENGTH}
        disabled={disabled}
        placeholder={placeholder}
        value={value}
        aria-describedby={notice ? 'phone-notice' : undefined}
        onKeyDown={(e) => {
          if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && !/[0-9]/.test(e.key)) {
            e.preventDefault();
            say(e.key === ' '
              ? 'Please put a number here — spaces are not allowed in a mobile number.'
              : `"${e.key}" is not a number. Please put a number here — digits 0 to 9 only.`);
          }
        }}
        onChange={(e) => {
          const typed = e.target.value;
          const digits = typed.replace(/\D/g, '');
          if (digits !== typed) say('Please put a number here — letters and symbols are not allowed in a mobile number.');
          else if (digits.length > PHONE_LENGTH) say(`A mobile number is ${PHONE_LENGTH} digits long.`);
          else if (notice) { clearTimeout(timer.current); setNotice(''); }
          onChange(digits.slice(0, PHONE_LENGTH));
        }}
      />
      {notice && <span className="form-hint error" id="phone-notice" role="alert">{notice}</span>}
    </>
  );
}

/* The roster of people tending a stall. The list itself stays a compact table
   in the tenant form; entering or amending someone happens in a dialog over it,
   so the form underneath keeps its height no matter how many are registered.
   The dialog only stages into the draft — nothing reaches the record until the
   tenant form's own Save Changes is pressed. */
function StallkeeperEditor({ drafts, onChange }: { drafts: KeeperDraft[]; onChange: (next: KeeperDraft[]) => void }) {
  /* `row` is the roster line being worked on, or null for someone new. */
  const [dialog, setDialog] = useState<{ row: number | null } | null>(null);

  const roster = drafts.map(resolveKeeperDraft);
  const subject = dialog && dialog.row !== null ? roster[dialog.row] : undefined;

  const stage = (row: number | null, typed: { name: string; phone: string; relation: string; barangay: string }) => {
    onChange(row === null
      ? [...drafts, { ...blankKeeperDraft(), ...typed }]
      : drafts.map((d, i) => (i === row
          ? { ...d, name: typed.name || d.name, phone: typed.phone || d.phone, relation: typed.relation || d.relation, barangay: typed.barangay || d.barangay }
          : d)));
    setDialog(null);
  };

  /* Checks the staged roster before the dialog closes, so a clash is reported
     while the officer is still looking at the entry that caused it. */
  const validate = (row: number | null, typed: { name: string; phone: string; relation: string; barangay: string }) => {
    const next = row === null
      ? [...drafts, { ...blankKeeperDraft(), ...typed }]
      : drafts.map((d, i) => (i === row
          ? { ...d, name: typed.name || d.name, phone: typed.phone || d.phone, relation: typed.relation || d.relation, barangay: typed.barangay || d.barangay }
          : d));
    return keeperDraftsProblem(next);
  };

  return (
    <section className="form-section keeper-section">
      <header className="form-section-head">
        <div className="form-section-title">
          <h4>Stallkeeper Information</h4>
          <span className="form-section-note">
            The people actually tending the stall day to day.
            {roster.length > 0 ? ` ${roster.length} registered.` : ' None registered.'}
          </span>
        </div>
        <button type="button" className="btn-outline-sm" onClick={() => setDialog({ row: null })}>
          <span className="material-symbols-outlined">add</span>Add Stallkeeper
        </button>
      </header>

      {roster.length === 0 ? (
        <p className="keeper-empty">No stallkeeper is registered for this tenant.</p>
      ) : (
        <div className="keeper-table-wrap">
          <table className="keeper-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Relationship</th>
                <th>Contact Number</th>
                <th>Barangay</th>
                <th className="keeper-table-actions"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {roster.map((k, i) => (
                <tr key={drafts[i].key}>
                  <td><strong>{k.name}</strong></td>
                  <td>{k.relation || <span className="muted-cell">Not specified</span>}</td>
                  <td>{formatPhone(k.phone) || <span className="muted-cell">—</span>}</td>
                  <td>{k.barangay || <span className="muted-cell">—</span>}</td>
                  <td className="keeper-table-actions">
                    <div className="row-actions">
                      <button type="button" className="row-icon-btn edit" title={`Amend ${k.name}`} aria-label={`Amend ${k.name}`} onClick={() => setDialog({ row: i })}>
                        <span className="material-symbols-outlined">edit</span>
                      </button>
                      <button type="button" className="row-icon-btn danger" title={`Remove ${k.name}`} aria-label={`Remove ${k.name}`} onClick={() => onChange(drafts.filter((_, x) => x !== i))}>
                        <span className="material-symbols-outlined">delete</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {dialog && (
        <Modal
          stacked
          narrow
          title={subject ? 'Amend Stallkeeper' : 'Add Stallkeeper'}
          subtitle={subject
            ? `${subject.name} — complete only the particulars being changed.`
            : 'The name is required; the rest may be filed later.'}
          onClose={() => setDialog(null)}
        >
          <StallkeeperDialogForm
            subject={subject}
            onValidate={(typed) => validate(dialog.row, typed)}
            onConfirm={(typed) => stage(dialog.row, typed)}
            onCancel={() => setDialog(null)}
          />
        </Modal>
      )}
    </section>
  );
}

/* The dialog's own fields. Kept separate so it remounts blank each time it is
   opened, and so its draft never touches the roster until Confirm is pressed. */
function StallkeeperDialogForm({ subject, onValidate, onConfirm, onCancel }: {
  subject?: Stallkeeper;
  onValidate: (typed: { name: string; phone: string; relation: string; barangay: string }) => string;
  onConfirm: (typed: { name: string; phone: string; relation: string; barangay: string }) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [relation, setRelation] = useState('');
  const [barangay, setBarangay] = useState('');
  const [error, setError] = useState('');

  const typed = () => ({ name: name.trim(), phone: phone.trim(), relation, barangay: barangay.trim() });
  const touched = !!(name.trim() || phone.trim() || relation || barangay.trim());

  const confirm = () => {
    const entry = typed();
    if (!subject && !entry.name) { setError('Enter the stallkeeper’s name.'); return; }
    const problem = onValidate(entry);
    if (problem) { setError(problem); return; }
    onConfirm(entry);
  };

  const edit = <T,>(set: (v: T) => void) => (value: T) => { setError(''); set(value); };

  return (
    <div className="form-grid">
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Name{subject ? '' : ' *'}</label>
          <input
            className="form-input"
            autoFocus
            placeholder={subject ? keepHint(subject.name) : 'e.g. Juan dela Cruz'}
            value={name}
            onChange={(e) => edit(setName)(e.target.value)}
          />
        </div>
        <div className="form-group">
          <label className="form-label">Contact Number</label>
          <PhoneInput
            value={phone}
            placeholder={subject ? keepHint(formatPhone(subject.phone)) : 'e.g. 09171234567'}
            onChange={edit(setPhone)}
          />
        </div>
      </div>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Relationship to Tenant</label>
          <select className="form-select" value={relation} onChange={(e) => edit(setRelation)(e.target.value)}>
            <option value="">{subject ? `— Keep ${subject.relation || 'not specified'}` : '— Not specified'}</option>
            {[...new Set([...(subject?.relation ? [subject.relation] : []), ...KEEPER_RELATIONS])].map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Barangay</label>
          <input
            className="form-input"
            placeholder={subject ? keepHint(subject.barangay) : 'e.g. Barangay Poblacion'}
            value={barangay}
            onChange={(e) => edit(setBarangay)(e.target.value)}
          />
        </div>
      </div>

      {error && <div className="form-error"><span className="material-symbols-outlined">error</span>{error}</div>}

      <p className="dialog-note">
        <span className="material-symbols-outlined">info</span>
        This only adds the entry to the roster. The tenant record is written when you press <strong>Save Changes</strong> on the form.
      </p>

      <div className="modal-footer" style={{ padding: '4px 0 0', borderTop: 'none', justifyContent: 'flex-end' }}>
        <button type="button" className="btn-outline" onClick={onCancel}>Cancel</button>
        <button type="button" className="btn-primary" onClick={confirm} disabled={!!subject && !touched} title={subject && !touched ? 'Change a particular first' : undefined}>
          {subject ? 'Apply Amendment' : 'Add to List'}
        </button>
      </div>
    </div>
  );
}

/* Read-only list of a tenant's stallkeepers, used by the detail sheets. Each
   person is set off by a rule rather than a number, matching the editor. */
function StallkeeperRecord({ keepers, emptyText }: { keepers: Stallkeeper[]; emptyText: string }) {
  if (keepers.length === 0) return <RecordNote>{emptyText}</RecordNote>;
  return (<>
    {keepers.map((k, i) => (
      <div className={`record-grid${i > 0 ? ' record-grid-next' : ''}`} key={k.id}>
        <RecordRow label="Stallkeeper Name" value={k.name} />
        <RecordRow label="Relationship to Tenant" value={k.relation} />
        <RecordRow label="Contact Number" value={formatPhone(k.phone)} />
        <RecordRow label="Barangay" value={k.barangay} />
      </div>
    ))}
  </>);
}

/* ------------------------------------------------------------------
   Stacked bar graph — shared by the dashboard overview and the analytics
   report. Laid out with flexbox rather than SVG so a column stretches to
   whatever height the panel gives it, and the axis stays legible at any size.
   ------------------------------------------------------------------ */

type GraphSeries = { key: string; label: string; tone: string };
type GraphColumn = { label: string; caption?: string; values: Record<string, number> };

/* A round tick interval — 1, 2, 5 or 10 times a power of ten — so the scale
   reads in whole stalls or whole pesos rather than arbitrary fractions. */
function niceStep(peak: number, targetTicks = 4) {
  const rough = Math.max(peak, 1) / targetTicks;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rough)));
  const normalized = rough / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

function StackedBarGraph({ columns, series, format = (n: number) => String(Math.round(n)), emptyText }: {
  columns: GraphColumn[]; series: GraphSeries[]; format?: (n: number) => string; emptyText: string;
}) {
  const totals = columns.map((c) => series.reduce((sum, s) => sum + Math.max(0, c.values[s.key] || 0), 0));
  const peak = Math.max(0, ...totals);

  if (columns.length === 0 || peak <= 0) {
    return <div className="graph-empty"><span className="material-symbols-outlined">bar_chart</span>{emptyText}</div>;
  }

  const step = niceStep(peak);
  const ceiling = Math.max(step, Math.ceil(peak / step) * step);
  const ticks: number[] = [];
  for (let v = ceiling; v > -step / 2; v -= step) ticks.push(Math.max(0, v));

  return (
    <div className="graph">
      <div className="graph-body">
        <div className="graph-scale">
          {ticks.map((t, i) => <span key={i} style={{ top: `${(i / (ticks.length - 1)) * 100}%` }}>{format(t)}</span>)}
        </div>
        <div className="graph-plot">
          {ticks.map((_, i) => <div className="graph-gridline" key={i} style={{ top: `${(i / (ticks.length - 1)) * 100}%` }} />)}
          <div className="graph-columns">
            {columns.map((col, i) => (
              <div className="graph-column" key={i} title={`${col.label}\n${series.map((s) => `${s.label}: ${format(col.values[s.key] || 0)}`).join('\n')}`}>
                <div className="graph-bar" style={{ height: `${(totals[i] / ceiling) * 100}%` }}>
                  <span className="graph-total">{format(totals[i])}</span>
                  <div className="graph-stack">
                    {series.map((s) => {
                      const value = Math.max(0, col.values[s.key] || 0);
                      if (value <= 0) return null;
                      return <div className={`graph-segment ${s.tone}`} key={s.key} style={{ height: `${(value / totals[i]) * 100}%` }} />;
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="graph-footer">
        <div className="graph-axis">
          {columns.map((col, i) => (
            <div className="graph-axis-label" key={i}>
              <span>{col.label}</span>
              {col.caption && <small>{col.caption}</small>}
            </div>
          ))}
        </div>
      </div>
      <div className="graph-legend">
        {series.map((s) => <span className="graph-key" key={s.key}><i className={s.tone} />{s.label}</span>)}
      </div>
    </div>
  );
}

/* `compact` drops the numbered buttons for a plain "Page 3 of 40" between
   Previous and Next — a register that grows without limit, like the logbook,
   would otherwise put a growing row of page numbers under every screen. */
function PaginationBar({ info, page, totalPages, onPage, compact }: { info: string; page: number; totalPages: number; onPage: (p: number) => void; compact?: boolean }) {
  const pages: (number | 'dots')[] = [];
  if (!compact) {
    for (let i = 1; i <= totalPages; i++) {
      if (i <= 3 || i > totalPages - 1 || Math.abs(i - page) <= 1) pages.push(i);
      else if (pages[pages.length - 1] !== 'dots') pages.push('dots');
    }
  }
  return (
    <div className="pagination">
      <span className="pagination-info">{info}</span>
      <button className="page-btn page-btn-nav" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button>
      {compact
        ? <span className="page-position">Page {page} of {totalPages}</span>
        : pages.map((p, i) => p === 'dots' ? <span className="page-dots" key={`d${i}`}>…</span> : <button key={p} className={`page-btn${p === page ? ' active' : ''}`} onClick={() => onPage(p)}>{p}</button>)}
      <button className="page-btn page-btn-nav" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>Next</button>
    </div>
  );
}

/* The printed register. Deliberately plain — a column of running numbers, the
   same headings as the screen, and a footer that says how many records were on
   the sheet so a printout can be checked against the system later. */
function RegisterSheet({ job }: { job: RegisterJob }) {
  return (
    <div className="register-sheet">
      <div className="register-head">
        <img className="register-seal" src="./logo.jpg" alt="" />
        <div className="register-headings">
          <div className="register-title">2026 Status of Market Occupancy</div>
          <div className="register-org">Tanauan, Leyte · Market Office</div>
        </div>
        <div className="register-meta">
          <div className="register-scope">{job.title}</div>
          <div>{job.subtitle}</div>
          <div>Printed {job.printedAt}</div>
        </div>
      </div>
      <table className="register-table">
        <thead>
          <tr><th className="num">No.</th>{job.columns.map((c) => <th key={c}>{c}</th>)}</tr>
        </thead>
        <tbody>
          {job.rows.map((row, i) => (
            <tr key={i}><td className="num">{i + 1}</td>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>
          ))}
        </tbody>
      </table>
      <div className="register-foot">
        <span>{job.rows.length} record{job.rows.length === 1 ? '' : 's'}</span>
        <span>Checked by ______________________</span>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    'Occupied': 'badge badge-occupied', 'Available': 'badge badge-available', 'Maintenance': 'badge badge-maintenance',
    'Temporarily Closed': 'badge badge-closed', 'Closed': 'badge badge-shut', 'Abandoned': 'badge badge-abandoned',
    'Pending Review': 'badge badge-pending', 'Incomplete': 'badge badge-incomplete', 'Approved': 'badge badge-approved', 'Rejected': 'badge badge-rejected',
    'No BP': 'badge badge-nobp',
    'Active': 'badge badge-active', 'Expiring Soon': 'badge badge-expiring', 'Open': 'badge badge-open', 'Resolved': 'badge badge-resolved',
  };
  return <span className={map[status] || 'badge'}>{status}</span>;
}

/* The business-permit column of the occupancy sheet. A blank cell there is
   'Not Recorded' — which is not the same as knowing the stall has no permit. */
function PermitBadge({ permit }: { permit: PermitStatus }) {
  const map: Record<PermitStatus, string> = {
    'With BP': 'badge badge-active', 'No BP': 'badge badge-open', 'Not Recorded': 'badge',
  };
  return <span className={map[permit]}>{permit === 'Not Recorded' ? '—' : permit}</span>;
}

function BillStatusBadge({ bill }: { bill: UtilityBill }) {
  if (isOverdue(bill)) return <span className="badge badge-overdue">Overdue</span>;
  return <span className={`badge ${bill.status === 'Paid' ? 'badge-paid' : 'badge-unpaid'}`}>{bill.status}</span>;
}

function BillHistory({ bills, emptyText }: { bills: UtilityBill[]; emptyText: string }) {
  const sorted = [...bills].sort((a, b) => b.period.localeCompare(a.period) || b.id.localeCompare(a.id));
  const outstanding = sorted.filter((b) => b.status === 'Unpaid').reduce((s, b) => s + b.amount, 0);
  return (
    <div className="bill-history">
      <div className="bill-history-head">
        <h4>Utility Billing Records</h4>
        <span className={outstanding > 0 ? 'outstanding' : ''}>{outstanding > 0 ? `${money(outstanding)} outstanding` : 'No outstanding balance'}</span>
      </div>
      {sorted.length === 0 && <p className="bill-history-empty">{emptyText}</p>}
      {sorted.length > 0 && (
        <table className="mini-table">
          <thead><tr><th>Bill</th><th>Utility</th><th>Period</th><th>Usage</th><th>Amount</th><th>Status</th></tr></thead>
          <tbody>
            {sorted.slice(0, 8).map((b) => (
              <tr key={b.id}>
                <td>{b.id}</td>
                <td><span className={`utility-tag ${b.type.toLowerCase()}`}><span className="material-symbols-outlined">{UTILITY_PRESETS[b.type].icon}</span>{b.type}</span></td>
                <td>{billPeriodText(b)}</td>
                <td>{b.consumption.toLocaleString()} {UTILITY_PRESETS[b.type].unit}</td>
                <td><strong>{money(b.amount)}</strong></td>
                <td><BillStatusBadge bill={b} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function ViolationDetailView({ violation, onEdit, onClose }: { violation: Violation; onEdit: () => void; onClose: () => void }) {
  return (<>
    <RecordSheet
      title={violation.issue}
      subtitle={`Citation ${violation.id} \u00b7 Issued to ${violation.tenant || 'unnamed party'}`}
      badge={<StatusBadge status={violation.status} />}
    >
      <RecordSection title="Citation Particulars" icon="gavel">
        <div className="record-grid">
          <RecordRow label="Party Cited" value={violation.tenant} />
          <RecordRow label="Offence" value={violation.issue} />
          <RecordRow label="Date Recorded" value={violation.dateRecorded ? formatIsoDate(violation.dateRecorded) : ''} />
          <RecordRow label="Date Resolved" value={violation.dateResolved ? formatIsoDate(violation.dateResolved) : ''} />
        </div>
        <RecordTotal label="Demerit Points" value={String(violation.points)} />
      </RecordSection>

      <RecordSection title="Officer's Notes" icon="sticky_note_2">
        {violation.notes ? <RecordNote>{violation.notes}</RecordNote> : <RecordNote>No notes were recorded for this citation.</RecordNote>}
      </RecordSection>
    </RecordSheet>

    <div className="modal-footer" style={{ padding: '16px 0 0', borderTop: 'none', justifyContent: 'flex-end' }}>
      <button className="btn-outline" onClick={onClose}>Close</button>
      <button className="btn-primary" onClick={onEdit}><span className="material-symbols-outlined">edit</span>Edit Citation</button>
    </div>
  </>);
}

function BillDetailView({ bill, onToggleStatus, onPrint, onClose }: { bill: UtilityBill; onToggleStatus: (id: string) => void; onPrint: (b: UtilityBill) => void; onClose: () => void }) {
  const preset = UTILITY_PRESETS[bill.type];
  return (<>
    <RecordSheet
      title={`${bill.type} Bill \u2014 Stall ${bill.stallId}`}
      subtitle={`Bill ${bill.id} \u00b7 ${billPeriodText(bill)}`}
      badge={<BillStatusBadge bill={bill} />}
    >
      <RecordSection title="Billing Particulars" icon="receipt_long">
        <div className="record-grid">
          <RecordRow label="Stall Number" value={bill.stallId} />
          <RecordRow label="Tenant" value={bill.tenantName || 'Unassigned (charged to stall)'} />
          <RecordRow label="Market Section" value={bill.section} />
          <RecordRow label={`${bill.type} Meter No.`} value={bill.meterNumber} />
          <RecordRow label="Period Covered" value={`${billPeriodText(bill)} (${periodDays(bill.periodStart, bill.periodEnd)} days)`} />
          <RecordRow label="Date Issued" value={formatIsoDate(bill.dateIssued)} />
          <RecordRow label="Due Date" value={formatIsoDate(bill.dueDate)} />
        </div>
      </RecordSection>

      <RecordSection title="Meter Readings" icon="speed">
        <div className="record-grid">
          <RecordRow label="Previous Reading" value={`${bill.previousReading.toLocaleString()} ${preset.unit}`} />
          <RecordRow label="Current Reading" value={`${bill.currentReading.toLocaleString()} ${preset.unit}`} />
          <RecordRow label="Consumption" value={`${bill.consumption.toLocaleString()} ${preset.unit}`} />
          <RecordRow label="Rate" value={`${money(bill.rate)} / ${preset.unit}`} />
        </div>
      </RecordSection>

      <RecordSection title="Charges" icon="payments">
        <div className="record-grid">
          <RecordRow label="Rate" value={`${money(bill.rate)} / ${preset.unit}`} />
          <RecordRow label="Usage Charge" value={money(bill.amount)} />
        </div>
        {isOverdue(bill) && (
          <>
            <RecordRow label={`Late Surcharge (${SURCHARGE_RATES[bill.type]}%)`} value={`+${money(surchargeAmount(bill))}`} />
            <RecordNote>Past due since {formatIsoDate(bill.dueDate)} — a receipt printed now carries the surcharge automatically. This does not change the amount on record; it applies only to what actually prints.</RecordNote>
          </>
        )}
        <RecordTotal label={isOverdue(bill) ? 'Total if Printed Today' : 'Total Amount Due'} value={money(isOverdue(bill) ? amountWithSurcharge(bill) : bill.amount)} />
      </RecordSection>

      {bill.notes && <RecordSection title="Notes" icon="sticky_note_2"><RecordNote>{bill.notes}</RecordNote></RecordSection>}
    </RecordSheet>

    <div className="modal-footer" style={{ padding: '16px 0 0', borderTop: 'none', justifyContent: 'flex-end' }}>
      <button className="btn-outline" onClick={onClose}>Close</button>
      <button className="btn-outline" onClick={() => onPrint(bill)}><span className="material-symbols-outlined">print</span>Print Receipt</button>
      <button className="btn-primary" onClick={() => { onToggleStatus(bill.id); onClose(); }}>{bill.status === 'Paid' ? 'Mark as Unpaid' : 'Mark as Paid'}</button>
    </div>
  </>);
}


function TenantStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    'Active': 'badge badge-active', 'Expiring Soon': 'badge badge-expiring',
  };
  return <span className={map[status] || 'badge'}>{status}</span>;
}

/* The market office clock. It ticks every second, which is also what keeps the
   register honest: rent falling due is a string comparison against today's
   date, and re-rendering each second means a row turns red the moment midnight
   passes in Tanauan, on a machine nobody has touched since yesterday. */
function MarketClock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const tick = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(tick);
  }, []);

  return (
    <div className="market-clock" title={`Philippine Standard Time (${MARKET_TIME_ZONE})`}>
      <span className="material-symbols-outlined" aria-hidden="true">schedule</span>
      <span className="market-clock-text">
        <span className="market-clock-time">{clockTimeFmt.format(now)}<abbr>PHT</abbr></span>
        <span className="market-clock-date">{clockDateFmt.format(now)}</span>
      </span>
    </div>
  );
}

function RentStatusBadge({ status }: { status: RentStatus }) {
  const cls = status === 'Paid' ? 'badge-paid' : status === 'Overdue' ? 'badge-overdue' : 'badge-unpaid';
  return <span className={`badge ${cls}`}>{status}</span>;
}

/* Days 1–28 only: a due day past the 28th would have to slip in February. */
function RentDueDaySelect({ value, keepLabel, onChange }: { value: string; keepLabel?: string; onChange: (v: string) => void }) {
  return (
    <select className="form-select" value={value} onChange={(e) => onChange(e.target.value)}>
      {keepLabel && <option value="">{keepLabel}</option>}
      {Array.from({ length: MAX_RENT_DUE_DAY }, (_, i) => i + 1).map((d) => (
        <option key={d} value={d}>Day {d} of the month</option>
      ))}
    </select>
  );
}

/* The months this tenant has settled, newest first. */
function RentLedger({ tenant }: { tenant: Tenant }) {
  const payments = rentPaymentHistory(tenant);
  const total = rentTotalPaid(tenant);
  return (
    <div className="bill-history">
      <div className="bill-history-head">
        <h4>Rent Payment Records</h4>
        <span className={payments.length === 0 ? 'outstanding' : ''}>{payments.length === 0 ? 'No rent recorded as paid' : `${money(total)} collected over ${payments.length} month${payments.length === 1 ? '' : 's'}`}</span>
      </div>
      {payments.length === 0 ? (
        <p className="bill-history-empty">No month has been marked paid for {tenant.name} yet.</p>
      ) : (
        <table className="mini-table">
          <thead><tr><th>Month</th><th>Date Paid</th><th>Discount</th><th>Collected</th><th>Status</th></tr></thead>
          <tbody>
            {payments.slice(0, 12).map((p) => (
              <tr key={p.period}>
                <td>{formatPeriod(p.period)}</td>
                <td>{p.paidOn ? formatIsoDate(p.paidOn) : '—'}</td>
                <td>{p.discount > 0
                  ? <span className="rent-discount-tag" title={`${EARLY_RENT_DISCOUNT_PCT}% off for paying on or before the due date`}>−{money(p.discount)}</span>
                  : <span className="muted">—</span>}
                </td>
                <td><strong>{money(p.amount)}</strong></td>
                <td><RentStatusBadge status="Paid" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}


/* ============================================================
   Officers — the market office board
   ============================================================ */

/* How an officer reads anywhere they are named as somebody else's superior
   or in an export. A vacant seat is named by its post, because the post is
   what exists even when nobody holds it. */
function officerLabel(officer?: Officer) {
  if (!officer) return '—';
  return officer.name ? `${officer.name} — ${officer.position}` : `${officer.position} (vacant)`;
}

/* Every seat that reports to `parentId`, in the order the board holds them.
   '' asks for the seats at the head of the board. */
function reportsOf(officers: Officer[], parentId: string) {
  return officers.filter((o) => o.reportsTo === parentId);
}

/* Everyone under an officer, however far down. Used to stop a seat being
   moved beneath one of its own reports, which would close a loop in the
   board. `linkOfficers` would break such a loop on the next load, but by then
   the office has already lost the arrangement it meant to save. */
function descendantsOf(officers: Officer[], id: string): Set<string> {
  const out = new Set<string>();
  const walk = (parentId: string) => {
    for (const child of reportsOf(officers, parentId)) {
      if (out.has(child.id)) continue;
      out.add(child.id);
      walk(child.id);
    }
  };
  walk(id);
  return out;
}

/* How deep a seat sits, so the "Reports To" picker can indent the board
   instead of offering a flat list of every post in the office. */
function officerDepth(officers: Officer[], officer: Officer) {
  let depth = 0;
  let cursor = officer;
  const seen = new Set<string>([officer.id]);
  while (cursor.reportsTo) {
    const parent = officers.find((o) => o.id === cursor.reportsTo);
    if (!parent || seen.has(parent.id)) break;
    seen.add(parent.id);
    cursor = parent;
    depth += 1;
  }
  return depth;
}

/* The board flattened top-down, so a printed list reads in the same order the
   chart does rather than in whatever order the seats happened to be added. */
function officersInBoardOrder(officers: Officer[]): Officer[] {
  const out: Officer[] = [];
  const placed = new Set<string>();
  const walk = (parentId: string) => {
    for (const officer of reportsOf(officers, parentId)) {
      if (placed.has(officer.id)) continue;
      placed.add(officer.id);
      out.push(officer);
      walk(officer.id);
    }
  };
  walk('');
  // Anything the walk could not reach still belongs on the list.
  for (const officer of officers) if (!placed.has(officer.id)) out.push(officer);
  return out;
}

function OfficersPage({ officers, search, onAdd, onView, onEdit, onDelete, onPrintList, onExport }: {
  officers: Officer[]; search: string;
  onAdd: () => void; onView: (o: Officer) => void; onEdit: (o: Officer) => void; onDelete: (o: Officer) => void;
  onPrintList: (title: string, subtitle: string, columns: string[], rows: string[][]) => void;
  onExport: () => void;
}) {
  const [view, setView] = useState<'board' | 'directory'>('board');
  const [officeFilter, setOfficeFilter] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => { setPage(1); }, [search, officeFilter]);
  /* A search is a search of the whole office, so it opens the directory — the
     chart cannot show a match without also showing the seats above it. */
  useEffect(() => { if (search) setView('directory'); }, [search]);

  const filled = officers.filter((o) => o.name && o.status !== 'Vacant');
  const vacant = officers.filter((o) => !o.name || o.status === 'Vacant');
  const onLeave = officers.filter((o) => o.status === 'On Leave');
  const offices = useMemo(() => Array.from(new Set(officers.map((o) => o.office).filter(Boolean))).sort(), [officers]);

  const ordered = useMemo(() => officersInBoardOrder(officers), [officers]);

  const filtered = useMemo(() => ordered.filter((o) => {
    if (officeFilter && o.office !== officeFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!o.name.toLowerCase().includes(q) && !o.position.toLowerCase().includes(q) && !o.office.toLowerCase().includes(q) && !o.id.toLowerCase().includes(q)) return false;
    }
    return true;
  }), [ordered, officeFilter, search]);

  const paged = paginate(filtered, page);

  const printList = () => onPrintList(
    officeFilter || 'Market Office Board',
    `Organizational board${search ? ` · matching “${search}”` : ''} · ${filled.length} of ${officers.length} seat${officers.length === 1 ? '' : 's'} filled`,
    ['Officer ID', 'Position', 'Name', 'Office', 'Reports To', 'Status', 'Contact'],
    filtered.map((o) => [o.id, o.position, o.name || 'Vacant', o.office || '—', officerLabel(officers.find((x) => x.id === o.reportsTo)), o.status, formatPhone(o.phone) || '—']),
  );

  return (
    <>
      <div className="page-header">
        <div><h2 className="page-title">Market Office</h2><p className="page-subtitle">Who holds which post, who reports to whom, and which seats are still to be filled.</p></div>
        <div className="page-actions">
          <button className="btn-outline" onClick={onExport}><span className="material-symbols-outlined">download</span>Export CSV</button>
          <button className="btn-outline" disabled={filtered.length === 0} title={filtered.length === 0 ? 'No seats match the current filters' : undefined} onClick={printList}><span className="material-symbols-outlined">print</span>Print Board</button>
          <button className="btn-primary" onClick={onAdd}><span className="material-symbols-outlined">add</span>Add Officer</button>
        </div>
      </div>

      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-header"><span className="stat-label">Seats on the Board</span><span className="material-symbols-outlined stat-icon primary">account_tree</span></div>
          <div className="stat-value">{officers.length}</div>
          <div className="stat-caption">{filled.length} filled, {vacant.length} vacant</div>
        </div>
        <div className="stat-card">
          <div className="stat-header"><span className="stat-label">Officers in Post</span></div>
          <div className="stat-value">{filled.length}</div>
          <div className="stat-caption">{percent(ratio(filled.length, officers.length))} of the board</div>
        </div>
        <div className="stat-card">
          <div className="stat-header"><span className="stat-label">On Leave</span></div>
          <div className="stat-value">{onLeave.length}</div>
          <div className="stat-caption">{onLeave.length === 0 ? 'Everyone in post is at work' : onLeave.map((o) => o.position).join(', ')}</div>
        </div>
        <div className="stat-card">
          <div className="stat-header"><span className="stat-label">Vacant Seats</span></div>
          <div className={`stat-value${vacant.length > 0 ? ' danger' : ''}`}>{vacant.length}</div>
          <div className="stat-caption">{vacant.length === 0 ? 'Every post is held' : 'Awaiting appointment'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-header"><span className="stat-label">Offices Represented</span><span className="material-symbols-outlined stat-icon primary">corporate_fare</span></div>
          <div className="stat-value">{offices.length}</div>
          <div className="stat-caption">{offices.length === 0 ? 'No office recorded on any seat' : offices.slice(0, 2).join(', ')}{offices.length > 2 ? ` +${offices.length - 2} more` : ''}</div>
        </div>
      </div>

      <div className="panel">
        <div className="filter-row">
          <div className="view-toggle" role="tablist" aria-label="How to show the board">
            <button type="button" role="tab" aria-selected={view === 'board'} className={`view-toggle-btn${view === 'board' ? ' active' : ''}`} onClick={() => setView('board')}>
              <span className="material-symbols-outlined">account_tree</span>Organizational Board
            </button>
            <button type="button" role="tab" aria-selected={view === 'directory'} className={`view-toggle-btn${view === 'directory' ? ' active' : ''}`} onClick={() => setView('directory')}>
              <span className="material-symbols-outlined">grid_view</span>Directory
            </button>
          </div>
          {view === 'directory' && (
            <>
              <select className="filter-select" value={officeFilter} onChange={(e) => setOfficeFilter(e.target.value)}>
                <option value="">All Offices</option>
                {offices.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
              <span className="table-info">Showing {paged.start}-{paged.end} of {paged.total}</span>
            </>
          )}
        </div>

        {view === 'board' ? (
          <OrgBoard officers={officers} onView={onView} onEdit={onEdit} />
        ) : (
          <>
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>Officer</th><th>Office</th><th>Reports To</th><th>Contact</th><th>Appointed</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>
                  {paged.items.map((o, i) => (
                    <tr key={o.id}>
                      <td>
                        <div className="applicant-cell">
                          <div className={`avatar-initials ${o.name ? getAvatarColor(i) : 'vacant'}`}>{o.name ? getInitials(o.name) : '—'}</div>
                          <div className="applicant-info">
                            <div className="name">{o.name || <span className="seat-vacant">Vacant seat</span>}</div>
                            <div className="phone">{o.position}</div>
                          </div>
                        </div>
                      </td>
                      <td>{o.office || '—'}</td>
                      <td>{o.reportsTo ? officerLabel(officers.find((x) => x.id === o.reportsTo)) : <span className="seat-vacant">Head of the board</span>}</td>
                      <td className="no-wrap">{formatPhone(o.phone) || '—'}</td>
                      <td className="no-wrap">{o.appointed ? formatIsoDate(o.appointed) : '—'}</td>
                      <td><OfficerStatusBadge officer={o} /></td>
                      <td>
                        <div className="row-actions">
                          <button type="button" className="row-icon-btn" title="View officer" aria-label="View officer" onClick={() => onView(o)}><span className="material-symbols-outlined">visibility</span></button>
                          <button type="button" className="row-icon-btn edit" title="Edit officer" aria-label="Edit officer" onClick={() => onEdit(o)}><span className="material-symbols-outlined">edit</span></button>
                          <button type="button" className="row-icon-btn danger" title="Remove from board" aria-label="Remove from board" onClick={() => onDelete(o)}><span className="material-symbols-outlined">delete</span></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {paged.items.length === 0 && <tr><td colSpan={7}><div className="empty-state"><span className="material-symbols-outlined">person_search</span>No seats match the current filters.</div></td></tr>}
                </tbody>
              </table>
            </div>
            <PaginationBar info={`Showing ${paged.start}-${paged.end} of ${paged.total}`} page={paged.page} totalPages={paged.totalPages} onPage={setPage} />
          </>
        )}
      </div>
    </>
  );
}

function OfficerStatusBadge({ officer }: { officer: Officer }) {
  if (!officer.name || officer.status === 'Vacant') return <span className="badge badge-abandoned">Vacant</span>;
  if (officer.status === 'On Leave') return <span className="badge badge-expiring">On Leave</span>;
  return <span className="badge badge-active">Active</span>;
}

/* The chart itself. Drawn from `reportsTo` rather than from any fixed idea of
   what a market office looks like, so an office running three collectors
   under one supervisor gets three boxes under one box. */
function OrgBoard({ officers, onView, onEdit }: { officers: Officer[]; onView: (o: Officer) => void; onEdit: (o: Officer) => void }) {
  const heads = reportsOf(officers, '');

  if (officers.length === 0) {
    return <div className="empty-state"><span className="material-symbols-outlined">account_tree</span>No seats on the board yet. Add the first one to start the chart.</div>;
  }

  return (
    <div className="org-board">
      <div className="org-board-scroll">
        <ul className="org-level org-level-root">
          {heads.map((officer) => (
            <OrgNode key={officer.id} officer={officer} officers={officers} onView={onView} onEdit={onEdit} seen={new Set()} />
          ))}
        </ul>
      </div>
    </div>
  );
}

/* One box and everything under it. `seen` is carried down the recursion so a
   board that somehow still holds a loop draws each seat once and stops,
   rather than recursing until the tab dies. */
function OrgNode({ officer, officers, onView, onEdit, seen }: { officer: Officer; officers: Officer[]; onView: (o: Officer) => void; onEdit: (o: Officer) => void; seen: Set<string> }) {
  if (seen.has(officer.id)) return null;
  const below = new Set(seen);
  below.add(officer.id);
  const reports = reportsOf(officers, officer.id).filter((o) => !below.has(o.id));
  const vacant = !officer.name || officer.status === 'Vacant';

  return (
    <li className="org-node">
      <div className={`org-card${vacant ? ' vacant' : ''}`}>
        <button type="button" className="org-card-main" onClick={() => onView(officer)} title={`View ${officer.position}`}>
          <span className={`avatar-initials ${vacant ? 'vacant' : getAvatarColor(officer.position.length)}`}>{vacant ? '—' : getInitials(officer.name)}</span>
          <span className="org-card-text">
            <span className="org-card-name">{officer.name || 'Vacant seat'}</span>
            <span className="org-card-position">{officer.position}</span>
            {officer.office && <span className="org-card-office">{officer.office}</span>}
          </span>
        </button>
        <div className="org-card-foot">
          {officer.status === 'On Leave' && <span className="org-card-tag leave">On leave</span>}
          <button type="button" className="row-icon-btn edit org-card-edit" title={`Edit ${officer.position}`} aria-label={`Edit ${officer.position}`} onClick={() => onEdit(officer)}>
            <span className="material-symbols-outlined">edit</span>
          </button>
        </div>
      </div>
      {reports.length > 0 && (
        <ul className="org-level">
          {reports.map((child) => (
            <OrgNode key={child.id} officer={child} officers={officers} onView={onView} onEdit={onEdit} seen={below} />
          ))}
        </ul>
      )}
    </li>
  );
}

function OfficerDetailView({ officer, officers, onEdit, onClose }: { officer: Officer; officers: Officer[]; onEdit: () => void; onClose: () => void }) {
  const superior = officers.find((o) => o.id === officer.reportsTo);
  const reports = reportsOf(officers, officer.id);

  return (<>
    <RecordSheet
      title={officer.name || 'Vacant seat'}
      subtitle={`${officer.position}${officer.office ? ` · ${officer.office}` : ''} · ${officer.id}`}
      badge={<OfficerStatusBadge officer={officer} />}
    >
      <RecordSection title="The Seat" icon="badge">
        <div className="record-grid">
          <RecordRow label="Position" value={officer.position} />
          <RecordRow label="Office" value={officer.office} />
          <RecordRow label="Held By" value={officer.name} />
          <RecordRow label="Appointed" value={officer.appointed ? formatIsoDate(officer.appointed) : ''} />
        </div>
      </RecordSection>

      <RecordSection title="Contact" icon="phone">
        <div className="record-grid">
          <RecordRow label="Mobile Number" value={formatPhone(officer.phone)} />
          <RecordRow label="Email" value={officer.email} />
        </div>
      </RecordSection>

      <RecordSection title="Place on the Board" icon="account_tree">
        <div className="record-grid">
          <RecordRow label="Reports To" value={superior ? officerLabel(superior) : ''} />
          <RecordRow label="Seats Reporting In" value={reports.length > 0 ? String(reports.length) : ''} />
        </div>
        {reports.length > 0 && (
          <ul className="record-list">
            {reports.map((r) => <li key={r.id}>{officerLabel(r)}</li>)}
          </ul>
        )}
      </RecordSection>

    </RecordSheet>

    <div className="modal-footer" style={{ padding: '16px 0 0', borderTop: 'none', justifyContent: 'flex-end' }}>
      <button className="btn-outline" onClick={onClose}>Close</button>
      <button className="btn-primary" onClick={onEdit}><span className="material-symbols-outlined">edit</span>Edit Officer</button>
    </div>
  </>);
}

/* Add and edit are one form. Unlike the tenant and applicant editors this one
   opens on the values already filed rather than blank: a seat has only a
   handful of fields, and an officer correcting a spelling should not have to
   retype the rest of the post. */
function OfficerForm({ officers, officer, onSubmit, onCancel }: { officers: Officer[]; officer?: Officer; onSubmit: (o: Officer) => void; onCancel: () => void }) {
  const editing = Boolean(officer);
  const [name, setName] = useState(officer?.name ?? '');
  const [position, setPosition] = useState(officer?.position ?? '');
  const [office, setOffice] = useState(officer?.office ?? OFFICE_UNITS[1]);
  const [reportsTo, setReportsTo] = useState(officer?.reportsTo ?? '');
  const [phone, setPhone] = useState(officer?.phone ?? '');
  const [email, setEmail] = useState(officer?.email ?? '');
  const [status, setStatus] = useState<OfficerStatus>(officer?.status ?? 'Active');
  const [appointed, setAppointed] = useState(officer?.appointed ?? '');
  const [error, setError] = useState('');

  /* Vacancy is a property of the seat, not a state the holder is in: naming
     somebody fills the seat, clearing the name empties it again. A seat that
     was vacant opens on Active the moment a name is typed into it. */
  const held = Boolean(name.trim());
  const heldStatus: OfficerStatus = status === 'Vacant' ? 'Active' : status;

  /* A seat cannot be moved under itself or under one of its own reports —
     that closes a loop and the board stops being a tree. */
  const forbidden = useMemo(() => {
    if (!officer) return new Set<string>();
    const set = descendantsOf(officers, officer.id);
    set.add(officer.id);
    return set;
  }, [officers, officer]);

  const superiors = officersInBoardOrder(officers).filter((o) => !forbidden.has(o.id));

  const submit = () => {
    const trimmedPosition = position.trim();
    if (!trimmedPosition) { setError('Enter the position — a seat on the board is a post, even before anybody holds it.'); return; }
    const phoneError = phoneProblem(phone);
    if (phoneError) { setError(phoneError); return; }
    const trimmedEmail = email.trim();
    if (trimmedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) { setError('Enter a valid email address, or leave it blank.'); return; }
    const trimmedName = name.trim();

    onSubmit({
      id: officer?.id ?? nextId('OFC', officers.map((o) => o.id)),
      name: trimmedName,
      position: trimmedPosition,
      office: office.trim(),
      reportsTo,
      phone: phone.trim(),
      email: trimmedEmail,
      /* A seat with nobody in it is vacant whatever the picker says. */
      status: trimmedName ? heldStatus : 'Vacant',
      appointed,
    });
  };

  return (
    <>
      <div className="form-grid">
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Position *</label>
            <input className="form-input" autoFocus value={position} placeholder="e.g. Market Supervisor" onChange={(e) => { setPosition(e.target.value); setError(''); }} />
            <span className="form-hint">The post itself. It stays on the board when the person holding it changes.</span>
          </div>
          <div className="form-group">
            <label className="form-label">Office</label>
            <input className="form-input" list="office-units" value={office} placeholder="e.g. Market Office" onChange={(e) => setOffice(e.target.value)} />
            <datalist id="office-units">{OFFICE_UNITS.map((u) => <option key={u} value={u} />)}</datalist>
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Held By</label>
            <input className="form-input" value={name} placeholder="e.g. Luz M. Maderazo" onChange={(e) => { setName(e.target.value); setError(''); }} />
            <span className="form-hint">Leave blank if the post is vacant.</span>
          </div>
          <div className="form-group">
            <label className="form-label">Status</label>
            <select className="form-select" value={held ? heldStatus : 'Vacant'} disabled={!held} onChange={(e) => setStatus(e.target.value as OfficerStatus)}>
              {held
                ? OFFICER_STATUSES.filter((st) => st !== 'Vacant').map((st) => <option key={st} value={st}>{st}</option>)
                : <option value="Vacant">Vacant</option>}
            </select>
            <span className="form-hint">{held ? 'On Leave keeps the seat on the board while its holder is away.' : 'A seat with nobody in it is vacant.'}</span>
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Reports To</label>
            <select className="form-select" value={reportsTo} onChange={(e) => setReportsTo(e.target.value)}>
              <option value="">— Head of the board —</option>
              {superiors.map((o) => <option key={o.id} value={o.id}>{' '.repeat(officerDepth(officers, o) * 3)}{officerLabel(o)}</option>)}
            </select>
            <span className="form-hint">{editing && forbidden.size > 1 ? 'This seat and the seats under it are not offered — a seat cannot report to itself.' : 'Where this seat sits on the chart.'}</span>
          </div>
          <div className="form-group">
            <label className="form-label">Date Appointed</label>
            <input className="form-input" type="date" value={appointed} max={todayIso()} onChange={(e) => setAppointed(e.target.value)} />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Mobile Number</label>
            <PhoneInput value={phone} onChange={(v) => { setPhone(v); setError(''); }} />
          </div>
          <div className="form-group">
            <label className="form-label">Email</label>
            <input className="form-input" type="email" value={email} placeholder="e.g. marketoffice@tanauan.gov.ph" onChange={(e) => { setEmail(e.target.value); setError(''); }} />
          </div>
        </div>

        {error && <div className="form-error"><span className="material-symbols-outlined">error</span>{error}</div>}
      </div>

      <div className="modal-footer">
        <button className="btn-outline" onClick={onCancel}>Cancel</button>
        <button className="btn-primary" onClick={submit}><span className="material-symbols-outlined">save</span>{editing ? 'Save Changes' : 'Add Officer'}</button>
      </div>
    </>
  );
}

/* ============================================================
   Printing — billing receipts, four to an A4 sheet
   ============================================================ */

/* Four receipts fill a sheet. The last sheet is padded with blank quarters so
   its rules still line up when it is cut. */
function chunkIntoSheets(receipts: PrintReceipt[]): PrintReceipt[][] {
  const sheets: PrintReceipt[][] = [];
  for (let i = 0; i < receipts.length; i += RECEIPTS_PER_SHEET) {
    sheets.push(receipts.slice(i, i + RECEIPTS_PER_SHEET));
  }
  return sheets.length > 0 ? sheets : [[]];
}

/* ---------- Numbering a sheet's bills ----------

   A receipt handed to a tenant is the office's word that the charge exists, so
   printing one puts the bill on record rather than leaving a numbered slip of
   paper with nothing behind it.

   Which bills that means, in the order they first appear on the sheet. The
   same bill printed in four copies is one entry, so it is numbered once and
   every copy carries that one number; four different bills are four entries.
   Bills already on record are left alone — reprinting never re-files them. */
function unsavedBills(bills: UtilityBill[]): UtilityBill[] {
  const seen = new Set<UtilityBill>();
  const pending: UtilityBill[] = [];
  for (const bill of bills) {
    if (bill.id || seen.has(bill)) continue;
    seen.add(bill);
    pending.push(bill);
  }
  return pending;
}

/* Pairs each unsaved bill with the copy of it that carries its new number.
   The preview and the print run this over the same bills, so the number the
   officer is shown is the number that ends up on the record. */
function numberBills(bills: UtilityBill[], ids: string[]): Map<UtilityBill, UtilityBill> {
  const numbered = new Map<UtilityBill, UtilityBill>();
  unsavedBills(bills).forEach((bill, i) => {
    if (ids[i]) numbered.set(bill, { ...bill, id: ids[i] });
  });
  return numbered;
}

/* A bill the office already has for that stall, utility and month. Saving asks
   before adding a second one; printing cannot ask, so the preview says so. */
function billsClashing(pending: UtilityBill[], onRecord: UtilityBill[]): UtilityBill[] {
  return pending.filter((p) => onRecord.some((b) => b.stallId === p.stallId && b.type === p.type && b.period === p.period));
}

/* What goes on paper, and what the preview shows — the same component both
   times, so the preview cannot drift from the print. */
function ReceiptSheets({ receipts, printedBy, printedAt }: { receipts: PrintReceipt[]; printedBy: string; printedAt: string }) {
  return (<>
    {chunkIntoSheets(receipts).map((sheet, sheetIndex) => (
      <div className="receipt-sheet" key={sheetIndex}>
        {sheet.map((r, i) => (
          <BillReceipt key={`${r.bill.id || 'draft'}-${sheetIndex}-${i}`} bill={r.bill} label={r.label} printedBy={printedBy} printedAt={printedAt} />
        ))}
        {Array.from({ length: RECEIPTS_PER_SHEET - sheet.length }, (_, i) => (
          <div className="receipt receipt-blank" key={`blank-${i}`} />
        ))}
      </div>
    ))}
  </>);
}

/* A receipt has to say who issued it, and the app has no signed-in identity to
   take that from, so the name is asked for and remembered for the next print.
   Nothing reaches the printer until the officer has seen the sheet. */
function PrintPreviewDialog({ request, billsOnRecord, onConfirm, onCancel }: { request: PrintRequest; billsOnRecord: UtilityBill[]; onConfirm: (receipts: PrintReceipt[], printedBy: string) => void; onCancel: () => void }) {
  const [name, setName] = useState(() => { try { return localStorage.getItem(printedByKey) ?? ''; } catch { return ''; } });
  const [copies, setCopies] = useState(2);
  const [error, setError] = useState('');

  /* One bill goes out in labelled copies; a batch goes out one receipt each. */
  const receipts: PrintReceipt[] = request.single
    ? Array.from({ length: copies }, (_, i) => ({ bill: request.bills[0], label: RECEIPT_COPY_LABELS[i] ?? '' }))
    : request.bills.map((bill) => ({ bill, label: '' }));

  const sheets = Math.ceil(Math.max(receipts.length, 1) / RECEIPTS_PER_SHEET);

  /* Printing files any draft on the sheet, so the preview shows the number it
     will be filed under rather than "not yet on record". Only peeked here —
     the number is claimed when the officer actually prints, so backing out of
     this dialog leaves the bill numbers where they were. */
  const pending = unsavedBills(receipts.map((r) => r.bill));
  const numbered = numberBills(receipts.map((r) => r.bill), peekIds('UTL', billsOnRecord.map((b) => b.id), pending.length));
  const previewReceipts = receipts.map((r) => ({ ...r, bill: numbered.get(r.bill) ?? r.bill }));
  const willFile = [...numbered.values()];
  const clashing = billsClashing(pending, billsOnRecord);
  const overdueCount = receipts.filter((r) => isOverdue(r.bill)).length;

  /* Zoom is a plain scale on the same sheet the printer gets, so magnifying it
     cannot change what prints. Fullscreen is an in-page mode rather than the
     Fullscreen API: the dialog is already inside an Electron window, and a
     real fullscreen request would hide the window chrome the officer needs. */
  const [zoom, setZoom] = useState(FIT_ZOOM);
  const [full, setFull] = useState(false);

  const stepZoom = (delta: number) => setZoom((z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round((z + delta) * 100) / 100)));

  /* Esc backs out of fullscreen before it closes the dialog, so the first press
     never loses a half-filled form. Capture phase beats Modal's own handler. */
  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      e.stopPropagation();
      setFull(false);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [full]);

  const submit = () => {
    if (!name.trim()) { setError('Enter the name of the person printing these receipts.'); return; }
    if (receipts.length === 0) { setError('There is nothing to print.'); return; }
    onConfirm(receipts, name.trim());
  };

  const preview = (
    <div className={`print-preview${full ? ' fullscreen' : ''}`} aria-label="Preview of the sheets that will print">
      <div className="print-preview-toolbar">
        <span className="print-preview-count">{sheets} A4 sheet{sheets === 1 ? '' : 's'} · {receipts.length} receipt{receipts.length === 1 ? '' : 's'}</span>
        <div className="print-preview-zoom">
          <button type="button" className="row-icon-btn" title="Zoom out" aria-label="Zoom out" disabled={zoom <= MIN_ZOOM} onClick={() => stepZoom(-0.15)}><span className="material-symbols-outlined">zoom_out</span></button>
          <span className="print-preview-level">{Math.round(zoom * 100)}%</span>
          <button type="button" className="row-icon-btn" title="Zoom in" aria-label="Zoom in" disabled={zoom >= MAX_ZOOM} onClick={() => stepZoom(0.15)}><span className="material-symbols-outlined">zoom_in</span></button>
          <button type="button" className="btn-outline-sm" onClick={() => setZoom(FIT_ZOOM)}>Fit</button>
          <button type="button" className="btn-outline-sm" onClick={() => setZoom(1)}>Actual size</button>
          <button type="button" className="row-icon-btn" title={full ? 'Exit fullscreen' : 'Fullscreen'} aria-label={full ? 'Exit fullscreen' : 'Fullscreen'} onClick={() => setFull((v) => !v)}>
            <span className="material-symbols-outlined">{full ? 'fullscreen_exit' : 'fullscreen'}</span>
          </button>
        </div>
      </div>
      <div className="print-preview-viewport">
        {/* `zoom`, not `transform: scale` — zoom reflows, so the scroll area
            sizes itself to the magnified sheet. A transform would leave the
            container at its unscaled size and the sheet would be clipped at
            anything above 100%. Chromium-only, which is all this app runs on. */}
        <div className="print-preview-scale zoomable" style={{ zoom }}>
          <ReceiptSheets
            receipts={previewReceipts}
            printedBy={name.trim() || '—'}
            printedAt={manilaStamp()}
          />
        </div>
      </div>
    </div>
  );

  if (full) {
    return (
      <div className="print-fullscreen" role="dialog" aria-modal="true" aria-label="Print preview, fullscreen">
        <div className="print-fullscreen-bar">
          <div className="print-fullscreen-title">
            <span className="material-symbols-outlined">print</span>
            <div>
              <strong>Print Preview</strong>
              <span>{receipts.length} receipt{receipts.length === 1 ? '' : 's'} · {sheets} A4 sheet{sheets === 1 ? '' : 's'}</span>
            </div>
          </div>
          <div className="print-fullscreen-actions">
            <button className="btn-outline" onClick={() => setFull(false)}><span className="material-symbols-outlined">fullscreen_exit</span>Exit Fullscreen</button>
            <button className="btn-primary" onClick={submit}><span className="material-symbols-outlined">print</span>Print {sheets} Sheet{sheets === 1 ? '' : 's'}</button>
          </div>
        </div>
        {error && <div className="form-error" style={{ margin: '0 20px' }}><span className="material-symbols-outlined">error</span>{error}</div>}
        {preview}
      </div>
    );
  }

  return (
    <Modal
      title="Print Preview — Billing Receipt"
      subtitle={`${receipts.length} receipt${receipts.length === 1 ? '' : 's'} · ${sheets} A4 sheet${sheets === 1 ? '' : 's'} · four to a sheet`}
      stacked wide onClose={onCancel}
    >
      <div className="print-setup">
        <div className="form-group">
          <label className="form-label">Printed By *</label>
          <input
            className="form-input" autoFocus value={name} placeholder="e.g. Luz M. Maderazo"
            onChange={(e) => { setName(e.target.value); setError(''); }}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
          />
          <span className="form-hint">Printed on every receipt as the officer who issued it, and offered back next time.</span>
        </div>
        {request.single && (
          <div className="form-group">
            <label className="form-label">Copies on the Sheet</label>
            <select className="form-select" value={copies} onChange={(e) => setCopies(Number(e.target.value))}>
              <option value={1}>1 — {RECEIPT_COPY_LABELS[0]}</option>
              <option value={2}>2 — tenant and market office</option>
              <option value={4}>4 — fill the sheet</option>
            </select>
            <span className="form-hint">Every copy prints on the one sheet, to be cut apart.</span>
          </div>
        )}
      </div>

      {willFile.length > 0 && (
        <div className="dialog-note">
          <span className="material-symbols-outlined">info</span>
          <span>
            {willFile.length === 1
              ? `This bill is not on record yet — printing files it as ${willFile[0].id}.`
              : `${willFile.length} of these bills are not on record yet — printing files them as ${willFile[0].id}–${willFile[willFile.length - 1].id}.`}
            {' '}The {willFile.length === 1 ? 'number is' : 'numbers are'} claimed only when this prints.
          </span>
        </div>
      )}
      {clashing.length > 0 && (
        <div className="dialog-note warning">
          <span className="material-symbols-outlined">warning</span>
          <span>
            {clashing.length === 1
              ? `Stall ${clashing[0].stallId} already has ${/^[aeiou]/i.test(clashing[0].type) ? 'an' : 'a'} ${clashing[0].type.toLowerCase()} bill on record for ${formatPeriod(clashing[0].period)}`
              : `${clashing.length} of these stalls already have a bill on record for the same utility and month`}
            , so printing files a second one. Check the reading before you print if this is meant to be a correction.
          </span>
        </div>
      )}
      {overdueCount > 0 && (
        <div className="dialog-note warning">
          <span className="material-symbols-outlined">running_with_errors</span>
          <span>{overdueCount === receipts.length ? (receipts.length === 1 ? 'This bill is' : 'These bills are') : `${overdueCount} of these receipts are`} past the due date, so the late surcharge is added automatically on the printed copy. The amount held on record is unchanged.</span>
        </div>
      )}
      {error && <div className="form-error"><span className="material-symbols-outlined">error</span>{error}</div>}

      {preview}

      <div className="modal-footer" style={{ padding: '16px 0 0', borderTop: 'none', justifyContent: 'flex-end' }}>
        <button className="btn-outline" onClick={onCancel}>Cancel</button>
        <button className="btn-primary" onClick={submit}><span className="material-symbols-outlined">print</span>Print {sheets} Sheet{sheets === 1 ? '' : 's'}</button>
      </div>
    </Modal>
  );
}

/* One quarter of an A4 sheet. Everything that identifies the charge as this
   tenant's — stall, name, section, meter — sits in its own block above the
   figures, so a quarter cut out on its own still says who owes what. */
function BillReceipt({ bill, label, printedBy, printedAt }: { bill: UtilityBill; label: string; printedBy: string; printedAt: string }) {
  const preset = UTILITY_PRESETS[bill.type];
  /* The surcharge is decided right here, at the moment this receipt is laid
     out — not carried on the bill. Printing the same overdue bill again next
     week recomputes it against next week's date, same as `isOverdue` always
     has for the OVERDUE badge everywhere else. */
  const overdue = isOverdue(bill);
  const surcharge = surchargeAmount(bill);
  return (
    <div className="receipt">
      <header className="receipt-masthead">
        <img className="receipt-seal" src="./logo.jpg" alt="" aria-hidden="true" />
        <div className="receipt-identity">
          <span>Republic of the Philippines</span>
          <span>Municipality of Tanauan, Leyte</span>
          <strong>Public Market — Market Office</strong>
        </div>
        {label && <span className="receipt-copy">{label}</span>}
      </header>

      <h1 className="receipt-title">{bill.type} Billing Receipt</h1>

      <div className="receipt-ref">
        <span>Bill No. <strong>{bill.id || 'Not yet on record'}</strong></span>
        <span>Issued <strong>{formatIsoDate(bill.dateIssued)}</strong></span>
      </div>

      <div className="receipt-party">
        <div className="receipt-party-row"><span>Stall No.</span><strong>{bill.stallId || '—'}</strong></div>
        <div className="receipt-party-row"><span>Tenant</span><strong>{bill.tenantName || 'Unassigned — charged to the stall'}</strong></div>
        <div className="receipt-party-row"><span>Section</span><strong>{bill.section || '—'}</strong></div>
        <div className="receipt-party-row"><span>{bill.type} Meter No.</span><strong>{bill.meterNumber || 'Not on record'}</strong></div>
      </div>

      <section className="receipt-block">
        <div className="receipt-line"><span>Period Covered</span><strong>{billPeriodText(bill)}</strong></div>
        <div className="receipt-line"><span>Due Date</span><strong>{formatIsoDate(bill.dueDate)}</strong></div>
        <div className="receipt-line"><span>Previous Reading</span><strong>{bill.previousReading.toLocaleString()} {preset.unit}</strong></div>
        <div className="receipt-line"><span>Current Reading</span><strong>{bill.currentReading.toLocaleString()} {preset.unit}</strong></div>
        <div className="receipt-line"><span>Consumption</span><strong>{bill.consumption.toLocaleString()} {preset.unit}</strong></div>
        <div className="receipt-line"><span>Rate per {preset.unit}</span><strong>{money(bill.rate)}</strong></div>
        <div className="receipt-line"><span>{bill.consumption.toLocaleString()} {preset.unit} × {money(bill.rate)}</span><strong>{money(bill.amount)}</strong></div>
        {overdue && (
          <div className="receipt-line surcharge">
            <span>Late Surcharge ({SURCHARGE_RATES[bill.type]}%)</span>
            <strong>+{money(surcharge)}</strong>
          </div>
        )}
      </section>

      <div className="receipt-total"><span>Total Due</span><strong>{money(overdue ? amountWithSurcharge(bill) : bill.amount)}</strong></div>
      <div className="receipt-status">Status at printing: <strong>{(overdue ? 'Overdue' : bill.status).toUpperCase()}</strong></div>
      {overdue && (
        <p className="receipt-surcharge-note">
          Past due since {formatIsoDate(bill.dueDate)}. A {SURCHARGE_RATES[bill.type]}% surcharge of {money(surcharge)} has been added to the billed amount of {money(bill.amount)}.
        </p>
      )}

      {bill.notes && <p className="receipt-notes"><span>Notes:</span> {bill.notes}</p>}

      <div className="receipt-signatures">
        <div className="receipt-sign">
          <span className="receipt-sign-name">{printedBy}</span>
          <span className="receipt-sign-rule" />
          <span className="receipt-sign-role">Market Office</span>
        </div>
        <div className="receipt-sign">
          <span className="receipt-sign-name">&nbsp;</span>
          <span className="receipt-sign-rule" />
          <span className="receipt-sign-role">Received by (Tenant)</span>
        </div>
      </div>

      <footer className="receipt-foot">
        <span>Printed by <strong>{printedBy}</strong> · {printedAt}</span>
      </footer>
    </div>
  );
}

/* ============================================================
   Printing — stall / space verification slips, four to an A4 sheet
   ============================================================ */

/* Same quartering as the receipts, so the office cuts both sheets the same way
   and the last sheet is padded out rather than leaving three ragged edges. */
function chunkSlips(slips: VerificationSlip[]): VerificationSlip[][] {
  const sheets: VerificationSlip[][] = [];
  for (let i = 0; i < slips.length; i += SLIPS_PER_SHEET) {
    sheets.push(slips.slice(i, i + SLIPS_PER_SHEET));
  }
  return sheets.length > 0 ? sheets : [[]];
}

function VerificationSheets({ slips }: { slips: VerificationSlip[] }) {
  return (<>
    {chunkSlips(slips).map((sheet, sheetIndex) => (
      <div className="slip-sheet" key={sheetIndex}>
        {sheet.map((slip) => <VerificationSlipCard key={slip.controlNo} slip={slip} />)}
        {Array.from({ length: SLIPS_PER_SHEET - sheet.length }, (_, i) => (
          <div className="slip slip-blank" key={`blank-${i}`} />
        ))}
      </div>
    ))}
  </>);
}

/* A field left empty prints as a ruled line rather than a dash, because a slip
   is often run off blank and filled in at the counter by hand — that is what
   the paper pad was. Anything typed in beforehand prints instead of the rule. */
function SlipField({ label, value }: { label: string; value: string }) {
  return (
    <div className="slip-field">
      <span className="slip-field-label">{label}</span>
      <span className={`slip-field-value${value ? '' : ' blank'}`}>{value}</span>
    </div>
  );
}

/* One quarter of the sheet. The control number, the date it was issued and the
   date it lapses are the three things a licensing clerk checks first, so they
   sit together at the top where a slip folded in a wallet still shows them. */
function VerificationSlipCard({ slip }: { slip: VerificationSlip }) {
  return (
    <div className="slip">
      <header className="slip-masthead">
        <img className="slip-seal" src="./logo.jpg" alt="" aria-hidden="true" />
        <div className="slip-identity">
          <span>Republic of the Philippines</span>
          <span>Municipality of Tanauan, Leyte</span>
          <strong>Tanauan Public Market</strong>
          <span>Market Office</span>
        </div>
      </header>

      <div className="slip-control">
        <span className="slip-control-label">Control No.</span>
        <span className="slip-control-no">{slip.controlNo}</span>
      </div>

      <h1 className="slip-title">Stall / Space Verification</h1>
      <p className="slip-subtitle">(For Business Permit {slip.purpose})</p>

      <div className="slip-dates">
        <div className="slip-date"><span>Date Issued</span><strong>{formatIsoDate(slip.dateIssued)}</strong></div>
        <div className="slip-date"><span>Valid Until</span><strong>{formatIsoDate(slip.validUntil)}</strong></div>
      </div>

      <div className="slip-party">
        <SlipField label="Issued To" value={slip.issuedTo} />
        <SlipField label="Section" value={slip.section} />
        <SlipField label="Stall No." value={slip.stallNo} />
      </div>

      <ul className="slip-checklist">
        {VERIFICATION_CHECKLIST.map((item) => (
          <li key={item}>
            <span className={`slip-box${slip.checked.includes(item) ? ' ticked' : ''}`} aria-hidden="true" />
            <span className="slip-item">{item}</span>
          </li>
        ))}
        <li>
          <span className={`slip-box${slip.others ? ' ticked' : ''}`} aria-hidden="true" />
          <span className="slip-item">Others <span className={`slip-others${slip.others ? '' : ' blank'}`}>{slip.others}</span></span>
        </li>
      </ul>

      <p className="slip-validity">
        Valid for {VERIFICATION_VALID_DAYS} days only, until <strong>{formatIsoDate(slip.validUntil)}</strong>.
      </p>

      <footer className="slip-foot">
        <div className="slip-sign">
          <span className="slip-sign-name">{slip.issuedBy}</span>
          <span className="slip-sign-rule" />
          <span className="slip-sign-role">Market Supervisor</span>
        </div>
      </footer>
    </div>
  );
}

/* Nothing reaches the printer until the officer has seen the sheet, the same
   rule the receipts follow. The control numbers on the preview are the ones
   that will print — they are only claimed when Print is pressed. */
function VerificationPrintDialog({ stall, tenantName, existingIds, onConfirm, onCancel }: {
  stall?: Stall; tenantName?: string; existingIds: string[];
  onConfirm: (slips: Omit<VerificationSlip, 'controlNo'>[]) => void;
  onCancel: () => void;
}) {
  const [purpose, setPurpose] = useState<VerificationPurpose>('Renewal');
  const [issuedTo, setIssuedTo] = useState(tenantName && tenantName !== 'Vacant' ? tenantName : '');
  const [section, setSection] = useState(stall?.section ?? '');
  const [stallNo, setStallNo] = useState(stall?.id ?? '');
  const [checked, setChecked] = useState<string[]>(VERIFICATION_DEFAULTS.Renewal);
  const [others, setOthers] = useState('');
  const [count, setCount] = useState(1);
  const [issuedBy, setIssuedBy] = useState(() => { try { return localStorage.getItem(verifiedByKey) ?? ''; } catch { return ''; } });
  const [error, setError] = useState('');
  const [zoom, setZoom] = useState(FIT_ZOOM);
  const [full, setFull] = useState(false);

  const stepZoom = (delta: number) => setZoom((z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round((z + delta) * 100) / 100)));

  /* Shown in the note under the preview. The slip itself re-reads the date as
     it is built, so what prints is the day it printed. */
  const dateIssued = todayIso();
  const validUntil = isoPlusDays(dateIssued, VERIFICATION_VALID_DAYS);

  /* Switching the errand re-ticks the checklist for it. The officer can still
     change any box afterwards — the defaults are the usual case, not a rule. */
  const choosePurpose = (next: VerificationPurpose) => {
    setPurpose(next);
    setChecked(VERIFICATION_DEFAULTS[next]);
  };

  const toggle = (item: string) => setChecked((prev) => (
    prev.includes(item) ? prev.filter((c) => c !== item) : [...prev, item]
  ));

  /* Read at the moment they are needed, not when the dialog opened: a preview
     left sitting open past midnight would otherwise print yesterday's date, and
     the validity is counted from the day the slip is actually handed over. */
  const draft = (): Omit<VerificationSlip, 'controlNo'> => {
    const dateIssued = todayIso();
    return {
      purpose,
      issuedTo: issuedTo.trim(),
      section: section.trim(),
      stallNo: stallNo.trim(),
      checked,
      others: others.trim(),
      dateIssued,
      validUntil: isoPlusDays(dateIssued, VERIFICATION_VALID_DAYS),
      issuedBy: issuedBy.trim(),
    };
  };

  /* Each slip on the sheet is a separate issuable leaf, so each gets its own
     number — printing four is running off a short pad, not four copies of one. */
  const numbers = peekIds('SSV', existingIds, count);
  const preview: VerificationSlip[] = numbers.map((controlNo) => ({
    ...draft(),
    issuedBy: issuedBy.trim() || '',
    controlNo,
  }));

  const submit = () => {
    if (!issuedBy.trim()) { setError('Enter the name of the officer issuing these slips.'); return; }
    onConfirm(Array.from({ length: count }, () => draft()));
  };

  return (
    <Modal
      title="Print Preview — Stall / Space Verification"
      subtitle={`${count} slip${count === 1 ? '' : 's'} · 1 A4 sheet · four to a sheet · valid ${VERIFICATION_VALID_DAYS} days`}
      stacked wide onClose={onCancel}
    >
      <div className="print-setup">
        <div className="form-group">
          <label className="form-label">Purpose *</label>
          <select className="form-select" value={purpose} onChange={(e) => choosePurpose(e.target.value as VerificationPurpose)}>
            <option value="Renewal">Renewal — existing lessee</option>
            <option value="Issuance">Issuance — new lessee</option>
          </select>
          <span className="form-hint">Prints on the slip and ticks the boxes that errand usually needs.</span>
        </div>
        <div className="form-group">
          <label className="form-label">Issued By *</label>
          <input
            className="form-input" autoFocus value={issuedBy} placeholder="e.g. Luz M. Maderazo"
            onChange={(e) => { setIssuedBy(e.target.value); setError(''); }}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
          />
          <span className="form-hint">Signs the slip as Market Supervisor, and is offered back next time.</span>
        </div>
        <div className="form-group">
          <label className="form-label">Issued To</label>
          <input className="form-input" value={issuedTo} placeholder="Leave blank to write in by hand" onChange={(e) => setIssuedTo(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Section</label>
          <select className="form-select" value={section} onChange={(e) => setSection(e.target.value)}>
            <option value="">Leave blank</option>
            {SECTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Stall No.</label>
          <input className="form-input" value={stallNo} placeholder="e.g. MS-01" onChange={(e) => setStallNo(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Slips on the Sheet</label>
          <select className="form-select" value={count} onChange={(e) => setCount(Number(e.target.value))}>
            <option value={1}>1 slip</option>
            <option value={2}>2 slips</option>
            <option value={4}>4 — fill the sheet</option>
          </select>
          <span className="form-hint">Each slip is issued its own control number. Leave the details blank to run off a numbered pad.</span>
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">Requirements Checked</label>
        <div className="slip-checkgrid">
          {VERIFICATION_CHECKLIST.map((item) => (
            <label className="slip-checkbox" key={item}>
              <input type="checkbox" checked={checked.includes(item)} onChange={() => toggle(item)} />
              <span>{item}</span>
            </label>
          ))}
        </div>
        <input className="form-input" value={others} placeholder="Others — e.g. until Dec 31, 2026" onChange={(e) => setOthers(e.target.value)} style={{ marginTop: '10px' }} />
        <span className="form-hint">Unticked boxes print empty, for ticking by hand at the counter.</span>
      </div>

      <div className="dialog-note">
        <span className="material-symbols-outlined">info</span>
        <span>
          {count === 1 ? `Control number ${numbers[0]} will be` : `Control numbers ${numbers[0]}–${numbers[numbers.length - 1]} will be`}
          {' '}issued and recorded, dated {formatIsoDate(dateIssued)} and valid until {formatIsoDate(validUntil)}.
          {' '}{count === 1 ? 'It is claimed' : 'They are claimed'} only when this prints.
        </span>
      </div>
      {error && <div className="form-error"><span className="material-symbols-outlined">error</span>{error}</div>}

      <div className={`print-preview${full ? ' fullscreen' : ''}`} aria-label="Preview of the sheet that will print">
        <div className="print-preview-toolbar">
          <span className="print-preview-count">1 A4 sheet · {count} slip{count === 1 ? '' : 's'}</span>
          <div className="print-preview-zoom">
            <button type="button" className="row-icon-btn" title="Zoom out" aria-label="Zoom out" disabled={zoom <= MIN_ZOOM} onClick={() => stepZoom(-0.15)}><span className="material-symbols-outlined">zoom_out</span></button>
            <span className="print-preview-level">{Math.round(zoom * 100)}%</span>
            <button type="button" className="row-icon-btn" title="Zoom in" aria-label="Zoom in" disabled={zoom >= MAX_ZOOM} onClick={() => stepZoom(0.15)}><span className="material-symbols-outlined">zoom_in</span></button>
            <button type="button" className="btn-outline-sm" onClick={() => setZoom(FIT_ZOOM)}>Fit</button>
            <button type="button" className="btn-outline-sm" onClick={() => setZoom(1)}>Actual size</button>
            <button type="button" className="row-icon-btn" title={full ? 'Exit fullscreen' : 'Fullscreen'} aria-label={full ? 'Exit fullscreen' : 'Fullscreen'} onClick={() => setFull((v) => !v)}>
              <span className="material-symbols-outlined">{full ? 'fullscreen_exit' : 'fullscreen'}</span>
            </button>
          </div>
        </div>
        <div className="print-preview-viewport">
          <div className="print-preview-scale zoomable" style={{ zoom }}>
            <VerificationSheets slips={preview.map((s) => ({ ...s, issuedBy: s.issuedBy || '—' }))} />
          </div>
        </div>
      </div>

      <div className="modal-footer" style={{ padding: '16px 0 0', borderTop: 'none', justifyContent: 'flex-end' }}>
        <button className="btn-outline" onClick={onCancel}>Cancel</button>
        <button className="btn-primary" onClick={submit}><span className="material-symbols-outlined">print</span>Print Sheet</button>
      </div>
    </Modal>
  );
}


/* ============================================================
   Start-up
   ============================================================ */

/* Reading the records is a round trip to the database, so the app cannot be
   built until they arrive. This holds a plain panel on screen for the moment
   that takes, then hands the records over and steps out of the way. */
function Boot() {
  const [boot, setBoot] = useState<BootData | null>(null);

  useEffect(() => {
    let dropped = false;
    loadStored()
      .then((loaded) => {
        if (dropped) return;
        seedIdCounters(loaded.idCounters);
        setBoot({
          state: stateFrom(loaded.raw),
          savedAt: loaded.savedAt,
          problem: loaded.problem,
          imported: loaded.imported,
        });
      })
      .catch((error: unknown) => {
        if (dropped) return;
        seedIdCounters({});
        setBoot({
          state: initialState,
          savedAt: '',
          problem: error instanceof Error ? error.message : 'The records could not be read.',
          imported: false,
        });
      });
    return () => { dropped = true; };
  }, []);

  if (!boot) {
    return (
      <div className="boot-screen">
        <div className="boot-card">
          <img className="boot-logo" src="./logo.jpg" alt="Municipality of Tanauan official seal" />
          <p className="boot-title">Tanauan Public Market</p>
          <p className="boot-note">Opening records&hellip;</p>
        </div>
      </div>
    );
  }

  return <App boot={boot} />;
}

export default Boot;
