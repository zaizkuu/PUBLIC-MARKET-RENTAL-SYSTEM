/** Accept both direct system backups and reports exported with a data envelope. */
export function backupRecords(input: unknown): Record<string, unknown[]> {
  const object = (value: unknown): value is Record<string, unknown> =>
    !!value && typeof value === 'object' && !Array.isArray(value);
  const required = ['applicants', 'tenants', 'stalls', 'logs', 'activities'];
  const candidate = object(input) && required.some(key => key in input)
    ? input
    : object(input) && object(input.data) ? input.data : null;
  if (!candidate) throw new Error('Select a system backup JSON file. Both direct backups and exported reports are supported.');
  const missing = required.filter(key => !Array.isArray(candidate[key]));
  if (missing.length) throw new Error(`This backup is missing valid record lists: ${missing.join(', ')}.`);
  const optional = ['officers', 'violations', 'utilities', 'verifications'];
  for (const key of [...required, ...optional]) {
    if (!(key in candidate)) continue;
    const rows = candidate[key];
    if (!Array.isArray(rows) || rows.some(row => !object(row)))
      throw new Error(`The ${key} list contains invalid records. No data has been imported.`);
  }
  return candidate as Record<string, unknown[]>;
}