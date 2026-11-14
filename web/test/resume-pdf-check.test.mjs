import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  loadShipped,
  renderModel,
  readTextLayer,
  findCollisions,
  readingRows,
  checkOrder,
  checkRoundTrip,
  checkFields,
  parseFields,
  monthRange,
  checkModel,
  failuresOf,
  classifyFailures,
  resumesFrom,
  withoutRetired,
  variantsOf,
  runChecks,
  summaryRows,
  PAGE_OPTIONS,
  TOLERANCE
} from '../build/resume-pdf-check.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const readJson = (...parts) => JSON.parse(readFileSync(path.join(here, ...parts), 'utf8'));
const reads = readJson('..', 'fixtures', 'reads.json');
const budgets = readJson('resume-pdf', 'page-budget.json');
const expected = readJson('resume-pdf', 'expected-failures.json');
// A synthetic resume with invented names: an employer with three roles breaks across two pages,
// so the two roles with no highlights open page 2 and look like an employer heading and a role.
const pageTopGroup = readJson('resume-pdf', 'page-top-group.json');

// A text item as readTextLayer returns it, from a baseline, a width and a size.
function item(str, x, baseline, width, { page = 1, size = 10, index = 0 } = {}) {
  return {
    index,
    page,
    str,
    x,
    baseline,
    width,
    size,
    box: { left: x, right: x + width, bottom: baseline - 0.25 * size, top: baseline + 0.95 * size }
  };
}
const indexed = (items) => items.map((entry, index) => ({ ...entry, index }));

async function adminModel() {
  const { format } = await loadShipped();
  const admin = resumesFrom(reads).find((entry) => entry.persona === 'Admin').resume;
  return format.buildViewModel(admin, PAGE_OPTIONS);
}

test('two text boxes that overlap are reported with both strings, the page and both rectangles', () => {
  const found = findCollisions(indexed([item('Verify', 54, 100, 60), item('RETIRED', 80, 104, 40)]));
  assert.equal(found.length, 1);
  assert.equal(found[0].page, 1);
  assert.equal(found[0].first.text, 'Verify');
  assert.equal(found[0].second.text, 'RETIRED');
  assert.deepEqual(Object.keys(found[0].first.rect), ['left', 'bottom', 'right', 'top']);
  assert.ok(found[0].overlap.width > 0 && found[0].overlap.height > 0);
});

test('boxes that only touch, or sit on different pages, do not collide', () => {
  const touching = item('Second', 114, 100, 30);
  assert.equal(findCollisions(indexed([item('First', 54, 100, 60), touching])).length, 0);
  const nearlyTouching = item('Second', 114 - TOLERANCE / 2, 100, 30);
  assert.equal(findCollisions(indexed([item('First', 54, 100, 60), nearlyTouching])).length, 0);
  assert.equal(findCollisions(indexed([item('A', 54, 100, 60), item('B', 54, 100, 60, { page: 2 })])).length, 0);
});

test('a planted overlap in a real PDF is found through the pdf.js text layer', async () => {
  const { jsPDF, documentPdf, layout, fonts } = await loadShipped();
  const doc = new jsPDF({ unit: 'pt', format: 'letter', compress: true });
  const family = documentPdf.createPdfLoader(null, layout).registerFonts(doc, fonts);
  doc.setFont(family, 'normal');
  doc.setFontSize(10);
  doc.text('Verify on Trailhead', 54, 100);
  doc.setFontSize(8);
  doc.text('RETIRED', 70, 104);
  const layer = await readTextLayer(new Uint8Array(doc.output('arraybuffer')));
  const found = findCollisions(layer.items);
  assert.equal(found.length, 1);
  assert.deepEqual([found[0].first.text, found[0].second.text], ['Verify on Trailhead', 'RETIRED']);
});

test('rows read top to bottom, then left to right', () => {
  const rows = readingRows(indexed([item('right', 300, 700, 20), item('lower', 54, 680, 20), item('left', 54, 700, 20)]));
  assert.deepEqual(rows.map((row) => row.text), ['left right', 'lower']);
});

test('the order check passes lines in order and names a line out of order or missing', () => {
  const items = indexed([item('EXPERIENCE', 54, 700, 60), item('First role', 54, 680, 60), item('Second role', 54, 660, 60)]);
  const lines = [
    { kind: 'heading', text: 'Experience' },
    { kind: 'text', text: 'First role' },
    { kind: 'text', text: 'Second role' }
  ];
  const good = checkOrder(lines, items);
  assert.equal(good.equal, true);
  assert.equal(good.located, 3);
  const swapped = checkOrder([lines[0], lines[2], lines[1]], items);
  assert.equal(swapped.equal, false);
  assert.deepEqual(swapped.outOfOrder.map((line) => line.text), ['First role']);
  const missing = checkOrder([...lines, { kind: 'text', text: 'Third role' }], items);
  assert.deepEqual(missing.missing.map((line) => line.text), ['Third role']);
});

test('the order check fails when the content stream runs in a different order from the page', () => {
  const items = [item('Lower', 54, 660, 40, { index: 0 }), item('Upper', 54, 700, 40, { index: 1 })];
  const result = checkOrder([{ kind: 'text', text: 'Upper' }, { kind: 'text', text: 'Lower' }], items);
  assert.equal(result.streamMatchesReading, false);
  assert.equal(result.equal, false);
});

test('the order check finds an experience entry by its title and a link line by its label', () => {
  const items = indexed([item('Architect, Example Co', 54, 700, 100), item('Verify on Trailhead', 54, 680, 90)]);
  const lines = [
    { kind: 'entry', text: 'Architect | Example Co | Jan 2020 - Present' },
    { kind: 'text', text: 'Verify on Trailhead: https://example.test/verify' }
  ];
  assert.equal(checkOrder(lines, items).equal, true);
});

test('the round trip is 100 when every drawn character comes back and names each miss otherwise', () => {
  const trace = [
    { text: '•', page: 1, y: 92 },
    { text: 'Planted highlight', page: 1, y: 92 },
    { text: 'Second row', page: 1, y: 112 }
  ];
  const good = checkRoundTrip(trace, indexed([item('• Planted highlight', 54, 700, 90), item('Second row', 54, 680, 50)]));
  assert.equal(good.percent, 100);
  assert.deepEqual(good.misses, []);
  const bad = checkRoundTrip(trace, indexed([item('• Planted h?ghlight', 54, 700, 90), item('Second row', 54, 680, 50)]));
  assert.ok(bad.percent < 100);
  assert.deepEqual(bad.misses, [{ page: 1, y: 92, expected: '• Planted highlight', got: '• Planted h?ghlight' }]);
});

test('the round trip reports a text layer row nobody drew', () => {
  const result = checkRoundTrip([], indexed([item('Stray', 54, 700, 30)]));
  assert.equal(result.misses.length, 1);
  assert.equal(result.misses[0].got, 'Stray');
});

test('the fields check recovers every role and certification from the fixture PDF and names a planted miss', async () => {
  const { format, layout } = await loadShipped();
  const model = await adminModel();
  const layer = await readTextLayer((await renderModel(model)).bytes);
  const good = checkFields(model, layer.items, layout, format.employerLabel, layer.pages[0].width);
  assert.equal(good.recovered, good.total);
  assert.ok(good.total > 10);
  const planted = structuredClone(model);
  planted.header.careerObjective = 'Planted summary.';
  planted.employers[0].roles[0].title = 'Planted Title';
  planted.retiredCertifications[0].text = 'Planted Certification, Jan 2000';
  const bad = checkFields(planted, layer.items, layout, format.employerLabel, layer.pages[0].width);
  assert.deepEqual(
    bad.misses.map((miss) => [miss.field, miss.expected]),
    [
      ['summary', 'Planted summary.'],
      ['role 1 title', 'Planted Title'],
      ['retired certification', 'Planted Certification, Jan 2000']
    ]
  );
});

test('two builds give the same text layer, with the creation date fixed', async () => {
  const model = await adminModel();
  const result = await checkModel(model, {});
  assert.equal(result.reproducible, true);
  assert.equal(result.sameBytes, true);
  const lib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = lib.getDocument({ data: (await renderModel(model)).bytes, verbosity: 0 });
  const pdf = await task.promise;
  const { info } = await pdf.getMetadata();
  assert.equal(info.CreationDate, "D:20260101000000+00'00'");
  await task.destroy();
});

test('a page count over the budget fails, and each failed check is named', () => {
  const base = {
    collisions: [],
    order: { equal: true, missing: [], outOfOrder: [], streamMatchesReading: true },
    roundTrip: { percent: 100, misses: [] },
    fields: { misses: [] },
    reproducible: true,
    pages: 3,
    budget: 3
  };
  assert.deepEqual(failuresOf(base), []);
  assert.deepEqual(failuresOf({ ...base, budget: 2 }), ['pages']);
  assert.deepEqual(failuresOf({ ...base, budget: null }), []);
  assert.deepEqual(failuresOf({ ...base, reproducible: false }), ['reproducible']);
});

test('a listed problem is an expected failure and any other problem in the same check is not', () => {
  const listed = [{ variant: '*', check: 'order', problem: 'missing: Summary', reason: 'planted for the test' }];
  const result = {
    failures: ['order'],
    order: { missing: [{ text: 'Summary' }], outOfOrder: [], streamMatchesReading: true }
  };
  assert.deepEqual(classifyFailures('Admin with retired', result, listed), {
    expectedFailures: ['order'],
    unexpectedFailures: []
  });
  const more = { ...result, order: { ...result.order, missing: [{ text: 'Summary' }, { text: 'Skills' }] } };
  assert.deepEqual(classifyFailures('Admin with retired', more, listed).unexpectedFailures, ['order']);
  assert.deepEqual(classifyFailures('Admin with retired', result, []).unexpectedFailures, ['order']);
});

test('the variants are each persona with and without retired certifications', () => {
  const resumes = resumesFrom(reads);
  assert.deepEqual(resumes.map((entry) => entry.persona), ['Admin', 'Architect', 'Developer']);
  const names = variantsOf(resumes).map((variant) => variant.name);
  assert.deepEqual(names, Object.keys(budgets).sort());
  resumes.forEach(({ resume }) => {
    assert.ok(resume.certifications.some((cert) => cert.isRetired === true), 'the fixture holds a retired certification');
    assert.ok(/^https?:\/\//.test(resume.credentialVerificationUrl), 'the fixture holds a verification link');
    assert.ok(withoutRetired(resume).certifications.every((cert) => cert.isRetired !== true));
  });
  const single = resumesFrom({ persona: 'Admin', roles: [] });
  assert.deepEqual(single.map((entry) => entry.persona), ['Admin']);
});

test('all six variants over the fixture data pass, with no known failure listed', async () => {
  assert.deepEqual(expected, []);
  const report = await runChecks(reads, { budgets, expected });
  assert.equal(report.variants.length, 6);
  report.variants.forEach((variant) => {
    assert.equal(variant.family, 'Inter', variant.name);
    assert.deepEqual(variant.collisions, [], variant.name);
    assert.equal(variant.roundTrip.percent, 100, variant.name);
    assert.equal(variant.fields.recovered, variant.fields.total, variant.name);
    assert.equal(variant.reproducible, true, variant.name);
    assert.ok(variant.pages <= variant.budget, variant.name);
    assert.deepEqual(variant.order.outOfOrder, [], variant.name);
    assert.deepEqual(variant.order.missing, [], variant.name);
    assert.equal(variant.order.equal, true, variant.name);
    assert.deepEqual(variant.failures, [], variant.name);
  });
  assert.equal(report.ok, true);
  assert.equal(summaryRows(report).length, 6);
});

test('the command line takes any getResume payload and checks no page budget unless one is given', () => {
  const folder = mkdtempSync(path.join(tmpdir(), 'resume-pdf-check-'));
  try {
    const payload = path.join(folder, 'resume.json');
    writeFileSync(payload, JSON.stringify(resumesFrom(reads).find((entry) => entry.persona === 'Admin').resume));
    const script = path.join(here, '..', 'build', 'resume-pdf-check.mjs');
    const run = (...extra) => spawnSync(process.execPath, [script, payload, ...extra], { encoding: 'utf8' });
    const open = run();
    assert.equal(open.status, 0, open.stderr);
    const report = JSON.parse(open.stdout);
    assert.deepEqual(report.variants.map((variant) => [variant.name, variant.budget]), [
      ['Admin with retired', null],
      ['Admin without retired', null]
    ]);
    const tightFile = path.join(folder, 'budget.json');
    writeFileSync(tightFile, JSON.stringify({ 'Admin with retired': 1 }));
    const tight = run('--budget', tightFile);
    assert.equal(tight.status, 1);
    assert.deepEqual(JSON.parse(tight.stdout).variants[0].unexpectedFailures, ['pages']);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

test('a date range reads as months, with Present open ended and Remote left off', () => {
  assert.deepEqual(monthRange('Jan 2017 - Jul 2017'), { start: 2017 * 12, end: 2017 * 12 + 6 });
  assert.deepEqual(monthRange('Dec 2017 - Present | Remote'), { start: 2017 * 12 + 11, end: Infinity });
  assert.equal(monthRange('2017 to 2021'), null);
});

// A role row: the title at the margin and the dates flush with the right margin.
const roleRow = (title, dates, baseline, page) => [
  item(title, 54, baseline, 80, { page }),
  item(dates, 458, baseline, 100, { page })
];
const openGroupOnPageOne = () => [
  item('EXPERIENCE', 54, 720, 60, { size: 9 }),
  ...roleRow('Old Employer', 'Jan 2010 - Dec 2020', 700, 1),
  ...roleRow('Old Role', 'Jan 2010 - Dec 2020', 684, 1)
];

test('at a page top, a row whose dates do not span the role under it carries on the open group', async () => {
  const { layout } = await loadShipped();
  const items = indexed([
    ...openGroupOnPageOne(),
    ...roleRow('Next Role', 'Dec 2015 - Jun 2018', 738, 2),
    ...roleRow('Last Role', 'Jan 2015 - Jul 2015', 722, 2)
  ]);
  const roles = parseFields(items, layout, 612).experience;
  assert.deepEqual(
    roles.map((role) => [role.heading, role.employer]),
    [
      ['Old Role', 'Old Employer'],
      ['Next Role', 'Old Employer'],
      ['Last Role', 'Old Employer']
    ]
  );
});

test('at a page top, a row whose dates span the role under it opens a new group', async () => {
  const { layout } = await loadShipped();
  const items = indexed([
    ...openGroupOnPageOne(),
    ...roleRow('New Employer', 'Jan 2021 - Present', 738, 2),
    ...roleRow('New Role', 'Mar 2021 - Present', 722, 2)
  ]);
  const roles = parseFields(items, layout, 612).experience;
  assert.deepEqual(
    roles.map((role) => [role.heading, role.employer]),
    [
      ['Old Role', 'Old Employer'],
      ['New Role', 'New Employer']
    ]
  );
});

test('an employer group broken across two pages is read back field by field', async () => {
  const report = await runChecks(pageTopGroup, {});
  assert.deepEqual(report.variants.map((variant) => variant.name), ['Developer with retired', 'Developer without retired']);
  report.variants.forEach((variant) => {
    assert.equal(variant.pages, 2, variant.name);
    assert.deepEqual(variant.fields.misses, [], variant.name);
    assert.deepEqual(variant.failures, [], variant.name);
  });
  const { format, layout } = await loadShipped();
  const model = format.buildViewModel(pageTopGroup, PAGE_OPTIONS);
  const layer = await readTextLayer((await renderModel(model)).bytes);
  const rows = readingRows(layer.items);
  assert.equal(rows.find((row) => row.page === 2).text, 'Evening Tutor Dec 2017 - Jun 2021', 'the shape under test holds');
  const parsed = parseFields(layer.items, layout, layer.pages[0].width).experience;
  assert.deepEqual(
    parsed.slice(1).map((role) => [role.heading, role.employer]),
    [
      ['Support Analyst', 'Sample Training Institute'],
      ['Evening Tutor', 'Sample Training Institute'],
      ['Project Helper', 'Sample Training Institute']
    ]
  );
});
