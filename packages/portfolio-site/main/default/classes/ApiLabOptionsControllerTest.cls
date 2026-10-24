/**
 * @description       : Tests for ApiLabOptionsController: every parameter key present, an Id
 *                      option pairing the record's name with its Id, names made distinct and
 *                      joined across the paths that share a filter, the project names limited
 *                      to the statuses the project list returns, the active picklist values,
 *                      the 200 option cap, the sorted labels, and that no email, phone or free
 *                      text field is ever queried or returned, as a site guest too.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/24/2026
 **/
@isTest
private class ApiLabOptionsControllerTest {
  private static final String OWNER_LAST_NAME = 'Optionsowner';
  private static final String HOLDER_LAST_NAME = 'Optionsholder';
  private static final String BYSTANDER_LAST_NAME = 'Optionsbystander';
  private static final String OWNER_EMAIL = 'options.sentinel@example.com';
  private static final String OWNER_PHONE = '555-0177';
  private static final String EMPLOYER = 'Options Employer';
  private static final String CERT_ISSUER = 'Options Cert Issuer';
  private static final String SCHOOL = 'Options School';
  private static final String LIVE_PROJECT = 'Options Live Project';
  private static final String BUILDING_PROJECT = 'Options Building Project';
  private static final String ARCHIVED_PROJECT = 'Options Archived Project';
  private static final String CERT_ONE = 'Options Cert One';
  private static final String CERT_TWO = 'Options Cert Two';
  private static final String ROLE_ONE = 'Options Role One';
  private static final String ROLE_TWO = 'Options Role Two';

  /** Accounts beyond the cap, so accountName must be cut to MAX_OPTIONS. */
  private static final Integer EXTRA_ACCOUNTS = 205;

  @TestSetup
  static void setup() {
    Account employer = new Account(Name = EMPLOYER);
    Account certIssuer = new Account(Name = CERT_ISSUER);
    Account school = new Account(Name = SCHOOL);
    insert new List<Account>{ employer, certIssuer, school };

    List<Account> extras = new List<Account>();
    for (Integer i = 0; i < EXTRA_ACCOUNTS; i++) {
      extras.add(
        new Account(Name = 'Options Extra ' + String.valueOf(i).leftPad(3, '0'))
      );
    }
    insert extras;

    Contact owner = new Contact(
      FirstName = 'Opt',
      LastName = OWNER_LAST_NAME,
      Email = OWNER_EMAIL,
      Phone = OWNER_PHONE,
      Is_Portfolio_Owner__c = true
    );
    Contact holder = new Contact(
      FirstName = 'Opt',
      LastName = HOLDER_LAST_NAME,
      Is_Portfolio_Owner__c = false
    );
    Contact bystander = new Contact(
      FirstName = 'Opt',
      LastName = BYSTANDER_LAST_NAME,
      Is_Portfolio_Owner__c = false
    );
    insert new List<Contact>{ owner, holder, bystander };

    insert new List<Experience__c>{
      new Experience__c(
        Name = ROLE_ONE,
        Employer__c = employer.Id,
        Contact__c = owner.Id,
        Start_Date__c = Date.today().addYears(-2),
        Sort_Order__c = 1
      ),
      new Experience__c(
        Name = ROLE_TWO,
        Employer__c = employer.Id,
        Contact__c = owner.Id,
        Start_Date__c = Date.today().addYears(-4),
        End_Date__c = Date.today().addYears(-2),
        Sort_Order__c = 2
      )
    };

    insert new List<Project__c>{
      new Project__c(
        Name = LIVE_PROJECT,
        Status__c = 'Live – In Production',
        Contact__c = owner.Id,
        Sort_Order__c = 1
      ),
      new Project__c(
        Name = BUILDING_PROJECT,
        Status__c = 'Active Development',
        Contact__c = owner.Id,
        Sort_Order__c = 2
      ),
      new Project__c(
        Name = ARCHIVED_PROJECT,
        Status__c = 'Archived',
        Contact__c = owner.Id,
        Sort_Order__c = 3
      )
    };

    insert new List<Certification__c>{
      new Certification__c(
        Name = CERT_ONE,
        Contact__c = owner.Id,
        Issuer__c = certIssuer.Id
      ),
      new Certification__c(
        Name = CERT_TWO,
        Contact__c = holder.Id,
        Issuer__c = certIssuer.Id
      )
    };

    insert new Education__c(
      Name = 'Options Degree',
      Contact__c = owner.Id,
      Issuer__c = school.Id
    );
  }

  private static List<String> labels(
    List<ApiLabOptionsController.Option> options
  ) {
    List<String> result = new List<String>();
    for (ApiLabOptionsController.Option option : options) {
      result.add(option.label);
    }
    return result;
  }

  private static Map<String, String> valueByLabel(
    List<ApiLabOptionsController.Option> options
  ) {
    Map<String, String> result = new Map<String, String>();
    for (ApiLabOptionsController.Option option : options) {
      result.put(option.label, option.value);
    }
    return result;
  }

  private static String ownerName() {
    return [SELECT Name FROM Contact WHERE LastName = :OWNER_LAST_NAME].Name;
  }

  @isTest
  static void returnsEveryParameterAndNoOther() {
    Test.startTest();
    Map<String, List<ApiLabOptionsController.Option>> options = ApiLabOptionsController.getOptions();
    Test.stopTest();

    Assert.areEqual(
      new Set<String>(ApiLabOptionsController.PARAMETERS),
      options.keySet(),
      'Every parameter has a key and there is no other key'
    );
    Assert.areEqual(
      11,
      options.size(),
      'Eleven parameter names cover the 18 filters'
    );
  }

  @isTest
  static void pairsEachIdWithItsRecordName() {
    Map<Id, Project__c> projects = new Map<Id, Project__c>(
      [SELECT Id, Name FROM Project__c]
    );
    Map<Id, Certification__c> certifications = new Map<Id, Certification__c>(
      [SELECT Id, Name FROM Certification__c]
    );
    Map<Id, Experience__c> roles = new Map<Id, Experience__c>(
      [SELECT Id, Name FROM Experience__c]
    );

    Test.startTest();
    Map<String, List<ApiLabOptionsController.Option>> options = ApiLabOptionsController.getOptions();
    Test.stopTest();

    assertPairs(projects, options.get(ApiLabOptionsController.PROJECT_ID));
    assertPairs(
      certifications,
      options.get(ApiLabOptionsController.CERTIFICATION_ID)
    );
    assertPairs(roles, options.get(ApiLabOptionsController.EXPERIENCE_ID));
  }

  private static void assertPairs(
    Map<Id, SObject> records,
    List<ApiLabOptionsController.Option> options
  ) {
    Assert.areEqual(
      records.size(),
      options.size(),
      'One option per record, the archived project included'
    );
    for (ApiLabOptionsController.Option option : options) {
      SObject record = records.get(option.value);
      Assert.isNotNull(
        record,
        'The value is a real record Id: ' + option.value
      );
      Assert.areEqual(
        record.get('Name'),
        option.label,
        'The label is that record\'s name'
      );
    }
  }

  @isTest
  static void offersProjectNamesTheProjectListReturns() {
    Test.startTest();
    List<String> names = labels(
      ApiLabOptionsController.getOptions()
        .get(ApiLabOptionsController.PROJECT_NAME)
    );
    Test.stopTest();

    Assert.areEqual(
      new List<String>{ BUILDING_PROJECT, LIVE_PROJECT },
      names,
      'Only the listed statuses, sorted, and not the archived project'
    );
  }

  @isTest
  static void joinsSharedNameFiltersAndMakesThemDistinct() {
    Contact holder = [
      SELECT Name
      FROM Contact
      WHERE LastName = :HOLDER_LAST_NAME
    ];
    Contact bystander = [
      SELECT Name
      FROM Contact
      WHERE LastName = :BYSTANDER_LAST_NAME
    ];

    Test.startTest();
    Map<String, List<ApiLabOptionsController.Option>> options = ApiLabOptionsController.getOptions();
    Test.stopTest();

    List<String> contactNames = labels(
      options.get(ApiLabOptionsController.CONTACT_NAME)
    );
    Assert.isTrue(
      contactNames.contains(ownerName()),
      'The owner, matched by /contacts, /certifications and /education'
    );
    Assert.isTrue(
      contactNames.contains(holder.Name),
      'A certification holder, matched by /certifications'
    );
    Assert.isFalse(
      contactNames.contains(bystander.Name),
      'A contact no contactName filter can match is not offered'
    );
    Assert.areEqual(
      new Set<String>(contactNames).size(),
      contactNames.size(),
      'Each name once'
    );
    Assert.areEqual(
      new List<String>{ CERT_ISSUER, SCHOOL },
      labels(options.get(ApiLabOptionsController.ISSUER_NAME)),
      'Certification and education issuers, each once'
    );
    Assert.areEqual(
      new List<String>{ EMPLOYER },
      labels(options.get(ApiLabOptionsController.EMPLOYER_NAME)),
      'Two roles at one employer give one name'
    );
    Assert.areEqual(
      new List<String>{ CERT_ONE, CERT_TWO },
      labels(options.get(ApiLabOptionsController.CERTIFICATION_NAME)),
      'Certification names'
    );
    for (
      ApiLabOptionsController.Option option : options.get(
        ApiLabOptionsController.ISSUER_NAME
      )
    ) {
      Assert.areEqual(
        option.label,
        option.value,
        'A name option sends the name itself'
      );
    }
  }

  @isTest
  static void givesTheActivePicklistValues() {
    Test.startTest();
    Map<String, List<ApiLabOptionsController.Option>> options = ApiLabOptionsController.getOptions();
    Test.stopTest();

    assertPicklist(
      Skill__c.Category__c.getDescribe(),
      options.get(ApiLabOptionsController.CATEGORY)
    );
    assertPicklist(
      Experience_Highlight__c.Persona_Tag__c.getDescribe(),
      options.get(ApiLabOptionsController.PERSONA)
    );
    Assert.areEqual(
      new List<String>{ 'Admin', 'Architect', 'Developer' },
      labels(options.get(ApiLabOptionsController.PERSONA)),
      'The personas the highlight filter accepts, sorted by label'
    );
  }

  private static void assertPicklist(
    Schema.DescribeFieldResult field,
    List<ApiLabOptionsController.Option> options
  ) {
    Map<String, String> expected = new Map<String, String>();
    for (Schema.PicklistEntry entry : field.getPicklistValues()) {
      if (entry.isActive()) {
        expected.put(entry.getLabel(), entry.getValue());
      }
    }
    Assert.areEqual(
      expected,
      valueByLabel(options),
      'Every active value of ' + field.getName() + ' and nothing else'
    );
  }

  @isTest
  static void capsAndSortsEachList() {
    Test.startTest();
    List<ApiLabOptionsController.Option> accounts = ApiLabOptionsController.getOptions()
      .get(ApiLabOptionsController.ACCOUNT_NAME);
    Test.stopTest();

    Assert.areEqual(
      ApiLabOptionsController.MAX_OPTIONS,
      accounts.size(),
      'More accounts than the cap give exactly the cap'
    );
    List<String> sorted = labels(accounts);
    List<String> resorted = new List<String>(sorted);
    resorted.sort();
    Assert.areEqual(resorted, sorted, 'Sorted by label');
    Assert.areEqual(CERT_ISSUER, sorted[0], 'The first label in order');
  }

  @isTest
  static void sortsByLabelIgnoringCase() {
    List<ApiLabOptionsController.Option> options = new List<ApiLabOptionsController.Option>{
      new ApiLabOptionsController.Option('beta', 'b'),
      new ApiLabOptionsController.Option('Alpha', 'a2'),
      new ApiLabOptionsController.Option('alpha', 'a1')
    };

    Test.startTest();
    List<ApiLabOptionsController.Option> sorted = ApiLabOptionsController.sortAndCap(
      options
    );
    Test.stopTest();

    Assert.areEqual('a1', sorted[0].value, 'Equal labels fall back to value');
    Assert.areEqual('a2', sorted[1].value, 'Case does not split the labels');
    Assert.areEqual('beta', sorted[2].label, 'Then the next label');
  }

  @isTest
  static void readsQueryOnlyIdsNamesAndLookups() {
    for (String readName : ApiLabOptionsController.READS.keySet()) {
      ApiLabOptionsController.OptionRead read = ApiLabOptionsController.READS.get(
        readName
      );
      Schema.SObjectType type = Schema.getGlobalDescribe().get(read.objectName);
      Assert.isNotNull(type, 'Object exists: ' + read.objectName);
      for (String path : read.fields) {
        Schema.DescribeFieldResult field = describePath(type, path);
        Schema.DisplayType kind = field.getType();
        Assert.isTrue(
          kind != Schema.DisplayType.EMAIL &&
            kind != Schema.DisplayType.PHONE &&
            kind != Schema.DisplayType.TEXTAREA,
          'No email, phone or free text field: ' + read.objectName + '.' + path
        );
        Assert.isTrue(
          kind == Schema.DisplayType.ID ||
            kind == Schema.DisplayType.REFERENCE ||
            field.isNameField() ||
            (kind == Schema.DisplayType.PICKLIST &&
            path == 'Status__c'),
          'Only an Id, a lookup, a record name or the project status: ' +
            read.objectName +
            '.' +
            path
        );
      }
    }
  }

  /** Describes a field or a one level relationship path such as Issuer__r.Name. */
  private static Schema.DescribeFieldResult describePath(
    Schema.SObjectType type,
    String path
  ) {
    Map<String, Schema.SObjectField> fields = type.getDescribe()
      .fields.getMap();
    if (!path.contains('.')) {
      Assert.isTrue(fields.containsKey(path), 'Field exists: ' + path);
      return fields.get(path).getDescribe();
    }
    String relationship = path.substringBefore('.');
    String lookupName = relationship.replace('__r', '__c');
    Assert.isTrue(
      fields.containsKey(lookupName),
      'Lookup exists: ' + lookupName
    );
    Schema.SObjectType parent = fields.get(lookupName)
      .getDescribe()
      .getReferenceTo()[0];
    return describePath(parent, path.substringAfter('.'));
  }

  @isTest
  static void readsReturnNoFieldOutsideTheFixedLists() {
    Test.startTest();
    Map<String, List<SObject>> rowsByRead = new ApiLabOptionsController.OptionReader()
      .readAll();
    Test.stopTest();

    for (String readName : rowsByRead.keySet()) {
      Set<String> allowed = new Set<String>();
      for (String path : ApiLabOptionsController.READS.get(readName).fields) {
        allowed.add(path.substringBefore('.').toLowerCase());
      }
      for (SObject row : rowsByRead.get(readName)) {
        for (String populated : row.getPopulatedFieldsAsMap().keySet()) {
          Assert.isTrue(
            allowed.contains(populated.toLowerCase()),
            readName + ' returned a field outside its list: ' + populated
          );
        }
      }
    }
  }

  @isTest
  static void neverReturnsTheOwnersEmailOrPhone() {
    Test.startTest();
    String serialized = JSON.serialize(ApiLabOptionsController.getOptions());
    Test.stopTest();

    Assert.isFalse(serialized.contains(OWNER_EMAIL), 'No email');
    Assert.isFalse(serialized.contains(OWNER_PHONE), 'No phone');
    Assert.isTrue(serialized.contains(ownerName()), 'The owner name is there');
  }

  @isTest
  static void throwsAFriendlyErrorWhenTheReadFails() {
    ApiLabOptionsController.throwOnRead = true;

    Test.startTest();
    try {
      ApiLabOptionsController.getOptions();
      Assert.fail('Expected an AuraHandledException');
    } catch (AuraHandledException e) {
      Assert.areEqual(
        'The API Lab filter options could not be read.',
        e.getMessage(),
        'A message with no query detail'
      );
    }
    Test.stopTest();
  }

  @isTest
  static void readsEveryListAsTheSiteGuest() {
    User guest = SiteGuestTestSupport.preparedGuest();
    Map<String, List<ApiLabOptionsController.Option>> options;

    Test.startTest();
    System.runAs(guest) {
      options = ApiLabOptionsController.getOptions();
    }
    Test.stopTest();

    Assert.areEqual(
      new List<String>{ BUILDING_PROJECT, LIVE_PROJECT },
      labels(options.get(ApiLabOptionsController.PROJECT_NAME)),
      'The guest reads the project names without sharing access of its own'
    );
    Assert.areEqual(
      3,
      options.get(ApiLabOptionsController.PROJECT_ID).size(),
      'And every project Id'
    );
    Assert.isFalse(
      JSON.serialize(options).contains(OWNER_EMAIL),
      'No email reaches the guest'
    );
  }

  @isTest
  static void theGuestReadsEveryListThroughItsQueryDefinition() {
    User guest = SiteGuestTestSupport.preparedGuest();

    Test.startTest();
    System.runAs(guest) {
      ApiLabOptionsController.getOptions();
    }
    Test.stopTest();

    Map<String, QueryDefinitions.QueryDefault> defaults = new ApiLabOptionsController()
      .queryDefaults();
    Assert.areEqual(
      ApiLabOptionsController.READS.size(),
      defaults.size(),
      'One query definition per read'
    );
    for (String name : defaults.keySet()) {
      Assert.areEqual(
        'record',
        QueryDefinitions.sourceByName.get(name),
        'The guest is served by the record ' + name
      );
    }
  }
}
