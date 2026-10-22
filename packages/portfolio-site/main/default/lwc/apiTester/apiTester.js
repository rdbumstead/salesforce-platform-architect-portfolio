/**
 * @description       : API Lab console. Calls allowlisted SAPI and PAPI GET paths through
 *                      ApiLabController.invoke (ADR-027) and shows the status, latency, tracing
 *                      and paging headers, the Named Credential and the body. Also requests an
 *                      evaluator token through ApiLabController.requestEvaluatorToken (ADR-028)
 *                      and shows the result exactly as the controller returns it.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 01/03/2026
 **/
import { LightningElement } from "lwc";
import invoke from "@salesforce/apex/ApiLabController.invoke";
import requestEvaluatorToken from "@salesforce/apex/ApiLabController.requestEvaluatorToken";

/**
 * Mirrors ApiLabController.ALLOWED_PATHS. The controller refuses any other path, so a
 * path added there must be added here to show in the picker.
 */
export const ALLOWED_PATHS = [
  "/sapi/v1/health",
  "/sapi/v1/contacts",
  "/sapi/v1/accounts",
  "/sapi/v1/experience",
  "/sapi/v1/experience-highlights",
  "/sapi/v1/experience-skills",
  "/sapi/v1/projects",
  "/sapi/v1/project-assets",
  "/sapi/v1/project-skills",
  "/sapi/v1/skills",
  "/sapi/v1/certifications",
  "/sapi/v1/certification-skills",
  "/sapi/v1/education",
  "/sapi/v1/testimonials",
  "/sapi/v1/portfolio-config",
  "/papi/v1/health",
  "/papi/v1/profile/full",
  "/papi/v1/profile/summary",
  "/papi/v1/resume/generate",
  "/papi/v1/projects/featured",
  "/papi/v1/testimonials/feed"
];

/** Mirrors ApiLabController.RETURNED_HEADERS, in display order. */
export const DISPLAYED_HEADERS = [
  "X-Request-Id",
  "X-RateLimit-Limit",
  "X-RateLimit-Remaining",
  "Cache-Control",
  "X-Total-Count",
  "X-Has-More"
];

const NOT_RETURNED = "(not returned)";

/** Adds distinct keys for the dt and dd of each row in a for:each. */
function withKeys(rows) {
  return rows.map((row) => ({
    ...row,
    labelKey: `${row.name}-label`,
    valueKey: `${row.name}-value`
  }));
}

function reduceError(error) {
  if (!error) {
    return "Unknown error";
  }
  if (Array.isArray(error.body)) {
    return error.body.map((entry) => entry.message).join(", ");
  }
  if (error.body && typeof error.body.message === "string") {
    return error.body.message;
  }
  if (typeof error.message === "string") {
    return error.message;
  }
  return "Unknown error";
}

/**
 * Parses "limit=5&persona=Architect" into a map. Names and values are validated by
 * the controller, so this only splits and decodes.
 */
export function parseQuery(text) {
  const params = {};
  const trimmed = (text || "").trim().replace(/^\?/, "");
  if (!trimmed) {
    return params;
  }
  trimmed.split("&").forEach((pair) => {
    if (!pair) {
      return;
    }
    const index = pair.indexOf("=");
    const name = index === -1 ? pair : pair.slice(0, index);
    const value = index === -1 ? "" : pair.slice(index + 1);
    params[decodeURIComponent(name.trim())] = decodeURIComponent(value.trim());
  });
  return params;
}

function formatBody(body) {
  if (body === null || body === undefined || body === "") {
    return "(empty body)";
  }
  try {
    return JSON.stringify(JSON.parse(body), null, 2);
  } catch {
    return body;
  }
}

export default class ApiTester extends LightningElement {
  selectedPath = ALLOWED_PATHS[0];
  queryText = "";
  isLoading = false;
  result;
  invokeError = "";

  email = "";
  purpose = "";
  isRequestingToken = false;
  tokenResult;
  tokenError = "";

  get endpointOptions() {
    return ALLOWED_PATHS.map((path) => ({ label: `GET ${path}`, value: path }));
  }

  get isExecuteDisabled() {
    return !this.selectedPath || this.isLoading;
  }

  get hasResult() {
    return Boolean(this.result);
  }

  get statusText() {
    return this.result ? String(this.result.statusCode) : "";
  }

  get statusClass() {
    const code = this.result ? this.result.statusCode : 0;
    return code >= 200 && code < 300
      ? "status-value text-success"
      : "status-value text-error";
  }

  get latencyText() {
    return this.result ? `${this.result.latencyMs} ms` : "";
  }

  get headerRows() {
    const headers = (this.result && this.result.headers) || {};
    const rows = DISPLAYED_HEADERS.map((name) => ({
      name,
      value: headers[name] !== undefined ? headers[name] : NOT_RETURNED
    }));
    rows.push({
      name: "Named Credential",
      value: (this.result && this.result.namedCredential) || NOT_RETURNED
    });
    rows.push({
      name: "Request id sent",
      value: (this.result && this.result.requestId) || NOT_RETURNED
    });
    return withKeys(rows);
  }

  get bodyText() {
    return this.result ? formatBody(this.result.body) : "";
  }

  get isTokenDisabled() {
    return this.isRequestingToken;
  }

  get hasTokenResult() {
    return Boolean(this.tokenResult);
  }

  get tokenIssued() {
    return Boolean(this.tokenResult && this.tokenResult.token);
  }

  get tokenFields() {
    const token = (this.tokenResult && this.tokenResult.token) || {};
    return withKeys(
      ["access_token", "token_type", "expires_in", "instance_url", "docs"]
        .filter((name) => token[name] !== undefined && token[name] !== null)
        .map((name) => ({ name, value: String(token[name]) }))
    );
  }

  get tokenRefusalFields() {
    const result = this.tokenResult || {};
    const fields = [
      { name: "statusCode", value: result.statusCode },
      { name: "errorCode", value: result.errorCode },
      { name: "message", value: result.message },
      { name: "retryAfterSeconds", value: result.retryAfterSeconds },
      { name: "correlationId", value: result.correlationId }
    ]
      .filter((field) => field.value !== undefined && field.value !== null)
      .map((field) => ({ name: field.name, value: String(field.value) }));
    return withKeys(fields);
  }

  handleEndpointChange(event) {
    this.selectedPath = event.detail.value;
  }

  handleQueryChange(event) {
    this.queryText = event.target.value;
  }

  handleTokenInput(event) {
    const field = event.target.dataset.field;
    if (field === "email" || field === "purpose") {
      this[field] = event.target.value;
    }
  }

  async handleExecute() {
    if (this.isExecuteDisabled) {
      return;
    }
    this.isLoading = true;
    this.invokeError = "";
    this.result = undefined;
    try {
      this.result = await invoke({
        path: this.selectedPath,
        params: parseQuery(this.queryText)
      });
    } catch (error) {
      this.invokeError = reduceError(error);
    } finally {
      this.isLoading = false;
    }
  }

  async handleRequestToken() {
    if (this.isTokenDisabled) {
      return;
    }
    this.isRequestingToken = true;
    this.tokenError = "";
    this.tokenResult = undefined;
    try {
      this.tokenResult = await requestEvaluatorToken({
        email: this.email,
        purpose: this.purpose
      });
    } catch (error) {
      this.tokenError = reduceError(error);
    } finally {
      this.isRequestingToken = false;
    }
  }
}
