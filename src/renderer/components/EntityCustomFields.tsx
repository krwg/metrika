import { useEffect, useState } from 'react';

type FieldDef = {
  id: number;
  field_key: string;
  label: string;
  field_type: string;
  required?: number | boolean;
  options_json?: string;
  value_text?: string | null;
};

type Props = {
  entity: 'item' | 'counterparty' | 'employee' | 'document';
  
  fields?: FieldDef[];
  values?: Record<string, string>;
  onChange?: (values: Record<string, string>) => void;
  readOnly?: boolean;
  className?: string;
};

function parseOptions(raw?: string) {
  try {
    const opts = JSON.parse(raw || '[]');
    return Array.isArray(opts) ? opts.map(String) : [];
  } catch {
    return [];
  }
}



export default function EntityCustomFields({
  entity,
  fields: fieldsProp,
  values: valuesProp,
  onChange,
  readOnly = false,
  className,
}: Props) {
  const [defs, setDefs] = useState<FieldDef[]>(fieldsProp || []);
  const [values, setValues] = useState<Record<string, string>>(valuesProp || {});

  useEffect(() => {
    if (fieldsProp) {
      setDefs(fieldsProp);
      const next: Record<string, string> = {};
      for (const f of fieldsProp) {
        next[f.field_key] = f.value_text != null ? String(f.value_text) : (valuesProp?.[f.field_key] ?? '');
      }
      setValues((prev) => ({ ...next, ...prev, ...(valuesProp || {}) }));
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const list = await (window as any).api.listCustomFields?.({ entity });
        if (cancelled) return;
        setDefs(list || []);
      } catch {
        if (!cancelled) setDefs([]);
      }
    })();
    return () => { cancelled = true; };
  }, [entity, fieldsProp, valuesProp]);

  useEffect(() => {
    if (valuesProp) setValues((prev) => ({ ...prev, ...valuesProp }));
  }, [valuesProp]);

  function setField(key: string, value: string) {
    const next = { ...values, [key]: value };
    setValues(next);
    onChange?.(next);
  }

  if (!defs.length) return null;

  return (
    <div className={className || 'entity-custom-fields'}>
      <div className="section-label">Дополнительные реквизиты</div>
      <div className="form-grid" style={{ marginTop: 8 }}>
        {defs.map((f) => {
          const opts = parseOptions(f.options_json);
          const val = values[f.field_key] ?? '';
          if (readOnly) {
            let display = val || '—';
            if (f.field_type === 'bool') display = val === '1' || val === 'true' ? 'Да' : val === '0' ? 'Нет' : '—';
            return (
              <div key={f.field_key} className="span-2">
                <span className="subtext">{f.label}</span>
                <div>{display}</div>
              </div>
            );
          }
          return (
            <label key={f.field_key} className="span-2">
              {f.label}{f.required ? ' *' : ''}
              {f.field_type === 'bool' ? (
                <select value={val} onChange={(e) => setField(f.field_key, e.target.value)}>
                  <option value="">—</option>
                  <option value="1">Да</option>
                  <option value="0">Нет</option>
                </select>
              ) : f.field_type === 'select' ? (
                <select value={val} onChange={(e) => setField(f.field_key, e.target.value)}>
                  <option value="">—</option>
                  {opts.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : f.field_type === 'textarea' || f.field_type === 'multiline' ? (
                <textarea rows={2} value={val} onChange={(e) => setField(f.field_key, e.target.value)} />
              ) : (
                <input
                  type={f.field_type === 'number' ? 'number' : f.field_type === 'date' ? 'date' : 'text'}
                  value={val}
                  onChange={(e) => setField(f.field_key, e.target.value)}
                  required={Boolean(f.required)}
                />
              )}
            </label>
          );
        })}
      </div>
    </div>
  );
}

export function customValuesFromFields(fields: FieldDef[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of fields || []) {
    if (f.value_text != null && String(f.value_text) !== '') out[f.field_key] = String(f.value_text);
  }
  return out;
}
