/**
 * @description       : API Lab console. A version picker sends v2 by default, which returns
 *                      public keys only, or v1, labelled deprecated while it lasts. The call
 *                      goes through ApiLabController.invokeVersioned, and the response headers
 *                      include X-API-Version, Deprecation, Sunset and Link, so a v1 call shows
 *                      its own deprecation notice. The path list, each path's query
 *                      parameters and its response shapes come from ApiLabController.getCatalog,
 *                      which serves the API_Lab_Catalog resource that scripts/sync-specs.js
 *                      builds from the specs, so a new spec path needs no change here. Each
 *                      parameter is a control (pills for up to four values, a picklist above
 *                      that, true and false pills for a boolean, bounded number inputs for limit
 *                      and offset, a text input with a hint for an id filter), every
 *                      chosen value shows as a removable pill with the query string under them,
 *                      and the free text "Advanced" field stays. A name or Id filter becomes a
 *                      picklist with "Any" first when ApiLabOptionsController.getOptions,
 *                      read once per page load, returns values for it: a name sends itself and
 *                      a record's name sends its Id. Each hint sits on its own line under its
 *                      name. Below the site's phone breakpoint the filters, Advanced, the
 *                      response details and the token form start as closed button disclosures,
 *                      each press sending api_lab_section_toggled. Calls go through
 *                      ApiLabController.invoke (ADR-027), which returns the status, latency,
 *                      tracing and paging headers, the Named Credential and the body. The body
 *                      has a highlighted Raw JSON view (c/prismHighlighter) and a Rendered view
 *                      for long text, and is checked against the path's response schema: which
 *                      documented keys are present, missing or extra. "Next page" follows
 *                      X-Has-More. Also requests an evaluator token through
 *                      ApiLabController.requestEvaluatorToken (ADR-028) and shows the result as
 *                      the controller returns it. Sends api_test_executed with the path, status
 *                      and param_count after each call through c/analyticsService. Before the
 *                      first call the response area says how to fill it. While a call is out it
 *                      reads "Sending…" over a thin bar that moves by transform alone, and when
 *                      the answer arrives on a phone it is scrolled into view, smoothly unless
 *                      the visitor asks for reduced motion (c/motionPreference).
 *                      The endpoint, the Advanced text and the token Email and Purpose are
 *                      native controls with the site's one look (c/nativeControls). Each
 *                      control row lines up by its controls, and every parameter control sits
 *                      at the bottom of its grid cell so a row of them lines up. The email is
 *                      checked on leaving the field and on Request token. Under the token
 *                      form come three setup steps, a download of the Postman collection
 *                      (the PAPI_Postman_Collection resource), a Run in Postman link shown
 *                      only while one is set, and three copyable curl examples filled with the
 *                      issued token and built in the page. The download, the link and each
 *                      copy send postman_collection_downloaded, postman_run_clicked and
 *                      curl_copied, never with the token. A failed call reads as a plain
 *                      sentence (reduceError). The Execute button is the tour's stop C
 *                      anchor (c/tourShowMe).
 * @author           : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 01/03/2026
 **/
import { LightningElement, wire } from "lwc";
import getCatalog from "@salesforce/apex/ApiLabController.getCatalog";
import getOptions from "@salesforce/apex/ApiLabOptionsController.getOptions";
import invoke from "@salesforce/apex/ApiLabController.invokeVersioned";
import requestEvaluatorToken from "@salesforce/apex/ApiLabController.requestEvaluatorToken";
import getPostmanRunUrl from "@salesforce/apex/ApiLabController.getPostmanRunUrl";
import POSTMAN_COLLECTION from "@salesforce/resourceUrl/PAPI_Postman_Collection";
import { trackEvent, EVENTS } from "c/analyticsService";
import { loadPrism, highlight } from "c/prismHighlighter";
import { isReduced } from "c/motionPreference";
import { onShowMe, revealAnchor } from "c/tourShowMe";

/** The tour stop whose control is this component's Execute button. */
export const TOUR_STOP = "C";

/** The file name the Postman collection downloads as. */
export const COLLECTION_FILE_NAME =
  "ryan-bumstead-portfolio-api.postman_collection.json";

/** The source param of the Postman events from this component. */
export const ANALYTICS_SOURCE = "api_lab";

/** The token endpoint on the site's own host, the only path served to a caller with no token. */
export const TOKEN_ENDPOINT_PATH =
  "/portfoliovforcesite/services/apexrest/papi/v1/auth/token";
export const API_PATH = "/services/apexrest/papi/v1";

/** The API versions the Lab can send, in the picker's order. v2 is the default. */
export const API_VERSIONS = [
  { value: "v2", label: "v2" },
  { value: "v1", label: "v1 (deprecated)" }
];
export const DEFAULT_VERSION = "v2";
export const DEPRECATED_VERSION = "v1";

/** One plain line shown while v1 is picked. */
export const V1_NOTICE =
  "v1 is deprecated. It stays for one month after v2 reaches production, then answers 410 Gone. Its responses carry the Deprecation, Sunset and Link headers listed below.";
export const PLACEHOLDER_INSTANCE_URL = "<instance_url>";
export const PLACEHOLDER_TOKEN = "<access_token>";

export const MAX_EMAIL = 254;
export const MAX_PURPOSE = 280;
export const EMAIL_PATTERN =
  /^[A-Za-z0-9._%+'-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/;
export const EMAIL_ERROR = "Enter an email address like name@example.com.";

export const COPY_DONE = "Copied.";
export const COPY_FAILED =
  "Copy did not work in this browser. Select the text and copy it.";

export const CURL_NOTE =
  "Every evaluator token is one shared session. It is shown once and ends after 30 minutes without use. These lines are built in your browser and sent nowhere.";

export const STATUS_NOTES = [
  {
    code: "401",
    text: "The token has ended. Request a new one."
  },
  {
    code: "429",
    text: "Too many requests in one minute. Wait for the seconds in Retry-After."
  },
  {
    code: "503",
    text: "Today's token limit is reached. Try again tomorrow."
  }
];

/** What a failed call says when the platform gave no message a visitor can use. */
export const UNREACHABLE_MESSAGE =
  "The request did not reach the server. Check your connection and try again.";

/** The plain sentence for each status a failed call can carry. */
export const STATUS_MESSAGES = {
  401: "Your visit's session ended. Reload the page and try again.",
  429: "Too many requests in the last minute. Wait a minute, then try again.",
  503: "The service is not taking requests right now. Try again later."
};

/** The platform's own wording when it could not read the server's answer. */
const RAW_ERROR = /failed to get error from response|^unknown error$/i;

/**
 * A plain sentence for a failed Apex call: the meaning of a 401, 429 or 503, else the
 * server's own message, else a sentence that says the request did not get through. Never the
 * platform's "Failed to get error from response".
 */
export function reduceError(error) {
  if (!error) {
    return UNREACHABLE_MESSAGE;
  }
  const status = Number(error.status);
  if (STATUS_MESSAGES[status]) {
    return STATUS_MESSAGES[status];
  }
  let messages = [];
  if (Array.isArray(error.body)) {
    messages = error.body.map((entry) => entry && entry.message);
  } else if (error.body && typeof error.body.message === "string") {
    messages = [error.body.message];
  } else if (typeof error.message === "string") {
    messages = [error.message];
  }
  const useful = messages.filter(
    (message) =>
      typeof message === "string" &&
      message.trim().length > 0 &&
      !RAW_ERROR.test(message.trim())
  );
  return useful.length ? useful.join(", ") : UNREACHABLE_MESSAGE;
}

/** True for an https link on postman.com or getpostman.com, the only Run in Postman links shown. */
export function isPostmanRunUrl(value) {
  if (typeof value !== "string" || !value.trim()) {
    return false;
  }
  try {
    const url = new URL(value.trim());
    return (
      url.protocol === "https:" &&
      /(^|\.)(getpostman|postman)\.com$/.test(url.hostname)
    );
  } catch {
    return false;
  }
}

/**
 * The three curl examples: the token request on the site's own host, a health call and a data
 * call. With a token they carry the visitor's instance_url and token, before one placeholders.
 * The email in the token request is always a placeholder.
 * @param {string} origin the site's origin, such as https://example.my.site.com
 * @param {object} [token] the issued token body, with access_token and instance_url
 * @returns {Array<{key: string, title: string, copyLabel: string, text: string}>}
 */
export function buildCurlExamples(origin, token, apiVersion = DEFAULT_VERSION) {
  const instanceUrl = (token && token.instance_url) || PLACEHOLDER_INSTANCE_URL;
  const accessToken = (token && token.access_token) || PLACEHOLDER_TOKEN;
  const call = (path) =>
    [
      `curl "${instanceUrl}${API_PATH}${path}" \\`,
      `  -H "Authorization: Bearer ${accessToken}" \\`,
      `  -H "X-API-Version: ${apiVersion}"`
    ].join("\n");
  return [
    {
      key: "token",
      title: "Get a token",
      copyLabel: "Copy the token request",
      text: [
        `curl -X POST "${origin || ""}${TOKEN_ENDPOINT_PATH}" \\`,
        '  -H "Content-Type: application/json" \\',
        `  -d '{"email":"you@example.com","purpose":"Evaluate the Portfolio API"}'`
      ].join("\n")
    },
    {
      key: "health",
      title: "Check the API's health",
      copyLabel: "Copy the health call",
      text: call("/health")
    },
    {
      key: "data",
      title: "Read the profile summary",
      copyLabel: "Copy the profile summary call",
      text: call("/profile/summary")
    }
  ];
}

/** api_test_executed status when the call itself failed and no HTTP status came back. */
export const STATUS_CALL_FAILED = "error";

/** Mirrors ApiLabController.RETURNED_HEADERS, in display order. */
export const DISPLAYED_HEADERS = [
  "X-Request-Id",
  "X-RateLimit-Limit",
  "X-RateLimit-Remaining",
  "Cache-Control",
  "X-Total-Count",
  "X-Has-More"
];

/**
 * The version headers, shown after DISPLAYED_HEADERS. ApiLabController returns them after
 * its own RETURNED_HEADERS list, in this order.
 */
export const VERSION_HEADERS = [
  "X-API-Version",
  "Deprecation",
  "Sunset",
  "Link"
];

/** An enum with this many values or fewer shows as pills, more as a picklist. */
export const MAX_PILL_VALUES = 4;

export const KIND_PILLS = "pills";
export const KIND_SELECT = "select";
export const KIND_NUMBER = "number";
export const KIND_ID = "id";
export const KIND_TEXT = "text";
export const KIND_OPTIONS = "options";

/** The site's phone breakpoint, the same value as portfolioThemeLayout.css. */
export const PHONE_QUERY = "(max-width: 767.98px)";

/** The sections that start closed on a phone, in page order. */
export const SECTION_FILTERS = "filters";
export const SECTION_ADVANCED = "advanced";
export const SECTION_RESPONSE = "response";
export const SECTION_TOKEN = "token";
export const SECTIONS = [
  SECTION_FILTERS,
  SECTION_ADVANCED,
  SECTION_RESPONSE,
  SECTION_TOKEN
];

export const ID_HINT =
  "Paste a key from an earlier response, for example from /sapi/v1/projects.";

export const ID_OPTION_HINT = "Pick a name. Its key is what the call sends.";

const NOT_RETURNED = "(not returned)";

/** Adds distinct keys for the dt and dd of each row in a for:each. */
function withKeys(rows) {
  return rows.map((row) => ({
    ...row,
    labelKey: `${row.name}-label`,
    valueKey: `${row.name}-value`
  }));
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

/** "?a=1&b=two" from a map, encoded, in the map's order. "" for an empty map. */
export function buildQueryString(params) {
  const pairs = Object.keys(params || {}).map(
    (name) =>
      `${encodeURIComponent(name)}=${encodeURIComponent(String(params[name]))}`
  );
  return pairs.length ? `?${pairs.join("&")}` : "";
}

/** Parses the catalog JSON the controller returns. Undefined when it cannot be read. */
export function parseCatalog(text) {
  try {
    const catalog = JSON.parse(text);
    return catalog && Array.isArray(catalog.paths) ? catalog : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Which control a spec parameter becomes. A free text or Id parameter becomes a picklist of
 * the values that exist when the org returned options for it, and stays a text box when not.
 */
export function controlKind(param, options) {
  if (Array.isArray(param.enum) && param.enum.length) {
    return param.enum.length <= MAX_PILL_VALUES ? KIND_PILLS : KIND_SELECT;
  }
  if (param.type === "boolean") {
    return KIND_PILLS;
  }
  if (param.type === "integer" || param.type === "number") {
    return KIND_NUMBER;
  }
  const known = options && options[param.name];
  if (Array.isArray(known) && known.length) {
    return KIND_OPTIONS;
  }
  if (/Id$/.test(param.name)) {
    return KIND_ID;
  }
  return KIND_TEXT;
}

function pillValues(param) {
  return Array.isArray(param.enum) && param.enum.length
    ? param.enum
    : ["true", "false"];
}

/** "1 to 200, default 50" from a parameter's bounds. */
export function numberHint(param) {
  const parts = [];
  if (param.minimum !== undefined && param.maximum !== undefined) {
    parts.push(`${param.minimum} to ${param.maximum}`);
  } else if (param.minimum !== undefined) {
    parts.push(`${param.minimum} or more`);
  }
  if (param.default !== undefined) {
    parts.push(`default ${param.default}`);
  }
  return parts.join(", ");
}

function objectKeys(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? Object.keys(value)
    : [];
}

/**
 * Compares a parsed body with a response shape from the catalog
 * ({ type, properties, required }): the documented keys present, the documented keys
 * missing (required ones flagged) and the keys the spec does not document. For an array
 * the keys of every item are checked together.
 */
export function checkAgainstSchema(body, shape) {
  if (!shape) {
    return { status: "noSchema" };
  }
  let actualKeys;
  if (shape.type === "array") {
    if (!Array.isArray(body)) {
      return { status: "wrongType", expected: "array" };
    }
    if (!body.length) {
      return { status: "empty" };
    }
    actualKeys = new Set();
    body.forEach((item) =>
      objectKeys(item).forEach((key) => actualKeys.add(key))
    );
  } else {
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return { status: "wrongType", expected: "object" };
    }
    actualKeys = new Set(Object.keys(body));
  }
  const documented = shape.properties || [];
  const required = new Set(shape.required || []);
  return {
    status: "checked",
    present: documented.filter((key) => actualKeys.has(key)),
    missing: documented
      .filter((key) => !actualKeys.has(key))
      .map((key) => ({ key, required: required.has(key) })),
    extra: [...actualKeys].filter((key) => !documented.includes(key))
  };
}

/** A string field this long, or with a line break, is shown in the Rendered view. */
export const RENDERED_MIN_LENGTH = 80;
const MAX_RENDERED_FIELDS = 20;
const MAX_RENDER_DEPTH = 4;

export const VIEW_RAW = "raw";
export const VIEW_RENDERED = "rendered";

/**
 * Finds the long text fields of a parsed body, depth first, as { path, text }. A path
 * is the keys and list indexes joined with dots, for example "generatedText" or
 * "data.0.description".
 */
export function longTextFields(value, path = "", depth = 0, found = []) {
  if (found.length >= MAX_RENDERED_FIELDS || depth > MAX_RENDER_DEPTH) {
    return found;
  }
  if (typeof value === "string") {
    if (path && (value.length >= RENDERED_MIN_LENGTH || value.includes("\n"))) {
      found.push({ path, text: value });
    }
    return found;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      longTextFields(
        item,
        path ? `${path}.${index}` : String(index),
        depth + 1,
        found
      )
    );
    return found;
  }
  if (value && typeof value === "object") {
    Object.keys(value).forEach((key) =>
      longTextFields(
        value[key],
        path ? `${path}.${key}` : key,
        depth + 1,
        found
      )
    );
  }
  return found;
}

function parseBody(body) {
  if (body === null || body === undefined || body === "") {
    return undefined;
  }
  try {
    return JSON.parse(body);
  } catch {
    return undefined;
  }
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
  catalog;
  catalogError = "";
  selectedPath;
  apiVersion = DEFAULT_VERSION;
  paramValues = {};
  queryText = "";
  isLoading = false;
  result;
  invokeError = "";
  bodyView = VIEW_RAW;
  prism;
  paintedBody;
  paintedTarget;
  revealPending = false;

  email = "";
  purpose = "";
  emailError = "";
  isRequestingToken = false;
  tokenResult;
  tokenError = "";
  maxEmail = MAX_EMAIL;
  maxPurpose = MAX_PURPOSE;

  collectionUrl = POSTMAN_COLLECTION;
  collectionFileName = COLLECTION_FILE_NAME;
  /** The Run in Postman link from Portfolio_Setting.Postman_Run_Url, "" while it is not set. */
  postmanRunUrl = "";
  copyStatus = "";
  curlNote = CURL_NOTE;
  statusNotes = STATUS_NOTES;
  stopShowMe;

  /** Option lists by parameter name, from the org. Empty until they load or when they fail. */
  options = {};
  isPhone = false;
  openSections = {};
  phoneQuery;
  phoneListener;

  /**
   * One read per page load. When it fails every parameter keeps its text box, so the Lab
   * still works.
   */
  @wire(getOptions)
  wiredOptions({ data, error }) {
    if (data) {
      this.options = data;
    } else if (error) {
      this.options = {};
    }
  }

  /** The Run in Postman link. Anything but a postman.com https link keeps the button hidden. */
  @wire(getPostmanRunUrl)
  wiredPostmanRunUrl({ data }) {
    this.postmanRunUrl = isPostmanRunUrl(data) ? data.trim() : "";
  }

  @wire(getCatalog)
  wiredCatalog({ data, error }) {
    if (data) {
      const catalog = parseCatalog(data);
      this.catalog = catalog;
      this.catalogError = catalog ? "" : "The API catalog could not be read.";
      if (catalog && !this.selectedPath && catalog.paths.length) {
        this.selectedPath = catalog.paths[0].path;
      }
    } else if (error) {
      this.catalog = undefined;
      this.catalogError = `The API catalog could not be loaded: ${reduceError(error)}`;
    }
  }

  connectedCallback() {
    loadPrism(this).then((prism) => {
      this.prism = prism;
      this.paintedBody = undefined;
      this.paintBody();
    });
    this.watchPhoneWidth();
    this.stopShowMe = onShowMe(TOUR_STOP, () => revealAnchor(this.template));
  }

  disconnectedCallback() {
    if (this.stopShowMe) {
      this.stopShowMe();
      this.stopShowMe = undefined;
    }
    if (this.phoneQuery && this.phoneListener) {
      if (typeof this.phoneQuery.removeEventListener === "function") {
        this.phoneQuery.removeEventListener("change", this.phoneListener);
      } else if (typeof this.phoneQuery.removeListener === "function") {
        this.phoneQuery.removeListener(this.phoneListener);
      }
    }
    this.phoneQuery = undefined;
    this.phoneListener = undefined;
  }

  /** Follows the phone breakpoint, so sections fold below it and stay open above it. */
  watchPhoneWidth() {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      return;
    }
    this.phoneQuery = window.matchMedia(PHONE_QUERY);
    this.isPhone = Boolean(this.phoneQuery && this.phoneQuery.matches);
    this.phoneListener = (event) => {
      this.isPhone = Boolean(event.matches);
    };
    if (typeof this.phoneQuery.addEventListener === "function") {
      this.phoneQuery.addEventListener("change", this.phoneListener);
    } else if (typeof this.phoneQuery.addListener === "function") {
      this.phoneQuery.addListener(this.phoneListener);
    }
  }

  renderedCallback() {
    this.paintBody();
    this.revealAnswer();
  }

  /** Scrolls a new answer into view on a phone, where it can land below the fold. */
  revealAnswer() {
    if (!this.revealPending || this.isLoading) {
      return;
    }
    const target = this.template.querySelector(
      ".result-summary, .invoke-error"
    );
    if (!target) {
      return;
    }
    this.revealPending = false;
    if (typeof target.scrollIntoView === "function") {
      target.scrollIntoView({
        behavior: isReduced() ? "auto" : "smooth",
        block: "start"
      });
    }
  }

  /** Writes the highlighted body into the manual DOM node of the Raw JSON view. */
  paintBody() {
    const target = this.template.querySelector("code.response-code");
    if (!target) {
      this.paintedBody = undefined;
      return;
    }
    const text = this.bodyText;
    const isJson = Boolean(this.result) && this.lastBody !== undefined;
    const key = `${this.prism ? "prism" : "plain"}:${isJson}:${text}`;
    if (key === this.paintedBody && target === this.paintedTarget) {
      return;
    }
    // c/prismHighlighter returns markup built only from escaped text.
    // eslint-disable-next-line @lwc/lwc/no-inner-html
    target.innerHTML = isJson
      ? highlight(this.prism, text, "json")
      : highlight(undefined, text, "none");
    this.paintedBody = key;
    this.paintedTarget = target;
  }

  get hasCatalog() {
    return Boolean(this.catalog);
  }

  get catalogPaths() {
    return this.catalog ? this.catalog.paths : [];
  }

  get endpointOptions() {
    return this.catalogPaths.map((entry) => ({
      label: `GET ${entry.path}`,
      value: entry.path,
      selected: entry.path === this.selectedPath
    }));
  }

  get versionOptions() {
    return API_VERSIONS.map((option) => ({
      ...option,
      selected: option.value === this.apiVersion
    }));
  }

  get isDeprecatedVersion() {
    return this.apiVersion === DEPRECATED_VERSION;
  }

  get versionNotice() {
    return V1_NOTICE;
  }

  get currentEntry() {
    return this.catalogPaths.find((entry) => entry.path === this.selectedPath);
  }

  get paramControls() {
    const entry = this.currentEntry;
    if (!entry) {
      return [];
    }
    return entry.params.map((param) => this.controlFor(entry, param));
  }

  controlFor(entry, param) {
    const kind = controlKind(param, this.options);
    const value = this.paramValues[param.name];
    let hint = param.description;
    if (kind === KIND_NUMBER) {
      hint = numberHint(param);
    } else if (kind === KIND_ID) {
      hint = ID_HINT;
    } else if (kind === KIND_OPTIONS && /Id$/.test(param.name)) {
      hint = ID_OPTION_HINT;
    }
    const control = {
      name: param.name,
      key: `${entry.path}:${param.name}`,
      value: value === undefined ? "" : value,
      isPills: kind === KIND_PILLS,
      isSelect: kind === KIND_SELECT || kind === KIND_OPTIONS,
      isNumber: kind === KIND_NUMBER,
      isText: kind === KIND_TEXT || kind === KIND_ID,
      min: param.minimum,
      max: param.maximum,
      hint,
      selectHint: kind === KIND_OPTIONS ? hint : ""
    };
    if (kind === KIND_PILLS) {
      control.pills = pillValues(param).map((option) => ({
        value: option,
        key: `${param.name}=${option}`,
        pressed: value === option ? "true" : "false",
        className: value === option ? "pill pill_selected" : "pill"
      }));
    }
    if (kind === KIND_SELECT) {
      control.options = [
        { value: "", label: "Any", key: `${param.name}-any`, selected: !value },
        ...param.enum.map((option) => ({
          value: option,
          label: option,
          key: `${param.name}-${option}`,
          selected: value === option
        }))
      ];
    }
    if (kind === KIND_OPTIONS) {
      control.options = [
        { value: "", label: "Any", key: `${param.name}-any`, selected: !value },
        ...this.options[param.name].map((option) => ({
          value: option.value,
          label: option.label,
          key: `${param.name}-${option.value}`,
          selected: value === option.value
        }))
      ];
    }
    return control;
  }

  get hasParamControls() {
    return this.paramControls.length > 0;
  }

  /** Control values first, then the Advanced text, which wins on a shared name. */
  get mergedParams() {
    return { ...this.paramValues, ...parseQuery(this.queryText) };
  }

  get chosenPills() {
    return Object.keys(this.paramValues).map((name) => ({
      name,
      key: `chosen-${name}`,
      text: `${name}=${this.paramValues[name]}`,
      removeLabel: `Remove ${name}=${this.paramValues[name]}`
    }));
  }

  get hasChosenPills() {
    return this.chosenPills.length > 0;
  }

  /** "Filters (2)": the heading of the folded filters, with how many values are chosen. */
  get filtersTitle() {
    return `Filters (${Object.keys(this.paramValues).length})`;
  }

  isSectionOpen(section) {
    return !this.isPhone || Boolean(this.openSections[section]);
  }

  get filtersHidden() {
    return !this.isSectionOpen(SECTION_FILTERS);
  }

  get advancedHidden() {
    return !this.isSectionOpen(SECTION_ADVANCED);
  }

  get responseHidden() {
    return !this.isSectionOpen(SECTION_RESPONSE);
  }

  get tokenHidden() {
    return !this.isSectionOpen(SECTION_TOKEN);
  }

  get filtersExpanded() {
    return this.filtersHidden ? "false" : "true";
  }

  get advancedExpanded() {
    return this.advancedHidden ? "false" : "true";
  }

  get responseExpanded() {
    return this.responseHidden ? "false" : "true";
  }

  get tokenExpanded() {
    return this.tokenHidden ? "false" : "true";
  }

  /** Opens or closes one folded section on a phone and records it once per press. */
  handleSectionToggle(event) {
    const section = event.currentTarget.dataset.section;
    if (!SECTIONS.includes(section)) {
      return;
    }
    const expanded = !this.openSections[section];
    this.openSections = { ...this.openSections, [section]: expanded };
    trackEvent(EVENTS.API_LAB_SECTION_TOGGLED, { section, expanded });
  }

  get queryPreview() {
    return buildQueryString(this.mergedParams) || "(no query parameters)";
  }

  get isExecuteDisabled() {
    return !this.selectedPath || !this.hasCatalog || this.isLoading;
  }

  get hasResult() {
    return Boolean(this.result);
  }

  /** True before the first call and after anything that clears the answer. */
  get showEmptyPanel() {
    return !this.isLoading && !this.result && !this.invokeError;
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
    const rows = [...DISPLAYED_HEADERS, ...VERSION_HEADERS].map((name) => ({
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

  get lastBody() {
    return this.result ? parseBody(this.result.body) : undefined;
  }

  get hasNextPage() {
    const headers = (this.result && this.result.headers) || {};
    const entry = this.currentEntry;
    return (
      String(headers["X-Has-More"]).toLowerCase() === "true" &&
      Boolean(entry && entry.params.some((param) => param.name === "offset"))
    );
  }

  get schemaCheck() {
    if (!this.result) {
      return undefined;
    }
    const parsed = this.lastBody;
    const status = String(this.result.statusCode);
    if (parsed === undefined) {
      return { summary: "The body is not JSON, so it was not checked." };
    }
    const entry = this.currentEntry;
    // A v1 call is checked against the v1 shapes, which still hold id, when the catalog has them.
    const shapes =
      entry && this.isDeprecatedVersion && entry.v1Responses
        ? entry.v1Responses
        : entry && entry.responses;
    const shape = shapes ? shapes[status] : undefined;
    const check = checkAgainstSchema(parsed, shape);
    if (check.status === "noSchema") {
      return {
        summary: `The spec documents no JSON body for status ${status}.`
      };
    }
    if (check.status === "wrongType") {
      return {
        summary: `The spec says status ${status} returns an ${check.expected}, and this body is not one.`
      };
    }
    if (check.status === "empty") {
      return {
        summary: `The spec says status ${status} returns a list, and this one is empty, so there are no keys to check.`
      };
    }
    const requiredMissing = check.missing.filter((item) => item.required);
    const lists = [
      {
        key: "present",
        title: `Present (${check.present.length})`,
        items: check.present.map((key) => ({ key, text: key }))
      },
      {
        key: "missing",
        title: `Missing (${check.missing.length})`,
        items: check.missing.map((item) => ({
          key: item.key,
          text: item.required ? `${item.key} (required)` : item.key
        }))
      },
      {
        key: "extra",
        title: `Not in the spec (${check.extra.length})`,
        items: check.extra.map((key) => ({ key, text: key }))
      }
    ].map((list) => ({ ...list, isEmpty: list.items.length === 0 }));
    return {
      lists,
      summary: `Checked against the status ${status} schema: ${check.present.length} documented keys present, ${check.missing.length} missing (${requiredMissing.length} required), ${check.extra.length} not in the spec.`
    };
  }

  get hasSchemaLists() {
    return Boolean(this.schemaCheck && this.schemaCheck.lists);
  }

  get isRawView() {
    return this.bodyView === VIEW_RAW;
  }

  get rawPressed() {
    return this.isRawView ? "true" : "false";
  }

  get renderedPressed() {
    return this.isRawView ? "false" : "true";
  }

  get rawViewClass() {
    return this.isRawView ? "view-button view-button_selected" : "view-button";
  }

  get renderedViewClass() {
    return this.isRawView ? "view-button" : "view-button view-button_selected";
  }

  get renderedFields() {
    return longTextFields(this.lastBody).map((field, index) => ({
      ...field,
      key: `${index}-${field.path}`
    }));
  }

  get hasRenderedFields() {
    return this.renderedFields.length > 0;
  }

  handleViewClick(event) {
    const view = event.currentTarget.dataset.view;
    if (view === VIEW_RAW || view === VIEW_RENDERED) {
      this.bodyView = view;
    }
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
      ["access_token", "token_type", "instance_url", "docs"]
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

  handleVersionChange(event) {
    const value = event.target.value;
    this.apiVersion = API_VERSIONS.some((option) => option.value === value)
      ? value
      : DEFAULT_VERSION;
    // The shown answer belongs to the version that made it.
    this.result = undefined;
    this.invokeError = "";
  }

  handleEndpointChange(event) {
    this.selectedPath = event.target.value;
    // The controls belong to a path. The Advanced text stays, as it always has.
    this.paramValues = {};
  }

  setParam(name, value) {
    const next = { ...this.paramValues };
    if (value === undefined || value === null || value === "") {
      delete next[name];
    } else {
      next[name] = String(value);
    }
    this.paramValues = next;
  }

  /** A pill pressed again clears its parameter. */
  handlePillClick(event) {
    const { name, value } = event.currentTarget.dataset;
    this.setParam(name, this.paramValues[name] === value ? "" : value);
  }

  handleParamInput(event) {
    this.setParam(event.target.dataset.name, String(event.target.value).trim());
  }

  handleRemovePill(event) {
    this.setParam(event.currentTarget.dataset.name, "");
  }

  handleQueryChange(event) {
    this.queryText = event.target.value;
  }

  handleTokenInput(event) {
    const field = event.target.dataset.field;
    if (field === "email" || field === "purpose") {
      this[field] = event.target.value;
    }
    // A shown email error clears as soon as the address reads right.
    if (field === "email" && this.emailError && !this.emailProblem()) {
      this.emailError = "";
    }
  }

  /** Leaving the email field checks it, as the platform's email field did. */
  handleEmailCommit(event) {
    this.email = event.target.value;
    this.emailError = this.emailProblem();
  }

  /** The email error, or "" when the field is empty or reads as an address. */
  emailProblem() {
    const email = (this.email || "").trim();
    if (!email) {
      return "";
    }
    return email.length > MAX_EMAIL || !EMAIL_PATTERN.test(email)
      ? EMAIL_ERROR
      : "";
  }

  get emailInvalid() {
    return this.emailError ? "true" : undefined;
  }

  get hasPostmanRun() {
    return isPostmanRunUrl(this.postmanRunUrl);
  }

  /** The curl examples, filled with the issued token once there is one. */
  get curlExamples() {
    const origin =
      typeof window !== "undefined" && window.location
        ? window.location.origin
        : "";
    const token = this.tokenIssued ? this.tokenResult.token : undefined;
    return buildCurlExamples(origin, token);
  }

  handleCollectionDownload() {
    trackEvent(EVENTS.POSTMAN_COLLECTION_DOWNLOADED, {
      source: ANALYTICS_SOURCE
    });
  }

  handlePostmanRun() {
    trackEvent(EVENTS.POSTMAN_RUN_CLICKED, { source: ANALYTICS_SOURCE });
  }

  /**
   * Copies one curl example. Sends curl_copied with only which example, never its text. The
   * result is read out through the status line.
   */
  async handleCopyCurl(event) {
    const key = event.currentTarget.dataset.example;
    const example = this.curlExamples.find((entry) => entry.key === key);
    if (!example) {
      return;
    }
    this.copyStatus = "";
    let copied = false;
    try {
      if (
        typeof navigator !== "undefined" &&
        navigator.clipboard &&
        typeof navigator.clipboard.writeText === "function"
      ) {
        await navigator.clipboard.writeText(example.text);
        copied = true;
      }
    } catch {
      copied = false;
    }
    this.copyStatus = copied ? COPY_DONE : COPY_FAILED;
    if (copied) {
      trackEvent(EVENTS.CURL_COPIED, { example: key });
    }
  }

  /** Moves offset on by one page, keeps the limit, and calls again. */
  handleNextPage() {
    const entry = this.currentEntry;
    const merged = this.mergedParams;
    const limitParam = entry.params.find((param) => param.name === "limit");
    const body = this.lastBody;
    const limit =
      Number(merged.limit) ||
      (limitParam && Number(limitParam.default)) ||
      (Array.isArray(body) ? body.length : 0);
    const offset = Number(merged.offset) || 0;
    // The Advanced text would win over the new offset, so its offset goes.
    const advanced = parseQuery(this.queryText);
    if (advanced.offset !== undefined) {
      delete advanced.offset;
      this.queryText = buildQueryString(advanced).replace(/^\?/, "");
    }
    this.setParam("offset", offset + limit);
    this.handleExecute();
  }

  async handleExecute() {
    if (this.isExecuteDisabled) {
      return;
    }
    this.isLoading = true;
    this.invokeError = "";
    this.result = undefined;
    const path = this.selectedPath;
    const params = this.mergedParams;
    const paramCount = Object.keys(params).length;
    try {
      this.result = await invoke({
        path,
        params,
        apiVersion: this.apiVersion
      });
      trackEvent(EVENTS.API_TEST_EXECUTED, {
        path,
        status: this.result?.statusCode,
        param_count: paramCount
      });
    } catch (error) {
      this.invokeError = reduceError(error);
      trackEvent(EVENTS.API_TEST_EXECUTED, {
        path,
        status: STATUS_CALL_FAILED,
        param_count: paramCount
      });
    } finally {
      this.isLoading = false;
      this.revealPending = this.isPhone;
    }
  }

  async handleRequestToken() {
    if (this.isTokenDisabled) {
      return;
    }
    // A mistyped address is answered here, with focus on the field so its message is read.
    this.emailError = this.emailProblem();
    if (this.emailError) {
      // After the render that adds the message, so the field is read with it.
      Promise.resolve().then(() => {
        const field = this.template.querySelector("input.token-email");
        if (field) {
          field.focus();
        }
      });
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
