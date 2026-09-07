'use client';

import { useRef, useState } from 'react';
import TopNav from '@/components/layout/TopNav';
import Sidebar from '@/components/layout/Sidebar';
import BulkFilterPanel from '@/components/BulkFilterPanel';
import BulkStatsGrid from '@/components/BulkStatsGrid';
import { useSidebar } from '@/hooks/useSidebar';
import { useBulkStockData } from '@/hooks/useBulkStockData';

export default function BulkSecurityPVPage() {
  const { open: sidebarOpen, toggle: toggleSidebar, close: closeSidebar } = useSidebar();
  const contentRef = useRef<HTMLElement>(null);
  const { results, loading, fetchedRange, fetchAll } = useBulkStockData();
  const [deliveryMultiplier, setDeliveryMultiplier] = useState(3);

  const handleNavigate = () => {
    contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    closeSidebar();
  };

  const handleSearch = ({
    symbols,
    from,
    to,
    deliveryMultiplier: dm,
  }: {
    symbols: string[];
    from: string;
    to: string;
    deliveryMultiplier: number;
  }) => {
    setDeliveryMultiplier(dm);
    fetchAll({ symbols, from, to });
  };

  const hasResults = results.length > 0;

  return (
    <div className="app">
      <TopNav onMenuToggle={toggleSidebar} sidebarOpen={sidebarOpen} />

      <div className="app-body">
        <Sidebar open={sidebarOpen} onNavigate={handleNavigate} onClose={closeSidebar} />

        <main className="content-area" ref={contentRef}>
          <BulkFilterPanel onSearch={handleSearch} loading={loading} />

          {/* Loading */}
          {loading && (
            <div className="state-message loading">
              <div className="spinner" />
              <p>Fetching data for {results.length > 0 ? `${results.length} stocks` : 'multiple stocks'}…</p>
            </div>
          )}

          {/* Results */}
          {!loading && hasResults && (
            <section className="content-section" id="section-bulk-results">
              <div className="section-header">
                <h2>Key Metrics</h2>
                <div className="section-header-right">
                  <span className="section-meta">
                    {results.length} stock{results.length > 1 ? 's' : ''}
                    {fetchedRange ? ` · ${fetchedRange.from} → ${fetchedRange.to}` : ''}
                  </span>
                </div>
              </div>

              <BulkStatsGrid results={results} deliveryMultiplier={deliveryMultiplier} />
            </section>
          )}

          {/* Empty prompt */}
          {!loading && !hasResults && (
            <div className="state-message empty">
              <p>Enter comma-separated stock symbols above and click GO to view bulk metrics.</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
