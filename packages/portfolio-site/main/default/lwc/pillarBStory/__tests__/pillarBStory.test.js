/**
 * @description       : Unit tests for pillarBStory: the seven sections, captioned tables, the
 *                      marked D3 and D8 placeholders, the architecture image and its alt text,
 *                      and tokens only in the CSS.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/22/2026
 **/
import { readFileSync } from "fs";
import { join } from "path";
import { createElement } from "@lwc/engine-dom";
import PillarBStory, { VIDEO_URL } from "c/pillarBStory";
import { trackEvent } from "c/analyticsService";

jest.mock(
  "c/analyticsService",
  () => ({
    trackEvent: jest.fn(),
    EVENTS: { PILLAR_VIDEO_OPENED: "pillar_video_opened" }
  }),
  { virtual: true }
);

const HEADINGS = [
  "1. The client",
  "2. Discovery",
  "3. The decision matrix",
  "4. ROI and cost",
  "5. Solution design",
  "6. Video prototype",
  "7. Outcome"
];

function createComponent() {
  const element = createElement("c-pillar-b-story", { is: PillarBStory });
  document.body.appendChild(element);
  return element;
}

const q = (element, selector) => element.shadowRoot.querySelector(selector);
const qa = (element, selector) =>
  Array.from(element.shadowRoot.querySelectorAll(selector));
const text = (node) => node.textContent.replace(/\s+/g, " ").trim();

describe("c-pillar-b-story", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    jest.clearAllMocks();
  });

  it("renders the seven section headings in order", () => {
    const element = createComponent();
    expect(qa(element, "h2.section-heading").map(text)).toEqual(HEADINGS);
  });

  it("gives both tables a caption and header cells with scope", () => {
    const element = createComponent();
    const tables = qa(element, "table");
    expect(tables).toHaveLength(2);
    tables.forEach((table) => {
      expect(text(table.querySelector("caption")).length).toBeGreaterThan(0);
      expect(table.querySelectorAll('th[scope="col"]').length).toBeGreaterThan(
        0
      );
      expect(table.querySelectorAll('th[scope="row"]').length).toBeGreaterThan(
        0
      );
    });
    expect(text(tables[0].querySelector("caption"))).toBe(
      "Lifecycle concepts mapped to each option's objects"
    );
    expect(tables[1].querySelectorAll("tbody tr")).toHaveLength(3);
  });

  it("marks Education Cloud names as not verified in an org", () => {
    const element = createComponent();
    expect(text(q(element, ".footnote"))).toContain(
      "They are not verified in an org."
    );
  });

  it("names a public source on every ROI row", () => {
    const element = createComponent();
    const rows = qa(element, "table")[1].querySelectorAll("tbody tr");
    rows.forEach((row) => {
      const links = row.querySelectorAll("a[href^='https://']");
      expect(links.length).toBeGreaterThan(0);
      links.forEach((a) => expect(a.rel).toBe("noopener noreferrer"));
    });
  });

  it("opens section 2 with the marked D3 framing placeholder", () => {
    const element = createComponent();
    const discovery = q(element, '[data-section="discovery"]');
    const first = discovery.querySelector("p");
    expect(first.dataset.placeholder).toBe("D3");
    expect(text(first)).toBe(
      "PLACEHOLDER: how the comparison is framed pending the owner's answer (D3)."
    );
  });

  it("shows only the marked D8 placeholder for the video and fires nothing", () => {
    expect(VIDEO_URL).toBeNull();
    const element = createComponent();
    const video = q(element, '[data-section="video"]');
    expect(video.querySelector("a")).toBeNull();
    const line = video.querySelector('[data-placeholder="D8"]');
    expect(text(line)).toBe(
      "PLACEHOLDER: video prototype link pending the owner's answer (D8)"
    );
    line.click();
    expect(trackEvent).not.toHaveBeenCalled();
  });

  it("shows the redrawn architecture from NL_Assets with alt text", () => {
    const element = createComponent();
    const img = q(element, "img.architecture-image");
    expect(img.getAttribute("src")).toContain(
      "NL_Assets/minimalist-architecture.svg"
    );
    expect(img.getAttribute("alt")).toContain("Object model");
    expect(text(q(element, "figcaption"))).toBe(
      "Minimalist architecture, redrawn from public object names."
    );
    expect(qa(element, "ul.decisions li")).toHaveLength(6);
  });

  it("never names the client", () => {
    const element = createComponent();
    const all = text(q(element, "article"));
    expect(all).toContain("regional adult literacy nonprofit");
    expect(all).not.toMatch(/Greenville|GLA\b|Literacy Association/);
  });

  it("styles only with design tokens, never a hex colour", () => {
    const css = readFileSync(join(__dirname, "..", "pillarBStory.css"), "utf8");
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});
