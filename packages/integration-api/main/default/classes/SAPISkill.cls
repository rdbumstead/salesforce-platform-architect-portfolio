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
      String category = req.params.get('category');

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
        'SELECT Id, Name, Category__c, Proficiency__c, Icon_Name__c ' +
        'FROM Skill__c WHERE Id != null';

      if (String.isNotBlank(category)) {
        baseQuery += ' AND Category__c = :category';
      }

      baseQuery += ' ORDER BY Proficiency__c DESC, Name ASC';
      baseQuery += ' LIMIT :limitParam OFFSET :offsetParam';

      List<Skill__c> skills = Database.query(baseQuery);

      // Pagination headers
      res.addHeader('X-Total-Count', String.valueOf(countSkills()));
      res.addHeader('X-Has-More', String.valueOf(skills.size() == limitParam));
      res.addHeader('Cache-Control', 'max-age=300, public');

      res.statusCode = 200;
      res.responseBody = Blob.valueOf(JSON.serialize(transformSkills(skills)));
    } catch (Exception e) {
      sendError(res, 500, 'INTERNAL_SERVER_ERROR', e.getMessage());
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
