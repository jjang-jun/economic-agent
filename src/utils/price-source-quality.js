const { selectRows } = require('./persistence');

const DOMESTIC_OFFICIAL_EOD_SOURCES = ['krx-openapi', 'data-go-kr'];
const DOMESTIC_EOD_FALLBACK_SOURCES = ['kis-rest'];
const FALLBACK_SOURCES = ['naver-finance', 'yahoo-finance'];

function round(value, digits = 2) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function startIso(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString();
}

function countBy(items, getKey) {
  return (items || []).reduce((acc, item) => {
    const key = getKey(item) || 'unknown';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function latestIso(values = []) {
  const times = values
    .map(value => new Date(value || '').getTime())
    .filter(Number.isFinite);
  if (times.length === 0) return null;
  return new Date(Math.max(...times)).toISOString();
}

function uniqueCount(items, getKey) {
  return new Set((items || []).map(getKey).filter(Boolean)).size;
}

function isStaleSnapshot(row, now = new Date()) {
  const asOf = new Date(row.as_of || '').getTime();
  if (!Number.isFinite(asOf)) return true;
  const ageHours = (now.getTime() - asOf) / 3600000;
  if (row.price_type === 'current') return ageHours > 36;
  if (row.price_type === 'eod') return ageHours > 24 * 10;
  return ageHours > 24 * 10;
}

function summarizePriceSourceQuality(rows = [], options = {}) {
  const attempts = options.attempts || [];
  const now = options.now || new Date();
  const bySource = countBy(rows, row => row.source);
  const byPriceType = countBy(rows, row => row.price_type);
  const eodRows = rows.filter(row => row.price_type === 'eod');
  const currentRows = rows.filter(row => row.price_type === 'current');
  const officialEodRows = eodRows.filter(row => DOMESTIC_OFFICIAL_EOD_SOURCES.includes(row.source));
  const kisEodRows = eodRows.filter(row => DOMESTIC_EOD_FALLBACK_SOURCES.includes(row.source));
  const fallbackRows = rows.filter(row => FALLBACK_SOURCES.includes(row.source));
  const staleRows = rows.filter(row => isStaleSnapshot(row, now));
  const sourceRows = Object.entries(bySource)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([source, count]) => {
      const sourceItems = rows.filter(row => row.source === source);
      return {
        source,
        count,
        tickerCount: uniqueCount(sourceItems, row => row.ticker),
        latestAsOf: latestIso(sourceItems.map(row => row.as_of)),
      };
    });

  const fallbackRatePct = rows.length ? round((fallbackRows.length / rows.length) * 100) : null;
  const officialEodRatePct = eodRows.length ? round((officialEodRows.length / eodRows.length) * 100) : null;
  const healthLabel = (() => {
    if (rows.length === 0) return 'empty';
    const failedAttempts = attempts.filter(row => row.status === 'failed');
    const completedAttempts = attempts.filter(row => ['success', 'empty', 'failed'].includes(row.status));
    if (completedAttempts.length >= 5 && failedAttempts.length / completedAttempts.length > 0.3) return 'warn';
    if (fallbackRatePct !== null && fallbackRatePct > 50) return 'warn';
    if (eodRows.length > 0 && officialEodRatePct !== null && officialEodRatePct < 50) return 'warn';
    if (staleRows.length > Math.max(3, rows.length * 0.2)) return 'warn';
    return 'ok';
  })();

  const summary = {
    totalSnapshots: rows.length,
    tickerCount: uniqueCount(rows, row => row.ticker),
    currentSnapshots: currentRows.length,
    eodSnapshots: eodRows.length,
    bySource,
    byPriceType,
    officialEod: {
      total: officialEodRows.length,
      krx: bySource['krx-openapi'] || 0,
      dataGoKr: bySource['data-go-kr'] || 0,
      ratePct: officialEodRatePct,
    },
    kisEodFallback: kisEodRows.length,
    fallback: {
      total: fallbackRows.length,
      ratePct: fallbackRatePct,
      naver: bySource['naver-finance'] || 0,
      yahoo: bySource['yahoo-finance'] || 0,
    },
    staleSnapshots: staleRows.length,
    latestAsOf: latestIso(rows.map(row => row.as_of)),
    sourceRows,
    attempts: summarizeProviderAttempts(attempts),
    healthLabel,
  };
  summary.providerDecision = buildPriceProviderDecision(summary);
  return summary;
}

function summarizeProviderAttempts(attempts = []) {
  const completed = attempts.filter(row => ['success', 'empty', 'failed'].includes(row.status));
  const failed = completed.filter(row => row.status === 'failed');
  const empty = completed.filter(row => row.status === 'empty');
  const success = completed.filter(row => row.status === 'success');
  const byProvider = Object.entries(countBy(completed, row => row.provider))
    .map(([provider, count]) => {
      const providerRows = completed.filter(row => row.provider === provider);
      const providerFailures = providerRows.filter(row => row.status === 'failed').length;
      return {
        provider,
        count,
        success: providerRows.filter(row => row.status === 'success').length,
        empty: providerRows.filter(row => row.status === 'empty').length,
        failed: providerFailures,
        failureRatePct: count ? round((providerFailures / count) * 100) : null,
      };
    })
    .sort((a, b) => b.count - a.count || b.failed - a.failed)
    .slice(0, 8);

  return {
    total: completed.length,
    success: success.length,
    empty: empty.length,
    failed: failed.length,
    failureRatePct: completed.length ? round((failed.length / completed.length) * 100) : null,
    emptyRatePct: completed.length ? round((empty.length / completed.length) * 100) : null,
    byProvider,
  };
}

async function buildPriceSourceQualitySummary({ days = 7 } = {}) {
  const since = startIso(days);
  const [snapshotResult, attemptResult] = await Promise.all([
    selectRows('price_snapshots', {
    select: 'ticker,source,price_type,as_of,collected_at',
    collected_at: `gte.${since}`,
    order: 'collected_at.desc',
    limit: '2000',
    }),
    selectRows('price_provider_attempts', {
      select: 'provider,ticker,price_type,status,attempted_at,latency_ms,error_message',
      attempted_at: `gte.${since}`,
      order: 'attempted_at.desc',
      limit: '2000',
    }),
  ]);
  return summarizePriceSourceQuality(snapshotResult.rows || [], { attempts: attemptResult.rows || [] });
}

function buildPriceSourceQualityAnomalies(summary = {}, options = {}) {
  const maxFailureRatePct = options.maxFailureRatePct ?? Number(process.env.PRICE_PROVIDER_MAX_FAILURE_RATE_PCT || 30);
  const maxEmptyRatePct = options.maxEmptyRatePct ?? Number(process.env.PRICE_PROVIDER_MAX_EMPTY_RATE_PCT || 90);
  const minAttempts = options.minAttempts ?? Number(process.env.PRICE_PROVIDER_MIN_ATTEMPTS || 5);
  const maxFallbackRatePct = options.maxFallbackRatePct ?? Number(process.env.PRICE_PROVIDER_MAX_FALLBACK_RATE_PCT || 80);
  const maxStaleSnapshots = options.maxStaleSnapshots ?? Number(process.env.PRICE_PROVIDER_MAX_STALE_SNAPSHOTS || 3);
  const attempts = summary.attempts || {};
  const anomalies = [];

  if ((summary.totalSnapshots || 0) === 0) {
    anomalies.push('최근 가격 스냅샷이 없습니다');
  }
  if ((attempts.total || 0) >= minAttempts && typeof attempts.failureRatePct === 'number' && attempts.failureRatePct > maxFailureRatePct) {
    anomalies.push(`가격 provider 실패율 ${attempts.failureRatePct}% (${attempts.failed}/${attempts.total})`);
  }
  if ((attempts.total || 0) >= minAttempts && typeof attempts.emptyRatePct === 'number' && attempts.emptyRatePct > maxEmptyRatePct) {
    anomalies.push(`가격 provider 빈 응답률 ${attempts.emptyRatePct}% (${attempts.empty}/${attempts.total})`);
  }
  for (const provider of attempts.byProvider || []) {
    if (provider.count >= minAttempts && typeof provider.failureRatePct === 'number' && provider.failureRatePct > maxFailureRatePct) {
      anomalies.push(`${provider.provider} 실패율 ${provider.failureRatePct}% (${provider.failed}/${provider.count})`);
    }
  }
  if (typeof summary.fallback?.ratePct === 'number' && summary.fallback.ratePct > maxFallbackRatePct) {
    anomalies.push(`Naver/Yahoo fallback 비중 ${summary.fallback.ratePct}%`);
  }
  if ((summary.staleSnapshots || 0) > maxStaleSnapshots) {
    anomalies.push(`오래된 가격 스냅샷 ${summary.staleSnapshots}건`);
  }

  return anomalies;
}

function buildPriceProviderDecision(summary = {}) {
  const attempts = summary.attempts || {};
  const minAttempts = 5;
  const fallbackRate = summary.fallback?.ratePct;
  const officialEodRate = summary.officialEod?.ratePct;
  const failureRate = attempts.failureRatePct;
  const emptyRate = attempts.emptyRatePct;
  const reasons = [];

  if ((summary.totalSnapshots || 0) === 0) {
    return {
      action: 'investigate',
      label: '가격 데이터 수집 경로 점검 필요',
      reasons: ['최근 가격 스냅샷이 없습니다'],
    };
  }
  if ((attempts.total || 0) >= minAttempts && typeof failureRate === 'number' && failureRate >= 30) {
    reasons.push(`provider 실패율 ${failureRate}%`);
    return {
      action: 'fix_provider',
      label: 'API 키/토큰/네트워크 장애 우선 점검',
      reasons,
    };
  }
  if (typeof fallbackRate === 'number' && fallbackRate >= 60) {
    reasons.push(`fallback 가격 비중 ${fallbackRate}%`);
    if (summary.fallback?.yahoo) reasons.push(`Yahoo 사용 ${summary.fallback.yahoo}건`);
    return {
      action: 'consider_paid_data',
      label: '해외/글로벌 가격 API 보강 검토',
      reasons,
    };
  }
  if (typeof officialEodRate === 'number' && officialEodRate < 50) {
    reasons.push(`공식 EOD 비중 ${officialEodRate}%`);
    return {
      action: 'improve_official_eod',
      label: 'KRX/Data.go.kr EOD 경로 보강',
      reasons,
    };
  }
  if ((attempts.total || 0) >= minAttempts && typeof emptyRate === 'number' && emptyRate >= 70) {
    reasons.push(`빈 응답률 ${emptyRate}%`);
    return {
      action: 'monitor',
      label: 'fallback 탐색 정상 범위, 추세 모니터링',
      reasons,
    };
  }
  return {
    action: 'ok',
    label: '현재 가격 provider 구조 유지',
    reasons: ['심각한 실패율이나 fallback 과다는 없습니다'],
  };
}

module.exports = {
  summarizePriceSourceQuality,
  summarizeProviderAttempts,
  buildPriceSourceQualitySummary,
  buildPriceSourceQualityAnomalies,
  buildPriceProviderDecision,
};
