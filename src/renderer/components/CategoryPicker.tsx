import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import FloatingWidget from './FloatingWidget';

type Category = {
  id: number;
  name: string;
  parent_id: number | null;
  sku_prefix?: string | null;
  archived?: number | null;
  color?: string;
};

type Props = {
  value: string;
  onChange: (name: string) => void;
  allowEmpty?: boolean;
  emptyLabel?: string;
  label?: string;
  valueMode?: 'name' | 'id';
};

function parentKey(parentId: number | null | undefined): number | null {
  const n = Number(parentId);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function buildTree(categories: Category[]) {
  const byParent = new Map<number | null, Category[]>();
  for (const cat of categories) {
    if (cat.archived) continue;
    const key = parentKey(cat.parent_id);
    const list = byParent.get(key) || [];
    list.push(cat);
    byParent.set(key, list);
  }
  for (const list of byParent.values()) list.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  return byParent;
}

function pathOf(cat: Category, byId: Map<number, Category>): string {
  const parts = [cat.name];
  let cursor = parentKey(cat.parent_id);
  while (cursor) {
    const parent = byId.get(cursor);
    if (!parent) break;
    parts.unshift(parent.name);
    cursor = parentKey(parent.parent_id);
  }
  return parts.join(' / ');
}

export default function CategoryPicker({
  value,
  onChange,
  allowEmpty = true,
  emptyLabel = 'Без категории',
  label = 'Категория',
  valueMode = 'name',
}: Props) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [browseId, setBrowseId] = useState<number | null>(null);
  const triggerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    (window as any).api.getCategories().then((list: Category[]) => setCategories(list || [])).catch(() => setCategories([]));
  }, [open]);

  const byId = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const tree = useMemo(() => buildTree(categories), [categories]);

  const selectedCat = useMemo(() => {
    if (!value) return null;
    if (valueMode === 'id') return byId.get(Number(value)) || null;
    return categories.find((c) => c.name === value) || null;
  }, [value, valueMode, categories, byId]);

  const selectedPath = selectedCat ? pathOf(selectedCat, byId) : emptyLabel;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return categories
      .filter((c) => !c.archived)
      .filter((c) => {
        const path = pathOf(c, byId).toLowerCase();
        return path.includes(q) || String(c.sku_prefix || '').toLowerCase().includes(q);
      })
      .sort((a, b) => pathOf(a, byId).localeCompare(pathOf(b, byId), 'ru'));
  }, [query, categories, byId]);

  const browseChildren = useMemo(() => {
    if (browseId == null) return tree.get(null) || [];
    return tree.get(browseId) || [];
  }, [browseId, tree]);

  const browseTitle = browseId == null
    ? 'Корень'
    : (byId.get(browseId) ? pathOf(byId.get(browseId)!, byId) : 'Папка');

  function toggleExpand(id: number) {
    setExpanded((current) => ({ ...current, [id]: !current[id] }));
  }

  function pick(cat: Category | null) {
    if (!cat) onChange('');
    else if (valueMode === 'id') onChange(String(cat.id));
    else onChange(cat.name);
    setOpen(false);
    setQuery('');
  }

  function renderNode(cat: Category, depth: number): ReactElement {
    const children = tree.get(cat.id) || [];
    const isOpen = expanded[cat.id] ?? depth < 1;
    const selected = valueMode === 'id' ? String(cat.id) === value : value === cat.name;
    return (
      <div key={cat.id} className="cat-picker-node">
        <div className="cat-picker-row" style={{ paddingLeft: 6 + depth * 12 }}>
          {children.length > 0 ? (
            <button type="button" className="cat-picker-fold" onClick={() => toggleExpand(cat.id)} aria-label="Развернуть">
              {isOpen ? '▾' : '▸'}
            </button>
          ) : (
            <span className="cat-picker-fold spacer" />
          )}
          <button
            type="button"
            className={`cat-picker-item ${selected ? 'selected' : ''} ${browseId === cat.id ? 'browsing' : ''}`}
            onClick={() => pick(cat)}
            onDoubleClick={() => { if (children.length) { setBrowseId(cat.id); setExpanded((c) => ({ ...c, [cat.id]: true })); } }}
          >
            <span className={`cat-picker-folder ${children.length ? 'is-folder' : 'is-leaf'}`}>{children.length ? '[+]' : '·'}</span>
            <span className="cat-picker-name">{cat.name}</span>
            {cat.sku_prefix && <span className="cat-picker-prefix">{cat.sku_prefix}</span>}
          </button>
          {children.length > 0 && (
            <button type="button" className="cat-picker-browse" title="Открыть папку" onClick={() => setBrowseId(cat.id)}>→</button>
          )}
        </div>
        {isOpen && children.map((child) => renderNode(child, depth + 1))}
      </div>
    );
  }

  const roots = tree.get(null) || [];
  const anchor = triggerRef.current?.getBoundingClientRect();

  return (
    <div className="cat-picker" ref={triggerRef}>
      <span className="cat-picker-label">{label}</span>
      <button
        type="button"
        className="cat-picker-trigger"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <span>{selectedPath}</span>
        <span className="cat-picker-caret">{open ? '▴' : '▾'}</span>
      </button>

      <FloatingWidget
        title="Выбор категории"
        open={open}
        onClose={() => setOpen(false)}
        width={640}
        zIndex={1800}
        initialX={anchor ? Math.min(Math.max(16, anchor.left), window.innerWidth - 660) : undefined}
        initialY={anchor ? Math.min(anchor.bottom + 8, window.innerHeight - 420) : undefined}
      >
        <div className="cat-picker-float-body">
          <input
            className="cat-picker-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск по пути или префиксу…"
            autoFocus
          />
          {allowEmpty && (
            <button type="button" className={`cat-picker-item flat cat-picker-empty-opt ${!value ? 'selected' : ''}`} onClick={() => pick(null)}>
              {emptyLabel}
            </button>
          )}
          <div className={`cat-picker-body ${filtered ? 'is-search' : ''}`}>
            <div className="cat-picker-col">
              <div className="cat-picker-col-head">{filtered ? 'Результаты' : 'Дерево'}</div>
              <div className="cat-picker-tree">
                {filtered ? (
                  filtered.length === 0 ? (
                    <div className="cat-picker-empty">Ничего не найдено</div>
                  ) : filtered.map((cat) => {
                    const selected = valueMode === 'id' ? String(cat.id) === value : value === cat.name;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        className={`cat-picker-item flat ${selected ? 'selected' : ''}`}
                        onClick={() => pick(cat)}
                      >
                        <span className="cat-picker-name">{pathOf(cat, byId)}</span>
                        {cat.sku_prefix && <span className="cat-picker-prefix">{cat.sku_prefix}</span>}
                      </button>
                    );
                  })
                ) : roots.length === 0 ? (
                  <div className="cat-picker-empty">Категорий пока нет</div>
                ) : (
                  roots.map((root) => renderNode(root, 0))
                )}
              </div>
            </div>
            {!filtered && (
              <div className="cat-picker-col">
                <div className="cat-picker-col-head">
                  <button
                    type="button"
                    className="btn btn-text"
                    disabled={browseId == null}
                    onClick={() => {
                      if (browseId == null) return;
                      const parent = byId.get(browseId);
                      setBrowseId(parentKey(parent?.parent_id));
                    }}
                  >
                    ← Назад
                  </button>
                  <strong title={browseTitle}>{browseTitle}</strong>
                </div>
                <div className="cat-picker-folder-list">
                  {browseId != null && byId.get(browseId) && (
                    <button type="button" className="cat-picker-folder-card select-here" onClick={() => pick(byId.get(browseId)!)}>
                      Выбрать эту папку
                    </button>
                  )}
                  {browseChildren.length === 0 ? (
                    <div className="cat-picker-empty">Пустая папка</div>
                  ) : browseChildren.map((cat) => {
                    const kids = tree.get(cat.id) || [];
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        className="cat-picker-folder-card"
                        onClick={() => (kids.length ? setBrowseId(cat.id) : pick(cat))}
                        onDoubleClick={() => pick(cat)}
                      >
                        <span className={`cat-picker-folder-icon ${kids.length ? 'is-folder' : 'is-leaf'}`}>{kids.length ? '[+]' : '·'}</span>
                        <span>
                          <strong>{cat.name}</strong>
                          {cat.sku_prefix && <small>{cat.sku_prefix}</small>}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </FloatingWidget>
    </div>
  );
}
