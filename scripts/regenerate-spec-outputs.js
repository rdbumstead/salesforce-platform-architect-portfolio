#!/usr/bin/env node

// Regenerates every file made from the API specs and stages it, so a spec change and its
// generated files land in one commit. Before this only the API docs were regenerated on
// commit, and they were left unstaged, so a stale copy failed only in CI after the push.
//
//   node scripts/regenerate-spec-outputs.js
//
// lint-staged runs it when a staged file under packages/integration-api/specs is YAML. It
// ignores any arguments, because lint-staged passes the staged file names. It runs, in order:
//
//   scripts/sync-specs.js                the static resource copies, the API Lab catalog and
//                                        docs/api/postman/portfolio-api.postman_collection.json
//   scripts/generate-api-docs.js         the pages under docs/api/oas
//   scripts/build-postman-collection.js  the PAPI_Postman_Collection static resource, with the
//                                        pinned openapi-to-postmanv2 dev dependency
//
// Then it stages only those generated paths, never another file. lint-staged stages only the
// files that were staged when it started, so without this the new files stay out of the commit.
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const syncSpecs = require("./sync-specs");
const { OUTPUT_FILE: POSTMAN_RESOURCE } = require("./build-postman-collection");

const ROOT = path.resolve(__dirname, "..");
const API_DOCS_DIR = "docs/api/oas";
const GENERATORS = [
  "sync-specs.js",
  "generate-api-docs.js",
  "build-postman-collection.js"
];

/** Every path the generators own, relative to the repository root, with forward slashes. */
function generatedPaths() {
  const outputs = syncSpecs.build();
  return [
    ...Object.keys(outputs.yaml),
    ...Object.keys(outputs.json),
    API_DOCS_DIR,
    path.relative(ROOT, POSTMAN_RESOURCE)
  ].map((relative) => relative.split(path.sep).join("/"));
}

function main() {
  GENERATORS.forEach((script) => {
    execFileSync(process.execPath, [path.join(__dirname, script)], {
      cwd: ROOT,
      stdio: "inherit"
    });
  });
  const paths = generatedPaths().filter((relative) =>
    fs.existsSync(path.join(ROOT, relative))
  );
  execFileSync("git", ["add", "--", ...paths], { cwd: ROOT, stdio: "inherit" });
  console.log(
    `Staged the files generated from the specs (${paths.length} paths).`
  );
}

if (require.main === module) {
  main();
}

module.exports = { generatedPaths, GENERATORS };
