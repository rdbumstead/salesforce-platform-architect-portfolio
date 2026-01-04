/**
 * @description       : SAPI Resume metadata REST resource.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 12/05/2025
 * @Test Class        : [SAPI_ResumeTest]
 **/
@RestResource(urlMapping='/sapi/v1/resume/*')
global with sharing class SAPI_Resume {
  /**
   * @description GET method to retrieve resume highlights filtered by persona.
   */
  @HttpGet
  global static void getResumeData() {
    RestRequest req = RestContext.request;
    RestResponse res = RestContext.response;

    try {
      addCommonHeaders(res);

      // Query parameters
      String persona = req.params.get('persona');
      if (String.isEmpty(persona)) {
        persona = 'General';
      }

      // Validate persona
      Set<String> validPersonas = new Set<String>{
        'Admin',
        'Developer',
        'Architect',
        'General'
      };
      if (!validPersonas.contains(persona)) {
        sendError(
          res,
          400,
          'BAD_REQUEST',
          'Invalid persona. Valid values: Admin, Developer, Architect, General'
        );
        return;
      }

      // Fetch Highlights filtered by Persona
      List<Experience_Highlight__c> highlights = [
        SELECT
          Id,
          Name,
          Description__c,
          Persona_Tag__c,
          Sort_Order__c,
          Experience__c,
          Experience__r.Name,
          Experience__r.Employer__r.Name,
          Experience__r.Position_Title__c,
          Experience__r.Start_Date__c,
          Experience__r.End_Date__c
        FROM Experience_Highlight__c
        WHERE Persona_Tag__c IN (:persona, 'General')
        WITH USER_MODE
        ORDER BY Experience__r.Start_Date__c DESC, Sort_Order__c ASC
        LIMIT 100
      ];

      res.addHeader('Cache-Control', 'max-age=300, private');
      res.statusCode = 200;

      Map<String, Object> response = new Map<String, Object>{
        'persona' => persona,
        'totalHighlights' => highlights.size(),
        'highlights' => transformHighlights(highlights)
      };

      res.responseBody = Blob.valueOf(JSON.serialize(response));
    } catch (Exception e) {
      sendError(res, 500, 'INTERNAL_SERVER_ERROR', e.getMessage());
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
          'role' => h.Experience__r?.Position_Title__c,
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

  private static void addCommonHeaders(RestResponse res) {
    res.addHeader('Content-Type', 'application/json');
    res.addHeader('X-Request-Id', Request.getCurrent().getRequestId());
    res.addHeader('X-API-Version', 'v1');
  }

  private static void sendError(
    RestResponse res,
    Integer statusCode,
    String errorCode,
    String message
  ) {
    res.statusCode = statusCode;
    Map<String, Object> error = new Map<String, Object>{
      'httpStatus' => statusCode,
      'errorCode' => errorCode,
      'message' => message,
      'correlationId' => Request.getCurrent().getRequestId(),
      'retryable' => (statusCode >= 500)
    };
    res.responseBody = Blob.valueOf(JSON.serialize(error));
  }
}
