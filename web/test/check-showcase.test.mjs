import test from "node:test";
import assert from "node:assert/strict";
import {
  judge,
  withProjectCount,
  formatReport,
  scanShowcase,
  MAX_GAP,
  MIN_TAP
} from "../build/check-showcase.mjs";

const clean = () => ({
  scrollWidth: 390,
  clientWidth: 390,
  taps: [{ name: "a", width: 120, height: 44 }],
  headingToCard: 60,
  headingLines: 1,
  foldCards: [
    { number: 700, title: 740, myPart: 780 },
    { number: 700, title: 740, myPart: 790 }
  ],
  loneWordTitles: [],
  cardCount: 4
});

const kinds = (measure, context) =>
  judge(measure, context).map((finding) => finding.kind);

test("a clean measurement has no findings", () => {
  assert.deepEqual(kinds(clean(), { width: 390, fold: true }), []);
  assert.deepEqual(kinds(clean(), { width: 1280, fold: true }), []);
});

test("sideways scroll is flagged", () => {
  const measure = { ...clean(), scrollWidth: 420 };
  assert.deepEqual(kinds(measure, { width: 390 }), ["scroll"]);
});

test("a tap target under 24 px in either direction is flagged, 24 px is not", () => {
  const measure = {
    ...clean(),
    taps: [
      { name: "thin", width: 100, height: MIN_TAP - 1 },
      { name: "narrow", width: MIN_TAP - 1, height: 40 },
      { name: "exact", width: MIN_TAP, height: MIN_TAP }
    ]
  };
  assert.deepEqual(kinds(measure, { width: 768 }), ["tap", "tap"]);
});

test("the heading to first card limit applies at 390 only", () => {
  const measure = { ...clean(), headingToCard: MAX_GAP + 1 };
  assert.deepEqual(kinds(measure, { width: 390 }), ["gap"]);
  assert.deepEqual(kinds(measure, { width: 360 }), []);
  assert.deepEqual(
    kinds({ ...measure, headingToCard: MAX_GAP }, { width: 390 }),
    []
  );
});

test("at 1280 cards 1 and 2 need their title and number above 800 px, My part may sit below", () => {
  const measure = clean();
  measure.foldCards[1].title = 801;
  measure.foldCards[0].number = 900;
  assert.deepEqual(kinds(measure, { width: 1280, fold: true }), [
    "fold",
    "fold"
  ]);
  const myPartOnly = clean();
  myPartOnly.foldCards[1].myPart = 846;
  assert.deepEqual(kinds(myPartOnly, { width: 1280, fold: true }), []);
  assert.deepEqual(kinds(measure, { width: 768, fold: true }), []);
});

test("a section heading on more than one line is flagged at every width", () => {
  const measure = { ...clean(), headingLines: 5 };
  assert.deepEqual(kinds(measure, { width: 768 }), ["heading"]);
  assert.deepEqual(kinds(measure, { width: 1280 }), ["heading"]);
  assert.deepEqual(kinds({ ...measure, headingLines: 0 }, { width: 720 }), [
    "heading"
  ]);
  assert.deepEqual(
    kinds({ ...measure, headingLines: null }, { width: 768 }),
    []
  );
});

test("a title ending with one word alone is flagged", () => {
  const measure = {
    ...clean(),
    loneWordTitles: ["Building this site as a production org"]
  };
  const found = judge(measure, { width: 360 });
  assert.equal(found.length, 1);
  assert.equal(found[0].kind, "lone");
  assert.match(found[0].detail, /production org/);
});

test("withProjectCount cuts and pads the saved home read", () => {
  const rows = [
    { key: "a", title: "One" },
    { key: "b", title: "Two" },
    { key: "c", title: "Three" }
  ];
  const html = `<html><script type="application/json" id="site-data">${JSON.stringify({ reads: { "ProjectCardController.getHomeCaseStudies": rows } })}</script></html>`;
  const read = (text, n) => {
    const out = withProjectCount(text, n);
    const body = out.split('id="site-data">')[1].split("</script>")[0];
    return JSON.parse(body).reads["ProjectCardController.getHomeCaseStudies"];
  };
  assert.deepEqual(
    read(html, 2).map((row) => row.key),
    ["a", "b"]
  );
  const eight = read(html, 8);
  assert.equal(eight.length, 8);
  assert.equal(new Set(eight.map((row) => row.key)).size, 8);
  assert.equal(new Set(eight.map((row) => row.title)).size, 8);
  assert.throws(() => withProjectCount("<html></html>", 3), /site-data/);
});

test("the report names the count, width, scheme and rule", () => {
  assert.equal(formatReport([]), "No showcase problems found.");
  const line = formatReport([
    { count: 5, width: 390, scheme: "dark", kind: "gap", detail: "too far" }
  ]);
  assert.match(line, /5 projects {2}390px dark {2}gap {2}too far/);
});

test("scanShowcase reports an empty page with no showcase host", () => {
  const previous = globalThis.document;
  globalThis.document = {
    documentElement: { scrollWidth: 300, clientWidth: 300 },
    querySelector: () => null
  };
  try {
    const measure = scanShowcase();
    assert.equal(measure.cardCount, 0);
    assert.deepEqual(measure.taps, []);
  } finally {
    globalThis.document = previous;
  }
});
