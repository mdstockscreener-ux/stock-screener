'use client';

import { useState } from 'react';
import { formatPrice, formatNumber } from '@/utils/formatters';
import type { BulkFetchResult } from '@/hooks/useBulkStockData';
import type { StockRecord } from '@/types';

interface RowMetrics {
  symbol: string;
  error?: string;
  periodChange: number | null;
  periodChangePct: number | null;
  periodHigh: number | null;
  periodLow: number | null;
  avgDeliveryQty: number | null;
  highDeliveryDayCount: number | null;
  avgVwapHighDelivery: number | null;
  within10Pct: boolean | null;
  vwapChangePct: number | null;
  deliveryAmount: number | null;
}

function computeRow(result: BulkFetchResult, deliveryMultiplier: number): RowMetrics {
  const { symbol, data, error } = result;

  if (error || !data.length) {
    return {
      symbol,
      error: error ?? 'No data',
      periodChange: null,
      periodChangePct: null,
      periodHigh: null,
      periodLow: null,
      avgDeliveryQty: null,
      highDeliveryDayCount: null,
      avgVwapHighDelivery: null,
      within10Pct: null,
      vwapChangePct: null,
      deliveryAmount: null,
    };
  }

  const latest = data[data.length - 1];
  const first = data[0];
  const periodChange = latest.close - first.close;
  const periodChangePct = (periodChange / first.close) * 100;
  const periodHigh = Math.max(...data.map((d: StockRecord) => d.high));
  const periodLow = Math.min(...data.map((d: StockRecord) => d.low));

  const avgDeliveryQty =
    data.reduce((s: number, d: StockRecord) => s + d.deliveryQty, 0) / data.length;
  const threshold = deliveryMultiplier * avgDeliveryQty;
  const highDeliveryDays = data.filter((d: StockRecord) => d.deliveryQty > threshold);
  const highDeliveryDayCount = highDeliveryDays.length;

  const avgVwapHighDelivery =
    highDeliveryDayCount > 0
      ? highDeliveryDays.reduce((s: number, d: StockRecord) => s + d.vwap, 0) / highDeliveryDayCount
      : null;

  const vwapChangePct =
    avgVwapHighDelivery !== null
      ? ((latest.close - avgVwapHighDelivery) / avgVwapHighDelivery) * 100
      : null;
  const within10Pct = vwapChangePct !== null ? Math.abs(vwapChangePct) <= 10 : null;

  // Sum of (deliveryQty × vwap) for each high-delivery day
  const deliveryAmount =
    highDeliveryDayCount > 0
      ? highDeliveryDays.reduce(
          (s: number, d: StockRecord) => s + d.deliveryQty * d.vwap,
          0
        )
      : null;

  return {
    symbol,
    periodChange,
    periodChangePct,
    periodHigh,
    periodLow,
    avgDeliveryQty,
    highDeliveryDayCount,
    avgVwapHighDelivery,
    within10Pct,
    vwapChangePct,
    deliveryAmount,
  };
}

const PRESETS = [
  { label: 'All', value: 0 },
  { label: '≥ 1', value: 1 },
  { label: '≥ 2', value: 2 },
  { label: '≥ 3', value: 3 },
  { label: '≥ 5', value: 5 },
];

interface BulkStatsGridProps {
  results: BulkFetchResult[];
  deliveryMultiplier: number;
}

export default function BulkStatsGrid({
  results,
  deliveryMultiplier,
}: BulkStatsGridProps): JSX.Element {
  const [minDays, setMinDays] = useState(0);
  const [inputVal, setInputVal] = useState('');

  const rows = results.map((r) => computeRow(r, deliveryMultiplier));

  const visibleRows = rows.filter((row) => {
    if (row.error) return true; // always show error rows
    return (row.highDeliveryDayCount ?? 0) >= minDays;
  });

  const passCount = rows.filter(
    (r) => !r.error && (r.highDeliveryDayCount ?? 0) >= minDays
  ).length;
  const totalCount = rows.filter((r) => !r.error).length;

  function applyPreset(val: number) {
    setMinDays(val);
    setInputVal(val === 0 ? '' : String(val));
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    setInputVal(raw);
    const parsed = parseInt(raw, 10);
    if (!isNaN(parsed) && parsed >= 0) {
      setMinDays(parsed);
    } else if (raw === '' || raw === '0') {
      setMinDays(0);
    }
  }

  return (
    <div className="bulk-grid-wrapper">
      {/* ── Filter bar ── */}
      <div className="bulk-filter-bar">
        <span className="bulk-filter-label">
          Filter by High Delivery Days
        </span>

        <div className="bulk-filter-presets">
          {PRESETS.map((p) => (
            <button
              key={p.value}
              className={`bulk-preset-chip${minDays === p.value ? ' active' : ''}`}
              onClick={() => applyPreset(p.value)}
              type="button"
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="bulk-filter-custom">
          <span className="bulk-filter-label">min ≥</span>
          <input
            id="bulk-hdd-min"
            type="number"
            min={0}
            value={inputVal}
            onChange={handleInputChange}
            placeholder="0"
            className="bulk-hdd-input"
          />
          <span className="bulk-filter-label">days</span>
        </div>

        <span className="bulk-filter-count">
          {passCount} / {totalCount} stock{totalCount !== 1 ? 's' : ''}
        </span>
      </div>

      {/* ── Table ── */}
      <div className="table-card">
        <div className="table-wrap">
          <table className="historical-table bulk-metrics-table">
            <thead>
              <tr>
                <th className="align-left">Stock Name</th>
                <th className="align-right">Period Change</th>
                <th className="align-right">Period High / Low</th>
                <th className="align-right">Avg Delivery Qty</th>
                <th className="align-right bulk-hdd-col">
                  High Delivery Days
                  {minDays > 0 && (
                    <span className="bulk-hdd-active-badge">≥ {minDays}</span>
                  )}
                </th>
                <th className="align-right">Avg VWAP (High Delivery)</th>
                <th className="align-right">Delivery Amount</th>
                <th className="align-right">Within 10% of CMP</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="bulk-empty-row">
                    No stocks match — High Delivery Days ≥ {minDays}
                  </td>
                </tr>
              ) : (
                visibleRows.map((row) => {
                  if (row.error) {
                    return (
                      <tr key={row.symbol} className="bulk-row-error">
                        <td className="align-left date-cell">{row.symbol}</td>
                        <td colSpan={7} className="bulk-error-cell">
                          {row.error}
                        </td>
                      </tr>
                    );
                  }

                  const changePositive = (row.periodChange ?? 0) >= 0;

                  return (
                    <tr key={row.symbol}>
                      {/* Stock Name */}
                      <td className="align-left date-cell bulk-symbol-cell">
                        {row.symbol}
                      </td>

                      {/* Period Change */}
                      <td
                        className={`align-right num-cell ${
                          changePositive ? 'cell-positive' : 'cell-negative'
                        }`}
                      >
                        {row.periodChange !== null ? (
                          <>
                            <span className="cell-main">
                              {changePositive ? '+' : ''}
                              {row.periodChange.toFixed(2)}
                            </span>
                            <span className="cell-sub">
                              {changePositive ? '+' : ''}
                              {row.periodChangePct!.toFixed(2)}%
                            </span>
                          </>
                        ) : (
                          '—'
                        )}
                      </td>

                      {/* Period High / Low */}
                      <td className="align-right num-cell">
                        {row.periodHigh !== null ? (
                          <>
                            <span className="cell-main cell-high">
                              {formatPrice(row.periodHigh)}
                            </span>
                            <span className="cell-sub">
                              ↓ {formatPrice(row.periodLow!)}
                            </span>
                          </>
                        ) : (
                          '—'
                        )}
                      </td>

                      {/* Avg Delivery Qty */}
                      <td className="align-right num-cell">
                        {row.avgDeliveryQty !== null
                          ? formatNumber(Math.round(row.avgDeliveryQty))
                          : '—'}
                      </td>

                      {/* High Delivery Days */}
                      <td className="align-right num-cell bulk-hdd-col">
                        {row.highDeliveryDayCount !== null ? (
                          <>
                            <span className="cell-main">{row.highDeliveryDayCount}</span>
                            <span className="cell-sub">&gt;{deliveryMultiplier}× avg</span>
                          </>
                        ) : (
                          '—'
                        )}
                      </td>

                      {/* Avg VWAP (High Delivery) */}
                      <td className="align-right num-cell">
                        {row.avgVwapHighDelivery !== null
                          ? formatPrice(row.avgVwapHighDelivery)
                          : '—'}
                      </td>

                      {/* Delivery Amount */}
                      <td className="align-right num-cell">
                        {row.deliveryAmount !== null ? (
                          <>
                            <span className="cell-main">
                              ₹{formatNumber(Math.round(row.deliveryAmount))}
                            </span>
                            <span className="cell-sub">sum · high del. days</span>
                          </>
                        ) : (
                          '—'
                        )}
                      </td>

                      {/* Within 10% of CMP */}
                      <td className="align-right num-cell">
                        {row.within10Pct === null ? (
                          <span className="cell-sub">—</span>
                        ) : (
                          <>
                            <span
                              className={`bulk-badge ${
                                row.within10Pct ? 'bulk-badge-yes' : 'bulk-badge-no'
                              }`}
                            >
                              {row.within10Pct ? 'Yes' : 'No'}
                            </span>
                            {row.vwapChangePct !== null && (
                              <span
                                className={`cell-sub ${
                                  row.vwapChangePct >= 0 ? 'cell-positive' : 'cell-negative'
                                }`}
                              >
                                {row.vwapChangePct >= 0 ? '+' : ''}
                                {row.vwapChangePct.toFixed(2)}%
                              </span>
                            )}
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
