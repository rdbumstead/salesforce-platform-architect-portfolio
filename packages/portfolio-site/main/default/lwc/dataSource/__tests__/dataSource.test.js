/**
 * @description       : Unit tests for c-data-source. Both DataSourceController methods are
 *                      mocked wire adapters. The tests cover the marker with counts, with
 *                      objects only, with an empty read and with a failed read, the panel's
 *                      content and link, aria-expanded, Escape and Close returning focus, and
 *                      the wording block.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/28/2026
 **/
import { createElement } from "@lwc/engine-dom";
import DataSource, { WORDING, MODEL_PATH, countText } from "c/dataSource";
import getSources from "@salesforce/apex/DataSourceController.getSources";
import getObjectSources from "@salesforce/apex/DataSourceController.getObjectSources";

jest.mock(
  "@salesforce/apex/DataSourceController.getSources",
  () => {
    const { createApexTestWireAdapter } = require("@salesforce/sfdx-lwc-jest");
    return { default: createApexTestWireAdapter(jest.fn()) };
  },
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/DataSourceController.getObjectSources",
  () => {
    const { createApexTestWireAdapter } = require("@salesforce/sfdx-lwc-jest");
    return { default: createApexTestWireAdapter(jest.fn()) };
  },
  { virtual: true }
);

const ROLES = {
  name: "ResumeController_Roles",
  label: "Roles",
  objectName: "Experience__c",
  description: "Resume roles, current first.",
  hasCount: true,
  count: 10
};
const SKILLS = {
  name: "ResumeController_Skills",
  label: "Skills",
  description: "Resume skill groups.",
  hasCount: true,
  count: 54
};
const HIGHLIGHTS = {
  name: "ResumeController_Highlights",
  label: "Experience Highlights",
  objectName: "Experience_Highlight__c",
  description: "Highlights.",
  hasCount: false,
  count: null
};

const flush = () => Promise.resolve();

function create(props = {}) {
  const element = createElement("c-data-source", { is: DataSource });
  Object.assign(element, props);
  document.body.appendChild(element);
  return element;
}

const button = (el) => el.shadowRoot.querySelector(".marker-button");
const panel = (el) => el.shadowRoot.querySelector(".panel");

describe("c-data-source", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    jest.clearAllMocks();
  });

  it("keeps every visible string in the exported wording block", () => {
    expect(WORDING.markerLabel).toBe("Live from Salesforce");
    expect(WORDING.explanation).toMatch(/not a stored copy/);
    expect(WORDING.explanation).toMatch(/each time the page loads/);
    expect(MODEL_PATH).toBe("/portfolio/business-architecture");
  });

  it("formats a count with the lower case label", () => {
    expect(countText("Skills", 54)).toBe("54 skills");
    expect(countText("Roles", 1)).toBe("1 role");
    expect(countText("Address", 1)).toBe("1 address");
  });

  it("shows the live label with short counts", async () => {
    const el = create({
      sourceKeys: "ResumeController_Roles, ResumeController_Skills"
    });
    getSources.emit([ROLES, SKILLS]);
    await flush();
    expect(button(el).textContent).toContain("Live from Salesforce");
    expect(button(el).textContent).toContain("10 roles, 54 skills");
    expect(button(el).getAttribute("aria-label")).toBe(
      "Live from Salesforce, 10 roles, 54 skills"
    );
  });

  it("passes the trimmed, de-duplicated names to the wire", async () => {
    create({ sourceKeys: " A , B,A,, ", objects: "Skill__c" });
    await flush();
    expect(getSources.getLastConfig()).toEqual({ names: ["A", "B"] });
    expect(getObjectSources.getLastConfig()).toEqual({
      objectNames: ["Skill__c"]
    });
  });

  it("serves object only sections", async () => {
    const el = create({ objects: "Skill__c" });
    getObjectSources.emit([
      { name: "Skill__c", label: "Skills", hasCount: true, count: 54 }
    ]);
    await flush();
    expect(button(el).textContent).toContain("54 skills");
  });

  it("limits the button to three counts and lists all of them in the panel", async () => {
    const el = create({ sourceKeys: "a" });
    getSources.emit([
      ROLES,
      SKILLS,
      { name: "c", label: "Certifications", hasCount: true, count: 7 },
      { name: "d", label: "Education Entries", hasCount: true, count: 2 }
    ]);
    await flush();
    expect(el.shadowRoot.querySelector(".marker-counts").textContent).toBe(
      "10 roles, 54 skills, 7 certifications"
    );
    button(el).click();
    await flush();
    expect(el.shadowRoot.querySelectorAll(".source")).toHaveLength(4);
  });

  it("opens a panel with the sentence, the sources and the model link", async () => {
    const el = create({ sourceKeys: "a" });
    getSources.emit([ROLES, HIGHLIGHTS]);
    await flush();
    expect(panel(el)).toBeNull();
    button(el).click();
    await flush();
    expect(panel(el)).not.toBeNull();
    expect(panel(el).textContent).toContain(WORDING.explanation);
    const items = [...el.shadowRoot.querySelectorAll(".source")];
    expect(items[0].textContent).toContain("10 roles");
    expect(items[0].textContent).not.toContain("Resume roles, current first.");
    expect(el.shadowRoot.querySelector(".source-description")).toBeNull();
    expect(items[1].textContent).toContain("Experience Highlights");
    const link = el.shadowRoot.querySelector(".model-link");
    expect(link.getAttribute("href")).toBe("/portfolio/business-architecture");
    expect(link.textContent).toBe(WORDING.modelLinkText);
  });

  it("shows the label the server sends and keeps the object name on each row", async () => {
    const el = create({ sourceKeys: "ProjectCardController_HomeCaseStudies" });
    getSources.emit([
      {
        name: "ProjectCardController_HomeCaseStudies",
        label: "case studies",
        objectName: "Project__c",
        hasCount: true,
        count: 3
      },
      { ...HIGHLIGHTS }
    ]);
    await flush();
    button(el).click();
    await flush();
    const items = [...el.shadowRoot.querySelectorAll(".source")];
    expect(items[0].textContent).toContain("3 case studies");
    expect(items[0].dataset.object).toBe("Project__c");
    expect(items[1].dataset.object).toBe("Experience_Highlight__c");
  });

  describe("section data model dialog", () => {
    const SKILLS_IN = { ...SKILLS, objectName: "Skill__c", inModel: true };
    const ROLES_IN = { ...ROLES, inModel: true };
    const OUT = {
      name: "Other",
      label: "Other",
      objectName: "User",
      inModel: false,
      hasCount: false
    };
    const modelButton = (el) => el.shadowRoot.querySelector(".model-button");
    const dialog = (el) => el.shadowRoot.querySelector("dialog");
    const visualizer = (el) =>
      el.shadowRoot.querySelector("c-schema-visualizer");

    async function openPanel(rows) {
      const el = create({ sourceKeys: "a" });
      getSources.emit(rows);
      await flush();
      button(el).click();
      await flush();
      return el;
    }

    it("keeps the wording in the block and renames the model link", () => {
      expect(WORDING.sectionModelButton).toBe("See this section's data model");
      expect(WORDING.modelLinkText).toBe("See the full data model");
    });

    it("shows the button only when a row is in the model", async () => {
      const without = await openPanel([OUT, { ...ROLES }]);
      expect(modelButton(without)).toBeNull();
      expect(without.shadowRoot.querySelector(".model-link")).not.toBeNull();
      const withRow = await openPanel([OUT, SKILLS_IN]);
      expect(modelButton(withRow).textContent).toContain(
        WORDING.sectionModelButton
      );
    });

    it("renders no visualizer while closed", async () => {
      const el = await openPanel([SKILLS_IN]);
      expect(dialog(el)).toBeNull();
      expect(visualizer(el)).toBeNull();
    });

    it("opens the dialog highlighting the distinct in model objects in row order", async () => {
      const el = await openPanel([
        SKILLS_IN,
        OUT,
        ROLES_IN,
        { ...SKILLS_IN, name: "again", label: "More skills" }
      ]);
      modelButton(el).click();
      await flush();
      expect(dialog(el).getAttribute("aria-modal")).toBe("true");
      expect(visualizer(el).highlight).toBe("Skill__c,Experience__c");
      expect(visualizer(el).objects).toBeFalsy();
      expect(
        el.shadowRoot.querySelector(".dialog-heading").textContent
      ).toContain(WORDING.sectionModelHeading);
      expect(el.shadowRoot.activeElement.className).toContain("dialog-heading");
    });

    it("closes on Escape and returns focus to the marker button", async () => {
      const el = await openPanel([SKILLS_IN]);
      modelButton(el).click();
      await flush();
      dialog(el).dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      );
      await flush();
      expect(dialog(el)).toBeNull();
      expect(visualizer(el)).toBeNull();
      expect(el.shadowRoot.activeElement).toBe(button(el));
    });

    it("closes with the close button and on a backdrop click", async () => {
      const el = await openPanel([SKILLS_IN]);
      modelButton(el).click();
      await flush();
      el.shadowRoot.querySelector(".model-close-button").click();
      await flush();
      expect(dialog(el)).toBeNull();
      expect(el.shadowRoot.activeElement).toBe(button(el));
      button(el).click();
      await flush();
      modelButton(el).click();
      await flush();
      dialog(el).click();
      await flush();
      expect(dialog(el)).toBeNull();
    });
  });

  describe("panel placement", () => {
    // jsdom applies no stylesheet and lays nothing out, so the computed position and the
    // panel's box are given here.
    let computedStyle;
    let rect;

    beforeEach(() => {
      computedStyle = jest
        .spyOn(window, "getComputedStyle")
        .mockReturnValue({ position: "absolute" });
      rect = jest.spyOn(Element.prototype, "getBoundingClientRect");
    });

    afterEach(() => {
      computedStyle.mockRestore();
      rect.mockRestore();
    });

    async function openWithPanelRight(right) {
      rect.mockReturnValue({ left: right - 352, right, top: 0, bottom: 0 });
      const el = create({ sourceKeys: "a" });
      getSources.emit([ROLES]);
      await flush();
      button(el).click();
      await flush();
      await flush();
      return el;
    }

    it("opens from the button's start when the panel fits the window", async () => {
      const el = await openWithPanelRight(window.innerWidth - 40);
      expect(panel(el).className).toBe("panel");
    });

    it("opens from the button's end when the panel would run past the window", async () => {
      const el = await openWithPanelRight(window.innerWidth + 120);
      expect(panel(el).classList.contains("panel_end")).toBe(true);
    });

    it("measures again on each opening", async () => {
      const el = await openWithPanelRight(window.innerWidth + 120);
      button(el).click();
      await flush();
      rect.mockReturnValue({ left: 0, right: 352, top: 0, bottom: 0 });
      button(el).click();
      await flush();
      await flush();
      expect(panel(el).className).toBe("panel");
    });

    it("leaves the panel in the flow on a phone", async () => {
      computedStyle.mockReturnValue({ position: "static" });
      const el = await openWithPanelRight(window.innerWidth + 120);
      expect(panel(el).className).toBe("panel");
    });
  });

  it("reports expanded state on the button", async () => {
    const el = create({ sourceKeys: "a" });
    getSources.emit([ROLES]);
    await flush();
    expect(button(el).getAttribute("aria-expanded")).toBe("false");
    button(el).click();
    await flush();
    expect(button(el).getAttribute("aria-expanded")).toBe("true");
    button(el).click();
    await flush();
    expect(button(el).getAttribute("aria-expanded")).toBe("false");
    expect(panel(el)).toBeNull();
  });

  it("closes on Escape and returns focus to the button", async () => {
    const el = create({ sourceKeys: "a" });
    getSources.emit([ROLES]);
    await flush();
    button(el).click();
    await flush();
    el.shadowRoot.querySelector(".model-link").focus();
    el.shadowRoot
      .querySelector(".marker")
      .dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      );
    await flush();
    expect(panel(el)).toBeNull();
    expect(button(el).getAttribute("aria-expanded")).toBe("false");
    expect(el.shadowRoot.activeElement).toBe(button(el));
  });

  it("closes with the Close button and returns focus", async () => {
    const el = create({ sourceKeys: "a" });
    getSources.emit([ROLES]);
    await flush();
    button(el).click();
    await flush();
    el.shadowRoot.querySelector(".close-button").click();
    await flush();
    expect(panel(el)).toBeNull();
    expect(el.shadowRoot.activeElement).toBe(button(el));
  });

  it("still says the data is live when the read is empty", async () => {
    const el = create({ sourceKeys: "a" });
    getSources.emit([]);
    await flush();
    expect(button(el).textContent).toContain("Live from Salesforce");
    expect(el.shadowRoot.querySelector(".marker-counts")).toBeNull();
    button(el).click();
    await flush();
    expect(panel(el).textContent).toContain(WORDING.explanation);
    expect(el.shadowRoot.querySelector(".sources")).toBeNull();
    expect(el.shadowRoot.querySelector(".model-link")).not.toBeNull();
  });

  it("still says the data is live when the read fails", async () => {
    const el = create({ sourceKeys: "a", objects: "Skill__c" });
    getSources.error();
    getObjectSources.error();
    await flush();
    expect(button(el).textContent).toContain("Live from Salesforce");
    expect(el.shadowRoot.querySelector(".marker-counts")).toBeNull();
    button(el).click();
    await flush();
    expect(panel(el).textContent).toContain(WORDING.explanation);
    expect(el.shadowRoot.querySelector(".sources")).toBeNull();
  });

  it("still says the data is live with no keys at all", async () => {
    const el = create();
    await flush();
    expect(button(el).textContent).toContain("Live from Salesforce");
    expect(getSources.getLastConfig()).toEqual({});
  });

  it("shows no number anywhere when hideCounts is set", async () => {
    const el = create({ sourceKeys: "a", hideCounts: true });
    getSources.emit([ROLES, SKILLS]);
    await flush();
    expect(button(el).textContent).toContain("Live from Salesforce");
    expect(el.shadowRoot.querySelector(".marker-counts")).toBeNull();
    expect(button(el).getAttribute("aria-label")).toBe("Live from Salesforce");
    button(el).click();
    await flush();
    const items = [...el.shadowRoot.querySelectorAll(".source")];
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain("Roles");
    expect(items[0].textContent).not.toContain("Resume roles");
    expect(panel(el).textContent).not.toMatch(/[0-9]/);
  });

  it("ships the rules that let the marker wrap and keep the panel on screen", () => {
    const css = require("fs").readFileSync(
      require("path").join(__dirname, "..", "dataSource.css"),
      "utf8"
    );
    const rule = (selector, from = 0) => {
      const start = css.indexOf(`${selector} {`, from);
      return start < 0 ? "" : css.slice(start, css.indexOf("}", start));
    };
    expect(rule(":host")).toContain("max-width: 100%");
    expect(css).toContain("min-height: 44px");
    const buttonRule = rule(".marker-button");
    expect(buttonRule).toContain("flex-wrap: wrap");
    expect(buttonRule).toContain("max-width: 100%");
    expect(buttonRule).toContain("white-space: normal");
    expect(rule(".marker-counts")).toContain("overflow-wrap: anywhere");
    expect(rule(".panel")).toContain("max-width: calc(100vw - 2rem)");
    const narrow = css.indexOf("@media (max-width: 600px)");
    expect(narrow).toBeGreaterThan(-1);
    expect(rule(".panel", narrow)).toContain("position: static");
  });
});
