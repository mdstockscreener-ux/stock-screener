# NSE Stock Dashboard

A React dashboard for visualizing NSE India historical stock data — price, volume, and delivery metrics.

## Features

- Search any NSE symbol with a custom date range
- Summary stat cards (close, period change, high/low, volume, delivery)
- Price chart with close price and VWAP
- Volume bar chart
- Delivery quantity & percentage chart
- Sortable historical data table

## Setup

```bash
cd nse-dashboard
npm install
npm run dev
```

This starts:
- **Proxy server** on `http://localhost:3001` (handles NSE API cookies/CORS)
- **React app** on `http://localhost:5173`

Open **http://localhost:5173** in your browser.

## Usage

1. Enter a stock symbol (e.g. `DEEPAKNTR`)
2. Set date range in `DD-MM-YYYY` format
3. Click **Fetch Data**

Default loads DEEPAKNTR data from 02-Apr-2026 to 02-Jul-2026.

## Tech Stack

- React 18 + Vite
- Recharts
- Express proxy for NSE API

## Note

NSE India APIs require server-side requests with session cookies. The included Express proxy handles this automatically.
