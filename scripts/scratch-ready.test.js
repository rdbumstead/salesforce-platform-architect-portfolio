// Tests for scripts/scratch-ready.js. Run: node --test scripts/scratch-ready.test.js
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  parseArgs,
  main,
  buildDocsPlan,
  docPaths,
  splitContent,
  siteBase,
  StepError,
  STEPS,
  PRODUCTION_ORG_ID
} = require("./scratch-ready.js");

/** A stub sf that records each call and answers with the body for its command. */
function stubSf(overrides = {}) {
  const calls = [];
  const sf = (args) => {
    calls.push(args);
    const key = args.slice(0, 3).join(" ");
    if (overrides[key]) {
      return overrides[key](args);
    }
    switch (key) {
      case "limits api display":
        return {
          status: 0,
          result: [
            { name: "ActiveScratchOrgs", remaining: 3 },
            { name: "DailyScratchOrgs", remaining: 6 }
          ]
        };
      case "org list":
        return { status: 0, result: { scratchOrgs: [], nonScratchOrgs: [] } };
      case "org create scratch":
        return { status: 0, result: { orgId: "00Dtest" } };
      case "org display --target-org":
        return {
          status: 0,
          result: { id: "00DVA00000Mtest", expirationDate: "2026-11-25" }
        };
      case "data query --target-org": {
        const soql = args[args.indexOf("--query") + 1];
        return soql.includes("FROM Site")
          ? { status: 0, result: { records: [{ GuestUserId: "005guest" }] } }
          : { status: 0, result: { records: [{ Username: "guest@x.test" }] } };
      }
      case "community publish --name":
        return {
          status: 0,
          result: { url: "https://x.my.site.com/portfolio" }
        };
      default:
        return { status: 0, result: {} };
    }
  };
  return { sf, calls };
}

function deps(stub, extra = {}) {
  return {
    sf: stub.sf,
    env: {},
    exists: () => false,
    tempDir: () => fs.mkdtempSync(path.join(os.tmpdir(), "sr-test-")),
    npmInstall: () => true,
    render: () => true,
    ...extra
  };
}

const quiet = () => {};

test("parseArgs reads alias and days", () => {
  const opts = parseArgs(["--alias", "r22-org", "--days", "14"]);
  assert.strictEqual(opts.alias, "r22-org");
  assert.strictEqual(opts.days, 14);
  assert.strictEqual(opts.devHub, "spap-portfolio");
});

test("parseArgs refuses a missing alias, a bad duration and unknown flags", () => {
  assert.throws(() => parseArgs([]), /--alias is required/);
  assert.throws(() => parseArgs(["--alias", "a", "--days", "0"]), /--days/);
  assert.throws(() => parseArgs(["--alias", "a", "--days", "31"]), /--days/);
  assert.throws(() => parseArgs(["--alias", "a", "--days", "x"]), /--days/);
  assert.throws(() => parseArgs(["--alias", "a", "--wat"]), /Unknown argument/);
});

test("parseArgs refuses the production aliases", () => {
  assert.throws(() => parseArgs(["--alias", "spap-portfolio"]), /production/);
  assert.throws(() => parseArgs(["--alias", "Portfolio"]), /production/);
});

test("main refuses a production alias before any sf call", () => {
  const stub = stubSf();
  assert.throws(
    () => main(["--alias", "spap-portfolio"], deps(stub), quiet),
    /production/
  );
  assert.strictEqual(stub.calls.length, 0);
});

test("main stops when the created org is the production org", () => {
  const stub = stubSf({
    "org display --target-org": () => ({
      status: 0,
      result: { id: PRODUCTION_ORG_ID }
    })
  });
  assert.throws(
    () => main(["--alias", "x-org"], deps(stub), quiet),
    (err) => err instanceof StepError && err.step === "create"
  );
  assert.ok(!stub.calls.some((c) => c[0] === "project"));
});

test("main runs the steps in order and prints the URL and Id", () => {
  const stub = stubSf();
  const lines = [];
  const result = main(
    ["--alias", "x-org", "--skip-mermaid"],
    deps(stub),
    (line) => lines.push(line)
  );
  assert.deepStrictEqual(result.steps, STEPS);
  assert.strictEqual(result.orgId, "00DVA00000Mtest");
  assert.strictEqual(result.siteUrl, "https://x.my.site.com/portfolio");
  assert.ok(lines.includes("org Id: 00DVA00000Mtest"));
  assert.ok(lines.includes("site URL: https://x.my.site.com/portfolio"));
  const order = stub.calls.map((c) => c.slice(0, 3).join(" "));
  const at = (prefix) => order.findIndex((c) => c.startsWith(prefix));
  assert.ok(at("limits") < at("org create"));
  assert.ok(at("org create") < at("project deploy"));
  assert.ok(at("project deploy") < at("org assign"));
  assert.ok(at("org assign") < at("data import"));
  assert.ok(at("data import") < at("community publish"));
  const imports = stub.calls.filter(
    (c) => c[0] === "data" && c[1] === "import"
  );
  assert.deepStrictEqual(
    imports.slice(0, 6).map((c) => c[c.indexOf("--plan") + 1]),
    [
      "data/site/plan.json",
      "data/home/plan.json",
      "data/delivery/plan.json",
      "data/pillars/plan-a.json",
      "data/pillars/plan-b.json",
      "data/footer/plan.json"
    ]
  );
});

test("every sf call names its org", () => {
  const stub = stubSf();
  main(["--alias", "x-org", "--skip-mermaid"], deps(stub), quiet);
  for (const call of stub.calls) {
    const key = call.slice(0, 3).join(" ");
    if (key === "org list") {
      continue;
    }
    assert.ok(
      call.includes("--target-org") || call.includes("--target-dev-hub"),
      `no org named in: ${call.join(" ")}`
    );
    assert.ok(
      !call.includes("spap-portfolio") ||
        call.includes("--target-dev-hub") ||
        key === "limits api display"
    );
  }
  const create = stub.calls.find((c) => c[2] === "scratch");
  assert.strictEqual(
    create[create.indexOf("--target-dev-hub") + 1],
    "spap-portfolio"
  );
  assert.strictEqual(create[create.indexOf("--duration-days") + 1], "14");
});

test("guest permission set goes on behalf of the guest user", () => {
  const stub = stubSf();
  main(["--alias", "x-org", "--skip-mermaid"], deps(stub), quiet);
  const guest = stub.calls.find((c) => c.includes("Portfolio_Guest"));
  assert.strictEqual(
    guest[guest.indexOf("--on-behalf-of") + 1],
    "guest@x.test"
  );
  const admin = stub.calls.find((c) => c.includes("Portfolio_Admin"));
  assert.ok(!admin.includes("--on-behalf-of"));
});

test("a failed step stops the run and names the step", () => {
  const stub = stubSf({
    "project deploy start": () => ({ status: 1, message: "boom" })
  });
  assert.throws(
    () => main(["--alias", "x-org"], deps(stub), quiet),
    (err) =>
      err instanceof StepError &&
      err.step === "deploy" &&
      /boom/.test(err.message)
  );
  assert.ok(!stub.calls.some((c) => c.includes("Portfolio_Admin")));
});

test("preflight stops when slots are short or the alias exists", () => {
  const short = stubSf({
    "limits api display": () => ({
      status: 0,
      result: [
        { name: "ActiveScratchOrgs", remaining: 1 },
        { name: "DailyScratchOrgs", remaining: 6 }
      ]
    })
  });
  assert.throws(
    () => main(["--alias", "x-org"], deps(short), quiet),
    /Not enough scratch org slots/
  );
  assert.ok(!short.calls.some((c) => c[1] === "create"));
  const taken = stubSf({
    "org list": () => ({
      status: 0,
      result: { scratchOrgs: [{ alias: "x-org" }], nonScratchOrgs: [] }
    })
  });
  assert.throws(
    () => main(["--alias", "x-org"], deps(taken), quiet),
    /already exists/
  );
});

test("a dry run makes no sf call", () => {
  const stub = stubSf();
  const result = main(["--alias", "x-org", "--dry-run"], deps(stub), quiet);
  assert.strictEqual(result.dryRun, true);
  assert.strictEqual(stub.calls.length, 0);
});

test("mermaid is skipped with a warning when no Chrome is found", () => {
  const stub = stubSf();
  const lines = [];
  main(["--alias", "x-org"], deps(stub), (l) => lines.push(l));
  assert.ok(lines.some((l) => l.startsWith("mermaid: skipped, no Chrome")));
  assert.ok(!stub.calls.some((c) => c.join(" ").includes("Mermaid_Diagrams")));
});

test("mermaid is drawn and deployed when Chrome and the tools exist", () => {
  const stub = stubSf();
  let rendered = null;
  main(
    ["--alias", "x-org"],
    deps(stub, {
      env: { CHROME_PATH: "/chrome", MERMAID_CLI_DIR: "/mmd" },
      exists: () => true,
      render: (dir, chrome) => {
        rendered = [dir, chrome];
        return true;
      }
    }),
    quiet
  );
  assert.deepStrictEqual(rendered, ["/mmd", "/chrome"]);
  const deploy = stub.calls.find((c) =>
    c.join(" ").includes("Mermaid_Diagrams")
  );
  assert.ok(deploy.includes("--target-org"));
  const order = stub.calls.map((c) => c[0]);
  assert.ok(order.lastIndexOf("project") < order.indexOf("community"));
});

test("splitContent cuts long text without whitespace at the cut and joins back", () => {
  const text = "word ".repeat(40000).trim();
  const parts = splitContent(text);
  assert.ok(parts.length > 1 && parts.length <= 8);
  assert.strictEqual(parts.join(""), text);
  for (const part of parts) {
    assert.ok(part.length <= 131072);
    assert.strictEqual(part, part.trim());
  }
});

test("buildDocsPlan writes one cache row per doc, with parts for a long one", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sr-docs-"));
  const meta = path.join(
    root,
    "packages/portfolio-site/main/default/customMetadata"
  );
  fs.mkdirSync(meta, { recursive: true });
  fs.mkdirSync(path.join(root, "docs"), { recursive: true });
  const record = (name, p) =>
    fs.writeFileSync(
      path.join(meta, `Source_File.${name}.md-meta.xml`),
      `<CustomMetadata><values><field>Source_Key__c</field><value xsi:type="xsd:string">docs</value></values><values><field>Path__c</field><value xsi:type="xsd:string">${p}</value></values></CustomMetadata>`
    );
  record("docs_short", "docs/short.md");
  record("docs_long", "docs/long.md");
  record("docs_missing", "docs/missing.md");
  record("other_thing", "docs/other.md");
  fs.writeFileSync(path.join(root, "docs/short.md"), "# Short\n\nBody\n");
  fs.writeFileSync(
    path.join(root, "docs/long.md"),
    "# Long\n\n" + "word ".repeat(40000)
  );
  assert.deepStrictEqual(docPaths(root), [
    "docs/long.md",
    "docs/missing.md",
    "docs/short.md"
  ]);
  const out = path.join(root, "out");
  const built = buildDocsPlan(out, root, new Date("2026-11-11T00:00:00Z"));
  assert.ok(built.count >= 3);
  const rows = JSON.parse(
    fs.readFileSync(path.join(out, "Source_Cache__c.json"), "utf8")
  ).records;
  assert.ok(rows.some((r) => r.Path__c === "docs/short.md"));
  assert.ok(rows.some((r) => r.Path__c === "docs/long.md#part-2"));
  assert.ok(!rows.some((r) => r.Path__c.includes("missing")));
  assert.ok(rows.every((r) => r.Last_Status__c === "200"));
  assert.strictEqual(buildDocsPlan(path.join(root, "o2"), os.tmpdir()), null);
});

test("siteBase turns the publish address into the path prefix live-smoke needs", () => {
  assert.strictEqual(
    siteBase("https://x.scratch.my.site.com/portfoliovforcesite"),
    "https://x.scratch.my.site.com/portfolio"
  );
  assert.strictEqual(
    siteBase("https://x.test/portfolio"),
    "https://x.test/portfolio"
  );
});
