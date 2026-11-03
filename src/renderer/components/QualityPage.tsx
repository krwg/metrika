import { useEffect, useState } from 'react';

type Issue = {
  type: string;
  code: string;
  title: string;
  hint?: string;
  count: number;
  items: any[];
};

const FACTOR_TO_ISSUE: Record<string, string> = {
  drift: 'ledger_drift',
  negative: 'negative',
  over_reserved: 'over_reserved',
  hung_reserves: 'hung_reserves',
  overdue_projects: 'overdue_projects',
  overdue_po: 'overdue_po',
  expired_lots: 'expired_lots',
  expiring_lots: 'expiring_lots',
};

type Props = {
  refreshToken: number;
  onOpenItem: (ref: string | { id?: number; barcode?: string }) => void;
  onChanged: () => void;
  onNotice?: (message: string) => void;
};

const TYPE_LABEL: Record<string, string> = {
  item: 'Товары',
  barcode: 'Штрихкоды',
  inventory: 'Остатки',
  category: 'Категории',
  ops: 'Операции',
  lots: 'Партии / сроки',
};

type Health = {
  score: number;
  grade: string;
  factors: Array<{ key: string; label: string; penalty: number; count: number }>;
  hung_reserves?: any[];
  overdue_projects?: any[];
  overdue_pos?: any[];
  reserve_stale_days?: number;
  diagnose?: {
    ledger_drift?: number;
    ledger_drift_rows?: any[];
  };
};

function mapDriftRows(rows: any[]): any[] {
  return (rows || []).map((row: any) => ({
    id: row.item_id,
    item_id: row.item_id,
    location_id: row.location_id,
    lot_id: row.lot_id,
    name: row.item_name || row.name,
    barcode: row.barcode || '',
    detail: `${row.location_name || 'ячейка'} · партия ${row.lot_no || '—'}`,
    location_name: row.location_name,
    lot_no: row.lot_no,
    inventory_qty: row.inventory_qty,
    ledger_qty: row.ledger_qty,
    delta: row.delta,
  }));
}

function ensureDriftIssue(data: { total: number; issues: Issue[]; health?: Health }) {
  const issues = [...(data.issues || [])];
  let drift = issues.find((i) => i.code === 'ledger_drift');
  const factorDrift = (data.health?.factors || []).find((f) => f.key === 'drift');
  const diagnoseRows = data.health?.diagnose?.ledger_drift_rows || [];
  if (!drift && (factorDrift || diagnoseRows.length)) {
    const items = mapDriftRows(diagnoseRows);
    drift = {
      type: 'inventory',
      code: 'ledger_drift',
      title: 'Расхождение остатков и журнала (ledger)',
      hint: 'На полке одно количество, в журнале — другое.',
      count: items.length || Number(factorDrift?.count || data.health?.diagnose?.ledger_drift || 0),
      items,
    };
    issues.unshift(drift);
  } else if (drift && (!drift.items || !drift.items.length) && diagnoseRows.length) {
    drift = { ...drift, items: mapDriftRows(diagnoseRows), count: diagnoseRows.length };
    const idx = issues.findIndex((i) => i.code === 'ledger_drift');
    if (idx >= 0) issues[idx] = drift;
  }
  const total = issues.reduce((sum, i) => sum + (Number(i.count) || 0), 0);
  return { ...data, issues, total };
}

export default function QualityPage({ refreshToken, onOpenItem, onChanged, onNotice }: Props) {
  const [report, setReport] = useState<{ total: number; issues: Issue[]; health?: Health } | null>(null);
  const [expanded, setExpanded] = useState<string | null>('ledger_drift');
  const [loading, setLoading] = useState(false);
  const [busyKey, setBusyKey] = useState('');

  async function load() {
    setLoading(true);
    try {
      const raw = await (window as any).api.qualityReport();
      let data = ensureDriftIssue(raw || { total: 0, issues: [] });

      const driftIssue = data.issues.find((i) => i.code === 'ledger_drift');
      if (driftIssue && !(driftIssue.items || []).length) {
        try {
          const rows = await (window as any).api.listLedgerDrift?.();
          if (Array.isArray(rows) && rows.length) {
            data = ensureDriftIssue({
              ...data,
              health: {
                ...(data.health || { score: 100, grade: 'A', factors: [] }),
                diagnose: { ledger_drift: rows.length, ledger_drift_rows: rows },
              },
            });
          }
        } catch {  }
      }
      setReport(data);
      if (data.issues.some((i) => i.code === 'ledger_drift')) setExpanded('ledger_drift');
      else if (data.issues.length) setExpanded(data.issues[0].code);
      else if ((data.health?.factors || []).length) {
        setExpanded(FACTOR_TO_ISSUE[data.health!.factors[0].key] || data.health!.factors[0].key);
      }
    } catch (err: any) {
      onNotice?.(err?.message || 'Не удалось загрузить отчёт');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [refreshToken]);

  function openFactor(factorKey: string) {
    const code = FACTOR_TO_ISSUE[factorKey] || factorKey;
    setExpanded((prev) => (prev === code ? null : code));
    requestAnimationFrame(() => {
      document.getElementById(`quality-factor-${code}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  }

  async function healDrift(row?: {
    item_id?: number;
    location_id?: number;
    lot_id?: number;
    name?: string;
    location_name?: string;
  }) {
    const one = row?.item_id != null;
    const where = one
      ? `\n\nТовар: ${row?.name || '—'}\nЯчейка: ${row?.location_name || '—'}`
      : '';
    if (!window.confirm(
      (one
        ? 'Подтянуть учёт к тому, что реально лежит в этой ячейке?'
        : 'Подтянуть учёт ко всем проблемным ячейкам?')
      + where
      + '\n\nКоличество на полке не изменится.\n'
      + 'В историю движений запишется служебная корректировка — оценка качества станет выше.',
    )) return;
    const key = one ? `heal-${row!.item_id}-${row!.location_id}-${row!.lot_id ?? 0}` : 'heal-drift';
    setBusyKey(key);
    try {
      const result = await (window as any).api.healLedgerDrift(
        one
          ? { item_id: row!.item_id, location_id: row!.location_id, lot_id: row!.lot_id }
          : undefined,
      );
      const left = Number(result?.after_drift ?? 0);
      const fixed = Number(result?.adjusted ?? 0);
      if (result?.ok || left === 0) {
        onNotice?.(
          fixed === 1
            ? 'Готово: учёт совпал с полкой по 1 ячейке. Оценка должна стать 100.'
            : `Готово: учёт совпал с полкой по ${fixed} ячейкам. Оценка должна стать 100.`,
        );
      } else if (fixed > 0) {
        onNotice?.(
          `Исправили ${fixed} ячеек, но ещё осталось расхождений: ${left}. `
          + 'Нажмите «Обновить отчёт» и снова «Выровнять».',
        );
      } else {
        onNotice?.('Нечего выравнивать — расхождений уже нет. Обновите отчёт.');
      }
      onChanged();
      await load();
    } catch (e: any) {
      onNotice?.(e?.message || 'Не удалось выровнять учёт. Если ошибка повторяется — откройте терминал (внизу) и вкладку «Ошибки».');
    } finally {
      setBusyKey('');
    }
  }

  async function rebuildFromLedger() {
    if (!window.confirm(
      'Перезаписать остатки на полках по журналу движений?\n\n'
      + 'Внимание: цифры в ячейках станут такими, как в истории приходов и расходов.\n'
      + 'Если в журнале ошибка (например, «минус»), полка по этой ячейке не обновится.\n\n'
      + 'Обычно нужнее кнопка «Выровнять» — она не трогает полку.\n'
      + 'Перед этим лучше сделать резервную копию в Настройках.',
    )) return;
    setBusyKey('rebuild-ledger');
    try {
      const result = await (window as any).api.rebuildInventoryFromLedger();
      const before = Number(result?.before_drift ?? 0);
      const after = Number(result?.after_drift ?? 0);
      const cells = Number(result?.rewritten ?? 0);
      if (after === 0) {
        onNotice?.(
          `Остатки обновлены по журналу (${cells} ячеек). Расхождений больше нет.`,
        );
      } else if (after >= before && before > 0) {
        onNotice?.(
          `Обновили ${cells} ячеек, но расхождения остались (${after}). `
          + 'Журнал, скорее всего, с ошибкой — нажмите «Выровнять» (полка не изменится).',
        );
      } else {
        onNotice?.(
          `Обновили ${cells} ячеек. Было расхождений: ${before}, осталось: ${after}. `
          + (after > 0 ? 'Дожмите кнопкой «Выровнять».' : ''),
        );
      }
      onChanged();
      await load();
    } catch (e: any) {
      onNotice?.(e?.message || 'Не удалось пересчитать остатки');
    } finally {
      setBusyKey('');
    }
  }

  async function generateSkuFor(item: any) {
    const key = `sku-${item.id}`;
    setBusyKey(key);
    try {
      const result = await (window as any).api.generateSku({
        itemName: item.name,
        categoryName: item.category || '',
        name: item.name,
        category: item.category || '',
      });
      const full = await (window as any).api.getItemById(item.id);
      if (!full) throw new Error('Товар не найден');
      await (window as any).api.updateItem(item.id, {
        ...full,
        barcode: full.barcode || '',
        barcodes: full.barcodes || [],
        sku: result.sku,
      });
      onNotice?.(`Назначен артикул ${result.sku}`);
      onChanged();
      await load();
    } catch (error: any) {
      onNotice?.(error?.message || 'Не удалось назначить SKU');
    } finally {
      setBusyKey('');
    }
  }

  async function assignDefaultUnit(item: any) {
    const key = `unit-${item.id}`;
    setBusyKey(key);
    try {
      const units = await (window as any).api.getUnits();
      const piece = (units || []).find((unit: any) => unit.symbol === 'шт.');
      if (!piece) throw new Error('Базовая единица «шт.» не найдена');
      const full = await (window as any).api.getItemById(item.id);
      if (!full) throw new Error('Товар не найден');
      await (window as any).api.updateItem(item.id, {
        ...full,
        barcode: full.barcode || '',
        barcodes: full.barcodes || [],
        unit_id: piece.id,
      });
      onNotice?.(`Назначена единица «шт.»`);
      onChanged();
      await load();
    } catch (error: any) {
      onNotice?.(error?.message || 'Не удалось назначить единицу');
    } finally {
      setBusyKey('');
    }
  }

  if (loading && !report) {
    return <div className="empty" style={{ padding: 60 }}><p>Анализ базы данных…</p></div>;
  }

  if (!report) {
    return <div className="empty" style={{ padding: 60 }}><p>Отчёт недоступен</p></div>;
  }

  const factors = report.health?.factors || [];
  const driftIssue = report.issues.find((i) => i.code === 'ledger_drift');
  const factorIssueCodes = new Set(Object.values(FACTOR_TO_ISSUE));

  const otherIssues = report.issues.filter((i) => !factorIssueCodes.has(i.code));
  const hasIssues = report.issues.length > 0 || factors.length > 0;

  return (
    <div className="quality-page">
      <div className="page-header">
        <div>
          <div className="section-label">Здоровье данных</div>
          <h1>Центр качества базы</h1>
          <p>Проверка, всё ли сходится на складе. Нажмите штраф — увидите проблемные места и кнопку, как исправить.</p>
        </div>
        <button className="btn btn-secondary" onClick={() => void load()} disabled={loading}>
          {loading ? 'Обновление…' : 'Обновить отчёт'}
        </button>
      </div>

      <div className="dashboard-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', marginBottom: 16 }}>
        <div className={`stat-card ${(report.health?.score ?? 100) < 75 ? 'warning' : ''}`}>
          <div className="stat-label">Health score</div>
          <div className="stat-value">{report.health?.score ?? '—'}</div>
          <div className="stat-hint">
            класс {report.health?.grade || '—'}
            {(report.health?.grade === 'A' && ' · отлично')
              || (report.health?.grade === 'B' && ' · нормально')
              || (report.health?.grade === 'C' && ' · нужно внимание')
              || ''}
          </div>
        </div>
        <div className={`stat-card ${report.total > 0 ? 'warning' : ''}`}>
          <div className="stat-label">Проблемных строк</div>
          <div className="stat-value">{report.total}</div>
          <div className="stat-hint">{report.issues.length} групп</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Зависшие резервы</div>
          <div className="stat-value">{report.health?.hung_reserves?.length ?? 0}</div>
          <div className="stat-hint">&gt; {report.health?.reserve_stale_days ?? 7} дн.</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Просрочки</div>
          <div className="stat-value">
            {(report.health?.overdue_projects?.length || 0) + (report.health?.overdue_pos?.length || 0)}
          </div>
          <div className="stat-hint">заказы и поставки</div>
        </div>
      </div>

      {factors.length > 0 && (
        <section className="card" style={{ padding: 16, marginBottom: 16 }}>
          <div className="section-label">Что снижает оценку</div>
          <p className="subtext" style={{ marginTop: 6 }}>
            Оценка начинается со 100. Каждый риск снимает баллы. Нажмите строку — откроется список и что делать.
          </p>
          <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
            {factors.map((f) => {
              const code = FACTOR_TO_ISSUE[f.key] || f.key;
              const issue = report.issues.find((i) => i.code === code) || null;
              const active = expanded === code;
              return (
                <div
                  key={f.key}
                  id={`quality-factor-${code}`}
                  className="card"
                  style={{
                    padding: 0,
                    overflow: 'hidden',
                    border: active ? '1px solid var(--primary)' : '1px solid var(--border)',
                    background: active ? 'color-mix(in srgb, var(--primary) 8%, var(--surface))' : 'var(--surface-muted)',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => openFactor(f.key)}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: '12px 14px',
                      cursor: 'pointer',
                      background: 'transparent',
                      border: 0,
                      color: 'inherit',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
                      <strong>{f.label}</strong>
                      <span className="mono">−{f.penalty} · {f.count} {f.count === 1 ? 'позиция' : 'позиций'} · {active ? 'свернуть' : 'открыть'}</span>
                    </div>
                    <div className="subtext" style={{ marginTop: 4 }}>
                      {f.key === 'drift' && 'На полке одно количество, в истории движений — другое. Откройте и нажмите «Выровнять».'}
                      {f.key === 'negative' && 'Остаток в ячейке меньше нуля.'}
                      {f.key === 'over_reserved' && 'Резерв больше доступного остатка.'}
                      {f.key === 'hung_reserves' && 'Резерв без движения дольше порога.'}
                      {f.key === 'overdue_projects' && 'Заказ-наряд просрочен по сроку.'}
                      {f.key === 'overdue_po' && 'Поставка не закрыта после ожидаемой даты.'}
                      {f.key === 'expired_lots' && 'Срок партии истёк.'}
                      {f.key === 'expiring_lots' && 'Срок партии скоро истекает.'}
                      {f.key === 'integrity' && 'SQLite integrity check не прошёл.'}
                      {f.key === 'fk' && 'Битые внешние ключи в базе.'}
                    </div>
                  </button>

                  {active && f.key === 'drift' && (
                    <div id="quality-issue-ledger_drift" style={{ borderTop: '1px solid var(--border)', background: 'var(--surface)' }}>
                      <div style={{ padding: '14px 16px', display: 'grid', gap: 8, lineHeight: 1.5 }}>
                        <div>
                          <strong>В чём дело:</strong> программа сравнивает «сколько лежит в ячейке» и «сколько должно быть по истории приходов и расходов».
                          {driftIssue ? ` Сейчас не совпадает в ${driftIssue.count} местах.` : ''}
                        </div>
                        <div>
                          <strong>Что нажать:</strong> «Выровнять» — оставить как на полке и поправить историю учёта.
                          Количество товара физически не меняется.
                        </div>
                        <div className="subtext">
                          «Пересчитать с полки по истории» — наоборот, подставит в ячейки цифры из журнала. Нужно редко; если после него расхождения остались — снова жмите «Выровнять».
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
                          <button type="button" className="btn btn-primary" disabled={busyKey === 'heal-drift'} onClick={() => void healDrift()}>
                            Выровнять всё ({driftIssue?.count || f.count})
                          </button>
                          <button type="button" className="btn btn-secondary" disabled={busyKey === 'rebuild-ledger'} onClick={() => void rebuildFromLedger()}>
                            Пересчитать полку по истории
                          </button>
                        </div>
                      </div>
                      {(driftIssue?.items || []).length > 0 ? (
                        <div className="table-scroll" style={{ borderTop: '1px solid var(--border)' }}>
                          <table>
                            <thead>
                              <tr>
                                <th>Товар</th>
                                <th>Ячейка</th>
                                <th>Партия</th>
                                <th>На полке</th>
                                <th>По истории</th>
                                <th>Разница</th>
                                <th>Пояснение</th>
                                <th style={{ width: 200 }}>Действие</th>
                              </tr>
                            </thead>
                            <tbody>
                              {driftIssue!.items.map((item: any, idx: number) => {
                                const inv = Number(item.inventory_qty ?? 0);
                                const led = Number(item.ledger_qty ?? 0);
                                const delta = Number(item.delta ?? led - inv);
                                const tip = led < 0 && inv === 0
                                  ? 'На полке пусто, а в учёте «минус» — обычно старая ошибка. Безопасно выровнять.'
                                  : led > inv
                                    ? 'По истории товара больше, чем в ячейке.'
                                    : 'В ячейке больше, чем по истории движений.';
                                const rowKey = `heal-${item.item_id}-${item.location_id}-${item.lot_id ?? 0}`;
                                return (
                                  <tr key={idx}>
                                    <td>
                                      <div className="strong">{item.name || `#${item.item_id}`}</div>
                                      <span className="mono subtext">{item.barcode || `#${item.item_id}`}</span>
                                    </td>
                                    <td>{item.location_name || '—'}</td>
                                    <td className="mono subtext">{item.lot_no || '—'}</td>
                                    <td className="mono">{inv}</td>
                                    <td className="mono">{led}</td>
                                    <td className="mono" style={{ color: delta === 0 ? undefined : 'var(--danger)' }}>
                                      {delta > 0 ? `+${delta}` : delta}
                                    </td>
                                    <td className="subtext">{tip}</td>
                                    <td>
                                      <div className="row-actions">
                                        <button
                                          type="button"
                                          className="btn btn-primary"
                                          disabled={busyKey === rowKey || busyKey === 'heal-drift'}
                                          onClick={() => void healDrift({
                                            item_id: item.item_id || item.id,
                                            location_id: item.location_id,
                                            lot_id: item.lot_id,
                                            name: item.name,
                                            location_name: item.location_name,
                                          })}
                                        >
                                          Выровнять
                                        </button>
                                        <button
                                          type="button"
                                          className="btn btn-secondary"
                                          onClick={() => onOpenItem({ id: item.item_id || item.id, barcode: item.barcode })}
                                        >
                                          Товар
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <p className="subtext" style={{ padding: '0 16px 14px' }}>
                          Список ячеек не загрузился. Нажмите «Обновить отчёт» или «Выровнять всё».
                        </p>
                      )}
                    </div>
                  )}

                  {active && f.key !== 'drift' && issue && (
                    <div id={`quality-issue-${code}`} style={{ borderTop: '1px solid var(--border)', background: 'var(--surface)' }}>
                      {issue.hint ? <p className="subtext" style={{ padding: '12px 16px 0', margin: 0 }}>{issue.hint}</p> : null}
                      <div className="table-scroll">
                        <table>
                          <thead>
                            <tr>
                              <th>Объект</th>
                              <th>Детали</th>
                              <th>Дополнительно</th>
                              <th style={{ width: 160 }}>Действие</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(issue.items || []).slice(0, 50).map((item: any, idx: number) => (
                              <tr key={idx}>
                                <td><div className="strong">{item.name || item.sku || item.barcode || `#${item.id || item.item_id}`}</div></td>
                                <td className="subtext">{item.detail || item.barcode || '—'}</td>
                                <td className="mono subtext">{item.order_no || item.lot_no || '—'}</td>
                                <td>
                                  {(item.id || item.item_id) ? (
                                    <button className="btn btn-secondary" onClick={() => onOpenItem({ id: item.id || item.item_id })}>Открыть</button>
                                  ) : <span className="subtext">—</span>}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {active && f.key !== 'drift' && !issue && (
                    <p className="subtext" style={{ padding: '12px 16px', margin: 0, borderTop: '1px solid var(--border)' }}>
                      Детальный список для этого штрафа пока недоступен. Обновите отчёт.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {otherIssues.map((issue) => (
        <section
          id={`quality-issue-${issue.code}`}
          key={issue.code}
          className="card table-wrap"
          style={{ overflow: 'hidden', marginBottom: 16 }}
        >
          <div
            className="table-header"
            style={{
              width: '100%',
              padding: '16px 20px',
              background: expanded === issue.code ? 'var(--surface-muted)' : 'transparent',
              display: 'flex',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <button
              type="button"
              style={{
                flex: 1, cursor: 'pointer', background: 'transparent', border: 0,
                textAlign: 'left', padding: 0, color: 'inherit',
              }}
              onClick={() => setExpanded(expanded === issue.code ? null : issue.code)}
            >
              <div className="section-label">{TYPE_LABEL[issue.type] || issue.type}</div>
              <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>{issue.title}</h2>
              <span className="subtext">Записей: {issue.count}</span>
              {issue.hint ? <div className="subtext" style={{ marginTop: 6 }}>{issue.hint}</div> : null}
            </button>
            <button type="button" className="btn btn-text" onClick={() => setExpanded(expanded === issue.code ? null : issue.code)}>
              {expanded === issue.code ? 'Свернуть' : 'Открыть'}
            </button>
          </div>
          {expanded === issue.code && (
            <div className="table-scroll" style={{ borderTop: '1px solid var(--border)' }}>
              <table>
                <thead>
                  <tr>
                    <th>Объект</th>
                    <th>Детали</th>
                    <th>Дополнительно</th>
                    <th style={{ width: 220 }}>Действие</th>
                  </tr>
                </thead>
                <tbody>
                  {issue.items.map((item: any, idx: number) => (
                    <tr key={idx}>
                      {issue.code === 'similar' ? (
                        <>
                          <td><div className="strong">{item.a.name}</div></td>
                          <td className="mono">и</td>
                          <td><div className="strong">{item.b.name}</div></td>
                          <td>
                            <button
                              className="btn btn-primary"
                              onClick={async () => {
                                if (!window.confirm(`Объединить «${item.a.name}» в «${item.b.name}»?`)) return;
                                try {
                                  await (window as any).api.mergeCategories(item.a.id, item.b.id);
                                  onNotice?.('Категории объединены');
                                  onChanged();
                                  await load();
                                } catch (e: any) {
                                  onNotice?.(e?.message || 'Ошибка');
                                }
                              }}
                            >
                              Объединить
                            </button>
                          </td>
                        </>
                      ) : issue.code === 'dup_sku' || issue.code === 'dup_barcode' ? (
                        <>
                          <td className="mono strong">{item.sku || item.barcode}</td>
                          <td>Повторов: {item.c}</td>
                          <td className="subtext">{(item.items || []).map((e: any) => e.name).join(', ')}</td>
                          <td>
                            {(item.items || []).slice(0, 2).map((entry: any) => (
                              <button key={entry.id} className="btn btn-secondary" style={{ marginRight: 6 }} onClick={() => onOpenItem({ id: entry.id })}>
                                #{entry.id}
                              </button>
                            ))}
                          </td>
                        </>
                      ) : issue.type === 'ops' || issue.type === 'lots' ? (
                        <>
                          <td><div className="strong">{item.name || `#${item.id}`}</div></td>
                          <td className="subtext">{item.detail || '—'}</td>
                          <td className="mono subtext">{item.order_no || item.barcode || '—'}</td>
                          <td>
                            {item.id || item.item_id ? (
                              <button className="btn btn-secondary" onClick={() => onOpenItem({ id: item.id || item.item_id })}>Открыть</button>
                            ) : <span className="subtext">См. раздел</span>}
                          </td>
                        </>
                      ) : (
                        <>
                          <td><div className="strong">{item.name || `Товар #${item.id}`}</div></td>
                          <td className="mono">{item.barcode || item.detail || '—'}</td>
                          <td className="mono subtext">#{item.id}</td>
                          <td>
                            <div className="row-actions">
                              <button className="btn btn-secondary" onClick={() => onOpenItem({ id: item.id, barcode: item.barcode })}>Открыть</button>
                              {issue.code === 'no_sku' && (
                                <button className="btn btn-primary" disabled={busyKey === `sku-${item.id}`} onClick={() => void generateSkuFor(item)}>SKU</button>
                              )}
                              {issue.code === 'no_unit' && (
                                <button className="btn btn-primary" disabled={busyKey === `unit-${item.id}`} onClick={() => void assignDefaultUnit(item)}>шт.</button>
                              )}
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ))}

      {!hasIssues && (
        <section className="card" style={{ padding: 32 }}>
          <h2 style={{ margin: 0 }}>Расхождений нет</h2>
          <p className="subtext" style={{ marginTop: 8 }}>
            Остатки совпадают с журналом, критичных проблем каталога нет. Score {report.health?.score ?? 100}.
          </p>
        </section>
      )}
    </div>
  );
}
