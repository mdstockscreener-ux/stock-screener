import { formatPrice, formatNumber } from '@/utils/formatters';
import { IconTrendUp, IconChart, IconDelivery, IconVolume } from '@/components/icons';
import type { StockRecord } from '@/types';

const CARD_ICONS = [IconTrendUp, IconChart, IconDelivery, IconVolume, IconChart, IconTrendUp];

interface StatsCardsProps {
  data: StockRecord[];
  deliveryMultiplier?: number;
}

export default function StatsCards({ data, deliveryMultiplier = 3 }: StatsCardsProps): JSX.Element | null {
  if (!data.length) return null;

  const latest = data[data.length - 1];
  const first = data[0];
  const periodChange = latest.close - first.close;
  const periodChangePct = (periodChange / first.close) * 100;
  const high52 = Math.max(...data.map((d) => d.high));
  const low52 = Math.min(...data.map((d) => d.low));

  const avgDeliveryQty = data.reduce((s, d) => s + d.deliveryQty, 0) / data.length;
  const threshold = deliveryMultiplier * avgDeliveryQty;
  const highDeliveryDays = data.filter((d) => d.deliveryQty > threshold);
  const highDeliveryDayCount = highDeliveryDays.length;
  const avgVwapHighDelivery =
    highDeliveryDayCount > 0
      ? highDeliveryDays.reduce((s, d) => s + d.vwap, 0) / highDeliveryDayCount
      : null;

  const currentPrice = latest.close;
  const vwapChangePct =
    avgVwapHighDelivery !== null
      ? ((currentPrice - avgVwapHighDelivery) / avgVwapHighDelivery) * 100
      : null;
  const within10Pct = vwapChangePct !== null ? Math.abs(vwapChangePct) <= 10 : null;
  const priceVsVwap =
    vwapChangePct === null
      ? null
      : vwapChangePct > 0
        ? 'Current price higher than VWAP'
        : vwapChangePct < 0
          ? 'Current price lower than VWAP'
          : 'Current price equals VWAP';

  const multiplierLabel = String(deliveryMultiplier);

  const cards = [
    {
      label: 'Period Change',
      value: `${periodChange >= 0 ? '+' : ''}${periodChange.toFixed(2)}`,
      sub: `${periodChangePct >= 0 ? '+' : ''}${periodChangePct.toFixed(2)}%`,
      positive: periodChange >= 0,
    },
    {
      label: 'Period High / Low',
      value: formatPrice(high52),
      sub: `Low: ${formatPrice(low52)}`,
    },
    {
      label: 'Average Delivery Quantity',
      value: formatNumber(Math.round(avgDeliveryQty)),
      sub: `Across ${data.length} trading days`,
    },
    {
      label: 'High Delivery Days',
      value: String(highDeliveryDayCount),
      sub: `Delivery qty > ${multiplierLabel}× average`,
    },
    {
      label: 'Avg VWAP (High Delivery Days)',
      value: avgVwapHighDelivery !== null ? formatPrice(avgVwapHighDelivery) : '—',
      sub:
        highDeliveryDayCount > 0
          ? `From ${highDeliveryDayCount} day${highDeliveryDayCount === 1 ? '' : 's'}`
          : 'No qualifying days',
    },
    {
      label: 'Within 10% of Current Price',
      value: within10Pct === null ? '—' : within10Pct ? 'Yes' : 'No',
      sub:
        vwapChangePct !== null
          ? `${vwapChangePct >= 0 ? '+' : ''}${vwapChangePct.toFixed(2)}% · ${priceVsVwap}`
          : 'No qualifying days',
      positive: within10Pct === true ? true : within10Pct === false ? false : undefined,
    },
  ];

  return (
    <div className="scan-cards">
      {cards.map((card, i) => {
        const Icon = CARD_ICONS[i % CARD_ICONS.length];
        return (
          <div key={card.label} className="scan-card">
            <div className="scan-card-icon">
              <Icon />
            </div>
            <div className="scan-card-body">
              <span className="scan-card-title">{card.label}</span>
              <span className="scan-card-value">{card.value}</span>
              <span
                className={`scan-card-sub ${
                  card.positive !== undefined ? (card.positive ? 'positive' : 'negative') : ''
                }`}
              >
                {card.sub}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
