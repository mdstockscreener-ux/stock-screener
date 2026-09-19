/**
 * Unit tests for the technical panel computations. Run with: npm test
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildChartSeries, compute52wRange, computeMomentum, computeTrend, detectRecentCross } from '@/utils/technicals';
import type { DailyPricePoint, TechnicalIndicatorPoint } from 'bharatstock';

function bar(tradeDate: string, high: number, low: number, close: number): DailyPricePoint {
  return { tradeDate, high, low, close, open: close, prevClose: close, volume: 1000 };
}

function point(tradeDate: string, overrides: Partial<TechnicalIndicatorPoint> = {}): TechnicalIndicatorPoint {
  return { tradeDate, close: 100, ...overrides };
}

describe('compute52wRange', () => {
  it('finds the high/low and their dates, and positions the latest close', () => {
    const prices = [
      bar('2025-01-10', 120, 90, 100),
      bar('2025-03-01', 150, 95, 148), // the 52w high
      bar('2025-06-15', 110, 80, 82), // the 52w low
      bar('2025-09-01', 130, 100, 145), // latest close
    ];
    const result = compute52wRange(prices);
    assert.equal(result.high52w, 150);
    assert.equal(result.high52wDate, '2025-03-01');
    assert.equal(result.low52w, 80);
    assert.equal(result.low52wDate, '2025-06-15');
    assert.equal(result.latestClose, 145);
    // (145-80)/(150-80) * 100 = 92.86% -> upper third
    assert.ok(Math.abs(result.pctOfRange! - ((145 - 80) / (150 - 80)) * 100) < 1e-9);
    assert.equal(result.positionInRange, 'upper-third');
  });

  it('returns nulls for an empty series', () => {
    const result = compute52wRange([]);
    assert.equal(result.high52w, null);
    assert.equal(result.positionInRange, null);
  });
});

describe('detectRecentCross', () => {
  it('flags a golden cross when SMA50 moves from below to above SMA200', () => {
    const merged = [
      { date: '2025-01-01', sma50: 90, sma200: 100 },
      { date: '2025-01-02', sma50: 95, sma200: 100 },
      { date: '2025-01-03', sma50: 105, sma200: 100 },
    ];
    assert.equal(detectRecentCross(merged), 'golden');
  });

  it('flags a death cross when SMA50 moves from above to below SMA200', () => {
    const merged = [
      { date: '2025-01-01', sma50: 110, sma200: 100 },
      { date: '2025-01-02', sma50: 95, sma200: 100 },
    ];
    assert.equal(detectRecentCross(merged), 'death');
  });

  it('returns null when there is no crossover in the window', () => {
    const merged = [
      { date: '2025-01-01', sma50: 110, sma200: 100 },
      { date: '2025-01-02', sma50: 115, sma200: 100 },
    ];
    assert.equal(detectRecentCross(merged), null);
  });
});

describe('computeTrend', () => {
  it('reads uptrend when price > sma50 > sma200', () => {
    const sma50Series = [point('2025-01-01', { close: 130, sma: 120, rsi: 55 })];
    const sma200Series = [point('2025-01-01', { sma: 110 })];
    const result = computeTrend(sma50Series, sma200Series);
    assert.equal(result.status, 'uptrend');
    assert.equal(result.price, 130);
    assert.equal(result.sma50, 120);
    assert.equal(result.sma200, 110);
  });

  it('reads downtrend when price < sma50 < sma200', () => {
    const sma50Series = [point('2025-01-01', { close: 90, sma: 100 })];
    const sma200Series = [point('2025-01-01', { sma: 110 })];
    assert.equal(computeTrend(sma50Series, sma200Series).status, 'downtrend');
  });

  it('reads mixed when the ordering does not fit either trend', () => {
    const sma50Series = [point('2025-01-01', { close: 130, sma: 100 })];
    const sma200Series = [point('2025-01-01', { sma: 110 })];
    assert.equal(computeTrend(sma50Series, sma200Series).status, 'mixed');
  });

  it('reads unknown when a sma200 value is missing for the latest date', () => {
    const sma50Series = [point('2025-01-01', { close: 130, sma: 100 })];
    assert.equal(computeTrend(sma50Series, []).status, 'unknown');
  });
});

describe('computeMomentum', () => {
  it('reads overbought/oversold/neutral off the latest RSI', () => {
    assert.equal(computeMomentum([point('2025-01-01', { rsi: 75 })]).reading, 'overbought');
    assert.equal(computeMomentum([point('2025-01-01', { rsi: 25 })]).reading, 'oversold');
    assert.equal(computeMomentum([point('2025-01-01', { rsi: 50 })]).reading, 'neutral');
  });

  it('picks the most recent date, regardless of input order', () => {
    const series = [point('2025-01-01', { rsi: 20 }), point('2025-02-01', { rsi: 80 })];
    assert.equal(computeMomentum(series).rsi14, 80);
  });
});

describe('buildChartSeries', () => {
  it('aligns prices with same-date SMA values, oldest first', () => {
    const prices = [
      bar('2025-01-02', 105, 95, 100),
      bar('2025-01-01', 102, 98, 100),
    ];
    const sma50 = [point('2025-01-01', { sma: 90 }), point('2025-01-02', { sma: 91 })];
    const sma200 = [point('2025-01-01', { sma: 80 })]; // missing 2025-01-02 on purpose

    const series = buildChartSeries(prices, sma50, sma200);

    assert.equal(series.length, 2);
    assert.equal(series[0].date, '2025-01-01');
    assert.equal(series[0].sma50, 90);
    assert.equal(series[0].sma200, 80);
    assert.equal(series[1].date, '2025-01-02');
    assert.equal(series[1].sma50, 91);
    assert.equal(series[1].sma200, null);
  });

  it('drops points with no tradeDate', () => {
    const prices = [bar('2025-01-01', 105, 95, 100), { high: 1, low: 1, close: 1 } as DailyPricePoint];
    assert.equal(buildChartSeries(prices, [], []).length, 1);
  });
});
