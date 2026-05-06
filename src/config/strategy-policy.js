module.exports = {
  objective: 'financial_freedom',

  capitalRules: {
    minEmergencyCashMonths: 6,
    maxSingleTradeRiskPct: 0.01,
    maxSinglePositionPct: 0.15,
    maxSectorPct: 0.35,
    maxSpeculativeBucketPct: 0.1,
    defaultMaxNewBuyPct: 0.05,
  },

  recommendationRules: {
    minRiskReward: 2.0,
    maxStopLossPct: 10,
    requireStopLoss: true,
    requireInvalidationConditions: true,
    requireEvidence: true,
    requireBenchmark: true,
  },

  leverageRules: {
    allowMargin: false,
    allowMisu: false,
    allowLeveragedEtf: 'paper_only',
  },

  regimeRules: {
    STRONG_RISK_ON: {
      maxEquityExposure: 0.9,
      maxNewBuyRatio: 0.08,
      minRiskReward: 1.8,
      allowBreakoutBuy: true,
      allowPyramiding: true,
      allowNewBuy: true,
    },
    RISK_ON: {
      maxEquityExposure: 0.75,
      maxNewBuyRatio: 0.05,
      minRiskReward: 2.0,
      allowBreakoutBuy: true,
      allowPyramiding: true,
      allowNewBuy: true,
    },
    FRAGILE_RISK_ON: {
      maxEquityExposure: 0.6,
      maxNewBuyRatio: 0.03,
      minRiskReward: 2.5,
      allowBreakoutBuy: true,
      requireVolumeConfirmation: true,
      allowNewBuy: true,
    },
    NEUTRAL: {
      maxEquityExposure: 0.5,
      maxNewBuyRatio: 0.03,
      minRiskReward: 2.5,
      allowBreakoutBuy: false,
      allowNewBuy: true,
    },
    RISK_OFF: {
      maxEquityExposure: 0.3,
      maxNewBuyRatio: 0.01,
      minRiskReward: 3.0,
      allowBreakoutBuy: false,
      allowNewBuy: false,
    },
    PANIC: {
      maxEquityExposure: 0.15,
      maxNewBuyRatio: 0,
      minRiskReward: Infinity,
      allowBreakoutBuy: false,
      allowNewBuy: false,
    },
  },
};
