/** Normalised per-day record returned by normalizeRecord() */
export interface StockRecord {
  symbol: string;
  series: string;
  date: string;
  dateObj: Date;
  prevClose: number;
  open: number;
  high: number;
  low: number;
  last: number;
  close: number;
  vwap: number;
  volume: number;
  value: number;
  trades: number;
  deliveryQty: number;
  deliveryPct: number;
  change: number;
  changePct: number;
}

/** Raw record shape returned by the NSE historical API */
export interface RawNseRecord {
  CH_SYMBOL: string;
  CH_SERIES: string;
  mTIMESTAMP: string;
  CH_PREVIOUS_CLS_PRICE: number;
  CH_OPENING_PRICE: number;
  CH_TRADE_HIGH_PRICE: number;
  CH_TRADE_LOW_PRICE: number;
  CH_LAST_TRADED_PRICE: number;
  CH_CLOSING_PRICE: number;
  VWAP: number;
  CH_TOT_TRADED_QTY: number;
  CH_TOT_TRADED_VAL: number;
  CH_TOTAL_TRADES: number;
  COP_DELIV_QTY: number;
  COP_DELIV_PERC: number;
}

/** The { symbol, from, to } metadata object tracked by useStockData */
export interface StockMeta {
  symbol: string;
  from: string;
  to: string;
}

/** A single entry from the EQUITY_L.json equity list */
export interface EquityItem {
  symbol: string;
  name: string;
  series: string;
}

/** Date range in NSE API format (DD-MM-YYYY) */
export interface DateRange {
  from: string;
  to: string;
}

/** Parameters passed to onSearch / fetchData */
export interface SearchParams {
  symbol: string;
  from: string;
  to: string;
}
