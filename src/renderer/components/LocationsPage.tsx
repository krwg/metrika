import { useEffect, useMemo, useState } from 'react';
import FloatingWidget from './FloatingWidget';

type Props = { refreshToken: number; onOpen: (location: any) => void; onChanged: () => void };

export default function LocationsPage({ refreshToken, onOpen, onChanged }: Props) {
  const [locations, setLocations] = useState<any[]>([]);
  const [zones, setZones] = useState<any[]>([]);
  const [editing, setEditing] = useState<any | null>(null);
  const [zoneEdit, setZoneEdit] = useState<any | null>(null);
  const [zoneFilter, setZoneFilter] = useState<string>('all');
  const [form, setForm] = useState({ barcode: '', name: '', description: '', zone_id: '', location_type: 'cell', parent_location_id: '', capacity_qty: '', aisle: '', rack: '', shelf_level: '' });
  const [zoneForm, setZoneForm] = useState({ name: '', description: '' });
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

  async function load() {
    const [nextLocations, nextZones] = await Promise.all([
      (window as any).api.getLocations(),
      (window as any).api.getZones(),
    ]);
    setLocations(nextLocations || []);
    setZones(nextZones || []);
  }

  useEffect(() => { void load(); }, [refreshToken]);

  function open(location?: any, locationType = 'warehouse', parentLocationId = '') {
    setEditing(location || {});
    setForm({
      barcode: location?.barcode || '',
      name: location?.name || '',
      description: location?.description || '',
      zone_id: String(location?.zone_id || ''),
      location_type: location?.location_type || locationType,
      parent_location_id: String(location?.parent_location_id || parentLocationId),
      capacity_qty: location?.capacity_qty == null ? '' : String(location.capacity_qty),
      aisle: location?.aisle || '',
      rack: location?.rack || '',
      shelf_level: location?.shelf_level || '',
    });
    setError('');
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    try {
      if (!form.barcode.trim() || !form.name.trim()) throw new Error('Заполните код и название ячейки');
      if (editing.id) await (window as any).api.updateLocation(editing.id, form);
      else await (window as any).api.createLocation(form);
      setEditing(null);
      await load();
      onChanged();
    } catch (saveError: any) {
      setError(saveError?.message || 'Не удалось сохранить ячейку');
    }
  }

  async function remove(location: any) {
    if (!window.confirm(`Удалить адрес «${location.name}»?`)) return;
    try {
      await (window as any).api.deleteLocation(location.id);
      await load();
      onChanged();
    } catch (removeError: any) {
      setError(removeError?.message || 'Не удалось удалить адрес');
    }
  }

  function openZone(zone?: any) {
    setZoneEdit(zone || {});
    setZoneForm({ name: zone?.name || '', description: zone?.description || '' });
    setError('');
  }

  async function saveZone(event: React.FormEvent) {
    event.preventDefault();
    try {
      if (!zoneForm.name.trim()) throw new Error('Укажите название зоны');
      if (zoneEdit?.id) await (window as any).api.updateZone(zoneEdit.id, zoneForm);
      else await (window as any).api.createZone(zoneForm);
      setZoneEdit(null);
      await load();
      onChanged();
    } catch (e: any) {
      setError(e?.message || 'Не удалось сохранить зону');
    }
  }

  async function removeZone(zone: any) {
    if (!window.confirm(`Удалить зону «${zone.name}»?`)) return;
    try {
      await (window as any).api.deleteZone(zone.id);
      if (zoneFilter === String(zone.id)) setZoneFilter('all');
      await load();
      onChanged();
    } catch (e: any) {
      setError(e?.message || 'Не удалось удалить зону');
    }
  }

  const matchingLocations = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return locations.filter((location) => {
      if (zoneFilter !== 'all' && String(location.zone_id || '') !== zoneFilter) return false;
      if (!query) return true;
      return `${location.name} ${location.barcode} ${location.parent_name || ''} ${location.zone_name || ''}`.toLocaleLowerCase().includes(query);
    });
  }, [locations, search, zoneFilter]);

  const visibleLocations = useMemo(() => {
    const visibleIds = new Set<number>();
    for (const match of matchingLocations) {
      let current = match;
      while (current && !visibleIds.has(current.id)) {
        visibleIds.add(current.id);
        current = locations.find((location) => location.id === current.parent_location_id);
      }
    }
    return locations.filter((location) => visibleIds.has(location.id));
  }, [locations, matchingLocations]);

  const parentOptions = locations.filter((location) => location.location_type !== 'cell' && location.id !== editing?.id);
  const typeLabels: Record<string, string> = { warehouse: 'Склад', subwarehouse: 'Подсклад', cell: 'Ячейка' };

  return (
    <>
      <div className="page-header">
        <div>
          <div className="section-label">Адресное хранение</div>
          <h1>Карта склада</h1>
          <p>Склады, подсклады, ячейки, зоны и вместимость</p>
        </div>
        <div className="settings-actions">
          <button type="button" className="btn btn-secondary" onClick={() => openZone()}>Новая зона</button>
          <button type="button" className="btn btn-primary" onClick={() => open()}>Новый адрес</button>
        </div>
      </div>
      {error && <div className="form-error page-error">{error}</div>}

      <div className="zone-summary">
        <button
          type="button"
          className={`zone-chip${zoneFilter === 'all' ? ' is-active' : ''}`}
          onClick={() => setZoneFilter('all')}
        >
          <strong>Все зоны</strong>
          <span>{locations.length} адресов</span>
        </button>
        {zones.map((zone) => (
          <div key={zone.id} className={`zone-chip${zoneFilter === String(zone.id) ? ' is-active' : ''}`}>
            <button type="button" className="zone-chip-main" onClick={() => setZoneFilter(String(zone.id))}>
              <strong>{zone.name}</strong>
              <span>
                {zone.location_count} адресов · {zone.total_qty} ед.
                {Number(zone.capacity_total) > 0 ? ` · вмест. ${zone.capacity_total}` : ''}
              </span>
            </button>
            <div className="zone-chip-actions">
              <button type="button" className="btn btn-text" onClick={() => openZone(zone)}>Изменить</button>
              <button type="button" className="btn btn-text" onClick={() => void removeZone(zone)}>Удалить</button>
            </div>
          </div>
        ))}
      </div>

      <div className="location-map-tools">
        <input
          aria-label="Поиск адреса"
          placeholder="Найти склад, подсклад, ячейку или зону"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <span>{visibleLocations.length} адресов</span>
      </div>

      <div className="location-grid">
        {visibleLocations.map((location) => (
          <LocationCard
            key={location.id}
            location={location}
            typeLabel={typeLabels[location.location_type] || 'Ячейка'}
            onOpen={onOpen}
            onEdit={open}
            onDelete={remove}
            onMoved={() => { void load(); onChanged(); }}
          />
        ))}
      </div>

      {locations.length === 0 && (
        <div className="empty"><h3>Адреса не созданы</h3><p>Создайте первый склад или ячейку хранения.</p></div>
      )}
      {visibleLocations.length === 0 && locations.length > 0 && (
        <div className="empty"><h3>Ничего не найдено</h3><p>Измените фильтр зоны или поисковый запрос.</p></div>
      )}

      {editing && (
        <FloatingWidget
          title={editing.id ? 'Изменение адреса' : 'Новый адрес хранения'}
          open
          onClose={() => setEditing(null)}
          width={560}
          zIndex={1730}
        >
          <form onSubmit={save}>
            <p className="subtext" style={{ marginTop: 0 }}>Иерархия, зона, вместимость и адресная полка</p>
            <div className="form-grid">
              <label>Тип адреса
                <select value={form.location_type} onChange={(event) => setForm({ ...form, location_type: event.target.value, parent_location_id: event.target.value === 'warehouse' ? '' : form.parent_location_id })}>
                  <option value="warehouse">Склад</option>
                  <option value="subwarehouse">Подсклад</option>
                  <option value="cell">Ячейка</option>
                </select>
              </label>
              <label>Родительский адрес
                <select value={form.parent_location_id} disabled={form.location_type === 'warehouse'} onChange={(event) => setForm({ ...form, parent_location_id: event.target.value })}>
                  <option value="">Без родителя</option>
                  {parentOptions.map((parent) => <option value={parent.id} key={parent.id}>{parent.name}</option>)}
                </select>
              </label>
              <label>Код адреса<input value={form.barcode} onChange={(event) => setForm({ ...form, barcode: event.target.value })} /></label>
              <label>Название<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
              <label>Зона
                <select value={form.zone_id} onChange={(event) => setForm({ ...form, zone_id: event.target.value })}>
                  <option value="">Без зоны</option>
                  {zones.map((zone) => <option value={zone.id} key={zone.id}>{zone.name}</option>)}
                </select>
              </label>
              <label>Вместимость, шт.<input type="number" min="0" value={form.capacity_qty} onChange={(event) => setForm({ ...form, capacity_qty: event.target.value })} placeholder="Не ограничено" /></label>
              <label>Проход / ряд<input value={form.aisle} onChange={(event) => setForm({ ...form, aisle: event.target.value })} placeholder="A" /></label>
              <label>Стеллаж<input value={form.rack} onChange={(event) => setForm({ ...form, rack: event.target.value })} placeholder="01" /></label>
              <label>Уровень / полка<input value={form.shelf_level} onChange={(event) => setForm({ ...form, shelf_level: event.target.value })} placeholder="3" /></label>
              <label className="field-wide">Описание<textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
            </div>
            {error && <div className="form-error">{error}</div>}
            <div className="modal-actions">
              <button type="button" className="btn btn-text" onClick={() => setEditing(null)}>Отмена</button>
              <button className="btn btn-primary">Сохранить</button>
            </div>
          </form>
        </FloatingWidget>
      )}

      {zoneEdit && (
        <FloatingWidget
          title={zoneEdit.id ? 'Изменение зоны' : 'Новая зона'}
          open
          onClose={() => setZoneEdit(null)}
          width={440}
          zIndex={1740}
        >
          <form onSubmit={saveZone}>
            <div className="form-grid">
              <label className="field-wide">Название
                <input value={zoneForm.name} onChange={(e) => setZoneForm({ ...zoneForm, name: e.target.value })} />
              </label>
              <label className="field-wide">Описание
                <textarea value={zoneForm.description} onChange={(e) => setZoneForm({ ...zoneForm, description: e.target.value })} />
              </label>
            </div>
            {error && <div className="form-error">{error}</div>}
            <div className="modal-actions">
              <button type="button" className="btn btn-text" onClick={() => setZoneEdit(null)}>Отмена</button>
              <button className="btn btn-primary">Сохранить</button>
            </div>
          </form>
        </FloatingWidget>
      )}
    </>
  );
}

function LocationCard({ location, typeLabel, onOpen, onEdit, onDelete, onMoved, onAddChild }: any) {
  const [contents, setContents] = useState<any[]>([]);
  const [dragOver, setDragOver] = useState(false);
  onAddChild = onAddChild || ((type: string) => onEdit({ location_type: type, parent_location_id: location.id }));
  useEffect(() => { (window as any).api.getLocationContents(location.id).then(setContents); }, [location.id, location.total_qty]);

  const fillPct = location.fill_pct;
  const fillClass = fillPct == null
    ? (location.total_qty > 20 ? 'full' : location.total_qty > 10 ? 'busy' : 'free')
    : fillPct >= 100 ? 'full' : fillPct >= 70 ? 'busy' : 'free';

  function dragStart(event: React.DragEvent, item: any) {
    event.dataTransfer.setData('application/metrika-item', JSON.stringify({ itemId: item.id, sourceId: location.id, quantity: item.quantity }));
  }

  async function drop(event: React.DragEvent) {
    event.preventDefault();
    setDragOver(false);
    const raw = event.dataTransfer.getData('application/metrika-item');
    if (!raw) return;
    const data = JSON.parse(raw);
    if (data.sourceId === location.id) return;
    if (!window.confirm(`Переместить ${data.quantity} шт. товара в ячейку «${location.name}»?`)) return;
    try {
      await (window as any).api.moveInventory({
        item_id: data.itemId,
        from_location_id: data.sourceId,
        to_location_id: location.id,
        quantity: data.quantity,
      });
      onMoved();
    } catch (dropError: any) {
      window.alert(dropError?.message || 'Перемещение не выполнено');
    }
  }

  return (
    <article
      className={`location-card location-level-${location.location_type} ${fillClass} ${dragOver ? 'drag-over' : ''}`}
      onClick={() => onOpen(location)}
      onDragOver={(event) => { event.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={drop}
    >
      <div className="location-card-header">
        <div>
          <div className="mono">{location.barcode}</div>
          <h2>{location.name}</h2>
          <small className={`location-type-pill location-type-${location.location_type}`}>{typeLabel}</small>
          {location.zone_name && <small className="location-zone-pill">{location.zone_name}</small>}
        </div>
        <div className="location-actions">
          {location.location_type !== 'cell' && (
            <>
              <button type="button" className="btn btn-text" onClick={(event) => { event.stopPropagation(); onAddChild('subwarehouse'); }}>+ Подсклад</button>
              <button type="button" className="btn btn-text" onClick={(event) => { event.stopPropagation(); onAddChild('cell'); }}>+ Ячейка</button>
            </>
          )}
          <button type="button" className="btn btn-text" onClick={(event) => { event.stopPropagation(); onEdit(location); }}>Изменить</button>
          <button type="button" className="btn btn-danger" onClick={(event) => { event.stopPropagation(); onDelete(location); }}>Удалить</button>
        </div>
      </div>
      <p>{location.description || 'Описание не задано'}</p>
      {(location.aisle || location.rack || location.shelf_level || location.capacity_qty != null) && (
        <div className="subtext">
          {[
            location.aisle && `Ряд ${location.aisle}`,
            location.rack && `Стеллаж ${location.rack}`,
            location.shelf_level && `Полка ${location.shelf_level}`,
            location.capacity_qty != null && `Вместимость ${location.capacity_qty}`,
          ].filter(Boolean).join(' · ')}
        </div>
      )}
      {fillPct != null && (
        <div className="location-fill" aria-label={`Заполненность ${fillPct}%`}>
          <div className="location-fill-bar" style={{ width: `${Math.min(100, fillPct)}%` }} />
          <span>{location.total_qty}/{location.capacity_qty} · {fillPct}%</span>
        </div>
      )}
      <div className="location-contents">
        {contents.slice(0, 4).map((item) => (
          <div className="location-item" draggable key={item.id} onDragStart={(event) => dragStart(event, item)}>
            <span>{item.name}</span>
            <strong>{item.available ?? item.quantity}</strong>
          </div>
        ))}
        {contents.length > 4 && <small>Еще позиций: {contents.length - 4}</small>}
        {!contents.length && <small>{location.location_type === 'cell' ? 'Пустая ячейка' : 'Нет товаров напрямую'}</small>}
      </div>
      <div className="location-stats">
        <span><strong>{location.item_count}</strong> позиций</span>
        <span><strong>{location.total_qty}</strong> единиц</span>
      </div>
    </article>
  );
}
