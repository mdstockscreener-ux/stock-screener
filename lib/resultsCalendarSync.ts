import { fetchFromNse } from '@/lib/nseProxy';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

/**
 * Syncs results_calendar from NSE's event-calendar API — a server-side port
 * of the event-calendar-data-collector browser extension's own already-
 * working fetch/normalize/persist logic (nse-fetcher.ts, normalizer.ts,
 * persistence.ts in that sibling project), so this app's /admin page can
 * trigger the same refresh without needing the extension. results_calendar
 * itself, its schema, unique constraint, and RLS are owned by that project
 * and already exist — this file only adds a second writer using the same
 * upsert-and-touch contract.
 */

const NSE_EVENT_CALENDAR_URL = 'https://www.nseindia.com/api/event-calendar?index=equities';

interface NseRawEvent {
  symbol?: string;
  company?: string;
  purpose?: string;
  bm_desc?: string;
  board_meeting_date?: string;
  [key: string]: unknown;
}

interface CleanResultsEvent {
  symbol: string;
  company_name: string;
  purpose: string;
  board_meeting_date: string; // YYYY-MM-DD
  description: string;
  source: 'NSE';
}

const MONTH_MAP: Record<string, string> = {
  Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
  Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12',
};

/** "DD-Mon-YYYY" / "YYYY-MM-DD" / "DD/MM/YYYY" → "YYYY-MM-DD", or null if unparseable. */
function parseNseDate(raw: string): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();

  const dashParts = trimmed.split('-');
  if (dashParts.length === 3) {
    const [dd, mon, yyyy] = dashParts;
    const mm = MONTH_MAP[mon];
    if (mm && yyyy.length === 4 && !isNaN(Number(yyyy))) {
      return `${yyyy}-${mm}-${dd.padStart(2, '0')}`;
    }
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  const slashParts = trimmed.split('/');
  if (slashParts.length === 3) {
    const [d, m, y] = slashParts;
    if (y.length === 4 && !isNaN(Number(m))) {
      return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
  }

  return null;
}

/** NSE's field name for the meeting date varies by endpoint variant. */
function extractDate(event: NseRawEvent): string | null {
  const candidates = [
    event.board_meeting_date,
    event.date as string | undefined,
    event.bm_date as string | undefined,
    event.meeting_date as string | undefined,
  ];
  for (const raw of candidates) {
    if (raw && typeof raw === 'string') {
      const parsed = parseNseDate(raw);
      if (parsed) return parsed;
    }
  }
  return null;
}

function extractPurpose(event: NseRawEvent): string {
  return (event.purpose ?? (event.subject as string) ?? '').trim();
}

function extractDescription(event: NseRawEvent): string {
  return (
    event.bm_desc ??
    (event.description as string) ??
    (event.attchmntText as string) ??
    ''
  ).trim();
}

/** NSE packs multiple purposes into one field, e.g. "Financial Results/Fund Raising". */
function isFinancialResults(event: NseRawEvent): boolean {
  const fields = [event.purpose, event.bm_desc, event.description, event.subject, event.attchmntText];
  return fields.some((f) => typeof f === 'string' && f.toLowerCase().includes('financial results'));
}

interface NormalizeResult {
  clean: CleanResultsEvent[];
  keptCount: number;
  filteredOutCount: number;
  droppedCount: number;
}

/** Keeps only Financial Results events with a valid symbol + parseable date. */
function normalize(rawEvents: NseRawEvent[]): NormalizeResult {
  const clean: CleanResultsEvent[] = [];
  let filteredOutCount = 0;
  let droppedCount = 0;

  for (const event of rawEvents) {
    if (!isFinancialResults(event)) {
      filteredOutCount++;
      continue;
    }

    const symbol = event.symbol?.trim();
    const isoDate = extractDate(event);
    if (!symbol || !isoDate) {
      droppedCount++;
      continue;
    }

    const rawPurpose = extractPurpose(event) || 'Financial Results';
    // Collapse combined purposes to a single canonical value so the
    // (symbol, date, purpose) key stays stable across pulls.
    const purpose = rawPurpose.includes('Financial Results') ? 'Financial Results' : rawPurpose;

    clean.push({
      symbol,
      company_name: event.company?.trim() ?? symbol,
      purpose,
      board_meeting_date: isoDate,
      description: extractDescription(event),
      source: 'NSE',
    });
  }

  return { clean, keptCount: clean.length, filteredOutCount, droppedCount };
}

export interface ResultsCalendarSyncResult {
  inserted: number;
  skipped: number;
  total: number;
  filteredOut: number;
  dropped: number;
}

export async function runResultsCalendarSync(): Promise<ResultsCalendarSyncResult> {
  const result = await fetchFromNse(NSE_EVENT_CALENDAR_URL, 'event-calendar');
  if (result.status !== 200) {
    throw new Error(`NSE returned HTTP ${result.status} for event-calendar`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(result.body);
  } catch {
    throw new Error('NSE event-calendar response was not valid JSON');
  }

  const rawEvents: NseRawEvent[] = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as { data?: unknown[] })?.data)
      ? ((parsed as { data: unknown[] }).data as NseRawEvent[])
      : [];

  const { clean, keptCount, filteredOutCount, droppedCount } = normalize(rawEvents);

  if (clean.length === 0) {
    return { inserted: 0, skipped: 0, total: keptCount, filteredOut: filteredOutCount, dropped: droppedCount };
  }

  const supabase = getSupabaseAdmin();

  // Pre-query existing keys purely to report inserted-vs-touched counts —
  // the upsert below works correctly with or without this.
  const symbols = [...new Set(clean.map((e) => e.symbol))];
  const dates = [...new Set(clean.map((e) => e.board_meeting_date))];
  const { data: existing, error: queryError } = await supabase
    .from('results_calendar')
    .select('symbol, board_meeting_date, purpose')
    .in('symbol', symbols)
    .in('board_meeting_date', dates);

  if (queryError) {
    throw new Error(`Failed to query existing results_calendar rows: ${queryError.message}`);
  }

  const existingKeys = new Set(
    (existing ?? []).map(
      (r: { symbol: string; board_meeting_date: string; purpose: string }) =>
        `${r.symbol}|${r.board_meeting_date}|${r.purpose}`
    )
  );
  const insertedCount = clean.filter(
    (e) => !existingKeys.has(`${e.symbol}|${e.board_meeting_date}|${e.purpose}`)
  ).length;

  // On conflict, only the fields below get overwritten — first_seen_at is
  // deliberately absent so it keeps the column default on insert and stays
  // untouched on update.
  const now = new Date().toISOString();
  const rows = clean.map((e) => ({
    symbol: e.symbol,
    company_name: e.company_name,
    purpose: e.purpose,
    board_meeting_date: e.board_meeting_date,
    description: e.description,
    source: e.source,
    last_seen_at: now,
  }));

  const { error: upsertError } = await supabase
    .from('results_calendar')
    .upsert(rows, { onConflict: 'symbol,board_meeting_date,purpose', ignoreDuplicates: false });

  if (upsertError) {
    throw new Error(`results_calendar upsert failed: ${upsertError.message}`);
  }

  return {
    inserted: insertedCount,
    skipped: clean.length - insertedCount,
    total: keptCount,
    filteredOut: filteredOutCount,
    dropped: droppedCount,
  };
}
