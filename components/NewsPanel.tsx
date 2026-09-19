'use client';

import type { NewsEventItem, NewsEventType } from '@/types/news';

function fmtPct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;
}

function pctClass(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '';
  return n >= 0 ? 'sa-positive' : 'sa-negative';
}

const TYPE_LABEL: Record<NewsEventType, string> = {
  news: 'News',
  corporate_action: 'Corporate Action',
  insider_trade: 'Insider Trade',
  bulk_deal: 'Bulk Deal',
  block_deal: 'Block Deal',
};

const TYPE_CLASS: Record<NewsEventType, string> = {
  news: 'sa-tag-news',
  corporate_action: 'sa-tag-corp',
  insider_trade: 'sa-tag-insider',
  bulk_deal: 'sa-tag-deal',
  block_deal: 'sa-tag-deal',
};

interface NewsPanelProps {
  items: NewsEventItem[];
  aiAnalyzed: boolean;
  overallSummary: string | null;
  aiError: string | null;
}

export default function NewsPanel({ items, aiAnalyzed, overallSummary, aiError }: NewsPanelProps): JSX.Element {
  return (
    <div className="bos-panel">
      <div className="bos-panel-head">
        <div>
          <h2 className="bos-panel-title">News &amp; events</h2>
          <p className="bos-panel-sub">
            Google News headlines plus disclosed corporate actions, insider/promoter trades, and
            bulk/block deals — each linked to the actual price move on and after that date.
            {!aiAnalyzed && !aiError && ' AI sentiment isn’t configured, so headlines show as raw news only.'}
          </p>
        </div>
      </div>

      {aiError && (
        <div className="sa-news-error">
          <span className="sa-news-summary-label">AI analysis failed</span>
          <p>{aiError}</p>
        </div>
      )}

      {aiAnalyzed && overallSummary && (
        <div className="sa-news-summary">
          <span className="sa-news-summary-label">AI summary</span>
          <p>{overallSummary}</p>
        </div>
      )}

      {items.length === 0 ? (
        <p className="sa-muted">No recent news or disclosed events found.</p>
      ) : (
        <ul className="sa-news-list">
          {items.map((item, i) => (
            <li key={`${item.type}-${item.date}-${i}`} className="sa-news-item">
              <div className="sa-news-item-head">
                <span className={`sa-tag ${TYPE_CLASS[item.type]}`}>{TYPE_LABEL[item.type]}</span>
                <span className="sa-news-date">{item.date}</span>
                {item.direction && item.direction !== 'unknown' && (
                  <span className={`sa-tag ${item.direction === 'buy' ? 'sa-tag-buy' : 'sa-tag-sell'}`}>
                    {item.direction === 'buy' ? 'Buy' : 'Sell'}
                  </span>
                )}
              </div>

              <p className="sa-news-headline">
                {item.link ? (
                  <a href={item.link} target="_blank" rel="noopener noreferrer">
                    {item.headline}
                  </a>
                ) : (
                  item.headline
                )}
                {item.source && <span className="sa-news-source"> — {item.source}</span>}
              </p>

              <div className="sa-news-moves">
                <span>
                  T0: <strong className={pctClass(item.priceMove.t0)}>{fmtPct(item.priceMove.t0)}</strong>
                </span>
                <span>
                  T+1: <strong className={pctClass(item.priceMove.t1)}>{fmtPct(item.priceMove.t1)}</strong>
                </span>
                <span>
                  T+2: <strong className={pctClass(item.priceMove.t2)}>{fmtPct(item.priceMove.t2)}</strong>
                </span>
              </div>

              {aiAnalyzed && item.type === 'news' && item.sentiment && (
                <div className="sa-news-ai">
                  <span
                    className={`sa-tag ${
                      item.sentiment === 'positive'
                        ? 'sa-tag-buy'
                        : item.sentiment === 'negative'
                          ? 'sa-tag-sell'
                          : 'sa-tag-neutral'
                    }`}
                  >
                    {item.sentiment.charAt(0).toUpperCase() + item.sentiment.slice(1)}
                  </span>
                  <span className="sa-news-driver">{item.driver}</span>
                  {item.confidence != null && (
                    <span className="sa-news-confidence">confidence {Math.round(item.confidence * 100)}%</span>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
