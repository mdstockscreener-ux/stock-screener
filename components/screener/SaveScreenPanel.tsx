'use client';

import { useState } from 'react';
import { formatDate, formatTimestamp } from '@/utils/bottomOut';
import type { SavedScreen, ScannerParams } from '@/types/screener';

interface SaveScreenPanelProps {
  params: ScannerParams;
  dataAsOf: string | null;
  matchCount: number;
  saving: boolean;
  screens: SavedScreen[];
  screensLoading: boolean;
  screensError: string | null;
  onSave: (name: string) => Promise<{ ok: boolean; message: string }>;
}

function describeParams(params: ScannerParams | Record<string, unknown>): string {
  const p = params as Partial<ScannerParams>;
  if (typeof p.maxPctAboveLow !== 'number') return '—';
  const parts = [`${p.minPctAboveLow}–${p.maxPctAboveLow}% above low`];
  if (p.agedLowEnabled) parts.push(`low ≥ ${p.agedLowDays}d old`);
  if (p.belowHighEnabled) parts.push(`≥ ${p.belowHighPct}% below high`);
  return parts.join(' · ');
}

export default function SaveScreenPanel({
  params,
  dataAsOf,
  matchCount,
  saving,
  screens,
  screensLoading,
  screensError,
  onSave,
}: SaveScreenPanelProps): JSX.Element {
  const [name, setName] = useState<string>('');
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);

  const handleSave = async () => {
    setFeedback(null);
    const result = await onSave(name);
    setFeedback(result);
    if (result.ok) setName('');
  };

  return (
    <section className="bos-panel">
      <div className="bos-panel-head">
        <div>
          <h2 className="bos-panel-title">Save shortlist</h2>
          <p className="bos-panel-sub">
            Freezes the {matchCount} passing symbol{matchCount === 1 ? '' : 's'} and the
            parameters above. The live screen changes on every refresh; a snapshot does
            not — the backtest runs against a fixed basket.
          </p>
        </div>
      </div>

      <div className="bos-save-row">
        <input
          type="text"
          className="bos-text-input"
          placeholder="Shortlist name, e.g. Bottom-out Aug 2026"
          value={name}
          maxLength={120}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !saving) void handleSave();
          }}
          aria-label="Shortlist name"
        />
        <button
          type="button"
          className="bos-btn-primary"
          disabled={saving || matchCount === 0 || name.trim().length === 0}
          onClick={() => void handleSave()}
        >
          {saving ? 'Saving…' : `Save ${matchCount} symbols`}
        </button>
        <span className="bos-save-meta">
          data_as_of {dataAsOf ? formatDate(dataAsOf) : '—'} · {describeParams(params)}
        </span>
      </div>

      {feedback && (
        <p className={`bos-feedback${feedback.ok ? ' is-ok' : ' is-error'}`}>
          {feedback.message}
        </p>
      )}

      <div className="bos-saved-list">
        <h3 className="bos-subhead">Saved screens</h3>

        {screensError && <p className="bos-feedback is-error">{screensError}</p>}

        {screensLoading && !screensError && <p className="bos-empty-note">Loading…</p>}

        {!screensLoading && !screensError && screens.length === 0 && (
          <p className="bos-empty-note">
            Nothing saved yet. The backtest section picks a basket from this list.
          </p>
        )}

        {screens.length > 0 && (
          <div className="table-card">
            <div className="table-wrap">
              <table className="historical-table">
                <thead>
                  <tr>
                    <th className="align-right">#</th>
                    <th className="align-left">Name</th>
                    <th className="align-right">Symbols</th>
                    <th className="align-right">Data as of</th>
                    <th className="align-left">Parameters</th>
                    <th className="align-right">Saved</th>
                  </tr>
                </thead>
                <tbody>
                  {screens.map((screen) => (
                    <tr key={screen.id}>
                      <td className="align-right num-cell">{screen.id}</td>
                      <td className="align-left">{screen.name}</td>
                      <td className="align-right num-cell">{screen.resultCount ?? '—'}</td>
                      <td className="align-right num-cell">
                        {screen.data_as_of ? formatDate(screen.data_as_of) : '—'}
                      </td>
                      <td className="align-left bos-param-cell">
                        {describeParams(screen.params)}
                      </td>
                      <td className="align-right num-cell">
                        {formatTimestamp(screen.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
