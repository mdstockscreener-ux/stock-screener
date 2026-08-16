import type { RawNseRecord, StockRecord } from '@/types';

export function formatCurrency(value: number): string {
  if (value >= 1e7) return `₹${(value / 1e7).toFixed(2)} Cr`;
  if (value >= 1e5) return `₹${(value / 1e5).toFixed(2)} L`;
  return `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

export function formatNumber(value: number): string {
  if (value >= 1e7) return `${(value / 1e7).toFixed(2)} Cr`;
  if (value >= 1e5) return `${(value / 1e5).toFixed(2)} L`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  return value.toLocaleString('en-IN');
}

export function formatPrice(value: number): string {
  return `₹${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function parseDate(dateStr: string): Date {
  const [day, mon, year] = dateStr.split('-');
  const months: Record<string, number> = {
    Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
    Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
  };
  return new Date(Number(year), months[mon], parseInt(day));
}

export function toApiDate(date: Date): string {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  return `${d}-${m}-${y}`;
}

export function normalizeRecord(record: RawNseRecord): StockRecord {
  return {
    symbol: record.CH_SYMBOL,
    series: record.CH_SERIES,
    date: record.mTIMESTAMP,
    dateObj: parseDate(record.mTIMESTAMP),
    prevClose: record.CH_PREVIOUS_CLS_PRICE,
    open: record.CH_OPENING_PRICE,
    high: record.CH_TRADE_HIGH_PRICE,
    low: record.CH_TRADE_LOW_PRICE,
    last: record.CH_LAST_TRADED_PRICE,
    close: record.CH_CLOSING_PRICE,
    vwap: record.VWAP,
    volume: record.CH_TOT_TRADED_QTY,
    value: record.CH_TOT_TRADED_VAL,
    trades: record.CH_TOTAL_TRADES,
    deliveryQty: record.COP_DELIV_QTY,
    deliveryPct: record.COP_DELIV_PERC,
    change: record.CH_CLOSING_PRICE - record.CH_PREVIOUS_CLS_PRICE,
    changePct:
      ((record.CH_CLOSING_PRICE - record.CH_PREVIOUS_CLS_PRICE) /
        record.CH_PREVIOUS_CLS_PRICE) *
      100,
  };
}
