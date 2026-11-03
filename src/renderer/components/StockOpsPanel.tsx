import { useEffect, useState } from 'react';
import FloatingWidget from './FloatingWidget';
import LocationPicker from './LocationPicker';

type Kind = 'writeoff' | 'surplus' | 'regrade' | 'disassemble' | 'assemble' | 'transfer';

type Line = {
  item_id: number;
  name: string;
  quantity: number;
  track_lots?: boolean;
  track_serials?: boolean;
  lot_id?: number | null;
  lot_no?: string;
  expiry_date?: string;
  serials?: string;
  serial_options?: Array<{ id: number; serial_no: string }>;
  lot_options?: Array<{ id: number; lot_no: string; on_hand: number; expiry_date?: string | null }>;
};

const KIND_META: Record<Kind, { label: string; hint: string }> = {
  writeoff: { label: 'Списание', hint: 'Снять товар с остатка с указанием причины' },
  surplus: { label: 'Оприходование излишков', hint: 'Добавить найденный излишек на ячейку' },
  regrade: { label: 'Пересортица', hint: 'Один товар → другой в той же ячейке' },
  disassemble: { label: 'Разукомплектация', hint: 'Списать комплект и оприходовать компоненты' },
  assemble: { label: 'Комплектация', hint: 'Списать компоненты и оприходовать комплект' },
  transfer: { label: 'Перемещение', hint: 'Многострочная накладная между ячейками (TR)' },
};

type Props = {
  onNotice: (message: string) => void;
  onChanged: () => void;

  launchKind?: Kind | null;
  onLaunchConsumed?: () => void;
  onClosed?: () => void;

  compact?: boolean;

  accented?: boolean;
};

export default function StockOpsPanel({
  onNotice,
  onChanged,
  launchKind = null,
  onLaunchConsumed,
  onClosed,
  compact = false,
  accented = false,
}: Props) {
  const [open, setOpen] = useState(Boolean(launchKind) || compact);
  const [kind, setKind] = useState<Kind>(launchKind || 'writeoff');
  const [locationId, setLocationId] = useState('');
  const [toLocationId, setToLocationId] = useState('');
  const [note, setNote] = useState('');
  const [parentId, setParentId] = useState('');
  const [parents, setParents] = useState<any[]>([]);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<any[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [fromItem, setFromItem] = useState<any | null>(null);
  const [toItem, setToItem] = useState<any | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [components, setComponents] = useState<Line[]>([]);
  const [bomBase, setBomBase] = useState<Line[]>([]);
  const [pickTarget, setPickTarget] = useState<'line' | 'from' | 'to' | 'component'>('line');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!launchKind) return;
    setKind(launchKind);
    setOpen(true);
    onLaunchConsumed?.();
  }, [launchKind, onLaunchConsumed]);

  useEffect(() => {
    if (!open) return;
    (window as any).api.listDocumentParents?.().then((rows: any[]) => setParents(rows || [])).catch(() => setParents([]));
  }, [open]);

  useEffect(() => {
    const value = query.trim();
    if (value.length < 1) { setHits([]); return; }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const items = await (window as any).api.getItems(value);
        if (!cancelled) setHits((items || []).slice(0, 10));
      } catch {
        if (!cancelled) setHits([]);
      }
    }, 220);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [query]);

  useEffect(() => {
    if ((kind !== 'writeoff' && kind !== 'transfer') || !locationId || !lines.some((l) => l.track_lots || l.track_serials)) return;
    let cancelled = false;
    (async () => {
      const next = await Promise.all(lines.map(async (row) => {
        if (!row.track_lots && !row.track_serials) return row;
        let lotOptions = row.lot_options;
        let serialOptions = row.serial_options;
        try {
          if (row.track_lots && kind === 'writeoff') {
            lotOptions = await (window as any).api.listLotsAtLocation?.(row.item_id, Number(locationId)) || [];
          }
          if (row.track_serials) {
            serialOptions = await (window as any).api.listSerialsAtLocation?.(row.item_id, Number(locationId)) || [];
          }
        } catch {  }
        return { ...row, lot_options: lotOptions, serial_options: serialOptions };
      }));
      if (!cancelled) setLines(next);
    })();
    return () => { cancelled = true; };
  }, [kind, locationId]);

  function resetForm() {
    setLines([]);
    setFromItem(null);
    setToItem(null);
    setComponents([]);
    setBomBase([]);
    setQuantity(1);
    setNote('');
    setParentId('');
    setQuery('');
    setHits([]);
    setError('');
    setToLocationId('');
  }

  async function applyKitBom(item: any, kitCount: number) {
    try {
      const rows = await (window as any).api.listKitComponents?.(item.id);
      if (!rows?.length) {
        setBomBase([]);
        return;
      }
      const base = rows.map((row: any) => ({
        item_id: row.id,
        name: row.name,
        quantity: Math.max(1, Number(row.quantity) || 1),
      }));
      setBomBase(base);
      setComponents(base.map((row: Line) => ({ ...row, quantity: row.quantity * Math.max(1, kitCount) })));
    } catch {
      setBomBase([]);
    }
  }

  useEffect(() => {
    if ((kind !== 'disassemble' && kind !== 'assemble') || !bomBase.length) return;
    setComponents(bomBase.map((row) => ({ ...row, quantity: row.quantity * Math.max(1, quantity) })));
  }, [quantity, bomBase, kind]);

  async function pickItem(item: any) {
    setQuery('');
    setHits([]);
    if (pickTarget === 'from') {
      setFromItem(item);
      if (kind === 'disassemble' || kind === 'assemble') void applyKitBom(item, quantity);
      return;
    }
    if (pickTarget === 'to') { setToItem(item); return; }
    if (pickTarget === 'component') {
      setBomBase([]);
      setComponents((current) => {
        const existing = current.find((row) => row.item_id === item.id);
        if (existing) return current.map((row) => row.item_id === item.id ? { ...row, quantity: row.quantity + 1 } : row);
        return [...current, { item_id: item.id, name: item.name, quantity: 1 }];
      });
      return;
    }

    const trackLots = Boolean(Number(item.track_lots));
    const trackSerials = Boolean(Number(item.track_serials));
    let lotOptions: Line['lot_options'] = [];
    let serialOptions: Line['serial_options'] = [];
    if ((kind === 'writeoff' || kind === 'transfer') && locationId) {
      try {
        if (trackLots && kind === 'writeoff') lotOptions = await (window as any).api.listLotsAtLocation?.(item.id, Number(locationId)) || [];
        if (trackSerials) serialOptions = await (window as any).api.listSerialsAtLocation?.(item.id, Number(locationId)) || [];
      } catch {  }
    }

    setLines((current) => {
      const existing = current.find((row) => row.item_id === item.id && !trackLots && !trackSerials);
      if (existing && !trackLots && !trackSerials) {
        return current.map((row) => row.item_id === item.id ? { ...row, quantity: row.quantity + 1 } : row);
      }
      return [...current, {
        item_id: item.id,
        name: item.name,
        quantity: 1,
        track_lots: trackLots,
        track_serials: trackSerials,
        lot_id: kind === 'writeoff' ? null : undefined,
        lot_no: '',
        expiry_date: '',
        serials: '',
        lot_options: lotOptions,
        serial_options: serialOptions,
      }];
    });
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (kind === 'transfer') {
        if (!locationId || !toLocationId) { setError('Укажите ячейки «откуда» и «куда»'); setBusy(false); return; }
        if (!lines.length) { setError('Добавьте хотя бы одну строку'); setBusy(false); return; }
        for (const row of lines) {
          if (row.track_serials && !String(row.serials || '').trim()) {
            setError(`Укажите серийные номера для «${row.name}»`);
            setBusy(false);
            return;
          }
        }
        const result = await (window as any).api.transferInventory({
          from_location_id: Number(locationId),
          to_location_id: Number(toLocationId),
          note: note.trim() || undefined,
          lines: lines.map((row) => {
            const serialList = String(row.serials || '')
              .split(/[\n,;\t]+/)
              .map((s) => s.trim())
              .filter(Boolean);
            return {
              item_id: row.item_id,
              quantity: row.track_serials && serialList.length ? serialList.length : row.quantity,
              serials: serialList.length ? serialList : undefined,
            };
          }),
        });
        onNotice(`Перемещение: ${result.doc_no} · ${result.lines} поз. · ${result.quantity} ед.`);
        onChanged();
        resetForm();
        setOpen(false);
        onClosed?.();
        return;
      }

      if (!locationId) { setError('Выберите ячейку'); setBusy(false); return; }
      const payload: any = {
        kind,
        location_id: Number(locationId),
        note: note.trim() || undefined,
        parent_id: parentId ? Number(parentId) : undefined,
      };
      if (kind === 'writeoff' || kind === 'surplus') {
        for (const row of lines) {
          if (row.track_lots && kind === 'surplus' && !String(row.lot_no || '').trim()) {
            setError(`Укажите номер партии для «${row.name}»`);
            setBusy(false);
            return;
          }
          if (row.track_serials && !String(row.serials || '').trim()) {
            setError(`Укажите серийные номера для «${row.name}»`);
            setBusy(false);
            return;
          }
        }
        payload.lines = lines.map((row) => {
          const serialList = String(row.serials || '')
            .split(/[\n,;\t]+/)
            .map((s) => s.trim())
            .filter(Boolean);
          return {
            item_id: row.item_id,
            quantity: row.track_serials && serialList.length ? serialList.length : row.quantity,
            lot_id: row.lot_id != null && Number(row.lot_id) > 0 ? Number(row.lot_id) : undefined,
            lot_no: row.lot_no || undefined,
            expiry_date: row.expiry_date || undefined,
            serials: serialList.length ? serialList : undefined,
          };
        });
      } else if (kind === 'regrade') {
        payload.from_item_id = fromItem?.id;
        payload.to_item_id = toItem?.id;
        payload.quantity = quantity;
      } else if (kind === 'assemble') {
        payload.to_item_id = fromItem?.id;
        payload.from_item_id = fromItem?.id;
        payload.quantity = quantity;
        payload.components = components.map((row) => ({ item_id: row.item_id, quantity: row.quantity }));
      } else {
        payload.from_item_id = fromItem?.id;
        payload.quantity = quantity;
        payload.components = components.map((row) => ({ item_id: row.item_id, quantity: row.quantity }));
      }
      const result = await (window as any).api.postStockOp(payload);
      onNotice(`${KIND_META[kind].label}: ${result.doc_no} · строк ${result.lines}`);
      onChanged();
      resetForm();
      setOpen(false);
      onClosed?.();
    } catch (e: any) {
      setError(e?.message || 'Не удалось провести акт');
    } finally {
      setBusy(false);
    }
  }

  const menuKinds = (Object.keys(KIND_META) as Kind[]);
  const showLots = kind === 'writeoff' || kind === 'surplus';
  const showSerials = (showLots || kind === 'transfer') && lines.some((l) => l.track_serials);

  return (
    <>
      {!compact && (
        <section className="card audit-panel">
          <div className="section-label">Складские акты</div>
          <h2 style={{ marginTop: 4 }}>Списание · излишки · пересортица · перемещение · комплектация</h2>
          <p className="subtext">Каждый акт проводится одной транзакцией, пишет ledger и появляется в журнале документов с возможной связью «основание → следствие».</p>
          <div className={`work-tiles${accented ? '' : ' is-flat'}`} style={{ marginTop: 14 }}>
            {menuKinds.map((id) => (
              <button
                key={id}
                type="button"
                className={
                  accented
                    ? `work-tile tone-${id === 'writeoff' ? 'danger' : id === 'surplus' ? 'primary' : id === 'transfer' ? 'neutral' : 'accent'}`
                    : 'work-tile tone-neutral'
                }
                onClick={() => { setKind(id); setOpen(true); resetForm(); }}
              >
                <span className="work-tile-label">{KIND_META[id].label}</span>
                <span className="work-tile-hint">{KIND_META[id].hint}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {open && (
        <FloatingWidget
          title={KIND_META[kind].label}
          open
          onClose={() => { setOpen(false); onClosed?.(); }}
          width={showLots || showSerials ? 780 : 640}
          zIndex={1760}
        >
          <form onSubmit={submit}>
            <p className="subtext" style={{ marginTop: 0 }}>{KIND_META[kind].hint}</p>
            <div className="form-grid">
              <label>Вид акта
                <select value={kind} onChange={(e) => { setKind(e.target.value as Kind); resetForm(); }}>
                  {menuKinds.map((id) => (
                    <option key={id} value={id}>{KIND_META[id].label}</option>
                  ))}
                </select>
              </label>
              {kind === 'transfer' ? (
                <>
                  <LocationPicker
                    label="Откуда"
                    value={locationId}
                    onChange={setLocationId}
                    emptyLabel="Ячейка-источник"
                  />
                  <LocationPicker
                    label="Куда"
                    value={toLocationId}
                    onChange={setToLocationId}
                    emptyLabel="Ячейка-приёмник"
                  />
                </>
              ) : (
                <LocationPicker
                  label="Ячейка"
                  value={locationId}
                  onChange={setLocationId}
                  emptyLabel="Выберите ячейку"
                />
              )}
              <label className="field-wide">Комментарий
                <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Причина / основание" />
              </label>
              {kind !== 'transfer' && (
                <label className="field-wide">Документ-основание
                  <select value={parentId} onChange={(e) => setParentId(e.target.value)}>
                    <option value="">Без основания</option>
                    {parents.map((doc) => (
                      <option key={doc.id} value={doc.id}>
                        {doc.doc_no} · {doc.doc_type} · {doc.party || doc.note || ''}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>

            <div className="form-grid" style={{ marginTop: 12 }}>
              <label className="field-wide">Поиск товара
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onFocus={() => {
                    if (kind === 'regrade' && !fromItem) setPickTarget('from');
                    else if (kind === 'regrade' && fromItem && !toItem) setPickTarget('to');
                    else if ((kind === 'disassemble' || kind === 'assemble') && !fromItem) setPickTarget('from');
                    else if (kind === 'disassemble' || kind === 'assemble') setPickTarget('component');
                    else setPickTarget('line');
                  }}
                  placeholder="Название, артикул, штрихкод"
                />
              </label>
            </div>
            {hits.length > 0 && (
              <div className="workspace-menu" style={{ position: 'relative', width: '100%', marginTop: 6 }}>
                {hits.map((item) => (
                  <button key={item.id} type="button" className="workspace-menu-item" onClick={() => void pickItem(item)}>
                    <strong>{item.name}</strong>
                    <span>
                      {item.sku || '—'} · доступно {item.available ?? item.total_qty ?? 0}
                      {Number(item.track_lots) ? ' · партии' : ''}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {(kind === 'writeoff' || kind === 'surplus' || kind === 'transfer') && (
              <div className="table-scroll" style={{ marginTop: 12, maxHeight: 280 }}>
                <table>
                  <thead>
                    <tr>
                      <th>Товар</th>
                      <th>Кол-во</th>
                      {showLots && <th>Партия</th>}
                      {showSerials && <th>Серии</th>}
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.length === 0 && (
                      <tr>
                        <td colSpan={(showLots ? 1 : 0) + (showSerials ? 1 : 0) + 3} style={{ textAlign: 'center', color: 'var(--muted)' }}>
                          Добавьте строки поиском
                        </td>
                      </tr>
                    )}
                    {lines.map((row, idx) => (
                      <tr key={`${row.item_id}-${idx}`}>
                        <td className="strong">
                          {row.name}
                          {row.track_lots && <div className="subtext" style={{ margin: 0 }}>учёт партий</div>}
                          {row.track_serials && <div className="subtext" style={{ margin: 0 }}>серийные номера</div>}
                        </td>
                        <td>
                          <input
                            type="number"
                            min={0.000001}
                            step="any"
                            value={row.quantity}
                            style={{ width: 80 }}
                            disabled={Boolean(row.track_serials)}
                            title={row.track_serials ? 'Кол-во = числу серий' : undefined}
                            onChange={(e) => setLines((current) => current.map((line, i) => i === idx ? { ...line, quantity: Math.max(0.000001, Number(e.target.value) || 0.000001) } : line))}
                          />
                        </td>
                        {showLots && (
                          <td style={{ minWidth: 160 }}>
                            {!row.track_lots ? (
                              <span className="subtext">—</span>
                            ) : kind === 'writeoff' ? (
                              <select
                                value={row.lot_id == null ? '' : String(row.lot_id)}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  setLines((current) => current.map((line, i) => i === idx
                                    ? { ...line, lot_id: v === '' ? null : Number(v) }
                                    : line));
                                }}
                              >
                                <option value="">Авто (FIFO/FEFO)</option>
                                {(row.lot_options || []).map((opt) => (
                                  <option key={opt.id} value={opt.id}>
                                    {opt.lot_no} · {opt.on_hand}
                                    {opt.expiry_date ? ` · до ${opt.expiry_date}` : ''}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <div style={{ display: 'grid', gap: 4 }}>
                                <input
                                  value={row.lot_no || ''}
                                  placeholder="№ партии *"
                                  onChange={(e) => setLines((current) => current.map((line, i) => i === idx ? { ...line, lot_no: e.target.value } : line))}
                                />
                                <input
                                  type="date"
                                  value={row.expiry_date || ''}
                                  title="Срок годности"
                                  onChange={(e) => setLines((current) => current.map((line, i) => i === idx ? { ...line, expiry_date: e.target.value } : line))}
                                />
                              </div>
                            )}
                          </td>
                        )}
                        {showSerials && (
                          <td style={{ minWidth: 180 }}>
                            {!row.track_serials ? (
                              <span className="subtext">—</span>
                            ) : (
                              <div style={{ display: 'grid', gap: 4 }}>
                                <textarea
                                  rows={2}
                                  placeholder="S/N через Enter или запятую"
                                  value={row.serials || ''}
                                  onChange={(e) => {
                                    const text = e.target.value;
                                    const count = text.split(/[\n,;\t]+/).map((s) => s.trim()).filter(Boolean).length;
                                    setLines((current) => current.map((line, i) => i === idx
                                      ? { ...line, serials: text, quantity: Math.max(1, count || 1) }
                                      : line));
                                  }}
                                />
                                {(kind === 'writeoff' || kind === 'transfer') && (row.serial_options || []).length > 0 && (
                                  <select
                                    value=""
                                    onChange={(e) => {
                                      const sn = e.target.value;
                                      if (!sn) return;
                                      setLines((current) => current.map((line, i) => {
                                        if (i !== idx) return line;
                                        const parts = String(line.serials || '').split(/[\n,;\t]+/).map((s) => s.trim()).filter(Boolean);
                                        if (parts.includes(sn)) return line;
                                        const next = [...parts, sn].join('\n');
                                        return { ...line, serials: next, quantity: parts.length + 1 };
                                      }));
                                    }}
                                  >
                                    <option value="">+ из остатка…</option>
                                    {(row.serial_options || []).map((opt) => (
                                      <option key={opt.id} value={opt.serial_no}>{opt.serial_no}</option>
                                    ))}
                                  </select>
                                )}
                              </div>
                            )}
                          </td>
                        )}
                        <td>
                          <button
                            type="button"
                            className="btn btn-text"
                            onClick={() => setLines((current) => current.filter((_, i) => i !== idx))}
                          >
                            ×
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {kind === 'regrade' && (
              <div className="form-grid" style={{ marginTop: 12 }}>
                <label>Списать (было)
                  <button type="button" className="btn btn-secondary" style={{ width: '100%' }} onClick={() => setPickTarget('from')}>
                    {fromItem ? fromItem.name : 'Выбрать товар…'}
                  </button>
                </label>
                <label>Оприходовать (стало)
                  <button type="button" className="btn btn-secondary" style={{ width: '100%' }} onClick={() => setPickTarget('to')}>
                    {toItem ? toItem.name : 'Выбрать товар…'}
                  </button>
                </label>
                <label>Количество
                  <input type="number" min={0.000001} step="any" value={quantity} onChange={(e) => setQuantity(Math.max(0.000001, Number(e.target.value) || 0.000001))} />
                </label>
              </div>
            )}

            {(kind === 'disassemble' || kind === 'assemble') && (
              <>
                <div className="form-grid" style={{ marginTop: 12 }}>
                  <label>{kind === 'assemble' ? 'Комплект (результат)' : 'Комплект'}
                    <button type="button" className="btn btn-secondary" style={{ width: '100%' }} onClick={() => setPickTarget('from')}>
                      {fromItem ? fromItem.name : 'Выбрать комплект…'}
                    </button>
                  </label>
                  <label>Кол-во комплектов
                    <input type="number" min={0.000001} step="any" value={quantity} onChange={(e) => setQuantity(Math.max(0.000001, Number(e.target.value) || 0.000001))} />
                  </label>
                </div>
                <div className="table-header" style={{ marginTop: 12 }}>
                  <div>
                    <div className="section-label">{kind === 'assemble' ? 'Списать компоненты' : 'Компоненты'}</div>
                    {bomBase.length > 0 && <p className="subtext" style={{ margin: 0 }}>Из состава комплекта · масштабируется с количеством</p>}
                  </div>
                  <button type="button" className="btn btn-text" onClick={() => { setBomBase([]); setPickTarget('component'); }}>+ компонент</button>
                </div>
                <div className="table-scroll" style={{ maxHeight: 180 }}>
                  <table>
                    <thead><tr><th>Товар</th><th>Кол-во</th><th></th></tr></thead>
                    <tbody>
                      {components.length === 0 && <tr><td colSpan={3} style={{ textAlign: 'center', color: 'var(--muted)' }}>Добавьте компоненты</td></tr>}
                      {components.map((row) => (
                        <tr key={row.item_id}>
                          <td className="strong">{row.name}</td>
                          <td>
                            <input
                              type="number"
                              min={0.000001}
                              step="any"
                              value={row.quantity}
                              style={{ width: 80 }}
                              onChange={(e) => setComponents((current) => current.map((line) => line.item_id === row.item_id ? { ...line, quantity: Math.max(0.000001, Number(e.target.value) || 0.000001) } : line))}
                            />
                          </td>
                          <td><button type="button" className="btn btn-text" onClick={() => setComponents((current) => current.filter((line) => line.item_id !== row.item_id))}>×</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {error && <div className="form-error">{error}</div>}
            <div className="modal-actions">
              <button type="button" className="btn btn-text" onClick={() => { setOpen(false); onClosed?.(); }}>Отмена</button>
              <button className="btn btn-primary" disabled={busy}>Провести</button>
            </div>
          </form>
        </FloatingWidget>
      )}
    </>
  );
}
