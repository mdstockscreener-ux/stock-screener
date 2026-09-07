'use client';

import { useState, useCallback } from 'react';
import { normalizeRecord } from '@/utils/formatters';
import type { StockRecord } from '@/types';

export interface BulkFetchResult {
  symbol: string;
  data: StockRecord[];
  error: string | null;
}

interface FetchParams {
  symbols: string[];
  from: string;
  to: string;
}

export function useBulkStockData() {
  const [results, setResults] = useState<BulkFetchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchedRange, setFetchedRange] = useState<{ from: string; to: string } | null>(null);

  const fetchAll = useCallback(async ({ symbols, from, to }: FetchParams) => {
    if (!symbols.length) return;
    setLoading(true);
    setResults([]);

    const fetched = await Promise.all(
      symbols.map(async (symbol): Promise<BulkFetchResult> => {
        try {
          const params = new URLSearchParams({ symbol, from, to, series: 'ALL' });
          const res = await fetch(`/api/historical?${params}`);
          if (!res.ok) {
            const err = (await res.json().catch(() => ({}))) as { error?: string };
            throw new Error(err.error ?? `Request failed (${res.status})`);
          }
          const json = (await res.json()) as { data?: Record<string, unknown>[] };
          const data = (json.data ?? [])
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .map((r) => normalizeRecord(r as any))
            .sort((a, b) => a.dateObj.getTime() - b.dateObj.getTime());
          return { symbol, data, error: null };
        } catch (err) {
          return { symbol, data: [], error: (err as Error).message };
        }
      })
    );

    setResults(fetched);
    setFetchedRange({ from, to });
    setLoading(false);
  }, []);

  return { results, loading, fetchedRange, fetchAll };
}
