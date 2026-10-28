/**
 * @description       : Unit tests for resumeBuilder LWC. The getResume wire adapter, the
 *                      resource loader and the font fetch are mocked, so no mock data lives in
 *                      the component. The PDF tests run the real writer against a stand in for
 *                      jsPDF that measures text and records every piece drawn.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 01/03/2026
 **/
import { createElement } from "@lwc/engine-dom";
import ResumeBuilder, {
  reduceError,
  NO_ANSWER_MESSAGE,
  NO_RESUME_MESSAGE
} from "c/resumeBuilder";
import getResume from "@salesforce/apex/ResumeController.getResume";
import { loadScript } from "lightning/platformResourceLoader";
import { trackEvent } from "c/analyticsService";
import { buildViewModel, writePdf } from "../resumeFormat";
import {
  RESUME_LAYOUT,
  PREVIEW_PX_PER_PT,
  previewStyle
} from "../resumeLayout";

jest.mock(
  "@salesforce/apex/ResumeController.getResume",
  () => {
    const { createApexTestWireAdapter } = require("@salesforce/sfdx-lwc-jest");
    return { default: createApexTestWireAdapter(jest.fn()) };
  },
  { virtual: true }
);

// c/analyticsService is mocked so the bundle tests on its own.
jest.mock(
  "c/analyticsService",
  () => ({
    __esModule: true,
    trackEvent: jest.fn(),
    EVENTS: { RESUME_DOWNLOADED: "resume_downloaded" }
  }),
  { virtual: true }
);

// config/jest.config.js maps every lightning/* import to one universal mock file, so
// mocking platformResourceLoader mocks lightning-card and the rest too. Keep the real
// mock component as the default export and add the loader functions beside it.
jest.mock("lightning/platformResourceLoader", () => {
  const universal = jest.requireActual("lightning/platformResourceLoader");
  return {
    __esModule: true,
    default: universal.default,
    loadScript: jest.fn(),
    loadStyle: jest.fn()
  };
});

const RESUME = {
  persona: "Architect",
  header: {
    name: "Ryan Bumstead",
    title: "Salesforce Technical Architect",
    careerObjective: "Design platforms that last.",
    linkedInUrl: "https://www.linkedin.com/in/example",
    gitHubUrl: "https://github.com/rdbumstead",
    trailheadUrl: null,
    portfolioUrl: "https://ryanbumstead.com"
  },
  roles: [
    {
      id: "a01000000000001AAA",
      title: "Technical Architect",
      employer: "Acme",
      startDate: "2023-04-01",
      endDate: null,
      isCurrent: true,
      isRemote: true,
      highlights: ["Led the integration layer.", "Built the CI pipeline."]
    },
    {
      id: "a01000000000002AAA",
      title: "Developer",
      employer: "Globex",
      startDate: "2020-01-01",
      endDate: "2023-03-31",
      isCurrent: false,
      isRemote: false,
      highlights: ["Shipped Lightning components."]
    }
  ],
  skillGroups: [{ category: "Platform", skills: ["Apex", "LWC"] }],
  certifications: [
    {
      name: "Application Architect",
      issuer: "Salesforce",
      dateValue: "2024-06-15",
      detail: null
    }
  ],
  education: [
    {
      name: "BSc",
      issuer: "State University",
      dateValue: "2015-05-20",
      detail: "Computer Science"
    }
  ]
};

// Past roles with no highlights fold into the Earlier roles line.
const EARLIER = [
  {
    id: "a01000000000003AAA",
    title: "Support Analyst",
    employer: "Initech",
    startDate: "2017-07-03",
    endDate: "2019-12-31",
    isCurrent: false,
    isRemote: false,
    highlights: []
  },
  {
    id: "a01000000000004AAA",
    title: "Technician",
    employer: "Fiserv, Inc",
    startDate: "2016-01-01",
    endDate: "2016-10-03",
    isCurrent: false,
    isRemote: false,
    highlights: null
  }
];

// A stored value with plus signs in the query string, which must survive as plus signs.
const VERIFY_URL =
  "https://trailhead.salesforce.com/en/credentials/certification-detail-print/?searchString=9mtUhy8GnfeJ+wZ2qMHSoTtn5Li90a2pHeJQ9ycm+2M7cecsvBBbSOauy5RarT+M";

const CERTS = [
  {
    name: "Salesforce Certified AI Associate",
    issuer: "Salesforce",
    dateValue: "2024-07-22",
    detail: null,
    isRetired: true
  },
  {
    name: "Salesforce Certified Platform Administrator",
    issuer: "Salesforce",
    dateValue: "2024-06-19",
    detail: null,
    isRetired: false
  },
  {
    name: "Salesforce Certified Data 360 Consultant",
    issuer: "Salesforce",
    dateValue: "2025-03-17",
    detail: null,
    isRetired: false
  }
];

const flushPromises = () => new Promise((resolve) => process.nextTick(resolve));

function createComponent() {
  const element = createElement("c-resume-builder", { is: ResumeBuilder });
  document.body.appendChild(element);
  return element;
}

function query(element, selector) {
  return element.shadowRoot.querySelector(selector);
}

function queryAll(element, selector) {
  return Array.from(element.shadowRoot.querySelectorAll(selector));
}

function button(element, cssClass) {
  return query(element, `button.${cssClass}`);
}

/**
 * A stand in for a jsPDF document: letter size in points, text measured at half the font
 * size per character, and every call recorded in order.
 */
function fakeDoc() {
  const state = { size: 10, font: "", style: "" };
  const doc = {
    internal: {
      pageSize: { getWidth: () => 612, getHeight: () => 792 }
    },
    drawn: [],
    pages: 1,
    setFont: jest.fn((font, style) => {
      state.font = font;
      state.style = style;
    }),
    setFontSize: jest.fn((size) => {
      state.size = size;
    }),
    getTextWidth: jest.fn((text) => String(text).length * state.size * 0.5),
    setTextColor: jest.fn(),
    setDrawColor: jest.fn(),
    setLineWidth: jest.fn(),
    line: jest.fn(),
    text: jest.fn((text, x, y) => {
      doc.drawn.push({ text, x, y, page: doc.pages, ...state });
    }),
    textWithLink: jest.fn((text, x, y, options) => {
      doc.drawn.push({
        text,
        x,
        y,
        page: doc.pages,
        url: options.url,
        ...state
      });
      return text.length;
    }),
    addPage: jest.fn(() => {
      doc.pages += 1;
    }),
    addFileToVFS: jest.fn(),
    addFont: jest.fn(),
    save: jest.fn()
  };
  return doc;
}

function fontResponse(ok = true) {
  return Promise.resolve({
    ok,
    status: ok ? 200 : 404,
    arrayBuffer: () => Promise.resolve(new Uint8Array([65, 66, 67]).buffer)
  });
}

describe("c-resume-builder", () => {
  let jsPdfInstance;

  beforeEach(() => {
    jsPdfInstance = fakeDoc();
    window.jspdf = { jsPDF: jest.fn(() => jsPdfInstance) };
    loadScript.mockReset();
    loadScript.mockResolvedValue();
    global.fetch = jest.fn(() => fontResponse());
  });

  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    delete window.jspdf;
    delete global.fetch;
    jest.clearAllMocks();
  });

  it("shows the loading state until the wire returns", async () => {
    const element = createComponent();
    await flushPromises();

    expect(query(element, ".loading-state")).not.toBeNull();
    expect(query(element, ".resume-name")).toBeNull();
  });

  it("wires getResume with the default Architect persona", async () => {
    createComponent();
    await flushPromises();

    expect(getResume.getLastConfig()).toEqual({ persona: "Architect" });
  });

  it("leaves Contact out of the header links when there is no portfolio URL", async () => {
    const element = createComponent();
    getResume.emit({
      ...RESUME,
      header: { ...RESUME.header, portfolioUrl: null }
    });
    await flushPromises();

    expect(
      queryAll(element, ".resume-links a").map((a) => a.textContent)
    ).toEqual(["LinkedIn", "GitHub"]);
  });

  it("renders the header, roles, skills, certifications and education", async () => {
    const element = createComponent();
    getResume.emit(RESUME);
    await flushPromises();

    expect(query(element, ".loading-state")).toBeNull();
    expect(query(element, ".resume-name").textContent).toBe("Ryan Bumstead");
    expect(query(element, ".resume-title").textContent).toBe(
      "Salesforce Technical Architect"
    );
    expect(queryAll(element, ".resume-links a").map((a) => a.href)).toEqual([
      "https://www.linkedin.com/in/example",
      "https://github.com/rdbumstead",
      "https://ryanbumstead.com/",
      "https://ryanbumstead.com/contact"
    ]);
    expect(query(element, ".resume-objective").textContent.trim()).toBe(
      "Design platforms that last."
    );

    const roles = queryAll(element, ".resume-role");
    expect(roles).toHaveLength(2);
    expect(roles[0].querySelector(".role-heading").textContent).toBe(
      "Technical Architect, Acme"
    );
    expect(roles[0].querySelector(".role-dates").textContent).toBe(
      "Apr 2023 - Present | Remote"
    );
    expect(roles[1].querySelector(".role-dates").textContent).toBe(
      "Jan 2020 - Mar 2023"
    );
    // Title and dates share one row.
    expect(
      roles[0].querySelector(".role-row .role-heading + .role-dates")
    ).not.toBeNull();
    expect(
      queryAll(element, ".role-highlight").map((li) => li.textContent.trim())
    ).toEqual([
      "Led the integration layer.",
      "Built the CI pipeline.",
      "Shipped Lightning components."
    ]);

    expect(query(element, ".skill-group").textContent).toContain("Apex, LWC");
    expect(query(element, ".certification").textContent.trim()).toBe(
      "Application Architect, Salesforce, Jun 2024"
    );
    expect(query(element, ".education").textContent).toBe(
      "BSc, Computer Science, State University, May 2015"
    );
    expect(query(element, ".earlier-roles")).toBeNull();
  });

  it("offers the personas under Tailor for, without the Technical Architect title", async () => {
    const element = createComponent();
    getResume.emit(RESUME);
    await flushPromises();

    const picker = query(element, "select.persona-picker");
    const label = query(element, `label[for="${picker.id}"]`);
    expect(label.textContent.trim()).toBe("Tailor for");
    expect(
      Array.from(picker.options).map((option) => option.textContent.trim())
    ).toEqual(["Platform Architect", "Salesforce Developer", "System Admin"]);
    expect(picker.value).toBe("Architect");
    expect(picker.classList.contains("nc-control")).toBe(true);
  });

  it("re-wires with the new persona when the picker changes", async () => {
    const element = createComponent();
    getResume.emit(RESUME);
    await flushPromises();

    const picker = query(element, "select.persona-picker");
    picker.value = "Developer";
    picker.dispatchEvent(new CustomEvent("change"));
    await flushPromises();

    expect(getResume.getLastConfig()).toEqual({ persona: "Developer" });
    expect(query(element, ".loading-state")).not.toBeNull();

    getResume.emit({ ...RESUME, persona: "Developer", roles: [] });
    await flushPromises();
    expect(queryAll(element, ".resume-role")).toHaveLength(0);
    expect(query(element, ".resume-name")).not.toBeNull();
  });

  it("has one primary button and no light SLDS theme panel", async () => {
    const element = createComponent();
    getResume.emit(RESUME);
    await flushPromises();

    expect(button(element, "download-pdf").className).toBe(
      "nc-button download-pdf"
    );
    expect(
      button(element, "copy-ats").classList.contains("nc-button_secondary")
    ).toBe(true);
    expect(
      queryAll(element, "button.nc-button").filter(
        (control) => !control.classList.contains("nc-button_secondary")
      )
    ).toHaveLength(1);
    expect(query(element, "lightning-button")).toBeNull();
    expect(query(element, "lightning-combobox")).toBeNull();
    expect(query(element, ".config-panel")).not.toBeNull();
    expect(query(element, '[class*="slds-theme_"]')).toBeNull();
    expect(query(element, '[class*="slds-text-color_"]')).toBeNull();
  });

  it("puts the layout spec on the paper, so it stays white in both themes", async () => {
    const element = createComponent();
    getResume.emit(RESUME);
    await flushPromises();

    const style = query(element, ".preview-paper").getAttribute("style");
    expect(style).toContain(`--resume-paper: ${RESUME_LAYOUT.colors.paper}`);
    expect(style).toContain(`--resume-ink: ${RESUME_LAYOUT.colors.ink}`);
    expect(style).toContain(
      `--resume-name-size: ${RESUME_LAYOUT.type.name.size * PREVIEW_PX_PER_PT}px`
    );
    expect(style).toContain("--resume-name-weight: 700");
    expect(RESUME_LAYOUT.colors.paper).toBe("#ffffff");
  });

  it("shows the controller message in the error state", async () => {
    const element = createComponent();
    getResume.error({
      message: "Invalid persona. Valid values: Admin, Developer, Architect"
    });
    await flushPromises();

    const errorState = query(element, ".error-state");
    expect(errorState).not.toBeNull();
    expect(errorState.textContent).toContain(
      "Invalid persona. Valid values: Admin, Developer, Architect"
    );
    expect(button(element, "download-pdf").disabled).toBe(true);
  });

  it("says what happened in place of the platform's raw failure text", async () => {
    const element = createComponent();
    getResume.error({ message: "Failed to get error from response" });
    await flushPromises();

    const errorState = query(element, ".error-state");
    expect(errorState.textContent).toContain("The resume could not be loaded.");
    expect(errorState.textContent).toContain(NO_ANSWER_MESSAGE);
    expect(errorState.textContent).not.toContain("Failed to get error");
    expect(query(element, ".empty-state")).toBeNull();
  });

  it("never shows the empty state when the call answers with no resume", async () => {
    const element = createComponent();
    getResume.emit(null);
    await flushPromises();

    expect(query(element, ".empty-state")).toBeNull();
    expect(query(element, ".error-state").textContent).toContain(
      NO_RESUME_MESSAGE
    );
    expect(button(element, "download-pdf").disabled).toBe(true);
  });

  it("reduces errors to the controller's message or a plain sentence", () => {
    expect(reduceError(null)).toBe("");
    expect(reduceError({ body: { message: "Invalid persona." } })).toBe(
      "Invalid persona."
    );
    expect(
      reduceError({ body: [{ message: "One" }, {}, { message: "Two" }] })
    ).toBe("One, Two");
    expect(reduceError({ body: [] })).toBe(NO_ANSWER_MESSAGE);
    expect(reduceError({})).toBe(NO_ANSWER_MESSAGE);
    expect(reduceError({ message: "  " }, "Try again.")).toBe("Try again.");
    expect(
      reduceError({ body: { message: "Failed to get error from response" } })
    ).toBe(NO_ANSWER_MESSAGE);
  });

  it("shows the empty state when the resume has no content", async () => {
    const element = createComponent();
    getResume.emit({
      persona: "Admin",
      header: null,
      roles: [],
      skillGroups: [],
      certifications: [],
      education: []
    });
    await flushPromises();

    expect(query(element, ".empty-state")).not.toBeNull();
    expect(button(element, "copy-ats").disabled).toBe(true);
  });

  it("hides the header and skills when the toggles are off", async () => {
    const element = createComponent();
    getResume.emit(RESUME);
    await flushPromises();

    const toggles = queryAll(element, "lightning-input");
    toggles.forEach((toggle) => {
      toggle.checked = false;
      toggle.dispatchEvent(new CustomEvent("change"));
    });
    await flushPromises();

    expect(query(element, ".resume-name")).toBeNull();
    expect(query(element, ".resume-skills")).toBeNull();
    expect(queryAll(element, ".resume-role")).toHaveLength(2);
  });

  it("does not load jsPDF or the fonts until the download button is clicked", async () => {
    const element = createComponent();
    getResume.emit(RESUME);
    await flushPromises();

    expect(loadScript).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();

    button(element, "download-pdf").click();
    await flushPromises();
    await flushPromises();

    expect(loadScript).toHaveBeenCalledTimes(1);
    expect(loadScript.mock.calls[0][1]).toBe("jsPDF_Library");
    expect(global.fetch.mock.calls.map((call) => call[0])).toEqual([
      "Portfolio_Fonts/inter-latin-400-normal.ttf",
      "Portfolio_Fonts/inter-latin-700-normal.ttf"
    ]);
    expect(window.jspdf.jsPDF).toHaveBeenCalledWith({
      unit: "pt",
      format: "letter",
      compress: true
    });
    expect(jsPdfInstance.addFileToVFS).toHaveBeenCalledWith(
      "inter-latin-400-normal.ttf",
      "QUJD"
    );
    expect(jsPdfInstance.addFont).toHaveBeenCalledWith(
      "inter-latin-700-normal.ttf",
      "Inter",
      "bold"
    );
    expect(jsPdfInstance.setFont).toHaveBeenCalledWith("Inter", "normal");
    expect(jsPdfInstance.save).toHaveBeenCalledWith(
      "Ryan_Bumstead_Resume_Architect.pdf"
    );
    const written = jsPdfInstance.drawn.map((piece) => piece.text);
    expect(written).toContain("Ryan Bumstead");
    expect(written).toContain("EXPERIENCE");
    expect(written).toContain("Led the integration layer.");
    expect(written).not.toContain("SUMMARY");
    expect(query(element, ".export-message").textContent).toContain(
      "PDF downloaded."
    );
    expect(trackEvent).toHaveBeenCalledWith("resume_downloaded", {
      persona: "Architect",
      format: "pdf"
    });

    button(element, "download-pdf").click();
    await flushPromises();
    await flushPromises();
    expect(loadScript).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(jsPdfInstance.save).toHaveBeenCalledTimes(2);
  });

  it("still writes the PDF in the fallback font when the fonts cannot be fetched", async () => {
    global.fetch = jest.fn(() => fontResponse(false));
    const element = createComponent();
    getResume.emit(RESUME);
    await flushPromises();

    button(element, "download-pdf").click();
    await flushPromises();
    await flushPromises();

    expect(jsPdfInstance.addFont).not.toHaveBeenCalled();
    expect(jsPdfInstance.setFont).toHaveBeenCalledWith("helvetica", "bold");
    expect(jsPdfInstance.save).toHaveBeenCalledTimes(1);

    // The next click tries the fonts again.
    global.fetch = jest.fn(() => fontResponse());
    button(element, "download-pdf").click();
    await flushPromises();
    await flushPromises();
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(jsPdfInstance.addFont).toHaveBeenCalledTimes(2);
  });

  it("leaves the skills out of the PDF when the toggle is off", async () => {
    const element = createComponent();
    getResume.emit(RESUME);
    await flushPromises();

    const skillsToggle = query(
      element,
      'lightning-input[data-field="includeSkills"]'
    );
    skillsToggle.checked = false;
    skillsToggle.dispatchEvent(new CustomEvent("change"));
    await flushPromises();

    button(element, "download-pdf").click();
    await flushPromises();
    await flushPromises();

    const written = jsPdfInstance.drawn.map((piece) => piece.text);
    expect(written).not.toContain("SKILLS");
    expect(written).toContain("CERTIFICATIONS");
  });

  it("reports a failed jsPDF load and retries on the next click", async () => {
    loadScript.mockRejectedValueOnce(new Error("blocked"));
    const element = createComponent();
    getResume.emit(RESUME);
    await flushPromises();

    button(element, "download-pdf").click();
    await flushPromises();
    await flushPromises();

    expect(query(element, ".export-error").textContent).toContain(
      "The PDF could not be created."
    );
    expect(jsPdfInstance.save).not.toHaveBeenCalled();
    expect(trackEvent).not.toHaveBeenCalled();

    button(element, "download-pdf").click();
    await flushPromises();
    await flushPromises();
    expect(loadScript).toHaveBeenCalledTimes(2);
    expect(jsPdfInstance.save).toHaveBeenCalledTimes(1);
  });

  it("copies plain ATS text with no tables", async () => {
    const writeText = jest.fn().mockResolvedValue();
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true
    });

    const element = createComponent();
    getResume.emit(RESUME);
    await flushPromises();

    button(element, "copy-ats").click();
    await flushPromises();

    expect(writeText).toHaveBeenCalledTimes(1);
    const text = writeText.mock.calls[0][0];
    expect(text).toBe(
      [
        "Ryan Bumstead",
        "Salesforce Technical Architect",
        "LinkedIn: https://www.linkedin.com/in/example",
        "GitHub: https://github.com/rdbumstead",
        "Portfolio: https://ryanbumstead.com",
        "Contact: https://ryanbumstead.com/contact",
        "",
        "SUMMARY",
        "Design platforms that last.",
        "",
        "EXPERIENCE",
        "Technical Architect, Acme",
        "Apr 2023 - Present | Remote",
        "- Led the integration layer.",
        "- Built the CI pipeline.",
        "",
        "Developer, Globex",
        "Jan 2020 - Mar 2023",
        "- Shipped Lightning components.",
        "",
        "SKILLS",
        "Platform: Apex, LWC",
        "",
        "CERTIFICATIONS",
        "Application Architect, Salesforce, Jun 2024",
        "",
        "EDUCATION",
        "BSc, Computer Science, State University, May 2015"
      ].join("\n")
    );
    expect(text).not.toContain("\t");
    expect(text).not.toContain("|  ");
    expect(loadScript).not.toHaveBeenCalled();
    expect(query(element, ".export-message").textContent).toContain(
      "ATS text copied"
    );
    expect(trackEvent).toHaveBeenCalledWith("resume_downloaded", {
      persona: "Architect",
      format: "ats"
    });

    delete navigator.clipboard;
  });

  describe("earlier roles", () => {
    it("folds past roles with no highlights into one line after the other roles", async () => {
      const element = createComponent();
      getResume.emit({ ...RESUME, roles: [...RESUME.roles, ...EARLIER] });
      await flushPromises();

      expect(queryAll(element, ".resume-role")).toHaveLength(2);
      const line = query(element, ".resume-experience .earlier-roles");
      expect(line.querySelector(".item-label").textContent.trim()).toBe(
        "Earlier roles:"
      );
      expect(line.textContent.replace(/\s+/g, " ").trim()).toBe(
        "Earlier roles: Support Analyst, Initech (2017 to 2019) · Technician, Fiserv, Inc (2016)"
      );
      const lastRole = queryAll(element, ".resume-role")[1];
      expect(
        lastRole.compareDocumentPosition(line) &
          Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy();
    });

    it("keeps a current role with no highlights as a role", () => {
      const model = buildViewModel(
        {
          ...RESUME,
          roles: [{ ...RESUME.roles[0], highlights: [] }, ...EARLIER]
        },
        { includeHeader: true, includeSkills: true }
      );
      expect(model.roles.map((role) => role.title)).toEqual([
        "Technical Architect"
      ]);
      expect(model.earlierRoles.count).toBe(2);
    });

    it("puts the same line in the ATS text and the PDF", async () => {
      const writeText = jest.fn().mockResolvedValue();
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText },
        configurable: true
      });
      const element = createComponent();
      getResume.emit({ ...RESUME, roles: [...RESUME.roles, ...EARLIER] });
      await flushPromises();

      button(element, "copy-ats").click();
      await flushPromises();
      const text = writeText.mock.calls[0][0];
      expect(text).toContain(
        "- Shipped Lightning components.\n\nEarlier roles: Support Analyst, Initech (2017 to 2019) · Technician, Fiserv, Inc (2016)\n\nSKILLS"
      );
      delete navigator.clipboard;

      button(element, "download-pdf").click();
      await flushPromises();
      await flushPromises();
      const written = jsPdfInstance.drawn.map((piece) => piece.text);
      expect(written).toContain("Earlier roles:");
    });
  });

  describe("certifications", () => {
    async function render(resume) {
      const element = createComponent();
      getResume.emit(resume);
      await flushPromises();
      return element;
    }

    it("shows no verification link when the URL is not set", async () => {
      const element = await render({ ...RESUME, certifications: CERTS });
      expect(query(element, ".verify-link")).toBeNull();
      expect(queryAll(element, ".certification")).toHaveLength(2);
    });

    it("shows no verification link when the URL is not http or https", async () => {
      const element = await render({
        ...RESUME,
        certifications: CERTS,
        // eslint-disable-next-line no-script-url
        credentialVerificationUrl: "javascript:alert(1)"
      });
      expect(query(element, ".verify-link")).toBeNull();
    });

    it("links to the stored URL exactly, plus signs included, in a new tab", async () => {
      const element = await render({
        ...RESUME,
        certifications: CERTS,
        credentialVerificationUrl: VERIFY_URL
      });
      const link = query(element, ".verify-link");
      expect(link).not.toBeNull();
      expect(link.getAttribute("href")).toBe(VERIFY_URL);
      expect(link.getAttribute("href")).toContain("+wZ2q");
      expect(link.getAttribute("target")).toBe("_blank");
      expect(link.getAttribute("rel")).toBe("noopener noreferrer");
      expect(link.textContent).toContain("Verify on Trailhead");
    });

    it("lists current certifications newest first with issuer and month", async () => {
      const element = await render({ ...RESUME, certifications: CERTS });
      expect(
        queryAll(element, ".certification").map((li) => li.textContent.trim())
      ).toEqual([
        "Salesforce Certified Data 360 Consultant, Salesforce, Mar 2025",
        "Salesforce Certified Platform Administrator, Salesforce, Jun 2024"
      ]);
    });

    it("puts the retired list after the link, outside the current list", async () => {
      const element = await render({
        ...RESUME,
        certifications: CERTS,
        credentialVerificationUrl: VERIFY_URL
      });
      const link = query(element, ".verify-link");
      const retiredTitle = query(element, ".retired-title");
      const retiredList = query(element, ".retired-certifications");
      expect(retiredTitle.textContent).toBe("Retired");
      expect(
        queryAll(element, ".retired-certification").map((li) =>
          li.textContent.trim()
        )
      ).toEqual(["Salesforce Certified AI Associate, Jul 2024"]);
      // DOCUMENT_POSITION_FOLLOWING: the retired block comes after the link.
      expect(
        link.compareDocumentPosition(retiredTitle) &
          Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy();
      expect(
        link.compareDocumentPosition(retiredList) &
          Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy();
      expect(
        query(element, ".current-certifications").textContent
      ).not.toContain("AI Associate");
    });

    it("shows no Retired heading when nothing is retired", async () => {
      const element = await render({
        ...RESUME,
        certifications: CERTS.filter((cert) => !cert.isRetired),
        credentialVerificationUrl: VERIFY_URL
      });
      expect(query(element, ".retired-title")).toBeNull();
      expect(query(element, ".retired-certifications")).toBeNull();
    });

    it("shows no link and no current list when every certification is retired", async () => {
      const element = await render({
        ...RESUME,
        certifications: CERTS.filter((cert) => cert.isRetired),
        credentialVerificationUrl: VERIFY_URL
      });
      expect(query(element, ".verify-link")).toBeNull();
      expect(query(element, ".current-certifications")).toBeNull();
      expect(queryAll(element, ".retired-certification")).toHaveLength(1);
    });

    it("groups the certifications in the ATS text as the preview does", async () => {
      const writeText = jest.fn().mockResolvedValue();
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText },
        configurable: true
      });
      const element = await render({
        ...RESUME,
        certifications: CERTS,
        credentialVerificationUrl: VERIFY_URL
      });
      button(element, "copy-ats").click();
      await flushPromises();
      const text = writeText.mock.calls[0][0];
      expect(text).toContain(
        [
          "CERTIFICATIONS",
          "Salesforce Certified Data 360 Consultant, Salesforce, Mar 2025",
          "Salesforce Certified Platform Administrator, Salesforce, Jun 2024",
          `Verify on Trailhead: ${VERIFY_URL}`,
          "Retired",
          "Salesforce Certified AI Associate, Jul 2024",
          "",
          "EDUCATION"
        ].join("\n")
      );
      delete navigator.clipboard;
    });

    it("makes the header links and Verify on Trailhead clickable in the PDF", async () => {
      const element = await render({
        ...RESUME,
        certifications: CERTS,
        credentialVerificationUrl: VERIFY_URL
      });
      button(element, "download-pdf").click();
      await flushPromises();
      await flushPromises();
      const links = jsPdfInstance.drawn.filter((piece) => piece.url);
      expect(links.map((piece) => [piece.text, piece.url])).toEqual([
        ["LinkedIn", "https://www.linkedin.com/in/example"],
        ["GitHub", "https://github.com/rdbumstead"],
        ["Portfolio", "https://ryanbumstead.com"],
        ["Contact", "https://ryanbumstead.com/contact"],
        ["Verify on Trailhead", VERIFY_URL]
      ]);
      // Side by side on one centred row.
      const ys = new Set(links.slice(0, 4).map((piece) => piece.y));
      expect(ys.size).toBe(1);
    });
  });

  // The drift check: the preview and the PDF come from one model and one layout spec, so they
  // must show the same sections in the same order, the same roles and the same certification
  // groups. A change to one that is not made to the other fails here.
  describe("preview and PDF drift check", () => {
    const FULL = {
      ...RESUME,
      roles: [...RESUME.roles, ...EARLIER],
      certifications: CERTS,
      credentialVerificationUrl: VERIFY_URL
    };

    function previewOutline(element) {
      return queryAll(element, ".preview-paper section").map((section) => ({
        title: section.querySelector(".section-title").textContent.trim(),
        roles: Array.from(section.querySelectorAll(".role-heading")).map(
          (node) => node.textContent.trim()
        ),
        dates: Array.from(section.querySelectorAll(".role-dates")).map((node) =>
          node.textContent.trim()
        ),
        bullets: Array.from(section.querySelectorAll(".role-highlight")).map(
          (node) => node.textContent.trim()
        ),
        current: Array.from(section.querySelectorAll(".certification")).map(
          (node) => node.textContent.trim()
        ),
        retired: Array.from(
          section.querySelectorAll(".retired-certification")
        ).map((node) => node.textContent.trim()),
        hasVerify: section.querySelector(".verify-link") !== null,
        hasRetiredTitle: section.querySelector(".retired-title") !== null
      }));
    }

    function pdfOutline(trace) {
      const sections = [];
      trace.forEach((piece) => {
        if (piece.kind === "section") {
          sections.push({
            title: piece.text,
            roles: [],
            dates: [],
            bullets: [],
            current: [],
            retired: [],
            hasVerify: false,
            hasRetiredTitle: false
          });
          return;
        }
        const last = sections[sections.length - 1];
        if (!last) {
          return;
        }
        if (piece.kind === "role") last.roles.push(piece.text);
        if (piece.kind === "dates") last.dates.push(piece.text);
        if (piece.kind === "bullet") last.bullets.push(piece.text);
        if (piece.kind === "cert") last.current.push(piece.text);
        if (piece.kind === "retired") last.retired.push(piece.text);
        if (piece.kind === "verify") last.hasVerify = true;
        if (piece.kind === "retired-title") last.hasRetiredTitle = true;
      });
      return sections;
    }

    it("draws the same sections, order, roles and certification groups as the preview", async () => {
      const element = createComponent();
      getResume.emit(FULL);
      await flushPromises();

      const model = buildViewModel(FULL, {
        includeHeader: true,
        includeSkills: true
      });
      const trace = [];
      const doc = fakeDoc();
      writePdf(doc, model, { family: "Inter", trace });

      const preview = previewOutline(element);
      const pdf = pdfOutline(trace);
      expect(preview.map((section) => section.title)).toEqual([
        "Experience",
        "Skills",
        "Certifications",
        "Education"
      ]);
      expect(pdf.map((section) => section.title)).toEqual(
        preview.map((section) => section.title.toUpperCase())
      );
      pdf.forEach((section, index) => {
        expect({ ...section, title: "" }).toEqual({
          ...preview[index],
          title: ""
        });
      });

      // The trace is what was drawn: every traced piece is in the document's text calls.
      const drawn = doc.drawn.map((piece) => piece.text);
      trace.forEach((piece) => expect(drawn).toContain(piece.text));
      // The header has no Summary heading in either.
      expect(drawn).not.toContain("SUMMARY");
      expect(element.shadowRoot.textContent).not.toContain("Summary");
    });

    it("draws the header centred, the title and dates of a role on one row", () => {
      const model = buildViewModel(FULL, {
        includeHeader: true,
        includeSkills: true
      });
      const doc = fakeDoc();
      writePdf(doc, model, { family: "Inter" });
      const name = doc.drawn.find((piece) => piece.text === "Ryan Bumstead");
      const nameWidth = "Ryan Bumstead".length * name.size * 0.5;
      expect(name.x + nameWidth / 2).toBeCloseTo(306, 5);
      const heading = doc.drawn.find(
        (piece) => piece.text === "Technical Architect, Acme"
      );
      const dates = doc.drawn.find(
        (piece) => piece.text === "Apr 2023 - Present | Remote"
      );
      expect(dates.y).toBe(heading.y);
      expect(dates.x).toBeGreaterThan(heading.x);
      expect(heading.style).toBe("bold");
      expect(dates.style).toBe("normal");
      // One rule under each section title.
      expect(doc.line).toHaveBeenCalledTimes(4);
    });

    it("never splits a role across pages", () => {
      const longRoles = Array.from({ length: 14 }, (unused, index) => ({
        id: `a0100000000010${index}AAA`,
        title: `Role ${index + 1}`,
        employer: "Acme",
        startDate: "2020-01-01",
        endDate: "2021-01-01",
        isCurrent: index === 0,
        isRemote: false,
        highlights: [
          "A highlight long enough to wrap across more than one line of the page in the writer.",
          "A second highlight.",
          "A third highlight."
        ]
      }));
      const model = buildViewModel(
        { ...FULL, roles: longRoles },
        { includeHeader: true, includeSkills: true }
      );
      const trace = [];
      const doc = fakeDoc();
      writePdf(doc, model, { family: "Inter", trace });
      expect(doc.addPage).toHaveBeenCalled();

      const pagesByRole = {};
      let currentRole = null;
      trace.forEach((piece) => {
        if (piece.kind === "role") currentRole = piece.text;
        if (!["role", "dates", "marker", "bullet"].includes(piece.kind)) {
          currentRole = null;
        }
        if (currentRole) {
          pagesByRole[currentRole] = pagesByRole[currentRole] || new Set();
          pagesByRole[currentRole].add(piece.page);
        }
      });
      Object.values(pagesByRole).forEach((pages) => expect(pages.size).toBe(1));
      // A section title is never the last thing on a page.
      trace
        .filter((piece) => piece.kind === "section")
        .forEach((title) => {
          const index = trace.indexOf(title);
          expect(trace[index + 1].page).toBe(title.page);
        });
      // Every piece sits inside the page margins.
      trace.forEach((piece) => {
        expect(piece.y).toBeGreaterThan(RESUME_LAYOUT.page.margin);
        expect(piece.y).toBeLessThan(792 - RESUME_LAYOUT.page.margin);
      });
    });

    it("builds the preview's custom properties from the spec at 1.6 px per point", () => {
      const style = previewStyle(RESUME_LAYOUT);
      Object.keys(RESUME_LAYOUT.type).forEach((key) => {
        const name = key.replace(
          /[A-Z]/g,
          (letter) => `-${letter.toLowerCase()}`
        );
        const px =
          Math.round(RESUME_LAYOUT.type[key].size * PREVIEW_PX_PER_PT * 100) /
          100;
        expect(style).toContain(`--resume-${name}-size: ${px}px`);
      });
      expect(style).toContain("--resume-section-title-size: 14.4px");
      expect(style).toContain("--resume-text-size: 16px");
    });
  });

  it("places View source with the resumeBuilder key in the card's title row", () => {
    // The test card mock has no actions slot, so the slotted control is read from the template.
    const template = require("fs").readFileSync(
      require("path").join(__dirname, "..", "resumeBuilder.html"),
      "utf8"
    );
    expect(template).toMatch(
      /<div slot="actions" class="card-actions">\s*<c-view-source\s+source-key="resumeBuilder"/
    );
    const element = createComponent();
    expect(query(element, ".card-tools")).toBeNull();
  });

  it("places the live data marker beside View source with the resume definitions", () => {
    const template = require("fs").readFileSync(
      require("path").join(__dirname, "..", "resumeBuilder.html"),
      "utf8"
    );
    expect(template).toMatch(
      /<\/c-view-source>\s*<c-data-source\s+source-keys="ResumeController_Roles,/
    );
    expect(template).toContain("ResumeController_Education");
  });

  it("moves View source and the marker into the card body below 1024 px", () => {
    const original = window.matchMedia;
    window.matchMedia = jest.fn((media) => ({
      matches: media === "(max-width: 1023px)",
      addEventListener: jest.fn(),
      removeEventListener: jest.fn()
    }));
    try {
      const element = createComponent();
      const row = query(element, ".card-actions_body");
      expect(row).not.toBeNull();
      expect(row.querySelector("c-view-source").sourceKey).toBe(
        "resumeBuilder"
      );
      expect(row.querySelector("c-data-source")).not.toBeNull();
    } finally {
      window.matchMedia = original;
    }
  });

  it("keeps the card body free of the pair on a wide screen", () => {
    const element = createComponent();
    expect(query(element, ".card-actions_body")).toBeNull();
  });
});
