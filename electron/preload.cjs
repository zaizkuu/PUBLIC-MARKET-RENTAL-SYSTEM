// Bridge between the renderer (the React app) and the SQLite database, which
// only the main process may touch.
//
// The renderer stays sandboxed — no Node, no direct file access. It gets exactly
// the calls listed here and nothing else, so a bug in the interface cannot reach
// the rest of the machine.

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

  /** Opens the folder holding the database in File Explorer. */
  revealFolder: () => ipcRenderer.invoke('db:reveal-folder'),
});
