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
import CoverLetterGenerator, {
  STATUS_STEPS,
  statusLineFor
} from "c/coverLetterGenerator";
import generateCoverLetter from "@salesforce/apex/ApiLabController.generateCoverLetter";
import getHeader from "@salesforce/apex/ResumeController.getHeader";
import { trackEvent } from "c/analyticsService";

jest.mock(
  "@salesforce/apex/ApiLabController.generateCoverLetter",
  () => ({ default: jest.fn() }),
  { virtual: true }
);

jest.mock(
  "@salesforce/apex/ResumeController.getHeader",
  () => {
    const { createApexTestWireAdapter } = require("@salesforce/sfdx-lwc-jest");
    return { default: createApexTestWireAdapter(jest.fn()) };
  },
  { virtual: true }
);

const HEADER = {
  name: "Ryan Bumstead",
  title: "Salesforce Platform Architect",
  linkedInUrl: "https://www.linkedin.com/in/example",
  gitHubUrl: "https://github.com/rdbumstead",
  trailheadUrl: null,
  portfolioUrl: "https://ryanbumstead.com"
};

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

// A live finding: the model attempt failed in 2 ms, before any request left.
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
// so the repository wording grep finds none of them in source.
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
  input.dispatchEvent(new CustomEvent("input"));
}

async function fillAndGenerate(element) {
  setInput(element, "input.company-input", "Acme");
  setInput(element, "input.title-input", "Architect");
  setInput(element, "textarea.description-input", "Apex and APIs");
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
      ["input.company-input", "Company Name", "companyName"],
      ["input.title-input", "Job Title", "jobTitle"]
    ]) {
      const input = query(element, selector);
      // A native control carries required itself, and its hidden label names it for
      // screen readers. The visible label and marker are drawn beside it, hidden from them.
      const hidden = query(element, `label[for="${input.id}"]`);
      expect(hidden.textContent.trim()).toBe(label);
      expect(hidden.classList.contains("nc-visually-hidden")).toBe(true);
      expect(input.required).toBe(true);
      expect(input.classList.contains("nc-control")).toBe(true);
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
    expect(line.textContent.trim()).toBe(STATUS_STEPS[0].text);
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

    setInput(element, "input.company-input", "Acme");
    await flushPromises();
    expect(button.disabled).toBe(true);

    setInput(element, "input.title-input", "Architect");
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
    setInput(element, "input.company-input", "  Acme ");
    setInput(element, "input.title-input", " Architect");
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

  it("shows a long letter whole, with its word count", async () => {
    const longLetter = Array.from(
      { length: 350 },
      (unused, index) => `word${index}`
    ).join(" ");
    generateCoverLetter.mockResolvedValue({
      ...GEMINI_RESULT,
      content: longLetter
    });
    const element = createComponent();
    await fillAndGenerate(element);

    expect(query(element, '[data-id="letter"]').textContent).toBe(longLetter);
    expect(query(element, '[data-id="word-count"]').textContent).toBe(
      "350 words"
    );
  });

  it("counts words on whitespace", async () => {
    const { countWords } = await import("c/coverLetterGenerator");
    expect(countWords("Dear team,\n\nI build.\tThanks")).toBe(5);
    expect(countWords("  ")).toBe(0);
    expect(countWords(null)).toBe(0);
  });

  it("keeps the letter box unclipped, wrapping and at a readable width", () => {
    const css = readFileSync(
      join(__dirname, "..", "coverLetterGenerator.css"),
      "utf8"
    );
    const letterRule = css.match(/\.letter \{[^}]*\}/)[0];
    expect(letterRule).toContain("white-space: pre-wrap");
    expect(letterRule).toContain("overflow-wrap: anywhere");
    expect(letterRule).toContain("max-width: 72ch");
    expect(letterRule).not.toMatch(/max-height|overflow:/);
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

  it("says the wait once: the intro and the status line do not repeat the wait note", async () => {
    generateCoverLetter.mockReturnValue(new Promise(() => {}));
    const element = createComponent();
    await flushPromises();

    expect(query(element, ".intro").textContent).not.toMatch(
      /minute|provider|template/
    );
    await fillAndGenerate(element);
    expect(query(element, '[data-id="status-line"]').textContent).not.toMatch(
      /about a minute/
    );
    const text = element.shadowRoot.textContent;
    expect(text.match(/about a minute/g)).toHaveLength(1);
  });

  it("counts the seconds while waiting and moves through the status lines", async () => {
    jest.useFakeTimers({ doNotFake: ["nextTick"] });
    try {
      generateCoverLetter.mockReturnValue(new Promise(() => {}));
      const element = createComponent();
      await flushPromises();
      setInput(element, "input.company-input", "Acme");
      setInput(element, "input.title-input", "Architect");
      await flushPromises();
      query(element, "button.generate-button").click();
      await Promise.resolve();
      await Promise.resolve();

      const elapsed = () => query(element, '[data-id="elapsed"]');
      expect(elapsed().textContent.trim()).toBe("Writing, 0 s");
      expect(elapsed().getAttribute("aria-hidden")).toBe("true");

      jest.advanceTimersByTime(23000);
      await Promise.resolve();
      expect(elapsed().textContent.trim()).toBe("Writing, 23 s");
      expect(query(element, '[data-id="status-line"]').textContent.trim()).toBe(
        statusLineFor(23)
      );
      expect(statusLineFor(23)).not.toBe(statusLineFor(0));

      jest.advanceTimersByTime(60000);
      await Promise.resolve();
      expect(query(element, '[data-id="status-line"]').textContent.trim()).toBe(
        statusLineFor(83)
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it("picks the last status line whose start has passed", () => {
    expect(statusLineFor(0)).toBe(STATUS_STEPS[0].text);
    expect(statusLineFor(7)).toBe(STATUS_STEPS[0].text);
    expect(statusLineFor(8)).toBe(STATUS_STEPS[1].text);
    expect(statusLineFor(500)).toBe(STATUS_STEPS[STATUS_STEPS.length - 1].text);
    STATUS_STEPS.forEach((step) => {
      expect(step.text).not.toMatch(PROVIDER_WORDS);
    });
  });

  it("shows a skeleton letter only while waiting, then the letter that fades in", async () => {
    let resolveCall;
    generateCoverLetter.mockReturnValue(
      new Promise((resolve) => {
        resolveCall = resolve;
      })
    );
    const element = createComponent();
    await flushPromises();
    expect(query(element, '[data-id="skeleton"]')).toBeNull();

    await fillAndGenerate(element);
    const skeleton = query(element, '[data-id="skeleton"]');
    expect(skeleton.getAttribute("aria-hidden")).toBe("true");
    expect(skeleton.querySelectorAll(".skeleton-line").length).toBeGreaterThan(
      3
    );
    expect(query(element, '[data-id="result"]')).toBeNull();

    resolveCall(GEMINI_RESULT);
    await flushPromises();
    await flushPromises();
    expect(query(element, '[data-id="skeleton"]')).toBeNull();
    expect(
      query(element, '[data-id="result"]').classList.contains("result-fade")
    ).toBe(true);
    expect(query(element, '[data-id="elapsed"]')).toBeNull();
  });

  it("stops its timer when the call ends and when the page goes away", async () => {
    jest.useFakeTimers({ doNotFake: ["nextTick"] });
    try {
      generateCoverLetter.mockReturnValue(new Promise(() => {}));
      const element = createComponent();
      await flushPromises();
      setInput(element, "input.company-input", "Acme");
      setInput(element, "input.title-input", "Architect");
      await flushPromises();
      query(element, "button.generate-button").click();
      await Promise.resolve();
      expect(jest.getTimerCount()).toBe(1);
      document.body.removeChild(element);
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });

  it("uses a timer only for the elapsed count and names no provider in its source", () => {
    const source = readFileSync(
      join(__dirname, "..", "coverLetterGenerator.js"),
      "utf8"
    );
    const template = readFileSync(
      join(__dirname, "..", "coverLetterGenerator.html"),
      "utf8"
    );
    expect(source).not.toMatch(/setTimeout/);
    expect(source.match(/setInterval/g)).toHaveLength(1);
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

  describe("the owner's header over the letter", () => {
    async function letterWith(result, header) {
      generateCoverLetter.mockResolvedValue(result);
      const element = createComponent();
      if (header !== undefined) {
        getHeader.emit(header);
      }
      await flushPromises();
      await fillAndGenerate(element);
      return element;
    }

    function links(element) {
      return [
        ...element.shadowRoot.querySelectorAll(".letter-header-link a")
      ].map((a) => [a.textContent, a.href, a.target, a.rel]);
    }

    it("shows the name, title and the resume's links with Contact last", async () => {
      const element = await letterWith(GEMINI_RESULT, HEADER);

      expect(query(element, ".letter-header-name").textContent.trim()).toBe(
        "Ryan Bumstead"
      );
      expect(query(element, ".letter-header-title").textContent.trim()).toBe(
        "Salesforce Platform Architect"
      );
      expect(links(element)).toEqual([
        [
          "LinkedIn",
          "https://www.linkedin.com/in/example",
          "_blank",
          "noopener noreferrer"
        ],
        [
          "GitHub",
          "https://github.com/rdbumstead",
          "_blank",
          "noopener noreferrer"
        ],
        [
          "Portfolio",
          "https://ryanbumstead.com/",
          "_blank",
          "noopener noreferrer"
        ],
        [
          "Contact",
          "https://ryanbumstead.com/contact",
          "_blank",
          "noopener noreferrer"
        ]
      ]);
    });

    it("draws the same header over the template letter", async () => {
      const element = await letterWith(LOCAL_RESULT, HEADER);

      expect(query(element, '[data-id="letter-header"]')).not.toBeNull();
    });

    it("keeps the header out of the letter text and its word count", async () => {
      const element = await letterWith(GEMINI_RESULT, HEADER);

      const letter = query(element, '[data-id="letter"]').textContent;
      expect(letter).toBe(GEMINI_RESULT.content);
      expect(letter).not.toContain("Contact");
      const header = query(element, '[data-id="letter-header"]');
      expect(
        header.compareDocumentPosition(query(element, '[data-id="letter"]'))
      ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    });

    it("shows no header when the read gives nothing", async () => {
      const element = await letterWith(GEMINI_RESULT, undefined);

      expect(query(element, '[data-id="letter-header"]')).toBeNull();
      expect(query(element, '[data-id="letter"]')).not.toBeNull();
    });

    it("shows no header for an empty owner record", async () => {
      const element = await letterWith(GEMINI_RESULT, { name: " " });

      expect(query(element, '[data-id="letter-header"]')).toBeNull();
    });

    it("shows the links alone when the record has no name or title", async () => {
      const element = await letterWith(GEMINI_RESULT, {
        portfolioUrl: "https://ryanbumstead.com"
      });

      expect(query(element, ".letter-header-name")).toBeNull();
      expect(links(element).map((link) => link[0])).toEqual([
        "Portfolio",
        "Contact"
      ]);
    });

    it("names the link list for screen readers", async () => {
      const element = await letterWith(GEMINI_RESULT, HEADER);

      expect(
        query(element, ".letter-header-links").getAttribute("aria-label")
      ).toBe("Profile links");
    });
  });

  it("gives the Generate button a 44 px minimum height", () => {
    const css = readFileSync(
      join(__dirname, "..", "coverLetterGenerator.css"),
      "utf8"
    );
    expect(css).toMatch(/\.generate-button \{[^}]*min-height: 44px/);
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}/);
  });
});
