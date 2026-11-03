import { useEffect, useMemo, useState } from 'react';
import FloatingWidget from './FloatingWidget';
import ItemPickerDialog from './ItemPickerDialog';
import { useCurrency } from '../currency';

type Props = {
  refreshToken: number;
  onChanged: () => void;
  onNotice: (message: string) => void;
};

const EMPTY_FORM = {
  name: '',
  contact: '',
  email: '',
  phone: '',
  inn: '',
  address: '',
  note: '',
  priority: '100',
  default_lead_days: '',
  is_active: true,
};

export default function SuppliersPanel({ refreshToken, onChanged, onNotice }: Props) {
  const { symbol } = useCurrency();
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [lines, setLines] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [onlyActive, setOnlyActive] = useState(true);
  const [error, setError] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editLine, setEditLine] = useState<any | null>(null);

  const selected = suppliers.find((s) => s.id === selectedId) || null;

  async function load() {
    const [list, catalog] = await Promise.all([
      (window as any).api.getSuppliers(),
      (window as any).api.getItems(),
    ]);
    setSuppliers(list || []);
    setItems(catalog || []);
  }

  async function openSupplier(id: number) {
    setSelectedId(id);
    setError('');
    try {
      const row = await (window as any).api.getSupplier?.(id)
        || (await (window as any).api.getSuppliers()).find((s: any) => s.id === id);
      if (!row) throw new Error('Поставщик не найден');
      setForm({
        name: row.name || '',
        contact: row.contact || '',
        email: row.email || '',
        phone: row.phone || '',
        inn: row.inn || '',
        address: row.address || '',
        note: row.note || '',
        priority: String(row.priority ?? 100),
        default_lead_days: row.default_lead_days != null ? String(row.default_lead_days) : '',
        is_active: row.is_active === undefined || row.is_active === null ? true : Boolean(Number(row.is_active)),
      });
      setLines((await (window as any).api.getSupplierItems(id)) || []);
    } catch (e: any) {
      setError(e?.message || 'Не удалось открыть поставщика');
    }
  }

  useEffect(() => { void load(); }, [refreshToken]);

  useEffect(() => {
    if (selectedId && !suppliers.some((s) => s.id === selectedId)) {
      setSelectedId(null);
      setForm({ ...EMPTY_FORM });
      setLines([]);
    }
  }, [suppliers, selectedId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase();
    return suppliers.filter((s) => {
      if (onlyActive && s.is_active === 0) return false;
      if (!q) return true;
      return `${s.name} ${s.contact || ''} ${s.email || ''} ${s.phone || ''} ${s.inn || ''} ${s.note || ''}`
        .toLocaleLowerCase()
        .includes(q);
    });
  }, [suppliers, search, onlyActive]);

  function startCreate() {
    setSelectedId(null);
    setForm({ ...EMPTY_FORM });
    setLines([]);
    setError('');
  }

  async function saveSupplier(event: React.FormEvent) {
    event.preventDefault();
    if (!form.name.trim()) { setError('Укажите название поставщика'); return; }
    const payload = {
      name: form.name.trim(),
      contact: form.contact.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      inn: form.inn.trim(),
      address: form.address.trim(),
      note: form.note.trim(),
      priority: Number(form.priority) || 100,
      default_lead_days: form.default_lead_days === '' ? null : Number(form.default_lead_days),
      is_active: form.is_active ? 1 : 0,
    };
    try {
      if (selectedId) {
        await (window as any).api.updateSupplier(selectedId, payload);
        onNotice(`Поставщик «${payload.name}» сохранён`);
        await load();
        await openSupplier(selectedId);
      } else {
        const created = await (window as any).api.createSupplier(payload);
        onNotice(`Поставщик «${payload.name}» создан`);
        await load();
        if (created?.id) await openSupplier(Number(created.id));
      }
      onChanged();
      setError('');
    } catch (e: any) {
      setError(e?.message || 'Не удалось сохранить поставщика');
    }
  }

  async function removeSupplier() {
    if (!selectedId || !selected) return;
    if (!window.confirm(`Удалить поставщика «${selected.name}»?`)) return;
    try {
      await (window as any).api.deleteSupplier(selectedId);
      onNotice('Поставщик удалён');
      startCreate();
      await load();
      onChanged();
    } catch (e: any) {
      setError(e?.message || 'Не удалось удалить');
    }
  }

  async function addItem(item: any) {
    if (!selectedId) return;
    try {
      await (window as any).api.upsertSupplierItem({
        supplier_id: selectedId,
        item_id: item.id,
        supplier_sku: item.supplier_sku || item.sku || null,
        price: item.cost_price ?? null,
        lead_time_days: form.default_lead_days === '' ? null : Number(form.default_lead_days),
        moq: item.moq ?? null,
        pack_multiple: item.pack_multiple ?? null,
        url: item.purchase_url || null,
      });
      setPickerOpen(false);
      setLines((await (window as any).api.getSupplierItems(selectedId)) || []);
      await load();
      onChanged();
      onNotice(`${item.name} добавлен в прайс поставщика`);
    } catch (e: any) {
      setError(e?.message || 'Не удалось добавить товар');
    }
  }

  async function saveLine(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedId || !editLine) return;
    try {
      await (window as any).api.upsertSupplierItem({
        supplier_id: selectedId,
        item_id: editLine.item_id,
        supplier_sku: editLine.supplier_sku,
        price: editLine.price,
        lead_time_days: editLine.lead_time_days,
        moq: editLine.moq,
        pack_multiple: editLine.pack_multiple,
        url: editLine.url,
        last_purchase_date: editLine.last_purchase_date || null,
      });
      setEditLine(null);
      setLines((await (window as any).api.getSupplierItems(selectedId)) || []);
      onChanged();
      onNotice('Позиция прайса сохранена');
    } catch (e: any) {
      setError(e?.message || 'Не удалось сохранить позицию');
    }
  }

  return (
    <div className="project-layout suppliers-layout">
      <section className="card project-list">
        <div className="table-header">
          <div>
            <div className="section-label">Справочник</div>
            <h2>Поставщики</h2>
          </div>
          <button type="button" className="btn btn-primary" onClick={startCreate}>Новый</button>
        </div>
        <div className="project-list-tools">
          <input placeholder="Поиск: название, контакт, ИНН…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <label className="smart-check" style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
            <input type="checkbox" checked={onlyActive} onChange={(e) => setOnlyActive(e.target.checked)} />
            Активные
          </label>
        </div>
        {filtered.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`project-row ${selectedId === s.id ? 'active' : ''}`}
            onClick={() => void openSupplier(s.id)}
          >
            <span>
              <strong>{s.name}</strong>
              <small>
                {s.is_active === 0 ? 'неактивен · ' : ''}
                {s.item_count || 0} поз. · PO открытых: {s.open_po_count || 0}
                {s.phone ? ` · ${s.phone}` : s.contact ? ` · ${s.contact}` : ''}
              </small>
            </span>
          </button>
        ))}
        {filtered.length === 0 && (
          <div className="empty" style={{ padding: 24 }}>
            <p>{suppliers.length ? 'Нет совпадений' : 'Создайте первого поставщика'}</p>
          </div>
        )}
      </section>

      <section className="card project-detail suppliers-detail">
        {error && <div className="form-error page-error">{error}</div>}
        <div className="table-header">
          <div>
            <div className="section-label">{selectedId ? 'Карточка поставщика' : 'Новый поставщик'}</div>
            <h2>{selectedId ? (form.name || 'Поставщик') : 'Создание'}</h2>
          </div>
          {selectedId && (
            <button type="button" className="btn btn-danger" onClick={() => void removeSupplier()}>Удалить</button>
          )}
        </div>

        <form className="supplier-form" onSubmit={saveSupplier}>
          <div className="form-grid">
            <label>Название *
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="ООО Поставщик" required />
            </label>
            <label>Приоритет
              <input type="number" min={1} value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} />
            </label>
            <label>Контактное лицо
              <input value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} placeholder="ФИО / отдел" />
            </label>
            <label>Телефон
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+7…" />
            </label>
            <label>Email
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="mail@example.com" />
            </label>
            <label>ИНН
              <input value={form.inn} onChange={(e) => setForm({ ...form, inn: e.target.value })} />
            </label>
            <label>Срок поставки, ден.
              <input type="number" min={0} value={form.default_lead_days} onChange={(e) => setForm({ ...form, default_lead_days: e.target.value })} placeholder="14" />
            </label>
            <label className="smart-check" style={{ alignSelf: 'end' }}>
              <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
              Активен
            </label>
            <label className="span-2">Адрес
              <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </label>
            <label className="span-2">Заметка
              <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            </label>
          </div>
          <div className="order-actions" style={{ marginTop: 12 }}>
            <button type="submit" className="btn btn-primary">{selectedId ? 'Сохранить' : 'Создать'}</button>
            {selectedId && <button type="button" className="btn btn-secondary" onClick={startCreate}>Сбросить</button>}
          </div>
        </form>

        {selectedId ? (
          <>
            <div className="table-header" style={{ marginTop: 20 }}>
              <div>
                <div className="section-label">Прайс</div>
                <h2>Товары поставщика</h2>
              </div>
              <button type="button" className="btn btn-secondary" onClick={() => setPickerOpen(true)}>Добавить товар</button>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Товар</th>
                    <th>Арт. пост.</th>
                    <th>Цена</th>
                    <th>Lead</th>
                    <th>MOQ</th>
                    <th>Кратность</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {lines.length === 0 && (
                    <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--muted)', padding: 24 }}>Нет позиций — добавьте товары в прайс</td></tr>
                  )}
                  {lines.map((line) => (
                    <tr key={line.id}>
                      <td className="strong">{line.item_name}<div className="subtext mono">{line.sku || '—'}</div></td>
                      <td className="mono">{line.supplier_sku || '—'}</td>
                      <td>{line.price != null ? `${line.price} ${symbol}` : '—'}</td>
                      <td>{line.lead_time_days ?? '—'}</td>
                      <td>{line.moq ?? '—'}</td>
                      <td>{line.pack_multiple ?? '—'}</td>
                      <td>
                        <div className="order-actions">
                          <button type="button" className="btn btn-text" onClick={() => setEditLine({ ...line })}>Изменить</button>
                          <button
                            type="button"
                            className="btn btn-danger"
                            onClick={async () => {
                              if (!window.confirm(`Убрать «${line.item_name}» из прайса?`)) return;
                              try {
                                await (window as any).api.deleteSupplierItem(line.id);
                                setLines((await (window as any).api.getSupplierItems(selectedId)) || []);
                                await load();
                                onChanged();
                              } catch (e: any) {
                                setError(e?.message || 'Не удалось удалить позицию');
                              }
                            }}
                          >
                            Убрать
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="empty" style={{ marginTop: 24 }}>
            <h3>Карточка поставщика</h3>
            <p>Заполните реквизиты и сохраните. После создания можно привязать товары, цены, MOQ и срок поставки.</p>
          </div>
        )}
      </section>

      {pickerOpen && selectedId && (
        <ItemPickerDialog items={items} onClose={() => setPickerOpen(false)} onPick={(item) => { void addItem(item); }} />
      )}

      {editLine && (
        <FloatingWidget title={`Прайс: ${editLine.item_name}`} open onClose={() => setEditLine(null)} width={520} zIndex={1830}>
            <form className="form-grid" onSubmit={saveLine}>
              <label>Артикул поставщика
                <input value={editLine.supplier_sku || ''} onChange={(e) => setEditLine({ ...editLine, supplier_sku: e.target.value })} />
              </label>
              <label>Цена, {symbol}
                <input type="number" step="0.01" min={0} value={editLine.price ?? ''} onChange={(e) => setEditLine({ ...editLine, price: e.target.value })} />
              </label>
              <label>Срок поставки, дн.
                <input type="number" min={0} value={editLine.lead_time_days ?? ''} onChange={(e) => setEditLine({ ...editLine, lead_time_days: e.target.value })} />
              </label>
              <label>MOQ
                <input type="number" min={0} value={editLine.moq ?? ''} onChange={(e) => setEditLine({ ...editLine, moq: e.target.value })} />
              </label>
              <label>Кратность
                <input type="number" min={1} value={editLine.pack_multiple ?? ''} onChange={(e) => setEditLine({ ...editLine, pack_multiple: e.target.value })} />
              </label>
              <label>Ссылка
                <input value={editLine.url || ''} onChange={(e) => setEditLine({ ...editLine, url: e.target.value })} />
              </label>
              <div className="modal-actions span-2">
                <button type="submit" className="btn btn-primary">Сохранить</button>
                <button type="button" className="btn btn-secondary" onClick={() => setEditLine(null)}>Отмена</button>
              </div>
            </form>
        </FloatingWidget>
      )}
    </div>
  );
}
