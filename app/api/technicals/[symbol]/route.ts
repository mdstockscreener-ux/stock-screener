import { NextRequest, NextResponse } from 'next/server';
import { BharatStockError, NotFoundError, RateLimitError } from 'bharatstock';
import { getTechnicals } from '@/lib/technicalsCache';
import { buildChartSeries, compute52wRange, computeMomentum, computeTrend } from '@/utils/technicals';
import { todayIstIso } from '@/lib/istDate';
import type { TechnicalsResponse } from '@/types/technicals';
import type { DailyPricePoint, TechnicalIndicatorPoint } from 'bharatstock';

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

  try {
    const cached = await getTechnicals(symbol, fetchDate);
    const prices = (cached.prices_1y ?? []) as DailyPricePoint[];
    const sma50 = (cached.sma50_series ?? []) as TechnicalIndicatorPoint[];
    const sma200 = (cached.sma200_series ?? []) as TechnicalIndicatorPoint[];

    const response: TechnicalsResponse = {
      symbol,
      fetchDate,
      fetchedAt: cached.fetched_at,
      range: compute52wRange(prices),
      trend: computeTrend(sma50, sma200),
      momentum: computeMomentum(sma50),
      series: buildChartSeries(prices, sma50, sma200),
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error(`technicals error for ${symbol}:`, error);

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

    const message = error instanceof Error ? error.message : 'Failed to load technicals';
    const status = message.includes('not configured') ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
