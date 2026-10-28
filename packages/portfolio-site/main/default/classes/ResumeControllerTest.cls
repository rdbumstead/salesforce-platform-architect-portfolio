/**
 * @description       : Tests for ResumeController.
 *                      Guest tests run as the real Portfolio1 site guest user.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
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

  /**
   * Gives the two past roles start dates whose order is the reverse of their end dates, so
   * the tests prove the roles sort by start date: Past Role ended later but
   * started earlier than Older Role.
   */
  private static void setStartDatesAgainstEndDates() {
    List<Experience__c> roles = [
      SELECT Id, Name
      FROM Experience__c
      WHERE Name IN ('Past Role', 'Older Role')
    ];
    for (Experience__c role : roles) {
      role.Start_Date__c = role.Name == 'Past Role'
        ? Date.newInstance(2015, 1, 1)
        : Date.newInstance(2018, 1, 1);
    }
    update roles;
  }

  @isTest
  static void getResumeRolesOrderCurrentThenNewestStart() {
    setStartDatesAgainstEndDates();

    Test.startTest();
    ResumeController.ResumeData resume = ResumeController.getResume('');
    Test.stopTest();

    Assert.areEqual(
      'Current Role',
      resume.roles[0].title,
      'Current role first'
    );
    Assert.isTrue(resume.roles[0].isCurrent, 'Current flag');
    Assert.areEqual(
      'Older Role',
      resume.roles[1].title,
      'Newest start date next, though it ended earlier'
    );
    Assert.areEqual('Past Role', resume.roles[2].title, 'Oldest start last');
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
      'With no hero line set, getHeader returns exactly the header getResume returns'
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
  static void getHeaderAsGuestReturnsTheTrimmedHeroLine() {
    Contact owner = [SELECT Id FROM Contact WHERE Is_Portfolio_Owner__c = TRUE];
    owner.Hero_Line__c = '  I build Salesforce platforms people can check for themselves.  ';
    update owner;
    User guest = SiteGuestTestSupport.preparedGuest();
    ResumeController.Header header;
    ResumeController.ResumeData resume;

    Test.startTest();
    System.runAs(guest) {
      header = ResumeController.getHeader();
      resume = ResumeController.getResume(null);
    }
    Test.stopTest();

    Assert.areEqual(
      'I build Salesforce platforms people can check for themselves.',
      header.heroLine,
      'The hero line comes back trimmed'
    );
    Assert.isNull(
      resume.header.heroLine,
      'The resume header does not carry the hero line'
    );
    Assert.areEqual('Test Owner', header.name, 'The rest of the header stays');
  }

  @isTest
  static void getHeaderBlankHeroLineReturnsNull() {
    Contact owner = [SELECT Id FROM Contact WHERE Is_Portfolio_Owner__c = TRUE];
    owner.Hero_Line__c = '   ';
    update owner;

    Test.startTest();
    ResumeController.Header header = ResumeController.getHeader();
    Test.stopTest();

    Assert.isNotNull(header, 'The header is still returned');
    Assert.isNull(header.heroLine, 'A blank hero line comes back null');
  }

  @isTest
  static void getHeaderAsGuestReturnsTheTrimmedValueSentence() {
    Contact owner = [SELECT Id FROM Contact WHERE Is_Portfolio_Owner__c = TRUE];
    owner.Value_Sentence__c = '  I design Salesforce solutions and build them end to end.  ';
    update owner;
    User guest = SiteGuestTestSupport.preparedGuest();
    ResumeController.Header header;
    ResumeController.ResumeData resume;

    Test.startTest();
    System.runAs(guest) {
      header = ResumeController.getHeader();
      resume = ResumeController.getResume(null);
    }
    Test.stopTest();

    Assert.areEqual(
      'I design Salesforce solutions and build them end to end.',
      header.valueSentence,
      'The value sentence comes back trimmed'
    );
    Assert.isNull(
      resume.header.valueSentence,
      'The resume header does not carry the value sentence'
    );
    Assert.areEqual('Test Owner', header.name, 'The rest of the header stays');
  }

  @isTest
  static void getHeaderBlankValueSentenceReturnsNull() {
    Contact owner = [SELECT Id FROM Contact WHERE Is_Portfolio_Owner__c = TRUE];
    owner.Value_Sentence__c = '   ';
    update owner;

    Test.startTest();
    ResumeController.Header header = ResumeController.getHeader();
    Test.stopTest();

    Assert.isNotNull(header, 'The header is still returned');
    Assert.isNull(
      header.valueSentence,
      'A blank value sentence comes back null'
    );
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

  private static final String VERIFY_URL = 'https://trailhead.salesforce.com/en/credentials/certification-detail-print/?searchString=abc+def+ghi';
  private static final Set<String> ROLE_KEYS = new Set<String>{
    'key',
    'title',
    'employer',
    'startDate',
    'endDate',
    'isCurrent'
  };
  private static final Set<String> SCHOOL_KEYS = new Set<String>{
    'key',
    'school',
    'credential',
    'fieldOfStudy',
    'completedDate'
  };
  private static final Set<String> CERTIFICATION_KEYS = new Set<String>{
    'id',
    'name',
    'issuer',
    'earnedDate'
  };

  @isTest
  static void getResumeRetiredCertificationIsFlagged() {
    Certification__c old = [
      SELECT Id
      FROM Certification__c
      WHERE Name = 'Cert Old'
    ];
    old.Is_Retired__c = true;
    update old;

    Test.startTest();
    ResumeController.ResumeData resume = ResumeController.getResume(null);
    Test.stopTest();

    Assert.areEqual('Cert New', resume.certifications[0].name, 'Newest first');
    Assert.isFalse(resume.certifications[0].isRetired, 'Current cert');
    Assert.areEqual('Cert Old', resume.certifications[1].name, 'Older next');
    Assert.isTrue(resume.certifications[1].isRetired, 'Retired cert');
    Assert.isFalse(resume.education[0].isRetired, 'Education is never retired');
  }

  @isTest
  static void getResumeVerificationUrlReturnedExactlyWithPlusSigns() {
    ResumeController.configOverride = new Portfolio_Config__mdt(
      DeveloperName = 'Test_Config',
      Credential_Verification_URL__c = VERIFY_URL
    );

    Test.startTest();
    ResumeController.ResumeData resume = ResumeController.getResume(null);
    Test.stopTest();

    Assert.areEqual(
      VERIFY_URL,
      resume.credentialVerificationUrl,
      'Stored value comes back unchanged, plus signs included'
    );
  }

  @isTest
  static void getResumeVerificationUrlNullWhenBlank() {
    ResumeController.configOverride = new Portfolio_Config__mdt(
      DeveloperName = 'Test_Config',
      Credential_Verification_URL__c = '   '
    );

    Test.startTest();
    ResumeController.ResumeData resume = ResumeController.getResume(null);
    Test.stopTest();

    Assert.isNull(
      resume.credentialVerificationUrl,
      'A blank value means no link'
    );
  }

  @isTest
  static void getResumeVerificationUrlMatchesOrgRecordWhenNoOverride() {
    String expected;
    Portfolio_Config__mdt first;
    for (
      Portfolio_Config__mdt record : Portfolio_Config__mdt.getAll().values()
    ) {
      if (
        first == null ||
        record.DeveloperName.compareTo(first.DeveloperName) < 0
      ) {
        first = record;
      }
    }
    if (
      first != null && String.isNotBlank(first.Credential_Verification_URL__c)
    ) {
      expected = first.Credential_Verification_URL__c;
    }

    Test.startTest();
    ResumeController.ResumeData resume = ResumeController.getResume(null);
    Test.stopTest();

    Assert.areEqual(
      expected,
      resume.credentialVerificationUrl,
      'Null when the org has no record or no value, else the first record by name'
    );
  }

  @isTest
  static void getTimelineAsGuestReturnsWorkAndEducation() {
    User guest = SiteGuestTestSupport.preparedGuest();
    ResumeController.Timeline timeline;

    Test.startTest();
    System.runAs(guest) {
      timeline = ResumeController.getTimeline();
    }
    Test.stopTest();

    Assert.areEqual(3, timeline.work.size(), 'Every role is returned');
    Assert.areEqual('Test Employer', timeline.work[0].employer, 'Employer');
    Assert.areEqual(
      Date.newInstance(2024, 1, 1),
      timeline.work[0].startDate,
      'Start date'
    );
    Assert.isNotNull(timeline.work[0].key, 'Each role has a key');
    Assert.areEqual(1, timeline.education.size(), 'One school');
    Assert.areEqual(
      'Test University',
      timeline.education[0].school,
      'School name'
    );
    Assert.areEqual('BSc', timeline.education[0].credential, 'Credential');
    Assert.areEqual(
      'Computer Science',
      timeline.education[0].fieldOfStudy,
      'Field of study'
    );
    Assert.areEqual(
      Date.newInstance(2015, 5, 1),
      timeline.education[0].completedDate,
      'Completion date'
    );
  }

  @isTest
  static void getTimelineRolesCurrentThenNewestStart() {
    setStartDatesAgainstEndDates();

    Test.startTest();
    ResumeController.Timeline timeline = ResumeController.getTimeline();
    Test.stopTest();

    Assert.areEqual('Current Role', timeline.work[0].title, 'Current first');
    Assert.isTrue(timeline.work[0].isCurrent, 'Current flag');
    Assert.isNull(timeline.work[0].endDate, 'Current role has no end');
    Assert.areEqual(
      'Older Role',
      timeline.work[1].title,
      'Newest start next, though it ended earlier'
    );
    Assert.isFalse(timeline.work[1].isCurrent, 'Past role is not current');
    Assert.areEqual('Past Role', timeline.work[2].title, 'Oldest start last');
  }

  @isTest
  static void getTimelineSchoolsNewestFirst() {
    Contact owner = [SELECT Id FROM Contact WHERE Is_Portfolio_Owner__c = TRUE];
    Account school = [SELECT Id FROM Account WHERE Name = 'Test University'];
    insert new Education__c(
      Name = 'MSc',
      Contact__c = owner.Id,
      Issuer__c = school.Id,
      Graduation_Date__c = Date.newInstance(2019, 12, 1),
      Field_of_Study__c = 'Information Systems'
    );

    Test.startTest();
    ResumeController.Timeline timeline = ResumeController.getTimeline();
    Test.stopTest();

    Assert.areEqual(2, timeline.education.size(), 'Two schools');
    Assert.areEqual('MSc', timeline.education[0].credential, 'Newest first');
    Assert.areEqual('BSc', timeline.education[1].credential, 'Oldest last');
  }

  @isTest
  static void getTimelineAsGuestHasNoContactDetailsAndFixedShape() {
    User guest = SiteGuestTestSupport.preparedGuest();
    String serialized;

    Test.startTest();
    System.runAs(guest) {
      serialized = JSON.serialize(ResumeController.getTimeline());
    }
    Test.stopTest();

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
    Assert.isFalse(serialized.contains('Owner'), 'No Owner_* value');

    Map<String, Object> payload = (Map<String, Object>) JSON.deserializeUntyped(
      serialized
    );
    Assert.areEqual(
      new Set<String>{
        'work',
        'education',
        'certifications',
        'verificationUrl',
        'tabLimit',
        'salesforceStartYear'
      },
      payload.keySet(),
      'Only the three lists, the verification link, the tab limit and the start year'
    );
    for (Object entry : (List<Object>) payload.get('certifications')) {
      Assert.areEqual(
        CERTIFICATION_KEYS,
        ((Map<String, Object>) entry).keySet(),
        'Certification carries only its id, name, issuer and earned date'
      );
    }
    for (Object role : (List<Object>) payload.get('work')) {
      Assert.areEqual(
        ROLE_KEYS,
        ((Map<String, Object>) role).keySet(),
        'Role carries only the timeline fields'
      );
    }
    for (Object entry : (List<Object>) payload.get('education')) {
      Assert.areEqual(
        SCHOOL_KEYS,
        ((Map<String, Object>) entry).keySet(),
        'School carries only the timeline fields'
      );
    }
  }

  @isTest
  static void getTimelineEmptyReturnsEmptyLists() {
    delete [SELECT Id FROM Experience__c];
    delete [SELECT Id FROM Education__c];

    Test.startTest();
    ResumeController.Timeline timeline = ResumeController.getTimeline();
    Test.stopTest();

    Assert.isNotNull(timeline.work, 'Work list is never null');
    Assert.isNotNull(timeline.education, 'Education list is never null');
    Assert.areEqual(0, timeline.work.size(), 'No roles');
    Assert.areEqual(0, timeline.education.size(), 'No schools');
  }

  @isTest
  static void getTimelineEmptyCertificationsIsAnEmptyList() {
    delete [SELECT Id FROM Certification__c];

    Test.startTest();
    ResumeController.Timeline timeline = ResumeController.getTimeline();
    Test.stopTest();

    Assert.isNotNull(
      timeline.certifications,
      'Certification list is never null'
    );
    Assert.areEqual(0, timeline.certifications.size(), 'No certifications');
  }

  @isTest
  static void getTimelineAsGuestListsCurrentCertificationsNewestFirst() {
    Contact owner = [SELECT Id FROM Contact WHERE Is_Portfolio_Owner__c = TRUE];
    Account issuer = [SELECT Id FROM Account WHERE Name = 'Test Issuer'];
    insert new Certification__c(
      Name = 'Cert Retired',
      Contact__c = owner.Id,
      Issuer__c = issuer.Id,
      Earned_Date__c = Date.newInstance(2025, 1, 1),
      Is_Retired__c = true
    );
    User guest = SiteGuestTestSupport.preparedGuest();
    ResumeController.Timeline timeline;

    Test.startTest();
    System.runAs(guest) {
      timeline = ResumeController.getTimeline();
    }
    Test.stopTest();

    Assert.areEqual(
      2,
      timeline.certifications.size(),
      'Only current certifications, the retired one stays on the resume'
    );
    Assert.areEqual(
      'Cert New',
      timeline.certifications[0].name,
      'Newest first'
    );
    Assert.areEqual(
      'Test Issuer',
      timeline.certifications[0].issuer,
      'Issuer name'
    );
    Assert.areEqual(
      Date.newInstance(2024, 6, 1),
      timeline.certifications[0].earnedDate,
      'Earned date'
    );
    Assert.isNotNull(timeline.certifications[0].id, 'Each entry has an id');
    Assert.areEqual('Cert Old', timeline.certifications[1].name, 'Older next');
  }

  @isTest
  static void getTimelineVerificationUrlReturnedExactlyWithPlusSigns() {
    ResumeController.configOverride = new Portfolio_Config__mdt(
      DeveloperName = 'Test_Config',
      Credential_Verification_URL__c = VERIFY_URL
    );

    Test.startTest();
    ResumeController.Timeline timeline = ResumeController.getTimeline();
    Test.stopTest();

    Assert.areEqual(
      VERIFY_URL,
      timeline.verificationUrl,
      'Stored value comes back unchanged, plus signs included'
    );
  }

  @isTest
  static void getTimelineVerificationUrlNullWhenBlank() {
    ResumeController.configOverride = new Portfolio_Config__mdt(
      DeveloperName = 'Test_Config',
      Credential_Verification_URL__c = ''
    );

    Test.startTest();
    ResumeController.Timeline timeline = ResumeController.getTimeline();
    Test.stopTest();

    Assert.isNull(timeline.verificationUrl, 'A blank value means no link');
  }

  @isTest
  static void getTimelineTabLimitIsTheDefaultWhenTheSettingIsMissing() {
    PortfolioSettings.overrides.put('Timeline_Tab_Limit', null);

    Test.startTest();
    ResumeController.Timeline timeline = ResumeController.getTimeline();
    Test.stopTest();

    Assert.areEqual(
      ResumeController.DEFAULT_TIMELINE_TAB_LIMIT,
      timeline.tabLimit,
      'Five entries per tab when no setting is there'
    );
  }

  @isTest
  static void getTimelineTabLimitReadsTheSetting() {
    PortfolioSettings.overrideNumber('Timeline_Tab_Limit', 3);

    Test.startTest();
    ResumeController.Timeline timeline = ResumeController.getTimeline();
    Test.stopTest();

    Assert.areEqual(3, timeline.tabLimit, 'The configured value');
  }

  @isTest
  static void getTimelineTabLimitIgnoresAValueOutsideItsRange() {
    PortfolioSettings.overrides.put(
      'Timeline_Tab_Limit',
      new Portfolio_Setting__mdt(
        DeveloperName = 'Timeline_Tab_Limit',
        Number_Value__c = 0,
        Min_Value__c = 1,
        Max_Value__c = 50
      )
    );

    Test.startTest();
    ResumeController.Timeline timeline = ResumeController.getTimeline();
    Test.stopTest();

    Assert.areEqual(
      ResumeController.DEFAULT_TIMELINE_TAB_LIMIT,
      timeline.tabLimit,
      'A value below its minimum falls back to five'
    );
  }

  @isTest
  static void getTimelineStartYearIsTheDefaultWhenTheSettingIsMissing() {
    PortfolioSettings.overrides.put('Salesforce_Start_Year', null);

    Test.startTest();
    ResumeController.Timeline timeline = ResumeController.getTimeline();
    Test.stopTest();

    Assert.areEqual(
      ResumeController.DEFAULT_SALESFORCE_START_YEAR,
      timeline.salesforceStartYear,
      'The code default when no setting is there'
    );
  }

  @isTest
  static void getTimelineStartYearReadsTheSetting() {
    PortfolioSettings.overrideNumber('Salesforce_Start_Year', 2018);

    Test.startTest();
    ResumeController.Timeline timeline = ResumeController.getTimeline();
    Test.stopTest();

    Assert.areEqual(2018, timeline.salesforceStartYear, 'The configured year');
  }

  @isTest
  static void getTimelineStartYearIgnoresAValueOutsideItsRange() {
    PortfolioSettings.overrides.put(
      'Salesforce_Start_Year',
      new Portfolio_Setting__mdt(
        DeveloperName = 'Salesforce_Start_Year',
        Number_Value__c = 1900,
        Min_Value__c = 1999,
        Max_Value__c = 2100
      )
    );

    Test.startTest();
    ResumeController.Timeline timeline = ResumeController.getTimeline();
    Test.stopTest();

    Assert.areEqual(
      ResumeController.DEFAULT_SALESFORCE_START_YEAR,
      timeline.salesforceStartYear,
      'A year below its minimum falls back to the code default'
    );
  }

  private static void tagSkills(String apexTags, String soqlTags) {
    Map<String, Skill__c> skillsByName = new Map<String, Skill__c>();
    for (Skill__c skill : [
      SELECT Id, Name
      FROM Skill__c
      WHERE Name IN ('Apex', 'SOQL')
    ]) {
      skillsByName.put(skill.Name, skill);
    }
    skillsByName.get('Apex').Persona_Tag__c = apexTags;
    skillsByName.get('SOQL').Persona_Tag__c = soqlTags;
    update skillsByName.values();
  }

  @isTest
  static void getResumePersonaKeepsTaggedAndUntaggedSkills() {
    tagSkills('Developer;Architect', 'Admin');

    Test.startTest();
    ResumeController.ResumeData developer = ResumeController.getResume(
      'Developer'
    );
    ResumeController.ResumeData admin = ResumeController.getResume('Admin');
    Test.stopTest();

    Assert.areEqual(2, developer.skillGroups.size(), 'Two groups');
    Assert.areEqual(
      new List<String>{ 'Apex' },
      developer.skillGroups[0].skills,
      'The skill tagged Developer, not the one tagged Admin'
    );
    Assert.areEqual(
      new List<String>{ 'LWC' },
      developer.skillGroups[1].skills,
      'The untagged skill shows under every persona'
    );
    Assert.areEqual(
      new List<String>{ 'SOQL Queries' },
      admin.skillGroups[0].skills,
      'The skill tagged Admin only'
    );
    Assert.areEqual(
      new List<String>{ 'LWC' },
      admin.skillGroups[1].skills,
      'The untagged skill again'
    );
  }

  @isTest
  static void getResumePersonaDropsAGroupWithNoSkillLeft() {
    tagSkills('Developer', 'Admin');

    Test.startTest();
    ResumeController.ResumeData resume = ResumeController.getResume(
      'Architect'
    );
    Test.stopTest();

    Assert.areEqual(1, resume.skillGroups.size(), 'Backend has nothing left');
    Assert.areEqual(
      'Frontend',
      resume.skillGroups[0].category,
      'Only the untagged skill group'
    );
  }

  @isTest
  static void getResumeNoPersonaKeepsEveryTaggedSkill() {
    tagSkills('Developer', 'Admin');

    Test.startTest();
    ResumeController.ResumeData resume = ResumeController.getResume('  ');
    Test.stopTest();

    Assert.areEqual(
      new List<String>{ 'Apex', 'SOQL Queries' },
      resume.skillGroups[0].skills,
      'No persona means every skill, whatever its tags'
    );
    Assert.areEqual(
      new List<String>{ 'LWC' },
      resume.skillGroups[1].skills,
      'And the untagged one'
    );
  }
}
