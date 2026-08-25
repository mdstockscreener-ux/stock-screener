'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { IconAnalytics, IconTrendUp } from '@/components/icons';

const NAV_ITEMS = [
  {
    id: 'home',
    href: '/',
    label: 'Security - wise Price Volume Data',
    icon: IconAnalytics,
  },
  {
    id: 'bottom-out',
    href: '/bottom-out',
    label: 'Bottom-Out Scanner',
    icon: IconTrendUp,
  },
];

interface SidebarProps {
  open: boolean;
  onNavigate?: (id: string) => void;
  /** Dismisses the mobile drawer when the backdrop is tapped. */
  onClose?: () => void;
}

export default function Sidebar({ open, onNavigate, onClose }: SidebarProps): JSX.Element {
  const pathname = usePathname();

  return (
    <>
      {/* Backdrop is inert on desktop; CSS reveals it only in drawer mode. */}
      {open && (
        <div className="sidebar-backdrop" onClick={() => onClose?.()} aria-hidden="true" />
      )}

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
            {NAV_ITEMS.map((item) => (
              <li key={item.id}>
                <Link
                  href={item.href}
                  className={`sidebar-nav-item ${pathname === item.href ? 'active' : ''}`}
                  onClick={() => onNavigate?.(item.id)}
                >
                  <item.icon />
                  <span>{item.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </aside>
    </>
  );
}
