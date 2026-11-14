/**
 * Keeps unverified skills and projects out of the GraphQL data the static pages are built from.
 *
 * On the Salesforce site the guest sharing rules already hide them, because the guest reads
 * Skill__c and Project__c only where Is_Verified__c is true. The build reads the same queries as
 * the build user, who is internal and reads every row. So the build runs each query exactly as
 * the component sends it, which keeps the read key the browser looks up, and then drops the rows
 * the guest would not get.
 *
 * A row goes when its own Id, or an Id it points at, is an unverified skill or project. That
 * covers a Skill__c or Project__c row, and a Project_Skill__c, Experience_Skill__c,
 * Certification_Skill__c or Project_Asset__c row whose skill or project is unverified, as long as
 * the query selects that reference. A child list nested inside a dropped row goes with it.
 */

/** The objects whose rows the guest reads only when verified. */
export const VERIFIED_OBJECTS = ['Skill__c', 'Project__c'];

/** The SOQL that finds the rows to drop, one query per object. */
export function unverifiedQuery(object) {
  if (!VERIFIED_OBJECTS.includes(object)) throw new Error(`${object} has no verified filter`);
  return `SELECT Id FROM ${object} WHERE Is_Verified__c = FALSE`;
}

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const isConnection = (value) => isPlainObject(value) && Array.isArray(value.edges);

/** True when the node, outside its own child lists, holds an unverified Id. */
function pointsAtUnverified(value, unverified) {
  if (typeof value === 'string') return unverified.has(value);
  if (Array.isArray(value)) return value.some((item) => pointsAtUnverified(item, unverified));
  if (!isPlainObject(value) || isConnection(value)) return false;
  return Object.values(value).some((item) => pointsAtUnverified(item, unverified));
}

function filterTree(value, unverified, counter) {
  if (Array.isArray(value)) return value.map((item) => filterTree(item, unverified, counter));
  if (!isPlainObject(value)) return value;
  const out = {};
  Object.entries(value).forEach(([key, item]) => {
    out[key] = filterTree(item, unverified, counter);
  });
  if (isConnection(value)) {
    const kept = out.edges.filter((edge) => !(isPlainObject(edge) && pointsAtUnverified(edge.node, unverified)));
    const dropped = out.edges.length - kept.length;
    if (dropped) {
      counter.dropped += dropped;
      out.edges = kept;
      if (typeof out.totalCount === 'number') out.totalCount = Math.max(0, out.totalCount - dropped);
    }
  }
  return out;
}

/**
 * The GraphQL response without the rows that reach an unverified skill or project. The shape is
 * unchanged: every connection keeps its edges list and its other keys.
 * @param {{ data: any, errors?: any[] }} response what graphqlCall returned
 * @param {Set<string>} unverified the 18 character Ids of unverified skills and projects
 * @returns {{ response: { data: any, errors?: any[] }, dropped: number }}
 */
export function dropUnverified(response, unverified) {
  if (!response || !unverified || unverified.size === 0) return { response, dropped: 0 };
  const counter = { dropped: 0 };
  const data = filterTree(response.data, unverified, counter);
  return { response: { ...response, data }, dropped: counter.dropped };
}
