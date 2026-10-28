/**
 * @description       : Unit tests for UsageCounterWriter: a new day's row, the same day's row
 *                      incremented, two kinds kept apart, a lost race on the first insert,
 *                      and every failure swallowed and logged.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/26/2026
 **/
@IsTest
private class UsageCounterWriterTest {
  private static final Datetime DAY_ONE = Datetime.newInstanceGmt(
    2026,
    10,
    26,
    23,
    59,
    59
  );
  private static final Datetime DAY_TWO = Datetime.newInstanceGmt(
    2026,
    10,
    27,
    0,
    0,
    1
  );

  private static List<Usage_Counter__c> rows() {
    return [
      SELECT Kind__c, Day__c, Count__c, Key__c
      FROM Usage_Counter__c
      ORDER BY Key__c
    ];
  }

  @IsTest
  static void shouldInsertTodaysRowWhenNoRowExists() {
    UsageCounterWriter.nowOverride = DAY_ONE;

    Test.startTest();
    Boolean written = UsageCounterWriter.record(
      UsageCounterWriter.KIND_COVER_LETTER
    );
    Test.stopTest();

    Assert.isTrue(written, 'The count is written');
    List<Usage_Counter__c> stored = rows();
    Assert.areEqual(1, stored.size(), 'One row');
    Assert.areEqual('Cover_Letter:2026-10-26', stored[0].Key__c, 'Key');
    Assert.areEqual('Cover_Letter', stored[0].Kind__c, 'Kind');
    Assert.areEqual(Date.newInstance(2026, 10, 26), stored[0].Day__c, 'Day');
    Assert.areEqual(1, stored[0].Count__c, 'Counted once');
  }

  @IsTest
  static void shouldIncrementTheSameRowWhenCalledAgainTheSameDay() {
    UsageCounterWriter.nowOverride = DAY_ONE;

    Test.startTest();
    UsageCounterWriter.record(UsageCounterWriter.KIND_API_LAB_REQUEST);
    UsageCounterWriter.record(UsageCounterWriter.KIND_API_LAB_REQUEST);
    UsageCounterWriter.record(UsageCounterWriter.KIND_API_LAB_REQUEST);
    Test.stopTest();

    List<Usage_Counter__c> stored = rows();
    Assert.areEqual(1, stored.size(), 'Still one row for the day');
    Assert.areEqual(3, stored[0].Count__c, 'Three counts');
  }

  @IsTest
  static void shouldKeepKindsApartWhenBothAreCountedTheSameDay() {
    UsageCounterWriter.nowOverride = DAY_ONE;

    Test.startTest();
    UsageCounterWriter.record(UsageCounterWriter.KIND_COVER_LETTER);
    UsageCounterWriter.record(UsageCounterWriter.KIND_API_LAB_REQUEST);
    UsageCounterWriter.record(UsageCounterWriter.KIND_API_LAB_REQUEST);
    Test.stopTest();

    Map<String, Usage_Counter__c> byKind = new Map<String, Usage_Counter__c>();
    for (Usage_Counter__c row : rows()) {
      byKind.put(row.Kind__c, row);
    }
    Assert.areEqual(2, byKind.size(), 'One row per kind');
    Assert.areEqual(1, byKind.get('Cover_Letter').Count__c, 'Letters');
    Assert.areEqual(2, byKind.get('Api_Lab_Request').Count__c, 'Requests');
  }

  @IsTest
  static void shouldStartANewRowWhenTheUtcDayChanges() {
    Test.startTest();
    UsageCounterWriter.nowOverride = DAY_ONE;
    UsageCounterWriter.record(UsageCounterWriter.KIND_COVER_LETTER);
    UsageCounterWriter.nowOverride = DAY_TWO;
    UsageCounterWriter.record(UsageCounterWriter.KIND_COVER_LETTER);
    Test.stopTest();

    List<Usage_Counter__c> stored = rows();
    Assert.areEqual(2, stored.size(), 'A row for each day');
    Assert.areEqual('Cover_Letter:2026-10-26', stored[0].Key__c, 'First day');
    Assert.areEqual('Cover_Letter:2026-10-27', stored[1].Key__c, 'Second day');
    Assert.areEqual(1, stored[0].Count__c, 'First day count');
    Assert.areEqual(1, stored[1].Count__c, 'Second day count');
  }

  @IsTest
  static void shouldAddToTheRivalRowWhenAnotherRequestInsertsFirst() {
    UsageCounterWriter.nowOverride = DAY_ONE;
    UsageCounterWriter.rivalRow = new Usage_Counter__c(
      Kind__c = 'Cover_Letter',
      Day__c = Date.newInstance(2026, 10, 26),
      Key__c = 'Cover_Letter:2026-10-26',
      Count__c = 5
    );

    Test.startTest();
    Boolean written = UsageCounterWriter.record(
      UsageCounterWriter.KIND_COVER_LETTER
    );
    Test.stopTest();

    Assert.isTrue(written, 'The lost insert is retried and counted');
    List<Usage_Counter__c> stored = rows();
    Assert.areEqual(1, stored.size(), 'Still one row');
    Assert.areEqual(6, stored[0].Count__c, 'The rival five plus this one');
  }

  @IsTest
  static void shouldSwallowAndLogWhenTheWriteFails() {
    TestLogSink sink = new TestLogSink();
    PortfolioLog.injectedSink = sink;
    UsageCounterWriter.failForTest = true;

    Test.startTest();
    Boolean written = UsageCounterWriter.record(
      UsageCounterWriter.KIND_COVER_LETTER
    );
    Test.stopTest();

    Assert.isFalse(written, 'Nothing written');
    Assert.areEqual(0, rows().size(), 'No row');
    Assert.areEqual(1, sink.lines.size(), 'One log line');
    Assert.isTrue(
      sink.lines[0].contains('Cover_Letter') &&
      sink.lines[0].contains('DmlException'),
      'The line names the kind and the error type: ' + sink.lines[0]
    );
  }

  @IsTest
  static void shouldSwallowAndLogWhenTheStoredCountCannotGrow() {
    // A real failure, not a forced one: the count is at the field's nine digit maximum.
    insert new Usage_Counter__c(
      Kind__c = 'Cover_Letter',
      Day__c = Date.newInstance(2026, 10, 26),
      Key__c = 'Cover_Letter:2026-10-26',
      Count__c = 999999999
    );
    TestLogSink sink = new TestLogSink();
    PortfolioLog.injectedSink = sink;
    UsageCounterWriter.nowOverride = DAY_ONE;

    Test.startTest();
    Boolean written = UsageCounterWriter.record(
      UsageCounterWriter.KIND_COVER_LETTER
    );
    Test.stopTest();

    Assert.isFalse(written, 'The overflow is swallowed');
    Assert.areEqual(
      999999999,
      rows()[0].Count__c,
      'The stored count is unchanged'
    );
    Assert.areEqual(1, sink.lines.size(), 'Logged once');
  }

  @IsTest
  static void shouldSkipAndLogWhenTheKindIsUnknown() {
    TestLogSink sink = new TestLogSink();
    PortfolioLog.injectedSink = sink;

    Test.startTest();
    Boolean written = UsageCounterWriter.record('Secret_Kind');
    Boolean nullKind = UsageCounterWriter.record(null);
    Test.stopTest();

    Assert.isFalse(written, 'Unknown kind skipped');
    Assert.isFalse(nullKind, 'Null kind skipped');
    Assert.areEqual(0, rows().size(), 'No row');
    Assert.areEqual(2, sink.lines.size(), 'Both logged');
    Assert.isFalse(
      sink.lines[0].contains('Secret_Kind'),
      'The unknown value is not written to the log'
    );
  }

  @IsTest
  static void shouldSkipAndLogWhenTheTransactionHasNoHeadroom() {
    TestLogSink sink = new TestLogSink();
    PortfolioLog.injectedSink = sink;
    UsageCounterWriter.noHeadroomForTest = true;

    Test.startTest();
    Boolean written = UsageCounterWriter.record(
      UsageCounterWriter.KIND_API_LAB_REQUEST
    );
    Test.stopTest();

    Assert.isFalse(written, 'Skipped');
    Assert.areEqual(0, rows().size(), 'No row');
    Assert.areEqual(1, sink.lines.size(), 'Logged once');
  }

  @IsTest
  static void shouldWriteAsTheGuestWhenTheGuestHasNoGrantOnTheObject() {
    User guest = SiteGuestTestSupport.preparedGuest();
    UsageCounterWriter.nowOverride = DAY_ONE;
    Boolean written;

    Test.startTest();
    System.runAs(guest) {
      written = UsageCounterWriter.record(UsageCounterWriter.KIND_COVER_LETTER);
    }
    Test.stopTest();

    Assert.isTrue(written, 'A guest with no grant on the object still counts');
    Assert.areEqual(1, rows().size(), 'The row exists');
  }

  /**
   * @description Collects the lines PortfolioLog would send to its sink.
   */
  private class TestLogSink implements System.Callable {
    public List<String> lines = new List<String>();

    public Object call(String action, Map<String, Object> args) {
      lines.add(JSON.serialize(args));
      return null;
    }
  }
}
