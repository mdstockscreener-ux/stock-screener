'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { IconSearch } from '@/components/icons';
import { searchEquities } from '@/utils/equitySearch';
import type { EquityItem } from '@/types';

/**
 * Search box for the Stock Analysis tab. Local search (app_data/EQUITY_L.json,
 * a point-in-time NSE snapshot) runs first — instant, free. Only when that
 * comes up empty does it fall back to a live BharatStock search
 * (/api/stock-search, debounced) — BharatStock's own coverage is the actual
 * source of truth for what this tab can analyze, and it doesn't always
 * agree with the local snapshot (see lib/bharatstock.ts's callers).
 *
 * Reports every keystroke via onQueryChange so the parent can tell "the
 * user typed something but never picked a result" apart from "a result is
 * selected" — without that, clicking Analyze after a failed search would
 * silently re-run whatever symbol was selected before.
 */

interface StockAnalysisSearchProps {
  value: string;
  stockName: string;
  onChange: (item: EquityItem) => void;
  onQueryChange?: (query: string) => void;
  disabled?: boolean;
}

export default function StockAnalysisSearch({
  value,
  stockName,
  onChange,
  onQueryChange,
  disabled,
}: StockAnalysisSearchProps): JSX.Element {
  const [query, setQuery] = useState('');
  const [localResults, setLocalResults] = useState<EquityItem[]>([]);
  const [liveResults, setLiveResults] = useState<EquityItem[]>([]);
  const [liveLoading, setLiveLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const liveDebounceRef = useRef<NodeJS.Timeout | null>(null);

  const displayValue = open ? query : stockName || value || '';
  const results = localResults.length > 0 ? localResults : liveResults;

  const runSearch = useCallback((q: string) => {
    const local = searchEquities(q);
    setLocalResults(local);
    setHighlightIndex(-1);

    if (liveDebounceRef.current) clearTimeout(liveDebounceRef.current);

    if (local.length > 0 || q.trim().length < 2) {
      setLiveResults([]);
      setLiveLoading(false);
      return;
    }

    setLiveLoading(true);
    liveDebounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/stock-search?q=${encodeURIComponent(q)}`);
        const body = (await res.json()) as { results?: EquityItem[] };
        setLiveResults(body.results ?? []);
      } catch {
        setLiveResults([]);
      } finally {
        setLiveLoading(false);
      }
    }, 400);
  }, []);

  const closeDropdown = useCallback(() => {
    setOpen(false);
    setQuery('');
    setLocalResults([]);
    setLiveResults([]);
    setLiveLoading(false);
    setHighlightIndex(-1);
  }, []);

  const handleSelect = useCallback(
    (item: EquityItem) => {
      onChange(item);
      closeDropdown();
    },
    [onChange, closeDropdown]
  );

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        closeDropdown();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [closeDropdown]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value;
    setQuery(next);
    setOpen(true);
    onQueryChange?.(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(next), 150);
  };

  const handleFocus = () => {
    setOpen(true);
    const initial = stockName || value || '';
    setQuery(initial);
    onQueryChange?.(initial);
    runSearch(initial);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      closeDropdown();
      return;
    }

    if (!open || results.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex((i) => (i < results.length - 1 ? i + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex((i) => (i > 0 ? i - 1 : results.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const index = highlightIndex >= 0 ? highlightIndex : 0;
      handleSelect(results[index]);
    }
  };

  const trimmedQuery = query.trim();
  const showEmpty = open && trimmedQuery.length > 0 && results.length === 0 && !liveLoading;

  return (
    <div className="stock-search" ref={wrapperRef}>
      <label htmlFor="sa-search-input" className="stock-search-label">
        Stock Name
      </label>
      <div className="stock-search-input-wrap">
        <IconSearch />
        <input
          id="sa-search-input"
          type="text"
          value={displayValue}
          onChange={handleInputChange}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
          placeholder="Search by company name or symbol"
          disabled={disabled}
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
        />
      </div>

      {open && liveLoading && trimmedQuery.length >= 2 && localResults.length === 0 && (
        <div className="stock-search-empty">Searching BharatStock for &ldquo;{trimmedQuery}&rdquo;…</div>
      )}

      {open && results.length > 0 && (
        <ul className="stock-search-dropdown" role="listbox">
          {results.map((item, index) => (
            <li key={`${item.symbol}-${item.series}`}>
              <button
                type="button"
                role="option"
                aria-selected={index === highlightIndex}
                className={`stock-search-option ${index === highlightIndex ? 'highlighted' : ''}`}
                onMouseEnter={() => setHighlightIndex(index)}
                onClick={() => handleSelect(item)}
              >
                <span className="stock-search-name">{item.name}</span>
                <span className="stock-search-symbol">{item.symbol}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {showEmpty && <div className="stock-search-empty">No matching stocks found</div>}
    </div>
  );
}
