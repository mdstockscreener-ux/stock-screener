/**
 * Pure computations for the news/events panel — no I/O, so these are
 * unit-testable without a network call. Used by
 * app/api/news/[symbol]/route.ts (plan doc §4).
 */

import type { DailyPricePoint } from 'bharatstock';

export interface PriceMove {
  /** % change on the event's own trading day (close vs that day's prevClose). */
  t0: number | null;
  /** % change from T0's close to the next trading day's close. */
  t1: number | null;
  /** % change from T0's close to two trading days later's close. */
  t2: number | null;
}

const NULL_MOVE: PriceMove = { t0: null, t1: null, t2: null };

function pctChange(curr: number | null | undefined, prev: number | null | undefined): number | null {
  if (curr == null || prev == null || !Number.isFinite(curr) || !Number.isFinite(prev) || prev === 0) {
    return null;
  }
  return ((curr - prev) / Math.abs(prev)) * 100;
}

/**
 * Price move around an event date (plan doc §4.3 — compute the move first,
 * never let an LLM invent one from a headline alone). `eventDateIso` need
 * not be a trading day — this finds the first trading day on or after it.
 * Returns all-null when the date falls outside the given price window.
 */
export function computePriceMove(prices: DailyPricePoint[], eventDateIso: string): PriceMove {
  const sorted = [...prices]
    .filter((p): p is DailyPricePoint & { tradeDate: string } => typeof p.tradeDate === 'string')
    .sort((a, b) => a.tradeDate.localeCompare(b.tradeDate));

  const idx = sorted.findIndex((p) => p.tradeDate >= eventDateIso);
  if (idx === -1) return NULL_MOVE;

  const day0 = sorted[idx];
  const day1 = sorted[idx + 1];
  const day2 = sorted[idx + 2];

  return {
    t0: pctChange(day0.close, day0.prevClose),
    t1: day1 ? pctChange(day1.close, day0.close) : null,
    t2: day2 ? pctChange(day2.close, day1.close) : null,
  };
}

export type TransactionDirection = 'buy' | 'sell' | 'unknown';

/** Deterministic buy/sell read off a SEBI PIT transaction-type string — no LLM needed, the field is already unambiguous. */
export function classifyTransactionDirection(transactionType: string | null | undefined): TransactionDirection {
  if (!transactionType) return 'unknown';
  const t = transactionType.toLowerCase();
  if (t.includes('acqui') || t.includes('buy') || t.includes('purchase') || t.includes('subscri')) return 'buy';
  if (t.includes('dispos') || t.includes('sale') || t.includes('sell') || t.includes('pledge')) return 'sell';
  return 'unknown';
}

/** Corporate actions are mechanical — a label, not an LLM read (plan doc §4.3). */
export function buildCorporateActionLabel(actionType: string, subject: string | null | undefined): string {
  return subject ? `${actionType}: ${subject}` : actionType;
}

export function buildInsiderTradeLabel(
  acquirerName: string,
  transactionType: string | null | undefined,
  quantity: number | null | undefined
): string {
  const qty = quantity != null && Number.isFinite(quantity) ? quantity.toLocaleString('en-IN') : 'an undisclosed number of';
  return `${acquirerName} — ${transactionType ?? 'transaction'} of ${qty} shares`;
}

export function buildDealLabel(
  clientName: string,
  buySell: string | null | undefined,
  quantity: number | null | undefined,
  avgPrice: number | null | undefined
): string {
  const qty = quantity != null && Number.isFinite(quantity) ? quantity.toLocaleString('en-IN') : 'an undisclosed number of';
  const price = avgPrice != null && Number.isFinite(avgPrice) ? ` @ ₹${avgPrice.toFixed(2)}` : '';
  return `${clientName} — ${buySell ?? 'trade'} ${qty} shares${price}`;
}
