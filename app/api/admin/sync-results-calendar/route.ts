import { NextResponse } from 'next/server';
import { runResultsCalendarSync } from '@/lib/resultsCalendarSync';

export async function POST(): Promise<Response> {
  try {
    const result = await runResultsCalendarSync();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error('Admin sync failed for results-calendar:', error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Sync failed' },
      { status: 500 }
    );
  }
}
