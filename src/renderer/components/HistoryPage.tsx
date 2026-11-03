import { useEffect, useMemo, useState } from 'react';
import AdvancedFilters from './AdvancedFilters';

const TYPE_LABELS: Record<string, string> = {
  in: 'Приход',
  out: 'Расход',
  move: 'Перемещение',
  adjustment: 'Корректировка',
  reserve: 'Резерв',
  release: 'Снятие резерва',
};

const REASON_LABELS: Record<string, string> = {
  USAGE: 'Использование',
  PROJECT: 'Сборка проекта',
  DEFECT: 'Брак',
  LOSS: 'Потеря',
  TRANSFER: 'Передача',
  INVENTORY: 'Ревизия',
  MANUAL: 'Вручную',
  INITIAL_INVENTORY: 'Начальный учёт',
};

const SOURCE_LABELS: Record<string, string> = {
  MANUAL: 'Вручную',
  CSV_IMPORT: 'CSV',
  SCANNER: 'Сканер',
  REVISION: 'Ревизия',
  PROJECT: 'Проект',
  SYSTEM: 'Система',
};

type Props = {
  refreshToken: number;
  onOpenItem: (barcode: string) => void;
  onChanged: () => void;
  initialType?: string | null;
  onInitialTypeConsumed?: () => void;
};

export default function HistoryPage({ refreshToken, onOpenItem, onChanged, initialType, onInitialTypeConsumed }: Props) {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({
    type: 'all',
    reason: 'all',
    source: 'all',
    fromDate: '',
    toDate: '',
    operator: '',
    document: '',
  });

  async function load() { setTransactions((await (window as any).api.getTransactions(1000)) || []); }
  useEffect(() => { load(); }, [refreshToken]);

  useEffect(() => {
    if (!initialType) return;
    const allowed = new Set(['in', 'out', 'move', 'adjustment', 'reserve', 'release']);
    if (allowed.has(initialType)) {
      setFilters((current) => ({ ...current, type: initialType }));
    }
    onInitialTypeConsumed?.();
  }, [initialType, onInitialTypeConsumed]);

  function setFilter(key: string, value: string) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  async function exportCsv() {
    const file = await (window as any).api.exportCsv(visible.map((row) => ({
      Дата: row.timestamp,
      Тип: TYPE_LABELS[row.type] || row.type,
      Причина: REASON_LABELS[row.reason] || row.reason || '',
      Источник: SOURCE_LABELS[row.source] || row.source || '',
      Товар: row.item_print_name || row.item_name || '',
      Штрихкод: row.item_barcode || '',
      Количество: row.quantity,
      Ед: row.unit_symbol || 'шт.',
      Ячейка: row.location_name || '',
      Откуда: row.from_location_name || '',
      Куда: row.to_location_name || '',
      Документ: row.document_ref || '',
      Проект: row.project_order_no || row.project_name || '',
      Комментарий: row.comment || '',
      Оператор: row.user_name || '',
    })), 'metrika-ledger');
    if (file) setNotice(`Экспортирован файл: ${file}`);
  }

  async function exportPdf() {
    const file = await (window as any).api.printTransactions(filters.fromDate, filters.toDate);
    if (file) setNotice(`PDF сохранен: ${file}`);
  }

  async function undo() {
    if (!window.confirm('Отменить последнее движение склада? Остаток будет скорректирован обратной операцией.')) return;
    try {
      await (window as any).api.undoLastTransaction();
      setNotice('Последняя операция отменена');
      await load();
      onChanged();
    } catch (error: any) {
      setNotice(error?.message || 'Откат не выполнен');
    }
  }

  const visible = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    const operator = filters.operator.trim().toLocaleLowerCase();
    const document = filters.document.trim().toLocaleLowerCase();
    return transactions.filter((transaction) => {
      const matchesType = filters.type === 'all' || transaction.type === filters.type;
      const matchesReason = filters.reason === 'all' || transaction.reason === filters.reason;
      const matchesSource = filters.source === 'all' || transaction.source === filters.source;
      const text = [
        transaction.item_name, transaction.item_barcode, transaction.location_name,
        transaction.from_location_name, transaction.to_location_name, transaction.comment,
        transaction.user_name, transaction.document_ref, transaction.project_order_no, transaction.reason, transaction.source,
      ].join(' ').toLocaleLowerCase();
      const date = new Date(transaction.timestamp);
      const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      const matchesOperator = !operator || String(transaction.user_name || '').toLocaleLowerCase().includes(operator);
      const matchesDocument = !document || String(transaction.document_ref || '').toLocaleLowerCase().includes(document)
        || String(transaction.project_order_no || '').toLocaleLowerCase().includes(document);
      return matchesType && matchesReason && matchesSource && matchesOperator && matchesDocument
        && (!query || text.includes(query))
        && (!filters.fromDate || day >= filters.fromDate)
        && (!filters.toDate || day <= filters.toDate);
    });
  }, [transactions, search, filters]);

  return <>
    <div className="page-header">
      <div>
        <div className="section-label">Отладка склада</div>
        <h1>Журнал склада</h1>
        <p>
          Здесь видно каждое изменение остатка: приход, расход, перемещение, корректировка.
          Строки с источником «Система» и комментарием про выравнивание — это Центр качества («Выровнять»).
        </p>
        <p className="subtext">
          Ищите по товару, ячейке или документу. «Отменить последнюю» откатывает только самое свежее движение.
          Ошибки программы смотрите в терминале внизу (вкладка «Ошибки») и в разделе «Аудит».
        </p>
      </div>
      <div className="table-actions">
        <button className="btn btn-danger" onClick={undo}>Отменить последнюю</button>
        <button className="btn btn-secondary" onClick={exportPdf}>Экспорт PDF</button>
        <button className="btn btn-primary" onClick={exportCsv}>Экспорт CSV</button>
      </div>
    </div>
    {notice && <div className="history-notice" role="status">{notice}</div>}
    <section className="table-wrap">
      <div className="table-header">
        <div><h2>Операции</h2></div>
      </div>
      <AdvancedFilters
        search={search}
        onSearch={setSearch}
        searchPlaceholder="Товар, ячейка, документ, проект, оператор"
        values={filters}
        onChange={setFilter}
        resultLabel={`Показано: ${visible.length} из ${transactions.length}`}
        chips={[
          {
            key: 'type',
            value: filters.type,
            options: [
              { value: 'all', label: 'Все' },
              { value: 'in', label: 'Приход' },
              { value: 'out', label: 'Расход' },
              { value: 'move', label: 'Перем.' },
              { value: 'adjustment', label: 'Корр.' },
              { value: 'reserve', label: 'Резерв' },
              { value: 'release', label: 'Снятие' },
            ],
          },
        ]}
        fields={[
          { key: 'fromDate', label: 'С даты', type: 'date' },
          { key: 'toDate', label: 'По дату', type: 'date' },
          {
            key: 'reason',
            label: 'Причина',
            type: 'select',
            options: [
              { value: 'all', label: 'Все причины' },
              { value: 'USAGE', label: 'Использование' },
              { value: 'PROJECT', label: 'Проект' },
              { value: 'INVENTORY', label: 'Ревизия' },
              { value: 'TRANSFER', label: 'Передача' },
              { value: 'MANUAL', label: 'Вручную' },
              { value: 'INITIAL_INVENTORY', label: 'Начальный' },
              { value: 'DEFECT', label: 'Брак' },
              { value: 'LOSS', label: 'Потеря' },
            ],
          },
          {
            key: 'source',
            label: 'Источник',
            type: 'select',
            options: [
              { value: 'all', label: 'Все источники' },
              { value: 'MANUAL', label: 'Вручную' },
              { value: 'SCANNER', label: 'Сканер' },
              { value: 'REVISION', label: 'Ревизия' },
              { value: 'PROJECT', label: 'Проект' },
              { value: 'CSV_IMPORT', label: 'CSV' },
              { value: 'SYSTEM', label: 'Система' },
            ],
          },
          { key: 'operator', label: 'Оператор', type: 'text', placeholder: 'Локальный оператор' },
          { key: 'document', label: 'Документ / заказ', type: 'text', placeholder: 'REV- · WO-' },
        ]}
      />
      {visible.length === 0 ? (
        <div className="empty">
          <h3>{transactions.length ? 'Операции не найдены' : 'Операций пока нет'}</h3>
          <p>{transactions.length ? 'Измените фильтры.' : 'Журнал появится после первого изменения остатка.'}</p>
        </div>
      ) : (
        <div className="table-scroll">
          <table className="ledger-table">
            <thead>
              <tr>
                <th>Когда</th>
                <th>Тип</th>
                <th>Товар</th>
                <th>Кол-во</th>
                <th>Ячейка</th>
                <th>Заметка</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((transaction) => {
                const place = transaction.type === 'move'
                  ? [transaction.from_location_name, transaction.to_location_name].filter(Boolean).join(' → ')
                  : (transaction.location_name || transaction.to_location_name || transaction.from_location_name || '—');
                const noteParts = [
                  REASON_LABELS[transaction.reason] || transaction.reason,
                  transaction.comment,
                  transaction.project_order_no || transaction.project_name,
                ].filter(Boolean);
                const note = noteParts.join(' · ') || '—';
                return (
                  <tr key={transaction.id} className={transaction.item_barcode ? 'clickable-row' : ''} onClick={() => transaction.item_barcode && onOpenItem(transaction.item_barcode)} title={[SOURCE_LABELS[transaction.source], transaction.document_ref, transaction.user_name].filter(Boolean).join(' · ')}>
                    <td className="mono">{new Date(transaction.timestamp).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                    <td><span className={`type-badge ${transaction.type}`}>{TYPE_LABELS[transaction.type] || transaction.type}</span></td>
                    <td className="strong">{transaction.item_name || '—'}</td>
                    <td>{transaction.quantity} {transaction.unit_symbol || 'шт.'}</td>
                    <td>{place || '—'}</td>
                    <td className="subtext" style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={note}>{note}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  </>;
}
