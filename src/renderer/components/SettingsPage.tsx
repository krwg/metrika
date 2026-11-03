import { useEffect, useState } from 'react';
import { useI18n } from '../i18n';
import { notifyCurrencyChanged } from '../currency';
import PrintFormBuilder from './PrintFormBuilder';

type Props = { theme: string; onTheme: (theme: string) => void; onNotice: (message: string) => void; onReload: () => void };

const THEMES: { id: string; labelKey: string; groupKey: string }[] = [
  { id: 'light', labelKey: 'themeLight', groupKey: 'themeGroupBase' },
  { id: 'dark', labelKey: 'themeDark', groupKey: 'themeGroupBase' },
  { id: 'oled', labelKey: 'themeOled', groupKey: 'themeGroupExtra' },
  { id: 'aurora', labelKey: 'themeAurora', groupKey: 'themeGroupExtra' },
  { id: '1c-light', labelKey: 'theme1cLight', groupKey: 'themeGroup1c' },
  { id: '1c-dark', labelKey: 'theme1cDark', groupKey: 'themeGroup1c' },
];

const ALLOWED_THEMES = new Set(THEMES.map((t) => t.id));

const DEFAULT_PRINT = {
  barcodeType: 'code128',
  labelWidthMm: 60,
  labelHeightMm: 40,
  showName: true,
  showSku: true,
  showUnit: true,
  showPrice: true,
  copies: 1,
  docsAct: true,
  docsWaybill: true,
  docsReceipt: true,
  docsWorkOrder: true,
};

type PrintSettings = typeof DEFAULT_PRINT;

const SECTIONS = [
  { id: 'appearance', labelKey: 'appearance', hintRu: 'Тема и язык', hintEn: 'Theme and language' },
  { id: 'scanner', labelKey: 'scannerSection', hintRu: 'Порт и поведение', hintEn: 'Port and behavior' },
  { id: 'print', labelKey: 'printForms', hintRu: 'Этикетки и документы', hintEn: 'Labels and documents' },
  { id: 'printBuilder', labelKey: 'printBuilder', hintRu: 'ГОСТ и свои шаблоны', hintEn: 'GOST and custom templates' },
  { id: 'docSeries', labelKey: 'docSeries', hintRu: 'Серии, сброс, подписи статусов', hintEn: 'Series, reset, status labels' },
  { id: 'sku', labelKey: 'skuRules', hintRu: 'Правила генерации', hintEn: 'Generation rules' },
  { id: 'customFields', labelKey: 'customFields', hintRu: 'Доп. поля объектов ERP', hintEn: 'ERP object custom fields' },
  { id: 'workspace', labelKey: 'workspace', hintRu: 'Списки и фильтры', hintEn: 'Lists and filters' },
  { id: 'currency', labelKey: 'currencyStock', hintRu: 'Валюта, макс. остатки, сроки', hintEn: 'Currency, caps, expiry' },
  { id: 'automation', labelKey: 'automation', hintRu: 'Правила если → то', hintEn: 'If → then rules' },
  { id: 'integrations', labelKey: 'integrations', hintRu: 'MIAPI REST и входящие webhooks', hintEn: 'MIAPI REST and inbound webhooks' },
  { id: 'backup', labelKey: 'backup', hintRu: 'Экспорт и импорт БД', hintEn: 'Export and import DB' },
];

type SeriesRow = {
  doc_type: string;
  label: string;
  prefix: string;
  pad: number;
  period: string;
  include_period: number | boolean;
  last_seq?: number;
  preview?: string;
};

export default function SettingsPage({ theme, onTheme, onNotice, onReload }: Props) {
  const { locale, setLocale, t } = useI18n();
  const [section, setSection] = useState('appearance');
  const [baudRate, setBaudRate] = useState('9600');
  const [scannerSound, setScannerSound] = useState('on');
  const [autoConnect, setAutoConnect] = useState('on');
  const [skuPad, setSkuPad] = useState('4');
  const [skuSeparator, setSkuSeparator] = useState('-');
  const [skuUseCategory, setSkuUseCategory] = useState('on');
  const [pageSize, setPageSize] = useState('50');
  const [compactFilters, setCompactFilters] = useState('on');
  const [print, setPrint] = useState<PrintSettings>(DEFAULT_PRINT);
  const [backupKeep, setBackupKeep] = useState('30');
  const [backupInterval, setBackupInterval] = useState('6');
  const [autoBackups, setAutoBackups] = useState<{ dir: string; items: any[] }>({ dir: '', items: [] });
  const [diagnose, setDiagnose] = useState<any | null>(null);
  const [diagnoseBusy, setDiagnoseBusy] = useState(false);
  const [series, setSeries] = useState<SeriesRow[]>([]);
  const [seriesBusy, setSeriesBusy] = useState(false);
  const [currencyCode, setCurrencyCode] = useState('RUB');
  const [currencySymbol, setCurrencySymbol] = useState('₽');
  const [warnOverMax, setWarnOverMax] = useState('on');
  const [expiryWarnDays, setExpiryWarnDays] = useState('30');
  const [reserveStaleDays, setReserveStaleDays] = useState('7');
  const [reserveAutoRelease, setReserveAutoRelease] = useState('off');
  const [statusDraft, setStatusDraft] = useState('Черновик');
  const [statusPosted, setStatusPosted] = useState('Проведён');
  const [statusCancelled, setStatusCancelled] = useState('Отменён');
  const [statusBusy, setStatusBusy] = useState(false);
  const [workflowExtras, setWorkflowExtras] = useState<Array<{ code: string; label: string; maps_to: string }>>([]);
  const [wfDraft, setWfDraft] = useState({ code: '', label: '', maps_to: 'draft' });
  const [customFields, setCustomFields] = useState<any[]>([]);
  const [cfEntity, setCfEntity] = useState<'item' | 'counterparty' | 'employee' | 'document'>('item');
  const [cfBusy, setCfBusy] = useState(false);
  const emptyCfForm = {
    id: 0,
    label: '',
    field_key: '',
    field_type: 'text',
    required: false,
    options_text: '',
    formula: '',
    sort_order: '0',
  };
  const [cfForm, setCfForm] = useState({ ...emptyCfForm });
  const [autoRules, setAutoRules] = useState<any[]>([]);
  const [autoLog, setAutoLog] = useState<any[]>([]);
  const [autoMeta, setAutoMeta] = useState<{ triggers: any[]; actions: any[] }>({ triggers: [], actions: [] });
  const [autoScheduler, setAutoScheduler] = useState<{
    running?: boolean; interval_minutes?: number; last_run_at?: string | null; last_fired?: number;
  }>({});
  const emptyAutoForm = {
    id: 0, name: '', trigger_type: 'stock_below_min', action_type: 'notify',
    enabled: true, cooldown_minutes: 120, message: '', webhook_url: '', webhook_secret: '',
  };
  const [autoForm, setAutoForm] = useState({ ...emptyAutoForm });
  const [autoIntervalDraft, setAutoIntervalDraft] = useState(15);
  const [miapiStatus, setMiapiStatus] = useState<any>(null);
  const [miapiPort, setMiapiPortDraft] = useState('47832');
  const [miapiSecret, setMiapiSecret] = useState('');
  const [miapiTokens, setMiapiTokens] = useState<any[]>([]);
  const [miapiTokenLabel, setMiapiTokenLabel] = useState('');
  const [miapiIssued, setMiapiIssued] = useState<string | null>(null);
  const [miapiBusy, setMiapiBusy] = useState(false);

  async function loadAutomation() {
    try {
      const [meta, rules, log, sched] = await Promise.all([
        (window as any).api.automationMeta(),
        (window as any).api.listAutomationRules(),
        (window as any).api.listAutomationLog(40),
        (window as any).api.automationSchedulerStatus?.() ?? Promise.resolve(null),
      ]);
      setAutoMeta(meta || { triggers: [], actions: [] });
      setAutoRules(rules || []);
      setAutoLog(log || []);
      if (sched) {
        setAutoScheduler(sched);
        setAutoIntervalDraft(Number(sched.interval_minutes) || 15);
      }
    } catch (e: any) {
      onNotice(e?.message || (locale === 'ru' ? 'Не удалось загрузить правила' : 'Could not load rules'));
    }
  }

  async function refreshAutoBackups() {
    try {
      const list = await (window as any).api.listAutoBackups();
      setAutoBackups({ dir: list?.dir || '', items: list?.items || [] });
    } catch {
      setAutoBackups({ dir: '', items: [] });
    }
  }

  async function loadSeries() {
    try {
      const rows = await (window as any).api.listDocumentSeries();
      setSeries(Array.isArray(rows) ? rows : []);
    } catch (e: any) {
      onNotice(e?.message || (locale === 'ru' ? 'Не удалось загрузить серии' : 'Could not load series'));
      setSeries([]);
    }
  }

  async function loadCustomFields(entity = cfEntity) {
    try {
      setCustomFields((await (window as any).api.listCustomFields?.({ includeArchived: false, entity })) || []);
    } catch (e: any) {
      onNotice(e?.message || (locale === 'ru' ? 'Не удалось загрузить доп. поля' : 'Could not load custom fields'));
      setCustomFields([]);
    }
  }

  async function loadMiapi() {
    try {
      const [st, tokens] = await Promise.all([
        (window as any).api.miapiStatus?.(),
        (window as any).api.miapiListTokens?.(),
      ]);
      setMiapiStatus(st);
      if (st?.port) setMiapiPortDraft(String(st.port));
      setMiapiTokens(tokens || []);
    } catch (e: any) {
      onNotice(e?.message || (locale === 'ru' ? 'Не удалось загрузить MIAPI' : 'Could not load MIAPI'));
    }
  }

  useEffect(() => {
    try {
      const want = sessionStorage.getItem('metrika.settings.section');
      if (want && SECTIONS.some((s) => s.id === want)) {
        setSection(want);
        sessionStorage.removeItem('metrika.settings.section');
      }
    } catch {  }
  }, []);

  useEffect(() => {
    if (section === 'docSeries') void loadSeries();
    if (section === 'customFields') void loadCustomFields(cfEntity);
    if (section === 'automation') void loadAutomation();
    if (section === 'integrations') void loadMiapi();
  }, [section, cfEntity]);

  function updateSeriesRow(docType: string, patch: Partial<SeriesRow>) {
    setSeries((prev) => prev.map((row) => (row.doc_type === docType ? { ...row, ...patch, preview: undefined } : row)));
  }

  function livePreview(row: SeriesRow) {
    const pad = Math.min(8, Math.max(2, Number(row.pad) || 4));
    const prefix = String(row.prefix || 'DOC').toUpperCase().replace(/[^A-Z0-9\-]/g, '').slice(0, 12) || 'DOC';
    const seq = String((Number(row.last_seq) || 0) + 1).padStart(pad, '0');
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const key = row.period === 'year' ? String(y) : row.period === 'month' ? `${y}${m}` : '';
    if (row.include_period && key) return `${prefix}-${key}-${seq}`;
    return `${prefix}-${seq}`;
  }

  async function saveSeries() {
    setSeriesBusy(true);
    try {
      const saved = await (window as any).api.saveDocumentSeries(series.map((row) => ({
        doc_type: row.doc_type,
        label: row.label,
        prefix: row.prefix,
        pad: row.pad,
        period: row.period,
        include_period: Boolean(row.include_period),
      })));
      setSeries(Array.isArray(saved) ? saved : series);
      onNotice(locale === 'ru' ? 'Серии нумерации сохранены' : 'Document series saved');
    } catch (e: any) {
      onNotice(e?.message || (locale === 'ru' ? 'Не удалось сохранить серии' : 'Could not save series'));
    } finally {
      setSeriesBusy(false);
    }
  }

  async function resetSeries(docType: string) {
    const label = series.find((r) => r.doc_type === docType)?.label || docType;
    if (!window.confirm(locale === 'ru'
      ? `Сбросить счётчик серии «${label}»? Следующий номер начнётся с 1.`
      : `Reset counter for “${label}”? Next number will start from 1.`)) return;
    setSeriesBusy(true);
    try {
      const result = await (window as any).api.resetDocumentSeries(docType);
      await loadSeries();
      onNotice(locale === 'ru'
        ? `Счётчик сброшен. Следующий: ${result?.preview || '—'}`
        : `Counter reset. Next: ${result?.preview || '—'}`);
    } catch (e: any) {
      onNotice(e?.message || (locale === 'ru' ? 'Не удалось сбросить' : 'Could not reset'));
    } finally {
      setSeriesBusy(false);
    }
  }

  useEffect(() => {
    (async () => {
      setBaudRate((await (window as any).api.getSetting('baudRate', '9600')) || '9600');
      setScannerSound((await (window as any).api.getSetting('scannerSound', 'on')) || 'on');
      setAutoConnect((await (window as any).api.getSetting('scannerAutoConnect', 'on')) || 'on');
      setSkuPad((await (window as any).api.getSetting('sku.pad', '4')) || '4');
      setSkuSeparator((await (window as any).api.getSetting('sku.separator', '-')) || '-');
      setSkuUseCategory((await (window as any).api.getSetting('sku.useCategoryPrefix', 'on')) || 'on');
      setPageSize((await (window as any).api.getSetting('ui.pageSize', '50')) || '50');
      setCompactFilters((await (window as any).api.getSetting('ui.compactFilters', 'on')) || 'on');
      setBackupKeep((await (window as any).api.getSetting('backup.keep', '30')) || '30');
      setBackupInterval((await (window as any).api.getSetting('backup.intervalHours', '6')) || '6');
      setCurrencyCode((await (window as any).api.getSetting('currency.code', 'RUB')) || 'RUB');
      setCurrencySymbol((await (window as any).api.getSetting('currency.symbol', '₽')) || '₽');
      setWarnOverMax((await (window as any).api.getSetting('stock.warn_over_max', 'on')) || 'on');
      setExpiryWarnDays((await (window as any).api.getSetting('stock.expiry_warn_days', '30')) || '30');
      setReserveStaleDays((await (window as any).api.getSetting('stock.reserve_stale_days', '7')) || '7');
      setReserveAutoRelease((await (window as any).api.getSetting('stock.reserve_auto_release', 'off')) || 'off');
      try {
        const raw = await (window as any).api.getSetting('docs.status_labels', '');
        const parsed = raw ? JSON.parse(raw) : {};
        if (parsed.draft) setStatusDraft(String(parsed.draft));
        if (parsed.posted) setStatusPosted(String(parsed.posted));
        if (parsed.cancelled) setStatusCancelled(String(parsed.cancelled));
      } catch {  }
      try {
        const extras = await (window as any).api.listDocumentWorkflowExtras?.();
        if (Array.isArray(extras)) setWorkflowExtras(extras);
        else {
          const raw = await (window as any).api.getSetting('docs.workflow_extras', '[]');
          setWorkflowExtras(raw ? JSON.parse(raw) : []);
        }
      } catch { setWorkflowExtras([]); }
      try {
        const raw = await (window as any).api.getSetting('print.forms', JSON.stringify(DEFAULT_PRINT));
        setPrint({ ...DEFAULT_PRINT, ...JSON.parse(raw || '{}') });
      } catch {
        setPrint(DEFAULT_PRINT);
      }
      const savedTheme = await (window as any).api.getSetting('theme', 'light');
      if (savedTheme && !ALLOWED_THEMES.has(savedTheme)) {
        onTheme('1c-light');
        await (window as any).api.setSetting('theme', '1c-light');
      }
      await refreshAutoBackups();
    })();
  }, []);

  async function save(key: string, value: string, message: string) {
    await (window as any).api.setSetting(key, value);
    onNotice(message);
  }

  async function saveTheme(value: string) {
    onTheme(value);
    await (window as any).api.setSetting('theme', value);
    onNotice(locale === 'ru' ? 'Тема сохранена' : 'Theme saved');
  }

  async function savePrint(next: PrintSettings) {
    setPrint(next);
    await (window as any).api.setSetting('print.forms', JSON.stringify(next));
    onNotice(locale === 'ru' ? 'Настройки печати сохранены' : 'Print settings saved');
  }

  async function backup() {
    const file = await (window as any).api.createBackup();
    if (file) onNotice(locale === 'ru' ? `Резервная копия создана: ${file}` : `Backup created: ${file}`);
  }

  async function restore() {
    try {
      const safetyCopy = await (window as any).api.restoreBackup();
      if (safetyCopy) { onNotice(locale === 'ru' ? `База восстановлена. Текущая копия: ${safetyCopy}` : `Database restored. Safety copy: ${safetyCopy}`); onReload(); }
    } catch (restoreError: any) {
      onNotice(restoreError?.message || (locale === 'ru' ? 'Не удалось восстановить базу данных' : 'Could not restore database'));
    }
  }

  const groups = [...new Set(THEMES.map((entry) => entry.groupKey))];
  const currentSection = SECTIONS.find((entry) => entry.id === section);

  return <>
    <div className="page-header">
      <div>
        <div className="section-label">{t('settings')}</div>
        <h1>{t('settings')}</h1>
        <p>{t('settingsIntro')}</p>
      </div>
    </div>

    <div className="settings-layout settings-1c">
      <nav className="settings-nav card">
        <div className="settings-nav-title">{locale === 'ru' ? 'Разделы' : 'Sections'}</div>
        {SECTIONS.map((entry) => (
          <button key={entry.id} type="button" className={`settings-nav-item ${section === entry.id ? 'active' : ''}`} onClick={() => setSection(entry.id)}>
            <span className="settings-nav-label">{t(entry.labelKey)}</span>
            <span className="settings-nav-hint">{locale === 'ru' ? entry.hintRu : entry.hintEn}</span>
          </button>
        ))}
      </nav>

      <div className="settings-content">
        <div className="settings-panel-header card">
          <div>
            <div className="section-label">{locale === 'ru' ? 'Раздел' : 'Section'}</div>
            <h2>{currentSection ? t(currentSection.labelKey) : ''}</h2>
          </div>
          <span className="settings-panel-meta">{currentSection ? (locale === 'ru' ? currentSection.hintRu : currentSection.hintEn) : ''}</span>
        </div>

        {section === 'appearance' && (
          <section className="card settings-card">
            <div className="section-label">{t('language')}</div>
            <div className="theme-options theme-options-grid" style={{ marginBottom: 18 }}>
              <button type="button" className={`theme-option ${locale === 'ru' ? 'selected' : ''}`} onClick={() => { setLocale('ru'); onNotice('Язык: русский'); }}>{t('russian')}</button>
              <button type="button" className={`theme-option ${locale === 'en' ? 'selected' : ''}`} onClick={() => { setLocale('en'); onNotice('Language: English'); }}>{t('english')}</button>
            </div>
            {groups.map((groupKey) => (
              <div key={groupKey} className="settings-theme-group">
                <div className="section-label">{t(groupKey)}</div>
                <div className="theme-options theme-options-grid">
                  {THEMES.filter((option) => option.groupKey === groupKey).map((option) => (
                    <button key={option.id} type="button" className={`theme-option ${theme === option.id ? 'selected' : ''}`} onClick={() => saveTheme(option.id)}>
                      <span className={`theme-swatch theme-swatch-${option.id}`} />
                      {t(option.labelKey)}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </section>
        )}

        {section === 'scanner' && (
          <section className="card settings-card">
            <div className="form-grid">
              <label>{t('baudRate')}
                <select value={baudRate} onChange={(event) => setBaudRate(event.target.value)}>
                  <option value="9600">9600</option>
                  <option value="19200">19200</option>
                  <option value="38400">38400</option>
                  <option value="115200">115200</option>
                </select>
              </label>
              <label>{locale === 'ru' ? 'Звук подтверждения' : 'Confirmation sound'}
                <select value={scannerSound} onChange={(event) => { setScannerSound(event.target.value); save('scannerSound', event.target.value, locale === 'ru' ? 'Звук сканера сохранён' : 'Scanner sound saved'); }}>
                  <option value="on">{locale === 'ru' ? 'Включён' : 'On'}</option>
                  <option value="off">{locale === 'ru' ? 'Выключен' : 'Off'}</option>
                </select>
              </label>
              <label>{locale === 'ru' ? 'Автоподключение к последнему порту' : 'Auto-connect last port'}
                <select value={autoConnect} onChange={(event) => { setAutoConnect(event.target.value); save('scannerAutoConnect', event.target.value, locale === 'ru' ? 'Автоподключение сохранено' : 'Auto-connect saved'); }}>
                  <option value="on">{locale === 'ru' ? 'Включено' : 'On'}</option>
                  <option value="off">{locale === 'ru' ? 'Выключено' : 'Off'}</option>
                </select>
              </label>
            </div>
            <button className="btn btn-primary" onClick={() => save('baudRate', baudRate, locale === 'ru' ? 'Скорость сканера сохранена' : 'Baud rate saved')}>{t('save')}</button>
          </section>
        )}

        {section === 'print' && (
          <section className="card settings-card">
            <div className="form-grid">
              <label>{locale === 'ru' ? 'Тип штрихкода на этикетке' : 'Label barcode type'}
                <select value={print.barcodeType} onChange={(event) => savePrint({ ...print, barcodeType: event.target.value })}>
                  <option value="code128">Code 128</option>
                  <option value="qrcode">QR Code</option>
                  <option value="datamatrix">Data Matrix</option>
                  <option value="ean13">EAN-13</option>
                  <option value="code39">Code 39</option>
                </select>
              </label>
              <label>{locale === 'ru' ? 'Ширина этикетки, мм' : 'Label width, mm'}
                <input type="number" min="20" max="120" value={print.labelWidthMm} onChange={(event) => savePrint({ ...print, labelWidthMm: Number(event.target.value) || 60 })} />
              </label>
              <label>{locale === 'ru' ? 'Высота этикетки, мм' : 'Label height, mm'}
                <input type="number" min="15" max="100" value={print.labelHeightMm} onChange={(event) => savePrint({ ...print, labelHeightMm: Number(event.target.value) || 40 })} />
              </label>
              <label>{locale === 'ru' ? 'Копий на штрихкод' : 'Copies per barcode'}
                <input type="number" min="1" max="20" value={print.copies} onChange={(event) => savePrint({ ...print, copies: Math.max(1, Number(event.target.value) || 1) })} />
              </label>
              <label>{locale === 'ru' ? 'Показывать название' : 'Show name'}
                <select value={print.showName ? 'on' : 'off'} onChange={(event) => savePrint({ ...print, showName: event.target.value === 'on' })}>
                  <option value="on">{locale === 'ru' ? 'Да' : 'Yes'}</option>
                  <option value="off">{locale === 'ru' ? 'Нет' : 'No'}</option>
                </select>
              </label>
              <label>{t('showSku')}
                <select value={print.showSku ? 'on' : 'off'} onChange={(event) => savePrint({ ...print, showSku: event.target.value === 'on' })}>
                  <option value="on">{locale === 'ru' ? 'Да' : 'Yes'}</option>
                  <option value="off">{locale === 'ru' ? 'Нет' : 'No'}</option>
                </select>
              </label>
              <label>{locale === 'ru' ? 'Показывать цену' : 'Show price'}
                <select value={print.showPrice !== false ? 'on' : 'off'} onChange={(event) => savePrint({ ...print, showPrice: event.target.value === 'on' })}>
                  <option value="on">{locale === 'ru' ? 'Да' : 'Yes'}</option>
                  <option value="off">{locale === 'ru' ? 'Нет' : 'No'}</option>
                </select>
              </label>
            </div>
            <div className="section-label" style={{ marginTop: 18 }}>{locale === 'ru' ? 'Документы склада (какие формы предлагать)' : 'Warehouse documents (available forms)'}</div>
            <div className="settings-check-grid">
              {[
                ['docsAct', locale === 'ru' ? 'Акт (МХ / М-11) и опись ИНВ-3' : 'Act (MH / M-11) and INV-3'],
                ['docsWaybill', locale === 'ru' ? 'Накладная (М-15)' : 'Waybill (M-15)'],
                ['docsReceipt', locale === 'ru' ? 'Чек / квитанция' : 'Receipt'],
                ['docsWorkOrder', locale === 'ru' ? 'Заказ / заказ-наряд' : 'Order / work order'],
              ].map(([key, label]) => (
                <label key={key} className="settings-check">
                  <input type="checkbox" checked={Boolean((print as any)[key])} onChange={(event) => savePrint({ ...print, [key]: event.target.checked })} />
                  {label}
                </label>
              ))}
            </div>
          </section>
        )}

        {section === 'printBuilder' && (
          <section className="card settings-card" style={{ padding: 16 }}>
            <PrintFormBuilder onNotice={onNotice} />
          </section>
        )}

        {section === 'docSeries' && (
          <section className="card settings-card">
            <p>
              {locale === 'ru'
                ? 'Префикс, разрядность и период сброса номера для PO, ревизий, заказ-нарядов и складских актов. Превью — следующий номер после сохранения.'
                : 'Prefix, padding and reset period for PO, revisions, work orders and stock acts. Preview shows the next number after save.'}
            </p>
            <div className="table-scroll" style={{ marginTop: 12 }}>
              <table className="series-table">
                <thead>
                  <tr>
                    <th>{locale === 'ru' ? 'Документ' : 'Document'}</th>
                    <th>{locale === 'ru' ? 'Префикс' : 'Prefix'}</th>
                    <th>{locale === 'ru' ? 'Разрядность' : 'Pad'}</th>
                    <th>{locale === 'ru' ? 'Период' : 'Period'}</th>
                    <th>{locale === 'ru' ? 'Период в номере' : 'Include period'}</th>
                    <th>{locale === 'ru' ? 'Превью' : 'Preview'}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {series.map((row) => (
                    <tr key={row.doc_type}>
                      <td className="strong">{row.label}</td>
                      <td>
                        <input
                          value={row.prefix}
                          maxLength={12}
                          onChange={(e) => updateSeriesRow(row.doc_type, { prefix: e.target.value.toUpperCase() })}
                          style={{ width: 88 }}
                        />
                      </td>
                      <td>
                        <select
                          value={String(row.pad || 4)}
                          onChange={(e) => updateSeriesRow(row.doc_type, { pad: Number(e.target.value) || 4 })}
                        >
                          {[2, 3, 4, 5, 6].map((n) => (
                            <option key={n} value={n}>{n}</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <select
                          value={row.period || 'none'}
                          onChange={(e) => updateSeriesRow(row.doc_type, { period: e.target.value })}
                        >
                          <option value="none">{locale === 'ru' ? 'Без сброса' : 'No reset'}</option>
                          <option value="year">{locale === 'ru' ? 'Год' : 'Year'}</option>
                          <option value="month">{locale === 'ru' ? 'Месяц' : 'Month'}</option>
                        </select>
                      </td>
                      <td>
                        <input
                          type="checkbox"
                          checked={Boolean(row.include_period)}
                          disabled={row.period === 'none'}
                          onChange={(e) => updateSeriesRow(row.doc_type, { include_period: e.target.checked })}
                        />
                      </td>
                      <td><code>{row.preview ?? livePreview(row)}</code></td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-text"
                          disabled={seriesBusy}
                          onClick={() => void resetSeries(row.doc_type)}
                        >
                          {locale === 'ru' ? 'Сброс' : 'Reset'}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {series.length === 0 && (
                    <tr>
                      <td colSpan={7} className="subtext">
                        {locale === 'ru' ? 'Серии не загружены' : 'No series loaded'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="settings-actions" style={{ marginTop: 14 }}>
              <button type="button" className="btn btn-primary" disabled={seriesBusy || !series.length} onClick={() => void saveSeries()}>
                {locale === 'ru' ? 'Сохранить серии' : 'Save series'}
              </button>
              <button type="button" className="btn btn-secondary" disabled={seriesBusy} onClick={() => void loadSeries()}>
                {locale === 'ru' ? 'Обновить' : 'Reload'}
              </button>
            </div>

            <h3 style={{ margin: '24px 0 8px', fontSize: 15 }}>
              {locale === 'ru' ? 'Подписи статусов реестра' : 'Registry status labels'}
            </h3>
            <p className="subtext" style={{ marginTop: 0 }}>
              {locale === 'ru'
                ? 'Коды draft / posted / cancelled не меняются — только отображаемые названия в журнале документов. Проведение и отмена работают по кодам.'
                : 'Codes draft / posted / cancelled stay the same — only display names in the document journal. Posting and cancel still use the codes.'}
            </p>
            <div className="form-grid" style={{ marginTop: 8 }}>
              <label>{locale === 'ru' ? 'Черновик (draft)' : 'Draft'}
                <input value={statusDraft} onChange={(e) => setStatusDraft(e.target.value)} maxLength={40} />
              </label>
              <label>{locale === 'ru' ? 'Проведён (posted)' : 'Posted'}
                <input value={statusPosted} onChange={(e) => setStatusPosted(e.target.value)} maxLength={40} />
              </label>
              <label>{locale === 'ru' ? 'Отменён (cancelled)' : 'Cancelled'}
                <input value={statusCancelled} onChange={(e) => setStatusCancelled(e.target.value)} maxLength={40} />
              </label>
            </div>
            <div className="settings-actions" style={{ marginTop: 12 }}>
              <button
                type="button"
                className="btn btn-primary"
                disabled={statusBusy || !statusDraft.trim() || !statusPosted.trim() || !statusCancelled.trim()}
                onClick={async () => {
                  setStatusBusy(true);
                  try {
                    const payload = JSON.stringify({
                      draft: statusDraft.trim(),
                      posted: statusPosted.trim(),
                      cancelled: statusCancelled.trim(),
                    });
                    await (window as any).api.setSetting('docs.status_labels', payload);
                    onNotice(locale === 'ru' ? 'Подписи статусов сохранены' : 'Status labels saved');
                  } catch (e: any) {
                    onNotice(e?.message || (locale === 'ru' ? 'Не удалось сохранить' : 'Could not save'));
                  } finally {
                    setStatusBusy(false);
                  }
                }}
              >
                {locale === 'ru' ? 'Сохранить подписи' : 'Save labels'}
              </button>
            </div>

            <h3 style={{ margin: '24px 0 8px', fontSize: 15 }}>
              {locale === 'ru' ? 'Свои workflow-статусы' : 'Custom workflow statuses'}
            </h3>
            <p className="subtext" style={{ marginTop: 0 }}>
              {locale === 'ru'
                ? 'Дополнительные статусы поверх draft/posted/cancelled. Проведение и отмена по-прежнему по системным кодам; workflow — для согласования и отображения в журнале.'
                : 'Extra statuses on top of draft/posted/cancelled. Posting/cancel still use system codes; workflow is for review labels in the journal.'}
            </p>
            <div className="table-scroll" style={{ marginTop: 8 }}>
              <table>
                <thead>
                  <tr>
                    <th>{locale === 'ru' ? 'Код' : 'Code'}</th>
                    <th>{locale === 'ru' ? 'Название' : 'Label'}</th>
                    <th>{locale === 'ru' ? 'База' : 'Maps to'}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {workflowExtras.length === 0 && (
                    <tr>
                      <td colSpan={4} className="subtext" style={{ textAlign: 'center', padding: 16 }}>
                        {locale === 'ru' ? 'Пока нет своих статусов' : 'No custom statuses'}
                      </td>
                    </tr>
                  )}
                  {workflowExtras.map((row) => (
                    <tr key={row.code}>
                      <td className="mono">{row.code}</td>
                      <td>{row.label}</td>
                      <td>{row.maps_to}</td>
                      <td className="row-actions">
                        <button
                          type="button"
                          className="btn btn-text"
                          disabled={statusBusy}
                          onClick={async () => {
                            const next = workflowExtras.filter((x) => x.code !== row.code);
                            setStatusBusy(true);
                            try {
                              await (window as any).api.setSetting('docs.workflow_extras', JSON.stringify(next));
                              setWorkflowExtras(next);
                              onNotice(locale === 'ru' ? 'Статус удалён' : 'Status removed');
                            } catch (e: any) {
                              onNotice(e?.message || 'Error');
                            } finally {
                              setStatusBusy(false);
                            }
                          }}
                        >
                          {locale === 'ru' ? 'Удалить' : 'Delete'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="form-grid" style={{ marginTop: 12 }}>
              <label>{locale === 'ru' ? 'Код' : 'Code'}
                <input
                  value={wfDraft.code}
                  onChange={(e) => setWfDraft({ ...wfDraft, code: e.target.value })}
                  placeholder="on_review"
                  maxLength={32}
                />
              </label>
              <label>{locale === 'ru' ? 'Название' : 'Label'}
                <input
                  value={wfDraft.label}
                  onChange={(e) => setWfDraft({ ...wfDraft, label: e.target.value })}
                  placeholder={locale === 'ru' ? 'На согласовании' : 'On review'}
                  maxLength={48}
                />
              </label>
              <label>{locale === 'ru' ? 'Базовый статус' : 'Base status'}
                <select value={wfDraft.maps_to} onChange={(e) => setWfDraft({ ...wfDraft, maps_to: e.target.value })}>
                  <option value="draft">draft</option>
                  <option value="posted">posted</option>
                  <option value="cancelled">cancelled</option>
                </select>
              </label>
            </div>
            <div className="settings-actions" style={{ marginTop: 12 }}>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={statusBusy || !wfDraft.code.trim() || !wfDraft.label.trim()}
                onClick={async () => {
                  const code = wfDraft.code.trim().toLowerCase().replace(/[^a-z0-9_а-яё]+/gi, '_').replace(/^_+|_+$/g, '');
                  if (!code || ['draft', 'posted', 'cancelled'].includes(code)) {
                    onNotice(locale === 'ru' ? 'Недопустимый код' : 'Invalid code');
                    return;
                  }
                  const next = [
                    ...workflowExtras.filter((x) => x.code !== code),
                    { code, label: wfDraft.label.trim(), maps_to: wfDraft.maps_to || 'draft' },
                  ];
                  setStatusBusy(true);
                  try {
                    await (window as any).api.setSetting('docs.workflow_extras', JSON.stringify(next));
                    setWorkflowExtras(next);
                    setWfDraft({ code: '', label: '', maps_to: 'draft' });
                    onNotice(locale === 'ru' ? 'Workflow-статус сохранён' : 'Workflow status saved');
                  } catch (e: any) {
                    onNotice(e?.message || 'Error');
                  } finally {
                    setStatusBusy(false);
                  }
                }}
              >
                {locale === 'ru' ? 'Добавить / обновить' : 'Add / update'}
              </button>
            </div>
          </section>
        )}

        {section === 'sku' && (
          <section className="card settings-card">
            <div className="form-grid">
              <label>{locale === 'ru' ? 'Разрядность номера' : 'Number padding'}
                <select value={skuPad} onChange={(event) => { setSkuPad(event.target.value); save('sku.pad', event.target.value, locale === 'ru' ? 'Разрядность сохранена' : 'Padding saved'); }}>
                  <option value="3">3 (001)</option>
                  <option value="4">4 (0001)</option>
                  <option value="5">5 (00001)</option>
                  <option value="6">6 (000001)</option>
                </select>
              </label>
              <label>{locale === 'ru' ? 'Разделитель' : 'Separator'}
                <select value={skuSeparator} onChange={(event) => { setSkuSeparator(event.target.value); save('sku.separator', event.target.value, locale === 'ru' ? 'Разделитель сохранён' : 'Separator saved'); }}>
                  <option value="-">{locale === 'ru' ? 'Дефис' : 'Hyphen'} (MCU-0001)</option>
                  <option value="_">{locale === 'ru' ? 'Подчёркивание' : 'Underscore'} (MCU_0001)</option>
                  <option value="">{locale === 'ru' ? 'Без разделителя' : 'None'} (MCU0001)</option>
                </select>
              </label>
              <label>{locale === 'ru' ? 'Приоритет префикса категории' : 'Category prefix priority'}
                <select value={skuUseCategory} onChange={(event) => { setSkuUseCategory(event.target.value); save('sku.useCategoryPrefix', event.target.value, locale === 'ru' ? 'Правило префикса сохранено' : 'Prefix rule saved'); }}>
                  <option value="on">{locale === 'ru' ? 'Сначала префикс категории' : 'Category prefix first'}</option>
                  <option value="off">{locale === 'ru' ? 'Только по названию' : 'Name heuristic only'}</option>
                </select>
              </label>
            </div>
          </section>
        )}

        {section === 'customFields' && (
          <section className="card settings-card">
            <p>
              {locale === 'ru'
                ? 'Динамические реквизиты объектов ERP (не отдельный справочник). Товары — с формулами; контрагенты / сотрудники / документы — text/number/date/bool/select.'
                : 'Dynamic ERP attributes (not a parallel catalog). Items support formulas; counterparties / employees / documents: text/number/date/bool/select.'}
            </p>
            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              {([
                ['item', 'Товары', 'Items'],
                ['counterparty', 'Контрагенты', 'Counterparties'],
                ['employee', 'Сотрудники', 'Employees'],
                ['document', 'Документы', 'Documents'],
              ] as const).map(([id, ru, en]) => (
                <button
                  key={id}
                  type="button"
                  className={`btn ${cfEntity === id ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => {
                    setCfEntity(id);
                    setCfForm({ ...emptyCfForm, field_type: 'text' });
                  }}
                >
                  {locale === 'ru' ? ru : en}
                </button>
              ))}
            </div>
            <div className="form-grid" style={{ marginTop: 12 }}>
              <label>{locale === 'ru' ? 'Название' : 'Label'}
                <input value={cfForm.label} onChange={(e) => setCfForm({ ...cfForm, label: e.target.value })} placeholder={locale === 'ru' ? 'Цвет жилы' : 'Wire color'} />
              </label>
              <label>{locale === 'ru' ? 'Ключ (латиница)' : 'Key'}
                <input
                  value={cfForm.field_key}
                  onChange={(e) => setCfForm({ ...cfForm, field_key: e.target.value })}
                  placeholder="wire_color"
                  disabled={Boolean(cfForm.id)}
                />
              </label>
              <label>{locale === 'ru' ? 'Тип' : 'Type'}
                <select value={cfForm.field_type} onChange={(e) => setCfForm({ ...cfForm, field_type: e.target.value, required: e.target.value === 'formula' ? false : cfForm.required })}>
                  <option value="text">{locale === 'ru' ? 'Текст' : 'Text'}</option>
                  <option value="number">{locale === 'ru' ? 'Число' : 'Number'}</option>
                  <option value="date">{locale === 'ru' ? 'Дата' : 'Date'}</option>
                  <option value="bool">{locale === 'ru' ? 'Да / нет' : 'Yes/No'}</option>
                  <option value="select">{locale === 'ru' ? 'Список' : 'Select'}</option>
                  {cfEntity === 'item' && <option value="formula">{locale === 'ru' ? 'Формула' : 'Formula'}</option>}
                </select>
              </label>
              <label>{locale === 'ru' ? 'Порядок' : 'Order'}
                <input type="number" min="0" value={cfForm.sort_order} onChange={(e) => setCfForm({ ...cfForm, sort_order: e.target.value })} />
              </label>
              {cfForm.field_type !== 'formula' && (
                <label className="field-wide" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="checkbox" checked={cfForm.required} onChange={(e) => setCfForm({ ...cfForm, required: e.target.checked })} />
                  {locale === 'ru' ? 'Обязательное' : 'Required'}
                </label>
              )}
              {cfForm.field_type === 'select' && (
                <label className="field-wide">{locale === 'ru' ? 'Варианты (через запятую или с новой строки)' : 'Options (comma or newline)'}
                  <textarea value={cfForm.options_text} onChange={(e) => setCfForm({ ...cfForm, options_text: e.target.value })} rows={3} />
                </label>
              )}
              {cfForm.field_type === 'formula' && (
                <label className="field-wide">
                  {locale === 'ru' ? 'Формула' : 'Formula'}
                  <input
                    value={cfForm.formula}
                    onChange={(e) => setCfForm({ ...cfForm, formula: e.target.value })}
                    placeholder="round(cost_price * 1.2, 2)"
                  />
                  <span className="subtext">
                    {locale === 'ru'
                      ? 'Поля карточки: cost_price, sale_price, min_stock, max_stock, reorder_point, package_qty, on_hand, available… Другие доп. поля — по ключу или {ключ}.'
                      : 'Card fields: cost_price, sale_price, min_stock… Other custom fields by key or {key}.'}
                  </span>
                </label>
              )}
            </div>
            <div className="settings-actions" style={{ marginTop: 12 }}>
              <button
                type="button"
                className="btn btn-primary"
                disabled={cfBusy || !cfForm.label.trim() || (cfForm.field_type === 'formula' && !cfForm.formula.trim())}
                onClick={async () => {
                  setCfBusy(true);
                  try {
                    await (window as any).api.saveCustomField({
                      id: cfForm.id || undefined,
                      entity: cfEntity,
                      label: cfForm.label.trim(),
                      field_key: cfForm.field_key.trim() || undefined,
                      field_type: cfForm.field_type,
                      required: cfForm.required,
                      options_text: cfForm.options_text,
                      formula: cfForm.formula,
                      sort_order: Number(cfForm.sort_order) || 0,
                    });
                    setCfForm({ ...emptyCfForm });
                    await loadCustomFields(cfEntity);
                    onNotice(locale === 'ru' ? 'Поле сохранено' : 'Field saved');
                  } catch (e: any) {
                    onNotice(e?.message || (locale === 'ru' ? 'Не удалось сохранить поле' : 'Could not save field'));
                  } finally {
                    setCfBusy(false);
                  }
                }}
              >
                {cfForm.id ? (locale === 'ru' ? 'Обновить поле' : 'Update field') : (locale === 'ru' ? 'Добавить поле' : 'Add field')}
              </button>
              {cfForm.id ? (
                <button
                  type="button"
                  className="btn btn-text"
                  onClick={() => setCfForm({ ...emptyCfForm })}
                >
                  {locale === 'ru' ? 'Сброс формы' : 'Reset'}
                </button>
              ) : null}
            </div>

            <div className="table-scroll" style={{ marginTop: 16 }}>
              <table>
                <thead>
                  <tr>
                    <th>{locale === 'ru' ? 'Название' : 'Label'}</th>
                    <th>{locale === 'ru' ? 'Ключ' : 'Key'}</th>
                    <th>{locale === 'ru' ? 'Тип' : 'Type'}</th>
                    <th>{locale === 'ru' ? 'Обяз.' : 'Req.'}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {customFields.map((field) => (
                    <tr key={field.id}>
                      <td className="strong">{field.label}</td>
                      <td className="mono">{field.field_key}</td>
                      <td>{field.field_type}</td>
                      <td>{field.required ? '✓' : '—'}</td>
                      <td>
                        <div className="row-actions">
                          <button
                            type="button"
                            className="btn btn-text"
                            onClick={() => {
                              let optionsText = '';
                              try {
                                const opts = JSON.parse(field.options_json || '[]');
                                if (Array.isArray(opts)) optionsText = opts.join(', ');
                              } catch {  }
                              setCfForm({
                                id: Number(field.id),
                                label: field.label || '',
                                field_key: field.field_key || '',
                                field_type: field.field_type || 'text',
                                required: Boolean(field.required),
                                options_text: optionsText,
                                formula: field.formula || '',
                                sort_order: String(field.sort_order ?? 0),
                              });
                            }}
                          >
                            {locale === 'ru' ? 'Изменить' : 'Edit'}
                          </button>
                          <button
                            type="button"
                            className="btn btn-danger"
                            disabled={cfBusy}
                            onClick={async () => {
                              if (!window.confirm(locale === 'ru'
                                ? `Архивировать поле «${field.label}»? Значения сохранятся, поле исчезнет из карточки.`
                                : `Archive “${field.label}”? Values stay, field leaves the card.`)) return;
                              setCfBusy(true);
                              try {
                                await (window as any).api.archiveCustomField(field.id);
                                await loadCustomFields(cfEntity);
                                onNotice(locale === 'ru' ? 'Поле в архиве' : 'Field archived');
                              } catch (e: any) {
                                onNotice(e?.message || (locale === 'ru' ? 'Не удалось архивировать' : 'Could not archive'));
                              } finally {
                                setCfBusy(false);
                              }
                            }}
                          >
                            {locale === 'ru' ? 'В архив' : 'Archive'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {customFields.length === 0 && (
                    <tr>
                      <td colSpan={5} className="subtext">{locale === 'ru' ? 'Полей пока нет' : 'No fields yet'}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {section === 'workspace' && (
          <section className="card settings-card">
            <div className="form-grid">
              <label>{locale === 'ru' ? 'Размер страницы в подборе' : 'Picker page size'}
                <select value={pageSize} onChange={(event) => { setPageSize(event.target.value); save('ui.pageSize', event.target.value, locale === 'ru' ? 'Размер страницы сохранён' : 'Page size saved'); }}>
                  <option value="25">25</option>
                  <option value="50">50</option>
                  <option value="100">100</option>
                  <option value="200">200</option>
                </select>
              </label>
              <label>{locale === 'ru' ? 'Компактные фильтры по умолчанию' : 'Compact filters by default'}
                <select value={compactFilters} onChange={(event) => { setCompactFilters(event.target.value); save('ui.compactFilters', event.target.value, locale === 'ru' ? 'Режим фильтров сохранён' : 'Filter mode saved'); }}>
                  <option value="on">{locale === 'ru' ? 'Свёрнутая панель' : 'Collapsed'}</option>
                  <option value="off">{locale === 'ru' ? 'Всегда раскрыта' : 'Always expanded'}</option>
                </select>
              </label>
            </div>
          </section>
        )}

        {section === 'currency' && (
          <section className="card settings-card">
            <p className="subtext">{locale === 'ru'
              ? 'Валюта учёта, максимальные остатки, срок годности партий и политика зависших резервов. Максимум задаётся в карточке товара; пополнение не предлагает сверх лимита.'
              : 'Organization currency, max-stock, lot expiry and hung-reserve policy. Cap is set on the item card; replenishment will not suggest above the limit.'}</p>
            <div className="form-grid">
              <label>{locale === 'ru' ? 'Код валюты' : 'Currency code'}
                <select value={currencyCode} onChange={(event) => {
                  const code = event.target.value;
                  setCurrencyCode(code);
                  const preset = ({ RUB: '₽', USD: '$', EUR: '€', KZT: '₸', BYN: 'Br' } as Record<string, string>)[code];
                  if (preset) setCurrencySymbol(preset);
                }}>
                  <option value="RUB">RUB — рубль</option>
                  <option value="USD">USD — доллар</option>
                  <option value="EUR">EUR — евро</option>
                  <option value="KZT">KZT — тенге</option>
                  <option value="BYN">BYN — бел. рубль</option>
                  <option value="OTHER">{locale === 'ru' ? 'Другая' : 'Other'}</option>
                </select>
              </label>
              <label>{locale === 'ru' ? 'Символ в интерфейсе' : 'Display symbol'}
                <input value={currencySymbol} onChange={(event) => setCurrencySymbol(event.target.value)} maxLength={4} placeholder="₽" />
              </label>
              <label>{locale === 'ru' ? 'Подсветка сверх максимума' : 'Highlight over max'}
                <select value={warnOverMax} onChange={(event) => setWarnOverMax(event.target.value)}>
                  <option value="on">{locale === 'ru' ? 'Включена' : 'On'}</option>
                  <option value="off">{locale === 'ru' ? 'Выключена' : 'Off'}</option>
                </select>
              </label>
              <label>{locale === 'ru' ? 'Предупреждать о сроке, дн.' : 'Expiry warn window, days'}
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={expiryWarnDays}
                  onChange={(event) => setExpiryWarnDays(event.target.value)}
                />
              </label>
              <label>{locale === 'ru' ? 'Резерв «зависший» через, дн.' : 'Reserve stale after, days'}
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={reserveStaleDays}
                  onChange={(event) => setReserveStaleDays(event.target.value)}
                  title={locale === 'ru' ? 'Если заказ-наряд без движения дольше этого срока — в Центре качества как зависший' : 'Work orders idle longer than this appear as hung in Quality'}
                />
              </label>
              <label>{locale === 'ru' ? 'Автоснятие зависших резервов' : 'Auto-release hung reserves'}
                <select value={reserveAutoRelease} onChange={(event) => setReserveAutoRelease(event.target.value)}>
                  <option value="off">{locale === 'ru' ? 'Выкл. (только вручную)' : 'Off (manual only)'}</option>
                  <option value="on">{locale === 'ru' ? 'Вкл. при проверке качества' : 'On (during health check)'}</option>
                </select>
              </label>
            </div>
            <p className="subtext" style={{ marginTop: 8 }}>
              {locale === 'ru'
                ? 'Автоснятие возвращает заказ-наряд в черновик и освобождает резерв. Включается осторожно — лучше сначала смотреть список в Центре качества.'
                : 'Auto-release returns the work order to draft and frees stock. Prefer reviewing hung reserves in Quality first.'}
            </p>
            <button
              className="btn btn-primary"
              type="button"
              onClick={async () => {
                const days = String(Math.min(365, Math.max(1, Number(expiryWarnDays) || 30)));
                const stale = String(Math.min(365, Math.max(1, Number(reserveStaleDays) || 7)));
                setExpiryWarnDays(days);
                setReserveStaleDays(stale);
                await save('currency.code', currencyCode, '');
                await save('currency.symbol', currencySymbol.trim() || '₽', '');
                await save('stock.warn_over_max', warnOverMax, '');
                await save('stock.expiry_warn_days', days, '');
                await save('stock.reserve_stale_days', stale, '');
                await save('stock.reserve_auto_release', reserveAutoRelease === 'on' ? 'on' : 'off',
                  locale === 'ru' ? 'Валюта, остатки и политика резервов сохранены' : 'Currency, stock and reserve policies saved');
                notifyCurrencyChanged();
              }}
            >{t('save')}</button>
          </section>
        )}

        {section === 'automation' && (
          <section className="card settings-card">
            <p>{locale === 'ru'
              ? 'Правила «если → то»: низкий/нулевой остаток, сроки партий, просрочки WO/PO, зависшие резервы, входящий webhook MIAPI. Срабатывают после складских операций, по интервалу планировщика, при входе и по POST /v1/webhooks/incoming. Действие Webhook — исходящий HTTP POST.'
              : 'If→then rules: low/zero stock, lot expiry, overdue WO/PO, stale reserves, MIAPI inbound webhook. Fired after stock ops, on scheduler, on login, and via POST /v1/webhooks/incoming. Webhook action is outbound HTTP POST.'}</p>
            <div className="form-grid" style={{ marginBottom: 16, alignItems: 'end' }}>
              <label>{locale === 'ru' ? 'Интервал планировщика (мин)' : 'Scheduler interval (min)'}
                <input
                  type="number"
                  min={1}
                  max={1440}
                  value={autoIntervalDraft}
                  onChange={(e) => setAutoIntervalDraft(Number(e.target.value) || 15)}
                />
              </label>
              <div className="settings-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={async () => {
                    try {
                      const st = await (window as any).api.setAutomationInterval(autoIntervalDraft);
                      setAutoScheduler(st || {});
                      setAutoIntervalDraft(Number(st?.interval_minutes) || autoIntervalDraft);
                      onNotice(locale === 'ru'
                        ? `Планировщик: каждые ${st?.interval_minutes || autoIntervalDraft} мин`
                        : `Scheduler: every ${st?.interval_minutes || autoIntervalDraft} min`);
                    } catch (e: any) {
                      onNotice(e?.message || 'Ошибка');
                    }
                  }}
                >
                  {locale === 'ru' ? 'Сохранить интервал' : 'Save interval'}
                </button>
              </div>
              <p className="muted span-2" style={{ margin: 0 }}>
                {locale === 'ru'
                  ? `Статус: ${autoScheduler.running ? 'работает' : 'остановлен'} · последний прогон: ${autoScheduler.last_run_at || '—'} · сработало: ${autoScheduler.last_fired ?? '—'}`
                  : `Status: ${autoScheduler.running ? 'running' : 'stopped'} · last run: ${autoScheduler.last_run_at || '—'} · fired: ${autoScheduler.last_fired ?? '—'}`}
              </p>
            </div>
            <div className="settings-actions" style={{ marginBottom: 12 }}>
              <button type="button" className="btn btn-secondary" onClick={() => void loadAutomation()}>
                {locale === 'ru' ? 'Обновить' : 'Refresh'}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={async () => {
                  try {
                    const fired = await (window as any).api.runScheduledAutomations();
                    onNotice(locale === 'ru'
                      ? `Проверка выполнена · сработало: ${Array.isArray(fired) ? fired.length : 0}`
                      : `Check done · fired: ${Array.isArray(fired) ? fired.length : 0}`);
                    await loadAutomation();
                    onReload();
                  } catch (e: any) {
                    onNotice(e?.message || 'Ошибка');
                  }
                }}
              >
                {locale === 'ru' ? 'Проверить сейчас' : 'Run check now'}
              </button>
            </div>

            <div className="section-label">{locale === 'ru' ? 'Правила' : 'Rules'}</div>
            <div className="table-scroll" style={{ marginBottom: 16 }}>
              <table>
                <thead>
                  <tr>
                    <th>{locale === 'ru' ? 'Название' : 'Name'}</th>
                    <th>{locale === 'ru' ? 'Если' : 'If'}</th>
                    <th>{locale === 'ru' ? 'То' : 'Then'}</th>
                    <th>{locale === 'ru' ? 'Пауза, мин' : 'Cooldown, m'}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {autoRules.length === 0 ? (
                    <tr><td colSpan={5} className="muted">{locale === 'ru' ? 'Нет правил' : 'No rules'}</td></tr>
                  ) : autoRules.map((rule) => (
                    <tr key={rule.id} className={rule.enabled ? '' : 'is-muted'}>
                      <td>{rule.name}{!rule.enabled ? ' · off' : ''}</td>
                      <td>{autoMeta.triggers.find((t) => t.id === rule.trigger_type)?.label || rule.trigger_type}</td>
                      <td>{autoMeta.actions.find((a) => a.id === rule.action_type)?.label || rule.action_type}</td>
                      <td>{rule.cooldown_minutes}</td>
                      <td>
                        <button type="button" className="btn btn-secondary" onClick={() => setAutoForm({
                          id: rule.id,
                          name: rule.name,
                          trigger_type: rule.trigger_type,
                          action_type: rule.action_type,
                          enabled: Boolean(rule.enabled),
                          cooldown_minutes: Number(rule.cooldown_minutes) || 60,
                          message: rule.action?.message || '',
                          webhook_url: rule.action?.url || rule.action?.webhook_url || '',
                          webhook_secret: rule.action?.secret || '',
                        })}>{locale === 'ru' ? 'Изменить' : 'Edit'}</button>{' '}
                        <button type="button" className="btn btn-secondary" onClick={async () => {
                          if (!window.confirm(locale === 'ru' ? 'Удалить правило?' : 'Delete rule?')) return;
                          await (window as any).api.deleteAutomationRule(rule.id);
                          await loadAutomation();
                        }}>{locale === 'ru' ? 'Удалить' : 'Delete'}</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="section-label">{autoForm.id ? (locale === 'ru' ? 'Редактирование' : 'Edit') : (locale === 'ru' ? 'Новое правило' : 'New rule')}</div>
            <form
              className="form-grid"
              onSubmit={async (event) => {
                event.preventDefault();
                try {
                  const action: any = { message: autoForm.message || undefined, level: 'warn' };
                  if (autoForm.action_type === 'webhook') {
                    action.url = autoForm.webhook_url.trim();
                    if (autoForm.webhook_secret.trim()) action.secret = autoForm.webhook_secret.trim();
                  }
                  await (window as any).api.saveAutomationRule({
                    id: autoForm.id || undefined,
                    name: autoForm.name,
                    trigger_type: autoForm.trigger_type,
                    action_type: autoForm.action_type,
                    enabled: autoForm.enabled,
                    cooldown_minutes: autoForm.cooldown_minutes,
                    action,
                  });
                  setAutoForm({ ...emptyAutoForm });
                  await loadAutomation();
                  onNotice(locale === 'ru' ? 'Правило сохранено' : 'Rule saved');
                } catch (e: any) {
                  onNotice(e?.message || 'Ошибка');
                }
              }}
            >
              <label className="span-2">{locale === 'ru' ? 'Название' : 'Name'}
                <input value={autoForm.name} onChange={(e) => setAutoForm({ ...autoForm, name: e.target.value })} required />
              </label>
              <label>{locale === 'ru' ? 'Если' : 'If'}
                <select value={autoForm.trigger_type} onChange={(e) => setAutoForm({ ...autoForm, trigger_type: e.target.value })}>
                  {(autoMeta.triggers.length ? autoMeta.triggers : [
                    { id: 'stock_below_min', label: 'Остаток ≤ минимума' },
                    { id: 'stock_zero', label: 'Остаток = 0' },
                    { id: 'lot_expiring', label: 'Партия истекает' },
                    { id: 'wo_overdue', label: 'Просрочен WO' },
                    { id: 'po_overdue', label: 'Просрочен PO' },
                    { id: 'reserve_stale', label: 'Зависший резерв' },
                  ]).map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </label>
              <label>{locale === 'ru' ? 'То' : 'Then'}
                <select value={autoForm.action_type} onChange={(e) => setAutoForm({ ...autoForm, action_type: e.target.value })}>
                  {(autoMeta.actions.length ? autoMeta.actions : [
                    { id: 'notify', label: 'Уведомление' },
                    { id: 'desktop_notify', label: 'Системное уведомление' },
                    { id: 'audit', label: 'Журнал действий' },
                    { id: 'webhook', label: 'Webhook (HTTP POST)' },
                  ]).map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
                </select>
              </label>
              <label>{locale === 'ru' ? 'Пауза (мин)' : 'Cooldown (min)'}
                <input type="number" min={0} max={1440} value={autoForm.cooldown_minutes}
                  onChange={(e) => setAutoForm({ ...autoForm, cooldown_minutes: Number(e.target.value) || 0 })} />
              </label>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="checkbox" checked={autoForm.enabled} onChange={(e) => setAutoForm({ ...autoForm, enabled: e.target.checked })} />
                {locale === 'ru' ? 'Включено' : 'Enabled'}
              </label>
              <label className="span-2">{locale === 'ru' ? 'Текст уведомления (необязательно)' : 'Message (optional)'}
                <input value={autoForm.message} onChange={(e) => setAutoForm({ ...autoForm, message: e.target.value })}
                  placeholder={locale === 'ru' ? 'По умолчанию — автотекст события' : 'Default: event text'} />
              </label>
              {autoForm.action_type === 'webhook' ? (
                <>
                  <label className="span-2">{locale === 'ru' ? 'URL webhook (http/https)' : 'Webhook URL (http/https)'}
                    <input
                      value={autoForm.webhook_url}
                      onChange={(e) => setAutoForm({ ...autoForm, webhook_url: e.target.value })}
                      placeholder="https://example.com/hooks/metrika"
                      required
                    />
                  </label>
                  <label className="span-2">{locale === 'ru' ? 'Секрет (заголовок X-Metrika-Secret, необяз.)' : 'Secret (X-Metrika-Secret header, optional)'}
                    <input
                      type="password"
                      value={autoForm.webhook_secret}
                      onChange={(e) => setAutoForm({ ...autoForm, webhook_secret: e.target.value })}
                      autoComplete="off"
                    />
                  </label>
                </>
              ) : null}
              <div className="modal-actions span-2">
                {autoForm.id ? (
                  <button type="button" className="btn btn-secondary" onClick={() => setAutoForm({ ...emptyAutoForm })}>
                    {locale === 'ru' ? 'Сброс' : 'Reset'}
                  </button>
                ) : null}
                <button type="submit" className="btn btn-primary">{locale === 'ru' ? 'Сохранить правило' : 'Save rule'}</button>
              </div>
            </form>

            <div className="section-label" style={{ marginTop: 20 }}>{locale === 'ru' ? 'Журнал срабатываний' : 'Fire log'}</div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>{locale === 'ru' ? 'Когда' : 'When'}</th>
                    <th>{locale === 'ru' ? 'Правило' : 'Rule'}</th>
                    <th>{locale === 'ru' ? 'Деталь' : 'Detail'}</th>
                  </tr>
                </thead>
                <tbody>
                  {autoLog.length === 0 ? (
                    <tr><td colSpan={3} className="muted">{locale === 'ru' ? 'Пока пусто' : 'Empty'}</td></tr>
                  ) : autoLog.map((row) => (
                    <tr key={row.id}>
                      <td>{row.created_at}</td>
                      <td>{row.rule_name || row.rule_id}</td>
                      <td>{row.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {section === 'integrations' && (
          <section className="card settings-card">
            <p>{locale === 'ru'
              ? 'MIAPI — HTTP REST организации: чтение номенклатуры/остатков/документов и входящие webhooks. Отдельно от CRM RemoteHttp (портал клиента).'
              : 'MIAPI — org HTTP REST: read items/stock/documents and inbound webhooks. Separate from CRM RemoteHttp (client portal).'}</p>
            <div className="form-grid" style={{ marginBottom: 16, alignItems: 'end' }}>
              <div>
                <div className="section-label">{locale === 'ru' ? 'Статус' : 'Status'}</div>
                <p>{miapiStatus?.listening
                  ? (locale === 'ru' ? 'Слушает' : 'Listening')
                  : (locale === 'ru' ? 'Выключен' : 'Off')}</p>
                <p className="muted" style={{ fontSize: 13 }}>{miapiStatus?.note}</p>
                {(miapiStatus?.urls || []).map((u: string) => (
                  <p key={u} style={{ fontFamily: 'ui-monospace, monospace', fontSize: 13 }}>{u}</p>
                ))}
              </div>
              <label>{locale === 'ru' ? 'Порт' : 'Port'}
                <input value={miapiPort} onChange={(e) => setMiapiPortDraft(e.target.value)} inputMode="numeric" />
              </label>
              <div className="settings-actions">
                <button type="button" className="btn btn-secondary" disabled={miapiBusy} onClick={async () => {
                  setMiapiBusy(true);
                  try {
                    const st = await (window as any).api.miapiSetPort?.(Number(miapiPort));
                    setMiapiStatus(st);
                    onNotice(locale === 'ru' ? `Порт: ${st?.port}` : `Port: ${st?.port}`);
                  } catch (e: any) { onNotice(e?.message || 'Error'); }
                  finally { setMiapiBusy(false); }
                }}>{locale === 'ru' ? 'Сохранить порт' : 'Save port'}</button>
                {!miapiStatus?.listening ? (
                  <button type="button" className="btn btn-primary" disabled={miapiBusy} onClick={async () => {
                    setMiapiBusy(true);
                    try {
                      const st = await (window as any).api.miapiStart?.(Number(miapiPort) || undefined);
                      setMiapiStatus(st);
                      onNotice(st?.note || 'MIAPI');
                    } catch (e: any) { onNotice(e?.message || 'Error'); }
                    finally { setMiapiBusy(false); }
                  }}>{locale === 'ru' ? 'Запустить' : 'Start'}</button>
                ) : (
                  <button type="button" className="btn btn-secondary" disabled={miapiBusy} onClick={async () => {
                    setMiapiBusy(true);
                    try {
                      setMiapiStatus(await (window as any).api.miapiStop?.());
                      onNotice(locale === 'ru' ? 'MIAPI остановлен' : 'MIAPI stopped');
                    } catch (e: any) { onNotice(e?.message || 'Error'); }
                    finally { setMiapiBusy(false); }
                  }}>{locale === 'ru' ? 'Остановить' : 'Stop'}</button>
                )}
                <button type="button" className="btn btn-secondary" onClick={() => void loadMiapi()}>{locale === 'ru' ? 'Обновить' : 'Refresh'}</button>
              </div>
            </div>

            <div className="section-label" style={{ marginTop: 8 }}>{locale === 'ru' ? 'Входящий webhook' : 'Inbound webhook'}</div>
            <p className="muted" style={{ fontSize: 13, marginBottom: 8 }}>
              POST /v1/webhooks/incoming · заголовок X-Metrika-Secret или Bearer API-токен · триггер автоматизации «incoming_webhook»
            </p>
            <div className="form-grid" style={{ alignItems: 'end', marginBottom: 16 }}>
              <label className="span-2">{locale === 'ru' ? 'Секрет webhook' : 'Webhook secret'}
                <input
                  value={miapiSecret}
                  onChange={(e) => setMiapiSecret(e.target.value)}
                  placeholder={miapiStatus?.webhook_secret_set ? '•••• (задан)' : ''}
                  autoComplete="off"
                />
              </label>
              <button type="button" className="btn btn-secondary" disabled={miapiBusy} onClick={async () => {
                setMiapiBusy(true);
                try {
                  const st = await (window as any).api.miapiSetWebhookSecret?.(miapiSecret);
                  setMiapiStatus(st);
                  setMiapiSecret('');
                  onNotice(locale === 'ru' ? 'Секрет сохранён' : 'Secret saved');
                } catch (e: any) { onNotice(e?.message || 'Error'); }
                finally { setMiapiBusy(false); }
              }}>{locale === 'ru' ? 'Сохранить секрет' : 'Save secret'}</button>
            </div>

            <div className="section-label">{locale === 'ru' ? 'API-токены' : 'API tokens'}</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
              <input
                placeholder={locale === 'ru' ? 'Метка токена' : 'Token label'}
                value={miapiTokenLabel}
                onChange={(e) => setMiapiTokenLabel(e.target.value)}
                style={{ minWidth: 160 }}
              />
              <button type="button" className="btn btn-primary" disabled={miapiBusy} onClick={async () => {
                setMiapiBusy(true);
                try {
                  const row = await (window as any).api.miapiIssueToken?.(miapiTokenLabel || undefined);
                  setMiapiIssued(row?.token || null);
                  setMiapiTokenLabel('');
                  onNotice(row?.note || 'OK');
                  await loadMiapi();
                } catch (e: any) { onNotice(e?.message || 'Error'); }
                finally { setMiapiBusy(false); }
              }}>{locale === 'ru' ? 'Выдать токен' : 'Issue token'}</button>
            </div>
            {miapiIssued && (
              <div className="notice-bar" role="status" style={{ marginBottom: 12 }}>
                {locale === 'ru' ? 'Новый токен (сохраните сейчас):' : 'New token (save now):'}{' '}
                <code style={{ userSelect: 'all' }}>{miapiIssued}</code>
              </div>
            )}
            <table className="data-table">
              <thead>
                <tr>
                  <th>{locale === 'ru' ? 'Префикс' : 'Prefix'}</th>
                  <th>{locale === 'ru' ? 'Метка' : 'Label'}</th>
                  <th>{locale === 'ru' ? 'Создан' : 'Created'}</th>
                  <th>{locale === 'ru' ? 'Статус' : 'Status'}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {miapiTokens.map((t) => (
                  <tr key={t.id}>
                    <td><code>{t.token_prefix}</code></td>
                    <td>{t.label || '—'}</td>
                    <td>{t.created_at}</td>
                    <td>{t.revoked_at ? (locale === 'ru' ? 'отозван' : 'revoked') : (locale === 'ru' ? 'активен' : 'active')}</td>
                    <td>
                      {!t.revoked_at && (
                        <button type="button" className="btn btn-secondary" disabled={miapiBusy} onClick={async () => {
                          setMiapiBusy(true);
                          try {
                            await (window as any).api.miapiRevokeToken?.(t.id);
                            onNotice(locale === 'ru' ? 'Токен отозван' : 'Token revoked');
                            await loadMiapi();
                          } catch (e: any) { onNotice(e?.message || 'Error'); }
                          finally { setMiapiBusy(false); }
                        }}>{locale === 'ru' ? 'Отозвать' : 'Revoke'}</button>
                      )}
                    </td>
                  </tr>
                ))}
                {!miapiTokens.length && (
                  <tr><td colSpan={5} className="muted">{locale === 'ru' ? 'Нет токенов' : 'No tokens'}</td></tr>
                )}
              </tbody>
            </table>
            <details style={{ marginTop: 16 }}>
              <summary className="muted">{locale === 'ru' ? 'Маршруты' : 'Endpoints'}</summary>
              <ul style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12 }}>
                {(miapiStatus?.endpoints || []).map((e: string) => <li key={e}>{e}</li>)}
              </ul>
            </details>

            <hr style={{ margin: '24px 0', border: 0, borderTop: '1px solid var(--border)' }} />
            <div className="section-label">CommerceML / маркетплейсы</div>
            <div className="settings-actions" style={{ marginBottom: 12 }}>
              <button type="button" className="btn btn-primary" onClick={async () => {
                try {
                  const r = await (window as any).api.exportCommerceMl?.();
                  if (!r?.canceled) onNotice(locale === 'ru' ? `CommerceML: ${r?.path} (${r?.items} поз.)` : `CommerceML: ${r?.path}`);
                } catch (e: any) { onNotice(e?.message || 'Error'); }
              }}>{locale === 'ru' ? 'Экспорт в 1С (CommerceML)' : 'Export CommerceML'}</button>
              <button type="button" className="btn btn-secondary" onClick={async () => {
                try {
                  const r = await (window as any).api.importMarketplaceOrders?.();
                  if (!r?.canceled) onNotice(locale === 'ru' ? `Импорт заказов: ${r?.created}` : `Imported: ${r?.created}`);
                } catch (e: any) { onNotice(e?.message || 'Error'); }
              }}>{locale === 'ru' ? 'Импорт заказов (CSV/JSON)' : 'Import orders'}</button>
              <button type="button" className="btn btn-secondary" onClick={async () => {
                try {
                  await (window as any).api.saveExchangeChannel?.({ kind: 'ozon', name: 'Ozon', enabled: 1, config: {} });
                  onNotice(locale === 'ru' ? 'Канал Ozon создан (настройте импорт файлом)' : 'Ozon channel created');
                } catch (e: any) { onNotice(e?.message || 'Error'); }
              }}>+ Ozon</button>
              <button type="button" className="btn btn-secondary" onClick={async () => {
                try {
                  await (window as any).api.saveExchangeChannel?.({ kind: 'wildberries', name: 'Wildberries', enabled: 1, config: {} });
                  onNotice('Wildberries');
                } catch (e: any) { onNotice(e?.message || 'Error'); }
              }}>+ WB</button>
            </div>

            <div className="section-label">{locale === 'ru' ? 'Устройства' : 'Devices'}</div>
            <div className="form-grid" style={{ marginBottom: 16 }}>
              <label>{locale === 'ru' ? 'Этикетки' : 'Labels'}
                <select
                  defaultValue="os"
                  onChange={async (e) => {
                    try {
                      await (window as any).api.saveDeviceSettings?.({ label_printer: { mode: e.target.value } });
                      onNotice(e.target.value === 'zpl' ? 'ZPL' : 'OS print');
                    } catch (err: any) { onNotice(err?.message || 'Error'); }
                  }}
                >
                  <option value="os">OS / Windows</option>
                  <option value="zpl">ZPL (COM/файл)</option>
                </select>
              </label>
              <label>{locale === 'ru' ? 'Порт/путь ZPL' : 'ZPL path'}
                <input
                  placeholder="COM3 или \\\\pc\\zebra"
                  onBlur={async (e) => {
                    try {
                      await (window as any).api.saveDeviceSettings?.({ label_printer: { path: e.target.value } });
                    } catch {  }
                  }}
                />
              </label>
              <label>{locale === 'ru' ? 'Порт весов' : 'Scale port'}
                <input
                  placeholder="COM4"
                  onBlur={async (e) => {
                    try {
                      await (window as any).api.saveDeviceSettings?.({ scale: { port: e.target.value } });
                    } catch {  }
                  }}
                />
              </label>
              <button type="button" className="btn btn-secondary" onClick={async () => {
                try {
                  const w = await (window as any).api.readScaleWeight?.();
                  onNotice(locale === 'ru' ? `Вес: ${w?.weight} ${w?.unit}` : `Weight: ${w?.weight}`);
                } catch (e: any) { onNotice(e?.message || 'Error'); }
              }}>{locale === 'ru' ? 'Считать вес' : 'Read scale'}</button>
            </div>

            <div className="section-label">{locale === 'ru' ? 'Юридический ЭДО' : 'Legal EDO'}</div>
            <div className="form-grid" style={{ marginBottom: 16 }}>
              <label>{locale === 'ru' ? 'Оператор' : 'Operator'}
                <select
                  defaultValue="file"
                  onChange={async (e) => {
                    try {
                      await (window as any).api.saveEdoLegalSettings?.({ operator: e.target.value });
                      onNotice(e.target.value);
                    } catch (err: any) { onNotice(err?.message || 'Error'); }
                  }}
                >
                  <option value="file">Файл ZIP/XML</option>
                  <option value="diadoc">Диадок</option>
                  <option value="sbis">СБИС</option>
                  <option value="custom">Свой API</option>
                </select>
              </label>
              <label>{locale === 'ru' ? 'Отпечаток КЭП' : 'КЭП thumbprint'}
                <input
                  placeholder="A1B2C3…"
                  onBlur={async (e) => {
                    try {
                      await (window as any).api.saveEdoLegalSettings?.({ kep_thumbprint: e.target.value });
                    } catch {  }
                  }}
                />
              </label>
              <label className="span-2">{locale === 'ru' ? 'API URL оператора' : 'Operator API URL'}
                <input
                  placeholder="https://…"
                  onBlur={async (e) => {
                    try {
                      await (window as any).api.saveEdoLegalSettings?.({ api_url: e.target.value });
                    } catch {  }
                  }}
                />
              </label>
            </div>

            <div className="section-label">{locale === 'ru' ? 'Плагины / шина' : 'Plugins / bus'}</div>
            <div className="settings-actions">
              <button type="button" className="btn btn-secondary" onClick={async () => {
                try {
                  const list = await (window as any).api.reloadPlugins?.();
                  onNotice(locale === 'ru' ? `Плагинов: ${list?.length || 0}` : `Plugins: ${list?.length || 0}`);
                } catch (e: any) { onNotice(e?.message || 'Error'); }
              }}>{locale === 'ru' ? 'Перезагрузить плагины' : 'Reload plugins'}</button>
              <button type="button" className="btn btn-secondary" onClick={async () => {
                try {
                  const r = await (window as any).api.runPluginCommand?.('builtin.ping');
                  onNotice(JSON.stringify(r));
                } catch (e: any) { onNotice(e?.message || 'Error'); }
              }}>Ping шины</button>
              <button type="button" className="btn btn-secondary" onClick={async () => {
                try {
                  const root = await (window as any).api.pluginsRoot?.();
                  onNotice(root?.root || '—');
                } catch (e: any) { onNotice(e?.message || 'Error'); }
              }}>{locale === 'ru' ? 'Папка плагинов' : 'Plugins folder'}</button>
            </div>
          </section>
        )}

        {section === 'backup' && (
          <section className="card settings-card">
            <p>{locale === 'ru'
              ? 'Резервные копии организации: ручной экспорт, автокопии при входе/выходе и по расписанию, экспорт всей БД организации.'
              : 'Organization backups: manual export, auto copies on login/logout and on a schedule, full org DB export.'}</p>
            <div className="settings-actions">
              <button className="btn btn-primary" onClick={backup}>{locale === 'ru' ? 'Экспортировать БД' : 'Export DB'}</button>
              <button className="btn btn-secondary" onClick={restore}>{locale === 'ru' ? 'Импортировать БД' : 'Import DB'}</button>
              <button className="btn btn-secondary" onClick={async () => {
                try {
                  const result = await (window as any).api.exportOrganization();
                  if (result?.db) onNotice(locale === 'ru' ? `Организация экспортирована: ${result.db}` : `Organization exported: ${result.db}`);
                } catch (e: any) {
                  onNotice(e?.message || (locale === 'ru' ? 'Не удалось экспортировать организацию' : 'Could not export organization'));
                }
              }}>{locale === 'ru' ? 'Экспорт организации' : 'Export organization'}</button>
            </div>
            <div className="settings-grid" style={{ marginTop: 16 }}>
              <label>{locale === 'ru' ? 'Хранить автокопий' : 'Keep auto backups'}
                <input type="number" min={3} max={200} value={backupKeep} onChange={(e) => {
                  setBackupKeep(e.target.value);
                  save('backup.keep', e.target.value, locale === 'ru' ? 'Лимит автокопий сохранён' : 'Auto-backup keep limit saved');
                }} />
              </label>
              <label>{locale === 'ru' ? 'Интервал автокопии (часы)' : 'Auto-backup interval (hours)'}
                <input type="number" min={1} max={72} value={backupInterval} onChange={(e) => {
                  setBackupInterval(e.target.value);
                  save('backup.intervalHours', e.target.value, locale === 'ru' ? 'Интервал автокопий сохранён' : 'Auto-backup interval saved');
                }} />
              </label>
            </div>
            <div className="settings-actions" style={{ marginTop: 12 }}>
              <button className="btn btn-secondary" onClick={async () => {
                try {
                  const result = await (window as any).api.autoBackupNow();
                  onNotice(locale === 'ru' ? `Автокопия: ${result.path}` : `Auto backup: ${result.path}`);
                  await refreshAutoBackups();
                } catch (e: any) {
                  onNotice(e?.message || (locale === 'ru' ? 'Не удалось создать автокопию' : 'Could not create auto backup'));
                }
              }}>{locale === 'ru' ? 'Сделать автокопию сейчас' : 'Create auto backup now'}</button>
              <button className="btn btn-secondary" onClick={async () => {
                await (window as any).api.openAutoBackupFolder();
              }}>{locale === 'ru' ? 'Открыть папку автокопий' : 'Open auto-backup folder'}</button>
              <button className="btn btn-secondary" onClick={() => void refreshAutoBackups()}>{locale === 'ru' ? 'Обновить список' : 'Refresh list'}</button>
            </div>
            <small className="backup-hint">
              {locale === 'ru'
                ? `Автокопии: вход, выход, каждые ${backupInterval || 6} ч, выход из приложения. Папка: ${autoBackups.dir || '—'}`
                : `Auto backups: login, logout, every ${backupInterval || 6}h, app quit. Folder: ${autoBackups.dir || '—'}`}
            </small>

            <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
              <div className="section-label">{locale === 'ru' ? 'Диагностика БД' : 'Database diagnostics'}</div>
              <p className="subtext" style={{ margin: '6px 0 12px' }}>
                {locale === 'ru'
                  ? 'Проверка SQLite, ключей, отрицательных остатков и расхождения inventory с суммой ledger (остаток как производная движений).'
                  : 'SQLite integrity, foreign keys, negative stock and inventory vs ledger drift (stock as ledger derivative).'}
              </p>
              <div className="settings-actions">
                <button
                  className="btn btn-secondary"
                  disabled={diagnoseBusy}
                  onClick={async () => {
                    setDiagnoseBusy(true);
                    try {
                      const report = await (window as any).api.diagnoseDatabase();
                      setDiagnose(report);
                      onNotice(report?.ok
                        ? (locale === 'ru' ? 'Диагностика: база в порядке' : 'Diagnostics: database OK')
                        : (locale === 'ru' ? 'Диагностика: найдены проблемы' : 'Diagnostics: issues found'));
                    } catch (e: any) {
                      setDiagnose(null);
                      onNotice(e?.message || (locale === 'ru' ? 'Не удалось выполнить диагностику' : 'Diagnostics failed'));
                    } finally {
                      setDiagnoseBusy(false);
                    }
                  }}
                >
                  {diagnoseBusy
                    ? (locale === 'ru' ? 'Проверка…' : 'Checking…')
                    : (locale === 'ru' ? 'Проверить целостность БД' : 'Run integrity check')}
                </button>
                <button
                  className="btn btn-danger"
                  disabled={diagnoseBusy}
                  onClick={async () => {
                    if (!window.confirm(locale === 'ru'
                      ? 'Пересчитать все остатки из журнала движений? Таблица inventory будет перезаписана суммой ledger. Рекомендуется сделать backup.'
                      : 'Rebuild all stock from the ledger? Inventory will be overwritten. Make a backup first.')) return;
                    setDiagnoseBusy(true);
                    try {
                      const result = await (window as any).api.rebuildInventoryFromLedger();
                      const report = await (window as any).api.diagnoseDatabase();
                      setDiagnose(report);
                      onNotice(locale === 'ru'
                        ? `Пересчёт: ${result?.rewritten ?? 0} ячеек, drift ${result?.before_drift ?? '?'} → ${result?.after_drift ?? '?'}`
                        : `Rebuild: ${result?.rewritten ?? 0} cells, drift ${result?.before_drift ?? '?'} → ${result?.after_drift ?? '?'}`);
                      onReload();
                    } catch (e: any) {
                      onNotice(e?.message || (locale === 'ru' ? 'Не удалось пересчитать' : 'Rebuild failed'));
                    } finally {
                      setDiagnoseBusy(false);
                    }
                  }}
                >
                  {locale === 'ru' ? 'Пересчитать остатки из ledger' : 'Rebuild stock from ledger'}
                </button>
              </div>
              {diagnose && (
                <div style={{ marginTop: 12 }}>
                  <div className={`type-badge ${diagnose.ok ? 'in' : 'out'}`}>
                    {diagnose.ok
                      ? (locale === 'ru' ? 'OK' : 'OK')
                      : (locale === 'ru' ? 'Есть замечания' : 'Issues found')}
                  </div>
                  <div className="subtext" style={{ marginTop: 8 }}>
                    integrity: <strong>{String(diagnose.integrity || '—')}</strong>
                    {' · '}FK: <strong>{Number(diagnose.foreign_keys || 0)}</strong>
                    {' · '}{locale === 'ru' ? 'отриц. остатки' : 'neg. stock'}: <strong>{Number(diagnose.negative_stock || 0)}</strong>
                    {' · '}{locale === 'ru' ? 'осиротевшие inventory' : 'orphan inventory'}: <strong>{Number(diagnose.orphan_inventory || 0)}</strong>
                    {' · '}{locale === 'ru' ? 'осиротевшие tx' : 'orphan tx'}: <strong>{Number(diagnose.orphan_transactions || 0)}</strong>
                    {' · '}ledger drift: <strong>{Number(diagnose.ledger_drift || 0)}</strong>
                    {' · '}{locale === 'ru' ? 'резервы' : 'reserves'}: <strong>{Number(diagnose.active_reserves || 0)}</strong>
                    {' · '}{locale === 'ru' ? 'устаревшие' : 'stale'}: <strong>{Number(diagnose.stale_reserves || 0)}</strong>
                    {' · '}over-reserved: <strong>{Number(diagnose.over_reserved || 0)}</strong>
                  </div>
                  {Array.isArray(diagnose.issues) && diagnose.issues.length > 0 && (
                    <ul style={{ margin: '10px 0 0', paddingLeft: 18 }}>
                      {diagnose.issues.map((issue: string, idx: number) => (
                        <li key={`${idx}-${issue}`} className="subtext">{issue}</li>
                      ))}
                    </ul>
                  )}
                  {Array.isArray(diagnose.ledger_drift_rows) && diagnose.ledger_drift_rows.length > 0 && (
                    <div className="table-scroll" style={{ marginTop: 10, maxHeight: 180 }}>
                      <table>
                        <thead>
                          <tr>
                            <th>{locale === 'ru' ? 'Товар' : 'Item'}</th>
                            <th>{locale === 'ru' ? 'Ячейка' : 'Cell'}</th>
                            <th>{locale === 'ru' ? 'inventory' : 'inventory'}</th>
                            <th>ledger</th>
                            <th>Δ</th>
                          </tr>
                        </thead>
                        <tbody>
                          {diagnose.ledger_drift_rows.slice(0, 20).map((row: any) => (
                            <tr key={`${row.item_id}-${row.location_id}`}>
                              <td>{row.item_name || row.item_id}<div className="subtext mono">#{row.item_id}</div></td>
                              <td>{row.location_name || row.location_id}</td>
                              <td>{row.inventory_qty}</td>
                              <td>{row.ledger_qty}</td>
                              <td className="mono">{row.delta > 0 ? `+${row.delta}` : row.delta}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {diagnose.checked_at && (
                    <div className="subtext" style={{ marginTop: 8 }}>
                      {locale === 'ru' ? 'Проверено' : 'Checked'}: {new Date(diagnose.checked_at).toLocaleString(locale === 'ru' ? 'ru-RU' : 'en-US')}
                    </div>
                  )}
                </div>
              )}
            </div>

            {autoBackups.items.length > 0 && (
              <div className="table-scroll" style={{ marginTop: 12 }}>
                <table>
                  <thead>
                    <tr>
                      <th>{locale === 'ru' ? 'Файл' : 'File'}</th>
                      <th>{locale === 'ru' ? 'Дата' : 'Date'}</th>
                      <th>{locale === 'ru' ? 'Размер' : 'Size'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {autoBackups.items.slice(0, 12).map((row) => (
                      <tr key={row.path}>
                        <td className="strong">{row.name}</td>
                        <td>{row.mtime ? new Date(row.mtime).toLocaleString(locale === 'ru' ? 'ru-RU' : 'en-US') : '—'}</td>
                        <td>{Math.max(1, Math.round((row.size || 0) / 1024))} КБ</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  </>;
}
