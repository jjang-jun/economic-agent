const { fetchBaseRate } = require('../sources/bok-api');
const { fetchKeyIndicators } = require('../sources/fred-api');

async function fetchAllIndicators() {
  const [baseRate, fredIndicators] = await Promise.allSettled([
    fetchBaseRate(),
    fetchKeyIndicators(),
  ]);

  const indicators = {};

  if (baseRate.status === 'fulfilled' && baseRate.value) {
    indicators.baseRate = baseRate.value.rate;
    console.log(`[지표] 한국 기준금리: ${baseRate.value.rate}% (${baseRate.value.date})`);
  }

  if (fredIndicators.status === 'fulfilled' && fredIndicators.value) {
    const fi = fredIndicators.value;
    if (fi.fed_funds_rate) {
      indicators.fedRate = fi.fed_funds_rate.value;
      console.log(`[지표] 미국 기준금리: ${fi.fed_funds_rate.value}%`);
    }
    if (fi.cpi) {
      indicators.cpi = fi.cpi.value;
      console.log(`[지표] 미국 CPI: ${fi.cpi.value}`);
    }
    if (fi.unemployment) {
      indicators.unemployment = fi.unemployment.value;
      console.log(`[지표] 미국 실업률: ${fi.unemployment.value}%`);
    }
  }

  return indicators;
}

module.exports = { fetchAllIndicators };
