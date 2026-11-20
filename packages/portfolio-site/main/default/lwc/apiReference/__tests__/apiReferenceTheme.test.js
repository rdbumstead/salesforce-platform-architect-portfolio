/**
 * @description       : Unit tests for the API reference theme: Redoc drawn from the site tokens
 *                      in both schemes with the contrast every pair needs, drawn again when the
 *                      scheme changes, the Menu button that replaces Redoc's floating one on a
 *                      phone, the v1 note with its date, and the helpers that keep code and
 *                      tables readable.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 11/18/2026
 **/
import { createElement } from "@lwc/engine-dom";
import ApiReference, {
  CODE_PILL_MAX,
  DARK_TOKENS,
  LIGHT_TOKENS,
  REDOC_PANEL_BACKGROUND,
  REDOC_HTTP_COLORS,
  REDOC_PANEL_TEXT,
  REDOC_STYLE_OVERRIDES,
  REDOC_TAB_COLORS,
  V1_NOTICE,
  buildRedocTheme,
  findMenuButton,
  fitCodePills,
  hookCss,
  makeScrollersFocusable,
  markServerUrls,
  readTokens
} from "c/apiReference";
import { loadScript } from "lightning/platformResourceLoader";

jest.mock(
  "c/analyticsService",
  () => ({
    trackEvent: jest.fn(),
    EVENTS: { API_REFERENCE_OPENED: "api_reference_opened" }
  }),
  { virtual: true }
);
jest.mock(
  "@salesforce/community/basePath",
  () => ({ __esModule: true, default: "/portfolio" }),
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

/** Parses markup into a node's children, with no innerHTML. */
function fill(node, html) {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  node.replaceChildren(...parsed.body.childNodes);
}

const flush = async () => {
  for (let i = 0; i < 8; i++) {
    await Promise.resolve();
  }
};

function luminance(hex) {
  const channels = hex
    .match(/\w\w/g)
    .map((part) => parseInt(part, 16) / 255)
    .map((v) => {
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function ratio(a, b) {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

describe("the Redoc theme in each scheme", () => {
  it.each([
    ["light", LIGHT_TOKENS],
    ["dark", DARK_TOKENS]
  ])("meets contrast on every pair it draws in %s", (name, tokens) => {
    const pairs = [
      [tokens.text, tokens.surface],
      [tokens.text, tokens.bg],
      [tokens.body, tokens.surface],
      [tokens.body, tokens.bg],
      [tokens.body, tokens.subtle],
      [tokens.body, tokens.chip],
      [tokens.accent, tokens.surface],
      [tokens.accent, tokens.bg],
      [tokens.muted, tokens.bg],
      [tokens.muted, tokens.surface],
      [tokens.errorText, tokens.surface],
      [tokens.errorText, tokens.bg],
      [tokens.ok, tokens.surface],
      [tokens.warnText, tokens.surface],
      [tokens.btnText, tokens.btn],
      [REDOC_PANEL_TEXT, REDOC_PANEL_BACKGROUND]
    ];
    pairs.forEach(([fg, bg]) => {
      expect(ratio(fg, bg)).toBeGreaterThanOrEqual(4.5);
    });
  });

  it("keeps every response tab readable on the code panel and its selected tab on the light text colour", () => {
    Object.values(REDOC_TAB_COLORS).forEach((color) => {
      expect(ratio(color, REDOC_PANEL_BACKGROUND)).toBeGreaterThanOrEqual(4.5);
    });
    ["#067647", "#b42318", "#92400e", "#1d4ed8"].forEach((color) => {
      expect(ratio(color, REDOC_PANEL_TEXT)).toBeGreaterThanOrEqual(4.5);
      expect(REDOC_STYLE_OVERRIDES).toContain(color);
    });
  });

  it("follows the scheme: surface, text and links come from the tokens", () => {
    const dark = buildRedocTheme(DARK_TOKENS);
    const light = buildRedocTheme(LIGHT_TOKENS);
    expect(dark.colors.text.primary).toBe(DARK_TOKENS.text);
    expect(light.colors.text.primary).toBe(LIGHT_TOKENS.text);
    expect(dark.typography.links.color).toBe(DARK_TOKENS.accent);
    expect(dark.sidebar.backgroundColor).toBe(DARK_TOKENS.subtle);
    expect(dark.schema.nestedBackground).toBe(DARK_TOKENS.subtle);
    expect(dark.typography.code.backgroundColor).toBe(DARK_TOKENS.chip);
    // The code panel is dark in both.
    expect(dark.rightPanel.backgroundColor).toBe(REDOC_PANEL_BACKGROUND);
    expect(light.rightPanel.backgroundColor).toBe(REDOC_PANEL_BACKGROUND);
    // Literal colours only: Redoc lightens and darkens some of them.
    expect(JSON.stringify(dark.colors)).not.toContain("var(");
  });

  it.each([
    ["light", LIGHT_TOKENS],
    ["dark", DARK_TOKENS]
  ])(
    "draws the server panel from the %s tokens, with the address readable",
    (name, tokens) => {
      const { servers } = buildRedocTheme(tokens).rightPanel;
      expect(servers.overlay.backgroundColor).toBe(tokens.surface);
      expect(servers.overlay.textColor).toBe(tokens.text);
      expect(servers.url.backgroundColor).toBe(tokens.surface);
      // The panel text, the address (the accent) and the host part of it (the text colour).
      expect(ratio(tokens.text, tokens.surface)).toBeGreaterThanOrEqual(4.5);
      expect(ratio(tokens.accent, tokens.surface)).toBeGreaterThanOrEqual(4.5);
    }
  );

  it("draws every method badge in a site colour that holds white text at 4.5:1", () => {
    const theme = buildRedocTheme(LIGHT_TOKENS);
    expect(theme.colors.http).toEqual(REDOC_HTTP_COLORS);
    Object.values(REDOC_HTTP_COLORS).forEach((color) => {
      expect(ratio("#ffffff", color)).toBeGreaterThanOrEqual(4.5);
    });
  });

  it("starts the text at the page's left edge on a phone", () => {
    expect(buildRedocTheme(LIGHT_TOKENS, true).spacing.sectionHorizontal).toBe(
      0
    );
    expect(buildRedocTheme(LIGHT_TOKENS, false).spacing.sectionHorizontal).toBe(
      32
    );
  });

  it("draws Redoc's fixed greys from the tokens where no option reaches them", () => {
    expect(hookCss("UnderlinedHeader", DARK_TOKENS)).toContain(
      DARK_TOKENS.muted
    );
    expect(hookCss("RightPanelHeader", DARK_TOKENS)).toContain(
      REDOC_PANEL_TEXT
    );
    expect(hookCss("PropertyNameCell", LIGHT_TOKENS)).toContain(
      LIGHT_TOKENS.muted
    );
    expect(hookCss("Unknown", LIGHT_TOKENS)).toBe("");
  });

  it("reads the colours from the page's tokens and falls back to its own table", () => {
    const element = document.createElement("div");
    document.body.appendChild(element);
    const spy = jest.spyOn(window, "getComputedStyle").mockReturnValue({
      getPropertyValue: (name) => {
        const values = {
          "--pf-surface": " #123456 ",
          "--pf-text": "rgb(1,2,3)"
        };
        return values[name] || "";
      }
    });
    const tokens = readTokens(element, "dark");
    spy.mockRestore();
    expect(tokens.surface).toBe("#123456");
    // Not a hex colour, so the table's value stands.
    expect(tokens.text).toBe(DARK_TOKENS.text);
    expect(tokens.accent).toBe(DARK_TOKENS.accent);
    document.body.removeChild(element);
  });
});

describe("the reference component with the theme", () => {
  beforeEach(() => {
    loadScript.mockReset();
    loadScript.mockResolvedValue();
    window.Redoc = {
      init: jest.fn((spec, options, element, callback) => {
        fill(
          element,
          '<div class="redoc-wrap"><div class="menu-content"></div><div class="fab"><svg></svg></div><div class="credit"><a href="#">Redocly</a></div></div>'
        );
        callback();
      })
    };
  });

  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    delete window.Redoc;
    document.documentElement.removeAttribute("data-theme");
  });

  function create(props = {}) {
    const element = createElement("c-api-reference", { is: ApiReference });
    Object.assign(element, props);
    document.body.appendChild(element);
    return element;
  }

  it("draws again from the dark tokens when the site scheme changes, and not for the same scheme", async () => {
    const element = create();
    await flush();
    element.shadowRoot.querySelector("button.open-reference").click();
    await flush();
    expect(window.Redoc.init).toHaveBeenCalledTimes(1);
    expect(window.Redoc.init.mock.calls[0][1].theme.colors.text.primary).toBe(
      LIGHT_TOKENS.text
    );

    document.documentElement.setAttribute("data-theme", "dark");
    await flush();
    expect(window.Redoc.init).toHaveBeenCalledTimes(2);
    expect(window.Redoc.init.mock.calls[1][1].theme.colors.text.primary).toBe(
      DARK_TOKENS.text
    );

    // Setting the same scheme again draws nothing.
    document.documentElement.setAttribute("data-theme", "dark");
    await flush();
    expect(window.Redoc.init).toHaveBeenCalledTimes(2);
  });

  it("does not draw before the visitor opens it", async () => {
    create();
    await flush();
    document.documentElement.setAttribute("data-theme", "dark");
    await flush();
    expect(window.Redoc.init).not.toHaveBeenCalled();
  });

  it("shows a Menu bar only on its own page, and presses Redoc's floating button from it", async () => {
    const element = create({ fullWidth: true, openOnLoad: true });
    await flush();
    const bar = element.shadowRoot.querySelector(".menu-bar");
    expect(bar).not.toBeNull();
    const button = bar.querySelector("button.menu-button");
    expect(button.textContent.trim()).toBe("Menu");
    expect(button.getAttribute("aria-expanded")).toBe("false");

    const fab = element.shadowRoot.querySelector(".fab");
    fab.setAttribute("data-test", "x");
    const pressed = jest.fn();
    fab.addEventListener("click", pressed);
    button.click();
    expect(pressed).toHaveBeenCalledTimes(1);
    // Redoc's own button is marked, so the stylesheet hides it from phone widths.
    expect(fab.hasAttribute("data-pf-fab")).toBe(true);
    expect(REDOC_STYLE_OVERRIDES).toContain("[data-pf-fab] { display: none");
  });

  it("scrolls the Menu bar to its pinned place before the menu opens, so no page text shows above it", async () => {
    const element = create({ fullWidth: true, openOnLoad: true });
    await flush();
    const bar = element.shadowRoot.querySelector(".menu-bar");
    bar.getBoundingClientRect = () => ({ top: 500 });
    window.scrollBy = jest.fn();
    bar.querySelector("button.menu-button").click();
    expect(window.scrollBy).toHaveBeenCalledTimes(1);
    expect(window.scrollBy.mock.calls[0][0].top).toBeGreaterThan(0);

    // A bar already pinned needs no scroll.
    window.scrollBy.mockClear();
    bar.getBoundingClientRect = () => ({ top: 0 });
    bar.querySelector("button.menu-button").click();
    expect(window.scrollBy).not.toHaveBeenCalled();
    delete window.scrollBy;
  });

  it("has no Menu bar when the reference is embedded, and leaves Redoc's button alone", async () => {
    const element = create();
    await flush();
    element.shadowRoot.querySelector("button.open-reference").click();
    await flush();
    expect(element.shadowRoot.querySelector(".menu-bar")).toBeNull();
    expect(
      element.shadowRoot.querySelector(".fab").hasAttribute("data-pf-fab")
    ).toBe(false);
  });

  it("labels both switches and gives the v1 note its date under them", async () => {
    const element = create();
    await flush();
    const labels = Array.from(
      element.shadowRoot.querySelectorAll(".toggle-label")
    ).map((label) => label.textContent.trim());
    expect(labels).toEqual(["Version", "Specification"]);
    element.shadowRoot.querySelector('button[data-version="v1"]').click();
    await flush();
    const note = element.shadowRoot.querySelector(".version-notice");
    expect(note.textContent).toContain("November 29, 2026");
    expect(V1_NOTICE).toContain("410 Gone");
    // The note follows both switches.
    const bar = element.shadowRoot.querySelector(".spec-bar");
    expect(bar.compareDocumentPosition(note)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
  });
});

describe("helpers for the markup Redoc draws", () => {
  it("finds the floating menu button and not the menu or the credit line", () => {
    const root = document.createElement("div");
    fill(
      root,
      '<div class="redoc-wrap"><div class="menu-content"><svg></svg></div><div id="credit"><svg></svg><a href="#">x</a></div><div id="fab"><svg></svg></div></div>'
    );
    expect(findMenuButton(root).id).toBe("fab");
    expect(findMenuButton(document.createElement("div"))).toBeNull();
    expect(findMenuButton(null)).toBeNull();
  });

  it("marks short code to stay whole and long code to wrap, once", () => {
    const root = document.createElement("div");
    fill(
      root,
      `<p><code>X-API-Version</code> <code>${"a".repeat(
        CODE_PILL_MAX + 1
      )}</code></p><pre><code>block</code></pre>`
    );
    fitCodePills(root);
    const [short, long, block] = root.querySelectorAll("code");
    expect(short.getAttribute("data-pf-fit")).toBe("short");
    expect(long.getAttribute("data-pf-fit")).toBe("long");
    expect(block.hasAttribute("data-pf-fit")).toBe(false);
    expect(REDOC_STYLE_OVERRIDES).toContain(
      'code[data-pf-fit="short"] { white-space: nowrap; }'
    );
  });

  it("marks the address in each server panel, so it breaks only at a slash", () => {
    const root = document.createElement("div");
    fill(
      root,
      '<div><button><span class="http-verb">get</span></button><div aria-hidden="true"><div role="button" tabindex="0"><div><span>https://{domain}/services/apexrest/sapi</span>/contacts</div></div></div></div><div role="button" id="other"></div>'
    );
    markServerUrls(root);
    expect(
      root.querySelector('[role="button"][data-pf-server-url]')
    ).not.toBeNull();
    expect(
      root.querySelector("#other").hasAttribute("data-pf-server-url")
    ).toBe(false);
    expect(REDOC_STYLE_OVERRIDES).toContain("[data-pf-server-url]");
    expect(REDOC_STYLE_OVERRIDES).toContain("word-break: normal");
    expect(REDOC_STYLE_OVERRIDES).not.toContain("break-all");
    markServerUrls(null);
  });

  it("allows a break after each slash of the address, except inside the two slashes of a scheme", () => {
    const root = document.createElement("div");
    fill(
      root,
      '<div><button><span class="http-verb">get</span></button><div><div role="button"><div><span>https://{domain}/services/apexrest/sapi</span>/contacts</div></div></div></div>'
    );
    markServerUrls(root);
    markServerUrls(root);
    const address = root.querySelector("[data-pf-server-url]");
    expect(address.textContent).toBe(
      "https://{domain}/services/apexrest/sapi/contacts"
    );
    const breaks = Array.from(address.querySelectorAll("wbr")).map((wbr) =>
      wbr.previousSibling.nodeValue.slice(-1)
    );
    expect(address.querySelectorAll("wbr")).toHaveLength(5);
    expect(breaks.every((last) => last === "/")).toBe(true);
    expect(address.querySelector("span").firstChild.nodeValue).toBe("https://");
  });

  it("keeps the side menu badge readable and the authorization chevron beside its label", () => {
    expect(REDOC_STYLE_OVERRIDES).toMatch(
      /.operation-type {[^}]*height: auto[^}]*font-size: 11px/
    );
    expect(REDOC_STYLE_OVERRIDES).toContain("h5 + svg:last-child");
  });

  it("gives a table or code block that scrolls sideways a focus stop and a name, and leaves one that fits", () => {
    const root = document.createElement("div");
    fill(root, "<table><tr><td>a</td></tr></table><pre>b</pre>");
    const [table, pre] = [
      root.querySelector("table"),
      root.querySelector("pre")
    ];
    Object.defineProperty(table, "scrollWidth", { value: 500 });
    Object.defineProperty(table, "clientWidth", { value: 300 });
    Object.defineProperty(pre, "scrollWidth", { value: 100 });
    Object.defineProperty(pre, "clientWidth", { value: 300 });
    makeScrollersFocusable(root);
    expect(table.getAttribute("tabindex")).toBe("0");
    expect(table.getAttribute("role")).toBe("region");
    expect(table.getAttribute("aria-label")).toBe("Table, scrolls sideways");
    expect(pre.hasAttribute("tabindex")).toBe(false);
    makeScrollersFocusable(null);
  });
});
