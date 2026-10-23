/**
 * @description       : The public testimonial form and wall (Round 3 plan K2, Round 7 B9 and B2,
 *                      ADR-005, ADR-012). The form is a sentence builder: "I'm a [relationship],
 *                      and Ryan [strength]. The result? [outcome]" plus an optional note. The
 *                      strengths and outcomes are Testimonial_Fragment__mdt records, and only a
 *                      known fragment of the chosen vibe is accepted. The finished sentence is
 *                      stored in Context__c, so it stays exactly as the reviewer approved it even
 *                      when a fragment's wording changes later. The fragment names and the note
 *                      have fields of their own. SubmissionGuard drops spam silently and applies
 *                      the rate limit. Approved__c is never set here. The wall reads approved
 *                      rows only, and the Block_Unapproved_Testimonials restriction rule hides
 *                      every other row from the guest as well.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/21/2026
 * @Test Class        : [TestimonialControllerTest]
 **/
public with sharing class TestimonialController {
  @TestVisible
  private static final Integer RATE_LIMIT_PER_MINUTE = SubmissionGuard.TESTIMONIAL_RATE_PER_MINUTE;
  @TestVisible
  private static final Integer MAX_AUTHOR_NAME_LENGTH = 80;
  @TestVisible
  private static final Integer MAX_CONTEXT_LENGTH = 255;
  @TestVisible
  private static final Integer MAX_NOTE_LENGTH = 255;
  @TestVisible
  private static final String RATE_LIMITED_MESSAGE = 'Too many submissions. Try again in a minute.';
  @TestVisible
  private static final String SAVE_FAILED_MESSAGE = 'Your testimonial could not be saved. Try again later.';
  @TestVisible
  private static Boolean forceSaveFailure = false;
  @TestVisible
  private static List<Testimonial_Fragment__mdt> fragmentsOverride;

  private static final Set<String> RELATIONSHIPS = new Set<String>{
    'Manager',
    'Peer',
    'Client',
    'Recruiter',
    'Fan'
  };
  private static final Map<String, String> SENTENCE_WORDS = new Map<String, String>{
    'Manager' => 'manager',
    'Peer' => 'peer',
    'Client' => 'client',
    'Recruiter' => 'recruiter',
    'Fan' => 'fan or visitor'
  };
  // Someone who has not worked with Ryan sees only outcomes anyone could honestly say.
  private static final Set<String> ANYONE_ONLY = new Set<String>{
    'Recruiter',
    'Fan'
  };
  private static final Set<String> VIBE_MODES = new Set<String>{
    'Professional',
    'Casual'
  };
  @TestVisible
  private static final String SLOT_STRENGTH = 'Strength';
  @TestVisible
  private static final String SLOT_OUTCOME = 'Outcome';
  @TestVisible
  private static final String AUDIENCE_ANYONE = 'Anyone';
  // PAPITestimonialFeed's professional rule, copied and not changed: approved, the Professional
  // vibe, and a Manager, Client or Peer. TestimonialControllerTest reads the feed's source and
  // fails if the two drift apart.
  @TestVisible
  private static final String VIBE_PROFESSIONAL = 'Professional';
  @TestVisible
  private static final Set<String> PROFESSIONAL_RELATIONSHIPS = new Set<String>{
    'Manager',
    'Client',
    'Peer'
  };

  /**
   * @description One choice in the sentence builder.
   */
  public class Fragment {
    @AuraEnabled
    public String id;
    @AuraEnabled
    public String vibe;
    @AuraEnabled
    public String slot;
    @AuraEnabled
    public String text;
    @AuraEnabled
    public Integer sortOrder;
    @AuraEnabled
    public String audience;
  }

  /**
   * @description One approved testimonial for the wall. No Id, contact or approval data.
   */
  public class WallItem {
    @AuraEnabled
    public String key;
    @AuraEnabled
    public String authorName;
    @AuraEnabled
    public String authorTitle;
    @AuraEnabled
    public String relationship;
    @AuraEnabled
    public String vibe;
    @AuraEnabled
    public String sentence;
    @AuraEnabled
    public String note;
    @AuraEnabled
    public Boolean professional;
  }

  /**
   * @description The sentence builder's fragments, ordered by vibe, slot and sort order.
   * @return List<Fragment> Every fragment. The form filters by vibe and audience.
   */
  @AuraEnabled(cacheable=true)
  public static List<Fragment> getFragments() {
    List<Fragment> fragments = new List<Fragment>();
    for (Testimonial_Fragment__mdt record : fragmentRecords()) {
      Fragment fragment = new Fragment();
      fragment.id = record.DeveloperName;
      fragment.vibe = record.Vibe__c;
      fragment.slot = record.Slot__c;
      fragment.text = record.Text__c;
      fragment.sortOrder = record.Sort_Order__c == null
        ? null
        : record.Sort_Order__c.intValue();
      fragment.audience = record.Audience__c;
      fragments.add(fragment);
    }
    return fragments;
  }

  /**
   * @description Approved testimonials for the wall, curated order first, then newest. The
   *              restriction rule keeps unapproved rows from the guest. The filter here is a
   *              second lock.
   * @return List<WallItem> Approved testimonials, each marked professional or not.
   */
  @AuraEnabled(cacheable=true)
  public static List<WallItem> getApprovedTestimonials() {
    List<WallItem> items = new List<WallItem>();
    for (Testimonial__c row : [
      SELECT
        Id,
        Author_Name__c,
        Author_Title__c,
        Relationship_Type__c,
        Vibe_Mode__c,
        Context__c,
        Note__c
      FROM Testimonial__c
      WHERE Approved__c = TRUE
      WITH USER_MODE
      ORDER BY Sort_Order__c ASC NULLS LAST, CreatedDate DESC
      LIMIT 200
    ]) {
      WallItem item = new WallItem();
      item.key = EncodingUtil.convertToHex(
          Crypto.generateDigest('SHA-256', Blob.valueOf(row.Id))
        )
        .left(16);
      item.authorName = row.Author_Name__c;
      item.authorTitle = row.Author_Title__c;
      item.relationship = row.Relationship_Type__c;
      item.vibe = row.Vibe_Mode__c;
      item.sentence = row.Context__c;
      item.note = row.Note__c;
      item.professional = isProfessional(
        row.Vibe_Mode__c,
        row.Relationship_Type__c
      );
      items.add(item);
    }
    return items;
  }

  /**
   * @description Saves a testimonial for review.
   * @param authorName Required, at most 80 characters.
   * @param authorTitle Optional, at most the length of Author_Title__c.
   * @param relationship One of Manager, Peer, Client, Recruiter, Fan.
   * @param vibeMode Professional or Casual. It decides which fragments are allowed.
   * @param strengthId The DeveloperName of a Strength fragment of that vibe.
   * @param outcomeId The DeveloperName of an Outcome fragment of that vibe, open to the
   *        relationship's audience.
   * @param note Optional, at most 255 characters.
   * @param website The honeypot. A person leaves it empty.
   * @param elapsedMs Milliseconds between the form appearing and the submit.
   * @return Id The new Testimonial__c Id, or null when the submission was dropped silently.
   * @throws AuraHandledException With a readable message when the input is invalid, the
   *         submission rate is exceeded, or the record cannot be saved.
   * @example
   * Id saved = TestimonialController.submitTestimonial('Ada', 'CTO', 'Peer', 'Casual',
   *   'Casual_Strength_01', 'Casual_Outcome_05', null, null, 9000);
   */
  @AuraEnabled
  public static Id submitTestimonial(
    String authorName,
    String authorTitle,
    String relationship,
    String vibeMode,
    String strengthId,
    String outcomeId,
    String note,
    String website,
    Integer elapsedMs
  ) {
    String validationError = validate(
      authorName,
      authorTitle,
      relationship,
      vibeMode,
      note
    );
    if (validationError != null) {
      throw auraError(validationError);
    }
    Map<String, Testimonial_Fragment__mdt> fragments = fragmentsById();
    Testimonial_Fragment__mdt strength = fragments.get(strengthId);
    Testimonial_Fragment__mdt outcome = fragments.get(outcomeId);
    String fragmentError = validateFragments(
      relationship,
      vibeMode,
      strength,
      outcome
    );
    if (fragmentError != null) {
      throw auraError(fragmentError);
    }
    String sentence = composeSentence(relationship, strength, outcome);
    if (sentence.length() > MAX_CONTEXT_LENGTH) {
      throw auraError(
        'That sentence is too long to save. Choose another phrase.'
      );
    }

    SubmissionGuard.Request request = new SubmissionGuard.Request();
    request.formKey = SubmissionGuard.FORM_TESTIMONIAL;
    request.message = String.join(
      new List<String>{
        authorName,
        String.isBlank(authorTitle) ? '' : authorTitle,
        String.isBlank(note) ? '' : note
      },
      ' '
    );
    request.honeypot = website;
    request.elapsedMs = elapsedMs;
    SubmissionGuard.Decision decision = SubmissionGuard.check(request);
    if (decision.silentDrop) {
      ApiRequestContext.commitRateCounts();
      return null;
    }
    if (decision.rateLimited) {
      ApiRequestContext.commitRateCounts();
      throw auraError(RATE_LIMITED_MESSAGE);
    }

    Testimonial__c testimonial = new Testimonial__c(
      Author_Name__c = authorName.trim(),
      Author_Title__c = String.isBlank(authorTitle) ? null : authorTitle.trim(),
      Relationship_Type__c = relationship,
      Vibe_Mode__c = vibeMode,
      Context__c = sentence,
      Strength_Fragment__c = strength.DeveloperName,
      Outcome_Fragment__c = outcome.DeveloperName,
      Note__c = String.isBlank(note) ? null : note.trim()
    );
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

  /**
   * @description PAPITestimonialFeed's professional rule for an approved row.
   * @param vibe The row's Vibe_Mode__c.
   * @param relationship The row's Relationship_Type__c.
   * @return Boolean True for the Professional vibe from a Manager, Client or Peer.
   */
  @TestVisible
  private static Boolean isProfessional(String vibe, String relationship) {
    return vibe == VIBE_PROFESSIONAL &&
      PROFESSIONAL_RELATIONSHIPS.contains(relationship);
  }

  @TestVisible
  private static String composeSentence(
    String relationship,
    Testimonial_Fragment__mdt strength,
    Testimonial_Fragment__mdt outcome
  ) {
    return 'I\'m a ' +
      SENTENCE_WORDS.get(relationship) +
      ', and Ryan ' +
      strength.Text__c.trim() +
      '. The result? ' +
      outcome.Text__c.trim();
  }

  private static String validateFragments(
    String relationship,
    String vibeMode,
    Testimonial_Fragment__mdt strength,
    Testimonial_Fragment__mdt outcome
  ) {
    if (
      strength == null ||
      strength.Slot__c != SLOT_STRENGTH ||
      strength.Vibe__c != vibeMode
    ) {
      return 'Choose a strength from the list.';
    }
    if (
      outcome == null ||
      outcome.Slot__c != SLOT_OUTCOME ||
      outcome.Vibe__c != vibeMode ||
      (ANYONE_ONLY.contains(relationship) &&
      outcome.Audience__c != AUDIENCE_ANYONE)
    ) {
      return 'Choose a result from the list.';
    }
    return null;
  }

  private static List<Testimonial_Fragment__mdt> fragmentRecords() {
    List<Testimonial_Fragment__mdt> records = fragmentsOverride != null
      ? fragmentsOverride
      : Testimonial_Fragment__mdt.getAll().values();
    List<FragmentOrder> ordered = new List<FragmentOrder>();
    for (Testimonial_Fragment__mdt record : records) {
      ordered.add(new FragmentOrder(record));
    }
    ordered.sort();
    List<Testimonial_Fragment__mdt> sorted = new List<Testimonial_Fragment__mdt>();
    for (FragmentOrder entry : ordered) {
      sorted.add(entry.record);
    }
    return sorted;
  }

  private static Map<String, Testimonial_Fragment__mdt> fragmentsById() {
    Map<String, Testimonial_Fragment__mdt> byId = new Map<String, Testimonial_Fragment__mdt>();
    for (Testimonial_Fragment__mdt record : fragmentRecords()) {
      byId.put(record.DeveloperName, record);
    }
    return byId;
  }

  /**
   * @description Orders fragments by vibe, then slot, then sort order, then name.
   */
  private class FragmentOrder implements Comparable {
    private Testimonial_Fragment__mdt record;
    private String key;

    private FragmentOrder(Testimonial_Fragment__mdt record) {
      this.record = record;
      Integer order = record.Sort_Order__c == null
        ? 999
        : record.Sort_Order__c.intValue();
      this.key =
        record.Vibe__c +
        '|' +
        record.Slot__c +
        '|' +
        String.valueOf(1000 + order) +
        '|' +
        record.DeveloperName;
    }

    public Integer compareTo(Object other) {
      return key.compareTo(((FragmentOrder) other).key);
    }
  }

  private static String validate(
    String authorName,
    String authorTitle,
    String relationship,
    String vibeMode,
    String note
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
    if (String.isNotBlank(note) && note.trim().length() > MAX_NOTE_LENGTH) {
      return 'Your note can be at most ' + MAX_NOTE_LENGTH + ' characters.';
    }
    return null;
  }

  private static AuraHandledException auraError(String message) {
    AuraHandledException error = new AuraHandledException(message);
    error.setMessage(message);
    return error;
  }
}
