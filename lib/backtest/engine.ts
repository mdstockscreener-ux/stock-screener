/**
 * Advanced Darvas Box — backtest engine.
 *
 * Pure: bars in, results out. No I/O, no clock, no globals — so a run is
 * reproducible and unit-testable.
 *
 * Every strategy number arrives in `params`. There is deliberately not a single
 * numeric literal in this file standing in for a tranche count, a profit
 * target, a stop distance or an ignorable range; the only bare numbers here are
 * unit conversions and calendar arithmetic.
 *
 * No look-ahead. At bar i the engine sees bars[0..i] and nothing more: the
 * trigger level comes from the last *completed* week, and fills come from the
 * current bar's own OHLC. Feeding the engine a prefix of the bars produces a
 * prefix of the events — engine.test.ts asserts exactly that.
 */

import type {
  Bar,
  BacktestMetrics,
  BacktestParams,
  BacktestResult,
  EquityPoint,
  ExitReason,
  RoundTrip,
  TradeEvent,
} from '@/types/backtest';

/** Whole-number percents (a "5" means five percent) become fractions through this. */
const PCT_DIVISOR = 100;

const DAYS_IN_WEEK = 7;

/** Length of an ISO calendar date, for slicing YYYY-MM-DD out of an ISO string. */
const ISO_DATE_LEN = 10;

/**
 * The Monday of the ISO week containing `date`, as YYYY-MM-DD.
 *
 * Used only as an opaque, chronologically-sortable week key. Anchoring on the
 * Monday sidesteps ISO week *numbering* entirely, so the last days of December
 * never collide with the first days of January.
 */
export function isoWeekStart(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(year, month - 1, day));
  // getUTCDay is Sunday-first; ISO counts Monday as day one and Sunday as last.
  const weekday = dt.getUTCDay();
  const isoDay = weekday === 0 ? DAYS_IN_WEEK : weekday;
  dt.setUTCDate(dt.getUTCDate() - (isoDay - 1));
  return dt.toISOString().slice(0, ISO_DATE_LEN);
}

/**
 * The prior completed week's high for each bar, aligned to `bars` by index.
 *
 * Null until a full week has closed. Exported so tests — and anyone reading a
 * trade log and wondering where a trigger came from — can check the levels
 * independently of the trade simulation.
 *
 * A week with no bars at all (a full exchange holiday week) leaves the previous
 * level standing rather than blanking the trigger: the most recent completed
 * week that actually traded is still the honest answer, and using it looks no
 * further forward than the strict prior week would.
 */
export function priorWeekHighs(bars: Bar[]): (number | null)[] {
  const levels: (number | null)[] = [];
  let currentWeekKey = '';
  let currentWeekHigh = Number.NEGATIVE_INFINITY;
  let priorHigh: number | null = null;

  for (const bar of bars) {
    const weekKey = isoWeekStart(bar.date);

    if (weekKey !== currentWeekKey) {
      // A new week starts, so the week we were accumulating is now complete.
      if (currentWeekKey !== '') priorHigh = currentWeekHigh;
      currentWeekKey = weekKey;
      currentWeekHigh = bar.high;
    } else {
      currentWeekHigh = Math.max(currentWeekHigh, bar.high);
    }

    // Recorded before this bar can influence anything: the level this bar
    // trades against was fixed when the previous week closed.
    levels.push(priorHigh);
  }

  return levels;
}

export class BacktestParamError extends Error {}

function requireFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new BacktestParamError(`${label} must be a number.`);
}

/** Rejects parameter sets that would make the run meaningless rather than quietly coping. */
export function validateParams(params: BacktestParams): void {
  requireFinite(params.startingCapital, 'Starting capital');
  requireFinite(params.trancheCount, 'Tranche count');
  requireFinite(params.profitTargetPct, 'Profit target %');
  requireFinite(params.stopLossPct, 'Stop-loss %');
  requireFinite(params.ignorableRangePct, 'Ignorable-range %');

  if (params.startingCapital <= 0) {
    throw new BacktestParamError('Starting capital must be greater than zero.');
  }
  if (!Number.isInteger(params.trancheCount) || params.trancheCount < 1) {
    throw new BacktestParamError('Tranche count must be a whole number of at least one.');
  }
  if (params.profitTargetPct <= 0) {
    throw new BacktestParamError('Profit target % must be greater than zero.');
  }
  if (params.stopLossPct <= 0 || params.stopLossPct >= PCT_DIVISOR) {
    throw new BacktestParamError(
      'Stop-loss % must be greater than zero and below one hundred.'
    );
  }
  if (params.ignorableRangePct < 0) {
    throw new BacktestParamError('Ignorable-range % cannot be negative.');
  }
}

interface OpenState {
  qty: number;
  /** Total cost basis of the open tranches. */
  cost: number;
  tranchesUsed: number;
  /** Fill price of the most recent tranche — the reference for Rule 3. */
  lastEntry: number | null;
  firstEntryDate: string;
  firstEntryIndex: number;
}

function flatState(): OpenState {
  return {
    qty: 0,
    cost: 0,
    tranchesUsed: 0,
    lastEntry: null,
    firstEntryDate: '',
    firstEntryIndex: -1,
  };
}

/**
 * Runs the strategy over `bars`, which must be in ascending date order.
 *
 * Per bar, in this order:
 *   1. Exit, evaluated against the average entry price. If one bar's range
 *      spans both the stop and the target, the stop is assumed to fill first.
 *   2. Entry, if tranches remain — triggered by the prior completed week's high.
 *
 * Doing exits first means a bar that stops the position out can also start a
 * new one, since the exit restores the full set of tranches. That is the
 * ordering the strategy specifies, and it is the only reading under which
 * "reset and repeat" can happen without idling a bar.
 */
export function runBacktest(bars: Bar[], params: BacktestParams): BacktestResult {
  validateParams(params);

  const targetMultiple = 1 + params.profitTargetPct / PCT_DIVISOR;
  const stopMultiple = 1 - params.stopLossPct / PCT_DIVISOR;
  const ignorableFraction = params.ignorableRangePct / PCT_DIVISOR;
  // Tranche size is pinned to the *starting* capital, so a winning run does not
  // silently compound its position sizes and flatter the later trades.
  const trancheCapital = params.startingCapital / params.trancheCount;

  const triggers = priorWeekHighs(bars);

  const events: TradeEvent[] = [];
  const trades: RoundTrip[] = [];
  const equity: EquityPoint[] = [];

  let state = flatState();
  let realizedPnl = 0;
  let barsInMarket = 0;
  let maxTranchesDeployed = 0;
  let peakEquity = params.startingCapital;
  let maxDrawdownPct = 0;
  let maxDrawdownAmount = 0;
  let maxDrawdownPeakDate: string | null = null;
  let maxDrawdownTroughDate: string | null = null;
  let runningPeakDate: string | null = null;

  for (let i = 0; i < bars.length; i += 1) {
    const bar = bars[i];
    let touchedMarket = state.qty > 0;

    // ── 1. Exit ───────────────────────────────────────────────────────────
    if (state.qty > 0) {
      const avgPrice = state.cost / state.qty;
      const targetLevel = avgPrice * targetMultiple;
      const stopLevel = avgPrice * stopMultiple;
      const stopHit = bar.low <= stopLevel;
      const targetHit = bar.high >= targetLevel;

      if (stopHit || targetHit) {
        // Pessimistic on ambiguity: a bar touching both is treated as the stop
        // filling first, because intraday order is unknowable from OHLC alone.
        const reason: ExitReason = stopHit ? 'stop' : 'target';
        // A gap-down fills below the stop, at the open. A gap through the
        // target still books only the target — conservative in both directions.
        const fill = stopHit ? Math.min(stopLevel, bar.open) : targetLevel;
        const qty = state.qty;
        const cost = state.cost;
        const pnl = qty * fill - cost;
        const riskAmount = qty * (avgPrice - stopLevel);
        const rMultiple = riskAmount > 0 ? pnl / riskAmount : null;
        const pnlPct = (pnl / cost) * PCT_DIVISOR;

        events.push({
          kind: 'exit',
          date: bar.date,
          price: fill,
          qty,
          reason,
          avgEntryPrice: avgPrice,
          stopLevel,
          targetLevel,
          gapDown: stopHit && bar.open < stopLevel,
          pnl,
          pnlPct,
          rMultiple,
        });

        trades.push({
          index: trades.length + 1,
          entryDate: state.firstEntryDate,
          exitDate: bar.date,
          tranches: state.tranchesUsed,
          qty,
          avgEntryPrice: avgPrice,
          exitPrice: fill,
          reason,
          pnl,
          pnlPct,
          riskAmount,
          rMultiple,
          barsHeld: i - state.firstEntryIndex + 1,
          stillOpen: false,
        });

        realizedPnl += pnl;
        // Flat again: the full set of tranches is restored, and Rule 3's
        // reference price is cleared so the next position's first tranche is
        // never blocked by the price the last position happened to end near.
        state = flatState();
      }
    }

    // ── 2. Entry ──────────────────────────────────────────────────────────
    const trigger = triggers[i];
    if (trigger !== null && state.tranchesUsed < params.trancheCount && bar.high >= trigger) {
      // A gap-up above the trigger fills at the open, not back down at the trigger.
      const fill = Math.max(trigger, bar.open);
      const lastEntry = state.lastEntry;

      if (lastEntry !== null && Math.abs(fill - lastEntry) / lastEntry < ignorableFraction) {
        // Rule 3: too close to the last tranche to be worth adding another.
        events.push({
          kind: 'skip',
          date: bar.date,
          price: fill,
          triggerLevel: trigger,
          reason: 'ignorable-range',
          lastEntryPrice: lastEntry,
        });
      } else {
        // Whole shares only — a tranche that cannot buy one is not deployed.
        const addQty = Math.floor(trancheCapital / fill);
        if (addQty < 1) {
          events.push({
            kind: 'skip',
            date: bar.date,
            price: fill,
            triggerLevel: trigger,
            reason: 'tranche-below-one-share',
            lastEntryPrice: lastEntry,
          });
        } else {
          if (state.qty === 0) {
            state.firstEntryDate = bar.date;
            state.firstEntryIndex = i;
          }
          state.qty += addQty;
          state.cost += addQty * fill;
          state.tranchesUsed += 1;
          state.lastEntry = fill;
          touchedMarket = true;

          events.push({
            kind: 'entry',
            date: bar.date,
            price: fill,
            qty: addQty,
            tranche: state.tranchesUsed,
            triggerLevel: trigger,
            gapUp: bar.open >= trigger,
            avgPriceAfter: state.cost / state.qty,
            positionQtyAfter: state.qty,
            costAfter: state.cost,
          });
        }
      }
    }

    // ── 3. Book-keeping ───────────────────────────────────────────────────
    if (touchedMarket) barsInMarket += 1;
    maxTranchesDeployed = Math.max(maxTranchesDeployed, state.tranchesUsed);

    const realized = params.startingCapital + realizedPnl;
    const unrealized = state.qty > 0 ? state.qty * bar.close - state.cost : 0;
    const markToMarket = realized + unrealized;

    // `>=` so the first bar stamps a peak date even when the run has not made
    // a rupee yet — otherwise a drawdown straight off the open reports no peak.
    if (markToMarket >= peakEquity) {
      peakEquity = markToMarket;
      runningPeakDate = bar.date;
    }
    const drawdownAmount = peakEquity - markToMarket;
    const drawdownPct = peakEquity > 0 ? (drawdownAmount / peakEquity) * PCT_DIVISOR : 0;
    if (drawdownPct > maxDrawdownPct) {
      maxDrawdownPct = drawdownPct;
      maxDrawdownAmount = drawdownAmount;
      maxDrawdownPeakDate = runningPeakDate;
      maxDrawdownTroughDate = bar.date;
    }

    equity.push({
      date: bar.date,
      realized,
      equity: markToMarket,
      invested: state.cost,
      positionQty: state.qty,
      drawdownPct,
    });
  }

  // A position still open when the data runs out is marked to the last close
  // and reported separately. It is not a result yet, so it stays out of the
  // win rate, the expectancy and the trade count.
  let openPosition: RoundTrip | null = null;
  if (state.qty > 0 && bars.length > 0) {
    const lastBar = bars[bars.length - 1];
    const avgPrice = state.cost / state.qty;
    const stopLevel = avgPrice * stopMultiple;
    const pnl = state.qty * lastBar.close - state.cost;
    const riskAmount = state.qty * (avgPrice - stopLevel);
    openPosition = {
      index: trades.length + 1,
      entryDate: state.firstEntryDate,
      exitDate: lastBar.date,
      tranches: state.tranchesUsed,
      qty: state.qty,
      avgEntryPrice: avgPrice,
      exitPrice: lastBar.close,
      reason: 'open-at-end',
      pnl,
      pnlPct: (pnl / state.cost) * PCT_DIVISOR,
      riskAmount,
      rMultiple: riskAmount > 0 ? pnl / riskAmount : null,
      barsHeld: bars.length - state.firstEntryIndex,
      stillOpen: true,
    };
  }

  const metrics = summarize({
    params,
    trades,
    equity,
    barsInMarket,
    totalBars: bars.length,
    maxTranchesDeployed,
    maxDrawdownPct,
    maxDrawdownAmount,
    maxDrawdownPeakDate,
    maxDrawdownTroughDate,
  });

  return {
    params,
    events,
    trades,
    openPosition,
    equity,
    metrics,
    firstBarDate: bars.length > 0 ? bars[0].date : null,
    lastBarDate: bars.length > 0 ? bars[bars.length - 1].date : null,
    barCount: bars.length,
  };
}

interface SummaryInput {
  params: BacktestParams;
  trades: RoundTrip[];
  equity: EquityPoint[];
  barsInMarket: number;
  totalBars: number;
  maxTranchesDeployed: number;
  maxDrawdownPct: number;
  maxDrawdownAmount: number;
  maxDrawdownPeakDate: string | null;
  maxDrawdownTroughDate: string | null;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function summarize(input: SummaryInput): BacktestMetrics {
  const { params, trades, equity, totalBars } = input;
  const start = params.startingCapital;

  const last = equity.length > 0 ? equity[equity.length - 1] : null;
  const finalEquity = last ? last.equity : start;
  const finalRealized = last ? last.realized : start;

  // A scratch trade (exactly zero P&L) counts as a loss, not a win — the
  // generous reading would inflate the win rate for free.
  const wins = trades.filter((t) => t.pnl > 0);
  const losses = trades.filter((t) => t.pnl <= 0);
  const grossWin = wins.reduce((sum, t) => sum + t.pnl, 0);
  const grossLoss = losses.reduce((sum, t) => sum - t.pnl, 0);
  const rMultiples = trades
    .map((t) => t.rMultiple)
    .filter((r): r is number => r !== null && Number.isFinite(r));

  return {
    startingCapital: start,
    finalEquity,
    finalRealized,
    totalReturnPct: ((finalEquity - start) / start) * PCT_DIVISOR,
    realizedReturnPct: ((finalRealized - start) / start) * PCT_DIVISOR,
    tradeCount: trades.length,
    winCount: wins.length,
    lossCount: losses.length,
    winRatePct: trades.length > 0 ? (wins.length / trades.length) * PCT_DIVISOR : 0,
    avgWin: mean(wins.map((t) => t.pnl)),
    avgLoss: mean(losses.map((t) => -t.pnl)),
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : null,
    expectancyR: rMultiples.length > 0 ? mean(rMultiples) : null,
    expectancy: mean(trades.map((t) => t.pnl)),
    maxDrawdownPct: input.maxDrawdownPct,
    maxDrawdownAmount: input.maxDrawdownAmount,
    maxDrawdownPeakDate: input.maxDrawdownPeakDate,
    maxDrawdownTroughDate: input.maxDrawdownTroughDate,
    barsInMarket: input.barsInMarket,
    totalBars,
    timeInMarketPct: totalBars > 0 ? (input.barsInMarket / totalBars) * PCT_DIVISOR : 0,
    maxTranchesDeployed: input.maxTranchesDeployed,
  };
}
