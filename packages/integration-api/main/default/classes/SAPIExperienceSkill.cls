/**
 * @description       : SAPI Experience-Skill junction REST resource (/experience-skills).
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/20/2026
 * @Test Class        : [SAPIExperienceSkillTest]
 **/
@RestResource(urlMapping='/sapi/v1/experience-skills/*')
global with sharing class SAPIExperienceSkill implements QueryDefinitions.Provider {
  private static final String LIST_QUERY = 'SAPIExperienceSkill_List';

  /**
   * @description GET method. Retrieves Experience_Skill__c junctions with pagination and an experienceId filter.
   */
  @HttpGet
  global static void getExperienceSkills() {
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

      Map<String, Object> binds = listBinds(experienceId?.trim());
      List<Experience_Skill__c> records = (List<Experience_Skill__c>) QueryDefinitions.runPage(
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
      ctx.cache(ApiRequestContext.CachePolicy.PUBLIC_300);
      ctx.ok(SAPITransformer.toExperienceSkills(records));
    } catch (Exception e) {
      ctx.error(500, 'INTERNAL_SERVER_ERROR', e.getMessage());
    }
  }

  /**
   * @description The list read as code: every field the response returns, the optional
   *              filters and the order. Query_Definition.SAPIExperienceSkill_List ships equal to it.
   * @return QueryDefinitions.QueryDefault The default.
   */
  @TestVisible
  private static QueryDefinitions.QueryDefault listDefault() {
    return new QueryDefinitions.QueryDefault(
        'Experience_Skill__c',
        'Id, Experience__c, Experience__r.Name, Skill__c, Skill__r.Name, ' +
        'Skill__r.Category__c, Skill__r.Proficiency__c'
      )
      .filter('(IsDeleted = :hasExperienceId OR Experience__c = :experienceId)')
      .orderBy('Skill__r.Proficiency__c DESC NULLS LAST, Skill__r.Name ASC')
      .mode(QueryDefinitions.Mode.SYSTEM_MODE)
      .binds(listBinds(null));
  }

  private static Map<String, Object> listBinds(String experienceId) {
    return new Map<String, Object>{
      'hasExperienceId' => String.isNotBlank(experienceId),
      'experienceId' => experienceId
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
