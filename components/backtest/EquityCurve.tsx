'use client';

import { useState } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  TooltipProps,
  XAxis,
  YAxis,
} from 'recharts';
import { formatDate } from '@/utils/bottomOut';
import { formatMoneyRound, formatPercent, signClass } from '@/utils/backtest';
import type { EquityPoint } from '@/types/backtest';

interface EquityCurveProps {
  equity: EquityPoint[];
  startingCapital: number;
}

function CurveTooltip({ active, payload }: TooltipProps<number, string>): JSX.Element | null {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload as EquityPoint;

  return (
    <div className="chart-tooltip">
      <p className="tooltip-date">{formatDate(point.date)}</p>
      <p>Realized: {formatMoneyRound(point.realized)}</p>
      <p>Mark-to-market: {formatMoneyRound(point.equity)}</p>
      {point.positionQty > 0 ? (
        <p>
          Holding {point.positionQty} @ {formatMoneyRound(point.invested / point.positionQty)}
        </p>
      ) : (
        <p>Flat</p>
      )}
      <p className={signClass(-point.drawdownPct)}>
        Drawdown: {formatPercent(point.drawdownPct)}
      </p>
    </div>
  );
}

/**
 * Realized equity against mark-to-market equity.
 *
 * Both lines are here on purpose. Realized is the cash truth — it only moves
 * when a trade closes. Mark-to-market shows what the open position was doing
 * in between, which is where the drawdown actually lives; reading either one
 * alone hides half the run.
 */
export default function EquityCurve({
  equity,
  startingCapital,
}: EquityCurveProps): JSX.Element {
  const [showMarkToMarket, setShowMarkToMarket] = useState<boolean>(true);

  if (equity.length === 0) {
    return (
      <div className="state-message empty">
        <p>No bars to plot.</p>
      </div>
    );
  }

  const values = equity.flatMap((p) => (showMarkToMarket ? [p.realized, p.equity] : [p.realized]));
  const min = Math.min(startingCapital, ...values);
  const max = Math.max(startingCapital, ...values);
  const pad = Math.max((max - min) * 0.08, startingCapital * 0.01);

  return (
    <section className="content-section">
      <div className="section-header">
        <h2>Equity curve</h2>
        <label className="bos-toggle">
          <input
            type="checkbox"
            checked={showMarkToMarket}
            onChange={(e) => setShowMarkToMarket(e.target.checked)}
          />
          <span>Mark the open position to market</span>
        </label>
      </div>

      <div className="chart-card">
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={equity} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
            <XAxis
              dataKey="date"
              tick={{ fill: '#8892a0', fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: '#e2e6ea' }}
              interval="preserveStartEnd"
              minTickGap={72}
              tickFormatter={formatDate}
            />
            <YAxis
              domain={[min - pad, max + pad]}
              tick={{ fill: '#8892a0', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={88}
              tickFormatter={(v: number) => formatMoneyRound(v)}
            />
            <Tooltip content={<CurveTooltip />} />
            <Legend wrapperStyle={{ fontSize: '0.78rem' }} />
            {/* The break-even line: below it the strategy lost money outright. */}
            <ReferenceLine
              y={startingCapital}
              stroke="#8892a0"
              strokeDasharray="4 4"
              ifOverflow="extendDomain"
            />
            <Line
              type="stepAfter"
              dataKey="realized"
              name="Realized"
              stroke="#1d61c1"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
            {showMarkToMarket && (
              <Line
                type="monotone"
                dataKey="equity"
                name="Mark-to-market"
                stroke="#7c3aed"
                strokeWidth={1.5}
                strokeDasharray="4 4"
                dot={false}
                isAnimationActive={false}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
