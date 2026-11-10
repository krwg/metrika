(() => {
  const KEY = 'metrika-demo-v7';
  const DOWNLOAD = 'https://github.com/krwg/metrika/releases/download/v0.5.0/Metrika-Setup-0.5.0.exe';
  const SCANNER_PAGES = new Set(['items', 'locations', 'inventory', 'tsd']);

  const USER_NAV = [
    'dashboard', 'items', 'locations', 'inventory', 'projects', 'reserves', 'tsd',
    'purchases', 'replenishment', 'documents', 'history', 'cabinet', 'info',
  ];

  const OP_MODES = [
    { id: 'lookup', ru: 'Поиск', en: 'Lookup', hintRu: 'Карточка по штрихкоду', hintEn: 'Card by barcode', icon: '⌕', tone: 'amber' },
    { id: 'receipt', ru: 'Приход', en: 'Receipt', hintRu: 'Оприходовать на ячейку', hintEn: 'Receive to bin', icon: '↓', tone: 'teal' },
    { id: 'issue', ru: 'Расход', en: 'Issue', hintRu: 'Списать со склада', hintEn: 'Issue from stock', icon: '↑', tone: 'coral' },
    { id: 'pair', ru: 'Товар + ячейка', en: 'Item + bin', hintRu: 'Два скана подряд', hintEn: 'Two scans', icon: '⇄', tone: 'sage' },
    { id: 'audit', ru: 'Ревизия', en: 'Stocktake', hintRu: 'Пересчёт факта', hintEn: 'Recount fact', icon: '☰', tone: 'slate' },
    { id: 'transfer', ru: 'Перемещение', en: 'Transfer', hintRu: 'С ячейки на ячейку', hintEn: 'Bin to bin', icon: '⇢', tone: 'slate' },
  ];

  const NAV = [
    { id: 'dashboard', ru: 'Обзор', en: 'Overview' },
    { id: 'items', ru: 'Товары', en: 'Items' },
    { id: 'categories', ru: 'Категории', en: 'Categories' },
    { id: 'units', ru: 'Единицы', en: 'Units' },
    { id: 'replenishment', ru: 'Пополнение', en: 'Replenishment' },
    { id: 'purchases', ru: 'Закупки', en: 'Purchases' },
    { id: 'locations', ru: 'Хранение', en: 'Storage' },
    { id: 'inventory', ru: 'Ревизия', en: 'Stocktake' },
    { id: 'projects', ru: 'Проекты', en: 'Projects' },
    { id: 'reserves', ru: 'Резервы', en: 'Reserves' },
    { id: 'tsd', ru: 'Терминал сбора', en: 'Data terminal' },
    { id: 'abc', ru: 'Аналитика', en: 'Analytics' },
    { id: 'templates', ru: 'Шаблоны', en: 'Templates' },
    { id: 'quality', ru: 'Качество', en: 'Quality' },
    { id: 'documents', ru: 'Журнал документов', en: 'Document journal' },
    { id: 'assets', ru: 'Оборудование / ОС', en: 'Assets / FA' },
    { id: 'edo', ru: 'ЭДО', en: 'EDI' },
    { id: 'employees', ru: 'Сотрудники', en: 'Employees' },
    { id: 'company', ru: 'Компания', en: 'Company' },
    { id: 'organizations', ru: 'Организация', en: 'Organization' },
    { id: 'cabinet', ru: 'Личный кабинет', en: 'Personal cabinet' },
    { id: 'audit', ru: 'Журнал действий', en: 'Activity log' },
    { id: 'history', ru: 'История', en: 'History' },
    { id: 'info', ru: 'Информация', en: 'Information' },
    { id: 'settings', ru: 'Настройки', en: 'Settings' },
  ];

  const I18N = {
    ru: {
      welcomeSub: 'Локальный складской учёт для Windows',
      welcomeLead: 'Каталог, штрихкоды, адресные ячейки, сканер, ревизии, сборка по BOM, закупки, документы и аналитика — в одной локальной базе на вашем ПК. Без облачного аккаунта.',
      feat1t: 'Каталог и штрихкоды', feat1d: 'Несколько кодов на позицию, категории, мин./макс.',
      feat2t: 'Адресное хранение', feat2d: 'Склад → подсклад → ячейка с вместимостью',
      feat3t: 'Сканер', feat3d: 'Товар + ячейка (+1) в любом порядке',
      feat4t: 'Ревизия и акты', feat4d: 'Обход ячеек, списание, оприходование',
      feat5t: 'Сборка и резервы', feat5d: 'BOM, резерв по ячейкам, комплектация',
      feat6t: 'Документы и аналитика', feat6d: 'Журнал, ABC/XYZ, пополнение, закупки',
      welcomeNote: 'Превью повторяет интерфейс Windows-приложения на демо-данных в этой вкладке. Полный продукт — установщик Metrika Home.',
      download: 'Скачать', enterSign: 'Войти',
      bannerTitle: 'Metrika Home — превью интерфейса', bannerHint: ' · без сервера, данные только в этой вкладке',
      reset: 'Сбросить', exit: 'Выйти',
      appTitle: 'Metrika Home [0.5]', brand: 'Metrika Home',
      menuFile: 'Файл', menuEdit: 'Изменить', menuInfo: 'Информация', menuHelp: 'Помощь', menuTerm: 'Терминал',
      session: 'Администратор · Мастерская', sideFoot: 'Складской учёт',
      orgsTitle: 'Организации', orgsHint: 'Сначала выберите организацию, затем войдите под пользователем',
      usersTitle: 'Вход в организацию', usersHint: 'Выберите пользователя организации «Мастерская»',
      next: 'Далее →', backOrgs: '← Организации', login: 'Войти',
      add: 'Добавить…', edit: 'Изменить…', remove: 'Удалить', editor: 'Редактор',
      password: 'Пароль', searchPh: 'Поиск товара, артикула, штрихкода',
      scanLabel: 'Сканер', scanMode: 'Товар + ячейка (+1 шт.)', scanPort: 'BROWSER · без COM',
      noScan: 'нет скана', scanHint: 'Отсканируйте товар и ячейку в любом порядке',
      role: 'Администратор', name: 'Администратор',
      morning: 'Доброе утро', day: 'Добрый день', evening: 'Добрый вечер', night: 'Доброй ночи',
      dashSub: 'Операционная панель · статистика, остатки, пополнение и движение за текущий месяц',
      toastView: 'В превью действие только для просмотра',
      toastOk: (a, b, q) => `${a} → ${b} · остаток ${q}`,
      toastBad: 'Неизвестный код', toastWait: 'Ждём второй код…', toastReset: 'Данные сброшены',
      toastPosted: 'Документ проведён (локально)', toastReserve: 'Резерв обновлён',
      recent: 'Недавние', favorites: 'Избранное', split: 'Разделить', crm: 'CRM',
    },
    en: {
      welcomeSub: 'Local warehouse inventory for Windows',
      welcomeLead: 'Catalog, barcodes, bins, scanner, stocktakes, BOM assembly, purchasing, documents and analytics — one local database on your PC. No cloud account.',
      feat1t: 'Catalog & barcodes', feat1d: 'Multiple codes per SKU, categories, min/max',
      feat2t: 'Address storage', feat2d: 'Warehouse → sub-location → bin with capacity',
      feat3t: 'Scanner', feat3d: 'Item + bin (+1) in any order',
      feat4t: 'Stocktake & acts', feat4d: 'Walk bins, write-off, surplus',
      feat5t: 'Assembly & reserves', feat5d: 'BOM, cell reserves, kit pick',
      feat6t: 'Documents & analytics', feat6d: 'Journal, ABC/XYZ, replenishment, POs',
      welcomeNote: 'This preview mirrors the Windows app UI on demo data in this tab. The full product is the Metrika Home installer.',
      download: 'Download', enterSign: 'Sign in',
      bannerTitle: 'Metrika Home — UI preview', bannerHint: ' · offline, data stays in this tab',
      reset: 'Reset', exit: 'Sign out',
      appTitle: 'Metrika Home [0.5]', brand: 'Metrika Home',
      menuFile: 'File', menuEdit: 'Edit', menuInfo: 'Information', menuHelp: 'Help', menuTerm: 'Terminal',
      session: 'Administrator · Workshop', sideFoot: 'Warehouse accounting',
      orgsTitle: 'Organizations', orgsHint: 'Select an organization, then sign in as a user',
      usersTitle: 'Organization sign-in', usersHint: 'Select a user of “Workshop”',
      next: 'Next →', backOrgs: '← Organizations', login: 'Sign in',
      add: 'Add…', edit: 'Edit…', remove: 'Delete', editor: 'Editor',
      password: 'Password', searchPh: 'Search item, SKU, barcode',
      scanLabel: 'Scanner', scanMode: 'Item + bin (+1 pcs)', scanPort: 'BROWSER · no COM',
      noScan: 'no scan', scanHint: 'Scan item and bin in any order',
      role: 'Administrator', name: 'Administrator',
      morning: 'Good morning', day: 'Good afternoon', evening: 'Good evening', night: 'Good night',
      dashSub: 'Operations panel · stats, stock, replenishment and month movement',
      toastView: 'View-only in this preview',
      toastOk: (a, b, q) => `${a} → ${b} · qty ${q}`,
      toastBad: 'Unknown code', toastWait: 'Waiting for the second code…', toastReset: 'Data reset',
      toastPosted: 'Document posted (local)', toastReserve: 'Reserve updated',
      recent: 'Recent', favorites: 'Favorites', split: 'Split', crm: 'CRM',
    },
  };

  function seed() {
    const base = (window.MetrikaDemoData && typeof window.MetrikaDemoData.seed === 'function')
      ? window.MetrikaDemoData.seed()
      : {};
    return {
      ...base,
      user: null,
      itemSearch: '',
      filter: 'all',
      purchTab: base.purchTab || 'po',
      invChip: base.invChip || 'cell',
      companyTab: base.companyTab || 'counterparties',
      settingsSection: base.settingsSection || 'appearance',
      openTabs: base.openTabs || ['dashboard'],
      splitPage: base.splitPage ?? null,
      opMode: base.opMode ?? null,
      sessionLines: base.sessionLines || [],
    };
  }

  let lang = localStorage.getItem('metrika-lang') === 'en' ? 'en' : 'ru';
  let stage = sessionStorage.getItem('metrika-demo-stage') || 'welcome'; // welcome | launcher-orgs | launcher-users | app
  let state = load();
  if (state.user?.id) selectedUser = state.user.id;
  let page = 'dashboard';
  let pendingItem = null;
  let pendingBin = null;
  let selectedOrg = 1;
  let selectedUser = 1;

  function currentUser() {
    if (state.user) return state.user;
    return state.employees?.find((e) => e.id === selectedUser) || state.employees?.[0] || { name: '—', role: 'admin', login: 'admin' };
  }
  function currentRole() { return currentUser().role || 'admin'; }
  function sessionTitle() {
    const u = currentUser();
    return `${u.name} · ${state.org?.name || ''}`;
  }
  function roleLabel(role) {
    if (lang === 'en') {
      if (role === 'admin') return 'Administrator';
      if (role === 'operator') return 'Operator';
      return 'User';
    }
    if (role === 'admin') return 'Администратор';
    if (role === 'operator') return 'Оператор';
    return 'Пользователь';
  }
  function navIds() {
    if (currentRole() === 'admin') return NAV.map((n) => n.id);
    if (currentRole() === 'user') return USER_NAV;
    return [];
  }
  function canOpen(id) {
    if (currentRole() === 'admin') return true;
    if (currentRole() === 'operator') return false;
    return USER_NAV.includes(id);
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return seed();
      return { ...seed(), ...JSON.parse(raw) };
    } catch { return seed(); }
  }
  function save() { localStorage.setItem(KEY, JSON.stringify(state)); }
  function setStage(s) {
    stage = s;
    sessionStorage.setItem('metrika-demo-stage', s);
    render();
  }
  function t(key) {
    const v = (I18N[lang] || I18N.ru)[key];
    return v == null ? I18N.ru[key] : v;
  }
  function navLabel(n) { return lang === 'en' ? n.en : n.ru; }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function toast(msg) {
    const el = document.getElementById('toast');
    el.hidden = false; el.textContent = msg;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { el.hidden = true; }, 2400);
  }
  function hello() {
    const h = new Date().getHours();
    return (h >= 5 && h < 12 ? t('morning') : h >= 12 && h < 17 ? t('day') : h >= 17 && h < 23 ? t('evening') : t('night'));
  }
  function typeBadge(type) {
    const map = { in: ['in', 'Приход'], out: ['out', 'Расход'], move: ['move', 'Перемещение'], pair: ['move', 'Размещение'] };
    const [cls, label] = map[type] || ['move', type];
    const en = { Приход: 'In', Расход: 'Out', Перемещение: 'Move', Размещение: 'Place' };
    return `<span class="type-badge ${cls}">${esc(lang === 'en' ? (en[label] || label) : label)}</span>`;
  }
  function statusPill(status) {
    const ru = { open: 'Открыт', partial: 'Частично', done: 'Получен', draft: 'Черновик', posted: 'Проведён', cancelled: 'Отменён', in_progress: 'В работе', sent: 'Отправлен', in_use: 'В работе', repair: 'Ремонт' };
    const en = { open: 'Open', partial: 'Partial', done: 'Received', draft: 'Draft', posted: 'Posted', cancelled: 'Cancelled', in_progress: 'In progress', sent: 'Sent', in_use: 'In use', repair: 'Repair' };
    const cls = ['posted', 'done', 'in_use'].includes(status) ? 'in' : ['open', 'partial', 'in_progress', 'repair', 'sent'].includes(status) ? 'warn' : 'move';
    return `<span class="type-badge ${cls}">${esc((lang === 'en' ? en : ru)[status] || status)}</span>`;
  }
  function fillPct(code) {
    const loc = state.locations.find((l) => l.code === code);
    if (!loc?.capacity) return 0;
    const qty = state.items.filter((i) => i.bin === code).reduce((s, i) => s + i.qty, 0);
    return Math.min(100, Math.round((qty / loc.capacity) * 100));
  }
  function lowItems() { return state.items.filter((i) => i.qty < i.min); }

  function bannerHtml() {
    return `<div class="demo-banner">
      <div><strong>${esc(t('bannerTitle'))}</strong><span>${esc(t('bannerHint'))}</span></div>
      <div class="demo-banner-actions">
        <button type="button" data-act="lang-ru" class="${lang === 'ru' ? 'is-on' : ''}">RUS</button>
        <button type="button" data-act="lang-en" class="${lang === 'en' ? 'is-on' : ''}">EN</button>
        <button type="button" data-act="reset">${esc(t('reset'))}</button>
        <button type="button" data-act="exit">${esc(t('exit'))}</button>
        <a class="primary" href="${DOWNLOAD}">${esc(t('download'))}</a>
      </div>
    </div>`;
  }

  function renderWelcome() {
    document.getElementById('welcome').innerHTML = `
      <div class="welcome-card">
        <div class="welcome-brand">
          <img class="welcome-logo" src="../assets/readme/logo.svg" width="56" height="56" alt="" />
          <div>
            <div class="welcome-title">Metrika Home [0.5]</div>
            <div class="welcome-sub">${esc(t('welcomeSub'))}</div>
          </div>
          <div class="welcome-lang-switch" role="group" aria-label="Language">
            <button type="button" class="welcome-lang${lang === 'ru' ? ' active' : ''}" data-act="lang-ru">RUS</button>
            <button type="button" class="welcome-lang${lang === 'en' ? ' active' : ''}" data-act="lang-en">EN</button>
          </div>
        </div>
        <p class="welcome-lead">${esc(t('welcomeLead'))}</p>
        <div class="welcome-grid">
          ${[1, 2, 3, 4, 5, 6].map((n) => `
            <div class="welcome-feature"><strong>${esc(t(`feat${n}t`))}</strong><span>${esc(t(`feat${n}d`))}</span></div>`).join('')}
        </div>
        <div class="welcome-note">${esc(t('welcomeNote'))}</div>
        <div class="welcome-actions">
          <a class="btn btn-secondary" href="${DOWNLOAD}">${esc(t('download'))}</a>
          <button type="button" class="btn btn-primary" data-act="to-launcher">${esc(t('enterSign'))}</button>
        </div>
      </div>`;
  }

  function renderLauncher() {
    const isUsers = stage === 'launcher-users';
    const body = isUsers ? `
      <div class="launcher-1c-brand">
        <div class="logo-mark">М</div>
        <div><div class="logo-text">${esc(t('brand'))}</div><div class="subtext" style="color:var(--muted);font-size:12px">${esc(state.org.name)}</div></div>
      </div>
      <div class="launcher-1c-title">${esc(t('usersTitle'))}</div>
      <p class="launcher-hint">${esc(lang === 'en' ? `Select a user of “${state.org.name}”` : `Выберите пользователя организации «${state.org.name}»`)}</p>
      <div class="launcher-1c-body">
        <div class="launcher-1c-list-col">
          <div class="launcher-1c-label">${lang === 'en' ? 'Users' : 'Пользователи'}</div>
          <div class="launcher-1c-list launcher-1c-list-users-tall">
            ${state.employees.map((u) => `
              <button type="button" class="launcher-1c-item${selectedUser === u.id ? ' selected' : ''}" data-user="${u.id}">
                <strong>${esc(u.name)}</strong><span>${esc(roleLabel(u.role))}</span>
              </button>`).join('')}
          </div>
          <label class="launcher-1c-password">${esc(t('password'))}
            <input type="password" id="loginPassword" placeholder="••••" />
          </label>
        </div>
        <div class="launcher-1c-actions">
          <button type="button" class="btn btn-primary launcher-1c-main" data-act="enter-app">${esc(t('login'))}</button>
          <div class="launcher-1c-sep"></div>
          <button type="button" class="btn btn-secondary" data-act="to-orgs">${esc(t('backOrgs'))}</button>
        </div>
      </div>
      <div class="launcher-1c-meta">${esc(state.org.name)}</div>`
      : `
      <div class="launcher-1c-brand">
        <div class="logo-mark">М</div>
        <div><div class="logo-text">${esc(t('brand'))}</div><div class="subtext" style="color:var(--muted);font-size:12px">Metrika Home [0.5]</div></div>
      </div>
      <div class="launcher-1c-title">${esc(t('orgsTitle'))}</div>
      <p class="launcher-hint">${esc(t('orgsHint'))}</p>
      <div class="launcher-1c-body">
        <div class="launcher-1c-list-col">
          <div class="launcher-1c-label">${esc(t('orgsTitle'))}</div>
          <div class="launcher-1c-list launcher-1c-list-orgs-tall">
            <button type="button" class="launcher-1c-item selected" data-org="1">
              <strong>${esc(state.org.name)}</strong><span>${esc(state.org.code)}</span>
            </button>
          </div>
        </div>
        <div class="launcher-1c-actions">
          <button type="button" class="btn btn-primary launcher-1c-main" data-act="to-users">${esc(t('next'))}</button>
          <div class="launcher-1c-sep"></div>
          <button type="button" class="btn btn-secondary" data-act="viewonly">${esc(t('add'))}</button>
          <button type="button" class="btn btn-secondary" data-act="viewonly">${esc(t('edit'))}</button>
          <button type="button" class="btn btn-secondary" data-act="viewonly">${esc(t('remove'))}</button>
          <div class="launcher-1c-sep"></div>
          <button type="button" class="btn btn-secondary" data-act="viewonly">${esc(t('editor'))}</button>
          <button type="button" class="btn btn-secondary" data-act="viewonly">MIAPI</button>
        </div>
      </div>
      <div class="launcher-1c-meta">${esc(state.org.name)}</div>`;

    document.getElementById('launcherRoot').innerHTML = `
      ${bannerHtml()}
      <div class="app-shell launcher-only">
        <div class="title-bar">
          <div class="title-bar-title">${esc(t('appTitle'))}</div>
          <div class="title-bar-drag"></div>
        </div>
        <div class="launcher-shell"><div class="launcher-1c">${body}</div></div>
      </div>`;
  }

  function openPage(id) {
    if (!canOpen(id)) { toast(t('toastView')); return; }
    page = id;
    if (state.splitPage === id) state.splitPage = null;
    if (!state.openTabs.includes(id)) {
      state.openTabs = [...state.openTabs.filter((x) => x !== id), id].slice(-8);
      save();
    }
    renderApp(false);
  }

  function toggleSplit() {
    if (state.splitPage) {
      state.splitPage = null;
    } else {
      const alt = navIds().find((x) => x !== page) || 'items';
      state.splitPage = page === 'dashboard' ? 'items' : (page === 'items' ? 'locations' : 'dashboard');
      if (!canOpen(state.splitPage)) state.splitPage = alt;
    }
    save();
    renderApp(false);
  }

  function enterApp() {
    const emp = state.employees.find((e) => e.id === selectedUser) || state.employees[0];
    if (!emp) return;
    state.user = { id: emp.id, name: emp.name, role: emp.role, login: emp.login };
    state.openTabs = ['dashboard'];
    state.splitPage = null;
    state.opMode = null;
    state.sessionLines = [];
    page = 'dashboard';
    save();
    setStage('app');
  }

  function pushSessionLine(kind, name, detail, qty) {
    const line = {
      id: `L-${Date.now()}`,
      kind,
      name,
      detail,
      qty: qty || 1,
      at: new Date().toLocaleTimeString(lang === 'en' ? 'en-US' : 'ru-RU', { hour: '2-digit', minute: '2-digit' }),
    };
    state.sessionLines = [line, ...(state.sessionLines || [])].slice(0, 40);
    save();
  }

  function pageHeader(label, title, sub, actions = '') {
    return `<div class="page-header"><div>
      <div class="section-label">${esc(label)}</div>
      <h1>${esc(title)}</h1>
      <p>${esc(sub)}</p>
    </div><div class="table-actions">${actions}</div></div>`;
  }

  function table(headers, rows) {
    return `<div class="table-wrap"><div class="table-scroll"><table>
      <thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead>
      <tbody>${rows}</tbody></table></div></div>`;
  }

  function monthMovement() {
    const tnd = state.trend || [];
    return {
      in: tnd.reduce((s, d) => s + d.received, 0),
      out: tnd.reduce((s, d) => s + d.issued, 0),
    };
  }

  function renderUserHome() {
    const low = lowItems();
    const units = state.items.reduce((s, i) => s + i.qty, 0);
    const cells = state.locations.filter((l) => l.type === 'cell');
    const used = cells.filter((c) => state.items.some((i) => i.bin === c.code && i.qty > 0)).length;
    const occ = cells.length ? Math.round((used / cells.length) * 100) : 0;
    const mm = monthMovement();
    const u = currentUser();
    const tile = (id, label, hint, tone, icon, go) => `
      <button type="button" class="op-pos-tile tone-${tone}" data-page="${go}">
        <span class="op-pos-tile-icon">${icon}</span><strong>${esc(label)}</strong>
        <span class="op-pos-tile-hint">${esc(hint)}</span>
      </button>`;
    return `<div class="arm-home arm-home-fill user-arm">
      <header class="arm-home-top">
        <div class="arm-home-greet">
          <div class="section-label">${lang === 'en' ? 'Warehouse · user' : 'Склад · пользователь'}</div>
          <h1>${esc(hello())}, ${esc(u.name)}</h1>
          <p>${esc(state.org.name)} · ${lang === 'en' ? 'summary and operations' : 'сводка и операции'}</p>
        </div>
      </header>
      <section class="user-kpi-band">
        ${[
          [lang === 'en' ? 'Items' : 'Товары', state.items.length, lang === 'en' ? 'in catalog' : 'в каталоге', 'items', false],
          [lang === 'en' ? 'Stock' : 'Остаток', units, lang === 'en' ? 'on hand' : 'на складе', 'locations', false],
          [lang === 'en' ? 'Below min' : 'Ниже мин.', low.length, lang === 'en' ? 'to replenish' : 'к пополнению', 'replenishment', low.length > 0],
          [lang === 'en' ? 'Fill' : 'Заполненность', `${occ}%`, `${used}/${cells.length}`, 'locations', false],
          [lang === 'en' ? 'In · month' : 'Приход · мес.', mm.in, '', 'history', false],
          [lang === 'en' ? 'Out · month' : 'Расход · мес.', mm.out, '', 'history', false],
        ].map(([lbl, val, hint, go, warn]) => `
          <button type="button" class="user-kpi-card${warn ? ' warn' : ''}" data-page="${go}">
            <span>${esc(lbl)}</span><strong>${esc(String(val))}</strong><small>${esc(hint)}</small>
          </button>`).join('')}
      </section>
      <div class="arm-home-body">
        <div class="arm-home-main op-pos-menu">
          <section class="arm-group">
            <div class="arm-group-head"><h2>${lang === 'en' ? 'Receiving' : 'Приёмка и размещение'}</h2></div>
            <div class="op-pos-tiles">
              ${tile('r', lang === 'en' ? 'Receipt' : 'Приход', lang === 'en' ? 'Receive to bin' : 'Оприходовать', 'teal', '↓', 'inventory')}
              ${tile('p', lang === 'en' ? 'Place' : 'Размещение', lang === 'en' ? 'Item + bin' : 'Товар + ячейка', 'sage', '⇄', 'inventory')}
              ${tile('s', lang === 'en' ? 'Surplus' : 'Излишки', lang === 'en' ? 'Surplus act' : 'Акт оприходования', 'amber', '＋', 'inventory')}
            </div>
          </section>
          <section class="arm-group">
            <div class="arm-group-head"><h2>${lang === 'en' ? 'Issue & moves' : 'Отгрузка и расход'}</h2></div>
            <div class="op-pos-tiles">
              ${tile('i', lang === 'en' ? 'Issue' : 'Расход', lang === 'en' ? 'Issue stock' : 'Списать', 'coral', '↑', 'inventory')}
              ${tile('t', lang === 'en' ? 'Transfer' : 'Перемещение', lang === 'en' ? 'Bin to bin' : 'Между ячейками', 'slate', '⇢', 'locations')}
              ${tile('a', lang === 'en' ? 'Stocktake' : 'Ревизия', lang === 'en' ? 'Recount' : 'Пересчёт', 'slate', '☰', 'inventory')}
            </div>
          </section>
          <section class="arm-group">
            <div class="arm-group-head"><h2>${lang === 'en' ? 'References' : 'Справочники'}</h2></div>
            <div class="op-pos-tiles">
              ${tile('it', lang === 'en' ? 'Items' : 'Товары', lang === 'en' ? 'Catalog' : 'Каталог', 'amber', '⌕', 'items')}
              ${tile('tsd', 'TSD', lang === 'en' ? 'Pick tasks' : 'Задания', 'slate', '▣', 'tsd')}
              ${tile('pr', lang === 'en' ? 'Projects' : 'Проекты', lang === 'en' ? 'BOM' : 'Сборка', 'teal', '◎', 'projects')}
            </div>
          </section>
        </div>
        <aside class="op-pos-side user-arm-side">
          <div class="op-pos-side-head"><h2>${lang === 'en' ? 'Attention' : 'Внимание'}</h2><span>${low.length}</span></div>
          <div class="op-pos-side-list">
            ${low.length ? low.slice(0, 8).map((i) => `
              <button type="button" class="arm-side-row" data-page="items">
                <div><strong>${esc(i.name)}</strong><span>${esc(i.category)} · min ${i.min}</span></div>
                <b>${i.qty}</b>
              </button>`).join('') : `<div class="op-pos-side-empty"><p>${lang === 'en' ? 'No replenishment needed.' : 'Пополнение не требуется.'}</p></div>`}
          </div>
          ${low.length ? `<button type="button" class="op-pos-cta" data-page="replenishment">${lang === 'en' ? 'Open replenishment' : 'Открыть пополнение'}</button>` : ''}
        </aside>
      </div>
    </div>`;
  }

  function renderOperatorView() {
    const u = currentUser();
    const mode = state.opMode;
    const modeMeta = (id) => OP_MODES.find((m) => m.id === id);
    const opLabel = (m) => (lang === 'en' ? m.en : m.ru);
    const opHint = (m) => (lang === 'en' ? m.hintEn : m.hintRu);
    const scanner = `
      <section class="card scanner-panel">
        <div class="scanner-heading">
          <div><div class="section-label">${esc(t('scanLabel'))}</div>
          <h2>${mode ? esc(opLabel(modeMeta(mode))) : esc(t('scanMode'))}</h2></div>
          <span class="connection-state">${esc(t('scanPort'))}</span>
        </div>
        <div class="scanner-body">
          <input id="scanInput" class="search-input" style="max-width:280px" autocomplete="off" placeholder="460100 / A-01-01" />
          <div id="lastScan" class="last-scan empty">${esc(t('noScan'))}</div>
          <div id="scanHint" class="scanner-hint">${esc(t('scanHint'))}</div>
        </div>
        <div class="scanner-controls">
          ${state.items.slice(0, 6).map((i) => `<button type="button" class="quick-btn" data-code="${esc(i.barcode)}">${esc(i.barcode)}</button>`).join('')}
          ${state.locations.filter((l) => l.type === 'cell').slice(0, 4).map((l) => `<button type="button" class="quick-btn" data-code="${esc(l.code)}">${esc(l.code)}</button>`).join('')}
        </div>
      </section>`;

    if (mode) {
      return `<div class="op-pos">
        <header class="op-pos-header">
          <div class="op-pos-brand">
            <div class="section-label">${lang === 'en' ? 'Warehouse · operator' : 'Склад · оператор'}</div>
            <h1>${esc(opLabel(modeMeta(mode)))}</h1>
            <p>${esc(state.org.name)}</p>
          </div>
          <div class="op-pos-header-actions">
            <button type="button" class="btn btn-secondary" data-act="op-menu">← ${lang === 'en' ? 'Menu' : 'Меню'}</button>
          </div>
        </header>
        <div class="op-pos-modebar">
          ${OP_MODES.map((m) => `
            <button type="button" class="op-pos-modechip tone-${m.tone}${mode === m.id ? ' active' : ''}" data-op="${m.id}">
              ${esc(opLabel(m))}
            </button>`).join('')}
        </div>
        <section class="op-pos-work card">
          <p class="subtext">${esc(opHint(modeMeta(mode)))}</p>
          ${scanner}
        </section>
        <aside class="op-pos-side" style="margin:0 20px 16px">
          <div class="op-pos-side-head"><h2>${lang === 'en' ? 'Session' : 'Сессия'}</h2></div>
          <div class="op-pos-side-list">
            ${(state.sessionLines || []).length ? state.sessionLines.slice(0, 12).map((ln) => `
              <div class="op-pos-line"><strong>${esc(ln.name)}</strong><span>${esc(ln.detail)} · ${esc(ln.at)}</span></div>`).join('')
              : `<div class="op-pos-side-empty"><p>${lang === 'en' ? 'No scans yet.' : 'Сканов пока нет.'}</p></div>`}
          </div>
        </aside>
      </div>`;
    }

    const groups = [
      { title: lang === 'en' ? 'Lookup & receive' : 'Поиск и приёмка', modes: ['lookup', 'receipt', 'pair'] },
      { title: lang === 'en' ? 'Issue & control' : 'Расход и контроль', modes: ['issue', 'audit', 'transfer'] },
    ];
    return `<div class="op-pos">
      <header class="op-pos-header">
        <div class="op-pos-brand">
          <div class="section-label">${lang === 'en' ? 'Warehouse · operator' : 'Склад · оператор'}</div>
          <h1>${esc(hello())}, ${esc(u.name)}</h1>
          <p>${esc(state.org.name)} · ${lang === 'en' ? 'workstation' : 'рабочее место'}</p>
        </div>
      </header>
      <div class="op-pos-body">
        <div class="op-pos-main">
          <div class="op-pos-menu">
            ${groups.map((g) => `
              <section class="arm-group">
                <div class="arm-group-head"><h2>${esc(g.title)}</h2></div>
                <div class="op-pos-tiles">
                  ${g.modes.map((id) => {
    const m = modeMeta(id);
    return `<button type="button" class="op-pos-tile tone-${m.tone}" data-op="${id}">
                      <span class="op-pos-tile-icon">${m.icon}</span>
                      <strong>${esc(opLabel(m))}</strong>
                      <span class="op-pos-tile-hint">${esc(opHint(m))}</span>
                    </button>`;
  }).join('')}
                </div>
              </section>`).join('')}
          </div>
          ${scanner}
        </div>
        <aside class="op-pos-side">
          <div class="op-pos-side-head"><h2>${lang === 'en' ? 'Session' : 'Сессия'}</h2></div>
          <div class="op-pos-side-list">
            ${(state.sessionLines || []).length ? state.sessionLines.slice(0, 16).map((ln) => `
              <div class="op-pos-line"><strong>${esc(ln.name)}</strong><span>${esc(ln.detail)}</span></div>`).join('')
              : `<div class="op-pos-side-empty"><p>${lang === 'en' ? 'Pick an operation above.' : 'Выберите операцию выше.'}</p></div>`}
          </div>
        </aside>
      </div>
    </div>`;
  }

  function renderPage(targetPage = page) {
    const low = lowItems();
    const units = state.items.reduce((s, i) => s + i.qty, 0);
    const cells = state.locations.filter((l) => l.type === 'cell');
    const used = cells.filter((c) => state.items.some((i) => i.bin === c.code && i.qty > 0)).length;
    const occ = cells.length ? Math.round((used / cells.length) * 100) : 0;
    const maxTrend = Math.max(1, ...state.trend.map((d) => Math.max(d.received, d.issued)));
    const catMax = Math.max(1, ...state.categories.map((c) => state.items.filter((i) => i.category === c.name).reduce((s, i) => s + i.qty, 0)));

    const mm = monthMovement();
    const pages = {
      dashboard: () => {
        if (targetPage === 'dashboard' && currentRole() === 'user') return renderUserHome();
        const u = currentUser();
        return `
        ${pageHeader(roleLabel(u.role), `${hello()}, ${u.name}`, t('dashSub'), `
          <button class="btn btn-secondary" data-page="documents">${lang === 'en' ? 'Documents' : 'Документы'}</button>
          <button class="btn btn-secondary" data-page="history">${lang === 'en' ? 'History' : 'История'}</button>
          <button class="btn btn-secondary" data-act="viewonly">${lang === 'en' ? 'Print stock' : 'Печать остатков'}</button>
          <button class="btn btn-primary" data-page="items">${lang === 'en' ? 'New item' : 'Новый товар'}</button>`)}
        <button type="button" class="dashboard-section-toggle"><span>${lang === 'en' ? 'Summary' : 'Сводка'}</span><strong>▾</strong></button>
        <div class="dashboard-grid dashboard-summary-grid">
          ${[
            [lang === 'en' ? 'Items' : 'Товары', state.items.length, lang === 'en' ? 'active SKUs' : 'активных позиций', 'items', false],
            [lang === 'en' ? 'Units' : 'Единицы', units, lang === 'en' ? 'on hand' : 'физический запас', 'locations', false],
            [lang === 'en' ? 'Occupancy' : 'Заполненность', `${occ}%`, `${used}/${cells.length}`, 'locations', false],
            [lang === 'en' ? 'Below min' : 'Ниже минимума', low.length, lang === 'en' ? 'to replenish' : 'для пополнения', 'replenishment', low.length > 0],
            [lang === 'en' ? 'Received' : 'Приход за месяц', mm.in, '', 'history', false],
            [lang === 'en' ? 'Issued' : 'Расход за месяц', mm.out, '', 'history', false],
            [lang === 'en' ? 'Projects' : 'Активные проекты', state.projects.length, '', 'projects', false],
            [lang === 'en' ? 'Overdue' : 'Просроченные', 0, '', 'projects', false],
            [lang === 'en' ? 'Expiry' : 'Срок годности', 0, '', 'quality', false],
            [lang === 'en' ? 'Moves' : 'Перемещения', 15, '', 'history', false],
            [lang === 'en' ? 'Draft docs' : 'Черновики документов', state.documents.filter((d) => d.status === 'draft').length, '', 'documents', false],
            [lang === 'en' ? 'POs' : 'Заказы поставщику', state.purchases.filter((p) => p.status !== 'done').length, '', 'purchases', false],
          ].map(([label, value, hint, go, warn]) => `
            <button type="button" class="stat-card stat-card-clickable${warn ? ' warning' : ''}" data-page="${go}">
              <div class="stat-label">${esc(label)}</div>
              <div class="stat-value">${esc(String(value))}</div>
              <div class="stat-hint">${esc(hint)}</div>
            </button>`).join('')}
        </div>
        <div class="dashboard-insights dashboard-ops-grid">
          <section class="card dashboard-chart">
            <div class="table-header">
              <div><div class="section-label">${lang === 'en' ? 'Warehouse dynamics' : 'Динамика склада'}</div>
              <h2>${lang === 'en' ? '14-day movement' : 'Движение за 14 дней'}</h2></div>
              <div class="chart-legend"><span class="legend-in">${lang === 'en' ? 'In' : 'Приход'}</span>
              <span class="legend-out">${lang === 'en' ? 'Out' : 'Расход'}</span></div>
            </div>
            <div class="movement-chart clickable-row" data-page="abc">
              ${state.trend.map((day) => `
                <div class="movement-day" title="${day.day}: +${day.received} / -${day.issued}">
                  <div class="movement-bars">
                    <span class="movement-bar received" style="height:${Math.max(3, day.received / maxTrend * 100)}%"></span>
                    <span class="movement-bar issued" style="height:${Math.max(3, day.issued / maxTrend * 100)}%"></span>
                  </div>
                  <small>${new Date(`${day.day}T00:00:00`).toLocaleDateString(lang === 'en' ? 'en-US' : 'ru-RU', { day: 'numeric', month: 'short' })}</small>
                </div>`).join('')}
            </div>
          </section>
          <section class="card dashboard-categories">
            <div class="table-header"><div><div class="section-label">${lang === 'en' ? 'Stock structure' : 'Структура остатков'}</div>
              <h2>${lang === 'en' ? 'By category' : 'По категориям'}</h2></div></div>
            ${state.categories.map((c, index) => {
    const total = state.items.filter((i) => i.category === c.name).reduce((s, i) => s + i.qty, 0);
    return `<div class="dashboard-category clickable-row" data-page="categories">
                <div><span class="category-rank">${String(index + 1).padStart(2, '0')}</span>
                <strong>${esc(c.name)}</strong><small>${c.count}</small></div>
                <div class="category-stock-bar"><span style="width:${Math.max(3, total / catMax * 100)}%"></span></div>
                <b>${total}</b></div>`;
  }).join('')}
          </section>
          <section class="card dashboard-ops-card">
            <div class="table-header">
              <div><div class="section-label">${lang === 'en' ? 'Stock control' : 'Контроль запасов'}</div>
              <h2>${lang === 'en' ? 'Below minimum' : 'Ниже минимума'} · ${low.length}</h2></div>
              <button type="button" class="btn btn-text" data-page="replenishment">${lang === 'en' ? 'Replenishment →' : 'Пополнение →'}</button>
            </div>
            <div class="dashboard-ops-body">
              ${low.length ? low.map((i) => `
                <div class="replenishment-row clickable-row" data-page="items">
                  <div><strong>${esc(i.name)}</strong><small>${esc(i.category)}</small></div>
                  <span>${i.qty}</span><b>мин. ${i.min}</b>
                  <span class="shortage-value">−${Math.max(0, i.min - i.qty)}</span>
                </div>`).join('') : `<div class="empty"><h3>${lang === 'en' ? 'No replenishment needed' : 'Пополнение не требуется'}</h3></div>`}
            </div>
          </section>
          <section class="card dashboard-ops-card">
            <div class="table-header">
              <div><div class="section-label">${lang === 'en' ? 'Journal' : 'Партии и журнал'}</div>
              <h2>${lang === 'en' ? 'Recent operations' : 'Последние операции'}</h2></div>
              <button type="button" class="btn btn-text" data-page="history">${lang === 'en' ? 'History →' : 'Журнал →'}</button>
            </div>
            <div class="dashboard-ops-body">
              ${state.moves.slice(0, 6).map((m) => `
                <div class="activity-row"><div><strong>${esc(m.item)}</strong><small>${esc(m.place)} · ${esc(m.at || '')}</small></div>
                ${typeBadge(m.type)}<b>${m.type === 'out' ? '−' : '+'}${m.qty}</b></div>`).join('')}
            </div>
          </section>
        </div>`;
      },

      items: () => {
        let list = state.items.slice();
        if (state.filter === 'low') list = low;
        if (state.filter === 'stock') list = list.filter((i) => i.qty > 0);
        const q = (state.itemSearch || '').trim().toLowerCase();
        if (q) {
          list = list.filter((i) => [i.barcode, i.sku, i.name, i.category, i.bin].some((v) => String(v || '').toLowerCase().includes(q)));
        }
        const matchCount = list.length;
        list = list.slice(0, 100);
        const matchNote = q
          ? (lang === 'en' ? `Matches: ${matchCount}${matchCount > 100 ? ' (showing 100)' : ''}` : `Совпадений: ${matchCount}${matchCount > 100 ? ' (показано 100)' : ''}`)
          : (lang === 'en' ? `${matchCount} items` : `${matchCount} позиций`);
        return `${pageHeader(lang === 'en' ? 'Items' : 'Товары', lang === 'en' ? 'Catalog' : 'Каталог', lang === 'en' ? 'Barcodes, stock and bin addresses' : 'Штрихкоды, остатки и адреса хранения', `
          <input class="search-input" id="itemSearch" value="${esc(state.itemSearch || '')}" placeholder="# · @ · =" />
          <button class="btn btn-primary" data-act="viewonly">${lang === 'en' ? 'New item' : 'Новый товар'}</button>`)}
          <div class="table-wrap">
            <div class="filter-row">
              ${[['all', lang === 'en' ? 'All' : 'Все'], ['low', lang === 'en' ? 'Low stock' : 'Низкий остаток'], ['stock', lang === 'en' ? 'In stock' : 'В наличии']].map(([id, label]) => `
                <button type="button" class="filter-chip${state.filter === id ? ' active' : ''}" data-filter="${id}">${esc(label)}</button>`).join('')}
              <span class="muted" style="margin-left:auto;font-size:12px">${esc(matchNote)}</span>
            </div>
            ${table(
    [lang === 'en' ? 'Barcode' : 'Штрихкод', 'SKU', lang === 'en' ? 'Name' : 'Название', lang === 'en' ? 'Category' : 'Категория', lang === 'en' ? 'Bin' : 'Ячейка', lang === 'en' ? 'Qty' : 'Остаток'],
    list.map((i) => `<tr>
              <td class="mono">${esc(i.barcode)}</td><td class="mono">${esc(i.sku)}</td><td class="strong">${esc(i.name)}</td>
              <td><span class="category-tag" style="background:${esc(i.color)}">${esc(i.category)}</span></td>
              <td class="mono">${esc(i.bin)}</td>
              <td><span class="qty-badge${i.qty < i.min ? ' low' : ''}">${i.qty}</span></td></tr>`).join(''),
  )}</div>`;
      },

      categories: () => `${pageHeader(lang === 'en' ? 'Categories' : 'Категории', lang === 'en' ? 'Categories' : 'Категории', lang === 'en' ? 'Nested groups with map colors' : 'Группы с цветами на карте')}
        <div class="tile-grid">${state.categories.map((c) => `
          <div class="tile-card"><span class="cat-dot" style="background:${esc(c.color)}"></span>
          <strong>${esc(c.name)}</strong><span class="muted">${c.count} SKU</span></div>`).join('')}</div>`,

      units: () => `${pageHeader(lang === 'en' ? 'Units' : 'Единицы', lang === 'en' ? 'Units of measure' : 'Единицы измерения', '')}
        ${table(['Code', lang === 'en' ? 'Name' : 'Название'], state.units.map((u) => `<tr><td class="mono">${esc(u.code)}</td><td>${esc(u.name)}</td></tr>`).join(''))}`,

      replenishment: () => `${pageHeader(lang === 'en' ? 'Replenishment' : 'Пополнение', lang === 'en' ? 'Replenishment' : 'Пополнение', lang === 'en' ? 'From min stock and usage' : 'По мин. остатку и расходу', `<button class="btn btn-primary" data-act="viewonly">CSV</button>`)}
        ${table(
    [lang === 'en' ? 'Item' : 'Товар', lang === 'en' ? 'Qty' : 'Остаток', 'Min', lang === 'en' ? 'Bin' : 'Ячейка', 'Need'],
    low.map((i) => `<tr><td class="strong">${esc(i.name)}</td><td><span class="qty-badge low">${i.qty}</span></td><td>${i.min}</td><td class="mono">${esc(i.bin)}</td><td class="shortage-value">${i.min - i.qty}</td></tr>`).join(''),
  )}`,

      purchases: () => `${pageHeader(lang === 'en' ? 'Purchasing' : 'Закупки', lang === 'en' ? 'Purchasing' : 'Закупки', '')}
        <div class="ops-tabs">
          <button class="ops-tab${state.purchTab === 'po' ? ' active' : ''}" data-purch="po">${lang === 'en' ? 'Orders' : 'Заказы'}</button>
          <button class="ops-tab${state.purchTab === 'sup' ? ' active' : ''}" data-purch="sup">${lang === 'en' ? 'Suppliers' : 'Поставщики'}</button>
        </div>
        ${state.purchTab === 'sup'
    ? table([lang === 'en' ? 'Supplier' : 'Поставщик', lang === 'en' ? 'Note' : 'Заметка'], state.suppliers.map((s) => `<tr><td class="strong">${esc(s.name)}</td><td>${esc(s.note)}</td></tr>`).join(''))
    : table(['ID', lang === 'en' ? 'Supplier' : 'Поставщик', lang === 'en' ? 'Status' : 'Статус', ''], state.purchases.map((p) => `<tr><td class="mono">${esc(p.id)}</td><td>${esc(p.supplier)}</td><td>${statusPill(p.status)}</td><td>${p.lines} · ${esc(p.total)}</td></tr>`).join(''))}`,

      locations: () => `${pageHeader(lang === 'en' ? 'Storage' : 'Хранение', lang === 'en' ? 'Warehouse map' : 'Карта склада', lang === 'en' ? 'Warehouses, bins, capacity' : 'Склады, ячейки, вместимость', `<button class="btn btn-primary" data-act="viewonly">${lang === 'en' ? 'New location' : 'Новый адрес'}</button>`)}
        <div class="location-grid">${state.locations.map((loc) => {
    const pct = fillPct(loc.code);
    const busy = pct >= 90 ? ' full' : pct >= 55 ? ' busy' : '';
    const typeLabel = loc.type === 'warehouse' ? (lang === 'en' ? 'Warehouse' : 'Склад') : loc.type === 'subwarehouse' ? (lang === 'en' ? 'Sub-location' : 'Подсклад') : (lang === 'en' ? 'Bin' : 'Ячейка');
    const contents = state.items.filter((i) => i.bin === loc.code && i.qty > 0);
    return `<div class="location-card location-level-${loc.type}${busy}">
            <div class="location-card-header"><div>
              <div class="section-label">${esc(loc.code)}</div><h2>${esc(loc.name)}</h2>
              <span class="location-type-pill location-type-${loc.type === 'subwarehouse' ? 'subwarehouse' : loc.type}">${esc(typeLabel)}</span>
            </div><button class="btn btn-text" data-act="viewonly">${esc(t('edit'))}</button></div>
            <div class="location-contents">${contents.length ? contents.map((i) => `<div class="location-item"><span>${esc(i.name)}</span><strong>${i.qty}</strong></div>`).join('') : `<small class="muted">${lang === 'en' ? 'empty' : 'пусто'}</small>`}</div>
            ${loc.capacity ? `<div class="location-fill"><div class="location-fill-bar" style="width:${pct}%"></div><span>${pct}%</span></div>` : ''}
          </div>`;
  }).join('')}</div>`,

      inventory: () => `${pageHeader(lang === 'en' ? 'Stocktake' : 'Ревизия', lang === 'en' ? 'Stocktake' : 'Ревизия', '')}
        <div class="ops-tabs">
          ${[['cell', lang === 'en' ? 'By bin' : 'По ячейкам'], ['free', lang === 'en' ? 'Free' : 'Свободная'], ['acts', lang === 'en' ? 'Acts' : 'Акты']].map(([id, label]) => `
            <button class="ops-tab${state.invChip === id ? ' active' : ''}" data-inv="${id}">${esc(label)}</button>`).join('')}
        </div>
        ${state.invChip === 'acts'
    ? `<div class="tile-grid">
            <button class="tile-card" data-act="viewonly"><strong>${lang === 'en' ? 'Write-off' : 'Списание'}</strong></button>
            <button class="tile-card" data-act="viewonly"><strong>${lang === 'en' ? 'Surplus' : 'Оприходование'}</strong></button>
            <button class="tile-card" data-act="viewonly"><strong>${lang === 'en' ? 'Regrade' : 'Пересорт'}</strong></button>
          </div>`
    : table(
      [lang === 'en' ? 'Bin' : 'Ячейка', lang === 'en' ? 'Item' : 'Товар', lang === 'en' ? 'Book' : 'Учёт', lang === 'en' ? 'Fact' : 'Факт'],
      state.inventory.map((r) => {
        const diff = r.fact - r.book;
        return `<tr><td class="mono">${esc(r.place)}</td><td>${esc(r.item)}</td><td>${r.book}</td>
            <td><span class="qty-badge${diff ? ' low' : ''}">${r.fact}${diff ? ` (${diff > 0 ? '+' : ''}${diff})` : ''}</span></td></tr>`;
      }).join(''),
    )}`,

      projects: () => `${pageHeader(lang === 'en' ? 'Projects' : 'Проекты', lang === 'en' ? 'Assembly projects' : 'Сборочные проекты', '')}
        <div class="stack">${state.projects.map((p) => `
          <div class="table-wrap">
            <div class="table-header"><div><h2>${esc(p.name)}</h2><div class="muted mono">${esc(p.id)} · ×${p.qty}</div></div>${statusPill(p.status)}</div>
            ${table(
    [lang === 'en' ? 'Item' : 'Товар', lang === 'en' ? 'Need' : 'Нужно', lang === 'en' ? 'Reserved' : 'Резерв'],
    p.bom.map((b) => `<tr><td>${esc(b.item)}</td><td>${b.need}</td><td><span class="qty-badge${b.reserved < b.need ? ' low' : ''}">${b.reserved}/${b.need}</span></td></tr>`).join(''),
  )}
            <div class="table-actions" style="padding:10px">
              <button class="btn btn-secondary" data-reserve="${esc(p.id)}">${lang === 'en' ? 'Reserve' : 'Резервировать'}</button>
              <button class="btn btn-primary" data-page="tsd">TSD</button>
            </div>
          </div>`).join('')}</div>`,

      reserves: () => `${pageHeader(lang === 'en' ? 'Reserves' : 'Резервы', lang === 'en' ? 'Reserves' : 'Резервы', '')}
        ${table(
    [lang === 'en' ? 'Item' : 'Товар', lang === 'en' ? 'Reserved' : 'Резерв', lang === 'en' ? 'Bin' : 'Ячейка', 'Avail'],
    state.items.filter((i) => i.reserved > 0).map((i) => `<tr><td class="strong">${esc(i.name)}</td><td>${i.reserved}</td><td class="mono">${esc(i.bin)}</td><td>${Math.max(0, i.qty - i.reserved)}</td></tr>`).join(''),
  )}`,

      tsd: () => `${pageHeader(lang === 'en' ? 'Data terminal' : 'Терминал сбора', lang === 'en' ? 'Pick tasks' : 'Задания на отбор', '')}
        <div class="tile-grid">${state.projects[0].bom.map((b, idx) => {
    const item = state.items.find((i) => i.name === b.item);
    return `<div class="tile-card">
            <div class="section-label">TASK ${idx + 1}</div><strong>${esc(b.item)}</strong>
            <div class="muted">${b.reserved}/${b.need} · ${esc(item?.bin || '')}</div>
            <button class="btn btn-secondary" data-code="${esc(item?.barcode || '')}">Scan</button>
          </div>`;
  }).join('')}</div>`,

      abc: () => `${pageHeader(lang === 'en' ? 'Analytics' : 'Аналитика', 'ABC / XYZ', '')}
        ${table(
    [lang === 'en' ? 'Item' : 'Товар', 'ABC', 'XYZ', lang === 'en' ? 'Qty' : 'Остаток', lang === 'en' ? 'Bin' : 'Ячейка'],
    state.items.map((i) => `<tr><td class="strong">${esc(i.name)}</td>
          <td><span class="type-badge ${i.abc === 'A' ? 'out' : i.abc === 'B' ? 'warn' : 'move'}">${esc(i.abc)}</span></td>
          <td>${esc(i.xyz)}</td><td>${i.qty}</td><td class="mono">${esc(i.bin)}</td></tr>`).join(''),
  )}`,

      templates: () => `${pageHeader(lang === 'en' ? 'Templates' : 'Шаблоны', lang === 'en' ? 'Item templates' : 'Шаблоны товаров', '')}
        ${table(
    [lang === 'en' ? 'Name' : 'Название', lang === 'en' ? 'Category' : 'Категория', 'SKU', 'Min'],
    state.templates.map((x) => `<tr><td class="strong">${esc(x.name)}</td><td>${esc(x.category)}</td><td class="mono">${esc(x.prefix)}</td><td>${x.min}</td></tr>`).join(''),
  )}`,

      quality: () => `${pageHeader(lang === 'en' ? 'Quality' : 'Качество', lang === 'en' ? 'Database health' : 'Состояние базы', '')}
        <div class="dashboard-grid">
          <div class="stat-card"><div class="stat-label">Score</div><div class="stat-value">92</div><div class="stat-hint">OK</div></div>
          <div class="stat-card warning"><div class="stat-label">${lang === 'en' ? 'Low stock' : 'Ниже минимума'}</div><div class="stat-value">${low.length}</div></div>
          <div class="stat-card"><div class="stat-label">${lang === 'en' ? 'Empty bins' : 'Пустые ячейки'}</div><div class="stat-value">${cells.length - used}</div></div>
        </div>
        <div class="info-card"><p>${lang === 'en' ? 'No critical integrity issues in demo data.' : 'Критических проблем целостности в демо-данных нет.'}</p></div>`,

      documents: () => `${pageHeader(lang === 'en' ? 'Documents' : 'Журнал документов', lang === 'en' ? 'Document journal' : 'Журнал документов', 'draft → posted → cancelled')}
        ${table(
    ['ID', lang === 'en' ? 'Type' : 'Тип', lang === 'en' ? 'Status' : 'Статус', 'Date', ''],
    state.documents.map((d) => `<tr><td class="mono">${esc(d.id)}</td><td>${esc(d.type)}</td><td>${statusPill(d.status)}</td><td>${esc(d.date)}</td>
          <td>${d.status === 'draft' ? `<button class="btn btn-text" data-post="${esc(d.id)}">${lang === 'en' ? 'Post' : 'Провести'}</button>` : ''}</td></tr>`).join(''),
  )}`,

      assets: () => `${pageHeader(lang === 'en' ? 'Assets' : 'Оборудование / ОС', lang === 'en' ? 'Fixed assets' : 'Основные средства', '')}
        ${table(
    [lang === 'en' ? 'Inv. no' : 'Инв. №', lang === 'en' ? 'Name' : 'Название', lang === 'en' ? 'Status' : 'Статус', lang === 'en' ? 'Place' : 'Место'],
    state.assets.map((a) => `<tr><td class="mono">${esc(a.inv)}</td><td class="strong">${esc(a.name)}</td><td>${statusPill(a.status)}</td><td>${esc(a.place)}</td></tr>`).join(''),
  )}`,

      edo: () => `${pageHeader('ЭДО', lang === 'en' ? 'Internal EDI' : 'Внутренний ЭДО', '')}
        ${table(
    ['ID', lang === 'en' ? 'Title' : 'Документ', lang === 'en' ? 'Status' : 'Статус'],
    state.edo.map((e) => `<tr><td class="mono">${esc(e.id)}</td><td>${esc(e.title)}</td><td>${statusPill(e.status)}</td></tr>`).join(''),
  )}`,

      employees: () => `${pageHeader(lang === 'en' ? 'Employees' : 'Сотрудники', lang === 'en' ? 'Employees' : 'Сотрудники', '')}
        ${table(
    [lang === 'en' ? 'Name' : 'Имя', 'Login', lang === 'en' ? 'Role' : 'Роль'],
    state.employees.map((e) => `<tr><td class="strong">${esc(e.name)}</td><td class="mono">${esc(e.login)}</td><td>${esc(e.role)}</td></tr>`).join(''),
  )}`,

      company: () => {
        const tabs = [
          ['counterparties', lang === 'en' ? 'Counterparties' : 'Контрагенты'],
          ['contracts', lang === 'en' ? 'Contracts' : 'Договоры'],
          ['orders', lang === 'en' ? 'Sales orders' : 'Заказы клиентов'],
        ];
        const list = state.company[state.companyTab] || [];
        return `${pageHeader(lang === 'en' ? 'Company' : 'Компания', lang === 'en' ? 'Company' : 'Компания', '')}
          <div class="ops-tabs">${tabs.map(([id, label]) => `
            <button class="ops-tab${state.companyTab === id ? ' active' : ''}" data-company="${id}">${esc(label)}</button>`).join('')}
            <button class="ops-tab" data-act="viewonly">CRM</button>
          </div>
          ${table([lang === 'en' ? 'Name' : 'Название'], list.map((x) => `<tr><td class="strong">${esc(x)}</td></tr>`).join(''))}`;
      },

      organizations: () => `${pageHeader(lang === 'en' ? 'Organization' : 'Организация', esc(state.org.name), state.org.code)}
        <div class="info-card">
          <div class="about-grid">
            <div><span>${lang === 'en' ? 'Name' : 'Название'}</span><strong>${esc(state.org.name)}</strong></div>
            <div><span>Code</span><strong>${esc(state.org.code)}</strong></div>
            <div><span>${lang === 'en' ? 'Users' : 'Пользователи'}</span><strong>${state.employees.length}</strong></div>
            <div><span>${lang === 'en' ? 'Role' : 'Роль'}</span><strong>${esc(roleLabel(currentRole()))}</strong></div>
          </div>
        </div>
        ${table(
    [lang === 'en' ? 'User' : 'Пользователь', 'Login', lang === 'en' ? 'Role' : 'Роль'],
    state.employees.map((e) => `<tr><td>${esc(e.name)}</td><td class="mono">${esc(e.login)}</td><td>${esc(e.role)}</td></tr>`).join(''),
  )}`,

      cabinet: () => `${pageHeader(lang === 'en' ? 'Cabinet' : 'Личный кабинет', currentUser().name, roleLabel(currentRole()))}
        <div class="about-grid about-modal">
          <div><span>Login</span><strong>${esc(currentUser().login)}</strong></div>
          <div><span>${lang === 'en' ? 'Organization' : 'Организация'}</span><strong>${esc(state.org.name)}</strong></div>
          <div><span>${lang === 'en' ? 'Edition' : 'Редакция'}</span><strong>Home [0.5]</strong></div>
          <div><span>${lang === 'en' ? 'Mode' : 'Режим'}</span><strong>Browser preview</strong></div>
        </div>`,

      audit: () => `${pageHeader(lang === 'en' ? 'Activity log' : 'Журнал действий', lang === 'en' ? 'Activity log' : 'Журнал действий', '')}
        ${table(
    [lang === 'en' ? 'Time' : 'Время', lang === 'en' ? 'User' : 'Кто', lang === 'en' ? 'Action' : 'Действие', lang === 'en' ? 'Detail' : 'Детали'],
    state.audit.map((a) => `<tr><td class="mono">${esc(a.at)}</td><td>${esc(a.who)}</td><td class="mono">${esc(a.action)}</td><td>${esc(a.detail)}</td></tr>`).join(''),
  )}`,

      history: () => `${pageHeader(lang === 'en' ? 'History' : 'История', lang === 'en' ? 'Movement journal' : 'Журнал движений', '')}
        ${table(
    [lang === 'en' ? 'Type' : 'Тип', lang === 'en' ? 'Item' : 'Товар', lang === 'en' ? 'Place' : 'Адрес', lang === 'en' ? 'Qty' : 'Кол-во', ''],
    state.moves.map((m) => `<tr><td>${typeBadge(m.type)}</td><td class="strong">${esc(m.item)}</td><td class="mono">${esc(m.place)}</td>
          <td><span class="qty-badge">${m.type === 'out' ? '−' : '+'}${m.qty}</span></td><td class="muted">${esc(m.at || '')}</td></tr>`).join(''),
  )}`,

      info: () => `${pageHeader(lang === 'en' ? 'Information' : 'Информация', lang === 'en' ? 'Information' : 'Информация', 'Home [0.5]')}
        <div class="info-card"><p>${esc(t('welcomeLead'))}</p>
          <div class="welcome-grid" style="margin-top:16px">
            ${[1, 3, 5, 6].map((n) => `<div class="welcome-feature"><strong>${esc(t(`feat${n}t`))}</strong><span>${esc(t(`feat${n}d`))}</span></div>`).join('')}
          </div>
        </div>`,

      settings: () => {
        const sections = lang === 'en'
          ? ['appearance', 'scanner', 'print', 'workspace', 'backup', 'integrations']
          : ['appearance', 'scanner', 'print', 'workspace', 'backup', 'integrations'];
        const labels = {
          appearance: lang === 'en' ? 'Appearance' : 'Внешний вид',
          scanner: lang === 'en' ? 'Scanner' : 'Сканер',
          print: lang === 'en' ? 'Print' : 'Печать',
          workspace: lang === 'en' ? 'Workspace' : 'Рабочее место',
          backup: lang === 'en' ? 'Backup' : 'Бэкап',
          integrations: 'MIAPI',
        };
        return `${pageHeader(lang === 'en' ? 'Settings' : 'Настройки', lang === 'en' ? 'Settings' : 'Настройки', '')}
          <div class="settings-layout">
            <div class="settings-nav card" style="padding:8px">
              ${sections.map((s) => `<button type="button" class="${state.settingsSection === s ? 'active' : ''}" data-settings="${s}">${esc(labels[s])}</button>`).join('')}
            </div>
            <div class="settings-pane">
              <h2 style="margin:0 0 8px;font-size:18px;font-weight:500">${esc(labels[state.settingsSection])}</h2>
              <p class="muted">${lang === 'en' ? 'Preview only — settings are not persisted to a real database.' : 'Только превью — настройки не пишутся в реальную БД.'}</p>
              <div class="form-grid" style="margin-top:12px">
                <label>${lang === 'en' ? 'Theme' : 'Тема'}
                  <select disabled><option>light</option><option>1c-light</option><option>dark</option></select>
                </label>
                <label>${lang === 'en' ? 'Language' : 'Язык'}
                  <select disabled><option>${lang}</option></select>
                </label>
              </div>
            </div>
          </div>`;
      },
    };

    return (pages[targetPage] || pages.dashboard)();
  }

  function scannerPanelHtml(visible) {
    const quickItems = state.items.slice(0, 8).map((i) => i.barcode);
    const quickBins = state.locations.filter((l) => l.type === 'cell').slice(0, 8).map((l) => l.code);
    return `<section class="card scanner-panel${visible ? '' : ' scanner-hidden'}">
      <div class="scanner-heading">
        <div><div class="section-label">${esc(t('scanLabel'))}</div><h2>${esc(t('scanMode'))}</h2></div>
        <span class="connection-state">${esc(t('scanPort'))}</span>
      </div>
      <div class="scanner-body">
        <input id="scanInput" class="search-input" style="max-width:220px" autocomplete="off" placeholder="460100 / A-01-01" />
        <div id="lastScan" class="last-scan empty">${esc(t('noScan'))}</div>
        <div id="scanHint" class="scanner-hint">${esc(t('scanHint'))}</div>
      </div>
      <div class="scanner-controls" id="quickCodes">
        ${[...quickItems, ...quickBins].map((c) => `<button type="button" class="quick-btn" data-code="${esc(c)}">${esc(c)}</button>`).join('')}
      </div>
    </section>`;
  }

  function titleBarHtml(showMenu = true) {
    return `<div class="title-bar">
      <div class="title-bar-title">${esc(t('appTitle'))}</div>
      ${showMenu ? `<div class="app-menu">
        <button type="button" class="app-menu-btn" data-act="viewonly">${esc(t('menuFile'))}</button>
        <button type="button" class="app-menu-btn" data-act="viewonly">${esc(t('menuEdit'))}</button>
        <button type="button" class="app-menu-btn" data-act="viewonly">${esc(t('menuInfo'))}</button>
        <button type="button" class="app-menu-btn" data-act="viewonly">${esc(t('menuTerm'))}</button>
        <button type="button" class="app-menu-btn" data-act="viewonly">${esc(t('menuHelp'))}</button>
      </div>` : ''}
      <div class="title-bar-drag"></div>
      <div class="account-menu">
        <button type="button" class="account-menu-trigger" data-act="exit">
          <span class="account-menu-fio">${esc(sessionTitle())}</span>
          <span class="account-menu-caret">▾</span>
        </button>
      </div>
    </div>`;
  }

  function renderOperatorApp() {
    document.getElementById('appRoot').innerHTML = `
      ${bannerHtml()}
      <div class="app-shell operator-app">
        ${titleBarHtml(false)}
        <main class="main">${renderOperatorView()}</main>
      </div>`;
  }

  function renderApp() {
    if (currentRole() === 'operator') { renderOperatorApp(); return; }
    const tabs = (state.openTabs.length ? state.openTabs : ['dashboard']).filter((id) => canOpen(id));
    const navList = NAV.filter((n) => navIds().includes(n.id));
    const isUserArm = currentRole() === 'user';
    const showScanner = SCANNER_PAGES.has(page) && currentRole() !== 'operator';
    const split = state.splitPage && canOpen(state.splitPage) ? state.splitPage : null;
    const splitLbl = (id) => {
      const n = NAV.find((x) => x.id === id);
      return n ? navLabel(n) : id;
    };
    document.getElementById('appRoot').innerHTML = `
      ${bannerHtml()}
      <div class="app-shell${isUserArm ? ' user-arm-app' : ''}">
        ${titleBarHtml(true)}
        <div class="workspace-chrome">
          <div class="workspace-tabs">
            ${tabs.map((id) => {
    const n = NAV.find((x) => x.id === id);
    return `<button type="button" class="workspace-tab${id === page ? ' active' : ''}${split === id ? ' is-split-side' : ''}" data-page="${id}">
                <span class="workspace-tab-title">${esc(n ? navLabel(n) : id)}</span>
                ${tabs.length > 1 ? `<span class="workspace-tab-close" data-close-tab="${id}">×</span>` : ''}
              </button>`;
  }).join('')}
          </div>
          <div class="workspace-tools">
            <div class="workspace-search"><input id="globalSearch" type="search" placeholder="${esc(t('searchPh'))}" /></div>
            <button type="button" class="btn btn-text" data-act="viewonly">${esc(t('recent'))}</button>
            <button type="button" class="btn btn-text" data-act="viewonly">${esc(t('favorites'))}</button>
            <button type="button" class="btn btn-secondary${split ? ' active' : ''}" data-act="toggle-split">${esc(split ? (lang === 'en' ? 'Split on' : 'Разделение') : t('split'))}</button>
            <button type="button" class="btn btn-secondary" data-act="viewonly">${esc(t('crm'))}</button>
          </div>
        </div>
        <div class="app">
          <aside class="sidebar is-open">
            <div class="logo"><div class="logo-mark">М</div>
              <div class="logo-text-wrap"><div class="logo-text">${esc(t('brand'))}</div></div>
            </div>
            <nav class="sidebar-nav">
              ${navList.map((n) => `<button type="button" class="nav-item${n.id === page || n.id === split ? ' active' : ''}" data-page="${n.id}">${esc(navLabel(n))}</button>`).join('')}
            </nav>
            <div class="sidebar-footer">${esc(t('sideFoot'))}<br />2026</div>
          </aside>
          <main class="main${split ? ' is-split' : ''}"${split ? ' style="--split-ratio:0.55"' : ''}>
            ${scannerPanelHtml(showScanner)}
            <div class="page-pane is-active${split ? ' is-split-primary' : ''}">${renderPage(page)}</div>
            ${split ? `<div class="main-split-resizer" data-act="viewonly" title="${esc(splitLbl(split))}"></div>
            <div class="page-pane is-active is-split-secondary">${renderPage(split)}</div>` : ''}
          </main>
        </div>
      </div>`;
  }

  function handleScan(raw) {
    const code = String(raw || '').trim().replace(/^#/, '');
    if (!code) return;
    const item = state.items.find((i) => String(i.barcode) === code || String(i.sku).toLowerCase() === code.toLowerCase());
    const bin = state.locations.find((l) => l.code.toLowerCase() === code.toLowerCase() && l.type === 'cell');
    const last = document.getElementById('lastScan');
    const hint = document.getElementById('scanHint');
    const role = currentRole();
    const mode = state.opMode || (role === 'admin' || role === 'user' ? 'pair' : null);

    if (role === 'operator' && !state.opMode) {
      toast(lang === 'en' ? 'Select an operation first' : 'Сначала выберите операцию');
      return;
    }

    const op = state.opMode || 'pair';

    if (op === 'lookup') {
      if (!item) { toast(t('toastBad')); return; }
      pushSessionLine('lookup', item.name, item.barcode, 1);
      toast(`${lang === 'en' ? 'Found' : 'Найден'}: ${item.name}`);
      if (last) { last.className = 'last-scan'; last.textContent = item.name; }
      save(); renderApp(); return;
    }
    if (op === 'receipt' && item) {
      item.qty += 1;
      state.moves.unshift({ type: 'in', item: item.name, place: item.bin, qty: 1, at: lang === 'en' ? 'now' : 'сейчас' });
      pushSessionLine('in', item.name, `+1 · ${item.bin}`, 1);
      toast(t('toastOk')(item.name, item.bin, item.qty));
      save(); renderApp(); return;
    }
    if (op === 'issue' && item) {
      if (item.qty < 1) { toast(t('toastBad')); return; }
      item.qty -= 1;
      state.moves.unshift({ type: 'out', item: item.name, place: item.bin, qty: 1, at: lang === 'en' ? 'now' : 'сейчас' });
      pushSessionLine('out', item.name, `−1 · ${item.bin}`, 1);
      toast(`${item.name} · ${item.qty}`);
      save(); renderApp(); return;
    }
    if (op === 'audit') {
      if (!item) { toast(t('toastBad')); return; }
      pushSessionLine('audit', item.name, lang === 'en' ? 'stocktake +1' : 'ревизия +1', 1);
      toast(lang === 'en' ? 'Counted (preview)' : 'Пересчитано (превью)');
      save(); renderApp(); return;
    }
    if (op === 'transfer') {
      if (!item && !bin) { toast(t('toastBad')); return; }
      pushSessionLine('move', item?.name || code, bin?.code || code, 1);
      toast(lang === 'en' ? 'Transfer draft (preview)' : 'Черновик перемещения (превью)');
      save(); renderApp(); return;
    }

    if (last) { last.className = 'last-scan'; last.textContent = code; }
    if (item) pendingItem = item;
    else if (bin) pendingBin = bin;
    else { if (hint) hint.textContent = t('toastBad'); toast(t('toastBad')); return; }
    if (pendingItem && pendingBin) {
      pendingItem.bin = pendingBin.code;
      pendingItem.qty += 1;
      state.moves.unshift({ type: 'pair', item: pendingItem.name, place: pendingBin.code, qty: 1, at: lang === 'en' ? 'now' : 'сейчас' });
      pushSessionLine('pair', pendingItem.name, `→ ${pendingBin.code}`, 1);
      toast(t('toastOk')(pendingItem.name, pendingBin.code, pendingItem.qty));
      if (hint) hint.textContent = t('scanHint');
      pendingItem = null; pendingBin = null;
      if (last) { last.className = 'last-scan empty'; last.textContent = t('noScan'); }
      save();
      renderApp();
      return;
    }
    if (hint) hint.textContent = t('toastWait');
  }

  function render() {
    document.documentElement.lang = lang;
    document.getElementById('welcome').classList.toggle('hidden', stage !== 'welcome');
    document.getElementById('launcherRoot').classList.toggle('hidden', stage !== 'launcher-orgs' && stage !== 'launcher-users');
    document.getElementById('appRoot').classList.toggle('hidden', stage !== 'app');
    if (stage === 'welcome') renderWelcome();
    else if (stage === 'launcher-orgs' || stage === 'launcher-users') renderLauncher();
    else if (currentRole() === 'operator') renderOperatorApp();
    else renderApp();
  }

  document.body.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]');
    if (act) {
      const a = act.getAttribute('data-act');
      if (a === 'lang' || a === 'lang-ru' || a === 'lang-en') {
        lang = a === 'lang-ru' ? 'ru' : a === 'lang-en' ? 'en' : (lang === 'ru' ? 'en' : 'ru');
        localStorage.setItem('metrika-lang', lang);
        render();
        return;
      }
      if (a === 'to-launcher') { setStage('launcher-orgs'); return; }
      if (a === 'to-orgs') { setStage('launcher-orgs'); return; }
      if (a === 'to-users') { setStage('launcher-users'); return; }
      if (a === 'enter-app') { enterApp(); return; }
      if (a === 'toggle-split') { toggleSplit(); return; }
      if (a === 'op-menu') { state.opMode = null; save(); renderOperatorApp(); return; }
      if (a === 'exit') { state.user = null; pendingItem = null; pendingBin = null; setStage('welcome'); return; }
      if (a === 'reset') {
        state = seed(); pendingItem = null; pendingBin = null; save(); toast(t('toastReset')); render(); return;
      }
      if (a === 'viewonly') { toast(t('toastView')); return; }
    }
    const userBtn = e.target.closest('[data-user]');
    if (userBtn) { selectedUser = Number(userBtn.getAttribute('data-user')); save(); renderLauncher(); return; }
    const opBtn = e.target.closest('[data-op]');
    if (opBtn) { state.opMode = opBtn.getAttribute('data-op'); save(); renderOperatorApp(); return; }
    const pageBtn = e.target.closest('[data-page]');
    if (pageBtn && !e.target.closest('[data-close-tab]')) { openPage(pageBtn.getAttribute('data-page')); return; }
    const closeTab = e.target.closest('[data-close-tab]');
    if (closeTab) {
      e.stopPropagation();
      const id = closeTab.getAttribute('data-close-tab');
      state.openTabs = state.openTabs.filter((x) => x !== id);
      if (!state.openTabs.length) state.openTabs = ['dashboard'];
      if (page === id) page = state.openTabs[state.openTabs.length - 1];
      save(); renderApp(); return;
    }
    const codeBtn = e.target.closest('[data-code]');
    if (codeBtn) { handleScan(codeBtn.getAttribute('data-code')); return; }
    const filterBtn = e.target.closest('[data-filter]');
    if (filterBtn) { state.filter = filterBtn.getAttribute('data-filter'); save(); openPage('items'); return; }
    const purchBtn = e.target.closest('[data-purch]');
    if (purchBtn) { state.purchTab = purchBtn.getAttribute('data-purch'); save(); openPage('purchases'); return; }
    const invBtn = e.target.closest('[data-inv]');
    if (invBtn) { state.invChip = invBtn.getAttribute('data-inv'); save(); openPage('inventory'); return; }
    const companyBtn = e.target.closest('[data-company]');
    if (companyBtn) { state.companyTab = companyBtn.getAttribute('data-company'); save(); openPage('company'); return; }
    const settingsBtn = e.target.closest('[data-settings]');
    if (settingsBtn) { state.settingsSection = settingsBtn.getAttribute('data-settings'); save(); openPage('settings'); return; }
    const postBtn = e.target.closest('[data-post]');
    if (postBtn) {
      const doc = state.documents.find((d) => d.id === postBtn.getAttribute('data-post'));
      if (doc) { doc.status = 'posted'; save(); toast(t('toastPosted')); openPage('documents'); }
      return;
    }
    const resBtn = e.target.closest('[data-reserve]');
    if (resBtn) {
      const proj = state.projects.find((p) => p.id === resBtn.getAttribute('data-reserve'));
      if (proj) {
        proj.bom.forEach((b) => { b.reserved = b.need; });
        proj.status = 'in_progress';
        save(); toast(t('toastReserve')); openPage('projects');
      }
    }
  });

  document.body.addEventListener('keydown', (e) => {
    if (e.target?.id === 'scanInput' && e.key === 'Enter') {
      handleScan(e.target.value); e.target.value = '';
    }
    if (e.target?.id === 'globalSearch' && e.key === 'Enter') {
      state.itemSearch = e.target.value || '';
      save();
      openPage('items');
    }
    if (e.target?.id === 'loginPassword' && e.key === 'Enter') enterApp();
  });

  document.body.addEventListener('input', (e) => {
    if (e.target?.id === 'itemSearch') {
      state.itemSearch = e.target.value;
      save();
      if (page === 'items' || state.splitPage === 'items') renderApp();
    }
  });

  render();
})();
