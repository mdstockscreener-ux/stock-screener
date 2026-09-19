import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { SYNC_DATASETS } from '@/lib/marketDataSync';
import { todayIstIso } from '@/lib/istDate';

export interface DatasetStatus {
  key: string;
  table: string;
  sortBy?: 'volume' | 'value';
  rowCount: number;
  fetchedAt: string | null;
  error?: string;
}

export interface ResultsCalendarStatus {
  rowCount: number;
  latestSeenAt: string | null;
  error?: string;
}

/**
 * Row counts + latest fetched_at for today, per per-day-snapshot dataset,
 * plus results_calendar's running total (no trade_date concept — it's a
 * continuously upserted table, not a daily replace) — feeds the admin
 * dashboard.
 */
export async function GET(): Promise<Response> {
  const supabase = getSupabaseAdmin();
  const tradeDate = todayIstIso();

  const [datasets, resultsCalendar] = await Promise.all([
    Promise.all(
      Object.entries(SYNC_DATASETS).map(async ([key, config]) => {
        let query = supabase
          .from(config.table)
          .select('fetched_at', { count: 'exact' })
          .eq('trade_date', tradeDate);
        if (config.sortBy) {
          query = query.eq('sort_by', config.sortBy);
        }

        const { data, count, error } = await query.order('fetched_at', { ascending: false }).limit(1);

        if (error) {
          return { key, table: config.table, sortBy: config.sortBy, rowCount: 0, fetchedAt: null, error: error.message };
        }

        const latest = (data as { fetched_at: string }[] | null)?.[0]?.fetched_at ?? null;
        return { key, table: config.table, sortBy: config.sortBy, rowCount: count ?? 0, fetchedAt: latest };
      })
    ),
    (async (): Promise<ResultsCalendarStatus> => {
      const { data, count, error } = await supabase
        .from('results_calendar')
        .select('last_seen_at', { count: 'exact' })
        .order('last_seen_at', { ascending: false })
        .limit(1);

      if (error) {
        return { rowCount: 0, latestSeenAt: null, error: error.message };
      }
      const latest = (data as { last_seen_at: string }[] | null)?.[0]?.last_seen_at ?? null;
      return { rowCount: count ?? 0, latestSeenAt: latest };
    })(),
  ]);

  return NextResponse.json({ tradeDate, datasets, resultsCalendar });
}
