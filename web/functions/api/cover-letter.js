import { handlePost } from "../_lib/actions.js";
import { json } from "../_lib/http.js";
import { edgeTemplateLetter } from "../_lib/tailor/edge-letter.js";

/** The letter can take most of Apex's 120 second callout budget, so this waits longer than the rest. */
export const COVER_LETTER_TIMEOUT_MS = 115000;

export function build(fields) {
  const out = {};
  for (const name of ["companyName", "jobTitle", "jobDescription"]) {
    const value = fields[name];
    if (value !== undefined && value !== null && typeof value !== "string")
      return `${name} must be text.`;
    if (typeof value === "string" && value.length > 13000)
      return `${name} is too long.`;
    if (value !== undefined) out[name] = value;
  }
  return out;
}

/**
 * The resume snapshot every export and fixture build writes to functions/_generated. Only this
 * function imports it, so it is bundled into the worker and never served as a static file. It
 * is null when the file is missing, as in a unit test run before any build.
 */
export async function loadSnapshot() {
  try {
    const module = await import("../_generated/resume-snapshot.json", {
      with: { type: "json" }
    });
    return module.default || null;
  } catch (error) {
    return null;
  }
}

/**
 * The cover letter function. When the org cannot be asked, it writes the template letter at
 * the edge (owner decision P-D64). With no snapshot, or a letter that fails a check, the
 * browser shows the recorded sample letter instead.
 */
export function createHandler({ load = loadSnapshot } = {}) {
  return (context) =>
    handlePost(context, {
      feature: "coverLetter",
      action: "cover-letter",
      build,
      timeoutMs: COVER_LETTER_TIMEOUT_MS,
      fallback: true,
      onStopped: async ({ request, env }, fields, reason) => {
        const result = edgeTemplateLetter({
          fields,
          snapshot: await load(),
          env,
          reason,
          requestId: request.headers.get("X-Request-Id") || undefined
        });
        return result
          ? json({ result }, 200, { "X-Request-Id": result.requestId })
          : null;
      }
    });
}

export const onRequest = createHandler();
