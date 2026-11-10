import { useEffect, useMemo, useState } from 'react';

type Org = any;
type User = any;

type Props = {
  onOpened: (session: any, opts?: { startPage?: string; openedConfigurator?: boolean; settingsSection?: string }) => void;
};

const emptyOrgForm = {
  name: '',
  code: '',
  legal_name: '',
  address: '',
  legal_address: '',
  email: '',
  phone: '',
  inn: '',
  kpp: '',
  bank_details: '',
  note: '',
  admin_display_name: '',
  admin_login: '',
  admin_password: '',
};

type Stage = 'orgs' | 'users' | 'create' | 'edit';

export default function LauncherPage({ onOpened }: Props) {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [orgId, setOrgId] = useState<number | null>(null);
  const [userId, setUserId] = useState<number | null>(null);
  const [password, setPassword] = useState('');
  const [stage, setStage] = useState<Stage>('orgs');
  const [form, setForm] = useState({ ...emptyOrgForm });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [enterMode, setEnterMode] = useState<'workspace' | 'config' | 'miapi'>('workspace');

  async function load() {
    const list = (await (window as any).api.listOrganizations()) || [];
    setOrgs(list);
    if (orgId && !list.some((o: Org) => o.id === orgId)) {
      setOrgId(null);
    }
  }

  useEffect(() => { void load(); }, []);

  useEffect(() => {
    if (!orgId || stage !== 'users') {
      setUsers([]);
      setUserId(null);
      return;
    }
    (window as any).api.listUsers(orgId).then((list: User[]) => {
      setUsers(list || []);
      setUserId((list || [])[0]?.id || null);
      setPassword('');
    });
  }, [orgId, stage]);

  const selectedOrg = useMemo(() => orgs.find((o) => o.id === orgId) || null, [orgs, orgId]);
  const selectedUser = useMemo(() => users.find((u) => u.id === userId) || null, [users, userId]);

  function openCreate() {
    setForm({ ...emptyOrgForm });
    setStage('create');
    setError('');
  }

  function openEdit() {
    if (!selectedOrg) return;
    setForm({
      ...emptyOrgForm,
      name: selectedOrg.name || '',
      code: selectedOrg.code || '',
      legal_name: selectedOrg.legal_name || '',
      address: selectedOrg.address || '',
      legal_address: selectedOrg.legal_address || '',
      email: selectedOrg.email || '',
      phone: selectedOrg.phone || '',
      inn: selectedOrg.inn || '',
      kpp: selectedOrg.kpp || '',
      bank_details: selectedOrg.bank_details || '',
      note: selectedOrg.note || '',
    });
    setStage('edit');
    setError('');
  }

  async function saveOrg(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (stage === 'create') {
        const created = await (window as any).api.createOrganization(form);
        await load();
        setOrgId(created.id);
        setStage('orgs');
      } else if (stage === 'edit' && orgId) {
        await (window as any).api.updateOrganization(orgId, form);
        await load();
        setStage('orgs');
      }
    } catch (e: any) {
      setError(e?.message || 'Не удалось сохранить организацию');
    } finally {
      setBusy(false);
    }
  }

  async function removeOrg() {
    if (!orgId || !selectedOrg) return;
    if (!window.confirm(`Удалить организацию «${selectedOrg.name}»?\nБаза будет сохранена как архив на диске.`)) return;
    setBusy(true);
    try {
      await (window as any).api.deleteOrganization(orgId);
      setOrgId(null);
      await load();
      setStage('orgs');
    } catch (e: any) {
      setError(e?.message || 'Не удалось удалить');
    } finally {
      setBusy(false);
    }
  }

  function goToUsers(mode: 'workspace' | 'config' | 'miapi' = 'workspace') {
    if (!orgId) { setError('Выберите организацию'); return; }
    setEnterMode(mode);
    setError('');
    setStage('users');
  }

  function openConfigurator() {
    if (!orgId) { setError('Выберите организацию для редактора'); return; }
    goToUsers('config');
  }

  function openMiapi() {
    if (!orgId) { setError('Выберите организацию для MIAPI'); return; }
    goToUsers('miapi');
  }

  function backToOrgs() {
    setError('');
    setPassword('');
    setEnterMode('workspace');
    setStage('orgs');
  }

  async function enter() {
    if (!orgId || !userId) { setError('Выберите пользователя'); return; }
    setBusy(true);
    setError('');
    try {
      const session = await (window as any).api.openSession(orgId, userId, password);
      if (enterMode === 'config') {
        if (session?.user?.role !== 'admin') {
          try { await (window as any).api.closeSession?.(); } catch {  }
          throw new Error('Редактор конфигурации доступен только администратору');
        }
        await (window as any).api.openConfigurator();
        onOpened(session, { startPage: 'dashboard', openedConfigurator: true });
        return;
      }
      if (enterMode === 'miapi') {
        if (session?.user?.role !== 'admin') {
          try { await (window as any).api.closeSession?.(); } catch {  }
          throw new Error('MIAPI доступен только администратору');
        }
        try { sessionStorage.setItem('metrika.settings.section', 'integrations'); } catch {  }
        onOpened(session, { startPage: 'settings', settingsSection: 'integrations' });
        return;
      }
      onOpened(session);
    } catch (e: any) {
      setError(e?.message || 'Не удалось открыть организацию');
    } finally {
      setBusy(false);
    }
  }

  if (stage === 'create' || stage === 'edit') {
    return (
      <div className="launcher-shell">
        <form className="launcher-1c launcher-1c-form" onSubmit={saveOrg}>
          <div className="launcher-1c-title">{stage === 'create' ? 'Новая организация' : 'Реквизиты организации'}</div>
          <p className="launcher-hint">Адреса, почта и реквизиты. Для каждой организации — своя база.</p>
          {error && <div className="form-error">{error}</div>}
          <div className="form-grid">
            <label>Название *<input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
            <label>Код<input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="HOME" /></label>
            <label className="field-wide">Юридическое название<input value={form.legal_name} onChange={(e) => setForm({ ...form, legal_name: e.target.value })} /></label>
            <label className="field-wide">Фактический адрес<input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></label>
            <label className="field-wide">Юридический адрес<input value={form.legal_address} onChange={(e) => setForm({ ...form, legal_address: e.target.value })} /></label>
            <label>Email<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
            <label>Телефон<input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
            <label>ИНН<input value={form.inn} onChange={(e) => setForm({ ...form, inn: e.target.value })} /></label>
            <label>КПП<input value={form.kpp} onChange={(e) => setForm({ ...form, kpp: e.target.value })} /></label>
            <label className="field-wide">Банковские реквизиты<textarea value={form.bank_details} onChange={(e) => setForm({ ...form, bank_details: e.target.value })} /></label>
            <label className="field-wide">Заметка<textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></label>
          </div>
          {stage === 'create' && (
            <>
              <div className="launcher-1c-title" style={{ marginTop: 18, fontSize: 15 }}>Первый администратор</div>
              <p className="launcher-hint">Организация создаётся пустой — задайте своего администратора. Готовых логинов и паролей нет.</p>
              <div className="form-grid">
                <label>Имя *<input required value={form.admin_display_name} onChange={(e) => setForm({ ...form, admin_display_name: e.target.value })} placeholder="Как отображать в списке" /></label>
                <label>Логин *<input required value={form.admin_login} onChange={(e) => setForm({ ...form, admin_login: e.target.value })} placeholder="например, admin" autoComplete="username" /></label>
                <label className="field-wide">Пароль *<input required type="password" minLength={4} value={form.admin_password} onChange={(e) => setForm({ ...form, admin_password: e.target.value })} placeholder="не короче 4 символов" autoComplete="new-password" /></label>
              </div>
            </>
          )}
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setStage('orgs')}>Назад</button>
            <button type="submit" className="btn btn-primary" disabled={busy}>{stage === 'create' ? 'Создать' : 'Сохранить'}</button>
          </div>
        </form>
      </div>
    );
  }

  if (stage === 'users') {
    return (
      <div className="launcher-shell">
        <div className="launcher-1c">
          <div className="launcher-1c-brand">
            <div className="logo-mark">М</div>
            <div>
              <div className="logo-text">Metrika Home</div>
              <div className="subtext">{selectedOrg?.name || 'Организация'}</div>
            </div>
          </div>
          <div className="launcher-1c-title">
            {enterMode === 'config' ? 'Редактор конфигурации'
              : enterMode === 'miapi' ? 'MIAPI — интеграции'
                : 'Вход в организацию'}
          </div>
          <p className="launcher-hint">
            {enterMode === 'config' || enterMode === 'miapi'
              ? `Войдите как администратор организации «${selectedOrg?.name}»`
              : `Выберите пользователя организации «${selectedOrg?.name}»`}
          </p>
          {error && <div className="form-error">{error}</div>}

          <div className="launcher-1c-body">
            <div className="launcher-1c-list-col">
              <div className="launcher-1c-label">Пользователи</div>
              <div className="launcher-1c-list launcher-1c-list-users-tall" role="listbox">
                {users.map((user) => (
                  <button
                    key={user.id}
                    type="button"
                    role="option"
                    aria-selected={user.id === userId}
                    className={`launcher-1c-item ${user.id === userId ? 'selected' : ''}`}
                    onClick={() => setUserId(user.id)}
                    onDoubleClick={() => void enter()}
                  >
                    {user.display_name}
                    <span>{user.role === 'admin' ? 'Админ' : user.role === 'operator' ? 'Оператор' : 'Пользователь'}{user.has_password ? ' · ●' : ''}</span>
                  </button>
                ))}
                {users.length === 0 && <div className="launcher-1c-empty">Нет пользователей</div>}
              </div>
              <label className="launcher-1c-password">
                Пароль{selectedUser?.has_password ? '' : ' (не задан)'}
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') void enter(); }}
                  autoComplete="current-password"
                  autoFocus
                  placeholder={selectedUser?.has_password ? '' : 'необязательно'}
                />
              </label>
            </div>

            <div className="launcher-1c-actions">
              <button type="button" className="btn btn-primary launcher-1c-main" disabled={!userId || busy} onClick={enter}>
                {busy ? 'Открытие…' : (enterMode === 'config' ? 'Открыть редактор' : 'Войти')}
              </button>
              <div className="launcher-1c-sep" />
              <button type="button" className="btn btn-secondary" onClick={backToOrgs}>← Организации</button>
            </div>
          </div>

          {selectedOrg && (
            <div className="launcher-1c-meta">
              {[selectedOrg.legal_name || selectedOrg.name, selectedOrg.address || selectedOrg.legal_address, selectedOrg.email, selectedOrg.phone]
                .filter(Boolean)
                .join(' · ') || 'Реквизиты не заполнены'}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="launcher-shell">
      <div className="launcher-1c">
        <div className="launcher-1c-brand">
          <div className="logo-mark">М</div>
          <div>
            <div className="logo-text">Metrika Home</div>
            <div className="subtext">Metrika Home [0.5]</div>
          </div>
        </div>
        <div className="launcher-1c-title">Организации</div>
        <p className="launcher-hint">Сначала выберите организацию, затем войдите под пользователем</p>
        {error && <div className="form-error">{error}</div>}

        <div className="launcher-1c-body">
          <div className="launcher-1c-list-col">
            <div className="launcher-1c-label">Организации</div>
            <div className="launcher-1c-list launcher-1c-list-orgs-tall" role="listbox">
              {orgs.map((org) => (
                <button
                  key={org.id}
                  type="button"
                  role="option"
                  aria-selected={org.id === orgId}
                  className={`launcher-1c-item ${org.id === orgId ? 'selected' : ''}`}
                  onClick={() => { setOrgId(org.id); setError(''); }}
                  onDoubleClick={() => { setOrgId(org.id); goToUsers(); }}
                >
                  {org.name}
                  {org.code ? <span>{org.code}</span> : null}
                </button>
              ))}
              {orgs.length === 0 && <div className="launcher-1c-empty">Нет организаций — нажмите «Добавить…»</div>}
            </div>
          </div>

          <div className="launcher-1c-actions">
            <button type="button" className="btn btn-primary launcher-1c-main" disabled={!orgId || busy} onClick={() => goToUsers('workspace')}>
              Далее →
            </button>
            <div className="launcher-1c-sep" />
            <button type="button" className="btn btn-secondary" onClick={openCreate}>Добавить…</button>
            <button type="button" className="btn btn-secondary" onClick={openEdit} disabled={!orgId}>Изменить…</button>
            <button type="button" className="btn btn-secondary" onClick={removeOrg} disabled={!orgId || busy}>Удалить</button>
            <div className="launcher-1c-sep" />
            <button type="button" className="btn btn-secondary" onClick={openConfigurator} disabled={!orgId || busy} title="Конфигуратор метаданных и БД">
              Редактор
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={openMiapi}
              disabled={!orgId || busy}
              title="MIAPI — интеграционный REST API и входящие webhooks"
            >
              MIAPI
            </button>
          </div>
        </div>

        {selectedOrg && (
          <div className="launcher-1c-meta">
            {[selectedOrg.legal_name || selectedOrg.name, selectedOrg.address || selectedOrg.legal_address, selectedOrg.email, selectedOrg.phone]
              .filter(Boolean)
              .join(' · ') || 'Реквизиты не заполнены'}
          </div>
        )}
      </div>
    </div>
  );
}
