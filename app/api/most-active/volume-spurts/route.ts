import { NextRequest, NextResponse } from 'next/server';
import { getDatasetRows } from '@/lib/marketDataSync';
import { formatIstTimestamp, todayIstIso } from '@/lib/istDate';

// Same NSE endpoint (and DB table) as /api/volume-gainers — VolumeSpurtRow
// and VolumeGainerRow are structurally identical.
function orZero(v: unknown): number {
  return v == null ? 0 : Number(v);
}

export async function GET(req: NextRequest): Promise<Response> {
  const date = req.nextUrl.searchParams.get('date') ?? todayIstIso();

  try {
    const rows = await getDatasetRows('volume-gainers', date);
    const data = rows.map((row: Record<string, unknown>) => ({
      symbol: row.symbol,
      companyName: row.company_name,
      volume: orZero(row.volume),
      week1AvgVolume: orZero(row.week1_avg_volume),
      week1volChange: orZero(row.week1_vol_change),
      week2AvgVolume: orZero(row.week2_avg_volume),
      week2volChange: orZero(row.week2_vol_change),
      ltp: orZero(row.ltp),
      pChange: orZero(row.p_change),
      turnover: orZero(row.turnover),
    }));
    const timestamp = rows.length > 0 ? formatIstTimestamp(rows[0].fetched_at as string) : null;
    return NextResponse.json({ data, timestamp });
  } catch (error) {
    console.error('most-active/volume-spurts read error:', error);
    return NextResponse.json({ error: 'Failed to load volume spurts data' }, { status: 500 });
  }
}
