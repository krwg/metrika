

import http from 'http';
import os from 'os';
import { URL } from 'url';
import { getDb } from './db';
import * as registry from './registry';
import * as crmHub from './crmHub';

let server: http.Server | null = null;
let listenPort: number | null = null;
let listenHost = '0.0.0.0';

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
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
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

async function handle(req: http.IncomingMessage, res: http.ServerResponse) {
  try {
    if (req.method === 'OPTIONS') {
      json(res, 204, {});
      return;
    }
    const host = req.headers.host || `127.0.0.1:${listenPort || 80}`;
    const url = new URL(req.url || '/', `http://${host}`);
    const pathName = url.pathname.replace(/\/+$/, '') || '/';

    if (req.method === 'GET' && (pathName === '/health' || pathName === '/v1/health')) {
      const session = registry.getSession();
      json(res, 200, {
        ok: true,
        service: 'metrika-crm-remote',
        remote_ready: Boolean(server?.listening),
        organization_id: session?.organization?.id ?? null,
        organization_name: session?.organization?.name ?? null,
      });
      return;
    }

    requireOrgSession();

    if (req.method === 'POST' && pathName === '/v1/portal/auth') {
      const body = await readBody(req);
      const auth = crmHub.resolvePortalAuthByToken(String(body.token || bearer(req)));
      const ctx = crmHub.withPortalAuth(auth, () => crmHub.getPortalContext());
      json(res, 200, { ok: true, ...ctx });
      return;
    }

    const token = bearer(req);
    if (!token) {
      json(res, 401, { error: 'Требуется Authorization: Bearer <portal_token>' });
      return;
    }
    const auth = crmHub.resolvePortalAuthByToken(token);

    if (req.method === 'GET' && pathName === '/v1/portal/context') {
      json(res, 200, crmHub.withPortalAuth(auth, () => crmHub.getPortalContext()));
      return;
    }
    if (req.method === 'GET' && pathName === '/v1/portal/threads') {
      json(res, 200, { threads: crmHub.withPortalAuth(auth, () => crmHub.listPortalThreads()) });
      return;
    }
    if (req.method === 'GET' && pathName.startsWith('/v1/portal/threads/')) {
      const id = Number(pathName.split('/').pop());
      if (!Number.isFinite(id)) throw new Error('Некорректный id диалога');
      json(res, 200, crmHub.withPortalAuth(auth, () => crmHub.getPortalThread(id)));
      return;
    }
    if (req.method === 'POST' && pathName === '/v1/portal/threads') {
      const body = await readBody(req);
      const thread = crmHub.withPortalAuth(auth, () => crmHub.startPortalThread(body || {}));
      json(res, 200, thread);
      return;
    }
    if (req.method === 'POST' && /^\/v1\/portal\/threads\/\d+\/messages$/.test(pathName)) {
      const id = Number(pathName.split('/')[4]);
      const body = await readBody(req);
      const thread = crmHub.withPortalAuth(auth, () =>
        crmHub.postPortalMessage(id, String(body.body || ''), body.client_msg_id));
      json(res, 200, thread);
      return;
    }
    if (req.method === 'GET' && pathName === '/v1/portal/events') {
      const since = Number(url.searchParams.get('since') || 0);
      const limit = Number(url.searchParams.get('limit') || 50);
      const events = crmHub.withPortalAuth(auth, () => crmHub.pollCrmEvents(since, limit));
      json(res, 200, { events });
      return;
    }

    json(res, 404, { error: 'Неизвестный маршрут' });
  } catch (e: any) {
    const msg = e?.message || 'Ошибка';
    const status = /токен|Authorization|недействителен/i.test(msg) ? 401
      : /сессии организации/i.test(msg) ? 503
        : 400;
    json(res, status, { error: msg });
  }
}

export function getCrmRemoteStatus() {
  const enabled = readMeta('setting:crm.remote.enabled', '0') === '1';
  const port = Math.max(1024, Math.min(65535, Number(readMeta('setting:crm.remote.port', '47831')) || 47831));
  const listening = Boolean(server?.listening);
  const addrs = lanAddresses();
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
    note: listening
      ? 'HTTP-мост активен: Метрика:Клиент на другом устройстве может работать по токену без доступа к SQLite.'
      : 'HTTP-мост выключен. Включите в CRM → Удалённый доступ.',
  };
}

export function setCrmRemotePort(port: number) {
  const n = Math.max(1024, Math.min(65535, Math.round(Number(port) || 47831)));
  writeMeta('setting:crm.remote.port', String(n));
  if (server?.listening) {
    stopCrmRemoteServer();
    startCrmRemoteServer(n);
  }
  return getCrmRemoteStatus();
}

export function startCrmRemoteServer(port?: number) {
  requireOrgSession();
  const status = getCrmRemoteStatus();
  const p = port != null ? Math.max(1024, Math.min(65535, Math.round(Number(port)))) : status.port;
  writeMeta('setting:crm.remote.port', String(p));
  writeMeta('setting:crm.remote.enabled', '1');
  if (server?.listening && listenPort === p) return getCrmRemoteStatus();
  stopCrmRemoteServer();
  server = http.createServer((req, res) => { void handle(req, res); });
  server.listen(p, listenHost);
  listenPort = p;
  server.on('error', (err) => {
    console.warn('[Metrika] CRM remote server error:', err);
  });
  return getCrmRemoteStatus();
}

export function stopCrmRemoteServer() {
  writeMeta('setting:crm.remote.enabled', '0');
  if (server) {
    try { server.close(); } catch {  }
    server = null;
  }
  listenPort = null;
  return getCrmRemoteStatus();
}

export function maybeAutostartCrmRemoteServer() {
  try {
    if (!registry.getSession()) return null;
    if (readMeta('setting:crm.remote.enabled', '0') !== '1') return null;
    return startCrmRemoteServer();
  } catch (e) {
    console.warn('[Metrika] CRM remote autostart failed:', e);
    return null;
  }
}
