/**
 * @description       : Unit tests for projectAssetGallery (Round 5 plan M5, Round 6 empty rule). The GraphQL wire adapter,
 *                      the site base path and c/analyticsService are mocked.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/22/2026
 **/
import { createElement } from "@lwc/engine-dom";
import ProjectAssetGallery, { resolveAssetUrl } from "c/projectAssetGallery";
// Same module as the component, which the Round 3 plan pins.
// eslint-disable-next-line @lwc/lwc/newer-version-available
import { graphql } from "lightning/uiGraphQLApi";
import { trackEvent } from "c/analyticsService";

// config/jest.config.js maps every lightning/* import to one universal mock, so the
// factory keeps it as the default export and adds a test wire adapter for graphql.
jest.mock(
  "lightning/uiGraphQLApi",
  () => {
    const {
      createTestWireAdapter
    } = require("@salesforce/wire-service-jest-util");
    const universal = jest.requireActual("lightning/uiGraphQLApi");
    return {
      __esModule: true,
      default: universal.default,
      graphql: createTestWireAdapter(jest.fn()),
      gql: jest.fn()
    };
  },
  { virtual: true }
);

jest.mock(
  "@salesforce/community/basePath",
  () => ({ __esModule: true, default: "/portfolio" }),
  { virtual: true }
);

jest.mock(
  "c/analyticsService",
  () => ({
    trackEvent: jest.fn(),
    EVENTS: { GALLERY_ASSET_OPENED: "gallery_asset_opened" }
  }),
  { virtual: true }
);

const PAYLOAD = require("./data/galleryPayload.json");

async function flushPromises() {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
  }
}

function mount(
  props = { pillar: "A", heading: "Process maps and dashboards" }
) {
  const element = createElement("c-project-asset-gallery", {
    is: ProjectAssetGallery
  });
  Object.assign(element, props);
  document.body.appendChild(element);
  return element;
}

function qa(element, selector) {
  return element.shadowRoot.querySelectorAll(selector);
}

function q(element, selector) {
  return element.shadowRoot.querySelector(selector);
}

describe("resolveAssetUrl", () => {
  it("keeps http and https URLs as they are", () => {
    expect(resolveAssetUrl("https://example.com/a.png", "/portfolio")).toBe(
      "https://example.com/a.png"
    );
    expect(resolveAssetUrl(" http://example.com/b ", "/portfolio")).toBe(
      "http://example.com/b"
    );
  });

  it("turns resource:<Name>/<path> into the site's static resource path", () => {
    expect(
      resolveAssetUrl("resource:EH_Assets/flow-part-1.svg", "/portfolio")
    ).toBe("/portfolio/sfsites/c/resource/EH_Assets/flow-part-1.svg");
    expect(resolveAssetUrl("resource:EH_Assets/a b.svg", "")).toBe(
      "/sfsites/c/resource/EH_Assets/a%20b.svg"
    );
  });

  it("refuses blank values, other schemes and unsafe resource paths", () => {
    expect(resolveAssetUrl(null, "/portfolio")).toBeNull();
    expect(resolveAssetUrl("   ", "/portfolio")).toBeNull();
    expect(
      resolveAssetUrl(["java", "script:alert(1)"].join(""), "/portfolio")
    ).toBeNull();
    expect(resolveAssetUrl("/relative/path.png", "/portfolio")).toBeNull();
    expect(resolveAssetUrl("resource:../secret", "/portfolio")).toBeNull();
    expect(resolveAssetUrl("resource:EH_Assets/../x", "/portfolio")).toBeNull();
    expect(resolveAssetUrl("resource:1bad/x.svg", "/portfolio")).toBeNull();
  });
});

describe("c-project-asset-gallery", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    jest.clearAllMocks();
  });

  it("queries the pillar it is given", async () => {
    mount();
    await flushPromises();

    expect(graphql.getLastConfig().variables).toEqual({ pillar: "A" });
  });

  it("renders every type in sort order with the heading", async () => {
    const element = mount();
    graphql.emit({ data: PAYLOAD, errors: undefined });
    await flushPromises();

    expect(q(element, ".gallery-title").textContent).toBe(
      "Process maps and dashboards"
    );
    const names = Array.from(qa(element, ".asset .asset-name")).map((node) =>
      node.textContent.trim()
    );
    expect(names).toEqual([
      "Process flow, part 1",
      "Hosted image",
      "Walkthrough video",
      "Reference article",
      "Employer Hub demo deck",
      "Published deck"
    ]);
  });

  it("renders images with their alt text, opening full size in a new tab", async () => {
    const element = mount();
    graphql.emit({ data: PAYLOAD, errors: undefined });
    await flushPromises();

    const images = qa(element, "img.image");
    expect(images).toHaveLength(2);
    expect(images[0].getAttribute("alt")).toBe(
      "Process flow, part 1: inquiry, triage, routing and outcome"
    );
    expect(images[0].getAttribute("src")).toBe(
      "/portfolio/sfsites/c/resource/EH_Assets/flow-part-1.svg"
    );
    expect(images[1].getAttribute("src")).toBe(
      "https://example.com/hosted.png"
    );
    const link = qa(element, "a.image-link")[0];
    expect(link.getAttribute("href")).toBe(
      "/portfolio/sfsites/c/resource/EH_Assets/flow-part-1.svg"
    );
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener");
  });

  it("renders video and link rows as external links with no embed", async () => {
    const element = mount();
    graphql.emit({ data: PAYLOAD, errors: undefined });
    await flushPromises();

    const external = Array.from(qa(element, "a.asset-link")).filter(
      (link) => link.dataset.type === "Video" || link.dataset.type === "Link"
    );
    expect(external.map((link) => link.getAttribute("href"))).toEqual([
      "https://video.example.com/watch/1",
      "https://example.com/article"
    ]);
    external.forEach((link) => {
      expect(link.getAttribute("rel")).toBe("noopener");
      expect(link.getAttribute("target")).toBe("_blank");
    });
    expect(q(element, "iframe")).toBeNull();
    expect(q(element, "video")).toBeNull();
  });

  it("renders a document with a URL as a download link and one without as plain text", async () => {
    const element = mount();
    graphql.emit({ data: PAYLOAD, errors: undefined });
    await flushPromises();

    const download = q(element, 'a.asset-link[data-type="Document"]');
    expect(download.getAttribute("href")).toBe(
      "/portfolio/sfsites/c/resource/EH_Assets/deck.pdf"
    );
    expect(download.hasAttribute("download")).toBe(true);
    const unavailable = qa(element, ".asset-unavailable");
    expect(unavailable).toHaveLength(1);
    expect(unavailable[0].textContent).toContain("Employer Hub demo deck");
    expect(unavailable[0].textContent).toContain("Not available yet");
  });

  it("tracks gallery_asset_opened with the type and pillar", async () => {
    const element = mount();
    graphql.emit({ data: PAYLOAD, errors: undefined });
    await flushPromises();

    const link = qa(element, "a.image-link")[0];
    link.addEventListener("click", (event) => event.preventDefault());
    link.click();

    expect(trackEvent).toHaveBeenCalledWith("gallery_asset_opened", {
      type: "Image",
      pillar: "A"
    });
  });

  it("renders nothing, not even the heading, when the pillar has no assets", async () => {
    const element = mount();
    graphql.emit({
      data: { uiapi: { query: { Project__c: { edges: [] } } } },
      errors: undefined
    });
    await flushPromises();

    expect(element.shadowRoot.childNodes).toHaveLength(0);
    expect(q(element, ".gallery-title")).toBeNull();
    expect(element.shadowRoot.textContent).not.toMatch(/No project materials/);
  });

  it("renders nothing without a valid pillar", async () => {
    const element = mount({ pillar: "Z", heading: "Materials" });
    await flushPromises();

    expect(element.shadowRoot.childNodes).toHaveLength(0);
  });

  it("renders nothing, not even an error line, when the query fails", async () => {
    const element = mount();
    graphql.emit({ data: undefined, errors: [{ message: "boom" }] });
    await flushPromises();

    expect(element.shadowRoot.childNodes).toHaveLength(0);
    expect(element.shadowRoot.textContent).not.toMatch(/could not be loaded/);
  });

  it("renders nothing while loading, then the heading and assets once they arrive", async () => {
    const element = mount();
    await flushPromises();
    expect(q(element, ".gallery")).toBeNull();

    graphql.emit({ data: PAYLOAD, errors: undefined });
    await flushPromises();

    expect(q(element, ".gallery-title").textContent).toBe(
      "Process maps and dashboards"
    );
    expect(qa(element, "li.asset").length).toBeGreaterThan(0);
  });
});
