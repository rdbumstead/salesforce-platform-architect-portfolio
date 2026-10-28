/**
 * @description       : Unit tests for PortfolioAgentCareer: the roles in order with their years,
 *                      the highlights per role with the persona first, no contact detail in the
 *                      output, the empty cases and the shipped query records.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/26/2026
 **/
@IsTest
private class PortfolioAgentCareerTest {
  private static final String SENTINEL_EMAIL = 'leak.sentinel@example.com';

  private static void insertCareer() {
    Account employer = new Account(Name = 'Acme Employer');
    insert employer;
    Experience__c current = new Experience__c(
      Name = 'Platform Architect',
      Employer__c = employer.Id,
      Start_Date__c = Date.newInstance(2023, 4, 1),
      Is_Current_Role__c = true,
      Sort_Order__c = 1
    );
    Experience__c past = new Experience__c(
      Name = 'Salesforce Developer',
      Employer__c = employer.Id,
      Start_Date__c = Date.newInstance(2019, 1, 1),
      End_Date__c = Date.newInstance(2022, 12, 31),
      Is_Current_Role__c = false,
      Sort_Order__c = 2
    );
    insert new List<Experience__c>{ current, past };
    insert new List<Experience_Highlight__c>{
      highlight(current.Id, 1, 'Admin', 'Ran the admin backlog.'),
      highlight(current.Id, 2, 'Architect', 'Designed the integration layer.'),
      highlight(
        current.Id,
        3,
        'Developer',
        'Built components, mail ' + SENTINEL_EMAIL + ' or 555-014-2424.'
      ),
      highlight(current.Id, 4, 'Admin', 'A fourth highlight.'),
      highlight(past.Id, 1, 'Developer', 'Shipped Lightning components.')
    };
  }

  private static Experience_Highlight__c highlight(
    Id roleId,
    Integer sortOrder,
    String persona,
    String text
  ) {
    return new Experience_Highlight__c(
      Name = 'Highlight ' + sortOrder,
      Experience__c = roleId,
      Description__c = text,
      Persona_Tag__c = persona,
      Sort_Order__c = sortOrder,
      Lock_Sort_Across_Personas__c = false
    );
  }

  private static List<Object> roles(String persona) {
    PortfolioAgentCareer.Request request = new PortfolioAgentCareer.Request();
    request.persona = persona;
    Test.startTest();
    List<PortfolioAgentCareer.Response> responses = PortfolioAgentCareer.getCareerHistory(
      new List<PortfolioAgentCareer.Request>{ request }
    );
    Test.stopTest();
    Assert.areEqual(1, responses.size(), 'One response per request');
    return (List<Object>) JSON.deserializeUntyped(responses[0].careerJson);
  }

  private static List<Object> highlightsOfFirst(List<Object> result) {
    return (List<Object>) ((Map<String, Object>) result[0]).get('highlights');
  }

  @IsTest
  static void rolesComeCurrentFirstWithYears() {
    insertCareer();

    List<Object> result = roles(null);

    Assert.areEqual(2, result.size(), 'Two roles');
    Map<String, Object> first = (Map<String, Object>) result[0];
    Map<String, Object> second = (Map<String, Object>) result[1];
    Assert.areEqual('Platform Architect', first.get('title'), 'Current first');
    Assert.areEqual(true, first.get('isCurrent'), 'Current');
    Assert.areEqual('2023', first.get('startYear'), 'Start year');
    Assert.isNull(first.get('endYear'), 'A current role has no end year');
    Assert.areEqual('Acme Employer', second.get('employer'), 'Employer');
    Assert.areEqual('2022', second.get('endYear'), 'End year');
  }

  @IsTest
  static void eachRoleHasAtMostThreeHighlights() {
    insertCareer();

    List<Object> highlights = highlightsOfFirst(roles(null));

    Assert.areEqual(
      PortfolioAgentCareer.MAX_HIGHLIGHTS,
      highlights.size(),
      'Three'
    );
    Assert.areEqual('Ran the admin backlog.', highlights[0], 'Sort order');
  }

  @IsTest
  static void thePersonasHighlightsComeFirst() {
    insertCareer();

    List<Object> highlights = highlightsOfFirst(roles('Architect'));

    Assert.areEqual(
      'Designed the integration layer.',
      highlights[0],
      'Architect first'
    );
  }

  @IsTest
  static void noContactDetailReachesTheAgent() {
    insertCareer();

    String output = JSON.serialize(roles('Developer'));

    Assert.isFalse(output.contains('@'), 'No email: ' + output);
    Assert.isFalse(output.contains('555'), 'No phone: ' + output);
  }

  @IsTest
  static void noRolesGiveAnEmptyList() {
    Assert.areEqual(0, roles(null).size(), 'Empty, not an error');
  }

  @IsTest
  static void noRequestsGiveNoResponses() {
    Assert.areEqual(
      0,
      PortfolioAgentCareer.getCareerHistory(null).size(),
      'Null'
    );
    Assert.areEqual(
      0,
      PortfolioAgentCareer.getCareerHistory(
          new List<PortfolioAgentCareer.Request>()
        )
        .size(),
      'Empty'
    );
  }

  @IsTest
  static void blankHighlightsAreSkipped() {
    List<String> picked = PortfolioAgentCareer.pickHighlights(
      new List<Experience_Highlight__c>{
        new Experience_Highlight__c(Description__c = '  ')
      },
      'Architect'
    );

    Assert.areEqual(0, picked.size(), 'Nothing to say');
  }

  @IsTest
  static void itsQueryRecordsShipEqualToTheDefaults() {
    Test.startTest();
    List<String> failures = QueryDefinitions.validateAll();
    Test.stopTest();

    for (String failure : failures) {
      Assert.isFalse(failure.startsWith('PortfolioAgentCareer_'), failure);
    }
    Assert.areEqual(
      2,
      new PortfolioAgentCareer().queryDefaults().size(),
      'Two reads'
    );
  }
}
