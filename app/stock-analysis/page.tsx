'use client';

import TopNav from '@/components/layout/TopNav';
import Sidebar from '@/components/layout/Sidebar';
import StockAnalysisPanel from '@/components/StockAnalysisPanel';
import { useSidebar } from '@/hooks/useSidebar';

export default function StockAnalysisPage(): JSX.Element {
  const { open: sidebarOpen, toggle: toggleSidebar, close: closeSidebar } = useSidebar();

  return (
    <div className="app">
      <TopNav onMenuToggle={toggleSidebar} sidebarOpen={sidebarOpen} />

      <div className="app-body">
        <Sidebar open={sidebarOpen} onNavigate={closeSidebar} onClose={closeSidebar} />

        <main className="content-area">
          <StockAnalysisPanel />
        </main>
      </div>
    </div>
  );
}
