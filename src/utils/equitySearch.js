import equityRaw from '../../app_data/EQUITY_L.json';

const EQUITY_LIST = equityRaw.map((item) => ({
  symbol: item.SYMBOL,
  name: item['NAME OF COMPANY'],
  series: item.SERIES,
}));

export function findEquityBySymbol(symbol) {
  const upper = symbol?.trim().toUpperCase();
  if (!upper) return null;
  return EQUITY_LIST.find((item) => item.symbol === upper) ?? null;
}

export function searchEquities(query, limit = 25) {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  return EQUITY_LIST.filter(
    (item) =>
      item.symbol.toLowerCase().includes(q) ||
      item.name.toLowerCase().includes(q)
  ).slice(0, limit);
}

export { EQUITY_LIST };
