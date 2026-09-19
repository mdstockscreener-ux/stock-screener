import { NextResponse } from 'next/server';
import { runSync, SYNC_DATASETS } from '@/lib/marketDataSync';

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ dataset: string }> }
): Promise<Response> {
  const { dataset } = await params;

  if (!SYNC_DATASETS[dataset]) {
    return NextResponse.json({ ok: false, error: `Unknown dataset: ${dataset}` }, { status: 404 });
  }

  try {
    const result = await runSync(dataset);
    return NextResponse.json({ ok: true, dataset, ...result });
  } catch (error) {
    console.error(`Admin sync failed for ${dataset}:`, error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Sync failed' },
      { status: 500 }
    );
  }
}
