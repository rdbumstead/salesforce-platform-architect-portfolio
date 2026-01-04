@isTest
private class JiraServiceTest {
  @isTest
  static void testGetRoadmapSuccess() {
    // 0. Set Service Mock
    PortfolioService.mockConfig = new Portfolio_Config__mdt(
      Jira_Project_Key__c = 'SPAP'
    );

    // 1. Set Mock
    Test.setMock(
      HttpCalloutMock.class,
      new TestFactory.MockResponseGenerator(
        200,
        'OK',
        TestFactory.getJiraRoadmapJson()
      )
    );

    // 2. Run Test
    Test.startTest();
    List<JiraService.RoadmapItem> items = JiraService.getRoadmap();
    Test.stopTest();

    // 3. Assert
    System.assertEquals(1, items.size());
    System.assertEquals('SPAP-1', items[0].key);
    System.assertEquals('Build Core Architecture', items[0].summary);
    System.assertEquals('blue', items[0].statusColor);
  }

  @isTest
  static void testGetRoadmapError() {
    // 1. Set Mock
    Test.setMock(
      HttpCalloutMock.class,
      new TestFactory.MockResponseGenerator(401, 'Unauthorized', 'Unauthorized')
    );

    // 2. Run Test
    Test.startTest();
    List<JiraService.RoadmapItem> items = JiraService.getRoadmap();
    Test.stopTest();

    // 3. Assert
    System.assertEquals(0, items.size());
  }
}
