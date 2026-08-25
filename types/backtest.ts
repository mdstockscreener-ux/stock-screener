/**
 * Types for the Advanced Darvas Box strategy backtest.
 *
 * Self-contained: the Bottom-Out Scanner types in types/screener.ts and the
 * NSE dashboard types in types/index.ts are unrelated and untouched.
 */

/**
 * One daily bar, split/bonus adjusted. `date` is an ISO calendar date
 * (YYYY-MM-DD) with no time component — the engine compares these as strings,
 * which is only sound because ISO dates sort lexicographically.
 */
export interface Bar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
}

/**
 * Every strategy knob, all of them supplied by the caller.
 *
 * The engine deliberately holds no defaults of its own — see
 * DEFAULT_FORM_VALUES for the UI's initial values. Percent fields are whole
 * numbers (6 = 6%), matching what the form shows.
 */
export interface BacktestParams {
  /** Sandboxed capital for this one stock. */
  startingCapital: number;
  /** How many equal slices the capital is cut into (Rule 1). */
  trancheCount: number;
  /** Fixed profit target above the average entry price. */
  profitTargetPct: number;
  /** Stop distance below the average entry price. The value being searched. */
  stopLossPct: number;
  /** Rule 3 — a new tranche this close to the last entry is not worth taking. */
  ignorableRangePct: number;
}

/**
 * Initial values for the form's numeric fields.
 *
 * stopLossPct is absent on purpose: it is the variable under study, so the
 * user must type one rather than inherit a number that looks authoritative.
 */
export const DEFAULT_FORM_VALUES: Omit<BacktestParams, 'stopLossPct'> = {
  startingCapital: 600000,
  trancheCount: 6,
  profitTargetPct: 6,
  ignorableRangePct: 2.75,
};

/** Why a position was closed. `open-at-end` is the range running out, not a fill. */
export type ExitReason = 'target' | 'stop' | 'open-at-end';

/** Why a triggered breakout did not become a tranche. */
export type SkipReason = 'ignorable-range' | 'tranche-below-one-share';

export interface EntryEvent {
  kind: 'entry';
  date: string;
  /** Actual fill: max(trigger, open) — a gap-up fills at the open. */
  price: number;
  qty: number;
  /** 1-based tranche number within the current position. */
  tranche: number;
  /** The prior completed week's high that armed this entry. */
  triggerLevel: number;
  /** True when the bar opened at or above the trigger. */
  gapUp: boolean;
  avgPriceAfter: number;
  positionQtyAfter: number;
  costAfter: number;
}

export interface ExitEvent {
  kind: 'exit';
  date: string;
  /** Target exits fill at the target; stop exits at min(stop, open). */
  price: number;
  qty: number;
  reason: ExitReason;
  avgEntryPrice: number;
  stopLevel: number;
  targetLevel: number;
  /** True when the bar opened below the stop, so the fill is worse than the stop. */
  gapDown: boolean;
  pnl: number;
  pnlPct: number;
  rMultiple: number | null;
}

export interface SkipEvent {
  kind: 'skip';
  date: string;
  /** The fill the tranche would have taken. */
  price: number;
  triggerLevel: number;
  reason: SkipReason;
  lastEntryPrice: number | null;
}

export type TradeEvent = EntryEvent | ExitEvent | SkipEvent;

/** One full round trip: every tranche of a position plus the single exit that closed it. */
export interface RoundTrip {
  /** 1-based, in chronological order. */
  index: number;
  /** Date of the first tranche. */
  entryDate: string;
  exitDate: string;
  tranches: number;
  qty: number;
  avgEntryPrice: number;
  exitPrice: number;
  reason: ExitReason;
  pnl: number;
  /** Return on this position's own cost basis, not on total capital. */
  pnlPct: number;
  /** Currency at risk: qty x (avg entry - stop). */
  riskAmount: number;
  /** pnl / riskAmount. Null only if the stop distance was zero. */
  rMultiple: number | null;
  /** Bars from first tranche to exit, inclusive. */
  barsHeld: number;
  /** True for the position still open when the range ran out. */
  stillOpen: boolean;
}

/** One point on the equity curve, one per bar. */
export interface EquityPoint {
  date: string;
  /** Starting capital plus realized P&L only. */
  realized: number;
  /** Realized plus the open position marked to this bar's close. */
  equity: number;
  /** Cost basis currently deployed. */
  invested: number;
  positionQty: number;
  /** Drawdown from the running peak of `equity`, as a percent. */
  drawdownPct: number;
}

export interface BacktestMetrics {
  startingCapital: number;
  /** Mark-to-market at the last bar's close. */
  finalEquity: number;
  /** Cash-only: starting capital plus closed-trade P&L. */
  finalRealized: number;
  totalReturnPct: number;
  realizedReturnPct: number;
  /** Closed round trips. An open position at the end is not counted. */
  tradeCount: number;
  winCount: number;
  lossCount: number;
  winRatePct: number;
  /** Mean P&L of winners. */
  avgWin: number;
  /** Mean P&L of losers, as a positive magnitude. */
  avgLoss: number;
  /** Gross wins / gross losses. Null when there were no losses to divide by. */
  profitFactor: number | null;
  /** Expectancy in R — the mean R-multiple across closed trades. */
  expectancyR: number | null;
  /** Expectancy in currency — the mean P&L per closed trade. */
  expectancy: number;
  maxDrawdownPct: number;
  maxDrawdownAmount: number;
  maxDrawdownPeakDate: string | null;
  maxDrawdownTroughDate: string | null;
  barsInMarket: number;
  totalBars: number;
  timeInMarketPct: number;
  /** Deepest simultaneous deployment, as a count of tranches. */
  maxTranchesDeployed: number;
}

export interface BacktestResult {
  params: BacktestParams;
  /** Every entry, exit and skipped breakout, in bar order. */
  events: TradeEvent[];
  /** Closed round trips only. */
  trades: RoundTrip[];
  /** The position still open at the last bar, marked to its close. */
  openPosition: RoundTrip | null;
  equity: EquityPoint[];
  metrics: BacktestMetrics;
  firstBarDate: string | null;
  lastBarDate: string | null;
  barCount: number;
}

/** Where the bars came from. */
export type BarSource = 'store' | 'fetched';

/** Provenance for the bars a run used — drives the source badge and caveats. */
export interface DataProvenance {
  source: BarSource;
  /** Human label for the badge. */
  sourceLabel: string;
  /** As typed by the user, upper-cased. */
  symbol: string;
  /** The ticker actually queried upstream, when fetched. */
  resolvedTicker: string | null;
  name: string | null;
  /** True when the symbol is in the store's fixed universe. */
  inUniverse: boolean;
  /** Last bar date available in the data — the "as of" date. */
  asOf: string | null;
  requestedStart: string;
  requestedEnd: string;
  /** The window actually covered by the bars returned. */
  coveredStart: string | null;
  coveredEnd: string | null;
  barCount: number;
  /** Always true — the engine refuses unadjusted bars. */
  adjusted: boolean;
  /** Non-fatal notes worth showing the user. */
  warnings: string[];
}

export interface BacktestResponse {
  data: DataProvenance;
  result: BacktestResult;
}
