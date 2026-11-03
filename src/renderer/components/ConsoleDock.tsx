import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n';
import { useCurrency } from '../currency';
import type { Page } from './WorkspaceChrome';

type LogLine = {
  id: number;
  level: 'info' | 'warn' | 'error' | 'cmd' | 'ok' | 'accent' | 'muted';
  text: string;
  at: string;
};

type Props = {
  open: boolean;
  height: number;
  onHeight: (height: number) => void;
  onClose: () => void;
  onNotice: (message: string) => void;
  onOpenPage: (page: string) => void;
  onReload?: () => void;
  
  appErrors?: LogLine[];
  onClearAppErrors?: () => void;
};

const PAGE_ALIASES: Record<string, Page> = {
  dashboard: 'dashboard', overview: 'dashboard', обзор: 'dashboard',
  items: 'items', item: 'items', товары: 'items',
  categories: 'categories', категории: 'categories',
  units: 'units', единицы: 'units',
  replenishment: 'replenishment', пополнение: 'replenishment',
  purchases: 'purchases', po: 'purchases', закупки: 'purchases',
  locations: 'locations', хранение: 'locations',
  inventory: 'inventory', ревизия: 'inventory',
  projects: 'projects', проекты: 'projects',
  tsd: 'tsd', терминал: 'tsd',
  abc: 'abc', analytics: 'abc', аналитика: 'abc',
  templates: 'templates', шаблоны: 'templates',
  history: 'history', история: 'history',
  info: 'info', информация: 'info',
  settings: 'settings', настройки: 'settings',
  quality: 'quality', качество: 'quality',
  organizations: 'organizations', orgs: 'organizations', организации: 'organizations',
};

const HELP = [
  '╔══════════════════════════════════════════════════╗',
  '║         Метрика · терминал и отладка             ║',
  '╚══════════════════════════════════════════════════╝',
  '',
  'ГДЕ СМОТРЕТЬ, ЕСЛИ ЧТО-ТО СЛОМАЛОСЬ',
  '  1) Эта панель → вкладка «Ошибки»',
  '     Сюда попадают тексты красных/жёлтых уведомлений.',
  '  2) Эта панель → вкладка «Консоль»',
  '     Полный лог main-процесса: строки вида [main] …',
  '     Сюда же пишутся ответы ваших команд.',
  '  3) Раздел «Журнал склада»',
  '     Что меняло остатки: приход, расход, перемещение,',
  '     корректировка (в т.ч. «Выровнять» из Центра качества).',
  '  4) Раздел «Аудит»',
  '     Кто что сделал в программе: вход, правки карточек,',
  '     резервные копии, ошибки приложения (app.error).',
  '  5) Центр качества',
  '     Оценка базы и расхождения «полка ↔ история».',
  '',
  'ТИПИЧНЫЙ ПОРЯДОК ПРИ ОШИБКЕ',
  '  • Прочитайте уведомление сверху — там обычно суть.',
  '  • Откройте терминал (внизу) → «Ошибки».',
  '  • Если мало деталей — вкладка «Консоль», прокрутите вверх',
  '    к строкам [main] Error … и скопируйте текст.',
  '  • Для склада: Журнал → фильтр по товару/дате.',
  '  • Для «кто нажал»: Аудит → фильтр «Ошибки» или поиск.',
  '',
  'КОМАНДЫ',
  'help / ?                 эта справка',
  'clear / cls              очистить консоль',
  'exit / close             скрыть панель',
  'version                  версия',
  'whoami / org / users     кто вошёл / организация',
  'stats / value / lowstock сводка склада',
  'items [q] / find <q>     найти товары',
  'item <id|sku|barcode>    открыть карточку',
  'stock <код> <±n> [ячейка] изменить остаток',
  'move <код> <из> <в> <n>  переместить',
  'locations / loc <код>    ячейки',
  'categories / units       справочники',
  'taxonomy                 синхр. иерархии категорий',
  'suppliers / projects     поставщики / заказы',
  'po / po <id>             закупки',
  'templates                шаблоны',
  'history [n]              последние движения склада',
  'quality                  открыть Центр качества',
  'ports / backup / undo    порты / копия / откат',
  'theme <имя>              тема оформления',
  'setting <key> [value]    настройка',
  'open <раздел>            открыть раздел UI',
  'export items|low|cats    выгрузка CSV',
  'echo <текст>             печать в консоль',
  'reload                   обновить окна',
  '',
  'Enter — выполнить · Shift+Enter — новая строка · ↑↓ — история команд',
];

function dumpError(push: (level: LogLine['level'], text: string) => void, error: any) {
  const message = error?.message || String(error);
  push('error', message);
  const stack = String(error?.stack || '');
  if (stack) {
    stack.split('\n').forEach((line) => {
      const trimmed = line.trimEnd();
      if (trimmed) push('muted', trimmed);
    });
  }
  if (error?.cause) {
    push('muted', `cause: ${error.cause?.message || String(error.cause)}`);
  }
}

export default function ConsoleDock({
  open, height, onHeight, onClose, onNotice, onOpenPage, onReload, appErrors = [], onClearAppErrors,
}: Props) {
  const { t, locale } = useI18n();
  const { symbol } = useCurrency();
  const [lines, setLines] = useState<LogLine[]>([]);
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState(-1);
  const [tab, setTab] = useState<'console' | 'errors'>('console');
  const idRef = useRef(1);
  const dragRef = useRef<{ startY: number; startH: number } | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  function push(level: LogLine['level'], text: string) {
    setLines((current) => [...current.slice(-800), {
      id: idRef.current++,
      level,
      text,
      at: new Date().toLocaleTimeString('ru-RU'),
    }]);
  }

  useEffect(() => {
    if (!open) return;
    if (lines.length === 0) {
      push('accent', `┌─ ${t('appTitle')} · терминал и отладка ─┐`);
      push('muted', 'Консоль: команды и полный лог программы ([main] …).');
      push('muted', 'Вкладка «Ошибки»: тексты из всплывающих уведомлений.');
      push('muted', 'Справка: команда help · Журнал склада · Аудит · Центр качества.');
    }
    window.setTimeout(() => inputRef.current?.focus(), 40);
  }, [open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines, appErrors, open, tab]);

  useEffect(() => {
    function onMove(event: MouseEvent) {
      if (!dragRef.current) return;
      const next = Math.min(Math.floor(window.innerHeight * 0.7), Math.max(160, dragRef.current.startH + (dragRef.current.startY - event.clientY)));
      onHeight(next);
    }
    function onUp() { dragRef.current = null; }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [onHeight]);


  useEffect(() => {
    const api = (window as any).api;
    if (!api?.onConsoleLog) return undefined;
    return api.onConsoleLog((payload: { level?: string; text?: string }) => {
      const level = (payload?.level === 'error' || payload?.level === 'warn') ? payload.level : 'info';
      push(level as LogLine['level'], `[main] ${payload?.text || ''}`);
    });
  }, []);

  async function resolveItem(token: string) {
    const api = (window as any).api;
    if (/^\d+$/.test(token)) {
      const byId = await api.getItemById(Number(token));
      if (byId) return byId;
    }
    const byBarcode = await api.findItemByBarcode(token);
    if (byBarcode) return byBarcode;
    const list = await api.getItems(token);
    return (list || []).find((row: any) =>
      String(row.sku || '').toLowerCase() === token.toLowerCase()
      || String(row.barcode || '') === token
      || String(row.name || '').toLowerCase() === token.toLowerCase()
    ) || (list || [])[0] || null;
  }

  async function resolveLocation(token: string) {
    const api = (window as any).api;
    const byBarcode = await api.findLocationByBarcode(token);
    if (byBarcode) return byBarcode;
    const list = await api.getLocations();
    return (list || []).find((row: any) =>
      String(row.id) === token
      || String(row.barcode || '') === token
      || String(row.name || '').toLowerCase() === token.toLowerCase()
    ) || null;
  }

  async function runCommand(raw: string) {
    const blocks = raw.replace(/\r\n/g, '\n').split('\n').map((line) => line.trim()).filter(Boolean);
    if (!blocks.length) return;
    setHistory((current) => [raw.trim(), ...current.filter((entry) => entry !== raw.trim())].slice(0, 50));
    setHistIdx(-1);
    setInput('');
    setTab('console');
    for (const command of blocks) {
      await runOne(command);
    }
  }

  async function runOne(command: string) {
    push('cmd', `❯ ${command}`);
    const [verb, ...rest] = command.split(/\s+/);
    const arg = rest.join(' ').trim();
    const lower = verb.toLowerCase();
    const api = (window as any).api;

    try {
      if (lower === 'help' || lower === '?') { HELP.forEach((line) => push(/[╔╚║═]/.test(line) ? 'accent' : 'info', line)); return; }
      if (lower === 'clear' || lower === 'cls') { setLines([]); return; }
      if (lower === 'exit' || lower === 'close') { onClose(); return; }
      if (lower === 'version') { push('ok', `${t('appTitle')} / ${t('appNameShort')} · 0.5`); return; }
      if (lower === 'reload') { onReload?.(); push('ok', 'GUI обновлён'); return; }

      if (lower === 'whoami') {
        const session = await api.getAuthSession();
        push('ok', `${session?.user?.display_name || '—'} (${session?.user?.role || '—'})`);
        push('info', `Орг: ${session?.organization?.name || '—'}`);
        return;
      }
      if (lower === 'org') {
        const session = await api.getAuthSession();
        const o = session?.organization;
        if (!o) { push('warn', 'Нет активной организации'); return; }
        push('ok', o.name);
        push('muted', [o.legal_name, o.address || o.legal_address, o.email, o.phone].filter(Boolean).join(' · ') || 'Реквизиты не заполнены');
        return;
      }
      if (lower === 'users') {
        const session = await api.getAuthSession();
        const users = await api.listUsers(session?.organization?.id);
        (users || []).forEach((user: any) => push('info', `${user.login.padEnd(12)} ${user.display_name} · ${user.role}`));
        return;
      }
      if (lower === 'stats') {
        const overview = await api.getDashboardAnalytics();
        push('ok', `Товаров ${overview.item_count} · Остаток ${overview.total_units} · Ячеек ${overview.cell_count}`);
        push('warn', `Ниже мин.: ${overview.low_stock_count} · Проекты: ${overview.active_projects ?? '—'}`);
        return;
      }
      if (lower === 'value') {
        const value = await api.getStockValue();
        push('ok', typeof value === 'object'
          ? `Оценка: ${Number(value?.total || value?.value || 0).toLocaleString('ru-RU')} ${symbol}`
          : `Оценка: ${value}`);
        return;
      }
      if (lower === 'lowstock') {
        const plan = await api.getReplenishmentPlan(14, 7);
        const rows = (plan || []).filter((row: any) => Number(row.order_qty || row.to_order || 0) > 0).slice(0, 40);
        if (!rows.length) { push('ok', 'Критичных позиций нет'); return; }
        rows.forEach((row: any) => push('warn', `${row.name} · доступно ${row.available ?? row.qty ?? 0} · заказ ${row.order_qty ?? row.to_order}`));
        return;
      }
      if (lower === 'items') {
        const list = await api.getItems(arg || undefined);
        push('accent', `Найдено: ${(list || []).length}`);
        (list || []).slice(0, 40).forEach((item: any) => {
          push('info', `#${item.id}  ${item.name}  ·  ${item.sku || '—'}  ·  ост. ${item.total_quantity ?? item.quantity ?? 0}`);
        });
        if ((list || []).length > 40) push('muted', `… ещё ${(list || []).length - 40}`);
        return;
      }
      if (lower === 'find') {
        if (!arg) { push('warn', 'find <текст>'); return; }
        const list = await api.getItems(arg);
        push('ok', `${(list || []).length} совпадений`);
        (list || []).slice(0, 25).forEach((item: any) => push('info', `${item.name} [${item.sku || item.barcode || item.id}]`));
        return;
      }
      if (lower === 'item') {
        if (!arg) { push('warn', 'item <id|sku|штрихкод>'); return; }
        const item = await resolveItem(arg);
        if (!item) { push('error', 'Товар не найден'); return; }
        const full = await api.getItemById(item.id);
        const row = full || item;
        push('ok', row.name);
        push('info', `ID ${row.id} · SKU ${row.sku || '—'} · штрихкод ${row.barcode || '—'}`);
        push('info', `Категория: ${row.category_name || row.category || '—'} · ед. ${row.unit_symbol || '—'}`);
        push('accent', `Остаток: ${row.total_quantity ?? row.quantity ?? 0} · мин. ${row.min_stock ?? 0}`);
        return;
      }
      if (lower === 'stock') {
        const [code, qtyRaw, locToken] = rest;
        if (!code || qtyRaw == null) { push('warn', 'stock <код> <±qty> [ячейка]'); return; }
        const item = await resolveItem(code);
        if (!item) { push('error', 'Товар не найден'); return; }
        let locationId: number | undefined;
        if (locToken) {
          const loc = await resolveLocation(locToken);
          if (!loc) { push('error', 'Ячейка не найдена'); return; }
          locationId = loc.id;
        } else {
          const locations = await api.getLocations();
          locationId = locations?.[0]?.id;
        }
        if (!locationId) { push('error', 'Нет ячеек хранения'); return; }
        await api.adjustInventory({ item_id: item.id, location_id: locationId, delta: Number(qtyRaw), comment: 'Консоль' });
        push('ok', `${item.name}: ${Number(qtyRaw) >= 0 ? '+' : ''}${qtyRaw}`);
        onReload?.();
        return;
      }
      if (lower === 'move') {
        const [code, fromTok, toTok, qtyRaw] = rest;
        if (!code || !fromTok || !toTok || qtyRaw == null) { push('warn', 'move <код> <из> <в> <qty>'); return; }
        const item = await resolveItem(code);
        const from = await resolveLocation(fromTok);
        const to = await resolveLocation(toTok);
        if (!item || !from || !to) { push('error', 'Товар или ячейка не найдены'); return; }
        await api.moveInventory({ item_id: item.id, from_location_id: from.id, to_location_id: to.id, quantity: Number(qtyRaw) });
        push('ok', `${item.name}: ${from.name} → ${to.name} × ${qtyRaw}`);
        onReload?.();
        return;
      }
      if (lower === 'locations') {
        const list = await api.getLocations();
        (list || []).slice(0, 50).forEach((loc: any) => push('info', `#${loc.id} ${loc.name} · ${loc.barcode || '—'} · ${loc.total_qty ?? 0}`));
        return;
      }
      if (lower === 'loc') {
        if (!arg) { push('warn', 'loc <id|штрихкод|имя>'); return; }
        const loc = await resolveLocation(arg);
        if (!loc) { push('error', 'Ячейка не найдена'); return; }
        const contents = await api.getLocationContents(loc.id);
        push('ok', loc.name);
        (contents || []).slice(0, 40).forEach((row: any) => push('info', `${row.name} · ${row.quantity}`));
        if (!(contents || []).length) push('muted', 'Пусто');
        return;
      }
      if (lower === 'categories') {
        const list = await api.getCategories();
        (list || []).forEach((cat: any) => push('info', `${'  '.repeat(cat.parent_id ? 1 : 0)}${cat.name} (#${cat.id}) · товаров ${cat.item_count ?? 0}`));
        return;
      }
      if (lower === 'units') {
        const list = await api.getUnits();
        (list || []).forEach((unit: any) => push('info', `${unit.symbol} — ${unit.name}`));
        return;
      }
      if (lower === 'suppliers') {
        const list = await api.getSuppliers();
        (list || []).forEach((s: any) => push('info', `${s.name} · ${s.contact || '—'}`));
        return;
      }
      if (lower === 'projects') {
        const list = await api.getProjects();
        (list || []).forEach((p: any) => push('info', `#${p.id} ${p.name} · ${p.status} · компонентов ${p.component_count ?? 0}`));
        return;
      }
      if (lower === 'po') {
        const list = await api.getPurchaseOrders();
        if (!rest[0] || rest[0] === 'list') {
          (list || []).slice(0, 30).forEach((po: any) => push('info', `#${po.id} ${po.order_no || po.number || po.id} · ${po.status} · ${po.supplier_name || '—'}`));
          return;
        }
        if (/^\d+$/.test(rest[0])) {
          const details = await api.getPurchaseDetails(Number(rest[0]));
          push('ok', `PO #${rest[0]} · ${details?.order?.status || details?.status || '—'}`);
          (details?.lines || details?.items || []).forEach((line: any) => push('info', `${line.item_name || line.name} × ${line.quantity}`));
          return;
        }
        push('warn', 'po | po list | po <id>');
        return;
      }
      if (lower === 'ports') {
        const ports = await api.listScannerPorts();
        if (!ports?.length) push('warn', 'Порты не найдены');
        else ports.forEach((port: any) => push('info', `${port.path}${port.manufacturer ? ` · ${port.manufacturer}` : ''}`));
        return;
      }
      if (lower === 'backup') {
        const file = await api.createBackup();
        if (file) { push('ok', file); onNotice(file); }
        else push('warn', 'Отменено');
        return;
      }
      if (lower === 'undo') {
        await api.undoLastTransaction();
        push('ok', 'Последнее движение отменено');
        onReload?.();
        return;
      }
      if (lower === 'modules' || lower === 'taxonomy' || lower === 'catsync') {
        const result = await api.syncCategoryTaxonomy();
        push('ok', `Корни: ${(result.roots || []).join(' · ')}`);
        push('accent', `Перепривязано товаров: ${result.updated}`);
        onNotice(`Категории: обновлено ${result.updated}`);
        onReload?.();
        return;
      }
      if (lower === 'templates') {
        const list = await api.getTemplates();
        (list || []).forEach((row: any) => push('info', `${row.name} · ${row.category || '—'} · ${row.sku_prefix || '—'}`));
        if (!(list || []).length) push('muted', 'Шаблонов нет');
        return;
      }
      if (lower === 'history') {
        const limit = Number(rest[0]) || 20;
        const rows = await api.getTransactions(limit);
        (rows || []).slice(0, limit).forEach((row: any) => {
          push('info', `${row.created_at || ''}  ${row.type || row.kind || ''}  ${row.item_name || row.name || ''}  ${row.quantity ?? row.delta ?? ''}`);
        });
        return;
      }
      if (lower === 'quality') {
        const report = await api.qualityReport();
        if (typeof report === 'string') {
          report.split('\n').forEach((line: string) => push('info', line));
        } else {
          JSON.stringify(report, null, 2).split('\n').forEach((line) => push('info', line));
        }
        return;
      }
      if (lower === 'setting' || lower === 'set') {
        const key = rest[0];
        if (!key) { push('warn', 'setting <key> [value]'); return; }
        if (rest.length === 1) {
          const value = await api.getSetting(key, '');
          push('ok', `${key} = ${value || '∅'}`);
          return;
        }
        const value = rest.slice(1).join(' ');
        await api.setSetting(key, value);
        push('ok', `${key} ← ${value}`);
        return;
      }
      if (lower === 'echo') {
        push('info', arg || '');
        return;
      }
      if (lower === 'ascii' || lower === 'banner') {
        [
          '  __  __      _        _ _         ',
          ' |  \\/  | ___| |_ _ __(_) | ____ _ ',
          ' | |\\/| |/ _ \\ __| \'__| | |/ / _` |',
          ' | |  | |  __/ |_| |  | |   < (_| |',
          ' |_|  |_|\\___|\\__|_|  |_|_|\\_\\__,_|',
        ].forEach((line) => push('accent', line));
        return;
      }
      if (lower === 'theme') {
        const map: Record<string, string> = {
          base: 'light', blue: 'light', light: 'light', синяя: 'light',
          dark: 'dark', 'base-dark': 'dark',
          oled: 'oled',
          aurora: 'aurora', аврора: 'aurora',
          '1c': '1c-light', yellow: '1c-light', желтая: '1c-light', '1c-light': '1c-light',
          '1c-dark': '1c-dark',
        };
        const key = (arg || '').toLowerCase();
        const next = map[key];
        if (!next) { push('warn', 'theme base|dark|oled|aurora|1c|1c-dark'); return; }
        await api.setSetting('theme', next);
        document.documentElement.dataset.theme = next;
        window.dispatchEvent(new CustomEvent('metrika:theme', { detail: next }));
        push('ok', `Тема: ${next}`);
        onNotice(`Тема: ${next}`);
        return;
      }
      if (lower === 'open') {
        if (!arg) { push('warn', 'open <раздел>'); return; }
        const page = PAGE_ALIASES[arg.toLowerCase()];
        if (!page) { push('error', `Неизвестный раздел: ${arg}`); return; }
        onOpenPage(page);
        push('ok', `Открыт: ${page}`);
        return;
      }
      if (lower === 'export') {
        const mode = (rest[0] || 'items').toLowerCase();
        let rows: any[] = [];
        let name = 'items';
        if (mode === 'low') {
          const plan = await api.getReplenishmentPlan(14, 7);
          rows = (plan || []).filter((row: any) => Number(row.order_qty || row.to_order || 0) > 0);
          name = 'lowstock';
        } else if (mode === 'cats' || mode === 'categories') {
          rows = await api.getCategories();
          name = 'categories';
        } else {
          rows = await api.getItems();
        }
        const file = await api.exportCsv(rows, name);
        if (file) { push('ok', file); onNotice(file); }
        else push('warn', 'Отменено');
        return;
      }

      push('error', `Неизвестная команда: ${verb}`);
      push('muted', 'help — список команд');
    } catch (error: any) {
      dumpError(push, error);
    }
  }

  if (!open) return null;
  const errorCount = appErrors.length;
  const visible = tab === 'errors' ? appErrors : lines;

  return (
    <div className="console-dock" style={{ height }} role="complementary" aria-label="Консоль">
      <div
        className="console-dock-resizer"
        onMouseDown={(event) => { dragRef.current = { startY: event.clientY, startH: height }; }}
        title="Потяните, чтобы изменить высоту"
      />
      <div className="console-dock-bar">
        <div className="console-tabs">
          <button type="button" className={`console-tab ${tab === 'console' ? 'active' : ''}`} onClick={() => setTab('console')}>Консоль</button>
          <button type="button" className={`console-tab ${tab === 'errors' ? 'active' : ''}`} onClick={() => setTab('errors')}>
            Ошибки{errorCount ? ` (${errorCount})` : ''}
          </button>
        </div>
        <div className="console-dock-actions">
          <button type="button" className="btn btn-text" onClick={() => {
            if (tab === 'errors') onClearAppErrors?.();
            else setLines([]);
          }}>Очистить</button>
          <button type="button" className="btn btn-text" onClick={onClose}>Скрыть</button>
        </div>
      </div>
      <div className="console-output terminal-mode console-dock-output">
        {tab === 'errors' && visible.length === 0 && (
          <div className="console-line level-muted">
            <span className="console-text">
              Пока пусто. Сюда попадают тексты всплывающих уведомлений об ошибках.
              Полный технический лог — во вкладке «Консоль» (строки [main]). Справка: команда help.
            </span>
          </div>
        )}
        {visible.map((line) => (
          <div key={line.id} className={`console-line level-${line.level}`}>
            <span className="console-time">{line.at}</span>
            <span className="console-text">{line.text}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      {tab === 'console' && (
        <form
          className="console-input-row console-input-multi"
          onSubmit={(event) => { event.preventDefault(); void runCommand(input); }}
        >
          <span className="console-prompt">{t('appNameShort')}&gt;</span>
          <textarea
            ref={inputRef as any}
            value={input}
            rows={Math.min(6, Math.max(1, input.split('\n').length))}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void runCommand(input);
                return;
              }
              if (event.key === 'ArrowUp' && !input.includes('\n') && !event.shiftKey) {
                event.preventDefault();
                const next = Math.min(history.length - 1, histIdx + 1);
                if (history[next] != null) { setHistIdx(next); setInput(history[next]); }
              } else if (event.key === 'ArrowDown' && !input.includes('\n') && !event.shiftKey) {
                event.preventDefault();
                const next = histIdx - 1;
                if (next < 0) { setHistIdx(-1); setInput(''); }
                else { setHistIdx(next); setInput(history[next]); }
              } else if (event.key === 'Escape') {
                onClose();
              }
            }}
            placeholder={locale === 'ru' ? 'Команда… Enter — выполнить, Shift+Enter — строка' : 'Command…'}
            spellCheck={false}
            autoComplete="off"
          />
          <button className="btn btn-primary" type="submit">↵</button>
        </form>
      )}
    </div>
  );
}
