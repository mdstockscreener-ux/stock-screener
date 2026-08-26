'use client';

import { formatDate } from '@/utils/bottomOut';
import { relativeDayLabel } from '@/utils/resultsCalendar';
import type {
  DecoratedResultsEvent,
  ResultsSortDir,
  ResultsSortKey,
} from '@/types/results';

interface ResultsTableProps {
  rows: DecoratedResultsEvent[];
  today: string;
  sortKey: ResultsSortKey;
  sortDir: ResultsSortDir;
  onSort: (key: ResultsSortKey) => void;
}

function SortHeader({
  label,
  columnKey,
  sortKey,
  sortDir,
  onSort,
  align = 'left',
}: {
  label: string;
  columnKey: ResultsSortKey;
  sortKey: ResultsSortKey;
  sortDir: ResultsSortDir;
  onSort: (key: ResultsSortKey) => void;
  align?: 'left' | 'right';
}): JSX.Element {
  const active = sortKey === columnKey;
  return (
    <th className={`align-${align}`}>
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

/** The scanning reading of the same data — sortable, one row per meeting. */
export default function ResultsTable({
  rows,
  today,
  sortKey,
  sortDir,
  onSort,
}: ResultsTableProps): JSX.Element {
  return (
    <div className="table-card">
      <div className="table-wrap">
        <table className="historical-table">
          <thead>
            <tr>
              <SortHeader
                label="Symbol"
                columnKey="symbol"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={onSort}
              />
              <SortHeader
                label="Company"
                columnKey="company_name"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={onSort}
              />
              <SortHeader
                label="Meeting date"
                columnKey="board_meeting_date"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={onSort}
              />
              <th className="align-left">When</th>
              <th className="align-left">Purpose</th>
              <th className="align-left">Description</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className={row.superseded ? 'rc-row-superseded' : ''}>
                <td className="align-left symbol-cell">
                  {row.symbol}
                  {row.superseded ? (
                    <span className="rc-tag rc-tag-superseded">rescheduled</span>
                  ) : row.stale ? (
                    <span className="rc-tag rc-tag-stale">not in latest pull</span>
                  ) : null}
                </td>
                <td className="align-left">{row.company_name}</td>
                <td className="align-left num-cell">{formatDate(row.board_meeting_date)}</td>
                <td className="align-left">{relativeDayLabel(row.board_meeting_date, today)}</td>
                <td className="align-left">{row.purpose}</td>
                <td className="align-left rc-desc-cell">{row.description ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
