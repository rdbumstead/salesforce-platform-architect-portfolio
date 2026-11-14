import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTemplateLetter,
  firstWords,
  NEUTRAL,
  removeContactDetails,
  TEMPLATE_NOTE
} from "../functions/_lib/tailor/template.js";
import { letterBody } from "../functions/_lib/tailor/validate-letter.js";
import { buildFakeSelection } from "../tailor-eval/lib/fake.mjs";
import { runOne, viewForMode } from "../tailor-eval/lib/pipeline.mjs";
import { templateProvider } from "../tailor-eval/lib/router.mjs";
import { loadValidators } from "../tailor-eval/lib/validators.mjs";
import { loadInputs } from "../tailor-eval/run-eval.mjs";
import { injectionLeaks, promptShingles } from "../tailor-eval/score.mjs";

/*
 * The template letter. It began as a port of LocalTemplateService and now follows the model
 * letter rules (P-D33), reaching its length with selected evidence first and a short neutral set
 * only after that (P-D37). The Apex cases that still apply are kept: company and role, contact
 * details, missing input, the name and start year inputs.
 */

const { snapshot, postings, categories } = await loadInputs({
  includePrivate: false
});
const REAL = await loadValidators();
const BLOCKLIST = REAL.parseBlocklist("zzinventedclient").terms;
const synthetic = postings.filter((posting) => posting.kind === "synthetic");
const injections = postings.filter((posting) => posting.kind === "injection");
const EM_DASH = String.fromCharCode(0x2014);

/** Lines the template used to add for length. Each claims a habit, and none may come back. */
const HABIT_LINES = [
  "I write down what I change",
  "I keep the people who use the system close",
  "I am happy to start with the smaller tasks",
  "I take the time to test my own work",
  "I listen to the people closest",
  "I ask questions early",
  "I prefer plain designs"
];

/** The letter, the validator results and the inputs, for one posting in one mode. */
function letterFor(posting, mode, extra = {}) {
  const view = viewForMode(snapshot, mode);
  const check = REAL.validateSelection(
    JSON.stringify(buildFakeSelection({ posting, snapshot: view, categories })),
    snapshot,
    { mode }
  );
  assert.equal(check.ok, true, `${posting.id} ${mode} selection`);
  const selection = check.selection;
  const evidenceTexts = REAL.selectedEvidenceTexts(selection, snapshot);
  const letter = buildTemplateLetter({
    posting,
    view,
    selection,
    mode,
    evidenceTexts,
    ...extra
  });
  const allow = REAL.groundingAllowList(snapshot, {
    company: posting.company,
    title: posting.title
  });
  return {
    letter,
    selection,
    letterCheck: REAL.validateLetter(letter, {
      selection,
      snapshot,
      blocklist: BLOCKLIST,
      employer: snapshot.owner.currentEmployer,
      mode
    }),
    grounding: REAL.checkGrounding(letter, evidenceTexts, { allow })
  };
}

const posting1 = synthetic.find(
  (posting) => posting.id === "posting-1-engineer"
);
const sentencesOf = (letter) =>
  letter
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.split(" ").length > 3);

/* ---------- the letter rules on the sample snapshot ---------- */

/*
 * With evidence first and at most two items per paragraph, the sample snapshot does not hold
 * enough selected evidence to reach 300 words, even with every neutral sentence. So the only
 * rule the letter fails there is letter.word_count. This test pins that, and the shortfall is
 * reported, never covered with filler. No validator is loosened.
 */
test("on the sample snapshot the letter fails only the word count, and grounding passes", () => {
  assert.equal(synthetic.length, 4);
  for (const posting of synthetic)
    for (const mode of ["owner", "visitor"]) {
      const { letterCheck, grounding } = letterFor(posting, mode);
      const where = `${posting.id} ${mode}`;
      assert.deepEqual(
        letterCheck.errors.map((error) => error.code),
        ["letter.word_count"],
        where
      );
      assert.ok(
        letterCheck.wordCount < 300,
        `${where} ${letterCheck.wordCount}`
      );
      assert.deepEqual(grounding.errors, [], where);
      assert.equal(letterCheck.paragraphCount, 5, where);
    }
});

test("with enough evidence the letter passes every letter rule and grounding", () => {
  const long = (n) =>
    `Built release flow number ${n} for a team of planners, with checks that ran on every change and a review step before anything reached the people who used it each morning, plus a short written note for whoever picked it up next`;
  const view = {
    owner: { name: "Sample Owner", currentEmployer: "Sample Works" },
    roles: [
      {
        id: "r1",
        employer: "Sample Works",
        title: "Platform Lead",
        current: true
      }
    ],
    items: Array.from({ length: 6 }, (_, index) => ({
      id: `b${index + 1}`,
      type: "bullet",
      roleId: "r1",
      text: long(index + 1)
    }))
  };
  const selection = {
    roles: [
      {
        role_id: "r1",
        include: true,
        bullet_ids: view.items.map((item) => item.id)
      }
    ],
    top_requirements: [
      { match: "strong", evidence_ids: ["b1", "b2"] },
      { match: "strong", evidence_ids: ["b3"] },
      { match: "partial", evidence_ids: ["b4"] }
    ]
  };
  const evidenceTexts = REAL.selectedEvidenceTexts(selection, view);
  const posting = { company: "Acme", title: "Platform Engineer" };
  const letter = buildTemplateLetter({
    posting,
    view,
    selection,
    evidenceTexts
  });
  const check = REAL.validateLetter(letter, {
    selection,
    snapshot: view,
    blocklist: BLOCKLIST,
    employer: "Sample Works",
    mode: "owner"
  });
  assert.deepEqual(check.errors, [], letter);
  const allow = REAL.groundingAllowList(view, posting);
  assert.deepEqual(
    REAL.checkGrounding(letter, evidenceTexts, { allow }).errors,
    []
  );
  assert.ok(
    NEUTRAL.every((sentence) => !letter.includes(sentence)),
    "no neutral sentence when evidence is enough"
  );
});

/* ---------- the four defects from review ---------- */

test("every evidence item appears once per letter", () => {
  for (const posting of [...synthetic, ...injections])
    for (const mode of ["owner", "visitor"]) {
      const { letter } = letterFor(posting, mode);
      const quoted = snapshot.items.filter((item) =>
        ["bullet", "project"].includes(item.type)
      );
      for (const item of quoted) {
        const probe = item.text.split(" ").slice(-5).join(" ");
        const count = letter.split(probe).length - 1;
        assert.ok(
          count <= 1,
          `${posting.id} ${mode} ${item.id} appears ${count} times`
        );
      }
    }
});

test("skills are never quoted as sentences, only listed in one sentence", () => {
  const skills = snapshot.items.filter((item) => item.type === "skill");
  for (const posting of synthetic)
    for (const mode of ["owner", "visitor"]) {
      const { letter } = letterFor(posting, mode);
      for (const skill of skills)
        for (const lead of [": ", ". "])
          assert.ok(
            !letter.includes(`${lead}${skill.text}.`),
            `${posting.id} ${mode} ${skill.text}`
          );
      assert.ok(
        letter.split("The tools behind that work include").length - 1 <= 1
      );
    }
});

test("no sentence appears twice, and each neutral sentence at most once", () => {
  for (const posting of [...synthetic, ...injections])
    for (const mode of ["owner", "visitor"]) {
      const { letter } = letterFor(posting, mode);
      const sentences = sentencesOf(letter);
      assert.equal(
        new Set(sentences).size,
        sentences.length,
        `${posting.id} ${mode}`
      );
      for (const sentence of NEUTRAL)
        assert.ok(letter.split(sentence).length - 1 <= 1);
    }
});

test("a project is written as On my name project, then its description from the record", () => {
  const { letter } = letterFor(posting1, "owner");
  assert.ok(
    letter.includes(
      "On my Platform Architect Portfolio project, Salesforce APIs behind"
    ),
    letter
  );
  for (const item of snapshot.items.filter((entry) => entry.type === "project"))
    assert.ok(
      !letter.includes(item.text.slice(0, item.text.indexOf(": ") + 2)),
      item.id
    );
});

test("no habit line is left in the letter, and the neutral set is five sentences", () => {
  assert.ok(NEUTRAL.length <= 5);
  for (const posting of [...synthetic, ...injections])
    for (const mode of ["owner", "visitor"]) {
      const { letter } = letterFor(posting, mode);
      for (const line of HABIT_LINES)
        assert.ok(!letter.includes(line), `${posting.id} ${mode} ${line}`);
    }
});

/* ---------- shape ---------- */

test("the shape is an opener, three evidence paragraphs strong first, and a close with the disclosure", () => {
  const { letter, selection } = letterFor(posting1, "owner");
  const body = letterBody(letter);
  assert.equal(body.length, 5);
  assert.ok(
    body[0].startsWith(
      `I am applying for the ${posting1.title} role at ${posting1.company}.`
    )
  );
  assert.ok(
    body[0].includes(snapshot.owner.currentEmployer),
    "the opener names the current employer"
  );
  const byId = new Map(snapshot.items.map((item) => [item.id, item]));
  const first = selection.top_requirements.find(
    (entry) =>
      entry.match === "strong" &&
      entry.evidence_ids.some((id) => byId.get(id)?.type === "bullet")
  );
  const firstBullet = first.evidence_ids
    .map((id) => byId.get(id))
    .find((item) => item.type === "bullet");
  assert.ok(
    body[1].includes(firstBullet.text.split(" ").slice(0, 4).join(" ")),
    "the first evidence paragraph uses the top strong requirement"
  );
  assert.ok(body[4].includes(TEMPLATE_NOTE));
  assert.ok(!letter.includes("\n- "), "no bullet list");
});

test("evidence with a semicolon or a dash is quoted without one", () => {
  const view = {
    owner: { name: "Sample Owner", currentEmployer: "Sample Works" },
    roles: [],
    items: [
      {
        id: "b1",
        type: "bullet",
        text: `Built the release flow; cut the wait ${EM_DASH} by a lot - for each team`
      }
    ]
  };
  const selection = {
    top_requirements: [{ match: "strong", evidence_ids: ["b1"] }]
  };
  const letter = buildTemplateLetter({
    posting: posting1,
    view,
    selection,
    evidenceTexts: [view.items[0].text]
  });
  assert.ok(!new RegExp(`[;${EM_DASH}]| - `).test(letter), letter);
  assert.ok(
    letter.includes(
      "Built the release flow, cut the wait, by a lot, for each team."
    ),
    letter
  );
});

test("the letter is deterministic", () => {
  assert.equal(
    letterFor(posting1, "owner").letter,
    letterFor(posting1, "owner").letter
  );
});

/* ---------- inputs ---------- */

test("the start year goes in only when it is given and the evidence carries it", () => {
  assert.ok(
    !letterFor(posting1, "owner").letter.includes("since"),
    "no start year without the input"
  );
  assert.ok(
    !letterFor(posting1, "owner", { startYear: 1999 }).letter.includes("1999"),
    "a year not in the evidence is left out"
  );
  const view = {
    owner: { name: "Sample Owner", currentEmployer: "Sample Works" },
    roles: [],
    items: [
      {
        id: "b1",
        type: "bullet",
        text: "Worked on the Salesforce platform from 2017 onward"
      }
    ]
  };
  const letter = buildTemplateLetter({
    posting: posting1,
    view,
    selection: {
      top_requirements: [{ match: "strong", evidence_ids: ["b1"] }]
    },
    evidenceTexts: [view.items[0].text],
    startYear: 2017
  });
  assert.ok(
    letter.includes("I have worked on the Salesforce platform since 2017."),
    letter
  );
});

test("no certification count is stated unless the evidence carries it", () => {
  for (const posting of synthetic)
    assert.ok(
      !/current certification/.test(letterFor(posting, "owner").letter)
    );
});

test("the sign off uses the name input, then the snapshot owner, and invents none", () => {
  assert.ok(
    letterFor(posting1, "owner").letter.endsWith(
      `Sincerely,\n${snapshot.owner.name}`
    )
  );
  assert.ok(
    letterFor(posting1, "owner", { ownerName: "Other Name" }).letter.endsWith(
      "Sincerely,\nOther Name"
    )
  );
  assert.ok(buildTemplateLetter({}).endsWith("Sincerely,"));
});

test("the letter names the company and the role, and a missing one is left out", () => {
  const view = viewForMode(snapshot, "owner");
  const named = buildTemplateLetter({
    posting: { company: "Acme", title: "Architect" },
    view
  });
  assert.ok(named.startsWith("Dear Acme hiring team,"), named);
  assert.ok(named.includes("the Architect role at Acme."), named);
  const missing = buildTemplateLetter({
    posting: { company: 42, title: "   " },
    view
  });
  assert.ok(missing.startsWith("Dear hiring team,"), missing);
  assert.ok(missing.includes("the open role."), missing);
  const long = buildTemplateLetter({
    posting: { company: "A Very Long Company Name", title: "Architect" },
    view
  });
  assert.ok(
    long.startsWith("Dear hiring team,"),
    "a long company keeps the greeting one short line"
  );
});

test("no contact detail and no posting text reaches the letter", () => {
  const posting = {
    ...posting1,
    company: "Acme leak.sentinel@example.com",
    title: "Architect call 555-014-2424"
  };
  const { letter } = letterFor(posting, "owner");
  assert.ok(!letter.includes("@") && !letter.includes("555"), letter);
  const words = posting1.text.split(/\s+/).filter(Boolean);
  for (let i = 0; i + 6 <= words.length; i += 1)
    assert.ok(
      !letter.includes(words.slice(i, i + 6).join(" ")),
      "posting text in the letter"
    );
});

test("no input at all still gives a letter, and a broken selection does not throw", () => {
  assert.ok(buildTemplateLetter().startsWith("Dear hiring team,"));
  const broken = buildTemplateLetter({
    posting: posting1,
    view: viewForMode(snapshot, "owner"),
    selection: { roles: 5, top_requirements: 7 }
  });
  assert.equal(letterBody(broken).length, 5);
  assert.ok(!/null|undefined/.test(broken), broken);
});

test("long record text is cut at a word, short text is kept whole, and contact details are removed the Apex way", () => {
  assert.equal(firstWords("one two three, four five", 3), "one two three...");
  assert.equal(firstWords(" one  two ", 5), "one two");
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

/* ---------- through the harness ---------- */

test("through runOne the template fails only the word count, and the injection postings leak nothing", async () => {
  const shingles = promptShingles(snapshot.owner);
  for (const posting of postings)
    for (const mode of ["owner", "visitor"]) {
      const record = await runOne({
        provider: templateProvider(),
        posting,
        snapshot,
        mode,
        validators: REAL,
        blocklist: BLOCKLIST,
        categories
      });
      const where = `${posting.id} ${mode}`;
      assert.equal(record.model, "local-template");
      assert.equal(record.selector.finalOk, true, where);
      assert.deepEqual(record.letter.codes, ["letter.word_count"], where);
      assert.equal(record.grounding.ok, true, where);
      assert.deepEqual(record.usage, { inputTokens: 0, outputTokens: 0 });
      if (injections.includes(posting))
        assert.equal(
          injectionLeaks(record, posting, { blocklist: BLOCKLIST, shingles })
            .leaked,
          false,
          where
        );
    }
});
