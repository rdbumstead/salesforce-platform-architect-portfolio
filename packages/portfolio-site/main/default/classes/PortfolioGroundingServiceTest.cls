/**
 * @description       : Unit tests for PortfolioGroundingService: no PII reaches the prompt,
 *                      the size cap holds with 200 projects, and keyword ranking picks the
 *                      matching records. Builds its own records.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/21/2026
 **/
@IsTest
private class PortfolioGroundingServiceTest {
  private static final String SENTINEL_EMAIL = 'leak.sentinel@example.com';
  private static final String SENTINEL_PHONE = '(555) 014-2424';
  private static final Pattern PHONE_SHAPE = Pattern.compile(
    '\\(?\\d{3}\\)?[\\s.-]?\\d{3}[\\s.-]?\\d{4}'
  );

  private static Project__c project(Integer index, String challenge) {
    return new Project__c(
      Is_Verified__c = true,
      Name = 'Project ' + index,
      Sort_Order__c = Math.mod(index, 999),
      Is_Featured__c = true,
      Status__c = 'Live – In Production',
      Challenge__c = challenge,
      Solution__c = 'Solution text '.repeat(80),
      Business_Value__c = 'Value text, call ' +
        SENTINEL_PHONE +
        ' or mail ' +
        SENTINEL_EMAIL +
        ' ' +
        'v'.repeat(700)
    );
  }

  private static Map<String, Object> parse(String grounding) {
    return (Map<String, Object>) JSON.deserializeUntyped(grounding);
  }

  @IsTest
  static void groundingWithTwoHundredProjectsStaysUnderTheCapWithoutPii() {
    List<Project__c> projects = new List<Project__c>();
    for (Integer i = 0; i < 200; i++) {
      projects.add(
        project(
          i,
          'Contact ' +
            SENTINEL_EMAIL +
            ' about Apex integration ' +
            'c'.repeat(700)
        )
      );
    }
    insert projects;

    Test.startTest();
    String grounding = PortfolioGroundingService.build(
      'Integration Architect',
      'Apex integration'
    );
    Test.stopTest();

    Assert.isNotNull(grounding, 'Facts returned');
    Assert.isTrue(
      grounding.length() <= PortfolioGroundingService.MAX_CHARS,
      'Under the cap: ' + grounding.length()
    );
    Assert.isFalse(grounding.contains('@'), 'No email reaches the prompt');
    Assert.isFalse(
      PHONE_SHAPE.matcher(grounding).find(),
      'No phone number reaches the prompt'
    );
    List<Object> facts = (List<Object>) parse(grounding).get('projects');
    // Five full projects run past the cap, so the last ones are dropped to fit.
    Assert.isTrue(
      facts.size() < PortfolioGroundingService.MAX_PROJECTS,
      'Projects dropped to fit the cap: ' + facts.size()
    );
    Assert.isFalse(facts.isEmpty(), 'Some facts still fit');
  }

  @IsTest
  static void matchingProjectRanksFirstAndCarriesItsSkills() {
    List<Project__c> projects = new List<Project__c>{
      project(1, 'Marketing website refresh'),
      project(2, 'Event driven Kafka pipeline')
    };
    insert projects;
    Skill__c skill = new Skill__c(
      Is_Verified__c = true,
      Name = 'Kafka',
      Category__c = 'Integration',
      Category_Order__c = 1
    );
    insert skill;
    insert new Project_Skill__c(
      Project__c = projects[1].Id,
      Skill__c = skill.Id
    );

    Test.startTest();
    String grounding = PortfolioGroundingService.build(
      'Integration Engineer',
      'Kafka pipeline'
    );
    Test.stopTest();

    List<Object> facts = (List<Object>) parse(grounding).get('projects');
    Map<String, Object> first = (Map<String, Object>) facts[0];
    Assert.areEqual('Project 2', first.get('name'), 'Best match first');
    List<Object> skills = (List<Object>) first.get('skills');
    Assert.areEqual(1, skills.size(), 'One skill attached');
    Assert.areEqual('Kafka', skills[0], 'Skill name');
  }

  @IsTest
  static void highlightsCarryRoleAndEmployerAndNoPii() {
    Account employer = new Account(Name = 'Acme Corp');
    insert employer;
    Experience__c role = new Experience__c(
      Name = 'Platform Architect',
      Sort_Order__c = 1,
      Employer__c = employer.Id,
      Is_Current_Role__c = true
    );
    insert role;
    insert new Experience_Highlight__c(
      Is_Verified__c = true,
      Name = 'Highlight',
      Experience__c = role.Id,
      Description__c = 'Led an API program, reach me at ' + SENTINEL_EMAIL,
      Persona_Tag__c = 'Architect',
      Sort_Order__c = 1,
      Lock_Sort_Across_Personas__c = false
    );

    Test.startTest();
    String grounding = PortfolioGroundingService.build('Architect', null);
    Test.stopTest();

    List<Object> facts = (List<Object>) parse(grounding).get('highlights');
    Map<String, Object> first = (Map<String, Object>) facts[0];
    Assert.areEqual('Platform Architect', first.get('role'), 'Role');
    Assert.areEqual('Acme Corp', first.get('employer'), 'Employer');
    Assert.isTrue(
      ((String) first.get('text')).contains(PortfolioGroundingService.REMOVED),
      'Email replaced'
    );
    Assert.isFalse(grounding.contains('@'), 'No email');
  }

  @IsTest
  static void guestGetsHighlightsAndProjectsWithoutPii() {
    User guest = SiteGuestTestSupport.preparedGuest();
    Account employer = new Account(Name = 'Acme Corp');
    insert employer;
    Experience__c role = new Experience__c(
      Name = 'Platform Architect',
      Sort_Order__c = 1,
      Employer__c = employer.Id,
      Is_Current_Role__c = true
    );
    insert role;
    insert new Experience_Highlight__c(
      Is_Verified__c = true,
      Name = 'Highlight',
      Experience__c = role.Id,
      Description__c = 'Led an API program, call ' + SENTINEL_PHONE,
      Persona_Tag__c = 'Architect',
      Sort_Order__c = 1,
      Lock_Sort_Across_Personas__c = false
    );
    insert project(1, 'Architect challenge');

    String grounding;
    Test.startTest();
    System.runAs(guest) {
      grounding = PortfolioGroundingService.build('Architect', null);
    }
    Test.stopTest();

    Assert.isNotNull(grounding, 'The guest gets facts');
    Map<String, Object> facts = parse(grounding);
    Assert.isFalse(
      ((List<Object>) facts.get('highlights')).isEmpty(),
      'Highlights reach the guest through the without sharing selector'
    );
    Assert.isFalse(
      ((List<Object>) facts.get('projects')).isEmpty(),
      'Featured projects reach the guest'
    );
    Assert.isFalse(grounding.contains('@'), 'No email');
    Assert.isFalse(PHONE_SHAPE.matcher(grounding).find(), 'No phone');
  }

  @IsTest
  static void nothingToGroundOnReturnsNull() {
    Test.startTest();
    String grounding = PortfolioGroundingService.build(null, null);
    Test.stopTest();

    Assert.isNull(grounding, 'No records, no facts');
  }

  @IsTest
  static void cleanCutsLongTextAndKeepsYearRanges() {
    String cleaned = PortfolioGroundingService.clean(
      'Delivered 2019-2023 ' + 'x'.repeat(900)
    );

    Assert.isTrue(cleaned.startsWith('Delivered 2019-2023'), cleaned);
    Assert.areEqual(
      PortfolioGroundingService.MAX_TEXT_CHARS,
      cleaned.length(),
      'Cut to the limit'
    );
  }

  @IsTest
  static void cleanHandlesAVeryLongWordWithAnEmailAndAPhone() {
    // One 32,000 character word, the Long Text Area maximum, used to hit the regex limit.
    String text =
      'Call ' +
      SENTINEL_PHONE +
      ' or ' +
      SENTINEL_EMAIL +
      ' ' +
      'y'.repeat(15000) +
      '@' +
      'z'.repeat(16900);

    Test.startTest();
    String cleaned = PortfolioGroundingService.clean(text);
    Test.stopTest();

    Assert.isTrue(
      cleaned.length() <= PortfolioGroundingService.MAX_TEXT_CHARS,
      'Cut to the limit'
    );
    Assert.isFalse(cleaned.contains('@'), 'No email survives');
    Assert.isFalse(PHONE_SHAPE.matcher(cleaned).find(), 'No phone survives');
    Assert.isTrue(cleaned.startsWith('Call [removed] or [removed]'), cleaned);
  }

  @IsTest
  static void buildHandlesVeryLongRecordAndJobText() {
    insert project(1, 'Apex '.repeat(6000) + 'x'.repeat(2000));
    String description = 'integration '.repeat(2500) + 'q'.repeat(5000);

    Test.startTest();
    String grounding = PortfolioGroundingService.build(
      'Architect',
      description
    );
    Test.stopTest();

    Assert.isNotNull(grounding, 'Facts returned');
    Assert.isTrue(
      grounding.length() <= PortfolioGroundingService.MAX_CHARS,
      'Under the cap'
    );
    Assert.isFalse(grounding.contains('@'), 'No email');
  }

  @IsTest
  static void keywordsDropStopWordsAndShortTokens() {
    Set<String> keywords = PortfolioGroundingService.keywords(
      'The Apex and LWC role at an AI team'
    );

    Assert.isTrue(keywords.contains('apex'), 'Kept');
    Assert.isTrue(keywords.contains('lwc'), 'Kept');
    Assert.isFalse(keywords.contains('the'), 'Stop word');
    Assert.isFalse(keywords.contains('ai'), 'Too short');
  }

  @IsTest
  static void aSkillShowsItsDisplayNameWhenItHasOne() {
    Project__c featured = project(1, 'Kafka pipeline');
    insert featured;
    Skill__c skill = new Skill__c(
      Is_Verified__c = true,
      Name = 'Kafka',
      Display_Name__c = 'Event streaming',
      Category__c = 'Integration',
      Category_Order__c = 1
    );
    insert skill;
    insert new Project_Skill__c(Project__c = featured.Id, Skill__c = skill.Id);

    String grounding = PortfolioGroundingService.build('Engineer', 'Kafka');

    List<Object> facts = (List<Object>) parse(grounding).get('projects');
    List<Object> skills = (List<Object>) ((Map<String, Object>) facts[0])
      .get('skills');
    Assert.areEqual('Event streaming', skills[0], 'The display name is used');
  }

  @IsTest
  static void keywordsStopAtTheLimit() {
    List<String> words = new List<String>();
    for (Integer i = 0; i < 200; i++) {
      words.add('keyword' + String.valueOf(1000 + i));
    }

    Set<String> keywords = PortfolioGroundingService.keywords(
      String.join(words, ' ')
    );

    Assert.areEqual(60, keywords.size(), 'No more than 60 keywords are kept');
  }

  @IsTest
  static void aJobWithNoWordsStillGroundsOnTheFeaturedWork() {
    Account employer = new Account(Name = 'Acme Corp');
    insert employer;
    Experience__c role = new Experience__c(
      Name = 'Platform Architect',
      Sort_Order__c = 1,
      Employer__c = employer.Id,
      Is_Current_Role__c = true
    );
    insert role;
    insert new Experience_Highlight__c(
      Is_Verified__c = true,
      Name = 'Highlight',
      Experience__c = role.Id,
      Description__c = 'Led an API program',
      Persona_Tag__c = 'Architect',
      Sort_Order__c = 1,
      Lock_Sort_Across_Personas__c = false
    );
    insert project(1, 'Anything');

    String grounding = PortfolioGroundingService.build(null, null);

    Assert.isNotNull(grounding, 'Facts return with nothing to match on');
    Assert.areEqual(
      1,
      ((List<Object>) parse(grounding).get('highlights')).size(),
      'The highlight is still listed'
    );
  }

  @IsTest
  static void highlightsAreDroppedFirstWhenTheFactsExceedTheCap() {
    Account employer = new Account(Name = 'Acme Corp');
    insert employer;
    Experience__c role = new Experience__c(
      Name = 'Platform Architect',
      Sort_Order__c = 1,
      Employer__c = employer.Id,
      Is_Current_Role__c = true
    );
    insert role;
    List<Experience_Highlight__c> highlights = new List<Experience_Highlight__c>();
    for (Integer i = 1; i <= 8; i++) {
      highlights.add(
        new Experience_Highlight__c(
          Is_Verified__c = true,
          Name = 'Highlight ' + i,
          Experience__c = role.Id,
          Description__c = ('Highlight ' + i + ' ').repeat(80),
          Persona_Tag__c = 'Architect',
          Sort_Order__c = i,
          Lock_Sort_Across_Personas__c = false
        )
      );
    }
    insert highlights;
    List<Project__c> projects = new List<Project__c>();
    for (Integer i = 1; i <= PortfolioGroundingService.MAX_PROJECTS; i++) {
      Project__c longProject = project(i, ('Challenge ' + i + ' ').repeat(100));
      longProject.Solution__c = ('Solution ' + i + ' ').repeat(100);
      longProject.Business_Value__c = ('Value ' + i + ' ').repeat(100);
      projects.add(longProject);
    }
    insert projects;

    String grounding = PortfolioGroundingService.build('Architect', null);

    Assert.isNotNull(grounding, 'Facts return');
    Assert.isTrue(
      grounding.length() <= PortfolioGroundingService.MAX_CHARS,
      'Under the cap'
    );
    Assert.isTrue(
      ((List<Object>) parse(grounding).get('highlights')).size() <
      PortfolioGroundingService.MAX_HIGHLIGHTS,
      'Highlights are dropped from the end before any project is'
    );
  }

  @IsTest
  static void aHighlightWithNoTextIsLeftOut() {
    Account employer = new Account(Name = 'Acme Corp');
    insert employer;
    Experience__c role = new Experience__c(
      Name = 'Platform Architect',
      Sort_Order__c = 1,
      Employer__c = employer.Id,
      Is_Current_Role__c = true
    );
    insert role;
    insert new List<Experience_Highlight__c>{
      new Experience_Highlight__c(
        Is_Verified__c = true,
        Name = 'Empty highlight',
        Experience__c = role.Id,
        Persona_Tag__c = 'Architect',
        Sort_Order__c = 1,
        Lock_Sort_Across_Personas__c = false
      ),
      new Experience_Highlight__c(
        Is_Verified__c = true,
        Name = 'Real highlight',
        Experience__c = role.Id,
        Description__c = 'Led an API program',
        Persona_Tag__c = 'Architect',
        Sort_Order__c = 2,
        Lock_Sort_Across_Personas__c = false
      )
    };
    insert project(1, 'Anything');

    String grounding = PortfolioGroundingService.build('Architect', null);

    List<Object> highlights = (List<Object>) parse(grounding).get('highlights');
    Assert.areEqual(
      1,
      highlights.size(),
      'Only the highlight with text is kept'
    );
  }
}
