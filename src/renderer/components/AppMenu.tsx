import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n';
import type { Page } from './WorkspaceChrome';

type Props = {
  onOpenPage: (page: Page) => void;
  onNotice: (message: string) => void;
  onReload: () => void;
  onNewItem: () => void;
  onUndo: () => void;
  onImportCsv: () => void;
  onAbout?: () => void;
  onToggleConsole?: () => void;
  onLogout?: () => void;
};

type MenuId = 'file' | 'edit' | 'info' | 'terminal' | 'help' | null;

export default function AppMenu({ onOpenPage, onNotice, onReload, onNewItem, onUndo, onImportCsv, onAbout, onToggleConsole, onLogout }: Props) {
  const { t, locale } = useI18n();
  const [open, setOpen] = useState<MenuId>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onDoc(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(null);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  function act(fn: () => void) {
    setOpen(null);
    fn();
  }

  async function backup() {
    const file = await (window as any).api.createBackup();
    if (file) onNotice(locale === 'ru' ? `Копия сохранена: ${file}` : `Backup saved: ${file}`);
  }

  async function restore() {
    try {
      const safety = await (window as any).api.restoreBackup();
      if (safety) { onNotice(locale === 'ru' ? 'База восстановлена' : 'Database restored'); onReload(); }
    } catch (e: any) {
      onNotice(e?.message || (locale === 'ru' ? 'Не удалось восстановить' : 'Restore failed'));
    }
  }

  async function refreshPorts() {
    try {
      await (window as any).api.listScannerPorts();
      onNotice(locale === 'ru' ? 'Список портов обновлён' : 'Port list refreshed');
    } catch {
      onNotice(locale === 'ru' ? 'Не удалось обновить порты' : 'Failed to refresh ports');
    }
  }

  const menus: { id: MenuId; label: string; items: { label: string; action: () => void; danger?: boolean }[] }[] = [
    {
      id: 'file',
      label: t('menuFile'),
      items: [
        { label: t('menuNewItem'), action: () => { onOpenPage('items'); onNewItem(); } },
        { label: t('menuImportCsv'), action: () => { onOpenPage('items'); onImportCsv(); } },
        { label: t('menuExportPdf'), action: async () => { const f = await (window as any).api.exportPdf(); if (f) onNotice(f); } },
        { label: t('menuBackup'), action: () => { void backup(); } },
        { label: t('menuRestore'), action: () => { void restore(); } },
        { label: locale === 'ru' ? 'Сменить организацию' : 'Switch organization', action: () => { onLogout?.(); } },
        { label: t('menuExit'), action: () => { (window as any).api.quitApp?.(); window.close(); }, danger: true },
      ],
    },
    {
      id: 'edit',
      label: t('menuEdit'),
      items: [
        { label: t('menuUndoLast'), action: () => onUndo() },
        { label: t('settings'), action: () => onOpenPage('settings') },
      ],
    },
    {
      id: 'info',
      label: t('menuInfo'),
      items: [
        { label: t('menuAbout'), action: () => { onAbout?.(); } },
        { label: t('organizations'), action: () => onOpenPage('organizations') },
        { label: t('quality'), action: () => onOpenPage('quality') },
        { label: t('history'), action: () => onOpenPage('history') },
      ],
    },
    {
      id: 'terminal',
      label: t('menuTerminal'),
      items: [
        { label: t('menuConsole'), action: () => { onToggleConsole?.(); } },
        { label: t('tsd'), action: () => onOpenPage('tsd') },
        { label: t('menuRefreshPorts'), action: () => { void refreshPorts(); } },
        { label: t('projects'), action: () => onOpenPage('projects') },
      ],
    },
    {
      id: 'help',
      label: t('menuHelp'),
      items: [
        { label: t('menuHelpGuide'), action: () => onOpenPage('info') },
        { label: t('analytics'), action: () => onOpenPage('abc') },
        { label: t('menuAbout'), action: () => { onAbout?.(); } },
      ],
    },
  ];

  return (
    <div className="app-menu" ref={rootRef}>
      {menus.map((menu) => (
        <div key={String(menu.id)} className="app-menu-group">
          <button
            type="button"
            className={`app-menu-btn ${open === menu.id ? 'open' : ''}`}
            onClick={() => setOpen(open === menu.id ? null : menu.id)}
          >
            {menu.label}
          </button>
          {open === menu.id && (
            <div className="app-menu-dropdown">
              {menu.items.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  className={`app-menu-item ${item.danger ? 'danger' : ''}`}
                  onClick={() => act(item.action)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
