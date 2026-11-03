import { useEffect, useMemo, useRef, useState } from 'react';
import { PAGE_TITLES, type Page } from './WorkspaceChrome';
import { canOpenPage } from '../permissions';
import { unifiedSearch, type ProcedureHit } from '../procedureCatalog';
import { APP_COMMANDS, type AppCommand } from '../commandCatalog';

type Props = {
  open: boolean;
  session: any;
  onClose: () => void;
  onRunProcedure: (proc: ProcedureHit) => void;
  onOpenItem: (item: any) => void;
  onOpenPage: (page: Page) => void;
};

type PaletteHit =
  | { kind: 'procedure'; proc: ProcedureHit }
  | { kind: 'item'; item: any; name: string; hint: string }
  | { kind: 'page'; page: Page; label: string };

const PAGE_ALIASES: Partial<Record<Page, string[]>> = {
  dashboard: ['главная', 'обзор', 'home'],
  items: ['товары', 'каталог', 'номенклатура'],
  categories: ['категории'],
  units: ['единицы', 'ед'],
  replenishment: ['пополнение'],
  purchases: ['закупки', 'po'],
  locations: ['хранение', 'ячейки', 'склады'],
  inventory: ['ревизия', 'склад'],
  projects: ['проекты', 'сборка'],
  reserves: ['резервы'],
  tsd: ['тсд', 'терминал'],
  abc: ['аналитика', 'abc'],
  templates: ['шаблоны'],
  history: ['история', 'ledger'],
  info: ['справка', 'помощь'],
  settings: ['настройки'],
  quality: ['качество', 'health'],
  organizations: ['организация'],
  documents: ['документы', 'журнал'],
  audit: ['аудит', 'журнал действий'],
};

function pageHits(query: string, session: any, limit = 6): PaletteHit[] {
  const q = query.trim().toLocaleLowerCase();
  const pages = (Object.keys(PAGE_TITLES) as Page[]).filter((page) => page !== 'console' && page !== 'config');
  const scored = pages.map((page) => {
    if (session && !canOpenPage(session, page)) return null;
    const label = PAGE_TITLES[page];
    const hay = [label, page, ...(PAGE_ALIASES[page] || [])].join(' ').toLocaleLowerCase();
    let score = 0;
    if (!q) score = 1;
    else if (label.toLocaleLowerCase().startsWith(q) || page.startsWith(q)) score = 100;
    else if (hay.includes(q)) score = 40;
    else return null;
    return { hit: { kind: 'page' as const, page, label }, score };
  }).filter(Boolean) as Array<{ hit: PaletteHit; score: number }>;
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const la = a.hit.kind === 'page' ? a.hit.label : '';
    const lb = b.hit.kind === 'page' ? b.hit.label : '';
    return la.localeCompare(lb, 'ru');
  });
  return scored.slice(0, limit).map((row) => row.hit);
}

function commandToProcedure(cmd: AppCommand): ProcedureHit {
  return {
    kind: 'procedure',
    id: cmd.id,
    name: cmd.label,
    hint: cmd.hint,
    aliases: cmd.aliases,
    page: cmd.page,
    inventoryTab: cmd.inventoryTab,
    stockKind: cmd.stockOp,
  };
}

export default function CommandPalette({ open, session, onClose, onRunProcedure, onOpenItem, onOpenPage }: Props) {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<PaletteHit[]>([]);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActive(0);
    const t = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const q = query.trim();
    (async () => {
      if (!q) {
        const pages = pageHits('', session, 10);
        if (!cancelled) setHits(pages);
        return;
      }
      const fromSearch = await unifiedSearch(q);
      const fromCmds = APP_COMMANDS
        .filter((cmd) => {
          if (session && !canOpenPage(session, cmd.page)) return false;
          const hay = [cmd.label, cmd.hint, ...cmd.aliases].join(' ').toLocaleLowerCase();
          return hay.includes(q.toLocaleLowerCase());
        })
        .slice(0, 6)
        .map((cmd) => ({ kind: 'procedure' as const, proc: commandToProcedure(cmd) }));
      const mapped: PaletteHit[] = [];
      const seenProc = new Set<string>();
      for (const hit of fromSearch) {
        if (hit.kind === 'item') {
          mapped.push({ kind: 'item', item: hit.item, name: hit.name, hint: hit.hint });
        } else {
          seenProc.add(hit.id);
          mapped.push({ kind: 'procedure', proc: hit });
        }
      }
      for (const row of fromCmds) {
        if (seenProc.has(row.proc.id) || seenProc.has(row.proc.name)) continue;
        seenProc.add(row.proc.id);
        mapped.push(row);
      }
      for (const page of pageHits(q, session, 5)) {
        if (mapped.some((h) => h.kind === 'page' && h.page === (page as any).page)) continue;
        mapped.push(page);
      }
      if (!cancelled) {
        setHits(mapped.slice(0, 16));
        setActive(0);
      }
    })().catch(() => { if (!cancelled) setHits([]); });
    return () => { cancelled = true; };
  }, [open, query, session]);

  const labelFor = useMemo(() => (hit: PaletteHit) => {
    if (hit.kind === 'item') return hit.name;
    if (hit.kind === 'page') return hit.label;
    return hit.proc.name;
  }, []);

  const hintFor = (hit: PaletteHit) => {
    if (hit.kind === 'item') return hit.hint;
    if (hit.kind === 'page') return 'Раздел';
    return hit.proc.hint;
  };

  function run(hit: PaletteHit) {
    if (hit.kind === 'item') onOpenItem(hit.item);
    else if (hit.kind === 'page') onOpenPage(hit.page);
    else onRunProcedure(hit.proc);
    onClose();
  }

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(hits.length - 1, i + 1)); }
      if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
      if (e.key === 'Enter' && hits[active]) { e.preventDefault(); run(hits[active]); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, hits, active, onClose]);

  if (!open) return null;

  return (
    <div className="command-palette-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="command-palette" role="dialog" aria-label="Командная палитра">
        <input
          ref={inputRef}
          className="command-palette-input"
          placeholder="Команда, раздел или товар… (Ctrl+K)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="command-palette-list">
          {hits.length === 0 && <div className="command-palette-empty">Ничего не найдено</div>}
          {hits.map((hit, index) => (
            <button
              key={`${hit.kind}-${hit.kind === 'item' ? hit.item.id : hit.kind === 'page' ? hit.page : hit.proc.id}-${index}`}
              type="button"
              className={`command-palette-row${index === active ? ' is-active' : ''}`}
              onMouseEnter={() => setActive(index)}
              onClick={() => run(hit)}
            >
              <span className="command-palette-kind">
                {hit.kind === 'item' ? 'Товар' : hit.kind === 'page' ? 'Раздел' : 'Команда'}
              </span>
              <span className="command-palette-main">
                <strong>{labelFor(hit)}</strong>
                <small>{hintFor(hit)}</small>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
