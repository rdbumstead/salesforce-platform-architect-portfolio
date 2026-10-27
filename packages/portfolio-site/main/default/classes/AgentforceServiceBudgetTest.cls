/**
 * @description       : Unit tests for AgentforceServiceBudget: the hourly row key, the edge of
 *                      the budget (the 120th call passes, the 121st does not), the pending count
 *                      written only by commitPending, and a new hour starting empty.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/26/2026
 **/
@IsTest
private class AgentforceServiceBudgetTest {
  private static final Datetime NOW = Datetime.newInstanceGmt(
    2026,
    10,
    26,
    23,
    41,
    7
  );
  private static final String KEY = 'agentforce-hour|2026102623';
  private static final Integer BUDGET = 120;

  private static void storeCount(Integer count) {
    insert new API_Rate_Window__c(
      Key__c = KEY,
      Window_Start__c = Datetime.newInstanceGmt(2026, 10, 26, 23, 0, 0),
      Count__c = count
    );
  }

  private static Decimal storedCount() {
    List<API_Rate_Window__c> rows = [
      SELECT Count__c
      FROM API_Rate_Window__c
      WHERE Key__c = :KEY
    ];
    return rows.isEmpty() ? null : rows[0].Count__c;
  }

  @IsTest
  static void theKeyNamesTheUtcHour() {
    Assert.areEqual(
      KEY,
      AgentforceServiceBudget.keyOf(
        Datetime.newInstanceGmt(2026, 10, 26, 23, 0, 0)
      ),
      'One row per clock hour'
    );
  }

  @IsTest
  static void the120thCallInAnHourMayGoAhead() {
    AgentforceServiceBudget.nowOverride = NOW;
    storeCount(BUDGET - 1);

    Test.startTest();
    Boolean allowed = AgentforceServiceBudget.tryReserve(BUDGET);
    Test.stopTest();

    Assert.isTrue(allowed, '119 used, the 120th passes');
    Assert.areEqual(BUDGET, AgentforceServiceBudget.usedThisHour(), '120');
  }

  @IsTest
  static void the121stCallInAnHourIsRefused() {
    AgentforceServiceBudget.nowOverride = NOW;
    storeCount(BUDGET - 1);

    Test.startTest();
    Boolean first = AgentforceServiceBudget.tryReserve(BUDGET);
    Boolean second = AgentforceServiceBudget.tryReserve(BUDGET);
    Test.stopTest();

    Assert.isTrue(first, 'The 120th passes');
    Assert.isFalse(second, 'The 121st is refused');
  }

  @IsTest
  static void aFullStoredHourRefusesAtOnce() {
    AgentforceServiceBudget.nowOverride = NOW;
    storeCount(BUDGET);

    Test.startTest();
    Boolean allowed = AgentforceServiceBudget.tryReserve(BUDGET);
    Test.stopTest();

    Assert.isFalse(allowed, '120 used, nothing more this hour');
  }

  @IsTest
  static void aBudgetOfZeroRefusesEveryCall() {
    AgentforceServiceBudget.nowOverride = NOW;

    Assert.isFalse(AgentforceServiceBudget.tryReserve(0), 'Zero means none');
  }

  @IsTest
  static void reservingWritesNothingUntilCommit() {
    AgentforceServiceBudget.nowOverride = NOW;

    Test.startTest();
    AgentforceServiceBudget.tryReserve(BUDGET);
    Decimal beforeCommit = storedCount();
    AgentforceServiceBudget.commitPending();
    Test.stopTest();

    Assert.isNull(beforeCommit, 'No row before the commit');
    Assert.areEqual(1, storedCount(), 'One call written by the commit');
  }

  @IsTest
  static void commitAddsToTheHoursRow() {
    AgentforceServiceBudget.nowOverride = NOW;
    storeCount(7);

    Test.startTest();
    AgentforceServiceBudget.tryReserve(BUDGET);
    AgentforceServiceBudget.tryReserve(BUDGET);
    AgentforceServiceBudget.commitPending();
    Test.stopTest();

    Assert.areEqual(9, storedCount(), '7 plus 2');
  }

  @IsTest
  static void commitWithNothingPendingWritesNothing() {
    Test.startTest();
    AgentforceServiceBudget.commitPending();
    Test.stopTest();

    Assert.areEqual(0, [SELECT COUNT() FROM API_Rate_Window__c], 'No row');
  }

  @IsTest
  static void aRivalInsertOfTheSameHourIsAddedTo() {
    AgentforceServiceBudget.nowOverride = NOW;
    AgentforceServiceBudget.rivalRow = new API_Rate_Window__c(
      Key__c = KEY,
      Window_Start__c = Datetime.newInstanceGmt(2026, 10, 26, 23, 0, 0),
      Count__c = 4
    );

    Test.startTest();
    AgentforceServiceBudget.tryReserve(BUDGET);
    AgentforceServiceBudget.commitPending();
    Test.stopTest();

    Assert.areEqual(5, storedCount(), 'The rival row plus this call');
  }

  @IsTest
  static void aFailedWriteNeverThrows() {
    AgentforceServiceBudget.nowOverride = NOW;
    AgentforceServiceBudget.failForTest = true;

    Test.startTest();
    AgentforceServiceBudget.tryReserve(BUDGET);
    AgentforceServiceBudget.commitPending();
    Test.stopTest();

    Assert.isNull(storedCount(), 'Nothing written, nothing thrown');
    Assert.areEqual(0, AgentforceServiceBudget.usedThisHour(), 'Cleared');
  }

  @IsTest
  static void aNewHourStartsEmpty() {
    AgentforceServiceBudget.nowOverride = NOW;
    storeCount(BUDGET);
    AgentforceServiceBudget.nowOverride = NOW.addHours(1);

    Test.startTest();
    Boolean allowed = AgentforceServiceBudget.tryReserve(BUDGET);
    Test.stopTest();

    Assert.isTrue(allowed, 'The last hour was full, this one is not');
  }

  @IsTest
  static void aTransactionAcrossTheHourWritesToItsFirstHour() {
    AgentforceServiceBudget.nowOverride = NOW;

    Test.startTest();
    AgentforceServiceBudget.tryReserve(BUDGET);
    AgentforceServiceBudget.nowOverride = NOW.addHours(1);
    AgentforceServiceBudget.tryReserve(BUDGET);
    AgentforceServiceBudget.commitPending();
    Test.stopTest();

    Assert.areEqual(2, storedCount(), 'Both calls on the first hour row');
  }
}
