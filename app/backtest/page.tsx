'use client';

import { useEffect, useState } from 'react';
import TopNav from '@/components/layout/TopNav';
import Sidebar from '@/components/layout/Sidebar';
import BacktestForm, { initialFormState } from '@/components/backtest/BacktestForm';
import type { BacktestFormState } from '@/components/backtest/BacktestForm';
import BacktestSourceBadge from '@/components/backtest/BacktestSourceBadge';
import BacktestMetrics from '@/components/backtest/BacktestMetrics';
import EquityCurve from '@/components/backtest/EquityCurve';
import TradeLog from '@/components/backtest/TradeLog';
import { useSidebar } from '@/hooks/useSidebar';
import { useUniverseSymbols } from '@/hooks/useUniverseSymbols';
import { defaultDateRange } from '@/utils/backtest';
import type { BacktestParams, BacktestResponse } from '@/types/backtest';

/** Fields that must parse to a number before the request is worth making. */
const NUMERIC_FIELDS: { key: keyof BacktestParams; from: keyof BacktestFormState; label: string }[] =
  [
    { key: 'startingCapital', from: 'startingCapital', label: 'Starting capital' },
    { key: 'trancheCount', from: 'trancheCount', label: 'Tranche count' },
    { key: 'profitTargetPct', from: 'profitTargetPct', label: 'Profit target %' },
    { key: 'stopLossPct', from: 'stopLossPct', label: 'Stop-loss %' },
    { key: 'ignorableRangePct', from: 'ignorableRangePct', label: 'Ignorable-range %' },
  ];

/**
 * Turns the form's strings into engine parameters, or explains what is missing.
 *
 * Nothing is defaulted here. A blank stop-loss is an error, not an invitation
 * to pick one — reporting results for a parameter the user never chose is the
 * one thing this page must not do.
 */
function readParams(values: BacktestFormState): { params: BacktestParams } | { error: string } {
  const parsed: Partial<Record<keyof BacktestParams, number>> = {};

  for (const field of NUMERIC_FIELDS) {
    const raw = values[field.from].trim();
    if (raw === '') return { error: `${field.label} is required.` };
    const value = Number(raw);
    if (!Number.isFinite(value)) return { error: `${field.label} must be a number.` };
    parsed[field.key] = value;
  }

  return { params: parsed as BacktestParams };
}

export default function BacktestPage(): JSX.Element {
  const { open: sidebarOpen, toggle: toggleSidebar, close: closeSidebar } = useSidebar();
  const symbolOptions = useUniverseSymbols();

  const [values, setValues] = useState<BacktestFormState>(initialFormState);
  const [running, setRunning] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<BacktestResponse | null>(null);

  // Filled after mount: `new Date()` during render would disagree between the
  // server pass and the client one whenever a request straddles midnight.
  useEffect(() => {
    const { start, end } = defaultDateRange();
    setValues((current) =>
      current.start === '' && current.end === '' ? { ...current, start, end } : current
    );
  }, []);

  const handleReset = () => {
    const { start, end } = defaultDateRange();
    setValues({ ...initialFormState(), start, end });
    setResponse(null);
    setError(null);
  };

  const handleSubmit = async () => {
    const symbol = values.symbol.trim().toUpperCase();
    if (!symbol) {
      setError('Enter a symbol to test.');
      return;
    }
    if (!values.start || !values.end) {
      setError('Both a start and an end date are required.');
      return;
    }
    if (values.start >= values.end) {
      setError('The start date must be before the end date.');
      return;
    }

    const read = readParams(values);
    if ('error' in read) {
      setError(read.error);
      return;
    }

    setRunning(true);
    setError(null);

    try {
      const res = await fetch('/api/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol,
          start: values.start,
          end: values.end,
          params: read.params,
        }),
      });

      const body = (await res.json()) as BacktestResponse | { error: string };

      if (!res.ok) {
        setResponse(null);
        setError('error' in body ? body.error : `The run failed (${res.status}).`);
        return;
      }

      setResponse(body as BacktestResponse);
    } catch (err) {
      setResponse(null);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="app">
      <TopNav onMenuToggle={toggleSidebar} sidebarOpen={sidebarOpen} />

      <div className="app-body">
        <Sidebar open={sidebarOpen} onNavigate={closeSidebar} onClose={closeSidebar} />

        <main className="content-area">
          <section className="bos-header">
            <div>
              <h1 className="bos-title">Strategy Backtest — Advanced Darvas Box</h1>
              <p className="bos-subtitle">
                One stock, its own capital, over a past window. Entries come from breaking
                the prior completed week&rsquo;s high; the position exits whole at a fixed
                target or a stop below the average entry. Fills are modelled pessimistically
                — gap-ups cost you the open, gap-downs fill below the stop, and a bar that
                spans both is read as the stop.
              </p>
            </div>
          </section>

          <BacktestForm
            values={values}
            onChange={setValues}
            onSubmit={handleSubmit}
            onReset={handleReset}
            running={running}
            symbolOptions={symbolOptions}
          />

          {error && (
            <div className="state-message error">
              <p>{error}</p>
            </div>
          )}

          {running && (
            <div className="state-message loading">
              <div className="spinner" />
              <p>Resolving bars and running the strategy…</p>
            </div>
          )}

          {!running && response && (
            <>
              <BacktestSourceBadge data={response.data} />
              <BacktestMetrics
                metrics={response.result.metrics}
                openPosition={response.result.openPosition}
              />
              <EquityCurve
                equity={response.result.equity}
                startingCapital={response.result.params.startingCapital}
              />
              <TradeLog
                events={response.result.events}
                trades={response.result.trades}
                openPosition={response.result.openPosition}
              />
            </>
          )}

          {!running && !response && !error && (
            <div className="state-message empty">
              <p>Pick a symbol, choose a stop-loss, and run.</p>
              <p className="hint">
                Results are simulated on end-of-day bars with no brokerage, slippage or
                impact cost. They are an argument about the rules, not a record of what a
                broker would have filled.
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
