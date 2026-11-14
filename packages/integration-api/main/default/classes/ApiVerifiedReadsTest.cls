/**
 * @description       : Proves every SAPI and PAPI read skips records that are not verified.
 *                      Each object gets one verified record named with KEPT and one unverified
 *                      record named with DROPPED, and each read must return the first and never
 *                      the second. The reads run by their Query_Definition name, so the deployed
 *                      record and the code default are both in play, and three endpoints run end
 *                      to end.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 11/14/2026
 **/
@IsTest
private class ApiVerifiedReadsTest {
  private static final String KEPT = 'Kept';
  private static final String DROPPED = 'Dropped';

  @TestSetup
  static void setup() {
    Account employer = new Account(Name = 'Acme Employer');
    insert employer;

    Contact owner = new Contact(
      FirstName = 'Pat',
      LastName = 'Owner',
      Title = 'Platform Architect',
      Is_Portfolio_Owner__c = true
    );
    insert owner;

    Experience__c role = new Experience__c(
      Name = 'Technical Architect',
      Employer__c = employer.Id,
      Contact__c = owner.Id,
      Start_Date__c = Date.today().addYears(-2),
      Is_Current_Role__c = true,
      Sort_Order__c = 1
    );
    insert role;

    insert new List<Experience_Highlight__c>{
      highlight(role.Id, KEPT, true, 1),
      highlight(role.Id, DROPPED, false, 2)
    };

    Skill__c keptSkill = skill(KEPT, true);
    Skill__c droppedSkill = skill(DROPPED, false);
    insert new List<Skill__c>{ keptSkill, droppedSkill };

    Project__c keptProject = project(owner.Id, KEPT, true, 1);
    Project__c droppedProject = project(owner.Id, DROPPED, false, 2);
    insert new List<Project__c>{ keptProject, droppedProject };

    insert new List<Project_Asset__c>{
      asset(keptProject.Id, KEPT),
      asset(droppedProject.Id, DROPPED)
    };

    Certification__c keptCert = certification(
      owner.Id,
      employer.Id,
      KEPT,
      true
    );
    Certification__c droppedCert = certification(
      owner.Id,
      employer.Id,
      DROPPED,
      false
    );
    insert new List<Certification__c>{ keptCert, droppedCert };

    insert new List<Project_Skill__c>{
      new Project_Skill__c(
        Project__c = keptProject.Id,
        Skill__c = keptSkill.Id
      ),
      new Project_Skill__c(
        Project__c = keptProject.Id,
        Skill__c = droppedSkill.Id
      ),
      new Project_Skill__c(
        Project__c = droppedProject.Id,
        Skill__c = keptSkill.Id
      )
    };
    insert new List<Experience_Skill__c>{
      new Experience_Skill__c(Experience__c = role.Id, Skill__c = keptSkill.Id),
      new Experience_Skill__c(
        Experience__c = role.Id,
        Skill__c = droppedSkill.Id
      )
    };
    insert new List<Certification_Skill__c>{
      new Certification_Skill__c(
        Certification__c = keptCert.Id,
        Skill__c = keptSkill.Id
      ),
      new Certification_Skill__c(
        Certification__c = keptCert.Id,
        Skill__c = droppedSkill.Id
      ),
      new Certification_Skill__c(
        Certification__c = droppedCert.Id,
        Skill__c = keptSkill.Id
      )
    };
  }

  @IsTest
  static void profileReadsSkipUnverifiedRows() {
    PAPIProfile provider = new PAPIProfile();
    Test.startTest();
    assertRead(provider, 'PAPIProfile_Highlights', roleBinds('experienceIds'));
    assertRead(provider, 'PAPIProfile_Skills', noBinds());
    assertRead(provider, 'PAPIProfile_Projects', noBinds());
    assertRead(provider, 'PAPIProfile_Certifications', noBinds());
    assertRead(
      provider,
      'PAPIProfile_ExperienceSkills',
      roleBinds('experienceIds')
    );
    Test.stopTest();
  }

  @IsTest
  static void projectReadsSkipUnverifiedRows() {
    PAPIProjects provider = new PAPIProjects();
    Test.startTest();
    assertRead(provider, 'PAPIProjects_Featured', noBinds());
    assertRead(provider, 'PAPIProjects_All', noBinds());
    assertRead(
      provider,
      'PAPIProjects_Skills',
      new Map<String, Object>{ 'projectIds' => keptProjectIds() }
    );
    Test.stopTest();
  }

  @IsTest
  static void resumeReadsSkipUnverifiedRows() {
    PAPIResume provider = new PAPIResume();
    Test.startTest();
    assertRead(provider, 'PAPIResume_Highlights', roleBinds('experienceIds'));
    assertRead(provider, 'PAPIResume_Skills', roleBinds('printedRoleIds'));
    assertRead(provider, 'PAPIResume_Certifications', noBinds());
    Test.stopTest();
  }

  @IsTest
  static void systemListsSkipUnverifiedRows() {
    Test.startTest();
    assertRead(
      new SAPICertification(),
      'SAPICertification_List',
      new Map<String, Object>{
        'hasContactName' => false,
        'contactName' => null,
        'hasIssuerName' => false,
        'issuerName' => null,
        'hasCertificationName' => false,
        'certificationName' => null
      }
    );
    assertRead(
      new SAPIExperienceHighlight(),
      'SAPIExperienceHighlight_List',
      new Map<String, Object>{
        'hasExperienceId' => false,
        'experienceId' => null,
        'hasPersonas' => false,
        'adminOff' => true,
        'developerOff' => true,
        'architectOff' => true
      }
    );
    assertRead(
      new SAPIProject(),
      'SAPIProject_List',
      new Map<String, Object>{
        'hasStatus' => false,
        'status' => null,
        'hasIsFeatured' => false,
        'isFeatured' => null,
        'hasContactName' => false,
        'contactName' => null,
        'hasProjectName' => false,
        'projectName' => null
      }
    );
    assertRead(
      new SAPIProjectAsset(),
      'SAPIProjectAsset_List',
      new Map<String, Object>{ 'hasProjectId' => false, 'projectId' => null }
    );
    assertRead(
      new SAPISkill(),
      'SAPISkill_List',
      new Map<String, Object>{ 'hasCategory' => false, 'category' => null }
    );
    Test.stopTest();
  }

  @IsTest
  static void systemJoinListsSkipUnverifiedEnds() {
    Test.startTest();
    assertRead(
      new SAPIProjectSkill(),
      'SAPIProjectSkill_List',
      new Map<String, Object>{ 'hasProjectId' => false, 'projectId' => null }
    );
    assertRead(
      new SAPIExperienceSkill(),
      'SAPIExperienceSkill_List',
      new Map<String, Object>{
        'hasExperienceId' => false,
        'experienceId' => null
      }
    );
    assertRead(
      new SAPICertificationSkill(),
      'SAPICertificationSkill_List',
      new Map<String, Object>{
        'hasCertificationId' => false,
        'certificationId' => null
      }
    );
    Test.stopTest();
  }

  @IsTest
  static void projectDetailHidesAnUnverifiedProject() {
    SAPIProject provider = new SAPIProject();
    String name = 'SAPIProject_Detail';
    Id keptId = [SELECT Id FROM Project__c WHERE Is_Verified__c = TRUE].Id;
    Id droppedId = [SELECT Id FROM Project__c WHERE Is_Verified__c = FALSE].Id;

    Test.startTest();
    List<SObject> kept = QueryDefinitions.run(
      name,
      new Map<String, Object>{ 'projectId' => keptId },
      provider.queryDefaults().get(name)
    );
    List<SObject> dropped = QueryDefinitions.run(
      name,
      new Map<String, Object>{ 'projectId' => droppedId },
      provider.queryDefaults().get(name)
    );
    Test.stopTest();

    Assert.areEqual(1, kept.size(), 'The verified project is found');
    Assert.areEqual(0, dropped.size(), 'The unverified project is not found');
  }

  @IsTest
  static void skillEndpointServesOnlyVerifiedSkills() {
    RestTestUtil.initGet('/services/apexrest/sapi/v1/skills/');
    RestResponse res = RestTestUtil.getResponse();
    Test.startTest();
    SAPISkill.getSkills();
    Test.stopTest();
    Assert.areEqual(200, res.statusCode, res.responseBody?.toString());
    assertKeptOnly(res.responseBody.toString(), '/sapi/skills');
  }

  @IsTest
  static void resumeEndpointServesOnlyVerifiedItems() {
    RestTestUtil.initGet('/services/apexrest/papi/v1/resume/generate');
    RestResponse res = RestTestUtil.getResponse();
    Test.startTest();
    PAPIResume.getResume();
    Test.stopTest();
    Assert.areEqual(200, res.statusCode, res.responseBody?.toString());
    assertKeptOnly(res.responseBody.toString(), '/papi/resume/generate');
  }

  @IsTest
  static void profileEndpointServesOnlyVerifiedItems() {
    RestTestUtil.initGet('/services/apexrest/papi/v1/profile/full');
    RestResponse res = RestTestUtil.getResponse();
    Test.startTest();
    PAPIProfile.getProfile();
    Test.stopTest();
    Assert.areEqual(200, res.statusCode, res.responseBody?.toString());
    assertKeptOnly(res.responseBody.toString(), '/papi/profile/full');
  }

  // Runs the read by its record name and checks the verified row is in and the other is out.
  private static void assertRead(
    QueryDefinitions.Provider provider,
    String name,
    Map<String, Object> binds
  ) {
    QueryDefinitions.QueryDefault codeDefault = provider.queryDefaults()
      .get(name);
    Assert.isNotNull(codeDefault, name + ' is a read this class owns');
    List<SObject> rows = QueryDefinitions.run(name, binds, codeDefault);
    assertKeptOnly(JSON.serialize(rows), name);
  }

  private static void assertKeptOnly(String text, String label) {
    Assert.isTrue(text.contains(KEPT), label + ' returns the verified item');
    Assert.isFalse(
      text.contains(DROPPED),
      label + ' must not return an unverified item: ' + text
    );
  }

  private static Map<String, Object> noBinds() {
    return new Map<String, Object>();
  }

  private static Map<String, Object> roleBinds(String bindName) {
    return new Map<String, Object>{
      bindName => new Map<Id, Experience__c>([SELECT Id FROM Experience__c])
        .keySet()
    };
  }

  private static Set<Id> keptProjectIds() {
    return new Map<Id, Project__c>(
        [SELECT Id FROM Project__c WHERE Is_Verified__c = TRUE]
      )
      .keySet();
  }

  private static Experience_Highlight__c highlight(
    Id roleId,
    String mark,
    Boolean verified,
    Integer sortOrder
  ) {
    return new Experience_Highlight__c(
      Name = mark + ' highlight',
      Experience__c = roleId,
      Description__c = mark + ' highlight text.',
      Persona_Tag__c = 'Architect',
      Sort_Order__c = sortOrder,
      Is_Verified__c = verified
    );
  }

  private static Skill__c skill(String mark, Boolean verified) {
    return new Skill__c(
      Name = mark,
      Display_Name__c = mark,
      Category__c = 'Backend',
      Proficiency__c = 5,
      Category_Order__c = 10,
      Is_Verified__c = verified
    );
  }

  private static Project__c project(
    Id ownerId,
    String mark,
    Boolean verified,
    Integer sortOrder
  ) {
    return new Project__c(
      Name = mark + ' project',
      Contact__c = ownerId,
      Status__c = 'Live – In Production',
      Is_Featured__c = true,
      Sort_Order__c = sortOrder,
      Challenge__c = mark + ' challenge.',
      Solution__c = mark + ' solution.',
      Business_Value__c = mark + ' value.',
      Is_Verified__c = verified
    );
  }

  private static Project_Asset__c asset(Id projectId, String mark) {
    return new Project_Asset__c(
      Name = mark + ' diagram',
      Project__c = projectId,
      Type__c = 'Image',
      External_URL__c = 'https://example.com/' + mark + '.png',
      Alt_Text__c = mark + ' diagram'
    );
  }

  private static Certification__c certification(
    Id ownerId,
    Id issuerId,
    String mark,
    Boolean verified
  ) {
    return new Certification__c(
      Name = mark + ' certification',
      Contact__c = ownerId,
      Issuer__c = issuerId,
      Earned_Date__c = Date.today().addMonths(-6),
      Is_Retired__c = false,
      Is_Verified__c = verified
    );
  }
}
