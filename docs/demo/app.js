(() => {
  const KEY = 'metrika-demo-v5';
  const DOWNLOAD = 'https://github.com/krwg/metrika/releases/download/v0.5.0/Metrika-Home-Setup-0.5.0.exe';

  const NAV = [
    { id: 'dashboard', ru: 'Обзор', en: 'Overview', tab: true },
    { id: 'items', ru: 'Товары', en: 'Items', tab: true },
    { id: 'categories', ru: 'Категории', en: 'Categories' },
    { id: 'units', ru: 'Единицы', en: 'Units' },
    { id: 'replenishment', ru: 'Пополнение', en: 'Replenishment' },
    { id: 'purchases', ru: 'Закупки', en: 'Purchases', tab: true },
    { id: 'locations', ru: 'Хранение', en: 'Storage', tab: true },
    { id: 'inventory', ru: 'Ревизия', en: 'Stocktake', tab: true },
    { id: 'projects', ru: 'Проекты', en: 'Projects', tab: true },
    { id: 'reserves', ru: 'Резервы', en: 'Reserves' },
    { id: 'tsd', ru: 'Терминал сбора', en: 'Data terminal' },
    { id: 'abc', ru: 'Аналитика', en: 'Analytics' },
    { id: 'documents', ru: 'Журнал документов', en: 'Documents' },
    { id: 'history', ru: 'История', en: 'History', tab: true },
    { id: 'info', ru: 'Информация', en: 'Information' },
    { id: 'settings', ru: 'Настройки', en: 'Settings' },
  ];

  const TEXT = {
    ru: {
      welcomeSub: 'Локальный складской учёт для Windows',
      welcomeLead: 'Каталог, штрихкоды, адресные ячейки, сканер, ревизии, сборка по BOM, закупки и аналитика — в одной локальной базе на вашем ПК. Без облачного аккаунта.',
      feat1t: 'Каталог и штрихкоды', feat1d: 'Несколько кодов на позицию, категории, мин./макс.',
      feat2t: 'Адресное хранение', feat2d: 'Склад → подсклад → ячейка с вместимостью',
      feat3t: 'Сканер', feat3d: 'Товар + ячейка (+1) в любом порядке',
      feat4t: 'Ревизия и акты', feat4d: 'Обход ячеек, списание, оприходование',
      feat5t: 'Сборка и резервы', feat5d: 'BOM, резерв по ячейкам, комплектация',
      feat6t: 'Закупки и аналитика', feat6d: 'Поставщики, пополнение, ABC / XYZ',
      welcomeNote: 'Браузерное превью показывает интерфейс и основные механики. Полный продукт — Windows-приложение.',
      download: 'Скачать',
      enterAdmin: 'Администратор',
      bannerTitle: 'Metrika Home — превью интерфейса',
      bannerHint: ' · данные только в этой вкладке',
      reset: 'Сбросить',
      exit: 'Выйти',
      appTitle: 'Metrika Home [0.5]',
      brand: 'Metrika Home',
      menuFile: 'Файл',
      menuEdit: 'Изменить',
      menuInfo: 'Информация',
      menuHelp: 'Помощь',
      session: 'Администратор · Мастерская',
      searchPh: 'Поиск: #штрихкод · @название · =ячейка',
      sideFoot: 'Складской учёт · 2026',
      scanLabel: 'Сканер',
      scanMode: 'Товар + ячейка (+1 шт.)',
      scanPort: 'BROWSER · без COM',
      noScan: 'нет скана',
      scanHint: 'Отсканируйте товар и ячейку в любом порядке',
      role: 'Администратор',
      name: 'Администратор',
      dashSub: 'Операционная панель · статистика, остатки и движение',
      btnHistory: 'История',
      btnNew: 'Новый товар',
      recent: 'Последние движения',
      lowTitle: 'Ниже минимума',
      morning: 'Доброе утро',
      day: 'Добрый день',
      evening: 'Добрый вечер',
      night: 'Доброй ночи',
      kpiItems: 'Товары', kpiUnits: 'Единицы', kpiFill: 'Заполненность', kpiLow: 'Ниже минимума',
      kpiIn: 'Приход', kpiOut: 'Расход', kpiProjects: 'Проекты', kpiMoves: 'Движения',
      hItems: 'активных позиций каталога', hUnits: 'физический запас по складу',
      hFill: 'ячеек с остатком', hLow: 'позиций для пополнения',
      itemsTitle: 'Каталог', itemsSub: 'Штрихкоды, остатки и адреса хранения',
      itemPh: '# штрихкод · @ название · = ячейка',
      fAll: 'Все', fLow: 'Низкий остаток', fStock: 'В наличии',
      locLabel: 'Адресное хранение', locTitle: 'Карта склада',
      locSub: 'Склады, подсклады, ячейки и вместимость',
      btnLoc: 'Новый адрес', locPh: 'Найти склад, подсклад или ячейку',
      histTitle: 'Журнал движений', histSub: 'Приход, расход и размещение сканером',
      catTitle: 'Категории', catSub: 'Вложенные группы с цветами на карте и в каталоге',
      unitsTitle: 'Единицы измерения', unitsSub: 'Справочник единиц для каталога',
      replTitle: 'Пополнение', replSub: 'Рекомендации по расходу 90 дней и мин. остатку',
      purchTitle: 'Закупки', purchSub: 'Заказы поставщикам и справочник контрагентов',
      invTitle: 'Ревизия', invSub: 'Обход ячеек и складские акты',
      projTitle: 'Проекты', projSub: 'Сборочные заказы, BOM и резервы',
      resTitle: 'Резервы', resSub: 'Зарезервированный запас по заказам',
      tsdTitle: 'Терминал сбора', tsdSub: 'Задания на отбор комплектующих',
      abcTitle: 'Аналитика', abcSub: 'ABC / XYZ, покрытие и приоритет хранения',
      docsTitle: 'Журнал документов', docsSub: 'Черновик → проведён → отменён',
      infoTitle: 'Информация', infoSub: 'Краткая справка по контуру Home [0.5]',
      setTitle: 'Настройки', setSub: 'Внешний вид, сканер, печать, бэкап (превью)',
      colType: 'Тип', colItem: 'Товар', colPlace: 'Адрес', colQty: 'Кол-во',
      colMin: 'Мин.', colBarcode: 'Штрихкод', colName: 'Название', colCat: 'Категория',
      colStatus: 'Статус', colSupplier: 'Поставщик', colClass: 'Класс', colFact: 'Факт',
      typeIn: 'Приход', typeOut: 'Расход', typeMove: 'Перемещение', typePair: 'Размещение',
      zoneAll: 'Все зоны', addr: (n) => `${n} адресов`,
      wh: 'Склад', sub: 'Подсклад', cell: 'Ячейка', empty: 'пусто', edit: 'Изменить',
      toastOk: (a, b, q) => `${a} → ${b} · остаток ${q}`,
      toastBad: 'Неизвестный код',
      toastWait: 'Ждём второй код…',
      toastReset: 'Данные сброшены',
      toastView: 'В превью действие только для просмотра',
      toastPosted: 'Документ проведён (локально в этой вкладке)',
      toastReserve: 'Резерв обновлён',
      chipCell: 'По ячейкам', chipFree: 'Свободная', chipActs: 'Акты',
      actWriteoff: 'Списание', actSurplus: 'Оприходование',
      poOpen: 'Открыт', poPartial: 'Частично', poDone: 'Получен',
      draft: 'Черновик', posted: 'Проведён', cancelled: 'Отменён',
      tabPo: 'Заказы', tabSup: 'Поставщики',
      infoBody: 'Metrika Home — offline-first склад на Windows. Организации и пользователи локальны. Сканер COM, CSV, этикетки, бэкап SQLite. Расширенный контур (документы, CRM, ЭДО) работает на той же машине.',
    },
    en: {
      welcomeSub: 'Local warehouse inventory for Windows',
      welcomeLead: 'Catalog, barcodes, bins, scanner, stocktakes, BOM assembly, purchasing and analytics — one local database on your PC. No cloud account.',
      feat1t: 'Catalog & barcodes', feat1d: 'Multiple codes per SKU, categories, min/max',
      feat2t: 'Address storage', feat2d: 'Warehouse → sub-location → bin with capacity',
      feat3t: 'Scanner', feat3d: 'Item + bin (+1) in any order',
      feat4t: 'Stocktake & acts', feat4d: 'Walk bins, write-off, surplus',
      feat5t: 'Assembly & reserves', feat5d: 'BOM, cell reserves, kit pick',
      feat6t: 'Purchasing & analytics', feat6d: 'Suppliers, replenishment, ABC / XYZ',
      welcomeNote: 'This browser preview shows the UI and core mechanics. The full product is the Windows app.',
      download: 'Download',
      enterAdmin: 'Administrator',
      bannerTitle: 'Metrika Home — UI preview',
      bannerHint: ' · data stays in this tab only',
      reset: 'Reset',
      exit: 'Sign out',
      appTitle: 'Metrika Home [0.5]',
      brand: 'Metrika Home',
      menuFile: 'File',
      menuEdit: 'Edit',
      menuInfo: 'Information',
      menuHelp: 'Help',
      session: 'Administrator · Workshop',
      searchPh: 'Search: #barcode · @name · =bin',
      sideFoot: 'Warehouse accounting · 2026',
      scanLabel: 'Scanner',
      scanMode: 'Item + bin (+1 pcs)',
      scanPort: 'BROWSER · no COM',
      noScan: 'no scan',
      scanHint: 'Scan item and bin in any order',
      role: 'Administrator',
      name: 'Administrator',
      dashSub: 'Operations panel · stats, stock and movement',
      btnHistory: 'History',
      btnNew: 'New item',
      recent: 'Recent moves',
      lowTitle: 'Below minimum',
      morning: 'Good morning',
      day: 'Good afternoon',
      evening: 'Good evening',
      night: 'Good night',
      kpiItems: 'Items', kpiUnits: 'Units', kpiFill: 'Occupancy', kpiLow: 'Below minimum',
      kpiIn: 'Received', kpiOut: 'Issued', kpiProjects: 'Projects', kpiMoves: 'Moves',
      hItems: 'active catalog SKUs', hUnits: 'physical stock on hand',
      hFill: 'bins with stock', hLow: 'items to replenish',
      itemsTitle: 'Catalog', itemsSub: 'Barcodes, stock and bin addresses',
      itemPh: '# barcode · @ name · = bin',
      fAll: 'All', fLow: 'Low stock', fStock: 'In stock',
      locLabel: 'Address storage', locTitle: 'Warehouse map',
      locSub: 'Warehouses, sub-locations, bins and capacity',
      btnLoc: 'New location', locPh: 'Find warehouse, sub-location or bin',
      histTitle: 'Movement journal', histSub: 'Receives, issues and scan-to-place',
      catTitle: 'Categories', catSub: 'Nested groups with colors on the map and catalog',
      unitsTitle: 'Units of measure', unitsSub: 'UoM dictionary for the catalog',
      replTitle: 'Replenishment', replSub: 'Suggestions from 90-day usage and min stock',
      purchTitle: 'Purchasing', purchSub: 'Purchase orders and suppliers',
      invTitle: 'Stocktake', invSub: 'Walk bins and stock acts',
      projTitle: 'Projects', projSub: 'Assembly orders, BOM and reserves',
      resTitle: 'Reserves', resSub: 'Held stock by work order',
      tsdTitle: 'Data terminal', tsdSub: 'Pick tasks for components',
      abcTitle: 'Analytics', abcSub: 'ABC / XYZ, coverage and storage priority',
      docsTitle: 'Document journal', docsSub: 'Draft → posted → cancelled',
      infoTitle: 'Information', infoSub: 'Short guide to the Home [0.5] contour',
      setTitle: 'Settings', setSub: 'Appearance, scanner, print, backup (preview)',
      colType: 'Type', colItem: 'Item', colPlace: 'Location', colQty: 'Qty',
      colMin: 'Min', colBarcode: 'Barcode', colName: 'Name', colCat: 'Category',
      colStatus: 'Status', colSupplier: 'Supplier', colClass: 'Class', colFact: 'Fact',
      typeIn: 'In', typeOut: 'Out', typeMove: 'Move', typePair: 'Place',
      zoneAll: 'All zones', addr: (n) => `${n} locations`,
      wh: 'Warehouse', sub: 'Sub-location', cell: 'Bin', empty: 'empty', edit: 'Edit',
      toastOk: (a, b, q) => `${a} → ${b} · qty ${q}`,
      toastBad: 'Unknown code',
      toastWait: 'Waiting for the second code…',
      toastReset: 'Data reset',
      toastView: 'View-only in this preview',
      toastPosted: 'Document posted (local to this tab)',
      toastReserve: 'Reserve updated',
      chipCell: 'By bin', chipFree: 'Free count', chipActs: 'Acts',
      actWriteoff: 'Write-off', actSurplus: 'Surplus',
      poOpen: 'Open', poPartial: 'Partial', poDone: 'Received',
      draft: 'Draft', posted: 'Posted', cancelled: 'Cancelled',
      tabPo: 'Orders', tabSup: 'Suppliers',
      infoBody: 'Metrika Home is an offline-first Windows warehouse. Organizations and users stay local. COM scanner, CSV, labels, SQLite backup. Extended contour (documents, CRM, EDI) runs on the same machine.',
    },
  };

  function seed() {
    return {
      items: [
        { barcode: '460123', name: 'ESP32 DevKit', category: 'Контроллеры', color: '#1a73e8', bin: 'A-01-01', qty: 12, min: 4, unit: 'шт', abc: 'A', reserved: 2 },
        { barcode: '460188', name: 'Dupont jumper', category: 'Кабели', color: '#188038', bin: 'B-02-03', qty: 80, min: 40, unit: 'уп', abc: 'B', reserved: 10 },
        { barcode: '460210', name: 'PCA9685', category: 'Контроллеры', color: '#1a73e8', bin: 'A-01-02', qty: 8, min: 3, unit: 'шт', abc: 'A', reserved: 1 },
        { barcode: '460301', name: 'MG90S servo', category: 'Механика', color: '#b06000', bin: 'B-02-01', qty: 2, min: 6, unit: 'шт', abc: 'A', reserved: 0 },
        { barcode: '460415', name: 'USB-C cable', category: 'Кабели', color: '#188038', bin: 'A-01-03', qty: 18, min: 5, unit: 'шт', abc: 'C', reserved: 0 },
        { barcode: '460520', name: 'OLED 0.96"', category: 'Дисплеи', color: '#7b61ff', bin: 'A-01-02', qty: 5, min: 2, unit: 'шт', abc: 'B', reserved: 1 },
        { barcode: '460630', name: '18650 holder', category: 'Механика', color: '#b06000', bin: 'B-02-02', qty: 25, min: 8, unit: 'шт', abc: 'C', reserved: 0 },
        { barcode: '460740', name: 'Buck 5V', category: 'Питание', color: '#c5221f', bin: 'A-01-01', qty: 9, min: 4, unit: 'шт', abc: 'B', reserved: 0 },
      ],
      locations: [
        { code: 'WH-1', name: 'Мастерская', type: 'warehouse', capacity: 0 },
        { code: 'ZONE-A', name: 'Стеллаж A', type: 'subwarehouse', capacity: 0 },
        { code: 'A-01-01', name: 'A-01-01', type: 'cell', capacity: 40 },
        { code: 'A-01-02', name: 'A-01-02', type: 'cell', capacity: 40 },
        { code: 'A-01-03', name: 'A-01-03', type: 'cell', capacity: 30 },
        { code: 'ZONE-B', name: 'Коробки B', type: 'subwarehouse', capacity: 0 },
        { code: 'B-02-01', name: 'B-02-01', type: 'cell', capacity: 50 },
        { code: 'B-02-02', name: 'B-02-02', type: 'cell', capacity: 50 },
        { code: 'B-02-03', name: 'B-02-03', type: 'cell', capacity: 50 },
      ],
      categories: [
        { name: 'Контроллеры', color: '#1a73e8', count: 2 },
        { name: 'Кабели', color: '#188038', count: 2 },
        { name: 'Механика', color: '#b06000', count: 2 },
        { name: 'Дисплеи', color: '#7b61ff', count: 1 },
        { name: 'Питание', color: '#c5221f', count: 1 },
      ],
      units: [
        { code: 'шт', name: 'Штука' },
        { code: 'уп', name: 'Упаковка' },
        { code: 'м', name: 'Метр' },
      ],
      moves: [
        { type: 'pair', item: 'ESP32 DevKit', place: 'A-01-01', qty: 1 },
        { type: 'out', item: 'Dupont jumper', place: 'B-02-03', qty: 20 },
        { type: 'in', item: 'PCA9685', place: 'A-01-02', qty: 4 },
        { type: 'move', item: 'USB-C cable', place: 'A-01-03', qty: 3 },
        { type: 'pair', item: 'OLED 0.96"', place: 'A-01-02', qty: 1 },
      ],
      purchases: [
        { id: 'PO-1042', supplier: 'Chip&Wire', status: 'open', lines: 4, total: '12 400 ₽' },
        { id: 'PO-1038', supplier: 'RobotParts', status: 'partial', lines: 2, total: '3 150 ₽' },
        { id: 'PO-1031', supplier: 'Chip&Wire', status: 'done', lines: 6, total: '8 900 ₽' },
      ],
      suppliers: [
        { name: 'Chip&Wire', phone: '+7 · demo', note: 'Контроллеры, питание' },
        { name: 'RobotParts', phone: '+7 · demo', note: 'Серво, механика' },
      ],
      projects: [
        {
          id: 'WO-221',
          name: 'Контроллер освещения',
          status: 'in_progress',
          qty: 2,
          bom: [
            { item: 'ESP32 DevKit', need: 2, reserved: 2 },
            { item: 'PCA9685', need: 2, reserved: 1 },
            { item: 'Dupont jumper', need: 4, reserved: 4 },
          ],
        },
        {
          id: 'WO-218',
          name: 'Тестовый стенд OLED',
          status: 'draft',
          qty: 1,
          bom: [
            { item: 'OLED 0.96"', need: 1, reserved: 0 },
            { item: 'USB-C cable', need: 1, reserved: 0 },
          ],
        },
      ],
      inventory: [
        { place: 'A-01-01', item: 'ESP32 DevKit', book: 12, fact: 12 },
        { place: 'A-01-01', item: 'Buck 5V', book: 9, fact: 8 },
        { place: 'B-02-01', item: 'MG90S servo', book: 2, fact: 2 },
        { place: 'B-02-03', item: 'Dupont jumper', book: 80, fact: 78 },
      ],
      documents: [
        { id: 'IN-501', type: 'Приход', status: 'posted', date: '2026-11-08' },
        { id: 'OUT-288', type: 'Расход', status: 'posted', date: '2026-11-09' },
        { id: 'TR-112', type: 'Перемещение', status: 'draft', date: '2026-11-10' },
      ],
      purchTab: 'po',
      invChip: 'cell',
    };
  }

  let lang = localStorage.getItem('metrika-lang');
  if (lang !== 'ru' && lang !== 'en') lang = 'ru';
  let state = load();
  let page = 'dashboard';
  let filter = 'all';
  let pendingItem = null;
  let pendingBin = null;
  let entered = sessionStorage.getItem('metrika-demo-entered') === '1';

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return seed();
      const data = JSON.parse(raw);
      return data?.items?.length ? { ...seed(), ...data } : seed();
    } catch {
      return seed();
    }
  }

  function save() {
    localStorage.setItem(KEY, JSON.stringify(state));
  }

  function t(key) {
    const dict = TEXT[lang] || TEXT.ru;
    const value = dict[key];
    return value == null ? TEXT.ru[key] : value;
  }

  function navLabel(item) {
    return lang === 'en' ? item.en : item.ru;
  }

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function toast(msg) {
    const el = document.getElementById('toast');
    el.hidden = false;
    el.textContent = msg;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => { el.hidden = true; }, 2400);
  }

  function setEntered(v) {
    entered = v;
    sessionStorage.setItem('metrika-demo-entered', v ? '1' : '0');
    document.getElementById('welcome').classList.toggle('hidden', v);
    document.getElementById('appRoot').classList.toggle('hidden', !v);
    if (v) {
      buildNav();
      renderAll();
      openPage(page);
    }
  }

  function applyText() {
    document.documentElement.lang = lang;
    document.querySelectorAll('[data-i]').forEach((el) => {
      const key = el.getAttribute('data-i');
      const value = t(key);
      if (typeof value === 'string') el.textContent = value;
    });
    document.querySelectorAll('[data-ph]').forEach((el) => {
      const value = t(el.getAttribute('data-ph'));
      if (typeof value === 'string') el.setAttribute('placeholder', value);
    });
    const lb = document.getElementById('langBtn');
    const lw = document.getElementById('langBtnWelcome');
    if (lb) lb.textContent = lang === 'ru' ? 'EN' : 'RU';
    if (lw) lw.textContent = lang === 'ru' ? 'EN' : 'RU';
    document.querySelectorAll('a[href*="Metrika-Home-Setup"]').forEach((a) => { a.href = DOWNLOAD; });
  }

  function buildNav() {
    const nav = document.getElementById('nav');
    const tabs = document.getElementById('tabs');
    nav.innerHTML = NAV.map((n) => `
      <button type="button" class="nav-item${n.id === page ? ' active' : ''}" data-page="${n.id}">${esc(navLabel(n))}</button>
    `).join('');
    tabs.innerHTML = NAV.filter((n) => n.tab).map((n) => `
      <button type="button" class="workspace-tab${n.id === page ? ' active' : ''}" data-page="${n.id}">${esc(navLabel(n))}</button>
    `).join('');
  }

  function pageShell(id, labelKey, titleKey, subKey, actionsHtml, bodyHtml) {
    return `
      <section class="page${id === page ? '' : ' hidden'}" id="page-${id}">
        <div class="page-header">
          <div>
            <div class="section-label">${esc(t(labelKey))}</div>
            <h1>${esc(t(titleKey))}</h1>
            <p>${esc(t(subKey))}</p>
          </div>
          <div class="table-actions">${actionsHtml || ''}</div>
        </div>
        ${bodyHtml}
      </section>
    `;
  }

  function typeBadge(type) {
    const map = {
      in: ['in', 'typeIn'],
      out: ['out', 'typeOut'],
      move: ['move', 'typeMove'],
      pair: ['move', 'typePair'],
    };
    const [cls, key] = map[type] || ['move', 'typePair'];
    return `<span class="type-badge ${cls}">${esc(t(key))}</span>`;
  }

  function statusPill(status) {
    const map = {
      open: ['warn', 'poOpen'],
      partial: ['move', 'poPartial'],
      done: ['in', 'poDone'],
      draft: ['move', 'draft'],
      posted: ['in', 'posted'],
      cancelled: ['out', 'cancelled'],
      in_progress: ['warn', 'poPartial'],
    };
    const [cls, key] = map[status] || ['move', 'draft'];
    return `<span class="type-badge ${cls}">${esc(t(key))}</span>`;
  }

  function greeting() {
    const h = new Date().getHours();
    const hello = h >= 5 && h < 12 ? t('morning')
      : h >= 12 && h < 17 ? t('day')
        : h >= 17 && h < 23 ? t('evening')
          : t('night');
    return `${hello}, ${t('name')}`;
  }

  function fillPct(code) {
    const loc = state.locations.find((l) => l.code === code);
    if (!loc?.capacity) return 0;
    const qty = state.items.filter((i) => i.bin === code).reduce((s, i) => s + i.qty, 0);
    return Math.min(100, Math.round((qty / loc.capacity) * 100));
  }

  function filteredItems() {
    const input = document.getElementById('itemSearch');
    const q = (input?.value || '').trim();
    let list = state.items.slice();
    if (filter === 'low') list = list.filter((i) => i.qty < i.min);
    if (filter === 'stock') list = list.filter((i) => i.qty > 0);
    if (q.startsWith('#')) list = list.filter((i) => i.barcode.includes(q.slice(1)));
    else if (q.startsWith('@')) list = list.filter((i) => i.name.toLowerCase().includes(q.slice(1).toLowerCase()));
    else if (q.startsWith('=')) list = list.filter((i) => i.bin.toLowerCase().includes(q.slice(1).toLowerCase()));
    else if (q) {
      const n = q.toLowerCase();
      list = list.filter((i) => i.name.toLowerCase().includes(n) || i.barcode.includes(n) || i.bin.toLowerCase().includes(n));
    }
    return list;
  }

  function renderPages() {
    const units = state.items.reduce((s, i) => s + i.qty, 0);
    const low = state.items.filter((i) => i.qty < i.min);
    const cells = state.locations.filter((l) => l.type === 'cell');
    const used = cells.filter((c) => state.items.some((i) => i.bin === c.code && i.qty > 0)).length;
    const fill = cells.length ? Math.round((used / cells.length) * 100) : 0;
    const moveRows = state.moves.map((m) => `
      <tr>
        <td>${typeBadge(m.type)}</td>
        <td class="strong">${esc(m.item)}</td>
        <td class="mono">${esc(m.place)}</td>
        <td><span class="qty-badge">${m.type === 'out' ? '−' : '+'}${m.qty}</span></td>
      </tr>`).join('');

    const kpiCards = [
      ['kpiItems', state.items.length, 'hItems', 'items', false],
      ['kpiUnits', units, 'hUnits', 'locations', false],
      ['kpiFill', `${fill}%`, 'hFill', 'locations', false],
      ['kpiLow', low.length, 'hLow', 'items', low.length > 0],
      ['kpiIn', state.moves.filter((m) => m.type === 'in' || m.type === 'pair').reduce((s, m) => s + m.qty, 0), '', 'history', false],
      ['kpiOut', state.moves.filter((m) => m.type === 'out').reduce((s, m) => s + m.qty, 0), '', 'history', false],
      ['kpiProjects', state.projects.length, '', 'projects', false],
      ['kpiMoves', state.moves.length, '', 'history', false],
    ].map(([label, value, hint, go, warn]) => `
      <button type="button" class="stat-card${warn ? ' warning' : ''}" data-page="${go}">
        <div class="stat-label">${esc(t(label))}</div>
        <div class="stat-value">${esc(String(value))}</div>
        <div class="stat-hint">${hint ? esc(t(hint)) : ''}</div>
      </button>`).join('');

    const dashFixed = `
      <section class="page${page === 'dashboard' ? '' : ' hidden'}" id="page-dashboard">
        <div class="page-header">
          <div>
            <div class="section-label">${esc(t('role'))}</div>
            <h1 id="greeting">${esc(greeting())}</h1>
            <p>${esc(t('dashSub'))}</p>
          </div>
          <div class="table-actions">
            <button type="button" class="btn btn-secondary" data-page="history">${esc(t('btnHistory'))}</button>
            <button type="button" class="btn btn-primary" data-page="items">${esc(t('btnNew'))}</button>
          </div>
        </div>
        <div class="dashboard-grid">${kpiCards}</div>
        <div class="dashboard-insights">
          <div class="table-wrap">
            <div class="table-header"><h2>${esc(t('recent'))}</h2></div>
            <div class="table-scroll"><table><thead><tr>
              <th>${esc(t('colType'))}</th><th>${esc(t('colItem'))}</th><th>${esc(t('colPlace'))}</th><th>${esc(t('colQty'))}</th>
            </tr></thead><tbody>${moveRows}</tbody></table></div>
          </div>
          <div class="table-wrap">
            <div class="table-header"><h2>${esc(t('lowTitle'))}</h2></div>
            <div class="table-scroll"><table><thead><tr>
              <th>${esc(t('colItem'))}</th><th>${esc(t('colQty'))}</th><th>${esc(t('colMin'))}</th>
            </tr></thead><tbody>${low.map((i) => `
              <tr><td class="strong">${esc(i.name)}</td><td><span class="qty-badge low">${i.qty}</span></td><td>${i.min}</td></tr>`).join('')}</tbody></table></div>
          </div>
        </div>
      </section>`;

    const items = pageShell('items', 'itemsTitle', 'itemsTitle', 'itemsSub',
      `<input id="itemSearch" class="search-input" type="search" placeholder="${esc(t('itemPh'))}" />
       <button type="button" class="btn btn-primary" data-viewonly>${esc(t('btnNew'))}</button>`,
      `<div class="table-wrap">
         <div class="filter-row" id="filters">
           <button type="button" class="filter-chip${filter === 'all' ? ' active' : ''}" data-filter="all">${esc(t('fAll'))}</button>
           <button type="button" class="filter-chip${filter === 'low' ? ' active' : ''}" data-filter="low">${esc(t('fLow'))}</button>
           <button type="button" class="filter-chip${filter === 'stock' ? ' active' : ''}" data-filter="stock">${esc(t('fStock'))}</button>
         </div>
         <div class="table-scroll"><table><thead><tr>
           <th>${esc(t('colBarcode'))}</th><th>${esc(t('colName'))}</th><th>${esc(t('colCat'))}</th>
           <th>${esc(t('colPlace'))}</th><th>${esc(t('colQty'))}</th>
         </tr></thead><tbody id="itemsBody">${filteredItems().map((i) => `
           <tr>
             <td class="mono">${esc(i.barcode)}</td>
             <td class="strong">${esc(i.name)}</td>
             <td><span class="category-tag" style="background:${esc(i.color)}">${esc(i.category)}</span></td>
             <td class="mono">${esc(i.bin)}</td>
             <td><span class="qty-badge${i.qty < i.min ? ' low' : ''}">${i.qty}</span></td>
           </tr>`).join('')}</tbody></table></div>
       </div>`);

    const locQ = (document.getElementById('locSearch')?.value || '').trim().toLowerCase();
    const locList = state.locations.filter((l) => !locQ || `${l.code} ${l.name}`.toLowerCase().includes(locQ));
    const locations = pageShell('locations', 'locLabel', 'locTitle', 'locSub',
      `<button type="button" class="btn btn-primary" data-viewonly>${esc(t('btnLoc'))}</button>`,
      `<div class="zone-summary">
         <button type="button" class="zone-chip is-active"><strong>${esc(t('zoneAll'))}</strong>
         <span>${esc(typeof t('addr') === 'function' ? t('addr')(state.locations.length) : '')}</span></button>
       </div>
       <div class="location-map-tools">
         <input id="locSearch" type="search" placeholder="${esc(t('locPh'))}" value="${esc(document.getElementById('locSearch')?.value || '')}" />
         <span>${esc(typeof t('addr') === 'function' ? t('addr')(locList.length) : '')}</span>
       </div>
       <div class="location-grid">${locList.map((loc) => {
    const pct = fillPct(loc.code);
    const busy = pct >= 90 ? ' full' : pct >= 55 ? ' busy' : '';
    const typeLabel = loc.type === 'warehouse' ? t('wh') : loc.type === 'subwarehouse' ? t('sub') : t('cell');
    const contents = state.items.filter((i) => i.bin === loc.code && i.qty > 0);
    return `<div class="location-card location-level-${loc.type}${busy}">
           <div class="location-card-header"><div>
             <div class="section-label">${esc(loc.code)}</div><h2>${esc(loc.name)}</h2>
             <span class="location-type-pill location-type-${loc.type === 'subwarehouse' ? 'subwarehouse' : loc.type}">${esc(typeLabel)}</span>
           </div><button type="button" class="btn btn-text" data-viewonly>${esc(t('edit'))}</button></div>
           <div class="location-contents">${contents.length
    ? contents.map((i) => `<div class="location-item"><span>${esc(i.name)}</span><strong>${i.qty}</strong></div>`).join('')
    : `<small style="color:var(--muted)">${esc(t('empty'))}</small>`}</div>
           ${loc.capacity ? `<div class="location-fill"><div class="location-fill-bar" style="width:${pct}%"></div><span>${pct}%</span></div>` : ''}
         </div>`;
  }).join('')}</div>`);

    const categories = pageShell('categories', 'catTitle', 'catTitle', 'catSub', '',
      `<div class="tile-grid">${state.categories.map((c) => `
        <div class="tile-card"><span class="cat-dot" style="background:${esc(c.color)}"></span>
          <div><strong>${esc(c.name)}</strong><div class="muted">${c.count} SKU</div></div>
        </div>`).join('')}</div>`);

    const unitsPage = pageShell('units', 'unitsTitle', 'unitsTitle', 'unitsSub', '',
      `<div class="table-wrap"><div class="table-scroll"><table><thead><tr>
         <th>${esc(t('colBarcode'))}</th><th>${esc(t('colName'))}</th>
       </tr></thead><tbody>${state.units.map((u) => `
         <tr><td class="mono">${esc(u.code)}</td><td class="strong">${esc(u.name)}</td></tr>`).join('')}</tbody></table></div></div>`);

    const repl = pageShell('replenishment', 'replTitle', 'replTitle', 'replSub',
      `<button type="button" class="btn btn-primary" data-viewonly>CSV</button>`,
      `<div class="table-wrap"><div class="table-scroll"><table><thead><tr>
         <th>${esc(t('colItem'))}</th><th>${esc(t('colQty'))}</th><th>${esc(t('colMin'))}</th><th>${esc(t('colPlace'))}</th>
       </tr></thead><tbody>${low.map((i) => `
         <tr><td class="strong">${esc(i.name)}</td><td><span class="qty-badge low">${i.qty}</span></td>
         <td>${i.min}</td><td class="mono">${esc(i.bin)}</td></tr>`).join('')}</tbody></table></div></div>`);

    const purchBody = state.purchTab === 'sup'
      ? `<div class="table-wrap"><div class="table-scroll"><table><thead><tr>
           <th>${esc(t('colSupplier'))}</th><th>${esc(t('colName'))}</th>
         </tr></thead><tbody>${state.suppliers.map((s) => `
           <tr><td class="strong">${esc(s.name)}</td><td>${esc(s.note)} · ${esc(s.phone)}</td></tr>`).join('')}</tbody></table></div></div>`
      : `<div class="table-wrap"><div class="table-scroll"><table><thead><tr>
           <th>ID</th><th>${esc(t('colSupplier'))}</th><th>${esc(t('colStatus'))}</th><th>${esc(t('colQty'))}</th>
         </tr></thead><tbody>${state.purchases.map((p) => `
           <tr><td class="mono">${esc(p.id)}</td><td>${esc(p.supplier)}</td><td>${statusPill(p.status)}</td>
           <td>${p.lines} · ${esc(p.total)}</td></tr>`).join('')}</tbody></table></div></div>`;

    const purchases = pageShell('purchases', 'purchTitle', 'purchTitle', 'purchSub', '',
      `<div class="filter-row">
         <button type="button" class="filter-chip${state.purchTab === 'po' ? ' active' : ''}" data-purch="po">${esc(t('tabPo'))}</button>
         <button type="button" class="filter-chip${state.purchTab === 'sup' ? ' active' : ''}" data-purch="sup">${esc(t('tabSup'))}</button>
       </div>${purchBody}`);

    const invBody = state.invChip === 'acts'
      ? `<div class="tile-grid">
           <button type="button" class="tile-card action" data-viewonly><strong>${esc(t('actWriteoff'))}</strong><span class="muted">OUT</span></button>
           <button type="button" class="tile-card action" data-viewonly><strong>${esc(t('actSurplus'))}</strong><span class="muted">IN</span></button>
         </div>`
      : `<div class="table-wrap"><div class="table-scroll"><table><thead><tr>
           <th>${esc(t('colPlace'))}</th><th>${esc(t('colItem'))}</th><th>${esc(t('colQty'))}</th><th>${esc(t('colFact'))}</th>
         </tr></thead><tbody>${state.inventory.map((r) => {
    const diff = r.fact - r.book;
    return `<tr><td class="mono">${esc(r.place)}</td><td>${esc(r.item)}</td><td>${r.book}</td>
             <td><span class="qty-badge${diff ? ' low' : ''}">${r.fact}${diff ? ` (${diff > 0 ? '+' : ''}${diff})` : ''}</span></td></tr>`;
  }).join('')}</tbody></table></div></div>`;

    const inventory = pageShell('inventory', 'invTitle', 'invTitle', 'invSub', '',
      `<div class="filter-row">
         <button type="button" class="filter-chip${state.invChip === 'cell' ? ' active' : ''}" data-inv="cell">${esc(t('chipCell'))}</button>
         <button type="button" class="filter-chip${state.invChip === 'free' ? ' active' : ''}" data-inv="free">${esc(t('chipFree'))}</button>
         <button type="button" class="filter-chip${state.invChip === 'acts' ? ' active' : ''}" data-inv="acts">${esc(t('chipActs'))}</button>
       </div>${invBody}`);

    const projects = pageShell('projects', 'projTitle', 'projTitle', 'projSub',
      `<button type="button" class="btn btn-primary" data-viewonly>${esc(t('btnNew'))}</button>`,
      `<div class="stack">${state.projects.map((p) => `
        <div class="table-wrap project-card">
          <div class="table-header">
            <div><h2>${esc(p.name)}</h2><div class="muted mono">${esc(p.id)} · ×${p.qty}</div></div>
            ${statusPill(p.status)}
          </div>
          <div class="table-scroll"><table><thead><tr>
            <th>${esc(t('colItem'))}</th><th>${esc(t('colQty'))}</th><th>${esc(t('resTitle'))}</th>
          </tr></thead><tbody>${p.bom.map((b) => `
            <tr><td>${esc(b.item)}</td><td>${b.need}</td>
            <td><span class="qty-badge${b.reserved < b.need ? ' low' : ''}">${b.reserved}/${b.need}</span></td></tr>`).join('')}</tbody></table></div>
          <div class="table-actions" style="padding:10px">
            <button type="button" class="btn btn-secondary" data-reserve="${esc(p.id)}">${esc(t('toastReserve'))}</button>
            <button type="button" class="btn btn-primary" data-page="tsd">TSD</button>
          </div>
        </div>`).join('')}</div>`);

    const reserves = pageShell('reserves', 'resTitle', 'resTitle', 'resSub', '',
      `<div class="table-wrap"><div class="table-scroll"><table><thead><tr>
         <th>${esc(t('colItem'))}</th><th>${esc(t('colQty'))}</th><th>${esc(t('colPlace'))}</th><th>Avail</th>
       </tr></thead><tbody>${state.items.filter((i) => i.reserved > 0).map((i) => `
         <tr><td class="strong">${esc(i.name)}</td><td>${i.reserved}</td><td class="mono">${esc(i.bin)}</td>
         <td>${Math.max(0, i.qty - i.reserved)}</td></tr>`).join('')}</tbody></table></div></div>`);

    const tsd = pageShell('tsd', 'tsdTitle', 'tsdTitle', 'tsdSub', '',
      `<div class="tile-grid">${state.projects[0].bom.map((b, idx) => `
        <div class="tile-card">
          <div class="section-label">TASK ${idx + 1}</div>
          <strong>${esc(b.item)}</strong>
          <div class="muted">${b.reserved}/${b.need}</div>
          <button type="button" class="btn btn-secondary" data-code="${esc(state.items.find((i) => i.name === b.item)?.barcode || '')}">Scan</button>
        </div>`).join('')}</div>`);

    const abc = pageShell('abc', 'abcTitle', 'abcTitle', 'abcSub', '',
      `<div class="table-wrap"><div class="table-scroll"><table><thead><tr>
         <th>${esc(t('colItem'))}</th><th>${esc(t('colClass'))}</th><th>${esc(t('colQty'))}</th><th>${esc(t('colPlace'))}</th>
       </tr></thead><tbody>${state.items.map((i) => `
         <tr><td class="strong">${esc(i.name)}</td><td><span class="type-badge ${i.abc === 'A' ? 'out' : i.abc === 'B' ? 'warn' : 'move'}">${esc(i.abc)}</span></td>
         <td>${i.qty}</td><td class="mono">${esc(i.bin)}</td></tr>`).join('')}</tbody></table></div></div>`);

    const documents = pageShell('documents', 'docsTitle', 'docsTitle', 'docsSub', '',
      `<div class="table-wrap"><div class="table-scroll"><table><thead><tr>
         <th>ID</th><th>${esc(t('colType'))}</th><th>${esc(t('colStatus'))}</th><th>Date</th><th></th>
       </tr></thead><tbody>${state.documents.map((d) => `
         <tr><td class="mono">${esc(d.id)}</td><td>${esc(d.type)}</td><td>${statusPill(d.status)}</td><td>${esc(d.date)}</td>
         <td>${d.status === 'draft' ? `<button type="button" class="btn btn-text" data-post="${esc(d.id)}">${esc(t('posted'))}</button>` : ''}</td></tr>`).join('')}</tbody></table></div></div>`);

    const history = pageShell('history', 'histTitle', 'histTitle', 'histSub', '',
      `<div class="table-wrap"><div class="table-scroll"><table><thead><tr>
         <th>${esc(t('colType'))}</th><th>${esc(t('colItem'))}</th><th>${esc(t('colPlace'))}</th><th>${esc(t('colQty'))}</th>
       </tr></thead><tbody>${moveRows}</tbody></table></div></div>`);

    const info = pageShell('info', 'infoTitle', 'infoTitle', 'infoSub', '',
      `<div class="info-card"><p>${esc(t('infoBody'))}</p>
         <div class="welcome-grid" style="margin-top:16px">
           <div class="welcome-feature"><strong>${esc(t('feat1t'))}</strong><span>${esc(t('feat1d'))}</span></div>
           <div class="welcome-feature"><strong>${esc(t('feat3t'))}</strong><span>${esc(t('feat3d'))}</span></div>
           <div class="welcome-feature"><strong>${esc(t('feat5t'))}</strong><span>${esc(t('feat5d'))}</span></div>
           <div class="welcome-feature"><strong>${esc(t('feat6t'))}</strong><span>${esc(t('feat6d'))}</span></div>
         </div></div>`);

    const settings = pageShell('settings', 'setTitle', 'setTitle', 'setSub', '',
      `<div class="tile-grid">
         ${['Appearance', 'Scanner', 'Print', 'Backup', 'Integrations', 'Workspace'].map((s) => `
           <button type="button" class="tile-card action" data-viewonly><strong>${esc(s)}</strong><span class="muted">preview</span></button>`).join('')}
       </div>`);

    document.getElementById('pages').innerHTML = [
      dashFixed, items, categories, unitsPage, repl, purchases, locations,
      inventory, projects, reserves, tsd, abc, documents, history, info, settings,
    ].join('');

    // re-bind search after rebuild
    const itemSearch = document.getElementById('itemSearch');
    if (itemSearch) {
      itemSearch.addEventListener('input', () => {
        renderPages();
        openPage('items');
      });
    }
    const locSearch = document.getElementById('locSearch');
    if (locSearch) {
      locSearch.addEventListener('input', () => {
        renderPages();
        openPage('locations');
      });
    }
  }

  function renderQuick() {
    const codes = [
      ...state.items.map((i) => i.barcode),
      ...state.locations.filter((l) => l.type === 'cell').map((l) => l.code),
    ];
    document.getElementById('quickCodes').innerHTML = codes.map((c) => (
      `<button type="button" class="quick-btn" data-code="${esc(c)}">${esc(c)}</button>`
    )).join('');
  }

  function openPage(id) {
    page = id;
    document.querySelectorAll('.page').forEach((el) => el.classList.toggle('hidden', el.id !== `page-${id}`));
    document.querySelectorAll('.nav-item, .workspace-tab').forEach((el) => {
      el.classList.toggle('active', el.getAttribute('data-page') === id);
    });
  }

  function renderAll() {
    applyText();
    buildNav();
    renderPages();
    renderQuick();
    openPage(page);
  }

  function handleScan(raw) {
    const code = String(raw || '').trim().replace(/^#/, '');
    if (!code) return;
    const item = state.items.find((i) => i.barcode === code);
    const bin = state.locations.find((l) => l.code.toLowerCase() === code.toLowerCase() && l.type === 'cell');
    const last = document.getElementById('lastScan');
    last.className = 'last-scan';
    last.textContent = code;

    if (item) pendingItem = item;
    else if (bin) pendingBin = bin;
    else {
      document.getElementById('scanHint').textContent = t('toastBad');
      toast(t('toastBad'));
      return;
    }

    if (pendingItem && pendingBin) {
      pendingItem.bin = pendingBin.code;
      pendingItem.qty += 1;
      state.moves.unshift({ type: 'pair', item: pendingItem.name, place: pendingBin.code, qty: 1 });
      toast(t('toastOk')(pendingItem.name, pendingBin.code, pendingItem.qty));
      document.getElementById('scanHint').textContent = t('scanHint');
      pendingItem = null;
      pendingBin = null;
      last.className = 'last-scan empty';
      last.textContent = t('noScan');
      save();
      renderAll();
      return;
    }
    document.getElementById('scanHint').textContent = t('toastWait');
  }

  document.body.addEventListener('click', (e) => {
    const pageBtn = e.target.closest('[data-page]');
    if (pageBtn && (pageBtn.classList.contains('nav-item') || pageBtn.classList.contains('workspace-tab') || pageBtn.classList.contains('stat-card') || pageBtn.classList.contains('btn'))) {
      openPage(pageBtn.getAttribute('data-page'));
      return;
    }
    const codeBtn = e.target.closest('[data-code]');
    if (codeBtn) {
      handleScan(codeBtn.getAttribute('data-code'));
      return;
    }
    const filterBtn = e.target.closest('[data-filter]');
    if (filterBtn) {
      filter = filterBtn.getAttribute('data-filter');
      renderPages();
      openPage('items');
      return;
    }
    const purchBtn = e.target.closest('[data-purch]');
    if (purchBtn) {
      state.purchTab = purchBtn.getAttribute('data-purch');
      save();
      renderPages();
      openPage('purchases');
      return;
    }
    const invBtn = e.target.closest('[data-inv]');
    if (invBtn) {
      state.invChip = invBtn.getAttribute('data-inv');
      save();
      renderPages();
      openPage('inventory');
      return;
    }
    const postBtn = e.target.closest('[data-post]');
    if (postBtn) {
      const id = postBtn.getAttribute('data-post');
      const doc = state.documents.find((d) => d.id === id);
      if (doc) {
        doc.status = 'posted';
        save();
        renderPages();
        openPage('documents');
        toast(t('toastPosted'));
      }
      return;
    }
    const resBtn = e.target.closest('[data-reserve]');
    if (resBtn) {
      const proj = state.projects.find((p) => p.id === resBtn.getAttribute('data-reserve'));
      if (proj) {
        proj.bom.forEach((b) => { b.reserved = b.need; });
        proj.status = 'in_progress';
        save();
        renderPages();
        openPage('projects');
        toast(t('toastReserve'));
      }
      return;
    }
    if (e.target.closest('[data-viewonly]')) toast(t('toastView'));
  });

  function toggleLang() {
    lang = lang === 'ru' ? 'en' : 'ru';
    localStorage.setItem('metrika-lang', lang);
    applyText();
    if (entered) renderAll();
  }

  document.getElementById('langBtn')?.addEventListener('click', toggleLang);
  document.getElementById('langBtnWelcome')?.addEventListener('click', toggleLang);
  document.getElementById('enterBtn')?.addEventListener('click', () => setEntered(true));
  document.getElementById('exitBtn')?.addEventListener('click', () => setEntered(false));
  document.getElementById('resetBtn')?.addEventListener('click', () => {
    state = seed();
    pendingItem = null;
    pendingBin = null;
    filter = 'all';
    save();
    renderAll();
    document.getElementById('lastScan').className = 'last-scan empty';
    document.getElementById('lastScan').textContent = t('noScan');
    document.getElementById('scanHint').textContent = t('scanHint');
    toast(t('toastReset'));
  });

  document.getElementById('scanInput')?.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    handleScan(e.target.value);
    e.target.value = '';
  });
  document.getElementById('globalSearch')?.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    openPage('items');
    const el = document.getElementById('itemSearch');
    if (el) {
      el.value = e.target.value.trim();
      renderPages();
      openPage('items');
    }
  });

  applyText();
  if (entered) setEntered(true);
  else {
    document.getElementById('welcome').classList.remove('hidden');
    document.getElementById('appRoot').classList.add('hidden');
  }
})();
