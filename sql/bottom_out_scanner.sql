-- ============================================================
-- Bottom-Out Scanner — database objects
--
-- Additive to the data service schema (symbols / daily_bars /
-- daily_bars_adjusted / ingestion_runs). Nothing here modifies
-- those objects; it only adds a read-only summary view, two
-- snapshot tables, and the RLS policies the web app needs.
--
-- Idempotent: safe to run repeatedly.
-- Run in the Supabase SQL editor as the postgres role.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Summary view: screen_52w_summary
--
-- One row per active symbol, aggregated over the trailing 365
-- days ending at the global latest stored bar date (as_of).
-- Reads daily_bars_adjusted so a split/bonus cannot manufacture
-- a fake new low.
--
-- The *dates* of the 52-week low/high need DISTINCT ON, not
-- min()/max() — an aggregate returns the value only. Ties are
-- broken toward the most recent occurrence (date DESC), which is
-- the conservative choice for the aged-low guard: a stock that
-- re-touched its low last week reports days_since_low = 7, not
-- the months-ago first touch.
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW screen_52w_summary
WITH (security_invoker = true) AS
WITH bounds AS (
    SELECT MAX(date) AS as_of FROM daily_bars
),
win AS (
    -- Trailing 365 days ending at as_of, inclusive of as_of.
    SELECT b.symbol, b.date, b.high, b.low, b.close
    FROM daily_bars_adjusted b
    CROSS JOIN bounds
    WHERE b.date >  bounds.as_of - 365
      AND b.date <= bounds.as_of
),
last_bar AS (
    SELECT DISTINCT ON (symbol)
        symbol,
        date  AS last_bar_date,
        close AS close
    FROM win
    ORDER BY symbol, date DESC
),
lo AS (
    SELECT DISTINCT ON (symbol)
        symbol,
        low  AS low_52w,
        date AS low_52w_date
    FROM win
    ORDER BY symbol, low ASC, date DESC
),
hi AS (
    SELECT DISTINCT ON (symbol)
        symbol,
        high AS high_52w,
        date AS high_52w_date
    FROM win
    ORDER BY symbol, high DESC, date DESC
)
SELECT
    s.symbol,
    s.name,
    bounds.as_of,
    lb.close,
    lb.last_bar_date,
    lo.low_52w,
    lo.low_52w_date,
    hi.high_52w,
    hi.high_52w_date,
    CASE WHEN lo.low_52w > 0
         THEN ROUND((lb.close - lo.low_52w) / lo.low_52w, 6)
    END AS pct_from_low,
    CASE WHEN hi.high_52w > 0
         THEN ROUND((lb.close - hi.high_52w) / hi.high_52w, 6)
    END AS pct_from_high,                       -- negative
    (bounds.as_of - lo.low_52w_date)::int AS days_since_low
FROM symbols s
CROSS JOIN bounds
JOIN last_bar lb ON lb.symbol = s.symbol
JOIN lo        ON lo.symbol  = s.symbol
JOIN hi        ON hi.symbol  = s.symbol
WHERE COALESCE(s.is_active, TRUE);

COMMENT ON VIEW screen_52w_summary IS
    'One row per active symbol: 52-week low/high (and their dates) over the '
    'trailing 365 days ending at the global latest bar date, from '
    'daily_bars_adjusted. Live screen — reflects the latest refresh.';


-- ------------------------------------------------------------
-- 2. Snapshot tables
--
-- A live screen returns whatever the latest data produces and
-- changes on the next refresh. These tables freeze one shortlist
-- plus the parameters that produced it, so a later backtest runs
-- against a fixed, known basket.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS screens (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name        TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    data_as_of  DATE,
    params      JSONB NOT NULL DEFAULT '{}'::jsonb
);

COMMENT ON TABLE screens IS
    'A saved Bottom-Out Scanner shortlist: the parameters and the data '
    'vintage (data_as_of) that produced it.';

-- Metrics are copied in at save time, not joined back to the live
-- view — that is the whole point of the snapshot.
--
-- symbol is deliberately NOT a foreign key to symbols(symbol): a
-- snapshot must survive a symbol leaving the Nifty 100 universe.
-- An ON DELETE CASCADE there would silently erase saved history.
CREATE TABLE IF NOT EXISTS screen_results (
    screen_id      BIGINT NOT NULL REFERENCES screens(id) ON DELETE CASCADE,
    symbol         TEXT NOT NULL,
    close          NUMERIC(14,4),
    low_52w        NUMERIC(14,4),
    low_52w_date   DATE,
    high_52w       NUMERIC(14,4),
    pct_from_low   NUMERIC(12,6),
    pct_from_high  NUMERIC(12,6),
    days_since_low INTEGER,
    PRIMARY KEY (screen_id, symbol)
);

CREATE INDEX IF NOT EXISTS idx_screen_results_screen
    ON screen_results(screen_id);


-- ------------------------------------------------------------
-- 3. RLS + grants
--
-- The web app reads through PostgREST as anon/authenticated.
-- Without these, every query returns an empty set.
--
-- The collector connects as the postgres role (table owner) and
-- bypasses RLS, so enabling it here does not affect ingestion.
-- ------------------------------------------------------------

-- 3a. Read-only market data ---------------------------------
ALTER TABLE symbols        ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_bars     ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingestion_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS symbols_read ON symbols;
CREATE POLICY symbols_read ON symbols
    FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS daily_bars_read ON daily_bars;
CREATE POLICY daily_bars_read ON daily_bars
    FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS ingestion_runs_read ON ingestion_runs;
CREATE POLICY ingestion_runs_read ON ingestion_runs
    FOR SELECT TO anon, authenticated USING (true);

GRANT SELECT ON symbols             TO anon, authenticated;
GRANT SELECT ON daily_bars          TO anon, authenticated;
GRANT SELECT ON ingestion_runs      TO anon, authenticated;
GRANT SELECT ON daily_bars_adjusted TO anon, authenticated;
GRANT SELECT ON screen_52w_summary  TO anon, authenticated;

-- 3b. Snapshots: read + append ------------------------------
-- No update/delete policy: a saved snapshot is meant to be
-- immutable. Curation happens in the SQL editor.
ALTER TABLE screens        ENABLE ROW LEVEL SECURITY;
ALTER TABLE screen_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS screens_read ON screens;
CREATE POLICY screens_read ON screens
    FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS screens_insert ON screens;
CREATE POLICY screens_insert ON screens
    FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS screen_results_read ON screen_results;
CREATE POLICY screen_results_read ON screen_results
    FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS screen_results_insert ON screen_results;
CREATE POLICY screen_results_insert ON screen_results
    FOR INSERT TO anon, authenticated WITH CHECK (true);

GRANT SELECT, INSERT ON screens        TO anon, authenticated;
GRANT SELECT, INSERT ON screen_results TO anon, authenticated;


-- ------------------------------------------------------------
-- 4. Refresh PostgREST's schema cache
--
-- Without this the API can keep answering "Could not find the
-- table 'public.screen_52w_summary' in the schema cache" for a
-- minute or so after the objects already exist.
-- ------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
