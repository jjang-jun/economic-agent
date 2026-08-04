const token = process.env.TELEGRAM_BOT_TOKEN;

const BOT_COMMANDS = [
  { command: 'portfolio', description: '현재 포트폴리오 요약' },
  { command: 'goal', description: '경제적 자유 목표 상태' },
  { command: 'risk', description: '현재 리스크 한도와 비중 경고' },
  { command: 'recommendations', description: '최근 매수 검토 후보' },
  { command: 'buy', description: '매수 체결 기록 초안' },
  { command: 'sell', description: '매도 체결 기록 초안' },
  { command: 'cash', description: '현금 잔액 변경 초안' },
  { command: 'pending', description: '대기 중인 승인 작업' },
  { command: 'trades', description: '최근 승인 체결 기록' },
  { command: 'trade_performance', description: '기록된 거래의 실현·미실현 성과' },
  { command: 'help', description: '명령어와 입력 형식' },
];

async function syncTelegramCommands(options = {}) {
  const botToken = options.token || token;
  const fetcher = options.fetcher || fetch;
  if (!botToken) throw new Error('TELEGRAM_BOT_TOKEN is required');
  const res = await fetcher(`https://api.telegram.org/bot${botToken}/setMyCommands`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ commands: options.commands || BOT_COMMANDS }),
  });
  const data = await res.json();
  if (!res.ok || !data.ok) {
    throw new Error(`setMyCommands failed: ${res.status} ${JSON.stringify(data)}`);
  }
  return { commandCount: (options.commands || BOT_COMMANDS).length };
}

async function main() {
  const result = await syncTelegramCommands();
  console.log(`[Telegram] 명령 메뉴 ${result.commandCount}개 동기화 완료`);
}

if (require.main === module) {
  main().catch(err => {
    console.error(`[Telegram] ${err.message}`);
    process.exit(1);
  });
}

module.exports = { BOT_COMMANDS, syncTelegramCommands };
