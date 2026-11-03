



export type PriceBasis = 'unit' | 'package';

export function packageSize(item: { package_qty?: number | null } | null | undefined): number {
  const n = Number(item?.package_qty);
  return Number.isFinite(n) && n > 1 ? Math.floor(n) : 1;
}

export function isPackageBasis(item: {
  price_basis?: string | null;
  package_qty?: number | null;
} | null | undefined): boolean {
  return String(item?.price_basis || 'unit') === 'package' && packageSize(item) > 1;
}


export function toUnitPrice(
  price: number | string | null | undefined,
  item: { price_basis?: string | null; package_qty?: number | null } | null | undefined,
): number | null {
  if (price === '' || price == null) return null;
  const p = Number(price);
  if (!Number.isFinite(p)) return null;
  if (!isPackageBasis(item)) return p;
  return p / packageSize(item);
}


export function toPackagePrice(
  unitPrice: number | string | null | undefined,
  item: { price_basis?: string | null; package_qty?: number | null } | null | undefined,
): number | null {
  if (unitPrice === '' || unitPrice == null) return null;
  const p = Number(unitPrice);
  if (!Number.isFinite(p)) return null;
  if (!isPackageBasis(item)) return p;
  return p * packageSize(item);
}

export function moneyQty(
  qty: number | string | null | undefined,
  price: number | string | null | undefined,
  item: { price_basis?: string | null; package_qty?: number | null } | null | undefined,
): number | null {
  const unit = toUnitPrice(price, item);
  if (unit == null) return null;
  const q = Number(qty);
  if (!Number.isFinite(q)) return null;
  return q * unit;
}

export function roundMoney(n: number, digits = 4): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}


export function enrichItemPrices<T extends Record<string, any>>(item: T): T & {
  unit_sale_price: number | null;
  unit_cost_price: number | null;
  price_basis: PriceBasis;
  package_qty_effective: number;
} {
  const basis: PriceBasis = isPackageBasis(item) ? 'package' : 'unit';
  return {
    ...item,
    price_basis: basis,
    package_qty_effective: packageSize(item),
    unit_sale_price: toUnitPrice(item.sale_price, item),
    unit_cost_price: toUnitPrice(item.cost_price, item),
  };
}
