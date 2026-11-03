import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '../i18n';
import { canOpenPage } from '../permissions';
import type { Page } from './WorkspaceChrome';

type Props = {
  page: string;
  onChange: (p: Page) => void;
  open?: boolean;
  onClose?: () => void;
  collapsed?: boolean;
  session?: any;
};

type NavItem = { id: Page; labelKey?: string; label?: string };

const NAV: NavItem[] = [
  { id: 'dashboard', labelKey: 'overview' },
  { id: 'items', labelKey: 'items' },
  { id: 'categories', labelKey: 'categories' },
  { id: 'units', labelKey: 'units' },
  { id: 'replenishment', labelKey: 'replenishment' },
  { id: 'purchases', labelKey: 'purchases' },
  { id: 'locations', labelKey: 'locations' },
  { id: 'inventory', labelKey: 'inventory' },
  { id: 'projects', labelKey: 'projects' },
  { id: 'reserves', labelKey: 'reserves' },
  { id: 'tsd', labelKey: 'tsd' },
  { id: 'abc', labelKey: 'analytics' },
  { id: 'templates', labelKey: 'templates' },
  { id: 'quality', labelKey: 'quality' },
  { id: 'documents', labelKey: 'documents' },
  { id: 'assets', labelKey: 'assets' },
  { id: 'edo', labelKey: 'edo' },
  { id: 'employees', labelKey: 'employees' },
  { id: 'company', labelKey: 'company' },
  { id: 'organizations', labelKey: 'organizations' },
  { id: 'cabinet', labelKey: 'cabinet' },
  { id: 'audit', labelKey: 'audit' },
  { id: 'history', labelKey: 'history' },
  { id: 'info', labelKey: 'info' },
  { id: 'settings', labelKey: 'settings' },
];

export default function Sidebar({ page, onChange, open = true, onClose, collapsed = false, session }: Props) {
  const { t } = useI18n();
  const [navOrder, setNavOrder] = useState<string[]>(NAV.map((x) => x.id));
  const [navHidden, setNavHidden] = useState<string[]>([]);
  const [customLabels, setCustomLabels] = useState<Record<string, string>>({});
  const [customForms, setCustomForms] = useState<NavItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await (window as any).api.getSetting?.('workspace.nav', '');
        if (raw && !cancelled) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed.order)) setNavOrder(parsed.order);
          if (Array.isArray(parsed.hidden)) setNavHidden(parsed.hidden);
          if (parsed.customLabels && typeof parsed.customLabels === 'object') {
            setCustomLabels(parsed.customLabels);
          }
        }
      } catch {  }
      try {
        const forms = await (window as any).api.listActiveCustomForms?.();
        if (cancelled) return;
        setCustomForms((forms || []).map((f: any) => ({
          id: `custom_${f.code}` as Page,
          label: f.nav_label || f.title || f.code,
        })));
      } catch {
        if (!cancelled) setCustomForms([]);
      }
    })();
    return () => { cancelled = true; };
  }, [session?.organization?.id]);

  const items = useMemo(() => {
    const byId = new Map<string, NavItem>();
    for (const row of NAV) byId.set(row.id, row);
    for (const row of customForms) byId.set(row.id, row);
    const ordered: NavItem[] = [];
    for (const id of navOrder) {
      const row = byId.get(id);
      if (row) ordered.push(row);
    }
    for (const row of [...NAV, ...customForms]) {
      if (!ordered.some((x) => x.id === row.id)) ordered.push(row);
    }
    return ordered.filter((it) => !navHidden.includes(it.id) && canOpenPage(session, it.id));
  }, [navOrder, navHidden, session, customForms]);

  return (
    <>
      {open && <div className="sidebar-backdrop" onClick={onClose} aria-hidden />}
      <aside className={`sidebar ${open ? 'is-open' : ''} ${collapsed ? 'is-collapsed' : ''}`}>
        <div className="logo">
          <div className="logo-mark">М</div>
          <div className="logo-text-wrap">
            <div className="logo-text">{t('appNameShort')}</div>
          </div>
          {onClose && (
            <button type="button" className="sidebar-close btn btn-text" onClick={onClose} aria-label="Закрыть меню">✕</button>
          )}
        </div>

        <nav className="sidebar-nav">
          {items.map((it) => (
            <button
              key={it.id}
              type="button"
              className={`nav-item ${page === it.id ? 'active' : ''}`}
              onClick={() => {
                onChange(it.id);
                onClose?.();
              }}
            >
              <span>
                {it.label
                  || customLabels[it.id]
                  || (it.labelKey ? t(it.labelKey) : it.id)}
              </span>
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div>{t('warehouseAccounting')}</div>
          <div>2026</div>
        </div>
      </aside>
    </>
  );
}
