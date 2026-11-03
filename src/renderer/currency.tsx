import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type MoneyOpts = {
  maximumFractionDigits?: number;
  minimumFractionDigits?: number;
  round?: boolean;
};

export function formatMoney(value: number | null | undefined, symbol = '₽', opts: MoneyOpts = {}) {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  const n = opts.round ? Math.round(Number(value)) : Number(value);
  const formatted = n.toLocaleString('ru-RU', {
    maximumFractionDigits: opts.maximumFractionDigits ?? (opts.round ? 0 : 2),
    minimumFractionDigits: opts.minimumFractionDigits,
  });
  const sym = String(symbol || '₽').trim() || '₽';
  return `${formatted} ${sym}`;
}

type CurrencyCtx = {
  symbol: string;
  code: string;
  money: (value: number | null | undefined, opts?: MoneyOpts) => string;
  reload: () => Promise<void>;
};

const CurrencyContext = createContext<CurrencyCtx>({
  symbol: '₽',
  code: 'RUB',
  money: (v, opts) => formatMoney(v, '₽', opts),
  reload: async () => {},
});

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [symbol, setSymbol] = useState('₽');
  const [code, setCode] = useState('RUB');

  const reload = useCallback(async () => {
    try {
      const api = (window as any).api;
      if (!api?.getSetting) return;
      const nextSymbol = (await api.getSetting('currency.symbol', '₽')) || '₽';
      const nextCode = (await api.getSetting('currency.code', 'RUB')) || 'RUB';
      setSymbol(String(nextSymbol).trim() || '₽');
      setCode(String(nextCode).trim() || 'RUB');
    } catch {  }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  useEffect(() => {
    const onChange = () => { void reload(); };
    window.addEventListener('metrika:currency', onChange);
    window.addEventListener('focus', onChange);
    return () => {
      window.removeEventListener('metrika:currency', onChange);
      window.removeEventListener('focus', onChange);
    };
  }, [reload]);

  const money = useCallback(
    (value: number | null | undefined, opts?: MoneyOpts) => formatMoney(value, symbol, opts),
    [symbol],
  );

  const value = useMemo(() => ({ symbol, code, money, reload }), [symbol, code, money, reload]);
  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

export function useCurrency() {
  return useContext(CurrencyContext);
}

export function notifyCurrencyChanged() {
  window.dispatchEvent(new Event('metrika:currency'));
}
