/**
 * @description       : PAPI curated testimonial feed (/papi/v1/testimonials/feed) with "Vibe
 *                      Control": mode=professional (default) returns approved testimonials
 *                      from a Manager, Client or Peer with the Professional vibe; mode=casual
 *                      returns every approved testimonial. Unapproved records never appear.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/20/2026
 * @Test Class        : [PAPITestimonialFeedTest]
 **/
@RestResource(urlMapping='/papi/v1/testimonials/feed')
global with sharing class PAPITestimonialFeed implements QueryDefinitions.Provider {
  public static final String MODE_PROFESSIONAL = 'professional';
  public static final String MODE_CASUAL = 'casual';

  private static final String VIBE_PROFESSIONAL = 'Professional';
  private static final Set<String> PROFESSIONAL_RELATIONSHIPS = new Set<String>{
    'Manager',
    'Client',
    'Peer'
  };
  private static final Integer MAX_ROWS = 200;
  private static final String CASUAL_QUERY = 'PAPITestimonialFeed_Casual';
  private static final String PROFESSIONAL_QUERY = 'PAPITestimonialFeed_Professional';
  private static final String TESTIMONIAL_OBJECT = 'Testimonial__c';
  private static final String FEED_FIELDS = 'Id, Public_Key__c, Author_Name__c, Author_Title__c, Relationship_Type__c, Context__c, Vibe_Mode__c, Avatar_URL__c';
  private static final String FEED_ORDER = 'Sort_Order__c ASC NULLS LAST, CreatedDate DESC';

  /**
   * @description GET handler. Rejects an unknown mode with 400; answers with an array of
   *              EnrichedTestimonial, X-Total-Count and max-age=60, private.
   */
  @HttpGet
  global static void getFeed() {
    ApiRequestContext ctx = ApiRequestContext.begin();
    if (ctx.isRejected()) {
      return;
    }

    try {
      if (Test.isRunningTest() && throwException) {
        throw new CalloutException('Forced Exception');
      }

      String mode = resolveMode(ctx.stringParam('mode'));
      if (mode == null) {
        ctx.error(
          400,
          'BAD_REQUEST',
          'Invalid mode. Valid values: professional, casual'
        );
        return;
      }

      List<Map<String, Object>> feed = new List<Map<String, Object>>();
      for (Testimonial__c t : queryApproved(mode)) {
        feed.add(PAPITransformer.transformTestimonial(t));
      }

      ctx.header('X-Total-Count', String.valueOf(feed.size()));
      ctx.cache(ApiRequestContext.CachePolicy.PRIVATE_60);
      ctx.ok(feed);
    } catch (Exception e) {
      ctx.error(500, 'INTERNAL_SERVER_ERROR', e.getMessage());
    }
  }

  /**
   * @description Normalises the mode parameter. Blank means professional; matching is
   *              case-insensitive, so the VibeMode values Professional and Casual are accepted.
   * @param raw The raw query parameter.
   * @return String "professional", "casual", or null when the value is not recognised.
   */
  @TestVisible
  private static String resolveMode(String raw) {
    if (String.isBlank(raw)) {
      return MODE_PROFESSIONAL;
    }
    String value = raw.trim().toLowerCase();
    if (value == MODE_PROFESSIONAL || value == MODE_CASUAL) {
      return value;
    }
    return null;
  }

  private static List<Testimonial__c> queryApproved(String mode) {
    if (mode == MODE_CASUAL) {
      return (List<Testimonial__c>) QueryDefinitions.run(
        CASUAL_QUERY,
        new Map<String, Object>(),
        casualDefault()
      );
    }
    return (List<Testimonial__c>) QueryDefinitions.run(
      PROFESSIONAL_QUERY,
      professionalBinds(),
      professionalDefault()
    );
  }

  /**
   * @description The casual feed read as code: every approved testimonial.
   *              Query_Definition.PAPITestimonialFeed_Casual ships equal to it.
   * @return QueryDefinitions.QueryDefault The default.
   */
  @TestVisible
  private static QueryDefinitions.QueryDefault casualDefault() {
    return new QueryDefinitions.QueryDefault(TESTIMONIAL_OBJECT, FEED_FIELDS)
      .filter('Approved__c = TRUE')
      .orderBy(FEED_ORDER)
      .rowLimit(MAX_ROWS)
      .mode(QueryDefinitions.Mode.SYSTEM_MODE);
  }

  /**
   * @description The professional feed read as code: approved testimonials with the
   *              Professional vibe from a Manager, Client or Peer.
   *              Query_Definition.PAPITestimonialFeed_Professional ships equal to it.
   * @return QueryDefinitions.QueryDefault The default.
   */
  @TestVisible
  private static QueryDefinitions.QueryDefault professionalDefault() {
    return new QueryDefinitions.QueryDefault(TESTIMONIAL_OBJECT, FEED_FIELDS)
      .filter(
        'Approved__c = TRUE AND Vibe_Mode__c = :vibeProfessional ' +
        'AND Relationship_Type__c IN :professionalRelationships'
      )
      .orderBy(FEED_ORDER)
      .rowLimit(MAX_ROWS)
      .mode(QueryDefinitions.Mode.SYSTEM_MODE)
      .binds(professionalBinds());
  }

  private static Map<String, Object> professionalBinds() {
    return new Map<String, Object>{
      'vibeProfessional' => VIBE_PROFESSIONAL,
      'professionalRelationships' => PROFESSIONAL_RELATIONSHIPS
    };
  }

  /**
   * @description The code defaults this class owns, for QueryDefinitions.validateAll().
   * @return Map<String, QueryDefinitions.QueryDefault> The defaults by record name.
   */
  public Map<String, QueryDefinitions.QueryDefault> queryDefaults() {
    return new Map<String, QueryDefinitions.QueryDefault>{
      CASUAL_QUERY => casualDefault(),
      PROFESSIONAL_QUERY => professionalDefault()
    };
  }

  @TestVisible
  private static Boolean throwException = false;
}
