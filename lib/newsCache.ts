import { getBharatStock } from '@/lib/bharatstock';
import { getSupabase } from '@/lib/supabaseClient';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getTechnicals } from '@/lib/technicalsCache';
import { singleflight } from '@/lib/singleflight';
import { fetchGoogleNewsRss } from '@/lib/newsRss';
import { aiModel, aiProviderName, analyzeNews as runAiAnalysis, isAiConfigured } from '@/lib/ai';
import type { EventForAnalysis } from '@/lib/ai';
import {
  buildCorporateActionLabel,
  buildDealLabel,
  buildInsiderTradeLabel,
  classifyTransactionDirection,
  computePriceMove,
} from '@/utils/news';
import { todayIstIso } from '@/lib/istDate';
import type { NewsEventItem } from '@/types/news';
import type { DailyPricePoint } from 'bharatstock';

/**
 * Fetch-through-cache for the combined news/events feed, backed by
 * sql/news_cache.sql. Same read/sync split as the other lib/*Cache.ts
 * modules. Composes the feed once at fetch time (it needs
 * technicals_cache's price series to link each event to a price move, and
 * — when configured — one AI call to classify headline sentiment; see
 * lib/ai/index.ts), and caches the finished result.
 */

export interface NewsCacheRow {
  symbol: string;
  fetch_date: string;
  fetched_at: string;
  items: NewsEventItem[];
  ai_analyzed: boolean;
  overall_summary: string | null;
  /** The AI provider's error message when a configured provider failed — null when never attempted or when it succeeded. */
  ai_error: string | null;
}

function fmtDate(iso: string): string {
  return iso.slice(0, 10);
}

/** How many of the most-recent combined items (across all event types) get sent to the AI for analysis. Keeps the call focused and cheap. */
const AI_ANALYSIS_WINDOW = 15;

/**
 * Some providers (small/fast open-weight models especially) occasionally
 * emit malformed JSON in a forced tool call — a formatting slip, not a
 * content problem — so one retry is worth it before giving up and falling
 * back to raw news.
 */
async function analyzeNewsWithRetry(
  symbol: string,
  items: EventForAnalysis[]
): ReturnType<typeof runAiAnalysis> {
  try {
    return await runAiAnalysis(symbol, items);
  } catch (err) {
    console.warn(`[news:${symbol}] AI analysis failed once, retrying: ${err instanceof Error ? err.message : err}`);
    return runAiAnalysis(symbol, items);
  }
}

/**
 * companyName drives the Google News search query (better results than the
 * bare ticker); pass symbol itself if a company name isn't available.
 */
export function getNews(
  symbolRaw: string,
  companyName: string,
  fetchDate: string = todayIstIso()
): Promise<NewsCacheRow> {
  const symbol = symbolRaw.trim().toUpperCase();
  return singleflight(`news:${symbol}:${fetchDate}`, () => fetchNews(symbol, companyName, fetchDate));
}

async function fetchNews(symbol: string, companyName: string, fetchDate: string): Promise<NewsCacheRow> {
  const supabase = getSupabase();

  const { data: existing, error: readError } = await supabase
    .from('news_cache')
    .select('symbol, fetch_date, fetched_at, items, ai_analyzed, overall_summary, ai_error')
    .eq('symbol', symbol)
    .eq('fetch_date', fetchDate)
    .maybeSingle();

  if (readError) {
    throw new Error(`Could not read news_cache: ${readError.message}`);
  }
  if (existing) {
    return existing as NewsCacheRow;
  }

  if (fetchDate !== todayIstIso()) {
    throw new Error(`No cached news for ${symbol} on ${fetchDate}.`);
  }

  const client = getBharatStock();

  const [headlinesResult, corpActionsResult, insiderResult, bulkResult, blockResult, technicalsResult] =
    await Promise.allSettled([
      fetchGoogleNewsRss(`${companyName} stock`, 15),
      client.stocks.corporateActions(symbol, { pageSize: 10 }),
      client.stocks.insiderTrades(symbol, { pageSize: 10 }),
      client.stocks.bulkDeals(symbol, { pageSize: 10 }),
      client.stocks.blockDeals(symbol, { pageSize: 10 }),
      getTechnicals(symbol, fetchDate),
    ]);

  const prices: DailyPricePoint[] =
    technicalsResult.status === 'fulfilled' ? (technicalsResult.value.prices_1y ?? []) : [];
  const moveOf = (dateIso: string) => computePriceMove(prices, dateIso);

  const items: NewsEventItem[] = [];

  // ── News headlines ──
  const headlines = headlinesResult.status === 'fulfilled' ? headlinesResult.value : [];
  for (const h of headlines) {
    if (!h.pubDate) continue;
    items.push({
      type: 'news',
      date: fmtDate(h.pubDate),
      headline: h.headline,
      source: h.source,
      link: h.link,
      priceMove: moveOf(fmtDate(h.pubDate)),
      direction: null,
      sentiment: null,
      driver: null,
      confidence: null,
    });
  }

  // ── Corporate actions (mechanical label, no AI) ──
  if (corpActionsResult.status === 'fulfilled') {
    for (const a of corpActionsResult.value.data) {
      if (!a.exDate) continue;
      items.push({
        type: 'corporate_action',
        date: fmtDate(a.exDate),
        headline: buildCorporateActionLabel(a.actionType, a.subject),
        source: 'BharatStock',
        link: null,
        priceMove: moveOf(fmtDate(a.exDate)),
        direction: null,
        sentiment: null,
        driver: null,
        confidence: null,
      });
    }
  }

  // ── Insider / promoter trades (deterministic buy/sell, no AI) ──
  if (insiderResult.status === 'fulfilled') {
    for (const t of insiderResult.value.data) {
      const date = t.intimationDate ?? t.acquisitionToDate ?? t.acquisitionFromDate;
      if (!date) continue;
      items.push({
        type: 'insider_trade',
        date: fmtDate(date),
        headline: buildInsiderTradeLabel(t.acquirerName, t.transactionType, t.quantity),
        source: 'BharatStock',
        link: null,
        priceMove: moveOf(fmtDate(date)),
        direction: classifyTransactionDirection(t.transactionType),
        sentiment: null,
        driver: null,
        confidence: null,
      });
    }
  }

  // ── Bulk deals ──
  if (bulkResult.status === 'fulfilled') {
    for (const d of bulkResult.value.data) {
      if (!d.dealDate) continue;
      items.push({
        type: 'bulk_deal',
        date: fmtDate(d.dealDate),
        headline: buildDealLabel(d.clientName, d.buySell, d.quantity, d.avgPrice),
        source: 'BharatStock',
        link: null,
        priceMove: moveOf(fmtDate(d.dealDate)),
        direction: d.buySell?.toUpperCase() === 'BUY' ? 'buy' : d.buySell?.toUpperCase() === 'SELL' ? 'sell' : 'unknown',
        sentiment: null,
        driver: null,
        confidence: null,
      });
    }
  }

  // ── Block deals ──
  if (blockResult.status === 'fulfilled') {
    for (const d of blockResult.value.data) {
      if (!d.dealDate) continue;
      items.push({
        type: 'block_deal',
        date: fmtDate(d.dealDate),
        headline: buildDealLabel(d.clientName, d.buySell, d.quantity, d.avgPrice),
        source: 'BharatStock',
        link: null,
        priceMove: moveOf(fmtDate(d.dealDate)),
        direction: d.buySell?.toUpperCase() === 'BUY' ? 'buy' : d.buySell?.toUpperCase() === 'SELL' ? 'sell' : 'unknown',
        sentiment: null,
        driver: null,
        confidence: null,
      });
    }
  }

  items.sort((a, b) => b.date.localeCompare(a.date));

  // ── AI analysis: per-headline sentiment + one overall summary, in one call over the most-recent combined feed (news + disclosed events together) ──
  let aiAnalyzed = false;
  let overallSummary: string | null = null;
  let aiError: string | null = null;

  if (!isAiConfigured) {
    console.log(`[news:${symbol}] AI not configured (AI_API_KEY unset) — skipping analysis, raw feed only.`);
  } else if (items.length === 0) {
    console.log(`[news:${symbol}] AI configured but nothing to analyze.`);
  } else {
    const window = items.slice(0, AI_ANALYSIS_WINDOW);
    const forAnalysis: EventForAnalysis[] = window.map((item, i) => ({
      id: String(i),
      type: item.type,
      headline: item.headline,
      date: item.date,
      direction: item.direction,
      priceMoveT0: item.priceMove.t0,
      priceMoveT1: item.priceMove.t1,
      priceMoveT2: item.priceMove.t2,
    }));

    console.log(
      `[news:${symbol}] Analyzing ${window.length} feed items (of ${items.length}) via ${aiProviderName}/${aiModel}...`
    );
    const startedAt = Date.now();
    try {
      const analysis = await analyzeNewsWithRetry(symbol, forAnalysis);
      const byId = new Map(analysis.results.map((r) => [r.id, r]));
      for (let i = 0; i < window.length; i++) {
        const r = byId.get(String(i));
        if (r && window[i].type === 'news') {
          window[i].sentiment = r.sentiment;
          window[i].driver = r.driver;
          window[i].confidence = r.confidence;
        }
      }
      overallSummary = analysis.overallSummary || null;
      aiAnalyzed = true;
      console.log(
        `[news:${symbol}] AI analysis done: ${analysis.results.length} headlines classified, summary ${
          overallSummary ? `"${overallSummary.slice(0, 80)}${overallSummary.length > 80 ? '…' : ''}"` : '(none)'
        } in ${Date.now() - startedAt}ms.`
      );
    } catch (err) {
      // Sentiment/summary is a nice-to-have — an AI provider failure shouldn't sink the whole feed.
      // The reason is still persisted (aiError) so the API/UI can show it instead of a generic
      // "not configured" message, without needing to dig through server logs to find out why.
      aiError = err instanceof Error ? err.message : String(err);
      console.error(`[news:${symbol}] AI analysis FAILED via ${aiProviderName}/${aiModel}: ${aiError}`);
    }
  }

  const row: NewsCacheRow = {
    symbol,
    fetch_date: fetchDate,
    fetched_at: new Date().toISOString(),
    items,
    ai_analyzed: aiAnalyzed,
    overall_summary: overallSummary,
    ai_error: aiError,
  };

  const admin = getSupabaseAdmin();
  const { error: writeError } = await admin.from('news_cache').upsert(row, { onConflict: 'symbol,fetch_date' });
  if (writeError) {
    throw new Error(`Could not write news_cache: ${writeError.message}`);
  }

  return row;
}
