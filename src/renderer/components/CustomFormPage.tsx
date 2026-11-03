import { useEffect, useMemo, useState } from 'react';

type Props = {
  formCode: string;
  refreshToken?: number;
  onNotice?: (msg: string) => void;
};



export default function CustomFormPage({ formCode, refreshToken = 0, onNotice }: Props) {
  const [form, setForm] = useState<any>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const fields = useMemo(() => {
    try {
      return JSON.parse(form?.fields_json || '[]') as Array<{ key: string; label: string; type?: string }>;
    } catch {
      return [];
    }
  }, [form?.fields_json]);

  async function load() {
    try {
      setError('');
      const meta = await (window as any).api.getCustomFormByCode?.(formCode);
      setForm(meta);
      if (meta?.id) {
        const list = await (window as any).api.listCustomFormRows?.(meta.id);
        setRows(list || []);
      } else {
        setRows([]);
      }
    } catch (e: any) {
      setError(e?.message || 'Форма недоступна');
      setForm(null);
      setRows([]);
    }
  }

  useEffect(() => { void load(); }, [formCode, refreshToken]);

  async function saveRow() {
    if (!form?.id) return;
    setBusy(true);
    try {
      await (window as any).api.saveCustomFormRow?.({ form_id: form.id, data: draft });
      setDraft({});
      await load();
      onNotice?.('Запись сохранена');
    } catch (e: any) {
      onNotice?.(e?.message || 'Не удалось сохранить');
    } finally {
      setBusy(false);
    }
  }

  async function removeRow(id: number) {
    setBusy(true);
    try {
      await (window as any).api.deleteCustomFormRow?.(id);
      await load();
    } catch (e: any) {
      onNotice?.(e?.message || 'Не удалось удалить');
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return (
      <div className="page-header" style={{ padding: 24 }}>
        <h1>Форма недоступна</h1>
        <p className="muted">{error}</p>
      </div>
    );
  }

  if (!form) {
    return <div className="muted" style={{ padding: 24 }}>Загрузка…</div>;
  }

  return (
    <div style={{ padding: '8px 4px 24px' }}>
      <div className="page-header" style={{ marginBottom: 12 }}>
        <div>
          <div className="section-label">Пользовательская форма</div>
          <h1>{form.title}</h1>
          {form.description && <p>{form.description}</p>}
        </div>
      </div>

      <section className="card settings-card" style={{ marginBottom: 16 }}>
        <div className="section-label">Новая запись</div>
        <div style={{ display: 'grid', gap: 10, maxWidth: 560, marginTop: 8 }}>
          {fields.map((f) => (
            <label key={f.key} style={{ display: 'grid', gap: 4 }}>
              <span>{f.label || f.key}</span>
              {f.type === 'textarea' || f.type === 'multiline' ? (
                <textarea
                  rows={3}
                  value={draft[f.key] || ''}
                  onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                />
              ) : f.type === 'bool' ? (
                <select
                  value={draft[f.key] || ''}
                  onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                >
                  <option value="">—</option>
                  <option value="1">Да</option>
                  <option value="0">Нет</option>
                </select>
              ) : (
                <input
                  type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
                  value={draft[f.key] || ''}
                  onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                />
              )}
            </label>
          ))}
          {fields.length === 0 && <p className="muted">В форме нет полей. Задайте их в Редакторе → Формы.</p>}
          <button type="button" className="btn btn-primary" disabled={busy || !fields.length} onClick={() => void saveRow()}>
            Сохранить
          </button>
        </div>
      </section>

      <section className="table-wrap">
        <div className="table-header">
          <h2>Записи</h2>
          <span className="table-caption">{rows.length}</span>
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th>#</th>
              {fields.map((f) => <th key={f.key}>{f.label || f.key}</th>)}
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              let data: Record<string, any> = {};
              try { data = JSON.parse(row.data_json || '{}'); } catch { data = {}; }
              return (
                <tr key={row.id}>
                  <td>{row.id}</td>
                  {fields.map((f) => <td key={f.key}>{data[f.key] ?? '—'}</td>)}
                  <td>
                    <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void removeRow(row.id)}>
                      Удалить
                    </button>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={Math.max(2, fields.length + 2)} className="muted">Пока нет записей</td></tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

export function isCustomFormPage(page: string) {
  return String(page || '').startsWith('custom_');
}

export function customFormCodeFromPage(page: string) {
  return String(page || '').replace(/^custom_/, '');
}
