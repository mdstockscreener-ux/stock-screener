'use client';

import type { UniverseSymbol } from '@/hooks/useUniverseSymbols';
import { DEFAULT_FORM_VALUES } from '@/types/backtest';

/**
 * Numbers live in the form as strings so a field can be emptied while it is
 * being retyped. They are parsed once, on submit.
 */
export interface BacktestFormState {
  symbol: string;
  start: string;
  end: string;
  startingCapital: string;
  trancheCount: string;
  profitTargetPct: string;
  stopLossPct: string;
  ignorableRangePct: string;
}

/**
 * The form's opening values.
 *
 * Dates are filled in by the page on mount, and stopLossPct stays blank on
 * purpose — it is the variable under study, so the user picks it rather than
 * inheriting a number that would look like a recommendation.
 */
export function initialFormState(): BacktestFormState {
  return {
    symbol: '',
    start: '',
    end: '',
    startingCapital: String(DEFAULT_FORM_VALUES.startingCapital),
    trancheCount: String(DEFAULT_FORM_VALUES.trancheCount),
    profitTargetPct: String(DEFAULT_FORM_VALUES.profitTargetPct),
    stopLossPct: '',
    ignorableRangePct: String(DEFAULT_FORM_VALUES.ignorableRangePct),
  };
}

interface BacktestFormProps {
  values: BacktestFormState;
  onChange: (next: BacktestFormState) => void;
  onSubmit: () => void;
  onReset: () => void;
  running: boolean;
  symbolOptions: UniverseSymbol[];
}

interface FieldProps {
  id: string;
  label: string;
  hint: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  step?: string;
  min?: string;
  suffix?: string;
  placeholder?: string;
  emphasis?: boolean;
}

function Field({
  id,
  label,
  hint,
  value,
  onChange,
  type = 'number',
  step,
  min,
  suffix,
  placeholder,
  emphasis,
}: FieldProps): JSX.Element {
  return (
    <div className={`bt-field${emphasis ? ' is-emphasis' : ''}`}>
      <label className="bt-field-label" htmlFor={id}>
        {label}
        {suffix && <span className="bt-field-suffix">{suffix}</span>}
      </label>
      <input
        id={id}
        className="bt-input"
        type={type}
        step={step}
        min={min}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      <p className="bt-field-hint">{hint}</p>
    </div>
  );
}

export default function BacktestForm({
  values,
  onChange,
  onSubmit,
  onReset,
  running,
  symbolOptions,
}: BacktestFormProps): JSX.Element {
  const set = <K extends keyof BacktestFormState>(key: K, value: string) => {
    onChange({ ...values, [key]: value });
  };

  return (
    <form
      className="bos-panel"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <div className="bos-panel-head">
        <div>
          <h2 className="bos-panel-title">Run a backtest</h2>
          <p className="bos-panel-sub">
            Advanced Darvas Box on one stock, with its own sandboxed capital. Every number
            below is yours to change — nothing is fixed inside the engine.
          </p>
        </div>
        <div className="bos-panel-head-right">
          <button type="button" className="bos-btn-ghost" onClick={onReset} disabled={running}>
            Reset
          </button>
          <button type="submit" className="bos-btn-primary" disabled={running}>
            {running ? 'Running…' : 'Run backtest'}
          </button>
        </div>
      </div>

      <div className="bt-field-grid">
        <div className="bt-field">
          <label className="bt-field-label" htmlFor="bt-symbol">
            Symbol
          </label>
          <input
            id="bt-symbol"
            className="bt-input"
            type="text"
            list="bt-symbol-options"
            autoComplete="off"
            spellCheck={false}
            placeholder="e.g. RELIANCE"
            value={values.symbol}
            onChange={(e) => set('symbol', e.target.value.toUpperCase())}
          />
          <datalist id="bt-symbol-options">
            {symbolOptions.map((s) => (
              <option key={s.symbol} value={s.symbol}>
                {s.name ?? s.symbol}
              </option>
            ))}
          </datalist>
          <p className="bt-field-hint">
            A shortlisted name from the scanner, or any symbol at all — anything outside
            the stored universe is fetched on demand.
          </p>
        </div>

        <Field
          id="bt-start"
          label="Start date"
          hint="The window opens here. The first completed week inside it arms the first trigger."
          type="date"
          value={values.start}
          onChange={(v) => set('start', v)}
        />

        <Field
          id="bt-end"
          label="End date"
          hint="A position still open on this date is marked to that close, not counted as a result."
          type="date"
          value={values.end}
          onChange={(v) => set('end', v)}
        />

        {/*
          step="any" on every free-form number below. `step` does not size the
          spinner arrows, it *constrains which values are valid* to min + n×step
          — so min="1" step="1000" silently rejects 600000 and demands 599001 or
          600001. These are amounts people type, not enumerations.
        */}
        <Field
          id="bt-capital"
          label="Starting capital"
          suffix="₹"
          hint="Sandboxed for this one stock. Tranche size is pinned to it and never compounds."
          min="1"
          step="any"
          value={values.startingCapital}
          onChange={(v) => set('startingCapital', v)}
        />

        <Field
          id="bt-tranches"
          label="Tranche count"
          hint="Rule 1 — the capital is cut into this many equal slices, deployed one breakout at a time."
          min="1"
          step="1"
          value={values.trancheCount}
          onChange={(v) => set('trancheCount', v)}
        />

        <Field
          id="bt-target"
          label="Profit target"
          suffix="%"
          hint="Above the average entry. The whole position exits here — there is no partial booking."
          min="0"
          step="any"
          value={values.profitTargetPct}
          onChange={(v) => set('profitTargetPct', v)}
        />

        <Field
          id="bt-stop"
          label="Stop-loss"
          suffix="%"
          emphasis
          placeholder="required"
          hint="Below the average entry. This is the value under search, so there is no default — pick one, then sweep it."
          min="0"
          step="any"
          value={values.stopLossPct}
          onChange={(v) => set('stopLossPct', v)}
        />

        <Field
          id="bt-ignorable"
          label="Ignorable range"
          suffix="%"
          hint="Rule 3 — checked each weekend. If the new weekly high is this close to your last buy, no order is placed at all that week."
          min="0"
          step="any"
          value={values.ignorableRangePct}
          onChange={(v) => set('ignorableRangePct', v)}
        />
      </div>

      <p className="bt-note">
        The stop is measured below the <strong>average</strong> entry price, so each added
        tranche drags it up behind the position. Below the individual entry, or trailing
        behind the high, are different strategies — that definition is itself a knob worth
        revisiting, and changing it would change every number on this page.
      </p>
    </form>
  );
}
