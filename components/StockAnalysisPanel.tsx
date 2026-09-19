'use client';

import { useState } from 'react';
import CandlestickChart from '@/components/CandlestickChart';
import HistoricalDataPanel from '@/components/HistoricalDataPanel';
import NewsPanel from '@/components/NewsPanel';
import StockAnalysisSearch from '@/components/StockAnalysisSearch';
import type { AnalyzeResponse } from '@/types/fundamentals';
import type { TechnicalsResponse } from '@/types/technicals';
import type { NewsResponse } from '@/types/news';
import type { TrendStatus } from '@/utils/technicals';
import type { EquityItem } from '@/types';

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtNum(n: number | null | undefined, digits = 2): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toLocaleString('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function fmtPct(n: number | null | undefined, digits = 1): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `${n >= 0 ? '+' : ''}${n.toFixed(digits)}%`;
}

/** metrics.marketCap etc. — BharatStock already returns these in Crores (per its own docs), so no scaling here. */
function fmtCr(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })} Cr`;
}

/** Financial-statement line items (revenue, netProfit, ...) — BharatStock returns these in absolute rupees, so divide by 1 crore before display. */
function fmtRupeesAsCr(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `₹${(n / 1e7).toLocaleString('en-IN', { maximumFractionDigits: 0 })} Cr`;
}

function fmtQuarterLabel(q: { quarter: string | null; fiscalYear: string; periodEndDate: string | null }): string {
  if (q.periodEndDate) {
    const d = new Date(q.periodEndDate);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
    }
  }
  return q.quarter ?? q.fiscalYear;
}

function pctClass(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '';
  return n >= 0 ? 'sa-positive' : 'sa-negative';
}

function trendClass(status: TrendStatus): string {
  if (status === 'uptrend') return 'sa-positive';
  if (status === 'downtrend') return 'sa-negative';
  return '';
}

function trendLabel(status: TrendStatus): string {
  switch (status) {
    case 'uptrend':
      return 'Uptrend';
    case 'downtrend':
      return 'Downtrend';
    case 'mixed':
      return 'Mixed';
    default:
      return 'Unknown';
  }
}

function positionLabel(position: string | null): string {
  switch (position) {
    case 'upper-third':
      return 'Upper third of 52w range';
    case 'lower-third':
      return 'Lower third of 52w range';
    case 'middle-third':
      return 'Middle third of 52w range';
    default:
      return '—';
  }
}

// ── Component ────────────────────────────────────────────────────────────────

export default function StockAnalysisPanel(): JSX.Element {
  const [symbolInput, setSymbolInput] = useState('');
  const [stockNameInput, setStockNameInput] = useState('');
  // Raw text currently in the search box — used only to tell "typed but never
  // selected a result" apart from "a result is confirmed", so Analyze can't
  // silently re-run a stale symbol after a search that found nothing.
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AnalyzeResponse | null>(null);
  const [technicals, setTechnicals] = useState<TechnicalsResponse | null>(null);
  const [technicalsError, setTechnicalsError] = useState<string | null>(null);
  const [news, setNews] = useState<NewsResponse | null>(null);
  const [newsError, setNewsError] = useState<string | null>(null);

  const runAnalysis = async (symbolOverride?: string) => {
    // Only guard the button/Enter path (no override) — a search selection always
    // passes its symbol explicitly, so it can never trip this.
    if (symbolOverride === undefined) {
      const typed = searchQuery.trim();
      const isUnselected = typed !== '' && typed.toUpperCase() !== symbolInput.trim().toUpperCase();
      if (isUnselected) {
        setError(
          `"${typed}" wasn't selected from the search results — pick a match from the dropdown first.`
        );
        return;
      }
    }

    const symbol = (symbolOverride ?? symbolInput).trim().toUpperCase();
    if (!symbol) {
      setError('Enter a symbol to analyze.');
      return;
    }

    setLoading(true);
    setError(null);
    setTechnicalsError(null);
    setNewsError(null);

    const [fundamentalsResult, technicalsResult, newsResult] = await Promise.allSettled([
      fetch(`/api/analyze/${encodeURIComponent(symbol)}`).then(async (res) => ({
        ok: res.ok,
        status: res.status,
        body: await res.json(),
      })),
      fetch(`/api/technicals/${encodeURIComponent(symbol)}`).then(async (res) => ({
        ok: res.ok,
        status: res.status,
        body: await res.json(),
      })),
      fetch(`/api/news/${encodeURIComponent(symbol)}`).then(async (res) => ({
        ok: res.ok,
        status: res.status,
        body: await res.json(),
      })),
    ]);

    if (fundamentalsResult.status === 'fulfilled' && fundamentalsResult.value.ok) {
      setData(fundamentalsResult.value.body as AnalyzeResponse);
    } else {
      setData(null);
      const message =
        fundamentalsResult.status === 'fulfilled'
          ? fundamentalsResult.value.body?.error ?? `The request failed (${fundamentalsResult.value.status}).`
          : fundamentalsResult.reason instanceof Error
            ? fundamentalsResult.reason.message
            : String(fundamentalsResult.reason);
      setError(message);
    }

    // The technical panel is a secondary section — a failure here shouldn't hide fundamentals.
    if (technicalsResult.status === 'fulfilled' && technicalsResult.value.ok) {
      setTechnicals(technicalsResult.value.body as TechnicalsResponse);
    } else {
      setTechnicals(null);
      const message =
        technicalsResult.status === 'fulfilled'
          ? technicalsResult.value.body?.error ?? `The request failed (${technicalsResult.value.status}).`
          : technicalsResult.reason instanceof Error
            ? technicalsResult.reason.message
            : String(technicalsResult.reason);
      setTechnicalsError(message);
    }

    // Same isolation as technicals — a news failure shouldn't hide fundamentals.
    if (newsResult.status === 'fulfilled' && newsResult.value.ok) {
      setNews(newsResult.value.body as NewsResponse);
    } else {
      setNews(null);
      const message =
        newsResult.status === 'fulfilled'
          ? newsResult.value.body?.error ?? `The request failed (${newsResult.value.status}).`
          : newsResult.reason instanceof Error
            ? newsResult.reason.message
            : String(newsResult.reason);
      setNewsError(message);
    }

    setLoading(false);
  };

  const handleStockSelect = (item: EquityItem) => {
    setSymbolInput(item.symbol);
    setStockNameInput(item.name);
    setSearchQuery('');
    runAnalysis(item.symbol);
  };

  const detail = data?.stockDetail;
  const metrics = detail?.metrics;
  const price = detail?.latestPrice;
  // Most-recent-first from the API; oldest-to-newest reads left-to-right, matching how a trend is normally scanned.
  const quartersAsc = data ? [...data.quarterlyGrowth].reverse() : [];

  return (
    <div>
      <section className="bos-header">
        <div>
          <h1 className="bos-title">Stock Analysis</h1>
          <p className="bos-subtitle">
            Fundamentals for one symbol — valuation ratios, self PE history, sector peer
            comparison, and quarterly QoQ/YoY growth — sourced from BharatStock and cached in
            Supabase for the rest of the day.
          </p>
        </div>
      </section>

      <form
        className="bos-panel"
        onSubmit={(e) => {
          e.preventDefault();
          runAnalysis();
        }}
      >
        <div className="bos-panel-head">
          <div>
            <h2 className="bos-panel-title">Look up a stock</h2>
            <p className="bos-panel-sub">Search by company name or symbol, e.g. Reliance, TCS, INFY.</p>
          </div>
          <div className="bos-panel-head-right">
            <button type="submit" className="bos-btn-primary" disabled={loading}>
              {loading ? 'Analyzing…' : 'Analyze'}
            </button>
          </div>
        </div>

        <StockAnalysisSearch
          value={symbolInput}
          stockName={stockNameInput}
          onChange={handleStockSelect}
          onQueryChange={setSearchQuery}
          disabled={loading}
        />
      </form>

      {loading && (
        <div className="state-message loading">
          <div className="spinner" />
          <p>Fetching fundamentals…</p>
        </div>
      )}

      {!loading && error && (
        <div className="state-message error">
          <p>{error}</p>
        </div>
      )}

      {!loading && !error && !data && (
        <div className="state-message empty">
          <p>Enter a symbol above to see its fundamentals.</p>
        </div>
      )}

      {!loading && !error && data && detail && (
        <>
          {/* ── Company overview ── */}
          <div className="bos-panel">
            <div className="bos-panel-head">
              <div>
                <h2 className="bos-panel-title">
                  {detail.companyName} <span className="sa-muted">({detail.symbol})</span>
                </h2>
                <p className="bos-panel-sub">
                  {detail.sector ?? 'Sector unknown'} · {detail.exchange}
                </p>
              </div>
              <div className="bos-panel-head-right">
                <span className="sa-price">₹{fmtNum(price?.close)}</span>
              </div>
            </div>

            <div className="sa-metrics-grid">
              <div className="sa-metric-tile">
                <span className="sa-metric-label">52w High</span>
                <span className="sa-metric-value">{fmtNum(metrics?.high52w)}</span>
              </div>
              <div className="sa-metric-tile">
                <span className="sa-metric-label">52w Low</span>
                <span className="sa-metric-value">{fmtNum(metrics?.low52w)}</span>
              </div>
              <div className="sa-metric-tile">
                <span className="sa-metric-label">From 52w High</span>
                <span className={`sa-metric-value ${pctClass(metrics?.distanceFrom52wHighPct)}`}>
                  {fmtPct(metrics?.distanceFrom52wHighPct)}
                </span>
              </div>
              <div className="sa-metric-tile">
                <span className="sa-metric-label">From 52w Low</span>
                <span className={`sa-metric-value ${pctClass(metrics?.distanceFrom52wLowPct)}`}>
                  {fmtPct(metrics?.distanceFrom52wLowPct)}
                </span>
              </div>
              <div className="sa-metric-tile">
                <span className="sa-metric-label">Market Cap</span>
                <span className="sa-metric-value">{fmtCr(metrics?.marketCap)}</span>
              </div>
            </div>
          </div>

          {/* ── Technical snapshot ── */}
          <div className="bos-panel">
            <div className="bos-panel-head">
              <div>
                <h2 className="bos-panel-title">Technical snapshot</h2>
                <p className="bos-panel-sub">
                  52-week range, trend (SMA-50/SMA-200), and momentum (RSI-14) — computed
                  server-side by BharatStock.
                </p>
              </div>
            </div>

            {technicalsError && <p className="sa-muted">Technicals unavailable: {technicalsError}</p>}

            {technicals && (
              <>
                <div className="sa-metrics-grid">
                  <div className="sa-metric-tile">
                    <span className="sa-metric-label">52w High</span>
                    <span className="sa-metric-value">{fmtNum(technicals.range.high52w)}</span>
                    <span className="sa-metric-sub">{technicals.range.high52wDate ?? '—'}</span>
                  </div>
                  <div className="sa-metric-tile">
                    <span className="sa-metric-label">52w Low</span>
                    <span className="sa-metric-value">{fmtNum(technicals.range.low52w)}</span>
                    <span className="sa-metric-sub">{technicals.range.low52wDate ?? '—'}</span>
                  </div>
                  <div className="sa-metric-tile">
                    <span className="sa-metric-label">Range Position</span>
                    <span className="sa-metric-value">{fmtPct(technicals.range.pctOfRange, 0)}</span>
                    <span className="sa-metric-sub">{positionLabel(technicals.range.positionInRange)}</span>
                  </div>
                  <div className="sa-metric-tile">
                    <span className="sa-metric-label">Trend</span>
                    <span className={`sa-metric-value ${trendClass(technicals.trend.status)}`}>
                      {trendLabel(technicals.trend.status)}
                    </span>
                    <span className="sa-metric-sub">
                      Price {fmtNum(technicals.trend.price)} · SMA50 {fmtNum(technicals.trend.sma50)} · SMA200{' '}
                      {fmtNum(technicals.trend.sma200)}
                    </span>
                  </div>
                  <div className="sa-metric-tile">
                    <span className="sa-metric-label">RSI (14)</span>
                    <span className="sa-metric-value">{fmtNum(technicals.momentum.rsi14, 1)}</span>
                    <span className="sa-metric-sub">
                      {technicals.momentum.reading
                        ? technicals.momentum.reading.charAt(0).toUpperCase() + technicals.momentum.reading.slice(1)
                        : '—'}
                    </span>
                  </div>
                </div>

                {technicals.trend.recentCross && (
                  <p className="sa-note">
                    A{' '}
                    <strong className={technicals.trend.recentCross === 'golden' ? 'sa-positive' : 'sa-negative'}>
                      {technicals.trend.recentCross === 'golden' ? 'golden cross' : 'death cross'}
                    </strong>{' '}
                    (SMA-50 {technicals.trend.recentCross === 'golden' ? 'crossing above' : 'crossing below'}{' '}
                    SMA-200) occurred in the last 10 sessions.
                  </p>
                )}
              </>
            )}
          </div>

          {/* ── Candlestick chart ── */}
          {technicals && technicals.series.length > 0 && <CandlestickChart series={technicals.series} />}

          {/* ── Valuation & self-PE ── */}
          <div className="bos-panel">
            <div className="bos-panel-head">
              <div>
                <h2 className="bos-panel-title">Valuation &amp; profitability</h2>
              </div>
            </div>

            <div className="sa-metrics-grid">
              <div className="sa-metric-tile">
                <span className="sa-metric-label">P/E</span>
                <span className="sa-metric-value">{fmtNum(data.ratios?.peRatio)}</span>
              </div>
              <div className="sa-metric-tile">
                <span className="sa-metric-label">P/B</span>
                <span className="sa-metric-value">{fmtNum(data.ratios?.pbRatio)}</span>
              </div>
              <div className="sa-metric-tile">
                <span className="sa-metric-label">ROE</span>
                <span className="sa-metric-value">{fmtPct(data.ratios?.roe)}</span>
              </div>
              <div className="sa-metric-tile">
                <span className="sa-metric-label">ROCE</span>
                <span className="sa-metric-value">{fmtPct(data.ratios?.roce)}</span>
              </div>
              <div className="sa-metric-tile">
                <span className="sa-metric-label">Dividend Yield</span>
                <span className="sa-metric-value">{fmtPct(data.ratios?.dividendYield)}</span>
              </div>
              <div className="sa-metric-tile">
                <span className="sa-metric-label">EPS</span>
                <span className="sa-metric-value">{fmtNum(data.ratios?.eps)}</span>
              </div>
            </div>

            <p className="sa-note">
              Self PE:{' '}
              {data.selfPe.percentile != null ? (
                <>
                  current P/E of <strong>{fmtNum(data.selfPe.currentPe)}</strong> sits at the{' '}
                  <strong>{fmtNum(data.selfPe.percentile, 0)}th percentile</strong> of its last{' '}
                  {data.selfPe.sampleSize} reported quarters (range {fmtNum(data.selfPe.minPe)}–
                  {fmtNum(data.selfPe.maxPe)}, median {fmtNum(data.selfPe.medianPe)}).
                </>
              ) : (
                'not enough quarterly PE history to rank the current P/E.'
              )}
            </p>
          </div>

          {/* ── Peer comparison ── */}
          <div className="bos-panel">
            <div className="bos-panel-head">
              <div>
                <h2 className="bos-panel-title">Sector peer comparison</h2>
                <p className="bos-panel-sub">
                  {data.sector ?? 'Unknown sector'}
                  {data.peerRanking.peRankPercentile != null && (
                    <>
                      {' '}
                      — cheaper than{' '}
                      <strong>{fmtNum(data.peerRanking.peRankPercentile, 0)}%</strong> of{' '}
                      {data.peerRanking.peerCount} peers by P/E
                    </>
                  )}
                </p>
              </div>
              {data.peerRanking.averagePe != null && (
                <div className="bos-panel-head-right">
                  <div className="sa-metric-tile">
                    <span className="sa-metric-label">Sector Avg P/E</span>
                    <span className="sa-metric-value">{fmtNum(data.peerRanking.averagePe)}</span>
                    <span className="sa-metric-sub">median {fmtNum(data.peerRanking.medianPe)}</span>
                  </div>
                </div>
              )}
            </div>

            {data.peers.length === 0 ? (
              <p className="sa-muted">No peer data available for this sector.</p>
            ) : (
              <div className="sa-table-wrap">
                <table className="sa-table">
                  <thead>
                    <tr>
                      <th>Symbol</th>
                      <th>Company</th>
                      <th className="sa-th-r">Price</th>
                      <th className="sa-th-r">P/E</th>
                      <th className="sa-th-r">P/B</th>
                      <th className="sa-th-r">ROE</th>
                      <th className="sa-th-r">ROCE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...data.peers]
                      .sort((a, b) => (a.peRatio ?? Infinity) - (b.peRatio ?? Infinity))
                      .map((p) => (
                        <tr
                          key={p.symbol}
                          className={p.symbol.toUpperCase() === data.symbol ? 'sa-row-self' : ''}
                        >
                          <td>{p.symbol}</td>
                          <td>{p.companyName}</td>
                          <td className="sa-td-r">{fmtNum(p.price)}</td>
                          <td className="sa-td-r">{fmtNum(p.peRatio)}</td>
                          <td className="sa-td-r">{fmtNum(p.pbRatio)}</td>
                          <td className="sa-td-r">{fmtPct(p.roe)}</td>
                          <td className="sa-td-r">{fmtPct(p.roce)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}

            <p className="sa-note">
              P/E here comes from BharatStock&rsquo;s sector-comparison data, which can differ from
              the P/E in the Valuation panel above (e.g. it may use the latest single quarter&rsquo;s
              EPS rather than trailing-twelve-month EPS) — the same gap applies across every peer
              in this table, so relative ranking is more reliable than the exact number matching.
            </p>
          </div>

          {/* ── Quarterly growth ── */}
          <div className="bos-panel">
            <div className="bos-panel-head">
              <div>
                <h2 className="bos-panel-title">Quarterly performance</h2>
                <p className="bos-panel-sub">
                  Revenue and net profit by quarter, oldest to newest — QoQ/YoY rows underneath each.
                </p>
              </div>
            </div>

            {data.quarterlyGrowth.length === 0 ? (
              <p className="sa-muted">No quarterly financials available.</p>
            ) : (
              <div className="sa-table-wrap">
                <table className="sa-table sa-table-financials">
                  <thead>
                    <tr>
                      <th className="sa-th-sticky">Metric</th>
                      {quartersAsc.map((q) => (
                        <th key={`${q.fiscalYear}-${q.quarter}-${q.periodEndDate}`} className="sa-th-r">
                          {fmtQuarterLabel(q)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="sa-td-sticky">Revenue</td>
                      {quartersAsc.map((q) => (
                        <td key={`rev-${q.periodEndDate}`} className="sa-td-r">
                          {fmtRupeesAsCr(q.revenue)}
                        </td>
                      ))}
                    </tr>
                    <tr className="sa-table-subrow">
                      <td className="sa-td-sticky">QoQ</td>
                      {quartersAsc.map((q) => (
                        <td key={`revqoq-${q.periodEndDate}`} className={`sa-td-r ${pctClass(q.revenueQoqPct)}`}>
                          {fmtPct(q.revenueQoqPct)}
                        </td>
                      ))}
                    </tr>
                    <tr className="sa-table-subrow">
                      <td className="sa-td-sticky">YoY</td>
                      {quartersAsc.map((q) => (
                        <td key={`revyoy-${q.periodEndDate}`} className={`sa-td-r ${pctClass(q.revenueYoyPct)}`}>
                          {fmtPct(q.revenueYoyPct)}
                        </td>
                      ))}
                    </tr>

                    <tr>
                      <td className="sa-td-sticky">Net Profit</td>
                      {quartersAsc.map((q) => (
                        <td key={`np-${q.periodEndDate}`} className="sa-td-r">
                          {fmtRupeesAsCr(q.netProfit)}
                        </td>
                      ))}
                    </tr>
                    <tr className="sa-table-subrow">
                      <td className="sa-td-sticky">QoQ</td>
                      {quartersAsc.map((q) => (
                        <td key={`npqoq-${q.periodEndDate}`} className={`sa-td-r ${pctClass(q.netProfitQoqPct)}`}>
                          {fmtPct(q.netProfitQoqPct)}
                        </td>
                      ))}
                    </tr>
                    <tr className="sa-table-subrow">
                      <td className="sa-td-sticky">YoY</td>
                      {quartersAsc.map((q) => (
                        <td key={`npyoy-${q.periodEndDate}`} className={`sa-td-r ${pctClass(q.netProfitYoyPct)}`}>
                          {fmtPct(q.netProfitYoyPct)}
                        </td>
                      ))}
                    </tr>

                    <tr>
                      <td className="sa-td-sticky">EPS (₹)</td>
                      {quartersAsc.map((q) => (
                        <td key={`eps-${q.periodEndDate}`} className="sa-td-r">
                          {fmtNum(q.eps)}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── Key metrics & historical data (NSE) ── */}
          <HistoricalDataPanel symbol={data.symbol} />

          {/* ── News & events ── */}
          {newsError && (
            <div className="bos-panel">
              <p className="sa-muted">News unavailable: {newsError}</p>
            </div>
          )}
          {news && (
            <NewsPanel
              items={news.items}
              aiAnalyzed={news.aiAnalyzed}
              overallSummary={news.overallSummary}
              aiError={news.aiError}
            />
          )}
        </>
      )}
    </div>
  );
}
