/**
 * @description       : Tests for CircuitBreaker: three failures open the
 *                      circuit, it skips for 30 minutes and then closes, a success resets it,
 *                      snapshot reports every key, and the site guest can read and write it.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/21/2026
 **/
@IsTest
private class CircuitBreakerTest {
  private static final Datetime START = Datetime.newInstanceGmt(
    2026,
    10,
    21,
    12,
    0,
    0
  );
  private static final String KEY = CircuitBreaker.KEY_JIRA;

  private static void failTimes(String key, Integer count) {
    for (Integer i = 0; i < count; i++) {
      CircuitBreaker.recordFailure(key);
    }
  }

  private static Circuit_Breaker_State__c storedRow(String key) {
    return [
      SELECT Consecutive_Failures__c, Open_Until__c, Last_Failure_At__c
      FROM Circuit_Breaker_State__c
      WHERE Name = :key
    ];
  }

  @IsTest
  static void shouldStayClosedWhenTwoFailures() {
    CircuitBreaker.nowOverride = START;

    failTimes(KEY, 2);

    Assert.isFalse(CircuitBreaker.isOpen(KEY), 'Two failures keep it closed');
    Assert.areEqual(2, storedRow(KEY).Consecutive_Failures__c, 'Count stored');
  }

  @IsTest
  static void shouldOpenWhenThirdFailure() {
    CircuitBreaker.nowOverride = START;

    failTimes(KEY, 3);

    Assert.isTrue(CircuitBreaker.isOpen(KEY), 'Third failure opens it');
    Assert.areEqual(
      START.addMinutes(CircuitBreaker.OPEN_MINUTES),
      CircuitBreaker.openUntil(KEY),
      'Open for 30 minutes'
    );
    Assert.areEqual(
      START.addMinutes(30),
      storedRow(KEY).Open_Until__c,
      'Open window stored in the custom setting'
    );
  }

  @IsTest
  static void shouldStayOpenWhenTwentyNineMinutesPass() {
    CircuitBreaker.nowOverride = START;
    failTimes(KEY, 3);

    CircuitBreaker.nowOverride = START.addMinutes(29);

    Assert.isTrue(CircuitBreaker.isOpen(KEY), 'Still skipping at 29 minutes');
  }

  @IsTest
  static void shouldCloseWhenThirtyMinutesPass() {
    CircuitBreaker.nowOverride = START;
    failTimes(KEY, 3);

    CircuitBreaker.nowOverride = START.addMinutes(30);

    Assert.isFalse(CircuitBreaker.isOpen(KEY), 'Closed after 30 minutes');
    Assert.isNull(CircuitBreaker.openUntil(KEY), 'No open window reported');
  }

  @IsTest
  static void shouldReopenWhenTrialCallFailsAfterCoolDown() {
    CircuitBreaker.nowOverride = START;
    failTimes(KEY, 3);
    CircuitBreaker.nowOverride = START.addMinutes(31);

    CircuitBreaker.recordFailure(KEY);

    Assert.isTrue(CircuitBreaker.isOpen(KEY), 'A failed trial reopens it');
    Assert.areEqual(
      START.addMinutes(61),
      CircuitBreaker.openUntil(KEY),
      'For another 30 minutes'
    );
  }

  @IsTest
  static void shouldResetAndCloseWhenSuccessRecorded() {
    CircuitBreaker.nowOverride = START;
    failTimes(KEY, 3);

    CircuitBreaker.recordSuccess(KEY);

    Assert.isFalse(CircuitBreaker.isOpen(KEY), 'A success closes it');
    Circuit_Breaker_State__c row = storedRow(KEY);
    Assert.areEqual(0, row.Consecutive_Failures__c, 'Count reset');
    Assert.isNull(row.Open_Until__c, 'Window cleared');
  }

  @IsTest
  static void shouldNotCountOldFailuresWhenSuccessInBetween() {
    CircuitBreaker.nowOverride = START;
    failTimes(KEY, 2);
    CircuitBreaker.recordSuccess(KEY);

    failTimes(KEY, 2);

    Assert.isFalse(CircuitBreaker.isOpen(KEY), 'Failures must be consecutive');
  }

  @IsTest
  static void shouldWriteNothingWhenSuccessOnUnknownKey() {
    CircuitBreaker.recordSuccess(CircuitBreaker.KEY_GITHUB);

    Assert.areEqual(
      0,
      [SELECT COUNT() FROM Circuit_Breaker_State__c],
      'A success on a healthy key writes no row'
    );
  }

  @IsTest
  static void shouldWriteOnceWhenSuccessOnHealthyKey() {
    CircuitBreaker.recordFailure(KEY);
    CircuitBreaker.recordSuccess(KEY);
    Integer dmlBefore = Limits.getDmlStatements();

    CircuitBreaker.recordSuccess(KEY);

    Assert.areEqual(
      dmlBefore,
      Limits.getDmlStatements(),
      'A success with nothing to reset writes nothing'
    );
  }

  @IsTest
  static void shouldKeepKeysApartWhenOneKeyOpens() {
    CircuitBreaker.nowOverride = START;

    failTimes(CircuitBreaker.KEY_GEMINI, 3);

    Assert.isTrue(
      CircuitBreaker.isOpen(CircuitBreaker.KEY_GEMINI),
      'Gemini open'
    );
    Assert.isFalse(
      CircuitBreaker.isOpen(CircuitBreaker.KEY_JIRA),
      'Jira closed'
    );
  }

  @IsTest
  static void shouldTreatKeysCaseInsensitivelyWhenMixedCase() {
    CircuitBreaker.nowOverride = START;

    failTimes(' Jira ', 3);

    Assert.isTrue(CircuitBreaker.isOpen('jira'), 'Same breaker');
  }

  @IsTest
  static void shouldReadStoredStateWhenNewTransactionStarts() {
    insert new Circuit_Breaker_State__c(
      Name = 'github',
      Consecutive_Failures__c = 3,
      Open_Until__c = Datetime.now().addMinutes(10)
    );

    Assert.isTrue(
      CircuitBreaker.isOpen(CircuitBreaker.KEY_GITHUB),
      'State persisted by an earlier run is read'
    );
  }

  @IsTest
  static void shouldReportEveryKnownKeyWhenSnapshotTaken() {
    CircuitBreaker.nowOverride = START;
    failTimes(CircuitBreaker.KEY_GEMINI, 3);
    failTimes('other-service', 1);

    List<CircuitBreaker.BreakerState> states = CircuitBreaker.snapshot();

    Assert.areEqual(5, states.size(), 'Four known keys and one other');
    Assert.areEqual(CircuitBreaker.KEY_JIRA, states[0].key, 'Known keys first');
    Assert.isFalse(states[0].open, 'Jira closed');
    Assert.areEqual(0, states[0].failures, 'No row means 0 failures');
    Assert.isNull(states[0].openUntil, 'Closed has no window');
    CircuitBreaker.BreakerState gemini = states[2];
    Assert.areEqual(CircuitBreaker.KEY_GEMINI, gemini.key, 'Gemini third');
    Assert.isTrue(gemini.open, 'Gemini open');
    Assert.areEqual(3, gemini.failures, 'Gemini failures');
    Assert.areEqual(START.addMinutes(30), gemini.openUntil, 'Gemini window');
    Assert.areEqual('other-service', states[4].key, 'Other keys after');
  }

  @IsTest
  static void shouldThrowWhenKeyBlank() {
    try {
      CircuitBreaker.isOpen(' ');
      Assert.fail('A blank key must be refused');
    } catch (IllegalArgumentException e) {
      Assert.isTrue(e.getMessage().contains('required'), 'Says why');
    }
  }

  @IsTest
  static void shouldThrowWhenKeyTooLong() {
    try {
      CircuitBreaker.recordFailure('x'.repeat(39));
      Assert.fail('A key longer than the Name field must be refused');
    } catch (IllegalArgumentException e) {
      Assert.isTrue(e.getMessage().contains('38'), 'Says the limit');
    }
  }

  @IsTest
  static void shouldReadAndWriteWhenRunningAsSiteGuest() {
    User guest = SiteGuestTestSupport.preparedGuest();
    Boolean openForGuest;

    Test.startTest();
    System.runAs(guest) {
      failTimes(CircuitBreaker.KEY_GEMINI, 3);
      openForGuest = CircuitBreaker.isOpen(CircuitBreaker.KEY_GEMINI);
    }
    Test.stopTest();

    Assert.isTrue(openForGuest, 'The guest path opens the circuit');
    Assert.areEqual(
      3,
      storedRow(CircuitBreaker.KEY_GEMINI).Consecutive_Failures__c,
      'The guest wrote the row'
    );
  }

  @IsTest
  static void shouldOpenAtTheThresholdSetting() {
    PortfolioSettings.overrideNumber('Circuit_Failure_Threshold', 5);
    CircuitBreaker.nowOverride = START;

    failTimes(KEY, 4);
    Boolean openAfterFour = CircuitBreaker.isOpen(KEY);
    failTimes(KEY, 1);

    Assert.isFalse(
      openAfterFour,
      'Four failures stay under a threshold of five'
    );
    Assert.isTrue(CircuitBreaker.isOpen(KEY), 'The fifth failure opens it');
  }

  @IsTest
  static void shouldStayOpenForTheOpenMinutesSetting() {
    PortfolioSettings.overrideNumber('Circuit_Open_Minutes', 5);
    CircuitBreaker.nowOverride = START;

    failTimes(KEY, 3);

    Assert.areEqual(
      START.addMinutes(5),
      CircuitBreaker.openUntil(KEY),
      'Open for the set minutes'
    );
  }
}
