import { useEffect, useRef, useState } from 'react';

export default function PhotoLightbox({ src, alt, onClose }: { src: string; alt?: string; onClose: () => void }) {
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  useEffect(() => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }, [src]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
      if (event.key === '+' || event.key === '=') setZoom((z) => Math.min(4, Number((z + 0.25).toFixed(2))));
      if (event.key === '-' || event.key === '_') {
        setZoom((z) => {
          const next = Math.max(1, Number((z - 0.25).toFixed(2)));
          if (next === 1) setOffset({ x: 0, y: 0 });
          return next;
        });
      }
      if (event.key === '0') { setZoom(1); setOffset({ x: 0, y: 0 }); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function bumpZoom(delta: number) {
    setZoom((z) => {
      const next = Math.min(4, Math.max(1, Number((z + delta).toFixed(2))));
      if (next === 1) setOffset({ x: 0, y: 0 });
      return next;
    });
  }

  return (
    <div className="photo-lightbox" onMouseDown={onClose} role="dialog" aria-modal="true" aria-label="Просмотр фото">
      <div
        className="photo-lightbox-frame"
        onMouseDown={(event) => event.stopPropagation()}
        onWheel={(event) => {
          event.preventDefault();
          bumpZoom(event.deltaY < 0 ? 0.2 : -0.2);
        }}
      >
        <div className="photo-lightbox-toolbar">
          <button type="button" className="photo-lightbox-tool" onClick={() => bumpZoom(-0.25)} title="Уменьшить (−)">−</button>
          <span className="photo-lightbox-zoom">{Math.round(zoom * 100)}%</span>
          <button type="button" className="photo-lightbox-tool" onClick={() => bumpZoom(0.25)} title="Увеличить (+)">+</button>
          <button type="button" className="photo-lightbox-tool" onClick={() => { setZoom(1); setOffset({ x: 0, y: 0 }); }} title="Сброс">1:1</button>
          <button type="button" className="photo-lightbox-close" onClick={onClose} title="Закрыть">×</button>
        </div>
        <div
          className={`photo-lightbox-stage ${zoom > 1 ? 'is-zoom' : ''}`}
          onDoubleClick={() => {
            if (zoom > 1) { setZoom(1); setOffset({ x: 0, y: 0 }); }
            else setZoom(2);
          }}
          onMouseDown={(event) => {
            if (zoom <= 1) return;
            drag.current = { x: event.clientX, y: event.clientY, ox: offset.x, oy: offset.y };
            const onMove = (move: MouseEvent) => {
              if (!drag.current) return;
              setOffset({
                x: drag.current.ox + (move.clientX - drag.current.x),
                y: drag.current.oy + (move.clientY - drag.current.y),
              });
            };
            const onUp = () => {
              drag.current = null;
              window.removeEventListener('mousemove', onMove);
              window.removeEventListener('mouseup', onUp);
            };
            window.addEventListener('mousemove', onMove);
            window.addEventListener('mouseup', onUp);
          }}
        >
          <img
            src={src}
            alt={alt || 'Фото товара'}
            draggable={false}
            style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})` }}
          />
        </div>
      </div>
    </div>
  );
}
