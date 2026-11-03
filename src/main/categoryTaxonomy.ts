import type Database from 'better-sqlite3';

type NodeDef = {
  name: string;
  prefix?: string | null;
  color?: string;
  children?: NodeDef[];
};


const TAXONOMY: NodeDef[] = [
  {
    name: 'Электронные компоненты',
    color: '#397c74',
    children: [
      {
        name: 'Активные компоненты',
        children: [
          { name: 'Контроллеры', prefix: 'MCU', color: '#2c3e50' },
          { name: 'Драйверы', prefix: 'DRV', color: '#c0392b' },
          { name: 'Индикаторы', prefix: 'IND', color: '#2980b9' },
          { name: 'Светодиоды', prefix: 'LED', color: '#f1c40f' },
          { name: 'Реле', prefix: 'RLY', color: '#8e44ad' },
          { name: 'Кнопки и клавиатуры', prefix: 'BTN', color: '#7f8c8d' },
        ],
      },
      {
        name: 'Пассивные компоненты',
        children: [
          { name: 'Резисторы', prefix: 'RES', color: '#e67e22' },
          { name: 'Конденсаторы', prefix: 'CAP', color: '#16a085' },
        ],
      },
      {
        name: 'Микросхемы',
        children: [
          { name: 'ОЗУ', prefix: 'RAM', color: '#9b59b6' },
        ],
      },
    ],
  },
  {
    name: 'Механические компоненты',
    color: '#5d6d7e',
    children: [
      {
        name: 'Двигатели и приводы',
        children: [
          { name: 'Двигатели', prefix: 'MOT', color: '#c0392b' },
          { name: 'Сервоприводы', prefix: 'SRV', color: '#e74c3c' },
        ],
      },
      {
        name: 'Корпуса и крепления',
        children: [
          { name: 'Вентиляторы', prefix: 'FAN', color: '#3498db' },
          { name: 'Радиаторы', prefix: 'RDT', color: '#95a5a6' },
        ],
      },
    ],
  },
  {
    name: 'Кабели и соединения',
    color: '#1abc9c',
    children: [
      {
        name: 'Кабельная продукция',
        children: [
          { name: 'Кабель', prefix: 'CAB', color: '#16a085' },
          { name: 'Перемычки', prefix: 'JMP', color: '#1abc9c' },
        ],
      },
      {
        name: 'Разъемы и переходники',
        children: [
          { name: 'Переходники', prefix: 'ADP', color: '#27ae60' },
          { name: 'Коннекторы', prefix: 'CNR', color: '#2ecc71' },
        ],
      },
      {
        name: 'Крепеж',
        children: [
          { name: 'Стяжки', prefix: 'TIE', color: '#f39c12' },
          { name: 'Винты и метизы', prefix: 'VNT', color: '#d35400' },
        ],
      },
    ],
  },
  {
    name: 'Устройства хранения данных',
    color: '#34495e',
    children: [
      { name: 'SSD накопители', prefix: 'SSD', color: '#2c3e50' },
      { name: 'HDD накопители', prefix: 'HDD', color: '#7f8c8d' },
      { name: 'Накопители', prefix: 'STO', color: '#95a5a6' },
      { name: 'Карты памяти и ридеры', prefix: 'SDC', color: '#566573' },
    ],
  },
  {
    name: 'Дисплеи и экраны',
    color: '#2980b9',
    children: [
      { name: 'Экраны', prefix: 'DSP', color: '#3498db' },
    ],
  },
  {
    name: 'Источники питания',
    color: '#f39c12',
    children: [
      { name: 'Блоки питания', prefix: 'PSU', color: '#e67e22' },
      { name: 'Преобразователи DC-DC', prefix: 'DCDC', color: '#d68910' },
      { name: 'Аккумуляторы', prefix: 'BAT', color: '#27ae60' },
    ],
  },
  {
    name: 'Инструменты и оборудование',
    color: '#8e44ad',
    children: [
      {
        name: 'Тестеры и измерители',
        children: [
          { name: 'Тестеры', prefix: 'TST', color: '#9b59b6' },
          { name: 'Измерители', prefix: 'IZM', color: '#af7ac5' },
          { name: 'Пирометры', prefix: 'PRM', color: '#bb8fce' },
        ],
      },
      {
        name: 'Пульты управления',
        children: [
          { name: 'Пульты', prefix: 'RMT', color: '#5dade2' },
        ],
      },
      {
        name: 'ИК оборудование',
        children: [
          { name: 'ИК', prefix: 'IR', color: '#ec7063' },
        ],
      },
      {
        name: 'Пайка и ремонт',
        children: [
          { name: 'Паяльное оборудование', prefix: 'SLD', color: '#e74c3c' },
        ],
      },
      {
        name: 'Оптика',
        children: [
          { name: 'Лупы и микроскопы', prefix: 'OPT', color: '#48c9b0' },
        ],
      },
      {
        name: 'Диагностика',
        children: [
          { name: 'Автосканеры', prefix: 'SCN', color: '#5d6d7e' },
        ],
      },
      { name: 'Инструмент', prefix: 'TOL', color: '#7d3c98' },
    ],
  },
  {
    name: 'Платы и модули',
    color: '#4f7c68',
    children: [
      { name: 'Макетные платы', prefix: 'BRD', color: '#1e8449' },
      {
        name: 'Модули',
        children: [
          { name: 'Arduino', prefix: 'ARD', color: '#00979d' },
          { name: 'ESP32 / ESP8266', prefix: 'ESP', color: '#e67e22' },
          { name: 'STM32', prefix: 'STM', color: '#2c3e50' },
          { name: 'Радиомодули', prefix: 'RF', color: '#8e44ad' },
          { name: 'Датчики', prefix: 'SNS', color: '#27ae60' },
          { name: 'Интерфейсы', prefix: 'IF', color: '#16a085' },
          { name: 'Прочие модули', prefix: 'MOD', color: '#7f8c8d' },
        ],
      },
    ],
  },
  {
    name: 'Акустика',
    color: '#922b21',
    children: [
      { name: 'Динамики', prefix: 'SPK', color: '#c0392b' },
      { name: 'Колонки', prefix: 'AUD', color: '#a93226' },
    ],
  },
  {
    name: 'Антенны и ВЧ',
    color: '#1a5276',
    children: [
      { name: 'Антенны', prefix: 'ANT', color: '#2874a6' },
      { name: 'SDR приёмники', prefix: 'SDR', color: '#1f618d' },
    ],
  },
  {
    name: 'Расходные материалы',
    color: '#b9770e',
    children: [
      {
        name: 'Термоинтерфейсы',
        children: [
          { name: 'Термопаста', prefix: 'THP', color: '#d68910' },
        ],
      },
      {
        name: 'Чистящие материалы',
        children: [
          { name: 'Салфетки', prefix: 'CLN', color: '#f5b041' },
        ],
      },
      {
        name: 'Прочие расходники',
        children: [
          { name: 'Расходники', prefix: 'CON', color: '#dc7633' },
        ],
      },
    ],
  },
  {
    name: 'Упаковка',
    color: '#566573',
    children: [
      {
        name: 'Упаковочные материалы',
        children: [
          { name: 'Упаковочные изделия', prefix: 'PKG', color: '#5d6d7e' },
          { name: 'Пакеты', prefix: 'BAG', color: '#85929e' },
        ],
      },
    ],
  },
];


const MERGE_ALIASES: Record<string, string> = {
  'Моторы и драйверы': 'Драйверы',
  'Питание': 'Блоки питания',
  'Дисплеи': 'Экраны',
  'Кабели': 'Кабельная продукция',
  'Упаковки': 'Упаковочные изделия',
  'Измеритель': 'Измерители',
};


const PREFIX_TO_LEAF: Record<string, string> = {
  MCU: 'Контроллеры',
  DRV: 'Драйверы',
  IND: 'Индикаторы',
  LED: 'Светодиоды',
  RLY: 'Реле',
  BTN: 'Кнопки и клавиатуры',
  RES: 'Резисторы',
  CAP: 'Конденсаторы',
  CON: 'Расходники',
  RAM: 'ОЗУ',
  MOT: 'Двигатели',
  SRV: 'Сервоприводы',
  FAN: 'Вентиляторы',
  RDT: 'Радиаторы',
  CAB: 'Кабель',
  JMP: 'Перемычки',
  ADP: 'Переходники',
  CNR: 'Коннекторы',
  TIE: 'Стяжки',
  VNT: 'Винты и метизы',
  SSD: 'SSD накопители',
  HDD: 'HDD накопители',
  STO: 'Накопители',
  SDC: 'Карты памяти и ридеры',
  DSP: 'Экраны',
  ECR: 'Экраны',
  PSU: 'Блоки питания',
  DCDC: 'Преобразователи DC-DC',
  BAT: 'Аккумуляторы',
  TST: 'Тестеры',
  IZM: 'Измерители',
  PRM: 'Пирометры',
  RMT: 'Пульты',
  IR: 'ИК',
  SLD: 'Паяльное оборудование',
  OPT: 'Лупы и микроскопы',
  SCN: 'Автосканеры',
  TOL: 'Инструмент',
  BRD: 'Макетные платы',
  ARD: 'Arduino',
  ESP: 'ESP32 / ESP8266',
  STM: 'STM32',
  RF: 'Радиомодули',
  SNS: 'Датчики',
  IF: 'Интерфейсы',
  MOD: 'Прочие модули',
  MTR: 'Драйверы',
  PWR: 'Блоки питания',
  SPK: 'Динамики',
  AUD: 'Колонки',
  ANT: 'Антенны',
  SDR: 'SDR приёмники',
  THP: 'Термопаста',
  THT: 'Термопаста',
  CLN: 'Салфетки',
  SLF: 'Салфетки',
  PKG: 'Упаковочные изделия',
  BAG: 'Пакеты',
  PK: 'Пакеты',
  DINAMI: 'Динамики',
  NBR: 'Сервоприводы',
};

type NameRule = { leaf: string; match: RegExp };

const NAME_RULES: NameRule[] = [
  { leaf: 'Arduino', match: /\barduino\b|\buno\b|\bnano\b|\bmega\b/i },
  { leaf: 'ESP32 / ESP8266', match: /esp32|esp8266|esp-?01|wemos|node.?mcu/i },
  { leaf: 'STM32', match: /stm32|blue.?pill|black.?pill/i },
  { leaf: 'Радиомодули', match: /nrf24|cc1101|lora|sx127|rfm|радиомодул/i },
  { leaf: 'Датчики', match: /датчик|sensor|dht|bme|bmp|mpu|hc-?sr|sw-520|уровн/i },
  { leaf: 'Экраны', match: /oled|lcd|tft|дисплей|display|ssd1306|st7789|экран/i },
  { leaf: 'Сервоприводы', match: /servo|серво|sg90|mg90/i },
  { leaf: 'Двигатели', match: /шагов|stepper|nema|мотор(?!ы и)|двигател/i },
  { leaf: 'Драйверы', match: /драйвер|a4988|drv8825|l298|pca9685/i },
  { leaf: 'Макетные платы', match: /макетн|breadboard|mb-?102/i },
  { leaf: 'Кабель', match: /кабел|dupont|usb\s*кабел|type-?a|type-?b|программатор baofeng/i },
  { leaf: 'Перемычки', match: /перемыч/i },
  { leaf: 'Переходники', match: /переходник|адаптер|bnc|sma-female/i },
  { leaf: 'Стяжки', match: /стяжк/i },
  { leaf: 'Винты и метизы', match: /винт|метиз/i },
  { leaf: 'Блоки питания', match: /блок питания|laboratory|dingce|dc305|универсальный\s*3-12/i },
  { leaf: 'Преобразователи DC-DC', match: /dc-?dc|понижающ|xl6009|lm2596|преобразовател/i },
  { leaf: 'Аккумуляторы', match: /аккумулятор|18650|батарейк/i },
  { leaf: 'Тестеры', match: /тестер|lcr-?t4|keweisi|kws-v20|сервотестер/i },
  { leaf: 'Пирометры', match: /пирометр/i },
  { leaf: 'Пульты', match: /пульт/i },
  { leaf: 'ИК', match: /\bик\b|инфракрас|ky-005|ky-008/i },
  { leaf: 'Паяльное оборудование', match: /паяльник|пайк/i },
  { leaf: 'Лупы и микроскопы', match: /лупа|микроскоп/i },
  { leaf: 'Автосканеры', match: /obd|elm327|сканер диагностич/i },
  { leaf: 'HDD накопители', match: /\bhdd\b|western digital|жестк/i },
  { leaf: 'SSD накопители', match: /\bssd\b/i },
  { leaf: 'ОЗУ', match: /оперативн|lddr|ddr\d|озу|память/i },
  { leaf: 'Радиаторы', match: /радиатор/i },
  { leaf: 'Вентиляторы', match: /вентилятор|кулер/i },
  { leaf: 'Термопаста', match: /термопаст|mx-4/i },
  { leaf: 'Салфетки', match: /салфетк/i },
  { leaf: 'Пакеты', match: /зип-?пакет|пакет с пакет/i },
  { leaf: 'Упаковочные изделия', match: /упаковк/i },
  { leaf: 'Резисторы', match: /резистор/i },
  { leaf: 'Конденсаторы', match: /конденсатор/i },
  { leaf: 'Светодиоды', match: /светодиод(?!н)/i },
  { leaf: 'Индикаторы', match: /индикатор|сегментн/i },
  { leaf: 'Реле', match: /реле|релейн/i },
  { leaf: 'Кнопки и клавиатуры', match: /кнопк|матриц/i },
  { leaf: 'Динамики', match: /динамик/i },
  { leaf: 'Колонки', match: /колонк/i },
  { leaf: 'Антенны', match: /антенн/i },
  { leaf: 'SDR приёмники', match: /rtl\s*sdr|sdr|радиосканер/i },
  { leaf: 'Карты памяти и ридеры', match: /сд\s*ридер|card\s*reader|mini\s*sd|кард-?ридер/i },
  { leaf: 'Контроллеры', match: /контроллер|программатор eeprom|ch341|rv1106|risc-?v/i },
  { leaf: 'Прочие модули', match: /модул|module|щит|shield|joystick|джойстик|rfid|часы|ds1302|лазерн.*модул/i },
];

function skuPrefix(sku: string | null | undefined): string | null {
  const raw = String(sku || '').trim().toUpperCase();
  if (!raw) return null;
  const m = raw.match(/^([A-ZА-ЯЁ]{1,8})/);
  return m ? m[1].replace(/Ё/g, 'Е') : null;
}

function ensureNode(db: Database.Database, node: NodeDef, parentId: number | null, leafMap: Map<string, any>) {
  let row = db.prepare('SELECT * FROM categories WHERE lower(name) = lower(?)').get(node.name) as any;
  if (!row) {
    const inserted = db.prepare(
      'INSERT INTO categories (name, color, parent_id, sku_prefix, archived) VALUES (?, ?, ?, ?, 0)',
    ).run(node.name, node.color || '#397c74', parentId, node.prefix || null);
    row = db.prepare('SELECT * FROM categories WHERE id = ?').get(inserted.lastInsertRowid);
  } else {
    db.prepare(`UPDATE categories SET
      parent_id = ?, color = COALESCE(?, color),
      sku_prefix = CASE WHEN ? IS NOT NULL THEN ? ELSE sku_prefix END,
      archived = 0
      WHERE id = ?`).run(parentId, node.color || null, node.prefix || null, node.prefix || null, row.id);
    row = db.prepare('SELECT * FROM categories WHERE id = ?').get(row.id);
  }
  if (node.prefix) leafMap.set(node.prefix.toUpperCase(), row);
  leafMap.set(`name:${node.name.toLowerCase()}`, row);
  for (const child of node.children || []) ensureNode(db, child, row.id, leafMap);
}

function resolveLeaf(db: Database.Database, leafMap: Map<string, any>, name: string): any | null {
  const direct = leafMap.get(`name:${name.toLowerCase()}`);
  if (direct) return direct;
  return db.prepare('SELECT * FROM categories WHERE lower(name) = lower(?) AND archived = 0').get(name) as any;
}

function mergeCategory(db: Database.Database, sourceId: number, targetName: string, leafMap: Map<string, any>) {
  const target = resolveLeaf(db, leafMap, targetName);
  if (!target || target.id === sourceId) return;
  db.prepare('UPDATE items SET category = ? WHERE category = (SELECT name FROM categories WHERE id = ?)').run(target.name, sourceId);
  db.prepare('UPDATE item_templates SET category = ? WHERE category = (SELECT name FROM categories WHERE id = ?)').run(target.name, sourceId);
  db.prepare('UPDATE categories SET parent_id = ? WHERE parent_id = ?').run(target.id, sourceId);
  db.prepare('UPDATE categories SET archived = 1 WHERE id = ?').run(sourceId);
}

export function syncCategoryTaxonomy(db: Database.Database) {
  const leafMap = new Map<string, any>();
  const tx = db.transaction(() => {
    for (const root of TAXONOMY) ensureNode(db, root, null, leafMap);


    const prefixFixes: Array<[string, string]> = [
      ['Конденсаторы', 'CAP'],
      ['Коннекторы', 'CNR'],
      ['Термопаста', 'THP'],
      ['Экраны', 'DSP'],
      ['Перемычки', 'JMP'],
      ['Салфетки', 'CLN'],
      ['Расходники', 'CON'],
    ];
    for (const [name, prefix] of prefixFixes) {
      db.prepare('UPDATE categories SET sku_prefix = ?, archived = 0 WHERE lower(name) = lower(?)').run(prefix, name);
    }


    for (const [from, to] of Object.entries(MERGE_ALIASES)) {
      const src = db.prepare('SELECT * FROM categories WHERE lower(name) = lower(?)').get(from) as any;
      if (src) mergeCategory(db, src.id, to, leafMap);
    }


    const displays = db.prepare("SELECT * FROM categories WHERE lower(name) = lower('Дисплеи') AND archived = 0").get() as any;
    if (displays) mergeCategory(db, displays.id, 'Экраны', leafMap);


    const orphanTool = db.prepare("SELECT * FROM categories WHERE lower(name) = lower('Инструмент')").get() as any;
    const toolsRoot = db.prepare("SELECT * FROM categories WHERE lower(name) = lower('Инструменты и оборудование')").get() as any;
    if (orphanTool && toolsRoot && orphanTool.parent_id !== toolsRoot.id) {
      db.prepare('UPDATE categories SET parent_id = ?, sku_prefix = COALESCE(sku_prefix, ?), archived = 0 WHERE id = ?')
        .run(toolsRoot.id, 'TOL', orphanTool.id);
    }


    leafMap.clear();
    const all = db.prepare('SELECT * FROM categories WHERE archived = 0').all() as any[];
    for (const cat of all) {
      leafMap.set(`name:${String(cat.name).toLowerCase()}`, cat);
      if (cat.sku_prefix) leafMap.set(String(cat.sku_prefix).toUpperCase(), cat);
    }

    const items = db.prepare('SELECT id, name, sku, category FROM items').all() as any[];
    let updated = 0;
    for (const item of items) {
      let leaf: any = null;
      const prefix = skuPrefix(item.sku);
      if (prefix) {
        const mappedName = PREFIX_TO_LEAF[prefix];
        if (mappedName) leaf = resolveLeaf(db, leafMap, mappedName);
        if (!leaf) leaf = leafMap.get(prefix) || null;
      }
      if (!leaf) {
        const hit = NAME_RULES.find((rule) => rule.match.test(item.name || ''));
        if (hit) leaf = resolveLeaf(db, leafMap, hit.leaf);
      }
      if (!leaf) continue;
      if (item.category === leaf.name) continue;
      db.prepare('UPDATE items SET category = ? WHERE id = ?').run(leaf.name, item.id);
      updated += 1;
    }


    const junk = ['Моторы и драйверы', 'Питание', 'Дисплеи'];
    for (const name of junk) {
      const row = db.prepare('SELECT * FROM categories WHERE lower(name) = lower(?)').get(name) as any;
      if (!row) continue;
      const itemsLeft = Number((db.prepare('SELECT COUNT(*) AS c FROM items WHERE category = ?').get(row.name) as any)?.c || 0);
      const children = Number((db.prepare('SELECT COUNT(*) AS c FROM categories WHERE parent_id = ? AND archived = 0').get(row.id) as any)?.c || 0);
      if (itemsLeft === 0 && children === 0) {
        db.prepare('UPDATE categories SET archived = 1 WHERE id = ?').run(row.id);
      }
    }

    return updated;
  });

  const updated = tx();
  const roots = db.prepare('SELECT name FROM categories WHERE parent_id IS NULL AND archived = 0 ORDER BY name').all() as any[];
  return { roots: roots.map((r) => r.name), updated };
}
