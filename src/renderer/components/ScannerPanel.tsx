import { useEffect, useMemo, useRef, useState } from 'react';

export type ScanMode = 'item' | 'location' | 'receipt' | 'batch' | 'audit' | 'tsd' | 'pair' | 'stocktake';

type Props = {
  onScan: (code: string, mode: ScanMode) => void;
  pairStatus?: string;
  page: string;
  forcedMode?: ScanMode | null;
  activeHint?: string;
  visible?: boolean;
};

const MANUAL_PAGES = new Set(['items', 'locations']);
const AUTO_LABEL: Record<string, string> = {
  audit: 'Ревизия ячейки',
  tsd: 'Задание терминала',
  stocktake: 'Быстрая инвентаризация',
  pair: 'Товар + ячейка',
  item: 'Поиск товара',
  location: 'Поиск ячейки',
  receipt: 'Оприходование',
  batch: 'Пакетный расход',
};

const scannerStore = {
  status: { connected: false, message: 'Выберите COM-порт' } as any,
  lastScan: '',
  selectedPort: '',
  manualMode: 'pair' as ScanMode,
  expanded: false,
  baudRate: '9600',
  soundEnabled: true,
};

let sharedAudio: AudioContext | null = null;

function playScanTone(enabled: boolean) {
  if (!enabled) return;
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    if (!sharedAudio || sharedAudio.state === 'closed') sharedAudio = new AudioContextClass();
    if (sharedAudio.state === 'suspended') sharedAudio.resume().catch(() => {});
    const oscillator = sharedAudio.createOscillator();
    const gain = sharedAudio.createGain();
    oscillator.frequency.value = 880;
    gain.gain.value = 0.05;
    oscillator.connect(gain);
    gain.connect(sharedAudio.destination);
    oscillator.start();
    oscillator.stop(sharedAudio.currentTime + 0.08);
  } catch {

  }
}

export default function ScannerPanel({ onScan, pairStatus = '', page, forcedMode = null, activeHint = '', visible = true }: Props) {
  const [status, setStatus] = useState(scannerStore.status);
  const [lastScan, setLastScan] = useState(scannerStore.lastScan);
  const [ports, setPorts] = useState<any[]>([]);
  const [selectedPort, setSelectedPort] = useState(scannerStore.selectedPort);
  const [manualMode, setManualMode] = useState<ScanMode>(scannerStore.manualMode);
  const [baudRate, setBaudRate] = useState(scannerStore.baudRate);
  const [soundEnabled, setSoundEnabled] = useState(scannerStore.soundEnabled);
  const [expanded, setExpanded] = useState(scannerStore.expanded);

  const onScanRef = useRef(onScan);
  const modeRef = useRef<ScanMode>(forcedMode || manualMode);
  const soundRef = useRef(soundEnabled);

  useEffect(() => { onScanRef.current = onScan; }, [onScan]);
  useEffect(() => { soundRef.current = soundEnabled; scannerStore.soundEnabled = soundEnabled; }, [soundEnabled]);

  useEffect(() => {
    if (forcedMode) return;
    if (page === 'inventory') {
      setManualMode('stocktake');
      scannerStore.manualMode = 'stocktake';
    } else if (page === 'items' || page === 'locations') {
      setManualMode((current) => {
        const next = current === 'stocktake' || current === 'audit' || current === 'tsd' ? 'pair' : current;
        scannerStore.manualMode = next;
        return next;
      });
    }
  }, [page, forcedMode]);

  const mode = forcedMode || manualMode;
  const locked = Boolean(forcedMode);
  modeRef.current = mode;

  async function loadPorts() {
    try {
      const result = await (window as any).api.listScannerPorts();
      setPorts(result || []);
      const saved = await (window as any).api.getSetting('scannerPort', '');
      const next = saved && result?.some((port: any) => port.path === saved) ? saved : (selectedPort || result?.[0]?.path || '');
      if (next) {
        setSelectedPort(next);
        scannerStore.selectedPort = next;
      }
    } catch {

    }
  }

  useEffect(() => {
    const removeStatus = (window as any).api.onStatus((value: any) => {
      scannerStore.status = value;
      setStatus(value);
    });
    const removeBarcode = (window as any).api.onBarcode((code: string) => {
      scannerStore.lastScan = code;
      setLastScan(code);
      playScanTone(soundRef.current);
      onScanRef.current(code, modeRef.current);
    });
    loadPorts();
    (window as any).api.getSetting('baudRate', '9600').then((value: string) => {
      const next = value || '9600';
      setBaudRate(next);
      scannerStore.baudRate = next;
    });
    (window as any).api.getSetting('scannerSound', 'on').then((value: string) => {
      const next = value !== 'off';
      setSoundEnabled(next);
      scannerStore.soundEnabled = next;
    });

    (window as any).api.listScannerPorts?.();
    return () => { removeStatus?.(); removeBarcode?.(); };
  }, []);

  useEffect(() => {
    if (!selectedPort || status.connected) return;
    scannerStore.selectedPort = selectedPort;
    (window as any).api.setSetting('scannerPort', selectedPort);
  }, [selectedPort, status.connected]);

  const hint = useMemo(() => {
    if (activeHint) return activeHint;
    if (mode === 'pair') return pairStatus || 'Сканируйте товар и ячейку в любом порядке: +1 шт.';
    if (mode === 'location') return 'Скан откроет карточку ячейки';
    if (mode === 'receipt') return 'Скан откроет оприходование товара';
    if (mode === 'batch') return 'Сканируйте товары в корзину расхода';
    if (mode === 'audit') return 'Сканируйте товары активной ревизии';
    if (mode === 'tsd') return 'Сканируйте компоненты выбранного задания терминала';
    if (mode === 'stocktake') return 'Свободное сканирование: затем назначьте всё в ячейку';
    return 'Скан откроет карточку товара';
  }, [activeHint, mode, pairStatus]);

  async function connect() {
    if (!selectedPort) return;
    await (window as any).api.setSetting('scannerPort', selectedPort);
    await (window as any).api.reconnectToPort(selectedPort, Number(baudRate));
  }

  function changeMode(next: ScanMode) {
    setManualMode(next);
    scannerStore.manualMode = next;
  }

  function toggleExpanded() {
    setExpanded((value) => {
      scannerStore.expanded = !value;
      return !value;
    });
  }

  return (
    <section
      className={`scanner-panel card ${expanded ? 'scanner-expanded' : 'scanner-compact'}${visible ? '' : ' scanner-hidden'}`}
      aria-hidden={!visible}
    >
      <div className="scanner-heading">
        <div>
          <div className="section-label">Сканер · {AUTO_LABEL[mode] || mode}</div>
          <h2>{locked ? AUTO_LABEL[mode] || 'Авторежим' : 'Штрихкоды'}</h2>
        </div>
        <div className="scanner-body">
          <div className={`last-scan ${!lastScan ? 'empty' : ''}`} title={lastScan || 'Ожидание штрихкода'}>
            {lastScan || 'Ожидание штрихкода'}
          </div>
          <div className="scanner-hint">{hint}</div>
        </div>
        <div className="scanner-heading-actions">
          <div className={`connection-state ${status.connected ? 'connected' : ''}`}>{status.connected ? 'Подключен' : 'Не подключен'}</div>
          <button type="button" className="btn btn-text" onClick={toggleExpanded}>{expanded ? 'Свернуть' : 'Настройки'}</button>
        </div>
      </div>

      {expanded && (
        <div className="scanner-controls">
          {MANUAL_PAGES.has(page) && !locked ? (
            <label>Режим
              <select value={manualMode} onChange={(event) => changeMode(event.target.value as ScanMode)}>
                <option value="pair">Товар + ячейка (+1)</option>
                <option value="item">Поиск товара</option>
                <option value="location">Поиск ячейки</option>
                <option value="receipt">Оприходование</option>
                <option value="batch">Пакетный расход</option>
                <option value="stocktake">Быстрая инвентаризация</option>
              </select>
            </label>
          ) : page === 'inventory' && !locked ? (
            <div className="scanner-auto-mode">
              <span className="section-label">Режим</span>
              <strong>Быстрая инвентаризация</strong>
              <span className="subtext">Откройте акт ревизии — режим переключится сам</span>
            </div>
          ) : (
            <div className="scanner-auto-mode">
              <span className="section-label">Режим</span>
              <strong>{AUTO_LABEL[mode] || mode}</strong>
              <span className="subtext">Включён автоматически для этого раздела</span>
            </div>
          )}
          <label>Порт сканера
            <select value={selectedPort} onChange={(event) => { setSelectedPort(event.target.value); scannerStore.selectedPort = event.target.value; }}>
              <option value="">Выберите порт</option>
              {ports.map((port) => <option key={port.path} value={port.path}>{port.path}{port.manufacturer ? `, ${port.manufacturer}` : ''}</option>)}
            </select>
          </label>
          <button className="btn btn-primary" onClick={connect} disabled={!selectedPort}>{status.connected ? 'Переподключить' : 'Подключить'}</button>
          <button className="btn btn-text" onClick={loadPorts}>Обновить порты</button>
          <div className="scanner-message">{status.connected ? status.port : status.message}</div>
        </div>
      )}
    </section>
  );
}
