/**
 * @description       : SAPI Certification-Skill junction REST resource (/certification-skills).
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/20/2026
 * @Test Class        : [SAPICertificationSkillTest]
 **/
@RestResource(urlMapping='/sapi/v1/certification-skills/*')
global with sharing class SAPICertificationSkill implements QueryDefinitions.Provider {
  private static final String LIST_QUERY = 'SAPICertificationSkill_List';

  /**
   * @description GET method. Retrieves Certification_Skill__c junctions with pagination and a certificationId filter.
   */
  @HttpGet
  global static void getCertificationSkills() {
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
      String certificationId = ctx.stringParam('certificationId');
      if (
        String.isNotBlank(certificationId) &&
        !SAPITransformer.isSalesforceId(certificationId)
      ) {
        ctx.error(
          400,
          'BAD_REQUEST',
          'certificationId must be a Salesforce Id.'
        );
        return;
      }

      Map<String, Object> binds = listBinds(certificationId?.trim());
      List<Certification_Skill__c> records = (List<Certification_Skill__c>) QueryDefinitions.runPage(
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
      ctx.ok(SAPITransformer.toCertificationSkills(records));
    } catch (Exception e) {
      ctx.error(500, 'INTERNAL_SERVER_ERROR', e.getMessage());
    }
  }

  /**
   * @description The list read as code: every field the response returns, the optional
   *              filters and the order. Query_Definition.SAPICertificationSkill_List ships equal to it.
   * @return QueryDefinitions.QueryDefault The default.
   */
  @TestVisible
  private static QueryDefinitions.QueryDefault listDefault() {
    return new QueryDefinitions.QueryDefault(
        'Certification_Skill__c',
        'Id, Certification__c, Certification__r.Name, Skill__c, Skill__r.Name, ' +
        'Skill__r.Category__c, Skill__r.Proficiency__c'
      )
      .filter(
        '(IsDeleted = :hasCertificationId OR ' +
        'Certification__c = :certificationId)'
      )
      .orderBy('Skill__r.Proficiency__c DESC NULLS LAST, Skill__r.Name ASC')
      .mode(QueryDefinitions.Mode.SYSTEM_MODE)
      .binds(listBinds(null));
  }

  private static Map<String, Object> listBinds(String certificationId) {
    return new Map<String, Object>{
      'hasCertificationId' => String.isNotBlank(certificationId),
      'certificationId' => certificationId
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
