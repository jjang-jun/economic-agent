const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

test('addToBuffer appends unique articles without referencing pending list before initialization', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'economic-agent-buffer-'));
  const oldBufferFile = process.env.ARTICLE_BUFFER_FILE;
  process.env.ARTICLE_BUFFER_FILE = path.join(tempDir, 'article-buffer.json');

  try {
    const { addToBuffer, loadBuffer, clearBuffer } = require('../src/utils/article-buffer');
    clearBuffer();

    const added = addToBuffer([
      { id: 'a1', title: '삼성전자 신규 공급계약', link: 'https://example.com/a1' },
      { id: 'a2', title: '삼성전자 신규 공급계약', link: 'https://example.com/a2' },
      { id: 'a3', title: 'SK하이닉스 실적 개선', link: 'https://example.com/a3' },
    ]);

    assert.equal(added, 2);
    assert.deepEqual(loadBuffer().map(article => article.id), ['a1', 'a3']);
  } finally {
    if (oldBufferFile === undefined) {
      delete process.env.ARTICLE_BUFFER_FILE;
    } else {
      process.env.ARTICLE_BUFFER_FILE = oldBufferFile;
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
