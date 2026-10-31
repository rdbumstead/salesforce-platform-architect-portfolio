/**
 * @description       : Guards where "How this site is built" sits. It is off the home view and
 *                      on the Docs view above c-docs-viewer, and the home view reads hero, case
 *                      studies, work timeline, credentials, testimonials, contact call.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/30/2026
 **/
import { readFileSync } from "fs";
import { join } from "path";

const VIEWS = join(
  __dirname,
  "..",
  "..",
  "..",
  "digitalExperiences",
  "site",
  "Portfolio1",
  "sfdc_cms__view"
);

function components(folder) {
  const found = [];
  const walk = (node) => {
    if (node && typeof node === "object") {
      if (node.type === "component" && node.id) {
        found.push({ definition: node.definition, id: node.id });
      }
      Object.values(node).forEach(walk);
    }
  };
  walk(JSON.parse(readFileSync(join(VIEWS, folder, "content.json"), "utf8")));
  return found;
}

describe("where the build section sits", () => {
  it("is not on the home view, which reads in the new order", () => {
    const names = components("home")
      .map((c) => c.definition)
      .filter((name) => name.startsWith("c:"));
    expect(names).toEqual([
      "c:heroBanner",
      "c:caseStudyGrid",
      "c:careerLine",
      "c:credentialsBand",
      "c:homeTestimonials",
      "c:contactCall"
    ]);
  });

  it("is on the Docs view, just above the docs viewer", () => {
    const names = components("Docs")
      .map((c) => c.definition)
      .filter((name) => name.startsWith("c:"));
    expect(names).toEqual(["c:siteBuildSection", "c:docsViewer"]);
  });

  it("gives every component on both views its own id", () => {
    ["home", "Docs"].forEach((folder) => {
      const ids = components(folder).map((c) => c.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });
});
