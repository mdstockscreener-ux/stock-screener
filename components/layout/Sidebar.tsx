'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  IconAnalytics,
  IconCalendar,
  IconChart,
  IconMarket,
  IconTrendUp,
  IconChevronRight,
  IconTable,
  IconVolume,
} from '@/components/icons';

interface SubItem {
  id: string;
  href: string;
  label: string;
}

interface NavItem {
  id: string;
  href?: string;
  label: string;
  icon: () => JSX.Element;
  children?: SubItem[];
}

const NAV_ITEMS: NavItem[] = [
  {
    id: 'home',
    label: 'Security - wise Price Volume Data',
    icon: IconAnalytics,
    children: [
      {
        id: 'security-pv',
        href: '/',
        label: 'Security - wise Price Volume Data',
      },
      {
        id: 'bulk-security-pv',
        href: '/bulk-security-pv',
        label: 'Bulk - Security - wise Price Volume Data',
      },
    ],
  },
  {
    id: 'bottom-out',
    href: '/bottom-out',
    label: 'Bottom-Out Scanner',
    icon: IconTrendUp,
  },
  {
    id: 'backtest',
    href: '/backtest',
    label: 'Strategy Backtest',
    icon: IconChart,
  },
  {
    id: 'results-calendar',
    href: '/results-calendar',
    label: 'Upcoming Results',
    icon: IconCalendar,
  },
  {
    id: 'volume-gainers',
    href: '/volume-gainers',
    label: 'Volume Gainers',
    icon: IconVolume,
  },
  {
    id: 'most-active-equities',
    href: '/most-active-equities',
    label: 'Most Active Equities',
    icon: IconMarket,
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

  // Track which collapsible groups are expanded.
  // Default: expand the group if the current path is one of its children.
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const item of NAV_ITEMS) {
      if (item.children) {
        const isActive = item.children.some((c) => c.href === pathname);
        initial[item.id] = isActive;
      }
    }
    return initial;
  });

  const toggleGroup = (id: string) => {
    setExpandedGroups((prev) => ({ ...prev, [id]: !prev[id] }));
  };

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
            {NAV_ITEMS.map((item) => {
              if (item.children) {
                // Collapsible group
                const isExpanded = expandedGroups[item.id] ?? false;
                const isGroupActive = item.children.some((c) => c.href === pathname);

                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      className={`sidebar-nav-item sidebar-nav-group-trigger ${isGroupActive ? 'active' : ''}`}
                      onClick={() => toggleGroup(item.id)}
                      aria-expanded={isExpanded}
                    >
                      <item.icon />
                      <span>{item.label}</span>
                      <span className={`sidebar-chevron ${isExpanded ? 'expanded' : ''}`}>
                        <IconChevronRight />
                      </span>
                    </button>

                    <ul className={`sidebar-sub-list ${isExpanded ? 'expanded' : ''}`}>
                      {item.children.map((child) => (
                        <li key={child.id}>
                          <Link
                            href={child.href}
                            className={`sidebar-sub-item ${pathname === child.href ? 'active' : ''}`}
                            onClick={() => onNavigate?.(child.id)}
                          >
                            <IconTable />
                            <span>{child.label}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </li>
                );
              }

              // Regular nav item
              return (
                <li key={item.id}>
                  <Link
                    href={item.href!}
                    className={`sidebar-nav-item ${pathname === item.href ? 'active' : ''}`}
                    onClick={() => onNavigate?.(item.id)}
                  >
                    <item.icon />
                    <span>{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>
    </>
  );
}
