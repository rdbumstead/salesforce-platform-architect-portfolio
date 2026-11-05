/**
 * The browser side of the site's own /api functions.
 *
 * createRequestHandler returns the function apex.js calls for each request time Apex call.
 * It looks up the call's route, checks the switch from /api/features, adds the Turnstile
 * token to the two forms, and turns a failure into the { status, body: { message } } shape
 * the components already read from an Apex error.
 *
 * A switch that reads `recorded` never reaches a function. The call answers from the files
 * the build wrote under /recorded, or says plainly that nothing was recorded. If
 * /api/features cannot be read (a host with no functions), every switch reads recorded.
 */

export const FEATURES_URL = "/api/features";
export const RECORDED_COVER_LETTER = "/recorded/cover-letter.json";
export const RECORDED_LAB = "/recorded/lab/index.json";
export const RECORDED_GLASS_BOX = "/recorded/glass-box.json";

export const RECORDED_ONLY = "recorded";
export const ALL_RECORDED = {
  contact: RECORDED_ONLY,
  testimonial: RECORDED_ONLY,
  coverLetter: RECORDED_ONLY,
  apiLab: RECORDED_ONLY,
  liveReads: RECORDED_ONLY
};

export const MESSAGES = {
  noRecordedLab: "No recorded API responses are in this build.",
  noRecordedCall: "This call was not recorded in this build.",
  noToken: "Evaluator tokens are only issued by the live site.",
  noLive:
    "The live reading is switched off, so this shows the build time snapshot only.",
  noCoverLetter: "The sample cover letter is not in this build.",
  network: "The request could not be sent. Check your connection and try again."
};

/** Request time call to route. `turnstile` adds the token, `feature` is the switch that gates it. */
export const ROUTES = {
  "ContactFormController.submitContact": {
    feature: "contact",
    url: "/api/contact",
    method: "POST",
    turnstile: true
  },
  "TestimonialController.submitTestimonial": {
    feature: "testimonial",
    url: "/api/testimonial",
    method: "POST",
    turnstile: true,
    extra: { mode: "fragments" }
  },
  "TestimonialController.submitOwnTestimonial": {
    feature: "testimonial",
    url: "/api/testimonial",
    method: "POST",
    turnstile: true,
    extra: { mode: "own" }
  },
  "ApiLabController.generateCoverLetter": {
    feature: "coverLetter",
    url: "/api/cover-letter",
    method: "POST"
  },
  "ApiLabController.invokeVersioned": {
    feature: "apiLab",
    url: "/api/lab/invoke",
    method: "POST"
  },
  "ApiLabController.requestEvaluatorToken": {
    feature: "apiLab",
    url: "/api/lab/token",
    method: "POST"
  },
  "FooterController.getSystemSnapshot": {
    feature: "liveReads",
    url: "/api/live/glass-box",
    method: "GET"
  },
  "GovernanceController.getPipelineStatus": {
    feature: "liveReads",
    url: "/api/live/pipeline-status",
    method: "GET"
  }
};

export function apexError(message, status = 503) {
  return { status, body: { message }, ok: false, statusText: "Unavailable" };
}

/** The key a recorded API Lab call is filed under. Parameter names are sorted. */
export function labKey(params) {
  const given = (params && params.params) || {};
  const sorted = Object.keys(given)
    .sort()
    .map((name) => [name, String(given[name])]);
  return `${(params && params.apiVersion) || "v2"} ${(params && params.path) || ""} ${JSON.stringify(sorted)}`;
}

export function createRequestHandler(options = {}) {
  const doFetch = options.fetch || ((...args) => fetch(...args));
  const getToken = options.turnstileToken || (() => Promise.resolve(null));
  let featuresPromise = null;

  const features = () => {
    if (!featuresPromise) {
      featuresPromise = doFetch(FEATURES_URL, {
        headers: { Accept: "application/json" }
      })
        .then((response) => (response.ok ? response.json() : ALL_RECORDED))
        .then((value) => ({ ...ALL_RECORDED, ...value }))
        .catch(() => ALL_RECORDED);
    }
    return featuresPromise;
  };

  const readJson = (url) =>
    doFetch(url, { headers: { Accept: "application/json" } }).then(
      (response) => (response.ok ? response.json() : undefined)
    );

  async function recorded(call, params) {
    if (call === "ApiLabController.generateCoverLetter") {
      const letter = await readJson(RECORDED_COVER_LETTER).catch(
        () => undefined
      );
      if (!letter) throw apexError(MESSAGES.noCoverLetter, 404);
      return letter;
    }
    if (call === "ApiLabController.invokeVersioned") {
      const index = await readJson(RECORDED_LAB).catch(() => undefined);
      if (!index || !index.calls) throw apexError(MESSAGES.noRecordedLab, 404);
      const hit = index.calls[labKey(params)];
      if (!hit) throw apexError(MESSAGES.noRecordedCall, 404);
      return hit;
    }
    if (call === "ApiLabController.requestEvaluatorToken")
      throw apexError(MESSAGES.noToken, 503);
    if (call === "FooterController.getSystemSnapshot") {
      const saved = await readJson(RECORDED_GLASS_BOX).catch(() => undefined);
      if (!saved || !saved.snapshot) throw apexError(MESSAGES.noLive, 503);
      return {
        ...saved.snapshot,
        recorded: true,
        recordedAt: saved.recordedAt,
        ...(saved.sample === true ? { sample: true } : {})
      };
    }
    if (call === "GovernanceController.getPipelineStatus")
      throw apexError(MESSAGES.noLive, 503);
    throw apexError("This feature is switched off right now.", 503);
  }

  async function handle(call, params) {
    const route = ROUTES[call];
    if (!route)
      throw apexError(
        "This section is not available on the static site yet.",
        503
      );
    const state = await features();
    if (state[route.feature] !== "live") return recorded(call, params);
    let body;
    if (route.method === "POST") {
      body = { ...(params || {}), ...(route.extra || {}) };
      if (route.turnstile) {
        const token = await getToken().catch(() => null);
        if (!token)
          throw apexError(
            "The check that you are a person could not be run. Reload the page and try again.",
            503
          );
        body.turnstileToken = token;
      }
    }
    let response;
    try {
      response = await doFetch(route.url, {
        method: route.method,
        headers:
          route.method === "POST"
            ? { "Content-Type": "application/json", Accept: "application/json" }
            : { Accept: "application/json" },
        body: route.method === "POST" ? JSON.stringify(body) : undefined
      });
    } catch (error) {
      throw apexError(MESSAGES.network, 503);
    }
    const payload = await response.json().catch(() => null);
    if (
      response.ok &&
      payload &&
      Object.prototype.hasOwnProperty.call(payload, "result")
    )
      return payload.result;
    const message =
      payload && typeof payload.message === "string"
        ? payload.message
        : MESSAGES.network;
    throw apexError(message, response.status || 503);
  }

  // The page mount reads the switches through the same single request.
  handle.features = features;
  return handle;
}
