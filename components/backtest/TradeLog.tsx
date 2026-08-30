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
  orderOutcomeDetail,
  orderOutcomeLabel,
  skipReasonLabel,
} from '@/utils/backtest';
import type { EntryEvent, OrderEvent, RoundTrip, TradeEvent } from '@/types/backtest';

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

function EventRow({ event }: { event: TradeEvent }): JSX.Element | null {
  if (event.kind === 'entry') {
    return (
      <tr>
        <td className="align-left num-cell bt-order-id">#{event.orderId}</td>
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
        {/* A sell closes a position, not an order — nothing to map back to. */}
        <td className="align-left num-cell bt-order-id">—</td>
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

  if (event.kind === 'skip') {
    return (
      <tr className="bt-row-skip">
        <td className="align-left num-cell bt-order-id">#{event.orderId}</td>
        <td className="align-left">{formatDate(event.date)}</td>
        <td className="align-left">
          <span className="bt-tag bt-tag-skip">Not bought</span>
        </td>
        <td className="align-right num-cell">—</td>
        <td className="align-right num-cell">—</td>
        <td className="align-right num-cell">{formatMoney(event.price)}</td>
        <td className="align-right num-cell">{formatMoney(event.triggerLevel)}</td>
        <td className="align-left">
          {skipReasonLabel(event.reason)}
          {event.lastEntryPrice !== null && ` (last buy ${formatMoney(event.lastEntryPrice)})`}
        </td>
        <td className="align-right num-cell">—</td>
        <td className="align-right num-cell">—</td>
      </tr>
    );
  }

  // Order events have their own table; they never reach the fill log.
  return null;
}

/** One weekend's decision about the resting GTT, plus whether it went on to fill. */
function OrderRow({
  event,
  fill,
}: {
  event: OrderEvent;
  fill: EntryEvent | undefined;
}): JSX.Element {
  const rested = event.triggerPrice !== null;

  return (
    <tr className={rested ? '' : 'bt-row-skip'}>
      <td className="align-left num-cell bt-order-id">
        {event.orderId === null ? '—' : `#${event.orderId}`}
      </td>
      <td className="align-left num-cell">{formatDate(event.weekOf)}</td>
      <td className="align-right num-cell">{formatMoney(event.weeklyHigh)}</td>
      <td className="align-right num-cell">
        {rested ? formatMoney(event.triggerPrice as number) : '—'}
      </td>
      <td className="align-left">
        <span className={`bt-tag bt-tag-order-${event.outcome}`}>
          {orderOutcomeLabel(event.outcome)}
        </span>
      </td>
      <td className="align-left">
        {orderOutcomeDetail(
          event.outcome,
          event.weeklyHigh,
          event.previousTrigger,
          event.lastEntryPrice
        )}
      </td>
      <td className="align-left">
        {fill ? (
          <span className="bt-tag bt-tag-entry">
            Filled {formatDate(fill.date)} @ {formatMoney(fill.price)}
          </span>
        ) : rested ? (
          'Never traded through'
        ) : (
          '—'
        )}
      </td>
    </tr>
  );
}

export default function TradeLog({
  events,
  trades,
  openPosition,
}: TradeLogProps): JSX.Element {
  const [filter, setFilter] = useState<Filter>('fills');

  const orderEvents = events.filter((e): e is OrderEvent => e.kind === 'order');
  const fillsByOrder = new Map<number, EntryEvent>();
  for (const event of events) {
    if (event.kind === 'entry') fillsByOrder.set(event.orderId, event);
  }

  const fillLog = events.filter((e) => e.kind !== 'order');
  const skipCount = fillLog.filter((e) => e.kind === 'skip').length;
  const shown = filter === 'all' ? fillLog : fillLog.filter((e) => e.kind !== 'skip');
  const positions = openPosition ? [...trades, openPosition] : trades;

  if (events.length === 0) {
    return (
      <section className="content-section">
        <div className="section-header">
          <h2>Trade log</h2>
        </div>
        <div className="state-message empty">
          <p>No order was ever traded through in this window.</p>
          <p className="hint">
            No GTT ever filled, so there is nothing to show. A longer range, or a
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
          <h2>Weekly GTT orders</h2>
          <span className="section-meta">
            {orderEvents.filter((o) => o.triggerPrice !== null).length} placed,{' '}
            {orderEvents.filter((o) => o.triggerPrice === null).length} withheld
          </span>
        </div>
        <p className="bt-note">
          One order at a time. Each weekend it is placed at the completed week&rsquo;s high,
          or re-priced if it never filled, or withheld when the new high sits inside the
          ignorable range of the last buy. A fill consumes it — nothing rests again until
          the next weekend.
        </p>
        <div className="table-card">
          <div className="table-wrap">
            <table className="historical-table">
              <thead>
                <tr>
                  <th className="align-left">Order</th>
                  <th className="align-left">Week of</th>
                  <th className="align-right">Last week&rsquo;s high</th>
                  <th className="align-right">Order at</th>
                  <th className="align-left">Decision</th>
                  <th className="align-left">Why</th>
                  <th className="align-left">Outcome</th>
                </tr>
              </thead>
              <tbody>
                {/* Keyed by index: an exit can add a second row for one week. */}
                {orderEvents.map((event, i) => (
                  <OrderRow
                    key={`${event.weekOf}-${i}`}
                    event={event}
                    fill={event.orderId === null ? undefined : fillsByOrder.get(event.orderId)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="content-section">
        <div className="section-header">
          <h2>Fill log</h2>
          <div className="section-header-right">
            <span className="section-meta">{shown.length} rows</span>
            <label className="bos-toggle">
              <input
                type="checkbox"
                checked={filter === 'all'}
                onChange={(e) => setFilter(e.target.checked ? 'all' : 'fills')}
              />
              <span>
                Show the {skipCount} triggered order{skipCount === 1 ? '' : 's'} that could not buy
              </span>
            </label>
          </div>
        </div>

        <div className="table-card">
          <div className="table-wrap">
            <table className="historical-table">
              <thead>
                <tr>
                  <th className="align-left">Order</th>
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
