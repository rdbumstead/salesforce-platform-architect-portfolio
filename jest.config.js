const { jestConfig } = require("@salesforce/sfdx-lwc-jest/config");

module.exports = {
  ...jestConfig,
  modulePathIgnorePatterns: [
    "<rootDir>/.localdevserver",
    "<rootDir>/node_modules/",
    "<rootDir>/packages/integration-api/AnypointStudio/"
  ]
};
