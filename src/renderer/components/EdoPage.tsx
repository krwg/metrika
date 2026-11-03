import { useEffect, useMemo, useState } from 'react';
import FloatingWidget from './FloatingWidget';

type Props = {
  refreshToken: number;
  onNotice: (msg: string) => void;
  onChanged: () => void;
  session: any;
};

type Mode = 'docs' | 'catalog' | 'templates';

export default function EdoPage({ refreshToken, onNotice, onChanged, session }: Props) {
  const [mode, setMode] = useState<Mode>('catalog');
  const [rows, setRows] = useState<any[]>([]);
  const [forms, setForms] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [catalog, setCatalog] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [catalogQ, setCatalogQ] = useState('');
  const [catalogCat, setCatalogCat] = useState('');
  const [editing, setEditing] = useState<any | null>(null);
  const [editingTpl, setEditingTpl] = useState<any | null>(null);
  const [wizard, setWizard] = useState<any | null>(null);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [previewHtml, setPreviewHtml] = useState('');
  const [form, setForm] = useState({
    form_type: 'application',
    title: '',
    body: '',
    to_user_id: '',
    from_employee_id: '',
    to_employee_id: '',
    template_id: '' as string | number,
    catalog_code: '',
  });
  const [tplForm, setTplForm] = useState({
    name: '', code: '', form_type: 'application', title_template: '', body_template: '', description: '', is_active: true,
  });
  const [error, setError] = useState('');

  async function loadEmployees() {
    try {

      const synced = await (window as any).api.syncEdoEmployees?.();
      let list = synced?.employees;
      if (!list?.length) {
        await (window as any).api.ensureEdoEmployee?.();
        list = await (window as any).api.listEmployees?.({ activeOnly: true });
      }

      const meId = Number(session?.user?.id) || 0;
      if (meId && !(list || []).some((e: any) => Number(e.registry_user_id) === meId)) {
        const me = await (window as any).api.ensureEdoEmployee?.();
        if (me) list = [...(list || []), me];
      }
      setEmployees(list || []);
      setForm((prev) => {
        if (prev.from_employee_id) return prev;
        const mine = (list || []).find((e: any) => Number(e.registry_user_id) === meId);
        return mine?.id ? { ...prev, from_employee_id: String(mine.id) } : prev;
      });
      return list || [];
    } catch (e: any) {
      try {
        const me = await (window as any).api.ensureEdoEmployee?.();
        const list = await (window as any).api.listEmployees?.({ activeOnly: true });
        const merged = list?.length ? list : (me ? [me] : []);
        setEmployees(merged);
        if (me?.id) {
          setForm((prev) => (prev.from_employee_id ? prev : { ...prev, from_employee_id: String(me.id) }));
        }
        return merged;
      } catch (e2: any) {
        setEmployees([]);
        onNotice(e2?.message || e?.message || 'Не удалось загрузить сотрудников');
        return [];
      }
    }
  }

  async function linkRecipientFromUser(userId: string | number, prevForm = form) {
    const uid = Number(userId) || 0;
    if (!uid) return { ...prevForm, to_user_id: '', to_employee_id: prevForm.to_employee_id };
    let linked = employees.find((emp) => Number(emp.registry_user_id) === uid);
    if (!linked) {
      try {
        linked = await (window as any).api.ensureEdoEmployeeForUser?.(uid);
        if (linked) setEmployees((prev) => (prev.some((e) => Number(e.id) === Number(linked.id)) ? prev : [...prev, linked]));
      } catch {  }
    }
    return {
      ...prevForm,
      to_user_id: String(uid),
      to_employee_id: linked?.id ? String(linked.id) : prevForm.to_employee_id,
    };
  }

  async function load() {
    try {
      const list = await (window as any).api.listEdoDocuments({
        status: status || undefined,
        q: search || undefined,
      });
      setRows(list || []);
    } catch (e: any) {
      onNotice(e?.message || 'Не удалось загрузить ЭДО');
    }
  }

  async function loadTemplates() {
    try {
      const list = await (window as any).api.listEdoTemplates({ activeOnly: false });
      setTemplates(list || []);
    } catch (e: any) {
      onNotice(e?.message || 'Не удалось загрузить шаблоны');
    }
  }

  async function loadCatalog() {
    try {
      const list = await (window as any).api.listEdoCatalog({
        q: catalogQ || undefined,
        category: catalogCat || undefined,
      });
      setCatalog(list || []);
    } catch (e: any) {
      onNotice(e?.message || 'Не удалось загрузить каталог форм');
    }
  }

  useEffect(() => {
    (window as any).api.listEdoForms().then((f: any[]) => setForms(f || [])).catch(() => setForms([]));
    void (window as any).api.syncEdoCatalog?.().then(() => loadCatalog()).catch(() => void loadCatalog());
  }, []);

  useEffect(() => { void load(); }, [refreshToken, status]);
  useEffect(() => { void loadTemplates(); }, [refreshToken]);
  useEffect(() => {
    const t = window.setTimeout(() => { void load(); }, 220);
    return () => window.clearTimeout(t);
  }, [search]);
  useEffect(() => {
    const t = window.setTimeout(() => { void loadCatalog(); }, 180);
    return () => window.clearTimeout(t);
  }, [catalogQ, catalogCat]);

  useEffect(() => {
    const orgId = session?.organization?.id;
    if (!orgId) return;
    (window as any).api.listUsers(orgId).then((list: any[]) => setUsers(list || [])).catch(() => setUsers([]));
    void loadEmployees();
  }, [session?.organization?.id, refreshToken]);

  const categories = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of catalog) map.set(row.category, row.category_label || row.category);
    return Array.from(map.entries());
  }, [catalog]);

  function open(row?: any) {
    setEditing(row || {});
    setPreviewHtml('');
    setForm({
      form_type: row?.form_type || 'application',
      title: row?.title || '',
      body: row?.body || '',
      to_user_id: row?.to_user_id || '',
      from_employee_id: row?.from_employee_id || '',
      to_employee_id: row?.to_employee_id || '',
      template_id: row?.template_id || '',
      catalog_code: row?.catalog_code || '',
    });
    setError('');
    if (row?.id) void refreshPreview(row.id);
  }

  async function startWizard(item: any) {
    const emps = employees.length ? employees : await loadEmployees();
    const me = emps.find((e: any) => Number(e.registry_user_id) === Number(session?.user?.id)) || emps[0];
    const defaults: Record<string, string> = {};
    for (const f of item.fields || []) {
      if (f.type === 'date') defaults[f.key] = new Date().toISOString().slice(0, 10);
      else if (f.placeholder) defaults[f.key] = f.placeholder;
      else defaults[f.key] = '';
    }
    setFieldValues(defaults);
    setWizard(item);
    setForm({
      form_type: item.form_type || 'application',
      title: item.name,
      body: '',
      to_user_id: '',
      from_employee_id: me?.id ? String(me.id) : '',
      to_employee_id: '',
      template_id: '',
      catalog_code: item.code,
    });
    setError('');
    setPreviewHtml('');
  }

  async function buildFromWizard() {
    if (!wizard) return;
    for (const f of wizard.fields || []) {
      if (f.required && !String(fieldValues[f.key] || '').trim()) {
        setError(`Заполните поле «${f.label}»`);
        return;
      }
    }
    const fromEmp = employees.find((e) => Number(e.id) === Number(form.from_employee_id));
    const toEmp = employees.find((e) => Number(e.id) === Number(form.to_employee_id));
    const toUser = users.find((u) => Number(u.id) === Number(form.to_user_id));
    try {
      const applied = await (window as any).api.applyEdoCatalog(wizard.code, {
        ...fieldValues,
        org: session?.organization?.name || '',
        date: new Date().toLocaleDateString('ru-RU'),
        user: [session?.user?.last_name, session?.user?.first_name].filter(Boolean).join(' ') || session?.user?.login,
        from_employee: fromEmp?.full_name || '',
        from_position: fromEmp?.position || '',
        to_employee: toEmp?.full_name || '',
        to_position: toEmp?.position || '',
        to_user: toUser
          ? [toUser.last_name, toUser.first_name || toUser.display_name].filter(Boolean).join(' ') || toUser.login
          : '',
      });
      const toName = toUser
        ? [toUser.last_name, toUser.first_name || toUser.display_name].filter(Boolean).join(' ') || toUser.login
        : '';
      const saved = await (window as any).api.saveEdoDocument({
        form_type: applied.form_type,
        title: applied.title,
        body: applied.body,
        to_user_id: form.to_user_id || null,
        to_user_name: toName || null,
        from_employee_id: form.from_employee_id || null,
        to_employee_id: form.to_employee_id || null,
        catalog_code: wizard.code,
        fields: fieldValues,
      });
      setWizard(null);
      setEditing(saved);
      setForm({
        form_type: saved.form_type,
        title: saved.title,
        body: saved.body,
        to_user_id: saved.to_user_id || '',
        from_employee_id: saved.from_employee_id || '',
        to_employee_id: saved.to_employee_id || '',
        template_id: saved.template_id || '',
        catalog_code: saved.catalog_code || wizard.code,
      });
      await load();
      onChanged();
      await refreshPreview(saved.id);
      onNotice('Черновик сформирован — проверьте предпросмотр PDF');
    } catch (e: any) {
      setError(e?.message || 'Не удалось сформировать документ');
    }
  }

  async function refreshPreview(id?: number) {
    const docId = id || editing?.id;
    if (!docId) return;
    try {
      const res = await (window as any).api.previewEdoDocument(docId);
      setPreviewHtml(res?.html || '');
      if (res?.doc) setEditing(res.doc);
    } catch (e: any) {
      setPreviewHtml('');
      onNotice(e?.message || 'Нет предпросмотра');
    }
  }

  async function applyTemplate(templateId: number | string) {
    if (!templateId) return;
    try {
      const fromEmp = employees.find((e) => Number(e.id) === Number(form.from_employee_id));
      const toEmp = employees.find((e) => Number(e.id) === Number(form.to_employee_id));
      const toUser = users.find((u) => Number(u.id) === Number(form.to_user_id));
      const applied = await (window as any).api.applyEdoTemplate(Number(templateId), {
        from_employee: fromEmp?.full_name || '',
        to_employee: toEmp?.full_name || '',
        to_user: toUser
          ? [toUser.last_name, toUser.first_name || toUser.display_name].filter(Boolean).join(' ') || toUser.login
          : '',
      });
      setForm((prev) => ({
        ...prev,
        template_id: templateId,
        form_type: applied.form_type || prev.form_type,
        title: applied.title || prev.title,
        body: applied.body || prev.body,
      }));
      onNotice(`Применён шаблон «${applied.template_name}»`);
    } catch (e: any) {
      setError(e?.message || 'Не удалось применить шаблон');
    }
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    try {
      const toUser = users.find((u) => Number(u.id) === Number(form.to_user_id));
      const toName = toUser
        ? [toUser.last_name, toUser.first_name || toUser.display_name].filter(Boolean).join(' ') || toUser.login
        : '';
      const saved = await (window as any).api.saveEdoDocument({
        id: editing?.id,
        form_type: form.form_type,
        title: form.title,
        body: form.body,
        to_user_id: form.to_user_id || null,
        to_user_name: toName || null,
        from_employee_id: form.from_employee_id || null,
        to_employee_id: form.to_employee_id || null,
        template_id: form.template_id || null,
        catalog_code: form.catalog_code || null,
      });
      setEditing(saved);
      await load();
      onChanged();
      await refreshPreview(saved.id);
      onNotice('Документ сохранён');
    } catch (e: any) {
      setError(e?.message || 'Ошибка сохранения');
    }
  }

  async function send() {
    if (!editing?.id) return;
    try {
      const sent = await (window as any).api.sendEdoDocument(editing.id, form.to_user_id || undefined);
      setEditing(sent);
      await load();
      onChanged();
      await refreshPreview(sent.id);
      onNotice(`Отправлено на подписание: ${sent?.to_user_name || ''}`);
    } catch (e: any) {
      setError(e?.message || 'Не удалось отправить');
    }
  }

  async function removeDoc(id: number) {
    if (!window.confirm('Удалить документ безвозвратно?')) return;
    try {
      await (window as any).api.deleteEdoDocument(id);
      setEditing(null);
      await load();
      onChanged();
      onNotice('Документ удалён');
    } catch (e: any) {
      onNotice(e?.message || 'Не удалось удалить');
    }
  }

  function openTpl(row?: any) {
    setEditingTpl(row || {});
    setTplForm(row ? {
      name: row.name || '',
      code: row.code || '',
      form_type: row.form_type || 'application',
      title_template: row.title_template || '',
      body_template: row.body_template || '',
      description: row.description || '',
      is_active: row.is_active !== 0,
    } : {
      name: '', code: '', form_type: 'application', title_template: '', body_template: '', description: '', is_active: true,
    });
    setError('');
  }

  async function saveTpl(event: React.FormEvent) {
    event.preventDefault();
    try {
      await (window as any).api.saveEdoTemplate({
        id: editingTpl?.id,
        ...tplForm,
        is_active: tplForm.is_active ? 1 : 0,
      });
      setEditingTpl(null);
      await loadTemplates();
      onChanged();
      onNotice('Шаблон сохранён');
    } catch (e: any) {
      setError(e?.message || 'Ошибка сохранения шаблона');
    }
  }

  const activeTemplates = templates.filter((t) => t.is_active !== 0);
  const canEdit = !editing?.status || editing.status === 'draft' || editing.status === 'rejected';

  return (
    <>
      <div className="page-header">
        <div>
          <div className="section-label">Документооборот</div>
          <h1>ЭДО</h1>
          <p>
            Внутренний контур организации: каталог заявлений, шаблоны, журнал статусов.
            Локальная «Подпись» — штамп Metrika. Юридический контур: кнопка «Пакет оператору» (Диадок/СБИС/файл) и Настройки → Интеграции (КЭП/API).
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className={`btn ${mode === 'catalog' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setMode('catalog')}>Формы</button>
          <button type="button" className={`btn ${mode === 'docs' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setMode('docs')}>Журнал</button>
          <button type="button" className={`btn ${mode === 'templates' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setMode('templates')}>Шаблоны</button>
          {mode === 'docs' && <button type="button" className="btn btn-primary" onClick={() => open()}>Вручную</button>}
        </div>
      </div>

      {mode === 'catalog' && (
        <section className="table-wrap">
          <div className="table-header">
            <h2>Каталог обращений</h2>
            <span className="table-caption">{catalog.length}</span>
          </div>
          <div style={{ padding: '12px 20px 0', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <input
              placeholder="Поиск по формам…"
              value={catalogQ}
              onChange={(e) => setCatalogQ(e.target.value)}
              style={{ maxWidth: 320 }}
            />
            <select value={catalogCat} onChange={(e) => setCatalogCat(e.target.value)} aria-label="Категория">
              <option value="">Все категории</option>
              {categories.map(([id, label]) => (
                <option key={id} value={id}>{label}</option>
              ))}
            </select>
          </div>
          <div className="edo-catalog-grid">
            {catalog.map((item) => (
              <article key={item.code} className="edo-catalog-card">
                <div className="edo-tag-row">
                  <span className="edo-doc-tag">{item.doc_tag || item.category_tag || '—'}</span>
                  <span className="section-label" style={{ margin: 0 }}>{item.category_label}</span>
                </div>
                <h3>{item.name}</h3>
                <p className="edo-code-hint mono">поток {item.reg_stream || item.code}</p>
                <p>{item.description}</p>
                <button type="button" className="btn btn-primary" onClick={() => void startWizard(item)}>
                  Создать
                </button>
              </article>
            ))}
            {catalog.length === 0 && <div className="muted" style={{ padding: 20 }}>Ничего не найдено</div>}
          </div>
        </section>
      )}

      {mode === 'docs' && (
        <section className="table-wrap">
          <div className="table-header">
            <h2>Журнал ЭДО</h2>
            <span className="table-caption">{rows.length}</span>
          </div>
          <div style={{ padding: '12px 20px 0', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <input placeholder="Поиск…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ maxWidth: 280 }} />
            <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Статус">
              <option value="">Все статусы</option>
              <option value="draft">Черновик</option>
              <option value="sent">На подписании</option>
              <option value="signed">Подписан</option>
              <option value="rejected">Отклонён</option>
              <option value="cancelled">Отменён</option>
            </select>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Тег</th><th>Рег. №</th><th>Вид</th><th>Заголовок</th><th>Статус</th><th>Автор</th><th>Кому</th><th></th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={8} className="muted">Документов пока нет.</td></tr>
                ) : rows.map((row) => (
                  <tr key={row.id}>
                    <td><span className="edo-doc-tag" title={row.tags_label || row.doc_tag}>{row.doc_tag || '—'}</span></td>
                    <td className="mono">{row.doc_no}</td>
                    <td>
                      <div>{row.kind_label || row.form_label}</div>
                      <div className="subtext">{row.category_tag || row.form_tag || ''}</div>
                    </td>
                    <td><button type="button" className="linkish" onClick={() => open(row)}>{row.title}</button></td>
                    <td>{row.status_label}</td>
                    <td>{row.author_name}</td>
                    <td>{row.to_user_name || '—'}</td>
                    <td>
                      <button type="button" className="btn btn-secondary" onClick={() => open(row)}>Открыть</button>{' '}
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => void (window as any).api.exportEdoPdf(row.id).then((r: any) => onNotice(r?.ok ? `PDF: ${r.path}` : 'Отменено')).catch((e: any) => onNotice(e?.message || 'Ошибка PDF'))}
                      >
                        PDF
                      </button>{' '}
                      <button type="button" className="btn btn-secondary" onClick={() => void removeDoc(row.id)}>Удалить</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {mode === 'templates' && (
        <section className="table-wrap">
          <div className="table-header">
            <h2>Шаблоны документов</h2>
            <span className="table-caption">{templates.length}</span>
          </div>
          <div style={{ padding: '12px 20px', display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-secondary" onClick={() => void (window as any).api.syncEdoCatalog().then((r: any) => { loadTemplates(); loadCatalog(); onNotice(`Синхронизировано форм: ${r?.synced || 0}`); })}>
              Обновить из каталога
            </button>
            <button type="button" className="btn btn-primary" onClick={() => openTpl()}>Новый шаблон</button>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Название</th><th>Код</th><th>Категория</th><th>Форма</th><th>Активен</th><th></th>
                </tr>
              </thead>
              <tbody>
                {templates.length === 0 ? (
                  <tr><td colSpan={6} className="muted">Шаблонов нет.</td></tr>
                ) : templates.map((row) => (
                  <tr key={row.id} className={row.is_active ? '' : 'is-muted'}>
                    <td><button type="button" className="linkish" onClick={() => openTpl(row)}>{row.name}</button></td>
                    <td>{row.code || '—'}</td>
                    <td>{row.category || '—'}</td>
                    <td>{row.form_label}</td>
                    <td>{row.is_active ? 'да' : 'нет'}</td>
                    <td>
                      <button type="button" className="btn btn-secondary" onClick={() => openTpl(row)}>Изменить</button>{' '}
                      {row.is_active !== 0 && (
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => void (window as any).api.deleteEdoTemplate(row.id).then(loadTemplates).then(onChanged)}
                        >
                          Скрыть
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {wizard && (
        <FloatingWidget title={`Новая форма · ${wizard.name}`} open onClose={() => setWizard(null)} width={720}>
          <div className="form-grid" style={{ padding: '4px 4px 12px' }}>
            {error && <div className="form-error span-2">{error}</div>}
            <p className="span-2 muted" style={{ margin: 0 }}>{wizard.description}</p>
            <label>От сотрудника
              <select value={form.from_employee_id} onChange={(e) => setForm({ ...form, from_employee_id: e.target.value })}>
                <option value="">—</option>
                {employees.map((e) => <option key={e.id} value={e.id}>{e.full_name}{e.position ? ` · ${e.position}` : ''}</option>)}
              </select>
            </label>
            <label>Кому (профиль Метрики)
              <select
                value={form.to_user_id}
                onChange={(e) => {
                  const uid = e.target.value;
                  void linkRecipientFromUser(uid).then(setForm);
                }}
              >
                <option value="">— выберите подписанта —</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {[u.last_name, u.first_name || u.display_name].filter(Boolean).join(' ') || u.login} ({u.login})
                  </option>
                ))}
              </select>
            </label>
            <label className="span-2">Сотрудник-получатель
              <select value={form.to_employee_id} onChange={(e) => setForm({ ...form, to_employee_id: e.target.value })}>
                <option value="">—</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.full_name}{e.position ? ` · ${e.position}` : ''}{e.registry_user_id ? '' : ' · без входа'}
                  </option>
                ))}
              </select>
              <span className="muted" style={{ fontSize: 12 }}>
                Тот же человек, что и профиль Метрики: при выборе «Кому» карточка создаётся/подставляется автоматически.
              </span>
            </label>
            {(wizard.fields || []).map((f: any) => (
              <label key={f.key} className={f.type === 'textarea' ? 'span-2' : undefined}>
                {f.label}{f.required ? ' *' : ''}
                {f.type === 'textarea' ? (
                  <textarea
                    rows={3}
                    value={fieldValues[f.key] || ''}
                    onChange={(e) => setFieldValues({ ...fieldValues, [f.key]: e.target.value })}
                    placeholder={f.placeholder}
                    required={f.required}
                  />
                ) : f.type === 'select' ? (
                  <select
                    value={fieldValues[f.key] || ''}
                    onChange={(e) => setFieldValues({ ...fieldValues, [f.key]: e.target.value })}
                    required={f.required}
                  >
                    <option value="">—</option>
                    {(f.options || []).map((o: string) => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : (
                  <input
                    type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
                    value={fieldValues[f.key] || ''}
                    onChange={(e) => setFieldValues({ ...fieldValues, [f.key]: e.target.value })}
                    placeholder={f.placeholder}
                    required={f.required}
                  />
                )}
              </label>
            ))}
            {employees.length === 0 && (
              <div className="span-2 muted">
                Нет карточек сотрудников — будет создана из вашего профиля при сохранении.
                <button type="button" className="btn btn-secondary" style={{ marginLeft: 8 }} onClick={() => void loadEmployees()}>
                  Создать карточку
                </button>
              </div>
            )}
            <div className="modal-actions span-2">
              <button type="button" className="btn btn-secondary" onClick={() => setWizard(null)}>Отмена</button>
              <button type="button" className="btn btn-primary" onClick={() => void buildFromWizard()}>
                Сформировать и предпросмотр
              </button>
            </div>
          </div>
        </FloatingWidget>
      )}

      {editing && (
        <FloatingWidget
          title={editing.doc_no
            ? `${editing.doc_tag || editing.form_tag || 'ЭДО'} · ${editing.doc_no}`
            : 'Документ ЭДО'}
          open
          onClose={() => setEditing(null)}
          width={920}
        >
          <form className="form-grid" onSubmit={save} style={{ padding: '4px 4px 12px' }}>
            {error && <div className="form-error span-2">{error}</div>}
            {editing.status_label && (
              <div className="span-2 muted">Статус: <strong>{editing.status_label}</strong>
                {editing.signed_by_name ? ` · подписал ${editing.signed_by_name}` : ''}
                {editing.stamp_key ? ` · ключ ${editing.stamp_key}` : ''}
              </div>
            )}
            <label>Форма
              <select value={form.form_type} onChange={(e) => setForm({ ...form, form_type: e.target.value })} disabled={!canEdit}>
                {(forms.length ? forms : [{ id: 'application', label: 'Заявление' }]).map((f: any) => (
                  <option key={f.id} value={f.id}>{f.label}</option>
                ))}
              </select>
            </label>
            <label>Кому (профиль Метрики)
              <select
                value={form.to_user_id}
                onChange={(e) => {
                  const uid = e.target.value;
                  void linkRecipientFromUser(uid).then(setForm);
                }}
                disabled={!canEdit}
              >
                <option value="">— выберите —</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {[u.last_name, u.first_name || u.display_name].filter(Boolean).join(' ') || u.login} ({u.login})
                  </option>
                ))}
              </select>
            </label>
            <label>От сотрудника
              <select value={form.from_employee_id} onChange={(e) => setForm({ ...form, from_employee_id: e.target.value })} disabled={!canEdit}>
                <option value="">—</option>
                {employees.map((e) => <option key={e.id} value={e.id}>{e.full_name}{e.position ? ` · ${e.position}` : ''}</option>)}
              </select>
            </label>
            <label>Сотрудник-получатель
              <select value={form.to_employee_id} onChange={(e) => setForm({ ...form, to_employee_id: e.target.value })} disabled={!canEdit}>
                <option value="">—</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.full_name}{e.position ? ` · ${e.position}` : ''}
                  </option>
                ))}
              </select>
            </label>
            <label className="span-2">Заголовок
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required disabled={!canEdit} />
            </label>
            {canEdit && (
              <label className="span-2">Шаблон (доп.)
                <select
                  value={form.template_id}
                  onChange={(e) => {
                    const id = e.target.value;
                    setForm({ ...form, template_id: id });
                    if (id) void applyTemplate(id);
                  }}
                >
                  <option value="">—</option>
                  {activeTemplates.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </label>
            )}
            <label className="span-2">Текст документа
              <textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} rows={8} disabled={!canEdit} />
            </label>
            <div className="span-2 edo-preview-wrap">
              <div className="table-header" style={{ padding: '0 0 8px' }}>
                <h2 style={{ margin: 0, fontSize: 15 }}>Предпросмотр PDF</h2>
                <button type="button" className="btn btn-secondary" onClick={() => void refreshPreview()}>Обновить</button>
              </div>
              {previewHtml ? (
                <iframe title="Предпросмотр ЭДО" className="edo-preview-frame" srcDoc={previewHtml} />
              ) : (
                <div className="muted">Сохраните документ, чтобы увидеть бланк</div>
              )}
            </div>
            <div className="modal-actions span-2">
              {editing.id && (
                <>
                  <button type="button" className="btn btn-secondary" onClick={() => void refreshPreview()}>Предпросмотр</button>
                  <button type="button" className="btn btn-secondary" onClick={() => void (window as any).api.printEdoDocument(editing.id)}>Печать</button>
                  <button type="button" className="btn btn-secondary" onClick={() => void (window as any).api.exportEdoPdf(editing.id).then((r: any) => onNotice(r?.ok ? `PDF сохранён: ${r.path}` : 'Отменено'))}>PDF</button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => void (window as any).api.buildEdoLegalPackage?.(editing.id)
                      .then((r: any) => onNotice(r?.note ? `${r.note} ${r.dir || ''}` : `Пакет ${r?.package_id}`))
                      .catch((e: any) => onNotice(e?.message || 'Ошибка пакета'))}
                  >
                    Пакет оператору
                  </button>
                </>
              )}
              {canEdit && (
                <>
                  <button type="submit" className="btn btn-secondary">Сохранить</button>
                  {editing.id && <button type="button" className="btn btn-primary" onClick={() => void send()}>Отправить на подпись</button>}
                </>
              )}
              {editing.id && (
                <button type="button" className="btn btn-secondary" onClick={() => void removeDoc(editing.id)}>Удалить</button>
              )}
              {editing.status === 'draft' && editing.id && (
                <button type="button" className="btn btn-secondary" onClick={() => void (window as any).api.cancelEdoDocument(editing.id).then(() => { setEditing(null); load(); onChanged(); })}>Отменить</button>
              )}
              <button type="button" className="btn btn-secondary" onClick={() => setEditing(null)}>Закрыть</button>
            </div>
          </form>
        </FloatingWidget>
      )}

      {editingTpl && (
        <FloatingWidget
          title={editingTpl.id ? `Шаблон · ${editingTpl.name || ''}` : 'Новый шаблон ЭДО'}
          open
          onClose={() => setEditingTpl(null)}
          width={720}
        >
          <form className="form-grid" onSubmit={saveTpl} style={{ padding: '4px 4px 12px' }}>
            {error && <div className="form-error span-2">{error}</div>}
            <label>Название<input value={tplForm.name} onChange={(e) => setTplForm({ ...tplForm, name: e.target.value })} required /></label>
            <label>Код<input value={tplForm.code} onChange={(e) => setTplForm({ ...tplForm, code: e.target.value })} /></label>
            <label>Форма
              <select value={tplForm.form_type} onChange={(e) => setTplForm({ ...tplForm, form_type: e.target.value })}>
                {(forms.length ? forms : [{ id: 'other', label: 'Прочий' }]).map((f: any) => (
                  <option key={f.id} value={f.id}>{f.label}</option>
                ))}
              </select>
            </label>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="checkbox" checked={tplForm.is_active} onChange={(e) => setTplForm({ ...tplForm, is_active: e.target.checked })} />
              Активен
            </label>
            <label className="span-2">Шаблон заголовка
              <input value={tplForm.title_template} onChange={(e) => setTplForm({ ...tplForm, title_template: e.target.value })} />
            </label>
            <label className="span-2">Шаблон текста
              <textarea value={tplForm.body_template} onChange={(e) => setTplForm({ ...tplForm, body_template: e.target.value })} rows={12} />
            </label>
            <label className="span-2">Описание
              <input value={tplForm.description} onChange={(e) => setTplForm({ ...tplForm, description: e.target.value })} />
            </label>
            <div className="modal-actions span-2">
              <button type="button" className="btn btn-secondary" onClick={() => setEditingTpl(null)}>Отмена</button>
              <button type="submit" className="btn btn-primary">Сохранить</button>
            </div>
          </form>
        </FloatingWidget>
      )}
    </>
  );
}
