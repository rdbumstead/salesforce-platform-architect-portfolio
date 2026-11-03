import { handlePost } from "../_lib/actions.js";

const SHARED = [
  "authorName",
  "authorTitle",
  "relationship",
  "vibeMode",
  "website",
  "elapsedMs"
];
const BY_MODE = {
  fragments: ["strengthId", "outcomeId", "note"],
  own: ["ownWords"]
};

/** Keeps the fields of the chosen mode only. A mode that is not listed is refused. */
export function build(fields) {
  const extra = BY_MODE[fields.mode];
  if (!extra) return "The testimonial mode must be fragments or own.";
  const out = { mode: fields.mode };
  [...SHARED, ...extra].forEach((name) => {
    if (fields[name] !== undefined) out[name] = fields[name];
  });
  return out;
}

export const onRequest = (context) =>
  handlePost(context, {
    feature: "testimonial",
    action: "testimonial",
    turnstile: true,
    build
  });
