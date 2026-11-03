import { useEffect, useRef, useState } from 'react';
import type { Page } from './WorkspaceChrome';

type Props = {
  label: string;
  subtitle?: string;
  onOpenCabinet: () => void;
  onOpenPage: (page: Page) => void;
  onOpenCrm?: () => void;
  canOpenCrm?: boolean;
  onOpenClientPortal?: () => void;
  onSwitchAccount: () => void;
  onExit: () => void;
};

export default function AccountMenu({
  label,
  subtitle,
  onOpenCabinet,
  onOpenPage,
  onOpenCrm,
  canOpenCrm = false,
  onOpenClientPortal,
  onSwitchAccount,
  onExit,
}: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return undefined;
    function onDoc(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div className={`account-menu${open ? ' open' : ''}`} ref={rootRef}>
      <button
        type="button"
        className="title-bar-session account-menu-trigger"
        title={subtitle ? `${label} · ${subtitle}` : label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="account-menu-fio">{label}</span>
        <span className="account-menu-caret" aria-hidden>▾</span>
      </button>
      {open && (
        <div className="account-menu-dropdown" role="menu">
          <button type="button" className="app-menu-item" role="menuitem" onClick={() => { setOpen(false); onOpenCabinet(); }}>
            Личный кабинет
          </button>
          <button type="button" className="app-menu-item" role="menuitem" onClick={() => { setOpen(false); onOpenPage('cabinet'); }}>
            Настройка учётной записи
          </button>
          {canOpenCrm && onOpenCrm && (
            <button type="button" className="app-menu-item" role="menuitem" onClick={() => { setOpen(false); onOpenCrm(); }}>
              Открыть CRM
            </button>
          )}
          {onOpenClientPortal && (
            <button type="button" className="app-menu-item" role="menuitem" onClick={() => { setOpen(false); onOpenClientPortal(); }}>
              Метрика:Клиент
            </button>
          )}
          <button type="button" className="app-menu-item" role="menuitem" onClick={() => { setOpen(false); onOpenPage('company'); }}>
            Компания (орг. сторона)
          </button>
          <button type="button" className="app-menu-item" role="menuitem" onClick={() => { setOpen(false); onSwitchAccount(); }}>
            Сменить учётную запись
          </button>
          <button type="button" className="app-menu-item danger" role="menuitem" onClick={() => { setOpen(false); onExit(); }}>
            Выход
          </button>
        </div>
      )}
    </div>
  );
}
