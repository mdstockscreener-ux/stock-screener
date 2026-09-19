'use client';

import TopNav from '@/components/layout/TopNav';
import Sidebar from '@/components/layout/Sidebar';
import AdminDashboard from '@/components/AdminDashboard';
import { useSidebar } from '@/hooks/useSidebar';

export default function AdminPage(): JSX.Element {
  const { open: sidebarOpen, toggle: toggleSidebar, close: closeSidebar } = useSidebar();

  return (
    <div className="app">
      <TopNav onMenuToggle={toggleSidebar} sidebarOpen={sidebarOpen} />

      <div className="app-body">
        <Sidebar open={sidebarOpen} onNavigate={closeSidebar} onClose={closeSidebar} />

        <main className="content-area">
          <AdminDashboard />
        </main>
      </div>
    </div>
  );
}
