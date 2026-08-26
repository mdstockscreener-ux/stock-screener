/**
 * Types for the Upcoming Results section.
 *
 * Self-contained: the scanner types in types/screener.ts, the backtest types in
 * types/backtest.ts and the NSE dashboard types in types/index.ts are unrelated
 * and untouched.
 *
 * The rows come from `results_calendar`, written by the separate
 * event-calendar-data-collector extension into the same Supabase project. This
 * app only ever reads that table.
 */

/** One board meeting, as stored by the collector. */
export interface ResultsEvent {
  id: string;
  symbol: string;
  company_name: string;
  /** Canonicalised by the collector — "Financial Results" for results events. */
  purpose: string;
  /** ISO calendar date, YYYY-MM-DD. */
  board_meeting_date: string;
  description: string | null;
  /** Bumped on every collector run that still sees this meeting. */
  last_seen_at: string;
}

/**
 * A row plus what can only be known by looking at the table as a whole.
 *
 * The collector's unique key is (symbol, date, purpose), so a rescheduled
 * meeting arrives as a *new* row and the old one is left behind. The old row
 * stops being touched, which is what makes it detectable.
 */
export interface DecoratedResultsEvent extends ResultsEvent {
  /** NSE no longer returns this meeting — it was not in the latest pull. */
  stale: boolean;
  /** Stale, and the same symbol has a meeting that *was* in the latest pull. */
  superseded: boolean;
}

/** A day's worth of meetings, for the grouped view. */
export interface ResultsDay {
  date: string;
  rows: DecoratedResultsEvent[];
}

export type HorizonKey = 'week' | 'month' | 'quarter' | 'all' | 'recent';

export interface HorizonOption {
  key: HorizonKey;
  label: string;
  /** Days forward from today. Null means no upper bound. */
  forwardDays: number | null;
  /** Days backward from today. Zero means upcoming only. */
  backDays: number;
}

export const HORIZONS: HorizonOption[] = [
  { key: 'week', label: 'Next 7 days', forwardDays: 7, backDays: 0 },
  { key: 'month', label: 'Next 30 days', forwardDays: 30, backDays: 0 },
  { key: 'quarter', label: 'Next 90 days', forwardDays: 90, backDays: 0 },
  { key: 'all', label: 'All upcoming', forwardDays: null, backDays: 0 },
  { key: 'recent', label: 'Include last 30 days', forwardDays: null, backDays: 30 },
];

export interface ResultsFilters {
  horizon: HorizonKey;
  /** Matched against both symbol and company name, case-insensitively. */
  search: string;
  /** Superseded rows are hidden by default — they are meetings that moved. */
  showSuperseded: boolean;
}

export const DEFAULT_FILTERS: ResultsFilters = {
  horizon: 'month',
  search: '',
  showSuperseded: false,
};

/** Grouped reads like a calendar; the table sorts and scans. Both are offered. */
export type ViewMode = 'grouped' | 'table';

export type ResultsSortKey = 'symbol' | 'company_name' | 'board_meeting_date';
export type ResultsSortDir = 'asc' | 'desc';
