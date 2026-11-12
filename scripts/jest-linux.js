#!/usr/bin/env node
/* eslint-disable no-console */

// Runs the LWC Jest suite on Linux, the way CI does, before a pull request.
//
//   node scripts/jest-linux.js [-- <extra sfdx-lwc-jest arguments>]
//
// Jest on Windows can pass where CI's Linux run fails (case sensitive paths, line endings,
// path separators). This runs `npx sfdx-lwc-jest` in a Node container limited to 2 CPUs.
// The image is the Node major CI's quality-check job installs, read from pr.yml, because the
// npm that ships with each Node major reads the lockfile's overrides differently, and npm 10
// refuses a lockfile npm 11 accepts. The repo is mounted read only at /repo. The container
// copies the sources (not node_modules, .git or web) into its own /work folder, installs with
// `npm ci`, and runs Jest there, so nothing in the checkout changes and the Windows
// node_modules are never used.
//
// It needs Docker running. When it is not, the script says so and exits 2, instead of
// letting `docker run` fail with a pipe error.
//
// Exit codes: 0 Jest passed, 1 Jest failed, 2 Docker is not available, 3 `npm ci` failed in
// the container, so Jest never ran.
// Not part of ci:local on purpose. It is slow, so it runs once on a branch's head.

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const FALLBACK_NODE = "26";
const INSTALL_FAILED = 3;
const CPUS = "2";

/** The Node major CI's quality-check job uses, from pr.yml, or the fallback when unreadable. */
function ciNodeMajor(read = (file) => fs.readFileSync(file, "utf8")) {
  try {
    const match = read(path.join(ROOT, ".github", "workflows", "pr.yml")).match(
      /node[_-]version:\s*["']?(\d+)/
    );
    if (match) return match[1];
  } catch (error) {
    // Fall through to the fallback.
  }
  return FALLBACK_NODE;
}

const IMAGE = `node:${ciNodeMajor()}`;

/** The shell line the container runs. extra is the list of Jest arguments after --. */
function containerScript(extra) {
  const jestArgs = extra
    .map((arg) => `'${arg.replace(/'/g, `'\''`)}'`)
    .join(" ");
  return [
    "set -e",
    "mkdir /work",
    "cd /repo",
    "tar --exclude=./node_modules --exclude=./.git --exclude=./web --exclude=./.lighthouseci -cf - . | tar -xf - -C /work",
    "cd /work",
    `{ npm ci --ignore-scripts --no-audit --no-fund || exit ${INSTALL_FAILED}; }`,
    `npx sfdx-lwc-jest${jestArgs ? ` -- ${jestArgs}` : ""}`
  ].join(" && ");
}

/** The docker run arguments. */
function dockerArgs(root, extra) {
  return [
    "run",
    "--rm",
    "--cpus",
    CPUS,
    "-v",
    `${root}:/repo:ro`,
    "-e",
    "CI=true",
    IMAGE,
    "sh",
    "-c",
    containerScript(extra)
  ];
}

/** True when the Docker daemon answers. */
function dockerRunning(run) {
  const res = run(["info", "--format", "{{.ServerVersion}}"], { quiet: true });
  return res.status === 0 && Boolean((res.stdout || "").trim());
}

function realRun(args, options = {}) {
  return spawnSync("docker", args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: options.quiet ? "pipe" : "inherit"
  });
}

/** Returns the exit code. */
function main(argv, run = realRun, log = console.log) {
  const split = argv.indexOf("--");
  const extra = split < 0 ? [] : argv.slice(split + 1);
  if (split < 0 && argv.length > 0) {
    log(
      `jest-linux: unknown argument ${argv[0]}. Put Jest arguments after --.`
    );
    return 2;
  }
  let up = false;
  try {
    up = dockerRunning(run);
  } catch (error) {
    up = false;
  }
  if (!up) {
    log(
      "jest-linux: Docker is not running. Start Docker Desktop, wait until it says it is running, then run this again. Nothing was run."
    );
    return 2;
  }
  log(
    `jest-linux: running Jest in ${IMAGE} with --cpus ${CPUS}, the repo mounted read only`
  );
  const res = run(dockerArgs(ROOT, extra));
  if (res.error || res.status === null) {
    log(
      "jest-linux: docker run could not start. Check that Docker is running."
    );
    return 2;
  }
  if (res.status === INSTALL_FAILED) {
    log(
      `jest-linux: npm ci failed inside ${IMAGE}, so Jest did not run. Read the npm error above.`
    );
    return INSTALL_FAILED;
  }
  log(
    res.status === 0
      ? "jest-linux: Jest passed on Linux"
      : "jest-linux: Jest FAILED on Linux"
  );
  return res.status === 0 ? 0 : 1;
}

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}

module.exports = {
  main,
  dockerArgs,
  containerScript,
  dockerRunning,
  ciNodeMajor,
  IMAGE,
  INSTALL_FAILED,
  CPUS
};
