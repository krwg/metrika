import { useEffect, useMemo } from 'react';

export type AppNotification = {
  id: string;
  text: string;
  at: string;
  read: boolean;
  level?: 'info' | 'warn' | 'error';
};

const STORAGE_KEY = 'metrika.notifications.v1';
const MAX = 80;

export function loadNotifications(): AppNotification[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.slice(0, MAX) : [];
  } catch {
    return [];
  }
}

export function saveNotifications(rows: AppNotification[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rows.slice(0, MAX)));
  } catch {  }
}

export function pushNotification(
  current: AppNotification[],
  text: string,
  level: AppNotification['level'] = 'info',
): AppNotification[] {
  const trimmed = String(text || '').trim();
  if (!trimmed) return current;
  const next: AppNotification = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    text: trimmed,
    at: new Date().toISOString(),
    read: false,
    level,
  };
  const rows = [next, ...current].slice(0, MAX);
  saveNotifications(rows);
  return rows;
}

type Props = {
  items: AppNotification[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onClear: () => void;
  onMarkRead: () => void;
};

export default function NotificationCenter({ items, open, onOpenChange, onClear, onMarkRead }: Props) {
  const unread = useMemo(() => items.filter((row) => !row.read).length, [items]);

  useEffect(() => {
    if (open) onMarkRead();
  }, [open, onMarkRead]);

  return (
    <div className="notif-root">
      <button
        type="button"
        className={`notif-bell${unread ? ' has-unread' : ''}${open ? ' open' : ''}`}
        aria-label="Уведомления"
        title="Уведомления"
        onClick={() => onOpenChange(!open)}
      >
        <span aria-hidden="true">🔔</span>
        {unread > 0 && <b>{unread > 99 ? '99+' : unread}</b>}
      </button>
      {open && (
        <>
          <button type="button" className="notif-backdrop" aria-label="Закрыть" onClick={() => onOpenChange(false)} />
          <aside className="notif-panel" role="dialog" aria-label="Центр уведомлений">
            <div className="notif-panel-head">
              <h2>Уведомления</h2>
              <span>{items.length ? `${items.length}` : 'пусто'}</span>
            </div>
            <div className="notif-panel-list">
              {items.length === 0 ? (
                <div className="notif-empty">Пока нет уведомлений. Сюда попадут сообщения о операциях, ошибках и печати.</div>
              ) : (
                items.map((row) => (
                  <article key={row.id} className={`notif-item level-${row.level || 'info'}${row.read ? '' : ' unread'}`}>
                    <p>{row.text}</p>
                    <time dateTime={row.at}>
                      {new Date(row.at).toLocaleString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </time>
                  </article>
                ))
              )}
            </div>
            <div className="notif-panel-foot">
              <button type="button" className="btn btn-secondary" disabled={!items.length} onClick={onClear}>
                Очистить
              </button>
            </div>
          </aside>
        </>
      )}
    </div>
  );
}
