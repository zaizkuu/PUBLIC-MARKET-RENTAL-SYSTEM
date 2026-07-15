import { useEffect, useMemo, useState, useCallback } from 'react';

/* ============================================================
   Types
   ============================================================ */

type ModuleKey =
  | 'dashboard'
  | 'stalls'
  | 'tenants'
  | 'applicants'
  | 'analytics'
  | 'logbook'
  | 'settings'
  | 'support';

type ApplicantStatus = 'Pending Review' | 'Incomplete' | 'Approved' | 'Rejected';
type StallStatus = 'Occupied' | 'Available' | 'Maintenance';

type ViolationStatus = 'Open' | 'Resolved';

type ModalType =
  | null
  | 'add-stall' | 'add-applicant' | 'add-tenant' | 'add-log'
  | 'view-stall' | 'view-applicant' | 'view-tenant'
  | 'confirm-logout' | 'confirm-reset';

type Applicant = {
  id: string;
  name: string;
  phone: string;
  stallType: string;
  status: ApplicantStatus;
  dateApplied: string;
  requirementsUploaded: number;
  requirementsTotal: number;
};

type Tenant = {
  id: string;
  name: string;
  stallId: string;
  section: string;
  rent: number;
  status: string;
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
};



type LogEntry = {
  id: string;
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
const SECTIONS = ['Meat & Poultry', 'Fish & Seafood', 'Vegetables & Fruits', 'Dry Goods'];
const STALL_TYPES = ['Produce (Wet)', 'Dry Goods', 'Vegetables', 'Fish & Seafood', 'Meat & Poultry'];
const LOG_TYPES = ['Inspection', 'Incident', 'Maintenance', 'Collection', 'Announcement'];
const storageKey = 'pmrms-state-v3';

/* ============================================================
   Initial Data
   ============================================================ */

const initialState = {
  applicants: [
    { id: 'APP-001', name: 'Juan Santos', phone: '0917-123-4567', stallType: 'Produce (Wet)', status: 'Pending Review' as ApplicantStatus, dateApplied: 'Oct 12, 2023', requirementsUploaded: 4, requirementsTotal: 4 },
    { id: 'APP-002', name: 'Maria Reyes', phone: '0920-987-6543', stallType: 'Dry Goods', status: 'Incomplete' as ApplicantStatus, dateApplied: 'Oct 14, 2023', requirementsUploaded: 2, requirementsTotal: 4 },
    { id: 'APP-003', name: 'Liza Cruz', phone: '0918-555-1234', stallType: 'Vegetables', status: 'Approved' as ApplicantStatus, dateApplied: 'Oct 10, 2023', requirementsUploaded: 4, requirementsTotal: 4 },
    { id: 'APP-004', name: 'Pedro Garcia', phone: '0915-333-7890', stallType: 'Fish & Seafood', status: 'Pending Review' as ApplicantStatus, dateApplied: 'Oct 16, 2023', requirementsUploaded: 3, requirementsTotal: 4 },
    { id: 'APP-005', name: 'Ana Villanueva', phone: '0922-444-5678', stallType: 'Meat & Poultry', status: 'Rejected' as ApplicantStatus, dateApplied: 'Oct 8, 2023', requirementsUploaded: 1, requirementsTotal: 4 },
  ] satisfies Applicant[],
  tenants: [
    { id: 'TEN-001', name: 'Maria Santos', stallId: 'A-001', section: 'Meat & Poultry', rent: 5000, status: 'Active' },
    { id: 'TEN-002', name: 'Juan Dela Cruz', stallId: 'A-002', section: 'Fish & Seafood', rent: 4500, status: 'Active' },
    { id: 'TEN-003', name: 'Liza Reyes', stallId: 'B-015', section: 'Dry Goods', rent: 3500, status: 'Active' },
    { id: 'TEN-004', name: "Rosa's Butchery", stallId: 'M-101', section: 'Meat & Poultry', rent: 5500, status: 'Active' },
    { id: 'TEN-005', name: 'Green Farm Organics', stallId: 'V-045', section: 'Vegetables & Fruits', rent: 4000, status: 'Active' },
    { id: 'TEN-006', name: 'Deep Blue Catch', stallId: 'F-012', section: 'Fish & Seafood', rent: 4200, status: 'Expiring Soon' },
    { id: 'TEN-007', name: 'Santos General Store', stallId: 'D-203', section: 'Dry Goods', rent: 3800, status: 'Active' },
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
    { id: 'VIO-001', tenant: 'Juan Santos', issue: 'Late document submission', status: 'Open' as ViolationStatus, points: 1 },
    { id: 'VIO-002', tenant: 'Liza Reyes', issue: 'Improper stall cleanup', status: 'Resolved' as ViolationStatus, points: 2 },
    { id: 'VIO-003', tenant: 'Deep Blue Catch', issue: 'Health code violation', status: 'Open' as ViolationStatus, points: 3 },
  ] satisfies Violation[],

  logs: [
    { id: 'LOG-001', time: '08:15 AM', type: 'Inspection', details: 'Morning walkthrough for Section A completed.' },
    { id: 'LOG-002', time: '09:42 AM', type: 'Incident', details: 'Vendor boundary dispute resolved between M-101 and M-102.' },
    { id: 'LOG-003', time: '11:05 AM', type: 'Maintenance', details: 'Leaking pipe reported in Restroom C — plumber dispatched.' },
    { id: 'LOG-004', time: '01:30 PM', type: 'Collection', details: 'Monthly rent collected from Section D tenants.' },
    { id: 'LOG-005', time: '03:15 PM', type: 'Inspection', details: 'Fire safety equipment inspection for Zones B and C.' },
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
  { key: 'analytics', label: 'Analytics', icon: 'analytics' },
  { key: 'logbook', label: 'Logbook', icon: 'menu_book' },
];

/* ============================================================
   Helpers
   ============================================================ */

function readState(): AppState {
  const raw = localStorage.getItem(storageKey);
  if (!raw) return initialState;
  try { return JSON.parse(raw) as AppState; } catch { return initialState; }
}

function money(value: number) {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 2 }).format(value);
}

function moneyShort(value: number) {
  if (value >= 1000) return `₱${(value / 1000).toFixed(0)}K`;
  return money(value);
}

function percent(value: number) {
  return `${value.toFixed(1)}%`;
}

function getInitials(name: string) {
  return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
}

const avatarColors = ['blue', 'teal', 'purple', 'rose', 'amber'];
function getAvatarColor(i: number) { return avatarColors[i % avatarColors.length]; }

function nextId(prefix: string, existingIds: string[]) {
  const nums = existingIds.map((id) => parseInt(id.replace(/\D/g, ''), 10)).filter((n) => !isNaN(n));
  const max = nums.length > 0 ? Math.max(...nums) : 0;
  return `${prefix}-${String(max + 1).padStart(3, '0')}`;
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

function downloadJSON(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function downloadCSV(headers: string[], rows: string[][], filename: string) {
  const csv = [headers.join(','), ...rows.map((r) => r.map((c) => `"${c}"`).join(','))].join('\n');
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

  useEffect(() => { localStorage.setItem(storageKey, JSON.stringify(state)); }, [state]);

  const showToast = useCallback((message: string) => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3000);
  }, []);

  const closeModal = useCallback(() => setModal({ type: null }), []);

  // Computed values
  const occupiedCount = useMemo(() => state.stalls.filter((s) => s.status === 'Occupied').length, [state.stalls]);
  const availableCount = useMemo(() => state.stalls.filter((s) => s.status === 'Available').length, [state.stalls]);
  const maintenanceCount = useMemo(() => state.stalls.filter((s) => s.status === 'Maintenance').length, [state.stalls]);
  const pendingApplicants = useMemo(() => state.applicants.filter((a) => a.status === 'Pending Review').length, [state.applicants]);
  const incompleteApplicants = useMemo(() => state.applicants.filter((a) => a.status === 'Incomplete').length, [state.applicants]);
  const approvedApplicants = useMemo(() => state.applicants.filter((a) => a.status === 'Approved').length, [state.applicants]);

  // CRUD handlers
  const addStall = (stall: Stall) => { setState((p) => ({ ...p, stalls: [...p.stalls, stall], activities: [{ id: `ACT-${Date.now()}`, icon: 'storefront', iconColor: 'blue', highlight: stall.id, text: ` added as new stall in ${stall.section}.`, time: 'Just now' }, ...p.activities] })); showToast(`Stall ${stall.id} added successfully`); closeModal(); };
  const addApplicant = (app: Applicant) => { setState((p) => ({ ...p, applicants: [...p.applicants, app], activities: [{ id: `ACT-${Date.now()}`, icon: 'person_add', iconColor: 'green', highlight: app.name, text: ` applied for ${app.stallType} stall.`, time: 'Just now' }, ...p.activities] })); showToast(`Applicant ${app.name} added successfully`); closeModal(); };
  const addTenant = (t: Tenant) => { setState((p) => ({ ...p, tenants: [...p.tenants, t], activities: [{ id: `ACT-${Date.now()}`, icon: 'groups', iconColor: 'blue', highlight: t.name, text: ` added as tenant at stall ${t.stallId}.`, time: 'Just now' }, ...p.activities] })); showToast(`Tenant ${t.name} added successfully`); closeModal(); };
  const addLog = (l: LogEntry) => { setState((p) => ({ ...p, logs: [...p.logs, l] })); showToast('Log entry added'); closeModal(); };

  const resetData = () => { localStorage.removeItem(storageKey); setState(initialState); showToast('Data reset to defaults'); closeModal(); };

  const handleNewEntry = () => {
    const map: Partial<Record<ModuleKey, ModalType>> = {
      stalls: 'add-stall', applicants: 'add-applicant', tenants: 'add-tenant',
      logbook: 'add-log', dashboard: 'add-log',
    };
    setModal({ type: map[active] || 'add-log' });
  };

  const handleLogout = () => setModal({ type: 'confirm-logout' });

  const downloadReport = () => {
    downloadJSON({ generatedAt: new Date().toISOString(), summary: { tenants: state.tenants.length, applicants: state.applicants.length, stalls: state.stalls.length }, data: state }, 'civic-market-core-report.json');
    showToast('Report downloaded');
  };

  return (
    <div className="app-shell">
      {/* ========== SIDEBAR ========== */}
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-logo"><img src="/logo.jpg" alt="Logo" /></div>
          <div className="brand-info"><h1>Tanauan Public Market</h1><p>Market Office</p></div>
        </div>
        <nav className="nav-main">
          {navigation.map((item) => (
            <button key={item.key} className={`nav-item${active === item.key ? ' active' : ''}`} onClick={() => { setActive(item.key); setSearchTerm(''); }}>
              <span className="material-symbols-outlined">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <nav className="nav-bottom">
          <button className={`nav-item${active === 'settings' ? ' active' : ''}`} onClick={() => setActive('settings')}>
            <span className="material-symbols-outlined">settings</span><span>Settings</span>
          </button>
          <button className={`nav-item${active === 'support' ? ' active' : ''}`} onClick={() => setActive('support')}>
            <span className="material-symbols-outlined">help</span><span>Support</span>
          </button>
          <button className="nav-item" onClick={handleLogout}>
            <span className="material-symbols-outlined">logout</span><span>Log Out</span>
          </button>
        </nav>
      </aside>

      {/* ========== MAIN CONTENT ========== */}
      <main className="main-content">
        <header className="topbar">
          <div className="search-wrapper">
            <span className="material-symbols-outlined">search</span>
            <input className="search-input" type="text" placeholder="Search dashboard..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
          <div className="topbar-actions">
            <button className="icon-btn" title="Notifications"><span className="material-symbols-outlined">notifications</span><span className="notif-dot" /></button>
            <div className="user-avatar" title="Admin">AD</div>
            <button className="btn-primary" onClick={handleNewEntry}><span className="material-symbols-outlined">add</span>New Entry</button>
          </div>
        </header>

        <div className="page-content">
          {active === 'dashboard' && <DashboardPage state={state} occupiedCount={occupiedCount} pendingApplicants={pendingApplicants} onNavigate={setActive} />}
          {active === 'stalls' && <StallManagementPage stalls={state.stalls} occupiedCount={occupiedCount} availableCount={availableCount} maintenanceCount={maintenanceCount} search={searchTerm} onAdd={() => setModal({ type: 'add-stall' })} onView={(s) => setModal({ type: 'view-stall', data: s })} />}
          {active === 'tenants' && <TenantRecordsPage tenants={state.tenants} search={searchTerm} onAdd={() => setModal({ type: 'add-tenant' })} onView={(t) => setModal({ type: 'view-tenant', data: t })} />}
          {active === 'applicants' && <ApplicantManagementPage applicants={state.applicants} pendingApplicants={pendingApplicants} incompleteApplicants={incompleteApplicants} approvedApplicants={approvedApplicants} search={searchTerm} onAdd={() => setModal({ type: 'add-applicant' })} onView={(a) => setModal({ type: 'view-applicant', data: a })} />}
          {active === 'analytics' && <AnalyticsPage state={state} occupiedCount={occupiedCount} availableCount={availableCount} maintenanceCount={maintenanceCount} onExport={downloadReport} />}
          {active === 'logbook' && <LogbookPage logs={state.logs} search={searchTerm} onAdd={() => setModal({ type: 'add-log' })} onExport={() => { downloadCSV(['Time','Type','Details'], state.logs.map(l => [l.time, l.type, l.details]), 'logbook.csv'); showToast('Log exported'); }} />}
          {active === 'settings' && <SettingsPage state={state} onReset={() => setModal({ type: 'confirm-reset' })} onExport={downloadReport} />}
          {active === 'support' && <SupportPage state={state} onRestore={(data: AppState) => { setState(data); showToast('Data restored successfully from backup'); }} onBackup={() => { downloadJSON(state, `pmrms-backup-${new Date().toISOString().slice(0,10)}.json`); showToast('Backup downloaded successfully'); }} />}
        </div>
      </main>

      {/* ========== MODALS ========== */}
      {modal.type === 'add-stall' && <Modal title="Add New Stall" onClose={closeModal}><AddStallForm existingIds={state.stalls.map(s => s.id)} onSubmit={addStall} onCancel={closeModal} /></Modal>}
      {modal.type === 'add-applicant' && <Modal title="Add New Applicant" onClose={closeModal}><AddApplicantForm existingIds={state.applicants.map(a => a.id)} onSubmit={addApplicant} onCancel={closeModal} /></Modal>}
      {modal.type === 'add-tenant' && <Modal title="Add New Tenant" onClose={closeModal}><AddTenantForm existingIds={state.tenants.map(t => t.id)} onSubmit={addTenant} onCancel={closeModal} /></Modal>}
      {modal.type === 'add-log' && <Modal title="Add Log Entry" onClose={closeModal}><AddLogForm existingIds={state.logs.map(l => l.id)} onSubmit={addLog} onCancel={closeModal} /></Modal>}
      {modal.type === 'view-stall' && <Modal title="Stall Details" onClose={closeModal}><StallDetailView stall={modal.data as Stall} onClose={closeModal} /></Modal>}
      {modal.type === 'view-applicant' && <Modal title="Applicant Details" onClose={closeModal}><ApplicantDetailView applicant={modal.data as Applicant} onClose={closeModal} /></Modal>}
      {modal.type === 'view-tenant' && <Modal title="Tenant Details" onClose={closeModal}><TenantDetailView tenant={modal.data as Tenant} onClose={closeModal} /></Modal>}
      {modal.type === 'confirm-logout' && <ConfirmDialog icon="logout" iconStyle="warning" title="Log Out?" description="Are you sure you want to log out? All data is saved locally." confirmLabel="Log Out" onConfirm={() => { showToast('Logged out successfully'); closeModal(); }} onCancel={closeModal} />}
      {modal.type === 'confirm-reset' && <ConfirmDialog icon="delete_forever" iconStyle="danger" title="Reset All Data?" description="This will permanently reset all data to factory defaults. This cannot be undone." confirmLabel="Reset Data" confirmDanger onConfirm={resetData} onCancel={closeModal} />}

      {/* ========== TOASTS ========== */}
      {toasts.length > 0 && (
        <div className="toast-container">
          {toasts.map((t) => (
            <div className="toast" key={t.id}>
              <span className="material-symbols-outlined">check_circle</span>
              {t.message}
              <span className="toast-close" onClick={() => setToasts((p) => p.filter((x) => x.id !== t.id))}>×</span>
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

function DashboardPage({ state, occupiedCount, pendingApplicants, onNavigate }: { state: AppState; occupiedCount: number; pendingApplicants: number; onNavigate: (k: ModuleKey) => void }) {
  const occupancyPct = (occupiedCount / state.stalls.length) * 100;
  const activeTenants = state.tenants.filter(t => t.status === 'Active').length;

  const sections = Array.from(new Set(state.stalls.map(s => s.section)));

  return (
    <>
      <div className="stats-row">
        <div className="stat-card"><div className="stat-header"><span className="stat-label">Total Stalls</span><span className="material-symbols-outlined stat-icon">grid_view</span></div><div className="stat-value">{state.stalls.length}</div></div>
        <div className="stat-card"><div className="stat-header"><span className="stat-label">Occupancy</span><span className="material-symbols-outlined stat-icon primary">check_circle</span></div><div className="stat-value">{occupiedCount}<span className="stat-fraction">/ {state.stalls.length}</span></div><div className="stat-progress"><div className="stat-progress-fill" style={{ width: `${occupancyPct}%` }} /></div></div>
        <div className="stat-card"><div className="stat-header"><span className="stat-label">Active Tenants</span><span className="material-symbols-outlined stat-icon primary">groups</span></div><div className="stat-value">{activeTenants}</div><span className="stat-link" onClick={() => onNavigate('tenants')}>View Tenants</span></div>
        <div className="stat-card"><div className="stat-header"><span className="stat-label">Pending Applicants</span><span className="material-symbols-outlined stat-icon warning">pending_actions</span></div><div className="stat-value">{pendingApplicants}</div><span className="stat-link" onClick={() => onNavigate('applicants')}>Review Now</span></div>
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

function StallManagementPage({ stalls, occupiedCount, availableCount, maintenanceCount, search, onAdd, onView }: { stalls: Stall[]; occupiedCount: number; availableCount: number; maintenanceCount: number; search: string; onAdd: () => void; onView: (s: Stall) => void }) {
  const [sectionFilter, setSectionFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);

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
        <div className="stat-card"><div className="stat-header"><span className="stat-label">Total Stalls</span><span className="material-symbols-outlined stat-icon">grid_view</span></div><div className="stat-value">{stalls.length}</div></div>
        <div className="stat-card"><div className="stat-header"><span className="stat-label">Occupied</span><span className="material-symbols-outlined stat-icon primary">check_circle</span></div><div className="stat-value primary">{occupiedCount}</div></div>
        <div className="stat-card"><div className="stat-header"><span className="stat-label">Available</span><span className="material-symbols-outlined stat-icon">inventory_2</span></div><div className="stat-value">{availableCount}</div></div>
        <div className="stat-card"><div className="stat-header"><span className="stat-label">Maintenance</span><span className="material-symbols-outlined stat-icon danger">build</span></div><div className="stat-value danger">{maintenanceCount}</div></div>
      </div>
      <div className="panel">
        <div className="filter-row">
          <select className="filter-select" value={sectionFilter} onChange={(e) => { setSectionFilter(e.target.value); setPage(1); }}><option value="">All Sections</option>{SECTIONS.map(s => <option key={s} value={s}>{s}</option>)}</select>
          <select className="filter-select" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}><option value="">All Statuses</option><option value="Occupied">Occupied</option><option value="Available">Available</option><option value="Maintenance">Maintenance</option></select>
          <span className="table-info">Showing {paged.start}-{paged.end} of {paged.total} stalls</span>
        </div>
        <div className="table-wrap">
          <table className="data-table"><thead><tr><th>Stall ID</th><th>Section</th><th>Tenant</th><th>Status</th><th>Last Inspection</th><th>Action</th></tr></thead>
            <tbody>{paged.items.map((s) => (<tr key={s.id}><td><strong>{s.id}</strong></td><td>{s.section}</td><td className={s.status === 'Available' ? 'tenant-cell' : ''}>{s.tenant}</td><td><StatusBadge status={s.status} /></td><td>{s.lastInspection}</td><td><span className="action-link" onClick={() => onView(s)}>View Details</span></td></tr>))}</tbody>
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

function ApplicantManagementPage({ applicants, pendingApplicants, incompleteApplicants, approvedApplicants, search, onAdd, onView }: { applicants: Applicant[]; pendingApplicants: number; incompleteApplicants: number; approvedApplicants: number; search: string; onAdd: () => void; onView: (a: Applicant) => void }) {
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);

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
        <div className="stat-card"><div className="stat-header"><span className="stat-label">Total Applicants</span></div><div className="stat-value">{applicants.length}</div></div>
        <div className="stat-card"><div className="stat-header"><span className="stat-label">Pending Review</span></div><div className="stat-value">{pendingApplicants}</div></div>
        <div className="stat-card"><div className="stat-header"><span className="stat-label">Incomplete Docs</span></div><div className="stat-value">{incompleteApplicants}</div></div>
        <div className="stat-card"><div className="stat-header"><span className="stat-label">Approved (This Mo.)</span></div><div className="stat-value">{approvedApplicants}</div></div>
      </div>
      <div className="panel">
        <div className="filter-row">
          <select className="filter-select" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}><option value="">All Statuses</option><option value="Pending Review">Pending Review</option><option value="Incomplete">Incomplete</option><option value="Approved">Approved</option><option value="Rejected">Rejected</option></select>
          <span className="table-info">Showing {paged.start}-{paged.end} of {paged.total}</span>
        </div>
        <div className="table-wrap">
          <table className="data-table"><thead><tr><th>Applicant Name</th><th>Date Applied</th><th>Stall Type</th><th>Requirements</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>{paged.items.map((a, i) => (<tr key={a.id}><td><div className="applicant-cell"><div className={`avatar-initials ${getAvatarColor(i)}`}>{getInitials(a.name)}</div><div className="applicant-info"><div className="name">{a.name}</div><div className="phone">{a.phone}</div></div></div></td><td>{a.dateApplied}</td><td>{a.stallType}</td><td><div className="requirements-cell"><div className="req-progress-bar"><div className={`req-progress-fill ${a.requirementsUploaded >= a.requirementsTotal ? 'complete' : 'partial'}`} style={{ width: `${(a.requirementsUploaded / a.requirementsTotal) * 100}%` }} /></div><span className="req-text">{a.requirementsUploaded}/{a.requirementsTotal} Uploaded</span></div></td><td><StatusBadge status={a.status} /></td><td><span className="action-link" onClick={() => onView(a)}>View</span></td></tr>))}</tbody>
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

function TenantRecordsPage({ tenants, search, onAdd, onView }: { tenants: Tenant[]; search: string; onAdd: () => void; onView: (t: Tenant) => void }) {
  const [sectionFilter, setSectionFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);

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
        <div className="stat-card"><div className="stat-header"><span className="stat-label">Total Tenants</span><span className="material-symbols-outlined stat-icon">groups</span></div><div className="stat-value">{tenants.length}</div></div>
        <div className="stat-card"><div className="stat-header"><span className="stat-label">Active</span><span className="material-symbols-outlined stat-icon success">check_circle</span></div><div className="stat-value success">{tenants.filter(t => t.status === 'Active').length}</div></div>
        <div className="stat-card"><div className="stat-header"><span className="stat-label">Expiring Soon</span><span className="material-symbols-outlined stat-icon warning">schedule</span></div><div className="stat-value">{tenants.filter(t => t.status === 'Expiring Soon').length}</div></div>
        <div className="stat-card"><div className="stat-header"><span className="stat-label">Monthly Revenue</span><span className="material-symbols-outlined stat-icon primary">payments</span></div><div className="stat-value">{moneyShort(tenants.reduce((s, t) => s + t.rent, 0))}</div></div>
      </div>
      <div className="panel">
        <div className="filter-row">
          <select className="filter-select" value={sectionFilter} onChange={(e) => { setSectionFilter(e.target.value); setPage(1); }}><option value="">All Sections</option>{SECTIONS.map(s => <option key={s} value={s}>{s}</option>)}</select>
          <select className="filter-select" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}><option value="">All Statuses</option><option value="Active">Active</option><option value="Expiring Soon">Expiring Soon</option></select>
          <span className="table-info">Showing {paged.start}-{paged.end} of {paged.total} tenants</span>
        </div>
        <div className="table-wrap">
          <table className="data-table"><thead><tr><th>Tenant ID</th><th>Name</th><th>Stall ID</th><th>Section</th><th>Monthly Rent</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>{paged.items.map((t) => (<tr key={t.id}><td><strong>{t.id}</strong></td><td>{t.name}</td><td>{t.stallId}</td><td>{t.section}</td><td>{money(t.rent)}</td><td><TenantStatusBadge status={t.status} /></td><td><span className="action-link" onClick={() => onView(t)}>View Details</span></td></tr>))}</tbody>
          </table>
        </div>
        <PaginationBar info={`Showing ${paged.start}-${paged.end} of ${paged.total}`} page={paged.page} totalPages={paged.totalPages} onPage={setPage} />
      </div>
    </>
  );
}

/* ============================================================
   Analytics Page
   ============================================================ */

function AnalyticsPage({ state, occupiedCount, availableCount, maintenanceCount, onExport }: { state: AppState; occupiedCount: number; availableCount: number; maintenanceCount: number; onExport: () => void }) {
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

  return (
    <>
      <div className="page-header">
        <div><h2 className="page-title">Analytics</h2><p className="page-subtitle">Comprehensive operational dashboard and insights.</p></div>
        <div className="page-actions"><button className="btn-primary" onClick={onExport}><span className="material-symbols-outlined">download</span>Export Report</button></div>
      </div>
      <div className="stats-row">
        <div className="stat-card"><div className="stat-header"><span className="stat-label">Occupancy Rate</span><span className="material-symbols-outlined stat-icon primary">pie_chart</span></div><div className="stat-value primary">{percent((occupiedCount / totalStalls) * 100)}</div><div className="stat-progress"><div className="stat-progress-fill" style={{ width: `${(occupiedCount / totalStalls) * 100}%` }} /></div></div>
        <div className="stat-card"><div className="stat-header"><span className="stat-label">Active Tenants</span><span className="material-symbols-outlined stat-icon success">groups</span></div><div className="stat-value success">{activeTenants}</div></div>
        <div className="stat-card"><div className="stat-header"><span className="stat-label">Pending Applications</span><span className="material-symbols-outlined stat-icon warning">person_add</span></div><div className="stat-value">{pendingApplicants}</div></div>
        <div className="stat-card"><div className="stat-header"><span className="stat-label">Open Violations</span><span className="material-symbols-outlined stat-icon danger">gavel</span></div><div className="stat-value danger">{openViolations}</div></div>
      </div>
      <div className="analytics-grid">
        {/* Panel 1: Stall Status Distribution */}
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
        {/* Panel 2: Occupancy by Section */}
        <div className="panel"><div className="panel-header"><h3 className="panel-title">Occupancy by Section</h3></div>
          <div className="chart-container">
            {sections.map((sec) => { const total = state.stalls.filter(s => s.section === sec).length; const occ = state.stalls.filter(s => s.section === sec && s.status === 'Occupied').length; const h = total > 0 ? (occ / total) * 100 : 0; return (<div className="chart-bar-group" key={sec}><div className="chart-bar" style={{ height: `${Math.max(h, 15)}%` }} title={`${occ}/${total}`} /><span className="chart-bar-label">{sec.split(' ')[0]}</span></div>); })}
          </div>
        </div>
        {/* Panel 3: Applicant Pipeline */}
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
        {/* Panel 4: Tenant Distribution by Section */}
        <div className="panel"><div className="panel-header"><h3 className="panel-title">Tenant Distribution by Section</h3></div>
          <div className="analytics-stats">
            {sections.map(sec => (
              <div className="stat-pill" key={sec}><span>{sec}</span><strong>{tenantsBySection[sec] || 0}</strong></div>
            ))}
          </div>
        </div>
        {/* Panel 5: Violations Summary */}
        <div className="panel"><div className="panel-header"><h3 className="panel-title">Violations Summary</h3></div>
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
        {/* Panel 6: Logbook Activity Summary */}
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

function LogbookPage({ logs, search, onAdd, onExport }: { logs: LogEntry[]; search: string; onAdd: () => void; onExport: () => void }) {
  const [typeFilter, setTypeFilter] = useState('');
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => logs.filter((l) => {
    if (typeFilter && l.type !== typeFilter) return false;
    if (search) { const q = search.toLowerCase(); if (!l.details.toLowerCase().includes(q) && !l.type.toLowerCase().includes(q)) return false; }
    return true;
  }), [logs, typeFilter, search]);

  const paged = paginate(filtered, page);

  return (
    <>
      <div className="page-header">
        <div><h2 className="page-title">Logbook</h2><p className="page-subtitle">Operational history and daily activity logs.</p></div>
        <div className="page-actions"><button className="btn-outline" onClick={onExport}>Export Log</button><button className="btn-primary" onClick={onAdd}><span className="material-symbols-outlined">add</span>New Entry</button></div>
      </div>
      <div className="panel">
        <div className="panel-header">
          <h3 className="panel-title">Today's Log</h3>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <select className="filter-select" value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}><option value="">All Types</option>{LOG_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select>
            <span className="table-info">{filtered.length} entries</span>
          </div>
        </div>
        <div className="log-list">
          {paged.items.map((log) => (<div className="log-item" key={log.id}><span className="log-time">{log.time}</span><span className="log-type">{log.type}</span><span className="log-details">{log.details}</span></div>))}
          {paged.items.length === 0 && <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>No log entries found.</div>}
        </div>
        <PaginationBar info={`Showing ${paged.start}-${paged.end} of ${paged.total}`} page={paged.page} totalPages={paged.totalPages} onPage={setPage} />
      </div>
    </>
  );
}

/* ============================================================
   Settings Page
   ============================================================ */

function SettingsPage({ state, onReset, onExport }: { state: AppState; onReset: () => void; onExport: () => void }) {
  return (
    <>
      <div className="page-header"><div><h2 className="page-title">Settings</h2><p className="page-subtitle">System configuration and data management.</p></div></div>
      <div className="settings-grid">
        <div className="settings-section">
          <div className="settings-section-header">System Information</div>
          <div className="settings-section-body">
            <div className="settings-item"><span className="settings-item-label">Application</span><span className="settings-item-value">Tanauan Public Market v1.0</span></div>
            <div className="settings-item"><span className="settings-item-label">Storage</span><span className="settings-item-value">Local Browser Storage</span></div>
            <div className="settings-item"><span className="settings-item-label">Total Records</span><span className="settings-item-value">{state.stalls.length + state.tenants.length + state.applicants.length + state.logs.length}</span></div>
            <div className="settings-item"><span className="settings-item-label">Last Updated</span><span className="settings-item-value">{new Date().toLocaleDateString()}</span></div>
          </div>
        </div>
        <div className="settings-section">
          <div className="settings-section-header">Quick Stats</div>
          <div className="settings-section-body">
            <div className="settings-item"><span className="settings-item-label">Total Stalls</span><span className="settings-item-value">{state.stalls.length}</span></div>
            <div className="settings-item"><span className="settings-item-label">Active Tenants</span><span className="settings-item-value">{state.tenants.filter(t => t.status === 'Active').length}</span></div>
            <div className="settings-item"><span className="settings-item-label">Pending Applicants</span><span className="settings-item-value">{state.applicants.filter(a => a.status === 'Pending Review').length}</span></div>
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
  { q: 'How do I manage applicants?', a: 'Go to the Applicants page to see all applicant records. You can filter by status (Pending Review, Incomplete, Approved, Rejected) and add new applicants.' },
  { q: 'Where can I view analytics?', a: 'The Analytics page provides a comprehensive view of stall occupancy, applicant pipeline, tenant distribution, violations summary, and logbook activity.' },
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
        // Validate structure: check required keys exist
        const requiredKeys: (keyof AppState)[] = ['applicants', 'tenants', 'stalls', 'logs', 'activities', 'violations'];
        const hasAllKeys = requiredKeys.every((k) => k in parsed);
        if (!hasAllKeys) {
          setRestoreStatus('Invalid backup file: missing required data fields.');
          setTimeout(() => setRestoreStatus(''), 4000);
          return;
        }
        onRestore(parsed as AppState);
        setRestoreStatus('Data restored successfully!');
        setTimeout(() => setRestoreStatus(''), 4000);
      } catch {
        setRestoreStatus('Error: Could not parse backup file. Please ensure it is a valid JSON file.');
        setTimeout(() => setRestoreStatus(''), 4000);
      }
    };
    reader.readAsText(file);
    // Reset input so the same file can be selected again
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

      {/* Contact Information */}
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

      {/* Backup & Restore */}
      <div className="panel" style={{ marginTop: '20px' }}>
        <div className="panel-header"><h3 className="panel-title">Backup & Restore</h3></div>
        <div className="backup-section">
          <div className="backup-info">
            <div className="backup-info-row">
              <span className="material-symbols-outlined backup-icon download">cloud_download</span>
              <div>
                <h4>Download Full Backup</h4>
                <p>Export all system data (stalls, tenants, applicants, logs, settings) as a single JSON file. Use this to transfer data to another computer running this system.</p>
                <p className="backup-meta">Current records: {state.stalls.length} stalls · {state.tenants.length} tenants · {state.applicants.length} applicants · {state.logs.length} logs</p>
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

      {/* FAQ */}
      <div className="panel" style={{ marginTop: '20px' }}>
        <div className="panel-header"><h3 className="panel-title">Frequently Asked Questions</h3></div>
        <div className="faq-list">
          {faqs.map((f, i) => (
            <div className="faq-item" key={i} onClick={() => setOpenFaq(openFaq === i ? null : i)}>
              <div className="faq-question"><span>{f.q}</span><span className="material-symbols-outlined">{openFaq === i ? 'expand_less' : 'expand_more'}</span></div>
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

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header"><h3>{title}</h3><button className="modal-close" onClick={onClose}><span className="material-symbols-outlined">close</span></button></div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

function ConfirmDialog({ icon, iconStyle, title, description, confirmLabel, confirmDanger, onConfirm, onCancel }: { icon: string; iconStyle: string; title: string; description: string; confirmLabel: string; confirmDanger?: boolean; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '400px' }}>
        <div className="modal-body">
          <div className={`confirm-icon ${iconStyle}`}><span className="material-symbols-outlined">{icon}</span></div>
          <div className="confirm-text"><h4>{title}</h4><p>{description}</p></div>
          <div className="confirm-actions">
            <button className="btn-outline" onClick={onCancel}>Cancel</button>
            <button className={confirmDanger ? 'btn-danger' : 'btn-primary'} onClick={onConfirm}>{confirmLabel}</button>
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

  const handleSubmit = () => {
    const stallId = id.trim() || nextId('STL', existingIds);
    onSubmit({ id: stallId, section, tenant: status === 'Available' ? 'Vacant' : (tenant || 'Vacant'), status, lastInspection: status === 'Available' ? '-' : todayStr() });
  };

  return (
    <div className="form-grid">
      <div className="form-row">
        <div className="form-group"><label className="form-label">Stall ID</label><input className="form-input" placeholder="Auto-generated if empty" value={id} onChange={(e) => setId(e.target.value)} /></div>
        <div className="form-group"><label className="form-label">Section</label><select className="form-select" value={section} onChange={(e) => setSection(e.target.value)}>{SECTIONS.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
      </div>
      <div className="form-row">
        <div className="form-group"><label className="form-label">Tenant</label><input className="form-input" placeholder="Leave blank if vacant" value={tenant} onChange={(e) => setTenant(e.target.value)} /></div>
        <div className="form-group"><label className="form-label">Status</label><select className="form-select" value={status} onChange={(e) => setStatus(e.target.value as StallStatus)}><option value="Available">Available</option><option value="Occupied">Occupied</option><option value="Maintenance">Maintenance</option></select></div>
      </div>
      <div className="modal-footer" style={{ padding: 0, borderTop: 'none', justifyContent: 'flex-end' }}><button className="btn-outline" onClick={onCancel}>Cancel</button><button className="btn-primary" onClick={handleSubmit}>Add Stall</button></div>
    </div>
  );
}

function AddApplicantForm({ existingIds, onSubmit, onCancel }: { existingIds: string[]; onSubmit: (a: Applicant) => void; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [stallType, setStallType] = useState(STALL_TYPES[0]);
  const [reqUploaded, setReqUploaded] = useState(0);

  const handleSubmit = () => {
    if (!name.trim()) return;
    onSubmit({ id: nextId('APP', existingIds), name: name.trim(), phone: phone.trim() || '—', stallType, status: reqUploaded >= 4 ? 'Pending Review' : 'Incomplete', dateApplied: todayStr(), requirementsUploaded: reqUploaded, requirementsTotal: 4 });
  };

  return (
    <div className="form-grid">
      <div className="form-row">
        <div className="form-group"><label className="form-label">Full Name *</label><input className="form-input" placeholder="e.g. Juan Santos" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div className="form-group"><label className="form-label">Phone Number</label><input className="form-input" placeholder="e.g. 0917-123-4567" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
      </div>
      <div className="form-row">
        <div className="form-group"><label className="form-label">Stall Type</label><select className="form-select" value={stallType} onChange={(e) => setStallType(e.target.value)}>{STALL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
        <div className="form-group"><label className="form-label">Requirements Uploaded (out of 4)</label><input className="form-input" type="number" min="0" max="4" value={reqUploaded} onChange={(e) => setReqUploaded(Math.min(4, Math.max(0, parseInt(e.target.value) || 0)))} /></div>
      </div>
      <div className="modal-footer" style={{ padding: 0, borderTop: 'none', justifyContent: 'flex-end' }}><button className="btn-outline" onClick={onCancel}>Cancel</button><button className="btn-primary" onClick={handleSubmit}>Add Applicant</button></div>
    </div>
  );
}

function AddTenantForm({ existingIds, onSubmit, onCancel }: { existingIds: string[]; onSubmit: (t: Tenant) => void; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [stallId, setStallId] = useState('');
  const [section, setSection] = useState(SECTIONS[0]);
  const [rent, setRent] = useState(3500);
  const [status, setStatus] = useState('Active');

  const handleSubmit = () => {
    if (!name.trim()) return;
    onSubmit({ id: nextId('TEN', existingIds), name: name.trim(), stallId: stallId.trim() || '—', section, rent, status });
  };

  return (
    <div className="form-grid">
      <div className="form-row">
        <div className="form-group"><label className="form-label">Tenant Name *</label><input className="form-input" placeholder="e.g. Maria Santos" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div className="form-group"><label className="form-label">Stall ID</label><input className="form-input" placeholder="e.g. M-101" value={stallId} onChange={(e) => setStallId(e.target.value)} /></div>
      </div>
      <div className="form-row">
        <div className="form-group"><label className="form-label">Section</label><select className="form-select" value={section} onChange={(e) => setSection(e.target.value)}>{SECTIONS.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
        <div className="form-group"><label className="form-label">Monthly Rent (₱)</label><input className="form-input" type="number" min="0" step="500" value={rent} onChange={(e) => setRent(parseFloat(e.target.value) || 0)} /></div>
      </div>
      <div className="form-group"><label className="form-label">Status</label><select className="form-select" value={status} onChange={(e) => setStatus(e.target.value)}><option value="Active">Active</option><option value="Expiring Soon">Expiring Soon</option></select></div>
      <div className="modal-footer" style={{ padding: 0, borderTop: 'none', justifyContent: 'flex-end' }}><button className="btn-outline" onClick={onCancel}>Cancel</button><button className="btn-primary" onClick={handleSubmit}>Add Tenant</button></div>
    </div>
  );
}



function AddLogForm({ existingIds, onSubmit, onCancel }: { existingIds: string[]; onSubmit: (l: LogEntry) => void; onCancel: () => void }) {
  const [type, setType] = useState(LOG_TYPES[0]);
  const [details, setDetails] = useState('');

  const handleSubmit = () => {
    if (!details.trim()) return;
    onSubmit({ id: nextId('LOG', existingIds), time: nowTimeStr(), type, details: details.trim() });
  };

  return (
    <div className="form-grid">
      <div className="form-group"><label className="form-label">Entry Type</label><select className="form-select" value={type} onChange={(e) => setType(e.target.value)}>{LOG_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
      <div className="form-group"><label className="form-label">Details *</label><textarea className="form-textarea" placeholder="Describe the event or activity..." value={details} onChange={(e) => setDetails(e.target.value)} /></div>
      <div className="modal-footer" style={{ padding: 0, borderTop: 'none', justifyContent: 'flex-end' }}><button className="btn-outline" onClick={onCancel}>Cancel</button><button className="btn-primary" onClick={handleSubmit}>Add Entry</button></div>
    </div>
  );
}

/* ============================================================
   Detail Views
   ============================================================ */

function StallDetailView({ stall, onClose }: { stall: Stall; onClose: () => void }) {
  return (<>
    <div className="detail-grid">
      <div className="detail-field"><span className="detail-label">Stall ID</span><span className="detail-value">{stall.id}</span></div>
      <div className="detail-field"><span className="detail-label">Section</span><span className="detail-value">{stall.section}</span></div>
      <div className="detail-field"><span className="detail-label">Tenant</span><span className="detail-value">{stall.tenant}</span></div>
      <div className="detail-field"><span className="detail-label">Status</span><div className="detail-value"><StatusBadge status={stall.status} /></div></div>
      <div className="detail-field full"><span className="detail-label">Last Inspection</span><span className="detail-value">{stall.lastInspection}</span></div>
    </div>
    <div className="modal-footer" style={{ padding: '16px 0 0', borderTop: 'none' }}><button className="btn-outline" onClick={onClose}>Close</button></div>
  </>);
}

function ApplicantDetailView({ applicant, onClose }: { applicant: Applicant; onClose: () => void }) {
  return (<>
    <div className="detail-grid">
      <div className="detail-field"><span className="detail-label">Applicant ID</span><span className="detail-value">{applicant.id}</span></div>
      <div className="detail-field"><span className="detail-label">Name</span><span className="detail-value">{applicant.name}</span></div>
      <div className="detail-field"><span className="detail-label">Phone</span><span className="detail-value">{applicant.phone}</span></div>
      <div className="detail-field"><span className="detail-label">Stall Type</span><span className="detail-value">{applicant.stallType}</span></div>
      <div className="detail-field"><span className="detail-label">Date Applied</span><span className="detail-value">{applicant.dateApplied}</span></div>
      <div className="detail-field"><span className="detail-label">Status</span><div className="detail-value"><StatusBadge status={applicant.status} /></div></div>
      <div className="detail-field full"><span className="detail-label">Requirements</span><span className="detail-value">{applicant.requirementsUploaded} / {applicant.requirementsTotal} uploaded</span></div>
    </div>
    <div className="modal-footer" style={{ padding: '16px 0 0', borderTop: 'none' }}><button className="btn-outline" onClick={onClose}>Close</button></div>
  </>);
}

function TenantDetailView({ tenant, onClose }: { tenant: Tenant; onClose: () => void }) {
  return (<>
    <div className="detail-grid">
      <div className="detail-field"><span className="detail-label">Tenant ID</span><span className="detail-value">{tenant.id}</span></div>
      <div className="detail-field"><span className="detail-label">Name</span><span className="detail-value">{tenant.name}</span></div>
      <div className="detail-field"><span className="detail-label">Stall ID</span><span className="detail-value">{tenant.stallId}</span></div>
      <div className="detail-field"><span className="detail-label">Section</span><span className="detail-value">{tenant.section}</span></div>
      <div className="detail-field"><span className="detail-label">Monthly Rent</span><span className="detail-value">{money(tenant.rent)}</span></div>
      <div className="detail-field"><span className="detail-label">Status</span><div className="detail-value"><TenantStatusBadge status={tenant.status} /></div></div>
    </div>
    <div className="modal-footer" style={{ padding: '16px 0 0', borderTop: 'none' }}><button className="btn-outline" onClick={onClose}>Close</button></div>
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
  return <span className={map[status] || 'badge'}>{status.toUpperCase()}</span>;
}



function TenantStatusBadge({ status }: { status: string }) {
  if (status === 'Active') return <span className="tenant-status"><span className="status-dot active" /><span>Active</span></span>;
  if (status === 'Expiring Soon') return <span className="tenant-status"><span className="status-dot expiring" /><span>Expiring Soon</span></span>;
  return <span>{status}</span>;
}

export default App;