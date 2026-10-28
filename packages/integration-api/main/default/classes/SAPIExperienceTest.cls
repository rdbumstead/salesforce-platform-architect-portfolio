/**
 * @description       : Unit tests for SAPIExperience REST resource.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 01/02/2026
 **/
@IsTest
private class SAPIExperienceTest {
  @TestSetup
  static void setup() {
    Account employer = new Account(Name = 'Salesforce');
    insert employer;

    // UPDATED: Replaced Position_Title__c with Name
    Experience__c exp = new Experience__c(
      Employer__c = employer.Id,
      Name = 'Technical Architect',
      Start_Date__c = Date.today().addYears(-1),
      Is_Current_Role__c = true,
      Sort_Order__c = 1
    );
    insert exp;
  }

  @IsTest
  static void testGetExperiencesSuccess() {
    RestTestUtil.initGet('/services/apexrest/sapi/v1/experience/');

    Test.startTest();
    SAPIExperience.getExperiences();
    Test.stopTest();

    RestResponse res = RestTestUtil.getResponse();
    System.assertEquals(200, res.statusCode, 'Should return 200 OK');
    System.assertNotEquals(
      null,
      res.responseBody,
      'Response body should not be null'
    );

    String responseJson = res.responseBody.toString();
    // This assertion works because we mapped Name to the 'name' JSON property in the main class
    System.assert(
      responseJson.contains('Technical Architect'),
      'Response should contain role name'
    );
    System.assertEquals(
      'no-store, no-cache',
      res.headers.get('Cache-Control'),
      'Experience is no-store per the spec header reference'
    );
    System.assertEquals('1', res.headers.get('X-Total-Count'), 'Total count');
  }

  @IsTest
  static void testGetExperiencesFilterCurrentlyEmployed() {
    RestTestUtil.initGet(
      '/services/apexrest/sapi/v1/experience/',
      new Map<String, String>{ 'currentlyEmployed' => 'true' }
    );

    Test.startTest();
    SAPIExperience.getExperiences();
    Test.stopTest();

    RestResponse res = RestTestUtil.getResponse();
    System.assertEquals(200, res.statusCode, 'Should return 200 OK');
    // Optional: Add assertion to verify record count > 0 since our setup data matches this filter
  }

  @IsTest
  static void testGetExperiencesInvalidOffset() {
    RestTestUtil.initGet(
      '/services/apexrest/sapi/v1/experience/',
      new Map<String, String>{ 'offset' => '-5' }
    );

    Test.startTest();
    SAPIExperience.getExperiences();
    Test.stopTest();

    RestResponse res = RestTestUtil.getResponse();
    System.assertEquals(400, res.statusCode, 'Should return 400 Bad Request');
  }

  @IsTest
  static void testGetExperiencesInvalidLimit() {
    RestTestUtil.initGet(
      '/services/apexrest/sapi/v1/experience/',
      new Map<String, String>{ 'limit' => '500' }
    );

    Test.startTest();
    SAPIExperience.getExperiences();
    Test.stopTest();

    RestResponse res = RestTestUtil.getResponse();
    System.assertEquals(
      400,
      res.statusCode,
      'Should return 400 for high limit'
    );
  }

  @IsTest
  static void testGetExperiencesInternalError() {
    RestTestUtil.initGet('/services/apexrest/sapi/v1/experience/');
    RestResponse res = RestTestUtil.getResponse();

    SAPIExperience.throwException = true;

    Test.startTest();
    SAPIExperience.getExperiences();
    Test.stopTest();

    System.assertEquals(
      500,
      res.statusCode,
      'Should return 500 on internal error'
    );
  }

  @IsTest
  static void testGetExperiencesEmployerFilterLeavesHighlightsOut() {
    Experience__c exp = [SELECT Id FROM Experience__c LIMIT 1];
    exp.Is_Current_Role__c = false;
    exp.End_Date__c = Date.today();
    update exp;
    insert new Experience_Highlight__c(
      Experience__c = exp.Id,
      Name = 'Highlight',
      Description__c = 'Delivered the platform',
      Persona_Tag__c = 'Architect',
      Sort_Order__c = 1
    );
    RestTestUtil.initGet(
      '/services/apexrest/sapi/v1/experience/',
      new Map<String, String>{ 'employerName' => 'Salesforce' }
    );

    Test.startTest();
    SAPIExperience.getExperiences();
    Test.stopTest();

    RestResponse res = RestTestUtil.getResponse();
    System.assertEquals(200, res.statusCode, 'Should return 200 OK');
    String responseJson = res.responseBody.toString();
    System.assert(
      !responseJson.contains('Delivered the platform'),
      'Highlights are served by /experience-highlights, not here'
    );
    System.assert(
      responseJson.contains('endDate'),
      'Response should contain the end date'
    );
  }

  // Property names of the Experience schema in salesforce-sapi.yaml.
  private static final Set<String> SPEC_EXPERIENCE_KEYS = new Set<String>{
    'id',
    'employerName',
    'employerId',
    'name',
    'startDate',
    'endDate',
    'isCurrentRole',
    'isRemote',
    'accomplishments',
    'contactId',
    'contactName',
    'sortOrder'
  };

  @IsTest
  static void responseKeysEqualTheSpecSchema() {
    Experience__c exp = [SELECT Id FROM Experience__c LIMIT 1];
    exp.Accomplishments__c = '<ul><li>Led 5 deployments</li></ul>';
    update exp;
    RestTestUtil.initGet('/services/apexrest/sapi/v1/experience/');

    Test.startTest();
    SAPIExperience.getExperiences();
    Test.stopTest();

    List<Object> items = (List<Object>) JSON.deserializeUntyped(
      RestTestUtil.getResponse().responseBody.toString()
    );
    Map<String, Object> item = (Map<String, Object>) items[0];
    Assert.areEqual(SPEC_EXPERIENCE_KEYS, item.keySet(), 'Keys equal the spec');
    Assert.isTrue(
      ((String) item.get('accomplishments')).contains('Led 5 deployments'),
      'accomplishments from Accomplishments__c'
    );
    Assert.isFalse(item.containsKey('highlights'), 'highlights is gone');
  }

  // Two experiences, each held by its own contact.
  private static void addSecondContactExperience() {
    List<Contact> people = new List<Contact>{
      new Contact(FirstName = 'Ryan', LastName = 'Owner'),
      new Contact(FirstName = 'Pat', LastName = 'Other')
    };
    insert people;
    Experience__c first = [SELECT Id FROM Experience__c LIMIT 1];
    first.Contact__c = people[0].Id;
    update first;
    insert new Experience__c(
      Employer__c = [SELECT Id FROM Account LIMIT 1]
      .Id,
      Contact__c = people[1].Id,
      Name = 'Salesforce Developer',
      Start_Date__c = Date.today().addYears(-3),
      Sort_Order__c = 2
    );
  }

  private static List<Object> getWith(Map<String, String> params) {
    RestTestUtil.initGet('/services/apexrest/sapi/v1/experience/', params);
    Test.startTest();
    SAPIExperience.getExperiences();
    Test.stopTest();
    RestResponse res = RestTestUtil.getResponse();
    Assert.areEqual(200, res.statusCode, 'Should return 200 OK');
    return (List<Object>) JSON.deserializeUntyped(res.responseBody.toString());
  }

  @IsTest
  static void contactNameFilterNarrowsToThatContact() {
    addSecondContactExperience();

    List<Object> items = getWith(
      new Map<String, String>{ 'contactName' => 'Pat Other' }
    );

    Assert.areEqual(1, items.size(), 'Only the named contact');
    Map<String, Object> item = (Map<String, Object>) items[0];
    Assert.areEqual('Pat Other', item.get('contactName'), 'Matched by name');
    Assert.areEqual(SPEC_EXPERIENCE_KEYS, item.keySet(), 'Keys equal the spec');
  }

  @IsTest
  static void blankContactNameIsIgnored() {
    addSecondContactExperience();

    List<Object> items = getWith(
      new Map<String, String>{ 'contactName' => '' }
    );

    Assert.areEqual(2, items.size(), 'A blank filter returns every experience');
  }

  @IsTest
  static void filteredTotalCountsTheFilteredRowsNotThePage() {
    addPastRoles(2);

    RestTestUtil.initGet(
      '/services/apexrest/sapi/v1/experience/',
      new Map<String, String>{ 'currentlyEmployed' => 'false', 'limit' => '1' }
    );
    Test.startTest();
    SAPIExperience.getExperiences();
    Test.stopTest();

    RestResponse res = RestTestUtil.getResponse();
    Assert.areEqual(200, res.statusCode, 'Filtered request is OK');
    Assert.areEqual(
      '2',
      res.headers.get('X-Total-Count'),
      'Two past roles, more than the page of one'
    );
    Assert.areEqual('true', res.headers.get('X-Has-More'), 'More rows follow');
  }

  @IsTest
  static void unfilteredTotalCountsEveryExperience() {
    addPastRoles(1);

    RestTestUtil.initGet(
      '/services/apexrest/sapi/v1/experience/',
      new Map<String, String>{ 'limit' => '1' }
    );
    Test.startTest();
    SAPIExperience.getExperiences();
    Test.stopTest();

    RestResponse res = RestTestUtil.getResponse();
    Assert.areEqual('2', res.headers.get('X-Total-Count'), 'Every experience');
  }

  private static void addPastRoles(Integer count) {
    Account employer = [SELECT Id FROM Account WHERE Name = 'Salesforce'];
    List<Experience__c> past = new List<Experience__c>();
    for (Integer i = 0; i < count; i++) {
      past.add(
        new Experience__c(
          Employer__c = employer.Id,
          Name = 'Past role ' + i,
          Start_Date__c = Date.today().addYears(-5),
          End_Date__c = Date.today().addYears(-3),
          Is_Current_Role__c = false,
          Sort_Order__c = 2 + i
        )
      );
    }
    insert past;
  }
}
