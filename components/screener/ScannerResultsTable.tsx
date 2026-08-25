'use client';

import { formatPrice } from '@/utils/formatters';
import { formatDate, formatPct, isStale } from '@/utils/bottomOut';
import type { Screen52wSummaryRow, SortDir, SortKey } from '@/types/screener';

interface ScannerResultsTableProps {
  rows: Screen52wSummaryRow[];
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
}

function SortHeader({
  label,
  columnKey,
  sortKey,
  sortDir,
  onSort,
}: {
  label: string;
  columnKey: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
}): JSX.Element {
  const active = sortKey === columnKey;
  return (
    <th className="align-right">
      <button
        type="button"
        className={`bos-sort-btn${active ? ' is-active' : ''}`}
        onClick={() => onSort(columnKey)}
        aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
      >
        {label}
        <span className="bos-sort-arrow">{active ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}</span>
      </button>
    </th>
  );
}

export default function ScannerResultsTable({
  rows,
  sortKey,
  sortDir,
  onSort,
}: ScannerResultsTableProps): JSX.Element {
  if (rows.length === 0) {
    return (
      <div className="state-message empty">
        <p>No stocks pass the current filters.</p>
        <p className="hint">Widen the band or lower the aged-low guard.</p>
      </div>
    );
  }

  return (
    <div className="table-card">
      <div className="table-wrap">
        <table className="historical-table">
          <thead>
            <tr>
              <th className="align-left">Symbol</th>
              <th className="align-left">Name</th>
              <th className="align-right">Close</th>
              <th className="align-right">52w Low</th>
              <th className="align-right">Low Date</th>
              <SortHeader
                label="% from Low"
                columnKey="pct_from_low"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={onSort}
              />
              <SortHeader
                label="Days Since Low"
                columnKey="days_since_low"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={onSort}
              />
              <th className="align-right">52w High</th>
              <th className="align-right">% from High</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.symbol}>
                <td className="align-left symbol-cell">
                  {row.symbol}
                  {isStale(row) && (
                    <span
                      className="bos-stale-tag"
                      title={`Last bar ${formatDate(row.last_bar_date)}, universe is at ${formatDate(row.as_of)}`}
                    >
                      stale
                    </span>
                  )}
                </td>
                <td className="align-left">{row.name ?? '—'}</td>
                <td className="align-right num-cell">{formatPrice(row.close)}</td>
                <td className="align-right num-cell">{formatPrice(row.low_52w)}</td>
                <td className="align-right num-cell">{formatDate(row.low_52w_date)}</td>
                <td className="align-right num-cell bos-pos">{formatPct(row.pct_from_low)}</td>
                <td className="align-right num-cell">{row.days_since_low}</td>
                <td className="align-right num-cell">{formatPrice(row.high_52w)}</td>
                <td className="align-right num-cell bos-neg">{formatPct(row.pct_from_high)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
