import type { Page } from './components/WorkspaceChrome';
import { can, canOpenPage, type PermKey } from './permissions';

export type AppCommand = {
  id: string;
  label: string;
  aliases: string[];
  hint: string;
  page: Page;
  
  inventoryTab?: 'cell' | 'free' | 'ops';
  
  stockOp?: 'writeoff' | 'surplus' | 'regrade' | 'disassemble' | 'assemble';
  perm?: PermKey;
};


export const APP_COMMANDS: AppCommand[] = [
  { id: 'cmd-receipt', label: 'Приход', aliases: ['оприходование', 'приемка', 'приход товара'], hint: 'Оприходовать на склад', page: 'inventory', inventoryTab: 'cell', perm: 'inventory' },
  { id: 'cmd-issue', label: 'Расход', aliases: ['списать', 'выдача', 'отгрузка'], hint: 'Списать со склада', page: 'inventory', inventoryTab: 'cell', perm: 'inventory' },
  { id: 'cmd-audit', label: 'Ревизия', aliases: ['инвентаризация', 'пересчёт', 'пересчет', 'аудит'], hint: 'Пересчёт ячейки', page: 'inventory', inventoryTab: 'cell', perm: 'inventory' },
  { id: 'cmd-stocktake', label: 'Быстрая инвентаризация', aliases: ['стоктейк', 'свободное сканирование'], hint: 'Скан без ячейки', page: 'inventory', inventoryTab: 'free', perm: 'inventory' },
  { id: 'cmd-writeoff', label: 'Списание', aliases: ['writeoff', 'списать акт', 'акт списания'], hint: 'Складской акт списания', page: 'inventory', inventoryTab: 'ops', stockOp: 'writeoff', perm: 'inventory' },
  { id: 'cmd-surplus', label: 'Оприходование излишков', aliases: ['излишки', 'surplus'], hint: 'Акт излишков', page: 'inventory', inventoryTab: 'ops', stockOp: 'surplus', perm: 'inventory' },
  { id: 'cmd-regrade', label: 'Пересортица', aliases: ['regrade', 'замена товара'], hint: 'Один товар → другой', page: 'inventory', inventoryTab: 'ops', stockOp: 'regrade', perm: 'inventory' },
  { id: 'cmd-assemble', label: 'Комплектация', aliases: ['сборка комплекта', 'assemble', 'набор'], hint: 'Компоненты → комплект', page: 'inventory', inventoryTab: 'ops', stockOp: 'assemble', perm: 'inventory' },
  { id: 'cmd-disassemble', label: 'Разукомплектация', aliases: ['writeoff', 'списать акт', 'разборка'], hint: 'Комплект → компоненты', page: 'inventory', inventoryTab: 'ops', stockOp: 'disassemble', perm: 'inventory' },
  { id: 'cmd-items', label: 'Товары', aliases: ['каталог', 'номенклатура'], hint: 'Каталог товаров', page: 'items', perm: 'items_view' },
  { id: 'cmd-locations', label: 'Хранение', aliases: ['ячейки', 'адреса', 'склады'], hint: 'Карта склада', page: 'locations', perm: 'inventory' },
  { id: 'cmd-projects', label: 'Проекты', aliases: ['заказ-наряд', 'сборка'], hint: 'Резервы и сборка', page: 'projects', perm: 'projects' },
  { id: 'cmd-reserves', label: 'Регистр резервов', aliases: ['резервы', 'резерв', 'удержание'], hint: 'Удерживаемый остаток', page: 'reserves', perm: 'projects' },
  { id: 'cmd-tsd', label: 'Терминал сбора', aliases: ['тсд', 'сканер заданий'], hint: 'Задания ТСД', page: 'tsd', perm: 'projects' },
  { id: 'cmd-purchases', label: 'Закупки', aliases: ['заказ поставщику', 'po'], hint: 'Заказы и приёмка', page: 'purchases', perm: 'purchases' },
  { id: 'cmd-repl', label: 'Пополнение', aliases: ['заказать', 'минимум'], hint: 'Что нужно заказать', page: 'replenishment', perm: 'replenishment' },
  { id: 'cmd-history', label: 'История', aliases: ['движения', 'ledger'], hint: 'Журнал движений', page: 'history', perm: 'history_view' },
  { id: 'cmd-documents', label: 'Журнал документов', aliases: ['документы', 'реестр'], hint: 'Документы организации', page: 'documents', perm: 'documents' },
  { id: 'cmd-dashboard', label: 'Обзор', aliases: ['главная', 'рабочий стол'], hint: 'Стартовая страница', page: 'dashboard' },
  { id: 'cmd-categories', label: 'Категории', aliases: ['группы', 'дерево'], hint: 'Иерархия категорий', page: 'categories', perm: 'items_view' },
  { id: 'cmd-units', label: 'Единицы', aliases: ['ед изм', 'uom'], hint: 'Справочник единиц', page: 'units', perm: 'items_view' },
  { id: 'cmd-quality', label: 'Центр качества', aliases: ['health', 'дубли', 'здоровье'], hint: 'Health score и проблемы данных', page: 'quality' },
  { id: 'cmd-settings', label: 'Настройки', aliases: ['параметры', 'серии'], hint: 'Настройки организации', page: 'settings' },
  { id: 'cmd-audit', label: 'Журнал действий', aliases: ['аудит', 'логи'], hint: 'Кто что менял', page: 'audit' },
  { id: 'cmd-abc', label: 'Аналитика', aliases: ['abc', 'kpi'], hint: 'ABC и показатели', page: 'abc' },
  { id: 'cmd-info', label: 'Справка', aliases: ['база знаний', 'help'], hint: 'Процедуры и FAQ', page: 'info' },
];

export type SearchHit =
  | { kind: 'command'; command: AppCommand }
  | { kind: 'item'; item: any };

function matchCommand(cmd: AppCommand, q: string): boolean {
  const hay = [cmd.label, cmd.hint, ...cmd.aliases].join(' ').toLowerCase();
  return hay.includes(q);
}

export function searchCommands(query: string, session: any, limit = 8): AppCommand[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return APP_COMMANDS
    .filter((cmd) => {
      if (!canOpenPage(session, cmd.page)) return false;
      if (cmd.perm && !can(session, cmd.perm) && session?.user?.role !== 'admin') return false;
      return matchCommand(cmd, q);
    })
    .slice(0, limit);
}

export async function searchGlobal(query: string, session: any): Promise<SearchHit[]> {
  const q = query.trim();
  if (!q) return [];
  const commands = searchCommands(q, session, 6).map((command) => ({ kind: 'command' as const, command }));
  let items: SearchHit[] = [];
  try {
    const rows = await (window as any).api.getItems(q);
    items = (rows || []).slice(0, 8).map((item: any) => ({ kind: 'item' as const, item }));
  } catch {
    items = [];
  }
  return [...commands, ...items];
}
