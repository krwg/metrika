import { useEffect, useState } from 'react';
import LocationPicker from './LocationPicker';
import StockOpsPanel from './StockOpsPanel';

type Props = {
  refreshToken: number;
  sessionId: number | null;
  onSession: (id: number | null) => void;
  onChanged: () => void;
  onOpenItem: (barcode: string) => void;
  stocktakeCart: Array<{ item: any; quantity: number }>;
  onStocktakeChange: (items: Array<{ item: any; quantity: number }>) => void;
  onNotice: (message: string) => void;
  focusTab?: 'cell' | 'free' | 'ops' | null;
  launchStockKind?: 'writeoff' | 'surplus' | 'regrade' | 'disassemble' | 'assemble' | null;
  onFocusConsumed?: () => void;

  accentedOps?: boolean;
};

export default function InventoryPage({
  refreshToken: _refreshToken,
  sessionId,
  onSession,
  onChanged,
  onOpenItem,
  stocktakeCart,
  onStocktakeChange,
  onNotice,
  focusTab = null,
  launchStockKind = null,
  onFocusConsumed,
  accentedOps = false,
}: Props) {
  const [locationId, setLocationId] = useState('');
  const [stocktakeLocationId, setStocktakeLocationId] = useState('');
  const [rows, setRows] = useState<any[]>([]);
  const [serialDrafts, setSerialDrafts] = useState<Record<number, string>>({});
  const [stocktakeSerials, setStocktakeSerials] = useState<Record<number, string>>({});
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'cell' | 'free' | 'ops'>('cell');
  const [stockLaunch, setStockLaunch] = useState<'writeoff' | 'surplus' | 'regrade' | 'disassemble' | 'assemble' | 'transfer' | null>(null);

  useEffect(() => {
    if (!focusTab && !launchStockKind) return;
    if (focusTab) setTab(focusTab);
    if (launchStockKind) {
      setTab('ops');
      setStockLaunch(launchStockKind);
    }
    onFocusConsumed?.();
  }, [focusTab, launchStockKind, onFocusConsumed]);

  async function start() {
    if (!locationId) { setError('Выберите адрес хранения'); return; }
    const result = await (window as any).api.startInventory(Number(locationId));
    onSession(result.id);
    setRows([]);
    setError('');
    onNotice('Ревизия открыта. Сканер переключён в режим ревизии.');
  }

  async function compare() {
    if (sessionId) {
      setRows((await (window as any).api.compareInventory(sessionId)) || []);
      setSerialDrafts({});
    }
  }

  async function accept() {
    if (!sessionId || !window.confirm('Применить фактические количества? Партии сохраняются; недостача списывается FIFO/FEFO.')) return;
    try {
      const serialsByItem: Record<string, string> = {};
      for (const row of rows) {
        if (Number(row.track_serials) && Number(row.difference) > 0) {
          serialsByItem[String(row.item_id)] = serialDrafts[row.item_id] || '';
        } else if (Number(row.track_serials) && Number(row.difference) < 0 && serialDrafts[row.item_id]) {
          serialsByItem[String(row.item_id)] = serialDrafts[row.item_id];
        }
      }
      await (window as any).api.acceptInventory(sessionId, { serialsByItem });
      onSession(null);
      setRows([]);
      setSerialDrafts({});
      onChanged();
      onNotice('Ревизия принята: партии сохранены, корректировки в ledger');
    } catch (acceptError: any) {
      setError(acceptError?.message || 'Не удалось принять ревизию');
    }
  }

  async function assignStocktake() {
    if (!stocktakeLocationId) { setError('Выберите ячейку назначения'); return; }
    if (!stocktakeCart.length) { setError('Сначала отсканируйте товары'); return; }
    if (!window.confirm(`Назначить ${stocktakeCart.length} позиций в выбранную ячейку? Партии не схлопываются.`)) return;
    try {
      await (window as any).api.assignStocktake(
        Number(stocktakeLocationId),
        stocktakeCart.map((entry) => ({
          item_id: entry.item.id,
          quantity: entry.quantity,
          serials: Number(entry.item.track_serials) ? (stocktakeSerials[entry.item.id] || '') : undefined,
        })),
      );
      onStocktakeChange([]);
      setStocktakeSerials({});
      setError('');
      onChanged();
      onNotice('Быстрая инвентаризация записана');
    } catch (assignError: any) {
      setError(assignError?.message || 'Не удалось назначить остатки');
    }
  }

  return <>
    <div className="page-header">
      <div>
        <div className="section-label">Контроль фактических остатков</div>
        <h1>Ревизия</h1>
        <p>Ревизия, быстрая инвентаризация и складские акты: списание, излишки, пересортица, разукомплектация.</p>
      </div>
      <div className="filter-row">
        <button className={`filter-chip ${tab === 'cell' ? 'active' : ''}`} onClick={() => setTab('cell')}>Ревизия ячейки</button>
        <button className={`filter-chip ${tab === 'free' ? 'active' : ''}`} onClick={() => setTab('free')}>Быстрая инвентаризация</button>
        <button className={`filter-chip ${tab === 'ops' ? 'active' : ''}`} onClick={() => setTab('ops')}>Складские акты</button>
      </div>
    </div>

    {tab === 'cell' && (
      <section className="card audit-panel">
        <div className="scanner-controls inventory-location-controls">
          <LocationPicker
            label="Адрес ревизии"
            value={locationId}
            onChange={setLocationId}
            disabled={Boolean(sessionId)}
            emptyLabel="Выберите склад / подсклад / ячейку"
          />
          {!sessionId ? (
            <button className="btn btn-primary" onClick={start}>Начать ревизию</button>
          ) : (
            <>
              <span className="connection-state connected">Акт открыт · сканер в режиме ревизии</span>
              <button className="btn btn-secondary" onClick={compare}>Показать расхождения</button>
              <button className="btn btn-danger" onClick={accept}>Принять факт</button>
              <button className="btn btn-text" onClick={() => onSession(null)}>Закрыть акт</button>
            </>
          )}
        </div>
        {sessionId && (
          <p className="audit-hint">
            Сканируйте товары в выбранной ячейке. Каждый скан +1 к факту.
            При принятии партии не схлопываются; недостача — FIFO/FEFO; излишек серийных — укажите S/N в таблице.
          </p>
        )}
        {error && tab === 'cell' && <div className="form-error">{error}</div>}
      </section>
    )}

    {tab === 'cell' && sessionId && (
      <section className="table-wrap">
        <div className="table-header">
          <div><div className="section-label">Сверка</div><h2>Расхождения</h2></div>
          <div className="table-caption">Позиции: {rows.length}</div>
        </div>
        {rows.length === 0 ? (
          <div className="empty"><h3>Расхождения еще не рассчитаны</h3><p>После сканирования нажмите «Показать расхождения».</p></div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead><tr><th>Товар</th><th>Ожидалось</th><th>Факт</th><th>Разница</th><th>Серии (излишек / опц. недостача)</th></tr></thead>
              <tbody>
                {rows.map((row) => {
                  const needsSurplusSerials = Number(row.track_serials) && Number(row.difference) > 0;
                  const optionalShortageSerials = Number(row.track_serials) && Number(row.difference) < 0;
                  return (
                    <tr key={row.item_id}>
                      <td className="strong clickable-row" onClick={() => onOpenItem(row.barcode)}>
                        {row.name}
                        <div className="subtext">{row.barcode}{Number(row.track_lots) ? ' · партии' : ''}{Number(row.track_serials) ? ' · S/N' : ''}</div>
                      </td>
                      <td>{row.base_quantity}</td>
                      <td>{row.counted_quantity}</td>
                      <td className={row.difference < 0 ? 'negative-difference' : 'positive-difference'}>{row.difference > 0 ? '+' : ''}{row.difference}</td>
                      <td>
                        {(needsSurplusSerials || optionalShortageSerials) ? (
                          <textarea
                            rows={2}
                            placeholder={needsSurplusSerials
                              ? `Ровно ${row.difference} серий, каждая с новой строки`
                              : 'Пусто = старейшие на ячейке; или перечислите серии'}
                            value={serialDrafts[row.item_id] || ''}
                            onChange={(e) => setSerialDrafts((cur) => ({ ...cur, [row.item_id]: e.target.value }))}
                          />
                        ) : (
                          <span className="subtext">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    )}

    {tab === 'ops' && (
      <StockOpsPanel
        onNotice={onNotice}
        onChanged={onChanged}
        launchKind={stockLaunch}
        onLaunchConsumed={() => setStockLaunch(null)}
        accented={accentedOps}
      />
    )}

    {tab === 'free' && (
      <section className="card audit-panel">
        <p className="audit-hint">
          Сканируйте товары, затем назначьте количества в ячейку. Партии сохраняются (не схлопываются в «без партии»).
          Для серийных при росте остатка укажите S/N.
        </p>
        <div className="scanner-controls inventory-location-controls">
          <LocationPicker
            label="Адрес назначения"
            value={stocktakeLocationId}
            onChange={setStocktakeLocationId}
            emptyLabel="Выберите склад / подсклад / ячейку"
          />
          <button className="btn btn-primary" onClick={assignStocktake} disabled={!stocktakeCart.length}>Назначить всё в ячейку</button>
          <button className="btn btn-text" onClick={() => { onStocktakeChange([]); setStocktakeSerials({}); }} disabled={!stocktakeCart.length}>Очистить список</button>
        </div>
        {error && tab === 'free' && <div className="form-error">{error}</div>}
        <div className="table-scroll" style={{ marginTop: 16 }}>
          <table>
            <thead><tr><th>Товар</th><th>Отсканировано</th><th>Серии</th><th></th></tr></thead>
            <tbody>
              {stocktakeCart.length === 0 && <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--muted)', padding: 24 }}>Пока пусто — сканируйте штрихкоды</td></tr>}
              {stocktakeCart.map((entry) => (
                <tr key={entry.item.id}>
                  <td className="strong">{entry.item.name}<div className="subtext">{entry.item.barcode || 'Еще не определен'}{Number(entry.item.track_serials) ? ' · S/N' : ''}</div></td>
                  <td><strong>{entry.quantity}</strong> {entry.item.unit_symbol || 'шт.'}</td>
                  <td>
                    {Number(entry.item.track_serials) ? (
                      <textarea
                        rows={2}
                        placeholder="S/N при излишке (по числу шт.)"
                        value={stocktakeSerials[entry.item.id] || ''}
                        onChange={(e) => setStocktakeSerials((cur) => ({ ...cur, [entry.item.id]: e.target.value }))}
                      />
                    ) : <span className="subtext">—</span>}
                  </td>
                  <td><button className="btn btn-danger" onClick={() => onStocktakeChange(stocktakeCart.filter((row) => row.item.id !== entry.item.id))}>Убрать</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    )}
  </>;
}
