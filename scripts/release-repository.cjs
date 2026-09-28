const EXPECTED_OWNER = 'zh2335897181-cell';

function resolveRepository(environment = process.env) {
  const value = environment.MAJI_GITHUB_REPOSITORY || environment.GITHUB_REPOSITORY;
  if (!value) return null;
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value)) {
    throw new Error('MAJI_GITHUB_REPOSITORY must use owner/repo format.');
  }
  const [owner, repo] = value.split('/');
  if (owner !== EXPECTED_OWNER) {
    throw new Error(`Update publishing is restricted to ${EXPECTED_OWNER}/<repo>.`);
  }
  return { owner, repo };
}

module.exports = { resolveRepository };
