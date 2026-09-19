'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import TopNav from '@/components/layout/TopNav';
import Sidebar from '@/components/layout/Sidebar';
import ResultsAsOfBadge from '@/components/results/ResultsAsOfBadge';
import ResultsControls from '@/components/results/ResultsControls';
import ResultsDayGroups from '@/components/results/ResultsDayGroups';
import ResultsTable from '@/components/results/ResultsTable';
import { useResultsCalendar } from '@/hooks/useResultsCalendar';
import { useSidebar } from '@/hooks/useSidebar';
import { decorate, filterRows, groupByDate, sortRows } from '@/utils/resultsCalendar';
import { DEFAULT_FILTERS, HORIZONS } from '@/types/results';
import type {
  ResultsFilters,
  ResultsSortDir,
  ResultsSortKey,
  ViewMode,
} from '@/types/results';

const VIEW_STORAGE_KEY = 'results-calendar:view';

export default function ResultsCalendarPage(): JSX.Element {
  const { open: sidebarOpen, toggle: toggleSidebar, close: closeSidebar } = useSidebar();
  const { rows, collectedAt, today, loading, error, reload } = useResultsCalendar();

  const [filters, setFilters] = useState<ResultsFilters>(DEFAULT_FILTERS);
  const [view, setView] = useState<ViewMode>('grouped');
  const [sortKey, setSortKey] = useState<ResultsSortKey>('board_meeting_date');
  const [sortDir, setSortDir] = useState<ResultsSortDir>('asc');
  const [copied, setCopied] = useState(false);

  // Read after mount, not during render: localStorage does not exist on the
  // server, and seeding state from it would desync hydration.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(VIEW_STORAGE_KEY);
      if (saved === 'grouped' || saved === 'table') setView(saved);
    } catch {
      // Private mode or blocked storage — the default view is fine.
    }
  }, []);

  const handleViewChange = (next: ViewMode) => {
    setView(next);
    try {
      window.localStorage.setItem(VIEW_STORAGE_KEY, next);
    } catch {
      // Remembering the choice is a convenience, never a requirement.
    }
  };

  const handleSort = (key: ResultsSortKey) => {
    if (key === sortKey) {
      setSortDir((dir) => (dir === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  // The whole window is already in memory, so every control is a pure
  // recompute over a few hundred rows rather than another round-trip.
  const decorated = useMemo(() => decorate(rows, collectedAt), [rows, collectedAt]);
  const visible = useMemo(
    () => (today ? filterRows(decorated, filters, today) : []),
    [decorated, filters, today]
  );
  const days = useMemo(() => groupByDate(visible), [visible]);
  const sorted = useMemo(() => sortRows(visible, sortKey, sortDir), [visible, sortKey, sortDir]);

  const copySymbols = useCallback(async () => {
    if (visible.length === 0) return;
    // A symbol can appear more than once (multiple purposes/dates) — dedupe.
    const uniqueSymbols = [...new Set(visible.map((r) => r.symbol.toLowerCase()))];
    const text = uniqueSymbols.join(', ');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback for older browsers
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [visible]);

  // Counted before the superseded filter, so the toggle can offer what it hides.
  const supersededCount = useMemo(
    () =>
      today
        ? filterRows(decorated, { ...filters, showSuperseded: true }, today).filter(
            (row) => row.superseded
          ).length
        : 0,
    [decorated, filters, today]
  );
  const staleCount = useMemo(
    () => visible.filter((row) => row.stale && !row.superseded).length,
    [visible]
  );

  const horizonLabel =
    HORIZONS.find((option) => option.key === filters.horizon)?.label.toLowerCase() ??
    'this window';

  return (
    <div className="app">
      <TopNav onMenuToggle={toggleSidebar} sidebarOpen={sidebarOpen} />

      <div className="app-body">
        <Sidebar open={sidebarOpen} onNavigate={closeSidebar} onClose={closeSidebar} />

        <main className="content-area">
          <section className="bos-header">
            <div>
              <h1 className="bos-title">Upcoming Results</h1>
              <p className="bos-subtitle">
                Board meetings announced to NSE for considering financial results, collected by
                the event-calendar extension. This page only reads that table — refreshing the
                data means running the collector.
              </p>
            </div>
            <div className="bos-panel-head-right">
              <button
                type="button"
                className="bos-btn-ghost"
                onClick={copySymbols}
                disabled={visible.length === 0}
                title={copied ? 'Copied!' : 'Copy symbols as comma-separated values'}
              >
                {copied ? 'Copied!' : 'Copy Symbols'}
              </button>
              <button type="button" className="bos-btn-ghost" onClick={reload} disabled={loading}>
                {loading ? 'Loading…' : 'Reload data'}
              </button>
            </div>
          </section>

          {error && (
            <div className="state-message error">
              <p>{error}</p>
            </div>
          )}

          {loading && !error && (
            <div className="state-message loading">
              <div className="spinner" />
              <p>Loading the results calendar…</p>
            </div>
          )}

          {!loading && !error && today && (
            <>
              <ResultsAsOfBadge
                collectedAt={collectedAt}
                today={today}
                total={decorated.length}
                shown={visible.length}
                staleCount={staleCount}
              />

              <ResultsControls
                filters={filters}
                onChange={setFilters}
                view={view}
                onViewChange={handleViewChange}
                supersededCount={supersededCount}
              />

              {rows.length === 0 ? (
                <div className="state-message empty">
                  <p>No board meetings have been collected yet.</p>
                  <p className="hint">
                    Run the event-calendar collector extension to pull the latest NSE calendar
                    into <code>results_calendar</code>, then reload this page.
                  </p>
                </div>
              ) : visible.length === 0 ? (
                <div className="state-message empty">
                  <p>Nothing scheduled in {horizonLabel}.</p>
                  <p className="hint">
                    {filters.search.trim() !== ''
                      ? 'No symbol or company matches that search — try clearing it.'
                      : 'Widen the horizon to look further ahead.'}
                  </p>
                </div>
              ) : (
                <section className="content-section">
                  <div className="section-header">
                    <h2>{view === 'grouped' ? 'By meeting date' : 'All meetings'}</h2>
                    <span className="section-meta">
                      {visible.length} meeting{visible.length === 1 ? '' : 's'}
                      {view === 'grouped' && ` across ${days.length} day${days.length === 1 ? '' : 's'}`}
                    </span>
                  </div>

                  {view === 'grouped' ? (
                    <ResultsDayGroups days={days} today={today} />
                  ) : (
                    <ResultsTable
                      rows={sorted}
                      today={today}
                      sortKey={sortKey}
                      sortDir={sortDir}
                      onSort={handleSort}
                    />
                  )}
                </section>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
