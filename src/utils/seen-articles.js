const fs = require('fs');
const path = require('path');
const { MAX_SEEN } = require('./config');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const SEEN_FILE = path.join(DATA_DIR, 'seen-articles.json');

function loadSeenArticles() {
  try {
    const data = fs.readFileSync(SEEN_FILE, 'utf-8');
    return new Set(JSON.parse(data));
  } catch {
    return new Set();
  }
}

function saveSeenArticles(seen) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const arr = [...seen];
  const trimmed = arr.slice(-MAX_SEEN);
  fs.writeFileSync(SEEN_FILE, JSON.stringify(trimmed, null, 2));
}

module.exports = { loadSeenArticles, saveSeenArticles };
