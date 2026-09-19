import { getBharatStock } from '@/lib/bharatstock';
import { getSupabase } from '@/lib/supabaseClient';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { todayIstIso } from '@/lib/istDate';
import { singleflight } from '@/lib/singleflight';
import type { DailyPricePoint, TechnicalIndicatorPoint } from 'bharatstock';

/**
 * Fetch-through-cache for BharatStock OHLCV + SMA/RSI, backed by
 * sql/technicals_cache.sql. Same read/sync split as lib/fundamentalsCache.ts.
 */

export interface TechnicalsCacheRow {
  symbol: string;
  fetch_date: string;
  fetched_at: string;
  prices_1y: DailyPricePoint[] | null;
  sma50_series: TechnicalIndicatorPoint[] | null;
  sma200_series: TechnicalIndicatorPoint[] | null;
}

function isoDaysAgo(days: number): string {
  return todayIstIso(new Date(Date.now() - days * 24 * 60 * 60 * 1000));
}

/**
 * ~1 year of OHLCV plus SMA(50)+RSI(14) and SMA(200) series for the
 * trailing ~40 sessions (enough to detect a recent golden/death cross).
 * Reads today's cached row if present; otherwise fetches BharatStock and
 * upserts it. A miss for a past fetch_date throws — there's nothing to
 * fall back to.
 */
export function getTechnicals(
  symbolRaw: string,
  fetchDate: string = todayIstIso()
): Promise<TechnicalsCacheRow> {
  const symbol = symbolRaw.trim().toUpperCase();
  return singleflight(`technicals:${symbol}:${fetchDate}`, () => fetchTechnicals(symbol, fetchDate));
}

async function fetchTechnicals(symbol: string, fetchDate: string): Promise<TechnicalsCacheRow> {
  const supabase = getSupabase();

  const { data: existing, error: readError } = await supabase
    .from('technicals_cache')
    .select('symbol, fetch_date, fetched_at, prices_1y, sma50_series, sma200_series')
    .eq('symbol', symbol)
    .eq('fetch_date', fetchDate)
    .maybeSingle();

  if (readError) {
    throw new Error(`Could not read technicals_cache: ${readError.message}`);
  }
  if (existing) {
    return existing as TechnicalsCacheRow;
  }

  if (fetchDate !== todayIstIso()) {
    throw new Error(`No cached technicals for ${symbol} on ${fetchDate}.`);
  }

  const client = getBharatStock();
  // Same window for prices and indicators: the chart overlays SMA-50/SMA-200
  // across the full 1y series, not just the crossover lookback.
  const from = isoDaysAgo(370);

  const [prices, sma50, sma200] = await Promise.all([
    client.stocks.prices(symbol, { fromDate: from, pageSize: 400 }),
    client.stocks.technicalIndicators(symbol, { smaPeriod: 50, rsiPeriod: 14, fromDate: from, pageSize: 400 }),
    client.stocks.technicalIndicators(symbol, { smaPeriod: 200, fromDate: from, pageSize: 400 }),
  ]);

  const row: TechnicalsCacheRow = {
    symbol,
    fetch_date: fetchDate,
    fetched_at: new Date().toISOString(),
    prices_1y: prices.data,
    sma50_series: sma50.data,
    sma200_series: sma200.data,
  };

  const admin = getSupabaseAdmin();
  const { error: writeError } = await admin
    .from('technicals_cache')
    .upsert(row, { onConflict: 'symbol,fetch_date' });
  if (writeError) {
    throw new Error(`Could not write technicals_cache: ${writeError.message}`);
  }

  return row;
}
