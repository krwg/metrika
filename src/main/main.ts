import { app, BrowserWindow, Menu, Tray, protocol, net } from 'electron';
import path from 'path';
import fs from 'fs';
import { pathToFileURL } from 'url';
import { getDatabasePath, getDb } from './db';
import { initRegistry, getSession, closeSession } from './registry';
import { registerIpcHandlers } from './ipc';
import { ScannerManager } from './scanner';
import { runAutoBackup, stopAutoBackupScheduler } from './autobackup';
import { stopAutomationScheduler } from './automation';
import { stopCrmRemoteServer } from './crmRemoteServer';
import { stopMiapiServer } from './miapiServer';
import { loadAppWindowUi } from './configWindow';
import { loadAppIcon } from './appIcon';
import { reloadAllRendererWindows } from './uiBroadcast';

function isPipeError(err: unknown) {
  const code = (err as NodeJS.ErrnoException)?.code;
  return code === 'EPIPE' || code === 'EIO' || code === 'ERR_STREAM_DESTROYED';
}

function silenceBrokenPipes() {
  for (const stream of [process.stdout, process.stderr]) {
    try {
      stream?.on?.('error', (err) => {
        if (isPipeError(err)) return;
      });
    } catch {  }
  }
  const wrap = (fn: (...args: unknown[]) => void) => (...args: unknown[]) => {
    try { fn(...args); } catch (err) { if (!isPipeError(err)) throw err; }
  };
  console.log = wrap(console.log.bind(console));
  console.info = wrap(console.info.bind(console));
  console.warn = wrap(console.warn.bind(console));
  console.error = wrap(console.error.bind(console));
  process.on('uncaughtException', (err) => {
    if (isPipeError(err)) return;
    try { console.error('[Metrika] Uncaught:', err); } catch {  }
  });
  process.on('unhandledRejection', (reason) => {
    if (isPipeError(reason)) return;
    try { console.error('[Metrika] Unhandled rejection:', reason); } catch {  }
  });
}

silenceBrokenPipes();

if (process.platform === 'win32') {
  app.setAppUserModelId('com.metrika.home');
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'metrika-photo',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      bypassCSP: true,
      stream: true,
      corsEnabled: true,
    },
  },
]);

let mainWindow: BrowserWindow | null = null;
const scanner = new ScannerManager();
let tray: Tray | null = null;
let isQuitting = false;
const hasSingleInstanceLock = app.requestSingleInstanceLock();
const isDev = process.env.ELECTRON_DEV === '1';
let keepAliveTimer: NodeJS.Timeout | null = null;

if (!hasSingleInstanceLock) {
  app.quit();
}

app.on('second-instance', () => {
  ensureMainWindowVisible();
});

function createTray() {
  try {
    const icon = loadAppIcon(true);
    if (icon.isEmpty()) {
      console.warn('[Metrika] Tray icon unavailable, skipping tray');
      return;
    }
    tray = new Tray(icon);
    tray.setToolTip('Metrika Home [0.5]');
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Open Metrika Home', click: () => ensureMainWindowVisible() },
      { type: 'separator' },
      { label: 'Quit', click: () => { isQuitting = true; app.quit(); } },
    ]));
    tray.on('click', () => ensureMainWindowVisible());
  } catch (error) {
    console.warn('[Metrika] Tray unavailable:', error);
  }
}

export function setMainWindowBounds(mode: 'launcher' | 'workspace') {
  if (!mainWindow) return;
  if (mode === 'launcher') {
    mainWindow.setMinimumSize(520, 480);
    mainWindow.setSize(640, 520, true);
    mainWindow.center();
  } else {
    mainWindow.setMinimumSize(720, 560);
    mainWindow.setSize(1400, 900, true);
    mainWindow.center();
  }
}

function ensureMainWindowVisible() {
  if (isQuitting) return;
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function createWindow() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([]));
  const windowIcon = loadAppIcon(false);
  mainWindow = new BrowserWindow({
    width: 640,
    height: 520,
    minWidth: 520,
    minHeight: 480,
    backgroundColor: '#e8e8e0',
    title: 'Metrika Home [0.5]',
    icon: windowIcon.isEmpty() ? undefined : windowIcon,
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#ffd83d',
      symbolColor: '#2a2a2a',
      height: 32,
    },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.setMenuBarVisibility(false);

  const htmlPath = path.join(__dirname, '../renderer/index.html');
  mainWindow.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.error('[Metrika] did-fail-load', code, desc, url);
    if (isDev && String(url || '').includes('127.0.0.1:5173')) {
      console.warn('[Metrika] Vite unavailable — loading built UI from', htmlPath);
      if (fs.existsSync(htmlPath)) void mainWindow?.loadFile(htmlPath);
    }
  });
  void loadAppWindowUi(mainWindow);

  mainWindow.on('close', (event: Electron.Event) => {
    if (isQuitting) return;
    event.preventDefault();
    mainWindow?.hide();
    setTimeout(() => {
      if (!isQuitting) ensureMainWindowVisible();
    }, 120);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    if (!isQuitting) {
      setTimeout(() => {
        if (!isQuitting && (!mainWindow || mainWindow.isDestroyed())) createWindow();
      }, 200);
    }
  });
}

function startKeepAlive() {
  if (keepAliveTimer) return;
  keepAliveTimer = setInterval(() => {
    if (isQuitting) return;
    if (!mainWindow || mainWindow.isDestroyed()) {
      createWindow();
      return;
    }
    if (!mainWindow.isVisible() && !mainWindow.isMinimized()) {
      mainWindow.show();
    }
  }, 4000);
}

function reregisterIpcFromDisk() {
  try {
    const drop = (id: string) => {
      try {
        const resolved = require.resolve(id);
        delete require.cache[resolved];
      } catch {  }
    };

    drop('./ipc');
    drop('./ipcModern');
    drop('./companyHub');
    drop('./crmHub');

    const fresh = require('./ipc') as typeof import('./ipc');
    fresh.registerIpcHandlers(scanner);
    console.log('[Metrika] Dev: IPC handlers re-registered from disk');
  } catch (error) {
    console.error('[Metrika] Dev: IPC re-register failed:', error);
  }
}

function startDevHotReload() {
  if (!isDev) return;
  let timer: NodeJS.Timeout | null = null;
  const schedule = (filename: string) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      if (isQuitting) return;
      const base = path.basename(String(filename));

      if (base !== 'preload.js' && base !== 'main.js') {
        console.log('[Metrika] Dev: main module changed → re-register IPC');
        reregisterIpcFromDisk();
      }
      console.log('[Metrika] Dev: reload windows after main rebuild');
      reloadAllRendererWindows();
    }, 600);
  };
  try {
    fs.watch(__dirname, { recursive: true }, (_event, filename) => {
      if (!filename || !String(filename).endsWith('.js')) return;
      schedule(String(filename));
    });
    console.log('[Metrika] Dev hot-reload watching', __dirname);
  } catch (error) {
    console.warn('[Metrika] Dev hot-reload watch failed:', error);
  }
}

function registerPhotoProtocol() {
  protocol.handle('metrika-photo', async (request) => {
    try {
      const parsed = new URL(request.url);
      const raw = parsed.hostname || parsed.pathname.replace(/^\//, '');
      const itemId = Number(String(raw).replace(/[^\d]/g, ''));
      if (!Number.isInteger(itemId) || itemId <= 0) {
        return new Response('Not found', { status: 404 });
      }
      const db = getDb();
      const photo = db.prepare('SELECT file_path FROM item_photos WHERE item_id = ? ORDER BY id DESC LIMIT 1').get(itemId) as any;
      const filePath = photo?.file_path;
      if (!filePath || !fs.existsSync(filePath)) {
        return new Response('Not found', { status: 404 });
      }
      return net.fetch(pathToFileURL(filePath).toString());
    } catch {
      return new Response('Error', { status: 500 });
    }
  });
}

app.whenReady().then(() => {
  if (!hasSingleInstanceLock) return;
  try {
    initRegistry();
  } catch (error) {
    console.error('[Metrika] Registry init failed:', error);
    throw error;
  }

  registerPhotoProtocol();

  scanner.on('scan', (barcode) => {
    mainWindow?.webContents.send('scanner:barcode', barcode);
  });
  scanner.on('status', (status) => {
    mainWindow?.webContents.send('scanner:status', status);
  });

  registerIpcHandlers(scanner);
  createWindow();
  createTray();
  startKeepAlive();
  startDevHotReload();

  const forward = (level: 'info' | 'warn' | 'error') => (...args: unknown[]) => {
    try {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      const text = args.map((arg) => {
        if (arg instanceof Error) return `${arg.message}${arg.stack ? `\n${arg.stack}` : ''}`;
        if (typeof arg === 'string') return arg;
        try { return JSON.stringify(arg); } catch { return String(arg); }
      }).join(' ');
      mainWindow.webContents.send('console:log', { level, text });
    } catch {  }
  };
  const safeCall = (fn: (...a: unknown[]) => void, args: unknown[]) => {
    try { fn(...args); } catch (err) { if (!isPipeError(err)) {  } }
  };
  const prevWarn = console.warn;
  const prevError = console.error;
  console.warn = (...args: unknown[]) => { safeCall(prevWarn, args); forward('warn')(...args); };
  console.error = (...args: unknown[]) => { safeCall(prevError, args); forward('error')(...args); };
});

app.on('before-quit', () => {
  isQuitting = true;
  if (keepAliveTimer) {
    clearInterval(keepAliveTimer);
    keepAliveTimer = null;
  }
  stopAutoBackupScheduler();
  try { stopAutomationScheduler(); } catch {  }
  try { stopCrmRemoteServer(); } catch {  }
  try { stopMiapiServer(); } catch {  }
  try {
    if (getDatabasePath() && getSession()) {
      runAutoBackup({ keep: 30, reason: 'quit' });
    }
  } catch (error) {
    console.warn('[Metrika] Auto-backup skipped:', error);
  }
  try { closeSession(); } catch {  }
  try { scanner.disconnect(); } catch {  }
});

app.on('window-all-closed', () => {
  if (isQuitting) {
    if (process.platform !== 'darwin') app.quit();
    return;
  }

  setTimeout(() => {
    if (!isQuitting && (!mainWindow || mainWindow.isDestroyed())) createWindow();
  }, 150);
});

app.on('activate', () => {
  ensureMainWindowVisible();
});
