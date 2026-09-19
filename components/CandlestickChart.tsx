'use client';

import { useMemo, useState } from 'react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  TooltipProps,
  XAxis,
  YAxis,
} from 'recharts';
import type { ChartPoint } from '@/utils/technicals';

/**
 * Renders OHLC candles client-side with Recharts (already the project's
 * charting library — see PriceChart.tsx) instead of the plan doc's
 * chartjs-node-canvas server-side PNG route, which would need native
 * canvas bindings with no other use in this codebase.
 *
 * Recharts has no built-in candlestick mark, so this uses its documented
 * range-bar trick: dataKey resolves to a [low, high] tuple, which Recharts
 * renders as a floating bar whose pixel x/y/width/height are handed to the
 * custom `shape` below — the open/close body is then drawn proportionally
 * inside that same pixel range.
 */

const RANGES = [
  { label: '3M', days: 63 },
  { label: '6M', days: 126 },
  { label: '1Y', days: 252 },
] as const;

interface RangeRow extends Omit<ChartPoint, 'open' | 'high' | 'low' | 'close'> {
  open: number;
  high: number;
  low: number;
  close: number;
  shortDate: string;
  range: [number, number];
}

interface CandleShapeProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  payload?: RangeRow;
}

/** Typed `unknown` at the boundary to match Recharts' custom-shape signature; narrowed immediately after. */
function CandleShape(props: unknown): JSX.Element {
  const { x, y, width, height, payload } = props as CandleShapeProps;
  if (x == null || y == null || width == null || height == null || !payload) return <></>;

  const { open, close, high, low } = payload;
  if (high === low) return <></>;

  const isUp = close >= open;
  const color = isUp ? 'var(--positive)' : 'var(--negative)';
  const centerX = x + width / 2;
  const bodyTopValue = Math.max(open, close);
  const bodyBottomValue = Math.min(open, close);
  const bodyTopY = y + ((high - bodyTopValue) / (high - low)) * height;
  const bodyBottomY = y + ((high - bodyBottomValue) / (high - low)) * height;
  const bodyHeight = Math.max(bodyBottomY - bodyTopY, 1);
  const bodyWidth = Math.max(width * 0.7, 2);
  const bodyX = centerX - bodyWidth / 2;

  return (
    <g>
      <line x1={centerX} x2={centerX} y1={y} y2={y + height} stroke={color} strokeWidth={1} />
      <rect x={bodyX} y={bodyTopY} width={bodyWidth} height={bodyHeight} fill={color} />
    </g>
  );
}

function fmt(n: number | null | undefined): string {
  return n == null || !Number.isFinite(n) ? '—' : `₹${n.toFixed(2)}`;
}

function CustomTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload as RangeRow | undefined;
  if (!d) return null;
  return (
    <div className="chart-tooltip">
      <p className="tooltip-date">{d.date}</p>
      <p>
        O: {fmt(d.open)} &nbsp; H: {fmt(d.high)}
      </p>
      <p>
        L: {fmt(d.low)} &nbsp; C: {fmt(d.close)}
      </p>
      {d.sma50 != null && <p>SMA50: {fmt(d.sma50)}</p>}
      {d.sma200 != null && <p>SMA200: {fmt(d.sma200)}</p>}
    </div>
  );
}

interface CandlestickChartProps {
  series: ChartPoint[];
}

export default function CandlestickChart({ series }: CandlestickChartProps): JSX.Element {
  const [rangeDays, setRangeDays] = useState<number>(126);

  const chartData = useMemo<RangeRow[]>(() => {
    return series
      .slice(-rangeDays)
      .filter(
        (d): d is ChartPoint & { open: number; high: number; low: number; close: number } =>
          d.open != null && d.high != null && d.low != null && d.close != null
      )
      .map((d) => ({ ...d, shortDate: d.date.slice(5), range: [d.low, d.high] as [number, number] }));
  }, [series, rangeDays]);

  const { minPrice, maxPrice } = useMemo(() => {
    const values = chartData.flatMap((d) => [d.high, d.low]);
    if (values.length === 0) return { minPrice: 0, maxPrice: 0 };
    return { minPrice: Math.min(...values) * 0.98, maxPrice: Math.max(...values) * 1.02 };
  }, [chartData]);

  return (
    <div className="chart-card">
      <div className="sa-chart-head">
        <h3>Price &amp; Moving Averages</h3>
        <div className="sa-range-toggle">
          {RANGES.map((r) => (
            <button
              key={r.label}
              type="button"
              className={rangeDays === r.days ? 'active' : ''}
              onClick={() => setRangeDays(r.days)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {chartData.length === 0 ? (
        <p className="sa-muted">Not enough price history to chart.</p>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
              <XAxis
                dataKey="shortDate"
                tick={{ fill: '#8892a0', fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: '#e2e6ea' }}
                interval="preserveStartEnd"
                minTickGap={30}
              />
              <YAxis
                domain={[minPrice, maxPrice]}
                tick={{ fill: '#8892a0', fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: number) => `₹${Math.round(v)}`}
                width={70}
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="range" shape={CandleShape} isAnimationActive={false} />
              <Line type="monotone" dataKey="sma50" stroke="#1d61c1" strokeWidth={1.5} dot={false} name="SMA 50" connectNulls />
              <Line
                type="monotone"
                dataKey="sma200"
                stroke="#d97706"
                strokeWidth={1.5}
                dot={false}
                name="SMA 200"
                connectNulls
              />
            </ComposedChart>
          </ResponsiveContainer>
          <div className="chart-legend">
            <span>
              <i className="dot green" /> Up candle
            </span>
            <span>
              <i className="dot red" /> Down candle
            </span>
            <span>
              <i className="dot blue" /> SMA 50
            </span>
            <span>
              <i className="dot amber" /> SMA 200
            </span>
          </div>
        </>
      )}
    </div>
  );
}
