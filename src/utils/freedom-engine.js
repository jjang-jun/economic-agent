const fs = require('fs');
const path = require('path');
const DEFAULT_FREEDOM_GOAL = require('../config/freedom');
const { getKSTDate } = require('./article-archive');

const FREEDOM_DIR = path.join(__dirname, '..', '..', 'data', 'freedom');
const FREEDOM_STATUS_FILE = path.join(FREEDOM_DIR, 'freedom-status.json');

function round(value, digits = 2) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function monthsBetween(start, end) {
  const from = new Date(start);
  const to = new Date(end);
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || to <= from) return null;
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
}

function normalizeGoal(raw = {}) {
  const goal = { ...DEFAULT_FREEDOM_GOAL, ...raw };
  const annualLivingCost = goal.monthlyLivingCost * 12;
  const targetNetWorth = goal.targetNetWorth || Math.round(annualLivingCost / goal.targetWithdrawalRate);
  return {
    ...goal,
    annualLivingCost,
    targetNetWorth,
  };
}

function estimateMonthsToTarget({ currentNetWorth, targetNetWorth, monthlySavingAmount, expectedAnnualReturnPct }) {
  if (!targetNetWorth || currentNetWorth >= targetNetWorth) return 0;
  const monthlyReturn = (expectedAnnualReturnPct || 0) / 100 / 12;
  let value = currentNetWorth || 0;
  for (let month = 1; month <= 1200; month++) {
    value = value * (1 + monthlyReturn) + (monthlySavingAmount || 0);
    if (value >= targetNetWorth) return month;
  }
  return null;
}

function addMonths(date, months) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return getKSTDate(next);
}

function futureValue({ currentNetWorth, monthlySavingAmount, annualReturnPct, months }) {
  const monthlyReturn = annualReturnPct / 100 / 12;
  let value = currentNetWorth || 0;
  for (let i = 0; i < months; i++) {
    value = value * (1 + monthlyReturn) + (monthlySavingAmount || 0);
  }
  return value;
}

function requiredAnnualReturnPct({ currentNetWorth, targetNetWorth, monthlySavingAmount, months }) {
  if (!months || currentNetWorth >= targetNetWorth) return 0;
  let low = -50;
  let high = 50;
  for (let i = 0; i < 80; i++) {
    const mid = (low + high) / 2;
    const value = futureValue({ currentNetWorth, monthlySavingAmount, annualReturnPct: mid, months });
    if (value >= targetNetWorth) high = mid;
    else low = mid;
  }
  return round(high, 2);
}

function buildFreedomStatus({ goal: rawGoal = {}, portfolio = {} } = {}) {
  const goal = normalizeGoal(rawGoal);
  const currentNetWorth = portfolio.totalAssetValue || goal.currentNetWorth || 0;
  const targetProgressPct = goal.targetNetWorth
    ? round((currentNetWorth / goal.targetNetWorth) * 100)
    : null;
  const monthsToTarget = estimateMonthsToTarget({
    currentNetWorth,
    targetNetWorth: goal.targetNetWorth,
    monthlySavingAmount: goal.monthlySavingAmount,
    expectedAnnualReturnPct: goal.expectedAnnualReturnPct,
  });
  const estimatedTargetDate = monthsToTarget === null ? null : addMonths(new Date(), monthsToTarget);
  const targetMonths = monthsBetween(new Date(), goal.targetDate);
  const requiredReturnPct = requiredAnnualReturnPct({
    currentNetWorth,
    targetNetWorth: goal.targetNetWorth,
    monthlySavingAmount: goal.monthlySavingAmount,
    months: targetMonths,
  });
  const stressedNetWorth = currentNetWorth * (1 - (goal.stressDrawdownPct || 0) / 100);
  const stressedMonths = estimateMonthsToTarget({
    currentNetWorth: stressedNetWorth,
    targetNetWorth: goal.targetNetWorth,
    monthlySavingAmount: goal.monthlySavingAmount,
    expectedAnnualReturnPct: goal.expectedAnnualReturnPct,
  });

  return {
    id: `${getKSTDate()}:freedom`,
    date: getKSTDate(),
    generatedAt: new Date().toISOString(),
    goal,
    currentNetWorth,
    targetProgressPct,
    monthlySavingAmount: goal.monthlySavingAmount,
    expectedAnnualReturnPct: goal.expectedAnnualReturnPct,
    aggressiveAnnualReturnPct: goal.aggressiveAnnualReturnPct ?? null,
    monthsToTarget,
    estimatedTargetDate,
    targetDate: goal.targetDate,
    targetMonths,
    requiredAnnualReturnPct: requiredReturnPct,
    stress: {
      drawdownPct: goal.stressDrawdownPct,
      stressedNetWorth: Math.round(stressedNetWorth),
      monthsToTarget: stressedMonths,
      delayMonths: monthsToTarget !== null && stressedMonths !== null ? stressedMonths - monthsToTarget : null,
    },
  };
}

function saveFreedomStatus(status) {
  fs.mkdirSync(FREEDOM_DIR, { recursive: true });
  fs.writeFileSync(FREEDOM_STATUS_FILE, JSON.stringify(status, null, 2));
  fs.writeFileSync(path.join(FREEDOM_DIR, `${status.date}.json`), JSON.stringify(status, null, 2));
  return FREEDOM_STATUS_FILE;
}

function loadFreedomStatus() {
  try {
    return JSON.parse(fs.readFileSync(FREEDOM_STATUS_FILE, 'utf-8'));
  } catch {
    return null;
  }
}

module.exports = {
  FREEDOM_DIR,
  FREEDOM_STATUS_FILE,
  buildFreedomStatus,
  saveFreedomStatus,
  loadFreedomStatus,
  normalizeGoal,
  estimateMonthsToTarget,
  requiredAnnualReturnPct,
};
