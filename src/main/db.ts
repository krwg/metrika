import Database from 'better-sqlite3';
import path from 'path';
import { app } from 'electron';
import fs from 'fs';
import { moneyQty, roundMoney, toPackagePrice, toUnitPrice } from './pricing';

let db: Database.Database;
let dbPath = '';

export function initDatabase(customPath?: string) {
  if (db) {
    try { db.close(); } catch {  }
  }
  dbPath = customPath || path.join(app.getPath('userData'), 'metrika.db');
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  db = new Database(dbPath);
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS zones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL COLLATE NOCASE UNIQUE,
      color TEXT NOT NULL DEFAULT '#4f7c68',
      parent_id INTEGER REFERENCES categories(id),
      sku_prefix TEXT,
      archived INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS units (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL COLLATE NOCASE UNIQUE,
      symbol TEXT NOT NULL COLLATE NOCASE UNIQUE,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      barcode TEXT UNIQUE,
      name TEXT NOT NULL,
      sku TEXT,
      category TEXT,
      min_stock INTEGER DEFAULT 5,
      description TEXT,
      print_name TEXT,
      unit_id INTEGER REFERENCES units(id),
      sale_price REAL,
      cost_price REAL,
      origin TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS locations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      barcode TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      zone_id INTEGER REFERENCES zones(id),
      location_type TEXT NOT NULL DEFAULT 'cell',
      parent_location_id INTEGER REFERENCES locations(id)
    );

    CREATE TABLE IF NOT EXISTS inventory (
      item_id INTEGER,
      location_id INTEGER,
      quantity INTEGER DEFAULT 0,
      PRIMARY KEY (item_id, location_id),
      FOREIGN KEY (item_id) REFERENCES items(id),
      FOREIGN KEY (location_id) REFERENCES locations(id)
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER,
      location_id INTEGER,
      type TEXT CHECK(type IN ('in', 'out', 'move')),
      quantity INTEGER,
      comment TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      user_name TEXT DEFAULT 'Локальный оператор',
      reversed_at DATETIME
    );

    CREATE TABLE IF NOT EXISTS search_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      query TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS inventory_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      location_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME,
      FOREIGN KEY (location_id) REFERENCES locations(id)
    );

    CREATE TABLE IF NOT EXISTS inventory_counts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      item_id INTEGER NOT NULL,
      counted_quantity INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (session_id) REFERENCES inventory_sessions(id),
      FOREIGN KEY (item_id) REFERENCES items(id)
    );

    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      order_no TEXT UNIQUE,
      target_name TEXT,
      build_quantity INTEGER NOT NULL DEFAULT 1,
      priority TEXT NOT NULL DEFAULT 'normal',
      due_date TEXT,
      reserved_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS project_items (
      project_id INTEGER NOT NULL,
      item_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (project_id, item_id),
      FOREIGN KEY (project_id) REFERENCES projects(id),
      FOREIGN KEY (item_id) REFERENCES items(id)
    );

    CREATE TABLE IF NOT EXISTS project_reservations (
      project_id INTEGER NOT NULL,
      item_id INTEGER NOT NULL,
      location_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL,
      PRIMARY KEY (project_id, item_id, location_id),
      FOREIGN KEY (project_id) REFERENCES projects(id),
      FOREIGN KEY (item_id) REFERENCES items(id),
      FOREIGN KEY (location_id) REFERENCES locations(id)
    );

    CREATE TABLE IF NOT EXISTS work_order_scans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      item_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      scanned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id),
      FOREIGN KEY (item_id) REFERENCES items(id)
    );

    CREATE TABLE IF NOT EXISTS item_photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL,
      file_path TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (item_id) REFERENCES items(id)
    );

    CREATE TABLE IF NOT EXISTS item_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      category TEXT,
      sku_prefix TEXT,
      min_stock INTEGER NOT NULL DEFAULT 0,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS item_barcodes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL,
      barcode TEXT UNIQUE NOT NULL,
      is_primary INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (item_id) REFERENCES items(id)
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_counts_session_item ON inventory_counts(session_id, item_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_item_barcodes_code ON item_barcodes(barcode);
    CREATE INDEX IF NOT EXISTS idx_item_barcodes_item ON item_barcodes(item_id);
  `);

  const columns = (table: string) => new Set((db.prepare(`PRAGMA table_info(${table})`).all() as any[]).map((column) => column.name));
  if (!columns('locations').has('zone_id')) db.exec('ALTER TABLE locations ADD COLUMN zone_id INTEGER REFERENCES zones(id)');
  if (!columns('locations').has('location_type')) db.exec("ALTER TABLE locations ADD COLUMN location_type TEXT NOT NULL DEFAULT 'cell'");
  if (!columns('locations').has('parent_location_id')) db.exec('ALTER TABLE locations ADD COLUMN parent_location_id INTEGER REFERENCES locations(id)');
  if (!columns('transactions').has('user_name')) db.exec("ALTER TABLE transactions ADD COLUMN user_name TEXT DEFAULT 'Локальный оператор'");
  if (!columns('transactions').has('reversed_at')) db.exec('ALTER TABLE transactions ADD COLUMN reversed_at DATETIME');
  if (!columns('projects').has('order_no')) db.exec('ALTER TABLE projects ADD COLUMN order_no TEXT');
  if (!columns('projects').has('target_name')) db.exec('ALTER TABLE projects ADD COLUMN target_name TEXT');
  if (!columns('projects').has('build_quantity')) db.exec('ALTER TABLE projects ADD COLUMN build_quantity INTEGER NOT NULL DEFAULT 1');
  if (!columns('projects').has('priority')) db.exec("ALTER TABLE projects ADD COLUMN priority TEXT NOT NULL DEFAULT 'normal'");
  if (!columns('projects').has('due_date')) db.exec('ALTER TABLE projects ADD COLUMN due_date TEXT');
  if (!columns('projects').has('reserved_at')) db.exec('ALTER TABLE projects ADD COLUMN reserved_at DATETIME');
  if (!columns('items').has('description')) db.exec('ALTER TABLE items ADD COLUMN description TEXT');
  if (!columns('items').has('print_name')) db.exec('ALTER TABLE items ADD COLUMN print_name TEXT');
  if (!columns('items').has('unit_id')) db.exec('ALTER TABLE items ADD COLUMN unit_id INTEGER REFERENCES units(id)');
  if (!columns('items').has('sale_price')) db.exec('ALTER TABLE items ADD COLUMN sale_price REAL');
  if (!columns('items').has('cost_price')) db.exec('ALTER TABLE items ADD COLUMN cost_price REAL');
  if (!columns('items').has('origin')) db.exec('ALTER TABLE items ADD COLUMN origin TEXT');

  const version = Number((db.prepare("SELECT value FROM schema_meta WHERE key = 'version'").get() as any)?.value || 0);
  if (version < 1) {
    const zone = db.prepare('INSERT OR IGNORE INTO zones (name, description) VALUES (?, ?)').run('Основная зона', 'Основная зона хранения');
    const zoneId = zone.lastInsertRowid || (db.prepare('SELECT id FROM zones WHERE name = ?').get('Основная зона') as any).id;
    db.prepare('UPDATE locations SET zone_id = ? WHERE zone_id IS NULL').run(zoneId);
    db.prepare("INSERT INTO schema_meta (key, value) VALUES ('version', '1') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
  }
  if (version < 2) {
    db.prepare("UPDATE projects SET order_no = 'WO-' || printf('%04d', id) WHERE order_no IS NULL").run();
    db.prepare("INSERT INTO schema_meta (key, value) VALUES ('version', '2') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
  }
  if (version < 3) {
    db.prepare(`
      INSERT OR IGNORE INTO item_barcodes (item_id, barcode, is_primary)
      SELECT id, barcode, 1 FROM items WHERE barcode IS NOT NULL AND TRIM(barcode) != ''
    `).run();
    db.prepare("INSERT INTO schema_meta (key, value) VALUES ('version', '3') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
  }
  if (version < 4) {
    db.prepare("INSERT INTO schema_meta (key, value) VALUES ('version', '4') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
  }
  if (version < 5) {
    const colors = ['#397c74', '#4f6f9f', '#9b5d65', '#9a7134', '#705c9c', '#497d50', '#397b91', '#a35d37'];
    const existingCategories = db.prepare(`
      SELECT DISTINCT TRIM(category) AS name FROM items WHERE category IS NOT NULL AND TRIM(category) != ''
      UNION SELECT DISTINCT TRIM(category) AS name FROM item_templates WHERE category IS NOT NULL AND TRIM(category) != ''
      ORDER BY name COLLATE NOCASE
    `).all() as any[];
    const insertCategory = db.prepare('INSERT OR IGNORE INTO categories (name, color) VALUES (?, ?)');
    existingCategories.forEach((category, index) => insertCategory.run(category.name, colors[index % colors.length]));
    db.prepare("UPDATE items SET category = TRIM(category) WHERE category IS NOT NULL").run();
    db.prepare("UPDATE item_templates SET category = TRIM(category) WHERE category IS NOT NULL").run();
    db.prepare("INSERT INTO schema_meta (key, value) VALUES ('version', '5') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
  }
  if (version < 6) {
    const missingCategories = db.prepare(`SELECT id, name FROM items WHERE category IS NULL OR TRIM(category) = ''`).all() as any[];
    const categoryRules: Array<[RegExp, string, string]> = [
      [/\b(hdd|ssd)\b|накопител/i, 'Накопитель', '#4f6f9f'],
      [/dupont|кабел|провод|перемыч/i, 'Кабель', '#397c74'],
      [/салфет|термопаст|расходн/i, 'Расходные материалы', '#9a7134'],
    ];
    const insertCategory = db.prepare('INSERT OR IGNORE INTO categories (name, color) VALUES (?, ?)');
    const setCategory = db.prepare('UPDATE items SET category = ? WHERE id = ? AND (category IS NULL OR TRIM(category) = ?)');
    for (const item of missingCategories) {
      const inferred = categoryRules.find(([pattern]) => pattern.test(item.name));
      if (!inferred) continue;
      const [, category, color] = inferred;
      insertCategory.run(category, color);
      setCategory.run(category, item.id, '');
    }

    const skuPrefixes: Record<string, string> = {
      'Тестер': 'TST', 'Контроллер': 'MCU', 'Переходники': 'ADP', 'Переходник': 'ADP',
      'Упаковка': 'PKG', 'Пакет': 'BAG', 'Блок питания': 'PSU', 'Кабель': 'CAB',
      'Модуль': 'MOD', 'Макетная плата': 'BRD', 'Пульт': 'RMT', 'Стяжки': 'TIE',
      'Сервопривод': 'SRV', 'Аккумулятор': 'BAT', 'ИК': 'IR', 'Экран': 'DSP',
      'Двигатель': 'MOT', 'Драйвер': 'DRV', 'ОЗУ': 'RAM', 'Резисторы': 'RES',
      'Индикатор': 'IND', 'Светодиоды': 'LED', 'Вентилятор': 'FAN', 'Термопаста': 'THP',
      'Накопитель': 'STO', 'Расходные материалы': 'CON',
    };
    const productsWithoutSku = db.prepare(`SELECT id, category FROM items WHERE sku IS NULL OR TRIM(sku) = ''`).all() as any[];
    const existingSkus = new Set((db.prepare('SELECT sku FROM items WHERE sku IS NOT NULL AND TRIM(sku) != ?').all('') as any[]).map((row) => String(row.sku).toUpperCase()));
    const updateSku = db.prepare('UPDATE items SET sku = ? WHERE id = ? AND (sku IS NULL OR TRIM(sku) = ?)');
    for (const item of productsWithoutSku) {
      const prefix = skuPrefixes[item.category] || 'SKU';
      let sku = `${prefix}-${String(item.id).padStart(4, '0')}`;
      while (existingSkus.has(sku.toUpperCase())) sku = `${prefix}-${String(item.id).padStart(4, '0')}-${existingSkus.size + 1}`;
      updateSku.run(sku, item.id, '');
      existingSkus.add(sku.toUpperCase());
    }
    db.prepare("INSERT INTO schema_meta (key, value) VALUES ('version', '6') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
  }
  if (version < 7) {
    const units = [
      ['Штука', 'шт.'], ['Метр', 'м'], ['Килограмм', 'кг'], ['Грамм', 'г'],
      ['Литр', 'л'], ['Миллилитр', 'мл'], ['Упаковка', 'уп.'], ['Комплект', 'компл.'], ['Пара', 'пар'],
    ];
    const insertUnit = db.prepare('INSERT OR IGNORE INTO units (name, symbol) VALUES (?, ?)');
    units.forEach((unit) => insertUnit.run(...unit));
    const defaultUnit = db.prepare('SELECT id FROM units WHERE symbol = ?').get('шт.') as any;

    const barcodeColumn = (db.prepare('PRAGMA table_info(items)').all() as any[]).find((column) => column.name === 'barcode');
    if (barcodeColumn?.notnull) {
      db.pragma('foreign_keys = OFF');
      db.exec('BEGIN IMMEDIATE');
      try {
        db.exec(`CREATE TABLE items_rebuild (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          barcode TEXT UNIQUE,
          name TEXT NOT NULL,
          sku TEXT,
          category TEXT,
          min_stock INTEGER DEFAULT 5,
          description TEXT,
          print_name TEXT,
          unit_id INTEGER REFERENCES units(id),
          sale_price REAL,
          cost_price REAL,
          origin TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);
        db.exec(`INSERT INTO items_rebuild (id, barcode, name, sku, category, min_stock, description, print_name, unit_id, sale_price, cost_price, origin, created_at)
          SELECT id, barcode, name, sku, category, min_stock, description, print_name, unit_id, sale_price, cost_price, origin, created_at FROM items`);
        db.exec('DROP TABLE items');
        db.exec('ALTER TABLE items_rebuild RENAME TO items');
        db.exec('COMMIT');
      } catch (migrationError) {
        db.exec('ROLLBACK');
        throw migrationError;
      } finally {
        db.pragma('foreign_keys = ON');
      }
    }

    db.prepare('UPDATE items SET unit_id = ? WHERE unit_id IS NULL').run(defaultUnit.id);
    db.prepare("INSERT INTO schema_meta (key, value) VALUES ('version', '7') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
  }
  if (version < 8) {
    const categoryColumns = columns('categories');
    if (!categoryColumns.has('parent_id')) db.exec('ALTER TABLE categories ADD COLUMN parent_id INTEGER REFERENCES categories(id)');
    if (!categoryColumns.has('sku_prefix')) db.exec('ALTER TABLE categories ADD COLUMN sku_prefix TEXT');
    if (!categoryColumns.has('archived')) db.exec('ALTER TABLE categories ADD COLUMN archived INTEGER NOT NULL DEFAULT 0');
    db.prepare("INSERT INTO schema_meta (key, value) VALUES ('version', '8') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
  }
  if (version < 9) {
    const itemColumns = columns('items');
    if (!itemColumns.has('manufacturer')) db.exec('ALTER TABLE items ADD COLUMN manufacturer TEXT');
    if (!itemColumns.has('package_qty')) db.exec('ALTER TABLE items ADD COLUMN package_qty INTEGER');
    if (!itemColumns.has('weight_g')) db.exec('ALTER TABLE items ADD COLUMN weight_g REAL');
    if (!itemColumns.has('storage_note')) db.exec('ALTER TABLE items ADD COLUMN storage_note TEXT');
    const unitColumns = columns('units');
    if (!unitColumns.has('description')) db.exec('ALTER TABLE units ADD COLUMN description TEXT');
    if (!unitColumns.has('decimal_places')) db.exec('ALTER TABLE units ADD COLUMN decimal_places INTEGER NOT NULL DEFAULT 0');
    db.prepare("INSERT INTO schema_meta (key, value) VALUES ('version', '9') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
  }
  if (version < 10) {
    const locationColumns = columns('locations');
    if (!locationColumns.has('capacity_qty')) db.exec('ALTER TABLE locations ADD COLUMN capacity_qty INTEGER');
    if (!locationColumns.has('aisle')) db.exec('ALTER TABLE locations ADD COLUMN aisle TEXT');
    if (!locationColumns.has('rack')) db.exec('ALTER TABLE locations ADD COLUMN rack TEXT');
    if (!locationColumns.has('shelf_level')) db.exec('ALTER TABLE locations ADD COLUMN shelf_level TEXT');
    const categoryColumns = columns('categories');
    if (!categoryColumns.has('description')) db.exec('ALTER TABLE categories ADD COLUMN description TEXT');
    if (!categoryColumns.has('default_min_stock')) db.exec('ALTER TABLE categories ADD COLUMN default_min_stock INTEGER');
    db.prepare("INSERT INTO schema_meta (key, value) VALUES ('version', '10') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
  }
  if (version < 11) {
    const txColumns = columns('transactions');
    if (!txColumns.has('reason')) db.exec('ALTER TABLE transactions ADD COLUMN reason TEXT');
    if (!txColumns.has('source')) db.exec("ALTER TABLE transactions ADD COLUMN source TEXT DEFAULT 'MANUAL'");
    if (!txColumns.has('from_location_id')) db.exec('ALTER TABLE transactions ADD COLUMN from_location_id INTEGER');
    if (!txColumns.has('to_location_id')) db.exec('ALTER TABLE transactions ADD COLUMN to_location_id INTEGER');
    if (!txColumns.has('document_ref')) db.exec('ALTER TABLE transactions ADD COLUMN document_ref TEXT');
    if (!txColumns.has('project_id')) db.exec('ALTER TABLE transactions ADD COLUMN project_id INTEGER');
    db.pragma('foreign_keys = OFF');
    db.exec('BEGIN');
    try {
      db.exec(`CREATE TABLE transactions_rebuild (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        item_id INTEGER,
        location_id INTEGER,
        type TEXT CHECK(type IN ('in', 'out', 'move', 'adjustment', 'reserve', 'release')),
        quantity INTEGER,
        comment TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        user_name TEXT DEFAULT 'Локальный оператор',
        reversed_at DATETIME,
        reason TEXT,
        source TEXT DEFAULT 'MANUAL',
        from_location_id INTEGER,
        to_location_id INTEGER,
        document_ref TEXT,
        project_id INTEGER
      )`);
      db.exec(`INSERT INTO transactions_rebuild (
        id, item_id, location_id, type, quantity, comment, timestamp, user_name, reversed_at,
        reason, source, from_location_id, to_location_id, document_ref, project_id
      ) SELECT
        id, item_id, location_id, type, quantity, comment, timestamp, user_name, reversed_at,
        reason, COALESCE(source, 'MANUAL'), from_location_id, to_location_id, document_ref, project_id
      FROM transactions`);
      db.exec('DROP TABLE transactions');
      db.exec('ALTER TABLE transactions_rebuild RENAME TO transactions');
      db.exec('COMMIT');
    } catch (migrationError) {
      db.exec('ROLLBACK');
      throw migrationError;
    } finally {
      db.pragma('foreign_keys = ON');
    }
    db.prepare("UPDATE transactions SET source = 'MANUAL' WHERE source IS NULL OR source = ''").run();
    db.prepare("INSERT INTO schema_meta (key, value) VALUES ('version', '11') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
  }
  if (version < 12) {
    const itemColumns = columns('items');
    if (!itemColumns.has('lead_time_days')) db.exec('ALTER TABLE items ADD COLUMN lead_time_days INTEGER');
    if (!itemColumns.has('moq')) db.exec('ALTER TABLE items ADD COLUMN moq INTEGER');
    if (!itemColumns.has('pack_multiple')) db.exec('ALTER TABLE items ADD COLUMN pack_multiple INTEGER');
    if (!itemColumns.has('supplier_sku')) db.exec('ALTER TABLE items ADD COLUMN supplier_sku TEXT');
    if (!itemColumns.has('purchase_url')) db.exec('ALTER TABLE items ADD COLUMN purchase_url TEXT');

    db.exec(`CREATE TABLE IF NOT EXISTS item_conditions (
      item_id INTEGER NOT NULL,
      condition TEXT NOT NULL CHECK(condition IN ('ok', 'check', 'bad', 'repair', 'scrap')),
      quantity INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (item_id, condition),
      FOREIGN KEY (item_id) REFERENCES items(id)
    )`);

    db.exec(`CREATE TABLE IF NOT EXISTS suppliers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      contact TEXT,
      note TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.exec(`CREATE TABLE IF NOT EXISTS supplier_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      supplier_id INTEGER NOT NULL,
      item_id INTEGER NOT NULL,
      supplier_sku TEXT,
      price REAL,
      lead_time_days INTEGER,
      moq INTEGER,
      pack_multiple INTEGER,
      url TEXT,
      last_purchase_date TEXT,
      UNIQUE(supplier_id, item_id),
      FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
      FOREIGN KEY (item_id) REFERENCES items(id)
    )`);

    db.exec(`CREATE TABLE IF NOT EXISTS purchase_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_no TEXT UNIQUE,
      supplier_id INTEGER,
      status TEXT NOT NULL DEFAULT 'draft',
      note TEXT,
      ordered_at TEXT,
      expected_at TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
    )`);

    db.exec(`CREATE TABLE IF NOT EXISTS purchase_order_items (
      purchase_order_id INTEGER NOT NULL,
      item_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      unit_price REAL,
      PRIMARY KEY (purchase_order_id, item_id),
      FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id),
      FOREIGN KEY (item_id) REFERENCES items(id)
    )`);

    const stocks = db.prepare('SELECT item_id, SUM(quantity) AS qty FROM inventory GROUP BY item_id').all() as any[];
    const insertCondition = db.prepare(`INSERT OR IGNORE INTO item_conditions (item_id, condition, quantity) VALUES (?, 'ok', ?)`);
    for (const row of stocks) {
      if (Number(row.qty) > 0) insertCondition.run(row.item_id, Number(row.qty));
    }

    db.prepare("UPDATE projects SET status = 'finished' WHERE status = 'completed'").run();
    db.prepare("INSERT INTO schema_meta (key, value) VALUES ('version', '12') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
  }

  if (version < 13) {
    db.exec(`CREATE TABLE IF NOT EXISTS organizations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      code TEXT,
      note TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    db.exec(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id INTEGER NOT NULL,
      login TEXT NOT NULL,
      display_name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'user')),
      permissions_json TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(organization_id, login),
      FOREIGN KEY (organization_id) REFERENCES organizations(id)
    )`);
    db.exec(`CREATE TABLE IF NOT EXISTS console_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      level TEXT NOT NULL DEFAULT 'info',
      source TEXT,
      message TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    const orgCount = Number((db.prepare('SELECT COUNT(*) AS c FROM organizations').get() as any)?.c || 0);
    if (orgCount === 0) {
      const org = db.prepare(`INSERT INTO organizations (name, code, note) VALUES (?, ?, ?)`).run(
        'Домашняя',
        'HOME',
        'Организация по умолчанию. Все существующие данные склада относятся к ней.',
      );
      const orgId = Number(org.lastInsertRowid);
      const adminPerms = JSON.stringify({
        items_edit: true, items_delete: true, inventory: true, projects: true, purchases: true,
        settings: true, backup: true, console: true, users: true, analytics: true, quality: true,
      });
      const userPerms = JSON.stringify({
        items_edit: true, items_delete: false, inventory: true, projects: true, purchases: false,
        settings: false, backup: false, console: false, users: false, analytics: true, quality: false,
      });
      const admin = db.prepare(`INSERT INTO users (organization_id, login, display_name, role, permissions_json) VALUES (?, ?, ?, 'admin', ?)`).run(
        orgId, 'admin', 'Администратор', adminPerms,
      );
      db.prepare(`INSERT INTO users (organization_id, login, display_name, role, permissions_json) VALUES (?, ?, ?, 'user', ?)`).run(
        orgId, 'user', 'Пользователь', userPerms,
      );
      db.prepare("INSERT INTO schema_meta (key, value) VALUES ('setting:auth.orgId', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(String(orgId));
      db.prepare("INSERT INTO schema_meta (key, value) VALUES ('setting:auth.userId', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(String(admin.lastInsertRowid));
      db.prepare("INSERT INTO schema_meta (key, value) VALUES ('setting:auth.migrated', '1') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
    }

    db.prepare("INSERT INTO schema_meta (key, value) VALUES ('version', '13') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
  }

  if (version < 14) {
    const poiCols = new Set((db.prepare('PRAGMA table_info(purchase_order_items)').all() as Array<{ name: string }>).map((c) => c.name));
    if (!poiCols.has('received_qty')) {
      db.exec('ALTER TABLE purchase_order_items ADD COLUMN received_qty INTEGER NOT NULL DEFAULT 0');
    }
    const poCols = new Set((db.prepare('PRAGMA table_info(purchase_orders)').all() as Array<{ name: string }>).map((c) => c.name));
    if (!poCols.has('receive_location_id')) {
      db.exec('ALTER TABLE purchase_orders ADD COLUMN receive_location_id INTEGER');
    }
    if (!poCols.has('posted_at')) {
      db.exec('ALTER TABLE purchase_orders ADD COLUMN posted_at DATETIME');
    }
    if (!poCols.has('posted_by')) {
      db.exec('ALTER TABLE purchase_orders ADD COLUMN posted_by TEXT');
    }
    db.prepare("INSERT INTO schema_meta (key, value) VALUES ('version', '14') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
  }

  if (version < 15) {
    db.exec(`CREATE TABLE IF NOT EXISTS entity_changes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity TEXT NOT NULL,
      entity_id INTEGER NOT NULL,
      field TEXT NOT NULL,
      old_value TEXT,
      new_value TEXT,
      user_name TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_entity_changes_entity ON entity_changes(entity, entity_id, id DESC)`);
    db.prepare("INSERT INTO schema_meta (key, value) VALUES ('version', '15') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
  }

  if (version < 16) {
    const supplierCols = new Set((db.prepare('PRAGMA table_info(suppliers)').all() as Array<{ name: string }>).map((c) => c.name));
    const add = (name: string, ddl: string) => {
      if (!supplierCols.has(name)) db.exec(`ALTER TABLE suppliers ADD COLUMN ${ddl}`);
    };
    add('email', 'email TEXT');
    add('phone', 'phone TEXT');
    add('inn', 'inn TEXT');
    add('address', 'address TEXT');
    add('priority', 'priority INTEGER NOT NULL DEFAULT 100');
    add('default_lead_days', 'default_lead_days INTEGER');
    add('is_active', 'is_active INTEGER NOT NULL DEFAULT 1');
    db.prepare("INSERT INTO schema_meta (key, value) VALUES ('version', '16') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
  }

  if (version < 17) {
    const poiCols = new Set((db.prepare('PRAGMA table_info(purchase_order_items)').all() as Array<{ name: string }>).map((c) => c.name));
    if (!poiCols.has('actual_unit_price')) {
      db.exec('ALTER TABLE purchase_order_items ADD COLUMN actual_unit_price REAL');
    }
    const poCols = new Set((db.prepare('PRAGMA table_info(purchase_orders)').all() as Array<{ name: string }>).map((c) => c.name));
    if (!poCols.has('actual_received_at')) {
      db.exec('ALTER TABLE purchase_orders ADD COLUMN actual_received_at TEXT');
    }
    db.exec(`CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      doc_type TEXT NOT NULL,
      doc_no TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      doc_date TEXT,
      posted_at DATETIME,
      posted_by TEXT,
      cancelled_at DATETIME,
      cancelled_by TEXT,
      author TEXT,
      party TEXT,
      note TEXT,
      ref_table TEXT,
      ref_id INTEGER,
      amount REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(doc_type, doc_no)
    )`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status, doc_date DESC)`);
    db.prepare("INSERT INTO schema_meta (key, value) VALUES ('version', '17') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
  }

  if (version < 18) {
    const docCols = new Set((db.prepare('PRAGMA table_info(documents)').all() as Array<{ name: string }>).map((c) => c.name));
    if (!docCols.has('parent_id')) {
      db.exec('ALTER TABLE documents ADD COLUMN parent_id INTEGER REFERENCES documents(id)');
    }
    db.exec(`CREATE TABLE IF NOT EXISTS document_lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id INTEGER NOT NULL,
      item_id INTEGER NOT NULL,
      location_id INTEGER,
      quantity REAL NOT NULL DEFAULT 0,
      counterpart_item_id INTEGER,
      line_role TEXT NOT NULL DEFAULT 'main',
      note TEXT,
      FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
      FOREIGN KEY (item_id) REFERENCES items(id)
    )`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_document_lines_doc ON document_lines(document_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_documents_parent ON documents(parent_id)');
    db.prepare("INSERT INTO schema_meta (key, value) VALUES ('version', '18') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
  }

  if (version < 19) {
    db.exec(`CREATE TABLE IF NOT EXISTS document_series (
      doc_type TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      prefix TEXT NOT NULL,
      pad INTEGER NOT NULL DEFAULT 4,
      period TEXT NOT NULL DEFAULT 'none',
      include_period INTEGER NOT NULL DEFAULT 0,
      last_period_key TEXT,
      last_seq INTEGER NOT NULL DEFAULT 0
    )`);
    const seed = db.prepare(`INSERT OR IGNORE INTO document_series
      (doc_type, label, prefix, pad, period, include_period, last_period_key, last_seq)
      VALUES (?, ?, ?, 4, 'none', 0, NULL, 0)`);
    const defaults: Array<[string, string, string]> = [
      ['writeoff', 'Списание', 'WOFF'],
      ['surplus', 'Оприходование излишков', 'SURP'],
      ['regrade', 'Пересортица', 'RGRD'],
      ['disassemble', 'Разукомплектация', 'DISA'],
      ['po', 'Заказ поставщику', 'PO'],
      ['revision', 'Ревизия', 'REV'],
      ['project', 'Заказ-наряд', 'WO'],
    ];
    for (const [docType, label, prefix] of defaults) seed.run(docType, label, prefix);
    db.prepare("INSERT INTO schema_meta (key, value) VALUES ('version', '19') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
  }

  if (version < 20) {
    db.exec('CREATE INDEX IF NOT EXISTS idx_project_reservations_item_loc ON project_reservations(item_id, location_id)');
    db.prepare("INSERT INTO schema_meta (key, value) VALUES ('version', '20') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
  }

  if (version < 21) {
    db.exec(`CREATE TABLE IF NOT EXISTS document_attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id INTEGER NOT NULL,
      file_name TEXT NOT NULL,
      stored_name TEXT NOT NULL,
      mime_type TEXT,
      size_bytes INTEGER NOT NULL DEFAULT 0,
      version INTEGER NOT NULL DEFAULT 1,
      note TEXT,
      uploaded_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
      UNIQUE(document_id, file_name, version)
    )`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_document_attachments_doc ON document_attachments(document_id)');
    db.prepare("INSERT INTO schema_meta (key, value) VALUES ('version', '21') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
  }

  if (version < 22) {
    if (!columns('items').has('item_type')) {
      db.exec(`ALTER TABLE items ADD COLUMN item_type TEXT NOT NULL DEFAULT 'product'`);
    }
    db.prepare("UPDATE items SET item_type = 'product' WHERE item_type IS NULL OR TRIM(item_type) = ''").run();
    db.prepare("INSERT INTO schema_meta (key, value) VALUES ('version', '22') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
  }

  if (version < 23) {
    db.exec(`CREATE TABLE IF NOT EXISTS item_analogs (
      item_id INTEGER NOT NULL,
      analog_item_id INTEGER NOT NULL,
      note TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (item_id, analog_item_id),
      FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
      FOREIGN KEY (analog_item_id) REFERENCES items(id) ON DELETE CASCADE,
      CHECK (item_id != analog_item_id)
    )`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_item_analogs_analog ON item_analogs(analog_item_id)');
    db.prepare("INSERT INTO schema_meta (key, value) VALUES ('version', '23') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
  }

  if (version < 24) {
    db.exec(`CREATE TABLE IF NOT EXISTS item_characteristics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      value TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
      UNIQUE(item_id, name)
    )`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_item_characteristics_item ON item_characteristics(item_id)');
    db.prepare("INSERT INTO schema_meta (key, value) VALUES ('version', '24') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
  }

  if (version < 25) {
    db.exec(`CREATE TABLE IF NOT EXISTS item_kit_components (
      kit_item_id INTEGER NOT NULL,
      component_item_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (kit_item_id, component_item_id),
      FOREIGN KEY (kit_item_id) REFERENCES items(id) ON DELETE CASCADE,
      FOREIGN KEY (component_item_id) REFERENCES items(id) ON DELETE CASCADE,
      CHECK (kit_item_id != component_item_id),
      CHECK (quantity > 0)
    )`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_item_kit_components_comp ON item_kit_components(component_item_id)');
    db.prepare("INSERT INTO schema_meta (key, value) VALUES ('version', '25') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
  }

  if (version < 26) {
    const itemCols = columns('items');
    if (!itemCols.has('track_lots')) db.exec('ALTER TABLE items ADD COLUMN track_lots INTEGER NOT NULL DEFAULT 0');
    if (!itemCols.has('lot_policy')) db.exec(`ALTER TABLE items ADD COLUMN lot_policy TEXT NOT NULL DEFAULT 'fifo'`);
    db.exec(`CREATE TABLE IF NOT EXISTS lots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL,
      lot_no TEXT NOT NULL,
      expiry_date TEXT,
      received_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      unit_cost REAL,
      note TEXT,
      FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
      UNIQUE(item_id, lot_no)
    )`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_lots_item ON lots(item_id)');
    const txCols = columns('transactions');
    if (!txCols.has('lot_id')) db.exec('ALTER TABLE transactions ADD COLUMN lot_id INTEGER');

    db.pragma('foreign_keys = OFF');
    db.exec('BEGIN');
    try {
      db.exec(`CREATE TABLE inventory_rebuild (
        item_id INTEGER NOT NULL,
        location_id INTEGER NOT NULL,
        lot_id INTEGER NOT NULL DEFAULT 0,
        quantity INTEGER DEFAULT 0,
        PRIMARY KEY (item_id, location_id, lot_id),
        FOREIGN KEY (item_id) REFERENCES items(id),
        FOREIGN KEY (location_id) REFERENCES locations(id)
      )`);
      const hasLotCol = columns('inventory').has('lot_id');
      if (hasLotCol) {
        db.exec(`INSERT INTO inventory_rebuild (item_id, location_id, lot_id, quantity)
          SELECT item_id, location_id, COALESCE(lot_id, 0), quantity FROM inventory`);
      } else {
        db.exec(`INSERT INTO inventory_rebuild (item_id, location_id, lot_id, quantity)
          SELECT item_id, location_id, 0, quantity FROM inventory`);
      }
      db.exec('DROP TABLE inventory');
      db.exec('ALTER TABLE inventory_rebuild RENAME TO inventory');
      db.exec('CREATE INDEX IF NOT EXISTS idx_inventory_location ON inventory(location_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_inventory_lot ON inventory(lot_id)');
      db.exec('COMMIT');
    } catch (migrationError) {
      db.exec('ROLLBACK');
      throw migrationError;
    } finally {
      db.pragma('foreign_keys = ON');
    }
    db.prepare("INSERT INTO schema_meta (key, value) VALUES ('version', '26') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
  }

  if (version < 27) {
    const projectCols = columns('projects');
    if (!projectCols.has('result_item_id')) db.exec('ALTER TABLE projects ADD COLUMN result_item_id INTEGER REFERENCES items(id)');
    if (!projectCols.has('result_location_id')) db.exec('ALTER TABLE projects ADD COLUMN result_location_id INTEGER REFERENCES locations(id)');
    db.prepare(`INSERT OR IGNORE INTO document_series (doc_type, label, prefix, pad, period, include_period, last_period_key, last_seq)
      VALUES ('assemble', 'Комплектация', 'ASMB', 4, 'none', 0, '', 0)`).run();
    db.prepare("INSERT INTO schema_meta (key, value) VALUES ('version', '27') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
  }

  if (version < 28) {
    const unitCols = columns('units');
    if (!unitCols.has('code')) db.exec('ALTER TABLE units ADD COLUMN code TEXT');
    if (!unitCols.has('is_base')) db.exec('ALTER TABLE units ADD COLUMN is_base INTEGER NOT NULL DEFAULT 0');

    const okei: Array<[string, string, string]> = [
      ['шт.', '796', 'Штука'],
      ['кг', '166', 'Килограмм'],
      ['г', '163', 'Грамм'],
      ['м', '006', 'Метр'],
      ['л', '112', 'Литр'],
      ['уп.', '778', 'Упаковка'],
      ['компл.', '839', 'Комплект'],
    ];
    for (const [symbol, code, name] of okei) {
      const row = db.prepare('SELECT id, code FROM units WHERE symbol = ? COLLATE NOCASE').get(symbol) as any;
      if (row && !row.code) {
        db.prepare('UPDATE units SET code = ? WHERE id = ?').run(code, row.id);
      } else if (!row) {
        try {
          db.prepare('INSERT INTO units (name, symbol, code, description, decimal_places, is_base) VALUES (?, ?, ?, ?, ?, 0)')
            .run(name, symbol, code, `ОКЕИ ${code}`, symbol === 'кг' || symbol === 'г' || symbol === 'л' || symbol === 'м' ? 3 : 0);
        } catch {  }
      }
    }
    const pcs = db.prepare("SELECT id FROM units WHERE symbol = 'шт.' COLLATE NOCASE").get() as any;
    if (pcs) db.prepare('UPDATE units SET is_base = 1 WHERE id = ?').run(pcs.id);
    const catCols = columns('categories');
    if (!catCols.has('code')) db.exec('ALTER TABLE categories ADD COLUMN code TEXT');
    db.prepare("INSERT INTO schema_meta (key, value) VALUES ('version', '28') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
  }

  if (version < 29) {
    db.prepare(`INSERT OR IGNORE INTO document_series (doc_type, label, prefix, pad, period, include_period, last_period_key, last_seq)
      VALUES ('transfer', 'Перемещение', 'TR', 4, 'none', 0, '', 0)`).run();
    db.prepare("INSERT INTO schema_meta (key, value) VALUES ('version', '29') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
  }

  if (version < 30) {

    const tableExistsSafe = (name: string) => Boolean(
      (db.prepare(`SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ?`).get(name) as any)?.ok,
    );
    const rebuildQtyTable = (table: string, createSql: string, copySql: string) => {
      db.exec(`DROP TABLE IF EXISTS ${table}_v30`);
      db.exec(createSql);
      db.exec(copySql);
      db.exec(`DROP TABLE ${table}`);
      db.exec(`ALTER TABLE ${table}_v30 RENAME TO ${table}`);
    };
    db.pragma('foreign_keys = OFF');
    db.exec('BEGIN');
    try {
      rebuildQtyTable(
        'inventory',
        `CREATE TABLE inventory_v30 (
          item_id INTEGER NOT NULL REFERENCES items(id),
          location_id INTEGER NOT NULL REFERENCES locations(id),
          lot_id INTEGER NOT NULL DEFAULT 0,
          quantity REAL NOT NULL DEFAULT 0,
          PRIMARY KEY (item_id, location_id, lot_id)
        )`,
        `INSERT INTO inventory_v30 (item_id, location_id, lot_id, quantity)
          SELECT item_id, location_id, COALESCE(lot_id, 0), CAST(quantity AS REAL) FROM inventory`,
      );
      db.exec('CREATE INDEX IF NOT EXISTS idx_inventory_location ON inventory(location_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_inventory_lot ON inventory(lot_id)');

      if (columns('item_kit_components').has('quantity')) {
        db.exec(`CREATE TABLE item_kit_components_v30 (
          kit_item_id INTEGER NOT NULL REFERENCES items(id),
          component_item_id INTEGER NOT NULL REFERENCES items(id),
          quantity REAL NOT NULL DEFAULT 1,
          PRIMARY KEY (kit_item_id, component_item_id)
        )`);
        db.exec(`INSERT INTO item_kit_components_v30 SELECT kit_item_id, component_item_id, CAST(quantity AS REAL) FROM item_kit_components`);
        db.exec('DROP TABLE item_kit_components');
        db.exec('ALTER TABLE item_kit_components_v30 RENAME TO item_kit_components');
      }

      if (columns('purchase_order_items').has('quantity')) {
        const poiCols = db.prepare('PRAGMA table_info(purchase_order_items)').all() as any[];
        const names = poiCols.map((c) => c.name);
        const defs = poiCols.map((c) => {
          if (c.name === 'quantity') return 'quantity REAL NOT NULL DEFAULT 0';
          const typ = c.type || 'TEXT';
          const nn = c.notnull ? ' NOT NULL' : '';
          const dflt = c.dflt_value != null ? ` DEFAULT ${c.dflt_value}` : '';
          return `${c.name} ${typ}${nn}${dflt}`;
        });
        db.exec(`CREATE TABLE purchase_order_items_v30 (${defs.join(', ')})`);
        const selectCols = names.map((n) => (n === 'quantity' ? 'CAST(quantity AS REAL)' : n)).join(', ');
        db.exec(`INSERT INTO purchase_order_items_v30 (${names.join(', ')}) SELECT ${selectCols} FROM purchase_order_items`);
        db.exec('DROP TABLE purchase_order_items');
        db.exec('ALTER TABLE purchase_order_items_v30 RENAME TO purchase_order_items');
      }

      db.exec('DROP VIEW IF EXISTS stock_reserves');
      for (const table of ['project_items', 'project_reservations', 'inventory_counts', 'item_conditions'] as const) {
        if (!tableExistsSafe(table)) continue;
        if (!columns(table).has('quantity') && !(table === 'inventory_counts' && columns(table).has('counted_quantity'))) continue;
        const info = db.prepare(`PRAGMA table_info(${table})`).all() as any[];
        if (!info.length) continue;
        const qtyCol = table === 'inventory_counts' ? 'counted_quantity' : 'quantity';
        if (!info.some((c) => c.name === qtyCol)) continue;
        const names = info.map((c) => c.name);
        const defsNoPk = info.map((c) => {
          if (c.name === qtyCol) return `${qtyCol} REAL NOT NULL DEFAULT 0`;
          const typ = c.type || 'TEXT';
          const nn = c.notnull ? ' NOT NULL' : '';
          const dflt = c.dflt_value != null ? ` DEFAULT ${c.dflt_value}` : '';
          return `${c.name} ${typ}${nn}${dflt}`;
        });
        db.exec(`DROP TABLE IF EXISTS ${table}_v30`);
        db.exec(`CREATE TABLE ${table}_v30 (${defsNoPk.join(', ')})`);
        const selectCols = names.map((n) => (n === qtyCol ? `CAST(${qtyCol} AS REAL)` : n)).join(', ');
        db.exec(`INSERT INTO ${table}_v30 (${names.join(', ')}) SELECT ${selectCols} FROM ${table}`);
        db.exec(`DROP TABLE ${table}`);
        db.exec(`ALTER TABLE ${table}_v30 RENAME TO ${table}`);
      }

      if (columns('transactions').has('quantity')) {
        const info = db.prepare('PRAGMA table_info(transactions)').all() as any[];
        const names = info.map((c) => c.name);
        const defsNoPk = info.map((c) => {
          if (c.name === 'quantity') return 'quantity REAL NOT NULL DEFAULT 0';
          const typ = c.type || 'TEXT';
          const nn = c.notnull ? ' NOT NULL' : '';
          const dflt = c.dflt_value != null ? ` DEFAULT ${c.dflt_value}` : '';
          return `${c.name} ${typ}${nn}${dflt}`;
        });
        db.exec(`CREATE TABLE transactions_v30 (${defsNoPk.join(', ')})`);
        const selectCols = names.map((n) => (n === 'quantity' ? 'CAST(quantity AS REAL)' : n)).join(', ');
        db.exec(`INSERT INTO transactions_v30 (${names.join(', ')}) SELECT ${selectCols} FROM transactions`);
        db.exec('DROP TABLE transactions');
        db.exec('ALTER TABLE transactions_v30 RENAME TO transactions');
      }

      db.prepare(`UPDATE units SET decimal_places = 3 WHERE symbol IN ('кг','г','л','м','м²','м³') AND decimal_places = 0`).run();

      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    } finally {
      db.pragma('foreign_keys = ON');
    }
    db.prepare("INSERT INTO schema_meta (key, value) VALUES ('version', '30') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
  }

  if (version < 31) {
    const dlCols = columns('document_lines');
    if (!dlCols.has('lot_id')) {
      db.exec('ALTER TABLE document_lines ADD COLUMN lot_id INTEGER');
    }
    db.prepare("INSERT INTO schema_meta (key, value) VALUES ('version', '31') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
  }

  if (version < 32) {
    db.exec(`CREATE TABLE IF NOT EXISTS saved_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      report_type TEXT NOT NULL,
      params_json TEXT NOT NULL DEFAULT '{}',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_saved_reports_type ON saved_reports(report_type)');
    db.prepare("INSERT INTO schema_meta (key, value) VALUES ('version', '32') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
  }

  if (version < 33) {
    db.exec(`CREATE TABLE IF NOT EXISTS item_purchase_prices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
      purchase_order_id INTEGER REFERENCES purchase_orders(id) ON DELETE SET NULL,
      document_ref TEXT,
      unit_price REAL NOT NULL,
      quantity REAL NOT NULL DEFAULT 0,
      received_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      source TEXT NOT NULL DEFAULT 'po_receive'
    )`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_item_purchase_prices_item ON item_purchase_prices(item_id, received_at DESC)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_item_purchase_prices_supplier ON item_purchase_prices(supplier_id, received_at DESC)');
    db.prepare("INSERT INTO schema_meta (key, value) VALUES ('version', '33') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
  }

  if (version < 34) {
    const itemCols = columns('items');
    if (!itemCols.has('price_basis')) {
      db.exec(`ALTER TABLE items ADD COLUMN price_basis TEXT NOT NULL DEFAULT 'unit'`);
    }
    db.prepare("INSERT INTO schema_meta (key, value) VALUES ('version', '34') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
  }

  if (version < 35) {
    db.exec(`CREATE TABLE IF NOT EXISTS saved_list_views (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      list_key TEXT NOT NULL,
      params_json TEXT NOT NULL DEFAULT '{}',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_saved_list_views_key ON saved_list_views(list_key, updated_at DESC)');
    db.prepare("INSERT INTO schema_meta (key, value) VALUES ('version', '35') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
  }

  if (version < 36) {
    const itemCols = columns('items');
    if (!itemCols.has('track_serials')) {
      db.exec('ALTER TABLE items ADD COLUMN track_serials INTEGER NOT NULL DEFAULT 0');
    }
    db.exec(`CREATE TABLE IF NOT EXISTS serial_numbers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      serial_no TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'in_stock',
      location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
      lot_id INTEGER,
      document_ref_in TEXT,
      document_ref_out TEXT,
      received_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      issued_at DATETIME,
      note TEXT,
      UNIQUE(item_id, serial_no)
    )`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_serial_numbers_item ON serial_numbers(item_id, status)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_serial_numbers_location ON serial_numbers(location_id, status)');
    db.prepare("INSERT INTO schema_meta (key, value) VALUES ('version', '36') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
  }

  if (version < 37) {
    const itemCols = columns('items');
    if (!itemCols.has('parent_item_id')) {
      db.exec('ALTER TABLE items ADD COLUMN parent_item_id INTEGER REFERENCES items(id) ON DELETE SET NULL');
    }
    if (!itemCols.has('variant_label')) {
      db.exec('ALTER TABLE items ADD COLUMN variant_label TEXT');
    }
    db.exec('CREATE INDEX IF NOT EXISTS idx_items_parent ON items(parent_item_id)');
    db.prepare("INSERT INTO schema_meta (key, value) VALUES ('version', '37') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
  }

  if (version < 38) {
    const itemCols = columns('items');
    if (!itemCols.has('brand')) {
      db.exec('ALTER TABLE items ADD COLUMN brand TEXT');
    }
    if (!itemCols.has('max_stock')) {
      db.exec('ALTER TABLE items ADD COLUMN max_stock INTEGER');
    }
    db.prepare("INSERT INTO schema_meta (key, value) VALUES ('setting:currency.code', 'RUB') ON CONFLICT(key) DO NOTHING").run();
    db.prepare("INSERT INTO schema_meta (key, value) VALUES ('setting:currency.symbol', '₽') ON CONFLICT(key) DO NOTHING").run();
    db.prepare("INSERT INTO schema_meta (key, value) VALUES ('setting:stock.warn_over_max', 'on') ON CONFLICT(key) DO NOTHING").run();
    db.prepare("INSERT INTO schema_meta (key, value) VALUES ('version', '38') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
  }

  if (version < 39) {
    db.prepare("INSERT INTO schema_meta (key, value) VALUES ('setting:stock.expiry_warn_days', '30') ON CONFLICT(key) DO NOTHING").run();
    db.prepare("INSERT INTO schema_meta (key, value) VALUES ('version', '39') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
  }

  if (version < 40) {
    const itemCols = columns('items');
    if (!itemCols.has('reorder_point')) {
      db.exec('ALTER TABLE items ADD COLUMN reorder_point INTEGER');
    }

    db.prepare("INSERT INTO schema_meta (key, value) VALUES ('version', '40') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
  }

  if (version < 41) {
    db.exec(`CREATE TABLE IF NOT EXISTS purchase_order_shipments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      purchase_order_id INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
      carrier TEXT,
      tracking_no TEXT,
      shipped_at TEXT,
      expected_at TEXT,
      delivered_at TEXT,
      status TEXT NOT NULL DEFAULT 'planned',
      note TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_po_shipments_po ON purchase_order_shipments(purchase_order_id, status)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_po_shipments_track ON purchase_order_shipments(tracking_no)');
    db.prepare("INSERT INTO schema_meta (key, value) VALUES ('version', '41') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
  }

  if (version < 42) {
    db.prepare("INSERT INTO schema_meta (key, value) VALUES ('setting:stock.reserve_stale_days', '7') ON CONFLICT(key) DO NOTHING").run();
    db.prepare("INSERT INTO schema_meta (key, value) VALUES ('setting:stock.reserve_auto_release', 'off') ON CONFLICT(key) DO NOTHING").run();
    db.prepare("INSERT INTO schema_meta (key, value) VALUES ('version', '42') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
  }

  if (version < 43) {
    const catCols = columns('categories');
    const addCat = (name: string, sql: string) => {
      if (!catCols.has(name)) db.exec(sql);
    };
    addCat('default_max_stock', 'ALTER TABLE categories ADD COLUMN default_max_stock INTEGER');
    addCat('default_reorder_point', 'ALTER TABLE categories ADD COLUMN default_reorder_point INTEGER');
    addCat('default_brand', 'ALTER TABLE categories ADD COLUMN default_brand TEXT');
    addCat('default_track_serials', 'ALTER TABLE categories ADD COLUMN default_track_serials INTEGER');
    addCat('default_track_lots', 'ALTER TABLE categories ADD COLUMN default_track_lots INTEGER');
    addCat('default_lot_policy', 'ALTER TABLE categories ADD COLUMN default_lot_policy TEXT');
    addCat('default_price_basis', 'ALTER TABLE categories ADD COLUMN default_price_basis TEXT');
    addCat('default_package_qty', 'ALTER TABLE categories ADD COLUMN default_package_qty INTEGER');
    addCat('default_unit_id', 'ALTER TABLE categories ADD COLUMN default_unit_id INTEGER');
    addCat('default_storage_note', 'ALTER TABLE categories ADD COLUMN default_storage_note TEXT');
    db.prepare("INSERT INTO schema_meta (key, value) VALUES ('version', '43') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
  }

  if (version < 44) {
    db.prepare("INSERT INTO schema_meta (key, value) VALUES ('setting:docs.status_labels', ?) ON CONFLICT(key) DO NOTHING")
      .run(JSON.stringify({ draft: 'Черновик', posted: 'Проведён', cancelled: 'Отменён' }));
    db.prepare("INSERT INTO schema_meta (key, value) VALUES ('version', '44') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
  }

  if (version < 45) {
    db.exec(`CREATE TABLE IF NOT EXISTS custom_field_defs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity TEXT NOT NULL DEFAULT 'item',
      field_key TEXT NOT NULL,
      label TEXT NOT NULL,
      field_type TEXT NOT NULL DEFAULT 'text',
      required INTEGER NOT NULL DEFAULT 0,
      options_json TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      archived INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(entity, field_key)
    )`);
    db.exec(`CREATE TABLE IF NOT EXISTS item_custom_values (
      item_id INTEGER NOT NULL,
      field_id INTEGER NOT NULL,
      value_text TEXT,
      PRIMARY KEY (item_id, field_id),
      FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
      FOREIGN KEY (field_id) REFERENCES custom_field_defs(id) ON DELETE CASCADE
    )`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_custom_field_defs_entity ON custom_field_defs(entity, archived, sort_order)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_item_custom_values_field ON item_custom_values(field_id)');
    db.prepare("INSERT INTO schema_meta (key, value) VALUES ('version', '45') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
  }

  if (version < 46) {
    try {
      const cols = db.prepare(`PRAGMA table_info(custom_field_defs)`).all() as any[];
      if (!cols.some((c) => c.name === 'formula')) {
        db.exec(`ALTER TABLE custom_field_defs ADD COLUMN formula TEXT`);
      }
    } catch {  }
    db.prepare("INSERT INTO schema_meta (key, value) VALUES ('version', '46') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
  }

  if (version < 47) {
    const kitCols = columns('item_kit_components');
    if (!kitCols.has('scrap_pct')) db.exec('ALTER TABLE item_kit_components ADD COLUMN scrap_pct REAL NOT NULL DEFAULT 0');
    if (!kitCols.has('note')) db.exec('ALTER TABLE item_kit_components ADD COLUMN note TEXT');
    db.exec(`CREATE TABLE IF NOT EXISTS item_kit_alternatives (
      kit_item_id INTEGER NOT NULL,
      component_item_id INTEGER NOT NULL,
      alt_item_id INTEGER NOT NULL,
      priority INTEGER NOT NULL DEFAULT 1,
      quantity_factor REAL NOT NULL DEFAULT 1,
      note TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (kit_item_id, component_item_id, alt_item_id),
      FOREIGN KEY (kit_item_id) REFERENCES items(id) ON DELETE CASCADE,
      FOREIGN KEY (component_item_id) REFERENCES items(id) ON DELETE CASCADE,
      FOREIGN KEY (alt_item_id) REFERENCES items(id) ON DELETE CASCADE,
      CHECK (component_item_id != alt_item_id),
      CHECK (quantity_factor > 0)
    )`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_kit_alts_comp ON item_kit_alternatives(kit_item_id, component_item_id, priority)');
    const docCols = columns('documents');
    if (!docCols.has('workflow_status')) db.exec('ALTER TABLE documents ADD COLUMN workflow_status TEXT');
    db.prepare("INSERT INTO schema_meta (key, value) VALUES ('setting:docs.workflow_extras', ?) ON CONFLICT(key) DO NOTHING")
      .run(JSON.stringify([
        { code: 'on_review', label: 'На согласовании', maps_to: 'draft' },
        { code: 'approved', label: 'Утверждён', maps_to: 'draft' },
      ]));
    db.prepare("INSERT INTO schema_meta (key, value) VALUES ('version', '47') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
  }

  if (version < 48) {
    const projectCols = columns('projects');
    if (!projectCols.has('assignee_user_id')) db.exec('ALTER TABLE projects ADD COLUMN assignee_user_id INTEGER');
    if (!projectCols.has('assignee_name')) db.exec('ALTER TABLE projects ADD COLUMN assignee_name TEXT');
    if (!projectCols.has('planned_start')) db.exec('ALTER TABLE projects ADD COLUMN planned_start TEXT');
    if (!projectCols.has('control_note')) db.exec('ALTER TABLE projects ADD COLUMN control_note TEXT');
    db.exec(`CREATE TABLE IF NOT EXISTS project_operations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      title TEXT NOT NULL,
      is_done INTEGER NOT NULL DEFAULT 0,
      done_at DATETIME,
      done_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    )`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_project_ops_project ON project_operations(project_id, sort_order, id)');
    db.prepare("INSERT INTO schema_meta (key, value) VALUES ('version', '48') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
  }

  if (version < 49) {
    const projectCols = columns('projects');
    if (!projectCols.has('planned_cost')) db.exec('ALTER TABLE projects ADD COLUMN planned_cost REAL');
    if (!projectCols.has('actual_cost')) db.exec('ALTER TABLE projects ADD COLUMN actual_cost REAL');
    if (!projectCols.has('wip_value')) db.exec('ALTER TABLE projects ADD COLUMN wip_value REAL');
    db.prepare("INSERT INTO schema_meta (key, value) VALUES ('version', '49') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
  }

  if (version < 50) {

    db.exec(`CREATE TABLE IF NOT EXISTS employees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      last_name TEXT NOT NULL,
      first_name TEXT NOT NULL,
      middle_name TEXT,
      position TEXT,
      department TEXT,
      phone TEXT,
      email TEXT,
      hire_date TEXT,
      fire_date TEXT,
      tab_no TEXT,
      notes TEXT,
      registry_user_id INTEGER,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_employees_active ON employees(is_active, last_name, first_name)');

    db.exec(`CREATE TABLE IF NOT EXISTS edo_documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      doc_no TEXT NOT NULL,
      form_type TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      author_user_id INTEGER,
      author_name TEXT,
      from_employee_id INTEGER,
      to_user_id INTEGER,
      to_user_name TEXT,
      to_employee_id INTEGER,
      signed_at DATETIME,
      signed_by_name TEXT,
      reject_reason TEXT,
      printed_at DATETIME,
      meta_json TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_edo_status ON edo_documents(status, to_user_id, created_at)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_edo_author ON edo_documents(author_user_id, created_at)');

    db.exec(`CREATE TABLE IF NOT EXISTS counterparties (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      full_name TEXT,
      kind TEXT NOT NULL DEFAULT 'customer',
      inn TEXT,
      kpp TEXT,
      phone TEXT,
      email TEXT,
      address TEXT,
      contact_person TEXT,
      supplier_id INTEGER,
      notes TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_counterparties_name ON counterparties(is_active, name)');

    db.exec(`CREATE TABLE IF NOT EXISTS contracts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      number TEXT NOT NULL,
      title TEXT,
      counterparty_id INTEGER NOT NULL,
      direction_id INTEGER,
      date_from TEXT,
      date_to TEXT,
      amount REAL,
      status TEXT NOT NULL DEFAULT 'active',
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (counterparty_id) REFERENCES counterparties(id)
    )`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_contracts_cp ON contracts(counterparty_id, status)');

    db.exec(`CREATE TABLE IF NOT EXISTS business_directions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT,
      name TEXT NOT NULL,
      description TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.exec(`CREATE TABLE IF NOT EXISTS price_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      currency TEXT,
      is_default INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    db.exec(`CREATE TABLE IF NOT EXISTS item_price_list (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL,
      price_type_id INTEGER NOT NULL,
      price REAL NOT NULL DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(item_id, price_type_id),
      FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
      FOREIGN KEY (price_type_id) REFERENCES price_types(id) ON DELETE CASCADE
    )`);

    db.exec(`CREATE TABLE IF NOT EXISTS sales_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_no TEXT NOT NULL,
      counterparty_id INTEGER,
      contract_id INTEGER,
      direction_id INTEGER,
      status TEXT NOT NULL DEFAULT 'draft',
      expected_at TEXT,
      comment TEXT,
      total_amount REAL NOT NULL DEFAULT 0,
      author_name TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    db.exec(`CREATE TABLE IF NOT EXISTS sales_order_lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      item_id INTEGER,
      item_name TEXT,
      quantity REAL NOT NULL DEFAULT 1,
      price REAL NOT NULL DEFAULT 0,
      amount REAL NOT NULL DEFAULT 0,
      FOREIGN KEY (order_id) REFERENCES sales_orders(id) ON DELETE CASCADE
    )`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_sales_orders_status ON sales_orders(status, created_at)');

    const ptCount = Number((db.prepare('SELECT COUNT(*) AS c FROM price_types').get() as any)?.c || 0);
    if (ptCount === 0) {
      db.prepare(`INSERT INTO price_types (name, is_default, is_active) VALUES ('Розничная', 1, 1)`).run();
      db.prepare(`INSERT INTO price_types (name, is_default, is_active) VALUES ('Оптовая', 0, 1)`).run();
    }
    const dirCount = Number((db.prepare('SELECT COUNT(*) AS c FROM business_directions').get() as any)?.c || 0);
    if (dirCount === 0) {
      db.prepare(`INSERT INTO business_directions (code, name, sort_order) VALUES ('MAIN', 'Основное направление', 0)`).run();
      db.prepare(`INSERT INTO business_directions (code, name, sort_order) VALUES ('WH', 'Склад и логистика', 1)`).run();
    }

    db.prepare("INSERT INTO schema_meta (key, value) VALUES ('version', '50') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
  }

  if (version < 51) {
    db.exec(`CREATE TABLE IF NOT EXISTS automation_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      trigger_type TEXT NOT NULL,
      condition_json TEXT NOT NULL DEFAULT '{}',
      action_type TEXT NOT NULL DEFAULT 'notify',
      action_json TEXT NOT NULL DEFAULT '{}',
      cooldown_minutes INTEGER NOT NULL DEFAULT 60,
      last_fired_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    db.exec(`CREATE TABLE IF NOT EXISTS automation_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rule_id INTEGER,
      detail TEXT,
      entity TEXT,
      entity_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (rule_id) REFERENCES automation_rules(id) ON DELETE SET NULL
    )`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_automation_log_rule ON automation_log(rule_id, id DESC)');
    db.exec(`CREATE TABLE IF NOT EXISTS app_notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      text TEXT NOT NULL,
      level TEXT NOT NULL DEFAULT 'info',
      source TEXT,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_app_notifications_unread ON app_notifications(is_read, id DESC)');
    db.prepare("INSERT INTO schema_meta (key, value) VALUES ('version', '51') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
  }

  if (version < 52) {
    db.exec(`CREATE TABLE IF NOT EXISTS item_bom_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kit_item_id INTEGER NOT NULL,
      code TEXT NOT NULL,
      name TEXT,
      is_default INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      note TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(kit_item_id, code),
      FOREIGN KEY (kit_item_id) REFERENCES items(id) ON DELETE CASCADE
    )`);
    db.exec(`CREATE TABLE IF NOT EXISTS item_tech_operations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kit_item_id INTEGER NOT NULL,
      bom_version_id INTEGER,
      sort_order INTEGER NOT NULL DEFAULT 0,
      title TEXT NOT NULL,
      norm_minutes REAL NOT NULL DEFAULT 0,
      workplace TEXT,
      note TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (kit_item_id) REFERENCES items(id) ON DELETE CASCADE,
      FOREIGN KEY (bom_version_id) REFERENCES item_bom_versions(id) ON DELETE SET NULL
    )`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_tech_ops_kit ON item_tech_operations(kit_item_id, bom_version_id, sort_order)');

    const kitCols = columns('item_kit_components');
    if (!kitCols.has('bom_version_id')) {

      db.exec(`CREATE TABLE item_kit_components_v52 (
        kit_item_id INTEGER NOT NULL,
        bom_version_id INTEGER NOT NULL,
        component_item_id INTEGER NOT NULL,
        quantity REAL NOT NULL DEFAULT 1,
        scrap_pct REAL NOT NULL DEFAULT 0,
        note TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (kit_item_id, bom_version_id, component_item_id),
        FOREIGN KEY (kit_item_id) REFERENCES items(id) ON DELETE CASCADE,
        FOREIGN KEY (bom_version_id) REFERENCES item_bom_versions(id) ON DELETE CASCADE,
        FOREIGN KEY (component_item_id) REFERENCES items(id) ON DELETE CASCADE,
        CHECK (kit_item_id != component_item_id),
        CHECK (quantity > 0)
      )`);
      const kitIds = (db.prepare('SELECT DISTINCT kit_item_id AS id FROM item_kit_components').all() as any[])
        .map((r) => Number(r.id));
      const insVer = db.prepare(`
        INSERT INTO item_bom_versions (kit_item_id, code, name, is_default, is_active)
        VALUES (?, '1.0', 'Базовая', 1, 1)
      `);
      const verByKit = new Map<number, number>();
      for (const kid of kitIds) {
        const result = insVer.run(kid);
        verByKit.set(kid, Number(result.lastInsertRowid));
      }
      const oldRows = db.prepare('SELECT * FROM item_kit_components').all() as any[];
      const insComp = db.prepare(`
        INSERT INTO item_kit_components_v52
          (kit_item_id, bom_version_id, component_item_id, quantity, scrap_pct, note, created_at)
        VALUES (?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))
      `);
      for (const row of oldRows) {
        const vid = verByKit.get(Number(row.kit_item_id));
        if (!vid) continue;
        insComp.run(
          row.kit_item_id, vid, row.component_item_id, row.quantity,
          row.scrap_pct ?? 0, row.note ?? null, row.created_at ?? null,
        );
      }
      db.exec('DROP TABLE item_kit_components');
      db.exec('ALTER TABLE item_kit_components_v52 RENAME TO item_kit_components');
      db.exec('CREATE INDEX IF NOT EXISTS idx_item_kit_components_comp ON item_kit_components(component_item_id)');

      if (columns('item_kit_alternatives').size) {
        db.exec(`CREATE TABLE item_kit_alternatives_v52 (
          kit_item_id INTEGER NOT NULL,
          bom_version_id INTEGER NOT NULL,
          component_item_id INTEGER NOT NULL,
          alt_item_id INTEGER NOT NULL,
          priority INTEGER NOT NULL DEFAULT 1,
          quantity_factor REAL NOT NULL DEFAULT 1,
          note TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (kit_item_id, bom_version_id, component_item_id, alt_item_id),
          FOREIGN KEY (kit_item_id) REFERENCES items(id) ON DELETE CASCADE,
          FOREIGN KEY (bom_version_id) REFERENCES item_bom_versions(id) ON DELETE CASCADE,
          FOREIGN KEY (component_item_id) REFERENCES items(id) ON DELETE CASCADE,
          FOREIGN KEY (alt_item_id) REFERENCES items(id) ON DELETE CASCADE,
          CHECK (component_item_id != alt_item_id),
          CHECK (quantity_factor > 0)
        )`);
        const altRows = db.prepare('SELECT * FROM item_kit_alternatives').all() as any[];
        const insAlt = db.prepare(`
          INSERT INTO item_kit_alternatives_v52
            (kit_item_id, bom_version_id, component_item_id, alt_item_id, priority, quantity_factor, note, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))
        `);
        for (const row of altRows) {
          const vid = verByKit.get(Number(row.kit_item_id));
          if (!vid) continue;
          insAlt.run(
            row.kit_item_id, vid, row.component_item_id, row.alt_item_id,
            row.priority ?? 1, row.quantity_factor ?? 1, row.note ?? null, row.created_at ?? null,
          );
        }
        db.exec('DROP TABLE item_kit_alternatives');
        db.exec('ALTER TABLE item_kit_alternatives_v52 RENAME TO item_kit_alternatives');
        db.exec('CREATE INDEX IF NOT EXISTS idx_kit_alts_comp ON item_kit_alternatives(kit_item_id, bom_version_id, component_item_id, priority)');
      }
    }

    const opCols = columns('project_operations');
    if (!opCols.has('norm_minutes')) db.exec('ALTER TABLE project_operations ADD COLUMN norm_minutes REAL NOT NULL DEFAULT 0');
    if (!opCols.has('tech_op_id')) db.exec('ALTER TABLE project_operations ADD COLUMN tech_op_id INTEGER');

    db.prepare("INSERT INTO schema_meta (key, value) VALUES ('version', '52') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
  }

  if (version < 53) {

    db.exec(`CREATE TABLE IF NOT EXISTS assets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      inventory_no TEXT NOT NULL,
      name TEXT NOT NULL,
      category TEXT,
      serial_no TEXT,
      barcode TEXT,
      status TEXT NOT NULL DEFAULT 'in_stock',
      location_id INTEGER,
      employee_id INTEGER,
      responsible_user_id INTEGER,
      responsible_name TEXT,
      linked_item_id INTEGER,
      purchase_date TEXT,
      warranty_until TEXT,
      cost REAL,
      manufacturer TEXT,
      model TEXT,
      notes TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(inventory_no)
    )`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_assets_status ON assets(is_active, status, name)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_assets_location ON assets(location_id)');
    db.exec(`CREATE TABLE IF NOT EXISTS asset_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      asset_id INTEGER NOT NULL,
      kind TEXT NOT NULL,
      from_location_id INTEGER,
      to_location_id INTEGER,
      employee_id INTEGER,
      responsible_name TEXT,
      note TEXT,
      actor_name TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE
    )`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_asset_movements_asset ON asset_movements(asset_id, id DESC)');
    db.exec(`CREATE TABLE IF NOT EXISTS asset_maintenance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      asset_id INTEGER NOT NULL,
      kind TEXT NOT NULL DEFAULT 'service',
      planned_at TEXT,
      done_at TEXT,
      status TEXT NOT NULL DEFAULT 'planned',
      cost REAL,
      vendor TEXT,
      note TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE
    )`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_asset_maint_asset ON asset_maintenance(asset_id, status, planned_at)');
    db.prepare("INSERT INTO schema_meta (key, value) VALUES ('version', '53') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
  }

  if (version < 54) {

    db.exec(`CREATE TABLE IF NOT EXISTS edo_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT,
      name TEXT NOT NULL,
      form_type TEXT NOT NULL DEFAULT 'other',
      title_template TEXT NOT NULL DEFAULT '',
      body_template TEXT NOT NULL DEFAULT '',
      description TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_edo_templates_active ON edo_templates(is_active, form_type, sort_order, name)');

    const salesCols = columns('sales_orders');
    if (!salesCols.has('linked_document_id')) {
      db.exec('ALTER TABLE sales_orders ADD COLUMN linked_document_id INTEGER');
    }
    if (!salesCols.has('shipped_at')) {
      db.exec('ALTER TABLE sales_orders ADD COLUMN shipped_at DATETIME');
    }

    const edoCols = columns('edo_documents');
    if (!edoCols.has('template_id')) {
      db.exec('ALTER TABLE edo_documents ADD COLUMN template_id INTEGER');
    }

    const seedCount = Number((db.prepare('SELECT COUNT(*) AS c FROM edo_templates').get() as any)?.c || 0);
    if (seedCount === 0) {
      const ins = db.prepare(`
        INSERT INTO edo_templates (code, name, form_type, title_template, body_template, description, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      ins.run(
        'svc_note', 'Служебная записка', 'service_note',
        'Служебная записка · {{date}}',
        'Кому: {{to_user}}\nОт: {{from_employee}}\nОрганизация: {{org}}\nДата: {{date}}\n\nПрошу рассмотреть:\n\n',
        'Базовый шаблон служебной записки', 10,
      );
      ins.run(
        'order', 'Приказ', 'order',
        'Приказ № {{doc_no}}',
        'Организация: {{org}}\nДата: {{date}}\n\nПРИКАЗЫВАЮ:\n\n1. …\n\nОснование: …\n\nОтветственный: {{from_employee}}\n',
        'Шаблон приказа', 20,
      );
      ins.run(
        'assignment', 'Поручение', 'assignment',
        'Поручение · {{date}}',
        'Исполнителю: {{to_employee}}\nОт: {{from_employee}}\nСрок: …\n\nСодержание поручения:\n\n',
        'Шаблон поручения сотруднику', 30,
      );
      ins.run(
        'application', 'Заявление', 'application',
        'Заявление',
        'В {{org}}\nот {{from_employee}}\n\nЗаявление\n\nПрошу …\n\nДата: {{date}}\n',
        'Шаблон заявления', 40,
      );
      ins.run(
        'act', 'Акт', 'act',
        'Акт · {{date}}',
        'Организация: {{org}}\nДата: {{date}}\n\nМы, нижеподписавшиеся, составили настоящий акт о том, что:\n\n…\n',
        'Шаблон акта', 50,
      );
    }

    db.prepare("INSERT INTO schema_meta (key, value) VALUES ('version', '54') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
  }

  if (version < 55) {

    db.exec(`CREATE TABLE IF NOT EXISTS parties (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL DEFAULT 'person',
      display_name TEXT NOT NULL,
      last_name TEXT,
      first_name TEXT,
      middle_name TEXT,
      inn TEXT,
      kpp TEXT,
      phone TEXT,
      email TEXT,
      address TEXT,
      contact_person TEXT,
      position TEXT,
      department TEXT,
      notes TEXT,
      is_customer INTEGER NOT NULL DEFAULT 0,
      is_supplier INTEGER NOT NULL DEFAULT 0,
      is_partner INTEGER NOT NULL DEFAULT 0,
      is_employee INTEGER NOT NULL DEFAULT 0,
      is_user INTEGER NOT NULL DEFAULT 0,
      counterparty_id INTEGER,
      supplier_id INTEGER,
      employee_id INTEGER,
      registry_user_id INTEGER,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_parties_name ON parties(is_active, display_name)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_parties_roles ON parties(is_customer, is_supplier, is_employee, is_user)');

    db.exec(`CREATE TABLE IF NOT EXISTS config_custom_forms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      nav_label TEXT,
      description TEXT,
      fields_json TEXT NOT NULL DEFAULT '[]',
      is_active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    db.exec(`CREATE TABLE IF NOT EXISTS config_custom_form_rows (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      form_id INTEGER NOT NULL,
      data_json TEXT NOT NULL DEFAULT '{}',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (form_id) REFERENCES config_custom_forms(id) ON DELETE CASCADE
    )`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_custom_form_rows ON config_custom_form_rows(form_id, id DESC)');

    try {

      const parties = require('./parties') as typeof import('./parties');
      parties.seedPartiesFromLegacy();
    } catch (e) {
      console.warn('[Metrika] parties seed skipped:', e);
    }

    db.prepare("INSERT INTO schema_meta (key, value) VALUES ('version', '55') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
  }

  if (version < 56) {

    const cpCols = columns('counterparties');
    if (!cpCols.has('employee_id')) db.exec('ALTER TABLE counterparties ADD COLUMN employee_id INTEGER');
    if (!cpCols.has('registry_user_id')) db.exec('ALTER TABLE counterparties ADD COLUMN registry_user_id INTEGER');
    db.exec('CREATE INDEX IF NOT EXISTS idx_counterparties_links ON counterparties(supplier_id, employee_id, registry_user_id)');

    db.exec(`CREATE TABLE IF NOT EXISTS crm_threads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      counterparty_id INTEGER NOT NULL,
      subject TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      assigned_user_id INTEGER,
      assigned_name TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (counterparty_id) REFERENCES counterparties(id)
    )`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_crm_threads_cp ON crm_threads(counterparty_id, status, updated_at)');

    db.exec(`CREATE TABLE IF NOT EXISTS crm_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      thread_id INTEGER NOT NULL,
      author_kind TEXT NOT NULL DEFAULT 'staff',
      author_user_id INTEGER,
      author_name TEXT,
      body TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (thread_id) REFERENCES crm_threads(id) ON DELETE CASCADE
    )`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_crm_messages_thread ON crm_messages(thread_id, id)');

    db.exec(`CREATE TABLE IF NOT EXISTS crm_operator_modes (
      user_id INTEGER PRIMARY KEY,
      mode TEXT NOT NULL DEFAULT 'offline',
      note TEXT,
      since DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.prepare("INSERT INTO schema_meta (key, value) VALUES ('version', '56') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
  }

  if (version < 57) {

    const tplCols = columns('edo_templates');
    if (!tplCols.has('category')) db.exec("ALTER TABLE edo_templates ADD COLUMN category TEXT");
    if (!tplCols.has('keywords')) db.exec("ALTER TABLE edo_templates ADD COLUMN keywords TEXT");
    if (!tplCols.has('fields_json')) db.exec("ALTER TABLE edo_templates ADD COLUMN fields_json TEXT");
    try {
      db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_edo_templates_code ON edo_templates(code) WHERE code IS NOT NULL AND code != \'\'');
    } catch {  }

    const docCols = columns('edo_documents');
    if (!docCols.has('stamp_key')) db.exec('ALTER TABLE edo_documents ADD COLUMN stamp_key TEXT');
    if (!docCols.has('catalog_code')) db.exec('ALTER TABLE edo_documents ADD COLUMN catalog_code TEXT');
    if (!docCols.has('fields_json')) db.exec('ALTER TABLE edo_documents ADD COLUMN fields_json TEXT');

    try {

      const hub = require('./companyHub') as typeof import('./companyHub');
      hub.syncEdoCatalogTemplates();
    } catch (e) {
      console.warn('[Metrika] edo catalog sync skipped:', e);
    }

    db.prepare("INSERT INTO schema_meta (key, value) VALUES ('version', '57') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
  }

  if (version < 58) {
    const soCols = columns('sales_orders');
    if (!soCols.has('ship_location_id')) {
      db.exec('ALTER TABLE sales_orders ADD COLUMN ship_location_id INTEGER');
    }
    db.prepare("INSERT INTO schema_meta (key, value) VALUES ('version', '58') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
  }

  if (version < 59) {
    const docCols = columns('edo_documents');
    if (!docCols.has('stamp_valid_from')) db.exec('ALTER TABLE edo_documents ADD COLUMN stamp_valid_from TEXT');
    if (!docCols.has('stamp_valid_to')) db.exec('ALTER TABLE edo_documents ADD COLUMN stamp_valid_to TEXT');
    try {

      const hub = require('./companyHub') as typeof import('./companyHub');
      hub.syncEdoCatalogTemplates();
    } catch (e) {
      console.warn('[Metrika] edo catalog re-sync skipped:', e);
    }
    db.prepare("INSERT INTO schema_meta (key, value) VALUES ('version', '59') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
  }

  if (version < 60) {

    const msgCols = columns('crm_messages');
    if (!msgCols.has('client_msg_id')) db.exec('ALTER TABLE crm_messages ADD COLUMN client_msg_id TEXT');
    if (!msgCols.has('is_internal')) db.exec('ALTER TABLE crm_messages ADD COLUMN is_internal INTEGER NOT NULL DEFAULT 0');
    try {
      db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_messages_idem ON crm_messages(thread_id, client_msg_id) WHERE client_msg_id IS NOT NULL AND client_msg_id != \'\'');
    } catch {  }

    db.exec(`CREATE TABLE IF NOT EXISTS crm_cases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      counterparty_id INTEGER NOT NULL,
      thread_id INTEGER,
      subject TEXT NOT NULL,
      category TEXT,
      priority TEXT NOT NULL DEFAULT 'normal',
      status TEXT NOT NULL DEFAULT 'new',
      queue_id TEXT,
      assigned_user_id INTEGER,
      assigned_name TEXT,
      related_item_id INTEGER,
      related_purchase_order_id INTEGER,
      related_sales_order_id INTEGER,
      related_shipment_id INTEGER,
      related_edo_document_id INTEGER,
      resolution TEXT,
      wait_reason TEXT,
      sla_response_due TEXT,
      sla_resolve_due TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      closed_at DATETIME,
      FOREIGN KEY (counterparty_id) REFERENCES counterparties(id),
      FOREIGN KEY (thread_id) REFERENCES crm_threads(id) ON DELETE SET NULL
    )`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_crm_cases_cp ON crm_cases(counterparty_id, status, updated_at)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_crm_cases_thread ON crm_cases(thread_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_crm_cases_assignee ON crm_cases(assigned_user_id, status)');

    db.exec(`CREATE TABLE IF NOT EXISTS crm_case_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      case_id INTEGER NOT NULL,
      event_kind TEXT NOT NULL,
      actor_kind TEXT,
      actor_user_id INTEGER,
      actor_name TEXT,
      detail TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (case_id) REFERENCES crm_cases(id) ON DELETE CASCADE
    )`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_crm_case_events ON crm_case_events(case_id, id)');

    db.exec(`CREATE TABLE IF NOT EXISTS crm_transport_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL,
      thread_id INTEGER,
      case_id INTEGER,
      counterparty_id INTEGER,
      payload_json TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_crm_transport_events ON crm_transport_events(id)');

    try {
      db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_counterparties_portal_user ON counterparties(registry_user_id) WHERE registry_user_id IS NOT NULL');
    } catch {  }

    try {
      db.exec(`
        INSERT INTO crm_cases (counterparty_id, thread_id, subject, status, assigned_user_id, assigned_name, created_at, updated_at)
        SELECT t.counterparty_id, t.id, t.subject,
          CASE t.status WHEN 'closed' THEN 'closed' WHEN 'pending' THEN 'waiting' ELSE 'open' END,
          t.assigned_user_id, t.assigned_name, t.created_at, t.updated_at
        FROM crm_threads t
        WHERE NOT EXISTS (SELECT 1 FROM crm_cases c WHERE c.thread_id = t.id)
      `);
    } catch (e) {
      console.warn('[Metrika] crm_cases backfill skipped:', e);
    }

    db.prepare("INSERT INTO schema_meta (key, value) VALUES ('version', '60') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
  }

  if (version < 61) {

    db.exec(`CREATE TABLE IF NOT EXISTS crm_queues (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      category TEXT,
      priority_boost INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    db.exec(`CREATE TABLE IF NOT EXISTS crm_message_attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id INTEGER NOT NULL,
      file_name TEXT NOT NULL,
      stored_name TEXT NOT NULL,
      mime_type TEXT,
      size_bytes INTEGER NOT NULL DEFAULT 0,
      uploaded_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (message_id) REFERENCES crm_messages(id) ON DELETE CASCADE
    )`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_crm_msg_attach ON crm_message_attachments(message_id, id)');

    const qCount = Number((db.prepare('SELECT COUNT(*) AS c FROM crm_queues').get() as any)?.c || 0);
    if (qCount === 0) {
      const ins = db.prepare('INSERT INTO crm_queues (code, title, category, sort_order) VALUES (?, ?, ?, ?)');
      ins.run('general', 'Общая очередь', null, 10);
      ins.run('suppliers', 'Поставщики', 'portal', 20);
      ins.run('sales', 'Продажи', 'sales', 30);
    }

    db.prepare("INSERT INTO schema_meta (key, value) VALUES ('setting:crm.sla_response_hours', '4') ON CONFLICT(key) DO NOTHING").run();
    db.prepare("INSERT INTO schema_meta (key, value) VALUES ('setting:crm.sla_resolve_hours', '48') ON CONFLICT(key) DO NOTHING").run();
    db.prepare("INSERT INTO schema_meta (key, value) VALUES ('version', '61') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
  }

  if (version < 62) {

    db.exec(`CREATE TABLE IF NOT EXISTS counterparty_custom_values (
      counterparty_id INTEGER NOT NULL,
      field_id INTEGER NOT NULL,
      value_text TEXT,
      PRIMARY KEY (counterparty_id, field_id),
      FOREIGN KEY (counterparty_id) REFERENCES counterparties(id) ON DELETE CASCADE,
      FOREIGN KEY (field_id) REFERENCES custom_field_defs(id) ON DELETE CASCADE
    )`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_cp_custom_values_field ON counterparty_custom_values(field_id)');
    db.prepare("INSERT INTO schema_meta (key, value) VALUES ('version', '62') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
  }

  if (version < 63) {
    db.exec(`CREATE TABLE IF NOT EXISTS employee_custom_values (
      employee_id INTEGER NOT NULL,
      field_id INTEGER NOT NULL,
      value_text TEXT,
      PRIMARY KEY (employee_id, field_id),
      FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
      FOREIGN KEY (field_id) REFERENCES custom_field_defs(id) ON DELETE CASCADE
    )`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_emp_custom_values_field ON employee_custom_values(field_id)');
    db.exec(`CREATE TABLE IF NOT EXISTS document_custom_values (
      document_id INTEGER NOT NULL,
      field_id INTEGER NOT NULL,
      value_text TEXT,
      PRIMARY KEY (document_id, field_id),
      FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
      FOREIGN KEY (field_id) REFERENCES custom_field_defs(id) ON DELETE CASCADE
    )`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_doc_custom_values_field ON document_custom_values(field_id)');
    db.prepare("INSERT INTO schema_meta (key, value) VALUES ('version', '63') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
  }

  if (version < 64) {

    try {
      db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_counterparties_supplier_id ON counterparties(supplier_id) WHERE supplier_id IS NOT NULL');
    } catch (e) {
      console.warn('[Metrika] idx_counterparties_supplier_id skipped (возможны дубликаты supplier_id):', e);
    }
    db.prepare("INSERT INTO schema_meta (key, value) VALUES ('version', '64') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
  }

  if (version < 65) {

    db.exec(`CREATE TABLE IF NOT EXISTS crm_portal_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token_hash TEXT NOT NULL UNIQUE,
      token_prefix TEXT NOT NULL,
      counterparty_id INTEGER NOT NULL,
      registry_user_id INTEGER,
      label TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_used_at DATETIME,
      revoked_at DATETIME,
      FOREIGN KEY (counterparty_id) REFERENCES counterparties(id) ON DELETE CASCADE
    )`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_crm_portal_tokens_cp ON crm_portal_tokens(counterparty_id, revoked_at)');
    db.prepare("INSERT INTO schema_meta (key, value) VALUES ('setting:crm.remote.port', '47831') ON CONFLICT(key) DO NOTHING").run();
    db.prepare("INSERT INTO schema_meta (key, value) VALUES ('setting:crm.remote.enabled', '0') ON CONFLICT(key) DO NOTHING").run();
    db.prepare("INSERT INTO schema_meta (key, value) VALUES ('version', '65') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
  }

  if (version < 66) {

    db.exec(`CREATE TABLE IF NOT EXISTS miapi_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token_hash TEXT NOT NULL UNIQUE,
      token_prefix TEXT NOT NULL,
      label TEXT,
      created_by_user_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_used_at DATETIME,
      revoked_at DATETIME
    )`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_miapi_tokens_active ON miapi_tokens(revoked_at)');
    db.prepare("INSERT INTO schema_meta (key, value) VALUES ('setting:miapi.port', '47832') ON CONFLICT(key) DO NOTHING").run();
    db.prepare("INSERT INTO schema_meta (key, value) VALUES ('setting:miapi.enabled', '0') ON CONFLICT(key) DO NOTHING").run();
    db.prepare("INSERT INTO schema_meta (key, value) VALUES ('setting:miapi.webhook_secret', '') ON CONFLICT(key) DO NOTHING").run();
    db.prepare("INSERT INTO schema_meta (key, value) VALUES ('version', '66') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
  }

  if (version < 67) {

    db.exec(`CREATE TABLE IF NOT EXISTS tsd_outbox (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_op_id TEXT NOT NULL UNIQUE,
      op_type TEXT NOT NULL DEFAULT 'project_scan',
      project_id INTEGER NOT NULL,
      item_id INTEGER NOT NULL,
      barcode TEXT,
      qty REAL NOT NULL DEFAULT 1,
      device_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      status TEXT NOT NULL DEFAULT 'pending',
      error TEXT,
      applied_scan_id INTEGER,
      applied_at DATETIME
    )`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_tsd_outbox_pending ON tsd_outbox(status, id)');
    db.prepare("INSERT INTO schema_meta (key, value) VALUES ('version', '67') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
  }

  if (version < 68) {

    db.exec(`CREATE TABLE IF NOT EXISTS edo_legal_packages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      package_id TEXT NOT NULL UNIQUE,
      edo_document_id INTEGER NOT NULL,
      operator TEXT,
      status TEXT NOT NULL DEFAULT 'ready',
      package_dir TEXT,
      content_hash TEXT,
      meta_json TEXT,
      transport_json TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (edo_document_id) REFERENCES edo_documents(id) ON DELETE CASCADE
    )`);
    db.exec(`CREATE TABLE IF NOT EXISTS exchange_channels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL,
      name TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      config_json TEXT,
      last_sync_at DATETIME,
      last_error TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    db.exec(`CREATE TABLE IF NOT EXISTS marketplace_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      channel_id INTEGER,
      external_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'new',
      customer_name TEXT,
      total_amount REAL,
      payload_json TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(channel_id, external_id)
    )`);
    db.exec(`CREATE TABLE IF NOT EXISTS marketplace_order_lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      item_id INTEGER,
      sku TEXT,
      name TEXT,
      qty REAL NOT NULL DEFAULT 1,
      price REAL,
      FOREIGN KEY (order_id) REFERENCES marketplace_orders(id) ON DELETE CASCADE
    )`);
    db.exec(`CREATE TABLE IF NOT EXISTS doc_workflow_transitions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_status TEXT NOT NULL,
      to_status TEXT NOT NULL,
      label TEXT,
      roles_json TEXT,
      maps_to TEXT
    )`);
    db.exec(`CREATE TABLE IF NOT EXISTS tsd_stock_counts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL,
      location_id INTEGER NOT NULL,
      qty REAL NOT NULL DEFAULT 1,
      barcode TEXT,
      client_op_id TEXT,
      device_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    try {
      const poCols = new Set((db.prepare('PRAGMA table_info(purchase_orders)').all() as any[]).map((c) => c.name));
      if (!poCols.has('counterparty_id')) {
        db.exec('ALTER TABLE purchase_orders ADD COLUMN counterparty_id INTEGER');
      }
    } catch {  }

    try {
      db.exec(`
        UPDATE purchase_orders
        SET counterparty_id = (
          SELECT c.id FROM counterparties c
          WHERE c.supplier_id = purchase_orders.supplier_id
          LIMIT 1
        )
        WHERE counterparty_id IS NULL AND supplier_id IS NOT NULL
      `);
    } catch {  }
    db.prepare("INSERT INTO schema_meta (key, value) VALUES ('setting:edo.legal.operator', 'file') ON CONFLICT(key) DO NOTHING").run();
    db.prepare("INSERT INTO schema_meta (key, value) VALUES ('setting:devices.label.mode', 'os') ON CONFLICT(key) DO NOTHING").run();
    db.prepare("INSERT INTO schema_meta (key, value) VALUES ('version', '68') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
  }

  if (version < 69) {

    const edoCols = new Set((db.prepare('PRAGMA table_info(edo_documents)').all() as any[]).map((c) => c.name));
    if (!edoCols.has('doc_tag')) db.exec('ALTER TABLE edo_documents ADD COLUMN doc_tag TEXT');
    if (!edoCols.has('reg_stream')) db.exec('ALTER TABLE edo_documents ADD COLUMN reg_stream TEXT');
    if (!edoCols.has('tags_json')) db.exec('ALTER TABLE edo_documents ADD COLUMN tags_json TEXT');
    db.exec('CREATE INDEX IF NOT EXISTS idx_edo_doc_tag ON edo_documents(doc_tag)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_edo_reg_stream ON edo_documents(reg_stream)');
    db.prepare("INSERT INTO schema_meta (key, value) VALUES ('version', '69') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
  }

  if (version < 70) {

    try {
      backfillLegacyMoveEndpoints();
      rebuildInventoryFromLedger();
    } catch (e) {
      console.error('[Metrika] v70 legacy move heal failed:', e);
    }
    db.prepare("INSERT INTO schema_meta (key, value) VALUES ('version', '70') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
  }

  try {
    healQuantityMigrationArtifacts();
    ensureStockReservesView();
    purgeStaleReservations();

    db.prepare('DELETE FROM inventory WHERE quantity <= 0').run();
  } catch (healError) {
    console.error('[Metrika] heal after migrate failed:', healError);
    try { healQuantityMigrationArtifacts(); } catch {  }
  }

  try {

    const automation = require('./automation') as typeof import('./automation');
    automation.ensureDefaultAutomationRules();
  } catch {  }
}

export function healQuantityMigrationArtifacts() {
  if (!db) return;

  try { db.exec('DROP VIEW IF EXISTS stock_reserves'); } catch {  }
  const tableExists = (name: string) => {
    const row = db.prepare(`SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ?`).get(name) as any;
    return Boolean(row?.ok);
  };
  const renameIfNeeded = (from: string, to: string) => {
    if (tableExists(from) && !tableExists(to)) {
      db.exec(`ALTER TABLE "${from}" RENAME TO "${to}"`);
    } else if (tableExists(from) && tableExists(to)) {

      db.exec(`DROP TABLE IF EXISTS "${from}"`);
    }
  };

  for (const name of [
    'inventory',
    'transactions',
    'item_kit_components',
    'purchase_order_items',
    'project_items',
    'project_reservations',
    'inventory_counts',
    'item_conditions',
    'document_lines',
  ]) {
    renameIfNeeded(`${name}_v30`, name);
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS project_reservations (
      project_id INTEGER NOT NULL,
      item_id INTEGER NOT NULL,
      location_id INTEGER NOT NULL,
      quantity REAL NOT NULL DEFAULT 0,
      PRIMARY KEY (project_id, item_id, location_id)
    );
    CREATE TABLE IF NOT EXISTS project_items (
      project_id INTEGER NOT NULL,
      item_id INTEGER NOT NULL,
      quantity REAL NOT NULL DEFAULT 1,
      PRIMARY KEY (project_id, item_id)
    );
    CREATE TABLE IF NOT EXISTS inventory_counts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      item_id INTEGER NOT NULL,
      counted_quantity REAL NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS item_conditions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL,
      condition TEXT NOT NULL,
      quantity REAL NOT NULL DEFAULT 0
    );
  `);
  db.exec('CREATE INDEX IF NOT EXISTS idx_project_reservations_item_loc ON project_reservations(item_id, location_id)');
}

export function listItemAnalogs(itemId: number) {
  return db.prepare(`
    SELECT a.analog_item_id AS id, a.note, i.name, i.sku, i.barcode, i.item_type,
      COALESCE((SELECT SUM(inv.quantity) FROM inventory inv WHERE inv.item_id = i.id), 0) AS on_hand
    FROM item_analogs a
    JOIN items i ON i.id = a.analog_item_id
    WHERE a.item_id = ?
    ORDER BY i.name
  `).all(Number(itemId)) as any[];
}

export function addItemAnalog(itemId: number, analogItemId: number, note?: string | null) {
  const a = Number(itemId);
  const b = Number(analogItemId);
  if (!a || !b || a === b) throw new Error('Выберите другой товар как аналог');
  const left = db.prepare('SELECT id FROM items WHERE id = ?').get(a);
  const right = db.prepare('SELECT id FROM items WHERE id = ?').get(b);
  if (!left || !right) throw new Error('Товар не найден');
  const insert = db.prepare(`INSERT OR IGNORE INTO item_analogs (item_id, analog_item_id, note) VALUES (?, ?, ?)`);
  const tx = db.transaction(() => {
    insert.run(a, b, note || null);
    insert.run(b, a, note || null);
  });
  tx();
  return listItemAnalogs(a);
}

export function removeItemAnalog(itemId: number, analogItemId: number) {
  const a = Number(itemId);
  const b = Number(analogItemId);
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM item_analogs WHERE item_id = ? AND analog_item_id = ?').run(a, b);
    db.prepare('DELETE FROM item_analogs WHERE item_id = ? AND analog_item_id = ?').run(b, a);
  });
  tx();
  return listItemAnalogs(a);
}

export function listItemCharacteristics(itemId: number) {
  return db.prepare(`
    SELECT id, item_id, name, value, sort_order
    FROM item_characteristics
    WHERE item_id = ?
    ORDER BY sort_order, name COLLATE NOCASE
  `).all(Number(itemId)) as any[];
}

export function upsertItemCharacteristic(itemId: number, name: string, value: string) {
  const id = Number(itemId);
  const key = String(name || '').trim();
  const val = String(value ?? '').trim();
  if (!id) throw new Error('Товар не найден');
  if (!key) throw new Error('Укажите название характеристики');
  if (key.length > 80) throw new Error('Название характеристики слишком длинное');
  if (val.length > 500) throw new Error('Значение характеристики слишком длинное');
  const item = db.prepare('SELECT id FROM items WHERE id = ?').get(id);
  if (!item) throw new Error('Товар не найден');
  const maxOrder = (db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS m FROM item_characteristics WHERE item_id = ?').get(id) as any)?.m || 0;
  db.prepare(`
    INSERT INTO item_characteristics (item_id, name, value, sort_order)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(item_id, name) DO UPDATE SET value = excluded.value
  `).run(id, key, val, maxOrder + 1);
  return listItemCharacteristics(id);
}

export function removeItemCharacteristic(itemId: number, characteristicId: number) {
  const id = Number(itemId);
  db.prepare('DELETE FROM item_characteristics WHERE id = ? AND item_id = ?').run(Number(characteristicId), id);
  return listItemCharacteristics(id);
}

export function listCharacteristicNameHints(limit = 40) {
  return (db.prepare(`
    SELECT name, COUNT(*) AS uses
    FROM item_characteristics
    GROUP BY name
    ORDER BY uses DESC, name COLLATE NOCASE
    LIMIT ?
  `).all(Math.max(1, Number(limit) || 40)) as any[]).map((row) => String(row.name));
}

export function ensureDefaultBomVersion(kitItemId: number): number {
  const kitId = Number(kitItemId);
  if (!kitId) throw new Error('Комплект не указан');
  const existing = db.prepare(`
    SELECT id FROM item_bom_versions
    WHERE kit_item_id = ? AND is_default = 1 AND is_active = 1
    ORDER BY id LIMIT 1
  `).get(kitId) as any;
  if (existing) return Number(existing.id);
  const any = db.prepare(`
    SELECT id FROM item_bom_versions WHERE kit_item_id = ? AND is_active = 1 ORDER BY id LIMIT 1
  `).get(kitId) as any;
  if (any) {
    db.prepare('UPDATE item_bom_versions SET is_default = CASE WHEN id = ? THEN 1 ELSE 0 END WHERE kit_item_id = ?')
      .run(Number(any.id), kitId);
    return Number(any.id);
  }
  const result = db.prepare(`
    INSERT INTO item_bom_versions (kit_item_id, code, name, is_default, is_active)
    VALUES (?, '1.0', 'Базовая', 1, 1)
  `).run(kitId);
  return Number(result.lastInsertRowid);
}

export function listBomVersions(kitItemId: number) {
  ensureDefaultBomVersion(Number(kitItemId));
  return db.prepare(`
    SELECT v.*,
      (SELECT COUNT(*) FROM item_kit_components c WHERE c.bom_version_id = v.id) AS component_count,
      (SELECT COALESCE(SUM(t.norm_minutes), 0) FROM item_tech_operations t
        WHERE t.kit_item_id = v.kit_item_id AND (t.bom_version_id = v.id OR t.bom_version_id IS NULL)) AS norm_minutes_total
    FROM item_bom_versions v
    WHERE v.kit_item_id = ?
    ORDER BY v.is_default DESC, v.id
  `).all(Number(kitItemId)) as any[];
}

export function saveBomVersion(data: {
  id?: number;
  kit_item_id: number;
  code?: string;
  name?: string;
  note?: string | null;
  is_default?: boolean;
  is_active?: boolean;
}) {
  const kitId = Number(data.kit_item_id);
  if (!kitId) throw new Error('Комплект не указан');
  const id = data.id ? Number(data.id) : 0;
  if (id) {
    const code = data.code !== undefined ? String(data.code || '').trim() : undefined;
    if (code !== undefined && !code) throw new Error('Укажите код версии');
    db.prepare(`
      UPDATE item_bom_versions SET
        code = COALESCE(?, code),
        name = COALESCE(?, name),
        note = CASE WHEN ? THEN ? ELSE note END,
        is_active = COALESCE(?, is_active)
      WHERE id = ? AND kit_item_id = ?
    `).run(
      code ?? null,
      data.name !== undefined ? (String(data.name || '').trim() || null) : null,
      data.note !== undefined ? 1 : 0,
      data.note !== undefined ? (String(data.note || '').trim() || null) : null,
      data.is_active === undefined ? null : (data.is_active ? 1 : 0),
      id, kitId,
    );
    if (data.is_default) {
      db.prepare('UPDATE item_bom_versions SET is_default = CASE WHEN id = ? THEN 1 ELSE 0 END WHERE kit_item_id = ?')
        .run(id, kitId);
    }
    return listBomVersions(kitId).find((v) => Number(v.id) === id);
  }
  const code = String(data.code || '').trim() || nextBomVersionCode(kitId);
  const result = db.prepare(`
    INSERT INTO item_bom_versions (kit_item_id, code, name, is_default, is_active, note)
    VALUES (?, ?, ?, 0, 1, ?)
  `).run(kitId, code, String(data.name || '').trim() || code, String(data.note || '').trim() || null);
  const newId = Number(result.lastInsertRowid);
  if (data.is_default !== false && !db.prepare('SELECT id FROM item_bom_versions WHERE kit_item_id = ? AND is_default = 1').get(kitId)) {
    db.prepare('UPDATE item_bom_versions SET is_default = 1 WHERE id = ?').run(newId);
  }
  return listBomVersions(kitId).find((v) => Number(v.id) === newId);
}

function nextBomVersionCode(kitItemId: number) {
  const rows = db.prepare('SELECT code FROM item_bom_versions WHERE kit_item_id = ?').all(Number(kitItemId)) as any[];
  let max = 0;
  for (const row of rows) {
    const m = String(row.code || '').match(/^(\d+)/);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${max + 1}.0`;
}

export function setDefaultBomVersion(kitItemId: number, versionId: number) {
  const kitId = Number(kitItemId);
  const vid = Number(versionId);
  const row = db.prepare('SELECT id FROM item_bom_versions WHERE id = ? AND kit_item_id = ?').get(vid, kitId);
  if (!row) throw new Error('Версия не найдена');
  db.prepare('UPDATE item_bom_versions SET is_default = CASE WHEN id = ? THEN 1 ELSE 0 END WHERE kit_item_id = ?')
    .run(vid, kitId);
  return listBomVersions(kitId);
}

export function copyBomVersion(kitItemId: number, fromVersionId: number, code?: string, name?: string) {
  const kitId = Number(kitItemId);
  const fromId = Number(fromVersionId);
  const src = db.prepare('SELECT * FROM item_bom_versions WHERE id = ? AND kit_item_id = ?').get(fromId, kitId) as any;
  if (!src) throw new Error('Исходная версия не найдена');
  const created = saveBomVersion({
    kit_item_id: kitId,
    code: code || nextBomVersionCode(kitId),
    name: name || `${src.name || src.code} (копия)`,
    is_default: false,
  });
  const toId = Number(created?.id);
  db.prepare(`
    INSERT INTO item_kit_components (kit_item_id, bom_version_id, component_item_id, quantity, scrap_pct, note)
    SELECT kit_item_id, ?, component_item_id, quantity, scrap_pct, note
    FROM item_kit_components WHERE kit_item_id = ? AND bom_version_id = ?
  `).run(toId, kitId, fromId);
  db.prepare(`
    INSERT INTO item_kit_alternatives (kit_item_id, bom_version_id, component_item_id, alt_item_id, priority, quantity_factor, note)
    SELECT kit_item_id, ?, component_item_id, alt_item_id, priority, quantity_factor, note
    FROM item_kit_alternatives WHERE kit_item_id = ? AND bom_version_id = ?
  `).run(toId, kitId, fromId);
  db.prepare(`
    INSERT INTO item_tech_operations (kit_item_id, bom_version_id, sort_order, title, norm_minutes, workplace, note)
    SELECT kit_item_id, ?, sort_order, title, norm_minutes, workplace, note
    FROM item_tech_operations WHERE kit_item_id = ? AND (bom_version_id = ? OR bom_version_id IS NULL)
  `).run(toId, kitId, fromId);
  return created;
}

export function deleteBomVersion(kitItemId: number, versionId: number) {
  const kitId = Number(kitItemId);
  const vid = Number(versionId);
  const row = db.prepare('SELECT * FROM item_bom_versions WHERE id = ? AND kit_item_id = ?').get(vid, kitId) as any;
  if (!row) throw new Error('Версия не найдена');
  const count = Number((db.prepare('SELECT COUNT(*) AS c FROM item_bom_versions WHERE kit_item_id = ?').get(kitId) as any)?.c || 0);
  if (count <= 1) throw new Error('Нельзя удалить единственную версию спецификации');
  db.prepare('DELETE FROM item_kit_alternatives WHERE bom_version_id = ?').run(vid);
  db.prepare('DELETE FROM item_kit_components WHERE bom_version_id = ?').run(vid);
  db.prepare('DELETE FROM item_tech_operations WHERE bom_version_id = ?').run(vid);
  db.prepare('DELETE FROM item_bom_versions WHERE id = ?').run(vid);
  if (row.is_default) ensureDefaultBomVersion(kitId);
  return listBomVersions(kitId);
}

export function listKitAlternatives(kitItemId: number, componentItemId?: number, bomVersionId?: number | null) {
  const kitId = Number(kitItemId);
  const versionId = bomVersionId != null ? Number(bomVersionId) : ensureDefaultBomVersion(kitId);
  const compId = componentItemId != null ? Number(componentItemId) : null;
  const sql = compId
    ? `SELECT a.component_item_id, a.alt_item_id AS id, a.priority, a.quantity_factor, a.note, a.bom_version_id,
         i.name, i.sku, i.barcode, i.item_type,
         COALESCE((SELECT SUM(inv.quantity) FROM inventory inv WHERE inv.item_id = i.id), 0) AS on_hand
       FROM item_kit_alternatives a
       JOIN items i ON i.id = a.alt_item_id
       WHERE a.kit_item_id = ? AND a.bom_version_id = ? AND a.component_item_id = ?
       ORDER BY a.priority, i.name COLLATE NOCASE`
    : `SELECT a.component_item_id, a.alt_item_id AS id, a.priority, a.quantity_factor, a.note, a.bom_version_id,
         i.name, i.sku, i.barcode, i.item_type,
         COALESCE((SELECT SUM(inv.quantity) FROM inventory inv WHERE inv.item_id = i.id), 0) AS on_hand
       FROM item_kit_alternatives a
       JOIN items i ON i.id = a.alt_item_id
       WHERE a.kit_item_id = ? AND a.bom_version_id = ?
       ORDER BY a.component_item_id, a.priority, i.name COLLATE NOCASE`;
  return (compId
    ? db.prepare(sql).all(kitId, versionId, compId)
    : db.prepare(sql).all(kitId, versionId)) as any[];
}

export function kitComponentDemandQty(quantity: number, scrapPct = 0, factor = 1) {
  const base = Math.max(0, Number(quantity) || 0);
  const scrap = Math.max(0, Math.min(100, Number(scrapPct) || 0));
  const mult = Math.max(0.0001, Number(factor) || 1);
  return normalizeQty(base * (1 + scrap / 100) * mult, 6);
}

export function listKitComponents(kitItemId: number, bomVersionId?: number | null) {
  const kitId = Number(kitItemId);
  const versionId = bomVersionId != null ? Number(bomVersionId) : ensureDefaultBomVersion(kitId);
  const rows = db.prepare(`
    SELECT k.component_item_id AS id, k.quantity,
      COALESCE(k.scrap_pct, 0) AS scrap_pct,
      k.note, k.bom_version_id,
      i.name, i.sku, i.barcode, i.item_type,
      COALESCE((SELECT SUM(inv.quantity) FROM inventory inv WHERE inv.item_id = i.id), 0) AS on_hand
    FROM item_kit_components k
    JOIN items i ON i.id = k.component_item_id
    WHERE k.kit_item_id = ? AND k.bom_version_id = ?
    ORDER BY i.name COLLATE NOCASE
  `).all(kitId, versionId) as any[];
  const alts = listKitAlternatives(kitId, undefined, versionId);
  const byComp = new Map<number, any[]>();
  for (const alt of alts) {
    const key = Number(alt.component_item_id);
    if (!byComp.has(key)) byComp.set(key, []);
    byComp.get(key)!.push(alt);
  }
  return rows.map((row) => ({
    ...row,
    bom_version_id: versionId,
    demand_qty: kitComponentDemandQty(row.quantity, row.scrap_pct, 1),
    alternatives: byComp.get(Number(row.id)) || [],
  }));
}

export function isBomItemType(type: any): boolean {
  return ['pack', 'set', 'kit'].includes(String(type || ''));
}

export function listItemParentKits(componentItemId: number) {
  return db.prepare(`
    SELECT k.kit_item_id AS id, k.quantity,
      i.name, i.sku, i.barcode, i.item_type, i.sale_price, i.cost_price,
      COALESCE((SELECT SUM(inv.quantity) FROM inventory inv WHERE inv.item_id = i.id), 0) AS on_hand
    FROM item_kit_components k
    JOIN items i ON i.id = k.kit_item_id
    WHERE k.component_item_id = ?
    ORDER BY i.name COLLATE NOCASE
  `).all(Number(componentItemId)) as any[];
}

export function upsertKitComponent(
  kitItemId: number,
  componentItemId: number,
  quantity: number,
  opts: { scrap_pct?: number; note?: string | null; bom_version_id?: number | null } = {},
) {
  const kitId = Number(kitItemId);
  const compId = Number(componentItemId);
  const versionId = opts.bom_version_id != null ? Number(opts.bom_version_id) : ensureDefaultBomVersion(kitId);
  const qty = normalizeQty(quantity, 3);
  if (!(qty > 0)) throw new Error('Количество компонента должно быть больше 0');
  if (!kitId || !compId || kitId === compId) throw new Error('Выберите другой товар как компонент');
  const kit = db.prepare('SELECT id, item_type FROM items WHERE id = ?').get(kitId) as any;
  const comp = db.prepare('SELECT id, item_type FROM items WHERE id = ?').get(compId) as any;
  if (!kit || !comp) throw new Error('Товар не найден');
  if (String(comp.item_type || 'product') === 'service') throw new Error('Услугу нельзя включить в состав');
  if (isBomItemType(comp.item_type)) throw new Error('Нельзя вложить упаковку/набор/комплект в другой состав — сначала разберите его');
  const reverse = db.prepare(
    'SELECT 1 FROM item_kit_components WHERE kit_item_id = ? AND component_item_id = ?',
  ).get(compId, kitId);
  if (reverse) throw new Error('Циклический состав: этот товар уже содержит текущий комплект');
  const existing = db.prepare(
    'SELECT scrap_pct, note FROM item_kit_components WHERE kit_item_id = ? AND bom_version_id = ? AND component_item_id = ?',
  ).get(kitId, versionId, compId) as any;
  const scrap = opts.scrap_pct !== undefined
    ? Math.max(0, Math.min(100, Number(opts.scrap_pct) || 0))
    : Math.max(0, Number(existing?.scrap_pct) || 0);
  const note = opts.note !== undefined
    ? (String(opts.note || '').trim() || null)
    : (existing?.note ?? null);
  db.prepare(`
    INSERT INTO item_kit_components (kit_item_id, bom_version_id, component_item_id, quantity, scrap_pct, note)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(kit_item_id, bom_version_id, component_item_id) DO UPDATE SET
      quantity = excluded.quantity,
      scrap_pct = excluded.scrap_pct,
      note = excluded.note
  `).run(kitId, versionId, compId, qty, scrap, note);
  if (!isBomItemType(kit.item_type)) {
    db.prepare(`UPDATE items SET item_type = 'pack' WHERE id = ?`).run(kitId);
  }
  return listKitComponents(kitId, versionId);
}

export function removeKitComponent(kitItemId: number, componentItemId: number, bomVersionId?: number | null) {
  const kitId = Number(kitItemId);
  const versionId = bomVersionId != null ? Number(bomVersionId) : ensureDefaultBomVersion(kitId);
  db.prepare('DELETE FROM item_kit_alternatives WHERE kit_item_id = ? AND bom_version_id = ? AND component_item_id = ?')
    .run(kitId, versionId, Number(componentItemId));
  db.prepare('DELETE FROM item_kit_components WHERE kit_item_id = ? AND bom_version_id = ? AND component_item_id = ?')
    .run(kitId, versionId, Number(componentItemId));
  return listKitComponents(kitId, versionId);
}

export function upsertKitAlternative(
  kitItemId: number,
  componentItemId: number,
  altItemId: number,
  opts: { priority?: number; quantity_factor?: number; note?: string | null; bom_version_id?: number | null } = {},
) {
  const kitId = Number(kitItemId);
  const compId = Number(componentItemId);
  const altId = Number(altItemId);
  const versionId = opts.bom_version_id != null ? Number(opts.bom_version_id) : ensureDefaultBomVersion(kitId);
  if (!kitId || !compId || !altId) throw new Error('Укажите комплект, основной компонент и заменитель');
  if (compId === altId) throw new Error('Заменитель должен отличаться от основного компонента');
  if (altId === kitId) throw new Error('Комплект не может быть своим заменителем');
  const primary = db.prepare(
    'SELECT 1 FROM item_kit_components WHERE kit_item_id = ? AND bom_version_id = ? AND component_item_id = ?',
  ).get(kitId, versionId, compId);
  if (!primary) throw new Error('Сначала добавьте основной компонент в состав');
  const alt = db.prepare('SELECT id, item_type FROM items WHERE id = ?').get(altId) as any;
  if (!alt) throw new Error('Заменитель не найден');
  if (String(alt.item_type || 'product') === 'service') throw new Error('Услугу нельзя указать заменителем');
  if (isBomItemType(alt.item_type)) throw new Error('Заменителем не может быть упаковка/набор/комплект');
  const priority = Math.max(1, Math.min(99, Number(opts.priority) || 1));
  const factor = Math.max(0.0001, Number(opts.quantity_factor) || 1);
  const note = opts.note !== undefined ? (String(opts.note || '').trim() || null) : null;
  db.prepare(`
    INSERT INTO item_kit_alternatives (kit_item_id, bom_version_id, component_item_id, alt_item_id, priority, quantity_factor, note)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(kit_item_id, bom_version_id, component_item_id, alt_item_id) DO UPDATE SET
      priority = excluded.priority,
      quantity_factor = excluded.quantity_factor,
      note = excluded.note
  `).run(kitId, versionId, compId, altId, priority, factor, note);
  return listKitComponents(kitId, versionId);
}

export function removeKitAlternative(
  kitItemId: number,
  componentItemId: number,
  altItemId: number,
  bomVersionId?: number | null,
) {
  const kitId = Number(kitItemId);
  const versionId = bomVersionId != null ? Number(bomVersionId) : ensureDefaultBomVersion(kitId);
  db.prepare(
    'DELETE FROM item_kit_alternatives WHERE kit_item_id = ? AND bom_version_id = ? AND component_item_id = ? AND alt_item_id = ?',
  ).run(kitId, versionId, Number(componentItemId), Number(altItemId));
  return listKitComponents(kitId, versionId);
}

export function resolveKitBomLines(
  kitItemId: number,
  kitQty: number,
  opts: {
    overrides?: Record<string | number, number>;
    autoAlt?: boolean;
    locationId?: number | null;
    bom_version_id?: number | null;
  } = {},
) {
  const n = Math.max(0, Number(kitQty) || 0);
  const bom = listKitComponents(kitItemId, opts.bom_version_id);
  const overrides = opts.overrides || {};
  return bom.map((row) => {
    const primaryId = Number(row.id);
    const scrap = Number(row.scrap_pct) || 0;
    let useId = primaryId;
    let factor = 1;
    let usedAlt: any = null;
    const forced = Number(overrides[primaryId] || overrides[String(primaryId)] || 0);
    if (forced && forced !== primaryId) {
      const alt = (row.alternatives || []).find((a: any) => Number(a.id) === forced);
      if (!alt) throw new Error(`Заменитель #${forced} не задан для компонента «${row.name}»`);
      useId = Number(alt.id);
      factor = Number(alt.quantity_factor) || 1;
      usedAlt = alt;
    } else if (opts.autoAlt && opts.locationId) {
      const need = kitComponentDemandQty(Number(row.quantity) * n, scrap, 1);
      const onHand = Number(
        (db.prepare('SELECT COALESCE(SUM(quantity),0) AS q FROM inventory WHERE item_id = ? AND location_id = ?')
          .get(primaryId, Number(opts.locationId)) as any)?.q || 0,
      );
      if (onHand + 1e-9 < need) {
        for (const alt of row.alternatives || []) {
          const altNeed = kitComponentDemandQty(Number(row.quantity) * n, scrap, Number(alt.quantity_factor) || 1);
          const altHand = Number(
            (db.prepare('SELECT COALESCE(SUM(quantity),0) AS q FROM inventory WHERE item_id = ? AND location_id = ?')
              .get(Number(alt.id), Number(opts.locationId)) as any)?.q || 0,
          );
          if (altHand + 1e-9 >= altNeed) {
            useId = Number(alt.id);
            factor = Number(alt.quantity_factor) || 1;
            usedAlt = alt;
            break;
          }
        }
      }
    }
    const qty = kitComponentDemandQty(Number(row.quantity) * n, scrap, factor);
    const name = usedAlt?.name || row.name;
    return {
      primary_id: primaryId,
      item_id: useId,
      name,
      quantity: qty,
      scrap_pct: scrap,
      alt: usedAlt ? { id: Number(usedAlt.id), name: usedAlt.name, quantity_factor: factor } : null,
    };
  });
}

export function listProjectOperations(projectId: number) {
  return db.prepare(`
    SELECT * FROM project_operations
    WHERE project_id = ?
    ORDER BY sort_order, id
  `).all(Number(projectId)) as any[];
}

export function addProjectOperation(
  projectId: number,
  title: string,
  opts: { norm_minutes?: number; tech_op_id?: number | null } = {},
) {
  const text = String(title || '').trim();
  if (!text) throw new Error('Укажите название операции');
  const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(Number(projectId));
  if (!project) throw new Error('Заказ-наряд не найден');
  const maxOrder = Number(
    (db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS m FROM project_operations WHERE project_id = ?')
      .get(Number(projectId)) as any)?.m || 0,
  );
  const result = db.prepare(
    'INSERT INTO project_operations (project_id, sort_order, title, norm_minutes, tech_op_id) VALUES (?, ?, ?, ?, ?)',
  ).run(
    Number(projectId),
    maxOrder + 1,
    text,
    Math.max(0, Number(opts.norm_minutes) || 0),
    opts.tech_op_id != null ? Number(opts.tech_op_id) : null,
  );
  return listProjectOperations(Number(projectId)).find((row) => Number(row.id) === Number(result.lastInsertRowid))
    || listProjectOperations(Number(projectId));
}

export function listTechOperations(kitItemId: number, bomVersionId?: number | null) {
  const kitId = Number(kitItemId);
  const versionId = bomVersionId != null ? Number(bomVersionId) : ensureDefaultBomVersion(kitId);
  return db.prepare(`
    SELECT * FROM item_tech_operations
    WHERE kit_item_id = ? AND (bom_version_id = ? OR bom_version_id IS NULL)
    ORDER BY sort_order, id
  `).all(kitId, versionId) as any[];
}

export function saveTechOperation(data: {
  id?: number;
  kit_item_id: number;
  bom_version_id?: number | null;
  title: string;
  norm_minutes?: number;
  workplace?: string | null;
  note?: string | null;
  sort_order?: number;
}) {
  const kitId = Number(data.kit_item_id);
  const title = String(data.title || '').trim();
  if (!kitId || !title) throw new Error('Укажите комплект и название операции');
  const versionId = data.bom_version_id != null ? Number(data.bom_version_id) : ensureDefaultBomVersion(kitId);
  const norm = Math.max(0, Number(data.norm_minutes) || 0);
  const workplace = String(data.workplace || '').trim() || null;
  const note = String(data.note || '').trim() || null;
  const id = data.id ? Number(data.id) : 0;
  if (id) {
    db.prepare(`
      UPDATE item_tech_operations SET
        title = ?, norm_minutes = ?, workplace = ?, note = ?,
        sort_order = COALESCE(?, sort_order), bom_version_id = ?
      WHERE id = ? AND kit_item_id = ?
    `).run(
      title, norm, workplace, note,
      data.sort_order != null ? Number(data.sort_order) : null,
      versionId, id, kitId,
    );
    return listTechOperations(kitId, versionId).find((r) => Number(r.id) === id);
  }
  const sort = data.sort_order != null
    ? Number(data.sort_order)
    : Number((db.prepare(
      'SELECT COALESCE(MAX(sort_order), 0) AS m FROM item_tech_operations WHERE kit_item_id = ? AND bom_version_id = ?',
    ).get(kitId, versionId) as any)?.m || 0) + 1;
  const result = db.prepare(`
    INSERT INTO item_tech_operations (kit_item_id, bom_version_id, sort_order, title, norm_minutes, workplace, note)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(kitId, versionId, sort, title, norm, workplace, note);
  return listTechOperations(kitId, versionId).find((r) => Number(r.id) === Number(result.lastInsertRowid));
}

export function deleteTechOperation(id: number) {
  const row = db.prepare('SELECT kit_item_id, bom_version_id FROM item_tech_operations WHERE id = ?').get(Number(id)) as any;
  if (!row) return [];
  db.prepare('DELETE FROM item_tech_operations WHERE id = ?').run(Number(id));
  return listTechOperations(Number(row.kit_item_id), row.bom_version_id);
}

export function applyTechOpsToProject(projectId: number, kitItemId?: number | null, bomVersionId?: number | null) {
  const pid = Number(projectId);
  const project = db.prepare('SELECT id, result_item_id FROM projects WHERE id = ?').get(pid) as any;
  if (!project) throw new Error('Заказ-наряд не найден');
  const kitId = kitItemId != null ? Number(kitItemId) : Number(project.result_item_id);
  if (!kitId) throw new Error('Укажите изделие (ГП) со спецификацией');
  const ops = listTechOperations(kitId, bomVersionId);
  if (!ops.length) throw new Error('У спецификации нет техопераций');
  const existing = listProjectOperations(pid);
  const have = new Set(existing.map((o) => Number(o.tech_op_id)).filter(Boolean));
  for (const op of ops) {
    if (have.has(Number(op.id))) continue;
    addProjectOperation(pid, op.title, { norm_minutes: op.norm_minutes, tech_op_id: op.id });
  }
  return listProjectOperations(pid);
}

export function setProjectOperationDone(operationId: number, done: boolean, doneBy?: string | null) {
  const row = db.prepare('SELECT * FROM project_operations WHERE id = ?').get(Number(operationId)) as any;
  if (!row) throw new Error('Операция не найдена');
  db.prepare(`
    UPDATE project_operations SET
      is_done = ?,
      done_at = CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE NULL END,
      done_by = CASE WHEN ? THEN ? ELSE NULL END
    WHERE id = ?
  `).run(done ? 1 : 0, done ? 1 : 0, done ? 1 : 0, doneBy || null, Number(operationId));
  return listProjectOperations(Number(row.project_id));
}

export function removeProjectOperation(operationId: number) {
  const row = db.prepare('SELECT project_id FROM project_operations WHERE id = ?').get(Number(operationId)) as any;
  if (!row) throw new Error('Операция не найдена');
  db.prepare('DELETE FROM project_operations WHERE id = ?').run(Number(operationId));
  return listProjectOperations(Number(row.project_id));
}

export function computeProjectPlannedCost(projectId: number): number {
  const rows = db.prepare(`
    SELECT pi.quantity * p.build_quantity AS qty, i.cost_price, i.package_qty, i.price_basis
    FROM project_items pi
    JOIN projects p ON p.id = pi.project_id
    JOIN items i ON i.id = pi.item_id
    WHERE pi.project_id = ?
  `).all(Number(projectId)) as any[];
  let total = 0;
  for (const row of rows) {
    const line = moneyQty(row.qty, row.cost_price, row);
    if (line != null) total += line;
  }
  return roundMoney(total, 4);
}

export function computeProjectWipValue(projectId: number): number {
  const rows = db.prepare(`
    SELECT pr.quantity AS qty, i.cost_price, i.package_qty, i.price_basis
    FROM project_reservations pr
    JOIN items i ON i.id = pr.item_id
    WHERE pr.project_id = ?
  `).all(Number(projectId)) as any[];
  let total = 0;
  for (const row of rows) {
    const line = moneyQty(row.qty, row.cost_price, row);
    if (line != null) total += line;
  }
  return roundMoney(total, 4);
}

export function computeProjectActualCostFromReservations(projectId: number): number {
  const rows = db.prepare(`
    SELECT pr.item_id, pr.location_id, pr.quantity AS qty,
      i.cost_price, i.package_qty, i.price_basis
    FROM project_reservations pr
    JOIN items i ON i.id = pr.item_id
    WHERE pr.project_id = ?
  `).all(Number(projectId)) as any[];
  let total = 0;
  for (const row of rows) {

    const lots = db.prepare(`
      SELECT inv.quantity, l.unit_cost
      FROM inventory inv
      LEFT JOIN lots l ON l.id = inv.lot_id AND inv.lot_id != 0
      WHERE inv.item_id = ? AND inv.location_id = ? AND inv.quantity > 0
      ORDER BY COALESCE(l.expiry_date, '9999-12-31'), COALESCE(inv.lot_id, 0)
    `).all(Number(row.item_id), Number(row.location_id)) as any[];
    let remaining = Number(row.qty) || 0;
    if (lots.length) {
      for (const lot of lots) {
        if (remaining <= 0) break;
        const take = Math.min(remaining, Number(lot.quantity) || 0);
        const unit = lot.unit_cost != null && Number.isFinite(Number(lot.unit_cost))
          ? Number(lot.unit_cost)
          : (toUnitPrice(row.cost_price, row) || 0);
        total += take * unit;
        remaining -= take;
      }
    }
    if (remaining > 0) {
      const unit = toUnitPrice(row.cost_price, row) || 0;
      total += remaining * unit;
    }
  }
  return roundMoney(total, 4);
}

export function refreshProjectCostFields(projectId: number, opts: { setActual?: number | null; clearWip?: boolean } = {}) {
  const project = db.prepare('SELECT status FROM projects WHERE id = ?').get(Number(projectId)) as any;
  if (!project) return null;
  const planned = computeProjectPlannedCost(Number(projectId));
  const holding = ['reserved', 'picking', 'picked', 'assembly'].includes(String(project.status));
  const wip = opts.clearWip ? 0 : (holding ? computeProjectWipValue(Number(projectId)) : 0);
  const actual = opts.setActual !== undefined
    ? opts.setActual
    : ((db.prepare('SELECT actual_cost FROM projects WHERE id = ?').get(Number(projectId)) as any)?.actual_cost ?? null);
  db.prepare(`
    UPDATE projects SET planned_cost = ?, wip_value = ?, actual_cost = ? WHERE id = ?
  `).run(planned, wip, actual, Number(projectId));
  return {
    planned_cost: planned,
    wip_value: wip,
    actual_cost: actual,
    variance: actual != null ? roundMoney(Number(actual) - planned, 4) : null,
  };
}

export function applyFinishedGoodCost(resultItemId: number, buildQty: number, actualCost: number) {
  const item = db.prepare('SELECT id, cost_price, package_qty, price_basis FROM items WHERE id = ?').get(Number(resultItemId)) as any;
  if (!item || !(buildQty > 0)) return;
  const unit = roundMoney(actualCost / buildQty, 6);
  const cardPrice = toPackagePrice(unit, item);
  if (cardPrice == null || !Number.isFinite(cardPrice)) return;
  db.prepare('UPDATE items SET cost_price = ? WHERE id = ?').run(cardPrice, Number(resultItemId));
}

export function summarizeOrgWip() {
  const row = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN status IN ('reserved','picking','picked','assembly') THEN COALESCE(wip_value, 0) ELSE 0 END), 0) AS wip_total,
      COALESCE(SUM(CASE WHEN status IN ('reserved','picking','picked','assembly') THEN 1 ELSE 0 END), 0) AS wip_orders,
      COALESCE(SUM(CASE WHEN status IN ('consumed','finished','completed') THEN COALESCE(actual_cost, 0) ELSE 0 END), 0) AS actual_total,
      COALESCE(SUM(COALESCE(planned_cost, 0)), 0) AS planned_total
    FROM projects
  `).get() as any;
  return {
    wip_total: roundMoney(Number(row?.wip_total) || 0, 2),
    wip_orders: Number(row?.wip_orders) || 0,
    actual_total: roundMoney(Number(row?.actual_total) || 0, 2),
    planned_total: roundMoney(Number(row?.planned_total) || 0, 2),
  };
}

export function assignProject(projectId: number, data: any = {}) {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(Number(projectId)) as any;
  if (!project) throw new Error('Заказ-наряд не найден');
  const assigneeUserId = data.assignee_user_id === undefined
    ? project.assignee_user_id
    : (data.assignee_user_id == null || data.assignee_user_id === '' ? null : Number(data.assignee_user_id));
  const assigneeName = data.assignee_name === undefined
    ? project.assignee_name
    : (String(data.assignee_name || '').trim() || null);
  const plannedStart = data.planned_start === undefined
    ? project.planned_start
    : (String(data.planned_start || '').trim().slice(0, 10) || null);
  const dueDate = data.due_date === undefined
    ? project.due_date
    : (String(data.due_date || '').trim().slice(0, 10) || null);
  const controlNote = data.control_note === undefined
    ? project.control_note
    : (String(data.control_note || '').trim() || null);
  db.prepare(`
    UPDATE projects SET
      assignee_user_id = ?,
      assignee_name = ?,
      planned_start = ?,
      due_date = ?,
      control_note = ?
    WHERE id = ?
  `).run(assigneeUserId, assigneeName, plannedStart, dueDate, controlNote, Number(projectId));
  return db.prepare('SELECT * FROM projects WHERE id = ?').get(Number(projectId)) as any;
}

export function resolveUnpackComponents(
  kitItemId: number,
  packQty: number,
  contentQtyOverride?: number | null,
) {
  const bom = listKitComponents(kitItemId);
  if (!bom.length) throw new Error('У упаковки не задан состав — добавьте компоненты');
  const packN = Math.max(0, Number(packQty) || 0);
  if (!(packN > 0)) {
    return { components: [] as Array<{ id: number; name: string; quantity: number }>, contentQty: 0, updateBomQty: null as number | null };
  }
  const bomTotal = bom.reduce((s, c) => s + Number(c.quantity || 0), 0);
  const override = contentQtyOverride != null && Number(contentQtyOverride) > 0
    ? Number(contentQtyOverride)
    : null;

  if (bom.length === 1) {
    const piecesPerPack = override ?? (Number(bom[0].quantity) || 1);
    return {
      contentQty: piecesPerPack,
      components: [{ id: Number(bom[0].id), name: String(bom[0].name || ''), quantity: piecesPerPack * packN }],
      updateBomQty: override != null && Math.abs(override - Number(bom[0].quantity || 0)) > 1e-9 ? override : null,
    };
  }

  const scale = override != null && bomTotal > 0 ? override / bomTotal : 1;
  const contentQty = override ?? bomTotal;
  return {
    contentQty,
    components: bom.map((c) => ({
      id: Number(c.id),
      name: String(c.name || ''),
      quantity: Number(c.quantity || 0) * scale * packN,
    })),
    updateBomQty: null as number | null,
  };
}

export function createPackFromItem(componentId: number, data: {
  quantity: number;
  sale_price?: number | null;
  cost_price?: number | null;
  name?: string | null;
  sku?: string | null;
  item_type?: 'pack' | 'set' | 'kit';
}) {
  const parent = db.prepare('SELECT * FROM items WHERE id = ?').get(Number(componentId)) as any;
  if (!parent) throw new Error('Базовый товар не найден');
  if (String(parent.item_type || 'product') === 'service') throw new Error('Из услуги нельзя сделать упаковку');
  if (isBomItemType(parent.item_type)) throw new Error('Выберите обычный товар (не упаковку/набор/комплект)');

  const qty = normalizeQty(data.quantity, 3);
  if (!(qty > 0)) throw new Error('Укажите сколько единиц входит в упаковку');
  const kind = ['pack', 'set', 'kit'].includes(String(data.item_type || ''))
    ? String(data.item_type)
    : 'pack';
  const kindRu = kind === 'set' ? 'набор' : kind === 'kit' ? 'комплект' : 'уп.';
  const label = String(data.name || '').trim() || `${parent.name} · ${kindRu}. ${qty}`;
  let sku = String(data.sku || '').trim();
  if (!sku) {
    const base = String(parent.sku || '').trim() || nextCatalogCode('items');
    sku = `${base}-P${Math.round(qty)}`;
    let n = 2;
    while (db.prepare('SELECT 1 FROM items WHERE upper(trim(sku)) = upper(trim(?)) LIMIT 1').get(sku)) {
      sku = `${base}-P${Math.round(qty)}-${n}`;
      n += 1;
      if (n > 99) {
        sku = nextCatalogCode('items');
        break;
      }
    }
  } else if (db.prepare('SELECT 1 FROM items WHERE upper(trim(sku)) = upper(trim(?)) LIMIT 1').get(sku)) {
    throw new Error(`Артикул «${sku}» уже используется`);
  }

  const sale = data.sale_price !== undefined && data.sale_price !== null && data.sale_price !== ('' as any)
    ? Number(data.sale_price)
    : null;
  const cost = data.cost_price !== undefined && data.cost_price !== null && data.cost_price !== ('' as any)
    ? Number(data.cost_price)
    : (parent.cost_price != null && Number.isFinite(Number(parent.cost_price))
      ? Math.round(Number(parent.cost_price) * qty * 10000) / 10000
      : null);
  if (sale != null && (!Number.isFinite(sale) || sale < 0)) throw new Error('Цена упаковки должна быть числом ≥ 0');
  if (cost != null && (!Number.isFinite(cost) || cost < 0)) throw new Error('Учётная цена должна быть числом ≥ 0');

  const create = db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO items (
        barcode, name, sku, category, min_stock, max_stock, reorder_point, description, print_name, unit_id,
        sale_price, cost_price, origin, manufacturer, brand, package_qty, price_basis, weight_g, storage_note,
        supplier_sku, purchase_url, lead_time_days, moq, pack_multiple, item_type, track_lots, track_serials, lot_policy
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unit', ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 'fifo')
    `).run(
      null,
      label,
      sku,
      parent.category,
      Math.max(0, Math.ceil((Number(parent.min_stock) || 0) / qty)),
      parent.max_stock != null ? Math.max(0, Math.ceil(Number(parent.max_stock) / qty)) : null,
      parent.reorder_point != null ? Math.max(0, Math.ceil(Number(parent.reorder_point) / qty)) : null,
      parent.description,
      label,
      parent.unit_id,
      sale,
      cost,
      parent.origin,
      parent.manufacturer,
      parent.brand,
      qty,
      parent.weight_g != null ? Number(parent.weight_g) * qty : null,
      parent.storage_note,
      parent.supplier_sku,
      parent.purchase_url,
      parent.lead_time_days,
      parent.moq,
      parent.pack_multiple,
      kind,
    );
    const id = Number(result.lastInsertRowid);
    upsertKitComponent(id, parent.id, qty);
    return id;
  });
  const id = create();
  return db.prepare('SELECT * FROM items WHERE id = ?').get(id) as any;
}

export function normalizeQty(value: any, decimalPlaces = 0): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  const places = Math.min(6, Math.max(0, Math.floor(Number(decimalPlaces) || 0)));
  const factor = 10 ** places;

  const rounded = Math.round((n + Number.EPSILON) * factor) / factor;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function decimalPlacesForItem(itemId: number): number {
  const row = db.prepare(`
    SELECT COALESCE(u.decimal_places, 0) AS dp
    FROM items i LEFT JOIN units u ON u.id = i.unit_id
    WHERE i.id = ?
  `).get(Number(itemId)) as any;
  return Math.min(6, Math.max(0, Number(row?.dp) || 0));
}

export function normalizeQtyForItem(itemId: number, value: any): number {
  return normalizeQty(value, decimalPlacesForItem(itemId));
}

export function normalizeLotId(lotId?: number | null): number {
  const n = Number(lotId);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

export function getStockAtLocation(itemId: number, locationId: number, lotId?: number | null): number {
  const id = Number(itemId);
  const loc = Number(locationId);
  if (lotId === undefined) {
    return Number((db.prepare(
      'SELECT COALESCE(SUM(quantity), 0) AS q FROM inventory WHERE item_id = ? AND location_id = ?',
    ).get(id, loc) as any)?.q || 0);
  }
  const lid = normalizeLotId(lotId);
  return Number((db.prepare(
    'SELECT COALESCE(quantity, 0) AS q FROM inventory WHERE item_id = ? AND location_id = ? AND lot_id = ?',
  ).get(id, loc, lid) as any)?.q || 0);
}

export function setStockAtLocation(itemId: number, locationId: number, quantity: number, lotId: number | null = 0) {
  const lid = normalizeLotId(lotId);
  const qty = normalizeQtyForItem(itemId, quantity);
  if (qty <= 0) {
    db.prepare('DELETE FROM inventory WHERE item_id = ? AND location_id = ? AND lot_id = ?').run(Number(itemId), Number(locationId), lid);
    return 0;
  }
  db.prepare(`INSERT INTO inventory (item_id, location_id, lot_id, quantity) VALUES (?, ?, ?, ?)
    ON CONFLICT(item_id, location_id, lot_id) DO UPDATE SET quantity = excluded.quantity`)
    .run(Number(itemId), Number(locationId), lid, qty);
  return qty;
}

export function addStockAtLocation(itemId: number, locationId: number, delta: number, lotId: number | null = 0) {
  const lid = normalizeLotId(lotId);
  const current = getStockAtLocation(itemId, locationId, lid);
  const next = normalizeQtyForItem(itemId, current + Number(delta || 0));
  if (next < 0) throw new Error(`Отрицательный остаток по товару #${itemId}`);
  return setStockAtLocation(itemId, locationId, next, lid);
}

export function findOrCreateLot(input: {
  item_id: number;
  lot_no: string;
  expiry_date?: string | null;
  unit_cost?: number | null;
  note?: string | null;
}) {
  const itemId = Number(input.item_id);
  const lotNo = String(input.lot_no || '').trim();
  if (!itemId) throw new Error('Товар не найден');
  if (!lotNo) throw new Error('Укажите номер партии');
  if (lotNo.length > 64) throw new Error('Номер партии слишком длинный');
  const expiry = String(input.expiry_date || '').trim().slice(0, 10) || null;
  const existing = db.prepare('SELECT * FROM lots WHERE item_id = ? AND lot_no = ?').get(itemId, lotNo) as any;
  if (existing) {
    if (expiry && !existing.expiry_date) {
      db.prepare('UPDATE lots SET expiry_date = ? WHERE id = ?').run(expiry, existing.id);
      existing.expiry_date = expiry;
    }
    if (input.unit_cost != null && Number.isFinite(Number(input.unit_cost)) && existing.unit_cost == null) {
      db.prepare('UPDATE lots SET unit_cost = ? WHERE id = ?').run(Number(input.unit_cost), existing.id);
      existing.unit_cost = Number(input.unit_cost);
    }
    return existing;
  }
  const result = db.prepare(`
    INSERT INTO lots (item_id, lot_no, expiry_date, unit_cost, note)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    itemId,
    lotNo,
    expiry,
    input.unit_cost != null && Number.isFinite(Number(input.unit_cost)) ? Number(input.unit_cost) : null,
    String(input.note || '').trim() || null,
  );
  return db.prepare('SELECT * FROM lots WHERE id = ?').get(result.lastInsertRowid) as any;
}

export function listItemLots(itemId: number) {
  return db.prepare(`
    SELECT l.*,
      COALESCE((SELECT SUM(inv.quantity) FROM inventory inv WHERE inv.lot_id = l.id), 0) AS on_hand
    FROM lots l
    WHERE l.item_id = ?
    ORDER BY l.expiry_date IS NULL, l.expiry_date, l.received_at, l.id
  `).all(Number(itemId)) as any[];
}

export function listExpiringLots(withinDays = 30, limit = 80) {
  const days = Math.min(365, Math.max(1, Number(withinDays) || 30));
  const cap = Math.min(200, Math.max(1, Number(limit) || 80));
  return db.prepare(`
    SELECT
      l.id AS lot_id,
      l.lot_no,
      l.expiry_date,
      l.item_id,
      i.name AS item_name,
      i.sku,
      i.barcode,
      loc.id AS location_id,
      loc.name AS location_name,
      inv.quantity AS on_hand,
      CAST(julianday(l.expiry_date) - julianday('now') AS INTEGER) AS days_left,
      CASE
        WHEN date(l.expiry_date) < date('now') THEN 'expired'
        ELSE 'expiring'
      END AS status
    FROM inventory inv
    JOIN lots l ON l.id = inv.lot_id
    JOIN items i ON i.id = inv.item_id
    JOIN locations loc ON loc.id = inv.location_id
    WHERE inv.quantity > 0
      AND inv.lot_id IS NOT NULL AND inv.lot_id != 0
      AND l.expiry_date IS NOT NULL AND TRIM(l.expiry_date) != ''
      AND date(l.expiry_date) <= date('now', '+' || ? || ' days')
    ORDER BY
      CASE WHEN date(l.expiry_date) < date('now') THEN 0 ELSE 1 END,
      l.expiry_date ASC,
      i.name COLLATE NOCASE
    LIMIT ?
  `).all(days, cap) as any[];
}

export function getExpiryWarnDays(): number {
  try {
    const raw = (db.prepare("SELECT value FROM schema_meta WHERE key = 'setting:stock.expiry_warn_days'").get() as any)?.value;
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 1) return Math.min(365, Math.max(1, Math.round(n)));
  } catch {  }
  return 30;
}

export function getReserveStaleDays(): number {
  try {
    const raw = (db.prepare("SELECT value FROM schema_meta WHERE key = 'setting:stock.reserve_stale_days'").get() as any)?.value;
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 1) return Math.min(365, Math.max(1, Math.round(n)));
  } catch {  }
  return 7;
}

export function isReserveAutoReleaseEnabled(): boolean {
  try {
    const raw = (db.prepare("SELECT value FROM schema_meta WHERE key = 'setting:stock.reserve_auto_release'").get() as any)?.value;
    return String(raw || 'off') === 'on';
  } catch {
    return false;
  }
}

const DEFAULT_DOC_STATUS_LABELS = { draft: 'Черновик', posted: 'Проведён', cancelled: 'Отменён' } as const;

export type DocWorkflowExtra = {
  code: string;
  label: string;
  maps_to: 'draft' | 'posted' | 'cancelled';
};

export function getDocStatusLabels(): { draft: string; posted: string; cancelled: string } {
  try {
    const raw = (db.prepare("SELECT value FROM schema_meta WHERE key = 'setting:docs.status_labels'").get() as any)?.value;
    if (raw) {
      const parsed = JSON.parse(String(raw));
      return {
        draft: String(parsed.draft || '').trim() || DEFAULT_DOC_STATUS_LABELS.draft,
        posted: String(parsed.posted || '').trim() || DEFAULT_DOC_STATUS_LABELS.posted,
        cancelled: String(parsed.cancelled || '').trim() || DEFAULT_DOC_STATUS_LABELS.cancelled,
      };
    }
  } catch {  }
  return { ...DEFAULT_DOC_STATUS_LABELS };
}

export function getDocWorkflowExtras(): DocWorkflowExtra[] {
  try {
    const raw = (db.prepare("SELECT value FROM schema_meta WHERE key = 'setting:docs.workflow_extras'").get() as any)?.value;
    if (!raw) return [];
    const parsed = JSON.parse(String(raw));
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((row: any) => {
        const code = String(row?.code || '')
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9_а-яё]+/gi, '_')
          .replace(/^_+|_+$/g, '')
          .slice(0, 32);
        const label = String(row?.label || '').trim().slice(0, 48);
        const maps = String(row?.maps_to || 'draft');
        const maps_to = (maps === 'posted' || maps === 'cancelled' ? maps : 'draft') as DocWorkflowExtra['maps_to'];
        if (!code || !label || code === 'draft' || code === 'posted' || code === 'cancelled') return null;
        return { code, label, maps_to };
      })
      .filter(Boolean) as DocWorkflowExtra[];
  } catch {
    return [];
  }
}

export function displayDocumentStatus(doc: { status?: string; workflow_status?: string | null }) {
  const system = String(doc?.status || 'draft') as keyof typeof DEFAULT_DOC_STATUS_LABELS;
  const labels = getDocStatusLabels();
  const wf = String(doc?.workflow_status || '').trim();
  if (wf) {
    const extra = getDocWorkflowExtras().find((e) => e.code === wf);
    if (extra) return { code: wf, label: extra.label, system: extra.maps_to, is_workflow: true };
  }
  return {
    code: system,
    label: labels[system] || labels.draft,
    system: (system === 'posted' || system === 'cancelled' ? system : 'draft') as DocWorkflowExtra['maps_to'],
    is_workflow: false,
  };
}

export function setDocumentWorkflowStatus(docId: number, workflowCode: string | null) {
  const doc = db.prepare('SELECT id, status FROM documents WHERE id = ?').get(Number(docId)) as any;
  if (!doc) throw new Error('Документ не найден');
  const code = workflowCode == null || String(workflowCode).trim() === ''
    ? null
    : String(workflowCode).trim().toLowerCase();
  if (code) {
    const extra = getDocWorkflowExtras().find((e) => e.code === code);
    if (!extra) throw new Error('Неизвестный workflow-статус');
    if (String(doc.status) !== extra.maps_to && String(doc.status) === 'posted' && extra.maps_to !== 'posted') {
      throw new Error('Сначала отмените проведение, чтобы сменить workflow с проведённого документа');
    }

    if (String(doc.status) !== extra.maps_to) {
      throw new Error(`Статус «${extra.label}» применим только к документам в состоянии «${extra.maps_to}»`);
    }
  }
  db.prepare('UPDATE documents SET workflow_status = ? WHERE id = ?').run(code, Number(docId));
  return getDocumentById(Number(docId));
}

const CUSTOM_FIELD_TYPES = new Set(['text', 'number', 'bool', 'date', 'select', 'formula']);

const ITEM_FORMULA_FIELDS = new Set([
  'cost_price', 'sale_price', 'sell_price', 'min_stock', 'max_stock', 'reorder_point',
  'package_qty', 'lead_time_days', 'weight_g', 'moq', 'pack_multiple',
  'on_hand', 'available', 'reserved', 'content_qty',
]);

export function evaluateCustomFormula(formula: string, vars: Record<string, number>): number {
  const src = String(formula || '').trim();
  if (!src) throw new Error('Пустая формула');
  let i = 0;
  const peek = () => src[i] || '';
  const take = () => src[i++] || '';
  const skip = () => { while (/\s/.test(peek())) i += 1; };

  function parseNumber() {
    skip();
    let s = '';
    if (peek() === '+' || peek() === '-') s += take();
    while (/\d/.test(peek()) || peek() === '.' || peek() === ',') {
      const ch = take();
      s += ch === ',' ? '.' : ch;
    }
    const n = Number(s);
    if (!Number.isFinite(n)) throw new Error(`Число: «${s}»`);
    return n;
  }

  function parseIdent(): string {
    skip();
    let s = '';
    while (/[A-Za-zА-Яа-яЁё0-9_.]/.test(peek())) s += take();
    return s;
  }

  function parsePrimary(): number {
    skip();
    if (peek() === '(') {
      take();
      const v = parseExpr();
      skip();
      if (peek() !== ')') throw new Error('Ожидалась «)»');
      take();
      return v;
    }
    if (peek() === '{') {
      take();
      const name = parseIdent();
      skip();
      if (peek() !== '}') throw new Error('Ожидалась «}»');
      take();
      const key = name.toLowerCase();
      if (!(key in vars)) throw new Error(`Нет переменной «${name}»`);
      return Number(vars[key]) || 0;
    }
    if (/\d/.test(peek()) || ((peek() === '+' || peek() === '-') && /\d/.test(src[i + 1] || ''))) {
      return parseNumber();
    }
    const ident = parseIdent();
    if (!ident) throw new Error('Ожидалось значение');
    skip();
    if (peek() === '(') {
      take();
      const args: number[] = [];
      skip();
      if (peek() !== ')') {
        args.push(parseExpr());
        skip();
        while (peek() === ',') {
          take();
          args.push(parseExpr());
          skip();
        }
      }
      if (peek() !== ')') throw new Error('Ожидалась «)» у функции');
      take();
      const fn = ident.toLowerCase();
      if (fn === 'min') return Math.min(...args);
      if (fn === 'max') return Math.max(...args);
      if (fn === 'abs') return Math.abs(args[0] ?? 0);
      if (fn === 'round') {
        const digits = Math.min(6, Math.max(0, Math.floor(args[1] ?? 0)));
        const p = 10 ** digits;
        return Math.round((args[0] ?? 0) * p) / p;
      }
      throw new Error(`Неизвестная функция «${ident}»`);
    }
    const key = ident.toLowerCase();
    if (!(key in vars)) throw new Error(`Нет переменной «${ident}»`);
    return Number(vars[key]) || 0;
  }

  function parseUnary(): number {
    skip();
    if (peek() === '-') { take(); return -parseUnary(); }
    if (peek() === '+') { take(); return parseUnary(); }
    return parsePrimary();
  }

  function parseTerm(): number {
    let v = parseUnary();
    skip();
    while (peek() === '*' || peek() === '/') {
      const op = take();
      const r = parseUnary();
      v = op === '*' ? v * r : (r === 0 ? (() => { throw new Error('Деление на ноль'); })() : v / r);
      skip();
    }
    return v;
  }

  function parseExpr(): number {
    let v = parseTerm();
    skip();
    while (peek() === '+' || peek() === '-') {
      const op = take();
      const r = parseTerm();
      v = op === '+' ? v + r : v - r;
      skip();
    }
    return v;
  }

  const result = parseExpr();
  skip();
  if (i < src.length) throw new Error(`Лишний текст в формуле: «${src.slice(i)}»`);
  if (!Number.isFinite(result)) throw new Error('Результат не число');
  return Math.round(result * 1e6) / 1e6;
}

export function buildItemFormulaVars(item: any, customByKey: Record<string, any> = {}) {
  const vars: Record<string, number> = {};
  for (const key of ITEM_FORMULA_FIELDS) {
    const n = Number(item?.[key]);
    vars[key] = Number.isFinite(n) ? n : 0;
  }

  if (!Number.isFinite(Number(item?.sell_price)) && Number.isFinite(Number(item?.sale_price))) {
    vars.sell_price = Number(item.sale_price) || 0;
  }
  if (!Number.isFinite(Number(item?.sale_price)) && Number.isFinite(Number(item?.sell_price))) {
    vars.sale_price = Number(item.sell_price) || 0;
  }
  for (const [key, raw] of Object.entries(customByKey || {})) {
    const k = String(key || '').toLowerCase();
    if (!k) continue;
    const n = Number(raw);
    vars[k] = Number.isFinite(n) ? n : 0;
    vars[`cf.${k}`] = vars[k];
  }
  return vars;
}

export function computeItemFormulaFields(item: any, customByKey: Record<string, any> = {}) {
  const defs = listCustomFieldDefs('item', false).filter((d) => d.field_type === 'formula' && String(d.formula || '').trim());
  const values = { ...customByKey };
  const out: Record<string, string> = {};

  for (let pass = 0; pass < defs.length + 1; pass += 1) {
    let changed = false;
    const vars = buildItemFormulaVars(item, values);
    for (const def of defs) {
      try {
        const n = evaluateCustomFormula(String(def.formula), vars);
        const text = String(n);
        if (values[def.field_key] !== text) {
          values[def.field_key] = text;
          out[def.field_key] = text;
          changed = true;
        }
      } catch {

      }
    }
    if (!changed) break;
  }
  return out;
}

export const CUSTOM_FIELD_ENTITIES = ['item', 'counterparty', 'employee', 'document'] as const;
export type CustomFieldEntity = (typeof CUSTOM_FIELD_ENTITIES)[number];

export function normalizeCustomFieldEntity(raw: any): CustomFieldEntity {
  const v = String(raw || 'item').trim().toLowerCase();
  return (CUSTOM_FIELD_ENTITIES as readonly string[]).includes(v) ? (v as CustomFieldEntity) : 'item';
}

export function listCustomFieldDefs(entity = 'item', includeArchived = false) {
  const ent = normalizeCustomFieldEntity(entity);
  const sql = includeArchived
    ? `SELECT * FROM custom_field_defs WHERE entity = ? ORDER BY sort_order, id`
    : `SELECT * FROM custom_field_defs WHERE entity = ? AND COALESCE(archived, 0) = 0 ORDER BY sort_order, id`;
  return db.prepare(sql).all(ent) as any[];
}

export function listItemCustomValues(itemId: number) {
  const rows = db.prepare(`
    SELECT v.field_id, v.value_text, d.field_key, d.label, d.field_type, d.required, d.options_json, d.sort_order, d.formula
    FROM item_custom_values v
    JOIN custom_field_defs d ON d.id = v.field_id
    WHERE v.item_id = ? AND d.entity = 'item'
    ORDER BY d.sort_order, d.id
  `).all(Number(itemId)) as any[];

  const defs = listCustomFieldDefs('item', false);
  const byKey: Record<string, any> = {};
  for (const row of rows) byKey[row.field_key] = row.value_text;

  for (const def of defs) {
    if (!(def.field_key in byKey)) byKey[def.field_key] = null;
  }

  const item = db.prepare(`SELECT i.*,
    COALESCE((SELECT SUM(inv.quantity) FROM inventory inv WHERE inv.item_id = i.id), 0) AS on_hand,
    COALESCE((SELECT SUM(pr.quantity) FROM project_reservations pr JOIN projects p ON p.id = pr.project_id WHERE pr.item_id = i.id AND p.status IN ('reserved','picking','picked','assembly')), 0) AS reserved
    FROM items i WHERE i.id = ?`).get(Number(itemId)) as any;
  if (item) {
    item.available = Math.max(0, Number(item.on_hand || 0) - Number(item.reserved || 0));
    const computed = computeItemFormulaFields(item, byKey);
    const known = new Map(rows.map((r) => [String(r.field_key), r]));
    for (const def of defs.filter((d) => d.field_type === 'formula')) {
      const value = computed[def.field_key];
      if (value == null) continue;
      const existing = known.get(String(def.field_key));
      if (existing) existing.value_text = value;
      else {
        rows.push({
          field_id: def.id,
          value_text: value,
          field_key: def.field_key,
          label: def.label,
          field_type: def.field_type,
          required: def.required,
          options_json: def.options_json,
          sort_order: def.sort_order,
          formula: def.formula,
        });
      }
    }
    rows.sort((a, b) => (Number(a.sort_order) - Number(b.sort_order)) || (Number(a.field_id) - Number(b.field_id)));
  }
  return rows;
}

function normalizeCustomFieldKey(raw: string) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_а-яё]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
}

export function upsertCustomFieldDef(data: any): any {
  const entity = normalizeCustomFieldEntity(data.entity);
  const label = String(data.label || '').trim();
  if (!label) throw new Error('Укажите название поля');
  let fieldType = CUSTOM_FIELD_TYPES.has(String(data.field_type || '')) ? String(data.field_type) : 'text';

  if (fieldType === 'formula' && entity !== 'item') {
    throw new Error('Тип «Формула» доступен только для товаров');
  }
  let fieldKey = normalizeCustomFieldKey(data.field_key || label);
  if (!fieldKey) fieldKey = `field_${Date.now().toString(36)}`;
  const required = fieldType === 'formula' ? 0 : (data.required ? 1 : 0);
  const sortOrder = Math.max(0, Number(data.sort_order) || 0);
  let optionsJson: string | null = null;
  let formula: string | null = null;
  if (fieldType === 'select') {
    const opts = Array.isArray(data.options)
      ? data.options.map((o: any) => String(o || '').trim()).filter(Boolean)
      : String(data.options_text || data.options_json || '')
        .split(/[\n,;]/)
        .map((o) => o.trim())
        .filter(Boolean);
    if (!opts.length) throw new Error('Для списка укажите хотя бы один вариант');
    optionsJson = JSON.stringify(opts);
  }
  if (fieldType === 'formula') {
    formula = String(data.formula || '').trim();
    if (!formula) throw new Error('Укажите формулу');

    try { evaluateCustomFormula(formula, buildItemFormulaVars({}, {})); }
    catch (e: any) {

      if (/Лишний текст|Ожидалась|Ожидалось|Пустая|Неизвестная функция|Число:/.test(String(e?.message || ''))) {
        throw new Error(`Формула: ${e.message}`);
      }
    }
  }
  const id = data.id ? Number(data.id) : 0;
  if (id) {
    const existing = db.prepare('SELECT * FROM custom_field_defs WHERE id = ?').get(id) as any;
    if (!existing) throw new Error('Поле не найдено');
    db.prepare(`UPDATE custom_field_defs SET label = ?, field_type = ?, required = ?, options_json = ?, sort_order = ?, archived = ?, formula = ?
      WHERE id = ?`).run(label, fieldType, required, optionsJson, sortOrder, data.archived ? 1 : 0, formula, id);
    return db.prepare('SELECT * FROM custom_field_defs WHERE id = ?').get(id) as any;
  }
  try {
    const result = db.prepare(`INSERT INTO custom_field_defs (entity, field_key, label, field_type, required, options_json, sort_order, formula)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(entity, fieldKey, label, fieldType, required, optionsJson, sortOrder, formula);
    return db.prepare('SELECT * FROM custom_field_defs WHERE id = ?').get(result.lastInsertRowid) as any;
  } catch (error: any) {
    if (String(error?.message).includes('UNIQUE')) throw new Error('Поле с таким ключом уже есть');
    throw error;
  }
}

export function archiveCustomFieldDef(id: number) {
  return db.prepare('UPDATE custom_field_defs SET archived = 1 WHERE id = ?').run(Number(id)).changes;
}

export function listCounterpartyCustomValues(counterpartyId: number) {
  const rows = db.prepare(`
    SELECT v.field_id, v.value_text, d.field_key, d.label, d.field_type, d.required, d.options_json, d.sort_order
    FROM counterparty_custom_values v
    JOIN custom_field_defs d ON d.id = v.field_id
    WHERE v.counterparty_id = ? AND d.entity = 'counterparty'
    ORDER BY d.sort_order, d.id
  `).all(Number(counterpartyId)) as any[];
  const defs = listCustomFieldDefs('counterparty', false);
  const known = new Set(rows.map((r) => String(r.field_key)));
  for (const def of defs) {
    if (known.has(String(def.field_key))) continue;
    rows.push({
      field_id: def.id,
      value_text: null,
      field_key: def.field_key,
      label: def.label,
      field_type: def.field_type,
      required: def.required,
      options_json: def.options_json,
      sort_order: def.sort_order,
    });
  }
  rows.sort((a, b) => (Number(a.sort_order) - Number(b.sort_order)) || (Number(a.field_id) - Number(b.field_id)));
  return rows;
}

export function saveCounterpartyCustomValues(
  counterpartyId: number,
  values: Record<string, any> | any[] | null | undefined,
): EntityChangeLine[] {
  const defs = listCustomFieldDefs('counterparty', false);
  if (!defs.length) return [];
  const byKey = new Map(defs.map((d) => [d.field_key, d]));
  const byId = new Map(defs.map((d) => [Number(d.id), d]));
  const incoming = new Map<number, string | null>();

  if (Array.isArray(values)) {
    for (const row of values) {
      const def = byId.get(Number(row.field_id)) || byKey.get(String(row.field_key || ''));
      if (!def) continue;
      incoming.set(Number(def.id), normalizeCustomValue(def, row.value ?? row.value_text));
    }
  } else if (values && typeof values === 'object') {
    for (const [key, value] of Object.entries(values)) {
      const def = byId.get(Number(key)) || byKey.get(key);
      if (!def) continue;
      incoming.set(Number(def.id), normalizeCustomValue(def, value));
    }
  }

  for (const def of defs) {
    if (!def.required) continue;
    const has = incoming.has(Number(def.id));
    const val = has ? incoming.get(Number(def.id)) : null;
    if (!has || val == null || val === '') {
      throw new Error(`Заполните обязательное поле «${def.label}»`);
    }
  }

  const readPrev = db.prepare('SELECT value_text FROM counterparty_custom_values WHERE counterparty_id = ? AND field_id = ?');
  const upsert = db.prepare(`INSERT INTO counterparty_custom_values (counterparty_id, field_id, value_text) VALUES (?, ?, ?)
    ON CONFLICT(counterparty_id, field_id) DO UPDATE SET value_text = excluded.value_text`);
  const clear = db.prepare('DELETE FROM counterparty_custom_values WHERE counterparty_id = ? AND field_id = ?');
  const changes: EntityChangeLine[] = [];
  for (const def of defs) {
    const fieldId = Number(def.id);
    if (!incoming.has(fieldId)) continue;
    const value = incoming.get(fieldId);
    const prev = (readPrev.get(Number(counterpartyId), fieldId) as any)?.value_text ?? null;
    const oldValue = normalizeChangeValue(prev);
    const newValue = normalizeChangeValue(value == null || value === '' ? null : value);
    if (oldValue !== newValue) {
      changes.push({
        field: `cf:${def.field_key}`,
        field_label: String(def.label || def.field_key),
        old_value: oldValue,
        new_value: newValue,
      });
    }
    if (value == null || value === '') clear.run(Number(counterpartyId), fieldId);
    else upsert.run(Number(counterpartyId), fieldId, value);
  }
  return changes;
}

function listEntityCustomValueRows(entity: CustomFieldEntity, table: string, idColumn: string, recordId: number) {
  const rows = db.prepare(`
    SELECT v.field_id, v.value_text, d.field_key, d.label, d.field_type, d.required, d.options_json, d.sort_order
    FROM ${table} v
    JOIN custom_field_defs d ON d.id = v.field_id
    WHERE v.${idColumn} = ? AND d.entity = ?
    ORDER BY d.sort_order, d.id
  `).all(Number(recordId), entity) as any[];
  const defs = listCustomFieldDefs(entity, false);
  const known = new Set(rows.map((r) => String(r.field_key)));
  for (const def of defs) {
    if (known.has(String(def.field_key))) continue;
    rows.push({
      field_id: def.id,
      value_text: null,
      field_key: def.field_key,
      label: def.label,
      field_type: def.field_type,
      required: def.required,
      options_json: def.options_json,
      sort_order: def.sort_order,
    });
  }
  rows.sort((a, b) => (Number(a.sort_order) - Number(b.sort_order)) || (Number(a.field_id) - Number(b.field_id)));
  return rows;
}

function saveEntityCustomValueRows(
  entity: CustomFieldEntity,
  table: string,
  idColumn: string,
  recordId: number,
  values: Record<string, any> | any[] | null | undefined,
): EntityChangeLine[] {
  const defs = listCustomFieldDefs(entity, false);
  if (!defs.length) return [];
  const byKey = new Map(defs.map((d) => [d.field_key, d]));
  const byId = new Map(defs.map((d) => [Number(d.id), d]));
  const incoming = new Map<number, string | null>();

  if (Array.isArray(values)) {
    for (const row of values) {
      const def = byId.get(Number(row.field_id)) || byKey.get(String(row.field_key || ''));
      if (!def) continue;
      incoming.set(Number(def.id), normalizeCustomValue(def, row.value ?? row.value_text));
    }
  } else if (values && typeof values === 'object') {
    for (const [key, value] of Object.entries(values)) {
      const def = byId.get(Number(key)) || byKey.get(key);
      if (!def) continue;
      incoming.set(Number(def.id), normalizeCustomValue(def, value));
    }
  }

  for (const def of defs) {
    if (!def.required) continue;
    const has = incoming.has(Number(def.id));
    const val = has ? incoming.get(Number(def.id)) : null;
    if (!has || val == null || val === '') {
      throw new Error(`Заполните обязательное поле «${def.label}»`);
    }
  }

  const readPrev = db.prepare(`SELECT value_text FROM ${table} WHERE ${idColumn} = ? AND field_id = ?`);
  const upsert = db.prepare(`INSERT INTO ${table} (${idColumn}, field_id, value_text) VALUES (?, ?, ?)
    ON CONFLICT(${idColumn}, field_id) DO UPDATE SET value_text = excluded.value_text`);
  const clear = db.prepare(`DELETE FROM ${table} WHERE ${idColumn} = ? AND field_id = ?`);
  const changes: EntityChangeLine[] = [];
  for (const def of defs) {
    const fieldId = Number(def.id);
    if (!incoming.has(fieldId)) continue;
    const value = incoming.get(fieldId);
    const prev = (readPrev.get(Number(recordId), fieldId) as any)?.value_text ?? null;
    const oldValue = normalizeChangeValue(prev);
    const newValue = normalizeChangeValue(value == null || value === '' ? null : value);
    if (oldValue !== newValue) {
      changes.push({
        field: `cf:${def.field_key}`,
        field_label: String(def.label || def.field_key),
        old_value: oldValue,
        new_value: newValue,
      });
    }
    if (value == null || value === '') clear.run(Number(recordId), fieldId);
    else upsert.run(Number(recordId), fieldId, value);
  }
  return changes;
}

export function listEmployeeCustomValues(employeeId: number) {
  return listEntityCustomValueRows('employee', 'employee_custom_values', 'employee_id', Number(employeeId));
}

export function saveEmployeeCustomValues(
  employeeId: number,
  values: Record<string, any> | any[] | null | undefined,
) {
  return saveEntityCustomValueRows('employee', 'employee_custom_values', 'employee_id', Number(employeeId), values);
}

export function listDocumentCustomValues(documentId: number) {
  return listEntityCustomValueRows('document', 'document_custom_values', 'document_id', Number(documentId));
}

export function saveDocumentCustomValues(
  documentId: number,
  values: Record<string, any> | any[] | null | undefined,
) {
  return saveEntityCustomValueRows('document', 'document_custom_values', 'document_id', Number(documentId), values);
}

export function saveItemCustomValues(itemId: number, values: Record<string, any> | any[] | null | undefined): EntityChangeLine[] {
  const defs = listCustomFieldDefs('item', false);
  const byKey = new Map(defs.map((d) => [d.field_key, d]));
  const byId = new Map(defs.map((d) => [Number(d.id), d]));
  const incoming = new Map<number, string | null>();

  if (Array.isArray(values)) {
    for (const row of values) {
      const def = byId.get(Number(row.field_id)) || byKey.get(String(row.field_key || ''));
      if (!def || def.field_type === 'formula') continue;
      incoming.set(Number(def.id), normalizeCustomValue(def, row.value ?? row.value_text));
    }
  } else if (values && typeof values === 'object') {
    for (const [key, value] of Object.entries(values)) {
      const def = byId.get(Number(key)) || byKey.get(key);
      if (!def || def.field_type === 'formula') continue;
      incoming.set(Number(def.id), normalizeCustomValue(def, value));
    }
  }

  for (const def of defs) {
    if (!def.required || def.field_type === 'formula') continue;
    const has = incoming.has(Number(def.id));
    const val = has ? incoming.get(Number(def.id)) : null;
    if (!has || val == null || val === '') {
      throw new Error(`Заполните обязательное поле «${def.label}»`);
    }
  }

  const readPrev = db.prepare('SELECT value_text FROM item_custom_values WHERE item_id = ? AND field_id = ?');
  const upsert = db.prepare(`INSERT INTO item_custom_values (item_id, field_id, value_text) VALUES (?, ?, ?)
    ON CONFLICT(item_id, field_id) DO UPDATE SET value_text = excluded.value_text`);
  const clear = db.prepare('DELETE FROM item_custom_values WHERE item_id = ? AND field_id = ?');
  const changes: EntityChangeLine[] = [];
  for (const def of defs) {
    if (def.field_type === 'formula') continue;
    const fieldId = Number(def.id);
    if (!incoming.has(fieldId)) continue;
    const value = incoming.get(fieldId);
    const prev = (readPrev.get(Number(itemId), fieldId) as any)?.value_text ?? null;
    const oldValue = normalizeChangeValue(prev);
    const newValue = normalizeChangeValue(value == null || value === '' ? null : value);
    if (oldValue !== newValue) {
      changes.push({
        field: `cf:${def.field_key}`,
        field_label: String(def.label || def.field_key),
        old_value: oldValue,
        new_value: newValue,
      });
    }
    if (value == null || value === '') clear.run(Number(itemId), fieldId);
    else upsert.run(Number(itemId), fieldId, value);
  }

  recomputeItemFormulaValues(Number(itemId), customByKeyFromIncoming(defs, incoming, Number(itemId)));
  return changes;
}

function customByKeyFromIncoming(defs: any[], incoming: Map<number, string | null>, itemId: number) {
  const customByKey: Record<string, any> = {};
  for (const def of defs) {
    if (def.field_type === 'formula') continue;
    if (incoming.has(Number(def.id))) customByKey[def.field_key] = incoming.get(Number(def.id));
    else {
      const stored = db.prepare('SELECT value_text FROM item_custom_values WHERE item_id = ? AND field_id = ?')
        .get(itemId, Number(def.id)) as any;
      customByKey[def.field_key] = stored?.value_text ?? null;
    }
  }
  return customByKey;
}

export function recomputeItemFormulaValues(itemId: number, customByKey?: Record<string, any>) {
  const defs = listCustomFieldDefs('item', false);
  if (!defs.some((d) => d.field_type === 'formula')) return;
  const item = db.prepare(`SELECT i.*,
    COALESCE((SELECT SUM(inv.quantity) FROM inventory inv WHERE inv.item_id = i.id), 0) AS on_hand,
    COALESCE((SELECT SUM(pr.quantity) FROM project_reservations pr JOIN projects p ON p.id = pr.project_id WHERE pr.item_id = i.id AND p.status IN ('reserved','picking','picked','assembly')), 0) AS reserved
    FROM items i WHERE i.id = ?`).get(Number(itemId)) as any;
  if (!item) return;
  item.available = Math.max(0, Number(item.on_hand || 0) - Number(item.reserved || 0));
  const values = customByKey || customByKeyFromIncoming(defs, new Map(), Number(itemId));
  const computed = computeItemFormulaFields(item, values);
  const upsert = db.prepare(`INSERT INTO item_custom_values (item_id, field_id, value_text) VALUES (?, ?, ?)
    ON CONFLICT(item_id, field_id) DO UPDATE SET value_text = excluded.value_text`);
  const clear = db.prepare('DELETE FROM item_custom_values WHERE item_id = ? AND field_id = ?');
  for (const def of defs.filter((d) => d.field_type === 'formula')) {
    const value = computed[def.field_key];
    if (value == null || value === '') clear.run(Number(itemId), Number(def.id));
    else upsert.run(Number(itemId), Number(def.id), value);
  }
}

function normalizeCustomValue(def: any, raw: any): string | null {
  if (raw === '' || raw == null) return null;
  const type = String(def.field_type || 'text');
  if (type === 'formula') return null;
  if (type === 'bool') return Number(raw) || raw === true || raw === 'true' || raw === '1' || raw === 'on' ? '1' : '0';
  if (type === 'number') {
    const n = Number(raw);
    if (!Number.isFinite(n)) throw new Error(`Поле «${def.label}» должно быть числом`);
    return String(n);
  }
  if (type === 'date') {
    const s = String(raw).trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error(`Поле «${def.label}» — дата YYYY-MM-DD`);
    return s;
  }
  if (type === 'select') {
    let opts: string[] = [];
    try { opts = JSON.parse(def.options_json || '[]'); } catch { opts = []; }
    const value = String(raw).trim();
    if (!opts.includes(value)) throw new Error(`Поле «${def.label}»: выберите значение из списка`);
    return value;
  }
  return String(raw).trim() || null;
}

export function listHungReserves(staleDays?: number) {
  const days = Math.min(365, Math.max(1, Number(staleDays) || getReserveStaleDays()));
  return db.prepare(`
    SELECT p.id, p.order_no, p.name, p.status, p.reserved_at, p.due_date,
      COALESCE((SELECT SUM(quantity) FROM project_reservations WHERE project_id = p.id), 0) AS reserved_qty
    FROM projects p
    WHERE p.status IN ('reserved', 'picking', 'picked', 'assembly')
      AND p.reserved_at IS NOT NULL
      AND datetime(p.reserved_at) < datetime('now', '-' || ? || ' days')
    ORDER BY p.reserved_at ASC
    LIMIT 80
  `).all(days) as any[];
}

export function autoReleaseHungReserves(staleDays?: number): number {
  const hung = listHungReserves(staleDays);
  if (!hung.length) return 0;
  const apply = db.transaction(() => {
    let n = 0;
    for (const row of hung) {
      db.prepare('DELETE FROM project_reservations WHERE project_id = ?').run(Number(row.id));
      db.prepare("UPDATE projects SET status = 'draft', reserved_at = NULL WHERE id = ?").run(Number(row.id));
      n += 1;
    }
    return n;
  });
  return apply();
}

export function listLotsAtLocation(itemId: number, locationId: number) {
  return db.prepare(`
    SELECT inv.lot_id AS id, inv.quantity AS on_hand,
      COALESCE(l.lot_no, CASE WHEN inv.lot_id = 0 THEN 'Без партии' ELSE '#' || inv.lot_id END) AS lot_no,
      l.expiry_date, l.received_at, l.unit_cost
    FROM inventory inv
    LEFT JOIN lots l ON l.id = inv.lot_id
    WHERE inv.item_id = ? AND inv.location_id = ? AND inv.quantity > 0
    ORDER BY
      CASE WHEN inv.lot_id = 0 THEN 1 ELSE 0 END,
      CASE WHEN l.expiry_date IS NULL OR l.expiry_date = '' THEN 1 ELSE 0 END,
      l.expiry_date ASC, l.received_at ASC, inv.lot_id ASC
  `).all(Number(itemId), Number(locationId)) as any[];
}

export function applyCountDeltaAtLocation(input: {
  item_id: number;
  location_id: number;
  target_quantity: number;
  comment: string;
  reason: string;
  source: string;
  document_ref?: string | null;
  serials?: string[] | string | null;
  surplus_lot_id?: number | null;
}): { delta: number; previous: number; target: number } {
  const itemId = Number(input.item_id);
  const locationId = Number(input.location_id);
  const item = db.prepare('SELECT id, name, track_serials, track_lots FROM items WHERE id = ?').get(itemId) as any;
  if (!item) throw new Error('Товар не найден');
  if (String((db.prepare('SELECT item_type FROM items WHERE id = ?').get(itemId) as any)?.item_type || 'product') === 'service') {
    throw new Error(`«${item.name}» — услуга, складской остаток не ведётся`);
  }
  const target = Math.max(0, normalizeQtyForItem(itemId, input.target_quantity));
  const previous = getStockAtLocation(itemId, locationId);
  const deltaRaw = target - previous;
  const delta = deltaRaw === 0 ? 0 : (deltaRaw > 0
    ? normalizeQtyForItem(itemId, deltaRaw)
    : -normalizeQtyForItem(itemId, Math.abs(deltaRaw)));
  const reserved = getReservedQty(itemId, locationId);
  if (target < reserved) {
    throw new Error(`Нельзя установить остаток «${item.name}» ниже резерва (${reserved})`);
  }
  if (delta === 0) return { delta: 0, previous, target };

  let serials = parseSerialList(input.serials);
  if (Number(item.track_serials)) {
    const need = Math.abs(delta);
    if (delta > 0) {
      if (serials.length !== need) {
        throw new Error(`«${item.name}»: для излишка укажите ровно ${need} серийных номеров (сейчас ${serials.length})`);
      }
    } else if (serials.length) {
      if (serials.length !== need) {
        throw new Error(`«${item.name}»: для недостачи укажите ровно ${need} серий или оставьте пусто — спишем старейшие`);
      }
    } else {
      const atLoc = listSerialsAtLocation(itemId, locationId);
      if (atLoc.length < need) {
        throw new Error(`«${item.name}»: на ячейке ${atLoc.length} серий, нужно списать ${need}`);
      }
      serials = atLoc.slice(0, need).map((row: any) => String(row.serial_no));
    }
  }

  if (delta < 0) {
    if (Number(item.track_serials) && serials.length) {
      issueSerials({
        item_id: itemId,
        location_id: locationId,
        serials,
        document_ref: input.document_ref || null,
      });
    }
    for (const slice of allocateLotsForIssue(itemId, locationId, Math.abs(delta))) {
      addStockAtLocation(itemId, locationId, -slice.quantity, slice.lot_id);
      insertLedger({
        item_id: itemId,
        location_id: locationId,
        type: 'out',
        quantity: slice.quantity,
        comment: input.comment,
        reason: input.reason,
        source: input.source,
        document_ref: input.document_ref || null,
        lot_id: slice.lot_id || null,
      });
    }
  } else {
    const lotId = input.surplus_lot_id != null ? normalizeLotId(input.surplus_lot_id) : 0;
    addStockAtLocation(itemId, locationId, delta, lotId);
    if (Number(item.track_serials) && serials.length) {
      receiveSerials({
        item_id: itemId,
        location_id: locationId,
        serials,
        lot_id: lotId || null,
        document_ref: input.document_ref || null,
        note: input.comment,
      });
    }
    insertLedger({
      item_id: itemId,
      location_id: locationId,
      type: 'in',
      quantity: delta,
      comment: input.comment,
      reason: input.reason,
      source: input.source,
      document_ref: input.document_ref || null,
      lot_id: lotId || null,
    });
  }
  return { delta, previous, target };
}

export function allocateLotsForIssue(
  itemId: number,
  locationId: number,
  need: number,
): Array<{ lot_id: number; quantity: number }> {
  const qtyNeed = Math.max(0, normalizeQtyForItem(itemId, need));
  if (!qtyNeed) return [];
  const item = db.prepare('SELECT track_lots, lot_policy FROM items WHERE id = ?').get(Number(itemId)) as any;
  const total = getStockAtLocation(itemId, locationId);
  if (total < qtyNeed) throw new Error(`Недостаточно товара #${itemId} в ячейке (есть ${total}, нужно ${qtyNeed})`);

  if (!item?.track_lots) {

    const zeroQty = getStockAtLocation(itemId, locationId, 0);
    if (zeroQty >= qtyNeed) return [{ lot_id: 0, quantity: qtyNeed }];
  }

  const policy = String(item?.lot_policy || 'fifo');
  const orderSql = policy === 'fefo'
    ? `CASE WHEN inv.lot_id = 0 THEN 1 ELSE 0 END,
       CASE WHEN lots.expiry_date IS NULL OR lots.expiry_date = '' THEN 1 ELSE 0 END,
       lots.expiry_date ASC, lots.received_at ASC, inv.lot_id ASC`
    : `CASE WHEN inv.lot_id = 0 THEN 1 ELSE 0 END,
       lots.received_at ASC, inv.lot_id ASC`;

  const rows = db.prepare(`
    SELECT inv.lot_id, inv.quantity
    FROM inventory inv
    LEFT JOIN lots ON lots.id = inv.lot_id
    WHERE inv.item_id = ? AND inv.location_id = ? AND inv.quantity > 0
    ORDER BY ${orderSql}
  `).all(Number(itemId), Number(locationId)) as any[];

  const slices: Array<{ lot_id: number; quantity: number }> = [];
  let left = qtyNeed;
  for (const row of rows) {
    if (left <= 0) break;
    const take = Math.min(left, Number(row.quantity) || 0);
    if (take <= 0) continue;
    slices.push({ lot_id: normalizeLotId(row.lot_id), quantity: take });
    left -= take;
  }
  if (left > 0) throw new Error(`Недостаточно товара #${itemId} в ячейке (не хватает ${left})`);
  return slices;
}

export function parseSerialList(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return [...new Set(raw.map((s) => String(s || '').trim()).filter(Boolean))];
  }
  const text = String(raw || '');
  return [...new Set(
    text
      .split(/[\n,;\t]+/)
      .map((s) => s.trim())
      .filter(Boolean),
  )];
}

export function listItemSerials(itemId: number, status?: string | null) {
  const st = String(status || '').trim();
  if (st) {
    return db.prepare(`
      SELECT sn.*, l.name AS location_name, lots.lot_no
      FROM serial_numbers sn
      LEFT JOIN locations l ON l.id = sn.location_id
      LEFT JOIN lots ON lots.id = sn.lot_id
      WHERE sn.item_id = ? AND sn.status = ?
      ORDER BY sn.received_at DESC, sn.id DESC
    `).all(Number(itemId), st) as any[];
  }
  return db.prepare(`
    SELECT sn.*, l.name AS location_name, lots.lot_no
    FROM serial_numbers sn
    LEFT JOIN locations l ON l.id = sn.location_id
    LEFT JOIN lots ON lots.id = sn.lot_id
    WHERE sn.item_id = ?
    ORDER BY
      CASE sn.status WHEN 'in_stock' THEN 0 WHEN 'issued' THEN 1 ELSE 2 END,
      sn.received_at DESC, sn.id DESC
  `).all(Number(itemId)) as any[];
}

export function listSerialsAtLocation(itemId: number, locationId: number) {
  return db.prepare(`
    SELECT sn.*
    FROM serial_numbers sn
    WHERE sn.item_id = ? AND sn.location_id = ? AND sn.status = 'in_stock'
    ORDER BY sn.received_at ASC, sn.id ASC
  `).all(Number(itemId), Number(locationId)) as any[];
}

export function receiveSerials(input: {
  item_id: number;
  location_id: number;
  serials: string[];
  lot_id?: number | null;
  document_ref?: string | null;
  note?: string | null;
}) {
  const itemId = Number(input.item_id);
  const locationId = Number(input.location_id);
  const serials = parseSerialList(input.serials);
  if (!itemId || !locationId) throw new Error('Товар и ячейка обязательны для серий');
  if (!serials.length) throw new Error('Укажите серийные номера');
  const item = db.prepare('SELECT id, name, track_serials FROM items WHERE id = ?').get(itemId) as any;
  if (!item) throw new Error('Товар не найден');
  if (!Number(item.track_serials)) throw new Error(`«${item.name}» не ведётся по серийным номерам`);

  const insert = db.prepare(`
    INSERT INTO serial_numbers (item_id, serial_no, status, location_id, lot_id, document_ref_in, note)
    VALUES (?, ?, 'in_stock', ?, ?, ?, ?)
  `);
  for (const serial of serials) {
    if (serial.length > 128) throw new Error(`Серийный номер слишком длинный: ${serial}`);
    const exists = db.prepare('SELECT id, status FROM serial_numbers WHERE item_id = ? AND serial_no = ?').get(itemId, serial) as any;
    if (exists) {
      if (exists.status === 'in_stock') throw new Error(`Серия «${serial}» уже на остатке`);

      db.prepare(`UPDATE serial_numbers SET
        status = 'in_stock', location_id = ?, lot_id = ?, document_ref_in = ?, document_ref_out = NULL,
        issued_at = NULL, received_at = CURRENT_TIMESTAMP, note = COALESCE(?, note)
        WHERE id = ?`).run(
        locationId,
        input.lot_id != null && Number(input.lot_id) > 0 ? Number(input.lot_id) : null,
        input.document_ref || null,
        input.note || null,
        exists.id,
      );
    } else {
      insert.run(
        itemId,
        serial,
        locationId,
        input.lot_id != null && Number(input.lot_id) > 0 ? Number(input.lot_id) : null,
        input.document_ref || null,
        input.note || null,
      );
    }
  }
  return serials;
}

export function issueSerials(input: {
  item_id: number;
  location_id: number;
  serials: string[];
  document_ref?: string | null;
}) {
  const itemId = Number(input.item_id);
  const locationId = Number(input.location_id);
  const serials = parseSerialList(input.serials);
  if (!itemId || !locationId) throw new Error('Товар и ячейка обязательны для серий');
  if (!serials.length) throw new Error('Укажите серийные номера к выдаче');
  const item = db.prepare('SELECT id, name, track_serials FROM items WHERE id = ?').get(itemId) as any;
  if (!item) throw new Error('Товар не найден');
  if (!Number(item.track_serials)) throw new Error(`«${item.name}» не ведётся по серийным номерам`);

  for (const serial of serials) {
    const row = db.prepare(`
      SELECT * FROM serial_numbers WHERE item_id = ? AND serial_no = ?
    `).get(itemId, serial) as any;
    if (!row) throw new Error(`Серия «${serial}» не найдена для «${item.name}»`);
    if (row.status !== 'in_stock') throw new Error(`Серия «${serial}» уже не на остатке (${row.status})`);
    if (Number(row.location_id) !== locationId) {
      throw new Error(`Серия «${serial}» лежит в другой ячейке`);
    }
    db.prepare(`UPDATE serial_numbers SET
      status = 'issued', location_id = NULL, document_ref_out = ?, issued_at = CURRENT_TIMESTAMP
      WHERE id = ?`).run(input.document_ref || null, row.id);
  }
  return serials;
}

export function transferSerials(input: {
  item_id: number;
  from_location_id: number;
  to_location_id: number;
  serials: string[];
  document_ref?: string | null;
}) {
  const itemId = Number(input.item_id);
  const fromId = Number(input.from_location_id);
  const toId = Number(input.to_location_id);
  const serials = parseSerialList(input.serials);
  if (!itemId || !fromId || !toId) throw new Error('Товар и ячейки обязательны для серий');
  if (fromId === toId) throw new Error('Ячейки перемещения должны отличаться');
  if (!serials.length) throw new Error('Укажите серийные номера к перемещению');
  const item = db.prepare('SELECT id, name, track_serials FROM items WHERE id = ?').get(itemId) as any;
  if (!item) throw new Error('Товар не найден');
  if (!Number(item.track_serials)) throw new Error(`«${item.name}» не ведётся по серийным номерам`);

  for (const serial of serials) {
    const row = db.prepare(`
      SELECT * FROM serial_numbers WHERE item_id = ? AND serial_no = ?
    `).get(itemId, serial) as any;
    if (!row) throw new Error(`Серия «${serial}» не найдена для «${item.name}»`);
    if (row.status !== 'in_stock') throw new Error(`Серия «${serial}» не на остатке (${row.status})`);
    if (Number(row.location_id) !== fromId) {
      throw new Error(`Серия «${serial}» лежит в другой ячейке`);
    }
    db.prepare(`UPDATE serial_numbers SET location_id = ? WHERE id = ?`).run(toId, row.id);
  }
  return serials;
}

export function ensureStockReservesView() {
  if (!db) return;
  healQuantityMigrationArtifacts();
  const hasReservations = db.prepare(
    `SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = 'project_reservations'`,
  ).get() as any;
  if (!hasReservations) return;
  db.exec('DROP VIEW IF EXISTS stock_reserves');
  db.exec(`CREATE VIEW stock_reserves AS
    SELECT
      pr.project_id,
      pr.item_id,
      pr.location_id,
      pr.quantity,
      p.order_no AS project_no,
      p.name AS project_name,
      p.status AS project_status,
      p.due_date AS project_due,
      p.reserved_at,
      i.name AS item_name,
      i.sku AS item_sku,
      i.barcode AS item_barcode,
      l.name AS location_name,
      l.barcode AS location_barcode
    FROM project_reservations pr
    JOIN projects p ON p.id = pr.project_id
    JOIN items i ON i.id = pr.item_id
    JOIN locations l ON l.id = pr.location_id
    WHERE p.status IN ('reserved', 'picking', 'picked', 'assembly')`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_project_reservations_item_loc ON project_reservations(item_id, location_id)');
}

export function purgeStaleReservations() {
  if (!db) return 0;
  const result = db.prepare(`
    DELETE FROM project_reservations
    WHERE project_id IN (
      SELECT id FROM projects
      WHERE status NOT IN ('reserved', 'picking', 'picked', 'assembly')
    )
  `).run();
  return Number(result.changes || 0);
}

export function getAttachmentsRoot() {
  const root = path.join(path.dirname(getDatabasePath()), 'attachments');
  fs.mkdirSync(root, { recursive: true });
  return root;
}

export function attachmentAbsPath(storedName: string) {
  const root = path.resolve(getAttachmentsRoot());
  const full = path.resolve(root, storedName);
  const rel = path.relative(root, full);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('Некорректный путь вложения');
  return full;
}

export function listDocumentAttachments(documentId: number) {
  return db.prepare(`SELECT * FROM document_attachments WHERE document_id = ? ORDER BY file_name, version DESC, id DESC`)
    .all(Number(documentId)) as any[];
}

export function getDocumentAttachment(id: number) {
  return db.prepare('SELECT * FROM document_attachments WHERE id = ?').get(Number(id)) as any;
}

export function nextAttachmentVersion(documentId: number, fileName: string) {
  const row = db.prepare(`SELECT COALESCE(MAX(version), 0) AS v FROM document_attachments
    WHERE document_id = ? AND lower(file_name) = lower(?)`).get(Number(documentId), fileName) as any;
  return Number(row?.v || 0) + 1;
}

export function insertDocumentAttachment(entry: {
  document_id: number;
  file_name: string;
  stored_name: string;
  mime_type?: string | null;
  size_bytes: number;
  version: number;
  note?: string | null;
  uploaded_by?: string | null;
}) {
  const result = db.prepare(`INSERT INTO document_attachments
    (document_id, file_name, stored_name, mime_type, size_bytes, version, note, uploaded_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
    entry.document_id,
    entry.file_name,
    entry.stored_name,
    entry.mime_type || null,
    entry.size_bytes,
    entry.version,
    entry.note || null,
    entry.uploaded_by || null,
  );
  return getDocumentAttachment(Number(result.lastInsertRowid));
}

export function deleteDocumentAttachment(id: number) {
  const row = getDocumentAttachment(id);
  if (!row) return null;
  db.prepare('DELETE FROM document_attachments WHERE id = ?').run(Number(id));
  try {
    const abs = attachmentAbsPath(row.stored_name);
    if (fs.existsSync(abs)) fs.unlinkSync(abs);
  } catch {  }
  return row;
}

export const ACTIVE_RESERVE_STATUSES = ['reserved', 'picking', 'picked', 'assembly'] as const;

export function getReservedQty(itemId: number, locationId?: number | null) {
  if (locationId != null && Number(locationId) > 0) {
    return Number((db.prepare(`SELECT COALESCE(SUM(pr.quantity), 0) AS q
      FROM project_reservations pr
      JOIN projects p ON p.id = pr.project_id
      WHERE pr.item_id = ? AND pr.location_id = ?
        AND p.status IN ('reserved','picking','picked','assembly')`)
      .get(Number(itemId), Number(locationId)) as any)?.q || 0);
  }
  return Number((db.prepare(`SELECT COALESCE(SUM(pr.quantity), 0) AS q
    FROM project_reservations pr
    JOIN projects p ON p.id = pr.project_id
    WHERE pr.item_id = ?
      AND p.status IN ('reserved','picking','picked','assembly')`)
    .get(Number(itemId)) as any)?.q || 0);
}

const RESERVE_LINES_SQL = `
  SELECT
    pr.project_id, pr.item_id, pr.location_id, pr.quantity,
    p.order_no AS project_no, p.name AS project_name, p.status AS project_status,
    p.due_date AS project_due, p.reserved_at,
    COALESCE(i.name, '#' || pr.item_id) AS item_name,
    i.sku AS item_sku, i.barcode AS item_barcode,
    COALESCE(l.name, 'Ячейка #' || pr.location_id) AS location_name,
    l.barcode AS location_barcode,
    COALESCE(inv.quantity, 0) AS on_hand,
    COALESCE(inv.quantity, 0) - pr.quantity AS free_after
  FROM project_reservations pr
  JOIN projects p ON p.id = pr.project_id
  LEFT JOIN items i ON i.id = pr.item_id
  LEFT JOIN locations l ON l.id = pr.location_id
  LEFT JOIN inventory inv ON inv.item_id = pr.item_id AND inv.location_id = pr.location_id
  WHERE p.status IN ('reserved','picking','picked','assembly')
`;

export function listStockReserves(filters: { projectId?: number; itemId?: number; locationId?: number; q?: string } = {}) {
  const projectId = filters.projectId ? Number(filters.projectId) : 0;
  const itemId = filters.itemId ? Number(filters.itemId) : 0;
  const locationId = filters.locationId ? Number(filters.locationId) : 0;
  const q = String(filters.q || '').trim().toLocaleLowerCase();
  try { ensureStockReservesView(); } catch {  }
  const rows = db.prepare(`
    ${RESERVE_LINES_SQL}
      AND (? = 0 OR pr.project_id = ?)
      AND (? = 0 OR pr.item_id = ?)
      AND (? = 0 OR pr.location_id = ?)
    ORDER BY COALESCE(p.due_date, '9999-12-31'), p.order_no, item_name
  `).all(projectId, projectId, itemId, itemId, locationId, locationId) as any[];
  if (!q) return rows;
  return rows.filter((row) => {
    const hay = `${row.project_no} ${row.project_name} ${row.item_name} ${row.item_sku} ${row.item_barcode} ${row.location_name}`.toLocaleLowerCase();
    return hay.includes(q);
  });
}

export function summarizeStockReserves() {
  try { ensureStockReservesView(); } catch {  }
  const summary = db.prepare(`
    SELECT
      COUNT(*) AS line_count,
      COALESCE(SUM(pr.quantity), 0) AS qty_total,
      COUNT(DISTINCT pr.project_id) AS project_count,
      COUNT(DISTINCT pr.item_id) AS item_count,
      COUNT(DISTINCT pr.location_id) AS location_count
    FROM project_reservations pr
    JOIN projects p ON p.id = pr.project_id
    WHERE p.status IN ('reserved','picking','picked','assembly')
  `).get() as any;
  const byProject = db.prepare(`
    SELECT pr.project_id, p.order_no AS project_no, p.name AS project_name,
      p.status AS project_status, p.due_date AS project_due,
      COUNT(*) AS lines, COALESCE(SUM(pr.quantity), 0) AS qty
    FROM project_reservations pr
    JOIN projects p ON p.id = pr.project_id
    WHERE p.status IN ('reserved','picking','picked','assembly')
    GROUP BY pr.project_id
    ORDER BY qty DESC
    LIMIT 20
  `).all() as any[];
  const overReserved = db.prepare(`
    SELECT pr.item_id,
      COALESCE(i.name, '#' || pr.item_id) AS item_name,
      pr.location_id,
      COALESCE(l.name, 'Ячейка #' || pr.location_id) AS location_name,
      SUM(pr.quantity) AS reserved_qty,
      COALESCE(inv.quantity, 0) AS on_hand
    FROM project_reservations pr
    JOIN projects p ON p.id = pr.project_id
    LEFT JOIN items i ON i.id = pr.item_id
    LEFT JOIN locations l ON l.id = pr.location_id
    LEFT JOIN inventory inv ON inv.item_id = pr.item_id AND inv.location_id = pr.location_id
    WHERE p.status IN ('reserved','picking','picked','assembly')
    GROUP BY pr.item_id, pr.location_id
    HAVING reserved_qty > COALESCE(inv.quantity, 0)
    ORDER BY (reserved_qty - COALESCE(inv.quantity, 0)) DESC
    LIMIT 30
  `).all() as any[];
  return {
    line_count: Number(summary?.line_count || 0),
    qty_total: Number(summary?.qty_total || 0),
    project_count: Number(summary?.project_count || 0),
    item_count: Number(summary?.item_count || 0),
    location_count: Number(summary?.location_count || 0),
    by_project: byProject,
    over_reserved: overReserved,
  };
}

export function listStaleReservations() {
  return db.prepare(`
    SELECT pr.project_id, pr.item_id, pr.location_id, pr.quantity,
      p.status AS project_status, p.order_no, p.name AS project_name
    FROM project_reservations pr
    JOIN projects p ON p.id = pr.project_id
    WHERE p.status NOT IN ('reserved','picking','picked','assembly')
  `).all() as any[];
}

export type DocumentStatus = 'draft' | 'posted' | 'cancelled';

const DEFAULT_SERIES: Record<string, { label: string; prefix: string }> = {
  writeoff: { label: 'Списание', prefix: 'WOFF' },
  surplus: { label: 'Оприходование излишков', prefix: 'SURP' },
  regrade: { label: 'Пересортица', prefix: 'RGRD' },
  disassemble: { label: 'Разукомплектация', prefix: 'DISA' },
  assemble: { label: 'Комплектация', prefix: 'ASMB' },
  po: { label: 'Заказ поставщику', prefix: 'PO' },
  revision: { label: 'Ревизия', prefix: 'REV' },
  project: { label: 'Заказ-наряд', prefix: 'WO' },
};

function periodKeyNow(period: string) {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  if (period === 'year') return String(y);
  if (period === 'month') return `${y}${m}`;
  return '';
}

function ensureSeriesRow(docType: string, fallbackPrefix?: string) {
  const existing = db.prepare('SELECT * FROM document_series WHERE doc_type = ?').get(docType) as any;
  if (existing) return syncSeqFromDocuments(docType, existing);
  const meta = DEFAULT_SERIES[docType] || {
    label: docType,
    prefix: (fallbackPrefix || docType || 'DOC').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12) || 'DOC',
  };
  db.prepare(`INSERT INTO document_series
    (doc_type, label, prefix, pad, period, include_period, last_period_key, last_seq)
    VALUES (?, ?, ?, 4, 'none', 0, NULL, 0)`).run(docType, meta.label, meta.prefix);
  const created = db.prepare('SELECT * FROM document_series WHERE doc_type = ?').get(docType) as any;
  return syncSeqFromDocuments(docType, created);
}

function syncSeqFromDocuments(docType: string, series: any) {
  const last = db.prepare(`SELECT doc_no FROM documents WHERE doc_type = ? ORDER BY id DESC LIMIT 1`).get(docType) as any;
  if (!last?.doc_no) return series;
  const match = String(last.doc_no).match(/(\d+)\s*$/);
  if (!match) return series;
  const fromDocs = Number(match[1]);
  if (fromDocs > (Number(series.last_seq) || 0)) {
    db.prepare('UPDATE document_series SET last_seq = ? WHERE doc_type = ?').run(fromDocs, docType);
    return { ...series, last_seq: fromDocs };
  }
  return series;
}

export function nextCatalogCode(source: 'categories' | 'items' | 'suppliers' | 'locations' = 'categories'): string {
  const map: Record<string, { table: string; column: string }> = {
    categories: { table: 'categories', column: 'code' },
    items: { table: 'items', column: 'sku' },
    suppliers: { table: 'suppliers', column: 'code' },
    locations: { table: 'locations', column: 'code' },
  };
  const conf = map[source] || map.categories;
  const hasTable = Boolean(
    (db.prepare(`SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ?`).get(conf.table) as any)?.ok,
  );
  if (!hasTable) return '00-000001';
  const cols = new Set((db.prepare(`PRAGMA table_info(${conf.table})`).all() as Array<{ name: string }>).map((c) => c.name));
  if (!cols.has(conf.column)) return '00-000001';
  const rows = db.prepare(
    `SELECT ${conf.column} AS code FROM ${conf.table}
     WHERE ${conf.column} IS NOT NULL AND TRIM(${conf.column}) != ''`,
  ).all() as Array<{ code: string }>;
  let max = 0;
  for (const row of rows) {
    const m = String(row.code || '').trim().match(/^(\d{2})-(\d+)$/);
    if (m) max = Math.max(max, parseInt(m[2], 10));
  }
  return `00-${String(max + 1).padStart(6, '0')}`;
}

export function listItemVariants(parentId: number) {
  return db.prepare(`
    SELECT i.id, i.name, i.sku, i.barcode, i.variant_label, i.sale_price, i.cost_price, i.parent_item_id,
      COALESCE((SELECT SUM(inv.quantity) FROM inventory inv WHERE inv.item_id = i.id), 0) AS on_hand
    FROM items i
    WHERE i.parent_item_id = ?
    ORDER BY i.variant_label COLLATE NOCASE, i.name
  `).all(Number(parentId)) as any[];
}

export function createItemVariant(parentId: number, data: {
  variant_label: string;
  sku?: string | null;
  barcode?: string | null;
  sale_price?: number | null;
  cost_price?: number | null;
}) {
  const parent = db.prepare('SELECT * FROM items WHERE id = ?').get(Number(parentId)) as any;
  if (!parent) throw new Error('Родительский товар не найден');
  if (parent.parent_item_id) throw new Error('Нельзя создать вариант от другого варианта — выберите карточку-родителя');
  const label = String(data.variant_label || '').trim();
  if (!label) throw new Error('Укажите название варианта (цвет, размер, исполнение…)');
  if (label.length > 80) throw new Error('Название варианта слишком длинное');

  const dup = db.prepare(`
    SELECT id FROM items WHERE parent_item_id = ? AND lower(trim(variant_label)) = lower(trim(?)) LIMIT 1
  `).get(parent.id, label) as any;
  if (dup) throw new Error(`Вариант «${label}» уже есть у этого товара`);

  let sku = String(data.sku || '').trim();
  if (!sku) {
    const base = String(parent.sku || '').trim() || nextCatalogCode('items');
    const suffix = label
      .toUpperCase()
      .replace(/[^A-ZА-ЯЁ0-9]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 12) || 'VAR';
    sku = `${base}-${suffix}`;
    let n = 2;
    while (db.prepare('SELECT 1 FROM items WHERE upper(trim(sku)) = upper(trim(?)) LIMIT 1').get(sku)) {
      sku = `${base}-${suffix}-${n}`;
      n += 1;
      if (n > 99) {
        sku = nextCatalogCode('items');
        break;
      }
    }
  } else if (db.prepare('SELECT 1 FROM items WHERE upper(trim(sku)) = upper(trim(?)) LIMIT 1').get(sku)) {
    throw new Error(`Артикул «${sku}» уже используется`);
  }

  const barcode = String(data.barcode || '').trim() || null;
  if (barcode) assertBarcodesAvailable([barcode]);

  const name = `${parent.name} · ${label}`;
  const sale = data.sale_price !== undefined && data.sale_price !== null && data.sale_price !== ('' as any)
    ? Number(data.sale_price)
    : parent.sale_price;
  const cost = data.cost_price !== undefined && data.cost_price !== null && data.cost_price !== ('' as any)
    ? Number(data.cost_price)
    : parent.cost_price;

  const result = db.prepare(`
    INSERT INTO items (
      barcode, name, sku, category, min_stock, max_stock, reorder_point, description, print_name, unit_id,
      sale_price, cost_price, origin, manufacturer, brand, package_qty, price_basis, weight_g, storage_note,
      supplier_sku, purchase_url, lead_time_days, moq, pack_multiple, item_type, track_lots, track_serials, lot_policy,
      parent_item_id, variant_label
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    barcode,
    name,
    sku,
    parent.category,
    parent.min_stock || 0,
    parent.max_stock != null ? Number(parent.max_stock) : null,
    parent.reorder_point != null ? Number(parent.reorder_point) : null,
    parent.description,
    parent.print_name ? `${parent.print_name} · ${label}` : name,
    parent.unit_id,
    sale != null && Number.isFinite(Number(sale)) ? Number(sale) : null,
    cost != null && Number.isFinite(Number(cost)) ? Number(cost) : null,
    parent.origin,
    parent.manufacturer,
    parent.brand,
    parent.package_qty,
    parent.price_basis || 'unit',
    parent.weight_g,
    parent.storage_note,
    parent.supplier_sku,
    parent.purchase_url,
    parent.lead_time_days,
    parent.moq,
    parent.pack_multiple,
    parent.item_type || 'product',
    Number(parent.track_lots) ? 1 : 0,
    Number(parent.track_serials) ? 1 : 0,
    parent.lot_policy || 'fifo',
    parent.id,
    label,
  );
  const id = Number(result.lastInsertRowid);
  if (barcode) syncItemBarcodes(id, [barcode]);
  return db.prepare('SELECT * FROM items WHERE id = ?').get(id) as any;
}

export function nextDocumentNo(docType: string, prefixFallback?: string) {
  try {
    const series = ensureSeriesRow(docType, prefixFallback);
    const period = ['year', 'month', 'none'].includes(String(series.period)) ? String(series.period) : 'none';
    const key = periodKeyNow(period);
    let seq = Number(series.last_seq) || 0;
    if (period !== 'none' && String(series.last_period_key || '') !== key) {
      seq = 0;
    }
    seq += 1;
    const pad = Math.min(8, Math.max(2, Number(series.pad) || 4));
    const prefix = String(series.prefix || prefixFallback || docType || 'DOC')
      .toUpperCase()
      .replace(/[^A-Z0-9\-]/g, '')
      .slice(0, 12) || 'DOC';
    const includePeriod = Number(series.include_period) === 1 && key;
    const docNo = includePeriod
      ? `${prefix}-${key}-${String(seq).padStart(pad, '0')}`
      : `${prefix}-${String(seq).padStart(pad, '0')}`;
    db.prepare('UPDATE document_series SET last_seq = ?, last_period_key = ? WHERE doc_type = ?')
      .run(seq, period === 'none' ? null : key, docType);
    return docNo;
  } catch {
    const pre = (prefixFallback || docType || 'DOC').toUpperCase().replace(/[^A-Z0-9\-]/g, '').slice(0, 12) || 'DOC';
    const last = db.prepare(`SELECT doc_no FROM documents WHERE doc_type = ? ORDER BY id DESC LIMIT 1`).get(docType) as any;
    let seq = 1;
    if (last?.doc_no) {
      const match = String(last.doc_no).match(/(\d+)\s*$/);
      if (match) seq = Number(match[1]) + 1;
    }
    return `${pre}-${String(seq).padStart(4, '0')}`;
  }
}

export function listDocumentSeries() {
  for (const docType of Object.keys(DEFAULT_SERIES)) ensureSeriesRow(docType);
  return db.prepare('SELECT * FROM document_series ORDER BY label').all() as any[];
}

export function saveDocumentSeries(rows: any[]) {
  const upsert = db.prepare(`INSERT INTO document_series
    (doc_type, label, prefix, pad, period, include_period, last_period_key, last_seq)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(doc_type) DO UPDATE SET
      label = excluded.label,
      prefix = excluded.prefix,
      pad = excluded.pad,
      period = excluded.period,
      include_period = excluded.include_period`);
  const tx = db.transaction(() => {
    for (const row of rows || []) {
      const docType = String(row.doc_type || '').trim();
      if (!docType) continue;
      const existing = db.prepare('SELECT last_period_key, last_seq FROM document_series WHERE doc_type = ?').get(docType) as any;
      const prefix = String(row.prefix || docType).toUpperCase().replace(/[^A-Z0-9\-]/g, '').slice(0, 12) || 'DOC';
      const pad = Math.min(8, Math.max(2, Number(row.pad) || 4));
      const period = ['year', 'month', 'none'].includes(String(row.period)) ? String(row.period) : 'none';
      const includePeriod = row.include_period ? 1 : 0;
      upsert.run(
        docType,
        String(row.label || docType).trim() || docType,
        prefix,
        pad,
        period,
        includePeriod,
        existing?.last_period_key ?? null,
        Number(existing?.last_seq) || 0,
      );
    }
  });
  tx();
  return listDocumentSeries();
}

export function previewNextDocumentNo(docType: string) {
  const series = ensureSeriesRow(docType);
  const period = ['year', 'month', 'none'].includes(String(series.period)) ? String(series.period) : 'none';
  const key = periodKeyNow(period);
  let seq = Number(series.last_seq) || 0;
  if (period !== 'none' && String(series.last_period_key || '') !== key) seq = 0;
  seq += 1;
  const pad = Math.min(8, Math.max(2, Number(series.pad) || 4));
  const prefix = String(series.prefix || 'DOC').toUpperCase().replace(/[^A-Z0-9\-]/g, '').slice(0, 12) || 'DOC';
  const includePeriod = Number(series.include_period) === 1 && key;
  return includePeriod
    ? `${prefix}-${key}-${String(seq).padStart(pad, '0')}`
    : `${prefix}-${String(seq).padStart(pad, '0')}`;
}

export function resetDocumentSeriesCounter(docType: string) {
  ensureSeriesRow(docType);
  db.prepare('UPDATE document_series SET last_seq = 0, last_period_key = NULL WHERE doc_type = ?').run(docType);
  return previewNextDocumentNo(docType);
}

export function upsertDocument(entry: {
  doc_type: string;
  doc_no: string;
  status: DocumentStatus;
  doc_date?: string | null;
  note?: string | null;
  party?: string | null;
  author?: string | null;
  ref_table?: string | null;
  ref_id?: number | null;
  amount?: number | null;
  posted_by?: string | null;
  parent_id?: number | null;
}) {
  const existing = db.prepare('SELECT id, status FROM documents WHERE doc_type = ? AND doc_no = ?')
    .get(entry.doc_type, entry.doc_no) as any;
  const today = new Date().toISOString().slice(0, 10);
  if (!existing) {
    const result = db.prepare(`INSERT INTO documents (
      doc_type, doc_no, status, doc_date, posted_at, posted_by, author, party, note, ref_table, ref_id, amount, parent_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      entry.doc_type,
      entry.doc_no,
      entry.status,
      entry.doc_date || today,
      entry.status === 'posted' ? new Date().toISOString() : null,
      entry.status === 'posted' ? (entry.posted_by || entry.author || null) : null,
      entry.author || null,
      entry.party || null,
      entry.note || null,
      entry.ref_table || null,
      entry.ref_id ?? null,
      entry.amount ?? null,
      entry.parent_id ?? null,
    );
    return { id: Number(result.lastInsertRowid), created: true };
  }
  db.prepare(`UPDATE documents SET
    status = ?,
    doc_date = COALESCE(?, doc_date),
    party = COALESCE(?, party),
    note = COALESCE(?, note),
    amount = COALESCE(?, amount),
    parent_id = COALESCE(?, parent_id),
    workflow_status = CASE
      WHEN ? IN ('posted', 'cancelled') THEN NULL
      ELSE workflow_status
    END,
    posted_at = CASE WHEN ? = 'posted' THEN COALESCE(posted_at, CURRENT_TIMESTAMP) ELSE posted_at END,
    posted_by = CASE WHEN ? = 'posted' THEN COALESCE(posted_by, ?) ELSE posted_by END,
    cancelled_at = CASE WHEN ? = 'cancelled' THEN CURRENT_TIMESTAMP ELSE cancelled_at END,
    cancelled_by = CASE WHEN ? = 'cancelled' THEN ? ELSE cancelled_by END
    WHERE id = ?`).run(
    entry.status,
    entry.doc_date || null,
    entry.party || null,
    entry.note || null,
    entry.amount ?? null,
    entry.parent_id ?? null,
    entry.status,
    entry.status, entry.status, entry.posted_by || entry.author || null,
    entry.status, entry.status, entry.posted_by || entry.author || null,
    existing.id,
  );
  return { id: Number(existing.id), created: false };
}

export function getDocumentById(id: number) {
  return db.prepare(`SELECT d.*, p.doc_no AS parent_doc_no, p.doc_type AS parent_doc_type
    FROM documents d LEFT JOIN documents p ON p.id = d.parent_id WHERE d.id = ?`).get(id) as any;
}

export function listDocumentChildren(parentId: number) {
  return db.prepare('SELECT * FROM documents WHERE parent_id = ? ORDER BY id').all(parentId) as any[];
}

export function diagnoseDatabase() {
  ensureStockReservesView();
  const purged = purgeStaleReservations();
  const integrity = (db.pragma('integrity_check') as any[])[0]?.integrity_check;
  const foreign = db.pragma('foreign_key_check') as any[];
  const negatives = db.prepare('SELECT COUNT(*) AS c FROM inventory WHERE quantity < 0').get() as any;
  const orphanInv = db.prepare(`SELECT COUNT(*) AS c FROM inventory i
    LEFT JOIN items it ON it.id = i.item_id WHERE it.id IS NULL`).get() as any;
  const orphanTx = db.prepare(`SELECT COUNT(*) AS c FROM transactions t
    LEFT JOIN items it ON it.id = t.item_id WHERE it.id IS NULL`).get() as any;
  const drift = listInventoryLedgerDrift();
  const staleReserves = listStaleReservations();
  const reserveSummary = summarizeStockReserves();
  const issues: string[] = [];
  if (integrity !== 'ok') issues.push(`integrity_check: ${integrity}`);
  if (foreign.length) issues.push(`foreign_key_check: ${foreign.length} нарушений`);
  if (Number(negatives?.c) > 0) issues.push(`Отрицательные остатки: ${negatives.c}`);
  if (Number(orphanInv?.c) > 0) issues.push(`Осиротевшие остатки: ${orphanInv.c}`);
  if (Number(orphanTx?.c) > 0) issues.push(`Осиротевшие движения: ${orphanTx.c}`);
  if (drift.length > 0) issues.push(`Расхождение inventory ↔ ledger: ${drift.length} ячеек`);
  if (staleReserves.length > 0) issues.push(`Устаревшие резервы (проект не активен): ${staleReserves.length}`);
  if ((reserveSummary.over_reserved || []).length > 0) {
    issues.push(`Резерв выше on_hand: ${reserveSummary.over_reserved.length} позиций`);
  }
  return {
    ok: issues.length === 0 && integrity === 'ok',
    integrity,
    foreign_keys: foreign.length,
    negative_stock: Number(negatives?.c || 0),
    orphan_inventory: Number(orphanInv?.c || 0),
    orphan_transactions: Number(orphanTx?.c || 0),
    ledger_drift: drift.length,
    ledger_drift_rows: drift.slice(0, 40),
    stale_reserves: staleReserves.length,
    purged_stale_reserves: purged,
    over_reserved: (reserveSummary.over_reserved || []).length,
    active_reserves: Number(reserveSummary.line_count || 0),
    issues,
    checked_at: new Date().toISOString(),
  };
}

export function computeOrgHealth() {
  const diagnose = diagnoseDatabase();
  const overdueProjects = db.prepare(`
    SELECT id, order_no, name, target_name, due_date, status
    FROM projects
    WHERE due_date IS NOT NULL AND date(due_date) < date('now')
      AND status NOT IN ('consumed', 'finished', 'completed')
    ORDER BY due_date ASC
    LIMIT 40
  `).all() as any[];
  const overduePos = db.prepare(`
    SELECT po.id, po.order_no, po.expected_at, po.status, s.name AS supplier_name
    FROM purchase_orders po
    LEFT JOIN suppliers s ON s.id = po.supplier_id
    WHERE po.expected_at IS NOT NULL AND date(po.expected_at) < date('now')
      AND po.status IN ('ordered', 'partial')
    ORDER BY po.expected_at ASC
    LIMIT 40
  `).all() as any[];
  const hungReserves = listHungReserves(getReserveStaleDays());
  const overReserved = (summarizeStockReserves().over_reserved || []) as any[];
  const expiryRows = listExpiringLots(getExpiryWarnDays(), 60);
  const expiredLots = expiryRows.filter((row) => row.status === 'expired');
  const expiringLots = expiryRows.filter((row) => row.status === 'expiring');
  const staleDays = getReserveStaleDays();

  let autoReleased = 0;
  if (isReserveAutoReleaseEnabled() && hungReserves.length) {
    try {
      autoReleased = autoReleaseHungReserves(staleDays);
    } catch (e) {
      console.error('[Metrika] auto-release hung reserves failed:', e);
    }
  }

  let score = 100;
  const factors: Array<{ key: string; label: string; penalty: number; count: number }> = [];
  const penalize = (key: string, label: string, count: number, per: number, cap: number) => {
    if (!(count > 0)) return;
    const penalty = Math.min(cap, count * per);
    score -= penalty;
    factors.push({ key, label, penalty, count });
  };
  if (diagnose.integrity !== 'ok') penalize('integrity', 'Целостность SQLite', 1, 40, 40);
  penalize('fk', 'Нарушения FK', Number(diagnose.foreign_keys || 0), 5, 20);
  penalize('negative', 'Отрицательные остатки', Number(diagnose.negative_stock || 0), 4, 16);
  penalize('drift', 'Расхождение ledger', Number(diagnose.ledger_drift || 0), 2, 20);
  penalize('over_reserved', 'Резерв выше on_hand', Number(diagnose.over_reserved || 0), 3, 15);
  const hungAfter = autoReleased > 0 ? listHungReserves(staleDays) : hungReserves;
  penalize('hung_reserves', `Зависшие резервы (>${staleDays} дн.)`, hungAfter.length, 3, 18);
  penalize('overdue_projects', 'Просроченные заказы-наряды', overdueProjects.length, 2, 12);
  penalize('overdue_po', 'Просроченные поставки', overduePos.length, 2, 12);
  penalize('expired_lots', 'Просроченные партии', expiredLots.length, 4, 20);
  penalize('expiring_lots', 'Партии с истекающим сроком', expiringLots.length, 1, 10);
  score = Math.max(0, Math.min(100, Math.round(score)));

  let grade = 'A';
  if (score < 90) grade = 'B';
  if (score < 75) grade = 'C';
  if (score < 50) grade = 'D';
  if (score < 30) grade = 'F';

  return {
    score,
    grade,
    factors,
    diagnose,
    overdue_projects: overdueProjects,
    overdue_pos: overduePos,
    hung_reserves: hungAfter,
    over_reserved: overReserved,
    expired_lots: expiredLots,
    expiring_lots: expiringLots,
    expiry_warn_days: getExpiryWarnDays(),
    reserve_stale_days: staleDays,
    reserve_auto_released: autoReleased,
    checked_at: new Date().toISOString(),
  };
}

export function backfillLegacyMoveEndpoints() {
  if (!db) return 0;
  const rows = db.prepare(`
    SELECT id, location_id, comment FROM transactions
    WHERE type = 'move'
      AND reversed_at IS NULL
      AND from_location_id IS NULL
      AND to_location_id IS NULL
      AND location_id IS NOT NULL
  `).all() as Array<{ id: number; location_id: number; comment: string | null }>;
  const upd = db.prepare(`
    UPDATE transactions SET from_location_id = ?, to_location_id = ? WHERE id = ?
  `);
  let n = 0;
  const run = db.transaction(() => {
    for (const row of rows) {
      const m = String(row.comment || '').match(/из\s+ячейки\s+(\d+)/i);
      if (!m) continue;
      const fromId = Number(m[1]);
      const toId = Number(row.location_id);
      if (!fromId || !toId || fromId === toId) continue;
      upd.run(fromId, toId, row.id);
      n += 1;
    }
  });
  run();
  return n;
}

export function computeLedgerBalances(): Array<{ item_id: number; location_id: number; lot_id: number; quantity: number }> {
  const map = new Map<string, { item_id: number; location_id: number; lot_id: number; quantity: number }>();
  const add = (itemId: number, locationId: number | null | undefined, lotId: number, delta: number) => {
    const loc = Number(locationId);
    if (!itemId || !loc || !Number.isFinite(loc) || !delta) return;
    const lot = normalizeLotId(lotId);
    const key = `${itemId}:${loc}:${lot}`;
    const row = map.get(key);
    if (row) row.quantity += delta;
    else map.set(key, { item_id: itemId, location_id: loc, lot_id: lot, quantity: delta });
  };

  const rows = db.prepare(`
    SELECT item_id, location_id, type, quantity, from_location_id, to_location_id,
           COALESCE(lot_id, 0) AS lot_id, comment
    FROM transactions
    WHERE reversed_at IS NULL
      AND type IN ('in', 'out', 'move', 'adjustment')
  `).all() as any[];

  for (const row of rows) {
    const qty = Number(row.quantity) || 0;
    const lotId = Number(row.lot_id) || 0;
    const typ = String(row.type || '');
    if (typ === 'in') add(row.item_id, row.location_id, lotId, qty);
    else if (typ === 'out') add(row.item_id, row.location_id, lotId, -qty);
    else if (typ === 'adjustment') add(row.item_id, row.location_id, lotId, qty);
    else if (typ === 'move') {
      let fromId = row.from_location_id != null ? Number(row.from_location_id) : 0;
      let toId = row.to_location_id != null ? Number(row.to_location_id) : 0;
      if (!fromId && !toId && row.location_id) {
        const m = String(row.comment || '').match(/из\s+ячейки\s+(\d+)/i);
        if (m) {
          fromId = Number(m[1]);
          toId = Number(row.location_id);
        }
      }
      if (fromId) add(row.item_id, fromId, lotId, -qty);
      if (toId) add(row.item_id, toId, lotId, qty);
    }
  }

  return [...map.values()].filter((row) => row.quantity !== 0);
}

export function listInventoryLedgerDrift(limit = 200) {
  const ledger = computeLedgerBalances();
  const invRows = db.prepare(`SELECT item_id, location_id, lot_id, quantity FROM inventory`).all() as any[];
  const map = new Map<string, { item_id: number; location_id: number; lot_id: number; inventory_qty: number; ledger_qty: number }>();
  for (const row of invRows) {
    const lotId = normalizeLotId(row.lot_id);
    const key = `${row.item_id}:${row.location_id}:${lotId}`;
    map.set(key, {
      item_id: row.item_id,
      location_id: row.location_id,
      lot_id: lotId,
      inventory_qty: Number(row.quantity) || 0,
      ledger_qty: 0,
    });
  }
  for (const row of ledger) {
    const lotId = normalizeLotId(row.lot_id);
    const key = `${row.item_id}:${row.location_id}:${lotId}`;
    const existing = map.get(key);
    if (existing) existing.ledger_qty = Number(row.quantity) || 0;
    else {
      map.set(key, {
        item_id: row.item_id,
        location_id: row.location_id,
        lot_id: lotId,
        inventory_qty: 0,
        ledger_qty: Number(row.quantity) || 0,
      });
    }
  }
  const nameByItem = new Map<number, string>();
  const nameByLoc = new Map<number, string>();
  const lotNoById = new Map<number, string>();
  for (const row of db.prepare('SELECT id, name FROM items').all() as any[]) nameByItem.set(row.id, row.name);
  for (const row of db.prepare('SELECT id, name FROM locations').all() as any[]) nameByLoc.set(row.id, row.name);
  for (const row of db.prepare('SELECT id, lot_no FROM lots').all() as any[]) lotNoById.set(row.id, row.lot_no);
  const drifts = [...map.values()]
    .filter((row) => row.inventory_qty !== row.ledger_qty)
    .map((row) => ({
      ...row,
      delta: row.ledger_qty - row.inventory_qty,
      item_name: nameByItem.get(row.item_id) || `#${row.item_id}`,
      location_name: nameByLoc.get(row.location_id) || `#${row.location_id}`,
      lot_no: row.lot_id ? (lotNoById.get(row.lot_id) || `#${row.lot_id}`) : '—',
    }))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  return drifts.slice(0, limit);
}

export function rebuildInventoryFromLedger() {
  const balances = computeLedgerBalances();
  const beforeDrift = listInventoryLedgerDrift(5000).length;
  const rebuild = db.transaction(() => {
    db.prepare('DELETE FROM inventory').run();
    const upsert = db.prepare(
      `INSERT INTO inventory (item_id, location_id, lot_id, quantity) VALUES (?, ?, ?, ?)`,
    );
    let written = 0;
    for (const row of balances) {
      const qty = Number(row.quantity) || 0;

      if (!(qty > 0)) continue;
      const itemOk = db.prepare('SELECT id FROM items WHERE id = ?').get(row.item_id);
      const locOk = db.prepare('SELECT id FROM locations WHERE id = ?').get(row.location_id);
      if (!itemOk || !locOk) continue;
      const lotId = normalizeLotId(row.lot_id);
      if (lotId > 0) {
        const lotOk = db.prepare('SELECT id FROM lots WHERE id = ? AND item_id = ?').get(lotId, row.item_id);
        if (!lotOk) continue;
      }
      upsert.run(row.item_id, row.location_id, lotId, qty);
      written += 1;
    }
    return written;
  });
  const written = rebuild();
  const afterDrift = listInventoryLedgerDrift(5000).length;
  return {
    rewritten: written,
    before_drift: beforeDrift,
    after_drift: afterDrift,
    ok: afterDrift === 0,
  };
}

export function healLedgerDriftToInventory(filter?: {
  item_id?: number;
  location_id?: number;
  lot_id?: number;
}) {
  let drifts = listInventoryLedgerDrift(5000);
  if (filter?.item_id != null) {
    const itemId = Number(filter.item_id);
    const locationId = filter.location_id != null ? Number(filter.location_id) : null;
    const lotId = filter.lot_id != null ? normalizeLotId(filter.lot_id) : null;
    drifts = drifts.filter((row) => {
      if (row.item_id !== itemId) return false;
      if (locationId != null && row.location_id !== locationId) return false;
      if (lotId != null && normalizeLotId(row.lot_id) !== lotId) return false;
      return true;
    });
  }
  if (!drifts.length) {
    return { adjusted: 0, before_drift: 0, after_drift: listInventoryLedgerDrift(5000).length, ok: true };
  }
  const beforeAll = listInventoryLedgerDrift(5000).length;
  const run = db.transaction(() => {
    let n = 0;
    for (const row of drifts) {
      const inv = Number(row.inventory_qty) || 0;
      const led = Number(row.ledger_qty) || 0;
      const delta = inv - led;
      if (!delta) continue;
      const lotId = normalizeLotId(row.lot_id);
      const comment = `Выравнивание ledger→остаток (${led} → ${inv}) · ${row.location_name || ''}`;

      if (delta > 0) {
        insertLedger({
          item_id: row.item_id,
          location_id: row.location_id,
          type: 'adjustment',
          quantity: delta,
          comment,
          reason: 'MANUAL',
          source: 'SYSTEM',
          lot_id: lotId > 0 ? lotId : null,
          user_name: 'Система · Центр качества',
        });
      } else {
        insertLedger({
          item_id: row.item_id,
          location_id: row.location_id,
          from_location_id: row.location_id,
          type: 'out',
          quantity: Math.abs(delta),
          comment,
          reason: 'MANUAL',
          source: 'SYSTEM',
          lot_id: lotId > 0 ? lotId : null,
          user_name: 'Система · Центр качества',
        });
      }
      n += 1;
    }
    return n;
  });
  const adjusted = run();
  db.prepare('DELETE FROM inventory WHERE quantity <= 0').run();
  const after = listInventoryLedgerDrift(5000).length;
  return {
    adjusted,
    before_drift: beforeAll,
    after_drift: after,
    ok: after === 0,
  };
}

const FIELD_LABELS: Record<string, string> = {
  name: 'Название',
  sku: 'Артикул',
  barcode: 'Штрихкод',
  category: 'Категория',
  min_stock: 'Мин. остаток',
  max_stock: 'Макс. остаток',
  reorder_point: 'Точка заказа',
  description: 'Описание',
  print_name: 'Название для печати',
  unit_id: 'Ед. изм.',
  sale_price: 'Цена',
  cost_price: 'Учётная цена',
  origin: 'Страна',
  manufacturer: 'Производитель',
  brand: 'Бренд',
  parent_item_id: 'Родительский товар',
  variant_label: 'Вариант',
  item_type: 'Тип номенклатуры',
  track_lots: 'Партионный учёт',
  track_serials: 'Серийные номера',
  lot_policy: 'Политика партий',
  package_qty: 'Упаковка',
  price_basis: 'Базис цены',
  weight_g: 'Вес',
  storage_note: 'Хранение',
  supplier_sku: 'Артикул поставщика',
  purchase_url: 'Ссылка',
  lead_time_days: 'Срок поставки',
  moq: 'MOQ',
  pack_multiple: 'Кратность',
  contact: 'Контакт',
  note: 'Заметка',
  email: 'Email',
  phone: 'Телефон',
  inn: 'ИНН',
  address: 'Адрес',
  priority: 'Приоритет',
  default_lead_days: 'Срок поставки по умолч.',
  is_active: 'Активен',
  color: 'Цвет',
  location_type: 'Тип адреса',
  parent_location_id: 'Родитель',
  zone_id: 'Зона',
  capacity_qty: 'Вместимость',
  aisle: 'Проход',
  rack: 'Стеллаж',
  shelf_level: 'Полка',
  symbol: 'Обозначение',
  decimal_places: 'Знаков после запятой',
  code: 'Код',
  is_base: 'Базовая',
  supplier_id: 'Поставщик',
  expected_at: 'Ожидаемая дата',
  order_no: 'Номер заказа',
  status: 'Статус',
  prefix: 'Префикс',
  parent_id: 'Родитель',
  display_name: 'Имя',
  first_name: 'Имя (ФИО)',
  last_name: 'Фамилия',
  middle_name: 'Отчество',
  login: 'Логин',
  role: 'Роль',
  permissions_json: 'Права',
  location_scope_json: 'Склады (область)',
  password_hash: 'Пароль',
};

export type EntityChangeLine = {
  field: string;
  field_label: string;
  old_value: string | null;
  new_value: string | null;
};

function normalizeChangeValue(value: unknown) {
  if (value == null || value === '') return null;
  if (typeof value === 'boolean') return value ? 'да' : 'нет';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : null;
  const text = String(value);
  if (text === '0' || text === '1') {

  }
  return text;
}

function displayChangeValue(field: string, value: string | null) {
  if (value == null || value === '') return '—';
  if (field === 'is_active') {
    if (value === '1' || value === 'true') return 'активен';
    if (value === '0' || value === 'false') return 'выключен';
  }
  if (field === 'role') {
    const roles: Record<string, string> = { admin: 'админ', user: 'пользователь', operator: 'оператор' };
    return roles[value] || value;
  }
  if (field === 'password_hash') return value ? 'задан' : 'не задан';
  if (field === 'permissions_json' || field === 'location_scope_json') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.length ? `${parsed.length} склад(ов)` : 'без ограничений';
      if (parsed && typeof parsed === 'object') {
        const on = Object.entries(parsed).filter(([, v]) => v === true).map(([k]) => k);
        return on.length ? on.slice(0, 8).join(', ') + (on.length > 8 ? '…' : '') : 'без отдельных прав';
      }
    } catch {  }
  }
  if (value.length > 120) return `${value.slice(0, 117)}…`;
  return value;
}

export function formatEntityChangeSummary(
  changes: EntityChangeLine[],
  opts: { subject?: string; verb?: string } = {},
) {
  if (!changes.length) return opts.subject ? `${opts.verb || 'Изменён'} ${opts.subject} (без изменения полей)` : 'Без изменения полей';
  const lines = changes.map((c) => {
    const from = displayChangeValue(c.field, c.old_value);
    const to = displayChangeValue(c.field, c.new_value);
    return `${c.field_label}: «${from}» → «${to}»`;
  });
  const head = opts.subject
    ? `${opts.verb || 'Изменён'} ${opts.subject}`
    : (opts.verb || 'Изменены поля');
  const body = lines.join('; ');
  const full = `${head}: ${body}`;
  return full.length > 1900 ? `${full.slice(0, 1897)}…` : full;
}

export function collectEntityChanges(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown>,
  fields: string[],
): EntityChangeLine[] {
  if (!before) return [];
  const out: EntityChangeLine[] = [];
  for (const field of fields) {
    const oldValue = normalizeChangeValue(before[field]);
    const newValue = normalizeChangeValue(after[field]);
    if (oldValue === newValue) continue;
    out.push({
      field,
      field_label: fieldLabel(field),
      old_value: oldValue,
      new_value: newValue,
    });
  }
  return out;
}

export function logEntityChanges(
  entity: string,
  entityId: number,
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown>,
  fields: string[],
  userName?: string | null,
): EntityChangeLine[] {
  const changes = collectEntityChanges(before, after, fields);
  if (!db || !entityId || !changes.length) return changes;
  const insert = db.prepare(`INSERT INTO entity_changes (entity, entity_id, field, old_value, new_value, user_name) VALUES (?, ?, ?, ?, ?, ?)`);
  for (const row of changes) {
    insert.run(entity, entityId, row.field, row.old_value, row.new_value, userName || null);
  }
  return changes;
}

export function listEntityChanges(filters: { entity?: string; entityId?: number; limit?: number } = {}) {
  const limit = Math.max(1, Math.min(500, Number(filters.limit) || 100));
  if (filters.entity && filters.entityId) {
    return db.prepare(`SELECT * FROM entity_changes WHERE entity = ? AND entity_id = ? ORDER BY id DESC LIMIT ?`)
      .all(filters.entity, Number(filters.entityId), limit);
  }
  if (filters.entity) {
    return db.prepare(`SELECT * FROM entity_changes WHERE entity = ? ORDER BY id DESC LIMIT ?`)
      .all(filters.entity, limit);
  }
  return db.prepare(`SELECT * FROM entity_changes ORDER BY id DESC LIMIT ?`).all(limit);
}

export function fieldLabel(field: string) {
  if (FIELD_LABELS[field]) return FIELD_LABELS[field];
  if (String(field || '').startsWith('cf:') && db) {
    const key = String(field).slice(3);
    try {
      const def = db.prepare(
        `SELECT label FROM custom_field_defs WHERE entity = 'item' AND field_key = ? LIMIT 1`,
      ).get(key) as any;
      if (def?.label) return String(def.label);
    } catch {  }
    return key || field;
  }
  return field;
}

export function persistEntityChangeLines(
  entity: string,
  entityId: number,
  lines: EntityChangeLine[],
  userName?: string | null,
): EntityChangeLine[] {
  if (!db || !entityId || !lines.length) return lines;
  const insert = db.prepare(
    `INSERT INTO entity_changes (entity, entity_id, field, old_value, new_value, user_name) VALUES (?, ?, ?, ?, ?, ?)`,
  );
  for (const row of lines) {
    insert.run(entity, entityId, row.field, row.old_value, row.new_value, userName || null);
  }
  return lines;
}

export function reserveStatusSql(alias = 'p') {
  return `${alias}.status IN ('reserved', 'picking', 'picked', 'assembly')`;
}

export type LedgerEntry = {
  item_id: number;
  location_id?: number | null;
  type: 'in' | 'out' | 'move' | 'adjustment' | 'reserve' | 'release';
  quantity: number;
  comment?: string | null;
  reason?: string | null;
  source?: string | null;
  from_location_id?: number | null;
  to_location_id?: number | null;
  document_ref?: string | null;
  project_id?: number | null;
  user_name?: string | null;
  lot_id?: number | null;
};

export function insertLedger(entry: LedgerEntry) {
  const locationId = entry.location_id ?? entry.to_location_id ?? entry.from_location_id ?? null;
  const lotId = entry.lot_id != null && Number(entry.lot_id) > 0 ? Math.floor(Number(entry.lot_id)) : null;
  return db.prepare(`INSERT INTO transactions (
    item_id, location_id, type, quantity, comment, reason, source,
    from_location_id, to_location_id, document_ref, project_id, user_name, lot_id
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    entry.item_id,
    locationId,
    entry.type,
    Math.abs(Number(entry.quantity) || 0),
    entry.comment || null,
    entry.reason || null,
    entry.source || 'MANUAL',
    entry.from_location_id ?? null,
    entry.to_location_id ?? null,
    entry.document_ref ?? null,
    entry.project_id ?? null,
    entry.user_name || 'Локальный оператор',
    lotId,
  );
}

export function normalizeBarcodes(data: any): string[] {
  const primary = String(data?.barcode || '').trim();
  const extra = Array.isArray(data?.barcodes) ? data.barcodes : [];
  const all = [primary, ...extra].map((value) => String(value || '').trim()).filter(Boolean);
  return [...new Set(all)];
}

export function assertBarcodesAvailable(codes: string[], itemId?: number, locationId?: number) {
  for (const code of codes) {
    const itemHit = db.prepare('SELECT id FROM items WHERE barcode = ? AND id != ?').get(code, itemId || 0) as any;
    const extraHit = db.prepare('SELECT item_id FROM item_barcodes WHERE barcode = ? AND item_id != ?').get(code, itemId || 0) as any;
    const locationHit = db.prepare('SELECT id FROM locations WHERE barcode = ? AND id != ?').get(code, locationId || 0) as any;
    if (itemHit || extraHit) throw new Error(`Штрихкод «${code}» уже привязан к другому товару`);
    if (locationHit) throw new Error(`Штрихкод «${code}» уже используется ячейкой хранения`);
  }
}

export function syncItemBarcodes(itemId: number, codes: string[]) {
  const barcodes = [...new Set(codes.map((code) => String(code || '').trim()).filter(Boolean))];
  assertBarcodesAvailable(barcodes, itemId);
  db.prepare('DELETE FROM item_barcodes WHERE item_id = ?').run(itemId);
  if (!barcodes.length) {
    db.prepare('UPDATE items SET barcode = NULL WHERE id = ?').run(itemId);
    return [];
  }
  const insert = db.prepare('INSERT INTO item_barcodes (item_id, barcode, is_primary) VALUES (?, ?, ?)');
  barcodes.forEach((code, index) => insert.run(itemId, code, index === 0 ? 1 : 0));
  db.prepare('UPDATE items SET barcode = ? WHERE id = ?').run(barcodes[0], itemId);
  return barcodes;
}

export function barcodesForItem(itemId: number): string[] {
  const rows = db.prepare('SELECT barcode FROM item_barcodes WHERE item_id = ? ORDER BY is_primary DESC, id').all(itemId) as any[];
  return rows.map((row) => row.barcode);
}

export function attachBarcodes<T extends { id: number; barcode?: string; barcodes_raw?: string }>(row: T) {
  const barcodes = row.barcodes_raw
    ? String(row.barcodes_raw).split('|||').filter(Boolean)
    : barcodesForItem(row.id);
  return { ...row, barcodes: barcodes.length ? barcodes : [row.barcode].filter(Boolean) };
}

export function mapDbError(error: any): Error {
  const message = String(error?.message || error || '');
  if (message.includes('UNIQUE') && message.toLowerCase().includes('barcode')) {
    return new Error('Этот штрихкод уже используется');
  }
  if (message.includes('UNIQUE')) return new Error('Запись с такими данными уже существует');
  if (message.includes('FOREIGN KEY')) return new Error('Нельзя удалить запись: есть связанные данные');
  return error instanceof Error ? error : new Error(message || 'Ошибка базы данных');
}

export function getDb() {
  if (!db) throw new Error('База организации не открыта');
  return db;
}

export function getDatabasePath() {
  return dbPath;
}

export function closeDatabase() {
  if (!db) return;
  try { db.pragma('wal_checkpoint(TRUNCATE)'); } catch {  }
  try { db.close(); } catch {  }
  db = undefined as any;
  dbPath = '';
}

export function stampedFileName(base: string, ext: string) {
  const cleanBase = String(base || 'metrika').replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'metrika';
  const cleanExt = String(ext || 'dat').replace(/^\./, '');
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `${cleanBase}_${stamp}.${cleanExt}`;
}

export function backupDatabase(destination: string) {
  db.pragma('wal_checkpoint(TRUNCATE)');
  fs.copyFileSync(dbPath, destination);
}

export async function restoreDatabase(source: string) {
  if (path.resolve(source) === path.resolve(dbPath)) throw new Error('Выберите файл резервной копии, а не активную базу');
  const stagedPath = `${dbPath}.restore-${Date.now()}`;
  const safetyPath = path.join(path.dirname(dbPath), 'backups', `metrika-before-import-${new Date().toISOString().replace(/[:.]/g, '-')}.db`);
  fs.mkdirSync(path.dirname(safetyPath), { recursive: true });
  let sourceDb: Database.Database | null = null;
  try {
    sourceDb = new Database(source, { readonly: true, fileMustExist: true });
    const integrity = (sourceDb.pragma('integrity_check') as any[])[0]?.integrity_check;
    if (integrity !== 'ok') throw new Error('Файл базы данных поврежден');
    const tables = new Set((sourceDb.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as any[]).map((row) => row.name));
    for (const table of ['items', 'locations', 'inventory', 'transactions']) {
      if (!tables.has(table)) throw new Error('Файл не похож на резервную копию Metrika: отсутствуют основные таблицы');
    }
    await sourceDb.backup(stagedPath);
  } catch (error) {
    if (sourceDb?.open) sourceDb.close();
    if (fs.existsSync(stagedPath)) fs.rmSync(stagedPath, { force: true });
    throw error instanceof Error ? error : new Error('Не удалось прочитать резервную копию');
  }
  if (sourceDb?.open) sourceDb.close();

  const stagedDb = new Database(stagedPath, { readonly: true, fileMustExist: true });
  const stagedIntegrity = (stagedDb.pragma('integrity_check') as any[])[0]?.integrity_check;
  stagedDb.close();
  if (stagedIntegrity !== 'ok') {
    fs.rmSync(stagedPath, { force: true });
    throw new Error('Не удалось проверить подготовленную базу');
  }

  db.pragma('wal_checkpoint(TRUNCATE)');
  const currentPath = dbPath;
  db.close();
  try {
    fs.copyFileSync(currentPath, safetyPath);
    fs.copyFileSync(stagedPath, currentPath);
    initDatabase(currentPath);
    fs.rmSync(stagedPath, { force: true });
    return safetyPath;
  } catch (error) {
    if (db?.open) db.close();
    if (fs.existsSync(safetyPath)) fs.copyFileSync(safetyPath, currentPath);
    initDatabase(currentPath);
    if (fs.existsSync(stagedPath)) fs.rmSync(stagedPath, { force: true });
    throw error instanceof Error ? error : new Error('Не удалось восстановить резервную копию');
  }
}
