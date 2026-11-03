import { useEffect, useMemo, useState } from 'react';
import CategoryPicker from './CategoryPicker';
import FloatingWidget from './FloatingWidget';

type Props = {
  items: any[];
  onPick: (item: any, quantity: number) => void;
  onClose: () => void;
};

export default function ItemPickerDialog({ items, onPick, onClose }: Props) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [stock, setStock] = useState('all');
  const [quantity, setQuantity] = useState(1);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);

  useEffect(() => {
    (window as any).api.getSetting('ui.pageSize', '50').then((value: string) => setPageSize(Math.max(25, Number(value) || 50)));
  }, []);

  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return items.filter((item) => {
      const available = Number(item.available ?? item.total_qty ?? 0);
      const onHand = Number(item.on_hand ?? item.total_qty ?? 0);
      const text = `${item.name || ''} ${item.print_name || ''} ${item.sku || ''} ${(item.barcodes || [item.barcode]).filter(Boolean).join(' ')} ${item.category || ''}`.toLocaleLowerCase();
      const matchesSearch = !query || text.includes(query);
      const matchesCategory = category === 'all' || item.category === category;
      const matchesStock = stock === 'all'
        || (stock === 'available' && available > 0)
        || (stock === 'low' && available <= Number(item.min_stock || 0))
        || (stock === 'empty' && onHand === 0);
      return matchesSearch && matchesCategory && matchesStock;
    });
  }, [items, search, category, stock]);

  useEffect(() => { setPage(0); }, [search, category, stock]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageItems = filtered.slice(page * pageSize, page * pageSize + pageSize);
  const selected = filtered.find((item) => item.id === selectedId) || null;

  return (
    <FloatingWidget title="Подбор компонента" open onClose={onClose} width={860} zIndex={1820}>
      <p className="subtext" style={{ marginTop: 0 }}>
        Поиск и фильтрация по {items.length.toLocaleString('ru-RU')} позициям. Показано {filtered.length.toLocaleString('ru-RU')}.
      </p>
        <div className="advanced-filters-bar">
          <input className="advanced-search" placeholder="Название, артикул, штрихкод, категория" value={search} onChange={(event) => setSearch(event.target.value)} autoFocus />
          <CategoryPicker
            label=""
            value={category === 'all' ? '' : category}
            onChange={(name) => setCategory(name || 'all')}
            emptyLabel="Все категории"
          />
          <select value={stock} onChange={(event) => setStock(event.target.value)}>
            <option value="all">Любой остаток</option>
            <option value="available">Есть доступный</option>
            <option value="low">Ниже минимума</option>
            <option value="empty">Пустые</option>
          </select>
        </div>

        <div className="table-scroll item-picker-scroll">
          <table>
            <thead>
              <tr>
                <th>Товар</th>
                <th>Артикул</th>
                <th>Категория</th>
                <th>Доступно</th>
                <th>Физический</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--muted)', padding: 28 }}>Ничего не найдено</td></tr>}
              {pageItems.map((item) => (
                <tr
                  key={item.id}
                  className={`clickable-row ${selectedId === item.id ? 'row-selected' : ''}`}
                  onClick={() => setSelectedId(item.id)}
                  onDoubleClick={() => onPick(item, Math.max(1, quantity))}
                >
                  <td className="strong">{item.name}<div className="subtext mono">{(item.barcodes || [item.barcode]).filter(Boolean)[0] || 'Еще не определен'}</div></td>
                  <td className="mono">{item.sku || '—'}</td>
                  <td>{item.category || '—'}</td>
                  <td>{Number(item.available ?? item.total_qty ?? 0)} {item.unit_symbol || 'шт.'}</td>
                  <td>{Number(item.on_hand ?? item.total_qty ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="item-picker-footer">
          <div className="item-picker-pager">
            <button type="button" className="btn btn-text" disabled={page <= 0} onClick={() => setPage((value) => value - 1)}>Назад</button>
            <span>{page + 1} / {totalPages}</span>
            <button type="button" className="btn btn-text" disabled={page >= totalPages - 1} onClick={() => setPage((value) => value + 1)}>Вперёд</button>
          </div>
          <label>Кол-во<input type="number" min="1" value={quantity} onChange={(event) => setQuantity(Math.max(1, Number(event.target.value) || 1))} /></label>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!selected}
            onClick={() => selected && onPick(selected, Math.max(1, quantity))}
          >
            Добавить{selected ? `: ${selected.name}` : ''}
          </button>
        </div>
    </FloatingWidget>
  );
}
