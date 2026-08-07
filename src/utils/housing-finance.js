const { loadRealEstateGoal } = require('../config/real-estate-goal');

function finiteNonNegative(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function monthlyPayment(principal, annualRate, termYears) {
  const amount = finiteNonNegative(principal, 0);
  const months = Math.max(1, Math.round(finiteNonNegative(termYears, 30) * 12));
  const monthlyRate = finiteNonNegative(annualRate, 0) / 12;
  if (monthlyRate === 0) return amount / months;
  return amount * monthlyRate * ((1 + monthlyRate) ** months) / (((1 + monthlyRate) ** months) - 1);
}

function principalFromAnnualPayment(annualPayment, annualRate, termYears) {
  const payment = finiteNonNegative(annualPayment, 0) / 12;
  const months = Math.max(1, Math.round(finiteNonNegative(termYears, 30) * 12));
  const monthlyRate = finiteNonNegative(annualRate, 0) / 12;
  if (monthlyRate === 0) return payment * months;
  return payment * (((1 + monthlyRate) ** months) - 1) / (monthlyRate * ((1 + monthlyRate) ** months));
}

function estimateDsrLoanLimit(options = {}) {
  const income = finiteNonNegative(options.annualGrossIncomeKrw);
  if (income === null) return null;
  const dsrRatio = finiteNonNegative(options.dsrRatio, 0.40);
  const existingAnnualDebtService = finiteNonNegative(options.existingAnnualDebtServiceKrw, 0);
  const mortgageAnnualPayment = Math.max(0, (income * dsrRatio) - existingAnnualDebtService);
  return Math.floor(principalFromAnnualPayment(
    mortgageAnnualPayment,
    finiteNonNegative(options.stressAnnualRate, 0.06),
    finiteNonNegative(options.termYears, 30),
  ));
}

function buildHousingPurchaseScenario(purchasePriceKrw, options = {}) {
  const goal = options.goal || loadRealEstateGoal(options.env);
  const assumption = { ...goal.financingAssumption, ...(options.financingAssumption || {}) };
  const price = finiteNonNegative(purchasePriceKrw, 0);
  const ltvLimitKrw = Math.floor(price * assumption.ltvRatio);
  const policyLimitKrw = Math.min(ltvLimitKrw, assumption.mortgageCapKrw);
  const dsrLimitKrw = estimateDsrLoanLimit({
    ...assumption,
    annualGrossIncomeKrw: options.annualGrossIncomeKrw,
    existingAnnualDebtServiceKrw: options.existingAnnualDebtServiceKrw,
  });
  const estimatedLoanKrw = Math.floor(Math.min(
    assumption.desiredMortgageKrw,
    policyLimitKrw,
    dsrLimitKrw === null ? Number.POSITIVE_INFINITY : dsrLimitKrw,
  ));
  const desiredLoanGapKrw = Math.max(0, assumption.desiredMortgageKrw - estimatedLoanKrw);

  return {
    purchasePriceKrw: price,
    ltvLimitKrw,
    mortgageCapKrw: assumption.mortgageCapKrw,
    policyLimitKrw,
    dsrLimitKrw,
    desiredMortgageKrw: assumption.desiredMortgageKrw,
    estimatedLoanKrw,
    desiredLoanGapKrw,
    minimumPurchaseCashKrw: Math.max(0, price - estimatedLoanKrw),
    estimatedMonthlyPaymentKrw: Math.round(monthlyPayment(
      estimatedLoanKrw,
      assumption.stressAnnualRate,
      assumption.termYears,
    )),
    dsrVerificationRequired: dsrLimitKrw === null,
    excludesAcquisitionCosts: true,
    assumptionEffectiveAt: assumption.effectiveAt,
    warning: '대출 한도는 시나리오이며 실제 실행 시점의 DSR·LTV·주택가격 구간·소득·기존부채·금융기관 심사를 다시 확인해야 합니다.',
  };
}

function buildTargetRangeScenarios(options = {}) {
  const goal = options.goal || loadRealEstateGoal(options.env);
  const prices = options.prices || [
    goal.monitorPriceRangeKrw.min,
    700_000_000,
    goal.targetPriceRangeKrw.min,
    900_000_000,
    goal.targetPriceRangeKrw.max,
  ];
  return prices.map(price => buildHousingPurchaseScenario(price, { ...options, goal }));
}

module.exports = {
  buildHousingPurchaseScenario,
  buildTargetRangeScenarios,
  estimateDsrLoanLimit,
  monthlyPayment,
  principalFromAnnualPayment,
};
