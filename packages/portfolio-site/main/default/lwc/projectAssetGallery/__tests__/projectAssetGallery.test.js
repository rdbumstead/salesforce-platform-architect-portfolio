/**
 * @description       : Unit tests for projectAssetGallery, including the rule that it renders nothing when empty.
 *                      The GraphQL wire adapter (used by the lazily loaded c/projectAssetGalleryData child),
 *                      the site base path and c/analyticsService are mocked, and the idle callback is driven by hand.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/22/2026
 **/
import { readFileSync } from "fs";
import { join } from "path";
import { createElement } from "@lwc/engine-dom";
import ProjectAssetGallery, { resolveAssetUrl } from "c/projectAssetGallery";
// Same module as the component, which the site pins.
// eslint-disable-next-line @lwc/lwc/newer-version-available
import { graphql } from "lightning/uiGraphQLApi";
import { trackEvent } from "c/analyticsService";
import { showMe } from "c/tourShowMe";

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
    await new Promise((resolve) => process.nextTick(resolve));
  }
}

// The engine renders a lwc:component under the jest stub tag, not the bundle tag name.
const CHILD = "x-test";

let idleCallbacks = [];

function runIdle() {
  const pending = idleCallbacks;
  idleCallbacks = [];
  pending.forEach((callback) => callback());
}

async function mountLoaded(props) {
  const element = mount(props);
  runIdle();
  await flushPromises();
  return element;
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
  beforeEach(() => {
    idleCallbacks = [];
    window.requestIdleCallback = jest.fn((callback) => {
      idleCallbacks.push(callback);
      return idleCallbacks.length;
    });
    window.cancelIdleCallback = jest.fn();
  });

  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    jest.clearAllMocks();
  });

  it("queries the pillar it is given", async () => {
    await mountLoaded();

    expect(graphql.getLastConfig().variables).toEqual({ pillar: "A" });
  });

  it("renders every type in sort order with the heading", async () => {
    const element = await mountLoaded();
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
    const element = await mountLoaded();
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
    const element = await mountLoaded();
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
    const element = await mountLoaded();
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

  it("marks only the first image link as the tour anchor and answers stop A only", async () => {
    const element = await mountLoaded();
    graphql.emit({ data: PAYLOAD, errors: undefined });
    await flushPromises();

    const anchors = qa(element, "[data-tour-anchor]");
    expect(anchors).toHaveLength(1);
    expect(anchors[0].classList.contains("image-link")).toBe(true);
    expect(anchors[0]).toBe(q(element, ".image-link"));
    anchors[0].focus = jest.fn();
    anchors[0].scrollIntoView = jest.fn();

    showMe("B");
    expect(anchors[0].focus).not.toHaveBeenCalled();
    showMe("A");
    expect(anchors[0].scrollIntoView).toHaveBeenCalledTimes(1);
    expect(anchors[0].focus).toHaveBeenCalledWith({ preventScroll: true });
  });

  it("stops listening for the tour when it leaves the page", async () => {
    const element = await mountLoaded();
    graphql.emit({ data: PAYLOAD, errors: undefined });
    await flushPromises();
    const anchor = q(element, "[data-tour-anchor]");
    anchor.focus = jest.fn();
    document.body.removeChild(element);

    showMe("A");
    expect(anchor.focus).not.toHaveBeenCalled();
  });

  it("tracks gallery_asset_opened with the type and pillar", async () => {
    const element = await mountLoaded();
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
    const element = await mountLoaded();
    graphql.emit({
      data: { uiapi: { query: { Project__c: { edges: [] } } } },
      errors: undefined
    });
    await flushPromises();

    expect(q(element, ".gallery")).toBeNull();
    expect(q(element, ".gallery-title")).toBeNull();
    expect(element.shadowRoot.textContent).toBe("");
    expect(element.shadowRoot.textContent).not.toMatch(/No project materials/);
  });

  it("renders nothing without a valid pillar", async () => {
    const element = await mountLoaded({ pillar: "Z", heading: "Materials" });

    expect(element.shadowRoot.childNodes).toHaveLength(0);
  });

  it("renders nothing, not even an error line, when the query fails", async () => {
    const element = await mountLoaded();
    graphql.emit({ data: undefined, errors: [{ message: "boom" }] });
    await flushPromises();

    expect(q(element, ".gallery")).toBeNull();
    expect(element.shadowRoot.textContent).toBe("");
  });

  it("does not load the data child before the page is idle, then loads it once", async () => {
    const element = mount();
    await flushPromises();
    expect(window.requestIdleCallback).toHaveBeenCalledTimes(1);
    expect(q(element, CHILD)).toBeNull();

    runIdle();
    await flushPromises();
    expect(qa(element, CHILD)).toHaveLength(1);
    expect(q(element, CHILD).pillar).toBe("A");

    // A second request for the same load changes nothing.
    showMe("A");
    await flushPromises();
    expect(qa(element, CHILD)).toHaveLength(1);
  });

  it("waits for the page load event when the document is still loading", async () => {
    const original = Object.getOwnPropertyDescriptor(document, "readyState");
    Object.defineProperty(document, "readyState", {
      configurable: true,
      get: () => "loading"
    });
    try {
      const element = mount();
      await flushPromises();
      expect(window.requestIdleCallback).not.toHaveBeenCalled();
      window.dispatchEvent(new CustomEvent("load"));
      expect(window.requestIdleCallback).toHaveBeenCalledTimes(1);
      runIdle();
      await flushPromises();
      expect(q(element, CHILD)).not.toBeNull();
    } finally {
      if (original) {
        Object.defineProperty(document, "readyState", original);
      } else {
        delete document.readyState;
      }
    }
  });

  it("falls back to one timeout where requestIdleCallback does not exist", async () => {
    delete window.requestIdleCallback;
    jest.useFakeTimers({ doNotFake: ["nextTick"] });
    try {
      const element = mount();
      await flushPromises();
      expect(q(element, CHILD)).toBeNull();
      jest.runAllTimers();
    } finally {
      jest.useRealTimers();
    }
    await flushPromises();
    const element = document.body.firstChild;
    expect(q(element, CHILD)).not.toBeNull();
  });

  it("holds its heading and a skeleton while loading, then the cards replace it", async () => {
    const element = mount();
    await flushPromises();
    expect(q(element, ".gallery-title").textContent).toBe(
      "Process maps and dashboards"
    );
    expect(q(element, ".skeleton")).not.toBeNull();
    expect(q(element, "ul.assets")).toBeNull();

    runIdle();
    await flushPromises();
    expect(q(element, ".skeleton")).not.toBeNull();

    graphql.emit({ data: PAYLOAD, errors: undefined });
    await flushPromises();
    expect(q(element, ".skeleton")).toBeNull();
    expect(qa(element, "li.asset").length).toBeGreaterThan(0);
  });

  it("collapses to nothing once the read comes back empty", async () => {
    const element = mount();
    runIdle();
    await flushPromises();
    graphql.emit({
      data: { uiapi: { query: { Project__c: { edges: [] } } } },
      errors: undefined
    });
    await flushPromises();
    expect(q(element, ".gallery")).toBeNull();
    expect(q(element, ".skeleton")).toBeNull();
  });

  it("collapses to nothing when the data child fails to read", async () => {
    const element = mount();
    runIdle();
    await flushPromises();
    graphql.emit({ data: undefined, errors: [{ message: "boom" }] });
    await flushPromises();
    expect(q(element, ".gallery")).toBeNull();
  });

  it("starts the load itself when the tour asks for stop A early, then shows the link", async () => {
    const element = mount();
    await flushPromises();
    expect(q(element, CHILD)).toBeNull();

    showMe("A");
    await flushPromises();
    expect(q(element, CHILD)).not.toBeNull();

    const scrollIntoView = jest.fn();
    const focus = jest.fn();
    const proto = HTMLElement.prototype;
    const oldScroll = proto.scrollIntoView;
    const oldFocus = proto.focus;
    proto.scrollIntoView = scrollIntoView;
    proto.focus = focus;
    try {
      graphql.emit({ data: PAYLOAD, errors: undefined });
      await flushPromises();
    } finally {
      proto.scrollIntoView = oldScroll;
      proto.focus = oldFocus;
    }
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
  });

  describe("styles", () => {
    const css = readFileSync(
      join(__dirname, "..", "projectAssetGallery.css"),
      "utf8"
    );

    it("fits its columns to the items so no empty column is left", () => {
      expect(css).toMatch(/repeat\(auto-fit, minmax\(260px, 1fr\)\)/);
      expect(css).not.toMatch(/auto-fill/);
    });

    it("dims images with an overlay that multiplies the page background", () => {
      const rule = css.match(/\.image-link::after \{[^}]*\}/)[0];
      expect(rule).toMatch(/background-color:\s*var\(--pf-bg\)/);
      expect(rule).toMatch(/mix-blend-mode:\s*multiply/);
    });
  });
});
