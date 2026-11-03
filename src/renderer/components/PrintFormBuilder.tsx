import { useEffect, useMemo, useState } from 'react';

type Column = { key: string; title: string; align?: string; width?: string; enabled?: boolean };
type Sign = { role: string; hint?: string };
type Template = {
  id: string;
  name: string;
  hint?: string;
  group?: 'gost' | 'metrika' | 'stock';
  kinds: string[];
  style: string;
  formCode?: string;
  okud?: string;
  titleOverride?: string;
  landscape?: boolean;
  paper?: 'A4' | 'A5';
  showOrg?: boolean;
  showRowNumbers?: boolean;
  showTotals?: boolean;
  columns: Column[];
  signs: Sign[];
  customCss?: string;
  footerNote?: string;
  isSystem?: boolean;
};

type TabId = 'main' | 'columns' | 'signs' | 'look';

const KIND_OPTIONS = [
  { id: 'stock', label: 'Остатки' },
  { id: 'transfer', label: 'Перемещение' },
  { id: 'writeoff', label: 'Списание' },
  { id: 'surplus', label: 'Излишки' },
  { id: 'regrade', label: 'Пересортица' },
  { id: 'disassemble', label: 'Разукомплектация' },
  { id: 'assemble', label: 'Комплектация' },
  { id: 'revision', label: 'Ревизия' },
  { id: 'po', label: 'Закупка' },
  { id: 'project', label: 'Заказ-наряд' },
  { id: 'movement', label: 'Движение' },
];

const STYLE_OPTIONS = [
  { id: 'gost-act', label: 'ГОСТ акт (М-11 / ТОРГ-15)' },
  { id: 'gost-waybill', label: 'ГОСТ накладная (М-15 / ТОРГ-12)' },
  { id: 'gost-inventory', label: 'ГОСТ опись (ИНВ-3)' },
  { id: 'gost-order', label: 'Заказ / приказ' },
  { id: 'gost-stock', label: 'Ведомость остатков' },
  { id: 'simple', label: 'Краткая форма Метрики' },
];

const GROUP_LABEL: Record<string, string> = {
  gost: 'ГОСТ / унифицированные РФ',
  stock: 'Остатки',
  metrika: 'Формы Метрики',
  custom: 'Пользовательские',
};

const COLUMN_KEYS = [
  { key: 'name', title: 'Наименование' },
  { key: 'sku', title: 'Артикул' },
  { key: 'print_name', title: 'Для печати' },
  { key: 'barcode', title: 'Штрихкод' },
  { key: 'category', title: 'Категория' },
  { key: 'unit', title: 'Ед.' },
  { key: 'okei', title: 'ОКЕИ' },
  { key: 'qty', title: 'Количество' },
  { key: 'on_hand', title: 'Физический остаток' },
  { key: 'reserved', title: 'Резерв' },
  { key: 'available', title: 'Доступно' },
  { key: 'min_stock', title: 'Минимум' },
  { key: 'price', title: 'Цена' },
  { key: 'sum', title: 'Сумма' },
  { key: 'book', title: 'По учёту' },
  { key: 'fact', title: 'Фактически' },
  { key: 'diff', title: 'Отклонение' },
  { key: 'from', title: 'Откуда' },
  { key: 'to', title: 'Куда' },
  { key: 'locations', title: 'Размещение' },
];

const COLUMN_PRESETS = [
  {
    id: 'brief',
    label: 'Краткий набор',
    columns: [
      { key: 'name', title: 'Наименование', enabled: true },
      { key: 'sku', title: 'Артикул', enabled: true },
      { key: 'unit', title: 'Ед.', align: 'center', enabled: true },
      { key: 'qty', title: 'Кол-во', align: 'right', enabled: true },
    ],
  },
  {
    id: 'gost',
    label: 'ГОСТ (имя / арт / ед / ОКЕИ / кол-во)',
    columns: [
      { key: 'name', title: 'Наименование', enabled: true },
      { key: 'sku', title: 'Артикул', enabled: true },
      { key: 'unit', title: 'Ед.', align: 'center', enabled: true },
      { key: 'okei', title: 'ОКЕИ', align: 'center', enabled: true },
      { key: 'qty', title: 'Количество', align: 'right', enabled: true },
    ],
  },
  {
    id: 'price',
    label: 'С ценой',
    columns: [
      { key: 'name', title: 'Наименование', enabled: true },
      { key: 'sku', title: 'Артикул', enabled: true },
      { key: 'unit', title: 'Ед.', align: 'center', enabled: true },
      { key: 'qty', title: 'Кол-во', align: 'right', enabled: true },
      { key: 'price', title: 'Цена', align: 'right', enabled: true },
      { key: 'sum', title: 'Сумма', align: 'right', enabled: true },
    ],
  },
  {
    id: 'transfer',
    label: 'Перемещение',
    columns: [
      { key: 'name', title: 'Наименование', enabled: true },
      { key: 'sku', title: 'Артикул', enabled: true },
      { key: 'unit', title: 'Ед.', align: 'center', enabled: true },
      { key: 'qty', title: 'Кол-во', align: 'right', enabled: true },
      { key: 'from', title: 'Откуда', enabled: true },
      { key: 'to', title: 'Куда', enabled: true },
    ],
  },
  {
    id: 'inventory',
    label: 'Инвентаризация',
    columns: [
      { key: 'name', title: 'Наименование', enabled: true },
      { key: 'sku', title: 'Номенклатурный №', enabled: true },
      { key: 'unit', title: 'Ед.', align: 'center', enabled: true },
      { key: 'book', title: 'По учёту', align: 'right', enabled: true },
      { key: 'fact', title: 'Фактически', align: 'right', enabled: true },
      { key: 'diff', title: 'Отклонение', align: 'right', enabled: true },
    ],
  },
  {
    id: 'stock',
    label: 'Остатки полные',
    columns: [
      { key: 'sku', title: 'Артикул', enabled: true, width: '18mm' },
      { key: 'name', title: 'Наименование', enabled: true },
      { key: 'unit', title: 'Ед.', align: 'center', enabled: true, width: '10mm' },
      { key: 'okei', title: 'ОКЕИ', align: 'center', enabled: true, width: '12mm' },
      { key: 'on_hand', title: 'Физич.', align: 'right', enabled: true, width: '14mm' },
      { key: 'reserved', title: 'Резерв', align: 'right', enabled: true, width: '14mm' },
      { key: 'available', title: 'Доступно', align: 'right', enabled: true, width: '14mm' },
      { key: 'locations', title: 'Размещение', enabled: true, width: '36mm' },
    ],
  },
];

const SIGN_PRESETS = [
  {
    id: 'mol',
    label: 'Отпустил / Получил / МОЛ',
    signs: [
      { role: 'Отпустил', hint: 'подпись / ФИО' },
      { role: 'Получил', hint: 'подпись / ФИО' },
      { role: 'МОЛ', hint: 'подпись / ФИО' },
    ],
  },
  {
    id: 'commission',
    label: 'Комиссия',
    signs: [
      { role: 'Председатель комиссии', hint: 'подпись / ФИО' },
      { role: 'Член комиссии', hint: 'подпись / ФИО' },
      { role: 'МОЛ / кладовщик', hint: 'подпись / ФИО' },
    ],
  },
  {
    id: 'brief',
    label: 'Один ответственный',
    signs: [{ role: 'Ответственный', hint: 'подпись / ФИО' }],
  },
];

type Props = { onNotice: (message: string) => void };

export default function PrintFormBuilder({ onNotice }: Props) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [draft, setDraft] = useState<Template | null>(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('');
  const [groupFilter, setGroupFilter] = useState<'all' | 'gost' | 'stock' | 'metrika' | 'custom'>('all');
  const [tab, setTab] = useState<TabId>('main');

  async function reload(selectId?: string) {
    const rows = await (window as any).api.listPrintTemplates();
    setTemplates(rows || []);
    const id = selectId || selectedId || rows?.[0]?.id;
    if (id) {
      setSelectedId(id);
      const found = (rows || []).find((t: Template) => t.id === id);
      setDraft(found ? JSON.parse(JSON.stringify(found)) : null);
    }
  }

  useEffect(() => { void reload(); }, []);

  const filtered = useMemo(() => {
    const q = filter.trim().toLocaleLowerCase();
    return templates.filter((t) => {
      const group = t.isSystem ? (t.group || 'gost') : 'custom';
      if (groupFilter !== 'all' && group !== groupFilter) return false;
      if (!q) return true;
      const hay = `${t.name} ${t.formCode || ''} ${t.okud || ''} ${t.hint || ''}`.toLocaleLowerCase();
      return hay.includes(q);
    });
  }, [templates, filter, groupFilter]);

  const grouped = useMemo(() => {
    const order = ['gost', 'stock', 'metrika', 'custom'];
    const map = new Map<string, Template[]>();
    for (const t of filtered) {
      const g = t.isSystem ? (t.group || 'gost') : 'custom';
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(t);
    }
    return order.filter((g) => map.has(g)).map((g) => ({ id: g, label: GROUP_LABEL[g] || g, items: map.get(g)! }));
  }, [filtered]);

  const counts = useMemo(() => {
    const c = { all: templates.length, gost: 0, stock: 0, metrika: 0, custom: 0 };
    for (const t of templates) {
      if (!t.isSystem) c.custom += 1;
      else if (t.group === 'stock') c.stock += 1;
      else if (t.group === 'metrika') c.metrika += 1;
      else c.gost += 1;
    }
    return c;
  }, [templates]);

  function select(id: string) {
    setSelectedId(id);
    setTab('main');
    const found = templates.find((t) => t.id === id);
    setDraft(found ? JSON.parse(JSON.stringify(found)) : null);
  }

  async function onClone() {
    if (!selectedId) return;
    setBusy(true);
    try {
      const copy = await (window as any).api.clonePrintTemplate(selectedId);
      onNotice(`Создана копия: ${copy.name}`);
      await reload(copy.id);
    } catch (e: any) {
      onNotice(e?.message || 'Не удалось клонировать');
    } finally { setBusy(false); }
  }

  async function onCreate() {
    setBusy(true);
    try {
      const blank = await (window as any).api.createPrintTemplate();
      onNotice('Создан пустой шаблон');
      await reload(blank.id);
    } catch (e: any) {
      onNotice(e?.message || 'Не удалось создать');
    } finally { setBusy(false); }
  }

  async function onSave() {
    if (!draft) return;
    if (draft.isSystem) {
      onNotice('Системный шаблон только для чтения — сделайте копию');
      return;
    }
    setBusy(true);
    try {
      const saved = await (window as any).api.savePrintTemplate(draft);
      onNotice(`Сохранено: ${saved.name}`);
      await reload(saved.id);
    } catch (e: any) {
      onNotice(e?.message || 'Не удалось сохранить');
    } finally { setBusy(false); }
  }

  async function onDelete() {
    if (!draft || draft.isSystem) return;
    if (!window.confirm(`Удалить форму «${draft.name}»?`)) return;
    setBusy(true);
    try {
      await (window as any).api.deletePrintTemplate(draft.id);
      onNotice('Шаблон удалён');
      setSelectedId('');
      setDraft(null);
      await reload();
    } catch (e: any) {
      onNotice(e?.message || 'Не удалось удалить');
    } finally { setBusy(false); }
  }

  function toggleKind(kind: string) {
    if (!draft || draft.isSystem) return;
    const kinds = new Set(draft.kinds || []);
    if (kinds.has(kind)) kinds.delete(kind);
    else kinds.add(kind);
    setDraft({ ...draft, kinds: [...kinds] });
  }

  function updateColumn(index: number, patch: Partial<Column>) {
    if (!draft || draft.isSystem) return;
    const columns = draft.columns.map((c, i) => (i === index ? { ...c, ...patch } : c));
    setDraft({ ...draft, columns });
  }

  function addColumn(fromKey?: string) {
    if (!draft || draft.isSystem) return;
    const catalog = COLUMN_KEYS.find((k) => k.key === fromKey);
    setDraft({
      ...draft,
      columns: [
        ...draft.columns,
        catalog
          ? { key: catalog.key, title: catalog.title, enabled: true }
          : { key: `col_${draft.columns.length + 1}`, title: 'Новая колонка', enabled: true },
      ],
    });
  }

  function removeColumn(index: number) {
    if (!draft || draft.isSystem || draft.columns.length <= 1) return;
    setDraft({ ...draft, columns: draft.columns.filter((_, i) => i !== index) });
  }

  function moveColumn(index: number, dir: -1 | 1) {
    if (!draft || draft.isSystem) return;
    const next = index + dir;
    if (next < 0 || next >= draft.columns.length) return;
    const columns = [...draft.columns];
    const tmp = columns[index];
    columns[index] = columns[next];
    columns[next] = tmp;
    setDraft({ ...draft, columns });
  }

  function applyPreset(presetId: string) {
    if (!draft || draft.isSystem) return;
    const preset = COLUMN_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setDraft({ ...draft, columns: preset.columns.map((c) => ({ ...c })) });
    onNotice(`Применён набор колонок: ${preset.label}`);
  }

  function applySignPreset(presetId: string) {
    if (!draft || draft.isSystem) return;
    const preset = SIGN_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setDraft({ ...draft, signs: preset.signs.map((s) => ({ ...s })) });
    onNotice(`Применены подписи: ${preset.label}`);
  }

  function updateSign(index: number, patch: Partial<Sign>) {
    if (!draft || draft.isSystem) return;
    const signs = draft.signs.map((s, i) => (i === index ? { ...s, ...patch } : s));
    setDraft({ ...draft, signs });
  }

  function addSign() {
    if (!draft || draft.isSystem) return;
    setDraft({ ...draft, signs: [...draft.signs, { role: 'Подпись', hint: 'подпись / ФИО' }] });
  }

  function removeSign(index: number) {
    if (!draft || draft.isSystem) return;
    setDraft({ ...draft, signs: draft.signs.filter((_, i) => i !== index) });
  }

  const readOnly = Boolean(draft?.isSystem);
  const enabledCols = (draft?.columns || []).filter((c) => c.enabled !== false).length;
  const totalsOn = draft?.showTotals !== false;
  const previewCols = (draft?.columns || []).filter((c) => c.enabled !== false).slice(0, 8);

  return (
    <div className="print-builder print-builder-1c">
      <div className="print-builder-cmdbar">
        <div className="print-builder-cmdbar-left">
          <span className="section-label">Печатные формы</span>
          <strong>{counts.all} шаблонов</strong>
        </div>
        <div className="print-builder-cmdbar-actions">
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void onCreate()}>Создать</button>
          <button type="button" className="btn btn-secondary" disabled={busy || !selectedId} onClick={() => void onClone()}>Копировать</button>
          {!readOnly && draft && (
            <>
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void onSave()}>Записать</button>
              <button type="button" className="btn btn-text" disabled={busy} onClick={() => void onDelete()}>Удалить</button>
            </>
          )}
        </div>
      </div>
      <p className="subtext" style={{ marginTop: 8 }}>
        Каталог унифицированных форм РФ и форм Метрики. Системные — только чтение; правки через «Копировать» → «Записать».
        Строка «Итого» и сводка сумм включаются для форм с ценой / количеством.
      </p>
      <div className="print-builder-layout">
        <aside className="print-builder-list card">
          <div className="print-builder-list-head">
            <input
              className="search-input"
              placeholder="Поиск: М-11, ТОРГ, ИНВ, цена…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            <div className="print-builder-filters">
              {([
                ['all', `Все`],
                ['gost', `ГОСТ`],
                ['stock', `Остатки`],
                ['metrika', `Метрика`],
                ['custom', `Свои`],
              ] as const).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={`filter-chip compact ${groupFilter === id ? 'active' : ''}`}
                  onClick={() => setGroupFilter(id)}
                >
                  {label}{id === 'all' ? ` (${counts.all})` : id === 'gost' ? ` (${counts.gost})` : id === 'stock' ? ` (${counts.stock})` : id === 'metrika' ? ` (${counts.metrika})` : ` (${counts.custom})`}
                </button>
              ))}
            </div>
          </div>
          <div className="print-builder-items">
            {grouped.map((g) => (
              <div key={g.id} className="print-builder-group">
                <div className="print-builder-group-title">{g.label}</div>
                {g.items.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={`print-builder-item${t.id === selectedId ? ' active' : ''}`}
                    onClick={() => select(t.id)}
                  >
                    <strong>{t.name}</strong>
                    <span>
                      {t.formCode || t.style}
                      {t.okud ? ` · ${t.okud}` : ''}
                      {t.showTotals !== false && (t.columns || []).some((c) => c.key === 'sum' || c.key === 'price') ? ' · итоги' : ''}
                    </span>
                  </button>
                ))}
              </div>
            ))}
            {!filtered.length && <div className="print-builder-empty">Ничего не найдено</div>}
          </div>
        </aside>

        <section className="card print-builder-editor">
          {!draft ? (
            <p className="subtext">Выберите форму слева или нажмите «Создать»</p>
          ) : (
            <>
              <div className="print-builder-editor-head">
                <div>
                  <div className="section-label">{readOnly ? 'Системный · только просмотр' : 'Свой шаблон'}</div>
                  <h2 style={{ margin: 0 }}>{draft.name}</h2>
                  {draft.hint && <p className="subtext" style={{ margin: '4px 0 0' }}>{draft.hint}</p>}
                </div>
              </div>

              <div className="print-builder-preview" aria-hidden>
                <div className="print-builder-preview-head">
                  <span>{draft.okud ? `ОКУД ${draft.okud}` : 'Без ОКУД'}{draft.formCode ? ` · ${draft.formCode}` : ''}</span>
                  <span>{draft.paper || 'A4'} {draft.landscape ? 'альбом' : 'портрет'} · {enabledCols} кол.</span>
                </div>
                <div className="print-builder-preview-title">{draft.titleOverride || draft.name}</div>
                <div className="print-builder-preview-table">
                  <div className="print-builder-preview-cols">
                    {previewCols.map((c) => (
                      <span key={c.key}>{c.title}</span>
                    ))}
                  </div>
                  {totalsOn && previewCols.some((c) => ['qty', 'sum', 'on_hand', 'available'].includes(c.key)) && (
                    <div className="print-builder-preview-total">
                      <span>Итого</span>
                      <span className="print-builder-preview-total-hint">суммы по количеству / сумме · сводка под таблицей</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="print-builder-tabs">
                {([
                  ['main', 'Основные'],
                  ['columns', 'Колонки'],
                  ['signs', 'Подписи'],
                  ['look', 'Оформление'],
                ] as const).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    className={`print-builder-tab ${tab === id ? 'active' : ''}`}
                    onClick={() => setTab(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {tab === 'main' && (
                <>
                  <div className="form-grid print-builder-props" style={{ marginTop: 12 }}>
                    <label className="field-wide">Название
                      <input disabled={readOnly} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                    </label>
                    <label className="field-wide">Подсказка
                      <input disabled={readOnly} value={draft.hint || ''} onChange={(e) => setDraft({ ...draft, hint: e.target.value })} placeholder="Когда использовать эту форму" />
                    </label>
                    <label>Код формы
                      <input disabled={readOnly} value={draft.formCode || ''} onChange={(e) => setDraft({ ...draft, formCode: e.target.value })} placeholder="М-11" />
                    </label>
                    <label>ОКУД
                      <input disabled={readOnly} value={draft.okud || ''} onChange={(e) => setDraft({ ...draft, okud: e.target.value })} placeholder="0315006" />
                    </label>
                    <label>Стиль
                      <select disabled={readOnly} value={draft.style} onChange={(e) => setDraft({ ...draft, style: e.target.value })}>
                        {STYLE_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                      </select>
                    </label>
                    <label>Заголовок (если свой)
                      <input disabled={readOnly} value={draft.titleOverride || ''} onChange={(e) => setDraft({ ...draft, titleOverride: e.target.value })} placeholder="Оставить из документа" />
                    </label>
                    <label>Бумага
                      <select disabled={readOnly} value={draft.paper || 'A4'} onChange={(e) => setDraft({ ...draft, paper: e.target.value as 'A4' | 'A5' })}>
                        <option value="A4">A4</option>
                        <option value="A5">A5</option>
                      </select>
                    </label>
                    <label className="settings-check">
                      <input type="checkbox" disabled={readOnly} checked={Boolean(draft.landscape)} onChange={(e) => setDraft({ ...draft, landscape: e.target.checked })} />
                      Альбомная ориентация
                    </label>
                    <label className="settings-check">
                      <input type="checkbox" disabled={readOnly} checked={draft.showOrg !== false} onChange={(e) => setDraft({ ...draft, showOrg: e.target.checked })} />
                      Блок организации
                    </label>
                    <label className="settings-check">
                      <input type="checkbox" disabled={readOnly} checked={draft.showRowNumbers !== false} onChange={(e) => setDraft({ ...draft, showRowNumbers: e.target.checked })} />
                      Нумерация строк
                    </label>
                    <label className="settings-check">
                      <input type="checkbox" disabled={readOnly} checked={totalsOn} onChange={(e) => setDraft({ ...draft, showTotals: e.target.checked })} />
                      Итоги внизу таблицы
                    </label>
                  </div>
                  <div className="section-label" style={{ marginTop: 16 }}>Виды документов</div>
                  <p className="subtext" style={{ marginTop: 0 }}>Пустой список = форма доступна для всех видов.</p>
                  <div className="settings-check-grid">
                    {KIND_OPTIONS.map((k) => (
                      <label key={k.id} className="settings-check">
                        <input
                          type="checkbox"
                          disabled={readOnly}
                          checked={(draft.kinds || []).includes(k.id)}
                          onChange={() => toggleKind(k.id)}
                        />
                        {k.label}
                      </label>
                    ))}
                  </div>
                </>
              )}

              {tab === 'columns' && (
                <>
                  <div className="table-header" style={{ marginTop: 12 }}>
                    <div className="section-label">Колонки таблицы · {enabledCols} вкл.</div>
                    <div className="table-actions" style={{ flexWrap: 'wrap' }}>
                      {!readOnly && (
                        <>
                          <select
                            defaultValue=""
                            onChange={(e) => {
                              if (e.target.value) applyPreset(e.target.value);
                              e.target.value = '';
                            }}
                            style={{ maxWidth: 200 }}
                          >
                            <option value="">Пресет колонок…</option>
                            {COLUMN_PRESETS.map((p) => (
                              <option key={p.id} value={p.id}>{p.label}</option>
                            ))}
                          </select>
                          <select
                            defaultValue=""
                            onChange={(e) => {
                              if (e.target.value) addColumn(e.target.value);
                              e.target.value = '';
                            }}
                            style={{ maxWidth: 180 }}
                          >
                            <option value="">+ из каталога…</option>
                            {COLUMN_KEYS.map((k) => (
                              <option key={k.key} value={k.key}>{k.title} ({k.key})</option>
                            ))}
                          </select>
                          <button type="button" className="btn btn-text" onClick={() => addColumn()}>+ своя</button>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="table-scroll" style={{ maxHeight: 360 }}>
                    <table>
                      <thead>
                        <tr>
                          <th></th>
                          <th>Ключ</th>
                          <th>Заголовок</th>
                          <th>Ширина</th>
                          <th>Выравнивание</th>
                          {!readOnly && <th />}
                        </tr>
                      </thead>
                      <tbody>
                        {draft.columns.map((col, index) => (
                          <tr key={`${col.key}-${index}`}>
                            <td>
                              <input
                                type="checkbox"
                                disabled={readOnly}
                                checked={col.enabled !== false}
                                onChange={(e) => updateColumn(index, { enabled: e.target.checked })}
                              />
                            </td>
                            <td>
                              <select
                                disabled={readOnly}
                                value={COLUMN_KEYS.some((k) => k.key === col.key) ? col.key : ''}
                                onChange={(e) => {
                                  const k = COLUMN_KEYS.find((x) => x.key === e.target.value);
                                  if (k) updateColumn(index, { key: k.key, title: col.title || k.title });
                                }}
                                style={{ width: 120 }}
                              >
                                <option value="">свой ключ</option>
                                {COLUMN_KEYS.map((k) => (
                                  <option key={k.key} value={k.key}>{k.key}</option>
                                ))}
                              </select>
                              {!COLUMN_KEYS.some((k) => k.key === col.key) && (
                                <input disabled={readOnly} value={col.key} style={{ width: 100, marginTop: 4 }} onChange={(e) => updateColumn(index, { key: e.target.value })} />
                              )}
                            </td>
                            <td>
                              <input disabled={readOnly} value={col.title} onChange={(e) => updateColumn(index, { title: e.target.value })} />
                            </td>
                            <td>
                              <input
                                disabled={readOnly}
                                value={col.width || ''}
                                placeholder="18mm"
                                style={{ width: 72 }}
                                onChange={(e) => updateColumn(index, { width: e.target.value })}
                              />
                            </td>
                            <td>
                              <select disabled={readOnly} value={col.align || 'left'} onChange={(e) => updateColumn(index, { align: e.target.value })}>
                                <option value="left">влево</option>
                                <option value="center">центр</option>
                                <option value="right">вправо</option>
                              </select>
                            </td>
                            {!readOnly && (
                              <td style={{ whiteSpace: 'nowrap' }}>
                                <button type="button" className="btn btn-text" onClick={() => moveColumn(index, -1)} title="Выше">↑</button>
                                <button type="button" className="btn btn-text" onClick={() => moveColumn(index, 1)} title="Ниже">↓</button>
                                <button type="button" className="btn btn-text" onClick={() => removeColumn(index)} title="Удалить">×</button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="subtext">Колонки <code>qty</code>, <code>sum</code>, <code>on_hand</code>, <code>available</code> входят в строку «Итого», если включены итоги.</p>
                </>
              )}

              {tab === 'signs' && (
                <>
                  <div className="table-header" style={{ marginTop: 12 }}>
                    <div className="section-label">Подписи</div>
                    <div className="table-actions">
                      {!readOnly && (
                        <>
                          <select
                            defaultValue=""
                            onChange={(e) => {
                              if (e.target.value) applySignPreset(e.target.value);
                              e.target.value = '';
                            }}
                          >
                            <option value="">Пресет подписей…</option>
                            {SIGN_PRESETS.map((p) => (
                              <option key={p.id} value={p.id}>{p.label}</option>
                            ))}
                          </select>
                          <button type="button" className="btn btn-text" onClick={addSign}>+ подпись</button>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="form-grid">
                    {draft.signs.map((sign, index) => (
                      <label key={index} className="print-builder-sign">
                        Роль
                        <input disabled={readOnly} value={sign.role} onChange={(e) => updateSign(index, { role: e.target.value })} />
                        <input disabled={readOnly} value={sign.hint || ''} placeholder="подсказка" onChange={(e) => updateSign(index, { hint: e.target.value })} style={{ marginTop: 6 }} />
                        {!readOnly && (
                          <button type="button" className="btn btn-text" style={{ marginTop: 4 }} onClick={() => removeSign(index)}>Убрать</button>
                        )}
                      </label>
                    ))}
                    {!draft.signs.length && <p className="subtext">Без блока подписей</p>}
                  </div>
                </>
              )}

              {tab === 'look' && (
                <>
                  <label className="field-wide" style={{ marginTop: 12, display: 'grid', gap: 6 }}>
                    Примечание внизу формы
                    <input disabled={readOnly} value={draft.footerNote || ''} onChange={(e) => setDraft({ ...draft, footerNote: e.target.value })} />
                  </label>
                  <label className="field-wide" style={{ marginTop: 12, display: 'grid', gap: 6 }}>
                    Доп. CSS
                    <textarea
                      disabled={readOnly}
                      rows={8}
                      value={draft.customCss || ''}
                      onChange={(e) => setDraft({ ...draft, customCss: e.target.value })}
                      placeholder={'.gost-title { font-size: 16pt; }\n.gost-table td { font-size: 9pt; }\n.gost-totals-bar { font-size: 10pt; }'}
                    />
                  </label>
                  <p className="subtext">
                    Классы: <code>.gost-page</code>, <code>.gost-title</code>, <code>.gost-table</code>, <code>.gost-totals-bar</code>, <code>.gost-signs</code>, <code>.gost-meta</code>.
                  </p>
                </>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
