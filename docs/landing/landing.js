(function () {
  const cfg = window.METRIKA_SITE || {};
  const THEME_KEY = 'metrika-site-theme';
  const LANG_KEY = 'metrika-lang';

  const I18N = {
    ru: {
      navFeatures: 'Возможности',
      navHow: 'Как работает',
      navAbout: 'О продукте',
      navDemo: 'Открыть демо',
      themeLight: 'Светлая тема',
      themeDark: 'Тёмная тема',
      menu: 'Меню',
      eyebrow: 'Складской учёт / Metrika',
      heroTitle: 'Ваш склад. Под контролем.',
      heroLead: 'Практичная система складского учёта: каталог, штрихкоды, адресные ячейки, операции и аналитика — локально на вашем Windows‑ПК, без обязательного облака.',
      ctaDemo: 'Открыть демо',
      ctaDownload: 'Скачать Metrika',
      chipOffline: 'Offline-first',
      chipSqlite: 'SQLite на ПК',
      chipWin: 'Windows 10/11',
      chipVer: 'Home [0.5]',
      showcaseEyebrow: 'Продукт',
      showcaseTitle: 'Интерфейс реального приложения',
      showcaseLead: 'Превью рабочих мест в визуальном языке Metrika Home. Это не вымышленный UI — иллюстрации повторяют экраны десктоп-сборки.',
      shot1t: 'Обзор склада',
      shot1d: 'KPI, остатки и операционная сводка',
      shot2t: 'Адресное хранение',
      shot2d: 'Склад → подсклад → ячейка и вместимость',
      shot3t: 'Сборка по BOM',
      shot3d: 'Спецификация, резерв и комплектация',
      problemEyebrow: 'Задача',
      problemTitle: 'Когда учёт держится на таблицах',
      problemLead: 'Остатки разъезжаются, поиск занимает минуты, а ячейки существуют только в голове кладовщика.',
      p1t: 'Разрозненные таблицы',
      p1d: 'Несколько файлов Excel и чаты вместо единого источника правды.',
      p2t: 'Неясный остаток',
      p2d: 'Сложно понять, что реально на полке и что уже зарезервировано.',
      p3t: 'Сложный поиск',
      p3d: 'Артикул, штрихкод и название живут в разных местах.',
      p4t: 'Хаотичное хранение',
      p4d: 'Нет карты ячеек — перемещения и ревизии превращаются в ручной обход.',
      solutionEyebrow: 'Решение',
      solutionTitle: 'Структурированный складской контур',
      s1t: 'Единый каталог',
      s1d: 'Товары, коды, категории и доп. поля в одной локальной базе.',
      s2t: 'Адрес и операции',
      s2d: 'Приёмка, расход, перемещение и ревизия с журналом движений.',
      s3t: 'Сканер в работе',
      s3d: 'Режим «товар + ячейка» ускоряет размещение без лишних кликов.',
      s4t: 'Контроль запасов',
      s4d: 'Минимумы, пополнение, ABC/XYZ и сохранённые отчёты.',
      featuresEyebrow: 'Возможности',
      featuresTitle: 'То, что уже реализовано в Home [0.5]',
      featuresLead: 'Только функции из десктоп-приложения — без выдуманных интеграций и «enterprise» обещаний.',
      f1t: 'Каталог и штрихкоды',
      f1d: 'Несколько кодов на позицию, артикулы, вложенные категории, мин./макс. остатки.',
      f2t: 'Адресное хранение',
      f2d: 'Склад → подсклад → карта ячеек с зонами и вместимостью.',
      f3t: 'Складские операции',
      f3d: 'Приёмка, расход, перемещение, пакетные акты и ledger-журнал.',
      f4t: 'Сканер COM',
      f4d: 'Подключение через serialport; товар и ячейка в любом порядке.',
      f5t: 'Ревизия',
      f5d: 'Обход ячеек, факт против учёта, корректировка расхождений.',
      f6t: 'Сборка и резервы',
      f6d: 'BOM, тираж, резерв по ячейкам, комплектация и списание комплекта.',
      f7t: 'Закупки',
      f7d: 'Поставщики, заказы, частичная приёмка и трекинг отправлений.',
      f8t: 'Печать этикеток',
      f8d: 'Code 128, печатные формы и опция ZPL.',
      f9t: 'Аналитика',
      f9d: 'Низкие остатки, ABC/XYZ, покрытие и план пополнения в CSV.',
      flowEyebrow: 'Процесс',
      flowTitle: 'Как Metrika встраивается в ежедневную работу',
      flowLead: 'Ручной, контролируемый контур — приложение не «автоматизирует склад само», а даёт точные инструменты оператору.',
      w1t: 'Регистрация',
      w1d: 'Заводите позицию, коды и категорию.',
      w2t: 'Размещение',
      w2d: 'Кладите на ячейку сканером или вручную.',
      w3t: 'Идентификация',
      w3d: 'Ищите по штрихкоду, SKU, названию, ячейке.',
      w4t: 'Операции',
      w4d: 'Приход, расход, перемещение, ревизия.',
      w5t: 'Контроль',
      w5d: 'Остатки, резервы, пополнение и отчёты.',
      localEyebrow: 'Local-first',
      localTitle: 'Данные остаются на вашем ПК',
      localLead: 'Metrika Home рассчитана на offline-работу: локальная SQLite-база, без обязательного облачного аккаунта. Расширенный контур (организации, документы, локальный CRM/ЭДО) тоже живёт на этой машине.',
      local1: 'Реестр и складские данные в %APPDATA%\\metrika\\',
      local2: 'Ежедневная работа без постоянного интернета',
      local3: 'Бэкап и восстановление полной базы',
      local4: 'Открытые локальные API — только под вашим контролем на этом ПК',
      finalTitle: 'Наведите порядок на складе',
      finalLead: 'Откройте демо на ПК или установите Metrika Home и начните с пустой организации — первого администратора задаёте вы.',
      footAbout: 'Локальный складской учёт для мастерских, лабораторий и небольших складов.',
      footProduct: 'Продукт',
      footResources: 'Ресурсы',
      footDemo: 'Онлайн-демо',
      footDownload: 'Скачать Windows',
      footGithub: 'GitHub',
      footGuide: 'Руководство',
      footArch: 'Архитектура',
      footReleases: 'Релизы',
      copyright: 'Metrika Home. Локальный продукт.',
      demoUnavailable: 'Демо временно недоступно',
    },
    en: {
      navFeatures: 'Features',
      navHow: 'How it works',
      navAbout: 'About',
      navDemo: 'Try demo',
      themeLight: 'Light theme',
      themeDark: 'Dark theme',
      menu: 'Menu',
      eyebrow: 'Inventory / Metrika',
      heroTitle: 'Your inventory. Under control.',
      heroLead: 'A practical inventory system: catalog, barcodes, bin addresses, operations and analytics — local on your Windows PC, with no mandatory cloud account.',
      ctaDemo: 'Try the demo',
      ctaDownload: 'Download Metrika',
      chipOffline: 'Offline-first',
      chipSqlite: 'SQLite on device',
      chipWin: 'Windows 10/11',
      chipVer: 'Home [0.5]',
      showcaseEyebrow: 'Product',
      showcaseTitle: 'The real application interface',
      showcaseLead: 'Workspace previews in Metrika Home’s visual language. Not a fictional UI — illustrations mirror the desktop build.',
      shot1t: 'Warehouse overview',
      shot1d: 'KPIs, stock and operations summary',
      shot2t: 'Address storage',
      shot2d: 'Warehouse → sub-location → bin capacity',
      shot3t: 'BOM assembly',
      shot3d: 'Bill of materials, reserves and kitting',
      problemEyebrow: 'Problem',
      problemTitle: 'When inventory lives in spreadsheets',
      problemLead: 'Quantities drift, search takes minutes, and bin locations exist only in someone’s memory.',
      p1t: 'Scattered sheets',
      p1d: 'Multiple Excel files and chat threads instead of one source of truth.',
      p2t: 'Unclear stock',
      p2d: 'Hard to know what is on the shelf versus already reserved.',
      p3t: 'Difficult search',
      p3d: 'SKU, barcode and name live in different places.',
      p4t: 'Disorganized storage',
      p4d: 'No bin map — moves and stocktakes become manual walks.',
      solutionEyebrow: 'Solution',
      solutionTitle: 'A structured warehouse workflow',
      s1t: 'Unified catalog',
      s1d: 'Items, codes, categories and custom fields in one local database.',
      s2t: 'Bins and operations',
      s2d: 'Receive, issue, transfer and stocktake with a movement ledger.',
      s3t: 'Scanner-ready',
      s3d: 'Item + bin mode speeds putaway without extra clicks.',
      s4t: 'Stock control',
      s4d: 'Minimums, replenishment, ABC/XYZ and saved reports.',
      featuresEyebrow: 'Features',
      featuresTitle: 'What Home [0.5] already ships',
      featuresLead: 'Only capabilities verified in the desktop app — no invented integrations or enterprise claims.',
      f1t: 'Catalog & barcodes',
      f1d: 'Multiple codes per SKU, nested categories, min/max stock.',
      f2t: 'Address storage',
      f2d: 'Warehouse → sub-location → bin map with zones and capacity.',
      f3t: 'Stock operations',
      f3d: 'Receipt, issue, transfer, batch acts and a ledger journal.',
      f4t: 'COM scanner',
      f4d: 'serialport connection; item and bin in any order.',
      f5t: 'Stocktake',
      f5d: 'Walk bins, compare fact vs book, correct variances.',
      f6t: 'Assembly & reserves',
      f6d: 'BOM, runs, cell reserves, kitting and kit write-off.',
      f7t: 'Purchasing',
      f7d: 'Suppliers, POs, partial receiving and shipment tracking.',
      f8t: 'Label printing',
      f8d: 'Code 128, print forms and optional ZPL.',
      f9t: 'Analytics',
      f9d: 'Low stock, ABC/XYZ, coverage and replenishment CSV.',
      flowEyebrow: 'Workflow',
      flowTitle: 'How Metrika fits everyday operations',
      flowLead: 'A controlled, manual workflow — the app does not “run the warehouse for you”; it gives operators precise tools.',
      w1t: 'Register',
      w1d: 'Create the item, codes and category.',
      w2t: 'Place',
      w2d: 'Put away with a scanner or manually.',
      w3t: 'Identify',
      w3d: 'Search by barcode, SKU, name or bin.',
      w4t: 'Operate',
      w4d: 'Receive, issue, transfer, stocktake.',
      w5t: 'Control',
      w5d: 'Stock, reserves, replenishment and reports.',
      localEyebrow: 'Local-first',
      localTitle: 'Your data stays on your PC',
      localLead: 'Metrika Home is built for offline work: a local SQLite database with no mandatory cloud account. Extended modules (organizations, documents, local CRM/EDO) also stay on this machine.',
      local1: 'Registry and warehouse data in %APPDATA%\\metrika\\',
      local2: 'Day-to-day work without a permanent internet link',
      local3: 'Full database backup and restore',
      local4: 'Local APIs only under your control on this PC',
      finalTitle: 'Bring order to your inventory',
      finalLead: 'Open the desktop demo or install Metrika Home and start from an empty organization — you set the first administrator.',
      footAbout: 'Local inventory for workshops, labs and small warehouses.',
      footProduct: 'Product',
      footResources: 'Resources',
      footDemo: 'Online demo',
      footDownload: 'Download Windows',
      footGithub: 'GitHub',
      footGuide: 'User guide',
      footArch: 'Architecture',
      footReleases: 'Releases',
      copyright: 'Metrika Home. Local-first product.',
      demoUnavailable: 'Demo unavailable',
    },
  };

  function detectLang() {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved === 'en' || saved === 'ru') return saved;
    return (navigator.language || '').toLowerCase().startsWith('en') ? 'en' : 'ru';
  }

  function detectTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  let lang = detectLang();
  let theme = detectTheme();

  function t(key) {
    return (I18N[lang] && I18N[lang][key]) || I18N.ru[key] || key;
  }

  function applyTheme(next) {
    theme = next === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(THEME_KEY, theme);
    const btn = document.getElementById('themeToggle');
    if (btn) {
      btn.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
      btn.setAttribute('aria-label', theme === 'dark' ? t('themeLight') : t('themeDark'));
      btn.title = theme === 'dark' ? t('themeLight') : t('themeDark');
    }
  }

  function applyLang(next) {
    lang = next === 'en' ? 'en' : 'ru';
    document.documentElement.lang = lang;
    document.documentElement.setAttribute('data-lang', lang);
    localStorage.setItem(LANG_KEY, lang);
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.getAttribute('data-i18n');
      if (key) el.textContent = t(key);
    });
    document.querySelectorAll('[data-i18n-aria]').forEach((el) => {
      const key = el.getAttribute('data-i18n-aria');
      if (key) el.setAttribute('aria-label', t(key));
    });
    document.querySelectorAll('.lang-switch button').forEach((btn) => {
      btn.setAttribute('aria-pressed', btn.getAttribute('data-lang') === lang ? 'true' : 'false');
    });
    applyTheme(theme);
    document.title = lang === 'en'
      ? 'Metrika Home — local warehouse inventory for Windows'
      : 'Metrika Home — локальный складской учёт для Windows';
  }

  function wireCtas() {
    const demoEnabled = cfg.demoEnabled !== false && !!cfg.demoUrl;
    document.querySelectorAll('[data-cta="demo"]').forEach((el) => {
      if (!demoEnabled) {
        el.setAttribute('aria-disabled', 'true');
        el.href = '#';
        el.addEventListener('click', (e) => {
          e.preventDefault();
          alert(t('demoUnavailable'));
        });
        return;
      }
      el.href = cfg.demoUrl;
    });
    document.querySelectorAll('[data-cta="download"]').forEach((el) => {
      el.href = cfg.downloadUrl || cfg.releasesUrl || '#';
    });
    document.querySelectorAll('[data-href="github"]').forEach((el) => { el.href = cfg.githubUrl || '#'; });
    document.querySelectorAll('[data-href="docs"]').forEach((el) => { el.href = cfg.docsUrl || '#'; });
    document.querySelectorAll('[data-href="arch"]').forEach((el) => { el.href = cfg.architectureUrl || '#'; });
    document.querySelectorAll('[data-href="releases"]').forEach((el) => { el.href = cfg.releasesUrl || '#'; });
    document.querySelectorAll('[data-text="version"]').forEach((el) => {
      el.textContent = cfg.version || '';
    });
    document.querySelectorAll('[data-text="versionLabel"]').forEach((el) => {
      el.textContent = cfg.versionLabel || cfg.version || '';
    });
    document.querySelectorAll('[data-text="year"]').forEach((el) => {
      el.textContent = String(cfg.year || new Date().getFullYear());
    });
  }

  function wireNav() {
    const nav = document.getElementById('siteNav');
    const toggle = document.getElementById('navToggle');
    if (toggle && nav) {
      toggle.addEventListener('click', () => {
        const open = nav.classList.toggle('is-open');
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
      nav.querySelectorAll('.nav-links a').forEach((a) => {
        a.addEventListener('click', () => {
          nav.classList.remove('is-open');
          toggle.setAttribute('aria-expanded', 'false');
        });
      });
    }
    document.getElementById('themeToggle')?.addEventListener('click', () => {
      applyTheme(theme === 'dark' ? 'light' : 'dark');
    });
    document.querySelectorAll('.lang-switch button').forEach((btn) => {
      btn.addEventListener('click', () => applyLang(btn.getAttribute('data-lang')));
    });
  }

  function wireReveal() {
    const nodes = document.querySelectorAll('.reveal');
    if (!nodes.length) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      nodes.forEach((n) => n.classList.add('is-in'));
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    nodes.forEach((n) => io.observe(n));
  }

  applyTheme(theme);
  applyLang(lang);
  wireCtas();
  wireNav();
  wireReveal();
})();
