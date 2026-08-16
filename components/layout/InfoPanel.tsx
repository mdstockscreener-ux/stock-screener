'use client';

import { useState } from 'react';
import { IconInfo, IconNotes } from '@/components/icons';
import type { StockMeta } from '@/types';

interface InfoPanelProps {
  meta: StockMeta;
  dataCount: number;
}

export default function InfoPanel({ meta, dataCount }: InfoPanelProps): JSX.Element {
  const [expanded, setExpanded] = useState(true);

  return (
    <aside className="info-panel">
      <div className="info-icon-strip">
        <button type="button" className="info-icon-btn active" title="Information">
          <IconInfo />
        </button>
        <button type="button" className="info-icon-btn" title="Notes">
          <IconNotes />
        </button>
      </div>

      <div className="info-content">
        <p className="info-breadcrumb">&gt;&gt; Analytics Dashboard</p>

        {meta.symbol && (
          <div className="info-stock-card">
            <div className="info-stock-avatar">{meta.symbol.slice(0, 2)}</div>
            <div>
              <p className="info-stock-symbol">{meta.symbol}</p>
              <p className="info-stock-range">{meta.from} — {meta.to}</p>
              {dataCount > 0 && (
                <p className="info-stock-count">{dataCount} trading days</p>
              )}
            </div>
          </div>
        )}

        <div className="info-video-placeholder">
          <div className="video-thumb">
            <div className="play-btn" />
          </div>
          <p className="video-title">BUILD A PROFITABLE TRADING EDGE</p>
        </div>

        <div className="info-accordion">
          <button
            type="button"
            className="accordion-header"
            onClick={() => setExpanded(!expanded)}
            aria-expanded={expanded}
          >
            About NSE Dashboard
            <span className={`accordion-chevron ${expanded ? 'open' : ''}`}>›</span>
          </button>
          {expanded && (
            <div className="accordion-body">
              <p>
                NSE Dashboard provides historical price, volume, and delivery data
                sourced directly from NSE India. Search any listed symbol to view
                key metrics, interactive charts, and detailed trading history.
              </p>
              <p className="info-note">
                Data is for informational purposes only and should not be considered
                investment advice.
              </p>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
