/**
 * @description       : Shared abuse guard for the public contact and testimonial forms
 *                      (ADR-031). It drops a submission silently when the
 *                      honeypot is filled, when the form was sent faster than a person can type,
 *                      or when the email, its domain or the text matches an active
 *                      Submission_Block__c row. A silent drop shows the visitor the normal thanks
 *                      and stores and sends nothing. It also applies each form's own rate limit.
 *                      Runs without sharing on purpose: Submission_Block__c is admin only, and the
 *                      site guest must have it read and its hit counts written without any access
 *                      of its own. Nothing read here is returned to the caller beyond the
 *                      Decision flags.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/23/2026
 * @Test Class        : [SubmissionGuardTest]
 **/
public without sharing class SubmissionGuard {
  public static final String FORM_CONTACT = 'contact';
  public static final String FORM_TESTIMONIAL = 'testimonial';
  public static final String TYPE_EMAIL = 'Email';
  public static final String TYPE_DOMAIN = 'Domain';
  public static final String TYPE_KEYWORD = 'Keyword';
  public static final String TYPE_IP_HASH = 'IP Hash';
  public static final String LEAD_SOURCE = 'Portfolio Website';

  public static final String REASON_HONEYPOT = 'honeypot';
  public static final String REASON_TOO_FAST = 'too-fast';
  public static final String REASON_BLOCKED = 'blocked';
  public static final String REASON_RATE = 'rate-limited';

  // Code defaults. The Contact_Min_Elapsed_Ms, Contact_Daily_Cap and
  // Testimonial_Rate_Per_Minute settings give the values in force.
  @TestVisible
  private static final Integer MIN_ELAPSED_MS = 3000;
  @TestVisible
  private static final Integer CONTACT_DAILY_CAP = 20;
  @TestVisible
  private static final String TESTIMONIAL_RATE_KEY = 'testimonial-submit';
  public static final Integer TESTIMONIAL_RATE_PER_MINUTE = 5;
  private static final Integer MAX_KEYWORDS = 500;

  /**
   * @description One submission as the form sent it.
   */
  public class Request {
    public String formKey;
    public String email;
    public String message;
    public String honeypot;
    public Integer elapsedMs;
  }

  /**
   * @description The guard's answer. accept is true only when nothing else is set.
   */
  public class Decision {
    public Boolean accept = false;
    public Boolean silentDrop = false;
    public Boolean rateLimited = false;
    public String reason;
  }

  /**
   * @description Checks one submission. The cheap checks run first, then the blocklist, then
   *              the form's rate limit, so a dropped bot never uses up a real visitor's share.
   * @param req The submission.
   * @return Decision accept, silentDrop or rateLimited, with a short reason.
   * @throws IllegalArgumentException When req or its formKey is missing.
   */
  public static Decision check(Request req) {
    if (req == null || String.isBlank(req.formKey)) {
      throw new IllegalArgumentException('A form key is required.');
    }
    Decision decision = new Decision();
    if (String.isNotBlank(req.honeypot)) {
      return drop(decision, REASON_HONEYPOT);
    }
    Integer minElapsedMs = PortfolioSettings.getInteger(
      'Contact_Min_Elapsed_Ms',
      MIN_ELAPSED_MS
    );
    if (req.elapsedMs == null || req.elapsedMs < minElapsedMs) {
      return drop(decision, REASON_TOO_FAST);
    }
    List<Submission_Block__c> hits = matchingBlocks(req);
    if (!hits.isEmpty()) {
      recordHits(hits);
      return drop(decision, REASON_BLOCKED);
    }
    if (isOverRate(req.formKey)) {
      decision.rateLimited = true;
      decision.reason = REASON_RATE;
      return decision;
    }
    decision.accept = true;
    return decision;
  }

  /**
   * @description Lower cases each block's Value and sets Unique_Key__c to Type:Value, so the
   *              same block cannot be added twice. Called by SubmissionBlockTrigger before
   *              insert and update.
   * @param blocks The rows being saved.
   */
  public static void normalize(List<Submission_Block__c> blocks) {
    for (Submission_Block__c block : blocks) {
      if (block.Value__c != null) {
        block.Value__c = block.Value__c.trim().toLowerCase();
      }
      block.Unique_Key__c = (block.Type__c == null ||
        block.Value__c == null)
        ? null
        : block.Type__c + ':' + block.Value__c;
    }
  }

  /**
   * @description The domain of an email address in lower case, or null when there is none.
   * @param email The address.
   * @return String The part after the last @.
   */
  public static String domainOf(String email) {
    if (String.isBlank(email) || !email.contains('@')) {
      return null;
    }
    return email.substringAfterLast('@').trim().toLowerCase();
  }

  private static Decision drop(Decision decision, String reason) {
    decision.silentDrop = true;
    decision.reason = reason;
    return decision;
  }

  private static List<Submission_Block__c> matchingBlocks(Request req) {
    String email = String.isBlank(req.email)
      ? null
      : req.email.trim().toLowerCase();
    Set<String> domains = domainAndParents(domainOf(email));
    List<Submission_Block__c> candidates = [
      SELECT Id, Type__c, Value__c, Hit_Count__c
      FROM Submission_Block__c
      WHERE
        Active__c = TRUE
        AND ((Type__c = :TYPE_EMAIL
        AND Value__c = :email)
        OR (Type__c = :TYPE_DOMAIN
        AND Value__c IN :domains)
        OR Type__c = :TYPE_KEYWORD)
      ORDER BY Type__c
      LIMIT :MAX_KEYWORDS
    ];
    String text = (String.isBlank(req.message) ? '' : req.message)
      .toLowerCase();
    List<Submission_Block__c> hits = new List<Submission_Block__c>();
    for (Submission_Block__c block : candidates) {
      if (block.Type__c != TYPE_KEYWORD) {
        hits.add(block);
      } else if (
        String.isNotBlank(block.Value__c) && text.contains(block.Value__c)
      ) {
        hits.add(block);
      }
    }
    return hits;
  }

  // mail.spam.example matches a block on spam.example too.
  private static Set<String> domainAndParents(String domain) {
    Set<String> domains = new Set<String>();
    if (String.isBlank(domain)) {
      return domains;
    }
    String current = domain;
    while (current.contains('.')) {
      domains.add(current);
      current = current.substringAfter('.');
    }
    return domains;
  }

  private static void recordHits(List<Submission_Block__c> hits) {
    Datetime now = Datetime.now();
    List<Submission_Block__c> updates = new List<Submission_Block__c>();
    for (Submission_Block__c block : hits) {
      updates.add(
        new Submission_Block__c(
          Id = block.Id,
          Hit_Count__c = (block.Hit_Count__c == null ? 0 : block.Hit_Count__c) +
            1,
          Last_Hit__c = now
        )
      );
    }
    // A failed counter update must never turn a silent drop into an error the bot can see.
    Database.update(updates, false, AccessLevel.SYSTEM_MODE);
  }

  private static Boolean isOverRate(String formKey) {
    if (formKey == FORM_CONTACT) {
      Datetime since = Datetime.now().addHours(-24);
      Integer today = [
        SELECT COUNT()
        FROM Lead
        WHERE LeadSource = :LEAD_SOURCE AND CreatedDate >= :since
      ];
      return today >=
        PortfolioSettings.getInteger('Contact_Daily_Cap', CONTACT_DAILY_CAP);
    }
    if (formKey == FORM_TESTIMONIAL) {
      ApiRequestContext.RateDecision rate = ApiRequestContext.rateLimiter()
        .checkKey(
          TESTIMONIAL_RATE_KEY,
          PortfolioSettings.getInteger(
            'Testimonial_Rate_Per_Minute',
            TESTIMONIAL_RATE_PER_MINUTE
          )
        );
      return !rate.allowed;
    }
    return false;
  }
}
