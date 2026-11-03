


import { getDb } from './db';

export type PartyKind = 'person' | 'org';

function fio(row: { last_name?: string; first_name?: string; middle_name?: string; name?: string; display_name?: string }) {
  const parts = [row.last_name, row.first_name, row.middle_name].filter(Boolean);
  if (parts.length) return parts.join(' ');
  return String(row.display_name || row.name || '').trim();
}

export function listParties(filters: { q?: string; role?: string; activeOnly?: boolean } = {}) {
  const db = getDb();
  let sql = 'SELECT * FROM parties WHERE 1=1';
  const params: any[] = [];
  if (filters.activeOnly !== false) {
    sql += ' AND is_active = 1';
  }
  if (filters.role === 'supplier') sql += ' AND is_supplier = 1';
  if (filters.role === 'customer') sql += ' AND is_customer = 1';
  if (filters.role === 'partner') sql += ' AND is_partner = 1';
  if (filters.role === 'employee') sql += ' AND is_employee = 1';
  if (filters.role === 'user') sql += ' AND is_user = 1';
  if (filters.q?.trim()) {
    const q = `%${filters.q.trim()}%`;
    sql += ` AND (
      display_name LIKE ? OR IFNULL(inn,'') LIKE ? OR IFNULL(phone,'') LIKE ?
      OR IFNULL(email,'') LIKE ? OR IFNULL(last_name,'') LIKE ? OR IFNULL(first_name,'') LIKE ?
    )`;
    params.push(q, q, q, q, q, q);
  }
  sql += ' ORDER BY display_name, id';
  return (db.prepare(sql).all(...params) as any[]).map((row) => ({
    ...row,
    full_name: fio(row) || row.display_name,
    roles: [
      row.is_customer ? 'покупатель' : null,
      row.is_supplier ? 'поставщик' : null,
      row.is_partner ? 'партнёр' : null,
      row.is_employee ? 'сотрудник' : null,
      row.is_user ? 'пользователь' : null,
    ].filter(Boolean),
  }));
}

export function getParty(id: number) {
  const row = getDb().prepare('SELECT * FROM parties WHERE id = ?').get(Number(id)) as any;
  if (!row) return null;
  return {
    ...row,
    full_name: fio(row) || row.display_name,
  };
}

function syncLinkedRecords(partyId: number, data: any, fields: any) {
  const db = getDb();
  const party = getParty(partyId);
  if (!party) return;


  if (fields.is_customer || fields.is_supplier || fields.is_partner || party.counterparty_id) {
    const kind = fields.is_supplier && !fields.is_customer ? 'supplier'
      : fields.is_partner && !fields.is_customer ? 'partner'
        : fields.is_customer ? 'customer' : 'other';
    const payload = {
      name: fields.display_name,
      kind,
      inn: fields.inn,
      kpp: fields.kpp,
      phone: fields.phone,
      email: fields.email,
      contact_person: fields.kind === 'org' ? (fields.contact_person || fio(fields) || null) : fio(fields) || null,
      address: fields.address,
      notes: fields.notes,
      is_active: fields.is_active,
      supplier_id: party.supplier_id || null,
    };
    if (party.counterparty_id) {
      db.prepare(`
        UPDATE counterparties SET
          name=?, kind=?, inn=?, kpp=?, phone=?, email=?, contact_person=?, address=?, notes=?,
          is_active=?, supplier_id=COALESCE(?, supplier_id), updated_at=CURRENT_TIMESTAMP
        WHERE id=?
      `).run(
        payload.name, payload.kind, payload.inn, payload.kpp, payload.phone, payload.email,
        payload.contact_person, payload.address, payload.notes, payload.is_active,
        payload.supplier_id, party.counterparty_id,
      );
    } else if (fields.is_customer || fields.is_supplier || fields.is_partner) {
      const r = db.prepare(`
        INSERT INTO counterparties (name, kind, inn, kpp, phone, email, contact_person, address, notes, is_active, supplier_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        payload.name, payload.kind, payload.inn, payload.kpp, payload.phone, payload.email,
        payload.contact_person, payload.address, payload.notes, payload.is_active, payload.supplier_id,
      );
      db.prepare('UPDATE parties SET counterparty_id = ? WHERE id = ?').run(Number(r.lastInsertRowid), partyId);
    }
  }


  if (fields.is_supplier || party.supplier_id) {
    try {
      const cols = new Set((db.prepare('PRAGMA table_info(suppliers)').all() as any[]).map((c) => c.name));
      if (party.supplier_id) {
        db.prepare('UPDATE suppliers SET name = ? WHERE id = ?').run(fields.display_name, party.supplier_id);
        if (cols.has('contact') && fields.phone) {
          db.prepare('UPDATE suppliers SET contact = ? WHERE id = ?').run(fields.phone, party.supplier_id);
        }
        if (cols.has('note') && fields.notes) {
          db.prepare('UPDATE suppliers SET note = ? WHERE id = ?').run(fields.notes, party.supplier_id);
        }
      } else if (fields.is_supplier) {
        const r = db.prepare('INSERT INTO suppliers (name) VALUES (?)').run(fields.display_name);
        const sid = Number(r.lastInsertRowid);
        db.prepare('UPDATE parties SET supplier_id = ? WHERE id = ?').run(sid, partyId);
        const cpId = (getParty(partyId) as any)?.counterparty_id;
        if (cpId) db.prepare('UPDATE counterparties SET supplier_id = ? WHERE id = ?').run(sid, cpId);
      }
    } catch {
      
    }
  }


  if (fields.is_employee || party.employee_id) {
    const last = String(fields.last_name || '').trim() || String(fields.display_name || '').split(/\s+/)[0] || '—';
    const first = String(fields.first_name || '').trim() || String(fields.display_name || '').split(/\s+/).slice(1).join(' ') || '—';
    if (party.employee_id) {
      db.prepare(`
        UPDATE employees SET last_name=?, first_name=?, middle_name=?, phone=?, email=?, position=?, department=?,
          registry_user_id=?, is_active=?, updated_at=CURRENT_TIMESTAMP
        WHERE id=?
      `).run(
        last, first, fields.middle_name || null, fields.phone, fields.email,
        fields.position || null, fields.department || null,
        fields.registry_user_id || null, fields.is_active, party.employee_id,
      );
    } else if (fields.is_employee) {
      const r = db.prepare(`
        INSERT INTO employees (last_name, first_name, middle_name, phone, email, position, department, registry_user_id, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        last, first, fields.middle_name || null, fields.phone, fields.email,
        fields.position || null, fields.department || null,
        fields.registry_user_id || null, fields.is_active,
      );
      db.prepare('UPDATE parties SET employee_id = ? WHERE id = ?').run(Number(r.lastInsertRowid), partyId);
    }
  }
}

export function saveParty(data: any) {
  const db = getDb();
  const kind: PartyKind = data.kind === 'org' ? 'org' : 'person';
  let displayName = String(data.display_name || '').trim();
  if (!displayName) {
    displayName = fio(data);
  }
  if (!displayName) throw new Error('Укажите наименование / ФИО');

  const fields = {
    kind,
    display_name: displayName,
    last_name: String(data.last_name || '').trim() || null,
    first_name: String(data.first_name || '').trim() || null,
    middle_name: String(data.middle_name || '').trim() || null,
    inn: String(data.inn || '').trim() || null,
    kpp: String(data.kpp || '').trim() || null,
    phone: String(data.phone || '').trim() || null,
    email: String(data.email || '').trim() || null,
    address: String(data.address || '').trim() || null,
    contact_person: String(data.contact_person || '').trim() || null,
    position: String(data.position || '').trim() || null,
    department: String(data.department || '').trim() || null,
    notes: String(data.notes || '').trim() || null,
    is_customer: data.is_customer ? 1 : 0,
    is_supplier: data.is_supplier ? 1 : 0,
    is_partner: data.is_partner ? 1 : 0,
    is_employee: data.is_employee ? 1 : 0,
    is_user: data.is_user || data.registry_user_id ? 1 : 0,
    registry_user_id: data.registry_user_id ? Number(data.registry_user_id) : null,
    is_active: data.is_active === 0 || data.is_active === false ? 0 : 1,
  };

  const id = data.id ? Number(data.id) : 0;
  if (id) {
    db.prepare(`
      UPDATE parties SET
        kind=?, display_name=?, last_name=?, first_name=?, middle_name=?,
        inn=?, kpp=?, phone=?, email=?, address=?, contact_person=?,
        position=?, department=?, notes=?,
        is_customer=?, is_supplier=?, is_partner=?, is_employee=?, is_user=?,
        registry_user_id=?, is_active=?, updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).run(
      fields.kind, fields.display_name, fields.last_name, fields.first_name, fields.middle_name,
      fields.inn, fields.kpp, fields.phone, fields.email, fields.address, fields.contact_person,
      fields.position, fields.department, fields.notes,
      fields.is_customer, fields.is_supplier, fields.is_partner, fields.is_employee, fields.is_user,
      fields.registry_user_id, fields.is_active, id,
    );
    syncLinkedRecords(id, data, fields);
    return getParty(id);
  }

  const result = db.prepare(`
    INSERT INTO parties (
      kind, display_name, last_name, first_name, middle_name,
      inn, kpp, phone, email, address, contact_person, position, department, notes,
      is_customer, is_supplier, is_partner, is_employee, is_user, registry_user_id, is_active
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    fields.kind, fields.display_name, fields.last_name, fields.first_name, fields.middle_name,
    fields.inn, fields.kpp, fields.phone, fields.email, fields.address, fields.contact_person,
    fields.position, fields.department, fields.notes,
    fields.is_customer, fields.is_supplier, fields.is_partner, fields.is_employee, fields.is_user,
    fields.registry_user_id, fields.is_active,
  );
  const newId = Number(result.lastInsertRowid);
  syncLinkedRecords(newId, data, fields);
  return getParty(newId);
}

export function deleteParty(id: number) {
  getDb().prepare('UPDATE parties SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(Number(id));
  return true;
}


export function seedPartiesFromLegacy() {
  const db = getDb();
  const existing = Number((db.prepare('SELECT COUNT(*) AS c FROM parties').get() as any)?.c || 0);
  if (existing > 0) return { created: 0, skipped: existing };

  let created = 0;
  const counterparties = db.prepare('SELECT * FROM counterparties').all() as any[];
  for (const row of counterparties) {
    db.prepare(`
      INSERT INTO parties (
        kind, display_name, inn, kpp, phone, email, address, contact_person, notes,
        is_customer, is_supplier, is_partner, counterparty_id, supplier_id, is_active
      ) VALUES ('org', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      row.name,
      row.inn || null, row.kpp || null, row.phone || null, row.email || null,
      row.address || null, row.contact_person || null, row.notes || null,
      row.kind === 'customer' || !row.kind ? 1 : 0,
      row.kind === 'supplier' ? 1 : 0,
      row.kind === 'partner' ? 1 : 0,
      row.id, row.supplier_id || null, row.is_active === 0 ? 0 : 1,
    );
    created += 1;
  }

  const employees = db.prepare('SELECT * FROM employees').all() as any[];
  for (const row of employees) {
    const name = fio(row) || `Сотрудник #${row.id}`;
    db.prepare(`
      INSERT INTO parties (
        kind, display_name, last_name, first_name, middle_name, phone, email,
        position, department, notes, is_employee, is_user, employee_id, registry_user_id, is_active
      ) VALUES ('person', ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
    `).run(
      name, row.last_name, row.first_name, row.middle_name || null, row.phone || null, row.email || null,
      row.position || null, row.department || null, row.notes || null,
      row.registry_user_id ? 1 : 0, row.id, row.registry_user_id || null, row.is_active === 0 ? 0 : 1,
    );
    created += 1;
  }

  return { created, skipped: 0 };
}
