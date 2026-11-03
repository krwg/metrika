/**
 * MIAPI token + revoke selftest (без Electron HTTP-сервера).
 * Запуск: node --experimental-sqlite scripts/miapi-e2e-selftest.mjs
 */
import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes } from 'node:crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'metrika-miapi-'));
const db = new DatabaseSync(path.join(tmp, 'org.db'));

db.exec(`
CREATE TABLE schema_meta (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE miapi_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash TEXT NOT NULL UNIQUE,
  token_prefix TEXT NOT NULL,
  label TEXT,
  created_by_user_id INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  last_used_at TEXT,
  revoked_at TEXT
);
CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT, sku TEXT, barcode TEXT, category TEXT, min_stock REAL, max_stock REAL, reorder_point REAL, cost_price REAL, item_type TEXT);
CREATE TABLE inventory (item_id INTEGER, location_id INTEGER, lot_id INTEGER, quantity REAL);
CREATE TABLE locations (id INTEGER PRIMARY KEY, name TEXT);
CREATE TABLE documents (id INTEGER PRIMARY KEY, doc_type TEXT, doc_no TEXT, status TEXT, workflow_status TEXT, party TEXT, note TEXT, doc_date TEXT, created_at TEXT, posted_at TEXT);
`);

db.prepare("INSERT INTO schema_meta (key, value) VALUES ('setting:miapi.port', '47832')").run();
db.prepare("INSERT INTO schema_meta (key, value) VALUES ('setting:miapi.enabled', '0')").run();

function hash(raw) {
  return createHash('sha256').update(String(raw)).digest('hex');
}

const raw = `mi_${randomBytes(24).toString('base64url')}`;
db.prepare(`
  INSERT INTO miapi_tokens (token_hash, token_prefix, label) VALUES (?, ?, ?)
`).run(hash(raw), raw.slice(0, 12), 'e2e');

const ok = db.prepare('SELECT id FROM miapi_tokens WHERE token_hash = ? AND revoked_at IS NULL').get(hash(raw));
if (!ok) throw new Error('token resolve failed');

db.prepare(`
  INSERT INTO items (id, name, sku, barcode, category, min_stock, cost_price, item_type)
  VALUES (1, 'Болт', 'SKU-1', '460001', 'Метизы', 10, 1.5, 'product')
`).run();
db.prepare('INSERT INTO locations (id, name) VALUES (1, ?)').run('А-01');
db.prepare('INSERT INTO inventory (item_id, location_id, lot_id, quantity) VALUES (1, 1, NULL, 25)').run();
db.prepare(`
  INSERT INTO documents (id, doc_type, doc_no, status, workflow_status, party, note, doc_date)
  VALUES (1, 'PO', 'PO-1', 'posted', NULL, 'ООО', NULL, '2026-01-01')
`).run();

const items = db.prepare(`
  SELECT i.id, i.name, COALESCE(SUM(inv.quantity), 0) AS on_hand
  FROM items i LEFT JOIN inventory inv ON inv.item_id = i.id
  GROUP BY i.id
`).all();
if (items.length !== 1 || Number(items[0].on_hand) !== 25) throw new Error('items/stock query failed');

const docs = db.prepare('SELECT id, doc_type, status FROM documents').all();
if (docs.length !== 1) throw new Error('documents query failed');

db.prepare('UPDATE miapi_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE id = ?').run(ok.id);
const revoked = db.prepare('SELECT id FROM miapi_tokens WHERE token_hash = ? AND revoked_at IS NULL').get(hash(raw));
if (revoked) throw new Error('revoke failed');

const port = db.prepare("SELECT value FROM schema_meta WHERE key = 'setting:miapi.port'").get().value;
if (port !== '47832') throw new Error('port meta missing');

console.log(JSON.stringify({
  ok: true,
  token_prefix: raw.slice(0, 12),
  items: items.length,
  on_hand: items[0].on_hand,
  documents: docs.length,
  port,
}, null, 2));

db.close();
fs.rmSync(tmp, { recursive: true, force: true });
