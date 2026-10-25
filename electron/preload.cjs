// The only bridge between the renderer (the React app) and the desktop shell.
//
// One surface is exposed and nothing else: the SQLite database (records and the
// sign-in accounts), which only the main process may touch, and saving the
// analytics report as a PDF, which needs a save dialog and the file system. The renderer stays sandboxed — no Node, no filesystem, no shell — so a bug in the interface
// cannot reach the rest of the machine. `contextIsolation` stays on and
// `nodeIntegration` stays off; the calls listed here are the whole surface.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pmrmsDB', {
  /** True whenever the app runs inside Electron, i.e. the database exists. */
  available: true,

  /** Every record, the ID counters and the last save time, for start-up. */
  load: () => ipcRenderer.invoke('db:load'),

  /** Writes changed records and removes deleted ones. Resolves with the save time. */
  save: (payload) => ipcRenderer.invoke('db:save', payload),

  /** Empties the tables, then files the records given — restoring a backup. */
  replaceAll: (payload) => ipcRenderer.invoke('db:replace-all', payload),

  /** Empties every table. The renderer then saves the starting records. */
  clear: () => ipcRenderer.invoke('db:clear'),

  /** Row counts, file size and location — shown on the Settings page. */
  stats: () => ipcRenderer.invoke('db:stats'),

  /** Asks SQLite whether the file is intact. */
  integrityCheck: () => ipcRenderer.invoke('db:integrity-check'),

  /** Opens a save dialog and copies the database there. */
  backup: () => ipcRenderer.invoke('db:backup'),

  /** Asks where to save, then prints the analytics report laid out on screen to a PDF there and opens it. */
  saveReportPdf: (fileName) => ipcRenderer.invoke('report:save-pdf', fileName),

  /** Opens the folder holding the database in File Explorer. */
  revealFolder: () => ipcRenderer.invoke('db:reveal-folder'),

  /** Copies the database into its backups folder before a bulk change. */
  snapshot: (label) => ipcRenderer.invoke('db:snapshot', label),

  /** Who may sign in. Stored apart from the records; see db.cjs. */
  loadAccounts: () => ipcRenderer.invoke('accounts:load'),
  saveAccounts: (accounts) => ipcRenderer.invoke('accounts:save', accounts),
});
