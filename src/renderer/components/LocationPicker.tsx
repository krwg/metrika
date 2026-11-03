import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import FloatingWidget from './FloatingWidget';

type Location = {
  id: number;
  name: string;
  barcode?: string | null;
  location_type?: string | null;
  parent_location_id?: number | null;
  parent_name?: string | null;
};

type Props = {
  value: string;
  onChange: (id: string) => void;
  label?: string;
  disabled?: boolean;
  allowEmpty?: boolean;
  emptyLabel?: string;
};

function parentKey(id: number | null | undefined): number | null {
  const n = Number(id);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function typeLabel(type?: string | null) {
  if (type === 'warehouse') return 'склад';
  if (type === 'subwarehouse') return 'подсклад';
  return 'ячейка';
}

export default function LocationPicker({
  value,
  onChange,
  label = 'Адрес хранения',
  disabled = false,
  allowEmpty = true,
  emptyLabel = 'Не выбран',
}: Props) {
  const [locations, setLocations] = useState<Location[]>([]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const triggerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    (window as any).api.getLocations()
      .then((rows: Location[]) => setLocations(Array.isArray(rows) ? rows : []))
      .catch(() => setLocations([]));
  }, [open]);

  const byId = useMemo(() => new Map(locations.map((l) => [l.id, l])), [locations]);
  const tree = useMemo(() => {
    const map = new Map<number | null, Location[]>();
    for (const loc of locations) {
      const key = parentKey(loc.parent_location_id);
      const list = map.get(key) || [];
      list.push(loc);
      map.set(key, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => {
        const order = (t?: string | null) => (t === 'warehouse' ? 0 : t === 'subwarehouse' ? 1 : 2);
        return order(a.location_type) - order(b.location_type) || a.name.localeCompare(b.name, 'ru');
      });
    }
    return map;
  }, [locations]);

  const selected = value ? byId.get(Number(value)) : null;
  const selectedLabel = selected
    ? `${selected.name} · ${typeLabel(selected.location_type)}${selected.barcode ? ` · ${selected.barcode}` : ''}`
    : emptyLabel;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return locations
      .filter((l) => {
        const hay = `${l.name} ${l.barcode || ''} ${l.parent_name || ''} ${typeLabel(l.location_type)}`.toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  }, [query, locations]);

  function pick(id: string) {
    onChange(id);
    setOpen(false);
    setQuery('');
  }

  function renderNode(loc: Location, depth: number): ReactElement {
    const children = tree.get(loc.id) || [];
    const isOpen = expanded[loc.id] ?? depth < 2;
    return (
      <div key={loc.id}>
        <div className="loc-picker-row" style={{ paddingLeft: 6 + depth * 14 }}>
          {children.length > 0 ? (
            <button
              type="button"
              className="cat-picker-fold"
              onClick={(e) => {
                e.stopPropagation();
                setExpanded((c) => ({ ...c, [loc.id]: !isOpen }));
              }}
            >
              {isOpen ? '▾' : '▸'}
            </button>
          ) : (
            <span className="cat-picker-fold spacer" />
          )}
          <button
            type="button"
            className={`cat-picker-item ${String(loc.id) === value ? 'selected' : ''}`}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              pick(String(loc.id));
            }}
          >
            <span className={`loc-type-dot ${loc.location_type || 'cell'}`} />
            <span className="cat-picker-name">{loc.name}</span>
            <span className="cat-picker-prefix">{typeLabel(loc.location_type)}</span>
            {loc.barcode && <span className="mono" style={{ fontSize: 11 }}>{loc.barcode}</span>}
          </button>
        </div>
        {isOpen && children.map((child) => renderNode(child, depth + 1))}
      </div>
    );
  }

  const roots = tree.get(null) || [];
  const anchor = triggerRef.current?.getBoundingClientRect();

  return (
    <div className="cat-picker loc-picker" ref={triggerRef}>
      <span className="cat-picker-label">{label}</span>
      <button
        type="button"
        className="cat-picker-trigger"
        disabled={disabled}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!disabled) setOpen((v) => !v);
        }}
      >
        <span>{selectedLabel}</span>
        <span className="cat-picker-caret">{open ? '▴' : '▾'}</span>
      </button>

      <FloatingWidget
        title="Выбор адреса"
        open={open}
        onClose={() => setOpen(false)}
        width={480}
        zIndex={1800}
        initialX={anchor ? Math.min(Math.max(16, anchor.left), window.innerWidth - 500) : undefined}
        initialY={anchor ? Math.min(anchor.bottom + 8, window.innerHeight - 420) : undefined}
      >
        <div className="cat-picker-float-body">
          <input
            className="cat-picker-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск склада, ячейки или кода…"
            autoFocus
          />
          <div className="cat-picker-scroll loc-picker-float-scroll">
            {allowEmpty && (
              <button
                type="button"
                className={`cat-picker-item flat ${!value ? 'selected' : ''}`}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  pick('');
                }}
              >
                {emptyLabel}
              </button>
            )}
            {locations.length === 0 && (
              <div className="cat-picker-empty">Адресов нет — создайте склад в разделе «Хранение»</div>
            )}
            {filtered ? (
              filtered.length === 0 ? (
                <div className="cat-picker-empty">Ничего не найдено</div>
              ) : filtered.map((loc) => (
                <button
                  key={loc.id}
                  type="button"
                  className={`cat-picker-item flat ${String(loc.id) === value ? 'selected' : ''}`}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    pick(String(loc.id));
                  }}
                >
                  <span className={`loc-type-dot ${loc.location_type || 'cell'}`} />
                  <span className="cat-picker-name">
                    {loc.parent_name ? `${loc.parent_name} / ` : ''}{loc.name}
                  </span>
                  <span className="cat-picker-prefix">{typeLabel(loc.location_type)}</span>
                </button>
              ))
            ) : (
              roots.map((root) => renderNode(root, 0))
            )}
          </div>
        </div>
      </FloatingWidget>
    </div>
  );
}
