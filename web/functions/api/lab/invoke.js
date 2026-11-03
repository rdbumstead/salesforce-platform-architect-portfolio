import { handlePost } from "../../_lib/actions.js";
import { LAB_PATHS } from "../../_generated/lab-paths.js";

const ALLOWED = new Set(LAB_PATHS);
const VERSIONS = new Set(["", "v1", "v2"]);
const NAME = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;

/**
 * Only a path in the API Lab catalog goes on, with at most 10 plain parameters and a
 * known version. Salesforce checks the same again.
 */
export function build(fields) {
  const path = fields.path;
  if (typeof path !== "string" || !ALLOWED.has(path))
    return "That API path is not in the lab.";
  const version =
    fields.apiVersion === undefined || fields.apiVersion === null
      ? ""
      : fields.apiVersion;
  if (typeof version !== "string" || !VERSIONS.has(version))
    return "The API version must be v1 or v2.";
  const params = {};
  const given =
    fields.params === undefined || fields.params === null ? {} : fields.params;
  if (typeof given !== "object" || Array.isArray(given))
    return "The parameters must be a list of names and values.";
  const names = Object.keys(given);
  if (names.length > 10) return "At most 10 parameters are allowed.";
  for (const name of names) {
    const value = given[name];
    if (
      !NAME.test(name) ||
      !["string", "number", "boolean"].includes(typeof value) ||
      String(value).length > 200
    ) {
      return "A parameter name or value is not allowed.";
    }
    params[name] = String(value);
  }
  return { path, params, apiVersion: version };
}

export const onRequest = (context) =>
  handlePost(context, { feature: "apiLab", action: "lab-invoke", build });
