import { XMLParser } from 'fast-xml-parser';

/**
 * Google News RSS — free, no API key, headline + date + link + source
 * (plan doc §4.1). BharatStock doesn't provide general news headlines, so
 * this stays alongside it for the news module.
 */

export interface NewsHeadline {
  headline: string;
  link: string | null;
  source: string | null;
  pubDate: string;
}

const parser = new XMLParser({ ignoreAttributes: false, textNodeName: '#text', cdataPropName: '__cdata' });

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function textOf(node: unknown): string | null {
  if (typeof node === 'string') return node;
  if (node && typeof node === 'object') {
    const obj = node as Record<string, unknown>;
    if (typeof obj.__cdata === 'string') return obj.__cdata;
    if (typeof obj['#text'] === 'string') return obj['#text'];
  }
  return null;
}

/** Fetches and parses Google News RSS for a search query (e.g. a company name), most-recent items as returned by Google. */
export async function fetchGoogleNewsRss(query: string, limit = 15): Promise<NewsHeadline[]> {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-IN&gl=IN&ceid=IN:en`;

  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/rss+xml, text/xml' } });
  if (!res.ok) {
    throw new Error(`Google News RSS returned HTTP ${res.status}`);
  }

  const xml = await res.text();
  const parsed = parser.parse(xml) as { rss?: { channel?: { item?: unknown } } };
  const rawItems = parsed?.rss?.channel?.item;
  const items = Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : [];

  return items
    .slice(0, limit)
    .map((raw): NewsHeadline | null => {
      const item = raw as Record<string, unknown>;
      const headline = textOf(item.title);
      if (!headline) return null;

      const link = textOf(item.link);
      const pubDateRaw = textOf(item.pubDate);
      const pubDate = pubDateRaw && !Number.isNaN(Date.parse(pubDateRaw)) ? new Date(pubDateRaw).toISOString() : null;

      let source: string | null = null;
      const sourceNode = item.source;
      if (typeof sourceNode === 'string') source = sourceNode;
      else if (sourceNode && typeof sourceNode === 'object') source = textOf(sourceNode);

      if (!pubDate) return null;
      return { headline, link, source, pubDate };
    })
    .filter((h): h is NewsHeadline => h !== null);
}
