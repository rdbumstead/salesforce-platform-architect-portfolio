/**
 * @description       : Unit tests for the externalUrl module.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/22/2026
 **/
import { toExternalUrl, toSiteAssetUrl } from "c/externalUrl";

describe("c/externalUrl", () => {
  it("adds https to a bare domain, the stored LinkedIn value that broke the link", () => {
    expect(toExternalUrl("www.linkedin.com/in/ryanbumstead")).toBe(
      "https://www.linkedin.com/in/ryanbumstead"
    );
    expect(toExternalUrl("  github.com/rdbumstead  ")).toBe(
      "https://github.com/rdbumstead"
    );
  });

  it("keeps http and https URLs as they are", () => {
    expect(toExternalUrl("https://www.linkedin.com/in/ryanbumstead")).toBe(
      "https://www.linkedin.com/in/ryanbumstead"
    );
    expect(toExternalUrl("HTTP://example.com/a?b=c")).toBe(
      "HTTP://example.com/a?b=c"
    );
  });

  it("completes a protocol relative URL with https", () => {
    expect(toExternalUrl("//ryanbumstead.com")).toBe(
      "https://ryanbumstead.com"
    );
  });

  it("refuses other schemes and values that are not a URL", () => {
    // The script URL is the input under test, proving it can never become a link.
    // eslint-disable-next-line no-script-url
    expect(toExternalUrl("javascript:alert(1)")).toBeNull();
    expect(toExternalUrl("data:text/html,hi")).toBeNull();
    expect(toExternalUrl("mailto:someone@example.com")).toBeNull();
    expect(toExternalUrl("not a url")).toBeNull();
    expect(toExternalUrl("")).toBeNull();
    expect(toExternalUrl(null)).toBeNull();
    expect(toExternalUrl(undefined)).toBeNull();
  });
});

describe("c/externalUrl toSiteAssetUrl", () => {
  it("resolves resource:<Name>/<path> to the site's static resource path", () => {
    expect(
      toSiteAssetUrl("resource:Project_Card_Images/pillar-c.webp", "/portfolio")
    ).toBe("/portfolio/sfsites/c/resource/Project_Card_Images/pillar-c.webp");
    expect(toSiteAssetUrl(" RESOURCE:EH_Assets/a b.svg ", "")).toBe(
      "/sfsites/c/resource/EH_Assets/a%20b.svg"
    );
  });

  it("keeps http and https URLs as they are", () => {
    expect(toSiteAssetUrl("https://example.com/a.webp", "/portfolio")).toBe(
      "https://example.com/a.webp"
    );
  });

  it("refuses blank values, other schemes and unsafe resource paths", () => {
    expect(toSiteAssetUrl(null, "/portfolio")).toBeNull();
    expect(toSiteAssetUrl("   ", "/portfolio")).toBeNull();
    expect(
      toSiteAssetUrl("data:image/png;base64,AAAA", "/portfolio")
    ).toBeNull();
    expect(toSiteAssetUrl("pillar-c.webp", "/portfolio")).toBeNull();
    expect(toSiteAssetUrl("resource:../x/a.webp", "/portfolio")).toBeNull();
    expect(
      toSiteAssetUrl("resource:Project_Card_Images/../a.webp", "/portfolio")
    ).toBeNull();
    expect(
      toSiteAssetUrl("resource:Project_Card_Images//a.webp", "/portfolio")
    ).toBeNull();
  });
});
