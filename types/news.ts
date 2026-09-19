import type { PriceMove, TransactionDirection } from '@/utils/news';
import type { Sentiment } from '@/lib/ai';

export type NewsEventType = 'news' | 'corporate_action' | 'insider_trade' | 'bulk_deal' | 'block_deal';

/** One row in the combined news/events feed (plan doc §4). */
export interface NewsEventItem {
  type: NewsEventType;
  date: string;
  headline: string;
  source: string | null;
  link: string | null;
  priceMove: PriceMove;
  /** Only set for insider_trade/bulk_deal/block_deal — a deterministic read off the transaction's own type field, not an LLM guess. */
  direction: TransactionDirection | null;
  /** Only set for type 'news', and only when aiAnalyzed is true. */
  sentiment: Sentiment | null;
  driver: string | null;
  confidence: number | null;
}

/** Response shape of GET /api/news/[symbol]. */
export interface NewsResponse {
  symbol: string;
  fetchDate: string;
  fetchedAt: string;
  /** False when no AI provider is configured (or the call failed) — items still render, just without sentiment/driver/confidence/overallSummary. */
  aiAnalyzed: boolean;
  /** 2-4 sentences synthesizing the whole feed — null unless aiAnalyzed. */
  overallSummary: string | null;
  /** Set when an AI provider WAS configured but the call failed — distinguishes "not set up" from "attempted and broke". Null otherwise. */
  aiError: string | null;
  /** Combined feed across all event types, most recent first. */
  items: NewsEventItem[];
}

export interface NewsErrorResponse {
  error: string;
}
