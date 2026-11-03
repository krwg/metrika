



import {
  GOST_PRINT_CSS,
  PrintDocModel,
  PrintFormId,
  OrgPrintInfo,
  escHtml,
  orgBlockHtml,
  simpleLetterheadHtml,
  enrichPrintRows,
  formatPrintTotal,
  lineAmount,
  parsePrintNumber,
} from './printForms';

export type PrintColumnDef = {
  key: string;
  title: string;
  align?: 'left' | 'right' | 'center';
  width?: string;
  enabled?: boolean;
};

export type PrintSignDef = { role: string; hint?: string };

export type PrintTemplate = {
  id: string;
  name: string;
  hint?: string;
  
  group?: 'gost' | 'metrika' | 'stock';
  
  kinds: string[];
  
  style: PrintFormId | 'gost-stock';
  formCode?: string;
  okud?: string;
  titleOverride?: string;
  landscape?: boolean;
  
  paper?: 'A4' | 'A5';
  showOrg?: boolean;
  showRowNumbers?: boolean;
  
  showTotals?: boolean;
  columns: PrintColumnDef[];
  signs: PrintSignDef[];
  customCss?: string;
  footerNote?: string;
  isSystem?: boolean;
  updatedAt?: string;
};


const TOTAL_COLUMN_KEYS = new Set([
  'qty', 'on_hand', 'reserved', 'available', 'book', 'fact', 'min_stock', 'req', 'per', 'diff',
]);

export { parsePrintNumber, formatPrintTotal, lineAmount, enrichPrintRows };

export function shouldShowTotals(template: PrintTemplate): boolean {
  if (template.showTotals === false) return false;
  if (template.showTotals === true) return true;
  const cols = (template.columns || []).filter((c) => c.enabled !== false);
  return cols.some((c) => c.key === 'sum' || c.key === 'price' || c.key === 'qty');
}

export function buildTotalsFooter(
  template: PrintTemplate,
  cols: PrintColumnDef[],
  rows: Array<Record<string, string | number>>,
  opts?: { withRowNumbers?: boolean },
): { footRowHtml: string; barHtml: string } | null {
  if (!shouldShowTotals(template) || !rows.length) return null;
  const wantMoney = cols.some((c) => (c.key === 'sum' || c.key === 'price') && c.enabled !== false)
    || template.showTotals === true;

  const sums = new Map<string, number>();
  for (const col of cols) {
    if (!TOTAL_COLUMN_KEYS.has(col.key)) continue;
    let total = 0;
    let any = false;
    for (const row of rows) {
      const n = parsePrintNumber(row[col.key]);
      if (n == null) continue;
      total += n;
      any = true;
    }
    if (any) sums.set(col.key, total);
  }

  let moneyTotal = 0;
  let moneyLines = 0;
  for (const row of rows) {
    const amount = lineAmount(row);
    if (amount == null) continue;
    moneyTotal += amount;
    moneyLines += 1;
  }
  if (moneyLines > 0) sums.set('sum', moneyTotal);

  if (!sums.size) return null;

  const showNumbers = opts?.withRowNumbers !== false && template.showRowNumbers !== false;
  let labelPlaced = false;
  const cells: string[] = [];
  if (showNumbers) {
    cells.push('<td class="center"><b>Итого</b></td>');
    labelPlaced = true;
  }
  const hasSumCol = cols.some((x) => x.key === 'sum' && x.enabled !== false);
  for (const c of cols) {
    const align = c.align === 'right' ? 'num' : c.align === 'center' ? 'center' : '';
    if (c.key === 'sum' && sums.has('sum')) {
      cells.push(`<td class="${align}"><b>${escHtml(formatPrintTotal(sums.get('sum')!, true))}</b></td>`);
      continue;
    }
    if (c.key === 'price') {
      if (!labelPlaced) {
        cells.push('<td><b>Итого</b></td>');
        labelPlaced = true;
      } else if (sums.has('sum') && !hasSumCol) {
        cells.push(`<td class="num"><b>${escHtml(formatPrintTotal(sums.get('sum')!, true))}</b></td>`);
      } else {
        cells.push('<td></td>');
      }
      continue;
    }
    if (sums.has(c.key)) {
      cells.push(`<td class="${align}"><b>${escHtml(formatPrintTotal(sums.get(c.key)!, false))}</b></td>`);
      continue;
    }
    if (!labelPlaced) {
      cells.push('<td><b>Итого</b></td>');
      labelPlaced = true;
    } else {
      cells.push('<td></td>');
    }
  }

  const parts: string[] = [`<span>Позиций: <b>${rows.length}</b></span>`];
  if (sums.has('qty')) parts.push(`<span>Количество: <b>${escHtml(formatPrintTotal(sums.get('qty')!))}</b></span>`);
  if (sums.has('sum') || (wantMoney && moneyLines > 0)) {
    parts.push(`<span>Сумма: <b>${escHtml(formatPrintTotal(sums.get('sum') || moneyTotal, true))}</b></span>`);
    if (moneyLines > 0 && moneyLines < rows.length) {
      parts.push(`<span>с ценой: <b>${moneyLines}</b> из ${rows.length}</span>`);
    }
  }
  if (sums.has('on_hand')) parts.push(`<span>Физич.: <b>${escHtml(formatPrintTotal(sums.get('on_hand')!))}</b></span>`);
  if (sums.has('available')) parts.push(`<span>Доступно: <b>${escHtml(formatPrintTotal(sums.get('available')!))}</b></span>`);
  return {
    footRowHtml: `<tr class="gost-total">${cells.join('')}</tr>`,
    barHtml: `<div class="gost-totals-bar">${parts.join('')}</div>`,
  };
}

const COLS = {
  nameSkuUnitQty: [
    { key: 'name', title: 'Наименование', enabled: true },
    { key: 'sku', title: 'Артикул', enabled: true },
    { key: 'unit', title: 'Ед.', align: 'center' as const, enabled: true },
    { key: 'okei', title: 'ОКЕИ', align: 'center' as const, enabled: true },
    { key: 'qty', title: 'Количество', align: 'right' as const, enabled: true },
    { key: 'price', title: 'Цена', align: 'right' as const, enabled: true },
    { key: 'sum', title: 'Сумма', align: 'right' as const, enabled: true },
  ],
  nameSkuUnitQtyPrice: [
    { key: 'name', title: 'Наименование', enabled: true },
    { key: 'sku', title: 'Артикул', enabled: true },
    { key: 'unit', title: 'Ед.', align: 'center' as const, enabled: true },
    { key: 'qty', title: 'Кол-во', align: 'right' as const, enabled: true },
    { key: 'price', title: 'Цена', align: 'right' as const, enabled: true },
    { key: 'sum', title: 'Сумма', align: 'right' as const, enabled: true },
  ],
  inventory: [
    { key: 'name', title: 'Наименование', enabled: true },
    { key: 'sku', title: 'Номенклатурный №', enabled: true },
    { key: 'unit', title: 'Ед.', align: 'center' as const, enabled: true },
    { key: 'okei', title: 'ОКЕИ', align: 'center' as const, enabled: true },
    { key: 'book', title: 'По учёту', align: 'right' as const, enabled: true },
    { key: 'fact', title: 'Фактически', align: 'right' as const, enabled: true },
    { key: 'diff', title: 'Отклонение', align: 'right' as const, enabled: true },
  ],
  brief: [
    { key: 'name', title: 'Наименование', enabled: true },
    { key: 'sku', title: 'Артикул', enabled: true },
    { key: 'unit', title: 'Ед.', align: 'center' as const, enabled: true },
    { key: 'qty', title: 'Кол-во', align: 'right' as const, enabled: true },
    { key: 'price', title: 'Цена', align: 'right' as const, enabled: true },
    { key: 'sum', title: 'Сумма', align: 'right' as const, enabled: true },
  ],
  transfer: [
    { key: 'name', title: 'Наименование', enabled: true },
    { key: 'sku', title: 'Артикул', enabled: true },
    { key: 'unit', title: 'Ед.', align: 'center' as const, enabled: true },
    { key: 'qty', title: 'Кол-во', align: 'right' as const, enabled: true },
    { key: 'price', title: 'Цена', align: 'right' as const, enabled: true },
    { key: 'sum', title: 'Сумма', align: 'right' as const, enabled: true },
    { key: 'from', title: 'Откуда', enabled: true },
    { key: 'to', title: 'Куда', enabled: true },
  ],
};

const STOCK_COLUMNS: PrintColumnDef[] = [
  { key: 'sku', title: 'Артикул', enabled: true, width: '18mm' },
  { key: 'name', title: 'Наименование', enabled: true },
  { key: 'print_name', title: 'Для печати', enabled: false },
  { key: 'barcode', title: 'Штрихкод', enabled: false, width: '22mm' },
  { key: 'category', title: 'Категория', enabled: false, width: '20mm' },
  { key: 'unit', title: 'Ед.', align: 'center', enabled: true, width: '10mm' },
  { key: 'okei', title: 'ОКЕИ', align: 'center', enabled: true, width: '12mm' },
  { key: 'on_hand', title: 'Физич.', align: 'right', enabled: true, width: '14mm' },
  { key: 'reserved', title: 'Резерв', align: 'right', enabled: true, width: '14mm' },
  { key: 'available', title: 'Доступно', align: 'right', enabled: true, width: '14mm' },
  { key: 'min_stock', title: 'Мин.', align: 'right', enabled: true, width: '12mm' },
  { key: 'price', title: 'Цена', align: 'right', enabled: true, width: '16mm' },
  { key: 'sum', title: 'Сумма', align: 'right', enabled: true, width: '18mm' },
  { key: 'locations', title: 'Размещение', enabled: true, width: '36mm' },
];

const STOCK_COLUMNS_COMPACT: PrintColumnDef[] = [
  { key: 'sku', title: 'Артикул', enabled: true, width: '22mm' },
  { key: 'name', title: 'Наименование', enabled: true },
  { key: 'unit', title: 'Ед.', align: 'center', enabled: true, width: '12mm' },
  { key: 'on_hand', title: 'Остаток', align: 'right', enabled: true, width: '16mm' },
  { key: 'available', title: 'Доступно', align: 'right', enabled: true, width: '16mm' },
  { key: 'locations', title: 'Ячейки', enabled: true, width: '40mm' },
];

const STOCK_COLUMNS_CELLS: PrintColumnDef[] = [
  { key: 'locations', title: 'Ячейка', enabled: true, width: '28mm' },
  { key: 'sku', title: 'Артикул', enabled: true, width: '20mm' },
  { key: 'name', title: 'Наименование', enabled: true },
  { key: 'unit', title: 'Ед.', align: 'center', enabled: true, width: '10mm' },
  { key: 'on_hand', title: 'Кол-во', align: 'right', enabled: true, width: '14mm' },
];

const ACT_KINDS = ['writeoff', 'surplus', 'regrade', 'disassemble', 'assemble', 'revision', 'movement', 'transfer'];
const MOVE_KINDS = ['writeoff', 'surplus', 'regrade', 'disassemble', 'assemble', 'po', 'movement', 'transfer'];

export const SYSTEM_PRINT_TEMPLATES: PrintTemplate[] = [

  {
    id: 'sys-m11',
    name: 'Требование-накладная М-11',
    hint: 'ОКУД 0315006 · выдача со склада / внутреннее перемещение',
    group: 'gost',
    kinds: ACT_KINDS,
    style: 'gost-act',
    formCode: 'М-11',
    okud: '0315006',
    showOrg: true,
    showRowNumbers: true,
    showTotals: true,
    columns: COLS.nameSkuUnitQty,
    signs: [
      { role: 'Отпустил', hint: 'подпись / ФИО' },
      { role: 'Получил', hint: 'подпись / ФИО' },
      { role: 'Бухгалтер', hint: 'подпись / ФИО' },
    ],
    isSystem: true,
  },
  {
    id: 'sys-m15',
    name: 'Накладная М-15',
    hint: 'ОКУД 0315007 · отпуск материалов на сторону / перемещение',
    group: 'gost',
    kinds: MOVE_KINDS,
    style: 'gost-waybill',
    formCode: 'М-15',
    okud: '0315007',
    showOrg: true,
    showRowNumbers: true,
    showTotals: true,
    columns: COLS.nameSkuUnitQty,
    signs: [
      { role: 'Отпустил', hint: 'подпись / ФИО' },
      { role: 'Получил', hint: 'подпись / ФИО' },
      { role: 'МОЛ', hint: 'подпись / ФИО' },
    ],
    isSystem: true,
  },
  {
    id: 'sys-m4',
    name: 'Приходный ордер М-4',
    hint: 'ОКУД 0315003 · приём ТМЦ на склад',
    group: 'gost',
    kinds: ['po', 'surplus', 'assemble'],
    style: 'gost-waybill',
    formCode: 'М-4',
    okud: '0315003',
    titleOverride: 'Приходный ордер',
    showOrg: true,
    showRowNumbers: true,
    columns: COLS.nameSkuUnitQtyPrice,
    showTotals: true,
    signs: [
      { role: 'Принял', hint: 'подпись / ФИО' },
      { role: 'Сдал', hint: 'подпись / ФИО' },
      { role: 'Бухгалтер', hint: 'подпись / ФИО' },
    ],
    isSystem: true,
  },
  {
    id: 'sys-m8',
    name: 'Лимитно-заборная карта М-8',
    hint: 'ОКУД 0315009 · отпуск по лимиту',
    group: 'gost',
    kinds: ['writeoff', 'project', 'movement'],
    style: 'gost-act',
    formCode: 'М-8',
    okud: '0315009',
    titleOverride: 'Лимитно-заборная карта',
    showOrg: true,
    showRowNumbers: true,
    columns: [
      { key: 'name', title: 'Наименование', enabled: true },
      { key: 'sku', title: 'Номенклатурный №', enabled: true },
      { key: 'unit', title: 'Ед.', align: 'center', enabled: true },
      { key: 'qty', title: 'Лимит', align: 'right', enabled: true },
      { key: 'fact', title: 'Отпущено', align: 'right', enabled: false },
    ],
    signs: [
      { role: 'Руководитель подразделения', hint: 'подпись / ФИО' },
      { role: 'Кладовщик', hint: 'подпись / ФИО' },
    ],
    isSystem: true,
  },
  {
    id: 'sys-inv3',
    name: 'Инвентаризационная опись ИНВ-3',
    hint: 'ОКУД 0317003 · учёт / факт / отклонение',
    group: 'gost',
    kinds: ['revision'],
    style: 'gost-inventory',
    formCode: 'ИНВ-3',
    okud: '0317003',
    showOrg: true,
    showRowNumbers: true,
    columns: COLS.inventory,
    signs: [
      { role: 'Председатель комиссии', hint: 'подпись / ФИО' },
      { role: 'Член комиссии', hint: 'подпись / ФИО' },
      { role: 'МОЛ / кладовщик', hint: 'подпись / ФИО' },
    ],
    isSystem: true,
  },
  {
    id: 'sys-inv19',
    name: 'Сличительная ведомость ИНВ-19',
    hint: 'ОКУД 0317017 · результаты инвентаризации',
    group: 'gost',
    kinds: ['revision'],
    style: 'gost-inventory',
    formCode: 'ИНВ-19',
    okud: '0317017',
    titleOverride: 'Сличительная ведомость результатов инвентаризации ТМЦ',
    showOrg: true,
    showRowNumbers: true,
    columns: COLS.inventory,
    signs: [
      { role: 'Бухгалтер', hint: 'подпись / ФИО' },
      { role: 'МОЛ', hint: 'подпись / ФИО' },
    ],
    isSystem: true,
  },
  {
    id: 'sys-mx1',
    name: 'Акт о приёме-передаче МХ-1',
    hint: 'ОКУД 0335001 · передача на ответственное хранение',
    group: 'gost',
    kinds: ['transfer', 'movement', 'po'],
    style: 'gost-waybill',
    formCode: 'МХ-1',
    okud: '0335001',
    titleOverride: 'Акт о приёме-передаче товарно-материальных ценностей на хранение',
    showOrg: true,
    showRowNumbers: true,
    columns: COLS.nameSkuUnitQty,
    signs: [
      { role: 'Сдал', hint: 'подпись / ФИО' },
      { role: 'Принял на хранение', hint: 'подпись / ФИО' },
    ],
    isSystem: true,
  },
  {
    id: 'sys-mx3',
    name: 'Акт о возврате МХ-3',
    hint: 'ОКУД 0335003 · возврат с ответственного хранения',
    group: 'gost',
    kinds: ['transfer', 'movement', 'writeoff'],
    style: 'gost-act',
    formCode: 'МХ-3',
    okud: '0335003',
    titleOverride: 'Акт о возврате товарно-материальных ценностей, сданных на хранение',
    showOrg: true,
    showRowNumbers: true,
    columns: COLS.nameSkuUnitQty,
    signs: [
      { role: 'Вернул', hint: 'подпись / ФИО' },
      { role: 'Принял', hint: 'подпись / ФИО' },
    ],
    isSystem: true,
  },
  {
    id: 'sys-torg13',
    name: 'Накладная на внутреннее перемещение ТОРГ-13',
    hint: 'ОКУД 0330213 · между складами / ячейками',
    group: 'gost',
    kinds: ['transfer', 'movement'],
    style: 'gost-waybill',
    formCode: 'ТОРГ-13',
    okud: '0330213',
    titleOverride: 'Накладная на внутреннее перемещение',
    showOrg: true,
    showRowNumbers: true,
    columns: COLS.transfer,
    signs: [
      { role: 'Отпустил', hint: 'подпись / ФИО' },
      { role: 'Получил', hint: 'подпись / ФИО' },
    ],
    isSystem: true,
  },
  {
    id: 'sys-order',
    name: 'Заказ / заказ-наряд',
    hint: 'Заказ поставщику или производственное задание',
    group: 'gost',
    kinds: ['po', 'project'],
    style: 'gost-order',
    formCode: 'ЗП-1',
    showOrg: true,
    showRowNumbers: true,
    columns: [
      { key: 'name', title: 'Товар / компонент', enabled: true },
      { key: 'sku', title: 'Артикул', enabled: true },
      { key: 'unit', title: 'Ед.', align: 'center', enabled: true },
      { key: 'qty', title: 'Кол-во', align: 'right', enabled: true },
    ],
    signs: [
      { role: 'Руководитель', hint: 'подпись / ФИО' },
      { role: 'Ответственный', hint: 'подпись / ФИО' },
    ],
    isSystem: true,
  },


  {
    id: 'sys-stock',
    name: 'Ведомость остатков ВО-1',
    hint: 'Альбомная · артикул, остатки, цена, сумма, размещение',
    group: 'stock',
    kinds: ['stock'],
    style: 'gost-stock',
    formCode: 'ВО-1',
    landscape: true,
    showOrg: true,
    showRowNumbers: true,
    showTotals: true,
    columns: STOCK_COLUMNS,
    signs: [
      { role: 'Составил', hint: 'подпись / ФИО' },
      { role: 'Проверил', hint: 'подпись / ФИО' },
      { role: 'Кладовщик', hint: 'подпись / ФИО' },
    ],
    isSystem: true,
  },
  {
    id: 'sys-stock-compact',
    name: 'Остатки (краткая)',
    hint: 'Компактная таблица · меньше колонок',
    group: 'stock',
    kinds: ['stock'],
    style: 'gost-stock',
    formCode: 'ВО-2',
    landscape: true,
    showOrg: true,
    showRowNumbers: true,
    columns: STOCK_COLUMNS_COMPACT,
    signs: [
      { role: 'Составил', hint: 'подпись / ФИО' },
      { role: 'Кладовщик', hint: 'подпись / ФИО' },
    ],
    isSystem: true,
  },
  {
    id: 'sys-stock-simple',
    name: 'Остатки — краткая форма Метрики',
    hint: 'Без ГОСТ-рамки · быстрая печать для смены',
    group: 'stock',
    kinds: ['stock'],
    style: 'simple',
    formCode: 'МТ-ОСТ',
    landscape: true,
    showOrg: true,
    showRowNumbers: false,
    columns: STOCK_COLUMNS_COMPACT,
    signs: [],
    isSystem: true,
  },
  {
    id: 'sys-stock-cells',
    name: 'Остатки по ячейкам',
    hint: 'Акцент на размещении · обход склада',
    group: 'stock',
    kinds: ['stock'],
    style: 'gost-stock',
    formCode: 'ВО-Я',
    landscape: true,
    showOrg: true,
    showRowNumbers: true,
    columns: STOCK_COLUMNS_CELLS,
    signs: [{ role: 'Кладовщик', hint: 'подпись / ФИО' }],
    isSystem: true,
  },


  {
    id: 'sys-metrika-brief',
    name: 'Краткая форма Метрики',
    hint: 'Универсальный компактный лист без ОКУД · любой складской документ',
    group: 'metrika',
    kinds: [],
    style: 'simple',
    formCode: 'МТ-КР',
    showOrg: true,
    showRowNumbers: false,
    columns: COLS.brief,
    signs: [{ role: 'Ответственный', hint: 'подпись / ФИО' }],
    footerNote: 'Документ сформирован в Метрике',
    isSystem: true,
  },
  {
    id: 'sys-metrika-writeoff',
    name: 'Акт списания (Метрика)',
    hint: 'Внутренний акт · без бланка Госкомстата',
    group: 'metrika',
    kinds: ['writeoff'],
    style: 'simple',
    formCode: 'МТ-СП',
    titleOverride: 'Акт списания товарно-материальных ценностей',
    showOrg: true,
    showRowNumbers: true,
    columns: COLS.brief,
    signs: [
      { role: 'Инициатор', hint: 'подпись / ФИО' },
      { role: 'Кладовщик', hint: 'подпись / ФИО' },
      { role: 'Руководитель', hint: 'подпись / ФИО' },
    ],
    isSystem: true,
  },
  {
    id: 'sys-metrika-transfer',
    name: 'Перемещение (Метрика)',
    hint: 'Краткая накладная между ячейками',
    group: 'metrika',
    kinds: ['transfer', 'movement'],
    style: 'simple',
    formCode: 'МТ-ПМ',
    titleOverride: 'Накладная на перемещение',
    showOrg: true,
    showRowNumbers: true,
    columns: COLS.transfer,
    signs: [
      { role: 'Отпустил', hint: 'подпись / ФИО' },
      { role: 'Принял', hint: 'подпись / ФИО' },
    ],
    isSystem: true,
  },
  {
    id: 'sys-metrika-surplus',
    name: 'Акт излишков (Метрика)',
    hint: 'Оприходование найденных остатков',
    group: 'metrika',
    kinds: ['surplus'],
    style: 'simple',
    formCode: 'МТ-ИЗ',
    titleOverride: 'Акт оприходования излишков',
    showOrg: true,
    showRowNumbers: true,
    columns: COLS.brief,
    signs: [
      { role: 'Обнаружил', hint: 'подпись / ФИО' },
      { role: 'Кладовщик', hint: 'подпись / ФИО' },
    ],
    isSystem: true,
  },
  {
    id: 'sys-metrika-kit',
    name: 'Комплектация / разукомплектация (Метрика)',
    hint: 'Сборка и разборка наборов',
    group: 'metrika',
    kinds: ['assemble', 'disassemble'],
    style: 'simple',
    formCode: 'МТ-КМ',
    showOrg: true,
    showRowNumbers: true,
    columns: COLS.brief,
    signs: [
      { role: 'Сборщик', hint: 'подпись / ФИО' },
      { role: 'Кладовщик', hint: 'подпись / ФИО' },
    ],
    isSystem: true,
  },
  {
    id: 'sys-metrika-po',
    name: 'Заказ поставщику (Метрика)',
    hint: 'Краткая форма закупки',
    group: 'metrika',
    kinds: ['po'],
    style: 'simple',
    formCode: 'МТ-ЗК',
    titleOverride: 'Заказ поставщику',
    showOrg: true,
    showRowNumbers: true,
    columns: COLS.nameSkuUnitQtyPrice,
    showTotals: true,
    signs: [
      { role: 'Заказал', hint: 'подпись / ФИО' },
      { role: 'Согласовал', hint: 'подпись / ФИО' },
    ],
    isSystem: true,
  },


  {
    id: 'sys-m2',
    name: 'Лимитно-заборная карта М-2',
    hint: 'ОКУД 0315001 · отпуск материалов по лимиту (классическая)',
    group: 'gost',
    kinds: ['writeoff', 'project', 'movement'],
    style: 'gost-act',
    formCode: 'М-2',
    okud: '0315001',
    titleOverride: 'Лимитно-заборная карта',
    showOrg: true,
    showRowNumbers: true,
    columns: [
      { key: 'name', title: 'Наименование', enabled: true },
      { key: 'sku', title: 'Номенклатурный №', enabled: true },
      { key: 'unit', title: 'Ед.', align: 'center', enabled: true },
      { key: 'qty', title: 'Лимит', align: 'right', enabled: true },
      { key: 'fact', title: 'Отпущено', align: 'right', enabled: true },
      { key: 'diff', title: 'Остаток лимита', align: 'right', enabled: false },
    ],
    signs: [
      { role: 'Разрешил', hint: 'подпись / ФИО' },
      { role: 'Отпустил', hint: 'подпись / ФИО' },
      { role: 'Получил', hint: 'подпись / ФИО' },
    ],
    isSystem: true,
  },
  {
    id: 'sys-m2a',
    name: 'Лимитно-заборная карта М-2а',
    hint: 'ОКУД 0315002 · вариант для нескольких складов',
    group: 'gost',
    kinds: ['writeoff', 'project', 'movement'],
    style: 'gost-act',
    formCode: 'М-2а',
    okud: '0315002',
    titleOverride: 'Лимитно-заборная карта',
    showOrg: true,
    showRowNumbers: true,
    columns: COLS.nameSkuUnitQty,
    signs: [
      { role: 'Кладовщик', hint: 'подпись / ФИО' },
      { role: 'Получатель', hint: 'подпись / ФИО' },
    ],
    isSystem: true,
  },
  {
    id: 'sys-m7',
    name: 'Акт о приёмке материалов М-7',
    hint: 'ОКУД 0315004 · расхождения при приёмке',
    group: 'gost',
    kinds: ['po', 'surplus'],
    style: 'gost-waybill',
    formCode: 'М-7',
    okud: '0315004',
    titleOverride: 'Акт о приёмке материалов',
    showOrg: true,
    showRowNumbers: true,
    columns: [
      { key: 'name', title: 'Наименование', enabled: true },
      { key: 'sku', title: 'Артикул', enabled: true },
      { key: 'unit', title: 'Ед.', align: 'center', enabled: true },
      { key: 'qty', title: 'По документам', align: 'right', enabled: true },
      { key: 'fact', title: 'Фактически', align: 'right', enabled: true },
      { key: 'diff', title: 'Отклонение', align: 'right', enabled: true },
    ],
    signs: [
      { role: 'Председатель комиссии', hint: 'подпись / ФИО' },
      { role: 'Член комиссии', hint: 'подпись / ФИО' },
      { role: 'МОЛ', hint: 'подпись / ФИО' },
    ],
    isSystem: true,
  },
  {
    id: 'sys-m17',
    name: 'Карточка учёта материалов М-17',
    hint: 'ОКУД 0315018 · карточка складского учёта',
    group: 'gost',
    kinds: ['stock', 'movement'],
    style: 'gost-stock',
    formCode: 'М-17',
    okud: '0315018',
    titleOverride: 'Карточка учёта материалов',
    landscape: true,
    showOrg: true,
    showRowNumbers: true,
    columns: [
      { key: 'sku', title: 'Номенклатурный №', enabled: true, width: '22mm' },
      { key: 'name', title: 'Наименование', enabled: true },
      { key: 'unit', title: 'Ед.', align: 'center', enabled: true, width: '12mm' },
      { key: 'on_hand', title: 'Остаток', align: 'right', enabled: true, width: '16mm' },
      { key: 'locations', title: 'Место хранения', enabled: true, width: '36mm' },
    ],
    signs: [{ role: 'Кладовщик', hint: 'подпись / ФИО' }],
    isSystem: true,
  },
  {
    id: 'sys-torg1',
    name: 'Акт о приёмке товаров ТОРГ-1',
    hint: 'ОКУД 0330201 · приёмка по количеству и качеству',
    group: 'gost',
    kinds: ['po', 'surplus'],
    style: 'gost-waybill',
    formCode: 'ТОРГ-1',
    okud: '0330201',
    titleOverride: 'Акт о приёмке товаров',
    showOrg: true,
    showRowNumbers: true,
    columns: [
      { key: 'name', title: 'Наименование', enabled: true },
      { key: 'sku', title: 'Артикул', enabled: true },
      { key: 'unit', title: 'Ед.', align: 'center', enabled: true },
      { key: 'qty', title: 'По сопр. док.', align: 'right', enabled: true },
      { key: 'fact', title: 'Фактически', align: 'right', enabled: true },
      { key: 'price', title: 'Цена', align: 'right', enabled: false },
    ],
    signs: [
      { role: 'Председатель комиссии', hint: 'подпись / ФИО' },
      { role: 'Член комиссии', hint: 'подпись / ФИО' },
      { role: 'Представитель поставщика', hint: 'подпись / ФИО' },
    ],
    isSystem: true,
  },
  {
    id: 'sys-torg12',
    name: 'Товарная накладная ТОРГ-12',
    hint: 'ОКУД 0330212 · отпуск / отгрузка товаров',
    group: 'gost',
    kinds: ['po', 'writeoff', 'transfer', 'movement'],
    style: 'gost-waybill',
    formCode: 'ТОРГ-12',
    okud: '0330212',
    titleOverride: 'Товарная накладная',
    landscape: true,
    showOrg: true,
    showRowNumbers: true,
    columns: COLS.nameSkuUnitQtyPrice,
    showTotals: true,
    signs: [
      { role: 'Отпуск разрешил', hint: 'подпись / ФИО' },
      { role: 'Отпустил', hint: 'подпись / ФИО' },
      { role: 'Главный бухгалтер', hint: 'подпись / ФИО' },
      { role: 'Получил грузополучатель', hint: 'подпись / ФИО' },
    ],
    isSystem: true,
  },
  {
    id: 'sys-torg15',
    name: 'Акт о порче, бое, ломе ТОРГ-15',
    hint: 'ОКУД 0330215 · списание по качеству',
    group: 'gost',
    kinds: ['writeoff'],
    style: 'gost-act',
    formCode: 'ТОРГ-15',
    okud: '0330215',
    titleOverride: 'Акт о порче, бое, ломе товарно-материальных ценностей',
    showOrg: true,
    showRowNumbers: true,
    columns: COLS.nameSkuUnitQty,
    signs: [
      { role: 'Председатель комиссии', hint: 'подпись / ФИО' },
      { role: 'Член комиссии', hint: 'подпись / ФИО' },
      { role: 'МОЛ', hint: 'подпись / ФИО' },
    ],
    isSystem: true,
  },
  {
    id: 'sys-torg16',
    name: 'Акт о списании товаров ТОРГ-16',
    hint: 'ОКУД 0330216 · списание товаров',
    group: 'gost',
    kinds: ['writeoff'],
    style: 'gost-act',
    formCode: 'ТОРГ-16',
    okud: '0330216',
    titleOverride: 'Акт о списании товаров',
    showOrg: true,
    showRowNumbers: true,
    columns: COLS.nameSkuUnitQtyPrice,
    showTotals: true,
    signs: [
      { role: 'Председатель комиссии', hint: 'подпись / ФИО' },
      { role: 'Член комиссии', hint: 'подпись / ФИО' },
      { role: 'Бухгалтер', hint: 'подпись / ФИО' },
    ],
    isSystem: true,
  },
  {
    id: 'sys-inv22',
    name: 'Приказ о проведении инвентаризации ИНВ-22',
    hint: 'ОКУД 0317018 · распоряжение на инвентаризацию',
    group: 'gost',
    kinds: ['revision'],
    style: 'gost-order',
    formCode: 'ИНВ-22',
    okud: '0317018',
    titleOverride: 'Приказ (постановление, распоряжение) о проведении инвентаризации',
    showOrg: true,
    showRowNumbers: false,
    columns: [
      { key: 'name', title: 'Содержание / объект', enabled: true },
      { key: 'qty', title: 'Срок', align: 'center', enabled: true },
    ],
    signs: [
      { role: 'Руководитель', hint: 'подпись / ФИО' },
      { role: 'Председатель комиссии', hint: 'подпись / ФИО' },
    ],
    footerNote: 'Состав комиссии и объекты инвентаризации указываются в приказе.',
    isSystem: true,
  },
  {
    id: 'sys-inv5',
    name: 'Инвентаризационная опись ИНВ-5',
    hint: 'ОКУД 0317006 · ТМЦ, принятые на ответственное хранение',
    group: 'gost',
    kinds: ['revision'],
    style: 'gost-inventory',
    formCode: 'ИНВ-5',
    okud: '0317006',
    titleOverride: 'Инвентаризационная опись товарно-материальных ценностей, принятых на ответственное хранение',
    showOrg: true,
    showRowNumbers: true,
    columns: COLS.inventory,
    signs: [
      { role: 'Председатель комиссии', hint: 'подпись / ФИО' },
      { role: 'МОЛ', hint: 'подпись / ФИО' },
    ],
    isSystem: true,
  },
  {
    id: 'sys-mx20',
    name: 'Отчёт о движении ТМЦ на хранении МХ-20',
    hint: 'ОКУД 0335020 · движение по ответственному хранению',
    group: 'gost',
    kinds: ['transfer', 'movement', 'stock'],
    style: 'gost-stock',
    formCode: 'МХ-20',
    okud: '0335020',
    titleOverride: 'Отчёт о движении товарно-материальных ценностей на хранении',
    landscape: true,
    showOrg: true,
    showRowNumbers: true,
    columns: [
      { key: 'sku', title: 'Артикул', enabled: true, width: '18mm' },
      { key: 'name', title: 'Наименование', enabled: true },
      { key: 'unit', title: 'Ед.', align: 'center', enabled: true, width: '10mm' },
      { key: 'on_hand', title: 'Приход', align: 'right', enabled: true, width: '14mm' },
      { key: 'reserved', title: 'Расход', align: 'right', enabled: true, width: '14mm' },
      { key: 'available', title: 'Остаток', align: 'right', enabled: true, width: '14mm' },
    ],
    signs: [
      { role: 'Кладовщик', hint: 'подпись / ФИО' },
      { role: 'Бухгалтер', hint: 'подпись / ФИО' },
    ],
    isSystem: true,
  },
  {
    id: 'sys-mx18',
    name: 'Журнал учёта ТМЦ на хранении МХ-18',
    hint: 'ОКУД 0335018 · журнал поклажедателя',
    group: 'gost',
    kinds: ['stock', 'transfer'],
    style: 'gost-stock',
    formCode: 'МХ-18',
    okud: '0335018',
    titleOverride: 'Журнал учёта товарно-материальных ценностей, сданных на хранение',
    landscape: true,
    showOrg: true,
    showRowNumbers: true,
    columns: STOCK_COLUMNS_COMPACT,
    signs: [{ role: 'Ответственный', hint: 'подпись / ФИО' }],
    isSystem: true,
  },
  {
    id: 'sys-metrika-revision',
    name: 'Ревизия (Метрика)',
    hint: 'Краткая сличительная ведомость без ОКУД',
    group: 'metrika',
    kinds: ['revision'],
    style: 'simple',
    formCode: 'МТ-РВ',
    titleOverride: 'Сличительная ведомость (внутренняя)',
    showOrg: true,
    showRowNumbers: true,
    columns: COLS.inventory,
    signs: [
      { role: 'Проверяющий', hint: 'подпись / ФИО' },
      { role: 'МОЛ', hint: 'подпись / ФИО' },
    ],
    isSystem: true,
  },
  {
    id: 'sys-metrika-regrade',
    name: 'Пересортица (Метрика)',
    hint: 'Внутренний акт замены номенклатуры',
    group: 'metrika',
    kinds: ['regrade'],
    style: 'simple',
    formCode: 'МТ-ПС',
    titleOverride: 'Акт пересортицы',
    showOrg: true,
    showRowNumbers: true,
    columns: COLS.brief,
    signs: [
      { role: 'Инициатор', hint: 'подпись / ФИО' },
      { role: 'Кладовщик', hint: 'подпись / ФИО' },
    ],
    isSystem: true,
  },
  {
    id: 'sys-metrika-project',
    name: 'Заказ-наряд (Метрика)',
    hint: 'Производственное задание · краткая форма',
    group: 'metrika',
    kinds: ['project'],
    style: 'simple',
    formCode: 'МТ-ЗН',
    titleOverride: 'Заказ-наряд',
    showOrg: true,
    showRowNumbers: true,
    columns: COLS.brief,
    signs: [
      { role: 'Мастер', hint: 'подпись / ФИО' },
      { role: 'Исполнитель', hint: 'подпись / ФИО' },
    ],
    isSystem: true,
  },
  {
    id: 'sys-stock-value',
    name: 'Ведомость остатков с ценой',
    hint: 'Альбомная · остатки, цена и сумма · итоги внизу',
    group: 'stock',
    kinds: ['stock'],
    style: 'gost-stock',
    formCode: 'ВО-Ц',
    landscape: true,
    showOrg: true,
    showRowNumbers: true,
    showTotals: true,
    columns: [
      { key: 'sku', title: 'Артикул', enabled: true, width: '16mm' },
      { key: 'name', title: 'Наименование', enabled: true },
      { key: 'unit', title: 'Ед.', align: 'center', enabled: true, width: '10mm' },
      { key: 'on_hand', title: 'Физич.', align: 'right', enabled: true, width: '12mm' },
      { key: 'available', title: 'Доступно', align: 'right', enabled: true, width: '12mm' },
      { key: 'price', title: 'Цена', align: 'right', enabled: true, width: '16mm' },
      { key: 'sum', title: 'Сумма', align: 'right', enabled: true, width: '18mm' },
      { key: 'locations', title: 'Ячейки', enabled: true, width: '28mm' },
    ],
    signs: [
      { role: 'Составил', hint: 'подпись / ФИО' },
      { role: 'Бухгалтер', hint: 'подпись / ФИО' },
    ],
    isSystem: true,
  },
  {
    id: 'sys-stock-min',
    name: 'Ниже минимума',
    hint: 'Позиции к пополнению · краткая Метрика',
    group: 'stock',
    kinds: ['stock'],
    style: 'simple',
    formCode: 'МТ-МИН',
    titleOverride: 'Позиции ниже минимального остатка',
    landscape: true,
    showOrg: true,
    showRowNumbers: true,
    columns: [
      { key: 'sku', title: 'Артикул', enabled: true },
      { key: 'name', title: 'Наименование', enabled: true },
      { key: 'available', title: 'Доступно', align: 'right', enabled: true },
      { key: 'min_stock', title: 'Минимум', align: 'right', enabled: true },
      { key: 'unit', title: 'Ед.', align: 'center', enabled: true },
    ],
    signs: [{ role: 'Снабженец', hint: 'подпись / ФИО' }],
    isSystem: true,
  },
];

export function blankTemplate(partial?: Partial<PrintTemplate>): PrintTemplate {
  return {
    id: `tpl-${Date.now().toString(36)}`,
    name: 'Новая печатная форма',
    hint: 'Пользовательский шаблон',
    group: 'metrika',
    kinds: [],
    style: 'gost-act',
    formCode: 'Ф-1',
    okud: '',
    showOrg: true,
    showRowNumbers: true,
    showTotals: true,
    landscape: false,
    columns: COLS.brief.map((c) => ({ ...c })),
    signs: [
      { role: 'Ответственный', hint: 'подпись / ФИО' },
      { role: 'Кладовщик', hint: 'подпись / ФИО' },
    ],
    isSystem: false,
    updatedAt: new Date().toISOString(),
    ...partial,
  };
}

export function cloneTemplate(src: PrintTemplate): PrintTemplate {
  return {
    ...JSON.parse(JSON.stringify(src)),
    id: `tpl-${Date.now().toString(36)}`,
    name: `${src.name} (копия)`,
    isSystem: false,
    group: src.group || 'metrika',
    updatedAt: new Date().toISOString(),
  };
}

function cellClass(align?: string) {
  if (align === 'right') return 'num';
  if (align === 'center') return 'center';
  return '';
}

export function activeColumns(template: PrintTemplate): PrintColumnDef[] {
  return (template.columns || []).filter((c) => c.enabled !== false);
}


function withMoneyColumns(
  cols: PrintColumnDef[],
  rows: Array<Record<string, string | number>>,
): PrintColumnDef[] {
  const hasMoney = rows.some((r) => parsePrintNumber(r.price) != null || parsePrintNumber(r.sum) != null
    || (typeof r.price === 'number' && Number.isFinite(r.price))
    || (typeof r.sum === 'number' && Number.isFinite(r.sum)));
  if (!hasMoney) return cols;
  let next = cols.map((c) => (
    (c.key === 'price' || c.key === 'sum') ? { ...c, enabled: true } : c
  ));
  const hasPrice = next.some((c) => c.key === 'price' && c.enabled !== false);
  const hasSum = next.some((c) => c.key === 'sum' && c.enabled !== false);
  if (!hasPrice || !hasSum) {
    const idx = next.findIndex((c) => ['locations', 'note', 'pair', 'from', 'to', 'comment'].includes(c.key));
    const at = idx >= 0 ? idx : next.length;
    const extra: PrintColumnDef[] = [];
    if (!hasPrice) extra.push({ key: 'price', title: 'Цена', align: 'right', enabled: true });
    if (!hasSum) extra.push({ key: 'sum', title: 'Сумма', align: 'right', enabled: true });
    next = [...next.slice(0, at), ...extra, ...next.slice(at)];
  }
  return next.filter((c) => c.enabled !== false);
}


export function renderWithTemplate(org: OrgPrintInfo, template: PrintTemplate, model: PrintDocModel): string {
  const cols = activeColumns(template);
  const useCols = withMoneyColumns(
    cols.length
      ? cols
      : model.columns.map((c) => ({ key: c.key, title: c.title, align: c.align, width: c.width, enabled: true })),
    model.rows,
  );
  const printRows = enrichPrintRows(model.rows, useCols);
  const signs = (template.signs?.length ? template.signs : model.signs) || [
    { role: 'Ответственный', hint: 'подпись / ФИО' },
  ];
  const title = template.titleOverride || model.title;
  const formCode = template.formCode || model.formCode;
  const okud = template.okud || model.okud;
  const landscape = Boolean(template.landscape);
  const paper = template.paper === 'A5' ? 'A5' : 'A4';
  const isStock = template.style === 'gost-stock' || (template.kinds || []).includes('stock');
  const css = `${GOST_PRINT_CSS}
@page { size: ${paper} ${landscape ? 'landscape' : 'portrait'}; margin: ${okud ? '8mm 8mm 8mm 15mm' : (landscape ? '8mm' : '10mm')}; }
${okud ? `

.gost-page.okud-precise {
  width: ${landscape ? '297mm' : '210mm'};
  min-height: ${landscape ? '210mm' : '297mm'};
  box-sizing: border-box;
  font-size: 9pt;
}
.gost-page.okud-precise .gost-okud { font-size: 7pt; letter-spacing: 0.02em; }
.gost-page.okud-precise .gost-table {
  table-layout: fixed;
  width: 100%;
  border-collapse: collapse;
  font-size: 8pt;
}
.gost-page.okud-precise .gost-table th,
.gost-page.okud-precise .gost-table td {
  border: 0.3mm solid #000;
  padding: 1.2mm 1.5mm;
  height: 6mm;
  vertical-align: middle;
}
.gost-page.okud-precise .gost-title { font-size: 11pt; text-align: center; margin: 2mm 0; }
.gost-page.okud-precise .gost-meta { font-size: 8pt; line-height: 1.35; }
` : ''}
.gost-page.landscape {
  max-width: none;
  width: 100%;
  box-sizing: border-box;
}
.gost-page.landscape .gost-table {
  table-layout: fixed;
  width: 100%;
  font-size: ${isStock ? '7.5pt' : '9pt'};
}
.gost-page.landscape .gost-table th,
.gost-page.landscape .gost-table td {
  padding: 2pt 3pt;
  overflow-wrap: anywhere;
  word-break: break-word;
  vertical-align: top;
}
.gost-page.landscape .gost-meta { font-size: 9pt; }
.gost-page.landscape .gost-title { font-size: 12pt; margin: 4pt 0; }
.gost-page.landscape .gost-signs { margin-top: 14pt; gap: 10pt; }
.simple-body.landscape { max-width: none; width: 100%; }
.simple-body.landscape table { table-layout: fixed; width: 100%; font-size: 9px; }
.simple-body.landscape th, .simple-body.landscape td { padding: 4px 5px; overflow-wrap: anywhere; }
${template.customCss || ''}
`;

  if (template.style === 'simple') {
    const totals = buildTotalsFooter(
      { ...template, showTotals: template.showTotals === false ? false : true },
      useCols,
      printRows,
      { withRowNumbers: false },
    );
    return `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head>
<body class="simple-body${landscape ? ' landscape' : ''}"><div class="gost-page${landscape ? ' landscape' : ''}">
${simpleLetterheadHtml(org)}
<h1>${escHtml(title)}</h1>
${model.subtitle ? `<div class="meta">${escHtml(model.subtitle)}</div>` : ''}
<div class="meta">${model.meta.map((m) => `${escHtml(m.label)}: <b>${escHtml(m.value)}</b>`).join('<br>')}<br>Сформировано: ${escHtml(model.generatedAt)}</div>
<table><thead><tr>${useCols.map((c) => `<th style="${c.width ? `width:${c.width}` : ''}">${escHtml(c.title)}</th>`).join('')}</tr></thead>
<tbody>${printRows.map((row) => `<tr>${useCols.map((c) => `<td class="${cellClass(c.align)}">${escHtml(row[c.key] ?? '—')}</td>`).join('')}</tr>`).join('')}</tbody>
${totals ? `<tfoot>${totals.footRowHtml}</tfoot>` : ''}
</table>
${totals ? totals.barHtml : ''}
${model.note || template.footerNote ? `<p>${escHtml(model.note || template.footerNote || '')}</p>` : ''}
</div></body></html>`;
  }

  const totals = buildTotalsFooter(
    { ...template, showTotals: template.showTotals === false ? false : true },
    useCols,
    printRows,
    {
      withRowNumbers: template.showRowNumbers !== false,
    },
  );
  return `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head>
<body><div class="gost-page${landscape ? ' landscape' : ''}${okud ? ' okud-precise' : ''}">
${okud || formCode ? `<div class="gost-okud">${okud && okud !== '—' ? `ОКУД ${escHtml(okud)}` : ''}${formCode ? `${okud && okud !== '—' ? ' · ' : ''}Форма ${escHtml(formCode)}` : ''}</div>` : ''}
${template.showOrg === false ? '' : orgBlockHtml(org)}
<div class="gost-title">${escHtml(title)}</div>
${model.subtitle ? `<div class="gost-subtitle">${escHtml(model.subtitle)}</div>` : ''}
<table class="gost-meta"><tbody>
${model.meta.map((m) => `<tr><td class="lbl">${escHtml(m.label)}</td><td>${escHtml(m.value || '—')}</td></tr>`).join('')}
<tr><td class="lbl">Дата формирования</td><td>${escHtml(model.generatedAt)}</td></tr>
</tbody></table>
<table class="gost-table"><thead><tr>
${template.showRowNumbers === false ? '' : '<th style="width:8mm">№</th>'}
${useCols.map((c) => `<th style="${c.width ? `width:${c.width}` : ''}">${escHtml(c.title)}</th>`).join('')}
</tr></thead>
<tbody>${printRows.map((row, idx) => `<tr>${template.showRowNumbers === false ? '' : `<td class="center">${idx + 1}</td>`}${useCols.map((c) => `<td class="${cellClass(c.align)}">${escHtml(row[c.key] ?? '—')}</td>`).join('')}</tr>`).join('')
    || `<tr><td colspan="${useCols.length + (template.showRowNumbers === false ? 0 : 1)}" class="center">Нет строк</td></tr>`}</tbody>
${totals ? `<tfoot>${totals.footRowHtml}</tfoot>` : ''}
</table>
${totals ? totals.barHtml : ''}
${model.note || template.footerNote ? `<div class="gost-note"><b>Примечание:</b> ${escHtml(model.note || template.footerNote || '')}</div>` : ''}
${signs.length ? `<div class="gost-signs">${signs.map((s) => `<div class="gost-sign"><b>${escHtml(s.role)}</b><small>${escHtml(s.hint || 'подпись')}</small></div>`).join('')}</div>` : ''}
<div class="gost-footer"><span>Документ сформирован в системе «Метрика»</span><span>${escHtml(formCode || '')}</span></div>
</div></body></html>`;
}

export function templatesForKind(all: PrintTemplate[], kind: string): PrintTemplate[] {
  return all.filter((t) => !t.kinds.length || t.kinds.includes(kind) || t.kinds.includes('*'));
}

export const COLUMN_PRESETS: { id: string; label: string; columns: PrintColumnDef[] }[] = [
  { id: 'brief', label: 'Краткий набор', columns: COLS.brief },
  { id: 'gost', label: 'ГОСТ (имя / арт / ед / ОКЕИ / кол-во)', columns: COLS.nameSkuUnitQty },
  { id: 'price', label: 'С ценой', columns: COLS.nameSkuUnitQtyPrice },
  { id: 'inventory', label: 'Инвентаризация', columns: COLS.inventory },
  { id: 'transfer', label: 'Перемещение', columns: COLS.transfer },
  { id: 'stock', label: 'Остатки полные', columns: STOCK_COLUMNS },
  { id: 'stock-compact', label: 'Остатки краткие', columns: STOCK_COLUMNS_COMPACT },
];
