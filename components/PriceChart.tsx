'use client';

import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  TooltipProps,
} from 'recharts';
import type { StockRecord } from '@/types';

// Extend StockRecord to include shortDate used in chart
interface ChartData extends StockRecord {
  shortDate: string;
}

function CustomTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as ChartData;
  return (
    <div className="chart-tooltip">
      <p className="tooltip-date">{label}</p>
      <p>O: ₹{d.open} &nbsp; H: ₹{d.high}</p>
      <p>L: ₹{d.low} &nbsp; C: ₹{d.close}</p>
      <p className={d.change >= 0 ? 'positive' : 'negative'}>
        Change: {d.change >= 0 ? '+' : ''}{d.change.toFixed(2)} ({d.changePct.toFixed(2)}%)
      </p>
    </div>
  );
}

interface PriceChartProps {
  data: StockRecord[];
}

export default function PriceChart({ data }: PriceChartProps): JSX.Element {
  const chartData: ChartData[] = data.map((d) => ({
    ...d,
    shortDate: d.date.replace(/-\d{4}$/, ''),
  }));

  const minPrice = Math.min(...data.map((d) => d.low)) * 0.98;
  const maxPrice = Math.max(...data.map((d) => d.high)) * 1.02;

  return (
    <div className="chart-card">
      <h3>Price Movement</h3>
      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
          <XAxis
            dataKey="shortDate"
            tick={{ fill: '#8892a0', fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: '#e2e6ea' }}
            interval="preserveStartEnd"
          />
          <YAxis
            domain={[minPrice, maxPrice]}
            tick={{ fill: '#8892a0', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => `₹${v}`}
            width={70}
          />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine
            y={data[0]?.close}
            stroke="rgba(0,0,0,0.12)"
            strokeDasharray="4 4"
          />
          <Line
            type="monotone"
            dataKey="close"
            stroke="#1d61c1"
            strokeWidth={2}
            dot={false}
            name="Close"
          />
          <Line
            type="monotone"
            dataKey="vwap"
            stroke="#7c3aed"
            strokeWidth={1.5}
            strokeDasharray="4 4"
            dot={false}
            name="VWAP"
          />
        </ComposedChart>
      </ResponsiveContainer>
      <div className="chart-legend">
        <span><i className="dot blue" /> Close</span>
        <span><i className="dot purple" /> VWAP</span>
      </div>
    </div>
  );
}
