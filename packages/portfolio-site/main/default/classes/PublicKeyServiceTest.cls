/**
 * @description       : Tests for PublicKeyService and the thirteen object triggers that call it
 *                      (ADR-038). Covers the key format, assignment on insert for every object,
 *                      uniqueness in bulk, the redraw on a collision, the refusal to change or
 *                      clear a key, the lookup by key and the backfill.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/28/2026
 **/
@IsTest
private class PublicKeyServiceTest {
  private static final String KEY_FORMAT = '^[a-z]{3}_[a-km-np-z2-9]{10}$';

  private static void assertKeyShape(String key, String prefix) {
    Assert.isNotNull(key, 'A key was assigned for ' + prefix);
    Assert.isTrue(
      Pattern.matches(KEY_FORMAT, key),
      'Key has the format: ' + key
    );
    Assert.isTrue(key.startsWith(prefix + '_'), 'Key starts with ' + prefix);
    Assert.areEqual(14, key.length(), 'Prefix, underscore and 10 characters');
  }

  /** Inserts one record of every object that carries a key, returned by object. */
  private static Map<SObjectType, SObject> insertOneOfEach() {
    Account account = new Account(Name = 'Key Employer');
    insert account;
    Contact contact = new Contact(LastName = 'Key Owner');
    insert contact;
    Skill__c skill = new Skill__c(Name = 'Key Skill', Proficiency__c = 3);
    insert skill;
    Experience__c experience = new Experience__c(
      Name = 'Key Role',
      Employer__c = account.Id,
      Contact__c = contact.Id,
      Start_Date__c = Date.today().addYears(-1)
    );
    insert experience;
    Experience_Highlight__c highlight = new Experience_Highlight__c(
      Name = 'Key Highlight',
      Experience__c = experience.Id,
      Description__c = 'Key highlight text'
    );
    insert highlight;
    Experience_Skill__c experienceSkill = new Experience_Skill__c(
      Experience__c = experience.Id,
      Skill__c = skill.Id
    );
    insert experienceSkill;
    Project__c project = new Project__c(Name = 'Key Project');
    insert project;
    Project_Asset__c asset = new Project_Asset__c(
      Name = 'Key Asset',
      Project__c = project.Id,
      Type__c = 'Link',
      External_URL__c = 'https://example.com/asset'
    );
    insert asset;
    Project_Skill__c projectSkill = new Project_Skill__c(
      Project__c = project.Id,
      Skill__c = skill.Id
    );
    insert projectSkill;
    Certification__c certification = new Certification__c(
      Name = 'Key Cert',
      Contact__c = contact.Id,
      Issuer__c = account.Id
    );
    insert certification;
    Certification_Skill__c certificationSkill = new Certification_Skill__c(
      Certification__c = certification.Id,
      Skill__c = skill.Id
    );
    insert certificationSkill;
    Education__c education = new Education__c(
      Name = 'Key Degree',
      Contact__c = contact.Id,
      Issuer__c = account.Id
    );
    insert education;
    Testimonial__c testimonial = new Testimonial__c(
      Author_Name__c = 'Key Author',
      Approved__c = true,
      Relationship_Type__c = 'Manager',
      Vibe_Mode__c = 'Professional'
    );
    insert testimonial;

    return new Map<SObjectType, SObject>{
      Account.SObjectType => account,
      Contact.SObjectType => contact,
      Skill__c.SObjectType => skill,
      Experience__c.SObjectType => experience,
      Experience_Highlight__c.SObjectType => highlight,
      Experience_Skill__c.SObjectType => experienceSkill,
      Project__c.SObjectType => project,
      Project_Asset__c.SObjectType => asset,
      Project_Skill__c.SObjectType => projectSkill,
      Certification__c.SObjectType => certification,
      Certification_Skill__c.SObjectType => certificationSkill,
      Education__c.SObjectType => education,
      Testimonial__c.SObjectType => testimonial
    };
  }

  @IsTest
  static void shouldHaveOnePrefixPerObject_WhenListed() {
    Set<String> prefixes = new Set<String>();
    for (SObjectType objectType : PublicKeyService.OBJECT_TYPES) {
      String prefix = PublicKeyService.prefixFor(objectType);
      Assert.isNotNull(prefix, 'Prefix for ' + objectType);
      Assert.areEqual(3, prefix.length(), 'Prefix length for ' + objectType);
      Assert.isTrue(prefixes.add(prefix), 'Prefix is unique: ' + prefix);
    }
    Assert.areEqual(13, prefixes.size(), 'Thirteen objects carry a key');
    Assert.isNull(
      PublicKeyService.prefixFor(Lead.SObjectType),
      'An object without a key has no prefix'
    );
  }

  @IsTest
  static void shouldBuildKeyInFormat_WhenGenerated() {
    for (Integer i = 0; i < 50; i++) {
      assertKeyShape(PublicKeyService.generate('prj'), 'prj');
    }
  }

  @IsTest
  static void shouldRecogniseKeys_WhenShapeMatches() {
    Assert.isTrue(PublicKeyService.isKey('prj_8f3k2m9qtz'), 'Valid key');
    Assert.isTrue(
      PublicKeyService.isKey(' PRJ_8F3K2M9QTZ '),
      'Case and spaces'
    );
    Assert.isFalse(PublicKeyService.isKey('prj_8f3k2m9qt'), 'Too short');
    Assert.isFalse(PublicKeyService.isKey('prj_8f3k2m9qtzz'), 'Too long');
    Assert.isFalse(
      PublicKeyService.isKey('prj_8f3l2m9qtz'),
      'l is not in the alphabet'
    );
    Assert.isFalse(
      PublicKeyService.isKey('prj_8f3k2m9qt0'),
      '0 is not in the alphabet'
    );
    Assert.isFalse(PublicKeyService.isKey('a015e00000INVALID'), 'An Id shape');
    Assert.isFalse(PublicKeyService.isKey(null), 'Null');
    Assert.isFalse(PublicKeyService.isKey(''), 'Empty');
  }

  @IsTest
  static void shouldAssignKeyWithPrefix_WhenInsertingAnyObject() {
    Test.startTest();
    Map<SObjectType, SObject> inserted = insertOneOfEach();
    Test.stopTest();

    Assert.areEqual(13, inserted.size(), 'One record per object');
    for (SObjectType objectType : PublicKeyService.OBJECT_TYPES) {
      SObject record = inserted.get(objectType);
      String key = (String) Database.query(
          'SELECT Public_Key__c FROM ' +
            objectType.getDescribe().getName() +
            ' WHERE Id = \'' +
            record.Id +
            '\''
        )[0]
        .get('Public_Key__c');
      assertKeyShape(key, PublicKeyService.prefixFor(objectType));
    }
  }

  @IsTest
  static void shouldAssignDistinctKeys_WhenInsertingInBulk() {
    List<Project__c> projects = new List<Project__c>();
    for (Integer i = 0; i < 251; i++) {
      projects.add(new Project__c(Name = 'Bulk ' + i));
    }

    Test.startTest();
    insert projects;
    Test.stopTest();

    Set<String> keys = new Set<String>();
    for (Project__c project : [SELECT Public_Key__c FROM Project__c]) {
      assertKeyShape(project.Public_Key__c, 'prj');
      keys.add(project.Public_Key__c);
    }
    Assert.areEqual(251, keys.size(), 'Every project has its own key');
  }

  @IsTest
  static void shouldKeepKey_WhenRecordArrivesWithOne() {
    Project__c project = new Project__c(
      Name = 'Preset',
      Public_Key__c = 'prj_abcdefghjk'
    );

    Test.startTest();
    insert project;
    Test.stopTest();

    Assert.areEqual(
      'prj_abcdefghjk',
      [SELECT Public_Key__c FROM Project__c WHERE Id = :project.Id]
      .Public_Key__c,
      'A key the record carries is not replaced'
    );
  }

  @IsTest
  static void shouldKeepKey_WhenRenamed() {
    Project__c project = new Project__c(Name = 'Before');
    insert project;
    String before = [
      SELECT Public_Key__c
      FROM Project__c
      WHERE Id = :project.Id
    ]
    .Public_Key__c;

    Test.startTest();
    project.Name = 'After';
    update project;
    Test.stopTest();

    Assert.areEqual(
      before,
      [SELECT Public_Key__c FROM Project__c WHERE Id = :project.Id]
      .Public_Key__c,
      'A rename never changes the key'
    );
  }

  @IsTest
  static void shouldRefuseUpdate_WhenKeyChanges() {
    Project__c project = new Project__c(Name = 'Locked');
    insert project;
    project = [SELECT Id, Public_Key__c FROM Project__c WHERE Id = :project.Id];
    project.Public_Key__c = 'prj_zzzzzzzzzz';

    Test.startTest();
    Database.SaveResult result = Database.update(project, false);
    Test.stopTest();

    Assert.isFalse(result.isSuccess(), 'A changed key is refused');
    Assert.isTrue(
      result.getErrors()[0]
        .getMessage()
        .contains('cannot be changed or cleared'),
      'The error says why: ' + result.getErrors()[0].getMessage()
    );
  }

  @IsTest
  static void shouldRefuseUpdate_WhenKeyCleared() {
    Project__c project = new Project__c(Name = 'Locked');
    insert project;
    project.Public_Key__c = null;

    Test.startTest();
    Database.SaveResult result = Database.update(project, false);
    Test.stopTest();

    Assert.isFalse(result.isSuccess(), 'A cleared key is refused');
  }

  @IsTest
  static void shouldRefuseUpdate_WhenOnlyTheCaseChanges() {
    Project__c project = new Project__c(
      Name = 'Cased',
      Public_Key__c = 'prj_abcdefghjk'
    );
    insert project;
    project.Public_Key__c = 'PRJ_ABCDEFGHJK';

    Test.startTest();
    Database.SaveResult result = Database.update(project, false);
    Test.stopTest();

    Assert.isFalse(result.isSuccess(), 'The stored form is the one that stays');
  }

  @IsTest
  static void shouldAllowUpdate_WhenKeyIsTheSame() {
    Project__c project = new Project__c(Name = 'Same');
    insert project;
    project = [SELECT Id, Public_Key__c FROM Project__c WHERE Id = :project.Id];
    project.Name = 'Same again';

    Test.startTest();
    Database.SaveResult result = Database.update(project, false);
    Test.stopTest();

    Assert.isTrue(result.isSuccess(), 'An untouched key passes');
  }

  @IsTest
  static void shouldDrawAgain_WhenKeyIsTaken() {
    insert new Project__c(Name = 'Holder', Public_Key__c = 'prj_aaaaaaaaaa');
    PublicKeyService.forcedKeys = new List<String>{
      'prj_aaaaaaaaaa',
      'prj_bbbbbbbbbb'
    };
    Project__c second = new Project__c(Name = 'Second');

    Test.startTest();
    insert second;
    Test.stopTest();

    Assert.areEqual(
      'prj_bbbbbbbbbb',
      [SELECT Public_Key__c FROM Project__c WHERE Id = :second.Id]
      .Public_Key__c,
      'The taken key was skipped'
    );
  }

  @IsTest
  static void shouldDrawAgain_WhenTwoRecordsDrawTheSameKey() {
    PublicKeyService.forcedKeys = new List<String>{
      'prj_cccccccccc',
      'prj_cccccccccc',
      'prj_dddddddddd'
    };
    List<Project__c> projects = new List<Project__c>{
      new Project__c(Name = 'One'),
      new Project__c(Name = 'Two')
    };

    Test.startTest();
    PublicKeyService.assign(projects);
    Test.stopTest();

    Assert.areEqual('prj_cccccccccc', projects[0].Public_Key__c, 'First draw');
    Assert.areEqual('prj_dddddddddd', projects[1].Public_Key__c, 'Redrawn');
  }

  @IsTest
  static void shouldThrow_WhenEveryAttemptCollides() {
    insert new Project__c(Name = 'Holder', Public_Key__c = 'prj_aaaaaaaaaa');
    PublicKeyService.forcedKeys = new List<String>();
    for (Integer i = 0; i < PublicKeyService.MAX_ATTEMPTS; i++) {
      PublicKeyService.forcedKeys.add('prj_aaaaaaaaaa');
    }

    Test.startTest();
    try {
      PublicKeyService.assign(
        new List<Project__c>{ new Project__c(Name = 'X') }
      );
      Assert.fail('Expected PublicKeyException');
    } catch (PublicKeyService.PublicKeyException e) {
      Assert.isTrue(
        e.getMessage().contains('Project__c'),
        'The message names the object: ' + e.getMessage()
      );
    }
    Test.stopTest();
  }

  @IsTest
  static void shouldDoNothing_WhenListIsNullOrEmpty() {
    PublicKeyService.assign(null);
    PublicKeyService.assign(new List<Project__c>());
    PublicKeyService.refuseChange(null, null);
    Assert.areEqual(0, [SELECT COUNT() FROM Project__c], 'Nothing was written');
  }

  @IsTest
  static void shouldFindRecord_WhenKeyMatches() {
    Project__c project = new Project__c(Name = 'Findable');
    insert project;
    String key = [SELECT Public_Key__c FROM Project__c WHERE Id = :project.Id]
    .Public_Key__c;

    Test.startTest();
    Id found = PublicKeyService.findId(
      Project__c.SObjectType,
      key.toUpperCase()
    );
    Id wrongObject = PublicKeyService.findId(Skill__c.SObjectType, key);
    Id unknown = PublicKeyService.findId(
      Project__c.SObjectType,
      'prj_abcdefghjk'
    );
    Id notAKey = PublicKeyService.findId(Project__c.SObjectType, 'nonsense');
    Test.stopTest();

    Assert.areEqual(project.Id, found, 'The key finds its record, any case');
    Assert.isNull(wrongObject, 'A key is only looked up on its own object');
    Assert.isNull(unknown, 'An unknown key finds nothing');
    Assert.isNull(notAKey, 'Text that is not a key finds nothing');
  }

  @IsTest
  static void shouldFillBlankKeys_WhenBackfilled() {
    PublicKeyService.suspended = true;
    List<Project__c> projects = new List<Project__c>();
    for (Integer i = 0; i < 5; i++) {
      projects.add(new Project__c(Name = 'Old ' + i));
    }
    insert projects;
    PublicKeyService.suspended = false;
    Assert.areEqual(
      5,
      PublicKeyService.countBlank(Project__c.SObjectType),
      'The rows start without keys'
    );

    Test.startTest();
    Integer firstPass = PublicKeyService.backfill(Project__c.SObjectType, 3);
    Integer secondPass = PublicKeyService.backfill(Project__c.SObjectType, 3);
    Integer thirdPass = PublicKeyService.backfill(Project__c.SObjectType, 3);
    Test.stopTest();

    Assert.areEqual(3, firstPass, 'The first pass stops at the batch size');
    Assert.areEqual(2, secondPass, 'The second pass takes the rest');
    Assert.areEqual(0, thirdPass, 'The third pass finds nothing to do');
    Assert.areEqual(
      0,
      PublicKeyService.countBlank(Project__c.SObjectType),
      'No blank keys remain'
    );
    Set<String> keys = new Set<String>();
    for (Project__c project : [SELECT Public_Key__c FROM Project__c]) {
      assertKeyShape(project.Public_Key__c, 'prj');
      keys.add(project.Public_Key__c);
    }
    Assert.areEqual(5, keys.size(), 'Each backfilled row has its own key');
  }

  @IsTest
  static void shouldLeaveExistingKeys_WhenBackfilled() {
    insert new Project__c(Name = 'Keyed', Public_Key__c = 'prj_abcdefghjk');

    Test.startTest();
    Integer filled = PublicKeyService.backfill(Project__c.SObjectType, 200);
    Test.stopTest();

    Assert.areEqual(0, filled, 'Nothing to fill');
    Assert.areEqual(
      'prj_abcdefghjk',
      [SELECT Public_Key__c FROM Project__c LIMIT 1].Public_Key__c,
      'The key is untouched'
    );
  }

  @IsTest
  static void shouldIgnoreObjectsWithoutKeys_WhenBackfilled() {
    Assert.areEqual(
      0,
      PublicKeyService.backfill(Lead.SObjectType, 10),
      'Lead carries no key'
    );
    Assert.areEqual(
      0,
      PublicKeyService.backfill(Project__c.SObjectType, 0),
      'A zero batch does nothing'
    );
    Assert.areEqual(
      0,
      PublicKeyService.countBlank(Lead.SObjectType),
      'Lead has nothing to count'
    );
  }
}
