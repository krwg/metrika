

import fs from 'fs';
import path from 'path';
import { dialog, app } from 'electron';
import { getDb } from './db';
import * as registry from './registry';
import * as eventBus from './eventBus';

function readMeta(key: string, fallback = '') {
  try {
    return String((getDb().prepare('SELECT value FROM schema_meta WHERE key = ?').get(key) as any)?.value ?? fallback);
  } catch {
    return fallback;
  }
}

function writeMeta(key: string, value: string) {
  getDb().prepare(`
    INSERT INTO schema_meta (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, value);
}

function esc(s: any) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function listExchangeChannels() {
  return getDb().prepare(`
    SELECT id, kind, name, enabled, config_json, last_sync_at, last_error, created_at
    FROM exchange_channels
    ORDER BY id DESC
  `).all().map((row: any) => ({
    ...row,
    config: safeJson(row.config_json, {}),
    enabled: Boolean(row.enabled),
  }));
}

function safeJson(raw: any, fallback: any) {
  try {
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function saveExchangeChannel(data: any) {
  const db = getDb();
  const kind = String(data.kind || 'commerce_ml');
  const name = String(data.name || '').trim() || kind;
  const enabled = data.enabled === 0 || data.enabled === false ? 0 : 1;
  const configJson = JSON.stringify(data.config || {});
  if (data.id) {
    db.prepare(`
      UPDATE exchange_channels SET kind = ?, name = ?, enabled = ?, config_json = ?
      WHERE id = ?
    `).run(kind, name, enabled, configJson, Number(data.id));
    return listExchangeChannels().find((c) => c.id === Number(data.id));
  }
  const r = db.prepare(`
    INSERT INTO exchange_channels (kind, name, enabled, config_json) VALUES (?, ?, ?, ?)
  `).run(kind, name, enabled, configJson);
  return listExchangeChannels().find((c) => c.id === Number(r.lastInsertRowid));
}

export function deleteExchangeChannel(id: number) {
  return getDb().prepare('DELETE FROM exchange_channels WHERE id = ?').run(Number(id)).changes;
}

export async function exportCommerceMl(filePath?: string) {
  const db = getDb();
  const session = registry.getSession();
  const items = db.prepare(`
    SELECT i.id, i.name, i.sku, i.barcode, i.cost_price, i.category,
      COALESCE(SUM(inv.quantity), 0) AS on_hand
    FROM items i
    LEFT JOIN inventory inv ON inv.item_id = i.id
    GROUP BY i.id
    ORDER BY i.name
  `).all() as any[];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<КоммерческаяИнформация ВерсияСхемы="2.10" ДатаФормирования="${new Date().toISOString()}">
  <Классификатор>
    <Ид>metrika-org-${esc(session?.organization?.id)}</Ид>
    <Наименование>${esc(session?.organization?.name || 'Организация')}</Наименование>
  </Классификатор>
  <Каталог СодержитТолькоИзменения="false">
    <Ид>metrika-catalog</Ид>
    <ИдКлассификатора>metrika-org-${esc(session?.organization?.id)}</ИдКлассификатора>
    <Наименование>Каталог Метрика</Наименование>
    <Товары>
${items.map((it) => `      <Товар>
        <Ид>${it.id}</Ид>
        <Артикул>${esc(it.sku || '')}</Артикул>
        <Наименование>${esc(it.name)}</Наименование>
        <БазоваяЕдиница Код="796" НаименованиеПолное="Штука" МеждународноеСокращение="PCE">шт</БазоваяЕдиница>
        <Штрихкод>${esc(it.barcode || '')}</Штрихкод>
        <Группы><Ид>${esc(it.category || 'без-категории')}</Ид></Группы>
        <СтавкиНалогов><СтавкаНалога><Наименование>НДС</Наименование><Ставка>без НДС</Ставка></СтавкаНалога></СтавкиНалогов>
      </Товар>`).join('\n')}
    </Товары>
  </Каталог>
  <ПакетПредложений СодержитТолькоИзменения="false">
    <Ид>metrika-offers</Ид>
    <Наименование>Предложения</Наименование>
    <Предложения>
${items.map((it) => `      <Предложение>
        <Ид>${it.id}</Ид>
        <Количество>${Number(it.on_hand) || 0}</Количество>
        <Цены><Цена><Представление>${Number(it.cost_price) || 0} RUB за шт</Представление><ИдТипаЦены>sale</ИдТипаЦены><ЦенаЗаЕдиницу>${Number(it.cost_price) || 0}</ЦенаЗаЕдиницу><Валюта>RUB</Валюта></Цена></Цены>
      </Предложение>`).join('\n')}
    </Предложения>
  </ПакетПредложений>
</КоммерческаяИнформация>
`;

  let dest = filePath;
  if (!dest) {
    const result = await dialog.showSaveDialog({
      defaultPath: path.join(app.getPath('documents'), `metrika-commerceml-${Date.now()}.xml`),
      filters: [{ name: 'CommerceML', extensions: ['xml'] }],
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    dest = result.filePath;
  }
  fs.writeFileSync(dest, xml, 'utf8');
  writeMeta('setting:exchange.last_commerceml', dest);
  void eventBus.emit('exchange.commerceml.exported', { path: dest, items: items.length });
  return { ok: true, path: dest, items: items.length };
}

export async function importMarketplaceOrders(channelId?: number) {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [
      { name: 'Orders', extensions: ['json', 'csv', 'txt'] },
      { name: 'All', extensions: ['*'] },
    ],
  });
  if (result.canceled || !result.filePaths[0]) return { canceled: true };
  const file = result.filePaths[0];
  const raw = fs.readFileSync(file, 'utf8');
  const orders = parseOrdersFile(raw, file);
  const db = getDb();
  let created = 0;
  const ch = channelId
    ? db.prepare('SELECT * FROM exchange_channels WHERE id = ?').get(Number(channelId)) as any
    : null;

  for (const order of orders) {
    const externalId = String(order.external_id || order.id || `${path.basename(file)}-${created + 1}`);
    const exists = db.prepare(`
      SELECT id FROM marketplace_orders WHERE channel_id IS ? AND external_id = ?
    `).get(ch?.id ?? null, externalId);
    if (exists) continue;

    const r = db.prepare(`
      INSERT INTO marketplace_orders (
        channel_id, external_id, status, customer_name, total_amount, payload_json
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      ch?.id ?? null,
      externalId,
      String(order.status || 'new'),
      String(order.customer || order.customer_name || ''),
      Number(order.total || order.total_amount || 0) || null,
      JSON.stringify(order),
    );

    for (const line of order.lines || []) {
      const sku = String(line.sku || '').trim();
      let itemId: number | null = null;
      if (sku) {
        itemId = Number((db.prepare('SELECT id FROM items WHERE sku = ? OR barcode = ?').get(sku, sku) as any)?.id) || null;
      }
      db.prepare(`
        INSERT INTO marketplace_order_lines (order_id, item_id, sku, name, qty, price)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        Number(r.lastInsertRowid),
        itemId,
        sku || null,
        String(line.name || sku || ''),
        Number(line.qty || line.quantity || 1) || 1,
        Number(line.price || 0) || null,
      );
    }
    created += 1;
  }

  if (ch?.id) {
    db.prepare('UPDATE exchange_channels SET last_sync_at = CURRENT_TIMESTAMP, last_error = NULL WHERE id = ?')
      .run(Number(ch.id));
  }
  void eventBus.emit('exchange.marketplace.imported', { created, file });
  return { ok: true, created, file, total_parsed: orders.length };
}

function parseOrdersFile(raw: string, file: string): any[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  if (file.endsWith('.json') || trimmed.startsWith('[') || trimmed.startsWith('{')) {
    const data = JSON.parse(trimmed);
    if (Array.isArray(data)) return data;
    if (Array.isArray(data.orders)) return data.orders;
    return [data];
  }

  const lines = trimmed.split(/\r?\n/).filter(Boolean);
  const out: any[] = [];
  const map = new Map<string, any>();
  for (const line of lines.slice(1)) {
    const parts = line.split(/[;,]/);
    const external_id = (parts[0] || '').trim() || `row-${out.length}`;
    const sku = (parts[1] || '').trim();
    const qty = Number(parts[2] || 1) || 1;
    const price = Number(parts[3] || 0) || 0;
    const customer = (parts[4] || '').trim();
    if (!map.has(external_id)) {
      map.set(external_id, { external_id, customer, status: 'new', lines: [], total: 0 });
    }
    const o = map.get(external_id);
    o.lines.push({ sku, qty, price });
    o.total += qty * price;
  }
  return [...map.values()];
}

export function listMarketplaceOrders(limit = 100) {
  return getDb().prepare(`
    SELECT o.*, c.name AS channel_name, c.kind AS channel_kind,
      (SELECT COUNT(*) FROM marketplace_order_lines l WHERE l.order_id = o.id) AS lines
    FROM marketplace_orders o
    LEFT JOIN exchange_channels c ON c.id = o.channel_id
    ORDER BY o.id DESC
    LIMIT ?
  `).all(Math.min(500, Math.max(1, limit)));
}
