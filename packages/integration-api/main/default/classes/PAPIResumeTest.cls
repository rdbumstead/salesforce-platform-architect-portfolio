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
      Category__c = 'Process Automation',
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
      text.contains(
        'SKILLS\n\nProcess Automation: Flow\nBackend: Apex, SOQL\n'
      ),
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

  // Accept: text/plain on /resume/generate.

  private static final String GENERATE_URI = '/services/apexrest/papi/v1/resume/generate';

  private class DenyingLimiter implements ApiRateLimiter {
    public ApiRequestContext.RateDecision check(
      String tierKey,
      Integer limitPerMinute
    ) {
      return new ApiRequestContext.RateDecision(false, limitPerMinute, 0, 42);
    }

    public ApiRequestContext.RateDecision checkKey(
      String callerKey,
      Integer limitPerMinute
    ) {
      return check(callerKey, limitPerMinute);
    }
  }

  private static void initWithAccept(
    String headerName,
    String accept,
    Map<String, String> params
  ) {
    Map<String, String> headers = new Map<String, String>{
      'X-Request-Id' => UUID.randomUUID().toString(),
      'X-API-Version' => 'v1'
    };
    if (headerName != null) {
      headers.put(headerName, accept);
    }
    RestTestUtil.initGetRaw(GENERATE_URI, headers, params);
  }

  private static String generateJsonText() {
    initWithAccept(null, null, null);
    PAPIResume.getResume();
    return (String) RestTestUtil.getBodyAsMap().get('generatedText');
  }

  private static void assertJsonAnswer(RestResponse res, String context) {
    Assert.areEqual(200, res.statusCode, context + ': 200');
    Assert.areEqual(
      'application/json',
      res.headers.get('Content-Type'),
      context + ': JSON content type'
    );
    Map<String, Object> body = RestTestUtil.getBodyAsMap();
    Assert.isTrue(
      body.containsKey('generatedText'),
      context + ': JSON body with generatedText'
    );
  }

  @IsTest
  static void plainTextAcceptReturnsTheTextAlone() {
    String jsonText = generateJsonText();
    initWithAccept('Accept', 'text/plain', null);

    Test.startTest();
    PAPIResume.getResume();
    Test.stopTest();

    RestResponse res = RestTestUtil.getResponse();
    Assert.areEqual(200, res.statusCode, 'Plain text is still a 200');
    Assert.areEqual(
      PAPIResume.PLAIN_TEXT_CONTENT_TYPE,
      res.headers.get('Content-Type'),
      'Content type is text/plain with UTF-8'
    );
    Assert.areEqual(
      'text/plain; charset=UTF-8',
      PAPIResume.PLAIN_TEXT_CONTENT_TYPE,
      'The exact content type string'
    );
    Assert.areEqual(
      jsonText,
      res.responseBody.toString(),
      'The body is the generated text alone, the same text the JSON carries'
    );
    Assert.isTrue(
      res.responseBody.toString().startsWith('Test User\n'),
      'Real line breaks, no JSON escaping'
    );
  }

  @IsTest
  static void plainTextKeepsEveryStandardHeader() {
    initWithAccept('Accept', 'text/plain', null);

    Test.startTest();
    PAPIResume.getResume();
    Test.stopTest();

    RestResponse res = RestTestUtil.getResponse();
    Assert.areEqual(
      'no-store, no-cache',
      res.headers.get('Cache-Control'),
      'Cache-Control unchanged'
    );
    Assert.areEqual(
      'v1',
      res.headers.get('X-API-Version'),
      'Version header unchanged'
    );
    Assert.areEqual(
      String.valueOf(ApiRequestContext.PAPI_LIMIT_PER_MINUTE),
      res.headers.get('X-RateLimit-Limit'),
      'Rate limit header unchanged'
    );
    Assert.isNotNull(
      res.headers.get('X-RateLimit-Remaining'),
      'Remaining header unchanged'
    );
    Assert.areEqual(
      'complete',
      res.headers.get('X-Data-Integrity'),
      'Integrity header unchanged'
    );
    Assert.isFalse(
      res.headers.containsKey('X-Request-Id'),
      'A valid caller id is echoed by the platform, never by Apex, as for JSON'
    );
  }

  @IsTest
  static void lowerCaseAcceptWithParametersAndAListIsPlainText() {
    initWithAccept('accept', ' text/plain;q=0.9 , application/json', null);

    Test.startTest();
    PAPIResume.getResume();
    Test.stopTest();

    RestResponse res = RestTestUtil.getResponse();
    Assert.areEqual(
      PAPIResume.PLAIN_TEXT_CONTENT_TYPE,
      res.headers.get('Content-Type'),
      'First media type wins, parameters ignored, name matched in any case'
    );
    Assert.isFalse(res.responseBody.toString().startsWith('{'), 'No JSON body');
  }

  @IsTest
  static void noAcceptHeaderKeepsJson() {
    initWithAccept(null, null, null);

    Test.startTest();
    PAPIResume.getResume();
    Test.stopTest();

    assertJsonAnswer(RestTestUtil.getResponse(), 'No Accept');
  }

  @IsTest
  static void anyMediaTypeAcceptKeepsJson() {
    initWithAccept('Accept', '*/*', null);

    Test.startTest();
    PAPIResume.getResume();
    Test.stopTest();

    assertJsonAnswer(RestTestUtil.getResponse(), 'Accept */*');
  }

  @IsTest
  static void jsonAcceptKeepsJson() {
    initWithAccept('Accept', 'application/json', null);

    Test.startTest();
    PAPIResume.getResume();
    Test.stopTest();

    assertJsonAnswer(RestTestUtil.getResponse(), 'Accept application/json');
  }

  @IsTest
  static void plainTextSecondInTheListKeepsJson() {
    initWithAccept('Accept', 'application/json, text/plain', null);

    Test.startTest();
    PAPIResume.getResume();
    Test.stopTest();

    assertJsonAnswer(RestTestUtil.getResponse(), 'text/plain second');
  }

  @IsTest
  static void badRequestWithPlainTextAcceptStaysJson() {
    initWithAccept(
      'Accept',
      'text/plain',
      new Map<String, String>{ 'persona' => 'InvalidPersona' }
    );

    Test.startTest();
    PAPIResume.getResume();
    Test.stopTest();

    assertJsonError(400, 'BAD_REQUEST');
  }

  @IsTest
  static void serverErrorWithPlainTextAcceptStaysJson() {
    initWithAccept('Accept', 'text/plain', null);
    PAPIResume.throwException = true;

    Test.startTest();
    PAPIResume.getResume();
    Test.stopTest();

    assertJsonError(500, 'INTERNAL_SERVER_ERROR');
  }

  @IsTest
  static void rateLimitWithPlainTextAcceptStaysJson() {
    initWithAccept('Accept', 'text/plain', null);
    ApiRequestContext.limiterOverride = new DenyingLimiter();

    Test.startTest();
    PAPIResume.getResume();
    Test.stopTest();

    assertJsonError(429, 'RATE_LIMIT_EXCEEDED');
  }

  private static void assertJsonError(Integer status, String errorCode) {
    RestResponse res = RestTestUtil.getResponse();
    Assert.areEqual(status, res.statusCode, 'Error status');
    Assert.areEqual(
      'application/json',
      res.headers.get('Content-Type'),
      'Errors stay JSON whatever Accept says'
    );
    Assert.areEqual(
      errorCode,
      RestTestUtil.getBodyAsMap().get('errorCode'),
      'The standard Error payload'
    );
  }
}
