

import http from 'http';
import os from 'os';
import crypto from 'crypto';
import { URL } from 'url';
import { getDb } from './db';
import * as registry from './registry';
import * as automation from './automation';

let server: http.Server | null = null;
let listenPort: number | null = null;
const listenHost = '0.0.0.0';
const DEFAULT_PORT = 47832;

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

function json(res: http.ServerResponse, status: number, body: any) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Metrika-Secret',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  });
  res.end(payload);
}

async function readBody(req: http.IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('Некорректный JSON');
  }
}

function bearer(req: http.IncomingMessage) {
  const h = String(req.headers.authorization || '');
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : '';
}

function lanAddresses() {
  const nets = os.networkInterfaces();
  const out: string[] = [];
  for (const list of Object.values(nets)) {
    for (const net of list || []) {
      if (net.family === 'IPv4' && !net.internal) out.push(net.address);
    }
  }
  return out;
}

function requireOrgSession() {
  if (!registry.getSession()) {
    throw new Error('Нет открытой сессии организации на сервере Метрики');
  }
}

function hashToken(raw: string) {
  return crypto.createHash('sha256').update(String(raw)).digest('hex');
}

export function issueMiapiToken(label?: string) {
  requireOrgSession();
  const db = getDb();
  const raw = `mi_${crypto.randomBytes(24).toString('base64url')}`;
  const session = registry.getSession();
  const r = db.prepare(`
    INSERT INTO miapi_tokens (token_hash, token_prefix, label, created_by_user_id)
    VALUES (?, ?, ?, ?)
  `).run(
    hashToken(raw),
    raw.slice(0, 12),
    String(label || '').trim() || 'MIAPI token',
    session?.user?.id ?? null,
  );
  return {
    id: Number(r.lastInsertRowid),
    token: raw,
    token_prefix: raw.slice(0, 12),
    label: String(label || '').trim() || 'MIAPI token',
    note: 'Сохраните токен сейчас — повторно показать его нельзя.',
  };
}

export function listMiapiTokens() {
  return getDb().prepare(`
    SELECT id, token_prefix, label, created_by_user_id, created_at, last_used_at, revoked_at
    FROM miapi_tokens
    ORDER BY id DESC
    LIMIT 200
  `).all();
}

export function revokeMiapiToken(id: number) {
  return getDb().prepare(`
    UPDATE miapi_tokens SET revoked_at = CURRENT_TIMESTAMP
    WHERE id = ? AND revoked_at IS NULL
  `).run(Number(id)).changes;
}

function resolveMiapiToken(rawToken: string) {
  const raw = String(rawToken || '').trim();
  if (!raw) throw new Error('Укажите API-токен');
  const row = getDb().prepare(`
    SELECT * FROM miapi_tokens WHERE token_hash = ? AND revoked_at IS NULL
  `).get(hashToken(raw)) as any;
  if (!row) throw new Error('Токен недействителен или отозван');
  getDb().prepare('UPDATE miapi_tokens SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?').run(Number(row.id));
  return row;
}

function listItemsLite(search?: string, limit = 100) {
  const db = getDb();
  const lim = Math.min(500, Math.max(1, Number(limit) || 100));
  const q = String(search || '').trim();
  if (q) {
    const like = `%${q}%`;
    return db.prepare(`
      SELECT i.id, i.name, i.sku, i.barcode, i.category, i.min_stock, i.max_stock, i.reorder_point,
        i.cost_price, i.item_type, COALESCE(SUM(inv.quantity), 0) AS on_hand
      FROM items i
      LEFT JOIN inventory inv ON inv.item_id = i.id
      WHERE i.name LIKE ? OR IFNULL(i.sku,'') LIKE ? OR IFNULL(i.barcode,'') LIKE ?
         OR EXISTS (SELECT 1 FROM item_barcodes b WHERE b.item_id = i.id AND b.barcode LIKE ?)
      GROUP BY i.id
      ORDER BY i.name
      LIMIT ?
    `).all(like, like, like, like, lim);
  }
  return db.prepare(`
    SELECT i.id, i.name, i.sku, i.barcode, i.category, i.min_stock, i.max_stock, i.reorder_point,
      i.cost_price, i.item_type, COALESCE(SUM(inv.quantity), 0) AS on_hand
    FROM items i
    LEFT JOIN inventory inv ON inv.item_id = i.id
    GROUP BY i.id
    ORDER BY i.name
    LIMIT ?
  `).all(lim);
}

function getItemLite(id: number) {
  const db = getDb();
  const item = db.prepare(`
    SELECT i.id, i.name, i.sku, i.barcode, i.category, i.min_stock, i.max_stock, i.reorder_point,
      i.cost_price, i.item_type, u.name AS unit_name, u.symbol AS unit_symbol
    FROM items i
    LEFT JOIN units u ON u.id = i.unit_id
    WHERE i.id = ?
  `).get(Number(id)) as any;
  if (!item) return null;
  const stock = db.prepare(`
    SELECT l.id AS location_id, l.name AS location_name, SUM(inv.quantity) AS on_hand
    FROM inventory inv
    JOIN locations l ON l.id = inv.location_id
    WHERE inv.item_id = ?
    GROUP BY l.id, l.name
    HAVING on_hand != 0
  `).all(Number(id));
  return { ...item, stock };
}

function listStockLite(itemId?: number, limit = 200) {
  const db = getDb();
  const lim = Math.min(1000, Math.max(1, Number(limit) || 200));
  if (itemId) {
    return db.prepare(`
      SELECT inv.item_id, i.name AS item_name, i.sku, inv.location_id, l.name AS location_name,
        inv.lot_id, lots.lot_no, inv.quantity AS on_hand
      FROM inventory inv
      JOIN items i ON i.id = inv.item_id
      JOIN locations l ON l.id = inv.location_id
      LEFT JOIN lots ON lots.id = inv.lot_id
      WHERE inv.item_id = ? AND inv.quantity != 0
      ORDER BY l.name
      LIMIT ?
    `).all(Number(itemId), lim);
  }
  return db.prepare(`
    SELECT inv.item_id, i.name AS item_name, i.sku, inv.location_id, l.name AS location_name,
      inv.lot_id, lots.lot_no, inv.quantity AS on_hand
    FROM inventory inv
    JOIN items i ON i.id = inv.item_id
    JOIN locations l ON l.id = inv.location_id
    LEFT JOIN lots ON lots.id = inv.lot_id
    WHERE inv.quantity != 0
    ORDER BY i.name, l.name
    LIMIT ?
  `).all(lim);
}

function listDocumentsLite(limit = 100) {
  const lim = Math.min(500, Math.max(1, Number(limit) || 100));
  return getDb().prepare(`
    SELECT id, doc_type, doc_no, status, workflow_status, party, note, doc_date, created_at, posted_at
    FROM documents
    ORDER BY id DESC
    LIMIT ?
  `).all(lim);
}

async function handle(req: http.IncomingMessage, res: http.ServerResponse) {
  try {
    if (req.method === 'OPTIONS') {
      json(res, 204, {});
      return;
    }
    const host = req.headers.host || `127.0.0.1:${listenPort || DEFAULT_PORT}`;
    const url = new URL(req.url || '/', `http://${host}`);
    const pathName = url.pathname.replace(/\/+$/, '') || '/';

    if (req.method === 'GET' && (pathName === '/health' || pathName === '/v1/health')) {
      const session = registry.getSession();
      json(res, 200, {
        ok: true,
        service: 'metrika-miapi',
        version: '0.5',
        remote_ready: Boolean(server?.listening),
        organization_id: session?.organization?.id ?? null,
        organization_name: session?.organization?.name ?? null,
      });
      return;
    }

    requireOrgSession();

    if (req.method === 'POST' && (pathName === '/v1/webhooks/incoming' || pathName === '/v1/hooks')) {
      const body = await readBody(req);
      const secretHdr = String(req.headers['x-metrika-secret'] || '');
      const expected = readMeta('setting:miapi.webhook_secret', '');
      const token = bearer(req);
      let authorized = false;
      if (expected && secretHdr && secretHdr === expected) authorized = true;
      if (!authorized && token) {
        resolveMiapiToken(token);
        authorized = true;
      }
      if (!authorized) {
        json(res, 401, { error: 'Требуется X-Metrika-Secret или Bearer API-токен' });
        return;
      }
      const event = String(body.event || body.trigger || 'incoming_webhook');
      const detail = String(body.detail || body.message || `Входящий webhook: ${event}`);
      const fired = automation.evaluateTrigger('incoming_webhook', {
        detail,
        event,
        entity: body.entity || 'webhook',
        entity_id: body.entity_id ?? null,
        payload: body,
      });
      registry.logAudit('miapi.incomingWebhook', {
        entity: 'webhook',
        entityId: null,
        detail: `${event} · rules=${fired.length}`,
      });
      json(res, 200, { ok: true, event, fired: fired.length, results: fired });
      return;
    }

    const token = bearer(req);
    if (!token) {
      json(res, 401, { error: 'Требуется Authorization: Bearer <miapi_token>' });
      return;
    }
    resolveMiapiToken(token);

    if (req.method === 'GET' && pathName === '/v1/items') {
      const items = listItemsLite(url.searchParams.get('q') || undefined, Number(url.searchParams.get('limit') || 100));
      json(res, 200, { items });
      return;
    }
    if (req.method === 'GET' && /^\/v1\/items\/\d+$/.test(pathName)) {
      const id = Number(pathName.split('/').pop());
      const item = getItemLite(id);
      if (!item) {
        json(res, 404, { error: 'Товар не найден' });
        return;
      }
      json(res, 200, item);
      return;
    }
    if (req.method === 'GET' && pathName === '/v1/stock') {
      const itemId = url.searchParams.get('item_id');
      const rows = listStockLite(itemId ? Number(itemId) : undefined, Number(url.searchParams.get('limit') || 200));
      json(res, 200, { stock: rows });
      return;
    }
    if (req.method === 'GET' && pathName === '/v1/documents') {
      json(res, 200, { documents: listDocumentsLite(Number(url.searchParams.get('limit') || 100)) });
      return;
    }

    json(res, 404, { error: 'Неизвестный маршрут MIAPI' });
  } catch (e: any) {
    const msg = e?.message || 'Ошибка';
    const status = /токен|Authorization|Secret|недействителен/i.test(msg) ? 401
      : /сессии организации/i.test(msg) ? 503
        : 400;
    json(res, status, { error: msg });
  }
}

export function getMiapiStatus() {
  const enabled = readMeta('setting:miapi.enabled', '0') === '1';
  const port = Math.max(1024, Math.min(65535, Number(readMeta('setting:miapi.port', String(DEFAULT_PORT))) || DEFAULT_PORT));
  const listening = Boolean(server?.listening);
  const addrs = lanAddresses();
  const hasWebhookSecret = Boolean(readMeta('setting:miapi.webhook_secret', ''));
  return {
    enabled,
    listening,
    port: listenPort || port,
    host: listenHost,
    urls: listening
      ? [`http://127.0.0.1:${listenPort}`, ...addrs.map((a) => `http://${a}:${listenPort}`)]
      : [],
    lan_addresses: addrs,
    remote_ready: listening,
    webhook_secret_set: hasWebhookSecret,
    endpoints: [
      'GET /v1/health',
      'GET /v1/items?q=&limit=',
      'GET /v1/items/:id',
      'GET /v1/stock?item_id=&limit=',
      'GET /v1/documents?limit=',
      'POST /v1/webhooks/incoming',
    ],
    note: listening
      ? 'MIAPI активен: внешние системы могут читать склад и слать входящие webhooks.'
      : 'MIAPI выключен. Включите в Настройки → Интеграции.',
  };
}

export function setMiapiPort(port: number) {
  const n = Math.max(1024, Math.min(65535, Math.round(Number(port) || DEFAULT_PORT)));
  writeMeta('setting:miapi.port', String(n));
  if (server?.listening) {
    stopMiapiServer();
    startMiapiServer(n);
  }
  return getMiapiStatus();
}

export function setMiapiWebhookSecret(secret: string) {
  writeMeta('setting:miapi.webhook_secret', String(secret || '').trim());
  return getMiapiStatus();
}

export function startMiapiServer(port?: number) {
  requireOrgSession();
  const status = getMiapiStatus();
  const p = port != null ? Math.max(1024, Math.min(65535, Math.round(Number(port)))) : status.port;
  writeMeta('setting:miapi.port', String(p));
  writeMeta('setting:miapi.enabled', '1');
  if (server?.listening && listenPort === p) return getMiapiStatus();
  stopMiapiServer();
  server = http.createServer((req, res) => { void handle(req, res); });
  server.listen(p, listenHost);
  listenPort = p;
  server.on('error', (err) => {
    console.warn('[Metrika] MIAPI server error:', err);
  });
  return getMiapiStatus();
}

export function stopMiapiServer() {
  writeMeta('setting:miapi.enabled', '0');
  if (server) {
    try { server.close(); } catch {  }
    server = null;
  }
  listenPort = null;
  return getMiapiStatus();
}

export function maybeAutostartMiapiServer() {
  try {
    if (!registry.getSession()) return null;
    if (readMeta('setting:miapi.enabled', '0') !== '1') return null;
    return startMiapiServer();
  } catch (e) {
    console.warn('[Metrika] MIAPI autostart failed:', e);
    return null;
  }
}
