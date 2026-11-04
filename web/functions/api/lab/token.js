import { handlePost } from "../../_lib/actions.js";

export function build(fields) {
  const out = {};
  for (const name of ["email", "purpose"]) {
    const value = fields[name];
    if (value !== undefined && value !== null && typeof value !== "string")
      return `${name} must be text.`;
    if (typeof value === "string" && value.length > 500)
      return `${name} is too long.`;
    if (value !== undefined) out[name] = value;
  }
  return out;
}

export const onRequest = (context) =>
  handlePost(context, { feature: "apiLab", action: "lab-token", build });
