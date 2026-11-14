/**
 * Which Apex calls answer from build time data and which need Salesforce at request time.
 * One list, read by the bundler, the export and the coverage check.
 */

/** Calls that change something or must be read when the visitor asks. */
export const REQUEST_TIME_CALLS = new Set([
  'FooterController.getSystemSnapshot',
  'SiteRedirectController.getRedirect',
  'ContactFormController.submitContact',
  'TestimonialController.submitTestimonial',
  'TestimonialController.submitOwnTestimonial',
  'ApiLabController.generateCoverLetter',
  'ApiLabController.invokeVersioned',
  'ApiLabController.requestEvaluatorToken'
]);

/**
 * Calls a component imports whose wire can never be provisioned on a public page, with the
 * reason. The coverage check accepts these as imported but not exported.
 */
export const UNREACHABLE_CALLS = new Map([
  [
    'SchemaService.getObjectGraph',
    'schemaVisualizer wires it only when its objects property is set, and no page or parent sets it.'
  ],
  ['ApiLabController.invoke', 'No component imports it. apiTester imports invokeVersioned under that name.']
]);

export function modeOf(call) {
  return REQUEST_TIME_CALLS.has(call) ? 'request' : 'build';
}
