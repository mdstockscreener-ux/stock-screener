-- ============================================================
-- Market data sync — database objects
--
-- Backs the /admin-triggered NSE sync for the Volume Gainers and
-- Most Active Equities pages. Each table holds one row per
-- security per IST calendar day (trade_date), not a single
-- always-overwritten "latest" snapshot — this is what lets the
-- pages offer a date filter over historical days.
--
-- Writes only ever happen through the service-role key (from
-- app/api/admin/sync/[dataset]/route.ts and the public read
-- routes' NSE-fallback path in lib/marketDataSync.ts), which
-- bypasses RLS entirely. anon/authenticated get SELECT only.
--
-- Idempotent: safe to run repeatedly.
-- Run in the Supabase SQL editor as the postgres role.
-- ============================================================


-- ------------------------------------------------------------
-- 1. volume_gainers
--
-- Shared by the Volume Gainers page AND the Most Active
-- Equities "Volume Spurts" tab — both call the exact same NSE
-- endpoint (live-analysis-volume-gainers), so they read this one
-- table rather than each getting their own.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS volume_gainers (
    id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    trade_date        DATE NOT NULL,
    rank              INTEGER NOT NULL,
    fetched_at        TIMESTAMPTZ NOT NULL,
    symbol            TEXT NOT NULL,
    company_name      TEXT,
    volume            NUMERIC,
    week1_avg_volume  NUMERIC,
    week1_vol_change  NUMERIC(10,4),
    week2_avg_volume  NUMERIC,
    week2_vol_change  NUMERIC(10,4),
    ltp               NUMERIC(14,4),
    p_change          NUMERIC(10,4),
    turnover          NUMERIC(18,4)
);

COMMENT ON TABLE volume_gainers IS
    'One row per security per IST trade_date, as returned by NSE''s '
    'live-analysis-volume-gainers. Replaced per trade_date on each sync; '
    'earlier days are left untouched so the date filter has history to show.';

CREATE UNIQUE INDEX IF NOT EXISTS ux_volume_gainers_date_rank
    ON volume_gainers(trade_date, rank);


-- ------------------------------------------------------------
-- 2. most_active_securities (Main Board tab)
--
-- NSE is called twice for this tab (index=volume, index=value)
-- and returns genuinely different row sets each time, so a
-- sort_by discriminator holds both variants in one table.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS most_active_securities (
    id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    trade_date            DATE NOT NULL,
    sort_by               TEXT NOT NULL CHECK (sort_by IN ('volume', 'value')),
    rank                  INTEGER NOT NULL,
    fetched_at            TIMESTAMPTZ NOT NULL,
    symbol                TEXT NOT NULL,
    identifier            TEXT,
    open                  NUMERIC(14,4),
    day_high              NUMERIC(14,4),
    day_low               NUMERIC(14,4),
    previous_close        NUMERIC(14,4),
    last_price            NUMERIC(14,4),
    p_change              NUMERIC(10,4),
    total_traded_volume   NUMERIC,
    total_traded_value    NUMERIC(18,4),
    quantity_traded       NUMERIC,
    -- Stored verbatim as NSE sends it ('-', 'null', a date string, or
    -- absent) — the frontend's nseDateLink() already treats all three
    -- forms as "no corporate action date", so normalizing here would
    -- only risk breaking that check.
    ex_date               TEXT,
    purpose               TEXT,
    year_high             NUMERIC(14,4),
    year_low              NUMERIC(14,4),
    change                NUMERIC(14,4),
    close_price           NUMERIC(14,4),
    last_update_time      TEXT,
    nav                   NUMERIC(14,4)
);

COMMENT ON TABLE most_active_securities IS
    'One row per security per (trade_date, sort_by), as returned by NSE''s '
    'live-analysis-most-active-securities?index=volume|value. Replaced per '
    '(trade_date, sort_by) on each sync.';

CREATE UNIQUE INDEX IF NOT EXISTS ux_most_active_securities_date_sort_rank
    ON most_active_securities(trade_date, sort_by, rank);


-- ------------------------------------------------------------
-- 3. most_active_sme (SME tab)
--
-- Same shape and sort_by pattern as most_active_securities, kept
-- as its own table since it's a distinct NSE endpoint/segment.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS most_active_sme (
    id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    trade_date            DATE NOT NULL,
    sort_by               TEXT NOT NULL CHECK (sort_by IN ('volume', 'value')),
    rank                  INTEGER NOT NULL,
    fetched_at            TIMESTAMPTZ NOT NULL,
    symbol                TEXT NOT NULL,
    identifier            TEXT,
    open                  NUMERIC(14,4),
    day_high              NUMERIC(14,4),
    day_low               NUMERIC(14,4),
    previous_close        NUMERIC(14,4),
    last_price            NUMERIC(14,4),
    p_change              NUMERIC(10,4),
    total_traded_volume   NUMERIC,
    total_traded_value    NUMERIC(18,4),
    quantity_traded       NUMERIC,
    ex_date               TEXT,
    purpose               TEXT,
    year_high             NUMERIC(14,4),
    year_low              NUMERIC(14,4),
    change                NUMERIC(14,4),
    close_price           NUMERIC(14,4),
    last_update_time      TEXT,
    nav                   NUMERIC(14,4)
);

COMMENT ON TABLE most_active_sme IS
    'One row per security per (trade_date, sort_by), as returned by NSE''s '
    'live-analysis-most-active-sme?index=volume|value. Replaced per '
    '(trade_date, sort_by) on each sync.';

CREATE UNIQUE INDEX IF NOT EXISTS ux_most_active_sme_date_sort_rank
    ON most_active_sme(trade_date, sort_by, rank);


-- ------------------------------------------------------------
-- 4. most_active_etf (ETF tab)
--
-- Same SecurityRow shape as above, but NSE is only ever called
-- once (index=volume is hardcoded in the existing route), so no
-- sort_by discriminator is needed.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS most_active_etf (
    id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    trade_date            DATE NOT NULL,
    rank                  INTEGER NOT NULL,
    fetched_at            TIMESTAMPTZ NOT NULL,
    symbol                TEXT NOT NULL,
    identifier            TEXT,
    open                  NUMERIC(14,4),
    day_high              NUMERIC(14,4),
    day_low               NUMERIC(14,4),
    previous_close        NUMERIC(14,4),
    last_price            NUMERIC(14,4),
    p_change              NUMERIC(10,4),
    total_traded_volume   NUMERIC,
    total_traded_value    NUMERIC(18,4),
    quantity_traded       NUMERIC,
    ex_date               TEXT,
    purpose               TEXT,
    year_high             NUMERIC(14,4),
    year_low              NUMERIC(14,4),
    change                NUMERIC(14,4),
    close_price           NUMERIC(14,4),
    last_update_time      TEXT,
    nav                   NUMERIC(14,4)
);

COMMENT ON TABLE most_active_etf IS
    'One row per ETF per trade_date, as returned by NSE''s '
    'live-analysis-most-active-etf?index=volume. Replaced per trade_date '
    'on each sync.';

CREATE UNIQUE INDEX IF NOT EXISTS ux_most_active_etf_date_rank
    ON most_active_etf(trade_date, rank);


-- ------------------------------------------------------------
-- 5. most_active_price_spurts (Price Spurts tab)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS most_active_price_spurts (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    trade_date      DATE NOT NULL,
    rank            INTEGER NOT NULL,
    fetched_at      TIMESTAMPTZ NOT NULL,
    symbol          TEXT NOT NULL,
    series          TEXT,
    open_price      NUMERIC(14,4),
    high_price      NUMERIC(14,4),
    low_price       NUMERIC(14,4),
    ltp             NUMERIC(14,4),
    prev_price      NUMERIC(14,4),
    net_price       NUMERIC(10,4),
    trade_quantity  NUMERIC,
    turnover        NUMERIC(18,4),
    market_type     TEXT,
    -- Verbatim, same rule as most_active_securities.ex_date above.
    ca_ex_dt        TEXT,
    ca_purpose      TEXT,
    per_change      NUMERIC(10,4)
);

COMMENT ON TABLE most_active_price_spurts IS
    'One row per security per trade_date, as returned by NSE''s '
    'live-analysis-variations?index=gainers&key=SecGtr20. Replaced per '
    'trade_date on each sync.';

CREATE UNIQUE INDEX IF NOT EXISTS ux_most_active_price_spurts_date_rank
    ON most_active_price_spurts(trade_date, rank);


-- ------------------------------------------------------------
-- 6. RLS + grants
--
-- Read-only for anon/authenticated via PostgREST. Writes happen
-- only through the service-role key (server-side admin sync and
-- the read routes' NSE-fallback), which bypasses RLS — no
-- INSERT/UPDATE/DELETE policy is defined for anon/authenticated.
-- ------------------------------------------------------------
ALTER TABLE volume_gainers            ENABLE ROW LEVEL SECURITY;
ALTER TABLE most_active_securities    ENABLE ROW LEVEL SECURITY;
ALTER TABLE most_active_sme           ENABLE ROW LEVEL SECURITY;
ALTER TABLE most_active_etf           ENABLE ROW LEVEL SECURITY;
ALTER TABLE most_active_price_spurts  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS volume_gainers_read ON volume_gainers;
CREATE POLICY volume_gainers_read ON volume_gainers
    FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS most_active_securities_read ON most_active_securities;
CREATE POLICY most_active_securities_read ON most_active_securities
    FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS most_active_sme_read ON most_active_sme;
CREATE POLICY most_active_sme_read ON most_active_sme
    FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS most_active_etf_read ON most_active_etf;
CREATE POLICY most_active_etf_read ON most_active_etf
    FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS most_active_price_spurts_read ON most_active_price_spurts;
CREATE POLICY most_active_price_spurts_read ON most_active_price_spurts
    FOR SELECT TO anon, authenticated USING (true);

GRANT SELECT ON volume_gainers           TO anon, authenticated;
GRANT SELECT ON most_active_securities   TO anon, authenticated;
GRANT SELECT ON most_active_sme          TO anon, authenticated;
GRANT SELECT ON most_active_etf          TO anon, authenticated;
GRANT SELECT ON most_active_price_spurts TO anon, authenticated;


-- ------------------------------------------------------------
-- 7. Refresh PostgREST's schema cache
-- ------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
