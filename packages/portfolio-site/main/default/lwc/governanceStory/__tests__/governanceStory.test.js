/**
 * @description       : Unit tests for governanceStory: the Context and Decision sections with
 *                      their labels, the six controls in order, an auditor line and a proof link
 *                      on each, the link targets, and the text rules (no certification claim, no
 *                      client, no dash or semicolon).
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 11/21/2026
 **/
import { readFileSync } from "fs";
import { join } from "path";
import { createElement } from "@lwc/engine-dom";
import GovernanceStory, { CONTROLS } from "c/governanceStory";

jest.mock(
  "@salesforce/community/basePath",
  () => ({ __esModule: true, default: "/portfolio" }),
  { virtual: true }
);

const REPO =
  "https://github.com/rdbumstead/salesforce-platform-architect-portfolio";

function create() {
  const element = createElement("c-governance-story", { is: GovernanceStory });
  document.body.appendChild(element);
  return element;
}

const q = (element, selector) => element.shadowRoot.querySelector(selector);
const qa = (element, selector) =>
  Array.from(element.shadowRoot.querySelectorAll(selector));
const text = (node) => node.textContent.replace(/\s+/g, " ").trim();

describe("c-governance-story", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  });

  it("draws Context then Decision, each with its label and a labelled section", () => {
    const element = create();
    expect(qa(element, '[data-id="part-label"]').map(text)).toEqual([
      "Context",
      "Decision"
    ]);
    const sections = qa(element, "section");
    expect(sections).toHaveLength(2);
    sections.forEach((section) => {
      expect(section.getAttribute("aria-labelledby")).toBe(
        section.querySelector("h2").id
      );
    });
  });

  it("says plainly that it is not a certification", () => {
    const element = create();
    expect(text(q(element, '[data-id="no-certification"]'))).toContain(
      "This is not a certification"
    );
  });

  it("links the GlassOps page under the base path", () => {
    const element = create();
    expect(
      q(element, '[data-id="glassops-page-link"]').getAttribute("href")
    ).toBe("/portfolio/glassops");
  });

  it("draws the six controls in order, each under an h3", () => {
    const element = create();
    const controls = qa(element, '[data-id="control"]');
    expect(controls.map((node) => node.dataset.control)).toEqual([
      "approval",
      "gate",
      "parity",
      "leak-scan",
      "tokens",
      "kill-switches"
    ]);
    controls.forEach((node, index) => {
      expect(text(node.querySelector("h3"))).toBe(CONTROLS[index].title);
    });
  });

  it("gives every control an auditor line and at least one proof link", () => {
    const element = create();
    qa(element, '[data-id="control"]').forEach((node) => {
      expect(text(node.querySelector('[data-id="audit"]'))).toMatch(
        /^An auditor would test: \S/
      );
      expect(
        text(node.querySelector('[data-id="does"]')).length
      ).toBeGreaterThan(40);
      expect(
        node.querySelectorAll('[data-id="proof-link"]').length
      ).toBeGreaterThan(0);
    });
  });

  it("opens a file on GitHub in a new tab", () => {
    const element = create();
    const links = qa(element, '[data-id="proof-link"]');
    const files = links.filter((link) =>
      link.getAttribute("href").startsWith(REPO)
    );
    expect(files.length).toBeGreaterThan(5);
    expect(files.map((link) => link.getAttribute("href"))).toEqual(
      expect.arrayContaining([
        `${REPO}/blob/main/.github/workflows/deploy.yml`,
        `${REPO}/blob/main/web/build/leak-scan.mjs`
      ])
    );
    expect(
      files.every(
        (link) =>
          link.getAttribute("href").includes("/blob/main/") &&
          link.getAttribute("target") === "_blank" &&
          link.getAttribute("rel") === "noopener noreferrer" &&
          text(link).includes("opens in a new tab")
      )
    ).toBe(true);
  });

  it("opens a decision record in the docs viewer, in the same tab", () => {
    const element = create();
    const records = qa(element, '[data-id="proof-link"]').filter(
      (link) => !link.getAttribute("href").startsWith(REPO)
    );
    expect(records.map((link) => link.getAttribute("href"))).toEqual([
      "/portfolio/docs?doc=adr-044",
      "/portfolio/docs?doc=adr-041",
      "/portfolio/docs?doc=adr-028"
    ]);
    expect(
      records.every(
        (link) =>
          link.getAttribute("target") === null &&
          !text(link).includes("opens in a new tab")
      )
    ).toBe(true);
  });

  it("points every proof at a file that exists in the repository", () => {
    const root = join(__dirname, "..", "..", "..", "..", "..", "..", "..");
    CONTROLS.flatMap((control) => control.proofs)
      .filter((proof) => proof.href.startsWith(REPO))
      .forEach((proof) => {
        const file = proof.href.slice(`${REPO}/blob/main/`.length);
        expect(() => readFileSync(join(root, file))).not.toThrow();
      });
  });

  it("is honest that one person approves", () => {
    const element = create();
    expect(text(q(element, '[data-control="approval"]'))).toContain(
      "I am the only person on this project"
    );
  });

  it("names no client, employer, org or certification and uses no dash or semicolon", () => {
    const body = JSON.stringify(CONTROLS).toLowerCase();
    const template = readFileSync(
      join(__dirname, "..", "governanceStory.html"),
      "utf8"
    ).toLowerCase();
    ["telus", "00dfj", "0afhp", "soc 2", "iso 27001", "sox"].forEach((name) => {
      expect(body).not.toContain(name);
      expect(template).not.toContain(name);
    });
    const prose = [
      ...CONTROLS.flatMap((control) => [
        control.title,
        control.does,
        control.audit,
        ...control.proofs.map((proof) => proof.label)
      ]),
      template.replace(/&#32;/g, " ").replace(/<[^>]*>/g, " ")
    ].join(" ");
    expect(prose).not.toMatch(/[–—;]/);
    expect(prose).not.toMatch(/ - /);
  });

  it("uses tokens only in the CSS", () => {
    const css = readFileSync(
      join(__dirname, "..", "governanceStory.css"),
      "utf8"
    ).replace(/\/\*[\s\S]*?\*\//g, "");
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(css).not.toMatch(/\brgba?\(/);
  });
});
