import OpenAI from 'openai';
import { ANALYZE_NEWS_SCHEMA, parseNewsAnalysis, SYSTEM_PROMPT } from '@/lib/ai/types';
import type { AiProvider, EventForAnalysis, NewsAnalysis } from '@/lib/ai/types';

/**
 * Talks to any OpenAI-compatible chat-completions endpoint via forced
 * function calling — the official `openai` SDK against a `baseUrl`
 * override, which is how OpenAI, Groq, Together, Fireworks, DeepSeek,
 * Mistral, xAI, OpenRouter, and local runtimes (Ollama, LM Studio, vLLM)
 * are all reachable through one code path. Defaults to OpenAI's own API
 * when no baseUrl is given.
 */
export function createOpenAiCompatibleProvider(apiKey: string, model: string, baseUrl?: string): AiProvider {
  const client = new OpenAI({ apiKey, ...(baseUrl ? { baseURL: baseUrl } : {}) });

  const tool: OpenAI.Chat.Completions.ChatCompletionTool = {
    type: 'function',
    function: {
      name: 'analyze_news',
      description: 'Records per-headline sentiment plus one overall summary of the whole feed.',
      parameters: ANALYZE_NEWS_SCHEMA,
    },
  };

  return {
    async analyzeNews(symbol: string, items: EventForAnalysis[]): Promise<NewsAnalysis> {
      if (items.length === 0) return { results: [], overallSummary: '' };

      const response = await client.chat.completions.create({
        model,
        max_tokens: 4096,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Symbol: ${symbol}\n\nFeed (most-recent-first):\n${JSON.stringify(items, null, 2)}` },
        ],
        tools: [tool],
        tool_choice: { type: 'function', function: { name: 'analyze_news' } },
      });

      const toolCall = response.choices[0]?.message?.tool_calls?.[0];
      if (!toolCall || toolCall.type !== 'function') {
        throw new Error('Model did not return an analyze_news function call');
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(toolCall.function.arguments);
      } catch {
        throw new Error('analyze_news function call arguments were not valid JSON');
      }

      return parseNewsAnalysis(parsed);
    },
  };
}
