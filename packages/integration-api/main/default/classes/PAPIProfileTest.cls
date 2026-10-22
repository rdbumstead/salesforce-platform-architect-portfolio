/**
 * @description       : Unit tests for PAPIProfile REST resource.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 01/02/2026
 **/
@IsTest
private class PAPIProfileTest {
  @TestSetup
  static void setup() {
    // Create Portfolio Owner Contact
    Contact c = new Contact(
      FirstName = 'Ryan',
      LastName = 'Bumstead',
      Email = 'ryan@test.com',
      Phone = '(555) 014-2424',
      Is_Portfolio_Owner__c = true,
      LinkedIn_URL__c = 'https://linkedin.com/in/test',
      Career_Objective__c = 'Test objective'
    );
    insert c;

    // Create Employer
    Account employer = new Account(Name = 'Test Company');
    insert employer;

    // Create Experience
    Experience__c exp = new Experience__c(
      Employer__c = employer.Id,
      Name = 'Test Architect',
      Start_Date__c = Date.today().addYears(-2),
      Sort_Order__c = 1,
      Is_Current_Role__c = true,
      Contact__c = c.Id
    );
    insert exp;

    // Create Skill
    Skill__c skill = new Skill__c(
      Name = 'Apex',
      Category__c = 'Backend',
      Proficiency__c = 5
    );
    insert skill;

    // Create Project
    Project__c proj = new Project__c(
      Name = 'Test Project',
      Status__c = 'Live – In Production',
      Sort_Order__c = 1,
      Is_Featured__c = true
    );
    insert proj;

    // Create Testimonial
    Testimonial__c t = new Testimonial__c(
      Author_Name__c = 'Jane Doe',
      Approved__c = true,
      Sort_Order__c = 1
    );
    insert t;
    // Create Education
    Education__c edu = new Education__c(
      Issuer__c = employer.Id,
      Contact__c = c.Id,
      Name = 'Bachelor of Science',
      Field_of_Study__c = 'Computer Science',
      Graduation_Date__c = Date.today().addYears(-5),
      GPA__c = 3.8
    );
    insert edu;
  }

  @IsTest
  static void testGetFullPortfolioSuccess() {
    RestTestUtil.initGet('/services/apexrest/papi/v1/profile/full');
    RestResponse res = RestTestUtil.getResponse();

    Test.startTest();
    PAPIProfile.getProfile();
    Test.stopTest();

    String responseBody = res.responseBody != null
      ? res.responseBody.toString()
      : '';
    System.assertEquals(
      200,
      res.statusCode,
      'Status should be 200. Error: ' + responseBody
    );
    System.assertNotEquals(
      null,
      res.responseBody,
      'Response body should not be null'
    );

    String responseJson = res.responseBody.toString();
    System.assert(
      responseJson.contains('contactInfo'),
      'Response should contain contactInfo'
    );
    System.assert(
      responseJson.contains('skills'),
      'Response should contain skills'
    );
    System.assert(
      responseJson.contains('experience'),
      'Response should contain experience'
    );
    System.assert(
      responseJson.contains('education'),
      'Response should contain education'
    );
    System.assert(
      responseJson.contains('Bachelor of Science'),
      'Response should contain degree name'
    );
    System.assertEquals(
      'no-store, no-cache',
      res.headers.get('Cache-Control'),
      'Full profile is no-store'
    );
    System.assertEquals(
      'complete',
      res.headers.get('X-Data-Integrity'),
      'All sources present'
    );
  }

  @IsTest
  static void testGetProfileSummarySuccess() {
    RestTestUtil.initGet('/services/apexrest/papi/v1/profile/summary');
    RestResponse res = RestTestUtil.getResponse();

    Test.startTest();
    PAPIProfile.getProfile();
    Test.stopTest();

    String responseBody = res.responseBody != null
      ? res.responseBody.toString()
      : '';
    System.assertEquals(
      200,
      res.statusCode,
      'Status should be 200. Error: ' + responseBody
    );
    System.assertEquals(
      'max-age=300, private',
      res.headers.get('Cache-Control'),
      'Summary is private'
    );
  }

  @IsTest
  static void testGetProfileInvalidEndpoint() {
    RestTestUtil.initGet('/services/apexrest/papi/v1/profile/invalid');
    RestResponse res = RestTestUtil.getResponse();

    Test.startTest();
    PAPIProfile.getProfile();
    Test.stopTest();

    System.assertEquals(400, res.statusCode, 'Should return 400 Bad Request');
  }

  @IsTest
  static void testGetProfileInternalError() {
    RestTestUtil.initGet('/services/apexrest/papi/v1/profile/full');
    RestResponse res = RestTestUtil.getResponse();
    PAPIProfile.throwException = true;

    Test.startTest();
    PAPIProfile.getProfile();
    Test.stopTest();

    System.assertEquals(
      500,
      res.statusCode,
      'Should return 500 Internal Server Error'
    );
  }

  @IsTest
  static void testGetFullPortfolioPartialWithJunctions() {
    delete [SELECT Id FROM Contact WHERE Is_Portfolio_Owner__c = TRUE];
    Experience__c exp = [SELECT Id FROM Experience__c LIMIT 1];
    Skill__c skill = [SELECT Id FROM Skill__c LIMIT 1];
    Project__c proj = [SELECT Id FROM Project__c LIMIT 1];
    insert new Experience_Skill__c(Experience__c = exp.Id, Skill__c = skill.Id);
    insert new Project_Skill__c(Project__c = proj.Id, Skill__c = skill.Id);
    insert new Project_Asset__c(
      Project__c = proj.Id,
      Name = 'Screenshot',
      Type__c = 'Image',
      Alt_Text__c = 'Home page'
    );
    RestTestUtil.initGet('/services/apexrest/papi/v1/profile/full');
    RestResponse res = RestTestUtil.getResponse();

    Test.startTest();
    PAPIProfile.getProfile();
    Test.stopTest();

    System.assertEquals(200, res.statusCode, 'Should return 200 OK');
    System.assertEquals(
      'partial',
      res.headers.get('X-Data-Integrity'),
      'Missing owner contact makes the payload partial'
    );
    System.assert(
      res.responseBody.toString().contains('Home page'),
      'Project assets should be included'
    );
  }

  @IsTest
  static void completeFullPortfolioHasCompleteNote() {
    RestTestUtil.initGet('/services/apexrest/papi/v1/profile/full');

    Test.startTest();
    PAPIProfile.getProfile();
    Test.stopTest();

    Assert.areEqual(
      'complete',
      RestTestUtil.getBodyAsMap().get('integrityNote'),
      'Every section was read'
    );
  }

  @IsTest
  static void forcedCertificationsFailureReturnsPartialWithNote() {
    PAPITransformer.forcedSectionFailures.add('certifications');
    RestTestUtil.initGet('/services/apexrest/papi/v1/profile/full');
    RestResponse res = RestTestUtil.getResponse();

    Test.startTest();
    PAPIProfile.getProfile();
    Test.stopTest();

    Map<String, Object> body = RestTestUtil.getBodyAsMap();
    Assert.areEqual(200, res.statusCode, 'A section failure is not a 500');
    Assert.areEqual(
      'partial: certifications unavailable',
      body.get('integrityNote'),
      'The note names the failed sub-query'
    );
    Assert.areEqual(
      'partial',
      res.headers.get('X-Data-Integrity'),
      'Header is partial'
    );
    Assert.areEqual(
      0,
      ((List<Object>) body.get('certifications')).size(),
      'The failed section is returned empty'
    );
    Assert.areEqual(
      1,
      ((List<Object>) body.get('education')).size(),
      'Other sections are unaffected'
    );
    Assert.areEqual(
      'no-store, no-cache',
      res.headers.get('Cache-Control'),
      'Strictest upstream policy (Contact) wins'
    );
  }

  @IsTest
  static void everySectionFailingStillAnswers200() {
    PAPITransformer.forcedSectionFailures.addAll(
      new Set<String>{
        'contacts',
        'experience',
        'experience-skills',
        'skills',
        'projects',
        'project-skills',
        'project-assets',
        'certifications',
        'education',
        'testimonials'
      }
    );
    RestTestUtil.initGet('/services/apexrest/papi/v1/profile/full');
    RestResponse res = RestTestUtil.getResponse();

    Test.startTest();
    PAPIProfile.getProfile();
    Test.stopTest();

    Map<String, Object> body = RestTestUtil.getBodyAsMap();
    Assert.areEqual(200, res.statusCode, 'Best effort aggregation');
    Assert.areEqual(
      'partial: contacts, experience, experience-skills, skills, projects, project-skills, project-assets, certifications, education, testimonials unavailable',
      body.get('integrityNote'),
      'Every failed section is named in read order'
    );
    Assert.areEqual(
      0,
      ((List<Object>) body.get('projects')).size(),
      'Projects are empty'
    );
  }

  @IsTest
  static void summaryIncludesCertificationsAndStaysPrivate() {
    RestTestUtil.initGet('/services/apexrest/papi/v1/profile/summary');
    RestResponse res = RestTestUtil.getResponse();

    Test.startTest();
    PAPIProfile.getProfile();
    Test.stopTest();

    Map<String, Object> body = RestTestUtil.getBodyAsMap();
    Assert.areEqual('complete', body.get('integrityNote'), 'Nothing failed');
    Assert.areEqual(
      1,
      ((List<Object>) body.get('education')).size(),
      'Summary now reads education'
    );
    Assert.areEqual(
      'max-age=300, private',
      res.headers.get('Cache-Control'),
      'Decisions block fixes summary at max-age=300, private'
    );
  }

  @IsTest
  static void summaryForcedEducationFailureIsPartialAndStaysPrivate() {
    PAPITransformer.forcedSectionFailures.add('education');
    RestTestUtil.initGet('/services/apexrest/papi/v1/profile/summary');
    RestResponse res = RestTestUtil.getResponse();

    Test.startTest();
    PAPIProfile.getProfile();
    Test.stopTest();

    Assert.areEqual(
      'partial: education unavailable',
      RestTestUtil.getBodyAsMap().get('integrityNote'),
      'The note names the failed section'
    );
    Assert.areEqual(
      'partial',
      res.headers.get('X-Data-Integrity'),
      'Header is partial'
    );
    Assert.areEqual(
      'max-age=300, private',
      res.headers.get('Cache-Control'),
      'A failure does not change the summary policy'
    );
  }

  @IsTest
  static void fullProfileReturnsNoOwnerEmailOrPhone() {
    RestTestUtil.initGet('/services/apexrest/papi/v1/profile/full');

    Test.startTest();
    PAPIProfile.getProfile();
    Test.stopTest();

    String raw = RestTestUtil.getResponse().responseBody.toString();
    Map<String, Object> body = RestTestUtil.getBodyAsMap();
    Map<String, Object> contactInfo = (Map<String, Object>) body.get(
      'contactInfo'
    );
    Assert.areEqual('Ryan Bumstead', contactInfo.get('fullName'), 'Name kept');
    Assert.isFalse(contactInfo.containsKey('email'), 'No email key');
    Assert.isFalse(contactInfo.containsKey('phone'), 'No phone key');
    Assert.isFalse(raw.contains('ryan@test.com'), 'Email never leaks');
    Assert.isFalse(raw.contains('014-2424'), 'Phone never leaks');
    Assert.isFalse(raw.contains('ownerEmail'), 'No ownerEmail key');
    Assert.isFalse(raw.contains('ownerPhone'), 'No ownerPhone key');
  }
}
