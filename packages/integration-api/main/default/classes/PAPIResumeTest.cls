/**
 * @description       : Unit tests for PAPIResume REST resource.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 01/02/2026
 **/
@IsTest
private class PAPIResumeTest {
  @TestSetup
  static void setup() {
    Contact c = new Contact(
      FirstName = 'Test',
      LastName = 'User',
      Email = 'test@test.com',
      Phone = '(555) 014-2424',
      MobilePhone = '555-014-2425',
      Is_Portfolio_Owner__c = true,
      Title = 'Architect',
      LinkedIn_URL__c = 'https://www.linkedin.com/in/test-user',
      Portfolio_URL__c = 'https://example.com/portfolio'
    );
    insert c;

    Account employer = new Account(Name = 'Employer Inc');
    insert employer;

    Experience__c exp = new Experience__c(
      Employer__c = employer.Id,
      Name = 'Developer',
      Start_Date__c = Date.today().addYears(-1),
      End_Date__c = Date.today(),
      Is_Current_Role__c = false,
      Sort_Order__c = 1,
      Contact__c = c.Id
    );
    insert exp;

    Experience_Highlight__c h = new Experience_Highlight__c(
      Experience__c = exp.Id,
      Name = 'Highlight 1',
      Description__c = 'Did great things',
      Persona_Tag__c = 'Architect',
      Sort_Order__c = 1
    );
    insert h;

    Skill__c skill = new Skill__c(
      Name = 'Apex',
      Category__c = 'Backend',
      Proficiency__c = 5
    );
    insert skill;

    Account sfAccount = new Account(Name = 'Salesforce');
    insert sfAccount;

    Certification__c cert = new Certification__c(
      Name = 'Platform Developer I',
      Issuer__c = sfAccount.Id,
      Contact__c = c.Id,
      Earned_Date__c = Date.today().addMonths(-6)
    );
    insert cert;

    Account uniAccount = new Account(Name = 'Test University');
    insert uniAccount;

    Education__c edu = new Education__c(
      Issuer__c = uniAccount.Id,
      Contact__c = c.Id,
      Name = 'B.S.',
      Field_of_Study__c = 'Computer Science',
      Graduation_Date__c = Date.today().addYears(-5)
    );
    insert edu;
  }

  @IsTest
  static void testGenerateResumeDefaultPersona() {
    RestTestUtil.initGet('/services/apexrest/papi/v1/resume/generate');

    Test.startTest();
    PAPIResume.getResume();
    Test.stopTest();

    RestResponse res = RestTestUtil.getResponse();
    System.assertEquals(200, res.statusCode, 'Should return 200 OK');

    String responseJson = res.responseBody.toString();
    System.assert(
      responseJson.contains('generatedText'),
      'Response should contain generatedText'
    );
    System.assert(
      responseJson.contains('EXPERIENCE'),
      'Response should contain EXPERIENCE section'
    );
    System.assertEquals(
      'no-store, no-cache',
      res.headers.get('Cache-Control'),
      'Generated resume is no-store'
    );
  }

  @IsTest
  static void testGenerateResumeWithPersona() {
    RestTestUtil.initGet(
      '/services/apexrest/papi/v1/resume/generate',
      new Map<String, String>{ 'persona' => 'Architect' }
    );

    Test.startTest();
    PAPIResume.getResume();
    Test.stopTest();

    RestResponse res = RestTestUtil.getResponse();
    System.assertEquals(200, res.statusCode, 'Should return 200 OK');

    String responseJson = res.responseBody.toString();
    System.assert(
      responseJson.contains('"persona":"Architect"'),
      'Response should contain Architect persona'
    );
  }

  @IsTest
  static void testGenerateResumeInvalidPersona() {
    RestTestUtil.initGet(
      '/services/apexrest/papi/v1/resume/generate',
      new Map<String, String>{ 'persona' => 'InvalidPersona' }
    );

    Test.startTest();
    PAPIResume.getResume();
    Test.stopTest();

    RestResponse res = RestTestUtil.getResponse();
    System.assertEquals(400, res.statusCode, 'Should return 400 Bad Request');
  }

  @IsTest
  static void testGenerateResumeInvalidEndpoint() {
    RestTestUtil.initGet('/services/apexrest/papi/v1/resume/invalid');

    Test.startTest();
    PAPIResume.getResume();
    Test.stopTest();

    RestResponse res = RestTestUtil.getResponse();
    System.assertEquals(400, res.statusCode, 'Should return 400 Bad Request');
  }

  @IsTest
  static void testGenerateResumeInternalError() {
    RestTestUtil.initGet('/services/apexrest/papi/v1/resume/generate');
    PAPIResume.throwException = true;

    Test.startTest();
    PAPIResume.getResume();
    Test.stopTest();

    RestResponse res = RestTestUtil.getResponse();
    System.assertEquals(500, res.statusCode, 'Should return 500');
    System.assert(
      res.responseBody.toString().contains('INTERNAL_SERVER_ERROR'),
      'Should return correct error code'
    );
  }

  @IsTest
  static void completeResumeReportsCompleteAndNoStore() {
    RestTestUtil.initGet('/services/apexrest/papi/v1/resume/generate');

    Test.startTest();
    PAPIResume.getResume();
    Test.stopTest();

    RestResponse res = RestTestUtil.getResponse();
    Map<String, Object> body = RestTestUtil.getBodyAsMap();
    Assert.areEqual(200, res.statusCode, 'Should return 200 OK');
    Assert.areEqual('complete', body.get('integrityNote'), 'Nothing failed');
    Assert.areEqual(
      'complete',
      res.headers.get('X-Data-Integrity'),
      'Header matches the note'
    );
    Assert.areEqual(
      'no-store, no-cache',
      res.headers.get('Cache-Control'),
      'Contact makes the strictest policy no-store'
    );
  }

  @IsTest
  static void failedSkillsSectionIsOmittedAndNamed() {
    PAPITransformer.forcedSectionFailures.add('skills');
    RestTestUtil.initGet('/services/apexrest/papi/v1/resume/generate');

    Test.startTest();
    PAPIResume.getResume();
    Test.stopTest();

    RestResponse res = RestTestUtil.getResponse();
    Map<String, Object> body = RestTestUtil.getBodyAsMap();
    String text = (String) body.get('generatedText');
    Assert.areEqual(200, res.statusCode, 'A section failure is not a 500');
    Assert.areEqual(
      'partial: skills unavailable',
      body.get('integrityNote'),
      'The note names the failed section'
    );
    Assert.areEqual(
      'partial',
      res.headers.get('X-Data-Integrity'),
      'Header is partial'
    );
    Assert.isFalse(text.contains('SKILLS'), 'Skills section is left out');
    Assert.isTrue(text.contains('EXPERIENCE'), 'Other sections remain');
  }

  @IsTest
  static void everySectionFailingStillAnswers200() {
    PAPITransformer.forcedSectionFailures.addAll(
      new Set<String>{
        'contacts',
        'experience',
        'skills',
        'certifications',
        'education'
      }
    );
    RestTestUtil.initGet('/services/apexrest/papi/v1/resume/generate');

    Test.startTest();
    PAPIResume.getResume();
    Test.stopTest();

    Map<String, Object> body = RestTestUtil.getBodyAsMap();
    Assert.areEqual(200, RestTestUtil.getResponse().statusCode, 'Best effort');
    Assert.areEqual(
      'partial: contacts, experience, skills, certifications, education unavailable',
      body.get('integrityNote'),
      'Every failed section is named in read order'
    );
    Assert.areEqual('', body.get('generatedText'), 'No text without data');
  }

  @IsTest
  static void missingOwnerContactMarksPartial() {
    delete [SELECT Id FROM Contact WHERE Is_Portfolio_Owner__c = TRUE];
    RestTestUtil.initGet('/services/apexrest/papi/v1/resume/generate');

    Test.startTest();
    PAPIResume.getResume();
    Test.stopTest();

    Assert.areEqual(
      'partial: contacts unavailable',
      RestTestUtil.getBodyAsMap().get('integrityNote'),
      'No owner contact is reported as a partial resume'
    );
  }

  private static final Pattern PHONE_SHAPE = Pattern.compile(
    '\\(?\\d{3}\\)?[\\s.-]?\\d{3}[\\s.-]?\\d{4}'
  );

  @IsTest
  static void resumeHasNoEmailOrPhoneAndEndsWithTheLinks() {
    RestTestUtil.initGet('/services/apexrest/papi/v1/resume/generate');

    Test.startTest();
    PAPIResume.getResume();
    Test.stopTest();

    Map<String, Object> body = RestTestUtil.getBodyAsMap();
    String text = (String) body.get('generatedText');
    Assert.isFalse(text.contains('@'), 'No email in the resume text');
    Assert.isFalse(PHONE_SHAPE.matcher(text).find(), 'No phone in the text');
    Assert.isTrue(
      text.endsWith(
        'LinkedIn: https://www.linkedin.com/in/test-user\n' +
        'Portfolio: https://example.com/portfolio'
      ),
      'Ends with the LinkedIn and portfolio links: ' + text.right(120)
    );
  }

  @IsTest
  static void certificationLineShowsTheIssuerName() {
    Account issuer = [SELECT Id FROM Account WHERE Name = 'Salesforce'];
    RestTestUtil.initGet('/services/apexrest/papi/v1/resume/generate');

    Test.startTest();
    PAPIResume.getResume();
    Test.stopTest();

    String text = (String) RestTestUtil.getBodyAsMap().get('generatedText');
    Assert.isTrue(
      text.contains('Platform Developer I - Salesforce'),
      'Issuer name on the certification line'
    );
    Assert.isFalse(text.contains(String.valueOf(issuer.Id)), 'No Id 18');
    Assert.isFalse(
      text.contains(String.valueOf(issuer.Id).left(15)),
      'No Id 15'
    );
  }

  @IsTest
  static void skillsAreThoseOfThePrintedRolesByCategoryThenProficiency() {
    Experience__c role = [SELECT Id FROM Experience__c LIMIT 1];
    Skill__c apex = [SELECT Id FROM Skill__c WHERE Name = 'Apex'];
    apex.Category_Order__c = 2;
    update apex;
    Skill__c soql = new Skill__c(
      Name = 'SOQL',
      Category__c = 'Backend',
      Category_Order__c = 2,
      Proficiency__c = 3
    );
    Skill__c flows = new Skill__c(
      Name = 'Flow',
      Category__c = 'Automation',
      Category_Order__c = 1,
      Proficiency__c = 4
    );
    Skill__c unlinked = new Skill__c(
      Name = 'Unlinked Skill',
      Category__c = 'Backend',
      Category_Order__c = 2,
      Proficiency__c = 5
    );
    insert new List<Skill__c>{ soql, flows, unlinked };
    insert new List<Experience_Skill__c>{
      new Experience_Skill__c(Experience__c = role.Id, Skill__c = soql.Id),
      new Experience_Skill__c(Experience__c = role.Id, Skill__c = apex.Id),
      new Experience_Skill__c(Experience__c = role.Id, Skill__c = flows.Id)
    };
    RestTestUtil.initGet('/services/apexrest/papi/v1/resume/generate');

    Test.startTest();
    PAPIResume.getResume();
    Test.stopTest();

    String text = (String) RestTestUtil.getBodyAsMap().get('generatedText');
    Assert.isTrue(
      text.contains('SKILLS\n\nAutomation: Flow\nBackend: Apex, SOQL\n'),
      'Linked skills, category order then proficiency: ' + text
    );
    Assert.isFalse(text.contains('Unlinked Skill'), 'Only linked skills');
  }

  @IsTest
  static void noLinkedSkillsLeavesTheSectionOut() {
    RestTestUtil.initGet('/services/apexrest/papi/v1/resume/generate');

    Test.startTest();
    PAPIResume.getResume();
    Test.stopTest();

    String text = (String) RestTestUtil.getBodyAsMap().get('generatedText');
    Assert.isFalse(text.contains('SKILLS'), 'No linked skill, no section');
    Assert.isTrue(text.contains('EXPERIENCE'), 'Other sections remain');
  }
}
