/**
 * @description       : Takes a testimonial from the public site (Round 3 plan K2). Validates the
 *                      input, applies the submission rate limit, and inserts the record in user
 *                      mode. Approved__c is never set here, so every submission lands unapproved
 *                      and stays hidden by the Block_Unapproved_Testimonials restriction rule.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/21/2026
 * @Test Class        : [TestimonialControllerTest]
 **/
public with sharing class TestimonialController {
  @TestVisible
  private static final String RATE_KEY = 'testimonial-submit';
  @TestVisible
  private static final Integer RATE_LIMIT_PER_MINUTE = 5;
  @TestVisible
  private static final Integer MAX_AUTHOR_NAME_LENGTH = 80;
  @TestVisible
  private static final Integer MAX_CONTEXT_LENGTH = 255;
  @TestVisible
  private static final String RATE_LIMITED_MESSAGE = 'Too many submissions. Try again in a minute.';
  @TestVisible
  private static final String SAVE_FAILED_MESSAGE = 'Your testimonial could not be saved. Try again later.';
  @TestVisible
  private static Boolean forceSaveFailure = false;
  private static final Set<String> RELATIONSHIPS = new Set<String>{
    'Manager',
    'Peer',
    'Client',
    'Recruiter',
    'Fan'
  };
  private static final Set<String> VIBE_MODES = new Set<String>{
    'Professional',
    'Casual'
  };

  /**
   * @description Saves a testimonial for review.
   * @param authorName Required, at most 80 characters.
   * @param authorTitle Optional, at most the length of Author_Title__c.
   * @param relationship One of Manager, Peer, Client, Recruiter, Fan.
   * @param vibeMode Professional or Casual.
   * @param context Required, at most 255 characters.
   * @return Id The new Testimonial__c Id.
   * @throws AuraHandledException With a readable message when the input is invalid, the
   *         submission rate is exceeded, or the record cannot be saved.
   * @example
   * Id saved = TestimonialController.submitTestimonial('Ada', 'CTO', 'Peer', 'Casual', 'Great work');
   */
  @AuraEnabled
  public static Id submitTestimonial(
    String authorName,
    String authorTitle,
    String relationship,
    String vibeMode,
    String context
  ) {
    String validationError = validate(
      authorName,
      authorTitle,
      relationship,
      vibeMode,
      context
    );
    if (validationError != null) {
      throw auraError(validationError);
    }

    ApiRequestContext.RateDecision decision = ApiRequestContext.rateLimiter()
      .checkKey(RATE_KEY, RATE_LIMIT_PER_MINUTE);
    if (!decision.allowed) {
      throw auraError(RATE_LIMITED_MESSAGE);
    }

    Testimonial__c testimonial = new Testimonial__c(
      Author_Name__c = authorName.trim(),
      Author_Title__c = String.isBlank(authorTitle) ? null : authorTitle.trim(),
      Relationship_Type__c = relationship,
      Vibe_Mode__c = vibeMode,
      Context__c = context.trim()
    );
    // The vibe is stored as submitted. The Vibe-Gate is applied on read: PAPITestimonialFeed in
    // professional mode returns only approved Manager, Client or Peer rows with the
    // Professional vibe (owner decision V1 (a), Round 3 plan section 10).

    try {
      if (forceSaveFailure) {
        throw new DmlException('Forced save failure for tests.');
      }
      insert as user testimonial;
    } catch (Exception e) {
      ApiRequestContext.commitRateCounts();
      throw auraError(SAVE_FAILED_MESSAGE);
    }
    ApiRequestContext.commitRateCounts();
    return testimonial.Id;
  }

  private static String validate(
    String authorName,
    String authorTitle,
    String relationship,
    String vibeMode,
    String context
  ) {
    if (String.isBlank(authorName)) {
      return 'Enter your name.';
    }
    if (authorName.trim().length() > MAX_AUTHOR_NAME_LENGTH) {
      return 'Your name can be at most ' +
        MAX_AUTHOR_NAME_LENGTH +
        ' characters.';
    }
    Integer maxTitleLength = Testimonial__c.Author_Title__c.getDescribe()
      .getLength();
    if (
      String.isNotBlank(authorTitle) &&
      authorTitle.trim().length() > maxTitleLength
    ) {
      return 'Your title can be at most ' + maxTitleLength + ' characters.';
    }
    if (!RELATIONSHIPS.contains(relationship)) {
      return 'Choose a relationship: Manager, Peer, Client, Recruiter or Fan.';
    }
    if (!VIBE_MODES.contains(vibeMode)) {
      return 'Choose a tone: Professional or Casual.';
    }
    if (String.isBlank(context)) {
      return 'Enter your testimonial.';
    }
    if (context.trim().length() > MAX_CONTEXT_LENGTH) {
      return 'Your testimonial can be at most ' +
        MAX_CONTEXT_LENGTH +
        ' characters.';
    }
    return null;
  }

  private static AuraHandledException auraError(String message) {
    AuraHandledException error = new AuraHandledException(message);
    error.setMessage(message);
    return error;
  }
}
