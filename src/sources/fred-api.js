const FRED_API_KEY = process.env.FRED_API_KEY;
const BASE_URL = 'https://api.stlouisfed.org/fred';

// 주요 시리즈
const SERIES = {
  fed_funds_rate: 'FEDFUNDS',   // 미국 기준금리
  cpi: 'CPIAUCSL',              // 소비자물가지수
  unemployment: 'UNRATE',       // 실업률
};

async function fetchFredSeries(seriesId) {
  if (!FRED_API_KEY) {
    console.warn('[FRED] API 키가 설정되지 않았습니다.');
    return null;
  }

  try {
    const url = `${BASE_URL}/series/observations?series_id=${seriesId}&api_key=${FRED_API_KEY}&file_type=json&sort_order=desc&limit=1`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    if (data.observations && data.observations.length > 0) {
      const obs = data.observations[0];
      return {
        seriesId,
        value: obs.value,
        date: obs.date,
      };
    }
  } catch (err) {
    console.warn(`[FRED] ${seriesId} 조회 실패: ${err.message}`);
  }

  return null;
}

async function fetchKeyIndicators() {
  const entries = await Promise.all(
    Object.entries(SERIES).map(async ([key, seriesId]) => [key, await fetchFredSeries(seriesId)])
  );
  return Object.fromEntries(entries);
}

module.exports = { fetchFredSeries, fetchKeyIndicators };
