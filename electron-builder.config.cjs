const packageMetadata = require('./package.json');
const { resolveRepository } = require('./scripts/release-repository.cjs');

const repository = resolveRepository();

const config = {
  ...packageMetadata.build,
  files: [...packageMetadata.build.files, 'speech/**/*'],
  extraMetadata: {
    ...(packageMetadata.build.extraMetadata || {}),
    majiUpdateRepository: repository ? `${repository.owner}/${repository.repo}` : null,
  },
  ...(repository
    ? { publish: [{ provider: 'github', owner: repository.owner, repo: repository.repo, releaseType: 'release' }] }
    : { publish: [] }),
};

module.exports = config;
