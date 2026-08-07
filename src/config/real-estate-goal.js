const MILLION = 1_000_000;

function numberFromEnv(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function loadRealEstateGoal(env = process.env) {
  return {
    id: env.REAL_ESTATE_GOAL_ID || 'primary-home-2028-2029',
    objective: '서울·경기 아파트 시장을 지속 관찰해 저점에 가까운 매수 검토 구간에서 감당 가능한 가장 높은 입지를 합리적인 가격으로 매수한다.',
    household: {
      applicants: 2,
      firstHomeBuyer: true,
      ownerOccupancy: true,
    },
    targetWindow: {
      start: env.REAL_ESTATE_TARGET_START || '2028-08-01',
      end: env.REAL_ESTATE_TARGET_END || '2029-08-31',
    },
    geography: ['서울특별시', '경기도'],
    propertyType: 'apartment',
    monitorPriceRangeKrw: {
      min: numberFromEnv(env.REAL_ESTATE_MONITOR_MIN_KRW, 580 * MILLION),
      max: numberFromEnv(env.REAL_ESTATE_MONITOR_MAX_KRW, 950 * MILLION),
    },
    targetPriceRangeKrw: {
      min: numberFromEnv(env.REAL_ESTATE_TARGET_MIN_KRW, 850 * MILLION),
      max: numberFromEnv(env.REAL_ESTATE_TARGET_MAX_KRW, 950 * MILLION),
    },
    financingAssumption: {
      desiredMortgageKrw: numberFromEnv(env.REAL_ESTATE_DESIRED_MORTGAGE_KRW, 600 * MILLION),
      ltvRatio: numberFromEnv(env.REAL_ESTATE_LTV_RATIO, 0.70),
      mortgageCapKrw: numberFromEnv(env.REAL_ESTATE_MORTGAGE_CAP_KRW, 600 * MILLION),
      dsrRatio: numberFromEnv(env.REAL_ESTATE_DSR_RATIO, 0.40),
      stressAnnualRate: numberFromEnv(env.REAL_ESTATE_STRESS_RATE, 0.06),
      termYears: numberFromEnv(env.REAL_ESTATE_MORTGAGE_TERM_YEARS, 30),
      effectiveAt: env.REAL_ESTATE_POLICY_EFFECTIVE_AT || '2026-08-06',
      assumptionOnly: true,
    },
  };
}

module.exports = {
  MILLION,
  loadRealEstateGoal,
  numberFromEnv,
};
