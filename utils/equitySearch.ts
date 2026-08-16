import type { EquityItem } from '@/types';
import equityRaw from '../app_data/EQUITY_L.json';

interface RawEquityEntry {
  SYMBOL: string;
  'NAME OF COMPANY': string;
  SERIES: string;
}

const EQUITY_LIST: EquityItem[] = (equityRaw as RawEquityEntry[]).map((item) => ({
  symbol: item.SYMBOL,
  name: item['NAME OF COMPANY'],
  series: item.SERIES,
}));

export function findEquityBySymbol(symbol: string): EquityItem | null {
  const upper = symbol?.trim().toUpperCase();
  if (!upper) return null;
  return EQUITY_LIST.find((item) => item.symbol === upper) ?? null;
}

export function searchEquities(query: string, limit = 25): EquityItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  return EQUITY_LIST.filter(
    (item) =>
      item.symbol.toLowerCase().includes(q) ||
      item.name.toLowerCase().includes(q)
  ).slice(0, limit);
}

export { EQUITY_LIST };
