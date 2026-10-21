/**
 * @description       : PAPI curated testimonial feed (/papi/v1/testimonials/feed) with "Vibe
 *                      Control": mode=professional (default) returns approved testimonials
 *                      from a Manager, Client or Peer with the Professional vibe; mode=casual
 *                      returns every approved testimonial. Unapproved records never appear.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/20/2026
 * @Test Class        : [PAPITestimonialFeedTest]
 **/
@RestResource(urlMapping='/papi/v1/testimonials/feed')
global with sharing class PAPITestimonialFeed {
  public static final String MODE_PROFESSIONAL = 'professional';
  public static final String MODE_CASUAL = 'casual';

  private static final String VIBE_PROFESSIONAL = 'Professional';
  private static final Set<String> PROFESSIONAL_RELATIONSHIPS = new Set<String>{
    'Manager',
    'Client',
    'Peer'
  };
  private static final Integer MAX_ROWS = 200;

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
      return [
        SELECT
          Id,
          Author_Name__c,
          Author_Title__c,
          Relationship_Type__c,
          Context__c,
          Vibe_Mode__c,
          Avatar_URL__c
        FROM Testimonial__c
        WHERE Approved__c = TRUE
        ORDER BY Sort_Order__c ASC NULLS LAST, CreatedDate DESC
        LIMIT :MAX_ROWS
      ];
    }
    return [
      SELECT
        Id,
        Author_Name__c,
        Author_Title__c,
        Relationship_Type__c,
        Context__c,
        Vibe_Mode__c,
        Avatar_URL__c
      FROM Testimonial__c
      WHERE
        Approved__c = TRUE
        AND Vibe_Mode__c = :VIBE_PROFESSIONAL
        AND Relationship_Type__c IN :PROFESSIONAL_RELATIONSHIPS
      ORDER BY Sort_Order__c ASC NULLS LAST, CreatedDate DESC
      LIMIT :MAX_ROWS
    ];
  }

  @TestVisible
  private static Boolean throwException = false;
}
