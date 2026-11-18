#!/usr/bin/env node
/**
 * Scores how outside readers read the resume PDFs.
 *
 * resume-pdf-check.mjs reads every PDF with pdf.js and a field parser written by the same hands
 * as the layout. This file is the other side of that: it builds the same variants, writes each
 * PDF and its plain text to a folder, and scores what other readers recovered from them against
 * the source data. The readers themselves (two offline resume parsers, a layout reader and a PDF
 * validator) are installed outside the repo and run by hand. Their output is read from JSON
 * files in one common shape, so this file needs none of them to run.
 *
 * Commands
 *   generate <reads file> <out folder>        writes <slug>.pdf, <slug>.txt and <slug>.expected.json
 *                                             for every variant, and manifest.json
 *   score <expected> <parsed> [--from openresume|pyresparser]   prints the field by field score of one parser run
 *   report <results folder>                   reads the generated files and every reader's output in the
 *                                             folder and writes summary.md
 *   skim <data file>                          prints the skim answer key of every resume in the file
 *   order <expected file> <text file>         prints the landmark order check of one text file
 *
 * A parsed file is { tool, summary?, roles: [{ employer?, title?, dates? }], certifications? }.
 * A field a parser does not report counts as a miss and says so.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  loadShipped,
  renderModel,
  readTextLayer,
  readingRows,
  variantsOf,
  resumesFrom,
  PAGE_OPTIONS
} from "./resume-pdf-check.mjs";

/** Lower case, one space, no punctuation. The one way two strings are compared. */
export function normalize(text) {
  return String(text === undefined || text === null ? "" : text)
    .toLowerCase()
    .replace(/[–—]/g, " ")
    .replace(/[^a-z0-9()]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** A variant's file name stem: "Architect without retired" becomes "architect-without-retired". */
export function slugOf(name) {
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** The employer without the "(part time)" label the resume adds. */
export function plainEmployer(employer) {
  return String(employer)
    .replace(/\s*\(part[\s-]?time\)\s*$/i, "")
    .trim();
}

/** The dates without the "| Remote" note. */
export function plainDates(dates) {
  return String(dates).split(" | ")[0].trim();
}

const EARLIER_ROLE = /^(.*?), (.*) \((\d{4}(?: to \d{4})?)\)$/;

/** The earlier roles line ("Title, Employer (2017 to 2021) · Title, Employer (2017)") as rows. */
export function parseEarlierRoles(text) {
  if (!text) {
    return [];
  }
  return String(text)
    .split(" · ")
    .map((part) => EARLIER_ROLE.exec(part.trim()))
    .filter(Boolean)
    .map((match) => ({
      title: match[1].trim(),
      employer: plainEmployer(match[2]),
      dates: match[3]
    }));
}

/**
 * What a reader should find, from a view model. The model is the shipped code's reading of the
 * source data. crossCheck below ties each role back to the raw data.
 */
export function expectedFromModel(model) {
  const roles = model.employers.flatMap((group) =>
    group.roles.map((role, groupIndex) => ({
      title: role.title,
      employer: plainEmployer(group.employer),
      dates: plainDates(role.datesText),
      stacked: group.isStacked === true,
      groupIndex,
      current: role.isCurrent === true,
      startDate: role.startDate,
      highlights: (role.highlights || []).map((item) => item.text),
      endDate: role.endDate,
      pageTop: false,
      kind: "role"
    }))
  );
  const earlier = parseEarlierRoles(
    model.earlierRoles ? model.earlierRoles.text : ""
  ).map((role) => ({
    ...role,
    stacked: false,
    current: false,
    pageTop: false,
    kind: "earlier"
  }));
  const certifications = [
    ...model.certificationGroups.flatMap((group) =>
      group.certifications.map((cert) => cert.text)
    ),
    ...model.retiredCertifications.map((cert) => cert.text)
  ];
  return {
    name: model.header ? model.header.name : "",
    summary: model.header ? model.header.careerObjective : "",
    roles,
    earlier,
    certifications
  };
}

/**
 * Ties every expected role back to the raw payload: the same title and employer must exist
 * there, and the dates must be the ones its start and end dates give. Returns the problems.
 */
export function crossCheck(expected, resume) {
  const MONTHS = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec"
  ];
  const problems = [];
  const raw = resume.roles || [];
  expected.roles.forEach((role) => {
    const found = raw.find(
      (item) =>
        normalize(item.title) === normalize(role.title) &&
        normalize(item.employer) === normalize(role.employer) &&
        String(item.startDate) === role.startDate
    );
    if (!found) {
      problems.push(`no raw role for ${role.title} at ${role.employer}`);
      return;
    }
    const month = (iso) =>
      `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
    const end =
      found.isCurrent === true ? "Present" : month(String(found.endDate));
    const dates = `${month(String(found.startDate))} - ${end}`;
    if (dates !== role.dates) {
      problems.push(
        `${role.title}: raw dates ${dates}, expected ${role.dates}`
      );
    }
  });
  expected.earlier.forEach((role) => {
    const found = raw.find(
      (item) =>
        normalize(item.title) === normalize(role.title) &&
        normalize(plainEmployer(item.employer)) === normalize(role.employer)
    );
    if (!found) {
      problems.push(
        `no raw earlier role for ${role.title} at ${role.employer}`
      );
    }
  });
  return problems;
}

/** Marks the roles whose heading row is the first row of a page after the first. */
export function markPageTops(expected, layer) {
  const rows = readingRows(layer.items);
  const firstRows = new Map();
  rows.forEach((row) => {
    if (row.page > 1 && !firstRows.has(row.page)) {
      firstRows.set(row.page, row.text);
    }
  });
  const tops = [...firstRows.values()].map(normalize);
  expected.roles.forEach((role) => {
    const title = normalize(role.title);
    role.pageTop = tops.some((top) => top.includes(title));
  });
  return [...firstRows.entries()].map(([page, text]) => ({ page, text }));
}

const sameDates = (want, got) =>
  normalize(plainDates(want)) === normalize(plainDates(got));

/**
 * Scores one parser run against the expected fields. A role is looked up by its title. A parser
 * that does not report a field scores a miss for it, flagged reported:false. Every field of a
 * role that sits at a page top carries pageTop:true.
 */
export function scoreParse(expected, parsed) {
  const fields = [];
  const looseText = normalize(parsed.looseText || "");
  const add = (field, kind, want, got, ok, extra = {}) =>
    fields.push({
      field,
      kind,
      expected: want,
      got: got === undefined ? null : got,
      ok,
      reported: got !== undefined,
      loose:
        ok ||
        (looseText !== "" &&
          looseText.includes(
            normalize(kind === "dates" ? plainDates(want) : want)
          )),
      ...extra
    });
  const parsedRoles = Array.isArray(parsed.roles) ? parsed.roles : [];
  [...expected.roles, ...expected.earlier].forEach((role, index) => {
    const label = `${role.kind} ${index + 1} ${role.title}`;
    const candidate = parsedRoles.find(
      (item) => item && normalize(item.title) === normalize(role.title)
    );
    const pageTop = role.pageTop === true;
    const place = {
      pageTop,
      section: role.kind,
      stacked: role.stacked === true,
      groupIndex: role.groupIndex || 0
    };
    const titleGot = candidate
      ? candidate.title
      : parsedRoles.some((item) => item && item.title !== undefined)
        ? null
        : undefined;
    add(
      `${label} title`,
      "title",
      role.title,
      titleGot,
      Boolean(candidate),
      place
    );
    const employerGot = candidate
      ? candidate.employer === undefined
        ? undefined
        : candidate.employer
      : undefined;
    add(
      `${label} employer`,
      "employer",
      role.employer,
      candidate ? employerGot : null,
      Boolean(candidate) &&
        employerGot !== undefined &&
        normalize(plainEmployer(employerGot)) === normalize(role.employer),
      place
    );
    const datesGot = candidate ? candidate.dates : null;
    add(
      `${label} dates`,
      "dates",
      role.dates,
      candidate && candidate.dates === undefined ? undefined : datesGot,
      Boolean(candidate) &&
        candidate.dates !== undefined &&
        sameDates(role.dates, candidate.dates),
      place
    );
  });
  const certLines = Array.isArray(parsed.certifications)
    ? parsed.certifications.map(normalize)
    : null;
  expected.certifications.forEach((text) => {
    const name = normalize(
      text.replace(/\s*\(\d{4}\)\s*$/, "").replace(/,\s*[A-Za-z]{3} \d{4}$/, "")
    );
    const ok =
      certLines !== null && certLines.some((line) => line.includes(name));
    add(
      `certification ${text}`,
      "certification",
      text,
      certLines === null ? undefined : ok ? text : null,
      ok,
      {
        pageTop: false,
        section: "certification"
      }
    );
  });
  if (expected.summary) {
    const ok =
      typeof parsed.summary === "string" &&
      normalize(parsed.summary).includes(normalize(expected.summary));
    add(
      "summary",
      "summary",
      expected.summary,
      typeof parsed.summary === "string" ? parsed.summary : undefined,
      ok,
      {
        pageTop: false,
        section: "summary"
      }
    );
  }
  const reportsRoles = parsedRoles.some(
    (item) => item && (item.title || item.employer || item.dates)
  );
  return {
    tool: parsed.tool || "unknown",
    reportsRoles,
    fields,
    ...tally(fields)
  };
}

/** Counts by kind, and the strict line of R26-D12: every employer, title and date range right. */
export function tally(fields) {
  const kinds = {};
  fields.forEach((item) => {
    kinds[item.kind] = kinds[item.kind] || { right: 0, total: 0 };
    kinds[item.kind].total += 1;
    if (item.ok) kinds[item.kind].right += 1;
  });
  const core = fields.filter((item) =>
    ["title", "employer", "dates"].includes(item.kind)
  );
  const misses = fields.filter((item) => !item.ok);
  const coreMisses = core.filter((item) => !item.ok);
  return {
    kinds,
    misses,
    pageTopMisses: coreMisses.filter((item) => item.pageTop),
    strictPass: coreMisses.length === 0,
    mainStrictPass:
      coreMisses.filter((item) => item.section === "role").length === 0,
    looseMisses: core.filter((item) => !item.loose).length
  };
}

/**
 * The landmarks a reader should meet in this order: section headings, role titles, certification
 * names. Same order in the plain text and in the PDF, so one list serves both.
 */
export function landmarksOf(expected) {
  const certName = (text) =>
    text.replace(/\s*\(\d{4}\)\s*$/, "").replace(/,\s*[A-Za-z]{3} \d{4}$/, "");
  return [
    "summary",
    "experience",
    ...expected.roles.flatMap((role) => [
      role.title,
      ...(role.highlights || [])
    ]),
    "skills",
    ...expected.certifications.map(certName),
    "education"
  ];
}

/**
 * Looks for each landmark in the text, moving forward only. A landmark found before the one
 * ahead of it is out of order, one never found is missing.
 */
export function landmarkOrder(landmarks, text) {
  const hay = normalize(text);
  const missing = [];
  const outOfOrder = [];
  let cursor = 0;
  landmarks.forEach((landmark) => {
    const needle = normalize(landmark);
    const ahead = hay.indexOf(needle, cursor);
    if (ahead >= 0) {
      cursor = ahead + needle.length;
      return;
    }
    if (hay.includes(needle)) {
      outOfOrder.push(landmark);
    } else {
      missing.push(landmark);
    }
  });
  return {
    equal: missing.length === 0 && outOfOrder.length === 0,
    missing,
    outOfOrder,
    total: landmarks.length
  };
}

/**
 * OpenResume's parse result as the common shape. Each work experience is one role: its company
 * field is the employer, its job title field the title and its date field the dates. A field the
 * parser left empty is reported as empty, and that is a miss.
 */
export function fromOpenResume(output) {
  const resume = (output && output.resume) || {};
  const work = Array.isArray(resume.workExperiences)
    ? resume.workExperiences
    : [];
  return {
    tool: "OpenResume",
    summary: resume.profile ? resume.profile.summary || "" : undefined,
    roles: work.map((item) => ({
      employer: item.company,
      title: item.jobTitle,
      dates: item.date
    })),
    certifications: undefined,
    looseText: work
      .map((item) => [item.company, item.jobTitle, item.date].join(" | "))
      .join(" | ")
  };
}

/**
 * pyresparser's result as the common shape. It reports designations and company names as two
 * unpaired lists and no dates, so a role is built only when both lists are present and equal in
 * length. Otherwise it reports no roles.
 */
export function fromPyresparser(output) {
  const data = output || {};
  const titles = Array.isArray(data.designation) ? data.designation : [];
  const companies = Array.isArray(data.company_names) ? data.company_names : [];
  const paired = titles.length > 0 && titles.length === companies.length;
  return {
    tool: "pyresparser",
    summary: undefined,
    roles: paired
      ? titles.map((title, index) => ({
          title,
          employer: companies[index],
          dates: undefined
        }))
      : [],
    certifications: undefined,
    looseText: [...titles, ...companies].join(" | ")
  };
}

/** A veraPDF text report as a verdict: the profile, passed or failed, and the failed rule count. */
export function parseVeraText(text) {
  const lines = String(text).split(/\r?\n/);
  const status = lines.find((line) => /^(PASS|FAIL)\b/.test(line.trim()));
  const failed = /^FAIL/.test((status || "").trim());
  const rules = new Set();
  lines.forEach((line) => {
    const match =
      /^\s*(\d+)-(\d+)-(\d+)\s*\(\s*(\d+)\)|^\s*(\d+(?:\.\d+)+)\s+[-:]/.exec(
        line
      );
    if (match) rules.add(line.trim());
  });
  return {
    passed: Boolean(status) && !failed,
    failed,
    hasVerdict: Boolean(status),
    rulesFailed: rules.size
  };
}

/** True when the PDF bytes carry a structure tree. */
export function hasStructureTree(bytes) {
  const text = Buffer.from(bytes).toString("latin1");
  return {
    structTreeRoot: text.includes("/StructTreeRoot"),
    markInfo: /\/MarkInfo\b/.test(text),
    lang: /\/Lang\b/.test(text)
  };
}

/** The text of a veraPDF JSON report's first job, as a verdict. */
export function parseVeraJson(report) {
  const result =
    report &&
    report.report &&
    report.report.jobs &&
    report.report.jobs[0].validationResult;
  const first = Array.isArray(result) ? result[0] : null;
  if (!first || !first.details) {
    return {
      hasVerdict: false,
      compliant: false,
      failedRules: 0,
      failedChecks: 0,
      rules: []
    };
  }
  return {
    hasVerdict: true,
    compliant: first.compliant === true,
    failedRules: first.details.failedRules,
    failedChecks: first.details.failedChecks,
    rules: (first.details.ruleSummaries || []).map((rule) => ({
      clause: rule.clause,
      test: rule.testNumber,
      failedChecks: rule.failedChecks,
      description: rule.description
    }))
  };
}

/**
 * The verdict on the repeated employer heading, from the scored runs. R26-D12: any employer,
 * title or date range missed on a role at a page top counts toward building it.
 */
export function headingVerdict(runs) {
  const hits = [];
  runs.forEach((run) => {
    Object.entries(run.scores).forEach(([tool, score]) => {
      if (!score.reportsRoles) return;
      score.pageTopMisses.forEach((miss) =>
        hits.push({ variant: run.name, tool, field: miss.field })
      );
    });
  });
  const controls = [];
  runs.forEach((run) => {
    Object.entries(run.scores).forEach(([tool, score]) => {
      if (!score.reportsRoles) return;
      score.misses
        .filter(
          (miss) =>
            ["title", "employer", "dates"].includes(miss.kind) &&
            miss.stacked &&
            miss.groupIndex > 0 &&
            !miss.pageTop
        )
        .forEach((miss) =>
          controls.push({ variant: run.name, tool, field: miss.field })
        );
    });
  });
  return { build: hits.length > 0, hits, controls };
}

const cell = (text) => String(text).replace(/\|/g, "/");

/** The results table of summary.md: one row per variant and parser. */
export function summaryTable(runs) {
  const head = [
    "| Variant | Parser | Titles | Employers | Dates | Certifications | Summary | Strict (main roles) | Strict (all roles) | Core misses, strict | Core misses, loose | Page top misses |",
    "|---|---|---|---|---|---|---|---|---|---|---|---|"
  ];
  const count = (score, kind) =>
    score.kinds[kind]
      ? `${score.kinds[kind].right}/${score.kinds[kind].total}`
      : "n/a";
  const rows = runs.flatMap((run) =>
    Object.entries(run.scores).map(
      ([tool, score]) =>
        `| ${cell(run.name)} | ${tool} | ${count(score, "title")} | ${count(score, "employer")} | ${count(score, "dates")} | ${count(score, "certification")} | ${count(score, "summary")} | ${score.mainStrictPass ? "pass" : "fail"} | ${score.strictPass ? "pass" : "fail"} | ${score.misses.filter((m) => ["title", "employer", "dates"].includes(m.kind)).length} | ${score.looseMisses} | ${score.reportsRoles ? score.pageTopMisses.length : "n/a"} |`
    )
  );
  return [...head, ...rows].join("\n");
}

/**
 * The answer key of the six second skim, from the raw payload. The current employer and title
 * are the current role whose title equals the header title (else the newest current role). The
 * years on the platform run from the start of the earliest role with "Salesforce" in its title.
 */
export function skimKey(resume, today = new Date()) {
  const roles = resume.roles || [];
  const headerTitle = resume.header ? normalize(resume.header.title) : "";
  const current = roles.filter((role) => role.isCurrent === true);
  const newest = (list) =>
    list
      .slice()
      .sort((a, b) =>
        String(b.startDate).localeCompare(String(a.startDate))
      )[0];
  const primary =
    current.find((role) => normalize(role.title) === headerTitle) ||
    newest(current) ||
    null;
  const salesforce = roles
    .filter((role) => /salesforce/i.test(role.title || "") && role.startDate)
    .sort((a, b) => String(a.startDate).localeCompare(String(b.startDate)))[0];
  let years = null;
  if (salesforce) {
    const start = new Date(
      `${String(salesforce.startDate).slice(0, 10)}T00:00:00Z`
    );
    years =
      Math.round(((today - start) / (365.25 * 24 * 3600 * 1000)) * 10) / 10;
  }
  const group = (resume.skillGroups || [])[0];
  return {
    employer: primary ? primary.employer : null,
    title: primary ? primary.title : null,
    otherCurrent: current
      .filter((role) => role !== primary)
      .map((role) => `${role.title}, ${role.employer}`),
    platformRole: salesforce
      ? `${salesforce.title}, ${salesforce.employer}, from ${String(salesforce.startDate).slice(0, 10)}`
      : null,
    years,
    firstThreeSkills: group ? group.skills.slice(0, 3) : []
  };
}

const TOOLS = [
  ["OpenResume", "openresume", fromOpenResume],
  ["pyresparser", "pyresparser", fromPyresparser]
];

/** Reads one variant's expected file and every reader's output from the results folder. */
export function loadRun(folder, entry) {
  const read = (file) => (existsSync(file) ? readFileSync(file, "utf8") : null);
  const expected = JSON.parse(
    readFileSync(
      path.join(folder, "files", `${entry.slug}.expected.json`),
      "utf8"
    )
  );
  const scores = {};
  TOOLS.forEach(([label, key, adapt]) => {
    const raw = read(path.join(folder, "parsers", `${entry.slug}.${key}.json`));
    if (raw !== null)
      scores[label] = scoreParse(expected, adapt(JSON.parse(raw)));
  });
  const landmarks = landmarksOf(expected);
  const docling = read(
    path.join(folder, "parsers", `${entry.slug}.docling.md`)
  );
  const plain = read(path.join(folder, "files", `${entry.slug}.txt`));
  const vera = read(path.join(folder, "parsers", `${entry.slug}.vera.json`));
  return {
    name: entry.variant,
    slug: entry.slug,
    expected,
    scores,
    order: {
      plainText: plain === null ? null : landmarkOrder(landmarks, plain),
      docling: docling === null ? null : landmarkOrder(landmarks, docling)
    },
    vera: vera === null ? null : parseVeraJson(JSON.parse(vera)),
    tags: entry.tags,
    pages: entry.pages
  };
}

/** The whole report as markdown, from a results folder that generate and the readers filled. */
export function buildSummary(folder) {
  const manifest = JSON.parse(
    readFileSync(path.join(folder, "files", "manifest.json"), "utf8")
  );
  const runs = manifest.map((entry) => loadRun(folder, entry));
  const verdict = headingVerdict(runs);
  const lines = [];
  lines.push("# R26-3 readability results", "");
  lines.push(
    "## Parsers, one row per variant and parser",
    "",
    summaryTable(runs),
    ""
  );
  lines.push(
    "Every cell is right/total against the source data. Loose counts a field as found when its text appears anywhere in the role entries of the parser, even in the wrong field. Page top misses read n/a for a parser that reports no roles at all. Strict (main roles) is every title, employer and date range of the experience section. Strict (all roles) adds the earlier roles line.",
    ""
  );
  lines.push("## Misses by parser", "");
  TOOLS.forEach(([label]) => {
    lines.push(`### ${label}`, "");
    runs.forEach((run) => {
      const score = run.scores[label];
      if (!score) return;
      const core = score.misses.filter((miss) =>
        ["title", "employer", "dates"].includes(miss.kind)
      );
      const unreported = core.filter((miss) => !miss.reported).length;
      lines.push(
        `- ${run.name}: ${core.length} core misses, ${unreported} of them fields the parser does not report, ${score.pageTopMisses.length} at a page top.`
      );
    });
    lines.push("");
  });
  const first = runs.find((run) => run.scores.OpenResume);
  if (first) {
    lines.push("### OpenResume misses, every variant", "");
    runs.forEach((run) => {
      const score = run.scores.OpenResume;
      if (!score) return;
      lines.push(`**${run.name}**`, "");
      score.misses
        .filter((miss) => ["title", "employer", "dates"].includes(miss.kind))
        .forEach((miss) => {
          lines.push(
            `- ${miss.pageTop ? "[PAGE TOP] " : ""}${miss.field}: expected "${miss.expected}", got ${miss.got === null ? "nothing" : `"${miss.got}"`}`
          );
        });
      lines.push("");
    });
  }
  lines.push("## Page tops", "");
  manifest.forEach((entry) => {
    lines.push(
      `- ${entry.variant}: ${entry.pages} pages. First row of each later page: ${entry.pageTopRows.map((row) => `p${row.page} "${row.text}"`).join(", ") || "none"}. Roles at a page top: ${entry.pageTopRoles.join(", ") || "none"}.`
    );
  });
  lines.push("");
  lines.push("## Reading order (landmark check against the PDF order)", "");
  lines.push(
    "| Variant | Plain text | Docling | Docling out of order | Docling missing |",
    "|---|---|---|---|---|"
  );
  runs.forEach((run) => {
    const plain = run.order.plainText;
    const dl = run.order.docling;
    lines.push(
      `| ${cell(run.name)} | ${plain ? (plain.equal ? "same order" : "differs") : "n/a"} | ${dl ? (dl.equal ? "same order" : "differs") : "n/a"} | ${dl ? cell(dl.outOfOrder.join(", ") || "none") : ""} | ${dl ? cell(dl.missing.join(", ") || "none") : ""} |`
    );
  });
  lines.push("");
  lines.push("## Tags (veraPDF PDF/UA-1 and the byte check)", "");
  lines.push(
    "| Variant | veraPDF | Failed rules | Failed checks | StructTreeRoot | MarkInfo | Lang |",
    "|---|---|---|---|---|---|---|"
  );
  runs.forEach((run) => {
    const vera = run.vera;
    lines.push(
      `| ${cell(run.name)} | ${vera && vera.hasVerdict ? (vera.compliant ? "pass" : "fail") : "not run"} | ${vera ? vera.failedRules : ""} | ${vera ? vera.failedChecks : ""} | ${run.tags.structTreeRoot} | ${run.tags.markInfo} | ${run.tags.lang} |`
    );
  });
  const sample = runs.find((run) => run.vera && run.vera.hasVerdict);
  if (sample) {
    lines.push("", `Failed rules, ${sample.name}:`, "");
    sample.vera.rules.forEach((rule) =>
      lines.push(
        `- ${rule.clause} test ${rule.test}, ${rule.failedChecks} checks: ${rule.description}`
      )
    );
  }
  lines.push("", "## Verdict on the repeated employer heading", "");
  lines.push(
    verdict.build
      ? `Build it. ${verdict.hits.length} core field misses sit on a role at a page top (R26-D12 counts any):`
      : "Do not build it on this evidence. No parser missed a field on a role at a page top."
  );
  verdict.hits.forEach((hit) =>
    lines.push(`- ${hit.variant}, ${hit.tool}: ${hit.field}`)
  );
  lines.push(
    "",
    `Control: ${verdict.controls.length} core misses on the second or later role of a stacked employer group that sits mid page, not at a page top. The same kind of miss happens without a page break.`
  );
  lines.push("");
  return { markdown: lines.join("\n"), runs, verdict };
}

async function generate(readsFile, outDir) {
  const data = JSON.parse(readFileSync(path.resolve(readsFile), "utf8"));
  const { format } = await loadShipped();
  mkdirSync(path.resolve(outDir), { recursive: true });
  const manifest = [];
  for (const variant of variantsOf(resumesFrom(data))) {
    const model = format.buildViewModel(variant.resume, PAGE_OPTIONS);
    const rendered = await renderModel(model);
    const layer = await readTextLayer(rendered.bytes);
    const expected = expectedFromModel(model);
    const problems = crossCheck(expected, variant.resume);
    const pageTopRows = markPageTops(expected, layer);
    const slug = slugOf(variant.name);
    writeFileSync(
      path.join(outDir, `${slug}.pdf`),
      Buffer.from(rendered.bytes)
    );
    writeFileSync(
      path.join(outDir, `${slug}.txt`),
      format.toAtsText(format.buildLines(model))
    );
    writeFileSync(
      path.join(outDir, `${slug}.expected.json`),
      JSON.stringify({ variant: variant.name, ...expected }, null, 2)
    );
    manifest.push({
      variant: variant.name,
      slug,
      pages: rendered.pages,
      roles: expected.roles.length,
      earlier: expected.earlier.length,
      certifications: expected.certifications.length,
      pageTopRows,
      pageTopRoles: expected.roles
        .filter((role) => role.pageTop)
        .map((role) => role.title),
      crossCheckProblems: problems,
      tags: hasStructureTree(rendered.bytes)
    });
  }
  writeFileSync(
    path.join(outDir, "manifest.json"),
    JSON.stringify(manifest, null, 2)
  );
  return manifest;
}

async function main(args) {
  const [command, first, second] = args;
  const readJson = (file) =>
    JSON.parse(readFileSync(path.resolve(file), "utf8"));
  if (command === "generate" && first && second) {
    console.log(JSON.stringify(await generate(first, second), null, 2));
    return;
  }
  if (command === "score" && first && second) {
    const adapter = {
      openresume: fromOpenResume,
      pyresparser: fromPyresparser
    }[args[3] === "--from" ? args[4] : ""];
    const raw = readJson(second);
    const result = scoreParse(readJson(first), adapter ? adapter(raw) : raw);
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.strictPass ? 0 : 1;
    return;
  }
  if (command === "order" && first && second) {
    const result = landmarkOrder(
      landmarksOf(readJson(first)),
      readFileSync(path.resolve(second), "utf8")
    );
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.equal ? 0 : 1;
    return;
  }
  if (command === "skim" && first) {
    const keys = resumesFrom(readJson(first)).map(({ persona, resume }) => ({
      persona,
      ...skimKey(resume)
    }));
    console.log(JSON.stringify(keys, null, 2));
    return;
  }
  if (command === "report" && first) {
    const { markdown } = buildSummary(path.resolve(first));
    writeFileSync(path.join(path.resolve(first), "summary.md"), markdown);
    console.log(markdown);
    return;
  }
  console.error(
    "Usage: node build/resume-readability.mjs generate <reads file> <out folder> | score <expected> <parsed> | order <expected> <text>"
  );
  process.exitCode = 2;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main(process.argv.slice(2));
}
