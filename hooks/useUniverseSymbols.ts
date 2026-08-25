'use client';

import { useEffect, useState } from 'react';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabaseClient';

export interface UniverseSymbol {
  symbol: string;
  name: string | null;
}

/**
 * The curated universe, for the symbol field's suggestion list.
 *
 * Purely a convenience: the field stays free text, because the backtest is
 * explicitly allowed to run on symbols outside the universe. A failure here
 * costs the suggestions and nothing else, so it never surfaces an error.
 */
export function useUniverseSymbols(): UniverseSymbol[] {
  const [symbols, setSymbols] = useState<UniverseSymbol[]>([]);

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    let cancelled = false;

    getSupabase()
      .from('symbols')
      .select('symbol, name')
      .order('symbol')
      .then(({ data, error }) => {
        if (cancelled || error || !data) return;
        setSymbols(
          (data as unknown as Record<string, unknown>[]).map((row) => ({
            symbol: String(row.symbol),
            name: (row.name as string | null) ?? null,
          }))
        );
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return symbols;
}
