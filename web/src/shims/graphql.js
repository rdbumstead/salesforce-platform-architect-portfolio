/**
 * Stand in for lightning/uiGraphQLApi. The build ran each query once as the build user
 * and filed the response under a hash of the query and its variables. The wire answers
 * from that, in the { data, errors } shape the platform sends.
 */
import { lookup } from "./site-data.js";

export const GRAPHQL_CALL = "graphql";

/** One spelling for a query however it was indented. */
export function normalizeQuery(text) {
  return String(text || "")
    .replace(/#[^\n]*/g, "")
    .replace(/\s+/g, " ")
    .replace(/\s*([{}():,])\s*/g, "$1")
    .trim();
}

export function gql(strings, ...values) {
  let text = "";
  strings.forEach((part, index) => {
    text += part + (index < values.length ? values[index] : "");
  });
  return normalizeQuery(text);
}

export function graphqlParams(config) {
  const params = { query: normalizeQuery(config && config.query) };
  if (config && config.variables !== undefined)
    params.variables = config.variables;
  return params;
}

export class graphql {
  constructor(dataCallback) {
    this.dataCallback = dataCallback;
    this.connected = false;
    this.config = undefined;
  }

  connect() {
    this.connected = true;
    this.emit();
  }

  disconnect() {
    this.connected = false;
  }

  update(config) {
    this.config = config || {};
    this.emit();
  }

  emit() {
    if (!this.connected || this.config === undefined || !this.config.query)
      return;
    if (Object.keys(this.config).some((key) => this.config[key] === undefined))
      return;
    const config = this.config;
    lookup(GRAPHQL_CALL, graphqlParams(config)).then(({ found, value }) => {
      if (!this.connected || this.config !== config) return;
      if (found) {
        this.dataCallback({
          data: value.data,
          errors: value.errors,
          refresh: () => Promise.resolve()
        });
      } else {
        this.dataCallback({
          data: undefined,
          errors: [{ message: "This query is not in the static build." }],
          refresh: () => Promise.resolve()
        });
      }
    });
  }
}

export function refreshGraphQL() {
  return Promise.resolve();
}
