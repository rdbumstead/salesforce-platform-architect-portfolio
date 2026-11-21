/**
 * @description       : Unit tests for glassopsStory: the three sections in order, the permit
 *                      wording, the two links, the reasons for Go in one place, and the text rules
 *                      (no client, employer, org, deploy, vendor product, private note or
 *                      toolkit name, no dash or semicolon).
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 11/20/2026
 **/
import { readFileSync } from "fs";
import { join } from "path";
import { createElement } from "@lwc/engine-dom";
import GlassopsStory, { REPO_URL, DOCS_URL } from "c/glassopsStory";

function create() {
  const element = createElement("c-glassops-story", { is: GlassopsStory });
  document.body.appendChild(element);
  return element;
}

const q = (element, selector) => element.shadowRoot.querySelector(selector);
const qa = (element, selector) =>
  Array.from(element.shadowRoot.querySelectorAll(selector));
const text = (node) => node.textContent.replace(/\s+/g, " ").trim();

describe("c-glassops-story", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  });

  it("draws Context, Decision and Outcome as the three headings, in order", () => {
    const element = create();
    expect(qa(element, "h2.section-heading").map(text)).toEqual([
      "Context",
      "Decision",
      "Outcome"
    ]);
    qa(element, "section").forEach((section) => {
      expect(section.getAttribute("aria-labelledby")).toBe(
        section.querySelector("h2").id
      );
    });
  });

  it("links only the GlassOps repository and its docs home, in new tabs", () => {
    const element = create();
    const links = qa(element, "a");
    expect(links.map((a) => a.getAttribute("href"))).toEqual([
      "https://github.com/glassops-platform/glassops",
      "https://glassops-platform.github.io/glassops/"
    ]);
    expect(text(q(element, '[data-id="links"]'))).toBe(
      "The code is in the GlassOps repository, opens in a new tab and the docs are on the GlassOps docs site, opens in a new tab."
    );
    expect(REPO_URL).toBe(links[0].getAttribute("href"));
    expect(DOCS_URL).toBe(links[1].getAttribute("href"));
    links.forEach((a) => {
      expect(a.getAttribute("target")).toBe("_blank");
      expect(a.getAttribute("rel")).toBe("noopener noreferrer");
      expect(text(a)).toContain("opens in a new tab");
    });
  });

  it("writes signed permit in lower case, and notes the docs write PERMIT once", () => {
    const element = create();
    const body = text(q(element, "article"));
    expect(body.match(/PERMIT/g)).toHaveLength(1);
    expect(body).toContain("a signed permit (PERMIT in the docs)");
    const decision = text(q(element, '[data-section="decision"]'));
    expect(decision.indexOf("PERMIT")).toBeGreaterThan(-1);
    const context = text(q(element, '[data-section="context"]'));
    expect(context.toLowerCase()).not.toContain("permit");
  });

  it("gives the reasons for Go in one place", () => {
    const element = create();
    const paragraphs = qa(element, "p").filter((p) => /\bGo\b/.test(text(p)));
    const reasons = paragraphs.filter((p) => p.dataset.id === "go-reasons");
    expect(reasons).toHaveLength(1);
    const reasonText = text(reasons[0]);
    expect(reasonText).toContain("cloud tooling");
    expect(reasonText).toContain("type safe");
    expect(reasonText).toContain("standard library");
    expect(reasonText).toContain("one binary");
  });

  it("states the figures the outcome rests on, with the shadow caveat", () => {
    const element = create();
    const outcome = text(q(element, '[data-section="outcome"]'));
    expect(outcome).toContain("46 of 46");
    expect(outcome).toContain("20 of 20");
    expect(outcome).toContain("122 relevant tests with 0 failures");
    expect(outcome).toContain("23 compared pull request runs");
    expect(outcome).toContain("agreement on a failing change was not shown");
    expect(outcome).toContain("24 days");
    expect(outcome).toContain("740 test functions");
    expect(outcome).toContain("pinned to v1.0.2");
  });

  it("names no client, employer, org, deploy, vendor product or private note", () => {
    const template = readFileSync(
      join(__dirname, "..", "glassopsStory.html"),
      "utf8"
    ).toLowerCase();
    [
      "telus",
      "00dfj",
      "0afhp",
      "gearset",
      "copado",
      "flosum",
      "autorabit",
      "opsera",
      "sfdx-hardis",
      "cumulusci",
      "sfpowerscripts",
      "private",
      "opa",
      "cosign",
      "rego",
      "sigstore"
    ].forEach((name) => {
      expect(template).not.toMatch(new RegExp(`\\b${name}\\b`));
    });
    expect(template.replace(/&#32;/g, " ")).not.toMatch(/[–—;]/);
    expect(template).not.toMatch(/ - /);
  });

  it("uses tokens only in the CSS", () => {
    const css = readFileSync(
      join(__dirname, "..", "glassopsStory.css"),
      "utf8"
    ).replace(/\/\*[\s\S]*?\*\//g, "");
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(css).not.toMatch(/\brgba?\(/);
  });
});
