'use client';

import { IconUser, IconMenu } from '@/components/icons';

interface TopNavProps {
  onMenuToggle: () => void;
  sidebarOpen: boolean;
}

export default function TopNav({ onMenuToggle, sidebarOpen }: TopNavProps): JSX.Element {
  return (
    <header className="top-nav">
      <div className="top-nav-left">
        <button
          type="button"
          className="icon-btn menu-toggle"
          onClick={onMenuToggle}
          aria-label={sidebarOpen ? 'Hide menu' : 'Show menu'}
          aria-expanded={sidebarOpen}
        >
          <IconMenu />
        </button>
        <div className="top-nav-brand">
          <span className="brand-logo">SA</span>
          <span className="brand-name">Stock Analyser</span>
        </div>
      </div>

      <div className="top-nav-actions">
        <button type="button" className="icon-btn avatar-btn" aria-label="Profile">
          <IconUser />
        </button>
      </div>
    </header>
  );
}
