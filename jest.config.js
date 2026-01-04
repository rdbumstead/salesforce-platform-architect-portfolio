const { jestConfig } = require("@salesforce/sfdx-lwc-jest/config");

module.exports = {
  ...jestConfig,
  modulePathIgnorePatterns: [
    "<rootDir>/.localdevserver",
    "<rootDir>/node_modules/",
    "<rootDir>/packages/integration-api/AnypointStudio/"
  ],
  moduleNameMapper: {
    "^@salesforce/resourceUrl/(.*)$": "<rootDir>/jest-mocks/resourceMock.js",
    "^lightning/platformResourceLoader$":
      "<rootDir>/node_modules/@salesforce/sfdx-lwc-jest/src/lightning-stubs/platformResourceLoader/platformResourceLoader.js",
    "^lightning/empApi$":
      "<rootDir>/node_modules/@salesforce/sfdx-lwc-jest/src/lightning-stubs/empApi/empApi.js"
  }
};
