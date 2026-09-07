import { NextRequest } from 'next/server';
import { fetchFromNse } from '@/lib/nseProxy';

export async function GET(req: NextRequest): Promise<Response> {
  const index = req.nextUrl.searchParams.get('index') ?? 'volume';
  const url = `https://www.nseindia.com/api/live-analysis-most-active-sme?index=${index}`;
  try {
    const result = await fetchFromNse(url, 'most-active-sme');
    return new Response(result.body, {
      status: result.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('NSE most-active/sme proxy error:', error);
    return Response.json({ error: 'Failed to fetch data from NSE' }, { status: 500 });
  }
}
