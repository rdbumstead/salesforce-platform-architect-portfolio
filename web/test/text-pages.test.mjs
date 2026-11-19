import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  textRoutes,
  textPageHtml,
  writeTextPages,
  FOCUS_LABELS,
  TEXT_ROOT
} from "../build/text-pages.mjs";
import {
  loadShipped,
  PAGE_OPTIONS,
  PUBLIC_FOCUSES,
  resumesFrom
} from "../build/resume-pdf-check.mjs";
import { readRoutes } from "../build/routes.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const reads = JSON.parse(
  fs.readFileSync(path.join(here, "..", "fixtures", "reads.json"), "utf8")
);
const { routes } = readRoutes();
const escape = (text) =>
  String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
const headings = (html) =>
  [...html.matchAll(/<h([1-6])>([\s\S]*?)<\/h\1>/g)].map((match) => [
    Number(match[1]),
    match[2]
  ]);

async function build() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "text-pages-"));
  const files = await writeTextPages({
    distDir: dir,
    reads,
    head: [],
    styles: "/assets/site.css"
  });
  return { dir, files };
}

test("there is one text page per public focus, under /resume/text, in the focus order", async () => {
  assert.equal(TEXT_ROOT, "/resume/text");
  assert.deepEqual(
    textRoutes().map((route) => route.focus),
    [...PUBLIC_FOCUSES]
  );
  assert.deepEqual(
    textRoutes().map((route) => route.path),
    PUBLIC_FOCUSES.map((focus) => `/resume/text/${focus.toLowerCase()}`)
  );
  const { dir, files } = await build();
  try {
    assert.deepEqual(
      files,
      textRoutes().map((route) => route.file)
    );
    files.forEach((file) =>
      assert.ok(fs.existsSync(path.join(dir, file)), file)
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("the text pages are not site routes, so the sitemap and the route table never list them", () => {
  const paths = routes.map((route) => route.path).filter(Boolean);
  textRoutes().forEach((route) =>
    assert.ok(!paths.includes(route.path), route.path)
  );
  assert.ok(paths.includes("/resume"), "the resume route stays");
  // A file named resume.html and a folder named resume sit side by side.
  assert.ok(routes.some((route) => route.file === "resume.html"));
});

test("the focus labels match the resume page options", () => {
  const source = fs.readFileSync(
    path.join(
      here,
      "..",
      "..",
      "packages",
      "portfolio-site",
      "main",
      "default",
      "lwc",
      "resumeBuilder",
      "resumeBuilder.js"
    ),
    "utf8"
  );
  const options = [
    ...source.matchAll(/\{ label: "([^"]+)", value: "([^"]+)" \}/g)
  ].map((match) => [match[2], match[1]]);
  assert.deepEqual(options, Object.entries(FOCUS_LABELS));
});

test("each page is noindex, canonical to the resume page, in English and free of script", async () => {
  const { dir, files } = await build();
  try {
    files.forEach((file) => {
      const html = fs.readFileSync(path.join(dir, file), "utf8");
      assert.match(html, /^<!doctype html>\n<html lang="en">/);
      assert.match(html, /<meta name="robots" content="noindex">/);
      assert.match(
        html,
        /<link rel="canonical" href="https:\/\/ryanbumstead\.com\/resume">/
      );
      assert.doesNotMatch(html, /<script/i);
      assert.match(html, /<main id="resume-text">/);
      assert.match(html, /<header>[\s\S]*<nav aria-label="Pages">/);
      assert.match(html, /<footer>/);
      assert.match(html, /<a class="skip" href="#resume-text">/);
      assert.match(html, /<meta name="color-scheme" content="light dark">/);
      assert.doesNotMatch(html, /data-theme|theme-toggle/i);
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("the headings are one h1 with the name, then h2 sections in the order of the PDF", async () => {
  const { format } = await loadShipped();
  const { dir, files } = await build();
  try {
    for (const route of textRoutes()) {
      const html = fs.readFileSync(path.join(dir, route.file), "utf8");
      const model = format.buildViewModel(
        reads[`ResumeController.getResume|{"persona":"${route.focus}"}`],
        PAGE_OPTIONS
      );
      const found = headings(html);
      assert.deepEqual(
        found.filter(([level]) => level === 1),
        [[1, escape(model.header.name)]],
        route.focus
      );
      const lines = format.buildLines(model);
      const pdfSections = lines
        .filter((line) => line.kind === "heading")
        .map((line) => escape(line.text));
      assert.deepEqual(
        found.filter(([level]) => level === 2).map(([, text]) => text),
        pdfSections,
        route.focus
      );
      assert.ok(html.includes(route.label), route.focus);
      assert.ok(files.includes(route.file));
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("every role in the PDF is on the page as a title with dates, then the employer, with its bullets", async () => {
  const { format } = await loadShipped();
  const { dir } = await build();
  try {
    for (const route of textRoutes()) {
      const html = fs.readFileSync(path.join(dir, route.file), "utf8");
      const model = format.buildViewModel(
        reads[`ResumeController.getResume|{"persona":"${route.focus}"}`],
        PAGE_OPTIONS
      );
      const roles = model.employers.flatMap((group) => group.roles);
      assert.ok(roles.length > 0, route.focus);
      assert.equal(
        (html.match(/<div class="role">/g) || []).length,
        roles.length,
        route.focus
      );
      let at = 0;
      roles.forEach((role) => {
        const start = html.indexOf(
          `<strong class="role-title">${escape(role.title)}</strong><span class="role-dates">${escape(role.datesText)}</span></p>`,
          at
        );
        assert.ok(start >= at, `${route.focus} ${role.title} in order`);
        at = start;
        if (role.employerText) {
          const employer = html.indexOf(
            `<p class="role-employer">${escape(role.employerText)}</p>`,
            at
          );
          assert.ok(
            employer > at,
            `${route.focus} ${role.title} employer under the title`
          );
          at = employer;
        }
        role.highlights.forEach((highlight) =>
          assert.ok(
            html.includes(`<li>${escape(highlight.text)}</li>`),
            highlight.key
          )
        );
      });
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("the summary shows when the read has one, and the section is left out when it does not", async () => {
  const { format } = await loadShipped();
  const [first] = resumesFrom(reads);
  const route = textRoutes().find((entry) => entry.focus === first.persona);
  const withSummary = format.buildViewModel(
    { ...first.resume, summary: "A planted line." },
    PAGE_OPTIONS
  );
  const without = format.buildViewModel(
    { ...first.resume, summary: null },
    PAGE_OPTIONS
  );
  const make = (model) =>
    textPageHtml({ route, model, head: [], styles: "/a.css" });
  assert.match(make(withSummary), /<h2>Summary<\/h2><p>A planted line\.<\/p>/);
  assert.doesNotMatch(make(without), /<h2>Summary<\/h2>/);
});

test("a missing read fails the build instead of leaving a dead link", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "text-pages-"));
  try {
    const partial = { ...reads };
    delete partial['ResumeController.getResume|{"persona":"Consultant"}'];
    await assert.rejects(
      writeTextPages({
        distDir: dir,
        reads: partial,
        head: [],
        styles: "/a.css"
      }),
      /Consultant/
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("the header is compact: Home, Resume and the two other focuses, with one Contact link only", async () => {
  const { dir } = await build();
  try {
    for (const route of textRoutes()) {
      const html = fs.readFileSync(path.join(dir, route.file), "utf8");
      const nav = html.match(/<nav aria-label="Pages">([\s\S]*?)<\/nav>/)[1];
      const labels = [...nav.matchAll(/<a href="[^"]+">([^<]+)<\/a>/g)].map(
        (match) => match[1]
      );
      const others = textRoutes()
        .filter((entry) => entry.focus !== route.focus)
        .map((entry) => entry.label);
      assert.deepEqual(labels, ["Home", "Resume", ...others], route.focus);
      assert.equal(
        (html.match(/>Contact<\/a>/g) || []).length,
        1,
        `${route.focus} one Contact`
      );
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("certifications read as one line per issuer, names comma separated, like the PDF", async () => {
  const { format } = await loadShipped();
  const { dir } = await build();
  try {
    for (const route of textRoutes()) {
      const html = fs.readFileSync(path.join(dir, route.file), "utf8");
      const model = format.buildViewModel(
        reads[`ResumeController.getResume|{"persona":"${route.focus}"}`],
        PAGE_OPTIONS
      );
      model.certificationGroups.forEach((group) => {
        const names = group.certifications
          .map((cert) => escape(cert.text))
          .join(", ");
        assert.ok(
          html.includes(
            `<span class="label">${escape(group.issuer)}:</span> ${names}</li>`
          ),
          `${route.focus} ${group.issuer}`
        );
      });
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("the earlier roles separator stays with the entry before it, so a wrapped line never starts with it", async () => {
  const { format } = await loadShipped();
  const [first] = resumesFrom(reads);
  const route = textRoutes().find((entry) => entry.focus === first.persona);
  const model = format.buildViewModel(first.resume, PAGE_OPTIONS);
  assert.ok(model.earlierRoles, "the fixture has earlier roles");
  const html = textPageHtml({ route, model, head: [], styles: "/a.css" });
  const line = html.match(/<p class="earlier">[\s\S]*?<\/p>/)[0];
  assert.match(line, /&nbsp;· /);
  assert.doesNotMatch(line, / · /);
});

test("the page sizes its own headings, since the site stylesheet resets them to body size", () => {
  const [first] = resumesFrom(reads);
  const route = textRoutes().find((entry) => entry.focus === first.persona);
  const html = textPageHtml({
    route,
    model: {
      ...{ sections: [], employers: [] },
      header: { name: "A", links: [] }
    },
    head: [],
    styles: "/a.css"
  });
  assert.match(html, /\.text-page h1\{font-size:2rem;font-weight:700/);
  assert.match(html, /\.text-page h2\{font-size:1\.375rem;font-weight:700/);
});
