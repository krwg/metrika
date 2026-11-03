


import { getDb } from './db';
import * as registry from './registry';

export const ASSET_STATUSES = [
  'in_stock',
  'in_use',
  'repair',
  'reserved',
  'written_off',
] as const;

export type AssetStatus = (typeof ASSET_STATUSES)[number];

export const ASSET_STATUS_LABELS: Record<AssetStatus, string> = {
  in_stock: 'На складе / учёт',
  in_use: 'В эксплуатации',
  repair: 'В ремонте',
  reserved: 'Зарезервировано',
  written_off: 'Списано',
};

export const ASSET_MOVE_KINDS = [
  'register',
  'transfer',
  'issue',
  'return',
  'repair',
  'repair_done',
  'writeoff',
  'note',
] as const;

export const ASSET_MOVE_LABELS: Record<(typeof ASSET_MOVE_KINDS)[number], string> = {
  register: 'Постановка на учёт',
  transfer: 'Перемещение',
  issue: 'Выдача в эксплуатацию',
  return: 'Возврат на учёт',
  repair: 'Передано в ремонт',
  repair_done: 'Возврат из ремонта',
  writeoff: 'Списание',
  note: 'Комментарий',
};

function nextInventoryNo() {
  const year = new Date().getFullYear();
  const like = `ОС-${year}-%`;
  const last = getDb().prepare(
    `SELECT inventory_no AS n FROM assets WHERE inventory_no LIKE ? ORDER BY id DESC LIMIT 1`,
  ).get(like) as any;
  let seq = 1;
  if (last?.n) {
    const m = String(last.n).match(/-(\d+)$/);
    if (m) seq = Number(m[1]) + 1;
  }
  return `ОС-${year}-${String(seq).padStart(4, '0')}`;
}

function actorName() {
  const s = registry.getSession();
  const u = s?.user;
  if (!u) return 'Система';
  return [u.last_name, u.first_name || u.display_name, u.middle_name].filter(Boolean).join(' ')
    || u.display_name || u.login || 'Система';
}

export function listAssets(filters: { q?: string; status?: string; activeOnly?: boolean } = {}) {
  const db = getDb();
  let sql = `
    SELECT a.*,
      l.name AS location_name,
      e.last_name AS emp_last, e.first_name AS emp_first, e.middle_name AS emp_middle,
      i.name AS linked_item_name
    FROM assets a
    LEFT JOIN locations l ON l.id = a.location_id
    LEFT JOIN employees e ON e.id = a.employee_id
    LEFT JOIN items i ON i.id = a.linked_item_id
    WHERE 1=1
  `;
  const params: any[] = [];
  if (filters.activeOnly !== false) {
    sql += ' AND a.is_active = 1';
  }
  if (filters.status) {
    sql += ' AND a.status = ?';
    params.push(filters.status);
  }
  if (filters.q?.trim()) {
    sql += ` AND (
      a.name LIKE ? OR a.inventory_no LIKE ? OR IFNULL(a.serial_no,'') LIKE ?
      OR IFNULL(a.barcode,'') LIKE ? OR IFNULL(a.category,'') LIKE ?
      OR IFNULL(a.model,'') LIKE ? OR IFNULL(a.responsible_name,'') LIKE ?
    )`;
    const q = `%${filters.q.trim()}%`;
    params.push(q, q, q, q, q, q, q);
  }
  sql += ' ORDER BY a.status, a.inventory_no, a.id';
  return (db.prepare(sql).all(...params) as any[]).map((row) => ({
    ...row,
    status_label: ASSET_STATUS_LABELS[row.status as AssetStatus] || row.status,
    employee_name: [row.emp_last, row.emp_first, row.emp_middle].filter(Boolean).join(' ') || null,
  }));
}

export function getAsset(id: number) {
  const row = listAssets({ activeOnly: false }).find((a) => Number(a.id) === Number(id));
  if (!row) return null;
  const movements = getDb().prepare(`
    SELECT m.*,
      fl.name AS from_location_name,
      tl.name AS to_location_name
    FROM asset_movements m
    LEFT JOIN locations fl ON fl.id = m.from_location_id
    LEFT JOIN locations tl ON tl.id = m.to_location_id
    WHERE m.asset_id = ?
    ORDER BY m.id DESC
    LIMIT 100
  `).all(Number(id)) as any[];
  const maintenance = getDb().prepare(`
    SELECT * FROM asset_maintenance WHERE asset_id = ? ORDER BY COALESCE(planned_at, done_at, created_at) DESC, id DESC LIMIT 50
  `).all(Number(id)) as any[];
  return {
    ...row,
    movements: movements.map((m) => ({
      ...m,
      kind_label: ASSET_MOVE_LABELS[m.kind as keyof typeof ASSET_MOVE_LABELS] || m.kind,
    })),
    maintenance,
  };
}

export function saveAsset(data: any) {
  const db = getDb();
  const name = String(data.name || '').trim();
  if (!name) throw new Error('Укажите наименование оборудования');
  const inventoryNo = String(data.inventory_no || '').trim() || nextInventoryNo();
  const status = ASSET_STATUSES.includes(data.status) ? data.status : 'in_stock';
  const fields = {
    inventory_no: inventoryNo,
    name,
    category: String(data.category || '').trim() || null,
    serial_no: String(data.serial_no || '').trim() || null,
    barcode: String(data.barcode || '').trim() || null,
    status,
    location_id: data.location_id ? Number(data.location_id) : null,
    employee_id: data.employee_id ? Number(data.employee_id) : null,
    responsible_user_id: data.responsible_user_id ? Number(data.responsible_user_id) : null,
    responsible_name: String(data.responsible_name || '').trim() || null,
    linked_item_id: data.linked_item_id ? Number(data.linked_item_id) : null,
    purchase_date: String(data.purchase_date || '').trim() || null,
    warranty_until: String(data.warranty_until || '').trim() || null,
    cost: data.cost != null && data.cost !== '' ? Number(data.cost) : null,
    manufacturer: String(data.manufacturer || '').trim() || null,
    model: String(data.model || '').trim() || null,
    notes: String(data.notes || '').trim() || null,
    is_active: data.is_active === 0 || data.is_active === false ? 0 : 1,
  };
  const id = data.id ? Number(data.id) : 0;
  if (id) {
    const before = db.prepare('SELECT * FROM assets WHERE id = ?').get(id) as any;
    if (!before) throw new Error('Объект не найден');
    db.prepare(`
      UPDATE assets SET
        inventory_no=?, name=?, category=?, serial_no=?, barcode=?, status=?,
        location_id=?, employee_id=?, responsible_user_id=?, responsible_name=?,
        linked_item_id=?, purchase_date=?, warranty_until=?, cost=?,
        manufacturer=?, model=?, notes=?, is_active=?, updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).run(
      fields.inventory_no, fields.name, fields.category, fields.serial_no, fields.barcode, fields.status,
      fields.location_id, fields.employee_id, fields.responsible_user_id, fields.responsible_name,
      fields.linked_item_id, fields.purchase_date, fields.warranty_until, fields.cost,
      fields.manufacturer, fields.model, fields.notes, fields.is_active, id,
    );
    if (before.location_id !== fields.location_id || before.status !== fields.status) {
      logMovement(id, 'note', {
        from_location_id: before.location_id,
        to_location_id: fields.location_id,
        note: `Карточка изменена · ${ASSET_STATUS_LABELS[fields.status as AssetStatus] || fields.status}`,
        responsible_name: fields.responsible_name,
        employee_id: fields.employee_id,
      });
    }
    return getAsset(id);
  }
  const result = db.prepare(`
    INSERT INTO assets (
      inventory_no, name, category, serial_no, barcode, status,
      location_id, employee_id, responsible_user_id, responsible_name,
      linked_item_id, purchase_date, warranty_until, cost, manufacturer, model, notes, is_active
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    fields.inventory_no, fields.name, fields.category, fields.serial_no, fields.barcode, fields.status,
    fields.location_id, fields.employee_id, fields.responsible_user_id, fields.responsible_name,
    fields.linked_item_id, fields.purchase_date, fields.warranty_until, fields.cost,
    fields.manufacturer, fields.model, fields.notes, fields.is_active,
  );
  const newId = Number(result.lastInsertRowid);
  logMovement(newId, 'register', {
    to_location_id: fields.location_id,
    note: 'Постановка на учёт',
    responsible_name: fields.responsible_name,
    employee_id: fields.employee_id,
  });
  return getAsset(newId);
}

function logMovement(assetId: number, kind: string, data: any = {}) {
  getDb().prepare(`
    INSERT INTO asset_movements (
      asset_id, kind, from_location_id, to_location_id, employee_id, responsible_name, note, actor_name
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    Number(assetId),
    kind,
    data.from_location_id != null ? Number(data.from_location_id) : null,
    data.to_location_id != null ? Number(data.to_location_id) : null,
    data.employee_id != null ? Number(data.employee_id) : null,
    data.responsible_name || null,
    String(data.note || '').trim() || null,
    actorName(),
  );
}

export function moveAsset(assetId: number, data: {
  kind: string;
  location_id?: number | null;
  employee_id?: number | null;
  responsible_name?: string | null;
  note?: string | null;
}) {
  const db = getDb();
  const asset = db.prepare('SELECT * FROM assets WHERE id = ?').get(Number(assetId)) as any;
  if (!asset) throw new Error('Объект не найден');
  const kind = String(data.kind || 'transfer');
  if (!ASSET_MOVE_KINDS.includes(kind as any)) throw new Error('Неизвестный тип движения');

  let status = asset.status;
  const toLoc = data.location_id != null && String(data.location_id) !== '' ? Number(data.location_id) : asset.location_id;
  let employeeId = data.employee_id != null && String(data.employee_id) !== '' ? Number(data.employee_id) : asset.employee_id;
  let responsible = data.responsible_name != null
    ? (String(data.responsible_name || '').trim() || null)
    : asset.responsible_name;

  if (kind === 'issue') {
    status = 'in_use';
  } else if (kind === 'return') {
    status = 'in_stock';
  } else if (kind === 'repair') {
    status = 'repair';
  } else if (kind === 'repair_done') {
    status = 'in_use';
  } else if (kind === 'writeoff') {
    status = 'written_off';
  } else if (kind === 'transfer') {

  }

  db.prepare(`
    UPDATE assets SET
      status = ?, location_id = ?, employee_id = ?, responsible_name = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(status, toLoc || null, employeeId || null, responsible, Number(assetId));

  logMovement(Number(assetId), kind, {
    from_location_id: asset.location_id,
    to_location_id: toLoc || null,
    employee_id: employeeId || null,
    responsible_name: responsible,
    note: data.note,
  });
  return getAsset(Number(assetId));
}

export function deleteAsset(id: number) {
  getDb().prepare('UPDATE assets SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(Number(id));
  logMovement(Number(id), 'note', { note: 'Карточка скрыта (деактивирована)' });
  return true;
}

export function saveAssetMaintenance(data: any) {
  const db = getDb();
  const assetId = Number(data.asset_id);
  if (!assetId) throw new Error('Укажите объект');
  const asset = db.prepare('SELECT id FROM assets WHERE id = ?').get(assetId);
  if (!asset) throw new Error('Объект не найден');
  const kind = String(data.kind || 'service').trim() || 'service';
  const status = ['planned', 'done', 'cancelled'].includes(data.status) ? data.status : 'planned';
  const id = data.id ? Number(data.id) : 0;
  if (id) {
    db.prepare(`
      UPDATE asset_maintenance SET
        kind=?, planned_at=?, done_at=?, status=?, cost=?, vendor=?, note=?
      WHERE id=? AND asset_id=?
    `).run(
      kind,
      String(data.planned_at || '').trim() || null,
      String(data.done_at || '').trim() || null,
      status,
      data.cost != null && data.cost !== '' ? Number(data.cost) : null,
      String(data.vendor || '').trim() || null,
      String(data.note || '').trim() || null,
      id, assetId,
    );
  } else {
    db.prepare(`
      INSERT INTO asset_maintenance (asset_id, kind, planned_at, done_at, status, cost, vendor, note)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      assetId, kind,
      String(data.planned_at || '').trim() || null,
      String(data.done_at || '').trim() || null,
      status,
      data.cost != null && data.cost !== '' ? Number(data.cost) : null,
      String(data.vendor || '').trim() || null,
      String(data.note || '').trim() || null,
    );
  }
  return getAsset(assetId);
}

export function deleteAssetMaintenance(id: number) {
  const row = getDb().prepare('SELECT asset_id FROM asset_maintenance WHERE id = ?').get(Number(id)) as any;
  if (!row) return null;
  getDb().prepare('DELETE FROM asset_maintenance WHERE id = ?').run(Number(id));
  return getAsset(Number(row.asset_id));
}

export function summarizeAssets() {
  const rows = getDb().prepare(`
    SELECT status, COUNT(*) AS c FROM assets WHERE is_active = 1 GROUP BY status
  `).all() as any[];
  const byStatus: Record<string, number> = {};
  let total = 0;
  for (const row of rows) {
    byStatus[row.status] = Number(row.c) || 0;
    total += Number(row.c) || 0;
  }
  const maintDue = Number((getDb().prepare(`
    SELECT COUNT(*) AS c FROM asset_maintenance
    WHERE status = 'planned' AND planned_at IS NOT NULL AND planned_at <= date('now', '+14 days')
  `).get() as any)?.c || 0);
  return { total, byStatus, maintDue };
}
