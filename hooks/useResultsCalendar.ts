'use client';

import { useCallback, useEffect, useState } from 'react';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabaseClient';
import { addDaysIso, collectedAtOf, todayIso } from '@/utils/resultsCalendar';
import type { ResultsEvent } from '@/types/results';

const COLUMNS = 'id, symbol, company_name, purpose, board_meeting_date, description, last_seen_at';

/**
 * How far back the query reaches. Comfortably past the widest backward horizon
 * (30 days), so switching to "include last 30 days" is a pure in-memory
 * recompute rather than another round-trip.
 */
const LOOKBACK_DAYS = 60;

/** PostgREST caps a response at 1000 rows; the calendar will outgrow that. */
const PAGE_SIZE = 1000;

interface ResultsCalendarState {
  rows: ResultsEvent[];
  /** When the collector last ran, inferred from the newest last_seen_at. */
  collectedAt: string | null;
  /** Local calendar date, resolved after mount so SSR and the client agree. */
  today: string | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/**
 * Loads the results calendar in one pass.
 *
 * The whole window comes down at once and every control filters it in memory —
 * the same trade the Bottom-Out Scanner makes. This table is written by the
 * separate collector extension; nothing here ever writes to it.
 */
export function useResultsCalendar(): ResultsCalendarState {
  const [rows, setRows] = useState<ResultsEvent[]>([]);
  const [collectedAt, setCollectedAt] = useState<string | null>(null);
  const [today, setToday] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState<number>(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    // Resolved here rather than during render: a date computed in the render
    // pass would differ between the server and the client across midnight.
    const now = todayIso();
    setToday(now);

    if (!isSupabaseConfigured) {
      setLoading(false);
      setError(
        'Supabase is not configured. Copy .env.example to .env.local and set ' +
          'NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.'
      );
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    const load = async (): Promise<ResultsEvent[]> => {
      const supabase = getSupabase();
      const from = addDaysIso(now, -LOOKBACK_DAYS);
      const collected: ResultsEvent[] = [];

      for (let offset = 0; ; offset += PAGE_SIZE) {
        const { data, error: queryError } = await supabase
          .from('results_calendar')
          .select(COLUMNS)
          .gte('board_meeting_date', from)
          .order('board_meeting_date', { ascending: true })
          .order('symbol', { ascending: true })
          .range(offset, offset + PAGE_SIZE - 1);

        if (queryError) {
          throw new Error(
            `Could not load results_calendar: ${queryError.message}. Check that the ` +
              'collector project’s sql/results_calendar.sql has been run.'
          );
        }

        const page = (data ?? []) as unknown as Record<string, unknown>[];
        for (const row of page) {
          collected.push({
            id: String(row.id),
            symbol: String(row.symbol),
            company_name: String(row.company_name),
            purpose: String(row.purpose),
            board_meeting_date: String(row.board_meeting_date),
            description: (row.description as string | null) ?? null,
            last_seen_at: String(row.last_seen_at),
          });
        }

        if (page.length < PAGE_SIZE) break;
      }

      return collected;
    };

    load()
      .then((loaded) => {
        if (cancelled) return;
        setRows(loaded);
        setCollectedAt(collectedAtOf(loaded));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setRows([]);
        setCollectedAt(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [nonce]);

  return { rows, collectedAt, today, loading, error, reload };
}
