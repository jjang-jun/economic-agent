const fs = require('fs');
const path = require('path');
const { getArticleKeys, isSimilarArticle } = require('./article-identity');

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
  const existingKeys = new Set(buffer.flatMap(getArticleKeys));
  const toAdd = newArticles.filter(article => {
    const keys = getArticleKeys(article);
    if (keys.some(key => existingKeys.has(key))) return false;
    if ([...buffer, ...toAdd].some(existing => isSimilarArticle(existing, article))) return false;
    for (const key of keys) existingKeys.add(key);
    return true;
  });
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
