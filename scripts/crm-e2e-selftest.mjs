/**
 * Сквозной сценарий CRM на node:sqlite (без Electron native модулей):
 * поставщик → сообщение → обращение → ответ оператора → идемпотентность.
 * Запуск: node scripts/crm-e2e-selftest.mjs
 */
import { DatabaseSync } from 'node:sqlite';
import fs from 'fs';
import os from 'os';
import path from 'path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'metrika-crm-'));
const dbPath = path.join(tmp, 'org.db');
const db = new DatabaseSync(dbPath);

db.exec(`
CREATE TABLE counterparties (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  kind TEXT,
  contact_person TEXT,
  supplier_id INTEGER,
  registry_user_id INTEGER,
  is_active INTEGER DEFAULT 1
);
CREATE TABLE suppliers (id INTEGER PRIMARY KEY, name TEXT);
CREATE TABLE purchase_orders (
  id INTEGER PRIMARY KEY, order_no TEXT, supplier_id INTEGER, status TEXT, note TEXT
);
CREATE TABLE purchase_order_shipments (
  id INTEGER PRIMARY KEY, purchase_order_id INTEGER, status TEXT, note TEXT, tracking_no TEXT
);
CREATE TABLE crm_threads (
  id INTEGER PRIMARY KEY AUTOINCREMENT, counterparty_id INTEGER NOT NULL, subject TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open', assigned_user_id INTEGER, assigned_name TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE crm_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT, thread_id INTEGER NOT NULL,
  author_kind TEXT NOT NULL DEFAULT 'staff', author_name TEXT,
  body TEXT NOT NULL, client_msg_id TEXT, is_internal INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX idx_crm_messages_idem ON crm_messages(thread_id, client_msg_id) WHERE client_msg_id IS NOT NULL AND client_msg_id != '';
CREATE TABLE crm_cases (
  id INTEGER PRIMARY KEY AUTOINCREMENT, counterparty_id INTEGER NOT NULL, thread_id INTEGER,
  subject TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'new',
  related_purchase_order_id INTEGER, related_shipment_id INTEGER,
  assigned_user_id INTEGER, assigned_name TEXT
);
CREATE TABLE crm_transport_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, thread_id INTEGER, case_id INTEGER,
  counterparty_id INTEGER, payload_json TEXT
);
CREATE TABLE crm_portal_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash TEXT NOT NULL UNIQUE,
  token_prefix TEXT NOT NULL,
  counterparty_id INTEGER NOT NULL,
  registry_user_id INTEGER,
  label TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  last_used_at TEXT,
  revoked_at TEXT
);
`);

db.prepare('INSERT INTO suppliers (id, name) VALUES (1, ?)').run('ООО Поставщик');
db.prepare('INSERT INTO counterparties (name, kind, supplier_id, registry_user_id, contact_person, is_active) VALUES (?, ?, 1, 42, ?, 1)')
  .run('ООО Поставщик', 'supplier', 'Иванов И.И.');
const cpId = 1;
db.prepare('INSERT INTO purchase_orders (id, order_no, supplier_id, status, note) VALUES (1, ?, 1, ?, ?)')
  .run('ЗП-100', 'ordered', 'Ожидаем поставку');
db.prepare('INSERT INTO purchase_order_shipments (id, purchase_order_id, status, note, tracking_no) VALUES (1, 1, ?, ?, ?)')
  .run('delayed', 'Задержка на складе перевозчика', 'TRK-9');

function publish(kind, threadId, caseId, counterpartyId, payload) {
  db.prepare('INSERT INTO crm_transport_events (kind, thread_id, case_id, counterparty_id, payload_json) VALUES (?, ?, ?, ?, ?)')
    .run(kind, threadId, caseId, counterpartyId, payload ? JSON.stringify(payload) : null);
}

const subject = 'Задержка поставки ЗП-100';
const thr = db.prepare('INSERT INTO crm_threads (counterparty_id, subject, status) VALUES (?, ?, ?)').run(cpId, subject, 'open');
const threadId = Number(thr.lastInsertRowid);
const cs = db.prepare('INSERT INTO crm_cases (counterparty_id, thread_id, subject, status, related_purchase_order_id, related_shipment_id) VALUES (?, ?, ?, ?, 1, 1)')
  .run(cpId, threadId, subject, 'new');
const caseId = Number(cs.lastInsertRowid);
const msgId = 'client-delay-1';
db.prepare('INSERT INTO crm_messages (thread_id, author_kind, author_name, body, client_msg_id) VALUES (?, ?, ?, ?, ?)')
  .run(threadId, 'client', 'Иванов И.И.', 'Поставка задерживается на 3 дня', msgId);

const before = db.prepare('SELECT COUNT(*) AS c FROM crm_messages WHERE thread_id = ?').get(threadId).c;
let dupBlocked = false;
try {
  db.prepare('INSERT INTO crm_messages (thread_id, author_kind, author_name, body, client_msg_id) VALUES (?, ?, ?, ?, ?)')
    .run(threadId, 'client', 'Иванов И.И.', 'Поставка задерживается на 3 дня', msgId);
} catch {
  dupBlocked = true;
}
const after = db.prepare('SELECT COUNT(*) AS c FROM crm_messages WHERE thread_id = ?').get(threadId).c;
if (!dupBlocked || after !== before) throw new Error('idempotency failed');

publish('message.created', threadId, caseId, cpId, { author_kind: 'client' });

const cps = db.prepare('SELECT COUNT(*) AS c FROM counterparties WHERE supplier_id = 1').get().c;
if (cps !== 1) throw new Error('supplier counterparty duplicated');

db.prepare('INSERT INTO crm_messages (thread_id, author_kind, author_name, body) VALUES (?, ?, ?, ?)')
  .run(threadId, 'staff', 'Оператор', 'Приняли, обновляем статус поставки');
db.prepare('UPDATE crm_cases SET status = ?, assigned_user_id = 1, assigned_name = ? WHERE id = ?')
  .run('open', 'Оператор', caseId);
publish('message.created', threadId, caseId, cpId, { author_kind: 'staff' });

const staffMsgs = db.prepare('SELECT COUNT(*) AS c FROM crm_messages WHERE thread_id = ? AND author_kind = ?').get(threadId, 'staff').c;
if (staffMsgs < 1) throw new Error('staff reply missing');

const ship = db.prepare('SELECT status, note FROM purchase_order_shipments WHERE id = 1').get();
if (ship.status !== 'delayed') throw new Error('shipment context lost');

const events = db.prepare('SELECT COUNT(*) AS c FROM crm_transport_events').get().c;
if (events < 2) throw new Error('transport events missing');

// Portal resolve: registry_user_id → same counterparty
const portalCp = db.prepare('SELECT id, name FROM counterparties WHERE registry_user_id = 42 AND is_active = 1').get();
if (!portalCp || portalCp.id !== cpId) throw new Error('portal resolve mismatch');

// Portal token path (RemoteHttp auth): hash lookup → same counterparty, revoke blocks
const { createHash } = await import('node:crypto');
const rawToken = 'mk_e2e_test_token_abcdefghijklmnopqrstuv';
const tokenHash = createHash('sha256').update(rawToken).digest('hex');
db.prepare(`
  INSERT INTO crm_portal_tokens (token_hash, token_prefix, counterparty_id, registry_user_id, label)
  VALUES (?, ?, ?, 42, ?)
`).run(tokenHash, rawToken.slice(0, 12), cpId, 'e2e');
const byToken = db.prepare(`
  SELECT t.counterparty_id, c.name, t.revoked_at
  FROM crm_portal_tokens t
  JOIN counterparties c ON c.id = t.counterparty_id
  WHERE t.token_hash = ? AND t.revoked_at IS NULL
`).get(tokenHash);
if (!byToken || byToken.counterparty_id !== cpId) throw new Error('portal token resolve failed');
db.prepare('UPDATE crm_portal_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE token_hash = ?').run(tokenHash);
const revoked = db.prepare(`
  SELECT id FROM crm_portal_tokens WHERE token_hash = ? AND revoked_at IS NULL
`).get(tokenHash);
if (revoked) throw new Error('portal token revoke failed');

console.log(JSON.stringify({
  ok: true,
  counterparty_id: cpId,
  thread_id: threadId,
  case_id: caseId,
  messages: after + staffMsgs,
  transport_events: events,
  shipment: ship,
  portal_counterparty: portalCp.name,
  portal_token: 'ok',
}, null, 2));

db.close();
fs.rmSync(tmp, { recursive: true, force: true });
