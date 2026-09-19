/**
 * Pure computations over BharatStock OHLCV + indicator data — no I/O, so
 * these are unit-testable without a network call. Used by
 * app/api/technicals/[symbol]/route.ts to turn cached BharatStock payloads
 * into the 52w range, trend and momentum reads the technical panel shows
 * (plan doc §3.2).
 */

import type { DailyPricePoint, TechnicalIndicatorPoint } from 'bharatstock';

export interface RangePosition {
  high52w: number | null;
  high52wDate: string | null;
  low52w: number | null;
  low52wDate: string | null;
  latestClose: number | null;
  /** 0 = at the 52w low, 100 = at the 52w high. Null if the range is degenerate or data's missing. */
  pctOfRange: number | null;
  positionInRange: 'upper-third' | 'middle-third' | 'lower-third' | null;
}

/** 52-week high/low (with the date each occurred) and where the latest close sits in that range. */
export function compute52wRange(prices: DailyPricePoint[]): RangePosition {
  const withHigh = prices.filter((p): p is DailyPricePoint & { high: number; tradeDate: string } =>
    typeof p.high === 'number' && Number.isFinite(p.high) && typeof p.tradeDate === 'string'
  );
  const withLow = prices.filter((p): p is DailyPricePoint & { low: number; tradeDate: string } =>
    typeof p.low === 'number' && Number.isFinite(p.low) && typeof p.tradeDate === 'string'
  );

  if (withHigh.length === 0 || withLow.length === 0) {
    return {
      high52w: null,
      high52wDate: null,
      low52w: null,
      low52wDate: null,
      latestClose: null,
      pctOfRange: null,
      positionInRange: null,
    };
  }

  const highPoint = withHigh.reduce((max, p) => (p.high > max.high ? p : max));
  const lowPoint = withLow.reduce((min, p) => (p.low < min.low ? p : min));

  const sortedByDate = [...prices]
    .filter((p): p is DailyPricePoint & { tradeDate: string } => typeof p.tradeDate === 'string')
    .sort((a, b) => b.tradeDate.localeCompare(a.tradeDate));
  const latestClose = sortedByDate[0]?.close ?? null;

  const span = highPoint.high - lowPoint.low;
  const pctOfRange =
    latestClose != null && Number.isFinite(latestClose) && span > 0
      ? ((latestClose - lowPoint.low) / span) * 100
      : null;

  const positionInRange =
    pctOfRange == null ? null : pctOfRange >= 66.67 ? 'upper-third' : pctOfRange <= 33.33 ? 'lower-third' : 'middle-third';

  return {
    high52w: highPoint.high,
    high52wDate: highPoint.tradeDate,
    low52w: lowPoint.low,
    low52wDate: lowPoint.tradeDate,
    latestClose,
    pctOfRange,
    positionInRange,
  };
}

interface MergedSmaPoint {
  date: string;
  sma50: number | null;
  sma200: number | null;
}

function mergeSmaSeries(
  sma50Series: TechnicalIndicatorPoint[],
  sma200Series: TechnicalIndicatorPoint[]
): MergedSmaPoint[] {
  const sma200ByDate = new Map<string, number | null>();
  for (const p of sma200Series) {
    if (p.tradeDate) sma200ByDate.set(p.tradeDate, p.sma ?? null);
  }

  return sma50Series
    .filter((p): p is TechnicalIndicatorPoint & { tradeDate: string } => typeof p.tradeDate === 'string')
    .map((p) => ({ date: p.tradeDate, sma50: p.sma ?? null, sma200: sma200ByDate.get(p.tradeDate) ?? null }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export type CrossType = 'golden' | 'death' | null;

/**
 * Scans the most recent `lookback` sessions (oldest to newest) for a
 * SMA-50/SMA-200 crossover, returning the one closest to today. A golden
 * cross is SMA-50 moving from at/below SMA-200 to above it; a death cross
 * is the reverse.
 */
export function detectRecentCross(merged: MergedSmaPoint[], lookback = 10): CrossType {
  const withBoth = merged.filter((m) => m.sma50 != null && m.sma200 != null);
  if (withBoth.length < 2) return null;

  const window = withBoth.slice(-(lookback + 1));
  for (let i = window.length - 1; i >= 1; i--) {
    const prevDiff = window[i - 1].sma50! - window[i - 1].sma200!;
    const currDiff = window[i].sma50! - window[i].sma200!;
    if (prevDiff <= 0 && currDiff > 0) return 'golden';
    if (prevDiff >= 0 && currDiff < 0) return 'death';
  }
  return null;
}

export type TrendStatus = 'uptrend' | 'downtrend' | 'mixed' | 'unknown';

export interface TrendRead {
  status: TrendStatus;
  price: number | null;
  sma50: number | null;
  sma200: number | null;
  recentCross: CrossType;
}

/** price > SMA50 > SMA200 reads as an uptrend, the reverse as a downtrend, anything else as mixed. */
export function computeTrend(
  sma50Series: TechnicalIndicatorPoint[],
  sma200Series: TechnicalIndicatorPoint[]
): TrendRead {
  const merged = mergeSmaSeries(sma50Series, sma200Series);
  const latest = [...sma50Series]
    .filter((p): p is TechnicalIndicatorPoint & { tradeDate: string } => typeof p.tradeDate === 'string')
    .sort((a, b) => b.tradeDate.localeCompare(a.tradeDate))[0];

  const price = latest?.close ?? null;
  const sma50 = latest?.sma ?? null;
  const sma200 = latest ? merged.find((m) => m.date === latest.tradeDate)?.sma200 ?? null : null;
  const recentCross = detectRecentCross(merged);

  let status: TrendStatus = 'unknown';
  if (price != null && sma50 != null && sma200 != null) {
    if (price > sma50 && sma50 > sma200) status = 'uptrend';
    else if (price < sma50 && sma50 < sma200) status = 'downtrend';
    else status = 'mixed';
  }

  return { status, price, sma50, sma200, recentCross };
}

export type RsiReading = 'overbought' | 'oversold' | 'neutral' | null;

export interface MomentumRead {
  rsi14: number | null;
  reading: RsiReading;
}

/** Reads the latest RSI(14) value off the SMA-50 series (it carries rsi alongside sma). RSI >= 70 overbought, <= 30 oversold. */
export function computeMomentum(sma50Series: TechnicalIndicatorPoint[]): MomentumRead {
  const latest = [...sma50Series]
    .filter((p): p is TechnicalIndicatorPoint & { tradeDate: string } => typeof p.tradeDate === 'string')
    .sort((a, b) => b.tradeDate.localeCompare(a.tradeDate))[0];

  const rsi14 = latest?.rsi ?? null;
  const reading: RsiReading = rsi14 == null ? null : rsi14 >= 70 ? 'overbought' : rsi14 <= 30 ? 'oversold' : 'neutral';

  return { rsi14, reading };
}

export interface ChartPoint {
  date: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  sma50: number | null;
  sma200: number | null;
}

/**
 * One row per trading day, oldest first: OHLC plus that day's SMA-50/SMA-200
 * (null where a series doesn't cover that date). Feeds the candlestick chart
 * (plan doc §3.3) — chart rendering itself is left to the component, this
 * just aligns the three BharatStock series onto a single timeline.
 */
export function buildChartSeries(
  prices: DailyPricePoint[],
  sma50Series: TechnicalIndicatorPoint[],
  sma200Series: TechnicalIndicatorPoint[]
): ChartPoint[] {
  const sma50ByDate = new Map<string, number | null>();
  for (const p of sma50Series) {
    if (p.tradeDate) sma50ByDate.set(p.tradeDate, p.sma ?? null);
  }
  const sma200ByDate = new Map<string, number | null>();
  for (const p of sma200Series) {
    if (p.tradeDate) sma200ByDate.set(p.tradeDate, p.sma ?? null);
  }

  return prices
    .filter((p): p is DailyPricePoint & { tradeDate: string } => typeof p.tradeDate === 'string')
    .map((p) => ({
      date: p.tradeDate,
      open: p.open ?? null,
      high: p.high ?? null,
      low: p.low ?? null,
      close: p.close ?? null,
      sma50: sma50ByDate.get(p.tradeDate) ?? null,
      sma200: sma200ByDate.get(p.tradeDate) ?? null,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
