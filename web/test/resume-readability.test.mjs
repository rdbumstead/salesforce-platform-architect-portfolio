import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalize,
  slugOf,
  plainEmployer,
  parseEarlierRoles,
  scoreParse,
  fromOpenResume,
  fromPyresparser,
  landmarksOf,
  landmarkOrder,
  pageTopVerdict,
  summaryTable,
  parseVeraJson,
  hasStructureTree,
  skimKey,
  crossCheck
} from "../build/resume-readability.mjs";

const expected = () => ({
  name: "Pat Example",
  summary: "Builds things on the platform.",
  roles: [
    {
      title: "Lead",
      employer: "Acme",
      dates: "Jan 2020 - Present",
      kind: "role",
      stacked: true,
      groupIndex: 0,
      pageTop: false,
      highlights: ["Did one"]
    },
    {
      title: "Analyst",
      employer: "Acme",
      dates: "Jan 2018 - Dec 2019",
      kind: "role",
      stacked: true,
      groupIndex: 1,
      pageTop: true,
      highlights: ["Did two"]
    }
  ],
  earlier: [
    {
      title: "Clerk",
      employer: "Shop",
      dates: "2015",
      kind: "earlier",
      stacked: false,
      pageTop: false
    }
  ],
  certifications: ["Platform Administrator (2024)"]
});

test("normalize and slugOf give one form for comparing", () => {
  assert.equal(normalize("  Senior—Dev,  Inc. "), "senior dev inc");
  assert.equal(
    slugOf("Architect without retired"),
    "architect-without-retired"
  );
  assert.equal(plainEmployer("Independent (part time)"), "Independent");
});

test("parseEarlierRoles splits the earlier roles line", () => {
  const rows = parseEarlierRoles(
    "Clerk, Shop (2015) · Teacher, Harbor College (part time) (2017 to 2021)"
  );
  assert.deepEqual(rows, [
    { title: "Clerk", employer: "Shop", dates: "2015" },
    { title: "Teacher", employer: "Harbor College", dates: "2017 to 2021" }
  ]);
});

test("a parser that gets every field right passes the strict line", () => {
  const parsed = {
    tool: "canned",
    summary: "Builds things on the platform.",
    roles: [
      { title: "Lead", employer: "Acme", dates: "Jan 2020 - Present" },
      { title: "Analyst", employer: "Acme", dates: "Jan 2018 - Dec 2019" },
      { title: "Clerk", employer: "Shop", dates: "2015" }
    ],
    certifications: [
      "Salesforce Certified Platform Administrator, Salesforce, Jun 2024"
    ]
  };
  const score = scoreParse(expected(), parsed);
  assert.equal(score.strictPass, true);
  assert.equal(score.mainStrictPass, true);
  assert.equal(score.misses.length, 0);
  assert.equal(score.kinds.title.right, 3);
});

test("a missed role at a page top is counted and marked", () => {
  const parsed = {
    roles: [{ title: "Lead", employer: "Acme", dates: "Jan 2020 - Present" }],
    summary: "x",
    certifications: []
  };
  const score = scoreParse(expected(), parsed);
  assert.equal(score.strictPass, false);
  assert.equal(score.pageTopMisses.length, 3);
  assert.ok(
    score.pageTopMisses.every((miss) => miss.field.includes("Analyst"))
  );
  assert.equal(score.reportsRoles, true);
});

test("a wrong date range is a miss and a wrong employer is a miss", () => {
  const parsed = {
    roles: [
      { title: "Lead", employer: "Other Co", dates: "Jan 2020 - Present" },
      { title: "Analyst", employer: "Acme", dates: "Jan 2019 - Dec 2019" }
    ]
  };
  const score = scoreParse(expected(), parsed);
  const fields = score.misses.map((miss) => miss.field);
  assert.ok(fields.includes("role 1 Lead employer"));
  assert.ok(fields.includes("role 2 Analyst dates"));
  assert.ok(!fields.includes("role 1 Lead title"));
});

test("a field a parser does not report is a miss flagged as not reported", () => {
  const score = scoreParse(expected(), {
    roles: [{ title: "Lead", employer: "Acme" }]
  });
  const dates = score.misses.find((miss) => miss.field === "role 1 Lead dates");
  assert.equal(dates.reported, false);
});

test("loose scoring finds text in the wrong field", () => {
  const parsed = fromOpenResume({
    resume: {
      profile: { summary: "" },
      workExperiences: [
        { company: "Lead, Acme", jobTitle: "", date: "Jan 2020 - Present" }
      ]
    }
  });
  const score = scoreParse(expected(), parsed);
  const title = score.fields.find((item) => item.field === "role 1 Lead title");
  assert.equal(title.ok, false);
  assert.equal(title.loose, true);
});

test("adapters build the common shape", () => {
  const open = fromOpenResume({
    resume: {
      profile: { summary: "s" },
      workExperiences: [
        { company: "Acme", jobTitle: "Lead", date: "Jan 2020 - Present" }
      ]
    }
  });
  assert.deepEqual(open.roles, [
    { employer: "Acme", title: "Lead", dates: "Jan 2020 - Present" }
  ]);
  assert.equal(open.summary, "s");
  const none = fromPyresparser({ designation: null, company_names: null });
  assert.deepEqual(none.roles, []);
  const paired = fromPyresparser({
    designation: ["Lead"],
    company_names: ["Acme"]
  });
  assert.equal(paired.roles[0].dates, undefined);
  assert.equal(scoreParse(expected(), none).reportsRoles, false);
});

test("landmark order finds a displaced line and a missing one", () => {
  const marks = landmarksOf(expected());
  // Certifications sit under the summary, where the PDF and the text page print them (R27-23).
  assert.deepEqual(marks.slice(0, 4), [
    "summary",
    "Platform Administrator",
    "experience",
    "Lead"
  ]);
  const good =
    "Summary\nPlatform Administrator\nExperience\nLead\nDid one\nAnalyst\nDid two\nSkills\nEducation";
  assert.equal(landmarkOrder(marks, good).equal, true);
  const late =
    "Summary\nExperience\nLead\nDid one\nAnalyst\nDid two\nSkills\nPlatform Administrator\nEducation";
  // The old order, certifications after skills, no longer reads as equal.
  assert.equal(landmarkOrder(marks, late).equal, false);
  const moved =
    "Summary\nPlatform Administrator\nExperience\nLead\nAnalyst\nDid two\nDid one\nSkills\nEducation";
  assert.deepEqual(landmarkOrder(marks, moved).outOfOrder, [
    "Analyst",
    "Did two"
  ]);
  const lost = good.replace("Did two", "");
  assert.deepEqual(landmarkOrder(marks, lost).missing, ["Did two"]);
});

test("the page top rule holds when every page opens on a heading and names a page that does not", () => {
  const none = scoreParse(expected(), { roles: [] });
  const good = pageTopVerdict([
    {
      name: "v",
      scores: { none },
      pageTopRows: [
        { page: 2, text: "EXPERIENCE (continued)", kind: "continued section" },
        { page: 3, text: "Lead Jan 2020 - Present", kind: "role" }
      ]
    }
  ]);
  assert.equal(good.ok, true);
  assert.equal(good.tops.length, 2);
  const bad = pageTopVerdict([
    {
      name: "v",
      scores: { none },
      pageTopRows: [{ page: 2, text: "Acme", kind: "other" }]
    }
  ]);
  assert.equal(bad.ok, false);
  assert.deepEqual(bad.misses, [{ variant: "v", page: 2, text: "Acme" }]);
});

test("the summary table has one row per variant and parser", () => {
  const part = scoreParse(expected(), { roles: [] });
  const table = summaryTable([
    { name: "A | B", scores: { one: part, two: part } }
  ]).split("\n");
  assert.equal(table.length, 4);
  assert.ok(table[2].includes("A / B"));
});

test("veraPDF and tag readers", () => {
  const report = {
    report: {
      jobs: [
        {
          validationResult: [
            {
              compliant: false,
              details: {
                failedRules: 2,
                failedChecks: 9,
                ruleSummaries: [
                  {
                    clause: "7.1",
                    testNumber: 3,
                    failedChecks: 9,
                    description: "d"
                  }
                ]
              }
            }
          ]
        }
      ]
    }
  };
  const verdict = parseVeraJson(report);
  assert.equal(verdict.compliant, false);
  assert.equal(verdict.failedChecks, 9);
  assert.equal(parseVeraJson({}).hasVerdict, false);
  assert.deepEqual(hasStructureTree(Buffer.from("%PDF /Type /Catalog")), {
    structTreeRoot: false,
    markInfo: false,
    lang: false
  });
  assert.equal(
    hasStructureTree(Buffer.from("/StructTreeRoot 5 0 R /Lang (en)"))
      .structTreeRoot,
    true
  );
});

test("the skim key names the primary role and counts years from the first Salesforce role", () => {
  const resume = {
    header: { title: "Architect" },
    skillGroups: [{ skills: ["Apex", "LWC", "Flow", "SOQL"] }],
    roles: [
      {
        title: "Architect",
        employer: "Acme",
        startDate: "2022-01-01",
        isCurrent: true
      },
      {
        title: "Consultant",
        employer: "Other",
        startDate: "2024-01-01",
        isCurrent: true
      },
      {
        title: "Salesforce Admin",
        employer: "Old",
        startDate: "2016-11-18",
        endDate: "2021-12-31",
        isCurrent: false
      },
      {
        title: "Clerk",
        employer: "Shop",
        startDate: "2010-01-01",
        endDate: "2012-01-01",
        isCurrent: false
      }
    ]
  };
  const key = skimKey(resume, new Date("2026-11-18T00:00:00Z"));
  assert.equal(key.employer, "Acme");
  assert.equal(key.title, "Architect");
  assert.equal(key.years, 10);
  assert.deepEqual(key.firstThreeSkills, ["Apex", "LWC", "Flow"]);
  assert.deepEqual(key.otherCurrent, ["Consultant, Other"]);
});

test("crossCheck ties an expected role to the raw payload", () => {
  const exp = {
    roles: [
      {
        title: "Lead",
        employer: "Acme",
        dates: "Jan 2020 - Present",
        startDate: "2020-01-01"
      }
    ],
    earlier: []
  };
  const raw = {
    roles: [
      {
        title: "Lead",
        employer: "Acme",
        startDate: "2020-01-01",
        isCurrent: true
      }
    ]
  };
  assert.deepEqual(crossCheck(exp, raw), []);
  exp.roles[0].dates = "Feb 2020 - Present";
  assert.equal(crossCheck(exp, raw).length, 1);
});
