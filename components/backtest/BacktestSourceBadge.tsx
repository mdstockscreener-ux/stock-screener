'use client';

import { formatDate } from '@/utils/bottomOut';
import type { DataProvenance } from '@/types/backtest';

interface BacktestSourceBadgeProps {
  data: DataProvenance;
}

/**
 * Where the bars came from and what that costs the reader in trust.
 *
 * The liquidity caveat is keyed off universe membership, not off the source:
 * a symbol can be fetched and still be a large-cap the scanner covers, and it
 * is the size-and-liquidity filter — not the fetch — that the fills assume.
 */
export default function BacktestSourceBadge({ data }: BacktestSourceBadgeProps): JSX.Element {
  const fetched = data.source === 'fetched';

  return (
    <div className="bos-badge-row">
      <span className={`bos-badge${fetched ? ' bt-badge-fetched' : ''}`}>
        <span className="bos-badge-dot" />
        {fetched ? 'Fetched' : 'Store'}
        <span className="bos-badge-sep">{data.sourceLabel}</span>
      </span>

      <span className="bos-badge">
        Data as of <strong>{data.asOf ? formatDate(data.asOf) : '—'}</strong>
        <span className="bos-badge-sep">
          {data.barCount} bars, {data.coveredStart ? formatDate(data.coveredStart) : '—'} to{' '}
          {data.coveredEnd ? formatDate(data.coveredEnd) : '—'}
        </span>
      </span>

      <span className="bos-badge">Split &amp; bonus adjusted</span>

      {!data.inUniverse && (
        <span className="bos-badge bos-badge-warn">
          Outside the scanner universe — no liquidity or size filter has been applied
        </span>
      )}

      {data.warnings.map((warning) => (
        <span key={warning} className="bos-badge bos-badge-warn">
          {warning}
        </span>
      ))}

      <span className="bos-badge-note">
        Every price here is end-of-day stored or fetched data, not a live quote.
      </span>
    </div>
  );
}
