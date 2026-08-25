'use client';

import { useCallback, useEffect, useSyncExternalStore } from 'react';

/**
 * Below this the sidebar behaves as an overlay drawer, not an in-flow column.
 * Must stay in step with the `max-width: 900px` block in globals.css that turns
 * the sidebar into a fixed panel and reveals the backdrop behind it.
 */
const MOBILE_BREAKPOINT = 900;

/**
 * Open state lives outside React on purpose.
 *
 * Every page mounts its own copy of the shell, so holding this in component
 * state meant it was thrown away and re-initialised on each navigation: a nav
 * click collapsed the sidebar, and the incoming page immediately sprang it open
 * again. One module-level value, shared by whichever page is currently mounted,
 * survives the remount.
 */
let openState = true;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): boolean {
  return openState;
}

/**
 * The server has no viewport, so it renders the desktop default. The store
 * starts at that same value, so the first client snapshot always agrees with
 * the server markup and hydration stays quiet.
 */
function getServerSnapshot(): boolean {
  return true;
}

function setOpen(next: boolean): void {
  if (next === openState) return;
  openState = next;
  for (const listener of listeners) listener();
}

/** True while the sidebar is overlaying the content rather than sitting beside it. */
function isDrawer(): boolean {
  return window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`).matches;
}

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
  const open = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    const query = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`);
    if (query.matches) setOpen(false);

    // Follow the viewport across rotation / resize, so the drawer does not
    // linger closed when the user returns to a wide screen.
    const handleChange = (event: MediaQueryListEvent) => setOpen(!event.matches);
    query.addEventListener('change', handleChange);
    return () => query.removeEventListener('change', handleChange);
  }, []);

  const toggle = useCallback(() => setOpen(!openState), []);

  /**
   * Dismisses the drawer, and is deliberately inert on a wide screen.
   *
   * Its two callers are the backdrop tap and the nav-item click. Neither is a
   * request to collapse a sidebar that is sitting *in* the layout rather than
   * over it — and the backdrop is `display: none` above the breakpoint anyway,
   * so it cannot even be reached there. Collapsing by hand goes through
   * `toggle`, which still works at every width.
   */
  const close = useCallback(() => {
    if (isDrawer()) setOpen(false);
  }, []);

  return { open, toggle, close };
}
