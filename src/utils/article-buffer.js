const fs = require('fs');
const path = require('path');
const { getArticleKeys, isSimilarArticle } = require('./article-identity');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const BUFFER_FILE = path.join(DATA_DIR, 'article-buffer.json');

function getBufferFile() {
  return process.env.ARTICLE_BUFFER_FILE || BUFFER_FILE;
}

function loadBuffer() {
  try {
    const data = fs.readFileSync(getBufferFile(), 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

function saveBuffer(articles) {
  const file = getBufferFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(articles, null, 2));
}

function addToBuffer(newArticles) {
  const buffer = loadBuffer();
  const existingKeys = new Set(buffer.flatMap(getArticleKeys));
  const toAdd = [];
  for (const article of newArticles) {
    const keys = getArticleKeys(article);
    if (keys.some(key => existingKeys.has(key))) continue;
    if ([...buffer, ...toAdd].some(existing => isSimilarArticle(existing, article))) continue;
    for (const key of keys) existingKeys.add(key);
    toAdd.push(article);
  }
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
