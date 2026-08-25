'use client';

import { formatDate } from '@/utils/bottomOut';
import {
  formatMoneyRound,
  formatPercent,
  formatR,
  formatRatio,
  formatSignedMoney,
  formatSignedPercent,
  signClass,
} from '@/utils/backtest';
import type { BacktestMetrics as Metrics, RoundTrip } from '@/types/backtest';

interface BacktestMetricsProps {
  metrics: Metrics;
  openPosition: RoundTrip | null;
}

interface TileProps {
  label: string;
  value: string;
  hint?: string;
  tone?: string;
}

function Tile({ label, value, hint, tone }: TileProps): JSX.Element {
  return (
    <div className="bt-tile">
      <span className="bt-tile-label">{label}</span>
      <span className={`bt-tile-value ${tone ?? ''}`}>{value}</span>
      {hint && <span className="bt-tile-hint">{hint}</span>}
    </div>
  );
}

/**
 * The honest set, not just the headline.
 *
 * Total return is deliberately not alone up here: a return that came from one
 * lucky trade at a 12% drawdown is a different result from the same return at
 * 3%, and expectancy and the win/loss split are what tell them apart.
 */
export default function BacktestMetrics({
  metrics,
  openPosition,
}: BacktestMetricsProps): JSX.Element {
  const drawdownWindow =
    metrics.maxDrawdownPeakDate && metrics.maxDrawdownTroughDate
      ? `${formatDate(metrics.maxDrawdownPeakDate)} → ${formatDate(metrics.maxDrawdownTroughDate)}`
      : undefined;

  return (
    <section className="content-section">
      <div className="section-header">
        <h2>Metrics</h2>
        <span className="section-meta">
          {metrics.tradeCount} closed trade{metrics.tradeCount === 1 ? '' : 's'}
          {openPosition ? ' + 1 still open' : ''}
        </span>
      </div>

      <div className="bt-tile-grid">
        <Tile
          label="Total return"
          value={formatSignedPercent(metrics.totalReturnPct)}
          tone={signClass(metrics.totalReturnPct)}
          hint={`${formatMoneyRound(metrics.finalEquity)} from ${formatMoneyRound(
            metrics.startingCapital
          )}, open position marked to the last close`}
        />
        <Tile
          label="Realized return"
          value={formatSignedPercent(metrics.realizedReturnPct)}
          tone={signClass(metrics.realizedReturnPct)}
          hint="Closed trades only — nothing counted before it was booked"
        />
        <Tile
          label="Expectancy"
          value={formatR(metrics.expectancyR)}
          tone={metrics.expectancyR === null ? undefined : signClass(metrics.expectancyR)}
          hint={`Mean R per trade, ${formatSignedMoney(metrics.expectancy)} in rupees`}
        />
        <Tile
          label="Win rate"
          value={formatPercent(metrics.winRatePct, 1)}
          hint={`${metrics.winCount} won, ${metrics.lossCount} lost`}
        />
        <Tile
          label="Average win"
          value={metrics.winCount > 0 ? formatMoneyRound(metrics.avgWin) : '—'}
          tone={metrics.winCount > 0 ? 'bos-pos' : undefined}
          hint="Mean P&L of the winners"
        />
        <Tile
          label="Average loss"
          value={metrics.lossCount > 0 ? formatMoneyRound(metrics.avgLoss) : '—'}
          tone={metrics.lossCount > 0 ? 'bos-neg' : undefined}
          hint="Mean P&L of the losers, as a magnitude"
        />
        <Tile
          label="Profit factor"
          value={formatRatio(metrics.profitFactor)}
          hint="Gross wins over gross losses"
        />
        <Tile
          label="Max drawdown"
          value={formatPercent(metrics.maxDrawdownPct)}
          tone={metrics.maxDrawdownPct > 0 ? 'bos-neg' : undefined}
          hint={
            drawdownWindow
              ? `${formatMoneyRound(metrics.maxDrawdownAmount)} · ${drawdownWindow}`
              : 'Never below the starting mark'
          }
        />
        <Tile
          label="Trades"
          value={String(metrics.tradeCount)}
          hint={`Up to ${metrics.maxTranchesDeployed} tranche${
            metrics.maxTranchesDeployed === 1 ? '' : 's'
          } deployed at once`}
        />
        <Tile
          label="Time in market"
          value={formatPercent(metrics.timeInMarketPct, 1)}
          hint={`${metrics.barsInMarket} of ${metrics.totalBars} bars held a position`}
        />
      </div>

      {openPosition && (
        <p className="bt-note">
          A position opened {formatDate(openPosition.entryDate)} is still running:{' '}
          {openPosition.qty} shares at an average of {formatMoneyRound(openPosition.avgEntryPrice)},
          marked at {formatMoneyRound(openPosition.exitPrice)} for{' '}
          <span className={signClass(openPosition.pnl)}>{formatSignedMoney(openPosition.pnl)}</span>.
          It is excluded from the trade count, the win rate and expectancy — it is not a
          result until it closes.
        </p>
      )}
    </section>
  );
}
