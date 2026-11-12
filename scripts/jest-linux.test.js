// Tests for scripts/jest-linux.js. Run: node --test scripts/jest-linux.test.js
const test = require("node:test");
const assert = require("node:assert");
const {
  main,
  dockerArgs,
  containerScript,
  dockerRunning
} = require("./jest-linux.js");

/** A docker stub. info answers per `up`, and run answers with the given status. */
function stub({ up = true, status = 0, error = null } = {}) {
  const calls = [];
  const run = (args) => {
    calls.push(args);
    if (args[0] === "info") {
      return up
        ? { status: 0, stdout: "27.0.1\n" }
        : {
            status: 1,
            stdout: "",
            stderr: "failed to connect to the docker API"
          };
    }
    return { status, error };
  };
  return { run, calls };
}

test("dockerRunning is false when info fails or prints nothing", () => {
  assert.strictEqual(dockerRunning(stub({ up: false }).run), false);
  assert.strictEqual(
    dockerRunning(() => ({ status: 0, stdout: "" })),
    false
  );
  assert.strictEqual(dockerRunning(stub().run), true);
});

test("says plainly that Docker is not running and runs nothing", () => {
  const s = stub({ up: false });
  const lines = [];
  const code = main([], s.run, (l) => lines.push(l));
  assert.strictEqual(code, 2);
  assert.match(lines[0], /Docker is not running/);
  assert.deepStrictEqual(
    s.calls.map((c) => c[0]),
    ["info"]
  );
});

test("a thrown docker call counts as not running", () => {
  const code = main(
    [],
    () => {
      throw new Error("spawn docker ENOENT");
    },
    () => {}
  );
  assert.strictEqual(code, 2);
});

test("runs node:22 with 2 CPUs and the repo mounted read only", () => {
  const s = stub();
  const code = main([], s.run, () => {});
  assert.strictEqual(code, 0);
  const args = s.calls[1];
  assert.strictEqual(args[0], "run");
  assert.strictEqual(args[args.indexOf("--cpus") + 1], "2");
  assert.ok(args.includes("node:22"));
  const mount = args[args.indexOf("-v") + 1];
  assert.ok(mount.endsWith(":/repo:ro"), mount);
});

test("the container copies sources, installs and runs Jest", () => {
  const script = containerScript([]);
  assert.match(script, /npm ci/);
  assert.match(script, /npx sfdx-lwc-jest$/);
  assert.match(script, /--exclude=\.\/node_modules/);
  assert.match(script, /cd \/work/);
});

test("extra arguments after -- reach Jest, quoted", () => {
  const s = stub();
  main(["--", "packages/x/lwc/footer", "-t", "it's"], s.run, () => {});
  const script = s.calls[1][s.calls[1].length - 1];
  assert.match(
    script,
    /npx sfdx-lwc-jest -- 'packages\/x\/lwc\/footer' '-t' 'it'\''s'$/
  );
});

test("exit 1 when Jest fails, 2 when docker run cannot start", () => {
  assert.strictEqual(
    main([], stub({ status: 1 }).run, () => {}),
    1
  );
  assert.strictEqual(
    main([], stub({ status: null, error: new Error("x") }).run, () => {}),
    2
  );
});

test("an argument without -- is refused before docker is touched", () => {
  const s = stub();
  assert.strictEqual(
    main(["footer"], s.run, () => {}),
    2
  );
  assert.strictEqual(s.calls.length, 0);
});

test("dockerArgs puts the script last", () => {
  const args = dockerArgs("/r", []);
  assert.strictEqual(args[args.length - 3], "sh");
  assert.strictEqual(args[args.length - 2], "-c");
});
