import { fetchFromNse } from '@/lib/nseProxy';

const NSE_URL = 'https://www.nseindia.com/api/live-analysis-most-active-etf?index=volume';

export async function GET(): Promise<Response> {
  try {
    const result = await fetchFromNse(NSE_URL, 'most-active-etf');
    return new Response(result.body, {
      status: result.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('NSE most-active/etf proxy error:', error);
    return Response.json({ error: 'Failed to fetch data from NSE' }, { status: 500 });
  }
}
