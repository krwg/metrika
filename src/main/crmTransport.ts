


import { BrowserWindow } from 'electron';
import { getDb } from './db';

export type CrmTransportKind = 'local_sqlite' | 'remote_http' | 'hybrid';

export type CrmTransportEvent = {
  id: number;
  kind: string;
  thread_id?: number | null;
  case_id?: number | null;
  counterparty_id?: number | null;
  payload?: any;
  created_at?: string;
};

export interface CrmMessageTransport {
  kind: CrmTransportKind;
  describe(): {
    kind: CrmTransportKind;
    remote_ready: boolean;
    note: string;
    listen?: {
      port: number | null;
      urls: string[];
    };
  };
  publish(input: {
    kind: string;
    thread_id?: number | null;
    case_id?: number | null;
    counterparty_id?: number | null;
    payload?: any;
  }): CrmTransportEvent;
  pollSince(sinceId: number, limit?: number): CrmTransportEvent[];
}

function broadcastCrmChanged(event: CrmTransportEvent) {
  for (const win of BrowserWindow.getAllWindows()) {
    try {
      if (!win.isDestroyed()) win.webContents.send('crm:changed', event);
    } catch {  }
  }
}

function safeJson(raw: string) {
  try { return JSON.parse(raw); } catch { return null; }
}

class LocalSqliteTransport implements CrmMessageTransport {
  kind: CrmTransportKind = 'local_sqlite';

  describe() {
    let remote: { listening?: boolean; port?: number | null; urls?: string[] } = {};
    try {

      const remoteMod = require('./crmRemoteServer') as typeof import('./crmRemoteServer');
      remote = remoteMod.getCrmRemoteStatus();
    } catch {  }
    const listening = Boolean(remote.listening);
    return {
      kind: (listening ? 'hybrid' : 'local_sqlite') as CrmTransportKind,
      remote_ready: listening,
      note: listening
        ? 'LocalSqlite + HTTP-мост: локальные окна и удалённый Метрика:Клиент по токену.'
        : 'Локальный адаптер: org SQLite + события окон. Включите HTTP-мост для другого устройства.',
      listen: {
        port: remote.port ?? null,
        urls: remote.urls || [],
      },
    };
  }

  publish(input: {
    kind: string;
    thread_id?: number | null;
    case_id?: number | null;
    counterparty_id?: number | null;
    payload?: any;
  }): CrmTransportEvent {
    const db = getDb();
    const result = db.prepare(`
      INSERT INTO crm_transport_events (kind, thread_id, case_id, counterparty_id, payload_json)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      String(input.kind || 'unknown'),
      input.thread_id != null ? Number(input.thread_id) : null,
      input.case_id != null ? Number(input.case_id) : null,
      input.counterparty_id != null ? Number(input.counterparty_id) : null,
      input.payload != null ? JSON.stringify(input.payload) : null,
    );
    const row = db.prepare('SELECT * FROM crm_transport_events WHERE id = ?').get(Number(result.lastInsertRowid)) as any;
    const event: CrmTransportEvent = {
      id: Number(row.id),
      kind: row.kind,
      thread_id: row.thread_id,
      case_id: row.case_id,
      counterparty_id: row.counterparty_id,
      payload: row.payload_json ? safeJson(row.payload_json) : null,
      created_at: row.created_at,
    };
    broadcastCrmChanged(event);
    return event;
  }

  pollSince(sinceId: number, limit = 100): CrmTransportEvent[] {
    const db = getDb();
    const rows = db.prepare(`
      SELECT * FROM crm_transport_events
      WHERE id > ?
      ORDER BY id ASC
      LIMIT ?
    `).all(Number(sinceId) || 0, Math.min(500, Math.max(1, Number(limit) || 100))) as any[];
    return rows.map((row) => ({
      id: Number(row.id),
      kind: row.kind,
      thread_id: row.thread_id,
      case_id: row.case_id,
      counterparty_id: row.counterparty_id,
      payload: row.payload_json ? safeJson(row.payload_json) : null,
      created_at: row.created_at,
    }));
  }
}

let transport: CrmMessageTransport | null = null;

export function getCrmTransport(): CrmMessageTransport {
  if (!transport) transport = new LocalSqliteTransport();
  return transport;
}

export function describeCrmTransport() {
  return getCrmTransport().describe();
}
