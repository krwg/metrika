import type { KnownPage, Page } from './components/WorkspaceChrome';

export type PermKey =
  | 'items_view' | 'items_create' | 'items_edit' | 'items_delete'
  | 'categories_edit' | 'units_edit' | 'templates_edit'
  | 'locations_edit' | 'inventory'
  | 'post_writeoff' | 'post_surplus' | 'post_regrade' | 'post_disassemble' | 'post_assemble'
  | 'post_revision' | 'post_po_receive' | 'post_transfer' | 'post_wo' | 'cancel_stock' | 'cancel_po'
  | 'projects' | 'purchases' | 'replenishment'
  | 'analytics' | 'quality' | 'documents' | 'history_view'
  | 'settings' | 'backup' | 'console' | 'users' | 'org_edit'
  | 'employees' | 'edo' | 'company' | 'assets';

const PAGE_PERM: Record<KnownPage, PermKey | PermKey[] | null> = {
  dashboard: 'items_view',
  items: 'items_view',
  categories: 'categories_edit',
  units: 'units_edit',
  replenishment: 'replenishment',
  purchases: 'purchases',
  locations: 'inventory',
  inventory: 'inventory',
  projects: 'projects',
  reserves: 'projects',
  tsd: 'projects',
  abc: 'analytics',
  templates: 'templates_edit',
  quality: 'quality',
  documents: 'documents',
  organizations: 'org_edit',
  history: 'history_view',
  info: null,
  settings: 'settings',
  console: 'console',
  audit: 'users',
  config: 'settings',
  cabinet: null,
  employees: 'employees',
  edo: 'edo',
  company: 'company',
  assets: 'assets',
  parties: ['company', 'employees', 'org_edit'],
};

export function isAdmin(session: any) {
  return session?.user?.role === 'admin';
}

export function isOperator(session: any) {
  return session?.user?.role === 'operator';
}

export function isUser(session: any) {
  return session?.user?.role === 'user';
}

export function can(session: any, key: PermKey) {
  if (!session) return false;
  if (isAdmin(session)) return true;
  return Boolean(session.permissions?.[key]);
}

export function canOpenPage(session: any, page: Page) {
  if (!session) return false;
  if (page === 'config') return isAdmin(session);
  if (String(page).startsWith('custom_')) {
    if (isAdmin(session)) return true;
    if (isOperator(session)) return false;
    return true;
  }
  if (isAdmin(session)) return true;
  if (isOperator(session)) {
    return page === 'inventory' || page === 'locations' || page === 'items' || page === 'history' || page === 'info'
      || page === 'cabinet' || page === 'edo' || page === 'assets';
  }
  const need = PAGE_PERM[page as keyof typeof PAGE_PERM];
  if (need == null) return true;
  if (Array.isArray(need)) return need.some((key) => can(session, key));
  return can(session, need);
}

export const PERM_LABELS_RU: { key: PermKey; ru: string }[] = [
  { key: 'items_view', ru: 'Просмотр товаров' },
  { key: 'items_create', ru: 'Создание товаров' },
  { key: 'items_edit', ru: 'Изменение товаров' },
  { key: 'items_delete', ru: 'Удаление товаров' },
  { key: 'categories_edit', ru: 'Категории' },
  { key: 'units_edit', ru: 'Единицы' },
  { key: 'templates_edit', ru: 'Шаблоны' },
  { key: 'locations_edit', ru: 'Изменение адресов хранения' },
  { key: 'inventory', ru: 'Остатки, сканер, ревизия' },
  { key: 'post_writeoff', ru: 'Проведение: списание' },
  { key: 'post_surplus', ru: 'Проведение: излишки' },
  { key: 'post_regrade', ru: 'Проведение: пересортица' },
  { key: 'post_disassemble', ru: 'Проведение: разукомплектация' },
  { key: 'post_assemble', ru: 'Проведение: комплектация' },
  { key: 'post_revision', ru: 'Проведение: ревизия' },
  { key: 'post_po_receive', ru: 'Проведение: приёмка PO' },
  { key: 'post_transfer', ru: 'Проведение: перемещение' },
  { key: 'post_wo', ru: 'Проведение: списание заказ-наряда' },
  { key: 'cancel_stock', ru: 'Отмена складских актов' },
  { key: 'cancel_po', ru: 'Отмена заказов поставщику' },
  { key: 'projects', ru: 'Проекты / ТСД' },
  { key: 'purchases', ru: 'Закупки (создание/изменение)' },
  { key: 'replenishment', ru: 'Пополнение' },
  { key: 'analytics', ru: 'Аналитика' },
  { key: 'quality', ru: 'Качество базы' },
  { key: 'documents', ru: 'Журнал документов' },
  { key: 'history_view', ru: 'История движений' },
  { key: 'settings', ru: 'Настройки' },
  { key: 'backup', ru: 'Резервные копии' },
  { key: 'console', ru: 'Командная строка' },
  { key: 'users', ru: 'Пользователи' },
  { key: 'org_edit', ru: 'Реквизиты организации' },
  { key: 'employees', ru: 'Сотрудники организации' },
  { key: 'edo', ru: 'ЭДО' },
  { key: 'company', ru: 'Компания (УНФ)' },
  { key: 'assets', ru: 'Оборудование / ОС' },
];
