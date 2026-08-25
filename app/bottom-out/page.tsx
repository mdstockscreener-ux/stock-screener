'use client';

import { useMemo, useState } from 'react';
import TopNav from '@/components/layout/TopNav';
import Sidebar from '@/components/layout/Sidebar';
import ScannerControls from '@/components/screener/ScannerControls';
import ScannerResultsTable from '@/components/screener/ScannerResultsTable';
import DataAsOfBadge from '@/components/screener/DataAsOfBadge';
import SaveScreenPanel from '@/components/screener/SaveScreenPanel';
import { useScreenSummary } from '@/hooks/useScreenSummary';
import { useSavedScreens } from '@/hooks/useSavedScreens';
import { filterRows, isStale, sortRows } from '@/utils/bottomOut';
import { DEFAULT_PARAMS } from '@/types/screener';
import type { ScannerParams, SortDir, SortKey } from '@/types/screener';

export default function BottomOutScanner(): JSX.Element {
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(true);
  const [params, setParams] = useState<ScannerParams>(DEFAULT_PARAMS);
  const [sortKey, setSortKey] = useState<SortKey>('pct_from_low');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const { rows, lastRun, loading, error, reload } = useScreenSummary();
  const {
    screens,
    loading: screensLoading,
    error: screensError,
    saving,
    saveScreen,
  } = useSavedScreens();

  // The universe is already in memory — every threshold change is a pure
  // recompute over ~100 rows, never a round-trip.
  const matches = useMemo(() => filterRows(rows, params), [rows, params]);
  const sorted = useMemo(() => sortRows(matches, sortKey, sortDir), [matches, sortKey, sortDir]);

  const asOf = rows[0]?.as_of ?? null;
  const staleCount = useMemo(() => matches.filter(isStale).length, [matches]);

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((dir) => (dir === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  return (
    <div className="app">
      <TopNav onMenuToggle={() => setSidebarOpen((open) => !open)} sidebarOpen={sidebarOpen} />

      <div className="app-body">
        <Sidebar open={sidebarOpen} />

        <main className="content-area">
          <section className="bos-header">
            <div>
              <h1 className="bos-title">Bottom-Out Scanner</h1>
              <p className="bos-subtitle">
                Nifty 100 stocks sitting near their 52-week low but no longer making new
                lows. Selection is as of today — the backtest section tests these forward
                from a saved snapshot.
              </p>
            </div>
            <button type="button" className="bos-btn-ghost" onClick={reload} disabled={loading}>
              {loading ? 'Loading…' : 'Reload data'}
            </button>
          </section>

          {error && (
            <div className="state-message error">
              <p>{error}</p>
            </div>
          )}

          {loading && !error && (
            <div className="state-message loading">
              <div className="spinner" />
              <p>Loading the 52-week summary…</p>
            </div>
          )}

          {!loading && !error && (
            <>
              <DataAsOfBadge lastRun={lastRun} asOf={asOf} staleCount={staleCount} />

              <ScannerControls
                params={params}
                onChange={setParams}
                matchCount={matches.length}
                totalCount={rows.length}
              />

              <section className="content-section">
                <div className="section-header">
                  <h2>Shortlist</h2>
                  <span className="section-meta">
                    {matches.length} of {rows.length} symbols
                  </span>
                </div>
                <ScannerResultsTable
                  rows={sorted}
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={handleSort}
                />
              </section>

              <SaveScreenPanel
                params={params}
                dataAsOf={asOf}
                matchCount={matches.length}
                saving={saving}
                screens={screens}
                screensLoading={screensLoading}
                screensError={screensError}
                onSave={(name) => saveScreen(name, params, asOf, matches)}
              />
            </>
          )}
        </main>
      </div>
    </div>
  );
}
