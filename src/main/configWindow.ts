import { BrowserWindow, net } from 'electron';
import fs from 'fs';
import path from 'path';
import { loadAppIcon } from './appIcon';

export type AppWindowMode = 'configurator' | 'crm' | 'client';

type ModeSpec = {
  title: string;
  hash: string;
  width: number;
  height: number;
  minWidth: number;
  minHeight: number;
};

const MODE_SPECS: Record<AppWindowMode, ModeSpec> = {
  configurator: {
    title: 'Metrika Home [0.5] — Editor',
    hash: 'configurator',
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 640,
  },
  crm: {
    title: 'Metrika Home [0.5] — CRM',
    hash: 'crm',
    width: 1360,
    height: 900,
    minWidth: 960,
    minHeight: 680,
  },
  client: {
    title: 'Metrika Home [0.5] — Client',
    hash: 'client',
    width: 1080,
    height: 780,
    minWidth: 720,
    minHeight: 560,
  },
};

const windows = new Map<AppWindowMode, BrowserWindow>();

const detachedWindows = new Map<string, BrowserWindow>();

function loadWindowUi(win: BrowserWindow, hash = '') {
  const isDev = process.env.ELECTRON_DEV === '1';
  const htmlPath = path.join(__dirname, '../renderer/index.html');
  const loadBuilt = () => {
    if (!fs.existsSync(htmlPath)) {
      console.error('[Metrika] Built UI missing:', htmlPath);
      return;
    }
    void win.loadFile(htmlPath, hash ? { hash: hash.replace(/^#/, '') } : undefined);
  };
  if (!isDev) {
    loadBuilt();
    return;
  }
  const url = `http://127.0.0.1:5173/${hash ? (hash.startsWith('#') ? hash : `#${hash}`) : ''}`;
  void win.loadURL(url).catch(() => loadBuilt());
}

export function openAppWindow(mode: AppWindowMode) {
  const spec = MODE_SPECS[mode];
  const existing = windows.get(mode);
  if (existing && !existing.isDestroyed()) {
    if (existing.isMinimized()) existing.restore();
    existing.show();
    existing.focus();
    return existing;
  }
  const windowIcon = loadAppIcon(false);
  const win = new BrowserWindow({
    width: spec.width,
    height: spec.height,
    minWidth: spec.minWidth,
    minHeight: spec.minHeight,
    backgroundColor: '#e8e8e0',
    title: spec.title,
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
  win.setMenuBarVisibility(false);
  loadWindowUi(win, spec.hash);
  win.on('closed', () => {
    if (windows.get(mode) === win) windows.delete(mode);
  });
  windows.set(mode, win);
  return win;
}

export function openConfiguratorWindow() {
  return openAppWindow('configurator');
}

export function openCrmWindow() {
  return openAppWindow('crm');
}

export function openClientWindow() {
  return openAppWindow('client');
}

export function getClientWindow() {
  const win = windows.get('client');
  return win && !win.isDestroyed() ? win : null;
}

export function getConfigWindow() {
  const win = windows.get('configurator');
  return win && !win.isDestroyed() ? win : null;
}

export function getCrmWindow() {
  const win = windows.get('crm');
  return win && !win.isDestroyed() ? win : null;
}

export function listAppWindows() {
  const modes: Array<AppWindowMode | `detached:${string}`> = [];
  for (const [mode, win] of windows) {
    if (win && !win.isDestroyed()) modes.push(mode);
  }
  for (const [page, win] of detachedWindows) {
    if (win && !win.isDestroyed()) modes.push(`detached:${page}`);
  }
  return modes;
}

function sanitizeDetachedPage(page: string) {
  const key = String(page || '').trim().toLowerCase();
  if (!/^[a-z][a-z0-9_]{0,63}$/.test(key)) {
    throw new Error('Некорректный идентификатор раздела');
  }
  return key;
}


export function openDetachedPageWindow(page: string, title?: string) {
  const key = sanitizeDetachedPage(page);
  const existing = detachedWindows.get(key);
  if (existing && !existing.isDestroyed()) {
    if (existing.isMinimized()) existing.restore();
    existing.show();
    existing.focus();
    return { ok: true, page: key, reused: true };
  }
  const label = String(title || key).trim() || key;
  const windowIcon = loadAppIcon(false);
  const win = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 720,
    minHeight: 520,
    backgroundColor: '#e8e8e0',
    title: `Metrika Home — ${label}`,
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
  win.setMenuBarVisibility(false);
  loadWindowUi(win, `detached/${encodeURIComponent(key)}`);
  win.on('closed', () => {
    if (detachedWindows.get(key) === win) detachedWindows.delete(key);
  });
  detachedWindows.set(key, win);
  return { ok: true, page: key, reused: false };
}

export function focusDetachedPageWindow(page: string) {
  const key = sanitizeDetachedPage(page);
  const win = detachedWindows.get(key);
  if (!win || win.isDestroyed()) return false;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
  return true;
}


export async function loadAppWindowUi(win: BrowserWindow, hash = '') {
  const isDev = process.env.ELECTRON_DEV === '1';
  const htmlPath = path.join(__dirname, '../renderer/index.html');
  const loadBuilt = () => {
    if (!fs.existsSync(htmlPath)) {
      console.error('[Metrika] Built UI missing:', htmlPath);
      return;
    }
    void win.loadFile(htmlPath, hash ? { hash: hash.replace(/^#/, '') } : undefined);
  };
  if (!isDev) {
    loadBuilt();
    return;
  }
  let viteUp = false;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 600);
    const res = await net.fetch('http://127.0.0.1:5173/', { signal: ctrl.signal });
    clearTimeout(timer);
    viteUp = res.ok || res.status === 304;
  } catch {
    viteUp = false;
  }
  if (viteUp) {
    const url = `http://127.0.0.1:5173/${hash ? (hash.startsWith('#') ? hash : `#${hash}`) : ''}`;
    void win.loadURL(url);
  } else {
    console.warn('[Metrika] ELECTRON_DEV=1 but Vite is down — loading built UI');
    loadBuilt();
  }
}
