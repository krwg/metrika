



export type PrintFormId =
  | 'simple'
  | 'gost-act'
  | 'gost-waybill'
  | 'gost-order'
  | 'gost-inventory';

export type PrintFormOption = {
  id: PrintFormId;
  label: string;
  hint: string;
  kinds: string[];
};

export const PRINT_FORMS: PrintFormOption[] = [
  { id: 'simple', label: 'Краткая форма Метрики', hint: 'Компактный лист для внутреннего пользования', kinds: [] },
  { id: 'gost-act', label: 'Требование-накладная М-11', hint: 'ОКУД 0315006 · акт / требование со склада', kinds: ['writeoff', 'surplus', 'regrade', 'disassemble', 'assemble', 'revision', 'movement', 'transfer'] },
  { id: 'gost-waybill', label: 'Накладная М-15', hint: 'ОКУД 0315007 · отпуск / внутреннее перемещение', kinds: ['writeoff', 'surplus', 'regrade', 'disassemble', 'assemble', 'po', 'movement', 'transfer'] },
  { id: 'gost-order', label: 'Заказ / задание', hint: 'Заказ поставщику или заказ-наряд', kinds: ['po', 'project'] },
  { id: 'gost-inventory', label: 'Опись ИНВ-3', hint: 'ОКУД 0317003 · учёт / факт / отклонение', kinds: ['revision'] },
];

export function formsForKind(kind: string): PrintFormOption[] {
  return PRINT_FORMS.filter((f) => !f.kinds.length || f.kinds.includes(kind));
}

export function defaultFormForKind(kind: string): PrintFormId {
  if (kind === 'revision') return 'gost-inventory';
  if (kind === 'po' || kind === 'project') return 'gost-order';
  if (kind === 'transfer' || kind === 'movement') return 'gost-waybill';
  if (['writeoff', 'surplus', 'regrade', 'disassemble', 'assemble'].includes(kind)) return 'gost-act';
  return 'simple';
}

export function escHtml(value: any): string {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char] || char));
}

let printCurrencySymbol = '₽';


export function setPrintCurrencySymbol(symbol: string | null | undefined) {
  const next = String(symbol || '').trim();
  printCurrencySymbol = next || '₽';
}

export function getPrintCurrencySymbol() {
  return printCurrencySymbol;
}

export function parsePrintNumber(value: string | number | null | undefined): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value == null || value === '' || value === '—') return null;
  let raw = String(value)
    .replace(/[\u00a0\u202f\u2009\u2007]/g, '')
    .replace(/\s/g, '')
    .replace(/₽|\$|€|₸|Br|руб\.?/gi, '')
    .trim();
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(raw)) {
    raw = raw.replace(/\./g, '').replace(',', '.');
  } else if (raw.includes(',') && !raw.includes('.')) {
    raw = raw.replace(',', '.');
  } else if (raw.includes(',') && raw.includes('.')) {
    raw = raw.replace(/,/g, '');
  }
  const cleaned = raw.replace(/[^\d.\-]/g, '');
  if (!cleaned || cleaned === '-' || cleaned === '.') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function formatPrintTotal(n: number, asMoney = false): string {
  const formatted = n.toLocaleString('ru-RU', {
    maximumFractionDigits: asMoney || Math.abs(n % 1) > 1e-9 ? 2 : 0,
    minimumFractionDigits: asMoney ? 2 : 0,
  });
  return asMoney ? `${formatted} ${printCurrencySymbol}` : formatted;
}

export function lineAmount(row: Record<string, string | number>): number | null {
  const direct = parsePrintNumber(row.sum);
  if (direct != null) return direct;
  const price = parsePrintNumber(row.price);
  if (price == null) return null;
  const qty = parsePrintNumber(row.qty ?? row.on_hand ?? row.available ?? row.fact ?? row.req ?? row.book);
  if (qty == null) return price;
  return price * qty;
}

export function enrichPrintRows(
  rows: Array<Record<string, string | number>>,
  cols: Array<{ key: string; enabled?: boolean }>,
): Array<Record<string, string | number>> {
  const wantSum = cols.some((c) => c.key === 'sum' && c.enabled !== false);
  const wantPrice = cols.some((c) => c.key === 'price' && c.enabled !== false);
  if (!wantSum && !wantPrice) return rows;
  return rows.map((row) => {
    const next: Record<string, string | number> = { ...row };
    const price = parsePrintNumber(row.price);
    const qty = parsePrintNumber(row.qty ?? row.on_hand ?? row.available ?? row.fact);
    let sum = parsePrintNumber(row.sum);
    if (sum == null && price != null && qty != null) sum = price * qty;
    if (wantSum && sum != null && (row.sum == null || row.sum === '' || row.sum === '—' || typeof row.sum === 'number')) {
      next.sum = formatPrintTotal(sum, true);
    }
    if (wantPrice && price != null && (row.price == null || row.price === '' || row.price === '—' || typeof row.price === 'number')) {
      next.price = formatPrintTotal(price, true);
    }
    return next;
  });
}

export const GOST_PRINT_CSS = `
@page { size: A4; margin: 12mm 10mm; }
body { font-family: "Times New Roman", Times, serif; color: #000; font-size: 11pt; margin: 0; padding: 0; }
.gost-page { max-width: 190mm; margin: 0 auto; }
.gost-okud { font-size: 8pt; text-align: right; margin-bottom: 4pt; color: #333; }
.gost-title { text-align: center; font-size: 14pt; font-weight: 700; margin: 8pt 0 4pt; text-transform: uppercase; }
.gost-subtitle { text-align: center; font-size: 11pt; margin: 0 0 10pt; }
.gost-org { font-size: 10pt; line-height: 1.35; margin-bottom: 8pt; border-bottom: 1.5pt solid #000; padding-bottom: 6pt; }
.gost-org b { font-size: 11pt; }
.gost-meta { width: 100%; border-collapse: collapse; margin: 8pt 0 10pt; font-size: 10pt; }
.gost-meta td { border: 1pt solid #000; padding: 3pt 6pt; vertical-align: top; }
.gost-meta .lbl { width: 28%; background: #f3f3f3; font-weight: 600; }
.gost-table { width: 100%; border-collapse: collapse; margin-top: 6pt; font-size: 9.5pt; }
.gost-table th, .gost-table td { border: 1pt solid #000; padding: 3pt 4pt; }
.gost-table th { background: #eee; text-align: center; font-weight: 700; }
.gost-table .num { text-align: right; white-space: nowrap; }
.gost-table .center { text-align: center; }
.gost-table tfoot td { font-weight: 700; background: #f0f0f0; }
.gost-table tr.gost-total td { border-top: 1.5pt solid #000; }
.gost-totals-bar {
  margin-top: 6pt; padding: 4pt 6pt; border: 1pt solid #000; background: #f7f7f7;
  font-size: 10pt; display: flex; flex-wrap: wrap; gap: 10pt 18pt;
}
.gost-totals-bar b { font-weight: 700; }
.gost-note { margin-top: 8pt; font-size: 10pt; }
.simple-body table tfoot td { font-weight: 700; background: #eee; }
.simple-body .gost-totals-bar { font-family: "Segoe UI", Arial, sans-serif; }
.gost-signs { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 14pt; margin-top: 22pt; font-size: 10pt; }
.gost-sign { border-top: 1pt solid #000; padding-top: 4pt; min-height: 48pt; }
.gost-sign small { display: block; color: #444; margin-top: 2pt; }
.gost-footer { margin-top: 16pt; font-size: 8pt; color: #444; display: flex; justify-content: space-between; border-top: 0.5pt solid #999; padding-top: 4pt; }
.simple-letterhead { display: flex; justify-content: space-between; gap: 16px; border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 14px; font-family: "Segoe UI", Arial, sans-serif; }
.simple-letterhead .brand { font-size: 18px; font-weight: 700; }
.simple-letterhead .meta { font-size: 11px; color: #444; text-align: right; line-height: 1.45; }
.simple-body { font-family: "Segoe UI", Arial, sans-serif; }
.simple-body h1 { font-size: 20px; margin: 0 0 6px; }
.simple-body .meta { color: #555; font-size: 12px; line-height: 1.55; margin-bottom: 12px; }
.simple-body table { width: 100%; border-collapse: collapse; margin-top: 8px; }
.simple-body th, .simple-body td { border: 1px solid #bbb; padding: 6px 8px; text-align: left; font-size: 12px; }
.simple-body th { background: #f2f2f2; }
`;

export type OrgPrintInfo = {
  name?: string;
  legal_name?: string;
  inn?: string;
  kpp?: string;
  address?: string;
  legal_address?: string;
  phone?: string;
  email?: string;
  code?: string;
};

export function orgBlockHtml(org: OrgPrintInfo): string {
  const lines = [
    org.legal_name || org.name || 'Организация',
    org.inn ? `ИНН ${org.inn}${org.kpp ? ` / КПП ${org.kpp}` : ''}` : '',
    org.address || org.legal_address || '',
    [org.phone, org.email].filter(Boolean).join(' · '),
  ].filter(Boolean);
  return `<div class="gost-org"><b>${escHtml(lines[0])}</b>${lines.slice(1).map((l) => `<div>${escHtml(l)}</div>`).join('')}</div>`;
}

export function simpleLetterheadHtml(org: OrgPrintInfo): string {
  const lines = [
    org.legal_name || org.name,
    org.inn ? `ИНН ${org.inn}${org.kpp ? ` · КПП ${org.kpp}` : ''}` : '',
    org.address || org.legal_address || '',
    [org.phone, org.email].filter(Boolean).join(' · '),
  ].filter(Boolean);
  return `<div class="simple-letterhead">
    <div class="brand">${escHtml(org.name || 'Метрика')}</div>
    <div class="meta">${lines.map((l) => `<div>${escHtml(l)}</div>`).join('')}</div>
  </div>`;
}

export type PrintColumn = { key: string; title: string; align?: 'left' | 'right' | 'center'; width?: string };
export type PrintDocModel = {
  title: string;
  subtitle?: string;
  okud?: string;
  formCode?: string;
  meta: Array<{ label: string; value: string }>;
  columns: PrintColumn[];
  rows: Array<Record<string, string | number>>;
  note?: string;
  signs?: Array<{ role: string; hint?: string }>;
  generatedAt: string;
};

function cellClass(align?: string) {
  if (align === 'right') return 'num';
  if (align === 'center') return 'center';
  return '';
}

export function renderPrintDocument(org: OrgPrintInfo, form: PrintFormId, model: PrintDocModel): string {
  const cols = model.columns || [];
  const printRows = enrichPrintRows(model.rows, cols);
  const sumKeys = new Set(['qty', 'on_hand', 'reserved', 'available', 'book', 'fact', 'min_stock', 'req', 'per', 'diff']);
  const sums = new Map<string, number>();
  for (const col of cols) {
    if (!sumKeys.has(col.key)) continue;
    let total = 0;
    let any = false;
    for (const row of printRows) {
      const n = parsePrintNumber(row[col.key]);
      if (n == null) continue;
      total += n;
      any = true;
    }
    if (any) sums.set(col.key, total);
  }
  let moneyTotal = 0;
  let moneyLines = 0;
  for (const row of printRows) {
    const amount = lineAmount(row);
    if (amount == null) continue;
    moneyTotal += amount;
    moneyLines += 1;
  }
  if (moneyLines > 0) sums.set('sum', moneyTotal);

  const fmt = (n: number, money = false) => formatPrintTotal(n, money);
  const hasSumCol = cols.some((c) => c.key === 'sum');
  const totalsBar = (sums.size || moneyLines)
    ? `<div class="gost-totals-bar"><span>Позиций: <b>${printRows.length}</b></span>${
      sums.has('qty') ? `<span>Количество: <b>${escHtml(fmt(sums.get('qty')!))}</b></span>` : ''
    }${sums.has('sum') ? `<span>Сумма: <b>${escHtml(fmt(sums.get('sum')!, true))}</b></span>` : ''}${
      moneyLines > 0 && moneyLines < printRows.length ? `<span>с ценой: <b>${moneyLines}</b> из ${printRows.length}</span>` : ''
    }</div>`
    : '';
  const cellForTotal = (c: PrintColumn, index: number, withLabel: boolean) => {
    if (c.key === 'sum' && sums.has('sum')) {
      return `<td class="${cellClass(c.align)}"><b>${escHtml(fmt(sums.get('sum')!, true))}</b></td>`;
    }
    if (c.key === 'price') {
      if (sums.has('sum') && !hasSumCol) return `<td class="num"><b>${escHtml(fmt(sums.get('sum')!, true))}</b></td>`;
      return withLabel && index === 0 ? '<td><b>Итого</b></td>' : '<td></td>';
    }
    if (sums.has(c.key)) return `<td class="${cellClass(c.align)}"><b>${escHtml(fmt(sums.get(c.key)!))}</b></td>`;
    return withLabel && index === 0 ? '<td><b>Итого</b></td>' : '<td></td>';
  };
  const footSimple = sums.size
    ? `<tfoot><tr class="gost-total">${cols.map((c, i) => cellForTotal(c, i, true)).join('')}</tr></tfoot>`
    : '';
  const footGost = sums.size
    ? `<tfoot><tr class="gost-total"><td class="center"><b>Итого</b></td>${cols.map((c, i) => cellForTotal(c, i, false)).join('')}</tr></tfoot>`
    : '';

  if (form === 'simple') {
    return `<!doctype html><html><head><meta charset="utf-8"><style>${GOST_PRINT_CSS}</style></head>
<body class="simple-body"><div class="gost-page">
${simpleLetterheadHtml(org)}
<h1>${escHtml(model.title)}</h1>
${model.subtitle ? `<div class="meta">${escHtml(model.subtitle)}</div>` : ''}
<div class="meta">${model.meta.map((m) => `${escHtml(m.label)}: <b>${escHtml(m.value)}</b>`).join('<br>')}<br>Сформировано: ${escHtml(model.generatedAt)}</div>
<table><thead><tr>${model.columns.map((c) => `<th>${escHtml(c.title)}</th>`).join('')}</tr></thead>
<tbody>${printRows.map((row) => `<tr>${model.columns.map((c) => `<td class="${cellClass(c.align)}">${escHtml(row[c.key] ?? '—')}</td>`).join('')}</tr>`).join('')}</tbody>
${footSimple}</table>
${totalsBar}
${model.note ? `<p>${escHtml(model.note)}</p>` : ''}
<div class="gost-footer"><span>${escHtml(model.note || '')}</span><span>Метрика</span></div>
</div></body></html>`;
  }

  const signs = model.signs?.length
    ? model.signs
    : [
      { role: 'Руководитель', hint: 'подпись / ФИО' },
      { role: 'Ответственный', hint: 'подпись / ФИО' },
      { role: 'Кладовщик', hint: 'подпись / ФИО' },
    ];

  return `<!doctype html><html><head><meta charset="utf-8"><style>${GOST_PRINT_CSS}</style></head>
<body><div class="gost-page">
${model.okud || model.formCode ? `<div class="gost-okud">${model.okud ? `ОКУД ${escHtml(model.okud)}` : ''}${model.formCode ? ` · Форма ${escHtml(model.formCode)}` : ''}</div>` : ''}
${orgBlockHtml(org)}
<div class="gost-title">${escHtml(model.title)}</div>
${model.subtitle ? `<div class="gost-subtitle">${escHtml(model.subtitle)}</div>` : ''}
<table class="gost-meta"><tbody>
${model.meta.map((m) => `<tr><td class="lbl">${escHtml(m.label)}</td><td>${escHtml(m.value || '—')}</td></tr>`).join('')}
<tr><td class="lbl">Дата формирования</td><td>${escHtml(model.generatedAt)}</td></tr>
</tbody></table>
<table class="gost-table"><thead><tr>
<th style="width:8mm">№</th>
${model.columns.map((c) => `<th style="${c.width ? `width:${c.width}` : ''}">${escHtml(c.title)}</th>`).join('')}
</tr></thead>
<tbody>${printRows.map((row, idx) => `<tr><td class="center">${idx + 1}</td>${model.columns.map((c) => `<td class="${cellClass(c.align)}">${escHtml(row[c.key] ?? '—')}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${model.columns.length + 1}" class="center">Нет строк</td></tr>`}</tbody>
${footGost}</table>
${totalsBar}
${model.note ? `<div class="gost-note"><b>Примечание:</b> ${escHtml(model.note)}</div>` : ''}
<div class="gost-signs">${signs.map((s) => `<div class="gost-sign"><b>${escHtml(s.role)}</b><small>${escHtml(s.hint || 'подпись')}</small></div>`).join('')}</div>
<div class="gost-footer"><span>Документ сформирован в системе «Метрика»</span><span>Лист 1</span></div>
</div></body></html>`;
}
