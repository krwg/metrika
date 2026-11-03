import { useEffect, useMemo, useState } from 'react';
import ItemPickerDialog from './ItemPickerDialog';
import DateField from './DateField';
import LocationPicker from './LocationPicker';
import { useCurrency } from '../currency';

type OrderForm = {
  name: string;
  description: string;
  target_name: string;
  build_quantity: number;
  priority: string;
  due_date: string;
  planned_start: string;
  assignee_user_id: string;
  assignee_name: string;
  control_note: string;
  result_item_id: string;
  result_location_id: string;
};

const emptyForm = (): OrderForm => ({
  name: '', description: '', target_name: '', build_quantity: 1, priority: 'normal', due_date: '',
  planned_start: '', assignee_user_id: '', assignee_name: '', control_note: '',
  result_item_id: '', result_location_id: '',
});

function isOverdue(project: any) {
  if (!project?.due_date) return false;
  if (['consumed', 'finished', 'completed'].includes(String(project.status))) return false;
  return String(project.due_date) < new Date().toISOString().slice(0, 10);
}

const STATUS_LABEL: Record<string, string> = {
  draft: 'Черновик',
  reserved: 'Зарезервирован',
  picking: 'Комплектация',
  picked: 'Скомплектован',
  assembly: 'Сборка',
  consumed: 'Списан',
  finished: 'Завершен',
  completed: 'Завершен',
};

const PRIORITY_LABEL: Record<string, string> = {
  low: 'Низкий',
  normal: 'Обычный',
  high: 'Высокий',
  urgent: 'Срочный',
};

const STATUS_BADGE: Record<string, string> = {
  'В наличии': 'in',
  'Отсутствует': 'out',
  'Недостаточно': 'out',
  'Зарезервировано': 'reserve',
};

const HOLDING = new Set(['reserved', 'picking', 'picked', 'assembly']);

export default function ProjectsPage({
  refreshToken,
  onChanged,
  focusProjectId,
  onFocusConsumed,
}: {
  refreshToken: number;
  onChanged: () => void;
  focusProjectId?: number | null;
  onFocusConsumed?: () => void;
}) {
  const { symbol } = useCurrency();
  const [projects, setProjects] = useState<any[]>([]);
  const [costSummary, setCostSummary] = useState<any | null>(null);
  const [items, setItems] = useState<any[]>([]);
  const [selected, setSelected] = useState<any | null>(null);
  const [components, setComponents] = useState<any[]>([]);
  const [pickList, setPickList] = useState<any[]>([]);
  const [detailTab, setDetailTab] = useState<'bom' | 'pick' | 'ops'>('bom');
  const [form, setForm] = useState<OrderForm>(emptyForm());
  const [editing, setEditing] = useState<any>(null);
  const [editForm, setEditForm] = useState<OrderForm>(emptyForm());
  const [pickerOpen, setPickerOpen] = useState(false);
  const [projectSearch, setProjectSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [assigneeFilter, setAssigneeFilter] = useState('all');
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState('');
  const [savedViews, setSavedViews] = useState<any[]>([]);
  const [viewName, setViewName] = useState('');
  const [activeViewId, setActiveViewId] = useState<number | null>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [operations, setOperations] = useState<any[]>([]);
  const [opTitle, setOpTitle] = useState('');
  const [planBusy, setPlanBusy] = useState(false);

  async function reloadViews() {
    try {
      const rows = await (window as any).api.listSavedListViews('projects');
      setSavedViews(Array.isArray(rows) ? rows : []);
    } catch {
      setSavedViews([]);
    }
  }

  function applyView(row: any) {
    try {
      const params = typeof row.params_json === 'string' ? JSON.parse(row.params_json || '{}') : (row.params || {});
      setProjectSearch(String(params.search || ''));
      setStatusFilter(String(params.statusFilter || 'all'));
      setAssigneeFilter(String(params.assigneeFilter || 'all'));
      setActiveViewId(Number(row.id) || null);
    } catch {
      setError('Не удалось применить представление');
    }
  }

  async function saveCurrentView() {
    const name = viewName.trim()
      || (projectSearch.trim() ? `Поиск: ${projectSearch.trim()}` : statusFilter !== 'all' ? `Статус: ${STATUS_LABEL[statusFilter] || statusFilter}` : 'Проекты');
    try {
      await (window as any).api.saveListView({
        name,
        list_key: 'projects',
        params: { search: projectSearch, statusFilter, assigneeFilter },
      });
      setViewName('');
      await reloadViews();
    } catch (e: any) {
      setError(e?.message || 'Не удалось сохранить представление');
    }
  }

  async function removeView(id: number) {
    try {
      await (window as any).api.deleteSavedListView(id);
      if (activeViewId === id) setActiveViewId(null);
      await reloadViews();
    } catch (e: any) {
      setError(e?.message || 'Не удалось удалить представление');
    }
  }

  async function load() {
    setProjects((await (window as any).api.getProjects()) || []);
    setItems((await (window as any).api.getItems()) || []);
    try {
      setCostSummary(await (window as any).api.getProjectCostSummary?.() || null);
    } catch {
      setCostSummary(null);
    }
    try {
      const session = await (window as any).api.getAuthSession?.();
      const orgId = session?.organization?.id;
      setUsers((await (window as any).api.listUsers?.(orgId)) || []);
    } catch {
      setUsers([]);
    }
  }

  function money(n: any) {
    const v = Number(n);
    if (!Number.isFinite(v)) return '—';
    return `${v.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ${symbol}`;
  }
  async function loadOperations(projectId: number) {
    try {
      setOperations((await (window as any).api.listProjectOperations(projectId)) || []);
    } catch {
      setOperations([]);
    }
  }
  async function loadDetails(order: any) {
    setSelected(order);
    setError('');
    setComponents((await (window as any).api.getProjectDetails(order.id)) || []);
    await loadOperations(order.id);
    if (HOLDING.has(order.status) || order.status === 'consumed') {
      setPickList((await (window as any).api.getProjectPickList(order.id)) || []);
    } else {
      setPickList([]);
    }
  }
  useEffect(() => { load(); }, [refreshToken]);
  useEffect(() => { void reloadViews(); }, [refreshToken]);

  function applyAssigneeToForm(next: OrderForm, userId: string): OrderForm {
    const user = users.find((u) => String(u.id) === String(userId));
    if (!user) return { ...next, assignee_user_id: userId, assignee_name: userId ? next.assignee_name : '' };
    const fio = [user.last_name, user.first_name || user.display_name, user.middle_name].filter(Boolean).join(' ')
      || user.display_name || user.login;
    return { ...next, assignee_user_id: userId, assignee_name: fio };
  }

  useEffect(() => {
    if (focusProjectId == null) return;
    void (async () => {
      try {
        const list = await (window as any).api.getProjects() || [];
        const order = (list || []).find((p: any) => Number(p.id) === Number(focusProjectId));
        if (order) await loadDetails(order);
      } catch {  }
      finally { onFocusConsumed?.(); }
    })();
  }, [focusProjectId]);
  useEffect(() => { if (selected) { const current = projects.find((p) => p.id === selected.id); if (current) setSelected(current); } }, [projects]);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    if (!form.name.trim()) { setError('Заполните название заказа'); return; }
    try {
      const payload = {
        ...form,
        assignee_user_id: form.assignee_user_id ? Number(form.assignee_user_id) : null,
        result_item_id: form.result_item_id ? Number(form.result_item_id) : null,
        result_location_id: form.result_location_id ? Number(form.result_location_id) : null,
      };
      const result = await (window as any).api.createProject(payload);
      setForm(emptyForm());
      setShowCreate(false);
      await load();
      const freshList = (await (window as any).api.getProjects()) || [];
      const created = freshList.find((p: any) => p.id === result.id);
      if (created) await loadDetails(created);
      onChanged();
    } catch (createError: any) { setError(createError?.message || 'Не удалось создать заказ-наряд'); }
  }

  function startEdit(project: any) {
    setEditing(project);
    setEditForm({
      name: project.name || '',
      description: project.description || '',
      target_name: project.target_name || project.name || '',
      build_quantity: Number(project.build_quantity) || 1,
      priority: project.priority || 'normal',
      due_date: project.due_date || '',
      planned_start: project.planned_start || '',
      assignee_user_id: project.assignee_user_id ? String(project.assignee_user_id) : '',
      assignee_name: project.assignee_name || '',
      control_note: project.control_note || '',
      result_item_id: project.result_item_id ? String(project.result_item_id) : '',
      result_location_id: project.result_location_id ? String(project.result_location_id) : '',
    });
  }

  async function saveEdit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    if (!editForm.name.trim()) { setError('Заполните название заказа'); return; }
    try {
      await (window as any).api.updateProject(editing.id, {
        ...editForm,
        assignee_user_id: editForm.assignee_user_id ? Number(editForm.assignee_user_id) : null,
        result_item_id: editForm.result_item_id ? Number(editForm.result_item_id) : null,
        result_location_id: editForm.result_location_id ? Number(editForm.result_location_id) : null,
      });
      setEditing(null);
      await load();
      const freshList = (await (window as any).api.getProjects()) || [];
      const updated = freshList.find((p: any) => p.id === editing.id);
      if (updated) await loadDetails(updated);
      onChanged();
    } catch (saveError: any) { setError(saveError?.message || 'Не удалось обновить заказ-наряд'); }
  }

  async function pickComponent(item: any, quantity: number) {
    if (!selected) return;
    setError('');
    try {
      await (window as any).api.addProjectItem(selected.id, Number(item.id), Number(quantity));
      setPickerOpen(false);
      await loadDetails(selected);
      onChanged();
    } catch (addError: any) {
      setError(addError?.message || 'Не удалось добавить компонент');
    }
  }

  async function copyOrder(project: any) {
    try {
      setError('');
      const result = await (window as any).api.copyProject(project.id);
      await load();
      const fresh = ((await (window as any).api.getProjects()) || []).find((p: any) => p.id === result.id);
      if (fresh) await loadDetails(fresh);
      onChanged();
    } catch (e: any) { setError(e?.message || 'Не удалось скопировать'); }
  }

  async function advance(status: string) {
    try {
      setError('');
      await (window as any).api.setProjectStatus(selected.id, status);
      await load();
      await loadDetails({ ...selected, status });
      onChanged();
    } catch (e: any) { setError(e?.message || 'Не удалось сменить статус'); }
  }

  async function reloadSelected(fallbackStatus?: string) {
    await load();
    const freshList = (await (window as any).api.getProjects()) || [];
    const fresh = freshList.find((p: any) => p.id === selected.id) || (fallbackStatus ? { ...selected, status: fallbackStatus } : null);
    if (fresh) await loadDetails(fresh);
  }
  async function reserve() {
    if (!window.confirm(`Закрепить компоненты за заказом ${selected.order_no || selected.name}? Они станут недоступны для обычного расхода.`)) return;
    try {
      setError('');
      await (window as any).api.reserveProject(selected.id);
      await reloadSelected('reserved');
      setDetailTab('pick');
      onChanged();
    } catch (reserveError: any) {
      setError(reserveError?.message || 'Не удалось зарезервировать заказ');
    }
  }
  async function release() {
    if (!window.confirm('Снять резерв и очистить результаты сканирования комплекта?')) return;
    try {
      setError('');
      await (window as any).api.releaseProject(selected.id);
      await reloadSelected('draft');
      setDetailTab('bom');
      onChanged();
    } catch (releaseError: any) {
      setError(releaseError?.message || 'Не удалось снять резерв');
    }
  }
  async function consume() {
    if (!window.confirm(`Списать зарезервированные компоненты для заказа ${selected.order_no || selected.name}?`)) return;
    try {
      setError('');
      await (window as any).api.consumeProject(selected.id);
      await reloadSelected('consumed');
      onChanged();
    } catch (consumeError: any) {
      setError(consumeError?.message || 'Недостаточно компонентов для сборки');
    }
  }
  async function complete() {
    if (!window.confirm(`Завершить заказ ${selected.order_no || selected.name}?`)) return;
    try {
      setError('');
      await (window as any).api.completeProjectTask(selected.id);
      await reloadSelected('finished');
      onChanged();
    } catch (e: any) {
      setError(e?.message || 'Не удалось завершить заказ');
    }
  }
  async function remove(project: any) {
    if (!window.confirm(`Удалить заказ-наряд ${project.order_no || project.name}? Спецификация и сканы этого заказа будут удалены.`)) return;
    try {
      await (window as any).api.deleteProject(project.id);
      if (selected?.id === project.id) { setSelected(null); setComponents([]); setPickList([]); }
      if (editing?.id === project.id) setEditing(null);
      await load();
      onChanged();
    } catch (removeError: any) { setError(removeError?.message || 'Не удалось удалить заказ-наряд'); }
  }
  async function print() { setError(''); const file = await (window as any).api.printProject(selected.id); if (file) setError(`Документ сохранен: ${file}`); }

  const progress = components.length ? Math.round(components.reduce((sum, row) => sum + Math.min(1, HOLDING.has(selected?.status) || selected?.status === 'consumed' || selected?.status === 'finished' || selected?.status === 'completed' ? row.scanned / row.required : row.available / row.required), 0) / components.length * 100) : 0;

  async function savePlan() {
    if (!selected) return;
    setPlanBusy(true);
    setError('');
    try {
      const updated = await (window as any).api.assignProject(selected.id, {
        assignee_user_id: selected.assignee_user_id || null,
        assignee_name: selected.assignee_name || null,
        planned_start: selected.planned_start || null,
        due_date: selected.due_date || null,
        control_note: selected.control_note || null,
      });
      await load();
      if (updated) await loadDetails(updated);
    } catch (e: any) {
      setError(e?.message || 'Не удалось сохранить план');
    } finally {
      setPlanBusy(false);
    }
  }

  const filteredProjects = useMemo(() => {
    const query = projectSearch.trim().toLocaleLowerCase();
    return projects.filter((project) => {
      const statusOk = statusFilter === 'all'
        || project.status === statusFilter
        || (statusFilter === 'finished' && project.status === 'completed')
        || (statusFilter === 'overdue' && isOverdue(project));
      const assigneeOk = assigneeFilter === 'all'
        || (assigneeFilter === 'unassigned' && !project.assignee_name && !project.assignee_user_id)
        || String(project.assignee_user_id || '') === assigneeFilter
        || String(project.assignee_name || '').toLocaleLowerCase() === assigneeFilter.toLocaleLowerCase();
      const text = `${project.order_no || ''} ${project.name || ''} ${project.target_name || ''} ${project.description || ''} ${project.assignee_name || ''}`.toLocaleLowerCase();
      return statusOk && assigneeOk && (!query || text.includes(query));
    });
  }, [projects, projectSearch, statusFilter, assigneeFilter]);

  const recentProjects = useMemo(() => projects.slice(0, 5), [projects]);

  return <>
    <div className="page-header">
      <div>
        <div className="section-label">Производство</div>
        <h1>Заказы-наряды</h1>
        <p>Спецификация, исполнители, план/факт себестоимости, НЗП, операции контроля, резерв и сборка.</p>
      </div>
      <button className="btn btn-primary" onClick={() => setShowCreate((v) => !v)}>{showCreate ? 'Скрыть форму' : 'Создать заказ'}</button>
    </div>
    {costSummary && (
      <div className="dashboard-grid" style={{ marginBottom: 16 }}>
        <div className="stat-card">
          <div className="stat-label">НЗП (материалы)</div>
          <div className="stat-value" style={{ fontSize: 22 }}>{money(costSummary.wip_total)}</div>
          <div className="stat-hint">{costSummary.wip_orders} акт. заказов</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">План по всем WO</div>
          <div className="stat-value" style={{ fontSize: 22 }}>{money(costSummary.planned_total)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Факт списаний</div>
          <div className="stat-value" style={{ fontSize: 22 }}>{money(costSummary.actual_total)}</div>
        </div>
      </div>
    )}
    <div className="project-layout">
      <section className="card project-list">
        <div className="table-header"><h2>Заказы</h2><span className="table-caption">{filteredProjects.length} из {projects.length}</span></div>
        {showCreate && (
          <form className="project-create order-create" onSubmit={create}>
            <input placeholder="Название заказа *" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
            <input placeholder="Изделие" value={form.target_name} onChange={(event) => setForm({ ...form, target_name: event.target.value })} />
            <input placeholder="Описание" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
            <select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })}>
              <option value="low">Приоритет: Низкий</option>
              <option value="normal">Приоритет: Обычный</option>
              <option value="high">Приоритет: Высокий</option>
              <option value="urgent">Приоритет: Срочный</option>
            </select>
            <DateField label="Старт" value={form.planned_start} onChange={(planned_start) => setForm({ ...form, planned_start })} />
            <DateField label="Срок" value={form.due_date} onChange={(due_date) => setForm({ ...form, due_date })} />
            <select
              value={form.assignee_user_id}
              onChange={(e) => setForm(applyAssigneeToForm(form, e.target.value))}
            >
              <option value="">Исполнитель не назначен</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{[u.last_name, u.first_name || u.display_name].filter(Boolean).join(' ') || u.login}</option>
              ))}
            </select>
            <input placeholder="Заметка контроля" value={form.control_note} onChange={(e) => setForm({ ...form, control_note: e.target.value })} />
            <input type="number" min="1" placeholder="Тираж" value={form.build_quantity} onChange={(event) => setForm({ ...form, build_quantity: Number(event.target.value) })} />
            <select value={form.result_item_id} onChange={(e) => setForm({ ...form, result_item_id: e.target.value })}>
              <option value="">ГП на склад: не оприходовать</option>
              {items.filter((row) => row.item_type !== 'service').slice(0, 500).map((row) => (
                <option key={row.id} value={row.id}>{row.name}{row.sku ? ` · ${row.sku}` : ''}</option>
              ))}
            </select>
            {form.result_item_id && (
              <LocationPicker
                label="Ячейка прихода ГП"
                value={form.result_location_id}
                onChange={(result_location_id) => setForm({ ...form, result_location_id })}
                allowEmpty
                emptyLabel="Из первой ячейки резерва"
              />
            )}
            <button className="btn btn-primary">Создать</button>
          </form>
        )}
        <div className="project-list-tools">
          <input aria-label="Поиск проекта" placeholder="Номер, изделие, описание" value={projectSearch} onChange={(event) => { setProjectSearch(event.target.value); setActiveViewId(null); }} />
          <select aria-label="Фильтр статуса проекта" value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setActiveViewId(null); }}>
            <option value="all">Все статусы</option>
            <option value="overdue">Просроченные</option>
            {Object.entries(STATUS_LABEL).filter(([k]) => k !== 'completed').map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <select aria-label="Фильтр исполнителя" value={assigneeFilter} onChange={(event) => { setAssigneeFilter(event.target.value); setActiveViewId(null); }}>
            <option value="all">Все исполнители</option>
            <option value="unassigned">Без исполнителя</option>
            {users.map((u) => (
              <option key={u.id} value={String(u.id)}>{[u.last_name, u.first_name || u.display_name].filter(Boolean).join(' ') || u.login}</option>
            ))}
          </select>
        </div>
        <div className="filter-row" style={{ margin: '8px 0 12px', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <span className="subtext">Представления</span>
          <input
            className="search-input"
            style={{ maxWidth: 180 }}
            value={viewName}
            onChange={(e) => setViewName(e.target.value)}
            placeholder="Название среза…"
            onKeyDown={(e) => { if (e.key === 'Enter') void saveCurrentView(); }}
          />
          <button type="button" className="btn btn-secondary" onClick={() => void saveCurrentView()}>Сохранить</button>
          {savedViews.map((row) => (
            <span key={row.id} className={`filter-chip ${activeViewId === row.id ? 'active' : ''}`} style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
              <button type="button" className="btn btn-text" style={{ padding: 0 }} onClick={() => applyView(row)}>{row.name}</button>
              <button type="button" className="btn btn-text" style={{ padding: 0 }} title="Удалить" onClick={() => void removeView(row.id)}>×</button>
            </span>
          ))}
        </div>
        {!projectSearch && statusFilter === 'all' && recentProjects.length > 0 && (
          <div className="project-recent">
            <div className="section-label">Последние</div>
            <div className="project-recent-chips">
              {recentProjects.map((project) => (
                <button key={`r-${project.id}`} type="button" className={`filter-chip ${selected?.id === project.id ? 'active' : ''}`} onClick={() => loadDetails(project)}>
                  {project.order_no}
                </button>
              ))}
            </div>
          </div>
        )}
        {filteredProjects.map((project) => (
          <div className="project-entry" key={project.id}>
            <button className={`project-row ${selected?.id === project.id ? 'active' : ''}`} onClick={() => loadDetails(project)}>
              <span>
                <strong>{project.order_no || `WO-${String(project.id).padStart(4, '0')}`} · {project.target_name || project.name}</strong>
                <small>
                  {STATUS_LABEL[project.status] || project.status} · тираж {project.build_quantity}
                  {project.priority && project.priority !== 'normal' ? ` · ${PRIORITY_LABEL[project.priority] || project.priority}` : ''}
                  {project.assignee_name ? ` · ${project.assignee_name}` : ''}
                  {project.due_date ? ` · до ${project.due_date}` : ''}
                  {isOverdue(project) ? ' · просрочен' : ''}
                  {project.planned_cost != null ? ` · план ${Number(project.planned_cost).toLocaleString('ru-RU', { maximumFractionDigits: 0 })}` : ''}
                  {HOLDING.has(project.status) && project.wip_value != null ? ` · НЗП ${Number(project.wip_value).toLocaleString('ru-RU', { maximumFractionDigits: 0 })}` : ''}
                  {project.actual_cost != null ? ` · факт ${Number(project.actual_cost).toLocaleString('ru-RU', { maximumFractionDigits: 0 })}` : ''}
                  {Number(project.ops_total) > 0 ? ` · операции ${project.ops_done || 0}/${project.ops_total}` : ''}
                </small>
              </span>
              <span className="project-component-count">{project.component_count} поз.</span>
            </button>
            <div className="project-entry-actions">
              {project.status === 'draft' && <button className="btn btn-text" onClick={() => startEdit(project)}>Настроить</button>}
              <button className="btn btn-text" onClick={() => copyOrder(project)}>Копировать</button>
              <button className="btn btn-danger" onClick={() => remove(project)}>Удалить</button>
            </div>
            {editing?.id === project.id && (
              <form className="project-create order-create" onSubmit={saveEdit} onClick={(e) => e.stopPropagation()} style={{ background: 'var(--surface-muted)' }}>
                <input placeholder="Название *" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
                <input placeholder="Изделие" value={editForm.target_name} onChange={(e) => setEditForm({ ...editForm, target_name: e.target.value })} />
                <input placeholder="Описание" value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} />
                <select value={editForm.priority} onChange={(e) => setEditForm({ ...editForm, priority: e.target.value })}>
                  <option value="low">Низкий</option>
                  <option value="normal">Обычный</option>
                  <option value="high">Высокий</option>
                  <option value="urgent">Срочный</option>
                </select>
                <DateField label="Старт" value={editForm.planned_start} onChange={(planned_start) => setEditForm({ ...editForm, planned_start })} />
                <DateField label="Срок" value={editForm.due_date} onChange={(due_date) => setEditForm({ ...editForm, due_date })} />
                <select
                  value={editForm.assignee_user_id}
                  onChange={(e) => setEditForm(applyAssigneeToForm(editForm, e.target.value))}
                >
                  <option value="">Исполнитель не назначен</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>{[u.last_name, u.first_name || u.display_name].filter(Boolean).join(' ') || u.login}</option>
                  ))}
                </select>
                <input placeholder="Заметка контроля" value={editForm.control_note} onChange={(e) => setEditForm({ ...editForm, control_note: e.target.value })} />
                <input type="number" min="1" placeholder="Тираж" value={editForm.build_quantity} onChange={(e) => setEditForm({ ...editForm, build_quantity: Number(e.target.value) })} />
                <select value={editForm.result_item_id} onChange={(e) => setEditForm({ ...editForm, result_item_id: e.target.value })}>
                  <option value="">ГП на склад: не оприходовать</option>
                  {items.filter((row) => row.item_type !== 'service').slice(0, 500).map((row) => (
                    <option key={row.id} value={row.id}>{row.name}{row.sku ? ` · ${row.sku}` : ''}</option>
                  ))}
                </select>
                {editForm.result_item_id && (
                  <LocationPicker
                    label="Ячейка прихода ГП"
                    value={editForm.result_location_id}
                    onChange={(result_location_id) => setEditForm({ ...editForm, result_location_id })}
                    allowEmpty
                    emptyLabel="Из первой ячейки резерва"
                  />
                )}
                <button className="btn btn-primary" type="submit">Сохранить</button>
                <button className="btn btn-secondary" type="button" onClick={() => setEditing(null)}>Отмена</button>
              </form>
            )}
          </div>
        ))}
      </section>
      <section className="card project-detail">
        {selected ? <>
          <div className="table-header">
            <div>
              <div className="section-label">Заказ-наряд {selected.order_no || `WO-${String(selected.id).padStart(4, '0')}`}</div>
              <h2>{selected.target_name || selected.name}</h2>
              <div className="subtext">
                Тираж: {selected.build_quantity || 1} · Статус: {STATUS_LABEL[selected.status] || selected.status}
                {selected.priority ? ` · Приоритет: ${PRIORITY_LABEL[selected.priority] || selected.priority}` : ''}
                {selected.planned_start ? ` · Старт: ${selected.planned_start}` : ''}
                {selected.due_date ? ` · Срок: ${selected.due_date}` : ''}
                {isOverdue(selected) ? ' · просрочен' : ''}
              </div>
              {selected.description && <div className="subtext" style={{ marginTop: 6 }}>{selected.description}</div>}
              <div className="form-grid" style={{ marginTop: 12 }}>
                <label>Исполнитель
                  <select
                    value={selected.assignee_user_id ? String(selected.assignee_user_id) : ''}
                    onChange={(e) => {
                      const next = applyAssigneeToForm({
                        ...emptyForm(),
                        assignee_user_id: selected.assignee_user_id ? String(selected.assignee_user_id) : '',
                        assignee_name: selected.assignee_name || '',
                      }, e.target.value);
                      setSelected({
                        ...selected,
                        assignee_user_id: next.assignee_user_id ? Number(next.assignee_user_id) : null,
                        assignee_name: next.assignee_name || null,
                      });
                    }}
                  >
                    <option value="">Не назначен</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>{[u.last_name, u.first_name || u.display_name].filter(Boolean).join(' ') || u.login}</option>
                    ))}
                  </select>
                </label>
                <DateField
                  label="План. старт"
                  value={selected.planned_start || ''}
                  onChange={(planned_start) => setSelected({ ...selected, planned_start })}
                />
                <DateField
                  label="Срок"
                  value={selected.due_date || ''}
                  onChange={(due_date) => setSelected({ ...selected, due_date })}
                />
                <label className="field-wide">Контроль / заметка
                  <input
                    value={selected.control_note || ''}
                    onChange={(e) => setSelected({ ...selected, control_note: e.target.value })}
                    placeholder="Что проверить перед списанием…"
                  />
                </label>
              </div>
              <button type="button" className="btn btn-secondary" style={{ marginTop: 8 }} disabled={planBusy} onClick={() => void savePlan()}>
                Сохранить план / исполнителя
              </button>
              <div className="dashboard-grid" style={{ marginTop: 12, gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
                <div className="stat-card" style={{ padding: 10 }}>
                  <div className="stat-label">План</div>
                  <div className="stat-value" style={{ fontSize: 16 }}>{money(selected.planned_cost)}</div>
                </div>
                <div className="stat-card" style={{ padding: 10 }}>
                  <div className="stat-label">НЗП</div>
                  <div className="stat-value" style={{ fontSize: 16 }}>
                    {HOLDING.has(selected.status) ? money(selected.wip_value) : '—'}
                  </div>
                </div>
                <div className="stat-card" style={{ padding: 10 }}>
                  <div className="stat-label">Факт{selected.actual_cost != null && selected.planned_cost != null
                    ? ` · Δ ${money(Number(selected.actual_cost) - Number(selected.planned_cost))}`
                    : ''}
                  </div>
                  <div className="stat-value" style={{ fontSize: 16 }}>{money(selected.actual_cost)}</div>
                </div>
              </div>
            </div>
            <div className="order-actions">
              <button className="btn btn-secondary" onClick={print}>Печать PDF</button>
              <button className="btn btn-secondary" onClick={reserve} disabled={selected.status !== 'draft'}>Зарезервировать</button>
              {HOLDING.has(selected.status) && <button className="btn btn-text" onClick={release}>Снять резерв</button>}
              {selected.status === 'reserved' && <button className="btn btn-secondary" onClick={() => advance('picking')}>В комплектацию</button>}
              {(selected.status === 'reserved' || selected.status === 'picking') && (
                <button className="btn btn-secondary" onClick={() => advance('picked')}>Скомплектован</button>
              )}
              {selected.status === 'picked' && <button className="btn btn-secondary" onClick={() => advance('assembly')}>На сборку</button>}
              <button
                className="btn btn-primary"
                onClick={consume}
                disabled={!HOLDING.has(selected.status)}
                title={selected.status === 'reserved' || selected.status === 'picking'
                  ? 'Нужна полная комплектация в ТСД или статус «Скомплектован»'
                  : undefined}
              >
                {selected.status === 'consumed' || selected.status === 'finished' || selected.status === 'completed' ? 'Списано' : 'Списать комплект'}
              </button>
              {selected.status === 'consumed' && <button className="btn btn-secondary" onClick={complete}>Завершить</button>}
            </div>
          </div>
          <div className="progress-track"><span style={{ width: `${progress}%` }} /></div>
          <div className="progress-label">{HOLDING.has(selected.status) || selected.status === 'consumed' || selected.status === 'finished' ? 'Отсканировано' : 'Доступность компонентов'}: {progress}%{selected.reserved_at ? ` · зарезервировано ${new Date(selected.reserved_at).toLocaleString('ru-RU')}` : ''}</div>
          {HOLDING.has(selected.status) && (
            <div className="project-scan-hint">
              Резерв не списывает товар. Отсканируйте комплект в ТСД или отметьте «Скомплектован», затем спишите.
              {pickList.length === 0 ? ' Маршрут комплектации пуст — снимите резерв и зарезервируйте снова.' : ''}
            </div>
          )}
          <div className="project-tabs">
            <button type="button" className={`filter-chip ${detailTab === 'bom' ? 'active' : ''}`} onClick={() => setDetailTab('bom')}>Спецификация — что нужно</button>
            <button type="button" className={`filter-chip ${detailTab === 'pick' ? 'active' : ''}`} onClick={() => setDetailTab('pick')}>Комплектация — откуда взять</button>
            <button type="button" className={`filter-chip ${detailTab === 'ops' ? 'active' : ''}`} onClick={() => setDetailTab('ops')}>
              Операции{operations.length ? ` · ${operations.filter((o) => o.is_done).length}/${operations.length}` : ''}
            </button>
          </div>
          {detailTab === 'bom' && <>
            <div className="project-add">
              <button className="btn btn-secondary" onClick={() => setPickerOpen(true)} disabled={selected.status !== 'draft'}>Найти в каталоге…</button>
              <span className="subtext">Каталог: {items.length.toLocaleString('ru-RU')} поз. Поиск и фильтры — в отдельном окне. В доступность входят только исправные.</span>
            </div>
            <div className="table-scroll">
              <table>
                <thead><tr><th>Компонент</th><th>Нужно</th><th>Доступно</th><th>Отсканировано</th><th>Статус</th><th></th></tr></thead>
                <tbody>
                  {components.length === 0 && <tr><td colSpan={6} style={{ padding: 30, textAlign: 'center', color: 'var(--muted)' }}>Спецификация пуста. Добавьте компоненты выше.</td></tr>}
                  {components.map((entry) => (
                    <tr key={entry.item_id}>
                      <td className="strong">{entry.print_name || entry.name}<div className="subtext">{entry.sku} · {entry.barcode || 'Еще не определен'} · на изд. {entry.per_unit}</div></td>
                      <td>{entry.required} {entry.unit_symbol || 'шт.'}</td>
                      <td>{entry.available} {entry.unit_symbol || 'шт.'}</td>
                      <td>{entry.scanned || 0} / {entry.required}</td>
                      <td><span className={`type-badge ${STATUS_BADGE[entry.component_status] || 'in'}`}>{entry.component_status}</span></td>
                      <td>
                        <div className="row-actions">
                          <button className="btn btn-danger" onClick={async () => { try { setError(''); await (window as any).api.removeProjectItem(selected.id, entry.item_id); await loadDetails(selected); } catch (removeError: any) { setError(removeError?.message || 'Не удалось удалить компонент'); } }} disabled={selected.status !== 'draft'}>Удалить</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>}
          {detailTab === 'pick' && (
            <div className="table-scroll">
              <table>
                <thead><tr><th>Ячейка</th><th>Компонент</th><th>Кол-во</th></tr></thead>
                <tbody>
                  {pickList.length === 0 && <tr><td colSpan={3} style={{ padding: 30, textAlign: 'center', color: 'var(--muted)' }}>{HOLDING.has(selected.status) ? 'Список комплектации пуст' : 'Сначала зарезервируйте заказ — появится маршрут комплектации'}</td></tr>}
                  {pickList.map((row, index) => (
                    <tr key={`${row.location_id}-${row.item_id}-${index}`}>
                      <td className="strong">{row.location_name}<div className="subtext mono">{row.location_barcode}</div></td>
                      <td>{row.print_name || row.name}<div className="subtext">{row.sku}</div></td>
                      <td><strong>{row.quantity} {row.unit_symbol || 'шт.'}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {detailTab === 'ops' && (
            <div>
              <p className="subtext">
                Чеклист техопераций / контроля по заказу. Отметки сохраняются с исполнителем.
                {operations.length > 0
                  ? ` Норма: ${operations.reduce((s: number, o: any) => s + (Number(o.norm_minutes) || 0), 0)} мин.`
                  : ''}
              </p>
              <div style={{ display: 'flex', gap: 8, margin: '10px 0', flexWrap: 'wrap' }}>
                <input
                  placeholder="Напр. Пайка · Контроль ОТК · Упаковка"
                  value={opTitle}
                  onChange={(e) => setOpTitle(e.target.value)}
                  style={{ flex: '1 1 220px' }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void (async () => {
                        if (!opTitle.trim()) return;
                        try {
                          await (window as any).api.addProjectOperation(selected.id, opTitle.trim());
                          setOpTitle('');
                          await loadOperations(selected.id);
                          await load();
                        } catch (err: any) {
                          setError(err?.message || 'Не удалось добавить операцию');
                        }
                      })();
                    }
                  }}
                />
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={!opTitle.trim()}
                  onClick={async () => {
                    try {
                      await (window as any).api.addProjectOperation(selected.id, opTitle.trim());
                      setOpTitle('');
                      await loadOperations(selected.id);
                      await load();
                    } catch (err: any) {
                      setError(err?.message || 'Не удалось добавить операцию');
                    }
                  }}
                >
                  Добавить
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  title="Загрузить техоперации и нормы из спецификации ГП"
                  onClick={async () => {
                    try {
                      await (window as any).api.applyTechOpsToProject(selected.id);
                      await loadOperations(selected.id);
                      await load();
                    } catch (err: any) {
                      setError(err?.message || 'Не удалось загрузить из спецификации');
                    }
                  }}
                >
                  Из спецификации ГП
                </button>
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th></th>
                      <th>Операция</th>
                      <th>Норма</th>
                      <th>Кто</th>
                      <th>Когда</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {operations.length === 0 && (
                      <tr>
                        <td colSpan={6} style={{ padding: 28, textAlign: 'center', color: 'var(--muted)' }}>
                          Операций пока нет — добавьте шаги или загрузите из спецификации ГП
                        </td>
                      </tr>
                    )}
                    {operations.map((op) => (
                      <tr key={op.id}>
                        <td>
                          <input
                            type="checkbox"
                            checked={Boolean(op.is_done)}
                            onChange={async (e) => {
                              try {
                                setOperations(await (window as any).api.setProjectOperationDone(op.id, e.target.checked));
                                await load();
                              } catch (err: any) {
                                setError(err?.message || 'Не удалось отметить');
                              }
                            }}
                          />
                        </td>
                        <td className={op.is_done ? 'subtext' : 'strong'}>{op.title}</td>
                        <td>{Number(op.norm_minutes) ? `${op.norm_minutes} мин` : '—'}</td>
                        <td>{op.done_by || '—'}</td>
                        <td className="mono">{op.done_at ? new Date(op.done_at).toLocaleString('ru-RU') : '—'}</td>
                        <td>
                          <button
                            type="button"
                            className="btn btn-text"
                            onClick={async () => {
                              try {
                                setOperations(await (window as any).api.removeProjectOperation(op.id));
                                await load();
                              } catch (err: any) {
                                setError(err?.message || 'Не удалось удалить');
                              }
                            }}
                          >
                            Удалить
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </> : <div className="empty"><h3>Выберите заказ-наряд</h3><p>Создайте заказ, назначьте исполнителя и добавьте спецификацию. После резерва появится маршрут комплектации.</p></div>}
      </section>
    </div>
    {pickerOpen && selected?.status === 'draft' && (
      <ItemPickerDialog items={items} onClose={() => setPickerOpen(false)} onPick={pickComponent} />
    )}
    {error && <div className="form-error page-error">{error}</div>}
  </>;
}
