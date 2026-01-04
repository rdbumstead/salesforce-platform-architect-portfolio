const eslintJs = require("@eslint/js");
const jestPlugin = require("eslint-plugin-jest");
const auraPlugin = require("@salesforce/eslint-plugin-aura");
const lwcConfig = require("@salesforce/eslint-config-lwc/recommended");
const globals = require("globals");

module.exports = [
  // Global ignores
  {
    ignores: ["**/AnypointStudio/**", "scan-results.html", "results.html"]
  },

  // Base ESLint recommended rules
  eslintJs.configs.recommended,

  // Aura configuration
  ...auraPlugin.configs.recommended,
  ...auraPlugin.configs.locker,
  {
    files: ["**/aura/**/*.js"],
    languageOptions: {
      sourceType: "script",
      ecmaVersion: 2020
    }
  },

  // LWC configuration
  ...lwcConfig,
  {
    files: ["**/lwc/**/*.js"],
    languageOptions: {
      sourceType: "module",
      ecmaVersion: 2022,
      parser: require("@babel/eslint-parser"),
      parserOptions: {
        requireConfigFile: false,
        babelOptions: {
          parserOpts: {
            plugins: [
              "classProperties",
              ["decorators", { decoratorsBeforeExport: false }]
            ]
          }
        }
      },
      globals: {
        ...globals.browser
      }
    },
    rules: {
      "@lwc/lwc-platform/no-inline-disable": "off",
      "no-await-in-loop": "off",
      // Allow setTimeout and requestAnimationFrame for animations
      "@lwc/lwc/no-async-operation": "off"
    }
  },

  // LWC test files configuration
  {
    files: ["**/lwc/**/*.test.js"],
    languageOptions: {
      sourceType: "module",
      ecmaVersion: 2022,
      parser: require("@babel/eslint-parser"),
      parserOptions: {
        requireConfigFile: false,
        babelOptions: {
          parserOpts: {
            plugins: [
              "classProperties",
              ["decorators", { decoratorsBeforeExport: false }]
            ]
          }
        }
      },
      globals: {
        ...globals.node,
        ...globals.jest
      }
    },
    rules: {
      "@lwc/lwc/no-unexpected-wire-adapter-usages": "off"
    }
  },

  // Jest mocks configuration
  {
    files: ["**/jest-mocks/**/*.js"],
    languageOptions: {
      sourceType: "module",
      ecmaVersion: "latest",
      globals: {
        ...globals.node,
        ...globals.es2021,
        ...jestPlugin.environments.globals.globals
      }
    },
    plugins: {
      jest: jestPlugin
    },
    rules: {
      ...jestPlugin.configs.recommended.rules
    }
  },

  {
    files: ["scripts/**/*.js", "eslint.config.js", "lighthouserc.cjs"],
    languageOptions: {
      globals: {
        ...globals.node
      }
    }
  },
  {
    files: ["scripts/cache-warmer.js"],
    languageOptions: {
      sourceType: "module",
      globals: {
        ...globals.node
      }
    }
  }
];
