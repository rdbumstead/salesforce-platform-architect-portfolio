/**
 * @description       : SAPI Testimonial REST resource for portfolio data.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 12/05/2025
 * @Test Class        : [SAPI_TestimonialTest]
 **/
@RestResource(urlMapping='/sapi/v1/testimonials/*')
global with sharing class SAPI_Testimonial {
  /**
   * @description GET method to retrieve approved Testimonial records.
   *              Implements pagination and proper error handling per spec.
   */
  @HttpGet
  global static void getTestimonials() {
    RestRequest req = RestContext.request;
    RestResponse res = RestContext.response;

    try {
      addCommonHeaders(res);

      // Query parameters
      Integer limitParam = getIntegerParam(req, 'limit', 50);
      Integer offsetParam = getIntegerParam(req, 'offset', 0);
      String vibeMode = req.params != null ? req.params.get('vibeMode') : null;
      String relationshipType = req.params != null
        ? req.params.get('relationshipType')
        : null;

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
        'SELECT Id, Name, Author_Name__c, Author_Title__c, ' +
        'Relationship_Type__c, Vibe_Mode__c, Context__c ' +
        'FROM Testimonial__c WHERE Approved__c = true';

      if (String.isNotBlank(vibeMode)) {
        baseQuery += ' AND Vibe_Mode__c = :vibeMode';
      }
      if (String.isNotBlank(relationshipType)) {
        baseQuery += ' AND Relationship_Type__c = :relationshipType';
      }

      baseQuery += ' ORDER BY CreatedDate DESC';
      baseQuery += ' LIMIT :limitParam OFFSET :offsetParam';

      List<Testimonial__c> testimonials = Database.query(baseQuery);

      // Pagination headers
      res.addHeader('X-Total-Count', String.valueOf(countTestimonials()));
      res.addHeader(
        'X-Has-More',
        String.valueOf(testimonials.size() == limitParam)
      );
      res.addHeader('Cache-Control', 'max-age=300, public');

      res.statusCode = 200;
      res.responseBody = Blob.valueOf(
        JSON.serialize(transformTestimonials(testimonials))
      );
    } catch (Exception e) {
      sendError(res, 500, 'INTERNAL_SERVER_ERROR', e.getMessage());
    }
  }

  /**
   * @description Transforms Testimonial__c records to API response format.
   */
  private static List<Map<String, Object>> transformTestimonials(
    List<Testimonial__c> testimonials
  ) {
    List<Map<String, Object>> result = new List<Map<String, Object>>();
    for (Testimonial__c t : testimonials) {
      Map<String, Object> item = new Map<String, Object>{
        'id' => t.Id,
        'name' => t.Name,
        'authorName' => t.Author_Name__c,
        'authorTitle' => t.Author_Title__c,
        'relationshipType' => t.Relationship_Type__c,
        'vibeMode' => t.Vibe_Mode__c,
        'context' => t.Context__c
      };
      result.add(item);
    }
    return result;
  }

  private static Integer countTestimonials() {
    return [
      SELECT COUNT()
      FROM Testimonial__c
      WHERE Approved__c = TRUE
    ];
  }

  private static void addCommonHeaders(RestResponse res) {
    res.addHeader('Content-Type', 'application/json');
    res.addHeader('X-Request-Id', Request.getCurrent().getRequestId());
    res.addHeader('X-API-Version', 'v1');
  }

  private static Integer getIntegerParam(
    RestRequest req,
    String param,
    Integer defaultVal
  ) {
    if (req.params == null)
      return defaultVal;
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
      'correlationId' => Request.getCurrent().getRequestId(),
      'retryable' => (statusCode >= 500)
    };
    res.responseBody = Blob.valueOf(JSON.serialize(error));
  }
}
