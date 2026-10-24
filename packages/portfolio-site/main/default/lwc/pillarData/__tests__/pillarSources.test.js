/**
 * @description       : Static gate that keeps the pillar names in step. The pillar names live in pillarData,
 *                      the Project__c.Pillar_Label__c formula and the pillar page descriptions in the
 *                      Portfolio1 site views. pillarData stays static on purpose (the header menu
 *                      renders before any Apex call), so this test reads the other two sources from
 *                      the repo and fails when they disagree with it.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/23/2026
 **/
import { PILLARS } from "c/pillarData";

const fs = require("fs");
const path = require("path");

jest.mock(
  "@salesforce/community/basePath",
  () => ({ __esModule: true, default: "/portfolio" }),
  { virtual: true }
);

const DEFAULT_DIR = path.resolve(__dirname, "../../..");
const FORMULA_FILE = path.join(
  DEFAULT_DIR,
  "objects/Project__c/fields/Pillar_Label__c.field-meta.xml"
);
const VIEWS_DIR = path.join(
  DEFAULT_DIR,
  "digitalExperiences/site/Portfolio1/sfdc_cms__view"
);

// Names a pillar carried before, which no source may bring back.
const FORMER_NAMES = {
  B: ["Pre-Sales Consultancy", "Pre-sales consultancy", "Nonprofit Solutions"],
  C: ["Integration & API-Led"],
  D: ["AI & Agentforce"],
  E: ["DevOps & Automation"]
};

function decodeXml(value) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/**
 * The letter to label pairs of the CASE() in the formula.
 * @returns {Map<string, string>} label by letter
 */
function formulaLabels() {
  const xml = fs.readFileSync(FORMULA_FILE, "utf8");
  const match = xml.match(/<formula>([\s\S]*?)<\/formula>/);
  const formula = decodeXml(match ? match[1] : "");
  const labels = new Map();
  const pair = /"([A-Z])"\s*,\s*"([^"]*)"/g;
  let found = pair.exec(formula);
  while (found) {
    labels.set(found[1], found[2]);
    found = pair.exec(formula);
  }
  return labels;
}

/**
 * Every site view's title and SEO description.
 * @returns {Array<{folder: string, title: string, description: string}>} the views
 */
function views() {
  return fs
    .readdirSync(VIEWS_DIR)
    .map((folder) => {
      const file = path.join(VIEWS_DIR, folder, "content.json");
      if (!fs.existsSync(file)) {
        return null;
      }
      const json = JSON.parse(fs.readFileSync(file, "utf8"));
      const text = JSON.stringify(json);
      const description = text.match(/"description":"((?:[^"\\]|\\.)*)"/);
      return {
        folder,
        title: json.title,
        description: description ? JSON.parse(`"${description[1]}"`) : ""
      };
    })
    .filter(Boolean);
}

describe("pillar names agree across sources", () => {
  it("has a formula label for exactly the five pillar letters", () => {
    const labels = formulaLabels();
    expect([...labels.keys()].sort()).toEqual(PILLARS.map((p) => p.letter));
  });

  it.each(PILLARS.map((p) => [p.letter, p.sasName]))(
    "labels pillar %s in the formula with its pillarData name",
    (letter, sasName) => {
      expect(formulaLabels().get(letter)).toBe(`Pillar ${letter}: ${sasName}`);
    }
  );

  it.each(PILLARS.map((p) => [p.letter, p.pageLabel]))(
    "has one site view for pillar %s titled %s",
    (letter, pageLabel) => {
      const matches = views().filter((view) => view.title === pageLabel);
      expect(matches).toHaveLength(1);
    }
  );

  it.each(PILLARS.map((p) => [p.letter, p.pageLabel]))(
    "opens pillar %s's page description with its own letter",
    (letter, pageLabel) => {
      const view = views().find((v) => v.title === pageLabel);
      expect(view.description.startsWith(`Pillar ${letter}. `)).toBe(true);
    }
  );

  it("names no other pillar and no former pillar name in any pillar page description", () => {
    const problems = [];
    PILLARS.forEach((pillar) => {
      const view = views().find((v) => v.title === pillar.pageLabel);
      const text = view.description.toLowerCase();
      PILLARS.filter((other) => other.letter !== pillar.letter).forEach(
        (other) => {
          if (text.includes(`pillar ${other.letter.toLowerCase()}.`)) {
            problems.push(`${view.folder} names Pillar ${other.letter}`);
          }
        }
      );
      Object.values(FORMER_NAMES)
        .flat()
        .forEach((former) => {
          if (text.includes(former.toLowerCase())) {
            problems.push(`${view.folder} says "${former}"`);
          }
        });
    });
    expect(problems).toEqual([]);
  });

  it("uses no former pillar name in pillarData or the formula", () => {
    const formula = [...formulaLabels().values()].join(" | ").toLowerCase();
    const data = JSON.stringify(PILLARS).toLowerCase();
    Object.values(FORMER_NAMES)
      .flat()
      .forEach((former) => {
        expect(formula).not.toContain(former.toLowerCase());
        expect(data).not.toContain(former.toLowerCase());
      });
  });
});
