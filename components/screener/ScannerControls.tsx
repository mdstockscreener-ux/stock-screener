'use client';

import type { ScannerParams } from '@/types/screener';
import { DEFAULT_PARAMS } from '@/types/screener';

interface ScannerControlsProps {
  params: ScannerParams;
  onChange: (next: ScannerParams) => void;
  matchCount: number;
  totalCount: number;
}

interface SliderRowProps {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  disabled?: boolean;
  onChange: (value: number) => void;
}

function SliderRow({
  label,
  hint,
  value,
  min,
  max,
  step,
  unit,
  disabled,
  onChange,
}: SliderRowProps): JSX.Element {
  const commit = (raw: string) => {
    const next = Number(raw);
    if (Number.isFinite(next)) onChange(next);
  };

  return (
    <div className={`bos-control${disabled ? ' is-disabled' : ''}`}>
      <div className="bos-control-head">
        <span className="bos-control-label">{label}</span>
        <span className="bos-control-value">
          {value}
          {unit}
        </span>
      </div>
      <div className="bos-control-inputs">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={(e) => commit(e.target.value)}
          aria-label={label}
        />
        <input
          type="number"
          className="bos-number"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={(e) => commit(e.target.value)}
          aria-label={`${label} (exact)`}
        />
      </div>
      <p className="bos-control-hint">{hint}</p>
    </div>
  );
}

export default function ScannerControls({
  params,
  onChange,
  matchCount,
  totalCount,
}: ScannerControlsProps): JSX.Element {
  const set = <K extends keyof ScannerParams>(key: K, value: ScannerParams[K]) => {
    onChange({ ...params, [key]: value });
  };

  const bandInverted = params.minPctAboveLow > params.maxPctAboveLow;

  return (
    <section className="bos-panel">
      <div className="bos-panel-head">
        <div>
          <h2 className="bos-panel-title">Filters</h2>
          <p className="bos-panel-sub">
            Applied to the loaded universe as you adjust — no re-query.
          </p>
        </div>
        <div className="bos-panel-head-right">
          <span className="bos-match-count">
            <strong>{matchCount}</strong> of {totalCount} pass
          </span>
          <button
            type="button"
            className="bos-btn-ghost"
            onClick={() => onChange(DEFAULT_PARAMS)}
          >
            Reset
          </button>
        </div>
      </div>

      <div className="bos-control-grid">
        <SliderRow
          label="X — max % above 52w low"
          hint="Upper edge of the band. Above this the stock has run too far."
          value={params.maxPctAboveLow}
          min={0}
          max={100}
          step={1}
          unit="%"
          onChange={(v) => set('maxPctAboveLow', v)}
        />

        <SliderRow
          label="Y — min % above 52w low"
          hint="Lower edge. Below this it is still pinned to the low."
          value={params.minPctAboveLow}
          min={0}
          max={50}
          step={1}
          unit="%"
          onChange={(v) => set('minPctAboveLow', v)}
        />

        <div className="bos-control-group">
          <label className="bos-toggle">
            <input
              type="checkbox"
              checked={params.agedLowEnabled}
              onChange={(e) => set('agedLowEnabled', e.target.checked)}
            />
            <span>Aged-low guard</span>
          </label>
          <SliderRow
            label="N — days since 52w low"
            hint="The low must be at least this old, so the stock is no longer making new lows."
            value={params.agedLowDays}
            min={1}
            max={120}
            step={1}
            unit="d"
            disabled={!params.agedLowEnabled}
            onChange={(v) => set('agedLowDays', v)}
          />
        </div>

        <div className="bos-control-group">
          <label className="bos-toggle">
            <input
              type="checkbox"
              checked={params.belowHighEnabled}
              onChange={(e) => set('belowHighEnabled', e.target.checked)}
            />
            <span>% below 52w high</span>
          </label>
          <SliderRow
            label="Min % below 52w high"
            hint="Keeps only names still well off their highs."
            value={params.belowHighPct}
            min={0}
            max={90}
            step={1}
            unit="%"
            disabled={!params.belowHighEnabled}
            onChange={(v) => set('belowHighPct', v)}
          />
        </div>
      </div>

      {bandInverted && (
        <p className="bos-warn">
          Y ({params.minPctAboveLow}%) is above X ({params.maxPctAboveLow}%) — the band
          is empty, so nothing can pass.
        </p>
      )}
    </section>
  );
}
