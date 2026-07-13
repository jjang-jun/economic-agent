const fs = require('fs');
const path = require('path');

const URGENT_ALERT_STATE_FILE = path.join(__dirname, '..', '..', 'data', 'urgent-alert-state.json');

function loadUrgentAlertState(file = URGENT_ALERT_STATE_FILE) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return { alerts: Array.isArray(parsed.alerts) ? parsed.alerts : [] };
  } catch {
    return { alerts: [] };
  }
}

function markUrgentAlertsSent(articles = [], state = loadUrgentAlertState(), now = new Date()) {
  const sentAt = now.toISOString();
  const alerts = [...(state.alerts || [])];
  for (const article of articles) {
    alerts.push({
      articleId: article.id,
      eventKey: article.immediateEventKey,
      sentAt,
    });
  }
  const cutoff = now.getTime() - 48 * 60 * 60 * 1000;
  return {
    alerts: alerts
      .filter(entry => new Date(entry.sentAt || 0).getTime() >= cutoff)
      .slice(-100),
  };
}

function saveUrgentAlertState(state, file = URGENT_ALERT_STATE_FILE) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(state, null, 2));
}

module.exports = {
  URGENT_ALERT_STATE_FILE,
  loadUrgentAlertState,
  markUrgentAlertsSent,
  saveUrgentAlertState,
};
