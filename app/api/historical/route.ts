import { fetchFromNse } from '@/lib/nseProxy';

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol');
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const series = searchParams.get('series') || 'ALL';

  if (!symbol || !from || !to) {
    return Response.json(
      { error: 'Missing required parameters: symbol, from, to' },
      { status: 400 }
    );
  }

  const url = `https://www.nseindia.com/api/historicalOR/generateSecurityWiseHistoricalData?from=${from}&to=${to}&symbol=${encodeURIComponent(
    symbol
  )}&type=priceVolumeDeliverable&series=${series}`;

  try {
    const result = await fetchFromNse(url, symbol);
    return new Response(result.body, {
      status: result.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('NSE proxy error:', error);
    return Response.json({ error: 'Failed to fetch data from NSE' }, { status: 500 });
  }
}
