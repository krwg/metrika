import { useEffect, useMemo, useState } from 'react';
import ItemPickerDialog from './ItemPickerDialog';
import DateField from './DateField';
import LocationPicker from './LocationPicker';
import SuppliersPanel from './SuppliersPanel';
import PrintJobDialog, { type PrintJobResult } from './PrintJobDialog';
import { useCurrency } from '../currency';

const PO_STATUS: Record<string, string> = {
  draft: 'Черновик',
  ordered: 'Заказан',
  partial: 'Частично',
  received: 'Получен',
  cancelled: 'Отменён',
};

const SHIP_STATUS: Record<string, string> = {
  planned: 'Запланировано',
  in_transit: 'В пути',
  delivered: 'Доставлено',
  cancelled: 'Отменено',
};

export default function PurchasesPage({
  refreshToken,
  onChanged,
  onNotice,
  focusOrderId,
  onFocusConsumed,
}: {
  refreshToken: number;
  onChanged: () => void;
  onNotice: (m: string) => void;
  focusOrderId?: number | null;
  onFocusConsumed?: () => void;
}) {
  const { symbol, money: moneyFmt } = useCurrency();
  const money = (value: number | null | undefined) => moneyFmt(value, { round: true, maximumFractionDigits: 0 });
  const [tab, setTab] = useState<'orders' | 'suppliers'>('orders');
  const [orders, setOrders] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [selected, setSelected] = useState<any | null>(null);
  const [lines, setLines] = useState<any[]>([]);
  const [shipments, setShipments] = useState<any[]>([]);
  const [shipForm, setShipForm] = useState({
    carrier: '',
    tracking_no: '',
    shipped_at: '',
    expected_at: '',
    status: 'in_transit',
    note: '',
  });
  const [poForm, setPoForm] = useState({ supplier_id: '', note: '', expected_at: '' });
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [error, setError] = useState('');
  const [planHint, setPlanHint] = useState(0);
  const [receiveLocationId, setReceiveLocationId] = useState('');
  const [receiveQty, setReceiveQty] = useState<Record<number, string>>({});
  const [receivePrice, setReceivePrice] = useState<Record<number, string>>({});
  const [receiveLot, setReceiveLot] = useState<Record<number, string>>({});
  const [receiveExpiry, setReceiveExpiry] = useState<Record<number, string>>({});
  const [receiveSerials, setReceiveSerials] = useState<Record<number, string>>({});
  const [receiveUnpack, setReceiveUnpack] = useState<Record<number, boolean>>({});
  const [receiveContentQty, setReceiveContentQty] = useState<Record<number, string>>({});
  const [actualReceivedAt, setActualReceivedAt] = useState('');
  const [headerDraft, setHeaderDraft] = useState({ supplier_id: '', note: '', expected_at: '' });
  const [printBusy, setPrintBusy] = useState(false);
  const [printForms, setPrintForms] = useState<Array<{ id: string; label: string; hint: string; isDefault?: boolean }>>([]);
  const [printFormId, setPrintFormId] = useState('gost-order');
  const [printOpen, setPrintOpen] = useState(false);
  const [savedViews, setSavedViews] = useState<any[]>([]);
  const [viewName, setViewName] = useState('');
  const [activeViewId, setActiveViewId] = useState<number | null>(null);

  async function reloadViews() {
    try {
      const rows = await (window as any).api.listSavedListViews('purchases');
      setSavedViews(Array.isArray(rows) ? rows : []);
    } catch {
      setSavedViews([]);
    }
  }

  function applyView(row: any) {
    try {
      const params = typeof row.params_json === 'string' ? JSON.parse(row.params_json || '{}') : (row.params || {});
      setSearch(String(params.search || ''));
      setStatusFilter(String(params.statusFilter || 'all'));
      setTab(params.tab === 'suppliers' ? 'suppliers' : 'orders');
      setActiveViewId(Number(row.id) || null);
    } catch {
      setError('Не удалось применить представление');
    }
  }

  async function saveCurrentView() {
    const name = viewName.trim()
      || (search.trim() ? `Поиск: ${search.trim()}` : statusFilter !== 'all' ? `Статус: ${PO_STATUS[statusFilter] || statusFilter}` : 'Закупки');
    try {
      await (window as any).api.saveListView({
        name,
        list_key: 'purchases',
        params: { search, statusFilter, tab },
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

  async function load() {
    setOrders((await (window as any).api.getPurchaseOrders()) || []);
    setSuppliers((await (window as any).api.getSuppliers()) || []);
    setItems((await (window as any).api.getItems()) || []);
    try {
      const plan = await (window as any).api.getReplenishmentPlan(14, 7);
      setPlanHint((plan || []).length);
    } catch { setPlanHint(0); }
  }

  async function openOrder(order: any) {
    const details = await (window as any).api.getPurchaseDetails(order.id);
    setSelected(details.order);
    setLines(details.lines || []);
    setShipments(details.shipments || []);
    setShipForm({
      carrier: '',
      tracking_no: '',
      shipped_at: '',
      expected_at: details.order?.expected_at || '',
      status: 'in_transit',
      note: '',
    });
    setHeaderDraft({
      supplier_id: details.order?.supplier_id ? String(details.order.supplier_id) : '',
      note: details.order?.note || '',
      expected_at: details.order?.expected_at || '',
    });
    const nextQty: Record<number, string> = {};
    const nextPrice: Record<number, string> = {};
    for (const line of details.lines || []) {
      const rem = Math.max(0, Number(line.remaining_qty ?? (line.quantity - (line.received_qty || 0))));
      nextQty[line.item_id] = rem > 0 ? String(rem) : '0';
      nextPrice[line.item_id] = line.actual_unit_price != null
        ? String(line.actual_unit_price)
        : (line.unit_price != null ? String(line.unit_price) : '');
    }
    setReceiveQty(nextQty);
    setReceivePrice(nextPrice);
    setReceiveLot({});
    setReceiveExpiry({});
    setReceiveSerials({});
    const nextUnpack: Record<number, boolean> = {};
    const nextContent: Record<number, string> = {};
    for (const line of details.lines || []) {
      nextUnpack[line.item_id] = Boolean(line.unpack_default);
      if (line.default_content_qty != null) nextContent[line.item_id] = String(line.default_content_qty);
    }
    setReceiveUnpack(nextUnpack);
    setReceiveContentQty(nextContent);
    setActualReceivedAt(details.order?.actual_received_at || new Date().toISOString().slice(0, 10));
    if (details.order?.receive_location_id) {
      setReceiveLocationId(String(details.order.receive_location_id));
    }
  }

  async function addShipment() {
    if (!selected?.id) return;
    try {
      await (window as any).api.addPurchaseShipment(selected.id, shipForm);
      onNotice('Отправление добавлено');
      await openOrder(selected);
      await load();
      onChanged();
    } catch (e: any) {
      setError(e?.message || 'Не удалось добавить отправление');
    }
  }

  async function setShipmentStatus(id: number, status: string) {
    try {
      await (window as any).api.updatePurchaseShipment(id, { status });
      if (selected) await openOrder(selected);
      onChanged();
    } catch (e: any) {
      setError(e?.message || 'Не удалось обновить статус');
    }
  }

  async function removeShipment(id: number) {
    if (!window.confirm('Удалить отправление?')) return;
    try {
      await (window as any).api.deletePurchaseShipment(id);
      if (selected) await openOrder(selected);
      onChanged();
    } catch (e: any) {
      setError(e?.message || 'Не удалось удалить отправление');
    }
  }

  useEffect(() => { load(); }, [refreshToken]);
  useEffect(() => { void reloadViews(); }, [refreshToken]);

  useEffect(() => {
    if (focusOrderId == null) return;
    setTab('orders');
    void (async () => {
      try {
        const list = await (window as any).api.getPurchaseOrders();
        setOrders(list || []);
        const order = (list || []).find((o: any) => Number(o.id) === Number(focusOrderId));
        if (order) await openOrder(order);
        else onNotice(`Заказ #${focusOrderId} не найден`);
      } catch (e: any) {
        onNotice(e?.message || 'Не удалось открыть заказ');
      } finally {
        onFocusConsumed?.();
      }
    })();
  }, [focusOrderId]);

  async function openPrintPicker() {
    if (!selected) return;
    setPrintBusy(true);
    try {
      const forms = (await (window as any).api.listPrintForms?.('po')) || [];
      setPrintForms(forms);
      setPrintFormId(forms.find((f: any) => f.isDefault)?.id || forms[0]?.id || 'gost-order');
      setPrintOpen(true);
    } catch (e: any) {
      onNotice(e?.message || 'Не удалось загрузить формы');
    } finally {
      setPrintBusy(false);
    }
  }

  async function confirmPrint(job: PrintJobResult) {
    if (!selected) return;
    setPrintBusy(true);
    try {
      const result = await (window as any).api.printDocument('po', String(selected.id), job.formId, {
        destination: job.destination,
        deviceName: job.deviceName,
        copies: job.copies,
      });
      if (result?.path) onNotice(`PDF сохранён: ${result.path}`);
      else if (result === null) onNotice('Печать отменена');
      else if (result?.destination === 'printer') onNotice(`Отправлено на принтер: ${result.deviceName || ''}`);
      setPrintOpen(false);
    } catch (e: any) {
      onNotice(e?.message || 'Не удалось напечатать');
    } finally {
      setPrintBusy(false);
    }
  }

  const filteredOrders = useMemo(() => {
    const q = search.trim().toLocaleLowerCase();
    return orders.filter((o) => {
      if (statusFilter !== 'all' && o.status !== statusFilter) return false;
      return !q || `${o.order_no} ${o.supplier_name || ''} ${o.note || ''}`.toLocaleLowerCase().includes(q);
    });
  }, [orders, search, statusFilter]);

  const openValue = orders
    .filter((o) => ['draft', 'ordered', 'partial'].includes(o.status))
    .reduce((sum, o) => sum + Number(o.remaining_qty ?? o.total_qty ?? 0), 0);
  const planTotal = lines.reduce((sum, line) => sum + Number(line.quantity || 0) * Number(line.unit_price || 0), 0);
  const factTotal = lines.reduce((sum, line) => {
    const qty = Number(line.received_qty || 0);
    const price = line.actual_unit_price ?? line.unit_price;
    return sum + qty * Number(price || 0);
  }, 0);
  const canEditLines = selected && (selected.status === 'draft' || selected.status === 'ordered');
  const canReceive = selected && (selected.status === 'ordered' || selected.status === 'partial');
  const canUnreceive = selected && (selected.status === 'partial' || selected.status === 'received');

  async function createPo(event: React.FormEvent) {
    event.preventDefault();
    try {
      const result = await (window as any).api.createPurchaseOrder({
        supplier_id: poForm.supplier_id ? Number(poForm.supplier_id) : null,
        note: poForm.note,
        expected_at: poForm.expected_at || null,
      });
      setPoForm({ supplier_id: '', note: '', expected_at: '' });
      await load();
      const list = await (window as any).api.getPurchaseOrders();
      const created = (list || []).find((o: any) => o.id === result.id);
      if (created) await openOrder(created);
      onChanged();
    } catch (e: any) { setError(e?.message || 'Не удалось создать PO'); }
  }

  async function saveHeader() {
    if (!selected || !canEditLines) return;
    try {
      await (window as any).api.updatePurchaseOrder(selected.id, {
        supplier_id: headerDraft.supplier_id ? Number(headerDraft.supplier_id) : null,
        note: headerDraft.note,
        expected_at: headerDraft.expected_at || null,
      });
      await openOrder(selected);
      await load();
      onChanged();
      onNotice('Шапка заказа сохранена');
      setError('');
    } catch (e: any) {
      setError(e?.message || 'Не удалось сохранить шапку');
    }
  }

  async function addLine(item: any, quantity: number) {
    if (!selected) return;
    try {
      await (window as any).api.addPurchaseItem(selected.id, item.id, quantity, item.cost_price ?? null);
      setPickerOpen(false);
      await openOrder(selected);
      onChanged();
    } catch (e: any) { setError(e?.message || 'Не удалось добавить позицию'); }
  }

  async function saveLine(line: any, patch: { quantity?: number; unit_price?: number | null }) {
    if (!selected) return;
    try {
      await (window as any).api.updatePurchaseItem(selected.id, line.item_id, patch);
      await openOrder(selected);
      onChanged();
    } catch (e: any) {
      setError(e?.message || 'Не удалось обновить позицию');
    }
  }

  async function fillFromPlan() {
    try {
      const plan = (await (window as any).api.getReplenishmentPlan(14, 7)) || [];
      if (!plan.length) { onNotice('План пополнения пуст'); return; }
      const result = await (window as any).api.createPurchaseOrder({
        supplier_id: poForm.supplier_id ? Number(poForm.supplier_id) : null,
        note: 'Заполнен из умного пополнения',
      });
      for (const row of plan.slice(0, 40)) {
        await (window as any).api.addPurchaseItem(result.id, row.id, row.suggested_quantity, row.cost_price ?? null);
      }
      await load();
      const list = await (window as any).api.getPurchaseOrders();
      const created = (list || []).find((o: any) => o.id === result.id);
      if (created) await openOrder(created);
      onNotice(`PO заполнен: ${Math.min(40, plan.length)} позиций из плана`);
      onChanged();
    } catch (e: any) {
      setError(e?.message || 'Не удалось заполнить из плана');
    }
  }

  async function receivePo() {
    if (!selected) return;
    if (!receiveLocationId) { setError('Выберите ячейку приёмки'); return; }
    const payload = {
      location_id: Number(receiveLocationId),
      actual_received_at: actualReceivedAt || null,
      lines: lines.map((line) => ({
        item_id: line.item_id,
        quantity: Number(receiveQty[line.item_id] || 0),
        unit_price: receivePrice[line.item_id] === '' || receivePrice[line.item_id] == null
          ? undefined
          : Number(receivePrice[line.item_id]),
        lot_no: String(receiveLot[line.item_id] || '').trim() || undefined,
        expiry_date: String(receiveExpiry[line.item_id] || '').trim() || undefined,
        serials: String(receiveSerials[line.item_id] || '')
          .split(/[\n,;\t]+/)
          .map((s) => s.trim())
          .filter(Boolean),
        unpack: receiveUnpack[line.item_id] === true,
        expand_packs: Boolean(line.expand_packs) && receiveUnpack[line.item_id] === true,
        content_qty: receiveContentQty[line.item_id] === '' || receiveContentQty[line.item_id] == null
          ? undefined
          : Number(receiveContentQty[line.item_id]),
      })).filter((row) => row.quantity > 0),
    };
    for (const row of payload.lines) {
      const line = lines.find((l) => l.item_id === row.item_id);
      if (line?.track_serials && !(row.serials && row.serials.length)) {
        setError(`Укажите серийные номера для «${line.item_name}»`);
        return;
      }
      if (line?.track_serials && row.serials && row.serials.length !== row.quantity) {
        setError(`Для «${line.item_name}» кол-во (${row.quantity}) ≠ числу серий (${row.serials.length})`);
        return;
      }
    }
    if (!payload.lines.length) { setError('Укажите количество хотя бы по одной позиции'); return; }
    try {
      const result = await (window as any).api.receivePurchaseOrder(selected.id, payload);
      await openOrder(selected);
      await load();
      onChanged();
      onNotice(
        result.unpackedPieces > 0
          ? `Принято ${result.receivedUnits} уп. → ${result.unpackedPieces} шт · ${PO_STATUS[result.status] || result.status}`
          : `Принято ${result.receivedUnits} ед. · статус: ${PO_STATUS[result.status] || result.status}`,
      );
      setError('');
    } catch (e: any) {
      setError(e?.message || 'Не удалось провести приёмку');
    }
  }

  async function unreceivePo() {
    if (!selected) return;
    if (!window.confirm(`Отменить проведение приёмки ${selected.order_no}? Остатки будут сторнированы.`)) return;
    try {
      const result = await (window as any).api.unreceivePurchaseOrder(selected.id);
      await openOrder(selected);
      await load();
      onChanged();
      onNotice(`Отменено движений: ${result.reversed}`);
      setError('');
    } catch (e: any) {
      setError(e?.message || 'Не удалось отменить проведение');
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <div className="section-label">Снабжение</div>
          <h1>Закупки</h1>
          <p>Заказы поставщикам: плановые и фактические цены/даты, частичная приёмка. Печать — с выбором формы (заказ / накладная / краткая).</p>
        </div>
        <div className="table-actions">
          <button className={`filter-chip ${tab === 'orders' ? 'active' : ''}`} onClick={() => setTab('orders')}>Заказы PO</button>
          <button className={`filter-chip ${tab === 'suppliers' ? 'active' : ''}`} onClick={() => setTab('suppliers')}>Поставщики</button>
          {tab === 'orders' && (
            <button className="btn btn-secondary" onClick={fillFromPlan} disabled={!planHint}>
              Из плана ({planHint})
            </button>
          )}
        </div>
      </div>
      {error && <div className="form-error page-error">{error}</div>}

      {tab === 'orders' && (
        <div className="dashboard-grid reorder-summary" style={{ marginBottom: 16 }}>
          <div className="stat-card"><div className="stat-label">Всего PO</div><div className="stat-value">{orders.length}</div></div>
          <div className="stat-card"><div className="stat-label">К поставке</div><div className="stat-value">{openValue}</div><div className="stat-hint">ед. остаток по открытым</div></div>
          <div className="stat-card"><div className="stat-label">План пополнения</div><div className="stat-value">{planHint}</div><div className="stat-hint">позиций к заказу</div></div>
          <div className="stat-card">
            <div className="stat-label">Сумма выбранного</div>
            <div className="stat-value">{Math.round(planTotal).toLocaleString('ru-RU')}</div>
            <div className="stat-hint">план {symbol}{factTotal > 0 ? ` · факт ${Math.round(factTotal).toLocaleString('ru-RU')}` : ''}</div>
          </div>
        </div>
      )}

      {tab === 'suppliers' && (
        <SuppliersPanel
          refreshToken={refreshToken}
          onChanged={() => { void load(); onChanged(); }}
          onNotice={onNotice}
        />
      )}

      {tab === 'orders' && (
        <div className="project-layout">
          <section className="card project-list">
            <div className="table-header"><h2>Заказы на закупку</h2><span className="table-caption">{filteredOrders.length}</span></div>
            <form className="project-create" onSubmit={createPo}>
              <select value={poForm.supplier_id} onChange={(e) => setPoForm({ ...poForm, supplier_id: e.target.value })}>
                <option value="">Поставщик</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <DateField label="Ожидаемая дата" value={poForm.expected_at} onChange={(expected_at) => setPoForm({ ...poForm, expected_at })} />
              <input placeholder="Комментарий" value={poForm.note} onChange={(e) => setPoForm({ ...poForm, note: e.target.value })} />
              <button className="btn btn-primary">Создать заказ</button>
            </form>
            <div className="project-list-tools">
              <input placeholder="Поиск заказа / поставщика" value={search} onChange={(e) => { setSearch(e.target.value); setActiveViewId(null); }} />
              <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setActiveViewId(null); }}>
                <option value="all">Все статусы</option>
                {Object.entries(PO_STATUS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
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
            {filteredOrders.map((order) => (
              <div className="project-entry" key={order.id}>
                <button className={`project-row ${selected?.id === order.id ? 'active' : ''}`} onClick={() => openOrder(order)}>
                  <span>
                    <strong>{order.order_no}</strong>
                    <small>
                      {PO_STATUS[order.status] || order.status} · {order.supplier_name || 'Без поставщика'} · {order.line_count} поз.
                      · {order.received_qty || 0}/{order.total_qty || 0}
                      {order.expected_at ? ` · ожид. ${order.expected_at}` : ''}
                      {order.actual_received_at ? ` · факт ${order.actual_received_at}` : ''}
                      {Number(order.remaining_qty) > 0 ? ` · остаток ${order.remaining_qty}` : ''}
                      {Number(order.shipment_count) > 0 ? ` · отпр. ${order.shipment_count}` : ''}
                      {order.active_tracking ? ` · трек ${order.active_tracking}` : ''}
                    </small>
                  </span>
                </button>
                <div className="project-entry-actions">
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={async () => {
                      if (!window.confirm(`Удалить заказ ${order.order_no}?`)) return;
                      try {
                        await (window as any).api.deletePurchaseOrder(order.id);
                        if (selected?.id === order.id) { setSelected(null); setLines([]); setShipments([]); }
                        await load();
                        onChanged();
                        onNotice(`Удалён ${order.order_no}`);
                      } catch (e: any) {
                        setError(e?.message || 'Не удалось удалить заказ');
                      }
                    }}
                  >
                    Удалить
                  </button>
                </div>
              </div>
            ))}
          </section>
          <section className="card project-detail">
            {selected ? (
              <>
                <div className="table-header">
                  <div>
                    <div className="section-label">Заказ на закупку</div>
                    <h2>{selected.order_no}</h2>
                    <div className="subtext">
                      {PO_STATUS[selected.status]} · {selected.supplier_name || 'Без поставщика'}
                      {selected.expected_at ? ` · план поставки ${selected.expected_at}` : ''}
                      {selected.actual_received_at ? ` · факт поставки ${selected.actual_received_at}` : ''}
                      {selected.receive_location_name ? ` · приёмка: ${selected.receive_location_name}` : ''}
                      {selected.posted_by ? ` · провёл ${selected.posted_by}` : ''}
                    </div>
                  </div>
                  <div className="order-actions">
                    <button type="button" className="btn btn-secondary" disabled={printBusy} onClick={() => void openPrintPicker()}>Печать</button>
                    {selected.status === 'draft' && (
                      <button className="btn btn-primary" onClick={async () => {
                        try {
                          await (window as any).api.setPurchaseStatus(selected.id, 'ordered');
                          await openOrder(selected); await load(); onChanged();
                        } catch (e: any) { setError(e?.message || 'Не удалось сменить статус'); }
                      }}>Отправить</button>
                    )}
                    {canEditLines && <button className="btn btn-secondary" onClick={() => setPickerOpen(true)}>Добавить товар</button>}
                    {canUnreceive && <button className="btn btn-secondary" onClick={unreceivePo}>Отменить проведение</button>}
                    {selected.status === 'draft' && (
                      <button className="btn btn-danger" onClick={async () => {
                        if (!window.confirm('Отменить заказ?')) return;
                        try {
                          await (window as any).api.setPurchaseStatus(selected.id, 'cancelled');
                          await openOrder(selected); await load(); onChanged();
                        } catch (e: any) { setError(e?.message || 'Не удалось отменить'); }
                      }}>Отменить</button>
                    )}
                    <button className="btn btn-danger" onClick={async () => {
                      if (!window.confirm(`Удалить заказ ${selected.order_no}?`)) return;
                      try {
                        await (window as any).api.deletePurchaseOrder(selected.id);
                        setSelected(null); setLines([]);
                        await load(); onChanged(); onNotice('Заказ удалён');
                      } catch (e: any) { setError(e?.message || 'Не удалось удалить'); }
                    }}>Удалить заказ</button>
                  </div>
                </div>

                {canEditLines && (
                  <div className="project-create" style={{ marginBottom: 12 }}>
                    <select value={headerDraft.supplier_id} onChange={(e) => setHeaderDraft({ ...headerDraft, supplier_id: e.target.value })}>
                      <option value="">Поставщик</option>
                      {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    <DateField
                      label="Плановая дата поставки"
                      value={headerDraft.expected_at}
                      onChange={(expected_at) => setHeaderDraft({ ...headerDraft, expected_at })}
                    />
                    <input
                      placeholder="Комментарий"
                      value={headerDraft.note}
                      onChange={(e) => setHeaderDraft({ ...headerDraft, note: e.target.value })}
                    />
                    <button type="button" className="btn btn-secondary" onClick={saveHeader}>Сохранить шапку</button>
                  </div>
                )}

                {selected.status !== 'cancelled' && (
                  <div className="wizard-stock" style={{ marginBottom: 16 }}>
                    <div className="section-label">Доставка / трекинг</div>
                    <p className="subtext">Несколько отправлений по одному заказу: перевозчик, трек-номер, даты.</p>
                    {shipments.length === 0 && <p className="subtext">Отправлений пока нет.</p>}
                    {shipments.map((ship) => (
                      <div className="wizard-stock-row" key={ship.id}>
                        <span>
                          <strong>{ship.carrier || 'Перевозчик не указан'}</strong>
                          <small className="subtext mono">
                            {ship.tracking_no || 'без трека'}
                            {ship.shipped_at ? ` · отпр. ${ship.shipped_at}` : ''}
                            {ship.expected_at ? ` · ожид. ${ship.expected_at}` : ''}
                            {ship.delivered_at ? ` · достав. ${ship.delivered_at}` : ''}
                            {ship.note ? ` · ${ship.note}` : ''}
                          </small>
                        </span>
                        <strong>{SHIP_STATUS[ship.status] || ship.status}</strong>
                        <div className="row-actions">
                          {ship.status !== 'in_transit' && ship.status !== 'delivered' && (
                            <button type="button" className="btn btn-text" onClick={() => void setShipmentStatus(ship.id, 'in_transit')}>В пути</button>
                          )}
                          {ship.status !== 'delivered' && (
                            <button type="button" className="btn btn-text" onClick={() => void setShipmentStatus(ship.id, 'delivered')}>Доставлено</button>
                          )}
                          <button type="button" className="btn btn-text" onClick={() => void removeShipment(ship.id)}>Удалить</button>
                        </div>
                      </div>
                    ))}
                    {selected.status !== 'received' && (
                      <div className="project-create" style={{ marginTop: 8, flexWrap: 'wrap' }}>
                        <input
                          placeholder="Перевозчик (СДЭК, DPD…)"
                          value={shipForm.carrier}
                          onChange={(e) => setShipForm({ ...shipForm, carrier: e.target.value })}
                        />
                        <input
                          placeholder="Трек-номер"
                          value={shipForm.tracking_no}
                          onChange={(e) => setShipForm({ ...shipForm, tracking_no: e.target.value })}
                        />
                        <DateField
                          label="Отправлено"
                          value={shipForm.shipped_at}
                          onChange={(shipped_at) => setShipForm({ ...shipForm, shipped_at })}
                        />
                        <DateField
                          label="Ожидается"
                          value={shipForm.expected_at}
                          onChange={(expected_at) => setShipForm({ ...shipForm, expected_at })}
                        />
                        <select value={shipForm.status} onChange={(e) => setShipForm({ ...shipForm, status: e.target.value })}>
                          {Object.entries(SHIP_STATUS).filter(([k]) => k !== 'cancelled').map(([value, label]) => (
                            <option key={value} value={value}>{label}</option>
                          ))}
                        </select>
                        <input
                          placeholder="Комментарий"
                          value={shipForm.note}
                          onChange={(e) => setShipForm({ ...shipForm, note: e.target.value })}
                        />
                        <button type="button" className="btn btn-secondary" onClick={() => void addShipment()}>Добавить отправление</button>
                      </div>
                    )}
                  </div>
                )}

                {canReceive && (
                  <div className="receive-panel" style={{ marginBottom: 16, padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                    <div className="section-label">Проведение приёмки</div>
                    <div className="project-create" style={{ marginTop: 8 }}>
                      <LocationPicker
                        label="Ячейка приёмки"
                        value={receiveLocationId}
                        onChange={setReceiveLocationId}
                        allowEmpty={false}
                        emptyLabel="Выберите ячейку"
                      />
                      <DateField
                        label="Фактическая дата поставки"
                        value={actualReceivedAt}
                        onChange={setActualReceivedAt}
                      />
                      <button type="button" className="btn btn-primary" onClick={receivePo}>Провести приход</button>
                    </div>
                    <p className="subtext" style={{ marginTop: 8 }}>
                      Укажите количество и фактическую цену. Для «Упаковочной закупки» количество в заказе — в упаковках;
                      при приёмке галка «Уп.→шт» кладёт на склад штуки (цена остаётся за упаковку).
                    </p>
                  </div>
                )}

                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Товар</th>
                        <th>Заказано</th>
                        <th>Принято</th>
                        <th>Остаток</th>
                        {canReceive && <th>Принять</th>}
                        {canReceive && <th>Уп.→шт</th>}
                        {canReceive && <th>Шт в уп.</th>}
                        {canReceive && <th>Партия</th>}
                        {canReceive && <th>Годен до</th>}
                        {canReceive && <th>Серии</th>}
                        <th>План цена</th>
                        <th>Факт цена</th>
                        {canReceive && <th>Цена приёмки</th>}
                        <th>План сумма</th>
                        <th>Факт сумма</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {lines.length === 0 && (
                        <tr>
                          <td colSpan={canReceive ? 15 : 9} style={{ textAlign: 'center', color: 'var(--muted)', padding: 24 }}>Нет позиций</td>
                        </tr>
                      )}
                      {lines.map((line) => {
                        const remaining = Math.max(0, Number(line.remaining_qty ?? (line.quantity - (line.received_qty || 0))));
                        const planSum = Number(line.quantity || 0) * Number(line.unit_price || 0);
                        const factPrice = line.actual_unit_price ?? line.unit_price;
                        const factSum = Number(line.received_qty || 0) * Number(factPrice || 0);
                        const canExpand = Boolean(line.expand_packs)
                          || (Array.isArray(line.kit_components) && line.kit_components.length > 0);
                        const unpackOn = receiveUnpack[line.item_id] === true;
                        const contentHint = Number(receiveContentQty[line.item_id] || line.default_content_qty || 0);
                        const recvN = Number(receiveQty[line.item_id] || 0);
                        const qtyUnit = line.receive_qty_unit || (canExpand ? 'уп.' : 'шт');
                        return (
                          <tr key={line.item_id}>
                            <td className="strong">
                              {line.item_name}
                              <div className="subtext">
                                {line.sku}
                                {line.expand_packs ? ' · упаковочная закупка' : ''}
                              </div>
                              {canExpand && unpackOn && contentHint > 0 && recvN > 0 && (
                                <div className="subtext">→ на склад {recvN * contentHint} шт</div>
                              )}
                            </td>
                            <td>
                              {canEditLines ? (
                                <input
                                  type="number"
                                  min={1}
                                  style={{ width: 72 }}
                                  defaultValue={line.quantity}
                                  key={`q-${line.item_id}-${line.quantity}`}
                                  onBlur={(e) => {
                                    const next = Math.max(1, Math.floor(Number(e.target.value) || 1));
                                    if (next !== Number(line.quantity)) void saveLine(line, { quantity: next });
                                  }}
                                />
                              ) : line.quantity}
                              {canExpand && <div className="subtext">{qtyUnit}</div>}
                            </td>
                            <td>{line.received_qty || 0}{canExpand ? <div className="subtext">{qtyUnit}</div> : null}</td>
                            <td>{remaining}</td>
                            {canReceive && (
                              <td>
                                <input
                                  type="number"
                                  min={0}
                                  max={remaining}
                                  style={{ width: 72 }}
                                  value={receiveQty[line.item_id] ?? '0'}
                                  disabled={remaining <= 0}
                                  onChange={(e) => setReceiveQty((prev) => ({ ...prev, [line.item_id]: e.target.value }))}
                                  title={canExpand ? `Принять упаковок (${qtyUnit})` : 'Принять'}
                                />
                              </td>
                            )}
                            {canReceive && (
                              <td>
                                {canExpand ? (
                                  <input
                                    type="checkbox"
                                    checked={unpackOn}
                                    disabled={remaining <= 0}
                                    title={line.expand_packs
                                      ? 'Развернуть упаковки в штуки на этой же карточке'
                                      : 'Оприходовать штуки компонента, цена остаётся за упаковку'}
                                    onChange={(e) => setReceiveUnpack((prev) => ({ ...prev, [line.item_id]: e.target.checked }))}
                                  />
                                ) : <span className="subtext">—</span>}
                              </td>
                            )}
                            {canReceive && (
                              <td>
                                {canExpand && unpackOn ? (
                                  <input
                                    type="number"
                                    min={1}
                                    style={{ width: 72 }}
                                    value={receiveContentQty[line.item_id] ?? ''}
                                    disabled={remaining <= 0}
                                    placeholder={String(line.default_content_qty || '')}
                                    title="Сколько штук фактически в одной упаковке"
                                    onChange={(e) => setReceiveContentQty((prev) => ({ ...prev, [line.item_id]: e.target.value }))}
                                  />
                                ) : <span className="subtext">—</span>}
                              </td>
                            )}
                            {canReceive && (
                              <td>
                                <input
                                  style={{ width: 96 }}
                                  placeholder="№ партии"
                                  value={receiveLot[line.item_id] ?? ''}
                                  disabled={remaining <= 0}
                                  onChange={(e) => setReceiveLot((prev) => ({ ...prev, [line.item_id]: e.target.value }))}
                                  title={line.track_lots ? 'Обязательно для партионного товара' : 'Необязательно'}
                                />
                              </td>
                            )}
                            {canReceive && (
                              <td>
                                <input
                                  type="date"
                                  style={{ width: 132 }}
                                  value={receiveExpiry[line.item_id] ?? ''}
                                  disabled={remaining <= 0}
                                  onChange={(e) => setReceiveExpiry((prev) => ({ ...prev, [line.item_id]: e.target.value }))}
                                />
                              </td>
                            )}
                            {canReceive && (
                              <td>
                                <textarea
                                  rows={2}
                                  style={{ width: 140, fontSize: 12 }}
                                  placeholder={line.track_serials ? 'S/N *' : 'S/N'}
                                  value={receiveSerials[line.item_id] ?? ''}
                                  disabled={remaining <= 0 || unpackOn}
                                  title={unpackOn ? 'При разборке серии не используются' : (line.track_serials ? 'Обязательно: по одной серии на единицу' : 'Необязательно')}
                                  onChange={(e) => {
                                    const text = e.target.value;
                                    setReceiveSerials((prev) => ({ ...prev, [line.item_id]: text }));
                                    if (line.track_serials) {
                                      const count = text.split(/[\n,;\t]+/).map((s) => s.trim()).filter(Boolean).length;
                                      if (count > 0) setReceiveQty((prev) => ({ ...prev, [line.item_id]: String(count) }));
                                    }
                                  }}
                                />
                              </td>
                            )}
                            <td>
                              {canEditLines ? (
                                <input
                                  type="number"
                                  min={0}
                                  step="0.01"
                                  style={{ width: 88 }}
                                  defaultValue={line.unit_price ?? ''}
                                  key={`p-${line.item_id}-${line.unit_price}`}
                                  onBlur={(e) => {
                                    const raw = e.target.value.trim();
                                    const next = raw === '' ? null : Number(raw);
                                    const prev = line.unit_price == null ? null : Number(line.unit_price);
                                    if (next !== prev) void saveLine(line, { unit_price: next });
                                  }}
                                />
                              ) : money(line.unit_price)}
                            </td>
                            <td>{line.actual_unit_price != null ? money(line.actual_unit_price) : '—'}</td>
                            {canReceive && (
                              <td>
                                <input
                                  type="number"
                                  min={0}
                                  step="0.01"
                                  style={{ width: 88 }}
                                  value={receivePrice[line.item_id] ?? ''}
                                  disabled={remaining <= 0}
                                  onChange={(e) => setReceivePrice((prev) => ({ ...prev, [line.item_id]: e.target.value }))}
                                  title={unpackOn ? 'Цена за упаковку (не за штуку)' : 'Фактическая цена при приёмке'}
                                />
                              </td>
                            )}
                            <td>{line.unit_price != null ? money(planSum) : '—'}</td>
                            <td>{Number(line.received_qty || 0) > 0 && factPrice != null ? money(factSum) : '—'}</td>
                            <td>
                              {canEditLines && (
                                <button className="btn btn-danger" onClick={async () => {
                                  try {
                                    await (window as any).api.removePurchaseItem(selected.id, line.item_id);
                                    await openOrder(selected);
                                    onChanged();
                                  } catch (e: any) { setError(e?.message || 'Не удалось убрать позицию'); }
                                }}>Убрать</button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {(planTotal > 0 || factTotal > 0) && (
                  <div className="subtext" style={{ marginTop: 10 }}>
                    Итого план: <strong>{money(planTotal)}</strong>
                    {factTotal > 0 ? <> · факт: <strong>{money(factTotal)}</strong></> : null}
                  </div>
                )}
              </>
            ) : (
              <div className="empty">
                <h3>Выберите PO</h3>
                <p>Создайте заказ вручную или нажмите «Из плана». При приёмке укажите фактическую дату и цену — они попадут в журнал документов.</p>
              </div>
            )}
          </section>
        </div>
      )}
      {pickerOpen && selected && (
        <ItemPickerDialog items={items} onClose={() => setPickerOpen(false)} onPick={addLine} />
      )}
      {printOpen && selected && (
        <PrintJobDialog
          open
          title={`Печать · ${selected.order_no}`}
          forms={printForms}
          defaultFormId={printFormId}
          busy={printBusy}
          onClose={() => setPrintOpen(false)}
          onSubmit={confirmPrint}
        />
      )}
    </>
  );
}
