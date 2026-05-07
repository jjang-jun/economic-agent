const { fetchRSSFeeds } = require('../sources/rss-fetcher');
const { fetchDartDisclosures } = require('../sources/dart-api');
const { filterByKeywords } = require('../filters/keyword-filter');
const { filterByRelevance } = require('../filters/relevance-matcher');
const { notifyArticles } = require('../notify/telegram');
const { loadSeenArticles, saveSeenArticles } = require('../utils/seen-articles');
const { addToBuffer } = require('../utils/article-buffer');
const { archiveScoredArticles } = require('../utils/article-archive');
const {
  persistArticles,
  createCollectorRun,
  updateCollectorRun,
  getLastSuccessfulCollectorRun,
  upsertSourceCursor,
  tryAcquireJobLock,
  releaseJobLock,
  persistAlertEvents,
} = require('../utils/persistence');
const { dedupeArticles, isSeenArticle, markSeenArticle } = require('../utils/article-identity');
const { scoreArticles } = require('../filters/local-scorer');
const { URGENT_SCORE, MAX_URGENT_ALERTS_PER_RUN } = require('../utils/config');

const DEFAULT_LOOKBACK_MINUTES = Number(process.env.NEWS_COLLECTOR_LOOKBACK_MINUTES || 30);
const MAX_LOOKBACK_MINUTES = Number(process.env.NEWS_COLLECTOR_MAX_LOOKBACK_MINUTES || 240);
const LOOKBACK_BUFFER_MINUTES = Number(process.env.NEWS_COLLECTOR_LOOKBACK_BUFFER_MINUTES || 10);
const STALE_IMMEDIATE_ALERT_MINUTES = Number(process.env.STALE_IMMEDIATE_ALERT_MINUTES || 30);

function minutesBetween(later, earlier) {
  return Math.ceil((later.getTime() - earlier.getTime()) / 60000);
}

function calculateLookbackMinutes({ now, lastSuccessAt }) {
  if (!lastSuccessAt) return DEFAULT_LOOKBACK_MINUTES;
  const gapMinutes = minutesBetween(now, new Date(lastSuccessAt));
  return Math.min(
    Math.max(DEFAULT_LOOKBACK_MINUTES, gapMinutes + LOOKBACK_BUFFER_MINUTES),
    MAX_LOOKBACK_MINUTES
  );
}

function getArticleAgeMinutes(article, now) {
  if (!article?.pubDate || article.pubDatePrecision === 'date') return null;
  const publishedAt = new Date(article.pubDate);
  if (Number.isNaN(publishedAt.getTime())) return null;
  return minutesBetween(now, publishedAt);
}

function isWithinLookback(article, since) {
  if (!article?.pubDate) return true;
  if (article.pubDatePrecision === 'date') {
    const articleDate = new Date(article.pubDate).toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
    const sinceDate = since.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
    return articleDate >= sinceDate;
  }
  const publishedAt = new Date(article.pubDate);
  if (Number.isNaN(publishedAt.getTime())) return true;
  return publishedAt >= since;
}

function splitAlerts(urgent, { now, isCatchUpRun }) {
  const immediateCandidates = [];
  const catchUp = [];

  for (const article of urgent) {
    const ageMinutes = getArticleAgeMinutes(article, now);
    const isStale = ageMinutes !== null
      ? ageMinutes > STALE_IMMEDIATE_ALERT_MINUTES
      : isCatchUpRun;

    if (isStale) {
      catchUp.push({ ...article, alertType: 'catch_up' });
    } else {
      immediateCandidates.push({ ...article, alertType: 'immediate' });
    }
  }

  return {
    immediate: immediateCandidates.slice(0, MAX_URGENT_ALERTS_PER_RUN),
    overflow: [
      ...immediateCandidates.slice(MAX_URGENT_ALERTS_PER_RUN).map(article => ({ ...article, alertType: 'digest' })),
      ...catchUp,
    ],
    catchUp,
  };
}

async function runNewsCollector(options = {}) {
  const now = options.now || new Date();
  const triggerSource = options.triggerSource || 'manual';
  const jobName = 'news-collector';
  const lock = await tryAcquireJobLock(jobName, {
    ttlSeconds: Number(process.env.NEWS_COLLECTOR_LOCK_TTL_SECONDS || 600),
    lockedBy: triggerSource,
  });

  if (!lock.acquired) {
    console.log(`[Collector] ${jobName} lock active, skip`);
    return { ok: true, skipped: true, reason: 'lock_active' };
  }

  const run = await createCollectorRun({
    jobName,
    triggerSource,
    scheduledAt: options.scheduledAt || null,
  });

  try {
    console.log(`[${now.toISOString()}] 뉴스 수집 시작`);

    const lastSuccessAt = await getLastSuccessfulCollectorRun(jobName);
    const lookbackMinutes = options.lookbackMinutes || calculateLookbackMinutes({ now, lastSuccessAt });
    const since = new Date(now.getTime() - lookbackMinutes * 60000);
    const isCatchUpRun = lookbackMinutes > DEFAULT_LOOKBACK_MINUTES + LOOKBACK_BUFFER_MINUTES;

    const [rssArticles, dartArticles] = await Promise.all([
      fetchRSSFeeds(),
      fetchDartDisclosures({
        startDate: since.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' }),
        endDate: now.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' }),
      }),
    ]);
    const allArticles = dedupeArticles([...rssArticles, ...dartArticles])
      .filter(article => isWithinLookback(article, since));
    console.log(`[수집] RSS ${rssArticles.length}건, DART ${dartArticles.length}건, lookback ${lookbackMinutes}분`);

    const seen = loadSeenArticles();
    const newArticles = allArticles.filter(a => !isSeenArticle(a, seen));
    console.log(`[중복제거] 신규 기사 ${newArticles.length}건`);

    if (newArticles.length === 0) {
      await updateCollectorRun(run.id, {
        status: 'success',
        finishedAt: new Date().toISOString(),
        lookbackMinutes,
        rssFetchedCount: rssArticles.length,
        dartFetchedCount: dartArticles.length,
        newArticleCount: 0,
      });
      await upsertSourceCursor(jobName, {
        lastSuccessAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      console.log('[완료] 새로운 기사가 없습니다.');
      return { ok: true, newArticleCount: 0, immediateAlertCount: 0, digestBufferCount: 0 };
    }

    const keywordFiltered = filterByKeywords(newArticles);
    console.log(`[키워드] ${keywordFiltered.length}건 통과`);

    if (keywordFiltered.length === 0) {
      for (const article of newArticles) markSeenArticle(article, seen);
      saveSeenArticles(seen);
      await updateCollectorRun(run.id, {
        status: 'success',
        finishedAt: new Date().toISOString(),
        lookbackMinutes,
        rssFetchedCount: rssArticles.length,
        dartFetchedCount: dartArticles.length,
        newArticleCount: newArticles.length,
      });
      await upsertSourceCursor(jobName, {
        lastSuccessAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      console.log('[완료] 키워드 매칭 기사가 없습니다.');
      return { ok: true, newArticleCount: newArticles.length, immediateAlertCount: 0, digestBufferCount: 0 };
    }

    const scored = await scoreArticles(keywordFiltered);
    console.log(`[스코어링] ${scored.length}건 통과`);
    const archived = archiveScoredArticles(scored);
    console.log(`[아카이브] 점수화 기사 ${archived}건 신규 저장`);
    await persistArticles(scored);

    const urgent = filterByRelevance(scored.filter(a => a.score >= URGENT_SCORE))
      .sort((a, b) => (
        (b.urgencyScore || 0) - (a.urgencyScore || 0)
        || (b.importanceScore || 0) - (a.importanceScore || 0)
        || (b.tradabilityScore || 0) - (a.tradabilityScore || 0)
        || new Date(b.pubDate || 0) - new Date(a.pubDate || 0)
      ));
    const normal = scored.filter(a => a.score < URGENT_SCORE);
    const alertSplit = splitAlerts(urgent, { now, isCatchUpRun });

    console.log(`[관련성] 긴급 ${urgent.length}건`);
    if (alertSplit.overflow.length > 0) {
      console.log(`[긴급제한] 즉시 전송 ${alertSplit.immediate.length}건, 다이제스트/캐치업 이월 ${alertSplit.overflow.length}건`);
    }

    let sent = 0;
    if (alertSplit.immediate.length > 0) {
      sent = await notifyArticles(alertSplit.immediate);
      console.log(`[긴급알림] ${sent}건 즉시 전송`);
    }
    await persistAlertEvents([
      ...alertSplit.immediate.map((article, index) => ({
        articleId: article.id,
        alertType: 'immediate',
        status: index < sent ? 'sent' : 'failed',
        sentAt: index < sent ? new Date().toISOString() : null,
        payload: article,
      })),
      ...alertSplit.overflow.map(article => ({
        articleId: article.id,
        alertType: article.alertType || 'digest',
        status: 'pending',
        payload: article,
      })),
      ...normal.map(article => ({
        articleId: article.id,
        alertType: 'digest',
        status: 'pending',
        payload: article,
      })),
    ]);

    const added = addToBuffer(dedupeArticles([...alertSplit.overflow, ...normal]));
    console.log(`[버퍼] ${added}건 추가 (다이제스트 대기)`);

    for (const article of newArticles) markSeenArticle(article, seen);
    saveSeenArticles(seen);

    const latestPublishedAt = scored
      .map(article => article.pubDate)
      .filter(Boolean)
      .sort()
      .at(-1);
    await updateCollectorRun(run.id, {
      status: 'success',
      finishedAt: new Date().toISOString(),
      lookbackMinutes,
      rssFetchedCount: rssArticles.length,
      dartFetchedCount: dartArticles.length,
      newArticleCount: newArticles.length,
      immediateAlertCount: sent,
      digestBufferCount: added,
    });
    await upsertSourceCursor(jobName, {
      lastSuccessAt: new Date().toISOString(),
      lastSeenPublishedAt: latestPublishedAt || null,
      updatedAt: new Date().toISOString(),
    });

    console.log(`[${new Date().toISOString()}] 수집 완료`);
    return {
      ok: true,
      newArticleCount: newArticles.length,
      scoredCount: scored.length,
      immediateAlertCount: sent,
      digestBufferCount: added,
      lookbackMinutes,
    };
  } catch (err) {
    await updateCollectorRun(run.id, {
      status: 'failed',
      finishedAt: new Date().toISOString(),
      errorMessage: err.message,
    });
    throw err;
  } finally {
    await releaseJobLock(jobName);
  }
}

module.exports = {
  runNewsCollector,
  calculateLookbackMinutes,
  isWithinLookback,
  splitAlerts,
};
