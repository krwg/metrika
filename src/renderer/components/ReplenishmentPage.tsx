import { useEffect, useMemo, useState } from 'react';
import { useCurrency } from '../currency';

type Props = {
  refreshToken: number;
  onNotice: (message: string) => void;
  onOpenItem: (barcode: string) => void;
  onChanged?: () => void;
};

export default function ReplenishmentPage({ refreshToken, onNotice, onOpenItem, onChanged }: Props) {
  const { symbol } = useCurrency();
  const [leadDays, setLeadDays] = useState(14);
  const [safetyDays, setSafetyDays] = useState(7);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [onlyCritical, setOnlyCritical] = useState(false);
  const [onlySuggested, setOnlySuggested] = useState(true);
  const [selected, setSelected] = useState<Record<number, boolean>>({});
  const [excluded, setExcluded] = useState<Record<number, boolean>>({});
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [supplierId, setSupplierId] = useState('');
  const [savedViews, setSavedViews] = useState<any[]>([]);
  const [viewName, setViewName] = useState('');
  const [activeViewId, setActiveViewId] = useState<number | null>(null);

  async function reloadViews() {
    try {
      const rows = await (window as any).api.listSavedListViews('replenishment');
      setSavedViews(Array.isArray(rows) ? rows : []);
    } catch {
      setSavedViews([]);
    }
  }

  useEffect(() => { void reloadViews(); }, [refreshToken]);

  function applyView(row: any) {
    try {
      const params = typeof row.params_json === 'string' ? JSON.parse(row.params_json || '{}') : (row.params || {});
      setSearch(String(params.search || ''));
      setOnlyCritical(Boolean(params.onlyCritical));
      setOnlySuggested(params.onlySuggested !== false);
      setLeadDays(Math.min(90, Math.max(1, Number(params.leadDays) || 14)));
      setSafetyDays(Math.min(60, Math.max(0, Number(params.safetyDays) || 7)));
      setSupplierId(params.supplierId != null ? String(params.supplierId) : '');
      setActiveViewId(Number(row.id) || null);
    } catch {
      setError('Не удалось применить представление');
    }
  }

  async function saveCurrentView() {
    const name = viewName.trim() || (search.trim() ? `Поиск: ${search.trim()}` : onlyCritical ? 'Критичные' : 'План пополнения');
    try {
      await (window as any).api.saveListView({
        name,
        list_key: 'replenishment',
        params: { search, onlyCritical, onlySuggested, leadDays, safetyDays, supplierId },
      });
      setViewName('');
      await reloadViews();
      onNotice(`Представление «${name}» сохранено`);
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
    let active = true;
    setLoading(true);
    Promise.all([
      (window as any).api.getReplenishmentPlan(
        leadDays,
        safetyDays,
        supplierId ? Number(supplierId) : null,
        { onlySuggested, forecastDays: leadDays + safetyDays },
      ),
      (window as any).api.getSuppliers(),
    ])
      .then(([result, supplierList]) => {
        if (!active) return;
        setRows(result || []);
        setSuppliers(supplierList || []);
        setError('');
      })
      .catch((loadError: any) => { if (active) setError(loadError?.message || 'Не удалось рассчитать план'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [leadDays, safetyDays, supplierId, onlySuggested, refreshToken]);

  const visible = useMemo(() => {
    const q = search.trim().toLocaleLowerCase();
    return rows.filter((row) => {
      if (excluded[row.id]) return false;
      if (onlyCritical && !(
        Number(row.coverage_days) <= leadDays
        || Number(row.available) <= Number(row.min_stock || 0)
        || (row.reorder_point != null && Number(row.available) <= Number(row.reorder_point))
      )) return false;
      return !q || `${row.name} ${row.sku || ''} ${row.category || ''}`.toLocaleLowerCase().includes(q);
    });
  }, [rows, search, onlyCritical, leadDays, excluded]);

  const selectedRows = visible.filter((row) => selected[row.id]);
  const totalUnits = selectedRows.length
    ? selectedRows.reduce((sum, row) => sum + Number(row.suggested_quantity || 0), 0)
    : visible.reduce((sum, row) => sum + Number(row.suggested_quantity || 0), 0);
  const totalCost = selectedRows.length
    ? selectedRows.reduce((sum, row) => sum + Number(row.estimated_cost || 0), 0)
    : visible.reduce((sum, row) => sum + Number(row.estimated_cost || 0), 0);
  const critical = visible.filter((row) => Number(row.coverage_days) != null && Number(row.coverage_days) <= leadDays).length;

  function toggleAll(value: boolean) {
    const next: Record<number, boolean> = {};
    visible.forEach((row) => { next[row.id] = value; });
    setSelected(next);
  }

  async function exportPlan() {
    const source = selectedRows.length ? selectedRows : visible;
    const file = await (window as any).api.exportCsv(source.map((row) => ({
      Артикул: row.sku,
      Товар: row.name,
      Категория: row.category,
      Доступно: row.available,
      Резерв: row.reserved,
      'Уже в PO': row.already_ordered,
      'Среднее/день': row.average_daily,
      Тренд: `${row.trend_pct}%`,
      Сезонность: row.seasonal_factor,
      Lead: row.lead_days_used,
      Цель: row.target_stock,
      Заказать: row.suggested_quantity,
      'Оценка стоимости': row.estimated_cost,
    })), 'metrika-replenishment-plan');
    if (file) onNotice(`План экспортирован: ${file}`);
  }

  async function createPurchaseFromSelection() {
    const source = selectedRows.length ? selectedRows : visible.slice(0, 30);
    if (!source.length) { onNotice('Нет позиций для заказа'); return; }
    try {
      const created = await (window as any).api.createPurchaseOrder({
        supplier_id: supplierId ? Number(supplierId) : null,
        note: `Автоплан пополнения · lead ${leadDays}д · safety ${safetyDays}д`,
      });
      for (const row of source) {
        await (window as any).api.addPurchaseItem(
          created.id,
          row.id,
          row.suggested_quantity,
          row.supplier_unit_price ?? row.unit_price ?? undefined,
        );
      }
      onNotice(`Создан PO с ${source.length} позициями`);
      onChanged?.();
      setSelected({});
    } catch (e: any) {
      setError(e?.message || 'Не удалось создать заказ на закупку');
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <div className="section-label">Планирование</div>
          <h1>Умное пополнение</h1>
          <p>Прогноз расхода, тренд, сезонность, резервы, открытые PO, MOQ и кратность. Отметьте позиции и создайте заказ одним действием.</p>
        </div>
        <div className="order-actions">
          <button className="btn btn-secondary" onClick={exportPlan} disabled={!visible.length}>Экспорт CSV</button>
          <button className="btn btn-primary" onClick={createPurchaseFromSelection} disabled={!visible.length}>Создать PO</button>
        </div>
      </div>

      <section className="card reorder-controls">
        <label>Срок поставки, дни
          <input type="number" min="1" max="90" value={leadDays} onChange={(e) => setLeadDays(Number(e.target.value) || 1)} />
        </label>
        <label>Страховой запас, дни
          <input type="number" min="0" max="60" value={safetyDays} onChange={(e) => setSafetyDays(Number(e.target.value) || 0)} />
        </label>
        <label>Поиск
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Товар, артикул, категория" />
        </label>
        <label>Поставщик для PO
          <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            <option value="">Не выбран</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label className="smart-check" style={{ alignSelf: 'end' }}>
          <input type="checkbox" checked={onlySuggested} onChange={(e) => { setOnlySuggested(e.target.checked); setActiveViewId(null); }} />
          Только к заказу
        </label>
        <label className="smart-check" style={{ alignSelf: 'end' }}>
          <input type="checkbox" checked={onlyCritical} onChange={(e) => { setOnlyCritical(e.target.checked); setActiveViewId(null); }} />
          Только критичные
        </label>
      </section>

      <div className="filter-row" style={{ marginBottom: 12, flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
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

      {error && <div className="form-error page-error">{error}</div>}

      <div className="dashboard-grid reorder-summary">
        <div className="stat-card"><div className="stat-label">К заказу</div><div className="stat-value">{visible.length}</div><div className="stat-hint">позиций в плане</div></div>
        <div className="stat-card"><div className="stat-label">Единиц</div><div className="stat-value">{totalUnits}</div><div className="stat-hint">{selectedRows.length ? 'по выбранным' : 'по всем видимым'}</div></div>
        <div className="stat-card warning"><div className="stat-label">Критичные</div><div className="stat-value">{critical}</div><div className="stat-hint">покрытие ≤ lead time</div></div>
        <div className="stat-card"><div className="stat-label">Оценка</div><div className="stat-value">{Math.round(totalCost).toLocaleString('ru-RU')}</div><div className="stat-hint">{symbol} по цене поставщика / за шт</div></div>
      </div>

      <section className="table-wrap">
        <div className="table-header">
          <div><div className="section-label">Рекомендации</div><h2>Что заказать</h2></div>
          <div className="table-actions">
            <button type="button" className="btn btn-text" onClick={() => toggleAll(true)}>Выбрать все</button>
            <button type="button" className="btn btn-text" onClick={() => toggleAll(false)}>Снять</button>
            <span className="table-caption">{loading ? 'Расчёт…' : `${visible.length} позиций`}</span>
          </div>
        </div>
        {visible.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th></th><th>Товар</th><th>Доступно</th><th>В PO</th><th>Ср/день</th><th>Тренд</th><th>Сезон</th>
                  <th>Прогноз</th><th>Покрытие</th><th>Цель</th><th>Заказать</th><th>{symbol}/шт</th><th>{symbol}</th><th></th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => (
                  <tr key={row.id} className={selected[row.id] ? 'row-selected' : ''}>
                    <td><input type="checkbox" checked={Boolean(selected[row.id])} onChange={(e) => setSelected({ ...selected, [row.id]: e.target.checked })} /></td>
                    <td className="strong clickable-row" onClick={() => onOpenItem(row.barcode)}>
                      {row.name}
                      <div className="subtext mono">{row.sku || '—'} · {row.category || 'Без категории'}</div>
                    </td>
                    <td>{row.available}<div className="subtext">резерв {row.reserved}{row.reorder_point != null ? ` · точка ${row.reorder_point}` : ''}</div></td>
                    <td>{row.already_ordered || 0}</td>
                    <td>{row.average_daily}</td>
                    <td className={Number(row.trend_pct) > 20 ? 'coverage-warning' : ''}>{row.trend_pct > 0 ? '+' : ''}{row.trend_pct}%</td>
                    <td>{row.seasonal_factor ?? '—'}</td>
                    <td>
                      {Number(row.forecast_qty || 0).toLocaleString('ru-RU', { maximumFractionDigits: 1 })}
                      <div className="subtext">на {row.forecast_horizon_days || (leadDays + safetyDays)} дн.</div>
                    </td>
                    <td>{row.coverage_days == null ? '—' : <span className={row.coverage_days <= leadDays ? 'coverage-warning' : ''}>{row.coverage_days} дн.</span>}</td>
                    <td>{row.target_stock}</td>
                    <td><strong className="reorder-quantity">{row.suggested_quantity}</strong>
                      {(row.moq_used > 0 || row.pack_used > 1) && (
                        <div className="subtext">MOQ {row.moq_used || 0} · ×{row.pack_used || 1}</div>
                      )}
                    </td>
                    <td>{Number(row.unit_price || 0).toLocaleString('ru-RU', { maximumFractionDigits: 2 })}
                      {row.supplier_name ? <div className="subtext">{row.supplier_name}</div> : null}
                    </td>
                    <td>{Math.round(Number(row.estimated_cost || 0)).toLocaleString('ru-RU')}</td>
                    <td><button type="button" className="btn btn-danger" onClick={() => setExcluded({ ...excluded, [row.id]: true })}>Убрать</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">
            <h3>{loading ? 'Считаем потребность' : (onlySuggested ? 'Пополнение не требуется' : 'Нет расхода и заказов')}</h3>
            <p>{loading
              ? 'Учитываем спрос, резерв и открытые заказы.'
              : (onlySuggested
                ? 'Запасы и уже оформленные PO покрывают целевой уровень. Снимите «Только к заказу», чтобы увидеть позиции с расходом.'
                : 'За выбранный период нет движений расхода по каталогу.')}</p>
          </div>
        )}
      </section>
    </>
  );
}
