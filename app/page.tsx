'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import TopNav from '@/components/layout/TopNav';
import Sidebar from '@/components/layout/Sidebar';
import SecurityFilterPanel from '@/components/SecurityFilterPanel';
import StatsCards from '@/components/StatsCards';
import DataTable from '@/components/DataTable';
import { useStockData } from '@/hooks/useStockData';
import { useSidebar } from '@/hooks/useSidebar';
import { getDateRange } from '@/utils/dateRanges';
import type { SearchParams } from '@/types';

const DEFAULT_SYMBOL = 'DEEPAKNTR';
const defaultRange = getDateRange('3M')!;

export default function Home() {
  const { data, loading, error, meta, fetchData } = useStockData();
  const contentRef = useRef<HTMLElement>(null);
  const { open: sidebarOpen, toggle: toggleSidebar, close: closeSidebar } = useSidebar();
  const [deliveryMultiplier, setDeliveryMultiplier] = useState<number>(3);

  const doFetch = useCallback(
    ({ symbol, from, to }: SearchParams) => {
      fetchData({ symbol, from, to });
    },
    [fetchData]
  );

  useEffect(() => {
    doFetch({
      symbol: DEFAULT_SYMBOL,
      from: defaultRange.from,
      to: defaultRange.to,
    });
  }, [doFetch]);

  const handleSearch = ({ symbol, from, to }: SearchParams) => {
    doFetch({ symbol, from, to });
  };

  const handleNavigate = () => {
    contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    closeSidebar();
  };

  return (
    <div className="app">
      <TopNav onMenuToggle={toggleSidebar} sidebarOpen={sidebarOpen} />

      <div className="app-body">
        <Sidebar open={sidebarOpen} onNavigate={handleNavigate} onClose={closeSidebar} />

        <main className="content-area" ref={contentRef}>
          <SecurityFilterPanel onSearch={handleSearch} loading={loading} meta={meta} />

          {loading && (
            <div className="state-message loading">
              <div className="spinner" />
              <p>Fetching data from NSE India…</p>
            </div>
          )}

          {error && (
            <div className="state-message error">
              <p>{error}</p>
            </div>
          )}

          {!loading && !error && data.length > 0 && (
            <>
              <section className="content-section" id="section-metrics">
                <div className="section-header">
                  <h2>Key Metrics</h2>
                  <div className="section-header-right">
                    <label className="metrics-threshold">
                      High delivery &gt;
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={deliveryMultiplier}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                          const next = parseInt(e.target.value, 10);
                          setDeliveryMultiplier(Number.isFinite(next) && next > 0 ? next : 3);
                        }}
                        aria-label="High delivery multiplier"
                      />
                      × avg qty
                    </label>
                    <span className="section-meta">{data.length} trading days</span>
                  </div>
                </div>
                <StatsCards data={data} deliveryMultiplier={deliveryMultiplier} />
              </section>

              <section className="content-section" id="section-historical">
                <DataTable data={data} deliveryMultiplier={deliveryMultiplier} />
              </section>
            </>
          )}

          {!loading && !error && data.length === 0 && (
            <div className="state-message empty">
              <p>Enter a stock symbol and date range to view data.</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
