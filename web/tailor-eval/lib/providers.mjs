/**
 * Model providers for the tailoring evaluation. Every provider has the same shape:
 *
 *   { name, model, complete({ kind, system, user, context, signal }) }
 *
 * and complete resolves to { text, usage: { inputTokens, outputTokens } }. kind is "selector" or
 * "letter". context carries the parsed inputs, which only the fake provider reads.
 *
 * Each real provider reads its key from an environment variable and refuses to start without
 * it. Nothing here is called by a test with a real key or a real network: tests pass their own
 * fetch.
 */
import { buildFakeLetter, buildFakeSelection } from './fake.mjs';

export const ENV_NAMES = {
  gemini: { key: 'TAILOR_EVAL_GEMINI_KEY', model: 'TAILOR_EVAL_GEMINI_MODEL' },
  'workers-ai': { account: 'TAILOR_EVAL_CF_ACCOUNT_ID', key: 'TAILOR_EVAL_CF_TOKEN', model: 'TAILOR_EVAL_CF_MODEL' },
  paid: { url: 'TAILOR_EVAL_PAID_URL', key: 'TAILOR_EVAL_PAID_KEY', model: 'TAILOR_EVAL_PAID_MODEL' }
};

export const DEFAULT_MODELS = {
  gemini: 'gemini-2.5-flash',
  'workers-ai': '@cf/meta/llama-3.3-70b-instruct-fp8-fast'
};

export const PROVIDER_NAMES = ['fake', 'gemini', 'workers-ai', 'paid'];

export class MissingKeyError extends Error {
  constructor(provider, names) {
    super(`The ${provider} provider needs ${names.join(' and ')} in the environment. It was not started.`);
    this.name = 'MissingKeyError';
    this.provider = provider;
    this.names = names;
  }
}

function requireEnv(env, provider, names) {
  const missing = names.filter((name) => !env[name] || !String(env[name]).trim());
  if (missing.length) throw new MissingKeyError(provider, missing);
}

async function postJson(fetchImpl, url, headers, body, signal) {
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = data?.error?.message || data?.errors?.[0]?.message || `HTTP ${response.status}`;
    throw new Error(`Provider call failed: ${detail}`);
  }
  return data;
}

/** Gemini through the public Gemini API. */
export function geminiProvider({ env = process.env, fetch: fetchImpl = globalThis.fetch, temperature = 0.2 } = {}) {
  const names = ENV_NAMES.gemini;
  requireEnv(env, 'gemini', [names.key]);
  const model = env[names.model] || DEFAULT_MODELS.gemini;
  return {
    name: 'gemini',
    model,
    async complete({ kind, system, user, signal }) {
      const data = await postJson(
        fetchImpl,
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        { 'x-goog-api-key': env[names.key] },
        {
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text: user }] }],
          generationConfig: { temperature, ...(kind === 'selector' ? { responseMimeType: 'application/json' } : {}) }
        },
        signal
      );
      const parts = data?.candidates?.[0]?.content?.parts || [];
      const usage = data?.usageMetadata || {};
      return {
        text: parts.map((part) => part.text || '').join(''),
        usage: {
          inputTokens: usage.promptTokenCount || 0,
          outputTokens: (usage.candidatesTokenCount || 0) + (usage.thoughtsTokenCount || 0)
        }
      };
    }
  };
}

/** Cloudflare Workers AI through its REST API. */
export function workersAiProvider({ env = process.env, fetch: fetchImpl = globalThis.fetch, temperature = 0.2, maxTokens = 2048 } = {}) {
  const names = ENV_NAMES['workers-ai'];
  requireEnv(env, 'workers-ai', [names.account, names.key]);
  const model = env[names.model] || DEFAULT_MODELS['workers-ai'];
  return {
    name: 'workers-ai',
    model,
    async complete({ system, user, signal }) {
      const data = await postJson(
        fetchImpl,
        `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(env[names.account])}/ai/run/${model}`,
        { Authorization: `Bearer ${env[names.key]}` },
        {
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user }
          ],
          max_tokens: maxTokens,
          temperature
        },
        signal
      );
      if (data && data.success === false) throw new Error(`Provider call failed: ${data.errors?.[0]?.message || 'unknown error'}`);
      const result = data?.result || {};
      const text = typeof result.response === 'string' ? result.response : JSON.stringify(result.response ?? '');
      return {
        text,
        usage: { inputTokens: result.usage?.prompt_tokens || 0, outputTokens: result.usage?.completion_tokens || 0 }
      };
    }
  };
}

/** Any paid model behind a chat completions endpoint: messages in, choices out. */
export function paidProvider({ env = process.env, fetch: fetchImpl = globalThis.fetch, temperature = 0.2 } = {}) {
  const names = ENV_NAMES.paid;
  requireEnv(env, 'paid', [names.url, names.key, names.model]);
  const model = env[names.model];
  return {
    name: 'paid',
    model,
    async complete({ system, user, signal }) {
      const data = await postJson(
        fetchImpl,
        env[names.url],
        { Authorization: `Bearer ${env[names.key]}` },
        {
          model,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user }
          ],
          temperature
        },
        signal
      );
      return {
        text: data?.choices?.[0]?.message?.content || '',
        usage: { inputTokens: data?.usage?.prompt_tokens || 0, outputTokens: data?.usage?.completion_tokens || 0 }
      };
    }
  };
}

/**
 * A provider with no model behind it. By default it builds a selection and a letter from the
 * snapshot with fixed rules, so the whole harness runs offline. script replaces either answer:
 * script({ kind, attempt, context }) returns text or undefined for the default.
 */
export function fakeProvider({ latencyMs = 0, script, usage = { inputTokens: 1000, outputTokens: 400 } } = {}) {
  const attempts = { selector: 0, letter: 0 };
  return {
    name: 'fake',
    model: 'fake',
    async complete({ kind, context }) {
      attempts[kind] = (attempts[kind] || 0) + 1;
      if (latencyMs) await new Promise((resolve) => setTimeout(resolve, latencyMs));
      const scripted = script ? script({ kind, attempt: attempts[kind], context }) : undefined;
      if (scripted !== undefined) return { text: scripted, usage: { ...usage } };
      const text = kind === 'selector' ? JSON.stringify(buildFakeSelection(context)) : buildFakeLetter(context);
      return { text, usage: { ...usage } };
    },
    reset() {
      attempts.selector = 0;
      attempts.letter = 0;
    }
  };
}

/** Builds a provider by name. Real providers throw MissingKeyError without their keys. */
export function createProvider(name, options = {}) {
  switch (name) {
    case 'fake':
      return fakeProvider(options);
    case 'gemini':
      return geminiProvider(options);
    case 'workers-ai':
      return workersAiProvider(options);
    case 'paid':
      return paidProvider(options);
    default:
      throw new Error(`Unknown provider "${name}". Known: ${PROVIDER_NAMES.join(', ')}.`);
  }
}
