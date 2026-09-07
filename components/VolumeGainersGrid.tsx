'use client';

import { useState, useEffect, useCallback } from 'react';

// ── Types ────────────────────────────────────────────────────────────────────

interface VolumeGainerRow {
  symbol: string;
  companyName: string;
  // Today
  volume: number;
  // Past week
  week1AvgVolume: number;
  week1volChange: number;
  // Past 2 weeks
  week2AvgVolume: number;
  week2volChange: number;
  // Today price
  ltp: number;
  pChange: number;
  turnover: number;
}

interface ApiResponse {
  data: VolumeGainerRow[];
  timestamp?: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtInt(n: number): string {
  return Math.round(n).toLocaleString('en-IN');
}

function fmtPrice(n: number): string {
  return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtTimes(n: number): string {
  return n.toFixed(2);
}

function downloadCsv(rows: VolumeGainerRow[], filename = 'volume-gainers.csv') {
  const headers = [
    'Symbol',
    'Security Name',
    'Today Volume',
    'Past Week Avg Volume',
    'Past Week Change (No. of times)',
    'Past 2 Weeks Avg Volume',
    'Past 2 Weeks Change (No. of times)',
    'LTP',
    '% Change',
    'Value (₹ Lakhs)',
  ];
  const lines = [
    headers.join(','),
    ...rows.map((r) =>
      [
        r.symbol,
        `"${r.companyName}"`,
        r.volume,
        r.week1AvgVolume,
        r.week1volChange,
        r.week2AvgVolume,
        r.week2volChange,
        r.ltp,
        r.pChange,
        r.turnover,
      ].join(',')
    ),
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function VolumeGainersGrid(): JSX.Element {
  const [rows, setRows] = useState<VolumeGainerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timestamp, setTimestamp] = useState<string>('');
  const [spinning, setSpinning] = useState(false);
  const [copied, setCopied] = useState(false);

  const copySymbols = useCallback(async () => {
    if (rows.length === 0) return;
    const text = rows.map((r) => r.symbol.toLowerCase()).join(', ');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback for older browsers
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [rows]);

  const fetchData = useCallback(async () => {
    setSpinning(true);
    setError(null);
    try {
      const res = await fetch('/api/volume-gainers');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: ApiResponse = await res.json();
      setRows(json.data ?? []);
      // Build a display timestamp
      const now = new Date();
      const datePart = now.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
      const timePart = now.toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });
      setTimestamp(`${datePart} ${timePart} IST`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load data');
    } finally {
      setLoading(false);
      setTimeout(() => setSpinning(false), 600);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div className="vg-wrapper">
      {/* ── Header bar ─────────────────────────────────────────────────────── */}
      <div className="vg-topbar">
        <div className="vg-topbar-left">
          <h1 className="vg-title">Volume Gainers</h1>
          {timestamp && (
            <div className="vg-meta-row">
              <span className="vg-timestamp">As on {timestamp}</span>
              <button
                type="button"
                className={`vg-refresh-btn ${spinning ? 'spinning' : ''}`}
                onClick={fetchData}
                title="Refresh data"
                aria-label="Refresh volume gainers data"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M23 4v6h-6" />
                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                </svg>
              </button>
            </div>
          )}
        </div>

        <div className="vg-topbar-right">
          {/* ── Copy symbols ── */}
          <button
            type="button"
            className={`vg-copy-btn ${copied ? 'copied' : ''}`}
            onClick={copySymbols}
            disabled={rows.length === 0}
            title={copied ? 'Copied!' : 'Copy symbols as CSV'}
            aria-label="Copy all symbols as comma-separated values"
          >
            {copied ? (
              /* Checkmark */
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              /* Clipboard */
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="2" width="6" height="4" rx="1" />
                <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
              </svg>
            )}
            <span>{copied ? 'Copied!' : 'Copy Symbols'}</span>
          </button>
          <button
            type="button"
            className="vg-download-btn"
            onClick={() => downloadCsv(rows)}
            disabled={rows.length === 0}
            title="Download as CSV"
          >
            <span className="vg-download-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="12" y1="12" x2="12" y2="18" />
                <polyline points="9 15 12 18 15 15" />
              </svg>
            </span>
            Download (.csv)
          </button>
        </div>
      </div>

      {/* ── States ─────────────────────────────────────────────────────────── */}
      {loading && (
        <div className="state-message loading">
          <div className="spinner" />
          <p>Loading volume gainers…</p>
        </div>
      )}

      {!loading && error && (
        <div className="state-message empty">
          <p style={{ color: 'var(--negative)' }}>Error: {error}</p>
          <button type="button" className="vg-retry-btn" onClick={fetchData}>
            Retry
          </button>
        </div>
      )}

      {/* ── Grid ───────────────────────────────────────────────────────────── */}
      {!loading && !error && (
        <div className="vg-table-card">
          <div className="vg-table-wrap">
            <table className="vg-table">
              <thead>
                {/* Row 1 — group labels */}
                <tr className="vg-thead-group">
                  <th rowSpan={2} className="vg-th vg-th-symbol">SYMBOL</th>
                  <th rowSpan={2} className="vg-th vg-th-name">SECURITY NAME</th>
                  <th colSpan={1} className="vg-th vg-th-group-today">TODAY</th>
                  <th colSpan={2} className="vg-th vg-th-group-week">PAST WEEK</th>
                  <th colSpan={2} className="vg-th vg-th-group-fortnight">PAST 2 WEEKS</th>
                  <th colSpan={3} className="vg-th vg-th-group-today2">TODAY</th>
                </tr>
                {/* Row 2 — column labels */}
                <tr className="vg-thead-cols">
                  <th className="vg-th vg-th-r">VOLUME</th>
                  <th className="vg-th vg-th-r">AVERAGE<br />VOLUME</th>
                  <th className="vg-th vg-th-r">CHANGE<br />(No. of times)</th>
                  <th className="vg-th vg-th-r">AVERAGE<br />VOLUME</th>
                  <th className="vg-th vg-th-r">CHANGE<br />(No. of times)</th>
                  <th className="vg-th vg-th-r">LTP</th>
                  <th className="vg-th vg-th-r">% CHANGE</th>
                  <th className="vg-th vg-th-r">VALUE<br />(₹ Lakhs)</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="vg-td-empty">No data available.</td>
                  </tr>
                ) : (
                  rows.map((row, idx) => (
                    <tr key={`${row.symbol}-${idx}`} className="vg-row">
                      <td className="vg-td vg-td-symbol">
                        <a
                          href={`https://www.nseindia.com/get-quotes/equity?symbol=${row.symbol}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="vg-symbol-link"
                        >
                          {row.symbol}
                        </a>
                      </td>
                      <td className="vg-td vg-td-name">{row.companyName}</td>
                      <td className="vg-td vg-td-r">{fmtInt(row.volume)}</td>
                      <td className="vg-td vg-td-r">{fmtInt(row.week1AvgVolume)}</td>
                      <td className="vg-td vg-td-r">{fmtTimes(row.week1volChange)}</td>
                      <td className="vg-td vg-td-r">{fmtInt(row.week2AvgVolume)}</td>
                      <td className="vg-td vg-td-r">{fmtTimes(row.week2volChange)}</td>
                      <td className="vg-td vg-td-r vg-ltp">{fmtPrice(row.ltp)}</td>
                      <td className={`vg-td vg-td-r ${row.pChange >= 0 ? 'vg-positive' : 'vg-negative'}`}>
                        {row.pChange >= 0 ? '+' : ''}{fmtTimes(row.pChange)}
                      </td>
                      <td className="vg-td vg-td-r">{fmtPrice(row.turnover)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {rows.length > 0 && (
            <div className="vg-footer">
              <span>{rows.length} securities</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
