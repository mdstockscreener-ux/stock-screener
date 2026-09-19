import type { ChartPoint, MomentumRead, RangePosition, TrendRead } from '@/utils/technicals';

/** Response shape of GET /api/technicals/[symbol]. */
export interface TechnicalsResponse {
  symbol: string;
  fetchDate: string;
  fetchedAt: string;
  range: RangePosition;
  trend: TrendRead;
  momentum: MomentumRead;
  /** ~1y of OHLC + SMA-50/SMA-200, oldest first. The client slices this for the chart's range toggle. */
  series: ChartPoint[];
}

export interface TechnicalsErrorResponse {
  error: string;
}
