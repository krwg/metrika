import { useEffect, useRef, useState } from 'react';
import {
  clearRemoteConfig,
  hasRemoteConfig,
  loadRemoteConfig,
  remoteApi,
  remoteAuth,
  saveRemoteConfig,
  type RemoteConfig,
} from '../clientRemoteApi';

type ClientTab = 'home' | 'messages' | 'orders' | 'shipments' | 'documents' | 'profile';



export default function ClientPortalShell() {
  const [session, setSession] = useState<any>(null);
  const [ctx, setCtx] = useState<any>(null);
  const [theme, setTheme] = useState('1c-light');
  const [notice, setNotice] = useState('');
  const [tab, setTab] = useState<ClientTab>('messages');
  const [threads, setThreads] = useState<any[]>([]);
  const [thread, setThread] = useState<any>(null);
  const [body, setBody] = useState('');
  const [subject, setSubject] = useState('');
  const [busy, setBusy] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [remoteMode, setRemoteMode] = useState(() => hasRemoteConfig());
  const [remoteForm, setRemoteForm] = useState<RemoteConfig>(() => loadRemoteConfig());
  const eventCursor = useRef(0);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    document.title = 'Метрика [0.5 Домашняя] — Клиент';
    (window as any).api.setTitleBarTheme?.(theme).catch(() => {});
  }, [theme]);

  useEffect(() => {
    const offTheme = (window as any).api.onSettingsChanged?.((payload: { key: string; value: string }) => {
      if (payload?.key === 'theme' && payload.value) setTheme(payload.value);
    });
    const offCrm = (window as any).api.onCrmChanged?.((ev: any) => {
      if (remoteMode) return;
      if (!ctx?.counterparty?.id) return;
      if (ev?.counterparty_id && Number(ev.counterparty_id) !== Number(ctx.counterparty.id)) return;
      void refreshLists();
      if (thread?.id) void openThread(thread.id);
    });
    return () => {
      try { offTheme?.(); } catch {  }
      try { offCrm?.(); } catch {  }
    };
  }, [ctx?.counterparty?.id, thread?.id, remoteMode]);

  useEffect(() => {
    const timer = setInterval(async () => {
      if (!ctx?.has_portal) return;
      try {
        const events = remoteMode
          ? await remoteApi.events(eventCursor.current, 50)
          : await (window as any).api.pollCrmEvents?.(eventCursor.current, 50);
        if (Array.isArray(events) && events.length) {
          eventCursor.current = Number(events[events.length - 1].id) || eventCursor.current;
          const mine = events.some((e: any) => !e.counterparty_id || Number(e.counterparty_id) === Number(ctx.counterparty?.id));
          if (mine) {
            void refreshLists();
            if (thread?.id) void openThread(thread.id);
          }
        }
      } catch {  }
    }, 2500);
    return () => clearInterval(timer);
  }, [ctx?.has_portal, ctx?.counterparty?.id, thread?.id, remoteMode]);

  async function refreshLists() {
    try {
      if (remoteMode && hasRemoteConfig()) {
        const [list, portal] = await Promise.all([remoteApi.threads(), remoteApi.context()]);
        setThreads(list || []);
        setCtx(portal);
        return;
      }
      const list = await (window as any).api.listCrmPortalThreads?.();
      setThreads(list || []);
      const portal = await (window as any).api.getCrmPortalContext?.();
      setCtx(portal);
    } catch {  }
  }

  async function boot() {
    try {
      const useRemote = hasRemoteConfig();
      setRemoteMode(useRemote);
      setRemoteForm(loadRemoteConfig());
      if (useRemote) {
        const portal = await remoteAuth(loadRemoteConfig());
        setSession(null);
        setCtx(portal);
        if (portal?.has_portal) {
          setThreads(await remoteApi.threads());
        }
        setNotice('Подключено по RemoteHttp');
        return;
      }
      const s = await (window as any).api.getAuthSession?.();
      setSession(s);
      const saved = await (window as any).api.getSetting?.('theme', '1c-light');
      if (saved) setTheme(saved);
      const portal = await (window as any).api.getCrmPortalContext?.();
      setCtx(portal);
      if (portal?.has_portal) {
        const list = await (window as any).api.listCrmPortalThreads?.();
        setThreads(list || []);
      }
    } catch (e: any) {
      setNotice(e?.message || 'Не удалось открыть портал');
    }
  }

  useEffect(() => { void boot(); }, []);

  async function openThread(id: number) {
    try {
      const t = remoteMode
        ? await remoteApi.thread(id)
        : await (window as any).api.getCrmPortalThread?.(id);
      setThread(t);
      setTab('messages');
    } catch (e: any) {
      setNotice(e?.message || 'Не удалось открыть диалог');
    }
  }

  async function startThread() {
    setBusy(true);
    const clientMsgId = `portal-new-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setSendingId(clientMsgId);
    try {
      const payload = {
        subject: subject || undefined,
        body: body || undefined,
        client_msg_id: body ? clientMsgId : undefined,
      };
      const t = remoteMode
        ? await remoteApi.startThread(payload)
        : await (window as any).api.startCrmPortalThread?.(payload);
      setSubject('');
      setBody('');
      setThread(t);
      await refreshLists();
      setNotice('Обращение отправлено');
      setTab('messages');
    } catch (e: any) {
      setNotice(e?.message || 'Не удалось создать диалог');
    } finally {
      setBusy(false);
      setSendingId(null);
    }
  }

  async function send() {
    if (!thread?.id || !body.trim() || sendingId) return;
    setBusy(true);
    const clientMsgId = `portal-${thread.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setSendingId(clientMsgId);
    try {
      const t = remoteMode
        ? await remoteApi.postMessage(thread.id, body, clientMsgId)
        : await (window as any).api.postCrmPortalMessage?.(thread.id, body, clientMsgId);
      setThread(t);
      setBody('');
      await refreshLists();
    } catch (e: any) {
      setNotice(e?.message || 'Не удалось отправить');
    } finally {
      setBusy(false);
      setSendingId(null);
    }
  }

  async function connectRemote() {
    setBusy(true);
    try {
      const cfg = {
        url: remoteForm.url.trim().replace(/\/+$/, ''),
        token: remoteForm.token.trim(),
      };
      const portal = await remoteAuth(cfg);
      saveRemoteConfig(cfg);
      setRemoteMode(true);
      setCtx(portal);
      setSession(null);
      setThreads(portal?.has_portal ? await remoteApi.threads() : []);
      setNotice('Подключено по RemoteHttp');
      setTab('messages');
    } catch (e: any) {
      setNotice(e?.message || 'Не удалось подключиться');
    } finally {
      setBusy(false);
    }
  }

  function disconnectRemote() {
    clearRemoteConfig();
    setRemoteMode(false);
    setRemoteForm({ url: '', token: '' });
    setCtx(null);
    setThreads([]);
    setThread(null);
    setNotice('Удалённый канал отключён');
    void boot();
  }

  const orgName = ctx?.organization?.name || session?.organization?.name || 'Организация';
  const userName = ctx?.user?.name || '—';
  const cpName = ctx?.counterparty?.name || '—';
  const transportNote = ctx?.transport?.note;

  if (ctx && !ctx.has_portal && !remoteMode) {
    return (
      <div className="app-shell configurator-app">
        <div className="title-bar">
          <div className="title-bar-brand">Метрика [0.5 Домашняя] — Клиент</div>
        </div>
        <main className="main configurator-main" style={{ padding: 24, maxWidth: 560 }}>
          <h1>Нет локального доступа</h1>
          <p>
            Учётная запись не привязана к контрагенту, либо вы подключаетесь с другого устройства.
            Укажите URL HTTP-моста организации и portal-токен, выданный в CRM.
          </p>
          <label className="field">
            <span>URL сервера</span>
            <input
              value={remoteForm.url}
              onChange={(e) => setRemoteForm((f) => ({ ...f, url: e.target.value }))}
              placeholder="http://192.168.0.10:17890"
            />
          </label>
          <label className="field">
            <span>Токен портала</span>
            <input
              value={remoteForm.token}
              onChange={(e) => setRemoteForm((f) => ({ ...f, token: e.target.value }))}
              placeholder="mk_…"
              autoComplete="off"
            />
          </label>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void connectRemote()}>
              Подключить RemoteHttp
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => void (window as any).api.focusMainWindow?.()}>
              Основное окно
            </button>
          </div>
          {notice && <p className="muted" style={{ marginTop: 12 }}>{notice}</p>}
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell configurator-app crm-app client-portal-app">
      <div className="title-bar">
        <div className="title-bar-brand">Метрика [0.5 Домашняя] — Клиент</div>
        <div className="title-bar-drag" />
        <div className="title-bar-session">{userName} · {cpName} · {orgName}</div>
      </div>
      <div className="configurator-toolbar">
        {(
          [
            ['home', 'Главная'],
            ['messages', 'Сообщения'],
            ['orders', 'Заказы'],
            ['shipments', 'Доставки'],
            ['documents', 'Документы'],
            ['profile', 'Профиль'],
          ] as [ClientTab, string][]
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
        <button type="button" className="btn btn-secondary" onClick={() => void boot()}>Обновить</button>
      </div>
      {notice && (
        <div className="notice-bar" role="status" onClick={() => setNotice('')}>{notice}</div>
      )}
      {transportNote && (
        <div className="client-transport-banner" role="note">{transportNote}</div>
      )}
      <main className="main configurator-main crm-main">
        {tab === 'home' && (
          <div>
            <div className="page-header" style={{ marginBottom: 12 }}>
              <div>
                <div className="section-label">Метрика:Клиент</div>
                <h1>{cpName}</h1>
                <p>Актуальные обращения и связанные с вами объекты организации.</p>
              </div>
            </div>
            <div className="crm-desk-grid">
              <section className="crm-desk-panel">
                <header><strong>Обращения</strong><span className="table-caption">{threads.length}</span></header>
                <div className="crm-list">
                  {threads.slice(0, 10).map((t) => (
                    <button key={t.id} type="button" className="crm-list-item" onClick={() => void openThread(t.id)}>
                      <strong>{t.subject}</strong>
                      <span className="subtext">{t.status}</span>
                      {t.last_body && <span className="crm-preview">{t.last_body}</span>}
                    </button>
                  ))}
                  {threads.length === 0 && <div className="muted" style={{ padding: 12 }}>Пока нет обращений</div>}
                </div>
              </section>
              <section className="crm-desk-panel">
                <header><strong>Заказы / поставки</strong></header>
                <ul className="crm-mini-list" style={{ padding: 12 }}>
                  {(ctx?.sales || []).slice(0, 5).map((s: any) => (
                    <li key={`s-${s.id}`}>Продажа {s.order_no || s.id} · {s.status}</li>
                  ))}
                  {(ctx?.purchase_orders || []).slice(0, 5).map((p: any) => (
                    <li key={`p-${p.id}`}>Закупка {p.order_no || p.id} · {p.status}</li>
                  ))}
                  {(ctx?.shipments || []).slice(0, 5).map((s: any) => (
                    <li key={`sh-${s.id}`}>Поставка {s.order_no || s.id} · {s.status}</li>
                  ))}
                  {!ctx?.sales?.length && !ctx?.purchase_orders?.length && !ctx?.shipments?.length && (
                    <li className="muted">Нет связанных документов</li>
                  )}
                </ul>
              </section>
            </div>
          </div>
        )}

        {tab === 'messages' && (
          <div className="crm-split crm-chat-split">
            <aside className="crm-list-pane">
              <div className="crm-chat-new">
                <input
                  placeholder="Тема обращения"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                />
                <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void startThread()}>
                  Новое обращение
                </button>
              </div>
              <div className="crm-list">
                {threads.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={`crm-list-item ${thread?.id === t.id ? 'is-active' : ''}`}
                    onClick={() => void openThread(t.id)}
                  >
                    <strong>{t.subject}</strong>
                    <span className="subtext">{t.status}</span>
                    {t.last_body && <span className="crm-preview">{t.last_body}</span>}
                  </button>
                ))}
                {threads.length === 0 && <div className="muted" style={{ padding: 12 }}>Пока нет диалогов</div>}
              </div>
            </aside>
            <section className="crm-chat-pane">
              {!thread ? (
                <div className="muted" style={{ padding: 24 }}>Выберите диалог или создайте обращение</div>
              ) : (
                <>
                  <header className="crm-chat-head">
                    <div>
                      <strong>{thread.subject}</strong>
                      <div className="subtext">{thread.status}</div>
                    </div>
                  </header>
                <div className="crm-messages">
                  {(thread.messages || []).map((m: any) => (
                    <div key={m.id} className={`crm-msg crm-msg-${m.author_kind}`}>
                      <div className="crm-msg-meta">
                        <strong>{m.author_name || m.author_kind}</strong>
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
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder="Ваше сообщение…"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                        e.preventDefault();
                        void send();
                      }
                    }}
                  />
                  <div className="crm-compose-actions">
                    <button type="button" className="btn btn-primary" disabled={busy || !body.trim()} onClick={() => void send()}>
                      Отправить
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={busy || !thread?.id}
                      onClick={() => void (async () => {
                        setBusy(true);
                        try {
                          const t = await (window as any).api.addCrmAttachment?.(thread.id, { asClient: true });
                          if (t) setThread(t);
                        } catch (e: any) {
                          setNotice(e?.message || 'Не удалось прикрепить');
                        } finally {
                          setBusy(false);
                        }
                      })()}
                    >
                      Вложение
                    </button>
                  </div>
                </div>
                </>
              )}
            </section>
          </div>
        )}

        {tab === 'orders' && (
          <div>
            <div className="page-header" style={{ marginBottom: 12 }}>
              <div>
                <div className="section-label">Заказы</div>
                <h1>Доступные вам заказы</h1>
                <p>Только объекты, связанные с вашим контрагентом в ERP.</p>
              </div>
            </div>
            <table className="data-table">
              <thead>
                <tr><th>Тип</th><th>Номер</th><th>Статус</th><th>Дата</th></tr>
              </thead>
              <tbody>
                {(ctx?.sales || []).map((s: any) => (
                  <tr key={`sale-${s.id}`}><td>Продажа</td><td>{s.order_no || s.id}</td><td>{s.status}</td><td>{s.updated_at || s.expected_at || '—'}</td></tr>
                ))}
                {(ctx?.purchase_orders || []).map((p: any) => (
                  <tr key={`po-${p.id}`}><td>Закупка</td><td>{p.order_no || p.id}</td><td>{p.status}</td><td>{p.ordered_at || p.expected_at || '—'}</td></tr>
                ))}
                {!ctx?.sales?.length && !ctx?.purchase_orders?.length && (
                  <tr><td colSpan={4} className="muted">Нет доступных заказов</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'shipments' && (
          <div>
            <div className="page-header" style={{ marginBottom: 12 }}>
              <div>
                <div className="section-label">Доставки</div>
                <h1>Статусы поставок</h1>
              </div>
            </div>
            <table className="data-table">
              <thead>
                <tr><th>Заказ</th><th>Статус</th><th>Трек</th><th>Ожидается</th><th>Примечание</th></tr>
              </thead>
              <tbody>
                {(ctx?.shipments || []).map((s: any) => (
                  <tr key={s.id}>
                    <td>{s.order_no || s.purchase_order_id}</td>
                    <td>{s.status}</td>
                    <td>{s.tracking_no || '—'}</td>
                    <td>{s.expected_at || '—'}</td>
                    <td>{s.note || '—'}</td>
                  </tr>
                ))}
                {!ctx?.shipments?.length && (
                  <tr><td colSpan={5} className="muted">Нет доставок</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'documents' && (
          <div>
            <div className="page-header" style={{ marginBottom: 12 }}>
              <div>
                <div className="section-label">Документы</div>
                <h1>Договоры и связанные документы</h1>
                <p>Внутренний контур организации. Внешний оператор ЭДО не подключён.</p>
              </div>
            </div>
            <table className="data-table">
              <thead>
                <tr><th>Номер</th><th>Название</th><th>Статус</th></tr>
              </thead>
              <tbody>
                {(ctx?.contracts || []).map((c: any) => (
                  <tr key={c.id}><td>{c.number}</td><td>{c.title || '—'}</td><td>{c.status}</td></tr>
                ))}
                {!ctx?.contracts?.length && (
                  <tr><td colSpan={3} className="muted">Нет доступных документов</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'profile' && (
          <div>
            <div className="page-header" style={{ marginBottom: 12 }}>
              <div>
                <div className="section-label">Профиль</div>
                <h1>{cpName}</h1>
              </div>
            </div>
            <div className="crm-card-grid" style={{ maxWidth: 640 }}>
              <div>
                <div className="section-label">Контакты</div>
                <p>{ctx?.counterparty?.contact_person || '—'}</p>
                <p>{ctx?.counterparty?.phone || '—'}</p>
                <p>{ctx?.counterparty?.email || '—'}</p>
                <p>{ctx?.counterparty?.address || '—'}</p>
              </div>
              <div>
                <div className="section-label">Учётная запись</div>
                <p>{userName}</p>
                <p>{ctx?.user?.login || session?.user?.login || (remoteMode ? 'portal-token' : '—')}</p>
                <p>Организация: {orgName}</p>
                <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                  Транспорт: {remoteMode ? 'remote_http' : (ctx?.transport?.kind || 'local_sqlite')}
                  {remoteMode ? ` · ${loadRemoteConfig().url}` : (ctx?.transport?.remote_ready ? '' : ' · удалённый канал не настроен')}
                </p>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <div className="section-label">RemoteHttp</div>
                <p className="muted" style={{ fontSize: 13, marginBottom: 8 }}>
                  Подключение к HTTP-мосту организации без доступа к SQLite. Токен выдаётся в CRM → Remote.
                </p>
                <label className="field">
                  <span>URL сервера</span>
                  <input
                    value={remoteForm.url}
                    onChange={(e) => setRemoteForm((f) => ({ ...f, url: e.target.value }))}
                    placeholder="http://host:17890"
                  />
                </label>
                <label className="field">
                  <span>Токен портала</span>
                  <input
                    value={remoteForm.token}
                    onChange={(e) => setRemoteForm((f) => ({ ...f, token: e.target.value }))}
                    placeholder="mk_…"
                    autoComplete="off"
                  />
                </label>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void connectRemote()}>
                    {remoteMode ? 'Переподключить' : 'Подключить'}
                  </button>
                  {remoteMode && (
                    <button type="button" className="btn btn-secondary" onClick={disconnectRemote}>
                      Отключить remote
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
