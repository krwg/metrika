(() => {
  const STORAGE_KEY = 'metrika-ui-demo-v2';

  const I18N = {
    ru: {
      bannerTitle: 'Браузерное демо Метрики',
      bannerHint: ' · интерфейс как в приложении · данные только в этой вкладке',
      reset: 'Сбросить данные',
      download: 'Скачать для Windows',
      appTitle: 'Метрика [0.5 Домашняя]',
      appShort: 'Метрика',
      menuFile: 'Файл',
      menuView: 'Вид',
      sessionLabel: 'Демо · Мастерская',
      globalSearch: 'Поиск товаров и разделов…',
      sidebarFoot: 'Локальный склад · демо',
      scannerLabel: 'Сканер',
      pairMode: 'Товар + ячейка (+1 шт.)',
      scannerDemoPort: 'DEMO · без COM',
      lastScanEmpty: 'нет скана',
      scanHint: 'Отсканируйте товар и ячейку в любом порядке',
      roleUser: 'Пользователь',
      dashSub: 'Операционная панель · статистика, остатки и движение',
      btnHistory: 'История',
      btnNewItem: 'Новый товар',
      recentMoves: 'Последние движения',
      lowStock: 'Ниже минимума',
      colType: 'Тип',
      colItem: 'Товар',
      colPlace: 'Адрес',
      colQty: 'Кол-во',
      colMin: 'Мин.',
      colBarcode: 'Штрихкод',
      colName: 'Название',
      colCategory: 'Категория',
      navOverview: 'Обзор',
      navItems: 'Товары',
      navLocations: 'Хранение',
      navHistory: 'История',
      itemsTitle: 'Каталог',
      itemsSub: 'Штрихкоды, остатки и адреса хранения',
      itemSearchPh: '# штрихкод · @ название · = ячейка',
      filterAll: 'Все',
      filterLow: 'Низкий остаток',
      filterStock: 'В наличии',
      locSection: 'Адресное хранение',
      locTitle: 'Карта склада',
      locSub: 'Склады, подсклады, ячейки и вместимость',
      btnNewLoc: 'Новый адрес',
      locSearchPh: 'Найти склад, подсклад или ячейку',
      histTitle: 'Журнал движений',
      histSub: 'Приход, расход и размещение из демо-сканера',
      greet: (h, n) => `${h}, ${n}`,
      morning: 'Доброе утро',
      day: 'Добрый день',
      evening: 'Добрый вечер',
      night: 'Доброй ночи',
      demoName: 'Демо',
      kpiItems: 'Товары',
      kpiUnits: 'Единицы',
      kpiFill: 'Заполненность',
      kpiLow: 'Ниже минимума',
      kpiIn: 'Приход',
      kpiOut: 'Расход',
      kpiProjects: 'Проекты',
      kpiMoves: 'Перемещения',
      hintItems: 'активных позиций каталога',
      hintUnits: 'физический запас по складу',
      hintFill: 'ячеек с остатком',
      hintLow: 'позиций для пополнения',
      typeIn: 'Приход',
      typeOut: 'Расход',
      typeMove: 'Перемещение',
      typePair: 'Размещение',
      zoneAll: 'Все зоны',
      addresses: (n) => `${n} адресов`,
      warehouse: 'Склад',
      subwarehouse: 'Подсклад',
      cell: 'Ячейка',
      emptyLoc: 'пусто',
      toastPair: (item, bin, qty) => `${item} → ${bin} · остаток ${qty}`,
      toastUnknown: 'Неизвестный код',
      toastNeedSecond: 'Ждём второй код…',
      toastReset: 'Демо-данные сброшены',
      toastDemoOnly: 'В демо только просмотр этого действия',
    },
    en: {
      bannerTitle: 'Metrika browser demo',
      bannerHint: ' · same UI as the desktop app · data stays in this tab',
      reset: 'Reset data',
      download: 'Download for Windows',
      appTitle: 'Metrika [0.5 Home]',
      appShort: 'Metrika',
      menuFile: 'File',
      menuView: 'View',
      sessionLabel: 'Demo · Workshop',
      globalSearch: 'Search items and pages…',
      sidebarFoot: 'Local warehouse · demo',
      scannerLabel: 'Scanner',
      pairMode: 'Item + bin (+1 pcs)',
      scannerDemoPort: 'DEMO · no COM',
      lastScanEmpty: 'no scan',
      scanHint: 'Scan item and bin in any order',
      roleUser: 'User',
      dashSub: 'Operations panel · stats, stock and movement',
      btnHistory: 'History',
      btnNewItem: 'New item',
      recentMoves: 'Recent moves',
      lowStock: 'Below minimum',
      colType: 'Type',
      colItem: 'Item',
      colPlace: 'Location',
      colQty: 'Qty',
      colMin: 'Min',
      colBarcode: 'Barcode',
      colName: 'Name',
      colCategory: 'Category',
      navOverview: 'Overview',
      navItems: 'Items',
      navLocations: 'Storage',
      navHistory: 'History',
      itemsTitle: 'Catalog',
      itemsSub: 'Barcodes, stock and bin addresses',
      itemSearchPh: '# barcode · @ name · = bin',
      filterAll: 'All',
      filterLow: 'Low stock',
      filterStock: 'In stock',
      locSection: 'Address storage',
      locTitle: 'Warehouse map',
      locSub: 'Warehouses, sub-locations, bins and capacity',
      btnNewLoc: 'New location',
      locSearchPh: 'Find warehouse, sub-location or bin',
      histTitle: 'Movement journal',
      histSub: 'Receives, issues and scan-to-place from the demo scanner',
      greet: (h, n) => `${h}, ${n}`,
      morning: 'Good morning',
      day: 'Good afternoon',
      evening: 'Good evening',
      night: 'Good night',
      demoName: 'Demo',
      kpiItems: 'Items',
      kpiUnits: 'Units',
      kpiFill: 'Occupancy',
      kpiLow: 'Below minimum',
      kpiIn: 'Received',
      kpiOut: 'Issued',
      kpiProjects: 'Projects',
      kpiMoves: 'Transfers',
      hintItems: 'active catalog SKUs',
      hintUnits: 'physical stock on hand',
      hintFill: 'bins with stock',
      hintLow: 'items to replenish',
      typeIn: 'In',
      typeOut: 'Out',
      typeMove: 'Move',
      typePair: 'Place',
      zoneAll: 'All zones',
      addresses: (n) => `${n} locations`,
      warehouse: 'Warehouse',
      subwarehouse: 'Sub-location',
      cell: 'Bin',
      emptyLoc: 'empty',
      toastPair: (item, bin, qty) => `${item} → ${bin} · qty ${qty}`,
      toastUnknown: 'Unknown code',
      toastNeedSecond: 'Waiting for the second code…',
      toastReset: 'Demo data reset',
      toastDemoOnly: 'This action is view-only in the demo',
    },
  };

  const NAV = [
    { id: 'dashboard', labelKey: 'navOverview' },
    { id: 'items', labelKey: 'navItems' },
    { id: 'locations', labelKey: 'navLocations' },
    { id: 'history', labelKey: 'navHistory' },
  ];

  function seed() {
    return {
      items: [
        { barcode: '460123', name: 'ESP32 DevKit', category: 'Контроллеры', color: '#1a73e8', bin: 'A-01-01', qty: 12, min: 4 },
        { barcode: '460188', name: 'Dupont jumper', category: 'Кабели', color: '#188038', bin: 'B-02-03', qty: 80, min: 40 },
        { barcode: '460210', name: 'PCA9685', category: 'Контроллеры', color: '#1a73e8', bin: 'A-01-02', qty: 8, min: 3 },
        { barcode: '460301', name: 'MG90S servo', category: 'Механика', color: '#b06000', bin: 'B-02-01', qty: 2, min: 6 },
        { barcode: '460415', name: 'USB-C cable', category: 'Кабели', color: '#188038', bin: 'A-01-03', qty: 18, min: 5 },
        { barcode: '460520', name: 'OLED 0.96"', category: 'Дисплеи', color: '#9334e6', bin: 'A-01-02', qty: 5, min: 2 },
      ],
      locations: [
        { code: 'WH-1', name: 'Мастерская', type: 'warehouse', capacity: 0, parent: null },
        { code: 'ZONE-A', name: 'Стеллаж A', type: 'subwarehouse', capacity: 0, parent: 'WH-1' },
        { code: 'A-01-01', name: 'A-01-01', type: 'cell', capacity: 40, parent: 'ZONE-A' },
        { code: 'A-01-02', name: 'A-01-02', type: 'cell', capacity: 40, parent: 'ZONE-A' },
        { code: 'A-01-03', name: 'A-01-03', type: 'cell', capacity: 30, parent: 'ZONE-A' },
        { code: 'ZONE-B', name: 'Коробки B', type: 'subwarehouse', capacity: 0, parent: 'WH-1' },
        { code: 'B-02-01', name: 'B-02-01', type: 'cell', capacity: 50, parent: 'ZONE-B' },
        { code: 'B-02-02', name: 'B-02-02', type: 'cell', capacity: 50, parent: 'ZONE-B' },
        { code: 'B-02-03', name: 'B-02-03', type: 'cell', capacity: 50, parent: 'ZONE-B' },
      ],
      moves: [
        { type: 'pair', item: 'ESP32 DevKit', place: 'A-01-01', qty: 1 },
        { type: 'out', item: 'Dupont jumper', place: 'B-02-03', qty: 20 },
        { type: 'in', item: 'PCA9685', place: 'A-01-02', qty: 4 },
      ],
    };
  }

  let lang = localStorage.getItem('metrika-demo-lang');
  if (lang !== 'ru' && lang !== 'en') {
    lang = (navigator.language || '').toLowerCase().startsWith('en') ? 'en' : 'ru';
  }

  let state = load();
  let page = 'dashboard';
  let itemFilter = 'all';
  let pendingItem = null;
  let pendingBin = null;
  let sidebarOpen = false;

  function t(key, ...args) {
    const v = I18N[lang][key];
    return typeof v === 'function' ? v(...args) : v;
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return seed();
      const parsed = JSON.parse(raw);
      if (!parsed.items || !parsed.locations) return seed();
      return parsed;
    } catch {
      return seed();
    }
  }

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function toast(message) {
    const el = document.getElementById('toast');
    el.hidden = false;
    el.textContent = message;
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => { el.hidden = true; }, 2600);
  }

  function applyI18n() {
    document.documentElement.lang = lang;
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      el.textContent = t(el.getAttribute('data-i18n'));
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      el.setAttribute('placeholder', t(el.getAttribute('data-i18n-placeholder')));
    });
    document.getElementById('langBtn').textContent = lang === 'ru' ? 'EN' : 'RU';
    const hour = new Date().getHours();
    const hello = hour >= 5 && hour < 12 ? t('morning')
      : hour >= 12 && hour < 17 ? t('day')
        : hour >= 17 && hour < 23 ? t('evening')
          : t('night');
    document.getElementById('greeting').textContent = t('greet', hello, t('demoName'));
  }

  function openPage(next) {
    page = next;
    document.querySelectorAll('.page').forEach((el) => el.classList.add('hidden'));
    document.getElementById(`page-${next}`).classList.remove('hidden');
    document.querySelectorAll('#sidebarNav .nav-item').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.page === next);
    });
    document.querySelectorAll('#workspaceTabs .workspace-tab').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.page === next);
    });
    setSidebar(false);
    renderAll();
  }

  function setSidebar(open) {
    sidebarOpen = open;
    const sidebar = document.getElementById('sidebar');
    const backdrop = document.getElementById('sidebarBackdrop');
    sidebar.classList.toggle('is-open', open);
    backdrop.hidden = !open;
  }

  function renderNav() {
    document.getElementById('sidebarNav').innerHTML = NAV.map((item) => `
      <button type="button" class="nav-item${page === item.id ? ' active' : ''}" data-page="${item.id}">
        <span>${escapeHtml(t(item.labelKey))}</span>
      </button>
    `).join('');

    document.getElementById('workspaceTabs').innerHTML = NAV.map((item) => `
      <button type="button" class="workspace-tab${page === item.id ? ' active' : ''}" data-page="${item.id}">
        <span class="workspace-tab-title">${escapeHtml(t(item.labelKey))}</span>
      </button>
    `).join('');
  }

  function cellFill(code) {
    const loc = state.locations.find((l) => l.code === code);
    if (!loc || !loc.capacity) return 0;
    const qty = state.items.filter((i) => i.bin === code).reduce((s, i) => s + i.qty, 0);
    return Math.min(100, Math.round((qty / loc.capacity) * 100));
  }

  function renderKpis() {
    const units = state.items.reduce((s, i) => s + i.qty, 0);
    const low = state.items.filter((i) => i.qty < i.min).length;
    const cells = state.locations.filter((l) => l.type === 'cell');
    const occupied = cells.filter((c) => state.items.some((i) => i.bin === c.code && i.qty > 0)).length;
    const fill = cells.length ? Math.round((occupied / cells.length) * 100) : 0;
    const cards = [
      { label: t('kpiItems'), value: state.items.length, hint: t('hintItems'), page: 'items' },
      { label: t('kpiUnits'), value: units, hint: t('hintUnits'), page: 'locations' },
      { label: t('kpiFill'), value: `${fill}%`, hint: t('hintFill'), page: 'locations' },
      { label: t('kpiLow'), value: low, hint: t('hintLow'), warning: low > 0, page: 'items' },
      { label: t('kpiIn'), value: state.moves.filter((m) => m.type === 'in' || m.type === 'pair').reduce((s, m) => s + m.qty, 0), hint: '', page: 'history' },
      { label: t('kpiOut'), value: state.moves.filter((m) => m.type === 'out').reduce((s, m) => s + m.qty, 0), hint: '', page: 'history' },
      { label: t('kpiProjects'), value: 1, hint: '', page: 'dashboard' },
      { label: t('kpiMoves'), value: state.moves.filter((m) => m.type === 'move' || m.type === 'pair').length, hint: '', page: 'history' },
    ];
    document.getElementById('kpiGrid').innerHTML = cards.map((c) => `
      <button type="button" class="stat-card${c.warning ? ' warning' : ''}" data-open="${c.page}">
        <div class="stat-label">${escapeHtml(c.label)}</div>
        <div class="stat-value">${escapeHtml(String(c.value))}</div>
        <div class="stat-hint">${escapeHtml(c.hint || '')}</div>
      </button>
    `).join('');
  }

  function typeBadge(type) {
    const map = { in: ['in', 'typeIn'], out: ['out', 'typeOut'], move: ['move', 'typeMove'], pair: ['move', 'typePair'] };
    const [cls, key] = map[type] || ['move', 'typePair'];
    return `<span class="type-badge ${cls}">${escapeHtml(t(key))}</span>`;
  }

  function renderMoves() {
    const rows = state.moves.map((m) => `
      <tr>
        <td>${typeBadge(m.type)}</td>
        <td class="strong">${escapeHtml(m.item)}</td>
        <td class="mono">${escapeHtml(m.place)}</td>
        <td><span class="qty-badge">${m.type === 'out' ? '−' : '+'}${m.qty}</span></td>
      </tr>
    `).join('');
    document.getElementById('movesBody').innerHTML = rows;
    document.getElementById('historyBody').innerHTML = rows;
  }

  function renderLow() {
    const low = state.items.filter((i) => i.qty < i.min);
    document.getElementById('lowBody').innerHTML = low.map((i) => `
      <tr>
        <td class="strong">${escapeHtml(i.name)}</td>
        <td><span class="qty-badge low">${i.qty}</span></td>
        <td>${i.min}</td>
      </tr>
    `).join('') || `<tr><td colspan="3" class="muted">—</td></tr>`;
  }

  function filteredItems() {
    const q = (document.getElementById('itemSearch').value || '').trim();
    let list = state.items.slice();
    if (itemFilter === 'low') list = list.filter((i) => i.qty < i.min);
    if (itemFilter === 'stock') list = list.filter((i) => i.qty > 0);
    if (q.startsWith('#')) list = list.filter((i) => i.barcode.includes(q.slice(1)));
    else if (q.startsWith('@')) list = list.filter((i) => i.name.toLowerCase().includes(q.slice(1).toLowerCase()));
    else if (q.startsWith('=')) list = list.filter((i) => i.bin.toLowerCase().includes(q.slice(1).toLowerCase()));
    else if (q) {
      const n = q.toLowerCase();
      list = list.filter((i) => i.name.toLowerCase().includes(n) || i.barcode.includes(n) || i.bin.toLowerCase().includes(n));
    }
    return list;
  }

  function renderItems() {
    document.getElementById('itemsBody').innerHTML = filteredItems().map((i) => `
      <tr class="clickable-row">
        <td class="mono item-barcode-cell">${escapeHtml(i.barcode)}</td>
        <td class="strong item-name-cell"><span>${escapeHtml(i.name)}</span></td>
        <td><span class="category-tag" style="background:${escapeHtml(i.color)}">${escapeHtml(i.category)}</span></td>
        <td class="mono">${escapeHtml(i.bin)}</td>
        <td><span class="qty-badge${i.qty < i.min ? ' low' : ''}">${i.qty}</span></td>
      </tr>
    `).join('');
  }

  function renderLocations() {
    const q = (document.getElementById('locSearch').value || '').trim().toLowerCase();
    const list = state.locations.filter((l) => !q || `${l.code} ${l.name}`.toLowerCase().includes(q));
    document.getElementById('locCount').textContent = t('addresses', list.length);
    document.getElementById('zoneSummary').innerHTML = `
      <button type="button" class="zone-chip is-active"><strong>${escapeHtml(t('zoneAll'))}</strong><span>${escapeHtml(t('addresses', state.locations.length))}</span></button>
    `;
    document.getElementById('locationGrid').innerHTML = list.map((loc) => {
      const fill = cellFill(loc.code);
      const contents = state.items.filter((i) => i.bin === loc.code && i.qty > 0);
      const level = loc.type === 'warehouse' ? 'warehouse' : loc.type === 'subwarehouse' ? 'subwarehouse' : 'cell';
      const busy = fill >= 90 ? ' full' : fill >= 55 ? ' busy' : '';
      const typeKey = loc.type === 'warehouse' ? 'warehouse' : loc.type === 'subwarehouse' ? 'subwarehouse' : 'cell';
      return `
        <div class="location-card location-level-${level}${busy}">
          <div class="location-card-header">
            <div>
              <div class="section-label">${escapeHtml(loc.code)}</div>
              <h2>${escapeHtml(loc.name)}</h2>
              <span class="location-type-pill location-type-${level}">${escapeHtml(t(typeKey))}</span>
            </div>
            <div class="location-actions">
              <button type="button" class="btn btn-text" data-demo-only>${lang === 'ru' ? 'Изменить' : 'Edit'}</button>
            </div>
          </div>
          <div class="location-contents">
            ${contents.length
    ? contents.map((i) => `<div class="location-item"><span>${escapeHtml(i.name)}</span><strong>${i.qty}</strong></div>`).join('')
    : `<small>${escapeHtml(t('emptyLoc'))}</small>`}
          </div>
          ${loc.capacity ? `<div class="location-fill"><div class="location-fill-bar" style="width:${fill}%"></div><span>${fill}%</span></div>` : ''}
        </div>
      `;
    }).join('');
  }

  function renderQuickCodes() {
    const codes = [
      ...state.items.map((i) => i.barcode),
      ...state.locations.filter((l) => l.type === 'cell').map((l) => l.code),
    ];
    document.getElementById('quickCodes').innerHTML = codes.map((c) => `
      <button type="button" class="btn btn-secondary" style="min-height:30px;padding:0 10px;font-family:Consolas,monospace;font-size:12px" data-code="${escapeHtml(c)}">${escapeHtml(c)}</button>
    `).join('');
  }

  function renderScanChips() {
    const last = document.getElementById('lastScan');
    if (pendingItem || pendingBin) {
      const parts = [];
      if (pendingItem) parts.push(`#${pendingItem.barcode}`);
      if (pendingBin) parts.push(pendingBin.code);
      last.className = 'last-scan';
      last.textContent = parts.join(' + ');
    } else if (!last.dataset.locked) {
      last.className = 'last-scan empty';
      last.textContent = t('lastScanEmpty');
    }
  }

  function handleScan(raw) {
    const code = String(raw || '').trim().replace(/^#/, '');
    if (!code) return;
    const item = state.items.find((i) => i.barcode === code);
    const bin = state.locations.find((l) => l.code.toLowerCase() === code.toLowerCase() && l.type === 'cell');
    const last = document.getElementById('lastScan');
    last.dataset.locked = '1';
    last.className = 'last-scan';
    last.textContent = code;

    if (item) pendingItem = item;
    else if (bin) pendingBin = bin;
    else {
      document.getElementById('scanHint').textContent = t('toastUnknown');
      toast(t('toastUnknown'));
      renderScanChips();
      return;
    }

    if (pendingItem && pendingBin) {
      pendingItem.bin = pendingBin.code;
      pendingItem.qty += 1;
      state.moves.unshift({ type: 'pair', item: pendingItem.name, place: pendingBin.code, qty: 1 });
      toast(t('toastPair', pendingItem.name, pendingBin.code, pendingItem.qty));
      document.getElementById('scanHint').textContent = t('scanHint');
      pendingItem = null;
      pendingBin = null;
      delete last.dataset.locked;
      save();
      renderAll();
      return;
    }

    document.getElementById('scanHint').textContent = t('toastNeedSecond');
    renderScanChips();
  }

  function renderAll() {
    applyI18n();
    renderNav();
    renderKpis();
    renderMoves();
    renderLow();
    renderItems();
    renderLocations();
    renderQuickCodes();
    renderScanChips();
  }

  document.getElementById('sidebarNav').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-page]');
    if (btn) openPage(btn.dataset.page);
  });
  document.getElementById('workspaceTabs').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-page]');
    if (btn) openPage(btn.dataset.page);
  });
  document.getElementById('main').addEventListener('click', (e) => {
    const open = e.target.closest('[data-open]');
    if (open) openPage(open.dataset.page);
    if (e.target.closest('[data-demo-only]')) toast(t('toastDemoOnly'));
  });
  document.getElementById('langBtn').addEventListener('click', () => {
    lang = lang === 'ru' ? 'en' : 'ru';
    localStorage.setItem('metrika-demo-lang', lang);
    renderAll();
    document.getElementById('scanHint').textContent = t('scanHint');
  });
  document.getElementById('resetBtn').addEventListener('click', () => {
    state = seed();
    pendingItem = null;
    pendingBin = null;
    save();
    renderAll();
    document.getElementById('scanHint').textContent = t('scanHint');
    toast(t('toastReset'));
  });
  document.getElementById('navToggle').addEventListener('click', () => setSidebar(!sidebarOpen));
  document.getElementById('sidebarBackdrop').addEventListener('click', () => setSidebar(false));
  document.getElementById('itemSearch').addEventListener('input', renderItems);
  document.getElementById('locSearch').addEventListener('input', renderLocations);
  document.getElementById('itemFilters').addEventListener('click', (e) => {
    const chip = e.target.closest('[data-filter]');
    if (!chip) return;
    itemFilter = chip.dataset.filter;
    document.querySelectorAll('#itemFilters .filter-chip').forEach((c) => c.classList.toggle('active', c === chip));
    renderItems();
  });
  document.getElementById('quickCodes').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-code]');
    if (!btn) return;
    handleScan(btn.dataset.code);
  });
  const scanInput = document.getElementById('scanInput');
  scanInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      handleScan(scanInput.value);
      scanInput.value = '';
    }
  });
  document.getElementById('globalSearch').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const q = e.target.value.trim();
    if (!q) return;
    openPage('items');
    document.getElementById('itemSearch').value = q;
    renderItems();
  });

  openPage('dashboard');
})();
