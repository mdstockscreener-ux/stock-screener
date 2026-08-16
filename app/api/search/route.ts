import { searchNse } from '@/lib/nseProxy';

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q');

  if (!q) {
    return Response.json({ error: 'Missing query parameter "q"' }, { status: 400 });
  }

  try {
    const result = await searchNse(q);
    return new Response(result.body, {
      status: result.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('NSE search error:', error);
    return Response.json({ error: 'Failed to fetch search results from NSE' }, { status: 500 });
  }
}
