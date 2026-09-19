/**
 * IST date/time helpers for server-side code.
 *
 * The server runtime's local timezone isn't guaranteed to be IST (Vercel
 * functions default to UTC), but NSE trading days are IST calendar days —
 * so "today" must be resolved via an explicit timeZone, not `new Date()`'s
 * local getters (that shortcut only works client-side, where the browser's
 * own zone can be trusted; see utils/resultsCalendar.ts's todayIso()).
 */

const IST_TIME_ZONE = 'Asia/Kolkata';

/** Today as an IST calendar date, e.g. "2026-09-19". */
export function todayIstIso(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: IST_TIME_ZONE }).format(now);
}

/**
 * Renders an ISO timestamp as `"<dayMonYear> <HH:mm:ss> IST"`, matching the
 * format the grid components build themselves client-side — minus the
 * "As on " prefix, which the components add.
 */
export function formatIstTimestamp(isoString: string): string {
  const date = new Date(isoString);
  const datePart = date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: IST_TIME_ZONE,
  });
  const timePart = date.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: IST_TIME_ZONE,
  });
  return `${datePart} ${timePart} IST`;
}
