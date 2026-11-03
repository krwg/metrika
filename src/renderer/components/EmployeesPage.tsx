import { useEffect, useState } from 'react';
import FloatingWidget from './FloatingWidget';
import EntityCustomFields, { customValuesFromFields } from './EntityCustomFields';

type Props = {
  refreshToken: number;
  onNotice: (msg: string) => void;
  onChanged: () => void;
  session: any;
};

const empty = {
  last_name: '', first_name: '', middle_name: '', position: '', department: '',
  phone: '', email: '', hire_date: '', fire_date: '', tab_no: '', notes: '',
  registry_user_id: '' as string | number, is_active: true,
  custom_values: {} as Record<string, string>,
};

export default function EmployeesPage({ refreshToken, onNotice, onChanged, session }: Props) {
  const [rows, setRows] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState({ ...empty });
  const [error, setError] = useState('');
  const [showInactive, setShowInactive] = useState(false);

  async function load() {
    try {
      const list = await (window as any).api.listEmployees({ q: search, activeOnly: !showInactive });
      setRows(list || []);
    } catch (e: any) {
      onNotice(e?.message || 'Не удалось загрузить сотрудников');
    }
  }

  useEffect(() => { void load(); }, [refreshToken, showInactive]);
  useEffect(() => {
    const t = window.setTimeout(() => { void load(); }, 200);
    return () => window.clearTimeout(t);
  }, [search]);

  useEffect(() => {
    const orgId = session?.organization?.id;
    if (!orgId) return;
    (window as any).api.listUsers(orgId).then((list: any[]) => setUsers(list || [])).catch(() => setUsers([]));
  }, [session?.organization?.id, refreshToken]);

  function open(row?: any) {
    setEditing(row || {});
    setForm(row ? {
      last_name: row.last_name || '',
      first_name: row.first_name || '',
      middle_name: row.middle_name || '',
      position: row.position || '',
      department: row.department || '',
      phone: row.phone || '',
      email: row.email || '',
      hire_date: row.hire_date || '',
      fire_date: row.fire_date || '',
      tab_no: row.tab_no || '',
      notes: row.notes || '',
      registry_user_id: row.registry_user_id || '',
      is_active: row.is_active !== 0,
      custom_values: customValuesFromFields(row.custom_values || []),
    } : { ...empty });
    setError('');
    if (row?.id) {
      (window as any).api.getEmployee?.(row.id).then((full: any) => {
        if (!full) return;
        setForm((prev) => ({
          ...prev,
          ...full,
          is_active: full.is_active !== 0,
          custom_values: customValuesFromFields(full.custom_values || []),
        }));
      }).catch(() => {  });
    }
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    try {
      await (window as any).api.saveEmployee({
        id: editing?.id,
        ...form,
        registry_user_id: form.registry_user_id || null,
        is_active: form.is_active ? 1 : 0,
        custom_values: form.custom_values || {},
      });
      setEditing(null);
      await load();
      onChanged();
      onNotice('Сотрудник сохранён');
    } catch (e: any) {
      setError(e?.message || 'Ошибка сохранения');
    }
  }

  async function remove(row: any) {
    if (!window.confirm(`Удалить карточку «${row.full_name}»?`)) return;
    try {
      await (window as any).api.deleteEmployee(row.id);
      await load();
      onChanged();
    } catch (e: any) {
      onNotice(e?.message || 'Не удалось удалить');
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <div className="section-label">Организация</div>
          <h1>Сотрудники</h1>
          <p>Карточки персонала организации — не учётные записи Метрики. Привязку к профилю можно указать для ЭДО.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => open()}>Новый сотрудник</button>
      </div>

      <section className="table-wrap">
        <div className="table-header">
          <h2>Справочник</h2>
          <span className="table-caption">{rows.length}</span>
        </div>
        <div style={{ padding: '12px 20px 0', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <input placeholder="Поиск по ФИО, должности, отделу…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ maxWidth: 360 }} />
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
            Показать неактивных
          </label>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>ФИО</th><th>Должность</th><th>Отдел</th><th>Таб. №</th><th>Телефон</th><th>Профиль Метрики</th><th></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={7} className="muted">Сотрудников пока нет — добавьте первую карточку.</td></tr>
              ) : rows.map((row) => {
                const linked = users.find((u) => Number(u.id) === Number(row.registry_user_id));
                return (
                  <tr key={row.id} className={row.is_active ? '' : 'is-muted'}>
                    <td>
                      <button type="button" className="linkish" onClick={() => open(row)}>{row.full_name}</button>
                    </td>
                    <td>{row.position || '—'}</td>
                    <td>{row.department || '—'}</td>
                    <td>{row.tab_no || '—'}</td>
                    <td>{row.phone || '—'}</td>
                    <td>{linked ? (linked.login || linked.display_name) : '—'}</td>
                    <td>
                      <button type="button" className="btn btn-secondary" onClick={() => open(row)}>Изменить</button>{' '}
                      <button type="button" className="btn btn-secondary" onClick={() => void remove(row)}>Удалить</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {editing && (
        <FloatingWidget title={editing.id ? 'Карточка сотрудника' : 'Новый сотрудник'} open onClose={() => setEditing(null)} width={640}>
          <form className="form-grid" onSubmit={save} style={{ padding: '4px 4px 12px' }}>
            {error && <div className="form-error span-2">{error}</div>}
            <label>Фамилия<input value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} required /></label>
            <label>Имя<input value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} required /></label>
            <label>Отчество<input value={form.middle_name} onChange={(e) => setForm({ ...form, middle_name: e.target.value })} /></label>
            <label>Табельный №<input value={form.tab_no} onChange={(e) => setForm({ ...form, tab_no: e.target.value })} /></label>
            <label>Должность<input value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} /></label>
            <label>Отдел<input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} /></label>
            <label>Телефон<input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
            <label>E-mail<input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
            <label>Дата приёма<input type="date" value={form.hire_date} onChange={(e) => setForm({ ...form, hire_date: e.target.value })} /></label>
            <label>Дата увольнения<input type="date" value={form.fire_date} onChange={(e) => setForm({ ...form, fire_date: e.target.value })} /></label>
            <label className="span-2">Профиль Метрики (для ЭДО)
              <select value={form.registry_user_id} onChange={(e) => setForm({ ...form, registry_user_id: e.target.value })}>
                <option value="">— без учётной записи —</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {[u.last_name, u.first_name || u.display_name].filter(Boolean).join(' ') || u.login} ({u.login})
                  </option>
                ))}
              </select>
            </label>
            <label className="span-2">Заметки<textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} /></label>
            <div className="span-2">
              <EntityCustomFields
                entity="employee"
                values={form.custom_values || {}}
                onChange={(custom_values) => setForm({ ...form, custom_values })}
              />
            </div>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
              Активен
            </label>
            <div className="modal-actions span-2">
              <button type="button" className="btn btn-secondary" onClick={() => setEditing(null)}>Отмена</button>
              <button type="submit" className="btn btn-primary">Сохранить</button>
            </div>
          </form>
        </FloatingWidget>
      )}
    </>
  );
}
