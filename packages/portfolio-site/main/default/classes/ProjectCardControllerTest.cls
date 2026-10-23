/**
 * @description       : Tests for ProjectCardController (Round 6 plan N7). Builds its own
 *                      Project__c rows, because TestFactory is not edited this round.
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
  static void shouldReturnEmptyList_WhenNoProjectsExist() {
    Test.startTest();
    List<ProjectCardController.PillarCard> cards = ProjectCardController.getPillarCards();
    Test.stopTest();

    Assert.isNotNull(cards, 'The list is never null');
    Assert.areEqual(0, cards.size(), 'No projects means no cards');
  }

  @IsTest
  static void shouldReturnOneRowPerLetterInLetterOrder_WhenLettersHaveSeveralProjects() {
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
  static void shouldPreferFeaturedThenSortOrderThenName_WhenChoosingTheRowForALetter() {
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
  static void shouldReturnEveryCardField_WhenFieldsAreSet() {
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
  static void shouldReturnNulls_WhenCardFieldsAreBlank() {
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
  static void shouldIgnoreProjectsWithNoPillar_WhenSelecting() {
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
}
