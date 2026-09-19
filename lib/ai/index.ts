import { createAnthropicProvider } from '@/lib/ai/anthropicProvider';
import { createOpenAiCompatibleProvider } from '@/lib/ai/openaiProvider';
import type { AiProvider, EventForAnalysis, NewsAnalysis } from '@/lib/ai/types';

/**
 * Configurable AI provider for news headline sentiment (lib/newsCache.ts).
 * Not tied to any one vendor — set via env vars, all optional:
 *
 *   AI_PROVIDER  'anthropic' | 'openai'  (default 'anthropic' if AI_API_KEY is set)
 *   AI_API_KEY   the key for that provider
 *   AI_MODEL     provider-specific model id (default depends on provider)
 *   AI_BASE_URL  override the endpoint — 'openai' provider + a base URL
 *                reaches any OpenAI-compatible service (Groq, Together,
 *                DeepSeek, Mistral, xAI, OpenRouter, Ollama, LM Studio, ...)
 *
 * Unset AI_API_KEY entirely and the news panel just shows raw news/events
 * with no sentiment — see isAiConfigured.
 */

type ProviderName = 'anthropic' | 'openai';

const DEFAULT_MODEL: Record<ProviderName, string> = {
  anthropic: 'claude-haiku-4-5',
  openai: 'gpt-4o-mini',
};

const apiKey = process.env.AI_API_KEY?.trim();
const baseUrl = process.env.AI_BASE_URL?.trim() || undefined;

const providerName: ProviderName = (() => {
  const configured = process.env.AI_PROVIDER?.trim().toLowerCase();
  if (configured === 'anthropic' || configured === 'openai') return configured;
  return 'anthropic';
})();

export const isAiConfigured: boolean = Boolean(apiKey);
export const aiProviderName: ProviderName = providerName;
export const aiModel: string = process.env.AI_MODEL?.trim() || DEFAULT_MODEL[providerName];

let provider: AiProvider | null = null;

function getProvider(): AiProvider {
  if (!apiKey) {
    throw new Error('AI is not configured. Set AI_API_KEY (and optionally AI_PROVIDER, AI_MODEL, AI_BASE_URL).');
  }
  if (!provider) {
    provider =
      providerName === 'openai'
        ? createOpenAiCompatibleProvider(apiKey, aiModel, baseUrl)
        : createAnthropicProvider(apiKey, aiModel, baseUrl);
  }
  return provider;
}

/** Throws on any provider error — callers should catch and degrade to raw headlines (see lib/newsCache.ts). */
export async function analyzeNews(symbol: string, items: EventForAnalysis[]): Promise<NewsAnalysis> {
  return getProvider().analyzeNews(symbol, items);
}

export type { EventForAnalysis, NewsAnalysis, Sentiment, SentimentResult } from '@/lib/ai/types';
