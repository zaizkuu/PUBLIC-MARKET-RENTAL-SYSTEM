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
    assert.equal(db.stats().schemaVersion, 5);

    // The snapshot taken before the directory update is a complete, readable copy.
    const copy = join(folder, 'before.db');
    await db.backupTo(copy);
    assert.ok(existsSync(copy));
  } finally {
    db.close();
    rmSync(folder, { recursive: true, force: true });
  }
});
