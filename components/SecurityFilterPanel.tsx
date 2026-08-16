'use client';

import { useState } from 'react';
import StockSearchSelect from '@/components/StockSearchSelect';
import { getDateRange, PRESETS, apiDateToInput, inputDateToApi } from '@/utils/dateRanges';
import type { Preset } from '@/utils/dateRanges';
import { IconCalendar } from '@/components/icons';
import { findEquityBySymbol } from '@/utils/equitySearch';
import type { EquityItem, SearchParams, StockMeta } from '@/types';

const DEFAULT_SYMBOL = 'DEEPAKNTR';
const DEFAULT_PRESET: Preset = '3M';
const defaultEquity = findEquityBySymbol(DEFAULT_SYMBOL);

interface SecurityFilterPanelProps {
  onSearch: (params: SearchParams) => void;
  loading: boolean;
  meta: StockMeta;
}

export default function SecurityFilterPanel({ onSearch, loading, meta }: SecurityFilterPanelProps): JSX.Element {
  const defaultRange = getDateRange(DEFAULT_PRESET)!;
  const [symbol, setSymbol] = useState<string>(DEFAULT_SYMBOL);
  const [stockName, setStockName] = useState<string>(defaultEquity?.name ?? '');
  const [preset, setPreset] = useState<Preset>(DEFAULT_PRESET);
  const [from, setFrom] = useState<string>(defaultRange.from);
  const [to, setTo] = useState<string>(defaultRange.to);

  const triggerSearch = (nextSymbol: string, nextFrom: string, nextTo: string) => {
    if (nextSymbol && nextFrom && nextTo) {
      onSearch({ symbol: nextSymbol, from: nextFrom, to: nextTo });
    }
  };

  const handleStockChange = (item: EquityItem) => {
    setSymbol(item.symbol);
    setStockName(item.name);
    triggerSearch(item.symbol, from, to);
  };

  const handlePreset = (nextPreset: Preset) => {
    if (nextPreset === 'Custom') {
      setPreset('Custom');
      return;
    }

    if (nextPreset === 'Clear') {
      const range = getDateRange(DEFAULT_PRESET)!;
      setPreset(DEFAULT_PRESET);
      setFrom(range.from);
      setTo(range.to);
      triggerSearch(symbol, range.from, range.to);
      return;
    }

    const range = getDateRange(nextPreset);
    if (!range) return;
    setPreset(nextPreset);
    setFrom(range.from);
    setTo(range.to);
    triggerSearch(symbol, range.from, range.to);
  };

  const handleFromChange = (iso: string) => {
    const api = inputDateToApi(iso);
    setFrom(api);
    setPreset('Custom');
  };

  const handleToChange = (iso: string) => {
    const api = inputDateToApi(iso);
    setTo(api);
    setPreset('Custom');
  };

  const handleGo = () => {
    triggerSearch(symbol, from, to);
  };

  return (
    <section className="security-filter-panel">
      <h2 className="security-filter-title">Security - wise Price Volume Data</h2>

      <StockSearchSelect
        value={symbol}
        stockName={stockName}
        onChange={handleStockChange}
        disabled={loading}
      />

      <div className="preset-buttons" role="group" aria-label="Date range presets">
        {PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            className={`preset-btn ${preset === p ? 'active' : ''}`}
            onClick={() => handlePreset(p)}
            disabled={loading}
          >
            {p}
          </button>
        ))}
      </div>

      <div className="date-range-row">
        <div className="date-input-group">
          <span className="date-input-label">From</span>
          <span className="date-input-value">{from}</span>
          <label className="date-calendar-btn" aria-label="Pick from date">
            <IconCalendar />
            <input
              type="date"
              className="date-picker-overlay"
              value={apiDateToInput(from)}
              onChange={(e) => handleFromChange(e.target.value)}
            />
          </label>
        </div>

        <div className="date-input-group">
          <span className="date-input-label">To</span>
          <span className="date-input-value">{to}</span>
          <label className="date-calendar-btn" aria-label="Pick to date">
            <IconCalendar />
            <input
              type="date"
              className="date-picker-overlay"
              value={apiDateToInput(to)}
              onChange={(e) => handleToChange(e.target.value)}
            />
          </label>
        </div>

        <button
          type="button"
          className="btn-go"
          onClick={handleGo}
          disabled={loading || !symbol}
        >
          GO
        </button>
      </div>

      {meta.symbol && meta.from && meta.to && (
        <p className="data-summary">
          Data for {meta.symbol} - ALL from {meta.from} to {meta.to}
        </p>
      )}
    </section>
  );
}
