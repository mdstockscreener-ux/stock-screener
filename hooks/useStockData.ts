'use client';

import { useState, useCallback } from 'react';
import { normalizeRecord } from '@/utils/formatters';
import type { StockRecord, StockMeta, SearchParams } from '@/types';

export function useStockData() {
  const [data, setData] = useState<StockRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<StockMeta>({ symbol: '', from: '', to: '' });

  const fetchData = useCallback(async ({ symbol, from, to }: SearchParams): Promise<void> => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ symbol, from, to, series: 'ALL' });
      const res = await fetch(`/api/historical?${params}`);

      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error || `Request failed (${res.status})`);
      }

      const json = await res.json() as { data?: Record<string, unknown>[] };
      const records = (json.data ?? [])
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((r) => normalizeRecord(r as any))
        .sort((a, b) => a.dateObj.getTime() - b.dateObj.getTime());

      setData(records);
      setMeta({ symbol, from, to });
    } catch (err) {
      setError((err as Error).message);
      setData([]);
    } finally {
      setLoading(false);
    }
  }, []);

  return { data, loading, error, meta, fetchData };
}
