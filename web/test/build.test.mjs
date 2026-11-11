import test from 'node:test';
import assert from 'node:assert/strict';
import { readRoutes, rootRelative, placedComponents } from '../build/routes.mjs';
import { splitList, templateReads, graphqlQueries, planRoute, UNEXPORTED_QUERIES } from '../build/plan.mjs';
import { readHeadMarkup, scriptJson, siteStylesheet } from '../build/pages.mjs';
import { resourceIndex, resourcesNamedIn } from '../build/resources.mjs';
import { fixtureReads, FIXTURE_TEXT_LIMIT } from '../build/build.mjs';
import { entrySource, componentSpecifier } from '../build/bundle.mjs';

const PUBLIC_ROUTES = [
  '/',
  '/resume',
  '/skills',
  '/docs',
  '/api-lab',
  '/api-lab/reference',
  '/ai-lab',
  '/delivery',
  '/testimonials',
  '/business-architecture',
  '/nonprofit-solutions',
  '/contact'
];

test('every public route of the Salesforce site becomes a page, plus the error pages', () => {
  const { routes, skipped } = readRoutes();
  const paths = routes.filter((route) => route.path).map((route) => route.path).sort();
  assert.deepEqual(paths, [...PUBLIC_ROUTES].sort());
  assert.deepEqual(routes.filter((route) => route.errorCode).map((route) => route.file).sort(), ['404.html', '429.html', '503.html']);
  assert.ok(skipped.some((route) => route.path === '/login'), 'sign in is not carried over');
});

test('a page places the view components in order with their properties', () => {
  const home = readRoutes().routes.find((route) => route.path === '/');
  assert.deepEqual(
    home.components.map((component) => component.name),
    ['heroBanner', 'caseStudyGrid', 'careerLine', 'credentialsBand', 'homeTestimonials', 'contactCall']
  );
  assert.equal(home.components[5].props.heading, 'Get in touch');
  assert.match(home.headTags, /rel="canonical" href="https:\/\/ryanbumstead\.com\/?"/);
});

test('rich text links become root relative, other links stay as they are', () => {
  assert.equal(rootRelative('<a href="api-lab/reference">x</a>'), '<a href="/api-lab/reference">x</a>');
  assert.equal(rootRelative('<a href="https://a.b/c">x</a> <a href="/d">y</a> <a href="#e">z</a>'), '<a href="https://a.b/c">x</a> <a href="/d">y</a> <a href="#e">z</a>');
});

test('a component the static site cannot render is reported', () => {
  const placed = placedComponents({ type: 'component', definition: 'forceCommunity:unknown', children: [] });
  assert.deepEqual(placed.unknown, ['forceCommunity:unknown']);
});

test('list parsing matches the live data marker', () => {
  assert.deepEqual(splitList(' A, b ,a,, C '), ['A', 'b', 'C']);
});

test('template reads find View source keys and marker names, and refuse bound values', () => {
  const found = templateReads(
    '<c-view-source\n  source-key="apiTester"></c-view-source><c-data-source source-keys="X_One, X_Two" objects="Skill__c"></c-data-source><c-view-source source-key={key}>'
  );
  assert.deepEqual(found.sourceKeys, ['apiTester']);
  assert.deepEqual(found.names, [['X_One', 'X_Two']]);
  assert.deepEqual(found.objects, [['Skill__c']]);
  assert.equal(found.problems.length, 1);
});

test('graphql queries are found by operation name', () => {
  const queries = graphqlQueries('const Q = gql`\n  query FooterGraphqlProbe { uiapi { x } }`;');
  assert.equal(queries[0].name, 'FooterGraphqlProbe');
  assert.ok(UNEXPORTED_QUERIES.has('FooterGraphqlProbe'), 'the latency probe is never answered from the build');
});

test('a plan needs the document list before it can fill getDoc', () => {
  const route = { key: 'docs', components: [] };
  const modules = new Set(['\0site:apex:SourceController.getDoc', '\0site:apex:FooterController.getSystemSnapshot']);
  const without = planRoute(route, modules, {});
  assert.equal(without.problems.length, 1);
  const withKeys = planRoute(route, modules, { docKeys: ['sas', 'adr-027'] });
  assert.deepEqual(withKeys.reads.map((read) => read.params.docKey), ['sas', 'adr-027']);
  assert.ok(!withKeys.reads.some((read) => read.call === 'FooterController.getSystemSnapshot'), 'request time calls are not exported');
});

test('the head keeps the shared tags and drops the per route ones and the platform stylesheets', () => {
  const urls = new Map([...resourceIndex()].map(([name, resource]) => [name, resource.url]));
  const head = readHeadMarkup(urls);
  const joined = head.tags.join('\n');
  assert.match(joined, /og:image" content="https:\/\/ryanbumstead\.com\/sr\/Portfolio_Share_Image\.png"/);
  assert.doesNotMatch(joined, /og:title|twitter:title|my\.site\.com|\/assets\/styles\//);
  assert.doesNotMatch(joined, /name="robots"|noindex/i, 'the Salesforce noindex never reaches the static site');
  assert.match(head.analytics, /gtag\('config'/);
  assert.match(head.analyticsLoader, /^https:\/\/www\.googletagmanager\.com\/gtag\/js\?id=/);
});

test('the global stylesheet points its fonts at /sr', () => {
  assert.match(siteStylesheet(), /url\("\/sr\/Portfolio_Fonts\//);
});

test('script JSON cannot close its script element', () => {
  assert.doesNotMatch(scriptJson({ a: '</script><!--' }), /<\/script>|<!--/);
});

test('file resources keep an extension and folder resources do not', () => {
  const index = resourceIndex();
  assert.equal(index.get('D3_Library').url, '/sr/D3_Library.js');
  assert.equal(index.get('Prism_JS').url, '/sr/Prism_JS');
  assert.ok(index.has('EH_Assets'), 'resources in the demo packages are indexed too');
  assert.deepEqual([...resourcesNamedIn('"resource:Project_Card_Images/a.webp" "/sfsites/c/resource/EH_Assets/x.svg"')], [
    'Project_Card_Images',
    'EH_Assets'
  ]);
});

test('fixtures cut long text and keep JSON text whole', () => {
  const long = 'x'.repeat(FIXTURE_TEXT_LIMIT * 2);
  const json = JSON.stringify({ paths: [long] });
  const cut = fixtureReads({ a: { content: long, catalog: json } });
  assert.ok(cut.a.content.length < long.length);
  assert.equal(cut.a.catalog, json);
});

test('an entry holds the first component and loads the rest and the footer after it', () => {
  const source = entrySource({
    key: 'x',
    layout: 'portfolio',
    components: [{ name: 'pageIntro', props: { heading: 'H' } }, { html: '<p>r</p>' }, { name: 'resumeBuilder' }]
  });
  assert.ok(source.includes('import First from "c/pageIntro"'));
  assert.ok(source.includes('tag: "c-page-intro", ctor: First, props: JSON.parse('));
  assert.ok(source.includes('load: () => import("c/resumeBuilder")'));
  assert.ok(source.includes("loadFooter: () => import('c/footer')"));
  assert.ok(!source.includes('import Footer'));
});

test('a component name that is not an identifier never reaches generated code', () => {
  assert.equal(componentSpecifier('pageIntro'), '"c/pageIntro"');
  assert.throws(() => componentSpecifier("x'); alert(1); ('"));
  assert.throws(() => componentSpecifier('../secret'));
});

test('values placed in generated code cannot close a script element and round trip exactly', async () => {
  const { codeString } = await import('../build/code-string.mjs');
  const backslash = String.fromCharCode(92);
  const values = [
    { html: '<p><a href="/x">y</a></p></script>', line: 'a' + String.fromCharCode(0x2028) + 'b' },
    'a ' + backslash + ' backslash and a "quote"',
    'c/pageIntro'
  ];
  for (const value of values) {
    const text = codeString(value);
    assert.ok(!text.includes('<') && !text.includes('>'));
    assert.ok(!text.includes(String.fromCharCode(0x2028)));
    // The generated source evaluates back to exactly the value it was made from.
    assert.deepEqual(new Function(`return ${text}`)(), value);
  }
});

const PERSON = { name: 'Ada Example', description: 'A <b>headline</b> & more', sameAs: ['https://www.linkedin.com/in/ada', 'https://github.com/ada'] };

test('every public route has a description, and a missing one fails the build', async () => {
  const { assertDescriptions } = await import('../build/static-summary.mjs');
  const { routes } = readRoutes();
  assert.doesNotThrow(() => assertDescriptions(routes));
  assert.doesNotThrow(() => assertDescriptions([{ path: null, description: '' }]), 'an error page needs none');
  assert.throws(() => assertDescriptions([{ path: '/x', description: '  ' }]), /\/x/);
  assert.throws(() => assertDescriptions([{ path: '/x' }]));
});

test('the summary block holds the name, the route text, links to every route and the profiles', async () => {
  const { summaryBlock, HOME_SUMMARY } = await import('../build/static-summary.mjs');
  const { routes } = readRoutes();
  const home = routes.find((route) => route.path === '/');
  const resume = routes.find((route) => route.path === '/resume');
  const block = summaryBlock({ route: home, routes, person: PERSON });
  assert.match(block, /<div id="static-summary">/);
  assert.ok(block.includes('<strong>Ada Example</strong>'));
  assert.ok(block.includes('A &lt;b&gt;headline&lt;/b&gt; &amp; more'), 'person text is escaped');
  assert.ok(block.includes(`<h1>${home.title}</h1>`));
  assert.ok(block.includes(home.description));
  HOME_SUMMARY.forEach((line) => assert.ok(block.includes(line)));
  routes.filter((route) => route.path).forEach((route) => assert.ok(block.includes(`<a href="${route.path}">`), `links to ${route.path}`));
  assert.ok(block.indexOf('href="/resume"') < block.indexOf('href="/skills"'), 'the resume comes early');
  assert.ok(block.includes('<a href="https://github.com/ada">GitHub</a>'));
  assert.ok(!block.includes('<script'));
  const other = summaryBlock({ route: resume, routes, person: PERSON });
  assert.ok(!other.includes(HOME_SUMMARY[0]), 'the home summary is for the home page only');
  assert.ok(other.includes(`<h1>${resume.title}</h1>`));
});

test('the summary is hidden for browsers that run scripts, by a rule in the head', async () => {
  const { summaryCss } = await import('../build/static-summary.mjs');
  assert.match(summaryCss(), /@media \(scripting: enabled\)\{#static-summary\{display:none\}\}/);
});

test('the head reader returns the Person block as an object', () => {
  const urls = new Map([...resourceIndex()].map(([name, resource]) => [name, resource.url]));
  const { person } = readHeadMarkup(urls);
  assert.equal(person['@type'], 'Person');
  assert.ok(Array.isArray(person.sameAs));
});

const TIMELINE = {
  education: [{ school: 'Example College', credential: 'BSc' }],
  certifications: [
    { name: 'Salesforce Certified Platform Administrator', issuer: 'Salesforce', earnedDate: '2024-06-19' },
    { name: 'Other Credential', issuer: '', earnedDate: '' },
    { name: '  ' }
  ]
};

test('the built Person block adds the topics, Trailhead, one credential per certification and the school', async () => {
  const { buildPerson, KNOWS_ABOUT } = await import('../build/static-summary.mjs');
  const base = { '@context': 'https://schema.org', '@type': 'Person', name: 'Ada', jobTitle: 'Senior Solution Consultant', sameAs: ['https://github.com/ada'] };
  const person = buildPerson(base, {
    'ResumeController.getTimeline': TIMELINE,
    'ResumeController.getHeader': { trailheadUrl: 'https://www.salesforce.com/trailblazer/ada' }
  });
  assert.equal(person.jobTitle, 'Senior Solution Consultant');
  assert.deepEqual(person.knowsAbout, KNOWS_ABOUT);
  assert.ok(!person.knowsAbout.some((topic) => /governance/i.test(topic)));
  assert.deepEqual(person.sameAs, ['https://github.com/ada', 'https://www.salesforce.com/trailblazer/ada']);
  assert.equal(person.hasCredential.length, 2, 'a certification with no name is dropped');
  assert.deepEqual(person.hasCredential[0], {
    '@type': 'EducationalOccupationalCredential',
    name: 'Salesforce Certified Platform Administrator',
    credentialCategory: 'certification',
    recognizedBy: { '@type': 'Organization', name: 'Salesforce' },
    dateCreated: '2024-06-19'
  });
  assert.ok(!('recognizedBy' in person.hasCredential[1]) && !('dateCreated' in person.hasCredential[1]));
  assert.deepEqual(person.alumniOf, { '@type': 'EducationalOrganization', name: 'Example College' });
  assert.deepEqual(base.sameAs, ['https://github.com/ada'], 'the input is not changed');
});

test('the Person block leaves alumniOf and credentials out when the data has none', async () => {
  const { buildPerson } = await import('../build/static-summary.mjs');
  const base = { '@type': 'Person', name: 'Ada', sameAs: ['https://github.com/ada'] };
  [{}, { 'ResumeController.getTimeline': { education: [{ school: ' ' }], certifications: [] } }, { 'ResumeController.getTimeline': { education: [] } }].forEach((reads) => {
    const person = buildPerson(base, reads);
    assert.ok(!('alumniOf' in person) && !('hasCredential' in person));
    assert.deepEqual(person.sameAs, ['https://github.com/ada'], 'a missing or non web Trailhead link adds nothing');
  });
  assert.deepEqual(buildPerson(base, { 'ResumeController.getHeader': { trailheadUrl: 'javascript:alert(1)' } }).sameAs, ['https://github.com/ada']);
});

test('the summary block never names the school', async () => {
  const { summaryBlock, buildPerson } = await import('../build/static-summary.mjs');
  const { routes } = readRoutes();
  const person = buildPerson({ '@type': 'Person', name: 'Ada', description: 'x', sameAs: [] }, { 'ResumeController.getTimeline': TIMELINE });
  routes.filter((route) => route.path).forEach((route) => {
    assert.ok(!summaryBlock({ route, routes, person }).includes('Example College'));
  });
});

test('llms.txt lists the resume first, then every route with its description, and names no school', async () => {
  const { llmsTxt, HOME_SUMMARY, buildPerson } = await import('../build/static-summary.mjs');
  const { routes } = readRoutes();
  const person = buildPerson(
    { '@type': 'Person', name: 'Ada Example', description: 'A headline', sameAs: ['https://github.com/ada'] },
    { 'ResumeController.getTimeline': TIMELINE }
  );
  const text = llmsTxt({ routes, person, origin: 'https://site.test' });
  const lines = text.split('\n');
  assert.equal(lines[0], '# Ada Example');
  assert.ok(text.includes(HOME_SUMMARY[0]) && text.includes(HOME_SUMMARY[1]));
  const items = lines.filter((line) => line.startsWith('- [') && line.includes('https://site.test'));
  assert.match(items[0], /^- \[Resume\]\(https:\/\/site\.test\/resume\): /);
  const publicRoutes = routes.filter((route) => route.path);
  assert.equal(items.length, publicRoutes.length);
  publicRoutes.forEach((route) => {
    const address = `https://site.test${route.path === '/' ? '/' : route.path}`;
    assert.ok(items.some((item) => item.includes(`(${address}): ${route.description}`)), `lists ${route.path}`);
  });
  assert.ok(!text.includes('Example College'));
  assert.ok(text.endsWith('\n') && !text.includes('\r'));
});
