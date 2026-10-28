const { jestConfig } = require("@salesforce/sfdx-lwc-jest/config");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");

module.exports = {
  ...jestConfig,
  rootDir: projectRoot,
  // No lightning/* mapping: the sfdx-lwc-jest resolver gives each base component and module
  // its own stub with the real public API. Add a repo mock here only for a component with no
  // stub, or for a test that needs behaviour the stub lacks, and name the component.
  // A CSS only module has no JS file for the resolver to find, so each one is named here.
  moduleNameMapper: {
    ...(jestConfig.moduleNameMapper || {}),
    "^c/nativeControls$": path.join(
      projectRoot,
      "packages/portfolio-site/main/default/lwc/nativeControls/nativeControls.css"
    ),
    // Every other c/ module is named here too, so Jest gives an import of it one module id in
    // every test file. Left to the resolver, a suite that mocks a module as virtual and a suite
    // that loads it plainly cache different ids for the same import in a shared worker, and a
    // later suite's mock never reaches the component that imports it.
    "^c/([^/]+)$": path.join(
      projectRoot,
      "packages/portfolio-site/main/default/lwc/$1/$1"
    )
  },
  roots: [path.join(projectRoot, "packages", "portfolio-site")],
  testMatch: ["**/__tests__/**/*.{js,ts}"],
  modulePathIgnorePatterns: [
    path.join(projectRoot, "packages", "integration-api")
  ],
  testPathIgnorePatterns: [
    "/node_modules/",
    path.join(projectRoot, "packages", "integration-api")
  ]
};
