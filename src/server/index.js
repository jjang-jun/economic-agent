const http = require('http');
const { handleTelegramWebhook } = require('./telegram-webhook');
const { runNewsCollector } = require('../jobs/run-news-collector');

const PORT = Number(process.env.PORT || process.env.AGENT_PORT || 3000);

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error('request body too large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

async function requestHandler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'GET' && url.pathname === '/health') {
    sendJson(res, 200, { ok: true, service: 'economic-agent', mode: 'agent-server' });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/telegram/webhook') {
    const body = await readBody(req);
    await handleTelegramWebhook(req, res, body);
    return;
  }

  if (req.method === 'POST' && url.pathname === '/jobs/news-collector') {
    const expectedSecret = process.env.JOB_SECRET || process.env.NEWS_COLLECTOR_JOB_SECRET;
    const providedSecret = req.headers['x-job-secret'];
    if (expectedSecret && providedSecret !== expectedSecret) {
      sendJson(res, 401, { ok: false, error: 'unauthorized' });
      return;
    }

    const result = await runNewsCollector({
      triggerSource: req.headers['x-trigger-source'] || 'http_scheduler',
      scheduledAt: req.headers['x-scheduled-at'] || null,
    });
    sendJson(res, result.skipped ? 202 : 200, result);
    return;
  }

  sendJson(res, 404, { ok: false, error: 'not found' });
}

function startServer() {
  const server = http.createServer((req, res) => {
    requestHandler(req, res).catch(err => {
      console.error(`[AgentServer] 요청 실패: ${err.message}`);
      sendJson(res, 500, { ok: false, error: 'internal error' });
    });
  });
  server.listen(PORT, () => {
    console.log(`[AgentServer] listening on :${PORT}`);
  });
  return server;
}

if (require.main === module) {
  startServer();
}

module.exports = {
  startServer,
  requestHandler,
};
