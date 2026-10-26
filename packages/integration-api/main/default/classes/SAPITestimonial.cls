/**
 * @description       : SAPI Testimonial REST resource for portfolio data.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 12/05/2025
 * @Test Class        : [SAPITestimonialTest]
 **/
@RestResource(urlMapping='/sapi/v1/testimonials/*')
global with sharing class SAPITestimonial implements QueryDefinitions.Provider {
  private static final String LIST_QUERY = 'SAPITestimonial_List';

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

      List<Testimonial__c> testimonials = (List<Testimonial__c>) QueryDefinitions.runPage(
        LIST_QUERY,
        listBinds(vibeMode, relationshipType),
        listDefault(),
        limitParam,
        offsetParam
      );
      // The total counts the approved testimonials the request's filters match.
      Integer totalCount = QueryDefinitions.count(
        LIST_QUERY,
        listBinds(vibeMode, relationshipType),
        listDefault()
      );

      ctx.paginate(totalCount, testimonials.size());
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

  /**
   * @description The list read as code: every field the response returns, the optional
   *              filters and the order. Query_Definition.SAPITestimonial_List ships equal to it.
   * @return QueryDefinitions.QueryDefault The default.
   */
  @TestVisible
  private static QueryDefinitions.QueryDefault listDefault() {
    return new QueryDefinitions.QueryDefault(
        'Testimonial__c',
        'Id, Name, Author_Name__c, Author_Title__c, Relationship_Type__c, ' +
        'Vibe_Mode__c, Context__c'
      )
      .filter(
        'Approved__c = true AND ' +
          '(IsDeleted = :hasVibeMode OR Vibe_Mode__c = :vibeMode) AND ' +
          '(IsDeleted = :hasRelationshipType OR ' +
          'Relationship_Type__c = :relationshipType)'
      )
      .orderBy('CreatedDate DESC')
      .mode(QueryDefinitions.Mode.SYSTEM_MODE)
      .binds(listBinds(null, null));
  }

  private static Map<String, Object> listBinds(
    String vibeMode,
    String relationshipType
  ) {
    return new Map<String, Object>{
      'hasVibeMode' => String.isNotBlank(vibeMode),
      'vibeMode' => vibeMode,
      'hasRelationshipType' => String.isNotBlank(relationshipType),
      'relationshipType' => relationshipType
    };
  }

  /**
   * @description The code defaults this class owns, for QueryDefinitions.validateAll().
   * @return Map<String, QueryDefinitions.QueryDefault> The defaults by record name.
   */
  public Map<String, QueryDefinitions.QueryDefault> queryDefaults() {
    return new Map<String, QueryDefinitions.QueryDefault>{
      LIST_QUERY => listDefault()
    };
  }

  @TestVisible
  private static Boolean throwException = false;
}
