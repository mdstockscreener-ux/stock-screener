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
import type {
  Bar,
  BacktestParams,
  EntryEvent,
  ExitEvent,
  OrderEvent,
  SkipEvent,
} from '@/types/backtest';

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
const orders = (events: readonly { kind: string }[]) =>
  events.filter((e): e is OrderEvent => e.kind === 'order');

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

// ── The weekly GTT order ──────────────────────────────────────────────────

describe('the resting GTT order', () => {
  it('fills once a week however long price stays above it', () => {
    // The defect this replaced: treating the trigger as a condition re-checked
    // daily let one week's breakout buy a tranche every single day.
    const bars = [
      ...flatWeek(WEEK_1, 100),
      bar('2024-01-08', 101, 101, 101, 101),
      bar('2024-01-09', 106, 106, 106, 106),
      bar('2024-01-10', 112, 112, 112, 112),
      bar('2024-01-11', 118, 118, 118, 118),
      bar('2024-01-12', 124, 124, 124, 124),
    ];

    const taken = entries(runBacktest(bars, { ...NO_EXIT, trancheCount: 6 }).events);

    assert.equal(taken.length, 1, 'one order, one fill — not one per bar');
    assert.equal(taken[0].date, '2024-01-08');
    assert.equal(taken[0].triggerLevel, 100);
  });

  it('places nothing in the opening week, having no completed week to price off', () => {
    const bars = [...flatWeek(WEEK_1, 100)];
    const { events } = runBacktest(bars, NO_EXIT);

    assert.deepEqual(events, [], 'no order, no fill, nothing to report');
  });

  it('re-prices an unfilled order to the new weekly high', () => {
    const bars = [
      ...flatWeek(WEEK_1, 100), // week 2 rests at 100
      ...flatWeek(WEEK_2, 99), // never reaches it; week 2 high = 99
      ...flatWeek(WEEK_3, 98),
    ];

    const week3 = orders(runBacktest(bars, NO_EXIT).events).find(
      (o) => o.weekOf === '2024-01-15'
    );

    assert.ok(week3);
    assert.equal(week3.outcome, 'repriced');
    assert.equal(week3.previousTrigger, 100);
    assert.equal(week3.triggerPrice, 99, 'follows the weekly high down, not just up');
  });

  it('can only ever ratchet an unfilled order downward', () => {
    // A structural property worth pinning down. The order rests at last week's
    // high, so a week that fails to fill it must have made a lower high — and
    // that lower high is the next order's price. An unfilled order therefore
    // never moves up; it only walks price down until something fills or the
    // ignorable range withholds it.
    const bars = [
      ...flatWeek(WEEK_1, 100),
      ...flatWeek(WEEK_2, 95),
      ...flatWeek(WEEK_3, 90),
      ...flatWeek(WEEK_4, 85),
    ];

    const placed = orders(runBacktest(bars, NO_EXIT).events);

    assert.deepEqual(
      placed.map((o) => [o.weekOf, o.outcome, o.triggerPrice]),
      [
        ['2024-01-08', 'placed', 100],
        ['2024-01-15', 'repriced', 95],
        ['2024-01-22', 'repriced', 90],
      ]
    );

    const prices = placed.map((o) => o.triggerPrice as number);
    for (let i = 1; i < prices.length; i += 1) {
      assert.ok(prices[i] < prices[i - 1], 'an unfilled order never re-prices upward');
    }
    assert.equal(entries(runBacktest(bars, NO_EXIT).events).length, 0);
  });

  it('puts a fresh order up the week after one fills', () => {
    const bars = [
      ...flatWeek(WEEK_1, 100),
      bar('2024-01-08', 100, 100, 100, 100), // fills, consuming the order
      ...flatWeek(WEEK_2.slice(1), 110), // week 2 high = 110
      ...flatWeek(WEEK_3, 111),
    ];

    const week3 = orders(runBacktest(bars, NO_EXIT).events).find(
      (o) => o.weekOf === '2024-01-15'
    );

    assert.ok(week3);
    // "Placed", not "re-priced": nothing was resting, because Monday's fill
    // took the previous order out of the market.
    assert.equal(week3.outcome, 'placed');
    assert.equal(week3.previousTrigger, null);
    assert.equal(week3.triggerPrice, 110);
  });

  it('decides the week before it trades, so a mid-week exit cannot arm it', () => {
    const bars = [
      ...flatWeek(WEEK_1, 100),
      bar('2024-01-08', 100, 100, 100, 100), // buys the only tranche
      ...flatWeek(WEEK_2.slice(1), 101),
      // Week 3 is decided with the tranche still deployed, so no order rests.
      bar('2024-01-15', 101, 101, 94, 95), // stopped out mid-week
      ...flatWeek(WEEK_3.slice(1), 120), // a huge run that cannot be bought
    ];

    const { events } = runBacktest(bars, { ...TIGHT, trancheCount: 1 });
    const week3 = orders(events).find((o) => o.weekOf === '2024-01-15');

    assert.ok(week3);
    assert.equal(week3.outcome, 'not-placed-no-tranches');
    assert.equal(
      entries(events).filter((e) => e.weekOf === '2024-01-15').length,
      0,
      'the budget freed up mid-week, but the weekend decision had already been made'
    );
  });
});

// ── An exit ends the cycle ────────────────────────────────────────────────

describe('exiting cancels the resting order', () => {
  // The shape that exposed this: the buy order rests BELOW the target, and one
  // bar trades through both. Selling at the target must not also buy.
  const bars = [
    ...flatWeek(WEEK_1, 100),
    bar('2024-01-08', 100, 100, 100, 100), // order #1 fills at 100, target 106
    ...flatWeek(WEEK_2.slice(1), 104), // week 2 high = 104, clear of the buy
    bar('2024-01-15', 103, 107, 102, 106), // order #2 at 104 AND target 106 both inside
    ...flatWeek(WEEK_3.slice(1), 110), // stays above 104 all week
    ...flatWeek(WEEK_4, 111),
  ];

  it('sells at the target without buying on the same bar', () => {
    const { events } = runBacktest(bars, TIGHT);

    const onExitDay = events.filter((e) => e.date === '2024-01-15');
    assert.equal(
      onExitDay.filter((e) => e.kind === 'entry').length,
      0,
      'reaching the target means sell only — the cycle restarts next week'
    );
    assert.equal(onExitDay.filter((e) => e.kind === 'exit').length, 1);

    const [exit] = exits(events);
    assert.equal(exit.reason, 'target');
    assert.equal(exit.price, 106);
  });

  it('reports the cancellation against the order it pulled', () => {
    const { events } = runBacktest(bars, TIGHT);
    const cancelled = orders(events).find((o) => o.outcome === 'cancelled-on-exit');

    assert.ok(cancelled);
    assert.equal(cancelled.date, '2024-01-15');
    assert.equal(cancelled.orderId, 2, 'the order placed for week 3');
    assert.equal(cancelled.previousTrigger, 104);
    assert.equal(cancelled.triggerPrice, null);
  });

  it('leaves nothing resting for the remainder of that week', () => {
    const { events } = runBacktest(bars, TIGHT);

    // Week 3 runs at 110 after the exit, well above the 104 the order sat at.
    const boughtLater = entries(events).filter(
      (e) => e.date > '2024-01-15' && e.date <= '2024-01-19'
    );
    assert.deepEqual(boughtLater, []);
  });

  it('starts a fresh order the following weekend', () => {
    const { events } = runBacktest(bars, TIGHT);
    const week4 = orders(events).find(
      (o) => o.weekOf === '2024-01-22' && o.outcome !== 'cancelled-on-exit'
    );

    assert.ok(week4);
    assert.equal(week4.outcome, 'placed', 'not re-priced — the old order is gone');
    assert.equal(week4.orderId, 3, 'a new order, so a new number');
    assert.equal(week4.triggerPrice, 110);
  });

  it('pulls the order on a stop exit too', () => {
    const stopped = [
      ...flatWeek(WEEK_1, 100),
      bar('2024-01-08', 100, 100, 100, 100),
      ...flatWeek(WEEK_2.slice(1), 104),
      bar('2024-01-15', 103, 106, 94, 96), // stop at 95, and 104 is inside the range
      ...flatWeek(WEEK_3.slice(1), 105),
    ];

    const { events } = runBacktest(stopped, TIGHT);

    assert.equal(exits(events)[0].reason, 'stop');
    assert.equal(
      entries(events).filter((e) => e.date >= '2024-01-15').length,
      0,
      'the cycle restarts after any exit, not just a profitable one'
    );
    assert.ok(orders(events).some((o) => o.outcome === 'cancelled-on-exit'));
  });
});

// ── Order identity ────────────────────────────────────────────────────────

describe('order numbering', () => {
  it('keeps one number across every re-price', () => {
    const bars = [
      ...flatWeek(WEEK_1, 100),
      ...flatWeek(WEEK_2, 95),
      ...flatWeek(WEEK_3, 90),
      ...flatWeek(WEEK_4, 85),
    ];

    const ids = orders(runBacktest(bars, NO_EXIT).events).map((o) => o.orderId);

    // Modifying a resting GTT does not replace it, so the chain is one order.
    assert.deepEqual(ids, [1, 1, 1]);
  });

  // Each week's high must clear the fill it produced, or the ignorable range
  // withholds the next order and no new number is issued.
  const laddered = [
    ...flatWeek(WEEK_1, 100),
    bar('2024-01-08', 100, 100, 100, 100), // order #1 fills at 100
    ...flatWeek(WEEK_2.slice(1), 110), // week 2 high = 110
    bar('2024-01-15', 111, 111, 111, 111), // order #2 fills at 111
    ...flatWeek(WEEK_3.slice(1), 125), // week 3 high = 125
    ...flatWeek(WEEK_4, 126), // order #3 fills at 126
  ];

  it('takes a new number once the old order has gone', () => {
    const placed = orders(runBacktest(laddered, NO_EXIT).events).filter(
      (o) => o.triggerPrice !== null
    );

    assert.deepEqual(
      placed.map((o) => o.orderId),
      [1, 2, 3]
    );
  });

  it('lets every fill be traced back to the order that produced it', () => {
    const { events } = runBacktest(laddered, NO_EXIT);
    assert.equal(entries(events).length, 3);
    const placedIds = new Set(
      orders(events)
        .filter((o) => o.triggerPrice !== null)
        .map((o) => o.orderId)
    );

    for (const fill of entries(events)) {
      assert.ok(placedIds.has(fill.orderId), `fill on ${fill.date} has no matching order`);
    }
  });
});

// ── Rule 3: the ignorable range ───────────────────────────────────────────

describe('ignorable range', () => {
  // Week 2 buys at 100 and closes at a high of 101 — only 1% above the buy, so
  // no order goes up for week 3. Week 3 then spikes to 110, which must NOT be
  // bought, because nothing is resting. Week 3's high of 110 is 10% clear of
  // the buy, so week 4 is armed again.
  const bars = [
    ...flatWeek(WEEK_1, 100),
    bar('2024-01-08', 100, 100, 100, 100), // fills at 100
    ...flatWeek(WEEK_2.slice(1), 101), // week 2 high = 101
    bar('2024-01-15', 102, 102, 102, 102),
    bar('2024-01-16', 110, 110, 110, 110), // the spike that must not be bought
    ...flatWeek(WEEK_3.slice(2), 105), // week 3 high = 110
    bar('2024-01-22', 111, 112, 110, 111),
    ...flatWeek(WEEK_4.slice(1), 111),
  ];

  it('withholds the order when the new weekly high sits inside the band', () => {
    const { events } = runBacktest(bars, NO_EXIT);
    const week3 = orders(events).find((o) => o.weekOf === '2024-01-15');

    assert.ok(week3);
    assert.equal(week3.outcome, 'cancelled-ignorable');
    assert.equal(week3.triggerPrice, null, 'nothing rests that week');
    assert.equal(week3.weeklyHigh, 101, 'judged on the weekly high, not on a fill price');
    assert.equal(week3.lastEntryPrice, 100);
  });

  it('blocks the whole week, not just one bar', () => {
    // The distinction that matters: with no order resting, a 10% spike on the
    // Tuesday cannot be bought however far it runs.
    const { events } = runBacktest(bars, NO_EXIT);

    const boughtInWeek3 = entries(events).filter((e) => e.weekOf === '2024-01-15');
    assert.deepEqual(boughtInWeek3, []);
  });

  it('arms again once the weekly high clears the band', () => {
    const { events } = runBacktest(bars, NO_EXIT);
    const week4 = orders(events).find((o) => o.weekOf === '2024-01-22');

    assert.ok(week4);
    assert.equal(week4.outcome, 'placed');
    assert.equal(week4.triggerPrice, 110, "week 3's high, now 10% above the buy");

    const fill = entries(events).find((e) => e.weekOf === '2024-01-22');
    assert.ok(fill);
    assert.equal(fill.price, 111, 'gapped above the order, so filled at the open');
  });

  it('is a parameter, not a rule', () => {
    const wide = runBacktest(bars, { ...NO_EXIT, ignorableRangePct: 15 });
    assert.equal(
      entries(wide.events).length,
      1,
      'a 15% band swallows week 4 as well, leaving only the opening buy'
    );

    const off = runBacktest(bars, { ...NO_EXIT, ignorableRangePct: 0 });
    assert.equal(entries(off.events).length, 3, 'with no band every week is armed');
    assert.equal(
      orders(off.events).filter((o) => o.outcome === 'cancelled-ignorable').length,
      0
    );
  });

  it('never blocks the first order of a position', () => {
    const { events } = runBacktest(bars, { ...NO_EXIT, ignorableRangePct: 90 });
    const taken = entries(events);

    assert.equal(taken.length, 1);
    assert.equal(taken[0].tranche, 1);
  });
});

// ── Tranche budget ────────────────────────────────────────────────────────

describe('tranches', () => {
  // One buy per week, each week's high clear of the last buy: 100, then 107,
  // then 113.
  const bars = [
    ...flatWeek(WEEK_1, 100),
    bar('2024-01-08', 100, 100, 100, 100), // buys at 100
    ...flatWeek(WEEK_2.slice(1), 106), // week 2 high = 106
    bar('2024-01-15', 107, 107, 107, 107), // buys at 107
    ...flatWeek(WEEK_3.slice(1), 112), // week 3 high = 112
    bar('2024-01-22', 113, 113, 113, 113), // buys at 113
    ...flatWeek(WEEK_4.slice(1), 113),
  ];

  it('stops arming an order once the budget is exhausted', () => {
    const { events, metrics } = runBacktest(bars, { ...NO_EXIT, trancheCount: 2 });

    const taken = entries(events);
    assert.equal(taken.length, 2);
    assert.deepEqual(
      taken.map((e) => e.tranche),
      [1, 2]
    );
    assert.equal(metrics.maxTranchesDeployed, 2);

    // Week 4 is not a skip — no order was placed, because there was nothing
    // left to buy with.
    const week4 = orders(events).find((o) => o.weekOf === '2024-01-22');
    assert.ok(week4);
    assert.equal(week4.outcome, 'not-placed-no-tranches');
    assert.equal(week4.triggerPrice, null);
    assert.equal(skips(events).length, 0);
  });

  it('deploys the extra tranche when the budget allows it', () => {
    const { events } = runBacktest(bars, { ...NO_EXIT, trancheCount: 3 });
    const taken = entries(events);

    assert.equal(taken.length, 3);
    assert.equal(taken[2].date, '2024-01-22');
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
      ...flatWeek(WEEK_2.slice(1), 104), // week 2 high = 104
      bar('2024-01-15', 104, 104, 104, 104), // adds 240 @ 104
      bar('2024-01-16', 104, 104, 96, 98), // through the averaged stop, above the first one
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

  it('cannot re-enter on the exit bar, because the order was already consumed', () => {
    const bars = [
      ...flatWeek(WEEK_1, 100),
      bar('2024-01-08', 100, 100, 100, 100), // the week's one fill
      bar('2024-01-09', 100, 107, 94, 105), // stops out, and trades back above 100
      ...flatWeek(WEEK_2.slice(2), 101), // week 2 high = 107
    ];

    const { events } = runBacktest(bars, TIGHT);

    // Under a standing-condition reading this bar would buy again. Under a GTT
    // it cannot: Monday's fill took the only order out of the market, and the
    // next one is not placed until the weekend.
    assert.deepEqual(
      entries(events).map((e) => e.date),
      ['2024-01-08']
    );
    assert.equal(exits(events).length, 1);
  });

  it('places a fresh order the following week, unblocked by the closed position', () => {
    const bars = [
      ...flatWeek(WEEK_1, 100),
      bar('2024-01-08', 100, 100, 100, 100),
      bar('2024-01-09', 100, 107, 94, 105), // stopped out at 95
      ...flatWeek(WEEK_2.slice(2), 101), // week 2 high = 107
      bar('2024-01-15', 108, 108, 108, 108),
    ];

    const { events } = runBacktest(bars, TIGHT);
    const week3 = orders(events).find((o) => o.weekOf === '2024-01-15');

    assert.ok(week3);
    // The exit cleared the reference price, so the ignorable range has nothing
    // to measure against and the new order goes up regardless of where the old
    // position was bought.
    assert.equal(week3.outcome, 'placed');
    assert.equal(week3.lastEntryPrice, null);
    assert.equal(week3.triggerPrice, 107);

    const refill = entries(events)[1];
    assert.equal(refill.date, '2024-01-15');
    assert.equal(refill.tranche, 1);
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
      ...flatWeek(WEEK_1, 100), // week 2's order rests at 100
      bar('2024-01-08', 100, 100, 100, 100), // buys 250 @ 100
      bar('2024-01-09', 99, 99, 94, 95), // stop at 95: -1,250
      ...flatWeek(WEEK_2.slice(2), 96), // week 2 high = 100
      bar('2024-01-15', 100, 101, 99, 100), // week 3's order at 100 fills @ 100
      bar('2024-01-16', 101, 107, 100, 106), // target at 106: +1,500
      ...flatWeek(WEEK_3.slice(2), 102), // week 3 high = 107
      ...flatWeek(WEEK_4, 102), // week 4 rests at 107 and never fills
    ];

    const { metrics, trades, openPosition } = runBacktest(bars, TIGHT);

    assert.equal(metrics.tradeCount, 2);
    assert.equal(metrics.winCount, 1);
    assert.equal(metrics.lossCount, 1);
    assert.equal(metrics.winRatePct, 50);
    assert.equal(trades[0].pnl, -1250);
    assert.equal(trades[1].pnl, 1500);
    assert.equal(openPosition, null, 'week 4 never traded through its order');

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
