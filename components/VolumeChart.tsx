'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  TooltipProps,
} from 'recharts';
import { formatNumber } from '@/utils/formatters';
import type { StockRecord } from '@/types';

interface ChartData extends StockRecord {
  shortDate: string;
}

function VolumeTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as ChartData;
  return (
    <div className="chart-tooltip">
      <p className="tooltip-date">{label}</p>
      <p>Volume: {formatNumber(d.volume)}</p>
      <p>Trades: {d.trades.toLocaleString('en-IN')}</p>
    </div>
  );
}

interface VolumeChartProps {
  data: StockRecord[];
}

export default function VolumeChart({ data }: VolumeChartProps): JSX.Element {
  const chartData: ChartData[] = data.map((d) => ({
    ...d,
    shortDate: d.date.replace(/-\d{4}$/, ''),
  }));

  return (
    <div className="chart-card">
      <h3>Trading Volume</h3>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" vertical={false} />
          <XAxis
            dataKey="shortDate"
            tick={{ fill: '#8892a0', fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: '#e2e6ea' }}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fill: '#8892a0', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={formatNumber}
            width={55}
          />
          <Tooltip content={<VolumeTooltip />} />
          <Bar dataKey="volume" fill="url(#volumeGradient)" radius={[3, 3, 0, 0]} />
          <defs>
            <linearGradient id="volumeGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#1d61c1" stopOpacity={0.85} />
              <stop offset="100%" stopColor="#1d61c1" stopOpacity={0.25} />
            </linearGradient>
          </defs>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
