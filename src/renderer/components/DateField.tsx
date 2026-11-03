import { useEffect, useState } from 'react';
import { useI18n } from '../i18n';

type Props = {
  value: string;
  onChange: (iso: string) => void;
  label?: string;
  required?: boolean;
};

function isoToRu(iso: string) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

function ruToIso(ru: string) {
  const m = ru.trim().match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (!m) return '';
  return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

export default function DateField({ value, onChange, label, required }: Props) {
  const { locale } = useI18n();
  const [text, setText] = useState(isoToRu(value));

  useEffect(() => {
    if (locale === 'ru') setText(isoToRu(value));
  }, [value, locale]);

  if (locale !== 'ru') {
    return (
      <label>
        {label}
        <input type="date" lang="en" value={value} required={required} onChange={(e) => onChange(e.target.value)} />
      </label>
    );
  }

  return (
    <label className="date-field-ru">
      {label}
      <div className="date-field-ru-row">
        <input
          type="text"
          inputMode="numeric"
          placeholder="дд.мм.гггг"
          value={text}
          required={required}
          onChange={(e) => {
            const next = e.target.value;
            setText(next);
            const iso = ruToIso(next);
            if (iso || !next.trim()) onChange(iso);
          }}
          onBlur={() => {
            const iso = ruToIso(text);
            if (iso) { onChange(iso); setText(isoToRu(iso)); }
            else if (!text.trim()) { onChange(''); setText(''); }
            else setText(isoToRu(value));
          }}
        />
        <input
          type="date"
          className="date-field-ru-native"
          title="Календарь"
          lang="ru"
          value={value || ''}
          onChange={(e) => {
            onChange(e.target.value);
            setText(isoToRu(e.target.value));
          }}
        />
      </div>
    </label>
  );
}
