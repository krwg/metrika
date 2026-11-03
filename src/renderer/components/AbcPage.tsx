import { useEffect, useMemo, useState } from 'react';
import DateField from './DateField';
import CategoryPicker from './CategoryPicker';
import { useCurrency } from '../currency';

type TabId = 'abc' | 'abcxyz' | 'value' | 'movements';

export default function AbcPage({ refreshToken, onOpenItem }: { refreshToken: number; onOpenItem: (barcode: string) => void }) {
  const { money: moneyFmt } = useCurrency();
  const money = (n: number) => moneyFmt(n, { maximumFractionDigits: 0 });
  const [tab, setTab] = useState<TabId>('abc');
  const [rows, setRows] = useState<any[]>([]);
  const [movements, setMovements] = useState<any[]>([]);
  const [stockValue, setStockValue] = useState<{ rows: any[]; items: any[]; total: any; missing_cost?: number } | null>(null);
  const [days, setDays] = useState(90);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [moveType, setMoveType] = useState('');
  const [groupBy, setGroupBy] = useState('item');
  const [xyzFilter, setXyzFilter] = useState('all');
  const [saved, setSaved] = useState<any[]>([]);
  const [saveName, setSaveName] = useState('');
  const [notice, setNotice] = useState('');

  async function reloadSaved() {
    try {
      setSaved((await (window as any).api.listSavedReports?.()) || []);
    } catch {
      setSaved([]);
    }
  }

  useEffect(() => { void reloadSaved(); }, [refreshToken]);

  useEffect(() => {
    if (tab !== 'abc' && tab !== 'abcxyz') return;
    const filter = from && to ? { from, to } : { days };
    (window as any).api.getAbcAnalysis(filter).then(setRows).catch(() => setRows([]));
  }, [refreshToken, tab, days, from, to]);

  useEffect(() => {
    if (tab !== 'movements') return;
    (window as any).api.getMovementAnalytics({
      days,
      from: from || undefined,
      to: to || undefined,
      type: moveType || undefined,
      groupBy,
    }).then(setMovements).catch(() => setMovements([]));
  }, [refreshToken, tab, days, from, to, moveType, groupBy]);

  useEffect(() => {
    if (tab !== 'value') return;
    (window as any).api.getStockValue?.().then(setStockValue).catch(() => setStockValue(null));
  }, [refreshToken, tab]);

  const summary = useMemo(() => rows.reduce((result, row) => {
    result[row.abc_class] += 1;
    result.units += Number(row.used_qty) || 0;
    result.stock += Number(row.total_stock) || 0;
    result.cost += Number(row.stock_cost) || 0;
    if (row.xyz_class === 'X') result.X += 1;
    if (row.xyz_class === 'Y') result.Y += 1;
    if (row.xyz_class === 'Z') result.Z += 1;
    return result;
  }, { A: 0, B: 0, C: 0, X: 0, Y: 0, Z: 0, units: 0, stock: 0, cost: 0 }), [rows]);

  const visibleRows = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return rows.filter((row) => {
      if (categoryFilter !== 'all' && (row.category || 'Без категории') !== categoryFilter) return false;
      if (tab === 'abcxyz' && xyzFilter !== 'all' && row.xyz_class !== xyzFilter) return false;
      if (query && !`${row.name} ${row.barcode} ${row.sku || ''} ${row.abcxyz || ''}`.toLocaleLowerCase().includes(query)) return false;
      return true;
    });
  }, [rows, search, categoryFilter, tab, xyzFilter]);

  const slowStock = rows.filter((row) => Number(row.total_stock) > 0 && Number(row.used_qty) === 0);

  const matrix = useMemo(() => {
    const cells: Record<string, number> = {};
    for (const a of ['A', 'B', 'C']) {
      for (const x of ['X', 'Y', 'Z']) cells[`${a}${x}`] = 0;
    }
    for (const row of rows) {
      const key = String(row.abcxyz || `${row.abc_class}${row.xyz_class || 'Z'}`);
      if (cells[key] != null) cells[key] += 1;
    }
    return cells;
  }, [rows]);

  async function saveCurrent() {
    const name = saveName.trim() || `Отчёт ${tab.toUpperCase()} · ${new Date().toLocaleDateString('ru-RU')}`;
    try {
      await (window as any).api.saveReport({
        name,
        report_type: tab === 'value' ? 'stock_value' : tab,
        params: { days, from, to, categoryFilter, moveType, groupBy, xyzFilter, search },
      });
      setSaveName('');
      setNotice(`Сохранено: ${name}`);
      await reloadSaved();
    } catch (e: any) {
      setNotice(e?.message || 'Не удалось сохранить');
    }
  }

  function applySaved(report: any) {
    let params: any = {};
    try { params = JSON.parse(report.params_json || '{}'); } catch { params = {}; }
    const type = String(report.report_type || 'abc');
    setTab(type === 'stock_value' ? 'value' : type as TabId);
    if (params.days) setDays(Number(params.days) || 90);
    setFrom(params.from || '');
    setTo(params.to || '');
    setCategoryFilter(params.categoryFilter || 'all');
    setMoveType(params.moveType || '');
    setGroupBy(params.groupBy || 'item');
    setXyzFilter(params.xyzFilter || 'all');
    setSearch(params.search || '');
    setNotice(`Открыт: ${report.name}`);
  }

  async function removeSaved(id: number) {
    try {
      await (window as any).api.deleteSavedReport(id);
      await reloadSaved();
    } catch (e: any) {
      setNotice(e?.message || 'Не удалось удалить');
    }
  }

  return <>
    <div className="page-header">
      <div>
        <div className="section-label">Планирование и аналитика</div>
        <h1>Аналитика</h1>
        <p>ABC/XYZ, стоимость запасов по учётной цене и разрезы движений. Сохраняйте типовые срезы как отчёты.</p>
      </div>
      <div className="table-actions">
        <button className={`filter-chip ${tab === 'abc' ? 'active' : ''}`} onClick={() => setTab('abc')}>ABC</button>
        <button className={`filter-chip ${tab === 'abcxyz' ? 'active' : ''}`} onClick={() => setTab('abcxyz')}>ABC-XYZ</button>
        <button className={`filter-chip ${tab === 'value' ? 'active' : ''}`} onClick={() => setTab('value')}>Стоимость</button>
        <button className={`filter-chip ${tab === 'movements' ? 'active' : ''}`} onClick={() => setTab('movements')}>Движения</button>
        {(tab === 'abc' || tab === 'abcxyz' || tab === 'movements') && (
          <>
            <label className="period-select">Период
              <select value={days} onChange={(event) => { setDays(Number(event.target.value)); setFrom(''); setTo(''); }}>
                <option value="30">30 дней</option>
                <option value="90">90 дней</option>
                <option value="180">180 дней</option>
                <option value="365">365 дней</option>
              </select>
            </label>
            <DateField label="С" value={from} onChange={setFrom} />
            <DateField label="По" value={to} onChange={setTo} />
          </>
        )}
      </div>
    </div>

    <section className="card" style={{ marginBottom: 12, padding: '12px 14px' }}>
      <div className="table-header" style={{ margin: 0 }}>
        <div>
          <div className="section-label">Сохранённые отчёты</div>
          <p className="subtext" style={{ margin: 0 }}>Фиксирует вкладку и фильтры · как типовые отчёты в 1С</p>
        </div>
        <div className="table-actions" style={{ flexWrap: 'wrap' }}>
          <input
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            placeholder="Название среза…"
            style={{ minWidth: 180 }}
          />
          <button type="button" className="btn btn-secondary" onClick={() => void saveCurrent()}>Сохранить текущий</button>
        </div>
      </div>
      {saved.length > 0 && (
        <div className="filter-row" style={{ marginTop: 10, flexWrap: 'wrap' }}>
          {saved.map((r) => (
            <span key={r.id} className="filter-chip" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
              <button type="button" className="btn btn-text" style={{ padding: 0 }} onClick={() => applySaved(r)}>{r.name}</button>
              <button type="button" className="btn btn-text" style={{ padding: 0 }} title="Удалить" onClick={() => void removeSaved(r.id)}>×</button>
            </span>
          ))}
        </div>
      )}
      {notice && <p className="subtext" style={{ marginBottom: 0 }}>{notice}</p>}
    </section>

    {(tab === 'abc' || tab === 'abcxyz') && <>
      <div className="dashboard-grid abc-kpis">
        <div className="stat-card"><div className="stat-label">Потребление</div><div className="stat-value">{summary.units}</div><div className="stat-hint">{from && to ? `${from} — ${to}` : `единиц за ${days} дней`}</div></div>
        <div className="stat-card"><div className="stat-label">Текущий остаток</div><div className="stat-value">{summary.stock}</div><div className="stat-hint">единиц во всех ячейках</div></div>
        <div className="stat-card"><div className="stat-label">Себестоимость остатка</div><div className="stat-value" style={{ fontSize: '1.15rem' }}>{money(summary.cost)}</div><div className="stat-hint">по учётной цене</div></div>
        <div className="stat-card"><div className="stat-label">Без движения</div><div className="stat-value">{slowStock.length}</div><div className="stat-hint">с запасом и без расхода</div></div>
      </div>
      <div className="abc-summary">
        <div className="abc-card a"><strong>A</strong><span>{summary.A} · до 80% спроса</span></div>
        <div className="abc-card b"><strong>B</strong><span>{summary.B} · следующие 15%</span></div>
        <div className="abc-card c"><strong>C</strong><span>{summary.C} · остаток спроса</span></div>
        {tab === 'abcxyz' && (
          <>
            <div className="abc-card a"><strong>X</strong><span>{summary.X} · стабильный спрос (CV&lt;0.5)</span></div>
            <div className="abc-card b"><strong>Y</strong><span>{summary.Y} · умеренный (CV&lt;1)</span></div>
            <div className="abc-card c"><strong>Z</strong><span>{summary.Z} · нестабильный</span></div>
          </>
        )}
      </div>
      {tab === 'abcxyz' && (
        <section className="table-wrap" style={{ marginBottom: 12 }}>
          <div className="table-header">
            <div><div className="section-label">Матрица</div><h2>ABC × XYZ</h2></div>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr><th></th><th>X</th><th>Y</th><th>Z</th></tr>
              </thead>
              <tbody>
                {(['A', 'B', 'C'] as const).map((a) => (
                  <tr key={a}>
                    <td className="strong">{a}</td>
                    <td>{matrix[`${a}X`]}</td>
                    <td>{matrix[`${a}Y`]}</td>
                    <td>{matrix[`${a}Z`]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      <section className="table-wrap">
        <div className="table-header">
          <div><div className="section-label">{tab === 'abcxyz' ? 'ABC-XYZ' : 'Приоритет хранения'}</div><h2>{tab === 'abcxyz' ? 'Спрос, вариативность, запас' : 'Спрос и покрытие'}</h2></div>
          <span className="table-caption">Показано {visibleRows.length} из {rows.length}</span>
        </div>
        <div className="analytics-list-tools">
          <input aria-label="Поиск" placeholder="Название, штрихкод или артикул" value={search} onChange={(event) => setSearch(event.target.value)} />
          <CategoryPicker
            label="Категория"
            value={categoryFilter === 'all' ? '' : categoryFilter}
            onChange={(name) => setCategoryFilter(name || 'all')}
            emptyLabel="Все категории"
          />
          {tab === 'abcxyz' && (
            <select value={xyzFilter} onChange={(e) => setXyzFilter(e.target.value)} aria-label="XYZ">
              <option value="all">Все XYZ</option>
              <option value="X">Только X</option>
              <option value="Y">Только Y</option>
              <option value="Z">Только Z</option>
            </select>
          )}
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Класс</th>
                {tab === 'abcxyz' && <th>XYZ</th>}
                <th>Товар</th>
                <th>Категория</th>
                <th>Расход</th>
                <th>Доля накопительно</th>
                <th>Остаток</th>
                {tab === 'abcxyz' && <th>CV</th>}
                <th>Себест.</th>
                <th>Покрытие</th>
                <th>Рекомендация</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr key={row.id} className="clickable-row" onClick={() => onOpenItem(row.barcode)}>
                  <td><span className={`abc-badge ${String(row.abc_class).toLowerCase()}`}>{row.abc_class}</span></td>
                  {tab === 'abcxyz' && <td><span className={`abc-badge ${String(row.xyz_class || 'z').toLowerCase()}`}>{row.xyz_class}</span></td>}
                  <td className="strong">{row.name}<div className="subtext mono">{row.sku || row.barcode}</div></td>
                  <td>{row.category || 'Без категории'}</td>
                  <td>{row.used_qty}</td>
                  <td><div className="share-cell"><span>{row.cumulative_share}%</span><div><i style={{ width: `${Math.min(100, Number(row.cumulative_share) || 0)}%` }} /></div></div></td>
                  <td>{row.total_stock}</td>
                  {tab === 'abcxyz' && <td>{row.cv >= 100 ? '—' : row.cv}</td>}
                  <td>{money(row.stock_cost || 0)}</td>
                  <td>{row.coverage_days == null ? 'Нет расхода' : <span className={row.coverage_days <= 14 ? 'coverage-warning' : ''}>{row.coverage_days} дн.</span>}</td>
                  <td>
                    {tab === 'abcxyz'
                      ? (row.abcxyz === 'AX' ? 'Страховой запас + точный прогноз'
                        : row.abcxyz === 'AZ' ? 'Ручной контроль, буфер'
                        : row.abc_class === 'C' ? 'Минимальный запас'
                        : 'Регулярный контроль')
                      : (row.abc_class === 'A' ? 'Ближе к зоне сборки; контролировать дефицит' : row.abc_class === 'B' ? 'Средняя доступность, регулярный контроль' : 'Резервная зона; проверить излишки')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>}

    {tab === 'value' && (
      <>
        <div className="dashboard-grid abc-kpis">
          <div className="stat-card"><div className="stat-label">Себестоимость</div><div className="stat-value" style={{ fontSize: '1.2rem' }}>{money(stockValue?.total?.cost_value || 0)}</div><div className="stat-hint">учётная цена × остаток</div></div>
          <div className="stat-card"><div className="stat-label">По цене продажи</div><div className="stat-value" style={{ fontSize: '1.2rem' }}>{money(stockValue?.total?.sale_value || 0)}</div><div className="stat-hint">оценка витрины</div></div>
          <div className="stat-card"><div className="stat-label">Единиц</div><div className="stat-value">{Number(stockValue?.total?.qty || 0).toLocaleString('ru-RU')}</div><div className="stat-hint">на складе</div></div>
          <div className="stat-card"><div className="stat-label">Без учётной цены</div><div className="stat-value">{stockValue?.missing_cost || 0}</div><div className="stat-hint">позиций с остатком</div></div>
        </div>
        <section className="table-wrap">
          <div className="table-header">
            <div><div className="section-label">По категориям</div><h2>Стоимость запасов</h2></div>
          </div>
          <div className="table-scroll">
            <table>
              <thead><tr><th>Категория</th><th>Позиций</th><th>Кол-во</th><th>Себестоимость</th><th>По продаже</th><th>Доля себест.</th></tr></thead>
              <tbody>
                {(stockValue?.rows || []).map((row) => {
                  const share = stockValue?.total?.cost_value
                    ? Math.round(Number(row.cost_value || 0) * 1000 / Number(stockValue.total.cost_value)) / 10
                    : 0;
                  return (
                    <tr key={row.category}>
                      <td className="strong">{row.category}</td>
                      <td>{row.item_count}</td>
                      <td>{Number(row.qty || 0).toLocaleString('ru-RU')}</td>
                      <td>{money(row.cost_value)}</td>
                      <td>{money(row.sale_value)}</td>
                      <td><div className="share-cell"><span>{share}%</span><div><i style={{ width: `${Math.min(100, share)}%` }} /></div></div></td>
                    </tr>
                  );
                })}
                {!stockValue?.rows?.length && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--muted)', padding: 24 }}>Нет данных</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
        <section className="table-wrap">
          <div className="table-header">
            <div><div className="section-label">Топ позиций</div><h2>По себестоимости остатка</h2></div>
            <span className="table-caption">до 500 строк с остатком &gt; 0</span>
          </div>
          <div className="table-scroll">
            <table>
              <thead><tr><th>Товар</th><th>Категория</th><th>Остаток</th><th>Учётная</th><th>Себестоимость</th><th>Продажа</th></tr></thead>
              <tbody>
                {(stockValue?.items || []).map((row) => (
                  <tr key={row.id} className="clickable-row" onClick={() => row.barcode && onOpenItem(row.barcode)}>
                    <td className="strong">{row.name}<div className="subtext mono">{row.sku || row.barcode || '—'}</div></td>
                    <td>{row.category || 'Без категории'}</td>
                    <td>{Number(row.qty || 0).toLocaleString('ru-RU')}</td>
                    <td>{row.cost_price == null ? '—' : money(row.cost_price)}</td>
                    <td>{money(row.cost_value)}</td>
                    <td>{money(row.sale_value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </>
    )}

    {tab === 'movements' && (
      <section className="table-wrap">
        <div className="table-header">
          <div><div className="section-label">Анализ движений</div><h2>Приход · Расход · Перемещение · Корректировка</h2></div>
          <span className="table-caption">{movements.length} групп</span>
        </div>
        <div className="analytics-list-tools compact-filters">
          <select value={moveType} onChange={(e) => setMoveType(e.target.value)}>
            <option value="">Все типы</option>
            <option value="in">Приход</option>
            <option value="out">Расход</option>
            <option value="move">Перемещение</option>
            <option value="adjustment">Корректировка</option>
          </select>
          <select value={groupBy} onChange={(e) => setGroupBy(e.target.value)}>
            <option value="item">По товару</option>
            <option value="category">По категории</option>
            <option value="reason">По причине</option>
            <option value="project">По проекту</option>
            <option value="location">По ячейке</option>
            <option value="operator">По оператору</option>
          </select>
          <DateField label="С" value={from} onChange={setFrom} />
          <DateField label="По" value={to} onChange={setTo} />
        </div>
        <div className="table-scroll">
          <table>
            <thead><tr><th>Группа</th><th>Приход</th><th>Расход</th><th>Перемещение</th><th>Корр.</th><th>Операций</th></tr></thead>
            <tbody>
              {movements.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--muted)', padding: 24 }}>Нет движений за период</td></tr>}
              {movements.map((row) => (
                <tr key={String(row.key)}>
                  <td className="strong">{row.label}<div className="subtext">{row.extra}</div></td>
                  <td>{row.qty_in || 0}</td>
                  <td>{row.qty_out || 0}</td>
                  <td>{row.qty_move || 0}</td>
                  <td>{row.qty_adjustment || 0}</td>
                  <td>{row.ops}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    )}
  </>;
}
