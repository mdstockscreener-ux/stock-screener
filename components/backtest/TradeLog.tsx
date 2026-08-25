'use client';

import { useState } from 'react';
import { formatDate } from '@/utils/bottomOut';
import {
  exitReasonLabel,
  formatMoney,
  formatR,
  formatSignedMoney,
  formatSignedPercent,
  signClass,
  skipReasonLabel,
} from '@/utils/backtest';
import type { RoundTrip, TradeEvent } from '@/types/backtest';

interface TradeLogProps {
  events: TradeEvent[];
  trades: RoundTrip[];
  openPosition: RoundTrip | null;
}

/** Rows the log can show. Skips are off by default — they are the quiet majority. */
type Filter = 'fills' | 'all';

function PositionRow({ trip }: { trip: RoundTrip }): JSX.Element {
  return (
    <tr className={trip.stillOpen ? 'bt-row-open' : ''}>
      <td className="align-left">
        {trip.index}
        {trip.stillOpen && <span className="bt-tag bt-tag-open">open</span>}
      </td>
      <td className="align-left">{formatDate(trip.entryDate)}</td>
      <td className="align-left">{trip.stillOpen ? '—' : formatDate(trip.exitDate)}</td>
      <td className="align-right num-cell">{trip.tranches}</td>
      <td className="align-right num-cell">{trip.qty}</td>
      <td className="align-right num-cell">{formatMoney(trip.avgEntryPrice)}</td>
      <td className="align-right num-cell">{formatMoney(trip.exitPrice)}</td>
      <td className="align-left">
        <span className={`bt-tag bt-tag-${trip.reason}`}>{exitReasonLabel(trip.reason)}</span>
      </td>
      <td className={`align-right num-cell ${signClass(trip.pnl)}`}>
        {formatSignedMoney(trip.pnl)}
      </td>
      <td className={`align-right num-cell ${signClass(trip.pnlPct)}`}>
        {formatSignedPercent(trip.pnlPct)}
      </td>
      <td className={`align-right num-cell ${signClass(trip.rMultiple ?? 0)}`}>
        {formatR(trip.rMultiple)}
      </td>
      <td className="align-right num-cell">{trip.barsHeld}</td>
    </tr>
  );
}

function EventRow({ event }: { event: TradeEvent }): JSX.Element {
  if (event.kind === 'entry') {
    return (
      <tr>
        <td className="align-left">{formatDate(event.date)}</td>
        <td className="align-left">
          <span className="bt-tag bt-tag-entry">Buy</span>
        </td>
        <td className="align-right num-cell">#{event.tranche}</td>
        <td className="align-right num-cell">{event.qty}</td>
        <td className="align-right num-cell">{formatMoney(event.price)}</td>
        <td className="align-right num-cell">{formatMoney(event.triggerLevel)}</td>
        <td className="align-left">
          {event.gapUp ? 'Gapped above the trigger — filled at the open' : 'Broke the trigger intraday'}
        </td>
        <td className="align-right num-cell">{formatMoney(event.avgPriceAfter)}</td>
        <td className="align-right num-cell">—</td>
      </tr>
    );
  }

  if (event.kind === 'exit') {
    return (
      <tr>
        <td className="align-left">{formatDate(event.date)}</td>
        <td className="align-left">
          <span className={`bt-tag bt-tag-${event.reason}`}>
            Sell · {exitReasonLabel(event.reason)}
          </span>
        </td>
        <td className="align-right num-cell">all</td>
        <td className="align-right num-cell">{event.qty}</td>
        <td className="align-right num-cell">{formatMoney(event.price)}</td>
        <td className="align-right num-cell">
          {formatMoney(event.reason === 'stop' ? event.stopLevel : event.targetLevel)}
        </td>
        <td className="align-left">
          {event.gapDown
            ? 'Gapped through the stop — filled at the open, below it'
            : `Against an average entry of ${formatMoney(event.avgEntryPrice)}`}
        </td>
        <td className="align-right num-cell">{formatMoney(event.avgEntryPrice)}</td>
        <td className={`align-right num-cell ${signClass(event.pnl)}`}>
          {formatSignedMoney(event.pnl)}
        </td>
      </tr>
    );
  }

  return (
    <tr className="bt-row-skip">
      <td className="align-left">{formatDate(event.date)}</td>
      <td className="align-left">
        <span className="bt-tag bt-tag-skip">Skipped</span>
      </td>
      <td className="align-right num-cell">—</td>
      <td className="align-right num-cell">—</td>
      <td className="align-right num-cell">{formatMoney(event.price)}</td>
      <td className="align-right num-cell">{formatMoney(event.triggerLevel)}</td>
      <td className="align-left">
        {skipReasonLabel(event.reason)}
        {event.lastEntryPrice !== null && ` (last entry ${formatMoney(event.lastEntryPrice)})`}
      </td>
      <td className="align-right num-cell">—</td>
      <td className="align-right num-cell">—</td>
    </tr>
  );
}

export default function TradeLog({
  events,
  trades,
  openPosition,
}: TradeLogProps): JSX.Element {
  const [filter, setFilter] = useState<Filter>('fills');

  const skipCount = events.filter((e) => e.kind === 'skip').length;
  const shown = filter === 'all' ? events : events.filter((e) => e.kind !== 'skip');
  const positions = openPosition ? [...trades, openPosition] : trades;

  if (events.length === 0) {
    return (
      <section className="content-section">
        <div className="section-header">
          <h2>Trade log</h2>
        </div>
        <div className="state-message empty">
          <p>The weekly high was never taken out in this window.</p>
          <p className="hint">
            No entry ever triggered, so there is nothing to show. A longer range, or a
            stock that actually broke out, would give the strategy something to do.
          </p>
        </div>
      </section>
    );
  }

  return (
    <>
      <section className="content-section">
        <div className="section-header">
          <h2>Positions</h2>
          <span className="section-meta">
            {trades.length} closed{openPosition ? ', 1 open' : ''}
          </span>
        </div>

        {positions.length === 0 ? (
          <div className="state-message empty">
            <p>Entries triggered but nothing closed inside the window.</p>
          </div>
        ) : (
          <div className="table-card">
            <div className="table-wrap">
              <table className="historical-table">
                <thead>
                  <tr>
                    <th className="align-left">#</th>
                    <th className="align-left">Entered</th>
                    <th className="align-left">Exited</th>
                    <th className="align-right">Tranches</th>
                    <th className="align-right">Qty</th>
                    <th className="align-right">Avg entry</th>
                    <th className="align-right">Exit</th>
                    <th className="align-left">Reason</th>
                    <th className="align-right">P&amp;L</th>
                    <th className="align-right">P&amp;L %</th>
                    <th className="align-right">R</th>
                    <th className="align-right">Bars</th>
                  </tr>
                </thead>
                <tbody>
                  {positions.map((trip) => (
                    <PositionRow key={`${trip.index}-${trip.entryDate}`} trip={trip} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      <section className="content-section">
        <div className="section-header">
          <h2>Order log</h2>
          <div className="section-header-right">
            <span className="section-meta">{shown.length} rows</span>
            <label className="bos-toggle">
              <input
                type="checkbox"
                checked={filter === 'all'}
                onChange={(e) => setFilter(e.target.checked ? 'all' : 'fills')}
              />
              <span>
                Show the {skipCount} breakout{skipCount === 1 ? '' : 's'} the rules passed on
              </span>
            </label>
          </div>
        </div>

        <div className="table-card">
          <div className="table-wrap">
            <table className="historical-table">
              <thead>
                <tr>
                  <th className="align-left">Date</th>
                  <th className="align-left">Action</th>
                  <th className="align-right">Tranche</th>
                  <th className="align-right">Qty</th>
                  <th className="align-right">Fill</th>
                  <th className="align-right">Level</th>
                  <th className="align-left">What happened</th>
                  <th className="align-right">Avg entry</th>
                  <th className="align-right">P&amp;L</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((event, i) => (
                  <EventRow key={`${event.date}-${event.kind}-${i}`} event={event} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </>
  );
}
