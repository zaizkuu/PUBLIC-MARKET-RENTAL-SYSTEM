// Daily copies of the records database.
//
// A copy every day the system is open, kept for a set number of days in a
// folder beside the database. The copy is made by SQLite's own backup (passed
// in as `backupTo`), so it is whole even if a save lands mid-copy, and it is
// written under a temporary name first so a half-written file is never
// mistaken for a backup. Only this module's own dated copies are ever pruned.
//
// Kept apart from main.cjs so the Node test runner can exercise it without
// Electron (see tests/database.test.mjs).

const path = require('node:path');
const fs = require('node:fs');

const DAILY_NAME = /^market-records-(\d{4}-\d{2}-\d{2})\.db$/;

/** YYYY-MM-DD in local time — the office's day, not UTC's. */
function localDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** The dated copies in `folder`, oldest first. */
function listDailyCopies(folder) {
  try { return fs.readdirSync(folder).filter((f) => DAILY_NAME.test(f)).sort(); } catch { return []; }
}

/** The date of the newest copy, or ''. */
function latestDailyDate(folder) {
  const copies = listDailyCopies(folder);
  return copies.length ? copies[copies.length - 1].match(DAILY_NAME)[1] : '';
}

/**
 * Makes today's copy if there is none yet, then keeps only the newest `keep`.
 * Resolves with the copy's path, or '' when today's already existed.
 */
async function takeDailyCopy({ backupTo, folder, date = localDate(), keep = 30 }) {
  const target = path.join(folder, `market-records-${date}.db`);
  if (fs.existsSync(target)) return '';
  fs.mkdirSync(folder, { recursive: true });
  const partial = `${target}.partial`;
  fs.rmSync(partial, { force: true });
  await backupTo(partial);
  fs.renameSync(partial, target);
  const copies = listDailyCopies(folder);
  for (const old of copies.slice(0, Math.max(0, copies.length - keep))) fs.rmSync(path.join(folder, old), { force: true });
  return target;
}

module.exports = { DAILY_NAME, localDate, listDailyCopies, latestDailyDate, takeDailyCopy };
