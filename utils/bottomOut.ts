import type {
  Screen52wSummaryRow,
  ScannerParams,
  SortDir,
  SortKey,
} from '@/types/screener';

/**
 * Does one summary row pass the current thresholds?
 *
 * Pure and cheap — it runs over the whole universe on every keystroke and
 * slider drag, which is why the summary is fetched once and filtered here
 * rather than re-queried per adjustment.
 */
export function passesFilter(row: Screen52wSummaryRow, params: ScannerParams): boolean {
  const {
    maxPctAboveLow,
    minPctAboveLow,
    agedLowEnabled,
    agedLowDays,
    belowHighEnabled,
    belowHighPct,
  } = params;

  if (!Number.isFinite(row.close) || !Number.isFinite(row.low_52w)) return false;

  // Band: sitting near the 52-week low, but already lifted off it.
  const floor = row.low_52w * (1 + minPctAboveLow / 100);
  const ceiling = row.low_52w * (1 + maxPctAboveLow / 100);
  if (row.close < floor || row.close > ceiling) return false;

  // Aged-low guard: the low must be old enough that the stock is no longer
  // making new lows.
  if (agedLowEnabled && row.days_since_low < agedLowDays) return false;

  // Optional: only stocks meaningfully below their 52-week high.
  if (belowHighEnabled && !(row.pct_from_high <= -belowHighPct / 100)) return false;

  return true;
}

export function filterRows(
  rows: Screen52wSummaryRow[],
  params: ScannerParams
): Screen52wSummaryRow[] {
  return rows.filter((row) => passesFilter(row, params));
}

export function sortRows(
  rows: Screen52wSummaryRow[],
  key: SortKey,
  dir: SortDir
): Screen52wSummaryRow[] {
  const sign = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const diff = a[key] - b[key];
    // Stable, predictable ordering when the sort key ties.
    return diff !== 0 ? diff * sign : a.symbol.localeCompare(b.symbol);
  });
}

/** A symbol whose last bar predates the universe's latest bar hasn't traded recently. */
export function isStale(row: Screen52wSummaryRow): boolean {
  return row.last_bar_date < row.as_of;
}

export function formatPct(fraction: number): string {
  if (!Number.isFinite(fraction)) return '—';
  return `${(fraction * 100).toFixed(1)}%`;
}

export function formatDate(iso: string): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  const monthIndex = Number(m) - 1;
  if (!y || !months[monthIndex]) return iso;
  return `${d}-${months[monthIndex]}-${y}`;
}

export function formatTimestamp(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
