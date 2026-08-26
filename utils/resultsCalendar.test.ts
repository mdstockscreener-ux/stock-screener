/**
 * Unit tests for the Upcoming Results logic.
 *
 * Run with: npm test
 *
 * "Today" is always passed in explicitly rather than read from the clock, so
 * these tests do not change meaning tomorrow.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  addDaysIso,
  collectedAtOf,
  daysBetween,
  daysSinceCollected,
  decorate,
  filterRows,
  formatDayHeading,
  groupByDate,
  horizonWindow,
  relativeDayLabel,
  sortRows,
  todayIso,
} from '@/utils/resultsCalendar';
import { DEFAULT_FILTERS } from '@/types/results';
import type { ResultsEvent } from '@/types/results';

const TODAY = '2026-08-26';

/** One collector run stamps every live row with the same time. */
const PULL_NOW = '2026-08-26T14:08:11.429+00:00';
const PULL_EARLIER = '2026-08-20T09:00:00.000+00:00';

function event(
  symbol: string,
  date: string,
  lastSeen: string = PULL_NOW,
  company = `${symbol} Limited`
): ResultsEvent {
  return {
    id: `${symbol}-${date}`,
    symbol,
    company_name: company,
    purpose: 'Financial Results',
    board_meeting_date: date,
    description: 'To consider and approve the financial results',
    last_seen_at: lastSeen,
  };
}

/** Decorated with a collectedAt derived from the rows, as the page does. */
function decorated(rows: ResultsEvent[]) {
  return decorate(rows, collectedAtOf(rows));
}

// ── Date helpers ──────────────────────────────────────────────────────────

describe('date helpers', () => {
  it('reads today off the local calendar, not UTC', () => {
    // 00:30 IST on the 27th is still the 26th in UTC. The meeting date the
    // exchange publishes is the local one, so the local reading must win.
    const justAfterMidnightIst = new Date(2026, 7, 27, 0, 30);
    assert.equal(todayIso(justAfterMidnightIst), '2026-08-27');
  });

  it('adds and subtracts days across a month boundary', () => {
    assert.equal(addDaysIso('2026-08-26', 7), '2026-09-02');
    assert.equal(addDaysIso('2026-09-02', -7), '2026-08-26');
    assert.equal(addDaysIso('2026-02-28', 1), '2026-03-01'); // 2026 is not a leap year
    assert.equal(addDaysIso('2026-01-01', -1), '2025-12-31');
  });

  it('counts whole days between dates in either direction', () => {
    assert.equal(daysBetween('2026-08-26', '2026-08-26'), 0);
    assert.equal(daysBetween('2026-08-26', '2026-08-29'), 3);
    assert.equal(daysBetween('2026-08-29', '2026-08-26'), -3);
  });

  it('labels days relative to today', () => {
    assert.equal(relativeDayLabel('2026-08-26', TODAY), 'Today');
    assert.equal(relativeDayLabel('2026-08-27', TODAY), 'Tomorrow');
    assert.equal(relativeDayLabel('2026-08-25', TODAY), 'Yesterday');
    assert.equal(relativeDayLabel('2026-08-31', TODAY), 'in 5 days');
    assert.equal(relativeDayLabel('2026-08-23', TODAY), '3 days ago');
  });

  it('builds a day heading without depending on a locale', () => {
    // 2026-08-29 is a Saturday; the formatter is injected so the test does not
    // depend on the scanner's date formatting either.
    assert.equal(formatDayHeading('2026-08-29', (iso) => iso), 'Sat, 2026-08-29');
    assert.equal(formatDayHeading('2026-08-31', (iso) => iso), 'Mon, 2026-08-31');
  });
});

// ── Freshness and reschedules ─────────────────────────────────────────────

describe('collectedAt', () => {
  it('is the most recent last_seen_at in the set', () => {
    const rows = [event('A', '2026-08-29', PULL_EARLIER), event('B', '2026-08-30', PULL_NOW)];
    assert.equal(collectedAtOf(rows), PULL_NOW);
  });

  it('is null when there is nothing to read', () => {
    assert.equal(collectedAtOf([]), null);
  });

  it('reports how long ago the collector ran', () => {
    assert.equal(daysSinceCollected(PULL_NOW, TODAY), 0);
    assert.equal(daysSinceCollected(PULL_EARLIER, TODAY), 6);
    assert.equal(daysSinceCollected(null, TODAY), null);
  });
});

describe('decorate', () => {
  it('leaves everything from the latest pull unflagged', () => {
    const rows = decorated([event('A', '2026-08-29'), event('B', '2026-08-31')]);

    assert.deepEqual(
      rows.map((r) => [r.stale, r.superseded]),
      [
        [false, false],
        [false, false],
      ]
    );
  });

  it('flags a row NSE stopped returning as stale', () => {
    const rows = decorated([event('A', '2026-08-29', PULL_EARLIER), event('B', '2026-08-31')]);

    assert.equal(rows[0].stale, true);
    assert.equal(rows[0].superseded, false, 'nothing replaced it — it may simply be cancelled');
    assert.equal(rows[1].stale, false);
  });

  it('marks the old date superseded when a meeting is rescheduled', () => {
    // The unique key is (symbol, date, purpose), so moving the date inserts a
    // second row and abandons the first.
    const rows = decorated([
      event('A', '2026-08-29', PULL_EARLIER), // the date NSE originally gave
      event('A', '2026-09-05', PULL_NOW), // where it moved to
    ]);

    assert.equal(rows[0].superseded, true);
    assert.equal(rows[1].superseded, false);
    assert.equal(rows[1].stale, false);
  });

  it('treats timestamps a few seconds apart as one batched run', () => {
    const rows = decorated([
      event('A', '2026-08-29', '2026-08-26T14:08:11.429+00:00'),
      event('B', '2026-08-31', '2026-08-26T14:08:14.902+00:00'),
    ]);

    assert.equal(rows[0].stale, false, 'a batched upsert must not stale its own earlier rows');
    assert.equal(rows[1].stale, false);
  });

  it('compares timestamps as instants, not as strings', () => {
    // Same moment, different offsets. A lexicographic compare would call these
    // six hours apart and stale the first row.
    const rows = decorate(
      [event('A', '2026-08-29', '2026-08-26T14:08:11.429+00:00')],
      '2026-08-26T19:38:11.429+05:30'
    );

    assert.equal(rows[0].stale, false);
  });
});

// ── Horizon and filtering ─────────────────────────────────────────────────

describe('horizonWindow', () => {
  it('starts at today for every upcoming horizon', () => {
    for (const key of ['week', 'month', 'quarter', 'all'] as const) {
      assert.equal(horizonWindow(key, TODAY).from, TODAY, `${key} must start today`);
    }
  });

  it('bounds the fixed horizons and leaves "all" open', () => {
    assert.deepEqual(horizonWindow('week', TODAY), { from: TODAY, to: '2026-09-02' });
    assert.deepEqual(horizonWindow('month', TODAY), { from: TODAY, to: '2026-09-25' });
    assert.deepEqual(horizonWindow('all', TODAY), { from: TODAY, to: null });
  });

  it('reaches backwards only for the recent horizon', () => {
    assert.deepEqual(horizonWindow('recent', TODAY), { from: '2026-07-27', to: null });
  });
});

describe('filterRows', () => {
  const rows = decorated([
    event('YESTERDAY', '2026-08-25'),
    event('TODAY', '2026-08-26'),
    event('SOON', '2026-08-31'),
    event('LATER', '2026-10-15'),
  ]);

  it('counts today as upcoming and yesterday as past', () => {
    const kept = filterRows(rows, { ...DEFAULT_FILTERS, horizon: 'all' }, TODAY);

    assert.deepEqual(
      kept.map((r) => r.symbol),
      ['TODAY', 'SOON', 'LATER']
    );
  });

  it('respects the upper bound of a fixed horizon', () => {
    const kept = filterRows(rows, { ...DEFAULT_FILTERS, horizon: 'week' }, TODAY);

    assert.deepEqual(
      kept.map((r) => r.symbol),
      ['TODAY', 'SOON']
    );
  });

  it('pulls in the recent past only when asked', () => {
    const kept = filterRows(rows, { ...DEFAULT_FILTERS, horizon: 'recent' }, TODAY);

    assert.equal(kept[0].symbol, 'YESTERDAY');
    assert.equal(kept.length, 4);
  });

  it('searches symbol and company name, case-insensitively', () => {
    const searchable = decorated([
      event('SETCO', '2026-08-29', PULL_NOW, 'Setco Automotive Limited'),
      event('MILKYMIST', '2026-08-31', PULL_NOW, 'Milky Mist Dairy Food Limited'),
    ]);
    const search = (term: string) =>
      filterRows(searchable, { ...DEFAULT_FILTERS, horizon: 'all', search: term }, TODAY).map(
        (r) => r.symbol
      );

    assert.deepEqual(search('setco'), ['SETCO'], 'matches the symbol regardless of case');
    assert.deepEqual(search('dairy'), ['MILKYMIST'], 'matches inside the company name');
    assert.deepEqual(search('  Milky  '.trim()), ['MILKYMIST']);
    assert.deepEqual(search('nothing'), []);
    assert.equal(search('').length, 2, 'an empty search filters nothing out');
  });

  it('hides superseded rows unless they are asked for', () => {
    const rescheduled = decorated([
      event('A', '2026-08-29', PULL_EARLIER),
      event('A', '2026-09-05', PULL_NOW),
    ]);

    const hidden = filterRows(rescheduled, { ...DEFAULT_FILTERS, horizon: 'all' }, TODAY);
    assert.deepEqual(
      hidden.map((r) => r.board_meeting_date),
      ['2026-09-05']
    );

    const shown = filterRows(
      rescheduled,
      { ...DEFAULT_FILTERS, horizon: 'all', showSuperseded: true },
      TODAY
    );
    assert.equal(shown.length, 2);
  });

  it('keeps a stale row that was never replaced', () => {
    // Cancelled, not moved — hiding it would silently drop a meeting the user
    // may still be expecting.
    const rows = decorated([event('A', '2026-08-29', PULL_EARLIER), event('B', '2026-08-31')]);
    const kept = filterRows(rows, { ...DEFAULT_FILTERS, horizon: 'all' }, TODAY);

    assert.equal(kept.length, 2);
    assert.equal(kept[0].stale, true);
  });
});

// ── Presentation shaping ──────────────────────────────────────────────────

describe('groupByDate', () => {
  it('groups consecutive dates and keeps the incoming order', () => {
    const rows = decorated([
      event('SETCO', '2026-08-29'),
      event('SUPREMEENG', '2026-08-29'),
      event('LEAPIND', '2026-08-31'),
      event('MILKYMIST', '2026-08-31'),
      event('TECHNOCRAF', '2026-09-02'),
    ]);

    const days = groupByDate(rows);

    assert.deepEqual(
      days.map((d) => [d.date, d.rows.length]),
      [
        ['2026-08-29', 2],
        ['2026-08-31', 2],
        ['2026-09-02', 1],
      ]
    );
    assert.deepEqual(
      days[0].rows.map((r) => r.symbol),
      ['SETCO', 'SUPREMEENG']
    );
  });

  it('returns nothing for no rows', () => {
    assert.deepEqual(groupByDate([]), []);
  });
});

describe('sortRows', () => {
  const rows = decorated([
    event('ZEBRA', '2026-09-02', PULL_NOW, 'Zebra Limited'),
    event('ALPHA', '2026-08-29', PULL_NOW, 'Alpha Limited'),
    event('MID', '2026-08-31', PULL_NOW, 'Mid Limited'),
  ]);

  it('sorts by symbol in both directions', () => {
    assert.deepEqual(
      sortRows(rows, 'symbol', 'asc').map((r) => r.symbol),
      ['ALPHA', 'MID', 'ZEBRA']
    );
    assert.deepEqual(
      sortRows(rows, 'symbol', 'desc').map((r) => r.symbol),
      ['ZEBRA', 'MID', 'ALPHA']
    );
  });

  it('sorts by date', () => {
    assert.deepEqual(
      sortRows(rows, 'board_meeting_date', 'asc').map((r) => r.symbol),
      ['ALPHA', 'MID', 'ZEBRA']
    );
  });

  it('breaks ties by date then symbol, so the order never wobbles', () => {
    const tied = decorated([
      event('BBB', '2026-09-02', PULL_NOW, 'Same Name Limited'),
      event('AAA', '2026-08-29', PULL_NOW, 'Same Name Limited'),
    ]);

    assert.deepEqual(
      sortRows(tied, 'company_name', 'asc').map((r) => r.symbol),
      ['AAA', 'BBB']
    );
  });

  it('does not mutate the array it was given', () => {
    const before = rows.map((r) => r.symbol);
    sortRows(rows, 'symbol', 'desc');
    assert.deepEqual(
      rows.map((r) => r.symbol),
      before
    );
  });
});
