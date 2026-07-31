import { useEffect, useMemo, useRef, useState, useCallback } from 'react';

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
  | 'settings'
  | 'support';

type ApplicantStatus = 'Pending Review' | 'Incomplete' | 'Approved' | 'Rejected';
type StallStatus = 'Occupied' | 'Available' | 'Maintenance';

type ViolationStatus = 'Open' | 'Resolved';

type UtilityType = 'Electricity' | 'Water';
type BillStatus = 'Unpaid' | 'Paid';

type ModalType =
  | null
  | 'add-stall' | 'add-applicant' | 'add-tenant' | 'add-log' | 'assign-stall' | 'add-violation'
  | 'view-stall' | 'view-applicant' | 'view-tenant' | 'view-bill' | 'view-violation'
  | 'confirm-logout' | 'confirm-reset' | 'confirm-delete-bill' | 'confirm-delete-stall'
  | 'confirm-delete-tenant' | 'confirm-delete-applicant' | 'confirm-delete-log'
  | 'confirm-delete-violation';

type Applicant = {
  id: string;
  name: string;
  phone: string;
  stallType: string;
  status: ApplicantStatus;
  dateApplied: string;
  requirements: string[];
};

type Tenant = {
  id: string;
  name: string;
  phone: string;
  stallId: string;
  section: string;
  rent: number;
  status: string;
  applicantId?: string;
};

type Stall = {
  id: string;
  section: string;
  tenant: string;
  status: StallStatus;
  lastInspection: string;
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
  period: string;
  previousReading: number;
  currentReading: number;
  consumption: number;
  rate: number;
  fixedCharge: number;
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

const ITEMS_PER_PAGE = 5;
const MAX_ACTIVITIES = 50;
const SECTIONS = ['Meat & Poultry', 'Fish & Seafood', 'Vegetables & Fruits', 'Dry Goods'];
const STALL_TYPES = ['Produce (Wet)', 'Dry Goods', 'Vegetables', 'Fish & Seafood', 'Meat & Poultry'];
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
const storageKey = 'pmrms-state-v3';
const savedAtKey = 'pmrms-saved-at';
const idCounterKey = 'pmrms-id-counters';

const REQUIREMENTS = [
  'Barangay Clearance',
  'Community Tax Certificate (Cedula)',
  'Health / Sanitary Permit',
  '2x2 ID Photo',
];

const UTILITY_TYPES: UtilityType[] = ['Electricity', 'Water'];

const UTILITY_PRESETS: Record<UtilityType, { rate: number; fixedCharge: number; unit: string; icon: string }> = {
  Electricity: { rate: 11.5, fixedCharge: 150, unit: 'kWh', icon: 'bolt' },
  Water: { rate: 25, fixedCharge: 80, unit: 'm³', icon: 'water_drop' },
};

/* ============================================================
   Initial Data
   ============================================================ */

const initialState = {
  applicants: [
    { id: 'APP-001', name: 'Juan Santos', phone: '0917-123-4567', stallType: 'Produce (Wet)', status: 'Pending Review' as ApplicantStatus, dateApplied: 'Oct 12, 2023', requirements: [...REQUIREMENTS] },
    { id: 'APP-002', name: 'Maria Reyes', phone: '0920-987-6543', stallType: 'Dry Goods', status: 'Incomplete' as ApplicantStatus, dateApplied: 'Oct 14, 2023', requirements: REQUIREMENTS.slice(0, 2) },
    { id: 'APP-003', name: 'Liza Cruz', phone: '0918-555-1234', stallType: 'Vegetables', status: 'Approved' as ApplicantStatus, dateApplied: 'Oct 10, 2023', requirements: [...REQUIREMENTS] },
    { id: 'APP-004', name: 'Pedro Garcia', phone: '0915-333-7890', stallType: 'Fish & Seafood', status: 'Pending Review' as ApplicantStatus, dateApplied: 'Oct 16, 2023', requirements: REQUIREMENTS.slice(0, 3) },
    { id: 'APP-005', name: 'Ana Villanueva', phone: '0922-444-5678', stallType: 'Meat & Poultry', status: 'Rejected' as ApplicantStatus, dateApplied: 'Oct 8, 2023', requirements: REQUIREMENTS.slice(0, 1) },
  ] satisfies Applicant[],
  tenants: [
    { id: 'TEN-001', name: 'Maria Santos', phone: '0917-222-1100', stallId: 'A-001', section: 'Meat & Poultry', rent: 5000, status: 'Active' },
    { id: 'TEN-002', name: 'Juan Dela Cruz', phone: '0918-333-2211', stallId: 'A-002', section: 'Fish & Seafood', rent: 4500, status: 'Active' },
    { id: 'TEN-003', name: 'Liza Reyes', phone: '0920-444-3322', stallId: 'B-015', section: 'Dry Goods', rent: 3500, status: 'Active' },
    { id: 'TEN-004', name: "Rosa's Butchery", phone: '0921-555-4433', stallId: 'M-101', section: 'Meat & Poultry', rent: 5500, status: 'Active' },
    { id: 'TEN-005', name: 'Green Farm Organics', phone: '0922-666-5544', stallId: 'V-045', section: 'Vegetables & Fruits', rent: 4000, status: 'Active' },
    { id: 'TEN-006', name: 'Deep Blue Catch', phone: '0915-777-6655', stallId: 'F-012', section: 'Fish & Seafood', rent: 4200, status: 'Expiring Soon' },
    { id: 'TEN-007', name: 'Santos General Store', phone: '0919-888-7766', stallId: 'D-203', section: 'Dry Goods', rent: 3800, status: 'Active' },
  ] satisfies Tenant[],
  stalls: [
    { id: 'M-101', section: 'Meat & Poultry', tenant: "Rosa's Butchery", status: 'Occupied' as StallStatus, lastInspection: 'Oct 12, 2023' },
    { id: 'M-102', section: 'Meat & Poultry', tenant: 'Vacant', status: 'Available' as StallStatus, lastInspection: '-' },
    { id: 'V-045', section: 'Vegetables & Fruits', tenant: 'Green Farm Organics', status: 'Occupied' as StallStatus, lastInspection: 'Oct 10, 2023' },
    { id: 'F-012', section: 'Fish & Seafood', tenant: 'Deep Blue Catch', status: 'Maintenance' as StallStatus, lastInspection: 'Oct 15, 2023' },
    { id: 'D-203', section: 'Dry Goods', tenant: 'Santos General Store', status: 'Occupied' as StallStatus, lastInspection: 'Sep 28, 2023' },
    { id: 'M-103', section: 'Meat & Poultry', tenant: 'Fresh Cuts Co.', status: 'Occupied' as StallStatus, lastInspection: 'Oct 5, 2023' },
    { id: 'V-046', section: 'Vegetables & Fruits', tenant: 'Vacant', status: 'Available' as StallStatus, lastInspection: '-' },
    { id: 'D-204', section: 'Dry Goods', tenant: 'Vacant', status: 'Available' as StallStatus, lastInspection: '-' },
  ] satisfies Stall[],
  violations: [
    { id: 'VIO-001', tenant: 'Juan Santos', issue: 'Late document submission', status: 'Open' as ViolationStatus, points: 1, dateRecorded: '2023-10-12', dateResolved: '', notes: '' },
    { id: 'VIO-002', tenant: 'Liza Reyes', issue: 'Improper stall cleanup', status: 'Resolved' as ViolationStatus, points: 2, dateRecorded: '2023-10-05', dateResolved: '2023-10-09', notes: 'Stall cleared and re-inspected.' },
    { id: 'VIO-003', tenant: 'Deep Blue Catch', issue: 'Health code violation', status: 'Open' as ViolationStatus, points: 3, dateRecorded: '2023-10-15', dateResolved: '', notes: 'Chilled storage below required temperature.' },
  ] satisfies Violation[],

  utilities: [
    { id: 'UTL-001', type: 'Electricity' as UtilityType, stallId: 'M-101', tenantId: 'TEN-004', tenantName: "Rosa's Butchery", section: 'Meat & Poultry', period: '2023-09', previousReading: 1240, currentReading: 1512, consumption: 272, rate: 11.5, fixedCharge: 150, amount: 3278, status: 'Paid' as BillStatus, dateIssued: '2023-10-01', dueDate: '2023-10-15', notes: 'Refrigeration units running 24/7.' },
    { id: 'UTL-002', type: 'Water' as UtilityType, stallId: 'M-101', tenantId: 'TEN-004', tenantName: "Rosa's Butchery", section: 'Meat & Poultry', period: '2023-09', previousReading: 84, currentReading: 103, consumption: 19, rate: 25, fixedCharge: 80, amount: 555, status: 'Paid' as BillStatus, dateIssued: '2023-10-01', dueDate: '2023-10-15', notes: '' },
    { id: 'UTL-003', type: 'Electricity' as UtilityType, stallId: 'V-045', tenantId: 'TEN-005', tenantName: 'Green Farm Organics', section: 'Vegetables & Fruits', period: '2023-09', previousReading: 640, currentReading: 745, consumption: 105, rate: 11.5, fixedCharge: 150, amount: 1357.5, status: 'Unpaid' as BillStatus, dateIssued: '2023-10-01', dueDate: '2023-10-15', notes: '' },
    { id: 'UTL-004', type: 'Water' as UtilityType, stallId: 'F-012', tenantId: 'TEN-006', tenantName: 'Deep Blue Catch', section: 'Fish & Seafood', period: '2023-09', previousReading: 210, currentReading: 268, consumption: 58, rate: 25, fixedCharge: 80, amount: 1530, status: 'Unpaid' as BillStatus, dateIssued: '2023-10-01', dueDate: '2023-10-15', notes: 'High usage — check for leaking hose.' },
    { id: 'UTL-005', type: 'Electricity' as UtilityType, stallId: 'D-203', tenantId: 'TEN-007', tenantName: 'Santos General Store', section: 'Dry Goods', period: '2023-09', previousReading: 320, currentReading: 388, consumption: 68, rate: 11.5, fixedCharge: 150, amount: 932, status: 'Paid' as BillStatus, dateIssued: '2023-10-01', dueDate: '2023-10-15', notes: '' },
  ] satisfies UtilityBill[],

  logs: [
    { id: 'LOG-001', date: todayIso(), time: '08:15 AM', type: 'Inspection', details: 'Morning walkthrough for Section A completed.' },
    { id: 'LOG-002', date: todayIso(), time: '09:42 AM', type: 'Incident', details: 'Vendor boundary dispute resolved between M-101 and M-102.' },
    { id: 'LOG-003', date: todayIso(), time: '11:05 AM', type: 'Maintenance', details: 'Leaking pipe reported in Restroom C — plumber dispatched.' },
    { id: 'LOG-004', date: todayIso(), time: '01:30 PM', type: 'Collection', details: 'Monthly rent collected from Section D tenants.' },
    { id: 'LOG-005', date: todayIso(), time: '03:15 PM', type: 'Inspection', details: 'Fire safety equipment inspection for Zones B and C.' },
  ] satisfies LogEntry[],
  activities: [
    { id: 'ACT-2', icon: 'person_add', iconColor: 'red', highlight: 'New Applicant', text: ' submitted requirements for Stall B-04.', time: '1 hour ago' },
    { id: 'ACT-3', icon: 'warning', iconColor: 'amber', highlight: 'Maintenance', text: ' reported plumbing issue near Zone C.', time: '3 hours ago' },
    { id: 'ACT-4', icon: 'check_circle', iconColor: 'green', highlight: 'Health inspection', text: ' passed for Meat Section.', time: 'Yesterday' },
  ] satisfies ActivityItem[],
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
];

const searchPlaceholders: Record<ModuleKey, string> = {
  dashboard: 'Search dashboard...',
  stalls: 'Search stall ID, tenant, or section...',
  tenants: 'Search tenant name, ID, or stall...',
  applicants: 'Search applicant name, phone, or stall type...',
  utilities: 'Search bill ID, stall number, or tenant...',
  violations: 'Search violation ID, tenant, or issue...',
  analytics: 'Search is not used on Analytics',
  logbook: 'Search log details or type...',
  settings: 'Search is not used on Settings',
  support: 'Search is not used on Support',
};

const searchableModules: ModuleKey[] = ['stalls', 'tenants', 'applicants', 'utilities', 'violations', 'logbook'];

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
    stallType: raw.stallType,
    status: raw.status,
    dateApplied: raw.dateApplied,
    requirements,
  };
}

function mergeState(input: unknown): AppState {
  const parsed = (input && typeof input === 'object' ? input : {}) as Partial<AppState>;
  const pick = <K extends keyof AppState>(key: K): AppState[K] =>
    (Array.isArray(parsed[key]) ? parsed[key] : initialState[key]) as AppState[K];
  return {
    applicants: pick('applicants').map(normalizeApplicant),
    tenants: pick('tenants').map((t) => ({ ...t, phone: typeof t?.phone === 'string' && t.phone ? t.phone : '—' })),
    logs: pick('logs').map((l) => ({ ...l, date: typeof l?.date === 'string' ? l.date : '' })),
    activities: pick('activities').slice(0, MAX_ACTIVITIES),
    stalls: pick('stalls'),
    violations: pick('violations').map((v) => ({
      ...v,
      points: Math.max(0, Number(v?.points) || 0),
      dateRecorded: typeof v?.dateRecorded === 'string' ? v.dateRecorded : '',
      dateResolved: typeof v?.dateResolved === 'string' ? v.dateResolved : '',
      notes: typeof v?.notes === 'string' ? v.notes : '',
    })),
    utilities: pick('utilities'),
  };
}

function readState(): AppState {
  const raw = localStorage.getItem(storageKey);
  if (!raw) return initialState;
  try { return mergeState(JSON.parse(raw)); } catch { return initialState; }
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

function deriveStatus(current: ApplicantStatus, requirements: string[]): ApplicantStatus {
  if (current === 'Approved' || current === 'Rejected') return current;
  return REQUIREMENTS.every((r) => requirements.includes(r)) ? 'Pending Review' : 'Incomplete';
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

function readIdCounters(): Record<string, number> {
  try {
    const parsed = JSON.parse(localStorage.getItem(idCounterKey) ?? '{}');
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, number>) : {};
  } catch { return {}; }
}

function resetIdCounters() {
  try { localStorage.removeItem(idCounterKey); } catch { /* storage unavailable — max(existing) still applies */ }
}

function nextId(prefix: string, existingIds: string[]) {
  const nums = existingIds.map((id) => parseInt(id.replace(/\D/g, ''), 10)).filter((n) => !isNaN(n));
  const maxExisting = nums.length > 0 ? Math.max(...nums) : 0;
  const counters = readIdCounters();
  const previous = typeof counters[prefix] === 'number' ? counters[prefix] : 0;
  const next = Math.max(maxExisting, previous) + 1;
  counters[prefix] = next;
  try { localStorage.setItem(idCounterKey, JSON.stringify(counters)); } catch { /* falls back to max(existing) next time */ }
  return `${prefix}-${String(next).padStart(3, '0')}`;
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

function todayStr() {
  return new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function nowTimeStr() {
  return new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
}

/* ---------- Utility billing helpers ---------- */

function isoDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function todayIso() {
  return isoDate(new Date());
}

function isoDatePlusDays(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return isoDate(d);
}

function formatIsoDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso || '—';
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function currentPeriod() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function formatPeriod(period: string) {
  const [y, m] = period.split('-').map(Number);
  if (!y || !m) return period || '—';
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function computeBill(previousReading: number, currentReading: number, rate: number, fixedCharge: number) {
  const consumption = Math.max(0, currentReading - previousReading);
  const usageCharge = consumption * rate;
  const amount = Math.round((usageCharge + fixedCharge) * 100) / 100;
  return { consumption, usageCharge, amount };
}

function isOverdue(bill: UtilityBill) {
  return bill.status === 'Unpaid' && !!bill.dueDate && bill.dueDate < todayIso();
}

function lastReadingFor(bills: UtilityBill[], stallId: string, type: UtilityType) {
  const matches = bills
    .filter((b) => b.stallId === stallId && b.type === type)
    .sort((a, b) => a.period.localeCompare(b.period));
  return matches.length > 0 ? matches[matches.length - 1].currentReading : null;
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

function App() {
  const [active, setActive] = useState<ModuleKey>('dashboard');
  const [state, setState] = useState<AppState>(() => readState());
  const [searchTerm, setSearchTerm] = useState('');
  const [modal, setModal] = useState<{ type: ModalType; data?: unknown }>({ type: null });
  const [toasts, setToasts] = useState<Array<{ id: number; message: string }>>([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const toastSeq = useRef(0);

  const [lastSaved, setLastSaved] = useState<string>(() => localStorage.getItem(savedAtKey) ?? '');
  const storageWarned = useRef(false);

  const showToast = useCallback((message: string) => {
    const id = ++toastSeq.current;
    setToasts((prev) => [...prev, { id, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3000);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
      const stamp = new Date().toISOString();
      localStorage.setItem(savedAtKey, stamp);
      setLastSaved(stamp);
      storageWarned.current = false;
    } catch {
      if (!storageWarned.current) {
        storageWarned.current = true;
        showToast('Could not save to browser storage — export a backup from Support.');
      }
    }
  }, [state, showToast]);

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

  const withActivity = (list: ActivityItem[], icon: string, iconColor: string, highlight: string, text: string): ActivityItem[] =>
    [{ id: `ACT-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, icon, iconColor, highlight, text, time: 'Just now' }, ...list].slice(0, MAX_ACTIVITIES);

  const makeLog = (existing: LogEntry[], type: string, details: string): LogEntry =>
    ({ id: nextId('LOG', existing.map((l) => l.id)), date: todayIso(), time: nowTimeStr(), type, details });

  const addStall = (stall: Stall) => { setState((p) => ({ ...p, stalls: [...p.stalls, stall], activities: withActivity(p.activities, 'storefront', 'blue', stall.id, ` added as new stall in ${stall.section}.`) })); showToast(`Stall ${stall.id} added successfully`); closeModal(); };
  const addApplicant = (app: Applicant) => { setState((p) => ({ ...p, applicants: [...p.applicants, app], activities: withActivity(p.activities, 'person_add', 'green', app.name, ` applied for ${app.stallType} stall.`) })); showToast(`Applicant ${app.name} added successfully`); closeModal(); };
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
      logs: [...p.logs, makeLog(p.logs, 'Collection', `${bill.type} bill ${bill.id} (${formatPeriod(bill.period)}) issued to stall ${bill.stallId}${bill.tenantName ? ` — ${bill.tenantName}` : ''}: ${money(bill.amount)}.`)],
    }));
    showToast(`${bill.type} bill ${bill.id} saved to stall ${bill.stallId}`);
  };

  const toggleBillStatus = (id: string) => {
    setState((p) => ({ ...p, utilities: p.utilities.map((b) => (b.id === id ? { ...b, status: b.status === 'Paid' ? 'Unpaid' : 'Paid' } : b)) }));
    const bill = state.utilities.find((b) => b.id === id);
    showToast(bill?.status === 'Paid' ? `${id} marked as unpaid` : `${id} marked as paid`);
  };

  const updateApplicant = (updated: Applicant) => {
    const previous = state.applicants.find((a) => a.id === updated.id);
    setState((p) => ({
      ...p,
      applicants: p.applicants.map((a) => (a.id === updated.id ? updated : a)),
      ...(previous && previous.status !== updated.status
        ? {
            activities: withActivity(p.activities, 'person_add', updated.status === 'Approved' ? 'green' : updated.status === 'Rejected' ? 'red' : 'amber', updated.name, `'s application was marked ${updated.status}.`),
            logs: [...p.logs, makeLog(p.logs, 'Announcement', `Application ${updated.id} (${updated.name}) changed from ${previous.status} to ${updated.status}.`)],
          }
        : {}),
    }));
    const justApproved = previous && previous.status !== 'Approved' && updated.status === 'Approved';
    showToast(previous && previous.status !== updated.status ? `${updated.name} marked as ${updated.status}` : `${updated.name} updated`);
    if (justApproved) setModal({ type: 'assign-stall', data: updated });
    else closeModal();
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

  const updateViolation = (updated: Violation) => {
    const previous = state.violations.find((v) => v.id === updated.id);
    const statusChanged = previous && previous.status !== updated.status;
    setState((p) => ({
      ...p,
      violations: p.violations.map((v) => (v.id === updated.id ? updated : v)),
      ...(statusChanged
        ? {
            activities: withActivity(p.activities, 'gavel', updated.status === 'Resolved' ? 'green' : 'red', updated.tenant, `'s violation ${updated.id} was marked ${updated.status}.`),
            logs: [...p.logs, makeLog(p.logs, 'Incident', `Violation ${updated.id} (${updated.tenant}) changed from ${previous.status} to ${updated.status}.`)],
          }
        : {}),
    }));
    showToast(statusChanged ? `${updated.id} marked as ${updated.status}` : `Violation ${updated.id} updated`);
    closeModal();
  };

  const toggleViolationStatus = (id: string) => {
    const current = state.violations.find((v) => v.id === id);
    if (!current) return;
    updateViolation(current.status === 'Open'
      ? { ...current, status: 'Resolved', dateResolved: todayIso() }
      : { ...current, status: 'Open', dateResolved: '' });
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

  const updateTenant = (updated: Tenant) => {
    const previous = state.tenants.find((t) => t.id === updated.id);
    const oldStallId = previous?.stallId ?? '';
    const movedStall = oldStallId !== updated.stallId;
    setState((p) => ({
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
      activities: withActivity(p.activities, 'groups', 'blue', updated.name, `'s tenant record was updated.`),
      logs: [...p.logs, makeLog(p.logs, 'Announcement', `Tenant ${updated.id} (${updated.name}) was updated${movedStall ? `; stall changed from ${oldStallId || '—'} to ${updated.stallId || '—'}` : ''}.`)],
    }));
    showToast(`Tenant ${updated.name} updated`);
    closeModal();
  };

  const updateStall = (updated: Stall) => {
    setState((p) => {
      const occupant = p.tenants.find((t) => t.stallId === updated.id);
      return {
        ...p,
        stalls: p.stalls.map((s) => (s.id === updated.id ? updated : s)),
        tenants: occupant && occupant.section !== updated.section
          ? p.tenants.map((t) => (t.id === occupant.id ? { ...t, section: updated.section } : t))
          : p.tenants,
        activities: withActivity(p.activities, 'storefront', 'blue', updated.id, ' was updated in stall management.'),
        logs: [...p.logs, makeLog(p.logs, 'Maintenance', `Stall ${updated.id} was updated — ${updated.section}, ${updated.status}, tenant: ${updated.tenant}.`)],
      };
    });
    showToast(`Stall ${updated.id} updated`);
    closeModal();
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

  const resetData = () => { localStorage.removeItem(storageKey); resetIdCounters(); setState(initialState); showToast('Data reset to defaults'); closeModal(); };

  const handleNewEntry = () => {
    const map: Partial<Record<ModuleKey, ModalType>> = {
      stalls: 'add-stall', applicants: 'add-applicant', tenants: 'add-tenant',
      violations: 'add-violation', logbook: 'add-log', dashboard: 'add-log',
    };
    if (active === 'utilities') { setActive('utilities'); showToast('Use the calculator below to issue a new bill'); return; }
    setModal({ type: map[active] || 'add-log' });
  };

  const handleLogout = () => setModal({ type: 'confirm-logout' });

  const downloadReport = () => {
    downloadJSON({ generatedAt: new Date().toISOString(), summary: { tenants: state.tenants.length, applicants: state.applicants.length, stalls: state.stalls.length }, data: state }, 'civic-market-core-report.json');
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
          <div className="search-wrapper">
            <span className="material-symbols-outlined">search</span>
            <input className="search-input" type="text" placeholder={searchPlaceholders[active]} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} disabled={!searchableModules.includes(active)} />
            {searchTerm && <button className="search-clear" title="Clear search" onClick={() => setSearchTerm('')}><span className="material-symbols-outlined">close</span></button>}
          </div>
          <div className="topbar-actions">
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
            <button className="btn-primary" onClick={handleNewEntry}><span className="material-symbols-outlined">add</span>New Entry</button>
          </div>
        </header>

        <div className="page-content">
          {active === 'dashboard' && <DashboardPage state={state} occupiedCount={occupiedCount} pendingApplicants={pendingApplicants} outstandingUtilities={outstandingUtilities} unpaidBillCount={unpaidBills.length} onNavigate={setActive} />}
          {active === 'utilities' && <UtilityBillingPage bills={state.utilities} tenants={state.tenants} stalls={state.stalls} search={searchTerm} onAdd={addBill} onView={(b) => setModal({ type: 'view-bill', data: b })} onToggleStatus={toggleBillStatus} onDelete={(b) => setModal({ type: 'confirm-delete-bill', data: b })} onExport={() => { downloadCSV(['Bill ID','Type','Stall','Tenant','Section','Period','Previous','Current','Consumption','Rate','Fixed Charge','Amount','Status','Issued','Due'], state.utilities.map((b) => [b.id, b.type, b.stallId, b.tenantName || '—', b.section || '—', formatPeriod(b.period), String(b.previousReading), String(b.currentReading), String(b.consumption), String(b.rate), String(b.fixedCharge), b.amount.toFixed(2), b.status, formatIsoDate(b.dateIssued), formatIsoDate(b.dueDate)]), 'utility-bills.csv'); showToast('Utility bills exported'); }} />}
          {active === 'stalls' && <StallManagementPage stalls={state.stalls} occupiedCount={occupiedCount} availableCount={availableCount} maintenanceCount={maintenanceCount} search={searchTerm} onAdd={() => setModal({ type: 'add-stall' })} onView={(s) => setModal({ type: 'view-stall', data: s })} onDelete={(s) => setModal({ type: 'confirm-delete-stall', data: s })} />}
          {active === 'tenants' && <TenantRecordsPage tenants={state.tenants} search={searchTerm} onAdd={() => setModal({ type: 'add-tenant' })} onView={(t) => setModal({ type: 'view-tenant', data: t })} onDelete={(t) => setModal({ type: 'confirm-delete-tenant', data: t })} />}
          {active === 'applicants' && <ApplicantManagementPage applicants={state.applicants} pendingApplicants={pendingApplicants} incompleteApplicants={incompleteApplicants} approvedApplicants={approvedApplicants} search={searchTerm} onAdd={() => setModal({ type: 'add-applicant' })} onView={(a) => setModal({ type: 'view-applicant', data: a })} onDelete={(a) => setModal({ type: 'confirm-delete-applicant', data: a })} />}
          {active === 'violations' && <ViolationsPage violations={state.violations} search={searchTerm} onAdd={() => setModal({ type: 'add-violation' })} onView={(v) => setModal({ type: 'view-violation', data: v })} onToggleStatus={toggleViolationStatus} onDelete={(v) => setModal({ type: 'confirm-delete-violation', data: v })} onExport={() => { downloadCSV(['Violation ID','Tenant','Issue','Points','Status','Date Recorded','Date Resolved','Notes'], state.violations.map((v) => [v.id, v.tenant, v.issue, String(v.points), v.status, v.dateRecorded ? formatIsoDate(v.dateRecorded) : '—', v.dateResolved ? formatIsoDate(v.dateResolved) : '—', v.notes]), 'violations.csv'); showToast('Violations exported'); }} />}
          {active === 'analytics' && <AnalyticsPage state={state} occupiedCount={occupiedCount} availableCount={availableCount} maintenanceCount={maintenanceCount} onExport={downloadReport} onNavigate={setActive} />}
          {active === 'logbook' && <LogbookPage logs={state.logs} search={searchTerm} onAdd={() => setModal({ type: 'add-log' })} onDelete={(l) => setModal({ type: 'confirm-delete-log', data: l })} onExport={() => { downloadCSV(['Date','Time','Type','Details'], state.logs.map(l => [l.date ? formatIsoDate(l.date) : '—', l.time, l.type, l.details]), 'logbook.csv'); showToast('Log exported'); }} />}
          {active === 'settings' && <SettingsPage state={state} lastSaved={lastSaved} onReset={() => setModal({ type: 'confirm-reset' })} onExport={downloadReport} />}
          {active === 'support' && <SupportPage state={state} onRestore={(data: AppState) => { setState(data); showToast('Data restored successfully from backup'); }} onBackup={() => { downloadJSON(state, `pmrms-backup-${new Date().toISOString().slice(0,10)}.json`); showToast('Backup downloaded successfully'); }} />}
        </div>
      </main>

      {modal.type === 'add-stall' && <Modal title="Add New Stall" onClose={closeModal}><AddStallForm existingIds={state.stalls.map(s => s.id)} onSubmit={addStall} onCancel={closeModal} /></Modal>}
      {modal.type === 'add-applicant' && <Modal title="Add New Applicant" onClose={closeModal}><AddApplicantForm existingIds={state.applicants.map(a => a.id)} onSubmit={addApplicant} onCancel={closeModal} /></Modal>}
      {modal.type === 'add-tenant' && <Modal title="Add New Tenant" onClose={closeModal}><AddTenantForm existingIds={state.tenants.map(t => t.id)} stalls={state.stalls} tenants={state.tenants} onSubmit={addTenant} onCancel={closeModal} /></Modal>}
      {modal.type === 'assign-stall' && <Modal title="Assign Stall & Create Tenant" wide onClose={closeModal}><AssignStallForm applicant={modal.data as Applicant} stalls={state.stalls} tenants={state.tenants} onSubmit={addTenant} onSkip={closeModal} /></Modal>}
      {modal.type === 'add-log' && <Modal title="Add Log Entry" onClose={closeModal}><AddLogForm existingIds={state.logs.map(l => l.id)} onSubmit={addLog} onCancel={closeModal} /></Modal>}
      {modal.type === 'add-violation' && <Modal title="Record a Violation" wide onClose={closeModal}><ViolationForm existingIds={state.violations.map(v => v.id)} tenants={state.tenants} onSubmit={addViolation} onCancel={closeModal} /></Modal>}
      {modal.type === 'view-violation' && <Modal title="Violation Details" wide onClose={closeModal}><ViolationForm violation={modal.data as Violation} existingIds={state.violations.map(v => v.id)} tenants={state.tenants} onSubmit={updateViolation} onCancel={closeModal} /></Modal>}
      {modal.type === 'view-stall' && <Modal title="Stall Details" wide onClose={closeModal}><StallDetailView stall={modal.data as Stall} occupant={state.tenants.find((t) => t.stallId === (modal.data as Stall).id)} bills={state.utilities.filter((b) => b.stallId === (modal.data as Stall).id)} onSave={updateStall} onClose={closeModal} /></Modal>}
      {modal.type === 'view-applicant' && <Modal title="Review Applicant" wide onClose={closeModal}><ApplicantDetailView applicant={modal.data as Applicant} onSave={updateApplicant} onClose={closeModal} /></Modal>}
      {modal.type === 'view-tenant' && <Modal title="Tenant Details" wide onClose={closeModal}><TenantDetailView tenant={modal.data as Tenant} tenants={state.tenants} stalls={state.stalls} bills={state.utilities.filter((b) => b.tenantId === (modal.data as Tenant).id || b.stallId === (modal.data as Tenant).stallId)} onSave={updateTenant} onClose={closeModal} /></Modal>}
      {modal.type === 'view-bill' && <Modal title="Utility Bill Details" wide onClose={closeModal}><BillDetailView bill={modal.data as UtilityBill} onToggleStatus={toggleBillStatus} onClose={closeModal} /></Modal>}
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

function DashboardPage({ state, occupiedCount, pendingApplicants, outstandingUtilities, unpaidBillCount, onNavigate }: { state: AppState; occupiedCount: number; pendingApplicants: number; outstandingUtilities: number; unpaidBillCount: number; onNavigate: (k: ModuleKey) => void }) {
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

  const sections = Array.from(new Set(state.stalls.map(s => s.section)));

  return (
    <>
      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-header"><span className="stat-label">Total Stalls</span><span className="material-symbols-outlined stat-icon">grid_view</span></div>
          <div className="stat-value">{state.stalls.length}</div>
          <div className="stat-caption">{occupiedCount} Occupied, {availableCount} Available{maintenanceCount > 0 ? `, ${maintenanceCount} Maintenance` : ''}</div>
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
      <div className="dashboard-grid">
        <div className="panel">
          <div className="panel-header"><h3 className="panel-title">Stall Occupancy Overview</h3><button className="btn-outline-sm" onClick={() => onNavigate('analytics')}>View Analytics</button></div>
          <div className="chart-container">{sections.map((sec) => { const total = state.stalls.filter(s => s.section === sec).length; const occ = state.stalls.filter(s => s.section === sec && s.status === 'Occupied').length; const h = total > 0 ? (occ / total) * 100 : 0; return (<div className="chart-bar-group" key={sec}><div className="chart-bar" style={{ height: `${Math.max(h, 15)}%` }} title={`${occ}/${total}`} /><span className="chart-bar-label">{sec.split(' ')[0]}</span></div>); })}</div>
        </div>
        <div className="panel">
          <div className="panel-header"><h3 className="panel-title">Recent Activity</h3></div>
          <div className="activity-list">
            {state.activities.slice(0, 6).map((act) => (
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

function StallManagementPage({ stalls, occupiedCount, availableCount, maintenanceCount, search, onAdd, onView, onDelete }: { stalls: Stall[]; occupiedCount: number; availableCount: number; maintenanceCount: number; search: string; onAdd: () => void; onView: (s: Stall) => void; onDelete: (s: Stall) => void }) {
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
          <button className="btn-primary" onClick={onAdd}><span className="material-symbols-outlined">add</span>New Stall</button>
        </div>
      </div>
      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-header"><span className="stat-label">Total Stalls</span><span className="material-symbols-outlined stat-icon">grid_view</span></div>
          <div className="stat-value">{stalls.length}</div>
          <div className="stat-caption">{occupiedCount} Occupied, {availableCount} Available</div>
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
      </div>
      <div className="panel">
        <div className="filter-row">
          <select className="filter-select" value={sectionFilter} onChange={(e) => { setSectionFilter(e.target.value); setPage(1); }}><option value="">All Sections</option>{SECTIONS.map(s => <option key={s} value={s}>{s}</option>)}</select>
          <select className="filter-select" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}><option value="">All Statuses</option><option value="Occupied">Occupied</option><option value="Available">Available</option><option value="Maintenance">Maintenance</option></select>
          <span className="table-info">Showing {paged.start}-{paged.end} of {paged.total} stalls</span>
        </div>
        <div className="table-wrap">
          <table className="data-table"><thead><tr><th>Stall ID</th><th>Section</th><th>Tenant</th><th>Status</th><th>Last Inspection</th><th>Action</th></tr></thead>
            <tbody>
              {paged.items.map((s) => (<tr key={s.id}><td><strong>{s.id}</strong></td><td>{s.section}</td><td className={s.status === 'Available' ? 'tenant-cell' : ''}>{s.tenant}</td><td><StatusBadge status={s.status} /></td><td>{s.lastInspection}</td><td><div className="row-actions"><button type="button" className="row-icon-btn" title="View details" aria-label="View details" onClick={() => onView(s)}><span className="material-symbols-outlined">visibility</span></button><button type="button" className="row-icon-btn danger" title="Delete stall" aria-label="Delete stall" onClick={() => onDelete(s)}><span className="material-symbols-outlined">delete</span></button></div></td></tr>))}
              {paged.items.length === 0 && <tr><td colSpan={6}><div className="empty-state"><span className="material-symbols-outlined">storefront</span>No stalls match the current filters.</div></td></tr>}
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

function ApplicantManagementPage({ applicants, pendingApplicants, incompleteApplicants, approvedApplicants, search, onAdd, onView, onDelete }: { applicants: Applicant[]; pendingApplicants: number; incompleteApplicants: number; approvedApplicants: number; search: string; onAdd: () => void; onView: (a: Applicant) => void; onDelete: (a: Applicant) => void }) {
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => { setPage(1); }, [search]);

  const filtered = useMemo(() => applicants.filter((a) => {
    if (statusFilter && a.status !== statusFilter) return false;
    if (search) { const q = search.toLowerCase(); if (!a.name.toLowerCase().includes(q) && !a.phone.includes(q) && !a.stallType.toLowerCase().includes(q)) return false; }
    return true;
  }), [applicants, statusFilter, search]);

  const paged = paginate(filtered, page);

  return (
    <>
      <div className="page-header">
        <div><h2 className="page-title">Applicant Management</h2><p className="page-subtitle">Review stall applications and verify requirement submissions.</p></div>
        <div className="page-actions">
          <button className="btn-outline" onClick={() => setStatusFilter('')}><span className="material-symbols-outlined">tune</span>Clear Filter</button>
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
          <div className="stat-caption">{incompleteApplicants === 0 ? 'All requirements filed' : 'Awaiting requirements'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-header"><span className="stat-label">Approved (This Mo.)</span></div>
          <div className="stat-value">{approvedApplicants}</div>
          <div className="stat-caption">{applicants.filter(a => a.status === 'Rejected').length} Rejected, {applicants.length} Total</div>
        </div>
      </div>
      <div className="panel">
        <div className="filter-row">
          <select className="filter-select" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}><option value="">All Statuses</option><option value="Pending Review">Pending Review</option><option value="Incomplete">Incomplete</option><option value="Approved">Approved</option><option value="Rejected">Rejected</option></select>
          <span className="table-info">Showing {paged.start}-{paged.end} of {paged.total}</span>
        </div>
        <div className="table-wrap">
          <table className="data-table"><thead><tr><th>Applicant Name</th><th>Date Applied</th><th>Stall Type</th><th>Requirements</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {paged.items.map((a, i) => {
                const done = submittedCount(a);
                return (
                  <tr key={a.id}>
                    <td><div className="applicant-cell"><div className={`avatar-initials ${getAvatarColor(i)}`}>{getInitials(a.name)}</div><div className="applicant-info"><div className="name">{a.name}</div><div className="phone">{a.phone}</div></div></div></td>
                    <td>{a.dateApplied}</td>
                    <td>{a.stallType}</td>
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
                    <td><div className="row-actions"><button type="button" className="row-icon-btn" title="Review applicant" aria-label="Review applicant" onClick={() => onView(a)}><span className="material-symbols-outlined">person_search</span></button><button type="button" className="row-icon-btn danger" title="Delete applicant" aria-label="Delete applicant" onClick={() => onDelete(a)}><span className="material-symbols-outlined">delete</span></button></div></td>
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

/* ============================================================
   Tenant Records Page
   ============================================================ */

function TenantRecordsPage({ tenants, search, onAdd, onView, onDelete }: { tenants: Tenant[]; search: string; onAdd: () => void; onView: (t: Tenant) => void; onDelete: (t: Tenant) => void }) {
  const [sectionFilter, setSectionFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);

  const activeCount = tenants.filter(t => t.status === 'Active').length;
  const expiringCount = tenants.filter(t => t.status === 'Expiring Soon').length;
  const monthlyRent = tenants.reduce((s, t) => s + t.rent, 0);

  useEffect(() => { setPage(1); }, [search]);

  const filtered = useMemo(() => tenants.filter((t) => {
    if (sectionFilter && t.section !== sectionFilter) return false;
    if (statusFilter && t.status !== statusFilter) return false;
    if (search) { const q = search.toLowerCase(); if (!t.name.toLowerCase().includes(q) && !t.stallId.toLowerCase().includes(q) && !t.id.toLowerCase().includes(q)) return false; }
    return true;
  }), [tenants, sectionFilter, statusFilter, search]);

  const paged = paginate(filtered, page);

  return (
    <>
      <div className="page-header">
        <div><h2 className="page-title">Tenant Records</h2><p className="page-subtitle">View and manage all tenant information and lease details.</p></div>
        <div className="page-actions">
          <button className="btn-outline" onClick={() => { setSectionFilter(''); setStatusFilter(''); }}><span className="material-symbols-outlined">tune</span>Clear Filters</button>
          <button className="btn-primary" onClick={onAdd}><span className="material-symbols-outlined">add</span>New Tenant</button>
        </div>
      </div>
      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-header"><span className="stat-label">Total Tenants</span><span className="material-symbols-outlined stat-icon">groups</span></div>
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
      </div>
      <div className="panel">
        <div className="filter-row">
          <select className="filter-select" value={sectionFilter} onChange={(e) => { setSectionFilter(e.target.value); setPage(1); }}><option value="">All Sections</option>{SECTIONS.map(s => <option key={s} value={s}>{s}</option>)}</select>
          <select className="filter-select" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}><option value="">All Statuses</option><option value="Active">Active</option><option value="Expiring Soon">Expiring Soon</option></select>
          <span className="table-info">Showing {paged.start}-{paged.end} of {paged.total} tenants</span>
        </div>
        <div className="table-wrap">
          <table className="data-table"><thead><tr><th>Tenant ID</th><th>Name</th><th>Stall ID</th><th>Section</th><th>Monthly Rent</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>
              {paged.items.map((t) => (<tr key={t.id}><td><strong>{t.id}</strong></td><td><div className="applicant-info"><div className="name">{t.name}</div><div className="phone">{t.phone || '—'}</div></div></td><td>{t.stallId}</td><td>{t.section}</td><td>{money(t.rent)}</td><td><TenantStatusBadge status={t.status} /></td><td><div className="row-actions"><button type="button" className="row-icon-btn" title="View details" aria-label="View details" onClick={() => onView(t)}><span className="material-symbols-outlined">visibility</span></button><button type="button" className="row-icon-btn danger" title="Delete tenant" aria-label="Delete tenant" onClick={() => onDelete(t)}><span className="material-symbols-outlined">delete</span></button></div></td></tr>))}
              {paged.items.length === 0 && <tr><td colSpan={7}><div className="empty-state"><span className="material-symbols-outlined">groups</span>No tenants match the current filters.</div></td></tr>}
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

function UtilityBillingPage({ bills, tenants, stalls, search, onAdd, onView, onToggleStatus, onDelete, onExport }: {
  bills: UtilityBill[]; tenants: Tenant[]; stalls: Stall[]; search: string;
  onAdd: (b: UtilityBill) => void; onView: (b: UtilityBill) => void;
  onToggleStatus: (id: string) => void; onDelete: (b: UtilityBill) => void; onExport: () => void;
}) {
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
      if (!b.id.toLowerCase().includes(q) && !b.stallId.toLowerCase().includes(q) && !b.tenantName.toLowerCase().includes(q) && !formatPeriod(b.period).toLowerCase().includes(q)) return false;
    }
    return true;
  }), [bills, typeFilter, statusFilter, search]);

  const paged = paginate(filtered, page);

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
          <div className="stat-caption">{totals.kwh.toLocaleString()} kWh billed</div>
        </div>
        <div className="stat-card">
          <div className="stat-header"><span className="stat-label">Water</span><span className="material-symbols-outlined stat-icon primary">water_drop</span></div>
          <div className="stat-value">{moneyShort(totals.water)}</div>
          <div className="stat-caption">{totals.cubic.toLocaleString()} m³ billed</div>
        </div>
        <div className="stat-card">
          <div className="stat-header"><span className="stat-label">Outstanding</span><span className="material-symbols-outlined stat-icon danger">payments</span></div>
          <div className="stat-value danger">{moneyShort(totals.unpaid)}</div>
          <div className="stat-caption">{totals.unpaidCount} Unpaid, {totals.overdueCount} Overdue</div>
        </div>
      </div>

      <BillCalculator bills={bills} tenants={tenants} stalls={stalls} onAdd={onAdd} />

      <div className="panel" style={{ marginTop: '20px' }}>
        <div className="panel-header"><h3 className="panel-title">Billing Records</h3></div>
        <div className="filter-row">
          <select className="filter-select" value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}><option value="">All Utilities</option>{UTILITY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select>
          <select className="filter-select" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}><option value="">All Statuses</option><option value="Unpaid">Unpaid</option><option value="Paid">Paid</option><option value="Overdue">Overdue</option></select>
          <span className="table-info">Showing {paged.start}-{paged.end} of {paged.total} bills</span>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Bill ID</th><th>Utility</th><th>Stall No.</th><th>Tenant</th><th>Period</th><th>Consumption</th><th>Amount</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>
              {paged.items.map((b) => (
                <tr key={b.id}>
                  <td><strong>{b.id}</strong></td>
                  <td><span className={`utility-tag ${b.type.toLowerCase()}`}><span className="material-symbols-outlined">{UTILITY_PRESETS[b.type].icon}</span>{b.type}</span></td>
                  <td><strong>{b.stallId}</strong></td>
                  <td className={b.tenantName ? '' : 'tenant-cell'}>{b.tenantName || 'Unassigned'}</td>
                  <td>{formatPeriod(b.period)}</td>
                  <td>{b.consumption.toLocaleString()} {UTILITY_PRESETS[b.type].unit}</td>
                  <td><strong>{money(b.amount)}</strong></td>
                  <td><BillStatusBadge bill={b} /></td>
                  <td>
                    <div className="row-actions">
                      <button type="button" className="row-icon-btn" title="View bill" aria-label="View bill" onClick={() => onView(b)}><span className="material-symbols-outlined">visibility</span></button>
                      <button type="button" className="row-icon-btn" title={b.status === 'Paid' ? 'Mark unpaid' : 'Mark paid'} aria-label={b.status === 'Paid' ? 'Mark unpaid' : 'Mark paid'} onClick={() => onToggleStatus(b.id)}><span className="material-symbols-outlined">{b.status === 'Paid' ? 'undo' : 'check_circle'}</span></button>
                      <button type="button" className="row-icon-btn danger" title="Delete bill" aria-label="Delete bill" onClick={() => onDelete(b)}><span className="material-symbols-outlined">delete</span></button>
                    </div>
                  </td>
                </tr>
              ))}
              {paged.items.length === 0 && <tr><td colSpan={9}><div className="empty-state"><span className="material-symbols-outlined">receipt_long</span>No utility bills match the current filters.</div></td></tr>}
            </tbody>
          </table>
        </div>
        <PaginationBar info={`Showing ${paged.start}-${paged.end} of ${paged.total}`} page={paged.page} totalPages={paged.totalPages} onPage={setPage} />
      </div>
    </>
  );
}

function BillCalculator({ bills, tenants, stalls, onAdd }: { bills: UtilityBill[]; tenants: Tenant[]; stalls: Stall[]; onAdd: (b: UtilityBill) => void }) {
  const [type, setType] = useState<UtilityType>('Electricity');
  const [stallId, setStallId] = useState('');
  const [tenantId, setTenantId] = useState('');
  const [period, setPeriod] = useState(currentPeriod());
  const [previous, setPrevious] = useState('');
  const [current, setCurrent] = useState('');
  const [rate, setRate] = useState(String(UTILITY_PRESETS.Electricity.rate));
  const [fixedCharge, setFixedCharge] = useState(String(UTILITY_PRESETS.Electricity.fixedCharge));
  const [dueDate, setDueDate] = useState(isoDatePlusDays(15));
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

  const applyType = (next: UtilityType) => {
    setType(next);
    setRate(String(UTILITY_PRESETS[next].rate));
    setFixedCharge(String(UTILITY_PRESETS[next].fixedCharge));
    const last = stallId ? lastReadingFor(bills, stallId, next) : null;
    setPrevious(last !== null ? String(last) : '');
    setError('');
  };

  const applyStall = (sid: string) => {
    setStallId(sid);
    const t = tenantForStall(sid);
    setTenantId(t ? t.id : '');
    const last = sid ? lastReadingFor(bills, sid, type) : null;
    setPrevious(last !== null ? String(last) : '');
    setError('');
  };

  const applyTenant = (tid: string) => {
    setTenantId(tid);
    const t = tenants.find((x) => x.id === tid);
    if (t && t.stallId && t.stallId !== '—') {
      setStallId(t.stallId);
      const last = lastReadingFor(bills, t.stallId, type);
      setPrevious(last !== null ? String(last) : '');
    }
    setError('');
  };

  const prevNum = toAmount(previous);
  const currNum = toAmount(current);
  const rateNum = toAmount(rate);
  const fixedNum = toAmount(fixedCharge);
  const { consumption, usageCharge, amount } = computeBill(prevNum, currNum, rateNum, fixedNum);
  const readingsInverted = current !== '' && currNum < prevNum;

  const resetForm = () => {
    setCurrent(''); setNotes(''); setError('');
  };

  const handleSave = () => {
    if (!stallId) { setError('Select the stall number this bill belongs to.'); return; }
    if (current === '') { setError('Enter the current meter reading.'); return; }
    if (isNegative(previous) || isNegative(current)) { setError('Meter readings cannot be negative.'); return; }
    if (readingsInverted) { setError('Current reading cannot be lower than the previous reading.'); return; }
    if (rateNum <= 0) { setError('Rate per unit must be greater than zero.'); return; }
    if (isNegative(fixedCharge)) { setError('Fixed / service charge cannot be negative.'); return; }
    if (!period) { setError('Select a billing period.'); return; }

    const duplicate = bills.find((b) => b.stallId === stallId && b.type === type && b.period === period);
    if (duplicate) { setDuplicatePrompt(duplicate); return; }
    commitBill();
  };

  const commitBill = () => {
    setDuplicatePrompt(null);
    const tenant = tenants.find((t) => t.id === tenantId);
    onAdd({
      id: nextId('UTL', bills.map((b) => b.id)),
      type,
      stallId,
      tenantId: tenant?.id ?? '',
      tenantName: tenant?.name ?? '',
      section,
      period,
      previousReading: prevNum,
      currentReading: currNum,
      consumption,
      rate: rateNum,
      fixedCharge: fixedNum,
      amount,
      status: 'Unpaid',
      dateIssued: todayIso(),
      dueDate,
      notes: notes.trim(),
    });

    setPrevious(String(currNum));
    resetForm();
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
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Stall Number *</label>
              <select className="form-select" value={stallId} onChange={(e) => applyStall(e.target.value)}>
                <option value="">Select stall…</option>
                {stallOptions.map((sid) => {
                  const t = tenantForStall(sid);
                  return <option key={sid} value={sid}>{sid}{t ? ` — ${t.name}` : ' — vacant'}</option>;
                })}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Tenant (bill recipient)</label>
              <select className="form-select" value={tenantId} onChange={(e) => applyTenant(e.target.value)}>
                <option value="">No tenant on file — charge the stall</option>
                {tenants.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.stallId})</option>)}
              </select>
              <span className="form-hint">Picking either field fills in the other automatically.</span>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Billing Period</label>
              <input className="form-input" type="month" value={period} onChange={(e) => { setPeriod(e.target.value); setError(''); }} />
            </div>
            <div className="form-group">
              <label className="form-label">Due Date</label>
              <input className="form-input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
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

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Rate per {preset.unit} (₱)</label>
              <input className="form-input" type="number" min="0" step="0.01" value={rate} onChange={(e) => { setRate(e.target.value); setError(''); }} />
            </div>
            <div className="form-group">
              <label className="form-label">Fixed / Service Charge (₱)</label>
              <input className="form-input" type="number" min="0" step="0.01" value={fixedCharge} onChange={(e) => setFixedCharge(e.target.value)} />
            </div>
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
          <div className="calc-row"><span>Billing period</span><strong>{formatPeriod(period)}</strong></div>
          <div className="calc-row"><span>Previous reading</span><strong>{prevNum.toLocaleString()} {preset.unit}</strong></div>
          <div className="calc-row"><span>Current reading</span><strong>{currNum.toLocaleString()} {preset.unit}</strong></div>
          <div className="calc-row highlight"><span>Consumption</span><strong>{consumption.toLocaleString()} {preset.unit}</strong></div>
          <div className="calc-row"><span>{consumption.toLocaleString()} {preset.unit} × {money(rateNum)}</span><strong>{money(usageCharge)}</strong></div>
          <div className="calc-row"><span>Fixed / service charge</span><strong>{money(fixedNum)}</strong></div>
          <div className="calc-total"><span>Total Amount Due</span><strong>{money(amount)}</strong></div>
          <div className="calc-row"><span>Due date</span><strong>{formatIsoDate(dueDate)}</strong></div>
          {error && <div className="calc-error"><span className="material-symbols-outlined">error</span>{error}</div>}
          <div className="calc-actions">
            <button className="btn-outline" onClick={() => { setStallId(''); setTenantId(''); setPrevious(''); setCurrent(''); setNotes(''); setError(''); }}>Clear</button>
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

function ViolationsPage({ violations, search, onAdd, onView, onToggleStatus, onDelete, onExport }: {
  violations: Violation[]; search: string;
  onAdd: () => void; onView: (v: Violation) => void;
  onToggleStatus: (id: string) => void; onDelete: (v: Violation) => void; onExport: () => void;
}) {
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
                      <button type="button" className="row-icon-btn" title={v.status === 'Open' ? 'Resolve violation' : 'Reopen violation'} aria-label={v.status === 'Open' ? 'Resolve violation' : 'Reopen violation'} onClick={() => onToggleStatus(v.id)}><span className="material-symbols-outlined">{v.status === 'Open' ? 'check_circle' : 'replay'}</span></button>
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
          <input className="form-input" list="violation-tenant-options" placeholder="e.g. Deep Blue Catch" value={tenant} onChange={(e) => { setTenant(e.target.value); setError(''); }} />
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

/* ============================================================
   Analytics Page
   ============================================================ */

function AnalyticsPage({ state, occupiedCount, availableCount, maintenanceCount, onExport, onNavigate }: { state: AppState; occupiedCount: number; availableCount: number; maintenanceCount: number; onExport: () => void; onNavigate: (k: ModuleKey) => void }) {
  const sections = useMemo(() => Array.from(new Set(state.stalls.map((s) => s.section))), [state.stalls]);
  const totalStalls = state.stalls.length;

  const activeTenants = useMemo(() => state.tenants.filter(t => t.status === 'Active').length, [state.tenants]);
  const pendingApplicants = useMemo(() => state.applicants.filter(a => a.status === 'Pending Review').length, [state.applicants]);
  const incompleteApplicants = useMemo(() => state.applicants.filter(a => a.status === 'Incomplete').length, [state.applicants]);
  const approvedApplicants = useMemo(() => state.applicants.filter(a => a.status === 'Approved').length, [state.applicants]);
  const rejectedApplicants = useMemo(() => state.applicants.filter(a => a.status === 'Rejected').length, [state.applicants]);
  const openViolations = useMemo(() => state.violations.filter(v => v.status === 'Open').length, [state.violations]);
  const resolvedViolations = useMemo(() => state.violations.filter(v => v.status === 'Resolved').length, [state.violations]);

  const tenantsBySection = useMemo(() => {
    const map: Record<string, number> = {};
    sections.forEach(sec => { map[sec] = state.tenants.filter(t => t.section === sec).length; });
    return map;
  }, [state.tenants, sections]);

  const logCounts = useMemo(() => {
    const map: Record<string, number> = {};
    state.logs.forEach(l => { map[l.type] = (map[l.type] || 0) + 1; });
    return map;
  }, [state.logs]);

  const utilityStats = useMemo(() => {
    const electricity = state.utilities.filter(b => b.type === 'Electricity');
    const water = state.utilities.filter(b => b.type === 'Water');
    const sum = (list: UtilityBill[]) => list.reduce((s, b) => s + b.amount, 0);
    const bySection: Record<string, number> = {};
    state.utilities.forEach(b => { const key = b.section || 'Unassigned'; bySection[key] = (bySection[key] || 0) + b.amount; });
    return {
      electricityTotal: sum(electricity),
      waterTotal: sum(water),
      total: sum(state.utilities),
      paidTotal: sum(state.utilities.filter(b => b.status === 'Paid')),
      unpaidTotal: sum(state.utilities.filter(b => b.status === 'Unpaid')),
      overdueCount: state.utilities.filter(isOverdue).length,
      kwh: electricity.reduce((s, b) => s + b.consumption, 0),
      cubic: water.reduce((s, b) => s + b.consumption, 0),
      bySection,
    };
  }, [state.utilities]);

  return (
    <>
      <div className="page-header">
        <div><h2 className="page-title">Analytics</h2><p className="page-subtitle">Comprehensive operational dashboard and insights.</p></div>
        <div className="page-actions"><button className="btn-primary" onClick={onExport}><span className="material-symbols-outlined">download</span>Export Report</button></div>
      </div>
      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-header"><span className="stat-label">Occupancy Rate</span><span className="material-symbols-outlined stat-icon primary">pie_chart</span></div>
          <div className="stat-value primary">{percent(ratio(occupiedCount, totalStalls))}</div>
          <div className="stat-caption">{occupiedCount} Occupied, {availableCount} Available</div>
          <div className="stat-progress"><div className="stat-progress-fill" style={{ width: `${ratio(occupiedCount, totalStalls)}%` }} /></div>
        </div>
        <div className="stat-card">
          <div className="stat-header"><span className="stat-label">Active Tenants</span><span className="material-symbols-outlined stat-icon success">groups</span></div>
          <div className="stat-value success">{activeTenants}</div>
          <div className="stat-caption">{state.tenants.length} on record, {availableCount} stalls open</div>
        </div>
        <div className="stat-card">
          <div className="stat-header"><span className="stat-label">Pending Applications</span><span className="material-symbols-outlined stat-icon warning">person_add</span></div>
          <div className="stat-value">{pendingApplicants}</div>
          <div className="stat-caption">{incompleteApplicants} Incomplete, {approvedApplicants} Approved</div>
        </div>
        <div className="stat-card">
          <div className="stat-header"><span className="stat-label">Open Violations</span><span className="material-symbols-outlined stat-icon danger">gavel</span></div>
          <div className="stat-value danger">{openViolations}</div>
          <div className="stat-caption">{state.violations.length} total, {state.violations.length - openViolations} Resolved</div>
        </div>
      </div>
      <div className="analytics-grid">
        <div className="panel"><div className="panel-header"><h3 className="panel-title">Stall Status Distribution</h3></div>
          <div className="distribution-row">
            <div className="distribution-item">
              <div className="dist-count">{occupiedCount}</div>
              <div className="dist-label">Occupied</div>
              <div className="dist-bar"><div className="dist-bar-fill occupied" style={{ width: `${totalStalls > 0 ? (occupiedCount / totalStalls) * 100 : 0}%` }} /></div>
            </div>
            <div className="distribution-item">
              <div className="dist-count">{availableCount}</div>
              <div className="dist-label">Available</div>
              <div className="dist-bar"><div className="dist-bar-fill available" style={{ width: `${totalStalls > 0 ? (availableCount / totalStalls) * 100 : 0}%` }} /></div>
            </div>
            <div className="distribution-item">
              <div className="dist-count">{maintenanceCount}</div>
              <div className="dist-label">Maintenance</div>
              <div className="dist-bar"><div className="dist-bar-fill maintenance" style={{ width: `${totalStalls > 0 ? (maintenanceCount / totalStalls) * 100 : 0}%` }} /></div>
            </div>
          </div>
        </div>
        <div className="panel"><div className="panel-header"><h3 className="panel-title">Occupancy by Section</h3></div>
          <div className="chart-container">
            {sections.map((sec) => { const total = state.stalls.filter(s => s.section === sec).length; const occ = state.stalls.filter(s => s.section === sec && s.status === 'Occupied').length; const h = total > 0 ? (occ / total) * 100 : 0; return (<div className="chart-bar-group" key={sec}><div className="chart-bar" style={{ height: `${Math.max(h, 15)}%` }} title={`${occ}/${total}`} /><span className="chart-bar-label">{sec.split(' ')[0]}</span></div>); })}
          </div>
        </div>
        <div className="panel analytics-full"><div className="panel-header"><h3 className="panel-title">Applicant Pipeline</h3></div>
          <div className="distribution-row">
            <div className="distribution-item">
              <div className="dist-count">{pendingApplicants}</div>
              <div className="dist-label">Pending Review</div>
              <div className="dist-bar"><div className="dist-bar-fill pending" style={{ width: `${state.applicants.length > 0 ? (pendingApplicants / state.applicants.length) * 100 : 0}%` }} /></div>
            </div>
            <div className="distribution-item">
              <div className="dist-count">{incompleteApplicants}</div>
              <div className="dist-label">Incomplete</div>
              <div className="dist-bar"><div className="dist-bar-fill incomplete" style={{ width: `${state.applicants.length > 0 ? (incompleteApplicants / state.applicants.length) * 100 : 0}%` }} /></div>
            </div>
            <div className="distribution-item">
              <div className="dist-count">{approvedApplicants}</div>
              <div className="dist-label">Approved</div>
              <div className="dist-bar"><div className="dist-bar-fill approved" style={{ width: `${state.applicants.length > 0 ? (approvedApplicants / state.applicants.length) * 100 : 0}%` }} /></div>
            </div>
            <div className="distribution-item">
              <div className="dist-count">{rejectedApplicants}</div>
              <div className="dist-label">Rejected</div>
              <div className="dist-bar"><div className="dist-bar-fill rejected" style={{ width: `${state.applicants.length > 0 ? (rejectedApplicants / state.applicants.length) * 100 : 0}%` }} /></div>
            </div>
          </div>
          <div className="pipeline-row">
            <div className="pipeline-step"><div className="pipe-count pending">{pendingApplicants}</div><div className="pipe-label">Pending</div></div>
            <div className="pipeline-step"><div className="pipe-count incomplete">{incompleteApplicants}</div><div className="pipe-label">Incomplete</div></div>
            <div className="pipeline-step"><div className="pipe-count approved">{approvedApplicants}</div><div className="pipe-label">Approved</div></div>
            <div className="pipeline-step"><div className="pipe-count rejected">{rejectedApplicants}</div><div className="pipe-label">Rejected</div></div>
          </div>
        </div>
        <div className="panel"><div className="panel-header"><h3 className="panel-title">Tenant Distribution by Section</h3></div>
          <div className="analytics-stats">
            {sections.map(sec => (
              <div className="stat-pill" key={sec}><span>{sec}</span><strong>{tenantsBySection[sec] || 0}</strong></div>
            ))}
          </div>
        </div>
        <div className="panel"><div className="panel-header"><h3 className="panel-title">Violations Summary</h3><button className="btn-outline-sm" onClick={() => onNavigate('violations')}>Manage Violations</button></div>
          <div className="distribution-row">
            <div className="distribution-item">
              <div className="dist-count">{openViolations}</div>
              <div className="dist-label">Open</div>
            </div>
            <div className="distribution-item">
              <div className="dist-count">{resolvedViolations}</div>
              <div className="dist-label">Resolved</div>
            </div>
          </div>
          <div className="violation-list">
            {state.violations.slice(0, 5).map(v => (
              <div className="violation-item" key={v.id}>
                <span className="violation-tenant">{v.tenant}</span>
                <span className="violation-issue">{v.issue}</span>
                <StatusBadge status={v.status} />
              </div>
            ))}
          </div>
        </div>
        <div className="panel analytics-full"><div className="panel-header"><h3 className="panel-title">Utility Consumption & Billing</h3></div>
          <div className="distribution-row">
            <div className="distribution-item">
              <div className="dist-count">{money(utilityStats.electricityTotal)}</div>
              <div className="dist-label">Electricity — {utilityStats.kwh.toLocaleString()} kWh</div>
              <div className="dist-bar"><div className="dist-bar-fill electricity" style={{ width: `${ratio(utilityStats.electricityTotal, utilityStats.total)}%` }} /></div>
            </div>
            <div className="distribution-item">
              <div className="dist-count">{money(utilityStats.waterTotal)}</div>
              <div className="dist-label">Water — {utilityStats.cubic.toLocaleString()} m³</div>
              <div className="dist-bar"><div className="dist-bar-fill water" style={{ width: `${ratio(utilityStats.waterTotal, utilityStats.total)}%` }} /></div>
            </div>
            <div className="distribution-item">
              <div className="dist-count">{money(utilityStats.paidTotal)}</div>
              <div className="dist-label">Collected</div>
              <div className="dist-bar"><div className="dist-bar-fill approved" style={{ width: `${ratio(utilityStats.paidTotal, utilityStats.total)}%` }} /></div>
            </div>
            <div className="distribution-item">
              <div className="dist-count">{money(utilityStats.unpaidTotal)}</div>
              <div className="dist-label">Outstanding{utilityStats.overdueCount > 0 ? ` · ${utilityStats.overdueCount} overdue` : ''}</div>
              <div className="dist-bar"><div className="dist-bar-fill rejected" style={{ width: `${ratio(utilityStats.unpaidTotal, utilityStats.total)}%` }} /></div>
            </div>
          </div>
          <div className="analytics-stats" style={{ marginTop: '4px' }}>
            {Object.entries(utilityStats.bySection).map(([sec, amt]) => (
              <div className="stat-pill" key={sec}><span>{sec}</span><strong>{money(amt)}</strong></div>
            ))}
            {state.utilities.length === 0 && <div className="stat-pill"><span>No utility bills recorded yet</span><strong>—</strong></div>}
          </div>
        </div>
        <div className="panel analytics-full"><div className="panel-header"><h3 className="panel-title">Logbook Activity Summary</h3></div>
          <div className="log-summary-row">
            {['Inspection', 'Incident', 'Maintenance', 'Collection', 'Announcement'].map(type => (
              <div className="log-summary-item" key={type}>
                <span className="material-symbols-outlined">{type === 'Inspection' ? 'search' : type === 'Incident' ? 'report' : type === 'Maintenance' ? 'build' : type === 'Collection' ? 'payments' : 'campaign'}</span>
                <span>{type}</span>
                <strong>{logCounts[type] || 0}</strong>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

/* ============================================================
   Logbook Page
   ============================================================ */

function LogbookPage({ logs, search, onAdd, onDelete, onExport }: { logs: LogEntry[]; search: string; onAdd: () => void; onDelete: (l: LogEntry) => void; onExport: () => void }) {
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
        <div className="page-actions"><button className="btn-outline" onClick={onExport}><span className="material-symbols-outlined">download</span>Export Log</button><button className="btn-primary" onClick={onAdd}><span className="material-symbols-outlined">add</span>New Entry</button></div>
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
        <PaginationBar info={`Showing ${paged.start}-${paged.end} of ${paged.total}`} page={paged.page} totalPages={paged.totalPages} onPage={setPage} />
      </div>
    </>
  );
}

/* ============================================================
   Settings Page
   ============================================================ */

function SettingsPage({ state, lastSaved, onReset, onExport }: { state: AppState; lastSaved: string; onReset: () => void; onExport: () => void }) {
  return (
    <>
      <div className="page-header"><div><h2 className="page-title">Settings</h2><p className="page-subtitle">System configuration and data management.</p></div></div>
      <div className="settings-grid">
        <div className="settings-section">
          <div className="settings-section-header">System Information</div>
          <div className="settings-section-body">
            <div className="settings-item"><span className="settings-item-label">Application</span><span className="settings-item-value">Tanauan Public Market v1.0</span></div>
            <div className="settings-item"><span className="settings-item-label">Storage</span><span className="settings-item-value">Local Browser Storage</span></div>
            <div className="settings-item"><span className="settings-item-label">Total Records</span><span className="settings-item-value">{state.stalls.length + state.tenants.length + state.applicants.length + state.logs.length + state.violations.length + state.utilities.length}</span></div>
            <div className="settings-item"><span className="settings-item-label">Last Saved</span><span className="settings-item-value">{lastSaved ? new Date(lastSaved).toLocaleString() : 'Not yet saved'}</span></div>
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
        <div className="settings-section full">
          <div className="settings-section-header">Data Management</div>
          <div className="settings-section-body">
            <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)', marginBottom: '16px' }}>Export all system data or reset to factory defaults. All data is stored locally in your browser.</p>
            <div className="settings-actions">
              <button className="btn-primary" onClick={onExport}><span className="material-symbols-outlined">download</span>Export All Data</button>
              <button className="btn-danger" onClick={onReset}><span className="material-symbols-outlined">delete_forever</span>Reset to Defaults</button>
            </div>
          </div>
        </div>
      </div>
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
  { q: 'Where is my data stored?', a: 'All data is stored locally in your browser\'s localStorage. It persists across sessions but is not synced to a server.' },
  { q: 'How do I export reports?', a: 'You can export data from the Analytics page or Settings. Reports are available as JSON files. The Logbook page also offers CSV export.' },
  { q: 'How do I backup and restore data?', a: 'Use the "Download Full Backup" button on this Support page to download all system data as a JSON file. To restore on another computer, click "Upload Backup" and select the previously downloaded file. The system will load all data from the backup.' },
];

const contactList = [
  { name: 'Jon Jon Albao', email: 'jonjonalbao65@gmail.com', phone: '+639198451397', avatar: 'JA', color: 'blue' },
  { name: 'Kyra Joyce Tondo', email: 'kyrajoycet@gmail.com', phone: '+639164258038', avatar: 'KT', color: 'teal' },
  { name: 'Shila Mae Marteja', email: 'shilamaemarteja18@gmail.com', phone: '+639854528964', avatar: 'SM', color: 'purple' },
];

function SupportPage({ state, onRestore, onBackup }: { state: AppState; onRestore: (data: AppState) => void; onBackup: () => void }) {
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [restoreStatus, setRestoreStatus] = useState<string>('');

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const parsed = JSON.parse(evt.target?.result as string);
        const requiredKeys: (keyof AppState)[] = ['applicants', 'tenants', 'stalls', 'logs', 'activities'];
        const hasAllKeys = parsed && typeof parsed === 'object' && requiredKeys.every((k) => k in parsed);
        if (!hasAllKeys) {
          setRestoreStatus('Invalid backup file: missing required data fields.');
          setTimeout(() => setRestoreStatus(''), 4000);
          return;
        }
        onRestore(mergeState(parsed));
        setRestoreStatus('Data restored successfully!');
        setTimeout(() => setRestoreStatus(''), 4000);
      } catch {
        setRestoreStatus('Error: Could not parse backup file. Please ensure it is a valid JSON file.');
        setTimeout(() => setRestoreStatus(''), 4000);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

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
                <p className="backup-meta">Current records: {state.stalls.length} stalls · {state.tenants.length} tenants · {state.applicants.length} applicants · {state.utilities.length} utility bills · {state.violations.length} violations · {state.logs.length} logs</p>
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
            <label className="btn-outline upload-btn">
              <span className="material-symbols-outlined">upload_file</span>Upload Backup File
              <input type="file" accept=".json" onChange={handleFileUpload} style={{ display: 'none' }} />
            </label>
          </div>
          {restoreStatus && (
            <div className={`restore-status ${restoreStatus.startsWith('Error') || restoreStatus.startsWith('Invalid') ? 'error' : 'success'}`}>
              <span className="material-symbols-outlined">{restoreStatus.startsWith('Error') || restoreStatus.startsWith('Invalid') ? 'error' : 'check_circle'}</span>
              {restoreStatus}
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
   Modal Component
   ============================================================ */

function Modal({ title, onClose, wide, children }: { title: string; onClose: () => void; wide?: boolean; children: React.ReactNode }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className={`modal-card${wide ? ' wide' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header"><h3>{title}</h3><button className="modal-close" onClick={onClose}><span className="material-symbols-outlined">close</span></button></div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

function ConfirmDialog({ icon, iconStyle, title, description, confirmLabel, confirmDanger, hideConfirm, cancelLabel = 'Cancel', onConfirm, onCancel }: { icon: string; iconStyle: string; title: string; description: string; confirmLabel?: string; confirmDanger?: boolean; hideConfirm?: boolean; cancelLabel?: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '400px' }}>
        <div className="modal-body">
          <div className={`confirm-icon ${iconStyle}`}><span className="material-symbols-outlined">{icon}</span></div>
          <div className="confirm-text"><h4>{title}</h4><p>{description}</p></div>
          <div className="confirm-actions">
            <button className="btn-outline" onClick={onCancel}>{cancelLabel}</button>
            {!hideConfirm && <button className={confirmDanger ? 'btn-danger' : 'btn-primary'} onClick={onConfirm}>{confirmLabel}</button>}
          </div>
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
  const [error, setError] = useState('');

  const handleSubmit = () => {
    if (status === 'Occupied' && !tenant.trim()) {
      setError('Enter the tenant occupying this stall, or set the status to Available.');
      return;
    }
    const typedId = id.trim();
    if (typedId && existingIds.some((existing) => existing.toLowerCase() === typedId.toLowerCase())) {
      setError(`Stall ${typedId} already exists. Use a different stall ID.`);
      return;
    }
    const stallId = typedId || nextId('STL', existingIds);
    onSubmit({ id: stallId, section, tenant: status === 'Available' ? 'Vacant' : (tenant.trim() || 'Vacant'), status, lastInspection: status === 'Available' ? '-' : todayStr() });
  };

  return (
    <div className="form-grid">
      <div className="form-row">
        <div className="form-group"><label className="form-label">Stall ID</label><input className="form-input" placeholder="Auto-generated if empty" value={id} onChange={(e) => { setId(e.target.value); setError(''); }} /></div>
        <div className="form-group"><label className="form-label">Section</label><select className="form-select" value={section} onChange={(e) => setSection(e.target.value)}>{SECTIONS.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
      </div>
      <div className="form-row">
        <div className="form-group"><label className="form-label">Tenant{status === 'Occupied' ? ' *' : ''}</label><input className="form-input" placeholder={status === 'Occupied' ? 'Required for an occupied stall' : 'Leave blank if vacant'} value={tenant} onChange={(e) => { setTenant(e.target.value); setError(''); }} /></div>
        <div className="form-group"><label className="form-label">Status</label><select className="form-select" value={status} onChange={(e) => { setStatus(e.target.value as StallStatus); setError(''); }}><option value="Available">Available</option><option value="Occupied">Occupied</option><option value="Maintenance">Maintenance</option></select></div>
      </div>
      {error && <div className="form-error"><span className="material-symbols-outlined">error</span>{error}</div>}
      <div className="modal-footer" style={{ padding: 0, borderTop: 'none', justifyContent: 'flex-end' }}><button className="btn-outline" onClick={onCancel}>Cancel</button><button className="btn-primary" onClick={handleSubmit}>Add Stall</button></div>
    </div>
  );
}

function RequirementsChecklist({ selected, onChange }: { selected: string[]; onChange: (next: string[]) => void }) {
  const toggle = (req: string) => {
    onChange(selected.includes(req) ? selected.filter((r) => r !== req) : [...selected, req]);
  };
  const done = REQUIREMENTS.filter((r) => selected.includes(r)).length;
  return (
    <div className="form-group">
      <label className="form-label">Requirements Submitted<span className="req-counter">{done} of {REQUIREMENTS.length}</span></label>
      <div className="req-checklist">
        {REQUIREMENTS.map((req) => {
          const checked = selected.includes(req);
          return (
            <label className={`req-check${checked ? ' checked' : ''}`} key={req}>
              <input type="checkbox" checked={checked} onChange={() => toggle(req)} />
              <span className="material-symbols-outlined">{checked ? 'check_box' : 'check_box_outline_blank'}</span>
              <span>{req}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

function AddApplicantForm({ existingIds, onSubmit, onCancel }: { existingIds: string[]; onSubmit: (a: Applicant) => void; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [stallType, setStallType] = useState(STALL_TYPES[0]);
  const [requirements, setRequirements] = useState<string[]>([]);
  const [error, setError] = useState('');

  const handleSubmit = () => {
    if (!name.trim()) { setError('Full name is required.'); return; }
    onSubmit({
      id: nextId('APP', existingIds),
      name: name.trim(),
      phone: phone.trim() || '—',
      stallType,
      status: deriveStatus('Incomplete', requirements),
      dateApplied: todayStr(),
      requirements,
    });
  };

  return (
    <div className="form-grid">
      <div className="form-row">
        <div className="form-group"><label className="form-label">Full Name *</label><input className="form-input" placeholder="e.g. Juan Santos" value={name} onChange={(e) => { setName(e.target.value); setError(''); }} /></div>
        <div className="form-group"><label className="form-label">Phone Number</label><input className="form-input" placeholder="e.g. 0917-123-4567" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
      </div>
      <div className="form-row">
        <div className="form-group"><label className="form-label">Stall Type</label><select className="form-select" value={stallType} onChange={(e) => setStallType(e.target.value)}>{STALL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
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

  const [stallId, setStallId] = useState(vacantStalls[0]?.id ?? '');
  const [name, setName] = useState(applicant.name);
  const [phone, setPhone] = useState(applicant.phone);
  const [section, setSection] = useState(() => vacantStalls[0]?.section ?? SECTIONS[0]);
  const [rent, setRent] = useState(3500);
  const [status, setStatus] = useState('Active');
  const [error, setError] = useState('');

  const duplicate = tenants.find((t) => t.name.trim().toLowerCase() === name.trim().toLowerCase());

  const applyStall = (id: string) => {
    setStallId(id);
    setError('');
    const match = stalls.find((s) => s.id === id);
    if (match && SECTIONS.includes(match.section)) setSection(match.section);
  };

  const handleSubmit = () => {
    if (!name.trim()) { setError('Tenant name is required.'); return; }
    if (!stallId) { setError('Select a stall to assign, or skip for now.'); return; }
    onSubmit({
      id: nextId('TEN', tenants.map((t) => t.id)),
      name: name.trim(),
      phone: phone.trim() || '—',
      stallId,
      section,
      rent,
      status,
      applicantId: applicant.id,
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
            <div className="form-group"><label className="form-label">Phone Number</label><input className="form-input" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
          </div>

          <div className="form-row">
            <div className="form-group"><label className="form-label">Monthly Rent (₱)</label><input className="form-input" type="number" min="0" step="500" value={rent} onChange={(e) => setRent(toAmount(e.target.value))} /></div>
            <div className="form-group"><label className="form-label">Lease Status</label><select className="form-select" value={status} onChange={(e) => setStatus(e.target.value)}><option value="Active">Active</option><option value="Expiring Soon">Expiring Soon</option></select></div>
          </div>

          <div className="form-group"><label className="form-label">Applied For</label><input className="form-input" value={applicant.stallType} disabled /></div>

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
  const [status, setStatus] = useState('Active');
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
    onSubmit({ id: nextId('TEN', existingIds), name: name.trim(), phone: phone.trim() || '—', stallId: trimmedStall || '—', section, rent, status });
  };

  return (
    <div className="form-grid">
      <div className="form-row">
        <div className="form-group"><label className="form-label">Tenant Name *</label><input className="form-input" placeholder="e.g. Maria Santos" value={name} onChange={(e) => { setName(e.target.value); setError(''); }} /></div>
        <div className="form-group"><label className="form-label">Phone Number</label><input className="form-input" placeholder="e.g. 0917-123-4567" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
      </div>
      <div className="form-row">
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
      <div className="form-group"><label className="form-label">Status</label><select className="form-select" value={status} onChange={(e) => setStatus(e.target.value)}><option value="Active">Active</option><option value="Expiring Soon">Expiring Soon</option></select></div>
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

function StallDetailView({ stall, occupant, bills, onSave, onClose }: { stall: Stall; occupant?: Tenant; bills: UtilityBill[]; onSave: (s: Stall) => void; onClose: () => void }) {
  const [section, setSection] = useState(stall.section);
  const [tenant, setTenant] = useState(stall.tenant === 'Vacant' ? '' : stall.tenant);
  const [status, setStatus] = useState<StallStatus>(stall.status);
  const [lastInspection, setLastInspection] = useState(stall.lastInspection);
  const [error, setError] = useState('');

  const locked = !!occupant;

  const handleSave = () => {
    if (!locked && status === 'Occupied' && !tenant.trim()) {
      setError('Enter the tenant occupying this stall, or set the status to Available.');
      return;
    }
    onSave({
      ...stall,
      section,
      tenant: locked ? occupant.name : (status === 'Available' ? 'Vacant' : tenant.trim() || 'Vacant'),
      status: locked ? 'Occupied' : status,
      lastInspection: lastInspection.trim() || '-',
    });
  };

  return (<>
    <div className="form-grid">
      <div className="form-row">
        <div className="form-group"><label className="form-label">Stall ID</label><input className="form-input" value={stall.id} disabled /></div>
        <div className="form-group"><label className="form-label">Section</label><select className="form-select" value={section} onChange={(e) => setSection(e.target.value)}>{[...new Set([stall.section, ...SECTIONS])].map((s) => <option key={s} value={s}>{s}</option>)}</select></div>
      </div>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Tenant{!locked && status === 'Occupied' ? ' *' : ''}</label>
          <input className="form-input" value={locked ? occupant.name : tenant} disabled={locked} placeholder={status === 'Occupied' ? 'Required for an occupied stall' : 'Leave blank if vacant'} onChange={(e) => { setTenant(e.target.value); setError(''); }} />
          {locked && <span className="form-hint">Held by tenant record {occupant.id}. Rename or reassign from Tenant Records.</span>}
        </div>
        <div className="form-group">
          <label className="form-label">Status</label>
          <select className="form-select" value={locked ? 'Occupied' : status} disabled={locked} onChange={(e) => { setStatus(e.target.value as StallStatus); setError(''); }}>
            <option value="Available">Available</option><option value="Occupied">Occupied</option><option value="Maintenance">Maintenance</option>
          </select>
          {locked && <span className="form-hint">Occupied while a tenant record is assigned to it.</span>}
        </div>
      </div>
      <div className="form-group">
        <label className="form-label">Last Inspection</label>
        <div className="form-row" style={{ gap: '10px' }}>
          <input className="form-input" value={lastInspection} placeholder="-" onChange={(e) => setLastInspection(e.target.value)} />
          <button className="btn-outline" type="button" onClick={() => setLastInspection(todayStr())}>Inspected Today</button>
        </div>
      </div>
      {error && <div className="form-error"><span className="material-symbols-outlined">error</span>{error}</div>}
    </div>
    <BillHistory bills={bills} emptyText={`No electricity or water bills have been issued for stall ${stall.id} yet.`} />
    <div className="modal-footer" style={{ padding: '16px 0 0', borderTop: 'none', justifyContent: 'flex-end' }}>
      <button className="btn-outline" onClick={onClose}>Cancel</button>
      <button className="btn-primary" onClick={handleSave}>Save Changes</button>
    </div>
  </>);
}

function ApplicantDetailView({ applicant, onSave, onClose }: { applicant: Applicant; onSave: (a: Applicant) => void; onClose: () => void }) {
  const [name, setName] = useState(applicant.name);
  const [phone, setPhone] = useState(applicant.phone);
  const [stallType, setStallType] = useState(applicant.stallType);
  const [requirements, setRequirements] = useState<string[]>(applicant.requirements);
  const [status, setStatus] = useState<ApplicantStatus>(applicant.status);
  const [error, setError] = useState('');

  const complete = REQUIREMENTS.every((r) => requirements.includes(r));

  const updateRequirements = (next: string[]) => {
    setRequirements(next);
    setStatus((prev) => deriveStatus(prev, next));
  };

  const commit = (nextStatus: ApplicantStatus) => {
    if (!name.trim()) { setError('Applicant name cannot be empty.'); return; }
    onSave({ ...applicant, name: name.trim(), phone: phone.trim() || '—', stallType, requirements, status: nextStatus });
  };

  return (<>
    <div className="form-grid">
      <div className="form-row">
        <div className="form-group"><label className="form-label">Applicant ID</label><input className="form-input" value={applicant.id} disabled /></div>
        <div className="form-group"><label className="form-label">Date Applied</label><input className="form-input" value={applicant.dateApplied} disabled /></div>
      </div>
      <div className="form-row">
        <div className="form-group"><label className="form-label">Full Name *</label><input className="form-input" value={name} onChange={(e) => { setName(e.target.value); setError(''); }} /></div>
        <div className="form-group"><label className="form-label">Phone Number</label><input className="form-input" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
      </div>
      <div className="form-row">
        <div className="form-group"><label className="form-label">Stall Type</label><select className="form-select" value={stallType} onChange={(e) => setStallType(e.target.value)}>{STALL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select></div>
        <div className="form-group">
          <label className="form-label">Status</label>
          <select className="form-select" value={status} onChange={(e) => setStatus(e.target.value as ApplicantStatus)}>
            <option value="Pending Review">Pending Review</option>
            <option value="Incomplete">Incomplete</option>
            <option value="Approved">Approved</option>
            <option value="Rejected">Rejected</option>
          </select>
        </div>
      </div>

      <RequirementsChecklist selected={requirements} onChange={updateRequirements} />
      {!complete && status !== 'Rejected' && (
        <span className="form-hint">{REQUIREMENTS.length - requirements.length} requirement(s) still missing — you can still approve, but the checklist will show it as incomplete.</span>
      )}
      {error && <div className="form-error"><span className="material-symbols-outlined">error</span>{error}</div>}

      <div className="applicant-decision">
        <button className="btn-outline" onClick={onClose}>Cancel</button>
        <div className="applicant-decision-right">
          {applicant.status !== 'Rejected' && <button className="btn-outline-danger" onClick={() => commit('Rejected')}>Reject</button>}
          {applicant.status !== 'Approved' && <button className="btn-outline-success" onClick={() => commit('Approved')}>Approve</button>}
          <button className="btn-primary" onClick={() => commit(status)}>Save Changes</button>
        </div>
      </div>
    </div>
  </>);
}

function TenantDetailView({ tenant, tenants, stalls, bills, onSave, onClose }: { tenant: Tenant; tenants: Tenant[]; stalls: Stall[]; bills: UtilityBill[]; onSave: (t: Tenant) => void; onClose: () => void }) {
  const [name, setName] = useState(tenant.name);
  const [phone, setPhone] = useState(tenant.phone === '—' ? '' : tenant.phone);
  const [stallId, setStallId] = useState(tenant.stallId);
  const [section, setSection] = useState(tenant.section);
  const [rent, setRent] = useState(tenant.rent);
  const [status, setStatus] = useState(tenant.status);
  const [error, setError] = useState('');

  const utilitiesBilled = bills.reduce((s, b) => s + b.amount, 0);

  const stallOptions = useMemo(() => {
    const taken = new Set(tenants.filter((t) => t.id !== tenant.id).map((t) => t.stallId));
    const ids = stalls.filter((s) => !taken.has(s.id) && (s.id === tenant.stallId || s.status === 'Available')).map((s) => s.id);
    if (tenant.stallId && tenant.stallId !== '—' && !ids.includes(tenant.stallId)) ids.unshift(tenant.stallId);
    return ids;
  }, [stalls, tenants, tenant]);

  const applyStall = (value: string) => {
    setStallId(value);
    setError('');
    const match = stalls.find((s) => s.id === value);
    if (match && SECTIONS.includes(match.section)) setSection(match.section);
  };

  const handleSave = () => {
    if (!name.trim()) { setError('Tenant name is required.'); return; }
    const clash = tenants.find((t) => t.id !== tenant.id && t.stallId === stallId && stallId !== '—');
    if (clash) { setError(`Stall ${stallId} is already assigned to ${clash.name}.`); return; }
    onSave({ ...tenant, name: name.trim(), phone: phone.trim() || '—', stallId, section, rent, status });
  };

  return (<>
    <div className="form-grid">
      <div className="form-row">
        <div className="form-group"><label className="form-label">Tenant ID</label><input className="form-input" value={tenant.id} disabled /></div>
        <div className="form-group"><label className="form-label">From Application</label><input className="form-input" value={tenant.applicantId || '—'} disabled /></div>
      </div>
      <div className="form-row">
        <div className="form-group"><label className="form-label">Name *</label><input className="form-input" value={name} onChange={(e) => { setName(e.target.value); setError(''); }} /></div>
        <div className="form-group"><label className="form-label">Phone Number</label><input className="form-input" placeholder="e.g. 0917-123-4567" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
      </div>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Stall ID</label>
          <select className="form-select" value={stallId} onChange={(e) => applyStall(e.target.value)}>
            <option value="—">— No stall assigned</option>
            {stallOptions.map((id) => <option key={id} value={id}>{id}</option>)}
          </select>
          <span className="form-hint">Reassigning releases the old stall and marks the new one Occupied.</span>
        </div>
        <div className="form-group"><label className="form-label">Section</label><select className="form-select" value={section} onChange={(e) => setSection(e.target.value)}>{[...new Set([tenant.section, ...SECTIONS])].map((s) => <option key={s} value={s}>{s}</option>)}</select></div>
      </div>
      <div className="form-row">
        <div className="form-group"><label className="form-label">Monthly Rent (₱)</label><input className="form-input" type="number" min="0" step="500" value={rent} onChange={(e) => setRent(toAmount(e.target.value))} /></div>
        <div className="form-group"><label className="form-label">Status</label><select className="form-select" value={status} onChange={(e) => setStatus(e.target.value)}><option value="Active">Active</option><option value="Expiring Soon">Expiring Soon</option></select></div>
      </div>
      <div className="detail-grid">
        <div className="detail-field"><span className="detail-label">Utilities Billed</span><span className="detail-value">{money(utilitiesBilled)}</span></div>
        <div className="detail-field"><span className="detail-label">Rent + Utilities (to date)</span><span className="detail-value strong">{money(rent + utilitiesBilled)}</span></div>
      </div>
      {error && <div className="form-error"><span className="material-symbols-outlined">error</span>{error}</div>}
    </div>
    <BillHistory bills={bills} emptyText={`No electricity or water bills have been issued to ${tenant.name} yet.`} />
    <div className="modal-footer" style={{ padding: '16px 0 0', borderTop: 'none', justifyContent: 'flex-end' }}>
      <button className="btn-outline" onClick={onClose}>Cancel</button>
      <button className="btn-primary" onClick={handleSave}>Save Changes</button>
    </div>
  </>);
}

/* ============================================================
   Shared Components
   ============================================================ */

function PaginationBar({ info, page, totalPages, onPage }: { info: string; page: number; totalPages: number; onPage: (p: number) => void }) {
  const pages: (number | 'dots')[] = [];
  for (let i = 1; i <= totalPages; i++) {
    if (i <= 3 || i > totalPages - 1 || Math.abs(i - page) <= 1) pages.push(i);
    else if (pages[pages.length - 1] !== 'dots') pages.push('dots');
  }
  return (
    <div className="pagination">
      <span className="pagination-info">{info}</span>
      <button className="page-btn page-btn-nav" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button>
      {pages.map((p, i) => p === 'dots' ? <span className="page-dots" key={`d${i}`}>…</span> : <button key={p} className={`page-btn${p === page ? ' active' : ''}`} onClick={() => onPage(p)}>{p}</button>)}
      <button className="page-btn page-btn-nav" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>Next</button>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    'Occupied': 'badge badge-occupied', 'Available': 'badge badge-available', 'Maintenance': 'badge badge-maintenance',
    'Pending Review': 'badge badge-pending', 'Incomplete': 'badge badge-incomplete', 'Approved': 'badge badge-approved', 'Rejected': 'badge badge-rejected',
    'Active': 'badge badge-active', 'Expiring Soon': 'badge badge-expiring', 'Open': 'badge badge-open', 'Resolved': 'badge badge-resolved',
  };
  return <span className={map[status] || 'badge'}>{status}</span>;
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
                <td>{formatPeriod(b.period)}</td>
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

function BillDetailView({ bill, onToggleStatus, onClose }: { bill: UtilityBill; onToggleStatus: (id: string) => void; onClose: () => void }) {
  const preset = UTILITY_PRESETS[bill.type];
  return (<>
    <div className="detail-grid">
      <div className="detail-field"><span className="detail-label">Bill ID</span><span className="detail-value">{bill.id}</span></div>
      <div className="detail-field"><span className="detail-label">Utility</span><div className="detail-value"><span className={`utility-tag ${bill.type.toLowerCase()}`}><span className="material-symbols-outlined">{preset.icon}</span>{bill.type}</span></div></div>
      <div className="detail-field"><span className="detail-label">Stall Number</span><span className="detail-value">{bill.stallId}</span></div>
      <div className="detail-field"><span className="detail-label">Tenant</span><span className="detail-value">{bill.tenantName || 'Unassigned (charged to stall)'}</span></div>
      <div className="detail-field"><span className="detail-label">Section</span><span className="detail-value">{bill.section || '—'}</span></div>
      <div className="detail-field"><span className="detail-label">Billing Period</span><span className="detail-value">{formatPeriod(bill.period)}</span></div>
      <div className="detail-field"><span className="detail-label">Previous Reading</span><span className="detail-value">{bill.previousReading.toLocaleString()} {preset.unit}</span></div>
      <div className="detail-field"><span className="detail-label">Current Reading</span><span className="detail-value">{bill.currentReading.toLocaleString()} {preset.unit}</span></div>
      <div className="detail-field"><span className="detail-label">Consumption</span><span className="detail-value">{bill.consumption.toLocaleString()} {preset.unit}</span></div>
      <div className="detail-field"><span className="detail-label">Rate</span><span className="detail-value">{money(bill.rate)} / {preset.unit}</span></div>
      <div className="detail-field"><span className="detail-label">Usage Charge</span><span className="detail-value">{money(bill.consumption * bill.rate)}</span></div>
      <div className="detail-field"><span className="detail-label">Fixed / Service Charge</span><span className="detail-value">{money(bill.fixedCharge)}</span></div>
      <div className="detail-field"><span className="detail-label">Date Issued</span><span className="detail-value">{formatIsoDate(bill.dateIssued)}</span></div>
      <div className="detail-field"><span className="detail-label">Due Date</span><span className="detail-value">{formatIsoDate(bill.dueDate)}</span></div>
      <div className="detail-field"><span className="detail-label">Status</span><div className="detail-value"><BillStatusBadge bill={bill} /></div></div>
      <div className="detail-field"><span className="detail-label">Total Amount Due</span><span className="detail-value strong">{money(bill.amount)}</span></div>
      {bill.notes && <div className="detail-field full"><span className="detail-label">Notes</span><span className="detail-value">{bill.notes}</span></div>}
    </div>
    <div className="modal-footer" style={{ padding: '16px 0 0', borderTop: 'none' }}>
      <button className="btn-outline" onClick={onClose}>Close</button>
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

export default App;