import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import NotificationCenter, { loadNotifications, pushNotification, saveNotifications, type AppNotification } from './components/NotificationCenter';
import ItemsTable from './components/ItemsTable';
import ScannerPanel, { ScanMode } from './components/ScannerPanel';
import LocationsPage from './components/LocationsPage';
import HistoryPage from './components/HistoryPage';
import InventoryPage from './components/InventoryPage';
import SettingsPage from './components/SettingsPage';
import ProjectsPage from './components/ProjectsPage';
import TsdPage from './components/TsdPage';
import AbcPage from './components/AbcPage';
import TemplatesPage from './components/TemplatesPage';
import CategoriesPage from './components/CategoriesPage';
import InfoPage from './components/InfoPage';
import ReplenishmentPage from './components/ReplenishmentPage';
import PurchasesPage from './components/PurchasesPage';
import UnitsPage from './components/UnitsPage';
import QualityPage from './components/QualityPage';
import ConsoleDock from './components/ConsoleDock';
import LauncherPage from './components/LauncherPage';
import OrganizationsPage from './components/OrganizationsPage';
import DocumentsPage from './components/DocumentsPage';
import AuditPage from './components/AuditPage';
import OperatorShell from './components/OperatorShell';
import ReservesPage from './components/ReservesPage';
import UserHome from './components/UserHome';
import AppMenu from './components/AppMenu';
import AccountMenu from './components/AccountMenu';
import CabinetPage from './components/CabinetPage';
import EmployeesPage from './components/EmployeesPage';
import EdoPage from './components/EdoPage';
import CompanyUnfPage from './components/CompanyUnfPage';
import PartiesPage from './components/PartiesPage';
import AssetsPage from './components/AssetsPage';
import ConfiguratorShell from './components/ConfiguratorShell';
import CrmShell from './components/CrmShell';
import ClientPortalShell from './components/ClientPortalShell';
import CustomFormPage, { isCustomFormPage, customFormCodeFromPage } from './components/CustomFormPage';
import WorkspaceChrome, { PAGE_TITLES, Page, WorkspaceTab, resolvePageTitle } from './components/WorkspaceChrome';
import FloatingWidget from './components/FloatingWidget';
import ItemDialog from './components/ItemDialog';
import CommandPalette from './components/CommandPalette';
import { useI18n } from './i18n';
import { can, canOpenPage, isAdmin, isOperator, isUser } from './permissions';
import type { ProcedureHit } from './procedureCatalog';
import { pushRecentProcedure } from './procedureRecents';
import { fullName } from './userProfile';
import { notifyCurrencyChanged } from './currency';

function looksLikeAppError(message: string) {
  return /не удалось|ошибк|недостаточно|не найден|отклон|нельзя|запрещ|failed|error|invalid|denied/i.test(String(message || ''));
}

const ALLOWED_THEMES = new Set(['light', 'dark', 'oled', 'aurora', '1c-light', '1c-dark']);
const THEME_ALIASES: Record<string, string> = {
  graphite: 'dark',
};

function makeTab(page: Page, titleOverride?: string): WorkspaceTab {
  return { id: page, page, title: titleOverride || resolvePageTitle(page) };
}

function PagePane({
  active,
  splitRole,
  children,
}: {
  active: boolean;
  splitRole?: 'primary' | 'secondary' | null;
  children: ReactNode;
}) {
  const roleClass = splitRole === 'primary' ? ' is-split-primary' : splitRole === 'secondary' ? ' is-split-secondary' : '';
  return (
    <div
      className={`page-pane${active ? ' is-active' : ''}${roleClass}`}
      hidden={!active}
      aria-hidden={!active}
    >
      {children}
    </div>
  );
}

function paneRole(pageId: Page, primary: Page, secondary: Page | null): 'primary' | 'secondary' | null {
  if (secondary && pageId === secondary) return 'secondary';
  if (pageId === primary) return 'primary';
  return null;
}

function parseDetachedPageFromHash(hash: string): Page | null {
  const m = String(hash || '').match(/#detached\/([a-z][a-z0-9_]{0,63})\b/i);
  if (!m) return null;
  return decodeURIComponent(m[1]) as Page;
}

export default function App() {
  const hash = typeof window !== 'undefined' ? (window.location.hash || '') : '';
  if (/#configurator\b/.test(hash)) return <ConfiguratorShell />;
  if (/#crm\b/.test(hash)) return <CrmShell />;
  if (/#client\b/.test(hash)) return <ClientPortalShell />;
  const detachedPage = parseDetachedPageFromHash(hash);
  if (detachedPage) return <WorkspaceApp detachedPage={detachedPage} />;
  return <WorkspaceApp />;
}

function WorkspaceApp({ detachedPage }: { detachedPage?: Page } = {}) {
  const { t, locale } = useI18n();
  const isDetached = Boolean(detachedPage);
  const [tabs, setTabs] = useState<WorkspaceTab[]>([makeTab(detachedPage || 'dashboard')]);
  const [activeTabId, setActiveTabId] = useState(String(detachedPage || 'dashboard'));
  const page = (tabs.find((tab) => tab.id === activeTabId)?.page || detachedPage || 'dashboard') as Page;
  const openPages = useMemo(() => new Set(tabs.map((tab) => tab.page)), [tabs]);
  const [refreshToken, setRefreshToken] = useState(0);
  const [itemDialog, setItemDialog] = useState<{ item?: any; barcode?: string; receipt?: boolean } | null>(null);
  const [locationDialog, setLocationDialog] = useState<any | null>(null);
  const [inventoryFocus, setInventoryFocus] = useState<'cell' | 'free' | 'ops' | null>(null);
  const [historyFocusType, setHistoryFocusType] = useState<string | null>(null);
  const [purchaseFocusId, setPurchaseFocusId] = useState<number | null>(null);
  const [projectFocusId, setProjectFocusId] = useState<number | null>(null);
  const [inventoryStockKind, setInventoryStockKind] = useState<'writeoff' | 'surplus' | 'regrade' | 'disassemble' | 'assemble' | null>(null);
  const [locationContents, setLocationContents] = useState<any | null>(null);
  const [batchCart, setBatchCart] = useState<any[]>([]);
  const [inventorySessionId, setInventorySessionId] = useState<number | null>(null);
  const [taskId, setTaskId] = useState<number | null>(null);
  const [notice, setNoticeState] = useState('');
  const [notifications, setNotifications] = useState<AppNotification[]>(() => loadNotifications());
  const [notifOpen, setNotifOpen] = useState(false);
  const [pairStatus, setPairStatus] = useState('');
  const [stocktakeCart, setStocktakeCart] = useState<any[]>([]);
  const pairPendingRef = useRef<{ kind: 'item' | 'location'; value: any } | null>(null);
  const pairQueueRef = useRef<Promise<void>>(Promise.resolve());
  const [theme, setTheme] = useState('light');
  const [favorites, setFavorites] = useState<Page[]>([]);
  const [recent, setRecent] = useState<Page[]>(['dashboard']);
  const [importTrigger, setImportTrigger] = useState(0);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [session, setSession] = useState<any | null>(null);
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [consoleHeight, setConsoleHeight] = useState(260);
  const [navOpen, setNavOpen] = useState(false);
  const [operatorCabinet, setOperatorCabinet] = useState(false);
  const [splitPage, setSplitPage] = useState<Page | null>(null);
  const [splitRatio, setSplitRatio] = useState(0.55);
  const [appErrors, setAppErrors] = useState<Array<{ id: number; level: 'error' | 'warn'; text: string; at: string }>>([]);
  const appErrorId = useRef(1);
  const setNotice = useCallback((message: string) => {
    const text = String(message || '').trim();
    setNoticeState(text);
    if (!text) return;
    const level = looksLikeAppError(text)
      ? (/недостаточно|запрещ|denied/i.test(text) ? 'warn' : 'error')
      : 'info';
    setNotifications((current) => pushNotification(current, text, level));
    if (level === 'error' || level === 'warn') {
      void (window as any).api?.logClientEvent?.({ level, text }).catch(() => {});
    }
  }, []);

  const clearNotifications = useCallback(() => {
    setNotifications([]);
    saveNotifications([]);
  }, []);

  const markNotificationsRead = useCallback(() => {
    setNotifications((current) => {
      const next = current.map((row) => (row.read ? row : { ...row, read: true }));
      saveNotifications(next);
      return next;
    });
  }, []);

  const refresh = () => setRefreshToken((value) => value + 1);
  const lastSoftRefresh = useRef(0);
  const softRefresh = useCallback(() => {
    const now = Date.now();
    if (now - lastSoftRefresh.current < 800) return;
    lastSoftRefresh.current = now;
    setRefreshToken((value) => value + 1);
  }, []);

  useEffect(() => {
    const off = (window as any).api.onDataChanged?.(() => softRefresh());
    const onFocus = () => softRefresh();
    const onVis = () => {
      if (document.visibilityState === 'visible') softRefresh();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      try { off?.(); } catch {  }
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [softRefresh]);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    (async () => {
      try {
        const inbox = await (window as any).api.listEdoDocuments?.({ inbox: true });
        if (!cancelled && Array.isArray(inbox) && inbox.length) {
          setNotifications((current) => {
            let next = current;
            for (const doc of inbox) {
              const text = `ЭДО на подпись: ${doc.doc_no} · ${doc.title}`;
              if (next.some((n) => n.text === text && !n.read)) continue;
              next = pushNotification(next, text, 'warn');
            }
            return next;
          });
        }
      } catch {  }
      try {
        const rows = await (window as any).api.listAppNotifications?.(60);
        if (cancelled || !Array.isArray(rows) || !rows.length) return;
        setNotifications((current) => {
          let next = current;
          for (const row of rows) {
            if (!row?.text) continue;
            if (next.some((n) => n.id === String(row.id) || (n.text === row.text && n.at === row.at))) continue;
            next = [{
              id: String(row.id),
              text: row.text,
              at: row.at || new Date().toISOString(),
              read: Boolean(row.read),
              level: row.level || 'info',
            }, ...next].slice(0, 80);
          }
          saveNotifications(next);
          return next;
        });
      } catch {  }
    })();
    return () => { cancelled = true; };
  }, [session?.user?.id, refreshToken]);

  const pushAppError = useCallback((message: string, level: 'error' | 'warn' = 'error') => {
    const text = String(message || '').trim();
    if (!text) return;
    setAppErrors((current) => [...current.slice(-200), {
      id: appErrorId.current++,
      level,
      text,
      at: new Date().toLocaleTimeString('ru-RU'),
    }]);
    void (window as any).api?.logClientEvent?.({ level, text }).catch(() => {});
  }, []);

  useEffect(() => {
    (window as any).api.getAuthSession?.().then((value: any) => {
      if (value) {
        setSession(value);
        notifyCurrencyChanged();
      }
    }).catch(() => {});
  }, [refreshToken]);

  const scannerPages = new Set(['items', 'locations', 'inventory', 'tsd']);
  const forcedScanMode = inventorySessionId
    ? 'audit' as const
    : page === 'tsd'
      ? 'tsd' as const
      : null;

  const openPage = useCallback((nextPage: Page, opts?: { historyType?: string; split?: boolean }) => {
    if (nextPage === 'config') {
      setNotice('Редактор открывается только из лаунчера — отдельное окно');
      return;
    }
    if (session && !canOpenPage(session, nextPage)) {
      setNotice('Недостаточно прав для этого раздела');
      return;
    }
    if (nextPage === 'history' && opts?.historyType) {
      setHistoryFocusType(opts.historyType);
    }
    if (opts?.split) {
      if (nextPage === page) {
        setNotice('Выберите другой раздел для второй половины экрана');
        return;
      }
      setTabs((current) => {
        if (current.some((tab) => tab.page === nextPage)) return current;
        return [...current, makeTab(nextPage)];
      });
      setSplitPage(nextPage);
      setRecent((current) => [nextPage, ...current.filter((entry) => entry !== nextPage)].slice(0, 12));
      return;
    }
    setTabs((current) => {
      if (current.some((tab) => tab.page === nextPage)) return current;
      return [...current, makeTab(nextPage)];
    });
    setActiveTabId(nextPage);
    setRecent((current) => [nextPage, ...current.filter((entry) => entry !== nextPage)].slice(0, 12));
  }, [session, setNotice, page]);

  useEffect(() => {
    const unsub = (window as any).api?.onFocusEntity?.((payload: any) => {
      const pageId = String(payload?.page || '') as Page;
      if (pageId && (PAGE_TITLES[pageId] || isCustomFormPage(pageId))) {
        openPage(pageId);
        setNotice(`Переход: ${resolvePageTitle(pageId)}`);
      }
    });
    return () => { try { unsub?.(); } catch {  } };
  }, [openPage, setNotice]);

  const closeTab = useCallback((tabId: string) => {
    setTabs((current) => {
      if (current.length <= 1) return current;
      const index = current.findIndex((tab) => tab.id === tabId);
      if (index < 0) return current;
      const next = current.filter((tab) => tab.id !== tabId);
      if (activeTabId === tabId) {
        const fallback = next[Math.max(0, index - 1)] || next[0];
        setActiveTabId(fallback.id);
      }
      return next;
    });
  }, [activeTabId]);

  const closeOtherTabs = useCallback((tabId: string) => {
    setTabs((current) => {
      const keep = current.find((tab) => tab.id === tabId);
      if (!keep) return current;
      setActiveTabId(keep.id);
      if (splitPage && splitPage !== keep.page) setSplitPage(null);
      return [keep];
    });
  }, [splitPage]);

  const closeAllTabs = useCallback(() => {
    const home = makeTab('dashboard');
    setTabs([home]);
    setActiveTabId(home.id);
    setSplitPage(null);
  }, []);

  const closeTabsToRight = useCallback((tabId: string) => {
    setTabs((current) => {
      const index = current.findIndex((tab) => tab.id === tabId);
      if (index < 0) return current;
      const next = current.slice(0, index + 1);
      if (!next.some((tab) => tab.id === activeTabId)) setActiveTabId(next[next.length - 1].id);
      return next.length ? next : current;
    });
  }, [activeTabId]);

  const closeTabsToLeft = useCallback((tabId: string) => {
    setTabs((current) => {
      const index = current.findIndex((tab) => tab.id === tabId);
      if (index <= 0) return current;
      const next = current.slice(index);
      if (!next.some((tab) => tab.id === activeTabId)) setActiveTabId(next[0].id);
      return next;
    });
  }, [activeTabId]);

  const detachTab = useCallback(async (tabId: string) => {
    const tab = tabs.find((row) => row.id === tabId);
    if (!tab) return;
    try {
      await (window as any).api.openDetachedPage?.(tab.page, tab.title || resolvePageTitle(tab.page));
      setNotice(locale === 'en'
        ? `Opened “${tab.title}” in a separate window`
        : `Раздел «${tab.title}» открыт в отдельном окне`);
      if (!isDetached && tabs.length > 1) {
        if (splitPage === tab.page) setSplitPage(null);
        closeTab(tabId);
      }
    } catch (e: any) {
      setNotice(e?.message || (locale === 'en' ? 'Could not detach tab' : 'Не удалось открепить вкладку'));
    }
  }, [tabs, locale, isDetached, splitPage, closeTab]);

  const handleScan = useCallback(async (barcode: string, mode: ScanMode) => {
    if (mode === 'pair') {
      pairQueueRef.current = pairQueueRef.current.then(async () => {
        const [item, location] = await Promise.all([
          (window as any).api.findItemByBarcode(barcode),
          (window as any).api.findLocationByBarcode(barcode),
        ]);
        if (!item && !location) { setNotice('Штрихкод не найден среди товаров и адресов'); return; }
        const scanned = item ? { kind: 'item' as const, value: item } : { kind: 'location' as const, value: location };
        const pending = pairPendingRef.current;
        if (!pending || pending.kind === scanned.kind) {
          pairPendingRef.current = scanned;
          setPairStatus(scanned.kind === 'item' ? `Товар: ${item.name}. Теперь сканируйте ячейку.` : `Ячейка: ${location.name}. Теперь сканируйте товар.`);
          return;
        }
        const scannedItem = scanned.kind === 'item' ? scanned.value : pending.value;
        const scannedLocation = scanned.kind === 'location' ? scanned.value : pending.value;
        await (window as any).api.adjustInventory({ item_id: scannedItem.id, location_id: scannedLocation.id, delta: 1, comment: 'Парное сканирование' });
        pairPendingRef.current = null;
        setPairStatus('');
        setNotice(`${scannedItem.name} · +1 шт. · ${scannedLocation.name}`);
        refresh();
      }).catch((scanError: any) => setNotice(scanError?.message || 'Не удалось обработать пару сканов'));
      return;
    }
    if (mode === 'location') {
      const location = await (window as any).api.findLocationByBarcode(barcode);
      if (location) {
        openPage('locations');
        setLocationContents(location);
        setNotice(`Найдена ячейка: ${location.name}`);
      } else {
        setNotice('Ячейка не найдена. Создайте ее в разделе хранения.');
      }
      return;
    }
    if (mode === 'stocktake') {
      const item = await (window as any).api.findItemByBarcode(barcode);
      if (!item) { setNotice('Товар не найден для быстрой инвентаризации'); return; }
      setStocktakeCart((current) => {
        const existing = current.find((entry) => entry.item.id === item.id);
        if (existing) return current.map((entry) => entry.item.id === item.id ? { ...entry, quantity: entry.quantity + 1 } : entry);
        return [...current, { item, quantity: 1 }];
      });
      setNotice(`${item.name} добавлен в быструю инвентаризацию`);
      return;
    }
    if (mode === 'tsd') {
      if (!taskId) { setNotice('Сначала выберите задание терминала сбора'); return; }
      const item = await (window as any).api.findItemByBarcode(barcode);
      if (!item) { setNotice('Товар не найден в каталоге'); return; }
      try {
        const result = await (window as any).api.tsdScanOrEnqueue?.(taskId, item.id, { barcode })
          ?? await (window as any).api.scanProject(taskId, item.id);
        if (result?.queued) {
          setNotice(`${item.name}: в очереди ТСД (${result.defer_reason || 'офлайн'})`);
        } else {
          setNotice(`${item.name}: ${result.scanned} из ${result.required}`);
        }
        refresh();
      } catch (scanError: any) {
        setNotice(scanError?.message || 'Скан не входит в задание');
      }
      return;
    }
    if (mode === 'audit') {
      if (!inventorySessionId) { setNotice('Сначала создайте акт ревизии и выберите ячейку'); return; }
      const item = await (window as any).api.findItemByBarcode(barcode);
      if (!item) { setNotice('Товар не найден и не добавлен в ревизию'); return; }
      await (window as any).api.countInventory(inventorySessionId, item.id, 1);
      setNotice(`${item.name} добавлен в фактический пересчет`);
      refresh();
      return;
    }
    if (mode === 'batch') {
      const item = await (window as any).api.findItemByBarcode(barcode);
      if (!item) { setNotice('Товар не найден и не добавлен в корзину операции'); return; }
      setBatchCart((current) => {
        const existing = current.find((entry) => entry.item.id === item.id);
        if (existing) return current.map((entry) => entry.item.id === item.id ? { ...entry, quantity: entry.quantity + 1 } : entry);
        return [...current, { item, quantity: 1 }];
      });
      setNotice(`${item.name} добавлен в корзину операции`);
      return;
    }
    const item = await (window as any).api.findItemByBarcode(barcode);
    setNotice(item ? `Найден товар: ${item.name}` : 'Штрихкод не найден. Добавьте новый товар.');
    setItemDialog(item ? { item, receipt: mode === 'receipt' } : { barcode, receipt: mode === 'receipt' });
    refresh();
  }, [inventorySessionId, taskId, openPage]);

  useEffect(() => {
    if (!notice) return;
    if (looksLikeAppError(notice)) {
      pushAppError(notice, /недостаточно|запрещ|denied/i.test(notice) ? 'warn' : 'error');
    }
    const timer = window.setTimeout(() => setNoticeState(''), 4000);
    return () => window.clearTimeout(timer);
  }, [notice, pushAppError]);

  async function loadWorkspaceState() {
    try {
      const favRaw = await (window as any).api.getSetting('workspace.favorites', '[]');
      const recentRaw = await (window as any).api.getSetting('workspace.recent', '["dashboard"]');
      const tabsRaw = await (window as any).api.getSetting('workspace.tabs', '[]');
      const activeRaw = await (window as any).api.getSetting('workspace.activeTab', 'dashboard');
      try { setFavorites(JSON.parse(favRaw || '[]')); } catch { setFavorites([]); }
      try { setRecent(JSON.parse(recentRaw || '["dashboard"]')); } catch { setRecent(['dashboard']); }
      try {
        const savedTabs = JSON.parse(tabsRaw || '[]') as Page[];
        if (Array.isArray(savedTabs) && savedTabs.length) {
          const nextTabs = savedTabs
            .filter((page) => (PAGE_TITLES[page] || isCustomFormPage(page)) && canOpenPage(session, page))
            .map((page) => makeTab(page));
          if (nextTabs.length) {
            setTabs(nextTabs);
            const activeCandidate = (PAGE_TITLES[activeRaw as Page] || isCustomFormPage(String(activeRaw)))
              && canOpenPage(session, activeRaw as Page)
              ? activeRaw
              : nextTabs[0].id;
            setActiveTabId(String(activeCandidate));
          } else {
            setTabs([makeTab('dashboard')]);
            setActiveTabId('dashboard');
          }
        }
      } catch {  }
    } catch {  }
  }

  useEffect(() => {
    (window as any).api.getSetting('theme', 'light').then((value: string) => {
      const mapped = THEME_ALIASES[value] || value;
      const next = ALLOWED_THEMES.has(mapped) ? mapped : '1c-light';
      setTheme(next);
      if (next !== value) (window as any).api.setSetting('theme', next);
    });
  }, []);

  useEffect(() => {
    if (!session) return;
    void loadWorkspaceState();
  }, [session?.organization?.id]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.title = t('appTitle');
    (window as any).api.setTitleBarTheme?.(theme).catch(() => {});
  }, [theme, t]);

  useEffect(() => {
    function onThemeEvent(event: Event) {
      const next = String((event as CustomEvent).detail || '');
      if (ALLOWED_THEMES.has(next)) setTheme(next);
    }
    window.addEventListener('metrika:theme', onThemeEvent as EventListener);
    const off = (window as any).api.onSettingsChanged?.((payload: { key: string; value: string }) => {
      if (payload?.key !== 'theme') return;
      const mapped = THEME_ALIASES[payload.value] || payload.value;
      if (ALLOWED_THEMES.has(mapped)) setTheme(mapped);
    });
    return () => {
      window.removeEventListener('metrika:theme', onThemeEvent as EventListener);
      try { off?.(); } catch {  }
    };
  }, []);

  async function undoLastMovement() {
    try {
      await (window as any).api.undoLastTransaction();
      setNotice(t('menuUndoLast') + ' — OK');
      refresh();
    } catch (error: any) {
      setNotice(error?.message || 'Не удалось отменить движение');
    }
  }

  const runProcedure = useCallback((proc: ProcedureHit) => {
    pushRecentProcedure(session?.organization?.id, proc.id);
    if (proc.action === 'undo') {
      void undoLastMovement();
      return;
    }
    if (proc.page) {
      if (session && !canOpenPage(session, proc.page)) {
        setNotice('Недостаточно прав для этой процедуры');
        return;
      }
      if (proc.inventoryTab) setInventoryFocus(proc.inventoryTab);
      if (proc.stockKind) setInventoryStockKind(proc.stockKind);
      openPage(proc.page);
      setNotice(`Процедура: ${proc.name}`);
    }
  }, [session, openPage, t]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (!session) return;
        setPaletteOpen((open) => !open);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [session]);

  useEffect(() => {
    if (!session) return;
    const timer = window.setTimeout(() => {
      (window as any).api.setSetting('workspace.favorites', JSON.stringify(favorites));
    }, 400);
    return () => window.clearTimeout(timer);
  }, [favorites, session?.organization?.id]);
  useEffect(() => {
    if (!session) return;
    const timer = window.setTimeout(() => {
      (window as any).api.setSetting('workspace.recent', JSON.stringify(recent));
    }, 400);
    return () => window.clearTimeout(timer);
  }, [recent, session?.organization?.id]);
  useEffect(() => {
    if (!session) return;
    const timer = window.setTimeout(() => {
      (window as any).api.setSetting('workspace.tabs', JSON.stringify(tabs.map((tab) => tab.page)));
      (window as any).api.setSetting('workspace.activeTab', activeTabId);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [tabs, activeTabId, session?.organization?.id]);

  const darkThemeSet = new Set(['dark', 'oled', 'aurora', '1c-dark']);

  async function openItem(ref: { id?: number; barcode?: string } | string) {
    try {
      if (typeof ref === 'string') {
        const item = await (window as any).api.findItemByBarcode(ref);
        if (item) setItemDialog({ item });
        return;
      }
      if (ref.id) {
        const item = await (window as any).api.getItemById(ref.id);
        if (item) { setItemDialog({ item }); return; }
      }
      if (ref.barcode) {
        const item = await (window as any).api.findItemByBarcode(ref.barcode);
        if (item) setItemDialog({ item });
      }
    } catch (error: any) {
      setNotice(error?.message || 'Не удалось открыть товар');
    }
  }

  function toggleFavorite(pageId: Page) {
    setFavorites((current) => current.includes(pageId) ? current.filter((entry) => entry !== pageId) : [...current, pageId]);
  }

  async function logoutToLauncher() {
    try { await (window as any).api.closeSession(); } catch {  }
    setSession(null);
    setTabs([makeTab('dashboard')]);
    setActiveTabId('dashboard');
    setFavorites([]);
    setRecent(['dashboard']);
    setItemDialog(null);
    setConsoleOpen(false);
  }

  function clearRecentPages() {
    setRecent([page]);
    (window as any).api.setSetting('workspace.recent', JSON.stringify([page]));
    setNotice('Недавние очищены');
  }

  if (!session) {
    return (
      <div className="app-shell launcher-only">
        <div className="title-bar">
          <div className="title-bar-title">{t('appTitle')}</div>
          <div className="title-bar-drag"></div>
        </div>
        <LauncherPage onOpened={(next, opts) => {
          setSession(next);
          notifyCurrencyChanged();
          const start = opts?.startPage && opts.startPage !== 'dashboard' ? opts.startPage : 'dashboard';
          setTabs([makeTab(start)]);
          setActiveTabId(start);
          setFavorites([]);
          setRecent([start]);
          if (opts?.settingsSection) {
            try { sessionStorage.setItem('metrika.settings.section', opts.settingsSection); } catch {  }
          }
          refresh();
          void loadWorkspaceState();
        }} />
      </div>
    );
  }

  const sessionLabel = fullName(session.user);

  if (isOperator(session)) {
    return (
      <div className="app-shell operator-app">
        <div className="title-bar">
          <div className="title-bar-title">{t('appTitle')}</div>
          <div className="title-bar-drag"></div>
          <NotificationCenter
            items={notifications}
            open={notifOpen}
            onOpenChange={setNotifOpen}
            onClear={clearNotifications}
            onMarkRead={markNotificationsRead}
          />
          <AccountMenu
            label={sessionLabel}
            subtitle={session.organization?.name}
            onOpenCabinet={() => setOperatorCabinet(true)}
            onOpenPage={() => setOperatorCabinet(true)}
            onSwitchAccount={() => { void logoutToLauncher(); }}
            onExit={() => { (window as any).api.quitApp?.(); }}
          />
        </div>
        <main className="main">
          {operatorCabinet ? (
            <CabinetPage
              session={session}
              refreshToken={refreshToken}
              onNotice={setNotice}
              onSession={setSession}
              onChanged={refresh}
            />
          ) : (
            <OperatorShell
              session={session}
              onLogout={() => { void logoutToLauncher(); }}
              onNotice={setNotice}
              onOpenItem={(ref) => { void openItem(ref); }}
            />
          )}
          {operatorCabinet && (
            <div style={{ padding: '0 16px 16px' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setOperatorCabinet(false)}>← К операциям</button>
            </div>
          )}
          {itemDialog && (
            <ItemDialog
              item={itemDialog.item}
              barcode={itemDialog.barcode}
              receipt={itemDialog.receipt}
              canEdit={can(session, 'items_edit')}
              onClose={() => setItemDialog(null)}
              onNotice={setNotice}
              onChanged={refresh}
              onSaved={() => { setItemDialog(null); setNotice('Изменения сохранены'); refresh(); }}
            />
          )}
        </main>
        {notice && <div className="toast">{notice}</div>}
      </div>
    );
  }

  return (
    <div className={`app-shell${isUser(session) ? ' user-arm-app' : ''}`}>
      <div className="title-bar">
        <button type="button" className="nav-toggle" onClick={() => setNavOpen((value) => !value)} aria-label="Меню разделов">☰</button>
        <div className="title-bar-title">{t('appTitle')}</div>
        <AppMenu
          onOpenPage={openPage}
          onNotice={setNotice}
          onReload={refresh}
          onNewItem={() => { if (!can(session, 'items_create')) { setNotice('Недостаточно прав: items_create'); return; } setItemDialog({}); }}
          onUndo={() => { void undoLastMovement(); }}
          onImportCsv={() => { if (!can(session, 'items_edit')) { setNotice('Недостаточно прав: items_edit'); return; } setImportTrigger((value) => value + 1); }}
          onAbout={() => setAboutOpen(true)}
          onToggleConsole={() => { if (!can(session, 'console')) { setNotice('Недостаточно прав: console'); return; } setConsoleOpen((value) => !value); }}
          onLogout={() => { void logoutToLauncher(); }}
        />
        <div className="title-bar-drag"></div>
        <NotificationCenter
          items={notifications}
          open={notifOpen}
          onOpenChange={setNotifOpen}
          onClear={clearNotifications}
          onMarkRead={markNotificationsRead}
        />
        <AccountMenu
          label={sessionLabel}
          subtitle={session.organization?.name}
          onOpenCabinet={() => openPage('cabinet')}
          onOpenPage={openPage}
          onOpenCrm={() => {
            void (window as any).api.openCrm?.()
              .then(() => setNotice('Открыто окно CRM'))
              .catch((e: any) => setNotice(e?.message || 'Не удалось открыть CRM'));
          }}
          canOpenCrm={isAdmin(session) || can(session, 'company')}
          onOpenClientPortal={() => {
            void (window as any).api.openClientPortal?.()
              .then(() => setNotice('Открыт портал Метрика:Клиент'))
              .catch((e: any) => setNotice(e?.message || 'Нет привязки к контрагенту'));
          }}
          onSwitchAccount={() => { void logoutToLauncher(); }}
          onExit={() => { (window as any).api.quitApp?.(); }}
        />
      </div>
      <WorkspaceChrome
        tabs={tabs}
        activeTabId={activeTabId}
        detached={isDetached}
        onActivate={(tabId) => {
          setActiveTabId(tabId);
          if (splitPage && tabId === splitPage) setSplitPage(null);
        }}
        onClose={(tabId) => {
          if (isDetached) {
            window.close();
            return;
          }
          if (splitPage === tabId) setSplitPage(null);
          closeTab(tabId);
        }}
        onCloseOthers={isDetached ? undefined : closeOtherTabs}
        onCloseAll={isDetached ? undefined : closeAllTabs}
        onCloseToRight={isDetached ? undefined : closeTabsToRight}
        onCloseToLeft={isDetached ? undefined : closeTabsToLeft}
        onDetachTab={isDetached ? undefined : detachTab}
        onOpenPage={openPage}
        favorites={favorites}
        recent={recent}
        onToggleFavorite={toggleFavorite}
        onSearchSelect={(item) => openItem({ id: item.id, barcode: item.barcode })}
        onSearchProcedure={runProcedure}
        onClearRecent={clearRecentPages}
        splitPage={isDetached ? null : splitPage}
        onPickSplit={isDetached ? undefined : (next) => openPage(next, { split: true })}
        onClearSplit={isDetached ? undefined : () => setSplitPage(null)}
        onOpenCrm={() => {
          void (window as any).api.openCrm?.()
            .then(() => setNotice('Открыто окно CRM'))
            .catch((e: any) => setNotice(e?.message || 'Не удалось открыть CRM'));
        }}
        canOpenCrm={isAdmin(session) || can(session, 'company')}
      />
      <div className={`app ${darkThemeSet.has(theme) ? 'dark' : ''}${isDetached ? ' is-detached' : ''}`}>
        {!isDetached && (
          <Sidebar page={page} onChange={openPage} open={navOpen} onClose={() => setNavOpen(false)} session={session} />
        )}
        <main
          className={`main${splitPage ? ' is-split' : ''}`}
          style={splitPage ? ({ ['--split-ratio' as string]: String(splitRatio) } as any) : undefined}
        >
          {splitPage && (
            <div
              className="main-split-resizer"
              role="separator"
              aria-orientation="vertical"
              title="Тяните, чтобы изменить ширину"
              onMouseDown={(event) => {
                event.preventDefault();
                const startX = event.clientX;
                const start = splitRatio;
                const onMove = (ev: MouseEvent) => {
                  const root = (event.target as HTMLElement).closest('main.main') as HTMLElement | null;
                  const width = root?.clientWidth || 1;
                  const next = Math.min(0.75, Math.max(0.25, start + (ev.clientX - startX) / width));
                  setSplitRatio(next);
                };
                const onUp = () => {
                  window.removeEventListener('mousemove', onMove);
                  window.removeEventListener('mouseup', onUp);
                };
                window.addEventListener('mousemove', onMove);
                window.addEventListener('mouseup', onUp);
              }}
            />
          )}
          <ScannerPanel
            page={page}
            visible={scannerPages.has(page)}
            forcedMode={forcedScanMode}
            onScan={handleScan}
            pairStatus={pairStatus}
            activeHint={page === 'inventory' && !inventorySessionId ? 'Свободное сканирование для быстрой инвентаризации' : page === 'tsd' ? (taskId ? 'Сканируйте компоненты задания' : 'Сначала выберите задание терминала') : ''}
          />
          {batchCart.length > 0 && <BatchCart items={batchCart} onChange={setBatchCart} onApplied={() => { setBatchCart([]); setNotice('Пакетный расход применен'); refresh(); }} />}

          {openPages.has('dashboard') && (
            <PagePane active={page === 'dashboard' || splitPage === 'dashboard'} splitRole={paneRole('dashboard', page, splitPage)}>
              {isUser(session) ? (
                <UserHome
                  session={session}
                  refreshToken={refreshToken}
                  onOpenPage={openPage}
                  onOpenItem={(code) => openItem(code)}
                  onNotice={setNotice}
                  onRunProcedure={runProcedure}
                />
              ) : (
                <Dashboard
                  refreshToken={refreshToken}
                  session={session}
                  onCreate={() => {
                    if (!can(session, 'items_create')) { setNotice('Недостаточно прав: items_create'); return; }
                    openPage('items');
                    setItemDialog({});
                  }}
                  onOpenItem={(code) => openItem(code)}
                  onOpenPage={(p, opts) => openPage(p as Page, opts)}
                  onNotice={setNotice}
                />
              )}
            </PagePane>
          )}
          {openPages.has('items') && (
            <PagePane active={page === 'items' || splitPage === 'items'} splitRole={paneRole('items', page, splitPage)}>
              <ItemsTable refreshToken={refreshToken} importTrigger={importTrigger} session={session} onCreate={() => { if (!can(session, 'items_create')) { setNotice('Недостаточно прав: items_create'); return; } setItemDialog({}); }} onEdit={(item) => openItem({ id: item.id, barcode: item.barcode })} onImported={(message) => { setNotice(message); refresh(); }} />
            </PagePane>
          )}
          {openPages.has('categories') && (
            <PagePane active={page === 'categories' || splitPage === 'categories'} splitRole={paneRole('categories', page, splitPage)}>
              <CategoriesPage refreshToken={refreshToken} onChanged={refresh} />
            </PagePane>
          )}
          {openPages.has('units') && (
            <PagePane active={page === 'units' || splitPage === 'units'} splitRole={paneRole('units', page, splitPage)}>
              <UnitsPage refreshToken={refreshToken} onChanged={refresh} />
            </PagePane>
          )}
          {openPages.has('replenishment') && (
            <PagePane active={page === 'replenishment' || splitPage === 'replenishment'} splitRole={paneRole('replenishment', page, splitPage)}>
              <ReplenishmentPage refreshToken={refreshToken} onNotice={setNotice} onOpenItem={(code) => openItem(code)} onChanged={refresh} />
            </PagePane>
          )}
          {openPages.has('purchases') && (
            <PagePane active={page === 'purchases' || splitPage === 'purchases'} splitRole={paneRole('purchases', page, splitPage)}>
              <PurchasesPage
                refreshToken={refreshToken}
                onChanged={refresh}
                onNotice={setNotice}
                focusOrderId={purchaseFocusId}
                onFocusConsumed={() => setPurchaseFocusId(null)}
              />
            </PagePane>
          )}
          {openPages.has('locations') && (
            <PagePane active={page === 'locations' || splitPage === 'locations'} splitRole={paneRole('locations', page, splitPage)}>
              <LocationsPage refreshToken={refreshToken} onOpen={(location) => setLocationContents(location)} onChanged={refresh} />
            </PagePane>
          )}
          {openPages.has('inventory') && (
            <PagePane active={page === 'inventory' || splitPage === 'inventory'} splitRole={paneRole('inventory', page, splitPage)}>
              <InventoryPage
                refreshToken={refreshToken}
                sessionId={inventorySessionId}
                onSession={setInventorySessionId}
                onChanged={refresh}
                onOpenItem={(code) => openItem(code)}
                stocktakeCart={stocktakeCart}
                onStocktakeChange={setStocktakeCart}
                onNotice={setNotice}
                focusTab={inventoryFocus}
                launchStockKind={inventoryStockKind}
                onFocusConsumed={() => { setInventoryFocus(null); setInventoryStockKind(null); }}
                accentedOps={!isAdmin(session)}
              />
            </PagePane>
          )}
          {openPages.has('projects') && (
            <PagePane active={page === 'projects' || splitPage === 'projects'} splitRole={paneRole('projects', page, splitPage)}>
              <ProjectsPage
                refreshToken={refreshToken}
                onChanged={refresh}
                focusProjectId={projectFocusId}
                onFocusConsumed={() => setProjectFocusId(null)}
              />
            </PagePane>
          )}
          {openPages.has('reserves') && (
            <PagePane active={page === 'reserves' || splitPage === 'reserves'} splitRole={paneRole('reserves', page, splitPage)}>
              <ReservesPage
                refreshToken={refreshToken}
                onNotice={setNotice}
                onChanged={refresh}
                onOpenPage={(p) => openPage(p)}
              />
            </PagePane>
          )}
          {openPages.has('tsd') && (
            <PagePane active={page === 'tsd' || splitPage === 'tsd'} splitRole={paneRole('tsd', page, splitPage)}>
              <TsdPage refreshToken={refreshToken} taskId={taskId} onTask={setTaskId} />
            </PagePane>
          )}
          {openPages.has('abc') && (
            <PagePane active={page === 'abc' || splitPage === 'abc'} splitRole={paneRole('abc', page, splitPage)}>
              <AbcPage refreshToken={refreshToken} onOpenItem={(code) => openItem(code)} />
            </PagePane>
          )}
          {openPages.has('templates') && (
            <PagePane active={page === 'templates' || splitPage === 'templates'} splitRole={paneRole('templates', page, splitPage)}>
              <TemplatesPage refreshToken={refreshToken} />
            </PagePane>
          )}
          {openPages.has('quality') && (
            <PagePane active={page === 'quality' || splitPage === 'quality'} splitRole={paneRole('quality', page, splitPage)}>
              <QualityPage refreshToken={refreshToken} onOpenItem={(ref) => openItem(ref)} onChanged={refresh} onNotice={setNotice} />
            </PagePane>
          )}
          {openPages.has('documents') && (
            <PagePane active={page === 'documents' || splitPage === 'documents'} splitRole={paneRole('documents', page, splitPage)}>
              <DocumentsPage
                refreshToken={refreshToken}
                onNotice={setNotice}
                onOpenPage={(next, opts) => {
                  if (next === 'purchases' && opts?.focusId != null) setPurchaseFocusId(Number(opts.focusId));
                  if (next === 'projects' && opts?.focusId != null) setProjectFocusId(Number(opts.focusId));
                  if (next === 'inventory' && opts?.focusId != null) setInventoryFocus('ops');
                  openPage(next);
                }}
              />
            </PagePane>
          )}
          {openPages.has('organizations') && (
            <PagePane active={page === 'organizations' || splitPage === 'organizations'} splitRole={paneRole('organizations', page, splitPage)}>
              <OrganizationsPage refreshToken={refreshToken} onNotice={setNotice} onChanged={refresh} />
            </PagePane>
          )}
          {openPages.has('cabinet') && (
            <PagePane active={page === 'cabinet' || splitPage === 'cabinet'} splitRole={paneRole('cabinet', page, splitPage)}>
              <CabinetPage
                session={session}
                refreshToken={refreshToken}
                onNotice={setNotice}
                onSession={setSession}
                onChanged={refresh}
              />
            </PagePane>
          )}
          {openPages.has('employees') && (
            <PagePane active={page === 'employees' || splitPage === 'employees'} splitRole={paneRole('employees', page, splitPage)}>
              <EmployeesPage refreshToken={refreshToken} onNotice={setNotice} onChanged={refresh} session={session} />
            </PagePane>
          )}
          {openPages.has('parties') && (
            <PagePane active={page === 'parties' || splitPage === 'parties'} splitRole={paneRole('parties', page, splitPage)}>
              <PartiesPage refreshToken={refreshToken} onNotice={setNotice} onChanged={refresh} session={session} />
            </PagePane>
          )}
          {openPages.has('edo') && (
            <PagePane active={page === 'edo' || splitPage === 'edo'} splitRole={paneRole('edo', page, splitPage)}>
              <EdoPage refreshToken={refreshToken} onNotice={setNotice} onChanged={refresh} session={session} />
            </PagePane>
          )}
          {openPages.has('company') && (
            <PagePane active={page === 'company' || splitPage === 'company'} splitRole={paneRole('company', page, splitPage)}>
              <CompanyUnfPage refreshToken={refreshToken} onNotice={setNotice} onChanged={refresh} />
            </PagePane>
          )}
          {openPages.has('assets') && (
            <PagePane active={page === 'assets' || splitPage === 'assets'} splitRole={paneRole('assets', page, splitPage)}>
              <AssetsPage refreshToken={refreshToken} onNotice={setNotice} onChanged={refresh} />
            </PagePane>
          )}
          {openPages.has('audit') && (
            <PagePane active={page === 'audit' || splitPage === 'audit'} splitRole={paneRole('audit', page, splitPage)}>
              <AuditPage refreshToken={refreshToken} onNotice={setNotice} />
            </PagePane>
          )}
          {openPages.has('settings') && (
            <PagePane active={page === 'settings' || splitPage === 'settings'} splitRole={paneRole('settings', page, splitPage)}>
              <SettingsPage theme={theme} onTheme={setTheme} onNotice={setNotice} onReload={refresh} />
            </PagePane>
          )}
          {openPages.has('history') && (
            <PagePane active={page === 'history' || splitPage === 'history'} splitRole={paneRole('history', page, splitPage)}>
              <HistoryPage
                refreshToken={refreshToken}
                onOpenItem={(code) => openItem(code)}
                onChanged={refresh}
                initialType={historyFocusType}
                onInitialTypeConsumed={() => setHistoryFocusType(null)}
              />
            </PagePane>
          )}
          {openPages.has('info') && (
            <PagePane active={page === 'info' || splitPage === 'info'} splitRole={paneRole('info', page, splitPage)}>
              <InfoPage session={session} onRunProcedure={runProcedure} />
            </PagePane>
          )}
          {[...openPages].filter((p) => isCustomFormPage(p)).map((customPage) => (
            <PagePane
              key={customPage}
              active={page === customPage || splitPage === customPage}
              splitRole={paneRole(customPage as Page, page, splitPage)}
            >
              <CustomFormPage
                formCode={customFormCodeFromPage(customPage)}
                refreshToken={refreshToken}
                onNotice={setNotice}
              />
            </PagePane>
          ))}
        </main>
      </div>
      <ConsoleDock
        open={consoleOpen}
        height={consoleHeight}
        onHeight={setConsoleHeight}
        onClose={() => setConsoleOpen(false)}
        onNotice={setNotice}
        onOpenPage={(next) => openPage(next as Page)}
        onReload={refresh}
        appErrors={appErrors}
        onClearAppErrors={() => setAppErrors([])}
      />
      {notice && <div className="toast" role="status">{notice}</div>}
      {aboutOpen && (
        <FloatingWidget title={t('about')} open onClose={() => setAboutOpen(false)} width={480} zIndex={1800}>
          <div className="about-modal" style={{ padding: 0, border: 0, boxShadow: 'none' }}>
            <div className="section-label">{t('appTitle')}</div>
            <h2 style={{ marginTop: 4 }}>{t('appTitle')}</h2>
            <p>{t('warehouseAccounting')}</p>
            <div className="about-grid">
              <div><span>Полное имя</span><strong>{t('appTitle')}</strong></div>
              <div><span>Кратко</span><strong>{t('appNameShort')}</strong></div>
              <div><span>Версия</span><strong>0.5</strong></div>
              <div><span>Редакция</span><strong>{locale === 'en' ? 'Home' : 'Домашняя'}</strong></div>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-primary" onClick={() => setAboutOpen(false)}>{t('close')}</button>
            </div>
          </div>
        </FloatingWidget>
      )}
      {itemDialog && <ItemDialog item={itemDialog.item} barcode={itemDialog.barcode} receipt={itemDialog.receipt} canEdit={can(session, 'items_edit')} onClose={() => setItemDialog(null)} onNotice={setNotice} onChanged={refresh} onSaved={() => { setItemDialog(null); setNotice('Изменения сохранены'); refresh(); }} />}
      <CommandPalette
        open={paletteOpen && !!session}
        session={session}
        onClose={() => setPaletteOpen(false)}
        onRunProcedure={runProcedure}
        onOpenItem={(item) => openItem({ id: item.id, barcode: item.barcode })}
        onOpenPage={openPage}
      />
      {locationDialog && <LocationDialog location={locationDialog} onClose={() => setLocationDialog(null)} onSaved={() => { setLocationDialog(null); setNotice('Ячейка обновлена'); refresh(); }} />}
      {locationContents && (
        <LocationContentsDialog
          location={locationContents}
          onClose={() => setLocationContents(null)}
          onCleared={() => { setLocationContents(null); setNotice('Ячейка очищена'); refresh(); }}
          onStartRevision={async () => {
            try {
              const result = await (window as any).api.startInventory(locationContents.id);
              setInventorySessionId(result.id);
              setLocationContents(null);
              openPage('inventory');
              setNotice(`Ревизия ячейки «${locationContents.name}» начата`);
            } catch (startError: any) {
              setNotice(startError?.message || 'Не удалось начать ревизию');
            }
          }}
        />
      )}
    </div>
  );
}

const ISSUE_REASONS: { id: string; label: string }[] = [
  { id: 'USAGE', label: 'Использование / расход' },
  { id: 'PROJECT', label: 'На проект / сборку' },
  { id: 'DEFECT', label: 'Брак' },
  { id: 'LOSS', label: 'Потеря / недостача' },
  { id: 'MANUAL', label: 'Прочее' },
];

function BatchCart({ items, onChange, onApplied }: { items: any[]; onChange: (items: any[]) => void; onApplied: () => void }) {
  const [locations, setLocations] = useState<any[]>([]);
  const [locationId, setLocationId] = useState('');
  const [reason, setReason] = useState('USAGE');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  useEffect(() => { (window as any).api.getLocations().then(setLocations); }, []);
  async function apply() {
    if (!locationId) { setError('Выберите ячейку для списания'); return; }
    const totalQuantity = items.reduce((sum, entry) => sum + Number(entry.quantity || 0), 0);
    const reasonLabel = ISSUE_REASONS.find((r) => r.id === reason)?.label || reason;
    if (!window.confirm(`Списать ${totalQuantity} ед. (${reasonLabel}) без накладной?`)) return;
    const comment = [reasonLabel, note.trim()].filter(Boolean).join(' · ') || 'Пакетный расход';
    try {
      await (window as any).api.batchAdjustInventory({
        actions: items.map((entry) => ({ item_id: entry.item.id, location_id: locationId, delta: -entry.quantity })),
        comment,
        reason,
        source: 'SCANNER',
      });
      onApplied();
    } catch (applyError: any) {
      setError(applyError?.message || 'Пакетная операция не выполнена');
    }
  }
  return (
    <section className="batch-panel card">
      <div className="batch-heading">
        <div>
          <div className="section-label">Корзина операции</div>
          <h2>Пакетный расход</h2>
          <p className="subtext" style={{ margin: '4px 0 0' }}>Без документа-накладной: укажите причину и ячейку, затем примените.</p>
        </div>
        <button className="btn btn-text" onClick={() => onChange([])}>Очистить</button>
      </div>
      <div className="batch-list">
        {items.map((entry) => (
          <div className="batch-row" key={entry.item.id}>
            <span>{entry.item.name}</span>
            <strong>{entry.quantity} {entry.item.unit_symbol || 'шт.'}</strong>
            <button className="btn btn-danger" onClick={() => onChange(items.filter((item) => item.item.id !== entry.item.id))}>Убрать</button>
          </div>
        ))}
      </div>
      <div className="form-grid" style={{ padding: '0 12px 8px' }}>
        <label>Ячейка списания
          <select value={locationId} onChange={(event) => setLocationId(event.target.value)}>
            <option value="">Выберите ячейку</option>
            {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
          </select>
        </label>
        <label>Причина расхода
          <select value={reason} onChange={(event) => setReason(event.target.value)}>
            {ISSUE_REASONS.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}
          </select>
        </label>
        <label className="field-wide">Комментарий (необязательно)
          <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="напр. сборка дрона, подарок, тест…" />
        </label>
      </div>
      <div className="batch-footer">
        <button className="btn btn-primary" onClick={() => void apply()}>Списать без накладной</button>
      </div>
      {error && <div className="form-error">{error}</div>}
    </section>
  );
}

function LocationDialog({ location, onClose, onSaved }: any) {
  const [form, setForm] = useState({ barcode: location.barcode, name: location.name, description: location.description || '' });
  const [error, setError] = useState('');
  async function save(event: React.FormEvent) {
    event.preventDefault();
    try { await (window as any).api.updateLocation(location.id, form); onSaved(); } catch (saveError: any) { setError(saveError?.message || 'Не удалось сохранить ячейку'); }
  }
  return (
    <FloatingWidget title={location.name || 'Ячейка хранения'} open onClose={onClose} width={520} zIndex={1720}>
      <form onSubmit={save}>
        <p className="subtext" style={{ marginTop: 0 }}>Изменение адреса, найденного сканером</p>
        <div className="form-grid">
          <label>Код ячейки<input value={form.barcode} onChange={(event) => setForm({ ...form, barcode: event.target.value })} /></label>
          <label>Название<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
          <label className="field-wide">Описание<textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
        </div>
        {error && <div className="form-error">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn btn-text" onClick={onClose}>Отмена</button>
          <button className="btn btn-primary">Сохранить</button>
        </div>
      </form>
    </FloatingWidget>
  );
}

function LocationContentsDialog({ location, onClose, onCleared, onStartRevision }: any) {
  const [contents, setContents] = useState<any[]>([]);
  const [error, setError] = useState('');
  useEffect(() => { (window as any).api.getLocationContents(location.id).then(setContents).catch(() => setError('Не удалось загрузить содержимое')); }, [location.id]);
  async function clear() {
    if (!window.confirm(`Очистить ячейку «${location.name}»? Все позиции будут списаны.`)) return;
    try { await (window as any).api.clearLocation(location.id); onCleared(); } catch (clearError: any) { setError(clearError?.message || 'Не удалось очистить ячейку'); }
  }
  return (
    <FloatingWidget title={`Содержимое: ${location.name}`} open onClose={onClose} width={560} zIndex={1720}>
      <p className="mono subtext" style={{ marginTop: 0 }}>{location.barcode}</p>
      {contents.length ? (
        <div className="contents-list">{contents.map((item) => (
          <div className="wizard-stock-row" key={item.id}>
            <span>{item.print_name || item.name}<small className="subtext">{item.barcode || 'Еще не определен'}</small></span>
            <strong>{item.on_hand ?? item.quantity} физ. · {item.reserved || 0} рез. · {item.available ?? item.quantity} дост. {item.unit_symbol || 'шт.'}</strong>
          </div>
        ))}</div>
      ) : (
        <div className="empty"><h3>Ячейка пуста</h3><p>Отсканируйте товар в режиме оприходования.</p></div>
      )}
      {error && <div className="form-error">{error}</div>}
      <div className="modal-actions">
        <button className="btn btn-secondary" onClick={onStartRevision}>Начать ревизию этой ячейки</button>
        <button className="btn btn-danger" onClick={clear} disabled={!contents.length}>Очистить ячейку</button>
        <button className="btn btn-primary" onClick={onClose}>Готово</button>
      </div>
    </FloatingWidget>
  );
}
