import { useEffect, useRef, useState } from 'react';
import { can } from '../permissions';
import { useCurrency } from '../currency';
import FloatingWidget from './FloatingWidget';
import PrintJobDialog, { type PrintFormChoice, type PrintJobResult } from './PrintJobDialog';

type Props = {
  refreshToken: number;
  onCreate: () => void;
  onEdit: (item: any) => void;
  onImported: (message: string) => void;
  importTrigger?: number;
  session?: any;
};
type Filter = 'all' | 'stock' | 'low' | 'over' | 'empty' | 'new';

export default function ItemsTable({ refreshToken, onCreate, onEdit, onImported, importTrigger = 0, session }: Props) {
  const { symbol } = useCurrency();
  const [items, setItems] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [history, setHistory] = useState<any[]>([]);
  const [error, setError] = useState('');
  const tableScrollRef = useRef<HTMLDivElement | null>(null);
  const topScrollRef = useRef<HTMLDivElement | null>(null);
  const [tableWidth, setTableWidth] = useState(0);
  const [tableOverflow, setTableOverflow] = useState(false);
  const [csvPreview, setCsvPreview] = useState<any | null>(null);
  const [csvError, setCsvError] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [printOpen, setPrintOpen] = useState(false);
  const [printForms, setPrintForms] = useState<PrintFormChoice[]>([]);
  const [printBusy, setPrintBusy] = useState(false);
  const [savedViews, setSavedViews] = useState<any[]>([]);
  const [viewName, setViewName] = useState('');
  const [activeViewId, setActiveViewId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkForm, setBulkForm] = useState({ category: '', brand: '', min_stock: '', max_stock: '', reorder_point: '' });
  const [bulkBusy, setBulkBusy] = useState(false);
  const [customFields, setCustomFields] = useState<any[]>([]);
  const [cfKey, setCfKey] = useState('');
  const [cfMode, setCfMode] = useState<'eq' | 'contains' | 'filled' | 'empty' | 'gt' | 'lt'>('eq');
  const [cfValue, setCfValue] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 220);
    return () => window.clearTimeout(timer);
  }, [search]);

  async function reloadViews() {
    try {
      setSavedViews((await (window as any).api.listSavedListViews?.('items')) || []);
    } catch {
      setSavedViews([]);
    }
  }

  async function load() {
    try {
      const query = debouncedSearch.trim();
      const isSpecial = query.startsWith('#') || query.startsWith('@') || query.startsWith('!')
        || query.startsWith('<') || query.startsWith('=') || query.startsWith('~');

      const [data, categoryData, fieldDefs] = await Promise.all([
        (window as any).api.getItems(query && !isSpecial ? query : undefined),
        (window as any).api.getCategories(),
        (window as any).api.listCustomFields?.() || [],
      ]);
      setCategories(categoryData || []);
      setCustomFields(Array.isArray(fieldDefs) ? fieldDefs : []);
      let next = data;
      const hasBarcode = (item: any, q: string) => (item.barcodes || [item.barcode]).some((code: string) => code && String(code).toLowerCase().includes(q.toLowerCase()));
      if (query.startsWith('#')) next = next.filter((item: any) => hasBarcode(item, query.slice(1)));
      else if (query.startsWith('@')) next = next.filter((item: any) => item.name.toLowerCase().includes(query.slice(1).toLowerCase()));
      else if (query.startsWith('!')) next = next.filter((item: any) => (item.category || '').toLowerCase().includes(query.slice(1).toLowerCase()));
      else if (query.startsWith('<')) next = next.filter((item: any) => Number(item.available ?? item.total_qty) < Number(query.slice(1)));
      else if (query.startsWith('~')) {

        const body = query.slice(1).trim();
        const emptyMatch = body.match(/^([^=!\s]+)\s*!=\s*$/);
        const eqMatch = body.match(/^([^=!\s]+)\s*=\s*(.*)$/);
        let fieldKey = '';
        let mode: 'eq' | 'filled' | 'empty' | 'contains' = 'filled';
        let value = '';
        if (emptyMatch) {
          fieldKey = emptyMatch[1];
          mode = 'empty';
        } else if (eqMatch) {
          fieldKey = eqMatch[1];
          value = eqMatch[2].trim();
          mode = value ? 'eq' : 'filled';
        } else {
          fieldKey = body;
          mode = 'filled';
        }
        if (fieldKey) {
          const result = await (window as any).api.idsByCustomField({ fieldKey, value, mode });
          const ids = new Set((result?.ids || []).map(Number));
          next = next.filter((item: any) => ids.has(Number(item.id)));
          setCfKey(fieldKey);
          setCfMode(mode);
          setCfValue(value);
        }
      } else if (query && !query.startsWith('=')) {
        next = next.filter((item: any) => hasBarcode(item, query) || item.name.toLowerCase().includes(query.toLowerCase()) || String(item.sku || '').toLowerCase().includes(query.toLowerCase()) || String(item.brand || '').toLowerCase().includes(query.toLowerCase()));
      }
      if (query.startsWith('=')) {
        const locations = (await (window as any).api.getLocations()) || [];
        const location = locations.find((entry: any) => entry.name.toLowerCase().includes(query.slice(1).toLowerCase()) || entry.barcode.toLowerCase().includes(query.slice(1).toLowerCase()));
        const contents = location ? await (window as any).api.getLocationContents(location.id) : [];
        const ids = new Set(contents.map((entry: any) => entry.id));
        next = next.filter((item: any) => ids.has(item.id));
      }

      if (!query.startsWith('~') && cfKey) {
        const result = await (window as any).api.idsByCustomField({ fieldKey: cfKey, value: cfValue, mode: cfMode });
        const ids = new Set((result?.ids || []).map(Number));
        next = next.filter((item: any) => ids.has(Number(item.id)));
      }
      if (filter === 'stock') next = next.filter((item: any) => Number(item.available ?? item.total_qty) > 0);
      if (filter === 'low') next = next.filter((item: any) => Number(item.available ?? item.total_qty) <= item.min_stock);
      if (filter === 'over') next = next.filter((item: any) => item.max_stock != null && Number(item.max_stock) > 0 && Number(item.available ?? item.total_qty) > Number(item.max_stock));
      if (filter === 'empty') next = next.filter((item: any) => Number(item.on_hand ?? item.total_qty) === 0);
      if (filter === 'new') next = next.filter((item: any) => Date.now() - new Date(item.created_at).getTime() < 7 * 24 * 60 * 60 * 1000);
      setItems(next);
      setSelectedIds(new Set());
      setError('');
    } catch (e: any) {
      setError(e?.message || 'Не удалось загрузить товары');
    }
  }
  async function reloadHistory() {
    try {
      setHistory((await (window as any).api.getSearchHistory()) || []);
    } catch {
      setHistory([]);
    }
  }

  useEffect(() => { void load(); }, [debouncedSearch, filter, refreshToken, cfKey, cfMode, cfValue]);
  useEffect(() => { void reloadHistory(); }, [refreshToken]);
  useEffect(() => { void reloadViews(); }, [refreshToken]);

  function applyView(row: any) {
    try {
      const params = typeof row.params_json === 'string' ? JSON.parse(row.params_json || '{}') : (row.params || {});
      setSearch(String(params.search || ''));
      const nextFilter = String(params.filter || 'all') as Filter;
      setFilter(['all', 'stock', 'low', 'over', 'empty', 'new'].includes(nextFilter) ? nextFilter : 'all');
      setCfKey(String(params.cfKey || ''));
      const mode = String(params.cfMode || 'eq');
      setCfMode((['eq', 'contains', 'filled', 'empty', 'gt', 'lt'].includes(mode) ? mode : 'eq') as typeof cfMode);
      setCfValue(String(params.cfValue || ''));
      setActiveViewId(Number(row.id) || null);
    } catch {
      setError('Не удалось применить представление');
    }
  }

  async function saveCurrentView() {
    const name = viewName.trim()
      || (cfKey ? `Поле: ${cfKey}` : null)
      || (search.trim() ? `Поиск: ${search.trim()}` : `Фильтр: ${filter}`);
    try {
      await (window as any).api.saveListView({
        name,
        list_key: 'items',
        params: { search, filter, cfKey, cfMode, cfValue },
      });
      setViewName('');
      await reloadViews();
      onImported(`Представление «${name}» сохранено`);
    } catch (e: any) {
      setError(e?.message || 'Не удалось сохранить представление');
    }
  }

  async function removeView(id: number) {
    try {
      await (window as any).api.deleteSavedListView(id);
      if (activeViewId === id) setActiveViewId(null);
      await reloadViews();
    } catch (e: any) {
      setError(e?.message || 'Не удалось удалить представление');
    }
  }
  useEffect(() => {
    const viewport = tableScrollRef.current;
    const table = viewport?.querySelector('table');
    if (!viewport || !table) return;
    const measure = () => {
      setTableWidth(table.scrollWidth);
      setTableOverflow(table.scrollWidth > viewport.clientWidth);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(table);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [items]);

  const categoryColors = new Map(categories.map((category: any) => [category.name, category.color]));
  const categoryByName = new Map(categories.map((category: any) => [category.name, category]));
  const categoryById = new Map(categories.map((category: any) => [category.id, category]));
  function categoryLeaf(name?: string | null) {
    if (!name) return '';

    const viaSep = String(name).split(/\s*[>/|·]\s*/).filter(Boolean);
    if (viaSep.length > 1) return viaSep[viaSep.length - 1];
    return name;
  }
  function categoryPath(name?: string | null) {
    if (!name) return '';
    const start = categoryByName.get(name);
    if (!start) return name;
    const parts: string[] = [];
    let cur: any = start;
    const guard = new Set<number>();
    while (cur && !guard.has(cur.id)) {
      guard.add(cur.id);
      parts.unshift(cur.name);
      cur = cur.parent_id != null ? categoryById.get(cur.parent_id) : null;
    }
    return parts.join(' / ');
  }
  function syncScroll(source: HTMLDivElement | null, target: HTMLDivElement | null) {
    if (source && target && target.scrollLeft !== source.scrollLeft) target.scrollLeft = source.scrollLeft;
  }

  async function saveSearch(event: React.KeyboardEvent<HTMLInputElement>) { if (event.key === 'Enter' && search.trim()) { await (window as any).api.addSearch(search); setHistory(await (window as any).api.getSearchHistory()); } }
  async function openCsvImport() {
    try { setCsvError(''); const result = await (window as any).api.previewItemsCsv(); if (result) setCsvPreview(result); }
    catch (previewError: any) { setError(previewError?.message || 'Не удалось прочитать CSV'); }
  }
  useEffect(() => {
    if (importTrigger > 0) void openCsvImport();
  }, [importTrigger]);
  async function applyCsvImport() {
    if (!csvPreview) return;
    try {
      const result = await (window as any).api.importItemsCsv(csvPreview.rows);
      setCsvPreview(null);
      await load();
      onImported(`Импорт CSV: добавлено ${result.imported}, пропущено ${result.skipped}, ошибок ${result.errors.length}`);
      if (result.errors.length) setError(result.errors.slice(0, 4).join(' · '));
    } catch (importError: any) { setCsvError(importError?.message || 'Не удалось импортировать CSV'); }
  }
  async function exportItemsExcel() {
    const file = await (window as any).api.exportExcel(items, 'metrika-items');
    if (file) onImported(`Excel сохранён: ${file}`);
  }
  async function openStockPrint() {
    setPrintBusy(true);
    try {
      const templates = (await (window as any).api.listPrintTemplates?.()) || [];
      const stock = (templates as any[])
        .filter((t) => !t.kinds?.length || t.kinds.includes('stock') || t.kinds.includes('*'))
        .map((t) => ({
          id: t.id,
          label: t.name,
          hint: t.hint || t.formCode || '',
          isDefault: t.id === 'sys-stock-compact',
        }));
      setPrintForms(stock.length ? stock : [{ id: 'sys-stock', label: 'Ведомость остатков', isDefault: true }]);
      setPrintOpen(true);
    } catch (e: any) {
      setError(e?.message || 'Не удалось загрузить формы печати');
    } finally {
      setPrintBusy(false);
    }
  }

  async function confirmStockPrint(job: PrintJobResult) {
    setPrintBusy(true);
    try {
      const ids = items.map((item: any) => item.id);
      const result = await (window as any).api.printStockReport(ids.length ? ids : 'all', {
        templateId: job.formId,
        destination: job.destination,
        deviceName: job.deviceName,
        copies: job.copies,
      });
      if (result === null) onImported('Печать отменена');
      else if (result?.path) onImported(`PDF сохранён: ${result.path}`);
      else if (result?.destination === 'printer') onImported(`Отправлено на принтер: ${result.deviceName || ''}`);
      else onImported('Отчет остатков сформирован');
      setPrintOpen(false);
    } catch (e: any) {
      setError(e?.message || 'Не удалось напечатать остатки');
    } finally {
      setPrintBusy(false);
    }
  }

  return <>
    <section className="table-wrap">
      <div className="table-header">
        <div><div className="section-label">Каталог</div><h1>Товары</h1></div>
        <div className="table-actions">
          <input className="search-input" placeholder="#код, @название, !категория, =ячейка, <10, ~поле=знач" value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={saveSearch} />
          <button className="btn btn-secondary" onClick={exportItemsExcel}>Экспорт Excel</button>
          <button className="btn btn-secondary" onClick={() => void openStockPrint()} disabled={!items.length || printBusy}>Печать остатков</button>
          {can(session, 'items_edit') && selectedIds.size > 0 && (
            <button className="btn btn-secondary" onClick={() => setBulkOpen(true)}>Изменить ({selectedIds.size})</button>
          )}
          {can(session, 'items_edit') && <button className="btn btn-secondary" onClick={openCsvImport}>Импорт CSV</button>}
          {can(session, 'items_create') && <button className="btn btn-primary" onClick={onCreate}>Новый товар</button>}
        </div>
      </div>
      <div className="filter-row">{([['all', 'Все'], ['stock', 'В наличии'], ['low', 'Заканчиваются'], ['over', 'Выше максимума'], ['empty', 'Нет в ящиках'], ['new', 'Новые за неделю']] as [Filter, string][]).map(([value, label]) => <button key={value} className={`filter-chip ${filter === value ? 'active' : ''}`} onClick={() => { setFilter(value); setActiveViewId(null); }}>{label}</button>)}</div>
      {customFields.length > 0 && (
        <div className="filter-row" style={{ marginTop: 8, flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <span className="subtext">Доп. поле</span>
          <select
            value={cfKey}
            onChange={(e) => { setCfKey(e.target.value); setActiveViewId(null); if (!e.target.value) setCfValue(''); }}
            style={{ maxWidth: 180 }}
          >
            <option value="">Не выбрано</option>
            {customFields.map((field) => (
              <option key={field.id} value={field.field_key}>{field.label}</option>
            ))}
          </select>
          <select
            value={cfMode}
            onChange={(e) => { setCfMode(e.target.value as typeof cfMode); setActiveViewId(null); }}
            disabled={!cfKey}
            style={{ maxWidth: 140 }}
          >
            <option value="eq">равно</option>
            <option value="contains">содержит</option>
            <option value="filled">заполнено</option>
            <option value="empty">пусто</option>
            <option value="gt">&gt; числа</option>
            <option value="lt">&lt; числа</option>
          </select>
          {cfKey && cfMode !== 'filled' && cfMode !== 'empty' && (() => {
            const field = customFields.find((f) => f.field_key === cfKey);
            let options: string[] = [];
            try { options = JSON.parse(field?.options_json || '[]'); } catch { options = []; }
            if (field?.field_type === 'select' && options.length) {
              return (
                <select value={cfValue} onChange={(e) => { setCfValue(e.target.value); setActiveViewId(null); }} style={{ maxWidth: 160 }}>
                  <option value="">—</option>
                  {options.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              );
            }
            if (field?.field_type === 'bool') {
              return (
                <select value={cfValue} onChange={(e) => { setCfValue(e.target.value); setActiveViewId(null); }} style={{ maxWidth: 120 }}>
                  <option value="1">да</option>
                  <option value="0">нет</option>
                </select>
              );
            }
            return (
              <input
                className="search-input"
                style={{ maxWidth: 160 }}
                value={cfValue}
                onChange={(e) => { setCfValue(e.target.value); setActiveViewId(null); }}
                placeholder={cfMode === 'gt' || cfMode === 'lt' ? 'число' : 'значение'}
              />
            );
          })()}
          {cfKey && (
            <button
              type="button"
              className="btn btn-text"
              onClick={() => { setCfKey(''); setCfValue(''); setCfMode('eq'); setActiveViewId(null); }}
            >
              Сбросить поле
            </button>
          )}
        </div>
      )}
      <div className="filter-row" style={{ marginTop: 8, flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <span className="subtext">Представления</span>
        <input
          className="search-input"
          style={{ maxWidth: 200 }}
          value={viewName}
          onChange={(e) => setViewName(e.target.value)}
          placeholder="Название среза…"
          onKeyDown={(e) => { if (e.key === 'Enter') void saveCurrentView(); }}
        />
        <button type="button" className="btn btn-secondary" onClick={() => void saveCurrentView()}>Сохранить текущий</button>
        {savedViews.map((row) => (
          <span key={row.id} className={`filter-chip ${activeViewId === row.id ? 'active' : ''}`} style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
            <button type="button" className="btn btn-text" style={{ padding: 0 }} onClick={() => applyView(row)}>{row.name}</button>
            <button type="button" className="btn btn-text" style={{ padding: 0 }} title="Удалить" onClick={() => void removeView(row.id)}>×</button>
          </span>
        ))}
      </div>
      {(history.length > 0 || search) && (
        <div className="search-history">
          <span>Последние запросы</span>
          {history.map((entry: any) => (
            <button key={entry.query} className="history-chip" onClick={() => setSearch(entry.query)}>{entry.query}</button>
          ))}
          <button
            type="button"
            className="btn btn-secondary"
            onClick={async () => {
              try {
                await (window as any).api.clearSearchHistory();
                setHistory([]);
                setSearch('');
                onImported('История поиска очищена');
              } catch (clearError: any) {
                setError(clearError?.message || 'Не удалось очистить историю поиска');
              }
            }}
          >
            Очистить запросы
          </button>
        </div>
      )}
      {error && <div className="form-error page-error">{error}</div>}
      {items.length === 0 ? <div className="empty"><h3>Товары не найдены</h3><p>Измените фильтр или добавьте товар.</p>{can(session, 'items_create') && <button className="btn btn-primary" onClick={onCreate}>Добавить товар</button>}</div> : <>
        <div className="items-scroll-top" ref={topScrollRef} onScroll={(event) => syncScroll(event.currentTarget, tableScrollRef.current)} style={{ visibility: tableOverflow ? 'visible' : 'hidden' }}><div style={{ width: tableWidth }} /></div>
        <div className="table-scroll" ref={tableScrollRef} onScroll={(event) => syncScroll(event.currentTarget, topScrollRef.current)}>
          <table className="items-table"><thead><tr>
            {can(session, 'items_edit') && (
              <th style={{ width: 36 }}>
                <input
                  type="checkbox"
                  title="Выбрать все на экране"
                  checked={items.length > 0 && items.every((i) => selectedIds.has(i.id))}
                  onChange={(e) => {
                    e.stopPropagation();
                    if (e.target.checked) setSelectedIds(new Set(items.map((i) => i.id)));
                    else setSelectedIds(new Set());
                  }}
                />
              </th>
            )}
            <th>Штрихкод</th><th>Название</th><th>Артикул</th><th>Категория</th><th>Ед.</th><th>Цена</th><th>Остаток</th><th>Ячейка</th><th>Мин.</th>
          </tr></thead>
            <tbody>{items.map((item: any) => {
              const barcodesList = (item.barcodes || [item.barcode]).filter(Boolean);
              const onHand = Number(item.on_hand ?? item.total_qty ?? 0);
              const reserved = Number(item.reserved || 0);
              const available = Number(item.available ?? Math.max(0, onHand - reserved));
              const unit = item.unit_symbol || 'шт.';
              const thumb = item.photo_url || (item.has_photo ? `metrika-photo://${item.id}` : '');
              const catPath = categoryPath(item.category);
              const catLeaf = categoryLeaf(item.category);
              const places = String(item.places_label || '').trim();
              return (
                <tr key={item.id} className="clickable-row" onClick={() => onEdit(item)} onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onEdit(item); } }} tabIndex={0}>
                  {can(session, 'items_edit') && (
                    <td onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(item.id)}
                        onChange={(e) => {
                          setSelectedIds((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(item.id);
                            else next.delete(item.id);
                            return next;
                          });
                        }}
                      />
                    </td>
                  )}
                  <td className="mono item-barcode-cell" title={barcodesList.join(', ')}>
                    {barcodesList.length > 0
                      ? <span>{barcodesList[0]}{barcodesList.length > 1 ? ` +${barcodesList.length - 1}` : ''}</span>
                      : <span className="item-unknown-status">Нет кода</span>}
                  </td>
                  <td className="strong item-name-cell" title={item.name}>
                    <span className="item-primary-cell">
                      {thumb ? <img className="item-photo-thumb" src={thumb} alt="" loading="lazy" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} /> : <span className="item-photo-empty" aria-hidden="true">Фото</span>}
                      <span>
                        {item.parent_item_id ? <span className="subtext" style={{ marginRight: 6 }}>↳</span> : null}
                        {item.name}
                        {item.variant_label ? <div className="subtext">вариант: {item.variant_label}</div> : null}
                      </span>
                    </span>
                  </td>
                  <td className="item-sku-cell" title={item.sku || ''}>{item.sku || '—'}</td>
                  <td className="item-category-cell">
                    {catLeaf
                      ? <span className="category-tag" style={{ backgroundColor: categoryColors.get(item.category) || '#64748b' }} title={catPath || catLeaf}>{catLeaf}</span>
                      : <span className="subtext">—</span>}
                  </td>
                  <td>{unit}</td>
                  <td>{item.sale_price == null ? '—' : (
                    item.price_basis === 'package' && Number(item.package_qty) > 1
                      ? <span title={`${Number(item.unit_sale_price).toLocaleString('ru-RU', { maximumFractionDigits: 4 })} ${symbol}/${unit}`}>{Number(item.sale_price).toLocaleString('ru-RU')} {symbol}/уп.</span>
                      : `${Number(item.sale_price).toLocaleString('ru-RU')} ${symbol}`
                  )}</td>
                  <td>
                    <span
                      className={`qty-badge ${available <= Number(item.min_stock || 0) ? 'low' : 'ok'}`}
                      title={reserved > 0 ? `физ. ${onHand} · рез. ${reserved} · в карточке` : undefined}
                    >
                      {available} {unit}
                    </span>
                  </td>
                  <td className="item-places-cell" title={places || undefined}>{places || '—'}</td>
                  <td>{item.min_stock ?? 0}</td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      </>}
    </section>
    {csvPreview && (
      <FloatingWidget title="Импорт товаров CSV" open onClose={() => setCsvPreview(null)} width={720} zIndex={1740}>
        <p className="subtext" style={{ marginTop: 0 }}>Совпадающие штрихкоды не изменяются и будут пропущены.</p>
        <div className="csv-import-summary"><strong>{csvPreview.total} строк</strong><span>Лимит файла: 5000 новых записей за импорт</span></div>
        {csvPreview.parseErrors?.length > 0 && <div className="form-error">{csvPreview.parseErrors.join(' · ')}</div>}
        {csvPreview.truncated && <div className="form-error">Файл превышает лимит; обработаны первые 5000 строк.</div>}
        <div className="table-scroll"><table><thead><tr><th>Штрихкод</th><th>Название</th><th>Артикул</th><th>Категория</th><th>Кол-во</th></tr></thead><tbody>{csvPreview.rows.slice(0, 8).map((row: any, index: number) => <tr key={`${row.barcode}-${index}`}><td>{row.barcode || '—'}</td><td>{row.name}</td><td>{row.sku || '—'}</td><td>{row.category || '—'}</td><td>{row.quantity || 0}</td></tr>)}</tbody></table></div>
        {csvError && <div className="form-error">{csvError}</div>}
        <div className="modal-actions"><button className="btn btn-text" onClick={() => setCsvPreview(null)}>Отмена</button><button className="btn btn-primary" onClick={applyCsvImport} disabled={!csvPreview.rows.length}>Импортировать новые товары</button></div>
      </FloatingWidget>
    )}
    <PrintJobDialog
      open={printOpen}
      title="Печать остатков"
      forms={printForms}
      defaultFormId={printForms.find((f) => f.isDefault)?.id || printForms[0]?.id}
      busy={printBusy}
      onClose={() => setPrintOpen(false)}
      onSubmit={confirmStockPrint}
    />
    {bulkOpen && (
      <FloatingWidget title={`Массовое изменение · ${selectedIds.size} поз.`} open onClose={() => setBulkOpen(false)} width={480} zIndex={1750}>
        <p className="subtext" style={{ marginTop: 0 }}>Заполните только те поля, которые нужно перезаписать. Пустое поле не меняется (кроме очистки бренда/категории — выберите «— очистить —»).</p>
        <div className="form-grid">
          <label>Категория
            <select value={bulkForm.category} onChange={(e) => setBulkForm((f) => ({ ...f, category: e.target.value }))}>
              <option value="">Не менять</option>
              <option value="__clear__">— очистить —</option>
              {categories.map((c: any) => (
                <option key={c.id || c.name} value={c.name}>{c.name}</option>
              ))}
            </select>
          </label>
          <label>Бренд
            <input
              value={bulkForm.brand}
              onChange={(e) => setBulkForm((f) => ({ ...f, brand: e.target.value }))}
              placeholder="Не менять"
            />
          </label>
          <label>Минимум
            <input type="number" min={0} value={bulkForm.min_stock} onChange={(e) => setBulkForm((f) => ({ ...f, min_stock: e.target.value }))} placeholder="Не менять" />
          </label>
          <label>Максимум
            <input type="number" min={0} value={bulkForm.max_stock} onChange={(e) => setBulkForm((f) => ({ ...f, max_stock: e.target.value }))} placeholder="Не менять" />
          </label>
          <label>Точка заказа
            <input type="number" min={0} value={bulkForm.reorder_point} onChange={(e) => setBulkForm((f) => ({ ...f, reorder_point: e.target.value }))} placeholder="Не менять" />
          </label>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-text" onClick={() => setBulkOpen(false)}>Отмена</button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={bulkBusy}
            onClick={async () => {
              const patch: any = {};
              if (bulkForm.category === '__clear__') patch.category = '';
              else if (bulkForm.category) patch.category = bulkForm.category;
              if (bulkForm.brand.trim() === '__clear__') patch.brand = '';
              else if (bulkForm.brand.trim()) patch.brand = bulkForm.brand.trim();
              if (bulkForm.min_stock !== '') patch.min_stock = bulkForm.min_stock;
              if (bulkForm.max_stock !== '') patch.max_stock = bulkForm.max_stock;
              if (bulkForm.reorder_point !== '') patch.reorder_point = bulkForm.reorder_point;
              if (!Object.keys(patch).length) {
                setError('Укажите хотя бы одно поле');
                return;
              }
              setBulkBusy(true);
              try {
                const result = await (window as any).api.bulkUpdateItems([...selectedIds], patch);
                onImported(`Изменено позиций: ${result.updated}`);
                setBulkOpen(false);
                setBulkForm({ category: '', brand: '', min_stock: '', max_stock: '', reorder_point: '' });
                setSelectedIds(new Set());
                await load();
              } catch (e: any) {
                setError(e?.message || 'Не удалось изменить');
              } finally {
                setBulkBusy(false);
              }
            }}
          >
            Применить
          </button>
        </div>
      </FloatingWidget>
    )}
  </>;
}