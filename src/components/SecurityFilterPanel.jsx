import { useState } from 'react';
import StockSearchSelect from './StockSearchSelect';
import { getDateRange, PRESETS, apiDateToInput, inputDateToApi } from '../utils/dateRanges';
import { IconCalendar } from './icons';

import { findEquityBySymbol } from '../utils/equitySearch';

const DEFAULT_SYMBOL = 'DEEPAKNTR';
const DEFAULT_PRESET = '3M';
const defaultEquity = findEquityBySymbol(DEFAULT_SYMBOL);

export default function SecurityFilterPanel({ onSearch, loading, meta }) {
  const defaultRange = getDateRange(DEFAULT_PRESET);
  const [symbol, setSymbol] = useState(DEFAULT_SYMBOL);
  const [stockName, setStockName] = useState(defaultEquity?.name ?? '');
  const [preset, setPreset] = useState(DEFAULT_PRESET);
  const [from, setFrom] = useState(defaultRange.from);
  const [to, setTo] = useState(defaultRange.to);

  const triggerSearch = (nextSymbol, nextFrom, nextTo) => {
    if (nextSymbol && nextFrom && nextTo) {
      onSearch({ symbol: nextSymbol, from: nextFrom, to: nextTo });
    }
  };

  const handleStockChange = ({ symbol: nextSymbol, name }) => {
    setSymbol(nextSymbol);
    setStockName(name);
    triggerSearch(nextSymbol, from, to);
  };

  const handlePreset = (nextPreset) => {
    if (nextPreset === 'Custom') {
      setPreset('Custom');
      return;
    }

    if (nextPreset === 'Clear') {
      const range = getDateRange(DEFAULT_PRESET);
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

  const handleFromChange = (iso) => {
    const api = inputDateToApi(iso);
    setFrom(api);
    setPreset('Custom');
  };

  const handleToChange = (iso) => {
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
