/**
 * @description       : SAPI Skill REST resource for portfolio data.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 12/05/2025
 * @Test Class        : [SAPISkillTest]
 **/
@RestResource(urlMapping='/sapi/v1/skills/*')
global with sharing class SAPISkill {
  /**
   * @description GET method to retrieve Skill records with pagination and filtering.
   */
  @HttpGet
  global static void getSkills() {
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
      String category = ctx.stringParam('category');

      // Build dynamic query
      String baseQuery =
        'SELECT Id, Name, Category__c, Proficiency__c, Icon_Name__c ' +
        'FROM Skill__c WHERE Id != null';

      if (String.isNotBlank(category)) {
        baseQuery += ' AND Category__c = :category';
      }

      baseQuery += ' ORDER BY Proficiency__c DESC, Name ASC';
      baseQuery += ' LIMIT :limitParam OFFSET :offsetParam';

      List<Skill__c> skills = Database.query(baseQuery);

      ctx.paginate(countSkills(), skills.size());
      ctx.cache(ApiRequestContext.CachePolicy.PUBLIC_300);
      ctx.ok(transformSkills(skills));
    } catch (Exception e) {
      ctx.error(500, 'INTERNAL_SERVER_ERROR', e.getMessage());
    }
  }

  /**
   * @description Transforms Skill__c records to API response format.
   */
  private static List<Map<String, Object>> transformSkills(
    List<Skill__c> skills
  ) {
    List<Map<String, Object>> result = new List<Map<String, Object>>();
    for (Skill__c s : skills) {
      result.add(
        new Map<String, Object>{
          'id' => s.Id,
          'name' => s.Name,
          'category' => s.Category__c,
          'proficiencyScore' => s.Proficiency__c,
          'iconName' => s.Icon_Name__c
        }
      );
    }
    return result;
  }

  private static Integer countSkills() {
    return [SELECT COUNT() FROM Skill__c];
  }

  @TestVisible
  private static Boolean throwException = false;
}
