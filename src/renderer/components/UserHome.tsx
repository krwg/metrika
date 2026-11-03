import { useEffect, useMemo, useRef, useState } from 'react';
import { can } from '../permissions';
import { getProcedure, PROCEDURES, unifiedSearch, type ProcedureHit, type SearchHit } from '../procedureCatalog';
import { loadRecentProcedures } from '../procedureRecents';
import type { Page } from './WorkspaceChrome';
import { greetingName } from '../userProfile';

type Props = {
  session: any;
  refreshToken: number;
  onOpenPage: (page: Page) => void;
  onOpenItem: (barcode: string) => void;
  onNotice: (message: string) => void;
  onRunProcedure?: (proc: ProcedureHit) => void;
};

function greetingForHour(hour: number) {
  if (hour >= 5 && hour < 12) return 'Доброе утро';
  if (hour >= 12 && hour < 17) return 'Добрый день';
  if (hour >= 17 && hour < 23) return 'Добрый вечер';
  return 'Доброй ночи';
}

const OP_LABEL: Record<string, string> = {
  in: 'Приход',
  out: 'Расход',
  move: 'Перемещение',
};

type Tile = {
  id: string;
  label: string;
  hint: string;
  tone: string;
  icon: string;
  onClick: () => void;
};

type Group = { id: string; title: string; tiles: Tile[] };

export default function UserHome({ session, refreshToken, onOpenPage, onOpenItem, onNotice, onRunProcedure }: Props) {
  const [data, setData] = useState<any | null>(null);
  const [query, setQuery] = useState('');
  const [searchHits, setSearchHits] = useState<SearchHit[]>([]);
  const [sideTab, setSideTab] = useState<'attention' | 'recent'>('attention');
  const [recentProcIds, setRecentProcIds] = useState<string[]>([]);
  const searchRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let active = true;
    (window as any).api.getDashboardAnalytics()
      .then((result: any) => { if (active) setData(result); })
      .catch(() => { if (active) onNotice('Не удалось загрузить сводку'); });
    return () => { active = false; };
  }, [refreshToken, onNotice]);

  useEffect(() => {
    setRecentProcIds(loadRecentProcedures(session?.organization?.id));
  }, [session?.organization?.id, refreshToken, query]);

  useEffect(() => {
    const value = query.trim();
    if (value.length < 1) {
      setSearchHits([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const hits = await unifiedSearch(value);
        if (!cancelled) setSearchHits(hits);
      } catch {
        if (!cancelled) setSearchHits([]);
      }
    }, 220);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [query]);

  const name = greetingName(session?.user);
  const org = session?.organization?.name || 'Склад';
  const hello = useMemo(() => greetingForHour(new Date().getHours()), [refreshToken]);
  const low = (data?.lowStock || []).slice(0, 8);
  const recent = (data?.recent || []).slice(0, 8);
  const cellN = Number(data?.cell_count) || Number(data?.location_count) || 0;
  const occN = Number(data?.occupied_cells) || Number(data?.occupied_locations) || 0;
  const occupancy = data?.occupancy_pct != null
    ? Number(data.occupancy_pct)
    : (cellN ? Math.round((occN / cellN) * 100) : 0);
  const fillHint = Number(data?.capacity_total) > 0
    ? `${Number(data.filled_capacity || 0)} / ${Number(data.capacity_total)} вмест.`
    : (cellN > 0 ? `${occN} / ${cellN} ячеек` : (occN > 0 ? `${occN} занято` : 'нет ячеек'));

  const groups: Group[] = useMemo(() => {
    const go = (page: Page, procId?: string) => () => {
      const proc = procId ? PROCEDURES.find((p) => p.id === procId) : undefined;
      if (proc && onRunProcedure) onRunProcedure(proc);
      else onOpenPage(page);
    };
    const list: Group[] = [];

    if (can(session, 'inventory')) {
      list.push({
        id: 'in',
        title: 'Приёмка и размещение',
        tiles: [
          { id: 'receipt', label: 'Приход', hint: 'Оприходовать на ячейку', tone: 'teal', icon: '↓', onClick: go('inventory', 'receipt') },
          { id: 'pair', label: 'Размещение', hint: 'Товар + ячейка', tone: 'sage', icon: '⇄', onClick: go('inventory', 'pair') },
          { id: 'surplus', label: 'Излишки', hint: 'Акт оприходования', tone: 'amber', icon: '＋', onClick: go('inventory', 'surplus') },
        ],
      });
      list.push({
        id: 'out',
        title: 'Отгрузка, расход, перемещение',
        tiles: [
          { id: 'issue', label: 'Расход', hint: 'Списать со склада', tone: 'coral', icon: '↑', onClick: go('inventory', 'issue') },
          { id: 'writeoff', label: 'Списание', hint: 'Акт с основанием', tone: 'coral', icon: '✕', onClick: go('inventory', 'writeoff') },
          { id: 'transfer', label: 'Перемещение', hint: 'С ячейки на ячейку', tone: 'slate', icon: '⇢', onClick: go('locations', 'transfer') },
        ],
      });
      list.push({
        id: 'control',
        title: 'Контроль',
        tiles: [
          { id: 'audit', label: 'Ревизия', hint: 'Пересчёт ячейки', tone: 'slate', icon: '☰', onClick: go('inventory', 'audit') },
          { id: 'free', label: 'Быстрая ревизия', hint: 'Сканы без адреса', tone: 'amber', icon: '⌁', onClick: go('inventory', 'free-audit') },
          { id: 'undo', label: 'Отменить движение', hint: 'Сторно последней операции', tone: 'coral', icon: '↶', onClick: () => {
            const proc = PROCEDURES.find((p) => p.id === 'undo');
            if (proc && onRunProcedure) onRunProcedure(proc);
          } },
        ],
      });
    }

    const more: Tile[] = [];
    if (can(session, 'items_view')) more.push({ id: 'items', label: 'Товары', hint: 'Каталог', tone: 'amber', icon: '⌕', onClick: () => onOpenPage('items') });
    if (can(session, 'inventory')) more.push({ id: 'locations', label: 'Ячейки', hint: 'Адреса хранения', tone: 'sage', icon: '▦', onClick: () => onOpenPage('locations') });
    if (can(session, 'projects')) {
      more.push({ id: 'tsd', label: 'ТСД', hint: 'Задания сканера', tone: 'slate', icon: '▣', onClick: () => onOpenPage('tsd') });
      more.push({ id: 'projects', label: 'Проекты', hint: 'Резервы и сборка', tone: 'teal', icon: '◎', onClick: () => onOpenPage('projects') });
      more.push({ id: 'reserves', label: 'Резервы', hint: 'Регистр удержаний', tone: 'coral', icon: '▣', onClick: () => onOpenPage('reserves') });
    }
    if (can(session, 'purchases')) more.push({ id: 'po', label: 'Закупки', hint: 'Заказы поставщику', tone: 'amber', icon: '▤', onClick: () => onOpenPage('purchases') });
    if (can(session, 'replenishment')) more.push({ id: 'repl', label: 'Пополнение', hint: 'Что заказать', tone: 'coral', icon: '↻', onClick: () => onOpenPage('replenishment') });
    if (can(session, 'documents')) more.push({ id: 'docs', label: 'Документы', hint: 'Журнал', tone: 'sage', icon: '▥', onClick: () => onOpenPage('documents') });
    if (can(session, 'history_view')) more.push({ id: 'history', label: 'История', hint: 'Движения', tone: 'slate', icon: '☰', onClick: () => onOpenPage('history') });
    if (more.length) list.push({ id: 'more', title: 'Справочники и контроль', tiles: more.slice(0, 6) });
    return list;
  }, [session, onOpenPage, onRunProcedure]);

  function pickSearchHit(hit: SearchHit) {
    setQuery('');
    setSearchHits([]);
    if (hit.kind === 'procedure') {
      if (onRunProcedure) onRunProcedure(hit);
      else if (hit.page) onOpenPage(hit.page);
      onNotice(`Процедура: ${hit.name}`);
      return;
    }
    onOpenItem(hit.item.barcode || hit.item.barcodes?.[0] || String(hit.item.id));
  }

  const kpis = [
    {
      id: 'items',
      label: 'Товары',
      value: data?.item_count ?? '—',
      hint: 'в каталоге',
      warn: false,
      onClick: () => can(session, 'items_view') && onOpenPage('items'),
    },
    {
      id: 'stock',
      label: 'Остаток',
      value: data?.total_units ?? '—',
      hint: 'единиц на складе',
      warn: false,
      onClick: () => can(session, 'inventory') && onOpenPage('locations'),
    },
    {
      id: 'low',
      label: 'Ниже мин.',
      value: data?.low_stock_count ?? '—',
      hint: 'к пополнению',
      warn: Number(data?.low_stock_count) > 0,
      onClick: () => onOpenPage(can(session, 'replenishment') ? 'replenishment' : 'items'),
    },
    {
      id: 'fill',
      label: 'Заполненность',
      value: `${occupancy}%`,
      hint: fillHint,
      warn: false,
      onClick: () => can(session, 'inventory') && onOpenPage('locations'),
    },
    {
      id: 'in',
      label: 'Приход · мес.',
      value: data?.month_received ?? '—',
      hint: 'принято',
      warn: false,
      onClick: () => can(session, 'history_view') && onOpenPage('history'),
    },
    {
      id: 'out',
      label: 'Расход · мес.',
      value: data?.month_issued ?? '—',
      hint: 'списано',
      warn: false,
      onClick: () => can(session, 'history_view') && onOpenPage('history'),
    },
  ];

  return (
    <div className="arm-home arm-home-fill user-arm">
      <header className="arm-home-top">
        <div className="arm-home-greet">
          <div className="section-label">Склад · пользователь</div>
          <h1>{hello}, {name}</h1>
          <p>{org} · сводка и операции</p>
        </div>
        <div className="op-pos-search-wrap arm-user-search">
          <span className="op-pos-search-icon" aria-hidden="true">⌕</span>
          <input
            ref={searchRef}
            className="op-pos-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Товар или процедура: приход, ревизия, ТСД…"
            aria-label="Поиск товаров и процедур"
          />
          {(searchHits.length > 0 || query.trim()) && (
            <div className="op-pos-search-menu">
              {searchHits.length === 0 ? (
                <div className="op-pos-search-item" style={{ cursor: 'default' }}><span>Ничего не найдено</span></div>
              ) : searchHits.map((hit) => (
                <button key={`${hit.kind}-${hit.id}`} type="button" className="op-pos-search-item" onClick={() => pickSearchHit(hit)}>
                  <strong>
                    {hit.kind === 'procedure' ? <span className="search-hit-badge">Процедура</span> : null}
                    {hit.name}
                  </strong>
                  <span>{hit.hint}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      <section className="user-kpi-band" aria-label="Сводка склада">
        {kpis.map((kpi) => (
          <button
            key={kpi.id}
            type="button"
            className={`user-kpi-card${kpi.warn ? ' warn' : ''}`}
            onClick={kpi.onClick}
          >
            <span>{kpi.label}</span>
            <strong>{kpi.value}</strong>
            <small>{kpi.hint}</small>
          </button>
        ))}
      </section>

      {recentProcIds.length > 0 && (
        <div className="op-pos-recent" aria-label="Недавние процедуры">
          {recentProcIds.map((id) => {
            const proc = getProcedure(id);
            if (!proc) return null;
            return (
              <button
                key={id}
                type="button"
                className="op-pos-recent-chip"
                onClick={() => {
                  if (onRunProcedure) onRunProcedure(proc);
                  else if (proc.page) onOpenPage(proc.page);
                }}
              >
                {proc.name}
              </button>
            );
          })}
        </div>
      )}

      <div className="arm-home-body">
        <div className="arm-home-main op-pos-menu">
          {groups.map((group) => (
            <section key={group.id} className="arm-group">
              <div className="arm-group-head">
                <h2>{group.title}</h2>
              </div>
              <div className="op-pos-tiles">
                {group.tiles.map((tile) => (
                  <button key={tile.id} type="button" className={`op-pos-tile tone-${tile.tone}`} onClick={tile.onClick}>
                    <span className="op-pos-tile-icon" aria-hidden="true">{tile.icon}</span>
                    <strong>{tile.label}</strong>
                    <span className="op-pos-tile-hint">{tile.hint}</span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>

        <aside className="op-pos-side user-arm-side">
          <div className="user-side-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={sideTab === 'attention'}
              className={sideTab === 'attention' ? 'active' : ''}
              onClick={() => setSideTab('attention')}
            >
              Внимание
              {Number(data?.low_stock_count) > 0 ? <b>{data.low_stock_count}</b> : null}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={sideTab === 'recent'}
              className={sideTab === 'recent' ? 'active' : ''}
              onClick={() => setSideTab('recent')}
            >
              Движения
            </button>
          </div>

          {sideTab === 'attention' ? (
            <>
              <div className="op-pos-side-list">
                {low.length === 0 ? (
                  <div className="op-pos-side-empty"><p>Пополнение не требуется.</p></div>
                ) : low.map((item: any) => (
                  <button
                    key={item.id}
                    type="button"
                    className="arm-side-row"
                    onClick={() => onOpenItem(item.barcode || String(item.id))}
                  >
                    <div>
                      <strong>{item.name}</strong>
                      <span>{item.category || 'Без категории'} · мин. {item.min_stock}</span>
                    </div>
                    <b>{item.available ?? item.total_qty}</b>
                  </button>
                ))}
              </div>
              {can(session, 'projects') && Number(data?.active_projects) > 0 && (
                <button type="button" className="user-side-note" onClick={() => onOpenPage('projects')}>
                  Активных проектов: <strong>{data.active_projects}</strong>
                  {Number(data?.overdue_projects) > 0 ? ` · просрочено ${data.overdue_projects}` : ''}
                </button>
              )}
              {low.length > 0 && can(session, 'replenishment') && (
                <button type="button" className="op-pos-cta" onClick={() => onOpenPage('replenishment')}>
                  Открыть пополнение
                </button>
              )}
            </>
          ) : (
            <>
              <div className="op-pos-side-list">
                {recent.length === 0 ? (
                  <div className="op-pos-side-empty"><p>Движений пока нет.</p></div>
                ) : recent.map((row: any) => (
                  <button
                    key={row.id}
                    type="button"
                    className="arm-side-row"
                    onClick={() => can(session, 'history_view') && onOpenPage('history')}
                  >
                    <div>
                      <strong>{row.item_name || '—'}</strong>
                      <span>
                        {OP_LABEL[row.type] || row.type}
                        {row.location_name ? ` · ${row.location_name}` : ''}
                      </span>
                    </div>
                    <b className={row.type === 'out' ? 'kind-out' : 'kind-in'}>
                      {row.type === 'out' ? '−' : '+'}{row.quantity}
                    </b>
                  </button>
                ))}
              </div>
              {can(session, 'history_view') && (
                <button type="button" className="btn btn-text op-pos-clear" onClick={() => onOpenPage('history')}>
                  Вся история
                </button>
              )}
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
