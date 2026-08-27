// SQLite storage for the Public Market Rental Monitoring System.
//
// The whole system runs offline: this module owns a single SQLite file in the
// Electron user-data folder and is the only thing that touches it. The renderer
// never sees the database — it asks for the records over IPC (see preload.cjs)
// and hands back whatever the operator changed.
//
// The renderer still works with one plain object (the "state") holding a list
// per record type, exactly as it did when the data lived in localStorage. The
// difference is that the object is now assembled from — and written back to —
// real tables, so the records can be read, queried and repaired with any
// standard SQLite tool.
//
// CommonJS (.cjs) because package.json declares "type": "module".

const path = require('node:path');
const fs = require('node:fs');
const Database = require('better-sqlite3');

/* ============================================================
   Schema
   ============================================================ */

/* Bumped whenever the statements below change shape. `migrate()` reads the
   number back out of the file to decide what still needs doing. */
const SCHEMA_VERSION = 2;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS stalls (
  id             TEXT PRIMARY KEY,
  section        TEXT NOT NULL DEFAULT '',
  tenant         TEXT NOT NULL DEFAULT 'Vacant',
  status         TEXT NOT NULL DEFAULT 'Available',
  lastInspection TEXT NOT NULL DEFAULT '-',
  position       INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS tenants (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL DEFAULT '',
  phone       TEXT NOT NULL DEFAULT '',
  barangay    TEXT NOT NULL DEFAULT '',
  stallId     TEXT NOT NULL DEFAULT '',
  section     TEXT NOT NULL DEFAULT '',
  rent        REAL NOT NULL DEFAULT 0,
  status      TEXT NOT NULL DEFAULT 'Active',
  applicantId TEXT,
  position    INTEGER NOT NULL DEFAULT 0
);

/* A stall may be tended by more than one person, so keepers are their own
   rows hanging off the tenant rather than columns on it. Deleting the tenant
   clears them out. */
CREATE TABLE IF NOT EXISTS stallkeepers (
  rowid_key TEXT PRIMARY KEY,
  tenantId  TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  id        TEXT NOT NULL DEFAULT '',
  name      TEXT NOT NULL DEFAULT '',
  phone     TEXT NOT NULL DEFAULT '',
  relation  TEXT NOT NULL DEFAULT '',
  barangay  TEXT NOT NULL DEFAULT '',
  position  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS applicants (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL DEFAULT '',
  phone       TEXT NOT NULL DEFAULT '',
  stallType   TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'Pending Review',
  dateApplied TEXT NOT NULL DEFAULT '',
  position    INTEGER NOT NULL DEFAULT 0
);

/* Which requirements an applicant has filed. One row per submitted document
   keeps the list queryable instead of burying it in a JSON blob. */
CREATE TABLE IF NOT EXISTS applicant_requirements (
  rowid_key   TEXT PRIMARY KEY,
  applicantId TEXT NOT NULL REFERENCES applicants(id) ON DELETE CASCADE,
  requirement TEXT NOT NULL,
  position    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS utility_bills (
  id              TEXT PRIMARY KEY,
  type            TEXT NOT NULL DEFAULT 'Electricity',
  stallId         TEXT NOT NULL DEFAULT '',
  tenantId        TEXT NOT NULL DEFAULT '',
  tenantName      TEXT NOT NULL DEFAULT '',
  section         TEXT NOT NULL DEFAULT '',
  period          TEXT NOT NULL DEFAULT '',
  periodStart     TEXT NOT NULL DEFAULT '',
  periodEnd       TEXT NOT NULL DEFAULT '',
  previousReading REAL NOT NULL DEFAULT 0,
  currentReading  REAL NOT NULL DEFAULT 0,
  consumption     REAL NOT NULL DEFAULT 0,
  rate            REAL NOT NULL DEFAULT 0,
  fixedCharge     REAL NOT NULL DEFAULT 0,
  amount          REAL NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'Unpaid',
  dateIssued      TEXT NOT NULL DEFAULT '',
  dueDate         TEXT NOT NULL DEFAULT '',
  notes           TEXT NOT NULL DEFAULT '',
  position        INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS violations (
  id           TEXT PRIMARY KEY,
  tenant       TEXT NOT NULL DEFAULT '',
  issue        TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL DEFAULT 'Open',
  points       INTEGER NOT NULL DEFAULT 0,
  dateRecorded TEXT NOT NULL DEFAULT '',
  dateResolved TEXT NOT NULL DEFAULT '',
  notes        TEXT NOT NULL DEFAULT '',
  position     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS logs (
  id       TEXT PRIMARY KEY,
  date     TEXT NOT NULL DEFAULT '',
  time     TEXT NOT NULL DEFAULT '',
  type     TEXT NOT NULL DEFAULT '',
  details  TEXT NOT NULL DEFAULT '',
  position INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS activities (
  id        TEXT PRIMARY KEY,
  icon      TEXT NOT NULL DEFAULT '',
  iconColor TEXT NOT NULL DEFAULT '',
  text      TEXT NOT NULL DEFAULT '',
  highlight TEXT NOT NULL DEFAULT '',
  time      TEXT NOT NULL DEFAULT '',
  position  INTEGER NOT NULL DEFAULT 0
);

/* Next number handed out per record prefix (TEN, APP, UTL…), so a deleted
   record's number is never reissued. */
CREATE TABLE IF NOT EXISTS id_counters (
  prefix TEXT PRIMARY KEY,
  value  INTEGER NOT NULL DEFAULT 0
);

/* Small key/value corner for bookkeeping: schema version, last save time. */
CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_tenants_stall        ON tenants(stallId);
CREATE INDEX IF NOT EXISTS idx_keepers_tenant       ON stallkeepers(tenantId);
CREATE INDEX IF NOT EXISTS idx_requirements_appl    ON applicant_requirements(applicantId);
CREATE INDEX IF NOT EXISTS idx_bills_stall_period   ON utility_bills(stallId, period);
CREATE INDEX IF NOT EXISTS idx_bills_status         ON utility_bills(status);
CREATE INDEX IF NOT EXISTS idx_violations_status    ON violations(status);
CREATE INDEX IF NOT EXISTS idx_logs_date            ON logs(date);

/* The market office's own board. */
CREATE TABLE IF NOT EXISTS officers (
  id        TEXT PRIMARY KEY,
  name      TEXT NOT NULL DEFAULT '',
  position  TEXT NOT NULL DEFAULT '',
  office    TEXT NOT NULL DEFAULT '',
  reportsTo TEXT NOT NULL DEFAULT '',
  phone     TEXT NOT NULL DEFAULT '',
  email     TEXT NOT NULL DEFAULT '',
  status    TEXT NOT NULL DEFAULT 'Vacant',
  appointed TEXT NOT NULL DEFAULT '',
  seat      INTEGER NOT NULL DEFAULT 0
);

/* Issued verification slips. Keyed by control number, which is the whole point
   of the document: a slip presented at the licensing office must be traceable
   to the one this office tore off the pad. */
CREATE TABLE IF NOT EXISTS verifications (
  controlNo  TEXT PRIMARY KEY,
  purpose    TEXT NOT NULL DEFAULT '',
  issuedTo   TEXT NOT NULL DEFAULT '',
  section    TEXT NOT NULL DEFAULT '',
  stallNo    TEXT NOT NULL DEFAULT '',
  others     TEXT NOT NULL DEFAULT '',
  dateIssued TEXT NOT NULL DEFAULT '',
  validUntil TEXT NOT NULL DEFAULT '',
  issuedBy   TEXT NOT NULL DEFAULT '',
  position   INTEGER NOT NULL DEFAULT 0
);

/* Which checklist lines were ticked on a slip, by their printed wording. */
CREATE TABLE IF NOT EXISTS verification_items (
  rowid_key TEXT PRIMARY KEY,
  controlNo TEXT NOT NULL REFERENCES verifications(controlNo) ON DELETE CASCADE,
  item      TEXT NOT NULL DEFAULT '',
  position  INTEGER NOT NULL DEFAULT 0
);

/* A month of rent settled by a tenant, with the early-payment discount that
   was actually taken off. The discount is recorded, not recomputed: changing
   the rate later must not rewrite what a past month was paid. */
CREATE TABLE IF NOT EXISTS rent_payments (
  rowid_key TEXT PRIMARY KEY,
  tenantId  TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  period    TEXT NOT NULL DEFAULT '',
  paidOn    TEXT NOT NULL DEFAULT '',
  amount    REAL NOT NULL DEFAULT 0,
  discount  REAL NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_rent_payments_tenant ON rent_payments(tenantId);
CREATE INDEX IF NOT EXISTS idx_verif_items_control  ON verification_items(controlNo);
`;

/* The record types the renderer sends, and the columns each one stores. The
   read, write and delete statements are all generated from this, so adding a
   field is a one-line change here plus a column in the schema above. */
const TABLES = {
  stalls: ['id', 'section', 'tenant', 'status', 'lastInspection', 'permit', 'note'],
  tenants: ['id', 'name', 'phone', 'barangay', 'stallId', 'section', 'rent', 'status', 'applicantId',
    'rentDueDay', 'meterElectricity', 'meterWater'],
  applicants: ['id', 'name', 'phone', 'stallType', 'status', 'dateApplied'],
  utilities: ['id', 'type', 'stallId', 'tenantId', 'tenantName', 'section', 'period', 'periodStart', 'periodEnd',
    'meterNumber', 'previousReading', 'currentReading', 'consumption', 'rate', 'fixedCharge', 'amount', 'status',
    'dateIssued', 'dueDate', 'notes'],
  violations: ['id', 'tenant', 'issue', 'status', 'points', 'dateRecorded', 'dateResolved', 'notes'],
  logs: ['id', 'date', 'time', 'type', 'details'],
  activities: ['id', 'icon', 'iconColor', 'text', 'highlight', 'time'],
  officers: ['id', 'name', 'position', 'office', 'reportsTo', 'phone', 'email', 'status', 'appointed'],
};

/* The state key above maps to a differently named table in two cases. */
const TABLE_NAME = { utilities: 'utility_bills' };
const tableOf = (key) => TABLE_NAME[key] || key;

/* Row order is normally kept in `position`. The officers table cannot use that
   name — there, `position` is the post the officer holds — so its order lives
   in `seat`. */
const ORDER_COLUMN = { officers: 'seat' };
const orderOf = (key) => ORDER_COLUMN[key] || 'position';

/* ============================================================
   Connection
   ============================================================ */

let db = null;
let dbFile = '';

/**
 * Opens (creating if needed) the database file and brings its schema up to
 * date. Safe to call more than once — later calls reuse the open handle.
 */
function open(file) {
  if (db) return db;
  dbFile = file;
  fs.mkdirSync(path.dirname(file), { recursive: true });

  db = new Database(file);
  // WAL keeps reads working while a save is in flight and survives a power cut
  // mid-write, which matters on an office machine with no UPS.
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');

  migrate();
  return db;
}

/* Columns added after a database may already have been created. CREATE TABLE
   IF NOT EXISTS brings in whole new tables on its own; a new column on an old
   table has to be added here or the record silently loses the field. */
const ADDED_COLUMNS = [
  ['stalls', 'permit', "TEXT NOT NULL DEFAULT 'Not Recorded'"],
  ['stalls', 'note', "TEXT NOT NULL DEFAULT ''"],
  ['tenants', 'rentDueDay', 'INTEGER NOT NULL DEFAULT 5'],
  ['tenants', 'meterElectricity', "TEXT NOT NULL DEFAULT ''"],
  ['tenants', 'meterWater', "TEXT NOT NULL DEFAULT ''"],
  ['utility_bills', 'meterNumber', "TEXT NOT NULL DEFAULT ''"],
];

function addMissingColumns() {
  for (const [table, column, decl] of ADDED_COLUMNS) {
    const have = db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column);
    if (!have) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${decl}`);
  }
}

function migrate() {
  db.exec(SCHEMA);
  addMissingColumns();
  const current = Number(readMeta('schema_version') || 0);
  if (current !== SCHEMA_VERSION) writeMeta('schema_version', String(SCHEMA_VERSION));
}

function readMeta(key) {
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(key);
  return row ? row.value : '';
}

function writeMeta(key, value) {
  db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, String(value));
}

function close() {
  if (!db) return;
  try { db.close(); } catch { /* already closed */ }
  db = null;
}

/* ============================================================
   Reading
   ============================================================ */

/** True when no records have been filed yet, so the caller can seed defaults. */
function isEmpty() {
  return Object.keys(TABLES).every(
    (key) => db.prepare(`SELECT COUNT(*) AS n FROM ${tableOf(key)}`).get().n === 0,
  );
}

/**
 * Reads every table back into the single object the renderer works with.
 * `position` preserves the order rows were filed in, which is the order the
 * tables and lists are displayed in.
 */
function readAll() {
  const state = {};

  for (const [key, columns] of Object.entries(TABLES)) {
    state[key] = db.prepare(`SELECT ${columns.join(', ')} FROM ${tableOf(key)} ORDER BY ${orderOf(key)}, id`).all();
  }

  // Numbers come back out of SQLite as numbers; a NULL applicantId is dropped
  // so the record matches the shape the renderer builds for a new tenant.
  const keepers = db.prepare('SELECT * FROM stallkeepers ORDER BY tenantId, position').all();
  const payments = db.prepare('SELECT * FROM rent_payments ORDER BY tenantId, period').all();
  state.tenants = state.tenants.map((tenant) => {
    const own = keepers
      .filter((k) => k.tenantId === tenant.id)
      .map((k) => ({ id: k.id, name: k.name, phone: k.phone, relation: k.relation, barangay: k.barangay }));
    const row = {
      ...tenant,
      rent: Number(tenant.rent) || 0,
      rentDueDay: Number(tenant.rentDueDay) || 5,
      keepers: own,
      meters: { Electricity: tenant.meterElectricity || '', Water: tenant.meterWater || '' },
      rentPayments: {},
    };
    delete row.meterElectricity;
    delete row.meterWater;
    for (const pay of payments.filter((r) => r.tenantId === tenant.id)) {
      row.rentPayments[pay.period] = {
        period: pay.period,
        paidOn: pay.paidOn,
        amount: Number(pay.amount) || 0,
        discount: Number(pay.discount) || 0,
      };
    }
    if (row.applicantId === null || row.applicantId === undefined) delete row.applicantId;
    return row;
  });

  const requirements = db.prepare('SELECT * FROM applicant_requirements ORDER BY applicantId, position').all();
  state.applicants = state.applicants.map((applicant) => ({
    ...applicant,
    requirements: requirements.filter((r) => r.applicantId === applicant.id).map((r) => r.requirement),
  }));

  state.violations = state.violations.map((v) => ({ ...v, points: Number(v.points) || 0 }));

  const slipItems = db.prepare('SELECT * FROM verification_items ORDER BY controlNo, position').all();
  state.verifications = db.prepare(
    `SELECT controlNo, purpose, issuedTo, section, stallNo, others, dateIssued, validUntil, issuedBy
       FROM verifications ORDER BY position, controlNo`,
  ).all().map((slip) => ({
    ...slip,
    checked: slipItems.filter((i) => i.controlNo === slip.controlNo).map((i) => i.item),
  }));

  const numeric = ['previousReading', 'currentReading', 'consumption', 'rate', 'fixedCharge', 'amount'];
  state.utilities = state.utilities.map((bill) => {
    const row = { ...bill };
    for (const field of numeric) row[field] = Number(row[field]) || 0;
    return row;
  });

  return state;
}

function readIdCounters() {
  const counters = {};
  for (const row of db.prepare('SELECT prefix, value FROM id_counters').all()) {
    counters[row.prefix] = Number(row.value) || 0;
  }
  return counters;
}

/** Everything the renderer needs at start-up, in one trip. */
function load() {
  return {
    state: readAll(),
    idCounters: readIdCounters(),
    savedAt: readMeta('saved_at'),
    file: dbFile,
  };
}

/* ============================================================
   Writing
   ============================================================ */

/* Prepared statements are built once per table and reused for every save. */
const statementCache = new Map();

function statementsFor(key) {
  if (statementCache.has(key)) return statementCache.get(key);
  const columns = TABLES[key];
  const table = tableOf(key);
  const order = orderOf(key);
  const assignments = columns.filter((c) => c !== 'id').concat(order);

  const built = {
    upsert: db.prepare(
      `INSERT INTO ${table} (${columns.join(', ')}, ${order})
       VALUES (${columns.map((c) => `@${c}`).join(', ')}, @${order})
       ON CONFLICT(id) DO UPDATE SET ${assignments.map((c) => `${c} = excluded.${c}`).join(', ')}`,
    ),
    remove: db.prepare(`DELETE FROM ${table} WHERE id = ?`),
    ids: db.prepare(`SELECT id FROM ${table}`),
  };
  statementCache.set(key, built);
  return built;
}

/* Values arrive from the renderer as whatever the form produced. Columns are
   typed, so each one is coerced to something SQLite will accept rather than
   letting an undefined blow up the transaction. */
function bindable(record, columns, position, orderColumn = 'position') {
  const row = { [orderColumn]: position };
  // The renderer keeps a tenant's meters nested; the table holds one column each.
  if (record && record.meters && typeof record.meters === 'object') {
    record = { ...record, meterElectricity: record.meters.Electricity || '', meterWater: record.meters.Water || '' };
  }
  for (const column of columns) {
    const value = record[column];
    if (value === null || value === undefined) {
      row[column] = column === 'applicantId' ? null : '';
    } else if (typeof value === 'number') {
      row[column] = Number.isFinite(value) ? value : 0;
    } else if (typeof value === 'boolean') {
      row[column] = value ? 1 : 0;
    } else {
      row[column] = String(value);
    }
  }
  // Numeric columns must not arrive as text, or comparisons in SQL misbehave.
  for (const column of ['rent', 'points', 'previousReading', 'currentReading', 'consumption', 'rate', 'fixedCharge', 'amount']) {
    if (column in row) row[column] = Number(row[column]) || 0;
  }
  return row;
}

/**
 * Writes the renderer's object back to the tables: rows that are new or changed
 * are upserted, rows the operator deleted are removed. One transaction, so a
 * crash mid-save leaves the previous records untouched rather than half of each.
 */
function save(payload) {
  const state = payload && payload.state ? payload.state : {};
  const counters = payload && payload.idCounters ? payload.idCounters : {};

  const write = db.transaction(() => {
    for (const [key, columns] of Object.entries(TABLES)) {
      const records = Array.isArray(state[key]) ? state[key] : null;
      if (!records) continue; // key absent — leave that table alone

      const { upsert, remove, ids } = statementsFor(key);
      const keep = new Set();

      records.forEach((record, index) => {
        if (!record || typeof record !== 'object' || !record.id) return;
        keep.add(String(record.id));
        upsert.run(bindable(record, columns, index, orderOf(key)));
      });

      for (const row of ids.all()) {
        if (!keep.has(String(row.id))) remove.run(row.id);
      }
    }

    if (Array.isArray(state.tenants)) writeKeepers(state.tenants);
    if (Array.isArray(state.tenants)) writeRentPayments(state.tenants);
    if (Array.isArray(state.applicants)) writeRequirements(state.applicants);
    if (Array.isArray(state.verifications)) writeVerifications(state.verifications);

    for (const [prefix, value] of Object.entries(counters)) {
      const next = Number(value);
      if (!Number.isFinite(next)) continue;
      // Never walk a counter backwards, or a number could be handed out twice.
      db.prepare(
        `INSERT INTO id_counters (prefix, value) VALUES (?, ?)
         ON CONFLICT(prefix) DO UPDATE SET value = MAX(value, excluded.value)`,
      ).run(String(prefix), next);
    }
  });

  write();

  const savedAt = new Date().toISOString();
  writeMeta('saved_at', savedAt);
  return { savedAt, file: dbFile };
}

/* Keepers and requirements are child rows without a stable key of their own, so
   each parent's set is rewritten wholesale. Both lists are short. */
function writeKeepers(tenants) {
  const clear = db.prepare('DELETE FROM stallkeepers WHERE tenantId = ?');
  const insert = db.prepare(
    `INSERT INTO stallkeepers (rowid_key, tenantId, id, name, phone, relation, barangay, position)
     VALUES (@rowid_key, @tenantId, @id, @name, @phone, @relation, @barangay, @position)`,
  );
  for (const tenant of tenants) {
    if (!tenant || !tenant.id) continue;
    clear.run(String(tenant.id));
    const keepers = Array.isArray(tenant.keepers) ? tenant.keepers : [];
    keepers.forEach((keeper, index) => {
      if (!keeper || !keeper.name) return;
      insert.run({
        rowid_key: `${tenant.id}#${index}`,
        tenantId: String(tenant.id),
        id: String(keeper.id || `KPR-${index + 1}`),
        name: String(keeper.name || ''),
        phone: String(keeper.phone || ''),
        relation: String(keeper.relation || ''),
        barangay: String(keeper.barangay || ''),
        position: index,
      });
    });
  }
}

/* A tenant's settled months. Rewritten wholesale per tenant, like the keepers:
   the set is small and a month can be un-marked as well as marked. */
function writeRentPayments(tenants) {
  const clear = db.prepare('DELETE FROM rent_payments WHERE tenantId = ?');
  const insert = db.prepare(
    `INSERT INTO rent_payments (rowid_key, tenantId, period, paidOn, amount, discount)
     VALUES (@rowid_key, @tenantId, @period, @paidOn, @amount, @discount)`,
  );
  for (const tenant of tenants) {
    if (!tenant || !tenant.id) continue;
    clear.run(String(tenant.id));
    const payments = tenant.rentPayments && typeof tenant.rentPayments === 'object' ? tenant.rentPayments : {};
    for (const [period, pay] of Object.entries(payments)) {
      if (!pay || typeof pay !== 'object') continue;
      insert.run({
        rowid_key: `${tenant.id}#${period}`,
        tenantId: String(tenant.id),
        period: String(pay.period || period),
        paidOn: String(pay.paidOn || ''),
        amount: Number(pay.amount) || 0,
        discount: Number(pay.discount) || 0,
      });
    }
  }
}

/* Issued slips. A control number is never reissued, so rows are added and
   updated but only removed when the renderer no longer lists them. */
function writeVerifications(slips) {
  const upsert = db.prepare(
    `INSERT INTO verifications (controlNo, purpose, issuedTo, section, stallNo, others, dateIssued, validUntil, issuedBy, position)
     VALUES (@controlNo, @purpose, @issuedTo, @section, @stallNo, @others, @dateIssued, @validUntil, @issuedBy, @position)
     ON CONFLICT(controlNo) DO UPDATE SET
       purpose = excluded.purpose, issuedTo = excluded.issuedTo, section = excluded.section,
       stallNo = excluded.stallNo, others = excluded.others, dateIssued = excluded.dateIssued,
       validUntil = excluded.validUntil, issuedBy = excluded.issuedBy, position = excluded.position`,
  );
  const clearItems = db.prepare('DELETE FROM verification_items WHERE controlNo = ?');
  const addItem = db.prepare(
    `INSERT INTO verification_items (rowid_key, controlNo, item, position)
     VALUES (@rowid_key, @controlNo, @item, @position)`,
  );
  const keep = new Set();
  slips.forEach((slip, index) => {
    if (!slip || !slip.controlNo) return;
    keep.add(String(slip.controlNo));
    upsert.run({
      controlNo: String(slip.controlNo),
      purpose: String(slip.purpose || ''),
      issuedTo: String(slip.issuedTo || ''),
      section: String(slip.section || ''),
      stallNo: String(slip.stallNo || ''),
      others: String(slip.others || ''),
      dateIssued: String(slip.dateIssued || ''),
      validUntil: String(slip.validUntil || ''),
      issuedBy: String(slip.issuedBy || ''),
      position: index,
    });
    clearItems.run(String(slip.controlNo));
    (Array.isArray(slip.checked) ? slip.checked : []).forEach((item, n) => {
      addItem.run({ rowid_key: `${slip.controlNo}#${n}`, controlNo: String(slip.controlNo), item: String(item), position: n });
    });
  });
  for (const row of db.prepare('SELECT controlNo FROM verifications').all()) {
    if (!keep.has(String(row.controlNo))) db.prepare('DELETE FROM verifications WHERE controlNo = ?').run(row.controlNo);
  }
}

function writeRequirements(applicants) {
  const clear = db.prepare('DELETE FROM applicant_requirements WHERE applicantId = ?');
  const insert = db.prepare(
    `INSERT INTO applicant_requirements (rowid_key, applicantId, requirement, position)
     VALUES (?, ?, ?, ?)`,
  );
  for (const applicant of applicants) {
    if (!applicant || !applicant.id) continue;
    clear.run(String(applicant.id));
    const requirements = Array.isArray(applicant.requirements) ? applicant.requirements : [];
    requirements.forEach((requirement, index) => {
      if (typeof requirement !== 'string' || !requirement) return;
      insert.run(`${applicant.id}#${index}`, String(applicant.id), requirement, index);
    });
  }
}

/**
 * Empties every record table. Used by "Reset to defaults" and as the first half
 * of restoring a backup; the caller then saves the records it wants in place.
 */
function clearAll() {
  const wipe = db.transaction(() => {
    for (const key of Object.keys(TABLES)) db.prepare(`DELETE FROM ${tableOf(key)}`).run();
    db.prepare('DELETE FROM stallkeepers').run();
    db.prepare('DELETE FROM applicant_requirements').run();
    db.prepare('DELETE FROM id_counters').run();
  });
  wipe();
  writeMeta('saved_at', '');
}

/** Replaces every record in one transaction — restoring a backup. */
function replaceAll(payload) {
  clearAll();
  return save(payload);
}

/* ============================================================
   Maintenance
   ============================================================ */

/**
 * Copies the live database to `target` using SQLite's own backup, which is
 * consistent even if a save lands mid-copy — unlike copying the file by hand.
 */
async function backupTo(target) {
  await db.backup(target);
  return target;
}

/** Reclaims space and defragments; cheap at this size, run on demand. */
function compact() {
  db.pragma('wal_checkpoint(TRUNCATE)');
  db.exec('VACUUM');
}

/** Verifies the file is not corrupt. Returns SQLite's own report. */
function integrityCheck() {
  const rows = db.pragma('integrity_check');
  const result = rows.map((r) => r.integrity_check).join('; ');
  return { ok: result === 'ok', result };
}

function stats() {
  const counts = {};
  for (const key of Object.keys(TABLES)) {
    counts[key] = db.prepare(`SELECT COUNT(*) AS n FROM ${tableOf(key)}`).get().n;
  }
  let bytes = 0;
  try { bytes = fs.statSync(dbFile).size; } catch { /* not written yet */ }
  return { counts, bytes, file: dbFile, schemaVersion: SCHEMA_VERSION, savedAt: readMeta('saved_at') };
}

module.exports = {
  open, close, load, save, replaceAll, clearAll, isEmpty,
  backupTo, compact, integrityCheck, stats,
  readMeta, writeMeta,
  SCHEMA_VERSION,
};
