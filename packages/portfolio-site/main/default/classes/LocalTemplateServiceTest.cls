/**
 * @description       : Unit tests for LocalTemplateService, the cover letter written with no
 *                      model: what it reads from the records, what it leaves out, its length
 *                      with real records, and that it answers with no records and no input.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 01/03/2026
 **/
@IsTest
private class LocalTemplateServiceTest {
  private static final String SENTINEL_EMAIL = 'leak.sentinel@example.com';
  private static final String EMPLOYER = 'Sentinel Employer Inc';

  private static Map<String, Object> job(
    String company,
    String title,
    String description
  ) {
    return new Map<String, Object>{
      'companyName' => company,
      'jobTitle' => title,
      'jobDescription' => description
    };
  }

  private static void insertRecords() {
    Contact owner = new Contact(
      LastName = 'Bumstead',
      FirstName = 'Ryan',
      Title = 'Salesforce Platform Architect',
      Email = SENTINEL_EMAIL,
      Phone = '555-0142',
      Is_Portfolio_Owner__c = true
    );
    insert owner;
    Account employer = new Account(Name = EMPLOYER);
    Account issuer = new Account(Name = 'Certification Issuer');
    insert new List<Account>{ employer, issuer };
    Experience__c role = new Experience__c(
      Name = 'Platform Architect',
      Sort_Order__c = 1,
      Employer__c = employer.Id,
      Is_Current_Role__c = true
    );
    insert role;
    insert new List<Experience_Highlight__c>{
      highlight(
        role.Id,
        1,
        'Designed the integration layer for an Apex and API program that serves several teams at once.'
      ),
      highlight(
        role.Id,
        2,
        'Led the move of release work into source control with automated tests on every change.'
      ),
      highlight(
        role.Id,
        3,
        'Built Lightning Web Components for a guest facing site, with accessibility checks in both themes.'
      ),
      highlight(role.Id, 4, 'A fourth highlight the letter leaves out.')
    };
    insert new List<Certification__c>{
      certification(owner.Id, issuer.Id, 'Cert One', false),
      certification(owner.Id, issuer.Id, 'Cert Two', false),
      certification(owner.Id, issuer.Id, 'Cert Retired', true)
    };
  }

  private static Experience_Highlight__c highlight(
    Id roleId,
    Integer sortOrder,
    String text
  ) {
    return new Experience_Highlight__c(
      Name = 'Highlight ' + sortOrder,
      Experience__c = roleId,
      Description__c = text,
      Persona_Tag__c = 'Architect',
      Sort_Order__c = sortOrder,
      Lock_Sort_Across_Personas__c = false
    );
  }

  private static Certification__c certification(
    Id ownerId,
    Id issuerId,
    String name,
    Boolean retired
  ) {
    return new Certification__c(
      Name = name,
      Contact__c = ownerId,
      Issuer__c = issuerId,
      Earned_Date__c = Date.newInstance(2024, 1, 1),
      Is_Retired__c = retired
    );
  }

  private static String letter(Map<String, Object> context) {
    Test.startTest();
    String text = new LocalTemplateService().generateContent('prompt', context);
    Test.stopTest();
    return text;
  }

  private static Integer wordsOf(String text) {
    return text.normalizeSpace().split(' ').size();
  }

  @IsTest
  static void isAlwaysAvailable() {
    Assert.isTrue(new LocalTemplateService().isAvailable(), 'Always');
  }

  @IsTest
  static void theLetterNamesTheCompanyAndTheRole() {
    String text = letter(job('Salesforce', 'Architect', null));

    Assert.isTrue(text.startsWith('Dear Salesforce hiring team,'), text);
    Assert.isTrue(text.contains('the Architect role at Salesforce'), text);
  }

  @IsTest
  static void theLetterUsesTheOwnersRecords() {
    insertRecords();
    PortfolioSettings.overrideNumber('Salesforce_Start_Year', 2017);

    String text = letter(job('Acme', 'Salesforce Architect', 'Apex and API'));

    Assert.isTrue(
      text.contains('My current title is Salesforce Platform Architect.'),
      text
    );
    Assert.isTrue(
      text.contains('I have worked on the Salesforce platform since 2017.'),
      text
    );
    Assert.isTrue(
      text.contains('I hold 2 current certifications.'),
      'The retired one is not counted: ' + text
    );
    Assert.isTrue(text.contains('integration layer'), 'A real highlight');
    Assert.isTrue(
      text.contains('closest to your description'),
      'Says it read the description'
    );
    Assert.isTrue(text.contains('Sincerely,\nRyan Bumstead'), text);
  }

  @IsTest
  static void theStartYearComesFromTheSetting() {
    PortfolioSettings.overrideNumber('Salesforce_Start_Year', 2019);

    String text = letter(job('Acme', 'Architect', null));

    Assert.isTrue(text.contains('since 2019'), text);
  }

  @IsTest
  static void theLetterQuotesAtMostThreeFacts() {
    insertRecords();

    String text = letter(job('Acme', 'Architect', null));

    Assert.areEqual(
      LocalTemplateService.MAX_FACTS,
      text.countMatches('\n- '),
      'Three facts'
    );
    Assert.isFalse(text.contains('fourth highlight'), 'The fourth is left out');
  }

  @IsTest
  static void withRealRecordsTheLetterIsALetterLength() {
    insertRecords();

    String text = letter(
      job('Acme', 'Salesforce Architect', 'Apex, API design and DevOps')
    );

    Integer words = wordsOf(text);
    Assert.isTrue(words >= 150 && words <= 260, words + ' words: ' + text);
  }

  @IsTest
  static void noContactDetailOrEmployerReachesTheLetter() {
    insertRecords();

    String text = letter(
      job('Acme ' + SENTINEL_EMAIL, 'Architect call 555-014-2424', null)
    );

    Assert.isFalse(text.contains('@'), 'No email: ' + text);
    Assert.isFalse(text.contains('555'), 'No phone: ' + text);
    Assert.isFalse(text.contains(EMPLOYER), 'No employer name: ' + text);
  }

  @IsTest
  static void theLastLineSaysItIsATemplate() {
    String text = letter(job('Acme', 'Architect', null));

    Assert.isTrue(
      text.endsWith(LocalTemplateService.TEMPLATE_NOTE),
      'Last line: ' + text
    );
    Assert.isTrue(
      LocalTemplateService.TEMPLATE_NOTE.contains('without an AI model'),
      'Says no model wrote it'
    );
  }

  @IsTest
  static void noRecordsAndNoInputStillGiveALetter() {
    String text = letter(new Map<String, Object>());

    Assert.isTrue(text.startsWith('Dear hiring team,'), text);
    Assert.isTrue(text.contains('the open role.'), text);
    Assert.isTrue(text.contains('Sincerely,\nRyan Bumstead'), 'Default name');
    Assert.isFalse(text.contains('null'), 'No null printed: ' + text);
    Assert.isFalse(text.contains('\n- '), 'No facts without records');
  }

  @IsTest
  static void aNullContextStillGivesALetter() {
    String text = letter(null);

    Assert.isTrue(text.endsWith(LocalTemplateService.TEMPLATE_NOTE), text);
  }

  @IsTest
  static void aMissingCompanyLeavesTheCompanyOut() {
    String text = letter(job(null, 'Architect', null));

    Assert.isTrue(text.startsWith('Dear hiring team,'), text);
    Assert.isTrue(text.contains('the Architect role. '), text);
  }

  @IsTest
  static void aNonTextValueIsTreatedAsMissing() {
    Map<String, Object> context = new Map<String, Object>{
      'companyName' => 42,
      'jobTitle' => '   '
    };

    String text = letter(context);

    Assert.isTrue(text.startsWith('Dear hiring team,'), text);
    Assert.isTrue(text.contains('the open role'), text);
  }

  @IsTest
  static void aFeaturedProjectIsAFactWhenNoHighlightIs() {
    insert new Project__c(
      Name = 'Sentinel Portfolio Project',
      Is_Featured__c = true,
      Status__c = 'Active Development',
      Sort_Order__c = 1,
      Business_Value__c = 'Cut the release time for every team'
    );

    String text = letter(job('Acme', 'Architect', null));

    Assert.isTrue(
      text.contains(
        'As Sentinel Portfolio Project: Cut the release time for every team.'
      ),
      'The project, ended as a sentence: ' + text
    );
    Assert.isTrue(text.contains('closest to the role:'), text);
  }

  @IsTest
  static void oneCertificationReadsInTheSingular() {
    Contact owner = new Contact(
      LastName = 'Owner',
      Is_Portfolio_Owner__c = true
    );
    insert owner;
    Account issuer = new Account(Name = 'Certification Issuer');
    insert issuer;
    insert certification(owner.Id, issuer.Id, 'Cert One', false);

    String text = letter(job('Acme', 'Architect', null));

    Assert.isTrue(text.contains('I hold 1 current certification.'), text);
  }

  @IsTest
  static void aFailedOwnerOrCertificationReadLeavesItsSentenceOut() {
    insertRecords();
    LocalTemplateService.failReadsForTest = new Set<String>{
      'owner',
      'certifications'
    };

    String text = letter(job('Acme', 'Architect', null));

    Assert.isFalse(text.contains('My current title'), text);
    Assert.isFalse(text.contains('current certification'), text);
    Assert.isTrue(text.contains('integration layer'), 'Facts still read');
  }

  @IsTest
  static void aFailedFactsReadStillGivesALetter() {
    insertRecords();
    LocalTemplateService.failReadsForTest = new Set<String>{ 'facts' };

    String text = letter(job('Acme', 'Architect', null));

    Assert.isTrue(text.startsWith('Dear Acme hiring team,'), text);
    Assert.isTrue(text.endsWith(LocalTemplateService.TEMPLATE_NOTE), text);
  }

  @IsTest
  static void longRecordTextIsCutAtAWord() {
    String cut = LocalTemplateService.firstWords('one two three, four five', 3);

    Assert.areEqual('one two three...', cut, 'Cut after three words');
  }

  @IsTest
  static void shortTextIsKeptWhole() {
    Assert.areEqual(
      'one two',
      LocalTemplateService.firstWords(' one  two ', 5),
      'Kept'
    );
  }
}
