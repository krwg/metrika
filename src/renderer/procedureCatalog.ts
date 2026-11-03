import type { Page } from './components/WorkspaceChrome';

export type ProcedureHit = {
  kind: 'procedure';
  id: string;
  name: string;
  hint: string;
  aliases: string[];
  page?: Page;
  inventoryTab?: 'cell' | 'free' | 'ops';
  operatorMode?: 'lookup' | 'receipt' | 'issue' | 'pair' | 'audit' | 'writeoff' | 'surplus' | 'regrade' | 'disassemble' | 'assemble' | 'transfer';
  stockKind?: 'writeoff' | 'surplus' | 'regrade' | 'disassemble' | 'assemble';

  action?: 'undo';
};

export const PROCEDURES: ProcedureHit[] = [
  {
    kind: 'procedure', id: 'receipt', name: 'Приход',
    hint: 'Оприходовать товар на ячейку',
    aliases: ['приход', 'приемка', 'приёмка', 'оприходование', 'receipt', 'in'],
    page: 'inventory', inventoryTab: 'free', operatorMode: 'receipt',
  },
  {
    kind: 'procedure', id: 'issue', name: 'Расход',
    hint: 'Списать товар со склада',
    aliases: ['расход', 'отгрузка', 'списание расхода', 'issue', 'out', 'отбор'],
    page: 'inventory', inventoryTab: 'cell', operatorMode: 'issue',
  },
  {
    kind: 'procedure', id: 'transfer', name: 'Перемещение',
    hint: 'С ячейки на ячейку',
    aliases: ['перемещение', 'переместить', 'transfer', 'move', 'между ячейками'],
    page: 'locations', operatorMode: 'transfer',
  },
  {
    kind: 'procedure', id: 'pair', name: 'Товар + ячейка',
    hint: 'Два скана подряд (+1)',
    aliases: ['пара', 'товар ячейка', 'размещение', 'pair', 'putaway'],
    page: 'inventory', inventoryTab: 'free', operatorMode: 'pair',
  },
  {
    kind: 'procedure', id: 'audit', name: 'Ревизия',
    hint: 'Пересчёт факта по ячейке',
    aliases: ['ревизия', 'инвентаризация', 'пересчет', 'пересчёт', 'audit', 'inventory'],
    page: 'inventory', inventoryTab: 'cell', operatorMode: 'audit',
  },
  {
    kind: 'procedure', id: 'free-audit', name: 'Быстрая инвентаризация',
    hint: 'Сканы без адреса, затем назначение',
    aliases: ['быстрая инвентаризация', 'стоктейк', 'free', 'свободное сканирование'],
    page: 'inventory', inventoryTab: 'free',
  },
  {
    kind: 'procedure', id: 'writeoff', name: 'Списание',
    hint: 'Акт списания с основанием',
    aliases: ['списание', 'writeoff', 'списать', 'утрата', 'брак'],
    page: 'inventory', inventoryTab: 'ops', operatorMode: 'writeoff', stockKind: 'writeoff',
  },
  {
    kind: 'procedure', id: 'surplus', name: 'Оприходование излишков',
    hint: 'Акт излишков по ячейке',
    aliases: ['излишки', 'излишек', 'surplus', 'оприходование излишков'],
    page: 'inventory', inventoryTab: 'ops', operatorMode: 'surplus', stockKind: 'surplus',
  },
  {
    kind: 'procedure', id: 'regrade', name: 'Пересортица',
    hint: 'Один товар → другой',
    aliases: ['пересортица', 'regrade', 'пересорт'],
    page: 'inventory', inventoryTab: 'ops', operatorMode: 'regrade', stockKind: 'regrade',
  },
  {
    kind: 'procedure', id: 'assemble', name: 'Комплектация',
    hint: 'Компоненты → комплект на склад',
    aliases: ['комплектация', 'сборка комплекта', 'assemble', 'набор'],
    page: 'inventory', inventoryTab: 'ops', operatorMode: 'assemble', stockKind: 'assemble',
  },
  {
    kind: 'procedure', id: 'disassemble', name: 'Разукомплектация',
    hint: 'Комплект → компоненты',
    aliases: ['разукомплектация', 'разборка', 'disassemble', 'комплект'],
    page: 'inventory', inventoryTab: 'ops', operatorMode: 'disassemble', stockKind: 'disassemble',
  },
  {
    kind: 'procedure', id: 'lookup', name: 'Поиск товара',
    hint: 'Открыть карточку по коду',
    aliases: ['поиск', 'карточка', 'lookup', 'найти товар'],
    page: 'items', operatorMode: 'lookup',
  },
  {
    kind: 'procedure', id: 'undo', name: 'Отменить последнее движение',
    hint: 'Сторно последней операции ledger',
    aliases: ['отменить', 'undo', 'сторно', 'отмена движения', 'откатить'],
    action: 'undo',
  },
  {
    kind: 'procedure', id: 'locations', name: 'Ячейки',
    hint: 'Адреса хранения',
    aliases: ['ячейки', 'адреса', 'хранение', 'locations', 'склад'],
    page: 'locations',
  },
  {
    kind: 'procedure', id: 'replenishment', name: 'Пополнение',
    hint: 'Что заказать поставщику',
    aliases: ['пополнение', 'заказ', 'recommen', 'replenishment', 'заказать'],
    page: 'replenishment',
  },
  {
    kind: 'procedure', id: 'purchases', name: 'Закупки',
    hint: 'Заказы поставщику (PO)',
    aliases: ['закупки', 'по', 'po', 'поставщик', 'purchases'],
    page: 'purchases',
  },
  {
    kind: 'procedure', id: 'projects', name: 'Проекты',
    hint: 'Заказ-наряды и резервы',
    aliases: ['проекты', 'сборка', 'заказ-наряд', 'wo', 'bom'],
    page: 'projects',
  },
  {
    kind: 'procedure', id: 'reserves', name: 'Регистр резервов',
    hint: 'Удерживаемый остаток по проектам',
    aliases: ['резервы', 'резерв', 'reserves', 'зарезервировано'],
    page: 'reserves',
  },
  {
    kind: 'procedure', id: 'tsd', name: 'ТСД',
    hint: 'Терминал сбора заданий',
    aliases: ['тсд', 'терминал', 'сбор', 'tsd', 'пикинг'],
    page: 'tsd',
  },
  {
    kind: 'procedure', id: 'history', name: 'История',
    hint: 'Движения склада',
    aliases: ['история', 'движения', 'history', 'журнал движений'],
    page: 'history',
  },
  {
    kind: 'procedure', id: 'documents', name: 'Журнал документов',
    hint: 'Реестр документов организации',
    aliases: ['документы', 'журнал документов', 'documents'],
    page: 'documents',
  },
  {
    kind: 'procedure', id: 'quality', name: 'Качество базы',
    hint: 'Дубли и проблемные записи',
    aliases: ['качество', 'дубли', 'quality'],
    page: 'quality',
  },
  {
    kind: 'procedure', id: 'info', name: 'Справка',
    hint: 'База знаний по роли',
    aliases: ['справка', 'помощь', 'инфо', 'knowledge', 'help', 'вики'],
    page: 'info',
  },
];

export type SearchHit =
  | ProcedureHit
  | { kind: 'item'; id: number; name: string; hint: string; item: any };

export function getProcedure(id: string) {
  return PROCEDURES.find((p) => p.id === id);
}

export function searchProcedures(query: string, limit = 8): ProcedureHit[] {
  const q = query.trim().toLocaleLowerCase();
  if (!q) return [];
  const scored = PROCEDURES.map((proc) => {
    const hay = [proc.name, proc.hint, ...proc.aliases].join(' ').toLocaleLowerCase();
    let score = 0;
    if (proc.name.toLocaleLowerCase().startsWith(q)) score += 100;
    else if (proc.aliases.some((a) => a.startsWith(q))) score += 80;
    else if (hay.includes(q)) score += 40;
    return { proc, score };
  }).filter((row) => row.score > 0);
  scored.sort((a, b) => b.score - a.score || a.proc.name.localeCompare(b.proc.name, 'ru'));
  return scored.slice(0, limit).map((row) => row.proc);
}

export async function unifiedSearch(query: string): Promise<SearchHit[]> {
  const q = query.trim();
  if (!q) return [];
  const procedures = searchProcedures(q, 6);
  let items: any[] = [];
  try {
    items = (await (window as any).api.getItems(q)) || [];
  } catch {
    items = [];
  }
  const itemHits: SearchHit[] = items.slice(0, 10).map((item: any) => ({
    kind: 'item' as const,
    id: item.id,
    name: item.name,
    hint: `${item.sku || 'без артикула'} · ${(item.barcodes || [item.barcode]).filter(Boolean)[0] || '—'}`,
    item,
  }));
  const procFirst = q.length <= 12 || procedures.some((p) => p.name.toLocaleLowerCase().includes(q.toLocaleLowerCase()));
  return procFirst ? [...procedures, ...itemHits] : [...itemHits, ...procedures];
}
