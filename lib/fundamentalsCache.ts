import { getBharatStock } from '@/lib/bharatstock';
import { getSupabase } from '@/lib/supabaseClient';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { todayIstIso } from '@/lib/istDate';
import { singleflight } from '@/lib/singleflight';
import type { ComparisonItem, FinancialPeriod, RatioSnapshot, StockDetail } from 'bharatstock';

/**
 * Fetch-through-cache for BharatStock fundamentals, backed by
 * sql/fundamentals_cache.sql. Mirrors the read/sync split in
 * lib/marketDataSync.ts: a miss for *today* fetches from BharatStock and
 * stores it; a miss for any other fetch_date just means it was never
 * fetched that day (BharatStock has no way to back-fill a past snapshot).
 */

export interface FundamentalsCacheRow {
  symbol: string;
  fetch_date: string;
  fetched_at: string;
  sector: string | null;
  stock_detail: StockDetail | null;
  ratios: RatioSnapshot | null;
  financials_quarterly: FinancialPeriod[] | null;
  financials_annual: FinancialPeriod[] | null;
}

/**
 * Company info, ratios, and quarterly/annual financials for one symbol.
 * Reads today's cached row if present; otherwise fetches BharatStock and
 * upserts it. A miss for a past fetch_date throws — there's nothing to
 * fall back to.
 */
export function getFundamentals(
  symbolRaw: string,
  fetchDate: string = todayIstIso()
): Promise<FundamentalsCacheRow> {
  const symbol = symbolRaw.trim().toUpperCase();
  return singleflight(`fundamentals:${symbol}:${fetchDate}`, () => fetchFundamentals(symbol, fetchDate));
}

async function fetchFundamentals(symbol: string, fetchDate: string): Promise<FundamentalsCacheRow> {
  const supabase = getSupabase();

  const { data: existing, error: readError } = await supabase
    .from('fundamentals_cache')
    .select('symbol, fetch_date, fetched_at, sector, stock_detail, ratios, financials_quarterly, financials_annual')
    .eq('symbol', symbol)
    .eq('fetch_date', fetchDate)
    .maybeSingle();

  if (readError) {
    throw new Error(`Could not read fundamentals_cache: ${readError.message}`);
  }
  if (existing) {
    return existing as FundamentalsCacheRow;
  }

  if (fetchDate !== todayIstIso()) {
    throw new Error(`No cached fundamentals for ${symbol} on ${fetchDate}.`);
  }

  const client = getBharatStock();
  const [detail, ratios, quarterly, annual] = await Promise.all([
    client.stocks.get(symbol),
    client.stocks.ratios(symbol),
    client.stocks.financials(symbol, { periodType: 'quarterly', pageSize: 12 }),
    client.stocks.financials(symbol, { periodType: 'annual', pageSize: 5 }),
  ]);

  const row: FundamentalsCacheRow = {
    symbol,
    fetch_date: fetchDate,
    fetched_at: new Date().toISOString(),
    sector: detail.sector ?? null,
    stock_detail: detail,
    ratios,
    financials_quarterly: quarterly.data,
    financials_annual: annual.data,
  };

  const admin = getSupabaseAdmin();
  const { error: writeError } = await admin
    .from('fundamentals_cache')
    .upsert(row, { onConflict: 'symbol,fetch_date' });
  if (writeError) {
    throw new Error(`Could not write fundamentals_cache: ${writeError.message}`);
  }

  return row;
}

/**
 * Sector-wide peer comparison (PE/PB/ROE/ROCE). Shared by every symbol in
 * the sector — BharatStock's compare() call already returns the whole
 * sector, so one cached row per (sector, fetch_date) serves all of them.
 * A miss for a past fetch_date just returns an empty list rather than
 * throwing, since a stock's own fundamentals can still render without peers.
 */
export function getSectorPeers(sectorRaw: string, fetchDate: string = todayIstIso()): Promise<ComparisonItem[]> {
  const sector = sectorRaw.trim();
  return singleflight(`sectorPeers:${sector}:${fetchDate}`, () => fetchSectorPeers(sector, fetchDate));
}

async function fetchSectorPeers(sector: string, fetchDate: string): Promise<ComparisonItem[]> {
  const supabase = getSupabase();

  const { data: existing, error: readError } = await supabase
    .from('sector_peers_cache')
    .select('peers')
    .eq('sector', sector)
    .eq('fetch_date', fetchDate)
    .maybeSingle();

  if (readError) {
    throw new Error(`Could not read sector_peers_cache: ${readError.message}`);
  }
  if (existing) {
    return existing.peers as ComparisonItem[];
  }

  if (fetchDate !== todayIstIso()) {
    return [];
  }

  const client = getBharatStock();
  const peers = await client.stocks.compare(sector, { limit: 50 });

  const admin = getSupabaseAdmin();
  const { error: writeError } = await admin
    .from('sector_peers_cache')
    .upsert(
      { sector, fetch_date: fetchDate, fetched_at: new Date().toISOString(), peers },
      { onConflict: 'sector,fetch_date' }
    );
  if (writeError) {
    throw new Error(`Could not write sector_peers_cache: ${writeError.message}`);
  }

  return peers;
}
