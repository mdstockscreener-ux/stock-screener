import { useState, useCallback } from 'react';
import { normalizeRecord } from '../utils/formatters';

export function useStockData() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [meta, setMeta] = useState({ symbol: '', from: '', to: '' });

  const fetchData = useCallback(async ({ symbol, from, to }) => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ symbol, from, to, series: 'ALL' });
      let res;

      try {
        res = await fetch(`/api/historical?${params}`);
      } catch {
        throw new Error(
          'Cannot reach proxy server. Run "npm run dev" (not just "npm run client") to start both the proxy and frontend.'
        );
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Request failed (${res.status})`);
      }

      const json = await res.json();
      const records = (json.data || [])
        .map(normalizeRecord)
        .sort((a, b) => a.dateObj - b.dateObj);

      setData(records);
      setMeta({ symbol, from, to });
    } catch (err) {
      setError(err.message);
      setData([]);
    } finally {
      setLoading(false);
    }
  }, []);

  return { data, loading, error, meta, fetchData };
}
