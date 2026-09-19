import { BharatStock } from 'bharatstock';

/**
 * Server-only BharatStock API client (fundamentals, technicals, corporate
 * actions, deals & insider trades). BHARATSTOCK_API_KEY is never prefixed
 * with NEXT_PUBLIC_, so this must only be imported from route handlers /
 * server-side lib code — never from a client component.
 */

const apiKey = process.env.BHARATSTOCK_API_KEY;

export const isBharatStockConfigured: boolean = Boolean(apiKey);

let client: BharatStock | null = null;

export function getBharatStock(): BharatStock {
  if (!isBharatStockConfigured) {
    throw new Error('BharatStock is not configured. Set BHARATSTOCK_API_KEY.');
  }
  if (!client) {
    client = new BharatStock({ apiKey: apiKey as string });
  }
  return client;
}
