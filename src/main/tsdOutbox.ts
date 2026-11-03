

import crypto from 'crypto';
import { ACTIVE_RESERVE_STATUSES, getDb } from './db';

export type TsdOutboxStatus = 'pending' | 'applied' | 'rejected';

export function applyProjectScan(projectId: number, itemId: number) {
  const db = getDb();
  const project = db.prepare('SELECT status FROM projects WHERE id = ?').get(projectId) as any;
  if (!project || !(ACTIVE_RESERVE_STATUSES as readonly string[]).includes(project.status)) {
    throw new Error('Сначала зарезервируйте компоненты в разделе «Проекты»');
  }
  if (project.status === 'reserved') {
    db.prepare("UPDATE projects SET status = 'picking' WHERE id = ?").run(projectId);
  }
  const row = db.prepare(`
    SELECT pi.quantity * p.build_quantity AS required,
      COALESCE((SELECT SUM(quantity) FROM work_order_scans WHERE project_id = pi.project_id AND item_id = pi.item_id), 0) AS scanned
    FROM project_items pi
    JOIN projects p ON p.id = pi.project_id
    WHERE pi.project_id = ? AND pi.item_id = ?
  `).get(projectId, itemId) as any;
  if (!row) throw new Error('Товар не входит в спецификацию задания');
  if (row.scanned >= row.required) throw new Error('Требуемое количество уже отсканировано');
  const result = db.prepare('INSERT INTO work_order_scans (project_id, item_id) VALUES (?, ?)').run(projectId, itemId);
  const scanned = Number(row.scanned) + 1;
  const all = db.prepare(`
    SELECT pi.item_id, pi.quantity * p.build_quantity AS required,
      COALESCE((SELECT SUM(quantity) FROM work_order_scans WHERE project_id = pi.project_id AND item_id = pi.item_id), 0) AS scanned
    FROM project_items pi
    JOIN projects p ON p.id = pi.project_id
    WHERE pi.project_id = ?
  `).all(projectId) as any[];
  if (all.every((entry) => Number(entry.scanned) >= Number(entry.required))) {
    db.prepare("UPDATE projects SET status = 'picked' WHERE id = ? AND status IN ('reserved','picking')").run(projectId);
  }
  return { id: Number(result.lastInsertRowid), scanned, required: row.required };
}

export function enqueueTsdOp(input: {
  op_type?: string;
  project_id: number;
  item_id: number;
  barcode?: string;
  qty?: number;
  client_op_id?: string;
  device_id?: string;
}) {
  const db = getDb();
  const clientOpId = String(input.client_op_id || '').trim()
    || `local-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const existing = db.prepare('SELECT * FROM tsd_outbox WHERE client_op_id = ?').get(clientOpId) as any;
  if (existing) return existing;
  const r = db.prepare(`
    INSERT INTO tsd_outbox (client_op_id, op_type, project_id, item_id, barcode, qty, device_id, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
  `).run(
    clientOpId,
    String(input.op_type || 'project_scan'),
    Number(input.project_id),
    Number(input.item_id),
    String(input.barcode || '').trim() || null,
    Number(input.qty) > 0 ? Number(input.qty) : 1,
    String(input.device_id || '').trim() || null,
  );
  return db.prepare('SELECT * FROM tsd_outbox WHERE id = ?').get(Number(r.lastInsertRowid));
}

export function getTsdOutboxStatus() {
  const db = getDb();
  const counts = db.prepare(`
    SELECT status, COUNT(*) AS c FROM tsd_outbox GROUP BY status
  `).all() as Array<{ status: string; c: number }>;
  const by: Record<string, number> = { pending: 0, applied: 0, rejected: 0 };
  for (const row of counts) by[row.status] = Number(row.c) || 0;
  const pending = db.prepare(`
    SELECT id, client_op_id, op_type, project_id, item_id, barcode, created_at, status, error
    FROM tsd_outbox
    WHERE status = 'pending'
    ORDER BY id ASC
    LIMIT 50
  `).all();
  return {
    pending: by.pending || 0,
    applied: by.applied || 0,
    rejected: by.rejected || 0,
    queue: pending,
    note: (by.pending || 0) > 0
      ? `В очереди ${by.pending} операций ТСД`
      : 'Очередь ТСД пуста',
  };
}

function applyStockCountOp(row: any) {
  const db = getDb();
  const itemId = Number(row.item_id);
  const locationId = Number(row.project_id);
  const qty = Number(row.qty || 1);
  if (!itemId || !locationId) throw new Error('stock_count: нужен item_id и location_id');
  const item = db.prepare('SELECT id, name FROM items WHERE id = ?').get(itemId);
  if (!item) throw new Error('Товар не найден');
  const loc = db.prepare('SELECT id FROM locations WHERE id = ?').get(locationId);
  if (!loc) throw new Error('Ячейка не найдена');

  db.prepare(`
    INSERT INTO tsd_stock_counts (item_id, location_id, qty, barcode, client_op_id, device_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(itemId, locationId, qty, row.barcode || null, row.client_op_id, row.device_id || null);
  return { id: null as number | null, counted: qty };
}

export function flushTsdOutbox(limit = 100) {
  const db = getDb();
  const lim = Math.min(500, Math.max(1, Number(limit) || 100));
  const rows = db.prepare(`
    SELECT * FROM tsd_outbox
    WHERE status = 'pending'
    ORDER BY id ASC
    LIMIT ?
  `).all(lim) as any[];
  let applied = 0;
  let rejected = 0;
  const results: any[] = [];
  for (const row of rows) {
    try {
      let scanId: number | null = null;
      let detail: any = {};
      if (row.op_type === 'project_scan') {
        const scan = applyProjectScan(Number(row.project_id), Number(row.item_id));
        scanId = scan.id;
        detail = { scanned: scan.scanned, required: scan.required };
      } else if (row.op_type === 'stock_count') {
        detail = applyStockCountOp(row);
      } else {
        throw new Error(`Неизвестный тип операции: ${row.op_type}`);
      }
      db.prepare(`
        UPDATE tsd_outbox
        SET status = 'applied', applied_scan_id = ?, applied_at = CURRENT_TIMESTAMP, error = NULL
        WHERE id = ?
      `).run(scanId, row.id);
      applied += 1;
      results.push({ id: row.id, status: 'applied', ...detail });
    } catch (e: any) {
      const msg = e?.message || 'Ошибка';
      db.prepare(`
        UPDATE tsd_outbox
        SET status = 'rejected', error = ?, applied_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(msg, row.id);
      rejected += 1;
      results.push({ id: row.id, status: 'rejected', error: msg });
    }
  }
  const status = getTsdOutboxStatus();
  return {
    processed: rows.length,
    applied,
    rejected,
    results,
    pending: status.pending,
    applied_total: status.applied,
    rejected_total: status.rejected,
    queue: status.queue,
    note: status.note,
  };
}

export function enqueueStockCount(input: {
  location_id: number;
  item_id: number;
  qty?: number;
  barcode?: string;
  client_op_id?: string;
  device_id?: string;
}) {
  return enqueueTsdOp({
    op_type: 'stock_count',
    project_id: Number(input.location_id),
    item_id: Number(input.item_id),
    barcode: input.barcode,
    qty: input.qty,
    client_op_id: input.client_op_id,
    device_id: input.device_id,
  });
}

export function scanProjectOrEnqueue(projectId: number, itemId: number, opts?: {
  barcode?: string;
  forceQueue?: boolean;
  client_op_id?: string;
}) {
  if (opts?.forceQueue) {
    const queued = enqueueTsdOp({
      project_id: projectId,
      item_id: itemId,
      barcode: opts.barcode,
      client_op_id: opts.client_op_id,
    });
    return { queued: true, outbox: queued };
  }
  try {
    const scan = applyProjectScan(projectId, itemId);
    return { queued: false, ...scan };
  } catch (e: any) {

    const msg = e?.message || '';
    if (/спецификацию|уже отсканировано/i.test(msg)) throw e;
    const queued = enqueueTsdOp({
      project_id: projectId,
      item_id: itemId,
      barcode: opts?.barcode,
      client_op_id: opts?.client_op_id,
    });
    return { queued: true, outbox: queued, defer_reason: msg };
  }
}
