import { useEffect, useState } from 'react';
import FloatingWidget from './FloatingWidget';
import EntityCustomFields, { customValuesFromFields } from './EntityCustomFields';

type TabId = 'counterparties' | 'contracts' | 'sales' | 'prices' | 'directions';

type Props = {
  refreshToken: number;
  onNotice: (msg: string) => void;
  onChanged: () => void;
  initialTab?: TabId;
  
  embedded?: boolean;
  hideTabs?: TabId[];
};

const TABS: { id: TabId; label: string; hint: string }[] = [
  { id: 'counterparties', label: 'Контрагенты', hint: 'Покупатели, поставщики, партнёры' },
  { id: 'contracts', label: 'Договоры', hint: 'Договоры с контрагентами' },
  { id: 'sales', label: 'Заказы покупателей', hint: 'Продажи и отгрузка' },
  { id: 'prices', label: 'Виды цен', hint: 'Прайс-листы номенклатуры' },
  { id: 'directions', label: 'Направления', hint: 'Разделы учёта / аналитика' },
];

const KIND_RU: Record<string, string> = {
  customer: 'Покупатель',
  supplier: 'Поставщик',
  partner: 'Партнёр',
  other: 'Прочий',
};

export default function CompanyUnfPage({ refreshToken, onNotice, onChanged, initialTab, embedded, hideTabs }: Props) {
  const [tab, setTab] = useState<TabId>(initialTab || 'counterparties');
  const [counterparties, setCounterparties] = useState<any[]>([]);
  const [contracts, setContracts] = useState<any[]>([]);
  const [sales, setSales] = useState<any[]>([]);
  const [priceTypes, setPriceTypes] = useState<any[]>([]);
  const [itemPrices, setItemPrices] = useState<any[]>([]);
  const [directions, setDirections] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [editing, setEditing] = useState<{ kind: TabId; row?: any } | null>(null);
  const [form, setForm] = useState<any>({});
  const [priceTypeFilter, setPriceTypeFilter] = useState<number | ''>('');
  const [error, setError] = useState('');

  async function load() {
    try {
      const [cp, ct, so, pt, dir, sup, emp] = await Promise.all([
        (window as any).api.listCounterparties(),
        (window as any).api.listContracts(),
        (window as any).api.listSalesOrders(),
        (window as any).api.listPriceTypes(),
        (window as any).api.listDirections(true),
        (window as any).api.getSuppliers?.().catch(() => []),
        (window as any).api.listEmployees?.({ activeOnly: true }).catch(() => []),
      ]);
      setCounterparties(cp || []);
      setContracts(ct || []);
      setSales(so || []);
      setPriceTypes(pt || []);
      setDirections(dir || []);
      setSuppliers(sup || []);
      setEmployees(emp || []);
      if (pt?.length && priceTypeFilter === '') setPriceTypeFilter(Number(pt[0].id));
    } catch (e: any) {
      onNotice(e?.message || 'Не удалось загрузить данные компании');
    }
  }

  useEffect(() => { void load(); }, [refreshToken]);
  useEffect(() => {
    if (initialTab) setTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    if (tab !== 'prices') return;
    const id = priceTypeFilter || undefined;
    (window as any).api.listItemPrices(id || undefined).then((rows: any[]) => setItemPrices(rows || [])).catch(() => setItemPrices([]));
    (window as any).api.getItems?.().then((rows: any[]) => setItems((rows || []).slice(0, 400))).catch(() => {
      (window as any).api.listItems?.().then((rows: any[]) => setItems((rows || []).slice(0, 400))).catch(() => setItems([]));
    });
  }, [tab, priceTypeFilter, refreshToken]);

  function openEdit(kind: TabId, row?: any) {
    setEditing({ kind, row });
    setError('');
    if (kind === 'counterparties') {
      const base = row || {
        name: '', kind: 'customer', inn: '', phone: '', email: '', contact_person: '', address: '', notes: '',
        supplier_id: '', employee_id: '', registry_user_id: '',
      };
      setForm({ ...base, custom_values: customValuesFromFields(row?.custom_values || []) });
      if (row?.id) {
        (window as any).api.getCounterparty?.(row.id).then((full: any) => {
          if (!full) return;
          setForm((prev: any) => ({
            ...prev,
            ...full,
            custom_values: customValuesFromFields(full.custom_values || []),
          }));
        }).catch(() => {  });
      }
    } else if (kind === 'contracts') {
      setForm(row || { number: '', title: '', counterparty_id: counterparties[0]?.id || '', direction_id: '', date_from: '', date_to: '', amount: '', status: 'active', notes: '' });
    } else if (kind === 'sales') {
      setForm(row ? { ...row, lines: row.lines || [{ item_name: '', quantity: 1, price: 0 }] } : {
        order_no: '', counterparty_id: '', direction_id: '', status: 'draft', expected_at: '', comment: '',
        lines: [{ item_name: '', quantity: 1, price: 0 }],
      });
      if (row?.id) {
        (window as any).api.getSalesOrder(row.id).then((full: any) => {
          if (full) setForm({ ...full, lines: full.lines?.length ? full.lines : [{ item_name: '', quantity: 1, price: 0 }] });
        });
      }
    } else if (kind === 'prices') {
      setForm(row || { name: '', is_default: false, is_active: true });
    } else {
      setForm(row || { code: '', name: '', description: '', sort_order: 0, is_active: true });
    }
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!editing) return;
    try {
      const { kind } = editing;
      if (kind === 'counterparties') {
        await (window as any).api.saveCounterparty({
          id: editing.row?.id,
          ...form,
          custom_values: form.custom_values || {},
        });
      }
      else if (kind === 'contracts') await (window as any).api.saveContract({ id: editing.row?.id, ...form });
      else if (kind === 'sales') await (window as any).api.saveSalesOrder({ id: editing.row?.id, ...form });
      else if (kind === 'prices') await (window as any).api.savePriceType({ id: editing.row?.id, ...form, is_default: Boolean(form.is_default) });
      else await (window as any).api.saveDirection({ id: editing.row?.id, ...form });
      setEditing(null);
      await load();
      onChanged();
      onNotice('Сохранено');
    } catch (e: any) {
      setError(e?.message || 'Ошибка сохранения');
    }
  }

  const activeHint = TABS.find((t) => t.id === tab)?.hint || '';
  const visibleTabs = TABS.filter((t) => !(hideTabs || []).includes(t.id));

  return (
    <>
      {!embedded && (
        <div className="page-header">
          <div>
            <div className="section-label">УНФ · Компания</div>
            <h1>Контур компании</h1>
            <p>
              Орг. сторона CRM в основном клиенте: контрагенты, договоры, заказы, виды цен и направления.
              Клиентская воронка — в отдельном окне CRM.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => void (window as any).api.openCrm?.().catch((e: any) => onNotice(e?.message || 'CRM'))}
            >
              Открыть CRM
            </button>
            <button type="button" className="btn btn-primary" onClick={() => openEdit(tab)}>
              {tab === 'sales' ? 'Новый заказ' : tab === 'prices' ? 'Новый вид цен' : tab === 'directions' ? 'Новое направление' : tab === 'contracts' ? 'Новый договор' : 'Новый контрагент'}
            </button>
          </div>
        </div>
      )}

      {!embedded && (
        <>
          <div className="ops-tabs" style={{ marginBottom: 16 }}>
            {visibleTabs.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`ops-tab${tab === t.id ? ' active' : ''}`}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <p className="muted" style={{ marginTop: -8 }}>{activeHint}</p>
        </>
      )}
      {embedded && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
          <button type="button" className="btn btn-primary" onClick={() => openEdit(tab)}>
            {tab === 'sales' ? 'Новый заказ' : tab === 'prices' ? 'Новый вид цен' : tab === 'directions' ? 'Новое направление' : tab === 'contracts' ? 'Новый договор' : 'Новый контрагент'}
          </button>
        </div>
      )}

      {tab === 'counterparties' && (
        <section className="table-wrap">
          <div className="table-scroll">
            <table>
              <thead><tr><th>Наименование</th><th>Вид</th><th>ИНН</th><th>Контакт</th><th>Телефон</th><th></th></tr></thead>
              <tbody>
                {counterparties.map((row) => (
                  <tr key={row.id}>
                    <td><button type="button" className="linkish" onClick={() => openEdit('counterparties', row)}>{row.name}</button></td>
                    <td>{KIND_RU[row.kind] || row.kind}</td>
                    <td>{row.inn || '—'}</td>
                    <td>{row.contact_person || '—'}</td>
                    <td>{row.phone || '—'}</td>
                    <td>
                      <button type="button" className="btn btn-secondary" onClick={() => openEdit('counterparties', row)}>Изменить</button>{' '}
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => {
                          if (!window.confirm(`Скрыть «${row.name}» из списка? Карточку можно будет восстановить через БД.`)) return;
                          void (window as any).api.deleteCounterparty(row.id)
                            .then(load)
                            .then(onChanged)
                            .then(() => onNotice('Контрагент скрыт'))
                            .catch((e: any) => onNotice(e?.message || 'Не удалось скрыть'));
                        }}
                      >
                        Скрыть
                      </button>{' '}
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => {
                          if (!window.confirm(
                            `Удалить «${row.name}» навсегда?\n\n`
                            + '• Диалоги и обращения CRM по этому контрагенту тоже удалятся.\n'
                            + '• Если есть договоры или заказы покупателя — сначала закройте их.\n'
                            + '• «Скрыть» — безопаснее: карточка просто пропадёт из списка.',
                          )) return;
                          void (window as any).api.deleteCounterparty(row.id, { hard: true })
                            .then((result: any) => {
                              const crmBits: string[] = [];
                              if (result?.removed_crm_threads) crmBits.push(`диалогов: ${result.removed_crm_threads}`);
                              if (result?.removed_crm_cases) crmBits.push(`обращений: ${result.removed_crm_cases}`);
                              onNotice(
                                crmBits.length
                                  ? `«${row.name}» удалён вместе с CRM (${crmBits.join(', ')})`
                                  : `«${row.name}» удалён`,
                              );
                              return load();
                            })
                            .then(onChanged)
                            .catch((e: any) => onNotice(e?.message || 'Не удалось удалить'));
                        }}
                      >
                        Удалить
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === 'contracts' && (
        <section className="table-wrap">
          <div className="table-scroll">
            <table>
              <thead><tr><th>Номер</th><th>Название</th><th>Контрагент</th><th>Направление</th><th>Сумма</th><th>Статус</th><th></th></tr></thead>
              <tbody>
                {contracts.map((row) => (
                  <tr key={row.id}>
                    <td>{row.number}</td>
                    <td>{row.title || '—'}</td>
                    <td>{row.counterparty_name}</td>
                    <td>{row.direction_name || '—'}</td>
                    <td>{row.amount != null ? row.amount : '—'}</td>
                    <td>{row.status}</td>
                    <td>
                      <button type="button" className="btn btn-secondary" onClick={() => openEdit('contracts', row)}>Изменить</button>{' '}
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => {
                          if (!window.confirm(`Удалить договор «${row.number}»?`)) return;
                          void (window as any).api.deleteContract(row.id).then(load).then(onChanged);
                        }}
                      >
                        Удалить
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === 'sales' && (
        <section className="table-wrap">
          <div className="table-scroll">
            <table>
              <thead><tr><th>Номер</th><th>Контрагент</th><th>Направление</th><th>Сумма</th><th>Статус</th><th></th></tr></thead>
              <tbody>
                {sales.map((row) => (
                  <tr key={row.id}>
                    <td>{row.order_no}</td>
                    <td>{row.counterparty_name || '—'}</td>
                    <td>{row.direction_name || '—'}</td>
                    <td>{row.total_amount}</td>
                    <td>{row.status}</td>
                    <td>
                      <button type="button" className="btn btn-secondary" onClick={() => openEdit('sales', row)}>Изменить</button>{' '}
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => {
                          if (!window.confirm(`Удалить заказ «${row.order_no}»?`)) return;
                          void (window as any).api.deleteSalesOrder(row.id).then(load).then(onChanged);
                        }}
                      >
                        Удалить
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === 'prices' && (
        <div className="org-layout">
          <section className="card">
            <h2>Виды цен</h2>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
              {priceTypes.map((pt) => (
                <li key={pt.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <button type="button" className="linkish" onClick={() => setPriceTypeFilter(Number(pt.id))}>
                    {pt.name}{pt.is_default ? ' · по умолчанию' : ''}
                  </button>
                  <span style={{ display: 'flex', gap: 6 }}>
                    <button type="button" className="btn btn-secondary" onClick={() => openEdit('prices', pt)}>Изменить</button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => {
                        if (!window.confirm(`Удалить вид цен «${pt.name}»?`)) return;
                        void (window as any).api.deletePriceType(pt.id).then(load).then(onChanged);
                      }}
                    >
                      Удалить
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </section>
          <section className="card">
            <h2>Цены номенклатуры</h2>
            <label style={{ display: 'block', marginBottom: 12 }}>
              Вид цен
              <select value={priceTypeFilter} onChange={(e) => setPriceTypeFilter(e.target.value ? Number(e.target.value) : '')}>
                {priceTypes.map((pt) => <option key={pt.id} value={pt.id}>{pt.name}</option>)}
              </select>
            </label>
            <div className="table-scroll">
              <table>
                <thead><tr><th>Товар</th><th>Цена</th><th></th></tr></thead>
                <tbody>
                  {(itemPrices.length ? itemPrices : items.slice(0, 30).map((it) => ({ item_id: it.id, item_name: it.name, price: it.price || 0 }))).map((row: any) => (
                    <tr key={`${row.item_id}-${row.price_type_id || priceTypeFilter}`}>
                      <td>{row.item_name}</td>
                      <td>{row.price}</td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => {
                            const val = window.prompt('Цена:', String(row.price ?? 0));
                            if (val == null || !priceTypeFilter) return;
                            void (window as any).api.setItemPrice(row.item_id, priceTypeFilter, Number(val))
                              .then(() => (window as any).api.listItemPrices(priceTypeFilter))
                              .then((r: any[]) => setItemPrices(r || []))
                              .catch((e: any) => onNotice(e?.message || 'Ошибка'));
                          }}
                        >
                          Задать
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {tab === 'directions' && (
        <section className="table-wrap">
          <div className="table-scroll">
            <table>
              <thead><tr><th>Код</th><th>Название</th><th>Описание</th><th>Активно</th><th></th></tr></thead>
              <tbody>
                {directions.map((row) => (
                  <tr key={row.id}>
                    <td>{row.code || '—'}</td>
                    <td>{row.name}</td>
                    <td>{row.description || '—'}</td>
                    <td>{row.is_active ? 'да' : 'нет'}</td>
                    <td>
                      <button type="button" className="btn btn-secondary" onClick={() => openEdit('directions', row)}>Изменить</button>{' '}
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => {
                          if (!window.confirm(`Удалить направление «${row.name}»?`)) return;
                          void (window as any).api.deleteDirection(row.id).then(load).then(onChanged);
                        }}
                      >
                        Удалить
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {editing && (
        <FloatingWidget
          title={
            editing.kind === 'counterparties' ? 'Контрагент'
              : editing.kind === 'contracts' ? 'Договор'
                : editing.kind === 'sales' ? 'Заказ покупателя'
                  : editing.kind === 'prices' ? 'Вид цен'
                    : 'Направление деятельности'
          }
          open
          onClose={() => setEditing(null)}
          width={editing.kind === 'sales' ? 720 : 560}
        >
          <form className="form-grid" onSubmit={save} style={{ padding: '4px 4px 12px' }}>
            {error && <div className="form-error span-2">{error}</div>}

            {editing.kind === 'counterparties' && (
              <>
                <label className="span-2">Наименование<input value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
                <label>Вид
                  <select value={form.kind || 'customer'} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
                    <option value="customer">Покупатель</option>
                    <option value="supplier">Поставщик</option>
                    <option value="partner">Партнёр</option>
                    <option value="other">Прочий</option>
                  </select>
                </label>
                <label>ИНН<input value={form.inn || ''} onChange={(e) => setForm({ ...form, inn: e.target.value })} /></label>
                <label>Контакт<input value={form.contact_person || ''} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} /></label>
                <label>Телефон<input value={form.phone || ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
                <label className="span-2">Адрес<input value={form.address || ''} onChange={(e) => setForm({ ...form, address: e.target.value })} /></label>
                <label className="span-2">Поставщик (справочник)
                  <select value={form.supplier_id || ''} onChange={(e) => setForm({ ...form, supplier_id: e.target.value })}>
                    <option value="">—</option>
                    {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </label>
                <label className="span-2">Сотрудник организации
                  <select value={form.employee_id || ''} onChange={(e) => setForm({ ...form, employee_id: e.target.value })}>
                    <option value="">—</option>
                    {employees.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {[emp.last_name, emp.first_name, emp.middle_name].filter(Boolean).join(' ')}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="span-2">Метрика:Клиент (id пользователя)
                  <input
                    type="number"
                    value={form.registry_user_id ?? ''}
                    onChange={(e) => setForm({ ...form, registry_user_id: e.target.value })}
                    placeholder="registry user id"
                  />
                </label>
                <label className="span-2">Заметки<textarea value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} /></label>
                <div className="span-2">
                  <EntityCustomFields
                    entity="counterparty"
                    values={form.custom_values || {}}
                    onChange={(custom_values) => setForm({ ...form, custom_values })}
                  />
                </div>
              </>
            )}

            {editing.kind === 'contracts' && (
              <>
                <label>Номер<input value={form.number || ''} onChange={(e) => setForm({ ...form, number: e.target.value })} required /></label>
                <label>Статус
                  <select value={form.status || 'active'} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                    <option value="draft">Черновик</option>
                    <option value="active">Действует</option>
                    <option value="closed">Закрыт</option>
                  </select>
                </label>
                <label className="span-2">Название<input value={form.title || ''} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
                <label className="span-2">Контрагент
                  <select value={form.counterparty_id || ''} onChange={(e) => setForm({ ...form, counterparty_id: e.target.value })} required>
                    <option value="">—</option>
                    {counterparties.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </label>
                <label>Направление
                  <select value={form.direction_id || ''} onChange={(e) => setForm({ ...form, direction_id: e.target.value })}>
                    <option value="">—</option>
                    {directions.filter((d) => d.is_active).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </label>
                <label>Сумма<input type="number" step="0.01" value={form.amount ?? ''} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></label>
                <label>С<input type="date" value={form.date_from || ''} onChange={(e) => setForm({ ...form, date_from: e.target.value })} /></label>
                <label>По<input type="date" value={form.date_to || ''} onChange={(e) => setForm({ ...form, date_to: e.target.value })} /></label>
              </>
            )}

            {editing.kind === 'sales' && (
              <>
                <label>Номер<input value={form.order_no || ''} onChange={(e) => setForm({ ...form, order_no: e.target.value })} placeholder="авто" /></label>
                <label>Статус
                  <select value={form.status || 'draft'} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                    <option value="draft">Черновик</option>
                    <option value="confirmed">Подтверждён</option>
                    <option value="shipped">Отгружен</option>
                    <option value="closed">Закрыт</option>
                    <option value="cancelled">Отменён</option>
                  </select>
                </label>
                <label className="span-2">Контрагент
                  <select value={form.counterparty_id || ''} onChange={(e) => setForm({ ...form, counterparty_id: e.target.value })}>
                    <option value="">—</option>
                    {counterparties.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </label>
                <label>Направление
                  <select value={form.direction_id || ''} onChange={(e) => setForm({ ...form, direction_id: e.target.value })}>
                    <option value="">—</option>
                    {directions.filter((d) => d.is_active).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </label>
                <label>Ожид. дата<input type="date" value={form.expected_at || ''} onChange={(e) => setForm({ ...form, expected_at: e.target.value })} /></label>
                <label className="span-2">Комментарий<input value={form.comment || ''} onChange={(e) => setForm({ ...form, comment: e.target.value })} /></label>
                <div className="span-2">
                  <div className="section-label">Строки</div>
                  {(form.lines || []).map((line: any, idx: number) => (
                    <div key={idx} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: 8, marginBottom: 8 }}>
                      <input
                        placeholder="Товар"
                        value={line.item_name || ''}
                        onChange={(e) => {
                          const lines = [...(form.lines || [])];
                          lines[idx] = { ...lines[idx], item_name: e.target.value };
                          setForm({ ...form, lines });
                        }}
                      />
                      <input
                        type="number"
                        step="any"
                        placeholder="Кол-во"
                        value={line.quantity ?? 1}
                        onChange={(e) => {
                          const lines = [...(form.lines || [])];
                          lines[idx] = { ...lines[idx], quantity: e.target.value };
                          setForm({ ...form, lines });
                        }}
                      />
                      <input
                        type="number"
                        step="any"
                        placeholder="Цена"
                        value={line.price ?? 0}
                        onChange={(e) => {
                          const lines = [...(form.lines || [])];
                          lines[idx] = { ...lines[idx], price: e.target.value };
                          setForm({ ...form, lines });
                        }}
                      />
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => setForm({ ...form, lines: (form.lines || []).filter((_: any, i: number) => i !== idx) })}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <button type="button" className="btn btn-secondary" onClick={() => setForm({ ...form, lines: [...(form.lines || []), { item_name: '', quantity: 1, price: 0 }] })}>
                    + строка
                  </button>
                </div>
              </>
            )}

            {editing.kind === 'prices' && (
              <>
                <label className="span-2">Название<input value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input type="checkbox" checked={Boolean(form.is_default)} onChange={(e) => setForm({ ...form, is_default: e.target.checked })} />
                  По умолчанию
                </label>
              </>
            )}

            {editing.kind === 'directions' && (
              <>
                <label>Код<input value={form.code || ''} onChange={(e) => setForm({ ...form, code: e.target.value })} /></label>
                <label>Порядок<input type="number" value={form.sort_order ?? 0} onChange={(e) => setForm({ ...form, sort_order: e.target.value })} /></label>
                <label className="span-2">Название<input value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
                <label className="span-2">Описание<textarea value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} /></label>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input type="checkbox" checked={form.is_active !== 0 && form.is_active !== false} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
                  Активно
                </label>
              </>
            )}

            <div className="modal-actions span-2">
              <button type="button" className="btn btn-secondary" onClick={() => setEditing(null)}>Отмена</button>
              <button type="submit" className="btn btn-primary">Сохранить</button>
            </div>
          </form>
        </FloatingWidget>
      )}
    </>
  );
}
