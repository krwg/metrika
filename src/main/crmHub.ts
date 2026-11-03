


import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { attachmentAbsPath, getAttachmentsRoot, getDb } from './db';
import * as registry from './registry';
import * as companyHub from './companyHub';
import { getCrmTransport, describeCrmTransport } from './crmTransport';


export type PortalAuthContext = {
  counterparty_id: number;
  registry_user_id: number | null;
  display_name: string;
  token_id: number;
};

let portalAuthOverride: PortalAuthContext | null = null;

export function withPortalAuth<T>(auth: PortalAuthContext, fn: () => T): T {
  const prev = portalAuthOverride;
  portalAuthOverride = auth;
  try {
    return fn();
  } finally {
    portalAuthOverride = prev;
  }
}

export function getPortalAuthOverride() {
  return portalAuthOverride;
}

function hashPortalToken(raw: string) {
  return crypto.createHash('sha256').update(String(raw)).digest('hex');
}

export const OPERATOR_MODES = [
  { id: 'available', label: 'На линии' },
  { id: 'busy', label: 'Занят' },
  { id: 'break', label: 'Перерыв' },
  { id: 'offline', label: 'Не в сети' },
] as const;

export const CASE_STATUSES = [
  { id: 'new', label: 'Новое' },
  { id: 'open', label: 'В работе' },
  { id: 'queued', label: 'В очереди' },
  { id: 'waiting', label: 'Ожидает ответа' },
  { id: 'solved', label: 'Решено' },
  { id: 'closed', label: 'Закрыто' },
] as const;

function actorName() {
  if (portalAuthOverride?.display_name) return portalAuthOverride.display_name;
  const u = registry.getSession()?.user;
  if (!u) return 'Система';
  return [u.last_name, u.first_name || u.display_name, u.middle_name].filter(Boolean).join(' ')
    || u.display_name || u.login || 'Система';
}

function publishTransport(input: {
  kind: string;
  thread_id?: number | null;
  case_id?: number | null;
  counterparty_id?: number | null;
  payload?: any;
}) {
  try {
    return getCrmTransport().publish(input);
  } catch (e) {
    console.warn('[Metrika] crm transport publish failed:', e);
    return null;
  }
}

function appendCaseEvent(caseId: number, eventKind: string, detail?: string, actorKind = 'staff') {
  const session = registry.getSession();
  getDb().prepare(`
    INSERT INTO crm_case_events (case_id, event_kind, actor_kind, actor_user_id, actor_name, detail)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    Number(caseId),
    eventKind,
    actorKind,
    session?.user?.id ? Number(session.user.id) : null,
    actorKind === 'system' ? 'Система' : actorName(),
    detail || null,
  );
}

function readSlaHours() {
  const db = getDb();
  const resp = Number((db.prepare("SELECT value FROM schema_meta WHERE key = 'setting:crm.sla_response_hours'").get() as any)?.value || 4);
  const resolve = Number((db.prepare("SELECT value FROM schema_meta WHERE key = 'setting:crm.sla_resolve_hours'").get() as any)?.value || 48);
  return {
    responseHours: Number.isFinite(resp) && resp > 0 ? resp : 4,
    resolveHours: Number.isFinite(resolve) && resolve > 0 ? resolve : 48,
  };
}

function slaDueIso(hours: number) {
  return new Date(Date.now() + hours * 3600 * 1000).toISOString();
}

function pickQueueCode(category?: string | null) {
  const db = getDb();
  const cat = String(category || '').trim();
  if (cat) {
    const byCat = db.prepare('SELECT code FROM crm_queues WHERE is_active = 1 AND category = ? ORDER BY sort_order, id LIMIT 1').get(cat) as any;
    if (byCat?.code) return String(byCat.code);
  }
  if (cat === 'portal') {
    const suppliers = db.prepare("SELECT code FROM crm_queues WHERE is_active = 1 AND code = 'suppliers'").get() as any;
    if (suppliers?.code) return 'suppliers';
  }
  const general = db.prepare("SELECT code FROM crm_queues WHERE is_active = 1 AND code = 'general'").get() as any;
  if (general?.code) return 'general';
  const any = db.prepare('SELECT code FROM crm_queues WHERE is_active = 1 ORDER BY sort_order, id LIMIT 1').get() as any;
  return any?.code || null;
}

function ensureCaseForThread(threadId: number, extras: {
  category?: string;
  priority?: string;
  queue_id?: string;
  related_item_id?: number | null;
  related_purchase_order_id?: number | null;
  related_sales_order_id?: number | null;
  related_shipment_id?: number | null;
} = {}) {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM crm_cases WHERE thread_id = ? ORDER BY id DESC LIMIT 1').get(Number(threadId)) as any;
  if (existing) return existing;
  const thread = db.prepare('SELECT * FROM crm_threads WHERE id = ?').get(Number(threadId)) as any;
  if (!thread) return null;
  const sla = readSlaHours();
  const queueId = extras.queue_id || pickQueueCode(extras.category) || null;
  const status = thread.assigned_user_id ? 'open' : 'queued';
  const result = db.prepare(`
    INSERT INTO crm_cases (
      counterparty_id, thread_id, subject, category, priority, status, queue_id,
      assigned_user_id, assigned_name,
      related_item_id, related_purchase_order_id, related_sales_order_id, related_shipment_id,
      sla_response_due, sla_resolve_due
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    Number(thread.counterparty_id),
    Number(threadId),
    thread.subject,
    extras.category || null,
    extras.priority || 'normal',
    status,
    queueId,
    thread.assigned_user_id || null,
    thread.assigned_name || null,
    extras.related_item_id != null ? Number(extras.related_item_id) : null,
    extras.related_purchase_order_id != null ? Number(extras.related_purchase_order_id) : null,
    extras.related_sales_order_id != null ? Number(extras.related_sales_order_id) : null,
    extras.related_shipment_id != null ? Number(extras.related_shipment_id) : null,
    slaDueIso(sla.responseHours),
    slaDueIso(sla.resolveHours),
  );
  const caseId = Number(result.lastInsertRowid);
  appendCaseEvent(caseId, 'created', `Обращение создано · очередь ${queueId || '—'}`, 'system');
  return db.prepare('SELECT * FROM crm_cases WHERE id = ?').get(caseId);
}

export function getCounterpartyCard(id: number) {
  const db = getDb();
  const cp = db.prepare(`
    SELECT c.*,
      s.name AS supplier_name,
      e.last_name AS emp_last, e.first_name AS emp_first, e.middle_name AS emp_middle,
      e.position AS emp_position, e.registry_user_id AS emp_registry_user_id
    FROM counterparties c
    LEFT JOIN suppliers s ON s.id = c.supplier_id
    LEFT JOIN employees e ON e.id = c.employee_id
    WHERE c.id = ?
  `).get(Number(id)) as any;
  if (!cp) return null;

  const sales = db.prepare(`
    SELECT id, order_no, status, total_amount, expected_at, updated_at
    FROM sales_orders WHERE counterparty_id = ? ORDER BY id DESC LIMIT 50
  `).all(Number(id));
  const contracts = db.prepare(`
    SELECT id, number, title, status, amount, date_from, date_to
    FROM contracts WHERE counterparty_id = ? ORDER BY id DESC LIMIT 50
  `).all(Number(id));
  const threads = db.prepare(`
    SELECT t.*,
      (SELECT COUNT(*) FROM crm_messages m WHERE m.thread_id = t.id) AS message_count,
      (SELECT body FROM crm_messages m WHERE m.thread_id = t.id ORDER BY m.id DESC LIMIT 1) AS last_body
    FROM crm_threads t
    WHERE t.counterparty_id = ?
    ORDER BY t.updated_at DESC, t.id DESC
    LIMIT 30
  `).all(Number(id));
  const cases = db.prepare(`
    SELECT * FROM crm_cases WHERE counterparty_id = ?
    ORDER BY updated_at DESC, id DESC LIMIT 30
  `).all(Number(id));

  let supplierItems: any[] = [];
  let purchaseOrders: any[] = [];
  let shipments: any[] = [];
  if (cp.supplier_id) {
    try {
      supplierItems = db.prepare(`
        SELECT si.*, i.name AS item_name, i.sku
        FROM supplier_items si
        LEFT JOIN items i ON i.id = si.item_id
        WHERE si.supplier_id = ?
        ORDER BY i.name
        LIMIT 100
      `).all(Number(cp.supplier_id));
    } catch { supplierItems = []; }
    try {
      purchaseOrders = db.prepare(`
        SELECT id, order_no, status, ordered_at, expected_at, note
        FROM purchase_orders
        WHERE supplier_id = ?
        ORDER BY id DESC LIMIT 50
      `).all(Number(cp.supplier_id));
      const poIds = purchaseOrders.map((p: any) => Number(p.id));
      if (poIds.length) {
        const placeholders = poIds.map(() => '?').join(',');
        shipments = db.prepare(`
          SELECT s.*, po.order_no
          FROM purchase_order_shipments s
          JOIN purchase_orders po ON po.id = s.purchase_order_id
          WHERE s.purchase_order_id IN (${placeholders})
          ORDER BY s.id DESC LIMIT 50
        `).all(...poIds);
      }
    } catch {
      purchaseOrders = [];
      shipments = [];
    }
  }

  const edo = db.prepare(`
    SELECT id, doc_no, title, status, form_type, created_at
    FROM edo_documents
    WHERE to_employee_id = ? OR from_employee_id = ?
    ORDER BY id DESC LIMIT 30
  `).all(cp.employee_id || -1, cp.employee_id || -1);

  const portalUserId = cp.registry_user_id || cp.emp_registry_user_id || null;
  let customValues: any[] = [];
  try {

    const { listCounterpartyCustomValues } = require('./db') as typeof import('./db');
    customValues = listCounterpartyCustomValues(Number(id));
  } catch { customValues = []; }

  return {
    ...cp,
    employee_name: [cp.emp_last, cp.emp_first, cp.emp_middle].filter(Boolean).join(' ') || null,
    portal_user_id: portalUserId,
    has_portal: Boolean(portalUserId),
    custom_values: customValues,
    sales,
    contracts,
    threads,
    cases,
    purchase_orders: purchaseOrders,
    shipments,
    supplier_items: supplierItems,
    edo_docs: edo,
  };
}

function counterpartyHasPortal(row: any): boolean {
  if (row.registry_user_id) return true;
  if (!row.employee_id) return false;
  try {
    const emp = getDb().prepare('SELECT registry_user_id FROM employees WHERE id = ?').get(Number(row.employee_id)) as any;
    return Boolean(emp?.registry_user_id);
  } catch {
    return false;
  }
}

export function listCrmClients(filters: { q?: string; kind?: string } = {}) {
  return companyHub.listCounterparties(filters).map((row: any) => ({
    ...row,
    has_portal: counterpartyHasPortal(row),
  }));
}

export function listCrmThreads(filters: { counterparty_id?: number; status?: string; mine?: boolean } = {}) {
  const db = getDb();
  const session = registry.getSession();
  let sql = `
    SELECT t.*, c.name AS counterparty_name, c.kind AS counterparty_kind,
      (SELECT body FROM crm_messages m WHERE m.thread_id = t.id AND IFNULL(m.is_internal,0)=0 ORDER BY m.id DESC LIMIT 1) AS last_body,
      (SELECT created_at FROM crm_messages m WHERE m.thread_id = t.id ORDER BY m.id DESC LIMIT 1) AS last_at,
      (SELECT id FROM crm_cases cs WHERE cs.thread_id = t.id ORDER BY cs.id DESC LIMIT 1) AS case_id,
      (SELECT status FROM crm_cases cs WHERE cs.thread_id = t.id ORDER BY cs.id DESC LIMIT 1) AS case_status
    FROM crm_threads t
    LEFT JOIN counterparties c ON c.id = t.counterparty_id
    WHERE 1=1
  `;
  const params: any[] = [];
  if (filters.counterparty_id) {
    sql += ' AND t.counterparty_id = ?';
    params.push(Number(filters.counterparty_id));
  }
  if (filters.status) {
    sql += ' AND t.status = ?';
    params.push(filters.status);
  }
  if (filters.mine && session?.user?.id) {
    sql += ' AND t.assigned_user_id = ?';
    params.push(Number(session.user.id));
  }
  sql += ' ORDER BY COALESCE(last_at, t.updated_at) DESC, t.id DESC LIMIT 200';
  return db.prepare(sql).all(...params);
}

export function getCrmThread(id: number, opts: { includeInternal?: boolean } = {}) {
  const db = getDb();
  const thread = db.prepare(`
    SELECT t.*, c.name AS counterparty_name, c.kind AS counterparty_kind,
      c.phone AS counterparty_phone, c.email AS counterparty_email,
      c.supplier_id AS counterparty_supplier_id
    FROM crm_threads t
    LEFT JOIN counterparties c ON c.id = t.counterparty_id
    WHERE t.id = ?
  `).get(Number(id)) as any;
  if (!thread) return null;
  const includeInternal = opts.includeInternal !== false;
  const messages = (includeInternal
    ? db.prepare('SELECT * FROM crm_messages WHERE thread_id = ? ORDER BY id ASC LIMIT 500').all(Number(id))
    : db.prepare('SELECT * FROM crm_messages WHERE thread_id = ? AND IFNULL(is_internal,0)=0 ORDER BY id ASC LIMIT 500').all(Number(id))
  ) as any[];
  const msgIds = messages.map((m) => Number(m.id));
  let attachByMsg = new Map<number, any[]>();
  if (msgIds.length) {
    const placeholders = msgIds.map(() => '?').join(',');
    const rows = db.prepare(`
      SELECT * FROM crm_message_attachments
      WHERE message_id IN (${placeholders})
      ORDER BY id ASC
    `).all(...msgIds) as any[];
    attachByMsg = rows.reduce((map, row) => {
      const list = map.get(Number(row.message_id)) || [];
      list.push(row);
      map.set(Number(row.message_id), list);
      return map;
    }, new Map<number, any[]>());
  }
  const messagesWithFiles = messages.map((m) => ({
    ...m,
    attachments: attachByMsg.get(Number(m.id)) || [],
  }));
  const caseRow = enrichCaseSla(db.prepare('SELECT * FROM crm_cases WHERE thread_id = ? ORDER BY id DESC LIMIT 1').get(Number(id)));
  return { ...thread, messages: messagesWithFiles, case: caseRow || null };
}

function enrichCaseSla(row: any) {
  if (!row) return null;
  const now = Date.now();
  const respDue = row.sla_response_due ? Date.parse(row.sla_response_due) : NaN;
  const resolveDue = row.sla_resolve_due ? Date.parse(row.sla_resolve_due) : NaN;
  return {
    ...row,
    sla_response_overdue: Number.isFinite(respDue) && respDue < now && !['solved', 'closed'].includes(row.status),
    sla_resolve_overdue: Number.isFinite(resolveDue) && resolveDue < now && !['solved', 'closed'].includes(row.status),
  };
}

export function openCrmThread(data: {
  counterparty_id: number;
  subject?: string;
  assigned_user_id?: number | null;
  body?: string;
  category?: string;
  related_item_id?: number | null;
  related_purchase_order_id?: number | null;
  related_sales_order_id?: number | null;
  related_shipment_id?: number | null;
}) {
  const db = getDb();
  const cpId = Number(data.counterparty_id);
  const cp = db.prepare('SELECT id, name FROM counterparties WHERE id = ?').get(cpId) as any;
  if (!cp) throw new Error('Контрагент не найден');
  const subject = String(data.subject || '').trim() || `Диалог · ${cp.name}`;
  const session = registry.getSession();

  let assigned: number | null = null;
  if (Object.prototype.hasOwnProperty.call(data, 'assigned_user_id')) {
    assigned = data.assigned_user_id != null ? Number(data.assigned_user_id) : null;
  } else if (session?.user?.id) {
    assigned = Number(session.user.id);
  }
  const result = db.prepare(`
    INSERT INTO crm_threads (counterparty_id, subject, status, assigned_user_id, assigned_name)
    VALUES (?, ?, 'open', ?, ?)
  `).run(cpId, subject, assigned, assigned ? actorName() : null);
  const threadId = Number(result.lastInsertRowid);
  const caseRow = ensureCaseForThread(threadId, {
    category: data.category,
    related_item_id: data.related_item_id,
    related_purchase_order_id: data.related_purchase_order_id,
    related_sales_order_id: data.related_sales_order_id,
    related_shipment_id: data.related_shipment_id,
  });
  if (data.body?.trim()) {
    postCrmMessage(threadId, { body: data.body, author_kind: 'staff' });
  }
  publishTransport({
    kind: 'thread.opened',
    thread_id: threadId,
    case_id: caseRow?.id,
    counterparty_id: cpId,
  });
  return getCrmThread(threadId);
}


export function postCrmMessage(threadId: number, data: {
  body: string;
  author_kind?: 'staff' | 'system';
  is_internal?: boolean;
  client_msg_id?: string;
}) {
  const db = getDb();
  const thread = db.prepare('SELECT * FROM crm_threads WHERE id = ?').get(Number(threadId)) as any;
  if (!thread) throw new Error('Диалог не найден');
  const body = String(data.body || '').trim();
  if (!body) throw new Error('Введите сообщение');
  if ((data as any).author_kind === 'client') {
    throw new Error('Сообщения клиента принимаются только через Метрика:Клиент');
  }
  const kind = data.author_kind === 'system' ? 'system' : 'staff';
  const session = registry.getSession();
  let authorName = actorName();
  let authorUserId = session?.user?.id ? Number(session.user.id) : null;
  if (kind === 'system') {
    authorName = 'Система';
    authorUserId = null;
  }
  const clientMsgId = String(data.client_msg_id || '').trim() || null;
  if (clientMsgId) {
    const dup = db.prepare('SELECT id FROM crm_messages WHERE thread_id = ? AND client_msg_id = ?').get(Number(threadId), clientMsgId);
    if (dup) return getCrmThread(Number(threadId));
  }
  const isInternal = data.is_internal ? 1 : 0;
  db.prepare(`
    INSERT INTO crm_messages (thread_id, author_kind, author_user_id, author_name, body, client_msg_id, is_internal)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(Number(threadId), kind, authorUserId, authorName, body, clientMsgId, isInternal);
  db.prepare(`UPDATE crm_threads SET updated_at = CURRENT_TIMESTAMP, status = CASE WHEN status = 'closed' THEN 'open' ELSE status END WHERE id = ?`)
    .run(Number(threadId));
  const caseRow = ensureCaseForThread(Number(threadId));
  if (caseRow && !isInternal) {
    db.prepare(`UPDATE crm_cases SET updated_at = CURRENT_TIMESTAMP, status = CASE WHEN status IN ('closed','solved') THEN 'open' ELSE status END WHERE id = ?`)
      .run(Number(caseRow.id));
  }
  if (!isInternal) {
    publishTransport({
      kind: 'message.created',
      thread_id: Number(threadId),
      case_id: caseRow?.id,
      counterparty_id: Number(thread.counterparty_id),
      payload: { author_kind: kind },
    });
  }
  return getCrmThread(Number(threadId));
}

export function setCrmThreadStatus(id: number, status: string) {
  const st = ['open', 'pending', 'closed'].includes(status) ? status : 'open';
  getDb().prepare('UPDATE crm_threads SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(st, Number(id));
  const caseRow = getDb().prepare('SELECT * FROM crm_cases WHERE thread_id = ? ORDER BY id DESC LIMIT 1').get(Number(id)) as any;
  if (caseRow) {
    const caseStatus = st === 'closed' ? 'closed' : st === 'pending' ? 'waiting' : 'open';
    getDb().prepare(`UPDATE crm_cases SET status = ?, updated_at = CURRENT_TIMESTAMP, closed_at = CASE WHEN ? = 'closed' THEN CURRENT_TIMESTAMP ELSE closed_at END WHERE id = ?`)
      .run(caseStatus, caseStatus, Number(caseRow.id));
    appendCaseEvent(Number(caseRow.id), 'status', `Статус диалога → ${st}`);
    publishTransport({
      kind: 'case.updated',
      thread_id: Number(id),
      case_id: Number(caseRow.id),
      counterparty_id: Number(caseRow.counterparty_id),
      payload: { status: caseStatus },
    });
  }
  return getCrmThread(Number(id));
}

export function listCrmCases(filters: {
  counterparty_id?: number;
  status?: string;
  mine?: boolean;
  queue_id?: string;
} = {}) {
  const db = getDb();
  const session = registry.getSession();
  let sql = `
    SELECT cs.*, c.name AS counterparty_name, c.kind AS counterparty_kind,
      t.subject AS thread_subject
    FROM crm_cases cs
    LEFT JOIN counterparties c ON c.id = cs.counterparty_id
    LEFT JOIN crm_threads t ON t.id = cs.thread_id
    WHERE 1=1
  `;
  const params: any[] = [];
  if (filters.counterparty_id) {
    sql += ' AND cs.counterparty_id = ?';
    params.push(Number(filters.counterparty_id));
  }
  if (filters.status) {
    sql += ' AND cs.status = ?';
    params.push(String(filters.status));
  }
  if (filters.queue_id) {
    sql += ' AND cs.queue_id = ?';
    params.push(String(filters.queue_id));
  }
  if (filters.mine && session?.user?.id) {
    sql += ' AND cs.assigned_user_id = ?';
    params.push(Number(session.user.id));
  }
  sql += ' ORDER BY cs.updated_at DESC, cs.id DESC LIMIT 200';
  return (db.prepare(sql).all(...params) as any[]).map(enrichCaseSla);
}

export function getCrmCase(id: number) {
  const db = getDb();
  const row = db.prepare(`
    SELECT cs.*, c.name AS counterparty_name, c.kind AS counterparty_kind
    FROM crm_cases cs
    LEFT JOIN counterparties c ON c.id = cs.counterparty_id
    WHERE cs.id = ?
  `).get(Number(id)) as any;
  if (!row) return null;
  const events = db.prepare('SELECT * FROM crm_case_events WHERE case_id = ? ORDER BY id ASC LIMIT 200').all(Number(id));
  const thread = row.thread_id ? getCrmThread(Number(row.thread_id)) : null;
  const card = getCounterpartyCard(Number(row.counterparty_id));
  return { ...enrichCaseSla(row), events, thread, counterparty: card };
}

export function createCrmCase(data: {
  counterparty_id: number;
  subject?: string;
  category?: string;
  priority?: string;
  queue_id?: string;
  body?: string;
  related_item_id?: number | null;
  related_purchase_order_id?: number | null;
  related_sales_order_id?: number | null;
  related_shipment_id?: number | null;
}) {
  const opened = openCrmThread({
    counterparty_id: Number(data.counterparty_id),
    subject: data.subject,
    body: data.body,
    category: data.category,
    related_item_id: data.related_item_id,
    related_purchase_order_id: data.related_purchase_order_id,
    related_sales_order_id: data.related_sales_order_id,
    related_shipment_id: data.related_shipment_id,
  });
  const caseId = opened?.case?.id;
  if (caseId && data.queue_id) {
    getDb().prepare('UPDATE crm_cases SET queue_id = ?, priority = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(String(data.queue_id), data.priority || 'normal', Number(caseId));
  } else if (caseId && data.priority) {
    getDb().prepare('UPDATE crm_cases SET priority = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(String(data.priority), Number(caseId));
  }
  return caseId ? getCrmCase(Number(caseId)) : null;
}


export function assignCrmCase(caseId: number, userId?: number | null, userName?: string | null) {
  registry.requireSession();
  const db = getDb();
  const session = registry.getSession();
  const uid = userId != null ? Number(userId) : Number(session!.user.id);
  const name = userName || (uid === Number(session!.user.id) ? actorName() : `user #${uid}`);
  const tx = db.transaction(() => {
    const current = db.prepare('SELECT * FROM crm_cases WHERE id = ?').get(Number(caseId)) as any;
    if (!current) throw new Error('Обращение не найдено');
    if (current.assigned_user_id && Number(current.assigned_user_id) !== uid && current.status === 'open') {

    }
    db.prepare(`
      UPDATE crm_cases
      SET assigned_user_id = ?, assigned_name = ?, status = CASE WHEN status IN ('new','queued') THEN 'open' ELSE status END,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(uid, name, Number(caseId));
    if (current.thread_id) {
      db.prepare('UPDATE crm_threads SET assigned_user_id = ?, assigned_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(uid, name, Number(current.thread_id));
    }
    appendCaseEvent(Number(caseId), 'assigned', `Назначено: ${name}`);
    return current;
  });
  const prev = tx();
  publishTransport({
    kind: 'case.assigned',
    case_id: Number(caseId),
    thread_id: prev.thread_id,
    counterparty_id: prev.counterparty_id,
    payload: { assigned_user_id: uid },
  });
  return getCrmCase(Number(caseId));
}

export function setCrmCaseStatus(caseId: number, status: string, opts: { resolution?: string; wait_reason?: string } = {}) {
  const allowed = CASE_STATUSES.map((s) => s.id);
  const st = allowed.includes(status as any) ? status : 'open';
  const db = getDb();
  const current = db.prepare('SELECT * FROM crm_cases WHERE id = ?').get(Number(caseId)) as any;
  if (!current) throw new Error('Обращение не найдено');
  db.prepare(`
    UPDATE crm_cases SET
      status = ?,
      resolution = COALESCE(?, resolution),
      wait_reason = COALESCE(?, wait_reason),
      closed_at = CASE WHEN ? IN ('closed','solved') THEN CURRENT_TIMESTAMP ELSE closed_at END,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(st, opts.resolution || null, opts.wait_reason || null, st, Number(caseId));
  if (current.thread_id) {
    const threadStatus = st === 'closed' || st === 'solved' ? 'closed' : st === 'waiting' ? 'pending' : 'open';
    db.prepare('UPDATE crm_threads SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(threadStatus, Number(current.thread_id));
  }
  appendCaseEvent(Number(caseId), 'status', `Статус → ${st}${opts.resolution ? `: ${opts.resolution}` : ''}`);
  publishTransport({
    kind: 'case.updated',
    case_id: Number(caseId),
    thread_id: current.thread_id,
    counterparty_id: current.counterparty_id,
    payload: { status: st },
  });
  return getCrmCase(Number(caseId));
}

export function getOperatorMode(userId?: number) {
  const uid = userId ? Number(userId) : Number(registry.getSession()?.user?.id || 0);
  if (!uid) return { mode: 'offline', label: 'Не в сети', user_id: 0 };
  const row = getDb().prepare('SELECT * FROM crm_operator_modes WHERE user_id = ?').get(uid) as any;
  const mode = row?.mode || 'offline';
  const meta = OPERATOR_MODES.find((m) => m.id === mode);
  return { user_id: uid, mode, label: meta?.label || mode, since: row?.since || null, note: row?.note || null };
}

export function setOperatorMode(mode: string, note?: string) {
  const session = registry.requireSession();
  const uid = Number(session.user.id);
  const next = OPERATOR_MODES.some((m) => m.id === mode) ? mode : 'available';
  getDb().prepare(`
    INSERT INTO crm_operator_modes (user_id, mode, note, since)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id) DO UPDATE SET mode = excluded.mode, note = excluded.note, since = CURRENT_TIMESTAMP
  `).run(uid, next, String(note || '').trim() || null);
  return getOperatorMode(uid);
}

export function listOperatorModes() {
  return getDb().prepare(`
    SELECT m.*, m.user_id AS id
    FROM crm_operator_modes m
    ORDER BY m.since DESC
  `).all();
}


export function resolvePortalCounterparty() {
  const db = getDb();
  if (portalAuthOverride) {
    const cp = db.prepare('SELECT * FROM counterparties WHERE id = ? AND is_active = 1')
      .get(Number(portalAuthOverride.counterparty_id)) as any;
    if (!cp) return null;
    return {
      ...cp,
      portal_user_id: portalAuthOverride.registry_user_id,
      is_portal: true,
    };
  }
  const session = registry.requireSession();
  const uid = Number(session.user.id);
  let cp = db.prepare(`
    SELECT * FROM counterparties
    WHERE registry_user_id = ? AND is_active = 1
    ORDER BY id LIMIT 1
  `).get(uid) as any;
  if (!cp) {
    cp = db.prepare(`
      SELECT c.* FROM counterparties c
      JOIN employees e ON e.id = c.employee_id
      WHERE e.registry_user_id = ? AND c.is_active = 1
      ORDER BY c.id LIMIT 1
    `).get(uid) as any;
  }
  if (!cp) return null;
  return {
    ...cp,
    portal_user_id: uid,
    is_portal: true,
  };
}

export function getPortalContext() {
  const counterparty = resolvePortalCounterparty();
  const card = counterparty ? getCounterpartyCard(Number(counterparty.id)) : null;
  const session = registry.getSession();
  return {
    user: portalAuthOverride
      ? {
          id: portalAuthOverride.registry_user_id,
          login: null,
          name: portalAuthOverride.display_name,
        }
      : {
          id: session?.user?.id,
          login: session?.user?.login,
          name: actorName(),
        },
    organization: session?.organization || null,
    counterparty,
    has_portal: Boolean(counterparty),
    transport: describeCrmTransport(),
    sales: (card?.sales || []).slice(0, 20),
    purchase_orders: (card?.purchase_orders || []).slice(0, 20),
    shipments: (card?.shipments || []).slice(0, 20),
    contracts: (card?.contracts || []).slice(0, 20),
  };
}

export function listPortalThreads() {
  const cp = resolvePortalCounterparty();
  if (!cp) throw new Error('Нет привязки к контрагенту. Укажите Метрика:Клиент (registry_user_id) в карточке контрагента.');
  return listCrmThreads({ counterparty_id: Number(cp.id) });
}

export function getPortalThread(id: number) {
  const cp = resolvePortalCounterparty();
  if (!cp) throw new Error('Нет привязки к контрагенту');
  const thread = getCrmThread(Number(id), { includeInternal: false });
  if (!thread || Number(thread.counterparty_id) !== Number(cp.id)) {
    throw new Error('Диалог недоступен');
  }
  return thread;
}

export function startPortalThread(data: {
  subject?: string;
  body?: string;
  category?: string;
  related_purchase_order_id?: number | null;
  related_shipment_id?: number | null;
  related_item_id?: number | null;
  client_msg_id?: string;
} = {}) {
  const cp = resolvePortalCounterparty();
  if (!cp) throw new Error('Нет привязки к контрагенту');
  const opened = openCrmThread({
    counterparty_id: Number(cp.id),
    subject: data.subject || `Обращение · ${cp.name}`,
    assigned_user_id: null,
    category: data.category || 'portal',
    related_item_id: data.related_item_id,
    related_purchase_order_id: data.related_purchase_order_id,
    related_shipment_id: data.related_shipment_id,
  });

  if (data.body?.trim() && opened?.id) {

    return postPortalMessage(Number(opened.id), data.body, data.client_msg_id);
  }
  publishTransport({
    kind: 'case.created',
    thread_id: opened?.id,
    case_id: opened?.case?.id,
    counterparty_id: Number(cp.id),
  });
  return getPortalThread(Number(opened.id));
}

export function postPortalMessage(threadId: number, body: string, clientMsgId?: string) {
  const cp = resolvePortalCounterparty();
  if (!cp) throw new Error('Нет привязки к контрагенту');
  const thread = getDb().prepare('SELECT * FROM crm_threads WHERE id = ?').get(Number(threadId)) as any;
  if (!thread || Number(thread.counterparty_id) !== Number(cp.id)) {
    throw new Error('Диалог недоступен');
  }
  const session = registry.getSession();
  const db = getDb();
  const text = String(body || '').trim();
  if (!text) throw new Error('Введите сообщение');
  const idem = String(clientMsgId || '').trim() || null;
  if (idem) {
    const dup = db.prepare('SELECT id FROM crm_messages WHERE thread_id = ? AND client_msg_id = ?').get(Number(threadId), idem);
    if (dup) return getPortalThread(Number(threadId));
  }
  const authorName = actorName() || cp.contact_person || cp.name || 'Клиент';
  const authorUserId = portalAuthOverride?.registry_user_id != null
    ? Number(portalAuthOverride.registry_user_id)
    : (session?.user?.id ? Number(session.user.id) : null);
  db.prepare(`
    INSERT INTO crm_messages (thread_id, author_kind, author_user_id, author_name, body, client_msg_id, is_internal)
    VALUES (?, 'client', ?, ?, ?, ?, 0)
  `).run(Number(threadId), authorUserId, authorName, text, idem);
  db.prepare(`
    UPDATE crm_threads SET updated_at = CURRENT_TIMESTAMP,
      status = CASE WHEN status = 'closed' THEN 'open' ELSE status END
    WHERE id = ?
  `).run(Number(threadId));
  const caseRow = ensureCaseForThread(Number(threadId));
  if (caseRow) {
    db.prepare(`UPDATE crm_cases SET updated_at = CURRENT_TIMESTAMP, status = CASE WHEN status IN ('closed','solved') THEN 'open' ELSE status END WHERE id = ?`)
      .run(Number(caseRow.id));
    appendCaseEvent(Number(caseRow.id), 'message', 'Сообщение от клиента', 'client');
  }
  publishTransport({
    kind: 'message.created',
    thread_id: Number(threadId),
    case_id: caseRow?.id,
    counterparty_id: Number(cp.id),
    payload: { author_kind: 'client' },
  });
  return getPortalThread(Number(threadId));
}

export function pollCrmEvents(sinceId: number, limit?: number) {
  if (!portalAuthOverride) registry.requireSession();
  const events = getCrmTransport().pollSince(Number(sinceId) || 0, limit);
  if (!portalAuthOverride) return events;
  const cpId = Number(portalAuthOverride.counterparty_id);
  return events.filter((e) => !e.counterparty_id || Number(e.counterparty_id) === cpId);
}

export function getCrmTransportInfo() {
  return describeCrmTransport();
}

export function issuePortalToken(counterpartyId: number, label?: string) {
  const db = getDb();
  const cp = db.prepare('SELECT id, name, registry_user_id, contact_person FROM counterparties WHERE id = ? AND is_active = 1')
    .get(Number(counterpartyId)) as any;
  if (!cp) throw new Error('Контрагент не найден');
  const raw = `mk_${crypto.randomBytes(24).toString('base64url')}`;
  const tokenHash = hashPortalToken(raw);
  const prefix = raw.slice(0, 12);
  const r = db.prepare(`
    INSERT INTO crm_portal_tokens (token_hash, token_prefix, counterparty_id, registry_user_id, label)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    tokenHash,
    prefix,
    Number(cp.id),
    cp.registry_user_id != null ? Number(cp.registry_user_id) : null,
    String(label || '').trim() || `Токен · ${cp.name}`,
  );
  return {
    id: Number(r.lastInsertRowid),
    token: raw,
    token_prefix: prefix,
    counterparty_id: Number(cp.id),
    counterparty_name: cp.name,
    label: String(label || '').trim() || `Токен · ${cp.name}`,
    note: 'Сохраните токен сейчас — повторно показать его нельзя.',
  };
}

export function listPortalTokens(counterpartyId?: number) {
  const db = getDb();
  if (counterpartyId) {
    return db.prepare(`
      SELECT t.id, t.token_prefix, t.counterparty_id, t.registry_user_id, t.label,
        t.created_at, t.last_used_at, t.revoked_at, c.name AS counterparty_name
      FROM crm_portal_tokens t
      JOIN counterparties c ON c.id = t.counterparty_id
      WHERE t.counterparty_id = ?
      ORDER BY t.id DESC
    `).all(Number(counterpartyId));
  }
  return db.prepare(`
    SELECT t.id, t.token_prefix, t.counterparty_id, t.registry_user_id, t.label,
      t.created_at, t.last_used_at, t.revoked_at, c.name AS counterparty_name
    FROM crm_portal_tokens t
    JOIN counterparties c ON c.id = t.counterparty_id
    ORDER BY t.id DESC
    LIMIT 200
  `).all();
}

export function revokePortalToken(id: number) {
  return getDb().prepare(`
    UPDATE crm_portal_tokens SET revoked_at = CURRENT_TIMESTAMP
    WHERE id = ? AND revoked_at IS NULL
  `).run(Number(id)).changes;
}

export function resolvePortalAuthByToken(rawToken: string): PortalAuthContext {
  const raw = String(rawToken || '').trim();
  if (!raw) throw new Error('Укажите токен портала');
  const db = getDb();
  const row = db.prepare(`
    SELECT t.*, c.name AS counterparty_name, c.contact_person, c.is_active
    FROM crm_portal_tokens t
    JOIN counterparties c ON c.id = t.counterparty_id
    WHERE t.token_hash = ? AND t.revoked_at IS NULL
  `).get(hashPortalToken(raw)) as any;
  if (!row || !row.is_active) throw new Error('Токен недействителен или отозван');
  db.prepare('UPDATE crm_portal_tokens SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?').run(Number(row.id));
  return {
    counterparty_id: Number(row.counterparty_id),
    registry_user_id: row.registry_user_id != null ? Number(row.registry_user_id) : null,
    display_name: String(row.contact_person || row.counterparty_name || 'Клиент'),
    token_id: Number(row.id),
  };
}

export function listCrmQueues(includeInactive = false) {
  const db = getDb();
  return db.prepare(`
    SELECT q.*,
      (SELECT COUNT(*) FROM crm_cases c WHERE c.queue_id = q.code AND c.status IN ('new','queued','open','waiting')) AS open_count
    FROM crm_queues q
    WHERE ${includeInactive ? '1=1' : 'q.is_active = 1'}
    ORDER BY q.sort_order, q.id
  `).all();
}

export function saveCrmQueue(data: { id?: number; code?: string; title: string; category?: string; priority_boost?: number; is_active?: number; sort_order?: number }) {
  registry.requireSession();
  const db = getDb();
  const title = String(data.title || '').trim();
  if (!title) throw new Error('Укажите название очереди');
  const code = String(data.code || title).trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_|_$/g, '') || `q_${Date.now()}`;
  if (data.id) {
    db.prepare(`
      UPDATE crm_queues SET title=?, category=?, priority_boost=?, is_active=?, sort_order=?
      WHERE id=?
    `).run(
      title,
      String(data.category || '').trim() || null,
      Number(data.priority_boost) || 0,
      data.is_active === 0 ? 0 : 1,
      Number(data.sort_order) || 0,
      Number(data.id),
    );
    return db.prepare('SELECT * FROM crm_queues WHERE id = ?').get(Number(data.id));
  }
  const r = db.prepare(`
    INSERT INTO crm_queues (code, title, category, priority_boost, is_active, sort_order)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    code,
    title,
    String(data.category || '').trim() || null,
    Number(data.priority_boost) || 0,
    data.is_active === 0 ? 0 : 1,
    Number(data.sort_order) || 0,
  );
  return db.prepare('SELECT * FROM crm_queues WHERE id = ?').get(Number(r.lastInsertRowid));
}


export function claimNextFromQueue(queueCode?: string | null) {
  const session = registry.requireSession();
  const uid = Number(session.user.id);
  const name = actorName();
  const db = getDb();
  const tx = db.transaction(() => {
    let sql = `
      SELECT cs.* FROM crm_cases cs
      LEFT JOIN crm_queues q ON q.code = cs.queue_id
      WHERE cs.status IN ('new','queued')
        AND (cs.assigned_user_id IS NULL OR cs.assigned_user_id = 0)
    `;
    const params: any[] = [];
    if (queueCode) {
      sql += ' AND cs.queue_id = ?';
      params.push(String(queueCode));
    }
    sql += ' ORDER BY IFNULL(q.priority_boost,0) DESC, CASE cs.priority WHEN \'high\' THEN 0 WHEN \'normal\' THEN 1 ELSE 2 END, cs.created_at ASC, cs.id ASC LIMIT 1';
    const row = db.prepare(sql).get(...params) as any;
    if (!row) return null;
    const result = db.prepare(`
      UPDATE crm_cases
      SET assigned_user_id = ?, assigned_name = ?, status = 'open', updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status IN ('new','queued') AND (assigned_user_id IS NULL OR assigned_user_id = 0)
    `).run(uid, name, Number(row.id));
    if (!result.changes) return null;
    if (row.thread_id) {
      db.prepare('UPDATE crm_threads SET assigned_user_id = ?, assigned_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(uid, name, Number(row.thread_id));
    }
    appendCaseEvent(Number(row.id), 'assigned', `Взято из очереди ${row.queue_id || '—'}: ${name}`);
    return Number(row.id);
  });
  const caseId = tx();
  if (!caseId) return null;
  const claimed = getCrmCase(caseId);
  publishTransport({
    kind: 'case.assigned',
    case_id: caseId,
    thread_id: claimed?.thread_id,
    counterparty_id: claimed?.counterparty_id,
    payload: { assigned_user_id: uid, via: 'queue' },
  });
  return claimed;
}

export function listSlaBreaches() {
  const db = getDb();
  const nowIso = new Date().toISOString();
  return (db.prepare(`
    SELECT cs.*, c.name AS counterparty_name
    FROM crm_cases cs
    LEFT JOIN counterparties c ON c.id = cs.counterparty_id
    WHERE cs.status NOT IN ('solved','closed')
      AND (
        (cs.sla_response_due IS NOT NULL AND cs.sla_response_due < ?)
        OR (cs.sla_resolve_due IS NOT NULL AND cs.sla_resolve_due < ?)
      )
    ORDER BY cs.sla_response_due ASC, cs.id ASC
    LIMIT 100
  `).all(nowIso, nowIso) as any[]).map(enrichCaseSla);
}

export function insertCrmMessageAttachment(entry: {
  message_id: number;
  file_name: string;
  stored_name: string;
  mime_type?: string | null;
  size_bytes: number;
  uploaded_by?: string | null;
}) {
  const db = getDb();
  const r = db.prepare(`
    INSERT INTO crm_message_attachments (message_id, file_name, stored_name, mime_type, size_bytes, uploaded_by)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    Number(entry.message_id),
    entry.file_name,
    entry.stored_name,
    entry.mime_type || null,
    Number(entry.size_bytes) || 0,
    entry.uploaded_by || null,
  );
  return db.prepare('SELECT * FROM crm_message_attachments WHERE id = ?').get(Number(r.lastInsertRowid));
}

export function getCrmMessageAttachment(id: number) {
  return getDb().prepare('SELECT * FROM crm_message_attachments WHERE id = ?').get(Number(id)) as any;
}


export function attachFilesToThreadMessage(threadId: number, filePaths: string[], opts: { asClient?: boolean; body?: string } = {}) {
  const db = getDb();
  const thread = db.prepare('SELECT * FROM crm_threads WHERE id = ?').get(Number(threadId)) as any;
  if (!thread) throw new Error('Диалог не найден');
  if (!filePaths.length) return getCrmThread(Number(threadId), { includeInternal: !opts.asClient });

  let messageId: number | null = null;
  const body = String(opts.body || '').trim() || (filePaths.length === 1 ? `Вложение: ${path.basename(filePaths[0])}` : `Вложения (${filePaths.length})`);
  if (opts.asClient) {
    const cp = resolvePortalCounterparty();
    if (!cp || Number(cp.id) !== Number(thread.counterparty_id)) throw new Error('Диалог недоступен');
    const session = registry.getSession();
    const r = db.prepare(`
      INSERT INTO crm_messages (thread_id, author_kind, author_user_id, author_name, body, is_internal)
      VALUES (?, 'client', ?, ?, ?, 0)
    `).run(Number(threadId), session?.user?.id ? Number(session.user.id) : null, actorName() || cp.name, body);
    messageId = Number(r.lastInsertRowid);
  } else {
    const updated = postCrmMessage(Number(threadId), { body, author_kind: 'staff' });
    const last = (updated?.messages || []).slice().reverse().find((m: any) => m.author_kind === 'staff');
    messageId = last ? Number(last.id) : null;
  }
  if (!messageId) throw new Error('Не удалось создать сообщение для вложений');

  const root = getAttachmentsRoot();
  const dirRel = `crm-msg-${messageId}`;
  const dirAbs = path.join(root, dirRel);
  fs.mkdirSync(dirAbs, { recursive: true });
  const maxBytes = 25 * 1024 * 1024;
  const created: any[] = [];
  for (const source of filePaths.slice(0, 10)) {
    if (!fs.existsSync(source)) continue;
    const stat = fs.statSync(source);
    if (!stat.isFile()) continue;
    if (stat.size > maxBytes) throw new Error(`Файл слишком большой (макс. 25 МБ): ${path.basename(source)}`);
    const fileName = path.basename(source);
    const safeBase = fileName.replace(/[\\/:*?"<>|]+/g, '_').slice(0, 120) || 'file';
    const storedName = path.join(dirRel, `${Date.now()}-${safeBase}`).replace(/\\/g, '/');
    const dest = attachmentAbsPath(storedName);
    fs.copyFileSync(source, dest);
    const ext = path.extname(fileName).toLowerCase();
    const mime = ({
      '.pdf': 'application/pdf',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.webp': 'image/webp',
      '.txt': 'text/plain',
      '.csv': 'text/csv',
      '.zip': 'application/zip',
    } as Record<string, string>)[ext] || null;
    created.push(insertCrmMessageAttachment({
      message_id: messageId,
      file_name: fileName,
      stored_name: storedName,
      mime_type: mime,
      size_bytes: stat.size,
      uploaded_by: actorName(),
    }));
  }
  db.prepare('UPDATE crm_threads SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(Number(threadId));
  publishTransport({
    kind: 'message.created',
    thread_id: Number(threadId),
    counterparty_id: Number(thread.counterparty_id),
    payload: { attachments: created.length },
  });
  return opts.asClient
    ? getPortalThread(Number(threadId))
    : getCrmThread(Number(threadId));
}
