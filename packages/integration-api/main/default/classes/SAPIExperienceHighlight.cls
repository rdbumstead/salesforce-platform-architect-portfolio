/**
 * @description       : SAPI Experience Highlight REST resource (/experience-highlights).
 *                      Supports experienceId and persona filters; persona matches the
 *                      Persona_Tag__c multi-select picklist with INCLUDES.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/20/2026
 * @Test Class        : [SAPIExperienceHighlightTest]
 **/
@RestResource(urlMapping='/sapi/v1/experience-highlights/*')
global with sharing class SAPIExperienceHighlight implements QueryDefinitions.Provider {
  private static final String LIST_QUERY = 'SAPIExperienceHighlight_List';

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
      // v2 names the filter experienceKey and takes a key only. v1 keeps experienceId.
      if (ctx.isV2() && String.isNotBlank(ctx.stringParam('experienceId'))) {
        ctx.error(400, 'BAD_REQUEST', 'Use experienceKey in v2.');
        return;
      }
      String experienceId = ctx.stringParam(
        ctx.isV2() ? 'experienceKey' : 'experienceId'
      );
      String experienceIdRef = null;
      if (String.isNotBlank(experienceId)) {
        experienceIdRef = SAPITransformer.resolveReference(
          Experience__c.SObjectType,
          experienceId,
          ctx.isV2()
        );
        if (experienceIdRef == null) {
          ctx.error(
            400,
            'BAD_REQUEST',
            ctx.isV2()
              ? 'experienceKey must be a public key.'
              : 'experienceId must be a Salesforce Id or a public key.'
          );
          return;
        }
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

      Map<String, Object> binds = listBinds(experienceIdRef, personas);
      List<Experience_Highlight__c> records = (List<Experience_Highlight__c>) QueryDefinitions.runPage(
        LIST_QUERY,
        binds,
        listDefault(),
        limitParam,
        offsetParam
      );
      Integer totalCount = QueryDefinitions.count(
        LIST_QUERY,
        binds,
        listDefault()
      );

      ctx.paginate(totalCount, records.size());
      ctx.cache(ApiRequestContext.CachePolicy.NO_STORE);
      ctx.ok(SAPITransformer.toExperienceHighlights(records));
    } catch (Exception e) {
      ctx.error(500, 'INTERNAL_SERVER_ERROR', e.getMessage());
    }
  }

  /**
   * @description Parses the persona parameter into values taken from the PERSONAS allowlist,
   *              never from the caller's text. Each one turns on its own clause in the filter.
   * @param raw Raw parameter value.
   * @return List<String> Persona values (empty when absent), or null when any value is not a
   *         known persona.
   */
  private static List<String> parsePersonas(String raw) {
    List<String> values = new List<String>();
    if (String.isBlank(raw)) {
      return values;
    }
    Set<String> seen = new Set<String>();
    for (String part : raw.split(',')) {
      String key = part.trim().toLowerCase();
      if (!PERSONAS.containsKey(key)) {
        return null;
      }
      if (seen.add(key)) {
        values.add(PERSONAS.get(key));
      }
    }
    return values;
  }

  /**
   * @description The list read as code: every field the response returns, the optional
   *              filters and the order. Query_Definition.SAPIExperienceHighlight_List ships equal to it.
   * @return QueryDefinitions.QueryDefault The default.
   */
  @TestVisible
  private static QueryDefinitions.QueryDefault listDefault() {
    return new QueryDefinitions.QueryDefault(
        'Experience_Highlight__c',
        'Id, Public_Key__c, Name, Experience__c, Experience__r.Name, ' +
          'Experience__r.Public_Key__c, Description__c, Sort_Order__c, ' +
          'Persona_Tag__c'
      )
      .filter(
        '(IsDeleted = :hasExperienceId OR Experience__c = :experienceId) AND ' +
          '(IsDeleted = :hasPersonas OR ' +
          '(IsDeleted = :adminOff AND Persona_Tag__c INCLUDES (\'Admin\')) OR ' +
          '(IsDeleted = :developerOff AND ' +
          'Persona_Tag__c INCLUDES (\'Developer\')) OR ' +
          '(IsDeleted = :architectOff AND ' +
          'Persona_Tag__c INCLUDES (\'Architect\')))'
      )
      .orderBy('Sort_Order__c ASC, Name ASC')
      .mode(QueryDefinitions.Mode.SYSTEM_MODE)
      .binds(listBinds(null, null));
  }

  // A bind inside INCLUDES matches no row, so each persona is a literal in the filter with
  // its own switch. A persona the request did not ask for binds its switch to true, which
  // turns its clause off. No persona at all binds hasPersonas to false, which matches all.
  private static Map<String, Object> listBinds(
    String experienceId,
    List<String> personas
  ) {
    Set<String> chosen = personas == null
      ? new Set<String>()
      : new Set<String>(personas);
    return new Map<String, Object>{
      'hasExperienceId' => String.isNotBlank(experienceId),
      'experienceId' => experienceId,
      'hasPersonas' => !chosen.isEmpty(),
      'adminOff' => !chosen.contains('Admin'),
      'developerOff' => !chosen.contains('Developer'),
      'architectOff' => !chosen.contains('Architect')
    };
  }

  /**
   * @description The code defaults this class owns, for QueryDefinitions.validateAll().
   * @return Map<String, QueryDefinitions.QueryDefault> The defaults by record name.
   */
  public Map<String, QueryDefinitions.QueryDefault> queryDefaults() {
    return new Map<String, QueryDefinitions.QueryDefault>{
      LIST_QUERY => listDefault()
    };
  }

  @TestVisible
  private static Boolean throwException = false;
}
