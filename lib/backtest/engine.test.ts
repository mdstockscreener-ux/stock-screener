/**
 * Engine unit tests.
 *
 * Run with: npm test
 *
 * The bar fixtures use real January 2024 dates because the trigger level is
 * defined by ISO weeks, so the calendar is part of the logic under test.
 * 2024-01-01 is a Monday, which makes each block of five dates one clean week:
 *
 *   week 1  Jan 01 - Jan 05
 *   week 2  Jan 08 - Jan 12
 *   week 3  Jan 15 - Jan 19
 *   week 4  Jan 22 - Jan 26
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { isoWeekStart, priorWeekHighs, runBacktest, validateParams } from '@/lib/backtest/engine';
import { BacktestParamError } from '@/lib/backtest/engine';
import type { Bar, BacktestParams, EntryEvent, ExitEvent, SkipEvent } from '@/types/backtest';

// ── Fixture helpers ───────────────────────────────────────────────────────

function bar(date: string, open: number, high: number, low: number, close: number): Bar {
  return { date, open, high, low, close, volume: 1_000_000 };
}

/** A week of identical flat bars, so the week's high is exactly `price`. */
function flatWeek(dates: string[], price: number): Bar[] {
  return dates.map((d) => bar(d, price, price, price, price));
}

const WEEK_1 = ['2024-01-01', '2024-01-02', '2024-01-03', '2024-01-04', '2024-01-05'];
const WEEK_2 = ['2024-01-08', '2024-01-09', '2024-01-10', '2024-01-11', '2024-01-12'];
const WEEK_3 = ['2024-01-15', '2024-01-16', '2024-01-17', '2024-01-18', '2024-01-19'];
const WEEK_4 = ['2024-01-22', '2024-01-23', '2024-01-24', '2024-01-25', '2024-01-26'];

/** Wide target and stop, so exits never fire and entry logic can be read alone. */
const NO_EXIT: BacktestParams = {
  startingCapital: 100_000,
  trancheCount: 4,
  profitTargetPct: 20,
  stopLossPct: 20,
  ignorableRangePct: 2.75,
};

/** Realistic bands, for the exit tests. */
const TIGHT: BacktestParams = {
  startingCapital: 100_000,
  trancheCount: 4,
  profitTargetPct: 6,
  stopLossPct: 5,
  ignorableRangePct: 2.75,
};

const entries = (events: readonly { kind: string }[]) =>
  events.filter((e): e is EntryEvent => e.kind === 'entry');
const exits = (events: readonly { kind: string }[]) =>
  events.filter((e): e is ExitEvent => e.kind === 'exit');
const skips = (events: readonly { kind: string }[]) =>
  events.filter((e): e is SkipEvent => e.kind === 'skip');

// ── Trigger levels ────────────────────────────────────────────────────────

describe('prior completed week high', () => {
  it('anchors each week on its Monday, across a year boundary', () => {
    assert.equal(isoWeekStart('2024-01-01'), '2024-01-01'); // Monday itself
    assert.equal(isoWeekStart('2024-01-05'), '2024-01-01'); // Friday of week 1
    assert.equal(isoWeekStart('2024-01-07'), '2024-01-01'); // Sunday closes week 1
    assert.equal(isoWeekStart('2024-01-08'), '2024-01-08'); // next Monday
    // Dec 31 2024 is a Tuesday, so it shares a week with Jan 1-3 2025.
    assert.equal(isoWeekStart('2024-12-31'), '2024-12-30');
    assert.equal(isoWeekStart('2025-01-02'), '2024-12-30');
  });

  it('is null until a week has closed, then holds that week high all week', () => {
    const bars = [
      ...flatWeek(WEEK_1, 100),
      // Week 2 makes progressively higher highs. The trigger must ignore all
      // of them — using the in-progress week would be look-ahead.
      bar('2024-01-08', 100, 110, 100, 105),
      bar('2024-01-09', 105, 120, 104, 115),
      bar('2024-01-10', 115, 130, 114, 125),
    ];

    const levels = priorWeekHighs(bars);

    assert.deepEqual(levels.slice(0, 5), [null, null, null, null, null]);
    assert.deepEqual(levels.slice(5), [100, 100, 100]);
  });

  it('never lets the current week raise its own trigger', () => {
    const bars = [...flatWeek(WEEK_1, 100), ...flatWeek(WEEK_2, 200), ...flatWeek(WEEK_3, 50)];
    const levels = priorWeekHighs(bars);

    assert.deepEqual(levels.slice(5, 10), [100, 100, 100, 100, 100]);
    assert.deepEqual(levels.slice(10), [200, 200, 200, 200, 200]);
  });
});

// ── Entry fills ───────────────────────────────────────────────────────────

describe('entry', () => {
  it('fills a gap-up at the open, not back down at the trigger', () => {
    const bars = [...flatWeek(WEEK_1, 100), bar('2024-01-08', 105, 106, 104, 105)];

    const [entry] = entries(runBacktest(bars, NO_EXIT).events);

    assert.equal(entry.triggerLevel, 100);
    assert.equal(entry.price, 105, 'fill is the open, which is above the trigger');
    assert.equal(entry.gapUp, true);
    // One tranche is 25,000; whole shares only.
    assert.equal(entry.qty, Math.floor(25_000 / 105));
  });

  it('fills at the trigger when the bar opens below it and breaks out intraday', () => {
    const bars = [...flatWeek(WEEK_1, 100), bar('2024-01-08', 98, 103, 97, 102)];

    const [entry] = entries(runBacktest(bars, NO_EXIT).events);

    assert.equal(entry.price, 100, 'fill is the trigger, not the lower open');
    assert.equal(entry.gapUp, false);
  });

  it('does not trigger when the week high is never touched', () => {
    const bars = [...flatWeek(WEEK_1, 100), bar('2024-01-08', 98, 99.5, 97, 99)];

    assert.equal(entries(runBacktest(bars, NO_EXIT).events).length, 0);
  });
});

// ── Rule 3: the ignorable range ───────────────────────────────────────────

describe('ignorable range', () => {
  // Tue's breakout fills 0.5% above Monday's entry; Wed's fills 3.0% above it.
  const bars = [
    ...flatWeek(WEEK_1, 100),
    bar('2024-01-08', 100, 100.5, 99, 100),
    bar('2024-01-09', 100.5, 102, 100, 101),
    bar('2024-01-10', 103, 104, 102.5, 103.5),
  ];

  it('skips a tranche priced inside the band and takes the one outside it', () => {
    const { events } = runBacktest(bars, NO_EXIT);

    const taken = entries(events);
    const skipped = skips(events);

    assert.equal(taken.length, 2);
    assert.deepEqual(
      taken.map((e) => e.date),
      ['2024-01-08', '2024-01-10']
    );

    assert.equal(skipped.length, 1);
    assert.equal(skipped[0].date, '2024-01-09');
    assert.equal(skipped[0].reason, 'ignorable-range');
    assert.equal(skipped[0].lastEntryPrice, 100);
  });

  it('is a parameter, not a rule — widening it skips more, zeroing it skips none', () => {
    const wide = runBacktest(bars, { ...NO_EXIT, ignorableRangePct: 5 });
    assert.equal(entries(wide.events).length, 1, 'a 5% band swallows the 3% add too');

    const off = runBacktest(bars, { ...NO_EXIT, ignorableRangePct: 0 });
    assert.equal(entries(off.events).length, 3, 'with no band every breakout is taken');
    assert.equal(skips(off.events).length, 0);
  });

  it('never blocks the first tranche of a position', () => {
    const { events } = runBacktest(bars, { ...NO_EXIT, ignorableRangePct: 90 });
    const taken = entries(events);

    assert.equal(taken.length, 1);
    assert.equal(taken[0].tranche, 1);
  });
});

// ── Tranche budget ────────────────────────────────────────────────────────

describe('tranches', () => {
  const bars = [
    ...flatWeek(WEEK_1, 100),
    bar('2024-01-08', 100, 100.5, 99, 100),
    bar('2024-01-09', 103, 104, 102.5, 103.5),
    bar('2024-01-10', 107, 108, 106, 107),
    bar('2024-01-11', 111, 112, 110, 111),
  ];

  it('stops deploying once the budget is exhausted', () => {
    const { events, metrics } = runBacktest(bars, { ...NO_EXIT, trancheCount: 2 });

    const taken = entries(events);
    assert.equal(taken.length, 2);
    assert.deepEqual(
      taken.map((e) => e.tranche),
      [1, 2]
    );
    assert.equal(metrics.maxTranchesDeployed, 2);

    // The later breakouts are not skips — there was simply no tranche to spend.
    assert.equal(skips(events).length, 0);
    assert.equal(events.filter((e) => e.date === '2024-01-10').length, 0);
    assert.equal(events.filter((e) => e.date === '2024-01-11').length, 0);
  });

  it('deploys the extra tranche when the budget allows it', () => {
    const { events } = runBacktest(bars, { ...NO_EXIT, trancheCount: 3 });
    const taken = entries(events);

    assert.equal(taken.length, 3);
    assert.equal(taken[2].date, '2024-01-10');
    assert.equal(taken[2].tranche, 3);
  });

  it('sizes every tranche off the starting capital, never the grown equity', () => {
    const { events } = runBacktest(bars, { ...NO_EXIT, trancheCount: 4 });
    const taken = entries(events);
    const trancheCapital = NO_EXIT.startingCapital / 4;

    for (const e of taken) {
      assert.equal(e.qty, Math.floor(trancheCapital / e.price));
    }
  });

  it('skips a tranche that cannot afford one share', () => {
    const pricey = [...flatWeek(WEEK_1, 100), bar('2024-01-08', 100, 101, 99, 100)];
    const { events } = runBacktest(pricey, {
      ...NO_EXIT,
      startingCapital: 200,
      trancheCount: 4, // 50 per tranche, against a 100 share price
    });

    assert.equal(entries(events).length, 0);
    assert.equal(skips(events)[0].reason, 'tranche-below-one-share');
  });
});

// ── Exit fills ────────────────────────────────────────────────────────────

describe('exit', () => {
  /** Monday enters exactly one tranche of 250 shares at 100. */
  const enterAt100 = [...flatWeek(WEEK_1, 100), bar('2024-01-08', 100, 100, 100, 100)];

  it('fills a gap-down below the stop, at the open', () => {
    const bars = [...enterAt100, bar('2024-01-09', 90, 92, 88, 90)];

    const { events, trades } = runBacktest(bars, TIGHT);
    const [exit] = exits(events);

    assert.equal(exit.reason, 'stop');
    assert.equal(exit.stopLevel, 95);
    assert.equal(exit.price, 90, 'the open, which is worse than the stop');
    assert.equal(exit.gapDown, true);
    assert.equal(exit.pnl, 250 * (90 - 100));
    // The whole point of modelling the gap: the loss is bigger than one R.
    assert.equal(trades[0].rMultiple, -2);
  });

  it('fills at the stop when the bar opens above it', () => {
    const bars = [...enterAt100, bar('2024-01-09', 99, 99, 94, 96)];

    const [exit] = exits(runBacktest(bars, TIGHT).events);

    assert.equal(exit.price, 95);
    assert.equal(exit.gapDown, false);
  });

  it('fills the target at the target, giving away a gap through it', () => {
    const bars = [...enterAt100, bar('2024-01-09', 99, 108, 99, 107)];

    const [exit] = exits(runBacktest(bars, TIGHT).events);

    assert.equal(exit.reason, 'target');
    assert.equal(exit.price, 106, 'the target, not the higher close it ran to');
    assert.equal(exit.pnl, 250 * 6);
  });

  it('assumes the stop filled first when one bar spans stop and target', () => {
    const bars = [...enterAt100, bar('2024-01-09', 100, 107, 94, 105)];

    const { events } = runBacktest(bars, TIGHT);
    const [exit] = exits(events);

    assert.equal(exit.reason, 'stop', 'pessimistic: OHLC cannot say which came first');
    assert.equal(exit.price, 95);
  });

  it('measures the target and stop off the average entry, not the last one', () => {
    const bars = [
      ...flatWeek(WEEK_1, 100),
      bar('2024-01-08', 100, 100, 100, 100), // 250 @ 100, target 106, stop 95
      bar('2024-01-09', 104, 104, 104, 104), // adds 240 @ 104, still inside the band
      bar('2024-01-10', 104, 104, 96, 98), // through the averaged stop, above the first one
    ];

    const { events } = runBacktest(bars, TIGHT);
    const [entryOne, entryTwo] = entries(events);
    const expectedAvg =
      (entryOne.qty * entryOne.price + entryTwo.qty * entryTwo.price) /
      (entryOne.qty + entryTwo.qty);

    const [exit] = exits(events);
    assert.ok(Math.abs(exit.avgEntryPrice - expectedAvg) < 1e-9);
    assert.ok(Math.abs(exit.stopLevel - expectedAvg * 0.95) < 1e-9);
    // The bar's low of 96 clears the first tranche's own stop of 95. It only
    // stops the position out because the second tranche lifted the average.
    assert.ok(exit.stopLevel > 95 && exit.stopLevel > 96);
  });
});

// ── Reset and repeat ──────────────────────────────────────────────────────

describe('reset and repeat', () => {
  // Week 2 enters at 100 and week 3 stops out at 95 on a bar whose high stays
  // under the trigger, so the re-entry has to wait for a fresh breakout in
  // week 4 against week 3's lower high.
  const bars = [
    ...flatWeek(WEEK_1, 100),
    bar('2024-01-08', 100, 100, 100, 100),
    ...flatWeek(WEEK_2.slice(1), 99),
    bar('2024-01-15', 96, 97, 90, 92),
    ...flatWeek(WEEK_3.slice(1), 93),
    bar('2024-01-22', 98, 99, 97, 98),
    ...flatWeek(WEEK_4.slice(1), 98),
  ];

  it('restores the full tranche budget and hunts breakouts again', () => {
    const { events, trades, openPosition, metrics } = runBacktest(bars, TIGHT);

    const taken = entries(events);
    assert.equal(taken.length, 2);

    // First position: one tranche at 100, stopped out.
    assert.equal(taken[0].date, '2024-01-08');
    assert.equal(taken[0].price, 100);
    assert.equal(trades.length, 1);
    assert.equal(trades[0].reason, 'stop');
    assert.equal(trades[0].exitPrice, 95);

    // Second position starts over at tranche one against week 3's high of 97.
    assert.equal(taken[1].date, '2024-01-22');
    assert.equal(taken[1].tranche, 1, 'the tranche counter reset on the exit');
    assert.equal(taken[1].triggerLevel, 97);
    assert.equal(taken[1].price, 98);

    // Rule 3 is measured within a position; it must not block the fresh start
    // even though 98 sits within 2.75% of the previous position's entry at 100.
    assert.equal(
      skips(events).filter((s) => s.date <= '2024-01-22').length,
      0,
      'the reference price cleared on the exit, so the re-entry was not skipped'
    );

    assert.ok(openPosition, 'the second position is still open when the data ends');
    assert.equal(openPosition.stillOpen, true);
    assert.equal(metrics.tradeCount, 1, 'the open position is not counted as a result');
  });

  it('can exit and re-enter on the same bar once the budget is restored', () => {
    const bars = [
      ...flatWeek(WEEK_1, 100),
      bar('2024-01-08', 100, 100, 100, 100),
      bar('2024-01-09', 100, 107, 94, 105), // stops out, then breaks 100 again
    ];

    const { events } = runBacktest(bars, TIGHT);

    assert.deepEqual(
      events.map((e) => e.kind),
      ['entry', 'exit', 'entry']
    );
    const reentry = entries(events)[1];
    assert.equal(reentry.date, '2024-01-09');
    assert.equal(reentry.tranche, 1);
  });
});

// ── No look-ahead ─────────────────────────────────────────────────────────

describe('no look-ahead', () => {
  /** Deterministic pseudo-random walk, so the series is reproducible. */
  function walk(days: number, seed: number): Bar[] {
    let state = seed;
    const rand = () => {
      state = (state * 1664525 + 1013904223) % 4294967296;
      return state / 4294967296;
    };

    const bars: Bar[] = [];
    const cursor = new Date(Date.UTC(2024, 0, 1));
    let price = 100;

    while (bars.length < days) {
      const weekday = cursor.getUTCDay();
      if (weekday !== 0 && weekday !== 6) {
        const open = price * (1 + (rand() - 0.5) * 0.03);
        const close = open * (1 + (rand() - 0.5) * 0.05);
        const high = Math.max(open, close) * (1 + rand() * 0.02);
        const low = Math.min(open, close) * (1 - rand() * 0.02);
        bars.push(bar(cursor.toISOString().slice(0, 10), open, high, low, close));
        price = close;
      }
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    return bars;
  }

  const bars = walk(180, 42);
  const params: BacktestParams = {
    startingCapital: 600_000,
    trancheCount: 6,
    profitTargetPct: 6,
    stopLossPct: 4,
    ignorableRangePct: 2.75,
  };

  it('produces a run that is generative enough to be worth testing', () => {
    const full = runBacktest(bars, params);
    assert.ok(full.trades.length >= 3, `expected several round trips, got ${full.trades.length}`);
  });

  it('gives the same events for a prefix of the bars as for the whole series', () => {
    const full = runBacktest(bars, params);

    // If any future bar leaked into a decision, truncating the series after
    // that bar would change the earlier events. It must not.
    for (const cut of [20, 45, 80, 119, 160]) {
      const prefix = bars.slice(0, cut);
      const partial = runBacktest(prefix, params);
      const lastDate = prefix[prefix.length - 1].date;

      assert.deepEqual(
        partial.events,
        full.events.filter((e) => e.date <= lastDate),
        `events diverged when the series was cut at bar ${cut}`
      );
      assert.deepEqual(
        partial.equity,
        full.equity.slice(0, cut),
        `equity curve diverged when the series was cut at bar ${cut}`
      );
    }
  });

  it('is unaffected by bars appended after the window', () => {
    const head = bars.slice(0, 90);
    const withFuture = runBacktest(bars, params);
    const withoutFuture = runBacktest(head, params);

    assert.deepEqual(withoutFuture.equity, withFuture.equity.slice(0, 90));
  });
});

// ── Parameters are parameters ─────────────────────────────────────────────

describe('parameters', () => {
  const bars = [
    ...flatWeek(WEEK_1, 100),
    bar('2024-01-08', 100, 100, 100, 100),
    bar('2024-01-09', 99, 104, 96, 103),
    bar('2024-01-10', 103, 105, 92, 94),
    ...flatWeek(WEEK_3, 96),
  ];

  it('changes the result when the stop moves', () => {
    const tight = runBacktest(bars, { ...TIGHT, stopLossPct: 3 });
    const loose = runBacktest(bars, { ...TIGHT, stopLossPct: 10 });

    assert.notDeepEqual(tight.events, loose.events);
    assert.equal(tight.trades[0].exitPrice, 97, 'a 3% stop sits at 97');
    assert.equal(loose.trades.length, 0, 'a 10% stop is never reached here');
  });

  it('changes the result when the target moves', () => {
    const near = runBacktest(bars, { ...TIGHT, profitTargetPct: 3, stopLossPct: 10 });
    const far = runBacktest(bars, { ...TIGHT, profitTargetPct: 30, stopLossPct: 10 });

    assert.equal(near.trades[0].reason, 'target');
    assert.equal(near.trades[0].exitPrice, 103);
    assert.equal(far.trades.length, 0);
  });

  it('scales position size with the starting capital', () => {
    const small = runBacktest(bars, { ...TIGHT, startingCapital: 100_000 });
    const large = runBacktest(bars, { ...TIGHT, startingCapital: 400_000 });

    assert.equal(entries(large.events)[0].qty, entries(small.events)[0].qty * 4);
  });

  it('rejects parameters that would make the run meaningless', () => {
    assert.throws(() => validateParams({ ...TIGHT, stopLossPct: 0 }), BacktestParamError);
    assert.throws(() => validateParams({ ...TIGHT, trancheCount: 0 }), BacktestParamError);
    assert.throws(() => validateParams({ ...TIGHT, trancheCount: 2.5 }), BacktestParamError);
    assert.throws(() => validateParams({ ...TIGHT, startingCapital: -1 }), BacktestParamError);
    assert.throws(() => validateParams({ ...TIGHT, profitTargetPct: 0 }), BacktestParamError);
    assert.throws(() => validateParams({ ...TIGHT, ignorableRangePct: -1 }), BacktestParamError);
    assert.throws(() => validateParams({ ...TIGHT, stopLossPct: Number.NaN }), BacktestParamError);
  });

  it('has no strategy constant baked into the engine source', () => {
    // The acceptance criterion, enforced mechanically: the engine may not
    // contain the tranche count, the target or the ignorable range as a
    // literal. Avoiding the digit outright keeps this check unambiguous.
    const source = readFileSync(new URL('./engine.ts', import.meta.url), 'utf8');

    const offenders = source
      .split('\n')
      .map((line, i) => ({ line, n: i + 1 }))
      .filter(({ line }) => /6|2\.75/.test(line));

    assert.deepEqual(
      offenders.map((o) => `${o.n}: ${o.line.trim()}`),
      [],
      'engine.ts must take every strategy number from params'
    );
  });
});

// ── Metrics ───────────────────────────────────────────────────────────────

describe('metrics', () => {
  it('reports an honest set over a mixed run', () => {
    const bars = [
      ...flatWeek(WEEK_1, 100), // week 2 trades against a trigger of 100
      bar('2024-01-08', 100, 100, 100, 100), // enter 250 @ 100
      bar('2024-01-09', 99, 99, 94, 95), // stop at 95: -1,250, and no re-entry
      ...flatWeek(WEEK_2.slice(2), 96),
      bar('2024-01-15', 100, 101, 99, 100), // enter 250 @ 100 again
      bar('2024-01-16', 101, 107, 100, 106), // target at 106: +1,500
      ...flatWeek(WEEK_3.slice(2), 102), // the same-bar re-entry rides to the end
    ];

    const { metrics, trades, openPosition } = runBacktest(bars, TIGHT);

    assert.equal(metrics.tradeCount, 2);
    assert.equal(metrics.winCount, 1);
    assert.equal(metrics.lossCount, 1);
    assert.equal(metrics.winRatePct, 50);
    assert.equal(trades[0].pnl, -1250);
    assert.equal(trades[1].pnl, 1500);
    assert.ok(openPosition, 'the position opened on the exit bar is still running');

    // Expectancy is the mean P&L per closed trade, and expectancyR its R form.
    const meanPnl = (trades[0].pnl + trades[1].pnl) / 2;
    assert.ok(Math.abs(metrics.expectancy - meanPnl) < 1e-9);

    const meanR = (trades[0].rMultiple! + trades[1].rMultiple!) / 2;
    assert.ok(Math.abs(metrics.expectancyR! - meanR) < 1e-9);

    // Realized return is the closed P&L against the sandboxed capital.
    const realizedPnl = trades[0].pnl + trades[1].pnl;
    assert.ok(
      Math.abs(metrics.realizedReturnPct - (realizedPnl / TIGHT.startingCapital) * 100) < 1e-9
    );

    assert.equal(metrics.avgWin, 1500);
    assert.equal(metrics.avgLoss, 1250, 'average loss is reported as a positive magnitude');
    assert.equal(metrics.profitFactor, 1500 / 1250);

    assert.ok(metrics.maxDrawdownPct > 0, 'the losing trade must show as a drawdown');
    assert.equal(metrics.maxDrawdownTroughDate, '2024-01-09');
    assert.ok(metrics.maxDrawdownPeakDate, 'a drawdown needs a peak to be measured from');

    assert.equal(metrics.totalBars, bars.length);
    assert.ok(metrics.timeInMarketPct > 0 && metrics.timeInMarketPct < 100);
  });

  it('handles a range that never triggers without dividing by zero', () => {
    const bars = [...flatWeek(WEEK_1, 100), ...flatWeek(WEEK_2, 90), ...flatWeek(WEEK_3, 80)];

    const { metrics, trades, openPosition } = runBacktest(bars, TIGHT);

    assert.equal(trades.length, 0);
    assert.equal(openPosition, null);
    assert.equal(metrics.totalReturnPct, 0);
    assert.equal(metrics.winRatePct, 0);
    assert.equal(metrics.expectancy, 0);
    assert.equal(metrics.expectancyR, null);
    assert.equal(metrics.profitFactor, null);
    assert.equal(metrics.timeInMarketPct, 0);
    assert.equal(metrics.maxDrawdownPct, 0);
  });

  it('marks an open position to the last close without realizing it', () => {
    const bars = [
      ...flatWeek(WEEK_1, 100),
      bar('2024-01-08', 100, 100, 100, 100),
      bar('2024-01-09', 102, 103, 101, 103),
    ];

    const { metrics, openPosition } = runBacktest(bars, TIGHT);

    assert.ok(openPosition);
    assert.equal(metrics.finalRealized, TIGHT.startingCapital, 'nothing is realized yet');
    assert.equal(metrics.finalEquity, TIGHT.startingCapital + 250 * (103 - 100));
    assert.equal(metrics.tradeCount, 0);
  });

  it('returns an empty, well-formed result for no bars at all', () => {
    const { metrics, equity, events, firstBarDate } = runBacktest([], TIGHT);

    assert.deepEqual(events, []);
    assert.deepEqual(equity, []);
    assert.equal(firstBarDate, null);
    assert.equal(metrics.finalEquity, TIGHT.startingCapital);
    assert.equal(metrics.totalBars, 0);
    assert.equal(metrics.timeInMarketPct, 0);
  });
});
