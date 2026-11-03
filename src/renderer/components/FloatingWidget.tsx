import { ReactNode, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { registerWindow, unregisterWindow, updateWindow } from '../windowRegistry';

type Props = {
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  width?: number;
  zIndex?: number;
  initialX?: number;
  initialY?: number;
  
  modal?: boolean;
  
  dockTab?: boolean;
};

export default function FloatingWidget({
  title,
  open,
  onClose,
  children,
  width = 560,
  zIndex = 1600,
  initialX,
  initialY,
  modal = false,
  dockTab = true,
}: Props) {
  const reactId = useId();
  const winId = useRef(`win-${reactId.replace(/:/g, '')}`).current;
  const [pos, setPos] = useState(() => ({
    x: initialX ?? Math.max(24, Math.round(window.innerWidth / 2 - width / 2)),
    y: initialY ?? Math.max(88, Math.round(window.innerHeight * 0.12)),
  }));
  const [minimized, setMinimized] = useState(false);
  const [z, setZ] = useState(zIndex);
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const apiRef = useRef({ onClose, zIndex, title });
  apiRef.current = { onClose, zIndex, title };

  function bringFront() {
    setZ((current) => Math.max(current, apiRef.current.zIndex) + 2);
  }

  useEffect(() => {
    if (!open) {
      setMinimized(false);
      return;
    }
    setMinimized(false);
    setPos({
      x: initialX ?? Math.max(24, Math.round(window.innerWidth / 2 - width / 2)),
      y: initialY ?? Math.max(88, Math.round(window.innerHeight * 0.12)),
    });
    setZ(zIndex + Math.floor(Date.now() % 40));
  }, [open, width, initialX, initialY, zIndex]);

  useEffect(() => {
    if (!open || !dockTab) {
      unregisterWindow(winId);
      return undefined;
    }

    registerWindow({
      id: winId,
      title: apiRef.current.title,
      minimized: false,
      restore: () => {
        setMinimized(false);
        setZ((current) => Math.max(current, apiRef.current.zIndex) + 2);
      },
      minimize: () => setMinimized(true),
      focus: () => {
        setMinimized(false);
        setZ((current) => Math.max(current, apiRef.current.zIndex) + 2);
        panelRef.current?.focus?.();
      },
      close: () => apiRef.current.onClose(),
    });

    return () => unregisterWindow(winId);
  }, [open, dockTab, winId]);

  useEffect(() => {
    if (!open || !dockTab) return;
    updateWindow(winId, { title, minimized });
  }, [open, dockTab, winId, title, minimized]);

  useEffect(() => {
    if (!open) return;
    function onMove(event: MouseEvent) {
      if (!drag.current) return;
      setPos({
        x: Math.max(8, Math.min(window.innerWidth - 80, event.clientX - drag.current.dx)),
        y: Math.max(48, Math.min(window.innerHeight - 48, event.clientY - drag.current.dy)),
      });
    }
    function onUp() { drag.current = null; }
    function onBlur() { drag.current = null; }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onBlur);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onBlur);
    };
  }, [open]);

  useEffect(() => {
    if (!open || minimized) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') apiRef.current.onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, minimized]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <>
      {modal && !minimized && (
        <div className="floating-widget-scrim" style={{ zIndex: z - 1 }} onMouseDown={() => apiRef.current.onClose()} />
      )}
      <div
        ref={panelRef}
        className={`floating-widget${minimized ? ' is-minimized' : ''}`}
        style={{
          left: pos.x,
          top: pos.y,
          width,
          zIndex: z,
          maxHeight: 'min(86vh, 900px)',
          display: minimized ? 'none' : undefined,
        }}
        role="dialog"
        aria-label={title}
        aria-hidden={minimized}
        tabIndex={-1}
        onMouseDown={(event) => {
          event.stopPropagation();
          bringFront();
        }}
      >
        <div
          className="floating-widget-bar"
          onMouseDown={(event) => {
            if ((event.target as HTMLElement).closest('button')) return;
            drag.current = { dx: event.clientX - pos.x, dy: event.clientY - pos.y };
          }}
        >
          <strong>{title}</strong>
          <div className="floating-widget-actions">
            <button type="button" className="btn btn-text" title="Скрыть во вкладку сверху" onClick={() => setMinimized(true)}>▁</button>
            <button type="button" className="btn btn-text" title="Закрыть" onClick={() => apiRef.current.onClose()}>×</button>
          </div>
        </div>
        <div className="floating-widget-body">{children}</div>
      </div>
    </>,
    document.body,
  );
}
