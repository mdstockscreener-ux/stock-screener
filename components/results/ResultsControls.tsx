'use client';

import { HORIZONS } from '@/types/results';
import type { HorizonKey, ResultsFilters, ViewMode } from '@/types/results';

interface ResultsControlsProps {
  filters: ResultsFilters;
  onChange: (next: ResultsFilters) => void;
  view: ViewMode;
  onViewChange: (next: ViewMode) => void;
  /** Superseded rows available to reveal — the toggle is pointless without any. */
  supersededCount: number;
}

export default function ResultsControls({
  filters,
  onChange,
  view,
  onViewChange,
  supersededCount,
}: ResultsControlsProps): JSX.Element {
  const set = <K extends keyof ResultsFilters>(key: K, value: ResultsFilters[K]) => {
    onChange({ ...filters, [key]: value });
  };

  return (
    <section className="bos-panel">
      <div className="rc-toolbar">
        <div className="rc-control">
          <label className="rc-control-label" htmlFor="rc-horizon">
            Horizon
          </label>
          <select
            id="rc-horizon"
            className="rc-select"
            value={filters.horizon}
            onChange={(e) => set('horizon', e.target.value as HorizonKey)}
          >
            {HORIZONS.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="rc-control rc-control-grow">
          <label className="rc-control-label" htmlFor="rc-search">
            Search
          </label>
          <input
            id="rc-search"
            className="rc-search"
            type="search"
            autoComplete="off"
            placeholder="Symbol or company name"
            value={filters.search}
            onChange={(e) => set('search', e.target.value)}
          />
        </div>

        <div className="rc-control">
          <span className="rc-control-label">View</span>
          <div className="rc-view-toggle" role="group" aria-label="View mode">
            <button
              type="button"
              className={`rc-view-btn${view === 'grouped' ? ' is-active' : ''}`}
              aria-pressed={view === 'grouped'}
              onClick={() => onViewChange('grouped')}
            >
              By date
            </button>
            <button
              type="button"
              className={`rc-view-btn${view === 'table' ? ' is-active' : ''}`}
              aria-pressed={view === 'table'}
              onClick={() => onViewChange('table')}
            >
              Table
            </button>
          </div>
        </div>
      </div>

      {supersededCount > 0 && (
        <label className="bos-toggle rc-superseded-toggle">
          <input
            type="checkbox"
            checked={filters.showSuperseded}
            onChange={(e) => set('showSuperseded', e.target.checked)}
          />
          <span>
            Show {supersededCount} rescheduled meeting{supersededCount === 1 ? '' : 's'} — the
            old date{supersededCount === 1 ? '' : 's'}, kept because the collector never deletes
          </span>
        </label>
      )}
    </section>
  );
}
