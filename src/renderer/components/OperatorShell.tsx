import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ScannerPanel, { ScanMode } from './ScannerPanel';
import StockOpsPanel from './StockOpsPanel';
import FloatingWidget from './FloatingWidget';
import InfoPage from './InfoPage';
import { getProcedure, PROCEDURES, unifiedSearch, type SearchHit } from '../procedureCatalog';
import { loadRecentProcedures, pushRecentProcedure } from '../procedureRecents';
import { greetingName } from '../userProfile';

type Props = {
  session: any;
  onLogout: () => void;
  onNotice: (message: string) => void;
  onOpenItem?: (ref: { id?: number; barcode?: string } | string) => void;
};

type OpMode = 'lookup' | 'receipt' | 'issue' | 'pair' | 'audit' | 'transfer';

type SessionLine = {
  id: string;
  itemId?: number;
  name: string;
  detail: string;
  qty: number;
  kind: 'in' | 'out' | 'lookup' | 'pair' | 'audit' | 'move';
};

const MODE_SCAN: Record<OpMode, ScanMode> = {
  lookup: 'item',
  receipt: 'receipt',
  issue: 'batch',
  pair: 'pair',
  audit: 'audit',
  transfer: 'item',
};

const MODE_TITLE: Record<OpMode, string> = {
  lookup: 'Поиск товара',
  receipt: 'Приход',
  issue: 'Расход',
  pair: 'Товар + ячейка',
  audit: 'Ревизия',
  transfer: 'Перемещение',
};

const MODE_META: Record<OpMode, { label: string; hint: string; icon: string; tone: string; countKey?: string }> = {
  lookup: { label: 'Поиск', hint: 'Карточка по штрихкоду', icon: '⌕', tone: 'amber' },
  receipt: { label: 'Приход', hint: 'Оприходовать на ячейку', icon: '↓', tone: 'teal', countKey: 'month_received' },
  issue: { label: 'Расход', hint: 'Списать со склада', icon: '↑', tone: 'coral', countKey: 'month_issued' },
  pair: { label: 'Товар + ячейка', hint: 'Два скана подряд', icon: '⇄', tone: 'sage' },
  audit: { label: 'Ревизия', hint: 'Пересчёт факта', icon: '☰', tone: 'slate', countKey: 'low_stock_count' },
  transfer: { label: 'Перемещение', hint: 'С ячейки на ячейку', icon: '⇢', tone: 'slate' },
};

function greetingForHour(hour: number) {
  if (hour >= 5 && hour < 12) return 'Доброе утро';
  if (hour >= 12 && hour < 17) return 'Добрый день';
  if (hour >= 17 && hour < 23) return 'Добрый вечер';
  return 'Доброй ночи';
}

function lineId() {
  return `line-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export default function OperatorShell({ session, onLogout, onNotice, onOpenItem }: Props) {
  const [mode, setMode] = useState<OpMode | null>(null);
  const [lastItem, setLastItem] = useState<any | null>(null);
  const [locations, setLocations] = useState<any[]>([]);
  const [locationId, setLocationId] = useState('');
  const [toLocationId, setToLocationId] = useState('');
  const [qty, setQty] = useState(1);
  const [auditId, setAuditId] = useState<number | null>(null);
  const [pairStatus, setPairStatus] = useState('');
  const [refreshToken, setRefreshToken] = useState(0);
  const [query, setQuery] = useState('');
  const [searchHits, setSearchHits] = useState<SearchHit[]>([]);
  const [sessionLines, setSessionLines] = useState<SessionLine[]>([]);
  const [stockLaunch, setStockLaunch] = useState<'writeoff' | 'surplus' | 'regrade' | 'disassemble' | 'assemble' | 'transfer' | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [recentIds, setRecentIds] = useState<string[]>(() => loadRecentProcedures(session?.organization?.id));
  const [transferDraft, setTransferDraft] = useState<Array<{ item_id: number; name: string; quantity: number }>>([]);
  const [transferBusy, setTransferBusy] = useState(false);
  const pairPending = useRef<{ kind: 'item' | 'location'; value: any } | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  function rememberProc(id: string) {
    setRecentIds(pushRecentProcedure(session?.organization?.id, id) || loadRecentProcedures(session?.organization?.id));
  }

  useEffect(() => {
    (window as any).api.getLocations().then((rows: any[]) => setLocations(rows || [])).catch(() => setLocations([]));
  }, [refreshToken]);

  useEffect(() => {
    setRecentIds(loadRecentProcedures(session?.organization?.id));
  }, [session?.organization?.id]);

  useEffect(() => {
    const value = query.trim();
    if (value.length < 1) {
      setSearchHits([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const hits = await unifiedSearch(value);
        if (!cancelled) setSearchHits(hits);
      } catch {
        if (!cancelled) setSearchHits([]);
      }
    }, 220);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [query]);

  const hello = useMemo(() => greetingForHour(new Date().getHours()), []);
  const name = greetingName(session?.user, 'Оператор');
  const org = session?.organization?.name || 'Метрика';

  const pushLine = useCallback((line: Omit<SessionLine, 'id'>) => {
    setSessionLines((current) => [{ ...line, id: lineId() }, ...current].slice(0, 40));
  }, []);

  const handleScan = useCallback(async (barcode: string) => {
    if (!mode) { onNotice('Сначала выберите операцию'); return; }
    const code = String(barcode || '').trim();
    if (!code) return;

    if (mode === 'audit') {
      if (!auditId) { onNotice('Сначала откройте ревизию по адресу'); return; }
      const item = await (window as any).api.findItemByBarcode(code);
      if (!item) { onNotice('Товар не найден'); return; }
      await (window as any).api.countInventory(auditId, item.id, 1);
      setLastItem(item);
      pushLine({ itemId: item.id, name: item.name, detail: 'Ревизия +1', qty: 1, kind: 'audit' });
      onNotice(`${item.name}: +1 в ревизию`);
      return;
    }

    if (mode === 'pair') {
      const [item, location] = await Promise.all([
        (window as any).api.findItemByBarcode(code),
        (window as any).api.findLocationByBarcode(code),
      ]);
      if (!item && !location) { onNotice('Код не найден'); return; }
      const scanned = item ? { kind: 'item' as const, value: item } : { kind: 'location' as const, value: location };
      const pending = pairPending.current;
      if (!pending || pending.kind === scanned.kind) {
        if (scanned.kind === 'item') setLastItem(scanned.value);
        else setLocationId(String(scanned.value.id));
        pairPending.current = scanned;
        setPairStatus(scanned.kind === 'item'
          ? `Товар: ${scanned.value.name}. Отсканируйте ячейку.`
          : `Ячейка: ${scanned.value.name}. Отсканируйте товар.`);
        return;
      }
      const scannedItem = scanned.kind === 'item' ? scanned.value : pending.value;
      const scannedLocation = scanned.kind === 'location' ? scanned.value : pending.value;
      try {
        await (window as any).api.adjustInventory({
          item_id: scannedItem.id,
          location_id: scannedLocation.id,
          delta: 1,
          comment: 'Оператор: товар+ячейка',
        });
        setLastItem(scannedItem);
        setLocationId(String(scannedLocation.id));
        pushLine({
          itemId: scannedItem.id,
          name: scannedItem.name,
          detail: `→ ${scannedLocation.name}`,
          qty: 1,
          kind: 'pair',
        });
        onNotice(`${scannedItem.name} → ${scannedLocation.name} (+1)`);
        setPairStatus('');
        pairPending.current = null;
        setRefreshToken((v) => v + 1);
      } catch (e: any) {
        onNotice(e?.message || 'Не удалось оприходовать');
      }
      return;
    }

    const item = await (window as any).api.findItemByBarcode(code);
    if (!item) { onNotice('Товар не найден в каталоге'); setLastItem(null); return; }
    setLastItem(item);

    if (mode === 'lookup') {
      pushLine({
        itemId: item.id,
        name: item.name,
        detail: (item.barcodes || [item.barcode]).filter(Boolean)[0] || item.sku || 'карточка',
        qty: 1,
        kind: 'lookup',
      });
      onNotice(`Найден: ${item.name}`);
      onOpenItem?.(item);
      return;
    }

    if (mode === 'transfer') {
      if (!locationId || !toLocationId) { onNotice('Выберите ячейку «откуда» и «куда»'); return; }
      if (String(locationId) === String(toLocationId)) { onNotice('Ячейки должны отличаться'); return; }
      const amount = Math.max(1, qty);
      const fromName = locations.find((l) => String(l.id) === String(locationId))?.name || 'откуда';
      const toName = locations.find((l) => String(l.id) === String(toLocationId))?.name || 'куда';
      setTransferDraft((current) => {
        const existing = current.find((row) => row.item_id === item.id);
        if (existing) {
          return current.map((row) => row.item_id === item.id
            ? { ...row, quantity: row.quantity + amount }
            : row);
        }
        return [...current, { item_id: item.id, name: item.name, quantity: amount }];
      });
      pushLine({
        itemId: item.id,
        name: item.name,
        detail: `${fromName} → ${toName} · черновик`,
        qty: amount,
        kind: 'move',
      });
      onNotice(`В черновик TR: ${item.name} × ${amount}`);
      return;
    }

    if (!locationId) { onNotice('Выберите ячейку'); return; }
    const delta = mode === 'issue' ? -Math.max(1, qty) : Math.max(1, qty);
    try {
      await (window as any).api.adjustInventory({
        item_id: item.id,
        location_id: Number(locationId),
        delta,
        comment: mode === 'issue' ? 'Оператор: расход' : 'Оператор: приход',
      });
      const locName = locations.find((l) => String(l.id) === String(locationId))?.name || 'ячейка';
      pushLine({
        itemId: item.id,
        name: item.name,
        detail: locName,
        qty: Math.abs(delta),
        kind: mode === 'issue' ? 'out' : 'in',
      });
      onNotice(`${mode === 'issue' ? 'Расход' : 'Приход'}: ${item.name} × ${Math.abs(delta)}`);
      setRefreshToken((v) => v + 1);
    } catch (e: any) {
      onNotice(e?.message || 'Операция отклонена');
    }
  }, [mode, auditId, locationId, toLocationId, qty, locations, onNotice, onOpenItem, pushLine]);

  async function startAudit() {
    if (!locationId) { onNotice('Выберите адрес ревизии'); return; }
    try {
      const result = await (window as any).api.startInventory(Number(locationId));
      setAuditId(result.id);
      setMode('audit');
      onNotice('Ревизия открыта');
    } catch (e: any) {
      onNotice(e?.message || 'Не удалось открыть ревизию');
    }
  }

  async function acceptAudit() {
    if (!auditId) return;
    if (!window.confirm('Принять факт ревизии?')) return;
    try {
      await (window as any).api.acceptInventory(auditId);
      setAuditId(null);
      onNotice('Ревизия принята');
      setRefreshToken((v) => v + 1);
    } catch (e: any) {
      onNotice(e?.message || 'Не удалось принять ревизию');
    }
  }

  async function postTransferDraft() {
    if (!locationId || !toLocationId) { onNotice('Укажите ячейки'); return; }
    if (!transferDraft.length) { onNotice('Добавьте товары в черновик сканом'); return; }
    setTransferBusy(true);
    try {
      const result = await (window as any).api.transferInventory({
        from_location_id: Number(locationId),
        to_location_id: Number(toLocationId),
        note: 'Оператор: перемещение',
        lines: transferDraft.map((row) => ({ item_id: row.item_id, quantity: row.quantity })),
      });
      const fromName = locations.find((l) => String(l.id) === String(locationId))?.name || 'откуда';
      const toName = locations.find((l) => String(l.id) === String(toLocationId))?.name || 'куда';
      pushLine({
        name: result.doc_no,
        detail: `${fromName} → ${toName} · ${result.lines} поз.`,
        qty: result.quantity,
        kind: 'move',
      });
      setTransferDraft([]);
      onNotice(`Проведено ${result.doc_no}: ${result.lines} поз. · ${result.quantity} ед.`);
      setRefreshToken((v) => v + 1);
    } catch (e: any) {
      onNotice(e?.message || 'Не удалось провести перемещение');
    } finally {
      setTransferBusy(false);
    }
  }

  async function printLastItem() {
    if (!lastItem?.id) return;
    try {
      const result = await (window as any).api.printItemLabels(lastItem.id);
      if (result === 'printed') onNotice('Этикетки отправлены');
      else if (result) onNotice(`Этикетки: ${result}`);
    } catch (e: any) {
      onNotice(e?.message || 'Печать не выполнена');
    }
  }

  function pickSearchHit(hit: SearchHit) {
    setQuery('');
    setSearchHits([]);
    if (hit.kind === 'procedure') {
      rememberProc(hit.id);
      if (hit.action === 'undo') {
        void (async () => {
          try {
            await (window as any).api.undoLastTransaction();
            onNotice('Последнее движение отменено');
            setRefreshToken((v) => v + 1);
          } catch (e: any) {
            onNotice(e?.message || 'Не удалось отменить');
          }
        })();
        return;
      }
      const op = hit.operatorMode;
      if (op === 'writeoff' || op === 'surplus' || op === 'regrade' || op === 'disassemble' || op === 'assemble') {
        setMode(null);
        setStockLaunch(op);
        onNotice(`Процедура: ${hit.name}`);
        return;
      }
      if (op === 'lookup' || op === 'receipt' || op === 'issue' || op === 'pair' || op === 'audit' || op === 'transfer') {
        setMode(op);
        onNotice(`Процедура: ${hit.name}`);
      }
      return;
    }
    const item = hit.item;
    setLastItem(item);
    if (!mode || mode === 'lookup') {
      setMode('lookup');
      pushLine({
        itemId: item.id,
        name: item.name,
        detail: (item.barcodes || [item.barcode]).filter(Boolean)[0] || item.sku || 'поиск',
        qty: 1,
        kind: 'lookup',
      });
      onOpenItem?.(item);
      return;
    }
    void handleScan(item.barcode || item.barcodes?.[0] || '');
  }

  const cells = locations.filter((l) => {
    const type = l.location_type || 'cell';
    return type === 'cell' || type === 'subwarehouse' || type === 'warehouse';
  });

  const sessionQty = sessionLines.reduce((sum, line) => sum + Number(line.qty || 0), 0);
  const draftQty = transferDraft.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
  const primaryCta = !mode
    ? { label: 'Выберите операцию', disabled: true, onClick: () => undefined }
    : mode === 'audit'
      ? auditId
        ? { label: 'Принять ревизию', disabled: false, onClick: () => void acceptAudit() }
        : { label: 'Открыть ревизию', disabled: !locationId, onClick: () => void startAudit() }
      : mode === 'lookup'
        ? { label: lastItem ? 'Открыть карточку' : 'Сканируйте товар', disabled: !lastItem, onClick: () => lastItem && onOpenItem?.(lastItem) }
        : mode === 'transfer'
          ? (!locationId || !toLocationId)
            ? { label: 'Укажите ячейки', disabled: true, onClick: () => undefined }
            : transferDraft.length
              ? { label: transferBusy ? 'Проведение…' : `Провести TR · ${transferDraft.length} поз. (${draftQty})`, disabled: transferBusy, onClick: () => void postTransferDraft() }
              : { label: 'Сканируйте товары в черновик', disabled: false, onClick: () => searchRef.current?.focus() }
          : { label: `${MODE_TITLE[mode]} · сканируйте`, disabled: false, onClick: () => searchRef.current?.focus() };

  const modes: OpMode[] = ['lookup', 'receipt', 'issue', 'transfer', 'pair', 'audit'];
  const recentProcs = recentIds.map((id) => getProcedure(id)).filter(Boolean);

  function startMode(next: OpMode, procId?: string) {
    if (procId) rememberProc(procId);
    else {
      const match = PROCEDURES.find((p) => p.operatorMode === next);
      if (match) rememberProc(match.id);
    }
    if (next !== 'transfer') setTransferDraft([]);
    setMode(next);
  }

  return (
    <div className="op-pos">
      <header className="op-pos-header">
        <div className="op-pos-brand">
          <div className="section-label">Склад · оператор</div>
          <h1>{mode ? MODE_TITLE[mode] : `${hello}, ${name}`}</h1>
          <p>{org} · рабочее место</p>
        </div>
        <div className="op-pos-search-wrap">
          <span className="op-pos-search-icon" aria-hidden="true">⌕</span>
          <input
            ref={searchRef}
            className="op-pos-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Товар, ревизия, расход, списание…"
            aria-label="Поиск товаров и процедур"
          />
          {(searchHits.length > 0 || query.trim()) && (
            <div className="op-pos-search-menu">
              {searchHits.length === 0 ? (
                <div className="op-pos-search-item" style={{ cursor: 'default' }}><span>Ничего не найдено</span></div>
              ) : searchHits.map((hit) => (
                <button key={`${hit.kind}-${hit.id}`} type="button" className="op-pos-search-item" onClick={() => pickSearchHit(hit)}>
                  <strong>
                    {hit.kind === 'procedure' ? <span className="search-hit-badge">Процедура</span> : null}
                    {hit.name}
                  </strong>
                  <span>{hit.hint}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="op-pos-header-actions">
          <button type="button" className="btn btn-secondary" onClick={() => setHelpOpen(true)}>Справка</button>
          {mode ? (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => { setMode(null); setPairStatus(''); pairPending.current = null; }}
            >
              ← Меню
            </button>
          ) : (
            <button type="button" className="btn btn-text" onClick={onLogout}>Выход</button>
          )}
        </div>
      </header>

      {helpOpen && (
        <FloatingWidget title="База знаний · оператор" open onClose={() => setHelpOpen(false)} width={880} zIndex={1820}>
          <InfoPage
            session={session}
            compact
            onClose={() => setHelpOpen(false)}
            onRunProcedure={(proc) => pickSearchHit(proc)}
          />
        </FloatingWidget>
      )}

      {stockLaunch ? (
        <StockOpsPanel
          compact
          onNotice={onNotice}
          onChanged={() => setRefreshToken((v) => v + 1)}
          launchKind={stockLaunch}
          onClosed={() => setStockLaunch(null)}
        />
      ) : null}

      <div className="op-pos-body">
        <div className="op-pos-main">
          {!mode ? (
            <div className="op-pos-menu">
              {recentProcs.length > 0 && (
                <section className="arm-group">
                  <div className="arm-group-head"><h2>Недавние</h2></div>
                  <div className="op-pos-recent">
                    {recentProcs.map((proc) => (
                      <button
                        key={proc!.id}
                        type="button"
                        className="op-pos-recent-chip"
                        onClick={() => pickSearchHit(proc!)}
                      >
                        {proc!.name}
                      </button>
                    ))}
                  </div>
                </section>
              )}
              <section className="arm-group">
                <div className="arm-group-head"><h2>Приёмка и размещение</h2></div>
                <div className="op-pos-tiles">
                  <button type="button" className="op-pos-tile tone-teal" onClick={() => startMode('receipt', 'receipt')}>
                    <span className="op-pos-tile-icon">↓</span>
                    <strong>Приход</strong>
                    <span className="op-pos-tile-hint">Оприходовать на ячейку</span>
                  </button>
                  <button type="button" className="op-pos-tile tone-sage" onClick={() => startMode('pair', 'pair')}>
                    <span className="op-pos-tile-icon">⇄</span>
                    <strong>Размещение</strong>
                    <span className="op-pos-tile-hint">Товар + ячейка</span>
                  </button>
                  <button type="button" className="op-pos-tile tone-amber" onClick={() => { rememberProc('surplus'); setStockLaunch('surplus'); }}>
                    <span className="op-pos-tile-icon">＋</span>
                    <strong>Излишки</strong>
                    <span className="op-pos-tile-hint">Акт оприходования</span>
                  </button>
                </div>
              </section>
              <section className="arm-group">
                <div className="arm-group-head"><h2>Отгрузка и расход</h2></div>
                <div className="op-pos-tiles">
                  <button type="button" className="op-pos-tile tone-coral" onClick={() => startMode('issue', 'issue')}>
                    <span className="op-pos-tile-icon">↑</span>
                    <strong>Расход</strong>
                    <span className="op-pos-tile-hint">Списать со склада</span>
                  </button>
                  <button type="button" className="op-pos-tile tone-coral" onClick={() => { rememberProc('writeoff'); setStockLaunch('writeoff'); }}>
                    <span className="op-pos-tile-icon">✕</span>
                    <strong>Списание</strong>
                    <span className="op-pos-tile-hint">Акт с основанием</span>
                  </button>
                  <button type="button" className="op-pos-tile tone-slate" onClick={() => startMode('audit', 'audit')}>
                    <span className="op-pos-tile-icon">☰</span>
                    <strong>Ревизия</strong>
                    <span className="op-pos-tile-hint">Пересчёт факта</span>
                  </button>
                </div>
              </section>
              <section className="arm-group">
                <div className="arm-group-head"><h2>Прочие операции</h2></div>
                <div className="op-pos-tiles">
                  <button type="button" className="op-pos-tile tone-slate" onClick={() => startMode('transfer', 'transfer')}>
                    <span className="op-pos-tile-icon">⇢</span>
                    <strong>Перемещение</strong>
                    <span className="op-pos-tile-hint">С ячейки на ячейку</span>
                  </button>
                  <button type="button" className="op-pos-tile tone-amber" onClick={() => startMode('lookup', 'lookup')}>
                    <span className="op-pos-tile-icon">⌕</span>
                    <strong>Поиск</strong>
                    <span className="op-pos-tile-hint">Карточка по скану</span>
                  </button>
                  <button type="button" className="op-pos-tile tone-sage" onClick={() => { rememberProc('regrade'); setStockLaunch('regrade'); }}>
                    <span className="op-pos-tile-icon">⇆</span>
                    <strong>Пересортица</strong>
                    <span className="op-pos-tile-hint">Товар → товар</span>
                  </button>
                </div>
              </section>
            </div>
          ) : (
            <>
              <div className="op-pos-modebar">
                {modes.map((id) => (
                  <button
                    key={id}
                    type="button"
                    className={`op-pos-modechip ${mode === id ? 'active' : ''} tone-${MODE_META[id].tone}`}
                    onClick={() => startMode(id)}
                  >
                    {MODE_META[id].label}
                  </button>
                ))}
              </div>

              <section className="op-pos-work card">
                <div className="section-label">Режим</div>
                <h2>{MODE_TITLE[mode]}</h2>
                <p className="subtext">
                  {mode === 'pair'
                    ? (pairStatus || 'Сканируйте товар и ячейку в любом порядке')
                    : mode === 'audit'
                      ? (auditId ? `Акт #${auditId} · сканируйте товары` : 'Выберите ячейку и откройте ревизию')
                      : mode === 'transfer'
                        ? transferDraft.length
                          ? `Черновик: ${transferDraft.length} поз. · ${draftQty} ед. · проведите TR`
                          : 'Укажите ячейки, сканируйте товары в черновик, затем проведите TR'
                        : 'Сканируйте штрихкод или найдите товар сверху'}
                </p>

                <ScannerPanel
                  page="inventory"
                  visible
                  forcedMode={MODE_SCAN[mode]}
                  onScan={(code) => { void handleScan(code); }}
                  pairStatus={pairStatus}
                  activeHint={
                    mode === 'pair'
                      ? 'Сканируйте товар и ячейку'
                      : mode === 'audit'
                        ? (auditId ? 'Сканируйте товары ревизии' : 'Откройте ревизию')
                        : 'Готов к скану'
                  }
                />

                <div className="form-grid" style={{ marginTop: 12 }}>
                  {mode === 'transfer' ? (
                    <>
                      <label>Откуда
                        <select value={locationId} onChange={(e) => setLocationId(e.target.value)}>
                          <option value="">Ячейка-источник</option>
                          {cells.map((l) => (
                            <option key={l.id} value={l.id}>
                              {l.name}{l.barcode ? ` · ${l.barcode}` : ''}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>Куда
                        <select value={toLocationId} onChange={(e) => setToLocationId(e.target.value)}>
                          <option value="">Ячейка-приёмник</option>
                          {cells.map((l) => (
                            <option key={l.id} value={l.id}>
                              {l.name}{l.barcode ? ` · ${l.barcode}` : ''}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>Количество
                        <input type="number" min={1} value={qty} onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))} />
                      </label>
                    </>
                  ) : (
                    <>
                      <label>Ячейка / адрес
                        <select value={locationId} onChange={(e) => setLocationId(e.target.value)}>
                          <option value="">Выберите адрес</option>
                          {cells.map((l) => (
                            <option key={l.id} value={l.id}>
                              {l.name}{l.barcode ? ` · ${l.barcode}` : ''}
                            </option>
                          ))}
                        </select>
                      </label>
                      {(mode === 'receipt' || mode === 'issue') && (
                        <label>Количество
                          <input type="number" min={1} value={qty} onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))} />
                        </label>
                      )}
                    </>
                  )}
                </div>

                {mode === 'audit' && (
                  <div className="op-pos-audit-actions">
                    {!auditId ? (
                      <button type="button" className="btn btn-primary" disabled={!locationId} onClick={() => void startAudit()}>
                        Открыть ревизию
                      </button>
                    ) : (
                      <>
                        <span className="connection-state connected">Акт #{auditId}</span>
                        <button type="button" className="btn btn-primary" onClick={() => void acceptAudit()}>Принять факт</button>
                        <button type="button" className="btn btn-text" onClick={() => setAuditId(null)}>Закрыть без принятия</button>
                      </>
                    )}
                  </div>
                )}
              </section>

              {lastItem && (
                <section className="op-pos-last card">
                  <div className="section-label">Последний товар</div>
                  <button type="button" className="op-pos-last-btn" onClick={() => onOpenItem?.(lastItem)}>
                    {(lastItem.photo_url || lastItem.has_photo) && (
                      <img className="item-card-photo" src={lastItem.photo_url || `metrika-photo://${lastItem.id}`} alt="" />
                    )}
                    <div>
                      <strong>{lastItem.name}</strong>
                      <span className="mono">{(lastItem.barcodes || [lastItem.barcode]).filter(Boolean).join(' · ') || '—'}</span>
                      <span className="subtext">
                        Артикул: {lastItem.sku || '—'} · Доступно: {lastItem.available ?? lastItem.total_qty ?? '—'} {lastItem.unit_symbol || 'шт.'}
                      </span>
                    </div>
                  </button>
                  <div className="order-actions">
                    <button type="button" className="btn btn-secondary" onClick={() => onOpenItem?.(lastItem)}>Карточка</button>
                    <button type="button" className="btn btn-secondary" onClick={() => void printLastItem()}>Этикетки</button>
                  </div>
                </section>
              )}
            </>
          )}
        </div>

        <aside className="op-pos-side">
          <div className="op-pos-side-head">
            <h2>Смена</h2>
            <span>{sessionLines.length ? `${sessionQty} ед.` : 'пусто'}</span>
          </div>
          <div className="op-pos-side-list">
            {sessionLines.length === 0 ? (
              <div className="op-pos-side-empty">
                <p>Здесь появятся сканы и операции текущей смены.</p>
              </div>
            ) : (
              sessionLines.map((line) => (
                <div className="op-pos-line" key={line.id}>
                  <div>
                    <strong>{line.name}</strong>
                    <span>{line.detail}</span>
                  </div>
                  <b className={`kind-${line.kind}`}>
                    {line.kind === 'out'
                      ? '−'
                      : line.kind === 'move'
                        ? '↔'
                        : line.kind === 'in' || line.kind === 'pair' || line.kind === 'audit'
                          ? '+'
                          : ''}
                    {line.qty}
                  </b>
                  <button
                    type="button"
                    className="op-pos-line-x"
                    title="Убрать из списка смены"
                    onClick={() => setSessionLines((rows) => rows.filter((row) => row.id !== line.id))}
                  >
                    ×
                  </button>
                </div>
              ))
            )}
          </div>
          <button
            type="button"
            className="op-pos-cta"
            disabled={primaryCta.disabled}
            onClick={primaryCta.onClick}
          >
            {primaryCta.label}
          </button>
          {transferDraft.length > 0 && mode === 'transfer' && (
            <button type="button" className="btn btn-text op-pos-clear" onClick={() => setTransferDraft([])}>
              Очистить черновик TR ({transferDraft.length})
            </button>
          )}
          {sessionLines.length > 0 && (
            <button type="button" className="btn btn-text op-pos-clear" onClick={() => setSessionLines([])}>
              Очистить список смены
            </button>
          )}
        </aside>
      </div>
    </div>
  );
}
