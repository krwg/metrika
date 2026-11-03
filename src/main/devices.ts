

import { BrowserWindow } from 'electron';
import { SerialPort } from 'serialport';
import { getDb } from './db';
import * as eventBus from './eventBus';

function readMeta(key: string, fallback = '') {
  try {
    return String((getDb().prepare('SELECT value FROM schema_meta WHERE key = ?').get(key) as any)?.value ?? fallback);
  } catch {
    return fallback;
  }
}

function writeMeta(key: string, value: string) {
  getDb().prepare(`
    INSERT INTO schema_meta (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, value);
}

export function getDeviceSettings() {
  return {
    label_printer: {
      mode: readMeta('setting:devices.label.mode', 'os'),
      path: readMeta('setting:devices.label.path', ''),
      dpi: Number(readMeta('setting:devices.label.dpi', '203')) || 203,
      width_mm: Number(readMeta('setting:devices.label.width_mm', '58')) || 58,
      height_mm: Number(readMeta('setting:devices.label.height_mm', '40')) || 40,
    },
    scale: {
      port: readMeta('setting:devices.scale.port', ''),
      baud: Number(readMeta('setting:devices.scale.baud', '9600')) || 9600,
      protocol: readMeta('setting:devices.scale.protocol', 'cas'),
    },
    camera: {
      enabled: readMeta('setting:devices.camera.enabled', '0') === '1',
      device_id: readMeta('setting:devices.camera.device_id', ''),
    },
  };
}

export function saveDeviceSettings(data: any) {
  const cur = getDeviceSettings();
  const label = { ...cur.label_printer, ...(data.label_printer || {}) };
  const scale = { ...cur.scale, ...(data.scale || {}) };
  const camera = { ...cur.camera, ...(data.camera || {}) };
  writeMeta('setting:devices.label.mode', String(label.mode || 'os'));
  writeMeta('setting:devices.label.path', String(label.path || ''));
  writeMeta('setting:devices.label.dpi', String(label.dpi || 203));
  writeMeta('setting:devices.label.width_mm', String(label.width_mm || 58));
  writeMeta('setting:devices.label.height_mm', String(label.height_mm || 40));
  writeMeta('setting:devices.scale.port', String(scale.port || ''));
  writeMeta('setting:devices.scale.baud', String(scale.baud || 9600));
  writeMeta('setting:devices.scale.protocol', String(scale.protocol || 'cas'));
  writeMeta('setting:devices.camera.enabled', camera.enabled ? '1' : '0');
  writeMeta('setting:devices.camera.device_id', String(camera.device_id || ''));
  return getDeviceSettings();
}

export function buildZplLabel(item: {
  name?: string;
  sku?: string;
  barcode?: string;
  price?: number | string;
}, opts?: { copies?: number }) {
  const cfg = getDeviceSettings().label_printer;
  const dpi = cfg.dpi || 203;
  const mmToDots = (mm: number) => Math.round((mm / 25.4) * dpi);
  const w = mmToDots(cfg.width_mm || 58);
  const h = mmToDots(cfg.height_mm || 40);
  const name = String(item.name || '').slice(0, 40);
  const sku = String(item.sku || '');
  const barcode = String(item.barcode || sku || item.name || '0').replace(/[^0-9A-Za-z\-]/g, '');
  const price = item.price != null ? String(item.price) : '';
  const copies = Math.max(1, Math.min(99, Number(opts?.copies) || 1));
  const zpl = `^XA
^PW${w}
^LL${h}
^CF0,28
^FO20,20^FD${name}^FS
^CF0,22
^FO20,55^FD${sku}${price ? `  ${price}` : ''}^FS
^BY2,2,60
^FO20,90^BCN,60,Y,N,N
^FD${barcode}^FS
^PQ${copies}
^XZ
`;
  return zpl;
}

export async function sendZplToPrinter(zpl: string) {
  const cfg = getDeviceSettings().label_printer;
  if (cfg.mode !== 'zpl') {
    return { ok: false, mode: cfg.mode, zpl, note: 'Режим OS — используйте обычную печать этикеток. ZPL сохранён в ответе.' };
  }
  const target = String(cfg.path || '').trim();
  if (!target) throw new Error('Укажите путь/порт принтера этикеток (COM или \\\\server\\share)');

  if (/^COM\d+/i.test(target) || target.startsWith('/dev/')) {
    await new Promise<void>((resolve, reject) => {
      const port = new SerialPort({ path: target, baudRate: 9600, autoOpen: false });
      port.open((err) => {
        if (err) return reject(err);
        port.write(zpl, (wErr) => {
          port.close(() => {
            if (wErr) reject(wErr);
            else resolve();
          });
        });
      });
    });
    void eventBus.emit('devices.label.printed', { mode: 'zpl-serial', path: target });
    return { ok: true, mode: 'zpl-serial', path: target };
  }
  const fs = await import('fs');
  fs.writeFileSync(target, zpl, 'utf8');
  void eventBus.emit('devices.label.printed', { mode: 'zpl-file', path: target });
  return { ok: true, mode: 'zpl-file', path: target };
}

export async function readScaleWeight(timeoutMs = 3000): Promise<{ weight: number; raw: string; unit: string }> {
  const cfg = getDeviceSettings().scale;
  if (!cfg.port) throw new Error('Укажите COM-порт весов в Настройки → Устройства');
  const raw = await new Promise<string>((resolve, reject) => {
    const port = new SerialPort({ path: cfg.port, baudRate: cfg.baud || 9600, autoOpen: false });
    let buf = '';
    const timer = setTimeout(() => {
      try { port.close(() => {}); } catch {  }
      reject(new Error('Таймаут чтения весов'));
    }, Math.max(500, timeoutMs));
    port.open((err) => {
      if (err) {
        clearTimeout(timer);
        return reject(err);
      }

      try { port.write(cfg.protocol === 'cas' ? 'P\r\n' : 'W\r\n'); } catch {  }
      port.on('data', (chunk) => {
        buf += chunk.toString('utf8');
        if (/[\r\n]/.test(buf) && buf.length > 3) {
          clearTimeout(timer);
          port.close(() => resolve(buf));
        }
      });
    });
  });
  const m = raw.replace(',', '.').match(/(-?\d+(?:\.\d+)?)/);
  const weight = m ? Number(m[1]) : NaN;
  if (!Number.isFinite(weight)) throw new Error(`Не удалось разобрать вес: ${raw.trim()}`);
  void eventBus.emit('devices.scale.weight', { weight, raw: raw.trim() });
  return { weight, raw: raw.trim(), unit: 'kg' };
}

export function broadcastCameraCaptureRequest() {
  for (const win of BrowserWindow.getAllWindows()) {
    try {
      if (!win.isDestroyed()) win.webContents.send('devices:cameraCapture');
    } catch {  }
  }
  return { ok: true };
}
