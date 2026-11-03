import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { pageTitle, useI18n } from '../i18n';
import { getWindowsVersion, listWindows, subscribeWindows } from '../windowRegistry';
import { unifiedSearch, type ProcedureHit, type SearchHit } from '../procedureCatalog';
import ContextMenu, { type ContextMenuItem } from './ContextMenu';

export type KnownPage =
  | 'dashboard' | 'items' | 'categories' | 'units' | 'replenishment' | 'purchases' | 'locations'
  | 'inventory' | 'projects' | 'reserves' | 'tsd' | 'abc' | 'templates' | 'history' | 'info' | 'settings' | 'quality'
  | 'console' | 'organizations' | 'documents' | 'audit' | 'config'
  | 'cabinet' | 'employees' | 'edo' | 'company' | 'assets' | 'parties';

export type Page = KnownPage | (string & {});

export const PAGE_TITLES: Record<string, string> = {
  dashboard: 'Обзор',
  items: 'Товары',
  categories: 'Категории',
  units: 'Единицы',
  replenishment: 'Пополнение',
  purchases: 'Закупки',
  locations: 'Хранение',
  inventory: 'Ревизия',
  projects: 'Проекты',
  reserves: 'Резервы',
  tsd: 'Терминал сбора',
  abc: 'Аналитика',
  templates: 'Шаблоны',
  history: 'История',
  info: 'Информация',
  settings: 'Настройки',
  quality: 'Качество',
  console: 'Командная строка',
  organizations: 'Организация',
  documents: 'Журнал документов',
  audit: 'Журнал действий',
  config: 'Редактор',
  cabinet: 'Личный кабинет',
  employees: 'Сотрудники',
  edo: 'ЭДО',
  company: 'Компания (УНФ)',
  assets: 'Оборудование / ОС',
  parties: 'Единый справочник лиц',
};

export function resolvePageTitle(page: string, customLabels?: Record<string, string>) {
  if (customLabels?.[page]) return customLabels[page];
  if (PAGE_TITLES[page]) return PAGE_TITLES[page];
  if (page.startsWith('custom_')) return customLabels?.[page] || page.replace(/^custom_/, 'Форма ');
  return page;
}

export type WorkspaceTab = { id: string; page: Page; title: string };

type Props = {
  tabs: WorkspaceTab[];
  activeTabId: string;
  onActivate: (tabId: string) => void;
  onClose: (tabId: string) => void;
  onCloseOthers?: (tabId: string) => void;
  onCloseAll?: () => void;
  onCloseToRight?: (tabId: string) => void;
  onCloseToLeft?: (tabId: string) => void;
  onDetachTab?: (tabId: string) => void;
  onOpenPage: (page: Page) => void;
  favorites: Page[];
  recent: Page[];
  onToggleFavorite: (page: Page) => void;
  onSearchSelect: (item: any) => void;
  onSearchProcedure?: (proc: ProcedureHit) => void;
  onClearRecent?: () => void;
  splitPage?: Page | null;
  onPickSplit?: (page: Page) => void;
  onClearSplit?: () => void;
  onOpenCrm?: () => void;
  canOpenCrm?: boolean;

  detached?: boolean;
};

type CtxState = { x: number; y: number; kind: 'tab' | 'strip' | 'split'; tabId?: string } | null;

export default function WorkspaceChrome({
  tabs,
  activeTabId,
  onActivate,
  onClose,
  onCloseOthers,
  onCloseAll,
  onCloseToRight,
  onCloseToLeft,
  onDetachTab,
  onOpenPage,
  favorites,
  recent,
  onToggleFavorite,
  onSearchSelect,
  onSearchProcedure,
  onClearRecent,
  splitPage = null,
  onPickSplit,
  onClearSplit,
  onOpenCrm,
  canOpenCrm = false,
  detached = false,
}: Props) {
  const { t, locale } = useI18n();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchHit[]>([]);
  const [menu, setMenu] = useState<'none' | 'recent' | 'favorites' | 'search' | 'split'>('none');
  const [ctx, setCtx] = useState<CtxState>(null);
  const windowsVersion = useSyncExternalStore(subscribeWindows, getWindowsVersion, getWindowsVersion);
  const windowTabs = useMemo(() => listWindows(), [windowsVersion]);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const active = tabs.find((tab) => tab.id === activeTabId);
  const isRu = locale !== 'en';

  useEffect(() => {
    function onDocClick(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setMenu('none');
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  useEffect(() => {
    const value = query.trim();
    if (value.length < 1) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const hits = await unifiedSearch(value);
        if (cancelled) return;
        setResults(hits);
        setMenu('search');
      } catch {
        if (!cancelled) setResults([]);
      }
    }, 220);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [query]);

  const favoriteSet = useMemo(() => new Set(favorites), [favorites]);

  const ctxItems: ContextMenuItem[] = useMemo(() => {
    if (!ctx) return [];
    if (ctx.kind === 'split') {
      const items: ContextMenuItem[] = tabs
        .filter((tab) => tab.id !== activeTabId)
        .map((tab) => ({
          id: `split:${tab.page}`,
          label: isRu ? `Справа: ${pageTitle(tab.page, t)}` : `Right: ${pageTitle(tab.page, t)}`,
        }));
      if (splitPage) {
        items.push({ id: 'sep', label: '', separator: true });
        items.push({ id: 'split-clear', label: isRu ? 'Закрыть разделение' : 'Clear split' });
      }
      return items.length ? items : [{ id: 'noop', label: isRu ? 'Нет других вкладок' : 'No other tabs', disabled: true }];
    }
    if (ctx.kind === 'strip') {
      if (detached) {
        return [
          { id: 'close', label: isRu ? 'Закрыть окно' : 'Close window' },
          { id: 'reload-hint', label: isRu ? 'Обновить данные раздела' : 'Refresh section' },
        ];
      }
      return [
        { id: 'close-all', label: isRu ? 'Закрыть все вкладки' : 'Close all tabs', disabled: tabs.length <= 1 },
        { id: 'sep1', label: '', separator: true },
        { id: 'open-crm', label: isRu ? 'Открыть CRM' : 'Open CRM', disabled: !canOpenCrm },
        { id: 'split-menu', label: isRu ? 'Разделить экран…' : 'Split screen…' },
      ];
    }
    const tabId = ctx.tabId || activeTabId;
    const index = tabs.findIndex((tab) => tab.id === tabId);
    const tab = tabs[index];
    if (detached) {
      return [
        { id: 'close', label: isRu ? 'Закрыть окно' : 'Close window' },
        { id: 'sep1', label: '', separator: true },
        { id: 'reload-hint', label: isRu ? 'Обновить данные раздела' : 'Refresh section' },
      ];
    }
    return [
      { id: 'close', label: isRu ? 'Закрыть' : 'Close', disabled: tabs.length <= 1 },
      { id: 'close-others', label: isRu ? 'Закрыть другие' : 'Close others', disabled: tabs.length <= 1 },
      { id: 'close-all', label: isRu ? 'Закрыть все' : 'Close all', disabled: tabs.length <= 1 },
      { id: 'sep1', label: '', separator: true },
      { id: 'close-left', label: isRu ? 'Закрыть слева' : 'Close to the left', disabled: index <= 0 },
      { id: 'close-right', label: isRu ? 'Закрыть справа' : 'Close to the right', disabled: index < 0 || index >= tabs.length - 1 },
      { id: 'sep2', label: '', separator: true },
      {
        id: 'detach',
        label: isRu ? 'Открыть в отдельном окне' : 'Open in separate window',
        disabled: !tab || !onDetachTab,
      },
      {
        id: 'favorite',
        label: tab && favoriteSet.has(tab.page)
          ? (isRu ? 'Убрать из избранного' : 'Remove favorite')
          : (isRu ? 'В избранное' : 'Add to favorites'),
      },
      {
        id: 'split-with',
        label: isRu ? 'Открыть справа (разделение)' : 'Open on the right (split)',
        disabled: !tab || tab.id === activeTabId,
      },
      { id: 'sep3', label: '', separator: true },
      { id: 'reload-hint', label: isRu ? 'Обновить данные раздела' : 'Refresh section', disabled: false },
    ];
  }, [ctx, tabs, activeTabId, splitPage, canOpenCrm, favoriteSet, isRu, t, detached, onDetachTab]);

  function runCtx(id: string) {
    const tabId = ctx?.tabId || activeTabId;
    const tab = tabs.find((row) => row.id === tabId);
    if (id.startsWith('split:')) {
      const page = id.slice(6) as Page;
      onPickSplit?.(page);
      return;
    }
    switch (id) {
      case 'close':
        onClose(tabId);
        break;
      case 'close-others':
        onCloseOthers?.(tabId);
        break;
      case 'close-all':
        onCloseAll?.();
        break;
      case 'close-left':
        onCloseToLeft?.(tabId);
        break;
      case 'close-right':
        onCloseToRight?.(tabId);
        break;
      case 'detach':
        onDetachTab?.(tabId);
        break;
      case 'favorite':
        if (tab) onToggleFavorite(tab.page);
        break;
      case 'split-with':
        if (tab) onPickSplit?.(tab.page);
        break;
      case 'split-clear':
        onClearSplit?.();
        break;
      case 'open-crm':
        onOpenCrm?.();
        break;
      case 'split-menu':
        setMenu('split');
        break;
      case 'reload-hint':
        window.dispatchEvent(new CustomEvent('metrika:refresh-section'));
        break;
      default:
        break;
    }
  }

  return (
    <div className="workspace-chrome" ref={rootRef}>
      <div
        className="workspace-tabs"
        role="tablist"
        aria-label={isRu ? 'Открытые разделы и окна' : 'Open sections'}
        onContextMenu={(event) => {
          if ((event.target as HTMLElement).closest('.workspace-tab')) return;
          event.preventDefault();
          setCtx({ x: event.clientX, y: event.clientY, kind: 'strip' });
        }}
      >
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`workspace-tab ${tab.id === activeTabId ? 'active' : ''}${splitPage === tab.page ? ' is-split-side' : ''}`}
            role="tab"
            aria-selected={tab.id === activeTabId}
            onClick={() => onActivate(tab.id)}
            onContextMenu={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setCtx({ x: event.clientX, y: event.clientY, kind: 'tab', tabId: tab.id });
            }}
            onMouseDown={(event) => {
              if (event.button === 1) {
                event.preventDefault();
                onClose(tab.id);
              }
            }}
          >
            <span className="workspace-tab-title">{pageTitle(tab.page, t)}</span>
            {tabs.length > 1 && (
              <button
                type="button"
                className="workspace-tab-close"
                title={isRu ? 'Закрыть' : 'Close'}
                onClick={(event) => { event.stopPropagation(); onClose(tab.id); }}
              >
                ×
              </button>
            )}
          </div>
        ))}

        {windowTabs.length > 0 && <span className="workspace-tabs-sep" aria-hidden="true" />}

        {windowTabs.map((win) => (
          <div
            key={win.id}
            className={`workspace-tab workspace-window-tab ${win.minimized ? 'is-hidden' : 'active'}`}
            role="tab"
            title={win.minimized ? `${win.title} (${isRu ? 'скрыто' : 'hidden'})` : win.title}
            onClick={() => (win.minimized ? win.restore() : win.focus())}
            onContextMenu={(event) => {
              event.preventDefault();
              setCtx({
                x: event.clientX,
                y: event.clientY,
                kind: 'strip',
              });
            }}
            onMouseDown={(event) => {
              if (event.button === 1) {
                event.preventDefault();
                win.close();
              }
            }}
          >
            <span className="workspace-tab-title">{win.title}</span>
            {win.minimized && <span className="workspace-tab-badge">{isRu ? 'скрыто' : 'hidden'}</span>}
            <button
              type="button"
              className="workspace-tab-close"
              title={isRu ? 'Закрыть окно' : 'Close window'}
              onClick={(event) => { event.stopPropagation(); win.close(); }}
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <div className="workspace-tools">
        <div className="workspace-search">
          <input
            aria-label={isRu ? 'Глобальный поиск' : 'Global search'}
            placeholder={isRu ? 'Товар, ревизия, расход, списание…' : 'Item, stocktake, issue…'}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onFocus={() => { if (results.length || query.trim()) setMenu('search'); }}
          />
          {menu === 'search' && (results.length > 0 || query.trim()) && (
            <div className="workspace-menu">
              {results.length === 0 ? (
                <div className="workspace-menu-empty">{isRu ? 'Ничего не найдено' : 'Nothing found'}</div>
              ) : results.map((hit) => (
                <button
                  key={`${hit.kind}-${hit.id}`}
                  type="button"
                  className={`workspace-menu-item ${hit.kind === 'procedure' ? 'is-procedure' : ''}`}
                  onClick={() => {
                    if (hit.kind === 'procedure') {
                      onSearchProcedure?.(hit);
                    } else {
                      onSearchSelect(hit.item);
                      onOpenPage('items');
                    }
                    setQuery('');
                    setResults([]);
                    setMenu('none');
                  }}
                >
                  <strong>
                    {hit.kind === 'procedure' ? <span className="search-hit-badge">{isRu ? 'Процедура' : 'Procedure'}</span> : null}
                    {hit.name}
                  </strong>
                  <span>{hit.hint}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <button type="button" className={`btn btn-text ${menu === 'recent' ? 'active' : ''}`} onClick={() => setMenu(menu === 'recent' ? 'none' : 'recent')}>
          {t('recent')}
        </button>
        <button type="button" className={`btn btn-text ${menu === 'favorites' ? 'active' : ''}`} onClick={() => setMenu(menu === 'favorites' ? 'none' : 'favorites')}>
          {t('favorites')}
        </button>
        {active && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => onToggleFavorite(active.page)}
            title={favoriteSet.has(active.page) ? t('inFavorites') : t('addFavorite')}
          >
            {favoriteSet.has(active.page) ? t('inFavorites') : t('addFavorite')}
          </button>
        )}

        <div className="workspace-split-wrap">
          <button
            type="button"
            className={`btn btn-secondary${splitPage || menu === 'split' ? ' active' : ''}`}
            onClick={() => setMenu(menu === 'split' ? 'none' : 'split')}
            onContextMenu={(event) => {
              event.preventDefault();
              setCtx({ x: event.clientX, y: event.clientY, kind: 'split' });
            }}
            title={splitPage
              ? (isRu ? `Разделение: ${pageTitle(splitPage, t)}` : `Split: ${pageTitle(splitPage, t)}`)
              : (isRu ? 'Разделить экран — выбрать вкладку справа' : 'Split screen — pick right tab')}
          >
            {isRu ? (splitPage ? 'Разделение' : 'Разделить') : (splitPage ? 'Split on' : 'Split')}
          </button>
          {menu === 'split' && (
            <div className="workspace-menu workspace-menu-fixed">
              <div className="workspace-menu-empty">
                {isRu ? 'Какой раздел открыть справа?' : 'Which section on the right?'}
              </div>
              {tabs.filter((tab) => tab.id !== activeTabId).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className="workspace-menu-item"
                  onClick={() => {
                    onPickSplit?.(tab.page);
                    setMenu('none');
                  }}
                >
                  <strong>{pageTitle(tab.page, t)}</strong>
                </button>
              ))}
              {tabs.filter((tab) => tab.id !== activeTabId).length === 0 && (
                <div className="workspace-menu-empty">
                  {isRu ? 'Откройте ещё одну вкладку, затем разделите экран' : 'Open another tab first'}
                </div>
              )}
              {splitPage && (
                <button
                  type="button"
                  className="workspace-menu-item workspace-menu-clear"
                  onClick={() => { onClearSplit?.(); setMenu('none'); }}
                >
                  <strong>{isRu ? 'Закрыть разделение' : 'Clear split'}</strong>
                </button>
              )}
            </div>
          )}
        </div>

        {splitPage && onClearSplit && (
          <button type="button" className="btn btn-text" onClick={() => onClearSplit()} title={isRu ? 'Закрыть вторую панель' : 'Close split pane'}>
            {isRu ? 'Снять разделение' : 'Clear split'}
          </button>
        )}
        {canOpenCrm && onOpenCrm && (
          <button type="button" className="btn btn-secondary" onClick={() => onOpenCrm()} title={isRu ? 'Открыть клиентское окно CRM' : 'Open CRM window'}>
            CRM
          </button>
        )}

        {menu === 'recent' && (
          <div className="workspace-menu workspace-menu-fixed">
            {recent.length === 0 ? <div className="workspace-menu-empty">{isRu ? 'Пока пусто' : 'Empty'}</div> : recent.map((page) => (
              <button key={page} type="button" className="workspace-menu-item" onClick={() => { onOpenPage(page); setMenu('none'); }}>
                <strong>{pageTitle(page, t)}</strong>
              </button>
            ))}
            {recent.length > 0 && onClearRecent && (
              <button type="button" className="workspace-menu-item workspace-menu-clear" onClick={() => { onClearRecent(); setMenu('none'); }}>
                <strong>{isRu ? 'Очистить недавние' : 'Clear recent'}</strong>
              </button>
            )}
          </div>
        )}
        {menu === 'favorites' && (
          <div className="workspace-menu workspace-menu-fixed">
            {favorites.length === 0 ? <div className="workspace-menu-empty">{isRu ? 'Добавьте разделы в избранное' : 'Add favorites'}</div> : favorites.map((page) => (
              <button key={page} type="button" className="workspace-menu-item" onClick={() => { onOpenPage(page); setMenu('none'); }}>
                <strong>{pageTitle(page, t)}</strong>
              </button>
            ))}
          </div>
        )}
      </div>

      {ctx && ctxItems.length > 0 && (
        <ContextMenu
          x={ctx.x}
          y={ctx.y}
          items={ctxItems}
          onClose={() => setCtx(null)}
          onSelect={runCtx}
        />
      )}
    </div>
  );
}
