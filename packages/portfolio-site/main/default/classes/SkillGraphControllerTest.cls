/**
 * @description       : Tests for SkillGraphController. The guest test runs as the real
 *                      Portfolio1 site guest user, and the reader test as a user made in the
 *                      test with no permission set, so neither depends on the org's admin.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/26/2026
 **/
@isTest
private class SkillGraphControllerTest {
  private static final String RECORD_NAME = 'SkillGraphController_CertificationLinks';

  @TestSetup
  static void setup() {
    SiteGuestTestSupport.createResumeGraph();
    Map<String, Id> skillIds = new Map<String, Id>();
    for (Skill__c skill : [SELECT Id, Name FROM Skill__c]) {
      skillIds.put(skill.Name, skill.Id);
    }
    Contact owner = [SELECT Id FROM Contact LIMIT 1];
    Certification__c unlinked = new Certification__c(
      Name = 'Cert Unlinked',
      Contact__c = owner.Id
    );
    insert unlinked;
    Certification__c retired = [
      SELECT Id
      FROM Certification__c
      WHERE Name = 'Cert Old'
    ];
    retired.Is_Retired__c = true;
    update retired;
    Id current = [SELECT Id FROM Certification__c WHERE Name = 'Cert New'].Id;
    insert new List<Certification_Skill__c>{
      new Certification_Skill__c(
        Certification__c = current,
        Skill__c = skillIds.get('Apex')
      ),
      new Certification_Skill__c(
        Certification__c = current,
        Skill__c = skillIds.get('LWC')
      ),
      new Certification_Skill__c(
        Certification__c = retired.Id,
        Skill__c = skillIds.get('Apex')
      )
    };
  }

  private static Map<String, Id> skillIdsByName() {
    Map<String, Id> result = new Map<String, Id>();
    for (Skill__c skill : [SELECT Id, Name FROM Skill__c]) {
      result.put(skill.Name, skill.Id);
    }
    return result;
  }

  private static User readerWithNoGrant() {
    Profile standard = [
      SELECT Id
      FROM Profile
      WHERE Name = 'Standard User'
      LIMIT 1
    ];
    String unique = String.valueOf(Crypto.getRandomInteger()).remove('-');
    User reader = new User(
      Alias = 'sgreader',
      Email = 'skill.graph.reader@example.com',
      EmailEncodingKey = 'UTF-8',
      LastName = 'Reader',
      LanguageLocaleKey = 'en_US',
      LocaleSidKey = 'en_US',
      ProfileId = standard.Id,
      TimeZoneSidKey = 'America/Chicago',
      Username = 'skill.graph.reader.' + unique + '@example.com'
    );
    insert reader;
    return reader;
  }

  @isTest
  static void guestGetsEachLinkedCertification() {
    User guest = SiteGuestTestSupport.preparedGuest();
    Map<String, Id> skills = skillIdsByName();
    List<SkillGraphController.CertificationLinks> links;

    Test.startTest();
    System.runAs(guest) {
      links = SkillGraphController.getCertificationLinks();
    }
    Test.stopTest();

    Assert.areEqual(2, links.size(), 'Only the two linked certifications');
    Assert.areEqual('Cert New', links[0].name, 'Ordered by name');
    Assert.isFalse(links[0].isRetired, 'Cert New is current');
    Assert.areEqual(
      new Set<Id>{ skills.get('Apex'), skills.get('LWC') },
      new Set<Id>(links[0].skillIds),
      'Cert New backs Apex and LWC'
    );
    Assert.areEqual('Cert Old', links[1].name, 'Second by name');
    Assert.isTrue(links[1].isRetired, 'Cert Old is retired');
    Assert.areEqual(
      new List<Id>{ skills.get('Apex') },
      links[1].skillIds,
      'Cert Old backs Apex'
    );
    Assert.areEqual(2024, links[0].earnedYear, 'Cert New was earned in 2024');
    Assert.areEqual(2020, links[1].earnedYear, 'Cert Old was earned in 2020');
  }

  @isTest
  static void guestGetsNoContactDetailOrFullDate() {
    User guest = SiteGuestTestSupport.preparedGuest();
    String serialized;

    Test.startTest();
    System.runAs(guest) {
      serialized = JSON.serialize(SkillGraphController.getCertificationLinks());
    }
    Test.stopTest();

    Assert.isTrue(serialized.contains('Cert New'), 'The names are present');
    Assert.isFalse(
      serialized.contains(SiteGuestTestSupport.OWNER_EMAIL),
      'No email address may reach a guest'
    );
    Assert.isFalse(
      serialized.contains(SiteGuestTestSupport.OWNER_PHONE),
      'No phone number may reach a guest'
    );
    Assert.isFalse(serialized.contains('Test Issuer'), 'No issuer is sent');
    Assert.isFalse(serialized.contains('2024-06-01'), 'No full date is sent');
    Assert.isFalse(serialized.contains('2020-06-01'), 'No full date is sent');
  }

  @isTest
  static void readsInSystemModeForAUserWithNoGrant() {
    User reader = readerWithNoGrant();
    List<SkillGraphController.CertificationLinks> links;

    Test.startTest();
    System.runAs(reader) {
      links = SkillGraphController.getCertificationLinks();
    }
    Test.stopTest();

    Assert.areEqual(2, links.size(), 'The read does not depend on a grant');
  }

  @isTest
  static void returnsAnEmptyListWhenNoLinkExists() {
    delete [SELECT Id FROM Certification_Skill__c];

    Test.startTest();
    List<SkillGraphController.CertificationLinks> links = SkillGraphController.getCertificationLinks();
    Test.stopTest();

    Assert.isTrue(links.isEmpty(), 'No link, no certification');
  }

  @isTest
  static void throwsAPlainMessageWhenTheReadFails() {
    SkillGraphController.failRead = true;

    Test.startTest();
    try {
      SkillGraphController.getCertificationLinks();
      Assert.fail('Expected an AuraHandledException');
    } catch (AuraHandledException error) {
      Assert.areEqual(
        SkillGraphController.LOAD_FAILED_MESSAGE,
        error.getMessage(),
        'A plain message, no internals'
      );
    }
    Test.stopTest();
  }

  @isTest
  static void shipsItsRecordActiveAndEqualToTheDefault() {
    Test.startTest();
    List<String> failures = QueryDefinitions.validateAll();
    Map<String, QueryDefinitions.QueryDefault> defaults = new SkillGraphController()
      .queryDefaults();
    Test.stopTest();

    Assert.isTrue(defaults.containsKey(RECORD_NAME), 'The default is named');
    Query_Definition__mdt record = Query_Definition__mdt.getInstance(
      RECORD_NAME
    );
    Assert.isNotNull(record, 'The record ships');
    Assert.isTrue(record.Active__c, 'The record ships active');
    for (String failure : failures) {
      Assert.isFalse(
        failure.startsWith(RECORD_NAME),
        'The record passes validateAll: ' + failure
      );
    }
  }
}
