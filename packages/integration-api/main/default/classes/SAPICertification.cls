/**
 * @description       : SAPI Certification REST resource (/certifications).
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/20/2026
 * @Test Class        : [SAPICertificationTest]
 **/
@RestResource(urlMapping='/sapi/v1/certifications/*')
global with sharing class SAPICertification {
  private static final String SELECT_FIELDS = 'SELECT Id, Name, Contact__c, Contact__r.Name, Issuer__c, Issuer__r.Name, Earned_Date__c FROM Certification__c';
  private static final String ORDER_BY = ' ORDER BY Earned_Date__c DESC NULLS LAST, Name ASC';

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

      String whereClause = ' WHERE Id != null';
      if (String.isNotBlank(contactName)) {
        whereClause += ' AND Contact__r.Name = :contactName';
      }
      if (String.isNotBlank(issuerName)) {
        whereClause += ' AND Issuer__r.Name = :issuerName';
      }
      if (String.isNotBlank(certificationName)) {
        whereClause += ' AND Name = :certificationName';
      }

      List<Certification__c> records = Database.query(
        SELECT_FIELDS +
          whereClause +
          ORDER_BY +
          ' LIMIT :limitParam OFFSET :offsetParam'
      );
      Integer totalCount = Database.countQuery(
        'SELECT COUNT() FROM Certification__c' + whereClause
      );

      ctx.paginate(totalCount, records.size());
      ctx.cache(ApiRequestContext.CachePolicy.PUBLIC_300);
      ctx.ok(SAPITransformer.toCertifications(records));
    } catch (Exception e) {
      ctx.error(500, 'INTERNAL_SERVER_ERROR', e.getMessage());
    }
  }

  @TestVisible
  private static Boolean throwException = false;
}
