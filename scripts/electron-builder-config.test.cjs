const assert = require('node:assert/strict');
const test = require('node:test');
const { resolveRepository } = require('../scripts/release-repository.cjs');

test('missing repository does not configure a publish destination', () => {
  assert.equal(resolveRepository({}), null);
});

test('accepts only the confirmed public repository owner', () => {
  assert.deepEqual(resolveRepository({ MAJI_GITHUB_REPOSITORY: 'zh2335897181-cell/maji' }), {
    owner: 'zh2335897181-cell',
    repo: 'maji',
  });
});

test('accepts a valid repository from GitHub Actions context', () => {
  assert.deepEqual(resolveRepository({ GITHUB_REPOSITORY: 'zh2335897181-cell/maji' }), {
    owner: 'zh2335897181-cell',
    repo: 'maji',
  });
});

test('rejects malformed repository names and unexpected owners', () => {
  assert.throws(() => resolveRepository({ MAJI_GITHUB_REPOSITORY: 'maji' }), /owner\/repo/);
  assert.throws(() => resolveRepository({ MAJI_GITHUB_REPOSITORY: 'someone-else/maji' }), /restricted/);
});
