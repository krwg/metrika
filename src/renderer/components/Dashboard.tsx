import { useEffect, useMemo, useState } from 'react';
import PrintJobDialog, { type PrintFormChoice, type PrintJobResult } from './PrintJobDialog';
import { greetingName } from '../userProfile';

const OPERATION_LABEL: Record<string, string> = { in: 'Приход', out: 'Расход', move: 'Перемещение' };

const ROLE_LABEL: Record<string, string> = {
  admin: 'Администратор',
  user: 'Пользователь',
  operator: 'Оператор',
};

function greetingForHour(hour: number) {
  if (hour >= 5 && hour < 12) return 'Доброе утро';
  if (hour >= 12 && hour < 17) return 'Добрый день';
  if (hour >= 17 && hour < 23) return 'Добрый вечер';
  return 'Доброй ночи';
}

type Props = {
  refreshToken: number;
  session?: any;
  onCreate: () => void;
  onOpenItem: (barcode: string) => void;
  onOpenPage?: (page: string, opts?: { historyType?: string }) => void;
  onNotice?: (message: string) => void;
};

export default function Dashboard({ refreshToken, session, onCreate, onOpenItem, onOpenPage, onNotice }: Props) {
  const [data, setData] = useState<any | null>(null);
  const [error, setError] = useState('');
  const [printOpen, setPrintOpen] = useState(false);
  const [printForms, setPrintForms] = useState<PrintFormChoice[]>([]);
  const [printBusy, setPrintBusy] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    stats: true,
    chart: true,
    categories: true,
    low: true,
    lots: true,
  });

  useEffect(() => {
    let active = true;
    (window as any).api.getDashboardAnalytics().then((result: any) => { if (active) { setData(result); setError(''); } }).catch(() => { if (active) setError('Не удалось загрузить обзор склада'); });
    return () => { active = false; };
  }, [refreshToken]);

  const name = greetingName(session?.user);
  const role = ROLE_LABEL[session?.user?.role] || 'Пользователь';
  const hello = useMemo(() => greetingForHour(new Date().getHours()), [refreshToken]);

  const trend = data?.movementTrend || [];
  const maxMovement = Math.max(1, ...trend.map((row: any) => Math.max(Number(row.received) || 0, Number(row.issued) || 0)));
  const cellN = Number(data?.cell_count) || Number(data?.location_count) || 0;
  const occN = Number(data?.occupied_cells) || Number(data?.occupied_locations) || 0;
  const occupancy = data?.occupancy_pct != null
    ? Number(data.occupancy_pct)
    : (cellN ? Math.round((occN / cellN) * 100) : 0);
  const fillHint = Number(data?.capacity_total) > 0
    ? `${Number(data.filled_capacity || 0).toLocaleString('ru-RU')} / ${Number(data.capacity_total).toLocaleString('ru-RU')} по вместимости`
    : (cellN > 0 ? `${occN} из ${cellN} ячеек занято` : (occN > 0 ? `${occN} адресов с остатком` : 'ячейки не заданы'));

  function toggle(key: string) {
    setExpanded((current) => ({ ...current, [key]: !current[key] }));
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
          isDefault: t.id === 'sys-stock-compact' || t.id === 'sys-stock',
        }));
      const forms = stock.length
        ? stock.map((f, idx) => ({ ...f, isDefault: f.id === 'sys-stock-compact' || (idx === 0 && !stock.some((s) => s.id === 'sys-stock-compact')) }))
        : [{ id: 'sys-stock', label: 'Ведомость остатков', isDefault: true }];
      setPrintForms(forms);
      setPrintOpen(true);
    } catch (e: any) {
      onNotice?.(e?.message || 'Не удалось загрузить формы печати');
    } finally {
      setPrintBusy(false);
    }
  }

  async function confirmStockPrint(job: PrintJobResult) {
    setPrintBusy(true);
    try {
      const result = await (window as any).api.printStockReport('all', {
        templateId: job.formId,
        destination: job.destination,
        deviceName: job.deviceName,
        copies: job.copies,
      });
      if (result === null) onNotice?.('Печать отменена');
      else if (result?.path) onNotice?.(`PDF сохранён: ${result.path}`);
      else if (result?.destination === 'printer') onNotice?.(`Отправлено на принтер: ${result.deviceName || ''}`);
      else onNotice?.('Ведомость остатков сформирована');
      setPrintOpen(false);
    } catch (e: any) {
      onNotice?.(e?.message || 'Не удалось сформировать ведомость остатков');
    } finally {
      setPrintBusy(false);
    }
  }

  return <>
    <div className="page-header">
      <div>
        <div className="section-label">{role}</div>
        <h1>{hello}, {name}</h1>
        <p>Операционная панель · статистика, остатки, пополнение и движение за текущий месяц</p>
      </div>
      <div className="table-actions">
        <button className="btn btn-secondary" onClick={() => onOpenPage?.('documents')}>Документы</button>
        <button className="btn btn-secondary" onClick={() => onOpenPage?.('history')}>История</button>
        <button className="btn btn-secondary" onClick={() => void openStockPrint()} disabled={printBusy}>Печать остатков</button>
        <button className="btn btn-primary" onClick={onCreate}>Новый товар</button>
      </div>
    </div>
    {error && <div className="form-error page-error">{error}</div>}

    <button type="button" className="dashboard-section-toggle" onClick={() => toggle('stats')}>
      <span>Сводка</span><strong>{expanded.stats ? '▾' : '▸'}</strong>
    </button>
    {expanded.stats && (
      <div className="dashboard-grid dashboard-summary-grid">
        <StatCard label="Товары" value={data?.item_count || 0} hint="активных позиций каталога" onClick={() => onOpenPage?.('items')} />
        <StatCard label="Единицы" value={data?.total_units || 0} hint="физический запас по складу" onClick={() => onOpenPage?.('locations')} />
        <StatCard label="Заполненность" value={`${occupancy}%`} hint={fillHint} onClick={() => onOpenPage?.('locations')} />
        <StatCard label="Ниже минимума" value={data?.low_stock_count || 0} hint="позиций для пополнения" warning={Number(data?.low_stock_count) > 0} onClick={() => onOpenPage?.('replenishment')} />
        <StatCard label="Приход за месяц" value={data?.month_received || 0} hint="единиц принято" onClick={() => onOpenPage?.('history', { historyType: 'in' })} />
        <StatCard label="Расход за месяц" value={data?.month_issued || 0} hint="единиц списано" onClick={() => onOpenPage?.('history', { historyType: 'out' })} />
        <StatCard label="Активные проекты" value={data?.active_projects || 0} hint="черновики и резервы" onClick={() => onOpenPage?.('projects')} />
        <StatCard label="Просроченные" value={data?.overdue_projects || 0} hint="проектов с истекшим сроком" warning={Number(data?.overdue_projects) > 0} onClick={() => onOpenPage?.('projects')} />
        <StatCard
          label="Срок годности"
          value={Number(data?.expired_count || 0) + Number(data?.expiring_count || 0)}
          hint={`${data?.expired_count || 0} просроч. · ${data?.expiring_count || 0} истекает`}
          warning={Number(data?.expired_count || 0) + Number(data?.expiring_count || 0) > 0}
          onClick={() => onOpenPage?.('quality')}
        />
        <StatCard label="Перемещения за месяц" value={data?.month_moved || 0} hint="единиц перемещено" onClick={() => onOpenPage?.('history', { historyType: 'move' })} />
        <StatCard label="Черновики документов" value={data?.open_documents || 0} hint="непроведённых документов" onClick={() => onOpenPage?.('documents')} />
        <StatCard label="Заказы поставщику" value={data?.open_purchase_orders || 0} hint="черновики и в работе" onClick={() => onOpenPage?.('purchases')} />
      </div>
    )}

    <div className="dashboard-insights dashboard-ops-grid">
      <section className="card dashboard-chart">
        <div className="table-header">
          <button type="button" className="dashboard-section-toggle inline" onClick={() => toggle('chart')}>
            <div><div className="section-label">Динамика склада</div><h2>Движение за 14 дней</h2></div>
            <strong>{expanded.chart ? '▾' : '▸'}</strong>
          </button>
          <div className="chart-legend"><span className="legend-in">Приход</span><span className="legend-out">Расход</span></div>
        </div>
        {expanded.chart && (
          <div className="movement-chart clickable-row" onClick={() => onOpenPage?.('abc')} title="Открыть аналитику">
            {trend.map((day: any) => (
              <div className="movement-day" key={day.day} title={`${day.day}: +${day.received} / -${day.issued}`}>
                <div className="movement-bars">
                  <span className="movement-bar received" style={{ height: `${Math.max(3, Number(day.received) / maxMovement * 100)}%` }} />
                  <span className="movement-bar issued" style={{ height: `${Math.max(3, Number(day.issued) / maxMovement * 100)}%` }} />
                </div>
                <small>{new Date(`${day.day}T00:00:00`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}</small>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card dashboard-categories">
        <button type="button" className="dashboard-section-toggle inline" onClick={() => toggle('categories')}>
          <div><div className="section-label">Структура остатков</div><h2>По категориям</h2></div>
          <strong>{expanded.categories ? '▾' : '▸'}</strong>
        </button>
        {expanded.categories && (
          (data?.categoryStock || []).length ? data.categoryStock.map((category: any, index: number) => {
            const max = Math.max(1, ...data.categoryStock.map((entry: any) => Number(entry.total_units) || 0));
            return (
              <div className="dashboard-category clickable-row" key={category.name} onClick={() => onOpenPage?.('categories')}>
                <div>
                  <span className={`category-rank rank-${index % 4}`}>{String(index + 1).padStart(2, '0')}</span>
                  <strong>{category.name}</strong>
                  <small>{category.item_count} поз.</small>
                </div>
                <div className="category-stock-bar"><span style={{ width: `${Math.max(3, Number(category.total_units) / max * 100)}%` }} /></div>
                <b>{category.total_units}</b>
              </div>
            );
          }) : <div className="empty"><p>Добавьте категории и товары.</p></div>
        )}
      </section>

      <section className="card dashboard-ops-card">
        <div className="table-header">
          <button type="button" className="dashboard-section-toggle inline" onClick={() => toggle('low')}>
            <div>
              <div className="section-label">Контроль запасов</div>
              <h2>Ниже минимума · {data?.low_stock_count || 0}</h2>
            </div>
            <strong>{expanded.low ? '▾' : '▸'}</strong>
          </button>
          <button type="button" className="btn btn-text" onClick={() => onOpenPage?.('replenishment')}>Пополнение →</button>
        </div>
        {expanded.low && (
          <div className="dashboard-ops-body">
            {(data?.lowStock || []).length
              ? data.lowStock.slice(0, 8).map((item: any) => (
                <div className="replenishment-row clickable-row" key={item.id} onClick={() => onOpenItem(item.barcode || String(item.id))}>
                  <div><strong>{item.name}</strong><small>{item.category || 'Без категории'}</small></div>
                  <span>{item.available ?? item.total_qty} доступно</span>
                  <b>мин. {item.min_stock}</b>
                  <span className="shortage-value">−{Math.max(0, Number(item.min_stock) - Number(item.available ?? item.total_qty))}</span>
                </div>
              ))
              : <div className="empty"><h3>Пополнение не требуется</h3><p>Все товары на уровне минимума или выше.</p></div>}
          </div>
        )}
      </section>

      <section className="card dashboard-ops-card">
        <div className="table-header">
          <button type="button" className="dashboard-section-toggle inline" onClick={() => toggle('lots')}>
            <div>
              <div className="section-label">Партии и журнал</div>
              <h2>
                Сроки · {(Number(data?.expired_count) || 0) + (Number(data?.expiring_count) || 0)}
                {' · '}
                операции
              </h2>
            </div>
            <strong>{expanded.lots ? '▾' : '▸'}</strong>
          </button>
          <div className="table-actions">
            <button type="button" className="btn btn-text" onClick={() => onOpenPage?.('quality')}>Качество →</button>
            <button type="button" className="btn btn-text" onClick={() => onOpenPage?.('history')}>Журнал →</button>
          </div>
        </div>
        {expanded.lots && (
          <div className="dashboard-ops-body dashboard-ops-split">
            <div>
              <div className="section-label" style={{ marginBottom: 6 }}>Партии</div>
              {(data?.expiryLots || []).length
                ? data.expiryLots.slice(0, 5).map((row: any) => (
                  <div
                    className="replenishment-row clickable-row"
                    key={`${row.lot_id}-${row.location_id}`}
                    onClick={() => onOpenItem(row.barcode || String(row.item_id))}
                  >
                    <div>
                      <strong>{row.item_name}</strong>
                      <small>{row.lot_no || 'без №'} · {row.location_name}</small>
                    </div>
                    <span>{row.on_hand}</span>
                    <b className={row.status === 'expired' ? 'shortage-value' : ''}>
                      {row.status === 'expired' ? 'просроч.' : `${row.days_left} дн.`}
                    </b>
                  </div>
                ))
                : <div className="empty"><p>Сроки в норме.</p></div>}
            </div>
            <div>
              <div className="section-label" style={{ marginBottom: 6 }}>Последние операции</div>
              {(data?.recent || []).length
                ? data.recent.slice(0, 5).map((entry: any) => (
                  <div
                    className={`activity-row ${entry.item_name ? 'clickable-row' : ''}`}
                    key={entry.id}
                    onClick={() => entry.item_barcode && onOpenItem(entry.item_barcode)}
                  >
                    <span className={`activity-type activity-${entry.type}`}>{OPERATION_LABEL[entry.type] || entry.type}</span>
                    <div>
                      <strong>{entry.item_name || 'Товар удалён'}</strong>
                      <small>{new Date(entry.timestamp).toLocaleString('ru-RU')}</small>
                    </div>
                    <b>{entry.type === 'out' ? '−' : entry.type === 'in' ? '+' : ''}{entry.quantity}</b>
                  </div>
                ))
                : <div className="empty"><p>Операций пока нет.</p></div>}
            </div>
          </div>
        )}
      </section>
    </div>
    <PrintJobDialog
      open={printOpen}
      title="Печать остатков"
      forms={printForms}
      defaultFormId={printForms.find((f) => f.isDefault)?.id || printForms[0]?.id}
      busy={printBusy}
      onClose={() => setPrintOpen(false)}
      onSubmit={confirmStockPrint}
    />
  </>;
}

function StatCard({ label, value, hint, warning, onClick }: { label: string; value: string | number; hint: string; warning?: boolean; onClick?: () => void }) {
  return (
    <button type="button" className={`stat-card ${warning ? 'warning' : ''} ${onClick ? 'stat-card-clickable' : ''}`} onClick={onClick}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      <div className="stat-hint">{hint}</div>
    </button>
  );
}
