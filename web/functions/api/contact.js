import { handlePost } from "../_lib/actions.js";

const FIELDS = [
  "firstName",
  "lastName",
  "email",
  "company",
  "message",
  "website",
  "elapsedMs"
];

export function pick(fields) {
  const out = {};
  FIELDS.forEach((name) => {
    if (fields[name] !== undefined) out[name] = fields[name];
  });
  return out;
}

export const onRequest = (context) =>
  handlePost(context, {
    feature: "contact",
    action: "contact",
    turnstile: true,
    build: pick
  });
