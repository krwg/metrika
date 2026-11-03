

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { app } from 'electron';
import { getDb } from './db';
import * as registry from './registry';
import * as eventBus from './eventBus';

export const EDO_OPERATORS = [
  { id: 'file', label: 'Файловый обмен (ZIP/XML)' },
  { id: 'diadoc', label: 'Диадок (контур пакета)' },
  { id: 'sbis', label: 'СБИС (контур пакета)' },
  { id: 'custom', label: 'Свой оператор (API URL)' },
] as const;

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

export function getEdoLegalSettings() {
  return {
    operator: readMeta('setting:edo.legal.operator', 'file'),
    api_url: readMeta('setting:edo.legal.api_url', ''),
    account_id: readMeta('setting:edo.legal.account_id', ''),
    has_api_key: Boolean(readMeta('setting:edo.legal.api_key', '')),
    kep_thumbprint: readMeta('setting:edo.legal.kep_thumbprint', ''),
    kep_subject: readMeta('setting:edo.legal.kep_subject', ''),
    auto_package: readMeta('setting:edo.legal.auto_package', '0') === '1',
    operators: EDO_OPERATORS,
  };
}

export function saveEdoLegalSettings(data: any) {
  if (data.operator != null) writeMeta('setting:edo.legal.operator', String(data.operator));
  if (data.api_url != null) writeMeta('setting:edo.legal.api_url', String(data.api_url || '').trim());
  if (data.account_id != null) writeMeta('setting:edo.legal.account_id', String(data.account_id || '').trim());
  if (data.api_key != null && String(data.api_key).trim()) {
    writeMeta('setting:edo.legal.api_key', String(data.api_key).trim());
  }
  if (data.kep_thumbprint != null) writeMeta('setting:edo.legal.kep_thumbprint', String(data.kep_thumbprint || '').trim());
  if (data.kep_subject != null) writeMeta('setting:edo.legal.kep_subject', String(data.kep_subject || '').trim());
  if (data.auto_package != null) {
    writeMeta('setting:edo.legal.auto_package', data.auto_package ? '1' : '0');
  }
  return getEdoLegalSettings();
}

function packagesDir() {
  const session = registry.getSession();
  const orgId = session?.organization?.id || 'x';
  const dir = path.join(app.getPath('userData'), 'edo-packages', `org-${orgId}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function buildLegalPackage(edoDocumentId: number) {
  const db = getDb();
  const doc = db.prepare('SELECT * FROM edo_documents WHERE id = ?').get(Number(edoDocumentId)) as any;
  if (!doc) throw new Error('Документ ЭДО не найден');
  const settings = getEdoLegalSettings();
  const session = registry.getSession();
  const packageId = `EDO-${doc.id}-${Date.now()}`;
  const dir = path.join(packagesDir(), packageId);
  fs.mkdirSync(dir, { recursive: true });

  const meta = {
    package_id: packageId,
    operator: settings.operator,
    account_id: settings.account_id || null,
    organization: session?.organization ? {
      id: session.organization.id,
      name: session.organization.name,
      inn: session.organization.inn,
      kpp: session.organization.kpp,
    } : null,
    document: {
      id: doc.id,
      form_type: doc.form_type,
      title: doc.title,
      status: doc.status,
      created_at: doc.created_at,
      party: doc.party || doc.counterparty_name || null,
    },
    kep: {
      thumbprint: settings.kep_thumbprint || null,
      subject: settings.kep_subject || null,
      note: settings.kep_thumbprint
        ? 'Отпечаток указан — подпись выполняется на стороне оператора/криптопровайдера.'
        : 'Отпечаток КЭП не задан — пакет без квалифицированной подписи.',
    },
    created_at: new Date().toISOString(),
  };

  const bodyXml = `<?xml version="1.0" encoding="UTF-8"?>
<MetrikaEdoPackage version="1.0" operator="${escapeXml(settings.operator)}">
  <PackageId>${escapeXml(packageId)}</PackageId>
  <Document id="${doc.id}" formType="${escapeXml(doc.form_type || '')}" status="${escapeXml(doc.status || '')}">
    <Title>${escapeXml(doc.title || '')}</Title>
    <Body><![CDATA[${String(doc.body || '')}]]></Body>
  </Document>
  <Organization inn="${escapeXml(session?.organization?.inn || '')}" kpp="${escapeXml(session?.organization?.kpp || '')}">
    <Name>${escapeXml(session?.organization?.name || '')}</Name>
  </Organization>
  <Kep thumbprint="${escapeXml(settings.kep_thumbprint || '')}" subject="${escapeXml(settings.kep_subject || '')}"/>
</MetrikaEdoPackage>
`;

  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 2), 'utf8');
  fs.writeFileSync(path.join(dir, 'document.xml'), bodyXml, 'utf8');
  fs.writeFileSync(path.join(dir, 'document.html'), String(doc.body || doc.title || ''), 'utf8');

  const hash = crypto.createHash('sha256').update(bodyXml).digest('hex');
  fs.writeFileSync(path.join(dir, 'document.sha256'), hash, 'utf8');

  const r = db.prepare(`
    INSERT INTO edo_legal_packages (
      package_id, edo_document_id, operator, status, package_dir, content_hash, meta_json
    ) VALUES (?, ?, ?, 'ready', ?, ?, ?)
  `).run(packageId, Number(doc.id), settings.operator, dir, hash, JSON.stringify(meta));

  let transport: any = { mode: 'file', dir };
  if (settings.api_url && ['diadoc', 'sbis', 'custom'].includes(settings.operator)) {
    transport = {
      mode: 'http_pending',
      url: settings.api_url,
      note: 'Пакет готов. Отправка на API оператора — вручную или через miapi/webhook до полной интеграции SDK.',
    };
    db.prepare(`UPDATE edo_legal_packages SET status = 'queued_http', transport_json = ? WHERE id = ?`)
      .run(JSON.stringify(transport), Number(r.lastInsertRowid));
  }

  void eventBus.emit('edo.legal.package', { package_id: packageId, edo_document_id: doc.id });
  return {
    id: Number(r.lastInsertRowid),
    package_id: packageId,
    dir,
    content_hash: hash,
    operator: settings.operator,
    transport,
    note: 'Пакет для оператора ЭДО сформирован (XML + meta + hash).',
  };
}

export function listLegalPackages(limit = 50) {
  return getDb().prepare(`
    SELECT p.*, d.title AS document_title, d.form_type
    FROM edo_legal_packages p
    LEFT JOIN edo_documents d ON d.id = p.edo_document_id
    ORDER BY p.id DESC
    LIMIT ?
  `).all(Math.min(200, Math.max(1, Number(limit) || 50)));
}

export function getLegalPackage(id: number) {
  return getDb().prepare(`
    SELECT p.*, d.title AS document_title, d.body AS document_body
    FROM edo_legal_packages p
    LEFT JOIN edo_documents d ON d.id = p.edo_document_id
    WHERE p.id = ?
  `).get(Number(id));
}

function escapeXml(s: string) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
