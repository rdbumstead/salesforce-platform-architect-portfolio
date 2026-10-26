/**
 * @description       : Tests for PortfolioStatsController. Each count has its own test on
 *                      rows made here, the records ship equal to their code defaults, and a
 *                      guest test runs as the real Portfolio1 site guest user to prove the
 *                      result holds counts and nothing else. The other tests read as a user
 *                      made here with Portfolio_Admin, so they never lean on the org's own
 *                      assignments.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/24/2026
 **/
@isTest
private class PortfolioStatsControllerTest {
  private static final String DEPLOY = GovernanceEventHandler.WORKFLOW_DEPLOY;
  private static final String AUTHOR_SENTINEL = 'Sentinel Author Zq';
  private static final String NOTE_SENTINEL = 'sentinel note text zq';

  // An internal reader made inside the test, with Portfolio_Admin assigned here, so the
  // approved read in user mode never depends on what the org has assigned.
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
      Username = 'reader.' + Crypto.getRandomInteger() + '@example.com.stats'
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

  private static PortfolioStatsController.Stats statsAs(User reader) {
    PortfolioStatsController.Stats stats;
    System.runAs(reader) {
      stats = PortfolioStatsController.getStats();
    }
    return stats;
  }

  private static Testimonial__c testimonial(String vibe, Boolean approved) {
    return new Testimonial__c(
      Author_Name__c = AUTHOR_SENTINEL,
      Author_Title__c = 'Sentinel Title',
      Context__c = 'Sentinel context',
      Note__c = NOTE_SENTINEL,
      Vibe_Mode__c = vibe,
      Approved__c = approved
    );
  }

  private static Pipeline_Run__c run(
    String workflow,
    Integer testsRun,
    Datetime completedAt
  ) {
    return new Pipeline_Run__c(
      Workflow__c = workflow,
      Status__c = 'Success',
      Tests_Run__c = testsRun,
      Tests_Passed__c = testsRun,
      Org_Coverage__c = testsRun == null ? null : 95,
      Completed_At__c = completedAt
    );
  }

  private static void insertTestimonials() {
    insert new List<Testimonial__c>{
      testimonial('Professional', true),
      testimonial('Professional', true),
      testimonial('Casual', true),
      testimonial('Professional', false),
      testimonial('Casual', false),
      testimonial('Casual', false),
      testimonial('Casual', false)
    };
  }

  private static PortfolioStatsController.VibeCount vibe(
    PortfolioStatsController.Stats stats,
    String label
  ) {
    for (PortfolioStatsController.VibeCount entry : stats.testimonialsByVibe) {
      if (entry.vibe == label) {
        return entry;
      }
    }
    Assert.fail('No entry for vibe ' + label);
    return null;
  }

  @isTest
  static void countsApprovedTestimonials() {
    insertTestimonials();

    User reader = adminReader();

    Test.startTest();
    PortfolioStatsController.Stats stats = statsAs(reader);
    Test.stopTest();

    Assert.areEqual(3, stats.testimonialsApproved, 'Approved total');
    Assert.areEqual(2, vibe(stats, 'Professional').approved, 'Professional');
    Assert.areEqual(1, vibe(stats, 'Casual').approved, 'Casual');
  }

  @isTest
  static void neverReturnsTheWaitingCount() {
    insertTestimonials();

    User reader = adminReader();

    Test.startTest();
    PortfolioStatsController.Stats stats = statsAs(reader);
    Test.stopTest();

    Assert.areEqual(
      3,
      stats.testimonialsApproved,
      'Approved are still counted'
    );
    Assert.isFalse(
      JSON.serialize(stats).containsIgnoreCase('waiting'),
      'No waiting count in the answer: ' + JSON.serialize(stats)
    );
  }

  @isTest
  static void listsEveryVibeEvenWithNoTestimonials() {
    User reader = adminReader();

    Test.startTest();
    PortfolioStatsController.Stats stats = statsAs(reader);
    Test.stopTest();

    Assert.areEqual(2, stats.testimonialsByVibe.size(), 'Both vibes listed');
    Assert.areEqual('Professional', stats.testimonialsByVibe[0].vibe, 'Order');
    Assert.areEqual(0, stats.testimonialsByVibe[0].approved, 'No approved');
    Assert.areEqual(0, stats.testimonialsApproved, 'Approved total');
  }

  @isTest
  static void countsDeployRunsOnly() {
    insert new List<Pipeline_Run__c>{
      run(DEPLOY, 10, Datetime.now().addDays(-2)),
      run(DEPLOY, null, Datetime.now().addDays(-1)),
      run(GovernanceEventHandler.WORKFLOW_HEARTBEAT, null, Datetime.now())
    };

    User reader = adminReader();

    Test.startTest();
    PortfolioStatsController.Stats stats = statsAs(reader);
    Test.stopTest();

    Assert.areEqual(2, stats.deployRuns, 'Heartbeat runs are not deploys');
  }

  @isTest
  static void readsTheNewestDeployWithATestResult() {
    Pipeline_Run__c older = run(DEPLOY, 900, Datetime.now().addDays(-3));
    older.Org_Coverage__c = 97;
    Pipeline_Run__c newest = run(DEPLOY, 965, Datetime.now().addDays(-1));
    newest.Tests_Passed__c = 964;
    newest.Org_Coverage__c = 98;
    older.Jest_Tests_Run__c = 700;
    older.Jest_Tests_Passed__c = 700;
    newest.Jest_Tests_Run__c = 748;
    newest.Jest_Tests_Passed__c = 747;
    insert new List<Pipeline_Run__c>{
      older,
      newest,
      // A newer deploy with no test result is skipped.
      run(DEPLOY, null, Datetime.now()),
      // A heartbeat is never a deploy.
      run(GovernanceEventHandler.WORKFLOW_HEARTBEAT, 5, Datetime.now())
    };

    User reader = adminReader();

    Test.startTest();
    PortfolioStatsController.Stats stats = statsAs(reader);
    Test.stopTest();

    Assert.areEqual(965, stats.latestTestsRun, 'Tests run');
    Assert.areEqual(964, stats.latestTestsPassed, 'Tests passed');
    Assert.areEqual(98, stats.latestCoverage, 'Coverage');
    Assert.areEqual(748, stats.latestJestRun, 'Jest run');
    Assert.areEqual(747, stats.latestJestPassed, 'Jest passed');
  }

  @isTest
  static void leavesTheJestNumbersEmptyWhenTheNewestDeployHasNone() {
    insert run(DEPLOY, 965, Datetime.now());

    User reader = adminReader();

    Test.startTest();
    PortfolioStatsController.Stats stats = statsAs(reader);
    Test.stopTest();

    Assert.areEqual(965, stats.latestTestsRun, 'Apex still shows');
    Assert.isNull(stats.latestJestRun, 'No Jest run');
    Assert.isNull(stats.latestJestPassed, 'No Jest passed');
  }

  private static Usage_Counter__c usage(String kind, Date day, Integer count) {
    return new Usage_Counter__c(
      Kind__c = kind,
      Day__c = day,
      Count__c = count,
      Key__c = kind + ':' + String.valueOf(day)
    );
  }

  @isTest
  static void sumsEachKindAndReadsTheEarliestDay() {
    insert new List<Usage_Counter__c>{
      usage('Cover_Letter', Date.newInstance(2026, 11, 3), 4),
      usage('Cover_Letter', Date.newInstance(2026, 10, 28), 2),
      usage('Api_Lab_Request', Date.newInstance(2026, 11, 3), 30),
      usage('Api_Lab_Request', Date.newInstance(2026, 11, 4), 12)
    };

    User reader = adminReader();

    Test.startTest();
    PortfolioStatsController.Stats stats = statsAs(reader);
    Test.stopTest();

    Assert.areEqual(6, stats.coverLettersWritten, 'Letters');
    Assert.areEqual(42, stats.apiLabRequests, 'Requests');
    Assert.areEqual(
      Date.newInstance(2026, 10, 28),
      stats.countingSince,
      'The earliest day on any row'
    );
  }

  @isTest
  static void showsZeroAndNoMonthWhenNothingIsCounted() {
    User reader = adminReader();

    Test.startTest();
    PortfolioStatsController.Stats stats = statsAs(reader);
    Test.stopTest();

    Assert.areEqual(0, stats.coverLettersWritten, 'Letters');
    Assert.areEqual(0, stats.apiLabRequests, 'Requests');
    Assert.isNull(stats.countingSince, 'No month');
  }

  @isTest
  static void countsFromTheWriterRowsEndToEnd() {
    UsageCounterWriter.record(UsageCounterWriter.KIND_COVER_LETTER);
    UsageCounterWriter.record(UsageCounterWriter.KIND_COVER_LETTER);
    UsageCounterWriter.record(UsageCounterWriter.KIND_API_LAB_REQUEST);

    User reader = adminReader();

    Test.startTest();
    PortfolioStatsController.Stats stats = statsAs(reader);
    Test.stopTest();

    Assert.areEqual(2, stats.coverLettersWritten, 'Letters');
    Assert.areEqual(1, stats.apiLabRequests, 'Requests');
    Assert.isNotNull(stats.countingSince, 'A month to show');
  }

  @isTest
  static void leavesTheTestNumbersEmptyWithNoDeploy() {
    User reader = adminReader();

    Test.startTest();
    PortfolioStatsController.Stats stats = statsAs(reader);
    Test.stopTest();

    Assert.areEqual(0, stats.deployRuns, 'No deploys');
    Assert.isNull(stats.latestTestsRun, 'Tests run');
    Assert.isNull(stats.latestTestsPassed, 'Tests passed');
    Assert.isNull(stats.latestCoverage, 'Coverage');
  }

  @isTest
  static void countsIssuedTokensOnly() {
    insert new List<API_Access_Request__c>{
      new API_Access_Request__c(
        Outcome__c = PortfolioStatsController.OUTCOME_ISSUED
      ),
      new API_Access_Request__c(
        Outcome__c = PortfolioStatsController.OUTCOME_ISSUED
      ),
      new API_Access_Request__c(Outcome__c = 'Rate_Limited'),
      new API_Access_Request__c(Outcome__c = 'Cap_Reached')
    };

    User reader = adminReader();

    Test.startTest();
    PortfolioStatsController.Stats stats = statsAs(reader);
    Test.stopTest();

    Assert.areEqual(2, stats.tokensIssued, 'Only issued tokens count');
  }

  @isTest
  static void aFailedReadReturnsAPlainError() {
    PortfolioStatsController.throwForTest = true;

    User reader = adminReader();

    Test.startTest();
    try {
      statsAs(reader);
      Assert.fail('Expected an AuraHandledException');
    } catch (AuraHandledException e) {
      Assert.areEqual(
        'The numbers could not be loaded.',
        e.getMessage(),
        'No detail reaches the page'
      );
    }
    Test.stopTest();
  }

  @isTest
  static void theGuestGetsCountsAndNothingElse() {
    insertTestimonials();
    insert run(DEPLOY, 965, Datetime.now());
    insert new API_Access_Request__c(
      Outcome__c = PortfolioStatsController.OUTCOME_ISSUED,
      Email__c = 'leak.sentinel@example.com'
    );
    User guest = SiteGuestTestSupport.preparedGuest();
    PortfolioStatsController.Stats stats;

    Test.startTest();
    System.runAs(guest) {
      stats = PortfolioStatsController.getStats();
    }
    Test.stopTest();

    Assert.areEqual(1, stats.deployRuns, 'Deploys counted');
    Assert.areEqual(965, stats.latestTestsRun, 'Tests run');
    Assert.areEqual(1, stats.tokensIssued, 'Tokens counted');

    String shape = JSON.serialize(stats);
    for (
      String leak : new List<String>{
        AUTHOR_SENTINEL,
        NOTE_SENTINEL,
        'Sentinel Title',
        'Sentinel context',
        'leak.sentinel',
        '@',
        '"Id"',
        '"attributes"'
      }
    ) {
      Assert.isFalse(shape.contains(leak), 'The result holds no ' + leak);
    }
    Map<String, Object> top = (Map<String, Object>) JSON.deserializeUntyped(
      shape
    );
    Assert.areEqual(
      new Set<String>{
        'testimonialsApproved',
        'testimonialsByVibe',
        'deployRuns',
        'latestTestsRun',
        'latestTestsPassed',
        'latestCoverage',
        'latestJestRun',
        'latestJestPassed',
        'tokensIssued',
        'coverLettersWritten',
        'apiLabRequests',
        'countingSince'
      },
      top.keySet(),
      'Only the count keys'
    );
  }

  @isTest
  static void everyStatsReadShipsEqualToItsDefault() {
    Map<String, QueryDefinitions.QueryDefault> defaults = new PortfolioStatsController()
      .queryDefaults();
    Map<String, Query_Definition__mdt> records = new Map<String, Query_Definition__mdt>();
    for (Query_Definition__mdt record : [
      SELECT
        DeveloperName,
        Object__c,
        Fields__c,
        Filter__c,
        Order_By__c,
        Row_Limit__c,
        Access_Mode__c,
        Active__c
      FROM Query_Definition__mdt
      WHERE DeveloperName LIKE 'PortfolioStatsController%'
    ]) {
      records.put(record.DeveloperName, record);
    }

    Assert.areEqual(6, defaults.size(), 'Six reads');
    Assert.areEqual(defaults.keySet(), records.keySet(), 'A record per read');
    for (String name : defaults.keySet()) {
      QueryDefinitions.QueryDefault codeDefault = defaults.get(name);
      Query_Definition__mdt record = records.get(name);
      Assert.isTrue(record.Active__c, name + ' active');
      Assert.areEqual(codeDefault.objectName, record.Object__c, name);
      Assert.areEqual(
        normal(codeDefault.fieldList),
        normal(record.Fields__c),
        name + ' fields'
      );
      Assert.areEqual(
        normal(codeDefault.filterText),
        normal(record.Filter__c),
        name + ' filter'
      );
      Assert.areEqual(
        normal(codeDefault.orderByText),
        normal(record.Order_By__c),
        name + ' order'
      );
      Assert.areEqual(
        codeDefault.rowLimitValue,
        record.Row_Limit__c.intValue(),
        name + ' row limit'
      );
      Assert.areEqual(
        codeDefault.accessMode.name(),
        record.Access_Mode__c,
        name + ' access mode'
      );
    }
  }

  @isTest
  static void everyStatsReadRunsThroughItsRecord() {
    User reader = adminReader();

    Test.startTest();
    statsAs(reader);
    Test.stopTest();

    // The waiting read is kept only so its shipped record has a default. Nothing runs it.
    Set<String> names = new Set<String>(
      new PortfolioStatsController().queryDefaults().keySet()
    );
    names.remove(PortfolioStatsController.WAITING_QUERY);
    Assert.areEqual(5, names.size(), 'Five reads are in use');
    for (String name : names) {
      Assert.areEqual(
        'record',
        QueryDefinitions.sourceByName.get(name),
        name + ' is read through its record'
      );
    }
    Assert.isNull(
      QueryDefinitions.sourceByName.get(PortfolioStatsController.WAITING_QUERY),
      'The waiting read no longer runs'
    );
  }

  private static String normal(String text) {
    return text == null ? '' : text.normalizeSpace();
  }
}
