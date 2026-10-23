/* eslint-env node */
// Base URL without a trailing slash. Every route below is appended to it.
// The default is the site itself, not ryanbumstead.com, because that domain is a
// 301 that sends every path to the home page.
const base = (
  process.env.TARGET_URL ||
  "https://ryan-bumstead-dev-ed.develop.my.site.com/portfolio"
).replace(/\/+$/, "");
const routes = [
  "/",
  "/resume",
  "/skills",
  "/api-lab",
  "/business-architecture",
  "/nonprofit-solutions"
];

module.exports = {
  ci: {
    collect: {
      url: routes.map((route) => `${base}${route}`),
      numberOfRuns: 3
    },
    assert: {
      assertions: {
        "categories:performance": ["warn", { minScore: 0.8 }],
        "categories:accessibility": ["error", { minScore: 1 }],
        "largest-contentful-paint": ["error", { maxNumericValue: 2500 }]
      }
    },
    upload: {
      // Reports stay on this machine in .lighthouseci/, which .gitignore already lists.
      target: "filesystem",
      outputDir: ".lighthouseci"
    }
  }
};
