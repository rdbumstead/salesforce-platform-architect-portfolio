/**
 * @description       : SAPI Experience-Skill junction REST resource (/experience-skills).
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/20/2026
 * @Test Class        : [SAPIExperienceSkillTest]
 **/
@RestResource(urlMapping='/sapi/v1/experience-skills/*')
global with sharing class SAPIExperienceSkill {
  private static final String SELECT_FIELDS = 'SELECT Id, Experience__c, Experience__r.Name, Skill__c, Skill__r.Name, Skill__r.Category__c, Skill__r.Proficiency__c FROM Experience_Skill__c';
  private static final String ORDER_BY = ' ORDER BY Skill__r.Proficiency__c DESC NULLS LAST, Skill__r.Name ASC';

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

      String whereClause = ' WHERE Id != null';
      if (String.isNotBlank(experienceId)) {
        experienceId = experienceId.trim();
        whereClause += ' AND Experience__c = :experienceId';
      }

      List<Experience_Skill__c> records = Database.query(
        SELECT_FIELDS +
          whereClause +
          ORDER_BY +
          ' LIMIT :limitParam OFFSET :offsetParam'
      );
      Integer totalCount = Database.countQuery(
        'SELECT COUNT() FROM Experience_Skill__c' + whereClause
      );

      ctx.paginate(totalCount, records.size());
      ctx.cache(ApiRequestContext.CachePolicy.PUBLIC_300);
      ctx.ok(SAPITransformer.toExperienceSkills(records));
    } catch (Exception e) {
      ctx.error(500, 'INTERNAL_SERVER_ERROR', e.getMessage());
    }
  }

  @TestVisible
  private static Boolean throwException = false;
}
