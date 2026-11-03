import { ReactNode, useEffect, useMemo, useState } from 'react';
import CategoryPicker from './CategoryPicker';
import FloatingWidget from './FloatingWidget';
import PhotoLightbox from './PhotoLightbox';
import { useCurrency } from '../currency';

type Panel = 'edit' | 'condition' | 'ledger' | 'in' | 'out' | 'move';

type Props = {
  item?: any;
  barcode?: string;
  receipt?: boolean;
  onClose: () => void;
  onSaved: () => void;
  onNotice: (message: string) => void;
  onChanged: () => void;
  canEdit?: boolean;
};

function offsetFor(panel: Panel | 'card', index: number) {
  const base = { card: 0, edit: 36, condition: 56, ledger: 72, in: 48, out: 48, move: 48 }[panel] || 0;
  return {
    x: Math.max(24, Math.round(window.innerWidth / 2 - 320) + base + index * 18),
    y: Math.max(88, Math.round(window.innerHeight * 0.1) + base + index * 12),
  };
}

const CATEGORY_TEMPLATE_KEYS = [
  'default_min_stock', 'default_max_stock', 'default_reorder_point', 'default_brand',
  'default_track_serials', 'default_track_lots', 'default_lot_policy',
  'default_price_basis', 'default_package_qty', 'default_unit_id', 'default_storage_note',
] as const;

function resolveCategoryTemplateClient(selected: any, categories: any[]) {
  const byId = new Map(categories.map((entry) => [entry.id, entry]));
  const result: Record<string, any> = {};
  let current = selected;
  const seen = new Set<number>();
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    for (const key of CATEGORY_TEMPLATE_KEYS) {
      if (result[key] == null && current[key] != null && current[key] !== '') result[key] = current[key];
    }
    current = current.parent_id ? byId.get(current.parent_id) : null;
  }
  return result;
}

function applyCategoryTemplateToForm(current: any, selected: any, categories: any[], overwriteOnCreate: boolean) {
  const tpl = resolveCategoryTemplateClient(selected, categories);
  const next = { ...current };
  const empty = (value: any, kind?: string) => {
    if (kind === 'min') return value == null || value === '' || Number(value) === 0;
    if (kind === 'bool') return !value;
    if (kind === 'basis') return !value || value === 'unit';
    if (kind === 'lot') return !value || value === 'fifo';
    return value == null || value === '';
  };
  const take = (formKey: string, defKey: string, map: (v: any) => any, kind?: string) => {
    if (tpl[defKey] == null || tpl[defKey] === '') return;
    if (!overwriteOnCreate && !empty(next[formKey], kind)) return;
    if (overwriteOnCreate && !empty(next[formKey], kind) && formKey !== 'min_stock' && formKey !== 'unit_id') {

      if (!empty(next[formKey], kind)) return;
    }
    next[formKey] = map(tpl[defKey]);
  };
  take('min_stock', 'default_min_stock', (v) => Number(v) || 0, 'min');
  take('max_stock', 'default_max_stock', (v) => String(v));
  take('reorder_point', 'default_reorder_point', (v) => String(v));
  take('brand', 'default_brand', (v) => String(v));
  take('track_serials', 'default_track_serials', (v) => Boolean(Number(v)), 'bool');
  take('track_lots', 'default_track_lots', (v) => Boolean(Number(v)), 'bool');
  take('lot_policy', 'default_lot_policy', (v) => String(v), 'lot');
  take('price_basis', 'default_price_basis', (v) => (v === 'package' ? 'package' : 'unit'), 'basis');
  take('package_qty', 'default_package_qty', (v) => String(v));
  take('unit_id', 'default_unit_id', (v) => String(v));
  take('storage_note', 'default_storage_note', (v) => String(v));
  return next;
}

export default function ItemDialog({
  item: initialItem,
  barcode,
  receipt,
  onClose,
  onSaved,
  onNotice,
  onChanged,
  canEdit = true,
}: Props) {
  const { symbol } = useCurrency();
  const [item, setItem] = useState(initialItem);
  const [locations, setLocations] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [units, setUnits] = useState<any[]>([]);
  const [photos, setPhotos] = useState<any[]>([]);
  const [purchasePrices, setPurchasePrices] = useState<any[]>([]);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [templates, setTemplates] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [skuWarning, setSkuWarning] = useState('');
  const [panels, setPanels] = useState<Set<Panel>>(() => {
    if (receipt || !initialItem) return new Set<Panel>(['edit']);
    return new Set<Panel>();
  });
  const [ledger, setLedger] = useState<any | null>(null);
  const [ledgerFilter, setLedgerFilter] = useState({ type: '', reason: '', source: '' });
  const [conditions, setConditions] = useState<any>({ ok: 0, check: 0, bad: 0, repair: 0, scrap: 0, on_hand: 0 });
  const [analogs, setAnalogs] = useState<any[]>([]);
  const [analogPick, setAnalogPick] = useState('');
  const [catalog, setCatalog] = useState<any[]>([]);
  const [chars, setChars] = useState<any[]>([]);
  const [charName, setCharName] = useState('');
  const [charValue, setCharValue] = useState('');
  const [charHints, setCharHints] = useState<string[]>([]);
  const [kitParts, setKitParts] = useState<any[]>([]);
  const [kitPick, setKitPick] = useState('');
  const [kitQty, setKitQty] = useState(1);
  const [bomVersions, setBomVersions] = useState<any[]>([]);
  const [bomVersionId, setBomVersionId] = useState<number | ''>('');
  const [techOps, setTechOps] = useState<any[]>([]);
  const [techTitle, setTechTitle] = useState('');
  const [techMinutes, setTechMinutes] = useState(15);
  const [variantLabel, setVariantLabel] = useState('');
  const [variantBusy, setVariantBusy] = useState(false);
  const [packFormQty, setPackFormQty] = useState(40);
  const [packFormPrice, setPackFormPrice] = useState('');
  const [packKind, setPackKind] = useState<'pack' | 'set' | 'kit'>('pack');
  const [packBusy, setPackBusy] = useState(false);
  const [usedInPacks, setUsedInPacks] = useState<any[]>([]);
  const [unpackLocId, setUnpackLocId] = useState('');
  const [unpackQty, setUnpackQty] = useState(1);
  const [unpackContentQty, setUnpackContentQty] = useState('');
  const [unpackBusy, setUnpackBusy] = useState(false);
  const [customFields, setCustomFields] = useState<any[]>([]);
  const [customValues, setCustomValues] = useState<Record<string, string>>({});
  const [demand, setDemand] = useState<any | null>(null);

  const ITEM_TYPE_RU: Record<string, string> = {
    product: 'Товар',
    service: 'Услуга',
    pack: 'Упаковка',
    set: 'Набор',
    kit: 'Комплект',
  };
  const isBomType = (t: string) => ['pack', 'set', 'kit'].includes(String(t || ''));
  const bomSectionTitle = (t: string) => (
    t === 'pack' ? 'Состав упаковки' : t === 'set' ? 'Состав набора' : 'Состав комплекта'
  );
  const primaryBarcode = barcode || item?.barcodes?.[0] || item?.barcode || '';
  const extraBarcodes = (item?.barcodes?.slice?.(1) || []).filter((code: string) => code !== primaryBarcode);
  const [barcodes, setBarcodes] = useState<string[]>([primaryBarcode, ...extraBarcodes]);
  const [form, setForm] = useState({
    name: item?.name || '',
    print_name: item?.print_name || '',
    description: item?.description || '',
    sku: item?.sku || '',
    category: item?.category || '',
    unit_id: String(item?.unit_id || ''),
    sale_price: item?.sale_price == null ? '' : String(item.sale_price),
    cost_price: item?.cost_price == null ? '' : String(item.cost_price),
    price_basis: item?.price_basis === 'package' ? 'package' : 'unit',
    origin: item?.origin || '',
    manufacturer: item?.manufacturer || '',
    brand: item?.brand || '',
    package_qty: item?.package_qty == null ? '' : String(item.package_qty),
    weight_g: item?.weight_g == null ? '' : String(item.weight_g),
    storage_note: item?.storage_note || '',
    supplier_sku: item?.supplier_sku || '',
    purchase_url: item?.purchase_url || '',
    lead_time_days: item?.lead_time_days == null ? '' : String(item.lead_time_days),
    moq: item?.moq == null ? '' : String(item.moq),
    pack_multiple: item?.pack_multiple == null ? '' : String(item.pack_multiple),
    item_type: item?.item_type || 'product',
    track_lots: Boolean(item?.track_lots),
    track_serials: Boolean(item?.track_serials),
    lot_policy: item?.lot_policy || 'fifo',
    min_stock: item?.min_stock ?? 0,
    max_stock: item?.max_stock == null ? '' : String(item.max_stock),
    reorder_point: item?.reorder_point == null ? '' : String(item.reorder_point),
    location_id: '',
    quantity: receipt ? 1 : 0,
  });

  const showCard = Boolean(item && !receipt);

  function openPanel(panel: Panel) {
    setPanels((current) => new Set(current).add(panel));
  }

  function closePanel(panel: Panel) {
    setPanels((current) => {
      const next = new Set(current);
      next.delete(panel);
      return next;
    });
  }

  function closeEditOrDialog() {
    if (showCard) closePanel('edit');
    else onClose();
  }

  useEffect(() => {
    setItem(initialItem);
  }, [initialItem]);

  useEffect(() => {
    (window as any).api.getLocations().then(setLocations).catch(() => setError('Не удалось загрузить ячейки'));
    (window as any).api.getCategories().then((rows: any[]) => setCategories((rows || []).filter((category) => !(category.archived ?? 0))));
    (window as any).api.getUnits().then((nextUnits: any[]) => {
      setUnits(nextUnits || []);
      if (!item?.unit_id) {
        const defaultUnit = (nextUnits || []).find((unit) => unit.symbol === 'шт.');
        if (defaultUnit) setForm((current) => ({ ...current, unit_id: String(defaultUnit.id) }));
      }
    });
    (window as any).api.getTemplates().then(setTemplates);
    if (item?.id) {
      (window as any).api.getItemPhotos(item.id).then(setPhotos);
      (window as any).api.listItemPurchasePrices?.(item.id).then(setPurchasePrices).catch(() => setPurchasePrices([]));
    } else {
      setPurchasePrices([]);
    }
  }, [item?.id]);

  const ledgerOpen = panels.has('ledger');
  const conditionOpen = panels.has('condition');

  useEffect(() => {
    if (!item?.id || !ledgerOpen) return;
    (window as any).api.getItemLedger(item.id, ledgerFilter).then(setLedger).catch(() => setLedger({ summary: {}, current: 0, timeline: [] }));
  }, [item?.id, ledgerOpen, ledgerFilter]);

  useEffect(() => {
    if (!item?.id) return;
    if (!showCard && !conditionOpen) return;
    (window as any).api.getItemConditions(item.id).then(setConditions).catch(() => {});
  }, [item?.id, showCard, conditionOpen]);

  useEffect(() => {
    if (!item?.id || !showCard) { setAnalogs([]); setChars([]); setKitParts([]); setDemand(null); return; }
    (window as any).api.listItemAnalogs(item.id).then(setAnalogs).catch(() => setAnalogs([]));
    (window as any).api.listItemCharacteristics?.(item.id).then(setChars).catch(() => setChars([]));
    void (async () => {
      try {
        const versions = await (window as any).api.listBomVersions?.(item.id);
        setBomVersions(versions || []);
        const def = (versions || []).find((v: any) => v.is_default) || (versions || [])[0];
        const vid = def ? Number(def.id) : '';
        setBomVersionId(vid);
        if (vid) {
          setKitParts(await (window as any).api.listKitComponents(item.id, vid) || []);
          setTechOps(await (window as any).api.listTechOperations(item.id, vid) || []);
        } else {
          setKitParts(await (window as any).api.listKitComponents?.(item.id) || []);
          setTechOps([]);
        }
      } catch {
        setBomVersions([]);
        setBomVersionId('');
        (window as any).api.listKitComponents?.(item.id).then(setKitParts).catch(() => setKitParts([]));
        setTechOps([]);
      }
    })();
    (window as any).api.listItemParentKits?.(item.id).then(setUsedInPacks).catch(() => setUsedInPacks([]));
    (window as any).api.getItems().then((rows: any[]) => setCatalog(rows || [])).catch(() => setCatalog([]));
    (window as any).api.listCharacteristicHints?.().then((rows: string[]) => setCharHints(rows || [])).catch(() => setCharHints([]));
    (window as any).api.getItemDemand?.(item.id, { horizonDays: 30 })
      .then((row: any) => setDemand(row || null))
      .catch(() => setDemand(null));
  }, [item?.id, showCard]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let defs: any[] = [];
      try {
        defs = (await (window as any).api.listCustomFields?.()) || [];
      } catch {
        defs = Array.isArray(item?.custom_fields) ? item.custom_fields : [];
      }
      if (cancelled) return;
      setCustomFields(defs);
      const fromItem = Array.isArray(item?.custom_values) ? item.custom_values : [];
      const next: Record<string, string> = {};
      for (const def of defs) {
        const key = String(def.field_key);
        const hit = fromItem.find((row: any) => String(row.field_key) === key || Number(row.field_id) === Number(def.id));
        if (def.field_type === 'bool') next[key] = hit?.value_text === '1' ? '1' : '0';
        else next[key] = hit?.value_text != null ? String(hit.value_text) : '';
      }
      setCustomValues(next);
    })();
    return () => { cancelled = true; };
  }, [item?.id, item?.custom_values]);

  useEffect(() => {
    const sku = String(form.sku || '').trim();
    if (!sku) { setSkuWarning(''); return; }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const result = await (window as any).api.checkSku(sku, item?.id);
        if (cancelled) return;
        setSkuWarning(result.available ? '' : `Артикул уже используется товаром «${result.conflict?.name || result.conflict?.id}»`);
      } catch {
        if (!cancelled) setSkuWarning('');
      }
    }, 250);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [form.sku, item?.id]);

  const customInputsKey = useMemo(() => {
    const o: Record<string, string> = {};
    for (const field of customFields) {
      if (field.field_type === 'formula') continue;
      o[String(field.field_key)] = customValues[String(field.field_key)] ?? '';
    }
    return JSON.stringify(o);
  }, [customFields, customValues]);

  useEffect(() => {
    const formulaFields = customFields.filter((f) => f.field_type === 'formula' && String(f.formula || '').trim());
    if (!formulaFields.length || !(window as any).api.evalCustomFieldFormula) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      let inputs: Record<string, string> = {};
      try { inputs = JSON.parse(customInputsKey); } catch { inputs = {}; }
      const itemCtx = {
        cost_price: form.cost_price,
        sale_price: form.sale_price,
        min_stock: form.min_stock,
        max_stock: form.max_stock,
        reorder_point: form.reorder_point,
        package_qty: form.package_qty,
        lead_time_days: form.lead_time_days,
        weight_g: form.weight_g,
        moq: form.moq,
        pack_multiple: form.pack_multiple,
        on_hand: item?.on_hand ?? item?.total_qty ?? 0,
        available: item?.available ?? item?.total_qty ?? 0,
        reserved: item?.reserved ?? 0,
      };
      const next: Record<string, string> = {};
      for (const field of formulaFields) {
        try {
          const result = await (window as any).api.evalCustomFieldFormula({
            formula: field.formula,
            item: itemCtx,
            custom_values: inputs,
          });
          next[String(field.field_key)] = result?.error ? '' : String(result?.value ?? '');
        } catch {
          next[String(field.field_key)] = '';
        }
      }
      if (cancelled) return;
      setCustomValues((current) => {
        let changed = false;
        const merged = { ...current };
        for (const [key, value] of Object.entries(next)) {
          if (merged[key] !== value) { merged[key] = value; changed = true; }
        }
        return changed ? merged : current;
      });
    }, 200);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [
    customFields, customInputsKey, form.cost_price, form.sale_price, form.min_stock, form.max_stock,
    form.reorder_point, form.package_qty, form.lead_time_days, form.weight_g, form.moq, form.pack_multiple,
    item?.on_hand, item?.available, item?.reserved, item?.total_qty,
  ]);

  const categoryOptions = (() => {
    const map = new Map(categories.map((category) => [category.id, category]));
    const pathOf = (category: any): string => {
      const chain: string[] = [];
      let current = category;
      const seen = new Set<number>();
      while (current && !seen.has(current.id)) {
        seen.add(current.id);
        chain.unshift(current.name);
        current = current.parent_id ? map.get(current.parent_id) : null;
      }
      return chain.join(' / ');
    };
    return [...categories]
      .map((category) => ({ ...category, path: pathOf(category) }))
      .sort((left, right) => left.path.localeCompare(right.path, 'ru'));
  })();

  const update = (field: string, value: string | number | boolean) => setForm((current) => ({ ...current, [field]: value }));
  const updateBarcode = (index: number, value: string) => setBarcodes((current) => current.map((code, i) => i === index ? value : code));
  const removeBarcode = (index: number) => setBarcodes((current) => current.filter((_, i) => i !== index));
  const addBarcode = () => setBarcodes((current) => [...current, '']);
  const payload = () => ({
    ...form,
    barcode: barcodes[0] || '',
    barcodes: barcodes.filter((code) => code.trim()),
    custom_values: customValues,
  });

  async function reloadItem(id: number) {
    try {
      const fresh = await (window as any).api.getItemById(id);
      if (fresh) setItem(fresh);
    } catch {  }
  }

  async function printLabels() {
    try {
      const result = await (window as any).api.printItemLabels(item.id);
      if (result === 'printed') onNotice('Этикетки отправлены на печать');
      else if (result) onNotice(`Этикетки сохранены и открыты: ${result}`);
      else onNotice('Печать этикеток отменена');
    } catch (printError: any) {
      onNotice(printError?.message || 'Не удалось создать этикетки');
    }
  }

  async function printSerialLabels(serials?: string[]) {
    try {
      const result = await (window as any).api.printSerialLabels(item.id, serials);
      if (result) onNotice(`Этикетки S/N сохранены: ${result}`);
      else onNotice('Печать этикеток серий отменена');
    } catch (e: any) {
      onNotice(e?.message || 'Не удалось создать этикетки серий');
    }
  }

  async function createVariant() {
    if (!item?.id || !variantLabel.trim()) return;
    setVariantBusy(true);
    setError('');
    try {
      const created = await (window as any).api.createItemVariant(item.id, { variant_label: variantLabel.trim() });
      setVariantLabel('');
      onNotice(`Вариант создан: ${created.sku || created.name}`);
      onChanged();
      await reloadItem(item.id);
    } catch (e: any) {
      setError(e?.message || 'Не удалось создать вариант');
    } finally {
      setVariantBusy(false);
    }
  }

  async function createPackCard() {
    if (!item?.id || !(packFormQty > 0)) return;
    setPackBusy(true);
    setError('');
    try {
      const created = await (window as any).api.createPackFromItem(item.id, {
        quantity: packFormQty,
        sale_price: packFormPrice === '' ? null : Number(packFormPrice),
        item_type: packKind,
      });
      onNotice(`Создано: ${created.name} · ${created.sku || 'без артикула'}`);
      onChanged();
      const next = await (window as any).api.getItemById(created.id);
      if (next) setItem(next);
    } catch (e: any) {
      setError(e?.message || 'Не удалось создать упаковку');
    } finally {
      setPackBusy(false);
    }
  }

  async function generateSku() {
    try {
      const selected = categories.find((category) => category.name === form.category);
      const result = await (window as any).api.generateSku({
        categoryId: selected?.id || null,
        itemName: form.name,
        categoryName: form.category,
        name: form.name,
        category: form.category,
      });
      setForm((current: any) => ({ ...current, sku: result.sku }));
      onNotice(`Сгенерирован SKU: ${result.sku} (префикс: ${result.prefix})`);
    } catch (skuError: any) {
      setError(skuError?.message || 'Не удалось сгенерировать артикул');
    }
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    if (!canEdit) { setError('Недостаточно прав для изменения товара'); return; }
    if (!form.name.trim()) { setError('Заполните рабочее название товара'); return; }
    if (skuWarning && !window.confirm(`${skuWarning}. Сохранить всё равно?`)) return;
    try {
      const data = payload();
      const result = item ? await (window as any).api.updateItem(item.id, data) : await (window as any).api.createItem(data);
      if (!form.location_id && receipt) throw new Error('Для оприходования выберите ячейку');
      if (form.location_id) {
        const inventoryData = { item_id: item?.id || result.id, location_id: form.location_id, quantity: form.quantity, comment: receipt ? 'Оприходование сканером' : 'Карточка товара' };
        if (receipt) await (window as any).api.adjustInventory({ ...inventoryData, delta: form.quantity });
        else await (window as any).api.setInventory(inventoryData);
      }
      onChanged();
      if (item?.id) {
        await reloadItem(item.id);
        closePanel('edit');
        onNotice('Изменения сохранены');
      } else {
        onSaved();
      }
    } catch (saveError: any) {
      setError(saveError?.message || 'Не удалось сохранить товар');
    }
  }

  async function saveConditions(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    try {
      await (window as any).api.setItemConditions(item.id, conditions);
      onNotice('Состояние товара сохранено');
      closePanel('condition');
      onChanged();
      await reloadItem(item.id);
    } catch (e: any) {
      setError(e?.message || 'Не удалось сохранить состояние');
    }
  }

  const withPhotoPreview = (node: ReactNode) => (
    <>
      {node}
      {photoPreview ? (
        <PhotoLightbox
          src={photoPreview}
          alt={item?.name || form.name || 'Фото'}
          onClose={() => setPhotoPreview(null)}
        />
      ) : null}
    </>
  );

  const onHand = Number(item?.on_hand ?? (item?.stock || []).reduce((sum: number, stock: any) => sum + Number(stock.on_hand ?? stock.quantity ?? 0), 0));
  const reserved = Number(item?.reserved ?? (item?.stock || []).reduce((sum: number, stock: any) => sum + Number(stock.reserved || 0), 0));
  const available = Number(item?.available ?? Math.max(0, onHand - reserved));
  const category = categories.find((entry) => entry.name === item?.category);
  const categoryLabel = categoryOptions.find((entry) => entry.name === item?.category)?.path || item?.category;
  const unit = item?.unit_symbol || 'шт.';
  const packQty = Math.max(1, Number(item?.package_qty) || 1);
  const priceIsPack = item?.price_basis === 'package' && packQty > 1;
  const unitSale = item?.unit_sale_price != null ? Number(item.unit_sale_price)
    : (item?.sale_price != null ? (priceIsPack ? Number(item.sale_price) / packQty : Number(item.sale_price)) : null);
  const unitCost = item?.unit_cost_price != null ? Number(item.unit_cost_price)
    : (item?.cost_price != null ? (priceIsPack ? Number(item.cost_price) / packQty : Number(item.cost_price)) : null);
  const stockValue = item?.stock_value != null ? Number(item.stock_value)
    : (unitCost != null ? unitCost * onHand : null);
  const formPackQty = Math.max(1, Number(form.package_qty) || 1);
  const formPackBasis = form.price_basis === 'package' && formPackQty > 1;
  const formUnitSale = form.sale_price !== '' && Number.isFinite(Number(form.sale_price))
    ? (formPackBasis ? Number(form.sale_price) / formPackQty : Number(form.sale_price))
    : null;
  const formUnitCost = form.cost_price !== '' && Number.isFinite(Number(form.cost_price))
    ? (formPackBasis ? Number(form.cost_price) / formPackQty : Number(form.cost_price))
    : null;
  const previewSrc = item?.photo_url || photos[0]?.data_url || (item?.id ? `metrika-photo://${item.id}` : '');
  const cardPos = offsetFor('card', 0);
  const editPos = offsetFor('edit', showCard ? 1 : 0);

  return withPhotoPreview(
    <>
      {showCard && (
        <FloatingWidget
          title={item.name || 'Карточка товара'}
          open
          onClose={onClose}
          width={640}
          zIndex={1700}
          initialX={cardPos.x}
          initialY={cardPos.y}
        >
          <div className="item-card-float">
            <div className="modal-header" style={{ padding: 0, marginBottom: 12 }}>
              <div className="item-card-identity">
                {previewSrc ? (
                  <button type="button" className="item-card-photo-btn" title="Открыть фото" onClick={() => setPhotoPreview(photos[0]?.data_url || previewSrc)}>
                    <img className="item-card-photo" src={previewSrc} alt={item.name} />
                  </button>
                ) : null}
                <div>
                  <div className="section-label">Карточка товара</div>
                  <h2>{item.name}</h2>
                  {item.print_name && <div className="subtext">Для печати: {item.print_name}</div>}
                  {item.parent && (
                    <div className="subtext">
                      Вариант «{item.variant_label || '—'}» · номенклатура:{' '}
                      <button
                        type="button"
                        className="btn btn-text"
                        style={{ padding: 0 }}
                        onClick={async () => {
                          try {
                            const parent = await (window as any).api.getItemById(item.parent.id);
                            if (parent) setItem(parent);
                          } catch {  }
                        }}
                      >
                        {item.parent.name}
                      </button>
                    </div>
                  )}
                  <div className="item-detail-tags">
                    <span className="mono">{(item.barcodes || [item.barcode]).filter(Boolean).join(' · ') || 'Еще не определен'}</span>
                    {item.category && <span className="category-tag category-tag-full" style={{ backgroundColor: category?.color || '#64748b' }} title={categoryLabel}>{categoryLabel}</span>}
                  </div>
                  <div className="subtext">
                    Тип: {ITEM_TYPE_RU[item.item_type || 'product'] || item.item_type || 'Товар'}
                    {priceIsPack ? ' · Упаковочная закупка' : ''}
                    {' · '}Артикул: {item.sku || 'не указан'} · Минимум: {item.min_stock ?? 0}{item.reorder_point != null ? ` · Точка заказа: ${item.reorder_point}` : ''}{item.max_stock != null ? ` · Максимум: ${item.max_stock}` : ''} {unit}
                    {item.sale_price != null
                      ? (priceIsPack
                        ? ` · Цена: ${Number(item.sale_price).toLocaleString('ru-RU')} ${symbol}/уп.${packQty} (${Number(unitSale).toLocaleString('ru-RU', { maximumFractionDigits: 4 })} ${symbol}/${unit})`
                        : ` · Цена: ${Number(item.sale_price).toLocaleString('ru-RU')} ${symbol}`)
                      : ''}
                    {item.cost_price != null
                      ? (priceIsPack
                        ? ` · Учётная: ${Number(item.cost_price).toLocaleString('ru-RU')} ${symbol}/уп.`
                        : ` · Учётная: ${Number(item.cost_price).toLocaleString('ru-RU')} ${symbol}`)
                      : ''}
                    {stockValue != null ? ` · Остаток ≈ ${stockValue.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ${symbol}` : ''}
                  </div>
                  {(item.brand || item.manufacturer || item.origin) && (
                    <div className="subtext">
                      {[
                        item.brand && `Бренд: ${item.brand}`,
                        item.manufacturer && `Производитель: ${item.manufacturer}`,
                        item.origin && `Происхождение: ${item.origin}`,
                      ].filter(Boolean).join(' · ')}
                    </div>
                  )}
                  {Array.isArray(item.custom_values) && item.custom_values.some((row: any) => row.value_text != null && String(row.value_text) !== '') && (
                    <div className="subtext" style={{ marginTop: 6 }}>
                      {item.custom_values
                        .filter((row: any) => row.value_text != null && String(row.value_text) !== '')
                        .map((row: any) => {
                          const shown = row.field_type === 'bool'
                            ? (String(row.value_text) === '1' ? 'да' : 'нет')
                            : String(row.value_text);
                          return `${row.label}: ${shown}`;
                        })
                        .join(' · ')}
                    </div>
                  )}
                  {item.description && <p className="item-description">{item.description}</p>}
                </div>
              </div>
            </div>
            <div className="item-stock-summary stock-triple">
              <div><span>Физический</span><strong>{onHand} {unit}</strong></div>
              <div><span>Зарезервировано</span><strong>{reserved} {unit}</strong></div>
              <div><span>Доступно</span><strong>{available} {unit}</strong></div>
              <span className={`type-badge ${available <= Number(item.min_stock || 0) ? 'out' : (item.max_stock != null && available > Number(item.max_stock) ? 'out' : 'in')}`}>
                {available <= Number(item.min_stock || 0)
                  ? 'Ниже минимума'
                  : (item.max_stock != null && available > Number(item.max_stock) ? 'Выше максимума' : 'Запас в норме')}
              </span>
            </div>
            <div className="item-stock-summary stock-triple" style={{ marginTop: 8 }}>
              <div><span>Исправен</span><strong>{conditions.ok || 0}</strong></div>
              <div><span>На проверке</span><strong>{conditions.check || 0}</strong></div>
              <div><span>Неисправен / ремонт / списан</span><strong>{(conditions.bad || 0) + (conditions.repair || 0) + (conditions.scrap || 0)}</strong></div>
              <span className="type-badge in">Для проектов: {conditions.ok || 0} {unit}</span>
            </div>
            {demand && (
              <div className="item-stock-summary stock-triple" style={{ marginTop: 8 }}>
                <div>
                  <span>Прогноз расхода</span>
                  <strong>
                    {Number(demand.forecast_qty || 0).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} {unit}
                  </strong>
                  <div className="subtext">на {demand.forecast_horizon_days || 30} дн. · ср/день {demand.average_daily ?? 0}</div>
                </div>
                <div>
                  <span>Покрытие</span>
                  <strong>
                    {demand.coverage_days == null ? '—' : `${demand.coverage_days} дн.`}
                  </strong>
                  <div className="subtext">
                    {demand.runout_date ? `до нуля ≈ ${demand.runout_date}` : 'нет расхода или запас большой'}
                  </div>
                </div>
                <div>
                  <span>Тренд / сезон</span>
                  <strong>
                    {Number(demand.trend_pct) > 0 ? '+' : ''}{demand.trend_pct ?? 0}%
                  </strong>
                  <div className="subtext">сезон ×{demand.seasonal_factor ?? 1} · цель {demand.target_stock ?? 0}</div>
                </div>
                {Array.isArray(demand.daily) && demand.daily.length > 0 && (
                  <div className="field-wide" style={{ gridColumn: '1 / -1', marginTop: 4 }} title="Расход по дням (последние периоды)">
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 1, height: 36 }}>
                      {demand.daily.slice(-42).map((point: any) => {
                        const max = Math.max(1, ...demand.daily.slice(-42).map((p: any) => Number(p.qty) || 0));
                        const h = Math.max(2, Math.round(((Number(point.qty) || 0) / max) * 34));
                        return (
                          <span
                            key={point.day}
                            title={`${point.day}: ${point.qty}`}
                            style={{
                              flex: 1,
                              minWidth: 2,
                              height: h,
                              background: Number(point.qty) > 0 ? 'var(--primary)' : 'var(--border)',
                              opacity: Number(point.qty) > 0 ? 0.85 : 0.35,
                              borderRadius: 1,
                            }}
                          />
                        );
                      })}
                    </div>
                    <div className="subtext" style={{ marginTop: 4 }}>Расход за последние {Math.min(42, demand.daily.length)} дн.</div>
                  </div>
                )}
              </div>
            )}
            <div className="wizard-stock">
              <div className="section-label">Распределение по ячейкам</div>
              {item.stock?.length
                ? item.stock.map((stock: any) => (
                  <div className="wizard-stock-row" key={stock.id}>
                    <span>{stock.name}<small className="subtext">{stock.loc_barcode}</small></span>
                    <strong>{stock.on_hand ?? stock.quantity} физ. · {stock.reserved || 0} рез. · {stock.available ?? Math.max(0, Number(stock.on_hand ?? stock.quantity ?? 0) - Number(stock.reserved || 0))} дост.</strong>
                  </div>
                ))
                : <p>Товар пока не размещен в ячейках.</p>}
            </div>
            {purchasePrices.length > 0 && (
              <div className="wizard-stock" style={{ marginTop: 12 }}>
                <div className="section-label">История закупочных цен (за 1 ед.)</div>
                {purchasePrices.slice(0, 8).map((row: any) => (
                  <div className="wizard-stock-row" key={row.id}>
                    <span>
                      {Number(row.unit_price).toLocaleString('ru-RU', { maximumFractionDigits: 4 })} {symbol}
                      <small className="subtext">
                        {[row.supplier_name, row.order_no || row.document_ref, String(row.received_at || '').slice(0, 16)].filter(Boolean).join(' · ')}
                      </small>
                    </span>
                    <strong>×{row.quantity}</strong>
                  </div>
                ))}
              </div>
            )}
            {Array.isArray(item.lot_stock) && item.lot_stock.some((row: any) => row.lot_id > 0) && (
              <div className="wizard-stock" style={{ marginTop: 12 }}>
                <div className="section-label">Партии</div>
                {item.lot_stock.filter((row: any) => row.lot_id > 0).map((row: any) => (
                  <div className="wizard-stock-row" key={`${row.location_id}-${row.lot_id}`}>
                    <span>
                      {row.lot_no || `#${row.lot_id}`}
                      <small className="subtext">
                        {row.location_name}
                        {row.expiry_date ? ` · годен до ${row.expiry_date}` : ''}
                      </small>
                    </span>
                    <strong>{row.on_hand}</strong>
                  </div>
                ))}
              </div>
            )}
            {Number(item.track_serials) > 0 && (
              <div className="wizard-stock" style={{ marginTop: 12 }}>
                <div className="section-label">Серийные номера на остатке</div>
                {(item.serials_in_stock || []).length
                  ? (item.serials_in_stock || []).slice(0, 40).map((row: any) => (
                    <div className="wizard-stock-row" key={row.id}>
                      <span className="mono">
                        {row.serial_no}
                        <small className="subtext">{row.location_name || '—'}{row.lot_no ? ` · ${row.lot_no}` : ''}</small>
                      </span>
                      <button
                        type="button"
                        className="btn btn-text"
                        title="Этикетка этой серии"
                        onClick={() => void printSerialLabels([row.serial_no])}
                      >
                        Этикетка
                      </button>
                    </div>
                  ))
                  : <p className="subtext">Нет серий на остатке. Они появятся при приёмке PO или оприходовании.</p>}
                {(item.serials_in_stock || []).length > 40 && (
                  <p className="subtext">Показаны первые 40 из {(item.serials_in_stock || []).length}</p>
                )}
                {(item.serials_in_stock || []).length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <button type="button" className="btn btn-secondary" onClick={() => void printSerialLabels()}>
                      Печать всех S/N на остатке
                    </button>
                  </div>
                )}
              </div>
            )}
            {!item.parent_item_id && (
              <div className="wizard-stock" style={{ marginTop: 12 }}>
                <div className="section-label">Варианты (отдельные SKU)</div>
                {(item.variants || []).length
                  ? (item.variants || []).map((row: any) => (
                    <div className="wizard-stock-row" key={row.id}>
                      <span>
                        <button
                          type="button"
                          className="btn btn-text"
                          style={{ padding: 0 }}
                          onClick={async () => {
                            try {
                              const next = await (window as any).api.getItemById(row.id);
                              if (next) setItem(next);
                            } catch {  }
                          }}
                        >
                          {row.variant_label || row.name}
                        </button>
                        <small className="subtext mono">{row.sku || '—'}</small>
                      </span>
                      <strong>{row.on_hand} на ост.</strong>
                    </div>
                  ))
                  : <p className="subtext">Вариантов нет — добавьте цвет/размер как отдельную карточку с своим артикулом.</p>}
                {canEdit && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                    <input
                      style={{ flex: 1, minWidth: 140 }}
                      placeholder="Напр. Красный / XL / 220В"
                      value={variantLabel}
                      onChange={(e) => setVariantLabel(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') void createVariant(); }}
                    />
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={variantBusy || !variantLabel.trim()}
                      onClick={() => void createVariant()}
                    >
                      Добавить вариант
                    </button>
                  </div>
                )}
              </div>
            )}
            {!item.parent_item_id && !isBomType(item.item_type || 'product') && (
              <div className="wizard-stock" style={{ marginTop: 12 }}>
                <div className="section-label">Набор / комплект из нескольких товаров</div>
                <p className="subtext">
                  Для проводов с ценой за пачку используйте режим «Упаковочная закупка» в карточке (одна позиция).
                  Отдельную карточку pack/set/kit создавайте, если внутри разные товары или продаёте пачку целиком.
                </p>
                {usedInPacks.length > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    {usedInPacks.map((row: any) => (
                      <div className="wizard-stock-row" key={row.id}>
                        <span>
                          <button
                            type="button"
                            className="btn btn-text"
                            style={{ padding: 0 }}
                            onClick={async () => {
                              try {
                                const next = await (window as any).api.getItemById(row.id);
                                if (next) setItem(next);
                              } catch {  }
                            }}
                          >
                            {row.name}
                          </button>
                          <small className="subtext">{ITEM_TYPE_RU[row.item_type] || row.item_type} · ×{row.quantity} · {row.sale_price != null ? `${Number(row.sale_price).toLocaleString('ru-RU')} ${symbol}` : 'без цены'}</small>
                        </span>
                        <strong>{row.on_hand} на ост.</strong>
                      </div>
                    ))}
                  </div>
                )}
                {canEdit && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <select value={packKind} onChange={(e) => setPackKind(e.target.value as any)} style={{ minWidth: 120 }}>
                      <option value="pack">Упаковка</option>
                      <option value="set">Набор</option>
                      <option value="kit">Комплект</option>
                    </select>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      style={{ width: 88 }}
                      value={packFormQty}
                      onChange={(e) => setPackFormQty(Math.max(1, Number(e.target.value) || 1))}
                      title="Сколько штук в одной упаковке"
                      placeholder="Кол-во"
                    />
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      style={{ width: 110 }}
                      value={packFormPrice}
                      onChange={(e) => setPackFormPrice(e.target.value)}
                      placeholder="Цена уп."
                      title="Фиксированная цена продажи упаковки"
                    />
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={packBusy || !(packFormQty > 0)}
                      onClick={() => void createPackCard()}
                    >
                      Создать карточку
                    </button>
                  </div>
                )}
              </div>
            )}
            {(isBomType(String(item.item_type || form.item_type)) || kitParts.length > 0) && (
              <div className="wizard-stock" style={{ marginTop: 12 }}>
                <div className="section-label">{bomSectionTitle(String(item.item_type || 'kit'))}</div>
                <p className="subtext">
                  Цена этой карточки — за 1 {ITEM_TYPE_RU[item.item_type] || 'единицу'} (закупаемую упаковку).
                  При приёмке PO упаковка по умолчанию разбирается на штуки компонента; себестоимость шт = цена уп. ÷ кол-во в уп.
                </p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
                  <label className="subtext" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                    Версия BOM
                    <select
                      value={bomVersionId}
                      onChange={async (e) => {
                        const vid = e.target.value ? Number(e.target.value) : '';
                        setBomVersionId(vid);
                        if (!vid || !item.id) return;
                        try {
                          setKitParts(await (window as any).api.listKitComponents(item.id, vid) || []);
                          setTechOps(await (window as any).api.listTechOperations(item.id, vid) || []);
                        } catch (err: any) {
                          setError(err?.message || 'Не удалось загрузить версию');
                        }
                      }}
                    >
                      {bomVersions.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.code}{v.name ? ` · ${v.name}` : ''}{v.is_default ? ' ★' : ''} · {v.component_count || 0} поз.
                        </option>
                      ))}
                    </select>
                  </label>
                  {canEdit && bomVersionId && (
                    <>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={async () => {
                          try {
                            const created = await (window as any).api.copyBomVersion(item.id, bomVersionId);
                            const versions = await (window as any).api.listBomVersions(item.id);
                            setBomVersions(versions || []);
                            if (created?.id) {
                              setBomVersionId(Number(created.id));
                              setKitParts(await (window as any).api.listKitComponents(item.id, created.id) || []);
                              setTechOps(await (window as any).api.listTechOperations(item.id, created.id) || []);
                            }
                            onNotice('Версия скопирована');
                          } catch (err: any) {
                            setError(err?.message || 'Не удалось скопировать версию');
                          }
                        }}
                      >
                        Копия версии
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={async () => {
                          try {
                            setBomVersions(await (window as any).api.setDefaultBomVersion(item.id, bomVersionId));
                            onNotice('Версия по умолчанию обновлена');
                          } catch (err: any) {
                            setError(err?.message || 'Не удалось назначить');
                          }
                        }}
                      >
                        Сделать основной
                      </button>
                    </>
                  )}
                </div>
                {kitParts.length === 0 && <p className="subtext">Компоненты не заданы — добавьте товары в состав.</p>}
                {kitParts.map((row) => (
                  <div key={row.id} style={{ borderBottom: '1px solid var(--border)', paddingBottom: 8, marginBottom: 8 }}>
                    <div className="wizard-stock-row">
                      <span>
                        <button type="button" className="btn btn-text" style={{ padding: 0 }} onClick={() => void reloadItem(row.id)}>
                          {row.name}
                        </button>
                        <small className="subtext">
                          {row.sku || row.barcode || '—'} · на складе {row.on_hand}
                          {Number(row.scrap_pct) > 0 ? ` · отход ${row.scrap_pct}% → норма ${row.demand_qty ?? row.quantity}` : ''}
                        </small>
                      </span>
                      <strong>×{row.quantity}</strong>
                      {canEdit && (
                        <button
                          type="button"
                          className="btn btn-text"
                          onClick={async () => {
                            try {
                              setKitParts(await (window as any).api.removeKitComponent(item.id, row.id, bomVersionId || undefined));
                              onNotice('Компонент убран');
                            } catch (e: any) {
                              setError(e?.message || 'Не удалось убрать');
                            }
                          }}
                        >
                          Убрать
                        </button>
                      )}
                    </div>
                    {canEdit && (
                      <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                        <label className="subtext" style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                          Отход %
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step={0.1}
                            defaultValue={Number(row.scrap_pct) || 0}
                            style={{ width: 64 }}
                            onBlur={async (e) => {
                              const scrap = Math.max(0, Math.min(100, Number(e.target.value) || 0));
                              try {
                                setKitParts(await (window as any).api.upsertKitComponent(item.id, row.id, row.quantity, { scrap_pct: scrap, bom_version_id: bomVersionId || undefined }));
                              } catch (err: any) {
                                setError(err?.message || 'Не удалось сохранить отход');
                              }
                            }}
                          />
                        </label>
                        <select
                          defaultValue=""
                          style={{ flex: '1 1 160px' }}
                          onChange={async (e) => {
                            const altId = Number(e.target.value);
                            e.target.value = '';
                            if (!altId) return;
                            try {
                              setKitParts(await (window as any).api.upsertKitAlternative(item.id, row.id, altId, { priority: 1, quantity_factor: 1, bom_version_id: bomVersionId || undefined }));
                              onNotice('Альтернатива добавлена');
                            } catch (err: any) {
                              setError(err?.message || 'Не удалось добавить альтернативу');
                            }
                          }}
                        >
                          <option value="">+ заменитель…</option>
                          {catalog
                            .filter((c) => c.id !== item.id && c.id !== row.id && c.item_type !== 'service' && !isBomType(c.item_type)
                              && !(row.alternatives || []).some((a: any) => a.id === c.id))
                            .slice(0, 300)
                            .map((c) => (
                              <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </select>
                      </div>
                    )}
                    {(row.alternatives || []).length > 0 && (
                      <div style={{ marginTop: 6, paddingLeft: 8 }}>
                        <div className="subtext">Альтернативы (при сборке, если нет основного):</div>
                        {(row.alternatives || []).map((alt: any) => (
                          <div key={alt.id} className="wizard-stock-row" style={{ marginTop: 2 }}>
                            <span>
                              <button type="button" className="btn btn-text" style={{ padding: 0 }} onClick={() => void reloadItem(alt.id)}>
                                {alt.name}
                              </button>
                              <small className="subtext">×{alt.quantity_factor || 1} · склад {alt.on_hand}</small>
                            </span>
                            {canEdit && (
                              <button
                                type="button"
                                className="btn btn-text"
                                onClick={async () => {
                                  try {
                                    setKitParts(await (window as any).api.removeKitAlternative(item.id, row.id, alt.id, bomVersionId || undefined));
                                  } catch (err: any) {
                                    setError(err?.message || 'Не удалось убрать');
                                  }
                                }}
                              >
                                ×
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                {canEdit && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <select value={kitPick} onChange={(e) => setKitPick(e.target.value)} style={{ flex: '1 1 180px' }}>
                      <option value="">Добавить компонент…</option>
                      {catalog
                        .filter((row) => row.id !== item.id && row.item_type !== 'service' && !isBomType(row.item_type) && !kitParts.some((p) => p.id === row.id))
                        .slice(0, 400)
                        .map((row) => (
                          <option key={row.id} value={row.id}>{row.name}{row.sku ? ` · ${row.sku}` : ''}</option>
                        ))}
                    </select>
                    <input
                      type="number"
                      min={1}
                      value={kitQty}
                      onChange={(e) => setKitQty(Math.max(1, Number(e.target.value) || 1))}
                      style={{ width: 72 }}
                      title="Количество на 1 упаковку/набор/комплект"
                    />
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={!kitPick}
                      onClick={async () => {
                        try {
                          setKitParts(await (window as any).api.upsertKitComponent(item.id, Number(kitPick), kitQty, { scrap_pct: 0, bom_version_id: bomVersionId || undefined }));
                          setKitPick('');
                          setKitQty(1);
                          onNotice('Компонент добавлен');
                          if (bomVersionId) setBomVersions(await (window as any).api.listBomVersions(item.id) || bomVersions);
                        } catch (e: any) {
                          setError(e?.message || 'Не удалось добавить');
                        }
                      }}
                    >
                      Добавить
                    </button>
                  </div>
                )}
                <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                  <div className="section-label">Техоперации · нормы времени</div>
                  <p className="subtext">
                    Маршрут изготовления для версии BOM. Нормы (мин) подтягиваются в заказ-наряд кнопкой «Из спецификации».
                    {techOps.length > 0
                      ? ` Сумма норм: ${techOps.reduce((s, o) => s + (Number(o.norm_minutes) || 0), 0)} мин.`
                      : ''}
                  </p>
                  {techOps.map((op) => (
                    <div key={op.id} className="wizard-stock-row" style={{ marginTop: 4 }}>
                      <span>
                        {op.title}
                        <small className="subtext">
                          {Number(op.norm_minutes) || 0} мин
                          {op.workplace ? ` · ${op.workplace}` : ''}
                        </small>
                      </span>
                      {canEdit && (
                        <button
                          type="button"
                          className="btn btn-text"
                          onClick={async () => {
                            try {
                              setTechOps(await (window as any).api.deleteTechOperation(op.id) || []);
                            } catch (err: any) {
                              setError(err?.message || 'Не удалось удалить');
                            }
                          }}
                        >
                          Убрать
                        </button>
                      )}
                    </div>
                  ))}
                  {canEdit && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                      <input
                        placeholder="Операция (пайка, сборка, ОТК…)"
                        value={techTitle}
                        onChange={(e) => setTechTitle(e.target.value)}
                        style={{ flex: '1 1 180px' }}
                      />
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={techMinutes}
                        onChange={(e) => setTechMinutes(Math.max(0, Number(e.target.value) || 0))}
                        style={{ width: 72 }}
                        title="Норма, мин"
                      />
                      <button
                        type="button"
                        className="btn btn-secondary"
                        disabled={!techTitle.trim() || !bomVersionId}
                        onClick={async () => {
                          try {
                            await (window as any).api.saveTechOperation({
                              kit_item_id: item.id,
                              bom_version_id: bomVersionId || undefined,
                              title: techTitle.trim(),
                              norm_minutes: techMinutes,
                            });
                            setTechOps(await (window as any).api.listTechOperations(item.id, bomVersionId || undefined) || []);
                            setTechTitle('');
                            onNotice('Техоперация добавлена');
                          } catch (err: any) {
                            setError(err?.message || 'Не удалось сохранить');
                          }
                        }}
                      >
                        + операция
                      </button>
                    </div>
                  )}
                </div>

                {kitParts.length > 0 && onHand > 0 && (
                  <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                    <div className="section-label">Разобрать на остатке</div>
                    <p className="subtext">
                      Списать упаковки с ячейки и оприходовать штуки. Цена карточки упаковки не меняется.
                      {item.cost_price != null && Number(unpackContentQty || kitParts.reduce((s, p) => s + Number(p.quantity), 0)) > 0
                        ? ` Себестоимость шт ≈ ${(Number(item.cost_price) / Number(unpackContentQty || kitParts.reduce((s, p) => s + Number(p.quantity), 0))).toLocaleString('ru-RU', { maximumFractionDigits: 4 })} ${symbol}`
                        : ''}
                    </p>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                      <select
                        value={unpackLocId}
                        onChange={(e) => setUnpackLocId(e.target.value)}
                        style={{ minWidth: 160 }}
                      >
                        <option value="">Ячейка…</option>
                        {(item.stock || [])
                          .filter((s: any) => Number(s.on_hand ?? s.quantity ?? 0) > 0)
                          .map((s: any) => (
                            <option key={s.id} value={s.id}>
                              {s.name} ({s.on_hand ?? s.quantity})
                            </option>
                          ))}
                      </select>
                      <input
                        type="number"
                        min={1}
                        style={{ width: 72 }}
                        value={unpackQty}
                        onChange={(e) => setUnpackQty(Math.max(1, Number(e.target.value) || 1))}
                        title="Сколько упаковок разобрать"
                      />
                      <input
                        type="number"
                        min={1}
                        style={{ width: 88 }}
                        value={unpackContentQty}
                        onChange={(e) => setUnpackContentQty(e.target.value)}
                        placeholder={`шт в уп. (${kitParts.reduce((s, p) => s + Number(p.quantity), 0) || '…'})`}
                        title="Фактическое кол-во штук в одной упаковке"
                      />
                      <button
                        type="button"
                        className="btn btn-secondary"
                        disabled={unpackBusy || !unpackLocId || !(unpackQty > 0)}
                        onClick={async () => {
                          setUnpackBusy(true);
                          try {
                            const result = await (window as any).api.unpackPackStock({
                              item_id: item.id,
                              location_id: Number(unpackLocId),
                              quantity: unpackQty,
                              content_qty: unpackContentQty === '' ? undefined : Number(unpackContentQty),
                            });
                            onNotice(`Разобрано ${result.pack_qty} уп. → ${result.pieces} шт${result.piece_cost != null ? ` · ${Number(result.piece_cost).toLocaleString('ru-RU', { maximumFractionDigits: 4 })} ${symbol}/шт` : ''}`);
                            await reloadItem(item.id);
                            onChanged();
                            setError('');
                          } catch (e: any) {
                            setError(e?.message || 'Не удалось разобрать');
                          } finally {
                            setUnpackBusy(false);
                          }
                        }}
                      >
                        Разобрать
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
            <div className="wizard-stock" style={{ marginTop: 12 }}>
              <div className="section-label">Характеристики</div>
              {chars.length === 0 && <p className="subtext">Свойства не заданы (цвет, размер, материал…).</p>}
              {chars.map((row) => (
                <div className="wizard-stock-row" key={row.id}>
                  <span>
                    <strong>{row.name}</strong>
                    <small className="subtext">{row.value || '—'}</small>
                  </span>
                  {canEdit && (
                    <button
                      type="button"
                      className="btn btn-text"
                      onClick={async () => {
                        try {
                          setChars(await (window as any).api.removeItemCharacteristic(item.id, row.id));
                          onNotice('Характеристика удалена');
                        } catch (e: any) {
                          setError(e?.message || 'Не удалось удалить');
                        }
                      }}
                    >
                      Убрать
                    </button>
                  )}
                </div>
              ))}
              {canEdit && (
                <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <input
                    list="metrika-char-hints"
                    placeholder="Название"
                    value={charName}
                    onChange={(e) => setCharName(e.target.value)}
                    style={{ flex: '1 1 120px', minWidth: 100 }}
                  />
                  <datalist id="metrika-char-hints">
                    {charHints.map((hint) => <option key={hint} value={hint} />)}
                  </datalist>
                  <input
                    placeholder="Значение"
                    value={charValue}
                    onChange={(e) => setCharValue(e.target.value)}
                    style={{ flex: '1 1 140px', minWidth: 100 }}
                  />
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={!charName.trim()}
                    onClick={async () => {
                      try {
                        setChars(await (window as any).api.upsertItemCharacteristic(item.id, charName, charValue));
                        setCharName('');
                        setCharValue('');
                        onNotice('Характеристика сохранена');
                        (window as any).api.listCharacteristicHints?.().then((rows: string[]) => setCharHints(rows || [])).catch(() => {});
                      } catch (e: any) {
                        setError(e?.message || 'Не удалось сохранить');
                      }
                    }}
                  >
                    Сохранить
                  </button>
                </div>
              )}
            </div>
            <div className="wizard-stock" style={{ marginTop: 12 }}>
              <div className="section-label">Аналоги</div>
              {analogs.length === 0 && <p className="subtext">Заменители не указаны.</p>}
              {analogs.map((row) => (
                <div className="wizard-stock-row" key={row.id}>
                  <span>
                    <button type="button" className="btn btn-text" style={{ padding: 0 }} onClick={() => void reloadItem(row.id)}>
                      {row.name}
                    </button>
                    <small className="subtext">{row.sku || row.barcode || '—'} · на складе {row.on_hand}</small>
                  </span>
                  {canEdit && (
                    <button
                      type="button"
                      className="btn btn-text"
                      onClick={async () => {
                        try {
                          setAnalogs(await (window as any).api.removeItemAnalog(item.id, row.id));
                          onNotice('Аналог снят');
                        } catch (e: any) {
                          setError(e?.message || 'Не удалось снять аналог');
                        }
                      }}
                    >
                      Убрать
                    </button>
                  )}
                </div>
              ))}
              {canEdit && (
                <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
                  <select value={analogPick} onChange={(e) => setAnalogPick(e.target.value)} style={{ flex: 1 }}>
                    <option value="">Добавить аналог…</option>
                    {catalog
                      .filter((row) => row.id !== item.id && !analogs.some((a) => a.id === row.id))
                      .slice(0, 400)
                      .map((row) => (
                        <option key={row.id} value={row.id}>{row.name}{row.sku ? ` · ${row.sku}` : ''}</option>
                      ))}
                  </select>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={!analogPick}
                    onClick={async () => {
                      try {
                        setAnalogs(await (window as any).api.addItemAnalog(item.id, Number(analogPick)));
                        setAnalogPick('');
                        onNotice('Аналог добавлен');
                      } catch (e: any) {
                        setError(e?.message || 'Не удалось добавить аналог');
                      }
                    }}
                  >
                    Добавить
                  </button>
                </div>
              )}
            </div>
            <div className="wizard-actions">
              <button className="btn btn-primary" onClick={() => openPanel('in')}>Приход</button>
              <button className="btn btn-secondary" onClick={() => openPanel('out')}>Расход</button>
              <button className="btn btn-secondary" onClick={() => openPanel('move')}>Переместить</button>
              <button className="btn btn-secondary" onClick={() => openPanel('condition')}>Состояние</button>
              <button className="btn btn-secondary" onClick={() => openPanel('ledger')}>Почему остаток такой?</button>
              <button className="btn btn-secondary" onClick={printLabels}>Печать этикеток</button>
              {canEdit && <button className="btn btn-text" onClick={() => openPanel('edit')}>Редактировать карточку</button>}
              {canEdit && (
                <button
                  className="btn btn-danger"
                  onClick={async () => {
                    if (!window.confirm(`Удалить товар «${item.name}»?`)) return;
                    try {
                      await (window as any).api.deleteItem(item.id);
                      onNotice(`Удалён: ${item.name}`);
                      onChanged();
                      onClose();
                    } catch (e: any) {
                      setError(e?.message || 'Не удалось удалить');
                    }
                  }}
                >
                  Удалить
                </button>
              )}
            </div>
            {error && <div className="form-error">{error}</div>}
          </div>
        </FloatingWidget>
      )}

      {panels.has('edit') && (
        <FloatingWidget
          title={receipt ? 'Оприходование товара' : item ? `Редактирование: ${item.name || form.name || 'товар'}` : 'Новый товар'}
          open
          onClose={closeEditOrDialog}
          width={640}
          zIndex={1750}
          initialX={editPos.x}
          initialY={editPos.y}
        >
          <form onSubmit={save}>
            <p className="subtext" style={{ marginTop: 0 }}>
              {receipt ? 'Добавьте количество в выбранную ячейку.' : 'Основные данные, штрихкоды и адрес хранения'}
            </p>
            <div className="form-grid">
              {!item && (
                <label>Шаблон
                  <select defaultValue="" onChange={(event) => {
                    const template = templates.find((entry) => String(entry.id) === event.target.value);
                    if (template) setForm((current) => ({ ...current, category: template.category || '', min_stock: template.min_stock || 0, sku: template.sku_prefix || '' }));
                  }}>
                    <option value="">Без шаблона</option>
                    {templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
                  </select>
                </label>
              )}
              <div className="barcode-list">
                <div className="section-label">Штрихкоды товара (необязательно, может быть несколько)</div>
                {!barcodes.some((code) => code.trim()) && <span className="item-unknown-status">Еще не определен · штрихкод не назначен</span>}
                {barcodes.map((code, index) => (
                  <div className="barcode-row" key={index}>
                    <input value={code} onChange={(event) => updateBarcode(index, event.target.value)} placeholder={`Штрихкод ${index + 1}${index === 0 ? ' (основной)' : ''}`} autoFocus={index === 0 && !code} />
                    {index === 0 && code.trim() && <span className="barcode-primary">основной</span>}
                    {barcodes.length > 1 && <button type="button" className="btn btn-danger" onClick={() => removeBarcode(index)}>Убрать</button>}
                  </div>
                ))}
                <button type="button" className="btn-barcode-add" onClick={addBarcode}>Добавить еще штрихкод</button>
              </div>
              <label>Рабочее название<input value={form.name} onChange={(event) => update('name', event.target.value)} /></label>
              <label>Наименование для печати<input value={form.print_name} onChange={(event) => update('print_name', event.target.value)} placeholder="Если пусто, используется рабочее название" /></label>
              <label className="field-wide">Описание<textarea value={form.description} onChange={(event) => update('description', event.target.value)} /></label>
              <label>Артикул
                <div style={{ display: 'flex', gap: 6 }}>
                  <input value={form.sku} onChange={(event) => update('sku', event.target.value)} style={{ flex: 1 }} />
                  <button type="button" className="btn btn-secondary" onClick={generateSku} title="Сгенерировать по категории">Создать</button>
                </div>
                {skuWarning && <span className="form-error" style={{ display: 'block', marginTop: 6 }}>{skuWarning}</span>}
              </label>
              <CategoryPicker
                value={form.category}
                onChange={(name) => {
                  const selected = categories.find((entry) => entry.name === name);
                  setForm((current) => {
                    const next = { ...current, category: name };
                    if (!item && selected) return applyCategoryTemplateToForm(next, selected, categories, true);
                    return next;
                  });
                }}
              />
              {form.category && (
                <div className="field-wide" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      const selected = categories.find((entry) => entry.name === form.category);
                      if (!selected) return;
                      setForm((current) => applyCategoryTemplateToForm(current, selected, categories, false));
                    }}
                  >
                    Заполнить из шаблона категории
                  </button>
                  <span className="subtext">Пустые поля — из категории и родителей</span>
                </div>
              )}
              <label>Единица измерения<select value={form.unit_id} onChange={(event) => update('unit_id', event.target.value)}><option value="">Выберите единицу</option>{units.map((u) => <option value={u.id} key={u.id}>{u.name} ({u.symbol})</option>)}</select></label>
              <label>Тип номенклатуры
                <select value={form.item_type} onChange={(event) => {
                  const next = event.target.value;
                  update('item_type', next);
                  if (isBomType(next)) update('price_basis', 'unit');
                }}>
                  <option value="product">Товар</option>
                  <option value="service">Услуга</option>
                  <option value="pack">Упаковка (пачка / пакет)</option>
                  <option value="set">Набор</option>
                  <option value="kit">Комплект</option>
                </select>
              </label>
              {isBomType(form.item_type) && (
                <div className="field-wide subtext">
                  Упаковка, набор и комплект продаются целиком по фикс. цене. Состав задаётся на карточке — комплектация списывает компоненты.
                </div>
              )}
              {form.item_type !== 'service' && (
                <>
                  <label className="field-wide" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      type="checkbox"
                      checked={Boolean(form.track_lots)}
                      onChange={(e) => update('track_lots', e.target.checked)}
                    />
                    Партионный учёт (номер партии / срок годности)
                  </label>
                  {form.track_lots && (
                    <label>Политика списания
                      <select value={form.lot_policy} onChange={(e) => update('lot_policy', e.target.value)}>
                        <option value="fifo">FIFO — сначала старые поступления</option>
                        <option value="fefo">FEFO — сначала с ближайшим сроком</option>
                        <option value="none">Вручную (без автоподбора)</option>
                      </select>
                    </label>
                  )}
                  <label className="field-wide" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      type="checkbox"
                      checked={Boolean(form.track_serials)}
                      onChange={(e) => update('track_serials', e.target.checked)}
                    />
                    Серийные номера (1 серия = 1 ед. учёта)
                  </label>
                </>
              )}
              {!isBomType(form.item_type) ? (
                <>
                  <label>Режим цены
                    <select value={form.price_basis} onChange={(event) => update('price_basis', event.target.value)}>
                      <option value="unit">За 1 шт (обычный)</option>
                      <option value="package">Упаковочная закупка</option>
                    </select>
                  </label>
                  {form.price_basis === 'package' && (
                    <div className="field-wide subtext">
                      Одна карточка: в полях ниже — цена за упаковку (как у поставщика), остаток и расход — в штуках.
                      При приёмке PO «1 уп.» разворачивается в N шт. Кол-во в пачке можно уточнить на каждой поставке.
                    </div>
                  )}
                  <label>{form.price_basis === 'package' ? 'Шт в упаковке' : 'Кратность упаковки'}
                    <input
                      type="number"
                      min="1"
                      value={form.package_qty}
                      onChange={(event) => update('package_qty', event.target.value)}
                      placeholder={form.price_basis === 'package' ? 'Напр. 150' : 'Необязательно'}
                    />
                  </label>
                </>
              ) : (
                <label>Ед. в составе (справочно)<input type="number" min="1" value={form.package_qty} onChange={(event) => update('package_qty', event.target.value)} placeholder="Сколько шт внутри" /></label>
              )}
              <label>Цена продажи{!isBomType(form.item_type) && form.price_basis === 'package' ? ' (за уп.)' : isBomType(form.item_type) ? ' (фикс. за карточку)' : ''}
                <input type="number" min="0" step="0.01" value={form.sale_price} onChange={(event) => update('sale_price', event.target.value)} placeholder="0,00" />
              </label>
              <label>Учетная цена{!isBomType(form.item_type) && form.price_basis === 'package' ? ' (за уп. закупки)' : ''}
                <input type="number" min="0" step="0.01" value={form.cost_price} onChange={(event) => update('cost_price', event.target.value)} placeholder="0,00" />
              </label>
              {(formUnitSale != null || formUnitCost != null) && !isBomType(form.item_type) && (
                <div className="field-wide subtext" style={{ marginTop: -4 }}>
                  {form.price_basis === 'package' && formPackQty <= 1
                    ? 'Для цены за упаковку укажите кратность больше 1 (сколько шт в пакете).'
                    : (
                      <>
                        В учёте и документах:
                        {formUnitSale != null ? ` ${formUnitSale.toLocaleString('ru-RU', { maximumFractionDigits: 4 })} ${symbol}/${units.find((u) => String(u.id) === form.unit_id)?.symbol || 'шт'}` : ''}
                        {formUnitSale != null && formUnitCost != null ? ' · ' : ''}
                        {formUnitCost != null ? `учётная ${formUnitCost.toLocaleString('ru-RU', { maximumFractionDigits: 4 })} ${symbol}` : ''}
                        {formPackBasis ? ` (упаковка ${formPackQty} шт)` : ''}
                      </>
                    )}
                </div>
              )}
              {isBomType(form.item_type) && (
                <div className="field-wide subtext">Цена выше — за одну упаковку/набор/комплект целиком, без деления на штуки внутри.</div>
              )}
              <label>Происхождение / поставщик<input value={form.origin} onChange={(event) => update('origin', event.target.value)} placeholder="Поставщик, страна или заказ" /></label>
              <label>Артикул поставщика<input value={form.supplier_sku} onChange={(event) => update('supplier_sku', event.target.value)} placeholder="Код у поставщика" /></label>
              <label>Ссылка на закупку<input value={form.purchase_url} onChange={(event) => update('purchase_url', event.target.value)} placeholder="https://…" /></label>
              <label>Срок поставки, дни<input type="number" min="0" value={form.lead_time_days} onChange={(event) => update('lead_time_days', event.target.value)} placeholder="14" /></label>
              <label>Минимальная партия<input type="number" min="0" value={form.moq} onChange={(event) => update('moq', event.target.value)} placeholder="20" /></label>
              <label>Кратность заказа<input type="number" min="1" value={form.pack_multiple} onChange={(event) => update('pack_multiple', event.target.value)} placeholder="Как в упаковке" /></label>
              <label>Производитель<input value={form.manufacturer} onChange={(event) => update('manufacturer', event.target.value)} placeholder="Завод / юрлицо" /></label>
              <label>Бренд<input value={form.brand} onChange={(event) => update('brand', event.target.value)} placeholder="Торговая марка" list="item-brand-hints" /></label>
              <datalist id="item-brand-hints">
                {Array.from(new Set(catalog.map((row: any) => String(row.brand || '').trim()).filter(Boolean))).slice(0, 40).map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
              <label>Вес, г<input type="number" min="0" step="0.01" value={form.weight_g} onChange={(event) => update('weight_g', event.target.value)} placeholder="0" /></label>
              <label className="field-wide">Условия хранения<textarea value={form.storage_note} onChange={(event) => update('storage_note', event.target.value)} placeholder="Температура, влажность, особые требования" /></label>
              <label>Минимальный остаток<input type="number" min="0" value={form.min_stock} onChange={(event) => update('min_stock', event.target.value)} /></label>
              <label>Точка заказа<input type="number" min="0" value={form.reorder_point} onChange={(event) => update('reorder_point', event.target.value)} placeholder="Когда заказывать" title="При остатке ≤ точки заказа позиция попадает в пополнение" /></label>
              <label>Максимальный остаток<input type="number" min="0" value={form.max_stock} onChange={(event) => update('max_stock', event.target.value)} placeholder="Необязательно" /></label>
              <label>Ячейка хранения<select value={form.location_id} onChange={(event) => update('location_id', event.target.value)}><option value="">{receipt ? 'Выберите ячейку' : 'Без изменения'}</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.name} ({location.barcode})</option>)}</select></label>
              <label>{receipt ? 'Количество к приемке' : 'Количество в ячейке'} ({units.find((u) => String(u.id) === form.unit_id)?.symbol || 'шт.'})<input type="number" min="0" value={form.quantity} onChange={(event) => update('quantity', event.target.value)} /></label>
              {customFields.length > 0 && (
                <>
                  <div className="field-wide section-label" style={{ marginTop: 8 }}>Доп. поля</div>
                  {customFields.map((field) => {
                    const key = String(field.field_key);
                    const value = customValues[key] ?? '';
                    const setValue = (next: string) => setCustomValues((current) => ({ ...current, [key]: next }));
                    let options: string[] = [];
                    try { options = JSON.parse(field.options_json || '[]'); } catch { options = []; }
                    if (field.field_type === 'formula') {
                      return (
                        <label key={field.id} title={field.formula || ''}>
                          {field.label}
                          <input type="text" value={value} readOnly disabled placeholder="—" />
                          <span className="subtext">= {field.formula || '—'}</span>
                        </label>
                      );
                    }
                    if (field.field_type === 'bool') {
                      return (
                        <label key={field.id} className="field-wide" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <input type="checkbox" checked={value === '1'} onChange={(e) => setValue(e.target.checked ? '1' : '0')} />
                          {field.label}{field.required ? ' *' : ''}
                        </label>
                      );
                    }
                    if (field.field_type === 'select') {
                      return (
                        <label key={field.id}>{field.label}{field.required ? ' *' : ''}
                          <select value={value} onChange={(e) => setValue(e.target.value)} required={Boolean(field.required)}>
                            <option value="">—</option>
                            {options.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                          </select>
                        </label>
                      );
                    }
                    return (
                      <label key={field.id}>{field.label}{field.required ? ' *' : ''}
                        <input
                          type={field.field_type === 'number' ? 'number' : field.field_type === 'date' ? 'date' : 'text'}
                          value={value}
                          onChange={(e) => setValue(e.target.value)}
                          required={Boolean(field.required)}
                        />
                      </label>
                    );
                  })}
                </>
              )}
            </div>
            {item?.id && (
              <div className="photo-panel">
                <div className="section-label">Фотографии товара</div>
                <div className="photo-grid">
                  {photos.map((photo) => (
                    <div className="photo-tile" key={photo.id}>
                      <button type="button" className="photo-tile-btn" title="Открыть крупно" onClick={() => setPhotoPreview(photo.data_url)}>
                        <img src={photo.data_url} alt={form.name} />
                      </button>
                      <button
                        type="button"
                        className="photo-remove"
                        title="Удалить"
                        onClick={async () => {
                          if (!window.confirm('Удалить фотографию?')) return;
                          await (window as any).api.deleteItemPhoto(photo.id);
                          setPhotos(await (window as any).api.getItemPhotos(item.id));
                          onChanged();
                        }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="photo-add"
                    onClick={async () => {
                      const photo = await (window as any).api.addItemPhoto(item.id);
                      if (photo) {
                        setPhotos(await (window as any).api.getItemPhotos(item.id));
                        onChanged();
                      }
                    }}
                  >
                    Добавить фото
                  </button>
                </div>
              </div>
            )}
            {error && <div className="form-error">{error}</div>}
            <div className="modal-actions">
              <button type="button" className="btn btn-text" onClick={closeEditOrDialog}>Отмена</button>
              <button className="btn btn-primary" type="submit">Сохранить</button>
            </div>
          </form>
        </FloatingWidget>
      )}

      {panels.has('condition') && item && (
        <FloatingWidget
          title={`Состояние: ${item.name}`}
          open
          onClose={() => closePanel('condition')}
          width={520}
          zIndex={1760}
          initialX={offsetFor('condition', 2).x}
          initialY={offsetFor('condition', 2).y}
        >
          <form onSubmit={saveConditions}>
            <p className="subtext" style={{ marginTop: 0 }}>
              Физический остаток: <strong>{conditions.on_hand} {unit}</strong>. Сумма состояний должна совпадать. В проекты попадает только «Исправен».
            </p>
            <div className="condition-grid">
              {([['ok', 'Исправен'], ['check', 'На проверке'], ['bad', 'Неисправен'], ['repair', 'На ремонте'], ['scrap', 'Списан']] as [string, string][]).map(([key, label]) => (
                <label key={key}>{label}
                  <input type="number" min="0" value={conditions[key] || 0} onChange={(e) => setConditions((c: any) => ({ ...c, [key]: Number(e.target.value) || 0 }))} />
                </label>
              ))}
            </div>
            {error && <div className="form-error">{error}</div>}
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => closePanel('condition')}>Отмена</button>
              <button className="btn btn-primary">Сохранить</button>
            </div>
          </form>
        </FloatingWidget>
      )}

      {panels.has('ledger') && item && (
        <FloatingWidget
          title={`Журнал: ${item.name}`}
          open
          onClose={() => closePanel('ledger')}
          width={860}
          zIndex={1760}
          initialX={offsetFor('ledger', 2).x}
          initialY={offsetFor('ledger', 2).y}
        >
          <p className="subtext" style={{ marginTop: 0 }}>
            Текущий остаток: <strong>{ledger?.current ?? item.on_hand ?? 0} {unit}</strong>
          </p>
          <div className="item-ledger-summary">
            <div><span>Приход</span><strong>{ledger?.summary?.in || 0}</strong></div>
            <div><span>Расход</span><strong>{ledger?.summary?.out || 0}</strong></div>
            <div><span>Перемещение</span><strong>{ledger?.summary?.move || 0}</strong></div>
            <div><span>Корректировки</span><strong>{ledger?.summary?.adjustment || 0}</strong></div>
            <div><span>Сейчас</span><strong>{ledger?.current ?? 0}</strong></div>
          </div>
          <div className="filter-row" style={{ padding: '0 0 12px' }}>
            {([['', 'Все типы'], ['in', 'Приход'], ['out', 'Расход'], ['move', 'Перемещение']] as [string, string][]).map(([value, label]) => (
              <button key={value || 'all'} type="button" className={`filter-chip ${ledgerFilter.type === value ? 'active' : ''}`} onClick={() => setLedgerFilter((current) => ({ ...current, type: value }))}>{label}</button>
            ))}
          </div>
          <div className="table-scroll">
            <table>
              <thead><tr><th>Дата</th><th>Тип</th><th>Δ</th><th>Баланс</th><th>Причина</th><th>Источник</th><th>Ячейка</th><th>Документ</th></tr></thead>
              <tbody>
                {(ledger?.timeline || []).length === 0 && <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--muted)' }}>Движений нет</td></tr>}
                {(ledger?.timeline || []).map((row: any) => (
                  <tr key={row.id}>
                    <td>{new Date(row.timestamp).toLocaleString('ru-RU')}</td>
                    <td><span className={`type-badge ${row.type}`}>{row.type}</span></td>
                    <td className={row.signed_delta < 0 ? 'negative-difference' : 'positive-difference'}>{row.signed_delta > 0 ? '+' : ''}{row.signed_delta || '·'}</td>
                    <td><strong>{row.balance_after}</strong></td>
                    <td>{row.reason || '—'}</td>
                    <td>{row.source || '—'}</td>
                    <td>{row.from_location_name && row.to_location_name ? `${row.from_location_name} → ${row.to_location_name}` : (row.location_name || '—')}</td>
                    <td className="mono">{row.document_ref || row.project_order_no || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </FloatingWidget>
      )}

      {(panels.has('in') || panels.has('out') || panels.has('move')) && item && (
        <>
          {panels.has('in') && (
            <MovementDialog
              item={item}
              action="in"
              locations={locations}
              onClose={() => closePanel('in')}
              onSaved={async () => { closePanel('in'); onChanged(); await reloadItem(item.id); onNotice('Приход выполнен'); }}
            />
          )}
          {panels.has('out') && (
            <MovementDialog
              item={item}
              action="out"
              locations={locations}
              onClose={() => closePanel('out')}
              onSaved={async () => { closePanel('out'); onChanged(); await reloadItem(item.id); onNotice('Расход выполнен'); }}
            />
          )}
          {panels.has('move') && (
            <MovementDialog
              item={item}
              action="move"
              locations={locations}
              onClose={() => closePanel('move')}
              onSaved={async () => { closePanel('move'); onChanged(); await reloadItem(item.id); onNotice('Перемещение выполнено'); }}
            />
          )}
        </>
      )}
    </>,
  );
}

const OUT_REASONS = [
  { id: 'USAGE', label: 'Использование / расход' },
  { id: 'PROJECT', label: 'На проект / сборку' },
  { id: 'DEFECT', label: 'Брак' },
  { id: 'LOSS', label: 'Потеря / недостача' },
  { id: 'MANUAL', label: 'Прочее' },
];

function MovementDialog({ item, action, locations, onClose, onSaved }: any) {
  const [locationId, setLocationId] = useState(String(item.stock?.[0]?.id || ''));
  const [destinationId, setDestinationId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [serialsText, setSerialsText] = useState('');
  const [outReason, setOutReason] = useState('USAGE');
  const [outNote, setOutNote] = useState('');
  const [error, setError] = useState('');
  const unit = item.unit_symbol || 'шт.';
  const trackSerials = Boolean(Number(item.track_serials));
  const selectedStock = (item.stock || []).find((row: any) => String(row.id) === String(locationId));
  const availableHere = selectedStock
    ? Number(selectedStock.available ?? Math.max(0, Number(selectedStock.on_hand ?? selectedStock.quantity ?? 0) - Number(selectedStock.reserved || 0)))
    : Number(item.available ?? 0);
  const title = action === 'in' ? 'Приход' : action === 'out' ? 'Расход' : 'Перемещение';
  const pos = offsetFor(action, 2);
  const serialList = serialsText.split(/[\n,;\t]+/).map((s) => s.trim()).filter(Boolean);
  const effectiveQty = trackSerials && serialList.length ? serialList.length : quantity;

  const serialOptions = (item.serials_in_stock || []).filter((row: any) =>
    !locationId || Number(row.location_id) === Number(locationId),
  );

  async function apply(event: React.FormEvent) {
    event.preventDefault();
    try {
      if (trackSerials && !serialList.length) {
        throw new Error('Укажите серийные номера (по одному на строку)');
      }
      if ((action === 'out' || action === 'move') && effectiveQty > availableHere) {
        throw new Error(`Доступно только ${availableHere} ${unit} (с учётом резерва)`);
      }
      if (action === 'move') {
        if (!destinationId) throw new Error('Выберите ячейку назначения');
        if (!window.confirm(`Переместить ${effectiveQty} ${unit} товара «${item.name}»?`)) return;
        await (window as any).api.moveInventory({
          item_id: item.id,
          from_location_id: locationId,
          to_location_id: destinationId,
          quantity: effectiveQty,
          serials: trackSerials ? serialList : undefined,
        });
      } else {
        if (action === 'out' && !window.confirm(`Списать ${effectiveQty} ${unit} товара «${item.name}»?`)) return;
        const reasonLabel = OUT_REASONS.find((r) => r.id === outReason)?.label || outReason;
        const outComment = [reasonLabel, outNote.trim()].filter(Boolean).join(' · ') || 'Расход';
        await (window as any).api.adjustInventory({
          item_id: item.id,
          location_id: locationId,
          delta: action === 'in' ? effectiveQty : -effectiveQty,
          comment: action === 'in' ? 'Приход из wizard' : outComment,
          reason: action === 'out' ? outReason : (action === 'in' ? 'MANUAL' : undefined),
          serials: trackSerials ? serialList : undefined,
        });
      }
      await onSaved();
    } catch (movementError: any) {
      setError(movementError?.message || 'Операция не выполнена');
    }
  }

  return (
    <FloatingWidget title={`${title}: ${item.name}`} open onClose={onClose} width={480} zIndex={1780} initialX={pos.x} initialY={pos.y}>
      <form onSubmit={apply}>
        {(action === 'out' || action === 'move') && <p className="subtext" style={{ marginTop: 0 }}>Доступно в ячейке: {availableHere} {unit}</p>}
        {trackSerials && <p className="subtext" style={{ marginTop: 0 }}>Товар с серийными номерами — кол-во = числу S/N.</p>}
        <div className="form-grid">
          <label>{action === 'move' ? 'Из ячейки' : 'Ячейка'}
            <select value={locationId} onChange={(event) => setLocationId(event.target.value)}>
              <option value="">Выберите ячейку</option>
              {locations.map((location: any) => <option key={location.id} value={location.id}>{location.name}</option>)}
            </select>
          </label>
          {action === 'move' && (
            <label>В ячейку
              <select value={destinationId} onChange={(event) => setDestinationId(event.target.value)}>
                <option value="">Выберите ячейку</option>
                {locations.filter((location: any) => String(location.id) !== locationId).map((location: any) => (
                  <option key={location.id} value={location.id}>{location.name}</option>
                ))}
              </select>
            </label>
          )}
          <label>Количество ({unit})
            <input
              type="number"
              min="1"
              max={action === 'in' ? undefined : availableHere || undefined}
              value={effectiveQty}
              disabled={trackSerials}
              title={trackSerials ? 'Кол-во = числу серий' : undefined}
              onChange={(event) => setQuantity(Number(event.target.value))}
            />
          </label>
          {action === 'out' && (
            <>
              <label>Причина расхода
                <select value={outReason} onChange={(e) => setOutReason(e.target.value)}>
                  {OUT_REASONS.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}
                </select>
              </label>
              <label className="field-wide">Комментарий
                <input value={outNote} onChange={(e) => setOutNote(e.target.value)} placeholder="проект, тест, подарок…" />
              </label>
            </>
          )}
          {trackSerials && (
            <label style={{ gridColumn: '1 / -1' }}>
              Серийные номера
              <textarea
                rows={4}
                value={serialsText}
                placeholder="По одному S/N на строку"
                onChange={(e) => {
                  const text = e.target.value;
                  setSerialsText(text);
                  const count = text.split(/[\n,;\t]+/).map((s) => s.trim()).filter(Boolean).length;
                  if (count > 0) setQuantity(count);
                }}
              />
            </label>
          )}
          {trackSerials && (action === 'out' || action === 'move') && serialOptions.length > 0 && (
            <label style={{ gridColumn: '1 / -1' }}>
              Добавить из остатка ячейки
              <select
                value=""
                onChange={(e) => {
                  const sn = e.target.value;
                  if (!sn) return;
                  const parts = serialsText.split(/[\n,;\t]+/).map((s) => s.trim()).filter(Boolean);
                  if (parts.includes(sn)) return;
                  const next = [...parts, sn].join('\n');
                  setSerialsText(next);
                  setQuantity(parts.length + 1);
                }}
              >
                <option value="">+ из остатка…</option>
                {serialOptions.map((row: any) => (
                  <option key={row.id} value={row.serial_no}>{row.serial_no}</option>
                ))}
              </select>
            </label>
          )}
        </div>
        {error && <div className="form-error">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn btn-text" onClick={onClose}>Отмена</button>
          <button className="btn btn-primary">Применить</button>
        </div>
      </form>
    </FloatingWidget>
  );
}
