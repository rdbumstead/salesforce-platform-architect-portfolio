/**
 * @description       : SAPI Resume metadata REST resource.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 12/05/2025
 * @Test Class        : [SAPIResumeTest]
 **/
@RestResource(urlMapping='/sapi/v1/resume/*')
global with sharing class SAPIResume {
  /**
   * @description GET method to retrieve resume highlights filtered by persona.
   */
  @HttpGet
  global static void getResumeData() {
    ApiRequestContext ctx = ApiRequestContext.begin();
    if (ctx.isRejected()) {
      return;
    }

    try {
      if (Test.isRunningTest() && throwException) {
        throw new CalloutException('Forced Exception');
      }

      // Query parameters
      String persona = ctx.stringParam('persona');

      // Validate persona if provided
      Set<String> validPersonas = new Set<String>{
        'Admin',
        'Developer',
        'Architect'
      };
      if (String.isNotEmpty(persona) && !validPersonas.contains(persona)) {
        ctx.error(
          400,
          'BAD_REQUEST',
          'Invalid persona. Valid values: Admin, Developer, Architect'
        );
        return;
      }

      // Fetch Highlights - filter by persona if provided, else return all
      List<Experience_Highlight__c> highlights;
      if (String.isNotEmpty(persona)) {
        highlights = [
          SELECT
            Id,
            Name,
            Description__c,
            Persona_Tag__c,
            Sort_Order__c,
            Experience__c,
            Experience__r.Name,
            Experience__r.Employer__r.Name,
            Experience__r.Start_Date__c,
            Experience__r.End_Date__c
          FROM Experience_Highlight__c
          WHERE Persona_Tag__c INCLUDES (:persona)
          ORDER BY Experience__r.Start_Date__c DESC, Sort_Order__c ASC
          LIMIT 100
        ];
      } else {
        highlights = [
          SELECT
            Id,
            Name,
            Description__c,
            Persona_Tag__c,
            Sort_Order__c,
            Experience__c,
            Experience__r.Name,
            Experience__r.Employer__r.Name,
            Experience__r.Start_Date__c,
            Experience__r.End_Date__c
          FROM Experience_Highlight__c
          ORDER BY Experience__r.Start_Date__c DESC, Sort_Order__c ASC
          LIMIT 100
        ];
      }

      Map<String, Object> response = new Map<String, Object>{
        'persona' => persona,
        'totalHighlights' => highlights.size(),
        'highlights' => transformHighlights(highlights)
      };

      ctx.cache(ApiRequestContext.CachePolicy.PRIVATE_300);
      ctx.ok(response);
    } catch (Exception e) {
      ctx.error(500, 'INTERNAL_SERVER_ERROR', e.getMessage());
    }
  }

  /**
   * @description Transforms Experience_Highlight__c records to API response format.
   */
  private static List<Map<String, Object>> transformHighlights(
    List<Experience_Highlight__c> highlights
  ) {
    List<Map<String, Object>> result = new List<Map<String, Object>>();
    for (Experience_Highlight__c h : highlights) {
      result.add(
        new Map<String, Object>{
          'id' => h.Id,
          'name' => h.Name,
          'description' => h.Description__c,
          'personaTag' => h.Persona_Tag__c,
          'sortOrder' => h.Sort_Order__c,
          'experienceId' => h.Experience__c,
          'experienceName' => h.Experience__r?.Name,
          'employerName' => h.Experience__r?.Employer__r?.Name,
          'role' => h.Experience__r?.Name,
          'startDate' => h.Experience__r?.Start_Date__c != null
            ? String.valueOf(h.Experience__r.Start_Date__c)
            : null,
          'endDate' => h.Experience__r?.End_Date__c != null
            ? String.valueOf(h.Experience__r.End_Date__c)
            : null
        }
      );
    }
    return result;
  }

  @TestVisible
  private static Boolean throwException = false;
}
