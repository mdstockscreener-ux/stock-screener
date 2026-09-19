import { NextRequest, NextResponse } from 'next/server';
import { getBharatStock } from '@/lib/bharatstock';

/**
 * Fuzzy symbol/company-name search against BharatStock's own database —
 * a fallback for the Stock Analysis tab's search box when the local
 * static NSE list (app_data/EQUITY_L.json, a point-in-time snapshot) has
 * no match. That list and BharatStock's coverage are two independent
 * sources — a symbol can be genuinely NSE-listed and locally findable but
 * missing from BharatStock (too new for their pipeline), or the reverse
 * (BharatStock covers BSE-only/recently-listed names the local snapshot
 * predates). This route is the live source of truth for "can we actually
 * analyze this" — see components/StockAnalysisSearch.tsx.
 *
 * Costs one BharatStock call per request — the frontend only calls this
 * on a local-search miss, debounced, never on every keystroke.
 */
export async function GET(req: NextRequest): Promise<Response> {
  const q = req.nextUrl.searchParams.get('q')?.trim();
  if (!q) {
    return NextResponse.json({ results: [] });
  }

  try {
    const client = getBharatStock();
    const hits = await client.search(q, { limit: 10 });
    const results = hits.map((h) => ({
      symbol: h.symbol,
      name: h.companyName,
      exchange: h.exchange,
    }));
    return NextResponse.json({ results });
  } catch (error) {
    // Fail soft — this is a convenience fallback mid-typing, not a page a user is waiting on.
    console.error(`stock-search error for "${q}":`, error);
    return NextResponse.json({ results: [] });
  }
}
