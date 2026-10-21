/**
 * @description       : Tests for TestimonialController (Round 3 plan K2). Guest tests run as the
 *                      real Portfolio1 site guest user.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/21/2026
 **/
@isTest
private class TestimonialControllerTest {
  private static final String NAME = 'Ada Lovelace';
  private static final String TITLE = 'Engineer';
  private static final String RELATIONSHIP = 'Peer';
  private static final String VIBE = 'Casual';
  private static final String CONTEXT = 'Clear designs and calm delivery.';

  @isTest
  static void submitAsGuestInsertsUnapprovedRecord() {
    User guest = SiteGuestTestSupport.preparedGuest();
    RateWindowLimiter.nowOverride = Datetime.newInstanceGmt(
      2026,
      10,
      21,
      9,
      0,
      5
    );
    Id savedId;

    Test.startTest();
    System.runAs(guest) {
      savedId = TestimonialController.submitTestimonial(
        '  ' + NAME + '  ',
        TITLE,
        RELATIONSHIP,
        VIBE,
        CONTEXT
      );
    }
    Test.stopTest();

    Testimonial__c saved = [
      SELECT
        Author_Name__c,
        Author_Title__c,
        Relationship_Type__c,
        Vibe_Mode__c,
        Context__c,
        Approved__c
      FROM Testimonial__c
      WHERE Id = :savedId
    ];
    Assert.isFalse(saved.Approved__c, 'A submission is never approved');
    Assert.areEqual(NAME, saved.Author_Name__c, 'Name trimmed and saved');
    Assert.areEqual(TITLE, saved.Author_Title__c, 'Title saved');
    Assert.areEqual(RELATIONSHIP, saved.Relationship_Type__c, 'Relationship');
    Assert.areEqual(VIBE, saved.Vibe_Mode__c, 'Vibe mode');
    Assert.areEqual(CONTEXT, saved.Context__c, 'Context saved');
    Assert.areEqual(
      1,
      [SELECT COUNT() FROM API_Rate_Window__c],
      'The submission was counted'
    );
  }

  @isTest
  static void submitAsGuestBlankTitleIsSavedEmpty() {
    User guest = SiteGuestTestSupport.preparedGuest();
    Id savedId;

    Test.startTest();
    System.runAs(guest) {
      savedId = TestimonialController.submitTestimonial(
        NAME,
        '   ',
        'Fan',
        'Professional',
        CONTEXT
      );
    }
    Test.stopTest();

    Testimonial__c saved = [
      SELECT Author_Title__c, Approved__c
      FROM Testimonial__c
      WHERE Id = :savedId
    ];
    Assert.isNull(saved.Author_Title__c, 'Blank title stored as null');
    Assert.isFalse(saved.Approved__c, 'Unapproved');
  }

  @isTest
  static void guestCannotReadTestimonials() {
    insert new List<Testimonial__c>{
      new Testimonial__c(Author_Name__c = 'Approved', Approved__c = true),
      new Testimonial__c(Author_Name__c = 'Pending', Approved__c = false)
    };
    User guest = SiteGuestTestSupport.preparedGuest();
    Integer visible = 0;

    Test.startTest();
    System.runAs(guest) {
      try {
        visible = [
            SELECT Id
            FROM Testimonial__c
            WITH USER_MODE
          ]
          .size();
      } catch (QueryException e) {
        visible = 0;
      }
    }
    Test.stopTest();

    Assert.areEqual(0, visible, 'A guest reads no testimonial');
  }

  @isTest
  static void submitSixthInOneMinuteIsRefused() {
    User guest = SiteGuestTestSupport.preparedGuest();
    RateWindowLimiter.nowOverride = Datetime.newInstanceGmt(
      2026,
      10,
      21,
      9,
      0,
      5
    );
    String refusal;

    Test.startTest();
    System.runAs(guest) {
      for (
        Integer i = 0; i < TestimonialController.RATE_LIMIT_PER_MINUTE; i++
      ) {
        TestimonialController.submitTestimonial(
          NAME,
          null,
          RELATIONSHIP,
          VIBE,
          CONTEXT
        );
      }
      try {
        TestimonialController.submitTestimonial(
          NAME,
          null,
          RELATIONSHIP,
          VIBE,
          CONTEXT
        );
      } catch (AuraHandledException e) {
        refusal = e.getMessage();
      }
    }
    Test.stopTest();

    Assert.areEqual(
      TestimonialController.RATE_LIMITED_MESSAGE,
      refusal,
      'The sixth submission is refused'
    );
    Assert.areEqual(
      TestimonialController.RATE_LIMIT_PER_MINUTE,
      [SELECT COUNT() FROM Testimonial__c],
      'Only the allowed submissions were saved'
    );
  }

  @isTest
  static void submitSaveFailsThrowsReadableMessage() {
    TestimonialController.forceSaveFailure = true;

    Test.startTest();
    String message = submitAndCatch(NAME, TITLE, RELATIONSHIP, VIBE, CONTEXT);
    Test.stopTest();

    Assert.areEqual(
      TestimonialController.SAVE_FAILED_MESSAGE,
      message,
      'Save failure message'
    );
    Assert.areEqual(0, [SELECT COUNT() FROM Testimonial__c], 'Nothing saved');
  }

  @isTest
  static void submitBlankNameIsRefused() {
    assertRefused(
      submitAndCatch(' ', TITLE, RELATIONSHIP, VIBE, CONTEXT),
      'name'
    );
  }

  @isTest
  static void submitLongNameIsRefused() {
    String longName = 'a'
      .repeat(TestimonialController.MAX_AUTHOR_NAME_LENGTH + 1);
    assertRefused(
      submitAndCatch(longName, TITLE, RELATIONSHIP, VIBE, CONTEXT),
      'at most'
    );
  }

  @isTest
  static void submitLongTitleIsRefused() {
    String longTitle = 'a'
      .repeat(Testimonial__c.Author_Title__c.getDescribe().getLength() + 1);
    assertRefused(
      submitAndCatch(NAME, longTitle, RELATIONSHIP, VIBE, CONTEXT),
      'title'
    );
  }

  @isTest
  static void submitUnknownRelationshipIsRefused() {
    assertRefused(
      submitAndCatch(NAME, TITLE, 'Stranger', VIBE, CONTEXT),
      'relationship'
    );
  }

  @isTest
  static void submitMissingRelationshipIsRefused() {
    assertRefused(
      submitAndCatch(NAME, TITLE, null, VIBE, CONTEXT),
      'relationship'
    );
  }

  @isTest
  static void submitUnknownVibeModeIsRefused() {
    assertRefused(
      submitAndCatch(NAME, TITLE, RELATIONSHIP, 'Loud', CONTEXT),
      'tone'
    );
  }

  @isTest
  static void submitBlankContextIsRefused() {
    assertRefused(
      submitAndCatch(NAME, TITLE, RELATIONSHIP, VIBE, ''),
      'testimonial'
    );
  }

  @isTest
  static void submitLongContextIsRefused() {
    String longContext = 'a'
      .repeat(TestimonialController.MAX_CONTEXT_LENGTH + 1);
    assertRefused(
      submitAndCatch(NAME, TITLE, RELATIONSHIP, VIBE, longContext),
      'at most'
    );
  }

  private static String submitAndCatch(
    String authorName,
    String authorTitle,
    String relationship,
    String vibeMode,
    String context
  ) {
    try {
      TestimonialController.submitTestimonial(
        authorName,
        authorTitle,
        relationship,
        vibeMode,
        context
      );
    } catch (AuraHandledException e) {
      return e.getMessage();
    }
    return null;
  }

  private static void assertRefused(String message, String expectedFragment) {
    Assert.isNotNull(message, 'Expected AuraHandledException');
    Assert.isTrue(
      message.containsIgnoreCase(expectedFragment),
      'Message should mention ' + expectedFragment + ': ' + message
    );
    Assert.areEqual(0, [SELECT COUNT() FROM Testimonial__c], 'Nothing saved');
    Assert.areEqual(
      0,
      [SELECT COUNT() FROM API_Rate_Window__c],
      'A refused input is not counted'
    );
  }
}
