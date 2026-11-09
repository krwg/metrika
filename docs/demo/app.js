(() => {
  const STORAGE_KEY = 'metrika-demo-v1';

  const i18n = {
    en: {
      demoBadge: 'Demo',
      navRepo: 'Repository',
      navDownload: 'Download for Windows',
      eyebrow: 'Home 0.5 · browser preview',
      heroTitle: 'See where every part lives',
      heroLede: 'A lightweight preview of Metrika’s warehouse flow: catalog, address bins, and scan-to-place. The full product runs offline on your Windows PC.',
      ctaTry: 'Try the demo',
      ctaInstall: 'Get the installer',
      fineprint: 'Demo data resets with the button below. Nothing is uploaded — it stays in this browser tab.',
      floatScan: 'Scan',
      navOverview: 'Overview',
      navItems: 'Items',
      navStorage: 'Storage',
      navScanner: 'Scanner',
      resetData: 'Reset demo data',
      overviewTitle: 'Overview',
      overviewSub: 'Workshop sample warehouse',
      recentTitle: 'Recent moves',
      itemsTitle: 'Items',
      itemsSub: 'Search with # barcode or @ name',
      searchPlaceholder: 'Search… #460123 or @ESP32',
      colBarcode: 'Barcode',
      colName: 'Name',
      colBin: 'Bin',
      colQty: 'Qty',
      storageTitle: 'Storage map',
      storageSub: 'Warehouse → bins',
      scannerTitle: 'Scanner desk',
      scannerSub: 'Item + bin (+1) in any order',
      scanInputLabel: 'Scan or type a code',
      scanHint: 'Scan an item barcode and a bin code — order does not matter.',
      quickCodes: 'Quick codes',
      footerNote: 'Browser demo of Metrika Home 0.5 — not a substitute for the desktop app (COM scanners, backups, assembly, purchasing).',
      footerRelease: 'Release notes',
      kpiSku: 'SKU',
      kpiLow: 'Low stock',
      kpiBins: 'Bins used',
      kpiMoves: 'Moves',
      scanNeedMore: 'Waiting for the second code…',
      scanOk: (item, bin, qty) => `Placed ${item} in ${bin}. Qty now ${qty}.`,
      scanUnknown: 'Unknown code. Try a quick code below.',
      binItems: (n) => `${n} item${n === 1 ? '' : 's'}`,
      capacity: (p) => `${p}% full`,
    },
    ru: {
      demoBadge: 'Демо',
      navRepo: 'Репозиторий',
      navDownload: 'Скачать для Windows',
      eyebrow: 'Home 0.5 · превью в браузере',
      heroTitle: 'Видно, где лежит каждая деталь',
      heroLede: 'Короткое превью складского потока Метрики: каталог, ячейки и размещение сканером. Полный продукт работает офлайн на Windows.',
      ctaTry: 'Открыть демо',
      ctaInstall: 'Скачать установщик',
      fineprint: 'Данные сбрасываются кнопкой ниже. Ничего не уходит на сервер — только эта вкладка браузера.',
      floatScan: 'Скан',
      navOverview: 'Обзор',
      navItems: 'Товары',
      navStorage: 'Хранение',
      navScanner: 'Сканер',
      resetData: 'Сбросить демо',
      overviewTitle: 'Обзор',
      overviewSub: 'Учебный склад мастерской',
      recentTitle: 'Последние движения',
      itemsTitle: 'Товары',
      itemsSub: 'Поиск: # штрихкод или @ название',
      searchPlaceholder: 'Поиск… #460123 или @ESP32',
      colBarcode: 'Штрихкод',
      colName: 'Название',
      colBin: 'Ячейка',
      colQty: 'Кол-во',
      storageTitle: 'Карта хранения',
      storageSub: 'Склад → ячейки',
      scannerTitle: 'Стол сканера',
      scannerSub: 'Товар + ячейка (+1) в любом порядке',
      scanInputLabel: 'Сканируйте или введите код',
      scanHint: 'Сначала товар или ячейка — порядок не важен.',
      quickCodes: 'Быстрые коды',
      footerNote: 'Браузерное демо Метрика Home 0.5 — не замена desktop-приложению (COM-сканер, бэкапы, сборка, закупки).',
      footerRelease: 'Описание релиза',
      kpiSku: 'SKU',
      kpiLow: 'Низкий остаток',
      kpiBins: 'Ячеек занято',
      kpiMoves: 'Операции',
      scanNeedMore: 'Ждём второй код…',
      scanOk: (item, bin, qty) => `${item} → ${bin}. Остаток ${qty}.`,
      scanUnknown: 'Неизвестный код. Возьмите код из списка ниже.',
      binItems: (n) => `${n} поз.`,
      capacity: (p) => `${p}%`,
    },
  };

  const seed = () => ({
    bins: [
      { code: 'A-01-01', capacity: 40 },
      { code: 'A-01-02', capacity: 40 },
      { code: 'A-01-03', capacity: 30 },
      { code: 'B-02-01', capacity: 50 },
      { code: 'B-02-02', capacity: 50 },
      { code: 'B-02-03', capacity: 50 },
    ],
    items: [
      { barcode: '460123', name: 'ESP32 DevKit', bin: 'A-01-01', qty: 12, min: 4 },
      { barcode: '460188', name: 'Dupont jumper', bin: 'B-02-03', qty: 80, min: 40 },
      { barcode: '460210', name: 'PCA9685', bin: 'A-01-02', qty: 8, min: 3 },
      { barcode: '460301', name: 'MG90S servo', bin: 'B-02-01', qty: 2, min: 6 },
      { barcode: '460415', name: 'USB-C cable', bin: 'A-01-03', qty: 18, min: 5 },
      { barcode: '460520', name: 'OLED 0.96"', bin: 'A-01-02', qty: 5, min: 2 },
    ],
    moves: [
      { text: '#460123 · ESP32 DevKit · A-01-01 · +1' },
      { text: '#460188 · Dupont jumper · B-02-03 · −20' },
      { text: '#460210 · PCA9685 · A-01-02 · +4' },
    ],
  });

  let lang = localStorage.getItem('metrika-demo-lang');
  if (lang !== 'ru' && lang !== 'en') {
    lang = (navigator.language || '').toLowerCase().startsWith('ru') ? 'ru' : 'en';
  }

  let state = loadState();
  let pendingItem = null;
  let pendingBin = null;

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return seed();
      const parsed = JSON.parse(raw);
      if (!parsed.items || !parsed.bins) return seed();
      return parsed;
    } catch {
      return seed();
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function t(key, ...args) {
    const value = i18n[lang][key];
    return typeof value === 'function' ? value(...args) : value;
  }

  function applyI18n() {
    document.documentElement.lang = lang;
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      el.textContent = t(el.getAttribute('data-i18n'));
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      el.setAttribute('placeholder', t(el.getAttribute('data-i18n-placeholder')));
    });
    document.getElementById('langBtn').textContent = lang.toUpperCase();
  }

  function binFill(code) {
    const bin = state.bins.find((b) => b.code === code);
    if (!bin) return 0;
    const qty = state.items.filter((i) => i.bin === code).reduce((s, i) => s + i.qty, 0);
    return Math.min(100, Math.round((qty / bin.capacity) * 100));
  }

  function renderKpis() {
    const low = state.items.filter((i) => i.qty < i.min).length;
    const used = new Set(state.items.filter((i) => i.qty > 0).map((i) => i.bin)).size;
    const row = document.getElementById('kpiRow');
    row.innerHTML = `
      <div class="kpi"><span>${t('kpiSku')}</span><strong>${state.items.length}</strong></div>
      <div class="kpi warn"><span>${t('kpiLow')}</span><strong>${low}</strong></div>
      <div class="kpi accent"><span>${t('kpiBins')}</span><strong>${used}</strong></div>
      <div class="kpi"><span>${t('kpiMoves')}</span><strong>${state.moves.length}</strong></div>
    `;
  }

  function renderFeed() {
    document.getElementById('recentFeed').innerHTML = state.moves
      .slice(0, 8)
      .map((m) => `<li>${escapeHtml(m.text)}</li>`)
      .join('');
  }

  function renderItems() {
    const q = (document.getElementById('itemSearch').value || '').trim();
    let list = state.items.slice();
    if (q.startsWith('#')) {
      const code = q.slice(1).toLowerCase();
      list = list.filter((i) => i.barcode.toLowerCase().includes(code));
    } else if (q.startsWith('@')) {
      const name = q.slice(1).toLowerCase();
      list = list.filter((i) => i.name.toLowerCase().includes(name));
    } else if (q) {
      const needle = q.toLowerCase();
      list = list.filter(
        (i) =>
          i.name.toLowerCase().includes(needle) ||
          i.barcode.toLowerCase().includes(needle) ||
          i.bin.toLowerCase().includes(needle),
      );
    }
    document.getElementById('itemsBody').innerHTML = list
      .map(
        (i) => `
      <tr>
        <td><code>${escapeHtml(i.barcode)}</code></td>
        <td>${escapeHtml(i.name)}</td>
        <td><code>${escapeHtml(i.bin)}</code></td>
        <td>${i.qty}</td>
      </tr>`,
      )
      .join('');
  }

  function renderBins() {
    document.getElementById('binGrid').innerHTML = state.bins
      .map((b) => {
        const count = state.items.filter((i) => i.bin === b.code).length;
        const fill = binFill(b.code);
        const cls = fill >= 90 ? 'full' : fill >= 60 ? 'busy' : fill === 0 ? 'empty' : 'ok';
        return `<div class="bin-card ${cls}"><strong>${escapeHtml(b.code)}</strong><span>${t('binItems', count)}</span><span>${t('capacity', fill)}</span></div>`;
      })
      .join('');
  }

  function renderQuickCodes() {
    const codes = [
      ...state.items.map((i) => i.barcode),
      ...state.bins.map((b) => b.code),
    ];
    document.getElementById('quickCodes').innerHTML = codes
      .map((c) => `<button type="button" data-code="${escapeAttr(c)}">${escapeHtml(c)}</button>`)
      .join('');
  }

  function renderScanChips() {
    const chips = [];
    if (pendingItem) chips.push(`#${pendingItem.barcode}`);
    if (pendingBin) chips.push(pendingBin.code);
    document.getElementById('scanChips').innerHTML = chips
      .map((c) => `<span class="chip">${escapeHtml(c)}</span>`)
      .join('');
  }

  function setScanStatus(text, kind) {
    const el = document.getElementById('scanStatus');
    el.textContent = text;
    el.className = 'scan-status' + (kind ? ` ${kind}` : '');
  }

  function handleScan(raw) {
    const code = String(raw || '').trim();
    if (!code) return;
    const item = state.items.find((i) => i.barcode === code || i.barcode === code.replace(/^#/, ''));
    const bin = state.bins.find((b) => b.code.toLowerCase() === code.toLowerCase());

    if (item) pendingItem = item;
    else if (bin) pendingBin = bin;
    else {
      setScanStatus(t('scanUnknown'), 'err');
      renderScanChips();
      return;
    }

    renderScanChips();

    if (pendingItem && pendingBin) {
      pendingItem.bin = pendingBin.code;
      pendingItem.qty += 1;
      const line = `#${pendingItem.barcode} · ${pendingItem.name} · ${pendingBin.code} · +1`;
      state.moves.unshift({ text: line });
      setScanStatus(t('scanOk', pendingItem.name, pendingBin.code, pendingItem.qty), 'ok');
      pendingItem = null;
      pendingBin = null;
      renderScanChips();
      saveState();
      renderAll();
      return;
    }

    setScanStatus(t('scanNeedMore'));
  }

  function renderAll() {
    applyI18n();
    renderKpis();
    renderFeed();
    renderItems();
    renderBins();
    renderQuickCodes();
    renderScanChips();
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function escapeAttr(s) {
    return escapeHtml(s).replace(/'/g, '&#39;');
  }

  document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.page').forEach((p) => p.classList.add('hidden'));
      document.getElementById(`page-${btn.dataset.page}`).classList.remove('hidden');
    });
  });

  document.getElementById('langBtn').addEventListener('click', () => {
    lang = lang === 'en' ? 'ru' : 'en';
    localStorage.setItem('metrika-demo-lang', lang);
    renderAll();
    if (!pendingItem && !pendingBin) setScanStatus(t('scanHint'));
  });

  document.getElementById('resetBtn').addEventListener('click', () => {
    state = seed();
    pendingItem = null;
    pendingBin = null;
    saveState();
    renderAll();
    setScanStatus(t('scanHint'));
  });

  document.getElementById('itemSearch').addEventListener('input', renderItems);

  const scanInput = document.getElementById('scanInput');
  scanInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      handleScan(scanInput.value);
      scanInput.value = '';
    }
  });

  document.getElementById('quickCodes').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-code]');
    if (!btn) return;
    handleScan(btn.dataset.code);
    scanInput.focus();
  });

  renderAll();
  setScanStatus(t('scanHint'));
})();
