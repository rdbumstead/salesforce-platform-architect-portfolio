/**
 * @description       : Guards the guest sharing model for skills and projects. The guest
 *                      sharing rules Guest_Read_All_Skills and Guest_Read_All_Projects share a
 *                      row with the Portfolio1 site guest only when Is_Verified__c is true.
 *                      The platform writes those GuestRule shares after the transaction
 *                      commits, so a record inserted in a test never gets one. That means a
 *                      test can prove the guest never reads an unverified row in user mode,
 *                      and that internal users such as the build user still read every row.
 *                      It cannot prove the guest reads a verified row. That half needs
 *                      committed records and is checked in an org.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 11/14/2026
 **/
@IsTest
private class GuestVerifiedSharingTest {
  private static final String KEPT = 'Kept';
  private static final String DROPPED = 'Dropped';
  private static final String PREFIX = 'GVS ';

  @TestSetup
  static void setup() {
    Account employer = new Account(Name = 'GVS Employer');
    insert employer;
    Contact owner = new Contact(FirstName = 'Pat', LastName = 'GVS Owner');
    insert owner;

    Experience__c role = new Experience__c(
      Name = PREFIX + 'role',
      Employer__c = employer.Id,
      Contact__c = owner.Id,
      Start_Date__c = Date.today().addYears(-1),
      Is_Current_Role__c = true,
      Sort_Order__c = 1
    );
    insert role;

    Skill__c keptSkill = skill(KEPT, true);
    Skill__c droppedSkill = skill(DROPPED, false);
    insert new List<Skill__c>{ keptSkill, droppedSkill };

    Project__c keptProject = project(owner.Id, KEPT, true, 1);
    Project__c droppedProject = project(owner.Id, DROPPED, false, 2);
    insert new List<Project__c>{ keptProject, droppedProject };

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
    insert new List<Project_Asset__c>{
      asset(keptProject.Id, KEPT),
      asset(droppedProject.Id, DROPPED)
    };
  }

  @IsTest
  static void guestNeverReadsAnUnverifiedSkillOrProject() {
    User guest = SiteGuestTestSupport.preparedGuest();
    String dropped = '%' + DROPPED + '%';
    Integer skills;
    Integer projects;
    Test.startTest();
    System.runAs(guest) {
      skills = [
        SELECT COUNT()
        FROM Skill__c
        WHERE Name LIKE :dropped
        WITH USER_MODE
      ];
      projects = [
        SELECT COUNT()
        FROM Project__c
        WHERE Name LIKE :dropped
        WITH USER_MODE
      ];
    }
    Test.stopTest();
    Assert.areEqual(0, skills, 'The guest must not read an unverified skill');
    Assert.areEqual(
      0,
      projects,
      'The guest must not read an unverified project'
    );
  }

  @IsTest
  static void guestNeverReadsAChildOfAnUnverifiedParent() {
    User guest = SiteGuestTestSupport.preparedGuest();
    String dropped = '%' + DROPPED + '%';
    Integer projectSkills;
    Integer experienceSkills;
    Integer assets;
    Test.startTest();
    System.runAs(guest) {
      projectSkills = [
        SELECT COUNT()
        FROM Project_Skill__c
        WHERE Project__r.Name LIKE :dropped OR Skill__r.Name LIKE :dropped
        WITH USER_MODE
      ];
      experienceSkills = [
        SELECT COUNT()
        FROM Experience_Skill__c
        WHERE Skill__r.Name LIKE :dropped
        WITH USER_MODE
      ];
      assets = [
        SELECT COUNT()
        FROM Project_Asset__c
        WHERE Project__r.Name LIKE :dropped
        WITH USER_MODE
      ];
    }
    Test.stopTest();
    Assert.areEqual(
      0,
      projectSkills,
      'No project skill link with an unverified end'
    );
    Assert.areEqual(
      0,
      experienceSkills,
      'No role skill link to an unverified skill'
    );
    Assert.areEqual(0, assets, 'No asset on an unverified project');
  }

  @IsTest
  static void internalUserStillReadsEveryRow() {
    String marked = PREFIX + '%';
    Test.startTest();
    Integer skills = [
      SELECT COUNT()
      FROM Skill__c
      WHERE Name LIKE :marked
      WITH USER_MODE
    ];
    Integer projects = [
      SELECT COUNT()
      FROM Project__c
      WHERE Name LIKE :marked
      WITH USER_MODE
    ];
    Integer projectSkills = [
      SELECT COUNT()
      FROM Project_Skill__c
      WHERE Project__r.Name LIKE :marked
      WITH USER_MODE
    ];
    Integer assets = [
      SELECT COUNT()
      FROM Project_Asset__c
      WHERE Name LIKE :marked
      WITH USER_MODE
    ];
    Test.stopTest();
    Assert.areEqual(2, skills, 'An internal user keeps both skills');
    Assert.areEqual(2, projects, 'An internal user keeps both projects');
    Assert.areEqual(3, projectSkills, 'An internal user keeps every link');
    Assert.areEqual(2, assets, 'An internal user keeps both assets');
  }

  private static Skill__c skill(String mark, Boolean verified) {
    return new Skill__c(
      Name = PREFIX + mark,
      Display_Name__c = PREFIX + mark,
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
      Name = PREFIX + mark + ' project',
      Contact__c = ownerId,
      Sort_Order__c = sortOrder,
      Pillar__c = 'A',
      Challenge__c = mark + ' challenge.',
      Solution__c = mark + ' solution.',
      Business_Value__c = mark + ' value.',
      Is_Verified__c = verified
    );
  }

  private static Project_Asset__c asset(Id projectId, String mark) {
    return new Project_Asset__c(
      Name = PREFIX + mark + ' asset',
      Project__c = projectId,
      Type__c = 'Link',
      External_URL__c = 'https://example.com/' + mark.toLowerCase(),
      Alt_Text__c = mark + ' asset'
    );
  }
}
