


import { BrowserWindow, dialog } from 'electron';
import fs from 'fs';
import {
  getDb,
  listCounterpartyCustomValues,
  listEmployeeCustomValues,
  saveCounterpartyCustomValues,
  saveEmployeeCustomValues,
} from './db';
import * as registry from './registry';
import {
  applyCatalogTemplate,
  getEdoCatalogItem,
  listEdoCatalog,
  type EdoCatalogItem,
} from './edoCatalog';
import { enrichEdoRow, nextEdoRegNo, resolveEdoIdentity } from './edoTags';

export const EDO_FORMS = [
  { id: 'service_note', label: 'Служебная записка' },
  { id: 'order', label: 'Приказ' },
  { id: 'assignment', label: 'Поручение' },
  { id: 'application', label: 'Заявление' },
  { id: 'act', label: 'Акт' },
  { id: 'memo', label: 'Служебное письмо' },
  { id: 'other', label: 'Прочий документ' },
] as const;

export { listEdoCatalog, getEdoCatalogItem, applyCatalogTemplate };

export type EdoFormType = (typeof EDO_FORMS)[number]['id'];

export const EDO_STATUS_LABELS: Record<string, string> = {
  draft: 'Черновик',
  sent: 'На подписании',
  signed: 'Подписан',
  rejected: 'Отклонён',
  cancelled: 'Отменён',
};

function fio(row: { last_name?: string; first_name?: string; middle_name?: string; display_name?: string; name?: string }) {
  const parts = [row.last_name, row.first_name, row.middle_name].filter(Boolean);
  if (parts.length) return parts.join(' ');
  return String(row.display_name || row.name || '').trim();
}

function nextDocNo(prefix: string, table: string, col = 'doc_no') {
  const db = getDb();
  const year = new Date().getFullYear();
  const like = `${prefix}-${year}-%`;
  const last = db.prepare(`SELECT ${col} AS n FROM ${table} WHERE ${col} LIKE ? ORDER BY id DESC LIMIT 1`).get(like) as any;
  let seq = 1;
  if (last?.n) {
    const m = String(last.n).match(/-(\d+)$/);
    if (m) seq = Number(m[1]) + 1;
  }
  return `${prefix}-${year}-${String(seq).padStart(4, '0')}`;
}



export function listEmployees(filters: { q?: string; activeOnly?: boolean } = {}) {
  const db = getDb();
  let sql = 'SELECT * FROM employees WHERE 1=1';
  const params: any[] = [];
  if (filters.activeOnly !== false) {
    sql += ' AND is_active = 1';
  }
  if (filters.q?.trim()) {
    sql += ` AND (
      last_name LIKE ? OR first_name LIKE ? OR IFNULL(middle_name,'') LIKE ?
      OR IFNULL(position,'') LIKE ? OR IFNULL(department,'') LIKE ?
      OR IFNULL(tab_no,'') LIKE ?
    )`;
    const q = `%${filters.q.trim()}%`;
    params.push(q, q, q, q, q, q);
  }
  sql += ' ORDER BY last_name, first_name, id';
  return (db.prepare(sql).all(...params) as any[]).map((row) => ({ ...row, full_name: fio(row) }));
}

export function getEmployee(id: number) {
  const row = getDb().prepare('SELECT * FROM employees WHERE id = ?').get(Number(id)) as any;
  if (!row) return null;
  return {
    ...row,
    full_name: fio(row),
    custom_values: listEmployeeCustomValues(Number(id)),
  };
}

export function saveEmployee(data: any) {
  const db = getDb();
  const lastName = String(data.last_name || '').trim();
  const firstName = String(data.first_name || '').trim();
  if (!lastName || !firstName) throw new Error('Укажите фамилию и имя сотрудника');
  const payload = {
    last_name: lastName,
    first_name: firstName,
    middle_name: String(data.middle_name || '').trim() || null,
    position: String(data.position || '').trim() || null,
    department: String(data.department || '').trim() || null,
    phone: String(data.phone || '').trim() || null,
    email: String(data.email || '').trim() || null,
    hire_date: String(data.hire_date || '').trim() || null,
    fire_date: String(data.fire_date || '').trim() || null,
    tab_no: String(data.tab_no || '').trim() || null,
    notes: String(data.notes || '').trim() || null,
    registry_user_id: data.registry_user_id ? Number(data.registry_user_id) : null,
    is_active: data.is_active === 0 || data.is_active === false ? 0 : 1,
  };
  const id = data.id ? Number(data.id) : 0;
  let employeeId = id;
  if (id) {
    db.prepare(`
      UPDATE employees SET
        last_name=?, first_name=?, middle_name=?, position=?, department=?,
        phone=?, email=?, hire_date=?, fire_date=?, tab_no=?, notes=?,
        registry_user_id=?, is_active=?, updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).run(
      payload.last_name, payload.first_name, payload.middle_name, payload.position, payload.department,
      payload.phone, payload.email, payload.hire_date, payload.fire_date, payload.tab_no, payload.notes,
      payload.registry_user_id, payload.is_active, id,
    );
  } else {
    const result = db.prepare(`
      INSERT INTO employees (
        last_name, first_name, middle_name, position, department,
        phone, email, hire_date, fire_date, tab_no, notes, registry_user_id, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      payload.last_name, payload.first_name, payload.middle_name, payload.position, payload.department,
      payload.phone, payload.email, payload.hire_date, payload.fire_date, payload.tab_no, payload.notes,
      payload.registry_user_id, payload.is_active,
    );
    employeeId = Number(result.lastInsertRowid);
  }
  if (employeeId && (data.custom_values != null || data.custom_fields != null)) {
    saveEmployeeCustomValues(employeeId, data.custom_values ?? data.custom_fields);
  }
  return getEmployee(employeeId);
}

export function deleteEmployee(id: number) {

  return getDb().prepare('UPDATE employees SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(Number(id)).changes;
}



export function listEdoTemplates(filters: { activeOnly?: boolean; form_type?: string; q?: string; category?: string } = {}) {
  const db = getDb();
  let sql = 'SELECT * FROM edo_templates WHERE 1=1';
  const params: any[] = [];
  if (filters.activeOnly !== false) {
    sql += ' AND is_active = 1';
  }
  if (filters.form_type) {
    sql += ' AND form_type = ?';
    params.push(filters.form_type);
  }
  if (filters.category) {
    sql += ' AND IFNULL(category,\'\') = ?';
    params.push(filters.category);
  }
  if (filters.q?.trim()) {
    const q = `%${filters.q.trim()}%`;
    sql += ` AND (
      name LIKE ? OR IFNULL(code,'') LIKE ? OR IFNULL(description,'') LIKE ?
      OR IFNULL(keywords,'') LIKE ? OR IFNULL(body_template,'') LIKE ?
    )`;
    params.push(q, q, q, q, q);
  }
  sql += ' ORDER BY sort_order, name, id';
  return (db.prepare(sql).all(...params) as any[]).map((row) => ({
    ...row,
    form_label: EDO_FORMS.find((f) => f.id === row.form_type)?.label || row.form_type,
  }));
}


export function syncEdoCatalogTemplates() {
  const db = getDb();
  const upsert = db.prepare(`
    INSERT INTO edo_templates (
      code, name, form_type, title_template, body_template, description,
      is_active, sort_order, category, keywords, fields_json
    ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
    ON CONFLICT(code) DO UPDATE SET
      name=excluded.name,
      form_type=excluded.form_type,
      title_template=excluded.title_template,
      body_template=excluded.body_template,
      description=excluded.description,
      sort_order=excluded.sort_order,
      category=excluded.category,
      keywords=excluded.keywords,
      fields_json=excluded.fields_json,
      is_active=1,
      updated_at=CURRENT_TIMESTAMP
  `);

  const byCode = db.prepare('SELECT id FROM edo_templates WHERE code = ?');
  const update = db.prepare(`
    UPDATE edo_templates SET
      name=?, form_type=?, title_template=?, body_template=?, description=?,
      sort_order=?, category=?, keywords=?, fields_json=?, is_active=1, updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `);
  const insert = db.prepare(`
    INSERT INTO edo_templates (
      code, name, form_type, title_template, body_template, description,
      is_active, sort_order, category, keywords, fields_json
    ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
  `);
  let n = 0;
  for (const item of listEdoCatalog() as EdoCatalogItem[]) {
    const fieldsJson = JSON.stringify(item.fields || []);
    const existing = byCode.get(item.code) as any;
    if (existing?.id) {
      update.run(
        item.name, item.form_type, item.title_template, item.body_template, item.description,
        item.sort_order, item.category, item.keywords, fieldsJson, existing.id,
      );
    } else {
      try {
        upsert.run(
          item.code, item.name, item.form_type, item.title_template, item.body_template,
          item.description, item.sort_order, item.category, item.keywords, fieldsJson,
        );
      } catch {
        insert.run(
          item.code, item.name, item.form_type, item.title_template, item.body_template,
          item.description, item.sort_order, item.category, item.keywords, fieldsJson,
        );
      }
    }
    n += 1;
  }
  return { synced: n };
}


export function ensureEmployeeForUser(userId: number, userRow?: any) {
  const uid = Number(userId) || 0;
  if (!uid) return null;
  const existing = getDb().prepare(
    'SELECT * FROM employees WHERE registry_user_id = ? AND is_active = 1 ORDER BY id LIMIT 1',
  ).get(uid) as any;
  if (existing) return { ...existing, full_name: fio(existing) };

  let u = userRow;
  if (!u) {
    try {
      const orgId = registry.getSession()?.organization?.id;
      const users = registry.listUsers(orgId);
      u = (users || []).find((x: any) => Number(x.id) === uid);
    } catch {  }
  }
  if (!u) {
    try {
      const users = registry.listUsers();
      u = (users || []).find((x: any) => Number(x.id) === uid);
    } catch {  }
  }
  if (!u) return null;

  const last = String(u.last_name || '').trim() || String(u.display_name || u.login || 'Пользователь').trim();
  const first = String(u.first_name || '').trim() || 'Метрики';
  const role = String(u.role || '');
  return saveEmployee({
    last_name: last,
    first_name: first,
    middle_name: u.middle_name || '',
    position: role === 'admin' ? 'Администратор' : (role === 'operator' ? 'Оператор' : 'Сотрудник'),
    registry_user_id: uid,
  });
}


export function ensureEmployeeForSessionUser() {
  const session = registry.getSession();
  const uid = Number(session?.user?.id) || 0;
  if (!uid || !session?.user) return null;
  return ensureEmployeeForUser(uid, session.user);
}


export function syncEmployeesFromUsers() {
  const session = registry.getSession();
  const orgId = session?.organization?.id;
  if (!orgId) return { synced: 0, employees: listEmployees({ activeOnly: true }) };
  const users = registry.listUsers(orgId) || [];
  let synced = 0;
  for (const u of users) {
    const before = getDb().prepare(
      'SELECT id FROM employees WHERE registry_user_id = ? AND is_active = 1 LIMIT 1',
    ).get(Number(u.id)) as any;
    ensureEmployeeForUser(Number(u.id), u);
    if (!before) synced += 1;
  }
  return { synced, employees: listEmployees({ activeOnly: true }) };
}

export function getEdoTemplate(id: number) {
  const row = getDb().prepare('SELECT * FROM edo_templates WHERE id = ?').get(Number(id)) as any;
  if (!row) return null;
  return {
    ...row,
    form_label: EDO_FORMS.find((f) => f.id === row.form_type)?.label || row.form_type,
  };
}

export function saveEdoTemplate(data: any) {
  const db = getDb();
  const name = String(data.name || '').trim();
  if (!name) throw new Error('Укажите название шаблона');
  const formType = String(data.form_type || 'other');
  if (!EDO_FORMS.some((f) => f.id === formType)) throw new Error('Неизвестная форма документа');
  const fields = {
    code: String(data.code || '').trim() || null,
    name,
    form_type: formType,
    title_template: String(data.title_template ?? data.title ?? '').trim(),
    body_template: String(data.body_template ?? data.body ?? ''),
    description: String(data.description || '').trim() || null,
    is_active: data.is_active === 0 || data.is_active === false ? 0 : 1,
    sort_order: Number(data.sort_order) || 0,
  };
  const id = data.id ? Number(data.id) : 0;
  if (id) {
    db.prepare(`
      UPDATE edo_templates SET
        code=?, name=?, form_type=?, title_template=?, body_template=?, description=?,
        is_active=?, sort_order=?, updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).run(
      fields.code, fields.name, fields.form_type, fields.title_template, fields.body_template,
      fields.description, fields.is_active, fields.sort_order, id,
    );
    return getEdoTemplate(id);
  }
  const result = db.prepare(`
    INSERT INTO edo_templates (code, name, form_type, title_template, body_template, description, is_active, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    fields.code, fields.name, fields.form_type, fields.title_template, fields.body_template,
    fields.description, fields.is_active, fields.sort_order,
  );
  return getEdoTemplate(Number(result.lastInsertRowid));
}

export function deleteEdoTemplate(id: number) {
  getDb().prepare('UPDATE edo_templates SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(Number(id));
  return true;
}

export function applyEdoTemplate(templateId: number, vars: Record<string, string | number | null | undefined> = {}) {
  const tpl = getEdoTemplate(Number(templateId));
  if (!tpl || !tpl.is_active) throw new Error('Шаблон не найден');
  const session = registry.getSession();
  const builtins: Record<string, string> = {
    org: String(session?.organization?.name || ''),
    date: new Date().toLocaleDateString('ru-RU'),
    user: fio(session?.user || {}) || String(session?.user?.login || ''),
    doc_no: '',
    from_employee: '',
    to_employee: '',
    to_user: '',
  };
  const map = { ...builtins, ...Object.fromEntries(
    Object.entries(vars).map(([k, v]) => [k, v == null ? '' : String(v)]),
  ) };
  const replace = (text: string) => String(text || '').replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, key) => map[key] ?? '');
  return {
    template_id: tpl.id,
    form_type: tpl.form_type,
    title: replace(tpl.title_template),
    body: replace(tpl.body_template),
    template_name: tpl.name,
  };
}



export function listEdoDocuments(filters: {
  status?: string;
  mine?: boolean;
  inbox?: boolean;
  q?: string;
} = {}) {
  const db = getDb();
  const session = registry.getSession();
  const uid = Number(session?.user?.id) || 0;
  let sql = 'SELECT * FROM edo_documents WHERE 1=1';
  const params: any[] = [];
  if (filters.status) {
    sql += ' AND status = ?';
    params.push(filters.status);
  }
  if (filters.inbox && uid) {
    sql += ` AND to_user_id = ? AND status = 'sent'`;
    params.push(uid);
  }
  if (filters.mine && uid) {
    sql += ' AND (author_user_id = ? OR to_user_id = ?)';
    params.push(uid, uid);
  }
  if (filters.q?.trim()) {
    sql += ` AND (
      title LIKE ? OR doc_no LIKE ? OR IFNULL(body,'') LIKE ?
      OR IFNULL(doc_tag,'') LIKE ? OR IFNULL(tags_json,'') LIKE ?
      OR IFNULL(catalog_code,'') LIKE ? OR IFNULL(reg_stream,'') LIKE ?
    )`;
    const q = `%${filters.q.trim()}%`;
    params.push(q, q, q, q, q, q, q);
  }
  sql += ' ORDER BY id DESC LIMIT 300';
  return (db.prepare(sql).all(...params) as any[]).map((row) => enrichEdoRow({
    ...row,
    form_label: EDO_FORMS.find((f) => f.id === row.form_type)?.label || row.form_type,
    status_label: EDO_STATUS_LABELS[row.status] || row.status,
  }));
}

export function getEdoDocument(id: number) {
  const row = getDb().prepare('SELECT * FROM edo_documents WHERE id = ?').get(Number(id)) as any;
  if (!row) return null;
  const fromEmp = row.from_employee_id ? getEmployee(Number(row.from_employee_id)) : null;
  const toEmp = row.to_employee_id ? getEmployee(Number(row.to_employee_id)) : null;
  let fields: any = {};
  try { fields = row.fields_json ? JSON.parse(row.fields_json) : {}; } catch { fields = {}; }
  return enrichEdoRow({
    ...row,
    form_label: EDO_FORMS.find((f) => f.id === row.form_type)?.label || row.form_type,
    status_label: EDO_STATUS_LABELS[row.status] || row.status,
    from_employee_name: fromEmp?.full_name || null,
    from_employee_position: fromEmp?.position || null,
    to_employee_name: toEmp?.full_name || null,
    to_employee_position: toEmp?.position || null,
    fields,
  });
}

export function saveEdoDocument(data: any) {
  const db = getDb();
  const session = registry.getSession();
  const formType = String(data.form_type || 'other');
  if (!EDO_FORMS.some((f) => f.id === formType)) throw new Error('Неизвестная форма документа');
  const title = String(data.title || '').trim();
  if (!title) throw new Error('Укажите заголовок документа');
  const body = String(data.body || '').trim();
  const id = data.id ? Number(data.id) : 0;

  const fieldsJson = data.fields != null ? JSON.stringify(data.fields) : (data.fields_json || null);
  const catalogCode = data.catalog_code ? String(data.catalog_code) : null;

  if (id) {
    const cur = getEdoDocument(id);
    if (!cur) throw new Error('Документ не найден');
    if (cur.status !== 'draft' && cur.status !== 'rejected') {
      throw new Error('Редактировать можно только черновик или отклонённый документ');
    }
    const identity = resolveEdoIdentity({ form_type: formType, catalog_code: catalogCode, title });
    db.prepare(`
      UPDATE edo_documents SET
        form_type=?, title=?, body=?, from_employee_id=?, to_user_id=?, to_user_name=?,
        to_employee_id=?, template_id=?, catalog_code=?, fields_json=?,
        doc_tag=?, reg_stream=?, tags_json=?,
        status=CASE WHEN status='rejected' THEN 'draft' ELSE status END,
        updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).run(
      formType, title, body,
      data.from_employee_id ? Number(data.from_employee_id) : null,
      data.to_user_id ? Number(data.to_user_id) : null,
      data.to_user_name ? String(data.to_user_name) : null,
      data.to_employee_id ? Number(data.to_employee_id) : null,
      data.template_id ? Number(data.template_id) : null,
      catalogCode,
      fieldsJson,
      identity.doc_tag,
      identity.reg_stream,
      JSON.stringify(identity.tags),
      id,
    );
    return getEdoDocument(id);
  }

  const identity = resolveEdoIdentity({ form_type: formType, catalog_code: catalogCode, title });
  const docNo = String(data.doc_no || '').trim() || nextEdoRegNo(identity.reg_stream);
  const authorName = fio(session?.user || {}) || session?.user?.login || '—';
  const templateId = data.template_id ? Number(data.template_id) : null;
  const tagsJson = JSON.stringify(identity.tags);
  const result = db.prepare(`
    INSERT INTO edo_documents (
      doc_no, form_type, title, body, status,
      author_user_id, author_name, from_employee_id,
      to_user_id, to_user_name, to_employee_id, template_id, catalog_code, fields_json,
      doc_tag, reg_stream, tags_json
    ) VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    docNo, formType, title, body,
    session?.user?.id ?? null, authorName,
    data.from_employee_id ? Number(data.from_employee_id) : null,
    data.to_user_id ? Number(data.to_user_id) : null,
    data.to_user_name ? String(data.to_user_name) : null,
    data.to_employee_id ? Number(data.to_employee_id) : null,
    templateId,
    catalogCode,
    fieldsJson,
    identity.doc_tag,
    identity.reg_stream,
    tagsJson,
  );
  return getEdoDocument(Number(result.lastInsertRowid));
}

export function sendEdoDocument(id: number, toUserId?: number) {
  const db = getDb();
  const doc = getEdoDocument(id);
  if (!doc) throw new Error('Документ не найден');
  if (doc.status !== 'draft' && doc.status !== 'rejected') {
    throw new Error('Отправить можно только черновик');
  }
  let uid = toUserId ? Number(toUserId) : Number(doc.to_user_id);
  let uname = doc.to_user_name;
  if (!uid && doc.to_employee_id) {
    const emp = getEmployee(Number(doc.to_employee_id));
    if (emp?.registry_user_id) {
      uid = Number(emp.registry_user_id);
    }
  }
  if (!uid) throw new Error('Укажите получателя с учётной записью Метрики');
  if (!uname) {
    try {
      const users = registry.listUsers(registry.getSession()?.organization?.id);
      const u = (users || []).find((x: any) => Number(x.id) === uid);
      uname = u ? fio(u) || u.login : `user #${uid}`;
    } catch {
      uname = `user #${uid}`;
    }
  }
  db.prepare(`
    UPDATE edo_documents SET
      status='sent', to_user_id=?, to_user_name=?,
      reject_reason=NULL, updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).run(uid, uname, Number(id));
  const next = getEdoDocument(id);
  try {
    registry.logAudit('edo.send', {
      entity: 'edo',
      entityId: String(id),
      detail: `Отправлен ${next?.doc_no}: «${next?.title}» → ${uname}`,
    });
  } catch {  }
  return next;
}

export function signEdoDocument(id: number) {
  const session = registry.requireSession();
  const db = getDb();
  const doc = getEdoDocument(id);
  if (!doc) throw new Error('Документ не найден');
  if (doc.status !== 'sent') throw new Error('Документ не ожидает подписи');
  if (Number(doc.to_user_id) !== Number(session.user.id) && session.user.role !== 'admin') {
    throw new Error('Подписать может только адресат');
  }
  const esign = registry.getUserEsignForSign(Number(session.user.id));
  if (!esign?.cert) {
    throw new Error('Сначала зарегистрируйте ключ ЭП в личном кабинете');
  }
  const signer = esign.owner || fio(session.user) || session.user.login;
  db.prepare(`
    UPDATE edo_documents SET
      status='signed', signed_at=CURRENT_TIMESTAMP, signed_by_name=?,
      stamp_key=?, stamp_valid_from=?, stamp_valid_to=?,
      updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).run(signer, esign.cert, esign.valid_from || null, esign.valid_to || null, Number(id));
  try {
    registry.logAudit('edo.sign', {
      entity: 'edo',
      entityId: String(id),
      detail: `Подписан ${doc.doc_no} · ${signer} · ${esign.cert}`,
    });
  } catch {  }
  return getEdoDocument(id);
}

export function deleteEdoDocument(id: number) {
  const doc = getEdoDocument(id);
  if (!doc) throw new Error('Документ не найден');
  getDb().prepare('DELETE FROM edo_documents WHERE id = ?').run(Number(id));
  try {
    registry.logAudit('edo.delete', {
      entity: 'edo',
      entityId: String(id),
      detail: `Удалён ${doc.doc_no}: «${doc.title}» (${doc.status})`,
    });
  } catch {  }
  return { ok: true, id: Number(id) };
}

export function rejectEdoDocument(id: number, reason?: string) {
  const session = registry.requireSession();
  const db = getDb();
  const doc = getEdoDocument(id);
  if (!doc) throw new Error('Документ не найден');
  if (doc.status !== 'sent') throw new Error('Отклонить можно только документ на подписании');
  if (Number(doc.to_user_id) !== Number(session.user.id) && session.user.role !== 'admin') {
    throw new Error('Отклонить может только адресат');
  }
  db.prepare(`
    UPDATE edo_documents SET
      status='rejected', reject_reason=?, updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).run(String(reason || '').trim() || 'Отклонено', Number(id));
  return getEdoDocument(id);
}

export function cancelEdoDocument(id: number) {
  const doc = getEdoDocument(id);
  if (!doc) throw new Error('Документ не найден');
  if (doc.status === 'signed') throw new Error('Подписанный документ нельзя отменить');
  getDb().prepare(`UPDATE edo_documents SET status='cancelled', updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(Number(id));
  return getEdoDocument(id);
}

export function countEdoInbox() {
  const uid = Number(registry.getSession()?.user?.id) || 0;
  if (!uid) return 0;
  return Number((getDb().prepare(
    `SELECT COUNT(*) AS c FROM edo_documents WHERE to_user_id = ? AND status = 'sent'`,
  ).get(uid) as any)?.c || 0);
}

function escapeHtml(s: string) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatRuDateTime(iso: string | null | undefined) {
  if (!iso) return '—';
  const s = String(iso);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}.${m[2]}.${m[1]}`;
  try {
    return new Date(s).toLocaleDateString('ru-RU');
  } catch {
    return s;
  }
}

const RU_MONTHS = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];


function formatRuApplicationDate(iso?: string | null) {
  const raw = iso ? String(iso) : new Date().toISOString();
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  let y: number; let mo: number; let d: number;
  if (m) {
    y = Number(m[1]); mo = Number(m[2]); d = Number(m[3]);
  } else {
    const dt = new Date(raw);
    if (Number.isNaN(dt.getTime())) {
      const now = new Date();
      y = now.getFullYear(); mo = now.getMonth() + 1; d = now.getDate();
    } else {
      y = dt.getFullYear(); mo = dt.getMonth() + 1; d = dt.getDate();
    }
  }
  const day = String(d).padStart(2, '0');
  const monthName = RU_MONTHS[Math.max(0, Math.min(11, mo - 1))] || '';
  return `«${day}» ${monthName} ${y} г.`;
}


function edoStampBlock(doc: any) {
  if (doc.status !== 'signed' || !doc.signed_at) return '';
  const cert = escapeHtml(doc.stamp_key || '—');
  const owner = escapeHtml(doc.signed_by_name || '—');
  const validFrom = formatRuDateTime(doc.stamp_valid_from);
  const validTo = formatRuDateTime(doc.stamp_valid_to);
  const signedAt = formatRuDateTime(doc.signed_at);
  return `<div class="metrika-esign" aria-label="Электронная подпись METRIKA">
  <div class="metrika-esign-head">
    <div class="metrika-esign-brand">METRIKA</div>
    <div class="metrika-esign-title">ДОКУМЕНТ ПОДПИСАН<br>ЭЛЕКТРОННОЙ ПОДПИСЬЮ</div>
  </div>
  <table class="metrika-esign-table">
    <tr><td class="lbl">Сертификат</td><td class="val">${cert}</td></tr>
    <tr><td class="lbl">Владелец</td><td class="val">${owner}</td></tr>
    <tr><td class="lbl">Действителен</td><td class="val">с ${validFrom} по ${validTo}</td></tr>
    <tr><td class="lbl">Дата подписания</td><td class="val">${signedAt}</td></tr>
  </table>
</div>`;
}

function stripDuplicateAppHeader(body: string) {

  return String(body || '')
    .replace(/^Кому:[^\n]*\n?/i, '')
    .replace(/^От:[^\n]*\n?/i, '')
    .replace(/^Должность:[^\n]*\n?/gi, '')
    .replace(/^Организация:[^\n]*\n?/i, '')
    .replace(/^Дата:[^\n]*\n?/i, '')
    .replace(/^ЗАЯВЛЕНИЕ\s*\n+/i, '')
    .replace(/^СЛУЖЕБНАЯ ЗАПИСКА\s*\n+/i, '')
    .replace(/^Подпись заявителя:[^\n]*\n?/gim, '')
    .replace(/^Подпись:[^\n]*\n?/gim, '')
    .replace(/^\n+/, '')
    .trim();
}

export function edoPrintHtml(doc: any) {
  const org = registry.getSession()?.organization?.name || 'Организация';
  const fromName = doc.from_employee_name || doc.author_name || '—';
  const fromPos = doc.from_employee_position || '';
  const toName = doc.to_employee_name || doc.to_user_name || 'Руководителю';
  const toPos = doc.to_employee_position || '';
  const isApp = doc.form_type === 'application' || /заявлен/i.test(String(doc.form_label || doc.title || ''));
  const isMemo = doc.form_type === 'service_note' || /служебн/i.test(String(doc.form_label || ''));
  const bodyText = escapeHtml(stripDuplicateAppHeader(doc.body || ''));
  const title = escapeHtml(
    isApp ? 'Заявление' : (isMemo ? 'Служебная записка' : (doc.title || doc.form_label || 'Документ')),
  );
  const docDateIso = doc.signed_at || doc.created_at || new Date().toISOString();
  const dateLine = formatRuApplicationDate(docDateIso);
  const signerName = doc.signed_by_name || fromName;
  const isSigned = doc.status === 'signed' && doc.signed_at;
  const sigLine = isSigned
    ? `Подпись: / ${escapeHtml(signerName)} / <span class="sig-mark">ЭП</span>`
    : `Подпись: _______________ / ${escapeHtml(fromName)} /`;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(doc.doc_no)}</title>
<style>
  @page { size: A4; margin: 20mm 18mm 18mm 18mm; }
  body{font-family:"Times New Roman",Times,serif;padding:0;color:#111;font-size:14pt;line-height:1.4;margin:0}
  .doc-meta{font-family:Segoe UI,Arial,sans-serif;font-size:9pt;color:#666;margin-bottom:14px;display:flex;justify-content:space-between}
  .addr{width:48%;margin-left:auto;text-align:left;font-size:13pt;line-height:1.35;margin-bottom:28px}
  .addr .to{margin-bottom:14px}
  .addr .from{}
  h1.doc-title{font-size:16pt;text-align:center;text-transform:uppercase;margin:8px 0 22px;font-weight:700;letter-spacing:.06em}
  .body{white-space:pre-wrap;line-height:1.5;min-height:200px;text-align:justify}
  .sign-row{margin-top:36px;display:flex;justify-content:space-between;gap:24px;font-size:13pt;align-items:flex-end}
  .sign-row .date{white-space:nowrap}
  .sign-row .sig{text-align:right;min-width:55%}
  .sig-mark{color:#005BFF;font-weight:700;font-family:Segoe UI,Arial,sans-serif;font-size:10pt;margin-left:4px}
  .draft-banner{color:#888;font-size:9pt;text-align:center;margin-top:24px;font-family:Segoe UI,Arial,sans-serif}
  .metrika-esign{
    margin-top:28px;max-width:420px;border:1.5px solid #005BFF;padding:10px 12px 12px;
    font-family:Segoe UI,Arial,Helvetica,sans-serif;color:#111;page-break-inside:avoid;background:#fff;
  }
  .metrika-esign-head{display:flex;align-items:flex-start;gap:14px;margin-bottom:10px}
  .metrika-esign-brand{
    flex:0 0 auto;font-weight:800;font-size:18pt;letter-spacing:.04em;color:#005BFF;line-height:1;
    font-family:Arial Black,Arial,sans-serif;
  }
  .metrika-esign-title{
    flex:1;font-size:9.5pt;font-weight:700;color:#005BFF;text-transform:uppercase;
    letter-spacing:.02em;line-height:1.25;padding-top:2px;
  }
  .metrika-esign-table{width:100%;border-collapse:collapse;font-size:9pt}
  .metrika-esign-table td{padding:2px 0;vertical-align:top}
  .metrika-esign-table .lbl{width:118px;font-weight:700;color:#111;padding-right:8px;white-space:nowrap}
  .metrika-esign-table .val{color:#111;word-break:break-all}
</style></head><body>
  <div class="doc-meta">
    <span>${escapeHtml(org)} · ${escapeHtml(doc.doc_tag || 'ЭДО')} · ${escapeHtml(doc.doc_no)}</span>
    <span>${escapeHtml(doc.kind_label || doc.form_label || '')} · ${escapeHtml(doc.status_label || doc.status)}</span>
  </div>
  <div class="addr">
    <div class="to">
      ${isApp || isMemo
        ? `Руководителю<br>${escapeHtml(org)}${toName && toName !== 'Руководителю' ? `<br>${escapeHtml(toName)}` : ''}${toPos ? `<br>${escapeHtml(toPos)}` : ''}`
        : `${escapeHtml(toName)}${toPos ? `<br>${escapeHtml(toPos)}` : ''}`}
    </div>
    <div class="from">
      от ${escapeHtml(fromName)}${fromPos ? `<br>${escapeHtml(fromPos)}` : ''}
    </div>
  </div>
  <h1 class="doc-title">${title}</h1>
  <div class="body">${bodyText}</div>
  <div class="sign-row">
    <div class="date">Дата: ${dateLine}</div>
    <div class="sig">${sigLine}</div>
  </div>
  ${edoStampBlock(doc)}
  ${!isSigned ? '<div class="draft-banner">Документ ещё не подписан — штамп ЭП METRIKA появится после подписания ключом из личного кабинета</div>' : ''}
</body></html>`;
}

export function previewEdoDocument(id: number) {
  const doc = getEdoDocument(id);
  if (!doc) throw new Error('Документ не найден');
  return { html: edoPrintHtml(doc), doc };
}

export async function printEdoDocument(id: number) {
  const doc = getEdoDocument(id);
  if (!doc) throw new Error('Документ не найден');
  const html = edoPrintHtml(doc);
  const win = new BrowserWindow({
    show: false,
    width: 800,
    height: 1000,
    webPreferences: { sandbox: true },
  });
  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  await new Promise<void>((resolve, reject) => {
    win.webContents.print({ silent: false, printBackground: true }, (success, failureReason) => {
      if (!success && failureReason !== 'cancelled') reject(new Error(failureReason || 'Ошибка печати'));
      else resolve();
    });
  });
  getDb().prepare('UPDATE edo_documents SET printed_at=CURRENT_TIMESTAMP WHERE id=?').run(Number(id));
  setTimeout(() => { try { win.destroy(); } catch {  } }, 500);
  return getEdoDocument(id);
}

export async function exportEdoPdf(id: number) {
  const doc = getEdoDocument(id);
  if (!doc) throw new Error('Документ не найден');
  const html = edoPrintHtml(doc);
  const win = new BrowserWindow({
    show: false,
    width: 800,
    height: 1100,
    webPreferences: { sandbox: true },
  });
  try {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    const pdf = await win.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
    });
    const result = await dialog.showSaveDialog({
      title: 'Сохранить PDF ЭДО',
      defaultPath: `${doc.doc_no || 'edo'}.pdf`,
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    if (result.canceled || !result.filePath) return { ok: false, cancelled: true };
    fs.writeFileSync(result.filePath, pdf);
    getDb().prepare('UPDATE edo_documents SET printed_at=CURRENT_TIMESTAMP WHERE id=?').run(Number(id));
    return { ok: true, path: result.filePath };
  } finally {
    setTimeout(() => { try { win.destroy(); } catch {  } }, 300);
  }
}



export function listCounterparties(filters: { q?: string; kind?: string } = {}) {
  let sql = 'SELECT * FROM counterparties WHERE is_active = 1';
  const params: any[] = [];
  if (filters.kind) { sql += ' AND kind = ?'; params.push(filters.kind); }
  if (filters.q?.trim()) {
    sql += ' AND (name LIKE ? OR IFNULL(inn,\'\') LIKE ? OR IFNULL(contact_person,\'\') LIKE ?)';
    const q = `%${filters.q.trim()}%`;
    params.push(q, q, q);
  }
  sql += ' ORDER BY name, id';
  return getDb().prepare(sql).all(...params);
}

export function saveCounterparty(data: any) {
  const db = getDb();
  const name = String(data.name || '').trim();
  if (!name) throw new Error('Укажите наименование контрагента');
  const kind = ['customer', 'supplier', 'partner', 'other'].includes(data.kind) ? data.kind : 'customer';
  const fields = {
    name,
    full_name: String(data.full_name || '').trim() || null,
    kind,
    inn: String(data.inn || '').trim() || null,
    kpp: String(data.kpp || '').trim() || null,
    phone: String(data.phone || '').trim() || null,
    email: String(data.email || '').trim() || null,
    address: String(data.address || '').trim() || null,
    contact_person: String(data.contact_person || '').trim() || null,
    supplier_id: data.supplier_id ? Number(data.supplier_id) : null,
    employee_id: data.employee_id ? Number(data.employee_id) : null,
    registry_user_id: data.registry_user_id ? Number(data.registry_user_id) : null,
    notes: String(data.notes || '').trim() || null,
    is_active: data.is_active === 0 || data.is_active === false ? 0 : 1,
  };
  const id = data.id ? Number(data.id) : 0;
  let row: any;
  if (id) {
    db.prepare(`
      UPDATE counterparties SET
        name=?, full_name=?, kind=?, inn=?, kpp=?, phone=?, email=?, address=?,
        contact_person=?, supplier_id=?, employee_id=?, registry_user_id=?, notes=?, is_active=?,
        updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).run(
      fields.name, fields.full_name, fields.kind, fields.inn, fields.kpp, fields.phone, fields.email,
      fields.address, fields.contact_person, fields.supplier_id, fields.employee_id, fields.registry_user_id,
      fields.notes, fields.is_active, id,
    );
    row = db.prepare('SELECT * FROM counterparties WHERE id=?').get(id);
  } else {
    const result = db.prepare(`
      INSERT INTO counterparties (
        name, full_name, kind, inn, kpp, phone, email, address, contact_person,
        supplier_id, employee_id, registry_user_id, notes, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      fields.name, fields.full_name, fields.kind, fields.inn, fields.kpp, fields.phone, fields.email,
      fields.address, fields.contact_person, fields.supplier_id, fields.employee_id, fields.registry_user_id,
      fields.notes, fields.is_active,
    );
    row = db.prepare('SELECT * FROM counterparties WHERE id=?').get(result.lastInsertRowid);
  }
  if (row?.id && (data.custom_values != null || data.custom_fields != null)) {
    saveCounterpartyCustomValues(Number(row.id), data.custom_values ?? data.custom_fields);
    return {
      ...row,
      custom_values: listCounterpartyCustomValues(Number(row.id)),
    };
  }
  return row;
}

export function getCounterparty(id: number) {
  const row = getDb().prepare('SELECT * FROM counterparties WHERE id = ?').get(Number(id)) as any;
  if (!row) return null;
  return { ...row, custom_values: listCounterpartyCustomValues(Number(id)) };
}


export function deleteCounterparty(id: number) {
  getDb().prepare('UPDATE counterparties SET is_active = 0, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(Number(id));
  return { ok: true, mode: 'hide' as const };
}



export function purgeCounterparty(id: number) {
  const db = getDb();
  const cid = Number(id);
  const row = db.prepare('SELECT id, name FROM counterparties WHERE id = ?').get(cid) as any;
  if (!row) throw new Error('Контрагент не найден');

  const countOf = (sql: string) => {
    try { return Number((db.prepare(sql).get(cid) as any)?.c || 0); } catch { return 0; }
  };
  const contracts = countOf('SELECT COUNT(*) AS c FROM contracts WHERE counterparty_id = ?');
  const sales = countOf('SELECT COUNT(*) AS c FROM sales_orders WHERE counterparty_id = ?');
  const threads = countOf('SELECT COUNT(*) AS c FROM crm_threads WHERE counterparty_id = ?');
  const cases = countOf('SELECT COUNT(*) AS c FROM crm_cases WHERE counterparty_id = ?');

  if (contracts || sales) {
    const parts: string[] = [];
    if (contracts) parts.push(`${contracts} договор(ов)`);
    if (sales) parts.push(`${sales} заказ(ов) покупателя`);
    throw new Error(
      `Нельзя удалить «${row.name}»: остались ${parts.join(' и ')}. `
      + 'Сначала удалите или закройте их в Контуре компании, либо нажмите «Скрыть».',
    );
  }

  const run = db.transaction(() => {

    try {
      db.prepare(`
        DELETE FROM crm_message_attachments WHERE message_id IN (
          SELECT m.id FROM crm_messages m
          JOIN crm_threads t ON t.id = m.thread_id
          WHERE t.counterparty_id = ?
        )
      `).run(cid);
    } catch {  }
    try {
      db.prepare(`
        DELETE FROM crm_case_events WHERE case_id IN (
          SELECT id FROM crm_cases WHERE counterparty_id = ?
        )
      `).run(cid);
    } catch {  }
    try { db.prepare('DELETE FROM crm_cases WHERE counterparty_id = ?').run(cid); } catch {  }
    try {
      db.prepare(`
        DELETE FROM crm_messages WHERE thread_id IN (
          SELECT id FROM crm_threads WHERE counterparty_id = ?
        )
      `).run(cid);
    } catch {  }
    try { db.prepare('DELETE FROM crm_threads WHERE counterparty_id = ?').run(cid); } catch {  }
    try { db.prepare('DELETE FROM crm_transport_events WHERE counterparty_id = ?').run(cid); } catch {  }
    try { db.prepare('DELETE FROM crm_portal_tokens WHERE counterparty_id = ?').run(cid); } catch {  }
    try { db.prepare('DELETE FROM counterparty_custom_values WHERE counterparty_id = ?').run(cid); } catch {  }
    try { db.prepare('UPDATE parties SET counterparty_id = NULL WHERE counterparty_id = ?').run(cid); } catch {  }
    try { db.prepare('UPDATE purchase_orders SET counterparty_id = NULL WHERE counterparty_id = ?').run(cid); } catch {  }
    const result = db.prepare('DELETE FROM counterparties WHERE id = ?').run(cid);
    if (!result.changes) throw new Error('Не удалось удалить контрагента');
  });
  run();
  return {
    ok: true,
    mode: 'delete' as const,
    id: cid,
    name: row.name,
    removed_crm_threads: threads,
    removed_crm_cases: cases,
  };
}



export function listDirections(includeInactive = false) {
  const sql = includeInactive
    ? 'SELECT * FROM business_directions ORDER BY sort_order, id'
    : 'SELECT * FROM business_directions WHERE is_active = 1 ORDER BY sort_order, id';
  return getDb().prepare(sql).all();
}

export function saveDirection(data: any) {
  const db = getDb();
  const name = String(data.name || '').trim();
  if (!name) throw new Error('Укажите название направления');
  const id = data.id ? Number(data.id) : 0;
  if (id) {
    db.prepare(`
      UPDATE business_directions SET code=?, name=?, description=?, is_active=?, sort_order=?
      WHERE id=?
    `).run(
      String(data.code || '').trim() || null, name, String(data.description || '').trim() || null,
      data.is_active === 0 || data.is_active === false ? 0 : 1,
      Number(data.sort_order) || 0, id,
    );
    return db.prepare('SELECT * FROM business_directions WHERE id=?').get(id);
  }
  const result = db.prepare(`
    INSERT INTO business_directions (code, name, description, is_active, sort_order)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    String(data.code || '').trim() || null, name, String(data.description || '').trim() || null,
    data.is_active === 0 || data.is_active === false ? 0 : 1,
    Number(data.sort_order) || 0,
  );
  return db.prepare('SELECT * FROM business_directions WHERE id=?').get(result.lastInsertRowid);
}

export function deleteDirection(id: number) {
  return getDb().prepare('DELETE FROM business_directions WHERE id=?').run(Number(id)).changes;
}



export function listContracts(filters: { counterparty_id?: number; q?: string } = {}) {
  let sql = `
    SELECT c.*, cp.name AS counterparty_name, d.name AS direction_name
    FROM contracts c
    LEFT JOIN counterparties cp ON cp.id = c.counterparty_id
    LEFT JOIN business_directions d ON d.id = c.direction_id
    WHERE 1=1
  `;
  const params: any[] = [];
  if (filters.counterparty_id) { sql += ' AND c.counterparty_id = ?'; params.push(Number(filters.counterparty_id)); }
  if (filters.q?.trim()) {
    sql += ' AND (c.number LIKE ? OR IFNULL(c.title,\'\') LIKE ? OR cp.name LIKE ?)';
    const q = `%${filters.q.trim()}%`;
    params.push(q, q, q);
  }
  sql += ' ORDER BY c.id DESC';
  return getDb().prepare(sql).all(...params);
}

export function saveContract(data: any) {
  const db = getDb();
  const number = String(data.number || '').trim();
  const counterpartyId = Number(data.counterparty_id);
  if (!number) throw new Error('Укажите номер договора');
  if (!counterpartyId) throw new Error('Укажите контрагента');
  const id = data.id ? Number(data.id) : 0;
  const fields = {
    number,
    title: String(data.title || '').trim() || null,
    counterparty_id: counterpartyId,
    direction_id: data.direction_id ? Number(data.direction_id) : null,
    date_from: String(data.date_from || '').trim() || null,
    date_to: String(data.date_to || '').trim() || null,
    amount: data.amount != null && data.amount !== '' ? Number(data.amount) : null,
    status: ['active', 'closed', 'draft'].includes(data.status) ? data.status : 'active',
    notes: String(data.notes || '').trim() || null,
  };
  if (id) {
    db.prepare(`
      UPDATE contracts SET
        number=?, title=?, counterparty_id=?, direction_id=?, date_from=?, date_to=?,
        amount=?, status=?, notes=?, updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).run(
      fields.number, fields.title, fields.counterparty_id, fields.direction_id,
      fields.date_from, fields.date_to, fields.amount, fields.status, fields.notes, id,
    );
    return listContracts().find((c: any) => Number(c.id) === id);
  }
  const result = db.prepare(`
    INSERT INTO contracts (number, title, counterparty_id, direction_id, date_from, date_to, amount, status, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    fields.number, fields.title, fields.counterparty_id, fields.direction_id,
    fields.date_from, fields.date_to, fields.amount, fields.status, fields.notes,
  );
  return listContracts().find((c: any) => Number(c.id) === Number(result.lastInsertRowid));
}

export function deleteContract(id: number) {
  return getDb().prepare('DELETE FROM contracts WHERE id=?').run(Number(id)).changes;
}



export function listPriceTypes() {
  return getDb().prepare('SELECT * FROM price_types ORDER BY is_default DESC, id').all();
}

export function savePriceType(data: any) {
  const db = getDb();
  const name = String(data.name || '').trim();
  if (!name) throw new Error('Укажите название вида цен');
  const id = data.id ? Number(data.id) : 0;
  const isDefault = data.is_default ? 1 : 0;
  if (isDefault) db.prepare('UPDATE price_types SET is_default = 0').run();
  if (id) {
    db.prepare(`
      UPDATE price_types SET name=?, currency=?, is_default=?, is_active=? WHERE id=?
    `).run(name, String(data.currency || '').trim() || null, isDefault, data.is_active === 0 ? 0 : 1, id);
    return db.prepare('SELECT * FROM price_types WHERE id=?').get(id);
  }
  const result = db.prepare(`
    INSERT INTO price_types (name, currency, is_default, is_active) VALUES (?, ?, ?, ?)
  `).run(name, String(data.currency || '').trim() || null, isDefault, data.is_active === 0 ? 0 : 1);
  return db.prepare('SELECT * FROM price_types WHERE id=?').get(result.lastInsertRowid);
}

export function deletePriceType(id: number) {
  getDb().prepare('DELETE FROM item_price_list WHERE price_type_id=?').run(Number(id));
  return getDb().prepare('DELETE FROM price_types WHERE id=?').run(Number(id)).changes;
}

export function listItemPrices(priceTypeId?: number) {
  const db = getDb();
  if (priceTypeId) {
    return db.prepare(`
      SELECT p.*, i.name AS item_name, i.sku, t.name AS price_type_name
      FROM item_price_list p
      JOIN items i ON i.id = p.item_id
      JOIN price_types t ON t.id = p.price_type_id
      WHERE p.price_type_id = ?
      ORDER BY i.name
    `).all(Number(priceTypeId));
  }
  return db.prepare(`
    SELECT p.*, i.name AS item_name, i.sku, t.name AS price_type_name
    FROM item_price_list p
    JOIN items i ON i.id = p.item_id
    JOIN price_types t ON t.id = p.price_type_id
    ORDER BY t.id, i.name
    LIMIT 500
  `).all();
}

export function setItemPrice(itemId: number, priceTypeId: number, price: number) {
  getDb().prepare(`
    INSERT INTO item_price_list (item_id, price_type_id, price, updated_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(item_id, price_type_id) DO UPDATE SET price = excluded.price, updated_at = CURRENT_TIMESTAMP
  `).run(Number(itemId), Number(priceTypeId), Number(price) || 0);
  return true;
}



export function listSalesOrders(filters: { status?: string; q?: string } = {}) {
  let sql = `
    SELECT o.*, cp.name AS counterparty_name, d.name AS direction_name
    FROM sales_orders o
    LEFT JOIN counterparties cp ON cp.id = o.counterparty_id
    LEFT JOIN business_directions d ON d.id = o.direction_id
    WHERE 1=1
  `;
  const params: any[] = [];
  if (filters.status) { sql += ' AND o.status = ?'; params.push(filters.status); }
  if (filters.q?.trim()) {
    sql += ' AND (o.order_no LIKE ? OR IFNULL(cp.name,\'\') LIKE ? OR IFNULL(o.comment,\'\') LIKE ?)';
    const q = `%${filters.q.trim()}%`;
    params.push(q, q, q);
  }
  sql += ' ORDER BY o.id DESC LIMIT 200';
  return getDb().prepare(sql).all(...params);
}

export function getSalesOrder(id: number) {
  const order = getDb().prepare(`
    SELECT o.*, cp.name AS counterparty_name, d.name AS direction_name
    FROM sales_orders o
    LEFT JOIN counterparties cp ON cp.id = o.counterparty_id
    LEFT JOIN business_directions d ON d.id = o.direction_id
    WHERE o.id = ?
  `).get(Number(id)) as any;
  if (!order) return null;
  const lines = getDb().prepare('SELECT * FROM sales_order_lines WHERE order_id = ? ORDER BY id').all(Number(id));
  return { ...order, lines };
}

function resolveShipLocationId(order: any, preferred?: number | null) {

  const dbMod = require('./db') as typeof import('./db');
  const db = getDb();
  if (preferred && Number(preferred) > 0) {
    const ok = db.prepare('SELECT id FROM locations WHERE id = ?').get(Number(preferred));
    if (ok) return Number(preferred);
  }
  if (order.ship_location_id) {
    const ok = db.prepare('SELECT id FROM locations WHERE id = ?').get(Number(order.ship_location_id));
    if (ok) return Number(order.ship_location_id);
  }
  try {
    const raw = db.prepare("SELECT value FROM schema_meta WHERE key = 'setting:sales.default_location_id'").get() as any;
    if (raw?.value) {
      const id = Number(raw.value);
      if (id && db.prepare('SELECT id FROM locations WHERE id = ?').get(id)) return id;
    }
  } catch {  }

  const lines = (order.lines || []).filter((l: any) => l.item_id && Number(l.quantity) > 0);
  if (lines.length) {
    const locs = db.prepare('SELECT id FROM locations ORDER BY id').all() as any[];
    let best: { id: number; score: number } | null = null;
    for (const loc of locs) {
      let score = 0;
      for (const line of lines) {
        const have = dbMod.getStockAtLocation(Number(line.item_id), Number(loc.id));
        if (have >= Number(line.quantity)) score += 1;
      }
      if (!best || score > best.score) best = { id: Number(loc.id), score };
      if (score === lines.length) break;
    }
    if (best) return best.id;
  }
  const first = db.prepare('SELECT id FROM locations ORDER BY id LIMIT 1').get() as any;
  if (!first?.id) throw new Error('Нет складов/ячеек для отгрузки');
  return Number(first.id);
}


function linkSalesShipment(orderId: number, opts: { location_id?: number | null } = {}) {
  const order = getSalesOrder(orderId);
  if (!order) return null;
  if (order.linked_document_id) return getSalesOrder(orderId);

  const dbMod = require('./db') as typeof import('./db');
  const db = getDb();
  const locationId = resolveShipLocationId(order, opts.location_id);
  const loc = db.prepare('SELECT id, name FROM locations WHERE id = ?').get(locationId) as any;
  const session = registry.getSession();
  const actor = fio(session?.user || {}) || session?.user?.login || order.author_name || 'CRM';

  const stockLines = (order.lines || [])
    .map((l: any) => ({
      item_id: l.item_id ? Number(l.item_id) : 0,
      quantity: dbMod.normalizeQtyForItem(Number(l.item_id) || 0, l.quantity),
      item_name: l.item_name,
    }))
    .filter((l: any) => l.item_id && l.quantity > 0);

  for (const line of stockLines) {
    const have = dbMod.getStockAtLocation(line.item_id, locationId);
    const reserved = dbMod.getReservedQty(line.item_id, locationId);
    if (have < line.quantity) {
      const name = line.item_name || `#${line.item_id}`;
      throw new Error(`Недостаточно «${name}» на «${loc?.name || locationId}» (есть ${have}, нужно ${line.quantity})`);
    }
    if (have - line.quantity < reserved) {
      throw new Error(`Часть остатка #${line.item_id} зарезервирована (${reserved} шт.)`);
    }
  }

  const shipNo = dbMod.nextDocumentNo('sales_ship', 'SHIP');
  const party = order.counterparty_name || null;
  const note = `Отгрузка по заказу ${order.order_no}`
    + (order.lines?.length ? ` · позиций: ${order.lines.length}` : '')
    + ` · склад: ${loc?.name || locationId}`;

  const result = db.transaction(() => {
    const shipDoc = dbMod.upsertDocument({
      doc_type: 'sales_ship',
      doc_no: shipNo,
      status: 'posted',
      note,
      party,
      author: actor,
      ref_table: 'sales_orders',
      ref_id: orderId,
      amount: Number(order.total_amount) || null,
    });

    let writeoffId: number | null = null;
    if (stockLines.length) {
      const woffNo = dbMod.nextDocumentNo('writeoff', 'WOFF');
      const woff = dbMod.upsertDocument({
        doc_type: 'writeoff',
        doc_no: woffNo,
        status: 'posted',
        note: `Списание по отгрузке ${order.order_no} / ${shipNo}`,
        party,
        author: actor,
        parent_id: shipDoc.id,
        ref_table: 'sales_orders',
        ref_id: orderId,
        amount: Number(order.total_amount) || null,
      });
      writeoffId = Number(woff.id);
      const insertLine = db.prepare(`
        INSERT INTO document_lines
          (document_id, item_id, location_id, quantity, counterpart_item_id, line_role, note, lot_id)
        VALUES (?, ?, ?, ?, NULL, 'main', NULL, ?)
      `);
      for (const line of stockLines) {
        const slices = dbMod.allocateLotsForIssue(line.item_id, locationId, line.quantity);
        for (const slice of slices) {
          dbMod.addStockAtLocation(line.item_id, locationId, -slice.quantity, slice.lot_id);
          dbMod.insertLedger({
            item_id: line.item_id,
            location_id: locationId,
            type: 'out',
            quantity: slice.quantity,
            comment: `Отгрузка CRM ${order.order_no}`,
            reason: 'SALES_SHIP',
            source: 'CRM',
            document_ref: woffNo,
            user_name: actor,
            lot_id: slice.lot_id || null,
          });
        }
        insertLine.run(writeoffId, line.item_id, locationId, line.quantity, null);
      }
    }

    db.prepare(`
      UPDATE sales_orders SET
        linked_document_id = ?, ship_location_id = ?, shipped_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(shipDoc.id, locationId, orderId);

    return { shipDoc, writeoffId };
  })();

  try {
    registry.logAudit('sales.ship', {
      entity: 'sales_order',
      entityId: String(orderId),
      detail: `Отгрузка ${order.order_no} · ${shipNo} · склад #${locationId}`
        + (result.writeoffId ? ` · списание #${result.writeoffId}` : ' · без складских строк'),
    });
  } catch {  }

  return getSalesOrder(orderId);
}

export function saveSalesOrder(data: any) {
  const db = getDb();
  const session = registry.getSession();
  const id = data.id ? Number(data.id) : 0;
  const before = id ? getSalesOrder(id) : null;
  const lines: any[] = Array.isArray(data.lines) ? data.lines : [];
  let total = 0;
  for (const line of lines) {
    const qty = Number(line.quantity) || 0;
    const price = Number(line.price) || 0;
    total += qty * price;
  }
  const fields = {
    order_no: String(data.order_no || '').trim() || nextDocNo('ЗП', 'sales_orders', 'order_no'),
    counterparty_id: data.counterparty_id ? Number(data.counterparty_id) : null,
    contract_id: data.contract_id ? Number(data.contract_id) : null,
    direction_id: data.direction_id ? Number(data.direction_id) : null,
    status: ['draft', 'confirmed', 'shipped', 'closed', 'cancelled'].includes(data.status) ? data.status : 'draft',
    expected_at: String(data.expected_at || '').trim() || null,
    comment: String(data.comment || '').trim() || null,
    total_amount: total,
    author_name: fio(session?.user || {}) || session?.user?.login || null,
  };

  const writeLines = (orderId: number) => {
    db.prepare('DELETE FROM sales_order_lines WHERE order_id = ?').run(orderId);
    const ins = db.prepare(`
      INSERT INTO sales_order_lines (order_id, item_id, item_name, quantity, price, amount)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    for (const line of lines) {
      const qty = Number(line.quantity) || 0;
      const price = Number(line.price) || 0;
      if (!line.item_id && !line.item_name) continue;
      ins.run(
        orderId,
        line.item_id ? Number(line.item_id) : null,
        String(line.item_name || '').trim() || null,
        qty, price, qty * price,
      );
    }
  };

  let orderId = id;
  if (id) {
    db.prepare(`
      UPDATE sales_orders SET
        order_no=?, counterparty_id=?, contract_id=?, direction_id=?, status=?,
        expected_at=?, comment=?, total_amount=?, updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).run(
      fields.order_no, fields.counterparty_id, fields.contract_id, fields.direction_id, fields.status,
      fields.expected_at, fields.comment, fields.total_amount, id,
    );
    writeLines(id);
  } else {
    const result = db.prepare(`
      INSERT INTO sales_orders (
        order_no, counterparty_id, contract_id, direction_id, status,
        expected_at, comment, total_amount, author_name
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      fields.order_no, fields.counterparty_id, fields.contract_id, fields.direction_id, fields.status,
      fields.expected_at, fields.comment, fields.total_amount, fields.author_name,
    );
    orderId = Number(result.lastInsertRowid);
    writeLines(orderId);
  }

  if (data.ship_location_id != null && orderId) {
    db.prepare('UPDATE sales_orders SET ship_location_id = ? WHERE id = ?')
      .run(data.ship_location_id ? Number(data.ship_location_id) : null, orderId);
  }

  const becameShipped = fields.status === 'shipped' && before?.status !== 'shipped';
  if (becameShipped || (fields.status === 'shipped' && !before?.linked_document_id && orderId)) {
    return linkSalesShipment(orderId, { location_id: data.ship_location_id || data.location_id || null });
  }
  return getSalesOrder(orderId);
}

export function deleteSalesOrder(id: number) {
  getDb().prepare('DELETE FROM sales_order_lines WHERE order_id=?').run(Number(id));
  return getDb().prepare('DELETE FROM sales_orders WHERE id=?').run(Number(id)).changes;
}


export function updateMyProfile(data: any) {
  return registry.updateSelfProfile(data);
}
