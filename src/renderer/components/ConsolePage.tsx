import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n';

type LogLine = { id: number; level: 'info' | 'warn' | 'error' | 'cmd' | 'ok'; text: string; at: string };

type Props = { refreshToken: number; onNotice: (message: string) => void; onOpenPage: (page: string) => void };

const HELP_RU = [
  'help — список команд',
  'version — версия приложения',
  'stats — сводка по базе',
  'ports — порты сканера',
  'users — пользователи текущей организации',
  'org — текущая организация',
  'backup — создать резервную копию',
  'errors — последние ошибки',
  'clear — очистить вывод',
  'open <раздел> — открыть раздел (items, settings, purchases…)',
  'perm — права текущего пользователя',
];

const HELP_EN = [
  'help — command list',
  'version — app version',
  'stats — database summary',
  'ports — scanner ports',
  'users — users in current organization',
  'org — current organization',
  'backup — create backup',
  'errors — recent errors',
  'clear — clear output',
  'open <page> — open a section',
  'perm — current user permissions',
];

export default function ConsolePage({ refreshToken, onNotice, onOpenPage }: Props) {
  const { locale, t } = useI18n();
  const [lines, setLines] = useState<LogLine[]>([]);
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState(-1);
  const [tab, setTab] = useState<'console' | 'terminal' | 'errors'>('console');
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const idRef = useRef(1);

  function push(level: LogLine['level'], text: string) {
    setLines((current) => [...current.slice(-400), {
      id: idRef.current++,
      level,
      text,
      at: new Date().toLocaleTimeString(locale === 'ru' ? 'ru-RU' : 'en-US'),
    }]);
  }

  useEffect(() => {
    push('info', locale === 'ru'
      ? `${t('appTitle')} · командная строка готова. Введите help.`
      : `${t('appTitle')} · command line ready. Type help.`);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines, tab]);

  useEffect(() => {
    (window as any).api.getConsoleLog?.(80).then((rows: any[]) => {
      if (!Array.isArray(rows)) return;
      rows.reverse().forEach((row) => push((row.level || 'info') as any, `[${row.source || 'system'}] ${row.message}`));
    }).catch(() => {});
  }, [refreshToken]);

  async function runCommand(raw: string) {
    const command = raw.trim();
    if (!command) return;
    push('cmd', `> ${command}`);
    setHistory((current) => [command, ...current.filter((entry) => entry !== command)].slice(0, 40));
    setHistIdx(-1);
    setInput('');

    const [verb, ...rest] = command.split(/\s+/);
    const arg = rest.join(' ').trim();
    const lower = verb.toLowerCase();

    try {
      if (lower === 'help' || lower === '?') {
        (locale === 'ru' ? HELP_RU : HELP_EN).forEach((line) => push('info', line));
        return;
      }
      if (lower === 'clear' || lower === 'cls') {
        setLines([]);
        return;
      }
      if (lower === 'version') {
        push('ok', `${t('appTitle')} / ${t('appNameShort')}`);
        return;
      }
      if (lower === 'stats') {
        const overview = await (window as any).api.getDashboardAnalytics();
        push('ok', locale === 'ru'
          ? `Товаров: ${overview.item_count} · Остаток: ${overview.total_units} · Ячеек: ${overview.cell_count} · Ниже мин.: ${overview.low_stock_count}`
          : `Items: ${overview.item_count} · Stock: ${overview.total_units} · Cells: ${overview.cell_count} · Low: ${overview.low_stock_count}`);
        return;
      }
      if (lower === 'ports') {
        const ports = await (window as any).api.listScannerPorts();
        if (!ports?.length) push('warn', locale === 'ru' ? 'Порты не найдены' : 'No ports found');
        else ports.forEach((port: any) => push('info', `${port.path}${port.manufacturer ? ` · ${port.manufacturer}` : ''}`));
        return;
      }
      if (lower === 'users') {
        const users = await (window as any).api.listUsers();
        users.forEach((user: any) => push('info', `${user.login} · ${user.display_name} · ${user.role}${user.is_active ? '' : ' (off)'}`));
        return;
      }
      if (lower === 'org') {
        const session = await (window as any).api.getAuthSession();
        push('ok', `${session?.organization?.name || '—'} (#${session?.organization?.id || '—'})`);
        return;
      }
      if (lower === 'perm') {
        const session = await (window as any).api.getAuthSession();
        push('info', JSON.stringify(session?.permissions || {}, null, 0));
        return;
      }
      if (lower === 'backup') {
        const file = await (window as any).api.createBackup();
        if (file) { push('ok', file); onNotice(file); }
        else push('warn', locale === 'ru' ? 'Отменено' : 'Cancelled');
        return;
      }
      if (lower === 'errors') {
        setTab('errors');
        const errors = lines.filter((line) => line.level === 'error');
        if (!errors.length) push('info', locale === 'ru' ? 'Ошибок в сессии нет' : 'No errors in this session');
        else errors.slice(-20).forEach((line) => push('error', line.text));
        return;
      }
      if (lower === 'open') {
        if (!arg) { push('warn', locale === 'ru' ? 'Укажите раздел' : 'Specify a page'); return; }
        onOpenPage(arg);
        push('ok', locale === 'ru' ? `Открыт раздел: ${arg}` : `Opened: ${arg}`);
        return;
      }
      push('error', locale === 'ru' ? `Неизвестная команда: ${verb}` : `Unknown command: ${verb}`);
      await (window as any).api.logConsole?.('error', 'console', `Unknown command: ${verb}`);
    } catch (error: any) {
      const message = error?.message || String(error);
      push('error', message);
      await (window as any).api.logConsole?.('error', 'console', message);
    }
  }

  const visible = tab === 'errors' ? lines.filter((line) => line.level === 'error' || line.level === 'warn') : lines;

  return (
    <>
      <div className="page-header">
        <div>
          <div className="section-label">{t('console')}</div>
          <h1>{locale === 'ru' ? 'Командная строка' : 'Command line'}</h1>
          <p>{locale === 'ru' ? 'Консоль, терминал команд и журнал ошибок.' : 'Console, command terminal and error log.'}</p>
        </div>
      </div>

      <section className="card console-shell">
        <div className="console-tabs">
          <button type="button" className={`filter-chip ${tab === 'console' ? 'active' : ''}`} onClick={() => setTab('console')}>{locale === 'ru' ? 'Консоль' : 'Console'}</button>
          <button type="button" className={`filter-chip ${tab === 'terminal' ? 'active' : ''}`} onClick={() => setTab('terminal')}>{locale === 'ru' ? 'Терминал' : 'Terminal'}</button>
          <button type="button" className={`filter-chip ${tab === 'errors' ? 'active' : ''}`} onClick={() => setTab('errors')}>{locale === 'ru' ? 'Ошибки' : 'Errors'}</button>
          <button type="button" className="btn btn-text" onClick={() => setLines([])}>{locale === 'ru' ? 'Очистить' : 'Clear'}</button>
        </div>

        <div className={`console-output ${tab === 'terminal' ? 'terminal-mode' : ''}`}>
          {visible.length === 0 && <div className="console-empty">{locale === 'ru' ? 'Пусто' : 'Empty'}</div>}
          {visible.map((line) => (
            <div key={line.id} className={`console-line level-${line.level}`}>
              <span className="console-time">{line.at}</span>
              <span>{line.text}</span>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        <form
          className="console-input-row"
          onSubmit={(event) => { event.preventDefault(); void runCommand(input); }}
        >
          <span className="console-prompt">{t('appNameShort')}&gt;</span>
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={locale === 'ru' ? 'Команда…' : 'Command…'}
            autoComplete="off"
            spellCheck={false}
            onKeyDown={(event) => {
              if (event.key === 'ArrowUp') {
                event.preventDefault();
                const next = Math.min(history.length - 1, histIdx + 1);
                if (history[next]) { setHistIdx(next); setInput(history[next]); }
              }
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                const next = histIdx - 1;
                if (next < 0) { setHistIdx(-1); setInput(''); }
                else { setHistIdx(next); setInput(history[next]); }
              }
            }}
          />
          <button className="btn btn-primary" type="submit">{locale === 'ru' ? 'Выполнить' : 'Run'}</button>
        </form>
      </section>
    </>
  );
}
