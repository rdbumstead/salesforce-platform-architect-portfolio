/**
 * @description       : Unit tests for storyDecisions: the alternatives and related decisions of
 *                      each of the four stories, the address each link opens, a blank or unknown
 *                      key drawing nothing, the checks that every named decision record exists in
 *                      docs/adr and that every in-site link has a Source_File record, the text
 *                      rules, and tokens only in the CSS.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 11/20/2026
 **/
import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";
import { createElement } from "@lwc/engine-dom";
import StoryDecisions from "c/storyDecisions";
import { STORIES } from "../storyData";

jest.mock(
  "c/footer",
  () => ({
    __esModule: true,
    REPO_URL:
      "https://github.com/rdbumstead/salesforce-platform-architect-portfolio"
  }),
  { virtual: true }
);

jest.mock(
  "@salesforce/community/basePath",
  () => ({ __esModule: true, default: "/portfolio" }),
  { virtual: true }
);

const KEYS = [
  "business-architecture",
  "nonprofit-solutions",
  "delivery",
  "glassops"
];
const ROOT = join(__dirname, "..", "..", "..", "..", "..", "..", "..");
const ADR_DIR = join(ROOT, "docs", "adr");
const META_DIR = join(
  ROOT,
  "packages",
  "portfolio-site",
  "main",
  "default",
  "customMetadata"
);

function create(storyKey) {
  const element = createElement("c-story-decisions", { is: StoryDecisions });
  if (storyKey !== undefined) {
    element.storyKey = storyKey;
  }
  document.body.appendChild(element);
  return element;
}

const qa = (element, selector) =>
  Array.from(element.shadowRoot.querySelectorAll(selector));
const text = (node) => node.textContent.replace(/\s+/g, " ").trim();

describe("c-story-decisions", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  });

  it.each(KEYS)("draws both sections for %s, alternatives first", (key) => {
    const element = create(key);
    const headings = qa(element, "h2.section-heading").map(text);
    expect(headings).toEqual(["Alternatives considered", "Related decisions"]);
    const sections = qa(element, "section");
    sections.forEach((section) => {
      const heading = section.querySelector("h2");
      expect(section.getAttribute("aria-labelledby")).toBe(heading.id);
    });
  });

  it.each(KEYS)(
    "gives %s three to five alternatives, each an option and a reason",
    (key) => {
      const element = create(key);
      const items = qa(element, '[data-id="alternative"]');
      expect(items.length).toBeGreaterThanOrEqual(3);
      expect(items.length).toBeLessThanOrEqual(5);
      items.forEach((item) => {
        expect(text(item.querySelector(".option")).length).toBeGreaterThan(0);
        expect(text(item.querySelector(".why")).length).toBeGreaterThan(0);
      });
    }
  );

  it("opens a record the docs viewer lists in the viewer, under the base path", () => {
    const element = create("nonprofit-solutions");
    const links = qa(element, '[data-id="adr-link"]');
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute("href")).toBe("/portfolio/docs?doc=adr-030");
    expect(links[0].getAttribute("target")).toBeNull();
    expect(text(links[0])).toBe("ADR-030: Decision Matrix as Custom Metadata");
  });

  it("opens any other record on GitHub in a new tab and says so", () => {
    const element = create("glassops");
    const link = qa(element, '[data-id="adr-link"]').find(
      (a) => a.dataset.adr === "044"
    );
    expect(link.getAttribute("href")).toBe(
      "https://github.com/rdbumstead/salesforce-platform-architect-portfolio/blob/main/docs/adr/044-glassops-makes-the-production-deploy.md"
    );
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(text(link)).toContain("on GitHub");
    expect(text(link)).toContain("opens in a new tab");
  });

  it("links the site story to the deploy decision", () => {
    const element = create("delivery");
    const numbers = qa(element, '[data-id="adr-link"]').map(
      (a) => a.dataset.adr
    );
    expect(numbers).toEqual(["008", "007", "019", "006", "044", "041"]);
  });

  it.each([undefined, "", "   ", "unknown", "constructor", "__proto__"])(
    "draws nothing for the key %p",
    (key) => {
      const element = create(key);
      expect(element.shadowRoot.querySelector("section")).toBeNull();
      expect(element.shadowRoot.querySelector("h2")).toBeNull();
    }
  );
});

describe("the story data", () => {
  const entries = KEYS.flatMap((key) =>
    STORIES[key].related.map((entry) => [key, entry])
  );

  it("holds exactly the four stories", () => {
    expect(Object.keys(STORIES).sort()).toEqual([...KEYS].sort());
  });

  it.each(entries)("%s names a decision record that exists", (_key, entry) => {
    const file = readdirSync(ADR_DIR).find((name) =>
      name.startsWith(`${entry.adr}-`)
    );
    expect(file).toBeDefined();
    const heading = readFileSync(join(ADR_DIR, file), "utf8").split(/\r?\n/)[0];
    expect(heading.startsWith(`# ADR-${entry.adr}: `)).toBe(true);
    expect(entry.onDocs ? file : entry.file).toBe(file);
    expect(existsSync(join(ADR_DIR, file))).toBe(true);
  });

  it.each(entries)(
    "%s opens in the docs viewer only when the viewer lists it",
    (_key, entry) => {
      const record = join(
        META_DIR,
        `Source_File.docs_adr_${entry.adr}.md-meta.xml`
      );
      expect(existsSync(record)).toBe(entry.onDocs);
    }
  );

  it("follows the writing rules: no dash, no semicolon, no hyphen as punctuation", () => {
    const all = [];
    KEYS.forEach((key) => {
      STORIES[key].alternatives.forEach((item) =>
        all.push(item.option, item.why)
      );
      STORIES[key].related.forEach((entry) => all.push(entry.note));
    });
    all.forEach((line) => {
      expect(line).not.toMatch(/[–—;]/);
      expect(line).not.toMatch(/ - /);
    });
  });

  it("names no vendor product, private note or open source toolkit", () => {
    const joined = JSON.stringify(STORIES).toLowerCase();
    [
      "gearset",
      "copado",
      "flosum",
      "autorabit",
      "opsera",
      "sfdx-hardis",
      "cumulusci",
      "sfpowerscripts",
      "private"
    ].forEach((name) => {
      expect(joined).not.toContain(name);
    });
  });
});

describe("storyDecisions.css", () => {
  const css = readFileSync(
    join(__dirname, "..", "storyDecisions.css"),
    "utf8"
  ).replace(/\/\*[\s\S]*?\*\//g, "");

  it("uses tokens for colour and no literal colour", () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(css).not.toMatch(/\brgba?\(/);
  });

  it("keeps each link row at least 24 px tall", () => {
    expect(css).toMatch(/min-height:\s*24px/);
  });
});
