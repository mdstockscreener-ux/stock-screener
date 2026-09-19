'use client';

import { useEffect, useState } from 'react';
import StatsCards from '@/components/StatsCards';
import DataTable from '@/components/DataTable';
import { useStockData } from '@/hooks/useStockData';
import { getDateRange, PRESETS, apiDateToInput, inputDateToApi } from '@/utils/dateRanges';
import type { Preset } from '@/utils/dateRanges';
import { IconCalendar } from '@/components/icons';

/**
 * The home page's (app/page.tsx) Key Metrics + Historical Data, reusing the
 * exact same pieces (useStockData, /api/historical, StatsCards, DataTable) —
 * just with the symbol fixed to whatever's being analyzed on this tab, so
 * looking up delivery/VWAP-based NSE metrics doesn't require a separate
 * trip to the home page. BharatStock has no delivery-quantity or VWAP data,
 * so this is genuinely complementary to the Technical snapshot above, not a
 * duplicate of it.
 */

const DEFAULT_PRESET: Preset = '3M';

interface HistoricalDataPanelProps {
  symbol: string;
}

export default function HistoricalDataPanel({ symbol }: HistoricalDataPanelProps): JSX.Element {
  const { data, loading, error, fetchData } = useStockData();
  const [preset, setPreset] = useState<Preset>(DEFAULT_PRESET);
  const [from, setFrom] = useState<string>(() => getDateRange(DEFAULT_PRESET)!.from);
  const [to, setTo] = useState<string>(() => getDateRange(DEFAULT_PRESET)!.to);
  const [deliveryMultiplier, setDeliveryMultiplier] = useState<number>(3);

  // Re-fetch whenever the analyzed symbol changes, keeping whatever range/preset is currently selected.
  useEffect(() => {
    if (symbol && from && to) {
      fetchData({ symbol, from, to });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol]);

  const triggerFetch = (nextFrom: string, nextTo: string) => {
    setFrom(nextFrom);
    setTo(nextTo);
    fetchData({ symbol, from: nextFrom, to: nextTo });
  };

  const handlePreset = (nextPreset: Preset) => {
    if (nextPreset === 'Custom') {
      setPreset('Custom');
      return;
    }
    if (nextPreset === 'Clear') {
      const range = getDateRange(DEFAULT_PRESET)!;
      setPreset(DEFAULT_PRESET);
      triggerFetch(range.from, range.to);
      return;
    }
    const range = getDateRange(nextPreset);
    if (!range) return;
    setPreset(nextPreset);
    triggerFetch(range.from, range.to);
  };

  const handleFromChange = (iso: string) => {
    setPreset('Custom');
    triggerFetch(inputDateToApi(iso), to);
  };

  const handleToChange = (iso: string) => {
    setPreset('Custom');
    triggerFetch(from, inputDateToApi(iso));
  };

  return (
    <div className="bos-panel">
      <div className="bos-panel-head">
        <div>
          <h2 className="bos-panel-title">Key metrics &amp; historical data</h2>
          <p className="bos-panel-sub">
            NSE price/volume/delivery history for {symbol} — the same data and metrics as the
            Security-wise Price Volume Data page, scoped to this symbol.
          </p>
        </div>
      </div>

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
      </div>

      {loading && (
        <div className="state-message loading">
          <div className="spinner" />
          <p>Fetching data from NSE India…</p>
        </div>
      )}

      {!loading && error && (
        <div className="state-message error">
          <p>{error}</p>
        </div>
      )}

      {!loading && !error && data.length > 0 && (
        <>
          <div className="sa-metrics-grid" style={{ marginBottom: '1rem' }}>
            <label className="sa-metric-tile" style={{ cursor: 'text' }}>
              <span className="sa-metric-label">High delivery multiplier</span>
              <input
                type="number"
                min="1"
                step="1"
                value={deliveryMultiplier}
                onChange={(e) => {
                  const next = parseInt(e.target.value, 10);
                  setDeliveryMultiplier(Number.isFinite(next) && next > 0 ? next : 3);
                }}
                aria-label="High delivery multiplier"
                className="bt-input"
              />
            </label>
          </div>
          <StatsCards data={data} deliveryMultiplier={deliveryMultiplier} />
          <div style={{ marginTop: '1.25rem' }}>
            <DataTable data={data} deliveryMultiplier={deliveryMultiplier} />
          </div>
        </>
      )}

      {!loading && !error && data.length === 0 && (
        <div className="state-message empty">
          <p>No data for this range.</p>
        </div>
      )}
    </div>
  );
}
