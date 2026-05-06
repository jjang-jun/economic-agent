const token = process.env.TELEGRAM_BOT_TOKEN;
const webhookUrl = process.env.TELEGRAM_WEBHOOK_URL || process.argv[2];
const secretToken = process.env.TELEGRAM_WEBHOOK_SECRET || process.env.TELEGRAM_SECRET_TOKEN || '';

async function main() {
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is required');
  if (!webhookUrl) throw new Error('TELEGRAM_WEBHOOK_URL or argv[2] is required');

  const url = `https://api.telegram.org/bot${token}/setWebhook`;
  const body = {
    url: webhookUrl,
    allowed_updates: ['message', 'edited_message', 'callback_query'],
  };
  if (secretToken) body.secret_token = secretToken;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok || !data.ok) {
    throw new Error(`setWebhook failed: ${res.status} ${JSON.stringify(data)}`);
  }
  console.log(`[Telegram] webhook set: ${webhookUrl}`);
}

main().catch(err => {
  console.error(`[Telegram] ${err.message}`);
  process.exit(1);
});
