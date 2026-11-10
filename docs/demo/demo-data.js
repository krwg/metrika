/* Large electronics workshop seed for Metrika Home browser demo (no DB). */
window.MetrikaDemoData = (() => {
  const CATEGORIES = [
    { name: 'МК / SoC', color: '#1a73e8' },
    { name: 'Память', color: '#7b61ff' },
    { name: 'Аналог', color: '#e37400' },
    { name: 'Цифра / логика', color: '#188038' },
    { name: 'Питание', color: '#c5221f' },
    { name: 'Пассивные R', color: '#5f6368' },
    { name: 'Пассивные C', color: '#9334e6' },
    { name: 'Разъёмы', color: '#007b83' },
    { name: 'Кабели', color: '#1967d2' },
    { name: 'Дисплеи', color: '#f9ab00' },
    { name: 'Датчики', color: '#137333' },
    { name: 'Механика', color: '#b06000' },
    { name: 'Инструмент', color: '#3c4043' },
    { name: 'Расходники', color: '#80868b' },
  ];

  const PARTS = [
    ['ESP32-WROOM-32E', 'МК / SoC', 'ESP-W32', 48, 12],
    ['ESP32-C3-MINI', 'МК / SoC', 'ESP-C3', 36, 10],
    ['STM32F103C8T6', 'МК / SoC', 'STM-F103', 60, 15],
    ['STM32H743VIT6', 'МК / SoC', 'STM-H743', 12, 4],
    ['RP2040', 'МК / SoC', 'RP-2040', 40, 10],
    ['ATmega328P-AU', 'МК / SoC', 'ATM-328', 80, 20],
    ['nRF52840', 'МК / SoC', 'NRF-840', 18, 6],
    ['W25Q128JV', 'Память', 'W25-128', 55, 15],
    ['W25Q64JV', 'Память', 'W25-64', 70, 20],
    ['AT24C256', 'Память', 'AT24-256', 90, 25],
    ['IS25LP128', 'Память', 'IS25-128', 22, 8],
    ['ADS1115', 'Аналог', 'ADS-1115', 28, 8],
    ['INA219', 'Аналог', 'INA-219', 35, 10],
    ['MCP3008', 'Аналог', 'MCP-3008', 24, 8],
    ['LM358', 'Аналог', 'LM-358', 120, 30],
    ['TL072', 'Аналог', 'TL-072', 64, 16],
    ['74HC595', 'Цифра / логика', 'HC-595', 150, 40],
    ['74HC165', 'Цифра / логика', 'HC-165', 80, 20],
    ['SN74LVC1G125', 'Цифра / логика', 'LVC-125', 200, 50],
    ['CD4051', 'Цифра / логика', 'CD-4051', 45, 12],
    ['PCA9685', 'Цифра / логика', 'PCA-9685', 32, 8],
    ['AMS1117-3.3', 'Питание', '1117-33', 180, 40],
    ['AMS1117-5.0', 'Питание', '1117-50', 160, 40],
    ['MP1584EN', 'Питание', 'MP-1584', 55, 15],
    ['XL6009', 'Питание', 'XL-6009', 40, 10],
    ['TP4056', 'Питание', 'TP-4056', 90, 25],
    ['LM2596S', 'Питание', 'LM-2596', 48, 12],
    ['USB-C PD decoy 9V', 'Питание', 'PD-9V', 25, 8],
    ['R 10k 1% 0805', 'Пассивные R', 'R10K-0805', 5000, 500],
    ['R 4.7k 1% 0805', 'Пассивные R', 'R4K7-0805', 4000, 400],
    ['R 1k 1% 0603', 'Пассивные R', 'R1K-0603', 6000, 600],
    ['R 100R 1% 0805', 'Пассивные R', 'R100-0805', 3500, 350],
    ['R 10R 5% 1206', 'Пассивные R', 'R10-1206', 2000, 200],
    ['C 100n 50V 0805', 'Пассивные C', 'C100N-0805', 8000, 800],
    ['C 10u 25V 1206', 'Пассивные C', 'C10U-1206', 2500, 250],
    ['C 22u 16V 1210', 'Пассивные C', 'C22U-1210', 1200, 120],
    ['C 1u 50V 0805', 'Пассивные C', 'C1U-0805', 3000, 300],
    ['Electro 470u 25V', 'Пассивные C', 'E470-25', 400, 80],
    ['USB-C 16pin SMD', 'Разъёмы', 'USBC-16', 120, 30],
    ['JST-XH 2.54 2p', 'Разъёмы', 'JST-XH2', 300, 60],
    ['JST-PH 2.0 4p', 'Разъёмы', 'JST-PH4', 220, 50],
    ['Pin header 2.54 40', 'Разъёмы', 'HDR-40', 500, 100],
    ['Socket DIP-28', 'Разъёмы', 'DIP-28', 80, 20],
    ['Terminal 5.08 2p', 'Разъёмы', 'TB-508', 150, 40],
    ['Dupont M-M 20cm', 'Кабели', 'DUP-MM', 40, 10],
    ['Dupont M-F 20cm', 'Кабели', 'DUP-MF', 45, 10],
    ['USB-A ↔ USB-C 1m', 'Кабели', 'USB-AC1', 60, 15],
    ['USB-C ↔ USB-C 0.5m', 'Кабели', 'USB-CC05', 35, 10],
    ['Ribbon 16p 30cm', 'Кабели', 'RIB-16', 25, 8],
    ['OLED 0.96 I2C', 'Дисплеи', 'OLED-096', 42, 10],
    ['OLED 1.3 I2C', 'Дисплеи', 'OLED-130', 28, 8],
    ['LCD 1602 I2C', 'Дисплеи', 'LCD-1602', 35, 10],
    ['TFT 2.4 SPI', 'Дисплеи', 'TFT-24', 18, 5],
    ['e-Paper 2.9', 'Дисплеи', 'EP-29', 12, 4],
    ['BME280', 'Датчики', 'BME-280', 30, 8],
    ['DHT22', 'Датчики', 'DHT-22', 40, 10],
    ['MPU6050', 'Датчики', 'MPU-6050', 35, 10],
    ['HC-SR04', 'Датчики', 'HC-SR04', 50, 12],
    ['VL53L0X', 'Датчики', 'VL53-L0X', 22, 6],
    ['ACS712-20A', 'Датчики', 'ACS-712', 28, 8],
    ['MG90S servo', 'Механика', 'MG-90S', 55, 15],
    ['SG90 servo', 'Механика', 'SG-90', 70, 20],
    ['NEMA17 42', 'Механика', 'NEMA-17', 16, 4],
    ['Fan 40mm 5V', 'Механика', 'FAN-40', 30, 8],
    ['Standoff M3 10mm', 'Механика', 'ST-M3-10', 400, 80],
    ['Screw M3x8', 'Механика', 'SCR-M3-8', 1000, 200],
    ['Heatset M3', 'Механика', 'HS-M3', 300, 60],
    ['Soldering tip C245', 'Инструмент', 'TIP-C245', 8, 3],
    ['Flux pen', 'Инструмент', 'FLUX-PEN', 20, 5],
    ['Tweezers ESD', 'Инструмент', 'TW-ESD', 12, 4],
    ['Kapton 10mm', 'Расходники', 'KAP-10', 15, 5],
    ['Solder 0.6 Sn63', 'Расходники', 'SLD-06', 25, 6],
    ['IPA 1L', 'Расходники', 'IPA-1L', 10, 3],
    ['Zip bag 60x80', 'Расходники', 'BAG-6080', 500, 100],
    ['Label 30x20', 'Расходники', 'LBL-3020', 800, 150],
  ];

  function abcOf(i) {
    if (i < 18) return 'A';
    if (i < 45) return 'B';
    return 'C';
  }
  function xyzOf(i) {
    return ['X', 'Y', 'Z'][i % 3];
  }

  function buildLocations() {
    const rows = [
      { code: 'WH-MAIN', name: 'Мастерская электроники', type: 'warehouse', capacity: 0 },
      { code: 'ZONE-A', name: 'Стеллаж A · MCU / IC', type: 'subwarehouse', capacity: 0 },
      { code: 'ZONE-B', name: 'Стеллаж B · пассивные', type: 'subwarehouse', capacity: 0 },
      { code: 'ZONE-C', name: 'Стеллаж C · разъёмы / кабели', type: 'subwarehouse', capacity: 0 },
      { code: 'ZONE-D', name: 'Стеллаж D · механика / расход', type: 'subwarehouse', capacity: 0 },
      { code: 'ZONE-E', name: 'Стол сборки', type: 'subwarehouse', capacity: 0 },
    ];
    const zones = [
      ['ZONE-A', 'A', 4, 5, 60],
      ['ZONE-B', 'B', 3, 6, 120],
      ['ZONE-C', 'C', 3, 4, 80],
      ['ZONE-D', 'D', 3, 4, 100],
      ['ZONE-E', 'E', 2, 3, 40],
    ];
    for (const [zone, letter, rowsN, cols, cap] of zones) {
      for (let r = 1; r <= rowsN; r += 1) {
        for (let c = 1; c <= cols; c += 1) {
          const code = `${letter}-${String(r).padStart(2, '0')}-${String(c).padStart(2, '0')}`;
          rows.push({ code, name: code, type: 'cell', capacity: cap, zone });
        }
      }
    }
    return rows;
  }

  function buildItems(locations) {
    const cells = locations.filter((l) => l.type === 'cell');
    return PARTS.map((part, i) => {
      const [name, category, sku, qty, min] = part;
      const cat = CATEGORIES.find((c) => c.name === category) || CATEGORIES[0];
      const cell = cells[i % cells.length];
      const reserved = i % 7 === 0 ? Math.min(3, Math.floor(qty * 0.1)) : (i % 11 === 0 ? 1 : 0);
      return {
        id: i + 1,
        barcode: String(460100 + i),
        sku,
        name,
        category,
        color: cat.color,
        bin: cell.code,
        qty,
        min,
        unit: category.startsWith('Пассивные') || name.includes('Screw') || name.includes('bag') || name.includes('Label') ? 'шт' : 'шт',
        abc: abcOf(i),
        xyz: xyzOf(i),
        reserved,
      };
    });
  }

  function seed() {
    const locations = buildLocations();
    const items = buildItems(locations);
    const categories = CATEGORIES.map((c) => ({
      ...c,
      count: items.filter((i) => i.category === c.name).length,
    }));
    const trend = [];
    for (let i = 13; i >= 0; i -= 1) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      trend.push({
        day: d.toISOString().slice(0, 10),
        received: 20 + ((i * 7) % 40),
        issued: 12 + ((i * 5) % 28),
      });
    }
    const moves = [];
    for (let i = 0; i < 40; i += 1) {
      const item = items[i % items.length];
      const types = ['in', 'out', 'move', 'pair'];
      const type = types[i % types.length];
      moves.push({
        type,
        item: item.name,
        place: item.bin,
        qty: 1 + (i % 8),
        at: i < 8 ? `${9 + (i % 8)}:${String((i * 7) % 60).padStart(2, '0')}` : `день −${Math.floor(i / 8)}`,
      });
    }
    return {
      org: { id: 1, name: 'Мастерская электроники', code: 'ELEC-LAB' },
      employees: [
        { id: 1, name: 'Администратор', role: 'admin', login: 'admin' },
        { id: 2, name: 'Кладовщик', role: 'user', login: 'store' },
        { id: 3, name: 'Оператор ТСД', role: 'operator', login: 'tsd1' },
      ],
      items,
      locations,
      categories,
      units: [
        { code: 'шт', name: 'Штука' },
        { code: 'уп', name: 'Упаковка' },
        { code: 'м', name: 'Метр' },
        { code: 'рул', name: 'Рулон' },
      ],
      moves,
      purchases: [
        { id: 'PO-2140', supplier: 'Chip&Wire', status: 'open', lines: 18, total: '186 400 ₽' },
        { id: 'PO-2136', supplier: 'RobotParts', status: 'partial', lines: 9, total: '54 200 ₽' },
        { id: 'PO-2131', supplier: 'LCSC local', status: 'done', lines: 42, total: '97 850 ₽' },
        { id: 'PO-2128', supplier: 'Chip&Wire', status: 'open', lines: 6, total: '21 300 ₽' },
        { id: 'PO-2122', supplier: 'Mouser RU', status: 'done', lines: 15, total: '143 000 ₽' },
      ],
      suppliers: [
        { name: 'Chip&Wire', note: 'MCU, память, питание' },
        { name: 'RobotParts', note: 'Серво, механика, кабели' },
        { name: 'LCSC local', note: 'Пассивные, разъёмы' },
        { name: 'Mouser RU', note: 'Прецизионка / срочные' },
      ],
      projects: [
        {
          id: 'WO-340',
          name: 'Контроллер освещения v3',
          status: 'in_progress',
          qty: 10,
          bom: [
            { item: 'ESP32-WROOM-32E', need: 10, reserved: 10 },
            { item: 'PCA9685', need: 10, reserved: 8 },
            { item: 'AMS1117-3.3', need: 10, reserved: 10 },
            { item: 'C 100n 50V 0805', need: 40, reserved: 40 },
            { item: 'USB-C 16pin SMD', need: 10, reserved: 6 },
          ],
        },
        {
          id: 'WO-338',
          name: 'Логгер температуры BME',
          status: 'draft',
          qty: 25,
          bom: [
            { item: 'ESP32-C3-MINI', need: 25, reserved: 0 },
            { item: 'BME280', need: 25, reserved: 0 },
            { item: 'OLED 0.96 I2C', need: 25, reserved: 0 },
            { item: 'TP4056', need: 25, reserved: 0 },
          ],
        },
        {
          id: 'WO-331',
          name: 'Стенд калибровки тока',
          status: 'in_progress',
          qty: 2,
          bom: [
            { item: 'STM32H743VIT6', need: 2, reserved: 2 },
            { item: 'ADS1115', need: 4, reserved: 4 },
            { item: 'INA219', need: 4, reserved: 2 },
            { item: 'TFT 2.4 SPI', need: 2, reserved: 2 },
          ],
        },
      ],
      inventory: items.slice(0, 24).map((it, i) => ({
        place: it.bin,
        item: it.name,
        book: it.qty,
        fact: it.qty - (i % 5 === 0 ? 1 : 0),
      })),
      documents: [
        { id: 'IN-904', type: 'Приход', status: 'posted', date: '2026-11-07' },
        { id: 'IN-911', type: 'Приход', status: 'posted', date: '2026-11-08' },
        { id: 'OUT-512', type: 'Расход', status: 'posted', date: '2026-11-09' },
        { id: 'TR-220', type: 'Перемещение', status: 'draft', date: '2026-11-10' },
        { id: 'WO-340-R', type: 'Резерв', status: 'posted', date: '2026-11-09' },
      ],
      templates: [
        { name: 'MCU ESP', category: 'МК / SoC', prefix: 'ESP-', min: 10 },
        { name: 'Резистор 0805', category: 'Пассивные R', prefix: 'R-', min: 500 },
        { name: 'Конденсатор 0805', category: 'Пассивные C', prefix: 'C-', min: 500 },
        { name: 'Разъём', category: 'Разъёмы', prefix: 'CN-', min: 20 },
      ],
      assets: [
        { inv: 'ОС-101', name: 'Паяльная станция JBC', status: 'in_use', place: 'Стол E-01' },
        { inv: 'ОС-108', name: 'Микроскоп 7–45×', status: 'in_use', place: 'Стол E-02' },
        { inv: 'ОС-112', name: 'Принтер этикеток Brother', status: 'in_use', place: 'Кладовая' },
        { inv: 'ОС-120', name: 'ТСД Zebra TC26', status: 'repair', place: 'Сервис' },
        { inv: 'ОС-124', name: 'Источник 0–30В 5А', status: 'in_use', place: 'Стенд' },
      ],
      edo: [
        { id: 'EDO-44', title: 'УПД Chip&Wire №2140', status: 'sent' },
        { id: 'EDO-43', title: 'Акт сверки RobotParts', status: 'draft' },
        { id: 'EDO-41', title: 'Счёт LCSC local', status: 'posted' },
      ],
      audit: [
        { at: '11:20', who: 'Администратор', action: 'stock.pair', detail: 'ESP32-WROOM → A-01-01' },
        { at: '10:55', who: 'Кладовщик', action: 'stock.in', detail: 'PO-2136 частичный приём' },
        { at: '10:12', who: 'Оператор ТСД', action: 'tsd.pick', detail: 'WO-340 · PCA9685' },
        { at: '09:40', who: 'Администратор', action: 'doc.post', detail: 'IN-911' },
        { at: '09:05', who: 'Кладовщик', action: 'stock.out', detail: 'Сборка стенда · −4 INA219' },
      ],
      company: {
        counterparties: ['Chip&Wire', 'RobotParts', 'LCSC local', 'Mouser RU', 'ООО ЛайтКонтрол'],
        contracts: ['Д-12/26 поставка MCU', 'Д-18/26 сервис ТСД', 'Д-21/26 этикетки'],
        orders: ['ЗК-88 освещение ×10', 'ЗК-91 логгеры ×25', 'ЗК-77 стенд тока ×2'],
      },
      trend,
      filter: 'all',
      purchTab: 'po',
      invChip: 'cell',
      companyTab: 'counterparties',
      settingsSection: 'appearance',
      openTabs: ['dashboard'],
      splitPage: null,
      opMode: null,
      sessionLines: [],
    };
  }

  return { seed, CATEGORIES };
})();
