/**
 * @description       : Unit tests for PortfolioAgentCredentials: skills grouped by category,
 *                      one category on request, current certifications only, the empty cases
 *                      and the shipped query records.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/26/2026
 **/
@IsTest
private class PortfolioAgentCredentialsTest {
  private static void insertCredentials() {
    insert new List<Skill__c>{
      new Skill__c(
        Name = 'Apex',
        Category__c = 'Backend',
        Category_Order__c = 1
      ),
      new Skill__c(
        Name = 'LWC',
        Display_Name__c = 'Lightning Web Components',
        Category__c = 'Frontend',
        Category_Order__c = 2
      ),
      new Skill__c(Name = 'Flow', Category_Order__c = 3)
    };
    Contact owner = new Contact(LastName = 'Owner');
    Account issuer = new Account(Name = 'Salesforce');
    insert owner;
    insert issuer;
    insert new List<Certification__c>{
      new Certification__c(
        Name = 'Platform Developer I',
        Contact__c = owner.Id,
        Issuer__c = issuer.Id,
        Earned_Date__c = Date.newInstance(2021, 6, 1),
        Is_Retired__c = false
      ),
      new Certification__c(
        Name = 'Retired Cert',
        Contact__c = owner.Id,
        Issuer__c = issuer.Id,
        Earned_Date__c = Date.newInstance(2020, 6, 1),
        Is_Retired__c = true
      )
    };
  }

  private static Map<String, Object> credentials(String category) {
    PortfolioAgentCredentials.Request request = new PortfolioAgentCredentials.Request();
    request.category = category;
    Test.startTest();
    List<PortfolioAgentCredentials.Response> responses = PortfolioAgentCredentials.getCredentials(
      new List<PortfolioAgentCredentials.Request>{ request }
    );
    Test.stopTest();
    return (Map<String, Object>) JSON.deserializeUntyped(
      responses[0].credentialsJson
    );
  }

  @IsTest
  static void skillsAreGroupedByCategoryInOrder() {
    insertCredentials();

    List<Object> groups = (List<Object>) credentials(null).get('skills');

    Assert.areEqual(3, groups.size(), 'Three groups');
    Map<String, Object> first = (Map<String, Object>) groups[0];
    Assert.areEqual('Backend', first.get('category'), 'Category order');
    Map<String, Object> second = (Map<String, Object>) groups[1];
    Assert.areEqual(
      'Lightning Web Components',
      ((List<Object>) second.get('skills'))[0],
      'Display name first'
    );
    Assert.areEqual(
      PortfolioAgentCredentials.OTHER_CATEGORY,
      ((Map<String, Object>) groups[2]).get('category'),
      'No category reads as Other'
    );
  }

  @IsTest
  static void oneCategoryOnRequest() {
    insertCredentials();

    List<Object> groups = (List<Object>) credentials('frontend').get('skills');

    Assert.areEqual(1, groups.size(), 'Only Frontend');
  }

  @IsTest
  static void anUnknownCategoryReturnsEveryGroup() {
    insertCredentials();

    List<Object> groups = (List<Object>) credentials('Quantum').get('skills');

    Assert.areEqual(3, groups.size(), 'All groups');
  }

  @IsTest
  static void onlyCurrentCertificationsAreReturned() {
    insertCredentials();

    Map<String, Object> result = credentials(null);

    List<Object> certifications = (List<Object>) result.get(
      'currentCertifications'
    );
    Assert.areEqual(1, certifications.size(), 'The retired one is left out');
    Map<String, Object> cert = (Map<String, Object>) certifications[0];
    Assert.areEqual('Platform Developer I', cert.get('name'), 'Name');
    Assert.areEqual('Salesforce', cert.get('issuer'), 'Issuer');
    Assert.areEqual('2021', cert.get('year'), 'Year');
    Assert.areEqual(1, result.get('currentCertificationCount'), 'Count');
  }

  @IsTest
  static void noRecordsGiveEmptyLists() {
    Map<String, Object> result = credentials(null);

    Assert.areEqual(0, ((List<Object>) result.get('skills')).size(), 'None');
    Assert.areEqual(0, result.get('currentCertificationCount'), 'Zero');
  }

  @IsTest
  static void noRequestsGiveNoResponses() {
    Assert.areEqual(
      0,
      PortfolioAgentCredentials.getCredentials(null).size(),
      'Null'
    );
  }

  @IsTest
  static void itsQueryRecordsShipEqualToTheDefaults() {
    Test.startTest();
    List<String> failures = QueryDefinitions.validateAll();
    Test.stopTest();

    for (String failure : failures) {
      Assert.isFalse(failure.startsWith('PortfolioAgentCredentials_'), failure);
    }
    Assert.areEqual(
      2,
      new PortfolioAgentCredentials().queryDefaults().size(),
      'Two reads'
    );
  }
}
