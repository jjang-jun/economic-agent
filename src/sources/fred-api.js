const FRED_API_KEY = process.env.FRED_API_KEY;
const BASE_URL = 'https://api.stlouisfed.org/fred';

// 주요 시리즈
const SERIES = {
  fed_funds_rate: { id: 'FEDFUNDS' },             // 미국 기준금리
  cpi_yoy: { id: 'CPIAUCSL', units: 'pc1' },      // 소비자물가 전년동월비
  unemployment: { id: 'UNRATE' },                 // 실업률
};

function buildFredUrl(seriesId, apiKey, options = {}) {
  const params = new URLSearchParams({
    series_id: seriesId,
    api_key: apiKey,
    file_type: 'json',
    sort_order: 'desc',
    limit: '1',
  });
  if (options.units) params.set('units', options.units);
  return `${BASE_URL}/series/observations?${params}`;
}

async function fetchFredSeries(seriesId, options = {}) {
  if (!FRED_API_KEY) {
    console.warn('[FRED] API 키가 설정되지 않았습니다.');
    return null;
  }

  try {
    const url = buildFredUrl(seriesId, FRED_API_KEY, options);

    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    if (data.observations && data.observations.length > 0) {
      const obs = data.observations[0];
      return {
        seriesId,
        value: obs.value,
        date: obs.date,
        units: options.units || 'lin',
      };
    }
  } catch (err) {
    console.warn(`[FRED] ${seriesId} 조회 실패: ${err.message}`);
  }

  return null;
}

async function fetchKeyIndicators() {
  const entries = await Promise.all(
    Object.entries(SERIES).map(async ([key, config]) => [
      key,
      await fetchFredSeries(config.id, config),
    ])
  );
  return Object.fromEntries(entries);
}

module.exports = { SERIES, buildFredUrl, fetchFredSeries, fetchKeyIndicators };
