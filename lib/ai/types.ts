/** Provider-agnostic types shared by every lib/ai/*Provider.ts implementation. */

export type EventKind = 'news' | 'corporate_action' | 'insider_trade' | 'bulk_deal' | 'block_deal';

/** One event on the combined feed, as fed to the model — news and disclosed events alike, so the summary can weigh them together. */
export interface EventForAnalysis {
  /** Only meaningful for type 'news' — that's the only type the model returns a per-item result for. */
  id: string;
  type: EventKind;
  headline: string;
  date: string;
  /** Set for insider_trade/bulk_deal/block_deal — already known deterministically, given as context, not asked to be reclassified. */
  direction: 'buy' | 'sell' | 'unknown' | null;
  priceMoveT0: number | null;
  priceMoveT1: number | null;
  priceMoveT2: number | null;
}

export type Sentiment = 'positive' | 'negative' | 'neutral';

export interface SentimentResult {
  id: string;
  sentiment: Sentiment;
  driver: string;
  confidence: number;
}

export interface NewsAnalysis {
  /** One result per type:'news' item given — corporate actions/insider trades/deals aren't reclassified, they're already unambiguous. */
  results: SentimentResult[];
  /** 2-4 sentences synthesizing the whole feed — the takeaway a reader wants without scanning every row. */
  overallSummary: string;
}

export const SYSTEM_PROMPT = `You are a financial-news analyst for Indian equities. You are given a stock's recent news headlines plus its disclosed corporate actions, insider/promoter trades, and bulk/block deals — most-recent-first. Each item carries the stock's actual price move on its date (T0) and the following two trading days (T1, T2), as percentages, and disclosed trades/deals also carry a known "direction" (buy/sell).

Two tasks, both in one call:

1. For each item of type "news" only, judge whether the headline plausibly explains its price move — never invent an effect from the headline alone. If there's no price move data (all three null) or the move is negligible, say so in "driver" and give it low confidence. Classify sentiment as how the news reads for the company, not the sign of the price move. Do not return a result for corporate_action/insider_trade/bulk_deal/block_deal items — those aren't reclassified.

2. Write one overallSummary (2-4 sentences) synthesizing the WHOLE feed — news sentiment plus the disclosed trades/deals. Weigh insider/promoter trades and bulk/block deals more heavily than generic media coverage: they are actual disclosed transactions, not commentary. Call out where they reinforce or contradict the news tone. If most items have low-confidence or no price-move link, say the picture is inconclusive rather than forcing a narrative.

Call analyze_news exactly once.`;

/** JSON Schema for the analyze_news tool/function — shared by every provider so the contract stays in one place. */
export const ANALYZE_NEWS_SCHEMA = {
  type: 'object' as const,
  properties: {
    results: {
      type: 'array' as const,
      description: 'One entry per type:"news" item given, in the same order. Omit corporate_action/insider_trade/bulk_deal/block_deal items entirely.',
      items: {
        type: 'object' as const,
        properties: {
          id: { type: 'string' as const, description: 'The id of the news item this result is for.' },
          sentiment: { type: 'string' as const, enum: ['positive', 'negative', 'neutral'] },
          driver: {
            type: 'string' as const,
            description: 'One short phrase naming the likely driver, e.g. "Q2 earnings beat" or "no clear driver".',
          },
          confidence: {
            type: 'number' as const,
            description: '0 to 1. Low when there is no matching price move to corroborate the headline.',
          },
        },
        required: ['id', 'sentiment', 'driver', 'confidence'],
      },
    },
    overallSummary: {
      type: 'string' as const,
      description:
        '2-4 sentences synthesizing the whole feed (news + disclosed trades/deals) — the takeaway, not a list.',
    },
  },
  required: ['results', 'overallSummary'],
};

/** Validates and clamps whatever a provider's tool call handed back — never trust it wire-for-wire. */
export function parseNewsAnalysis(raw: unknown): NewsAnalysis {
  const input = raw as { results?: unknown; overallSummary?: unknown };
  const validSentiments = new Set<Sentiment>(['positive', 'negative', 'neutral']);

  const results = Array.isArray(input.results)
    ? input.results
        .filter((r): r is SentimentResult => {
          const row = r as Partial<SentimentResult>;
          return (
            typeof row.id === 'string' &&
            typeof row.sentiment === 'string' &&
            validSentiments.has(row.sentiment as Sentiment) &&
            typeof row.driver === 'string' &&
            typeof row.confidence === 'number'
          );
        })
        .map((r) => ({ ...r, confidence: Math.max(0, Math.min(1, r.confidence)) }))
    : [];

  const overallSummary = typeof input.overallSummary === 'string' ? input.overallSummary.trim() : '';

  return { results, overallSummary };
}

/** A provider implements exactly this — the dispatcher in lib/ai/index.ts doesn't know anything else about it. */
export interface AiProvider {
  analyzeNews(symbol: string, items: EventForAnalysis[]): Promise<NewsAnalysis>;
}
