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
    RestRequest req = RestContext.request;
    RestResponse res = RestContext.response;

    try {
      addCommonHeaders(res);
      if (Test.isRunningTest() && throwException) {
        throw new CalloutException('Forced Exception');
      }

      // Query parameters
      Integer limitParam = getIntegerParam(req, 'limit', 50);
      Integer offsetParam = getIntegerParam(req, 'offset', 0);
      Boolean currentlyEmployed = getBooleanParam(req, 'currentlyEmployed');
      String employerName = req.params.get('employerName');

      // Validate parameters
      if (limitParam < 1 || limitParam > 200) {
        sendError(res, 400, 'BAD_REQUEST', 'Limit must be between 1 and 200.');
        return;
      }
      if (offsetParam < 0) {
        sendError(res, 400, 'BAD_REQUEST', 'Offset cannot be negative.');
        return;
      }

      // Build dynamic query
      String baseQuery =
        'SELECT Id, Name, Employer__c, Employer__r.Name, Position_Title__c, ' +
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

      baseQuery += ' ORDER BY Is_Current_Role__c DESC, End_Date__c DESC NULLS FIRST, Start_Date__c DESC';
      baseQuery += ' LIMIT :limitParam OFFSET :offsetParam';

      List<Experience__c> experiences = Database.query(baseQuery);

      // Pagination headers
      res.addHeader('X-Total-Count', String.valueOf(countExperiences()));
      res.addHeader(
        'X-Has-More',
        String.valueOf(experiences.size() == limitParam)
      );
      res.addHeader('Cache-Control', 'max-age=300, public');

      res.statusCode = 200;
      res.responseBody = Blob.valueOf(
        JSON.serialize(transformExperiences(experiences))
      );
    } catch (Exception e) {
      sendError(res, 500, 'INTERNAL_SERVER_ERROR', e.getMessage());
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
        'name' => exp.Position_Title__c,
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
              'name' => h.Name,
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

  private static void addCommonHeaders(RestResponse res) {
    res.addHeader('Content-Type', 'application/json');
    res.addHeader('X-Request-Id', RequestUtil.getRequestId());
    res.addHeader('X-API-Version', 'v1');
  }

  private static Integer getIntegerParam(
    RestRequest req,
    String param,
    Integer defaultVal
  ) {
    String val = req.params.get(param);
    if (String.isBlank(val))
      return defaultVal;
    try {
      return Integer.valueOf(val);
    } catch (Exception e) {
      return defaultVal;
    }
  }

  private static Boolean getBooleanParam(RestRequest req, String param) {
    String val = req.params.get(param);
    if (String.isBlank(val))
      return null;
    return Boolean.valueOf(val);
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
      'correlationId' => RequestUtil.getRequestId(),
      'retryable' => (statusCode >= 500)
    };
    res.responseBody = Blob.valueOf(JSON.serialize(error));
  }

  @TestVisible
  private static Boolean throwException = false;
}
