import { NextRequest, NextResponse } from 'next/server';
import { getDatasetRows } from '@/lib/marketDataSync';
import { formatIstTimestamp, todayIstIso } from '@/lib/istDate';

function toNumOrNull(v: unknown): number | null {
  return v == null ? null : Number(v);
}

export async function GET(req: NextRequest): Promise<Response> {
  const date = req.nextUrl.searchParams.get('date') ?? todayIstIso();

  try {
    const rows = await getDatasetRows('most-active-price-spurts', date);
    const data = rows.map((row: Record<string, unknown>) => ({
      symbol: row.symbol,
      series: row.series,
      open_price: toNumOrNull(row.open_price),
      high_price: toNumOrNull(row.high_price),
      low_price: toNumOrNull(row.low_price),
      ltp: toNumOrNull(row.ltp),
      prev_price: toNumOrNull(row.prev_price),
      net_price: toNumOrNull(row.net_price),
      trade_quantity: toNumOrNull(row.trade_quantity),
      turnover: toNumOrNull(row.turnover),
      market_type: row.market_type,
      ca_ex_dt: row.ca_ex_dt,
      ca_purpose: row.ca_purpose,
      perChange: toNumOrNull(row.per_change),
    }));
    const timestamp = rows.length > 0 ? formatIstTimestamp(rows[0].fetched_at as string) : null;
    return NextResponse.json({ data, timestamp });
  } catch (error) {
    console.error('most-active/price-spurts read error:', error);
    return NextResponse.json({ error: 'Failed to load price spurts data' }, { status: 500 });
  }
}
