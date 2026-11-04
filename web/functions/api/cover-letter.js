import { handlePost } from "../_lib/actions.js";

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

export const onRequest = (context) =>
  handlePost(context, {
    feature: "coverLetter",
    action: "cover-letter",
    build,
    timeoutMs: COVER_LETTER_TIMEOUT_MS
  });
