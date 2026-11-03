import { useEffect, useMemo, useRef, useState } from 'react';
import CompanyUnfPage from './CompanyUnfPage';

type CrmTab = 'desk' | 'chat' | 'clients' | 'pipeline' | 'modes' | 'contracts' | 'sales' | 'org' | 'remote';

const PIPELINE_COLS: { id: string; label: string }[] = [
  { id: 'draft', label: 'Черновик' },
  { id: 'confirmed', label: 'Подтверждён' },
  { id: 'shipped', label: 'Отгружен' },
  { id: 'closed', label: 'Закрыт' },
  { id: 'cancelled', label: 'Отменён' },
];

const KIND_RU: Record<string, string> = {
  customer: 'Покупатель',
  supplier: 'Поставщик',
  partner: 'Партнёр',
  other: 'Прочий',
};

const CASE_STATUS_RU: Record<string, string> = {
  new: 'Новое',
  open: 'В работе',
  queued: 'В очереди',
  waiting: 'Ожидает',
  solved: 'Решено',
  closed: 'Закрыто',
};

const THEME_OK = new Set(['light', 'dark', 'oled', 'aurora', '1c-light', '1c-dark']);



export default function CrmShell() {
  const [tab, setTab] = useState<CrmTab>('desk');
  const [session, setSession] = useState<any>(null);
  const [theme, setTheme] = useState('1c-light');
  const [notice, setNotice] = useState('');
  const [refreshToken, setRefreshToken] = useState(0);
  const [sales, setSales] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);

  const [clients, setClients] = useState<any[]>([]);
  const [clientQ, setClientQ] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [card, setCard] = useState<any>(null);

  const [threads, setThreads] = useState<any[]>([]);
  const [cases, setCases] = useState<any[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<number | null>(null);
  const [thread, setThread] = useState<any>(null);
  const [chatBody, setChatBody] = useState('');
  const [draftByThread, setDraftByThread] = useState<Record<number, string>>({});
  const [newSubject, setNewSubject] = useState('');
  const [threadFilter, setThreadFilter] = useState<'all' | 'open' | 'mine'>('open');
  const [contextCollapsed, setContextCollapsed] = useState(false);

  const [opMode, setOpMode] = useState<any>(null);
  const [modeMeta, setModeMeta] = useState<Array<{ id: string; label: string }>>([]);
  const [allModes, setAllModes] = useState<any[]>([]);
  const [queues, setQueues] = useState<any[]>([]);
  const [slaBreaches, setSlaBreaches] = useState<any[]>([]);
  const [remoteStatus, setRemoteStatus] = useState<any>(null);
  const [remotePort, setRemotePort] = useState('47831');
  const [portalTokens, setPortalTokens] = useState<any[]>([]);
  const [issuedToken, setIssuedToken] = useState<string | null>(null);
  const [tokenLabel, setTokenLabel] = useState('');
  const eventCursor = useRef(0);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    document.title = 'Метрика [0.5 Домашняя] — CRM';
    (window as any).api.setTitleBarTheme?.(theme).catch(() => {});
  }, [theme]);

  useEffect(() => {
    (async () => {
      try {
        const s = await (window as any).api.getAuthSession?.();
        setSession(s);
        const savedTheme = await (window as any).api.getSetting?.('theme', '1c-light');
        if (savedTheme && THEME_OK.has(savedTheme)) setTheme(savedTheme);
        else if (savedTheme) setTheme('1c-light');
        const modes = await (window as any).api.crmOperatorModesMeta?.();
        setModeMeta(modes || []);
        const mode = await (window as any).api.getCrmOperatorMode?.();
        setOpMode(mode);
      } catch {  }
    })();
  }, []);

  useEffect(() => {
    const offTheme = (window as any).api.onSettingsChanged?.((payload: { key: string; value: string }) => {
      if (payload?.key === 'theme' && THEME_OK.has(payload.value)) setTheme(payload.value);
    });
    const offCrm = (window as any).api.onCrmChanged?.(() => {
      setRefreshToken((n) => n + 1);
    });
    return () => {
      try { offTheme?.(); } catch {  }
      try { offCrm?.(); } catch {  }
    };
  }, []);


  useEffect(() => {
    const timer = setInterval(async () => {
      try {
        const events = await (window as any).api.pollCrmEvents?.(eventCursor.current, 50);
        if (Array.isArray(events) && events.length) {
          eventCursor.current = Number(events[events.length - 1].id) || eventCursor.current;
          setRefreshToken((n) => n + 1);
        }
      } catch {  }
    }, 2500);
    return () => clearInterval(timer);
  }, []);

  async function loadPipeline() {
    try {
      const rows = await (window as any).api.listSalesOrders?.();
      setSales(rows || []);
    } catch (e: any) {
      setNotice(e?.message || 'Не удалось загрузить воронку');
    }
  }

  async function loadClients() {
    try {
      const rows = await (window as any).api.listCrmClients?.({ q: clientQ });
      setClients(rows || []);
    } catch (e: any) {
      setNotice(e?.message || 'Не удалось загрузить клиентов');
    }
  }

  async function loadCard(id: number) {
    try {
      const data = await (window as any).api.getCrmCard?.(id);
      setCard(data);
      setSelectedId(id);
    } catch (e: any) {
      setNotice(e?.message || 'Не удалось открыть карточку');
    }
  }

  async function loadThreads(counterpartyId?: number | null) {
    try {
      const filters: any = {};
      if (counterpartyId) filters.counterparty_id = counterpartyId;
      if (threadFilter === 'open') filters.status = 'open';
      if (threadFilter === 'mine') filters.mine = true;
      const rows = await (window as any).api.listCrmThreads?.(filters);
      setThreads(rows || []);
    } catch (e: any) {
      setNotice(e?.message || 'Не удалось загрузить диалоги');
    }
  }

  async function loadCases() {
    try {
      const rows = await (window as any).api.listCrmCases?.({ status: undefined });
      setCases(rows || []);
      const q = await (window as any).api.listCrmQueues?.();
      setQueues(q || []);
      const breaches = await (window as any).api.listCrmSlaBreaches?.();
      setSlaBreaches(breaches || []);
    } catch (e: any) {
      setNotice(e?.message || 'Не удалось загрузить обращения');
    }
  }

  async function claimFromQueue(queueCode?: string | null) {
    setBusy(true);
    try {
      const claimed = await (window as any).api.claimCrmNext?.(queueCode || null);
      if (!claimed) {
        setNotice(queueCode ? 'В очереди нет свободных обращений' : 'Нет обращений в очередях');
        return;
      }
      setNotice(`Назначено обращение #${claimed.id}`);
      if (claimed.thread_id) {
        setTab('chat');
        await openThread(Number(claimed.thread_id));
      }
      setRefreshToken((n) => n + 1);
    } catch (e: any) {
      setNotice(e?.message || 'Не удалось взять из очереди');
    } finally {
      setBusy(false);
    }
  }

  async function attachToThread() {
    if (!activeThreadId) return;
    setBusy(true);
    try {
      const updated = await (window as any).api.addCrmAttachment?.(activeThreadId, { asClient: false });
      if (updated) {
        setThread(updated);
        setNotice('Вложение добавлено');
      }
    } catch (e: any) {
      setNotice(e?.message || 'Не удалось прикрепить файл');
    } finally {
      setBusy(false);
    }
  }

  async function openThread(id: number) {
    try {
      const data = await (window as any).api.getCrmThread?.(id);
      setThread(data);
      setActiveThreadId(id);
      if (data?.counterparty_id) {
        setSelectedId(Number(data.counterparty_id));
        void loadCard(Number(data.counterparty_id));
      }
      setChatBody(draftByThread[id] || '');
    } catch (e: any) {
      setNotice(e?.message || 'Не удалось открыть диалог');
    }
  }

  async function loadModes() {
    try {
      const mine = await (window as any).api.getCrmOperatorMode?.();
      setOpMode(mine);
      const all = await (window as any).api.listCrmOperatorModes?.();
      setAllModes(all || []);
    } catch (e: any) {
      setNotice(e?.message || 'Не удалось загрузить режимы');
    }
  }

  useEffect(() => {
    if (tab === 'pipeline') void loadPipeline();
    if (tab === 'clients' || tab === 'chat' || tab === 'desk' || tab === 'remote') void loadClients();
    if (tab === 'chat' || tab === 'desk') {
      void loadThreads(tab === 'chat' ? selectedId : null);
      void loadCases();
      if (activeThreadId) void openThread(activeThreadId);
    }
    if (tab === 'modes') void loadModes();
    if (tab === 'remote') void loadRemote();
  }, [tab, refreshToken, threadFilter]);


  useEffect(() => {
    if (tab === 'chat') void loadThreads(selectedId);
  }, [selectedId, tab]);

  useEffect(() => {
    if (tab === 'clients') {
      const t = setTimeout(() => void loadClients(), 200);
      return () => clearTimeout(t);
    }
  }, [clientQ]);

  useEffect(() => {
    if (selectedId && (tab === 'clients' || tab === 'chat' || tab === 'desk')) void loadCard(selectedId);
  }, [selectedId, refreshToken]);


  useEffect(() => {
    if (!activeThreadId) return;
    setDraftByThread((prev) => ({ ...prev, [activeThreadId]: chatBody }));
  }, [chatBody, activeThreadId]);

  const byStatus = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const col of PIPELINE_COLS) map[col.id] = [];
    for (const row of sales) {
      const key = PIPELINE_COLS.some((c) => c.id === row.status) ? row.status : 'draft';
      map[key].push(row);
    }
    return map;
  }, [sales]);

  const openCases = useMemo(
    () => (cases || []).filter((c) => !['closed', 'solved'].includes(c.status)),
    [cases],
  );

  async function moveStatus(row: any, status: string) {
    setBusy(true);
    try {
      const full = await (window as any).api.getSalesOrder?.(row.id);
      await (window as any).api.saveSalesOrder?.({
        ...(full || row),
        id: row.id,
        status,
        lines: full?.lines || [],
      });
      setRefreshToken((n) => n + 1);
      setNotice(`Заказ ${row.order_no || row.id} → ${PIPELINE_COLS.find((c) => c.id === status)?.label || status}`);
    } catch (e: any) {
      setNotice(e?.message || 'Не удалось сменить статус');
    } finally {
      setBusy(false);
    }
  }

  async function changeMode(mode: string) {
    try {
      const next = await (window as any).api.setCrmOperatorMode?.(mode);
      setOpMode(next);
      setNotice(`Режим: ${next?.label || mode}`);
      if (tab === 'modes') void loadModes();
    } catch (e: any) {
      setNotice(e?.message || 'Не удалось сменить режим');
    }
  }

  async function loadRemote() {
    try {
      const st = await (window as any).api.crmRemoteStatus?.();
      setRemoteStatus(st);
      if (st?.port) setRemotePort(String(st.port));
      const tokens = await (window as any).api.listCrmPortalTokens?.(selectedId || undefined);
      setPortalTokens(tokens || []);
    } catch (e: any) {
      setNotice(e?.message || 'Не удалось загрузить RemoteHttp');
    }
  }

  async function startRemote() {
    setBusy(true);
    try {
      const port = Number(remotePort) || undefined;
      const st = await (window as any).api.crmRemoteStart?.(port);
      setRemoteStatus(st);
      setNotice(st?.note || 'HTTP-мост запущен');
    } catch (e: any) {
      setNotice(e?.message || 'Не удалось запустить мост');
    } finally {
      setBusy(false);
    }
  }

  async function stopRemote() {
    setBusy(true);
    try {
      const st = await (window as any).api.crmRemoteStop?.();
      setRemoteStatus(st);
      setNotice('HTTP-мост остановлен');
    } catch (e: any) {
      setNotice(e?.message || 'Не удалось остановить мост');
    } finally {
      setBusy(false);
    }
  }

  async function saveRemotePort() {
    setBusy(true);
    try {
      const st = await (window as any).api.crmRemoteSetPort?.(Number(remotePort));
      setRemoteStatus(st);
      setNotice(`Порт: ${st?.port}`);
    } catch (e: any) {
      setNotice(e?.message || 'Не удалось сохранить порт');
    } finally {
      setBusy(false);
    }
  }

  async function issueToken() {
    if (!selectedId) {
      setNotice('Выберите контрагента на вкладке «Контрагенты» или в списке ниже');
      return;
    }
    setBusy(true);
    try {
      const row = await (window as any).api.issueCrmPortalToken?.(selectedId, tokenLabel || undefined);
      setIssuedToken(row?.token || null);
      setNotice(row?.note || 'Токен выдан');
      setTokenLabel('');
      await loadRemote();
    } catch (e: any) {
      setNotice(e?.message || 'Не удалось выдать токен');
    } finally {
      setBusy(false);
    }
  }

  async function revokeToken(id: number) {
    setBusy(true);
    try {
      await (window as any).api.revokeCrmPortalToken?.(id);
      setNotice('Токен отозван');
      await loadRemote();
    } catch (e: any) {
      setNotice(e?.message || 'Не удалось отозвать токен');
    } finally {
      setBusy(false);
    }
  }

  async function startThread() {
    if (!selectedId) {
      setNotice('Выберите контрагента');
      return;
    }
    setBusy(true);
    try {
      const opened = await (window as any).api.openCrmThread?.({
        counterparty_id: selectedId,
        subject: newSubject || undefined,
        body: chatBody || undefined,
      });
      setNewSubject('');
      setChatBody('');
      setThread(opened);
      setActiveThreadId(opened?.id || null);
      setTab('chat');
      setRefreshToken((n) => n + 1);
      setNotice('Диалог открыт');
    } catch (e: any) {
      setNotice(e?.message || 'Не удалось открыть диалог');
    } finally {
      setBusy(false);
    }
  }

  async function sendMessage() {
    if (!activeThreadId || !chatBody.trim()) return;
    setBusy(true);
    try {
      const updated = await (window as any).api.postCrmMessage?.(activeThreadId, {
        body: chatBody,
        author_kind: 'staff',
        client_msg_id: `staff-${activeThreadId}-${Date.now()}`,
      });
      setThread(updated);
      setChatBody('');
      setDraftByThread((prev) => {
        const next = { ...prev };
        delete next[activeThreadId];
        return next;
      });
      void loadThreads(selectedId);
    } catch (e: any) {
      setNotice(e?.message || 'Не удалось отправить');
    } finally {
      setBusy(false);
    }
  }

  async function assignActiveCase() {
    const caseId = thread?.case?.id;
    if (!caseId) return;
    setBusy(true);
    try {
      await (window as any).api.assignCrmCase?.(caseId);
      setNotice('Обращение назначено на вас');
      if (activeThreadId) await openThread(activeThreadId);
      setRefreshToken((n) => n + 1);
    } catch (e: any) {
      setNotice(e?.message || 'Не удалось назначить');
    } finally {
      setBusy(false);
    }
  }

  const orgName = session?.organization?.name || 'Организация';
  const userName = [session?.user?.last_name, session?.user?.first_name || session?.user?.display_name]
    .filter(Boolean).join(' ') || session?.user?.login || '—';

  if (session && session.user?.role !== 'admin' && !session.permissions?.company) {
    return (
      <div className="app-shell configurator-app">
        <div className="title-bar">
          <div className="title-bar-brand">Метрика [0.5 Домашняя] — CRM</div>
        </div>
        <main className="main configurator-main" style={{ padding: 24 }}>
          <h1>Нет доступа</h1>
          <p>Для CRM нужна роль администратора или право «Компания (УНФ)».</p>
        </main>
      </div>
    );
  }

  function renderContextPane() {
    if (contextCollapsed) {
      return (
        <aside className="crm-context-pane is-collapsed">
          <button type="button" className="btn btn-secondary" onClick={() => setContextCollapsed(false)}>
            Контекст
          </button>
        </aside>
      );
    }
    if (!card) {
      return (
        <aside className="crm-context-pane">
          <header className="crm-chat-head">
            <strong>Контекст</strong>
            <button type="button" className="btn btn-secondary" onClick={() => setContextCollapsed(true)}>Скрыть</button>
          </header>
          <div className="muted" style={{ padding: 16 }}>Выберите диалог — справа появятся контрагент, заказы и поставки</div>
        </aside>
      );
    }
    return (
      <aside className="crm-context-pane">
        <header className="crm-chat-head">
          <div>
            <strong>{card.name}</strong>
            <div className="subtext">
              {KIND_RU[card.kind] || card.kind}
              {card.has_portal ? ' · портал' : ''}
            </div>
          </div>
          <button type="button" className="btn btn-secondary" onClick={() => setContextCollapsed(true)}>Скрыть</button>
        </header>
        <div className="crm-context-body">
          <div className="section-label">Контакты</div>
          <p className="crm-context-line">{card.contact_person || '—'}</p>
          <p className="crm-context-line">{card.phone || '—'}</p>
          <p className="crm-context-line">{card.email || '—'}</p>

          <div className="section-label" style={{ marginTop: 12 }}>Связи ERP</div>
          <p className="crm-context-line">Поставщик: {card.supplier_name || '—'}</p>
          <p className="crm-context-line">Сотрудник: {card.employee_name || '—'}</p>
          <p className="crm-context-line">Клиент-user: {card.portal_user_id ? `#${card.portal_user_id}` : '—'}</p>

          {(card.custom_values || []).some((f: any) => f.value_text != null && String(f.value_text) !== '') && (
            <>
              <div className="section-label" style={{ marginTop: 12 }}>Доп. реквизиты</div>
              {(card.custom_values || [])
                .filter((f: any) => f.value_text != null && String(f.value_text) !== '')
                .map((f: any) => (
                  <p key={f.field_key || f.field_id} className="crm-context-line">
                    {f.label}: {f.field_type === 'bool' ? (f.value_text === '1' ? 'Да' : 'Нет') : f.value_text}
                  </p>
                ))}
            </>
          )}

          <div className="section-label" style={{ marginTop: 12 }}>Заказы продажи ({card.sales?.length || 0})</div>
          <ul className="crm-mini-list">
            {(card.sales || []).slice(0, 6).map((s: any) => (
              <li key={s.id}>{s.order_no || s.id} · {s.status}</li>
            ))}
            {!card.sales?.length && <li className="muted">Нет</li>}
          </ul>

          <div className="section-label" style={{ marginTop: 12 }}>Закупки ({card.purchase_orders?.length || 0})</div>
          <ul className="crm-mini-list">
            {(card.purchase_orders || []).slice(0, 6).map((p: any) => (
              <li key={p.id}>{p.order_no || p.id} · {p.status}</li>
            ))}
            {!card.purchase_orders?.length && <li className="muted">Нет</li>}
          </ul>

          <div className="section-label" style={{ marginTop: 12 }}>Поставки ({card.shipments?.length || 0})</div>
          <ul className="crm-mini-list">
            {(card.shipments || []).slice(0, 6).map((s: any) => (
              <li key={s.id}>
                {s.order_no || s.purchase_order_id} · {s.status}
                {s.tracking_no ? ` · ${s.tracking_no}` : ''}
                {s.note ? ` · ${s.note}` : ''}
              </li>
            ))}
            {!card.shipments?.length && <li className="muted">Нет</li>}
          </ul>

          <div className="section-label" style={{ marginTop: 12 }}>Товары поставщика ({card.supplier_items?.length || 0})</div>
          <ul className="crm-mini-list">
            {(card.supplier_items || []).slice(0, 8).map((si: any) => (
              <li key={si.id}>{si.item_name || si.sku || si.item_id}</li>
            ))}
            {!card.supplier_items?.length && <li className="muted">Нет</li>}
          </ul>

          {thread?.case && (
            <>
              <div className="section-label" style={{ marginTop: 12 }}>Обращение #{thread.case.id}</div>
              <p className="crm-context-line">
                {CASE_STATUS_RU[thread.case.status] || thread.case.status}
                {thread.case.queue_id ? ` · ${thread.case.queue_id}` : ''}
                {thread.case.assigned_name ? ` · ${thread.case.assigned_name}` : ' · не назначено'}
              </p>
              {(thread.case.sla_response_overdue || thread.case.sla_resolve_overdue) && (
                <p className="crm-sla-badge is-overdue">Просрочен SLA</p>
              )}
              {thread.case.sla_response_due && (
                <p className="crm-context-line muted">Ответ до: {thread.case.sla_response_due}</p>
              )}
              <button type="button" className="btn btn-secondary" style={{ marginTop: 8 }} disabled={busy} onClick={() => void assignActiveCase()}>
                Назначить на меня
              </button>
            </>
          )}
        </div>
      </aside>
    );
  }

  return (
    <div className="app-shell configurator-app crm-app">
      <div className="title-bar">
        <div className="title-bar-brand">Метрика [0.5 Домашняя] — CRM</div>
        <div className="title-bar-drag" />
        <div className="title-bar-session" title={orgName}>
          {userName} · {orgName}
          {opMode?.label ? ` · ${opMode.label}` : ''}
        </div>
      </div>
      <div className="configurator-toolbar">
        {(
          [
            ['desk', 'Рабочий стол'],
            ['chat', 'Чаты'],
            ['clients', 'Контрагенты'],
            ['pipeline', 'Воронка'],
            ['modes', 'Режимы'],
            ['contracts', 'Договоры'],
            ['sales', 'Заказы'],
            ['org', 'Справочники'],
            ['remote', 'Remote'],
          ] as [CrmTab, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`btn ${tab === id ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
        <span style={{ flex: 1 }} />
        <select
          className="crm-mode-select"
          value={opMode?.mode || 'offline'}
          onChange={(e) => void changeMode(e.target.value)}
          title="Режим оператора (не статус обращения)"
        >
          {(modeMeta.length ? modeMeta : [
            { id: 'available', label: 'На линии' },
            { id: 'busy', label: 'Занят' },
            { id: 'break', label: 'Перерыв' },
            { id: 'offline', label: 'Не в сети' },
          ]).map((m) => (
            <option key={m.id} value={m.id}>{m.label}</option>
          ))}
        </select>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => {
            setRefreshToken((n) => n + 1);
            setNotice('Обновлено');
          }}
        >
          Обновить
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => void (window as any).api.focusMainWindow?.()}
        >
          Основное окно
        </button>
      </div>
      {notice && (
        <div className="notice-bar" role="status" onClick={() => setNotice('')}>
          {notice}
        </div>
      )}
      <main className="main configurator-main crm-main">
        {tab === 'desk' && (
          <div className="crm-desk">
            <div className="page-header" style={{ marginBottom: 12 }}>
              <div>
                <div className="section-label">CRM</div>
                <h1>Рабочий стол</h1>
                <p>Очереди, SLA и диалоги на объектах ERP — без копий справочников.</p>
              </div>
              <div className="crm-card-actions">
                <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void claimFromQueue(null)}>
                  Взять следующее
                </button>
              </div>
            </div>
            {(queues.length > 0 || slaBreaches.length > 0) && (
              <div className="crm-desk-meta" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                {queues.map((q) => (
                  <button
                    key={q.id}
                    type="button"
                    className="btn btn-secondary"
                    disabled={busy}
                    onClick={() => void claimFromQueue(q.code)}
                    title={q.title}
                  >
                    {q.title} · {q.open_count || 0}
                  </button>
                ))}
                {slaBreaches.length > 0 && (
                  <span className="crm-sla-badge is-overdue">SLA просрочено: {slaBreaches.length}</span>
                )}
              </div>
            )}
            <div className="crm-desk-grid">
              <section className="crm-desk-panel">
                <header><strong>Открытые обращения</strong><span className="table-caption">{openCases.length}</span></header>
                <div className="crm-list">
                  {openCases.slice(0, 40).map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className="crm-list-item"
                      onClick={() => {
                        if (c.thread_id) {
                          setTab('chat');
                          void openThread(Number(c.thread_id));
                        }
                      }}
                    >
                      <strong>{c.subject}</strong>
                      <span className="subtext">
                        {c.counterparty_name} · {CASE_STATUS_RU[c.status] || c.status}
                        {c.queue_id ? ` · ${c.queue_id}` : ''}
                        {c.assigned_name ? ` · ${c.assigned_name}` : ''}
                        {c.sla_response_overdue || c.sla_resolve_overdue ? ' · SLA!' : ''}
                      </span>
                    </button>
                  ))}
                  {openCases.length === 0 && <div className="muted" style={{ padding: 12 }}>Нет открытых обращений</div>}
                </div>
              </section>
              <section className="crm-desk-panel">
                <header><strong>Последние диалоги</strong></header>
                <div className="crm-list">
                  {threads.slice(0, 40).map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className="crm-list-item"
                      onClick={() => {
                        setTab('chat');
                        void openThread(t.id);
                      }}
                    >
                      <strong>{t.subject}</strong>
                      <span className="subtext">{t.counterparty_name} · {t.status}</span>
                      {t.last_body && <span className="crm-preview">{t.last_body}</span>}
                    </button>
                  ))}
                  {threads.length === 0 && <div className="muted" style={{ padding: 12 }}>Нет диалогов</div>}
                </div>
              </section>
            </div>
          </div>
        )}

        {tab === 'pipeline' && (
          <div className="crm-pipeline">
            <div className="page-header" style={{ marginBottom: 12 }}>
              <div>
                <div className="section-label">CRM</div>
                <h1>Воронка заказов</h1>
                <p>Заказы покупателей из контура «Компания» — без отдельного справочника лиц.</p>
              </div>
            </div>
            <div className="crm-pipeline-board">
              {PIPELINE_COLS.map((col) => (
                <section key={col.id} className="crm-pipeline-col">
                  <header>
                    <strong>{col.label}</strong>
                    <span className="table-caption">{byStatus[col.id]?.length || 0}</span>
                  </header>
                  <div className="crm-pipeline-cards">
                    {(byStatus[col.id] || []).map((row) => (
                      <article key={row.id} className="crm-pipeline-card">
                        <div className="crm-pipeline-card-title">{row.order_no || `#${row.id}`}</div>
                        <div className="subtext">
                          <button
                            type="button"
                            className="linkish"
                            onClick={() => {
                              if (row.counterparty_id) {
                                setSelectedId(Number(row.counterparty_id));
                                setTab('clients');
                              }
                            }}
                          >
                            {row.counterparty_name || 'Без контрагента'}
                          </button>
                        </div>
                        <div className="crm-pipeline-card-meta">
                          <span>{Number(row.total_amount || 0).toLocaleString('ru-RU')}</span>
                          <span>{row.direction_name || '—'}</span>
                        </div>
                        <div className="crm-pipeline-card-actions">
                          {PIPELINE_COLS.filter((c) => c.id !== col.id).slice(0, 3).map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              className="btn btn-secondary"
                              disabled={busy}
                              onClick={() => void moveStatus(row, c.id)}
                            >
                              → {c.label}
                            </button>
                          ))}
                        </div>
                      </article>
                    ))}
                    {(byStatus[col.id] || []).length === 0 && (
                      <div className="muted" style={{ padding: 8, fontSize: 13 }}>Пусто</div>
                    )}
                  </div>
                </section>
              ))}
            </div>
          </div>
        )}

        {tab === 'clients' && (
          <div className="crm-clients">
            <div className="page-header" style={{ marginBottom: 12 }}>
              <div>
                <div className="section-label">CRM</div>
                <h1>Карточки контрагентов</h1>
                <p>
                  Один объект ERP — роли через связи: поставщик товаров, сотрудник, учётная запись Метрика:Клиент.
                </p>
              </div>
            </div>
            <div className="crm-split">
              <aside className="crm-list-pane">
                <input
                  className="crm-search"
                  placeholder="Поиск…"
                  value={clientQ}
                  onChange={(e) => setClientQ(e.target.value)}
                />
                <div className="crm-list">
                  {clients.map((row) => (
                    <button
                      key={row.id}
                      type="button"
                      className={`crm-list-item ${selectedId === row.id ? 'is-active' : ''}`}
                      onClick={() => setSelectedId(row.id)}
                    >
                      <strong>{row.name}</strong>
                      <span className="subtext">
                        {KIND_RU[row.kind] || row.kind}
                        {row.has_portal ? ' · Клиент' : ''}
                        {row.supplier_id ? ' · Поставщик' : ''}
                        {row.employee_id ? ' · Сотрудник' : ''}
                      </span>
                    </button>
                  ))}
                  {clients.length === 0 && <div className="muted" style={{ padding: 12 }}>Нет записей</div>}
                </div>
              </aside>
              <section className="crm-card-pane">
                {!card ? (
                  <div className="muted" style={{ padding: 24 }}>Выберите контрагента слева</div>
                ) : (
                  <div className="crm-card">
                    <header className="crm-card-head">
                      <div>
                        <h2>{card.name}</h2>
                        <p className="subtext">
                          {KIND_RU[card.kind] || card.kind}
                          {card.inn ? ` · ИНН ${card.inn}` : ''}
                        </p>
                      </div>
                      <div className="crm-card-actions">
                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={() => {
                            setTab('chat');
                            void loadThreads(selectedId);
                          }}
                        >
                          К чату
                        </button>
                        <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void startThread()}>
                          Новый диалог
                        </button>
                      </div>
                    </header>
                    <div className="crm-card-grid">
                      <div>
                        <div className="section-label">Контакты</div>
                        <p>{card.contact_person || '—'}</p>
                        <p>{card.phone || '—'}</p>
                        <p>{card.email || '—'}</p>
                        <p>{card.address || '—'}</p>
                      </div>
                      <div>
                        <div className="section-label">Связи метаданных</div>
                        <p>Поставщик: {card.supplier_name || (card.supplier_id ? `#${card.supplier_id}` : '—')}</p>
                        <p>Сотрудник: {card.employee_name || (card.employee_id ? `#${card.employee_id}` : '—')}</p>
                        <p>Метрика:Клиент: {card.portal_user_id ? `user #${card.portal_user_id}` : 'не привязан'}</p>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{ marginTop: 8 }}
                          disabled={busy}
                          onClick={() => { setTab('remote'); void loadRemote(); }}
                        >
                          Токен / RemoteHttp
                        </button>
                      </div>
                    </div>
                    <div className="crm-card-sections">
                      <div>
                        <div className="section-label">Заказы ({card.sales?.length || 0})</div>
                        <ul className="crm-mini-list">
                          {(card.sales || []).slice(0, 8).map((s: any) => (
                            <li key={s.id}>{s.order_no || s.id} · {s.status}</li>
                          ))}
                          {!card.sales?.length && <li className="muted">Нет</li>}
                        </ul>
                      </div>
                      <div>
                        <div className="section-label">Закупки ({card.purchase_orders?.length || 0})</div>
                        <ul className="crm-mini-list">
                          {(card.purchase_orders || []).slice(0, 8).map((p: any) => (
                            <li key={p.id}>{p.order_no || p.id} · {p.status}</li>
                          ))}
                          {!card.purchase_orders?.length && <li className="muted">Нет</li>}
                        </ul>
                      </div>
                      <div>
                        <div className="section-label">Поставки ({card.shipments?.length || 0})</div>
                        <ul className="crm-mini-list">
                          {(card.shipments || []).slice(0, 8).map((s: any) => (
                            <li key={s.id}>{s.order_no} · {s.status}{s.note ? ` · ${s.note}` : ''}</li>
                          ))}
                          {!card.shipments?.length && <li className="muted">Нет</li>}
                        </ul>
                      </div>
                      <div>
                        <div className="section-label">Диалоги ({card.threads?.length || 0})</div>
                        <ul className="crm-mini-list">
                          {(card.threads || []).slice(0, 8).map((t: any) => (
                            <li key={t.id}>
                              <button type="button" className="linkish" onClick={() => { setActiveThreadId(t.id); setTab('chat'); void openThread(t.id); }}>
                                {t.subject}
                              </button>
                              <span className="muted"> · {t.status}</span>
                            </li>
                          ))}
                          {!card.threads?.length && <li className="muted">Нет</li>}
                        </ul>
                      </div>
                    </div>
                    <div style={{ marginTop: 16 }}>
                      <CompanyUnfPage
                        refreshToken={refreshToken}
                        onNotice={setNotice}
                        onChanged={() => { setRefreshToken((n) => n + 1); if (selectedId) void loadCard(selectedId); }}
                        initialTab="counterparties"
                        embedded
                      />
                    </div>
                  </div>
                )}
              </section>
            </div>
          </div>
        )}

        {tab === 'chat' && (
          <div className="crm-chat crm-chat-workspace">
            <div className={`crm-tri ${contextCollapsed ? 'is-context-collapsed' : ''}`}>
              <aside className="crm-list-pane">
                <div className="crm-chat-new">
                  <div className="crm-filter-row">
                    <button type="button" className={`btn ${threadFilter === 'open' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setThreadFilter('open')}>Открытые</button>
                    <button type="button" className={`btn ${threadFilter === 'all' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setThreadFilter('all')}>Все</button>
                    <button type="button" className={`btn ${threadFilter === 'mine' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setThreadFilter('mine')}>Мои</button>
                  </div>
                  <select
                    value={selectedId || ''}
                    onChange={(e) => setSelectedId(e.target.value ? Number(e.target.value) : null)}
                  >
                    <option value="">Все контрагенты…</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  <input
                    placeholder="Тема диалога"
                    value={newSubject}
                    onChange={(e) => setNewSubject(e.target.value)}
                  />
                  <button type="button" className="btn btn-primary" disabled={busy || !selectedId} onClick={() => void startThread()}>
                    Новый диалог
                  </button>
                </div>
                <div className="crm-list">
                  {threads.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className={`crm-list-item ${activeThreadId === t.id ? 'is-active' : ''}`}
                      onClick={() => void openThread(t.id)}
                    >
                      <strong>{t.subject}</strong>
                      <span className="subtext">{t.counterparty_name} · {t.status}</span>
                      {t.last_body && <span className="crm-preview">{t.last_body}</span>}
                    </button>
                  ))}
                  {threads.length === 0 && <div className="muted" style={{ padding: 12 }}>Нет диалогов</div>}
                </div>
              </aside>

              <section className="crm-chat-pane">
                {!thread ? (
                  <div className="muted" style={{ padding: 24 }}>Выберите или создайте диалог</div>
                ) : (
                  <>
                    <header className="crm-chat-head">
                      <div>
                        <strong>{thread.subject}</strong>
                        <div className="subtext">
                          {thread.counterparty_name} · {thread.status}
                          {thread.case ? ` · обращение #${thread.case.id} (${CASE_STATUS_RU[thread.case.status] || thread.case.status})` : ''}
                        </div>
                      </div>
                      <div className="crm-card-actions">
                        {thread.status !== 'closed' && (
                          <button type="button" className="btn btn-secondary" onClick={() => void (window as any).api.setCrmThreadStatus?.(thread.id, 'closed').then((t: any) => { setThread(t); void loadThreads(selectedId); })}>
                            Закрыть
                          </button>
                        )}
                        {thread.status === 'closed' && (
                          <button type="button" className="btn btn-secondary" onClick={() => void (window as any).api.setCrmThreadStatus?.(thread.id, 'open').then((t: any) => { setThread(t); void loadThreads(selectedId); })}>
                            Открыть снова
                          </button>
                        )}
                      </div>
                    </header>
                    <div className="crm-messages">
                      {(thread.messages || []).map((m: any) => (
                        <div key={m.id} className={`crm-msg crm-msg-${m.author_kind}${m.is_internal ? ' is-internal' : ''}`}>
                          <div className="crm-msg-meta">
                            <strong>{m.author_name || m.author_kind}{m.is_internal ? ' · внутр.' : ''}</strong>
                            <span>{m.created_at}</span>
                          </div>
                          <div className="crm-msg-body">{m.body}</div>
                          {(m.attachments || []).length > 0 && (
                            <div className="crm-msg-files">
                              {m.attachments.map((a: any) => (
                                <button
                                  key={a.id}
                                  type="button"
                                  className="linkish"
                                  onClick={() => void (window as any).api.openCrmAttachment?.(a.id)}
                                >
                                  {a.file_name}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    <div className="crm-compose">
                      <textarea
                        rows={3}
                        value={chatBody}
                        onChange={(e) => setChatBody(e.target.value)}
                        placeholder="Ответ оператора…"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                            e.preventDefault();
                            void sendMessage();
                          }
                        }}
                      />
                      <div className="crm-compose-actions">
                        <button type="button" className="btn btn-primary" disabled={busy || !chatBody.trim()} onClick={() => void sendMessage()}>
                          Ответить
                        </button>
                        <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void attachToThread()}>
                          Вложение
                        </button>
                        <span className="muted" style={{ fontSize: 12 }}>Ctrl+Enter</span>
                      </div>
                    </div>
                  </>
                )}
              </section>

              {renderContextPane()}
            </div>
          </div>
        )}

        {tab === 'modes' && (
          <div className="crm-modes">
            <div className="page-header" style={{ marginBottom: 12 }}>
              <div>
                <div className="section-label">CRM</div>
                <h1>Режимы операторов</h1>
                <p>Доступность сотрудника (на линии / перерыв) — отдельно от статуса обращения.</p>
              </div>
            </div>
            <div className="crm-mode-current">
              <span>Ваш режим:</span>
              <strong>{opMode?.label || '—'}</strong>
              <div className="crm-mode-buttons">
                {(modeMeta.length ? modeMeta : [
                  { id: 'available', label: 'На линии' },
                  { id: 'busy', label: 'Занят' },
                  { id: 'break', label: 'Перерыв' },
                  { id: 'offline', label: 'Не в сети' },
                ]).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className={`btn ${opMode?.mode === m.id ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => void changeMode(m.id)}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
            <table className="data-table" style={{ marginTop: 16 }}>
              <thead>
                <tr>
                  <th>Пользователь</th>
                  <th>Режим</th>
                  <th>С</th>
                  <th>Заметка</th>
                </tr>
              </thead>
              <tbody>
                {allModes.map((row) => (
                  <tr key={row.user_id}>
                    <td>#{row.user_id}</td>
                    <td>{modeMeta.find((m) => m.id === row.mode)?.label || row.mode}</td>
                    <td>{row.since || '—'}</td>
                    <td>{row.note || '—'}</td>
                  </tr>
                ))}
                {allModes.length === 0 && (
                  <tr><td colSpan={4} className="muted">Пока никто не отмечался</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'contracts' && (
          <CompanyUnfPage
            refreshToken={refreshToken}
            onNotice={setNotice}
            onChanged={() => setRefreshToken((n) => n + 1)}
            initialTab="contracts"
            embedded
          />
        )}
        {tab === 'sales' && (
          <CompanyUnfPage
            refreshToken={refreshToken}
            onNotice={setNotice}
            onChanged={() => setRefreshToken((n) => n + 1)}
            initialTab="sales"
            embedded
          />
        )}
        {tab === 'org' && (
          <div style={{ padding: '8px 4px 24px' }}>
            <div className="page-header">
              <div>
                <div className="section-label">Организация</div>
                <h1>Справочники (орг. сторона)</h1>
                <p>Виды цен и направления — те же объекты, что в разделе «Компания» основного окна.</p>
              </div>
            </div>
            <CompanyUnfPage
              refreshToken={refreshToken}
              onNotice={setNotice}
              onChanged={() => setRefreshToken((n) => n + 1)}
              initialTab="prices"
              embedded
            />
          </div>
        )}

        {tab === 'remote' && (
          <div style={{ padding: '8px 4px 24px', maxWidth: 820 }}>
            <div className="page-header" style={{ marginBottom: 16 }}>
              <div>
                <div className="section-label">Метрика:Клиент</div>
                <h1>RemoteHttp</h1>
                <p>
                  HTTP-мост для клиента на другом устройстве. SQLite не шарится — только Bearer portal-токен.
                </p>
              </div>
            </div>
            <div className="crm-card-grid" style={{ marginBottom: 20 }}>
              <div>
                <div className="section-label">Статус моста</div>
                <p>{remoteStatus?.listening ? 'Слушает' : 'Выключен'}</p>
                <p className="muted" style={{ fontSize: 13 }}>{remoteStatus?.note}</p>
                {(remoteStatus?.urls || []).map((u: string) => (
                  <p key={u} style={{ fontFamily: 'ui-monospace, monospace', fontSize: 13 }}>{u}</p>
                ))}
              </div>
              <div>
                <div className="section-label">Порт</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <input
                    style={{ width: 100 }}
                    value={remotePort}
                    onChange={(e) => setRemotePort(e.target.value)}
                    inputMode="numeric"
                  />
                  <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void saveRemotePort()}>
                    Сохранить
                  </button>
                  {!remoteStatus?.listening ? (
                    <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void startRemote()}>
                      Запустить
                    </button>
                  ) : (
                    <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void stopRemote()}>
                      Остановить
                    </button>
                  )}
                  <button type="button" className="btn btn-secondary" onClick={() => void loadRemote()}>Обновить</button>
                </div>
              </div>
            </div>

            <div className="page-header" style={{ marginBottom: 12 }}>
              <div>
                <div className="section-label">Portal-токены</div>
                <h2 style={{ fontSize: 18, margin: 0 }}>Выдача доступа клиенту</h2>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
              <select
                value={selectedId || ''}
                onChange={(e) => setSelectedId(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">Контрагент…</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <input
                placeholder="Метка токена"
                value={tokenLabel}
                onChange={(e) => setTokenLabel(e.target.value)}
                style={{ minWidth: 160 }}
              />
              <button type="button" className="btn btn-primary" disabled={busy || !selectedId} onClick={() => void issueToken()}>
                Выдать токен
              </button>
            </div>
            {issuedToken && (
              <div className="notice-bar" role="status" style={{ marginBottom: 12 }}>
                Новый токен (сохраните сейчас): <code style={{ userSelect: 'all' }}>{issuedToken}</code>
              </div>
            )}
            <table className="data-table">
              <thead>
                <tr>
                  <th>Префикс</th>
                  <th>Контрагент</th>
                  <th>Метка</th>
                  <th>Создан</th>
                  <th>Статус</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {portalTokens.map((t) => (
                  <tr key={t.id}>
                    <td><code>{t.token_prefix}</code></td>
                    <td>{t.counterparty_name}</td>
                    <td>{t.label || '—'}</td>
                    <td>{t.created_at}</td>
                    <td>{t.revoked_at ? 'отозван' : 'активен'}</td>
                    <td>
                      {!t.revoked_at && (
                        <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void revokeToken(t.id)}>
                          Отозвать
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {!portalTokens.length && (
                  <tr><td colSpan={6} className="muted">Нет токенов</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
