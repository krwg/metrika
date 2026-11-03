import { useEffect, useState } from 'react';
import CategoryPicker from './CategoryPicker';

export default function TemplatesPage({ refreshToken }: { refreshToken: number }) {
  const [templates, setTemplates] = useState<any[]>([]);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({ name: '', category: '', sku_prefix: '', min_stock: 0, description: '' });
  const [error, setError] = useState('');

  async function load() {
    setTemplates((await (window as any).api.getTemplates()) || []);
  }

  useEffect(() => { load(); }, [refreshToken]);

  function resetForm() {
    setEditId(null);
    setForm({ name: '', category: '', sku_prefix: '', min_stock: 0, description: '' });
    setError('');
  }

  function startEdit(template: any) {
    setEditId(template.id);
    setForm({
      name: template.name || '',
      category: template.category || '',
      sku_prefix: template.sku_prefix || '',
      min_stock: Number(template.min_stock) || 0,
      description: template.description || '',
    });
    setError('');
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    try {
      if (editId) {
        await (window as any).api.updateTemplate(editId, form);
      } else {
        await (window as any).api.createTemplate(form);
      }
      resetForm();
      await load();
    } catch (e: any) {
      setError(e?.message || 'Не удалось сохранить шаблон');
    }
  }

  async function remove(template: any) {
    if (!window.confirm(`Удалить шаблон «${template.name}»?`)) return;
    try {
      await (window as any).api.deleteTemplate(template.id);
      if (editId === template.id) resetForm();
      await load();
    } catch (e: any) {
      setError(e?.message || 'Не удалось удалить шаблон');
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <div className="section-label">Быстрая регистрация</div>
          <h1>Шаблоны товаров</h1>
          <p>Типовые параметры для быстрой регистрации. Можно создавать, изменять и удалять.</p>
        </div>
      </div>
      {error && <div className="form-error page-error">{error}</div>}
      <section className="card template-form">
        <div className="section-label">{editId ? 'Редактирование шаблона' : 'Новый шаблон'}</div>
        <form className="form-grid" onSubmit={save}>
          <label>Название шаблона<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
          <CategoryPicker value={form.category} onChange={(category) => setForm({ ...form, category })} />
          <label>Префикс артикула<input value={form.sku_prefix} onChange={(event) => setForm({ ...form, sku_prefix: event.target.value })} /></label>
          <label>Минимальный остаток<input type="number" min="0" value={form.min_stock} onChange={(event) => setForm({ ...form, min_stock: Number(event.target.value) })} /></label>
          <label className="field-wide">Описание<textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
          <div className="modal-actions" style={{ gridColumn: '1 / -1' }}>
            {editId && <button type="button" className="btn btn-secondary" onClick={resetForm}>Отмена</button>}
            <button className="btn btn-primary" type="submit">{editId ? 'Сохранить изменения' : 'Создать шаблон'}</button>
          </div>
        </form>
      </section>
      <div className="template-grid">
        {templates.map((template) => (
          <article className={`card template-card ${editId === template.id ? 'row-selected' : ''}`} key={template.id}>
            <div className="section-label">Шаблон</div>
            <h2>{template.name}</h2>
            <p>{template.description || 'Без описания'}</p>
            <span>{template.category || 'Категория не задана'} · префикс {template.sku_prefix || '—'} · минимум {template.min_stock}</span>
            <div className="row-actions" style={{ marginTop: 12 }}>
              <button type="button" className="btn btn-secondary" onClick={() => startEdit(template)}>Изменить</button>
              <button type="button" className="btn btn-danger" onClick={() => remove(template)}>Удалить</button>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
