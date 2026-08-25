/**
 * Types for the Bottom-Out Scanner. Self-contained — the NSE dashboard
 * types in types/index.ts are unrelated and untouched.
 */

/** One row of the screen_52w_summary view. Percentages are fractions (0.25 = 25%). */
export interface Screen52wSummaryRow {
  symbol: string;
  name: string | null;
  /** Global latest bar date across the universe — the window's end. */
  as_of: string;
  /** Latest adjusted close within the window. Last stored close, not a live quote. */
  close: number;
  /** Date of that close. Older than as_of ⇒ the symbol is stale. */
  last_bar_date: string;
  low_52w: number;
  low_52w_date: string;
  high_52w: number;
  high_52w_date: string;
  pct_from_low: number;
  /** Negative: the close is at or below the 52-week high. */
  pct_from_high: number;
  days_since_low: number;
}

/** Tunable thresholds. Percent values are whole numbers (25 = 25%). */
export interface ScannerParams {
  /** X — max % above the 52-week low. */
  maxPctAboveLow: number;
  /** Y — min % above the 52-week low. */
  minPctAboveLow: number;
  /** Aged-low guard: require the low to be at least N days old. */
  agedLowEnabled: boolean;
  /** N — days since the 52-week low. */
  agedLowDays: number;
  /** Optional guard: require the close to be well below the 52-week high. */
  belowHighEnabled: boolean;
  /** Threshold as a positive percent; a row passes when pct_from_high <= -threshold. */
  belowHighPct: number;
}

export const DEFAULT_PARAMS: ScannerParams = {
  maxPctAboveLow: 25,
  minPctAboveLow: 5,
  agedLowEnabled: true,
  agedLowDays: 20,
  belowHighEnabled: false,
  belowHighPct: 30,
};

/** Latest row from ingestion_runs — drives the "data as of" badge. */
export interface IngestionRun {
  finished_at: string | null;
  range_end: string | null;
  symbols_ok: number | null;
  symbols_failed: number | null;
}

/** A saved snapshot header, as listed for the backtest section to pick from. */
export interface SavedScreen {
  id: number;
  name: string;
  created_at: string;
  data_as_of: string | null;
  params: ScannerParams | Record<string, unknown>;
  /** Filled in client-side from screen_results. */
  resultCount?: number;
}

/** A frozen metric snapshot row written to screen_results. */
export interface ScreenResultRow {
  screen_id: number;
  symbol: string;
  close: number;
  low_52w: number;
  low_52w_date: string;
  high_52w: number;
  pct_from_low: number;
  pct_from_high: number;
  days_since_low: number;
}

export type SortKey = 'pct_from_low' | 'days_since_low';
export type SortDir = 'asc' | 'desc';
