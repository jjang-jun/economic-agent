const { loadBuffer, clearBuffer } = require('./utils/article-buffer');
const { fetchAllIndicators } = require('./utils/indicators');
const { generateDigest } = require('./analysis/digest');
const { sendDigest } = require('./notify/telegram');
const { saveDailySummary } = require('./utils/daily-summary');
const { archiveScoredArticles } = require('./utils/article-archive');

// 세션 자동 판별 (KST 기준)
function detectSession() {
  const hour = parseInt(new Date().toLocaleString('en-US', {
    timeZone: 'Asia/Seoul',
    hour: 'numeric',
    hour12: false,
  }));

  if (hour < 9) return 'morning';
  if (hour < 13) return 'lunch';
  if (hour < 16) return 'close';
  if (hour < 20) return 'evening';
  return 'night';
}

async function main() {
  const session = process.argv[2] || detectSession();
  console.log(`[${new Date().toISOString()}] 다이제스트 생성: ${session}`);

  // 버퍼에 쌓인 기사 가져오기. 성공적으로 전송한 뒤에만 비운다.
  const articles = loadBuffer();
  console.log(`[버퍼] ${articles.length}건 수집됨`);

  if (articles.length === 0) {
    console.log('[완료] 요약할 기사가 없습니다.');
    return;
  }

  // 경제 지표
  const indicators = await fetchAllIndicators();
  archiveScoredArticles(articles);

  // AI로 다이제스트 생성
  const digest = await generateDigest(articles, indicators, session);
  if (!digest) {
    console.error('[완료] 다이제스트 생성 실패, 버퍼를 보존합니다.');
    return;
  }

  // Telegram 전송
  const sent = await sendDigest(digest);
  if (!sent) {
    console.error('[완료] 다이제스트 전송 실패, 버퍼를 보존합니다.');
    return;
  }

  // 일일 요약 저장
  saveDailySummary({ articles, indicators });
  clearBuffer();

  console.log(`[${new Date().toISOString()}] 완료`);
}

main().catch(err => {
  console.error('[에러]', err);
  process.exit(1);
});
