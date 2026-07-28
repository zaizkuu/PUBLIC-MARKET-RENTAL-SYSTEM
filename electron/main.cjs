// Electron main process for the Public Market Rental Monitoring System.
//
// The app is a fully offline static SPA that keeps its data in localStorage,
// which Electron persists in the user-data directory (see DATA LOCATION below).
// CommonJS (.cjs) because package.json declares "type": "module".

const { app, BrowserWindow, Menu, shell, dialog } = require('electron');
const path = require('node:path');

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
      // The renderer is trusted local content but has no need for Node access.
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
  buildMenu();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
