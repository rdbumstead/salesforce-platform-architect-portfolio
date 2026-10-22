/**
 * @description       : Tests for ResumeController (Round 3 plan K1). Guest tests run as the
 *                      real Portfolio1 site guest user.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/21/2026
 **/
@isTest
private class ResumeControllerTest {
  @TestSetup
  static void setup() {
    SiteGuestTestSupport.createResumeGraph();
  }

  @isTest
  static void getResumeAsGuestReturnsEverySection() {
    User guest = SiteGuestTestSupport.preparedGuest();
    ResumeController.ResumeData resume;

    Test.startTest();
    System.runAs(guest) {
      resume = ResumeController.getResume(null);
    }
    Test.stopTest();

    Assert.isNull(resume.persona, 'Blank persona should come back null');
    Assert.areEqual('Test Owner', resume.header.name, 'Header name');
    Assert.areEqual('Solution Architect', resume.header.title, 'Header title');
    Assert.areEqual(
      'https://github.com/test-owner',
      resume.header.gitHubUrl,
      'Header GitHub link'
    );
    Assert.areEqual(3, resume.roles.size(), 'Every role is returned');
    Assert.areEqual('Test Employer', resume.roles[0].employer, 'Employer name');
    Assert.areEqual(2, resume.skillGroups.size(), 'Two skill categories');
    Assert.areEqual(2, resume.certifications.size(), 'Two certifications');
    Assert.areEqual(1, resume.education.size(), 'One education entry');
    Assert.areEqual('Test Issuer', resume.certifications[0].issuer, 'Issuer');
  }

  @isTest
  static void getResumeAsGuestSerializedResultHasNoContactDetails() {
    User guest = SiteGuestTestSupport.preparedGuest();
    String serialized;

    Test.startTest();
    System.runAs(guest) {
      serialized = JSON.serialize(ResumeController.getResume('Admin'));
    }
    Test.stopTest();

    Assert.isTrue(serialized.contains('Test Owner'), 'Owner header is present');
    Assert.isFalse(
      serialized.contains(SiteGuestTestSupport.OWNER_EMAIL),
      'No email address may reach a guest'
    );
    Assert.isFalse(
      serialized.contains(SiteGuestTestSupport.OWNER_PHONE),
      'No phone number may reach a guest'
    );
    Assert.isFalse(
      serialized.contains(SiteGuestTestSupport.OWNER_STREET),
      'No address may reach a guest'
    );
    Assert.isFalse(serialized.contains('@'), 'No email-like value at all');
  }

  @isTest
  static void getResumeRolesOrderCurrentThenNewestEnd() {
    Test.startTest();
    ResumeController.ResumeData resume = ResumeController.getResume('');
    Test.stopTest();

    Assert.areEqual(
      'Current Role',
      resume.roles[0].title,
      'Current role first'
    );
    Assert.isTrue(resume.roles[0].isCurrent, 'Current flag');
    Assert.areEqual('Past Role', resume.roles[1].title, 'Newest end date next');
    Assert.areEqual('Older Role', resume.roles[2].title, 'Oldest last');
  }

  @isTest
  static void getResumeBlankPersonaReturnsAllHighlightsBySortOrder() {
    Test.startTest();
    ResumeController.ResumeData resume = ResumeController.getResume(null);
    Test.stopTest();

    Assert.areEqual(
      new List<String>{
        'Locked',
        'Admin only',
        'Dev second',
        'Dev first',
        'Dev unsorted'
      },
      resume.roles[0].highlights,
      'Every highlight in Sort_Order__c order'
    );
  }

  @isTest
  static void getResumeDeveloperPersonaFiltersAndOrdersByPersonaSort() {
    Test.startTest();
    ResumeController.ResumeData resume = ResumeController.getResume(
      'Developer'
    );
    Test.stopTest();

    Assert.areEqual('Developer', resume.persona, 'Persona echoed');
    Assert.areEqual(
      new List<String>{ 'Locked', 'Dev first', 'Dev second', 'Dev unsorted' },
      resume.roles[0].highlights,
      'Locked row by Sort_Order__c, then Developer order, blanks last'
    );
    Assert.areEqual(
      0,
      resume.roles[1].highlights.size(),
      'Past role has no Developer highlight'
    );
  }

  @isTest
  static void getResumeArchitectPersonaUsesArchitectSort() {
    Test.startTest();
    ResumeController.ResumeData resume = ResumeController.getResume(
      'Architect'
    );
    Test.stopTest();

    Assert.areEqual(
      new List<String>{ 'Locked', 'Dev second' },
      resume.roles[0].highlights,
      'Only Architect-tagged rows'
    );
  }

  @isTest
  static void getResumeSkillGroupsOrderByCategoryThenProficiency() {
    Test.startTest();
    ResumeController.ResumeData resume = ResumeController.getResume(null);
    Test.stopTest();

    Assert.areEqual('Backend', resume.skillGroups[0].category, 'First group');
    Assert.areEqual(
      new List<String>{ 'Apex', 'SOQL Queries' },
      resume.skillGroups[0].skills,
      'Strongest first, display name when set'
    );
    Assert.areEqual('Frontend', resume.skillGroups[1].category, 'Second group');
  }

  @isTest
  static void getResumeCredentialsNewestFirst() {
    Test.startTest();
    ResumeController.ResumeData resume = ResumeController.getResume(null);
    Test.stopTest();

    Assert.areEqual('Cert New', resume.certifications[0].name, 'Newest first');
    Assert.isNull(resume.certifications[0].detail, 'Certification detail');
    Assert.areEqual(
      Date.newInstance(2024, 6, 1),
      resume.certifications[0].dateValue,
      'Earned date'
    );
    Assert.areEqual('BSc', resume.education[0].name, 'Education name');
    Assert.areEqual(
      'Test University',
      resume.education[0].issuer,
      'School name'
    );
    Assert.areEqual(
      'Computer Science',
      resume.education[0].detail,
      'Field of study'
    );
  }

  @isTest
  static void getResumeNoOwnerContactReturnsNullHeader() {
    Contact owner = [SELECT Id FROM Contact WHERE Is_Portfolio_Owner__c = TRUE];
    owner.Is_Portfolio_Owner__c = false;
    update owner;

    Test.startTest();
    ResumeController.ResumeData resume = ResumeController.getResume(null);
    Test.stopTest();

    Assert.isNull(resume.header, 'No owner means no header');
    Assert.areEqual(3, resume.roles.size(), 'Roles still returned');
  }

  @isTest
  static void getHeaderAsGuestMatchesGetResumeHeader() {
    User guest = SiteGuestTestSupport.preparedGuest();
    ResumeController.Header header;
    ResumeController.ResumeData resume;

    Test.startTest();
    System.runAs(guest) {
      header = ResumeController.getHeader();
      resume = ResumeController.getResume('Architect');
    }
    Test.stopTest();

    Assert.isNotNull(header, 'The owner header is returned');
    Assert.areEqual(
      JSON.serialize(resume.header),
      JSON.serialize(header),
      'getHeader returns exactly the header getResume returns'
    );
    Assert.areEqual('Test Owner', header.name, 'Header name');
    Assert.areEqual('Solution Architect', header.title, 'Header title');
  }

  @isTest
  static void getHeaderAsGuestSerializedResultHasNoContactDetails() {
    User guest = SiteGuestTestSupport.preparedGuest();
    String serialized;

    Test.startTest();
    System.runAs(guest) {
      serialized = JSON.serialize(ResumeController.getHeader());
    }
    Test.stopTest();

    Assert.isTrue(serialized.contains('Test Owner'), 'Owner header is present');
    Assert.isFalse(
      serialized.contains(SiteGuestTestSupport.OWNER_EMAIL),
      'No email address may reach a guest'
    );
    Assert.isFalse(
      serialized.contains(SiteGuestTestSupport.OWNER_PHONE),
      'No phone number may reach a guest'
    );
    Assert.isFalse(
      serialized.contains(SiteGuestTestSupport.OWNER_STREET),
      'No address may reach a guest'
    );
    Assert.isFalse(serialized.contains('@'), 'No email-like value at all');
  }

  @isTest
  static void getHeaderNoOwnerContactReturnsNull() {
    Contact owner = [SELECT Id FROM Contact WHERE Is_Portfolio_Owner__c = TRUE];
    owner.Is_Portfolio_Owner__c = false;
    update owner;

    Test.startTest();
    ResumeController.Header header = ResumeController.getHeader();
    Test.stopTest();

    Assert.isNull(header, 'No owner means no header');
  }

  @isTest
  static void getResumeInvalidPersonaThrows() {
    Test.startTest();
    try {
      ResumeController.getResume('Manager');
      Assert.fail('Expected AuraHandledException');
    } catch (AuraHandledException e) {
      Assert.areEqual(
        ResumeController.INVALID_PERSONA_MESSAGE,
        e.getMessage(),
        'Readable message'
      );
    }
    Test.stopTest();
  }
}
