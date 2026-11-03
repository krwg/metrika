

import { getDb, getDocWorkflowExtras, setDocumentWorkflowStatus, displayDocumentStatus } from './db';
import * as registry from './registry';
import * as eventBus from './eventBus';

export type WorkflowTransition = {
  id?: number;
  from_status: string;
  to_status: string;
  label?: string;
  roles?: string[];
  maps_to?: string;
};

function readTransitions(): WorkflowTransition[] {
  const db = getDb();
  try {
    const rows = db.prepare('SELECT * FROM doc_workflow_transitions ORDER BY id').all() as any[];
    if (rows.length) {
      return rows.map((r) => ({
        id: Number(r.id),
        from_status: r.from_status,
        to_status: r.to_status,
        label: r.label || undefined,
        roles: r.roles_json ? JSON.parse(r.roles_json) : [],
        maps_to: r.maps_to || undefined,
      }));
    }
  } catch {  }
  return defaultTransitions();
}

function defaultTransitions(): WorkflowTransition[] {
  const extras = getDocWorkflowExtras();
  const list: WorkflowTransition[] = [
    { from_status: 'draft', to_status: 'posted', label: 'Провести', maps_to: 'posted', roles: ['admin', 'user'] },
    { from_status: 'draft', to_status: 'cancelled', label: 'Отменить', maps_to: 'cancelled', roles: ['admin', 'user'] },
    { from_status: 'posted', to_status: 'cancelled', label: 'Сторно / отмена', maps_to: 'cancelled', roles: ['admin'] },
    { from_status: 'cancelled', to_status: 'draft', label: 'Вернуть в черновик', maps_to: 'draft', roles: ['admin'] },
  ];
  for (const ex of extras) {
    const code = String(ex.code || '');
    if (!code) continue;
    list.push(
      { from_status: 'draft', to_status: code, label: `→ ${ex.label}`, maps_to: ex.maps_to || 'draft', roles: ['admin', 'user'] },
      { from_status: code, to_status: 'posted', label: 'Провести', maps_to: 'posted', roles: ['admin', 'user'] },
      { from_status: code, to_status: 'cancelled', label: 'Отменить', maps_to: 'cancelled', roles: ['admin'] },
      { from_status: code, to_status: 'draft', label: 'В черновик', maps_to: 'draft', roles: ['admin'] },
    );
  }
  return list;
}

export function listWorkflowTransitions() {
  return readTransitions();
}

export function saveWorkflowTransitions(rows: WorkflowTransition[]) {
  const db = getDb();
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM doc_workflow_transitions').run();
    const ins = db.prepare(`
      INSERT INTO doc_workflow_transitions (from_status, to_status, label, roles_json, maps_to)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (const row of rows || []) {
      if (!row.from_status || !row.to_status) continue;
      ins.run(
        String(row.from_status),
        String(row.to_status),
        String(row.label || ''),
        JSON.stringify(row.roles || []),
        row.maps_to ? String(row.maps_to) : null,
      );
    }
  });
  tx();
  return listWorkflowTransitions();
}

export function getAllowedTransitions(documentId: number) {
  const db = getDb();
  const doc = db.prepare('SELECT id, status, workflow_status, doc_type FROM documents WHERE id = ?').get(Number(documentId)) as any;
  if (!doc) throw new Error('Документ не найден');
  const current = String(doc.workflow_status || doc.status || 'draft');
  const role = String(registry.getSession()?.user?.role || '');
  const allowed = readTransitions().filter((t) => {
    if (t.from_status !== current) return false;
    if (t.roles?.length && !t.roles.includes(role)) return false;
    return true;
  });
  return {
    document_id: Number(doc.id),
    current,
    display: displayDocumentStatus(doc),
    transitions: allowed,
  };
}

export function applyWorkflowTransition(documentId: number, toStatus: string) {
  const db = getDb();
  const info = getAllowedTransitions(documentId);
  const edge = info.transitions.find((t) => t.to_status === String(toStatus));
  if (!edge) throw new Error('Переход недоступен для вашей роли или текущего статуса');

  const mapsTo = edge.maps_to || (['draft', 'posted', 'cancelled'].includes(String(toStatus)) ? String(toStatus) : 'draft');
  if (['draft', 'posted', 'cancelled'].includes(mapsTo)) {
    db.prepare('UPDATE documents SET status = ? WHERE id = ?').run(mapsTo, Number(documentId));
  }
  if (['draft', 'posted', 'cancelled'].includes(String(toStatus))) {
    db.prepare('UPDATE documents SET workflow_status = NULL WHERE id = ?').run(Number(documentId));
  } else {
    setDocumentWorkflowStatus(Number(documentId), String(toStatus));
  }

  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(Number(documentId));
  void eventBus.emit('documents.workflow', {
    document_id: Number(documentId),
    from: info.current,
    to: toStatus,
    maps_to: mapsTo,
  });
  return {
    document: doc,
    display: displayDocumentStatus(doc as any),
    from: info.current,
    to: toStatus,
  };
}

export function ensureDefaultWorkflowSeed() {
  const db = getDb();
  const n = Number((db.prepare('SELECT COUNT(*) AS c FROM doc_workflow_transitions').get() as any)?.c || 0);
  if (n > 0) return n;
  saveWorkflowTransitions(defaultTransitions());
  return listWorkflowTransitions().length;
}
