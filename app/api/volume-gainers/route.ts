import { fetchFromNse } from '@/lib/nseProxy';

const NSE_URL = 'https://www.nseindia.com/api/live-analysis-volume-gainers';

export async function GET(): Promise<Response> {
  try {
    const result = await fetchFromNse(NSE_URL, 'volume-gainers');
    return new Response(result.body, {
      status: result.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('NSE volume-gainers proxy error:', error);
    return Response.json({ error: 'Failed to fetch data from NSE' }, { status: 500 });
  }
}
