import { useEffect, useMemo, useState } from 'react';

type Props = {
  refreshToken: number;
  onNotice: (message: string) => void;
  onChanged?: () => void;
  onOpenPage: (page: 'projects' | 'items' | 'locations') => void;
};

const STATUS_RU: Record<string, string> = {
  reserved: 'Зарезервирован',
  picking: 'Комплектация',
  picked: 'Скомплектован',
  assembly: 'Сборка',
};

export default function ReservesPage({ refreshToken, onNotice, onChanged, onOpenPage }: Props) {
  const [rows, setRows] = useState<any[]>([]);
  const [summary, setSummary] = useState<any | null>(null);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [savedViews, setSavedViews] = useState<any[]>([]);
  const [viewName, setViewName] = useState('');
  const [activeViewId, setActiveViewId] = useState<number | null>(null);

  async function reloadViews() {
    try {
      const rows = await (window as any).api.listSavedListViews('reserves');
      setSavedViews(Array.isArray(rows) ? rows : []);
    } catch {
      setSavedViews([]);
    }
  }

  function applyView(row: any) {
    try {
      const params = typeof row.params_json === 'string' ? JSON.parse(row.params_json || '{}') : (row.params || {});
      setSearch(String(params.search || ''));
      setActiveViewId(Number(row.id) || null);
    } catch {
      onNotice('Не удалось применить представление');
    }
  }

  async function saveCurrentView() {
    const name = viewName.trim() || (search.trim() ? `Поиск: ${search.trim()}` : 'Резервы');
    try {
      await (window as any).api.saveListView({
        name,
        list_key: 'reserves',
        params: { search },
      });
      setViewName('');
      await reloadViews();
      onNotice(`Представление «${name}» сохранено`);
    } catch (e: any) {
      onNotice(e?.message || 'Не удалось сохранить представление');
    }
  }

  async function removeView(id: number) {
    try {
      await (window as any).api.deleteSavedListView(id);
      if (activeViewId === id) setActiveViewId(null);
      await reloadViews();
    } catch (e: any) {
      onNotice(e?.message || 'Не удалось удалить представление');
    }
  }

  async function load() {
    setBusy(true);
    setLoadError('');
    const api = (window as any).api;
    if (typeof api?.listStockReserves !== 'function' || typeof api?.summarizeStockReserves !== 'function') {
      setLoadError('API регистра резервов недоступен — перезапустите приложение (npm run dev).');
      setRows([]);
      setSummary(null);
      setBusy(false);
      return;
    }
    try {
      const [list, sum] = await Promise.all([
        api.listStockReserves({}),
        api.summarizeStockReserves(),
      ]);
      setRows(Array.isArray(list) ? list : []);
      setSummary(sum || {
        line_count: 0, qty_total: 0, project_count: 0, over_reserved: [], by_project: [],
      });
    } catch (e: any) {
      const msg = e?.message || 'Не удалось загрузить регистр резервов';
      setLoadError(msg);
      onNotice(msg);
      setRows([]);
      setSummary(null);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { void load(); }, [refreshToken]);
  useEffect(() => { void reloadViews(); }, [refreshToken]);

  async function releaseProject(projectId: number, label: string) {
    if (!window.confirm(`Снять резерв по заказу ${label}?`)) return;
    setBusy(true);
    try {
      await (window as any).api.releaseProject(projectId);
      onNotice(`Резерв снят: ${label}`);
      onChanged?.();
      await load();
    } catch (e: any) {
      onNotice(e?.message || 'Не удалось снять резерв');
    } finally {
      setBusy(false);
    }
  }

  const visible = useMemo(() => {
    const q = search.trim().toLocaleLowerCase();
    if (!q) return rows;
    return rows.filter((row) => {
      const hay = `${row.project_no} ${row.project_name} ${row.item_name} ${row.item_sku} ${row.location_name}`.toLocaleLowerCase();
      return hay.includes(q);
    });
  }, [rows, search]);

  return (
    <>
      <div className="page-header">
        <div>
          <div className="section-label">Складской регистр</div>
          <h1>Резервы</h1>
          <p>Отдельный регистр удерживаемого остатка по активным заказ-нарядам. Available = on_hand − reserved.</p>
        </div>
        <div className="settings-actions">
          <button type="button" className="btn btn-secondary" onClick={() => onOpenPage('projects')}>Проекты</button>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void load()}>Обновить</button>
        </div>
      </div>

      {loadError && (
        <div className="form-error page-error" style={{ marginBottom: 12 }}>
          {loadError}
        </div>
      )}

      <div className="dashboard-grid" style={{ marginBottom: 16 }}>
        <div className="stat-card">
          <div className="stat-label">Строк резерва</div>
          <div className="stat-value">{summary?.line_count ?? '—'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Единиц в резерве</div>
          <div className="stat-value">{summary?.qty_total ?? '—'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Проектов</div>
          <div className="stat-value">{summary?.project_count ?? '—'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Сверх on_hand</div>
          <div className="stat-value">{summary?.over_reserved?.length ?? 0}</div>
          <div className="stat-hint">должно быть 0</div>
        </div>
      </div>

      {Array.isArray(summary?.over_reserved) && summary.over_reserved.length > 0 && (
        <div className="form-error page-error" style={{ marginBottom: 12 }}>
          Резерв превышает учётный остаток по {summary.over_reserved.length} позициям — проверьте проекты или пересчитайте остатки.
        </div>
      )}

      {!loadError && summary && Number(summary.line_count) === 0 && (
        <div className="project-scan-hint" style={{ marginBottom: 12 }}>
          Регистр пуст. Если в «Проектах» заказ уже «Зарезервирован», нажмите «Снять резерв» → снова «Зарезервировать» — строки появятся здесь. После обновления кода нужен полный перезапуск приложения.
        </div>
      )}

      <section className="table-wrap">
        <div className="table-header">
          <div><h2>Активные резервы</h2></div>
          <span className="table-caption">{visible.length}</span>
        </div>
        <div className="analytics-list-tools compact-filters">
          <input
            placeholder="Проект, товар, ячейка…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setActiveViewId(null); }}
          />
        </div>
        <div className="filter-row" style={{ margin: '8px 0 12px', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <span className="subtext">Представления</span>
          <input
            className="search-input"
            style={{ maxWidth: 180 }}
            value={viewName}
            onChange={(e) => setViewName(e.target.value)}
            placeholder="Название среза…"
            onKeyDown={(e) => { if (e.key === 'Enter') void saveCurrentView(); }}
          />
          <button type="button" className="btn btn-secondary" onClick={() => void saveCurrentView()}>Сохранить</button>
          {savedViews.map((row) => (
            <span key={row.id} className={`filter-chip ${activeViewId === row.id ? 'active' : ''}`} style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
              <button type="button" className="btn btn-text" style={{ padding: 0 }} onClick={() => applyView(row)}>{row.name}</button>
              <button type="button" className="btn btn-text" style={{ padding: 0 }} title="Удалить" onClick={() => void removeView(row.id)}>×</button>
            </span>
          ))}
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Проект</th>
                <th>Статус</th>
                <th>Товар</th>
                <th>Ячейка</th>
                <th>Резерв</th>
                <th>On hand</th>
                <th>Срок</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', color: 'var(--muted)', padding: 28 }}>
                    Активных резервов нет
                  </td>
                </tr>
              )}
              {visible.map((row) => (
                <tr key={`${row.project_id}-${row.item_id}-${row.location_id}`}>
                  <td className="strong">
                    <button type="button" className="btn btn-text" onClick={() => onOpenPage('projects')}>
                      {row.project_no || `#${row.project_id}`}
                    </button>
                    <div className="subtext">{row.project_name}</div>
                  </td>
                  <td>{STATUS_RU[row.project_status] || row.project_status}</td>
                  <td>
                    {row.item_name}
                    <div className="subtext mono">{row.item_sku || row.item_barcode || ''}</div>
                  </td>
                  <td>{row.location_name}</td>
                  <td className="strong">{row.quantity}</td>
                  <td>{row.on_hand}</td>
                  <td className="mono">{row.project_due || '—'}</td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-text"
                      disabled={busy}
                      onClick={() => void releaseProject(row.project_id, row.project_no || `#${row.project_id}`)}
                    >
                      Снять
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {Array.isArray(summary?.by_project) && summary.by_project.length > 0 && (
        <section className="table-wrap" style={{ marginTop: 16 }}>
          <div className="table-header">
            <div><h2>По проектам</h2></div>
          </div>
          <div className="table-scroll" style={{ maxHeight: 280 }}>
            <table>
              <thead>
                <tr>
                  <th>Проект</th>
                  <th>Статус</th>
                  <th>Строк</th>
                  <th>Кол-во</th>
                  <th>Срок</th>
                </tr>
              </thead>
              <tbody>
                {summary.by_project.map((row: any) => (
                  <tr key={row.project_id}>
                    <td className="strong">{row.project_no || `#${row.project_id}`}<div className="subtext">{row.project_name}</div></td>
                    <td>{STATUS_RU[row.project_status] || row.project_status}</td>
                    <td>{row.lines}</td>
                    <td>{row.qty}</td>
                    <td className="mono">{row.project_due || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
