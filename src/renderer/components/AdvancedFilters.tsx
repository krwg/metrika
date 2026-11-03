import { useMemo, useState } from 'react';

export type FilterField =
  | { key: string; label: string; type: 'text'; placeholder?: string }
  | { key: string; label: string; type: 'date' }
  | { key: string; label: string; type: 'select'; options: { value: string; label: string }[] };

type Props = {
  search: string;
  onSearch: (value: string) => void;
  searchPlaceholder?: string;
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  fields: FilterField[];
  chips?: { key: string; value: string; options: { value: string; label: string }[] }[];
  resultLabel?: string;
};

export default function AdvancedFilters({
  search,
  onSearch,
  searchPlaceholder = 'Поиск',
  values,
  onChange,
  fields,
  chips = [],
  resultLabel,
}: Props) {
  const [open, setOpen] = useState(false);
  const activeCount = useMemo(
    () => Object.entries(values).filter(([key, value]) => value && value !== 'all' && key !== 'q').length,
    [values],
  );

  return (
    <div className="advanced-filters">
      <div className="advanced-filters-bar">
        <input
          className="advanced-search"
          aria-label="Поиск"
          placeholder={searchPlaceholder}
          value={search}
          onChange={(event) => onSearch(event.target.value)}
        />
        <button type="button" className={`btn btn-secondary ${open || activeCount ? 'active' : ''}`} onClick={() => setOpen((value) => !value)}>
          Фильтры{activeCount ? ` · ${activeCount}` : ''}
        </button>
        {activeCount > 0 && (
          <button
            type="button"
            className="btn btn-text"
            onClick={() => {
              fields.forEach((field) => onChange(field.key, field.type === 'select' ? 'all' : ''));
              chips.forEach((chip) => onChange(chip.key, 'all'));
            }}
          >
            Сбросить
          </button>
        )}
        {resultLabel && <span className="table-caption advanced-filters-count">{resultLabel}</span>}
      </div>

      {chips.length > 0 && (
        <div className="advanced-chip-row">
          {chips.map((chip) => (
            <div className="advanced-chip-group" key={chip.key}>
              {chip.options.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`filter-chip compact ${values[chip.key] === option.value ? 'active' : ''}`}
                  onClick={() => onChange(chip.key, option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}

      {open && (
        <div className="advanced-filters-panel">
          <div className="advanced-filters-grid">
            {fields.map((field) => (
              <label key={field.key}>
                {field.label}
                {field.type === 'select' ? (
                  <select value={values[field.key] || 'all'} onChange={(event) => onChange(field.key, event.target.value)}>
                    {field.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                ) : (
                  <input
                    type={field.type}
                    value={values[field.key] || ''}
                    placeholder={field.type === 'text' ? field.placeholder : undefined}
                    onChange={(event) => onChange(field.key, event.target.value)}
                  />
                )}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
