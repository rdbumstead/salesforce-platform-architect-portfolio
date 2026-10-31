/**
 * @description       : SAPI Certification REST resource (/certifications).
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/20/2026
 * @Test Class        : [SAPICertificationTest]
 **/
// The old /v1/ spelling is kept as an alias until the path sunset (ADR-040). SAPIRouter serves the versionless URL.
@RestResource(urlMapping='/sapi/v1/certifications/*')
global with sharing class SAPICertification implements QueryDefinitions.Provider {
  private static final String LIST_QUERY = 'SAPICertification_List';

  /**
   * @description GET method. Retrieves Certification__c records with pagination and contactName, issuerName and certificationName filters.
   */
  @HttpGet
  global static void getCertifications() {
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
      String certificationName = ctx.stringParam('certificationName');

      Map<String, Object> binds = listBinds(
        contactName,
        issuerName,
        certificationName
      );
      List<Certification__c> records = (List<Certification__c>) QueryDefinitions.runPage(
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
      ctx.ok(SAPITransformer.toCertifications(records));
    } catch (Exception e) {
      ctx.error(500, 'INTERNAL_SERVER_ERROR', e.getMessage());
    }
  }

  /**
   * @description The list read as code: every field the response returns, the optional
   *              filters and the order. Query_Definition.SAPICertification_List ships equal to it.
   * @return QueryDefinitions.QueryDefault The default.
   */
  @TestVisible
  private static QueryDefinitions.QueryDefault listDefault() {
    return new QueryDefinitions.QueryDefault(
        'Certification__c',
        'Id, Public_Key__c, Name, Contact__c, Contact__r.Name, ' +
          'Contact__r.Public_Key__c, Issuer__c, Issuer__r.Name, ' +
          'Issuer__r.Public_Key__c, Earned_Date__c'
      )
      .filter(
        '(IsDeleted = :hasContactName OR Contact__r.Name = :contactName) AND ' +
          '(IsDeleted = :hasIssuerName OR Issuer__r.Name = :issuerName) AND ' +
          '(IsDeleted = :hasCertificationName OR Name = :certificationName)'
      )
      .orderBy('Earned_Date__c DESC NULLS LAST, Name ASC')
      .mode(QueryDefinitions.Mode.SYSTEM_MODE)
      .binds(listBinds(null, null, null));
  }

  private static Map<String, Object> listBinds(
    String contactName,
    String issuerName,
    String certificationName
  ) {
    return new Map<String, Object>{
      'hasContactName' => String.isNotBlank(contactName),
      'contactName' => contactName,
      'hasIssuerName' => String.isNotBlank(issuerName),
      'issuerName' => issuerName,
      'hasCertificationName' => String.isNotBlank(certificationName),
      'certificationName' => certificationName
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
