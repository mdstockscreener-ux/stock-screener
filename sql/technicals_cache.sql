-- ============================================================
-- Technicals cache — database objects
--
-- Backs the technical panel (build-order step 2): BharatStock OHLCV +
-- server-computed SMA(50)/SMA(200)/RSI(14). Same fetch-through-cache
-- purpose as sql/fundamentals_cache.sql — one symbol's panel load costs
-- three BharatStock calls (1y prices, SMA-50+RSI series, SMA-200 series)
-- against the metered daily quota, so a same-day repeat request is
-- served from here instead of re-spending it.
--
-- One row per symbol per IST calendar day (fetch_date).
--
-- Writes only ever happen through the service-role key (server route
-- handlers that call lib/bharatstock.ts), which bypasses RLS.
-- anon/authenticated get SELECT only.
--
-- Idempotent: safe to run repeatedly.
-- Run in the Supabase SQL editor as the postgres role.
-- ============================================================

CREATE TABLE IF NOT EXISTS technicals_cache (
    id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    symbol         TEXT NOT NULL,
    fetch_date     DATE NOT NULL,
    fetched_at     TIMESTAMPTZ NOT NULL,
    -- client.stocks.prices(symbol, { fromDate: ~370d ago }).data — enough
    -- to derive the 52-week high/low AND the date each occurred.
    prices_1y      JSONB,
    -- client.stocks.technicalIndicators(symbol, { smaPeriod: 50, rsiPeriod: 14, fromDate: ~40d ago }).data
    sma50_series   JSONB,
    -- client.stocks.technicalIndicators(symbol, { smaPeriod: 200, fromDate: ~40d ago }).data
    sma200_series  JSONB
);

COMMENT ON TABLE technicals_cache IS
    'One row per symbol per IST fetch_date, caching BharatStock OHLCV + '
    'SMA/RSI responses verbatim. Replaced per (symbol, fetch_date) on each fetch.';

CREATE UNIQUE INDEX IF NOT EXISTS ux_technicals_cache_symbol_date
    ON technicals_cache(symbol, fetch_date);

ALTER TABLE technicals_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS technicals_cache_read ON technicals_cache;
CREATE POLICY technicals_cache_read ON technicals_cache
    FOR SELECT TO anon, authenticated USING (true);

GRANT SELECT ON technicals_cache TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
