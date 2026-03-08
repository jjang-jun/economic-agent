const BOK_API_KEY = process.env.BOK_API_KEY;
const BASE_URL = 'https://ecos.bok.or.kr/api';

// 주요 통계 코드
const STAT_CODES = {
  base_rate: '722Y001', // 한국은행 기준금리
};

async function fetchBaseRate() {
  if (!BOK_API_KEY) {
    console.warn('[BOK] API 키가 설정되지 않았습니다.');
    return null;
  }

  try {
    // 최근 1건의 기준금리 조회
    const today = new Date();
    const endDate = today.toISOString().slice(0, 10).replace(/-/g, '');
    const startDate = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10)
      .replace(/-/g, '');

    const url = `${BASE_URL}/StatisticSearch/${BOK_API_KEY}/json/kr/1/1/${STAT_CODES.base_rate}/D/${startDate}/${endDate}`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    if (data.StatisticSearch && data.StatisticSearch.row) {
      const row = data.StatisticSearch.row[0];
      return {
        rate: row.DATA_VALUE,
        date: row.TIME,
        name: '한국은행 기준금리',
      };
    }
  } catch (err) {
    console.warn(`[BOK] API 호출 실패: ${err.message}`);
  }

  return null;
}

module.exports = { fetchBaseRate };
