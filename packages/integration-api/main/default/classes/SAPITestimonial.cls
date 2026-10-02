/**
 * @description       : SAPI Testimonial REST resource for portfolio data.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 12/05/2025
 * @Test Class        : [SAPITestimonialTest]
 **/
@RestResource(urlMapping='/sapi/v1/testimonials/*')
global with sharing class SAPITestimonial {
  /**
   * @description GET method to retrieve approved Testimonial records.
   *              Implements pagination and proper error handling per spec.
   */
  @HttpGet
  global static void getTestimonials() {
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
      String vibeMode = ctx.stringParam('vibeMode');
      String relationshipType = ctx.stringParam('relationshipType');

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

      ctx.paginate(countTestimonials(), testimonials.size());
      ctx.cache(ApiRequestContext.CachePolicy.NO_STORE);
      ctx.ok(transformTestimonials(testimonials));
    } catch (Exception e) {
      ctx.error(500, 'INTERNAL_SERVER_ERROR', e.getMessage());
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

  @TestVisible
  private static Boolean throwException = false;
}
