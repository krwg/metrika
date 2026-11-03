import { app, BrowserWindow, dialog, ipcMain, Notification, shell } from 'electron';
import { openConfiguratorWindow, openCrmWindow, openClientWindow, listAppWindows } from './configWindow';
import { broadcastDataChanged } from './uiBroadcast';
import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import bwipjs from 'bwip-js';
import {
  defaultFormForKind,
  formsForKind,
  renderPrintDocument,
  setPrintCurrencySymbol,
  type OrgPrintInfo,
  type PrintDocModel,
  type PrintFormId,
} from './printForms';
import {
  SYSTEM_PRINT_TEMPLATES,
  blankTemplate,
  cloneTemplate,
  renderWithTemplate,
  templatesForKind,
  type PrintTemplate,
} from './printTemplates';
import {
  ACTIVE_RESERVE_STATUSES,
  assertBarcodesAvailable,
  attachBarcodes,
  backupDatabase,
  barcodesForItem,
  addItemAnalog,
  computeOrgHealth,
  diagnoseDatabase,
  listItemAnalogs,
  removeItemAnalog,
  listItemCharacteristics,
  upsertItemCharacteristic,
  removeItemCharacteristic,
  listCharacteristicNameHints,
  listKitComponents,
  upsertKitComponent,
  removeKitComponent,
  upsertKitAlternative,
  removeKitAlternative,
  resolveKitBomLines,
  listBomVersions,
  saveBomVersion,
  setDefaultBomVersion,
  copyBomVersion,
  deleteBomVersion,
  listTechOperations,
  saveTechOperation,
  deleteTechOperation,
  applyTechOpsToProject,
  listProjectOperations,
  addProjectOperation,
  setProjectOperationDone,
  removeProjectOperation,
  assignProject,
  refreshProjectCostFields,
  computeProjectActualCostFromReservations,
  applyFinishedGoodCost,
  summarizeOrgWip,
  listItemParentKits,
  createPackFromItem,
  isBomItemType,
  resolveUnpackComponents,
  getDocWorkflowExtras,
  displayDocumentStatus,
  setDocumentWorkflowStatus,
  getStockAtLocation,
  addStockAtLocation,
  setStockAtLocation,
  findOrCreateLot,
  allocateLotsForIssue,
  applyCountDeltaAtLocation,
  listItemLots,
  listLotsAtLocation,
  listExpiringLots,
  getExpiryWarnDays,
  listItemSerials,
  listSerialsAtLocation,
  parseSerialList,
  receiveSerials,
  issueSerials,
  transferSerials,
  normalizeLotId,
  normalizeQty,
  normalizeQtyForItem,
  deleteDocumentAttachment,
  getDocumentAttachment,
  getAttachmentsRoot,
  attachmentAbsPath,
  getReservedQty,
  insertDocumentAttachment,
  listDocumentAttachments,
  listStockReserves,
  listInventoryLedgerDrift,
  nextAttachmentVersion,
  purgeStaleReservations,
  rebuildInventoryFromLedger,
  healLedgerDriftToInventory,
  summarizeStockReserves,
  listHungReserves,
  autoReleaseHungReserves,
  getReserveStaleDays,
  getDocStatusLabels,
  listCustomFieldDefs,
  listItemCustomValues,
  listCounterpartyCustomValues,
  listEmployeeCustomValues,
  listDocumentCustomValues,
  saveDocumentCustomValues,
  upsertCustomFieldDef,
  archiveCustomFieldDef,
  saveItemCustomValues,
  CUSTOM_FIELD_ENTITIES,
  recomputeItemFormulaValues,
  evaluateCustomFormula,
  buildItemFormulaVars,
  computeItemFormulaFields,
  fieldLabel,
  getDb,
  getDocumentById,
  insertLedger,
  listDocumentChildren,
  listDocumentSeries,
  listEntityChanges,
  logEntityChanges,
  formatEntityChangeSummary,
  collectEntityChanges,
  persistEntityChangeLines,
  mapDbError,
  nextDocumentNo,
  nextCatalogCode,
  normalizeBarcodes,
  listItemVariants,
  createItemVariant,
  previewNextDocumentNo,
  resetDocumentSeriesCounter,
  restoreDatabase,
  saveDocumentSeries,
  stampedFileName,
  syncItemBarcodes,
  upsertDocument,
} from './db';
import { SerialPort } from 'serialport';
import { ScannerManager } from './scanner';
import * as registry from './registry';
import * as companyHub from './companyHub';
import * as automation from './automation';
import * as assetsHub from './assets';
import * as partiesHub from './parties';
import { syncCategoryTaxonomy } from './categoryTaxonomy';
import {
  backupOnSessionBoundary,
  exportOrganizationDatabase,
  listAutoBackups,
  openAutoBackupFolder,
  runAutoBackup,
  startAutoBackupScheduler,
  stopAutoBackupScheduler,
  suggestExportName,
} from './autobackup';
import {
  enrichItemPrices,
  isPackageBasis,
  moneyQty,
  packageSize,
  roundMoney,
  toUnitPrice,
} from './pricing';


import {
  backfillSupplierCounterpartyLinks,
  ensureCounterpartyForSupplier,
  registerModernIpcHandlers,
} from './ipcModern';
import { maybeAutostartCrmRemoteServer, stopCrmRemoteServer } from './crmRemoteServer';
import { maybeAutostartMiapiServer, stopMiapiServer } from './miapiServer';
import {
  applyProjectScan,
  enqueueTsdOp,
  flushTsdOutbox,
  getTsdOutboxStatus,
  scanProjectOrEnqueue,
} from './tsdOutbox';
import { ensurePluginsLoaded } from './plugins';
import { ensureDefaultWorkflowSeed } from './workflow';
function readBackupPrefs() {
  try {
    const db = getDb();
    const keepRaw = (db.prepare('SELECT value FROM settings WHERE key = ?').get('backup.keep') as any)?.value;
    const hoursRaw = (db.prepare('SELECT value FROM settings WHERE key = ?').get('backup.intervalHours') as any)?.value;
    return {
      keep: Math.max(3, Math.min(200, Number(keepRaw) || 30)),
      intervalHours: Math.max(1, Math.min(72, Number(hoursRaw) || 6)),
    };
  } catch {
    return { keep: 30, intervalHours: 6 };
  }
}

function fileToDataUrl(filePath?: string | null): string {
  if (!filePath) return '';
  try {
    if (!fs.existsSync(filePath)) return '';
    const ext = path.extname(filePath).slice(1).toLowerCase();
    const mime = ext === 'jpg' || ext === 'jpeg' ? 'jpeg'
      : ext === 'png' ? 'png'
      : ext === 'webp' ? 'webp'
      : ext === 'gif' ? 'gif'
      : 'jpeg';
    return `data:image/${mime};base64,${fs.readFileSync(filePath).toString('base64')}`;
  } catch {
    return '';
  }
}

export function registerIpcHandlers(scanner: ScannerManager) {
  function actorName() {
    return registry.actorName();
  }
  function requirePerm(key: string) {
    registry.requirePerm(key);
  }
  function audit(action: string, entity?: string, entityId?: string | number | null, detail?: string) {
    registry.logAudit(action, { entity, entityId, detail });
  }
  function touchUi(scope = 'stock') {
    try { broadcastDataChanged(scope); } catch {  }
  }

  
  const originalHandle = ipcMain.handle.bind(ipcMain);
  (ipcMain as any).handle = (channel: string, listener: (...args: any[]) => any) => {
    try { ipcMain.removeHandler(channel); } catch {  }
    return originalHandle(channel, listener);
  };

  try {
  ipcMain.handle('db:query', (_e, sql: string, params: any[] = []) => {
    registry.requireSession();
    if (registry.getSession()?.user?.role !== 'admin') {
      throw new Error('Прямой SQL-запрос доступен только администратору');
    }
    const text = String(sql || '').trim();
    if (!/^(SELECT|WITH|PRAGMA)\b/i.test(text)) {
      throw new Error('db:query разрешает только SELECT / WITH / PRAGMA');
    }
    return getDb().prepare(text).all(...(params || []));
  });
  ipcMain.handle('db:run', (_e, sql: string, params: any[] = []) => {
    registry.requireSession();
    if (registry.getSession()?.user?.role !== 'admin') {
      throw new Error('Прямой SQL-запуск доступен только администратору');
    }
    const text = String(sql || '').trim();
    if (/^(DROP|ATTACH|DETACH|VACUUM|REINDEX)\b/i.test(text)) {
      throw new Error('Опасная SQL-команда запрещена через db:run');
    }
    const result = getDb().prepare(text).run(...(params || []));
    return { changes: result.changes, lastInsertRowid: result.lastInsertRowid };
  });

  ipcMain.handle('items:list', (_e, search?: string) => {
    const db = getDb();
    const sql = `SELECT i.*, u.name AS unit_name, u.symbol AS unit_symbol,
      COALESCE(SUM(inv.quantity), 0) as on_hand,
      COALESCE(SUM(inv.quantity), 0) as total_qty,
      COALESCE((SELECT SUM(pr.quantity) FROM project_reservations pr JOIN projects p ON p.id = pr.project_id WHERE pr.item_id = i.id AND p.status IN ('reserved','picking','picked','assembly')), 0) AS reserved,
      COALESCE((SELECT SUM(ic.quantity) FROM item_conditions ic WHERE ic.item_id = i.id AND ic.condition != 'ok'), 0) AS blocked_qty,
      COALESCE((SELECT SUM(ic.quantity) FROM item_conditions ic WHERE ic.item_id = i.id AND ic.condition = 'ok'), 0) AS ok_qty,
      (SELECT COUNT(*) FROM inventory places WHERE places.item_id = i.id AND places.quantity > 0) AS location_count,
      (SELECT GROUP_CONCAT(l.name, ', ') FROM inventory places
        JOIN locations l ON l.id = places.location_id
        WHERE places.item_id = i.id AND places.quantity > 0) AS places_label,
      (SELECT MAX(t.timestamp) FROM transactions t WHERE t.item_id = i.id AND t.reversed_at IS NULL) AS last_movement,
      (SELECT file_path FROM item_photos photo WHERE photo.item_id = i.id ORDER BY photo.id DESC LIMIT 1) AS photo_path,
      (SELECT GROUP_CONCAT(b.barcode, '|||') FROM item_barcodes b WHERE b.item_id = i.id) as barcodes_raw
      FROM items i
      LEFT JOIN units u ON u.id = i.unit_id
      LEFT JOIN inventory inv ON inv.item_id = i.id
      ${search ? ` WHERE i.barcode LIKE ? OR i.name LIKE ? OR IFNULL(i.sku,'') LIKE ? OR IFNULL(i.category,'') LIKE ? OR EXISTS (SELECT 1 FROM item_barcodes b WHERE b.item_id = i.id AND b.barcode LIKE ?) ` : ''}
      GROUP BY i.id ORDER BY i.name`;
    const rows = search
      ? db.prepare(sql).all(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`)
      : db.prepare(sql).all();
    return (rows as any[]).map((row) => {
      const onHand = Number(row.on_hand || 0);
      const reserved = Number(row.reserved || 0);
      const blocked = Number(row.blocked_qty || 0);
      const hasConditions = Number(row.ok_qty || 0) + blocked > 0;
      const serviceable = hasConditions ? Math.max(0, onHand - blocked) : onHand;
      const photoPath = row.photo_path;
      const { photo_path: _photoPath, ...rest } = row;

      const hasPhoto = Boolean(photoPath);
      return attachBarcodes({
        ...rest,
        on_hand: onHand,
        reserved,
        blocked_qty: blocked,
        available: Math.max(0, Math.min(onHand - reserved, serviceable - reserved)),
        total_qty: onHand,
        stock_value: Number(row.cost_price || 0) * onHand,
        has_photo: hasPhoto,
        photo_url: hasPhoto ? `metrika-photo://${row.id}` : '',
      });
    });
  });

  ipcMain.handle('items:findByBarcode', (_e, barcode: string) => {
    const db = getDb();
    const code = String(barcode || '').trim();
    if (!code) return null;
    const item = db.prepare(`SELECT i.*, u.name AS unit_name, u.symbol AS unit_symbol FROM items i LEFT JOIN units u ON u.id = i.unit_id WHERE i.barcode = ? OR EXISTS (SELECT 1 FROM item_barcodes b WHERE b.item_id = i.id AND b.barcode = ?) LIMIT 1`).get(code, code) as any;
    if (!item) return null;
    return hydrateItem(item);
  });

  ipcMain.handle('items:getById', (_e, itemId: number) => {
    const db = getDb();
    const id = Number(itemId);
    if (!Number.isInteger(id) || id <= 0) return null;
    const item = db.prepare(`SELECT i.*, u.name AS unit_name, u.symbol AS unit_symbol FROM items i LEFT JOIN units u ON u.id = i.unit_id WHERE i.id = ? LIMIT 1`).get(id) as any;
    if (!item) return null;
    return hydrateItem(item);
  });

  function hydrateItem(item: any) {
    const db = getDb();
    const stock = db.prepare(`SELECT l.id, l.name, l.barcode as loc_barcode, SUM(inv.quantity) AS on_hand,
      COALESCE((SELECT SUM(pr.quantity) FROM project_reservations pr JOIN projects p ON p.id = pr.project_id WHERE pr.item_id = ? AND pr.location_id = inv.location_id AND p.status IN ('reserved','picking','picked','assembly')), 0) AS reserved
      FROM inventory inv JOIN locations l ON l.id = inv.location_id WHERE inv.item_id = ?
      GROUP BY l.id, l.name, l.barcode, inv.location_id`).all(item.id, item.id).map((row: any) => ({
      ...row,
      quantity: Number(row.on_hand || 0),
      on_hand: Number(row.on_hand || 0),
      reserved: Number(row.reserved || 0),
      available: Math.max(0, Number(row.on_hand || 0) - Number(row.reserved || 0)),
    }));
    const lotStock = db.prepare(`
      SELECT inv.location_id, inv.lot_id, inv.quantity AS on_hand,
        l.name AS location_name, lots.lot_no, lots.expiry_date, lots.received_at
      FROM inventory inv
      JOIN locations l ON l.id = inv.location_id
      LEFT JOIN lots ON lots.id = inv.lot_id
      WHERE inv.item_id = ? AND inv.quantity > 0
      ORDER BY l.name, lots.expiry_date IS NULL, lots.expiry_date, lots.lot_no
    `).all(item.id) as any[];
    const onHand = stock.reduce((sum: number, row: any) => sum + row.on_hand, 0);
    const reserved = stock.reduce((sum: number, row: any) => sum + row.reserved, 0);
    const conditions = db.prepare('SELECT condition, quantity FROM item_conditions WHERE item_id = ?').all(item.id) as any[];
    const blocked = conditions.filter((row) => row.condition !== 'ok').reduce((sum, row) => sum + Number(row.quantity || 0), 0);
    const hasConditions = conditions.length > 0;
    const serviceable = hasConditions ? Math.max(0, onHand - blocked) : onHand;
    const photo = db.prepare('SELECT file_path FROM item_photos WHERE item_id = ? ORDER BY id DESC LIMIT 1').get(item.id) as any;
    const hasFile = Boolean(photo?.file_path && fs.existsSync(photo.file_path));
    const photoUrl = hasFile ? `metrika-photo://${item.id}` : '';
    return {
      ...item,
      track_lots: Number(item.track_lots || 0) ? 1 : 0,
      lot_policy: item.lot_policy || 'fifo',
      photo_url: photoUrl,
      has_photo: hasFile,
      barcodes: barcodesForItem(item.id),
      stock,
      lot_stock: lotStock,
      on_hand: onHand,
      reserved,
      blocked_qty: blocked,
      available: Math.max(0, Math.min(onHand - reserved, serviceable - reserved)),
      total_qty: onHand,
      stock_value: Number(item.cost_price || 0) * onHand,
      conditions,
    };
  }

  ipcMain.handle('items:create', (_e, data: any) => {
    requirePerm('items_edit');
    const db = getDb();
    try {
      const barcodes = normalizeBarcodes(data);
      if (!String(data.name || '').trim()) throw new Error('Заполните рабочее название товара');
      const sku = String(data.sku || '').trim();
      if (sku && db.prepare('SELECT 1 FROM items WHERE upper(trim(sku)) = upper(trim(?)) LIMIT 1').get(sku)) throw new Error(`Артикул «${sku}» уже используется`);
      const unitId = Number(data.unit_id) || Number((db.prepare('SELECT id FROM units WHERE symbol = ?').get('шт.') as any)?.id);
      if (!db.prepare('SELECT 1 FROM units WHERE id = ? AND is_active = 1').get(unitId)) throw new Error('Выберите действующую единицу измерения');
      const price = data.sale_price === '' || data.sale_price == null ? null : Number(data.sale_price);
      const cost = data.cost_price === '' || data.cost_price == null ? null : Number(data.cost_price);
      if (price != null && (!Number.isFinite(price) || price < 0)) throw new Error('Цена должна быть положительным числом');
      if (cost != null && (!Number.isFinite(cost) || cost < 0)) throw new Error('Учетная цена должна быть положительным числом');
      const packageQty = data.package_qty === '' || data.package_qty == null ? null : Math.max(1, Number(data.package_qty) || 0);
      const weight = data.weight_g === '' || data.weight_g == null ? null : Number(data.weight_g);
      const lead = data.lead_time_days === '' || data.lead_time_days == null ? null : Math.max(0, Number(data.lead_time_days) || 0);
      const moq = data.moq === '' || data.moq == null ? null : Math.max(0, Number(data.moq) || 0);
      const packMultiple = data.pack_multiple === '' || data.pack_multiple == null ? null : Math.max(1, Number(data.pack_multiple) || 0);
      if (packageQty != null && (!Number.isFinite(packageQty) || packageQty < 1)) throw new Error('Кратность упаковки должна быть целым числом >= 1');
      if (weight != null && (!Number.isFinite(weight) || weight < 0)) throw new Error('Вес должен быть положительным числом');
      const itemType = ['product', 'service', 'kit'].includes(String(data.item_type || ''))
        ? String(data.item_type)
        : 'product';
      const trackLots = data.track_lots ? 1 : 0;
      const lotPolicy = ['fifo', 'fefo', 'none'].includes(String(data.lot_policy || ''))
        ? String(data.lot_policy)
        : 'fifo';
      const create = db.transaction(() => {
        assertBarcodesAvailable(barcodes);
        const result = db.prepare(`INSERT INTO items (barcode, name, sku, category, min_stock, description, print_name, unit_id, sale_price, cost_price, origin, manufacturer, package_qty, weight_g, storage_note, supplier_sku, purchase_url, lead_time_days, moq, pack_multiple, item_type, track_lots, lot_policy) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(barcodes[0] || null, String(data.name).trim(), sku || null, data.category || null, Number(data.min_stock) || 0, String(data.description || '').trim() || null, String(data.print_name || '').trim() || null, unitId, price, cost, String(data.origin || '').trim() || null, String(data.manufacturer || '').trim() || null, packageQty, weight, String(data.storage_note || '').trim() || null, String(data.supplier_sku || '').trim() || null, String(data.purchase_url || '').trim() || null, lead, moq, packMultiple, itemType, trackLots, lotPolicy);
        if (barcodes.length) syncItemBarcodes(Number(result.lastInsertRowid), barcodes);
        return { id: result.lastInsertRowid };
      });
      const created = create();
      audit('item.create', 'item', Number(created.id), String(data.name || '').trim());
      return created;
    } catch (error) {
      throw mapDbError(error);
    }
  });

  ipcMain.handle('items:update', (_e, id: number, data: any) => {
    requirePerm('items_edit');
    const db = getDb();
    try {
      const before = db.prepare('SELECT * FROM items WHERE id = ?').get(id) as any;
      if (!before) throw new Error('Товар не найден');
      const barcodes = normalizeBarcodes(data);
      if (!String(data.name || '').trim()) throw new Error('Заполните рабочее название товара');
      const sku = String(data.sku || '').trim();
      if (sku && db.prepare('SELECT 1 FROM items WHERE upper(trim(sku)) = upper(trim(?)) AND id != ? LIMIT 1').get(sku, id)) throw new Error(`Артикул «${sku}» уже используется`);
      const unitId = Number(data.unit_id) || Number((db.prepare('SELECT id FROM units WHERE symbol = ?').get('шт.') as any)?.id);
      if (!db.prepare('SELECT 1 FROM units WHERE id = ?').get(unitId)) throw new Error('Выберите единицу измерения');
      const price = data.sale_price === '' || data.sale_price == null ? null : Number(data.sale_price);
      const cost = data.cost_price === '' || data.cost_price == null ? null : Number(data.cost_price);
      if (price != null && (!Number.isFinite(price) || price < 0)) throw new Error('Цена должна быть положительным числом');
      if (cost != null && (!Number.isFinite(cost) || cost < 0)) throw new Error('Учетная цена должна быть положительным числом');
      const packageQty = data.package_qty === '' || data.package_qty == null ? null : Math.max(1, Number(data.package_qty) || 0);
      const weight = data.weight_g === '' || data.weight_g == null ? null : Number(data.weight_g);
      const lead = data.lead_time_days === '' || data.lead_time_days == null ? null : Math.max(0, Number(data.lead_time_days) || 0);
      const moq = data.moq === '' || data.moq == null ? null : Math.max(0, Number(data.moq) || 0);
      const packMultiple = data.pack_multiple === '' || data.pack_multiple == null ? null : Math.max(1, Number(data.pack_multiple) || 0);
      if (packageQty != null && (!Number.isFinite(packageQty) || packageQty < 1)) throw new Error('Кратность упаковки должна быть целым числом >= 1');
      if (weight != null && (!Number.isFinite(weight) || weight < 0)) throw new Error('Вес должен быть положительным числом');
      const itemType = ['product', 'service', 'kit'].includes(String(data.item_type || ''))
        ? String(data.item_type)
        : (before.item_type || 'product');
      const trackLots = data.track_lots != null ? (data.track_lots ? 1 : 0) : (Number(before.track_lots) ? 1 : 0);
      const lotPolicy = ['fifo', 'fefo', 'none'].includes(String(data.lot_policy || ''))
        ? String(data.lot_policy)
        : (before.lot_policy || 'fifo');
      const after = {
        barcode: barcodes[0] || null,
        name: String(data.name).trim(),
        sku: sku || null,
        category: data.category || null,
        min_stock: Number(data.min_stock) || 0,
        description: String(data.description || '').trim() || null,
        print_name: String(data.print_name || '').trim() || null,
        unit_id: unitId,
        sale_price: price,
        cost_price: cost,
        origin: String(data.origin || '').trim() || null,
        manufacturer: String(data.manufacturer || '').trim() || null,
        package_qty: packageQty,
        weight_g: weight,
        storage_note: String(data.storage_note || '').trim() || null,
        supplier_sku: String(data.supplier_sku || '').trim() || null,
        purchase_url: String(data.purchase_url || '').trim() || null,
        lead_time_days: lead,
        moq,
        pack_multiple: packMultiple,
        item_type: itemType,
        track_lots: trackLots,
        lot_policy: lotPolicy,
      };
      const tracked = Object.keys(after);
      const update = db.transaction(() => {
        db.prepare(`UPDATE items SET barcode = ?, name = ?, sku = ?, category = ?, min_stock = ?, description = ?, print_name = ?, unit_id = ?, sale_price = ?, cost_price = ?, origin = ?, manufacturer = ?, package_qty = ?, weight_g = ?, storage_note = ?, supplier_sku = ?, purchase_url = ?, lead_time_days = ?, moq = ?, pack_multiple = ?, item_type = ?, track_lots = ?, lot_policy = ? WHERE id = ?`).run(
          after.barcode, after.name, after.sku, after.category, after.min_stock, after.description, after.print_name, after.unit_id,
          after.sale_price, after.cost_price, after.origin, after.manufacturer, after.package_qty, after.weight_g, after.storage_note,
          after.supplier_sku, after.purchase_url, after.lead_time_days, after.moq, after.pack_multiple, after.item_type,
          after.track_lots, after.lot_policy, id,
        );
        syncItemBarcodes(id, barcodes);
        const changed = logEntityChanges('item', id, before, after, tracked, actorName());
        return { changes: 1, fields_changed: changed };
      });
      const result = update();
      audit('item.update', 'item', id, `${after.name}${result.fields_changed ? ` · полей: ${result.fields_changed}` : ''}`);
      return result;
    } catch (error) {
      throw mapDbError(error);
    }
  });

  ipcMain.handle('history:list', (_e, filters: any = {}) => {
    registry.requireSession();
    return (listEntityChanges({
      entity: filters?.entity,
      entityId: filters?.entityId ? Number(filters.entityId) : undefined,
      limit: filters?.limit,
    }) as any[]).map((row) => ({
      ...row,
      field_label: fieldLabel(row.field),
    }));
  });

  ipcMain.handle('items:listAnalogs', (_e, itemId: number) => {
    registry.requireSession();
    return listItemAnalogs(Number(itemId));
  });
  ipcMain.handle('items:addAnalog', (_e, itemId: number, analogItemId: number, note?: string) => {
    requirePerm('items_edit');
    try {
      const rows = addItemAnalog(Number(itemId), Number(analogItemId), note);
      audit('item.analogAdd', 'item', Number(itemId), `→ #${analogItemId}`);
      return rows;
    } catch (error) {
      throw mapDbError(error);
    }
  });
  ipcMain.handle('items:removeAnalog', (_e, itemId: number, analogItemId: number) => {
    requirePerm('items_edit');
    const rows = removeItemAnalog(Number(itemId), Number(analogItemId));
    audit('item.analogRemove', 'item', Number(itemId), `× #${analogItemId}`);
    return rows;
  });

  ipcMain.handle('items:listCharacteristics', (_e, itemId: number) => {
    registry.requireSession();
    return listItemCharacteristics(Number(itemId));
  });
  ipcMain.handle('items:upsertCharacteristic', (_e, itemId: number, name: string, value: string) => {
    requirePerm('items_edit');
    try {
      const rows = upsertItemCharacteristic(Number(itemId), name, value);
      audit('item.characteristicUpsert', 'item', Number(itemId), `${String(name || '').trim()}=${String(value || '').trim()}`);
      return rows;
    } catch (error) {
      throw mapDbError(error);
    }
  });
  ipcMain.handle('items:removeCharacteristic', (_e, itemId: number, characteristicId: number) => {
    requirePerm('items_edit');
    const rows = removeItemCharacteristic(Number(itemId), Number(characteristicId));
    audit('item.characteristicRemove', 'item', Number(itemId), `#${characteristicId}`);
    return rows;
  });
  ipcMain.handle('items:characteristicHints', () => {
    registry.requireSession();
    return listCharacteristicNameHints(40);
  });

  ipcMain.handle('items:listKitComponents', (_e, kitItemId: number) => {
    registry.requireSession();
    return listKitComponents(Number(kitItemId));
  });
  ipcMain.handle('items:upsertKitComponent', (_e, kitItemId: number, componentItemId: number, quantity: number) => {
    requirePerm('items_edit');
    try {
      const rows = upsertKitComponent(Number(kitItemId), Number(componentItemId), quantity);
      audit('item.kitComponentUpsert', 'item', Number(kitItemId), `+ #${componentItemId} ×${quantity}`);
      return rows;
    } catch (error) {
      throw mapDbError(error);
    }
  });
  ipcMain.handle('items:removeKitComponent', (_e, kitItemId: number, componentItemId: number) => {
    requirePerm('items_edit');
    const rows = removeKitComponent(Number(kitItemId), Number(componentItemId));
    audit('item.kitComponentRemove', 'item', Number(kitItemId), `× #${componentItemId}`);
    return rows;
  });

  ipcMain.handle('items:listLots', (_e, itemId: number) => {
    registry.requireSession();
    return listItemLots(Number(itemId));
  });

  ipcMain.handle('items:delete', (_e, id: number) => {
    requirePerm('items_delete');
    const db = getDb();
    try {
      const existing = db.prepare('SELECT name FROM items WHERE id = ?').get(id) as any;
      const remove = db.transaction(() => {
        db.prepare('DELETE FROM work_order_scans WHERE item_id = ?').run(id);
        db.prepare('DELETE FROM project_reservations WHERE item_id = ?').run(id);
        db.prepare('DELETE FROM project_items WHERE item_id = ?').run(id);
        db.prepare('DELETE FROM inventory_counts WHERE item_id = ?').run(id);
        db.prepare('DELETE FROM item_photos WHERE item_id = ?').run(id);
        db.prepare('DELETE FROM item_barcodes WHERE item_id = ?').run(id);
        db.prepare('DELETE FROM item_analogs WHERE item_id = ? OR analog_item_id = ?').run(id, id);
        db.prepare('DELETE FROM item_characteristics WHERE item_id = ?').run(id);
        db.prepare('DELETE FROM item_kit_components WHERE kit_item_id = ? OR component_item_id = ?').run(id, id);
        db.prepare('DELETE FROM lots WHERE item_id = ?').run(id);
        db.prepare('DELETE FROM transactions WHERE item_id = ?').run(id);
        db.prepare('DELETE FROM inventory WHERE item_id = ?').run(id);
        return db.prepare('DELETE FROM items WHERE id = ?').run(id).changes;
      });
      const changes = remove();
      audit('item.delete', 'item', id, existing?.name || '');
      return { changes };
    } catch (error) {
      throw mapDbError(error);
    }
  });

  ipcMain.handle('items:importCsvPreview', async () => {
    const selected = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'CSV', extensions: ['csv', 'txt'] }] });
    if (selected.canceled || !selected.filePaths[0]) return null;
    const text = fs.readFileSync(selected.filePaths[0], 'utf8');
    const aliases: Record<string, string> = {
      'штрихкод': 'barcode', 'код': 'barcode', 'barcode': 'barcode',
      'название': 'name', 'товар': 'name', 'name': 'name', 'рабочее название': 'name',
      'артикул': 'sku', 'sku': 'sku',
      'категория': 'category', 'category': 'category',
      'минимум': 'min_stock', 'минимальный остаток': 'min_stock', 'min_stock': 'min_stock',
      'ячейка': 'location_barcode', 'адрес': 'location_barcode', 'location': 'location_barcode', 'location_barcode': 'location_barcode',
      'количество': 'quantity', 'остаток': 'quantity', 'quantity': 'quantity', 'stock': 'quantity',
      'описание': 'description', 'description': 'description',
      'для печати': 'print_name', 'наименование для печати': 'print_name', 'print_name': 'print_name',
      'цена': 'sale_price', 'цена продажи': 'sale_price', 'sale_price': 'sale_price',
      'учетная цена': 'cost_price', 'себестоимость': 'cost_price', 'cost_price': 'cost_price',
      'происхождение': 'origin', 'origin': 'origin',
      'единица': 'unit_symbol', 'ед': 'unit_symbol', 'unit': 'unit_symbol',
    };
    const parsed = Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: 'greedy',
      transformHeader: (header) => aliases[header.replace(/^\uFEFF/, '').trim().toLowerCase()] || header.trim().toLowerCase(),
      transform: (value) => value.trim(),
    });
    if (!parsed.meta.fields?.includes('name')) {
      throw new Error('В CSV обязателен столбец «Название» (или «Товар»)');
    }
    const rows = parsed.data.filter((row) => Object.values(row).some(Boolean)).slice(0, 5000);
    return { rows, total: rows.length, parseErrors: parsed.errors.slice(0, 8).map((entry) => `Строка ${(entry.row ?? 0) + 2}: ${entry.message}`), truncated: parsed.data.length > 5000 };
  });

  ipcMain.handle('items:importCsvApply', (_e, inputRows: any[]) => {
    requirePerm('items_edit');
    const db = getDb();
    const rows = Array.isArray(inputRows) ? inputRows.slice(0, 5000) : [];
    const palette = ['#397c74', '#4f6f9f', '#9b5d65', '#9a7134', '#705c9c', '#497d50'];
    const importOne = db.transaction((row: any) => {
      const barcode = String(row.barcode || '').trim();
      const name = String(row.name || '').trim();
      if (!name) throw new Error('Нужно название товара');
      const duplicate = barcode ? db.prepare('SELECT 1 FROM items WHERE barcode = ? UNION SELECT 1 FROM item_barcodes WHERE barcode = ? LIMIT 1').get(barcode, barcode) : null;
      if (duplicate) return false;
      const category = String(row.category || '').trim();
      if (category && !db.prepare('SELECT 1 FROM categories WHERE name = ?').get(category)) {
        db.prepare('INSERT INTO categories (name, color) VALUES (?, ?)').run(category, palette[Math.abs(category.length) % palette.length]);
      }
      const unitSymbol = String(row.unit_symbol || 'шт.').trim();
      const unit = db.prepare('SELECT id FROM units WHERE symbol = ?').get(unitSymbol) as any;
      const unitId = unit ? unit.id : (db.prepare('SELECT id FROM units WHERE symbol = ?').get('шт.') as any).id;
      const minStock = Math.max(0, Number.parseInt(String(row.min_stock || '0'), 10) || 0);
      const salePrice = row.sale_price !== undefined && row.sale_price !== '' ? Number(row.sale_price) : null;
      const costPrice = row.cost_price !== undefined && row.cost_price !== '' ? Number(row.cost_price) : null;
      const result = db.prepare('INSERT INTO items (barcode, name, sku, category, min_stock, description, print_name, unit_id, sale_price, cost_price, origin) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(barcode || null, name, String(row.sku || '').trim() || null, category || null, minStock, String(row.description || '').trim() || null, String(row.print_name || '').trim() || null, unitId, salePrice, costPrice, String(row.origin || '').trim() || null);
      const itemId = Number(result.lastInsertRowid);
      if (barcode) syncItemBarcodes(itemId, [barcode]);
      const quantity = Math.max(0, Number.parseInt(String(row.quantity || '0'), 10) || 0);
      const locationBarcode = String(row.location_barcode || '').trim();
      if (quantity > 0 && locationBarcode) {
        const location = db.prepare('SELECT id FROM locations WHERE barcode = ?').get(locationBarcode) as any;
        if (!location) throw new Error(`Ячейка «${locationBarcode}» не найдена`);
        db.prepare('INSERT INTO inventory (item_id, location_id, lot_id, quantity) VALUES (?, ?, 0, ?)').run(itemId, location.id, quantity);
        db.prepare('INSERT INTO transactions (item_id, location_id, type, quantity, comment, reason, source) VALUES (?, ?, ?, ?, ?, ?, ?)').run(itemId, location.id, 'in', quantity, 'Импорт CSV', 'INITIAL_INVENTORY', 'CSV_IMPORT');
      }
      return true;
    });
    const outcome = db.transaction(() => {
      const result = { imported: 0, skipped: 0, errors: [] as string[] };
      rows.forEach((row, index) => {
        try {
          if (importOne(row)) result.imported += 1;
          else result.skipped += 1;
        } catch (error: any) {
          result.errors.push(`Строка ${index + 2}: ${error?.message || 'Ошибка импорта'}`);
        }
      });
      return result;
    });
    return { ...outcome(), total: rows.length };
  });

  ipcMain.handle('items:printLabels', async (event, itemId: number) => {
    const db = getDb();
    const item = db.prepare('SELECT i.*, u.symbol AS unit_symbol FROM items i LEFT JOIN units u ON u.id = i.unit_id WHERE i.id = ?').get(itemId) as any;
    if (!item) throw new Error('Товар не найден');
    let codes = barcodesForItem(itemId);
    if (!codes.length && item.barcode) codes = [String(item.barcode).trim()].filter(Boolean);
    if (!codes.length) throw new Error('Нельзя печатать этикетку: штрихкод еще не назначен');

    let printCfg: any = {
      barcodeType: 'code128',
      labelWidthMm: 60,
      labelHeightMm: 40,
      showName: true,
      showSku: true,
      showUnit: true,
      copies: 1,
    };
    try {
      const raw = (db.prepare("SELECT value FROM schema_meta WHERE key = ?").get('setting:print.forms') as any)?.value;
      if (raw) printCfg = { ...printCfg, ...JSON.parse(raw) };
    } catch {  }

    const bcid = ['code128', 'qrcode', 'datamatrix', 'ean13', 'code39'].includes(String(printCfg.barcodeType))
      ? String(printCfg.barcodeType)
      : 'code128';
    const widthMm = Math.min(120, Math.max(20, Number(printCfg.labelWidthMm) || 60));
    const heightMm = Math.min(100, Math.max(15, Number(printCfg.labelHeightMm) || 40));
    const copies = Math.min(20, Math.max(1, Number(printCfg.copies) || 1));
    const escape = (value: any) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] || char));
    const owner = BrowserWindow.fromWebContents(event.sender);

    const labels: string[] = [];
    for (const code of codes) {
      const text = String(code).trim();
      if (!text) continue;
      let payload = text;
      if (bcid === 'ean13') {
        const digits = text.replace(/\D/g, '');
        if (digits.length < 12) continue;
        payload = digits.slice(0, 13).padStart(13, '0').slice(-13);
      }
      let barcode: Buffer;
      try {
        barcode = await bwipjs.toBuffer({
          bcid,
          text: payload,
          scale: bcid === 'qrcode' || bcid === 'datamatrix' ? 4 : 3,
          height: bcid === 'qrcode' || bcid === 'datamatrix' ? undefined : 14,
          includetext: bcid !== 'qrcode' && bcid !== 'datamatrix',
          textxalign: 'center',
          paddingwidth: 4,
          paddingheight: 2,
        } as any);
      } catch (barcodeError: any) {
        throw new Error(`Не удалось построить ${bcid} для «${text}»: ${barcodeError?.message || 'ошибка генерации'}`);
      }
      const image = `data:image/png;base64,${barcode.toString('base64')}`;
      const meta = [
        printCfg.showSku !== false ? escape(item.sku || 'без SKU') : '',
        printCfg.showUnit !== false ? escape(item.unit_symbol || 'шт.') : '',
      ].filter(Boolean).join(' · ');
      const article = `<article class="label">${printCfg.showName !== false ? `<strong>${escape(item.print_name || item.name)}</strong>` : ''}${meta ? `<span>${meta}</span>` : ''}<img alt="" src="${image}" /><small>${escape(text)}</small></article>`;
      for (let copy = 0; copy < copies; copy += 1) labels.push(article);
    }
    if (!labels.length) throw new Error(bcid === 'ean13' ? 'Для EAN-13 нужны штрихкоды из 12–13 цифр' : 'Нет валидных штрихкодов для печати');

    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Этикетки</title><style>
@page{size:${widthMm}mm ${heightMm}mm;margin:2mm}
*{box-sizing:border-box}
body{font-family:"Segoe UI",Arial,sans-serif;margin:0;color:#111}
.label{width:${Math.max(10, widthMm - 4)}mm;height:${Math.max(10, heightMm - 4)}mm;page-break-after:always;break-after:page;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1mm;overflow:hidden;padding:1mm}
.label:last-child{page-break-after:auto;break-after:auto}
.label strong{max-width:100%;font-size:9pt;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.label span,.label small{font-size:7pt;text-align:center}
.label img{max-width:${Math.max(10, widthMm - 8)}mm;max-height:${Math.max(8, heightMm - 18)}mm;object-fit:contain}
</style></head><body>${labels.join('')}</body></html>`;

    const tempDir = path.join(app.getPath('temp'), 'metrika-labels');
    fs.mkdirSync(tempDir, { recursive: true });
    const stamp = Date.now();
    const tempHtml = path.join(tempDir, `labels-${itemId}-${stamp}.html`);
    const tempPdf = path.join(tempDir, `labels-${itemId}-${stamp}.pdf`);
    fs.writeFileSync(tempHtml, html, 'utf8');

    const printWindow = new BrowserWindow({
      show: false,
      webPreferences: { sandbox: true, contextIsolation: true, offscreen: false },
    });
    try {
      await printWindow.loadFile(tempHtml);
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => resolve(), 1500);
        const fail = (_e: any, errorCode: number, errorDescription: string) => {
          clearTimeout(timer);
          reject(new Error(errorDescription || `Ошибка загрузки (${errorCode})`));
        };
        const ok = () => { clearTimeout(timer); resolve(); };
        if (!printWindow.webContents.isLoading()) { clearTimeout(timer); resolve(); return; }
        printWindow.webContents.once('did-finish-load', ok);
        printWindow.webContents.once('did-fail-load', fail);
      });

      const pdf = await printWindow.webContents.printToPDF({
        printBackground: true,
        pageSize: { width: widthMm * 1000, height: heightMm * 1000 },
        margins: { marginType: 'none' },
        preferCSSPageSize: true,
      });

      const safeName = String(item.sku || item.barcode || `item-${itemId}`).replace(/[<>:"/\\|?*]+/g, '_');
      const result = await dialog.showSaveDialog({
        title: 'Сохранить этикетки PDF',
        defaultPath: path.join(app.getPath('documents'), stampedFileName(`${safeName}-labels`, 'pdf')),
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
        ...(owner ? { browserWindow: owner } as any : {}),
      });
      const target = (!result.canceled && result.filePath) ? result.filePath : tempPdf;
      fs.writeFileSync(target, pdf);
      await shell.openPath(target);
      return target;
    } catch (error: any) {
      throw new Error(error?.message || 'Не удалось сформировать этикетки');
    } finally {
      if (!printWindow.isDestroyed()) printWindow.close();
      try { fs.rmSync(tempHtml, { force: true }); } catch {  }
    }
  });

  ipcMain.handle('items:printStockReport', async (_e, requestedIds?: number[] | 'all' | null) => {
    const db = getDb();
    let ids: number[] = [];
    if (requestedIds === 'all' || requestedIds == null || (Array.isArray(requestedIds) && !requestedIds.length)) {
      ids = (db.prepare('SELECT id FROM items ORDER BY category, name').all() as any[])
        .map((r) => Number(r.id)).filter(Boolean).slice(0, 5000);
    } else {
      ids = [...new Set((Array.isArray(requestedIds) ? requestedIds : []).map(Number)
        .filter((id) => Number.isInteger(id) && id > 0))].slice(0, 5000);
    }
    if (!ids.length) throw new Error('??? ??????? ??? ??????');
    const rows = db.prepare(`SELECT i.name, i.print_name, i.sku, i.barcode, i.category, i.min_stock, i.sale_price,
      u.symbol AS unit_symbol, u.code AS unit_code,
      COALESCE(SUM(inv.quantity), 0) AS on_hand,
      COALESCE((SELECT SUM(pr.quantity) FROM project_reservations pr JOIN projects p ON p.id = pr.project_id
        WHERE pr.item_id = i.id AND p.status IN ('reserved','picking','picked','assembly')), 0) AS reserved,
      GROUP_CONCAT(CASE WHEN inv.quantity > 0 THEN l.name || ' (' || inv.quantity || ')' END, ', ') AS locations
      FROM items i LEFT JOIN units u ON u.id = i.unit_id
      LEFT JOIN inventory inv ON inv.item_id = i.id LEFT JOIN locations l ON l.id = inv.location_id
      WHERE i.id IN (${ids.map(() => '?').join(',')})
      GROUP BY i.id ORDER BY i.category, i.name`).all(...ids) as any[];
    const generatedAt = new Date().toLocaleString('ru-RU');
    const org = (registry.getSession()?.organization || {}) as OrgPrintInfo;
    const enriched = rows.map((row) => {
      const onHand = Number(row.on_hand || 0);
      const reserved = Number(row.reserved || 0);
      return { ...row, on_hand: onHand, reserved, available: Math.max(0, onHand - reserved) };
    });
    const byUnit = [...enriched.reduce((totals, row) => {
      const key = row.unit_symbol || '??.';
      totals.set(key, (totals.get(key) || 0) + Number(row.available || 0));
      return totals;
    }, new Map<string, number>())].map(([symbol, quantity]) => `${quantity} ${symbol}`).join(' � ');

    const customRaw = (db.prepare("SELECT value FROM schema_meta WHERE key = ?").get('setting:print.templates') as any)?.value;
    let custom: any[] = [];
    try { custom = customRaw ? JSON.parse(customRaw) : []; } catch { custom = []; }
    const allTemplates = [...SYSTEM_PRINT_TEMPLATES, ...(Array.isArray(custom) ? custom : [])];
    const tpl = allTemplates.find((t) => !t.isSystem && (t.kinds || []).includes('stock'))
      || allTemplates.find((t) => t.id === 'sys-stock')
      || SYSTEM_PRINT_TEMPLATES.find((t) => t.id === 'sys-stock')!;

    const model: PrintDocModel = {
      title: '????????? ???????? ???????-???????????? ?????????',
      subtitle: `???????: ${enriched.length}`,
      formCode: tpl.formCode || '??-1',
      okud: tpl.okud,
      meta: [
        { label: '???????????', value: String(org.legal_name || org.name || '�') },
        { label: '???????', value: String(enriched.length) },
        { label: '???????? ?? ????????', value: byUnit || '�' },
      ],
      columns: [
        { key: 'sku', title: '???????' },
        { key: 'name', title: '????????????' },
        { key: 'print_name', title: '??? ??????' },
        { key: 'barcode', title: '????????' },
        { key: 'category', title: '?????????' },
        { key: 'unit', title: '??.', align: 'center' },
        { key: 'okei', title: '????', align: 'center' },
        { key: 'on_hand', title: '?????.', align: 'right' },
        { key: 'reserved', title: '??????', align: 'right' },
        { key: 'available', title: '????????', align: 'right' },
        { key: 'min_stock', title: '???????', align: 'right' },
        { key: 'price', title: '????', align: 'right' },
        { key: 'locations', title: '??????????' },
      ],
      rows: enriched.map((row) => ({
        sku: row.sku || '�',
        name: row.name,
        print_name: row.print_name || row.name,
        barcode: row.barcode || '?? ?????',
        category: row.category || '??? ?????????',
        unit: row.unit_symbol || '??',
        okei: row.unit_code || '�',
        on_hand: row.on_hand,
        reserved: row.reserved,
        available: row.available,
        min_stock: row.min_stock,
        price: row.sale_price == null ? '�' : `${Number(row.sale_price).toLocaleString('ru-RU')} ?`,
        locations: row.locations || '?? ????????',
      })),
      note: '',
      signs: tpl.signs,
      generatedAt,
    };
    const html = renderWithTemplate(org, { ...tpl, landscape: true }, model);
    return savePdfHtml(html, 'metrika-stock', { landscape: true });
  });
  ipcMain.handle('items:photos', (_e, itemId: number) => getDb().prepare('SELECT * FROM item_photos WHERE item_id = ? ORDER BY id DESC').all(itemId).map((photo: any) => ({
    ...photo,
    data_url: fileToDataUrl(photo.file_path),
  })).filter((photo: any) => photo.data_url));

  ipcMain.handle('items:addPhoto', async (_e, itemId: number) => {
    requirePerm('items_edit');
    const result = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'Изображения', extensions: ['png', 'jpg', 'jpeg', 'webp'] }] });
    if (result.canceled || !result.filePaths[0]) return null;
    const photoDir = path.join(app.getPath('userData'), 'photos');
    fs.mkdirSync(photoDir, { recursive: true });
    const destination = path.join(photoDir, `${itemId}-${Date.now()}${path.extname(result.filePaths[0])}`);
    fs.copyFileSync(result.filePaths[0], destination);
    const created = getDb().prepare('INSERT INTO item_photos (item_id, file_path) VALUES (?, ?)').run(itemId, destination);
    return { id: created.lastInsertRowid, file_path: destination };
  });

  ipcMain.handle('items:checkSku', (_e, sku: string, itemId?: number) => {
    const value = String(sku || '').trim();
    if (!value) return { available: true };
    const hit = getDb().prepare('SELECT id, name FROM items WHERE upper(trim(sku)) = upper(trim(?)) AND id != ? LIMIT 1').get(value, Number(itemId) || 0) as any;
    return hit ? { available: false, conflict: hit } : { available: true };
  });
  ipcMain.handle('items:generateSku', (_e, data: { categoryId?: number | null; itemName?: string; categoryName?: string; name?: string; category?: string } = {}) => {
    const db = getDb();
    const cleanName = String(data.itemName || data.name || '').toLowerCase().trim();
    const cleanCategory = String(data.categoryName || data.category || '').toLowerCase().trim();
    const pad = Math.min(8, Math.max(2, Number((db.prepare("SELECT value FROM schema_meta WHERE key = ?").get('setting:sku.pad') as any)?.value) || 4));
    const separator = String((db.prepare("SELECT value FROM schema_meta WHERE key = ?").get('setting:sku.separator') as any)?.value ?? '-');
    const useCategory = String((db.prepare("SELECT value FROM schema_meta WHERE key = ?").get('setting:sku.useCategoryPrefix') as any)?.value || 'on') !== 'off';

    const translitMap: Record<string, string> = {
      а: 'A', б: 'B', в: 'V', г: 'G', д: 'D', е: 'E', ё: 'E', ж: 'ZH', з: 'Z', и: 'I', й: 'Y',
      к: 'K', л: 'L', м: 'M', н: 'N', о: 'O', п: 'P', р: 'R', с: 'S', т: 'T', у: 'U', ф: 'F',
      х: 'H', ц: 'C', ч: 'CH', ш: 'SH', щ: 'SCH', ъ: '', ы: 'Y', ь: '', э: 'E', ю: 'YU', я: 'YA',
    };
    const toPrefix = (value: string) => {
      const raw = String(value || '').trim().toLowerCase();
      let out = '';
      for (const char of raw) {
        if (/[a-z0-9]/i.test(char)) out += char.toUpperCase();
        else if (translitMap[char]) out += translitMap[char];
        if (out.length >= 6) break;
      }
      return out.replace(/[^A-Z0-9]/g, '').slice(0, 6) || 'SKU';
    };

    let prefix = '';
    let categoryRow: any = null;
    if (useCategory && data.categoryId) {
      categoryRow = db.prepare('SELECT id, sku_prefix, name, parent_id FROM categories WHERE id = ?').get(Number(data.categoryId)) as any;
      if (categoryRow?.sku_prefix) prefix = String(categoryRow.sku_prefix).trim().toUpperCase();
    }
    if (useCategory && !prefix && cleanCategory) {
      categoryRow = db.prepare('SELECT id, sku_prefix, name, parent_id FROM categories WHERE lower(trim(name)) = ?').get(cleanCategory) as any;
      if (categoryRow?.sku_prefix) prefix = String(categoryRow.sku_prefix).trim().toUpperCase();
    }
    if (useCategory && !prefix && categoryRow?.parent_id) {
      const parent = db.prepare('SELECT sku_prefix FROM categories WHERE id = ?').get(categoryRow.parent_id) as any;
      if (parent?.sku_prefix) prefix = String(parent.sku_prefix).trim().toUpperCase();
    }

    const categoryPrefixes: Record<string, string> = {
      'контроллер': 'MCU', 'esp32': 'MCU', 'arduino': 'MCU', 'микроконтроллер': 'MCU', 'stm32': 'MCU',
      'кабель': 'CAB', 'провод': 'CAB', 'dupont': 'CAB', 'перемычка': 'CAB',
      'модуль': 'MOD', 'датчик': 'SNS', 'реле': 'RLY', 'lcd': 'DSP', 'oled': 'DSP',
      'серво': 'SRV', 'сервопривод': 'SRV', 'motor': 'MOT', 'двигатель': 'MOT',
      'аккумулятор': 'BAT', 'батарея': 'BAT', 'блок питания': 'PSU', 'power': 'PSU',
      'экран': 'DSP', 'дисплей': 'DSP', 'монитор': 'DSP',
      'светодиод': 'LED', 'индикатор': 'IND', 'led': 'LED',
      'резистор': 'RES', 'resistor': 'RES', 'конденсатор': 'CAP', 'capacitor': 'CAP',
      'переходник': 'ADP', 'разъем': 'CON', 'адаптер': 'ADP', 'connector': 'CON',
      'инструмент': 'TL', 'паяльник': 'TL', 'мультиметр': 'TL', 'tool': 'TL',
      'память': 'MEM', 'ram': 'RAM', 'ssd': 'STO', 'hdd': 'STO', 'накопитель': 'STO',
      'расходные': 'CNS', 'термопаст': 'THP', 'упаковка': 'PKG',
      'оптика': 'OPT', 'радиатор': 'RDT', 'охлаждение': 'CLG',
    };

    if (!prefix) {
      prefix = 'SKU';
      for (const [key, value] of Object.entries(categoryPrefixes)) {
        if (cleanCategory.includes(key) || cleanName.includes(key)) {
          prefix = value;
          break;
        }
      }
      if (prefix === 'SKU' && (cleanCategory || cleanName)) {
        prefix = toPrefix(cleanCategory || cleanName);
      }
    }

    prefix = prefix.replace(/[^A-Z0-9]/gi, '').toUpperCase() || 'SKU';
    const like = `${prefix}${separator}%`;
    const existingSkus = db.prepare('SELECT sku FROM items WHERE sku IS NOT NULL AND upper(sku) LIKE upper(?)').all(like) as { sku: string }[];
    let maxNumber = 0;
    for (const row of existingSkus) {
      const numStr = separator ? String(row.sku).slice(prefix.length + separator.length) : String(row.sku).replace(/^\D+/, '');
      const num = parseInt(numStr.replace(/\D/g, ''), 10);
      if (!Number.isNaN(num) && num > maxNumber) maxNumber = num;
    }
    const nextNumber = maxNumber + 1;
    const sku = `${prefix}${separator}${String(nextNumber).padStart(pad, '0')}`;
    return { sku, prefix, pad, separator };
  });


  ipcMain.handle('categories:merge', (_e, sourceId: number, targetId: number) => {
    requirePerm('categories_edit');
    const db = getDb();
    if (sourceId === targetId) throw new Error('Нельзя объединить категорию саму с собой');
    const source = db.prepare('SELECT name FROM categories WHERE id = ?').get(sourceId) as any;
    const target = db.prepare('SELECT name FROM categories WHERE id = ?').get(targetId) as any;
    if (!source || !target) throw new Error('Одна из категорий не найдена');

    const merge = db.transaction(() => {
      db.prepare('UPDATE items SET category = ? WHERE category = ?').run(target.name, source.name);
      db.prepare('UPDATE item_templates SET category = ? WHERE category = ?').run(target.name, source.name);
      db.prepare('UPDATE categories SET parent_id = ? WHERE parent_id = ?').run(targetId, sourceId);
      return db.prepare('DELETE FROM categories WHERE id = ?').run(sourceId).changes;
    });
    return { changes: merge() };
  });

  ipcMain.handle('units:list', () => getDb().prepare(`SELECT u.*, (SELECT COUNT(*) FROM items i WHERE i.unit_id = u.id) AS item_count FROM units u WHERE u.is_active = 1 ORDER BY u.id`).all());
  ipcMain.handle('units:create', (_e, data: any) => {
    requirePerm('units_edit');
    const name = String(data.name || '').trim();
    const symbol = String(data.symbol || '').trim();
    const description = String(data.description || '').trim() || null;
    const code = String(data.code || '').trim() || null;
    const decimalPlaces = Math.min(6, Math.max(0, Number(data.decimal_places) || 0));
    const isBase = data.is_base ? 1 : 0;
    if (!name || !symbol) throw new Error('Введите название и краткое обозначение единицы');
    try {
      const db = getDb();
      if (isBase) db.prepare('UPDATE units SET is_base = 0').run();
      const result = db.prepare('INSERT INTO units (name, symbol, description, decimal_places, code, is_base) VALUES (?, ?, ?, ?, ?, ?)').run(name, symbol, description, decimalPlaces, code, isBase);
      return { id: result.lastInsertRowid };
    } catch (error: any) {
      if (String(error?.message).includes('UNIQUE')) throw new Error('Название или обозначение единицы уже используется');
      throw error;
    }
  });
  ipcMain.handle('units:update', (_e, id: number, data: any) => {
    requirePerm('units_edit');
    const name = String(data.name || '').trim();
    const symbol = String(data.symbol || '').trim();
    const description = String(data.description || '').trim() || null;
    const code = String(data.code || '').trim() || null;
    const decimalPlaces = Math.min(6, Math.max(0, Number(data.decimal_places) || 0));
    const isBase = data.is_base ? 1 : 0;
    if (!name || !symbol) throw new Error('Введите название и краткое обозначение единицы');
    try {
      const db = getDb();
      if (isBase) db.prepare('UPDATE units SET is_base = 0 WHERE id != ?').run(id);
      return { changes: db.prepare('UPDATE units SET name = ?, symbol = ?, description = ?, decimal_places = ?, code = ?, is_base = ? WHERE id = ?').run(name, symbol, description, decimalPlaces, code, isBase, id).changes };
    }
    catch (error: any) {
      if (String(error?.message).includes('UNIQUE')) throw new Error('Название или обозначение единицы уже используется');
      throw error;
    }
  });
  ipcMain.handle('units:delete', (_e, id: number) => {
    requirePerm('units_edit');
    const db = getDb();
    const unit = db.prepare('SELECT * FROM units WHERE id = ?').get(id) as any;
    if (!unit) throw new Error('Единица не найдена');
    if (unit.is_base || unit.symbol === 'шт.') throw new Error('Базовую единицу удалить нельзя');
    const used = (db.prepare('SELECT COUNT(*) AS count FROM items WHERE unit_id = ?').get(id) as any).count;
    if (used) throw new Error(`Единица используется в ${used} товарах`);
    return { changes: db.prepare('DELETE FROM units WHERE id = ?').run(id).changes };
  });

  ipcMain.handle('templates:list', () => getDb().prepare('SELECT * FROM item_templates ORDER BY name').all());
  ipcMain.handle('templates:create', (_e, data: any) => {
    requirePerm('templates_edit');
    return getDb().prepare('INSERT INTO item_templates (name, category, sku_prefix, min_stock, description) VALUES (?, ?, ?, ?, ?)').run(data.name.trim(), data.category || null, data.sku_prefix || null, Number(data.min_stock) || 0, data.description || null);
  });
  ipcMain.handle('templates:update', (_e, id: number, data: any) => {
    requirePerm('templates_edit');
    registry.requireSession();
    const name = String(data?.name || '').trim();
    if (!name) throw new Error('Введите название шаблона');
    return getDb().prepare(
      'UPDATE item_templates SET name = ?, category = ?, sku_prefix = ?, min_stock = ?, description = ? WHERE id = ?',
    ).run(
      name,
      data.category || null,
      data.sku_prefix || null,
      Number(data.min_stock) || 0,
      data.description || null,
      Number(id),
    );
  });


  ipcMain.handle('categories:list', () => getDb().prepare(
    `SELECT c.*, (SELECT COUNT(*) FROM items i WHERE i.category = c.name) AS item_count,
      (SELECT COUNT(*) FROM categories child WHERE child.parent_id = c.id) AS child_count
     FROM categories c ORDER BY c.name COLLATE NOCASE`
  ).all());

  ipcMain.handle('categories:create', (_e, data: any) => {
    requirePerm('categories_edit');
    const name = String(data.name || '').trim();
    const color = String(data.color || '#4f7c68');
    const parentId = data.parent_id ? Number(data.parent_id) : null;
    const skuPrefix = String(data.sku_prefix || '').trim().toUpperCase() || null;
    const description = String(data.description || '').trim() || null;
    const code = String(data.code || '').trim() || null;
    const defaultMin = data.default_min_stock === '' || data.default_min_stock == null ? null : Math.max(0, Number(data.default_min_stock) || 0);
    if (!name) throw new Error('Введите название категории');
    if (!/^#[0-9a-f]{6}$/i.test(color)) throw new Error('Укажите корректный цвет категории');
    if (parentId) {
      const parent = getDb().prepare('SELECT id, archived FROM categories WHERE id = ?').get(parentId) as any;
      if (!parent) throw new Error('Родительская категория не найдена');
      if (parent.archived) throw new Error('Нельзя привязать к архивной категории');
    }
    try {
      const result = getDb().prepare('INSERT INTO categories (name, color, parent_id, sku_prefix, description, default_min_stock, code) VALUES (?, ?, ?, ?, ?, ?, ?)').run(name, color, parentId, skuPrefix, description, defaultMin, code);
      return { id: result.lastInsertRowid };
    } catch (error: any) {
      if (String(error?.message).includes('UNIQUE')) throw new Error('Такая категория уже существует');
      throw error;
    }
  });

  ipcMain.handle('categories:update', (_e, id: number, data: any) => {
    requirePerm('categories_edit');
    const name = String(data.name || '').trim();
    const color = String(data.color || '#4f7c68');
    const parentId = data.parent_id ? Number(data.parent_id) : null;
    const skuPrefix = String(data.sku_prefix || '').trim().toUpperCase() || null;
    const description = String(data.description || '').trim() || null;
    const code = String(data.code || '').trim() || null;
    const defaultMin = data.default_min_stock === '' || data.default_min_stock == null ? null : Math.max(0, Number(data.default_min_stock) || 0);
    if (!name) throw new Error('Введите название категории');
    if (!/^#[0-9a-f]{6}$/i.test(color)) throw new Error('Укажите корректный цвет категории');
    if (parentId === id) throw new Error('Категория не может быть родителем самой себе');
    const db = getDb();
    try {
      const update = db.transaction(() => {
        const old = db.prepare('SELECT * FROM categories WHERE id = ?').get(id) as any;
        if (!old) throw new Error('Категория не найдена');
        if (parentId) {
          const parent = db.prepare('SELECT id FROM categories WHERE id = ?').get(parentId) as any;
          if (!parent) throw new Error('Родительская категория не найдена');
          const cycle = db.prepare(`WITH RECURSIVE descendants(id) AS (
            SELECT id FROM categories WHERE parent_id = ?
            UNION ALL
            SELECT c.id FROM categories c JOIN descendants d ON c.parent_id = d.id
          ) SELECT 1 FROM descendants WHERE id = ? LIMIT 1`).get(id, parentId);
          if (cycle) throw new Error('Нельзя переместить категорию внутрь её собственного дерева');
        }
        if (old.name !== name) {
          db.prepare('UPDATE items SET category = ? WHERE category = ?').run(name, old.name);
          db.prepare('UPDATE item_templates SET category = ? WHERE category = ?').run(name, old.name);
        }
        const archived = data.archived === undefined ? old.archived ?? 0 : (Number(data.archived) ? 1 : 0);
        const after = {
          name, color, parent_id: parentId, sku_prefix: skuPrefix, archived, description, default_min_stock: defaultMin, code,
        };
        const changes = db.prepare('UPDATE categories SET name = ?, color = ?, parent_id = ?, sku_prefix = ?, archived = ?, description = ?, default_min_stock = ?, code = ? WHERE id = ?').run(name, color, parentId, skuPrefix, archived, description, defaultMin, code, id).changes;
        logEntityChanges('category', id, old, after, Object.keys(after), actorName());
        return changes;
      });
      return { changes: update() };
    } catch (error: any) {
      if (String(error?.message).includes('UNIQUE')) throw new Error('Такая категория уже существует');
      throw error;
    }
  });

  ipcMain.handle('categories:archive', (_e, id: number) => {
    requirePerm('categories_edit');
    const db = getDb();
    const children = (db.prepare('SELECT COUNT(*) AS count FROM categories WHERE parent_id = ? AND COALESCE(archived, 0) = 0').get(id) as any).count;
    if (children) throw new Error('Сначала архивируйте или перенесите дочерние категории');
    return { changes: db.prepare('UPDATE categories SET archived = 1 WHERE id = ?').run(id).changes };
  });

  ipcMain.handle('categories:delete', (_e, id: number) => {
    requirePerm('categories_edit');
    const db = getDb();
    const category = db.prepare('SELECT name FROM categories WHERE id = ?').get(id) as any;
    if (!category) return { changes: 0 };
    const children = (db.prepare('SELECT COUNT(*) AS count FROM categories WHERE parent_id = ?').get(id) as any).count;
    if (children) throw new Error('Сначала удалите или перенесите дочерние категории');
    const used = db.prepare('SELECT (SELECT COUNT(*) FROM items WHERE category = ?) + (SELECT COUNT(*) FROM item_templates WHERE category = ?) AS count').get(category.name, category.name) as any;
    if (used.count) throw new Error(`Категория используется в ${used.count} товарах или шаблонах`);
    return { changes: db.prepare('DELETE FROM categories WHERE id = ?').run(id).changes };
  });


  ipcMain.handle('quality:report', () => {
    requirePerm('quality');
    const db = getDb();
    const health = computeOrgHealth();
    const issues: any[] = [];

    const noSku = db.prepare("SELECT id, name, barcode, category FROM items WHERE (sku IS NULL OR TRIM(sku) = '')").all() as any[];
    if (noSku.length) issues.push({ type: 'item', code: 'no_sku', title: 'Товары без SKU', count: noSku.length, items: noSku });

    const noCategory = db.prepare("SELECT id, name, barcode, category FROM items WHERE (category IS NULL OR TRIM(category) = '')").all() as any[];
    if (noCategory.length) issues.push({ type: 'item', code: 'no_category', title: 'Товары без категории', count: noCategory.length, items: noCategory });

    const noUnit = db.prepare("SELECT id, name, barcode, category FROM items WHERE unit_id IS NULL").all() as any[];
    if (noUnit.length) issues.push({ type: 'item', code: 'no_unit', title: 'Товары без единицы измерения', count: noUnit.length, items: noUnit });

    const dupSku = db.prepare("SELECT sku, COUNT(*) as c FROM items WHERE sku IS NOT NULL AND TRIM(sku) != '' GROUP BY upper(trim(sku)) HAVING c > 1").all() as any[];
    if (dupSku.length) {
      const enriched = dupSku.map((row) => ({
        ...row,
        items: db.prepare('SELECT id, name, barcode FROM items WHERE upper(trim(sku)) = upper(trim(?)) ORDER BY id').all(row.sku),
      }));
      issues.push({ type: 'item', code: 'dup_sku', title: 'Дубликаты SKU', count: dupSku.reduce((s, r) => s + r.c, 0), items: enriched });
    }

    const dupBarcode = db.prepare("SELECT barcode, COUNT(*) as c FROM item_barcodes GROUP BY barcode HAVING c > 1").all() as any[];
    if (dupBarcode.length) {
      const enriched = dupBarcode.map((row) => ({
        ...row,
        items: db.prepare(`SELECT i.id, i.name, i.barcode FROM item_barcodes b JOIN items i ON i.id = b.item_id WHERE b.barcode = ? ORDER BY i.id`).all(row.barcode),
      }));
      issues.push({ type: 'barcode', code: 'dup_barcode', title: 'Дубликаты штрихкодов', count: dupBarcode.reduce((s, r) => s + r.c, 0), items: enriched });
    }

    const negStock = db.prepare("SELECT item_id, location_id, quantity FROM inventory WHERE quantity < 0").all() as any[];
    if (negStock.length) issues.push({ type: 'inventory', code: 'negative', title: 'Отрицательные остатки', count: negStock.length, items: negStock });

    const brokenInv = db.prepare("SELECT item_id, location_id, quantity FROM inventory WHERE item_id NOT IN (SELECT id FROM items)").all() as any[];
    if (brokenInv.length) issues.push({ type: 'inventory', code: 'broken_item', title: 'Битые связи остатков (товар удалён)', count: brokenInv.length, items: brokenInv });

    const brokenLoc = db.prepare("SELECT item_id, location_id, quantity FROM inventory WHERE location_id NOT IN (SELECT id FROM locations)").all() as any[];
    if (brokenLoc.length) issues.push({ type: 'inventory', code: 'broken_location', title: 'Битые связи остатков (ячейка удалена)', count: brokenLoc.length, items: brokenLoc });

    const allCats = db.prepare("SELECT id, name FROM categories WHERE COALESCE(archived, 0) = 0").all() as any[];
    const similar: any[] = [];
    const stripNoise = (name: string) => name
      .toLowerCase()
      .replace(/\b(накопители|компоненты|материалы|оборудование|модули|платы|кабели|экраны|устройства)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
    for (let i = 0; i < allCats.length; i++) {
      for (let j = i + 1; j < allCats.length; j++) {
        const aRaw = allCats[i].name.toLowerCase().trim();
        const bRaw = allCats[j].name.toLowerCase().trim();
        if (aRaw === bRaw) continue;
        const aCore = stripNoise(aRaw);
        const bCore = stripNoise(bRaw);

        if (aCore && bCore && aCore !== bCore) {
          const coreDist = levenshtein(aCore, bCore);
          if (coreDist > 1) continue;
        }
        const dist = levenshtein(aRaw, bRaw);
        const maxLen = Math.max(aRaw.length, bRaw.length) || 1;
        if (dist <= 2 && dist / maxLen <= 0.25 && Math.abs(aRaw.length - bRaw.length) <= 2) {
          similar.push({ a: allCats[i], b: allCats[j], distance: dist });
        }
      }
    }
    if (similar.length) issues.push({ type: 'category', code: 'similar', title: 'Похожие названия категорий', count: similar.length * 2, items: similar });

    if (health.hung_reserves.length) {
      issues.push({
        type: 'ops',
        code: 'hung_reserves',
        title: 'Зависшие резервы (>7 дней)',
        count: health.hung_reserves.length,
        items: health.hung_reserves.map((row: any) => ({
          id: row.id,
          name: row.order_no || row.name,
          detail: `${row.status} · с ${row.reserved_at || '—'} · ${row.reserved_qty} ед.`,
          order_no: row.order_no,
        })),
      });
    }
    if (health.overdue_projects.length) {
      issues.push({
        type: 'ops',
        code: 'overdue_projects',
        title: 'Просроченные заказы-наряды',
        count: health.overdue_projects.length,
        items: health.overdue_projects.map((row: any) => ({
          id: row.id,
          name: row.order_no || row.name,
          detail: `срок ${row.due_date} · ${row.status}`,
          order_no: row.order_no,
        })),
      });
    }
    if (health.overdue_pos.length) {
      issues.push({
        type: 'ops',
        code: 'overdue_po',
        title: 'Просроченные поставки',
        count: health.overdue_pos.length,
        items: health.overdue_pos.map((row: any) => ({
          id: row.id,
          name: row.order_no,
          detail: `${row.supplier_name || '—'} · ожид. ${row.expected_at} · ${row.status}`,
          order_no: row.order_no,
        })),
      });
    }
    if (health.over_reserved.length) {
      issues.push({
        type: 'ops',
        code: 'over_reserved',
        title: 'Резерв выше учётного остатка',
        count: health.over_reserved.length,
        items: health.over_reserved.map((row: any) => ({
          id: row.item_id,
          name: row.item_name,
          detail: `${row.location_name}: резерв ${row.reserved_qty} > on_hand ${row.on_hand}`,
        })),
      });
    }


    const diagnoseRows = (health as any)?.diagnose?.ledger_drift_rows as any[] | undefined;
    const driftRows = (Array.isArray(diagnoseRows) && diagnoseRows.length
      ? diagnoseRows
      : listInventoryLedgerDrift(100)) as any[];
    if (driftRows.length) {
      const barcodes = new Map<number, string>();
      for (const row of driftRows) {
        if (!row.item_id || barcodes.has(row.item_id)) continue;
        try {
          const bc = db.prepare('SELECT barcode FROM items WHERE id = ?').get(row.item_id) as any;
          barcodes.set(row.item_id, bc?.barcode || '');
        } catch {
          barcodes.set(row.item_id, '');
        }
      }
      issues.push({
        type: 'inventory',
        code: 'ledger_drift',
        title: 'Расхождение остатков и журнала (ledger)',
        hint: 'В ячейке одно количество, а сумма движений (ledger) — другое. «Выровнять по остатку» пишет корректировку в журнал; «Пересчитать из ledger» перезаписывает inventory по журналу.',
        count: driftRows.length,
        items: driftRows.map((row: any) => ({
          id: row.item_id,
          item_id: row.item_id,
          location_id: row.location_id,
          lot_id: row.lot_id,
          name: row.item_name,
          barcode: barcodes.get(row.item_id) || '',
          detail: `${row.location_name || 'ячейка'} · партия ${row.lot_no || '—'}`,
          location_name: row.location_name,
          lot_no: row.lot_no,
          inventory_qty: row.inventory_qty,
          ledger_qty: row.ledger_qty,
          delta: row.delta,
        })),
      });
    }

    if ((health.expired_lots || []).length) {
      issues.push({
        type: 'lots',
        code: 'expired_lots',
        title: 'Просроченные партии',
        hint: 'Срок годности уже истёк. Спишите, утилизируйте или исправьте дату партии в карточке товара.',
        count: health.expired_lots.length,
        items: health.expired_lots.map((row: any) => ({
          id: row.item_id,
          name: row.item_name || row.name,
          detail: `партия ${row.lot_no || '—'} · до ${row.expiry_date || '—'} · ${row.quantity ?? row.qty ?? 0} ед.`,
          barcode: row.barcode,
        })),
      });
    }
    if ((health.expiring_lots || []).length) {
      issues.push({
        type: 'lots',
        code: 'expiring_lots',
        title: 'Партии с истекающим сроком',
        hint: 'Срок подходит к концу (по настройке предупреждения). Планируйте расход или переместите в «сначала FEFO».',
        count: health.expiring_lots.length,
        items: health.expiring_lots.map((row: any) => ({
          id: row.item_id,
          name: row.item_name || row.name,
          detail: `партия ${row.lot_no || '—'} · до ${row.expiry_date || '—'} · ${row.quantity ?? row.qty ?? 0} ед.`,
          barcode: row.barcode,
        })),
      });
    }

    const total = issues.reduce((sum, i) => sum + i.count, 0);
    return { total, issues, health };
  });

  function levenshtein(a: string, b: string): number {
    const matrix: number[][] = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) matrix[i][j] = matrix[i - 1][j - 1];
        else matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
      }
    }
    return matrix[b.length][a.length];
  }

  ipcMain.handle('analytics:abc', (_e, input: any = 90) => {
    const db = getDb();
    let days = 90;
    let dayParam: string = '-90 days';
    let divisor = 90;
    if (input && typeof input === 'object') {
      if (input.from && input.to) {
        const safeFrom = String(input.from).replace(/[^0-9-]/g, '');
        const safeTo = String(input.to).replace(/[^0-9-]/g, '');
        dayParam = `${safeFrom} 00:00:00`;
        const toClause = ` AND t.timestamp <= datetime('${safeTo} 23:59:59')`;
        const endDate = new Date(`${safeTo}T23:59:59`);
        const startDate = new Date(`${safeFrom}T00:00:00`);
        divisor = Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / 86400000) + 1);
        return db.prepare(`WITH usage AS (
        SELECT i.id, i.name, i.barcode, i.category,
          COALESCE((SELECT SUM(t.quantity) FROM transactions t WHERE t.item_id = i.id AND t.type = 'out' AND t.reversed_at IS NULL AND t.timestamp >= datetime(?)${toClause}), 0) AS used_qty,
          COALESCE((SELECT SUM(inv.quantity) FROM inventory inv WHERE inv.item_id = i.id), 0) AS total_stock,
          (SELECT MAX(t.timestamp) FROM transactions t WHERE t.item_id = i.id AND t.type = 'out' AND t.reversed_at IS NULL) AS last_out
        FROM items i
      ), totals AS (SELECT SUM(used_qty) AS total FROM usage),
      ranked AS (SELECT usage.*, SUM(used_qty) OVER (ORDER BY used_qty DESC, name ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS running FROM usage)
      SELECT ranked.*, ROUND(used_qty * 1.0 / ?, 2) AS average_daily,
        CASE WHEN used_qty > 0 THEN ROUND(total_stock * ? * 1.0 / used_qty, 1) ELSE NULL END AS coverage_days,
        CASE WHEN COALESCE(totals.total, 0) = 0 THEN 0 ELSE ROUND(running * 100.0 / totals.total, 1) END AS cumulative_share,
        CASE WHEN COALESCE(totals.total, 0) = 0 THEN 'C' WHEN running * 1.0 / totals.total <= 0.8 THEN 'A' WHEN running * 1.0 / totals.total <= 0.95 THEN 'B' ELSE 'C' END AS abc_class
      FROM ranked, totals ORDER BY used_qty DESC, name`).all(dayParam, divisor, divisor);
      }
      days = Math.min(365, Math.max(1, Number(input.days) || 90));
    } else {
      days = Math.min(365, Math.max(30, Number(input) || 90));
    }
    dayParam = `-${days} days`;
    divisor = days;
    return db.prepare(`WITH usage AS ( SELECT i.id, i.name, i.barcode, i.category, COALESCE((SELECT SUM(t.quantity) FROM transactions t WHERE t.item_id = i.id AND t.type = 'out' AND t.reversed_at IS NULL AND t.timestamp >= datetime('now', ?)), 0) AS used_qty, COALESCE((SELECT SUM(inv.quantity) FROM inventory inv WHERE inv.item_id = i.id), 0) AS total_stock, (SELECT MAX(t.timestamp) FROM transactions t WHERE t.item_id = i.id AND t.type = 'out' AND t.reversed_at IS NULL) AS last_out FROM items i ), totals AS (SELECT SUM(used_qty) AS total FROM usage), ranked AS (SELECT usage.*, SUM(used_qty) OVER (ORDER BY used_qty DESC, name ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS running FROM usage) SELECT ranked.*, ROUND(used_qty * 1.0 / ?, 2) AS average_daily, CASE WHEN used_qty > 0 THEN ROUND(total_stock * ? * 1.0 / used_qty, 1) ELSE NULL END AS coverage_days, CASE WHEN COALESCE(totals.total, 0) = 0 THEN 0 ELSE ROUND(running * 100.0 / totals.total, 1) END AS cumulative_share, CASE WHEN COALESCE(totals.total, 0) = 0 THEN 'C' WHEN running * 1.0 / totals.total <= 0.8 THEN 'A' WHEN running * 1.0 / totals.total <= 0.95 THEN 'B' ELSE 'C' END AS abc_class FROM ranked, totals ORDER BY used_qty DESC, name`).all(dayParam, divisor, divisor);
  });

  ipcMain.handle('analytics:overview', () => {
    const db = getDb();

    const summary = db.prepare(`SELECT
      (SELECT COUNT(*) FROM items) AS item_count,
      (SELECT COALESCE(SUM(quantity), 0) FROM inventory) AS total_units,
      (SELECT COUNT(*) FROM locations) AS location_count,
      (SELECT COUNT(*) FROM locations WHERE COALESCE(NULLIF(TRIM(location_type), ''), 'cell') = 'cell') AS cell_count,
      (SELECT COUNT(DISTINCT inv.location_id) FROM inventory inv
        JOIN locations l ON l.id = inv.location_id
        WHERE inv.quantity > 0
          AND COALESCE(NULLIF(TRIM(l.location_type), ''), 'cell') = 'cell') AS occupied_cells,
      (SELECT COUNT(DISTINCT location_id) FROM inventory WHERE quantity > 0) AS occupied_locations,
      (SELECT COALESCE(SUM(capacity_qty), 0) FROM locations
        WHERE capacity_qty IS NOT NULL AND capacity_qty > 0) AS capacity_total,
      (SELECT COALESCE(SUM(
          CASE WHEN stock > cap THEN cap ELSE stock END
        ), 0) FROM (
          SELECT l.capacity_qty AS cap,
            COALESCE((SELECT SUM(inv.quantity) FROM inventory inv WHERE inv.location_id = l.id), 0) AS stock
          FROM locations l
          WHERE l.capacity_qty IS NOT NULL AND l.capacity_qty > 0
        )) AS filled_capacity,
      (SELECT COUNT(*) FROM items i WHERE MAX(0, COALESCE((SELECT SUM(inv.quantity) FROM inventory inv WHERE inv.item_id = i.id), 0) - COALESCE((SELECT SUM(pr.quantity) FROM project_reservations pr JOIN projects p ON p.id = pr.project_id WHERE pr.item_id = i.id AND p.status IN ('reserved','picking','picked','assembly')), 0)) <= i.min_stock) AS low_stock_count,
      (SELECT COALESCE(SUM(CASE WHEN type = 'in' THEN quantity ELSE 0 END), 0) FROM transactions WHERE reversed_at IS NULL AND timestamp >= datetime('now', 'start of month')) AS month_received,
      (SELECT COALESCE(SUM(CASE WHEN type = 'out' THEN quantity ELSE 0 END), 0) FROM transactions WHERE reversed_at IS NULL AND timestamp >= datetime('now', 'start of month')) AS month_issued,
      (SELECT COUNT(*) FROM projects WHERE status IN ('draft', 'reserved')) AS active_projects,
      (SELECT COUNT(*) FROM projects WHERE status IN ('draft', 'reserved') AND due_date IS NOT NULL AND due_date < date('now')) AS overdue_projects
    `).get() as any;
    const capacityTotal = Number(summary.capacity_total || 0);
    const filledCapacity = Number(summary.filled_capacity || 0);
    const cellCount = Number(summary.cell_count || 0) || Number(summary.location_count || 0);
    const occupiedCells = Number(summary.occupied_cells || 0) || Number(summary.occupied_locations || 0);
    const occupancy_pct = capacityTotal > 0
      ? Math.min(999, Math.round((filledCapacity / capacityTotal) * 100))
      : (cellCount > 0 ? Math.round((occupiedCells / cellCount) * 100) : 0);
    const lowStock = db.prepare(`SELECT i.id, i.name, i.barcode, i.category, i.min_stock,
      COALESCE((SELECT SUM(inv.quantity) FROM inventory inv WHERE inv.item_id = i.id), 0) AS on_hand,
      COALESCE((SELECT SUM(pr.quantity) FROM project_reservations pr JOIN projects p ON p.id = pr.project_id WHERE pr.item_id = i.id AND p.status IN ('reserved','picking','picked','assembly')), 0) AS reserved,
      MAX(0, COALESCE((SELECT SUM(inv.quantity) FROM inventory inv WHERE inv.item_id = i.id), 0) - COALESCE((SELECT SUM(pr.quantity) FROM project_reservations pr JOIN projects p ON p.id = pr.project_id WHERE pr.item_id = i.id AND p.status IN ('reserved','picking','picked','assembly')), 0)) AS available
      FROM items i
      WHERE MAX(0, COALESCE((SELECT SUM(inv.quantity) FROM inventory inv WHERE inv.item_id = i.id), 0) - COALESCE((SELECT SUM(pr.quantity) FROM project_reservations pr JOIN projects p ON p.id = pr.project_id WHERE pr.item_id = i.id AND p.status IN ('reserved','picking','picked','assembly')), 0)) <= i.min_stock
      ORDER BY (i.min_stock - available) DESC, i.name LIMIT 6`).all().map((row: any) => ({ ...row, total_qty: row.available }));
    const categoryStock = db.prepare(`SELECT COALESCE(NULLIF(i.category, ''), 'Без категории') AS name, COUNT(DISTINCT i.id) AS item_count, COALESCE(SUM(inv.quantity), 0) AS total_units FROM items i LEFT JOIN inventory inv ON inv.item_id = i.id GROUP BY COALESCE(NULLIF(i.category, ''), 'Без категории') ORDER BY total_units DESC, name LIMIT 6`).all();
    const recent = db.prepare(`SELECT t.id, t.type, t.quantity, t.timestamp, t.comment, i.name AS item_name, l.name AS location_name FROM transactions t LEFT JOIN items i ON i.id = t.item_id LEFT JOIN locations l ON l.id = t.location_id ORDER BY t.id DESC LIMIT 7`).all();
    const movementTrend = db.prepare(`SELECT date(timestamp) AS day, SUM(CASE WHEN type = 'in' THEN quantity ELSE 0 END) AS received, SUM(CASE WHEN type = 'out' THEN quantity ELSE 0 END) AS issued FROM transactions WHERE reversed_at IS NULL AND timestamp >= datetime('now', '-13 days') GROUP BY date(timestamp) ORDER BY day`).all();
    return {
      ...summary,
      cell_count: cellCount,
      occupied_cells: occupiedCells,
      occupancy_pct,
      filled_capacity: filledCapacity,
      capacity_total: capacityTotal,
      lowStock,
      categoryStock,
      recent,
      movementTrend,
    };
  });

  ipcMain.handle('analytics:replenishment', (_e, leadTime = 14, safetyDays = 7) => {
    const lead = Math.min(90, Math.max(1, Number(leadTime) || 14));
    const buffer = Math.min(60, Math.max(0, Number(safetyDays) || 0));
    const db = getDb();
    const orderedMap = new Map<number, number>();
    for (const row of db.prepare(`SELECT poi.item_id, SUM(poi.quantity) AS ordered_qty FROM purchase_order_items poi JOIN purchase_orders po ON po.id = poi.purchase_order_id WHERE po.status IN ('ordered','partial') GROUP BY poi.item_id`).all() as any[]) {
      orderedMap.set(row.item_id, Number(row.ordered_qty) || 0);
    }
    const rows = db.prepare(`SELECT i.id, i.name, i.sku, i.category, i.min_stock, i.package_qty, i.moq, i.pack_multiple, i.lead_time_days,
      COALESCE((SELECT SUM(inv.quantity) FROM inventory inv WHERE inv.item_id = i.id), 0) AS on_hand,
      COALESCE((SELECT SUM(pr.quantity) FROM project_reservations pr JOIN projects p ON p.id = pr.project_id WHERE pr.item_id = i.id AND p.status IN ('reserved','picking','picked','assembly')), 0) AS reserved,
      COALESCE((SELECT SUM(ic.quantity) FROM item_conditions ic WHERE ic.item_id = i.id AND ic.condition != 'ok'), 0) AS blocked_qty,
      COALESCE((SELECT SUM(ic.quantity) FROM item_conditions ic WHERE ic.item_id = i.id AND ic.condition = 'ok'), 0) AS ok_qty,
      COALESCE(i.cost_price, 0) AS cost_price,
      COALESCE((SELECT SUM(t.quantity) FROM transactions t WHERE t.item_id = i.id AND t.type = 'out' AND t.reversed_at IS NULL AND t.timestamp >= datetime('now', '-90 days')), 0) AS used_90d,
      COALESCE((SELECT SUM(t.quantity) FROM transactions t WHERE t.item_id = i.id AND t.type = 'out' AND t.reversed_at IS NULL AND t.timestamp >= datetime('now', '-30 days')), 0) AS used_30d,
      COALESCE((SELECT SUM(t.quantity) FROM transactions t WHERE t.item_id = i.id AND t.type = 'out' AND t.reversed_at IS NULL AND t.timestamp >= datetime('now', '-60 days') AND t.timestamp < datetime('now', '-30 days')), 0) AS used_prev_30d
      FROM items i ORDER BY i.name`).all() as any[];
    return rows.map((row) => {
      const itemLead = Number(row.lead_time_days) > 0 ? Number(row.lead_time_days) : lead;
      const averageDaily = Number(row.used_90d) / 90;
      const recentDaily = Number(row.used_30d) / 30;
      const prevDaily = Number(row.used_prev_30d) / 30;
      const trend = prevDaily > 0 ? Math.round(((recentDaily - prevDaily) / prevDaily) * 100) : (recentDaily > 0 ? 100 : 0);
      const seasonalFactor = averageDaily > 0 ? Math.min(1.5, Math.max(0.7, recentDaily / averageDaily)) : 1;
      const blocked = Number(row.blocked_qty || 0);
      const hasConditions = Number(row.ok_qty || 0) + blocked > 0;
      const serviceable = hasConditions ? Math.max(0, Number(row.on_hand) - blocked) : Number(row.on_hand);
      const available = Math.max(0, Math.min(Number(row.on_hand) - Number(row.reserved), serviceable - Number(row.reserved)));
      const alreadyOrdered = orderedMap.get(row.id) || 0;
      const rawTarget = Math.max(Number(row.min_stock) || 0, Math.ceil(averageDaily * seasonalFactor * (itemLead + buffer)));
      let suggested = Math.max(0, rawTarget - available - alreadyOrdered);
      const moq = Math.max(0, Number(row.moq) || 0);
      const pack = Math.max(1, Number(row.pack_multiple) || Number(row.package_qty) || 1);
      if (suggested > 0 && moq > 0) suggested = Math.max(suggested, moq);
      if (suggested > 0 && pack > 1) suggested = Math.ceil(suggested / pack) * pack;
      return {
        ...row,
        average_daily: Math.round(averageDaily * 100) / 100,
        recent_daily: Math.round(recentDaily * 100) / 100,
        trend_pct: trend,
        seasonal_factor: Math.round(seasonalFactor * 100) / 100,
        available,
        already_ordered: alreadyOrdered,
        target_stock: rawTarget,
        suggested_quantity: suggested,
        estimated_cost: suggested * Number(row.cost_price || 0),
        coverage_days: averageDaily > 0 ? Math.floor(available / averageDaily) : null,
        lead_days_used: itemLead,
      };
    }).filter((row) => row.suggested_quantity > 0).sort((left, right) => right.suggested_quantity - left.suggested_quantity || left.name.localeCompare(right.name, 'ru'));
  });

  ipcMain.handle('locations:list', () => {
    const rows = getDb().prepare(`WITH RECURSIVE location_order(id, sort_path) AS (
        SELECT id, printf('%08d', id) FROM locations WHERE parent_location_id IS NULL
        UNION ALL
        SELECT l.id, location_order.sort_path || '.' || printf('%08d', l.id)
        FROM locations l JOIN location_order ON l.parent_location_id = location_order.id
      )
      SELECT l.*, p.name AS parent_name, z.name AS zone_name,
        COALESCE(SUM(inv.quantity), 0) AS total_qty,
        COUNT(DISTINCT CASE WHEN inv.quantity > 0 THEN inv.item_id END) AS item_count
      FROM locations l
      LEFT JOIN location_order tree ON tree.id = l.id
      LEFT JOIN locations p ON p.id = l.parent_location_id
      LEFT JOIN zones z ON z.id = l.zone_id
      LEFT JOIN inventory inv ON inv.location_id = l.id
      GROUP BY l.id ORDER BY tree.sort_path, l.name`).all() as any[];
    const mapped = rows.map((row) => {
      const capacity = row.capacity_qty == null ? null : Number(row.capacity_qty);
      const total = Number(row.total_qty) || 0;
      const fill_pct = capacity && capacity > 0 ? Math.min(999, Math.round((total / capacity) * 100)) : null;
      return { ...row, fill_pct };
    });
    const scope = registry.getLocationScope();
    if (!scope || scope.length === 0) return mapped;
    return mapped.filter((row) => registry.locationInScope(Number(row.id), scope));
  });
  ipcMain.handle('locations:findByBarcode', (_e, barcode: string) => {
    return getDb().prepare('SELECT * FROM locations WHERE barcode = ?').get(barcode.trim()) || null;
  });
  ipcMain.handle('locations:contents', (_e, locationId: number) => {
    return getDb().prepare(`SELECT i.id, i.barcode, i.name, i.print_name, i.sku, i.category, i.min_stock, u.symbol AS unit_symbol,
      SUM(inv.quantity) AS on_hand,
      COALESCE((SELECT SUM(pr.quantity) FROM project_reservations pr JOIN projects p ON p.id = pr.project_id WHERE pr.item_id = i.id AND pr.location_id = inv.location_id AND p.status IN ('reserved','picking','picked','assembly')), 0) AS reserved,
      SUM(inv.quantity) AS quantity
      FROM inventory inv JOIN items i ON i.id = inv.item_id LEFT JOIN units u ON u.id = i.unit_id
      WHERE inv.location_id = ? AND inv.quantity > 0
      GROUP BY i.id
      ORDER BY i.name`).all(locationId).map((row: any) => ({
      ...row,
      available: Math.max(0, Number(row.on_hand || 0) - Number(row.reserved || 0)),
    }));
  });
  ipcMain.handle('zones:list', () => getDb().prepare(`SELECT z.*,
      COUNT(l.id) AS location_count,
      COALESCE(SUM(inv.quantity), 0) AS total_qty,
      COALESCE(SUM(CASE WHEN l.capacity_qty IS NOT NULL THEN l.capacity_qty ELSE 0 END), 0) AS capacity_total
    FROM zones z
    LEFT JOIN locations l ON l.zone_id = z.id
    LEFT JOIN inventory inv ON inv.location_id = l.id
    GROUP BY z.id ORDER BY z.name`).all());
  ipcMain.handle('zones:create', (_e, data: any) => {
    requirePerm('locations_edit');
    const name = String(data?.name || '').trim();
    if (!name) throw new Error('Укажите название зоны');
    const result = getDb().prepare('INSERT INTO zones (name, description) VALUES (?, ?)').run(name, data.description || null);
    return { id: result.lastInsertRowid };
  });
  ipcMain.handle('zones:update', (_e, id: number, data: any) => {
    requirePerm('locations_edit');
    const name = String(data?.name || '').trim();
    if (!name) throw new Error('Укажите название зоны');
    const changes = getDb().prepare('UPDATE zones SET name = ?, description = ? WHERE id = ?')
      .run(name, data.description || null, Number(id)).changes;
    if (!changes) throw new Error('Зона не найдена');
    return { id };
  });
  ipcMain.handle('zones:delete', (_e, id: number) => {
    requirePerm('locations_edit');
    const db = getDb();
    const used = (db.prepare('SELECT COUNT(*) AS c FROM locations WHERE zone_id = ?').get(Number(id)) as any).c;
    if (used > 0) throw new Error(`Зона используется в ${used} адресах — сначала снимите привязку`);
    const changes = db.prepare('DELETE FROM zones WHERE id = ?').run(Number(id)).changes;
    if (!changes) throw new Error('Зона не найдена');
    return { id };
  });
  ipcMain.handle('locations:create', (_e, data: any) => {
    requirePerm('locations_edit');
    try {
      const code = String(data.barcode || '').trim();
      if (!code || !String(data.name || '').trim()) throw new Error('Заполните код и название ячейки');
      const type = ['warehouse', 'subwarehouse', 'cell'].includes(data.location_type) ? data.location_type : 'cell';
      const parentId = Number(data.parent_location_id) || null;
      if (type === 'warehouse' && parentId) throw new Error('Склад верхнего уровня не может иметь родителя');
      if (type === 'subwarehouse' && !parentId) throw new Error('Выберите родительский склад для подсклада');
      if (parentId) {
        const parent = getDb().prepare('SELECT location_type FROM locations WHERE id = ?').get(parentId) as any;
        if (!parent) throw new Error('Родительский адрес не найден');
        if (parent.location_type === 'cell') throw new Error('Ячейка не может содержать вложенные адреса');
        if (type === 'subwarehouse' && !['warehouse', 'subwarehouse'].includes(parent.location_type)) throw new Error('Подсклад должен находиться внутри склада или подсклада');
      }
      assertBarcodesAvailable([code], undefined, 0);
      const capacity = data.capacity_qty === '' || data.capacity_qty == null ? null : Math.max(0, Number(data.capacity_qty) || 0);
      const result = getDb().prepare('INSERT INTO locations (barcode, name, description, zone_id, location_type, parent_location_id, capacity_qty, aisle, rack, shelf_level) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
        code,
        data.name.trim(),
        data.description || null,
        Number(data.zone_id) || null,
        type,
        parentId,
        capacity,
        String(data.aisle || '').trim() || null,
        String(data.rack || '').trim() || null,
        String(data.shelf_level || '').trim() || null,
      );
      return { id: result.lastInsertRowid };
    } catch (error) {
      throw mapDbError(error);
    }
  });
  ipcMain.handle('locations:update', (_e, id: number, data: any) => {
    requirePerm('locations_edit');
    try {
      const code = String(data.barcode || '').trim();
      if (!code || !String(data.name || '').trim()) throw new Error('Заполните код и название ячейки');
      const existing = getDb().prepare('SELECT location_type, parent_location_id, zone_id FROM locations WHERE id = ?').get(id) as any;
      if (!existing) throw new Error('Адрес не найден');
      const type = ['warehouse', 'subwarehouse', 'cell'].includes(data.location_type) ? data.location_type : existing.location_type;
      const parentId = data.parent_location_id === undefined ? existing.parent_location_id : Number(data.parent_location_id) || null;
      const zoneId = data.zone_id === undefined ? existing.zone_id : Number(data.zone_id) || null;
      if (parentId === id) throw new Error('Адрес не может быть родителем самому себе');
      if (type === 'warehouse' && parentId) throw new Error('Склад верхнего уровня не может иметь родителя');
      if (type === 'subwarehouse' && !parentId) throw new Error('Выберите родительский склад для подсклада');
      if (type === 'cell' && getDb().prepare('SELECT 1 FROM locations WHERE parent_location_id = ? LIMIT 1').get(id)) throw new Error('Сначала переместите вложенные адреса');
      if (parentId) {
        const parent = getDb().prepare('SELECT location_type FROM locations WHERE id = ?').get(parentId) as any;
        if (!parent) throw new Error('Родительский адрес не найден');
        if (parent.location_type === 'cell') throw new Error('Ячейка не может содержать вложенные адреса');
        if (type === 'subwarehouse' && !['warehouse', 'subwarehouse'].includes(parent.location_type)) throw new Error('Подсклад должен находиться внутри склада или подсклада');
        const descendant = getDb().prepare(`WITH RECURSIVE descendants(id) AS ( SELECT id FROM locations WHERE parent_location_id = ? UNION ALL SELECT l.id FROM locations l JOIN descendants d ON l.parent_location_id = d.id ) SELECT 1 FROM descendants WHERE id = ? LIMIT 1`).get(id, parentId);
        if (descendant) throw new Error('Нельзя переместить адрес внутрь его собственного поддерева');
      }
      assertBarcodesAvailable([code], undefined, id);
      const capacity = data.capacity_qty === '' || data.capacity_qty == null ? null : Math.max(0, Number(data.capacity_qty) || 0);
      const result = getDb().prepare('UPDATE locations SET barcode = ?, name = ?, description = ?, zone_id = ?, location_type = ?, parent_location_id = ?, capacity_qty = ?, aisle = ?, rack = ?, shelf_level = ? WHERE id = ?').run(
        code,
        data.name.trim(),
        data.description || null,
        zoneId,
        type,
        parentId,
        capacity,
        String(data.aisle || '').trim() || null,
        String(data.rack || '').trim() || null,
        String(data.shelf_level || '').trim() || null,
        id,
      );
      return { changes: result.changes };
    } catch (error) {
      throw mapDbError(error);
    }
  });
  ipcMain.handle('locations:delete', (_e, id: number) => {
    requirePerm('locations_edit');
    const db = getDb();
    if (db.prepare('SELECT 1 FROM locations WHERE parent_location_id = ? LIMIT 1').get(id)) throw new Error('Сначала переместите или удалите вложенные адреса');
    const used = db.prepare('SELECT COALESCE(SUM(quantity), 0) AS total FROM inventory WHERE location_id = ?').get(id) as any;
    if (used.total > 0) throw new Error('Нельзя удалить ячейку с остатком. Сначала переместите или очистите товары.');
    const reservedHere = Number((db.prepare(`SELECT COALESCE(SUM(pr.quantity), 0) AS q FROM project_reservations pr
      JOIN projects p ON p.id = pr.project_id
      WHERE pr.location_id = ? AND p.status IN ('reserved','picking','picked','assembly')`).get(id) as any)?.q || 0);
    if (reservedHere > 0) throw new Error(`В ячейке есть резерв проектов (${reservedHere} шт.). Сначала снимите резерв.`);
    const staleHere = Number((db.prepare('SELECT COUNT(*) AS c FROM project_reservations WHERE location_id = ?').get(id) as any)?.c || 0);
    if (staleHere > 0) {
      db.prepare('DELETE FROM project_reservations WHERE location_id = ?').run(id);
    }
    const remove = db.transaction(() => {
      const sessions = db.prepare('SELECT id FROM inventory_sessions WHERE location_id = ?').all(id) as any[];
      for (const session of sessions) db.prepare('DELETE FROM inventory_counts WHERE session_id = ?').run(session.id);
      db.prepare('DELETE FROM inventory_sessions WHERE location_id = ?').run(id);
      db.prepare('DELETE FROM inventory WHERE location_id = ?').run(id);
      return db.prepare('DELETE FROM locations WHERE id = ?').run(id).changes;
    });
    return { changes: remove() };
  });

  function assertStockableItem(db: any, itemId: number) {
    const row = db.prepare('SELECT name, item_type FROM items WHERE id = ?').get(Number(itemId)) as any;
    if (!row) throw new Error('Товар не найден');
    if (String(row.item_type || 'product') === 'service') {
      throw new Error(`«${row.name}» — услуга, складской остаток не ведётся`);
    }
  }

  ipcMain.handle('inventory:set', (_e, data: any) => {
    requirePerm('inventory');
    const db = getDb();
    const itemId = Number(data.item_id);
    const locationId = Number(data.location_id);
    assertStockableItem(db, itemId);
    registry.requireLocationAccess(locationId);
    const quantity = Math.max(0, Number(data.quantity) || 0);
    const previous = getStockAtLocation(itemId, locationId);
    const delta = quantity - previous;
    const reserved = getReservedQty(itemId, locationId);
    if (quantity < reserved) throw new Error(`Нельзя установить остаток ниже резерва (${reserved} шт.)`);
    if (delta > 0) assertLocationCapacity(db, locationId, delta);
    const update = db.transaction(() => {
      if (delta > 0) {
        addStockAtLocation(itemId, locationId, delta, 0);
        insertLedger({
          item_id: itemId, location_id: locationId, type: 'in', quantity: delta,
          comment: data.comment || 'Изменение остатка', reason: data.reason || 'MANUAL',
          source: data.source || 'MANUAL', document_ref: data.document_ref || null, project_id: data.project_id || null,
        });
      } else if (delta < 0) {
        for (const slice of allocateLotsForIssue(itemId, locationId, Math.abs(delta))) {
          addStockAtLocation(itemId, locationId, -slice.quantity, slice.lot_id);
          insertLedger({
            item_id: itemId, location_id: locationId, type: 'out', quantity: slice.quantity,
            comment: data.comment || 'Изменение остатка', reason: data.reason || 'USAGE',
            source: data.source || 'MANUAL', document_ref: data.document_ref || null, project_id: data.project_id || null,
            lot_id: slice.lot_id || null,
          });
        }
      }
    });
    update();
    touchUi('stock');
    return { quantity };
  });

  ipcMain.handle('inventory:adjust', (_e, data: any) => {
    requirePerm('inventory');
    const db = getDb();
    const itemId = Number(data.item_id);
    const locationId = Number(data.location_id);
    assertStockableItem(db, itemId);
    registry.requireLocationAccess(locationId);
    const delta = Math.floor(Number(data.delta) || 0);
    const previous = getStockAtLocation(itemId, locationId);
    const quantity = previous + delta;
    if (quantity < 0) throw new Error('Недостаточно товара в ячейке');
    const reserved = getReservedQty(itemId, locationId);
    if (quantity < reserved) throw new Error(`Часть остатка зарезервирована (${reserved} шт.)`);
    if (delta > 0) assertLocationCapacity(db, locationId, delta);
    const update = db.transaction(() => {
      if (delta > 0) {
        addStockAtLocation(itemId, locationId, delta, 0);
        insertLedger({
          item_id: itemId, location_id: locationId, type: 'in', quantity: delta,
          comment: data.comment || 'Сканирование', reason: data.reason || 'MANUAL',
          source: data.source || 'SCANNER', document_ref: data.document_ref || null, project_id: data.project_id || null,
        });
      } else if (delta < 0) {
        for (const slice of allocateLotsForIssue(itemId, locationId, Math.abs(delta))) {
          addStockAtLocation(itemId, locationId, -slice.quantity, slice.lot_id);
          insertLedger({
            item_id: itemId, location_id: locationId, type: 'out', quantity: slice.quantity,
            comment: data.comment || 'Сканирование', reason: data.reason || 'USAGE',
            source: data.source || 'SCANNER', document_ref: data.document_ref || null, project_id: data.project_id || null,
            lot_id: slice.lot_id || null,
          });
        }
      }
    });
    update();
    const item = db.prepare('SELECT name, min_stock FROM items WHERE id = ?').get(itemId) as any;
    const total = db.prepare('SELECT COALESCE(SUM(quantity), 0) AS quantity FROM inventory WHERE item_id = ?').get(itemId) as any;
    if (item && total.quantity <= item.min_stock && Notification.isSupported()) new Notification({ title: 'Низкий остаток', body: `${item.name}: осталось ${total.quantity}` }).show();
    touchUi('stock');
    return { quantity };
  });

  ipcMain.handle('inventory:batchAdjust', (_e, data: any) => {
    requirePerm('inventory');
    const db = getDb();
    const actions = Array.isArray(data.actions) ? data.actions : [];
    const apply = db.transaction(() => actions.map((action: any) => {
      const itemId = Number(action.item_id);
      const locationId = Number(action.location_id);
      const delta = Math.floor(Number(action.delta) || 0);
      const previous = getStockAtLocation(itemId, locationId);
      const quantity = previous + delta;
      if (quantity < 0) throw new Error('Пакетная операция создала отрицательный остаток');
      const reserved = getReservedQty(itemId, locationId);
      if (quantity < reserved) throw new Error(`Пакетная операция затрагивает резерв (${reserved} шт.)`);
      if (delta > 0) assertLocationCapacity(db, locationId, delta);
      if (delta > 0) {
        addStockAtLocation(itemId, locationId, delta, 0);
        insertLedger({
          item_id: itemId, location_id: locationId, type: 'in', quantity: delta,
          comment: data.comment || 'Пакетная операция', reason: data.reason || 'MANUAL', source: data.source || 'MANUAL',
        });
      } else if (delta < 0) {
        for (const slice of allocateLotsForIssue(itemId, locationId, Math.abs(delta))) {
          addStockAtLocation(itemId, locationId, -slice.quantity, slice.lot_id);
          insertLedger({
            item_id: itemId, location_id: locationId, type: 'out', quantity: slice.quantity,
            comment: data.comment || 'Пакетная операция', reason: data.reason || 'USAGE', source: data.source || 'MANUAL',
            lot_id: slice.lot_id || null,
          });
        }
      }
      return quantity;
    }));
    const quantities = apply();
    touchUi('stock');
    return { quantities };
  });

  function postTransferDocument(data: {
    from_location_id: number;
    to_location_id: number;
    note?: string | null;
    reason?: string | null;
    source?: string | null;
    lines: Array<{ item_id: number; quantity: number }>;
  }) {
    requirePerm('inventory');
    const db = getDb();
    const fromId = Number(data.from_location_id);
    const toId = Number(data.to_location_id);
    registry.requireLocationAccess(fromId);
    registry.requireLocationAccess(toId);
    if (!fromId || !toId || fromId === toId) throw new Error('Укажите разные ячейки «откуда» и «куда»');
    const lines = (data.lines || [])
      .map((row) => ({ item_id: Number(row.item_id), quantity: Math.max(0, Math.floor(Number(row.quantity) || 0)) }))
      .filter((row) => row.item_id && row.quantity > 0);
    if (!lines.length) throw new Error('Добавьте хотя бы одну строку перемещения');


    const merged = new Map<number, number>();
    for (const row of lines) merged.set(row.item_id, (merged.get(row.item_id) || 0) + row.quantity);
    const uniqueLines = [...merged.entries()].map(([item_id, quantity]) => ({ item_id, quantity }));

    const totalQty = uniqueLines.reduce((sum, row) => sum + row.quantity, 0);
    assertLocationCapacity(db, toId, totalQty);

    for (const row of uniqueLines) {
      assertStockableItem(db, row.item_id);
      const sourceQty = getStockAtLocation(row.item_id, fromId);
      if (sourceQty < row.quantity) {
        const item = db.prepare('SELECT name FROM items WHERE id = ?').get(row.item_id) as any;
        throw new Error(`Недостаточно «${item?.name || row.item_id}» в исходной ячейке (есть ${sourceQty}, нужно ${row.quantity})`);
      }
      const reserved = getReservedQty(row.item_id, fromId);
      if (sourceQty - row.quantity < reserved) {
        throw new Error(`Нельзя переместить зарезервированный остаток товара #${row.item_id} (${reserved} шт.)`);
      }
    }

    const fromLoc = db.prepare('SELECT name FROM locations WHERE id = ?').get(fromId) as any;
    const toLoc = db.prepare('SELECT name FROM locations WHERE id = ?').get(toId) as any;
    const actor = actorName();
    let docId = 0;
    let docNo = '';

    const run = db.transaction(() => {
      docNo = nextDocumentNo('transfer', 'TR');
      const upserted = upsertDocument({
        doc_type: 'transfer',
        doc_no: docNo,
        status: 'posted',
        doc_date: new Date().toISOString().slice(0, 10),
        party: `${fromLoc?.name || fromId} → ${toLoc?.name || toId}`,
        author: actor,
        note: data.note || `Перемещение · ${uniqueLines.length} поз.`,
        ref_table: 'locations',
        ref_id: toId,
        posted_by: actor,
      });
      docId = Number(upserted.id);
      const insertLine = db.prepare(`INSERT INTO document_lines
        (document_id, item_id, location_id, quantity, line_role, counterpart_item_id, note)
        VALUES (?, ?, ?, ?, 'main', NULL, ?)`);
      for (const row of uniqueLines) {
        insertLine.run(docId, row.item_id, fromId, row.quantity, `→ ${toLoc?.name || toId}`);
        const slices = allocateLotsForIssue(row.item_id, fromId, row.quantity);
        for (const slice of slices) {
          addStockAtLocation(row.item_id, fromId, -slice.quantity, slice.lot_id);
          addStockAtLocation(row.item_id, toId, slice.quantity, slice.lot_id);
          insertLedger({
            item_id: row.item_id,
            location_id: toId,
            type: 'move',
            quantity: slice.quantity,
            comment: data.note || 'Перемещение',
            reason: data.reason || 'TRANSFER',
            source: data.source || 'STOCK_OP',
            from_location_id: fromId,
            to_location_id: toId,
            document_ref: docNo,
            user_name: actor,
            lot_id: slice.lot_id || null,
          });
        }
      }
    });
    run();
    audit('stock.transfer', 'document', docId, `${docNo}: ${uniqueLines.length} поз. · ${totalQty} ед.`);
    touchUi('stock');
    return { document_id: docId, doc_no: docNo, lines: uniqueLines.length, quantity: totalQty };
  }

  ipcMain.handle('inventory:move', (_e, data: any) => {
    const result = postTransferDocument({
      from_location_id: Number(data.from_location_id),
      to_location_id: Number(data.to_location_id),
      note: data.comment || null,
      reason: data.reason || 'TRANSFER',
      source: data.source || 'STOCK_OP',
      lines: [{ item_id: Number(data.item_id), quantity: Number(data.quantity) }],
    });
    return { quantity: result.quantity, doc_no: result.doc_no, document_id: result.document_id };
  });

  ipcMain.handle('inventory:transfer', (_e, data: any) => {
    return postTransferDocument({
      from_location_id: Number(data.from_location_id),
      to_location_id: Number(data.to_location_id),
      note: data.note || data.comment || null,
      reason: data.reason || 'TRANSFER',
      source: data.source || 'STOCK_OP',
      lines: data.lines || [],
    });
  });

  const STOCK_OP_META: Record<string, { prefix: string; label: string; reason: string }> = {
    writeoff: { prefix: 'WOFF', label: 'Списание', reason: 'WRITEOFF' },
    surplus: { prefix: 'SURP', label: 'Оприходование излишков', reason: 'SURPLUS' },
    regrade: { prefix: 'RGRD', label: 'Пересортица', reason: 'REGRADE' },
    disassemble: { prefix: 'DISA', label: 'Разукомплектация', reason: 'DISASSEMBLE' },
    assemble: { prefix: 'ASMB', label: 'Комплектация', reason: 'ASSEMBLE' },
  };
  const CANCELABLE_STOCK = new Set([...Object.keys(STOCK_OP_META), 'transfer']);

  function assertLocationCapacity(db: any, locationId: number, additionalQty: number) {
    if (!(additionalQty > 0)) return;
    const loc = db.prepare('SELECT name, capacity_qty FROM locations WHERE id = ?').get(Number(locationId)) as any;
    if (!loc || loc.capacity_qty == null || loc.capacity_qty === '') return;
    const capacity = Number(loc.capacity_qty);
    if (!Number.isFinite(capacity) || capacity < 0) return;
    const current = Number((db.prepare('SELECT COALESCE(SUM(quantity), 0) AS qty FROM inventory WHERE location_id = ?')
      .get(Number(locationId)) as any).qty || 0);

    if (current > capacity) return;
    if (current + additionalQty > capacity) {
      throw new Error(`Превышена вместимость «${loc.name}»: ${current} + ${additionalQty} > ${capacity}`);
    }
  }

  function assertStockAvailable(db: any, itemId: number, locationId: number, need: number) {
    const qty = getStockAtLocation(itemId, locationId);
    if (qty < need) throw new Error(`Недостаточно товара #${itemId} в ячейке (есть ${qty}, нужно ${need})`);
    const reserved = getReservedQty(itemId, locationId);
    if (qty - need < reserved) throw new Error(`Часть остатка #${itemId} зарезервирована (${reserved} шт.)`);
  }

  function applyStockDelta(db: any, itemId: number, locationId: number, delta: number, meta: {
    comment: string; reason: string; document_ref: string; user_name: string;
  }, lotId?: number | null) {
    const amount = Math.floor(Number(delta) || 0);
    if (amount === 0) return;
    if (amount > 0) {
      assertLocationCapacity(db, locationId, amount);
      const lid = normalizeLotId(lotId);
      addStockAtLocation(itemId, locationId, amount, lid);
      insertLedger({
        item_id: itemId,
        location_id: locationId,
        type: 'in',
        quantity: amount,
        comment: meta.comment,
        reason: meta.reason,
        source: 'STOCK_OP',
        document_ref: meta.document_ref,
        user_name: meta.user_name,
        lot_id: lid || null,
      });
      return;
    }
    const need = Math.abs(amount);
    assertStockAvailable(db, itemId, locationId, need);
    const slices = (lotId != null && Number(lotId) > 0)
      ? (() => {
        const lid = normalizeLotId(lotId);
        const have = getStockAtLocation(itemId, locationId, lid);
        if (have < need) throw new Error(`Недостаточно партии #${lid} по товару #${itemId} (есть ${have}, нужно ${need})`);
        return [{ lot_id: lid, quantity: need }];
      })()
      : allocateLotsForIssue(itemId, locationId, need);
    for (const slice of slices) {
      addStockAtLocation(itemId, locationId, -slice.quantity, slice.lot_id);
      insertLedger({
        item_id: itemId,
        location_id: locationId,
        type: 'out',
        quantity: slice.quantity,
        comment: meta.comment,
        reason: meta.reason,
        source: 'STOCK_OP',
        document_ref: meta.document_ref,
        user_name: meta.user_name,
        lot_id: slice.lot_id || null,
      });
    }
  }

  
  ipcMain.handle('stockOps:post', (_e, data: any = {}) => {
    requirePerm('inventory');
    const kind = String(data.kind || '').trim();
    const meta = STOCK_OP_META[kind];
    if (!meta) throw new Error('Неизвестный вид складского акта');
    const postKey = ({ writeoff: 'post_writeoff', surplus: 'post_surplus', regrade: 'post_regrade', disassemble: 'post_disassemble', assemble: 'post_assemble' } as Record<string, string>)[kind];
    if (postKey) requirePerm(postKey);
    const locationId = Number(data.location_id);
    if (!locationId) throw new Error('Выберите ячейку');
    registry.requireLocationAccess(locationId);
    const db = getDb();
    const location = db.prepare('SELECT id, name FROM locations WHERE id = ?').get(locationId) as any;
    if (!location) throw new Error('Ячейка не найдена');
    const note = String(data.note || '').trim() || meta.label;
    const parentId = data.parent_id ? Number(data.parent_id) : null;
    if (parentId) {
      const parent = db.prepare('SELECT id FROM documents WHERE id = ?').get(parentId) as any;
      if (!parent) throw new Error('Документ-основание не найден');
    }
    const docNo = nextDocumentNo(kind, meta.prefix);
    const actor = actorName();
    const today = new Date().toISOString().slice(0, 10);

    const result = db.transaction(() => {
      const linesToSave: Array<{ item_id: number; quantity: number; counterpart_item_id?: number | null; line_role: string }> = [];

      if (kind === 'writeoff' || kind === 'surplus') {
        const lines = Array.isArray(data.lines) ? data.lines : [];
        for (const row of lines) {
          const itemId = Number(row.item_id);
          const qty = Math.max(0, Math.floor(Number(row.quantity) || 0));
          if (!itemId || !qty) continue;
          if (kind === 'writeoff') assertStockAvailable(db, itemId, locationId, qty);
          applyStockDelta(db, itemId, locationId, kind === 'writeoff' ? -qty : qty, {
            comment: `${meta.label}: ${note}`,
            reason: meta.reason,
            document_ref: docNo,
            user_name: actor,
          });
          linesToSave.push({ item_id: itemId, quantity: qty, line_role: 'main' });
        }
      } else if (kind === 'regrade') {
        const fromId = Number(data.from_item_id);
        const toId = Number(data.to_item_id);
        const qty = Math.max(0, Math.floor(Number(data.quantity) || 0));
        if (!fromId || !toId || fromId === toId) throw new Error('Укажите разные товары для пересортицы');
        if (!qty) throw new Error('Укажите количество');
        assertStockAvailable(db, fromId, locationId, qty);
        applyStockDelta(db, fromId, locationId, -qty, {
          comment: `${meta.label}: списание`, reason: meta.reason, document_ref: docNo, user_name: actor,
        });
        applyStockDelta(db, toId, locationId, qty, {
          comment: `${meta.label}: оприходование`, reason: meta.reason, document_ref: docNo, user_name: actor,
        });
        linesToSave.push({ item_id: fromId, quantity: qty, counterpart_item_id: toId, line_role: 'source' });
        linesToSave.push({ item_id: toId, quantity: qty, counterpart_item_id: fromId, line_role: 'target' });
      } else if (kind === 'disassemble') {
        const kitId = Number(data.from_item_id);
        const kitQty = Math.max(0, Math.floor(Number(data.quantity) || 0));
        let components = Array.isArray(data.components) ? data.components : [];
        if (!kitId || !kitQty) throw new Error('Укажите комплект и количество');
        if (!components.length) {
          components = listKitComponents(kitId).map((row) => ({
            item_id: row.id,
            quantity: Number(row.quantity) * kitQty,
          }));
        }
        assertStockAvailable(db, kitId, locationId, kitQty);
        applyStockDelta(db, kitId, locationId, -kitQty, {
          comment: `${meta.label}: списание комплекта`, reason: meta.reason, document_ref: docNo, user_name: actor,
        });
        linesToSave.push({ item_id: kitId, quantity: kitQty, line_role: 'source' });
        for (const row of components) {
          const itemId = Number(row.item_id);
          const qty = Math.max(0, Math.floor(Number(row.quantity) || 0));
          if (!itemId || !qty) continue;
          applyStockDelta(db, itemId, locationId, qty, {
            comment: `${meta.label}: компонент`, reason: meta.reason, document_ref: docNo, user_name: actor,
          });
          linesToSave.push({ item_id: itemId, quantity: qty, counterpart_item_id: kitId, line_role: 'component' });
        }
        if (linesToSave.length < 2) throw new Error('Добавьте хотя бы один компонент или задайте состав комплекта');
      } else if (kind === 'assemble') {
        const kitId = Number(data.to_item_id || data.from_item_id);
        const kitQty = Math.max(0, Math.floor(Number(data.quantity) || 0));
        let components = Array.isArray(data.components) ? data.components : [];
        if (!kitId || !kitQty) throw new Error('Укажите комплект и количество');
        assertStockableItem(db, kitId);
        if (!components.length) {
          components = listKitComponents(kitId).map((row) => ({
            item_id: row.id,
            quantity: Number(row.quantity) * kitQty,
          }));
        }
        for (const row of components) {
          const itemId = Number(row.item_id);
          const qty = Math.max(0, Math.floor(Number(row.quantity) || 0));
          if (!itemId || !qty) continue;
          assertStockAvailable(db, itemId, locationId, qty);
          applyStockDelta(db, itemId, locationId, -qty, {
            comment: `${meta.label}: списание компонента`, reason: meta.reason, document_ref: docNo, user_name: actor,
          });
          linesToSave.push({ item_id: itemId, quantity: qty, counterpart_item_id: kitId, line_role: 'component' });
        }
        if (!linesToSave.length) throw new Error('Добавьте хотя бы один компонент или задайте состав комплекта');
        applyStockDelta(db, kitId, locationId, kitQty, {
          comment: `${meta.label}: оприходование комплекта`, reason: meta.reason, document_ref: docNo, user_name: actor,
        });
        linesToSave.push({ item_id: kitId, quantity: kitQty, line_role: 'target' });
      }

      if (!linesToSave.length) throw new Error('Нет строк для проведения');

      const doc = upsertDocument({
        doc_type: kind,
        doc_no: docNo,
        status: 'posted',
        doc_date: today,
        party: location.name,
        author: actor,
        posted_by: actor,
        note,
        ref_table: 'locations',
        ref_id: locationId,
        parent_id: parentId,
      });

      const insertLine = db.prepare(`INSERT INTO document_lines
        (document_id, item_id, location_id, quantity, counterpart_item_id, line_role, note)
        VALUES (?, ?, ?, ?, ?, ?, ?)`);
      for (const line of linesToSave) {
        insertLine.run(doc.id, line.item_id, locationId, line.quantity, line.counterpart_item_id ?? null, line.line_role, null);
      }

      return { id: doc.id, doc_no: docNo, kind, lines: linesToSave.length };
    })();

    audit(`stock.${kind}`, 'document', result.id, result.doc_no);
    return result;
  });



  ipcMain.handle('stockOps:cancel', (_e, documentId: number, options?: { cascade?: boolean }) => {
    requirePerm('inventory');
    requirePerm('cancel_stock');
    const cascade = Boolean(options?.cascade);
    const actor = actorName();

    function cancelOne(docId: number, depth: number): { id: number; doc_no: string; reversed: number; cascaded: string[] } {
      if (depth > 12) throw new Error('Слишком глубокая цепочка следствий');
      const db = getDb();
      const doc = getDocumentById(Number(docId));
      if (!doc) throw new Error('Документ не найден');
      if (!CANCELABLE_STOCK.has(doc.doc_type)) throw new Error('Отмена доступна только для складских актов и перемещений');
      if (doc.status !== 'posted') throw new Error(`Отменить можно только проведённый акт (${doc.doc_no})`);
      if (doc.ref_id) registry.requireLocationAccess(Number(doc.ref_id));

      const cascaded: string[] = [];
      const children = listDocumentChildren(doc.id).filter((c: any) => c.status === 'posted');
      if (children.length) {
        if (!cascade) {
          throw new Error(`Сначала отмените следствия: ${children.map((c: any) => c.doc_no).join(', ')}`);
        }
        for (const child of children) {
          if (!CANCELABLE_STOCK.has(child.doc_type)) {
            throw new Error(`Нельзя каскадом отменить следствие ${child.doc_no}`);
          }
          const childResult = cancelOne(child.id, depth + 1);
          cascaded.push(child.doc_no, ...childResult.cascaded);
        }
      }

      const txs = db.prepare(`SELECT * FROM transactions
        WHERE reversed_at IS NULL AND document_ref = ?
          AND (source IN ('STOCK_OP', 'MANUAL') OR type = 'move')
        ORDER BY id DESC`).all(doc.doc_no) as any[];
      if (!txs.length) throw new Error(`Движения акта ${doc.doc_no} не найдены`);

      const result = db.transaction(() => {
        for (const tx of txs) {
          const lotId = normalizeLotId(tx.lot_id);
          const qty = Math.abs(Number(tx.quantity || 0));
          if (!qty) continue;

          if (tx.type === 'move') {
            const toId = Number(tx.to_location_id || tx.location_id);
            const fromId = Number(tx.from_location_id);
            if (!fromId || !toId) throw new Error(`Нельзя отменить перемещение ${doc.doc_no}: нет адресов from/to`);
            registry.requireLocationAccess(fromId);
            registry.requireLocationAccess(toId);
            const atTo = getStockAtLocation(tx.item_id, toId, lotId);
            if (atTo < qty) {
              throw new Error(`Нельзя отменить ${doc.doc_no}: остаток в ячейке назначения уже израсходован (товар #${tx.item_id})`);
            }
            const nextToTotal = getStockAtLocation(tx.item_id, toId) - qty;
            const reservedTo = (db.prepare(`SELECT COALESCE(SUM(pr.quantity), 0) AS quantity
              FROM project_reservations pr JOIN projects p ON p.id = pr.project_id
              WHERE pr.item_id = ? AND pr.location_id = ? AND p.status IN ('reserved','picking','picked','assembly')`)
              .get(tx.item_id, toId) as any).quantity;
            if (nextToTotal < reservedTo) {
              throw new Error(`Нельзя отменить ${doc.doc_no}: товар #${tx.item_id} зарезервирован в ячейке назначения`);
            }
            assertLocationCapacity(db, fromId, qty);
            addStockAtLocation(tx.item_id, toId, -qty, lotId);
            addStockAtLocation(tx.item_id, fromId, qty, lotId);
            db.prepare('UPDATE transactions SET reversed_at = CURRENT_TIMESTAMP WHERE id = ?').run(tx.id);
            insertLedger({
              item_id: tx.item_id,
              location_id: fromId,
              type: 'move',
              quantity: qty,
              comment: `Отмена ${doc.doc_no}`,
              reason: String(tx.reason || 'TRANSFER'),
              source: 'SYSTEM',
              from_location_id: toId,
              to_location_id: fromId,
              document_ref: `${doc.doc_no}-REV`,
              user_name: actor,
              lot_id: lotId || null,
            });
            continue;
          }

          const delta = tx.type === 'in' ? -qty : qty;
          const currentLot = getStockAtLocation(tx.item_id, tx.location_id, lotId);
          const nextLot = currentLot + delta;
          if (nextLot < 0) {
            throw new Error(`Нельзя отменить ${doc.doc_no}: остаток по товару #${tx.item_id} уже израсходован`);
          }
          if (delta < 0) {
            const nextTotal = getStockAtLocation(tx.item_id, tx.location_id) + delta;
            const reserved = (db.prepare(`SELECT COALESCE(SUM(pr.quantity), 0) AS quantity
              FROM project_reservations pr JOIN projects p ON p.id = pr.project_id
              WHERE pr.item_id = ? AND pr.location_id = ? AND p.status IN ('reserved','picking','picked','assembly')`)
              .get(tx.item_id, tx.location_id) as any).quantity;
            if (nextTotal < reserved) {
              throw new Error(`Нельзя отменить ${doc.doc_no}: товар #${tx.item_id} зарезервирован`);
            }
          }
          addStockAtLocation(tx.item_id, tx.location_id, delta, lotId);
          db.prepare('UPDATE transactions SET reversed_at = CURRENT_TIMESTAMP WHERE id = ?').run(tx.id);
          insertLedger({
            item_id: tx.item_id,
            location_id: tx.location_id,
            type: delta > 0 ? 'in' : 'out',
            quantity: Math.abs(delta),
            comment: `Отмена ${doc.doc_no}`,
            reason: String(tx.reason || 'STOCK_OP'),
            source: 'SYSTEM',
            document_ref: `${doc.doc_no}-REV`,
            user_name: actor,
            lot_id: lotId || null,
          });
        }
        upsertDocument({
          doc_type: doc.doc_type,
          doc_no: doc.doc_no,
          status: 'cancelled',
          author: actor,
          posted_by: actor,
          note: doc.note ? `${doc.note} · отменён` : 'Отменён',
          ref_table: doc.ref_table,
          ref_id: doc.ref_id,
          parent_id: doc.parent_id,
        });
        return { reversed: txs.length };
      })();

      audit('stock.cancel', 'document', doc.id, `${doc.doc_no}: отмена ${result.reversed} движений${cascaded.length ? ` · каскад: ${cascaded.join(', ')}` : ''}`);
      return { id: doc.id, doc_no: doc.doc_no, reversed: result.reversed, cascaded };
    }

    return cancelOne(Number(documentId), 0);
  });

  ipcMain.handle('documents:get', (_e, id: number) => {
    requirePerm('documents');
    const db = getDb();
    const doc = getDocumentById(Number(id));
    if (!doc) return null;
    let lines = db.prepare(`SELECT dl.*, i.name AS item_name, i.sku, ci.name AS counterpart_name
      FROM document_lines dl
      JOIN items i ON i.id = dl.item_id
      LEFT JOIN items ci ON ci.id = dl.counterpart_item_id
      WHERE dl.document_id = ?`).all(doc.id) as any[];

    if (!lines.length && doc.ref_table === 'purchase_orders' && doc.ref_id) {
      lines = db.prepare(`SELECT poi.item_id AS id, poi.item_id, poi.quantity, 'main' AS line_role,
        i.name AS item_name, i.sku, NULL AS counterpart_name, NULL AS counterpart_item_id
        FROM purchase_order_items poi JOIN items i ON i.id = poi.item_id
        WHERE poi.purchase_order_id = ?`).all(doc.ref_id) as any[];
    } else if (!lines.length && doc.ref_table === 'inventory_sessions' && doc.ref_id) {
      const session = db.prepare('SELECT location_id FROM inventory_sessions WHERE id = ?').get(doc.ref_id) as any;
      lines = db.prepare(`SELECT c.item_id AS id, c.item_id, c.counted_quantity AS quantity, 'main' AS line_role,
        i.name AS item_name, i.sku, NULL AS counterpart_name, NULL AS counterpart_item_id,
        COALESCE(inv.quantity, 0) AS base_quantity
        FROM inventory_counts c JOIN items i ON i.id = c.item_id
        LEFT JOIN inventory inv ON inv.item_id = c.item_id AND inv.location_id = ?
        WHERE c.session_id = ?`).all(session?.location_id ?? null, doc.ref_id) as any[];
    } else if (!lines.length && doc.ref_table === 'projects' && doc.ref_id) {
      lines = db.prepare(`SELECT pi.item_id AS id, pi.item_id, pi.quantity, 'component' AS line_role,
        i.name AS item_name, i.sku, NULL AS counterpart_name, NULL AS counterpart_item_id
        FROM project_items pi JOIN items i ON i.id = pi.item_id
        WHERE pi.project_id = ?`).all(doc.ref_id) as any[];
    }
    const children = listDocumentChildren(doc.id);
    const attachments = listDocumentAttachments(doc.id);
    return { ...doc, lines, children, attachments };
  });

  ipcMain.handle('documents:listAttachments', (_e, documentId: number) => {
    requirePerm('documents');
    return listDocumentAttachments(Number(documentId));
  });

  ipcMain.handle('documents:addAttachment', async (_e, documentId: number, note?: string) => {
    requirePerm('documents');
    const doc = getDocumentById(Number(documentId));
    if (!doc) throw new Error('Документ не найден');
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Документы и файлы', extensions: ['pdf', 'png', 'jpg', 'jpeg', 'webp', 'doc', 'docx', 'xls', 'xlsx', 'txt', 'csv', 'zip'] },
        { name: 'Все файлы', extensions: ['*'] },
      ],
    });
    if (result.canceled || !result.filePaths.length) return [];
    const root = getAttachmentsRoot();
    const docDir = path.join(root, `doc-${doc.id}`);
    fs.mkdirSync(docDir, { recursive: true });
    const maxBytes = 25 * 1024 * 1024;
    const created: any[] = [];
    for (const source of result.filePaths.slice(0, 10)) {
      const stat = fs.statSync(source);
      if (!stat.isFile()) continue;
      if (stat.size > maxBytes) throw new Error(`Файл слишком большой (макс. 25 МБ): ${path.basename(source)}`);
      const fileName = path.basename(source);
      const version = nextAttachmentVersion(doc.id, fileName);
      const safeBase = fileName.replace(/[\\/:*?"<>|]+/g, '_').slice(0, 120) || 'file';
      const storedName = path.join(`doc-${doc.id}`, `v${version}-${Date.now()}-${safeBase}`).replace(/\\/g, '/');
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
      const row = insertDocumentAttachment({
        document_id: doc.id,
        file_name: fileName,
        stored_name: storedName,
        mime_type: mime,
        size_bytes: stat.size,
        version,
        note: note || null,
        uploaded_by: actorName(),
      });
      created.push(row);
    }
    audit('documents.attach', 'document', doc.id, `${doc.doc_no}: +${created.length} файл(ов)`);
    return created;
  });

  ipcMain.handle('documents:openAttachment', async (_e, attachmentId: number) => {
    requirePerm('documents');
    const row = getDocumentAttachment(Number(attachmentId));
    if (!row) throw new Error('Вложение не найдено');
    const abs = attachmentAbsPath(row.stored_name);
    if (!fs.existsSync(abs)) throw new Error('Файл вложения отсутствует на диске');
    const err = await shell.openPath(abs);
    if (err) throw new Error(err);
    return { id: row.id, path: abs };
  });

  ipcMain.handle('documents:saveAttachmentAs', async (_e, attachmentId: number) => {
    requirePerm('documents');
    const row = getDocumentAttachment(Number(attachmentId));
    if (!row) throw new Error('Вложение не найдено');
    const abs = attachmentAbsPath(row.stored_name);
    if (!fs.existsSync(abs)) throw new Error('Файл вложения отсутствует на диске');
    const result = await dialog.showSaveDialog({
      defaultPath: row.file_name,
      filters: [{ name: 'Файл', extensions: [path.extname(row.file_name).replace(/^\./, '') || '*'] }],
    });
    if (result.canceled || !result.filePath) return null;
    fs.copyFileSync(abs, result.filePath);
    return { path: result.filePath };
  });

  ipcMain.handle('documents:deleteAttachment', (_e, attachmentId: number) => {
    requirePerm('documents');
    const row = deleteDocumentAttachment(Number(attachmentId));
    if (!row) throw new Error('Вложение не найдено');
    audit('documents.detach', 'document', row.document_id, row.file_name);
    return { id: attachmentId };
  });

  ipcMain.handle('documents:listParents', (_e) => {
    registry.requireSession();
    return getDb().prepare(`SELECT id, doc_type, doc_no, status, party, note, doc_date
      FROM documents WHERE status IN ('draft','posted') ORDER BY id DESC LIMIT 200`).all();
  });

  ipcMain.handle('documents:listSeries', () => {
    requirePerm('settings');
    return listDocumentSeries().map((row: any) => ({
      ...row,
      preview: previewNextDocumentNo(row.doc_type),
    }));
  });

  ipcMain.handle('documents:saveSeries', (_e, rows: any[]) => {
    requirePerm('settings');
    const saved = saveDocumentSeries(rows || []);
    audit('documents.series', 'settings', null, `Серий: ${saved.length}`);
    return saved.map((row: any) => ({ ...row, preview: previewNextDocumentNo(row.doc_type) }));
  });

  ipcMain.handle('documents:resetSeries', (_e, docType: string) => {
    requirePerm('settings');
    const preview = resetDocumentSeriesCounter(String(docType || ''));
    audit('documents.seriesReset', 'settings', docType, preview);
    return { doc_type: docType, preview };
  });

  ipcMain.handle('locations:clear', (_e, locationId: number) => {
    requirePerm('locations_edit');
    const db = getDb();
    const reserved = (db.prepare(`SELECT COALESCE(SUM(pr.quantity), 0) AS quantity FROM project_reservations pr JOIN projects p ON p.id = pr.project_id WHERE pr.location_id = ? AND p.status IN ('reserved','picking','picked','assembly')`).get(locationId) as any).quantity;
    if (reserved > 0) throw new Error(`В ячейке есть резерв проектов (${reserved} шт.). Сначала снимите резерв.`);
    const clear = db.transaction(() => {
      const rows = db.prepare('SELECT item_id, lot_id, quantity FROM inventory WHERE location_id = ? AND quantity > 0').all(locationId) as any[];
      for (const row of rows) {
        insertLedger({
          item_id: row.item_id,
          location_id: locationId,
          type: 'out',
          quantity: row.quantity,
          comment: 'Очистка ячейки',
          reason: 'MANUAL',
          source: 'MANUAL',
          from_location_id: locationId,
          lot_id: normalizeLotId(row.lot_id) || null,
        });
      }
      db.prepare('DELETE FROM inventory WHERE location_id = ?').run(locationId);
      return rows.length;
    });
    return { items: clear() };
  });

  ipcMain.handle('transactions:list', (_e, limit = 100) => {
    return getDb().prepare(`SELECT t.*, i.name AS item_name, i.barcode AS item_barcode, i.print_name AS item_print_name, i.unit_id, u.symbol AS unit_symbol,
      l.name AS location_name, fl.name AS from_location_name, tl.name AS to_location_name, p.order_no AS project_order_no, p.name AS project_name
      FROM transactions t
      LEFT JOIN items i ON i.id = t.item_id
      LEFT JOIN units u ON u.id = i.unit_id
      LEFT JOIN locations l ON l.id = t.location_id
      LEFT JOIN locations fl ON fl.id = t.from_location_id
      LEFT JOIN locations tl ON tl.id = t.to_location_id
      LEFT JOIN projects p ON p.id = t.project_id
      ORDER BY t.timestamp DESC, t.id DESC LIMIT ?`).all(Math.min(Number(limit) || 100, 1000));
  });

  ipcMain.handle('items:ledger', (_e, itemId: number, filters: any = {}) => {
    const type = String(filters?.type || '').trim();
    const reason = String(filters?.reason || '').trim();
    const source = String(filters?.source || '').trim();
    const fromDate = String(filters?.from || '').trim();
    const toDate = String(filters?.to || '').trim();
    const rows = getDb().prepare(`SELECT t.*, u.symbol AS unit_symbol, l.name AS location_name, fl.name AS from_location_name, tl.name AS to_location_name,
      p.order_no AS project_order_no, p.name AS project_name
      FROM transactions t
      LEFT JOIN items i ON i.id = t.item_id
      LEFT JOIN units u ON u.id = i.unit_id
      LEFT JOIN locations l ON l.id = t.location_id
      LEFT JOIN locations fl ON fl.id = t.from_location_id
      LEFT JOIN locations tl ON tl.id = t.to_location_id
      LEFT JOIN projects p ON p.id = t.project_id
      WHERE t.item_id = ?
        AND t.reversed_at IS NULL
        AND (? = '' OR t.type = ?)
        AND (? = '' OR t.reason = ?)
        AND (? = '' OR t.source = ?)
        AND (? = '' OR date(t.timestamp) >= date(?))
        AND (? = '' OR date(t.timestamp) <= date(?))
      ORDER BY t.timestamp ASC, t.id ASC`).all(itemId, type, type, reason, reason, source, source, fromDate, fromDate, toDate, toDate) as any[];

    let running = 0;
    const timeline = rows.map((row) => {
      const qty = Number(row.quantity) || 0;
      const delta = row.type === 'in' ? qty : row.type === 'out' ? -qty : 0;
      running += delta;
      return { ...row, signed_delta: delta, balance_after: running };
    });

    const summary = timeline.reduce((acc: any, row) => {
      const key = row.type === 'in' ? 'in' : row.type === 'out' ? 'out' : row.type === 'move' ? 'move' : 'adjustment';
      acc[key] = (acc[key] || 0) + Number(row.quantity || 0);
      return acc;
    }, { in: 0, out: 0, move: 0, adjustment: 0 });

    const onHand = (getDb().prepare('SELECT COALESCE(SUM(quantity), 0) AS quantity FROM inventory WHERE item_id = ?').get(itemId) as any).quantity;
    return { summary, current: onHand, timeline: timeline.slice().reverse() };
  });

  ipcMain.handle('transactions:undoLast', () => {
    const db = getDb();
    const transaction = db.prepare("SELECT * FROM transactions WHERE reversed_at IS NULL AND type IN ('in', 'out') ORDER BY id DESC LIMIT 1").get() as any;
    if (!transaction) throw new Error('Нет операции для отката');
    const delta = transaction.type === 'in' ? -transaction.quantity : transaction.quantity;
    const lotId = normalizeLotId(transaction.lot_id);
    const currentLot = getStockAtLocation(transaction.item_id, transaction.location_id, lotId);
    const quantity = currentLot + delta;
    if (quantity < 0) throw new Error('Откат создаст отрицательный остаток');
    const undo = db.transaction(() => {
      addStockAtLocation(transaction.item_id, transaction.location_id, delta, lotId);
      db.prepare("UPDATE transactions SET reversed_at = CURRENT_TIMESTAMP WHERE id = ?").run(transaction.id);
      insertLedger({
        item_id: transaction.item_id,
        location_id: transaction.location_id,
        type: delta > 0 ? 'in' : 'out',
        quantity: Math.abs(delta),
        comment: `Откат операции ${transaction.id}`,
        reason: 'MANUAL',
        source: 'SYSTEM',
        document_ref: `TX-${transaction.id}`,
        lot_id: lotId || null,
      });
    });
    undo();
    return { transactionId: transaction.id };
  });

  ipcMain.handle('search:add', (_e, query: string) => {
    const value = query.trim();
    if (!value) return;
    const db = getDb();
    db.prepare('INSERT INTO search_history (query) VALUES (?)').run(value);
    db.prepare('DELETE FROM search_history WHERE id NOT IN (SELECT id FROM search_history ORDER BY id DESC LIMIT 10)').run();
  });
  ipcMain.handle('search:list', () => getDb().prepare('SELECT query FROM search_history ORDER BY id DESC LIMIT 10').all());
  ipcMain.handle('search:clear', () => {
    registry.requireSession();
    getDb().prepare('DELETE FROM search_history').run();
    return true;
  });
  const ORG_ONLY_SETTINGS = new Set([
    'workspace.recent', 'workspace.favorites', 'workspace.tabs', 'workspace.activeTab',
  ]);
  ipcMain.handle('settings:get', (_e, key: string, fallback = '') => {
    try {
      if (registry.getSession()) {
        return (getDb().prepare('SELECT value FROM schema_meta WHERE key = ?').get(`setting:${key}`) as any)?.value ?? fallback;
      }
    } catch { /* ignore */ }
    if (ORG_ONLY_SETTINGS.has(key)) return fallback;
    return (registry.getRegistryDb().prepare('SELECT value FROM registry_meta WHERE key = ?').get(`setting:${key}`) as any)?.value ?? fallback;
  });
  ipcMain.handle('settings:set', (_e, key: string, value: string) => {
    const k = String(key || '');
    if (!k.startsWith('workspace.') && k !== 'theme' && k !== 'locale' && k !== 'ui.pageSize') {
      requirePerm('settings');
    }
    try {
      if (registry.getSession()) {
        getDb().prepare("INSERT INTO schema_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(`setting:${key}`, value);
        if (ORG_ONLY_SETTINGS.has(key)) return value;
      }
    } catch { /* ignore */ }
    if (!ORG_ONLY_SETTINGS.has(key)) {
      registry.getRegistryDb().prepare("INSERT INTO registry_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(`setting:${key}`, value);
    }
    return value;
  });

  ipcMain.handle('inventory:start', (_e, locationId: number) => {
    requirePerm('inventory');
    requirePerm('post_revision');
    registry.requireLocationAccess(Number(locationId));
    const db = getDb();
    const result = db.prepare('INSERT INTO inventory_sessions (location_id) VALUES (?)').run(locationId);
    const sessionId = Number(result.lastInsertRowid);
    db.prepare(`INSERT INTO inventory_counts (session_id, item_id, counted_quantity)
      SELECT ?, item_id, 0 FROM inventory WHERE location_id = ? AND quantity > 0 GROUP BY item_id`).run(sessionId, locationId);
    try {
      const loc = db.prepare('SELECT name FROM locations WHERE id = ?').get(Number(locationId)) as any;
      const docNo = nextDocumentNo('revision', 'REV');
      upsertDocument({
        doc_type: 'revision',
        doc_no: docNo,
        status: 'draft',
        doc_date: new Date().toISOString().slice(0, 10),
        party: loc?.name || null,
        author: actorName(),
        note: 'Ревизия открыта',
        ref_table: 'inventory_sessions',
        ref_id: sessionId,
      });
    } catch { /* ignore */ }
    return { id: sessionId };
  });
  ipcMain.handle('inventory:count', (_e, sessionId: number, itemId: number, quantity = 1) => {
    getDb().prepare(`INSERT INTO inventory_counts (session_id, item_id, counted_quantity) VALUES (?, ?, ?) ON CONFLICT(session_id, item_id) DO UPDATE SET counted_quantity = counted_quantity + excluded.counted_quantity`).run(sessionId, itemId, quantity);
  });
  ipcMain.handle('inventory:compare', (_e, sessionId: number) => getDb().prepare(`SELECT c.item_id, i.name, i.barcode, u.symbol AS unit_symbol, COALESCE(inv.quantity, 0) AS base_quantity, c.counted_quantity, c.counted_quantity - COALESCE(inv.quantity, 0) AS difference FROM inventory_counts c JOIN items i ON i.id = c.item_id LEFT JOIN units u ON u.id = i.unit_id LEFT JOIN inventory inv ON inv.item_id = c.item_id AND inv.location_id = (SELECT location_id FROM inventory_sessions WHERE id = c.session_id) WHERE c.session_id = ? ORDER BY i.name`).all(sessionId));
  ipcMain.handle('inventory:accept', (_e, sessionId: number) => {
    requirePerm('inventory');
    requirePerm('post_revision');
    const db = getDb();
    const session = db.prepare('SELECT location_id FROM inventory_sessions WHERE id = ? AND status = ?').get(sessionId, 'open') as any;
    if (!session) throw new Error('Акт ревизии не найден или уже закрыт');
    registry.requireLocationAccess(Number(session.location_id));
    const rows = db.prepare(`SELECT c.item_id, c.counted_quantity,
      COALESCE((SELECT SUM(inv.quantity) FROM inventory inv WHERE inv.item_id = c.item_id AND inv.location_id = ?), 0) AS base_quantity
      FROM inventory_counts c WHERE c.session_id = ?`).all(session.location_id, sessionId) as any[];
    const existingDoc = db.prepare(`SELECT doc_no FROM documents WHERE doc_type = 'revision' AND ref_table = 'inventory_sessions' AND ref_id = ?`)
      .get(Number(sessionId)) as any;
    const docNo = existingDoc?.doc_no || nextDocumentNo('revision', 'REV');
    const countedIds = rows.map((r) => Number(r.item_id));
    const otherQty = countedIds.length
      ? Number((db.prepare(`SELECT COALESCE(SUM(quantity), 0) AS qty FROM inventory
          WHERE location_id = ? AND item_id NOT IN (${countedIds.map(() => '?').join(',')})`)
        .get(session.location_id, ...countedIds) as any).qty || 0)
      : Number((db.prepare('SELECT COALESCE(SUM(quantity), 0) AS qty FROM inventory WHERE location_id = ?')
        .get(session.location_id) as any).qty || 0);
    const nextTotal = otherQty + rows.reduce((sum, r) => sum + Number(r.counted_quantity || 0), 0);
    const currentTotal = Number((db.prepare('SELECT COALESCE(SUM(quantity), 0) AS qty FROM inventory WHERE location_id = ?')
      .get(session.location_id) as any).qty || 0);
    if (nextTotal > currentTotal) assertLocationCapacity(db, session.location_id, nextTotal - currentTotal);
    const accept = db.transaction(() => {
      for (const row of rows) {
        const reserved = (db.prepare(`SELECT COALESCE(SUM(pr.quantity), 0) AS quantity FROM project_reservations pr JOIN projects p ON p.id = pr.project_id WHERE pr.item_id = ? AND pr.location_id = ? AND p.status IN ('reserved','picking','picked','assembly')`).get(row.item_id, session.location_id) as any).quantity;
        if (row.counted_quantity < reserved) throw new Error(`Нельзя принять ревизию: товар #${row.item_id} зарезервирован (${reserved} шт.)`);
        const delta = row.counted_quantity - row.base_quantity;
        // Ревизия сводит остаток ячейки к факту на lot_id=0 (партии пересобираются в «без партии»)
        db.prepare('DELETE FROM inventory WHERE item_id = ? AND location_id = ?').run(row.item_id, session.location_id);
        setStockAtLocation(row.item_id, session.location_id, row.counted_quantity, 0);
        if (delta !== 0) {
          insertLedger({
            item_id: row.item_id,
            location_id: session.location_id,
            type: delta > 0 ? 'in' : 'out',
            quantity: Math.abs(delta),
            comment: 'Корректировка ревизии',
            reason: 'INVENTORY',
            source: 'REVISION',
            document_ref: docNo,
          });
        }
      }
      db.prepare("UPDATE inventory_sessions SET status = 'completed', completed_at = CURRENT_TIMESTAMP WHERE id = ?").run(sessionId);
      const loc = db.prepare('SELECT name FROM locations WHERE id = ?').get(session.location_id) as any;
      upsertDocument({
        doc_type: 'revision',
        doc_no: docNo,
        status: 'posted',
        doc_date: new Date().toISOString().slice(0, 10),
        party: loc?.name || null,
        author: actorName(),
        posted_by: actorName(),
        note: `Ревизия, строк: ${rows.length}`,
        ref_table: 'inventory_sessions',
        ref_id: Number(sessionId),
      });
    });
    accept();
    audit('inventory.accept', 'revision', sessionId, `Принята ревизия ${docNo}, строк: ${rows.length}`);
    return { rows: rows.length, doc_no: docNo };
  });

  ipcMain.handle('inventory:assignStocktake', (_e, locationId: number, counts: Array<{ item_id: number; quantity: number }>) => {
    requirePerm('inventory');
    const db = getDb();
    const location = db.prepare('SELECT id, name FROM locations WHERE id = ?').get(locationId) as any;
    if (!location) throw new Error('Ячейка не найдена');
    const rows = Array.isArray(counts) ? counts : [];
    if (!rows.length) throw new Error('Нет отсканированных позиций');
    const countedIds = rows.map((r) => Number(r.item_id)).filter(Boolean);
    const otherQty = countedIds.length
      ? Number((db.prepare(`SELECT COALESCE(SUM(quantity), 0) AS qty FROM inventory
          WHERE location_id = ? AND item_id NOT IN (${countedIds.map(() => '?').join(',')})`)
        .get(locationId, ...countedIds) as any).qty || 0)
      : 0;
    const nextTotal = otherQty + rows.reduce((sum, r) => sum + Math.max(0, Number(r.quantity) || 0), 0);
    const currentTotal = Number((db.prepare('SELECT COALESCE(SUM(quantity), 0) AS qty FROM inventory WHERE location_id = ?')
      .get(locationId) as any).qty || 0);
    if (nextTotal > currentTotal) assertLocationCapacity(db, locationId, nextTotal - currentTotal);
    const apply = db.transaction(() => {
      for (const row of rows) {
        const itemId = Number(row.item_id);
        const quantity = Math.max(0, Number(row.quantity) || 0);
        const previous = getStockAtLocation(itemId, locationId);
        const reserved = (db.prepare(`SELECT COALESCE(SUM(pr.quantity), 0) AS quantity FROM project_reservations pr JOIN projects p ON p.id = pr.project_id WHERE pr.item_id = ? AND pr.location_id = ? AND p.status IN ('reserved','picking','picked','assembly')`).get(itemId, locationId) as any).quantity;
        if (quantity < reserved) throw new Error(`Нельзя назначить ниже резерва для товара #${itemId} (${reserved} шт.)`);
        const delta = quantity - previous;
        db.prepare('DELETE FROM inventory WHERE item_id = ? AND location_id = ?').run(itemId, locationId);
        setStockAtLocation(itemId, locationId, quantity, 0);
        if (delta !== 0) {
          insertLedger({
            item_id: itemId,
            location_id: locationId,
            type: delta > 0 ? 'in' : 'out',
            quantity: Math.abs(delta),
            comment: `Быстрая инвентаризация · ${location.name}`,
            reason: 'INITIAL_INVENTORY',
            source: 'SCANNER',
            document_ref: `ST-${locationId}`,
          });
        }
      }
      return rows.length;
    });
    return { items: apply() };
  });

  ipcMain.handle('projects:list', () => {
    requirePerm('projects');
    return getDb().prepare(`SELECT p.*, COUNT(pi.item_id) AS component_count FROM projects p LEFT JOIN project_items pi ON pi.project_id = p.id GROUP BY p.id ORDER BY p.created_at DESC`).all();
  });
  ipcMain.handle('projects:details', (_e, projectId: number) => {
    requirePerm('projects');
    const project = getDb().prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as any;
    const rows = getDb().prepare(`SELECT pi.item_id, pi.quantity AS per_unit, pi.quantity * p.build_quantity AS required,
      i.name, i.print_name, i.barcode, i.sku, i.category, u.symbol AS unit_symbol,
      COALESCE(SUM(inv.quantity), 0) AS on_hand,
      COALESCE((SELECT SUM(pr.quantity) FROM project_reservations pr JOIN projects rp ON rp.id = pr.project_id WHERE pr.item_id = pi.item_id AND rp.status IN ('reserved','picking','picked','assembly') AND rp.id != p.id), 0) AS reserved_others,
      COALESCE((SELECT SUM(pr.quantity) FROM project_reservations pr WHERE pr.project_id = p.id AND pr.item_id = pi.item_id), 0) AS reserved_here,
      COALESCE((SELECT SUM(ic.quantity) FROM item_conditions ic WHERE ic.item_id = pi.item_id), 0) AS condition_sum,
      COALESCE((SELECT SUM(ic.quantity) FROM item_conditions ic WHERE ic.item_id = pi.item_id AND ic.condition = 'ok'), 0) AS condition_ok,
      COALESCE((SELECT SUM(ic.quantity) FROM item_conditions ic WHERE ic.item_id = pi.item_id AND ic.condition != 'ok'), 0) AS condition_blocked,
      COALESCE((SELECT SUM(ws.quantity) FROM work_order_scans ws WHERE ws.project_id = pi.project_id AND ws.item_id = pi.item_id), 0) AS scanned
      FROM project_items pi JOIN projects p ON p.id = pi.project_id JOIN items i ON i.id = pi.item_id
      LEFT JOIN units u ON u.id = i.unit_id LEFT JOIN inventory inv ON inv.item_id = i.id
      WHERE pi.project_id = ? GROUP BY pi.item_id, p.build_quantity`).all(projectId) as any[];
    const holding = (ACTIVE_RESERVE_STATUSES as readonly string[]).includes(project?.status);
    return rows.map((row) => {
      const onHand = Number(row.on_hand) || 0;
      const reservedOthers = Number(row.reserved_others) || 0;
      const hasConditions = Number(row.condition_sum) > 0;
      const serviceable = hasConditions
        ? Math.max(0, onHand - Number(row.condition_blocked || 0))
        : onHand;
      const freeAvailable = Math.max(0, Math.min(onHand - reservedOthers, serviceable - reservedOthers));
      let component_status = 'В наличии';
      if (holding && Number(row.reserved_here) > 0) component_status = 'Зарезервировано';
      else if (freeAvailable <= 0) component_status = 'Отсутствует';
      else if (freeAvailable < Number(row.required)) component_status = 'Недостаточно';
      return { ...row, available: freeAvailable, component_status };
    });
  });
  ipcMain.handle('projects:pickList', (_e, projectId: number) => {
    requirePerm('projects');
    return getDb().prepare(`SELECT pr.item_id, pr.quantity, i.name, i.print_name, i.sku, i.barcode, u.symbol AS unit_symbol, l.name AS location_name, l.barcode AS location_barcode, l.id AS location_id FROM project_reservations pr JOIN items i ON i.id = pr.item_id LEFT JOIN units u ON u.id = i.unit_id JOIN locations l ON l.id = pr.location_id WHERE pr.project_id = ? ORDER BY l.name, i.name`).all(projectId);
  });
  function syncProjectDocument(projectId: number, status: 'draft' | 'posted' | 'cancelled', note?: string | null) {
    const project = getDb().prepare('SELECT * FROM projects WHERE id = ?').get(Number(projectId)) as any;
    if (!project) return;
    try {
      upsertDocument({
        doc_type: 'project',
        doc_no: project.order_no || `WO-${projectId}`,
        status,
        doc_date: project.due_date || new Date().toISOString().slice(0, 10),
        party: project.target_name || project.name || null,
        author: actorName(),
        posted_by: status === 'posted' ? actorName() : null,
        note: note ?? project.description ?? null,
        ref_table: 'projects',
        ref_id: Number(projectId),
      });
    } catch { /* registry optional */ }
  }

  ipcMain.handle('projects:copy', (_e, projectId: number) => {
    requirePerm('projects');
    const db = getDb();
    const source = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as any;
    if (!source) throw new Error('Заказ не найден');
    const orderNo = nextDocumentNo('project', 'WO');
    const result = db.prepare(`INSERT INTO projects (name, description, order_no, target_name, build_quantity, priority, due_date, status, result_item_id, result_location_id) VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)`)
      .run(`${source.name} (копия)`, source.description, orderNo, source.target_name, source.build_quantity, source.priority, source.due_date, source.result_item_id || null, source.result_location_id || null);
    const id = Number(result.lastInsertRowid);
    const items = db.prepare('SELECT item_id, quantity FROM project_items WHERE project_id = ?').all(projectId) as any[];
    const insert = db.prepare('INSERT INTO project_items (project_id, item_id, quantity) VALUES (?, ?, ?)');
    for (const row of items) insert.run(id, row.item_id, row.quantity);
    syncProjectDocument(id, 'draft', 'Копия заказ-наряда');
    return { id };
  });
  ipcMain.handle('projects:setStatus', (_e, projectId: number, status: string) => {
    requirePerm('projects');
    const db = getDb();
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as any;
    if (!project) throw new Error('Заказ не найден');
    if (status === 'finished' || status === 'completed') {
      if (project.status !== 'consumed') throw new Error('Завершить можно только после списания комплекта');
      db.prepare("UPDATE projects SET status = 'finished' WHERE id = ?").run(projectId);
      syncProjectDocument(projectId, 'posted', project.description || 'Заказ-наряд завершён');
      return { projectId, status: 'finished' };
    }
    const flow: Record<string, string[]> = {
      reserved: ['picking', 'picked'],
      picking: ['picked', 'reserved'],
      picked: ['assembly', 'picking'],
      assembly: ['picked'],
    };
    if (!(flow[project.status] || []).includes(status)) throw new Error(`Нельзя перейти из «${project.status}» в «${status}»`);
    db.prepare('UPDATE projects SET status = ? WHERE id = ?').run(status, projectId);
    // Операционные статусы до списания — документ в реестре остаётся draft (если уже создан)
    const reg = getDb().prepare(`SELECT status FROM documents WHERE doc_type = 'project' AND ref_id = ?`).get(Number(projectId)) as any;
    if (reg?.status === 'draft' || !reg) syncProjectDocument(projectId, 'draft');
    return { projectId, status };
  });
  ipcMain.handle('projects:create', (_e, data: any) => {
    requirePerm('projects');
    const db = getDb();
    const orderNo = data.order_no || nextDocumentNo('project', 'WO');
    const resultItemId = data.result_item_id ? Number(data.result_item_id) : null;
    const resultLocationId = data.result_location_id ? Number(data.result_location_id) : null;
    if (resultItemId) assertStockableItem(db, resultItemId);
    const result = db.prepare(`INSERT INTO projects (name, description, order_no, target_name, build_quantity, priority, due_date, result_item_id, result_location_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(data.name.trim(), data.description || null, orderNo, data.target_name || data.name.trim(), Math.max(1, Number(data.build_quantity) || 1), data.priority || 'normal', data.due_date || null, resultItemId, resultLocationId);
    const id = Number(result.lastInsertRowid);
    syncProjectDocument(id, 'draft');
    return { id };
  });
  ipcMain.handle('projects:update', (_e, projectId: number, data: any) => {
    requirePerm('projects');
    const db = getDb();
    const project = db.prepare('SELECT status FROM projects WHERE id = ?').get(projectId) as any;
    if (!project || project.status !== 'draft') throw new Error('Настройки можно менять только у черновика');
    const resultItemId = data.result_item_id ? Number(data.result_item_id) : null;
    const resultLocationId = data.result_location_id ? Number(data.result_location_id) : null;
    if (resultItemId) assertStockableItem(db, resultItemId);
    const result = db.prepare(`UPDATE projects SET name = ?, description = ?, target_name = ?, build_quantity = ?, priority = ?, due_date = ?, result_item_id = ?, result_location_id = ? WHERE id = ?`).run(data.name.trim(), data.description || null, data.target_name || data.name.trim(), Math.max(1, Number(data.build_quantity) || 1), data.priority || 'normal', data.due_date || null, resultItemId, resultLocationId, projectId);
    syncProjectDocument(projectId, 'draft');
    return result;
  });
  ipcMain.handle('projects:delete', (_e, projectId: number) => {
    requirePerm('projects');
    const db = getDb();
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as any;
    if (!project) throw new Error('Заказ не найден');
    if (['consumed', 'finished', 'completed'].includes(project.status)) {
      throw new Error('Проведённый заказ-наряд нельзя удалить — оставьте в журнале документов');
    }
    const remove = db.transaction(() => {
      db.prepare('DELETE FROM project_reservations WHERE project_id = ?').run(projectId);
      db.prepare('DELETE FROM work_order_scans WHERE project_id = ?').run(projectId);
      db.prepare('DELETE FROM project_items WHERE project_id = ?').run(projectId);
      const changes = db.prepare('DELETE FROM projects WHERE id = ?').run(projectId).changes;
      try {
        // Черновик убираем из реестра; если вдруг был posted — помечаем cancelled
        const doc = db.prepare(`SELECT id, status, doc_no FROM documents WHERE doc_type = 'project' AND ref_id = ?`).get(Number(projectId)) as any;
        if (doc?.status === 'draft') db.prepare('DELETE FROM documents WHERE id = ?').run(doc.id);
        else if (doc) {
          upsertDocument({
            doc_type: 'project',
            doc_no: doc.doc_no,
            status: 'cancelled',
            author: actorName(),
            note: 'Удалён заказ-наряд',
            ref_table: 'projects',
            ref_id: Number(projectId),
          });
        }
      } catch { /* ignore */ }
      return changes;
    });
    return { changes: remove() };
  });
  ipcMain.handle('projects:reserve', (_e, projectId: number) => {
    requirePerm('projects');
    const db = getDb();
    purgeStaleReservations();
    const reserve = db.transaction(() => {
      const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as any;
      if (!project) throw new Error('Заказ-наряд не найден');
      const holding = (ACTIVE_RESERVE_STATUSES as readonly string[]).includes(project.status);
      const existingQty = Number((db.prepare('SELECT COALESCE(SUM(quantity), 0) AS q FROM project_reservations WHERE project_id = ?').get(projectId) as any)?.q || 0);
      if (holding && existingQty > 0) {
        return { projectId, already: true };
      }
      if (!holding && project.status !== 'draft') {
        throw new Error('Зарезервировать можно только черновик');
      }
      // Черновик или «битый» активный статус без строк — пересобираем резерв
      db.prepare('DELETE FROM project_reservations WHERE project_id = ?').run(projectId);
      const rows = db.prepare(`SELECT pi.item_id, pi.quantity * p.build_quantity AS required, i.name AS item_name
        FROM project_items pi JOIN projects p ON p.id = pi.project_id JOIN items i ON i.id = pi.item_id
        WHERE p.id = ?`).all(projectId) as any[];
      if (!rows.length) throw new Error('Добавьте компоненты перед резервированием');
      const allocate = db.prepare(`
        SELECT inv.location_id,
          inv.quantity - COALESCE((
            SELECT SUM(pr.quantity) FROM project_reservations pr
            JOIN projects rp ON rp.id = pr.project_id
            WHERE pr.item_id = inv.item_id AND pr.location_id = inv.location_id
              AND rp.status IN ('reserved','picking','picked','assembly')
          ), 0) AS available
        FROM inventory inv
        WHERE inv.item_id = ? AND inv.quantity > 0
        ORDER BY (inv.quantity - COALESCE((
          SELECT SUM(pr.quantity) FROM project_reservations pr
          JOIN projects rp ON rp.id = pr.project_id
          WHERE pr.item_id = inv.item_id AND pr.location_id = inv.location_id
            AND rp.status IN ('reserved','picking','picked','assembly')
        ), 0)) DESC
      `);
      const insert = db.prepare('INSERT INTO project_reservations (project_id, item_id, location_id, quantity) VALUES (?, ?, ?, ?)');
      const docRef = project.order_no || `WO-${projectId}`;
      for (const row of rows) {
        const required = Number(row.required) || 0;
        const condSum = Number((db.prepare(`SELECT COALESCE(SUM(quantity), 0) AS q FROM item_conditions WHERE item_id = ?`).get(row.item_id) as any)?.q || 0);
        const blocked = Number((db.prepare(`SELECT COALESCE(SUM(quantity), 0) AS q FROM item_conditions WHERE item_id = ? AND condition != 'ok'`).get(row.item_id) as any)?.q || 0);
        const onHand = Number((db.prepare('SELECT COALESCE(SUM(quantity), 0) AS q FROM inventory WHERE item_id = ?').get(row.item_id) as any).q);
        const reservedOthers = getReservedQty(row.item_id);
        const serviceable = condSum > 0 ? Math.max(0, onHand - blocked) : onHand;
        const free = Math.max(0, Math.min(onHand - reservedOthers, serviceable - reservedOthers));
        if (free < required) {
          throw new Error(`Недостаточно свободного остатка для «${row.item_name}»: нужно ${required}, доступно ${free}`);
        }
        let remaining = required;
        for (const location of allocate.all(row.item_id) as any[]) {
          const quantity = Math.min(remaining, Math.max(0, Number(location.available) || 0));
          if (quantity > 0) insert.run(projectId, row.item_id, location.location_id, quantity);
          remaining -= quantity;
          if (remaining <= 0) break;
        }
        if (remaining > 0) {
          throw new Error(`Не удалось распределить резерв для «${row.item_name}»: не хватает ${remaining} в ячейках`);
        }
      }
      db.prepare("UPDATE projects SET status = 'reserved', reserved_at = CURRENT_TIMESTAMP WHERE id = ?").run(projectId);
      for (const row of rows) {
        insertLedger({
          item_id: row.item_id,
          type: 'reserve',
          quantity: Number(row.required) || 0,
          comment: `Резерв ${docRef}`,
          reason: 'PROJECT',
          source: 'PROJECT',
          project_id: projectId,
          document_ref: docRef,
          user_name: actorName(),
        });
      }
      syncProjectDocument(projectId, 'draft', project.description || 'Резерв компонентов');
      return { projectId, already: false };
    });
    return reserve();
  });
  ipcMain.handle('projects:release', (_e, projectId: number) => {
    requirePerm('projects');
    const db = getDb();
    const release = db.transaction(() => {
      const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as any;
      if (!project || !(ACTIVE_RESERVE_STATUSES as readonly string[]).includes(project.status)) {
        throw new Error('Снять резерв можно только у активного заказа');
      }
      const docRef = project.order_no || `WO-${projectId}`;
      const allocations = db.prepare('SELECT item_id, quantity FROM project_reservations WHERE project_id = ?').all(projectId) as any[];
      db.prepare("UPDATE projects SET status = 'draft', reserved_at = NULL WHERE id = ?").run(projectId);
      db.prepare('DELETE FROM project_reservations WHERE project_id = ?').run(projectId);
      db.prepare('DELETE FROM work_order_scans WHERE project_id = ?').run(projectId);
      for (const row of allocations) {
        insertLedger({
          item_id: row.item_id,
          type: 'release',
          quantity: row.quantity,
          comment: `Снятие резерва ${docRef}`,
          reason: 'PROJECT',
          source: 'PROJECT',
          project_id: projectId,
          document_ref: docRef,
          user_name: actorName(),
        });
      }
      syncProjectDocument(projectId, 'draft', 'Резерв снят');
    });
    release();
    return { projectId };
  });
  ipcMain.handle('projects:addItem', (_e, projectId: number, itemId: number, quantity: number) => {
    requirePerm('projects');
    const db = getDb();
    const project = db.prepare('SELECT status, build_quantity FROM projects WHERE id = ?').get(projectId) as any;
    if (!project || project.status !== 'draft') throw new Error('Спецификацию можно менять только в черновике');
    assertStockableItem(db, itemId);
    const qty = Math.max(1, Number(quantity) || 1);
    const existing = (db.prepare('SELECT quantity FROM project_items WHERE project_id = ? AND item_id = ?').get(projectId, itemId) as any)?.quantity || 0;
    const required = (existing + qty) * Math.max(1, Number(project.build_quantity) || 1);
    const onHand = Number((db.prepare('SELECT COALESCE(SUM(quantity), 0) AS quantity FROM inventory WHERE item_id = ?').get(itemId) as any).quantity);
    const reserved = getReservedQty(itemId);
    const condSum = Number((db.prepare(`SELECT COALESCE(SUM(quantity), 0) AS q FROM item_conditions WHERE item_id = ?`).get(itemId) as any)?.q || 0);
    const blocked = Number((db.prepare(`SELECT COALESCE(SUM(quantity), 0) AS q FROM item_conditions WHERE item_id = ? AND condition != 'ok'`).get(itemId) as any)?.q || 0);
    const serviceable = condSum > 0 ? Math.max(0, onHand - blocked) : onHand;
    const available = Math.max(0, Math.min(onHand - reserved, serviceable - reserved));
    if (required > available) {
      throw new Error(`Недостаточно доступного исправного остатка: нужно ${required}, доступно ${available}`);
    }
    db.prepare(`INSERT INTO project_items (project_id, item_id, quantity) VALUES (?, ?, ?)
      ON CONFLICT(project_id, item_id) DO UPDATE SET quantity = project_items.quantity + excluded.quantity`).run(projectId, itemId, qty);
  });
  ipcMain.handle('projects:removeItem', (_e, projectId: number, itemId: number) => {
    requirePerm('projects');
    const project = getDb().prepare('SELECT status FROM projects WHERE id = ?').get(projectId) as any;
    if (!project || project.status !== 'draft') throw new Error('Спецификацию можно менять только в черновике');
    return getDb().prepare('DELETE FROM project_items WHERE project_id = ? AND item_id = ?').run(projectId, itemId);
  });
  ipcMain.handle('projects:consume', (_e, projectId: number) => {
    requirePerm('projects');
    const db = getDb();
    const consume = db.transaction(() => {
      const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as any;
      if (!project || !(ACTIVE_RESERVE_STATUSES as readonly string[]).includes(project.status)) {
        throw new Error('Сначала зарезервируйте компоненты');
      }
      const docRef = project.order_no || `WO-${projectId}`;
      const required = db.prepare('SELECT pi.item_id, pi.quantity * p.build_quantity AS quantity, i.name AS item_name FROM project_items pi JOIN projects p ON p.id = pi.project_id JOIN items i ON i.id = pi.item_id WHERE pi.project_id = ?').all(projectId) as any[];
      if (!required.length) throw new Error('В спецификации нет компонентов');
      let fullyScanned = true;
      for (const row of required) {
        const scanned = Number((db.prepare('SELECT COALESCE(SUM(quantity), 0) AS quantity FROM work_order_scans WHERE project_id = ? AND item_id = ?').get(projectId, row.item_id) as any).quantity);
        if (scanned < Number(row.quantity)) {
          fullyScanned = false;
          break;
        }
      }
      // Списание без ТСД — если заказ уже отмечен скомплектованным / на сборке
      const statusAllows = project.status === 'picked' || project.status === 'assembly';
      if (!fullyScanned && !statusAllows) {
        throw new Error('Отсканируйте полную комплектацию в ТСД или отметьте статус «Скомплектован»');
      }
      const allocations = db.prepare('SELECT item_id, location_id, quantity FROM project_reservations WHERE project_id = ?').all(projectId) as any[];
      if (!allocations.length) throw new Error('Резерв проекта не найден. Снимите и повторите резервирование.');
      for (const allocation of allocations) {
        const stockQty = getStockAtLocation(allocation.item_id, allocation.location_id);
        if (stockQty < allocation.quantity) {
          throw new Error('Остаток изменился после резервирования. Снимите резерв и зарезервируйте снова.');
        }
        const slices = allocateLotsForIssue(allocation.item_id, allocation.location_id, allocation.quantity);
        for (const slice of slices) {
          addStockAtLocation(allocation.item_id, allocation.location_id, -slice.quantity, slice.lot_id);
          insertLedger({
            item_id: allocation.item_id,
            location_id: allocation.location_id,
            type: 'out',
            quantity: slice.quantity,
            comment: `Сборка ${docRef}`,
            reason: 'PROJECT',
            source: 'PROJECT',
            project_id: projectId,
            document_ref: docRef,
            from_location_id: allocation.location_id,
            user_name: actorName(),
            lot_id: slice.lot_id || null,
          });
        }
        const ok = db.prepare(`SELECT quantity FROM item_conditions WHERE item_id = ? AND condition = 'ok'`).get(allocation.item_id) as any;
        if (ok) db.prepare(`UPDATE item_conditions SET quantity = CASE WHEN quantity > ? THEN quantity - ? ELSE 0 END WHERE item_id = ? AND condition = 'ok'`).run(allocation.quantity, allocation.quantity, allocation.item_id);
      }
      db.prepare('DELETE FROM project_reservations WHERE project_id = ?').run(projectId);
      // Приход готовой продукции, если в заказе указано изделие-результат
      const resultItemId = Number(project.result_item_id || 0);
      const buildQty = Math.max(1, Number(project.build_quantity) || 1);
      if (resultItemId) {
        assertStockableItem(db, resultItemId);
        let finishLoc = Number(project.result_location_id || 0);
        if (!finishLoc) {
          finishLoc = Number(allocations[0]?.location_id || 0);
        }
        if (!finishLoc) throw new Error('Укажите ячейку прихода готовой продукции');
        registry.requireLocationAccess(finishLoc);
        assertLocationCapacity(db, finishLoc, buildQty);
        addStockAtLocation(resultItemId, finishLoc, buildQty, 0);
        insertLedger({
          item_id: resultItemId,
          location_id: finishLoc,
          type: 'in',
          quantity: buildQty,
          comment: `Приход ГП по ${docRef}`,
          reason: 'PROJECT',
          source: 'PROJECT',
          project_id: projectId,
          document_ref: docRef,
          to_location_id: finishLoc,
          user_name: actorName(),
        });
      }
      db.prepare("UPDATE projects SET status = 'consumed' WHERE id = ?").run(projectId);
      syncProjectDocument(projectId, 'posted', project.description || 'Списание по сборке');
    });
    consume();
    return { projectId };
  });
  ipcMain.handle('projects:scan', (_e, projectId: number, itemId: number) => {
    requirePerm('projects');
    return applyProjectScan(Number(projectId), Number(itemId));
  });
  ipcMain.handle('tsd:outboxStatus', () => {
    requirePerm('projects');
    return getTsdOutboxStatus();
  });
  ipcMain.handle('tsd:outboxEnqueue', (_e, data: any) => {
    requirePerm('projects');
    const row = enqueueTsdOp({
      project_id: Number(data?.project_id),
      item_id: Number(data?.item_id),
      barcode: data?.barcode,
      client_op_id: data?.client_op_id,
      device_id: data?.device_id,
      op_type: data?.op_type,
    });
    audit('tsd.outboxEnqueue', 'tsd_outbox', row?.id, row?.client_op_id);
    return row;
  });
  ipcMain.handle('tsd:outboxFlush', (_e, limit?: number) => {
    requirePerm('projects');
    const result = flushTsdOutbox(limit);
    if (result.processed) {
      audit('tsd.outboxFlush', 'tsd_outbox', null, `applied=${result.applied} rejected=${result.rejected}`);
    }
    return result;
  });
  ipcMain.handle('tsd:scanOrEnqueue', (_e, projectId: number, itemId: number, opts?: any) => {
    requirePerm('projects');
    return scanProjectOrEnqueue(Number(projectId), Number(itemId), opts);
  });
  ipcMain.handle('projects:completeTask', (_e, projectId: number) => {
    requirePerm('projects');
    const db = getDb();
    const result = db.prepare("UPDATE projects SET status = 'finished' WHERE id = ? AND status = 'consumed'").run(projectId);
    if (!result.changes) throw new Error('Заказ должен быть собран перед завершением');
    syncProjectDocument(projectId, 'posted', 'Заказ-наряд завершён');
    return { projectId };
  });
  ipcMain.handle('projects:print', async (_event, projectId: number) => {
    requirePerm('projects');
    const db = getDb();
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as any;
    const rows = db.prepare(`SELECT pi.quantity AS per_unit, pi.quantity * p.build_quantity AS required, i.name, i.print_name, i.barcode, u.symbol AS unit_symbol,
      MAX(0, COALESCE(SUM(inv.quantity), 0) - COALESCE((SELECT SUM(pr.quantity) FROM project_reservations pr JOIN projects rp ON rp.id = pr.project_id WHERE pr.item_id = pi.item_id AND rp.status IN ('reserved','picking','picked','assembly') AND rp.id != p.id), 0)) AS available
      FROM project_items pi JOIN projects p ON p.id = pi.project_id JOIN items i ON i.id = pi.item_id LEFT JOIN units u ON u.id = i.unit_id LEFT JOIN inventory inv ON inv.item_id = i.id WHERE p.id = ? GROUP BY pi.item_id, p.build_quantity`).all(projectId) as any[];
    const esc = (value: any) => String(value ?? '').replace(/[&<>]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[char] || char));
    const generatedAt = new Date().toLocaleString('ru-RU');
    const progress = rows.length ? Math.round(rows.reduce((sum, row) => sum + Math.min(1, row.available / row.required), 0) / rows.length * 100) : 0;
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;color:#202124;padding:36px}h1{font-size:25px;margin:0 0 8px}h2{font-size:16px;margin-top:30px}header{display:flex;justify-content:space-between;border-bottom:2px solid #202124;padding-bottom:18px}.meta{color:#5f6368;line-height:1.7}.status{padding:10px 14px;background:#e8f0fe;color:#174ea6;font-weight:bold}table{width:100%;border-collapse:collapse;margin-top:12px}thead{display:table-header-group}tr{break-inside:avoid}th,td{border:1px solid #c4c7c5;padding:9px;text-align:left}th{background:#f1f3f4}.sign{display:flex;gap:50px;margin-top:70px}.sign div{width:230px;border-top:1px solid #202124;padding-top:8px;color:#5f6368}</style></head><body><header><div><h1>Заказ-наряд на сборку</h1><div class="meta">Номер: <b>${esc(project.order_no)}</b><br>Изделие: ${esc(project.target_name || project.name)}<br>Сформировано: ${esc(generatedAt)}<br>Срок: ${esc(project.due_date || 'Не указан')}</div></div><div class="status">Тираж: ${project.build_quantity} шт.<br>Комплектация: ${progress}%</div></header><h2>Спецификация</h2><table><thead><tr><th>Компонент</th><th>Штрихкод</th><th>На изделие</th><th>Всего</th><th>Доступно</th><th>Статус</th></tr></thead><tbody>${rows.map((row) => { const unit = esc(row.unit_symbol || 'шт.'); return `<tr><td>${esc(row.print_name || row.name)}</td><td>${esc(row.barcode || 'Еще не определен')}</td><td>${row.per_unit} ${unit}</td><td>${row.required} ${unit}</td><td>${row.available} ${unit}</td><td>${row.available >= row.required ? 'Хватает' : 'Не хватает ' + (row.required - row.available) + ' ' + unit}</td></tr>`; }).join('')}</tbody></table><h2>Отметки сборки</h2><p>Комментарий: ____________________________________________________________________________</p><div class="sign"><div>Кладовщик, подпись</div><div>Сборщик, подпись</div><div>Контролер, подпись</div></div></body></html>`;
    const printWindow = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
    await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    const result = await dialog.showSaveDialog({ defaultPath: stampedFileName(project.order_no || 'work-order', 'pdf'), filters: [{ name: 'PDF', extensions: ['pdf'] }] });
    if (result.canceled || !result.filePath) { printWindow.close(); return null; }
    fs.writeFileSync(result.filePath, await printWindow.webContents.printToPDF({ printBackground: true, pageSize: 'A4' }));
    printWindow.close();
    return result.filePath;
  });

  ipcMain.handle('scanner:ports', () => SerialPort.list());

  // --- conditions / purchases / movements (additive) ---
  ipcMain.handle('items:conditions', (_e, itemId: number) => {
    const db = getDb();
    const onHand = Number((db.prepare('SELECT COALESCE(SUM(quantity), 0) AS q FROM inventory WHERE item_id = ?').get(itemId) as any).q || 0);
    const rows = db.prepare('SELECT condition, quantity FROM item_conditions WHERE item_id = ?').all(itemId) as any[];
    const map: Record<string, number> = { ok: 0, check: 0, bad: 0, repair: 0, scrap: 0 };
    for (const row of rows) map[row.condition] = Number(row.quantity) || 0;
    const sum = Object.values(map).reduce((a, b) => a + b, 0);
    if (sum === 0 && onHand > 0) map.ok = onHand;
    else if (sum !== onHand) map.ok = Math.max(0, map.ok + (onHand - sum));
    return { on_hand: onHand, ...map, available_for_project: map.ok };
  });
  ipcMain.handle('items:setConditions', (_e, itemId: number, data: any) => {
    requirePerm('items_edit');
    const db = getDb();
    const onHand = Number((db.prepare('SELECT COALESCE(SUM(quantity), 0) AS q FROM inventory WHERE item_id = ?').get(itemId) as any).q || 0);
    const values = {
      ok: Math.max(0, Number(data.ok) || 0),
      check: Math.max(0, Number(data.check) || 0),
      bad: Math.max(0, Number(data.bad) || 0),
      repair: Math.max(0, Number(data.repair) || 0),
      scrap: Math.max(0, Number(data.scrap) || 0),
    };
    const sum = Object.values(values).reduce((a, b) => a + b, 0);
    if (sum !== onHand) throw new Error(`Сумма состояний (${sum}) должна равняться физическому остатку (${onHand})`);
    const upsert = db.prepare(`INSERT INTO item_conditions (item_id, condition, quantity) VALUES (?, ?, ?) ON CONFLICT(item_id, condition) DO UPDATE SET quantity = excluded.quantity`);
    db.transaction(() => { for (const [condition, quantity] of Object.entries(values)) upsert.run(itemId, condition, quantity); })();
    return values;
  });
  ipcMain.handle('suppliers:list', () => getDb().prepare(`SELECT s.*,
    (SELECT COUNT(*) FROM supplier_items si WHERE si.supplier_id = s.id) AS item_count,
    (SELECT COUNT(*) FROM purchase_orders po WHERE po.supplier_id = s.id AND po.status IN ('draft','ordered','partial')) AS open_po_count
    FROM suppliers s ORDER BY COALESCE(s.is_active, 1) DESC, COALESCE(s.priority, 100), s.name`).all());
  ipcMain.handle('suppliers:get', (_e, id: number) => {
    const supplier = getDb().prepare(`SELECT s.*,
      (SELECT COUNT(*) FROM supplier_items si WHERE si.supplier_id = s.id) AS item_count
      FROM suppliers s WHERE s.id = ?`).get(Number(id));
    if (!supplier) throw new Error('Поставщик не найден');
    return supplier;
  });
  ipcMain.handle('suppliers:create', (_e, data: any) => {
    requirePerm('purchases');
    const name = String(data?.name || '').trim();
    if (!name) throw new Error('Укажите название поставщика');
    try {
      const result = getDb().prepare(`INSERT INTO suppliers (
        name, contact, note, email, phone, inn, address, priority, default_lead_days, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        name,
        String(data.contact || '').trim() || null,
        String(data.note || '').trim() || null,
        String(data.email || '').trim() || null,
        String(data.phone || '').trim() || null,
        String(data.inn || '').trim() || null,
        String(data.address || '').trim() || null,
        Math.max(1, Number(data.priority) || 100),
        data.default_lead_days === '' || data.default_lead_days == null ? null : Math.max(0, Number(data.default_lead_days) || 0),
        data.is_active === undefined || data.is_active === null ? 1 : (Number(data.is_active) ? 1 : 0),
      );
      const newId = Number(result.lastInsertRowid);
      try { ensureCounterpartyForSupplier(newId); } catch (e) { console.warn('[Metrika] counterparty link failed:', e); }
      audit('supplier.create', 'supplier', newId, name);
      return { id: newId };
    } catch (error) {
      throw mapDbError(error);
    }
  });
  ipcMain.handle('suppliers:update', (_e, id: number, data: any) => {
    requirePerm('purchases');
    const db = getDb();
    const before = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(Number(id)) as any;
    if (!before) throw new Error('Поставщик не найден');
    const after = {
      name: String(data.name || '').trim(),
      contact: String(data.contact || '').trim() || null,
      note: String(data.note || '').trim() || null,
      email: String(data.email || '').trim() || null,
      phone: String(data.phone || '').trim() || null,
      inn: String(data.inn || '').trim() || null,
      address: String(data.address || '').trim() || null,
      priority: Math.max(1, Number(data.priority) || 100),
      default_lead_days: data.default_lead_days === '' || data.default_lead_days == null ? null : Math.max(0, Number(data.default_lead_days) || 0),
      is_active: data.is_active === undefined || data.is_active === null ? (before.is_active ?? 1) : (Number(data.is_active) ? 1 : 0),
    };
    if (!after.name) throw new Error('Укажите название поставщика');
    try {
      const result = db.prepare(`UPDATE suppliers SET
        name = ?, contact = ?, note = ?, email = ?, phone = ?, inn = ?, address = ?,
        priority = ?, default_lead_days = ?, is_active = ?
        WHERE id = ?`).run(
        after.name, after.contact, after.note, after.email, after.phone, after.inn, after.address,
        after.priority, after.default_lead_days, after.is_active, Number(id),
      );
      logEntityChanges('supplier', Number(id), before, after, Object.keys(after), actorName());
      try { ensureCounterpartyForSupplier(Number(id)); } catch (e) { console.warn('[Metrika] counterparty link failed:', e); }
      audit('supplier.update', 'supplier', Number(id), after.name);
      return result;
    } catch (error) {
      throw mapDbError(error);
    }
  });
  ipcMain.handle('suppliers:delete', (_e, id: number) => {
    requirePerm('purchases');
    const db = getDb();
    const supplier = db.prepare('SELECT id, name FROM suppliers WHERE id = ?').get(Number(id)) as any;
    if (!supplier) throw new Error('Поставщик не найден');
    const openPo = Number((db.prepare(`SELECT COUNT(*) AS c FROM purchase_orders
      WHERE supplier_id = ? AND status IN ('draft','ordered','partial','received')`).get(Number(id)) as any)?.c || 0);
    if (openPo > 0) throw new Error('Нельзя удалить: есть связанные заказы. Сначала отвяжите или удалите PO.');
    const del = db.transaction(() => {
      db.prepare('DELETE FROM supplier_items WHERE supplier_id = ?').run(Number(id));
      return db.prepare('DELETE FROM suppliers WHERE id = ?').run(Number(id)).changes;
    });
    const changes = del();
    audit('supplier.delete', 'supplier', Number(id), supplier.name);
    return { changes };
  });
  ipcMain.handle('supplierItems:list', (_e, supplierId?: number) => {
    const sql = `SELECT si.*, i.name AS item_name, i.sku, i.barcode, i.cost_price, s.name AS supplier_name
      FROM supplier_items si
      JOIN items i ON i.id = si.item_id
      JOIN suppliers s ON s.id = si.supplier_id`;
    return supplierId
      ? getDb().prepare(`${sql} WHERE si.supplier_id = ? ORDER BY i.name`).all(Number(supplierId))
      : getDb().prepare(`${sql} ORDER BY s.name, i.name`).all();
  });
  ipcMain.handle('supplierItems:upsert', (_e, data: any) => {
    requirePerm('purchases');
    const supplierId = Number(data.supplier_id);
    const itemId = Number(data.item_id);
    if (!supplierId || !itemId) throw new Error('Укажите поставщика и товар');
    return getDb().prepare(`INSERT INTO supplier_items (
      supplier_id, item_id, supplier_sku, price, lead_time_days, moq, pack_multiple, url, last_purchase_date
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(supplier_id, item_id) DO UPDATE SET
      supplier_sku = excluded.supplier_sku,
      price = excluded.price,
      lead_time_days = excluded.lead_time_days,
      moq = excluded.moq,
      pack_multiple = excluded.pack_multiple,
      url = excluded.url,
      last_purchase_date = excluded.last_purchase_date`).run(
      supplierId,
      itemId,
      String(data.supplier_sku || '').trim() || null,
      data.price === '' || data.price == null ? null : Number(data.price),
      data.lead_time_days === '' || data.lead_time_days == null ? null : Math.max(0, Number(data.lead_time_days) || 0),
      data.moq === '' || data.moq == null ? null : Math.max(0, Number(data.moq) || 0),
      data.pack_multiple === '' || data.pack_multiple == null ? null : Math.max(1, Number(data.pack_multiple) || 1),
      String(data.url || '').trim() || null,
      data.last_purchase_date || null,
    );
  });
  ipcMain.handle('supplierItems:delete', (_e, id: number) => {
    requirePerm('purchases');
    return getDb().prepare('DELETE FROM supplier_items WHERE id = ?').run(Number(id)).changes;
  });
  ipcMain.handle('purchases:list', () => getDb().prepare(`SELECT po.*, s.name AS supplier_name,
    (SELECT COUNT(*) FROM purchase_order_items poi WHERE poi.purchase_order_id = po.id) AS line_count,
    (SELECT COALESCE(SUM(poi.quantity), 0) FROM purchase_order_items poi WHERE poi.purchase_order_id = po.id) AS total_qty,
    (SELECT COALESCE(SUM(poi.received_qty), 0) FROM purchase_order_items poi WHERE poi.purchase_order_id = po.id) AS received_qty,
    (SELECT COALESCE(SUM(CASE WHEN poi.quantity > poi.received_qty THEN poi.quantity - poi.received_qty ELSE 0 END), 0)
      FROM purchase_order_items poi WHERE poi.purchase_order_id = po.id) AS remaining_qty
    FROM purchase_orders po LEFT JOIN suppliers s ON s.id = po.supplier_id ORDER BY po.created_at DESC`).all());
  ipcMain.handle('purchases:details', (_e, id: number) => ({
    order: getDb().prepare(`SELECT po.*, s.name AS supplier_name, l.name AS receive_location_name
      FROM purchase_orders po
      LEFT JOIN suppliers s ON s.id = po.supplier_id
      LEFT JOIN locations l ON l.id = po.receive_location_id
      WHERE po.id = ?`).get(id),
    lines: getDb().prepare(`SELECT poi.*, i.name AS item_name, i.sku, i.barcode, i.track_lots,
      CASE WHEN poi.quantity > COALESCE(poi.received_qty, 0)
        THEN poi.quantity - COALESCE(poi.received_qty, 0) ELSE 0 END AS remaining_qty
      FROM purchase_order_items poi JOIN items i ON i.id = poi.item_id
      WHERE poi.purchase_order_id = ?`).all(id),
  }));
  ipcMain.handle('purchases:create', (_e, data: any) => {
    requirePerm('purchases');
    const db = getDb();
    const orderNo = data.order_no || nextDocumentNo('po', 'PO');
    const result = db.prepare(`INSERT INTO purchase_orders (order_no, supplier_id, status, note, expected_at) VALUES (?, ?, 'draft', ?, ?)`).run(orderNo, data.supplier_id || null, data.note || null, data.expected_at || null);
    const id = Number(result.lastInsertRowid);
    try {
      const supplier = data.supplier_id
        ? (db.prepare('SELECT name FROM suppliers WHERE id = ?').get(Number(data.supplier_id)) as any)?.name
        : null;
      upsertDocument({
        doc_type: 'po',
        doc_no: orderNo,
        status: 'draft',
        doc_date: data.expected_at || new Date().toISOString().slice(0, 10),
        party: supplier || null,
        author: actorName(),
        note: data.note || null,
        ref_table: 'purchase_orders',
        ref_id: id,
      });
    } catch { /* registry optional */ }
    audit('purchase.create', 'purchase_order', id, orderNo);
    return { id };
  });

  ipcMain.handle('purchases:update', (_e, poId: number, data: any = {}) => {
    requirePerm('purchases');
    const db = getDb();
    const po = db.prepare(`SELECT po.*, s.name AS supplier_name FROM purchase_orders po
      LEFT JOIN suppliers s ON s.id = po.supplier_id WHERE po.id = ?`).get(Number(poId)) as any;
    if (!po) throw new Error('Заказ не найден');
    if (!['draft', 'ordered'].includes(po.status)) {
      throw new Error('Шапку заказа можно менять только до начала приёмки');
    }
    const supplierId = data.supplier_id === undefined ? po.supplier_id
      : (data.supplier_id === '' || data.supplier_id == null ? null : Number(data.supplier_id));
    const note = data.note === undefined ? po.note : (data.note || null);
    const expectedAt = data.expected_at === undefined ? po.expected_at
      : (String(data.expected_at || '').trim().slice(0, 10) || null);
    db.prepare('UPDATE purchase_orders SET supplier_id = ?, note = ?, expected_at = ? WHERE id = ?')
      .run(supplierId, note, expectedAt, po.id);
    try {
      const supplierName = supplierId
        ? ((db.prepare('SELECT name FROM suppliers WHERE id = ?').get(supplierId) as any)?.name || null)
        : null;
      upsertDocument({
        doc_type: 'po',
        doc_no: po.order_no || `PO-${po.id}`,
        status: 'draft',
        doc_date: expectedAt || po.ordered_at || new Date().toISOString().slice(0, 10),
        party: supplierName,
        author: actorName(),
        note,
        ref_table: 'purchase_orders',
        ref_id: po.id,
      });
    } catch { /* ignore */ }
    audit('purchase.update', 'purchase_order', po.id, po.order_no || String(po.id));
    return { ok: true };
  });
  ipcMain.handle('purchases:addItem', (_e, poId: number, itemId: number, quantity: number, unitPrice?: number) => {
    requirePerm('purchases');
    const po = getDb().prepare('SELECT status FROM purchase_orders WHERE id = ?').get(Number(poId)) as any;
    if (!po) throw new Error('Заказ не найден');
    if (po.status === 'received') throw new Error('Нельзя менять полученный заказ');
    if (['partial'].includes(po.status)) throw new Error('После частичной приёмки состав заказа менять нельзя');
    return getDb().prepare(`INSERT INTO purchase_order_items (purchase_order_id, item_id, quantity, unit_price) VALUES (?, ?, ?, ?) ON CONFLICT(purchase_order_id, item_id) DO UPDATE SET quantity = purchase_order_items.quantity + excluded.quantity, unit_price = COALESCE(excluded.unit_price, purchase_order_items.unit_price)`).run(poId, itemId, Math.max(1, Number(quantity) || 1), unitPrice ?? null);
  });
  ipcMain.handle('purchases:removeItem', (_e, poId: number, itemId: number) => {
    requirePerm('purchases');
    const po = getDb().prepare('SELECT status FROM purchase_orders WHERE id = ?').get(Number(poId)) as any;
    if (!po) throw new Error('Заказ не найден');
    if (po.status === 'received' || po.status === 'partial') throw new Error('Нельзя менять заказ после приёмки');
    return getDb().prepare('DELETE FROM purchase_order_items WHERE purchase_order_id = ? AND item_id = ?').run(poId, itemId);
  });
  ipcMain.handle('purchases:updateItem', (_e, poId: number, itemId: number, data: any) => {
    requirePerm('purchases');
    const po = getDb().prepare('SELECT status FROM purchase_orders WHERE id = ?').get(Number(poId)) as any;
    if (!po) throw new Error('Заказ не найден');
    if (po.status === 'cancelled') throw new Error('Заказ отменён');
    const qty = data.quantity === undefined ? undefined : Math.max(1, Math.floor(Number(data.quantity) || 1));
    const planPrice = data.unit_price === undefined ? undefined
      : (data.unit_price === '' || data.unit_price == null ? null : Number(data.unit_price));
    if (qty !== undefined && ['partial', 'received'].includes(po.status)) {
      throw new Error('Количество нельзя менять после начала приёмки');
    }
    if (qty !== undefined) {
      getDb().prepare('UPDATE purchase_order_items SET quantity = ? WHERE purchase_order_id = ? AND item_id = ?')
        .run(qty, Number(poId), Number(itemId));
    }
    if (planPrice !== undefined && ['draft', 'ordered'].includes(po.status)) {
      getDb().prepare('UPDATE purchase_order_items SET unit_price = ? WHERE purchase_order_id = ? AND item_id = ?')
        .run(planPrice, Number(poId), Number(itemId));
    }
    return { ok: true };
  });

  ipcMain.handle('purchases:delete', (_e, poId: number) => {
    requirePerm('purchases');
    const db = getDb();
    const po = db.prepare('SELECT id, status, order_no FROM purchase_orders WHERE id = ?').get(Number(poId)) as any;
    if (!po) throw new Error('Заказ не найден');
    if (po.status === 'partial' || po.status === 'received') {
      throw new Error('Сначала отмените проведение приёмки, затем удалите заказ');
    }
    const del = db.transaction(() => {
      db.prepare('DELETE FROM purchase_order_items WHERE purchase_order_id = ?').run(po.id);
      return db.prepare('DELETE FROM purchase_orders WHERE id = ?').run(po.id).changes;
    });
    const changes = del();
    audit('purchase.delete', 'purchase_order', po.id, po.order_no || String(po.id));
    return { changes };
  });
  ipcMain.handle('purchases:setStatus', (_e, poId: number, status: string) => {
    requirePerm('purchases');
    const allowed = ['draft', 'ordered', 'partial', 'received', 'cancelled'];
    if (!allowed.includes(status)) throw new Error('Недопустимый статус закупки');
    if (status === 'received' || status === 'partial') {
      throw new Error('Для приёмки используйте проведение документа (приход по заказу)');
    }
    const po = getDb().prepare('SELECT status FROM purchase_orders WHERE id = ?').get(Number(poId)) as any;
    if (!po) throw new Error('Заказ не найден');
    if ((po.status === 'partial' || po.status === 'received') && status !== po.status) {
      throw new Error('Статус после приёмки меняется только отменой проведения');
    }
    const result = status === 'ordered'
      ? getDb().prepare('UPDATE purchase_orders SET status = ?, ordered_at = COALESCE(ordered_at, date(?)) WHERE id = ?').run(status, new Date().toISOString().slice(0, 10), poId)
      : getDb().prepare('UPDATE purchase_orders SET status = ? WHERE id = ?').run(status, poId);
    try {
      const row = getDb().prepare(`SELECT po.*, s.name AS supplier_name FROM purchase_orders po
        LEFT JOIN suppliers s ON s.id = po.supplier_id WHERE po.id = ?`).get(Number(poId)) as any;
      if (row) {
        // Операционные статусы ordered/draft → документ ещё черновик; posted только после приёмки
        const docStatus = status === 'cancelled' ? 'cancelled' : 'draft';
        upsertDocument({
          doc_type: 'po',
          doc_no: row.order_no || `PO-${row.id}`,
          status: docStatus as any,
          doc_date: row.ordered_at || row.expected_at || new Date().toISOString().slice(0, 10),
          party: row.supplier_name || null,
          author: actorName(),
          note: row.note || null,
          ref_table: 'purchase_orders',
          ref_id: row.id,
        });
      }
    } catch { /* ignore registry doc */ }
    audit('purchase.status', 'purchase_order', poId, status);
    return result;
  });

  /** Проведение приёмки PO → движения ledger с document_ref = order_no */
  ipcMain.handle('purchases:receive', (_e, poId: number, data: any) => {
    requirePerm('purchases');
    requirePerm('inventory');
    requirePerm('post_po_receive');
    const db = getDb();
    const po = db.prepare(`SELECT po.*, s.name AS supplier_name
      FROM purchase_orders po LEFT JOIN suppliers s ON s.id = po.supplier_id WHERE po.id = ?`).get(Number(poId)) as any;
    if (!po) throw new Error('Заказ не найден');
    if (!['ordered', 'partial'].includes(po.status)) throw new Error('Приёмка доступна для заказов со статусом «Заказан» или «Частично»');
    const locationId = Number(data?.location_id);
    if (!locationId) throw new Error('Выберите ячейку приёмки');
    registry.requireLocationAccess(locationId);
    const location = db.prepare('SELECT id, name FROM locations WHERE id = ?').get(locationId) as any;
    if (!location) throw new Error('Ячейка приёмки не найдена');
    const lines = Array.isArray(data?.lines) ? data.lines : [];
    const docRef = po.order_no || `PO-${po.id}`;
    const actualDate = String(data?.actual_received_at || '').trim().slice(0, 10) || new Date().toISOString().slice(0, 10);
    let receivedUnits = 0;
    let amountFact = 0;
    const plannedIn = lines.reduce((sum: number, row: any) => sum + Math.max(0, Math.floor(Number(row.quantity) || 0)), 0);
    if (plannedIn > 0) assertLocationCapacity(db, locationId, plannedIn);

    const apply = db.transaction(() => {
      for (const row of lines) {
        const itemId = Number(row.item_id);
        const qty = Math.max(0, Math.floor(Number(row.quantity) || 0));
        if (!itemId || !qty) continue;
        const line = db.prepare('SELECT * FROM purchase_order_items WHERE purchase_order_id = ? AND item_id = ?').get(po.id, itemId) as any;
        if (!line) throw new Error(`Позиция #${itemId} отсутствует в заказе`);
        const remaining = Math.max(0, Number(line.quantity || 0) - Number(line.received_qty || 0));
        if (qty > remaining) throw new Error(`По товару #${itemId} осталось принять ${remaining}`);
        const actualPrice = row.unit_price === '' || row.unit_price == null
          ? (line.actual_unit_price ?? line.unit_price)
          : Number(row.unit_price);
        const itemMeta = db.prepare('SELECT track_lots FROM items WHERE id = ?').get(itemId) as any;
        const lotNo = String(row.lot_no || '').trim();
        const expiry = String(row.expiry_date || '').trim().slice(0, 10) || null;
        let lotId = 0;
        if (lotNo || Number(itemMeta?.track_lots)) {
          if (!lotNo) throw new Error(`Укажите номер партии для товара #${itemId}`);
          const lot = findOrCreateLot({
            item_id: itemId,
            lot_no: lotNo,
            expiry_date: expiry,
            unit_cost: actualPrice != null && Number.isFinite(Number(actualPrice)) ? Number(actualPrice) : null,
          });
          lotId = Number(lot.id);
        }
        addStockAtLocation(itemId, locationId, qty, lotId);
        db.prepare(`UPDATE purchase_order_items SET
          received_qty = received_qty + ?,
          actual_unit_price = ?
          WHERE purchase_order_id = ? AND item_id = ?`)
          .run(qty, actualPrice ?? null, po.id, itemId);
        if (actualPrice != null && Number.isFinite(Number(actualPrice))) {
          amountFact += qty * Number(actualPrice);
        }
        insertLedger({
          item_id: itemId,
          location_id: locationId,
          type: 'in',
          quantity: qty,
          comment: `Приход по ${docRef} · ${location.name}${lotNo ? ` · партия ${lotNo}` : ''}`,
          reason: 'PURCHASE',
          source: 'PURCHASE',
          document_ref: docRef,
          user_name: actorName(),
          lot_id: lotId || null,
        });
        receivedUnits += qty;
      }
      if (receivedUnits <= 0) throw new Error('Укажите количество хотя бы по одной позиции');
      const stats = db.prepare(`SELECT
        COALESCE(SUM(quantity), 0) AS ordered_qty,
        COALESCE(SUM(received_qty), 0) AS received_qty
        FROM purchase_order_items WHERE purchase_order_id = ?`).get(po.id) as any;
      const status = Number(stats.received_qty) >= Number(stats.ordered_qty) ? 'received' : 'partial';
      db.prepare(`UPDATE purchase_orders SET
        status = ?,
        receive_location_id = ?,
        posted_at = COALESCE(posted_at, CURRENT_TIMESTAMP),
        posted_by = COALESCE(posted_by, ?),
        actual_received_at = ?
        WHERE id = ?`).run(status, locationId, actorName(), actualDate, po.id);
      upsertDocument({
        doc_type: 'po',
        doc_no: docRef,
        status: 'posted',
        doc_date: actualDate,
        party: po.supplier_name || null,
        author: actorName(),
        posted_by: actorName(),
        note: po.note || `Приход на ${location.name}`,
        ref_table: 'purchase_orders',
        ref_id: po.id,
        amount: amountFact || null,
      });
      return { status, receivedUnits, remaining: Math.max(0, Number(stats.ordered_qty) - Number(stats.received_qty)), actual_received_at: actualDate };
    });

    const result = apply();
    audit('purchase.receive', 'purchase_order', po.id, `${docRef}: +${result.receivedUnits} → ${result.status}`);
    return result;
  });

  /** Отмена проведения приёмки: сторно движений документа и обнуление received_qty */
  ipcMain.handle('purchases:unreceive', (_e, poId: number) => {
    requirePerm('purchases');
    requirePerm('inventory');
    const db = getDb();
    const po = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(Number(poId)) as any;
    if (!po) throw new Error('Заказ не найден');
    if (!['partial', 'received'].includes(po.status)) throw new Error('Нет проведённой приёмки для отмены');
    const docRef = po.order_no || `PO-${po.id}`;
    const txs = db.prepare(`SELECT * FROM transactions
      WHERE reversed_at IS NULL AND document_ref = ? AND type = 'in' AND source = 'PURCHASE'
      ORDER BY id DESC`).all(docRef) as any[];
    if (!txs.length) throw new Error('Движения документа не найдены');

    const apply = db.transaction(() => {
      for (const tx of txs) {
        const lotId = normalizeLotId(tx.lot_id);
        const qty = Number(tx.quantity || 0);
        const currentLot = getStockAtLocation(tx.item_id, tx.location_id, lotId);
        if (currentLot < qty) throw new Error(`Нельзя отменить: остаток по товару #${tx.item_id} уже израсходован`);
        const nextTotal = getStockAtLocation(tx.item_id, tx.location_id) - qty;
        const reserved = (db.prepare(`SELECT COALESCE(SUM(pr.quantity), 0) AS quantity
          FROM project_reservations pr JOIN projects p ON p.id = pr.project_id
          WHERE pr.item_id = ? AND pr.location_id = ? AND p.status IN ('reserved','picking','picked','assembly')`)
          .get(tx.item_id, tx.location_id) as any).quantity;
        if (nextTotal < reserved) throw new Error(`Нельзя отменить: товар #${tx.item_id} зарезервирован`);
        addStockAtLocation(tx.item_id, tx.location_id, -qty, lotId);
        db.prepare('UPDATE transactions SET reversed_at = CURRENT_TIMESTAMP WHERE id = ?').run(tx.id);
        insertLedger({
          item_id: tx.item_id,
          location_id: tx.location_id,
          type: 'out',
          quantity: qty,
          comment: `Отмена проведения ${docRef}`,
          reason: 'PURCHASE',
          source: 'SYSTEM',
          document_ref: `${docRef}-REV`,
          user_name: actorName(),
          lot_id: lotId || null,
        });
      }
      db.prepare('UPDATE purchase_order_items SET received_qty = 0, actual_unit_price = NULL WHERE purchase_order_id = ?').run(po.id);
      db.prepare(`UPDATE purchase_orders SET
        status = 'ordered', posted_at = NULL, posted_by = NULL, actual_received_at = NULL
        WHERE id = ?`).run(po.id);
      // Отмена проведения → документ снова черновик (заказ остаётся «Заказан»)
      upsertDocument({
        doc_type: 'po',
        doc_no: docRef,
        status: 'draft',
        author: actorName(),
        posted_by: actorName(),
        ref_table: 'purchase_orders',
        ref_id: po.id,
        note: 'Отмена проведения приёмки',
        amount: 0,
      });
      return { reversed: txs.length };
    });

    const result = apply();
    audit('purchase.unreceive', 'purchase_order', po.id, `${docRef}: отмена ${result.reversed} движений`);
    return result;
  });

  ipcMain.handle('db:diagnose', () => {
    requirePerm('backup');
    return diagnoseDatabase();
  });
  ipcMain.handle('db:ledgerDrift', () => {
    requirePerm('quality');
    return listInventoryLedgerDrift(100);
  });
  ipcMain.handle('db:rebuildInventory', () => {
    requirePerm('backup');
    const result = rebuildInventoryFromLedger();
    audit('db.rebuildInventory', 'settings', null, `Ячеек: ${result.rewritten}, drift ${result.before_drift}→${result.after_drift}`);
    touchUi('stock');
    return result;
  });
  ipcMain.handle('db:healLedgerDrift', (_e, filter: any = {}) => {
    requirePerm('quality');
    const result = healLedgerDriftToInventory(
      filter?.item_id
        ? {
          item_id: Number(filter.item_id),
          location_id: filter.location_id != null ? Number(filter.location_id) : undefined,
          lot_id: filter.lot_id != null ? Number(filter.lot_id) : undefined,
        }
        : undefined,
    );
    audit('db.healLedgerDrift', 'settings', null, `Корректировок: ${result.adjusted}, drift ${result.before_drift}→${result.after_drift}`);
    touchUi('stock');
    return result;
  });

  ipcMain.handle('reserves:list', (_e, filters: any = {}) => {
    requirePerm('projects');
    return listStockReserves({
      projectId: filters?.projectId,
      itemId: filters?.itemId,
      locationId: filters?.locationId,
      q: filters?.q,
    });
  });
  ipcMain.handle('reserves:summary', () => {
    requirePerm('projects');
    return summarizeStockReserves();
  });
  ipcMain.handle('analytics:movements', (_e, filters: any = {}) => {
    const days = Math.min(365, Math.max(1, Number(filters.days) || 90));
    const from = filters.from || '';
    const to = filters.to || '';
    const type = filters.type || '';
    const groupBy = filters.groupBy || 'item';
    const periodSql = from || to
      ? `(? = '' OR date(t.timestamp) >= date(?)) AND (? = '' OR date(t.timestamp) <= date(?))`
      : `t.timestamp >= datetime('now', ?)`;
    const periodParams = from || to ? [from, from, to, to] : [`-${days} days`];
    const typeSql = type ? 'AND t.type = ?' : '';
    const typeParams = type ? [type] : [];
    const selectMap: Record<string, string> = {
      item: `i.id AS key, i.name AS label, i.category AS extra`,
      category: `COALESCE(i.category, 'Без категории') AS key, COALESCE(i.category, 'Без категории') AS label, '' AS extra`,
      reason: `COALESCE(t.reason, '—') AS key, COALESCE(t.reason, '—') AS label, '' AS extra`,
      project: `COALESCE(p.order_no, 'Без проекта') AS key, COALESCE(p.order_no || ' · ' || p.name, 'Без проекта') AS label, '' AS extra`,
      location: `COALESCE(l.name, '—') AS key, COALESCE(l.name, '—') AS label, '' AS extra`,
      operator: `COALESCE(t.user_name, '—') AS key, COALESCE(t.user_name, '—') AS label, '' AS extra`,
    };
    const groupMap: Record<string, string> = {
      item: 'i.id',
      category: 'COALESCE(i.category, \'Без категории\')',
      reason: 'COALESCE(t.reason, \'—\')',
      project: 'COALESCE(p.order_no, \'Без проекта\')',
      location: 'COALESCE(l.name, \'—\')',
      operator: 'COALESCE(t.user_name, \'—\')',
    };
    const select = selectMap[groupBy] || selectMap.item;
    const group = groupMap[groupBy] || groupMap.item;
    return getDb().prepare(`SELECT ${select},
      SUM(CASE WHEN t.type = 'in' THEN t.quantity ELSE 0 END) AS qty_in,
      SUM(CASE WHEN t.type = 'out' THEN t.quantity ELSE 0 END) AS qty_out,
      SUM(CASE WHEN t.type = 'move' THEN t.quantity ELSE 0 END) AS qty_move,
      SUM(CASE WHEN t.type = 'adjustment' THEN t.quantity ELSE 0 END) AS qty_adjustment,
      COUNT(*) AS ops
      FROM transactions t
      LEFT JOIN items i ON i.id = t.item_id
      LEFT JOIN locations l ON l.id = t.location_id
      LEFT JOIN projects p ON p.id = t.project_id
      WHERE t.reversed_at IS NULL AND ${periodSql} ${typeSql}
      GROUP BY ${group}
      ORDER BY ops DESC
      LIMIT 500`).all(...periodParams, ...typeParams);
  });
  ipcMain.handle('scanner:reconnect', (_e, portPath: string, baudRate = 9600) => {
    scanner.setPort(portPath || '');
    scanner.setBaudRate(Number(baudRate) || 9600);
    scanner.connect();
    return { port: portPath || null };
  });

  ipcMain.handle('export:csv', async (_e, rows: any[], name = 'metrika-export') => {
    const result = await dialog.showSaveDialog({ defaultPath: stampedFileName(name || 'metrika-export', 'csv'), filters: [{ name: 'CSV', extensions: ['csv'] }] });
    if (result.canceled || !result.filePath) return null;
    const generatedAt = new Date().toISOString();
    const datedValues = rows.map((row) => row.timestamp || row.created_at || row.scanned_at).filter(Boolean).map((value) => new Date(value)).filter((value) => Number.isFinite(value.getTime())).sort((left, right) => left.getTime() - right.getTime());
    const periodStart = datedValues.length ? datedValues[0].toISOString() : '';
    const periodEnd = datedValues.length ? datedValues[datedValues.length - 1].toISOString() : '';
    const headers = ['generated_at', 'period_start', 'period_end', ...(rows.length ? Object.keys(rows[0]) : [])];
    const quote = (value: any) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const values = rows.map((row) => [generatedAt, periodStart, periodEnd, ...Object.keys(rows[0] || {}).map((key) => row[key])].map(quote).join(';'));
    fs.writeFileSync(result.filePath, `\uFEFF${headers.map(quote).join(';')}${headers.length ? '\r\n' : ''}${values.join('\r\n')}`, 'utf8');
    return result.filePath;
  });

  ipcMain.handle('export:pdf', async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) return null;
    const result = await dialog.showSaveDialog({ defaultPath: stampedFileName('metrika-report', 'pdf'), filters: [{ name: 'PDF', extensions: ['pdf'] }] });
    if (result.canceled || !result.filePath) return null;
    const generatedAt = new Date().toLocaleString('ru-RU');
    fs.writeFileSync(result.filePath, await window.webContents.printToPDF({
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate: `<div style="width:100%;padding:0 12mm;font:8px Arial,sans-serif;color:#666">Метрика · сформировано ${generatedAt}<span style="float:right"><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
      margins: { top: 0.4, bottom: 0.5, left: 0.4, right: 0.4 },
    }));
    return result.filePath;
  });

  ipcMain.handle('transactions:print', async (_event, fromDate = '', toDate = '') => {
    const rows = getDb().prepare(`SELECT t.timestamp, t.type, i.name AS item_name, i.barcode AS item_barcode, l.name AS location_name, t.quantity, t.comment, t.user_name FROM transactions t LEFT JOIN items i ON i.id = t.item_id LEFT JOIN locations l ON l.id = t.location_id WHERE (? = '' OR date(t.timestamp) >= date(?)) AND (? = '' OR date(t.timestamp) <= date(?)) ORDER BY t.timestamp DESC, t.id DESC LIMIT 500`).all(fromDate, fromDate, toDate, toDate) as any[];
    const labels: Record<string, string> = { in: 'Приход', out: 'Расход', move: 'Перемещение' };
    const esc = (value: any) => String(value ?? '').replace(/[&<>]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[char] || char));
    const generatedAt = new Date().toLocaleString('ru-RU');
    const period = fromDate || toDate ? `Период: ${esc(fromDate || 'без начала')} — ${esc(toDate || 'по настоящее время')}` : 'Период: последние 500 операций';
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;color:#202124;padding:32px}h1{margin:0 0 8px;font-size:24px}.meta{color:#5f6368;line-height:1.7}.document{border-bottom:2px solid #202124;padding-bottom:16px}table{width:100%;border-collapse:collapse;margin-top:24px;font-size:10px}th,td{border:1px solid #c4c7c5;padding:7px}th{background:#f1f3f4;text-align:left}.sign{display:flex;gap:60px;margin-top:70px}.sign div{width:220px;border-top:1px solid #202124;padding-top:8px;color:#5f6368}@media print{thead{display:table-header-group}tr{break-inside:avoid}}</style></head><body><div class="document"><h1>Журнал складских операций</h1><div class="meta">Организация: Метрика<br>Сформировано: ${esc(generatedAt)}<br>${period}<br>Записей: ${rows.length}</div></div><table><thead><tr><th>Дата</th><th>Операция</th><th>Товар</th><th>Штрихкод</th><th>Ячейка</th><th>Количество</th><th>Комментарий</th><th>Оператор</th></tr></thead><tbody>${rows.map((row) => `<tr><td>${esc(new Date(row.timestamp).toLocaleString('ru-RU'))}</td><td>${esc(labels[row.type] || row.type)}</td><td>${esc(row.item_name)}</td><td>${esc(row.item_barcode)}</td><td>${esc(row.location_name)}</td><td>${row.quantity}</td><td>${esc(row.comment)}</td><td>${esc(row.user_name)}</td></tr>`).join('')}</tbody></table><div class="sign"><div>Ответственный, подпись</div><div>Проверил, подпись</div></div></body></html>`;
    const printWindow = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
    await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    const result = await dialog.showSaveDialog({ defaultPath: stampedFileName('metrika-transactions', 'pdf'), filters: [{ name: 'PDF', extensions: ['pdf'] }] });
    if (result.canceled || !result.filePath) { printWindow.close(); return null; }
    fs.writeFileSync(result.filePath, await printWindow.webContents.printToPDF({ printBackground: true, pageSize: 'A4' }));
    printWindow.close();
    return result.filePath;
  });

  ipcMain.handle('backup:create', async () => {
    requirePerm('backup');
    const result = await dialog.showSaveDialog({ defaultPath: path.join(app.getPath('documents'), stampedFileName('metrika-backup', 'db')), filters: [{ name: 'SQLite database', extensions: ['db'] }] });
    if (result.canceled || !result.filePath) return null;
    backupDatabase(result.filePath);
    audit('backup.create', 'backup', null, result.filePath);
    return result.filePath;
  });

  ipcMain.handle('backup:restore', async () => {
    requirePerm('backup');
    const selected = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'SQLite backup', extensions: ['db', 'sqlite', 'sqlite3'] }] });
    if (selected.canceled || !selected.filePaths[0]) return null;
    const confirmation = await dialog.showMessageBox({
      type: 'warning',
      title: 'Восстановление базы данных',
      message: 'Текущие данные будут заменены содержимым выбранной копии.',
      detail: 'Перед заменой приложение автоматически сохранит текущую базу в папку backups. Продолжить?',
      buttons: ['Восстановить', 'Отмена'],
      defaultId: 1,
      cancelId: 1,
    });
    if (confirmation.response !== 0) return null;
    const safety = await restoreDatabase(selected.filePaths[0]);
    audit('backup.restore', 'backup', null, selected.filePaths[0]);
    return safety;
  });

  ipcMain.handle('backup:autoNow', () => {
    requirePerm('backup');
    const prefs = readBackupPrefs();
    const result = runAutoBackup({ keep: prefs.keep, reason: 'manual' });
    if (!result) throw new Error('Не удалось создать автокопию');
    audit('backup.auto', 'backup', null, result.path);
    return result;
  });

  ipcMain.handle('backup:listAuto', () => {
    requirePerm('backup');
    return listAutoBackups(50);
  });

  ipcMain.handle('backup:openFolder', async () => {
    requirePerm('backup');
    return openAutoBackupFolder();
  });

  ipcMain.handle('backup:exportOrg', async () => {
    requirePerm('backup');
    const result = await dialog.showSaveDialog({
      defaultPath: path.join(app.getPath('documents'), suggestExportName()),
      filters: [{ name: 'SQLite database', extensions: ['db'] }],
    });
    if (result.canceled || !result.filePath) return null;
    const exported = exportOrganizationDatabase(result.filePath);
    audit('backup.exportOrg', 'organization', registry.getSession()?.organization?.id ?? null, exported.db);
    return exported;
  });

  ipcMain.handle('app:quit', () => {
    app.quit();
    return true;
  });
  ipcMain.handle('auth:session', () => registry.getSession());
  ipcMain.handle('session:open', (event, organizationId: number, userId: number, password?: string) => {
    const session = registry.openSession(Number(organizationId), Number(userId), password);
    try {
      const prefs = readBackupPrefs();
      backupOnSessionBoundary(prefs.keep);
      startAutoBackupScheduler(prefs.intervalHours, prefs.keep);
    } catch (error) {
      console.warn('[Metrika] Auto-backup on open failed:', error);
    }
    try {
      automation.ensureDefaultAutomationRules();
      automation.runScheduledAutomations();
      automation.startAutomationScheduler();
      backfillSupplierCounterpartyLinks();
    } catch (error) {
      console.warn('[Metrika] Automation/link on open failed:', error);
    }
    try {
      maybeAutostartCrmRemoteServer();
    } catch (error) {
      console.warn('[Metrika] CRM remote autostart failed:', error);
    }
    try {
      maybeAutostartMiapiServer();
    } catch (error) {
      console.warn('[Metrika] MIAPI autostart failed:', error);
    }
    try {
      ensurePluginsLoaded();
      ensureDefaultWorkflowSeed();
      flushTsdOutbox(50);
    } catch (error) {
      console.warn('[Metrika] plugins/workflow/tsd on open failed:', error);
    }
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) {
      win.setMinimumSize(720, 560);
      win.setSize(1400, 900, true);
      win.center();
    }
    return session;
  });
  ipcMain.handle('session:close', (event) => {
    try {
      const prefs = readBackupPrefs();
      backupOnSessionBoundary(prefs.keep);
    } catch { /* ignore */ }
    stopAutoBackupScheduler();
    try { automation.stopAutomationScheduler(); } catch { /* ignore */ }
    try {
      stopCrmRemoteServer();
    } catch { /* ignore */ }
    try {
      stopMiapiServer();
    } catch { /* ignore */ }
    registry.closeSession();
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) {
      win.setMinimumSize(520, 480);
      win.setSize(640, 520, true);
      win.center();
    }
    return true;
  });
  ipcMain.handle('ui:titlebar', (event, theme: string) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || typeof win.setTitleBarOverlay !== 'function') return false;
    const map: Record<string, { color: string; symbolColor: string }> = {
      light: { color: '#ffffff', symbolColor: '#202124' },
      dark: { color: '#202124', symbolColor: '#f1f3f4' },
      '1c-light': { color: '#ffd83d', symbolColor: '#2a2a2a' },
      '1c-dark': { color: '#3a3a30', symbolColor: '#ffd83d' },
    };
    const next = map[theme] || map['1c-light'];
    win.setTitleBarOverlay({ color: next.color, symbolColor: next.symbolColor, height: 32 });
    return true;
  });
  ipcMain.handle('orgs:list', () => registry.listOrganizations());
  ipcMain.handle('orgs:create', (_e, data: any) => registry.createOrganization(data));
  // С лаунчера сессии ещё нет — CRUD организаций доступен локально.
  // Внутри сессии нужен org_edit (админ).
  ipcMain.handle('orgs:update', (_e, id: number, data: any) => {
    if (registry.getSession()) requirePerm('org_edit');
    return registry.updateOrganization(Number(id), data);
  });
  ipcMain.handle('orgs:delete', (_e, id: number) => {
    if (registry.getSession()) requirePerm('org_edit');
    return registry.deleteOrganization(Number(id));
  });
  ipcMain.handle('users:list', (_e, organizationId?: number) => registry.listUsers(organizationId ? Number(organizationId) : undefined));
  ipcMain.handle('users:create', (_e, data: any) => {
    if (registry.getSession()) registry.requirePerm('users');
    const created = registry.createUser(data);
    audit('user.create', 'user', created?.id, `${created?.login || ''} · ${created?.role || ''}`);
    return created;
  });
  ipcMain.handle('users:update', (_e, id: number, data: any) => {
    registry.requirePerm('users');
    const updated = registry.updateUser(Number(id), data);
    const activeFlag = data.is_active === 0 || data.is_active === false ? 'выключен' : 'активен';
    audit('user.update', 'user', id, `${updated?.login || ''} · ${updated?.role || ''} · ${activeFlag}`);
    return updated;
  });
  ipcMain.handle('users:delete', (_e, id: number) => {
    registry.requirePerm('users');
    const result = registry.deleteUser(Number(id));
    audit('user.delete', 'user', id, 'Удалён');
    return result;
  });
  ipcMain.handle('audit:list', (_e, limit = 200) => {
    registry.requireSession();
    if (!registry.hasPerm('users') && !registry.hasPerm('org_edit')) {
      registry.requirePerm('users');
    }
    const orgId = registry.getSession()?.organization?.id;
    return registry.listAudit(orgId ? Number(orgId) : undefined, Number(limit) || 200);
  });
  ipcMain.handle('console:log', (_e, level = 'info', source = 'app', message = '') => {
    try {
      getDb().prepare('INSERT INTO console_log (level, source, message) VALUES (?, ?, ?)').run(String(level || 'info'), String(source || 'app'), String(message || ''));
      getDb().prepare('DELETE FROM console_log WHERE id NOT IN (SELECT id FROM console_log ORDER BY id DESC LIMIT 500)').run();
    } catch { /* warehouse may be closed */ }
    return true;
  });
  ipcMain.handle('console:list', (_e, limit = 80) => {
    try {
      return getDb().prepare('SELECT * FROM console_log ORDER BY id DESC LIMIT ?').all(Math.min(200, Math.max(1, Number(limit) || 80)));
    } catch { return []; }
  });
  ipcMain.handle('templates:delete', (_e, id: number) => {
    requirePerm('templates_edit');
    registry.requireSession();
    return getDb().prepare('DELETE FROM item_templates WHERE id = ?').run(Number(id)).changes;
  });
  ipcMain.handle('items:deletePhoto', (_e, photoId: number) => {
    requirePerm('items_edit');
    registry.requireSession();
    const photo = getDb().prepare('SELECT * FROM item_photos WHERE id = ?').get(Number(photoId)) as any;
    if (!photo) return false;
    getDb().prepare('DELETE FROM item_photos WHERE id = ?').run(photo.id);
    try { if (photo.file_path && fs.existsSync(photo.file_path)) fs.unlinkSync(photo.file_path); } catch { /* ignore */ }
    return true;
  });
  ipcMain.handle('categories:bootstrapModules', () => {
    requirePerm('categories_edit');
    registry.requireSession();
    return syncCategoryTaxonomy(getDb());
  });
  ipcMain.handle('categories:syncTaxonomy', () => {
    requirePerm('categories_edit');
    registry.requireSession();
    return syncCategoryTaxonomy(getDb());
  });

  ipcMain.handle('export:excel', async (_e, rows: any[], name = 'metrika-export') => {
    const result = await dialog.showSaveDialog({
      defaultPath: stampedFileName(name || 'metrika-export', 'xls'),
      filters: [{ name: 'Excel', extensions: ['xls'] }],
    });
    if (result.canceled || !result.filePath) return null;
    const generatedAt = new Date().toLocaleString('ru-RU');
    const keys = rows.length ? Object.keys(rows[0]) : [];
    const esc = (value: any) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const header = ['generated_at', ...keys];
    const body = rows.map((row) => [generatedAt, ...keys.map((key) => row[key])]);
    const xml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Worksheet ss:Name="Metrika">
  <Table>
   <Row>${header.map((key) => `<Cell><Data ss:Type="String">${esc(key)}</Data></Cell>`).join('')}</Row>
   ${body.map((line) => `<Row>${line.map((cell) => `<Cell><Data ss:Type="String">${esc(cell)}</Data></Cell>`).join('')}</Row>`).join('\n')}
  </Table>
 </Worksheet>
</Workbook>`;
    fs.writeFileSync(result.filePath, '\uFEFF' + xml, 'utf8');
    return result.filePath;
  });
  ipcMain.handle('analytics:stockValue', () => {
    const rows = getDb().prepare(`SELECT COALESCE(NULLIF(i.category, ''), 'Без категории') AS category,
      COUNT(i.id) AS item_count,
      COALESCE(SUM(inv.quantity), 0) AS qty,
      COALESCE(SUM(inv.quantity * COALESCE(i.cost_price, 0)), 0) AS cost_value,
      COALESCE(SUM(inv.quantity * COALESCE(i.sale_price, 0)), 0) AS sale_value
      FROM items i LEFT JOIN inventory inv ON inv.item_id = i.id
      GROUP BY COALESCE(NULLIF(i.category, ''), 'Без категории')
      ORDER BY cost_value DESC, category`).all();
    const total = (rows as any[]).reduce((sum: { qty: number; cost_value: number; sale_value: number }, row: any) => ({
      qty: sum.qty + Number(row.qty || 0),
      cost_value: sum.cost_value + Number(row.cost_value || 0),
      sale_value: sum.sale_value + Number(row.sale_value || 0),
    }), { qty: 0, cost_value: 0, sale_value: 0 });
    return { rows, total };
  });

  function orgLetterheadHtml() {
    const org = registry.getSession()?.organization || {};
    const esc = (value: any) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[char] || char));
    const lines = [
      org.legal_name || org.name,
      org.inn ? `ИНН ${org.inn}${org.kpp ? ` · КПП ${org.kpp}` : ''}` : '',
      org.address || org.legal_address || '',
      [org.phone, org.email].filter(Boolean).join(' · '),
    ].filter(Boolean);
    return `<div class="letterhead">
      <div class="letterhead-brand">${esc(org.name || 'Метрика')}</div>
      <div class="letterhead-meta">${lines.map((line) => `<div>${esc(line)}</div>`).join('')}</div>
      ${org.code ? `<div class="letterhead-code">${esc(org.code)}</div>` : ''}
    </div>`;
  }

  const printCss = `body{font-family:"Segoe UI",Arial,sans-serif;color:#202124;padding:28px 32px}
.letterhead{display:flex;justify-content:space-between;gap:16px;border-bottom:2px solid #c9a227;padding-bottom:14px;margin-bottom:18px}
.letterhead-brand{font-size:20px;font-weight:700;color:#2a2a2a}
.letterhead-meta{font-size:12px;color:#5f6368;line-height:1.55;text-align:right}
.letterhead-code{align-self:flex-start;padding:4px 8px;border:1px solid #c9a227;font-size:11px;font-weight:700}
h1{font-size:22px;margin:0 0 6px} .meta{color:#5f6368;font-size:13px;line-height:1.6;margin-bottom:16px}
table{width:100%;border-collapse:collapse;margin-top:10px} th,td{border:1px solid #c4c7c5;padding:8px;text-align:left;font-size:12px}
th{background:#f7f3e3} .footer{margin-top:36px;color:#5f6368;font-size:12px;display:flex;justify-content:space-between}`;

  async function savePdfHtml(html: string, defaultName: string, options?: { landscape?: boolean }) {
    const printWindow = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
    try {
      await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
      const result = await dialog.showSaveDialog({
        defaultPath: stampedFileName(defaultName, 'pdf'),
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
      });
      if (result.canceled || !result.filePath) return null;
      fs.writeFileSync(result.filePath, await printWindow.webContents.printToPDF({
        printBackground: true,
        pageSize: 'A4',
        landscape: Boolean(options?.landscape),
      }));
      return { path: result.filePath };
    } finally {
      if (!printWindow.isDestroyed()) printWindow.close();
    }
  }

  function loadCustomPrintTemplates(): PrintTemplate[] {
    try {
      const raw = (getDb().prepare("SELECT value FROM schema_meta WHERE key = ?").get('setting:print.templates') as any)?.value;
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter((t) => t && t.id && t.name) : [];
    } catch {
      return [];
    }
  }

  function saveCustomPrintTemplates(rows: PrintTemplate[]) {
    requirePerm('settings');
    const payload = JSON.stringify(rows.filter((t) => t && !t.isSystem));
    getDb().prepare("INSERT INTO schema_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
      .run('setting:print.templates', payload);
  }

  ipcMain.handle('printTemplates:list', () => {
    registry.requireSession();
    return [...SYSTEM_PRINT_TEMPLATES, ...loadCustomPrintTemplates()];
  });

  ipcMain.handle('printTemplates:save', (_e, template: PrintTemplate) => {
    requirePerm('settings');
    if (!template?.name?.trim()) throw new Error('??????? ???????? ?????');
    const customs = loadCustomPrintTemplates();
    const next: PrintTemplate = {
      ...template,
      id: template.id && !String(template.id).startsWith('sys-') ? template.id : `tpl-${Date.now().toString(36)}`,
      name: String(template.name).trim(),
      isSystem: false,
      updatedAt: new Date().toISOString(),
    };
    const idx = customs.findIndex((t) => t.id === next.id);
    if (idx >= 0) customs[idx] = next;
    else customs.push(next);
    saveCustomPrintTemplates(customs);
    return next;
  });

  ipcMain.handle('printTemplates:delete', (_e, id: string) => {
    requirePerm('settings');
    const tid = String(id || '');
    if (tid.startsWith('sys-')) throw new Error('????????? ?????? ?????? ??????? � ???????? ?????');
    saveCustomPrintTemplates(loadCustomPrintTemplates().filter((t) => t.id !== tid));
    return true;
  });

  ipcMain.handle('printTemplates:clone', (_e, id: string) => {
    requirePerm('settings');
    const all = [...SYSTEM_PRINT_TEMPLATES, ...loadCustomPrintTemplates()];
    const src = all.find((t) => t.id === id);
    if (!src) throw new Error('?????? ?? ??????');
    const copy = cloneTemplate(src);
    const customs = loadCustomPrintTemplates();
    customs.push(copy);
    saveCustomPrintTemplates(customs);
    return copy;
  });

  ipcMain.handle('printTemplates:createBlank', () => {
    requirePerm('settings');
    const blank = blankTemplate();
    const customs = loadCustomPrintTemplates();
    customs.push(blank);
    saveCustomPrintTemplates(customs);
    return blank;
  });

  ipcMain.handle('documents:list', (_e, filters: any = {}) => {
    requirePerm('documents');
    const db = getDb();
    const from = filters?.from ? String(filters.from) : '';
    const to = filters?.to ? String(filters.to) : '';
    const inRange = (iso: string | null | undefined) => {
      if (!iso) return !from && !to;
      const day = String(iso).slice(0, 10);
      if (from && day < from) return false;
      if (to && day > to) return false;
      return true;
    };
    const poStatus: Record<string, string> = {
      draft: 'Черновик', ordered: 'Заказан', partial: 'Частично', received: 'Получен', cancelled: 'Отменён',
    };
    const docStatusRu: Record<string, string> = {
      draft: 'Черновик', posted: 'Проведён', cancelled: 'Отменён',
    };
    const registryDocs = new Map<string, any>();
    const registryByRef = new Map<string, any>();
    try {
      for (const doc of db.prepare('SELECT * FROM documents').all() as any[]) {
        registryDocs.set(`${doc.doc_type}:${doc.doc_no}`, doc);
        if (doc.ref_table && doc.ref_id != null) {
          registryByRef.set(`${doc.ref_table}:${doc.ref_id}`, doc);
        }
      }
    } catch { /* schema may lag */ }
    const projectStatus: Record<string, string> = {
      draft: 'Черновик', reserved: 'Зарезервирован', picking: 'Комплектация', picked: 'Скомплектован',
      assembly: 'Сборка', consumed: 'Списан', finished: 'Завершен', completed: 'Завершен',
    };
    const rows: any[] = [];

    for (const po of db.prepare(`SELECT po.*, s.name AS supplier_name,
      (SELECT COUNT(*) FROM purchase_order_items poi WHERE poi.purchase_order_id = po.id) AS lines,
      (SELECT COALESCE(SUM(poi.quantity * COALESCE(poi.unit_price, 0)), 0) FROM purchase_order_items poi WHERE poi.purchase_order_id = po.id) AS amount_plan,
      (SELECT COALESCE(SUM(COALESCE(poi.received_qty, 0) * COALESCE(poi.actual_unit_price, poi.unit_price, 0)), 0)
        FROM purchase_order_items poi WHERE poi.purchase_order_id = po.id) AS amount_fact
      FROM purchase_orders po LEFT JOIN suppliers s ON s.id = po.supplier_id ORDER BY po.id DESC`).all() as any[]) {
      const fallbackNo = po.order_no || `PO-${po.id}`;
      const reg = registryByRef.get(`purchase_orders:${po.id}`) || registryDocs.get(`po:${fallbackNo}`);
      const docNo = reg?.doc_no || fallbackNo;
      const date = po.actual_received_at || reg?.doc_date || po.ordered_at || po.expected_at || po.created_at;
      if (!inRange(date)) continue;
      const regStatus = reg?.status ? (docStatusRu[reg.status] || reg.status) : '';
      const opStatus = poStatus[po.status] || po.status;
      rows.push({
        id: String(po.id), kind: 'po', kind_label: 'Заказ поставщику',
        number: docNo, date,
        status: regStatus ? `${opStatus} · ${regStatus}` : opStatus,
        doc_status: reg?.status || (['partial', 'received'].includes(po.status) ? 'posted' : po.status === 'cancelled' ? 'cancelled' : 'draft'),
        party: po.supplier_name || reg?.party || '—',
        amount: Number(reg?.amount ?? po.amount_fact ?? po.amount_plan ?? 0),
        amount_plan: Number(po.amount_plan || 0),
        amount_fact: Number(po.amount_fact || 0),
        lines: Number(po.lines || 0), note: po.note || '',
        author: reg?.author || po.posted_by || '',
        document_id: reg?.id || null,
        ref_id: po.id,
      });
    }

    for (const session of db.prepare(`SELECT s.*, l.name AS location_name,
      (SELECT COUNT(*) FROM inventory_counts c WHERE c.session_id = s.id) AS lines
      FROM inventory_sessions s LEFT JOIN locations l ON l.id = s.location_id ORDER BY s.id DESC`).all() as any[]) {
      const fallbackNo = `REV-${session.id}`;
      const reg = registryByRef.get(`inventory_sessions:${session.id}`) || registryDocs.get(`revision:${fallbackNo}`);
      const docNo = reg?.doc_no || fallbackNo;
      const date = session.completed_at || reg?.doc_date || session.created_at;
      if (!inRange(date)) continue;
      rows.push({
        id: String(session.id), kind: 'revision', kind_label: 'Ревизия',
        number: docNo, date,
        status: session.status === 'completed'
          ? (reg?.status === 'posted' ? 'Проведён' : 'Проведён')
          : (reg?.status ? docStatusRu[reg.status] : 'Черновик'),
        doc_status: reg?.status || (session.status === 'completed' ? 'posted' : 'draft'),
        party: session.location_name || reg?.party || '—', amount: null, lines: Number(session.lines || 0),
        note: '', author: reg?.author || reg?.posted_by || '',
        document_id: reg?.id || null,
        ref_id: session.id,
      });
    }

    for (const project of db.prepare(`SELECT p.*,
      (SELECT COUNT(*) FROM project_items pi WHERE pi.project_id = p.id) AS lines
      FROM projects p ORDER BY p.id DESC`).all() as any[]) {
      const fallbackNo = project.order_no || `WO-${project.id}`;
      const reg = registryByRef.get(`projects:${project.id}`) || registryDocs.get(`project:${fallbackNo}`);
      const docNo = reg?.doc_no || fallbackNo;
      const date = reg?.doc_date || project.due_date || project.updated_at || project.created_at;
      if (!inRange(date)) continue;
      const opStatus = projectStatus[project.status] || project.status;
      const regStatus = reg?.status ? (docStatusRu[reg.status] || reg.status) : '';
      rows.push({
        id: String(project.id), kind: 'project', kind_label: 'Заказ-наряд',
        number: docNo, date,
        status: regStatus ? `${opStatus} · ${regStatus}` : opStatus,
        doc_status: reg?.status || (['consumed', 'finished', 'completed'].includes(project.status) ? 'posted' : 'draft'),
        party: project.target_name || project.name || reg?.party || '—', amount: null,
        lines: Number(project.lines || 0), note: project.description || '',
        author: reg?.author || '',
        document_id: reg?.id || null,
        ref_id: project.id,
      });
    }

    const stockKindLabel: Record<string, string> = {
      writeoff: 'Списание',
      surplus: 'Оприходование излишков',
      regrade: 'Пересортица',
      disassemble: 'Разукомплектация',
      assemble: 'Комплектация',
      transfer: 'Перемещение',
    };
    const stockDocNos = new Set<string>();
    try {
      for (const doc of db.prepare(`SELECT d.*, p.doc_no AS parent_doc_no, p.doc_type AS parent_doc_type,
        (SELECT COUNT(*) FROM document_lines dl WHERE dl.document_id = d.id) AS lines
        FROM documents d
        LEFT JOIN documents p ON p.id = d.parent_id
        WHERE d.doc_type IN ('writeoff','surplus','regrade','disassemble','assemble','transfer')
        ORDER BY d.id DESC`).all() as any[]) {
        stockDocNos.add(String(doc.doc_no));
        const date = doc.posted_at || doc.doc_date;
        if (!inRange(date)) continue;
        rows.push({
          id: String(doc.id),
          kind: doc.doc_type,
          kind_label: stockKindLabel[doc.doc_type] || doc.doc_type,
          number: doc.doc_no,
          date,
          status: docStatusRu[doc.status] || doc.status,
          doc_status: doc.status,
          party: doc.party || 'Склад',
          amount: null,
          lines: Number(doc.lines || 0),
          note: doc.note || '',
          author: doc.author || doc.posted_by || '',
          parent_id: doc.parent_id || null,
          parent_number: doc.parent_doc_no || null,
          parent_kind: doc.parent_doc_type || null,
          document_id: doc.id,
        });
      }
    } catch { /* schema may lag */ }

    for (const move of db.prepare(`SELECT document_ref, MIN(timestamp) AS date, MAX(source) AS source, MAX(reason) AS reason,
      COUNT(*) AS lines, SUM(quantity) AS qty, GROUP_CONCAT(DISTINCT comment) AS note
      FROM transactions WHERE reversed_at IS NULL AND document_ref IS NOT NULL AND TRIM(document_ref) != ''
      GROUP BY document_ref ORDER BY date DESC LIMIT 200`).all() as any[]) {
      if (!inRange(move.date)) continue;
      if (stockDocNos.has(String(move.document_ref))) continue;
      rows.push({
        id: String(move.document_ref), kind: 'movement', kind_label: 'Складское движение',
        number: move.document_ref, date: move.date,
        status: move.reason || move.source || '—',
        party: 'Склад', amount: null, lines: Number(move.lines || 0),
        note: String(move.note || '').split(',')[0] || '',
      });
    }

    rows.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    return rows;
  });

  ipcMain.handle('documents:listPrintForms', (_e, kind: string) => {
    registry.requireSession();
    let printCfg: any = { docsAct: true, docsWaybill: true, docsReceipt: true, docsWorkOrder: true };
    try {
      const raw = (getDb().prepare("SELECT value FROM schema_meta WHERE key = ?").get('setting:print.forms') as any)?.value;
      if (raw) printCfg = { ...printCfg, ...JSON.parse(raw) };
    } catch { /* defaults */ }
    return formsForKind(String(kind || '')).filter((f) => {
      if (f.id === 'gost-act' && printCfg.docsAct === false) return false;
      if (f.id === 'gost-waybill' && printCfg.docsWaybill === false) return false;
      if (f.id === 'gost-order' && printCfg.docsWorkOrder === false) return false;
      if (f.id === 'gost-inventory' && printCfg.docsAct === false) return false;
      return true;
    }).map((f) => ({
      id: f.id,
      label: f.label,
      hint: f.hint,
      isDefault: f.id === defaultFormForKind(String(kind || '')),
    }));
  });

  ipcMain.handle('documents:print', async (_e, kind: string, id: string, formId?: string) => {
    registry.requireSession();
    const db = getDb();
    const generatedAt = new Date().toLocaleString('ru-RU');
    const org = (registry.getSession()?.organization || {}) as OrgPrintInfo;
    const resolvedKind = String(kind || '');
    let printCfg: any = { docsAct: true, docsWaybill: true, docsReceipt: true, docsWorkOrder: true };
    try {
      const raw = (db.prepare("SELECT value FROM schema_meta WHERE key = ?").get('setting:print.forms') as any)?.value;
      if (raw) printCfg = { ...printCfg, ...JSON.parse(raw) };
    } catch { /* defaults */ }

    const allowed = formsForKind(resolvedKind).filter((f) => {
      if (f.id === 'gost-act' && printCfg.docsAct === false) return false;
      if (f.id === 'gost-waybill' && printCfg.docsWaybill === false) return false;
      if (f.id === 'gost-order' && printCfg.docsWorkOrder === false) return false;
      if (f.id === 'gost-inventory' && printCfg.docsAct === false) return false;
      return true;
    });
    const requested = String(formId || '') as PrintFormId;
    const form: PrintFormId = (allowed.find((f) => f.id === requested)?.id
      || allowed.find((f) => f.id === defaultFormForKind(resolvedKind))?.id
      || allowed[0]?.id
      || 'simple') as PrintFormId;

    const statusRu: Record<string, string> = { draft: 'Черновик', posted: 'Проведён', cancelled: 'Отменён' };
    const roleRu: Record<string, string> = {
      main: 'Строка', source: 'Источник', target: 'Приёмник', component: 'Компонент',
    };
    const stockPrintLabels: Record<string, string> = {
      writeoff: 'Акт списания',
      surplus: 'Акт оприходования излишков',
      regrade: 'Акт пересортицы',
      disassemble: 'Акт разукомплектации',
      assemble: 'Акт комплектации',
      transfer: 'Накладная на перемещение',
    };
    const stockOkud: Record<string, string> = {
      writeoff: '0315006', surplus: '0315008', regrade: '0315007',
      disassemble: '0315009', assemble: '0315010', transfer: '0315006',
    };

    function finish(model: PrintDocModel, fileBase: string) {
      const html = renderPrintDocument(org, form, model);
      return savePdfHtml(html, fileBase);
    }

    if (resolvedKind === 'po') {
      const po = db.prepare(`SELECT po.*, s.name AS supplier_name FROM purchase_orders po LEFT JOIN suppliers s ON s.id = po.supplier_id WHERE po.id = ?`).get(Number(id)) as any;
      if (!po) throw new Error('Заказ не найден');
      const lines = db.prepare(`SELECT poi.*, i.name, i.sku, i.barcode, u.symbol AS unit_symbol, u.code AS unit_code
        FROM purchase_order_items poi JOIN items i ON i.id = poi.item_id
        LEFT JOIN units u ON u.id = i.unit_id
        WHERE poi.purchase_order_id = ?`).all(Number(id)) as any[];
      const total = lines.reduce((s, line) => s + Number(line.quantity || 0) * Number(line.unit_price || 0), 0);
      return finish({
        title: form === 'gost-order' ? 'Заказ поставщику' : `Заказ поставщику ${po.order_no || id}`,
        subtitle: form === 'gost-order' ? `№ ${po.order_no || id}` : undefined,
        formCode: 'ЗП-1',
        okud: form === 'gost-order' ? '—' : undefined,
        meta: [
          { label: 'Номер', value: String(po.order_no || id) },
          { label: 'Поставщик', value: po.supplier_name || '—' },
          { label: 'Статус', value: String(po.status || '—') },
          { label: 'Ожидаемая дата', value: String(po.expected_at || '—') },
          { label: 'Сумма по плану', value: `${total.toLocaleString('ru-RU')} ₽` },
        ],
        columns: [
          { key: 'name', title: 'Товар' },
          { key: 'sku', title: 'Артикул' },
          { key: 'unit', title: 'Ед.', align: 'center' },
          { key: 'okei', title: 'ОКЕИ', align: 'center' },
          { key: 'qty', title: 'Кол-во', align: 'right' },
          { key: 'price', title: 'Цена', align: 'right' },
          { key: 'sum', title: 'Сумма', align: 'right' },
        ],
        rows: lines.map((line) => {
          const sum = Number(line.quantity || 0) * Number(line.unit_price || 0);
          return {
            name: line.name,
            sku: line.sku || '—',
            unit: line.unit_symbol || 'шт',
            okei: line.unit_code || '—',
            qty: line.quantity,
            price: line.unit_price ?? '—',
            sum: sum.toLocaleString('ru-RU'),
          };
        }),
        note: po.note || '',
        signs: [
          { role: 'Руководитель', hint: 'подпись / ФИО' },
          { role: 'Снабжение', hint: 'подпись / ФИО' },
          { role: 'Поставщик', hint: 'подпись / ФИО' },
        ],
        generatedAt,
      }, po.order_no || `po-${id}`);
    }

    if (resolvedKind === 'revision') {
      const session = db.prepare(`SELECT s.*, l.name AS location_name FROM inventory_sessions s LEFT JOIN locations l ON l.id = s.location_id WHERE s.id = ?`).get(Number(id)) as any;
      if (!session) throw new Error('Ревизия не найдена');
      const revDoc = db.prepare(`SELECT doc_no FROM documents WHERE doc_type = 'revision' AND ref_table = 'inventory_sessions' AND ref_id = ?`)
        .get(Number(id)) as any;
      const revNo = revDoc?.doc_no || `REV-${id}`;
      const lines = db.prepare(`SELECT c.*, i.name, i.barcode, i.sku, u.symbol AS unit_symbol, u.code AS unit_code,
        COALESCE(inv.quantity, 0) AS base_quantity
        FROM inventory_counts c JOIN items i ON i.id = c.item_id
        LEFT JOIN units u ON u.id = i.unit_id
        LEFT JOIN inventory inv ON inv.item_id = c.item_id AND inv.location_id = ?
        WHERE c.session_id = ?`).all(session.location_id, Number(id)) as any[];
      const isInv = form === 'gost-inventory';
      return finish({
        title: isInv ? 'Инвентаризационная опись товарно-материальных ценностей' : `Акт ревизии ${revNo}`,
        subtitle: isInv ? `№ ${revNo}` : undefined,
        formCode: isInv ? 'ИНВ-3' : 'МХ-1',
        okud: isInv ? '0317003' : undefined,
        meta: [
          { label: 'Номер', value: revNo },
          { label: 'Место хранения', value: session.location_name || '—' },
          { label: 'Статус', value: String(session.status || '—') },
        ],
        columns: isInv
          ? [
            { key: 'name', title: 'Наименование' },
            { key: 'sku', title: 'Номенклатурный №' },
            { key: 'unit', title: 'Ед.', align: 'center' },
            { key: 'okei', title: 'ОКЕИ', align: 'center' },
            { key: 'book', title: 'По учёту', align: 'right' },
            { key: 'fact', title: 'Фактически', align: 'right' },
            { key: 'diff', title: 'Отклонение', align: 'right' },
          ]
          : [
            { key: 'name', title: 'Товар' },
            { key: 'barcode', title: 'Штрихкод' },
            { key: 'unit', title: 'Ед.', align: 'center' },
            { key: 'book', title: 'Учёт', align: 'right' },
            { key: 'fact', title: 'Факт', align: 'right' },
            { key: 'diff', title: 'Разница', align: 'right' },
          ],
        rows: lines.map((line) => {
          const diff = Number(line.counted_quantity || 0) - Number(line.base_quantity || 0);
          return {
            name: line.name,
            sku: line.sku || '—',
            barcode: line.barcode || '—',
            unit: line.unit_symbol || 'шт',
            okei: line.unit_code || '—',
            book: line.base_quantity,
            fact: line.counted_quantity,
            diff: `${diff > 0 ? '+' : ''}${diff}`,
          };
        }),
        signs: [
          { role: 'Председатель комиссии', hint: 'подпись / ФИО' },
          { role: 'Член комиссии', hint: 'подпись / ФИО' },
          { role: 'МОЛ / кладовщик', hint: 'подпись / ФИО' },
        ],
        generatedAt,
      }, revNo);
    }

    if (resolvedKind === 'project') {
      const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(Number(id)) as any;
      if (!project) throw new Error('Заказ-наряд не найден');
      const rows = db.prepare(`SELECT pi.quantity AS per_unit, pi.quantity * p.build_quantity AS required, i.name, i.print_name, i.barcode, u.symbol AS unit_symbol
        FROM project_items pi JOIN projects p ON p.id = pi.project_id JOIN items i ON i.id = pi.item_id LEFT JOIN units u ON u.id = i.unit_id
        WHERE p.id = ?`).all(Number(id)) as any[];
      return finish({
        title: form === 'gost-order' ? 'Заказ-наряд (производственное задание)' : `Заказ-наряд ${project.order_no || id}`,
        subtitle: form === 'gost-order' ? `№ ${project.order_no || id}` : undefined,
        formCode: 'ЗН-1',
        meta: [
          { label: 'Номер', value: String(project.order_no || id) },
          { label: 'Изделие', value: project.target_name || project.name || '—' },
          { label: 'Тираж', value: String(project.build_quantity ?? '—') },
          { label: 'Срок', value: String(project.due_date || '—') },
          { label: 'Статус', value: String(project.status || '—') },
        ],
        columns: [
          { key: 'name', title: 'Компонент' },
          { key: 'barcode', title: 'Штрихкод' },
          { key: 'per', title: 'На изд.', align: 'right' },
          { key: 'req', title: 'Всего', align: 'right' },
          { key: 'unit', title: 'Ед.', align: 'center' },
        ],
        rows: rows.map((row) => ({
          name: row.print_name || row.name,
          barcode: row.barcode || '—',
          per: row.per_unit,
          req: row.required,
          unit: row.unit_symbol || 'шт.',
        })),
        note: project.description || '',
        signs: [
          { role: 'Мастер', hint: 'подпись / ФИО' },
          { role: 'Кладовщик', hint: 'подпись / ФИО' },
          { role: 'Исполнитель', hint: 'подпись / ФИО' },
        ],
        generatedAt,
      }, project.order_no || `wo-${id}`);
    }

    if (resolvedKind === 'movement') {
      const lines = db.prepare(`SELECT t.*, i.name, i.barcode, l.name AS location_name
        FROM transactions t JOIN items i ON i.id = t.item_id LEFT JOIN locations l ON l.id = t.location_id
        WHERE t.reversed_at IS NULL AND t.document_ref = ? ORDER BY t.timestamp`).all(String(id)) as any[];
      if (!lines.length) throw new Error('Движения не найдены');
      return finish({
        title: `Складское движение ${id}`,
        formCode: 'М-11',
        okud: '0315006',
        meta: [
          { label: 'Документ-основание', value: String(id) },
          { label: 'Строк', value: String(lines.length) },
        ],
        columns: [
          { key: 'ts', title: 'Время' },
          { key: 'name', title: 'Товар' },
          { key: 'type', title: 'Тип', align: 'center' },
          { key: 'qty', title: 'Кол-во', align: 'right' },
          { key: 'loc', title: 'Адрес' },
          { key: 'comment', title: 'Комментарий' },
        ],
        rows: lines.map((line) => ({
          ts: line.timestamp,
          name: line.name,
          type: line.type,
          qty: line.quantity,
          loc: line.location_name || '—',
          comment: line.comment || '',
        })),
        generatedAt,
      }, String(id));
    }

    if (stockPrintLabels[resolvedKind]) {
      const doc = db.prepare(`SELECT d.*, l.name AS location_name, p.doc_no AS parent_doc_no, p.doc_type AS parent_doc_type
        FROM documents d
        LEFT JOIN locations l ON l.id = d.ref_id AND d.ref_table = 'locations'
        LEFT JOIN documents p ON p.id = d.parent_id
        WHERE d.id = ? OR (d.doc_type = ? AND d.doc_no = ?)`).get(Number(id), resolvedKind, String(id)) as any;
      if (!doc || doc.doc_type !== resolvedKind) throw new Error('Складской акт не найден');
      const linesFixed = db.prepare(`SELECT dl.*, i.name, i.sku, i.barcode,
        u.symbol AS unit_symbol, u.code AS unit_code, u.name AS unit_name,
        ci.name AS counterpart_name,
        fl.name AS from_location_name
        FROM document_lines dl
        JOIN items i ON i.id = dl.item_id
        LEFT JOIN units u ON u.id = i.unit_id
        LEFT JOIN items ci ON ci.id = dl.counterpart_item_id
        LEFT JOIN locations fl ON fl.id = dl.location_id
        WHERE dl.document_id = ?
        ORDER BY dl.id`).all(doc.id) as any[];
      const isTransfer = resolvedKind === 'transfer';
      const isWaybill = form === 'gost-waybill' || (isTransfer && form !== 'gost-act');
      const partyParts = String(doc.party || '').split('→').map((s: string) => s.trim());
      const fromName = partyParts[0] || linesFixed[0]?.from_location_name || '—';
      const toName = partyParts[1] || doc.location_name || '—';
      return finish({
        title: isTransfer
          ? (form === 'gost-act' ? `Требование-накладная ${doc.doc_no}` : `Накладная на внутреннее перемещение ${doc.doc_no}`)
          : (isWaybill ? `Накладная ${doc.doc_no}` : `${stockPrintLabels[resolvedKind]} ${doc.doc_no}`),
        subtitle: isTransfer
          ? `${fromName} → ${toName}`
          : (isWaybill ? stockPrintLabels[resolvedKind] : undefined),
        formCode: isTransfer ? (form === 'gost-act' ? 'М-11' : 'М-15') : (isWaybill ? 'М-15' : 'М-11'),
        okud: isTransfer ? (form === 'gost-act' ? '0315006' : '0315007') : (stockOkud[resolvedKind] || '0315006'),
        meta: [
          { label: 'Номер', value: String(doc.doc_no) },
          ...(isTransfer
            ? [
              { label: 'Отправитель (откуда)', value: fromName },
              { label: 'Получатель (куда)', value: toName },
            ]
            : [{ label: 'Адрес / склад', value: doc.location_name || doc.party || '—' }]),
          { label: 'Статус', value: statusRu[doc.status] || doc.status },
          { label: 'Дата', value: String(doc.doc_date || '—') },
          { label: 'Автор', value: doc.author || doc.posted_by || '—' },
          ...(doc.parent_doc_no ? [{ label: 'Основание', value: `${doc.parent_doc_no}${doc.parent_doc_type ? ` (${doc.parent_doc_type})` : ''}` }] : []),
        ],
        columns: isTransfer
          ? [
            { key: 'name', title: 'Наименование' },
            { key: 'sku', title: 'Номенклатурный №' },
            { key: 'unit', title: 'Ед.', align: 'center', width: '12mm' },
            { key: 'okei', title: 'ОКЕИ', align: 'center', width: '14mm' },
            { key: 'qty', title: 'Количество', align: 'right', width: '22mm' },
            { key: 'note', title: 'Примечание' },
          ]
          : [
            { key: 'name', title: 'Товар' },
            { key: 'sku', title: 'Артикул' },
            { key: 'barcode', title: 'Штрихкод' },
            { key: 'unit', title: 'Ед.', align: 'center' },
            { key: 'okei', title: 'ОКЕИ', align: 'center' },
            { key: 'role', title: 'Роль', align: 'center' },
            { key: 'qty', title: 'Кол-во', align: 'right' },
            { key: 'pair', title: 'Пара' },
          ],
        rows: linesFixed.map((line) => ({
          name: line.name,
          sku: line.sku || '—',
          barcode: line.barcode || '—',
          unit: line.unit_symbol || 'шт',
          okei: line.unit_code || '—',
          role: roleRu[line.line_role] || line.line_role || '—',
          qty: line.quantity,
          pair: line.counterpart_name || '—',
          note: line.note || '',
        })),
        note: doc.note || '',
        signs: isTransfer
          ? [
            { role: 'Отпустил', hint: 'подпись / ФИО' },
            { role: 'Получил', hint: 'подпись / ФИО' },
            { role: 'Бухгалтер', hint: 'подпись / ФИО' },
          ]
          : undefined,
        generatedAt,
      }, doc.doc_no || `${resolvedKind}-${id}`);
    }

    if (resolvedKind === 'org-card') {
      const esc = (value: any) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
      }[char] || char));
      const head = orgLetterheadHtml();
      const html = `<!doctype html><html><head><meta charset="utf-8"><style>${printCss}
        .card-grid{display:grid;grid-template-columns:180px 1fr;gap:8px 16px;margin-top:18px;font-size:13px}
        .card-grid b{color:#5f6368;font-weight:600}
      </style></head><body>
        ${head}<h1>Карточка организации</h1>
        <div class="meta">Сформировано: ${esc(generatedAt)}</div>
        <div class="card-grid">
          <b>Название</b><div>${esc(org.name)}</div>
          <b>Код</b><div>${esc(org.code || '—')}</div>
          <b>Юр. название</b><div>${esc(org.legal_name || '—')}</div>
          <b>Адрес</b><div>${esc(org.address || '—')}</div>
          <b>Юр. адрес</b><div>${esc(org.legal_address || '—')}</div>
          <b>ИНН / КПП</b><div>${esc([org.inn, org.kpp].filter(Boolean).join(' / ') || '—')}</div>
          <b>Телефон</b><div>${esc(org.phone || '—')}</div>
          <b>Email</b><div>${esc(org.email || '—')}</div>
          <b>Банк</b><div>${esc((org as any).bank_details || '—')}</div>
        </div>
        <div class="footer"><span></span><span>Метрика 0.5</span></div>
      </body></html>`;
      return savePdfHtml(html, org.code || 'organization');
    }

    throw new Error('Неизвестный вид документа');
  });


  const CATEGORY_DEFAULT_KEYS = [
    'default_min_stock', 'default_max_stock', 'default_reorder_point', 'default_brand',
    'default_track_serials', 'default_track_lots', 'default_lot_policy',
    'default_price_basis', 'default_package_qty', 'default_unit_id', 'default_storage_note',
  ] as const;

  function resolveCategoryTemplate(db: ReturnType<typeof getDb>, categoryId: number) {
    const result: Record<string, any> = {};
    let id: number | null = categoryId;
    const seen = new Set<number>();
    while (id && !seen.has(id)) {
      seen.add(id);
      const row = db.prepare('SELECT * FROM categories WHERE id = ?').get(id) as any;
      if (!row) break;
      for (const key of CATEGORY_DEFAULT_KEYS) {
        if (result[key] == null && row[key] != null && row[key] !== '') result[key] = row[key];
      }
      id = row.parent_id ? Number(row.parent_id) : null;
    }
    return result;
  }

  const ITEM_FIELD_FROM_DEFAULT: Record<string, string> = {
    default_min_stock: 'min_stock',
    default_max_stock: 'max_stock',
    default_reorder_point: 'reorder_point',
    default_brand: 'brand',
    default_track_serials: 'track_serials',
    default_track_lots: 'track_lots',
    default_lot_policy: 'lot_policy',
    default_price_basis: 'price_basis',
    default_package_qty: 'package_qty',
    default_unit_id: 'unit_id',
    default_storage_note: 'storage_note',
  };

  function isItemFieldEmpty(item: any, field: string): boolean {
    const value = item?.[field];
    if (field === 'min_stock') return value == null || Number(value) === 0;
    if (field === 'track_serials' || field === 'track_lots') return !Number(value);
    if (field === 'price_basis') return !value || value === 'unit';
    if (field === 'lot_policy') return !value || value === 'fifo';
    return value == null || value === '';
  }

  function demandMetricsFromUsage(used90d: number, used30d: number, usedPrev30d: number) {
    const averageDaily = Number(used90d || 0) / 90;
    const recentDaily = Number(used30d || 0) / 30;
    const prevDaily = Number(usedPrev30d || 0) / 30;
    const trendPct = prevDaily > 0
      ? Math.round(((recentDaily - prevDaily) / prevDaily) * 100)
      : (recentDaily > 0 ? 100 : 0);
    const seasonalFactor = averageDaily > 0 ? Math.min(1.5, Math.max(0.7, recentDaily / averageDaily)) : 1;
    const effectiveDaily = averageDaily * seasonalFactor;
    return {
      average_daily: Math.round(averageDaily * 100) / 100,
      recent_daily: Math.round(recentDaily * 100) / 100,
      trend_pct: trendPct,
      seasonal_factor: Math.round(seasonalFactor * 100) / 100,
      effective_daily: Math.round(effectiveDaily * 1000) / 1000,
    };
  }

  ipcMain.handle('analytics:itemDemand', (_e, itemId: number, opts: { days?: number; horizonDays?: number; leadDays?: number; safetyDays?: number } = {}) => {
    registry.requireSession();
    const db = getDb();
    const id = Number(itemId);
    const item = db.prepare(`SELECT id, name, sku, barcode, min_stock, max_stock, reorder_point, lead_time_days, package_qty, price_basis, cost_price,
      COALESCE((SELECT SUM(inv.quantity) FROM inventory inv WHERE inv.item_id = i.id), 0) AS on_hand,
      COALESCE((SELECT SUM(pr.quantity) FROM project_reservations pr JOIN projects p ON p.id = pr.project_id WHERE pr.item_id = i.id AND p.status IN ('reserved','picking','picked','assembly')), 0) AS reserved
      FROM items i WHERE i.id = ?`).get(id) as any;
    if (!item) throw new Error('Товар не найден');

    const seriesDays = Math.min(180, Math.max(14, Number(opts?.days) || 90));
    const horizon = Math.min(180, Math.max(7, Number(opts?.horizonDays) || 30));
    const lead = Math.min(90, Math.max(1, Number(opts?.leadDays) || Number(item.lead_time_days) || 14));
    const safety = Math.min(60, Math.max(0, Number(opts?.safetyDays) || 7));

    const usage = db.prepare(`SELECT
      COALESCE((SELECT SUM(t.quantity) FROM transactions t WHERE t.item_id = ? AND t.type = 'out' AND t.reversed_at IS NULL AND t.timestamp >= datetime('now', '-90 days')), 0) AS used_90d,
      COALESCE((SELECT SUM(t.quantity) FROM transactions t WHERE t.item_id = ? AND t.type = 'out' AND t.reversed_at IS NULL AND t.timestamp >= datetime('now', '-30 days')), 0) AS used_30d,
      COALESCE((SELECT SUM(t.quantity) FROM transactions t WHERE t.item_id = ? AND t.type = 'out' AND t.reversed_at IS NULL AND t.timestamp >= datetime('now', '-60 days') AND t.timestamp < datetime('now', '-30 days')), 0) AS used_prev_30d
    `).get(id, id, id) as any;

    const metrics = demandMetricsFromUsage(usage.used_90d, usage.used_30d, usage.used_prev_30d);
    const available = Math.max(0, Number(item.on_hand) - Number(item.reserved));
    const coverageDays = metrics.effective_daily > 0 ? Math.floor(available / metrics.effective_daily) : null;
    const forecastQty = Math.round(metrics.effective_daily * horizon * 100) / 100;
    const targetStock = Math.max(
      Number(item.min_stock) || 0,
      Number(item.reorder_point) || 0,
      Math.ceil(metrics.effective_daily * (lead + safety)),
    );
    let runoutDate: string | null = null;
    if (coverageDays != null && coverageDays < 3650) {
      const d = new Date();
      d.setDate(d.getDate() + coverageDays);
      runoutDate = d.toISOString().slice(0, 10);
    }

    const daily = db.prepare(`SELECT date(timestamp) AS day, SUM(quantity) AS qty
      FROM transactions
      WHERE item_id = ? AND type = 'out' AND reversed_at IS NULL
        AND timestamp >= datetime('now', ?)
      GROUP BY date(timestamp)
      ORDER BY day`).all(id, `-${seriesDays} days`) as any[];

    const byDay = new Map(daily.map((row) => [String(row.day), Number(row.qty) || 0]));
    const series: Array<{ day: string; qty: number }> = [];
    const cursor = new Date();
    cursor.setHours(12, 0, 0, 0);
    cursor.setDate(cursor.getDate() - (seriesDays - 1));
    for (let i = 0; i < seriesDays; i += 1) {
      const key = cursor.toISOString().slice(0, 10);
      series.push({ day: key, qty: byDay.get(key) || 0 });
      cursor.setDate(cursor.getDate() + 1);
    }

    return {
      item_id: id,
      name: item.name,
      sku: item.sku,
      barcode: item.barcode,
      on_hand: Number(item.on_hand) || 0,
      reserved: Number(item.reserved) || 0,
      available,
      ...metrics,
      forecast_horizon_days: horizon,
      forecast_qty: forecastQty,
      coverage_days: coverageDays,
      runout_date: runoutDate,
      target_stock: targetStock,
      lead_days: lead,
      safety_days: safety,
      series_days: seriesDays,
      daily: series,
    };
  });

  ipcMain.handle('catalog:nextCode', (_e, source?: string) => {
    registry.requireSession();
    const kind = ['categories', 'items', 'suppliers', 'locations'].includes(String(source || ''))
      ? String(source) as 'categories' | 'items' | 'suppliers' | 'locations'
      : 'categories';
    return { code: nextCatalogCode(kind) };
  });

  ipcMain.handle('categories:applyDefaults', (_e, id: number, opts: { mode?: 'empty' | 'all'; fields?: string[] } = {}) => {
    requirePerm('categories_edit');
    requirePerm('items_edit');
    const db = getDb();
    const category = db.prepare('SELECT * FROM categories WHERE id = ?').get(Number(id)) as any;
    if (!category) throw new Error('Категория не найдена');
    const template = resolveCategoryTemplate(db, Number(id));
    const mode = opts?.mode === 'all' ? 'all' : 'empty';
    const allowedDefaults = opts?.fields?.length
      ? CATEGORY_DEFAULT_KEYS.filter((key) => opts.fields!.includes(key) || opts.fields!.includes(ITEM_FIELD_FROM_DEFAULT[key]))
      : [...CATEGORY_DEFAULT_KEYS];
    const active = allowedDefaults.filter((key) => template[key] != null && template[key] !== '');
    if (!active.length) throw new Error('В шаблоне категории нет значений для применения');

    const items = db.prepare('SELECT * FROM items WHERE category = ?').all(category.name) as any[];
    if (!items.length) return { updated: 0, skipped: 0, total: 0 };

    const applyOne = db.transaction((item: any) => {
      const sets: string[] = [];
      const params: any[] = [];
      for (const defKey of active) {
        const field = ITEM_FIELD_FROM_DEFAULT[defKey];
        if (!field) continue;
        if (mode === 'empty' && !isItemFieldEmpty(item, field)) continue;
        sets.push(`${field} = ?`);
        params.push(template[defKey]);
      }
      if (!sets.length) return false;
      db.prepare(`UPDATE items SET ${sets.join(', ')} WHERE id = ?`).run(...params, item.id);
      return true;
    });

    let updated = 0;
    let skipped = 0;
    for (const item of items) {
      if (applyOne(item)) updated += 1;
      else skipped += 1;
    }
    audit('category.applyDefaults', 'category', id, `${category.name}: ${updated} обновлено, ${skipped} пропущено (${mode})`);
    return { updated, skipped, total: items.length, mode };
  });





















  ipcMain.handle('items:bulkUpdate', (_e, ids: number[], patch: any = {}) => {
    requirePerm('items_edit');
    const db = getDb();
    const list = (Array.isArray(ids) ? ids : []).map(Number).filter((id) => id > 0);
    if (!list.length) throw new Error('Выберите хотя бы один товар');
    if (list.length > 500) throw new Error('За раз не больше 500 позиций');

    const sets: string[] = [];
    const params: any[] = [];
    if (patch.category !== undefined) {
      sets.push('category = ?');
      params.push(String(patch.category || '').trim() || null);
    }
    if (patch.brand !== undefined) {
      sets.push('brand = ?');
      params.push(String(patch.brand || '').trim() || null);
    }
    if (patch.min_stock !== undefined && patch.min_stock !== '') {
      sets.push('min_stock = ?');
      params.push(Math.max(0, Number(patch.min_stock) || 0));
    }
    if (patch.max_stock !== undefined) {
      if (patch.max_stock === '' || patch.max_stock == null) {
        sets.push('max_stock = NULL');
      } else {
        sets.push('max_stock = ?');
        params.push(Math.max(0, Number(patch.max_stock) || 0));
      }
    }
    if (patch.reorder_point !== undefined) {
      if (patch.reorder_point === '' || patch.reorder_point == null) {
        sets.push('reorder_point = NULL');
      } else {
        sets.push('reorder_point = ?');
        params.push(Math.max(0, Number(patch.reorder_point) || 0));
      }
    }
    if (!sets.length) throw new Error('Нечего менять — укажите хотя бы одно поле');

    const placeholders = list.map(() => '?').join(',');
    const apply = db.transaction(() => {
      const result = db.prepare(`UPDATE items SET ${sets.join(', ')} WHERE id IN (${placeholders})`).run(...params, ...list);
      return Number(result.changes || 0);
    });
    const updated = apply();
    audit('item.bulkUpdate', 'item', null, `${updated} поз. · ${sets.join(', ')}`);
    return { updated, ids: list };
  });

  ipcMain.handle('items:copyBomVersion', (_e, kitItemId: number, fromVersionId: number, code?: string, name?: string) => {
    requirePerm('items_edit');
    return copyBomVersion(Number(kitItemId), Number(fromVersionId), code, name);
  });

  ipcMain.handle('items:createPackFromItem', (_e, componentId: number, data: any = {}) => {
    requirePerm('items_create');
    try {
      const created = createPackFromItem(Number(componentId), {
        quantity: data.quantity,
        sale_price: data.sale_price === '' || data.sale_price == null ? null : Number(data.sale_price),
        cost_price: data.cost_price === '' || data.cost_price == null ? undefined : Number(data.cost_price),
        name: data.name,
        sku: data.sku,
        item_type: data.item_type,
      });
      audit('item.packCreate', 'item', Number(created.id), `${created.item_type} ← #${componentId} ×${data.quantity}`);
      return created;
    } catch (error) {
      throw mapDbError(error);
    }
  });

  ipcMain.handle('items:createVariant', (_e, parentId: number, data: any = {}) => {
    requirePerm('items_create');
    try {
      const created = createItemVariant(Number(parentId), {
        variant_label: data.variant_label,
        sku: data.sku,
        barcode: data.barcode,
        sale_price: data.sale_price === '' || data.sale_price == null ? undefined : Number(data.sale_price),
        cost_price: data.cost_price === '' || data.cost_price == null ? undefined : Number(data.cost_price),
      });
      audit('item.variantCreate', 'item', Number(created.id), `${created.variant_label} ← #${parentId}`);
      return created;
    } catch (error) {
      throw mapDbError(error);
    }
  });

  ipcMain.handle('items:deleteBomVersion', (_e, kitItemId: number, versionId: number) => {
    requirePerm('items_edit');
    return deleteBomVersion(Number(kitItemId), Number(versionId));
  });

  ipcMain.handle('items:deleteTechOperation', (_e, id: number) => {
    requirePerm('items_edit');
    return deleteTechOperation(Number(id));
  });

  ipcMain.handle('items:idsByCustomField', (_e, filter: {
    fieldKey?: string;
    fieldId?: number;
    value?: string;
    mode?: 'eq' | 'contains' | 'filled' | 'empty' | 'gt' | 'lt';
  } = {}) => {
    registry.requireSession();
    const db = getDb();
    const mode = ['eq', 'contains', 'filled', 'empty', 'gt', 'lt'].includes(String(filter?.mode || ''))
      ? String(filter.mode)
      : 'eq';
    let def: any = null;
    if (filter?.fieldId) def = db.prepare('SELECT * FROM custom_field_defs WHERE id = ? AND entity = ? AND COALESCE(archived,0)=0').get(Number(filter.fieldId), 'item');
    else if (filter?.fieldKey) {
      def = db.prepare('SELECT * FROM custom_field_defs WHERE field_key = ? AND entity = ? AND COALESCE(archived,0)=0')
        .get(String(filter.fieldKey).trim(), 'item');
    }
    if (!def) throw new Error('Доп. поле не найдено');
    const fieldId = Number(def.id);
    const raw = filter?.value == null ? '' : String(filter.value).trim();

    let ids: number[] = [];
    if (mode === 'filled') {
      ids = (db.prepare(`SELECT item_id FROM item_custom_values
        WHERE field_id = ? AND value_text IS NOT NULL AND TRIM(value_text) != ''`).all(fieldId) as any[]).map((r) => Number(r.item_id));
    } else if (mode === 'empty') {
      ids = (db.prepare(`SELECT i.id AS item_id FROM items i
        WHERE NOT EXISTS (
          SELECT 1 FROM item_custom_values v
          WHERE v.item_id = i.id AND v.field_id = ? AND v.value_text IS NOT NULL AND TRIM(v.value_text) != ''
        )`).all(fieldId) as any[]).map((r) => Number(r.item_id));
    } else if (mode === 'contains') {
      if (!raw) return { ids: [], field: def, mode };
      ids = (db.prepare(`SELECT item_id FROM item_custom_values
        WHERE field_id = ? AND INSTR(lower(COALESCE(value_text,'')), lower(?)) > 0`).all(fieldId, raw) as any[])
        .map((r) => Number(r.item_id));
    } else if (mode === 'gt' || mode === 'lt') {
      const n = Number(String(raw).replace(',', '.'));
      if (!Number.isFinite(n)) throw new Error('Для сравнения нужно число');
      const op = mode === 'gt' ? '>' : '<';
      ids = (db.prepare(`SELECT item_id FROM item_custom_values
        WHERE field_id = ? AND TRIM(COALESCE(value_text,'')) != ''
          AND CAST(replace(value_text, ',', '.') AS REAL) ${op} ?`).all(fieldId, n) as any[])
        .map((r) => Number(r.item_id));
    } else {

      if (def.field_type === 'bool') {
        const bit = raw === '1' || raw === 'true' || raw === 'да' || raw === 'on' ? '1' : '0';
        ids = (db.prepare(`SELECT item_id FROM item_custom_values WHERE field_id = ? AND value_text = ?`).all(fieldId, bit) as any[])
          .map((r) => Number(r.item_id));
      } else {
        if (!raw) return { ids: [], field: def, mode };
        ids = (db.prepare(`SELECT item_id FROM item_custom_values
          WHERE field_id = ? AND lower(TRIM(value_text)) = lower(?)`).all(fieldId, raw) as any[])
          .map((r) => Number(r.item_id));
      }
    }
    return { ids: [...new Set(ids)], field: def, mode, value: raw };
  });

  ipcMain.handle('items:listBomVersions', (_e, kitItemId: number) => {
    registry.requireSession();
    return listBomVersions(Number(kitItemId));
  });

  ipcMain.handle('items:listLotsAtLocation', (_e, itemId: number, locationId: number) => {
    registry.requireSession();
    return listLotsAtLocation(Number(itemId), Number(locationId));
  });

  ipcMain.handle('items:listParentKits', (_e, itemId: number) => {
    registry.requireSession();
    return listItemParentKits(Number(itemId));
  });

  ipcMain.handle('items:listSerials', (_e, itemId: number, status?: string) => {
    registry.requireSession();
    return listItemSerials(Number(itemId), status || null);
  });

  ipcMain.handle('items:listSerialsAtLocation', (_e, itemId: number, locationId: number) => {
    registry.requireSession();
    return listSerialsAtLocation(Number(itemId), Number(locationId));
  });

  ipcMain.handle('items:listTechOperations', (_e, kitItemId: number, bomVersionId?: number) => {
    registry.requireSession();
    return listTechOperations(Number(kitItemId), bomVersionId != null ? Number(bomVersionId) : undefined);
  });

  ipcMain.handle('items:listVariants', (_e, itemId: number) => {
    registry.requireSession();
    return listItemVariants(Number(itemId));
  });

  ipcMain.handle('items:printSerialLabels', async (event, itemId: number, serials?: string[] | string) => {
    const db = getDb();
    const item = db.prepare('SELECT i.*, u.symbol AS unit_symbol FROM items i LEFT JOIN units u ON u.id = i.unit_id WHERE i.id = ?').get(Number(itemId)) as any;
    if (!item) throw new Error('Товар не найден');
    if (!Number(item.track_serials)) throw new Error(`«${item.name}» не ведётся по серийным номерам`);

    let codes = parseSerialList(serials);
    if (!codes.length) {
      codes = listItemSerials(Number(itemId), 'in_stock').map((row: any) => String(row.serial_no || '').trim()).filter(Boolean);
    }
    if (!codes.length) throw new Error('Нет серийных номеров для печати (на остатке пусто)');
    if (codes.length > 200) throw new Error('Слишком много серий за раз (макс. 200). Укажите список явно.');

    let printCfg: any = {
      barcodeType: 'code128',
      labelWidthMm: 60,
      labelHeightMm: 40,
      showName: true,
      showSku: true,
      copies: 1,
    };
    try {
      const raw = (db.prepare("SELECT value FROM schema_meta WHERE key = ?").get('setting:print.forms') as any)?.value;
      if (raw) printCfg = { ...printCfg, ...JSON.parse(raw) };
    } catch {  }


    const preferQr = codes.some((c) => c.length > 24) || String(printCfg.barcodeType) === 'qrcode';
    const bcid = preferQr ? 'qrcode' : (['code128', 'code39', 'datamatrix'].includes(String(printCfg.barcodeType)) ? String(printCfg.barcodeType) : 'code128');
    const widthMm = Math.min(120, Math.max(20, Number(printCfg.labelWidthMm) || 60));
    const heightMm = Math.min(100, Math.max(15, Number(printCfg.labelHeightMm) || 40));
    const escape = (value: any) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] || char));
    const owner = BrowserWindow.fromWebContents(event.sender);

    const labels: string[] = [];
    for (const serial of codes) {
      let barcode: Buffer;
      try {
        barcode = await bwipjs.toBuffer({
          bcid,
          text: serial,
          scale: bcid === 'qrcode' || bcid === 'datamatrix' ? 4 : 3,
          height: bcid === 'qrcode' || bcid === 'datamatrix' ? undefined : 12,
          includetext: bcid !== 'qrcode' && bcid !== 'datamatrix',
          textxalign: 'center',
          paddingwidth: 4,
          paddingheight: 2,
        } as any);
      } catch (barcodeError: any) {
        throw new Error(`Не удалось построить код для «${serial}»: ${barcodeError?.message || 'ошибка генерации'}`);
      }
      const image = `data:image/png;base64,${barcode.toString('base64')}`;
      const meta = [
        printCfg.showSku !== false ? escape(item.sku || 'без SKU') : '',
        'S/N',
      ].filter(Boolean).join(' · ');
      labels.push(
        `<article class="label">${printCfg.showName !== false ? `<strong>${escape(item.print_name || item.name)}</strong>` : ''}${meta ? `<span>${meta}</span>` : ''}<img alt="" src="${image}" /><div class="sn">${escape(serial)}</div></article>`,
      );
    }

    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Этикетки S/N</title><style>
@page{size:${widthMm}mm ${heightMm}mm;margin:2mm}
*{box-sizing:border-box}
body{font-family:"Segoe UI",Arial,sans-serif;margin:0;color:#111}
.label{width:${Math.max(10, widthMm - 4)}mm;height:${Math.max(10, heightMm - 4)}mm;page-break-after:always;break-after:page;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1mm;overflow:hidden;padding:1mm}
.label:last-child{page-break-after:auto;break-after:auto}
.label strong{max-width:100%;font-size:8pt;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.label span,.label small{font-size:6.5pt;text-align:center}
.label .sn{font-size:9pt;font-weight:700;text-align:center;font-family:Consolas,"Courier New",monospace;max-width:100%;overflow:hidden;text-overflow:ellipsis}
.label img{max-width:${Math.max(10, widthMm - 8)}mm;max-height:${Math.max(8, heightMm - 16)}mm;object-fit:contain}
</style></head><body>${labels.join('')}</body></html>`;

    const tempDir = path.join(app.getPath('temp'), 'metrika-labels');
    fs.mkdirSync(tempDir, { recursive: true });
    const stamp = Date.now();
    const tempHtml = path.join(tempDir, `serial-labels-${itemId}-${stamp}.html`);
    const tempPdf = path.join(tempDir, `serial-labels-${itemId}-${stamp}.pdf`);
    fs.writeFileSync(tempHtml, html, 'utf8');

    const printWindow = new BrowserWindow({
      show: false,
      webPreferences: { sandbox: true, contextIsolation: true, offscreen: false },
    });
    try {
      await printWindow.loadFile(tempHtml);
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => resolve(), 1500);
        const fail = (_e: any, errorCode: number, errorDescription: string) => {
          clearTimeout(timer);
          reject(new Error(errorDescription || `Ошибка загрузки (${errorCode})`));
        };
        const ok = () => { clearTimeout(timer); resolve(); };
        if (!printWindow.webContents.isLoading()) { clearTimeout(timer); resolve(); return; }
        printWindow.webContents.once('did-finish-load', ok);
        printWindow.webContents.once('did-fail-load', fail);
      });

      const pdf = await printWindow.webContents.printToPDF({
        printBackground: true,
        pageSize: { width: widthMm * 1000, height: heightMm * 1000 },
        margins: { marginType: 'none' },
        preferCSSPageSize: true,
      });

      const safeName = String(item.sku || item.barcode || `item-${itemId}`).replace(/[<>:"/\\|?*]+/g, '_');
      const result = await dialog.showSaveDialog({
        title: 'Сохранить этикетки серий PDF',
        defaultPath: path.join(app.getPath('documents'), stampedFileName(`${safeName}-SN-labels`, 'pdf')),
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
        ...(owner ? { browserWindow: owner } as any : {}),
      });
      const target = (!result.canceled && result.filePath) ? result.filePath : tempPdf;
      fs.writeFileSync(target, pdf);
      await shell.openPath(target);
      audit('item.printSerialLabels', 'item', Number(itemId), `${codes.length} S/N`);
      return target;
    } catch (error: any) {
      throw new Error(error?.message || 'Не удалось сформировать этикетки серий');
    } finally {
      if (!printWindow.isDestroyed()) printWindow.close();
      try { fs.rmSync(tempHtml, { force: true }); } catch {  }
    }
  });

  ipcMain.handle('items:purchasePrices', (_e, itemId: number) => {
    return getDb().prepare(`SELECT ipp.*, s.name AS supplier_name, po.order_no
      FROM item_purchase_prices ipp
      LEFT JOIN suppliers s ON s.id = ipp.supplier_id
      LEFT JOIN purchase_orders po ON po.id = ipp.purchase_order_id
      WHERE ipp.item_id = ?
      ORDER BY ipp.received_at DESC, ipp.id DESC
      LIMIT 30`).all(Number(itemId));
  });

  ipcMain.handle('items:removeKitAlternative', (_e, kitItemId: number, componentItemId: number, altItemId: number, bomVersionId?: number) => {
    requirePerm('items_edit');
    const rows = removeKitAlternative(
      Number(kitItemId), Number(componentItemId), Number(altItemId),
      bomVersionId != null ? Number(bomVersionId) : undefined,
    );
    audit('item.kitAltRemove', 'item', Number(kitItemId), `комп. #${componentItemId} × альт. #${altItemId}`);
    return rows;
  });

  ipcMain.handle('items:saveBomVersion', (_e, data: any) => {
    requirePerm('items_edit');
    return saveBomVersion(data || {});
  });

  ipcMain.handle('items:saveTechOperation', (_e, data: any) => {
    requirePerm('items_edit');
    return saveTechOperation(data || {});
  });

  ipcMain.handle('items:setDefaultBomVersion', (_e, kitItemId: number, versionId: number) => {
    requirePerm('items_edit');
    return setDefaultBomVersion(Number(kitItemId), Number(versionId));
  });

  ipcMain.handle('items:unpackStock', (_e, data: any = {}) => {
    requirePerm('inventory');
    requirePerm('post_disassemble');
    const db = getDb();
    const packId = Number(data.item_id || data.pack_id);
    const locationId = Number(data.location_id);
    const packQty = Math.max(0, Math.floor(Number(data.quantity) || 0));
    const contentOverride = data.content_qty === '' || data.content_qty == null
      ? null
      : Math.max(1, Number(data.content_qty) || 0);
    if (!packId || !locationId || !packQty) throw new Error('Укажите упаковку, ячейку и количество');
    registry.requireLocationAccess(locationId);
    const pack = db.prepare('SELECT id, name, item_type, cost_price, package_qty FROM items WHERE id = ?').get(packId) as any;
    if (!pack) throw new Error('Упаковка не найдена');
    if (!isBomItemType(pack.item_type)) throw new Error('Разобрать можно только упаковку / набор / комплект');
    const location = db.prepare('SELECT id, name FROM locations WHERE id = ?').get(locationId) as any;
    if (!location) throw new Error('Ячейка не найдена');
    const onHand = getStockAtLocation(packId, locationId);
    if (onHand < packQty) throw new Error(`На ячейке «${location.name}» только ${onHand} уп.`);
    const resolved = resolveUnpackComponents(packId, packQty, contentOverride);
    if (!resolved.components.length) throw new Error('Нет компонентов для оприходования');
    const packCost = Number(pack.cost_price);
    const pieceCost = Number.isFinite(packCost) && packCost >= 0 && resolved.contentQty > 0
      ? roundMoney(packCost / resolved.contentQty, 4)
      : null;
    const docNo = nextDocumentNo('disassemble');
    const actor = actorName();

    const apply = db.transaction(() => {
      addStockAtLocation(packId, locationId, -packQty, 0);
      insertLedger({
        item_id: packId,
        location_id: locationId,
        type: 'out',
        quantity: packQty,
        comment: `Разукомплектация уп. → шт · ${location.name}`,
        reason: 'DISASSEMBLE',
        source: 'STOCK_OP',
        document_ref: docNo,
        user_name: actor,
      });
      let piecesTotal = 0;
      for (const comp of resolved.components) {
        const qty = normalizeQtyForItem(comp.id, comp.quantity);
        if (!(qty > 0)) continue;
        assertLocationCapacity(db, locationId, qty);
        addStockAtLocation(comp.id, locationId, qty, 0);
        insertLedger({
          item_id: comp.id,
          location_id: locationId,
          type: 'in',
          quantity: qty,
          comment: `Из уп. «${pack.name}» · ${resolved.contentQty} шт/уп · ${location.name}`,
          reason: 'DISASSEMBLE',
          source: 'STOCK_OP',
          document_ref: docNo,
          user_name: actor,
        });
        if (pieceCost != null) {
          db.prepare('UPDATE items SET cost_price = ? WHERE id = ?').run(pieceCost, comp.id);
        }
        piecesTotal += qty;
      }
      if (resolved.updateBomQty != null) {
        const bom = listKitComponents(packId);
        if (bom.length === 1) {
          upsertKitComponent(packId, bom[0].id, resolved.updateBomQty);
          db.prepare('UPDATE items SET package_qty = ? WHERE id = ?').run(resolved.updateBomQty, packId);
        }
      }
      upsertDocument({
        doc_type: 'disassemble',
        doc_no: docNo,
        status: 'posted',
        doc_date: new Date().toISOString().slice(0, 10),
        party: location.name,
        author: actor,
        posted_by: actor,
        note: `Уп. «${pack.name}» ×${packQty} → ${piecesTotal} шт`,
        ref_table: 'locations',
        ref_id: locationId,
      });
      return { doc_no: docNo, pack_qty: packQty, pieces: piecesTotal, content_qty: resolved.contentQty, piece_cost: pieceCost };
    });

    const result = apply();
    audit('item.unpack', 'item', packId, `${docNo}: ${packQty} уп. → ${result.pieces} шт`);
    return result;
  });

  ipcMain.handle('items:upsertKitAlternative', (_e, kitItemId: number, componentItemId: number, altItemId: number, opts: any = {}) => {
    requirePerm('items_edit');
    try {
      const rows = upsertKitAlternative(Number(kitItemId), Number(componentItemId), Number(altItemId), opts || {});
      audit('item.kitAltUpsert', 'item', Number(kitItemId), `комп. #${componentItemId} ← альт. #${altItemId}`);
      return rows;
    } catch (error) {
      throw mapDbError(error);
    }
  });

  ipcMain.handle('lots:expiring', (_e, withinDays?: number) => {
    registry.requireSession();
    const days = withinDays != null ? Number(withinDays) : getExpiryWarnDays();
    return listExpiringLots(days, 100);
  });


  ipcMain.handle('counterparties:get', (_e, id: number) => {
    registry.requireSession();
    requirePerm('company');
    return companyHub.getCounterparty(Number(id));
  });
  ipcMain.handle('counterparties:customValues', (_e, id: number) => {
    registry.requireSession();
    requirePerm('company');
    return listCounterpartyCustomValues(Number(id));
  });
  ipcMain.handle('employees:customValues', (_e, id: number) => {
    registry.requireSession();
    if (!registry.hasPerm('employees') && !registry.hasPerm('company') && !registry.hasPerm('edo')) {
      requirePerm('employees');
    }
    return listEmployeeCustomValues(Number(id));
  });
  ipcMain.handle('documents:customValues', (_e, id: number) => {
    registry.requireSession();
    requirePerm('documents');
    return listDocumentCustomValues(Number(id));
  });
  ipcMain.handle('documents:saveCustomValues', (_e, id: number, values: any) => {
    registry.requireSession();
    requirePerm('documents');
    return saveDocumentCustomValues(Number(id), values);
  });
  ipcMain.handle('customFields:entities', () => CUSTOM_FIELD_ENTITIES);
  ipcMain.handle('customFields:list', (_e, opts?: any) => {
    registry.requireSession();
    requirePerm('settings');
    const entity = opts?.entity || opts || 'item';
    const includeArchived = Boolean(opts?.includeArchived);
    return listCustomFieldDefs(entity, includeArchived);
  });
  ipcMain.handle('customFields:save', (_e, data: any) => {
    registry.requireSession();
    requirePerm('settings');
    return upsertCustomFieldDef(data);
  });
  ipcMain.handle('customFields:archive', (_e, id: number) => {
    registry.requireSession();
    requirePerm('settings');
    return archiveCustomFieldDef(Number(id));
  });
  ipcMain.handle('customFields:eval', (_e, itemOrId: any, values?: any) => {
    registry.requireSession();
    const item = typeof itemOrId === 'object' && itemOrId
      ? itemOrId
      : getDb().prepare('SELECT * FROM items WHERE id = ?').get(Number(itemOrId));
    if (!item) throw new Error('Товар не найден');
    return computeItemFormulaFields(item, values || {});
  });



  registerModernIpcHandlers();
  } finally {
    (ipcMain as any).handle = originalHandle;
  }
}

