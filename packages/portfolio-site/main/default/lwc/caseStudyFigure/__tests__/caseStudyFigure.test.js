/**
 * @description       : Unit tests for caseStudyFigure LWC: each of the four keys draws its SVG
 *                      with its label, the private tag shows on the two client works and not
 *                      on the others, an unknown or blank key draws nothing and hides the host,
 *                      a key change redraws, and the markup holds no literal colour and stays
 *                      under 6 KB per picture.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 11/20/2026
 **/
import { createElement } from "@lwc/engine-dom";
import { readFileSync } from "fs";
import { join } from "path";
import CaseStudyFigure, { FIGURES } from "c/caseStudyFigure";

const mount = (key) => {
  const el = createElement("c-case-study-figure", { is: CaseStudyFigure });
  if (key !== undefined) el.figureKey = key;
  document.body.appendChild(el);
  return el;
};
const svg = (el) => el.shadowRoot.querySelector("svg.full");
const thumb = (el) => el.shadowRoot.querySelector("svg.thumb");
const tagEl = (el) => el.shadowRoot.querySelector("span.tag");
const texts = (el) =>
  Array.from(el.shadowRoot.querySelectorAll("svg.full text")).map(
    (t) => t.textContent
  );

afterEach(() => {
  while (document.body.firstChild)
    document.body.removeChild(document.body.firstChild);
});

describe("c-case-study-figure", () => {
  it.each(Object.keys(FIGURES))("%s draws one labelled image", (key) => {
    const el = mount(key);
    const picture = svg(el);
    expect(picture).not.toBeNull();
    expect(picture.getAttribute("role")).toBe("img");
    expect(picture.getAttribute("aria-label")).toBe(FIGURES[key].label);
    expect(picture.getAttribute("viewBox")).toBe("0 0 320 240");
    expect(el.classList.contains("is-empty")).toBe(false);
  });

  it.each(["literacy-platform", "employer-hub"])(
    "%s carries the private tag as HTML text outside both drawings",
    (key) => {
      const el = mount(key);
      const tag = tagEl(el);
      expect(tag.textContent).toBe("Client work, private");
      expect(tag.closest("svg")).toBeNull();
      expect(texts(el)).not.toContain("Client work, private");
      expect(FIGURES[key].label).toMatch(/client work, private/i);
    }
  );

  it.each(["site-org", "glassops"])("%s carries no private tag", (key) => {
    const el = mount(key);
    expect(tagEl(el)).toBeNull();
  });

  it.each(Object.keys(FIGURES))(
    "%s also draws a shapes only thumbnail with the same label and no text",
    (key) => {
      const el = mount(key);
      const t = thumb(el);
      expect(t).not.toBeNull();
      expect(t.getAttribute("viewBox")).toBe("0 0 160 120");
      expect(t.getAttribute("role")).toBe("img");
      expect(t.getAttribute("aria-label")).toBe(FIGURES[key].label);
      expect(t.querySelectorAll("text")).toHaveLength(0);
    }
  );

  it("switches to the thumbnail under 320 px by container query and keeps the tag in the flow", () => {
    const css = readFileSync(
      join(__dirname, "..", "caseStudyFigure.css"),
      "utf8"
    );
    const q = css.slice(css.indexOf("@container (max-width: 319px)"));
    expect(q).toMatch(/\.full \{\s*display: none/);
    expect(q).toMatch(/\.thumb \{\s*display: block/);
    expect(q).toMatch(/\.tag \{[^}]*position: static/);
  });

  it("draws the eight numbered steps of the Employer Hub", () => {
    const el = mount("employer-hub");
    const numbers = texts(el).filter((t) => /^[1-8]$/.test(t));
    expect(numbers).toEqual(["1", "2", "3", "4", "5", "6", "7", "8"]);
  });

  it("draws the signed permit between the gate and the deploy", () => {
    const el = mount("glassops");
    const all = texts(el);
    expect(all).toEqual(
      expect.arrayContaining([
        "Plan",
        "Validate",
        "Gate",
        "Signed",
        "permit",
        "Deploy",
        "Verify"
      ])
    );
    expect(all.indexOf("Gate")).toBeLessThan(all.indexOf("Signed"));
    expect(all.indexOf("Signed")).toBeLessThan(all.indexOf("Deploy"));
  });

  it("draws three options against ten criteria for the matrix", () => {
    const el = mount("literacy-platform");
    expect(el.shadowRoot.querySelectorAll("svg.full rect.cell")).toHaveLength(
      30
    );
    expect(texts(el)).toEqual(
      expect.arrayContaining([
        "NPSP + PMM",
        "Education Cloud",
        "Nonprofit Cloud"
      ])
    );
  });

  it.each([
    undefined,
    "",
    "   ",
    "unknown",
    "constructor",
    "Glassops",
    null,
    7
  ])("draws nothing and hides the host for %p", (key) => {
    const el = mount(key);
    expect(svg(el)).toBeNull();
    expect(el.shadowRoot.querySelectorAll("text")).toHaveLength(0);
    expect(el.classList.contains("is-empty")).toBe(true);
  });

  it("redraws when the key changes", async () => {
    const el = mount("glassops");
    el.figureKey = "site-org";
    await Promise.resolve();
    expect(svg(el).getAttribute("aria-label")).toBe(FIGURES["site-org"].label);
    el.figureKey = "nope";
    await Promise.resolve();
    expect(svg(el)).toBeNull();
    expect(el.classList.contains("is-empty")).toBe(true);
  });

  describe("source", () => {
    const dir = join(__dirname, "..");
    const html = readFileSync(join(dir, "caseStudyFigure.html"), "utf8");
    const css = readFileSync(join(dir, "caseStudyFigure.css"), "utf8");

    it("uses no literal colour in the markup or the style", () => {
      expect(html).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|hsl\(|fill="|stroke="/i);
      expect(css).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|hsl\(/i);
    });

    it.each(Object.keys(FIGURES))("%s is under 6 KB", (key) => {
      const el = mount(key);
      const bytes = Buffer.byteLength(
        new XMLSerializer().serializeToString(svg(el)),
        "utf8"
      );
      expect(bytes).toBeLessThan(6144);
    });

    it("keeps every text at 12 px or more", () => {
      const sizes = [...css.matchAll(/font-size:\s*(\d+)px/g)].map((m) =>
        Number(m[1])
      );
      expect(Math.min(...sizes)).toBeGreaterThanOrEqual(12);
    });
  });
});
