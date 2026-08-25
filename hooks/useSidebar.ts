'use client';

import { useCallback, useEffect, useState } from 'react';

/** Below this the sidebar behaves as an overlay drawer, not an in-flow column. */
const MOBILE_BREAKPOINT = 900;

interface SidebarState {
  open: boolean;
  toggle: () => void;
  close: () => void;
}

/**
 * Sidebar open/closed state, shared by every page in the shell.
 *
 * Starts open so the server-rendered markup matches the desktop default, then
 * collapses after mount if the viewport is small — doing it in an effect rather
 * than during render keeps hydration from mismatching.
 */
export function useSidebar(): SidebarState {
  const [open, setOpen] = useState<boolean>(true);

  useEffect(() => {
    const query = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`);
    if (query.matches) setOpen(false);

    // Follow the viewport across rotation / resize, so the drawer does not
    // linger closed when the user returns to a wide screen.
    const handleChange = (event: MediaQueryListEvent) => setOpen(!event.matches);
    query.addEventListener('change', handleChange);
    return () => query.removeEventListener('change', handleChange);
  }, []);

  const toggle = useCallback(() => setOpen((value) => !value), []);
  const close = useCallback(() => setOpen(false), []);

  return { open, toggle, close };
}
