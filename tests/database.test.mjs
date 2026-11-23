import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/* The Electron main process's database module, run against a real SQLite file.
   Skipped where the native module has not been built for this Node. */
const require = createRequire(import.meta.url);
let db = null;
try { require('better-sqlite3'); db = require('../electron/db.cjs'); } catch { /* not built here */ }

test('records, the directory edition and sign-in accounts are kept apart and survive a reopen', { skip: !db && 'better-sqlite3 is not built for this Node' }, async () => {
  const folder = mkdtempSync(join(tmpdir(), 'pmrms-db-'));
  const file = join(folder, 'market-records.db');
  try {
    db.open(file);
    db.save({
      state: {
        officers: [{ id: 'OFC-001', name: 'Test Officer', position: 'Clerk', photo: 'data:image/jpeg;base64,dGVzdA==' }],
        stalls: [{ id: 'KS-1', section: 'Kakanin', tenant: 'Norida Lerios', status: 'Occupied', permit: 'Not Recorded', lastInspection: '-', note: '' }],
        logs: [
          { id: 'LOG-001', date: '2026-10-24', time: '08:00 AM', type: 'Security', details: 'Signed in.', recordedBy: 'Engr. Luz M. Maderazo' },
          { id: 'LOG-002', date: '2026-10-24', time: '09:30 AM', type: 'Visitation', details: 'Treasurer\'s Office review.', recordedBy: 'Felmar Pica', visitorCount: 3, visitors: ['DELA CRUZ, JUAN', ' Maria  Santos ', ''] },
        ],
        violations: [{ id: 'VIO-001', tenant: 'Norida Lerios', issue: 'Selling outside assigned area', status: 'Reprimanded', points: 1, offence: 2, dateRecorded: '2026-10-20', dateResolved: '2026-10-24', notes: '' }],
      },
      idCounters: { LOG: 1 },
      dataset: 'market-stall-directory-2026-10',
      roster: 'office-orders-2026-10',
    });
    // A later save that names neither marker leaves both as they were.
    db.save({ state: {}, idCounters: {} });
    db.saveAccounts([{ id: 'ACC-001', name: 'Engr. Luz M. Maderazo', role: 'Administrator', passwordHash: 'h', passwordSalt: 's', passwordIterations: 600000, mustChangePassword: true, failedAttempts: 2 }]);
    db.close();

    db.open(file);
    const loaded = db.load();
    assert.equal(loaded.state.officers[0].photo, 'data:image/jpeg;base64,dGVzdA==');
    assert.equal(loaded.dataset, 'market-stall-directory-2026-10');
    assert.equal(loaded.roster, 'office-orders-2026-10');
    assert.equal(loaded.state.stalls[0].id, 'KS-1');
    assert.equal(loaded.state.logs[0].recordedBy, 'Engr. Luz M. Maderazo');
    // A visitation keeps its count and its names — a name with a comma of its own included.
    assert.equal(loaded.state.logs[1].visitorCount, 3);
    assert.deepEqual(loaded.state.logs[1].visitors, ['DELA CRUZ, JUAN', 'Maria Santos']);
    assert.deepEqual(loaded.state.logs[0].visitors, []);
    assert.equal(loaded.state.violations[0].offence, 2);
    assert.equal(loaded.state.violations[0].status, 'Reprimanded');
    const [account] = db.loadAccounts();
    assert.equal(account.role, 'Administrator');
    assert.equal(account.mustChangePassword, true);
    assert.equal(account.failedAttempts, 2);
    assert.equal(account.passwordIterations, 600000);

    // Restoring a backup or resetting replaces the records, never who can sign in.
    db.replaceAll({ state: { stalls: [] }, idCounters: {} });
    db.clearAll();
    assert.equal(db.loadAccounts().length, 1);
    assert.equal(db.stats().schemaVersion, 9);

    // The snapshot taken before the directory update is a complete, readable copy.
    const copy = join(folder, 'before.db');
    await db.backupTo(copy);
    assert.ok(existsSync(copy));
  } finally {
    db.close();
    rmSync(folder, { recursive: true, force: true });
  }
});

test('an ended tenancy keeps its rent payments and keepers after the tenant row is gone', { skip: !db && 'better-sqlite3 is not built for this Node' }, async () => {
  const folder = mkdtempSync(join(tmpdir(), 'pmrms-db-'));
  const file = join(folder, 'market-records.db');
  const tenant = {
    id: 'TEN-001', name: 'Norida Lerios', phone: '—', barangay: '', stallId: 'KS-1', section: 'Kakanin', rent: 1000, status: 'Active',
    keepers: [{ id: 'KPR-1', name: 'Ana Lerios', phone: '', relation: 'Daughter', barangay: '' }],
    meters: { Electricity: 'KW202392137204I', Water: '' }, rentDueDay: 5,
    rentPayments: { '2026-10': { period: '2026-10', paidOn: '2026-10-03', amount: 950, discount: 50 }, '2026-11': { period: '2026-11', paidOn: '2026-11-10', amount: 1000, discount: 0 } },
  };
  try {
    db.open(file);
    db.save({ state: { tenants: [tenant], endedTenancies: [] }, idCounters: {} });
    // The tenancy ends: the tenant row (and with it its rent_payments rows) goes, the ended record arrives.
    db.save({ state: { tenants: [], endedTenancies: [{ ...tenant, endedOn: '2026-11-17', endReason: 'Removed from tenant records', endedBy: 'Felmar Pica' }] }, idCounters: {} });
    db.close();

    db.open(file);
    const { state } = db.load();
    assert.equal(state.tenants.length, 0);
    assert.equal(state.endedTenancies.length, 1);
    const ended = state.endedTenancies[0];
    assert.equal(ended.endedOn, '2026-11-17');
    assert.equal(ended.endReason, 'Removed from tenant records');
    assert.equal(ended.endedBy, 'Felmar Pica');
    assert.deepEqual(ended.rentPayments, tenant.rentPayments);
    assert.deepEqual(ended.keepers, tenant.keepers);
    assert.deepEqual(ended.meters, tenant.meters);
    assert.equal(ended.rent, 1000);
    assert.ok(!('paymentsJson' in ended) && !('keepersJson' in ended) && !('meterElectricity' in ended));
    assert.equal(db.stats().counts.endedTenancies, 1);
  } finally {
    db.close();
    rmSync(folder, { recursive: true, force: true });
  }
});

test('daily copies: one per day, never half-written, only the newest kept, nothing else touched', { skip: !db && 'better-sqlite3 is not built for this Node' }, async () => {
  const backups = require('../electron/backups.cjs');
  const folder = mkdtempSync(join(tmpdir(), 'pmrms-daily-'));
  const daily = join(folder, 'daily');
  try {
    db.open(join(folder, 'market-records.db'));
    db.save({ state: { stalls: [{ id: 'KS-1', section: 'Kakanin', tenant: 'Norida Lerios', status: 'Occupied', permit: 'Not Recorded', lastInspection: '-', note: '' }] }, idCounters: {} });
    const backupTo = (target) => db.backupTo(target);
    const { mkdirSync, writeFileSync, readdirSync } = await import('node:fs');
    mkdirSync(daily, { recursive: true });
    writeFileSync(join(daily, 'keep-me.txt'), 'not a daily copy');

    const first = await backups.takeDailyCopy({ backupTo, folder: daily, date: '2026-10-01', keep: 3 });
    assert.ok(first.endsWith('market-records-2026-10-01.db'));
    assert.equal(await backups.takeDailyCopy({ backupTo, folder: daily, date: '2026-10-01', keep: 3 }), '', 'a day is copied once');
    for (const date of ['2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05']) await backups.takeDailyCopy({ backupTo, folder: daily, date, keep: 3 });

    assert.deepEqual(backups.listDailyCopies(daily), ['market-records-2026-10-03.db', 'market-records-2026-10-04.db', 'market-records-2026-10-05.db']);
    assert.equal(backups.latestDailyDate(daily), '2026-10-05');
    assert.ok(readdirSync(daily).includes('keep-me.txt'), 'files that are not daily copies are left alone');
    assert.ok(!readdirSync(daily).some((f) => f.endsWith('.partial')), 'no half-written copy is left behind');

    // A copy is a complete database holding the records.
    const Database = require('better-sqlite3');
    const copy = new Database(join(daily, 'market-records-2026-10-05.db'), { readonly: true });
    assert.equal(copy.prepare('SELECT tenant FROM stalls WHERE id = ?').get('KS-1').tenant, 'Norida Lerios');
    copy.close();
    assert.match(backups.localDate(new Date(2026, 0, 9)), /^2026-01-09$/);
  } finally {
    db.close();
    rmSync(folder, { recursive: true, force: true });
  }
});

test('LCA, a stall\'s own rate and the section rates survive a reopen; an old stall row reads as never set', { skip: !db && 'better-sqlite3 is not built for this Node' }, async () => {
  const folder = mkdtempSync(join(tmpdir(), 'pmrms-db-'));
  const file = join(folder, 'market-records.db');
  try {
    db.open(file);
    db.save({
      state: {
        stalls: [
          { id: 'FS-1', section: 'Fish', tenant: 'Norida Lerios', status: 'Occupied', permit: 'With BP', lastInspection: '-', note: '', ownRent: 1800, lca: true },
          { id: 'FS-2', section: 'Fish', tenant: 'Vacant', status: 'Available', permit: 'Not Recorded', lastInspection: '-', note: '', ownRent: 0, lca: false },
          { id: 'FS-3', section: 'Fish', tenant: 'Vacant', status: 'Available', permit: 'Not Recorded', lastInspection: '-', note: '' },
        ],
        sectionRents: [{ id: 'Fish', rent: 1100 }, { id: 'Kakanin', rent: 1000 }],
      },
      idCounters: {},
    });
    db.close();

    db.open(file);
    const { state } = db.load();
    assert.equal(state.stalls[0].lca, true);
    assert.equal(state.stalls[1].lca, false);
    assert.equal(state.stalls[2].lca, false);
    assert.equal(state.stalls[0].ownRent, 1800);
    assert.equal(state.stalls[1].ownRent, 0);
    assert.equal('ownRent' in state.stalls[2], false);
    assert.deepEqual(state.sectionRents, [{ id: 'Fish', rent: 1100 }, { id: 'Kakanin', rent: 1000 }]);
  } finally {
    db.close();
    rmSync(folder, { recursive: true, force: true });
  }
});

test('a 0.3.1 database with a contract keyed in on a tenant opens with LCA ticked on that stall', { skip: !db && 'better-sqlite3 is not built for this Node' }, async () => {
  const folder = mkdtempSync(join(tmpdir(), 'pmrms-db-'));
  const file = join(folder, 'market-records.db');
  try {
    db.open(file);
    db.save({
      state: {
        stalls: [
          { id: 'FS-1', section: 'Fish', tenant: 'A', status: 'Occupied', permit: 'Not Recorded', lastInspection: '-', note: '' },
          { id: 'FS-2', section: 'Fish', tenant: 'B', status: 'Occupied', permit: 'Not Recorded', lastInspection: '-', note: '' },
        ],
        tenants: [
          { id: 'TEN-001', name: 'A', stallId: 'FS-1', section: 'Fish', rent: 1000, status: 'Active', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: 5, rentPayments: {} },
          { id: 'TEN-002', name: 'B', stallId: 'FS-2', section: 'Fish', rent: 1000, status: 'Active', keepers: [], meters: { Electricity: '', Water: '' }, rentDueDay: 5, rentPayments: {} },
        ],
      },
      idCounters: {},
    });
    db.close();

    // Put the file back as 0.3.1 left it: schema 8, lease columns on tenants.
    const Database = require('better-sqlite3');
    const raw = new Database(file);
    for (const column of ['leaseContractNo', 'leaseDateSigned', 'leaseStartDate', 'leaseEndDate', 'leaseRemarks']) {
      raw.exec(`ALTER TABLE tenants ADD COLUMN ${column} TEXT NOT NULL DEFAULT ''`);
    }
    raw.exec("UPDATE tenants SET leaseContractNo = '2026-014' WHERE id = 'TEN-001'");
    raw.exec("UPDATE meta SET value = '8' WHERE key = 'schema_version'");
    raw.close();

    db.open(file);
    const { state } = db.load();
    assert.equal(state.stalls.find((s) => s.id === 'FS-1').lca, true);
    assert.equal(state.stalls.find((s) => s.id === 'FS-2').lca, false);
    assert.equal(db.stats().schemaVersion, 9);
  } finally {
    db.close();
    rmSync(folder, { recursive: true, force: true });
  }
});

test('water rates and the tiers a water bill was billed at survive a reopen; an older bill has none', { skip: !db && 'better-sqlite3 is not built for this Node' }, async () => {
  const folder = mkdtempSync(join(tmpdir(), 'pmrms-db-'));
  const file = join(folder, 'market-records.db');
  const tiers = [{ id: 'minimum', rate: 498.96 }, { id: '11-20', rate: 54.93 }, { id: '21-30', rate: 63.84 }, { id: '31-up', rate: 73.43 }];
  const bill = { type: 'Water', stallId: 'FS-1', tenantId: '', tenantName: 'Imee Palita', section: 'Fish', meterNumber: '', period: '2026-10',
    periodStart: '2026-10-01', periodEnd: '2026-10-31', previousReading: 675, currentReading: 689, consumption: 14, fixedCharge: 0,
    status: 'Unpaid', dateIssued: '2026-11-15', dueDate: '2026-11-30', notes: '' };
  try {
    db.open(file);
    db.save({
      state: {
        waterRates: [{ id: 'minimum', rate: 520 }, ...tiers.slice(1)],
        utilities: [
          { ...bill, id: 'UTL-001', rate: 498.96, amount: 718.68, waterRates: tiers },
          { ...bill, id: 'UTL-002', rate: 25, amount: 350 },
        ],
      },
      idCounters: {},
    });
    db.close();

    db.open(file);
    const { state } = db.load();
    assert.deepEqual(state.waterRates, [{ id: 'minimum', rate: 520 }, ...tiers.slice(1)]);
    assert.deepEqual(state.utilities[0].waterRates, tiers);
    assert.equal(state.utilities[0].amount, 718.68);
    assert.equal('waterRates' in state.utilities[1], false);
    assert.equal('waterRatesJson' in state.utilities[1], false);
  } finally {
    db.close();
    rmSync(folder, { recursive: true, force: true });
  }
});
