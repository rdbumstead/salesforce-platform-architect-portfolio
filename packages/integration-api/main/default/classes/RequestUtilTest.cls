/**
 * @description       : Unit tests for the RequestUtil request log line.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/21/2026
 **/
@IsTest
private class RequestUtilTest {
  @IsTest
  static void lineHoldsPathStatusIdAndTimeOnly() {
    Test.startTest();
    String line = RequestUtil.requestLine(
      '/services/apexrest/papi/v1/health?email=someone@example.com',
      200,
      'abc',
      12
    );
    Test.stopTest();

    Assert.areEqual(
      'api request path=/services/apexrest/papi/v1/health status=200 correlationId=abc elapsedMs=12',
      line,
      'Fixed shape, query string dropped'
    );
  }

  @IsTest
  static void blanksAreNamed() {
    Test.startTest();
    String line = RequestUtil.requestLine(null, null, null, 0);
    Test.stopTest();

    Assert.areEqual(
      'api request path=unknown status=null correlationId=none elapsedMs=0',
      line,
      'Blank values are named, never omitted'
    );
  }

  @IsTest
  static void logRequestWritesThroughTheSeam() {
    PortfolioLog.ignoreInstalledNebula = true;

    Test.startTest();
    String line = RequestUtil.logRequest('/sapi/v1/skills', 429, 'id-1', 3);
    Test.stopTest();

    Assert.isTrue(line.contains('status=429'), line);
  }
}
