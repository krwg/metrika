import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { app } from 'electron';
import { closeDatabase, getDatabasePath, initDatabase, getDb } from './db';
import {
  DEFAULT_ADMIN_PERMS,
  DEFAULT_USER_PERMS,
  applyGroupPerms,
  defaultsForRole,
  normalizeRole,
  parseLocationScope,
  parsePerms,
  type Role,
} from './permissions';

let registry: Database.Database;
let registryPath = '';
let session: {
  organization: any;
  user: any;
  permissions: Record<string, boolean>;

  locationScope: number[] | null;
} | null = null;

function orgsRoot() {
  return path.join(app.getPath('userData'), 'orgs');
}

function slugify(name: string) {
  return String(name || 'org')
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || `org-${Date.now()}`;
}

export function initRegistry() {
  fs.mkdirSync(orgsRoot(), { recursive: true });
  registryPath = path.join(app.getPath('userData'), 'metrika-registry.db');
  registry = new Database(registryPath);
  registry.pragma('journal_mode = WAL');
  registry.exec(`
    CREATE TABLE IF NOT EXISTS organizations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      code TEXT,
      legal_name TEXT,
      address TEXT,
      legal_address TEXT,
      email TEXT,
      phone TEXT,
      inn TEXT,
      kpp TEXT,
      bank_details TEXT,
      note TEXT,
      db_relative TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id INTEGER NOT NULL,
      login TEXT NOT NULL,
      display_name TEXT NOT NULL,
      role TEXT NOT NULL,
      permissions_json TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(organization_id, login),
      FOREIGN KEY (organization_id) REFERENCES organizations(id)
    );
    CREATE TABLE IF NOT EXISTS registry_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id INTEGER,
      user_id INTEGER,
      user_login TEXT,
      user_name TEXT,
      action TEXT NOT NULL,
      entity TEXT,
      entity_id TEXT,
      detail TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  migrateUsersPasswordColumn();
  migrateUsersRoleConstraint();
  migrateUsersLocationScope();
  migrateUsersFioColumns();
  migrateUsersEsignColumns();
  migrateUserGroups();
  migrateLegacyWarehouseIfNeeded();
}

function migrateUserGroups() {
  registry.exec(`
    CREATE TABLE IF NOT EXISTS user_groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      permissions_json TEXT NOT NULL DEFAULT '{}',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(organization_id, name),
      FOREIGN KEY (organization_id) REFERENCES organizations(id)
    );
    CREATE TABLE IF NOT EXISTS user_group_members (
      group_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      PRIMARY KEY (group_id, user_id),
      FOREIGN KEY (group_id) REFERENCES user_groups(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);
}

function migrateUsersFioColumns() {
  const cols = registry.prepare('PRAGMA table_info(users)').all() as Array<{ name: string }>;
  const names = new Set(cols.map((c) => c.name));
  if (!names.has('last_name')) registry.exec('ALTER TABLE users ADD COLUMN last_name TEXT');
  if (!names.has('first_name')) registry.exec('ALTER TABLE users ADD COLUMN first_name TEXT');
  if (!names.has('middle_name')) registry.exec('ALTER TABLE users ADD COLUMN middle_name TEXT');

  try {
    const rows = registry.prepare(`SELECT id, display_name, first_name FROM users`).all() as any[];
    const upd = registry.prepare('UPDATE users SET first_name = ? WHERE id = ?');
    for (const row of rows) {
      if (String(row.first_name || '').trim()) continue;
      const first = String(row.display_name || '').trim().split(/\s+/)[0] || '';
      if (first) upd.run(first, row.id);
    }
  } catch {  }
}

function migrateUsersPasswordColumn() {
  const cols = registry.prepare('PRAGMA table_info(users)').all() as Array<{ name: string }>;
  if (!cols.some((col) => col.name === 'password_hash')) {
    registry.exec('ALTER TABLE users ADD COLUMN password_hash TEXT');
  }
}

function migrateUsersEsignColumns() {
  const cols = registry.prepare('PRAGMA table_info(users)').all() as Array<{ name: string }>;
  const names = new Set(cols.map((c) => c.name));
  if (!names.has('esign_cert')) registry.exec('ALTER TABLE users ADD COLUMN esign_cert TEXT');
  if (!names.has('esign_valid_from')) registry.exec('ALTER TABLE users ADD COLUMN esign_valid_from TEXT');
  if (!names.has('esign_valid_to')) registry.exec('ALTER TABLE users ADD COLUMN esign_valid_to TEXT');
  if (!names.has('esign_created_at')) registry.exec('ALTER TABLE users ADD COLUMN esign_created_at TEXT');
}

function formatRuDate(iso: string | null | undefined) {
  if (!iso) return '—';
  const d = String(iso).slice(0, 10);
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return d;
  return `${m[3]}.${m[2]}.${m[1]}`;
}

function userFio(u: any) {
  const parts = [u?.last_name, u?.first_name || u?.display_name, u?.middle_name].filter(Boolean);
  return parts.join(' ') || u?.login || '—';
}

export function getMyEsign() {
  if (!session?.user?.id) throw new Error('Нет активной сессии');
  const row = registry.prepare('SELECT * FROM users WHERE id = ?').get(Number(session.user.id)) as any;
  if (!row) throw new Error('Профиль не найден');
  return {
    has_esign: Boolean(row.esign_cert),
    cert: row.esign_cert || null,
    owner: userFio(row),
    valid_from: row.esign_valid_from || null,
    valid_to: row.esign_valid_to || null,
    valid_from_ru: formatRuDate(row.esign_valid_from),
    valid_to_ru: formatRuDate(row.esign_valid_to),
    created_at: row.esign_created_at || null,
  };
}

export function generateMyEsign() {
  if (!session?.user?.id) throw new Error('Нет активной сессии');
  const id = Number(session.user.id);
  const current = registry.prepare('SELECT * FROM users WHERE id = ?').get(id) as any;
  if (!current) throw new Error('Профиль не найден');
  if (current.esign_cert) {
    return getMyEsign();
  }
  const cert = crypto.randomBytes(20).toString('hex').toUpperCase();
  const from = new Date();
  const to = new Date(from);
  to.setFullYear(to.getFullYear() + 1);
  const fromIso = from.toISOString().slice(0, 10);
  const toIso = to.toISOString().slice(0, 10);
  const created = new Date().toISOString();
  registry.prepare(`
    UPDATE users SET esign_cert = ?, esign_valid_from = ?, esign_valid_to = ?, esign_created_at = ?
    WHERE id = ?
  `).run(cert, fromIso, toIso, created, id);
  logAudit('user.esign_generate', {
    entity: 'user',
    entityId: id,
    detail: `Зарегистрирован ключ ЭП ${cert.slice(0, 8)}…`,
  });
  if (session.user) {
    session.user = {
      ...session.user,
      has_esign: true,
      esign_cert: cert,
      esign_valid_from: fromIso,
      esign_valid_to: toIso,
    };
  }
  return getMyEsign();
}

export function listOrgEsignKeys(organizationId?: number) {
  const orgId = Number(organizationId || session?.organization?.id) || 0;
  if (!orgId) return [];
  if (session?.user?.role !== 'admin') throw new Error('Только администратор');
  const rows = registry.prepare(`
    SELECT id, login, display_name, last_name, first_name, middle_name, role,
           esign_cert, esign_valid_from, esign_valid_to, esign_created_at, is_active
    FROM users WHERE organization_id = ?
    ORDER BY last_name, first_name, login
  `).all(orgId) as any[];
  return rows.map((row) => ({
    user_id: row.id,
    login: row.login,
    owner: userFio(row),
    role: row.role,
    is_active: row.is_active,
    has_esign: Boolean(row.esign_cert),
    cert: row.esign_cert || null,
    valid_from: row.esign_valid_from || null,
    valid_to: row.esign_valid_to || null,
    valid_from_ru: formatRuDate(row.esign_valid_from),
    valid_to_ru: formatRuDate(row.esign_valid_to),
    created_at: row.esign_created_at || null,
  }));
}

export function getUserEsignForSign(userId: number) {
  const row = registry.prepare('SELECT * FROM users WHERE id = ?').get(Number(userId)) as any;
  if (!row?.esign_cert) return null;
  const today = new Date().toISOString().slice(0, 10);
  if (row.esign_valid_to && String(row.esign_valid_to) < today) {
    throw new Error('Срок действия ключа ЭП истёк — зарегистрируйте новый у администратора');
  }
  return {
    cert: String(row.esign_cert),
    owner: userFio(row),
    valid_from: row.esign_valid_from,
    valid_to: row.esign_valid_to,
  };
}

function migrateUsersLocationScope() {
  const cols = registry.prepare('PRAGMA table_info(users)').all() as Array<{ name: string }>;
  if (!cols.some((col) => col.name === 'location_scope_json')) {
    registry.exec('ALTER TABLE users ADD COLUMN location_scope_json TEXT');
  }
}

function migrateUsersRoleConstraint() {
  try {
    const row = registry.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'").get() as any;
    const sql = String(row?.sql || '');
    if (!sql || sql.includes("'operator'") || !sql.includes('CHECK')) return;
    registry.exec(`
      CREATE TABLE users_mig (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        organization_id INTEGER NOT NULL,
        login TEXT NOT NULL,
        display_name TEXT NOT NULL,
        role TEXT NOT NULL,
        permissions_json TEXT,
        password_hash TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(organization_id, login),
        FOREIGN KEY (organization_id) REFERENCES organizations(id)
      );
      INSERT INTO users_mig (id, organization_id, login, display_name, role, permissions_json, password_hash, is_active, created_at)
      SELECT id, organization_id, login, display_name, role, permissions_json, password_hash, is_active, created_at FROM users;
      DROP TABLE users;
      ALTER TABLE users_mig RENAME TO users;
    `);
  } catch {

  }
}

export function logAudit(action: string, opts: {
  organizationId?: number | null;
  userId?: number | null;
  userLogin?: string | null;
  userName?: string | null;
  entity?: string | null;
  entityId?: string | number | null;
  detail?: string | null;
} = {}) {
  try {
    const current = session;
    registry.prepare(`INSERT INTO audit_log (
      organization_id, user_id, user_login, user_name, action, entity, entity_id, detail
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
      opts.organizationId ?? current?.organization?.id ?? null,
      opts.userId ?? current?.user?.id ?? null,
      opts.userLogin ?? current?.user?.login ?? null,
      opts.userName ?? current?.user?.display_name ?? null,
      String(action || 'action'),
      opts.entity ?? null,
      opts.entityId != null ? String(opts.entityId) : null,
      opts.detail ?? null,
    );
    registry.prepare('DELETE FROM audit_log WHERE id NOT IN (SELECT id FROM audit_log ORDER BY id DESC LIMIT 5000)').run();
  } catch {

  }
}

export function listAudit(organizationId?: number, limit = 200) {
  const take = Math.min(500, Math.max(1, Number(limit) || 200));
  if (organizationId) {
    return registry.prepare(
      `SELECT * FROM audit_log WHERE organization_id = ? OR organization_id IS NULL ORDER BY id DESC LIMIT ?`,
    ).all(organizationId, take);
  }
  return registry.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT ?').all(take);
}

function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 32).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string | null | undefined) {
  if (!stored) return true;
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const next = crypto.scryptSync(String(password || ''), salt, 32).toString('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(next, 'hex'));
  } catch {
    return false;
  }
}

function warehousePathFor(relative: string) {
  return path.join(app.getPath('userData'), relative);
}

/** Migrate only a pre-existing single-file metrika.db. Fresh installs stay empty. */
function migrateLegacyWarehouseIfNeeded() {
  const count = Number((registry.prepare('SELECT COUNT(*) AS c FROM organizations').get() as any)?.c || 0);
  if (count > 0) return;

  const legacyPath = path.join(app.getPath('userData'), 'metrika.db');
  if (!fs.existsSync(legacyPath)) return;

  const relative = path.join('orgs', 'migrated-warehouse', 'warehouse.db');
  const target = warehousePathFor(relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });

  fs.copyFileSync(legacyPath, target);
  const wal = `${legacyPath}-wal`;
  const shm = `${legacyPath}-shm`;
  if (fs.existsSync(wal)) fs.copyFileSync(wal, `${target}-wal`);
  if (fs.existsSync(shm)) fs.copyFileSync(shm, `${target}-shm`);
  const safety = path.join(app.getPath('userData'), `metrika.db.legacy-before-orgs-${Date.now()}`);
  try {
    fs.renameSync(legacyPath, safety);
    if (fs.existsSync(wal)) fs.renameSync(wal, `${safety}-wal`);
    if (fs.existsSync(shm)) fs.renameSync(shm, `${safety}-shm`);
  } catch {
    // keep going — org entry still points at the copied warehouse
  }

  const org = registry.prepare(`INSERT INTO organizations (
    name, code, legal_name, address, note, db_relative
  ) VALUES (?, ?, ?, ?, ?, ?)`).run(
    'Migrated warehouse',
    'MIGRATED',
    '',
    '',
    'Created automatically while migrating a previous single-file Metrika database.',
    relative.replace(/\\/g, '/'),
  );
  const orgId = Number(org.lastInsertRowid);
  registry.prepare(`INSERT INTO users (organization_id, login, display_name, role, permissions_json) VALUES (?, ?, ?, 'admin', ?)`).run(
    orgId, 'admin', 'Administrator', JSON.stringify(DEFAULT_ADMIN_PERMS),
  );
  registry.prepare("INSERT INTO registry_meta (key, value) VALUES ('migrated_legacy', '1') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
}

export function listOrganizations() {
  return registry.prepare(`SELECT o.*,
    (SELECT COUNT(*) FROM users u WHERE u.organization_id = o.id) AS user_count,
    CASE WHEN o.db_relative IS NOT NULL AND o.db_relative != '' THEN 1 ELSE 0 END AS has_db
    FROM organizations o WHERE o.is_active = 1 ORDER BY o.name`).all();
}

export function getOrganization(id: number) {
  return registry.prepare('SELECT * FROM organizations WHERE id = ?').get(id) as any;
}

export function createOrganization(data: any) {
  const name = String(data?.name || '').trim();
  if (!name) throw new Error('Укажите название организации');
  const adminLogin = String(data?.admin_login || data?.login || '').trim().toLowerCase();
  const adminDisplay = String(data?.admin_display_name || data?.display_name || '').trim();
  const adminPassword = String(data?.admin_password || data?.password || '');
  if (!adminLogin) throw new Error('Укажите логин администратора');
  if (!adminDisplay) throw new Error('Укажите имя администратора');
  if (!adminPassword || adminPassword.length < 4) throw new Error('Задайте пароль администратора (не короче 4 символов)');

  const code = String(data?.code || slugify(name)).trim().toUpperCase().slice(0, 16);
  const folder = slugify(name) || `org-${Date.now()}`;
  const relative = path.join('orgs', folder, 'warehouse.db').replace(/\\/g, '/');
  const absolute = warehousePathFor(relative);
  if (fs.existsSync(absolute)) throw new Error('Папка организации уже существует');
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  initDatabase(absolute);
  closeDatabase();

  const create = registry.transaction(() => {
    const result = registry.prepare(`INSERT INTO organizations (
      name, code, legal_name, address, legal_address, email, phone, inn, kpp, bank_details, note, db_relative
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      name,
      code,
      String(data.legal_name || '').trim() || null,
      String(data.address || '').trim() || null,
      String(data.legal_address || '').trim() || null,
      String(data.email || '').trim() || null,
      String(data.phone || '').trim() || null,
      String(data.inn || '').trim() || null,
      String(data.kpp || '').trim() || null,
      String(data.bank_details || '').trim() || null,
      String(data.note || '').trim() || null,
      relative,
    );
    const orgId = Number(result.lastInsertRowid);
    registry.prepare(
      `INSERT INTO users (organization_id, login, display_name, first_name, role, permissions_json, password_hash)
       VALUES (?, ?, ?, ?, 'admin', ?, ?)`,
    ).run(
      orgId,
      adminLogin,
      adminDisplay,
      adminDisplay,
      JSON.stringify(DEFAULT_ADMIN_PERMS),
      hashPassword(adminPassword),
    );
    return orgId;
  });

  return getOrganization(create());
}

export function updateOrganization(id: number, data: any) {
  const org = getOrganization(id);
  if (!org) throw new Error('Организация не найдена');
  registry.prepare(`UPDATE organizations SET
    name = ?, code = ?, legal_name = ?, address = ?, legal_address = ?, email = ?, phone = ?,
    inn = ?, kpp = ?, bank_details = ?, note = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?`).run(
    String(data.name || org.name).trim(),
    String(data.code || org.code || '').trim() || null,
    String(data.legal_name ?? org.legal_name ?? '').trim() || null,
    String(data.address ?? org.address ?? '').trim() || null,
    String(data.legal_address ?? org.legal_address ?? '').trim() || null,
    String(data.email ?? org.email ?? '').trim() || null,
    String(data.phone ?? org.phone ?? '').trim() || null,
    String(data.inn ?? org.inn ?? '').trim() || null,
    String(data.kpp ?? org.kpp ?? '').trim() || null,
    String(data.bank_details ?? org.bank_details ?? '').trim() || null,
    String(data.note ?? org.note ?? '').trim() || null,
    id,
  );
  return getOrganization(id);
}

export function deleteOrganization(id: number) {
  const org = getOrganization(id);
  if (!org) throw new Error('Организация не найдена');
  if (session?.organization?.id === id) throw new Error('Нельзя удалить активную организацию. Сначала выйдите.');
  registry.prepare('DELETE FROM users WHERE organization_id = ?').run(id);
  registry.prepare('DELETE FROM organizations WHERE id = ?').run(id);

  const absolute = warehousePathFor(org.db_relative);
  if (fs.existsSync(absolute)) {
    const archive = `${absolute}.deleted-${Date.now()}`;
    try { fs.renameSync(absolute, archive); } catch {  }
  }
  return true;
}

export function listUsers(organizationId?: number) {
  const rows = organizationId
    ? registry.prepare(`SELECT u.*, o.name AS organization_name FROM users u JOIN organizations o ON o.id = u.organization_id WHERE u.organization_id = ? ORDER BY u.login`).all(organizationId)
    : registry.prepare(`SELECT u.*, o.name AS organization_name FROM users u JOIN organizations o ON o.id = u.organization_id ORDER BY o.name, u.login`).all();
  return (rows as any[]).map((row) => {
    const user = sanitizeUser(row);
    const groups = listGroupsForUser(Number(row.id));
    return {
      ...user,
      group_ids: groups.map((g) => Number(g.id)),
      group_names: groups.map((g) => String(g.name)),
    };
  });
}

export function listUserGroups(organizationId: number) {
  return registry.prepare(`
    SELECT g.*,
      (SELECT COUNT(*) FROM user_group_members m WHERE m.group_id = g.id) AS member_count
    FROM user_groups g
    WHERE g.organization_id = ?
    ORDER BY g.name COLLATE NOCASE
  `).all(Number(organizationId)) as any[];
}

export function listGroupsForUser(userId: number) {
  return registry.prepare(`
    SELECT g.id, g.name, g.permissions_json
    FROM user_group_members m
    JOIN user_groups g ON g.id = m.group_id
    WHERE m.user_id = ?
    ORDER BY g.name COLLATE NOCASE
  `).all(Number(userId)) as any[];
}

export function createUserGroup(data: any): any {
  const orgId = Number(data.organization_id);
  if (!getOrganization(orgId)) throw new Error('Организация не найдена');
  const name = String(data.name || '').trim();
  if (!name) throw new Error('Укажите название группы');
  const description = String(data.description || '').trim() || null;
  const permissions = JSON.stringify(data.permissions || {});
  try {
    const result = registry.prepare(
      `INSERT INTO user_groups (organization_id, name, description, permissions_json) VALUES (?, ?, ?, ?)`,
    ).run(orgId, name, description, permissions);
    return registry.prepare('SELECT * FROM user_groups WHERE id = ?').get(result.lastInsertRowid) as any;
  } catch (error: any) {
    if (String(error?.message).includes('UNIQUE')) throw new Error('Группа с таким названием уже есть');
    throw error;
  }
}

export function updateUserGroup(id: number, data: any): any {
  const current = registry.prepare('SELECT * FROM user_groups WHERE id = ?').get(Number(id)) as any;
  if (!current) throw new Error('Группа не найдена');
  const name = data.name !== undefined ? String(data.name || '').trim() : current.name;
  if (!name) throw new Error('Укажите название группы');
  const description = data.description !== undefined
    ? (String(data.description || '').trim() || null)
    : current.description;
  const permissions = data.permissions !== undefined
    ? JSON.stringify(data.permissions || {})
    : current.permissions_json;
  try {
    registry.prepare(
      `UPDATE user_groups SET name = ?, description = ?, permissions_json = ? WHERE id = ?`,
    ).run(name, description, permissions, Number(id));
  } catch (error: any) {
    if (String(error?.message).includes('UNIQUE')) throw new Error('Группа с таким названием уже есть');
    throw error;
  }
  return registry.prepare('SELECT * FROM user_groups WHERE id = ?').get(Number(id)) as any;
}

export function deleteUserGroup(id: number) {
  const current = registry.prepare('SELECT * FROM user_groups WHERE id = ?').get(Number(id)) as any;
  if (!current) throw new Error('Группа не найдена');
  registry.prepare('DELETE FROM user_group_members WHERE group_id = ?').run(Number(id));
  registry.prepare('DELETE FROM user_groups WHERE id = ?').run(Number(id));
  return true;
}

export function setUserGroups(userId: number, groupIds: number[]) {
  const user = registry.prepare('SELECT * FROM users WHERE id = ?').get(Number(userId)) as any;
  if (!user) throw new Error('Пользователь не найден');
  const orgId = Number(user.organization_id);
  const wanted = [...new Set((groupIds || []).map(Number).filter((id) => Number.isFinite(id) && id > 0))];
  for (const gid of wanted) {
    const group = registry.prepare('SELECT id FROM user_groups WHERE id = ? AND organization_id = ?')
      .get(gid, orgId) as any;
    if (!group) throw new Error('Группа не принадлежит этой организации');
  }
  const tx = registry.transaction(() => {
    registry.prepare('DELETE FROM user_group_members WHERE user_id = ?').run(Number(userId));
    const ins = registry.prepare('INSERT INTO user_group_members (group_id, user_id) VALUES (?, ?)');
    for (const gid of wanted) ins.run(gid, Number(userId));
  });
  tx();
  return listGroupsForUser(Number(userId));
}

export function createUser(data: any) {
  const orgId = Number(data.organization_id);
  if (!getOrganization(orgId)) throw new Error('Организация не найдена');
  const login = String(data.login || '').trim().toLowerCase();
  const firstName = String(data.first_name || data.display_name || '').trim() || login;
  const lastName = String(data.last_name || '').trim() || null;
  const middleName = String(data.middle_name || '').trim() || null;
  const display = String(data.display_name || firstName || '').trim() || login;
  const role = normalizeRole(data.role);
  if (!login) throw new Error('Укажите логин');
  const perms = JSON.stringify(data.permissions || defaultsForRole(role));
  const passwordHash = data.password ? hashPassword(String(data.password)) : null;
  const scopeJson = serializeLocationScope(data.location_scope);
  const result = registry.prepare(
    `INSERT INTO users (organization_id, login, display_name, last_name, first_name, middle_name, role, permissions_json, password_hash, location_scope_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(orgId, login, display, lastName, firstName, middleName, role, perms, passwordHash, scopeJson);
  return sanitizeUser(registry.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid));
}

export function updateUser(id: number, data: any) {
  const current = registry.prepare('SELECT * FROM users WHERE id = ?').get(id) as any;
  if (!current) throw new Error('Пользователь не найден');
  const role = normalizeRole(data.role ?? current.role) as Role;
  if (current.role === 'admin' && role !== 'admin') {
    const admins = Number((registry.prepare(
      `SELECT COUNT(*) AS c FROM users WHERE organization_id = ? AND role = 'admin' AND is_active = 1 AND id != ?`,
    ).get(current.organization_id, id) as any)?.c || 0);
    if (admins < 1) throw new Error('В организации должен остаться хотя бы один администратор');
  }
  let passwordHash = current.password_hash;
  if (data.password === '') passwordHash = null;
  else if (data.password != null && String(data.password).length > 0) passwordHash = hashPassword(String(data.password));
  const scopeJson = data.location_scope !== undefined
    ? serializeLocationScope(data.location_scope)
    : (current.location_scope_json ?? null);
  const firstName = data.first_name !== undefined
    ? String(data.first_name || '').trim()
    : String(current.first_name || current.display_name || '').trim();
  const lastName = data.last_name !== undefined
    ? (String(data.last_name || '').trim() || null)
    : (current.last_name ?? null);
  const middleName = data.middle_name !== undefined
    ? (String(data.middle_name || '').trim() || null)
    : (current.middle_name ?? null);

  const display = data.display_name !== undefined
    ? String(data.display_name || firstName || '').trim()
    : (firstName || String(current.display_name || '').trim());
  registry.prepare(`UPDATE users SET display_name = ?, last_name = ?, first_name = ?, middle_name = ?,
    role = ?, permissions_json = ?, is_active = ?, password_hash = ?, location_scope_json = ? WHERE id = ?`).run(
    display || firstName || current.login,
    lastName,
    firstName || display || current.login,
    middleName,
    role,
    JSON.stringify(data.permissions || defaultsForRole(role)),
    data.is_active === 0 || data.is_active === false ? 0 : 1,
    passwordHash,
    scopeJson,
    id,
  );

  if (session?.user?.id === id) {
    session.user = {
      ...session.user,
      display_name: display || firstName || current.login,
      first_name: firstName || display || current.login,
      last_name: lastName,
      middle_name: middleName,
      role,
    };
    session.permissions = parsePerms(JSON.stringify(data.permissions || defaultsForRole(role)), role);
    session.locationScope = parseLocationScope(scopeJson);
  }
  return sanitizeUser(registry.prepare('SELECT * FROM users WHERE id = ?').get(id));
}

function serializeLocationScope(value: any): string | null {
  if (value == null) return null;
  if (Array.isArray(value)) {
    const ids = value.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0);
    return ids.length ? JSON.stringify(ids) : null;
  }
  return null;
}

export function deleteUser(id: number) {
  const current = registry.prepare('SELECT * FROM users WHERE id = ?').get(id) as any;
  if (!current) throw new Error('Пользователь не найден');
  if (session?.user?.id === id) throw new Error('Нельзя удалить активного пользователя. Сначала смените пользователя.');
  if (current.role === 'admin') {
    const admins = Number((registry.prepare(
      `SELECT COUNT(*) AS c FROM users WHERE organization_id = ? AND role = 'admin' AND is_active = 1 AND id != ?`,
    ).get(current.organization_id, id) as any)?.c || 0);
    if (admins < 1) throw new Error('Нельзя удалить последнего администратора');
  }
  registry.prepare('DELETE FROM user_group_members WHERE user_id = ?').run(id);
  registry.prepare('DELETE FROM users WHERE id = ?').run(id);
  return true;
}

export function updateSelfProfile(data: {
  first_name?: string;
  last_name?: string;
  middle_name?: string;
  display_name?: string;
  password?: string;
}) {
  if (!session?.user?.id) throw new Error('Нет активной сессии');
  const id = Number(session.user.id);
  const current = registry.prepare('SELECT * FROM users WHERE id = ?').get(id) as any;
  if (!current) throw new Error('Профиль не найден');
  const firstName = data.first_name !== undefined
    ? String(data.first_name || '').trim()
    : String(current.first_name || current.display_name || '').trim();
  const lastName = data.last_name !== undefined
    ? (String(data.last_name || '').trim() || null)
    : (current.last_name ?? null);
  const middleName = data.middle_name !== undefined
    ? (String(data.middle_name || '').trim() || null)
    : (current.middle_name ?? null);
  const display = data.display_name !== undefined
    ? String(data.display_name || firstName || '').trim()
    : (firstName || String(current.display_name || '').trim());
  let passwordHash = current.password_hash;
  if (data.password === '') passwordHash = null;
  else if (data.password != null && String(data.password).length > 0) passwordHash = hashPassword(String(data.password));
  registry.prepare(`
    UPDATE users SET display_name = ?, last_name = ?, first_name = ?, middle_name = ?, password_hash = ?
    WHERE id = ?
  `).run(
    display || firstName || current.login,
    lastName,
    firstName || display || current.login,
    middleName,
    passwordHash,
    id,
  );
  session.user = {
    ...session.user,
    display_name: display || firstName || current.login,
    first_name: firstName || display || current.login,
    last_name: lastName,
    middle_name: middleName,
  };
  return sanitizeUser(registry.prepare('SELECT * FROM users WHERE id = ?').get(id));
}

function sanitizeUser(user: any) {
  if (!user) return user;
  const { password_hash, ...rest } = user;
  return {
    ...rest,
    has_password: Boolean(password_hash),
    has_esign: Boolean(user.esign_cert),
    location_scope: parseLocationScope(user.location_scope_json),
  };
}

export function getSession() {
  return session;
}

export function openSession(organizationId: number, userId: number, password?: string) {
  const org = getOrganization(organizationId);
  if (!org || !org.is_active) throw new Error('Организация не найдена');
  const user = registry.prepare('SELECT * FROM users WHERE id = ? AND organization_id = ? AND is_active = 1').get(userId, organizationId) as any;
  if (!user) throw new Error('Пользователь не найден');
  if (user.password_hash) {
    if (!verifyPassword(String(password || ''), user.password_hash)) {
      throw new Error('Неверный пароль');
    }
  }
  const absolute = warehousePathFor(org.db_relative);
  closeDatabase();
  if (!fs.existsSync(absolute)) {
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
  }
  initDatabase(absolute);
  const groups = listGroupsForUser(Number(user.id));
  const basePerms = parsePerms(user.permissions_json, user.role);
  const permissions = user.role === 'admin'
    ? basePerms
    : applyGroupPerms(basePerms, groups.map((g) => g.permissions_json));
  session = {
    organization: org,
    user: {
      id: user.id,
      login: user.login,
      display_name: user.display_name,
      first_name: user.first_name || user.display_name || null,
      last_name: user.last_name || null,
      middle_name: user.middle_name || null,
      role: user.role,
      organization_id: user.organization_id,
      group_ids: groups.map((g) => Number(g.id)),
      group_names: groups.map((g) => String(g.name)),
    },
    permissions,
    locationScope: parseLocationScope(user.location_scope_json),
  };
  registry.prepare("INSERT INTO registry_meta (key, value) VALUES ('last_org_id', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(String(org.id));
  registry.prepare("INSERT INTO registry_meta (key, value) VALUES ('last_user_id', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(String(user.id));
  const fioParts = [user.last_name, user.first_name || user.display_name, user.middle_name].filter(Boolean);
  const who = fioParts.length ? fioParts.join(' ') : (user.display_name || user.login);
  logAudit('session.open', {
    organizationId: org.id,
    userId: user.id,
    userLogin: user.login,
    userName: user.display_name,
    entity: 'session',
    detail: `Вошёл ${who} (${user.role}) в организацию «${org.name}»`,
  });
  return session;
}

export function closeSession() {
  if (session) {
    const u = session.user;
    const fioParts = [u?.last_name, u?.first_name || u?.display_name, u?.middle_name].filter(Boolean);
    const who = fioParts.length ? fioParts.join(' ') : (u?.display_name || u?.login || 'пользователь');
    logAudit('session.close', {
      organizationId: session.organization?.id,
      userId: session.user?.id,
      userLogin: session.user?.login,
      userName: session.user?.display_name,
      entity: 'session',
      detail: `Вышел ${who} из организации «${session.organization?.name || '—'}»`,
    });
  }
  closeDatabase();
  session = null;
  return true;
}

export function requireSession() {
  if (!session) throw new Error('Сначала выберите организацию и пользователя');
  return session;
}

export function requirePerm(key: string) {
  const current = requireSession();
  if (current.user.role === 'admin') return;
  if (!current.permissions?.[key]) {
    throw new Error(`Недостаточно прав: ${key}`);
  }
}

export function hasPerm(key: string) {
  const current = getSession();
  if (!current) return false;
  if (current.user.role === 'admin') return true;
  return Boolean(current.permissions?.[key]);
}

export function locationInScope(locationId: number, scope: number[] | null | undefined = session?.locationScope): boolean {
  if (!scope || scope.length === 0) return true;
  const id = Number(locationId);
  if (!id) return false;
  if (scope.includes(id)) return true;
  try {
    const db = getDb();
    let current: number | null = id;
    const seen = new Set<number>();
    while (current && !seen.has(current)) {
      seen.add(current);
      if (scope.includes(current)) return true;
      const row = db.prepare('SELECT parent_location_id FROM locations WHERE id = ?').get(current) as any;
      current = row?.parent_location_id ? Number(row.parent_location_id) : null;
    }
  } catch {
    return false;
  }
  return false;
}

export function requireLocationAccess(locationId: number) {
  const current = requireSession();
  if (current.user.role === 'admin') return;
  if (!locationInScope(locationId, current.locationScope)) {
    throw new Error('Нет доступа к этому складу / адресу хранения');
  }
}

export function getLocationScope() {
  return session?.locationScope ?? null;
}

export function isOperatorSession() {
  return getSession()?.user?.role === 'operator';
}

export function actorName() {
  return session?.user?.display_name || 'Локальный оператор';
}

export function getRegistryDb() {
  return registry;
}
