'use client';

import { useCallback, useEffect, useState } from 'react';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabaseClient';
import type { IngestionRun, Screen52wSummaryRow } from '@/types/screener';

const SUMMARY_COLUMNS =
  'symbol, name, as_of, close, last_bar_date, low_52w, low_52w_date, ' +
  'high_52w, high_52w_date, pct_from_low, pct_from_high, days_since_low';

/** PostgREST can hand numerics back as strings depending on column type. */
function num(value: unknown): number {
  return typeof value === 'number' ? value : Number(value);
}

function normalizeRow(row: Record<string, unknown>): Screen52wSummaryRow {
  return {
    symbol: String(row.symbol),
    name: (row.name as string | null) ?? null,
    as_of: String(row.as_of),
    close: num(row.close),
    last_bar_date: String(row.last_bar_date),
    low_52w: num(row.low_52w),
    low_52w_date: String(row.low_52w_date),
    high_52w: num(row.high_52w),
    high_52w_date: String(row.high_52w_date),
    pct_from_low: num(row.pct_from_low),
    pct_from_high: num(row.pct_from_high),
    days_since_low: num(row.days_since_low),
  };
}

interface ScreenSummaryState {
  rows: Screen52wSummaryRow[];
  lastRun: IngestionRun | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/**
 * Loads the whole universe summary in a single query. The ~100 rows returned
 * are everything the scanner needs — threshold tuning happens client-side, so
 * moving a slider never touches the network.
 */
export function useScreenSummary(): ScreenSummaryState {
  const [rows, setRows] = useState<Screen52wSummaryRow[]>([]);
  const [lastRun, setLastRun] = useState<IngestionRun | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState<number>(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
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

    const supabase = getSupabase();

    Promise.all([
      supabase.from('screen_52w_summary').select(SUMMARY_COLUMNS).order('symbol'),
      supabase
        .from('ingestion_runs')
        .select('finished_at, range_end, symbols_ok, symbols_failed')
        .not('finished_at', 'is', null)
        .order('finished_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])
      .then(([summary, run]) => {
        if (cancelled) return;

        if (summary.error) {
          setError(
            `Could not load screen_52w_summary: ${summary.error.message}. ` +
              'Check that sql/bottom_out_scanner.sql has been run.'
          );
          setRows([]);
        } else {
          const list = (summary.data ?? []) as unknown as Record<string, unknown>[];
          setRows(list.map(normalizeRow));
        }

        // A missing ingestion_runs row only costs the badge, not the screen.
        setLastRun(run.error ? null : ((run.data as IngestionRun | null) ?? null));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [nonce]);

  return { rows, lastRun, loading, error, reload };
}
