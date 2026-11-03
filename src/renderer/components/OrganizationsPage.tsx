import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '../i18n';
import { PERM_LABELS_RU, type PermKey } from '../permissions';
import FloatingWidget from './FloatingWidget';

type Props = {
  refreshToken: number;
  onNotice: (message: string) => void;
  onChanged: () => void;
};

const DEFAULT_ADMIN = Object.fromEntries(PERM_LABELS_RU.map((entry) => [entry.key, true]));
const DEFAULT_USER: Record<string, boolean> = {
  items_view: true, items_create: true, items_edit: true, items_delete: false,
  categories_edit: false, units_edit: false, templates_edit: false,
  locations_edit: false, inventory: true,
  post_writeoff: true, post_surplus: true, post_regrade: true, post_disassemble: true, post_assemble: true,
  post_revision: true, post_po_receive: false, post_transfer: true, post_wo: true,
  cancel_stock: true, cancel_po: false,
  projects: true, purchases: false,
  replenishment: false, analytics: true, quality: false, documents: true,
  history_view: true, settings: false, backup: false, console: false,
  users: false, org_edit: false,
};
const DEFAULT_OPERATOR: Record<string, boolean> = {
  items_view: true, items_create: false, items_edit: false, items_delete: false,
  categories_edit: false, units_edit: false, templates_edit: false,
  locations_edit: false, inventory: true,
  post_writeoff: true, post_surplus: true, post_regrade: true, post_disassemble: true, post_assemble: true,
  post_revision: true, post_po_receive: false, post_transfer: true, post_wo: false,
  cancel_stock: true, cancel_po: false,
  projects: false, purchases: false,
  replenishment: false, analytics: false, quality: false, documents: false,
  history_view: true, settings: false, backup: false, console: false,
  users: false, org_edit: false,
};

function defaultsForRole(role: string) {
  if (role === 'admin') return { ...DEFAULT_ADMIN };
  if (role === 'operator') return { ...DEFAULT_OPERATOR };
  return { ...DEFAULT_USER };
}

function roleLabel(role: string, locale: string) {
  if (role === 'admin') return locale === 'ru' ? 'Админ' : 'Admin';
  if (role === 'operator') return locale === 'ru' ? 'Оператор' : 'Operator';
  return locale === 'ru' ? 'Пользователь' : 'User';
}

const emptyOrg = {
  name: '', code: '', legal_name: '', address: '', legal_address: '',
  email: '', phone: '', inn: '', kpp: '', bank_details: '', note: '',
};

export default function OrganizationsPage({ refreshToken, onNotice, onChanged }: Props) {
  const { locale, t } = useI18n();
  const [org, setOrg] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [session, setSession] = useState<any>(null);
  const [orgForm, setOrgForm] = useState({ ...emptyOrg });
  const [userForm, setUserForm] = useState({
    login: '',
    display_name: '',
    last_name: '',
    first_name: '',
    middle_name: '',
    role: 'operator',
    password: '',
  });
  const [editUser, setEditUser] = useState<any | null>(null);
  const [perms, setPerms] = useState<Record<string, boolean>>(DEFAULT_OPERATOR);
  const [userPassword, setUserPassword] = useState('');
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [locationScope, setLocationScope] = useState<number[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [userGroupIds, setUserGroupIds] = useState<number[]>([]);
  const [editGroup, setEditGroup] = useState<any | null>(null);
  const [groupForm, setGroupForm] = useState({ name: '', description: '' });
  const [groupPerms, setGroupPerms] = useState<Record<string, boolean>>({});

  async function load() {
    const nextSession = await (window as any).api.getAuthSession();
    setSession(nextSession);
    const orgId = nextSession?.organization?.id;
    if (!orgId) return;
    const orgs = await (window as any).api.listOrganizations();
    const current = (orgs || []).find((row: any) => row.id === orgId) || nextSession.organization;
    setOrg(current);
    setOrgForm({
      name: current?.name || '',
      code: current?.code || '',
      legal_name: current?.legal_name || '',
      address: current?.address || '',
      legal_address: current?.legal_address || '',
      email: current?.email || '',
      phone: current?.phone || '',
      inn: current?.inn || '',
      kpp: current?.kpp || '',
      bank_details: current?.bank_details || '',
      note: current?.note || '',
    });
    setUsers(await (window as any).api.listUsers(orgId) || []);
    try {
      setGroups((await (window as any).api.listUserGroups?.(orgId)) || []);
    } catch {
      setGroups([]);
    }
  }

  useEffect(() => { void load(); }, [refreshToken]);

  const canManage = Boolean(session?.permissions?.users || session?.user?.role === 'admin');
  const canOrgEdit = Boolean(session?.permissions?.org_edit || session?.user?.role === 'admin');

  async function saveOrg() {
    if (!org?.id) return;
    try {
      await (window as any).api.updateOrganization(org.id, orgForm);
      onNotice(locale === 'ru' ? 'Реквизиты сохранены' : 'Organization saved');
      onChanged();
      await load();
    } catch (error: any) {
      onNotice(error?.message || 'Ошибка сохранения');
    }
  }

  async function createUser() {
    if (!org?.id) return;
    try {
      await (window as any).api.createUser({
        ...userForm,
        organization_id: org.id,
        permissions: defaultsForRole(userForm.role),
        password: userForm.password || undefined,
      });
      setUserForm({
        login: '',
        display_name: '',
        last_name: '',
        first_name: '',
        middle_name: '',
        role: 'operator',
        password: '',
      });
      onNotice(locale === 'ru' ? 'Пользователь создан' : 'User created');
      onChanged();
      await load();
    } catch (error: any) {
      onNotice(error?.message || (locale === 'ru' ? 'Не удалось создать пользователя' : 'Could not create user'));
    }
  }

  async function removeUser(user: any) {
    if (!window.confirm(`Удалить пользователя «${user.display_name}» (${user.login})?`)) return;
    try {
      await (window as any).api.deleteUser(user.id);
      onNotice(locale === 'ru' ? 'Пользователь удалён' : 'User deleted');
      onChanged();
      await load();
    } catch (error: any) {
      onNotice(error?.message || 'Не удалось удалить');
    }
  }

  async function switchUser(userId: number) {
    try {
      const pwd = window.prompt(locale === 'ru' ? 'Пароль (если задан):' : 'Password (if set):') || '';
      await (window as any).api.openSession(org.id, userId, pwd);
      onNotice(locale === 'ru' ? 'Активный пользователь изменён' : 'Active user changed');
      onChanged();
      await load();
    } catch (error: any) {
      onNotice(error?.message || (locale === 'ru' ? 'Не удалось переключить пользователя' : 'Could not switch user'));
    }
  }

  function openEdit(user: any) {
    setEditUser(user);
    setUserPassword('');
    setLocationScope(Array.isArray(user.location_scope) ? user.location_scope.map(Number) : []);
    setUserGroupIds(Array.isArray(user.group_ids) ? user.group_ids.map(Number) : []);
    try {
      setPerms({ ...defaultsForRole(user.role), ...(JSON.parse(user.permissions_json || '{}')) });
    } catch {
      setPerms(defaultsForRole(user.role));
    }
    void (window as any).api.getLocations?.()
      .then((rows: any[]) => {
        const roots = (rows || []).filter((l) => !l.parent_location_id || l.location_type === 'warehouse');
        setWarehouses(roots.length ? roots : (rows || []).slice(0, 40));
      })
      .catch(() => setWarehouses([]));
  }

  function openGroup(group?: any) {
    if (group) {
      setEditGroup(group);
      setGroupForm({ name: group.name || '', description: group.description || '' });
      try {
        setGroupPerms(JSON.parse(group.permissions_json || '{}') || {});
      } catch {
        setGroupPerms({});
      }
    } else {
      setEditGroup({ id: 0 });
      setGroupForm({ name: '', description: '' });
      setGroupPerms({});
    }
  }

  async function saveGroup() {
    if (!org?.id || !editGroup) return;
    try {
      const payload = {
        organization_id: org.id,
        name: groupForm.name,
        description: groupForm.description,
        permissions: groupPerms,
      };
      if (editGroup.id) {
        await (window as any).api.updateUserGroup(editGroup.id, payload);
        onNotice(locale === 'ru' ? 'Группа сохранена' : 'Group saved');
      } else {
        await (window as any).api.createUserGroup(payload);
        onNotice(locale === 'ru' ? 'Группа создана' : 'Group created');
      }
      setEditGroup(null);
      onChanged();
      await load();
    } catch (error: any) {
      onNotice(error?.message || (locale === 'ru' ? 'Не удалось сохранить группу' : 'Could not save group'));
    }
  }

  async function removeGroup(group: any) {
    if (!window.confirm(locale === 'ru'
      ? `Удалить группу «${group.name}»? Участники останутся, но потеряют права группы.`
      : `Delete group «${group.name}»?`)) return;
    try {
      await (window as any).api.deleteUserGroup(group.id);
      onNotice(locale === 'ru' ? 'Группа удалена' : 'Group deleted');
      onChanged();
      await load();
    } catch (error: any) {
      onNotice(error?.message || 'Не удалось удалить группу');
    }
  }

  async function saveUser() {
    if (!editUser) return;
    try {
      const payload: any = {
        display_name: editUser.display_name,
        last_name: editUser.last_name || '',
        first_name: editUser.first_name || '',
        middle_name: editUser.middle_name || '',
        role: editUser.role,
        permissions: editUser.role === 'admin' ? DEFAULT_ADMIN : perms,
        is_active: editUser.is_active,
        location_scope: editUser.role === 'admin' ? null : (locationScope.length ? locationScope : null),
        group_ids: userGroupIds,
      };
      if (userPassword !== '') payload.password = userPassword;
      await (window as any).api.updateUser(editUser.id, payload);
      setEditUser(null);
      onNotice(locale === 'ru' ? 'Пользователь сохранён' : 'User saved');
      onChanged();
      await load();
    } catch (error: any) {
      onNotice(error?.message || (locale === 'ru' ? 'Не удалось сохранить' : 'Save failed'));
    }
  }

  const sessionLabel = useMemo(() => {
    if (!session?.user) return '—';
    return `${session.user.display_name} (${roleLabel(session.user.role, locale)})`;
  }, [session, locale]);

  return (
    <>
      <div className="page-header">
        <div>
          <div className="section-label">{t('organizations')}</div>
          <h1>{locale === 'ru' ? 'Организация' : 'Organization'}</h1>
          <p>{locale === 'ru'
            ? 'Реквизиты текущей организации, пользователи и права. Оператор видит только рабочее место сканера. Смена базы: Файл → Сменить организацию.'
            : 'Current organization details, users and permissions.'}</p>
        </div>
        <div className="order-actions">
          <span className="table-caption">{sessionLabel}</span>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={async () => {
              try {
                const result = await (window as any).api.printDocument('org-card', String(org?.id || '0'));
                if (result?.path) onNotice(locale === 'ru' ? `Карточка сохранена: ${result.path}` : `Saved: ${result.path}`);
              } catch (error: any) {
                onNotice(error?.message || (locale === 'ru' ? 'Не удалось напечатать' : 'Print failed'));
              }
            }}
          >
            {locale === 'ru' ? 'Печать карточки' : 'Print card'}
          </button>
        </div>
      </div>

      <div className="org-layout">
        <section className="card">
          <div className="section-label">{locale === 'ru' ? 'Реквизиты' : 'Details'}</div>
          <div className="form-grid">
            <label>{locale === 'ru' ? 'Название' : 'Name'}
              <input value={orgForm.name} onChange={(e) => setOrgForm({ ...orgForm, name: e.target.value })} disabled={!canOrgEdit} />
            </label>
            <label>{locale === 'ru' ? 'Код' : 'Code'}
              <input value={orgForm.code} onChange={(e) => setOrgForm({ ...orgForm, code: e.target.value })} disabled={!canOrgEdit} />
            </label>
            <label className="field-wide">{locale === 'ru' ? 'Юридическое название' : 'Legal name'}
              <input value={orgForm.legal_name} onChange={(e) => setOrgForm({ ...orgForm, legal_name: e.target.value })} disabled={!canOrgEdit} />
            </label>
            <label className="field-wide">{locale === 'ru' ? 'Фактический адрес' : 'Address'}
              <input value={orgForm.address} onChange={(e) => setOrgForm({ ...orgForm, address: e.target.value })} disabled={!canOrgEdit} />
            </label>
            <label className="field-wide">{locale === 'ru' ? 'Юридический адрес' : 'Legal address'}
              <input value={orgForm.legal_address} onChange={(e) => setOrgForm({ ...orgForm, legal_address: e.target.value })} disabled={!canOrgEdit} />
            </label>
            <label>Email
              <input value={orgForm.email} onChange={(e) => setOrgForm({ ...orgForm, email: e.target.value })} disabled={!canOrgEdit} />
            </label>
            <label>{locale === 'ru' ? 'Телефон' : 'Phone'}
              <input value={orgForm.phone} onChange={(e) => setOrgForm({ ...orgForm, phone: e.target.value })} disabled={!canOrgEdit} />
            </label>
            <label>ИНН
              <input value={orgForm.inn} onChange={(e) => setOrgForm({ ...orgForm, inn: e.target.value })} disabled={!canOrgEdit} />
            </label>
            <label>КПП
              <input value={orgForm.kpp} onChange={(e) => setOrgForm({ ...orgForm, kpp: e.target.value })} disabled={!canOrgEdit} />
            </label>
            <label className="field-wide">{locale === 'ru' ? 'Банковские реквизиты' : 'Bank details'}
              <textarea value={orgForm.bank_details} onChange={(e) => setOrgForm({ ...orgForm, bank_details: e.target.value })} disabled={!canOrgEdit} />
            </label>
            <label className="field-wide">{locale === 'ru' ? 'Заметка' : 'Note'}
              <textarea value={orgForm.note} onChange={(e) => setOrgForm({ ...orgForm, note: e.target.value })} disabled={!canOrgEdit} />
            </label>
          </div>
          <button className="btn btn-primary" type="button" style={{ marginTop: 14 }} onClick={saveOrg} disabled={!canOrgEdit}>
            {locale === 'ru' ? 'Сохранить организацию' : 'Save organization'}
          </button>
        </section>

        <section className="card">
          <div className="section-label">{locale === 'ru' ? 'Пользователи' : 'Users'}</div>
          <div className="form-grid">
            <label>{locale === 'ru' ? 'Логин' : 'Login'}
              <input value={userForm.login} onChange={(e) => setUserForm({ ...userForm, login: e.target.value })} disabled={!canManage} />
            </label>
            <label>{locale === 'ru' ? 'Имя (приветствие)' : 'Greeting name'}
              <input
                value={userForm.display_name}
                onChange={(e) => setUserForm({ ...userForm, display_name: e.target.value })}
                disabled={!canManage}
                placeholder={locale === 'ru' ? 'Тимур' : 'Name'}
              />
            </label>
            <label>{locale === 'ru' ? 'Фамилия' : 'Last name'}
              <input value={userForm.last_name} onChange={(e) => setUserForm({ ...userForm, last_name: e.target.value })} disabled={!canManage} />
            </label>
            <label>{locale === 'ru' ? 'Имя (ФИО)' : 'First name'}
              <input value={userForm.first_name} onChange={(e) => setUserForm({ ...userForm, first_name: e.target.value })} disabled={!canManage} />
            </label>
            <label>{locale === 'ru' ? 'Отчество' : 'Middle name'}
              <input value={userForm.middle_name} onChange={(e) => setUserForm({ ...userForm, middle_name: e.target.value })} disabled={!canManage} />
            </label>
            <label>{locale === 'ru' ? 'Роль' : 'Role'}
              <select value={userForm.role} onChange={(e) => setUserForm({ ...userForm, role: e.target.value })} disabled={!canManage}>
                <option value="admin">{locale === 'ru' ? 'Админ' : 'Admin'}</option>
                <option value="user">{locale === 'ru' ? 'Пользователь' : 'User'}</option>
                <option value="operator">{locale === 'ru' ? 'Оператор (кладовщик)' : 'Operator'}</option>
              </select>
            </label>
            <label>{locale === 'ru' ? 'Пароль' : 'Password'}
              <input type="password" value={userForm.password} onChange={(e) => setUserForm({ ...userForm, password: e.target.value })} disabled={!canManage} />
            </label>
          </div>
          <button className="btn btn-primary" type="button" style={{ marginTop: 12 }} onClick={createUser} disabled={!canManage}>
            {locale === 'ru' ? 'Добавить пользователя' : 'Add user'}
          </button>

          <div className="table-scroll" style={{ marginTop: 16 }}>
            <table>
              <thead>
                <tr>
                  <th>{locale === 'ru' ? 'Логин' : 'Login'}</th>
                  <th>{locale === 'ru' ? 'Имя' : 'Name'}</th>
                  <th>{locale === 'ru' ? 'ФИО' : 'Full name'}</th>
                  <th>{locale === 'ru' ? 'Роль' : 'Role'}</th>
                  <th>{locale === 'ru' ? 'Группы' : 'Groups'}</th>
                  <th>{locale === 'ru' ? 'Пароль' : 'Password'}</th>
                  <th>{locale === 'ru' ? 'ЭП' : 'E-sign'}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => {
                  const fio = [user.last_name, user.first_name, user.middle_name].filter(Boolean).join(' ');
                  const groupLabel = Array.isArray(user.group_names) && user.group_names.length
                    ? user.group_names.join(', ')
                    : '—';
                  return (
                  <tr key={user.id} className={session?.user?.id === user.id ? 'row-selected' : ''}>
                    <td className="mono">{user.login}</td>
                    <td>{user.display_name}</td>
                    <td>{fio || '—'}</td>
                    <td>{roleLabel(user.role, locale)}{!user.is_active ? <div className="subtext">заблокирован</div> : null}</td>
                    <td>{groupLabel}</td>
                    <td>{user.has_password ? '●' : '—'}</td>
                    <td title={user.esign_cert || ''}>{user.has_esign ? '●' : '—'}</td>
                    <td className="row-actions">
                      <button type="button" className="btn btn-text" onClick={() => switchUser(user.id)}>{locale === 'ru' ? 'Войти' : 'Switch'}</button>
                      {canManage && <button type="button" className="btn btn-text" onClick={() => openEdit(user)}>{locale === 'ru' ? 'Изменить' : 'Edit'}</button>}
                      {canManage && <button type="button" className="btn btn-danger" onClick={() => removeUser(user)}>{locale === 'ru' ? 'Удалить' : 'Delete'}</button>}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card">
          <div className="section-label">{locale === 'ru' ? 'Группы пользователей' : 'User groups'}</div>
          <p className="subtext" style={{ marginTop: 4, marginBottom: 12 }}>
            {locale === 'ru'
              ? 'Права группы добавляются к личным (логика «или»). Удобно для смен: «Закупки», «Кладовщики».'
              : 'Group permissions are OR-merged with personal grants.'}
          </p>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!canManage}
            onClick={() => openGroup()}
          >
            {locale === 'ru' ? 'Создать группу' : 'Create group'}
          </button>
          <div className="table-scroll" style={{ marginTop: 16 }}>
            <table>
              <thead>
                <tr>
                  <th>{locale === 'ru' ? 'Название' : 'Name'}</th>
                  <th>{locale === 'ru' ? 'Участников' : 'Members'}</th>
                  <th>{locale === 'ru' ? 'Описание' : 'Description'}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {groups.length === 0 && (
                  <tr>
                    <td colSpan={4} style={{ textAlign: 'center', color: 'var(--muted)', padding: 20 }}>
                      {locale === 'ru' ? 'Групп пока нет' : 'No groups yet'}
                    </td>
                  </tr>
                )}
                {groups.map((group) => (
                  <tr key={group.id}>
                    <td className="strong">{group.name}</td>
                    <td>{group.member_count ?? 0}</td>
                    <td>{group.description || '—'}</td>
                    <td className="row-actions">
                      {canManage && (
                        <button type="button" className="btn btn-text" onClick={() => openGroup(group)}>
                          {locale === 'ru' ? 'Изменить' : 'Edit'}
                        </button>
                      )}
                      {canManage && (
                        <button type="button" className="btn btn-danger" onClick={() => void removeGroup(group)}>
                          {locale === 'ru' ? 'Удалить' : 'Delete'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {editUser && (
        <FloatingWidget title={`${locale === 'ru' ? 'Пользователь' : 'User'}: ${editUser.login}`} open onClose={() => setEditUser(null)} width={640} zIndex={1740}>
            <div className="form-grid">
              <label>{locale === 'ru' ? 'Имя (приветствие)' : 'Greeting name'}
                <input value={editUser.display_name || ''} onChange={(e) => setEditUser({ ...editUser, display_name: e.target.value })} />
              </label>
              <label>{locale === 'ru' ? 'Фамилия' : 'Last name'}
                <input value={editUser.last_name || ''} onChange={(e) => setEditUser({ ...editUser, last_name: e.target.value })} />
              </label>
              <label>{locale === 'ru' ? 'Имя (ФИО)' : 'First name'}
                <input value={editUser.first_name || ''} onChange={(e) => setEditUser({ ...editUser, first_name: e.target.value })} />
              </label>
              <label>{locale === 'ru' ? 'Отчество' : 'Middle name'}
                <input value={editUser.middle_name || ''} onChange={(e) => setEditUser({ ...editUser, middle_name: e.target.value })} />
              </label>
              <label>{locale === 'ru' ? 'Роль' : 'Role'}
                <select value={editUser.role} onChange={(e) => {
                  const role = e.target.value;
                  setEditUser({ ...editUser, role });
                  setPerms(defaultsForRole(role));
                }}>
                  <option value="admin">{locale === 'ru' ? 'Админ' : 'Admin'}</option>
                  <option value="user">{locale === 'ru' ? 'Пользователь' : 'User'}</option>
                  <option value="operator">{locale === 'ru' ? 'Оператор (кладовщик)' : 'Operator'}</option>
                </select>
              </label>
              <label className="field-wide">{locale === 'ru' ? 'Новый пароль (пусто — не менять)' : 'New password'}
                <input type="password" value={userPassword} onChange={(e) => setUserPassword(e.target.value)} placeholder="••••" />
              </label>
              <label className="field-wide settings-check">
                <input
                  type="checkbox"
                  checked={editUser.is_active !== 0 && editUser.is_active !== false}
                  onChange={(e) => setEditUser({ ...editUser, is_active: e.target.checked ? 1 : 0 })}
                />
                {locale === 'ru' ? 'Пользователь активен (снятие — блокировка входа)' : 'User is active'}
              </label>
            </div>
            <div className="settings-check-grid" style={{ marginTop: 14 }}>
              {PERM_LABELS_RU.map((entry) => (
                <label key={entry.key} className="settings-check">
                  <input
                    type="checkbox"
                    checked={Boolean(perms[entry.key as PermKey])}
                    disabled={editUser.role === 'admin'}
                    onChange={(e) => setPerms({ ...perms, [entry.key]: e.target.checked })}
                  />
                  {entry.ru}
                </label>
              ))}
            </div>
            {editUser.role !== 'admin' && groups.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div className="section-label">{locale === 'ru' ? 'Группы' : 'Groups'}</div>
                <div className="settings-check-grid" style={{ marginTop: 8 }}>
                  {groups.map((group) => {
                    const id = Number(group.id);
                    const checked = userGroupIds.includes(id);
                    return (
                      <label key={id} className="settings-check">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            setUserGroupIds((current) => (
                              e.target.checked ? [...current, id] : current.filter((x) => x !== id)
                            ));
                          }}
                        />
                        {group.name}
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
            {editUser.role !== 'admin' && (
              <div style={{ marginTop: 16 }}>
                <div className="section-label">{locale === 'ru' ? 'Склады / адреса (пусто = все)' : 'Warehouses (empty = all)'}</div>
                <p className="subtext" style={{ marginTop: 4 }}>
                  {locale === 'ru'
                    ? 'Ограничение: операции только в выбранных узлах и их ячейках-потомках.'
                    : 'Scope: operations only inside selected nodes and their child cells.'}
                </p>
                <div className="settings-check-grid" style={{ marginTop: 8 }}>
                  {warehouses.length === 0 && (
                    <span className="subtext">{locale === 'ru' ? 'Список адресов пуст или недоступен' : 'No locations'}</span>
                  )}
                  {warehouses.map((loc) => {
                    const id = Number(loc.id);
                    const checked = locationScope.includes(id);
                    return (
                      <label key={id} className="settings-check">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            setLocationScope((current) => (
                              e.target.checked ? [...current, id] : current.filter((x) => x !== id)
                            ));
                          }}
                        />
                        {loc.name}
                        {loc.barcode ? <span className="subtext"> · {loc.barcode}</span> : null}
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => { setUserPassword(''); void (async () => {
                await (window as any).api.updateUser(editUser.id, { ...editUser, permissions: editUser.role === 'admin' ? DEFAULT_ADMIN : perms, password: '', group_ids: userGroupIds });
                onNotice(locale === 'ru' ? 'Пароль сброшен' : 'Password cleared');
                setEditUser(null);
                await load();
              })(); }}>{locale === 'ru' ? 'Сбросить пароль' : 'Clear password'}</button>
              <button type="button" className="btn btn-secondary" onClick={() => setEditUser(null)}>{t('cancel')}</button>
              <button type="button" className="btn btn-primary" onClick={saveUser}>{t('save')}</button>
            </div>
        </FloatingWidget>
      )}

      {editGroup && (
        <FloatingWidget
          title={editGroup.id
            ? `${locale === 'ru' ? 'Группа' : 'Group'}: ${editGroup.name || groupForm.name}`
            : (locale === 'ru' ? 'Новая группа' : 'New group')}
          open
          onClose={() => setEditGroup(null)}
          width={640}
          zIndex={1750}
        >
          <div className="form-grid">
            <label className="field-wide">{locale === 'ru' ? 'Название' : 'Name'}
              <input value={groupForm.name} onChange={(e) => setGroupForm({ ...groupForm, name: e.target.value })} />
            </label>
            <label className="field-wide">{locale === 'ru' ? 'Описание' : 'Description'}
              <textarea value={groupForm.description} onChange={(e) => setGroupForm({ ...groupForm, description: e.target.value })} rows={2} />
            </label>
          </div>
          <div className="section-label" style={{ marginTop: 14 }}>
            {locale === 'ru' ? 'Дополнительные права группы' : 'Group permission grants'}
          </div>
          <p className="subtext" style={{ marginTop: 4 }}>
            {locale === 'ru'
              ? 'Отмеченные права добавляются участникам поверх личных.'
              : 'Checked permissions are granted to members on top of personal ACL.'}
          </p>
          <div className="settings-check-grid" style={{ marginTop: 8 }}>
            {PERM_LABELS_RU.map((entry) => (
              <label key={entry.key} className="settings-check">
                <input
                  type="checkbox"
                  checked={Boolean(groupPerms[entry.key as PermKey])}
                  onChange={(e) => setGroupPerms({ ...groupPerms, [entry.key]: e.target.checked })}
                />
                {entry.ru}
              </label>
            ))}
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setEditGroup(null)}>{t('cancel')}</button>
            <button type="button" className="btn btn-primary" onClick={() => void saveGroup()}>{t('save')}</button>
          </div>
        </FloatingWidget>
      )}
    </>
  );
}
