'use client';

import { formatTimestamp } from '@/utils/bottomOut';
import { daysSinceCollected } from '@/utils/resultsCalendar';

interface ResultsAsOfBadgeProps {
  collectedAt: string | null;
  today: string;
  /** Rows loaded in the query window. */
  total: number;
  /** Rows passing the current filters. */
  shown: number;
  /** Meetings NSE has stopped returning. */
  staleCount: number;
}

/** Beyond this, the calendar is old enough that the user should re-run the collector. */
const STALE_AFTER_DAYS = 2;

/**
 * How fresh the calendar is, and what that freshness can and cannot tell you.
 *
 * There is no run-tracking table, so "collected" is inferred from the newest
 * `last_seen_at` in the data. That marks the last *successful* run — a run that
 * failed leaves no trace at all, which is why the wording says when data last
 * arrived rather than when the collector last ran.
 */
export default function ResultsAsOfBadge({
  collectedAt,
  today,
  total,
  shown,
  staleCount,
}: ResultsAsOfBadgeProps): JSX.Element {
  const age = daysSinceCollected(collectedAt, today);
  const isOld = age !== null && age >= STALE_AFTER_DAYS;

  return (
    <div className="bos-badge-row">
      <span className={`bos-badge${isOld ? ' bos-badge-warn' : ''}`}>
        <span className="bos-badge-dot" />
        Data last arrived <strong>{formatTimestamp(collectedAt)}</strong>
        {age !== null && (
          <span className="bos-badge-sep">
            {age === 0 ? 'today' : age === 1 ? 'yesterday' : `${age} days ago`}
          </span>
        )}
      </span>

      <span className="bos-badge">
        <strong>{shown}</strong> of {total} meetings shown
      </span>

      {staleCount > 0 && (
        <span className="bos-badge bos-badge-warn">
          {staleCount} meeting{staleCount === 1 ? '' : 's'} not in the latest pull — moved or
          cancelled
        </span>
      )}

      {isOld && (
        <span className="bos-badge bos-badge-warn">
          Run the collector extension to refresh the calendar
        </span>
      )}

      <span className="bos-badge-note">
        Board-meeting dates as announced to NSE; companies do reschedule.
      </span>
    </div>
  );
}
