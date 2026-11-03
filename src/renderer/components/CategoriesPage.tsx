import React from 'react';
import { useEffect, useMemo, useState } from 'react';
import CategoryPicker from './CategoryPicker';
import FloatingWidget from './FloatingWidget';

const PALETTE = ['#397c74', '#4f6f9f', '#9b5d65', '#9a7134', '#705c9c', '#497d50', '#397b91', '#a35d37'];

type Category = {
  id: number;
  name: string;
  color: string;
  parent_id: number | null;
  sku_prefix: string | null;
  code?: string | null;
  description?: string | null;
  default_min_stock?: number | null;
  default_max_stock?: number | null;
  default_reorder_point?: number | null;
  default_brand?: string | null;
  default_track_serials?: number | null;
  default_track_lots?: number | null;
  default_lot_policy?: string | null;
  default_price_basis?: string | null;
  default_package_qty?: number | null;
  default_unit_id?: number | null;
  default_storage_note?: string | null;
  archived: number | null;
  item_count: number;
  child_count?: number;
};

type DialogState = { mode: 'create' | 'edit'; category?: Category };

const emptyForm = () => ({
  name: '',
  color: PALETTE[0],
  parent_id: '',
  sku_prefix: '',
  code: '',
  description: '',
  default_min_stock: '',
  default_max_stock: '',
  default_reorder_point: '',
  default_brand: '',
  default_track_serials: '',
  default_track_lots: '',
  default_lot_policy: '',
  default_price_basis: '',
  default_package_qty: '',
  default_unit_id: '',
  default_storage_note: '',
});

function formFromCategory(category: Category) {
  const n = (v: number | null | undefined) => (v == null ? '' : String(v));
  const b = (v: number | null | undefined) => (v == null ? '' : String(Number(v) ? 1 : 0));
  return {
    name: category.name || '',
    color: category.color || PALETTE[0],
    parent_id: category.parent_id ? String(category.parent_id) : '',
    sku_prefix: category.sku_prefix || '',
    code: category.code || '',
    description: category.description || '',
    default_min_stock: n(category.default_min_stock),
    default_max_stock: n(category.default_max_stock),
    default_reorder_point: n(category.default_reorder_point),
    default_brand: category.default_brand || '',
    default_track_serials: b(category.default_track_serials),
    default_track_lots: b(category.default_track_lots),
    default_lot_policy: category.default_lot_policy || '',
    default_price_basis: category.default_price_basis || '',
    default_package_qty: n(category.default_package_qty),
    default_unit_id: category.default_unit_id == null ? '' : String(category.default_unit_id),
    default_storage_note: category.default_storage_note || '',
  };
}

function payloadFromForm(form: ReturnType<typeof emptyForm>) {
  return {
    name: form.name.trim(),
    color: form.color,
    parent_id: form.parent_id ? Number(form.parent_id) : null,
    sku_prefix: form.sku_prefix.trim() || null,
    code: form.code.trim() || null,
    description: form.description.trim() || null,
    default_min_stock: form.default_min_stock === '' ? null : Number(form.default_min_stock),
    default_max_stock: form.default_max_stock === '' ? null : Number(form.default_max_stock),
    default_reorder_point: form.default_reorder_point === '' ? null : Number(form.default_reorder_point),
    default_brand: form.default_brand.trim() || null,
    default_track_serials: form.default_track_serials === '' ? null : Number(form.default_track_serials),
    default_track_lots: form.default_track_lots === '' ? null : Number(form.default_track_lots),
    default_lot_policy: form.default_lot_policy || null,
    default_price_basis: form.default_price_basis || null,
    default_package_qty: form.default_package_qty === '' ? null : Number(form.default_package_qty),
    default_unit_id: form.default_unit_id === '' ? null : Number(form.default_unit_id),
    default_storage_note: form.default_storage_note.trim() || null,
  };
}

export default function CategoriesPage({ refreshToken, onChanged }: { refreshToken: number; onChanged: () => void }) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [units, setUnits] = useState<any[]>([]);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [error, setError] = useState('');
  const [applyBusy, setApplyBusy] = useState(false);

  async function load() {
    try {
      const [cats, unitRows] = await Promise.all([
        (window as any).api.getCategories(),
        (window as any).api.getUnits?.() || [],
      ]);
      setCategories(cats || []);
      setUnits(unitRows || []);
    } catch (loadError: any) {
      setError(loadError?.message || 'Не удалось загрузить категории');
    }
  }
  useEffect(() => { load(); }, [refreshToken]);

  function openCreate(parentId?: number) {
    setDialog({ mode: 'create' });
    setForm({
      ...emptyForm(),
      color: PALETTE[categories.length % PALETTE.length],
      parent_id: parentId ? String(parentId) : '',
    });
    setError('');
    void (window as any).api.nextCatalogCode?.('categories').then((res: any) => {
      if (res?.code) setForm((f) => (f.code ? f : { ...f, code: res.code }));
    }).catch(() => {});
  }

  function openEdit(category: Category) {
    setDialog({ mode: 'edit', category });
    setForm(formFromCategory(category));
    setError('');
  }

  function closeDialog() {
    setDialog(null);
    setError('');
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!form.name.trim()) {
      setError('Введите название категории');
      return;
    }
    try {
      const payload = payloadFromForm(form);
      if (dialog?.mode === 'edit' && dialog.category) {
        await (window as any).api.updateCategory(dialog.category.id, payload);
      } else {
        await (window as any).api.createCategory(payload);
      }
      closeDialog();
      await load();
      onChanged();
    } catch (saveError: any) {
      setError(saveError?.message || 'Не удалось сохранить категорию');
    }
  }

  async function applyTemplate(mode: 'empty' | 'all') {
    if (!dialog?.category) return;
    const count = dialog.category.item_count || 0;
    if (!count) {
      window.alert('В категории пока нет товаров');
      return;
    }
    const label = mode === 'all'
      ? `Перезаписать шаблоном все ${count} товаров категории «${dialog.category.name}»?`
      : `Заполнить пустые поля у ${count} товаров категории «${dialog.category.name}»?`;
    if (!window.confirm(label)) return;
    setApplyBusy(true);
    try {

      await (window as any).api.updateCategory(dialog.category.id, payloadFromForm(form));
      const result = await (window as any).api.applyCategoryDefaults(dialog.category.id, { mode });
      setError('');
      await load();
      onChanged();
      window.alert(`Готово: обновлено ${result.updated}, пропущено ${result.skipped} из ${result.total}`);
    } catch (applyError: any) {
      setError(applyError?.message || 'Не удалось применить шаблон');
    } finally {
      setApplyBusy(false);
    }
  }

  async function archive(category: Category) {
    if (!window.confirm(`Архивировать категорию «${category.name}»? Товары сохранят привязку.`)) return;
    try {
      await (window as any).api.archiveCategory(category.id);
      await load();
      onChanged();
    } catch (archiveError: any) {
      setError(archiveError?.message || 'Не удалось архивировать');
    }
  }

  async function restore(category: Category) {
    try {
      await (window as any).api.updateCategory(category.id, {
        ...payloadFromForm(formFromCategory(category)),
        archived: 0,
      });
      await load();
      onChanged();
    } catch (restoreError: any) {
      setError(restoreError?.message || 'Не удалось восстановить категорию');
    }
  }

  async function remove(category: Category) {
    if (!window.confirm(`Удалить категорию «${category.name}»?`)) return;
    try {
      await (window as any).api.deleteCategory(category.id);
      setError('');
      await load();
      onChanged();
    } catch (removeError: any) {
      setError(removeError?.message || 'Не удалось удалить');
    }
  }

  const categoryPath = useMemo(() => {
    const map = new Map<number, Category>();
    categories.forEach((category) => map.set(category.id, category));
    const getPath = (id: number): string => {
      const chain: string[] = [];
      let current: Category | undefined = map.get(id);
      const seen = new Set<number>();
      while (current && !seen.has(current.id)) {
        seen.add(current.id);
        chain.unshift(current.name);
        current = current.parent_id ? map.get(current.parent_id) : undefined;
      }
      return chain.join(' / ');
    };
    const result = new Map<number, string>();
    categories.forEach((category) => result.set(category.id, getPath(category.id)));
    return result;
  }, [categories]);

  const tree = useMemo(() => {
    const children = new Map<number, Category[]>();
    categories.forEach((category) => {
      const key = category.parent_id || 0;
      if (!children.has(key)) children.set(key, []);
      children.get(key)!.push(category);
    });
    for (const list of children.values()) {
      list.sort((left, right) => left.name.localeCompare(right.name, 'ru'));
    }
    return children;
  }, [categories]);

  const matchingIds = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return null;
    const matched = new Set<number>();
    const map = new Map(categories.map((category) => [category.id, category]));
    for (const category of categories) {
      const path = (categoryPath.get(category.id) || category.name).toLowerCase();
      if (!path.includes(query) && !category.name.toLowerCase().includes(query)) continue;
      matched.add(category.id);
      let parentId = category.parent_id;
      while (parentId) {
        matched.add(parentId);
        parentId = map.get(parentId)?.parent_id || null;
      }
    }
    return matched;
  }, [categories, categoryPath, search]);

  const renderRow = (category: Category, depth = 0): React.ReactNode => {
    const path = categoryPath.get(category.id) || category.name;
    const kids = tree.get(category.id) || [];
    const isArchived = Boolean(category.archived ?? 0);
    if (!showArchived && isArchived) return null;
    if (matchingIds && !matchingIds.has(category.id)) return null;
    const hasTemplate = [
      category.default_min_stock, category.default_max_stock, category.default_reorder_point,
      category.default_brand, category.default_track_serials, category.default_track_lots,
      category.default_price_basis, category.default_package_qty, category.default_unit_id, category.default_storage_note,
    ].some((v) => v != null && v !== '');

    return (
      <React.Fragment key={category.id}>
        <tr style={{ background: isArchived ? 'var(--surface-muted)' : undefined }}>
          <td>
            <span className="category-swatch" style={{ backgroundColor: category.color, marginLeft: depth * 20 }} />
            <span className="strong" style={{ marginLeft: 8 }}>{category.name}</span>
            {category.sku_prefix ? <span className="mono" style={{ marginLeft: 8, fontSize: 11, color: 'var(--muted)' }}>{category.sku_prefix}</span> : null}
            {hasTemplate ? <span className="item-unknown-status" style={{ marginLeft: 8 }} title="Задан шаблон категории">Шаблон</span> : null}
            {isArchived ? <span className="item-unknown-status" style={{ marginLeft: 8 }}>Архив</span> : null}
          </td>
          <td className="mono" style={{ fontSize: 12, color: 'var(--muted)' }}>{path}</td>
          <td>
            <span className={`qty-badge ${category.item_count === 0 ? 'low' : 'ok'}`}>{category.item_count}</span>
          </td>
          <td>
            <div className="row-actions">
              <button className="btn btn-text" onClick={() => openEdit(category)}>Изменить</button>
              {!isArchived && <button className="btn btn-text" onClick={() => openCreate(category.id)}>Подкатегория</button>}
              {!isArchived && <button className="btn btn-text" onClick={() => archive(category)}>В архив</button>}
              {isArchived && <button className="btn btn-text" onClick={() => restore(category)}>Восстановить</button>}
              <button className="btn btn-danger" onClick={() => remove(category)} disabled={category.item_count > 0 || (category.child_count || 0) > 0}>Удалить</button>
            </div>
          </td>
        </tr>
        {kids.map((kid) => renderRow(kid, depth + 1))}
      </React.Fragment>
    );
  };

  const roots = tree.get(0) || [];
  const visibleCount = categories.filter((category) => (!(category.archived ?? 0) || showArchived) && (!matchingIds || matchingIds.has(category.id))).length;

  return <>
    <div className="page-header">
      <div>
        <div className="section-label">Классификация каталога</div>
        <h1>Категории товаров</h1>
        <p>Иерархия, префиксы SKU и шаблон свойств для новых товаров категории.</p>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-secondary" onClick={() => setShowArchived(!showArchived)}>
          {showArchived ? 'Скрыть архив' : 'Показать архив'}
        </button>
        <button
          className="btn btn-secondary"
          onClick={async () => {
            try {
              const result = await (window as any).api.syncCategoryTaxonomy();
              setError('');
              await load();
              onChanged();
              window.alert(`Иерархия обновлена.\nКорни: ${(result.roots || []).join(', ')}\nТоваров перепривязано: ${result.updated}`);
            } catch (e: any) {
              setError(e?.message || 'Не удалось синхронизировать категории');
            }
          }}
        >
          Синхронизировать иерархию
        </button>
        <button className="btn btn-primary" onClick={() => openCreate()}>Новая категория</button>
      </div>
    </div>

    {error && !dialog && <div className="form-error page-error">{error}</div>}

    <section className="table-wrap">
      <div className="table-header">
        <div><h2>Дерево категорий</h2></div>
        <span className="table-caption">{visibleCount} из {categories.length}</span>
      </div>

      <div style={{ padding: '12px 20px 0' }}>
        <input
          aria-label="Поиск категории"
          placeholder="Найти по названию или пути"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          style={{ maxWidth: 420 }}
        />
      </div>

      {categories.length ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Категория</th>
                <th>Полный путь</th>
                <th style={{ width: 100 }}>Товаров</th>
                <th style={{ width: 360 }}>Действия</th>
              </tr>
            </thead>
            <tbody>
              {roots.map((root) => renderRow(root, 0))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty">
          <h3>Категорий пока нет</h3>
          <p>Создайте первую категорию, чтобы строить иерархию каталога.</p>
          <button className="btn btn-primary" onClick={() => openCreate()}>Создать категорию</button>
        </div>
      )}
    </section>

    {dialog && (
      <FloatingWidget
        title={dialog.mode === 'edit' ? `Категория: ${dialog.category?.name || form.name || '…'}` : 'Новая категория'}
        open
        onClose={closeDialog}
        width={640}
        zIndex={1750}
      >
        <form onSubmit={save}>
          <p className="subtext" style={{ marginTop: 0 }}>Цвет и префикс SKU — в каталоге и генераторе артикулов. Шаблон подставляет свойства новым товарам.</p>
          <div className="form-grid">
            <label>Название
              <input autoFocus required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
            </label>
            <CategoryPicker
              label="Родительская категория"
              value={form.parent_id}
              valueMode="id"
              onChange={(parent_id) => setForm({ ...form, parent_id })}
              emptyLabel="Без родителя (корневая)"
            />
            <label>Префикс SKU
              <input value={form.sku_prefix} onChange={(event) => setForm({ ...form, sku_prefix: event.target.value.toUpperCase() })} placeholder="Например, MCU" maxLength={12} />
            </label>
            <label>Код справочника
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} placeholder="00-000001" maxLength={32} style={{ flex: 1 }} />
                {dialog?.mode === 'create' && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      void (window as any).api.nextCatalogCode?.('categories').then((res: any) => {
                        if (res?.code) setForm((f) => ({ ...f, code: res.code }));
                      });
                    }}
                  >
                    Авто
                  </button>
                )}
              </div>
            </label>
            <label className="field-wide">Описание / правила хранения
              <textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Назначение категории, условия учёта" />
            </label>
            <label>Цвет категории
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
                <input type="color" value={form.color} onChange={(event) => setForm({ ...form, color: event.target.value })} style={{ width: 52, height: 42, padding: 4 }} />
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {PALETTE.map((swatch) => (
                    <button
                      key={swatch}
                      type="button"
                      aria-label={`Цвет ${swatch}`}
                      onClick={() => setForm({ ...form, color: swatch })}
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 4,
                        border: form.color === swatch ? '2px solid var(--text)' : '1px solid var(--border)',
                        background: swatch,
                        cursor: 'pointer',
                      }}
                    />
                  ))}
                </div>
              </div>
            </label>
          </div>

          <div style={{ marginTop: 16 }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 15 }}>Шаблон категории</h3>
            <p className="subtext" style={{ marginTop: 0 }}>Пустое поле = не задано. У подкатегории свой шаблон перекрывает родителя; пустые поля берутся с предка.</p>
            <div className="form-grid">
              <label>Мин. остаток
                <input type="number" min="0" value={form.default_min_stock} onChange={(event) => setForm({ ...form, default_min_stock: event.target.value })} placeholder="Для новых товаров" />
              </label>
              <label>Точка заказа
                <input type="number" min="0" value={form.default_reorder_point} onChange={(event) => setForm({ ...form, default_reorder_point: event.target.value })} />
              </label>
              <label>Макс. остаток
                <input type="number" min="0" value={form.default_max_stock} onChange={(event) => setForm({ ...form, default_max_stock: event.target.value })} />
              </label>
              <label>Бренд
                <input value={form.default_brand} onChange={(event) => setForm({ ...form, default_brand: event.target.value })} placeholder="Торговая марка" />
              </label>
              <label>Единица измерения
                <select value={form.default_unit_id} onChange={(event) => setForm({ ...form, default_unit_id: event.target.value })}>
                  <option value="">Не задана</option>
                  {units.map((unit) => (
                    <option key={unit.id} value={unit.id}>{unit.name} ({unit.symbol})</option>
                  ))}
                </select>
              </label>
              <label>Режим цены
                <select value={form.default_price_basis} onChange={(event) => setForm({ ...form, default_price_basis: event.target.value })}>
                  <option value="">Не задан</option>
                  <option value="unit">За единицу</option>
                  <option value="package">Упаковочная закупка</option>
                </select>
              </label>
              <label>Шт в упаковке
                <input type="number" min="1" value={form.default_package_qty} onChange={(event) => setForm({ ...form, default_package_qty: event.target.value })} placeholder="Напр. 150" />
              </label>
              <label>Серийные номера
                <select value={form.default_track_serials} onChange={(event) => setForm({ ...form, default_track_serials: event.target.value })}>
                  <option value="">Не задано</option>
                  <option value="0">Выкл</option>
                  <option value="1">Вкл</option>
                </select>
              </label>
              <label>Партии
                <select value={form.default_track_lots} onChange={(event) => setForm({ ...form, default_track_lots: event.target.value })}>
                  <option value="">Не задано</option>
                  <option value="0">Выкл</option>
                  <option value="1">Вкл</option>
                </select>
              </label>
              <label>Политика партий
                <select value={form.default_lot_policy} onChange={(event) => setForm({ ...form, default_lot_policy: event.target.value })}>
                  <option value="">Не задана</option>
                  <option value="fifo">FIFO</option>
                  <option value="fefo">FEFO</option>
                  <option value="manual">Вручную</option>
                </select>
              </label>
              <label className="field-wide">Условия хранения (по умолчанию)
                <textarea value={form.default_storage_note} onChange={(event) => setForm({ ...form, default_storage_note: event.target.value })} placeholder="Температура, влажность…" />
              </label>
            </div>
            {dialog.mode === 'edit' && dialog.category && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                <button type="button" className="btn btn-secondary" disabled={applyBusy} onClick={() => applyTemplate('empty')}>
                  Применить к пустым полям товаров
                </button>
                <button type="button" className="btn btn-text" disabled={applyBusy} onClick={() => applyTemplate('all')}>
                  Перезаписать все товары
                </button>
              </div>
            )}
          </div>

          <div style={{ marginTop: 16, padding: 12, border: '1px solid var(--border)', background: 'var(--surface-muted)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="category-swatch" style={{ backgroundColor: form.color }} />
              <strong>{form.name || 'Название категории'}</strong>
              {form.sku_prefix ? <span className="mono" style={{ fontSize: 12, color: 'var(--muted)' }}>{form.sku_prefix}</span> : null}
            </div>
            <div className="subtext" style={{ marginTop: 6 }}>
              Путь: {form.parent_id ? `${categoryPath.get(Number(form.parent_id))} / ${form.name || '...'}` : form.name || '...'}
            </div>
          </div>

          {error && <div className="form-error">{error}</div>}
          <div className="modal-actions">
            <button type="button" className="btn btn-text" onClick={closeDialog}>Отмена</button>
            <button className="btn btn-primary" type="submit">Сохранить</button>
          </div>
        </form>
      </FloatingWidget>
    )}
  </>;
}
