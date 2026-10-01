/**
 * @description       : SAPI Experience REST resource for portfolio data.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 12/05/2025
 * @Test Class        : [SAPIExperienceTest]
 **/
@RestResource(urlMapping='/sapi/v1/experience/*')
global with sharing class SAPIExperience {
  /**
   * @description GET method to retrieve Experience records with pagination.
   */
  @HttpGet
  global static void getExperiences() {
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
      Boolean currentlyEmployed = ctx.boolParam('currentlyEmployed');
      String employerName = ctx.stringParam('employerName');

      // Build dynamic query
      String baseQuery =
        'SELECT Id, Name, Employer__c, Employer__r.Name, ' +
        'Start_Date__c, End_Date__c, Is_Current_Role__c, Is_Remote__c, Sort_Order__c, ' +
        'Contact__c, Contact__r.Name, ' +
        '(SELECT Id, Name, Description__c, Persona_Tag__c, Sort_Order__c FROM Experience_Highlights__r ORDER BY Sort_Order__c ASC) ' +
        'FROM Experience__c WHERE Id != null';

      if (currentlyEmployed != null) {
        baseQuery += ' AND Is_Current_Role__c = :currentlyEmployed';
      }
      if (String.isNotBlank(employerName)) {
        baseQuery += ' AND Employer__r.Name LIKE :employerName';
      }

      // Sort by Is_Current_Role__c desc, then by Sort_Order__c, or Date
      baseQuery += ' ORDER BY Is_Current_Role__c DESC, Sort_Order__c ASC, End_Date__c DESC NULLS FIRST, Start_Date__c DESC';
      baseQuery += ' LIMIT :limitParam OFFSET :offsetParam';

      List<Experience__c> experiences = Database.query(baseQuery);

      ctx.paginate(countExperiences(), experiences.size());
      ctx.cache(ApiRequestContext.CachePolicy.NO_STORE);
      ctx.ok(transformExperiences(experiences));
    } catch (Exception e) {
      ctx.error(500, 'INTERNAL_SERVER_ERROR', e.getMessage());
    }
  }

  /**
   * @description Transforms Experience__c records to API response format.
   */
  private static List<Map<String, Object>> transformExperiences(
    List<Experience__c> experiences
  ) {
    List<Map<String, Object>> result = new List<Map<String, Object>>();
    for (Experience__c exp : experiences) {
      Map<String, Object> item = new Map<String, Object>{
        'id' => exp.Id,
        'name' => exp.Name, // UPDATED: Mapped standard Name field
        'employerId' => exp.Employer__c,
        'employerName' => exp.Employer__r?.Name,
        'startDate' => exp.Start_Date__c != null
          ? String.valueOf(exp.Start_Date__c)
          : null,
        'endDate' => exp.End_Date__c != null
          ? String.valueOf(exp.End_Date__c)
          : null,
        'isCurrentRole' => exp.Is_Current_Role__c,
        'isRemote' => exp.Is_Remote__c,
        'sortOrder' => exp.Sort_Order__c,
        'contactId' => exp.Contact__c,
        'contactName' => exp.Contact__r?.Name
      };

      // Transform highlights
      if (
        exp.Experience_Highlights__r != null &&
        !exp.Experience_Highlights__r.isEmpty()
      ) {
        List<Map<String, Object>> highlights = new List<Map<String, Object>>();
        for (Experience_Highlight__c h : exp.Experience_Highlights__r) {
          highlights.add(
            new Map<String, Object>{
              'id' => h.Id,
              'name' => h.Name, // Highlights use Name (auto-number) or custom
              'description' => h.Description__c,
              'personaTag' => h.Persona_Tag__c,
              'sortOrder' => h.Sort_Order__c
            }
          );
        }
        item.put('highlights', highlights);
      }

      result.add(item);
    }
    return result;
  }

  private static Integer countExperiences() {
    return [SELECT COUNT() FROM Experience__c];
  }

  @TestVisible
  private static Boolean throwException = false;
}
