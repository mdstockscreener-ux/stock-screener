import { NextRequest, NextResponse } from 'next/server';
import { getDatasetRows } from '@/lib/marketDataSync';
import { mapSecurityDbRow } from '@/lib/mostActiveRowMapping';
import { formatIstTimestamp, todayIstIso } from '@/lib/istDate';

export async function GET(req: NextRequest): Promise<Response> {
  const date = req.nextUrl.searchParams.get('date') ?? todayIstIso();

  try {
    const rows = await getDatasetRows('most-active-etf', date);
    const data = rows.map(mapSecurityDbRow);
    const timestamp = rows.length > 0 ? formatIstTimestamp(rows[0].fetched_at as string) : null;
    return NextResponse.json({ data, timestamp });
  } catch (error) {
    console.error('most-active/etf read error:', error);
    return NextResponse.json({ error: 'Failed to load most active ETF data' }, { status: 500 });
  }
}
