'use client';

import {
  ComposedChart,
  Bar,
  Line,
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

function DeliveryTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as ChartData;
  return (
    <div className="chart-tooltip">
      <p className="tooltip-date">{label}</p>
      <p>Delivery Qty: {formatNumber(d.deliveryQty)}</p>
      <p>Delivery %: {d.deliveryPct.toFixed(2)}%</p>
    </div>
  );
}

interface DeliveryChartProps {
  data: StockRecord[];
}

export default function DeliveryChart({ data }: DeliveryChartProps): JSX.Element {
  const chartData: ChartData[] = data.map((d) => ({
    ...d,
    shortDate: d.date.replace(/-\d{4}$/, ''),
  }));

  return (
    <div className="chart-card">
      <h3>Delivery Analysis</h3>
      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" vertical={false} />
          <XAxis
            dataKey="shortDate"
            tick={{ fill: '#8892a0', fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: '#e2e6ea' }}
            interval="preserveStartEnd"
          />
          <YAxis
            yAxisId="qty"
            tick={{ fill: '#8892a0', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={formatNumber}
            width={55}
          />
          <YAxis
            yAxisId="pct"
            orientation="right"
            tick={{ fill: '#8892a0', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => `${v}%`}
            width={45}
            domain={[0, 100]}
          />
          <Tooltip content={<DeliveryTooltip />} />
          <Bar
            yAxisId="qty"
            dataKey="deliveryQty"
            fill="url(#deliveryGradient)"
            radius={[3, 3, 0, 0]}
          />
          <Line
            yAxisId="pct"
            type="monotone"
            dataKey="deliveryPct"
            stroke="#d97706"
            strokeWidth={2}
            dot={false}
          />
          <defs>
            <linearGradient id="deliveryGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#16a34a" stopOpacity={0.75} />
              <stop offset="100%" stopColor="#16a34a" stopOpacity={0.2} />
            </linearGradient>
          </defs>
        </ComposedChart>
      </ResponsiveContainer>
      <div className="chart-legend">
        <span><i className="dot green" /> Delivery Qty</span>
        <span><i className="dot amber" /> Delivery %</span>
      </div>
    </div>
  );
}
