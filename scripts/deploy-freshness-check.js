#!/usr/bin/env node

const { sendTelegramMessage } = require('../src/notify/telegram');

function parseArgs(argv = process.argv.slice(2), env = process.env) {
  const options = {
    url: env.AGENT_SERVER_URL || env.CLOUD_RUN_SERVICE_URL || env.RENDER_SERVICE_URL || '',
    expectedSha: env.EXPECTED_DEPLOY_SHA || env.GITHUB_SHA || '',
    noTelegram: false,
    timeoutMs: Number(env.DEPLOY_FRESHNESS_TIMEOUT_MS || 8000),
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--noTelegram' || arg === '--no-telegram') {
      options.noTelegram = true;
      continue;
    }
    if (arg === '--url' && argv[i + 1]) {
      options.url = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg.startsWith('--url=')) {
      options.url = arg.slice('--url='.length);
      continue;
    }
    if (arg === '--expected-sha' && argv[i + 1]) {
      options.expectedSha = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg.startsWith('--expected-sha=')) {
      options.expectedSha = arg.slice('--expected-sha='.length);
      continue;
    }
  }

  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0) {
    options.timeoutMs = 8000;
  }
  options.url = String(options.url || '').replace(/\/+$/, '');
  options.expectedSha = String(options.expectedSha || '').trim();
  return options;
}

function shortSha(value) {
  const sha = String(value || '').trim();
  return sha ? sha.slice(0, 7) : 'n/a';
}

function evaluateDeployFreshness(versionPayload = {}, expectedSha = '') {
  const deployedSha = String(versionPayload.commitSha || '').trim();
  const expected = String(expectedSha || '').trim();
  if (!expected) {
    return {
      ok: false,
      reason: 'expected_sha_missing',
      message: '비교할 GitHub 커밋 SHA가 없습니다.',
      deployedSha,
      expectedSha: expected,
    };
  }
  if (!deployedSha) {
    return {
      ok: false,
      reason: 'deployed_sha_missing',
      message: '서버 /version 응답에 commitSha가 없습니다. 배포 환경변수 COMMIT_SHA 또는 GITHUB_SHA 주입이 필요합니다.',
      deployedSha,
      expectedSha: expected,
    };
  }
  const ok = deployedSha === expected || deployedSha.startsWith(expected) || expected.startsWith(deployedSha);
  return {
    ok,
    reason: ok ? 'fresh' : 'stale',
    message: ok ? '서버 배포가 GitHub 최신 커밋과 일치합니다.' : '서버 배포 커밋이 GitHub 최신 커밋과 다릅니다.',
    deployedSha,
    expectedSha: expected,
  };
}

function formatDeployFreshnessMessage(result = {}, payload = {}, url = '') {
  return [
    '<b>배포 최신성 점검</b>',
    `상태: ${result.ok ? '정상' : '확인 필요'}`,
    `사유: ${result.message || result.reason || 'n/a'}`,
    `서버: ${url || 'n/a'}`,
    `배포 커밋: ${shortSha(result.deployedSha)}`,
    `GitHub 커밋: ${shortSha(result.expectedSha)}`,
    payload.revision ? `Revision: ${payload.revision}` : '',
    payload.serviceName ? `Service: ${payload.serviceName}` : '',
  ].filter(Boolean).join('\n');
}

async function fetchVersion(url, timeoutMs = 8000) {
  if (!url) throw new Error('AGENT_SERVER_URL 또는 CLOUD_RUN_SERVICE_URL이 필요합니다.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${url}/version`, { signal: controller.signal });
    const body = await res.text();
    if (!res.ok) throw new Error(`/version ${res.status}: ${body.slice(0, 200)}`);
    return JSON.parse(body);
  } catch (err) {
    throw new Error(formatFetchError(err, url));
  } finally {
    clearTimeout(timer);
  }
}

function formatFetchError(err, url = '') {
  if (err?.name === 'AbortError') return `/version 요청 시간 초과: ${url}`;
  const cause = err?.cause;
  const code = cause?.code || err?.code || '';
  const reason = cause?.message || err?.message || String(err);
  return `/version 요청 실패${code ? ` (${code})` : ''}: ${reason}`;
}

async function main() {
  const options = parseArgs();
  const payload = await fetchVersion(options.url, options.timeoutMs);
  const result = evaluateDeployFreshness(payload, options.expectedSha);
  const message = formatDeployFreshnessMessage(result, payload, options.url);

  console.log(message.replace(/<[^>]+>/g, ''));
  if (!result.ok) {
    if (!options.noTelegram) {
      await sendTelegramMessage(message, { channel: 'private' });
    }
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error('[deploy-freshness] failed:', err.message);
    process.exit(1);
  });
}

module.exports = {
  parseArgs,
  evaluateDeployFreshness,
  formatDeployFreshnessMessage,
  formatFetchError,
  shortSha,
};
