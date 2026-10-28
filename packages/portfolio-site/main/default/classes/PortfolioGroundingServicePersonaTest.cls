/**
 * @description       : Unit tests for the persona and contact parts of
 *                      PortfolioGroundingService: inferPersona from the title and then the
 *                      description, the persona boost on tagged highlights, and
 *                      removeContactDetails on the visitor's own text. Builds its own records.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/24/2026
 **/
@IsTest
private class PortfolioGroundingServicePersonaTest {
  private static final Pattern PHONE_SHAPE = Pattern.compile(
    '\\(?\\d{3}\\)?[\\s.-]?\\d{3}[\\s.-]?\\d{4}'
  );

  /**
   * @description One more highlight than the grounding keeps: every one tagged Admin, and the
   *              last in sort order tagged Architect, all with the same text.
   */
  private static void insertHighlights() {
    Account employer = new Account(Name = 'Acme Corp');
    insert employer;
    Experience__c role = new Experience__c(
      Name = 'Platform Lead',
      Sort_Order__c = 1,
      Employer__c = employer.Id,
      Is_Current_Role__c = true
    );
    insert role;
    List<Experience_Highlight__c> highlights = new List<Experience_Highlight__c>();
    Integer total = PortfolioGroundingService.MAX_HIGHLIGHTS + 1;
    for (Integer i = 0; i < total; i++) {
      Boolean last = i == total - 1;
      highlights.add(
        new Experience_Highlight__c(
          Name = 'Highlight ' + i,
          Experience__c = role.Id,
          Description__c = last ? 'Tagged work item' : 'Work item ' + i,
          Persona_Tag__c = last ? 'Architect' : 'Admin',
          Sort_Order__c = i,
          Lock_Sort_Across_Personas__c = false
        )
      );
    }
    insert highlights;
  }

  private static Boolean groundsOnTheTaggedHighlight(String persona) {
    Test.startTest();
    String grounding = PortfolioGroundingService.build('Lead', null, persona);
    Test.stopTest();
    return grounding.contains('Tagged work item');
  }

  @IsTest
  static void titleDecidesThePersonaFirst() {
    Assert.areEqual(
      'Architect',
      PortfolioGroundingService.inferPersona(
        'Solution Architect',
        'developer developer developer'
      ),
      'The title wins over the description'
    );
    Assert.areEqual(
      'Developer',
      PortfolioGroundingService.inferPersona('Software Engineer', null),
      'Engineer reads as Developer'
    );
    Assert.areEqual(
      'Admin',
      PortfolioGroundingService.inferPersona('Salesforce Administrator', ''),
      'Administrator reads as Admin'
    );
  }

  @IsTest
  static void architectOutranksDeveloperInTheSameTitle() {
    Assert.areEqual(
      'Architect',
      PortfolioGroundingService.inferPersona('Developer Architect', null),
      'Architect is checked first'
    );
  }

  @IsTest
  static void descriptionDecidesWhenTheTitleHasNoPersonaWord() {
    Assert.areEqual(
      'Developer',
      PortfolioGroundingService.inferPersona(
        'Platform Lead',
        'Write Apex and LWC, review the architecture'
      ),
      'Two developer words against one architect word'
    );
  }

  @IsTest
  static void tiedDescriptionGivesNoPersona() {
    Assert.isNull(
      PortfolioGroundingService.inferPersona(
        'Platform Lead',
        'Admin and architecture'
      ),
      'One each is a tie'
    );
  }

  @IsTest
  static void jobWithNoPersonaWordGivesNoPersona() {
    Assert.isNull(
      PortfolioGroundingService.inferPersona('Operations Lead', null),
      'Nothing to infer'
    );
    Assert.isNull(
      PortfolioGroundingService.inferPersona(null, null),
      'Blank job'
    );
  }

  @IsTest
  static void personaBoostBringsTheTaggedHighlightIn() {
    insertHighlights();

    Assert.isTrue(
      groundsOnTheTaggedHighlight('Architect'),
      'The Architect highlight outranks untagged ones'
    );
  }

  @IsTest
  static void withoutPersonaTheTaggedHighlightStaysOut() {
    insertHighlights();

    Assert.isFalse(
      groundsOnTheTaggedHighlight(null),
      'Record order keeps the first eight'
    );
  }

  @IsTest
  static void removeContactDetailsClearsEmailAndPhone() {
    String cleaned = PortfolioGroundingService.removeContactDetails(
      'Mail  jobs@acme.example or call +1 555-014-2424.'
    );

    Assert.isFalse(cleaned.contains('@'), 'No email');
    Assert.isFalse(PHONE_SHAPE.matcher(cleaned).find(), 'No phone');
    Assert.isTrue(cleaned.startsWith('Mail [removed] or call'), cleaned);
  }

  @IsTest
  static void removeContactDetailsOfBlankIsNull() {
    Assert.isNull(
      PortfolioGroundingService.removeContactDetails('  '),
      'Blank text'
    );
  }

  @IsTest
  static void removeContactDetailsCutsVeryLongText() {
    String cleaned = PortfolioGroundingService.removeContactDetails(
      'word '.repeat(PortfolioGroundingService.MAX_JOB_TEXT_CHARS / 5 + 500)
    );

    Assert.isTrue(
      cleaned.length() <= PortfolioGroundingService.MAX_JOB_TEXT_CHARS,
      'Cut to the page limit'
    );
  }
}
