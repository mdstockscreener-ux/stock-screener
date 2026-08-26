'use client';

import { formatDate } from '@/utils/bottomOut';
import { formatDayHeading, relativeDayLabel } from '@/utils/resultsCalendar';
import type { DecoratedResultsEvent, ResultsDay } from '@/types/results';

interface ResultsDayGroupsProps {
  days: ResultsDay[];
  today: string;
}

function EventRow({ event }: { event: DecoratedResultsEvent }): JSX.Element {
  return (
    <li className={`rc-event${event.superseded ? ' is-superseded' : ''}`}>
      <div className="rc-event-head">
        <span className="rc-event-symbol">{event.symbol}</span>
        <span className="rc-event-company">{event.company_name}</span>
        {event.superseded ? (
          <span className="rc-tag rc-tag-superseded" title="A later date for this symbol was in the latest pull">
            rescheduled
          </span>
        ) : event.stale ? (
          <span className="rc-tag rc-tag-stale" title="NSE did not return this meeting in the latest pull">
            not in latest pull
          </span>
        ) : null}
      </div>
      <p className="rc-event-meta">{event.purpose}</p>
      {event.description && <p className="rc-event-desc">{event.description}</p>}
    </li>
  );
}

/**
 * The calendar reading of the same data: one block per meeting day.
 *
 * Days with no meetings are simply absent rather than rendered empty — the
 * calendar is sparse, and a run of blank weekends would bury the real entries.
 */
export default function ResultsDayGroups({ days, today }: ResultsDayGroupsProps): JSX.Element {
  return (
    <div className="rc-days">
      {days.map((day) => (
        <section key={day.date} className="rc-day">
          <header className="rc-day-head">
            <h3 className="rc-day-date">{formatDayHeading(day.date, formatDate)}</h3>
            <span className="rc-day-rel">{relativeDayLabel(day.date, today)}</span>
            <span className="rc-day-count">
              {day.rows.length} compan{day.rows.length === 1 ? 'y' : 'ies'}
            </span>
          </header>
          <ul className="rc-event-list">
            {day.rows.map((event) => (
              <EventRow key={event.id} event={event} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
