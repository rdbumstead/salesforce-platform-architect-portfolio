const test = require("node:test");
const assert = require("node:assert");
const { shouldStripUpgrade, stripUpgradeHeaders } = require("./live-smoke.js");

test("strips only for a local http base with the option on", () => {
  const base = "http://localhost:8813";
  assert.strictEqual(shouldStripUpgrade(base + "/docs", base, true), true);
  assert.strictEqual(shouldStripUpgrade(base + "/docs", base, false), false);
});

test("never strips for an https base or a remote host", () => {
  assert.strictEqual(
    shouldStripUpgrade(
      "https://localhost:8813/",
      "https://localhost:8813",
      true
    ),
    false
  );
  assert.strictEqual(
    shouldStripUpgrade("http://example.com/", "http://example.com", true),
    false
  );
  assert.strictEqual(
    shouldStripUpgrade("http://example.com/", "http://localhost:8813", true),
    false
  );
  assert.strictEqual(shouldStripUpgrade("http://localhost/", "", true), false);
});

test("removes upgrade-insecure-requests and keeps the other directives", () => {
  const out = stripUpgradeHeaders({
    "content-type": "text/html",
    "content-security-policy":
      "default-src 'self'; upgrade-insecure-requests; img-src 'self' data:"
  });
  assert.strictEqual(
    out["content-security-policy"],
    "default-src 'self'; img-src 'self' data:"
  );
  assert.strictEqual(out["content-type"], "text/html");
});
