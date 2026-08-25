/**
 * POST /api/backtest — resolve bars, run the Advanced Darvas Box engine, return both.
 *
 * Server-side because the fallback data fetch has to be: Yahoo's endpoints are
 * not CORS-open and reject browser-shaped requests, so the browser cannot do
 * this leg itself.
 */

import { BarResolutionError, resolveBars } from '@/lib/backtest/data';
import { BacktestParamError, runBacktest } from '@/lib/backtest/engine';
import type { BacktestParams, BacktestResponse } from '@/types/backtest';

// yahoo-finance2 needs Node APIs, and every run reads live data.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** The strategy needs at least one completed week before it can trigger anything. */
const MIN_BARS = 10;

interface RequestBody {
  symbol?: unknown;
  start?: unknown;
  end?: unknown;
  params?: unknown;
}

class BadRequest extends Error {}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new BadRequest(`"${field}" is required.`);
  }
  return value.trim();
}

/**
 * Pulls the five strategy numbers out of the request body.
 *
 * Every one is required. There is no server-side default to fall back on —
 * a missing field means the form did not send it, and quietly substituting a
 * number would report results for parameters the user never chose.
 */
function requireParams(raw: unknown): BacktestParams {
  if (typeof raw !== 'object' || raw === null) {
    throw new BadRequest('"params" must be an object with the strategy settings.');
  }
  const source = raw as Record<string, unknown>;

  const pick = (field: keyof BacktestParams, label: string): number => {
    const value = source[field];
    const parsed = typeof value === 'string' ? Number(value) : value;
    if (typeof parsed !== 'number' || !Number.isFinite(parsed)) {
      throw new BadRequest(`${label} is required and must be a number.`);
    }
    return parsed;
  };

  return {
    startingCapital: pick('startingCapital', 'Starting capital'),
    trancheCount: pick('trancheCount', 'Tranche count'),
    profitTargetPct: pick('profitTargetPct', 'Profit target %'),
    stopLossPct: pick('stopLossPct', 'Stop-loss %'),
    ignorableRangePct: pick('ignorableRangePct', 'Ignorable-range %'),
  };
}

export async function POST(request: Request): Promise<Response> {
  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return Response.json({ error: 'Request body must be JSON.' }, { status: 400 });
  }

  let symbol: string;
  let start: string;
  let end: string;
  let params: BacktestParams;

  try {
    symbol = requireString(body.symbol, 'symbol');
    start = requireString(body.start, 'start');
    end = requireString(body.end, 'end');
    params = requireParams(body.params);
  } catch (err) {
    const message = err instanceof BadRequest ? err.message : 'Invalid request.';
    return Response.json({ error: message }, { status: 400 });
  }

  try {
    const { bars, provenance } = await resolveBars(symbol, start, end);

    if (bars.length < MIN_BARS) {
      return Response.json(
        {
          error:
            `Only ${bars.length} bar(s) available for ${provenance.symbol} in this range. ` +
            'The strategy needs at least one completed week before it can trigger, so a ' +
            'window this short cannot produce a meaningful result.',
        },
        { status: 422 }
      );
    }

    const result = runBacktest(bars, params);
    const payload: BacktestResponse = { data: provenance, result };
    return Response.json(payload);
  } catch (err) {
    if (err instanceof BacktestParamError) {
      return Response.json({ error: err.message }, { status: 400 });
    }
    if (err instanceof BarResolutionError) {
      return Response.json({ error: err.message }, { status: 422 });
    }
    console.error('Backtest failed:', err);
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: `Backtest failed: ${message}` }, { status: 500 });
  }
}
