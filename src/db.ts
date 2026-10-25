/* ============================================================
   Storage
   ============================================================

   Where the records are kept, and the one place that knows the difference.

   Running as the installed desktop application, records live in a SQLite
   database owned by the Electron main process; this module reaches it through
   the bridge set up in electron/preload.cjs.

   Running in a plain browser — `npm run dev`, or the built files opened
   directly — there is no database to talk to, so the same records are kept in
   localStorage exactly as they were before. Nothing above this module needs to
   know which of the two is in use.

   The records themselves are passed through untouched: the shapes and the
   repair of older records stay in App.tsx, so this file never has to be edited
   when a field is added.
   ============================================================ */

export type IdCounters = Record<string, number>;

type SavePayload = { state: unknown; idCounters: IdCounters; dataset?: string; roster?: string };

type BridgeResult<T> = { ok: true; data: T } | { ok: false; error: string };

type Bridge = {
  available: true;
  load: () => Promise<BridgeResult<{ state: Record<string, unknown[]>; idCounters: IdCounters; savedAt: string; dataset?: string; roster?: string; file: string }>>;
  save: (payload: SavePayload) => Promise<BridgeResult<{ savedAt: string; file: string }>>;
  replaceAll: (payload: SavePayload) => Promise<BridgeResult<{ savedAt: string; file: string }>>;
  clear: () => Promise<BridgeResult<true>>;
  stats: () => Promise<BridgeResult<DatabaseStats>>;
  integrityCheck: () => Promise<BridgeResult<{ ok: boolean; result: string }>>;
  backup: () => Promise<BridgeResult<{ canceled: boolean; filePath?: string }>>;
  saveReportPdf?: (fileName: string) => Promise<BridgeResult<{ canceled: boolean; filePath?: string; opened?: boolean }>>;
  revealFolder: () => Promise<BridgeResult<string>>;
  snapshot?: (label: string) => Promise<BridgeResult<string>>;
  loadAccounts?: () => Promise<BridgeResult<unknown[]>>;
  saveAccounts?: (accounts: unknown[]) => Promise<BridgeResult<true>>;
};

export type DatabaseStats = {
  counts: Record<string, number>;
  bytes: number;
  file: string;
  schemaVersion: number;
  savedAt: string;
};

declare global {
  interface Window { pmrmsDB?: Bridge }
}

const bridge = (): Bridge | null => (typeof window !== 'undefined' && window.pmrmsDB?.available ? window.pmrmsDB : null);

/** True when the records are in the SQLite database rather than the browser. */
export const usingDatabase = () => bridge() !== null;

export const backendName = () => (usingDatabase() ? 'SQLite database (offline)' : 'Local browser storage');

/* Keys the browser fallback uses. These are also where an installation that
   predates the database left its records, which is what makes the one-time
   import below possible. */
const stateKey = 'pmrms-state-v3';
const savedAtKey = 'pmrms-saved-at';
const idCounterKey = 'pmrms-id-counters';
const datasetKey = 'pmrms-dataset';
const rosterKey = 'pmrms-roster';
const accountsKey = 'pmrms-accounts';
const snapshotKey = (label: string) => `pmrms-state-before-${label}`;

/* Unwraps the { ok, data } envelope the main process replies with, turning a
   reported failure back into a thrown error for the caller to handle. */
async function unwrap<T>(call: Promise<BridgeResult<T>>): Promise<T> {
  const result = await call;
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

/* ---------- Reading ---------- */

export type LoadResult = {
  /** The stored records, or null when nothing has been filed yet. */
  raw: unknown | null;
  idCounters: IdCounters;
  savedAt: string;
  /** Set when the records could not be read, so saving must be held back. */
  problem: string;
  /** Set when records were carried over from an older, pre-database install. */
  imported: boolean;
  /** The stall-directory edition the records were last brought up to ('' if none). */
  dataset: string;
  /** The office-order roster last added to the board ('' if none). */
  roster: string;
};

function readLocal(): LoadResult {
  let raw: unknown | null = null;
  let counters: IdCounters = {};
  let savedAt = '';
  let dataset = '';
  let roster = '';
  try {
    const stored = localStorage.getItem(stateKey);
    if (stored) raw = JSON.parse(stored);
    savedAt = localStorage.getItem(savedAtKey) ?? '';
    dataset = localStorage.getItem(datasetKey) ?? '';
    roster = localStorage.getItem(rosterKey) ?? '';
  } catch { /* unreadable or unavailable — start from the defaults */ }
  try {
    const stored = JSON.parse(localStorage.getItem(idCounterKey) ?? '{}');
    if (stored && typeof stored === 'object') counters = stored as IdCounters;
  } catch { /* counters fall back to max(existing id) */ }
  return { raw, idCounters: counters, savedAt, problem: '', imported: false, dataset, roster };
}

/* Records held by a version of the app that ran before the database existed.
   They sit in the same user-data folder, so an operator who updates in place
   keeps everything they had. */
function legacyRecords(): { raw: unknown | null; idCounters: IdCounters } {
  const local = readLocal();
  const lists = local.raw as Record<string, unknown> | null;
  const hasRecords = !!lists && typeof lists === 'object'
    && ['applicants', 'tenants', 'stalls', 'logs'].some((k) => Array.isArray(lists[k]) && (lists[k] as unknown[]).length > 0);
  return hasRecords ? { raw: local.raw, idCounters: local.idCounters } : { raw: null, idCounters: {} };
}

/** Everything needed at start-up: the records, the ID counters, the save time. */
export async function loadStored(): Promise<LoadResult> {
  const db = bridge();
  if (!db) return readLocal();

  try {
    const loaded = await unwrap(db.load());
    const lists = loaded.state ?? {};
    const empty = Object.values(lists).every((rows) => !Array.isArray(rows) || rows.length === 0);

    if (empty) {
      // Nothing in the database yet. Either this is an update from a version
      // that stored records in the browser — in which case they are carried
      // over — or a genuinely new installation, which starts from the defaults.
      const legacy = legacyRecords();
      if (legacy.raw) {
        return { raw: legacy.raw, idCounters: legacy.idCounters, savedAt: '', problem: '', imported: true, dataset: '', roster: '' };
      }
      return { raw: null, idCounters: loaded.idCounters ?? {}, savedAt: loaded.savedAt ?? '', problem: '', imported: false, dataset: '', roster: '' };
    }

    return { raw: lists, idCounters: loaded.idCounters ?? {}, savedAt: loaded.savedAt ?? '', problem: '', imported: false, dataset: loaded.dataset ?? '', roster: loaded.roster ?? '' };
  } catch (error) {
    // The records exist but could not be read. Report it and let the caller
    // hold back every save, so a display built from defaults is never written
    // over records that are still on disk.
    return {
      raw: null,
      idCounters: {},
      savedAt: '',
      problem: error instanceof Error ? error.message : String(error),
      imported: false,
      dataset: '',
      roster: '',
    };
  }
}

/* ---------- Writing ---------- */

/** Files the current records, and the directory edition and office-order
    roster they are at — each left as stored when not given. Resolves with the
    time they were saved. */
export async function persist(state: unknown, idCounters: IdCounters, dataset?: string, roster?: string): Promise<string> {
  const db = bridge();
  if (!db) {
    localStorage.setItem(stateKey, JSON.stringify(state));
    localStorage.setItem(idCounterKey, JSON.stringify(idCounters));
    if (typeof dataset === 'string') localStorage.setItem(datasetKey, dataset);
    if (typeof roster === 'string') localStorage.setItem(rosterKey, roster);
    const stamp = new Date().toISOString();
    localStorage.setItem(savedAtKey, stamp);
    return stamp;
  }
  const { savedAt } = await unwrap(db.save({ state, idCounters, dataset, roster }));
  return savedAt;
}

/** Replaces every record and ID counter — restoring a backup, resetting to
    the defaults, or starting afresh on a new stall directory. */
export async function replaceAll(state: unknown, idCounters: IdCounters, dataset?: string): Promise<string> {
  const db = bridge();
  if (!db) return persist(state, idCounters, dataset);
  const { savedAt } = await unwrap(db.replaceAll({ state, idCounters, dataset }));
  return savedAt;
}

/** Clears the stored records, leaving nothing behind for the next start-up. */
export async function clearStored(): Promise<void> {
  const db = bridge();
  if (!db) {
    try {
      localStorage.removeItem(stateKey);
      localStorage.removeItem(idCounterKey);
      localStorage.removeItem(savedAtKey);
    } catch { /* nothing stored to clear */ }
    return;
  }
  await unwrap(db.clear());
}

/* ---------- Maintenance ---------- */

/** Row counts and file size, or null in the browser where there is no file. */
export async function databaseStats(): Promise<DatabaseStats | null> {
  const db = bridge();
  if (!db) return null;
  try { return await unwrap(db.stats()); } catch { return null; }
}

/** Asks SQLite whether the file is intact. */
export async function checkIntegrity(): Promise<{ ok: boolean; result: string } | null> {
  const db = bridge();
  if (!db) return null;
  return unwrap(db.integrityCheck());
}

/** Saves a copy of the database file somewhere the operator chooses. */
export async function backupDatabase(): Promise<{ canceled: boolean; filePath?: string } | null> {
  const db = bridge();
  if (!db) return null;
  return unwrap(db.backup());
}

/** Saves the page as laid out for print to a PDF the operator chooses, and
    opens it. Null in a browser, which has no way to write the file itself. */
export async function saveReportPdf(fileName: string): Promise<{ canceled: boolean; filePath?: string; opened?: boolean } | null> {
  const db = bridge();
  if (!db?.saveReportPdf) return null;
  return unwrap(db.saveReportPdf(fileName));
}

/**
 * Keeps a copy of the records as they stand before the app changes them in
 * bulk. In the desktop app the whole database file is copied into its
 * "backups" folder; in a browser the records are kept under their own key.
 * Resolves with where the copy went, and throws if no copy could be made —
 * the caller must then leave the records alone.
 */
export async function keepCopyBefore(label: string, raw: unknown): Promise<string> {
  const db = bridge();
  if (db?.snapshot) return unwrap(db.snapshot(label));
  localStorage.setItem(snapshotKey(label), JSON.stringify({ savedAt: new Date().toISOString(), records: raw }));
  return `browser storage (${snapshotKey(label)})`;
}

/* ---------- Accounts ----------

   Who may sign in, kept apart from the records: a backup restored or a reset
   to defaults leaves them alone. Rows pass through untouched; their shape is
   checked in src/security/accounts.ts. */

export async function loadAccounts(): Promise<unknown[]> {
  const db = bridge();
  if (db?.loadAccounts) return unwrap(db.loadAccounts());
  try {
    const stored = JSON.parse(localStorage.getItem(accountsKey) ?? '[]');
    return Array.isArray(stored) ? stored : [];
  } catch { return []; }
}

export async function saveAccounts(accounts: unknown[]): Promise<void> {
  const db = bridge();
  if (db?.saveAccounts) { await unwrap(db.saveAccounts(accounts)); return; }
  localStorage.setItem(accountsKey, JSON.stringify(accounts));
}

/** Opens the folder holding the database file. */
export async function revealDataFolder(): Promise<void> {
  const db = bridge();
  if (!db) return;
  await unwrap(db.revealFolder());
}

/** A file size in the units an office clerk reads, not bytes. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
