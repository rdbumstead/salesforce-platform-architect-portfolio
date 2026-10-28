/**
 * @description       : Unit tests for PortfolioAgentProjects: featured projects and case
 *                      studies only, the keyword pick, no client line or contact detail in the
 *                      output, the empty cases and the shipped query record.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/26/2026
 **/
@IsTest
private class PortfolioAgentProjectsTest {
  private static final String CLIENT = 'Sentinel Client Inc';

  private static void insertProjects() {
    insert new List<Project__c>{
      new Project__c(
        Name = 'Employer hub',
        Is_Featured__c = true,
        Sort_Order__c = 1,
        Status__c = 'Active Development',
        Challenge__c = 'Partners had no front door.',
        Solution__c = 'One portal over Education Cloud.',
        Business_Value__c = 'One view of each partner, call 555-014-2424.',
        Headline_Metric__c = '12',
        Headline_Metric_Label__c = 'objects',
        Date_Completed__c = Date.newInstance(2025, 5, 1),
        Pillar__c = 'A',
        Client_Line__c = CLIENT
      ),
      new Project__c(
        Name = 'Literacy platform choice',
        Home_Sort__c = 2,
        Sort_Order__c = 2,
        Challenge__c = 'A nonprofit had to pick a platform.',
        Client_Line__c = CLIENT
      ),
      new Project__c(
        Name = 'Hidden side project',
        Is_Featured__c = false,
        Sort_Order__c = 3
      )
    };
  }

  private static List<Object> projects(String keyword) {
    PortfolioAgentProjects.Request request = new PortfolioAgentProjects.Request();
    request.keyword = keyword;
    Test.startTest();
    List<PortfolioAgentProjects.Response> responses = PortfolioAgentProjects.getProjects(
      new List<PortfolioAgentProjects.Request>{ request }
    );
    Test.stopTest();
    return (List<Object>) JSON.deserializeUntyped(responses[0].projectsJson);
  }

  private static List<String> names(List<Object> result) {
    List<String> found = new List<String>();
    for (Object item : result) {
      found.add((String) ((Map<String, Object>) item).get('name'));
    }
    return found;
  }

  @IsTest
  static void featuredProjectsAndCaseStudiesOnly() {
    insertProjects();

    List<String> found = names(projects(null));

    Assert.areEqual(
      new List<String>{ 'Literacy platform choice', 'Employer hub' },
      found,
      'Case study order first, never the hidden project'
    );
  }

  @IsTest
  static void aProjectCarriesItsStory() {
    insertProjects();

    Map<String, Object> hub = (Map<String, Object>) projects('portal')[0];

    Assert.areEqual('Employer hub', hub.get('name'), 'Matched by keyword');
    Assert.areEqual(
      'Partners had no front door.',
      hub.get('problem'),
      'Problem'
    );
    Assert.areEqual('12 objects', hub.get('headlineMetric'), 'Metric');
    Assert.areEqual('2025', hub.get('year'), 'Year');
    Assert.areEqual('Pillar A: Business Architecture', hub.get('area'), 'Area');
  }

  @IsTest
  static void aKeywordWithNoMatchReturnsEveryProject() {
    insertProjects();

    Assert.areEqual(2, projects('quantum').size(), 'All of them');
  }

  @IsTest
  static void noClientOrContactDetailReachesTheAgent() {
    insertProjects();

    String output = JSON.serialize(projects(null));

    Assert.isFalse(output.contains(CLIENT), 'No client line: ' + output);
    Assert.isFalse(output.contains('555'), 'No phone: ' + output);
  }

  @IsTest
  static void atMostSixProjects() {
    List<Project__c> many = new List<Project__c>();
    for (Integer i = 0; i < 9; i++) {
      many.add(
        new Project__c(
          Name = 'Project ' + i,
          Is_Featured__c = true,
          Sort_Order__c = i
        )
      );
    }
    insert many;

    Assert.areEqual(
      PortfolioAgentProjects.MAX_PROJECTS,
      projects(null).size(),
      'Capped'
    );
  }

  @IsTest
  static void noRequestsGiveNoResponses() {
    Assert.areEqual(0, PortfolioAgentProjects.getProjects(null).size(), 'Null');
  }

  @IsTest
  static void itsQueryRecordShipsEqualToTheDefault() {
    Test.startTest();
    List<String> failures = QueryDefinitions.validateAll();
    Test.stopTest();

    for (String failure : failures) {
      Assert.isFalse(failure.startsWith('PortfolioAgentProjects_'), failure);
    }
    Assert.areEqual(
      1,
      new PortfolioAgentProjects().queryDefaults().size(),
      'One read'
    );
  }
}
