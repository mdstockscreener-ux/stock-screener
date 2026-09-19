'use client';

import { useState, useEffect, useCallback } from 'react';
import { todayIstIso } from '@/lib/istDate';

// ── Tab definitions ──────────────────────────────────────────────────────────

type TabId = 'main' | 'sme' | 'etf' | 'price-spurts' | 'volume-spurts';

interface Tab {
  id: TabId;
  label: string;
  hasSortBy: boolean;
}

const TABS: Tab[] = [
  { id: 'main', label: 'Main Board', hasSortBy: true },
  { id: 'sme', label: 'SME', hasSortBy: true },
  { id: 'etf', label: 'ETFs', hasSortBy: false },
  { id: 'price-spurts', label: 'Price Spurts', hasSortBy: false },
  { id: 'volume-spurts', label: 'Volume Spurts', hasSortBy: false },
];

// ── Types ────────────────────────────────────────────────────────────────────

interface SecurityRow {
  symbol: string;
  identifier?: string;
  open?: number;
  dayHigh?: number;
  dayLow?: number;
  previousClose?: number;
  lastPrice?: number;
  pChange?: number;
  totalTradedVolume?: number;
  totalTradedValue?: number;
  quantityTraded?: number;
  exDate?: string | null;
  purpose?: string | null;
  yearHigh?: number;
  yearLow?: number;
  change?: number;
  closePrice?: number;
  lastUpdateTime?: string;
  nav?: number;
}

interface PriceSpurtRow {
  symbol: string;
  series?: string;
  open_price?: number;
  high_price?: number;
  low_price?: number;
  ltp?: number;
  prev_price?: number;
  net_price?: number;
  trade_quantity?: number;
  turnover?: number;
  market_type?: string;
  ca_ex_dt?: string | null;
  ca_purpose?: string | null;
  perChange?: number;
}

interface VolumeSpurtRow {
  symbol: string;
  companyName?: string;
  volume?: number;
  week1AvgVolume?: number;
  week1volChange?: number;
  week2AvgVolume?: number;
  week2volChange?: number;
  ltp?: number;
  pChange?: number;
  turnover?: number;
}

type AnyRow = SecurityRow | PriceSpurtRow | VolumeSpurtRow;

interface ApiResponse {
  data: AnyRow[];
  timestamp?: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtNum(n: number | undefined | null, decimals = 2): string {
  if (n == null || isNaN(n)) return '–';
  return n.toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function fmtInt(n: number | undefined | null): string {
  if (n == null || isNaN(n)) return '–';
  return Math.round(n).toLocaleString('en-IN');
}

function fmtLakhs(n: number | undefined | null): string {
  if (n == null || isNaN(n)) return '–';
  // totalTradedValue comes in rupees; convert to lakhs
  return (n / 1e5).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function nseDateLink(exDate: string | null | undefined): JSX.Element {
  if (!exDate || exDate === '-' || exDate === 'null') {
    return <span className="mae-dash">–</span>;
  }
  return (
    <a
      href={`https://www.nseindia.com/`}
      target="_blank"
      rel="noopener noreferrer"
      className="mae-date-link"
    >
      {exDate}
    </a>
  );
}

function nseSymbolLink(symbol: string): JSX.Element {
  return (
    <a
      href={`https://www.nseindia.com/get-quotes/equity?symbol=${symbol}`}
      target="_blank"
      rel="noopener noreferrer"
      className="mae-symbol-link"
    >
      {symbol}
    </a>
  );
}

function PctChange({ val }: { val: number | undefined | null }): JSX.Element {
  if (val == null) return <span>–</span>;
  const positive = val >= 0;
  return (
    <span className={positive ? 'mae-positive' : 'mae-negative'}>
      {positive ? '+' : ''}
      {fmtNum(val)}
    </span>
  );
}

// ── CSV download ─────────────────────────────────────────────────────────────

function buildCsv(tab: TabId, rows: AnyRow[]): string {
  if (tab === 'main' || tab === 'sme') {
    const headers = ['Symbol', 'Open', 'High', 'Low', 'Prev Close', 'LTP', '%Change', 'Volume', 'Value (Lakhs)', 'CA Date'];
    const lines = [
      headers.join(','),
      ...(rows as SecurityRow[]).map((r) =>
        [
          r.symbol,
          r.open ?? '',
          r.dayHigh ?? '',
          r.dayLow ?? '',
          r.previousClose ?? '',
          r.lastPrice ?? '',
          r.pChange ?? '',
          r.totalTradedVolume ?? '',
          r.totalTradedValue != null ? (r.totalTradedValue / 1e5).toFixed(2) : '',
          r.exDate ?? '',
        ].join(',')
      ),
    ];
    return lines.join('\n');
  }
  if (tab === 'etf') {
    const headers = ['Symbol', 'Open', 'High', 'Low', 'LTP', '%Change', 'Volume', 'Value (Lakhs)', 'NAV'];
    const lines = [
      headers.join(','),
      ...(rows as SecurityRow[]).map((r) =>
        [
          r.symbol,
          r.open ?? '',
          r.dayHigh ?? '',
          r.dayLow ?? '',
          r.lastPrice ?? '',
          r.pChange ?? '',
          r.totalTradedVolume ?? '',
          r.totalTradedValue != null ? (r.totalTradedValue / 1e5).toFixed(2) : '',
          r.nav ?? '',
        ].join(',')
      ),
    ];
    return lines.join('\n');
  }
  if (tab === 'price-spurts') {
    const headers = ['Symbol', 'Series', 'Open', 'High', 'Low', 'Prev Price', 'LTP', 'Net Price %', 'Volume', 'Turnover (Lakhs)'];
    const lines = [
      headers.join(','),
      ...(rows as PriceSpurtRow[]).map((r) =>
        [
          r.symbol,
          r.series ?? '',
          r.open_price ?? '',
          r.high_price ?? '',
          r.low_price ?? '',
          r.prev_price ?? '',
          r.ltp ?? '',
          r.net_price ?? '',
          r.trade_quantity ?? '',
          r.turnover ?? '',
        ].join(',')
      ),
    ];
    return lines.join('\n');
  }
  // volume-spurts
  const headers = ['Symbol', 'Company', 'Today Volume', 'Week Avg Vol', 'Week Change', '2Wk Avg Vol', '2Wk Change', 'LTP', '%Change', 'Value (Lakhs)'];
  const lines = [
    headers.join(','),
    ...(rows as VolumeSpurtRow[]).map((r) =>
      [
        r.symbol,
        `"${r.companyName ?? ''}"`,
        r.volume ?? '',
        r.week1AvgVolume ?? '',
        r.week1volChange ?? '',
        r.week2AvgVolume ?? '',
        r.week2volChange ?? '',
        r.ltp ?? '',
        r.pChange ?? '',
        r.turnover ?? '',
      ].join(',')
    ),
  ];
  return lines.join('\n');
}

function downloadCsv(tab: TabId, rows: AnyRow[]) {
  const csv = buildCsv(tab, rows);
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `most-active-${tab}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Table renderers ──────────────────────────────────────────────────────────

function SecurityTable({ rows }: { rows: SecurityRow[] }): JSX.Element {
  return (
    <table className="mae-table">
      <thead>
        <tr>
          <th className="mae-th mae-th-sym">
            SYMBOL <span className="mae-sort-arrows">⇅</span>
          </th>
          <th className="mae-th mae-th-r">OPEN</th>
          <th className="mae-th mae-th-r">HIGH</th>
          <th className="mae-th mae-th-r">LOW</th>
          <th className="mae-th mae-th-r">PREV.<br />CLOSE</th>
          <th className="mae-th mae-th-r">LTP</th>
          <th className="mae-th mae-th-r">
            %CHANGE <span className="mae-sort-arrow-up">▲</span>
          </th>
          <th className="mae-th mae-th-r">
            VOLUME<br />(shares)
          </th>
          <th className="mae-th mae-th-r">
            VALUE<br />(₹ Lakhs)
          </th>
          <th className="mae-th mae-th-r">
            CA <span className="mae-sort-arrows">⇅</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={10} className="mae-td-empty">No data available.</td>
          </tr>
        ) : (
          rows.map((row, idx) => (
            <tr key={`${row.symbol}-${idx}`} className="mae-row">
              <td className="mae-td mae-td-sym">{nseSymbolLink(row.symbol)}</td>
              <td className="mae-td mae-td-r">{fmtNum(row.open)}</td>
              <td className="mae-td mae-td-r">{fmtNum(row.dayHigh)}</td>
              <td className="mae-td mae-td-r">{fmtNum(row.dayLow)}</td>
              <td className="mae-td mae-td-r">{fmtNum(row.previousClose)}</td>
              <td className="mae-td mae-td-r mae-ltp">{fmtNum(row.lastPrice)}</td>
              <td className="mae-td mae-td-r">
                <PctChange val={row.pChange} />
              </td>
              <td className="mae-td mae-td-r">{fmtInt(row.totalTradedVolume ?? row.quantityTraded)}</td>
              <td className="mae-td mae-td-r">{fmtLakhs(row.totalTradedValue)}</td>
              <td className="mae-td mae-td-r">{nseDateLink(row.exDate)}</td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}

function EtfTable({ rows }: { rows: SecurityRow[] }): JSX.Element {
  return (
    <table className="mae-table">
      <thead>
        <tr>
          <th className="mae-th mae-th-sym">
            SYMBOL <span className="mae-sort-arrows">⇅</span>
          </th>
          <th className="mae-th mae-th-r">OPEN</th>
          <th className="mae-th mae-th-r">HIGH</th>
          <th className="mae-th mae-th-r">LOW</th>
          <th className="mae-th mae-th-r">LTP</th>
          <th className="mae-th mae-th-r">
            %CHANGE <span className="mae-sort-arrow-up">▲</span>
          </th>
          <th className="mae-th mae-th-r">
            VOLUME<br />(shares)
          </th>
          <th className="mae-th mae-th-r">
            VALUE<br />(₹ Lakhs)
          </th>
          <th className="mae-th mae-th-r">NAV</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={9} className="mae-td-empty">No data available.</td>
          </tr>
        ) : (
          rows.map((row, idx) => (
            <tr key={`${row.symbol}-${idx}`} className="mae-row">
              <td className="mae-td mae-td-sym">{nseSymbolLink(row.symbol)}</td>
              <td className="mae-td mae-td-r">{fmtNum(row.open)}</td>
              <td className="mae-td mae-td-r">{fmtNum(row.dayHigh)}</td>
              <td className="mae-td mae-td-r">{fmtNum(row.dayLow)}</td>
              <td className="mae-td mae-td-r mae-ltp">{fmtNum(row.lastPrice)}</td>
              <td className="mae-td mae-td-r">
                <PctChange val={row.pChange} />
              </td>
              <td className="mae-td mae-td-r">{fmtInt(row.totalTradedVolume)}</td>
              <td className="mae-td mae-td-r">{fmtLakhs(row.totalTradedValue)}</td>
              <td className="mae-td mae-td-r">{fmtNum(row.nav)}</td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}

function PriceSpurtsTable({ rows }: { rows: PriceSpurtRow[] }): JSX.Element {
  return (
    <table className="mae-table">
      <thead>
        <tr>
          <th className="mae-th mae-th-sym">
            SYMBOL <span className="mae-sort-arrows">⇅</span>
          </th>
          <th className="mae-th">SERIES</th>
          <th className="mae-th mae-th-r">OPEN</th>
          <th className="mae-th mae-th-r">HIGH</th>
          <th className="mae-th mae-th-r">LOW</th>
          <th className="mae-th mae-th-r">PREV. PRICE</th>
          <th className="mae-th mae-th-r">LTP</th>
          <th className="mae-th mae-th-r">
            NET PRICE (%) <span className="mae-sort-arrow-up">▲</span>
          </th>
          <th className="mae-th mae-th-r">VOLUME</th>
          <th className="mae-th mae-th-r">
            TURNOVER<br />(₹ Lakhs)
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={10} className="mae-td-empty">No data available.</td>
          </tr>
        ) : (
          rows.map((row, idx) => (
            <tr key={`${row.symbol}-${idx}`} className="mae-row">
              <td className="mae-td mae-td-sym">{nseSymbolLink(row.symbol)}</td>
              <td className="mae-td">{row.series ?? '–'}</td>
              <td className="mae-td mae-td-r">{fmtNum(row.open_price)}</td>
              <td className="mae-td mae-td-r">{fmtNum(row.high_price)}</td>
              <td className="mae-td mae-td-r">{fmtNum(row.low_price)}</td>
              <td className="mae-td mae-td-r">{fmtNum(row.prev_price)}</td>
              <td className="mae-td mae-td-r mae-ltp">{fmtNum(row.ltp)}</td>
              <td className="mae-td mae-td-r">
                <PctChange val={row.net_price} />
              </td>
              <td className="mae-td mae-td-r">{fmtInt(row.trade_quantity)}</td>
              <td className="mae-td mae-td-r">{fmtNum(row.turnover)}</td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}

function VolumeSpurtsTable({ rows }: { rows: VolumeSpurtRow[] }): JSX.Element {
  return (
    <table className="mae-table">
      <thead>
        <tr>
          <th className="mae-th mae-th-sym">
            SYMBOL <span className="mae-sort-arrows">⇅</span>
          </th>
          <th className="mae-th mae-th-name">SECURITY NAME</th>
          <th className="mae-th mae-th-r">
            TODAY<br />VOLUME
          </th>
          <th className="mae-th mae-th-r">
            PAST WEEK<br />AVG VOLUME
          </th>
          <th className="mae-th mae-th-r">
            PAST WEEK<br />CHANGE (×)
          </th>
          <th className="mae-th mae-th-r">
            PAST 2WK<br />AVG VOLUME
          </th>
          <th className="mae-th mae-th-r">
            PAST 2WK<br />CHANGE (×)
          </th>
          <th className="mae-th mae-th-r">LTP</th>
          <th className="mae-th mae-th-r">
            %CHANGE <span className="mae-sort-arrow-up">▲</span>
          </th>
          <th className="mae-th mae-th-r">
            VALUE<br />(₹ Lakhs)
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={10} className="mae-td-empty">No data available.</td>
          </tr>
        ) : (
          rows.map((row, idx) => (
            <tr key={`${row.symbol}-${idx}`} className="mae-row">
              <td className="mae-td mae-td-sym">{nseSymbolLink(row.symbol)}</td>
              <td className="mae-td mae-td-name">{row.companyName ?? '–'}</td>
              <td className="mae-td mae-td-r">{fmtInt(row.volume)}</td>
              <td className="mae-td mae-td-r">{fmtInt(row.week1AvgVolume)}</td>
              <td className="mae-td mae-td-r">{row.week1volChange != null ? row.week1volChange.toFixed(2) : '–'}</td>
              <td className="mae-td mae-td-r">{fmtInt(row.week2AvgVolume)}</td>
              <td className="mae-td mae-td-r">{row.week2volChange != null ? row.week2volChange.toFixed(2) : '–'}</td>
              <td className="mae-td mae-td-r mae-ltp">{fmtNum(row.ltp)}</td>
              <td className="mae-td mae-td-r">
                <PctChange val={row.pChange} />
              </td>
              <td className="mae-td mae-td-r">{fmtNum(row.turnover)}</td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function MostActiveEquitiesGrid(): JSX.Element {
  const [activeTab, setActiveTab] = useState<TabId>('main');
  const [sortBy, setSortBy] = useState<'volume' | 'value'>('value');
  const [rows, setRows] = useState<AnyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timestamp, setTimestamp] = useState<string>('');
  const [spinning, setSpinning] = useState(false);
  const [copied, setCopied] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>(() => todayIstIso());

  const copySymbols = useCallback(async () => {
    if (rows.length === 0) return;
    const text = rows.map((r) => (r as { symbol: string }).symbol.toLowerCase()).join(', ');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
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

  const getApiUrl = useCallback(
    (tab: TabId, sort: 'volume' | 'value', date: string): string => {
      switch (tab) {
        case 'main':
          return `/api/most-active/securities?index=${sort}&date=${date}`;
        case 'sme':
          return `/api/most-active/sme?index=${sort}&date=${date}`;
        case 'etf':
          return `/api/most-active/etf?date=${date}`;
        case 'price-spurts':
          return `/api/most-active/price-spurts?date=${date}`;
        case 'volume-spurts':
          return `/api/most-active/volume-spurts?date=${date}`;
      }
    },
    []
  );

  const fetchData = useCallback(
    async (tab: TabId, sort: 'volume' | 'value', date: string) => {
      setSpinning(true);
      setLoading(true);
      setError(null);
      setRows([]);
      try {
        const res = await fetch(getApiUrl(tab, sort, date));
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json: ApiResponse = await res.json();
        setRows(json.data ?? []);
        if (json.timestamp) {
          setTimestamp(json.timestamp);
        } else {
          const now = new Date();
          const d = now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
          const t = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
          setTimestamp(`${d} ${t} IST`);
        }
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Failed to load data');
      } finally {
        setLoading(false);
        setTimeout(() => setSpinning(false), 600);
      }
    },
    [getApiUrl]
  );

  useEffect(() => {
    fetchData(activeTab, sortBy, selectedDate);
  }, [activeTab, sortBy, selectedDate, fetchData]);

  const currentTab = TABS.find((t) => t.id === activeTab)!;

  return (
    <div className="mae-wrapper">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="mae-header">
        <div className="mae-header-left">
          <h1 className="mae-title">Most Active Equities</h1>
          <div className="mae-meta-row">
            <input
              type="date"
              className="mae-date-input"
              value={selectedDate}
              max={todayIstIso()}
              onChange={(e) => setSelectedDate(e.target.value)}
              aria-label="Select date"
            />
            {timestamp && <span className="mae-timestamp">As on {timestamp}</span>}
            <button
              type="button"
              className={`mae-refresh-btn ${spinning ? 'spinning' : ''}`}
              onClick={() => fetchData(activeTab, sortBy, selectedDate)}
              title="Refresh data"
              aria-label="Refresh most active equities data"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 4v6h-6" />
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* ── Tab Bar ─────────────────────────────────────────────────────────── */}
      <div className="mae-tab-bar">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`mae-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Controls row ────────────────────────────────────────────────────── */}
      <div className="mae-controls-row">
        <div className="mae-controls-left">
          {currentTab.hasSortBy && (
            <div className="mae-sortby">
              <span className="mae-sortby-label">Sort By</span>
              <label className="mae-radio-label">
                <input
                  type="radio"
                  name="mae-sortby"
                  value="volume"
                  checked={sortBy === 'volume'}
                  onChange={() => setSortBy('volume')}
                  className="mae-radio"
                />
                Volume
              </label>
              <label className="mae-radio-label mae-radio-active-label">
                <input
                  type="radio"
                  name="mae-sortby"
                  value="value"
                  checked={sortBy === 'value'}
                  onChange={() => setSortBy('value')}
                  className="mae-radio"
                />
                Value
              </label>
            </div>
          )}
        </div>

        <div className="mae-controls-right">
          {/* ── Copy Symbols ── */}
          <button
            type="button"
            className={`mae-copy-btn ${copied ? 'copied' : ''}`}
            onClick={copySymbols}
            disabled={rows.length === 0}
            title={copied ? 'Copied!' : 'Copy symbols as CSV'}
            aria-label="Copy all symbols as comma-separated values"
          >
            {copied ? (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="2" width="6" height="4" rx="1" />
                <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
              </svg>
            )}
            <span>{copied ? 'Copied!' : 'Copy Symbols'}</span>
          </button>

          {/* ── Download CSV ── */}
          <button
            type="button"
            className="mae-download-btn"
            onClick={() => downloadCsv(activeTab, rows)}
            disabled={rows.length === 0}
            title="Download as CSV"
            aria-label="Download data as CSV"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <path d="M9 3h6v6H9z" fill="currentColor" stroke="none" />
              <path d="M12 12v6M9 15l3 3 3-3" />
            </svg>
            Download (.csv)
          </button>
        </div>
      </div>

      {/* ── States ──────────────────────────────────────────────────────────── */}
      {loading && (
        <div className="state-message loading">
          <div className="spinner" />
          <p>Loading data…</p>
        </div>
      )}
      {!loading && error && (
        <div className="state-message empty">
          <p style={{ color: 'var(--negative)' }}>Error: {error}</p>
          <button type="button" className="mae-retry-btn" onClick={() => fetchData(activeTab, sortBy, selectedDate)}>
            Retry
          </button>
        </div>
      )}

      {/* ── Table ───────────────────────────────────────────────────────────── */}
      {!loading && !error && (
        <div className="mae-table-card">
          <div className="mae-table-wrap">
            {(activeTab === 'main' || activeTab === 'sme') && (
              <SecurityTable rows={rows as SecurityRow[]} />
            )}
            {activeTab === 'etf' && (
              <EtfTable rows={rows as SecurityRow[]} />
            )}
            {activeTab === 'price-spurts' && (
              <PriceSpurtsTable rows={rows as PriceSpurtRow[]} />
            )}
            {activeTab === 'volume-spurts' && (
              <VolumeSpurtsTable rows={rows as VolumeSpurtRow[]} />
            )}
          </div>
          {rows.length > 0 && (
            <div className="mae-footer">
              <span>{rows.length} securities</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
