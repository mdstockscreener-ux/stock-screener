/**
 * Unit tests for the fundamentals computations. Run with: npm test
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { computePeerPeRanking, computeQuarterlyGrowth, computeSelfPePercentile } from '@/utils/fundamentals';
import type { ComparisonItem, FinancialPeriod } from 'bharatstock';

function quarter(
  periodEndDate: string,
  overrides: Partial<FinancialPeriod> = {}
): FinancialPeriod {
  return {
    periodType: 'quarterly',
    fiscalYear: periodEndDate.slice(0, 4),
    periodEndDate,
    ...overrides,
  };
}

function peer(symbol: string, peRatio: number | null): ComparisonItem {
  return { symbol, companyName: `${symbol} Ltd`, peRatio };
}

describe('computeSelfPePercentile', () => {
  it('ranks the current PE against its own quarterly history', () => {
    const history = [10, 20, 30, 40].map((pe, i) => quarter(`2025-0${i + 1}-31`, { peRatio: pe }));
    const result = computeSelfPePercentile(30, history);
    assert.equal(result.sampleSize, 4);
    assert.equal(result.percentile, 75); // 3 of 4 values <= 30
    assert.equal(result.minPe, 10);
    assert.equal(result.maxPe, 40);
    assert.equal(result.medianPe, 25);
  });

  it('ignores periods with no peRatio', () => {
    const history = [quarter('2025-01-31', { peRatio: 10 }), quarter('2025-02-28', { peRatio: null })];
    const result = computeSelfPePercentile(10, history);
    assert.equal(result.sampleSize, 1);
    assert.equal(result.percentile, 100);
  });

  it('returns null percentile when there is no history or no current PE', () => {
    assert.equal(computeSelfPePercentile(null, []).percentile, null);
    assert.equal(computeSelfPePercentile(10, []).percentile, null);
  });
});

describe('computePeerPeRanking', () => {
  it('ranks a symbol against its peers by PE, cheaper = lower percentile', () => {
    const peers = [peer('AAA', 10), peer('BBB', 20), peer('CCC', 30), peer('SELF', 15)];
    const result = computePeerPeRanking('self', peers);
    assert.equal(result.peerCount, 4);
    assert.equal(result.peRankPercentile, 50); // AAA + SELF <= 15
    assert.equal(result.averagePe, 18.75); // (10+20+30+15)/4
    assert.equal(result.medianPe, 17.5); // sorted [10,15,20,30] -> avg of middle two
  });

  it('still computes average/median PE when the symbol is not in the peer set', () => {
    const peers = [peer('AAA', 10), peer('BBB', 20)];
    const result = computePeerPeRanking('ZZZ', peers);
    assert.equal(result.peRankPercentile, null);
    assert.equal(result.averagePe, 15);
    assert.equal(result.medianPe, 15);
  });

  it('drops peers with no PE from the ranking pool', () => {
    const peers = [peer('AAA', null), peer('SELF', 10)];
    const result = computePeerPeRanking('SELF', peers);
    assert.equal(result.peerCount, 1);
    assert.equal(result.peRankPercentile, 100);
    assert.equal(result.averagePe, 10);
  });

  it('returns nulls when no peer has a PE at all', () => {
    const peers = [peer('AAA', null), peer('BBB', null)];
    const result = computePeerPeRanking('AAA', peers);
    assert.equal(result.peerCount, 0);
    assert.equal(result.peRankPercentile, null);
    assert.equal(result.averagePe, null);
    assert.equal(result.medianPe, null);
  });
});

describe('computeQuarterlyGrowth', () => {
  it('diffs QoQ against the prior quarter and YoY against 4 quarters back', () => {
    // Oldest to newest, 5 quarters — deliberately unsorted input.
    const periods = [
      quarter('2024-06-30', { revenue: 100, netProfit: 10 }),
      quarter('2024-09-30', { revenue: 110, netProfit: 11 }),
      quarter('2024-12-31', { revenue: 120, netProfit: 12 }),
      quarter('2025-03-31', { revenue: 130, netProfit: 13 }),
      quarter('2025-06-30', { revenue: 150, netProfit: 15 }),
    ].reverse();

    const rows = computeQuarterlyGrowth(periods);

    // Most recent first.
    assert.equal(rows[0].periodEndDate, '2025-06-30');
    assert.ok(Math.abs(rows[0].revenueQoqPct! - ((150 - 130) / 130) * 100) < 1e-9);
    assert.ok(Math.abs(rows[0].revenueYoyPct! - ((150 - 100) / 100) * 100) < 1e-9); // vs 2024-06-30
    assert.ok(Math.abs(rows[0].netProfitYoyPct! - ((15 - 10) / 10) * 100) < 1e-9);
  });

  it('leaves QoQ/YoY null when there is no prior period to compare against', () => {
    const rows = computeQuarterlyGrowth([quarter('2025-06-30', { revenue: 100, netProfit: 10 })]);
    assert.equal(rows[0].revenueQoqPct, null);
    assert.equal(rows[0].revenueYoyPct, null);
  });

  it('sorts internally regardless of input order', () => {
    const a = quarter('2025-01-31', { revenue: 1 });
    const b = quarter('2025-06-30', { revenue: 2 });
    const rows = computeQuarterlyGrowth([a, b]);
    assert.equal(rows[0].periodEndDate, '2025-06-30');
    assert.equal(rows[1].periodEndDate, '2025-01-31');
  });
});
