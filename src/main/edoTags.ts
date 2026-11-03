

import { getDb } from './db';
import { getEdoCatalogItem, type EdoCatalogItem } from './edoCatalog';

export const EDO_FORM_META: Record<string, { index: string; label: string; tag: string }> = {
  application: { index: 'Заяв', label: 'Заявление', tag: 'Заявление' },
  order: { index: 'Прк', label: 'Приказ', tag: 'Приказ' },
  service_note: { index: 'СЗ', label: 'Служебная записка', tag: 'Служебка' },
  assignment: { index: 'Пор', label: 'Поручение', tag: 'Поручение' },
  act: { index: 'Акт', label: 'Акт', tag: 'Акт' },
  memo: { index: 'Исх', label: 'Служебное письмо', tag: 'Письмо' },
  other: { index: 'Вн', label: 'Внутренний документ', tag: 'Внутр.' },
};

export const EDO_CATEGORY_META: Record<string, { index: string; label: string; tag: string }> = {
  hr: { index: 'КДП', label: 'Кадры и HR', tag: 'Кадры' },
  warehouse: { index: 'СКЛ', label: 'Склад', tag: 'Склад' },
  tax: { index: 'БУХ', label: 'Налоги и бухгалтерия', tag: 'Бухгалтерия' },
  other: { index: 'ОБЩ', label: 'Общее', tag: 'Общее' },
};

export const EDO_CATALOG_THEME: Record<string, string> = {
  hr_resign: 'Увол',
  hr_2ndfl: '2НДФЛ',
  hr_income_cert: 'СпрДох',
  hr_personal_data: 'ПДн',
  hr_bank_details: 'Рекв',
  hr_salary_project: 'ЗарПр',
  hr_labor_copy: 'ТК',
  hr_dms: 'ДМС',
  hr_insurance_change: 'Страх',
  hr_exec_docs: 'ИспЛ',
  hr_state_duty: 'Госп',
  hr_donor: 'Донор',
  hr_disabled_child: 'ИнвРеб',
  hr_mathelp_death: 'МатП-С',
  hr_mathelp_birth: 'МатП-Р',
  hr_tax_child: 'ВычДет',
  hr_tax_property: 'ВычИмущ',
  hr_tax_other: 'ВычПроч',
  hr_accident: 'НС',
  hr_maternity: 'Декрет',
  hr_childcare: 'Уход',
  hr_study_leave: 'УчОтп',
  hr_child_benefits: 'ПосРеб',
  hr_kz_arrival: 'КЗ',
  hr_cert_other_acc: 'СпрБух',
  hr_cert_other_hr: 'СпрКад',
  hr_other: 'ПрочКад',
  hr_sport: 'Спорт',
  hr_discounts: 'Скид',
  hr_ponimayu: 'Согл',
  wh_inv_shortage: 'НедИнв',
  wh_tmc_missing: 'НедТМЦ',
  wh_writeoff_request: 'Спис',
  wh_explain_shortage: 'Объясн',
  wh_move_request: 'Перем',
  wh_receive_claim: 'Претенз',
  wh_mol_assign: 'МОЛ',
};

export type EdoDocIdentity = {

  reg_stream: string;

  doc_tag: string;

  kind_label: string;

  category: string;
  category_label: string;
  category_tag: string;
  form_type: string;
  form_index: string;
  form_tag: string;
  theme_index: string;
  catalog_code: string | null;

  tags: string[];
};

export function resolveEdoIdentity(input: {
  form_type?: string;
  catalog_code?: string | null;
  title?: string;
}): EdoDocIdentity {
  const formType = String(input.form_type || 'other');
  const form = EDO_FORM_META[formType] || EDO_FORM_META.other;
  const catalogCode = input.catalog_code ? String(input.catalog_code) : null;
  let catalog: EdoCatalogItem | null = null;
  if (catalogCode) {
    try { catalog = getEdoCatalogItem(catalogCode); } catch { catalog = null; }
  }
  const category = catalog?.category || 'other';
  const cat = EDO_CATEGORY_META[category] || EDO_CATEGORY_META.other;
  const theme = (catalogCode && EDO_CATALOG_THEME[catalogCode])
    || (catalog ? shortThemeFromCode(catalog.code) : form.index);

  const reg_stream = `${cat.index}-${theme}`;
  const doc_tag = reg_stream;
  const tags = uniqueTags([
    cat.tag,
    form.tag,
    theme,
    catalog?.name ? shortenName(catalog.name) : '',
    catalog?.category_label || '',
    form.label,
  ]);

  return {
    reg_stream,
    doc_tag,
    kind_label: catalog?.name || form.label,
    category,
    category_label: catalog?.category_label || cat.label,
    category_tag: cat.tag,
    form_type: formType,
    form_index: form.index,
    form_tag: form.tag,
    theme_index: theme,
    catalog_code: catalogCode,
    tags,
  };
}

function shortThemeFromCode(code: string) {
  const parts = String(code || '').split('_').filter(Boolean);
  if (parts.length <= 1) return 'ДОК';
  return parts.slice(1).map((p) => p.slice(0, 4)).join('-').slice(0, 12) || 'ДОК';
}

function shortenName(name: string) {
  const s = String(name || '').trim();
  if (s.length <= 28) return s;
  return `${s.slice(0, 26)}…`;
}

function uniqueTags(list: string[]) {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of list) {
    const t = String(raw || '').trim();
    if (!t) continue;
    const key = t.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

export function nextEdoRegNo(regStream: string) {
  const db = getDb();
  const year = new Date().getFullYear();
  const prefix = `${regStream}-${year}-`;
  const last = db.prepare(`
    SELECT doc_no AS n FROM edo_documents
    WHERE doc_no LIKE ?
    ORDER BY id DESC LIMIT 1
  `).get(`${prefix}%`) as any;
  let seq = 1;
  if (last?.n) {
    const m = String(last.n).match(/-(\d+)$/);
    if (m) seq = Number(m[1]) + 1;
  }
  return `${prefix}${String(seq).padStart(4, '0')}`;
}

export function enrichEdoRow(row: any) {
  if (!row) return row;
  const identity = resolveEdoIdentity({
    form_type: row.form_type,
    catalog_code: row.catalog_code,
    title: row.title,
  });
  let tags = identity.tags;
  if (row.tags_json) {
    try {
      const parsed = JSON.parse(row.tags_json);
      if (Array.isArray(parsed) && parsed.length) tags = parsed.map(String);
    } catch {  }
  }
  return {
    ...row,
    doc_tag: row.doc_tag || identity.doc_tag,
    reg_stream: row.reg_stream || identity.reg_stream,
    kind_label: identity.kind_label,
    category: identity.category,
    category_label: identity.category_label,
    category_tag: identity.category_tag,
    form_tag: identity.form_tag,
    theme_index: identity.theme_index,
    tags,
    tags_label: tags.join(' · '),
  };
}
