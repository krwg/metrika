import { SerialPort } from 'serialport';
import { ReadlineParser } from '@serialport/parser-readline';
import { EventEmitter } from 'events';

export class ScannerManager extends EventEmitter {
  private port: SerialPort | null = null;
  private parser: ReadlineParser | null = null;
  private portPath: string;
  private baudRate: number;
  private stopped = true;
  private reconnectTimer: NodeJS.Timeout | null = null;

  constructor(portPath = '', baudRate = 9600) {
    super();
    this.portPath = portPath;
    this.baudRate = baudRate;
  }

  connect() {
    if (!this.portPath) {
      this.emit('status', { connected: false, message: 'Выберите COM-порт' });
      return;
    }

    this.stopped = false;
    this.clearReconnectTimer();
    this.disconnect(false);
    this.emit('status', { connected: false, message: 'Подключение к ' + this.portPath + '...' });

    this.port = new SerialPort({
      path: this.portPath,
      baudRate: this.baudRate,
      dataBits: 8,
      stopBits: 1,
      parity: 'none',
      autoOpen: false,
    });

    this.parser = this.port.pipe(new ReadlineParser({ delimiter: '\r' }));

    this.port.on('open', () => {
      this.emit('status', { connected: true, port: this.portPath });
      console.log('[Scanner] Connected to', this.portPath);
    });

    this.port.on('error', (err) => {
      this.emit('status', { connected: false, message: 'Ошибка: ' + err.message });
      console.error('[Scanner] Error:', err.message);
      this.scheduleReconnect();
    });

    this.port.on('close', () => {
      this.emit('status', { connected: false, message: this.stopped ? 'Порт закрыт' : 'Соединение потеряно' });
      if (!this.stopped) this.scheduleReconnect();
    });

    this.parser.on('data', (data: string) => {
      const barcode = data.trim();
      if (barcode.length > 0) {
        console.log('[Scanner] Barcode:', barcode);
        this.emit('scan', barcode);
      }
    });

    this.port.open((err) => {
      if (err) {
        this.emit('status', { connected: false, message: 'Не удалось открыть: ' + err.message });
        this.scheduleReconnect();
      }
    });
  }

  setPort(portPath: string) {
    this.portPath = portPath;
  }

  setBaudRate(baudRate: number) {
    this.baudRate = baudRate;
  }

  disconnect(stop = true) {
    this.stopped = stop;
    if (stop) this.clearReconnectTimer();
    if (this.port?.isOpen) {
      try { this.port.close(); } catch {  }
    }
    this.port = null;
    this.parser = null;
  }

  private clearReconnectTimer() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private scheduleReconnect() {
    if (this.stopped || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.stopped && this.portPath) this.connect();
    }, 2500);
  }
}