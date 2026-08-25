/**
 * Bar resolution for the backtest — server-side only.
 *
 * Two sources, in this order:
 *   1. The Supabase store (`daily_bars_adjusted`), when the symbol is in the
 *      fixed universe and the stored history actually covers the request.
 *   2. Yahoo, on demand, for everything else.
 *
 * Both end up split/bonus adjusted the same way — the store's view is the raw
 * OHLC scaled by `adj_close / close`, and the fetch path applies exactly that
 * ratio to Yahoo's own `adjclose`. That is what makes the two comparable, and
 * it is why an NSE endpoint is not an option here: its unadjusted prices would
 * manufacture gaps at every split and bonus, and the engine would trade them.
 *
 * Fetched symbols are never written back into `symbols` / `daily_bars`. The
 * universe those tables describe is fixed and curated; an arbitrary ticker a
 * user typed into a form does not belong in it. Caching, if it is ever worth
 * adding, goes in its own namespaced table.
 *
 * A note on running this outside Next: `getSupabase()` builds a realtime client
 * as a side effect, and on Node below 22 that needs a global WebSocket. The
 * Next server supplies one, so route handlers are fine — but a bare `tsx`
 * script is not, and fails with a confusing "Node.js 20 detected without native
 * WebSocket support". Nothing here uses realtime; only the constructor does.
 */

import YahooFinance from 'yahoo-finance2';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabaseClient';
import type { Bar, DataProvenance } from '@/types/backtest';

/**
 * How far behind the requested end date the store may be and still count as
 * covering it. Absorbs weekends, exchange holidays and the gap between the
 * close and the next ingestion run, none of which are missing data.
 */
const STORE_FRESHNESS_GRACE_DAYS = 5;

/** PostgREST caps a response at 1000 rows, so multi-year ranges have to be paged. */
const PAGE_SIZE = 1000;

const BAR_COLUMNS = 'date, open, high, low, close, volume';

export interface ResolvedBars {
  bars: Bar[];
  provenance: DataProvenance;
}

export class BarResolutionError extends Error {}

interface UniverseRow {
  symbol: string;
  name: string | null;
  yahoo_ticker: string | null;
}

/** PostgREST hands numerics back as strings for some column types. */
function num(value: unknown): number {
  return typeof value === 'number' ? value : Number(value);
}

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return isoDate(dt);
}

/** True for a well-formed ISO calendar date that also denotes a real day. */
export function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return isoDate(dt) === value;
}

/** Looks the symbol up in the curated universe. Null means "not one of ours". */
async function findInUniverse(symbol: string): Promise<UniverseRow | null> {
  const { data, error } = await getSupabase()
    .from('symbols')
    .select('symbol, name, yahoo_ticker')
    .eq('symbol', symbol)
    .maybeSingle();

  if (error) throw new BarResolutionError(`Could not read symbols: ${error.message}`);
  return (data as UniverseRow | null) ?? null;
}

/** First and last stored bar dates for one symbol, or nulls when it has none. */
async function storedRange(symbol: string): Promise<{ first: string | null; last: string | null }> {
  const supabase = getSupabase();
  const [firstRes, lastRes] = await Promise.all([
    supabase
      .from('daily_bars')
      .select('date')
      .eq('symbol', symbol)
      .order('date', { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('daily_bars')
      .select('date')
      .eq('symbol', symbol)
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (firstRes.error) {
    throw new BarResolutionError(`Could not read daily_bars: ${firstRes.error.message}`);
  }
  if (lastRes.error) {
    throw new BarResolutionError(`Could not read daily_bars: ${lastRes.error.message}`);
  }

  return {
    first: (firstRes.data as { date: string } | null)?.date ?? null,
    last: (lastRes.data as { date: string } | null)?.date ?? null,
  };
}

/** Reads adjusted bars for the range, paging until the store stops giving more. */
async function readStoreBars(symbol: string, start: string, end: string): Promise<Bar[]> {
  const supabase = getSupabase();
  const bars: Bar[] = [];

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('daily_bars_adjusted')
      .select(BAR_COLUMNS)
      .eq('symbol', symbol)
      .gte('date', start)
      .lte('date', end)
      .order('date', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      throw new BarResolutionError(`Could not read daily_bars_adjusted: ${error.message}`);
    }

    const page = (data ?? []) as unknown as Record<string, unknown>[];
    for (const row of page) {
      bars.push({
        date: String(row.date),
        open: num(row.open),
        high: num(row.high),
        low: num(row.low),
        close: num(row.close),
        volume: row.volume === null ? null : num(row.volume),
      });
    }

    if (page.length < PAGE_SIZE) break;
  }

  return bars;
}

type YahooClient = InstanceType<typeof YahooFinance>;

let yahooClient: YahooClient | null = null;

function getYahoo(): YahooClient {
  if (!yahooClient) {
    yahooClient = new YahooFinance({
      // The survey notice writes to stdout on first call; nothing here is
      // interactive, so it is only log noise.
      suppressNotices: ['yahooSurvey'],
    });
  }
  return yahooClient;
}

/**
 * Which Yahoo tickers to try, in order.
 *
 * This app's universe is NSE, so a bare symbol means the `.NS` listing. The
 * unsuffixed form is kept as a second attempt so a US ticker typed into the
 * form still resolves instead of failing outright.
 */
function tickerCandidates(symbol: string, universe: UniverseRow | null): string[] {
  if (universe?.yahoo_ticker) return [universe.yahoo_ticker];
  if (symbol.includes('.')) return [symbol];
  return [`${symbol}.NS`, symbol];
}

/**
 * Fetches daily bars from Yahoo and adjusts OHLC by the `adjclose / close`
 * ratio, which is how `daily_bars_adjusted` derives its own values.
 *
 * Volume is left raw, matching the store: the split-adjusted share count is
 * not something the engine uses, and silently rescaling it would make the two
 * sources disagree on a column neither of them trades on.
 */
async function fetchYahooBars(ticker: string, start: string, end: string): Promise<Bar[]> {
  const result = await getYahoo().chart(ticker, {
    period1: start,
    // period2 is exclusive of the day it names, so ask for the day after.
    period2: addDays(end, 1),
    interval: '1d',
  });

  const bars: Bar[] = [];
  for (const quote of result.quotes) {
    const { open, high, low, close } = quote;
    if (open === null || high === null || low === null || close === null) continue;
    if (!Number.isFinite(close) || close <= 0) continue;

    const adjClose = quote.adjclose;
    const factor =
      typeof adjClose === 'number' && Number.isFinite(adjClose) && adjClose > 0
        ? adjClose / close
        : 1;

    const date = isoDate(quote.date);
    if (date < start || date > end) continue;

    bars.push({
      date,
      open: open * factor,
      high: high * factor,
      low: low * factor,
      close: close * factor,
      volume: quote.volume === null ? null : quote.volume,
    });
  }

  bars.sort((a, b) => a.date.localeCompare(b.date));
  return bars;
}

/** Tries each candidate ticker and returns the first that actually has bars. */
async function fetchWithFallback(
  candidates: string[],
  start: string,
  end: string
): Promise<{ ticker: string; bars: Bar[] }> {
  const failures: string[] = [];

  for (const ticker of candidates) {
    try {
      const bars = await fetchYahooBars(ticker, start, end);
      if (bars.length > 0) return { ticker, bars };
      failures.push(`${ticker}: no bars in range`);
    } catch (err) {
      failures.push(`${ticker}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  throw new BarResolutionError(
    `No daily bars available for ${candidates.join(' or ')} in ${start}..${end}. ` +
      `Tried — ${failures.join('; ')}.`
  );
}

/**
 * Resolves adjusted daily bars for one symbol over [start, end].
 *
 * Prefers the store, falls back to Yahoo, and reports which it used along with
 * the window the returned bars actually cover — so the caller never has to
 * guess whether a short result is a thin stock or a stale table.
 */
export async function resolveBars(
  rawSymbol: string,
  start: string,
  end: string
): Promise<ResolvedBars> {
  const symbol = rawSymbol.trim().toUpperCase();
  const warnings: string[] = [];

  if (!symbol) throw new BarResolutionError('A symbol is required.');
  if (!isValidIsoDate(start) || !isValidIsoDate(end)) {
    throw new BarResolutionError('Start and end must be ISO dates (YYYY-MM-DD).');
  }
  if (start >= end) throw new BarResolutionError('The start date must be before the end date.');

  let universe: UniverseRow | null = null;
  let storeCovers = false;

  if (isSupabaseConfigured) {
    universe = await findInUniverse(symbol);
    if (universe) {
      const { first, last } = await storedRange(symbol);
      if (first && last) {
        const freshEnough = last >= addDays(end, -STORE_FRESHNESS_GRACE_DAYS);
        storeCovers = first <= start && freshEnough;
        if (!storeCovers && first > start) {
          warnings.push(
            `Stored history for ${symbol} begins ${first}, after the requested start ` +
              `${start} — fetched the full range instead so the whole window is covered.`
          );
        } else if (!storeCovers) {
          warnings.push(
            `The store's last bar for ${symbol} is ${last}, short of the requested end ` +
              `${end} — fetched the range instead.`
          );
        }
      }
    }
  } else {
    warnings.push(
      'Supabase is not configured, so the store was skipped entirely and every run fetches.'
    );
  }

  let bars: Bar[];
  let source: DataProvenance['source'];
  let sourceLabel: string;
  let resolvedTicker: string | null = null;

  if (storeCovers) {
    bars = await readStoreBars(symbol, start, end);
    source = 'store';
    sourceLabel = 'Store — daily_bars_adjusted';
    if (bars.length === 0) {
      throw new BarResolutionError(
        `${symbol} is in the store but has no adjusted bars between ${start} and ${end}.`
      );
    }
  } else {
    const fetched = await fetchWithFallback(tickerCandidates(symbol, universe), start, end);
    bars = fetched.bars;
    resolvedTicker = fetched.ticker;
    source = 'fetched';
    sourceLabel = `Fetched — Yahoo (${fetched.ticker})`;
  }

  const coveredStart = bars[0]?.date ?? null;
  const coveredEnd = bars[bars.length - 1]?.date ?? null;

  if (coveredEnd && coveredEnd < addDays(end, -STORE_FRESHNESS_GRACE_DAYS)) {
    warnings.push(
      `The data ends ${coveredEnd}, well short of the requested end ${end}. ` +
        'The run stops there — it does not assume the stock was flat afterwards.'
    );
  }

  return {
    bars,
    provenance: {
      source,
      sourceLabel,
      symbol,
      resolvedTicker,
      name: universe?.name ?? null,
      inUniverse: universe !== null,
      asOf: coveredEnd,
      requestedStart: start,
      requestedEnd: end,
      coveredStart,
      coveredEnd,
      barCount: bars.length,
      adjusted: true,
      warnings,
    },
  };
}
