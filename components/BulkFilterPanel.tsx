'use client';

import { useState } from 'react';
import { getDateRange, PRESETS, apiDateToInput, inputDateToApi } from '@/utils/dateRanges';
import type { Preset } from '@/utils/dateRanges';
import { IconCalendar } from '@/components/icons';

const DEFAULT_PRESET: Preset = '3M';

interface BulkFilterPanelProps {
  onSearch: (params: { symbols: string[]; from: string; to: string; deliveryMultiplier: number }) => void;
  loading: boolean;
}

export default function BulkFilterPanel({ onSearch, loading }: BulkFilterPanelProps): JSX.Element {
  const defaultRange = getDateRange(DEFAULT_PRESET)!;

  const [rawInput, setRawInput] = useState('');
  const [preset, setPreset] = useState<Preset>(DEFAULT_PRESET);
  const [from, setFrom] = useState(defaultRange.from);
  const [to, setTo] = useState(defaultRange.to);
  const [deliveryMultiplier, setDeliveryMultiplier] = useState(3);

  const parseSymbols = (raw: string): string[] =>
    raw
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);

  const handlePreset = (p: Preset) => {
    if (p === 'Custom') {
      setPreset('Custom');
      return;
    }
    if (p === 'Clear') {
      const range = getDateRange(DEFAULT_PRESET)!;
      setPreset(DEFAULT_PRESET);
      setFrom(range.from);
      setTo(range.to);
      return;
    }
    const range = getDateRange(p);
    if (!range) return;
    setPreset(p);
    setFrom(range.from);
    setTo(range.to);
  };

  const handleGo = () => {
    const symbols = parseSymbols(rawInput);
    if (!symbols.length) return;
    onSearch({ symbols, from, to, deliveryMultiplier });
  };

  const symbolCount = parseSymbols(rawInput).length;
  const canGo = symbolCount > 0 && from && to;

  return (
    <section className="security-filter-panel">
      <h2 className="security-filter-title">Bulk – Security-wise Price Volume Data</h2>

      {/* Multi-stock input */}
      <div className="bulk-symbol-row">
        <label htmlFor="bulk-symbols-input" className="stock-search-label">
          Stock Symbols <span className="bulk-symbol-hint">(comma-separated, e.g. RELIANCE, TCS, INFY)</span>
        </label>
        <div className={`bulk-symbol-input-wrap ${rawInput.trim() ? 'has-value' : ''}`}>
          <input
            id="bulk-symbols-input"
            type="text"
            value={rawInput}
            onChange={(e) => setRawInput(e.target.value)}
            placeholder="RELIANCE, TCS, INFY, HDFCBANK…"
            disabled={loading}
            autoComplete="off"
            spellCheck={false}
            className="bulk-symbol-input"
          />
          {symbolCount > 0 && (
            <span className="bulk-symbol-badge">{symbolCount} stock{symbolCount > 1 ? 's' : ''}</span>
          )}
        </div>
      </div>

      {/* Date presets */}
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

      {/* Date range row */}
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
              onChange={(e) => { setFrom(inputDateToApi(e.target.value)); setPreset('Custom'); }}
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
              onChange={(e) => { setTo(inputDateToApi(e.target.value)); setPreset('Custom'); }}
            />
          </label>
        </div>

        {/* Delivery multiplier */}
        <label className="metrics-threshold" style={{ marginLeft: 'auto' }}>
          High delivery &gt;
          <input
            type="number"
            min="1"
            step="1"
            value={deliveryMultiplier}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              setDeliveryMultiplier(Number.isFinite(v) && v > 0 ? v : 3);
            }}
            aria-label="High delivery multiplier"
            disabled={loading}
          />
          × avg qty
        </label>

        <button
          type="button"
          className="btn-go"
          onClick={handleGo}
          disabled={loading || !canGo}
        >
          GO
        </button>
      </div>
    </section>
  );
}
