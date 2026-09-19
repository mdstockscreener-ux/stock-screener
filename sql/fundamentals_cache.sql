-- ============================================================
-- Fundamentals cache — database objects
--
-- Backs the BharatStock integration layer (lib/bharatstock.ts). A
-- single dashboard load for one symbol costs several BharatStock
-- calls (stock detail, ratios, quarterly + annual financials, and
-- its sector's peer comparison) against a metered daily quota
-- (Free: 50/day, Starter: 2,000/day) — these tables let a route
-- serve same-day repeat requests from Supabase instead of
-- re-spending that quota.
--
-- One row per symbol per IST calendar day (fetch_date), not a
-- single always-overwritten "latest" row — so a later phase can
-- show "as of" history without re-fetching it.
--
-- Peer comparison is cached separately, keyed by sector rather
-- than symbol: BharatStock's compare() call returns the whole
-- sector in one response, so every stock in that sector shares
-- one cached row instead of each paying for its own call.
--
-- Writes only ever happen through the service-role key (server
-- route handlers that call lib/bharatstock.ts), which bypasses
-- RLS. anon/authenticated get SELECT only.
--
-- Idempotent: safe to run repeatedly.
-- Run in the Supabase SQL editor as the postgres role.
-- ============================================================


-- ------------------------------------------------------------
-- 1. fundamentals_cache
--
-- One row per (symbol, fetch_date). Each JSONB column stores one
-- BharatStock response verbatim (camelCase as the client returns
-- it) — kept as raw payloads rather than normalized columns since
-- no route parses these fields yet; normalize on top of this once
-- the /api/analyze route consuming them exists.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fundamentals_cache (
    id                     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    symbol                 TEXT NOT NULL,
    fetch_date             DATE NOT NULL,
    fetched_at             TIMESTAMPTZ NOT NULL,
    sector                 TEXT,
    -- client.stocks.get(symbol) — company info + latest price + metrics
    stock_detail           JSONB,
    -- client.stocks.ratios(symbol) — current PE/PB/ROE/ROCE/52w range
    ratios                 JSONB,
    -- client.stocks.financials(symbol, { periodType: 'quarterly' }).data
    financials_quarterly   JSONB,
    -- client.stocks.financials(symbol, { periodType: 'annual' }).data
    financials_annual      JSONB
);

COMMENT ON TABLE fundamentals_cache IS
    'One row per symbol per IST fetch_date, caching BharatStock fundamentals '
    'responses verbatim. Replaced per (symbol, fetch_date) on each fetch.';

CREATE UNIQUE INDEX IF NOT EXISTS ux_fundamentals_cache_symbol_date
    ON fundamentals_cache(symbol, fetch_date);


-- ------------------------------------------------------------
-- 2. sector_peers_cache
--
-- One row per (sector, fetch_date). Shared by every symbol in
-- that sector, since client.stocks.compare(sector) already
-- returns the full peer set in one call.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sector_peers_cache (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    sector        TEXT NOT NULL,
    fetch_date    DATE NOT NULL,
    fetched_at    TIMESTAMPTZ NOT NULL,
    -- client.stocks.compare(sector) result array (ComparisonItem[])
    peers         JSONB NOT NULL
);

COMMENT ON TABLE sector_peers_cache IS
    'One row per sector per IST fetch_date, caching BharatStock''s '
    'client.stocks.compare(sector) response verbatim. Replaced per '
    '(sector, fetch_date) on each fetch.';

CREATE UNIQUE INDEX IF NOT EXISTS ux_sector_peers_cache_sector_date
    ON sector_peers_cache(sector, fetch_date);


-- ------------------------------------------------------------
-- 3. RLS + grants
--
-- Read-only for anon/authenticated via PostgREST. Writes happen
-- only through the service-role key, which bypasses RLS — no
-- INSERT/UPDATE/DELETE policy is defined for anon/authenticated.
-- ------------------------------------------------------------
ALTER TABLE fundamentals_cache  ENABLE ROW LEVEL SECURITY;
ALTER TABLE sector_peers_cache  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fundamentals_cache_read ON fundamentals_cache;
CREATE POLICY fundamentals_cache_read ON fundamentals_cache
    FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS sector_peers_cache_read ON sector_peers_cache;
CREATE POLICY sector_peers_cache_read ON sector_peers_cache
    FOR SELECT TO anon, authenticated USING (true);

GRANT SELECT ON fundamentals_cache  TO anon, authenticated;
GRANT SELECT ON sector_peers_cache  TO anon, authenticated;


-- ------------------------------------------------------------
-- 4. Refresh PostgREST's schema cache
-- ------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
