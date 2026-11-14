import test from "node:test";
import assert from "node:assert/strict";
import { runOne } from "../tailor-eval/lib/pipeline.mjs";
import {
  createProvider,
  fakeProvider,
  geminiProvider,
  workersAiProvider
} from "../tailor-eval/lib/providers.mjs";
import {
  classifyRoute,
  createRouter,
  loadPolicy,
  OUTCOMES,
  PolicyError,
  resolvePolicy
} from "../tailor-eval/lib/router.mjs";
import { loadValidators } from "../tailor-eval/lib/validators.mjs";
import {
  loadInputs,
  parseArgs,
  pickPostings,
  runEval
} from "../tailor-eval/run-eval.mjs";
import { scoreRuns } from "../tailor-eval/score.mjs";

const { snapshot, categories, postings, prices } = await loadInputs({
  includePrivate: false
});
const REAL = await loadValidators();
const BLOCKLIST = REAL.parseBlocklist("zzinventedclient").terms;
const posting = postings.find((entry) => entry.id === "posting-1-engineer");

/** Invented values only. None of them is a real key. */
const CF_ENV = {
  TAILOR_EVAL_CF_ACCOUNT_ID: "invented-account",
  TAILOR_EVAL_CF_TOKEN: "invented-token-value"
};
const GEMINI_ENV = { TAILOR_EVAL_GEMINI_KEY: "invented-gemini-value" };

/** A policy from a routes list, with no budget pressure unless a test asks for it. */
function policy(routes, extra = {}) {
  return resolvePolicy({ policies: { test: { routes, ...extra } } }, "test");
}

/** A fetch that answers every call with the same status and body. */
function answering(status, body = { error: { message: `status ${status}` } }) {
  const calls = [];
  const impl = async (url) => {
    calls.push(url);
    return Response.json(body, { status });
  };
  impl.calls = calls;
  return impl;
}

function run(router, overrides = {}) {
  return router.run({
    posting,
    snapshot,
    mode: "owner",
    validators: REAL,
    blocklist: BLOCKLIST,
    categories,
    ...overrides
  });
}

const steps = (record) =>
  record.route.trace.map((step) => `${step.route} ${step.outcome}`);

/* ---------- falling through ---------- */

test("an HTTP 500 is an outage and the next route answers", async () => {
  const fetch = answering(500);
  const router = createRouter(policy(["workers-ai", "fake", "template"]), {
    env: CF_ENV,
    fetch
  });
  const record = await run(router);
  assert.deepEqual(steps(record), ["workers-ai outage", "fake answered"]);
  assert.equal(record.route.trace[0].reason, "http-500");
  assert.equal(record.route.answeredBy, "fake");
  assert.equal(record.provider, "router:test");
  assert.equal(record.model, "fake");
  assert.equal(record.letter.finalOk, true);
  assert.equal(
    fetch.calls.length,
    1,
    "an outage is not retried on the same route"
  );
});

test("an HTTP 429 and a quota message are quota refusals and fall through", async () => {
  const gemini = createRouter(policy(["gemini", "fake", "template"]), {
    env: GEMINI_ENV,
    fetch: answering(429, { error: { message: "Resource has been exhausted" } })
  });
  const first = await run(gemini);
  assert.deepEqual(steps(first), ["gemini quota", "fake answered"]);
  assert.equal(first.route.trace[0].reason, "http-429");

  const workers = createRouter(policy(["workers-ai", "fake", "template"]), {
    env: CF_ENV,
    fetch: answering(200, {
      success: false,
      errors: [{ message: "daily quota exceeded" }]
    })
  });
  const second = await run(workers);
  assert.deepEqual(steps(second), ["workers-ai quota", "fake answered"]);
  assert.equal(second.route.trace[0].reason, "quota-message");
});

test("a thrown network error is an outage and falls through", async () => {
  const router = createRouter(policy(["workers-ai", "fake", "template"]), {
    env: CF_ENV,
    fetch: async () => {
      throw new TypeError("fetch failed");
    }
  });
  const record = await run(router);
  assert.deepEqual(steps(record), ["workers-ai outage", "fake answered"]);
  assert.equal(record.route.trace[0].reason, "network");
});

test("a route that runs past its timeout is an outage and falls through", async () => {
  const stuck = {
    name: "gemini",
    model: "stuck",
    complete: ({ signal }) =>
      new Promise((resolve, reject) =>
        signal.addEventListener("abort", () => reject(new Error("aborted")))
      )
  };
  const router = createRouter(
    policy(["gemini", "fake", "template"], { routeTimeoutMs: 30 }),
    { build: (name) => (name === "gemini" ? stuck : createProvider(name)) }
  );
  const record = await run(router);
  assert.deepEqual(steps(record), ["gemini outage", "fake answered"]);
  assert.equal(record.route.trace[0].reason, "timeout");
  assert.ok(record.route.trace[0].waitMs >= 20);
});

test("a selector or letter that fails its validators after the retry falls through", async () => {
  const badSelector = {
    ...fakeProvider({
      script: ({ kind }) => (kind === "selector" ? "not json" : undefined)
    }),
    name: "gemini"
  };
  const selectorRouter = createRouter(policy(["gemini", "fake", "template"]), {
    build: (name) => (name === "gemini" ? badSelector : createProvider(name))
  });
  const first = await run(selectorRouter);
  assert.deepEqual(steps(first), ["gemini validator", "fake answered"]);
  assert.equal(first.route.trace[0].reason, "selector");
  assert.ok(first.route.trace[0].codes.includes("selection.json"));
  assert.equal(first.fellThrough.length, 1);
  assert.equal(
    first.fellThrough[0].selector.attempts.length,
    2,
    "the one retry ran first"
  );

  const badLetter = {
    ...fakeProvider({
      script: ({ kind }) => (kind === "letter" ? "Too short." : undefined)
    }),
    name: "workers-ai"
  };
  const letterRouter = createRouter(
    policy(["workers-ai", "fake", "template"]),
    {
      build: (name) =>
        name === "workers-ai" ? badLetter : createProvider(name)
    }
  );
  const second = await run(letterRouter);
  assert.deepEqual(steps(second), ["workers-ai validator", "fake answered"]);
  assert.equal(second.route.trace[0].reason, "letter");
  assert.ok(
    second.route.trace[0].codes.every((code) =>
      /^(letter|grounding)\./.test(code)
    )
  );
});

test("a missing key is skipped, never thrown, and the template answers", async () => {
  const router = createRouter(loadPolicy("public"), { env: {} });
  const record = await run(router);
  assert.deepEqual(steps(record), [
    "workers-ai missing-key",
    "gemini missing-key",
    "template answered"
  ]);
  assert.deepEqual(record.route.trace[0].missing, [
    "TAILOR_EVAL_CF_ACCOUNT_ID",
    "TAILOR_EVAL_CF_TOKEN"
  ]);
  assert.equal(record.route.answeredBy, "template");
  assert.equal(record.model, "local-template");
});

test("when every model route fails the run ends at the template", async () => {
  const router = createRouter(loadPolicy("public"), {
    build: (name) =>
      name === "workers-ai"
        ? workersAiProvider({ env: CF_ENV, fetch: answering(503) })
        : geminiProvider({ env: GEMINI_ENV, fetch: answering(429) })
  });
  const record = await run(router);
  assert.deepEqual(steps(record), [
    "workers-ai outage",
    "gemini quota",
    "template answered"
  ]);
  assert.equal(record.route.answeredBy, "template");
  assert.equal(record.fellThrough.length, 2);
  assert.equal(record.letter.finalOk, true);
});

/* ---------- the trace ---------- */

test("the trace holds no posting text, no letter text, no key and no provider message", async () => {
  const echo = `echo ${posting.text.slice(0, 120)}`;
  const router = createRouter(policy(["workers-ai", "fake", "template"]), {
    env: CF_ENV,
    fetch: answering(500, { error: { message: echo } })
  });
  const record = await run(router);
  const trace = JSON.stringify(record.route);
  const words = posting.text.split(/\s+/).filter(Boolean);
  for (let i = 0; i + 5 <= words.length; i += 1)
    assert.ok(
      !trace.includes(words.slice(i, i + 5).join(" ")),
      "posting text in the trace"
    );
  assert.ok(!trace.includes(posting.company), "company in the trace");
  assert.ok(
    !trace.includes(record.letter.text.slice(0, 40)),
    "letter text in the trace"
  );
  for (const value of Object.values(CF_ENV))
    assert.ok(!trace.includes(value), "a key in the trace");
  assert.ok(!trace.includes("echo"), "a provider message in the trace");
  for (const step of record.route.trace)
    assert.deepEqual(
      Object.keys(step).filter(
        (key) =>
          ![
            "route",
            "model",
            "outcome",
            "reason",
            "codes",
            "waitMs",
            "missing",
            "remainingMs"
          ].includes(key)
      ),
      []
    );
});

/* ---------- the wait budget ---------- */

test("a route is not started when the budget left is below the floor", async () => {
  let clock = 0;
  const now = () => clock;
  const slowFailure = {
    name: "workers-ai",
    model: "slow",
    async complete() {
      clock += 100000;
      throw Object.assign(new Error("Provider call failed: HTTP 502"), {
        status: 502
      });
    }
  };
  let fakeCalls = 0;
  const counted = {
    name: "fake",
    model: "fake",
    async complete() {
      fakeCalls += 1;
      throw new Error("should not run");
    }
  };
  const router = createRouter(
    policy(["workers-ai", "fake", "template"], {
      budgetMs: 115000,
      floorMs: 20000
    }),
    { build: (name) => (name === "workers-ai" ? slowFailure : counted) }
  );
  const record = await run(router, { now });
  assert.deepEqual(steps(record), [
    "workers-ai outage",
    "fake budget",
    "template answered"
  ]);
  assert.equal(record.route.trace[1].remainingMs, 15000);
  assert.equal(fakeCalls, 0);
  assert.equal(record.waitMs.total, 100000);
});

/* ---------- stop codes and classification ---------- */

test("a stop code ends the run instead of falling through", async () => {
  const bad = {
    ...fakeProvider({
      script: ({ kind }) => (kind === "selector" ? "not json" : undefined)
    }),
    name: "gemini"
  };
  const router = createRouter(
    policy(["gemini", "fake", "template"], { stopCodes: ["selection.json"] }),
    { build: (name) => (name === "gemini" ? bad : createProvider(name)) }
  );
  const record = await run(router);
  assert.deepEqual(steps(record), ["gemini stopped"]);
  assert.equal(record.route.answeredBy, null);
});

test("classifyRoute names each outcome class", () => {
  const ok = {
    error: null,
    selector: { finalOk: true },
    letter: { finalOk: true }
  };
  const failed = { error: { code: "CALL_FAILED", codes: [] } };
  assert.equal(classifyRoute(ok).outcome, OUTCOMES.answered);
  assert.equal(classifyRoute(failed, { status: 503 }).outcome, OUTCOMES.outage);
  assert.equal(classifyRoute(failed, { status: 429 }).outcome, OUTCOMES.quota);
  assert.equal(
    classifyRoute(failed, new Error("rate limit reached")).outcome,
    OUTCOMES.quota
  );
  assert.equal(
    classifyRoute(failed, new TypeError("fetch failed")).outcome,
    OUTCOMES.outage
  );
  assert.equal(
    classifyRoute(failed, { status: 401 }).outcome,
    OUTCOMES.refused
  );
  assert.equal(classifyRoute({ error: { code: "TIMEOUT" } }).reason, "timeout");
});

/* ---------- policies ---------- */

test("the committed policies load, and public starts with Workers AI", () => {
  assert.deepEqual(loadPolicy("public").routes, [
    "workers-ai",
    "gemini",
    "template"
  ]);
  assert.equal(loadPolicy("owner").routes.at(-1), "template");
});

test("a policy that cannot be used is refused with a plain message", () => {
  const refused = (routes, pattern, extra = {}) =>
    assert.throws(
      () => policy(routes, extra),
      (error) => error instanceof PolicyError && pattern.test(error.message)
    );
  refused([], /empty route list/);
  refused(["openai", "template"], /unknown provider "openai"/);
  refused(["agentforce", "template"], /agentforce, which has no adapter/);
  refused(["gemini"], /must end with "template"/);
  refused(["template", "gemini", "template"], /more than once/);
  refused(["gemini", "template"], /floorMs/, { floorMs: -1 });
  assert.throws(
    () => resolvePolicy({ policies: {} }, "public"),
    /no policy named "public"/
  );
  assert.throws(() => resolvePolicy({}, "public"), /no "policies" object/);
  assert.throws(() => loadPolicy("nobody"), /no policy named "nobody"/);
});

/* ---------- the harness ---------- */

test("--router runs a policy end to end, and the scorer counts which route answered", async () => {
  assert.deepEqual(parseArgs(["--router", "public"]).providers, []);
  assert.deepEqual(
    parseArgs(["--router", "public", "--providers", "fake"]).providers,
    ["fake"]
  );
  assert.equal(parseArgs(["--router=owner"]).router, "owner");
  assert.equal(parseArgs([]).router, null);

  const router = createRouter(loadPolicy("public"), { env: {} });
  const records = await runEval({
    providers: [fakeProvider(), router],
    postings: pickPostings(postings, "synthetic"),
    snapshot,
    modes: ["owner", "visitor"],
    repeats: 1,
    validators: REAL,
    blocklist: BLOCKLIST,
    categories
  });
  const routed = records.filter((record) => record.route);
  assert.equal(routed.length, 8);
  assert.ok(
    routed.every(
      (record) => record.route.answeredBy === "template" && !record.error
    )
  );
  const { groups } = scoreRuns(records, {
    snapshot,
    postings,
    categories,
    prices,
    blocklist: BLOCKLIST
  });
  const both = groups.find((group) => group.group === "router:public both");
  assert.deepEqual(both.routeAnswers, ["template: 8"]);
  assert.deepEqual(both.routeOutcomes, [
    "workers-ai missing-key: 8",
    "gemini missing-key: 8",
    "template answered: 8"
  ]);
  assert.deepEqual(
    groups.find((group) => group.group === "fake both").routeAnswers,
    []
  );
});

test("the router leaves runOne records unchanged for plain providers", async () => {
  const record = await runOne({
    provider: fakeProvider(),
    posting,
    snapshot,
    mode: "owner",
    validators: REAL,
    blocklist: BLOCKLIST,
    categories
  });
  assert.equal(record.route, undefined);
  assert.equal(record.provider, "fake");
});
