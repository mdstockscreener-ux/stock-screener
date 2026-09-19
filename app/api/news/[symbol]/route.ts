import { NextRequest, NextResponse } from 'next/server';
import { BharatStockError, NotFoundError, RateLimitError } from 'bharatstock';
import { getNews } from '@/lib/newsCache';
import { getFundamentals } from '@/lib/fundamentalsCache';
import { todayIstIso } from '@/lib/istDate';
import type { NewsResponse } from '@/types/news';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
): Promise<Response> {
  const { symbol: rawSymbol } = await params;
  const symbol = decodeURIComponent(rawSymbol).trim().toUpperCase();
  if (!symbol) {
    return NextResponse.json({ error: 'Missing symbol' }, { status: 400 });
  }

  const fetchDate = req.nextUrl.searchParams.get('date') ?? todayIstIso();

  // Best-effort: a better Google News query beats the bare ticker, but a
  // fundamentals-fetch failure shouldn't block the news panel from loading.
  let companyName = symbol;
  try {
    const fundamentals = await getFundamentals(symbol, fetchDate);
    companyName = fundamentals.stock_detail?.companyName ?? symbol;
  } catch {
    // fall back to the symbol
  }

  try {
    const cached = await getNews(symbol, companyName, fetchDate);

    const response: NewsResponse = {
      symbol,
      fetchDate,
      fetchedAt: cached.fetched_at,
      aiAnalyzed: cached.ai_analyzed,
      overallSummary: cached.overall_summary,
      aiError: cached.ai_error,
      items: cached.items,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error(`news error for ${symbol}:`, error);

    if (error instanceof NotFoundError) {
      return NextResponse.json({ error: `Symbol not found on BharatStock: ${symbol}` }, { status: 404 });
    }
    if (error instanceof RateLimitError) {
      return NextResponse.json(
        { error: 'BharatStock daily rate limit reached. Try again later.' },
        { status: 429 }
      );
    }
    if (error instanceof BharatStockError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode ?? 502 });
    }

    const message = error instanceof Error ? error.message : 'Failed to load news';
    const status = message.includes('not configured') ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
