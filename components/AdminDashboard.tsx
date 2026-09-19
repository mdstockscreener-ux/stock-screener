'use client';

import { useCallback, useEffect, useState } from 'react';

// Mirrors the keys in lib/marketDataSync.ts's SYNC_DATASETS — kept as plain
// strings here (rather than importing that module) so this client component
// never pulls in the server-only NSE/Supabase-admin code it depends on.
interface DatasetDef {
  key: string;
  label: string;
}

interface DatasetGroup {
  label: string;
  items: DatasetDef[];
}

const DATASET_GROUPS: DatasetGroup[] = [
  {
    label: 'Volume Gainers (also feeds Most Active → Volume Spurts)',
    items: [{ key: 'volume-gainers', label: 'Volume Gainers' }],
  },
  {
    label: 'Most Active Equities — Main Board',
    items: [
      { key: 'most-active-securities-volume', label: 'Sort by Volume' },
      { key: 'most-active-securities-value', label: 'Sort by Value' },
    ],
  },
  {
    label: 'Most Active Equities — SME',
    items: [
      { key: 'most-active-sme-volume', label: 'Sort by Volume' },
      { key: 'most-active-sme-value', label: 'Sort by Value' },
    ],
  },
  {
    label: 'Most Active Equities — ETF',
    items: [{ key: 'most-active-etf', label: 'ETF' }],
  },
  {
    label: 'Most Active Equities — Price Spurts',
    items: [{ key: 'most-active-price-spurts', label: 'Price Spurts' }],
  },
];

const ALL_KEYS = DATASET_GROUPS.flatMap((g) => g.items.map((i) => i.key));

/** Not a per-day snapshot table — synced via its own endpoint/status shape. */
const RESULTS_CALENDAR_KEY = 'results-calendar';

interface DatasetStatus {
  key: string;
  rowCount: number;
  fetchedAt: string | null;
  error?: string;
}

interface ResultsCalendarStatus {
  rowCount: number;
  latestSeenAt: string | null;
  error?: string;
}

interface SyncOutcome {
  ok: boolean;
  rowCount?: number;
  inserted?: number;
  skipped?: number;
  filteredOut?: number;
  error?: string;
}

export default function AdminDashboard(): JSX.Element {
  const [authChecked, setAuthChecked] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);

  const [statuses, setStatuses] = useState<Record<string, DatasetStatus>>({});
  const [resultsCalendarStatus, setResultsCalendarStatus] = useState<ResultsCalendarStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [syncing, setSyncing] = useState<Record<string, boolean>>({});
  const [outcomes, setOutcomes] = useState<Record<string, SyncOutcome>>({});
  const [syncingAll, setSyncingAll] = useState(false);

  const loadStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      const res = await fetch('/api/admin/status');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: { datasets: DatasetStatus[]; resultsCalendar?: ResultsCalendarStatus } = await res.json();
      const byKey: Record<string, DatasetStatus> = {};
      for (const d of json.datasets) byKey[d.key] = d;
      setStatuses(byKey);
      setResultsCalendarStatus(json.resultsCalendar ?? null);
    } catch {
      // Non-fatal — rows just show as unknown until the next successful load.
    } finally {
      setStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/admin/session');
        const json: { authenticated: boolean } = await res.json();
        setAuthenticated(json.authenticated);
        if (json.authenticated) await loadStatus();
      } finally {
        setAuthChecked(true);
      }
    })();
  }, [loadStatus]);

  const handleLogin = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setLoggingIn(true);
      setLoginError(null);
      try {
        const res = await fetch('/api/admin/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password }),
        });
        const json: { ok: boolean; error?: string } = await res.json();
        if (!json.ok) {
          setLoginError(json.error ?? 'Incorrect password.');
          return;
        }
        setAuthenticated(true);
        setPassword('');
        await loadStatus();
      } catch {
        setLoginError('Login failed. Please try again.');
      } finally {
        setLoggingIn(false);
      }
    },
    [password, loadStatus]
  );

  const syncOne = useCallback(async (key: string) => {
    setSyncing((prev) => ({ ...prev, [key]: true }));
    setOutcomes((prev) => ({ ...prev, [key]: { ok: true } }));
    try {
      const url = key === RESULTS_CALENDAR_KEY ? '/api/admin/sync-results-calendar' : `/api/admin/sync/${key}`;
      const res = await fetch(url, { method: 'POST' });
      const json: {
        ok: boolean;
        rowCount?: number;
        inserted?: number;
        skipped?: number;
        filteredOut?: number;
        error?: string;
      } = await res.json();
      setOutcomes((prev) => ({
        ...prev,
        [key]: {
          ok: json.ok,
          rowCount: json.rowCount,
          inserted: json.inserted,
          skipped: json.skipped,
          filteredOut: json.filteredOut,
          error: json.error,
        },
      }));
      return json.ok;
    } catch (e: unknown) {
      setOutcomes((prev) => ({
        ...prev,
        [key]: { ok: false, error: e instanceof Error ? e.message : 'Sync failed' },
      }));
      return false;
    } finally {
      setSyncing((prev) => ({ ...prev, [key]: false }));
    }
  }, []);

  const handleSyncOne = useCallback(
    async (key: string) => {
      await syncOne(key);
      await loadStatus();
    },
    [syncOne, loadStatus]
  );

  const handleSyncAll = useCallback(async () => {
    setSyncingAll(true);
    // Sequential on purpose: fetchFromNse's NSE session-cookie cache is
    // shared, mutable module state — concurrent requests risk racing a
    // 403-triggered cache reset. One at a time also gives clear progress.
    for (const key of [...ALL_KEYS, RESULTS_CALENDAR_KEY]) {
      await syncOne(key);
    }
    await loadStatus();
    setSyncingAll(false);
  }, [syncOne, loadStatus]);

  if (!authChecked) {
    return (
      <div className="admin-wrapper">
        <p className="admin-loading">Checking session…</p>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="admin-wrapper">
        <form className="admin-login-card" onSubmit={handleLogin}>
          <h1 className="admin-title">Admin</h1>
          <p className="admin-subtitle">Enter the admin password to manage NSE data syncs.</p>
          <input
            type="password"
            className="admin-password-input"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
          />
          {loginError && <p className="admin-error">{loginError}</p>}
          <button type="submit" className="admin-login-btn" disabled={loggingIn || !password}>
            {loggingIn ? 'Checking…' : 'Log in'}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="admin-wrapper">
      <div className="admin-header">
        <h1 className="admin-title">Data Sync</h1>
        <button type="button" className="admin-sync-all-btn" onClick={handleSyncAll} disabled={syncingAll}>
          {syncingAll ? 'Syncing all…' : 'Sync all'}
        </button>
      </div>
      {statusLoading && Object.keys(statuses).length === 0 && <p className="admin-loading">Loading status…</p>}

      {DATASET_GROUPS.map((group) => (
        <div key={group.label} className="admin-group-card">
          <h2 className="admin-group-title">{group.label}</h2>
          {group.items.map((item) => {
            const status = statuses[item.key];
            const outcome = outcomes[item.key];
            const isSyncing = Boolean(syncing[item.key]);
            return (
              <div key={item.key} className="admin-row">
                <div className="admin-row-info">
                  <span className="admin-row-label">{item.label}</span>
                  <span className="admin-row-meta">
                    {status
                      ? status.rowCount > 0
                        ? `${status.rowCount} rows · last synced ${new Date(status.fetchedAt ?? '').toLocaleTimeString('en-IN')}`
                        : 'No data for today yet'
                      : '—'}
                  </span>
                  {outcome && !outcome.ok && <span className="admin-row-error">{outcome.error}</span>}
                </div>
                <button
                  type="button"
                  className="admin-sync-btn"
                  onClick={() => handleSyncOne(item.key)}
                  disabled={isSyncing || syncingAll}
                >
                  {isSyncing ? 'Syncing…' : 'Sync now'}
                </button>
              </div>
            );
          })}
        </div>
      ))}

      <div className="admin-group-card">
        <h2 className="admin-group-title">
          Upcoming Results (results_calendar — also refreshed by the event-calendar-data-collector extension)
        </h2>
        {(() => {
          const outcome = outcomes[RESULTS_CALENDAR_KEY];
          const isSyncing = Boolean(syncing[RESULTS_CALENDAR_KEY]);
          return (
            <div className="admin-row">
              <div className="admin-row-info">
                <span className="admin-row-label">Board meetings (Financial Results)</span>
                <span className="admin-row-meta">
                  {resultsCalendarStatus
                    ? resultsCalendarStatus.rowCount > 0
                      ? `${resultsCalendarStatus.rowCount} rows total · last seen ${new Date(
                          resultsCalendarStatus.latestSeenAt ?? ''
                        ).toLocaleString('en-IN')}`
                      : 'No rows yet'
                    : '—'}
                </span>
                {outcome && outcome.ok && outcome.inserted !== undefined && (
                  <span className="admin-row-meta">
                    {outcome.inserted} new, {outcome.skipped} refreshed, {outcome.filteredOut} filtered out
                  </span>
                )}
                {outcome && !outcome.ok && <span className="admin-row-error">{outcome.error}</span>}
              </div>
              <button
                type="button"
                className="admin-sync-btn"
                onClick={() => handleSyncOne(RESULTS_CALENDAR_KEY)}
                disabled={isSyncing || syncingAll}
              >
                {isSyncing ? 'Syncing…' : 'Sync now'}
              </button>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
