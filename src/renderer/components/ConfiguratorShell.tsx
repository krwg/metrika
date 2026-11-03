import { useEffect, useState } from 'react';
import ConfigEditorPage from './ConfigEditorPage';

const NAV_SECTIONS: { id: string; label: string }[] = [
  { id: 'dashboard', label: 'Обзор' },
  { id: 'items', label: 'Товары' },
  { id: 'categories', label: 'Категории' },
  { id: 'units', label: 'Единицы' },
  { id: 'replenishment', label: 'Пополнение' },
  { id: 'purchases', label: 'Закупки' },
  { id: 'locations', label: 'Хранение' },
  { id: 'inventory', label: 'Ревизия' },
  { id: 'projects', label: 'Проекты' },
  { id: 'reserves', label: 'Резервы' },
  { id: 'tsd', label: 'ТСД' },
  { id: 'abc', label: 'Аналитика' },
  { id: 'templates', label: 'Шаблоны' },
  { id: 'quality', label: 'Качество' },
  { id: 'documents', label: 'Документы' },
  { id: 'edo', label: 'ЭДО' },
  { id: 'employees', label: 'Сотрудники' },
  { id: 'company', label: 'Компания' },
  { id: 'assets', label: 'Оборудование / ОС' },
  { id: 'organizations', label: 'Организация' },
  { id: 'cabinet', label: 'Личный кабинет' },
  { id: 'audit', label: 'Журнал действий' },
  { id: 'history', label: 'История' },
  { id: 'info', label: 'Информация' },
  { id: 'settings', label: 'Настройки' },
];

const ROLE_PRESETS: Record<string, { label: string; hidden: string[] }> = {
  full: { label: 'Полное меню', hidden: [] },
  warehouse: {
    label: 'Складской контур',
    hidden: ['abc', 'templates', 'organizations', 'audit', 'settings', 'info', 'quality'],
  },
  supply: {
    label: 'Снабжение',
    hidden: ['tsd', 'templates', 'reserves', 'inventory', 'audit', 'info'],
  },
  minimal: {
    label: 'Минимум',
    hidden: NAV_SECTIONS.map((s) => s.id).filter((id) => !['dashboard', 'items', 'locations', 'history', 'info'].includes(id)),
  },
};

type Tab = 'meta' | 'visual' | 'sections' | 'forms' | 'sandbox';

export default function ConfiguratorShell() {
  const [tab, setTab] = useState<Tab>('meta');
  const [session, setSession] = useState<any>(null);
  const [notice, setNotice] = useState('');
  const [theme, setTheme] = useState('1c-light');
  const [sections, setSections] = useState<Array<{ id: string; label: string; hidden: boolean }>>([]);
  const [dragId, setDragId] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [sandboxBusy, setSandboxBusy] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    document.title = 'Метрика [0.5 Домашняя] — Редактор';
    (window as any).api.setTitleBarTheme?.(theme).catch(() => {});
  }, [theme]);

  useEffect(() => {
    (async () => {
      const s = await (window as any).api.getAuthSession?.();
      setSession(s);
      if (!s || s.user?.role !== 'admin') return;
      const savedTheme = await (window as any).api.getSetting('theme', '1c-light');
      setTheme(savedTheme || '1c-light');
      let order: string[] = NAV_SECTIONS.map((x) => x.id);
      let hidden: string[] = [];
      try {
        const raw = await (window as any).api.getSetting('workspace.nav', '');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed.order)) order = parsed.order;
          if (Array.isArray(parsed.hidden)) hidden = parsed.hidden;
        }
      } catch {  }
      const known = new Map(NAV_SECTIONS.map((x) => [x.id, x.label]));
      const merged = order.filter((id) => known.has(id)).map((id) => ({
        id,
        label: known.get(id) || id,
        hidden: hidden.includes(id),
      }));
      for (const row of NAV_SECTIONS) {
        if (!merged.some((m) => m.id === row.id)) merged.push({ ...row, hidden: false });
      }
      setSections(merged);
    })();
  }, []);

  useEffect(() => {
    const off = (window as any).api.onSettingsChanged?.((payload: { key: string; value: string }) => {
      if (payload?.key === 'theme' && payload.value) setTheme(payload.value);
    });
    return () => { try { off?.(); } catch {  } };
  }, []);

  async function saveTheme(next: string) {
    setTheme(next);
    await (window as any).api.setSetting('theme', next);
    setNotice('Тема организации обновлена во всех окнах');
  }

  async function saveSections(next: typeof sections) {
    setSections(next);
    await (window as any).api.setSetting('workspace.nav', JSON.stringify({
      order: next.map((s) => s.id),
      hidden: next.filter((s) => s.hidden).map((s) => s.id),
    }));
    setNotice('Разделы меню сохранены — переоткройте клиент или обновите сводку');
  }

  function applyPreset(key: string) {
    const preset = ROLE_PRESETS[key];
    if (!preset) return;
    const next = NAV_SECTIONS.map((row) => ({
      ...row,
      hidden: preset.hidden.includes(row.id),
    }));
    void saveSections(next);
  }

  function onDrop(targetId: string) {
    if (!dragId || dragId === targetId) return;
    const next = [...sections];
    const from = next.findIndex((s) => s.id === dragId);
    const to = next.findIndex((s) => s.id === targetId);
    if (from < 0 || to < 0) return;
    const [row] = next.splice(from, 1);
    next.splice(to, 0, row);
    void saveSections(next);
    setDragId(null);
  }

  async function seedSandbox() {
    if (!window.confirm('Добавить демо-данные песочницы (категории, ячейка, 3 товара с остатком)?')) return;
    setSandboxBusy(true);
    try {
      const result = await (window as any).api.configSeedSandbox();
      const c = result?.created || {};
      setNotice(`Песочница: +${c.categories || 0} кат. · +${c.locations || 0} адр. · +${c.items || 0} тов.`);
      setRefreshToken((n) => n + 1);
    } catch (e: any) {
      setNotice(e?.message || 'Не удалось заполнить песочницу');
    } finally {
      setSandboxBusy(false);
    }
  }

  async function clearSandbox() {
    if (!window.confirm('Удалить только объекты с префиксом «Песочница · …»? Остальные данные не трогаем.')) return;
    setSandboxBusy(true);
    try {
      const result = await (window as any).api.configClearSandbox();
      const c = result?.cleared || {};
      setNotice(`Удалено: ${c.items || 0} тов. · ${c.locations || 0} адр. · ${c.categories || 0} кат.`);
      setRefreshToken((n) => n + 1);
    } catch (e: any) {
      setNotice(e?.message || 'Не удалось очистить песочницу');
    } finally {
      setSandboxBusy(false);
    }
  }

  if (!session) {
    return (
      <div className="app-shell launcher-only">
        <div className="title-bar">
          <div className="title-bar-title">Метрика — Редактор</div>
          <div className="title-bar-drag" />
        </div>
        <div className="empty" style={{ padding: 48 }}>
          <h3>Нет сессии</h3>
          <p>Откройте редактор из лаунчера кнопкой «Редактор» (вход администратора).</p>
        </div>
      </div>
    );
  }

  if (session.user?.role !== 'admin') {
    return (
      <div className="app-shell launcher-only">
        <div className="title-bar">
          <div className="title-bar-title">Метрика [0.5 Домашняя] — Редактор</div>
          <div className="title-bar-drag" />
        </div>
        <div className="form-error page-error">Редактор доступен только администратору</div>
      </div>
    );
  }

  return (
    <div className="app-shell configurator-app">
      <div className="title-bar">
        <div className="title-bar-title">Метрика [0.5 Домашняя] — Редактор</div>
        <div className="title-bar-drag" />
        <div className="title-bar-session">{session.organization?.name || '—'}</div>
      </div>
      <div className="configurator-toolbar">
        <button type="button" className={`filter-chip ${tab === 'meta' ? 'active' : ''}`} onClick={() => setTab('meta')}>Метаданные</button>
        <button type="button" className={`filter-chip ${tab === 'forms' ? 'active' : ''}`} onClick={() => setTab('forms')}>Формы</button>
        <button type="button" className={`filter-chip ${tab === 'visual' ? 'active' : ''}`} onClick={() => setTab('visual')}>Визуал</button>
        <button type="button" className={`filter-chip ${tab === 'sections' ? 'active' : ''}`} onClick={() => setTab('sections')}>Разделы</button>
        <button type="button" className={`filter-chip ${tab === 'sandbox' ? 'active' : ''}`} onClick={() => setTab('sandbox')}>Песочница</button>
        <button type="button" className="btn btn-text" onClick={() => setRefreshToken((n) => n + 1)}>Обновить</button>
      </div>
      <main className="main configurator-main">
        {tab === 'meta' && (
          <ConfigEditorPage refreshToken={refreshToken} onNotice={setNotice} standalone />
        )}
        {tab === 'visual' && (
          <section className="card settings-card">
            <div className="section-label">Оформление</div>
            <h2>Визуал Метрики</h2>
            <p className="subtext">Тема по умолчанию для рабочей области организации. Меняйте и сразу смотрите превью — клиент подхватит тему при следующем обновлении настроек.</p>
            <div className="form-grid" style={{ marginTop: 16 }}>
              <label>Тема
                <select value={theme} onChange={(e) => void saveTheme(e.target.value)}>
                  <option value="light">Синяя светлая</option>
                  <option value="dark">Синяя тёмная</option>
                  <option value="oled">OLED</option>
                  <option value="aurora">Аврора</option>
                  <option value="1c-light">Жёлтая светлая</option>
                  <option value="1c-dark">Жёлтая тёмная</option>
                </select>
              </label>
            </div>
            <div className={`config-visual-preview theme-preview-${theme}`}>
              <strong>Метрика0.5</strong>
              <span>Превью шапки и акцента · {session.organization?.name}</span>
            </div>
          </section>
        )}
        {tab === 'sections' && (
          <section className="card settings-card">
            <div className="section-label">Навигация клиента</div>
            <h2>Разделы бокового меню</h2>
            <p className="subtext">Порядок и видимость разделов обычного клиента (не этого окна). Редактор в меню клиента не показывается.</p>
            <div className="filter-row" style={{ marginTop: 12, flexWrap: 'wrap', gap: 8 }}>
              {Object.entries(ROLE_PRESETS).map(([key, preset]) => (
                <button key={key} type="button" className="btn btn-secondary" onClick={() => applyPreset(key)}>
                  {preset.label}
                </button>
              ))}
            </div>
            <div className="config-section-list">
              {sections.map((row) => (
                <div
                  key={row.id}
                  className={`config-section-row ${dragId === row.id ? 'dragging' : ''}`}
                  draggable
                  onDragStart={() => setDragId(row.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => onDrop(row.id)}
                >
                  <span className="config-tree-twist">⠿</span>
                  <strong>{row.label}</strong>
                  <span className="mono subtext">{row.id}</span>
                  <label style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input
                      type="checkbox"
                      checked={!row.hidden}
                      onChange={(e) => {
                        const next = sections.map((s) => (s.id === row.id ? { ...s, hidden: !e.target.checked } : s));
                        void saveSections(next);
                      }}
                    />
                    Показывать
                  </label>
                </div>
              ))}
            </div>
          </section>
        )}
        {tab === 'forms' && (
          <CustomFormsEditor onNotice={setNotice} refreshToken={refreshToken} />
        )}
        {tab === 'sandbox' && (
          <section className="card settings-card">
            <div className="section-label">Эксперименты</div>
            <h2>Песочница Метрики</h2>
            <p className="subtext">
              Отдельное окно конфигуратора — безопасная зона для правки метаданных, меню и демо-данных.
              Объекты песочницы помечены префиксом «Песочница · …» и удаляются одной кнопкой.
            </p>
            <div className="sandbox-actions" style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 16 }}>
              <button type="button" className="btn btn-primary" disabled={sandboxBusy} onClick={() => void seedSandbox()}>
                Заполнить демо-данными
              </button>
              <button type="button" className="btn btn-danger" disabled={sandboxBusy} onClick={() => void clearSandbox()}>
                Убрать демо-данные
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setTab('meta')}>
                К метаданным →
              </button>
            </div>
            <ul className="config-welcome-list" style={{ marginTop: 18 }}>
              <li><b>Метаданные</b> — дерево справочников/документов/регистров и прямая правка SQLite</li>
              <li><b>Формы</b> — создание новых форм и типов данных без кода; клиент читает их как разделы</li>
              <li><b>Визуал</b> — тема организации</li>
              <li><b>Разделы</b> — состав и порядок меню обычного клиента + пресеты</li>
              <li><b>Песочница</b> — демо-склад для проверки сценариев без порчи боевых справочников</li>
            </ul>
          </section>
        )}
      </main>
      {notice && <div className="toast" role="status">{notice}</div>}
    </div>
  );
}

function CustomFormsEditor({ onNotice, refreshToken }: { onNotice: (m: string) => void; refreshToken: number }) {
  const [forms, setForms] = useState<any[]>([]);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState({
    code: '', title: '', nav_label: '', description: '',
    fieldsText: 'name|Наименование|text\nnote|Примечание|text',
    is_active: true,
  });
  const [rows, setRows] = useState<any[]>([]);
  const [selectedFormId, setSelectedFormId] = useState<number | null>(null);
  const [rowDraft, setRowDraft] = useState<Record<string, string>>({});

  async function load() {
    try {
      const list = await (window as any).api.listCustomForms();
      setForms(list || []);
    } catch (e: any) {
      onNotice(e?.message || 'Не удалось загрузить формы');
    }
  }

  useEffect(() => { void load(); }, [refreshToken]);

  useEffect(() => {
    if (!selectedFormId) { setRows([]); return; }
    (window as any).api.listCustomFormRows(selectedFormId).then((r: any[]) => setRows(r || [])).catch(() => setRows([]));
  }, [selectedFormId, refreshToken]);

  function parseFields(text: string) {
    return text.split('\n').map((line) => line.trim()).filter(Boolean).map((line) => {
      const [key, label, type] = line.split('|').map((p) => p.trim());
      return { key: key || 'field', label: label || key || 'Поле', type: type || 'text' };
    });
  }

  function openForm(row?: any) {
    setEditing(row || {});
    if (row) {
      let fieldsText = '';
      try {
        const fields = JSON.parse(row.fields_json || '[]');
        fieldsText = (fields || []).map((f: any) => `${f.key}|${f.label}|${f.type || 'text'}`).join('\n');
      } catch { fieldsText = ''; }
      setForm({
        code: row.code || '',
        title: row.title || '',
        nav_label: row.nav_label || '',
        description: row.description || '',
        fieldsText,
        is_active: row.is_active !== 0,
      });
    } else {
      setForm({
        code: '', title: '', nav_label: '', description: '',
        fieldsText: 'name|Наименование|text\nnote|Примечание|text',
        is_active: true,
      });
    }
  }

  async function saveForm(event: React.FormEvent) {
    event.preventDefault();
    try {
      const saved = await (window as any).api.saveCustomForm({
        id: editing?.id,
        code: form.code,
        title: form.title,
        nav_label: form.nav_label || form.title,
        description: form.description,
        fields: parseFields(form.fieldsText),
        is_active: form.is_active ? 1 : 0,
      });

      try {
        const raw = await (window as any).api.getSetting('workspace.nav', '');
        const parsed = raw ? JSON.parse(raw) : { order: [], hidden: [] };
        const pageId = `custom_${saved.code}`;
        const order = Array.isArray(parsed.order) ? parsed.order : [];
        if (!order.includes(pageId)) {
          await (window as any).api.setSetting('workspace.nav', JSON.stringify({
            order: [...order, pageId],
            hidden: Array.isArray(parsed.hidden) ? parsed.hidden : [],
            customLabels: { ...(parsed.customLabels || {}), [pageId]: saved.nav_label || saved.title },
          }));
        }
      } catch {  }
      setEditing(null);
      await load();
      onNotice('Форма сохранена. Раздел появится в клиенте после обновления меню.');
    } catch (e: any) {
      onNotice(e?.message || 'Ошибка сохранения формы');
    }
  }

  const selected = forms.find((f) => Number(f.id) === Number(selectedFormId));
  let selectedFields: any[] = [];
  try { selectedFields = JSON.parse(selected?.fields_json || '[]'); } catch { selectedFields = []; }

  return (
    <section className="card settings-card">
      <div className="section-label">Конструктор</div>
      <h2>Пользовательские формы</h2>
      <p className="subtext">
        Создавайте новые типы данных и карточки без программирования. Поля задаются строками
        «ключ|Подпись|text». Данные вводятся справа — клиент Метрики читает формы как рабочие разделы.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(240px, 320px) 1fr', gap: 16, marginTop: 16 }}>
        <div>
          <button type="button" className="btn btn-primary" style={{ marginBottom: 10 }} onClick={() => openForm()}>Новая форма</button>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
            {forms.map((f) => (
              <li key={f.id}>
                <button
                  type="button"
                  className={`btn ${selectedFormId === f.id ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ width: '100%', textAlign: 'left' }}
                  onClick={() => setSelectedFormId(Number(f.id))}
                >
                  {f.title}{f.is_active ? '' : ' (скрыта)'}
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div>
          {selected ? (
            <>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-secondary" onClick={() => openForm(selected)}>Изменить форму</button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => void (window as any).api.deleteCustomForm(selected.id).then(load).then(() => setSelectedFormId(null))}
                >
                  Скрыть форму
                </button>
              </div>
              <h3 style={{ marginTop: 0 }}>{selected.title}</h3>
              <p className="muted">Код: {selected.code}</p>
              <div className="form-grid" style={{ marginBottom: 12 }}>
                {selectedFields.map((field) => (
                  <label key={field.key}>
                    {field.label}
                    <input
                      value={rowDraft[field.key] || ''}
                      onChange={(e) => setRowDraft({ ...rowDraft, [field.key]: e.target.value })}
                    />
                  </label>
                ))}
              </div>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  void (window as any).api.saveCustomFormRow({ form_id: selected.id, data: rowDraft })
                    .then(() => (window as any).api.listCustomFormRows(selected.id))
                    .then((r: any[]) => { setRows(r || []); setRowDraft({}); onNotice('Запись добавлена'); })
                    .catch((e: any) => onNotice(e?.message || 'Ошибка'));
                }}
              >
                Добавить запись
              </button>
              <div className="table-scroll" style={{ marginTop: 16 }}>
                <table>
                  <thead>
                    <tr>
                      {selectedFields.map((f) => <th key={f.key}>{f.label}</th>)}
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      let data: any = {};
                      try { data = JSON.parse(row.data_json || '{}'); } catch { data = {}; }
                      return (
                        <tr key={row.id}>
                          {selectedFields.map((f) => <td key={f.key}>{data[f.key] ?? '—'}</td>)}
                          <td>
                            <button
                              type="button"
                              className="btn btn-secondary"
                              onClick={() => void (window as any).api.deleteCustomFormRow(row.id)
                                .then(() => (window as any).api.listCustomFormRows(selected.id))
                                .then((r: any[]) => setRows(r || []))}
                            >
                              Удалить
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <p className="muted">Выберите форму слева или создайте новую.</p>
          )}
        </div>
      </div>

      {editing && (
        <form className="form-grid card" style={{ marginTop: 16, padding: 16 }} onSubmit={saveForm}>
          <h3 className="span-2" style={{ margin: 0 }}>{editing.id ? 'Изменить форму' : 'Новая форма'}</h3>
          <label>Код<input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="claims" /></label>
          <label>Название<input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required /></label>
          <label>Пункт меню<input value={form.nav_label} onChange={(e) => setForm({ ...form, nav_label: e.target.value })} placeholder="Претензии" /></label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
            Активна
          </label>
          <label className="span-2">Описание<input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
          <label className="span-2">Поля (ключ|Подпись|тип, по строке)
            <textarea value={form.fieldsText} onChange={(e) => setForm({ ...form, fieldsText: e.target.value })} rows={8} />
          </label>
          <div className="modal-actions span-2">
            <button type="button" className="btn btn-secondary" onClick={() => setEditing(null)}>Отмена</button>
            <button type="submit" className="btn btn-primary">Сохранить форму</button>
          </div>
        </form>
      )}
    </section>
  );
}
