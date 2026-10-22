/**
 * @description       : Unit tests for coverLetterGenerator LWC. ApiLabController.generateCoverLetter
 *                      is mocked with the shape the controller returns. The badge and the panel
 *                      must show what the mock returns and nothing the component makes up.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 01/03/2026
 **/
import { readFileSync } from "fs";
import { join } from "path";
import { createElement } from "@lwc/engine-dom";
import CoverLetterGenerator from "c/coverLetterGenerator";
import generateCoverLetter from "@salesforce/apex/ApiLabController.generateCoverLetter";
import { trackEvent } from "c/analyticsService";

jest.mock(
  "@salesforce/apex/ApiLabController.generateCoverLetter",
  () => ({ default: jest.fn() }),
  { virtual: true }
);

jest.mock(
  "c/analyticsService",
  () => ({
    trackEvent: jest.fn(),
    EVENTS: {
      AI_GENERATION_COMPLETED: "ai_generation_completed",
      AI_COMPLETE_FAILURE: "ai_complete_failure"
    }
  }),
  { virtual: true }
);

const GEMINI_RESULT = {
  content: "Dear Hiring Manager,\n\nI build integrations.",
  provider: "Gemini",
  model: "gemma-4-31b-it",
  fallbackOccurred: false,
  latencyMs: 2140,
  generationMs: 1980,
  attempts: [
    { provider: "Agentforce", outcome: "skipped_off", ms: 0 },
    { provider: "Gemini", outcome: "served", ms: 1975 }
  ],
  promptShown: "Write a cover letter for Ryan Bumstead\ncompanyName: Acme",
  requestId: "11111111-2222-4333-8444-555555555555"
};

const LOCAL_RESULT = {
  content: "Dear Hiring Manager at Acme",
  provider: "Local",
  model: "local-template",
  fallbackOccurred: true,
  latencyMs: 640,
  generationMs: 600,
  attempts: [
    { provider: "Agentforce", outcome: "skipped_off", ms: 0 },
    { provider: "Gemini", outcome: "failed", ms: 59000 },
    { provider: "Local", outcome: "served", ms: 1 }
  ],
  promptShown: null,
  requestId: "22222222-2222-4333-8444-555555555555"
};

// The live finding of log 129: the model attempt failed in 2 ms, before any request left.
const UNREACHABLE_RESULT = {
  ...LOCAL_RESULT,
  attempts: [
    { provider: "Agentforce", outcome: "skipped_off", ms: 0 },
    {
      provider: "Gemini",
      outcome: "failed",
      ms: 2,
      detail: "CalloutException: Unauthorized endpoint"
    },
    { provider: "Local", outcome: "served", ms: 0 }
  ]
};

// Provider and tier words the component may never print on its own. The tier words are split
// so the repository wording grep (PD-D10) finds none of them in source.
const PROVIDER_WORDS = new RegExp(
  [
    "Agentforce",
    "Gemini",
    ["Go", "ld"].join(""),
    ["Sil", "ver"].join(""),
    ["Bro", "nze"].join("")
  ].join("|")
);

const flushPromises = () => new Promise((resolve) => process.nextTick(resolve));

function createComponent() {
  const element = createElement("c-cover-letter-generator", {
    is: CoverLetterGenerator
  });
  document.body.appendChild(element);
  return element;
}

function query(element, selector) {
  return element.shadowRoot.querySelector(selector);
}

function setInput(element, selector, value) {
  const input = query(element, selector);
  input.value = value;
  input.dispatchEvent(new CustomEvent("change"));
}

async function fillAndGenerate(element) {
  setInput(element, "lightning-input.company-input", "Acme");
  setInput(element, "lightning-input.title-input", "Architect");
  setInput(element, "lightning-textarea.description-input", "Apex and APIs");
  await flushPromises();
  query(element, "button.generate-button").click();
  await flushPromises();
  await flushPromises();
}

describe("c-cover-letter-generator", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    jest.clearAllMocks();
  });

  it("marks company and title as required with its own marker and accessible labels", async () => {
    const element = createComponent();
    await flushPromises();

    for (const [selector, label, field] of [
      ["lightning-input.company-input", "Company Name", "companyName"],
      ["lightning-input.title-input", "Job Title", "jobTitle"]
    ]) {
      const input = query(element, selector);
      // K9: the base asterisk fails contrast on the dark branding, so the base fields
      // are not flagged required. Their accessible name says it instead.
      expect(input.label).toBe(`${label} (required)`);
      expect(input.variant).toBe("label-hidden");
      expect(input.required).toBeFalsy();
      expect(query(element, `[data-id="required-${field}"]`).textContent).toBe(
        "*"
      );
    }
  });

  it("tells the visitor about the wait before they click", async () => {
    const element = createComponent();
    await flushPromises();

    const note = query(element, '[data-id="wait-note"]').textContent;
    expect(note).toContain("about a minute");
    expect(note).toContain("template letter");
  });

  it("shows the status line only while loading, inside a polite live region", async () => {
    let resolveCall;
    generateCoverLetter.mockReturnValue(
      new Promise((resolve) => {
        resolveCall = resolve;
      })
    );
    const element = createComponent();
    await flushPromises();
    const region = query(element, '[data-id="status-region"]');
    expect(region.getAttribute("aria-live")).toBe("polite");
    expect(query(element, '[data-id="status-line"]')).toBeNull();

    await fillAndGenerate(element);
    const line = query(element, '[data-id="status-line"]');
    expect(line.textContent.trim()).toBe(
      "Writing your letter. This can take about a minute."
    );
    expect(region.contains(line)).toBe(true);

    resolveCall(GEMINI_RESULT);
    await flushPromises();
    await flushPromises();
    expect(query(element, '[data-id="status-line"]')).toBeNull();
  });

  it("explains a template letter only when the local template served", async () => {
    generateCoverLetter.mockResolvedValue(LOCAL_RESULT);
    const local = createComponent();
    await fillAndGenerate(local);
    expect(query(local, '[data-id="fallback-note"]').textContent).toContain(
      "busy or too slow"
    );
    document.body.removeChild(local);

    generateCoverLetter.mockResolvedValue(GEMINI_RESULT);
    const live = createComponent();
    await fillAndGenerate(live);
    expect(query(live, '[data-id="fallback-note"]')).toBeNull();
  });

  it("keeps Generate disabled until company and title are set", async () => {
    const element = createComponent();
    await flushPromises();
    const button = query(element, "button.generate-button");
    expect(button.disabled).toBe(true);

    setInput(element, "lightning-input.company-input", "Acme");
    await flushPromises();
    expect(button.disabled).toBe(true);

    setInput(element, "lightning-input.title-input", "Architect");
    await flushPromises();
    expect(button.disabled).toBe(false);
  });

  it("names no provider before a result arrives", async () => {
    const element = createComponent();
    await flushPromises();

    const label = query(element, "button.generate-button").textContent.trim();
    expect(label).toBe("Generate");
    expect(element.shadowRoot.textContent).not.toMatch(PROVIDER_WORDS);
    expect(query(element, '[data-id="provider-badge"]')).toBeNull();
  });

  it("sends the trimmed inputs to the Apex proxy", async () => {
    generateCoverLetter.mockResolvedValue(GEMINI_RESULT);
    const element = createComponent();
    setInput(element, "lightning-input.company-input", "  Acme ");
    setInput(element, "lightning-input.title-input", " Architect");
    await flushPromises();

    query(element, "button.generate-button").click();
    await flushPromises();

    expect(generateCoverLetter).toHaveBeenCalledWith({
      companyName: "Acme",
      jobTitle: "Architect",
      jobDescription: ""
    });
  });

  it("renders the badge from the provider and model the Apex call returned", async () => {
    generateCoverLetter.mockResolvedValue(GEMINI_RESULT);
    const element = createComponent();
    await fillAndGenerate(element);

    expect(query(element, '[data-id="provider-badge"]').textContent).toBe(
      "Gemini (gemma-4-31b-it)"
    );
    expect(query(element, '[data-id="letter"]').textContent).toBe(
      GEMINI_RESULT.content
    );
  });

  it("shows Local when the mock says Local, never a provider it did not return", async () => {
    generateCoverLetter.mockResolvedValue(LOCAL_RESULT);
    const element = createComponent();
    await fillAndGenerate(element);

    const badge = query(element, '[data-id="provider-badge"]').textContent;
    expect(badge).toBe("Local (local-template)");
    expect(badge).not.toMatch(/Agentforce|Gemini/);
  });

  it("opens the show-your-work panel only when the visitor asks", async () => {
    generateCoverLetter.mockResolvedValue(GEMINI_RESULT);
    const element = createComponent();
    await fillAndGenerate(element);

    const toggle = query(element, "button.work-toggle");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(query(element, '[data-id="work-panel"]')).toBeNull();

    toggle.click();
    await flushPromises();

    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(query(element, '[data-id="work-provider"]').textContent).toBe(
      "Gemini"
    );
    expect(query(element, '[data-id="work-model"]').textContent).toBe(
      "gemma-4-31b-it"
    );
    expect(query(element, '[data-id="work-fallback"]').textContent).toBe("No");
    expect(query(element, '[data-id="work-latency"]').textContent).toBe(
      "2140 ms"
    );
    expect(query(element, '[data-id="work-generation"]').textContent).toBe(
      "1980 ms"
    );
    expect(query(element, '[data-id="prompt"]').textContent).toBe(
      GEMINI_RESULT.promptShown
    );
    const attempts = Array.from(
      element.shadowRoot.querySelectorAll("li.attempt-row")
    ).map((row) => row.textContent);
    expect(attempts).toEqual([
      "Agentforce: skipped_off, 0 ms",
      "Gemini: served, 1975 ms"
    ]);
  });

  it("says the local template uses no prompt when none was sent", async () => {
    generateCoverLetter.mockResolvedValue(LOCAL_RESULT);
    const element = createComponent();
    await fillAndGenerate(element);
    query(element, "button.work-toggle").click();
    await flushPromises();

    expect(query(element, '[data-id="prompt"]')).toBeNull();
    expect(query(element, '[data-id="no-prompt"]')).not.toBeNull();
    expect(query(element, '[data-id="work-fallback"]').textContent).toBe("Yes");
  });

  it("shows the controller message when the call fails", async () => {
    generateCoverLetter.mockRejectedValue({
      body: {
        message:
          "Too many cover letters were requested in the last minute. Try again in a minute."
      }
    });
    const element = createComponent();
    await fillAndGenerate(element);

    const error = query(element, ".error-text");
    expect(error.getAttribute("role")).toBe("alert");
    expect(error.textContent).toBe(
      "Too many cover letters were requested in the last minute. Try again in a minute."
    );
    expect(query(element, '[data-id="provider-badge"]')).toBeNull();
  });

  it("falls back to a plain message when the error has no body", async () => {
    generateCoverLetter.mockRejectedValue(undefined);
    const element = createComponent();
    await fillAndGenerate(element);

    expect(query(element, ".error-text").textContent).toBe(
      "The cover letter could not be written. Try again later."
    );
  });

  it("uses no timer and no provider literal in its source", () => {
    const source = readFileSync(
      join(__dirname, "..", "coverLetterGenerator.js"),
      "utf8"
    );
    const template = readFileSync(
      join(__dirname, "..", "coverLetterGenerator.html"),
      "utf8"
    );
    expect(source).not.toMatch(/setTimeout|setInterval/);
    expect(source + template).not.toMatch(PROVIDER_WORDS);
  });

  it("says the model could not be reached when its attempt failed in under a second", async () => {
    generateCoverLetter.mockResolvedValue(UNREACHABLE_RESULT);
    const element = createComponent();
    await fillAndGenerate(element);

    const note = query(element, '[data-id="fallback-note"]').textContent;
    expect(note).toContain("could not be reached");
    expect(note).not.toContain("busy or too slow");
  });

  it("keeps busy or too slow when the model attempt took a second or more", async () => {
    generateCoverLetter.mockResolvedValue(LOCAL_RESULT);
    const element = createComponent();
    await fillAndGenerate(element);

    const note = query(element, '[data-id="fallback-note"]').textContent;
    expect(note).toContain("busy or too slow");
    expect(note).not.toContain("could not be reached");
  });

  it("shows an attempt detail only when the result carries one", async () => {
    generateCoverLetter.mockResolvedValue(UNREACHABLE_RESULT);
    const element = createComponent();
    await fillAndGenerate(element);
    query(element, "button.work-toggle").click();
    await flushPromises();

    const attempts = Array.from(
      element.shadowRoot.querySelectorAll("li.attempt-row")
    ).map((row) => row.textContent);
    expect(attempts[1]).toBe(
      "Gemini: failed, 2 ms (CalloutException: Unauthorized endpoint)"
    );
    expect(attempts[2]).toBe("Local: served, 0 ms");
  });

  it("sends ai_generation_completed with the result fields", async () => {
    generateCoverLetter.mockResolvedValue(GEMINI_RESULT);
    const live = createComponent();
    await fillAndGenerate(live);
    expect(trackEvent).toHaveBeenCalledWith("ai_generation_completed", {
      provider: "Gemini",
      model: "gemma-4-31b-it",
      fallback: false,
      latency_ms: 2140,
      outcome: "live"
    });
    document.body.removeChild(live);

    trackEvent.mockClear();
    generateCoverLetter.mockResolvedValue(UNREACHABLE_RESULT);
    const unreachable = createComponent();
    await fillAndGenerate(unreachable);
    expect(trackEvent).toHaveBeenCalledWith(
      "ai_generation_completed",
      expect.objectContaining({
        fallback: true,
        outcome: "template_unreachable"
      })
    );
    document.body.removeChild(unreachable);

    trackEvent.mockClear();
    generateCoverLetter.mockResolvedValue(LOCAL_RESULT);
    const slow = createComponent();
    await fillAndGenerate(slow);
    expect(trackEvent).toHaveBeenCalledWith(
      "ai_generation_completed",
      expect.objectContaining({ outcome: "template_slow" })
    );
  });

  it("sends ai_complete_failure with a message kind and never the message", async () => {
    generateCoverLetter.mockRejectedValue({
      body: {
        message:
          "Too many cover letters were requested in the last minute. Try again in a minute."
      }
    });
    const element = createComponent();
    await fillAndGenerate(element);

    expect(trackEvent).toHaveBeenCalledTimes(1);
    expect(trackEvent).toHaveBeenCalledWith("ai_complete_failure", {
      message_kind: "rate_limited"
    });
  });

  it("sorts error messages into message kinds", async () => {
    const { messageKind } = await import("c/coverLetterGenerator");
    expect(
      messageKind("No AI provider is available right now. Try again later.")
    ).toBe("no_provider");
    expect(messageKind("Company name is required.")).toBe("invalid_input");
    expect(messageKind("Job title can be at most 120 characters.")).toBe(
      "invalid_input"
    );
    expect(messageKind(undefined)).toBe("other");
  });

  it("gives the Generate button a 44 px minimum height", () => {
    const css = readFileSync(
      join(__dirname, "..", "coverLetterGenerator.css"),
      "utf8"
    );
    expect(css).toMatch(/\.generate-button \{[^}]*min-height: 44px/);
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}/);
  });
});
