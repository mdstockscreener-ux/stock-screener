import type { ComparisonItem, RatioSnapshot, StockDetail } from 'bharatstock';
import type { PeerRanking, PePercentile, QuarterGrowthRow } from '@/utils/fundamentals';

/** Response shape of GET /api/analyze/[symbol]. */
export interface AnalyzeResponse {
  symbol: string;
  fetchDate: string;
  fetchedAt: string;
  stockDetail: StockDetail;
  ratios: RatioSnapshot | null;
  selfPe: PePercentile;
  sector: string | null;
  peers: ComparisonItem[];
  peerRanking: PeerRanking;
  quarterlyGrowth: QuarterGrowthRow[];
}

export interface AnalyzeErrorResponse {
  error: string;
}
