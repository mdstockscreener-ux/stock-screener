# NSE Stock Dashboard

A full-stack **Next.js 15** dashboard for visualizing NSE India historical stock data — price, volume, and delivery metrics. Built with TypeScript, Recharts, and Next.js API Routes that handle NSE session management server-side.

---

## Features

- 🔍 **Smart symbol search** — autocomplete powered by NSE's search API
- 📅 **Flexible date ranges** — quick presets (1W, 1M, 3M, 6M, 1Y) or custom `DD-MM-YYYY` input
- 📊 **Interactive charts** — Price (close + VWAP), Volume, and Delivery percentage
- 📋 **Sortable data table** — full historical OHLCV + delivery data
- 🧮 **Key metrics cards** — period change, high/low, avg volume, avg delivery %
- 🚨 **High-delivery signal** — configurable multiplier to flag unusual delivery spikes
- 🗂️ **Sidebar navigation** — quick jump between sections
- 🧪 **Strategy backtest** — Advanced Darvas Box on a single stock, every parameter editable
- ⚡ **No external proxy needed** — NSE CORS & cookie handling done inside Next.js API routes

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript 5 |
| UI | React 18 |
| Charts | Recharts 2 |
| HTTP | Axios + native `fetch` |
| Styling | Vanilla CSS (globals.css) |
| Deployment | Vercel-ready |

---

## Project Structure

```
stock-screener/
├── app/
│   ├── api/
│   │   ├── historical/     # NSE historical price data endpoint
│   │   ├── search/         # NSE symbol autocomplete endpoint
│   │   ├── health/         # Health check endpoint
│   │   └── backtest/       # Runs the Darvas Box engine server-side
│   ├── bottom-out/         # Bottom-Out Scanner page (Supabase-backed)
│   ├── backtest/           # Strategy Backtest page
│   ├── layout.tsx          # Root layout
│   ├── page.tsx            # Main dashboard page
│   └── globals.css         # Global styles
├── components/
│   ├── layout/
│   │   ├── TopNav.tsx      # Top navigation bar
│   │   ├── Sidebar.tsx     # Collapsible sidebar
│   │   └── InfoPanel.tsx   # Info panel
│   ├── SecurityFilterPanel.tsx  # Symbol + date range search
│   ├── StatsCards.tsx      # Key metrics summary cards
│   ├── DataTable.tsx       # Sortable historical data table
│   ├── PriceChart.tsx      # Close price + VWAP line chart
│   ├── VolumeChart.tsx     # Volume bar chart
│   ├── DeliveryChart.tsx   # Delivery qty & % chart
│   ├── StockSearchSelect.tsx    # Autocomplete symbol input
│   ├── DateFilterBar.tsx   # Date range picker
│   └── icons.tsx           # SVG icon components
├── hooks/
│   └── useStockData.ts     # Data fetching & state hook
├── lib/
│   ├── nseProxy.ts         # NSE session init & cookie management
│   ├── supabaseClient.ts   # Shared Supabase client
│   └── backtest/
│       ├── engine.ts       # Pure strategy engine — no I/O, no constants
│       ├── engine.test.ts  # Unit tests (npm test)
│       └── data.ts         # Bar resolution: store first, Yahoo fallback
├── types/
│   ├── index.ts            # Shared TypeScript types
│   ├── screener.ts         # Bottom-Out Scanner types
│   └── backtest.ts         # Backtest types
├── utils/
│   ├── dateRanges.ts       # Date preset helpers
│   ├── equitySearch.ts     # Symbol search utilities
│   ├── backtest.ts         # Backtest presentation helpers
│   └── formatters.ts       # Number & date formatters
├── next.config.ts
├── tsconfig.json
└── package.json
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

```bash
git clone https://github.com/mdstockscreener-ux/stock-screener.git
cd stock-screener
npm install
```

### Run Development Server

```bash
npm run dev
```

Open **http://localhost:3000** in your browser.

> No separate proxy server needed. All NSE API calls are handled by Next.js API routes at `/api/historical`, `/api/search`, and `/api/health`.

---

## Available Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start development server on port 3000 |
| `npm run build` | Build production bundle |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm test` | Run the backtest engine unit tests |

---

## API Routes

| Route | Method | Description |
|---|---|---|
| `/api/historical` | `GET` | Fetch OHLCV + delivery data for a symbol and date range |
| `/api/search` | `GET` | Autocomplete NSE symbol search |
| `/api/health` | `GET` | Health check |
| `/api/backtest` | `POST` | Resolve bars and run the Darvas Box engine for one symbol |

---

## Usage

1. Type a stock symbol in the search box (e.g. `RELIANCE`, `DEEPAKNTR`, `INFY`)
2. Select a quick date preset or enter a custom date range in `DD-MM-YYYY` format
3. Click **Fetch Data**
4. Use the sidebar to jump between **Key Metrics**, **Charts**, and **Historical Data** sections

Default loads **DEEPAKNTR** data for the last **3 months** on startup.

---

## How NSE Data Works

NSE India requires browser-like session cookies for API access. This app handles it transparently:

1. On each API request, the server hits `nseindia.com` to obtain a valid session cookie
2. That cookie is forwarded to the actual NSE data API
3. A **60-second in-memory cookie cache** prevents redundant session inits on warm serverless instances
4. A **single automatic retry** handles `403` responses with a fresh session

No manual cookie setup or separate proxy process is required.

---

## Bottom-Out Scanner

A second, self-contained section at **`/bottom-out`**. It finds Nifty 100 stocks
sitting near their 52-week low but no longer making new lows, and freezes the
resulting shortlist as a named snapshot for a later backtest.

It reads the Supabase tables produced by the sibling
[`stock-screener-data-collector`](../stock-screener-data-collector) service
(`symbols`, `daily_bars`, `daily_bars_adjusted`, `ingestion_runs`) — it does not
use the NSE API routes above.

### Setup

**1. Run the migration.** Open the Supabase SQL editor and execute
[`sql/bottom_out_scanner.sql`](sql/bottom_out_scanner.sql). It is idempotent and
purely additive: it creates the `screen_52w_summary` view, the `screens` and
`screen_results` snapshot tables, and the RLS policies the browser client needs.
It requires the data service's schema to already exist. Postgres 15+ (the view
uses `security_invoker`).

**2. Configure credentials.**

```bash
cp .env.example .env.local
```

Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from
Supabase → Project Settings → API. Without them the page renders a setup hint
instead of data.

### How it works

The work is split at the aggregation seam:

- **Postgres aggregates.** `screen_52w_summary` reduces ~60k bars to one summary
  row per symbol — the 52-week low/high *and their dates*, over the trailing 365
  days ending at the latest stored bar. It reads `daily_bars_adjusted`, so a
  split or bonus cannot manufacture a fake new low.
- **The browser tunes.** All ~100 rows load in a single query. The band and guard
  thresholds are applied client-side, so dragging a slider re-filters instantly
  with no further network calls.

### Filters

| Control | Default | Rule |
|---|---|---|
| `X` — max % above 52w low | 25% | `close <= low_52w × (1 + X)` |
| `Y` — min % above 52w low | 5% | `close >= low_52w × (1 + Y)` |
| Aged-low guard, `N` days | on, 20 | `days_since_low >= N` |
| % below 52w high | off, 30% | `pct_from_high <= -threshold` |

The aged-low guard is what separates "bottomed out" from "still falling". When
the same 52-week low is touched more than once, the view reports the **most
recent** touch, so a stock that re-tested its low last week cannot pass a 20-day
guard.

### Why snapshots matter

A live screen returns whatever the latest refresh produces and changes underneath
you. **Save shortlist** writes a `screens` row (name, parameters, `data_as_of`)
plus the passing symbols and their metrics into `screen_results`. The backtest
section then references a fixed basket — "screen #7" — rather than "whatever the
query returns today".

Snapshots are insert-only by policy; delete or edit them in the SQL editor.

### No look-ahead concern here

Selection is *as of today, test forward later*, so using current 52-week values is
correct — there is no future data to leak. The look-ahead rule applies to the
backtest section, which must select as of a past date.

### Data freshness

The "data as of" badge shows the latest `ingestion_runs.finished_at`. Any symbol
whose `last_bar_date` predates the universe's latest bar is flagged **stale**.
The `close` column is the last *stored* close, not a live quote.

---

## Strategy Backtest — Advanced Darvas Box

`/backtest` runs the strategy over a **past** window on **one** stock with its own
sandboxed capital, and reports the whole result set rather than just a return
number. It touches nothing the scanner owns: no shared tables, no shared code.

### The rules

| Rule | What it does |
|---|---|
| 1 — Tranches | Starting capital is cut into N equal slices, deployed one breakout at a time |
| 2 — Trigger | Entry when the bar's high takes out the **prior completed week's** high |
| 3 — Ignorable range | A tranche filling within X% of the last entry is not worth taking |
| Target | The whole position exits at a fixed % above the **average** entry |
| Stop | The whole position exits at a fixed % below the **average** entry |
| Repeat | After any exit the tranche budget resets and the hunt starts again |

### Every number is a form field

Capital, tranche count, target %, stop %, ignorable-range % and the date range
are all editable, and `lib/backtest/engine.ts` contains no literal for any of
them — a unit test greps the engine source and fails if one appears. The
**stop-loss has no default at all**: it is the value being searched, so the form
leaves it blank and refuses to run until you pick one.

The stop is measured below the *average* entry, so each added tranche drags it up
behind the position. Below the individual entry, or trailing behind the high, are
different strategies — that definition is a knob worth revisiting.

### Pessimistic fills

Backtests flatter themselves at the fill. This one does not:

- A **gap-up** through the trigger fills at the open, not back down at the trigger.
- A **gap-down** through the stop fills at the open, *below* the stop.
- A gap *through* the target still books only the target.
- When one bar's range spans both the stop and the target, the **stop** is assumed
  to have filled first — OHLC cannot say which came first, so it takes the worse.

Whole shares only; a tranche that cannot buy one share is not deployed. There is
no brokerage, slippage or impact cost — results are an argument about the rules,
not a record of what a broker would have filled.

### No look-ahead

At bar *i* the engine sees `bars[0..i]` and nothing else. The trigger comes from
the last **completed** week, never the in-progress one, and fills come from the
current bar's own OHLC. This is enforced mechanically: `engine.test.ts` runs the
engine on prefixes of a series and asserts the events and equity curve match the
full run exactly. If a future bar ever leaked into a decision, truncating the
series would change the earlier output.

### Where the bars come from

1. **Store** — `daily_bars_adjusted`, when the symbol is in the universe *and* the
   stored history actually covers the requested range.
2. **Fetched** — Yahoo via `yahoo-finance2`, on demand, for everything else.

Both are adjusted the same way (raw OHLC scaled by `adj_close / close`), which is
what makes them comparable. An NSE endpoint is deliberately *not* an option here:
its unadjusted prices would manufacture a gap at every split and bonus, and the
engine would trade them.

The fetch runs server-side because Yahoo is not CORS-open. Fetched symbols are
never written back into `symbols` / `daily_bars` — the universe stays curated.
Caching, if it is ever worth adding, belongs in its own namespaced table.

The source badge on every run reports which path was used, the data's as-of date,
and warns when the symbol is outside the scanner universe — such a name has passed
no liquidity or size filter, so fills on a thin stock are optimistic.

### What it reports

Trade log (every entry, exit and skipped breakout, with tranche number and exit
reason), equity curve (realized, plus mark-to-market of the open position), and
metrics: total and realized return, expectancy in R and in rupees, win rate,
average win vs average loss, profit factor, max drawdown, trade count and time in
market. A position still open when the range ends is marked to the last close and
reported separately — it is not a result until it closes, so it stays out of the
win rate and expectancy.

---

## Deployment

This project is **Vercel-ready** (`.vercel` config included). To deploy:

```bash
npx vercel
```

Or connect the GitHub repo directly at [vercel.com](https://vercel.com).

---

## License

MIT
