import test from 'node:test';
import assert from 'node:assert/strict';
import { readRoutes, rootRelative, placedComponents } from '../build/routes.mjs';
import { splitList, templateReads, graphqlQueries, planRoute, UNEXPORTED_QUERIES } from '../build/plan.mjs';
import { readHeadMarkup, scriptJson, siteStylesheet } from '../build/pages.mjs';
import { resourceIndex, resourcesNamedIn } from '../build/resources.mjs';
import { fixtureReads, FIXTURE_TEXT_LIMIT } from '../build/build.mjs';
import { entrySource } from '../build/bundle.mjs';

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
  assert.ok(source.includes("import First from 'c/pageIntro'"));
  assert.ok(source.includes('tag: "c-page-intro", ctor: First, props: {"heading":"H"}'));
  assert.ok(source.includes("load: () => import('c/resumeBuilder')"));
  assert.ok(source.includes("loadFooter: () => import('c/footer')"));
  assert.ok(!source.includes('import Footer'));
});
