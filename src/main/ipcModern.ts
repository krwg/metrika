

import { BrowserWindow, dialog, ipcMain, shell } from 'electron';
import fs from 'fs';
import {
  openConfiguratorWindow,
  openCrmWindow,
  openClientWindow,
  openDetachedPageWindow,
  listAppWindows,
} from './configWindow';
import * as registry from './registry';
import * as companyHub from './companyHub';
import * as crmHub from './crmHub';
import * as automation from './automation';
import * as assetsHub from './assets';
import * as partiesHub from './parties';
import * as edoCatalog from './edoCatalog';
import {
  getCrmRemoteStatus,
  setCrmRemotePort,
  startCrmRemoteServer,
  stopCrmRemoteServer,
} from './crmRemoteServer';
import {
  getMiapiStatus,
  issueMiapiToken,
  listMiapiTokens,
  revokeMiapiToken,
  setMiapiPort,
  setMiapiWebhookSecret,
  startMiapiServer,
  stopMiapiServer,
} from './miapiServer';
import * as eventBus from './eventBus';
import * as plugins from './plugins';
import * as edoLegal from './edoLegal';
import * as devices from './devices';
import * as exchange from './exchange';
import * as workflow from './workflow';
import { flushTsdOutbox, getTsdOutboxStatus, enqueueStockCount } from './tsdOutbox';
import {
  addProjectOperation,
  applyTechOpsToProject,
  assignProject,
  attachmentAbsPath,
  autoReleaseHungReserves,
  getDb,
  getDocWorkflowExtras,
  listHungReserves,
  listProjectOperations,
  refreshProjectCostFields,
  removeProjectOperation,
  setDocumentWorkflowStatus,
  setProjectOperationDone,
  summarizeOrgWip,
} from './db';

function requirePerm(key: string) {
  registry.requirePerm(key);
}

function requireEdoAccess() {
  if (registry.hasPerm('edo') || registry.hasPerm('company')) return;
  requirePerm('edo');
}

function requireEmployeesRead() {
  if (registry.hasPerm('employees') || registry.hasPerm('company') || registry.hasPerm('edo')) return;
  requirePerm('employees');
}

function audit(action: string, entity?: string, entityId?: string | number | null, detail?: string) {
  registry.logAudit(action, { entity, entityId, detail });
}

export function ensureCounterpartyForSupplier(supplierId: number) {
  const db = getDb();
  const sid = Number(supplierId);
  const supplier = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(sid) as any;
  if (!supplier) return null;
  const existing = db.prepare('SELECT * FROM counterparties WHERE supplier_id = ?').get(sid) as any;
  if (existing) {
    db.prepare(`
      UPDATE counterparties SET
        name = ?, phone = COALESCE(?, phone), email = COALESCE(?, email),
        inn = COALESCE(?, inn), address = COALESCE(?, address),
        contact_person = COALESCE(?, contact_person), notes = COALESCE(?, notes),
        kind = CASE WHEN kind = 'customer' THEN 'supplier' ELSE kind END,
        is_active = COALESCE(?, is_active),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      supplier.name,
      supplier.phone || null,
      supplier.email || null,
      supplier.inn || null,
      supplier.address || null,
      supplier.contact || null,
      supplier.note || null,
      supplier.is_active == null ? 1 : Number(supplier.is_active) ? 1 : 0,
      existing.id,
    );
    return db.prepare('SELECT * FROM counterparties WHERE id = ?').get(existing.id);
  }
  const result = db.prepare(`
    INSERT INTO counterparties (
      name, kind, inn, phone, email, address, contact_person, notes, supplier_id, is_active
    ) VALUES (?, 'supplier', ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    supplier.name,
    supplier.inn || null,
    supplier.phone || null,
    supplier.email || null,
    supplier.address || null,
    supplier.contact || null,
    supplier.note || null,
    sid,
    supplier.is_active == null ? 1 : Number(supplier.is_active) ? 1 : 0,
  );
  return db.prepare('SELECT * FROM counterparties WHERE id = ?').get(result.lastInsertRowid);
}

export function ensureSupplierForCounterparty(counterpartyId: number) {
  const db = getDb();
  const cp = db.prepare('SELECT * FROM counterparties WHERE id = ?').get(Number(counterpartyId)) as any;
  if (!cp) return null;
  if (cp.supplier_id) {
    db.prepare(`
      UPDATE suppliers SET
        name = ?, contact = COALESCE(?, contact), email = COALESCE(?, email),
        phone = COALESCE(?, phone), inn = COALESCE(?, inn), address = COALESCE(?, address),
        note = COALESCE(?, note), is_active = COALESCE(?, is_active)
      WHERE id = ?
    `).run(
      cp.name, cp.contact_person, cp.email, cp.phone, cp.inn, cp.address, cp.notes,
      cp.is_active == null ? 1 : Number(cp.is_active) ? 1 : 0,
      Number(cp.supplier_id),
    );
    return db.prepare('SELECT * FROM suppliers WHERE id = ?').get(Number(cp.supplier_id));
  }
  if (cp.kind !== 'supplier' && cp.kind !== 'partner') return null;
  const result = db.prepare(`
    INSERT INTO suppliers (name, contact, email, phone, inn, address, note, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    cp.name, cp.contact_person || null, cp.email || null, cp.phone || null,
    cp.inn || null, cp.address || null, cp.notes || null,
    cp.is_active == null ? 1 : Number(cp.is_active) ? 1 : 0,
  );
  const sid = Number(result.lastInsertRowid);
  db.prepare('UPDATE counterparties SET supplier_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(sid, Number(cp.id));
  return db.prepare('SELECT * FROM suppliers WHERE id = ?').get(sid);
}

export function backfillSupplierCounterpartyLinks() {
  const db = getDb();
  const orphans = db.prepare(`
    SELECT s.id FROM suppliers s
    WHERE NOT EXISTS (SELECT 1 FROM counterparties c WHERE c.supplier_id = s.id)
  `).all() as Array<{ id: number }>;
  let n = 0;
  for (const row of orphans) {
    ensureCounterpartyForSupplier(row.id);
    n += 1;
  }
  const cps = db.prepare(`
    SELECT id FROM counterparties
    WHERE kind IN ('supplier', 'partner') AND (supplier_id IS NULL OR supplier_id = 0)
  `).all() as Array<{ id: number }>;
  for (const row of cps) {
    ensureSupplierForCounterparty(row.id);
    n += 1;
  }
  return n;
}

const READONLY_TABLES = new Set([
  'transactions', 'inventory', 'project_reservations', 'lots', 'serial_numbers',
  'document_lines', 'automation_log', 'crm_transport_events', 'entity_changes',
]);

function assertConfigTable(table: string) {
  const name = String(table || '').trim();
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) throw new Error('Некорректное имя таблицы');
  const row = getDb().prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name = ?`).get(name);
  if (!row) throw new Error(`Таблица «${name}» не найдена`);
  return name;
}

function buildConfigTree() {
  const db = getDb();
  const tables = (db.prepare(`
    SELECT name FROM sqlite_master
    WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
    ORDER BY name
  `).all() as Array<{ name: string }>).map((r) => r.name);

  const node = (id: string, label: string, kind: string, extra: any = {}) => ({ id, label, kind, ...extra });
  const tableNode = (t: string, label?: string) => node(`tbl:${t}`, label || t, 'table', {
    table: t,
    writable: !READONLY_TABLES.has(t),
    hint: READONLY_TABLES.has(t) ? 'Только чтение (регистр/журнал)' : undefined,
  });

  const pick = (...names: string[]) => names.filter((n) => tables.includes(n)).map((n) => tableNode(n));

  return {
    tree: [
      node('root', 'Конфигурация', 'folder', {
        children: [
          node('common', 'Общие', 'folder', {
            children: [
              node('settings', 'Настройки (schema_meta / settings)', 'settings'),
              ...pick('schema_meta', 'settings', 'document_series'),
            ],
          }),
          node('catalogs', 'Справочники', 'folder', {
            children: pick(
              'items', 'categories', 'units', 'locations', 'zones', 'suppliers', 'counterparties',
              'employees', 'parties', 'assets', 'custom_field_defs',
            ),
          }),
          node('hr_crm', 'HR / CRM / ОС', 'folder', {
            children: pick(
              'employees', 'counterparties', 'crm_threads', 'crm_messages', 'crm_cases',
              'crm_queues', 'crm_operator_modes', 'assets', 'asset_movements', 'asset_maintenance',
            ),
          }),
          node('documents', 'Документы', 'folder', {
            children: pick(
              'documents', 'document_lines', 'document_attachments', 'purchase_orders',
              'purchase_order_items', 'purchase_order_shipments', 'sales_orders', 'sales_order_lines',
              'edo_documents', 'edo_templates', 'contracts',
            ),
          }),
          node('registers', 'Регистры', 'folder', {
            children: pick('inventory', 'transactions', 'lots', 'serial_numbers', 'project_reservations'),
          }),
          node('db', 'Все таблицы БД', 'folder', {
            children: tables.map((t) => tableNode(t)),
          }),
        ],
      }),
    ],
  };
}

export function registerModernIpcHandlers() {

  ipcMain.handle('shell:openConfigurator', () => {
    registry.requireSession();
    return Boolean(openConfiguratorWindow());
  });
  ipcMain.handle('shell:openCrm', () => {
    registry.requireSession();
    requirePerm('company');
    return Boolean(openCrmWindow());
  });
  ipcMain.handle('shell:openClient', () => {
    registry.requireSession();
    return Boolean(openClientWindow());
  });
  ipcMain.handle('shell:listAppWindows', () => listAppWindows());
  ipcMain.handle('shell:openDetachedPage', (_e, page: string, title?: string) => {
    registry.requireSession();
    return openDetachedPageWindow(String(page || ''), title);
  });
  ipcMain.handle('shell:focusMain', () => {
    const wins = BrowserWindow.getAllWindows();
    const main = wins.find((w) => {
      try {
        const u = w.webContents.getURL();
        return !u.includes('#crm') && !u.includes('#client') && !u.includes('#configurator');
      } catch { return false; }
    }) || wins[0];
    if (main && !main.isDestroyed()) {
      if (main.isMinimized()) main.restore();
      main.show();
      main.focus();
      return true;
    }
    return false;
  });
  ipcMain.handle('shell:focusEntity', (_e, payload: { type?: string; id?: number | string; page?: string }) => {
    registry.requireSession();
    const data = payload || {};
    for (const win of BrowserWindow.getAllWindows()) {
      if (win.isDestroyed()) continue;
      try { win.webContents.send('shell:focusEntity', data); } catch {  }
    }
    return true;
  });

  ipcMain.handle('profile:updateSelf', (_e, data: any) => {
    registry.requireSession();
    return companyHub.updateMyProfile(data);
  });
  ipcMain.handle('profile:getEsign', () => {
    registry.requireSession();
    return registry.getMyEsign();
  });
  ipcMain.handle('profile:generateEsign', () => {
    registry.requireSession();
    return registry.generateMyEsign();
  });
  ipcMain.handle('profile:listEsignKeys', (_e, organizationId?: number) => {
    registry.requireSession();
    return registry.listOrgEsignKeys(organizationId);
  });

  ipcMain.handle('employees:list', (_e, filters?: any) => {
    registry.requireSession();
    requireEmployeesRead();
    return companyHub.listEmployees(filters || {});
  });
  ipcMain.handle('employees:get', (_e, id: number) => {
    registry.requireSession();
    requireEmployeesRead();
    return companyHub.getEmployee(Number(id));
  });
  ipcMain.handle('employees:save', (_e, data: any) => {
    registry.requireSession();
    requirePerm('employees');
    const row = companyHub.saveEmployee(data);
    audit(data?.id ? 'employee.update' : 'employee.create', 'employee', row?.id, row?.full_name || row?.last_name);
    return row;
  });
  ipcMain.handle('employees:delete', (_e, id: number) => {
    registry.requireSession();
    requirePerm('employees');
    companyHub.deleteEmployee(Number(id));
    audit('employee.delete', 'employee', id);
    return true;
  });

  ipcMain.handle('edo:forms', () => companyHub.EDO_FORMS);
  ipcMain.handle('edo:catalog', (_e, filters?: any) => {
    registry.requireSession();
    requireEdoAccess();
    return edoCatalog.listEdoCatalog(filters || {});
  });
  ipcMain.handle('edo:catalogGet', (_e, code: string) => {
    registry.requireSession();
    requireEdoAccess();
    return edoCatalog.getEdoCatalogItem(String(code || ''));
  });
  ipcMain.handle('edo:applyCatalog', (_e, code: string, vars?: any) => {
    registry.requireSession();
    requireEdoAccess();
    return edoCatalog.applyCatalogTemplate(String(code || ''), vars || {});
  });
  ipcMain.handle('edo:syncCatalog', () => {
    registry.requireSession();

    requireEdoAccess();
    return companyHub.syncEdoCatalogTemplates();
  });
  ipcMain.handle('edo:ensureEmployee', () => {
    registry.requireSession();
    requireEdoAccess();
    return companyHub.ensureEmployeeForSessionUser();
  });
  ipcMain.handle('edo:ensureEmployeeForUser', (_e, userId: number) => {
    registry.requireSession();
    requireEdoAccess();
    return companyHub.ensureEmployeeForUser(Number(userId));
  });
  ipcMain.handle('edo:syncEmployees', () => {
    registry.requireSession();
    requireEdoAccess();
    return companyHub.syncEmployeesFromUsers();
  });
  ipcMain.handle('edo:listTemplates', (_e, filters?: any) => {
    registry.requireSession();
    requireEdoAccess();
    return companyHub.listEdoTemplates(filters || {});
  });
  ipcMain.handle('edo:getTemplate', (_e, id: number) => {
    registry.requireSession();
    requireEdoAccess();
    return companyHub.getEdoTemplate(Number(id));
  });
  ipcMain.handle('edo:saveTemplate', (_e, data: any) => {
    registry.requireSession();
    requirePerm('company');
    const row = companyHub.saveEdoTemplate(data);
    audit(data?.id ? 'edo.templateUpdate' : 'edo.templateCreate', 'edo_template', row?.id, row?.title);
    return row;
  });
  ipcMain.handle('edo:deleteTemplate', (_e, id: number) => {
    registry.requireSession();
    requirePerm('company');
    companyHub.deleteEdoTemplate(Number(id));
    audit('edo.templateDelete', 'edo_template', id);
    return true;
  });
  ipcMain.handle('edo:applyTemplate', (_e, id: number, vars?: any) => {
    registry.requireSession();
    requireEdoAccess();
    return companyHub.applyEdoTemplate(Number(id), vars || {});
  });
  ipcMain.handle('edo:list', (_e, filters?: any) => {
    registry.requireSession();
    requireEdoAccess();
    return companyHub.listEdoDocuments(filters || {});
  });
  ipcMain.handle('edo:get', (_e, id: number) => {
    registry.requireSession();
    requireEdoAccess();
    return companyHub.getEdoDocument(Number(id));
  });
  ipcMain.handle('edo:save', (_e, data: any) => {
    registry.requireSession();
    requireEdoAccess();
    const row = companyHub.saveEdoDocument(data);
    audit(data?.id ? 'edo.update' : 'edo.create', 'edo', row?.id, row?.title || row?.number);
    return row;
  });
  ipcMain.handle('edo:send', (_e, id: number, toUserId?: number) => {
    registry.requireSession();
    requireEdoAccess();
    const row = companyHub.sendEdoDocument(Number(id), toUserId);
    audit('edo.send', 'edo', id);
    return row;
  });
  ipcMain.handle('edo:sign', (_e, id: number) => {
    registry.requireSession();
    requireEdoAccess();
    const row = companyHub.signEdoDocument(Number(id));
    audit('edo.sign', 'edo', id);
    return row;
  });
  ipcMain.handle('edo:reject', (_e, id: number, reason?: string) => {
    registry.requireSession();
    requireEdoAccess();
    const row = companyHub.rejectEdoDocument(Number(id), reason);
    audit('edo.reject', 'edo', id, reason);
    return row;
  });
  ipcMain.handle('edo:cancel', (_e, id: number) => {
    registry.requireSession();
    requireEdoAccess();
    const row = companyHub.cancelEdoDocument(Number(id));
    audit('edo.cancel', 'edo', id);
    return row;
  });
  ipcMain.handle('edo:delete', (_e, id: number) => {
    registry.requireSession();
    requireEdoAccess();
    companyHub.deleteEdoDocument(Number(id));
    audit('edo.delete', 'edo', id);
    return true;
  });
  ipcMain.handle('edo:print', async (_e, id: number) => {
    registry.requireSession();
    requireEdoAccess();
    return companyHub.printEdoDocument(Number(id));
  });
  ipcMain.handle('edo:preview', (_e, id: number) => {
    registry.requireSession();
    requireEdoAccess();
    return companyHub.previewEdoDocument(Number(id));
  });
  ipcMain.handle('edo:exportPdf', async (_e, id: number) => {
    registry.requireSession();
    requireEdoAccess();
    return companyHub.exportEdoPdf(Number(id));
  });
  ipcMain.handle('edo:inboxCount', () => {
    registry.requireSession();
    requireEdoAccess();
    return companyHub.countEdoInbox();
  });

  ipcMain.handle('counterparties:list', (_e, filters?: any) => {
    registry.requireSession();
    requirePerm('company');
    return companyHub.listCounterparties(filters || {});
  });
  ipcMain.handle('counterparties:save', (_e, data: any) => {
    registry.requireSession();
    requirePerm('company');
    const row = companyHub.saveCounterparty(data);
    if (row?.id && (row.kind === 'supplier' || row.kind === 'partner' || data?.link_supplier)) {
      try { ensureSupplierForCounterparty(Number(row.id)); } catch {  }
    }
    audit(data?.id ? 'counterparty.update' : 'counterparty.create', 'counterparty', row?.id, row?.name);
    return companyHub.getCounterparty(Number(row.id));
  });
  ipcMain.handle('counterparties:delete', (_e, id: number, opts?: { hard?: boolean }) => {
    registry.requireSession();
    requirePerm('company');
    const hard = Boolean(opts?.hard);
    if (hard) {
      const result = companyHub.purgeCounterparty(Number(id));
      audit('counterparty.purge', 'counterparty', id, result?.name);
      return result;
    }
    const result = companyHub.deleteCounterparty(Number(id));
    audit('counterparty.hide', 'counterparty', id);
    return result;
  });

  ipcMain.handle('counterparties:purge', (_e, id: number) => {
    registry.requireSession();
    requirePerm('company');
    const result = companyHub.purgeCounterparty(Number(id));
    audit('counterparty.purge', 'counterparty', id, result?.name);
    return result;
  });
  ipcMain.handle('directions:list', (_e, includeInactive?: boolean) => {
    registry.requireSession();
    requirePerm('company');
    return companyHub.listDirections(Boolean(includeInactive));
  });
  ipcMain.handle('directions:save', (_e, data: any) => {
    registry.requireSession();
    requirePerm('company');
    return companyHub.saveDirection(data);
  });
  ipcMain.handle('directions:delete', (_e, id: number) => {
    registry.requireSession();
    requirePerm('company');
    companyHub.deleteDirection(Number(id));
    return true;
  });
  ipcMain.handle('contracts:list', (_e, filters?: any) => {
    registry.requireSession();
    requirePerm('company');
    return companyHub.listContracts(filters || {});
  });
  ipcMain.handle('contracts:save', (_e, data: any) => {
    registry.requireSession();
    requirePerm('company');
    return companyHub.saveContract(data);
  });
  ipcMain.handle('contracts:delete', (_e, id: number) => {
    registry.requireSession();
    requirePerm('company');
    companyHub.deleteContract(Number(id));
    return true;
  });
  ipcMain.handle('priceTypes:list', () => {
    registry.requireSession();
    requirePerm('company');
    return companyHub.listPriceTypes();
  });
  ipcMain.handle('priceTypes:save', (_e, data: any) => {
    registry.requireSession();
    requirePerm('company');
    return companyHub.savePriceType(data);
  });
  ipcMain.handle('priceTypes:delete', (_e, id: number) => {
    registry.requireSession();
    requirePerm('company');
    companyHub.deletePriceType(Number(id));
    return true;
  });
  ipcMain.handle('itemPrices:list', (_e, priceTypeId?: number) => {
    registry.requireSession();
    requirePerm('company');
    return companyHub.listItemPrices(priceTypeId);
  });
  ipcMain.handle('itemPrices:set', (_e, itemId: number, priceTypeId: number, price: number) => {
    registry.requireSession();
    requirePerm('company');
    return companyHub.setItemPrice(Number(itemId), Number(priceTypeId), Number(price));
  });
  ipcMain.handle('sales:list', (_e, filters?: any) => {
    registry.requireSession();
    requirePerm('company');
    return companyHub.listSalesOrders(filters || {});
  });
  ipcMain.handle('sales:get', (_e, id: number) => {
    registry.requireSession();
    requirePerm('company');
    return companyHub.getSalesOrder(Number(id));
  });
  ipcMain.handle('sales:save', (_e, data: any) => {
    registry.requireSession();
    requirePerm('company');
    const row = companyHub.saveSalesOrder(data);
    audit(data?.id ? 'sales.update' : 'sales.create', 'sales_order', row?.id, row?.number);
    return row;
  });
  ipcMain.handle('sales:delete', (_e, id: number) => {
    registry.requireSession();
    requirePerm('company');
    companyHub.deleteSalesOrder(Number(id));
    audit('sales.delete', 'sales_order', id);
    return true;
  });

  ipcMain.handle('crm:getCard', (_e, id: number) => {
    registry.requireSession();
    requirePerm('company');
    return crmHub.getCounterpartyCard(Number(id));
  });
  ipcMain.handle('crm:listClients', (_e, filters?: any) => {
    registry.requireSession();
    requirePerm('company');
    return crmHub.listCrmClients(filters || {});
  });
  ipcMain.handle('crm:listThreads', (_e, filters?: any) => {
    registry.requireSession();
    requirePerm('company');
    return crmHub.listCrmThreads(filters || {});
  });
  ipcMain.handle('crm:getThread', (_e, id: number) => {
    registry.requireSession();
    requirePerm('company');
    return crmHub.getCrmThread(Number(id), { includeInternal: true });
  });
  ipcMain.handle('crm:openThread', (_e, data: any) => {
    registry.requireSession();
    requirePerm('company');
    return crmHub.openCrmThread(data || {});
  });
  ipcMain.handle('crm:postMessage', (_e, threadId: number, data: any) => {
    registry.requireSession();
    requirePerm('company');
    const payload = { ...(data || {}) };
    if (payload.author_kind === 'client') {
      throw new Error('Сообщения от имени клиента создаются только через Метрика:Клиент');
    }
    payload.author_kind = 'staff';
    return crmHub.postCrmMessage(Number(threadId), payload);
  });
  ipcMain.handle('crm:setThreadStatus', (_e, id: number, status: string) => {
    registry.requireSession();
    requirePerm('company');
    return crmHub.setCrmThreadStatus(Number(id), String(status || ''));
  });
  ipcMain.handle('crm:listCases', (_e, filters?: any) => {
    registry.requireSession();
    requirePerm('company');
    return crmHub.listCrmCases(filters || {});
  });
  ipcMain.handle('crm:getCase', (_e, id: number) => {
    registry.requireSession();
    requirePerm('company');
    return crmHub.getCrmCase(Number(id));
  });
  ipcMain.handle('crm:createCase', (_e, data: any) => {
    registry.requireSession();
    requirePerm('company');
    return crmHub.createCrmCase(data || {});
  });
  ipcMain.handle('crm:assignCase', (_e, id: number, userId?: number | null) => {
    registry.requireSession();
    requirePerm('company');
    return crmHub.assignCrmCase(Number(id), userId);
  });
  ipcMain.handle('crm:setCaseStatus', (_e, id: number, status: string, opts?: any) => {
    registry.requireSession();
    requirePerm('company');
    return crmHub.setCrmCaseStatus(Number(id), String(status || ''), opts || {});
  });
  ipcMain.handle('crm:caseStatusesMeta', () => crmHub.CASE_STATUSES);
  ipcMain.handle('crm:getOperatorMode', (_e, userId?: number) => {
    registry.requireSession();
    requirePerm('company');
    return crmHub.getOperatorMode(userId);
  });
  ipcMain.handle('crm:setOperatorMode', (_e, mode: string, note?: string) => {
    registry.requireSession();
    requirePerm('company');
    return crmHub.setOperatorMode(String(mode || ''), note);
  });
  ipcMain.handle('crm:listOperatorModes', () => {
    registry.requireSession();
    requirePerm('company');
    return crmHub.listOperatorModes();
  });
  ipcMain.handle('crm:operatorModesMeta', () => crmHub.OPERATOR_MODES);
  ipcMain.handle('crm:transportInfo', () => {
    registry.requireSession();
    return {
      ...crmHub.getCrmTransportInfo(),
      remote: getCrmRemoteStatus(),
    };
  });
  ipcMain.handle('crm:pollEvents', (_e, sinceId?: number, limit?: number) => {
    registry.requireSession();
    return crmHub.pollCrmEvents(Number(sinceId) || 0, limit);
  });
  ipcMain.handle('crm:remoteStatus', () => {
    registry.requireSession();
    requirePerm('company');
    return getCrmRemoteStatus();
  });
  ipcMain.handle('crm:remoteStart', (_e, port?: number) => {
    registry.requireSession();
    requirePerm('company');
    const st = startCrmRemoteServer(port);
    audit('crm.remoteStart', 'crm', null, `port=${st.port}`);
    return st;
  });
  ipcMain.handle('crm:remoteStop', () => {
    registry.requireSession();
    requirePerm('company');
    const st = stopCrmRemoteServer();
    audit('crm.remoteStop', 'crm');
    return st;
  });
  ipcMain.handle('crm:remoteSetPort', (_e, port: number) => {
    registry.requireSession();
    requirePerm('company');
    return setCrmRemotePort(Number(port));
  });
  ipcMain.handle('crm:issuePortalToken', (_e, counterpartyId: number, label?: string) => {
    registry.requireSession();
    requirePerm('company');
    const row = crmHub.issuePortalToken(Number(counterpartyId), label);
    audit('crm.portalToken', 'counterparty', counterpartyId, row.token_prefix);
    return row;
  });
  ipcMain.handle('crm:listPortalTokens', (_e, counterpartyId?: number) => {
    registry.requireSession();
    requirePerm('company');
    return crmHub.listPortalTokens(counterpartyId);
  });
  ipcMain.handle('crm:revokePortalToken', (_e, id: number) => {
    registry.requireSession();
    requirePerm('company');
    const n = crmHub.revokePortalToken(Number(id));
    audit('crm.portalTokenRevoke', 'crm_portal_token', id);
    return n;
  });

  ipcMain.handle('miapi:status', () => {
    registry.requireSession();
    requirePerm('settings');
    return getMiapiStatus();
  });
  ipcMain.handle('miapi:start', (_e, port?: number) => {
    registry.requireSession();
    requirePerm('settings');
    const st = startMiapiServer(port);
    audit('miapi.start', 'miapi', null, `port=${st.port}`);
    return st;
  });
  ipcMain.handle('miapi:stop', () => {
    registry.requireSession();
    requirePerm('settings');
    const st = stopMiapiServer();
    audit('miapi.stop', 'miapi');
    return st;
  });
  ipcMain.handle('miapi:setPort', (_e, port: number) => {
    registry.requireSession();
    requirePerm('settings');
    return setMiapiPort(Number(port));
  });
  ipcMain.handle('miapi:setWebhookSecret', (_e, secret: string) => {
    registry.requireSession();
    requirePerm('settings');
    const st = setMiapiWebhookSecret(String(secret || ''));
    audit('miapi.webhookSecret', 'miapi');
    return st;
  });
  ipcMain.handle('miapi:issueToken', (_e, label?: string) => {
    registry.requireSession();
    requirePerm('settings');
    const row = issueMiapiToken(label);
    audit('miapi.token', 'miapi_token', row.id, row.token_prefix);
    return row;
  });
  ipcMain.handle('miapi:listTokens', () => {
    registry.requireSession();
    requirePerm('settings');
    return listMiapiTokens();
  });
  ipcMain.handle('miapi:revokeToken', (_e, id: number) => {
    registry.requireSession();
    requirePerm('settings');
    const n = revokeMiapiToken(Number(id));
    audit('miapi.tokenRevoke', 'miapi_token', id);
    return n;
  });

  ipcMain.handle('crm:portalContext', () => {
    registry.requireSession();
    return crmHub.getPortalContext();
  });
  ipcMain.handle('crm:portalThreads', () => {
    registry.requireSession();
    return crmHub.listPortalThreads();
  });
  ipcMain.handle('crm:portalThread', (_e, id: number) => {
    registry.requireSession();
    return crmHub.getPortalThread(Number(id));
  });
  ipcMain.handle('crm:portalStart', (_e, data: any) => {
    registry.requireSession();
    return crmHub.startPortalThread(data || {});
  });
  ipcMain.handle('crm:portalPost', (_e, threadId: number, body: string, clientMsgId?: string) => {
    registry.requireSession();
    return crmHub.postPortalMessage(Number(threadId), String(body || ''), clientMsgId);
  });
  ipcMain.handle('crm:listQueues', (_e, includeInactive?: boolean) => {
    registry.requireSession();
    requirePerm('company');
    return crmHub.listCrmQueues(Boolean(includeInactive));
  });
  ipcMain.handle('crm:saveQueue', (_e, data: any) => {
    registry.requireSession();
    requirePerm('company');
    return crmHub.saveCrmQueue(data || {});
  });
  ipcMain.handle('crm:claimNext', (_e, queueCode?: string | null) => {
    registry.requireSession();
    requirePerm('company');
    return crmHub.claimNextFromQueue(queueCode);
  });
  ipcMain.handle('crm:listSlaBreaches', () => {
    registry.requireSession();
    requirePerm('company');
    return crmHub.listSlaBreaches();
  });
  ipcMain.handle('crm:addAttachment', async (_e, threadId: number, opts?: { asClient?: boolean; body?: string }) => {
    registry.requireSession();
    requirePerm('company');
    const win = BrowserWindow.getFocusedWindow();
    const picked = await dialog.showOpenDialog(win || undefined as any, {
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Файлы', extensions: ['*'] }],
    });
    if (picked.canceled || !picked.filePaths?.length) return null;
    return crmHub.attachFilesToThreadMessage(Number(threadId), picked.filePaths, opts || {});
  });
  ipcMain.handle('crm:openAttachment', async (_e, attachmentId: number) => {
    registry.requireSession();
    const row = crmHub.getCrmMessageAttachment(Number(attachmentId));
    if (!row) throw new Error('Вложение не найдено');
    const abs = attachmentAbsPath(String(row.stored_name || ''));
    if (!abs || !fs.existsSync(abs)) throw new Error('Файл вложения не найден на диске');
    await shell.openPath(abs);
    return { ok: true, path: abs };
  });

  ipcMain.handle('automation:meta', () => ({
    triggers: automation.AUTOMATION_TRIGGERS.map((id) => ({ id, label: automation.TRIGGER_LABELS[id] })),
    actions: automation.AUTOMATION_ACTIONS.map((id) => ({ id, label: automation.ACTION_LABELS[id] })),
  }));
  ipcMain.handle('automation:listRules', () => {
    registry.requireSession();
    requirePerm('settings');
    return automation.listAutomationRules(true);
  });
  ipcMain.handle('automation:saveRule', (_e, data: any) => {
    registry.requireSession();
    requirePerm('settings');
    const row = automation.saveAutomationRule(data);
    audit(data?.id ? 'automation.update' : 'automation.create', 'automation', row?.id, row?.name);
    return row;
  });
  ipcMain.handle('automation:deleteRule', (_e, id: number) => {
    registry.requireSession();
    requirePerm('settings');
    const n = automation.deleteAutomationRule(Number(id));
    audit('automation.delete', 'automation', id);
    return n;
  });
  ipcMain.handle('automation:listLog', (_e, limit?: number) => {
    registry.requireSession();
    requirePerm('settings');
    return automation.listAutomationLog(limit);
  });
  ipcMain.handle('automation:runScheduled', () => {
    registry.requireSession();
    requirePerm('settings');
    return automation.runScheduledAutomations();
  });
  ipcMain.handle('automation:schedulerStatus', () => {
    registry.requireSession();
    requirePerm('settings');
    return automation.getAutomationSchedulerStatus();
  });
  ipcMain.handle('automation:setInterval', (_e, minutes: number) => {
    registry.requireSession();
    requirePerm('settings');
    const n = automation.setAutomationIntervalMinutes(Number(minutes));
    automation.startAutomationScheduler(n);
    audit('automation.scheduler', 'automation', null, `interval=${n}m`);
    return automation.getAutomationSchedulerStatus();
  });
  ipcMain.handle('automation:listNotifications', (_e, limit?: number) => {
    registry.requireSession();
    return automation.listAppNotifications(limit);
  });
  ipcMain.handle('automation:markNotificationsRead', () => {
    registry.requireSession();
    return automation.markAppNotificationsRead();
  });
  ipcMain.handle('automation:clearNotifications', () => {
    registry.requireSession();
    return automation.clearAppNotifications();
  });

  ipcMain.handle('parties:list', (_e, filters?: any) => {
    registry.requireSession();
    if (!registry.hasPerm('company') && !registry.hasPerm('employees') && !registry.hasPerm('org_edit')) {
      requirePerm('company');
    }
    return partiesHub.listParties(filters || {});
  });
  ipcMain.handle('parties:get', (_e, id: number) => {
    registry.requireSession();
    return partiesHub.getParty(Number(id));
  });
  ipcMain.handle('parties:save', () => {
    throw new Error('parties: запись отключена. Используйте контрагентов / сотрудников / поставщиков.');
  });
  ipcMain.handle('parties:delete', () => {
    throw new Error('parties: запись отключена.');
  });
  ipcMain.handle('parties:seed', () => {
    registry.requireSession();
    requirePerm('settings');
    return partiesHub.seedPartiesFromLegacy();
  });

  ipcMain.handle('assets:meta', () => ({
    statuses: assetsHub.ASSET_STATUSES.map((id) => ({ id, label: assetsHub.ASSET_STATUS_LABELS[id] })),
    move_kinds: assetsHub.ASSET_MOVE_KINDS.map((id) => ({ id, label: assetsHub.ASSET_MOVE_LABELS[id] })),
  }));
  ipcMain.handle('assets:summarize', () => {
    registry.requireSession();
    requirePerm('assets');
    return assetsHub.summarizeAssets();
  });
  ipcMain.handle('assets:list', (_e, filters?: any) => {
    registry.requireSession();
    requirePerm('assets');
    return assetsHub.listAssets(filters || {});
  });
  ipcMain.handle('assets:get', (_e, id: number) => {
    registry.requireSession();
    requirePerm('assets');
    return assetsHub.getAsset(Number(id));
  });
  ipcMain.handle('assets:save', (_e, data: any) => {
    registry.requireSession();
    requirePerm('assets');
    const row = assetsHub.saveAsset(data);
    audit(data?.id ? 'asset.update' : 'asset.create', 'asset', row?.id, row?.name);
    return row;
  });
  ipcMain.handle('assets:move', (_e, id: number, data: any) => {
    registry.requireSession();
    requirePerm('assets');
    return assetsHub.moveAsset(Number(id), data || {});
  });
  ipcMain.handle('assets:delete', (_e, id: number) => {
    registry.requireSession();
    requirePerm('assets');
    assetsHub.deleteAsset(Number(id));
    audit('asset.delete', 'asset', id);
    return true;
  });
  ipcMain.handle('assets:saveMaintenance', (_e, data: any) => {
    registry.requireSession();
    requirePerm('assets');
    return assetsHub.saveAssetMaintenance(data || {});
  });
  ipcMain.handle('assets:deleteMaintenance', (_e, id: number) => {
    registry.requireSession();
    requirePerm('assets');
    assetsHub.deleteAssetMaintenance(Number(id));
    return true;
  });

  ipcMain.handle('groups:list', (_e, organizationId?: number) => {
    const oid = organizationId != null ? Number(organizationId) : registry.getSession()?.organization?.id;
    if (!oid) throw new Error('Укажите организацию');
    return registry.listUserGroups(Number(oid));
  });
  ipcMain.handle('groups:create', (_e, data: any) => {
    const row = registry.createUserGroup(data);
    audit('group.create', 'user_group', row?.id, row?.name);
    return row;
  });
  ipcMain.handle('groups:update', (_e, id: number, data: any) => {
    const row = registry.updateUserGroup(Number(id), data);
    audit('group.update', 'user_group', id, row?.name);
    return row;
  });
  ipcMain.handle('groups:delete', (_e, id: number) => {
    registry.deleteUserGroup(Number(id));
    audit('group.delete', 'user_group', id);
    return true;
  });

  ipcMain.handle('documents:workflowExtras', () => {
    registry.requireSession();
    return getDocWorkflowExtras();
  });
  ipcMain.handle('documents:setWorkflow', (_e, documentId: number, workflowCode: string | null) => {
    registry.requireSession();
    requirePerm('documents');
    return setDocumentWorkflowStatus(Number(documentId), workflowCode);
  });

  ipcMain.handle('reserves:listHung', (_e, days?: number) => {
    registry.requireSession();
    requirePerm('inventory');
    return listHungReserves(days);
  });
  ipcMain.handle('reserves:releaseHung', (_e, days?: number) => {
    registry.requireSession();
    requirePerm('inventory');
    const n = autoReleaseHungReserves(days);
    audit('reserves.releaseHung', 'reserve', null, `released=${n}`);
    return { released: n };
  });

  ipcMain.handle('reports:list', () => {
    registry.requireSession();
    return getDb().prepare('SELECT * FROM saved_reports ORDER BY id DESC').all();
  });
  ipcMain.handle('reports:save', (_e, data: any) => {
    registry.requireSession();
    const name = String(data?.name || '').trim();
    if (!name) throw new Error('Укажите название отчёта');
    const id = data?.id ? Number(data.id) : 0;
    if (id) {
      getDb().prepare(`UPDATE saved_reports SET name=?, kind=?, params_json=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`)
        .run(name, String(data.kind || 'custom'), JSON.stringify(data.params || {}), id);
      return getDb().prepare('SELECT * FROM saved_reports WHERE id=?').get(id);
    }
    const r = getDb().prepare(`INSERT INTO saved_reports (name, kind, params_json) VALUES (?, ?, ?)`)
      .run(name, String(data.kind || 'custom'), JSON.stringify(data.params || {}));
    return getDb().prepare('SELECT * FROM saved_reports WHERE id=?').get(r.lastInsertRowid);
  });
  ipcMain.handle('reports:delete', (_e, id: number) => {
    registry.requireSession();
    return getDb().prepare('DELETE FROM saved_reports WHERE id=?').run(Number(id)).changes;
  });
  ipcMain.handle('listViews:list', (_e, listKey?: string) => {
    registry.requireSession();
    if (listKey) {
      return getDb().prepare('SELECT * FROM saved_list_views WHERE list_key = ? ORDER BY id DESC').all(String(listKey));
    }
    return getDb().prepare('SELECT * FROM saved_list_views ORDER BY list_key, id DESC').all();
  });
  ipcMain.handle('listViews:save', (_e, data: any) => {
    registry.requireSession();
    const listKey = String(data?.list_key || '').trim();
    const name = String(data?.name || '').trim();
    if (!listKey || !name) throw new Error('Укажите list_key и название');
    const id = data?.id ? Number(data.id) : 0;
    if (id) {
      getDb().prepare(`UPDATE saved_list_views SET name=?, filters_json=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`)
        .run(name, JSON.stringify(data.filters || {}), id);
      return getDb().prepare('SELECT * FROM saved_list_views WHERE id=?').get(id);
    }
    const r = getDb().prepare(`INSERT INTO saved_list_views (list_key, name, filters_json) VALUES (?, ?, ?)`)
      .run(listKey, name, JSON.stringify(data.filters || {}));
    return getDb().prepare('SELECT * FROM saved_list_views WHERE id=?').get(r.lastInsertRowid);
  });
  ipcMain.handle('listViews:delete', (_e, id: number) => {
    registry.requireSession();
    return getDb().prepare('DELETE FROM saved_list_views WHERE id=?').run(Number(id)).changes;
  });
  ipcMain.handle('audit:logClient', (_e, payload: { level?: string; text?: string; detail?: string }) => {
    registry.requireSession();
    const text = String(payload?.text || payload?.detail || '').trim();
    if (!text) return false;
    registry.logAudit(payload?.level === 'error' ? 'app.error' : payload?.level === 'warn' ? 'app.warn' : 'app.info', {
      detail: text,
    });
    return true;
  });
  ipcMain.handle('print:listPrinters', async () => {
    const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
    if (!win) return [];
    try {
      return await win.webContents.getPrintersAsync();
    } catch {
      return [];
    }
  });

  ipcMain.handle('purchases:listShipments', (_e, poId: number) => {
    registry.requireSession();
    requirePerm('purchases');
    return getDb().prepare(`
      SELECT * FROM purchase_order_shipments WHERE purchase_order_id = ? ORDER BY id
    `).all(Number(poId));
  });
  ipcMain.handle('purchases:addShipment', (_e, poId: number, data: any) => {
    registry.requireSession();
    requirePerm('purchases');
    const r = getDb().prepare(`
      INSERT INTO purchase_order_shipments (
        purchase_order_id, carrier, tracking_no, status, planned_at, shipped_at, delivered_at, note
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      Number(poId),
      String(data?.carrier || '').trim() || null,
      String(data?.tracking_no || '').trim() || null,
      ['planned', 'in_transit', 'delivered', 'cancelled'].includes(data?.status) ? data.status : 'planned',
      data?.planned_at || null,
      data?.shipped_at || null,
      data?.delivered_at || null,
      String(data?.note || '').trim() || null,
    );
    return getDb().prepare('SELECT * FROM purchase_order_shipments WHERE id=?').get(r.lastInsertRowid);
  });
  ipcMain.handle('purchases:updateShipment', (_e, shipmentId: number, data: any) => {
    registry.requireSession();
    requirePerm('purchases');
    const before = getDb().prepare('SELECT * FROM purchase_order_shipments WHERE id=?').get(Number(shipmentId)) as any;
    if (!before) throw new Error('Отправление не найдено');
    getDb().prepare(`
      UPDATE purchase_order_shipments SET
        carrier=?, tracking_no=?, status=?, planned_at=?, shipped_at=?, delivered_at=?, note=?
      WHERE id=?
    `).run(
      data?.carrier !== undefined ? (String(data.carrier || '').trim() || null) : before.carrier,
      data?.tracking_no !== undefined ? (String(data.tracking_no || '').trim() || null) : before.tracking_no,
      data?.status && ['planned', 'in_transit', 'delivered', 'cancelled'].includes(data.status) ? data.status : before.status,
      data?.planned_at !== undefined ? data.planned_at : before.planned_at,
      data?.shipped_at !== undefined ? data.shipped_at : before.shipped_at,
      data?.delivered_at !== undefined ? data.delivered_at : before.delivered_at,
      data?.note !== undefined ? (String(data.note || '').trim() || null) : before.note,
      Number(shipmentId),
    );
    return getDb().prepare('SELECT * FROM purchase_order_shipments WHERE id=?').get(Number(shipmentId));
  });
  ipcMain.handle('purchases:deleteShipment', (_e, shipmentId: number) => {
    registry.requireSession();
    requirePerm('purchases');
    return getDb().prepare('DELETE FROM purchase_order_shipments WHERE id=?').run(Number(shipmentId)).changes;
  });

  ipcMain.handle('projects:assign', (_e, projectId: number, data: any) => {
    registry.requireSession();
    requirePerm('projects');
    return assignProject(Number(projectId), data || {});
  });
  ipcMain.handle('projects:applyTechOps', (_e, projectId: number, kitItemId?: number, bomVersionId?: number) => {
    registry.requireSession();
    requirePerm('projects');
    return applyTechOpsToProject(Number(projectId), kitItemId, bomVersionId);
  });
  ipcMain.handle('projects:listOperations', (_e, projectId: number) => {
    registry.requireSession();
    return listProjectOperations(Number(projectId));
  });
  ipcMain.handle('projects:addOperation', (_e, projectId: number, data: any) => {
    registry.requireSession();
    requirePerm('projects');
    const title = typeof data === 'string' ? data : String(data?.title || '');
    return addProjectOperation(Number(projectId), title, {
      norm_minutes: data?.norm_minutes,
      tech_op_id: data?.tech_op_id,
    });
  });
  ipcMain.handle('projects:setOperationDone', (_e, operationId: number, done: boolean) => {
    registry.requireSession();
    requirePerm('projects');
    return setProjectOperationDone(Number(operationId), Boolean(done));
  });
  ipcMain.handle('projects:removeOperation', (_e, operationId: number) => {
    registry.requireSession();
    requirePerm('projects');
    return removeProjectOperation(Number(operationId));
  });
  ipcMain.handle('projects:costSummary', (_e, projectId?: number) => {
    registry.requireSession();
    if (projectId) return refreshProjectCostFields(Number(projectId));
    return summarizeOrgWip();
  });

  ipcMain.handle('forms:listActive', () => {
    registry.requireSession();
    return getDb().prepare(`
      SELECT * FROM config_custom_forms WHERE is_active = 1 ORDER BY sort_order, id
    `).all();
  });
  ipcMain.handle('forms:getByCode', (_e, code: string) => {
    registry.requireSession();
    return getDb().prepare('SELECT * FROM config_custom_forms WHERE code = ?').get(String(code || ''));
  });
  ipcMain.handle('config:listCustomForms', () => {
    registry.requireSession();
    requirePerm('settings');
    return getDb().prepare('SELECT * FROM config_custom_forms ORDER BY sort_order, id').all();
  });
  ipcMain.handle('config:saveCustomForm', (_e, data: any) => {
    registry.requireSession();
    requirePerm('settings');
    const code = String(data?.code || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const title = String(data?.title || '').trim();
    if (!code || !title) throw new Error('Укажите code и title формы');
    const fieldsJson = JSON.stringify(data?.fields || data?.fields_json || []);
    const id = data?.id ? Number(data.id) : 0;
    if (id) {
      getDb().prepare(`
        UPDATE config_custom_forms SET code=?, title=?, nav_label=?, description=?, fields_json=?,
          is_active=?, sort_order=?, updated_at=CURRENT_TIMESTAMP WHERE id=?
      `).run(
        code, title, String(data.nav_label || '').trim() || null, String(data.description || '').trim() || null,
        fieldsJson, data.is_active === 0 || data.is_active === false ? 0 : 1,
        Number(data.sort_order) || 0, id,
      );
      return getDb().prepare('SELECT * FROM config_custom_forms WHERE id=?').get(id);
    }
    const r = getDb().prepare(`
      INSERT INTO config_custom_forms (code, title, nav_label, description, fields_json, is_active, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      code, title, String(data.nav_label || '').trim() || null, String(data.description || '').trim() || null,
      fieldsJson, data.is_active === 0 || data.is_active === false ? 0 : 1, Number(data.sort_order) || 0,
    );
    return getDb().prepare('SELECT * FROM config_custom_forms WHERE id=?').get(r.lastInsertRowid);
  });
  ipcMain.handle('config:deleteCustomForm', (_e, id: number) => {
    registry.requireSession();
    requirePerm('settings');
    getDb().prepare('DELETE FROM config_custom_form_rows WHERE form_id=?').run(Number(id));
    return getDb().prepare('DELETE FROM config_custom_forms WHERE id=?').run(Number(id)).changes;
  });
  ipcMain.handle('config:listCustomFormRows', (_e, formId: number) => {
    registry.requireSession();
    return getDb().prepare(`
      SELECT * FROM config_custom_form_rows WHERE form_id = ? ORDER BY id DESC
    `).all(Number(formId)).map((row: any) => ({
      ...row,
      data: (() => { try { return JSON.parse(row.data_json || '{}'); } catch { return {}; } })(),
    }));
  });
  ipcMain.handle('config:saveCustomFormRow', (_e, data: any) => {
    registry.requireSession();
    const formId = Number(data?.form_id);
    if (!formId) throw new Error('Укажите form_id');
    const dataJson = JSON.stringify(data?.data || data?.data_json || {});
    const id = data?.id ? Number(data.id) : 0;
    if (id) {
      getDb().prepare(`UPDATE config_custom_form_rows SET data_json=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`)
        .run(dataJson, id);
      return getDb().prepare('SELECT * FROM config_custom_form_rows WHERE id=?').get(id);
    }
    const r = getDb().prepare(`INSERT INTO config_custom_form_rows (form_id, data_json) VALUES (?, ?)`)
      .run(formId, dataJson);
    return getDb().prepare('SELECT * FROM config_custom_form_rows WHERE id=?').get(r.lastInsertRowid);
  });
  ipcMain.handle('config:deleteCustomFormRow', (_e, id: number) => {
    registry.requireSession();
    return getDb().prepare('DELETE FROM config_custom_form_rows WHERE id=?').run(Number(id)).changes;
  });

  ipcMain.handle('config:tree', () => {
    registry.requireSession();
    if (registry.getSession()?.user?.role !== 'admin') throw new Error('Редактор конфигурации доступен администратору');
    return buildConfigTree();
  });
  ipcMain.handle('config:tableInfo', (_e, table: string) => {
    registry.requireSession();
    if (registry.getSession()?.user?.role !== 'admin') throw new Error('Только администратор');
    const name = assertConfigTable(table);
    const columns = getDb().prepare(`PRAGMA table_info(${name})`).all() as any[];
    return {
      columns: columns.map((c) => ({
        name: c.name, type: c.type, notnull: Boolean(c.notnull), pk: Boolean(c.pk), dflt_value: c.dflt_value,
      })),
      pkColumns: columns.filter((c) => c.pk).map((c) => c.name),
      writable: !READONLY_TABLES.has(name),
    };
  });
  ipcMain.handle('config:tableRows', (_e, table: string, opts?: { offset?: number; limit?: number }) => {
    registry.requireSession();
    if (registry.getSession()?.user?.role !== 'admin') throw new Error('Только администратор');
    const name = assertConfigTable(table);
    const limit = Math.max(1, Math.min(200, Number(opts?.limit) || 50));
    const offset = Math.max(0, Number(opts?.offset) || 0);
    const total = Number((getDb().prepare(`SELECT COUNT(*) AS c FROM ${name}`).get() as any)?.c || 0);
    const rows = getDb().prepare(`SELECT * FROM ${name} LIMIT ? OFFSET ?`).all(limit, offset);
    return { rows, total, offset, limit };
  });
  ipcMain.handle('config:tableUpdate', (_e, table: string, pk: any, patch: Record<string, any>) => {
    registry.requireSession();
    if (registry.getSession()?.user?.role !== 'admin') throw new Error('Только администратор');
    const name = assertConfigTable(table);
    if (READONLY_TABLES.has(name)) throw new Error('Таблица только для чтения');
    const info = getDb().prepare(`PRAGMA table_info(${name})`).all() as any[];
    const pkCols = info.filter((c) => c.pk).map((c) => c.name);
    if (!pkCols.length) throw new Error('Нет первичного ключа');
    const cols = Object.keys(patch || {}).filter((k) => info.some((c) => c.name === k) && !pkCols.includes(k));
    if (!cols.length) throw new Error('Нет полей для обновления');
    const where = pkCols.map((c) => `${c} = ?`).join(' AND ');
    const sql = `UPDATE ${name} SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE ${where}`;
    getDb().prepare(sql).run(...cols.map((c) => patch[c]), ...pkCols.map((c) => pk[c]));
    return true;
  });
  ipcMain.handle('config:tableInsert', (_e, table: string, row: Record<string, any>) => {
    registry.requireSession();
    if (registry.getSession()?.user?.role !== 'admin') throw new Error('Только администратор');
    const name = assertConfigTable(table);
    if (READONLY_TABLES.has(name)) throw new Error('Таблица только для чтения');
    const info = getDb().prepare(`PRAGMA table_info(${name})`).all() as any[];
    const cols = Object.keys(row || {}).filter((k) => info.some((c) => c.name === k));
    if (!cols.length) throw new Error('Пустая строка');
    const sql = `INSERT INTO ${name} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`;
    const r = getDb().prepare(sql).run(...cols.map((c) => row[c]));
    return { lastInsertRowid: r.lastInsertRowid };
  });
  ipcMain.handle('config:tableDelete', (_e, table: string, pk: any) => {
    registry.requireSession();
    if (registry.getSession()?.user?.role !== 'admin') throw new Error('Только администратор');
    const name = assertConfigTable(table);
    if (READONLY_TABLES.has(name)) throw new Error('Таблица только для чтения');
    const info = getDb().prepare(`PRAGMA table_info(${name})`).all() as any[];
    const pkCols = info.filter((c) => c.pk).map((c) => c.name);
    if (!pkCols.length) throw new Error('Нет первичного ключа');
    const where = pkCols.map((c) => `${c} = ?`).join(' AND ');
    return getDb().prepare(`DELETE FROM ${name} WHERE ${where}`).run(...pkCols.map((c) => pk[c])).changes;
  });
  ipcMain.handle('config:settingsList', () => {
    registry.requireSession();
    if (registry.getSession()?.user?.role !== 'admin') throw new Error('Только администратор');
    const rows = getDb().prepare(`
      SELECT key, value FROM schema_meta
      UNION ALL
      SELECT key, value FROM settings
      ORDER BY key
    `).all();
    return { rows, total: rows.length };
  });
  ipcMain.handle('config:settingsSave', (_e, key: string, value: string) => {
    registry.requireSession();
    if (registry.getSession()?.user?.role !== 'admin') throw new Error('Только администратор');
    const k = String(key || '').trim();
    if (!k) throw new Error('Укажите ключ');
    getDb().prepare(`
      INSERT INTO schema_meta (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(k, String(value ?? ''));
    return true;
  });
  ipcMain.handle('config:settingsDelete', (_e, key: string) => {
    registry.requireSession();
    if (registry.getSession()?.user?.role !== 'admin') throw new Error('Только администратор');
    getDb().prepare('DELETE FROM schema_meta WHERE key=?').run(String(key));
    try { getDb().prepare('DELETE FROM settings WHERE key=?').run(String(key)); } catch {  }
    return true;
  });
  ipcMain.handle('config:seedSandbox', () => {
    registry.requireSession();
    if (registry.getSession()?.user?.role !== 'admin') throw new Error('Только администратор');
    const db = getDb();
    db.prepare(`
      INSERT INTO schema_meta (key, value) VALUES ('sandbox.seeded_at', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(new Date().toISOString());
    return { ok: true, message: 'Песочница отмечена (данные организации не клонируются автоматически)' };
  });
  ipcMain.handle('config:clearSandbox', () => {
    registry.requireSession();
    if (registry.getSession()?.user?.role !== 'admin') throw new Error('Только администратор');
    getDb().prepare(`DELETE FROM schema_meta WHERE key = 'sandbox.seeded_at'`).run();
    return { ok: true };
  });

  ipcMain.handle('plugins:list', () => {
    registry.requireSession();
    requirePerm('settings');
    return plugins.ensurePluginsLoaded();
  });
  ipcMain.handle('plugins:reload', () => {
    registry.requireSession();
    requirePerm('settings');
    return plugins.reloadPlugins();
  });
  ipcMain.handle('plugins:setEnabled', (_e, id: string, enabled: boolean) => {
    registry.requireSession();
    requirePerm('settings');
    return plugins.setPluginEnabled(String(id), Boolean(enabled));
  });
  ipcMain.handle('plugins:runCommand', (_e, commandId: string) => {
    registry.requireSession();
    requirePerm('settings');
    const result = plugins.runPluginCommand(String(commandId));
    audit('plugins.run', 'plugin_command', null, String(commandId));
    return result;
  });
  ipcMain.handle('plugins:commands', () => {
    registry.requireSession();
    return plugins.listPluginCommands();
  });
  ipcMain.handle('plugins:root', () => {
    registry.requireSession();
    requirePerm('settings');
    return { root: plugins.getPluginsRoot() };
  });
  ipcMain.handle('events:recent', (_e, limit?: number) => {
    registry.requireSession();
    requirePerm('settings');
    return eventBus.listRecentEvents(limit);
  });

  ipcMain.handle('edoLegal:settings', () => {
    registry.requireSession();
    requirePerm('settings');
    return edoLegal.getEdoLegalSettings();
  });
  ipcMain.handle('edoLegal:saveSettings', (_e, data: any) => {
    registry.requireSession();
    requirePerm('settings');
    const st = edoLegal.saveEdoLegalSettings(data || {});
    audit('edo.legalSettings', 'edo_legal');
    return st;
  });
  ipcMain.handle('edoLegal:buildPackage', (_e, edoDocumentId: number) => {
    registry.requireSession();
    requirePerm('edo');
    const pkg = edoLegal.buildLegalPackage(Number(edoDocumentId));
    audit('edo.legalPackage', 'edo_legal_package', pkg.id, pkg.package_id);
    return pkg;
  });
  ipcMain.handle('edoLegal:listPackages', (_e, limit?: number) => {
    registry.requireSession();
    requirePerm('edo');
    return edoLegal.listLegalPackages(limit);
  });

  ipcMain.handle('devices:settings', () => {
    registry.requireSession();
    requirePerm('settings');
    return devices.getDeviceSettings();
  });
  ipcMain.handle('devices:saveSettings', (_e, data: any) => {
    registry.requireSession();
    requirePerm('settings');
    return devices.saveDeviceSettings(data || {});
  });
  ipcMain.handle('devices:buildZpl', (_e, item: any, opts?: any) => {
    registry.requireSession();
    return devices.buildZplLabel(item || {}, opts);
  });
  ipcMain.handle('devices:printZpl', async (_e, item: any, opts?: any) => {
    registry.requireSession();
    requirePerm('items');
    const zpl = devices.buildZplLabel(item || {}, opts);
    return devices.sendZplToPrinter(zpl);
  });
  ipcMain.handle('devices:readScale', async () => {
    registry.requireSession();
    requirePerm('items');
    return devices.readScaleWeight();
  });

  ipcMain.handle('exchange:listChannels', () => {
    registry.requireSession();
    requirePerm('settings');
    return exchange.listExchangeChannels();
  });
  ipcMain.handle('exchange:saveChannel', (_e, data: any) => {
    registry.requireSession();
    requirePerm('settings');
    const row = exchange.saveExchangeChannel(data);
    audit('exchange.channel', 'exchange_channel', row?.id, row?.name);
    return row;
  });
  ipcMain.handle('exchange:deleteChannel', (_e, id: number) => {
    registry.requireSession();
    requirePerm('settings');
    return exchange.deleteExchangeChannel(Number(id));
  });
  ipcMain.handle('exchange:exportCommerceMl', async () => {
    registry.requireSession();
    requirePerm('settings');
    return exchange.exportCommerceMl();
  });
  ipcMain.handle('exchange:importMarketplace', async (_e, channelId?: number) => {
    registry.requireSession();
    requirePerm('settings');
    return exchange.importMarketplaceOrders(channelId);
  });
  ipcMain.handle('exchange:listOrders', (_e, limit?: number) => {
    registry.requireSession();
    requirePerm('company');
    return exchange.listMarketplaceOrders(limit);
  });

  ipcMain.handle('workflow:listTransitions', () => {
    registry.requireSession();
    requirePerm('settings');
    return workflow.listWorkflowTransitions();
  });
  ipcMain.handle('workflow:saveTransitions', (_e, rows: any[]) => {
    registry.requireSession();
    requirePerm('settings');
    return workflow.saveWorkflowTransitions(rows || []);
  });
  ipcMain.handle('workflow:allowed', (_e, documentId: number) => {
    registry.requireSession();
    requirePerm('documents');
    return workflow.getAllowedTransitions(Number(documentId));
  });
  ipcMain.handle('workflow:apply', (_e, documentId: number, toStatus: string) => {
    registry.requireSession();
    requirePerm('documents');
    const result = workflow.applyWorkflowTransition(Number(documentId), String(toStatus));
    audit('documents.workflow', 'document', documentId, `${result.from}→${result.to}`);
    return result;
  });

  ipcMain.handle('tsd:enqueueStockCount', (_e, data: any) => {
    registry.requireSession();
    requirePerm('projects');
    return enqueueStockCount(data || {});
  });
  ipcMain.handle('tsd:flushNow', (_e, limit?: number) => {
    registry.requireSession();
    requirePerm('projects');
    return flushTsdOutbox(limit);
  });
  ipcMain.handle('tsd:status', () => {
    registry.requireSession();
    requirePerm('projects');
    return getTsdOutboxStatus();
  });
}
