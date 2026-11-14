/**
 * @description       : Proves every public read in this package skips records that are not
 *                      verified. Each object gets one verified record named with KEPT and one
 *                      unverified record named with DROPPED, and each read must return the
 *                      first and never the second. The reads run by their Query_Definition
 *                      name, so the deployed record and the code default are both in play.
 *                      The resume runs as the real Portfolio1 site guest, who has no read on
 *                      Is_Verified__c, to show the filter holds in system mode.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 11/14/2026
 **/
@IsTest
private class VerifiedPublicReadsTest {
  private static final String KEPT = 'Kept';
  private static final String DROPPED = 'Dropped';
  private static final String LIVE = 'Live – In Production';

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
  static void resumeShowsOnlyVerifiedItemsToTheGuest() {
    User guest = SiteGuestTestSupport.preparedGuest();
    ResumeController.ResumeData resume;
    System.runAs(guest) {
      Test.startTest();
      resume = ResumeController.getResume(null);
      Test.stopTest();
    }
    assertKeptOnly(JSON.serialize(resume), 'getResume');
  }

  @IsTest
  static void timelineShowsOnlyVerifiedItems() {
    Test.startTest();
    ResumeController.Timeline timeline = ResumeController.getTimeline();
    Test.stopTest();
    assertKeptOnly(JSON.serialize(timeline), 'getTimeline');
  }

  @IsTest
  static void resumeReadsSkipUnverifiedRows() {
    ResumeController provider = new ResumeController();
    Test.startTest();
    assertRead(provider, 'ResumeController_Highlights', roleBinds());
    assertRead(provider, 'ResumeController_Skills', noBinds());
    assertRead(provider, 'ResumeController_Certifications', noBinds());
    Test.stopTest();
  }

  @IsTest
  static void apiLabOptionsSkipUnverifiedRows() {
    ApiLabOptionsController provider = new ApiLabOptionsController();
    Test.startTest();
    assertRead(provider, 'ApiLabOptionsController_Projects', noBinds());
    assertRead(provider, 'ApiLabOptionsController_Certifications', noBinds());
    Test.stopTest();
  }

  @IsTest
  static void agentReadsSkipUnverifiedRows() {
    Test.startTest();
    assertRead(
      new PortfolioAgentCareer(),
      'PortfolioAgentCareer_Highlights',
      roleBinds()
    );
    assertRead(
      new PortfolioAgentCredentials(),
      'PortfolioAgentCredentials_Skills',
      noBinds()
    );
    assertRead(
      new PortfolioAgentCredentials(),
      'PortfolioAgentCredentials_Certifications',
      noBinds()
    );
    assertRead(
      new PortfolioAgentProjects(),
      'PortfolioAgentProjects_Projects',
      noBinds()
    );
    Test.stopTest();
  }

  @IsTest
  static void groundingReadsSkipUnverifiedRows() {
    PortfolioGroundingService provider = new PortfolioGroundingService();
    Test.startTest();
    assertRead(
      provider,
      'PortfolioGroundingService_Projects',
      new Map<String, Object>{ 'liveStatuses' => new Set<String>{ LIVE } }
    );
    assertRead(
      provider,
      'PortfolioGroundingService_SkillLinks',
      new Map<String, Object>{ 'projectIds' => projectIds() }
    );
    assertRead(provider, 'PortfolioGroundingService_Highlights', noBinds());
    Test.stopTest();
  }

  @IsTest
  static void projectCardReadsSkipUnverifiedRows() {
    ProjectCardController provider = new ProjectCardController();
    Test.startTest();
    // The cards read returns no Name, so the check is on the challenge text.
    assertRead(
      provider,
      'ProjectCardController_Cards',
      new Map<String, Object>{ 'pillarLetters' => new Set<String>{ 'A' } }
    );
    assertRead(provider, 'ProjectCardController_HomeCaseStudies', noBinds());
    Test.stopTest();
  }

  @IsTest
  static void skillGraphLinksSkipUnverifiedEnds() {
    Id keptSkill = [SELECT Id FROM Skill__c WHERE Is_Verified__c = TRUE].Id;
    Id droppedSkill = [SELECT Id FROM Skill__c WHERE Is_Verified__c = FALSE].Id;
    Id droppedCert = [
      SELECT Id
      FROM Certification__c
      WHERE Is_Verified__c = FALSE
    ]
    .Id;
    SkillGraphController provider = new SkillGraphController();
    String name = 'SkillGraphController_CertificationLinks';

    Test.startTest();
    List<Certification_Skill__c> links = (List<Certification_Skill__c>) QueryDefinitions.run(
      name,
      noBinds(),
      provider.queryDefaults().get(name)
    );
    Test.stopTest();

    Assert.areEqual(1, links.size(), 'Only the link with two verified ends');
    Assert.areEqual(keptSkill, links[0].Skill__c, 'The verified skill stays');
    Assert.areNotEqual(droppedSkill, links[0].Skill__c, 'No unverified skill');
    Assert.areNotEqual(
      droppedCert,
      links[0].Certification__c,
      'No unverified certification'
    );
  }

  @IsTest
  static void agentContextSkipsUnverifiedItems() {
    PortfolioAgentService.PortfolioContextRequest req = new PortfolioAgentService.PortfolioContextRequest();
    req.contactId = [SELECT Id FROM Contact WHERE Is_Portfolio_Owner__c = TRUE]
    .Id;
    Test.startTest();
    String context = PortfolioAgentService.getPortfolioContext(
        new List<PortfolioAgentService.PortfolioContextRequest>{ req }
      )[0]
      .jsonContext;
    Test.stopTest();
    assertKeptOnly(context, 'getPortfolioContext');
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

  private static Map<String, Object> roleBinds() {
    return new Map<String, Object>{
      'experienceIds' => new Map<Id, Experience__c>(
          [SELECT Id FROM Experience__c]
        )
        .keySet()
    };
  }

  private static Set<Id> projectIds() {
    return new Map<Id, Project__c>([SELECT Id FROM Project__c]).keySet();
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
      Status__c = LIVE,
      Is_Featured__c = true,
      Home_Sort__c = sortOrder,
      Sort_Order__c = sortOrder,
      Pillar__c = 'A',
      Challenge__c = mark + ' challenge.',
      Solution__c = mark + ' solution.',
      Business_Value__c = mark + ' value.',
      Is_Verified__c = verified
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
