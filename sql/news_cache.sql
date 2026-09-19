-- ============================================================
-- News cache — database objects
--
-- Backs the news/events panel (build-order step 4): Google News RSS
-- headlines plus BharatStock corporate actions, insider/promoter trades,
-- and bulk/block deals — combined into one price-move-linked feed, with
-- an AI sentiment read on the RSS headlines when an AI provider is
-- configured (AI_API_KEY — see lib/ai/index.ts; any provider, not tied to
-- one vendor). Same fetch-through-cache purpose as the other
-- sql/*_cache.sql tables — one symbol's panel load costs 4-5 BharatStock
-- calls plus (optionally) one AI call, so a same-day repeat request
-- is served from here instead of re-spending that.
--
-- One row per symbol per IST calendar day (fetch_date). The whole feed
-- (all event types, already merged and price-move-linked) lives in one
-- JSONB column — composing it needs technicals_cache's price series
-- anyway, so there's nothing gained by storing each source separately.
-- ai_analyzed records whether an AI provider was configured at fetch
-- time, so the frontend can tell "no AI read available today" apart from
-- "nothing to report".
--
-- Writes only ever happen through the service-role key (server route
-- handlers that call lib/bharatstock.ts / lib/ai/index.ts), which bypasses
-- RLS. anon/authenticated get SELECT only.
--
-- Idempotent: safe to run repeatedly.
-- Run in the Supabase SQL editor as the postgres role.
-- ============================================================

CREATE TABLE IF NOT EXISTS news_cache (
    id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    symbol           TEXT NOT NULL,
    fetch_date       DATE NOT NULL,
    fetched_at       TIMESTAMPTZ NOT NULL,
    -- NewsEventItem[] (see types/news.ts) — news + corporate actions +
    -- insider trades + bulk/block deals, merged and price-move-linked,
    -- most-recent-first.
    items            JSONB NOT NULL,
    -- Whether an AI provider was configured (and succeeded) at fetch time.
    ai_analyzed      BOOLEAN NOT NULL DEFAULT FALSE,
    -- 2-4 sentences synthesizing the whole feed (news + disclosed trades/
    -- deals together) — the takeaway, not a per-item tag. Null unless
    -- ai_analyzed. See lib/ai/types.ts's analyze_news schema.
    overall_summary  TEXT,
    -- The AI provider's error message when a configured provider failed
    -- (e.g. rate limit, out of credits, bad model id). Null when AI was
    -- never attempted (not configured) or when it succeeded. Surfaced by
    -- the API/UI so a failure is visible without reading server logs.
    ai_error         TEXT
);

-- Adds the columns to a news_cache table created before these fields
-- existed — CREATE TABLE IF NOT EXISTS above is a no-op once the table
-- exists, so these ALTERs are what actually pick up new columns on a re-run.
ALTER TABLE news_cache ADD COLUMN IF NOT EXISTS overall_summary TEXT;
ALTER TABLE news_cache ADD COLUMN IF NOT EXISTS ai_error TEXT;

COMMENT ON TABLE news_cache IS
    'One row per symbol per IST fetch_date: the combined news/events feed '
    '(Google News RSS + BharatStock corporate actions/insider trades/'
    'bulk+block deals), price-move-linked and (when ai_analyzed) AI-'
    'classified. Replaced per (symbol, fetch_date) on each fetch.';

CREATE UNIQUE INDEX IF NOT EXISTS ux_news_cache_symbol_date
    ON news_cache(symbol, fetch_date);

ALTER TABLE news_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS news_cache_read ON news_cache;
CREATE POLICY news_cache_read ON news_cache
    FOR SELECT TO anon, authenticated USING (true);

GRANT SELECT ON news_cache TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
