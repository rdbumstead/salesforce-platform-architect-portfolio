/**
 * @description       : Unit tests for PortfolioLog: the System.debug fallback when Nebula
 *                      Logger is absent, and an injected fake Callable standing in for
 *                      Nebula's CallableLogger.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/21/2026
 **/
@IsTest
private class PortfolioLogTest {
  private class FakeCallable implements System.Callable {
    public String lastAction;
    public Map<String, Object> lastArgs;
    public Object answer = new Map<String, Object>{ 'isSuccess' => true };
    public Boolean fail = false;

    public Object call(String action, Map<String, Object> args) {
      if (fail) {
        throw new IllegalArgumentException('Unknown action: ' + action);
      }
      lastAction = action;
      lastArgs = args;
      return answer;
    }
  }

  @IsTest
  static void absentNebulaFallsBackToDebug() {
    PortfolioLog.ignoreInstalledNebula = true;

    Test.startTest();
    Boolean toNebula = PortfolioLog.info('api request path=/x status=200');
    Test.stopTest();

    Assert.isFalse(toNebula, 'No Nebula, so the line goes to System.debug');
    Assert.isFalse(PortfolioLog.isNebulaAvailable(), 'Reported as absent');
  }

  @IsTest
  static void lookupByNameNeverThrows() {
    Test.startTest();
    Boolean available = PortfolioLog.isNebulaAvailable();
    Boolean toNebula = PortfolioLog.info('line');
    Test.stopTest();

    // CI and scratch orgs have no Nebula, an org with Nebula has it. Either way the
    // lookup by name answers without a compile-time reference and without throwing.
    Assert.areEqual(available, toNebula, 'Sent where the lookup said');
  }

  @IsTest
  static void injectedCallableReceivesNebulaNewEntry() {
    FakeCallable fake = new FakeCallable();
    PortfolioLog.injectedSink = fake;

    Test.startTest();
    Boolean toNebula = PortfolioLog.info('api request status=200');
    Test.stopTest();

    Assert.isTrue(toNebula, 'Sent to the Callable');
    Assert.isTrue(PortfolioLog.isNebulaAvailable(), 'Reported as present');
    Assert.areEqual('newEntry', fake.lastAction, 'Nebula action name');
    Assert.areEqual('INFO', fake.lastArgs.get('loggingLevel'), 'Level name');
    Assert.areEqual(
      'api request status=200',
      fake.lastArgs.get('message'),
      'Message passed as given'
    );
    Assert.areEqual(true, fake.lastArgs.get('saveLog'), 'Saved in one call');
    Assert.areEqual(
      new List<Object>{ PortfolioLog.TAG },
      fake.lastArgs.get('tags'),
      'Tagged'
    );
  }

  @IsTest
  static void nebulaReportingFailureFallsBackToDebug() {
    FakeCallable fake = new FakeCallable();
    fake.answer = new Map<String, Object>{
      'isSuccess' => false,
      'exceptionMessage' => 'Logger disabled'
    };
    PortfolioLog.injectedSink = fake;

    Test.startTest();
    Boolean toNebula = PortfolioLog.info('line');
    Test.stopTest();

    Assert.isFalse(toNebula, 'isSuccess false means the line was not kept');
  }

  @IsTest
  static void throwingCallableNeverReachesTheCaller() {
    FakeCallable fake = new FakeCallable();
    fake.fail = true;
    PortfolioLog.injectedSink = fake;

    Test.startTest();
    Boolean toNebula = PortfolioLog.info(null);
    Test.stopTest();

    Assert.isFalse(toNebula, 'A throwing logger falls back quietly');
  }

  @IsTest
  static void nonMapAnswerCountsAsAccepted() {
    FakeCallable fake = new FakeCallable();
    fake.answer = null;
    PortfolioLog.injectedSink = fake;

    Test.startTest();
    Boolean toNebula = PortfolioLog.info('line');
    Test.stopTest();

    Assert.isTrue(toNebula, 'No answer map is not a failure');
  }

  /**
   * @description A public Callable the lookup can build with Type.newInstance, standing in
   *              for Nebula's CallableLogger.
   */
  public class StandInLogger implements System.Callable {
    public Object call(String action, Map<String, Object> args) {
      return new Map<String, Object>{ 'isSuccess' => true };
    }
  }

  @IsTest
  static void lookupSkipsMissingAndUnusableTypesAndTakesTheFirstCallable() {
    PortfolioLog.candidateOverride = new List<Type>{
      null,
      ApiRateLimiter.class,
      RequestUtil.class,
      StandInLogger.class
    };

    Test.startTest();
    Boolean available = PortfolioLog.isNebulaAvailable();
    Boolean toNebula = PortfolioLog.info('line');
    Test.stopTest();

    Assert.isTrue(available, 'The first Callable type is used');
    Assert.isTrue(toNebula, 'Lines go to it');
  }

  @IsTest
  static void lookupWithNoCallableFallsBackToDebug() {
    PortfolioLog.candidateOverride = new List<Type>{ null, RequestUtil.class };

    Test.startTest();
    Boolean toNebula = PortfolioLog.info('line');
    Test.stopTest();

    Assert.isFalse(toNebula, 'No Callable, so System.debug');
  }
}
