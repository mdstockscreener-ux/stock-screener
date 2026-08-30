/**
 * Presentation helpers for the backtest section.
 *
 * The engine deals in exact numbers and the API hands them over untouched;
 * rounding happens here and nowhere else, so nothing that feeds a calculation
 * has been through a formatter first.
 */

import type { ExitReason, OrderOutcome, SkipReason } from '@/types/backtest';

/** Rupees with paise. Full precision — these are fill prices, not headline figures. */
export function formatMoney(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return `₹${value.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Rupees rounded to whole units, for totals where paise are noise. */
export function formatMoneyRound(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return `₹${Math.round(value).toLocaleString('en-IN')}`;
}

/** Always carries its sign, so a P&L column reads at a glance. */
export function formatSignedMoney(value: number): string {
  if (!Number.isFinite(value)) return '—';
  const sign = value >= 0 ? '+' : '−';
  return `${sign}₹${Math.abs(value).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** `value` is already a percent (6 means six percent), matching the engine's output. */
export function formatPercent(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return '—';
  return `${value.toFixed(digits)}%`;
}

export function formatSignedPercent(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return '—';
  const sign = value >= 0 ? '+' : '−';
  return `${sign}${Math.abs(value).toFixed(digits)}%`;
}

export function formatR(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  const sign = value >= 0 ? '+' : '−';
  return `${sign}${Math.abs(value).toFixed(2)}R`;
}

export function formatRatio(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return value.toFixed(2);
}

/** Reuses the scanner's positive/negative colours rather than defining new ones. */
export function signClass(value: number): string {
  if (value > 0) return 'bos-pos';
  if (value < 0) return 'bos-neg';
  return '';
}

export function exitReasonLabel(reason: ExitReason): string {
  if (reason === 'target') return 'Target';
  if (reason === 'stop') return 'Stop';
  return 'Still open';
}

export function skipReasonLabel(reason: SkipReason): string {
  // Only one way a triggered order fails to buy: the tranche is too small.
  return reason === 'tranche-below-one-share' ? 'Tranche below one share' : reason;
}

/** What the weekend did to the resting GTT. */
export function orderOutcomeLabel(outcome: OrderOutcome): string {
  switch (outcome) {
    case 'placed':
      return 'Placed';
    case 'repriced':
      return 'Re-priced';
    case 'cancelled-ignorable':
      return 'Not placed — ignorable range';
    case 'not-placed-no-tranches':
      return 'Not placed — no tranches left';
    case 'cancelled-on-exit':
      return 'Cancelled — position closed';
    default:
      return outcome;
  }
}

/** Short explanation of why the order sits where it does, for the order book. */
export function orderOutcomeDetail(
  outcome: OrderOutcome,
  weeklyHigh: number,
  previousTrigger: number | null,
  lastEntryPrice: number | null
): string {
  if (outcome === 'placed') {
    return `Resting at last week's high of ${formatMoney(weeklyHigh)}`;
  }
  if (outcome === 'repriced') {
    const direction =
      previousTrigger === null || previousTrigger === weeklyHigh
        ? 'moved'
        : weeklyHigh > previousTrigger
          ? 'raised'
          : 'lowered';
    return `Unfilled, so ${direction} from ${formatMoney(previousTrigger ?? weeklyHigh)} to ${formatMoney(weeklyHigh)}`;
  }
  if (outcome === 'cancelled-on-exit') {
    const at = formatMoney(previousTrigger ?? weeklyHigh);
    return `Position closed, so the order resting at ${at} was pulled — the cycle restarts next weekend`;
  }
  if (outcome === 'cancelled-ignorable') {
    const gap =
      lastEntryPrice === null || lastEntryPrice === 0
        ? ''
        : ` (${(((weeklyHigh - lastEntryPrice) / lastEntryPrice) * 100).toFixed(2)}% away)`;
    return `Last week's high of ${formatMoney(weeklyHigh)} is too near the last buy at ${formatMoney(lastEntryPrice ?? 0)}${gap} — nothing rests this week`;
  }
  return 'Every tranche is deployed, so there is nothing left to buy with';
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * A sensible opening window: the last three years, ending today.
 *
 * Computed on demand rather than at module load, and only ever called from an
 * effect — a date baked in during render would differ between the server pass
 * and the client one whenever a run straddles midnight.
 */
export function defaultDateRange(): { start: string; end: string } {
  const end = new Date();
  const start = new Date(end);
  start.setFullYear(start.getFullYear() - 3);
  return { start: isoDate(start), end: isoDate(end) };
}
