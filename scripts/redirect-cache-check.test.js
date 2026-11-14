const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const {
  staticFileFor,
  createServer,
  judgeArrival,
  judgeAnalytics,
  startBlockingProxy,
  settingsMetadata,
  parseSfJson,
  median
} = require("./redirect-cache-check.js");

function makeDist() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rcc-dist-"));
  fs.mkdirSync(path.join(dir, "api-lab"));
  fs.writeFileSync(path.join(dir, "index.html"), "<p>home</p>");
  fs.writeFileSync(path.join(dir, "resume.html"), "<p>resume</p>");
  fs.writeFileSync(path.join(dir, "api-lab.html"), "<p>lab</p>");
  fs.writeFileSync(path.join(dir, "api-lab", "reference.html"), "<p>ref</p>");
  return dir;
}

function get(port, urlPath) {
  return new Promise((resolve, reject) => {
    http
      .get({ host: "127.0.0.1", port, path: urlPath }, (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () =>
          resolve({ status: res.statusCode, headers: res.headers, body })
        );
      })
      .on("error", reject);
  });
}

test("staticFileFor answers the way Pages does and refuses a path that escapes", () => {
  const dir = makeDist();
  assert.strictEqual(staticFileFor(dir, "/"), path.join(dir, "index.html"));
  assert.strictEqual(
    staticFileFor(dir, "/resume"),
    path.join(dir, "resume.html")
  );
  assert.strictEqual(
    staticFileFor(dir, "/resume/"),
    path.join(dir, "resume.html")
  );
  assert.strictEqual(
    staticFileFor(dir, "/api-lab"),
    path.join(dir, "api-lab.html")
  );
  assert.strictEqual(
    staticFileFor(dir, "/api-lab/reference"),
    path.join(dir, "api-lab", "reference.html")
  );
  assert.strictEqual(staticFileFor(dir, "/missing"), null);
  assert.strictEqual(staticFileFor(dir, "/../secret"), null);
  assert.strictEqual(staticFileFor(dir, "/%2e%2e/secret"), null);
  assert.strictEqual(staticFileFor(dir, "/bad%"), null);
});

test("old mode answers a cached 301 to the Salesforce site at the same path, static mode serves the build", async () => {
  const dir = makeDist();
  const local = createServer({
    distDir: dir,
    sfBase: "https://site.example.com/portfolio/"
  });
  await new Promise((resolve) => local.server.listen(0, "127.0.0.1", resolve));
  const { port } = local.server.address();
  try {
    const old = await get(port, "/resume?x=1");
    assert.strictEqual(old.status, 301);
    assert.strictEqual(
      old.headers.location,
      "https://site.example.com/portfolio/resume"
    );
    assert.strictEqual(old.headers["cache-control"], "max-age=31536000");
    assert.strictEqual(
      (await get(port, "/")).headers.location,
      "https://site.example.com/portfolio/"
    );

    local.setMode("static");
    const page = await get(port, "/resume?from=sf");
    assert.strictEqual(page.status, 200);
    assert.strictEqual(page.body, "<p>resume</p>");
    assert.strictEqual(page.headers["content-security-policy"], undefined);
    assert.strictEqual((await get(port, "/nope")).status, 404);

    assert.deepStrictEqual(
      local.hits.map((hit) => [hit.mode, hit.path, hit.search]),
      [
        ["old", "/resume", "?x=1"],
        ["old", "/", ""],
        ["static", "/resume", "?from=sf"],
        ["static", "/nope", ""]
      ]
    );
  } finally {
    await new Promise((resolve) => local.server.close(resolve));
  }
});

const GOOD = {
  sfBase: "https://site.example.com/portfolio",
  origin: "http://127.0.0.1:8822",
  path: "/resume",
  finalUrl: "http://127.0.0.1:8822/resume",
  hops: [
    "https://site.example.com/portfolio/resume",
    "http://127.0.0.1:8822/resume?from=sf",
    "http://127.0.0.1:8822/resume"
  ],
  plainHits: 0,
  arrivals: 1,
  gtagHref: "http://127.0.0.1:8822/resume"
};

test("judgeArrival passes a visitor who used the cached 301, was sent on once and arrived clean", () => {
  assert.deepStrictEqual(judgeArrival(GOOD), { pass: true, problems: [] });
});

test("judgeArrival fails when the 301 was not cached", () => {
  const verdict = judgeArrival({ ...GOOD, plainHits: 1, hops: [GOOD.hops[2]] });
  assert.strictEqual(verdict.pass, false);
  assert.match(verdict.problems.join("|"), /was not cached/);
  assert.match(
    verdict.problems.join("|"),
    /never went through the Salesforce site/
  );
});

test("judgeArrival fails on a loop back to the Salesforce site", () => {
  const verdict = judgeArrival({
    ...GOOD,
    hops: [
      ...GOOD.hops.slice(0, 2),
      "https://site.example.com/portfolio/resume",
      GOOD.hops[1]
    ]
  });
  assert.strictEqual(verdict.pass, false);
  assert.match(verdict.problems.join("|"), /came back to the Salesforce site/);
});

test("judgeArrival fails on a kept from=sf, a wrong path, no event and two events", () => {
  assert.match(
    judgeArrival({
      ...GOOD,
      finalUrl: "http://127.0.0.1:8822/resume?from=sf"
    }).problems.join("|"),
    /kept a query/
  );
  assert.match(
    judgeArrival({ ...GOOD, finalUrl: "http://127.0.0.1:8822/" }).problems.join(
      "|"
    ),
    /ended on/
  );
  assert.match(
    judgeArrival({ ...GOOD, arrivals: 0 }).problems.join("|"),
    /0 arrival events/
  );
  assert.match(
    judgeArrival({ ...GOOD, arrivals: 2 }).problems.join("|"),
    /2 arrival events/
  );
});

test("judgeAnalytics wants a clean address, one event and a tag that saw a clean address", () => {
  const good = {
    origin: GOOD.origin,
    path: GOOD.path,
    finalUrl: GOOD.finalUrl,
    arrivals: 1,
    gtagHref: GOOD.finalUrl
  };
  assert.deepStrictEqual(judgeAnalytics(good), { pass: true, problems: [] });
  assert.match(
    judgeAnalytics({
      ...good,
      gtagHref: GOOD.finalUrl + "?from=sf"
    }).problems.join("|"),
    /analytics tag saw/
  );
  assert.match(
    judgeAnalytics({ ...good, gtagHref: null }).problems.join("|"),
    /did not load/
  );
  assert.match(
    judgeAnalytics({ ...good, arrivals: 0 }).problems.join("|"),
    /0 arrival events/
  );
  assert.match(
    judgeAnalytics({
      ...good,
      finalUrl: GOOD.finalUrl + "?from=sf"
    }).problems.join("|"),
    /clean/
  );
});

test("the blocking proxy refuses analytics hosts and forwards other plain requests", async () => {
  const origin = http.createServer((req, res) => res.end("hello"));
  await new Promise((resolve) => origin.listen(0, "127.0.0.1", resolve));
  const proxy = await startBlockingProxy();
  try {
    const answer = await new Promise((resolve, reject) => {
      http
        .get(
          {
            host: "127.0.0.1",
            port: proxy.port,
            path: `http://127.0.0.1:${origin.address().port}/x`,
            headers: { host: "127.0.0.1" }
          },
          (res) => {
            let body = "";
            res.on("data", (chunk) => (body += chunk));
            res.on("end", () => resolve(body));
          }
        )
        .on("error", reject);
    });
    assert.strictEqual(answer, "hello");
    const status = await new Promise((resolve) => {
      const req = http.request({
        host: "127.0.0.1",
        port: proxy.port,
        method: "CONNECT",
        path: "www.googletagmanager.com:443"
      });
      req.on("connect", (res) => resolve(res.statusCode));
      req.end();
    });
    assert.strictEqual(status, 403);
    assert.deepStrictEqual(proxy.refused, ["www.googletagmanager.com"]);
  } finally {
    proxy.server.close();
    origin.close();
  }
});

test("settingsMetadata writes the three records and a package list", () => {
  const { files } = settingsMetadata({
    enabled: 1,
    target: "http://127.0.0.1:8822",
    host: "site.example.com"
  });
  assert.deepStrictEqual(Object.keys(files).sort(), [
    "customMetadata/Portfolio_Setting.Site_Redirect_Enabled.md",
    "customMetadata/Portfolio_Setting.Site_Redirect_Host.md",
    "customMetadata/Portfolio_Setting.Site_Redirect_Target.md",
    "package.xml"
  ]);
  assert.match(
    files["customMetadata/Portfolio_Setting.Site_Redirect_Enabled.md"],
    /xsd:double">1</
  );
  assert.match(
    files["customMetadata/Portfolio_Setting.Site_Redirect_Target.md"],
    />http:\/\/127\.0\.0\.1:8822</
  );
  assert.match(
    files["customMetadata/Portfolio_Setting.Site_Redirect_Host.md"],
    />site\.example\.com</
  );
  assert.match(files["package.xml"], /Portfolio_Setting\.Site_Redirect_Host/);
});

test("parseSfJson reads the body after warning lines and tolerates nothing", () => {
  assert.deepStrictEqual(
    parseSfJson('(node) warning\n{"status":0,"result":{"id":"x"}}'),
    { status: 0, result: { id: "x" } }
  );
  assert.strictEqual(parseSfJson(""), null);
  assert.strictEqual(parseSfJson("{broken"), null);
  assert.strictEqual(parseSfJson(undefined), null);
});

test("median handles odd, even and empty lists", () => {
  assert.strictEqual(median([3, 1, 2]), 2);
  assert.strictEqual(median([4, 1, 2, 3]), 3);
  assert.strictEqual(median([]), null);
});
