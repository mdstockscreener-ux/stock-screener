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
 * The entry side is modelled as a single GTT order that is placed at the
 * weekend, rests at the completed week's high, and is consumed the one time it
 * fills — not as a condition re-tested every day. See runBacktest.
 *
 * No look-ahead. At bar i the engine sees bars[0..i] and nothing more: the
 * order was priced off the last *completed* week, and fills come from the
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

export interface BarWeek {
  /** Monday of the week this bar falls in. */
  weekKey: string;
  /** High of the last completed week, or null before one exists. */
  priorHigh: number | null;
  /** True on the first bar of a week — where the order decision happens. */
  isWeekStart: boolean;
}

/**
 * Week key, trigger price and week-start flag for each bar, aligned by index.
 *
 * The trigger is the prior *completed* week's high, null until a full week has
 * closed. A week with no bars at all (a full exchange holiday week) leaves the
 * previous level standing rather than blanking it: the most recent completed
 * week that actually traded is still the honest answer, and using it looks no
 * further forward than the strict prior week would.
 */
export function weekContext(bars: Bar[]): BarWeek[] {
  const context: BarWeek[] = [];
  let currentWeekKey = '';
  let currentWeekHigh = Number.NEGATIVE_INFINITY;
  let priorHigh: number | null = null;

  for (const bar of bars) {
    const weekKey = isoWeekStart(bar.date);
    const isWeekStart = weekKey !== currentWeekKey;

    if (isWeekStart) {
      // A new week starts, so the week we were accumulating is now complete.
      if (currentWeekKey !== '') priorHigh = currentWeekHigh;
      currentWeekKey = weekKey;
      currentWeekHigh = bar.high;
    } else {
      currentWeekHigh = Math.max(currentWeekHigh, bar.high);
    }

    // Recorded before this bar can influence anything: the level this bar
    // trades against was fixed when the previous week closed.
    context.push({ weekKey, priorHigh, isWeekStart });
  }

  return context;
}

/** The trigger price each bar trades against. Kept for tests and for reading a log. */
export function priorWeekHighs(bars: Bar[]): (number | null)[] {
  return weekContext(bars).map((week) => week.priorHigh);
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
 * The entry side models a real GTT order rather than a standing condition,
 * because that is what the strategy actually places. Each weekend one order
 * rests at the completed week's high; it can fill **once**, and once it does
 * there is nothing resting until the next weekend puts a new one up. Treating
 * the trigger as a condition re-checked every day instead would let a single
 * week's breakout buy every tranche on consecutive days.
 *
 * Per bar, in this order:
 *   1. The weekend decision, on the first bar of each week: place, re-price or
 *      withhold the resting order. It runs first because it happens before that
 *      week trades, and so it sees only the state as of last week's close.
 *   2. Exit, evaluated against the average entry price. If one bar's range
 *      spans both the stop and the target, the stop is assumed to fill first.
 *   3. Entry, if an order is resting and the bar trades through it. The order
 *      is consumed by the fill.
 *
 * An exit ends the cycle: it pulls the resting buy order with it, so a bar that
 * closes a position never also opens one, and the next order goes up at the
 * following weekend.
 */
export function runBacktest(bars: Bar[], params: BacktestParams): BacktestResult {
  validateParams(params);

  const targetMultiple = 1 + params.profitTargetPct / PCT_DIVISOR;
  const stopMultiple = 1 - params.stopLossPct / PCT_DIVISOR;
  const ignorableFraction = params.ignorableRangePct / PCT_DIVISOR;
  // Tranche size is pinned to the *starting* capital, so a winning run does not
  // silently compound its position sizes and flatter the later trades.
  const trancheCapital = params.startingCapital / params.trancheCount;

  const weeks = weekContext(bars);

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

  // The single GTT sitting in the market. Null means none rests. The id
  // survives re-pricing, because modifying a GTT does not replace it.
  let resting: { id: number; price: number } | null = null;
  let orderSeq = 0;

  for (let i = 0; i < bars.length; i += 1) {
    const bar = bars[i];
    const week = weeks[i];
    let touchedMarket = state.qty > 0;

    // ── 1. The weekend order decision ─────────────────────────────────────
    // Runs before the week trades, so it can only see last week's close.
    if (week.isWeekStart) {
      const previousTrigger = resting?.price ?? null;
      const cancelledId = resting?.id ?? null;
      const weeklyHigh = week.priorHigh;

      if (weeklyHigh === null) {
        // No completed week yet — there is no price to rest an order at, and
        // nothing worth reporting.
        resting = null;
      } else if (state.tranchesUsed >= params.trancheCount) {
        resting = null;
        events.push({
          kind: 'order',
          orderId: cancelledId,
          date: bar.date,
          weekOf: week.weekKey,
          weeklyHigh,
          triggerPrice: null,
          previousTrigger,
          outcome: 'not-placed-no-tranches',
          lastEntryPrice: state.lastEntry,
        });
      } else if (
        state.lastEntry !== null &&
        Math.abs(weeklyHigh - state.lastEntry) / state.lastEntry < ignorableFraction
      ) {
        // The ignorable range is a *placement* decision, judged on the new
        // weekly high against the last purchase price. Withholding the order
        // means nothing can fill all week, however far price runs — which is
        // the point: it stops the position being rebuilt at one price level.
        resting = null;
        events.push({
          kind: 'order',
          orderId: cancelledId,
          date: bar.date,
          weekOf: week.weekKey,
          weeklyHigh,
          triggerPrice: null,
          previousTrigger,
          outcome: 'cancelled-ignorable',
          lastEntryPrice: state.lastEntry,
        });
      } else {
        // A brand-new order takes the next number; a re-price keeps its own.
        if (resting === null) {
          orderSeq += 1;
          resting = { id: orderSeq, price: weeklyHigh };
        } else {
          resting = { id: resting.id, price: weeklyHigh };
        }
        events.push({
          kind: 'order',
          orderId: resting.id,
          date: bar.date,
          weekOf: week.weekKey,
          weeklyHigh,
          triggerPrice: weeklyHigh,
          previousTrigger,
          // Modifying an unfilled order and placing a fresh one are the same
          // act here; the distinction is only worth reporting.
          outcome: previousTrigger === null ? 'placed' : 'repriced',
          lastEntryPrice: state.lastEntry,
        });
      }
    }

    // ── 2. Exit ───────────────────────────────────────────────────────────
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

        // Closing the position ends the cycle, so any buy order still sitting
        // in the market is pulled with it — the strategy restarts from the next
        // weekend rather than re-entering on the way out. This is why an exit
        // bar never also buys, even when it trades through the resting price.
        if (resting !== null) {
          events.push({
            kind: 'order',
            orderId: resting.id,
            date: bar.date,
            weekOf: week.weekKey,
            weeklyHigh: week.priorHigh ?? resting.price,
            triggerPrice: null,
            previousTrigger: resting.price,
            outcome: 'cancelled-on-exit',
            lastEntryPrice: null,
          });
          resting = null;
        }
      }
    }

    // ── 3. Entry ──────────────────────────────────────────────────────────
    // An order only rests when tranches remained at the weekend, and the only
    // thing that spends one is the fill below — which also consumes the order.
    if (resting !== null && bar.high >= resting.price) {
      const trigger = resting.price;
      const orderId = resting.id;
      // A gap-up above the trigger fills at the open, not back down at the trigger.
      const fill = Math.max(trigger, bar.open);
      const lastEntry = state.lastEntry;

      // The order has triggered either way, so it leaves the market either way.
      resting = null;

      // Whole shares only — a tranche that cannot buy one is not deployed.
      const addQty = Math.floor(trancheCapital / fill);
      if (addQty < 1) {
        events.push({
          kind: 'skip',
          orderId,
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
          orderId,
          weekOf: week.weekKey,
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

    // ── 4. Book-keeping ───────────────────────────────────────────────────
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
