const test = require('node:test');
const assert = require('node:assert/strict');

const {
  generateDigest,
  DIGEST_PROMPT_VERSION,
} = require('../src/analysis/digest');

test('digest prompt version advances for GPT-5.6 contract changes', () => {
  assert.equal(DIGEST_PROMPT_VERSION, 'digest-v1.1');
});

test('digest generation propagates provider failures so workflow cannot report false success', async () => {
  await assert.rejects(
    generateDigest(
      [{ id: 'article-1', title: '시장 뉴스', score: 4 }],
      {},
      'preopen',
      {
        chatDetailed: async () => {
          throw new Error('model not found');
        },
      },
    ),
    /model not found/,
  );
});
