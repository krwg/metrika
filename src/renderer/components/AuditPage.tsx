import { useEffect, useMemo, useState } from 'react';
import FloatingWidget from './FloatingWidget';

const ACTION_LABELS: Record<string, string> = {
  'session.open': 'Вход',
  'session.close': 'Выход',
  'item.create': 'Товар создан',
  'item.update': 'Товар изменён',
  'item.delete': 'Товар удалён',
  'unit.update': 'Единица изменена',
  'category.update': 'Категория изменена',
  'location.update': 'Адрес изменён',
  'supplier.update': 'Поставщик изменён',
  'purchase.create': 'Заказ создан',
  'purchase.update': 'Заказ изменён',
  'purchase.delete': 'Заказ удалён',
  'purchase.status': 'Статус заказа',
  'purchase.receive': 'Приёмка PO',
  'purchase.unreceive': 'Отмена приёмки',
  'inventory.accept': 'Ревизия принята',
  'user.create': 'Пользователь создан',
  'user.update': 'Пользователь изменён',
  'user.delete': 'Пользователь удалён',
  'group.create': 'Группа создана',
  'group.update': 'Группа изменена',
  'group.delete': 'Группа удалена',
  'backup.create': 'Резервная копия',
  'backup.restore': 'Восстановление БД',
  'backup.auto': 'Автокопия',
  'backup.exportOrg': 'Экспорт организации',
  'app.error': 'Ошибка приложения',
  'app.warn': 'Предупреждение',
  'counterparty.create': 'Контрагент создан',
  'counterparty.update': 'Контрагент изменён',
  'counterparty.hide': 'Контрагент скрыт',
  'counterparty.purge': 'Контрагент удалён',
  'counterparty.delete': 'Контрагент удалён',
  'db.healLedgerDrift': 'Выравнивание учёта (качество)',
  'db.rebuildInventory': 'Пересчёт остатков из журнала',
  'db.diagnose': 'Диагностика базы',
};

const ENTITY_LABELS: Record<string, string> = {
  item: 'Товар',
  unit: 'Единица',
  category: 'Категория',
  location: 'Адрес',
  supplier: 'Поставщик',
  purchase_order: 'Заказ',
  user: 'Пользователь',
  session: 'Сессия',
  counterparty: 'Контрагент',
  settings: 'Настройки',
};

type FieldDiff = {
  id?: number;
  field?: string;
  field_label?: string;
  old_value?: string | null;
  new_value?: string | null;
  user_name?: string | null;
  created_at?: string;
};

type Props = {
  refreshToken: number;
  onNotice: (message: string) => void;
};

function isErrorAction(action: string) {
  return action === 'app.error' || action === 'app.warn' || /\.error$/i.test(action);
}

function pluralFields(n: number) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'поле';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'поля';
  return 'полей';
}

function humanizeDetail(action: string, detail: string, row: any): string {
  const d = String(detail || '').trim();
  if (!d) return '—';
  if (/^(Вошёл|Вышел|Изменён|Изменена|Изменены|Создан|Создана|Удалён|Удалена)\b/i.test(d)) return d;
  if (d.includes('→') || d.includes('» → «')) return d;

  if (action === 'session.open') {
    const m = d.match(/^Вход:\s*(.+?)\s*·\s*(.+)$/i);
    if (m) return `Вошёл ${m[2].trim()} в организацию «${m[1].trim()}»`;
    if (/^Вход:/i.test(d)) {
      const rest = d.replace(/^Вход:\s*/i, '').trim();
      return `Вошёл ${rest}`;
    }
  }
  if (action === 'session.close') {
    const who = row.user_name || row.user_login || 'пользователь';
    if (/^Выход/i.test(d)) return `Вышел ${who}`;
  }

  if (action === 'user.update') {
    if (d.includes('·') && !d.includes('→')) {
      const parts = d.split('·').map((s) => s.trim()).filter(Boolean);
      return `Пользователь ${parts[0] || '—'}`;
    }
  }

  if (action === 'item.update' || action === 'category.update' || action === 'supplier.update'
    || action === 'location.update' || action === 'unit.update' || action === 'purchase.update') {
    const m = d.match(/^(.+?)\s*·\s*полей:\s*(\d+)\s*$/i);
    if (m) return `${m[1].trim()} · ${m[2]} ${pluralFields(Number(m[2]) || 0)}`;
    const bare = d.match(/^полей:\s*(\d+)\s*$/i);
    if (bare) return `${bare[1]} ${pluralFields(Number(bare[1]) || 0)}`;
  }

  if (d.includes('→') && d.length > 80) {
    const n = (d.match(/→/g) || []).length;
    const head = d.split(':')[0]?.trim();
    return n > 1 ? `${head || 'Изменения'} · ${n} ${pluralFields(n)}` : d.slice(0, 72) + '…';
  }

  return d.length > 100 ? `${d.slice(0, 96)}…` : d;
}

function parseDetailFieldLines(detail: string): FieldDiff[] {
  const text = String(detail || '');
  if (!text.includes('→')) return [];

  const body = text.includes(': ') ? text.slice(text.indexOf(': ') + 2) : text;
  const chunks = body.split(/\s*;\s*/).map((s) => s.trim()).filter(Boolean);
  const out: FieldDiff[] = [];
  for (const chunk of chunks) {
    const m = chunk.match(/^(.+?):\s*«(.*?)»\s*→\s*«(.*?)»\s*$/);
    if (m) {
      out.push({ field_label: m[1].trim(), old_value: m[2], new_value: m[3] });
    }
  }
  return out;
}

function pickFieldDiffsForEvent(all: FieldDiff[], eventAt: string | undefined, detail: string): FieldDiff[] {
  if (!all.length) return [];
  const eventTime = eventAt ? new Date(eventAt).getTime() : NaN;
  if (!Number.isFinite(eventTime)) return all.slice(0, 20);

  const near = all.filter((row) => {
    const t = row.created_at ? new Date(row.created_at).getTime() : NaN;
    return Number.isFinite(t) && Math.abs(t - eventTime) <= 8000;
  });
  if (near.length) return near;

  const countMatch = String(detail || '').match(/полей:\s*(\d+)/i);
  const want = countMatch ? Math.max(1, Number(countMatch[1]) || 0) : 0;
  if (want > 0) {
    return [...all]
      .sort((a, b) => {
        const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
        const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
        return Math.abs(ta - eventTime) - Math.abs(tb - eventTime);
      })
      .slice(0, want);
  }

  const minute = all.filter((row) => {
    const t = row.created_at ? new Date(row.created_at).getTime() : NaN;
    return Number.isFinite(t) && Math.abs(t - eventTime) <= 60_000;
  });
  return minute.slice(0, 24);
}

export default function AuditPage({ refreshToken, onNotice }: Props) {
  const [tab, setTab] = useState<'actions' | 'fields'>('actions');
  const [rows, setRows] = useState<any[]>([]);
  const [fieldRows, setFieldRows] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const [entityFilter, setEntityFilter] = useState('all');
  const [kindFilter, setKindFilter] = useState<'all' | 'errors' | 'ops'>('all');
  const [selected, setSelected] = useState<any | null>(null);
  const [fieldDiff, setFieldDiff] = useState<FieldDiff[]>([]);
  const [diffLoading, setDiffLoading] = useState(false);

  async function load() {
    try {
      const api = (window as any).api;
      if (typeof api.listAudit !== 'function') {
        setRows([]);
      } else {
        setRows((await api.listAudit(400)) || []);
      }
      if (typeof api.listEntityHistory === 'function') {
        setFieldRows((await api.listEntityHistory({ limit: 300 })) || []);
      } else {
        setFieldRows([]);
      }
    } catch (e: any) {
      onNotice(e?.message || 'Не удалось загрузить журнал');
      setRows([]);
      setFieldRows([]);
    }
  }

  useEffect(() => { void load(); }, [refreshToken]);

  const actions = useMemo(() => {
    const set = new Set(rows.map((row) => row.action).filter(Boolean));
    return [...set].sort();
  }, [rows]);

  const entities = useMemo(() => {
    const set = new Set(fieldRows.map((row) => row.entity).filter(Boolean));
    return [...set].sort();
  }, [fieldRows]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (actionFilter !== 'all' && row.action !== actionFilter) return false;
      if (kindFilter === 'errors' && !isErrorAction(String(row.action || ''))) return false;
      if (kindFilter === 'ops' && isErrorAction(String(row.action || ''))) return false;
      if (!q) return true;
      const comment = humanizeDetail(String(row.action || ''), String(row.detail || ''), row);
      return `${row.action} ${row.user_name || ''} ${row.user_login || ''} ${row.entity || ''} ${row.entity_id || ''} ${row.detail || ''} ${comment}`.toLowerCase().includes(q);
    });
  }, [rows, search, actionFilter, kindFilter]);

  const visibleFields = useMemo(() => {
    const q = search.trim().toLowerCase();
    return fieldRows.filter((row) => {
      if (entityFilter !== 'all' && row.entity !== entityFilter) return false;
      if (!q) return true;
      return `${row.entity} ${row.entity_id} ${row.field} ${row.field_label || ''} ${row.old_value || ''} ${row.new_value || ''} ${row.user_name || ''}`.toLowerCase().includes(q);
    });
  }, [fieldRows, search, entityFilter]);

  async function openEvent(row: any) {
    setSelected(row);
    setFieldDiff([]);
    setDiffLoading(true);
    try {
      const fromDetail = parseDetailFieldLines(String(row.detail || ''));
      const api = (window as any).api;
      const entity = String(row.entity || '');
      const entityId = row.entity_id != null ? Number(row.entity_id) : NaN;
      const canLoadHistory = entity
        && Number.isFinite(entityId)
        && entity !== 'session'
        && typeof api.listEntityHistory === 'function';

      if (canLoadHistory) {
        const all = (await api.listEntityHistory({
          entity,
          entityId,
          limit: 80,
        })) || [];
        const matched = pickFieldDiffsForEvent(all, row.created_at, String(row.detail || ''));
        if (matched.length) {
          setFieldDiff(matched);
        } else if (fromDetail.length) {
          setFieldDiff(fromDetail);
        } else {
          setFieldDiff([]);
        }
      } else if (fromDetail.length) {
        setFieldDiff(fromDetail);
      }
    } catch {
      const fromDetail = parseDetailFieldLines(String(row.detail || ''));
      setFieldDiff(fromDetail);
    } finally {
      setDiffLoading(false);
    }
  }

  const selectedComment = selected
    ? humanizeDetail(String(selected.action || ''), String(selected.detail || ''), selected)
    : '';

  return (
    <>
      <div className="page-header">
        <div>
          <div className="section-label">Отладка и контроль</div>
          <h1>Журнал действий</h1>
          <p>
            Кто и что сделал в программе: вход, правки, удаление контрагентов, выравнивание учёта, ошибки.
            Фильтр «Ошибки» — только сбои. Клик по строке — подробности и изменение полей.
          </p>
          <p className="subtext">
            Движения остатков смотрите в «Журнале склада». Живой лог и команды — в терминале внизу (help).
          </p>
        </div>
        <div className="table-actions">
          <button type="button" className={`filter-chip ${tab === 'actions' ? 'active' : ''}`} onClick={() => setTab('actions')}>События</button>
          <button type="button" className={`filter-chip ${tab === 'fields' ? 'active' : ''}`} onClick={() => setTab('fields')}>Поля</button>
          <button type="button" className="btn btn-secondary" onClick={() => void load()}>Обновить</button>
        </div>
      </div>

      {tab === 'actions' && (
        <section className="table-wrap">
          <div className="table-header">
            <div><h2>События</h2></div>
            <span className="table-caption">{visible.length} из {rows.length}</span>
          </div>
          <div className="analytics-list-tools compact-filters">
            <input placeholder="Поиск: пользователь, объект, комментарий…" value={search} onChange={(e) => setSearch(e.target.value)} />
            <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}>
              <option value="all">Все действия</option>
              {actions.map((action) => (
                <option key={action} value={action}>{ACTION_LABELS[action] || action}</option>
              ))}
            </select>
            <select value={kindFilter} onChange={(e) => setKindFilter(e.target.value as any)}>
              <option value="all">Все типы</option>
              <option value="ops">Операции</option>
              <option value="errors">Ошибки и предупреждения</option>
            </select>
          </div>
          <div className="table-scroll">
            <table className="ledger-table">
              <thead>
                <tr>
                  <th>Дата / время</th>
                  <th>Действие</th>
                  <th>Профиль</th>
                  <th>Комментарий</th>
                  <th>Объект</th>
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', color: 'var(--muted)', padding: 28 }}>
                      Пока нет записей
                    </td>
                  </tr>
                )}
                {visible.map((row) => {
                  const errorLike = isErrorAction(String(row.action || ''));
                  const title = ACTION_LABELS[row.action] || row.action;
                  const when = row.created_at ? new Date(row.created_at).toLocaleString('ru-RU') : '—';
                  const profile = row.user_name || row.user_login || 'Система';
                  const comment = humanizeDetail(String(row.action || ''), String(row.detail || ''), row);
                  const entityLabel = row.entity
                    ? `${ENTITY_LABELS[row.entity] || row.entity}${row.entity_id != null ? ` #${row.entity_id}` : ''}`
                    : '—';
                  return (
                    <tr
                      key={row.id}
                      className={`clickable-row ${errorLike ? 'audit-row-error' : ''} ${selected?.id === row.id ? 'selected' : ''}`}
                      onClick={() => void openEvent(row)}
                    >
                      <td className="mono">{when}</td>
                      <td>
                        <span className={`type-badge ${errorLike ? 'out' : 'in'}`}>{title}</span>
                      </td>
                      <td>
                        {profile}
                        {row.user_login ? <div className="subtext mono">{row.user_login}</div> : null}
                      </td>
                      <td className="audit-comment-cell" title={comment}>{comment}</td>
                      <td className="mono">{entityLabel}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === 'fields' && (
        <section className="table-wrap">
          <div className="table-header">
            <div><h2>История полей</h2></div>
            <span className="table-caption">{visibleFields.length} из {fieldRows.length}</span>
          </div>
          <div className="analytics-list-tools compact-filters">
            <input placeholder="Поиск по полю, значению, объекту…" value={search} onChange={(e) => setSearch(e.target.value)} />
            <select value={entityFilter} onChange={(e) => setEntityFilter(e.target.value)}>
              <option value="all">Все объекты</option>
              {entities.map((entity) => (
                <option key={entity} value={entity}>{ENTITY_LABELS[entity] || entity}</option>
              ))}
            </select>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Время</th>
                  <th>Объект</th>
                  <th>Поле</th>
                  <th>Было</th>
                  <th>Стало</th>
                  <th>Кто</th>
                </tr>
              </thead>
              <tbody>
                {visibleFields.length === 0 && (
                  <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--muted)', padding: 28 }}>Пока нет изменений полей — отредактируйте товар или категорию</td></tr>
                )}
                {visibleFields.map((row) => (
                  <tr key={row.id}>
                    <td className="mono">{row.created_at ? new Date(row.created_at).toLocaleString('ru-RU') : '—'}</td>
                    <td className="strong">{ENTITY_LABELS[row.entity] || row.entity}<div className="subtext mono">#{row.entity_id}</div></td>
                    <td>{row.field_label || row.field}</td>
                    <td className="mono">{row.old_value ?? '—'}</td>
                    <td className="mono">{row.new_value ?? '—'}</td>
                    <td>{row.user_name || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {selected && (
        <FloatingWidget
          title={ACTION_LABELS[selected.action] || selected.action || 'Событие'}
          open
          onClose={() => { setSelected(null); setFieldDiff([]); }}
          width={640}
          zIndex={1780}
        >
          <div className="section-label">Карточка события</div>
          <p className="subtext" style={{ marginTop: 4 }}>
            {selected.created_at ? new Date(selected.created_at).toLocaleString('ru-RU') : '—'}
            {' · '}
            {selected.user_name || selected.user_login || 'Система'}
            {selected.user_login ? ` (${selected.user_login})` : ''}
          </p>

          <div className="form-grid" style={{ marginTop: 12 }}>
            <label className="field-wide">Что произошло
              <textarea readOnly rows={4} value={selectedComment} />
            </label>
            <label>Объект
              <input
                readOnly
                value={selected.entity
                  ? `${ENTITY_LABELS[selected.entity] || selected.entity}${selected.entity_id != null ? ` #${selected.entity_id}` : ''}`
                  : '—'}
              />
            </label>
            <label>Код действия
              <input readOnly className="mono" value={selected.action || '—'} />
            </label>
          </div>

          <div style={{ marginTop: 16 }}>
            <div className="section-label">Изменения полей</div>
            {diffLoading ? (
              <p className="subtext" style={{ marginTop: 8 }}>Загрузка диффа…</p>
            ) : fieldDiff.length === 0 ? (
              <p className="subtext" style={{ marginTop: 8 }}>
                {String(selected.action || '').endsWith('.update')
                  ? 'Построчный дифф для этой записи не найден (старое событие без истории полей или изменение без смены значений).'
                  : 'Для этого типа события дифф полей не применяется.'}
              </p>
            ) : (
              <div className="table-scroll" style={{ marginTop: 8, maxHeight: 280 }}>
                <table>
                  <thead>
                    <tr>
                      <th>Поле</th>
                      <th>Было</th>
                      <th>Стало</th>
                      {fieldDiff.some((r) => r.user_name) ? <th>Кто</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {fieldDiff.map((row, idx) => (
                      <tr key={row.id ?? `${row.field_label}-${idx}`}>
                        <td className="strong">{row.field_label || row.field || '—'}</td>
                        <td className="mono">{row.old_value ?? '—'}</td>
                        <td className="mono">{row.new_value ?? '—'}</td>
                        {fieldDiff.some((r) => r.user_name) ? <td>{row.user_name || '—'}</td> : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </FloatingWidget>
      )}
    </>
  );
}
