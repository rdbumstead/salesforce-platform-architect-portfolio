/**
 * The provider router, the first layer of the tailoring pipeline. A request goes to the first
 * route in a policy and falls to the next on an outage, a quota refusal, a validator failure or
 * a missing key, and it always ends at the local template.
 *
 * Why it wraps a whole run and not one call: a validator failure is only known after the
 * validators have read the answer, and runOne already spends its one retry on the selector and
 * its one regeneration on the letter. So the router runs runOne for a route, reads the record,
 * and only then decides whether to fall through. A router that sat behind the provider
 * interface would see each call on its own and could not fall through on a letter that fails
 * after its retry. The router still takes providers that have the usual shape
 * { name, model, complete({ kind, system, user, context, signal }) }.
 *
 * The local template: the site's last step is LocalTemplateService, an Apex class that reads
 * the org. Its letter is ported to functions/_lib/tailor/template.js, which takes the snapshot
 * instead of the org. templateProvider() below wraps that port in the provider shape and is
 * the default template route. A test can still pass its own template as an option.
 *
 * Policies are config in routes.json, never code. Each one lists its routes in order and ends
 * with "template". Agentforce is a possible route later, but it needs the org, so it has no
 * adapter here and a policy that names it is refused on load.
 *
 * The trace on each record says which route answered and why the earlier ones were skipped:
 * the route, its outcome class, a short reason, its wait and its validator codes. It never
 * holds posting text, letter text, a key or a provider's error message.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildTemplateLetter } from "../../functions/_lib/tailor/template.js";
import { buildFakeSelection } from "./fake.mjs";
import { runOne, WAIT_LIMIT_MS } from "./pipeline.mjs";
import {
  createProvider,
  MissingKeyError,
  PROVIDER_NAMES
} from "./providers.mjs";

export const ROUTES_FILE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "routes.json"
);

export const TEMPLATE_ROUTE = "template";

/** The outcome classes a route can end in. */
export const OUTCOMES = {
  answered: "answered",
  missingKey: "missing-key",
  outage: "outage",
  quota: "quota",
  validator: "validator",
  refused: "refused",
  budget: "budget",
  stopped: "stopped"
};

const QUOTA_MESSAGE =
  /quota|rate limit|rate-limit|too many requests|resource has been exhausted|resource_exhausted/i;
const NETWORK_MESSAGE =
  /fetch failed|network|ECONNRESET|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|socket/i;

/* ---------- policies ---------- */

/** Thrown when a policy file or a policy in it cannot be used. The message names each problem. */
export class PolicyError extends Error {
  constructor(problems) {
    super(`The routing policy cannot be used:\n- ${problems.join("\n- ")}`);
    this.name = "PolicyError";
    this.problems = problems;
  }
}

const isWholeMs = (value) => Number.isInteger(value) && value >= 0;

/** Every problem with one named policy, in plain words. An empty list means it is usable. */
export function policyProblems(name, policy) {
  const problems = [];
  if (!policy || typeof policy !== "object" || Array.isArray(policy))
    return [`Policy "${name}" must be an object.`];
  const routes = policy.routes;
  if (!Array.isArray(routes) || routes.length === 0) {
    problems.push(
      `Policy "${name}" has an empty route list. List at least "template".`
    );
    return problems;
  }
  const known = new Set([...PROVIDER_NAMES, TEMPLATE_ROUTE]);
  routes.forEach((route, index) => {
    if (route === "agentforce")
      problems.push(
        `Policy "${name}" names agentforce, which has no adapter in the evaluation yet because it needs the org.`
      );
    else if (!known.has(route))
      problems.push(
        `Policy "${name}" names an unknown provider "${route}". Known: ${[...known].join(", ")}.`
      );
    if (routes.indexOf(route) !== index)
      problems.push(`Policy "${name}" lists "${route}" more than once.`);
  });
  if (routes.at(-1) !== TEMPLATE_ROUTE)
    problems.push(`Policy "${name}" must end with "template".`);
  else if (routes.indexOf(TEMPLATE_ROUTE) !== routes.length - 1)
    problems.push(
      `Policy "${name}" may name "template" only as its last route.`
    );
  for (const key of ["budgetMs", "floorMs", "routeTimeoutMs"])
    if (policy[key] !== undefined && !isWholeMs(policy[key]))
      problems.push(
        `Policy "${name}" has ${key} ${JSON.stringify(policy[key])}, which must be a whole number of milliseconds.`
      );
  if (policy.stopCodes !== undefined && !Array.isArray(policy.stopCodes))
    problems.push(`Policy "${name}" has stopCodes that is not a list.`);
  return problems;
}

/**
 * Checks a parsed routes file and returns the named policy with its defaults filled in.
 * Throws PolicyError naming every problem with that policy.
 */
export function resolvePolicy(config, name) {
  const policies = config?.policies;
  if (!policies || typeof policies !== "object")
    throw new PolicyError(['The routes file has no "policies" object.']);
  if (!Object.prototype.hasOwnProperty.call(policies, name))
    throw new PolicyError([
      `There is no policy named "${name}". Known: ${Object.keys(policies).join(", ")}.`
    ]);
  const policy = policies[name];
  const problems = policyProblems(name, policy);
  if (problems.length) throw new PolicyError(problems);
  return {
    name,
    routes: [...policy.routes],
    budgetMs: policy.budgetMs ?? WAIT_LIMIT_MS,
    floorMs: policy.floorMs ?? 0,
    routeTimeoutMs: policy.routeTimeoutMs ?? null,
    stopCodes: [...(policy.stopCodes || [])]
  };
}

/** Reads the routes file and resolves one policy from it. */
export function loadPolicy(name, file = ROUTES_FILE) {
  let config;
  try {
    config = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    throw new PolicyError([
      `Could not read the routes file ${file}: ${error.message}`
    ]);
  }
  return resolvePolicy(config, name);
}

/* ---------- classifying a route ---------- */

/**
 * The outcome class of one finished route, from its run record and the error its provider
 * threw, if any. Returns { outcome, reason, codes }. reason is a short fixed word, never a
 * provider's own message, so nothing a provider echoes back can reach the trace.
 */
export function classifyRoute(record, thrown, { stopCodes = [] } = {}) {
  if (record.error?.code === "TIMEOUT")
    return { outcome: OUTCOMES.outage, reason: "timeout", codes: [] };
  if (record.error && record.error.code !== "NO_SELECTION") {
    const status = thrown?.status;
    const message = String(thrown?.message || "");
    if (status === 429 || QUOTA_MESSAGE.test(message))
      return {
        outcome: OUTCOMES.quota,
        reason: status ? `http-${status}` : "quota-message",
        codes: []
      };
    if (status >= 500)
      return { outcome: OUTCOMES.outage, reason: `http-${status}`, codes: [] };
    if (
      !status &&
      (thrown instanceof TypeError || NETWORK_MESSAGE.test(message))
    )
      return { outcome: OUTCOMES.outage, reason: "network", codes: [] };
    return {
      outcome: OUTCOMES.refused,
      reason: status ? `http-${status}` : "call-failed",
      codes: []
    };
  }
  const codes = [
    ...new Set([
      ...(record.error?.codes || []),
      ...(record.selector?.codes || []),
      ...(record.letter?.codes || [])
    ])
  ];
  // The validators flag no posting injection today. stopCodes is where such a code would go:
  // a route that ends on one stops the fall through instead of trying the next provider.
  if (codes.some((code) => stopCodes.includes(code)))
    return { outcome: OUTCOMES.stopped, reason: "stop-code", codes };
  if (
    record.error?.code === "NO_SELECTION" ||
    record.selector?.finalOk === false
  )
    return { outcome: OUTCOMES.validator, reason: "selector", codes };
  if (record.letter?.finalOk !== true)
    return { outcome: OUTCOMES.validator, reason: "letter", codes };
  return { outcome: OUTCOMES.answered, reason: "passed", codes: [] };
}

/** Wraps a provider so the router can read the last error it threw. runOne keeps only the message. */
function watch(provider) {
  const seen = { error: null };
  return {
    seen,
    provider: {
      name: provider.name,
      model: provider.model,
      async complete(call) {
        try {
          return await provider.complete(call);
        } catch (error) {
          seen.error = error;
          throw error;
        }
      }
    }
  };
}

/* ---------- the router ---------- */

/**
 * The hook point for topic routing (E18, not built). A classifier would reorder the model
 * routes here for a given posting. Today the policy order is used as written.
 */
export function orderRoutes(policy) {
  return policy.routes;
}

/**
 * The template route: the port of LocalTemplateService in the provider shape, with no model
 * and no network. The Apex has no selector step, because PortfolioGroundingService ranks the
 * records itself. Here the selector call answers with the harness's rule built selection, and
 * the letter call writes the ported letter from it. options passes ownerName, ownerTitle,
 * startYear and certificationCount to the port. startYear has no default, see template.js.
 */
export function templateProvider(options = {}) {
  return {
    name: TEMPLATE_ROUTE,
    model: "local-template",
    async complete({ kind, context }) {
      const usage = { inputTokens: 0, outputTokens: 0 };
      if (kind === "selector")
        return { text: JSON.stringify(buildFakeSelection(context)), usage };
      const text = buildTemplateLetter({
        ...options,
        posting: context.posting,
        view: context.snapshot,
        selection: context.selection
      });
      return { text, usage };
    }
  };
}

/**
 * Builds a router for one resolved policy. It has a name and a model like a provider, and a
 * run method that runEval calls in place of runOne.
 *
 * options:
 *   build(name)  makes the provider for a route. Defaults to createProvider with env and fetch.
 *   template     the provider shaped local template. Defaults to templateProvider().
 *   env, fetch   passed to the default build, so tests inject both.
 */
export function createRouter(
  policy,
  { build, template = templateProvider(), env = process.env, fetch } = {}
) {
  const make =
    build ||
    ((name) => createProvider(name, { env, ...(fetch ? { fetch } : {}) }));
  // Providers are made once. A missing key is remembered and skipped on every run, never thrown.
  const routes = orderRoutes(policy).map((name) => {
    if (name === TEMPLATE_ROUTE) return { name, provider: template };
    try {
      return { name, provider: make(name) };
    } catch (error) {
      if (error instanceof MissingKeyError)
        return { name, missing: error.names };
      throw error;
    }
  });

  return {
    name: `router:${policy.name}`,
    model: "router",
    policy,
    reset() {
      for (const route of routes) route.provider?.reset?.();
    },
    async run({ now = () => Date.now(), ...args }) {
      const started = now();
      const trace = [];
      const earlier = [];
      let final = null;
      let answeredBy = null;
      const usage = { inputTokens: 0, outputTokens: 0 };
      for (const route of routes) {
        const isTemplate = route.name === TEMPLATE_ROUTE;
        if (route.missing) {
          trace.push({
            route: route.name,
            outcome: OUTCOMES.missingKey,
            reason: "missing-key",
            missing: route.missing,
            waitMs: 0
          });
          continue;
        }
        const remaining = policy.budgetMs - (now() - started);
        // The template runs locally with no model, so the budget never stops it.
        if (!isTemplate && remaining < Math.max(policy.floorMs, 1)) {
          trace.push({
            route: route.name,
            outcome: OUTCOMES.budget,
            reason: "below-floor",
            remainingMs: remaining,
            waitMs: 0
          });
          continue;
        }
        const timeoutMs = isTemplate
          ? WAIT_LIMIT_MS
          : Math.min(remaining, policy.routeTimeoutMs ?? remaining);
        const watched = watch(route.provider);
        const routeStart = now();
        const record = await runOne({
          ...args,
          provider: watched.provider,
          timeoutMs,
          now
        });
        const waitMs = now() - routeStart;
        usage.inputTokens += record.usage.inputTokens;
        usage.outputTokens += record.usage.outputTokens;
        const verdict = classifyRoute(record, watched.seen.error, policy);
        trace.push({
          route: route.name,
          model: route.provider.model,
          outcome: verdict.outcome,
          reason: verdict.reason,
          ...(verdict.codes.length ? { codes: verdict.codes } : {}),
          waitMs
        });
        final = record;
        if (verdict.outcome === OUTCOMES.answered) {
          answeredBy = route.name;
          break;
        }
        if (verdict.outcome === OUTCOMES.stopped) break;
        if (!isTemplate) earlier.push(record);
      }
      // final is null only when the template itself is missing, which policy checks prevent.
      const record = final || {
        postingId: args.posting.id,
        mode: args.mode,
        selector: { attempts: [] },
        letter: { attempts: [] },
        waitMs: {},
        error: { code: "NO_ROUTE", codes: [], message: "No route could run." }
      };
      return {
        ...record,
        provider: `router:${policy.name}`,
        model: record.model || "router",
        usage,
        waitMs: {
          ...record.waitMs,
          route: record.waitMs.total,
          total: now() - started
        },
        route: { policy: policy.name, answeredBy, trace },
        // The records of routes that fell through, so the scorer can count their leaks too.
        fellThrough: earlier
      };
    }
  };
}
