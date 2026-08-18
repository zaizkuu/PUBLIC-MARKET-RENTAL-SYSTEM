// The only bridge between the renderer (the React app) and the desktop shell.
//
// Two surfaces are exposed and nothing else: the SQLite database, which only
// the main process may touch, and the local assistant model. The renderer stays
// sandboxed — no Node, no filesystem, no shell — so a bug in the interface
// cannot reach the rest of the machine. `contextIsolation` stays on and
// `nodeIntegration` stays off; the calls listed here are the whole surface.
//
// Both run entirely on this computer. Nothing here reaches the network.

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

contextBridge.exposeInMainWorld('marketAssistant', {
  // Is a local language model loaded and usable?
  ready: () => ipcRenderer.invoke('assistant:ready'),
  // Which of the assistant's known questions is this? Returns a key or null.
  classify: (question, intents) => ipcRenderer.invoke('assistant:classify', question, intents),
  // Reword an already-computed answer. The page verifies every figure it
  // returns before showing it.
  phrase: (question, headline, lines) => ipcRenderer.invoke('assistant:phrase', question, headline, lines),
  // The model file in use, for the badge on screen.
  modelName: () => ipcRenderer.invoke('assistant:model-name'),
});
