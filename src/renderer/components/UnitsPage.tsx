import { useEffect, useState } from 'react';
import FloatingWidget from './FloatingWidget';

type UnitForm = {
  name: string;
  symbol: string;
  description: string;
  decimal_places: number;
  code: string;
  is_base: boolean;
};

export default function UnitsPage({ refreshToken, onChanged }: { refreshToken: number; onChanged: () => void }) {
  const [units, setUnits] = useState<any[]>([]);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState<UnitForm>({
    name: '', symbol: '', description: '', decimal_places: 0, code: '', is_base: false,
  });
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  async function load() { setUnits((await (window as any).api.getUnits()) || []); }
  useEffect(() => { load(); }, [refreshToken]);

  function open(unit?: any) {
    setEditing(unit || {});
    setForm({
      name: unit?.name || '',
      symbol: unit?.symbol || '',
      description: unit?.description || '',
      decimal_places: Number(unit?.decimal_places || 0),
      code: unit?.code || '',
      is_base: Boolean(Number(unit?.is_base)),
    });
    setError('');
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    try {
      const payload = {
        name: form.name,
        symbol: form.symbol,
        description: form.description,
        decimal_places: form.decimal_places,
        code: form.code,
        is_base: form.is_base,
      };
      if (editing.id) await (window as any).api.updateUnit(editing.id, payload);
      else await (window as any).api.createUnit(payload);
      setEditing(null);
      await load();
      onChanged();
    } catch (saveError: any) { setError(saveError?.message || 'Не удалось сохранить единицу'); }
  }

  async function remove(unit: any) {
    if (!window.confirm(`Удалить единицу «${unit.name} (${unit.symbol})»?`)) return;
    try { await (window as any).api.deleteUnit(unit.id); await load(); onChanged(); }
    catch (removeError: any) { setError(removeError?.message || 'Не удалось удалить единицу'); }
  }

  const visibleUnits = units.filter((unit) =>
    !search.trim() ||
    unit.name.toLowerCase().includes(search.trim().toLowerCase()) ||
    unit.symbol.toLowerCase().includes(search.trim().toLowerCase()) ||
    String(unit.description || '').toLowerCase().includes(search.trim().toLowerCase()) ||
    String(unit.code || '').toLowerCase().includes(search.trim().toLowerCase())
  );

  return <>
    <div className="page-header">
      <div>
        <div className="section-label">Справочники</div>
        <h1>Единицы измерения</h1>
        <p>Полное наименование, краткое обозначение, код ОКЕИ, точность и признак базовой единицы.</p>
      </div>
      <button className="btn btn-primary" onClick={() => open()}>Новая единица</button>
    </div>

    {error && <div className="form-error page-error">{error}</div>}

    <section className="table-wrap unit-manager">
      <div className="table-header">
        <div><h2>Единицы каталога</h2></div>
        <span className="table-caption">{visibleUnits.length} из {units.length}</span>
      </div>

      <div style={{ padding: '12px 20px 0' }}>
        <input
          aria-label="Поиск единиц"
          placeholder="Найти по названию, обозначению, коду ОКЕИ или описанию"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          style={{ maxWidth: 420 }}
        />
      </div>

      {visibleUnits.length ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th style={{ width: 72 }}>Код</th>
                <th style={{ width: 80 }}>Символ</th>
                <th>Название</th>
                <th>Описание</th>
                <th style={{ width: 90 }}>Точность</th>
                <th style={{ width: 80 }}>Базовая</th>
                <th style={{ width: 100 }}>Товаров</th>
                <th style={{ width: 180 }}>Действия</th>
              </tr>
            </thead>
            <tbody>
              {visibleUnits.map((unit: any) => (
                <tr key={unit.id}>
                  <td className="mono">{unit.code || '—'}</td>
                  <td className="mono"><strong>{unit.symbol}</strong></td>
                  <td className="strong">{unit.name}</td>
                  <td>{unit.description || '—'}</td>
                  <td className="mono">{Number(unit.decimal_places || 0)}</td>
                  <td>{Number(unit.is_base) ? 'да' : '—'}</td>
                  <td>
                    <span className={`qty-badge ${Number(unit.item_count) === 0 ? 'low' : 'ok'}`}>
                      {unit.item_count}
                    </span>
                  </td>
                  <td>
                    <div className="row-actions">
                      <button className="btn btn-text" onClick={() => open(unit)}>Изменить</button>
                      <button
                        className="btn btn-danger"
                        onClick={() => remove(unit)}
                        disabled={Boolean(Number(unit.is_base)) || unit.symbol === 'шт.' || Number(unit.item_count) > 0}
                        title={Number(unit.is_base) || unit.symbol === 'шт.' ? 'Базовая единица' : `Используется в ${unit.item_count} товарах`}
                      >
                        Удалить
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty">
          <h3>Единиц пока нет</h3>
          <p>Добавьте единицы измерения для каталога.</p>
        </div>
      )}
    </section>

    {editing && (
      <FloatingWidget
        title={editing.id ? 'Изменить единицу' : 'Новая единица'}
        open
        onClose={() => setEditing(null)}
        width={520}
        zIndex={1740}
      >
        <form className="unit-modal" onSubmit={save}>
          <p className="subtext" style={{ marginTop: 0 }}>
            Код ОКЕИ используется в печатных формах. Базовая единица — одна на организацию (обычно «шт.»).
          </p>
          <div className="form-grid">
            <label>Название
              <input autoFocus value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Например, Штука" />
            </label>
            <label>Краткое обозначение
              <input value={form.symbol} onChange={(event) => setForm({ ...form, symbol: event.target.value })} placeholder="Например, шт." />
            </label>
            <label>Код ОКЕИ
              <input value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} placeholder="796" />
            </label>
            <label>Знаков после запятой
              <input type="number" min="0" max="6" value={form.decimal_places} onChange={(event) => setForm({ ...form, decimal_places: Number(event.target.value) || 0 })} />
            </label>
            <label className="field-wide">Описание
              <textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Когда применять эту единицу" />
            </label>
            <label className="field-wide" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={form.is_base} onChange={(e) => setForm({ ...form, is_base: e.target.checked })} />
              Базовая единица учёта
            </label>
          </div>
          {error && <div className="form-error">{error}</div>}
          <div className="modal-actions">
            <button type="button" className="btn btn-text" onClick={() => setEditing(null)}>Отмена</button>
            <button className="btn btn-primary">Сохранить</button>
          </div>
        </form>
      </FloatingWidget>
    )}
  </>;
}
