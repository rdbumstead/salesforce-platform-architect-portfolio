/**
 * @description       : Test support for guest tests on the Portfolio1 site. Finds the site's
 *                      real guest user, gives it Portfolio_Guest when a fresh org has not, and
 *                      builds a small known resume and project graph. The owner Contact carries
 *                      a sentinel email and phone so tests can prove neither leaks to a guest.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/21/2026
 * @Test Class        : [ResumeControllerTest, TestimonialControllerTest, PortfolioGuestAccessTest]
 **/
@isTest
public with sharing class SiteGuestTestSupport {
  public static final String SITE_NAME = 'Portfolio1';
  public static final String GUEST_PERMISSION_SET = 'Portfolio_Guest';
  public static final String OWNER_EMAIL = 'leak.sentinel@example.com';
  public static final String OWNER_PHONE = '555-0142';
  public static final String OWNER_STREET = '42 Sentinel Street';

  /**
   * @description The Portfolio1 site's guest user with Portfolio_Guest assigned. Fails the
   *              test when the site has no guest user, because a skipped guest test proves
   *              nothing.
   * @return User The guest user.
   */
  public static User preparedGuest() {
    List<Site> sites = [
      SELECT GuestUserId
      FROM Site
      WHERE Name = :SITE_NAME
      LIMIT 1
    ];
    if (sites.isEmpty() || sites[0].GuestUserId == null) {
      Assert.fail(
        'No guest user found for site ' +
          SITE_NAME +
          '. Deploy the Portfolio site before running guest tests.'
      );
    }
    User guest = [
      SELECT Id, Username
      FROM User
      WHERE Id = :sites[0].GuestUserId
    ];
    ensureGuestPermissionSet(guest.Id);
    return guest;
  }

  private static void ensureGuestPermissionSet(Id guestId) {
    PermissionSet guestSet = [
      SELECT Id
      FROM PermissionSet
      WHERE Name = :GUEST_PERMISSION_SET
      LIMIT 1
    ];
    Integer assigned = [
      SELECT COUNT()
      FROM PermissionSetAssignment
      WHERE AssigneeId = :guestId AND PermissionSetId = :guestSet.Id
    ];
    if (assigned == 0) {
      // Setup DML in its own runAs block avoids mixed DML with the test's data inserts.
      System.runAs(new User(Id = UserInfo.getUserId())) {
        insert new PermissionSetAssignment(
          AssigneeId = guestId,
          PermissionSetId = guestSet.Id
        );
      }
    }
  }

  /**
   * @description Inserts the known resume graph: one owner Contact, three roles with
   *              highlights, three skills in two categories, two certifications, one
   *              education entry, and two projects with a skill link and an asset.
   */
  public static void createResumeGraph() {
    Account employer = new Account(Name = 'Test Employer');
    Account school = new Account(Name = 'Test University');
    Account issuer = new Account(Name = 'Test Issuer');
    insert new List<Account>{ employer, school, issuer };

    Contact owner = new Contact(
      FirstName = 'Test',
      LastName = 'Owner',
      Title = 'Solution Architect',
      Email = OWNER_EMAIL,
      Phone = OWNER_PHONE,
      MobilePhone = OWNER_PHONE,
      MailingStreet = OWNER_STREET,
      LinkedIn_URL__c = 'https://www.linkedin.com/in/test-owner',
      GitHub_URL__c = 'https://github.com/test-owner',
      Is_Portfolio_Owner__c = true,
      AccountId = employer.Id
    );
    insert owner;

    Experience__c current = experience('Current Role', 1, employer, owner);
    current.Is_Current_Role__c = true;
    current.Start_Date__c = Date.newInstance(2024, 1, 1);
    Experience__c past = experience('Past Role', 2, employer, owner);
    past.End_Date__c = Date.newInstance(2023, 12, 31);
    Experience__c older = experience('Older Role', 1, employer, owner);
    older.End_Date__c = Date.newInstance(2020, 1, 1);
    insert new List<Experience__c>{ older, past, current };

    // Developer puts "Dev first" before "Dev second", Architect sorts "Dev second" first,
    // and "Dev unsorted" has no Developer order so it sorts last. Lock_Sort_Across_Personas__c
    // defaults to true, and the Sync_Experience_Highlight_Sort_Orders flow copies one sort
    // value into every order of a locked row, so only "Locked" is locked.
    List<Experience_Highlight__c> highlights = new List<Experience_Highlight__c>{
      highlight(current, 'Admin only', 'Admin', 1),
      highlight(current, 'Dev second', 'Developer;Architect', 2),
      highlight(current, 'Dev first', 'Developer', 3),
      highlight(current, 'Locked', 'Admin;Developer;Architect', 0),
      highlight(current, 'Dev unsorted', 'Developer', 4),
      highlight(past, 'Past work', 'Admin', 1)
    };
    highlights[0].Admin_Sort_Order__c = 1;
    highlights[1].Developer_Sort_Order__c = 2;
    highlights[1].Architect_Sort_Order__c = 1;
    highlights[2].Developer_Sort_Order__c = 1;
    highlights[3].Lock_Sort_Across_Personas__c = true;
    insert highlights;

    Skill__c apex = skill('Apex', 'Backend', 1, 5, null);
    Skill__c soql = skill('SOQL', 'Backend', 1, 3, 'SOQL Queries');
    Skill__c lwc = skill('LWC', 'Frontend', 2, 4, null);
    insert new List<Skill__c>{ apex, soql, lwc };

    insert new List<Experience_Skill__c>{
      new Experience_Skill__c(Experience__c = current.Id, Skill__c = apex.Id),
      new Experience_Skill__c(Experience__c = past.Id, Skill__c = lwc.Id)
    };

    insert new List<Certification__c>{
      new Certification__c(
        Name = 'Cert Old',
        Contact__c = owner.Id,
        Issuer__c = issuer.Id,
        Earned_Date__c = Date.newInstance(2020, 6, 1)
      ),
      new Certification__c(
        Name = 'Cert New',
        Contact__c = owner.Id,
        Issuer__c = issuer.Id,
        Earned_Date__c = Date.newInstance(2024, 6, 1)
      )
    };
    insert new Education__c(
      Name = 'BSc',
      Contact__c = owner.Id,
      Issuer__c = school.Id,
      Graduation_Date__c = Date.newInstance(2015, 5, 1),
      Field_of_Study__c = 'Computer Science'
    );

    Project__c first = new Project__c(
      Name = 'Test Project One',
      Sort_Order__c = 1
    );
    Project__c second = new Project__c(
      Name = 'Test Project Two',
      Sort_Order__c = 2
    );
    insert new List<Project__c>{ first, second };
    insert new List<Project_Skill__c>{
      new Project_Skill__c(Project__c = first.Id, Skill__c = apex.Id),
      new Project_Skill__c(Project__c = second.Id, Skill__c = lwc.Id)
    };
    insert new Project_Asset__c(
      Name = 'Test Asset',
      Project__c = first.Id,
      Alt_Text__c = 'Test asset',
      Type__c = 'Link',
      External_URL__c = 'https://example.com/asset'
    );
  }

  private static Experience__c experience(
    String name,
    Integer sortOrder,
    Account employer,
    Contact owner
  ) {
    return new Experience__c(
      Name = name,
      Sort_Order__c = sortOrder,
      Employer__c = employer.Id,
      Contact__c = owner.Id
    );
  }

  private static Experience_Highlight__c highlight(
    Experience__c role,
    String description,
    String tags,
    Integer sortOrder
  ) {
    return new Experience_Highlight__c(
      Name = description,
      Experience__c = role.Id,
      Description__c = description,
      Persona_Tag__c = tags,
      Sort_Order__c = sortOrder,
      Lock_Sort_Across_Personas__c = false
    );
  }

  private static Skill__c skill(
    String name,
    String category,
    Integer categoryOrder,
    Integer proficiency,
    String displayName
  ) {
    return new Skill__c(
      Name = name,
      Category__c = category,
      Category_Order__c = categoryOrder,
      Proficiency__c = proficiency,
      Display_Name__c = displayName
    );
  }
}
