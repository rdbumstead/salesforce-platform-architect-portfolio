import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTemplateLetter,
  firstWords,
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
 * The template letter. It began as a port of LocalTemplateService and now meets the model letter
 * rules (P-D33). The Apex cases that still apply are kept: company and role, contact details,
 * missing input, the name and start year inputs. The rest check the letter rules themselves.
 */

const { snapshot, postings, categories } = await loadInputs({
  includePrivate: false
});
const REAL = await loadValidators();
const BLOCKLIST = REAL.parseBlocklist("zzinventedclient").terms;
const synthetic = postings.filter((posting) => posting.kind === "synthetic");
const injections = postings.filter((posting) => posting.kind === "injection");

/** The letter, the validator results and the inputs, for one posting in one mode. */
function letterFor(posting, mode, extra = {}) {
  const view = viewForMode(snapshot, mode);
  const check = REAL.validateSelection(
    JSON.stringify(buildFakeSelection({ posting, snapshot: view, categories })),
    snapshot,
    { mode }
  );
  assert.equal(check.ok, true, `${posting.id} ${mode} selection`);
  const selection = extra.selection || check.selection;
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

/* ---------- the letter rules ---------- */

test("the template letter passes validateLetter and checkGrounding on the four synthetic postings in both modes", () => {
  assert.equal(synthetic.length, 4);
  for (const posting of synthetic)
    for (const mode of ["owner", "visitor"]) {
      const { letterCheck, grounding } = letterFor(posting, mode);
      const where = `${posting.id} ${mode}`;
      assert.deepEqual(letterCheck.errors, [], where);
      assert.deepEqual(grounding.errors, [], where);
      assert.equal(letterCheck.paragraphCount, 5, where);
      assert.ok(
        letterCheck.wordCount >= 300 && letterCheck.wordCount <= 400,
        `${where} ${letterCheck.wordCount}`
      );
    }
});

test("the shape is an opener, three evidence paragraphs strong first, and a close", () => {
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
    (entry) => entry.match === "strong" && entry.evidence_ids.length
  );
  const firstText = byId
    .get(first.evidence_ids[0])
    .text.split(" ")
    .slice(0, 4)
    .join(" ");
  assert.ok(
    body[1].includes(firstText),
    "the first evidence paragraph uses the top strong requirement"
  );
  assert.ok(body[4].includes(TEMPLATE_NOTE));
  assert.ok(!letter.includes("\n- "), "no bullet list");
});

test("with fewer than three evidenced requirements the letter keeps five paragraphs and warns", () => {
  const { letterCheck, grounding } = letterFor(posting1, "visitor");
  assert.equal(letterCheck.paragraphCount, 5);
  assert.deepEqual(grounding.errors, []);
  assert.ok(
    letterCheck.warnings.some(
      (warning) => warning.code === "letter.thin_evidence"
    )
  );
});

test("with no evidence at all the letter still has five paragraphs and names the employer", () => {
  const view = viewForMode(snapshot, "owner");
  const letter = buildTemplateLetter({
    posting: posting1,
    view,
    selection: { roles: [], top_requirements: [] },
    evidenceTexts: ["Sample evidence"]
  });
  assert.equal(letterBody(letter).length, 5);
  assert.ok(letter.includes(snapshot.owner.currentEmployer));
});

const EM_DASH = String.fromCharCode(0x2014);

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

test("the template provider answers on every posting in both modes, and the injection postings leak nothing", async () => {
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
      assert.equal(
        record.letter.finalOk,
        true,
        `${where} ${JSON.stringify(record.letter.codes)}`
      );
      assert.equal(
        record.letter.attempts.length,
        1,
        `${where} passes first time`
      );
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
