/**
 * @description       : Tests for TestimonialController.
 *                      Guest tests run as the real Portfolio1 site guest user. The fragment
 *                      tests use the Testimonial_Fragment__mdt records in source. The guest read
 *                      side of the wall is proved by TestimonialGuestAccessTest on org data.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/21/2026
 **/
@isTest
private class TestimonialControllerTest {
  // An internal reader made inside the test, with Portfolio_Admin assigned here, so the wall's
  // user mode read never depends on what the org has assigned.
  private static User adminReader() {
    Profile admin = [
      SELECT Id
      FROM Profile
      WHERE Name = 'System Administrator'
      LIMIT 1
    ];
    User user = new User(
      Alias = 'reader',
      Email = 'reader@example.com',
      EmailEncodingKey = 'UTF-8',
      LastName = 'Reader',
      LanguageLocaleKey = 'en_US',
      LocaleSidKey = 'en_US',
      ProfileId = admin.Id,
      TimeZoneSidKey = 'America/Los_Angeles',
      Username = 'reader.' + Crypto.getRandomInteger() + '@example.com.r7b'
    );
    // Setup records in their own runAs block avoid mixed DML with the test's own inserts.
    System.runAs(new User(Id = UserInfo.getUserId())) {
      insert user;
      insert new PermissionSetAssignment(
        AssigneeId = user.Id,
        PermissionSetId = [
          SELECT Id
          FROM PermissionSet
          WHERE Name = 'Portfolio_Admin'
          LIMIT 1
        ]
        .Id
      );
    }
    return user;
  }

  private static final String NAME = 'Ada Lovelace';
  private static final String TITLE = 'Engineer';
  private static final Integer HUMAN_MS = 9000;
  private static final String P_STRENGTH = 'Professional_Strength_01';
  private static final String P_OUTCOME_WORKED = 'Professional_Outcome_01';
  private static final String P_OUTCOME_ANYONE = 'Professional_Outcome_07';
  private static final String C_STRENGTH = 'Casual_Strength_09';
  private static final String C_OUTCOME_ANYONE = 'Casual_Outcome_05';

  private static Id submit(
    String relationship,
    String vibe,
    String strength,
    String outcome,
    String note,
    String website,
    Integer elapsedMs
  ) {
    return TestimonialController.submitTestimonial(
      NAME,
      TITLE,
      relationship,
      vibe,
      strength,
      outcome,
      note,
      website,
      elapsedMs
    );
  }

  private static void expectRefusal(
    String expected,
    String strength,
    String outcome,
    String relationship,
    String vibe
  ) {
    try {
      submit(relationship, vibe, strength, outcome, null, null, HUMAN_MS);
      Assert.fail('Expected: ' + expected);
    } catch (AuraHandledException e) {
      Assert.areEqual(expected, e.getMessage(), 'Refusal message');
    }
  }

  private static Testimonial_Fragment__mdt fragment(
    String name,
    String vibe,
    String slot,
    String text,
    Decimal sortOrder,
    String audience
  ) {
    return new Testimonial_Fragment__mdt(
      DeveloperName = name,
      Vibe__c = vibe,
      Slot__c = slot,
      Text__c = text,
      Sort_Order__c = sortOrder,
      Audience__c = audience
    );
  }

  @isTest
  static void fragmentsComeOrderedWithTheirAudience() {
    Test.startTest();
    List<TestimonialController.Fragment> fragments = TestimonialController.getFragments();
    Test.stopTest();

    Assert.areEqual(
      36,
      fragments.size(),
      'Ten strengths and eight outcomes per vibe'
    );
    Assert.areEqual('Casual', fragments[0].vibe, 'Casual sorts first');
    Assert.areEqual('Outcome', fragments[0].slot, 'Outcome sorts first');
    Assert.areEqual(1, fragments[0].sortOrder, 'Lowest sort order first');
    Assert.areEqual(
      'The org sparks joy now.',
      fragments[0].text,
      'Text from the drafts'
    );
    Assert.areEqual(
      'Worked together',
      fragments[0].audience,
      'Audience carried'
    );
  }

  @isTest
  static void submitAsGuestSavesTheComposedSentence() {
    User guest = SiteGuestTestSupport.preparedGuest();
    RateWindowLimiter.nowOverride = Datetime.newInstanceGmt(
      2026,
      10,
      23,
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
        'Peer',
        'Professional',
        P_STRENGTH,
        P_OUTCOME_WORKED,
        '  Calm and clear.  ',
        null,
        HUMAN_MS
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
        Strength_Fragment__c,
        Outcome_Fragment__c,
        Note__c,
        Approved__c
      FROM Testimonial__c
      WHERE Id = :savedId
    ];
    Assert.isFalse(saved.Approved__c, 'A submission is never approved');
    Assert.areEqual(NAME, saved.Author_Name__c, 'Name trimmed');
    Assert.areEqual(TITLE, saved.Author_Title__c, 'Title saved');
    Assert.areEqual('Peer', saved.Relationship_Type__c, 'Relationship');
    Assert.areEqual('Professional', saved.Vibe_Mode__c, 'Vibe');
    Assert.areEqual(
      'I\'m a peer, and Ryan explains the complex simply. The result? We launched on time.',
      saved.Context__c,
      'The sentence the reviewer saw'
    );
    Assert.areEqual(P_STRENGTH, saved.Strength_Fragment__c, 'Strength traced');
    Assert.areEqual(
      P_OUTCOME_WORKED,
      saved.Outcome_Fragment__c,
      'Outcome traced'
    );
    Assert.areEqual('Calm and clear.', saved.Note__c, 'Note trimmed');
  }

  @isTest
  static void aFanWithACasualVibeIsSavedWithNoTitleOrNote() {
    User guest = SiteGuestTestSupport.preparedGuest();
    Id savedId;
    System.runAs(guest) {
      savedId = TestimonialController.submitTestimonial(
        'Grace',
        '   ',
        'Fan',
        'Casual',
        C_STRENGTH,
        C_OUTCOME_ANYONE,
        '  ',
        null,
        HUMAN_MS
      );
    }
    Testimonial__c saved = [
      SELECT Author_Title__c, Note__c, Context__c
      FROM Testimonial__c
      WHERE Id = :savedId
    ];
    Assert.isNull(saved.Author_Title__c, 'Blank title saved empty');
    Assert.isNull(saved.Note__c, 'Blank note saved empty');
    Assert.areEqual(
      'I\'m a fan or visitor, and Ryan is the GOAT. The result? Instant fan.',
      saved.Context__c,
      'Casual sentence'
    );
  }

  @isTest
  static void aFragmentFromTheOtherVibeIsRefused() {
    expectRefusal(
      'Choose a strength from the list.',
      C_STRENGTH,
      P_OUTCOME_ANYONE,
      'Peer',
      'Professional'
    );
    expectRefusal(
      'Choose a result from the list.',
      P_STRENGTH,
      C_OUTCOME_ANYONE,
      'Peer',
      'Professional'
    );
  }

  @isTest
  static void anUnknownOrSwappedFragmentIsRefused() {
    expectRefusal(
      'Choose a strength from the list.',
      'Not_A_Fragment',
      P_OUTCOME_ANYONE,
      'Peer',
      'Professional'
    );
    expectRefusal(
      'Choose a strength from the list.',
      P_OUTCOME_ANYONE,
      P_OUTCOME_ANYONE,
      'Peer',
      'Professional'
    );
    expectRefusal(
      'Choose a result from the list.',
      P_STRENGTH,
      null,
      'Peer',
      'Professional'
    );
    expectRefusal(
      'Choose a result from the list.',
      P_STRENGTH,
      P_STRENGTH,
      'Peer',
      'Professional'
    );
  }

  @isTest
  static void aRecruiterCannotPickAWorkedTogetherOutcome() {
    expectRefusal(
      'Choose a result from the list.',
      P_STRENGTH,
      P_OUTCOME_WORKED,
      'Recruiter',
      'Professional'
    );
    expectRefusal(
      'Choose a result from the list.',
      P_STRENGTH,
      P_OUTCOME_WORKED,
      'Fan',
      'Professional'
    );
    // The save runs as the site guest, whose Portfolio_Guest grant SiteGuestTestSupport makes
    // sure of, because the insert is in user mode.
    Id saved;
    System.runAs(SiteGuestTestSupport.preparedGuest()) {
      saved = submit(
        'Recruiter',
        'Professional',
        P_STRENGTH,
        P_OUTCOME_ANYONE,
        null,
        null,
        HUMAN_MS
      );
    }
    Assert.isNotNull(saved, 'An Anyone outcome is fine for a recruiter');
  }

  @isTest
  static void aFilledHoneypotIsDroppedSilently() {
    User guest = SiteGuestTestSupport.preparedGuest();
    Id saved;
    System.runAs(guest) {
      saved = submit(
        'Peer',
        'Professional',
        P_STRENGTH,
        P_OUTCOME_ANYONE,
        null,
        'https://spam.example',
        HUMAN_MS
      );
    }
    Assert.isNull(saved, 'Nothing saved and no error');
    Assert.areEqual(0, [SELECT COUNT() FROM Testimonial__c], 'Nothing stored');
  }

  @isTest
  static void aTooFastSubmitIsDroppedSilently() {
    Id saved = submit(
      'Peer',
      'Professional',
      P_STRENGTH,
      P_OUTCOME_ANYONE,
      null,
      null,
      200
    );
    Assert.isNull(saved, 'Dropped');
    Assert.areEqual(0, [SELECT COUNT() FROM Testimonial__c], 'Nothing stored');
  }

  @isTest
  static void aBlockedKeywordInTheNoteIsDroppedSilently() {
    insert new Submission_Block__c(Type__c = 'Keyword', Value__c = 'casino');
    Id saved = submit(
      'Peer',
      'Professional',
      P_STRENGTH,
      P_OUTCOME_ANYONE,
      'Best CASINO bonus',
      null,
      HUMAN_MS
    );
    Assert.isNull(saved, 'Dropped');
    Assert.areEqual(0, [SELECT COUNT() FROM Testimonial__c], 'Nothing stored');
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
    String message;

    Test.startTest();
    System.runAs(guest) {
      for (
        Integer i = 0; i < TestimonialController.RATE_LIMIT_PER_MINUTE; i++
      ) {
        submit(
          'Peer',
          'Professional',
          P_STRENGTH,
          P_OUTCOME_ANYONE,
          null,
          null,
          HUMAN_MS
        );
      }
      try {
        submit(
          'Peer',
          'Professional',
          P_STRENGTH,
          P_OUTCOME_ANYONE,
          null,
          null,
          HUMAN_MS
        );
      } catch (AuraHandledException e) {
        message = e.getMessage();
      }
    }
    Test.stopTest();

    Assert.areEqual(
      TestimonialController.RATE_LIMITED_MESSAGE,
      message,
      'Sixth refused'
    );
    Assert.areEqual(
      TestimonialController.RATE_LIMIT_PER_MINUTE,
      [SELECT COUNT() FROM Testimonial__c],
      'Five saved'
    );
  }

  @isTest
  static void submitSaveFailsThrowsReadableMessage() {
    TestimonialController.forceSaveFailure = true;
    expectRefusal(
      TestimonialController.SAVE_FAILED_MESSAGE,
      P_STRENGTH,
      P_OUTCOME_ANYONE,
      'Peer',
      'Professional'
    );
  }

  @isTest
  static void invalidFieldsAreRefusedWithReadableMessages() {
    Map<String, List<String>> cases = new Map<String, List<String>>{
      'Enter your name.' => new List<String>{
        ' ',
        null,
        'Peer',
        'Professional',
        null
      },
      'Your name can be at most 80 characters.' => new List<String>{
        'x'.repeat(81),
        null,
        'Peer',
        'Professional',
        null
      },
      'Your title can be at most 100 characters.' => new List<String>{
        'Ada',
        't'.repeat(101),
        'Peer',
        'Professional',
        null
      },
      'Choose a relationship: Manager, Peer, Client, Recruiter or Fan.' => new List<String>{
        'Ada',
        null,
        'Boss',
        'Professional',
        null
      },
      'Choose a tone: Professional or Casual.' => new List<String>{
        'Ada',
        null,
        'Peer',
        'Loud',
        null
      },
      'Your note can be at most 255 characters.' => new List<String>{
        'Ada',
        null,
        'Peer',
        'Professional',
        'n'.repeat(256)
      }
    };
    for (String expected : cases.keySet()) {
      List<String> input = cases.get(expected);
      try {
        TestimonialController.submitTestimonial(
          input[0],
          input[1],
          input[2],
          input[3],
          P_STRENGTH,
          P_OUTCOME_ANYONE,
          input[4],
          null,
          HUMAN_MS
        );
        Assert.fail('Expected: ' + expected);
      } catch (AuraHandledException e) {
        Assert.areEqual(expected, e.getMessage(), 'Validation message');
      }
    }
  }

  @isTest
  static void aSentenceOverTheFieldLengthIsRefused() {
    TestimonialController.fragmentsOverride = new List<Testimonial_Fragment__mdt>{
      fragment(
        'Long_Strength',
        'Professional',
        'Strength',
        's'.repeat(120),
        1,
        'Anyone'
      ),
      fragment(
        'Long_Outcome',
        'Professional',
        'Outcome',
        'o'.repeat(120),
        null,
        'Anyone'
      )
    };
    expectRefusal(
      'That sentence is too long to save. Choose another phrase.',
      'Long_Strength',
      'Long_Outcome',
      'Manager',
      'Professional'
    );
    List<TestimonialController.Fragment> fragments = TestimonialController.getFragments();
    Assert.areEqual(2, fragments.size(), 'Override used');
    Assert.isNull(fragments[0].sortOrder, 'A blank sort order stays blank');
  }

  @isTest
  static void theWallShowsApprovedRowsWithTheProfessionalRule() {
    insert new List<Testimonial__c>{
      new Testimonial__c(
        Author_Name__c = 'Pro',
        Approved__c = true,
        Vibe_Mode__c = 'Professional',
        Relationship_Type__c = 'Manager',
        Context__c = 'Formal',
        Sort_Order__c = 1
      ),
      new Testimonial__c(
        Author_Name__c = 'Fun',
        Approved__c = true,
        Vibe_Mode__c = 'Casual',
        Relationship_Type__c = 'Peer',
        Context__c = 'Fun',
        Note__c = 'Note',
        Sort_Order__c = 2
      ),
      new Testimonial__c(
        Author_Name__c = 'Fan',
        Approved__c = true,
        Vibe_Mode__c = 'Professional',
        Relationship_Type__c = 'Fan',
        Sort_Order__c = 3
      ),
      new Testimonial__c(
        Author_Name__c = 'Pending',
        Approved__c = false,
        Vibe_Mode__c = 'Professional',
        Relationship_Type__c = 'Manager'
      )
    };
    // Guest sharing never reaches rows made in a test, so this runs as an internal
    // reader. TestimonialGuestAccessTest proves the guest side on the org's own rows.
    List<TestimonialController.WallItem> wall;
    User reader = adminReader();
    Test.startTest();
    System.runAs(reader) {
      wall = TestimonialController.getApprovedTestimonials();
    }
    Test.stopTest();

    Assert.areEqual(3, wall.size(), 'Approved rows only');
    Assert.areEqual('Pro', wall[0].authorName, 'Curated order');
    Assert.isTrue(wall[0].professional, 'Professional vibe from a Manager');
    Assert.isFalse(wall[1].professional, 'Casual is never professional');
    Assert.areEqual('Note', wall[1].note, 'Note carried');
    Assert.isFalse(wall[2].professional, 'A fan is not professional');
    Assert.areEqual(16, wall[0].key.length(), 'A short key, not the record Id');
  }

  // Approved rows for the home page tests, in curated order: a casual peer, a fan, then the
  // professional ones, so a professional row is never first by sort order alone.
  private static void insertApproved(Integer count) {
    List<Testimonial__c> rows = new List<Testimonial__c>();
    for (Integer i = 0; i < count; i++) {
      Boolean professional = i >= 2;
      rows.add(
        new Testimonial__c(
          Author_Name__c = 'Home ' + i,
          Approved__c = true,
          Vibe_Mode__c = i == 0 ? 'Casual' : 'Professional',
          Relationship_Type__c = professional
            ? 'Client'
            : (i == 0 ? 'Peer' : 'Fan'),
          Context__c = 'Quote ' + i,
          Sort_Order__c = i + 1
        )
      );
    }
    rows.add(
      new Testimonial__c(
        Author_Name__c = 'Waiting',
        Approved__c = false,
        Vibe_Mode__c = 'Professional',
        Relationship_Type__c = 'Manager'
      )
    );
    insert rows;
  }

  private static List<TestimonialController.WallItem> homeAsReader() {
    List<TestimonialController.WallItem> home;
    User reader = adminReader();
    Test.startTest();
    System.runAs(reader) {
      home = TestimonialController.getHomeTestimonials();
    }
    Test.stopTest();
    return home;
  }

  @isTest
  static void theHomePageShowsNothingBelowTheMinimum() {
    PortfolioSettings.overrides.put('Home_Testimonials_Min', null);
    insertApproved(2);

    List<TestimonialController.WallItem> home = homeAsReader();

    Assert.areEqual(
      0,
      home.size(),
      'Two approved is below the default of three, and the waiting row never counts'
    );
  }

  @isTest
  static void theHomePageShowsThreeOnceTheMinimumIsMet() {
    PortfolioSettings.overrides.put('Home_Testimonials_Min', null);
    insertApproved(3);

    List<TestimonialController.WallItem> home = homeAsReader();

    Assert.areEqual(3, home.size(), 'Three approved turns the section on');
    Assert.areEqual(
      'Home 2',
      home[0].authorName,
      'The professional quote comes first'
    );
    Assert.isTrue(home[0].professional, 'Marked professional');
    Assert.areEqual('Home 0', home[1].authorName, 'Then the wall order');
    Assert.areEqual('Home 1', home[2].authorName, 'Then the wall order');
  }

  @isTest
  static void theHomePageShowsAtMostThreeProfessionalFirst() {
    PortfolioSettings.overrides.put('Home_Testimonials_Min', null);
    insertApproved(6);

    List<TestimonialController.WallItem> home = homeAsReader();

    Assert.areEqual(3, home.size(), 'Never more than three');
    for (TestimonialController.WallItem item : home) {
      Assert.isTrue(item.professional, 'Professional quotes fill the three');
    }
    Assert.areEqual('Home 2', home[0].authorName, 'In the wall order');
    Assert.areEqual('Home 4', home[2].authorName, 'In the wall order');
  }

  @isTest
  static void theHomePageMinimumFollowsTheSetting() {
    PortfolioSettings.overrideNumber('Home_Testimonials_Min', 5);
    insertApproved(4);

    List<TestimonialController.WallItem> home = homeAsReader();

    Assert.areEqual(0, home.size(), 'Four is below a minimum of five');
  }

  @isTest
  static void theHomePageMinimumOfOneShowsASingleQuote() {
    PortfolioSettings.overrideNumber('Home_Testimonials_Min', 1);
    insertApproved(1);

    List<TestimonialController.WallItem> home = homeAsReader();

    Assert.areEqual(1, home.size(), 'One approved meets a minimum of one');
  }

  @isTest
  static void theProfessionalRuleMatchesThePapiFeed() {
    String body = [
      SELECT Body
      FROM ApexClass
      WHERE Name = 'PAPITestimonialFeed'
      LIMIT 1
    ]
    .Body;
    Matcher setMatch = Pattern.compile(
        'PROFESSIONAL_RELATIONSHIPS\\s*=\\s*new Set<String>\\s*\\{([^}]*)\\}'
      )
      .matcher(body);
    Assert.isTrue(
      setMatch.find(),
      'The feed still names its professional relationships'
    );
    Set<String> feedSet = new Set<String>();
    Matcher quoted = Pattern.compile('\'([^\']+)\'').matcher(setMatch.group(1));
    while (quoted.find()) {
      feedSet.add(quoted.group(1));
    }
    Assert.areEqual(
      TestimonialController.PROFESSIONAL_RELATIONSHIPS,
      feedSet,
      'Same relationships'
    );
    Assert.isTrue(
      body.contains(
        'VIBE_PROFESSIONAL = \'' +
          TestimonialController.VIBE_PROFESSIONAL +
          '\''
      ),
      'Same professional vibe'
    );
  }
}
