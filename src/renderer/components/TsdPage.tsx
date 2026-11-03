import { useEffect, useState } from 'react';
import { useI18n } from '../i18n';

type Props = { refreshToken: number; taskId: number | null; onTask: (id: number | null) => void };

const STATUS_LABEL: Record<string, string> = {
  draft: 'Черновик',
  reserved: 'Зарезервирован',
  picking: 'Комплектация',
  picked: 'Скомплектован',
  assembly: 'Сборка',
  consumed: 'Списан',
  finished: 'Завершен',
  completed: 'Завершен',
};

const HOLDING = new Set(['reserved', 'picking', 'picked', 'assembly']);

export default function TsdPage({ refreshToken, taskId, onTask }: Props) {
  const { t, locale } = useI18n();
  const [orders, setOrders] = useState<any[]>([]);
  const [selected, setSelected] = useState<any | null>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [outbox, setOutbox] = useState<{ pending?: number; note?: string } | null>(null);
  const [flushBusy, setFlushBusy] = useState(false);

  async function loadOutbox() {
    try {
      const st = await (window as any).api.tsdOutboxStatus?.();
      setOutbox(st || null);
    } catch {
      setOutbox(null);
    }
  }

  async function load() {
    const next = (await (window as any).api.getProjects()) || [];
    const active = next.filter((order: any) => HOLDING.has(order.status) && order.component_count > 0);
    setOrders(active);
    if (taskId) {
      const order = next.find((entry: any) => entry.id === taskId);
      if (order && HOLDING.has(order.status)) {
        setSelected(order);
        setRows((await (window as any).api.getProjectDetails(taskId)) || []);
      } else {
        onTask(null);
        setSelected(null);
        setRows([]);
      }
    }
    await loadOutbox();
  }
  useEffect(() => { load(); }, [refreshToken, taskId]);

  useEffect(() => {
    const timer = setInterval(() => { void loadOutbox(); }, 4000);
    return () => clearInterval(timer);
  }, []);

  async function flushOutbox() {
    setFlushBusy(true);
    try {
      const result = await (window as any).api.tsdOutboxFlush?.();
      setOutbox(result);
      setError('');
      await load();
    } catch (e: any) {
      setError(e?.message || (locale === 'ru' ? 'Не удалось синхронизировать очередь' : 'Could not flush outbox'));
    } finally {
      setFlushBusy(false);
    }
  }

  async function start(order: any) {
    onTask(order.id);
    setSelected(order);
    setRows((await (window as any).api.getProjectDetails(order.id)) || []);
    setError('');
  }

  async function finishPicking() {
    if (!taskId || !selected) return;
    const totalScanned = rows.reduce((sum, row) => sum + (Number(row.scanned) || 0), 0);
    const totalRequired = rows.reduce((sum, row) => sum + (Number(row.required) || 0), 0);
    if (totalRequired > 0 && totalScanned < totalRequired) {
      if (!window.confirm(locale === 'ru'
        ? 'Комплектация неполная. Всё равно отметить как скомплектованную?'
        : 'Picking is incomplete. Mark as picked anyway?')) return;
    } else if (!window.confirm(locale === 'ru'
      ? 'Отметить комплектацию завершённой?'
      : 'Mark picking as complete?')) return;
    try {
      setError('');
      if (selected.status === 'reserved' || selected.status === 'picking') {
        await (window as any).api.setProjectStatus(taskId, 'picked');
      }
      onTask(null);
      setSelected(null);
      setRows([]);
      await load();
    } catch (completeError: any) {
      setError(completeError?.message || (locale === 'ru' ? 'Не удалось завершить комплектацию' : 'Could not finish picking'));
    }
  }

  const totalScanned = rows.reduce((sum, row) => sum + (Number(row.scanned) || 0), 0);
  const totalRequired = rows.reduce((sum, row) => sum + (Number(row.required) || 0), 0);
  const progress = totalRequired > 0 ? Math.round((totalScanned / totalRequired) * 100) : 0;
  const filtered = orders.filter((order) => {
    const q = search.trim().toLocaleLowerCase();
    return !q || `${order.order_no} ${order.name} ${order.target_name}`.toLocaleLowerCase().includes(q);
  });

  if (!selected) {
    return (
      <>
        <div className="page-header">
          <div>
            <div className="section-label">{t('tsd')}</div>
            <h1>{locale === 'ru' ? 'Выберите задание' : 'Select a task'}</h1>
            <p>{locale === 'ru'
              ? 'Показаны только зарезервированные заказы. Сначала закрепите компоненты в «Проектах».'
              : 'Only reserved work orders are listed. Reserve components in Projects first.'}</p>
            {Number(outbox?.pending) > 0 && (
              <p className="muted" style={{ marginTop: 8 }}>
                {locale === 'ru' ? `Очередь офлайн: ${outbox?.pending}` : `Offline queue: ${outbox?.pending}`}
                {' · '}
                <button type="button" className="linkish" disabled={flushBusy} onClick={() => void flushOutbox()}>
                  {locale === 'ru' ? 'Синхронизировать' : 'Sync now'}
                </button>
              </p>
            )}
          </div>
        </div>
        <section className="card tsd-panel">
          <div className="project-list-tools">
            <input
              placeholder={locale === 'ru' ? 'Номер, изделие…' : 'Number, product…'}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <span className="table-caption">{filtered.length} {locale === 'ru' ? 'из' : 'of'} {orders.length}</span>
          </div>
          <div className="tsd-orders">
            {filtered.length === 0 ? (
              <div className="empty" style={{ gridColumn: '1 / -1' }}>
                <h3>{locale === 'ru' ? 'Нет заданий для комплектации' : 'No picking tasks'}</h3>
                <p>{locale === 'ru'
                  ? 'Зарезервируйте заказ-наряд в разделе «Проекты» — он появится здесь.'
                  : 'Reserve a work order in Projects to see it here.'}</p>
              </div>
            ) : filtered.map((order) => (
              <button className="tsd-order card" key={order.id} type="button" onClick={() => start(order)}>
                <strong>{order.order_no || `ЗН-${String(order.id).padStart(4, '0')}`}</strong>
                <span>{order.target_name || order.name}</span>
                <small>{locale === 'ru' ? 'Тираж' : 'Qty'}: {order.build_quantity} · {locale === 'ru' ? 'Компонентов' : 'Lines'}: {order.component_count}</small>
                <span className="type-badge reserve">{STATUS_LABEL[order.status] || order.status}</span>
              </button>
            ))}
          </div>
        </section>
      </>
    );
  }

  return (
    <>
      <div className="page-header">
        <div>
          <div className="section-label">{t('tsd')} · {selected.order_no || `ЗН-${String(selected.id).padStart(4, '0')}`}</div>
          <h1>{selected.target_name || selected.name}</h1>
          <p>{locale === 'ru' ? 'Сканируйте позиции задания. Статус обновляется после каждого скана.' : 'Scan task lines. Status updates after each scan.'}</p>
        </div>
        <div className="order-actions">
          {Number(outbox?.pending) > 0 && (
            <button className="btn btn-secondary" type="button" disabled={flushBusy} onClick={() => void flushOutbox()}>
              {locale === 'ru' ? `Очередь: ${outbox?.pending}` : `Queue: ${outbox?.pending}`}
            </button>
          )}
          <button className="btn btn-secondary" type="button" onClick={() => { onTask(null); setSelected(null); setRows([]); }}>{locale === 'ru' ? 'К списку' : 'Back'}</button>
          <button className="btn btn-primary" type="button" onClick={() => void finishPicking()}>
            {locale === 'ru' ? 'Завершить комплектацию' : 'Finish picking'}
          </button>
        </div>
      </div>
      <section className="card tsd-panel">
        <div className="progress-track"><span style={{ width: `${progress}%` }} /></div>
        <div className="progress-label">{locale === 'ru' ? 'Прогресс' : 'Progress'}: {progress}% · {totalScanned} / {totalRequired} · {STATUS_LABEL[selected.status] || selected.status}</div>
        <div className="table-scroll" style={{ marginTop: 16 }}>
          <table>
            <thead>
              <tr>
                <th>{locale === 'ru' ? 'Статус' : 'Status'}</th>
                <th>{locale === 'ru' ? 'Компонент' : 'Component'}</th>
                <th>{locale === 'ru' ? 'Отсканировано' : 'Scanned'}</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={3} style={{ textAlign: 'center', color: 'var(--muted)', padding: 24 }}>{locale === 'ru' ? 'Спецификация пуста' : 'BOM is empty'}</td></tr>}
              {rows.map((row) => {
                const isDone = Number(row.scanned) >= Number(row.required);
                return (
                  <tr key={row.item_id} className={isDone ? 'row-selected' : ''}>
                    <td><span className={`type-badge ${isDone ? 'in' : 'out'}`}>{isDone ? (locale === 'ru' ? 'Готово' : 'Done') : (locale === 'ru' ? 'Ожидает' : 'Pending')}</span></td>
                    <td className="strong">{row.print_name || row.name}<div className="subtext mono">{row.barcode || '—'} · {row.sku || t('withoutSku')}</div></td>
                    <td><strong>{row.scanned} / {row.required}</strong> {row.unit_symbol || 'шт.'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {error && <div className="form-error page-error">{error}</div>}
      </section>
    </>
  );
}
