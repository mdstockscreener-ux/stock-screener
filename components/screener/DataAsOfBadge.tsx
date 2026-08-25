'use client';

import { formatDate, formatTimestamp } from '@/utils/bottomOut';
import type { IngestionRun } from '@/types/screener';

interface DataAsOfBadgeProps {
  lastRun: IngestionRun | null;
  /** Global latest bar date across the universe. */
  asOf: string | null;
  /** How many currently-shown symbols have not traded up to asOf. */
  staleCount: number;
}

export default function DataAsOfBadge({
  lastRun,
  asOf,
  staleCount,
}: DataAsOfBadgeProps): JSX.Element {
  return (
    <div className="bos-badge-row">
      <span className="bos-badge">
        <span className="bos-badge-dot" />
        Data as of <strong>{formatTimestamp(lastRun?.finished_at ?? null)}</strong>
        {asOf && <span className="bos-badge-sep">latest bar {formatDate(asOf)}</span>}
      </span>

      {lastRun?.symbols_failed ? (
        <span className="bos-badge bos-badge-warn">
          {lastRun.symbols_failed} symbol{lastRun.symbols_failed === 1 ? '' : 's'} failed
          last refresh
        </span>
      ) : null}

      {staleCount > 0 && (
        <span className="bos-badge bos-badge-warn">
          {staleCount} shown symbol{staleCount === 1 ? '' : 's'} stale — last bar predates{' '}
          {asOf ? formatDate(asOf) : 'the latest bar'}
        </span>
      )}

      <span className="bos-badge-note">
        &ldquo;Close&rdquo; is the last stored close, not a live quote.
      </span>
    </div>
  );
}
