/**
 * @description       : Tests for ResumeSnapshotService. Builds its own small resume graph with
 *                      invented names, reads the snapshot as a build user set up the way
 *                      production's is, and checks the contract, each failure path, the primary
 *                      role rules, a bulk read over 200 records and that the site guest can read
 *                      neither the new fields nor the snapshot.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 11/14/2026
 * @Test Class        : [ResumeSnapshotServiceTest]
 **/
@isTest
private class ResumeSnapshotServiceTest {
  private static final Integer BULK_SKILLS = 205;
  private static final String CALL = 'ResumeSnapshotService.getSnapshot';
  private static final List<String> NEW_FIELDS = new List<String>{
    'Requirement_Tags__c',
    'Selection_Priority__c',
    'Is_Verified__c',
    'Visibility__c'
  };

  @TestSetup
  static void setup() {
    new Graph().create();
    SiteExportTestSupport.createBuildUser();
  }

  /** Builds the test graph: two current roles at two employers, one of them primary. */
  private class Graph {
    private void create() {
      Account primaryEmployer = new Account(Name = 'Sample Employer Alpha');
      Account sideEmployer = new Account(Name = 'Sample Employer Beta');
      insert new List<Account>{ primaryEmployer, sideEmployer };
      Contact owner = new Contact(
        FirstName = 'Snapshot',
        LastName = 'Owner',
        Is_Portfolio_Owner__c = true,
        AccountId = primaryEmployer.Id
      );
      insert owner;

      Experience__c primary = role('Lead Engineer', primaryEmployer, owner, 1);
      primary.Is_Current_Role__c = true;
      primary.Is_Primary_Role__c = true;
      primary.Start_Date__c = Date.newInstance(2025, 4, 1);
      Experience__c sideRole = role(
        'Part Time Advisor',
        sideEmployer,
        owner,
        2
      );
      sideRole.Is_Current_Role__c = true;
      sideRole.Start_Date__c = Date.newInstance(2023, 1, 1);
      Experience__c older = role('Analyst', sideEmployer, owner, 3);
      older.Start_Date__c = Date.newInstance(2018, 1, 1);
      older.End_Date__c = Date.newInstance(2022, 12, 31);
      insert new List<Experience__c>{ primary, sideRole, older };

      Experience_Highlight__c tagged = bullet(
        primary,
        'Led a release train',
        1
      );
      tagged.Requirement_Tags__c = 'ci-cd;leadership';
      tagged.Is_Verified__c = true;
      tagged.Selection_Priority__c = '1';
      insert new List<Experience_Highlight__c>{
        tagged,
        bullet(primary, 'Built an integration layer', 2),
        bullet(older, 'Wrote reports', 1)
      };

      List<Skill__c> skills = new List<Skill__c>();
      for (Integer i = 0; i < BULK_SKILLS; i++) {
        skills.add(
          new Skill__c(
            Name = 'Skill ' + String.valueOf(i).leftPad(3, '0'),
            Category_Order__c = 1
          )
        );
      }
      insert skills;
      insert new Project__c(Name = 'Invented Project', Sort_Order__c = 1);
      insert new Certification__c(
        Name = 'Invented Credential',
        Contact__c = owner.Id
      );
      insert new List<Resume_Variant__c>{
        variant('engineer-headline', 'Headline', 'An invented headline'),
        variant('engineer-summary', 'Summary', 'An invented summary.')
      };
    }

    private Experience__c role(
      String name,
      Account employer,
      Contact owner,
      Integer sortOrder
    ) {
      return new Experience__c(
        Name = name,
        Employer__c = employer.Id,
        Contact__c = owner.Id,
        Sort_Order__c = sortOrder
      );
    }

    private Experience_Highlight__c bullet(
      Experience__c role,
      String text,
      Integer sortOrder
    ) {
      return new Experience_Highlight__c(
        Name = text,
        Experience__c = role.Id,
        Description__c = text,
        Persona_Tag__c = 'Developer',
        Sort_Order__c = sortOrder
      );
    }
  }

  private static Resume_Variant__c variant(
    String key,
    String variantType,
    String text
  ) {
    return new Resume_Variant__c(
      Name = key,
      Public_Key__c = key,
      Variant_Type__c = variantType,
      Title_Family__c = 'engineer',
      Text__c = text
    );
  }

  private static User buildUser() {
    return [
      SELECT Id
      FROM User
      WHERE
        Username LIKE :SiteExportTestSupport.BUILD_USERNAME_PREFIX + '%'
        AND Alias = 'sitebld'
      LIMIT 1
    ];
  }

  private static ResumeSnapshotService.Snapshot buildAsBuildUser() {
    ResumeSnapshotService.Snapshot snapshot;
    System.runAs(buildUser()) {
      snapshot = ResumeSnapshotService.build();
    }
    return snapshot;
  }

  private static String failureAsBuildUser() {
    try {
      buildAsBuildUser();
    } catch (ResumeSnapshotService.SnapshotException e) {
      return e.getMessage();
    }
    Assert.fail('The snapshot should have refused the data');
    return null;
  }

  private static ResumeSnapshotService.Item itemById(
    ResumeSnapshotService.Snapshot snapshot,
    String id
  ) {
    for (ResumeSnapshotService.Item item : snapshot.items) {
      if (item.id == id) {
        return item;
      }
    }
    return null;
  }

  private static String keyOf(String description) {
    return [
      SELECT Public_Key__c
      FROM Experience_Highlight__c
      WHERE Name = :description
      LIMIT 1
    ]
    .Public_Key__c;
  }

  @isTest
  static void shouldReadEveryItemInBulkWhenOverTwoHundredRecords() {
    Test.startTest();
    ResumeSnapshotService.Snapshot snapshot = buildAsBuildUser();
    Test.stopTest();
    Map<String, Integer> counts = new Map<String, Integer>();
    for (ResumeSnapshotService.Item item : snapshot.items) {
      counts.put(item.itemType, (counts.get(item.itemType) ?? 0) + 1);
    }
    Assert.areEqual(BULK_SKILLS, counts.get('skill'), 'Every skill is read');
    Assert.areEqual(3, counts.get('bullet'), 'Every bullet is read');
    Assert.areEqual(1, counts.get('project'), 'The project is read');
    Assert.areEqual(1, counts.get('certification'), 'The credential is read');
    Assert.areEqual(1, counts.get('headline'), 'The headline is read');
    Assert.areEqual(1, counts.get('summary'), 'The summary is read');
    Assert.areEqual(3, snapshot.roles.size(), 'Every role is read');
    Assert.areEqual(1, snapshot.version, 'The contract version');
  }

  @isTest
  static void shouldNameThePrimaryEmployerWhenTwoRolesAreCurrent() {
    Test.startTest();
    ResumeSnapshotService.Snapshot snapshot = buildAsBuildUser();
    Test.stopTest();
    Assert.areEqual('Snapshot Owner', snapshot.owner.name, 'The owner');
    Assert.areEqual(
      'Sample Employer Alpha',
      snapshot.owner.currentEmployer,
      'The primary role decides the current employer'
    );
    Integer current = 0;
    for (ResumeSnapshotService.Role role : snapshot.roles) {
      current += role.current ? 1 : 0;
    }
    Assert.areEqual(2, current, 'Both current roles keep their current flag');
  }

  @isTest
  static void shouldCarryTagsPriorityAndVerifiedWhenSet() {
    Test.startTest();
    ResumeSnapshotService.Snapshot snapshot = buildAsBuildUser();
    Test.stopTest();
    ResumeSnapshotService.Item tagged = itemById(
      snapshot,
      keyOf('Led a release train')
    );
    Assert.areEqual(
      new List<String>{ 'ci-cd', 'leadership' },
      tagged.tags,
      'Tags come out as a list'
    );
    Assert.areEqual(1, tagged.priority, 'Priority comes out as a number');
    Assert.isTrue(tagged.verified, 'A verified item says so');
    Assert.areEqual('public', tagged.visibility, 'Visibility in lower case');
    Assert.isNotNull(tagged.roleId, 'A bullet names its role');
  }

  @isTest
  static void shouldMarkANewItemUnverifiedWhenNotTicked() {
    Test.startTest();
    ResumeSnapshotService.Snapshot snapshot = buildAsBuildUser();
    Test.stopTest();
    ResumeSnapshotService.Item fresh = itemById(snapshot, 'engineer-summary');
    Assert.isFalse(fresh.verified, 'A new item starts unverified');
    Assert.areEqual(2, fresh.priority, 'A new item starts at priority 2');
    Assert.areEqual(0, fresh.tags.size(), 'No tags is an empty list');
    Assert.isNull(fresh.roleId, 'Only bullets carry a role');
  }

  @isTest
  static void shouldWriteTheContractKeysWhenReadThroughTheExport() {
    RestResponse res;
    Test.startTest();
    System.runAs(buildUser()) {
      res = SiteExportTestSupport.get(CALL, null);
    }
    Test.stopTest();
    Map<String, Object> body = (Map<String, Object>) JSON.deserializeUntyped(
      res.responseBody.toString()
    );
    Assert.areEqual(200, res.statusCode, 'The build user reads the snapshot');
    Map<String, Object> result = (Map<String, Object>) body.get('result');
    Assert.areEqual(
      new Set<String>{ 'version', 'generatedAt', 'owner', 'roles', 'items' },
      result.keySet(),
      'The top level keys of the contract'
    );
    Map<String, Object> firstRole = (Map<String, Object>) ((List<Object>) result.get(
      'roles'
    ))[0];
    Assert.isTrue(
      firstRole.keySet()
        .containsAll(
          new Set<String>{ 'id', 'employer', 'title', 'start', 'current' }
        ),
      'Role keys of the contract'
    );
    Map<String, Object> firstItem = (Map<String, Object>) ((List<Object>) result.get(
      'items'
    ))[0];
    Assert.isTrue(
      firstItem.keySet()
        .containsAll(
          new Set<String>{
            'id',
            'type',
            'text',
            'tags',
            'priority',
            'verified',
            'visibility'
          }
        ),
      'Item keys of the contract'
    );
  }

  @isTest
  static void shouldFailWhenARecordIsNotPublic() {
    Skill__c skill = [SELECT Id, Public_Key__c FROM Skill__c LIMIT 1];
    skill.Visibility__c = null;
    update skill;
    Test.startTest();
    String message = failureAsBuildUser();
    Test.stopTest();
    Assert.isTrue(message.contains(skill.Public_Key__c), 'Names the record');
    Assert.isTrue(message.contains('Only Public'), 'Says why');
  }

  @isTest
  static void shouldFailWhenTwoItemsShareAnId() {
    Skill__c skill = [SELECT Public_Key__c FROM Skill__c LIMIT 1];
    insert variant(skill.Public_Key__c, 'Headline', 'A clashing headline');
    Test.startTest();
    String message = failureAsBuildUser();
    Test.stopTest();
    Assert.isTrue(message.contains('share the id'), 'Says two items clash');
  }

  @isTest
  static void shouldFailWhenAnItemHasNoId() {
    insert variant(null, 'Summary', 'A summary with no key');
    Test.startTest();
    String message = failureAsBuildUser();
    Test.stopTest();
    Assert.isTrue(
      message.contains('has no Public_Key__c'),
      'Says the id is missing'
    );
  }

  @isTest
  static void shouldFailWhenAnItemHasNoPriority() {
    Project__c project = [SELECT Id FROM Project__c LIMIT 1];
    project.Selection_Priority__c = null;
    update project;
    Test.startTest();
    String message = failureAsBuildUser();
    Test.stopTest();
    Assert.isTrue(
      message.contains('no Selection_Priority__c'),
      'Says the priority is missing'
    );
  }

  @isTest
  static void shouldFailWhenAVariantHasNoType() {
    Resume_Variant__c headline = variant('no-type', null, 'Text with no type');
    insert headline;
    Test.startTest();
    String message = failureAsBuildUser();
    Test.stopTest();
    Assert.isTrue(
      message.contains('no Variant_Type__c'),
      'Says the type is missing'
    );
  }

  @isTest
  static void shouldFailWhenNoRoleIsPrimary() {
    Experience__c primary = [
      SELECT Id
      FROM Experience__c
      WHERE Is_Primary_Role__c = TRUE
    ];
    primary.Is_Primary_Role__c = false;
    update primary;
    Test.startTest();
    String message = failureAsBuildUser();
    Test.stopTest();
    Assert.isTrue(
      message.startsWith('No role is ticked'),
      'Says no role is primary'
    );
  }

  @isTest
  static void shouldFailWhenTwoRolesArePrimary() {
    Experience__c side = [
      SELECT Id
      FROM Experience__c
      WHERE Name = 'Part Time Advisor'
    ];
    side.Is_Primary_Role__c = true;
    update side;
    Test.startTest();
    String message = failureAsBuildUser();
    Test.stopTest();
    Assert.isTrue(
      message.startsWith('2 roles are ticked'),
      'Says two roles are primary'
    );
  }

  @isTest
  static void shouldFailWhenThePrimaryRoleIsNotCurrent() {
    Experience__c primary = [
      SELECT Id
      FROM Experience__c
      WHERE Is_Primary_Role__c = TRUE
    ];
    Experience__c older = [SELECT Id FROM Experience__c WHERE Name = 'Analyst'];
    primary.Is_Primary_Role__c = false;
    older.Is_Primary_Role__c = true;
    update new List<Experience__c>{ primary, older };
    Test.startTest();
    String message = failureAsBuildUser();
    Test.stopTest();
    Assert.isTrue(
      message.contains('is not marked Is_Current_Role__c'),
      'Says the primary role must be current'
    );
  }

  @isTest
  static void shouldFailWhenNoContactIsTheOwner() {
    Contact owner = [SELECT Id FROM Contact WHERE Is_Portfolio_Owner__c = TRUE];
    owner.Is_Portfolio_Owner__c = false;
    update owner;
    Test.startTest();
    String message = failureAsBuildUser();
    Test.stopTest();
    Assert.isTrue(
      message.contains('portfolio owner'),
      'Says the owner is missing'
    );
  }

  @isTest
  static void shouldHideTheNewFieldsFromTheGuest() {
    User guest = SiteGuestTestSupport.preparedGuest();
    Map<String, Schema.SObjectType> types = Schema.getGlobalDescribe();
    List<String> readable = new List<String>();
    Boolean variantReadable;
    Test.startTest();
    System.runAs(guest) {
      for (
        String objectName : new List<String>{
          'Experience_Highlight__c',
          'Skill__c',
          'Project__c',
          'Certification__c',
          'Resume_Variant__c'
        }
      ) {
        Map<String, Schema.SObjectField> fields = types.get(objectName)
          .getDescribe()
          .fields.getMap();
        for (String fieldName : NEW_FIELDS) {
          if (fields.get(fieldName).getDescribe().isAccessible()) {
            readable.add(objectName + '.' + fieldName);
          }
        }
      }
      if (
        Schema.sObjectType.Experience__c.fields.Is_Primary_Role__c.isAccessible()
      ) {
        readable.add('Experience__c.Is_Primary_Role__c');
      }
      variantReadable = Schema.sObjectType.Resume_Variant__c.isAccessible();
    }
    Test.stopTest();
    Assert.areEqual(
      new List<String>(),
      readable,
      'The guest reads none of the new fields'
    );
    Assert.isFalse(variantReadable, 'The guest cannot read the variant object');
  }

  @isTest
  static void shouldRefuseTheGuestWhenItBuildsTheSnapshot() {
    User guest = SiteGuestTestSupport.preparedGuest();
    String message;
    Test.startTest();
    System.runAs(guest) {
      try {
        ResumeSnapshotService.build();
      } catch (ResumeSnapshotService.SnapshotException e) {
        message = e.getMessage();
      }
    }
    Test.stopTest();
    Assert.isTrue(
      message != null && message.contains('Site_Build_Export'),
      'The guest never builds the snapshot'
    );
  }

  @isTest
  static void shouldRefuseTheGuestWhenItReadsTheExport() {
    User guest = SiteGuestTestSupport.preparedGuest();
    RestResponse res;
    Test.startTest();
    System.runAs(guest) {
      res = SiteExportTestSupport.get(CALL, null);
    }
    Test.stopTest();
    Assert.areEqual(403, res.statusCode, 'The export refuses the guest');
  }

  @isTest
  static void shouldRefuseAUserWithoutTheBuildPermission() {
    User withoutPermission = SiteExportTestSupport.createUserWithoutBuildPermission();
    Boolean refused = false;
    Test.startTest();
    System.runAs(withoutPermission) {
      try {
        ResumeSnapshotService.build();
      } catch (ResumeSnapshotService.SnapshotException e) {
        refused = true;
      }
    }
    Test.stopTest();
    Assert.isTrue(refused, 'Without the build permission set nothing is read');
  }
}
