/**
 * Pure computations over BharatStock fundamentals data — no I/O, so these
 * are unit-testable without a network call or a Supabase instance. Used by
 * app/api/analyze/[symbol]/route.ts to turn cached BharatStock payloads into
 * the self-PE percentile, peer ranking and QoQ/YoY figures the fundamentals
 * panel shows (plan doc §2.3).
 */

import type { ComparisonItem, FinancialPeriod } from 'bharatstock';

export interface PePercentile {
  currentPe: number | null;
  /** 0–100: the % of the historical sample at or below currentPe. Null if there's no sample. */
  percentile: number | null;
  sampleSize: number;
  minPe: number | null;
  maxPe: number | null;
  medianPe: number | null;
}

/** Ranks currentPe against the trailing quarterly PE history (plan doc §2.3, "Self PE"). */
export function computeSelfPePercentile(
  currentPe: number | null | undefined,
  quarterlyPeriods: FinancialPeriod[]
): PePercentile {
  const history = quarterlyPeriods
    .map((p) => p.peRatio)
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));

  if (currentPe == null || !Number.isFinite(currentPe) || history.length === 0) {
    return {
      currentPe: currentPe ?? null,
      percentile: null,
      sampleSize: history.length,
      minPe: null,
      maxPe: null,
      medianPe: null,
    };
  }

  const sorted = [...history].sort((a, b) => a - b);
  const countAtOrBelow = sorted.filter((v) => v <= currentPe).length;
  const mid = Math.floor(sorted.length / 2);
  const medianPe = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];

  return {
    currentPe,
    percentile: (countAtOrBelow / sorted.length) * 100,
    sampleSize: sorted.length,
    minPe: sorted[0],
    maxPe: sorted[sorted.length - 1],
    medianPe,
  };
}

export interface PeerRanking {
  peerCount: number;
  /** 0–100: the % of peers (with a PE) priced at or below this symbol's PE. Null if the symbol isn't in the peer set. */
  peRankPercentile: number | null;
  /** Arithmetic mean PE across every peer with a PE (self included, if present). Null if no peer has a PE. */
  averagePe: number | null;
  /** Middle value — less skewed by a single outlier peer than the average. Null if no peer has a PE. */
  medianPe: number | null;
}

/** Ranks a symbol's PE against its sector peer set (plan doc §2.3, "Peer PE comparison"). */
export function computePeerPeRanking(symbol: string, peers: ComparisonItem[]): PeerRanking {
  const withPe = peers.filter(
    (p): p is ComparisonItem & { peRatio: number } => typeof p.peRatio === 'number' && Number.isFinite(p.peRatio)
  );

  if (withPe.length === 0) {
    return { peerCount: 0, peRankPercentile: null, averagePe: null, medianPe: null };
  }

  const averagePe = withPe.reduce((sum, p) => sum + p.peRatio, 0) / withPe.length;
  const sortedPe = withPe.map((p) => p.peRatio).sort((a, b) => a - b);
  const mid = Math.floor(sortedPe.length / 2);
  const medianPe = sortedPe.length % 2 === 0 ? (sortedPe[mid - 1] + sortedPe[mid]) / 2 : sortedPe[mid];

  const self = withPe.find((p) => p.symbol.toUpperCase() === symbol.toUpperCase());
  const peRankPercentile = self
    ? (withPe.filter((p) => p.peRatio <= self.peRatio).length / withPe.length) * 100
    : null;

  return { peerCount: withPe.length, peRankPercentile, averagePe, medianPe };
}

export interface QuarterGrowthRow {
  fiscalYear: string;
  quarter: string | null;
  periodEndDate: string | null;
  revenue: number | null;
  netProfit: number | null;
  eps: number | null;
  revenueQoqPct: number | null;
  revenueYoyPct: number | null;
  netProfitQoqPct: number | null;
  netProfitYoyPct: number | null;
}

function pctChange(curr: number | null | undefined, prev: number | null | undefined): number | null {
  if (curr == null || prev == null || !Number.isFinite(curr) || !Number.isFinite(prev) || prev === 0) {
    return null;
  }
  return ((curr - prev) / Math.abs(prev)) * 100;
}

/** Most-recent-first; missing periodEndDate values sort last. */
function sortPeriodsDesc(periods: FinancialPeriod[]): FinancialPeriod[] {
  return [...periods].sort((a, b) => {
    if (!a.periodEndDate) return 1;
    if (!b.periodEndDate) return -1;
    return b.periodEndDate.localeCompare(a.periodEndDate);
  });
}

/**
 * QoQ diffs against the prior quarter; YoY diffs against the same quarter a
 * year back (4 quarters earlier once sorted most-recent-first). Input order
 * doesn't matter — this sorts internally.
 */
export function computeQuarterlyGrowth(periods: FinancialPeriod[]): QuarterGrowthRow[] {
  const sorted = sortPeriodsDesc(periods);

  return sorted.map((p, i) => {
    const prevQuarter = sorted[i + 1];
    const prevYear = sorted[i + 4];
    return {
      fiscalYear: p.fiscalYear,
      quarter: p.quarter ?? null,
      periodEndDate: p.periodEndDate ?? null,
      revenue: p.revenue ?? null,
      netProfit: p.netProfit ?? null,
      eps: p.eps ?? null,
      revenueQoqPct: pctChange(p.revenue, prevQuarter?.revenue),
      revenueYoyPct: pctChange(p.revenue, prevYear?.revenue),
      netProfitQoqPct: pctChange(p.netProfit, prevQuarter?.netProfit),
      netProfitYoyPct: pctChange(p.netProfit, prevYear?.netProfit),
    };
  });
}
