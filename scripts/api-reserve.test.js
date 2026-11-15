// Tests for scripts/api-reserve.js. Run: node --test scripts/api-reserve.test.js
// No network and no sf: the fetch and the sf runner are fakes.
const test = require("node:test");
const assert = require("node:assert");
const {
  EXIT,
  parseArgs,
  reserveCount,
  parseLimitInfo,
  decide,
  main
} = require("./api-reserve.js");

const TOKEN_ENV = {
  SF_ACCESS_TOKEN: "invented-token",
  SF_INSTANCE_URL: "https://example.my.salesforce.com/"
};

function restBody(remaining, { daily = 6, active = 2 } = {}) {
  return {
    DailyApiRequests: { Max: 15000, Remaining: remaining },
    DailyScratchOrgs: { Max: 6, Remaining: daily },
    ActiveScratchOrgs: { Max: 3, Remaining: active }
  };
}

function fakeFetch(status, body, headers = {}) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init });
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: { get: (name) => headers[name.toLowerCase()] ?? null },
      text: async () => (typeof body === "string" ? body : JSON.stringify(body))
    };
  };
  fetch.calls = calls;
  return fetch;
}

function cliRows(remaining, { daily = 6, active = 2 } = {}) {
  return [
    { name: "ActiveScratchOrgs", max: 3, remaining: active },
    { name: "DailyApiRequests", max: 15000, remaining },
    { name: "DailyScratchOrgs", max: 6, remaining: daily }
  ];
}

function harness(extra = {}) {
  const lines = [];
  const outputs = [];
  return {
    lines,
    outputs,
    deps: {
      log: (line) => lines.push(line),
      appendFile: (file, text) => outputs.push({ file, text }),
      ...extra
    }
  };
}

test("parseArgs reads every option and refuses unknown ones", () => {
  const options = parseArgs([
    "--target-org",
    "spap-portfolio",
    "--reserve",
    "0.5",
    "--need-scratch-org",
    "--label",
    "PR build"
  ]);
  assert.strictEqual(options.targetOrg, "spap-portfolio");
  assert.strictEqual(options.reserve, 0.5);
  assert.strictEqual(options.needScratchOrg, true);
  assert.strictEqual(options.label, "PR build");
  assert.strictEqual(parseArgs([]).reserve, 0.4);
  assert.throws(() => parseArgs(["--bogus"]), /Unknown argument/);
  assert.throws(() => parseArgs(["--reserve"]), /needs a value/);
  assert.throws(() => parseArgs(["--reserve", "-1"]), /share/);
  assert.throws(() => parseArgs(["--reserve", "2.5"]), /whole number/);
  assert.throws(() => parseArgs(["--api-version", "62"]), /62.0/);
});

test("reserveCount rounds a share up and keeps a count", () => {
  assert.strictEqual(reserveCount(0.4, 15000), 6000);
  assert.strictEqual(reserveCount(0.4, 15001), 6001);
  assert.strictEqual(reserveCount(5000, 15000), 5000);
});

test("parseLimitInfo reads the header and ignores anything else", () => {
  assert.deepStrictEqual(parseLimitInfo("api-usage=3/15000"), {
    used: 3,
    max: 15000
  });
  assert.deepStrictEqual(
    parseLimitInfo("api-usage=18/15000; per-app-api-usage=17/250(appName=x)"),
    {
      used: 18,
      max: 15000
    }
  );
  assert.strictEqual(parseLimitInfo(null), null);
  assert.strictEqual(parseLimitInfo("nothing"), null);
});

test("decide says OK, reached, and treats the reserve boundary as OK", () => {
  const ok = decide({ api: { max: 15000, remaining: 9123 } }, { reserve: 0.4 });
  assert.strictEqual(ok.code, EXIT.OK);
  assert.strictEqual(
    ok.line,
    "API reserve OK: 9123 of 15000 left, reserve 6000."
  );
  const edge = decide(
    { api: { max: 15000, remaining: 6000 } },
    { reserve: 0.4 }
  );
  assert.strictEqual(edge.code, EXIT.OK);
  const reached = decide(
    { api: { max: 15000, remaining: 5999 } },
    { reserve: 0.4 }
  );
  assert.strictEqual(reached.code, EXIT.RESERVE);
  assert.match(
    reached.line,
    /^API reserve reached: 5999 of 15000 left, reserve 6000\..*The public site keeps the rest\.$/
  );
  const missing = decide({ api: null }, { reserve: 0.4 });
  assert.strictEqual(missing.code, EXIT.READ_FAILED);
});

test("decide checks scratch orgs only when asked", () => {
  const none = {
    api: { max: 15000, remaining: 14000 },
    dailyScratch: { max: 6, remaining: 0 },
    activeScratch: { max: 3, remaining: 2 }
  };
  assert.strictEqual(decide(none, { reserve: 0.4 }).code, EXIT.OK);
  const asked = decide(none, { reserve: 0.4, needScratchOrg: true });
  assert.strictEqual(asked.code, EXIT.RESERVE);
  assert.strictEqual(asked.reason, "scratch");
  assert.match(asked.line, /0 of 6 daily and 2 of 3 active/);
  const full = decide(
    {
      ...none,
      activeScratch: { max: 3, remaining: 0 },
      dailyScratch: { max: 6, remaining: 4 }
    },
    { reserve: 0.4, needScratchOrg: true }
  );
  assert.strictEqual(full.code, EXIT.RESERVE);
  const free = decide(
    { ...none, dailyScratch: { max: 6, remaining: 4 } },
    { reserve: 0.4, needScratchOrg: true }
  );
  assert.strictEqual(free.code, EXIT.OK);
  assert.match(free.line, /Scratch orgs left: 4 daily, 2 active\.$/);
});

test("token mode reads the REST limits resource once and writes the outputs", async () => {
  const fetch = fakeFetch(200, restBody(9123), {
    "sforce-limit-info": "api-usage=5877/15000"
  });
  const h = harness({
    fetch,
    env: { ...TOKEN_ENV, GITHUB_OUTPUT: "out.txt" }
  });
  const code = await main([], h.deps);
  assert.strictEqual(code, EXIT.OK);
  assert.strictEqual(fetch.calls.length, 1);
  assert.strictEqual(
    fetch.calls[0].url,
    "https://example.my.salesforce.com/services/data/v62.0/limits"
  );
  assert.strictEqual(
    fetch.calls[0].init.headers.Authorization,
    "Bearer invented-token"
  );
  assert.deepStrictEqual(h.lines, [
    "API reserve OK: 9123 of 15000 left, reserve 6000."
  ]);
  assert.deepStrictEqual(h.outputs, [
    {
      file: "out.txt",
      text: "ok=true\nreason=ok\nremaining=9123\nmax=15000\nreserve=6000\n"
    }
  ]);
});

test("token mode stops on the reserve with exit 2 and ok=false", async () => {
  const h = harness({
    fetch: fakeFetch(200, restBody(4000)),
    env: { ...TOKEN_ENV, GITHUB_OUTPUT: "out.txt" }
  });
  const code = await main(["--label", "Smoke"], h.deps);
  assert.strictEqual(code, EXIT.RESERVE);
  assert.match(
    h.lines[0],
    /^Smoke: API reserve reached: 4000 of 15000 left, reserve 6000\./
  );
  assert.match(h.outputs[0].text, /^ok=false\nreason=reserve\n/);
});

test("a refusal for the spent cap counts as reached, not as a read failure", async () => {
  const refused = [
    {
      message: "TotalRequests Limit exceeded.",
      errorCode: "REQUEST_LIMIT_EXCEEDED"
    }
  ];
  const h = harness({ fetch: fakeFetch(403, refused), env: TOKEN_ENV });
  assert.strictEqual(await main([], h.deps), EXIT.RESERVE);
  assert.match(h.lines[0], /daily API cap is spent/);
});

test("other read failures exit 3 and never print the token", async () => {
  const cases = [
    fakeFetch(401, [
      { message: "Session expired", errorCode: "INVALID_SESSION_ID" }
    ]),
    fakeFetch(200, "not json"),
    async () => {
      throw new Error("getaddrinfo ENOTFOUND");
    }
  ];
  for (const fetch of cases) {
    const h = harness({ fetch, env: { ...TOKEN_ENV, GITHUB_OUTPUT: "o" } });
    assert.strictEqual(await main([], h.deps), EXIT.READ_FAILED);
    assert.match(h.lines[0], /^API reserve not checked: /);
    assert.doesNotMatch(h.lines.join("\n"), /invented-token/);
    assert.match(h.outputs[0].text, /^ok=false\nreason=read-failed\n$/);
  }
});

test("alias mode calls sf org list limits with the alias and trusts the JSON, not the exit code", async () => {
  const calls = [];
  const run = (file, args) => {
    calls.push([file, ...args]);
    return {
      status: 1,
      stdout: `Warning: something\n${JSON.stringify({ status: 0, result: cliRows(12000, { daily: 3 }) })}`,
      stderr: ""
    };
  };
  const h = harness({ run, env: {} });
  const code = await main(
    ["--target-org", "spap-portfolio", "--need-scratch-org"],
    h.deps
  );
  assert.strictEqual(code, EXIT.OK);
  assert.deepStrictEqual(calls, [
    ["sf", "org", "list", "limits", "--target-org", "spap-portfolio", "--json"]
  ]);
  assert.match(
    h.lines[0],
    /^API reserve OK: 12000 of 15000 left, reserve 6000\. Scratch orgs left: 3 daily, 2 active\.$/
  );
});

test("alias mode maps an sf limit refusal to reached and other errors to a read failure", async () => {
  const refuse = () => ({
    status: 1,
    stdout: JSON.stringify({
      status: 1,
      name: "REQUEST_LIMIT_EXCEEDED",
      message: "TotalRequests Limit exceeded."
    })
  });
  const h1 = harness({ run: refuse, env: {} });
  assert.strictEqual(await main(["--target-org", "x"], h1.deps), EXIT.RESERVE);
  const broken = () => ({
    status: 1,
    stdout: "",
    stderr: "sf: command not found"
  });
  const h2 = harness({ run: broken, env: {} });
  assert.strictEqual(
    await main(["--target-org", "x"], h2.deps),
    EXIT.READ_FAILED
  );
  const noAuth = () => ({
    status: 1,
    stdout: JSON.stringify({
      status: 1,
      name: "NoOrgFound",
      message: "No authorization found"
    })
  });
  const h3 = harness({ run: noAuth, env: {} });
  assert.strictEqual(
    await main(["--target-org", "x"], h3.deps),
    EXIT.READ_FAILED
  );
  assert.match(h3.lines[0], /No authorization found/);
});

test("no org and no token, or a bad argument, exits 4 without a read", async () => {
  const h = harness({ env: {}, fetch: () => assert.fail("no fetch expected") });
  assert.strictEqual(await main([], h.deps), EXIT.USAGE);
  assert.match(h.lines[0], /give --target-org/);
  const h2 = harness({ env: TOKEN_ENV });
  assert.strictEqual(await main(["--reserve", "lots"], h2.deps), EXIT.USAGE);
  assert.deepStrictEqual(h2.outputs, []);
});
