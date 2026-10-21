/**
 * @description       : SAPI Certification-Skill junction REST resource (/certification-skills).
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/20/2026
 * @Test Class        : [SAPICertificationSkillTest]
 **/
@RestResource(urlMapping='/sapi/v1/certification-skills/*')
global with sharing class SAPICertificationSkill {
  private static final String SELECT_FIELDS = 'SELECT Id, Certification__c, Certification__r.Name, Skill__c, Skill__r.Name, Skill__r.Category__c, Skill__r.Proficiency__c FROM Certification_Skill__c';
  private static final String ORDER_BY = ' ORDER BY Skill__r.Proficiency__c DESC NULLS LAST, Skill__r.Name ASC';

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

      String whereClause = ' WHERE Id != null';
      if (String.isNotBlank(certificationId)) {
        certificationId = certificationId.trim();
        whereClause += ' AND Certification__c = :certificationId';
      }

      List<Certification_Skill__c> records = Database.query(
        SELECT_FIELDS +
          whereClause +
          ORDER_BY +
          ' LIMIT :limitParam OFFSET :offsetParam'
      );
      Integer totalCount = Database.countQuery(
        'SELECT COUNT() FROM Certification_Skill__c' + whereClause
      );

      ctx.paginate(totalCount, records.size());
      ctx.cache(ApiRequestContext.CachePolicy.PUBLIC_300);
      ctx.ok(SAPITransformer.toCertificationSkills(records));
    } catch (Exception e) {
      ctx.error(500, 'INTERNAL_SERVER_ERROR', e.getMessage());
    }
  }

  @TestVisible
  private static Boolean throwException = false;
}
