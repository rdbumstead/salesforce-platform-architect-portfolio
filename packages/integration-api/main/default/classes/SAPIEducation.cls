/**
 * @description       : SAPI Education REST resource (/education).
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/20/2026
 * @Test Class        : [SAPIEducationTest]
 **/
@RestResource(urlMapping='/sapi/v1/education/*')
global with sharing class SAPIEducation implements QueryDefinitions.Provider {
  private static final String LIST_QUERY = 'SAPIEducation_List';

  /**
   * @description GET method. Retrieves Education__c records with pagination and contactName and issuerName filters.
   */
  @HttpGet
  global static void getEducation() {
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
      String contactName = ctx.stringParam('contactName');
      String issuerName = ctx.stringParam('issuerName');

      Map<String, Object> binds = listBinds(contactName, issuerName);
      List<Education__c> records = (List<Education__c>) QueryDefinitions.runPage(
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
      ctx.ok(SAPITransformer.toEducation(records));
    } catch (Exception e) {
      ctx.error(500, 'INTERNAL_SERVER_ERROR', e.getMessage());
    }
  }

  /**
   * @description The list read as code: every field the response returns, the optional
   *              filters and the order. Query_Definition.SAPIEducation_List ships equal to it.
   * @return QueryDefinitions.QueryDefault The default.
   */
  @TestVisible
  private static QueryDefinitions.QueryDefault listDefault() {
    return new QueryDefinitions.QueryDefault(
        'Education__c',
        'Id, Name, Contact__c, Contact__r.Name, Issuer__c, Issuer__r.Name, ' +
        'Field_of_Study__c, Graduation_Date__c, GPA__c'
      )
      .filter(
        '(IsDeleted = :hasContactName OR Contact__r.Name = :contactName) AND ' +
        '(IsDeleted = :hasIssuerName OR Issuer__r.Name = :issuerName)'
      )
      .orderBy('Graduation_Date__c DESC NULLS LAST, Name ASC')
      .mode(QueryDefinitions.Mode.SYSTEM_MODE)
      .binds(listBinds(null, null));
  }

  private static Map<String, Object> listBinds(
    String contactName,
    String issuerName
  ) {
    return new Map<String, Object>{
      'hasContactName' => String.isNotBlank(contactName),
      'contactName' => contactName,
      'hasIssuerName' => String.isNotBlank(issuerName),
      'issuerName' => issuerName
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
