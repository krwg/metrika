import { useEffect, useMemo, useState } from 'react';
import DateField from './DateField';
import FloatingWidget from './FloatingWidget';
import PrintJobDialog, { type PrintJobResult } from './PrintJobDialog';
import EntityCustomFields, { customValuesFromFields } from './EntityCustomFields';
import { useCurrency } from '../currency';

type DocRow = {
  id: string;
  kind: string;
  kind_label: string;
  number: string;
  date: string;
  status: string;
  doc_status?: string;
  party: string;
  amount: number | null;
  lines: number;
  note: string;
  parent_number?: string | null;
  parent_kind?: string | null;
  parent_id?: number | null;
  document_id?: number | null;
  author?: string;
  ref_id?: number;
};

type PrintFormOption = { id: string; label: string; hint: string; isDefault?: boolean };

const KIND_LABELS: Record<string, string> = {
  po: 'Заказ поставщику',
  revision: 'Ревизия',
  project: 'Заказ-наряд',
  writeoff: 'Списание',
  surplus: 'Оприходование излишков',
  regrade: 'Пересортица',
  disassemble: 'Разукомплектация',
  assemble: 'Комплектация',
  transfer: 'Перемещение',
  movement: 'Складское движение',
};

const STOCK_KINDS = new Set(['writeoff', 'surplus', 'regrade', 'disassemble', 'assemble', 'transfer']);

export type DocumentsOpenTarget = 'purchases' | 'inventory' | 'projects' | 'history';

export default function DocumentsPage({
  refreshToken,
  onNotice,
  onOpenPage,
}: {
  refreshToken: number;
  onNotice: (message: string) => void;
  onOpenPage: (page: DocumentsOpenTarget, opts?: { focusId?: number | string }) => void;
}) {
  const { symbol } = useCurrency();
  const [rows, setRows] = useState<DocRow[]>([]);
  const [kind, setKind] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState<any | null>(null);
  const [printTarget, setPrintTarget] = useState<DocRow | null>(null);
  const [printForms, setPrintForms] = useState<PrintFormOption[]>([]);
  const [printFormId, setPrintFormId] = useState('simple');
  const [savedViews, setSavedViews] = useState<any[]>([]);
  const [viewName, setViewName] = useState('');
  const [activeViewId, setActiveViewId] = useState<number | null>(null);
  const [statusLabels, setStatusLabels] = useState({ draft: 'Черновик', posted: 'Проведён', cancelled: 'Отменён' });
  const [docCustomValues, setDocCustomValues] = useState<Record<string, string>>({});
  const [docCustomBusy, setDocCustomBusy] = useState(false);

  async function load() {
    try {
      const list = await (window as any).api.listDocuments({ from: from || undefined, to: to || undefined });
      setRows(list || []);
    } catch (e: any) {
      onNotice(e?.message || 'Не удалось загрузить журнал');
      setRows([]);
    }
  }

  async function reloadViews() {
    try {
      setSavedViews((await (window as any).api.listSavedListViews?.('documents')) || []);
    } catch {
      setSavedViews([]);
    }
  }

  async function loadStatusLabels() {
    try {
      const raw = await (window as any).api.getSetting('docs.status_labels', '');
      if (!raw) return;
      const parsed = JSON.parse(raw);
      setStatusLabels({
        draft: String(parsed.draft || '').trim() || 'Черновик',
        posted: String(parsed.posted || '').trim() || 'Проведён',
        cancelled: String(parsed.cancelled || '').trim() || 'Отменён',
      });
    } catch {  }
  }

  useEffect(() => { void load(); }, [refreshToken, from, to]);
  useEffect(() => { void reloadViews(); void loadStatusLabels(); }, [refreshToken]);

  function applyView(row: any) {
    try {
      const params = typeof row.params_json === 'string' ? JSON.parse(row.params_json || '{}') : (row.params || {});
      setSearch(String(params.search || ''));
      setKind(String(params.kind || 'all'));
      setStatusFilter(String(params.status || 'all'));
      setFrom(String(params.from || ''));
      setTo(String(params.to || ''));
      setActiveViewId(Number(row.id) || null);
    } catch {
      onNotice('Не удалось применить представление');
    }
  }

  async function saveCurrentView() {
    const name = viewName.trim() || [
      kind !== 'all' ? KIND_LABELS[kind] || kind : null,
      statusFilter !== 'all' ? statusFilter : null,
      search.trim() || null,
    ].filter(Boolean).join(' · ') || 'Журнал документов';
    try {
      await (window as any).api.saveListView({
        name,
        list_key: 'documents',
        params: { search, kind, status: statusFilter, from, to },
      });
      setViewName('');
      await reloadViews();
      onNotice(`Представление «${name}» сохранено`);
    } catch (e: any) {
      onNotice(e?.message || 'Не удалось сохранить представление');
    }
  }

  async function removeView(id: number) {
    try {
      await (window as any).api.deleteSavedListView(id);
      if (activeViewId === id) setActiveViewId(null);
      await reloadViews();
    } catch (e: any) {
      onNotice(e?.message || 'Не удалось удалить представление');
    }
  }

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (kind !== 'all' && row.kind !== kind) return false;
      if (statusFilter !== 'all') {
        const st = String(row.doc_status || '').toLowerCase();
        if (st !== statusFilter) return false;
      }
      if (!q) return true;
      return `${row.number} ${row.party} ${row.note} ${row.status} ${row.kind_label} ${row.parent_number || ''}`.toLowerCase().includes(q);
    });
  }, [rows, kind, statusFilter, search]);

  async function openPrintPicker(row: DocRow) {
    setBusy(true);
    try {
      const forms = (await (window as any).api.listPrintForms?.(row.kind)) || [];
      setPrintForms(forms);
      const def = forms.find((f: PrintFormOption) => f.isDefault)?.id || forms[0]?.id || 'simple';
      setPrintFormId(def);
      setPrintTarget(row);
    } catch (e: any) {
      onNotice(e?.message || 'Не удалось загрузить формы печати');
    } finally {
      setBusy(false);
    }
  }

  async function confirmPrint(job: PrintJobResult) {
    if (!printTarget) return;
    setBusy(true);
    try {
      const result = await (window as any).api.printDocument(
        printTarget.kind,
        printTarget.id,
        job.formId,
        {
          destination: job.destination,
          deviceName: job.deviceName,
          copies: job.copies,
        },
      );
      if (result?.path) onNotice(`PDF сохранён: ${result.path}`);
      else if (result === null) onNotice('Печать отменена');
      else if (result?.destination === 'printer') onNotice(`Отправлено на принтер: ${result.deviceName || ''}`);
      else onNotice('Документ отправлен на печать');
      setPrintTarget(null);
    } catch (e: any) {
      onNotice(e?.message || 'Не удалось напечатать');
    } finally {
      setBusy(false);
    }
  }

  async function cancelStockAct(row: DocRow, cascade = false) {
    if (!STOCK_KINDS.has(row.kind)) return;
    const status = row.doc_status || detail?.status;
    if (status !== 'posted') {
      onNotice('Отменить можно только проведённый акт');
      return;
    }
    const postedChildren = (detail && Number(detail.id) === Number(row.document_id || row.id)
      ? (detail.children || [])
      : []
    ).filter((c: any) => c.status === 'posted');
    if (!cascade && postedChildren.length) {
      const list = postedChildren.map((c: any) => c.doc_no).join(', ');
      const ok = window.confirm(
        `У акта ${row.number} есть проведённые следствия: ${list}.\n\nОтменить следствия и сам акт каскадом?`,
      );
      if (!ok) return;
      cascade = true;
    } else if (!window.confirm(
      cascade
        ? `Отменить акт ${row.number} вместе со всеми проведёнными следствиями? Остатки будут сторнированы.`
        : `Отменить акт ${row.number}? Остатки будут сторнированы.`,
    )) {
      return;
    }
    setBusy(true);
    try {
      const result = await (window as any).api.cancelStockOp(Number(row.document_id || row.id), { cascade });
      const extra = result?.cascaded?.length ? ` · следствия: ${result.cascaded.join(', ')}` : '';
      onNotice(`Акт ${result?.doc_no || row.number} отменён (${result?.reversed || 0} движений)${extra}`);
      setDetail(null);
      await load();
    } catch (e: any) {
      const msg = e?.message || 'Не удалось отменить акт';
      if (!cascade && /следстви/i.test(msg)) {
        setBusy(false);
        const ok = window.confirm(`${msg}\n\nОтменить следствия и акт каскадом?`);
        if (ok) {
          await cancelStockAct(row, true);
          return;
        }
        onNotice(msg);
        return;
      }
      onNotice(msg);
    } finally {
      setBusy(false);
    }
  }

  function openRelated(row: DocRow) {
    const focusId = row.ref_id ?? (Number.isFinite(Number(row.id)) ? Number(row.id) : undefined);
    if (row.kind === 'po') onOpenPage('purchases', { focusId });
    else if (row.kind === 'revision' || STOCK_KINDS.has(row.kind)) onOpenPage('inventory', { focusId });
    else if (row.kind === 'project') onOpenPage('projects', { focusId });
    else onOpenPage('history');
  }

  async function openDetailById(id: number) {
    try {
      const doc = await (window as any).api.getDocument(Number(id));
      if (!doc) { onNotice('Документ не найден в реестре'); return; }
      let allowed_transitions: any[] = [];
      try {
        const allowed = await (window as any).api.workflowAllowed?.(Number(id));
        allowed_transitions = allowed?.transitions || [];
      } catch {  }
      setDetail({ ...doc, allowed_transitions });
      setDocCustomValues(customValuesFromFields(doc.custom_values || []));
    } catch (e: any) {
      onNotice(e?.message || 'Не удалось открыть документ');
    }
  }

  async function saveDocCustomFields() {
    if (!detail?.id) return;
    setDocCustomBusy(true);
    try {
      const result = await (window as any).api.saveDocumentCustomValues?.(detail.id, docCustomValues);
      setDetail((prev: any) => (prev ? { ...prev, custom_values: result?.values || prev.custom_values } : prev));
      onNotice('Доп. реквизиты документа сохранены');
    } catch (e: any) {
      onNotice(e?.message || 'Не удалось сохранить реквизиты');
    } finally {
      setDocCustomBusy(false);
    }
  }

  async function refreshDetailAttachments() {
    if (!detail?.id) return;
    try {
      const list = await (window as any).api.listDocumentAttachments(detail.id);
      setDetail((prev: any) => (prev ? { ...prev, attachments: list || [] } : prev));
    } catch {  }
  }

  async function addAttachments() {
    if (!detail?.id) return;
    setBusy(true);
    try {
      const created = await (window as any).api.addDocumentAttachment(detail.id);
      if (created?.length) {
        onNotice(`Добавлено вложений: ${created.length}`);
        await refreshDetailAttachments();
      }
    } catch (e: any) {
      onNotice(e?.message || 'Не удалось добавить вложение');
    } finally {
      setBusy(false);
    }
  }

  async function openAttachment(id: number) {
    try {
      await (window as any).api.openDocumentAttachment(id);
    } catch (e: any) {
      onNotice(e?.message || 'Не удалось открыть файл');
    }
  }

  async function saveAttachmentAs(id: number) {
    try {
      const result = await (window as any).api.saveDocumentAttachmentAs(id);
      if (result?.path) onNotice(`Сохранено: ${result.path}`);
    } catch (e: any) {
      onNotice(e?.message || 'Не удалось сохранить файл');
    }
  }

  async function removeAttachment(id: number, name: string) {
    if (!window.confirm(`Удалить вложение «${name}»?`)) return;
    setBusy(true);
    try {
      await (window as any).api.deleteDocumentAttachment(id);
      onNotice('Вложение удалено');
      await refreshDetailAttachments();
    } catch (e: any) {
      onNotice(e?.message || 'Не удалось удалить вложение');
    } finally {
      setBusy(false);
    }
  }

  function formatBytes(n: number) {
    const size = Number(n) || 0;
    if (size < 1024) return `${size} Б`;
    if (size < 1024 * 1024) return `${Math.round(size / 1024)} КБ`;
    return `${(size / (1024 * 1024)).toFixed(1)} МБ`;
  }

  async function openDetail(row: DocRow) {
    if (!row.document_id) {
      onNotice('Карточка реестра недоступна — документ ещё не зарегистрирован. Откройте раздел.');
      return;
    }
    await openDetailById(Number(row.document_id));
  }

  const stockCount = rows.filter((r) => STOCK_KINDS.has(r.kind)).length;

  return (
    <>
      <div className="page-header">
        <div>
          <div className="section-label">Документооборот</div>
          <h1>Журнал документов</h1>
          <p>
            <strong>Карточка</strong> — реестр (строки, вложения, цепочки). <strong>Раздел</strong> — операционный экран (закупки, склад, проекты).
            Печать — с выбором формы и принтера / PDF.
          </p>
        </div>
        <button type="button" className="btn btn-secondary" onClick={() => void load()} disabled={busy}>Обновить</button>
      </div>

      <div className="dashboard-grid" style={{ marginBottom: 16 }}>
        <div className="stat-card">
          <div className="stat-label">Всего в журнале</div>
          <div className="stat-value">{visible.length}</div>
          <div className="stat-hint">из {rows.length} за период</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Закупки</div>
          <div className="stat-value">{rows.filter((r) => r.kind === 'po').length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Ревизии</div>
          <div className="stat-value">{rows.filter((r) => r.kind === 'revision').length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Складские акты</div>
          <div className="stat-value">{stockCount}</div>
        </div>
      </div>

      <section className="table-wrap">
        <div className="table-header">
          <div><h2>Документы организации</h2></div>
          <span className="table-caption">{visible.length}</span>
        </div>
        <div className="analytics-list-tools compact-filters">
          <input placeholder="Номер, контрагент, основание…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="all">Все виды</option>
            {Object.entries(KIND_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Статус реестра">
            <option value="all">Все статусы реестра</option>
            <option value="draft">{statusLabels.draft}</option>
            <option value="posted">{statusLabels.posted}</option>
            <option value="cancelled">{statusLabels.cancelled}</option>
          </select>
          <DateField label="С" value={from} onChange={setFrom} />
          <DateField label="По" value={to} onChange={setTo} />
          <input
            placeholder="Название представления…"
            value={viewName}
            onChange={(e) => setViewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void saveCurrentView(); }}
            style={{ minWidth: 160 }}
          />
          <button type="button" className="btn btn-secondary" onClick={() => void saveCurrentView()}>Сохранить вид</button>
        </div>
        {savedViews.length > 0 && (
          <div className="filter-row" style={{ marginTop: 8, flexWrap: 'wrap' }}>
            {savedViews.map((row) => (
              <span key={row.id} className={`filter-chip ${activeViewId === row.id ? 'active' : ''}`} style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                <button type="button" className="btn btn-text" style={{ padding: 0 }} onClick={() => applyView(row)}>{row.name}</button>
                <button type="button" className="btn btn-text" style={{ padding: 0 }} title="Удалить" onClick={() => void removeView(row.id)}>×</button>
              </span>
            ))}
          </div>
        )}
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Дата</th>
                <th>Вид</th>
                <th>Номер</th>
                <th>Основание</th>
                <th>Статус</th>
                <th>Контрагент / адрес</th>
                <th>Строк</th>
                <th>Сумма</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 && (
                <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--muted)', padding: 28 }}>Документов за период нет</td></tr>
              )}
              {visible.map((row) => (
                <tr key={`${row.kind}-${row.id}`}>
                  <td className="mono">{row.date ? new Date(row.date).toLocaleString('ru-RU') : '—'}</td>
                  <td>{row.kind_label}</td>
                  <td className="strong mono">{row.number}</td>
                  <td className="mono">
                    {row.parent_number && row.parent_id ? (
                      <button
                        type="button"
                        className="btn btn-text mono"
                        title="Открыть основание"
                        onClick={() => void openDetailById(Number(row.parent_id))}
                      >
                        {row.parent_number}
                      </button>
                    ) : (row.parent_number || '—')}
                  </td>
                  <td>{row.status || '—'}</td>
                  <td>{row.party || '—'}{row.note ? <div className="subtext">{row.note}</div> : null}</td>
                  <td>{row.lines}</td>
                  <td>{row.amount != null ? `${Number(row.amount).toLocaleString('ru-RU')} ${symbol}` : '—'}</td>
                  <td className="row-actions">
                    <button
                      type="button"
                      className="btn btn-text"
                      disabled={!row.document_id}
                      title={row.document_id ? 'Карточка в реестре документов' : 'Нет записи в реестре — откройте раздел'}
                      onClick={() => void openDetail(row)}
                    >
                      Карточка
                    </button>
                    <button
                      type="button"
                      className="btn btn-text"
                      title="Операционный раздел"
                      onClick={() => openRelated(row)}
                    >
                      Раздел
                    </button>
                    <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void openPrintPicker(row)}>Печать</button>
                    {STOCK_KINDS.has(row.kind) && row.doc_status === 'posted' && (
                      <button type="button" className="btn btn-danger" disabled={busy} onClick={() => void cancelStockAct(row)}>
                        Отменить
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {detail && (
        <FloatingWidget
          title={`${detail.doc_no || 'Документ'}`}
          open
          onClose={() => setDetail(null)}
          width={720}
          zIndex={1780}
        >
          <div className="section-label">{KIND_LABELS[detail.doc_type] || detail.doc_type}</div>
          <p className="subtext" style={{ marginTop: 4 }}>
            Статус: <strong>{detail.status_display?.label || detail.status}</strong>
            {detail.status_display?.is_workflow ? (
              <span className="subtext"> · реестр: {detail.status}</span>
            ) : null}
            {detail.party ? ` · ${detail.party}` : ''}
            {detail.author ? ` · ${detail.author}` : ''}
          </p>
          <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="subtext">Workflow</span>
            {(detail.allowed_transitions || []).map((t: any) => (
              <button
                key={`${t.from_status}-${t.to_status}`}
                type="button"
                className="btn btn-secondary"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const next = await (window as any).api.workflowApply?.(detail.id, t.to_status);
                    setDetail((prev: any) => (prev ? {
                      ...prev,
                      ...next?.document,
                      status_display: next?.display,
                    } : prev));
                    onNotice(`${t.label || t.to_status}`);
                    await load();
                    const allowed = await (window as any).api.workflowAllowed?.(detail.id);
                    setDetail((prev: any) => (prev ? { ...prev, allowed_transitions: allowed?.transitions || [] } : prev));
                  } catch (err: any) {
                    onNotice(err?.message || 'Переход недоступен');
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {t.label || t.to_status}
              </button>
            ))}
            {!detail.allowed_transitions?.length && (
              <span className="muted" style={{ fontSize: 12 }}>Нет доступных переходов</span>
            )}
          </div>
          {detail.parent_doc_no && (
            <p className="subtext">
              Основание:{' '}
              {detail.parent_id ? (
                <button type="button" className="btn btn-text mono" onClick={() => void openDetailById(Number(detail.parent_id))}>
                  {detail.parent_doc_no}
                </button>
              ) : (
                <strong className="mono">{detail.parent_doc_no}</strong>
              )}
              {detail.parent_doc_type ? ` (${KIND_LABELS[detail.parent_doc_type] || detail.parent_doc_type})` : ''}
            </p>
          )}
          {detail.note && <p>{detail.note}</p>}

          <div style={{ marginBottom: 14 }}>
            <EntityCustomFields
              entity="document"
              values={docCustomValues}
              onChange={setDocCustomValues}
            />
            <div style={{ marginTop: 8 }}>
              <button type="button" className="btn btn-secondary" disabled={docCustomBusy} onClick={() => void saveDocCustomFields()}>
                Сохранить реквизиты
              </button>
            </div>
          </div>

          {(detail.children || []).length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div className="section-label">Следствия</div>
              <ul className="doc-chain-list">
                {detail.children.map((child: any) => (
                  <li key={child.id}>
                    <button type="button" className="btn btn-text mono" onClick={() => void openDetailById(Number(child.id))}>
                      {child.doc_no}
                    </button>
                    <span className="subtext"> · {KIND_LABELS[child.doc_type] || child.doc_type} · {child.status}</span>
                    {STOCK_KINDS.has(child.doc_type) && child.status === 'posted' && (
                      <button
                        type="button"
                        className="btn btn-text"
                        disabled={busy}
                        onClick={() => void cancelStockAct({
                          id: String(child.id),
                          kind: child.doc_type,
                          kind_label: KIND_LABELS[child.doc_type] || child.doc_type,
                          number: child.doc_no,
                          date: child.doc_date || '',
                          status: child.status,
                          doc_status: child.status,
                          party: '',
                          amount: null,
                          lines: 0,
                          note: '',
                          document_id: child.id,
                        })}
                      >
                        Отменить
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div style={{ marginBottom: 14 }}>
            <div className="table-header" style={{ marginBottom: 8 }}>
              <div className="section-label" style={{ margin: 0 }}>Вложения</div>
              <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void addAttachments()}>
                Добавить файл
              </button>
            </div>
            {(detail.attachments || []).length === 0 ? (
              <p className="subtext" style={{ margin: 0 }}>Файлов пока нет. Можно прикрепить PDF, скан или таблицу (до 25 МБ).</p>
            ) : (
              <ul className="doc-chain-list">
                {(detail.attachments || []).map((file: any) => (
                  <li key={file.id}>
                    <button type="button" className="btn btn-text" onClick={() => void openAttachment(file.id)}>
                      {file.file_name}
                    </button>
                    <span className="subtext">
                      {' '}· v{file.version} · {formatBytes(file.size_bytes)}
                      {file.uploaded_by ? ` · ${file.uploaded_by}` : ''}
                    </span>
                    <button type="button" className="btn btn-text" disabled={busy} onClick={() => void saveAttachmentAs(file.id)}>
                      Сохранить как…
                    </button>
                    <button type="button" className="btn btn-text" disabled={busy} onClick={() => void removeAttachment(file.id, file.file_name)}>
                      Удалить
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="table-scroll" style={{ maxHeight: 320 }}>
            <table>
              <thead>
                <tr>
                  <th>Товар</th>
                  <th>Роль</th>
                  <th>Кол-во</th>
                  <th>Пара</th>
                </tr>
              </thead>
              <tbody>
                {(detail.lines || []).length === 0 && (
                  <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--muted)' }}>Строк нет</td></tr>
                )}
                {(detail.lines || []).map((line: any) => (
                  <tr key={line.id || `${line.item_id}-${line.line_role}`}>
                    <td className="strong">{line.item_name}<div className="subtext mono">{line.sku || ''}</div></td>
                    <td>{line.line_role || 'main'}</td>
                    <td>{line.quantity}</td>
                    <td>{line.counterpart_name || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="modal-actions" style={{ marginTop: 14 }}>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy}
              onClick={() => void openPrintPicker({
                id: (detail.doc_type === 'po' || detail.doc_type === 'revision' || detail.doc_type === 'project') && detail.ref_id != null
                  ? String(detail.ref_id)
                  : String(detail.id),
                kind: detail.doc_type,
                kind_label: KIND_LABELS[detail.doc_type] || detail.doc_type,
                number: detail.doc_no,
                date: detail.doc_date,
                status: detail.status,
                doc_status: detail.status,
                party: detail.party || '',
                amount: null,
                lines: (detail.lines || []).length,
                note: detail.note || '',
                document_id: detail.id,
                ref_id: detail.ref_id,
              })}
            >
              Печать PDF
            </button>
            {STOCK_KINDS.has(detail.doc_type) && detail.status === 'posted' && (
              <button
                type="button"
                className="btn btn-danger"
                disabled={busy}
                onClick={() => void cancelStockAct({
                  id: String(detail.id),
                  kind: detail.doc_type,
                  kind_label: KIND_LABELS[detail.doc_type] || detail.doc_type,
                  number: detail.doc_no,
                  date: detail.doc_date,
                  status: detail.status,
                  doc_status: detail.status,
                  party: detail.party || '',
                  amount: null,
                  lines: (detail.lines || []).length,
                  note: detail.note || '',
                  document_id: detail.id,
                })}
              >
                Отменить проведение
              </button>
            )}
            {(detail.doc_type === 'po' || detail.doc_type === 'project' || detail.doc_type === 'revision') && (
              <button
                type="button"
                className="btn btn-text"
                onClick={() => openRelated({
                  id: String(detail.ref_id || detail.id),
                  kind: detail.doc_type,
                  kind_label: KIND_LABELS[detail.doc_type] || detail.doc_type,
                  number: detail.doc_no,
                  date: detail.doc_date || '',
                  status: detail.status,
                  party: detail.party || '',
                  amount: null,
                  lines: 0,
                  note: '',
                  ref_id: detail.ref_id,
                  document_id: detail.id,
                })}
              >
                Открыть раздел
              </button>
            )}
            <button type="button" className="btn btn-text" onClick={() => setDetail(null)}>Закрыть</button>
          </div>
        </FloatingWidget>
      )}

      {printTarget && (
        <PrintJobDialog
          open
          title={`Печать · ${printTarget.number}`}
          forms={printForms.map((f) => ({ id: f.id, label: f.label, hint: f.hint, isDefault: f.isDefault }))}
          defaultFormId={printFormId}
          busy={busy}
          onClose={() => setPrintTarget(null)}
          onSubmit={confirmPrint}
        />
      )}
    </>
  );
}
