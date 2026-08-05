const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseNaturalPortfolioAction,
  parseNaturalReadOnlyQuery,
  parseWonAmount,
  stripDiscordMentions,
} = require('../src/agent/natural-action-parser');

const instruments = [
  { ticker: '005930', name: '삼성전자' },
  { ticker: 'NVDA', name: 'NVIDIA' },
];

test('Korean natural buy completion becomes a canonical pending-action command', () => {
  const result = parseNaturalPortfolioAction('<@123> 방금 삼성전자 3주를 7만원에 샀어', { instruments });
  assert.equal(result.kind, 'action');
  assert.equal(result.action, 'buy');
  assert.equal(result.command, '/buy 005930 3 70000 삼성전자');
});

test('Natural sell can use an explicit ticker when the name is unknown', () => {
  const result = parseNaturalPortfolioAction('새종목(123456) 2주를 12,500원에 팔았어', { instruments });
  assert.equal(result.kind, 'action');
  assert.equal(result.action, 'sell');
  assert.equal(result.command, '/sell 123456 2 12500');
});

test('Natural USD buy preserves currency metadata', () => {
  const result = parseNaturalPortfolioAction('NVIDIA 2주를 $120에 매수했어', { instruments });
  assert.equal(result.command, '/buy NVDA 2 120 NVIDIA currency=USD');
});

test('Natural cash state becomes a draft command and advice questions never become trades', () => {
  assert.equal(parseNaturalPortfolioAction('현금 잔액은 500만원이야', { instruments }).command, '/cash 5000000');
  assert.equal(parseNaturalPortfolioAction('삼성전자 지금 사도 돼?', { instruments }), null);
  assert.equal(parseNaturalPortfolioAction('현금 잔액이 얼마야?', { instruments }), null);
  assert.equal(parseNaturalReadOnlyQuery('현금 잔액이 얼마야?'), '/portfolio');
});

test('Ambiguous instrument asks for a ticker instead of guessing', () => {
  const result = parseNaturalPortfolioAction('처음보는회사 3주를 7만원에 샀어', { instruments });
  assert.equal(result.kind, 'clarification');
  assert.match(result.response, /종목 코드/);
});

test('Natural read-only questions map to existing economic office commands', () => {
  assert.equal(parseNaturalReadOnlyQuery('내 포트폴리오 상태 알려줘'), '/portfolio');
  assert.equal(parseNaturalReadOnlyQuery('경제적 자유 목표 진행은 어때?'), '/goal');
  assert.equal(parseNaturalReadOnlyQuery('최근 거래 성과 보여줘'), '/trade-performance');
  assert.equal(parseNaturalReadOnlyQuery('차단된 추천 후보도 전체로 보여줘'), '/recommendations blocked');
});

test('Korean amount and mention helpers preserve exact financial values', () => {
  assert.equal(parseWonAmount('7만원'), 70_000);
  assert.equal(parseWonAmount('1.5억원'), 150_000_000);
  assert.equal(stripDiscordMentions('<@!123>  삼성전자 3주'), '삼성전자 3주');
});
