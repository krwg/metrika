import { useCallback, useEffect, useMemo, useState } from 'react';

type TreeNode = {
  id: string;
  label: string;
  kind: 'folder' | 'table' | 'settings' | 'info';
  table?: string;
  children?: TreeNode[];
  hint?: string;
  writable?: boolean;
};

type ColumnInfo = {
  name: string;
  type: string;
  notnull: boolean;
  pk: boolean;
  dflt_value: any;
};

type Props = {
  refreshToken: number;
  onNotice?: (message: string) => void;
  standalone?: boolean;
};

export default function ConfigEditorPage({ refreshToken, onNotice, standalone = false }: Props) {
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    root: true,
    common: true,
    catalogs: true,
    documents: true,
    registers: true,
    db: false,
  });
  const [selectedId, setSelectedId] = useState('root');
  const [filter, setFilter] = useState('');
  const [columns, setColumns] = useState<ColumnInfo[]>([]);
  const [pkColumns, setPkColumns] = useState<string[]>([]);
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [editDraft, setEditDraft] = useState<Record<string, string>>({});
  const [editingPk, setEditingPk] = useState<Record<string, any> | null>(null);
  const [insertMode, setInsertMode] = useState(false);
  const pageSize = 50;

  const selected = useMemo(() => findNode(tree, selectedId), [tree, selectedId]);

  const loadTree = useCallback(async () => {
    try {
      const result = await (window as any).api.configTree();
      setTree(result?.tree || []);
      setError('');
    } catch (e: any) {
      setError(e?.message || 'Не удалось загрузить дерево конфигурации');
    }
  }, []);

  const loadTable = useCallback(async (table: string, pageIndex = 0) => {
    setBusy(true);
    setError('');
    try {
      const info = await (window as any).api.configTableInfo(table);
      const data = await (window as any).api.configTableRows(table, { offset: pageIndex * pageSize, limit: pageSize });
      setColumns(info?.columns || []);
      setPkColumns(info?.pkColumns || (info?.columns || []).filter((c: ColumnInfo) => c.pk).map((c: ColumnInfo) => c.name));
      setRows(data?.rows || []);
      setTotal(Number(data?.total || 0));
      setPage(pageIndex);
      setEditingPk(null);
      setInsertMode(false);
      setEditDraft({});
    } catch (e: any) {
      setError(e?.message || 'Не удалось прочитать таблицу');
      setColumns([]);
      setPkColumns([]);
      setRows([]);
      setTotal(0);
    } finally {
      setBusy(false);
    }
  }, []);

  const loadSettings = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const data = await (window as any).api.configSettingsList();
      setColumns([
        { name: 'key', type: 'TEXT', notnull: true, pk: true, dflt_value: null },
        { name: 'value', type: 'TEXT', notnull: false, pk: false, dflt_value: null },
      ]);
      setPkColumns(['key']);
      setRows((data?.rows || []).map((r: any) => ({ key: r.key, value: r.value })));
      setTotal(Number(data?.total || 0));
      setPage(0);
      setEditingPk(null);
      setInsertMode(false);
      setEditDraft({});
    } catch (e: any) {
      setError(e?.message || 'Не удалось загрузить настройки');
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { void loadTree(); }, [loadTree, refreshToken]);

  useEffect(() => {
    if (!selected) return;
    if (selected.kind === 'table' && selected.table) void loadTable(selected.table, 0);
    else if (selected.kind === 'settings') void loadSettings();
    else {
      setColumns([]);
      setRows([]);
      setTotal(0);
      setEditingPk(null);
      setInsertMode(false);
    }
  }, [selected, loadTable, loadSettings]);

  function toggleExpand(id: string) {
    setExpanded((cur) => ({ ...cur, [id]: !cur[id] }));
  }

  function selectNode(node: TreeNode) {
    setSelectedId(node.id);
    if (node.kind === 'folder') setExpanded((cur) => ({ ...cur, [node.id]: true }));
  }

  function rowPk(row: any): Record<string, any> {
    const keys = pkColumns.length ? pkColumns : [columns.find((c) => c.pk)?.name || columns[0]?.name || 'id'];
    const out: Record<string, any> = {};
    for (const k of keys) out[k] = row[k];
    return out;
  }

  function pkLabel(pk: Record<string, any> | null) {
    if (!pk) return '';
    return Object.values(pk).join(' / ');
  }

  async function saveRow() {
    if (!selected) return;
    setBusy(true);
    try {
      if (selected.kind === 'settings') {
        const key = String(editDraft.key || '').trim();
        if (!key) throw new Error('Укажите ключ настройки');
        await (window as any).api.configSettingsSave(key, String(editDraft.value ?? ''));
        onNotice?.(insertMode ? `Настройка «${key}» создана` : `Настройка «${key}» сохранена`);
        await loadSettings();
      } else if (selected.kind === 'table' && selected.table) {
        const payload: Record<string, any> = {};
        for (const col of columns) {
          if (editDraft[col.name] === undefined) continue;
          payload[col.name] = editDraft[col.name] === '' ? null : editDraft[col.name];
        }
        if (insertMode) {
          await (window as any).api.configTableInsert(selected.table, payload);
          onNotice?.(`Строка добавлена в ${selected.table}`);
        } else {
          await (window as any).api.configTableUpdate(selected.table, editingPk, payload);
          onNotice?.(`Строка ${pkLabel(editingPk)} сохранена`);
        }
        await loadTable(selected.table, page);
      }
    } catch (e: any) {
      setError(e?.message || 'Не удалось сохранить');
      onNotice?.(e?.message || 'Не удалось сохранить');
    } finally {
      setBusy(false);
    }
  }

  async function deleteRow(row: any) {
    if (!selected || selected.writable === false) return;
    const pk = selected.kind === 'settings' ? { key: row.key } : rowPk(row);
    if (!window.confirm(`Удалить запись ${pkLabel(pk)}? Это прямое изменение БД.`)) return;
    setBusy(true);
    try {
      if (selected.kind === 'settings') {
        await (window as any).api.configSettingsDelete(String(pk.key));
        await loadSettings();
      } else if (selected.table) {
        await (window as any).api.configTableDelete(selected.table, pk);
        await loadTable(selected.table, page);
      }
      onNotice?.(`Удалено: ${pkLabel(pk)}`);
    } catch (e: any) {
      setError(e?.message || 'Не удалось удалить');
    } finally {
      setBusy(false);
    }
  }

  function startEdit(row: any) {
    const draft: Record<string, string> = {};
    for (const col of columns) draft[col.name] = row[col.name] == null ? '' : String(row[col.name]);
    setEditDraft(draft);
    setEditingPk(selected?.kind === 'settings' ? { key: row.key } : rowPk(row));
    setInsertMode(false);
  }

  function startInsert() {
    const draft: Record<string, string> = {};
    for (const col of columns) draft[col.name] = '';
    setEditDraft(draft);
    setEditingPk(null);
    setInsertMode(true);
  }

  const filteredTree = useMemo(() => filterTree(tree, filter.trim().toLowerCase()), [tree, filter]);

  return (
    <>
      {!standalone && (
        <div className="page-header">
          <div>
            <div className="section-label">Конфигуратор</div>
            <h1>Редактор конфигурации</h1>
            <p>Дерево метаданных в духе 1С: справочники, документы, регистры и прямое редактирование таблиц БД.</p>
          </div>
          <div className="table-actions">
            <button type="button" className="btn btn-secondary" onClick={() => void loadTree()} disabled={busy}>Обновить дерево</button>
            {selected?.kind === 'table' && selected.table && (
              <button type="button" className="btn btn-secondary" onClick={() => void loadTable(selected.table!, page)} disabled={busy}>Перечитать</button>
            )}
            {selected?.kind === 'settings' && (
              <button type="button" className="btn btn-secondary" onClick={() => void loadSettings()} disabled={busy}>Перечитать</button>
            )}
          </div>
        </div>
      )}
      {standalone && (
        <div className="table-actions" style={{ marginBottom: 10 }}>
          <button type="button" className="btn btn-secondary" onClick={() => void loadTree()} disabled={busy}>Обновить дерево</button>
          {selected?.kind === 'table' && selected.table && (
            <button type="button" className="btn btn-secondary" onClick={() => void loadTable(selected.table!, page)} disabled={busy}>Перечитать</button>
          )}
          {selected?.kind === 'settings' && (
            <button type="button" className="btn btn-secondary" onClick={() => void loadSettings()} disabled={busy}>Перечитать</button>
          )}
        </div>
      )}
      {error && <div className="form-error page-error">{error}</div>}

      <div className={`config-editor${standalone ? ' config-editor-standalone' : ''}`}>
        <aside className="config-tree-pane">
          <input
            className="search-input"
            placeholder="Поиск в дереве…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <div className="config-tree" role="tree">
            {filteredTree.map((node) => (
              <TreeBranch
                key={node.id}
                node={node}
                depth={0}
                expanded={expanded}
                selectedId={selectedId}
                onToggle={toggleExpand}
                onSelect={selectNode}
              />
            ))}
          </div>
        </aside>

        <section className="config-detail-pane">
          {!selected || selected.kind === 'folder' || selected.kind === 'info' ? (
            <div className="config-welcome">
              <div className="section-label">Объект конфигурации</div>
              <h2>{selected?.label || 'Конфигурация Метрика'}</h2>
              <p>{selected?.hint || 'Выберите объект в дереве слева. Для таблиц доступен просмотр и правка строк БД.'}</p>
              <ul className="config-welcome-list">
                <li><b>Общие</b> — настройки, организации, пользователи, доп. реквизиты</li>
                <li><b>Справочники</b> — номенклатура, категории, адреса, поставщики</li>
                <li><b>Документы</b> — журнал документов, закупки, ревизии, проекты</li>
                <li><b>Регистры</b> — остатки, движения, партии, резервы</li>
                <li><b>Таблицы БД</b> — полный список SQLite для прямой работы</li>
              </ul>
            </div>
          ) : (
            <>
              <div className="table-header" style={{ marginBottom: 12 }}>
                <div>
                  <div className="section-label">{selected.kind === 'settings' ? 'Настройки' : 'Таблица'}</div>
                  <h2>{selected.label}</h2>
                  <p className="subtext">
                    {selected.table ? `sqlite · ${selected.table}` : 'schema_meta · setting:*'}
                    {' · '}
                    {total.toLocaleString('ru-RU')} записей
                    {selected.writable === false ? ' · только чтение' : ' · запись разрешена'}
                  </p>
                </div>
                {selected.writable !== false && (
                  <button type="button" className="btn btn-primary" onClick={startInsert} disabled={busy}>Добавить</button>
                )}
              </div>

              {(insertMode || editingPk != null) && (
                <div className="config-edit-form card" style={{ marginBottom: 12, padding: 12 }}>
                  <div className="section-label">{insertMode ? 'Новая запись' : `Редактирование · ${pkLabel(editingPk)}`}</div>
                  <div className="form-grid" style={{ marginTop: 8 }}>
                    {columns.map((col) => (
                      <label key={col.name} className={col.type?.toUpperCase().includes('TEXT') && !col.pk ? 'field-wide' : ''}>
                        {col.name}{col.pk ? ' (PK)' : ''}{col.notnull ? ' *' : ''}
                        <input
                          value={editDraft[col.name] ?? ''}
                          disabled={Boolean(col.pk && !insertMode && selected.kind === 'table')}
                          onChange={(e) => setEditDraft((d) => ({ ...d, [col.name]: e.target.value }))}
                        />
                      </label>
                    ))}
                  </div>
                  <div className="modal-actions" style={{ marginTop: 8 }}>
                    <button type="button" className="btn btn-secondary" onClick={() => { setInsertMode(false); setEditingPk(null); }}>Отмена</button>
                    <button type="button" className="btn btn-primary" onClick={() => void saveRow()} disabled={busy}>Сохранить</button>
                  </div>
                </div>
              )}

              <div className="table-wrap config-data-table">
                <table>
                  <thead>
                    <tr>
                      {columns.map((col) => <th key={col.name}>{col.name}</th>)}
                      {selected.writable !== false && <th style={{ width: 120 }}>Действия</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, idx) => (
                      <tr key={pkLabel(rowPk(row)) || String(idx)}>
                        {columns.map((col) => (
                          <td key={col.name} title={row[col.name] == null ? '' : String(row[col.name])}>
                            {formatCell(row[col.name])}
                          </td>
                        ))}
                        {selected.writable !== false && (
                          <td>
                            <button type="button" className="btn btn-text" onClick={() => startEdit(row)}>Изменить</button>
                            <button type="button" className="btn btn-text" onClick={() => void deleteRow(row)}>Удал.</button>
                          </td>
                        )}
                      </tr>
                    ))}
                    {!rows.length && (
                      <tr><td colSpan={columns.length + 1} className="subtext">Нет данных</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              {selected.kind === 'table' && total > pageSize && (
                <div className="filter-row" style={{ marginTop: 8, gap: 8 }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={page <= 0 || busy}
                    onClick={() => selected.table && void loadTable(selected.table, page - 1)}
                  >
                    ← Назад
                  </button>
                  <span className="subtext">Стр. {page + 1} / {Math.max(1, Math.ceil(total / pageSize))}</span>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={(page + 1) * pageSize >= total || busy}
                    onClick={() => selected.table && void loadTable(selected.table, page + 1)}
                  >
                    Вперёд →
                  </button>
                </div>
              )}

              {!!columns.length && (
                <div className="config-props" style={{ marginTop: 16 }}>
                  <div className="section-label">Свойства / реквизиты</div>
                  <div className="config-props-grid">
                    {columns.map((col) => (
                      <div key={col.name} className="config-prop">
                        <strong>{col.name}</strong>
                        <span>{col.type || 'ANY'}{col.pk ? ' · PK' : ''}{col.notnull ? ' · обязат.' : ''}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </>
  );
}

function TreeBranch({
  node,
  depth,
  expanded,
  selectedId,
  onToggle,
  onSelect,
}: {
  node: TreeNode;
  depth: number;
  expanded: Record<string, boolean>;
  selectedId: string;
  onToggle: (id: string) => void;
  onSelect: (node: TreeNode) => void;
}) {
  const hasKids = Boolean(node.children?.length);
  const open = expanded[node.id];
  return (
    <div>
      <button
        type="button"
        role="treeitem"
        aria-expanded={hasKids ? open : undefined}
        className={`config-tree-item ${selectedId === node.id ? 'selected' : ''} kind-${node.kind}`}
        style={{ paddingLeft: 8 + depth * 14 }}
        onClick={() => {
          onSelect(node);
          if (hasKids) onToggle(node.id);
        }}
      >
        <span className="config-tree-twist">{hasKids ? (open ? '▾' : '▸') : '·'}</span>
        <span>{node.label}</span>
      </button>
      {hasKids && open && node.children!.map((child) => (
        <TreeBranch
          key={child.id}
          node={child}
          depth={depth + 1}
          expanded={expanded}
          selectedId={selectedId}
          onToggle={onToggle}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

function findNode(nodes: TreeNode[], id: string): TreeNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    if (node.children) {
      const found = findNode(node.children, id);
      if (found) return found;
    }
  }
  return null;
}

function filterTree(nodes: TreeNode[], q: string): TreeNode[] {
  if (!q) return nodes;
  const out: TreeNode[] = [];
  for (const node of nodes) {
    const kids = node.children ? filterTree(node.children, q) : [];
    if (node.label.toLowerCase().includes(q) || node.table?.toLowerCase().includes(q) || kids.length) {
      out.push({ ...node, children: kids.length ? kids : node.children });
    }
  }
  return out;
}

function formatCell(value: any) {
  if (value == null) return '—';
  const text = String(value);
  return text.length > 80 ? `${text.slice(0, 77)}…` : text;
}
