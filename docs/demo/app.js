(() => {
  const KEY = 'metrika-demo-v4';

  const TEXT = {
    ru: {
      bannerTitle: 'Демо интерфейса Метрики',
      bannerHint: ' — как в Windows-приложении. Данные только в этой вкладке.',
      reset: 'Сбросить',
      download: 'Скачать для Windows',
      appTitle: 'Метрика [0.5 Домашняя]',
      brand: 'Метрика',
      menuFile: 'Файл',
      menuView: 'Вид',
      session: 'Демо · Мастерская',
      searchPh: 'Поиск: #штрихкод · @название · =ячейка',
      sideFoot: 'Локальный склад · браузерное демо',
      scanLabel: 'Сканер',
      scanMode: 'Товар + ячейка (+1 шт.)',
      scanPort: 'DEMO · без COM',
      noScan: 'нет скана',
      scanHint: 'Отсканируйте товар и ячейку в любом порядке',
      role: 'Пользователь',
      dashSub: 'Операционная панель · статистика, остатки и движение',
      btnHistory: 'История',
      btnNew: 'Новый товар',
      recent: 'Последние движения',
      lowTitle: 'Ниже минимума',
      colType: 'Тип',
      colItem: 'Товар',
      colPlace: 'Адрес',
      colQty: 'Кол-во',
      colMin: 'Мин.',
      colBarcode: 'Штрихкод',
      colName: 'Название',
      colCat: 'Категория',
      navOverview: 'Обзор',
      navItems: 'Товары',
      navStorage: 'Хранение',
      navHistory: 'История',
      itemsTitle: 'Каталог',
      itemsSub: 'Штрихкоды, остатки и адреса хранения',
      itemPh: '# штрихкод · @ название · = ячейка',
      fAll: 'Все',
      fLow: 'Низкий остаток',
      fStock: 'В наличии',
      locLabel: 'Адресное хранение',
      locTitle: 'Карта склада',
      locSub: 'Склады, подсклады, ячейки и вместимость',
      btnLoc: 'Новый адрес',
      locPh: 'Найти склад, подсклад или ячейку',
      histTitle: 'Журнал движений',
      histSub: 'Приход, расход и размещение из демо-сканера',
      morning: 'Доброе утро',
      day: 'Добрый день',
      evening: 'Добрый вечер',
      night: 'Доброй ночи',
      name: 'Демо',
      kpiItems: 'Товары',
      kpiUnits: 'Единицы',
      kpiFill: 'Заполненность',
      kpiLow: 'Ниже минимума',
      kpiIn: 'Приход',
      kpiOut: 'Расход',
      kpiProjects: 'Проекты',
      kpiMoves: 'Перемещения',
      hItems: 'активных позиций каталога',
      hUnits: 'физический запас по складу',
      hFill: 'ячеек с остатком',
      hLow: 'позиций для пополнения',
      typeIn: 'Приход',
      typeOut: 'Расход',
      typeMove: 'Перемещение',
      typePair: 'Размещение',
      zoneAll: 'Все зоны',
      addr: (n) => `${n} адресов`,
      wh: 'Склад',
      sub: 'Подсклад',
      cell: 'Ячейка',
      empty: 'пусто',
      edit: 'Изменить',
      toastOk: (a, b, q) => `${a} → ${b} · остаток ${q}`,
      toastBad: 'Неизвестный код',
      toastWait: 'Ждём второй код…',
      toastReset: 'Данные демо сброшены',
      toastView: 'В демо это действие только для просмотра',
    },
    en: {
      bannerTitle: 'Metrika UI demo',
      bannerHint: ' — same look as the Windows app. Data stays in this tab.',
      reset: 'Reset',
      download: 'Download for Windows',
      appTitle: 'Metrika [0.5 Home]',
      brand: 'Metrika',
      menuFile: 'File',
      menuView: 'View',
      session: 'Demo · Workshop',
      searchPh: 'Search: #barcode · @name · =bin',
      sideFoot: 'Local warehouse · browser demo',
      scanLabel: 'Scanner',
      scanMode: 'Item + bin (+1 pcs)',
      scanPort: 'DEMO · no COM',
      noScan: 'no scan',
      scanHint: 'Scan item and bin in any order',
      role: 'User',
      dashSub: 'Operations panel · stats, stock and movement',
      btnHistory: 'History',
      btnNew: 'New item',
      recent: 'Recent moves',
      lowTitle: 'Below minimum',
      colType: 'Type',
      colItem: 'Item',
      colPlace: 'Location',
      colQty: 'Qty',
      colMin: 'Min',
      colBarcode: 'Barcode',
      colName: 'Name',
      colCat: 'Category',
      navOverview: 'Overview',
      navItems: 'Items',
      navStorage: 'Storage',
      navHistory: 'History',
      itemsTitle: 'Catalog',
      itemsSub: 'Barcodes, stock and bin addresses',
      itemPh: '# barcode · @ name · = bin',
      fAll: 'All',
      fLow: 'Low stock',
      fStock: 'In stock',
      locLabel: 'Address storage',
      locTitle: 'Warehouse map',
      locSub: 'Warehouses, sub-locations, bins and capacity',
      btnLoc: 'New location',
      locPh: 'Find warehouse, sub-location or bin',
      histTitle: 'Movement journal',
      histSub: 'Receives, issues and scan-to-place from the demo scanner',
      morning: 'Good morning',
      day: 'Good afternoon',
      evening: 'Good evening',
      night: 'Good night',
      name: 'Demo',
      kpiItems: 'Items',
      kpiUnits: 'Units',
      kpiFill: 'Occupancy',
      kpiLow: 'Below minimum',
      kpiIn: 'Received',
      kpiOut: 'Issued',
      kpiProjects: 'Projects',
      kpiMoves: 'Transfers',
      hItems: 'active catalog SKUs',
      hUnits: 'physical stock on hand',
      hFill: 'bins with stock',
      hLow: 'items to replenish',
      typeIn: 'In',
      typeOut: 'Out',
      typeMove: 'Move',
      typePair: 'Place',
      zoneAll: 'All zones',
      addr: (n) => `${n} locations`,
      wh: 'Warehouse',
      sub: 'Sub-location',
      cell: 'Bin',
      empty: 'empty',
      edit: 'Edit',
      toastOk: (a, b, q) => `${a} → ${b} · qty ${q}`,
      toastBad: 'Unknown code',
      toastWait: 'Waiting for the second code…',
      toastReset: 'Demo data reset',
      toastView: 'View-only in this demo',
    },
  };

  function seed() {
    return {
      items: [
        { barcode: '460123', name: 'ESP32 DevKit', category: 'Контроллеры', color: '#1a73e8', bin: 'A-01-01', qty: 12, min: 4 },
        { barcode: '460188', name: 'Dupont jumper', category: 'Кабели', color: '#188038', bin: 'B-02-03', qty: 80, min: 40 },
        { barcode: '460210', name: 'PCA9685', category: 'Контроллеры', color: '#1a73e8', bin: 'A-01-02', qty: 8, min: 3 },
        { barcode: '460301', name: 'MG90S servo', category: 'Механика', color: '#b06000', bin: 'B-02-01', qty: 2, min: 6 },
        { barcode: '460415', name: 'USB-C cable', category: 'Кабели', color: '#188038', bin: 'A-01-03', qty: 18, min: 5 },
        { barcode: '460520', name: 'OLED 0.96"', category: 'Дисплеи', color: '#7b61ff', bin: 'A-01-02', qty: 5, min: 2 },
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
      moves: [
        { type: 'pair', item: 'ESP32 DevKit', place: 'A-01-01', qty: 1 },
        { type: 'out', item: 'Dupont jumper', place: 'B-02-03', qty: 20 },
        { type: 'in', item: 'PCA9685', place: 'A-01-02', qty: 4 },
        { type: 'move', item: 'USB-C cable', place: 'A-01-03', qty: 3 },
        { type: 'pair', item: 'OLED 0.96"', place: 'A-01-02', qty: 1 },
      ],
    };
  }

  let lang = localStorage.getItem('metrika-lang');
  if (lang !== 'ru' && lang !== 'en') lang = 'ru';
  let state = load();
  let page = 'dashboard';
  let filter = 'all';
  let pendingItem = null;
  let pendingBin = null;

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return seed();
      const data = JSON.parse(raw);
      return data?.items?.length ? data : seed();
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
    document.getElementById('langBtn').textContent = lang === 'ru' ? 'EN' : 'RU';
    const h = new Date().getHours();
    const hello = h >= 5 && h < 12 ? t('morning')
      : h >= 12 && h < 17 ? t('day')
        : h >= 17 && h < 23 ? t('evening')
          : t('night');
    document.getElementById('greeting').textContent = `${hello}, ${t('name')}`;
  }

  function openPage(id) {
    page = id;
    document.querySelectorAll('.page').forEach((el) => el.classList.toggle('hidden', el.id !== `page-${id}`));
    document.querySelectorAll('[data-page]').forEach((el) => {
      if (el.classList.contains('nav-item') || el.classList.contains('workspace-tab')) {
        el.classList.toggle('active', el.getAttribute('data-page') === id);
      }
    });
  }

  function fillPct(code) {
    const loc = state.locations.find((l) => l.code === code);
    if (!loc?.capacity) return 0;
    const qty = state.items.filter((i) => i.bin === code).reduce((s, i) => s + i.qty, 0);
    return Math.min(100, Math.round((qty / loc.capacity) * 100));
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

  function renderKpis() {
    const units = state.items.reduce((s, i) => s + i.qty, 0);
    const low = state.items.filter((i) => i.qty < i.min).length;
    const cells = state.locations.filter((l) => l.type === 'cell');
    const used = cells.filter((c) => state.items.some((i) => i.bin === c.code && i.qty > 0)).length;
    const fill = cells.length ? Math.round((used / cells.length) * 100) : 0;
    const cards = [
      ['kpiItems', state.items.length, 'hItems', 'items', false],
      ['kpiUnits', units, 'hUnits', 'locations', false],
      ['kpiFill', `${fill}%`, 'hFill', 'locations', false],
      ['kpiLow', low, 'hLow', 'items', low > 0],
      ['kpiIn', state.moves.filter((m) => m.type === 'in' || m.type === 'pair').reduce((s, m) => s + m.qty, 0), '', 'history', false],
      ['kpiOut', state.moves.filter((m) => m.type === 'out').reduce((s, m) => s + m.qty, 0), '', 'history', false],
      ['kpiProjects', 1, '', 'dashboard', false],
      ['kpiMoves', state.moves.length, '', 'history', false],
    ];
    document.getElementById('kpiGrid').innerHTML = cards.map(([label, value, hint, go, warn]) => `
      <button type="button" class="stat-card${warn ? ' warning' : ''}" data-page="${go}">
        <div class="stat-label">${esc(t(label))}</div>
        <div class="stat-value">${esc(String(value))}</div>
        <div class="stat-hint">${hint ? esc(t(hint)) : ''}</div>
      </button>
    `).join('');
  }

  function renderMoves() {
    const rows = state.moves.map((m) => `
      <tr>
        <td>${typeBadge(m.type)}</td>
        <td class="strong">${esc(m.item)}</td>
        <td class="mono">${esc(m.place)}</td>
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
        <td class="strong">${esc(i.name)}</td>
        <td><span class="qty-badge low">${i.qty}</span></td>
        <td>${i.min}</td>
      </tr>
    `).join('');
  }

  function filteredItems() {
    const q = (document.getElementById('itemSearch').value || '').trim();
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

  function renderItems() {
    document.getElementById('itemsBody').innerHTML = filteredItems().map((i) => `
      <tr>
        <td class="mono">${esc(i.barcode)}</td>
        <td class="strong">${esc(i.name)}</td>
        <td><span class="category-tag" style="background:${esc(i.color)}">${esc(i.category)}</span></td>
        <td class="mono">${esc(i.bin)}</td>
        <td><span class="qty-badge${i.qty < i.min ? ' low' : ''}">${i.qty}</span></td>
      </tr>
    `).join('');
  }

  function renderLocations() {
    const q = (document.getElementById('locSearch').value || '').trim().toLowerCase();
    const list = state.locations.filter((l) => !q || `${l.code} ${l.name}`.toLowerCase().includes(q));
    const fn = t('addr');
    document.getElementById('locCount').textContent = typeof fn === 'function' ? fn(list.length) : `${list.length}`;
    document.getElementById('zones').innerHTML = `
      <button type="button" class="zone-chip is-active">
        <strong>${esc(t('zoneAll'))}</strong>
        <span>${esc(typeof t('addr') === 'function' ? t('addr')(state.locations.length) : '')}</span>
      </button>
    `;
    document.getElementById('locGrid').innerHTML = list.map((loc) => {
      const fill = fillPct(loc.code);
      const level = loc.type;
      const busy = fill >= 90 ? ' full' : fill >= 55 ? ' busy' : '';
      const typeLabel = loc.type === 'warehouse' ? t('wh') : loc.type === 'subwarehouse' ? t('sub') : t('cell');
      const contents = state.items.filter((i) => i.bin === loc.code && i.qty > 0);
      return `
        <div class="location-card location-level-${level}${busy}">
          <div class="location-card-header">
            <div>
              <div class="section-label">${esc(loc.code)}</div>
              <h2>${esc(loc.name)}</h2>
              <span class="location-type-pill location-type-${level === 'subwarehouse' ? 'subwarehouse' : level}">${esc(typeLabel)}</span>
            </div>
            <button type="button" class="btn btn-text" data-viewonly>${esc(t('edit'))}</button>
          </div>
          <div class="location-contents">
            ${contents.length
    ? contents.map((i) => `<div class="location-item"><span>${esc(i.name)}</span><strong>${i.qty}</strong></div>`).join('')
    : `<small style="color:var(--muted)">${esc(t('empty'))}</small>`}
          </div>
          ${loc.capacity ? `<div class="location-fill"><div class="location-fill-bar" style="width:${fill}%"></div><span>${fill}%</span></div>` : ''}
        </div>
      `;
    }).join('');
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

  function renderAll() {
    applyText();
    renderKpis();
    renderMoves();
    renderLow();
    renderItems();
    renderLocations();
    renderQuick();
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
    if (e.target.closest('[data-viewonly]')) toast(t('toastView'));
  });

  document.getElementById('langBtn').addEventListener('click', () => {
    lang = lang === 'ru' ? 'en' : 'ru';
    localStorage.setItem('metrika-lang', lang);
    renderAll();
    document.getElementById('scanHint').textContent = t('scanHint');
  });

  document.getElementById('resetBtn').addEventListener('click', () => {
    state = seed();
    pendingItem = null;
    pendingBin = null;
    save();
    renderAll();
    document.getElementById('lastScan').className = 'last-scan empty';
    document.getElementById('lastScan').textContent = t('noScan');
    document.getElementById('scanHint').textContent = t('scanHint');
    toast(t('toastReset'));
  });

  function on(id, event, handler) {
    const el = document.getElementById(id);
    if (el) el.addEventListener(event, handler);
  }

  on('itemSearch', 'input', renderItems);
  on('locSearch', 'input', renderLocations);
  on('filters', 'click', (e) => {
    const chip = e.target.closest('[data-filter]');
    if (!chip) return;
    filter = chip.getAttribute('data-filter');
    document.querySelectorAll('#filters .filter-chip').forEach((c) => c.classList.toggle('active', c === chip));
    renderItems();
  });
  on('scanInput', 'keydown', (e) => {
    if (e.key !== 'Enter') return;
    handleScan(e.target.value);
    e.target.value = '';
  });
  on('globalSearch', 'keydown', (e) => {
    if (e.key !== 'Enter') return;
    openPage('items');
    document.getElementById('itemSearch').value = e.target.value.trim();
    renderItems();
  });
  on('btnNewLoc', 'click', () => toast(t('toastView')));

  try {
    renderAll();
    openPage('dashboard');
  } catch (err) {
    console.error(err);
    document.getElementById('toast').hidden = false;
    document.getElementById('toast').textContent = String(err);
  }
})();
