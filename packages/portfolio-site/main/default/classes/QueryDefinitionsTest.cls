/**
 * @description       : Tests for QueryDefinitions: a record that narrows a read is used, and a
 *                      record that asks for a field outside the allowlist, drops a field the
 *                      caller reads, runs in a weaker mode, reads another object, names an
 *                      unknown bind, is inactive, holds a bad limit, escapes its brackets or
 *                      does not parse falls back to the code default. No record runs the
 *                      default, the records load once per transaction, and validateAll()
 *                      lists exactly the bad records.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/24/2026
 **/
@IsTest
private class QueryDefinitionsTest {
  private static final String NAME = 'QueryDefinitionsTest_List';
  private static final String PREFIX = 'QDT Account ';
  private static final String FIELDS = 'Id, Name';
  private static final String FILTER = 'Name LIKE :prefix';
  private static final Integer ACCOUNT_COUNT = 3;

  @TestSetup
  static void createAccounts() {
    List<Account> accounts = new List<Account>();
    for (Integer i = 1; i <= ACCOUNT_COUNT; i++) {
      accounts.add(new Account(Name = PREFIX + i, Industry = 'Education'));
    }
    insert accounts;
  }

  private static QueryDefinitions.QueryDefault codeDefault() {
    return new QueryDefinitions.QueryDefault('Account', FIELDS)
      .filter(FILTER)
      .orderBy('Name ASC')
      .mode(QueryDefinitions.Mode.SYSTEM_MODE)
      .allow('Industry')
      .binds(new Map<String, Object>{ 'prefix' => PREFIX + '%', 'pick' => '' });
  }

  private static Map<String, Object> binds() {
    return new Map<String, Object>{
      'prefix' => PREFIX + '%',
      'pick' => PREFIX + '2'
    };
  }

  // A record equal to the default, which tests then change one field at a time.
  private static Query_Definition__mdt record() {
    return new Query_Definition__mdt(
      DeveloperName = NAME,
      Object__c = 'Account',
      Fields__c = FIELDS,
      Filter__c = FILTER,
      Order_By__c = 'Name ASC',
      Row_Limit__c = 50000,
      Access_Mode__c = 'SYSTEM_MODE',
      Active__c = true
    );
  }

  private static void put(Query_Definition__mdt definition) {
    QueryDefinitions.overrides.put(NAME, definition);
  }

  // A record that narrows to one account. A test changes one more field, then expects the
  // default (three rows) back when that change fails a check.
  private static Query_Definition__mdt narrowing() {
    Query_Definition__mdt definition = record();
    definition.Filter__c = 'Name = :pick';
    return definition;
  }

  private static List<SObject> runIt() {
    Test.startTest();
    List<SObject> rows = QueryDefinitions.run(NAME, binds(), codeDefault());
    Test.stopTest();
    return rows;
  }

  private static void assertDefaultRan(List<SObject> rows) {
    Assert.areEqual(ACCOUNT_COUNT, rows.size(), 'The default reads every row');
    Assert.areEqual(
      'default',
      QueryDefinitions.sourceByName.get(NAME),
      'The default served the read'
    );
  }

  @IsTest
  static void noRecordRunsTheDefault() {
    put(null);
    List<SObject> rows = runIt();
    assertDefaultRan(rows);
    Assert.areEqual(PREFIX + '1', rows[0].get('Name'), 'Default order applies');
  }

  @IsTest
  static void recordEqualToTheDefaultReturnsTheSameRows() {
    put(record());
    List<SObject> rows = runIt();
    Assert.areEqual(ACCOUNT_COUNT, rows.size(), 'Same rows as the default');
    Assert.areEqual(
      'record',
      QueryDefinitions.sourceByName.get(NAME),
      'The record served the read'
    );
  }

  @IsTest
  static void narrowingRecordIsUsed() {
    put(narrowing());
    List<SObject> rows = runIt();
    Assert.areEqual(1, rows.size(), 'The record narrows to one row');
    Assert.areEqual(PREFIX + '2', rows[0].get('Name'), 'The picked row');
    Assert.areEqual('record', QueryDefinitions.sourceByName.get(NAME), 'Used');
  }

  @IsTest
  static void recordOrderAndLimitAreUsed() {
    Query_Definition__mdt definition = record();
    definition.Order_By__c = 'Name DESC';
    definition.Row_Limit__c = 2;
    put(definition);
    List<SObject> rows = runIt();
    Assert.areEqual(2, rows.size(), 'The record limit applies');
    Assert.areEqual(
      PREFIX + '3',
      rows[0].get('Name'),
      'The record order applies'
    );
  }

  @IsTest
  static void allowedExtraFieldIsReturned() {
    Query_Definition__mdt definition = narrowing();
    definition.Fields__c = 'Id, Name, Industry';
    put(definition);
    List<SObject> rows = runIt();
    Assert.areEqual(1, rows.size(), 'The record is used');
    Assert.areEqual('Education', rows[0].get('Industry'), 'Allowed field read');
  }

  @IsTest
  static void fieldOutsideTheAllowlistFallsBack() {
    Query_Definition__mdt definition = narrowing();
    definition.Fields__c = 'Id, Name, Phone';
    put(definition);
    List<SObject> rows = runIt();
    assertDefaultRan(rows);
    Assert.isFalse(
      rows[0].getPopulatedFieldsAsMap().containsKey('Phone'),
      'The field outside the allowlist is never read'
    );
  }

  @IsTest
  static void droppedRequiredFieldFallsBack() {
    Query_Definition__mdt definition = narrowing();
    definition.Fields__c = 'Id';
    put(definition);
    assertDefaultRan(runIt());
  }

  @IsTest
  static void weakerModeFallsBack() {
    Query_Definition__mdt definition = narrowing();
    put(definition);
    QueryDefinitions.QueryDefault userModeDefault = codeDefault()
      .mode(QueryDefinitions.Mode.USER_MODE);

    Test.startTest();
    List<SObject> rows = QueryDefinitions.run(NAME, binds(), userModeDefault);
    Test.stopTest();

    assertDefaultRan(rows);
  }

  @IsTest
  static void strongerModeIsUsed() {
    Query_Definition__mdt definition = narrowing();
    definition.Access_Mode__c = 'user_mode';
    put(definition);
    List<SObject> rows = runIt();
    Assert.areEqual(1, rows.size(), 'USER_MODE is never weaker, so it is used');
  }

  @IsTest
  static void unknownModeFallsBack() {
    Query_Definition__mdt definition = narrowing();
    definition.Access_Mode__c = 'GOD_MODE';
    put(definition);
    assertDefaultRan(runIt());
  }

  @IsTest
  static void wrongObjectFallsBack() {
    Query_Definition__mdt definition = narrowing();
    definition.Object__c = 'Contact';
    put(definition);
    assertDefaultRan(runIt());
  }

  @IsTest
  static void unknownBindFallsBack() {
    Query_Definition__mdt definition = narrowing();
    definition.Filter__c = 'Name = :somethingElse';
    put(definition);
    assertDefaultRan(runIt());
  }

  @IsTest
  static void bindInsideALiteralIsNotABind() {
    Query_Definition__mdt definition = narrowing();
    definition.Filter__c = 'Name != \'a:b\' AND Name = :pick';
    put(definition);
    List<SObject> rows = runIt();
    Assert.areEqual(
      1,
      rows.size(),
      'A colon inside quotes is text, not a bind'
    );
  }

  @IsTest
  static void inactiveRecordFallsBack() {
    Query_Definition__mdt definition = narrowing();
    definition.Active__c = false;
    put(definition);
    assertDefaultRan(runIt());
  }

  @IsTest
  static void limitOutOfRangeFallsBack() {
    Query_Definition__mdt definition = narrowing();
    definition.Row_Limit__c = 50001;
    put(definition);
    assertDefaultRan(runIt());
  }

  @IsTest
  static void missingLimitFallsBack() {
    Query_Definition__mdt definition = narrowing();
    definition.Row_Limit__c = null;
    put(definition);
    assertDefaultRan(runIt());
  }

  @IsTest
  static void bracketEscapeCannotWidenTheRead() {
    Query_Definition__mdt definition = narrowing();
    definition.Filter__c = 'Name = :pick) OR (Id != null';
    put(definition);
    assertDefaultRan(runIt());
  }

  @IsTest
  static void unclosedQuoteFallsBack() {
    Query_Definition__mdt definition = narrowing();
    definition.Filter__c = 'Name = \'open';
    put(definition);
    assertDefaultRan(runIt());
  }

  @IsTest
  static void orderByWithABracketFallsBack() {
    Query_Definition__mdt definition = narrowing();
    definition.Order_By__c = 'Name ASC) OR (Id != null';
    put(definition);
    assertDefaultRan(runIt());
  }

  @IsTest
  static void recordFilterIsAddedToTheDefaultFilter() {
    Query_Definition__mdt definition = record();
    definition.Filter__c = 'Id != null';
    put(definition);
    insert new Account(Name = 'Outside The Prefix');
    List<SObject> rows = runIt();
    Assert.areEqual(
      ACCOUNT_COUNT,
      rows.size(),
      'A wider record filter still sits inside the default filter'
    );
  }

  @IsTest
  static void badParseFallsBackAndIsNotRetried() {
    Query_Definition__mdt definition = narrowing();
    definition.Filter__c = 'Name = = :pick';
    put(definition);

    Test.startTest();
    List<SObject> first = QueryDefinitions.run(NAME, binds(), codeDefault());
    Integer before = Limits.getQueries();
    List<SObject> second = QueryDefinitions.run(NAME, binds(), codeDefault());
    Integer used = Limits.getQueries() - before;
    Test.stopTest();

    assertDefaultRan(first);
    Assert.areEqual(
      ACCOUNT_COUNT,
      second.size(),
      'Second read uses the default'
    );
    Assert.areEqual(1, used, 'The bad record is not run a second time');
  }

  @IsTest
  static void pageUsesSizeAndOffset() {
    put(record());

    Test.startTest();
    List<SObject> rows = QueryDefinitions.runPage(
      NAME,
      binds(),
      codeDefault(),
      1,
      1
    );
    Test.stopTest();

    Assert.areEqual(1, rows.size(), 'One row per page');
    Assert.areEqual(PREFIX + '2', rows[0].get('Name'), 'The offset skips one');
  }

  @IsTest
  static void countUsesTheRecordFilter() {
    put(narrowing());

    Test.startTest();
    Integer narrowed = QueryDefinitions.count(NAME, binds(), codeDefault());
    put(null);
    Integer full = QueryDefinitions.count(NAME, binds(), codeDefault());
    Test.stopTest();

    Assert.areEqual(1, narrowed, 'The record filter narrows the count');
    Assert.areEqual(ACCOUNT_COUNT, full, 'The default counts every row');
  }

  @IsTest
  static void countFallsBackWhenTheRecordDoesNotParse() {
    Query_Definition__mdt definition = narrowing();
    definition.Filter__c = 'Name = = :pick';
    put(definition);

    Test.startTest();
    Integer total = QueryDefinitions.count(NAME, binds(), codeDefault());
    Test.stopTest();

    Assert.areEqual(ACCOUNT_COUNT, total, 'The default count runs');
  }

  @IsTest
  static void missingDefaultIsRefused() {
    Test.startTest();
    try {
      QueryDefinitions.run(NAME, binds(), null);
      Assert.fail('A read without a code default must throw');
    } catch (IllegalArgumentException e) {
      Assert.areEqual('A code default is required.', e.getMessage(), 'Message');
    }
    try {
      QueryDefinitions.count(NAME, null, null);
      Assert.fail('A count without a code default must throw');
    } catch (IllegalArgumentException e) {
      Assert.areEqual('A code default is required.', e.getMessage(), 'Message');
    }
    Test.stopTest();
  }

  @IsTest
  static void recordsLoadOncePerTransaction() {
    Test.startTest();
    QueryDefinitions.run('No_Such_Definition_One', binds(), codeDefault());
    QueryDefinitions.run('No_Such_Definition_Two', binds(), codeDefault());
    QueryDefinitions.count('No_Such_Definition_One', binds(), codeDefault());
    Test.stopTest();

    Assert.areEqual(1, QueryDefinitions.loadCount, 'getAll() runs once');
  }

  @IsTest
  static void cutLongTextIsReadAgainAndShortTextIsKept() {
    Map<String, Query_Definition__mdt> loaded = new Map<String, Query_Definition__mdt>{
      'Short_One' => new Query_Definition__mdt(
        DeveloperName = 'Short_One',
        Fields__c = 'Id'
      ),
      'Cut_One' => new Query_Definition__mdt(
        DeveloperName = 'Cut_One',
        Fields__c = 'Id'.rightPad(255, ' ')
      )
    };

    Test.startTest();
    Integer before = Limits.getQueries();
    Map<String, Query_Definition__mdt> result = QueryDefinitions.withFullText(
      loaded
    );
    Integer used = Limits.getQueries() - before;
    Test.stopTest();

    Assert.areEqual(1, used, 'One query reads every cut record again');
    Assert.areEqual(2, result.size(), 'Both records kept');
    Assert.areEqual('Id', result.get('Short_One').Fields__c, 'Short kept');
  }

  @IsTest
  static void shortTextNeedsNoQuery() {
    Map<String, Query_Definition__mdt> loaded = new Map<String, Query_Definition__mdt>{
      'Short_One' => new Query_Definition__mdt(
        DeveloperName = 'Short_One',
        Fields__c = 'Id',
        Filter__c = 'Name != null'
      )
    };

    Test.startTest();
    Integer before = Limits.getQueries();
    QueryDefinitions.withFullText(loaded);
    Integer used = Limits.getQueries() - before;
    Test.stopTest();

    Assert.areEqual(0, used, 'No query when nothing was cut');
  }

  private class TestProvider implements QueryDefinitions.Provider {
    public Map<String, QueryDefinitions.QueryDefault> queryDefaults() {
      return new Map<String, QueryDefinitions.QueryDefault>{
        'QDT_Good' => codeDefault(),
        'QDT_Bad_Field' => codeDefault(),
        'QDT_Bad_Parse' => codeDefault(),
        'QDT_Inactive_Good' => codeDefault(),
        'QDT_Weak_Mode' => codeDefault().mode(QueryDefinitions.Mode.USER_MODE)
      };
    }
  }

  private static Query_Definition__mdt named(String name) {
    Query_Definition__mdt definition = record();
    definition.DeveloperName = name;
    return definition;
  }

  @IsTest
  static void validateAllListsExactlyTheBadRecords() {
    QueryDefinitions.ignoreDeployedRecords = true;
    QueryDefinitions.providerOverride = new List<QueryDefinitions.Provider>{
      new TestProvider()
    };
    Query_Definition__mdt badField = named('QDT_Bad_Field');
    badField.Fields__c = 'Id, Name, Phone';
    Query_Definition__mdt badParse = named('QDT_Bad_Parse');
    badParse.Filter__c = 'Name = = :prefix';
    Query_Definition__mdt inactive = named('QDT_Inactive_Good');
    inactive.Active__c = false;
    QueryDefinitions.overrides.putAll(
      new Map<String, Query_Definition__mdt>{
        'QDT_Good' => named('QDT_Good'),
        'QDT_Bad_Field' => badField,
        'QDT_Bad_Parse' => badParse,
        'QDT_Inactive_Good' => inactive,
        'QDT_Weak_Mode' => named('QDT_Weak_Mode'),
        'QDT_Orphan' => named('QDT_Orphan'),
        'QDT_Removed' => null
      }
    );

    Test.startTest();
    List<String> failures = QueryDefinitions.validateAll();
    Test.stopTest();

    Assert.areEqual(4, failures.size(), 'Exactly the bad records: ' + failures);
    Assert.areEqual(
      'QDT_Bad_Field: field phone is outside the allowlist',
      failures[0],
      'Field outside the allowlist'
    );
    Assert.isTrue(
      failures[1].startsWith('QDT_Bad_Parse: does not parse'),
      'Bad parse: ' + failures[1]
    );
    Assert.areEqual(
      'QDT_Orphan: no code default has this name',
      failures[2],
      'Record with no code default'
    );
    Assert.areEqual(
      'QDT_Weak_Mode: access mode is weaker than USER_MODE',
      failures[3],
      'Weaker mode'
    );
  }

  @IsTest
  static void validateAllFindsProvidersByInterface() {
    QueryDefinitions.ignoreDeployedRecords = true;
    QueryDefinitions.overrides.put('QDT_Orphan', named('QDT_Orphan'));

    Test.startTest();
    List<String> failures = QueryDefinitions.validateAll();
    Test.stopTest();

    Assert.areEqual(
      new List<String>{ 'QDT_Orphan: no code default has this name' },
      failures,
      'Every implementation is read and none owns QDT_Orphan'
    );
  }

  @IsTest
  static void problemsNameEveryFault() {
    Query_Definition__mdt definition = new Query_Definition__mdt(
      DeveloperName = NAME,
      Object__c = 'Contact',
      Fields__c = '',
      Filter__c = '(Name = :nope',
      Order_By__c = 'Name :x',
      Row_Limit__c = 0,
      Access_Mode__c = '',
      Active__c = false
    );

    Test.startTest();
    List<String> problems = QueryDefinitions.problemsOf(
      definition,
      codeDefault(),
      new Set<String>{ 'prefix' },
      true
    );
    Test.stopTest();

    Assert.areEqual(
      new List<String>{
        'inactive',
        'object is not Account',
        'no fields',
        'filter brackets do not balance',
        'bind nope is not supplied',
        'order by holds a bracket, a bind or a quote',
        'access mode is not USER_MODE or SYSTEM_MODE',
        'row limit is not from 1 to 50000'
      },
      problems,
      'Every fault is named'
    );
  }
}
