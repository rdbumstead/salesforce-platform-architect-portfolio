import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTemplateLetter,
  firstWords,
  MAX_FACTS,
  removeContactDetails,
  TEMPLATE_NOTE
} from "../functions/_lib/tailor/template.js";
import { buildFakeSelection } from "../tailor-eval/lib/fake.mjs";
import { runOne, viewForMode } from "../tailor-eval/lib/pipeline.mjs";
import { templateProvider } from "../tailor-eval/lib/router.mjs";
import { loadValidators } from "../tailor-eval/lib/validators.mjs";
import { loadInputs } from "../tailor-eval/run-eval.mjs";

/*
 * The cases of LocalTemplateServiceTest.cls, ported. The records the Apex test inserts become a
 * small invented view and selection. Where the port differs from the Apex on purpose, the test
 * says so.
 */

const SENTINEL_EMAIL = "leak.sentinel@example.com";
const EMPLOYER = "Sentinel Employer Inc";

const HIGHLIGHTS = [
  "Designed the integration layer for an Apex and API program that serves several teams at once.",
  "Led the move of release work into source control with automated tests on every change.",
  "Built Lightning Web Components for a guest facing site, with accessibility checks in both themes.",
  "A fourth highlight the letter leaves out."
];

/** The records insertRecords makes in the Apex test, as a snapshot view. */
function recordsView({ certifications = 2 } = {}) {
  return {
    owner: { name: "Sample Owner", currentEmployer: EMPLOYER },
    roles: [
      {
        id: "platform-architect",
        employer: EMPLOYER,
        title: "Platform Architect",
        current: true
      }
    ],
    items: [
      {
        id: "headline-site-title",
        type: "headline",
        text: "Salesforce Platform Architect"
      },
      ...HIGHLIGHTS.map((text, index) => ({
        id: `platform-architect-highlight-${index + 1}`,
        type: "bullet",
        roleId: "platform-architect",
        text
      })),
      ...Array.from({ length: certifications }, (_, index) => ({
        id: `cert-${index + 1}`,
        type: "certification",
        text: `Cert ${index + 1}`
      }))
    ]
  };
}

const ALL_BULLETS = {
  roles: [
    {
      role_id: "platform-architect",
      include: true,
      bullet_ids: HIGHLIGHTS.map(
        (_, index) => `platform-architect-highlight-${index + 1}`
      )
    }
  ],
  project_ids: []
};

const job = (company, title, text) => ({ company, title, text });
const words = (text) => text.trim().split(/\s+/).length;

test("the letter names the company and the role", () => {
  const text = buildTemplateLetter({ posting: job("Salesforce", "Architect") });
  assert.ok(text.startsWith("Dear Salesforce hiring team,"), text);
  assert.ok(text.includes("the Architect role at Salesforce"), text);
});

test("the letter uses the owner's records", () => {
  const text = buildTemplateLetter({
    posting: job("Acme", "Salesforce Architect", "Apex and API"),
    view: recordsView(),
    selection: ALL_BULLETS,
    startYear: 2017
  });
  assert.ok(
    text.includes("My current title is Salesforce Platform Architect."),
    text
  );
  assert.ok(
    text.includes("I have worked on the Salesforce platform since 2017."),
    text
  );
  assert.ok(text.includes("I hold 2 current certifications."), text);
  assert.ok(text.includes("integration layer"), "a real highlight");
  assert.ok(
    text.includes("closest to your description"),
    "says it read the description"
  );
  // The Apex signs with the header name. The port signs with the snapshot owner's name.
  assert.ok(text.includes("Sincerely,\nSample Owner"), text);
});

test("the start year comes from the input, and without it the sentence is left out", () => {
  assert.ok(
    buildTemplateLetter({
      posting: job("Acme", "Architect"),
      startYear: 2019
    }).includes("since 2019")
  );
  assert.ok(
    !buildTemplateLetter({ posting: job("Acme", "Architect") }).includes(
      "since"
    )
  );
});

test("the letter quotes at most three facts", () => {
  const text = buildTemplateLetter({
    posting: job("Acme", "Architect"),
    view: recordsView(),
    selection: ALL_BULLETS
  });
  assert.equal(text.split("\n- ").length - 1, MAX_FACTS);
  assert.ok(!text.includes("fourth highlight"), "the fourth is left out");
  assert.ok(
    text.includes("As Platform Architect: Designed the integration layer"),
    text
  );
});

test("with real records the letter is a letter length", () => {
  const text = buildTemplateLetter({
    posting: job("Acme", "Salesforce Architect", "Apex, API design and DevOps"),
    view: recordsView(),
    selection: ALL_BULLETS,
    startYear: 2017
  });
  const count = words(text);
  assert.ok(count >= 150 && count <= 260, `${count} words: ${text}`);
});

test("no contact detail or employer reaches the letter", () => {
  const text = buildTemplateLetter({
    posting: job(`Acme ${SENTINEL_EMAIL}`, "Architect call 555-014-2424"),
    view: recordsView(),
    selection: ALL_BULLETS
  });
  assert.ok(!text.includes("@"), text);
  assert.ok(!text.includes("555"), text);
  assert.ok(!text.includes(EMPLOYER), text);
});

test("the last line says it is a template", () => {
  const text = buildTemplateLetter({ posting: job("Acme", "Architect") });
  assert.ok(text.endsWith(TEMPLATE_NOTE), text);
  assert.ok(TEMPLATE_NOTE.includes("without an AI model"));
});

test("no records and no input still give a letter", () => {
  const text = buildTemplateLetter({});
  assert.ok(text.startsWith("Dear hiring team,"), text);
  assert.ok(text.includes("the open role."), text);
  // The Apex falls back to a name in its code. The port signs off with no name instead.
  assert.ok(text.includes("Sincerely,\n\n"), text);
  assert.ok(!text.includes("null") && !text.includes("undefined"), text);
  assert.ok(!text.includes("\n- "), "no facts without records");
});

test("no input at all still gives a letter", () => {
  assert.ok(buildTemplateLetter().endsWith(TEMPLATE_NOTE));
});

test("a missing company leaves the company out", () => {
  const text = buildTemplateLetter({ posting: job(null, "Architect") });
  assert.ok(text.startsWith("Dear hiring team,"), text);
  assert.ok(text.includes("the Architect role. "), text);
});

test("a value that is not text is treated as missing", () => {
  const text = buildTemplateLetter({ posting: { company: 42, title: "   " } });
  assert.ok(text.startsWith("Dear hiring team,"), text);
  assert.ok(text.includes("the open role"), text);
});

test("a selected project is a fact when no highlight is", () => {
  const view = {
    owner: { name: "Sample Owner" },
    roles: [],
    items: [
      {
        id: "project-sentinel",
        type: "project",
        text: "Sentinel Portfolio Project: Cut the release time for every team"
      }
    ]
  };
  const text = buildTemplateLetter({
    posting: job("Acme", "Architect"),
    view,
    selection: { roles: [], project_ids: ["project-sentinel"] }
  });
  assert.ok(
    text.includes(
      "As Sentinel Portfolio Project: Cut the release time for every team."
    ),
    text
  );
  assert.ok(text.includes("closest to the role:"), text);
});

test("one certification reads in the singular", () => {
  const text = buildTemplateLetter({
    posting: job("Acme", "Architect"),
    view: recordsView({ certifications: 1 })
  });
  assert.ok(text.includes("I hold 1 current certification."), text);
});

test("a missing owner title or certification count leaves its sentence out", () => {
  const view = recordsView({ certifications: 0 });
  view.items = view.items.filter((item) => item.id !== "headline-site-title");
  const text = buildTemplateLetter({
    posting: job("Acme", "Architect"),
    view,
    selection: ALL_BULLETS
  });
  assert.ok(!text.includes("My current title"), text);
  assert.ok(!text.includes("current certification"), text);
  assert.ok(text.includes("integration layer"), "facts still read");
});

test("a broken selection still gives a letter", () => {
  const text = buildTemplateLetter({
    posting: job("Acme", "Architect"),
    view: recordsView(),
    selection: { roles: 5 }
  });
  assert.ok(text.startsWith("Dear Acme hiring team,"), text);
  assert.ok(text.endsWith(TEMPLATE_NOTE), text);
});

test("long record text is cut at a word, and short text is kept whole", () => {
  assert.equal(firstWords("one two three, four five", 3), "one two three...");
  assert.equal(firstWords(" one  two ", 5), "one two");
});

test("contact details are removed the Apex way", () => {
  assert.equal(
    removeContactDetails("Write to jobs@acme.example today"),
    "Write to [removed] today"
  );
  assert.equal(
    removeContactDetails("Call (555) 014-2424 now"),
    "Call [removed] now"
  );
  assert.equal(removeContactDetails("   "), null);
});

/* ---------- the port against the validators ---------- */

const { snapshot, postings, categories } = await loadInputs({
  includePrivate: false
});
const REAL = await loadValidators();
const BLOCKLIST = REAL.parseBlocklist("zzinventedclient").terms;

test("the template provider answers the selector with a selection and the letter with the port", async () => {
  const posting = postings.find((entry) => entry.id === "posting-1-engineer");
  const record = await runOne({
    provider: templateProvider(),
    posting,
    snapshot,
    mode: "owner",
    validators: REAL,
    blocklist: BLOCKLIST,
    categories
  });
  assert.equal(record.provider, "template");
  assert.equal(record.model, "local-template");
  assert.equal(record.selector.finalOk, true);
  assert.ok(record.letter.text.endsWith(TEMPLATE_NOTE));
  assert.deepEqual(record.usage, { inputTokens: 0, outputTokens: 0 });
});

/*
 * The ported letter fails the letter rules on every synthetic posting, for reasons the Apex
 * design sets: it is about 150 words where the rules want 300 to 400, it has six blocks where
 * the rules want five paragraphs, it never names an employer where the rules want the current
 * one, and it states a certification count that is in no evidence text. This test pins the
 * exact failures so a change to either side is seen. No validator is loosened.
 */
test("the ported letter fails exactly these validator rules on the four synthetic postings", () => {
  const synthetic = postings.filter((posting) => posting.kind === "synthetic");
  assert.equal(synthetic.length, 4);
  for (const posting of synthetic)
    for (const mode of ["owner", "visitor"]) {
      const view = viewForMode(snapshot, mode);
      // The same rule built selection the template provider answers with.
      const check = REAL.validateSelection(
        JSON.stringify(
          buildFakeSelection({ posting, snapshot: view, categories })
        ),
        snapshot,
        { mode }
      );
      assert.equal(check.ok, true, `${posting.id} ${mode} selection`);
      const selection = check.selection;
      const letter = buildTemplateLetter({ posting, view, selection });
      const evidence = REAL.selectedEvidenceTexts(selection, snapshot);
      const allow = REAL.groundingAllowList(snapshot, {
        company: posting.company,
        title: posting.title
      });
      const letterCheck = REAL.validateLetter(letter, {
        selection,
        snapshot,
        blocklist: BLOCKLIST,
        employer: snapshot.owner.currentEmployer,
        mode
      });
      const grounding = REAL.checkGrounding(letter, evidence, { allow });
      const codes = [
        ...new Set(letterCheck.errors.map((error) => error.code))
      ].sort();
      assert.deepEqual(
        codes,
        [
          "letter.employer_missing",
          "letter.paragraph_count",
          "letter.word_count"
        ],
        `${posting.id} ${mode}`
      );
      const groundingCodes = new Set(
        grounding.errors.map((error) => error.code)
      );
      assert.ok(
        groundingCodes.has("grounding.number"),
        `${posting.id} ${mode} certification count`
      );
      for (const code of groundingCodes)
        assert.ok(["grounding.number", "grounding.name"].includes(code), code);
    }
});
