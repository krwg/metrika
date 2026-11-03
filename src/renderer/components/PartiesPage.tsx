import { useEffect, useState } from 'react';
import FloatingWidget from './FloatingWidget';

type Props = {
  refreshToken: number;
  onNotice: (msg: string) => void;
  onChanged: () => void;
  session: any;
};

const empty = {
  kind: 'person' as 'person' | 'org',
  display_name: '',
  last_name: '', first_name: '', middle_name: '',
  inn: '', kpp: '', phone: '', email: '', address: '', contact_person: '',
  position: '', department: '', notes: '',
  is_customer: false, is_supplier: false, is_partner: false, is_employee: false, is_user: false,
  registry_user_id: '' as string | number,
  is_active: true,
};

export default function PartiesPage({ refreshToken, onNotice, onChanged, session }: Props) {
  const [rows, setRows] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState({ ...empty });
  const [error, setError] = useState('');

  async function load() {
    try {
      const list = await (window as any).api.listParties({ q: search, role: role || undefined, activeOnly: true });
      setRows(list || []);
    } catch (e: any) {
      onNotice(e?.message || 'Не удалось загрузить справочник лиц');
    }
  }

  useEffect(() => { void load(); }, [refreshToken, role]);
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
      kind: row.kind === 'org' ? 'org' : 'person',
      display_name: row.display_name || '',
      last_name: row.last_name || '',
      first_name: row.first_name || '',
      middle_name: row.middle_name || '',
      inn: row.inn || '',
      kpp: row.kpp || '',
      phone: row.phone || '',
      email: row.email || '',
      address: row.address || '',
      contact_person: row.contact_person || '',
      position: row.position || '',
      department: row.department || '',
      notes: row.notes || '',
      is_customer: !!row.is_customer,
      is_supplier: !!row.is_supplier,
      is_partner: !!row.is_partner,
      is_employee: !!row.is_employee,
      is_user: !!row.is_user,
      registry_user_id: row.registry_user_id || '',
      is_active: row.is_active !== 0,
    } : { ...empty });
    setError('');
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    try {
      await (window as any).api.saveParty({
        id: editing?.id,
        ...form,
        registry_user_id: form.registry_user_id || null,
        is_active: form.is_active ? 1 : 0,
      });
      setEditing(null);
      await load();
      onChanged();
      onNotice('Карточка сохранена — связанные справочники обновлены');
    } catch (e: any) {
      setError(e?.message || 'Ошибка сохранения');
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <div className="section-label">Организация · CRM</div>
          <h1>Единый справочник лиц</h1>
          <p>
            Одна карточка вместо дублей: контрагент, поставщик, сотрудник и пользователь Метрики.
            Роли включаются флажками — данные синхронизируются в связанные справочники.
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => open()}>Новая карточка</button>
      </div>

      <section className="table-wrap">
        <div className="table-header">
          <h2>Лица и организации</h2>
          <span className="table-caption">{rows.length}</span>
        </div>
        <div style={{ padding: '12px 20px 0', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <input placeholder="Поиск по ФИО, ИНН, телефону…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ maxWidth: 320 }} />
          <select value={role} onChange={(e) => setRole(e.target.value)} aria-label="Роль">
            <option value="">Все роли</option>
            <option value="customer">Покупатель</option>
            <option value="supplier">Поставщик</option>
            <option value="partner">Партнёр</option>
            <option value="employee">Сотрудник</option>
            <option value="user">Пользователь</option>
          </select>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Наименование</th><th>Тип</th><th>Роли</th><th>ИНН</th><th>Телефон</th><th></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={6} className="muted">Пока пусто — создайте карточку или дождитесь импорта из старых справочников.</td></tr>
              ) : rows.map((row) => (
                <tr key={row.id}>
                  <td><button type="button" className="linkish" onClick={() => open(row)}>{row.display_name}</button></td>
                  <td>{row.kind === 'org' ? 'Организация' : 'Физлицо'}</td>
                  <td>{(row.roles || []).join(', ') || '—'}</td>
                  <td>{row.inn || '—'}</td>
                  <td>{row.phone || '—'}</td>
                  <td>
                    <button type="button" className="btn btn-secondary" onClick={() => open(row)}>Изменить</button>{' '}
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => {
                        if (!window.confirm(`Скрыть «${row.display_name}»?`)) return;
                        void (window as any).api.deleteParty(row.id).then(load).then(onChanged);
                      }}
                    >
                      Скрыть
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {editing && (
        <FloatingWidget title={editing.id ? 'Карточка лица' : 'Новая карточка'} open onClose={() => setEditing(null)} width={720}>
          <form className="form-grid" onSubmit={save} style={{ padding: '4px 4px 12px' }}>
            {error && <div className="form-error span-2">{error}</div>}
            <label>Тип
              <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as any })}>
                <option value="person">Физлицо</option>
                <option value="org">Организация</option>
              </select>
            </label>
            <label>Отображаемое имя<input value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} placeholder="ФИО или название" /></label>
            {form.kind === 'person' && (
              <>
                <label>Фамилия<input value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} /></label>
                <label>Имя<input value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} /></label>
                <label className="span-2">Отчество<input value={form.middle_name} onChange={(e) => setForm({ ...form, middle_name: e.target.value })} /></label>
              </>
            )}
            <label>ИНН<input value={form.inn} onChange={(e) => setForm({ ...form, inn: e.target.value })} /></label>
            <label>КПП<input value={form.kpp} onChange={(e) => setForm({ ...form, kpp: e.target.value })} /></label>
            <label>Телефон<input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
            <label>E-mail<input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
            <label className="span-2">Адрес<input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></label>
            <label>Должность<input value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} /></label>
            <label>Отдел<input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} /></label>
            <label className="span-2">Контактное лицо (для орг.)<input value={form.contact_person} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} /></label>
            <fieldset className="span-2" style={{ border: '1px solid var(--border)', padding: 12, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 8 }}>
              <legend>Роли в системе</legend>
              <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={form.is_customer} onChange={(e) => setForm({ ...form, is_customer: e.target.checked })} /> Покупатель</label>
              <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={form.is_supplier} onChange={(e) => setForm({ ...form, is_supplier: e.target.checked })} /> Поставщик</label>
              <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={form.is_partner} onChange={(e) => setForm({ ...form, is_partner: e.target.checked })} /> Партнёр</label>
              <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={form.is_employee} onChange={(e) => setForm({ ...form, is_employee: e.target.checked })} /> Сотрудник</label>
              <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={form.is_user} onChange={(e) => setForm({ ...form, is_user: e.target.checked })} /> Пользователь Метрики</label>
            </fieldset>
            <label className="span-2">Учётная запись Метрики
              <select value={form.registry_user_id} onChange={(e) => setForm({ ...form, registry_user_id: e.target.value, is_user: Boolean(e.target.value) || form.is_user })}>
                <option value="">— без привязки —</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {[u.last_name, u.first_name || u.display_name].filter(Boolean).join(' ') || u.login} ({u.login})
                  </option>
                ))}
              </select>
            </label>
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
    </>
  );
}
