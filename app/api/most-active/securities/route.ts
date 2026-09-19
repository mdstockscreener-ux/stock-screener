import { NextRequest, NextResponse } from 'next/server';
import { getDatasetRows } from '@/lib/marketDataSync';
import { mapSecurityDbRow } from '@/lib/mostActiveRowMapping';
import { formatIstTimestamp, todayIstIso } from '@/lib/istDate';

export async function GET(req: NextRequest): Promise<Response> {
  const index = req.nextUrl.searchParams.get('index') ?? 'value';
  const date = req.nextUrl.searchParams.get('date') ?? todayIstIso();
  const datasetKey = index === 'volume' ? 'most-active-securities-volume' : 'most-active-securities-value';

  try {
    const rows = await getDatasetRows(datasetKey, date);
    const data = rows.map(mapSecurityDbRow);
    const timestamp = rows.length > 0 ? formatIstTimestamp(rows[0].fetched_at as string) : null;
    return NextResponse.json({ data, timestamp });
  } catch (error) {
    console.error('most-active/securities read error:', error);
    return NextResponse.json({ error: 'Failed to load most active securities data' }, { status: 500 });
  }
}
