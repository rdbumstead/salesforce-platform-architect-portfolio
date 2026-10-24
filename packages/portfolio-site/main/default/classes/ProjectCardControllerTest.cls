/**
 * @description       : Tests for ProjectCardController.
 *                      Builds its own Project__c and Pipeline_Run__c rows, because TestFactory
 *                      is shared and stays unchanged.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/22/2026
 **/
@IsTest
private class ProjectCardControllerTest {
  private static final String METRIC = '23 API paths';
  private static final String LABEL = 'documented across two OpenAPI specs';
  private static final String IMAGE = 'resource:Project_Card_Images/pillar-c.webp';
  private static final String ALT = 'The API Lab request builder';

  private static Project__c project(
    String name,
    String letter,
    Boolean featured,
    Integer sortOrder
  ) {
    return new Project__c(
      Name = name,
      Pillar__c = letter,
      Is_Featured__c = featured,
      Sort_Order__c = sortOrder
    );
  }

  private static Map<String, ProjectCardController.PillarCard> byLetter(
    List<ProjectCardController.PillarCard> cards
  ) {
    Map<String, ProjectCardController.PillarCard> result = new Map<String, ProjectCardController.PillarCard>();
    for (ProjectCardController.PillarCard card : cards) {
      result.put(card.pillar, card);
    }
    return result;
  }

  @IsTest
  static void shouldReturnEmptyListWhenNoProjectsExist() {
    Test.startTest();
    List<ProjectCardController.PillarCard> cards = ProjectCardController.getPillarCards();
    Test.stopTest();

    Assert.isNotNull(cards, 'The list is never null');
    Assert.areEqual(0, cards.size(), 'No projects means no cards');
  }

  @IsTest
  static void shouldReturnOneRowPerLetterInLetterOrderWhenLettersHaveSeveralProjects() {
    List<Project__c> projects = new List<Project__c>{
      project('E one', 'E', false, 1),
      project('C one', 'C', false, 1),
      project('C two', 'C', false, 2),
      project('A one', 'A', false, 1),
      project('E two', 'E', true, 9)
    };
    insert projects;

    Test.startTest();
    List<ProjectCardController.PillarCard> cards = ProjectCardController.getPillarCards();
    Test.stopTest();

    List<String> letters = new List<String>();
    for (ProjectCardController.PillarCard card : cards) {
      letters.add(card.pillar);
    }
    Assert.areEqual(
      new List<String>{ 'A', 'C', 'E' },
      letters,
      'One row per letter that has a project, in letter order'
    );
  }

  @IsTest
  static void shouldPreferFeaturedThenSortOrderThenNameWhenChoosingTheRowForALetter() {
    Project__c featured = project('Z featured', 'D', true, 50);
    featured.Headline_Metric__c = 'featured';
    Project__c lowSort = project('A low sort', 'D', false, 1);
    lowSort.Headline_Metric__c = 'low sort';
    Project__c nameFirst = project('Alpha', 'B', false, 5);
    nameFirst.Headline_Metric__c = 'alpha';
    Project__c nameSecond = project('Beta', 'B', false, 5);
    nameSecond.Headline_Metric__c = 'beta';
    Project__c sortFirst = project('Zulu', 'C', false, 1);
    sortFirst.Headline_Metric__c = 'zulu';
    Project__c sortSecond = project('Able', 'C', false, 2);
    sortSecond.Headline_Metric__c = 'able';
    insert new List<Project__c>{
      featured,
      lowSort,
      nameFirst,
      nameSecond,
      sortFirst,
      sortSecond
    };

    Test.startTest();
    Map<String, ProjectCardController.PillarCard> cards = byLetter(
      ProjectCardController.getPillarCards()
    );
    Test.stopTest();

    Assert.areEqual(
      'featured',
      cards.get('D').headlineMetric,
      'A featured project wins over a lower sort order'
    );
    Assert.areEqual(
      'zulu',
      cards.get('C').headlineMetric,
      'The lower sort order wins over the name'
    );
    Assert.areEqual(
      'alpha',
      cards.get('B').headlineMetric,
      'The name breaks a tie on sort order'
    );
  }

  @IsTest
  static void shouldReturnEveryCardFieldWhenFieldsAreSet() {
    Project__c apiLab = project('Work Experience API', 'C', true, 30);
    apiLab.Headline_Metric__c = '  ' + METRIC + '  ';
    apiLab.Headline_Metric_Label__c = LABEL;
    apiLab.Hero_Image_URL__c = IMAGE;
    apiLab.Hero_Image_Alt__c = ALT;
    insert apiLab;

    Test.startTest();
    List<ProjectCardController.PillarCard> cards = ProjectCardController.getPillarCards();
    Test.stopTest();

    Assert.areEqual(1, cards.size(), 'One project, one card');
    ProjectCardController.PillarCard card = cards[0];
    Assert.areEqual('C', card.pillar, 'Pillar letter');
    Assert.areEqual(METRIC, card.headlineMetric, 'Metric, trimmed');
    Assert.areEqual(LABEL, card.headlineLabel, 'Metric label');
    Assert.areEqual(IMAGE, card.imageUrl, 'Image URL as stored');
    Assert.areEqual(ALT, card.imageAlt, 'Image alt text');
  }

  @IsTest
  static void shouldReturnNullsWhenCardFieldsAreBlank() {
    Project__c blank = project('Blank', 'E', false, 1);
    blank.Headline_Metric__c = '   ';
    insert blank;

    Test.startTest();
    List<ProjectCardController.PillarCard> cards = ProjectCardController.getPillarCards();
    Test.stopTest();

    ProjectCardController.PillarCard card = cards[0];
    Assert.areEqual('E', card.pillar, 'The row still names its letter');
    Assert.isNull(card.headlineMetric, 'A blank metric comes back null');
    Assert.isNull(card.headlineLabel, 'An empty label comes back null');
    Assert.isNull(card.imageUrl, 'An empty image URL comes back null');
    Assert.isNull(card.imageAlt, 'An empty alt text comes back null');
  }

  @IsTest
  static void shouldIgnoreProjectsWithNoPillarWhenSelecting() {
    insert new List<Project__c>{
      project('No pillar', null, true, 1),
      project('Pillar A', 'A', false, 1)
    };

    Test.startTest();
    List<ProjectCardController.PillarCard> cards = ProjectCardController.getPillarCards();
    Test.stopTest();

    Assert.areEqual(1, cards.size(), 'A project with no letter has no card');
    Assert.areEqual('A', cards[0].pillar, 'Only the lettered project');
  }

  private static final String TESTS_LABEL = 'passing at the last deploy, with {coverage}% org-wide coverage';

  private static Project__c sourced(String letter, String source) {
    Project__c row = project('Sourced ' + letter, letter, true, 1);
    row.Headline_Metric_Source__c = source;
    return row;
  }

  private static Pipeline_Run__c run(
    String runId,
    String status,
    Integer testsRun,
    Decimal coverage,
    Datetime completedAt
  ) {
    return new Pipeline_Run__c(
      Run_Key__c = 'deploy:' + runId,
      Workflow__c = 'deploy',
      Status__c = status,
      Run_Id__c = runId,
      Completed_At__c = completedAt,
      Tests_Run__c = testsRun,
      Tests_Passed__c = testsRun,
      Org_Coverage__c = coverage
    );
  }

  private static ProjectCardController.PillarCard onlyCard() {
    List<ProjectCardController.PillarCard> cards = ProjectCardController.getPillarCards();
    Assert.areEqual(1, cards.size(), 'One project, one card');
    return cards[0];
  }

  @IsTest
  static void shouldReturnTheCaseStudyAndLinksWhenSet() {
    Project__c row = project('Case study', 'E', true, 1);
    row.Challenge__c = '  The challenge.  ';
    row.Solution__c = 'The solution.';
    row.Business_Value__c = 'The value.';
    row.Live_URL__c = 'https://ryanbumstead.com/';
    row.Repository_URL__c = 'https://github.com/rdbumstead/salesforce-platform-architect-portfolio';
    insert row;

    Test.startTest();
    ProjectCardController.PillarCard card = onlyCard();
    Test.stopTest();

    Assert.areEqual('The challenge.', card.challenge, 'Challenge, trimmed');
    Assert.areEqual('The solution.', card.solution, 'Solution');
    Assert.areEqual('The value.', card.businessValue, 'Business value');
    Assert.areEqual(row.Live_URL__c, card.liveUrl, 'Live link as stored');
    Assert.areEqual(
      row.Repository_URL__c,
      card.repositoryUrl,
      'Source link as stored'
    );
  }

  @IsTest
  static void shouldReturnNullCaseStudyWhenBlank() {
    insert project('Empty', 'A', true, 1);

    Test.startTest();
    ProjectCardController.PillarCard card = onlyCard();
    Test.stopTest();

    Assert.isNull(card.challenge, 'No challenge');
    Assert.isNull(card.solution, 'No solution');
    Assert.isNull(card.businessValue, 'No business value');
    Assert.isNull(card.liveUrl, 'No live link');
    Assert.isNull(card.repositoryUrl, 'No source link');
    Assert.isNull(card.headlineSource, 'No headline, so no source');
  }

  @IsTest
  static void shouldComputeTestsFromTheNewestSuccessfulRunWhenSourceIsApexTests() {
    Datetime now = Datetime.now();
    insert new List<Pipeline_Run__c>{
      run('1', 'Success', 646, 97.00, now.addDays(-2)),
      run('2', 'Success', 671, 97.60, now.addDays(-1)),
      run('3', 'Failure', null, null, now),
      run('4', 'Success', null, null, now)
    };
    Project__c row = sourced('E', ProjectCardController.SOURCE_APEX_TESTS);
    row.Headline_Metric__c = '646 Apex tests';
    row.Headline_Metric_Label__c = TESTS_LABEL;
    insert row;

    Test.startTest();
    ProjectCardController.PillarCard card = onlyCard();
    Test.stopTest();

    Assert.areEqual('671 Apex tests', card.headlineMetric, 'Newest count');
    Assert.areEqual(
      'passing at the last deploy, with 97% org-wide coverage',
      card.headlineLabel,
      'Coverage filled, rounded down'
    );
    Assert.areEqual(
      ProjectCardController.SOURCE_APEX_TESTS,
      card.headlineSource,
      'Names its source'
    );
  }

  @IsTest
  static void shouldShowThePassedCountWhenATestFailedInTheNewestRun() {
    Pipeline_Run__c newest = run('1', 'Success', 674, 97, Datetime.now());
    newest.Tests_Passed__c = 673;
    insert newest;
    Project__c row = sourced('E', ProjectCardController.SOURCE_APEX_TESTS);
    row.Headline_Metric__c = '646 Apex tests';
    row.Headline_Metric_Label__c = TESTS_LABEL;
    insert row;

    Test.startTest();
    ProjectCardController.PillarCard card = onlyCard();
    Test.stopTest();

    Assert.areEqual(
      '673 Apex tests',
      card.headlineMetric,
      'The passed count, never the run count, under a passing label'
    );
  }

  @IsTest
  static void shouldShowNoHeadlineWhenTheSourceFailsAndTheLabelHasAToken() {
    Project__c row = sourced('E', ProjectCardController.SOURCE_APEX_TESTS);
    row.Headline_Metric__c = '646 Apex tests';
    row.Headline_Metric_Label__c = TESTS_LABEL;
    insert row;

    Test.startTest();
    ProjectCardController.PillarCard card = onlyCard();
    Test.stopTest();

    Assert.isNull(card.headlineMetric, 'No run, no number with a raw token');
    Assert.isNull(card.headlineLabel, 'No label with a raw token');
    Assert.isNull(card.headlineSource, 'Nothing shown');
  }

  @IsTest
  static void shouldShowNoHeadlineWhenTheCoverageIsMissingForItsToken() {
    insert run('1', 'Success', 671, null, Datetime.now());
    Project__c row = sourced('E', ProjectCardController.SOURCE_APEX_TESTS);
    row.Headline_Metric__c = '646 Apex tests';
    row.Headline_Metric_Label__c = TESTS_LABEL;
    insert row;

    Test.startTest();
    ProjectCardController.PillarCard card = onlyCard();
    Test.stopTest();

    Assert.isNull(card.headlineMetric, 'An unfilled token hides the number');
    Assert.isNull(card.headlineLabel, 'An unfilled token hides the label');
  }

  @IsTest
  static void shouldFallBackToTheStoredTextWhenTheSourceFails() {
    ProjectCardController.failingSources.add(
      ProjectCardController.SOURCE_API_PATHS
    );
    Project__c row = sourced('C', ProjectCardController.SOURCE_API_PATHS);
    row.Headline_Metric__c = METRIC;
    row.Headline_Metric_Label__c = LABEL;
    insert row;

    Test.startTest();
    ProjectCardController.PillarCard card = onlyCard();
    Test.stopTest();

    Assert.areEqual(METRIC, card.headlineMetric, 'Stored metric');
    Assert.areEqual(LABEL, card.headlineLabel, 'Stored label');
    Assert.areEqual(
      ProjectCardController.SOURCE_STORED,
      card.headlineSource,
      'Says the text is stored'
    );
  }

  @IsTest
  static void shouldCountThePathsInBothSpecResourcesWhenSourceIsApiPaths() {
    Integer expected = 0;
    for (StaticResource spec : [
      SELECT Body
      FROM StaticResource
      WHERE Name IN ('SAPI_Spec', 'PAPI_Spec')
    ]) {
      // Independent count: a line break, two spaces and a slash opens a path key.
      expected +=
        spec.Body.toString().replace('\r', '').split('\n  /').size() - 1;
    }
    Project__c row = sourced('C', ProjectCardController.SOURCE_API_PATHS);
    row.Headline_Metric__c = METRIC;
    row.Headline_Metric_Label__c = '{n} paths ' + LABEL;
    insert row;

    Test.startTest();
    ProjectCardController.PillarCard card = onlyCard();
    Test.stopTest();

    Assert.isTrue(expected > 0, 'Both spec resources exist and have paths');
    Assert.areEqual(expected + ' API paths', card.headlineMetric, 'Computed');
    Assert.areEqual(
      expected + ' paths ' + LABEL,
      card.headlineLabel,
      'The {n} token is filled'
    );
  }

  @IsTest
  static void shouldCountOnlyTheTopLevelPathKeysWhenReadingASpec() {
    String yaml =
      'openapi: 3.0.3\r\n' +
      'info:\n  title: x\n' +
      'paths:\n' +
      '  /one:\n    get:\n      summary: a\n' +
      '  /two/{id}:\n    get:\n      responses:\n        200:\n' +
      '\n' +
      '  /three:\n' +
      'components:\n  /not-a-path:\n';

    Test.startTest();
    Integer count = ProjectCardController.countPaths(yaml);
    Integer none = ProjectCardController.countPaths('openapi: 3.0.3\n');
    Test.stopTest();

    Assert.areEqual(3, count, 'Three paths, the components block ignored');
    Assert.areEqual(0, none, 'No paths block, no paths');
  }

  @IsTest
  static void shouldCountTheProvidersSwitchedOnWhenSourceIsAiProviders() {
    Integer expected = 0;
    for (
      ContentGenerationController.ProviderStatus status : ContentGenerationController.providerStatus()
    ) {
      if (status.state == ContentGenerationController.STATE_ON) {
        expected++;
      }
    }
    Project__c row = sourced('D', ProjectCardController.SOURCE_AI_PROVIDERS);
    row.Headline_Metric__c = '9 AI providers';
    row.Headline_Metric_Label__c = LABEL;
    insert row;

    Test.startTest();
    ProjectCardController.PillarCard card = onlyCard();
    Test.stopTest();

    Assert.isTrue(expected > 0, 'Gemini and the local template are on');
    Assert.areEqual(
      expected + ' AI providers',
      card.headlineMetric,
      'Computed'
    );
  }

  @IsTest
  static void shouldCountTheEmployerHubObjectsWhenSourceIsEmployerHubObjects() {
    Integer expected = SchemaService.countObjects(
      SchemaService.SCOPE_EMPLOYER_HUB
    );
    Project__c row = sourced(
      'A',
      ProjectCardController.SOURCE_EMPLOYER_HUB_OBJECTS
    );
    row.Headline_Metric__c = '1 objects';
    row.Headline_Metric_Label__c = LABEL;
    insert row;

    Test.startTest();
    ProjectCardController.PillarCard card = onlyCard();
    Test.stopTest();

    Assert.isTrue(expected > 0, 'The ERD scope has objects');
    Assert.areEqual(expected + ' objects', card.headlineMetric, 'Computed');
  }

  @IsTest
  static void shouldBuildTheMetricFromTheNumberWhenTheStoredTextHasNoNumber() {
    insert run('1', 'Success', 671, 97, Datetime.now());
    Project__c words = sourced('E', ProjectCardController.SOURCE_APEX_TESTS);
    words.Headline_Metric__c = 'Apex tests';
    Project__c blank = sourced('D', ProjectCardController.SOURCE_APEX_TESTS);
    insert new List<Project__c>{ words, blank };

    Test.startTest();
    Map<String, ProjectCardController.PillarCard> cards = byLetter(
      ProjectCardController.getPillarCards()
    );
    Test.stopTest();

    Assert.areEqual(
      '671 Apex tests',
      cards.get('E').headlineMetric,
      'Prefixed'
    );
    Assert.areEqual('671', cards.get('D').headlineMetric, 'The number alone');
  }

  @IsTest
  static void shouldHideAStoredLabelThatHoldsATokenWhenNoSourceIsSet() {
    Project__c row = project('No source', 'B', true, 1);
    row.Headline_Metric__c = METRIC;
    row.Headline_Metric_Label__c = '{n} things';
    insert row;

    Test.startTest();
    ProjectCardController.PillarCard card = onlyCard();
    Test.stopTest();

    Assert.isNull(card.headlineMetric, 'A raw token is never shown');
    Assert.isNull(card.headlineLabel, 'A raw token is never shown');
  }

  @IsTest
  static void shouldComputeTheSameCardsForTheSiteGuest() {
    insert run('1', 'Success', 671, 97, Datetime.now());
    Project__c tests = sourced('E', ProjectCardController.SOURCE_APEX_TESTS);
    tests.Headline_Metric__c = '646 Apex tests';
    tests.Headline_Metric_Label__c = TESTS_LABEL;
    tests.Challenge__c = 'The challenge.';
    Project__c paths = sourced('C', ProjectCardController.SOURCE_API_PATHS);
    paths.Headline_Metric__c = METRIC;
    paths.Headline_Metric_Label__c = LABEL;
    insert new List<Project__c>{ tests, paths };
    String asAdmin = JSON.serialize(ProjectCardController.getPillarCards());
    User guest = SiteGuestTestSupport.preparedGuest();

    String asGuest;
    Test.startTest();
    System.runAs(guest) {
      asGuest = JSON.serialize(ProjectCardController.getPillarCards());
    }
    Test.stopTest();

    Assert.areEqual(asAdmin, asGuest, 'The guest sees the same computed cards');
    Assert.isTrue(asGuest.contains('671 Apex tests'), 'Computed for the guest');
    Assert.isTrue(
      asGuest.contains('The challenge.'),
      'Case study for the guest'
    );
  }
}
