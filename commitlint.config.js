// Conventional Commits (ver specs/decisions/flujo-de-ramas-staging-y-main.md).
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [1, 'always', ['api', 'web', 'docker', 'ci', 'deps', 'specs', 'repo']],
  },
};
