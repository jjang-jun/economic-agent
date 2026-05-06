const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const BUFFER_FILE = path.join(DATA_DIR, 'article-buffer.json');

function loadBuffer() {
  try {
    const data = fs.readFileSync(BUFFER_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

function saveBuffer(articles) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(BUFFER_FILE, JSON.stringify(articles, null, 2));
}

function addToBuffer(newArticles) {
  const buffer = loadBuffer();
  const existingIds = new Set(buffer.map(a => a.id));
  const toAdd = newArticles.filter(a => !existingIds.has(a.id));
  buffer.push(...toAdd);
  saveBuffer(buffer);
  return toAdd.length;
}

function flushBuffer() {
  const buffer = loadBuffer();
  saveBuffer([]);
  return buffer;
}

function clearBuffer() {
  saveBuffer([]);
}

module.exports = { loadBuffer, saveBuffer, addToBuffer, flushBuffer, clearBuffer };
