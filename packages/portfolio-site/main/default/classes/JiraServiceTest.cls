/**
 * @description       : Unit tests for JiraService class.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 01/03/2026
 **/
@IsTest
private class JiraServiceTest {
  @IsTest
  static void testGetRoadmapItems() {
    System.runAs(new User(Id = UserInfo.getUserId())) {
      Test.setMock(HttpCalloutMock.class, new JiraMock());
      Test.startTest();
      List<Map<String, String>> items = JiraService.getRoadmapItems();
      Test.stopTest();

      System.assert(items.size() > 0, 'Should return items');
      System.assertEquals(
        'PORT-101',
        items[0].get('id'),
        'First item should be PORT-101'
      );
    }
  }

  private class JiraMock implements HttpCalloutMock {
    public HttpResponse respond(HttpRequest req) {
      HttpResponse res = new HttpResponse();
      res.setHeader('Content-Type', 'application/json');
      res.setBody('[{"id":"PORT-101"}]');
      res.setStatusCode(200);
      return res;
    }
  }
}
