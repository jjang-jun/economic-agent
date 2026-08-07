const test = require('node:test');
const assert = require('node:assert/strict');
const { loadRealEstateGoal } = require('../src/config/real-estate-goal');
const {
  buildHousingPurchaseScenario,
  buildTargetRangeScenarios,
  estimateDsrLoanLimit,
  monthlyPayment,
} = require('../src/utils/housing-finance');

test('real-estate goal encodes the broad monitor range separately from the preferred purchase range', () => {
  const goal = loadRealEstateGoal({});
  assert.deepEqual(goal.monitorPriceRangeKrw, { min: 580_000_000, max: 950_000_000 });
  assert.deepEqual(goal.targetPriceRangeKrw, { min: 850_000_000, max: 950_000_000 });
  assert.equal(goal.household.firstHomeBuyer, true);
  assert.equal(goal.financingAssumption.assumptionOnly, true);
});

test('a 600m desired mortgage is constrained by LTV before the policy cap at 850m', () => {
  const scenario = buildHousingPurchaseScenario(850_000_000);
  assert.equal(scenario.ltvLimitKrw, 595_000_000);
  assert.equal(scenario.estimatedLoanKrw, 595_000_000);
  assert.equal(scenario.minimumPurchaseCashKrw, 255_000_000);
  assert.equal(scenario.dsrVerificationRequired, true);
});

test('a 900m purchase reaches the 600m cap before DSR verification', () => {
  const scenario = buildHousingPurchaseScenario(900_000_000);
  assert.equal(scenario.ltvLimitKrw, 630_000_000);
  assert.equal(scenario.policyLimitKrw, 600_000_000);
  assert.equal(scenario.estimatedLoanKrw, 600_000_000);
  assert.equal(scenario.minimumPurchaseCashKrw, 300_000_000);
  assert.ok(scenario.estimatedMonthlyPaymentKrw > 3_500_000);
});

test('DSR income constraint can reduce the desired mortgage', () => {
  const dsrLimit = estimateDsrLoanLimit({
    annualGrossIncomeKrw: 100_000_000,
    existingAnnualDebtServiceKrw: 10_000_000,
    dsrRatio: 0.40,
    stressAnnualRate: 0.06,
    termYears: 30,
  });
  const scenario = buildHousingPurchaseScenario(900_000_000, {
    annualGrossIncomeKrw: 100_000_000,
    existingAnnualDebtServiceKrw: 10_000_000,
  });
  assert.equal(scenario.dsrLimitKrw, dsrLimit);
  assert.ok(scenario.estimatedLoanKrw < 600_000_000);
  assert.equal(scenario.dsrVerificationRequired, false);
});

test('target range scenarios include monitoring floor and preferred range', () => {
  const scenarios = buildTargetRangeScenarios();
  assert.deepEqual(scenarios.map(item => item.purchasePriceKrw), [
    580_000_000,
    700_000_000,
    850_000_000,
    900_000_000,
    950_000_000,
  ]);
  assert.equal(Math.round(monthlyPayment(600_000_000, 0.06, 30)), 3_597_303);
});
