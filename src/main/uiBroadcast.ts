import { BrowserWindow } from 'electron';

export function broadcastDataChanged(scope = 'all', detail?: Record<string, unknown>) {
  const payload = { scope, at: Date.now(), ...(detail || {}) };
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue;
    try {
      win.webContents.send('data:changed', payload);
    } catch {  }
  }
}

export function reloadAllRendererWindows() {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue;
    try {
      win.webContents.reloadIgnoringCache();
    } catch {  }
  }
}
