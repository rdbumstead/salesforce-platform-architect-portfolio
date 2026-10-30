/**
 * @description       : Tests for ProjectCardController's home page reads: getHomeCaseStudies
 *                      (the case study cards chosen by Home_Sort__c alone) and getBuildCounts
 *                      (the newest successful run's Apex, coverage and Jest numbers). The Case
 *                      Metric fields and the Production deploys source are covered here too.
 *                      Builds its own Project__c and Pipeline_Run__c rows, because TestFactory
 *                      is shared and stays unchanged. Every read here runs in system mode, so
 *                      the guest test proves the site guest needs no field grant.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/26/2026
 **/
@IsTest
private class ProjectCardControllerHomeTest {
  private static final String TESTS_LABEL = 'passing at the last deploy, with {coverage}% org-wide coverage';

  private static Project__c homeProject(
    String name,
    Integer homeSort,
    Boolean featured
  ) {
    return new Project__c(
      Name = name,
      Home_Sort__c = homeSort,
      Is_Featured__c = featured,
      Sort_Order__c = 1
    );
  }

  private static Pipeline_Run__c run(
    String runId,
    Integer testsPassed,
    Decimal coverage,
    Integer jestPassed
  ) {
    return new Pipeline_Run__c(
      Run_Key__c = 'deploy:' + runId,
      Workflow__c = 'deploy',
      Status__c = 'Success',
      Run_Id__c = runId,
      Completed_At__c = Datetime.now(),
      Tests_Run__c = testsPassed,
      Tests_Passed__c = testsPassed,
      Org_Coverage__c = coverage,
      Jest_Tests_Run__c = jestPassed,
      Jest_Tests_Passed__c = jestPassed
    );
  }

  private static List<String> titlesOf(
    List<ProjectCardController.CaseStudy> cards
  ) {
    List<String> titles = new List<String>();
    for (ProjectCardController.CaseStudy card : cards) {
      titles.add(card.title);
    }
    return titles;
  }

  @IsTest
  static void shouldReturnAnEmptyListWhenNoProjectHasAHomeSort() {
    insert homeProject('Not on home', null, true);

    Test.startTest();
    List<ProjectCardController.CaseStudy> cards = ProjectCardController.getHomeCaseStudies();
    Test.stopTest();

    Assert.isNotNull(cards, 'The list is never null');
    Assert.areEqual(0, cards.size(), 'No Home_Sort__c means no cards');
  }

  @IsTest
  static void shouldOrderByHomeSortAndIgnoreIsFeatured() {
    insert new List<Project__c>{
      homeProject('Third', 3, false),
      homeProject('First', 1, false),
      homeProject('Featured, not on home', null, true),
      homeProject('Second', 2, true)
    };

    Test.startTest();
    List<ProjectCardController.CaseStudy> cards = ProjectCardController.getHomeCaseStudies();
    Test.stopTest();

    Assert.areEqual(
      new List<String>{ 'First', 'Second', 'Third' },
      titlesOf(cards),
      'Cards follow Home_Sort__c, and a featured project without it is left out'
    );
  }

  @IsTest
  static void shouldReturnAtMostThreeCards() {
    insert new List<Project__c>{
      homeProject('One', 1, false),
      homeProject('Two', 2, false),
      homeProject('Three', 3, false),
      homeProject('Four', 4, false)
    };

    Test.startTest();
    List<ProjectCardController.CaseStudy> cards = ProjectCardController.getHomeCaseStudies();
    Test.stopTest();

    Assert.areEqual(
      new List<String>{ 'One', 'Two', 'Three' },
      titlesOf(cards),
      'The fourth project is not a card'
    );
  }

  @IsTest
  static void shouldBreakAHomeSortTieByName() {
    insert new List<Project__c>{
      homeProject('Beta', 1, false),
      homeProject('Alpha', 1, false)
    };

    Test.startTest();
    List<ProjectCardController.CaseStudy> cards = ProjectCardController.getHomeCaseStudies();
    Test.stopTest();

    Assert.areEqual(
      new List<String>{ 'Alpha', 'Beta' },
      titlesOf(cards),
      'Name breaks a tie'
    );
  }

  @IsTest
  static void shouldReturnEveryCardFieldTrimmedWhenSet() {
    Project__c row = homeProject('Pillar row name', 1, false);
    row.Home_Title__c = '  Choosing the right platform  ';
    row.Client_Line__c = 'Regional adult literacy nonprofit, freelance';
    row.Case_Tags__c = 'NPSP, Platform selection , ,npsp, Cost';
    row.Case_Metric__c = '$0';
    row.Case_Metric_Label__c = 'software licence cost for 10 staff users';
    row.Challenge__c = 'The problem.';
    row.Solution__c = 'The call.';
    row.Business_Value__c = 'The result.';
    row.Live_URL__c = 'https://ryanbumstead.com/nonprofit-solutions';
    insert row;

    Test.startTest();
    ProjectCardController.CaseStudy card = ProjectCardController.getHomeCaseStudies()[0];
    Test.stopTest();

    Assert.areEqual((String) row.Id, card.key, 'The key is the record Id');
    Assert.areEqual(
      'Choosing the right platform',
      card.title,
      'Home_Title__c wins over Name, trimmed'
    );
    Assert.areEqual(
      'Regional adult literacy nonprofit, freelance',
      card.clientLine,
      'Client line'
    );
    Assert.areEqual(
      new List<String>{ 'NPSP', 'Platform selection', 'Cost' },
      card.tags,
      'Tags split, trimmed, blanks and repeats dropped'
    );
    Assert.areEqual('$0', card.headlineMetric, 'Stored number');
    Assert.areEqual(
      'software licence cost for 10 staff users',
      card.headlineLabel,
      'Stored label'
    );
    Assert.areEqual(
      ProjectCardController.SOURCE_STORED,
      card.headlineSource,
      'Stored source'
    );
    Assert.areEqual('The problem.', card.challenge, 'Challenge');
    Assert.areEqual('The call.', card.solution, 'Solution');
    Assert.areEqual('The result.', card.businessValue, 'Business value');
    Assert.areEqual(
      'https://ryanbumstead.com/nonprofit-solutions',
      card.liveUrl,
      'Live URL'
    );
  }

  @IsTest
  static void shouldReturnNullsAndNoTagsWhenFieldsAreBlank() {
    insert homeProject('Only a name', 1, false);

    Test.startTest();
    ProjectCardController.CaseStudy card = ProjectCardController.getHomeCaseStudies()[0];
    Test.stopTest();

    Assert.areEqual('Only a name', card.title, 'Name when no Home_Title__c');
    Assert.isNull(card.clientLine, 'Blank client line');
    Assert.isNull(card.headlineMetric, 'Blank number');
    Assert.isNull(card.headlineLabel, 'Blank label');
    Assert.isNull(card.headlineSource, 'No source');
    Assert.isNull(card.challenge, 'Blank challenge');
    Assert.isNull(card.solution, 'Blank solution');
    Assert.isNull(card.businessValue, 'Blank business value');
    Assert.isNull(card.liveUrl, 'Blank link');
    Assert.areEqual(0, card.tags.size(), 'No tags');
  }

  @IsTest
  static void shouldShowTheLiveApexCountInPlaceOfTheStoredNumber() {
    insert run('7', 1000, 98.6, 747);
    Project__c row = homeProject('Building this site', 3, true);
    row.Case_Metric__c = '646 Apex tests';
    row.Case_Metric_Label__c = TESTS_LABEL;
    row.Case_Metric_Source__c = ProjectCardController.SOURCE_APEX_TESTS;
    insert row;

    Test.startTest();
    ProjectCardController.CaseStudy card = ProjectCardController.getHomeCaseStudies()[0];
    Test.stopTest();

    Assert.areEqual(
      '1000 Apex tests',
      card.headlineMetric,
      'The newest run replaces the stored number'
    );
    Assert.areEqual(
      'passing at the last deploy, with 98% org-wide coverage',
      card.headlineLabel,
      'Coverage filled, rounded down'
    );
    Assert.areEqual(
      ProjectCardController.SOURCE_APEX_TESTS,
      card.headlineSource,
      'Named source'
    );
  }

  @IsTest
  static void shouldHideTheHeadlineWhenTheLiveCountIsMissingForItsToken() {
    Project__c row = homeProject('Building this site', 1, false);
    row.Case_Metric__c = '646 Apex tests';
    row.Case_Metric_Label__c = TESTS_LABEL;
    row.Case_Metric_Source__c = ProjectCardController.SOURCE_APEX_TESTS;
    insert row;

    Test.startTest();
    ProjectCardController.CaseStudy card = ProjectCardController.getHomeCaseStudies()[0];
    Test.stopTest();

    Assert.isNull(card.headlineMetric, 'A stale number is never shown');
    Assert.isNull(card.headlineLabel, 'A raw token is never shown');
  }

  @IsTest
  static void shouldReturnTheSameCardsForTheSiteGuest() {
    insert run('7', 1000, 98, null);
    Project__c row = homeProject('Building this site', 1, false);
    row.Case_Metric__c = '646 Apex tests';
    row.Case_Metric_Source__c = ProjectCardController.SOURCE_APEX_TESTS;
    row.Client_Line__c = 'Personal project, open source';
    row.Case_Tags__c = 'Experience Cloud, CI/CD';
    insert row;
    String asAdmin = JSON.serialize(ProjectCardController.getHomeCaseStudies());
    User guest = SiteGuestTestSupport.preparedGuest();

    String asGuest;
    Test.startTest();
    System.runAs(guest) {
      asGuest = JSON.serialize(ProjectCardController.getHomeCaseStudies());
    }
    Test.stopTest();

    Assert.areEqual(asAdmin, asGuest, 'The guest sees the same cards');
    Assert.isTrue(
      asGuest.contains('1000 Apex tests'),
      'Computed for the guest'
    );
    Assert.isTrue(
      asGuest.contains('Personal project, open source'),
      'New fields reach the guest through the card shape'
    );
  }

  @IsTest
  static void shouldReturnNoCountsWhenNoSuccessfulRunExists() {
    Test.startTest();
    ProjectCardController.BuildCounts counts = ProjectCardController.getBuildCounts();
    Test.stopTest();

    Assert.isNotNull(counts, 'Never null');
    Assert.isNull(counts.apexPassed, 'No Apex count');
    Assert.isNull(counts.coverage, 'No coverage');
    Assert.isNull(counts.jestPassed, 'No Jest count');
  }

  @IsTest
  static void shouldReturnTheNewestRunsApexCoverageAndJestCounts() {
    insert run('7', 1000, 98.9, 747);

    Test.startTest();
    ProjectCardController.BuildCounts counts = ProjectCardController.getBuildCounts();
    Test.stopTest();

    Assert.areEqual(1000, counts.apexPassed, 'Passed Apex tests');
    Assert.areEqual(98, counts.coverage, 'Coverage rounded down');
    Assert.areEqual(747, counts.jestPassed, 'Passed Jest tests');
  }

  @IsTest
  static void shouldLeaveJestOutWhenTheRunHasNoJestCount() {
    insert run('7', 1000, 98, null);

    Test.startTest();
    ProjectCardController.BuildCounts counts = ProjectCardController.getBuildCounts();
    Test.stopTest();

    Assert.areEqual(1000, counts.apexPassed, 'Passed Apex tests');
    Assert.isNull(
      counts.jestPassed,
      'No Jest count before the deploy records one'
    );
  }

  @IsTest
  static void shouldReturnTheSameCountsForTheSiteGuest() {
    insert run('7', 1000, 98, 747);
    User guest = SiteGuestTestSupport.preparedGuest();

    ProjectCardController.BuildCounts counts;
    Test.startTest();
    System.runAs(guest) {
      counts = ProjectCardController.getBuildCounts();
    }
    Test.stopTest();

    Assert.areEqual(1000, counts.apexPassed, 'The guest reads the Apex count');
    Assert.areEqual(747, counts.jestPassed, 'The guest reads the Jest count');
  }

  private static Pipeline_Run__c deployRun(String runId, String status) {
    return new Pipeline_Run__c(
      Run_Key__c = 'deploy:' + runId,
      Workflow__c = 'deploy',
      Status__c = status,
      Run_Id__c = runId,
      Completed_At__c = Datetime.now()
    );
  }

  @IsTest
  static void shouldShowNoNumberOnACardWhoseCaseMetricIsBlankEvenWithAHeadline() {
    Project__c row = homeProject('Has a headline only', 1, false);
    row.Headline_Metric__c = '9 objects';
    row.Headline_Metric_Label__c = 'in the data model';
    row.Headline_Metric_Source__c = ProjectCardController.SOURCE_APEX_TESTS;
    insert row;
    insert run('7', 1000, 98, null);

    Test.startTest();
    ProjectCardController.CaseStudy card = ProjectCardController.getHomeCaseStudies()[0];
    Test.stopTest();

    Assert.isNull(
      card.headlineMetric,
      'The Headline number never reaches a card'
    );
    Assert.isNull(
      card.headlineLabel,
      'The Headline label never reaches a card'
    );
    Assert.isNull(card.headlineSource, 'No source');
  }

  @IsTest
  static void shouldKeepTheHeadlineFieldsOnThePillarCards() {
    Project__c row = new Project__c(
      Name = 'Pillar row',
      Pillar__c = 'A',
      Sort_Order__c = 1,
      Home_Sort__c = 1,
      Headline_Metric__c = '9 objects',
      Headline_Metric_Label__c = 'in the data model',
      Case_Metric__c = '8',
      Case_Metric_Label__c = 'steps of an inquiry'
    );
    insert row;

    Test.startTest();
    ProjectCardController.PillarCard pillar = ProjectCardController.getPillarCards()[0];
    ProjectCardController.CaseStudy home = ProjectCardController.getHomeCaseStudies()[0];
    Test.stopTest();

    Assert.areEqual(
      '9 objects',
      pillar.headlineMetric,
      'The pillar keeps the Headline number'
    );
    Assert.areEqual(
      'in the data model',
      pillar.headlineLabel,
      'The pillar keeps the Headline label'
    );
    Assert.areEqual(
      '8',
      home.headlineMetric,
      'The home card shows the Case number'
    );
    Assert.areEqual(
      'steps of an inquiry',
      home.headlineLabel,
      'The home card shows the Case label'
    );
  }

  @IsTest
  static void shouldCountOnlySuccessfulDeployRunsForTheProductionDeploysSource() {
    insert new List<Pipeline_Run__c>{
      deployRun('1', 'Success'),
      deployRun('2', 'Success'),
      deployRun('3', 'Success'),
      deployRun('4', 'Failure'),
      new Pipeline_Run__c(
        Run_Key__c = 'smoke:5',
        Workflow__c = 'smoke',
        Status__c = 'Success',
        Run_Id__c = '5',
        Completed_At__c = Datetime.now()
      )
    };
    Project__c row = homeProject('Delivery', 1, false);
    row.Case_Metric_Label__c = 'production deploys recorded by the CI pipeline';
    row.Case_Metric_Source__c = ProjectCardController.SOURCE_PRODUCTION_DEPLOYS;
    insert row;

    Test.startTest();
    ProjectCardController.CaseStudy card = ProjectCardController.getHomeCaseStudies()[0];
    Test.stopTest();

    Assert.areEqual(
      '3',
      card.headlineMetric,
      'Three successes, the failure and the smoke run left out'
    );
    Assert.areEqual(
      'production deploys recorded by the CI pipeline',
      card.headlineLabel,
      'The label is kept'
    );
    Assert.areEqual(
      ProjectCardController.SOURCE_PRODUCTION_DEPLOYS,
      card.headlineSource,
      'Named source'
    );
  }

  @IsTest
  static void shouldFallBackToTheStoredCaseTextWhenNoDeployRunSucceeded() {
    insert deployRun('1', 'Failure');
    Project__c row = homeProject('Delivery', 1, false);
    row.Case_Metric__c = '12';
    row.Case_Metric_Label__c = 'production deploys';
    row.Case_Metric_Source__c = ProjectCardController.SOURCE_PRODUCTION_DEPLOYS;
    insert row;

    Test.startTest();
    ProjectCardController.CaseStudy card = ProjectCardController.getHomeCaseStudies()[0];
    Test.stopTest();

    Assert.areEqual(
      '12',
      card.headlineMetric,
      'No successful run, so the stored text shows'
    );
    Assert.areEqual(
      ProjectCardController.SOURCE_STORED,
      card.headlineSource,
      'Stored source'
    );
  }

  @IsTest
  static void shouldServeTheProductionDeploysSourceOnAPillarHeadlineToo() {
    insert new List<Pipeline_Run__c>{
      deployRun('1', 'Success'),
      deployRun('2', 'Failure')
    };
    Project__c row = new Project__c(
      Name = 'Delivery pillar',
      Pillar__c = 'E',
      Sort_Order__c = 1,
      Headline_Metric_Label__c = '{n} production deploys',
      Headline_Metric_Source__c = ProjectCardController.SOURCE_PRODUCTION_DEPLOYS
    );
    insert row;

    Test.startTest();
    ProjectCardController.PillarCard card = ProjectCardController.getPillarCards()[0];
    Test.stopTest();

    Assert.areEqual('1', card.headlineMetric, 'One success counted');
    Assert.areEqual('1 production deploys', card.headlineLabel, 'Token filled');
  }

  private static Pipeline_Run__c deployRunAt(
    String runId,
    String status,
    Datetime completedAt
  ) {
    Pipeline_Run__c row = deployRun(runId, status);
    row.Completed_At__c = completedAt;
    return row;
  }

  private static ProjectCardController.CaseStudy deliveryCard(String label) {
    Project__c row = homeProject('Delivery', 1, false);
    row.Case_Metric_Label__c = label;
    row.Case_Metric_Source__c = ProjectCardController.SOURCE_PRODUCTION_DEPLOYS;
    insert row;
    return ProjectCardController.getHomeCaseStudies()[0];
  }

  private static final String RATE_LABEL = 'of the last {total} production deploys succeeded{recovery}';
  private static final Datetime T0 = Datetime.newInstanceGmt(
    2026,
    10,
    20,
    8,
    0,
    0
  );

  @IsTest
  static void shouldAddNoRecoveryClauseWhenNoDeployFailed() {
    insert new List<Pipeline_Run__c>{
      deployRunAt('1', 'Success', T0),
      deployRunAt('2', 'Success', T0.addMinutes(30))
    };

    Test.startTest();
    ProjectCardController.CaseStudy card = deliveryCard(RATE_LABEL);
    Test.stopTest();

    Assert.areEqual('2', card.headlineMetric, 'Two successes');
    Assert.areEqual(
      'of the last 2 production deploys succeeded',
      card.headlineLabel,
      'No clause'
    );
  }

  @IsTest
  static void shouldNameTheMinutesWhenOneFailureWasFixedByTheNextDeploy() {
    insert new List<Pipeline_Run__c>{
      deployRunAt('1', 'Success', T0),
      deployRunAt('2', 'Failure', T0.addMinutes(60)),
      deployRunAt('3', 'Success', T0.addMinutes(69)),
      deployRunAt('4', 'Success', T0.addMinutes(600))
    };

    Test.startTest();
    ProjectCardController.CaseStudy card = deliveryCard(RATE_LABEL);
    Test.stopTest();

    Assert.areEqual('3', card.headlineMetric, 'Three of four');
    Assert.areEqual(
      'of the last 4 production deploys succeeded, and the one failure was fixed by the next deploy 9 minutes later',
      card.headlineLabel,
      'One failure, nine minutes'
    );
  }

  @IsTest
  static void shouldNameTheSlowestFixInHoursWhenSeveralFailuresWereFixed() {
    insert new List<Pipeline_Run__c>{
      deployRunAt('1', 'Failure', T0),
      deployRunAt('2', 'Success', T0.addMinutes(5)),
      deployRunAt('3', 'Failure', T0.addMinutes(100)),
      deployRunAt('4', 'Failure', T0.addMinutes(110)),
      deployRunAt('5', 'Success', T0.addMinutes(290))
    };

    Test.startTest();
    ProjectCardController.CaseStudy card = deliveryCard(RATE_LABEL);
    Test.stopTest();

    Assert.areEqual('2', card.headlineMetric, 'Two successes');
    Assert.areEqual(
      'of the last 5 production deploys succeeded, and every failure was fixed by the next deploy, the slowest in 3 hours',
      card.headlineLabel,
      'The slowest wait is 190 minutes, three hours rounded'
    );
  }

  @IsTest
  static void shouldStateOnlyTheRateWhenTheLatestFailureIsNotFixed() {
    insert new List<Pipeline_Run__c>{
      deployRunAt('1', 'Failure', T0),
      deployRunAt('2', 'Success', T0.addMinutes(5)),
      deployRunAt('3', 'Failure', T0.addMinutes(50))
    };

    Test.startTest();
    ProjectCardController.CaseStudy card = deliveryCard(RATE_LABEL);
    Test.stopTest();

    Assert.areEqual('1', card.headlineMetric, 'One success');
    Assert.areEqual(
      'of the last 3 production deploys succeeded',
      card.headlineLabel,
      'No claim of a fix'
    );
  }

  @IsTest
  static void shouldCountOnlyDeployRowsForTheRate() {
    insert new List<Pipeline_Run__c>{
      deployRunAt('1', 'Success', T0),
      new Pipeline_Run__c(
        Run_Key__c = 'smoke:9',
        Workflow__c = 'smoke',
        Status__c = 'Failure',
        Run_Id__c = '9',
        Completed_At__c = T0.addMinutes(1)
      ),
      new Pipeline_Run__c(
        Run_Key__c = 'heartbeat:8',
        Workflow__c = 'heartbeat',
        Status__c = 'Success',
        Run_Id__c = '8',
        Completed_At__c = T0.addMinutes(2)
      )
    };

    Test.startTest();
    ProjectCardController.CaseStudy card = deliveryCard(RATE_LABEL);
    Test.stopTest();

    Assert.areEqual('1', card.headlineMetric, 'Only the deploy row');
    Assert.areEqual(
      'of the last 1 production deploys succeeded',
      card.headlineLabel,
      'Total is deploys only'
    );
  }

  @IsTest
  static void shouldFillTheRateTokensOnAHeadlineMetricToo() {
    insert new List<Pipeline_Run__c>{
      deployRunAt('1', 'Failure', T0),
      deployRunAt('2', 'Success', T0.addMinutes(1))
    };
    insert new Project__c(
      Name = 'Delivery pillar',
      Pillar__c = 'E',
      Sort_Order__c = 1,
      Headline_Metric_Label__c = RATE_LABEL,
      Headline_Metric_Source__c = ProjectCardController.SOURCE_PRODUCTION_DEPLOYS
    );

    Test.startTest();
    ProjectCardController.PillarCard card = ProjectCardController.getPillarCards()[0];
    Test.stopTest();

    Assert.areEqual('1', card.headlineMetric, 'One success');
    Assert.areEqual(
      'of the last 2 production deploys succeeded, and the one failure was fixed by the next deploy 1 minute later',
      card.headlineLabel,
      'Tokens filled, singular minute'
    );
  }

  @IsTest
  static void shouldWriteTheRecoveryClauseInMinutesUnder120AndHoursFrom() {
    Assert.areEqual(
      ', and the one failure was fixed by the next deploy 119 minutes later',
      ProjectCardController.recoveryClause(1, 119),
      '119 stays in minutes'
    );
    Assert.areEqual(
      ', and the one failure was fixed by the next deploy 2 hours later',
      ProjectCardController.recoveryClause(1, 120),
      '120 is two hours'
    );
    Assert.areEqual(
      ', and every failure was fixed by the next deploy, the slowest in 1 minute',
      ProjectCardController.recoveryClause(2, 1),
      'Singular minute'
    );
  }

  @IsTest
  static void shouldShipTheHomeRecordEqualToItsDefault() {
    Test.startTest();
    List<String> failures = QueryDefinitions.validateAll();
    Test.stopTest();

    for (String failure : failures) {
      Assert.isFalse(
        failure.startsWith('ProjectCardController_') ||
        failure.startsWith('ResumeController_Owner'),
        'No record of this class fails validation: ' + failure
      );
    }
    Assert.isTrue(
      new ProjectCardController()
        .queryDefaults()
        .containsKey('ProjectCardController_HomeCaseStudies'),
      'The home read has a code default'
    );
    Assert.isTrue(
      new ProjectCardController()
        .queryDefaults()
        .containsKey('ProjectCardController_ProductionDeploys'),
      'The deploy count has a code default'
    );
  }
}
