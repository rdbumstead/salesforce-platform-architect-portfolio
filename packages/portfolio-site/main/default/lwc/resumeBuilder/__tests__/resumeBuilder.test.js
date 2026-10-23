/**
 * @description       : Unit tests for resumeBuilder LWC. The getResume wire adapter and the
 *                      resource loader are mocked, so no mock data lives in the component.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 01/03/2026
 **/
import { createElement } from "@lwc/engine-dom";
import ResumeBuilder from "c/resumeBuilder";
import getResume from "@salesforce/apex/ResumeController.getResume";
import { loadScript } from "lightning/platformResourceLoader";
import { trackEvent } from "c/analyticsService";

jest.mock(
  "@salesforce/apex/ResumeController.getResume",
  () => {
    const { createApexTestWireAdapter } = require("@salesforce/sfdx-lwc-jest");
    return { default: createApexTestWireAdapter(jest.fn()) };
  },
  { virtual: true }
);

// c/analyticsService (contract L4) is mocked so the bundle tests on its own.
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
  return query(element, `lightning-button.${cssClass}`);
}

describe("c-resume-builder", () => {
  let jsPdfInstance;

  beforeEach(() => {
    jsPdfInstance = {
      internal: {
        pageSize: { getWidth: () => 612, getHeight: () => 792 }
      },
      setFont: jest.fn(),
      setFontSize: jest.fn(),
      splitTextToSize: jest.fn((text) => [text]),
      text: jest.fn(),
      addPage: jest.fn(),
      save: jest.fn()
    };
    window.jspdf = { jsPDF: jest.fn(() => jsPdfInstance) };
    loadScript.mockReset();
    loadScript.mockResolvedValue();
  });

  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    delete window.jspdf;
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
      "https://ryanbumstead.com/"
    ]);

    const roles = queryAll(element, ".resume-role");
    expect(roles).toHaveLength(2);
    expect(roles[0].querySelector(".role-heading").textContent).toBe(
      "Technical Architect, Acme"
    );
    expect(roles[0].querySelector(".role-dates").textContent).toBe(
      "Apr 2023 - Present"
    );
    expect(roles[1].querySelector(".role-dates").textContent).toBe(
      "Jan 2020 - Mar 2023"
    );
    expect(
      queryAll(element, ".role-highlight").map((li) => li.textContent.trim())
    ).toEqual([
      "Led the integration layer.",
      "Built the CI pipeline.",
      "Shipped Lightning components."
    ]);

    expect(query(element, ".skill-group").textContent).toContain("Apex, LWC");
    expect(query(element, ".certification").textContent).toBe(
      "Application Architect, Salesforce, Jun 2024"
    );
    expect(query(element, ".education").textContent).toBe(
      "BSc, Computer Science, State University, May 2015"
    );
  });

  it("offers the personas without the Technical Architect title", async () => {
    const element = createComponent();
    getResume.emit(RESUME);
    await flushPromises();

    const picker = query(element, "lightning-combobox.persona-picker");
    expect(picker.options.map((option) => option.label)).toEqual([
      "Platform Architect",
      "Salesforce Developer",
      "System Admin"
    ]);
  });

  it("re-wires with the new persona when the picker changes", async () => {
    const element = createComponent();
    getResume.emit(RESUME);
    await flushPromises();

    const picker = query(element, "lightning-combobox.persona-picker");
    picker.dispatchEvent(
      new CustomEvent("change", { detail: { value: "Developer" } })
    );
    await flushPromises();

    expect(getResume.getLastConfig()).toEqual({ persona: "Developer" });
    expect(query(element, ".loading-state")).not.toBeNull();

    getResume.emit({ ...RESUME, persona: "Developer", roles: [] });
    await flushPromises();
    expect(queryAll(element, ".resume-role")).toHaveLength(0);
    expect(query(element, ".resume-name")).not.toBeNull();
  });

  it("uses brand buttons and no light SLDS theme panel (contract K9)", async () => {
    const element = createComponent();
    getResume.emit(RESUME);
    await flushPromises();

    expect(button(element, "download-pdf").variant).toBe("brand");
    expect(button(element, "copy-ats").variant).toBe("brand");
    expect(query(element, ".config-panel")).not.toBeNull();
    expect(query(element, '[class*="slds-theme_"]')).toBeNull();
    expect(query(element, '[class*="slds-text-color_"]')).toBeNull();
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

  it("does not load jsPDF until the download button is clicked", async () => {
    const element = createComponent();
    getResume.emit(RESUME);
    await flushPromises();

    expect(loadScript).not.toHaveBeenCalled();

    button(element, "download-pdf").click();
    await flushPromises();

    expect(loadScript).toHaveBeenCalledTimes(1);
    expect(loadScript.mock.calls[0][1]).toBe("jsPDF_Library");
    expect(window.jspdf.jsPDF).toHaveBeenCalledTimes(1);
    expect(jsPdfInstance.save).toHaveBeenCalledWith(
      "Ryan_Bumstead_Resume_Architect.pdf"
    );
    const written = jsPdfInstance.text.mock.calls.map((call) => call[0]);
    expect(written).toContain("Ryan Bumstead");
    expect(written).toContain("EXPERIENCE");
    expect(written).toContain("- Led the integration layer.");
    expect(query(element, ".export-message").textContent).toContain(
      "PDF downloaded."
    );
    expect(trackEvent).toHaveBeenCalledWith("resume_downloaded", {
      persona: "Architect",
      format: "pdf"
    });

    button(element, "download-pdf").click();
    await flushPromises();
    expect(loadScript).toHaveBeenCalledTimes(1);
    expect(jsPdfInstance.save).toHaveBeenCalledTimes(2);
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

    const written = jsPdfInstance.text.mock.calls.map((call) => call[0]);
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

    expect(query(element, ".export-error").textContent).toContain(
      "The PDF could not be created."
    );
    expect(jsPdfInstance.save).not.toHaveBeenCalled();
    expect(trackEvent).not.toHaveBeenCalled();

    button(element, "download-pdf").click();
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

  describe("certifications (Round 6 plan N5)", () => {
    // A stored value with plus signs in the query string (trap 54).
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
        queryAll(element, ".certification").map((li) => li.textContent)
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

    it("marks a retired certification in the ATS text", async () => {
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
        "Salesforce Certified AI Associate, Salesforce, Jul 2024, Retired"
      );
      expect(text).toContain(
        "Salesforce Certified Data 360 Consultant, Salesforce, Mar 2025"
      );
      delete navigator.clipboard;
    });
  });

  it("places View source with the resumeBuilder key under the card heading (contract P2)", () => {
    const element = createComponent();
    const control = element.shadowRoot.querySelector(
      ".card-tools c-view-source"
    );
    expect(control).not.toBeNull();
    expect(control.sourceKey).toBe("resumeBuilder");
  });
});
