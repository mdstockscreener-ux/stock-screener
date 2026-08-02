import express from 'express';
import cors from 'cors';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { join } from 'path';
import { tmpdir } from 'os';

const execFileAsync = promisify(execFile);
const app = express();
const PORT = 3001;

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const COOKIE_FILE = join(tmpdir(), `nse-cookies-${process.pid}.txt`);

async function curl(args) {
  const { stdout } = await execFileAsync('curl.exe', args, {
    timeout: 60000,
    maxBuffer: 10 * 1024 * 1024,
  });
  return stdout;
}

async function initNseSession() {
  await curl([
    '-s', '-c', COOKIE_FILE, '-b', COOKIE_FILE,
    '-H', `User-Agent: ${USER_AGENT}`,
    '-H', 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'https://www.nseindia.com',
    '-o', 'NUL',
  ]);
}

async function fetchFromNse(url, symbol) {
  await initNseSession();

  const stdout = await curl([
    '-s', '-w', '\n%{http_code}', '-b', COOKIE_FILE,
    '-H', `User-Agent: ${USER_AGENT}`,
    '-H', 'Accept: application/json, text/plain, */*',
    '-H', 'Accept-Language: en-US,en;q=0.9',
    '-H', `Referer: https://www.nseindia.com/get-quotes/equity?symbol=${symbol}`,
    url,
  ]);

  const lastNewline = stdout.lastIndexOf('\n');
  const body = stdout.slice(0, lastNewline);
  const statusCode = parseInt(stdout.slice(lastNewline + 1), 10);

  if (statusCode === 403) {
    await initNseSession();
    const retry = await curl([
      '-s', '-w', '\n%{http_code}', '-b', COOKIE_FILE,
      '-H', `User-Agent: ${USER_AGENT}`,
      '-H', 'Accept: application/json, text/plain, */*',
      '-H', `Referer: https://www.nseindia.com/get-quotes/equity?symbol=${symbol}`,
      url,
    ]);
    const retryNl = retry.lastIndexOf('\n');
    return {
      status: parseInt(retry.slice(retryNl + 1), 10),
      body: retry.slice(0, retryNl),
    };
  }

  return { status: statusCode, body };
}

app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', message: 'NSE proxy server is running' });
});

app.get('/api/search', async (req, res) => {
  const { q } = req.query;

  if (!q || String(q).trim().length < 1) {
    return res.json([]);
  }

  const url = `https://www.nseindia.com/api/search/autocomplete?q=${encodeURIComponent(String(q).trim())}`;

  try {
    await initNseSession();

    const stdout = await curl([
      '-s', '-w', '\n%{http_code}', '-b', COOKIE_FILE,
      '-H', `User-Agent: ${USER_AGENT}`,
      '-H', 'Accept: application/json, text/plain, */*',
      '-H', 'Referer: https://www.nseindia.com/',
      url,
    ]);

    const lastNewline = stdout.lastIndexOf('\n');
    const body = stdout.slice(0, lastNewline);
    const status = parseInt(stdout.slice(lastNewline + 1), 10);

    if (status !== 200) {
      return res.status(status).json({ error: `NSE search returned ${status}` });
    }

    res.json(JSON.parse(body));
  } catch (err) {
    console.error('Search error:', err.message);
    res.status(500).json({ error: `Search failed: ${err.message}` });
  }
});

app.get('/api/historical', async (req, res) => {
  const { from, to, symbol, series = 'ALL' } = req.query;

  if (!from || !to || !symbol) {
    return res.status(400).json({ error: 'Missing required params: from, to, symbol' });
  }

  const url = new URL(
    'https://www.nseindia.com/api/historicalOR/generateSecurityWiseHistoricalData'
  );
  url.searchParams.set('from', from);
  url.searchParams.set('to', to);
  url.searchParams.set('symbol', symbol);
  url.searchParams.set('type', 'priceVolumeDeliverable');
  url.searchParams.set('series', series);

  try {
    const { status, body } = await fetchFromNse(url.toString(), symbol);

    if (status !== 200) {
      return res.status(status).json({ error: `NSE API returned ${status}` });
    }

    const data = JSON.parse(body);
    res.json(data);
  } catch (err) {
    console.error('Proxy error:', err.message);
    const isCurlMissing = err.message?.includes('ENOENT');
    res.status(500).json({
      error: isCurlMissing
        ? 'curl.exe not found. Install curl or run on Windows 10+.'
        : `Failed to reach NSE: ${err.message}`,
    });
  }
});

app.listen(PORT, () => {
  console.log(`NSE proxy server running on http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
});
