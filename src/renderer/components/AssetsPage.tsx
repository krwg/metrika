import { useEffect, useState } from 'react';
import FloatingWidget from './FloatingWidget';

type Props = {
  refreshToken: number;
  onNotice: (msg: string) => void;
  onChanged: () => void;
};

const emptyForm = {
  inventory_no: '',
  name: '',
  category: '',
  serial_no: '',
  barcode: '',
  status: 'in_stock',
  location_id: '' as string | number,
  employee_id: '' as string | number,
  responsible_name: '',
  purchase_date: '',
  warranty_until: '',
  cost: '' as string | number,
  manufacturer: '',
  model: '',
  notes: '',
  is_active: true,
};

export default function AssetsPage({ refreshToken, onNotice, onChanged }: Props) {
  const [rows, setRows] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [meta, setMeta] = useState<{ statuses: { id: string; label: string }[]; moveKinds: { id: string; label: string }[] }>({
    statuses: [],
    moveKinds: [],
  });
  const [locations, setLocations] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [detail, setDetail] = useState<any | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [error, setError] = useState('');
  const [moveKind, setMoveKind] = useState('transfer');
  const [moveLoc, setMoveLoc] = useState<string | number>('');
  const [moveEmp, setMoveEmp] = useState<string | number>('');
  const [moveNote, setMoveNote] = useState('');
  const [maintForm, setMaintForm] = useState({
    kind: 'service', planned_at: '', done_at: '', status: 'planned', cost: '', vendor: '', note: '',
  });

  async function load() {
    try {
      const [list, sum] = await Promise.all([
        (window as any).api.listAssets({
          q: search,
          status: statusFilter || undefined,
          activeOnly: !showInactive,
        }),
        (window as any).api.summarizeAssets(),
      ]);
      setRows(list || []);
      setSummary(sum || null);
    } catch (e: any) {
      onNotice(e?.message || 'Не удалось загрузить оборудование');
    }
  }

  useEffect(() => {
    (window as any).api.assetsMeta?.().then((m: any) => {
      if (m) setMeta(m);
    }).catch(() => {});
    (window as any).api.getLocations().then((list: any[]) => setLocations(list || [])).catch(() => setLocations([]));
    (window as any).api.listEmployees({ activeOnly: true }).then((list: any[]) => setEmployees(list || [])).catch(() => setEmployees([]));
  }, [refreshToken]);

  useEffect(() => { void load(); }, [refreshToken, showInactive, statusFilter]);
  useEffect(() => {
    const t = window.setTimeout(() => { void load(); }, 200);
    return () => window.clearTimeout(t);
  }, [search]);

  function openNew() {
    setEditing({});
    setForm({ ...emptyForm });
    setError('');
  }

  function openEdit(row: any) {
    setEditing(row);
    setForm({
      inventory_no: row.inventory_no || '',
      name: row.name || '',
      category: row.category || '',
      serial_no: row.serial_no || '',
      barcode: row.barcode || '',
      status: row.status || 'in_stock',
      location_id: row.location_id || '',
      employee_id: row.employee_id || '',
      responsible_name: row.responsible_name || '',
      purchase_date: row.purchase_date || '',
      warranty_until: row.warranty_until || '',
      cost: row.cost ?? '',
      manufacturer: row.manufacturer || '',
      model: row.model || '',
      notes: row.notes || '',
      is_active: row.is_active !== 0,
    });
    setError('');
  }

  async function openDetail(row: any) {
    try {
      const full = await (window as any).api.getAsset(row.id);
      setDetail(full);
      setMoveKind('transfer');
      setMoveLoc(full?.location_id || '');
      setMoveEmp(full?.employee_id || '');
      setMoveNote('');
      setMaintForm({ kind: 'service', planned_at: '', done_at: '', status: 'planned', cost: '', vendor: '', note: '' });
    } catch (e: any) {
      onNotice(e?.message || 'Не удалось открыть карточку');
    }
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    try {
      await (window as any).api.saveAsset({
        id: editing?.id,
        ...form,
        location_id: form.location_id || null,
        employee_id: form.employee_id || null,
        cost: form.cost === '' ? null : form.cost,
        is_active: form.is_active ? 1 : 0,
      });
      setEditing(null);
      await load();
      onChanged();
      onNotice('Карточка ОС сохранена');
    } catch (e: any) {
      setError(e?.message || 'Ошибка сохранения');
    }
  }

  async function remove(row: any) {
    if (!window.confirm(`Скрыть карточку «${row.inventory_no} · ${row.name}»?`)) return;
    try {
      await (window as any).api.deleteAsset(row.id);
      if (detail?.id === row.id) setDetail(null);
      await load();
      onChanged();
    } catch (e: any) {
      onNotice(e?.message || 'Не удалось удалить');
    }
  }

  async function doMove(event: React.FormEvent) {
    event.preventDefault();
    if (!detail?.id) return;
    try {
      const full = await (window as any).api.moveAsset(detail.id, {
        kind: moveKind,
        location_id: moveLoc || null,
        employee_id: moveEmp || null,
        note: moveNote,
      });
      setDetail(full);
      await load();
      onChanged();
      onNotice('Движение ОС записано');
      setMoveNote('');
    } catch (e: any) {
      onNotice(e?.message || 'Ошибка движения');
    }
  }

  async function saveMaint(event: React.FormEvent) {
    event.preventDefault();
    if (!detail?.id) return;
    try {
      const full = await (window as any).api.saveAssetMaintenance({
        asset_id: detail.id,
        ...maintForm,
        cost: maintForm.cost === '' ? null : Number(maintForm.cost),
      });
      setDetail(full);
      setMaintForm({ kind: 'service', planned_at: '', done_at: '', status: 'planned', cost: '', vendor: '', note: '' });
      await load();
      onChanged();
      onNotice('ТО / ремонт сохранён');
    } catch (e: any) {
      onNotice(e?.message || 'Ошибка ТО');
    }
  }

  async function removeMaint(id: number) {
    if (!window.confirm('Удалить запись ТО?')) return;
    try {
      const full = await (window as any).api.deleteAssetMaintenance(id);
      setDetail(full);
      await load();
      onChanged();
    } catch (e: any) {
      onNotice(e?.message || 'Не удалось удалить');
    }
  }

  const statusLabel = (id: string) => meta.statuses.find((s) => s.id === id)?.label || id;

  return (
    <>
      <div className="page-header">
        <div>
          <div className="section-label">Учёт</div>
          <h1>Оборудование / ОС</h1>
          <p>Отдельный контур основных средств — не складская номенклатура. Инв. номера, выдача, ремонт, ТО.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={openNew}>Новая карточка</button>
      </div>

      {summary && (
        <section className="table-wrap" style={{ marginBottom: 16 }}>
          <div style={{ padding: '14px 20px', display: 'flex', gap: 20, flexWrap: 'wrap', fontSize: 13 }}>
            <span>Всего: <strong>{summary.total}</strong></span>
            {(meta.statuses.length ? meta.statuses : Object.keys(summary.byStatus || {}).map((id) => ({ id, label: id }))).map((s) => (
              <span key={s.id}>{s.label}: <strong>{summary.byStatus?.[s.id] || 0}</strong></span>
            ))}
            <span>ТО ≤ 14 дн.: <strong>{summary.maintDue || 0}</strong></span>
          </div>
        </section>
      )}

      <section className="table-wrap">
        <div className="table-header">
          <h2>Справочник ОС</h2>
          <span className="table-caption">{rows.length}</span>
        </div>
        <div style={{ padding: '12px 20px 0', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            placeholder="Поиск: инв. №, название, S/N, модель…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ maxWidth: 360 }}
          />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ maxWidth: 220 }}>
            <option value="">Все статусы</option>
            {meta.statuses.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
            Показать скрытые
          </label>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Инв. №</th>
                <th>Наименование</th>
                <th>Статус</th>
                <th>Место</th>
                <th>МОЛ / сотрудник</th>
                <th>S/N</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={7} className="muted">Карточек ОС пока нет — добавьте первую.</td></tr>
              ) : rows.map((row) => (
                <tr key={row.id} className={row.is_active ? '' : 'is-muted'}>
                  <td>
                    <button type="button" className="linkish" onClick={() => void openDetail(row)}>{row.inventory_no}</button>
                  </td>
                  <td>
                    <button type="button" className="linkish" onClick={() => void openDetail(row)}>{row.name}</button>
                    {row.category ? <div className="muted" style={{ fontSize: 12 }}>{row.category}</div> : null}
                  </td>
                  <td>{row.status_label || statusLabel(row.status)}</td>
                  <td>{row.location_name || '—'}</td>
                  <td>{row.employee_name || row.responsible_name || '—'}</td>
                  <td>{row.serial_no || '—'}</td>
                  <td>
                    <button type="button" className="btn btn-secondary" onClick={() => void openDetail(row)}>Карточка</button>{' '}
                    <button type="button" className="btn btn-secondary" onClick={() => openEdit(row)}>Изменить</button>{' '}
                    <button type="button" className="btn btn-secondary" onClick={() => void remove(row)}>Скрыть</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {editing && (
        <FloatingWidget title={editing.id ? 'Карточка ОС' : 'Новая ОС'} open onClose={() => setEditing(null)} width={720}>
          <form className="form-grid" onSubmit={save} style={{ padding: '4px 4px 12px' }}>
            {error && <div className="form-error span-2">{error}</div>}
            <label>Инв. №<input value={form.inventory_no} onChange={(e) => setForm({ ...form, inventory_no: e.target.value })} placeholder="авто, если пусто" /></label>
            <label>Наименование<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
            <label>Категория<input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="ПК, станок…" /></label>
            <label>Статус
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {meta.statuses.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </label>
            <label>Серийный №<input value={form.serial_no} onChange={(e) => setForm({ ...form, serial_no: e.target.value })} /></label>
            <label>Штрихкод<input value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} /></label>
            <label>Производитель<input value={form.manufacturer} onChange={(e) => setForm({ ...form, manufacturer: e.target.value })} /></label>
            <label>Модель<input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} /></label>
            <label>Место хранения
              <select value={form.location_id} onChange={(e) => setForm({ ...form, location_id: e.target.value })}>
                <option value="">—</option>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </label>
            <label>Сотрудник (МОЛ)
              <select value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: e.target.value })}>
                <option value="">—</option>
                {employees.map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}
              </select>
            </label>
            <label>Ответственный (текст)<input value={form.responsible_name} onChange={(e) => setForm({ ...form, responsible_name: e.target.value })} /></label>
            <label>Стоимость<input type="number" step="0.01" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} /></label>
            <label>Дата покупки<input type="date" value={form.purchase_date} onChange={(e) => setForm({ ...form, purchase_date: e.target.value })} /></label>
            <label>Гарантия до<input type="date" value={form.warranty_until} onChange={(e) => setForm({ ...form, warranty_until: e.target.value })} /></label>
            <label className="span-2">Заметки<textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} /></label>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
              Активна
            </label>
            <div className="modal-actions span-2">
              <button type="button" className="btn btn-secondary" onClick={() => setEditing(null)}>Отмена</button>
              <button type="submit" className="btn btn-primary">Сохранить</button>
            </div>
          </form>
        </FloatingWidget>
      )}

      {detail && (
        <FloatingWidget
          title={`${detail.inventory_no} · ${detail.name}`}
          open
          onClose={() => setDetail(null)}
          width={820}
        >
          <div style={{ padding: '4px 8px 16px', display: 'grid', gap: 16 }}>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13 }}>
              <span>Статус: <strong>{detail.status_label || statusLabel(detail.status)}</strong></span>
              <span>Место: <strong>{detail.location_name || '—'}</strong></span>
              <span>МОЛ: <strong>{detail.employee_name || detail.responsible_name || '—'}</strong></span>
              <span>S/N: <strong>{detail.serial_no || '—'}</strong></span>
              <button type="button" className="btn btn-secondary" onClick={() => { setDetail(null); openEdit(detail); }}>Изменить карточку</button>
            </div>

            <form className="form-grid" onSubmit={doMove}>
              <h3 className="span-2" style={{ margin: 0, fontSize: 15 }}>Движение</h3>
              <label>Тип
                <select value={moveKind} onChange={(e) => setMoveKind(e.target.value)}>
                  {meta.moveKinds.filter((k) => k.id !== 'register' && k.id !== 'note').map((k) => (
                    <option key={k.id} value={k.id}>{k.label}</option>
                  ))}
                </select>
              </label>
              <label>Место
                <select value={moveLoc} onChange={(e) => setMoveLoc(e.target.value)}>
                  <option value="">—</option>
                  {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </label>
              <label>Сотрудник
                <select value={moveEmp} onChange={(e) => setMoveEmp(e.target.value)}>
                  <option value="">—</option>
                  {employees.map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}
                </select>
              </label>
              <label>Комментарий<input value={moveNote} onChange={(e) => setMoveNote(e.target.value)} /></label>
              <div className="modal-actions span-2">
                <button type="submit" className="btn btn-primary">Записать движение</button>
              </div>
            </form>

            <form className="form-grid" onSubmit={saveMaint}>
              <h3 className="span-2" style={{ margin: 0, fontSize: 15 }}>ТО / ремонт</h3>
              <label>Вид<input value={maintForm.kind} onChange={(e) => setMaintForm({ ...maintForm, kind: e.target.value })} /></label>
              <label>Статус
                <select value={maintForm.status} onChange={(e) => setMaintForm({ ...maintForm, status: e.target.value })}>
                  <option value="planned">План</option>
                  <option value="done">Выполнено</option>
                  <option value="cancelled">Отменено</option>
                </select>
              </label>
              <label>План<input type="date" value={maintForm.planned_at} onChange={(e) => setMaintForm({ ...maintForm, planned_at: e.target.value })} /></label>
              <label>Факт<input type="date" value={maintForm.done_at} onChange={(e) => setMaintForm({ ...maintForm, done_at: e.target.value })} /></label>
              <label>Подрядчик<input value={maintForm.vendor} onChange={(e) => setMaintForm({ ...maintForm, vendor: e.target.value })} /></label>
              <label>Стоимость<input type="number" step="0.01" value={maintForm.cost} onChange={(e) => setMaintForm({ ...maintForm, cost: e.target.value })} /></label>
              <label className="span-2">Заметка<input value={maintForm.note} onChange={(e) => setMaintForm({ ...maintForm, note: e.target.value })} /></label>
              <div className="modal-actions span-2">
                <button type="submit" className="btn btn-primary">Добавить ТО</button>
              </div>
            </form>

            <div>
              <h3 style={{ margin: '0 0 8px', fontSize: 15 }}>История движений</h3>
              <div className="table-scroll" style={{ maxHeight: 180 }}>
                <table>
                  <thead>
                    <tr><th>Когда</th><th>Тип</th><th>Куда</th><th>Кто</th><th>Комментарий</th></tr>
                  </thead>
                  <tbody>
                    {(detail.movements || []).length === 0 ? (
                      <tr><td colSpan={5} className="muted">Пока нет</td></tr>
                    ) : detail.movements.map((m: any) => (
                      <tr key={m.id}>
                        <td>{String(m.created_at || '').replace('T', ' ').slice(0, 16)}</td>
                        <td>{m.kind_label || m.kind}</td>
                        <td>{m.to_location_name || '—'}</td>
                        <td>{m.actor_name || '—'}</td>
                        <td>{m.note || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <h3 style={{ margin: '0 0 8px', fontSize: 15 }}>Журнал ТО</h3>
              <div className="table-scroll" style={{ maxHeight: 160 }}>
                <table>
                  <thead>
                    <tr><th>Вид</th><th>Статус</th><th>План</th><th>Факт</th><th>Подрядчик</th><th></th></tr>
                  </thead>
                  <tbody>
                    {(detail.maintenance || []).length === 0 ? (
                      <tr><td colSpan={6} className="muted">Пока нет</td></tr>
                    ) : detail.maintenance.map((m: any) => (
                      <tr key={m.id}>
                        <td>{m.kind}</td>
                        <td>{m.status}</td>
                        <td>{m.planned_at || '—'}</td>
                        <td>{m.done_at || '—'}</td>
                        <td>{m.vendor || '—'}</td>
                        <td>
                          <button type="button" className="btn btn-secondary" onClick={() => void removeMaint(m.id)}>Удалить</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </FloatingWidget>
      )}
    </>
  );
}
