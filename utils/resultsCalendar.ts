/**
 * Pure logic for the Upcoming Results section.
 *
 * Everything here is a plain function over rows — no I/O, no React — so the
 * two rules that are easy to get wrong (what counts as upcoming, and which of
 * a symbol's meetings is the live one) are unit-tested rather than eyeballed.
 */

import { HORIZONS } from '@/types/results';
import type {
  DecoratedResultsEvent,
  ResultsDay,
  ResultsEvent,
  ResultsFilters,
  ResultsSortDir,
  ResultsSortKey,
  HorizonKey,
} from '@/types/results';

/**
 * Rows written by one collector run share a timestamp, but a run that batches
 * its upserts can smear it across a few seconds. Anything inside this window
 * counts as the same pull, so a batched run does not mark half its own rows
 * stale.
 */
const SAME_PULL_TOLERANCE_MS = 60_000;

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function ms(iso: string): number {
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * Today as a local YYYY-MM-DD.
 *
 * Local rather than UTC on purpose: a board meeting on the 29th is the 29th in
 * Mumbai, and `toISOString()` would roll it back a day for every IST user
 * before 05:30.
 */
export function todayIso(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function addDaysIso(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const dt = new Date(year, month - 1, day);
  dt.setDate(dt.getDate() + days);
  return todayIso(dt);
}

/** Whole days from `from` to `to`. Computed in UTC so no DST shift can round it off. */
export function daysBetween(from: string, to: string): number {
  const toUtc = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  return Math.round((toUtc(to) - toUtc(from)) / MS_PER_DAY);
}

/** The most recent `last_seen_at` in the set — when the collector last ran. */
export function collectedAtOf(rows: ResultsEvent[]): string | null {
  let latest: string | null = null;
  for (const row of rows) {
    if (latest === null || ms(row.last_seen_at) > ms(latest)) latest = row.last_seen_at;
  }
  return latest;
}

/**
 * Flags each row against the table as a whole.
 *
 * A meeting NSE has stopped returning keeps its old `last_seen_at` while every
 * live row moves forward on the next pull — that gap is the only evidence the
 * schema carries, since nothing deletes or tombstones a cancelled meeting.
 *
 * If the same symbol also has a row that *was* in the latest pull, the old one
 * is a reschedule left behind by the (symbol, date, purpose) unique key rather
 * than a cancellation, so it is marked superseded and hidden by default.
 */
export function decorate(
  rows: ResultsEvent[],
  collectedAt: string | null
): DecoratedResultsEvent[] {
  const freshestBySymbol = new Map<string, number>();
  for (const row of rows) {
    const seen = ms(row.last_seen_at);
    const best = freshestBySymbol.get(row.symbol);
    if (best === undefined || seen > best) freshestBySymbol.set(row.symbol, seen);
  }

  const latest = collectedAt === null ? null : ms(collectedAt);

  return rows.map((row) => {
    const seen = ms(row.last_seen_at);
    const stale = latest !== null && latest - seen > SAME_PULL_TOLERANCE_MS;
    const freshest = freshestBySymbol.get(row.symbol) ?? seen;
    const superseded = stale && freshest - seen > SAME_PULL_TOLERANCE_MS;
    return { ...row, stale, superseded };
  });
}

/** The inclusive date window a horizon covers, relative to `today`. */
export function horizonWindow(
  horizon: HorizonKey,
  today: string
): { from: string; to: string | null } {
  const option = HORIZONS.find((h) => h.key === horizon) ?? HORIZONS[0];
  return {
    from: addDaysIso(today, -option.backDays),
    to: option.forwardDays === null ? null : addDaysIso(today, option.forwardDays),
  };
}

export function filterRows(
  rows: DecoratedResultsEvent[],
  filters: ResultsFilters,
  today: string
): DecoratedResultsEvent[] {
  const { from, to } = horizonWindow(filters.horizon, today);
  const needle = filters.search.trim().toLowerCase();

  return rows.filter((row) => {
    // ISO dates compare correctly as strings, which is why they are kept as strings.
    if (row.board_meeting_date < from) return false;
    if (to !== null && row.board_meeting_date > to) return false;

    if (!filters.showSuperseded && row.superseded) return false;

    if (needle !== '') {
      const haystack = `${row.symbol} ${row.company_name}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }

    return true;
  });
}

/** Groups into days, keeping the ascending date order the query already gave us. */
export function groupByDate(rows: DecoratedResultsEvent[]): ResultsDay[] {
  const days: ResultsDay[] = [];
  let current: ResultsDay | null = null;

  for (const row of rows) {
    if (current === null || current.date !== row.board_meeting_date) {
      current = { date: row.board_meeting_date, rows: [] };
      days.push(current);
    }
    current.rows.push(row);
  }

  return days;
}

export function sortRows(
  rows: DecoratedResultsEvent[],
  key: ResultsSortKey,
  dir: ResultsSortDir
): DecoratedResultsEvent[] {
  const sign = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const diff = a[key].localeCompare(b[key]);
    // Stable, predictable ordering when the sort key ties.
    if (diff !== 0) return diff * sign;
    const byDate = a.board_meeting_date.localeCompare(b.board_meeting_date);
    return byDate !== 0 ? byDate : a.symbol.localeCompare(b.symbol);
  });
}

/** "Fri, 29-Aug-2026". Built by hand so the server and client cannot disagree on a locale. */
export function formatDayHeading(iso: string, formatDate: (iso: string) => string): string {
  const [year, month, day] = iso.split('-').map(Number);
  const weekday = WEEKDAYS[new Date(year, month - 1, day).getDay()];
  return `${weekday}, ${formatDate(iso)}`;
}

/** "Today" / "Tomorrow" / "in 5 days" / "3 days ago". */
export function relativeDayLabel(iso: string, today: string): string {
  const delta = daysBetween(today, iso);
  if (delta === 0) return 'Today';
  if (delta === 1) return 'Tomorrow';
  if (delta === -1) return 'Yesterday';
  if (delta > 0) return `in ${delta} days`;
  return `${Math.abs(delta)} days ago`;
}

/** How long ago the collector last ran, in whole days. Null when nothing has been collected. */
export function daysSinceCollected(collectedAt: string | null, today: string): number | null {
  if (collectedAt === null) return null;
  const parsed = new Date(ms(collectedAt));
  return daysBetween(todayIso(parsed), today);
}
