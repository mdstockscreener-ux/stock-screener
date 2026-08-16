'use client';

import { useState } from 'react';
import { toApiDate } from '@/utils/formatters';
import type { SearchParams } from '@/types';

const defaultTo = new Date(2026, 6, 2);
const defaultFrom = new Date(2026, 3, 2);

interface DateFilterBarProps {
  defaultSymbol?: string;
  onSearch: (params: SearchParams) => void;
  loading?: boolean;
}

export default function DateFilterBar({ defaultSymbol = 'DEEPAKNTR', onSearch, loading }: DateFilterBarProps): JSX.Element {
  const [symbol, setSymbol] = useState(defaultSymbol);
  const [from, setFrom] = useState(toApiDate(defaultFrom));
  const [to, setTo] = useState(toApiDate(defaultTo));

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = symbol.trim().toUpperCase();
    if (trimmed) onSearch({ symbol: trimmed, from, to });
  };

  return (
    <form className="date-filter-bar" onSubmit={handleSubmit}>
      <div className="filter-field">
        <label htmlFor="symbol">Symbol</label>
        <input
          id="symbol"
          type="text"
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          placeholder="e.g. DEEPAKNTR"
          required
        />
      </div>
      <div className="filter-field">
        <label htmlFor="from">From</label>
        <input
          id="from"
          type="text"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          placeholder="DD-MM-YYYY"
          pattern="\d{2}-\d{2}-\d{4}"
          required
        />
      </div>
      <div className="filter-field">
        <label htmlFor="to">To</label>
        <input
          id="to"
          type="text"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="DD-MM-YYYY"
          pattern="\d{2}-\d{2}-\d{4}"
          required
        />
      </div>
      <button type="submit" className="btn-apply" disabled={loading}>
        {loading ? 'Loading…' : 'Apply'}
      </button>
    </form>
  );
}
