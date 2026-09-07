import { NextRequest } from 'next/server';
import { fetchFromNse } from '@/lib/nseProxy';

export async function GET(req: NextRequest): Promise<Response> {
  const index = req.nextUrl.searchParams.get('index') ?? 'value';
  const url = `https://www.nseindia.com/api/live-analysis-most-active-securities?index=${index}`;
  try {
    const result = await fetchFromNse(url, 'most-active-securities');
    return new Response(result.body, {
      status: result.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('NSE most-active/securities proxy error:', error);
    return Response.json({ error: 'Failed to fetch data from NSE' }, { status: 500 });
  }
}
