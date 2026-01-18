/* eslint-env node */
const url = process.env.TARGET_URL || 'https://ryanbumstead.com/';

module.exports = {
  ci: {
    collect: {
      url: [url],
      numberOfRuns: 3,
    },
    assert: {
      assertions: {
        'categories:performance': ['warn', { minScore: 0.8 }], // Warn if under 80%
        'categories:accessibility': ['error', { minScore: 0.9 }], // Fail if a11y drops
        'largest-contentful-paint': ['error', { maxNumericValue: 2500 }], // FAIL if > 2.5s
      },
    },
    upload: {
      target: 'temporary-public-storage',
    },
  },
};