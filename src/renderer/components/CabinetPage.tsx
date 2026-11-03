import { useEffect, useState } from 'react';
import FloatingWidget from './FloatingWidget';

type Props = {
  session: any;
  refreshToken: number;
  onNotice: (msg: string) => void;
  onSession: (session: any) => void;
  onChanged: () => void;
};

export default function CabinetPage({ session, refreshToken, onNotice, onSession, onChanged }: Props) {
  const user = session?.user || {};
  const [form, setForm] = useState({
    last_name: '',
    first_name: '',
    middle_name: '',
    display_name: '',
    password: '',
  });
  const [inbox, setInbox] = useState<any[]>([]);
  const [mine, setMine] = useState<any[]>([]);
  const [viewDoc, setViewDoc] = useState<any | null>(null);
  const [previewHtml, setPreviewHtml] = useState('');
  const [esign, setEsign] = useState<any>(null);
  const [orgKeys, setOrgKeys] = useState<any[]>([]);
  const [error, setError] = useState('');

  async function load() {
    try {
      const [pending, own, myEsign] = await Promise.all([
        (window as any).api.listEdoDocuments({ inbox: true }),
        (window as any).api.listEdoDocuments({ mine: true }),
        (window as any).api.getMyEsign?.().catch(() => null),
      ]);
      setInbox(pending || []);
      setMine(own || []);
      setEsign(myEsign);
      if (user.role === 'admin') {
        try {
          const keys = await (window as any).api.listEsignKeys?.(session?.organization?.id);
          setOrgKeys(keys || []);
        } catch { setOrgKeys([]); }
      }
    } catch {
      setInbox([]);
      setMine([]);
    }
  }

  useEffect(() => {
    setForm({
      last_name: user.last_name || '',
      first_name: user.first_name || user.display_name || '',
      middle_name: user.middle_name || '',
      display_name: user.display_name || '',
      password: '',
    });
    void load();
  }, [refreshToken, user.id, user.last_name, user.first_name, user.middle_name, user.display_name]);

  async function registerEsign() {
    try {
      const result = await (window as any).api.generateMyEsign();
      setEsign(result?.esign || result);
      if (result?.session) onSession(result.session);
      onNotice(result?.esign?.has_esign || result?.has_esign
        ? 'Ключ ЭП зарегистрирован'
        : 'Ключ ЭП уже был зарегистрирован ранее');
      onChanged();
      void load();
    } catch (e: any) {
      onNotice(e?.message || 'Не удалось зарегистрировать ключ');
    }
  }

  async function saveProfile(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    try {
      const result = await (window as any).api.updateSelfProfile({
        last_name: form.last_name,
        first_name: form.first_name,
        middle_name: form.middle_name,
        display_name: form.display_name || form.first_name,
        password: form.password || undefined,
      });
      if (result?.session) onSession(result.session);
      setForm((f) => ({ ...f, password: '' }));
      onNotice('Профиль сохранён');
      onChanged();
    } catch (e: any) {
      setError(e?.message || 'Не удалось сохранить профиль');
    }
  }

  async function openDoc(doc: any) {
    setViewDoc(doc);
    setPreviewHtml('');
    try {
      const res = await (window as any).api.previewEdoDocument?.(doc.id);
      setPreviewHtml(res?.html || '');
      if (res?.doc) setViewDoc(res.doc);
    } catch {  }
  }

  async function sign(doc: any) {
    try {
      const signed = await (window as any).api.signEdoDocument(doc.id);
      onNotice(`Подписан ${doc.doc_no}${signed?.stamp_key ? ` · ${signed.stamp_key}` : ''}`);
      setViewDoc(signed || doc);
      try {
        const res = await (window as any).api.previewEdoDocument?.(doc.id);
        setPreviewHtml(res?.html || '');
        if (res?.doc) setViewDoc(res.doc);
      } catch {  }
      await load();
      onChanged();
    } catch (e: any) {
      onNotice(e?.message || 'Не удалось подписать');
    }
  }

  async function removeDoc(id: number) {
    if (!window.confirm('Удалить документ безвозвратно?')) return;
    try {
      await (window as any).api.deleteEdoDocument(id);
      setViewDoc(null);
      await load();
      onChanged();
      onNotice('Документ удалён');
    } catch (e: any) {
      onNotice(e?.message || 'Не удалось удалить');
    }
  }

  async function reject(doc: any) {
    const reason = window.prompt('Причина отклонения:', '') || '';
    try {
      await (window as any).api.rejectEdoDocument(doc.id, reason);
      onNotice(`Отклонён ${doc.doc_no}`);
      setViewDoc(null);
      await load();
      onChanged();
    } catch (e: any) {
      onNotice(e?.message || 'Не удалось отклонить');
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <div className="section-label">Профиль</div>
          <h1>Личный кабинет</h1>
          <p>Учётная запись, документы на подписание и история ЭДО.</p>
        </div>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => void (window as any).api.openClientPortal?.()
            .then(() => onNotice('Открыт портал Метрика:Клиент'))
            .catch((e: any) => onNotice(e?.message || 'Нет привязки к контрагенту'))}
        >
          Метрика:Клиент
        </button>
      </div>

      <div className="org-layout">
        <section className="card">
          <h2>Учётная запись</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            Логин: <strong>{user.login}</strong> · роль: <strong>{user.role}</strong>
            {session?.organization?.name ? <> · {session.organization.name}</> : null}
          </p>
          {error && <div className="form-error">{error}</div>}
          <form className="form-grid" onSubmit={saveProfile}>
            <label>Фамилия<input value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} /></label>
            <label>Имя<input value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} required /></label>
            <label>Отчество<input value={form.middle_name} onChange={(e) => setForm({ ...form, middle_name: e.target.value })} /></label>
            <label>Имя для приветствия<input value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} placeholder="Как обращаться" /></label>
            <label className="span-2">Новый пароль<input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Оставьте пустым, чтобы не менять" /></label>
            <div className="modal-actions span-2">
              <button type="submit" className="btn btn-primary">Сохранить</button>
            </div>
          </form>

          <h2 style={{ marginTop: 28 }}>Электронная подпись METRIKA</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            Ключ регистрируется один раз и используется для подписания документов ЭДО.
            На бланке появится штамп «ДОКУМЕНТ ПОДПИСАН ЭЛЕКТРОННОЙ ПОДПИСЬЮ».
          </p>
          {esign?.has_esign ? (
            <div className="about-grid" style={{ marginTop: 8 }}>
              <div><span>Сертификат</span><strong className="mono" style={{ wordBreak: 'break-all' }}>{esign.cert}</strong></div>
              <div><span>Владелец</span><strong>{esign.owner}</strong></div>
              <div><span>Действителен</span><strong>с {esign.valid_from_ru} по {esign.valid_to_ru}</strong></div>
            </div>
          ) : (
            <div className="modal-actions" style={{ marginTop: 8 }}>
              <button type="button" className="btn btn-primary" onClick={() => void registerEsign()}>
                Зарегистрировать ключ ЭП
              </button>
            </div>
          )}
        </section>

        <section className="card">
          <h2>На подписание · {inbox.length}</h2>
          {inbox.length === 0 ? (
            <p className="muted">Нет документов, ожидающих вашей подписи.</p>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr><th>Тег</th><th>Рег. №</th><th>Документ</th><th>От кого</th><th></th></tr>
                </thead>
                <tbody>
                  {inbox.map((doc) => (
                    <tr key={doc.id}>
                      <td><span className="edo-doc-tag">{doc.doc_tag || '—'}</span></td>
                      <td className="mono">{doc.doc_no}</td>
                      <td>
                        <button type="button" className="linkish" onClick={() => void openDoc(doc)}>
                          {doc.title}
                        </button>
                        <div className="muted">{doc.kind_label || doc.form_label}</div>
                      </td>
                      <td>{doc.author_name}</td>
                      <td>
                        <button type="button" className="btn btn-primary" onClick={() => void sign(doc)}>Подписать</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {user.role === 'admin' && (
          <section className="card" style={{ gridColumn: '1 / -1' }}>
            <h2>Ключи ЭП организации · {orgKeys.length}</h2>
            <p className="muted" style={{ marginTop: 0 }}>Видимость для администратора: кто зарегистрировал сертификат и срок действия.</p>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr><th>Пользователь</th><th>Логин</th><th>Сертификат</th><th>Срок</th></tr>
                </thead>
                <tbody>
                  {orgKeys.length === 0 ? (
                    <tr><td colSpan={4} className="muted">Пока никто не зарегистрировал ключ</td></tr>
                  ) : orgKeys.map((row) => (
                    <tr key={row.user_id}>
                      <td>{row.owner}</td>
                      <td className="mono">{row.login}</td>
                      <td className="mono" style={{ maxWidth: 220, wordBreak: 'break-all' }}>
                        {row.has_esign ? row.cert : '— не зарегистрирован'}
                      </td>
                      <td>{row.has_esign ? `с ${row.valid_from_ru} по ${row.valid_to_ru}` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <section className="card" style={{ gridColumn: '1 / -1' }}>
          <h2>Мои документы ЭДО</h2>
          {mine.length === 0 ? (
            <p className="muted">Пока нет документов, связанных с вашей учётной записью.</p>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr><th>Тег</th><th>Рег. №</th><th>Заголовок</th><th>Статус</th><th>Кому</th><th></th></tr>
                </thead>
                <tbody>
                  {mine.map((doc) => (
                    <tr key={doc.id}>
                      <td><span className="edo-doc-tag">{doc.doc_tag || '—'}</span></td>
                      <td className="mono">{doc.doc_no}</td>
                      <td>
                        {doc.title}
                        <div className="muted">{doc.kind_label || doc.form_label}</div>
                      </td>
                      <td>{doc.status_label}</td>
                      <td>{doc.to_user_name || '—'}</td>
                      <td>
                        <button type="button" className="btn btn-secondary" onClick={() => void openDoc(doc)}>Открыть</button>{' '}
                        <button type="button" className="btn btn-secondary" onClick={() => void removeDoc(doc.id)}>Удалить</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {viewDoc && (
        <FloatingWidget
          title={`${viewDoc.doc_tag || 'ЭДО'} · ${viewDoc.doc_no}`}
          open
          onClose={() => setViewDoc(null)}
          width={860}
        >
          <div style={{ padding: '4px 4px 12px', display: 'grid', gap: 12 }}>
            <div className="edo-tag-row">
              <span className="edo-doc-tag">{viewDoc.doc_tag || '—'}</span>
              <span className="section-label" style={{ margin: 0 }}>{viewDoc.kind_label || viewDoc.form_label}</span>
            </div>
            <h2 style={{ margin: 0 }}>{viewDoc.title}</h2>
            <div className="about-grid">
              <div><span>Рег. №</span><strong className="mono">{viewDoc.doc_no}</strong></div>
              <div><span>Теги</span><strong>{viewDoc.tags_label || viewDoc.category_tag || '—'}</strong></div>
              <div><span>Статус</span><strong>{viewDoc.status_label}</strong></div>
              <div><span>Автор</span><strong>{viewDoc.author_name || '—'}</strong></div>
              <div><span>Кому</span><strong>{viewDoc.to_user_name || '—'}</strong></div>
              <div><span>Создан</span><strong>{viewDoc.created_at}</strong></div>
              {viewDoc.stamp_key && <div><span>Ключ ЭП</span><strong>{viewDoc.stamp_key}</strong></div>}
            </div>
            <div className="edo-preview-wrap">
              {previewHtml ? (
                <iframe title="Предпросмотр ЭДО" className="edo-preview-frame" srcDoc={previewHtml} />
              ) : (
                <div className="card" style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{viewDoc.body || '—'}</div>
              )}
            </div>
            {viewDoc.reject_reason && <div className="form-error">Причина отклонения: {viewDoc.reject_reason}</div>}
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => void (window as any).api.printEdoDocument(viewDoc.id).then(() => onNotice('Печать…')).catch((e: any) => onNotice(e?.message || 'Ошибка печати'))}>Печать</button>
              <button type="button" className="btn btn-secondary" onClick={() => void (window as any).api.exportEdoPdf?.(viewDoc.id).then((r: any) => onNotice(r?.ok ? `PDF: ${r.path}` : 'Отменено'))}>PDF</button>
              {viewDoc.status === 'sent' && Number(viewDoc.to_user_id) === Number(user.id) && (
                <>
                  <button type="button" className="btn btn-secondary" onClick={() => void reject(viewDoc)}>Отклонить</button>
                  <button type="button" className="btn btn-primary" onClick={() => void sign(viewDoc)}>Подписать</button>
                </>
              )}
              <button type="button" className="btn btn-secondary" onClick={() => void removeDoc(viewDoc.id)}>Удалить</button>
              <button type="button" className="btn btn-secondary" onClick={() => setViewDoc(null)}>Закрыть</button>
            </div>
          </div>
        </FloatingWidget>
      )}
    </>
  );
}
