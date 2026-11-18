/**
 * The visitor ceiling on the production org's daily API requests (owner decision P-D61).
 *
 * The org allows a fixed number of API requests a day, and every visitor call to a site action
 * is one of them. CI stops itself when less than the reserve is left (scripts/api-reserve.js),
 * so the reserve is what visitors use. This keeps visitors from spending the last of it, so the
 * owner can still deploy and recover, and it stops asking a refusing org again and again.
 *
 * Three checks, each failing soft. The caller then answers with a "try again later" message,
 * or with the recorded copy where one exists:
 *
 * 1. A refusal. When the org answers HTTP 403 with REQUEST_LIMIT_EXCEEDED, new calls pause for
 *    PAUSE_MS, then one call tries again.
 * 2. The org's own count. When an org response carries Sforce-Limit-Info (api-usage=used/max)
 *    and used is at or above STOP_SHARE of max, new calls stop for the rest of the UTC day.
 * 3. Our own count. Visitor calls today are counted, and past VISITOR_SHARE of the daily max
 *    new calls stop for the rest of the UTC day.
 *
 * Without KV each isolate keeps its own state, so the count in check 3 is per isolate and the
 * other two only learn from the calls that isolate makes. With a KV namespace bound as
 * API_BUDGET every isolate shares the day's record: the latest org reading, the pause and an
 * approximate visitor count. KV is eventually consistent and free plans allow few writes a day,
 * so the record is read at most every KV_READ_MS and written at most every KV_WRITE_MS per
 * isolate, and at once on a refusal. Counts can be lost between isolates, which is fine for a
 * ceiling that the org's own count and refusal backstop.
 *
 * Settings, all optional, from the function environment:
 *   API_VISITOR_STOP_SHARE   check 2, default 0.95 (5 percent of the cap kept for the owner)
 *   API_VISITOR_DAILY_SHARE  check 3, default 0.35 (inside the 40 percent reserve)
 *   API_DAILY_MAX            the cap when no reading has come in yet, default 15000
 *   API_BUDGET_PAUSE_MINUTES check 1, default 15
 */

import { logFailure } from "./log.js";

export const KV_BINDING = "API_BUDGET";
export const DEFAULTS = Object.freeze({
  stopShare: 0.95,
  visitorShare: 0.35,
  dailyMax: 15000,
  pauseMs: 15 * 60 * 1000
});
export const KV_READ_MS = 30 * 1000;
export const KV_WRITE_MS = 60 * 1000;
export const LIMIT_CODE = "REQUEST_LIMIT_EXCEEDED";

let state = fresh("");

function fresh(day) {
  return {
    day,
    visitorCalls: 0,
    reading: null,
    pausedUntil: 0,
    kvReadAt: 0,
    kvWrittenAt: 0
  };
}

/** Test seam. */
export function resetBudget() {
  state = fresh("");
}

/** Test seam: a copy of this isolate's state. */
export function budgetState() {
  return { ...state };
}

export function utcDay(now) {
  return new Date(now).toISOString().slice(0, 10);
}

function share(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 && number <= 1
    ? number
    : fallback;
}

function count(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

export function settings(env = {}) {
  return {
    stopShare: share(env.API_VISITOR_STOP_SHARE, DEFAULTS.stopShare),
    visitorShare: share(env.API_VISITOR_DAILY_SHARE, DEFAULTS.visitorShare),
    dailyMax: count(env.API_DAILY_MAX, DEFAULTS.dailyMax),
    pauseMs:
      count(env.API_BUDGET_PAUSE_MINUTES, DEFAULTS.pauseMs / 60000) * 60000
  };
}

/** "api-usage=18/15000" (with or without more after it) as { used, max }, or null. */
export function parseLimitInfo(header) {
  const match = /api-usage=(\d+)\/(\d+)/.exec(String(header || ""));
  return match ? { used: Number(match[1]), max: Number(match[2]) } : null;
}

/**
 * Whether an org answer is the daily cap refusing. The REST error shape is a list of
 * { message, errorCode }. An object with errorCode or error, and the message text alone,
 * count too, so a change of shape still reads as a refusal.
 */
export function isLimitRefusal(status, body) {
  if (status !== 403 && status !== 429) return false;
  const entries = Array.isArray(body) ? body : body ? [body] : [];
  return entries.some(
    (entry) =>
      entry &&
      (entry.errorCode === LIMIT_CODE ||
        entry.error === LIMIT_CODE ||
        /TotalRequests Limit exceeded/i.test(String(entry.message || "")))
  );
}

function kvStore(env) {
  const store = env && env[KV_BINDING];
  return store &&
    typeof store.get === "function" &&
    typeof store.put === "function"
    ? store
    : null;
}

function rollDay(now) {
  const day = utcDay(now);
  if (state.day !== day) {
    const pausedUntil = state.pausedUntil;
    state = fresh(day);
    // A pause runs out on its own clock, not at midnight.
    state.pausedUntil = pausedUntil;
  }
}

/** Takes the shared record into this isolate's state, keeping the larger of each figure. */
function merge(record) {
  if (!record || record.day !== state.day) return;
  if (Number.isFinite(record.visitorCalls))
    state.visitorCalls = Math.max(state.visitorCalls, record.visitorCalls);
  if (Number.isFinite(record.pausedUntil))
    state.pausedUntil = Math.max(state.pausedUntil, record.pausedUntil);
  const theirs = record.reading;
  if (
    theirs &&
    Number.isFinite(theirs.used) &&
    Number.isFinite(theirs.max) &&
    (!state.reading || theirs.at > state.reading.at)
  )
    state.reading = theirs;
}

async function readShared(env, now) {
  const store = kvStore(env);
  if (!store || now - state.kvReadAt < KV_READ_MS) return;
  state.kvReadAt = now;
  try {
    merge(await store.get(`budget:${state.day}`, { type: "json" }));
  } catch (error) {
    // KV down means per isolate state only, never a refused visitor. The line says so.
    logFailure({ route: "budget", error: "KV_READ_FAILED", status: 0 });
  }
}

function writeShared(env, now, waitUntil, urgent) {
  const store = kvStore(env);
  if (!store) return;
  if (!urgent && now - state.kvWrittenAt < KV_WRITE_MS) return;
  state.kvWrittenAt = now;
  const record = {
    day: state.day,
    visitorCalls: state.visitorCalls,
    pausedUntil: state.pausedUntil,
    reading: state.reading
  };
  const put = store
    .put(`budget:${state.day}`, JSON.stringify(record), {
      expirationTtl: 2 * 24 * 60 * 60
    })
    .catch(() => {
      logFailure({ route: "budget", error: "KV_WRITE_FAILED", status: 0 });
    });
  if (typeof waitUntil === "function") waitUntil(put);
}

/**
 * Whether a new visitor call may go to the org now.
 * @returns {Promise<{allowed: boolean, reason?: string}>} reason is refused, ceiling or visitors
 */
export async function checkBudget(env, { now = Date.now() } = {}) {
  rollDay(now);
  await readShared(env, now);
  const config = settings(env);
  if (state.pausedUntil > now) return { allowed: false, reason: "refused" };
  const reading = state.reading;
  if (reading && utcDay(reading.at) === state.day) {
    if (reading.used >= Math.floor(reading.max * config.stopShare))
      return { allowed: false, reason: "ceiling" };
  }
  const max = reading ? reading.max : config.dailyMax;
  if (state.visitorCalls >= Math.floor(max * config.visitorShare))
    return { allowed: false, reason: "visitors" };
  return { allowed: true };
}

/**
 * Notes what one org call told us.
 * @param {object} env the function environment
 * @param {object} outcome callAction's outcome. limitInfo ({ used, max }) and limited (bool)
 * @param {object} [options] now, waitUntil (the context's, so a KV write outlives the answer)
 */
export function recordCall(env, outcome, { now = Date.now(), waitUntil } = {}) {
  rollDay(now);
  const config = settings(env);
  if (outcome && outcome.limited) {
    state.pausedUntil = now + config.pauseMs;
    writeShared(env, now, waitUntil, true);
    return;
  }
  state.visitorCalls += 1;
  if (outcome && outcome.limitInfo)
    state.reading = { ...outcome.limitInfo, at: now };
  writeShared(env, now, waitUntil, false);
}
