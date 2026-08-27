// Electron main process for the Public Market Rental Monitoring System.
//
// The app is fully offline. Records live in a SQLite database file in the
// user-data directory, owned by this process (see db.cjs); the renderer reaches
// it only through the calls listed in preload.cjs.
// CommonJS (.cjs) because package.json declares "type": "module".

const { app, BrowserWindow, Menu, shell, dialog, ipcMain } = require('electron');
const path = require('node:path');
const db = require('./db.cjs');

/** Where the records are kept. Backing this file up backs up the whole system. */
const databaseFile = () => path.join(app.getPath('userData'), 'market-records.db');

// A dev server URL is passed in by `npm run electron:dev`; otherwise we load
// the built files from dist/.
const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
const isDev = !!DEV_SERVER_URL;

/** Single instance only — a second launch focuses the existing window. */
if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    backgroundColor: '#f5f7fb',
    title: 'Tanauan Public Market — Market Office',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    autoHideMenuBar: !isDev,
    webPreferences: {
      // The renderer is trusted local content but has no need for Node access:
      // it reaches the database through the preload bridge instead.
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      spellcheck: false,
    },
  });

  // Avoid the white flash while the renderer paints its first frame.
  mainWindow.once('ready-to-show', () => {
    mainWindow.maximize();
    mainWindow.show();
  });

  if (isDev) {
    mainWindow.loadURL(DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  // Surface a real error instead of a blank window if dist/ is missing.
  mainWindow.webContents.on('did-fail-load', (_e, errorCode, errorDescription) => {
    dialog.showErrorBox(
      'Unable to start',
      `The application files could not be loaded.\n\n${errorDescription} (${errorCode})\n\nPlease reinstall the application.`,
    );
  });

  // Any external link (the mailto:/tel: contacts on the Support page) opens in
  // the system handler rather than replacing the app window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:|^mailto:|^tel:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const current = mainWindow.webContents.getURL();
    if (url !== current) {
      event.preventDefault();
      if (/^https?:|^mailto:|^tel:/.test(url)) shell.openExternal(url);
    }
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

/* ============================================================
   Database
   ============================================================ */

/**
 * Opens the database before the first window loads. If the file cannot be
 * opened at all — a full disk, a folder the operator has no rights to — the app
 * says so plainly and stops, rather than starting up and silently losing every
 * record the clerk files that day.
 */
function openDatabase() {
  try {
    db.open(databaseFile());
    return true;
  } catch (error) {
    dialog.showErrorBox(
      'Unable to open the records database',
      `The system could not open its records file.

${databaseFile()}

${error.message}

` +
      'Check that the folder is available and not full, then start the application again.',
    );
    return false;
  }
}

/* Every database call the renderer can make. Each one is wrapped so a failure
   comes back as a message the interface can show instead of a dead promise. */
function registerDatabaseHandlers() {
  const handle = (channel, fn) => {
    ipcMain.handle(channel, async (_event, ...args) => {
      try {
        return { ok: true, data: await fn(...args) };
      } catch (error) {
        console.error(`[db] ${channel} failed:`, error);
        return { ok: false, error: error.message };
      }
    });
  };

  handle('db:load', () => db.load());
  handle('db:save', (payload) => db.save(payload));
  handle('db:replace-all', (payload) => db.replaceAll(payload));
  handle('db:clear', () => { db.clearAll(); return true; });
  handle('db:stats', () => db.stats());
  handle('db:integrity-check', () => db.integrityCheck());

  handle('db:reveal-folder', async () => {
    await shell.openPath(app.getPath('userData'));
    return app.getPath('userData');
  });

  handle('db:backup', async () => {
    const stamp = new Date().toISOString().slice(0, 10);
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Save a copy of the records database',
      defaultPath: path.join(app.getPath('documents'), `market-records-backup-${stamp}.db`),
      filters: [{ name: 'Market records database', extensions: ['db'] }],
    });
    if (canceled || !filePath) return { canceled: true };
    await db.backupTo(filePath);
    return { canceled: false, filePath };
  });
}

/**
 * Trimmed menu for a non-technical operator: no Node/Chromium internals, but
 * printing, zoom and reload stay reachable, plus a pointer to the data folder
 * for backups.
 */
function buildMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Print…',
          accelerator: 'CmdOrCtrl+P',
          click: () => mainWindow?.webContents.print(),
        },
        { type: 'separator' },
        { role: 'quit', label: 'Exit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload', label: 'Refresh' },
        { type: 'separator' },
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Back Up Records Database…',
          click: async () => {
            try {
              const stamp = new Date().toISOString().slice(0, 10);
              const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
                title: 'Save a copy of the records database',
                defaultPath: path.join(app.getPath('documents'), `market-records-backup-${stamp}.db`),
                filters: [{ name: 'Market records database', extensions: ['db'] }],
              });
              if (canceled || !filePath) return;
              await db.backupTo(filePath);
              dialog.showMessageBox(mainWindow, {
                type: 'info', title: 'Backup saved', buttons: ['OK'],
                message: 'A copy of the records has been saved.',
                detail: filePath,
              });
            } catch (error) {
              dialog.showErrorBox('Backup failed', error.message);
            }
          },
        },
        {
          label: 'Open Data Folder',
          click: () => shell.openPath(app.getPath('userData')),
        },
        {
          label: 'About',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About',
              message: 'Tanauan Public Market — Market Office',
              detail:
                `Version ${app.getVersion()}\n\n` +
                'Public Market Rental Monitoring System.\n' +
                'Runs fully offline. All records are stored on this computer.\n\n' +
                'Use Support → Backup & Restore regularly to keep a copy of your data.',
              buttons: ['OK'],
            });
          },
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.whenReady().then(() => {
  if (!openDatabase()) { app.exit(1); return; }
  registerDatabaseHandlers();
  buildMenu();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Flush and release the database file so the next launch — or a backup copied
// out of the data folder — sees a complete, closed file.
app.on('will-quit', () => db.close());
