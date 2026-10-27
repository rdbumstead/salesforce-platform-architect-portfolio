import { headerLinks, contactUrl, CONTACT_PATH } from "c/profileLinks";

const HEADER = {
  linkedInUrl: "https://www.linkedin.com/in/example",
  gitHubUrl: "github.com/rdbumstead",
  trailheadUrl: "https://www.salesforce.com/trailblazer/example",
  portfolioUrl: "https://ryanbumstead.com"
};

describe("c-profile-links", () => {
  it("lists the links in order with Contact last", () => {
    expect(headerLinks(HEADER)).toEqual([
      { label: "LinkedIn", url: "https://www.linkedin.com/in/example" },
      { label: "GitHub", url: "https://github.com/rdbumstead" },
      {
        label: "Trailhead",
        url: "https://www.salesforce.com/trailblazer/example"
      },
      { label: "Portfolio", url: "https://ryanbumstead.com" },
      { label: "Contact", url: "https://ryanbumstead.com/contact" }
    ]);
  });

  it("leaves out empty and unsafe links", () => {
    expect(
      headerLinks({ linkedInUrl: "", gitHubUrl: "data:text/html,x" })
    ).toEqual([]);
  });

  it("shows Contact only when the portfolio URL is set", () => {
    const labels = headerLinks({ ...HEADER, portfolioUrl: null }).map(
      (link) => link.label
    );
    expect(labels).toEqual(["LinkedIn", "GitHub", "Trailhead"]);
  });

  it("builds an absolute contact URL whatever the portfolio URL ends with", () => {
    expect(contactUrl("https://ryanbumstead.com/")).toBe(
      `https://ryanbumstead.com${CONTACT_PATH}`
    );
    expect(contactUrl("ryanbumstead.com")).toBe(
      "https://ryanbumstead.com/contact"
    );
    expect(contactUrl("https://ryanbumstead.com/?ref=pdf#top")).toBe(
      "https://ryanbumstead.com/contact"
    );
    expect(contactUrl("mailto:someone@example.com")).toBeNull();
    expect(contactUrl(undefined)).toBeNull();
  });

  it("treats a missing header as no links", () => {
    expect(headerLinks(null)).toEqual([]);
  });
});
