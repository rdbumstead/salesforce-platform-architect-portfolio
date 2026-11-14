import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
  planted.employers[0].roles[0].title = 'Planted Title';
  planted.retiredCertifications[0].text = 'Planted Certification, Jan 2000';
  const bad = checkFields(planted, layer.items, layout, format.employerLabel, layer.pages[0].width);
  assert.deepEqual(
    bad.misses.map((miss) => [miss.field, miss.expected]),
    [
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
  const result = {
    failures: ['order'],
    order: { missing: [{ text: 'Summary' }], outOfOrder: [], streamMatchesReading: true }
  };
  assert.deepEqual(classifyFailures('Admin with retired', result, expected), {
    expectedFailures: ['order'],
    unexpectedFailures: []
  });
  const more = { ...result, order: { ...result.order, missing: [{ text: 'Summary' }, { text: 'Skills' }] } };
  assert.deepEqual(classifyFailures('Admin with retired', more, expected).unexpectedFailures, ['order']);
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

test('all six variants over the fixture data pass, with only the known Summary heading listed', async () => {
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
    assert.deepEqual(variant.order.missing.map((line) => line.text), ['Summary'], variant.name);
    assert.equal(variant.order.streamMatchesReading, true, variant.name);
    assert.deepEqual(variant.unexpectedFailures, [], variant.name);
  });
  assert.equal(report.ok, true);
  assert.equal(summaryRows(report).length, 6);
});
