import test from 'node:test';
import assert from 'node:assert/strict';
import { dropUnverified, unverifiedQuery, VERIFIED_OBJECTS } from '../build/verified.mjs';
import { runReads, keyOf } from '../build/export.mjs';

// 18 character Ids, as the UI API and the REST query endpoint return them.
const SKILL_KEPT = 'a0KE200000AAAAAAA1';
const SKILL_DROPPED = 'a0KE200000AAAAAAA2';
const PROJECT_KEPT = 'a0JE200000BBBBBBB1';
const PROJECT_DROPPED = 'a0JE200000BBBBBBB2';
const ROLE = 'a0LE200000CCCCCCC1';
const UNVERIFIED = new Set([SKILL_DROPPED, PROJECT_DROPPED]);

const field = (value) => ({ value });
const skill = (id, name) => ({ node: { Id: id, Name: field(name), Category__c: field('Backend'), Proficiency__c: field(5) } });
const projectSkill = (id, projectId, skillId, projectName) => ({
  node: { Id: id, Project__c: field(projectId), Skill__c: field(skillId), Project__r: { Name: field(projectName) } }
});
const experienceSkill = (id, skillId) => ({
  node: { Id: id, Experience__c: field(ROLE), Skill__c: field(skillId), Experience__r: { Name: field('Architect') } }
});

/** The SkillNetworkGraph shape: three connections under uiapi.query. */
function skillNetwork() {
  return {
    data: {
      uiapi: {
        query: {
          Skill__c: { edges: [skill(SKILL_KEPT, 'Apex'), skill(SKILL_DROPPED, 'Unverified skill')] },
          Project_Skill__c: {
            edges: [
              projectSkill('PS1', PROJECT_KEPT, SKILL_KEPT, 'Kept project'),
              projectSkill('PS2', PROJECT_KEPT, SKILL_DROPPED, 'Kept project'),
              projectSkill('PS3', PROJECT_DROPPED, SKILL_KEPT, 'Unverified project')
            ]
          },
          Experience_Skill__c: { edges: [experienceSkill('ES1', SKILL_KEPT), experienceSkill('ES2', SKILL_DROPPED)] }
        }
      }
    },
    errors: []
  };
}

/** The ProjectAssetGallery shape: projects with their assets nested inside. */
function gallery() {
  const asset = (id, name) => ({ node: { Id: id, Name: field(name), Type__c: field('Image'), Sort_Order__c: field(1) } });
  return {
    data: {
      uiapi: {
        query: {
          Project__c: {
            totalCount: 2,
            edges: [
              { node: { Id: PROJECT_KEPT, Name: field('Kept project'), Project_Assets__r: { edges: [asset('PA1', 'Kept asset')] } } },
              {
                node: {
                  Id: PROJECT_DROPPED,
                  Name: field('Unverified project'),
                  Project_Assets__r: { edges: [asset('PA2', 'Asset of an unverified project')] }
                }
              }
            ]
          }
        }
      }
    },
    errors: []
  };
}

const ids = (connection) => connection.edges.map((edge) => edge.node.Id);

test('the filter reads only skills and projects, each by its verified flag', () => {
  assert.deepEqual(VERIFIED_OBJECTS, ['Skill__c', 'Project__c']);
  assert.equal(unverifiedQuery('Skill__c'), 'SELECT Id FROM Skill__c WHERE Is_Verified__c = FALSE');
  assert.throws(() => unverifiedQuery('Account'), /no verified filter/);
});

test('an unverified skill goes, with every skill link that reaches it or an unverified project', () => {
  const { response, dropped } = dropUnverified(skillNetwork(), UNVERIFIED);
  const query = response.data.uiapi.query;
  assert.deepEqual(ids(query.Skill__c), [SKILL_KEPT]);
  assert.deepEqual(ids(query.Project_Skill__c), ['PS1']);
  assert.deepEqual(ids(query.Experience_Skill__c), ['ES1']);
  assert.equal(dropped, 4);
});

test('the kept rows keep the shape the skill network reads', () => {
  const { response } = dropUnverified(skillNetwork(), UNVERIFIED);
  const query = response.data.uiapi.query;
  assert.deepEqual(response.errors, []);
  assert.deepEqual(Object.keys(query), ['Skill__c', 'Project_Skill__c', 'Experience_Skill__c']);
  assert.deepEqual(query.Skill__c.edges[0], skill(SKILL_KEPT, 'Apex'));
  assert.deepEqual(query.Project_Skill__c.edges[0], projectSkill('PS1', PROJECT_KEPT, SKILL_KEPT, 'Kept project'));
  assert.deepEqual(query.Experience_Skill__c.edges[0], experienceSkill('ES1', SKILL_KEPT));
});

test('an unverified project goes from the gallery with its assets, and the count follows', () => {
  const { response, dropped } = dropUnverified(gallery(), UNVERIFIED);
  const projects = response.data.uiapi.query.Project__c;
  assert.deepEqual(ids(projects), [PROJECT_KEPT]);
  assert.equal(projects.totalCount, 1);
  assert.deepEqual(ids(projects.edges[0].node.Project_Assets__r), ['PA1']);
  assert.equal(dropped, 1, 'the nested asset goes with its project and is not counted twice');
  assert.doesNotMatch(JSON.stringify(response), /unverified/i);
});

test('with nothing unverified the response is the same object, untouched', () => {
  const original = skillNetwork();
  const { response, dropped } = dropUnverified(original, new Set());
  assert.equal(response, original);
  assert.equal(dropped, 0);
});

test('the input response is not changed', () => {
  const original = skillNetwork();
  const before = JSON.stringify(original);
  dropUnverified(original, UNVERIFIED);
  assert.equal(JSON.stringify(original), before);
});

test('the export reads the unverified Ids, keeps the query text and files the filtered rows under its key', async (t) => {
  const instanceUrl = 'https://example.my.salesforce.com';
  const seen = [];
  const reply = (body, status = 200) => ({ status, text: async () => JSON.stringify(body) });
  t.mock.method(globalThis, 'fetch', async (url, init = {}) => {
    seen.push({ url: String(url), body: init.body });
    if (String(url).endsWith('/limits')) return reply({});
    if (String(url).includes('/query?q=')) {
      const soql = decodeURIComponent(String(url).split('q=')[1]);
      if (soql.includes('FROM Skill__c')) return reply({ records: [{ Id: SKILL_DROPPED }], done: false, nextRecordsUrl: '/services/data/v62.0/query/next-1' });
      return reply({ records: [{ Id: PROJECT_DROPPED }], done: true });
    }
    if (String(url).endsWith('/query/next-1')) return reply({ records: [], done: true });
    if (String(url).endsWith('/graphql')) return reply(skillNetwork());
    return reply({}, 404);
  });
  t.mock.method(console, 'log', () => {});
  const query = 'query SkillNetworkGraph{uiapi{query{Skill__c(first:200){edges{node{Id}}}}}}';
  const read = { call: 'graphql', query };
  const results = await runReads({ instanceUrl, token: 'token', targetOrg: 'test' }, [read]);
  const filed = results[keyOf(read)];
  assert.deepEqual(ids(filed.data.uiapi.query.Skill__c), [SKILL_KEPT]);
  assert.deepEqual(ids(filed.data.uiapi.query.Project_Skill__c), ['PS1']);
  const graphqlCall = seen.find((call) => call.url.endsWith('/graphql'));
  assert.equal(JSON.parse(graphqlCall.body).query, query, 'the component query goes out as it is');
  assert.ok(seen.some((call) => call.url.endsWith('/query/next-1')), 'a second page of Ids is followed');
});

test('a failed Id read fails the export instead of publishing unfiltered rows', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url) => {
    if (String(url).endsWith('/limits')) return { status: 200, text: async () => '{}' };
    return { status: 500, text: async () => '{}' };
  });
  await assert.rejects(
    runReads({ instanceUrl: 'https://example.my.salesforce.com', token: 'token', targetOrg: 'test' }, [{ call: 'graphql', query: 'query A{uiapi{query{Skill__c{edges{node{Id}}}}}}' }]),
    /unverified Skill__c Ids failed/
  );
});
