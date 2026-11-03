/**
 * The kill switches. Each is `live` or `recorded`. Production defaults to live when a
 * switch is not set, and anything other than the word live reads as recorded. A deploy that
 * is not on a production host is always recorded, whatever its variables say.
 *
 * Production is decided by the request host, not by a variable, because Pages does not
 * document CF_PAGES_BRANCH at request time and a forgotten variable must fail safe. An
 * unknown host is therefore recorded. PRODUCTION_HOSTS (comma list) replaces the default.
 */

export const SWITCHES = {
  contact: "FEATURE_CONTACT",
  testimonial: "FEATURE_TESTIMONIAL",
  coverLetter: "FEATURE_COVER_LETTER",
  apiLab: "FEATURE_API_LAB",
  liveReads: "FEATURE_LIVE_READS"
};

export const DEFAULT_PRODUCTION_HOSTS = [
  "ryanbumstead.pages.dev",
  "ryanbumstead.com",
  "www.ryanbumstead.com"
];

export function productionHosts(env) {
  const listed = String((env && env.PRODUCTION_HOSTS) || "")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
  return listed.length ? listed : DEFAULT_PRODUCTION_HOSTS;
}

export function isProduction(request, env) {
  let host = "";
  try {
    host = new URL(request.url).hostname.toLowerCase();
  } catch (error) {
    return false;
  }
  return productionHosts(env).includes(host);
}

export function featureStates(request, env) {
  const production = isProduction(request, env);
  const states = {};
  Object.entries(SWITCHES).forEach(([name, variable]) => {
    const raw = env && env[variable];
    const set = raw !== undefined && raw !== null && String(raw).trim() !== "";
    const live =
      production && (set ? String(raw).trim().toLowerCase() === "live" : true);
    states[name] = live ? "live" : "recorded";
  });
  return states;
}

export function isLive(request, env, name) {
  return featureStates(request, env)[name] === "live";
}
