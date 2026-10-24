/**
 * @description       : Tests for PortfolioStatsController. Each count has its own test on
 *                      rows made here, the records ship equal to their code defaults, and a
 *                      guest test runs as the real Portfolio1 site guest user to prove the
 *                      result holds counts and nothing else.
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

    Test.startTest();
    PortfolioStatsController.Stats stats = PortfolioStatsController.getStats();
    Test.stopTest();

    Assert.areEqual(3, stats.testimonialsApproved, 'Approved total');
    Assert.areEqual(2, vibe(stats, 'Professional').approved, 'Professional');
    Assert.areEqual(1, vibe(stats, 'Casual').approved, 'Casual');
  }

  @isTest
  static void countsWaitingTestimonials() {
    insertTestimonials();

    Test.startTest();
    PortfolioStatsController.Stats stats = PortfolioStatsController.getStats();
    Test.stopTest();

    Assert.areEqual(4, stats.testimonialsWaiting, 'Waiting total');
    Assert.areEqual(1, vibe(stats, 'Professional').waiting, 'Professional');
    Assert.areEqual(3, vibe(stats, 'Casual').waiting, 'Casual');
  }

  @isTest
  static void listsEveryVibeEvenWithNoTestimonials() {
    Test.startTest();
    PortfolioStatsController.Stats stats = PortfolioStatsController.getStats();
    Test.stopTest();

    Assert.areEqual(2, stats.testimonialsByVibe.size(), 'Both vibes listed');
    Assert.areEqual('Professional', stats.testimonialsByVibe[0].vibe, 'Order');
    Assert.areEqual(0, stats.testimonialsByVibe[0].approved, 'No approved');
    Assert.areEqual(0, stats.testimonialsByVibe[1].waiting, 'No waiting');
    Assert.areEqual(0, stats.testimonialsApproved, 'Approved total');
    Assert.areEqual(0, stats.testimonialsWaiting, 'Waiting total');
  }

  @isTest
  static void countsDeployRunsOnly() {
    insert new List<Pipeline_Run__c>{
      run(DEPLOY, 10, Datetime.now().addDays(-2)),
      run(DEPLOY, null, Datetime.now().addDays(-1)),
      run(GovernanceEventHandler.WORKFLOW_HEARTBEAT, null, Datetime.now())
    };

    Test.startTest();
    PortfolioStatsController.Stats stats = PortfolioStatsController.getStats();
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
    insert new List<Pipeline_Run__c>{
      older,
      newest,
      // A newer deploy with no test result is skipped.
      run(DEPLOY, null, Datetime.now()),
      // A heartbeat is never a deploy.
      run(GovernanceEventHandler.WORKFLOW_HEARTBEAT, 5, Datetime.now())
    };

    Test.startTest();
    PortfolioStatsController.Stats stats = PortfolioStatsController.getStats();
    Test.stopTest();

    Assert.areEqual(965, stats.latestTestsRun, 'Tests run');
    Assert.areEqual(964, stats.latestTestsPassed, 'Tests passed');
    Assert.areEqual(98, stats.latestCoverage, 'Coverage');
  }

  @isTest
  static void leavesTheTestNumbersEmptyWithNoDeploy() {
    Test.startTest();
    PortfolioStatsController.Stats stats = PortfolioStatsController.getStats();
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

    Test.startTest();
    PortfolioStatsController.Stats stats = PortfolioStatsController.getStats();
    Test.stopTest();

    Assert.areEqual(2, stats.tokensIssued, 'Only issued tokens count');
  }

  @isTest
  static void aFailedReadReturnsAPlainError() {
    PortfolioStatsController.throwForTest = true;

    Test.startTest();
    try {
      PortfolioStatsController.getStats();
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

    // The waiting rows stay hidden from the guest's own reads, yet they are counted.
    Assert.areEqual(4, stats.testimonialsWaiting, 'Waiting counted');
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
        'testimonialsWaiting',
        'testimonialsByVibe',
        'deployRuns',
        'latestTestsRun',
        'latestTestsPassed',
        'latestCoverage',
        'tokensIssued'
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

    Assert.areEqual(5, defaults.size(), 'Five reads');
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
    Test.startTest();
    PortfolioStatsController.getStats();
    Test.stopTest();

    for (
      String name : new PortfolioStatsController().queryDefaults().keySet()
    ) {
      Assert.areEqual(
        'record',
        QueryDefinitions.sourceByName.get(name),
        name + ' is read through its record'
      );
    }
  }

  private static String normal(String text) {
    return text == null ? '' : text.normalizeSpace();
  }
}
