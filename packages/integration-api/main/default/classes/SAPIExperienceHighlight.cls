/**
 * @description       : SAPI Experience Highlight REST resource (/experience-highlights).
 *                      Supports experienceId and persona filters; persona matches the
 *                      Persona_Tag__c multi-select picklist with INCLUDES.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/20/2026
 * @Test Class        : [SAPIExperienceHighlightTest]
 **/
@RestResource(urlMapping='/sapi/v1/experience-highlights/*')
global with sharing class SAPIExperienceHighlight {
  private static final String SELECT_FIELDS =
    'SELECT Id, Name, Experience__c, Experience__r.Name, Description__c, Sort_Order__c, Persona_Tag__c ' +
    'FROM Experience_Highlight__c';
  private static final String ORDER_BY = ' ORDER BY Sort_Order__c ASC, Name ASC';

  // Persona enum from the spec, keyed by lower case for case-insensitive matching.
  private static final Map<String, String> PERSONAS = new Map<String, String>{
    'admin' => 'Admin',
    'developer' => 'Developer',
    'architect' => 'Architect'
  };

  /**
   * @description GET method. Retrieves Experience_Highlight__c records with pagination and
   *              experienceId and persona filters. persona accepts one value or a
   *              comma-separated list from Admin, Developer, Architect.
   */
  @HttpGet
  global static void getExperienceHighlights() {
    ApiRequestContext ctx = ApiRequestContext.begin();
    if (ctx.isRejected()) {
      return;
    }

    try {
      if (Test.isRunningTest() && throwException) {
        throw new CalloutException('Forced Exception');
      }

      Integer limitParam = ctx.limitParam();
      Integer offsetParam = ctx.offsetParam();
      if (ctx.isRejected()) {
        return;
      }
      String experienceId = ctx.stringParam('experienceId');
      if (
        String.isNotBlank(experienceId) &&
        !SAPITransformer.isSalesforceId(experienceId)
      ) {
        ctx.error(400, 'BAD_REQUEST', 'experienceId must be a Salesforce Id.');
        return;
      }
      String persona = ctx.stringParam('persona');
      List<String> personas = parsePersonas(persona);
      if (personas == null) {
        ctx.error(
          400,
          'BAD_REQUEST',
          'persona must be one or more of Admin, Developer, Architect.'
        );
        return;
      }

      String whereClause = ' WHERE Id != null';
      if (String.isNotBlank(experienceId)) {
        experienceId = experienceId.trim();
        whereClause += ' AND Experience__c = :experienceId';
      }
      if (!personas.isEmpty()) {
        whereClause +=
          ' AND Persona_Tag__c INCLUDES (' +
          String.join(personas, ', ') +
          ')';
      }

      List<Experience_Highlight__c> records = Database.query(
        SELECT_FIELDS +
          whereClause +
          ORDER_BY +
          ' LIMIT :limitParam OFFSET :offsetParam'
      );
      Integer totalCount = Database.countQuery(
        'SELECT COUNT() FROM Experience_Highlight__c' + whereClause
      );

      ctx.paginate(totalCount, records.size());
      ctx.cache(ApiRequestContext.CachePolicy.NO_STORE);
      ctx.ok(SAPITransformer.toExperienceHighlights(records));
    } catch (Exception e) {
      ctx.error(500, 'INTERNAL_SERVER_ERROR', e.getMessage());
    }
  }

  /**
   * @description Parses the persona parameter into quoted SOQL literals taken from the
   *              PERSONAS allowlist, never from the caller's text.
   * @param raw Raw parameter value.
   * @return List<String> Quoted literals (empty when absent), or null when any value is not
   *         a known persona.
   */
  private static List<String> parsePersonas(String raw) {
    List<String> literals = new List<String>();
    if (String.isBlank(raw)) {
      return literals;
    }
    Set<String> seen = new Set<String>();
    for (String part : raw.split(',')) {
      String key = part.trim().toLowerCase();
      if (!PERSONAS.containsKey(key)) {
        return null;
      }
      if (seen.add(key)) {
        literals.add(
          '\'' + String.escapeSingleQuotes(PERSONAS.get(key)) + '\''
        );
      }
    }
    return literals;
  }

  @TestVisible
  private static Boolean throwException = false;
}
