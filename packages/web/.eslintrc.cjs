/**
 * Web lint config: the root rules plus Next.js's own (`@next/next/*`,
 * `react-hooks/*`), which the app's eslint-disable comments refer to.
 * @type {import('eslint').Linter.Config}
 */
module.exports = {
  extends: ['../../.eslintrc.cjs', 'next/core-web-vitals', 'prettier'],
  env: { browser: true },
};
