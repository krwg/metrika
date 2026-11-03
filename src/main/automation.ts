


import { net, Notification } from 'electron';
import { getDb, getExpiryWarnDays, getReserveStaleDays, listExpiringLots, listHungReserves } from './db';
import * as registry from './registry';

export const AUTOMATION_TRIGGERS = [
  'stock_below_min',
  'stock_zero',
  'lot_expiring',
  'wo_overdue',
  'po_overdue',
  'reserve_stale',
  'incoming_webhook',
] as const;

export type AutomationTrigger = (typeof AUTOMATION_TRIGGERS)[number];

export const AUTOMATION_ACTIONS = ['notify', 'audit', 'desktop_notify', 'webhook'] as const;
export type AutomationAction = (typeof AUTOMATION_ACTIONS)[number];

export const TRIGGER_LABELS: Record<AutomationTrigger, string> = {
  stock_below_min: 'Остаток ≤ минимума',
  stock_zero: 'Остаток = 0',
  lot_expiring: 'Партия истекает / просрочена',
  wo_overdue: 'Просрочен заказ-наряд',
  po_overdue: 'Просрочена поставка PO',
  reserve_stale: 'Зависший резерв',
  incoming_webhook: 'Входящий webhook (MIAPI)',
};

export const ACTION_LABELS: Record<AutomationAction, string> = {
  notify: 'Уведомление в колокольчик',
  audit: 'Запись в журнал действий',
  desktop_notify: 'Системное уведомление ОС',
  webhook: 'Webhook (HTTP POST)',
};

let schedulerTimer: NodeJS.Timeout | null = null;
let lastSchedulerRunAt: string | null = null;
let lastSchedulerFired = 0;

function parseJson<T>(raw: any, fallback: T): T {
  try {
    if (raw == null || raw === '') return fallback;
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return fallback;
  }
}

export function listAutomationRules(includeDisabled = true) {
  const db = getDb();
  const sql = includeDisabled
    ? 'SELECT * FROM automation_rules ORDER BY enabled DESC, id'
    : 'SELECT * FROM automation_rules WHERE enabled = 1 ORDER BY id';
  return (db.prepare(sql).all() as any[]).map((row) => ({
    ...row,
    condition: parseJson(row.condition_json, {}),
    action: parseJson(row.action_json, {}),
  }));
}

export function getAutomationRule(id: number) {
  const row = getDb().prepare('SELECT * FROM automation_rules WHERE id = ?').get(Number(id)) as any;
  if (!row) return null;
  return { ...row, condition: parseJson(row.condition_json, {}), action: parseJson(row.action_json, {}) };
}

export function saveAutomationRule(data: any) {
  const db = getDb();
  const name = String(data.name || '').trim();
  if (!name) throw new Error('Укажите название правила');
  const trigger = String(data.trigger_type || '') as AutomationTrigger;
  if (!AUTOMATION_TRIGGERS.includes(trigger)) throw new Error('Неизвестный триггер');
  const actionType = String(data.action_type || 'notify') as AutomationAction;
  if (!AUTOMATION_ACTIONS.includes(actionType)) throw new Error('Неизвестное действие');
  const enabled = data.enabled === 0 || data.enabled === false ? 0 : 1;
  const cooldown = Math.max(0, Math.min(24 * 60, Number(data.cooldown_minutes) || 60));
  const conditionJson = JSON.stringify(data.condition || data.condition_json || {});
  const actionPayload = { ...(data.action || data.action_json || {}) };
  if (actionType === 'webhook') {
    actionPayload.url = assertWebhookUrl(actionPayload.url || actionPayload.webhook_url || data.webhook_url || '');
  }
  const actionJson = JSON.stringify(actionPayload);
  const id = data.id ? Number(data.id) : 0;
  if (id) {
    const existing = db.prepare('SELECT id FROM automation_rules WHERE id = ?').get(id);
    if (!existing) throw new Error('Правило не найдено');
    db.prepare(`
      UPDATE automation_rules SET
        name = ?, enabled = ?, trigger_type = ?, condition_json = ?,
        action_type = ?, action_json = ?, cooldown_minutes = ?
      WHERE id = ?
    `).run(name, enabled, trigger, conditionJson, actionType, actionJson, cooldown, id);
    return getAutomationRule(id);
  }
  const result = db.prepare(`
    INSERT INTO automation_rules
      (name, enabled, trigger_type, condition_json, action_type, action_json, cooldown_minutes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(name, enabled, trigger, conditionJson, actionType, actionJson, cooldown);
  return getAutomationRule(Number(result.lastInsertRowid));
}

export function deleteAutomationRule(id: number) {
  getDb().prepare('DELETE FROM automation_log WHERE rule_id = ?').run(Number(id));
  return getDb().prepare('DELETE FROM automation_rules WHERE id = ?').run(Number(id)).changes;
}

export function listAutomationLog(limit = 100) {
  return getDb().prepare(`
    SELECT l.*, r.name AS rule_name
    FROM automation_log l
    LEFT JOIN automation_rules r ON r.id = l.rule_id
    ORDER BY l.id DESC
    LIMIT ?
  `).all(Math.max(1, Math.min(300, Number(limit) || 100)));
}

export function pushAppNotification(text: string, level: 'info' | 'warn' | 'error' = 'info', source = 'automation') {
  const db = getDb();
  const trimmed = String(text || '').trim();
  if (!trimmed) return null;
  const result = db.prepare(`
    INSERT INTO app_notifications (text, level, source, is_read)
    VALUES (?, ?, ?, 0)
  `).run(trimmed, level, source);
  db.prepare(`
    DELETE FROM app_notifications
    WHERE id NOT IN (SELECT id FROM app_notifications ORDER BY id DESC LIMIT 120)
  `).run();
  return {
    id: String(result.lastInsertRowid),
    text: trimmed,
    level,
    source,
    at: new Date().toISOString(),
    read: false,
  };
}

export function listAppNotifications(limit = 80) {
  return (getDb().prepare(`
    SELECT id, text, level, source, is_read, created_at
    FROM app_notifications
    ORDER BY id DESC
    LIMIT ?
  `).all(Math.max(1, Math.min(120, Number(limit) || 80))) as any[]).map((row) => ({
    id: String(row.id),
    text: row.text,
    level: row.level || 'info',
    source: row.source || 'app',
    at: row.created_at,
    read: Boolean(row.is_read),
  }));
}

export function markAppNotificationsRead() {
  return getDb().prepare('UPDATE app_notifications SET is_read = 1 WHERE is_read = 0').run().changes;
}

export function clearAppNotifications() {
  return getDb().prepare('DELETE FROM app_notifications').run().changes;
}

function cooldownOk(rule: any) {
  const minutes = Math.max(0, Number(rule.cooldown_minutes) || 0);
  if (!minutes || !rule.last_fired_at) return true;
  const last = new Date(rule.last_fired_at).getTime();
  if (!Number.isFinite(last)) return true;
  return Date.now() - last >= minutes * 60_000;
}

function matchCategory(condition: any, category: string | null | undefined) {
  const want = String(condition?.category || '').trim().toLowerCase();
  if (!want) return true;
  return String(category || '').trim().toLowerCase() === want;
}

function assertWebhookUrl(raw: string) {
  const url = String(raw || '').trim();
  if (!url) throw new Error('Укажите URL webhook');
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new Error('Некорректный URL webhook'); }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Webhook допускает только http:// или https://');
  }
  return parsed.toString();
}

async function deliverWebhook(rule: any, action: any, text: string, entity?: string | null, entityId?: number | null) {
  const url = assertWebhookUrl(action.url || action.webhook_url || '');
  const session = registry.getSession();
  const payload = {
    event: 'automation.fire',
    rule_id: rule.id,
    rule_name: rule.name,
    trigger_type: rule.trigger_type,
    detail: text,
    entity: entity || null,
    entity_id: entityId != null ? String(entityId) : null,
    organization_id: session?.organization?.id ?? null,
    fired_at: new Date().toISOString(),
  };
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': 'Metrika-Automation/0.5',
    ...(action.headers && typeof action.headers === 'object' ? action.headers : {}),
  };
  if (action.secret) headers['X-Metrika-Secret'] = String(action.secret);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), Math.max(2000, Math.min(30000, Number(action.timeout_ms) || 8000)));
  try {
    const res = await net.fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}${body ? `: ${body.slice(0, 180)}` : ''}`);
    }
    return { ok: true, status: res.status };
  } finally {
    clearTimeout(timer);
  }
}

function fireRule(rule: any, detail: string, entity?: string | null, entityId?: number | null) {
  const db = getDb();
  const action = parseJson<any>(rule.action_json || rule.action, {});
  const level = (['info', 'warn', 'error'].includes(action.level) ? action.level : 'warn') as 'info' | 'warn' | 'error';
  const text = String(action.message || detail || rule.name).trim();

  if (rule.action_type === 'notify' || rule.action_type === 'desktop_notify') {
    pushAppNotification(text, level, `rule:${rule.id}`);
  }
  if (rule.action_type === 'desktop_notify' || action.desktop === true) {
    try {
      if (Notification.isSupported()) {
        new Notification({ title: String(action.title || rule.name || 'Метрика'), body: text }).show();
      }
    } catch {  }
  }
  if (rule.action_type === 'audit' || action.also_audit) {
    try {
      const session = registry.getSession();
      registry.logAudit(String(action.audit_action || 'automation.fire'), {
        organizationId: session?.organization?.id,
        userId: session?.user?.id,
        userLogin: session?.user?.login,
        userName: session?.user?.display_name,
        entity: entity || 'automation',
        entityId: entityId != null ? String(entityId) : String(rule.id),
        detail: text,
      });
    } catch {  }
  }
  if (rule.action_type === 'webhook') {
    try {
      assertWebhookUrl(action.url || action.webhook_url || '');
    } catch (e: any) {
      pushAppNotification(`Webhook «${rule.name}»: ${e?.message || 'ошибка URL'}`, 'error', `rule:${rule.id}`);
      db.prepare(`
        INSERT INTO automation_log (rule_id, detail, entity, entity_id)
        VALUES (?, ?, ?, ?)
      `).run(rule.id, `Webhook ошибка: ${e?.message || 'bad url'}`, entity || null, entityId != null ? String(entityId) : null);
      return { rule_id: rule.id, detail: text, webhook: false };
    }
    void deliverWebhook(rule, action, text, entity, entityId).then((res) => {
      try {
        getDb().prepare(`
          INSERT INTO automation_log (rule_id, detail, entity, entity_id)
          VALUES (?, ?, ?, ?)
        `).run(rule.id, `Webhook OK · HTTP ${res.status} · ${text}`.slice(0, 500), entity || null, entityId != null ? String(entityId) : null);
      } catch {  }
    }).catch((err: any) => {
      const msg = err?.name === 'AbortError' ? 'таймаут' : (err?.message || 'ошибка сети');
      try {
        pushAppNotification(`Webhook «${rule.name}»: ${msg}`, 'error', `rule:${rule.id}`);
        getDb().prepare(`
          INSERT INTO automation_log (rule_id, detail, entity, entity_id)
          VALUES (?, ?, ?, ?)
        `).run(rule.id, `Webhook ошибка: ${msg}`.slice(0, 500), entity || null, entityId != null ? String(entityId) : null);
      } catch {  }
    });
  }

  db.prepare(`
    INSERT INTO automation_log (rule_id, detail, entity, entity_id)
    VALUES (?, ?, ?, ?)
  `).run(
    rule.id,
    rule.action_type === 'webhook' ? `Webhook отправлен · ${text}`.slice(0, 500) : text,
    entity || null,
    entityId != null ? String(entityId) : null,
  );
  db.prepare('UPDATE automation_rules SET last_fired_at = CURRENT_TIMESTAMP WHERE id = ?').run(rule.id);
  return { rule_id: rule.id, detail: text };
}


export function evaluateTrigger(trigger: AutomationTrigger, context: Record<string, any> = {}) {
  const rules = listAutomationRules(false).filter((r) => r.trigger_type === trigger && r.enabled);
  const fired: any[] = [];
  for (const rule of rules) {
    if (!cooldownOk(rule)) continue;
    const condition = rule.condition || {};
    let ok = true;

    if (trigger === 'stock_below_min' || trigger === 'stock_zero') {
      const onHand = Number(context.on_hand);
      const minStock = Number(context.min_stock) || 0;
      if (!Number.isFinite(onHand)) { ok = false; }
      else if (trigger === 'stock_zero') ok = onHand <= 0;
      else ok = onHand <= minStock;
      if (ok && condition.item_id && Number(condition.item_id) !== Number(context.item_id)) ok = false;
      if (ok && !matchCategory(condition, context.category)) ok = false;
    }

    if (trigger === 'lot_expiring') {
      if (condition.item_id && Number(condition.item_id) !== Number(context.item_id)) ok = false;
      if (ok && !matchCategory(condition, context.category)) ok = false;
    }

    if (trigger === 'wo_overdue' || trigger === 'po_overdue' || trigger === 'reserve_stale') {

      ok = true;
      if (condition.priority && context.priority && String(condition.priority) !== String(context.priority)) ok = false;
    }

    if (trigger === 'incoming_webhook') {
      ok = true;
      if (condition.event && context.event && String(condition.event) !== String(context.event)) ok = false;
    }

    if (!ok) continue;
    const detail = String(context.detail || buildDefaultDetail(trigger, context));
    fired.push(fireRule(rule, detail, context.entity || null, context.entity_id ?? context.item_id ?? null));
  }
  return fired;
}

function buildDefaultDetail(trigger: AutomationTrigger, ctx: Record<string, any>) {
  switch (trigger) {
    case 'stock_below_min':
      return `Низкий остаток: ${ctx.item_name || `#${ctx.item_id}`} — ${ctx.on_hand} (мин. ${ctx.min_stock})`;
    case 'stock_zero':
      return `Нулевой остаток: ${ctx.item_name || `#${ctx.item_id}`}`;
    case 'lot_expiring':
      return `Партия ${ctx.lot_no || ''} · ${ctx.item_name || ''} · ${ctx.status || 'срок'} ${ctx.expiry_date || ''}`;
    case 'wo_overdue':
      return `Просрочен заказ-наряд ${ctx.order_no || ctx.name || ''} · срок ${ctx.due_date || ''}`;
    case 'po_overdue':
      return `Просрочена поставка ${ctx.order_no || ''} · ожид. ${ctx.expected_at || ''}`;
    case 'reserve_stale':
      return `Зависший резерв: ${ctx.item_name || ''} · ${ctx.quantity || ''} шт · ${ctx.order_no || ''}`;
    case 'incoming_webhook':
      return String(ctx.detail || `Входящий webhook: ${ctx.event || ''}`);
    default:
      return TRIGGER_LABELS[trigger] || trigger;
  }
}


export function runStockAutomations(itemId: number) {
  try {
    const db = getDb();
    const item = db.prepare('SELECT id, name, category, min_stock FROM items WHERE id = ?').get(Number(itemId)) as any;
    if (!item) return [];
    const onHand = Number(
      (db.prepare('SELECT COALESCE(SUM(quantity), 0) AS q FROM inventory WHERE item_id = ?').get(Number(itemId)) as any)?.q || 0,
    );
    const fired: any[] = [];
    if (onHand <= 0) {
      fired.push(...evaluateTrigger('stock_zero', {
        item_id: item.id, item_name: item.name, category: item.category, on_hand: onHand, min_stock: item.min_stock,
        entity: 'item', entity_id: item.id,
      }));
    }
    if (Number(item.min_stock) > 0 && onHand <= Number(item.min_stock)) {
      fired.push(...evaluateTrigger('stock_below_min', {
        item_id: item.id, item_name: item.name, category: item.category, on_hand: onHand, min_stock: item.min_stock,
        entity: 'item', entity_id: item.id,
      }));
    }
    return fired;
  } catch {
    return [];
  }
}


export function runScheduledAutomations() {
  const fired: any[] = [];
  try {
    const db = getDb();
    const warnDays = getExpiryWarnDays();
    for (const lot of listExpiringLots(warnDays, 40) as any[]) {
      fired.push(...evaluateTrigger('lot_expiring', {
        item_id: lot.item_id,
        item_name: lot.item_name,
        category: lot.category,
        lot_no: lot.lot_no,
        expiry_date: lot.expiry_date,
        status: lot.status,
        entity: 'lot',
        entity_id: lot.id,
      }));
    }

    const overdueWo = db.prepare(`
      SELECT id, order_no, name, due_date, priority, status
      FROM projects
      WHERE due_date IS NOT NULL AND due_date < date('now')
        AND status NOT IN ('consumed','finished','completed')
      ORDER BY due_date
      LIMIT 40
    `).all() as any[];
    for (const wo of overdueWo) {
      fired.push(...evaluateTrigger('wo_overdue', {
        ...wo, entity: 'project', entity_id: wo.id,
      }));
    }

    const overduePo = db.prepare(`
      SELECT id, order_no, expected_at, status
      FROM purchase_orders
      WHERE expected_at IS NOT NULL AND expected_at < date('now')
        AND status IN ('draft','ordered','partial')
      ORDER BY expected_at
      LIMIT 40
    `).all() as any[];
    for (const po of overduePo) {
      fired.push(...evaluateTrigger('po_overdue', {
        ...po, entity: 'purchase_order', entity_id: po.id,
      }));
    }

    const staleDays = getReserveStaleDays();
    for (const row of listHungReserves(staleDays) as any[]) {
      fired.push(...evaluateTrigger('reserve_stale', {
        item_id: row.item_id,
        item_name: row.item_name,
        quantity: row.quantity,
        order_no: row.order_no || row.project_order_no,
        entity: 'reserve',
        entity_id: row.project_id,
      }));
    }
  } catch {  }
  lastSchedulerRunAt = new Date().toISOString();
  lastSchedulerFired = fired.length;
  return fired;
}

export function getAutomationIntervalMinutes() {
  try {
    const raw = (getDb().prepare("SELECT value FROM schema_meta WHERE key = 'setting:automation.interval_minutes'").get() as any)?.value;
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 1) return Math.min(1440, Math.max(1, Math.round(n)));
  } catch {  }
  return 15;
}

export function setAutomationIntervalMinutes(minutes: number) {
  const n = Math.min(1440, Math.max(1, Math.round(Number(minutes) || 15)));
  getDb().prepare(`
    INSERT INTO schema_meta (key, value) VALUES ('setting:automation.interval_minutes', ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(String(n));
  if (schedulerTimer) startAutomationScheduler(n);
  return n;
}

export function getAutomationSchedulerStatus() {
  return {
    running: Boolean(schedulerTimer),
    interval_minutes: getAutomationIntervalMinutes(),
    last_run_at: lastSchedulerRunAt,
    last_fired: lastSchedulerFired,
  };
}


export function startAutomationScheduler(intervalMinutes?: number) {
  stopAutomationScheduler();
  const minutes = intervalMinutes != null
    ? Math.min(1440, Math.max(1, Math.round(Number(intervalMinutes) || 15)))
    : getAutomationIntervalMinutes();
  const ms = minutes * 60_000;
  schedulerTimer = setInterval(() => {
    try {
      if (!registry.getSession()) return;
      runScheduledAutomations();
    } catch (error) {
      console.warn('[Metrika] Automation scheduler tick failed:', error);
    }
  }, ms);
  if (typeof schedulerTimer.unref === 'function') schedulerTimer.unref();
  return getAutomationSchedulerStatus();
}

export function stopAutomationScheduler() {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }
}

export function ensureDefaultAutomationRules() {
  const db = getDb();
  const count = Number((db.prepare('SELECT COUNT(*) AS c FROM automation_rules').get() as any)?.c || 0);
  if (count > 0) return;
  const seed = [
    {
      name: 'Низкий остаток → уведомление',
      trigger_type: 'stock_below_min',
      action_type: 'notify',
      action_json: JSON.stringify({ level: 'warn' }),
      cooldown_minutes: 120,
    },
    {
      name: 'Нулевой остаток → системное уведомление',
      trigger_type: 'stock_zero',
      action_type: 'desktop_notify',
      action_json: JSON.stringify({ level: 'error', title: 'Метрика · остаток 0' }),
      cooldown_minutes: 180,
    },
    {
      name: 'Просрочка WO → уведомление',
      trigger_type: 'wo_overdue',
      action_type: 'notify',
      action_json: JSON.stringify({ level: 'warn' }),
      cooldown_minutes: 360,
    },
  ];
  const ins = db.prepare(`
    INSERT INTO automation_rules
      (name, enabled, trigger_type, condition_json, action_type, action_json, cooldown_minutes)
    VALUES (?, 1, ?, '{}', ?, ?, ?)
  `);
  for (const row of seed) {
    ins.run(row.name, row.trigger_type, row.action_type, row.action_json, row.cooldown_minutes);
  }
}
