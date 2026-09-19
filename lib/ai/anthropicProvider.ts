import Anthropic from '@anthropic-ai/sdk';
import { ANALYZE_NEWS_SCHEMA, parseNewsAnalysis, SYSTEM_PROMPT } from '@/lib/ai/types';
import type { AiProvider, EventForAnalysis, NewsAnalysis } from '@/lib/ai/types';

/**
 * Uses forced tool use for structured output: Claude can only respond by
 * calling `analyze_news`, so the result is guaranteed to match the schema
 * rather than hoping the model writes valid JSON in prose.
 */
export function createAnthropicProvider(apiKey: string, model: string, baseUrl?: string): AiProvider {
  const client = new Anthropic({ apiKey, ...(baseUrl ? { baseURL: baseUrl } : {}) });

  const tool: Anthropic.Tool = {
    name: 'analyze_news',
    description: 'Records per-headline sentiment plus one overall summary of the whole feed.',
    input_schema: ANALYZE_NEWS_SCHEMA,
  };

  return {
    async analyzeNews(symbol: string, items: EventForAnalysis[]): Promise<NewsAnalysis> {
      if (items.length === 0) return { results: [], overallSummary: '' };

      const response = await client.messages.create({
        model,
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        tools: [tool],
        tool_choice: { type: 'tool', name: 'analyze_news' },
        messages: [{ role: 'user', content: `Symbol: ${symbol}\n\nFeed (most-recent-first):\n${JSON.stringify(items, null, 2)}` }],
      });

      const toolUse = response.content.find((block): block is Anthropic.ToolUseBlock => block.type === 'tool_use');
      if (!toolUse) {
        throw new Error('Claude did not return an analyze_news tool call');
      }

      return parseNewsAnalysis(toolUse.input);
    },
  };
}
