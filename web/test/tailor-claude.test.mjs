import { test } from "node:test";
import assert from "node:assert/strict";
import {
  claudeProvider,
  createProvider,
  MissingKeyError,
  PROVIDER_NAMES
} from "../tailor-eval/lib/providers.mjs";
import { classifyRoute, policyProblems } from "../tailor-eval/lib/router.mjs";

const ENV = { TAILOR_EVAL_CLAUDE_KEY: "test-key-not-real" };

function reply(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function message(overrides = {}) {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "claude-opus-5-5",
    content: [
      { type: "thinking", thinking: "", signature: "sig" },
      { type: "text", text: "Hello " },
      { type: "text", text: "there" }
    ],
    stop_reason: "end_turn",
    usage: {
      input_tokens: 120,
      cache_read_input_tokens: 30,
      output_tokens: 45
    },
    ...overrides
  };
}

function recorder(response) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({
      url: String(url),
      body: JSON.parse(init.body),
      headers: new Headers(init.headers)
    });
    return typeof response === "function" ? response() : response;
  };
  return { calls, fetch };
}

test("claude is a known provider and needs its key", () => {
  assert.ok(PROVIDER_NAMES.includes("claude"));
  assert.throws(() => createProvider("claude", { env: {} }), MissingKeyError);
});

test("claude sends the system prompt, effort and fallbacks, and no sampling settings", async () => {
  const { calls, fetch } = recorder(() => reply(message()));
  const provider = claudeProvider({ env: ENV, fetch });
  const answer = await provider.complete({
    kind: "selector",
    system: "SYSTEM",
    user: "USER"
  });
  assert.equal(answer.text, "Hello there");
  assert.deepEqual(answer.usage, { inputTokens: 150, outputTokens: 45 });
  assert.equal(calls.length, 1);
  const { url, body, headers } = calls[0];
  assert.match(url, /\/v1\/messages/);
  assert.equal(body.model, "claude-opus-5-5");
  assert.equal(body.system, "SYSTEM");
  assert.deepEqual(body.messages, [{ role: "user", content: "USER" }]);
  assert.deepEqual(body.output_config, { effort: "medium" });
  assert.equal(body.fallbacks, "default");
  assert.equal(body.temperature, undefined);
  assert.equal(body.thinking, undefined);
  assert.match(
    headers.get("anthropic-beta") || "",
    /server-side-fallback-2026-07-01/
  );
  assert.equal(
    headers.get("authorization"),
    `Bearer ${ENV.TAILOR_EVAL_CLAUDE_KEY}`
  );
});

test("claude reads the model and effort from the environment", async () => {
  const { calls, fetch } = recorder(() => reply(message()));
  const env = {
    ...ENV,
    TAILOR_EVAL_CLAUDE_MODEL: "claude-sonnet-5-5",
    TAILOR_EVAL_CLAUDE_EFFORT: "low"
  };
  const provider = claudeProvider({ env, fetch });
  assert.equal(provider.model, "claude-sonnet-5-5");
  await provider.complete({ kind: "letter", system: "s", user: "u" });
  assert.equal(calls[0].body.model, "claude-sonnet-5-5");
  assert.deepEqual(calls[0].body.output_config, { effort: "low" });
});

test("a 429 reaches the router as a quota refusal, a 529 as an outage, without retries", async () => {
  for (const [status, outcome] of [
    [429, "quota"],
    [529, "outage"]
  ]) {
    const { calls, fetch } = recorder(() =>
      reply(
        { type: "error", error: { type: "x", message: "try later" } },
        status
      )
    );
    const provider = claudeProvider({ env: ENV, fetch });
    const thrown = await provider
      .complete({ kind: "selector", system: "s", user: "u" })
      .catch((error) => error);
    assert.equal(thrown.status, status);
    assert.equal(calls.length, 1, "the SDK does not retry, the router decides");
    const verdict = classifyRoute({ error: { code: "CALL_FAILED" } }, thrown);
    assert.equal(verdict.outcome, outcome);
  }
});

test("a refusal is thrown so the router falls through", async () => {
  const { fetch } = recorder(() =>
    reply(message({ stop_reason: "refusal", content: [] }))
  );
  const provider = claudeProvider({ env: ENV, fetch });
  const thrown = await provider
    .complete({ kind: "letter", system: "s", user: "u" })
    .catch((error) => error);
  assert.equal(thrown.code, "REFUSAL");
  assert.equal(
    classifyRoute({ error: { code: "CALL_FAILED" } }, thrown).outcome,
    "refused"
  );
});

test("the public policy refuses a paid route (E19)", () => {
  const problems = policyProblems("public", { routes: ["claude", "template"] });
  assert.ok(
    problems.some((problem) => problem.includes("never serves the public site"))
  );
  assert.deepEqual(
    policyProblems("owner", { routes: ["claude", "template"] }),
    []
  );
});
