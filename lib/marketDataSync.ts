import { fetchFromNse } from '@/lib/nseProxy';
import { getSupabase } from '@/lib/supabaseClient';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { todayIstIso } from '@/lib/istDate';

/**
 * The single place that knows how to turn one NSE endpoint's raw JSON into
 * a DB row and persist it. Both the admin "Sync now" button
 * (app/api/admin/sync/[dataset]/route.ts) and the public read routes'
 * NSE-fallback-on-miss path call runSync() — the fetch/map/store logic
 * only lives once.
 */

type RawRow = Record<string, unknown>;
type MapRowFn = (raw: RawRow, rank: number, tradeDate: string, fetchedAt: string) => Record<string, unknown>;

export interface SyncDatasetConfig {
  table: string;
  sortBy?: 'volume' | 'value';
  nseUrl: string;
  /** 2nd arg to fetchFromNse — only affects the Referer header it sends. */
  nseRefererSymbol: string;
  mapRow: MapRowFn;
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'string' ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : null;
}

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  return String(v);
}

/** Shared by most_active_securities, most_active_sme (with sortBy) and most_active_etf (without). */
function mapSecurityRow(sortBy: 'volume' | 'value' | undefined): MapRowFn {
  return (raw, rank, tradeDate, fetchedAt) => ({
    trade_date: tradeDate,
    ...(sortBy ? { sort_by: sortBy } : {}),
    rank,
    fetched_at: fetchedAt,
    symbol: str(raw.symbol),
    identifier: str(raw.identifier),
    open: num(raw.open),
    day_high: num(raw.dayHigh),
    day_low: num(raw.dayLow),
    previous_close: num(raw.previousClose),
    last_price: num(raw.lastPrice),
    p_change: num(raw.pChange),
    total_traded_volume: num(raw.totalTradedVolume),
    total_traded_value: num(raw.totalTradedValue),
    quantity_traded: num(raw.quantityTraded),
    // Stored verbatim — see sql/market_data_sync.sql's comment on ex_date.
    ex_date: str(raw.exDate),
    purpose: str(raw.purpose),
    year_high: num(raw.yearHigh),
    year_low: num(raw.yearLow),
    change: num(raw.change),
    close_price: num(raw.closePrice),
    last_update_time: str(raw.lastUpdateTime),
    nav: num(raw.nav),
  });
}

function mapVolumeGainerRow(raw: RawRow, rank: number, tradeDate: string, fetchedAt: string) {
  return {
    trade_date: tradeDate,
    rank,
    fetched_at: fetchedAt,
    symbol: str(raw.symbol),
    company_name: str(raw.companyName),
    volume: num(raw.volume),
    week1_avg_volume: num(raw.week1AvgVolume),
    week1_vol_change: num(raw.week1volChange),
    week2_avg_volume: num(raw.week2AvgVolume),
    week2_vol_change: num(raw.week2volChange),
    ltp: num(raw.ltp),
    p_change: num(raw.pChange),
    turnover: num(raw.turnover),
  };
}

function mapPriceSpurtRow(raw: RawRow, rank: number, tradeDate: string, fetchedAt: string) {
  return {
    trade_date: tradeDate,
    rank,
    fetched_at: fetchedAt,
    symbol: str(raw.symbol),
    series: str(raw.series),
    open_price: num(raw.open_price),
    high_price: num(raw.high_price),
    low_price: num(raw.low_price),
    ltp: num(raw.ltp),
    prev_price: num(raw.prev_price),
    net_price: num(raw.net_price),
    trade_quantity: num(raw.trade_quantity),
    turnover: num(raw.turnover),
    market_type: str(raw.market_type),
    // Stored verbatim — see sql/market_data_sync.sql's comment on ca_ex_dt.
    ca_ex_dt: str(raw.ca_ex_dt),
    ca_purpose: str(raw.ca_purpose),
    per_change: num(raw.perChange),
  };
}

/**
 * volume-gainers is the single sync action backing BOTH the Volume Gainers
 * page and the Most Active "Volume Spurts" tab — they hit the identical
 * NSE endpoint, so there is no separate volume-spurts entry.
 */
export const SYNC_DATASETS: Record<string, SyncDatasetConfig> = {
  'volume-gainers': {
    table: 'volume_gainers',
    nseUrl: 'https://www.nseindia.com/api/live-analysis-volume-gainers',
    nseRefererSymbol: 'volume-gainers',
    mapRow: mapVolumeGainerRow,
  },
  'most-active-securities-volume': {
    table: 'most_active_securities',
    sortBy: 'volume',
    nseUrl: 'https://www.nseindia.com/api/live-analysis-most-active-securities?index=volume',
    nseRefererSymbol: 'most-active-securities',
    mapRow: mapSecurityRow('volume'),
  },
  'most-active-securities-value': {
    table: 'most_active_securities',
    sortBy: 'value',
    nseUrl: 'https://www.nseindia.com/api/live-analysis-most-active-securities?index=value',
    nseRefererSymbol: 'most-active-securities',
    mapRow: mapSecurityRow('value'),
  },
  'most-active-sme-volume': {
    table: 'most_active_sme',
    sortBy: 'volume',
    nseUrl: 'https://www.nseindia.com/api/live-analysis-most-active-sme?index=volume',
    nseRefererSymbol: 'most-active-sme',
    mapRow: mapSecurityRow('volume'),
  },
  'most-active-sme-value': {
    table: 'most_active_sme',
    sortBy: 'value',
    nseUrl: 'https://www.nseindia.com/api/live-analysis-most-active-sme?index=value',
    nseRefererSymbol: 'most-active-sme',
    mapRow: mapSecurityRow('value'),
  },
  'most-active-etf': {
    table: 'most_active_etf',
    nseUrl: 'https://www.nseindia.com/api/live-analysis-most-active-etf?index=volume',
    nseRefererSymbol: 'most-active-etf',
    mapRow: mapSecurityRow(undefined),
  },
  'most-active-price-spurts': {
    table: 'most_active_price_spurts',
    nseUrl: 'https://www.nseindia.com/api/live-analysis-variations?index=gainers&key=SecGtr20',
    nseRefererSymbol: 'most-active-price-spurts',
    mapRow: mapPriceSpurtRow,
  },
};

export interface SyncResult {
  rowCount: number;
  tradeDate: string;
  fetchedAt: string;
}

/**
 * Fetches one dataset from NSE and replaces that day's rows for it.
 * Only ever touches rows for today's IST trade_date — NSE's live endpoints
 * have no history to sync a past day from. Never deletes existing rows
 * unless the fetch produced a usable, non-empty payload, so a transient
 * NSE failure can't wipe an already-stored day.
 */
export async function runSync(datasetKey: string): Promise<SyncResult> {
  const config = SYNC_DATASETS[datasetKey];
  if (!config) {
    throw new Error(`Unknown sync dataset: ${datasetKey}`);
  }

  const result = await fetchFromNse(config.nseUrl, config.nseRefererSymbol);
  if (result.status !== 200) {
    throw new Error(`NSE returned HTTP ${result.status} for ${datasetKey}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(result.body);
  } catch {
    throw new Error(`NSE response for ${datasetKey} was not valid JSON`);
  }

  const data = (parsed as { data?: unknown[] } | null)?.data;
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error(`NSE response for ${datasetKey} had no rows`);
  }

  const tradeDate = todayIstIso();
  const fetchedAt = new Date().toISOString();
  const rows = data.map((raw, index) => config.mapRow(raw as RawRow, index, tradeDate, fetchedAt));

  const supabase = getSupabaseAdmin();

  let deleteQuery = supabase.from(config.table).delete().eq('trade_date', tradeDate);
  if (config.sortBy) {
    deleteQuery = deleteQuery.eq('sort_by', config.sortBy);
  }
  const { error: deleteError } = await deleteQuery;
  if (deleteError) {
    throw new Error(`Failed to clear existing ${datasetKey} rows: ${deleteError.message}`);
  }

  const CHUNK_SIZE = 500;
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    const { error: insertError } = await supabase.from(config.table).insert(chunk);
    if (insertError) {
      throw new Error(`Failed to insert ${datasetKey} rows: ${insertError.message}`);
    }
  }

  return { rowCount: rows.length, tradeDate, fetchedAt };
}

/**
 * Reads one dataset's rows for a given IST trade_date via the anon client
 * (RLS grants SELECT — no service-role key needed on the read path).
 *
 * If the DB already has rows for that date they're returned as-is and NSE
 * is never called. Only a genuine zero-row miss on *today* falls through
 * to runSync() to fetch-and-store before re-reading; a miss on any earlier
 * date just returns an empty array, since NSE's live endpoints have no
 * history to backfill from.
 */
export async function getDatasetRows(datasetKey: string, tradeDate: string): Promise<Record<string, unknown>[]> {
  const config = SYNC_DATASETS[datasetKey];
  if (!config) {
    throw new Error(`Unknown sync dataset: ${datasetKey}`);
  }

  const supabase = getSupabase();
  const runQuery = () => {
    let query = supabase.from(config.table).select('*').eq('trade_date', tradeDate);
    if (config.sortBy) {
      query = query.eq('sort_by', config.sortBy);
    }
    return query.order('rank', { ascending: true });
  };

  const { data, error } = await runQuery();
  if (error) {
    throw new Error(`Could not load ${config.table}: ${error.message}`);
  }
  if (data && data.length > 0) {
    return data;
  }

  if (tradeDate !== todayIstIso()) {
    return [];
  }

  await runSync(datasetKey);

  const { data: fresh, error: freshError } = await runQuery();
  if (freshError) {
    throw new Error(`Could not load ${config.table} after sync: ${freshError.message}`);
  }
  return fresh ?? [];
}
