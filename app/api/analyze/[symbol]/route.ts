import { NextRequest, NextResponse } from 'next/server';
import { BharatStockError, NotFoundError, RateLimitError } from 'bharatstock';
import { getFundamentals, getSectorPeers } from '@/lib/fundamentalsCache';
import { computePeerPeRanking, computeQuarterlyGrowth, computeSelfPePercentile } from '@/utils/fundamentals';
import { todayIstIso } from '@/lib/istDate';
import type { AnalyzeResponse } from '@/types/fundamentals';
import type { FinancialPeriod } from 'bharatstock';

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
    const cached = await getFundamentals(symbol, fetchDate);
    const quarterly = (cached.financials_quarterly ?? []) as FinancialPeriod[];
    const sector = cached.sector ?? cached.stock_detail?.sector ?? null;
    const peers = sector ? await getSectorPeers(sector, fetchDate) : [];
    const currentPe = cached.ratios?.peRatio ?? cached.stock_detail?.metrics?.peRatio ?? null;

    const response: AnalyzeResponse = {
      symbol,
      fetchDate,
      fetchedAt: cached.fetched_at,
      stockDetail: cached.stock_detail as AnalyzeResponse['stockDetail'],
      ratios: cached.ratios,
      selfPe: computeSelfPePercentile(currentPe, quarterly),
      sector,
      peers,
      peerRanking: computePeerPeRanking(symbol, peers),
      quarterlyGrowth: computeQuarterlyGrowth(quarterly),
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error(`analyze error for ${symbol}:`, error);

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

    const message = error instanceof Error ? error.message : 'Failed to load fundamentals';
    const status = message.includes('not configured') ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
