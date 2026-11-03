

export const PERM_KEYS = [
  'items_view',
  'items_create',
  'items_edit',
  'items_delete',
  'categories_edit',
  'units_edit',
  'templates_edit',
  'locations_edit',
  'inventory',
  'post_writeoff',
  'post_surplus',
  'post_regrade',
  'post_disassemble',
  'post_assemble',
  'post_revision',
  'post_po_receive',
  'post_transfer',
  'post_wo',
  'cancel_stock',
  'cancel_po',
  'projects',
  'purchases',
  'replenishment',
  'analytics',
  'quality',
  'documents',
  'history_view',
  'settings',
  'backup',
  'console',
  'users',
  'org_edit',
  'employees',
  'edo',
  'company',
  'assets',
] as const;

export type PermKey = (typeof PERM_KEYS)[number];
export type Role = 'admin' | 'user' | 'operator';

export const DOC_POST_PERM: Record<string, PermKey> = {
  writeoff: 'post_writeoff',
  surplus: 'post_surplus',
  regrade: 'post_regrade',
  disassemble: 'post_disassemble',
  assemble: 'post_assemble',
};

export const DEFAULT_ADMIN_PERMS: Record<PermKey, boolean> = Object.fromEntries(
  PERM_KEYS.map((key) => [key, true]),
) as Record<PermKey, boolean>;

export const DEFAULT_USER_PERMS: Record<PermKey, boolean> = {
  items_view: true,
  items_create: true,
  items_edit: true,
  items_delete: false,
  categories_edit: false,
  units_edit: false,
  templates_edit: false,
  locations_edit: false,
  inventory: true,
  post_writeoff: true,
  post_surplus: true,
  post_regrade: true,
  post_disassemble: true,
  post_assemble: true,
  post_revision: true,
  post_po_receive: false,
  post_transfer: true,
  post_wo: true,
  cancel_stock: true,
  cancel_po: false,
  projects: true,
  purchases: false,
  replenishment: false,
  analytics: true,
  quality: false,
  documents: true,
  history_view: true,
  settings: false,
  backup: false,
  console: false,
  users: false,
  org_edit: false,
  employees: false,
  edo: true,
  company: false,
  assets: true,
};

export const DEFAULT_OPERATOR_PERMS: Record<PermKey, boolean> = {
  items_view: true,
  items_create: false,
  items_edit: false,
  items_delete: false,
  categories_edit: false,
  units_edit: false,
  templates_edit: false,
  locations_edit: false,
  inventory: true,
  post_writeoff: true,
  post_surplus: true,
  post_regrade: true,
  post_disassemble: true,
  post_assemble: true,
  post_revision: true,
  post_po_receive: false,
  post_transfer: true,
  post_wo: false,
  cancel_stock: true,
  cancel_po: false,
  projects: false,
  purchases: false,
  replenishment: false,
  analytics: false,
  quality: false,
  documents: false,
  history_view: true,
  settings: false,
  backup: false,
  console: false,
  users: false,
  org_edit: false,
  employees: false,
  edo: true,
  company: false,
  assets: true,
};

export function normalizeRole(role: any): Role {
  if (role === 'admin' || role === 'operator') return role;
  return 'user';
}

export function defaultsForRole(role: Role): Record<PermKey, boolean> {
  if (role === 'admin') return { ...DEFAULT_ADMIN_PERMS };
  if (role === 'operator') return { ...DEFAULT_OPERATOR_PERMS };
  return { ...DEFAULT_USER_PERMS };
}

export function parsePerms(raw: string | null | undefined, role: string): Record<string, boolean> {
  const normalized = normalizeRole(role);
  const defaults = defaultsForRole(normalized);
  try {
    const parsed = JSON.parse(raw || '{}') || {};
    const merged = { ...defaults, ...parsed };

    if (parsed.inventory === true) {
      for (const key of ['post_writeoff', 'post_surplus', 'post_regrade', 'post_disassemble', 'post_assemble', 'post_revision', 'post_transfer', 'cancel_stock'] as const) {
        if (!(key in parsed)) merged[key] = true;
      }
    }
    if (parsed.purchases === true && !('post_po_receive' in parsed)) merged.post_po_receive = true;
    if (parsed.purchases === true && !('cancel_po' in parsed)) merged.cancel_po = true;

    if (parsed.items_edit === true && !('items_create' in parsed)) merged.items_create = true;

    if (parsed.projects === true && !('post_wo' in parsed)) merged.post_wo = true;
    return merged;
  } catch {
    return defaults;
  }
}

export function parseLocationScope(raw: string | null | undefined): number[] | null {
  if (raw == null || String(raw).trim() === '') return null;
  try {
    const parsed = JSON.parse(String(raw));
    if (!Array.isArray(parsed)) return null;
    const ids = parsed.map((value) => Number(value)).filter((id) => Number.isFinite(id) && id > 0);
    return ids.length ? ids : null;
  } catch {
    return null;
  }
}

export function applyGroupPerms(
  userPerms: Record<string, boolean>,
  groupPermissionJsons: Array<string | null | undefined>,
): Record<string, boolean> {
  const merged = { ...userPerms };
  for (const raw of groupPermissionJsons) {
    if (raw == null || String(raw).trim() === '') continue;
    try {
      const parsed = JSON.parse(String(raw)) || {};
      for (const [key, value] of Object.entries(parsed)) {
        if (value === true) merged[key] = true;
      }
    } catch {  }
  }
  return merged;
}

export const PAGE_PERM: Record<string, PermKey | PermKey[] | null> = {
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
  employees: 'employees',
  edo: 'edo',
  company: 'company',
  assets: 'assets',
  parties: ['company', 'employees', 'org_edit'],
  cabinet: null,
  audit: 'users',
};
