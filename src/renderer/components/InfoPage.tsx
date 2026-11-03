import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '../i18n';
import {
  articlesForRole,
  normalizeKbRole,
  roleLabelRu,
  type KbRole,
} from '../knowledgeBase';
import { getProcedure, type ProcedureHit } from '../procedureCatalog';

type Props = {
  session?: any;
  compact?: boolean;
  onRunProcedure?: (proc: ProcedureHit) => void;
  onClose?: () => void;
};

export default function InfoPage({ session, compact = false, onRunProcedure, onClose }: Props) {
  const { locale, t } = useI18n();
  const role = normalizeKbRole(session?.user?.role) as KbRole;
  const [query, setQuery] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);

  const articles = useMemo(() => {
    const all = articlesForRole(role, locale === 'en' ? 'en' : 'ru');
    const q = query.trim().toLocaleLowerCase();
    if (!q) return all;
    return all.filter((a) => {
      const hay = [a.thesis, a.title, a.body, a.tip || '', a.warn || '', ...(a.steps || [])].join(' ').toLocaleLowerCase();
      return hay.includes(q);
    });
  }, [role, locale, query]);

  useEffect(() => {
    if (!articles.length) {
      setActiveId(null);
      return;
    }
    if (!activeId || !articles.some((a) => a.id === activeId)) {
      setActiveId(articles[0].id);
    }
  }, [articles, activeId]);

  const current = articles.find((a) => a.id === activeId) || articles[0] || null;
  const roleName = locale === 'en'
    ? ({ admin: 'Administrator', user: 'User', operator: 'Operator' } as const)[role]
    : roleLabelRu(role);
  const launchProc = current?.procedureId ? getProcedure(current.procedureId) : undefined;

  function runFromArticle() {
    if (!launchProc || !onRunProcedure) return;
    onRunProcedure(launchProc);
    onClose?.();
  }

  return (
    <div className={`kb-page${compact ? ' is-compact' : ''}`}>
      {!compact && (
        <div className="page-header">
          <div>
            <div className="section-label">{locale === 'en' ? 'Knowledge base' : 'База знаний'}</div>
            <h1>{t('info')}</h1>
            <p>
              {locale === 'en'
                ? `Short index · full article per topic · role: ${roleName}`
                : `Краткое оглавление · подробная статья по каждому пункту · роль: ${roleName}`}
            </p>
          </div>
        </div>
      )}

      {compact && (
        <p className="subtext" style={{ margin: '0 0 12px' }}>
          {locale === 'en' ? `Role: ${roleName}` : `Роль: ${roleName}`}
        </p>
      )}

      <div className="kb-toolbar">
        <input
          className="kb-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={locale === 'en' ? 'Search…' : 'Поиск по тезисам и тексту…'}
          aria-label={locale === 'en' ? 'Search' : 'Поиск'}
        />
        <span className="table-caption">{articles.length} {locale === 'en' ? 'articles' : 'статей'}</span>
      </div>

      <div className="guide-layout kb-layout kb-layout-split">
        <nav className="guide-nav kb-nav" aria-label={locale === 'en' ? 'Contents' : 'Оглавление'}>
          {articles.map((article) => (
            <button
              key={article.id}
              type="button"
              className={current?.id === article.id ? 'is-active' : ''}
              onClick={() => setActiveId(article.id)}
            >
              {article.thesis}
            </button>
          ))}
          {articles.length === 0 && (
            <span className="subtext" style={{ padding: '8px 12px' }}>
              {locale === 'en' ? 'Nothing found' : 'Ничего не найдено'}
            </span>
          )}
        </nav>

        <div className="kb-article-pane">
          {!current ? (
            <p className="subtext">{locale === 'en' ? 'Select a topic' : 'Выберите пункт слева'}</p>
          ) : (
            <article className="kb-article-full">
              <div className="section-label">{current.thesis}</div>
              <h2>{current.title}</h2>
              {current.body.split(/\n\n+/).map((para) => (
                <p key={para.slice(0, 48)}>{para}</p>
              ))}
              {current.steps && current.steps.length > 0 && (
                <>
                  <h3>{locale === 'en' ? 'Steps' : 'Порядок действий'}</h3>
                  <ol className="kb-steps">
                    {current.steps.map((step) => <li key={step}>{step}</li>)}
                  </ol>
                </>
              )}
              {current.tip && (
                <div className="kb-callout tip">
                  <strong>{locale === 'en' ? 'Tip' : 'Подсказка'}.</strong> {current.tip}
                </div>
              )}
              {current.warn && (
                <div className="kb-callout warn">
                  <strong>{locale === 'en' ? 'Important' : 'Важно'}.</strong> {current.warn}
                </div>
              )}
              {launchProc && onRunProcedure && (
                <div className="kb-article-actions">
                  <button type="button" className="btn btn-primary" onClick={runFromArticle}>
                    {locale === 'en' ? `Run: ${launchProc.name}` : `Запустить: ${launchProc.name}`}
                  </button>
                </div>
              )}
            </article>
          )}
        </div>
      </div>
    </div>
  );
}
