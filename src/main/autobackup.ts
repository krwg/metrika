import { app, shell } from 'electron';
import fs from 'fs';
import path from 'path';
import { backupDatabase, getDatabasePath, stampedFileName } from './db';
import { getSession, getOrganization } from './registry';

const DEFAULT_KEEP = 30;
let timer: NodeJS.Timeout | null = null;
let lastBackupAt = 0;

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function stampName(prefix: string) {
  const now = new Date();
  return `${prefix}_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.db`;
}

export function autoBackupRoot() {
  return path.join(app.getPath('userData'), 'backups');
}

export function autoBackupDirForSession() {
  const session = getSession();
  const orgId = session?.organization?.id;
  if (!orgId) return autoBackupRoot();
  const org = getOrganization(orgId) || session.organization;
  const slug = String(org?.code || org?.name || `org-${orgId}`)
    .toLowerCase()
    .replace(/[^\wа-яё\-]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || `org-${orgId}`;
  return path.join(autoBackupRoot(), slug);
}

export function runAutoBackup(options?: { keep?: number; reason?: string }) {
  const dbPath = getDatabasePath();
  if (!dbPath) return null;
  if (!getSession()) return null;

  const keep = Math.max(3, Math.min(200, Number(options?.keep) || DEFAULT_KEEP));
  const dir = autoBackupDirForSession();
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, stampName('auto'));
  backupDatabase(filePath);

  const files = fs.readdirSync(dir)
    .filter((file) => file.endsWith('.db'))
    .map((file) => {
      const full = path.join(dir, file);
      const stat = fs.statSync(full);
      return { file, full, mtime: stat.mtimeMs, size: stat.size };
    })
    .sort((a, b) => b.mtime - a.mtime);

  files.slice(keep).forEach((entry) => {
    try { fs.rmSync(entry.full, { force: true }); } catch {  }
  });

  lastBackupAt = Date.now();
  return { path: filePath, keep, reason: options?.reason || 'auto', count: Math.min(files.length, keep) };
}

export function listAutoBackups(limit = 40) {
  const dir = autoBackupDirForSession();
  if (!fs.existsSync(dir)) return { dir, items: [] as any[] };
  const items = fs.readdirSync(dir)
    .filter((file) => file.endsWith('.db'))
    .map((file) => {
      const full = path.join(dir, file);
      const stat = fs.statSync(full);
      return {
        name: file,
        path: full,
        size: stat.size,
        mtime: stat.mtime.toISOString(),
      };
    })
    .sort((a, b) => (a.mtime < b.mtime ? 1 : -1))
    .slice(0, limit);
  return { dir, items, lastBackupAt: lastBackupAt || null };
}

export async function openAutoBackupFolder() {
  const dir = autoBackupDirForSession();
  fs.mkdirSync(dir, { recursive: true });
  await shell.openPath(dir);
  return dir;
}

export function exportOrganizationDatabase(destination: string) {
  const dbPath = getDatabasePath();
  if (!dbPath) throw new Error('База организации не открыта');
  const session = getSession();
  const orgId = session?.organization?.id;
  const org = orgId ? (getOrganization(orgId) || session?.organization) : null;
  backupDatabase(destination);
  const metaPath = destination.replace(/\.db$/i, '') + '.meta.json';
  fs.writeFileSync(metaPath, JSON.stringify({
    exported_at: new Date().toISOString(),
    organization: org ? {
      id: org.id,
      name: org.name,
      code: org.code,
      legal_name: org.legal_name,
      inn: org.inn,
    } : null,
    source: dbPath,
    file: path.basename(destination),
  }, null, 2), 'utf8');
  return { db: destination, meta: metaPath };
}

export function suggestExportName() {
  const session = getSession();
  const org = session?.organization;
  const base = org?.code || org?.name || 'metrika-org';
  return stampedFileName(`metrika-org-${base}`, 'db');
}

export function startAutoBackupScheduler(intervalHours = 6, keep = DEFAULT_KEEP) {
  stopAutoBackupScheduler();
  const hours = Math.max(1, Math.min(72, Number(intervalHours) || 6));
  const ms = hours * 60 * 60 * 1000;
  timer = setInterval(() => {
    try {
      runAutoBackup({ keep, reason: 'interval' });
    } catch (error) {
      console.warn('[Metrika] Interval auto-backup failed:', error);
    }
  }, ms);

  if (typeof timer.unref === 'function') timer.unref();
}

export function stopAutoBackupScheduler() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

export function backupOnSessionBoundary(keep = DEFAULT_KEEP) {
  try {
    return runAutoBackup({ keep, reason: 'session' });
  } catch (error) {
    console.warn('[Metrika] Session auto-backup failed:', error);
    return null;
  }
}
