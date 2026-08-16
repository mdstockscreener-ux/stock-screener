'use client';

import { IconAnalytics } from '@/components/icons';

const NAV_ITEM = {
  id: 'home',
  label: 'Security - wise Price Volume Data',
  icon: IconAnalytics,
};

interface SidebarProps {
  open: boolean;
  onNavigate?: (id: string) => void;
}

export default function Sidebar({ open, onNavigate }: SidebarProps): JSX.Element {
  return (
    <aside className={`sidebar ${open ? '' : 'collapsed'}`}>
      <div className="sidebar-icon-strip">
        <button
          type="button"
          className="sidebar-icon-btn active"
          title="Analytics"
        >
          <IconAnalytics />
          <span className="sidebar-icon-label">Analytics</span>
        </button>
      </div>

      <nav className="sidebar-panel">
        <p className="sidebar-panel-title">Analytics</p>
        <ul className="sidebar-nav-list">
          <li>
            <button
              type="button"
              className="sidebar-nav-item active"
              onClick={() => onNavigate?.('home')}
            >
              <NAV_ITEM.icon />
              <span>{NAV_ITEM.label}</span>
            </button>
          </li>
        </ul>
      </nav>
    </aside>
  );
}
