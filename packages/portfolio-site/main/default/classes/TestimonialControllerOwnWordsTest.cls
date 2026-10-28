/**
 * @description       : Tests for TestimonialController.submitOwnTestimonial, the review in the
 *                      reviewer's own words. Guest tests run as the real Portfolio1 site guest
 *                      user. The sentence builder is covered by TestimonialControllerTest.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/28/2026
 **/
@isTest
private class TestimonialControllerOwnWordsTest {
  private static final String NAME = 'Ada Lovelace';
  private static final String TITLE = 'Engineer';
  private static final Integer HUMAN_MS = 9000;
  private static final String WORDS = 'Ryan rebuilt our release process in a month.';

  private static Id submitOwn(String relationship, String words) {
    return TestimonialController.submitOwnTestimonial(
      NAME,
      TITLE,
      relationship,
      'Professional',
      words,
      null,
      HUMAN_MS
    );
  }

  private static void expectRefusal(
    String expected,
    String relationship,
    String words
  ) {
    try {
      submitOwn(relationship, words);
      Assert.fail('Expected: ' + expected);
    } catch (AuraHandledException e) {
      Assert.areEqual(expected, e.getMessage(), 'Refusal message');
    }
  }

  @isTest
  static void guestSavesTheirOwnWordsAsTheQuote() {
    User guest = SiteGuestTestSupport.preparedGuest();
    RateWindowLimiter.nowOverride = Datetime.newInstanceGmt(
      2026,
      10,
      28,
      9,
      0,
      5
    );
    Id savedId;

    Test.startTest();
    System.runAs(guest) {
      savedId = TestimonialController.submitOwnTestimonial(
        NAME,
        TITLE,
        'Client',
        'Professional',
        '  ' + WORDS + '  ',
        null,
        HUMAN_MS
      );
    }
    Test.stopTest();

    Testimonial__c saved = [
      SELECT
        Relationship_Type__c,
        Vibe_Mode__c,
        Context__c,
        Strength_Fragment__c,
        Outcome_Fragment__c,
        Note__c,
        Approved__c
      FROM Testimonial__c
      WHERE Id = :savedId
    ];
    Assert.areEqual(
      WORDS,
      saved.Context__c,
      'The words, trimmed, are the quote'
    );
    Assert.areEqual('Client', saved.Relationship_Type__c, 'Relationship');
    Assert.areEqual('Professional', saved.Vibe_Mode__c, 'Vibe');
    Assert.isNull(saved.Strength_Fragment__c, 'No strength fragment');
    Assert.isNull(saved.Outcome_Fragment__c, 'No outcome fragment');
    Assert.isNull(saved.Note__c, 'No separate note');
    Assert.isFalse(saved.Approved__c, 'A submission is never approved');
  }

  @isTest
  static void blankWordsAreRefused() {
    expectRefusal('Write your review.', 'Peer', '   ');
  }

  @isTest
  static void wordsOverTheLimitAreRefused() {
    expectRefusal(
      'Your review can be at most ' +
        TestimonialController.MAX_OWN_WORDS_LENGTH +
        ' characters.',
      'Peer',
      'x'.repeat(TestimonialController.MAX_OWN_WORDS_LENGTH + 1)
    );
  }

  // Runs as the site guest, because the insert is in user mode and the guest's permission set
  // is what grants it field access. The org's own admin has none in a fresh scratch org.
  @isTest
  static void wordsAtTheLimitAreSaved() {
    User guest = SiteGuestTestSupport.preparedGuest();
    Id saved;

    Test.startTest();
    System.runAs(guest) {
      saved = submitOwn(
        'Peer',
        'x'.repeat(TestimonialController.MAX_OWN_WORDS_LENGTH)
      );
    }
    Test.stopTest();

    Assert.isNotNull(saved, 'Saved at exactly the limit');
    Assert.areEqual(
      TestimonialController.MAX_OWN_WORDS_LENGTH,
      [SELECT Context__c FROM Testimonial__c WHERE Id = :saved]
        .Context__c.length(),
      'Every character kept'
    );
  }

  @isTest
  static void anUnknownRelationshipIsRefusedAsInTheBuilder() {
    expectRefusal(
      'Choose a relationship: Manager, Peer, Client, Recruiter or Fan.',
      'Stranger',
      WORDS
    );
  }

  @isTest
  static void aBlockedKeywordInTheWordsIsDroppedSilently() {
    insert new Submission_Block__c(Type__c = 'Keyword', Value__c = 'casino');
    Id saved = submitOwn('Peer', 'Best CASINO bonus here');
    Assert.isNull(saved, 'Dropped');
    Assert.areEqual(0, [SELECT COUNT() FROM Testimonial__c], 'Nothing stored');
  }
}
