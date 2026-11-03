/**
 * TSD outbox: enqueue → flush project_scan + stock_count.
 * node --experimental-sqlite scripts/tsd-e2e-selftest.mjs
 */
import { DatabaseSync } from 'node:sqlite';
import fs from 'fs';
import os from 'os';
import path from 'path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'metrika-tsd-'));
const db = new DatabaseSync(path.join(tmp, 'org.db'));

db.exec(`
CREATE TABLE projects (id INTEGER PRIMARY KEY, status TEXT, build_quantity REAL DEFAULT 1);
CREATE TABLE project_items (project_id INTEGER, item_id INTEGER, quantity REAL);
CREATE TABLE work_order_scans (
  id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER, item_id INTEGER, quantity REAL DEFAULT 1
);
CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT);
CREATE TABLE locations (id INTEGER PRIMARY KEY, name TEXT);
CREATE TABLE tsd_outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_op_id TEXT NOT NULL UNIQUE,
  op_type TEXT NOT NULL DEFAULT 'project_scan',
  project_id INTEGER NOT NULL,
  item_id INTEGER NOT NULL,
  barcode TEXT,
  qty REAL NOT NULL DEFAULT 1,
  device_id TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  status TEXT NOT NULL DEFAULT 'pending',
  error TEXT,
  applied_scan_id INTEGER,
  applied_at TEXT
);
CREATE TABLE tsd_stock_counts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL,
  location_id INTEGER NOT NULL,
  qty REAL NOT NULL DEFAULT 1,
  barcode TEXT,
  client_op_id TEXT,
  device_id TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`);

db.prepare("INSERT INTO projects (id, status, build_quantity) VALUES (1, 'reserved', 1)").run();
db.prepare('INSERT INTO items (id, name) VALUES (1, ?)').run('Болт');
db.prepare('INSERT INTO locations (id, name) VALUES (1, ?)').run('A-01');
db.prepare('INSERT INTO project_items (project_id, item_id, quantity) VALUES (1, 1, 2)').run();

db.prepare(`
  INSERT INTO tsd_outbox (client_op_id, op_type, project_id, item_id, qty, status)
  VALUES ('op-1', 'project_scan', 1, 1, 1, 'pending')
`).run();
db.prepare(`
  INSERT INTO tsd_outbox (client_op_id, op_type, project_id, item_id, qty, status)
  VALUES ('op-2', 'stock_count', 1, 1, 5, 'pending')
`).run();

// flush project_scan
const scanRow = db.prepare(`SELECT * FROM tsd_outbox WHERE client_op_id = 'op-1'`).get();
const project = db.prepare('SELECT status FROM projects WHERE id = 1').get();
if (project.status === 'reserved') {
  db.prepare("UPDATE projects SET status = 'picking' WHERE id = 1").run();
}
const req = db.prepare(`
  SELECT pi.quantity * p.build_quantity AS required,
    COALESCE((SELECT SUM(quantity) FROM work_order_scans WHERE project_id = pi.project_id AND item_id = pi.item_id), 0) AS scanned
  FROM project_items pi JOIN projects p ON p.id = pi.project_id
  WHERE pi.project_id = 1 AND pi.item_id = 1
`).get();
if (req.scanned >= req.required) throw new Error('already scanned');
const ins = db.prepare('INSERT INTO work_order_scans (project_id, item_id) VALUES (1, 1)').run();
db.prepare(`UPDATE tsd_outbox SET status = 'applied', applied_scan_id = ?, applied_at = CURRENT_TIMESTAMP WHERE id = ?`)
  .run(Number(ins.lastInsertRowid), scanRow.id);

// flush stock_count
const countRow = db.prepare(`SELECT * FROM tsd_outbox WHERE client_op_id = 'op-2'`).get();
db.prepare(`
  INSERT INTO tsd_stock_counts (item_id, location_id, qty, client_op_id)
  VALUES (?, ?, ?, ?)
`).run(countRow.item_id, countRow.project_id, countRow.qty, countRow.client_op_id);
db.prepare(`UPDATE tsd_outbox SET status = 'applied', applied_at = CURRENT_TIMESTAMP WHERE id = ?`).run(countRow.id);

const pending = db.prepare(`SELECT COUNT(*) AS c FROM tsd_outbox WHERE status = 'pending'`).get().c;
const scans = db.prepare(`SELECT COUNT(*) AS c FROM work_order_scans`).get().c;
const counts = db.prepare(`SELECT COUNT(*) AS c FROM tsd_stock_counts`).get().c;
if (pending !== 0 || scans < 1 || counts < 1) throw new Error('flush incomplete');

// idempotent client_op_id
let dup = false;
try {
  db.prepare(`
    INSERT INTO tsd_outbox (client_op_id, op_type, project_id, item_id, status)
    VALUES ('op-1', 'project_scan', 1, 1, 'pending')
  `).run();
} catch { dup = true; }
if (!dup) throw new Error('client_op_id uniqueness failed');

console.log(JSON.stringify({ ok: true, scans, counts, pending }, null, 2));
db.close();
fs.rmSync(tmp, { recursive: true, force: true });
