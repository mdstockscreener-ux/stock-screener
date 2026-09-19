/**
 * Unit tests for the news/events computations. Run with: npm test
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildCorporateActionLabel,
  buildDealLabel,
  buildInsiderTradeLabel,
  classifyTransactionDirection,
  computePriceMove,
} from '@/utils/news';
import type { DailyPricePoint } from 'bharatstock';

function bar(tradeDate: string, close: number, prevClose: number): DailyPricePoint {
  return { tradeDate, close, prevClose, open: close, high: close, low: close, volume: 1000 };
}

describe('computePriceMove', () => {
  it('computes T0/T1/T2 off the first trading day on or after the event date', () => {
    const prices = [
      bar('2025-06-09', 100, 98), // Monday
      bar('2025-06-10', 105, 100), // T0 for a Tuesday event
      bar('2025-06-11', 110, 105), // T1
      bar('2025-06-12', 108, 110), // T2
    ];
    const move = computePriceMove(prices, '2025-06-10');
    assert.ok(Math.abs(move.t0! - ((105 - 100) / 100) * 100) < 1e-9);
    assert.ok(Math.abs(move.t1! - ((110 - 105) / 105) * 100) < 1e-9);
    assert.ok(Math.abs(move.t2! - ((108 - 110) / 110) * 100) < 1e-9);
  });

  it('rolls a weekend/holiday event date forward to the next trading day', () => {
    const prices = [bar('2025-06-09', 100, 98), bar('2025-06-11', 105, 100)];
    // 2025-06-10 has no bar (holiday) — should land on 06-11.
    const move = computePriceMove(prices, '2025-06-10');
    assert.ok(Math.abs(move.t0! - ((105 - 100) / 100) * 100) < 1e-9);
  });

  it('returns all-null when the event date is outside the price window', () => {
    const prices = [bar('2025-06-09', 100, 98)];
    const move = computePriceMove(prices, '2026-01-01');
    assert.deepEqual(move, { t0: null, t1: null, t2: null });
  });

  it('leaves T1/T2 null when there are not enough trailing bars', () => {
    const prices = [bar('2025-06-09', 100, 98)];
    const move = computePriceMove(prices, '2025-06-09');
    assert.equal(move.t1, null);
    assert.equal(move.t2, null);
  });
});

describe('classifyTransactionDirection', () => {
  it('reads acquisition-flavoured text as buy', () => {
    assert.equal(classifyTransactionDirection('Market Acquisition'), 'buy');
    assert.equal(classifyTransactionDirection('Buy'), 'buy');
  });

  it('reads disposal-flavoured text as sell', () => {
    assert.equal(classifyTransactionDirection('Market Sale'), 'sell');
    assert.equal(classifyTransactionDirection('Disposal'), 'sell');
  });

  it('falls back to unknown for unrecognised or missing text', () => {
    assert.equal(classifyTransactionDirection('Gift'), 'unknown');
    assert.equal(classifyTransactionDirection(null), 'unknown');
  });
});

describe('label builders', () => {
  it('builds a mechanical corporate action label', () => {
    assert.equal(buildCorporateActionLabel('Dividend', 'Rs 5 per share'), 'Dividend: Rs 5 per share');
    assert.equal(buildCorporateActionLabel('Bonus', null), 'Bonus');
  });

  it('builds an insider trade label with a formatted quantity', () => {
    assert.equal(
      buildInsiderTradeLabel('Jane Doe', 'Market Acquisition', 50000),
      'Jane Doe — Market Acquisition of 50,000 shares'
    );
  });

  it('builds a deal label with price when available', () => {
    assert.equal(buildDealLabel('ACME Fund', 'BUY', 10000, 123.456), 'ACME Fund — BUY 10,000 shares @ ₹123.46');
    assert.equal(buildDealLabel('ACME Fund', 'SELL', null, null), 'ACME Fund — SELL an undisclosed number of shares');
  });
});
