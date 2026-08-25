'use client';

import { useCallback, useEffect, useState } from 'react';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabaseClient';
import type {
  SavedScreen,
  ScannerParams,
  Screen52wSummaryRow,
} from '@/types/screener';

interface SaveOutcome {
  ok: boolean;
  message: string;
}

interface SavedScreensState {
  screens: SavedScreen[];
  loading: boolean;
  error: string | null;
  saving: boolean;
  refresh: () => Promise<void>;
  saveScreen: (
    name: string,
    params: ScannerParams,
    dataAsOf: string | null,
    rows: Screen52wSummaryRow[]
  ) => Promise<SaveOutcome>;
}

/**
 * Saved shortlists. Writing a snapshot freezes both the basket and the
 * parameters that produced it, so a later backtest references "screen #N"
 * rather than whatever today's refresh happens to return.
 */
export function useSavedScreens(): SavedScreensState {
  const [screens, setScreens] = useState<SavedScreen[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<boolean>(false);

  const refresh = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const supabase = getSupabase();
    const { data, error: listError } = await supabase
      .from('screens')
      .select('id, name, created_at, data_as_of, params')
      .order('created_at', { ascending: false })
      .limit(50);

    if (listError) {
      setError(listError.message);
      setScreens([]);
      setLoading(false);
      return;
    }

    const headers = (data ?? []) as SavedScreen[];

    // One extra query for all counts, rather than one per screen.
    if (headers.length > 0) {
      const ids = headers.map((s) => s.id);
      const { data: resultRows } = await supabase
        .from('screen_results')
        .select('screen_id')
        .in('screen_id', ids);

      const counts = new Map<number, number>();
      for (const row of (resultRows ?? []) as { screen_id: number }[]) {
        counts.set(row.screen_id, (counts.get(row.screen_id) ?? 0) + 1);
      }
      for (const header of headers) {
        header.resultCount = counts.get(header.id) ?? 0;
      }
    }

    setScreens(headers);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const saveScreen = useCallback(
    async (
      name: string,
      params: ScannerParams,
      dataAsOf: string | null,
      rows: Screen52wSummaryRow[]
    ): Promise<SaveOutcome> => {
      if (!isSupabaseConfigured) {
        return { ok: false, message: 'Supabase is not configured.' };
      }
      const trimmed = name.trim();
      if (!trimmed) {
        return { ok: false, message: 'Give the shortlist a name first.' };
      }
      if (rows.length === 0) {
        return { ok: false, message: 'Nothing passes the current filters.' };
      }

      setSaving(true);
      const supabase = getSupabase();

      try {
        const { data: created, error: insertError } = await supabase
          .from('screens')
          .insert({ name: trimmed, data_as_of: dataAsOf, params })
          .select('id, name, created_at, data_as_of, params')
          .single();

        if (insertError || !created) {
          return {
            ok: false,
            message: `Could not create the screen: ${insertError?.message ?? 'unknown error'}`,
          };
        }

        const screenId = (created as SavedScreen).id;
        const payload = rows.map((row) => ({
          screen_id: screenId,
          symbol: row.symbol,
          close: row.close,
          low_52w: row.low_52w,
          low_52w_date: row.low_52w_date,
          high_52w: row.high_52w,
          pct_from_low: row.pct_from_low,
          pct_from_high: row.pct_from_high,
          days_since_low: row.days_since_low,
        }));

        const { error: resultsError } = await supabase
          .from('screen_results')
          .insert(payload);

        if (resultsError) {
          // The header row is already committed. Snapshots are insert-only by
          // policy, so it cannot be rolled back from the client — say so
          // plainly rather than reporting a clean failure.
          return {
            ok: false,
            message:
              `Screen #${screenId} was created but its ${payload.length} results ` +
              `failed to save: ${resultsError.message}. Delete screen #${screenId} ` +
              'in the SQL editor and retry.',
          };
        }

        await refresh();
        return {
          ok: true,
          message: `Saved "${trimmed}" as screen #${screenId} — ${payload.length} symbols frozen.`,
        };
      } finally {
        setSaving(false);
      }
    },
    [refresh]
  );

  return { screens, loading, error, saving, refresh, saveScreen };
}
