const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const WORKER_PATH = path.join(__dirname, '..', '..', 'scripts', 'local-backtest-worker.py');
const DEFAULT_MPLCONFIGDIR = path.join(os.tmpdir(), 'economic-agent-matplotlib');

function isEnabled(env = process.env) {
  return ['1', 'true', 'yes', 'on'].includes(String(env.LOCAL_RESEARCH_WORKER_ENABLED || '').toLowerCase());
}

function normalizeDomesticTicker(value = '') {
  const ticker = String(value || '').trim().toUpperCase().replace(/\.(KS|KQ)$/, '');
  return /^\d{6}$/.test(ticker) ? ticker : '';
}

function selectResearchTickers(recommendations = [], limit = 3) {
  const seen = new Set();
  const selected = [];
  for (const recommendation of recommendations) {
    const ticker = normalizeDomesticTicker(recommendation.ticker || recommendation.symbol);
    if (!ticker || seen.has(ticker)) continue;
    seen.add(ticker);
    selected.push({
      ticker,
      name: recommendation.name || ticker,
      signal: recommendation.signal || '',
      conviction: recommendation.conviction || '',
    });
    if (selected.length >= limit) break;
  }
  return selected;
}

function round(value, digits = 2) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function summarizeOhlcv(rows = []) {
  const sorted = [...rows]
    .filter(row => typeof row?.close === 'number' && Number.isFinite(row.close))
    .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
  if (sorted.length === 0) {
    return { rowCount: 0, returnPct: null, maxDrawdownPct: null };
  }

  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  let peak = first.close;
  let maxDrawdownPct = 0;
  for (const row of sorted) {
    peak = Math.max(peak, row.close);
    if (peak > 0) {
      maxDrawdownPct = Math.min(maxDrawdownPct, ((row.close - peak) / peak) * 100);
    }
  }

  return {
    rowCount: sorted.length,
    from: first.date || '',
    to: last.date || '',
    startClose: first.close,
    endClose: last.close,
    returnPct: first.close > 0 ? round(((last.close - first.close) / first.close) * 100) : null,
    maxDrawdownPct: round(maxDrawdownPct),
  };
}

function runWorker(args, options = {}) {
  const timeout = Number(process.env.LOCAL_RESEARCH_WORKER_TIMEOUT_MS || 20000);
  const result = spawnSync('python3', [WORKER_PATH, ...args], {
    encoding: 'utf8',
    timeout,
    env: {
      ...process.env,
      MPLCONFIGDIR: process.env.MPLCONFIGDIR || DEFAULT_MPLCONFIGDIR,
    },
    ...options,
  });
  if (result.error) {
    return { ok: false, error: 'worker_failed', message: result.error.message };
  }
  try {
    const payload = JSON.parse(result.stdout || '{}');
    return result.status === 0 ? payload : { ok: false, ...payload };
  } catch (err) {
    return {
      ok: false,
      error: 'invalid_worker_json',
      status: result.status,
      message: err.message,
      stderr: result.stderr || '',
    };
  }
}

function buildLocalResearchSummary({ period, startDate, endDate, recommendations = [] } = {}) {
  if (!isEnabled()) return null;

  const maxTickers = Number(process.env.LOCAL_RESEARCH_MAX_TICKERS || 3);
  const provider = process.env.LOCAL_RESEARCH_WORKER_PROVIDER || 'auto';
  const tickers = selectResearchTickers(recommendations, Number.isFinite(maxTickers) ? maxTickers : 3);
  const providerStatus = runWorker(['providers']);
  const summary = {
    enabled: true,
    period,
    startDate,
    endDate,
    generatedAt: new Date().toISOString(),
    provider,
    providerStatus,
    tickerCount: tickers.length,
    results: [],
    failures: [],
  };

  if (tickers.length === 0) {
    summary.reason = 'no_domestic_tickers';
    return summary;
  }

  for (const item of tickers) {
    const payload = runWorker([
      'ohlcv',
      '--ticker', item.ticker,
      '--from', startDate,
      '--to', endDate,
      '--provider', provider,
    ]);
    if (!payload.ok) {
      summary.failures.push({
        ticker: item.ticker,
        name: item.name,
        error: payload.error || 'unknown_error',
        provider: payload.provider || provider,
        message: payload.message || '',
      });
      continue;
    }

    summary.results.push({
      ...item,
      provider: payload.provider || provider,
      ...summarizeOhlcv(payload.rows || []),
    });
  }

  return summary;
}

module.exports = {
  buildLocalResearchSummary,
  isEnabled,
  normalizeDomesticTicker,
  selectResearchTickers,
  summarizeOhlcv,
};
