/**
 * @description       : Unit tests for PAPIHealth REST resource.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 01/02/2026
 **/
@IsTest
private class PAPIHealthTest {
  private static final String URI = '/services/apexrest/papi/v1/health';
  private static final Pattern UUID_PATTERN = Pattern.compile(
    '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  );

  /**
   * Stands in for the Portfolio_API credential and records the request it receives.
   */
  private class CredentialMock implements HttpCalloutMock {
    private final Integer statusCode;
    private final Boolean fail;
    public HttpRequest received;

    CredentialMock(Integer statusCode, Boolean fail) {
      this.statusCode = statusCode;
      this.fail = fail;
    }

    public HttpResponse respond(HttpRequest req) {
      received = req;
      if (fail) {
        throw new CalloutException('Unable to reach endpoint');
      }
      HttpResponse res = new HttpResponse();
      res.setStatusCode(statusCode);
      res.setBody('{"status":"UP"}');
      return res;
    }
  }

  private static Map<String, Object> callHealth(CredentialMock mock) {
    Test.setMock(HttpCalloutMock.class, mock);
    RestTestUtil.initGet(URI);
    Test.startTest();
    PAPIHealth.getHealth();
    Test.stopTest();
    return RestTestUtil.getBodyAsMap();
  }

  private static Map<String, Object> dependenciesOf(Map<String, Object> body) {
    return (Map<String, Object>) body.get('dependencies');
  }

  @IsTest
  static void credentialUpWhenSapiHealthAnswers200() {
    CredentialMock mock = new CredentialMock(200, false);

    Map<String, Object> body = callHealth(mock);

    Assert.areEqual(200, RestTestUtil.getResponse().statusCode, 'Always 200');
    Assert.areEqual(
      'UP',
      dependenciesOf(body).get('credential'),
      'Maintenance Guide 1.2: dependencies.credential is UP'
    );
    Assert.areEqual(
      'UP',
      dependenciesOf(body).get('sapi'),
      'SAPI read in-process'
    );
    Assert.areEqual('DEEP', body.get('checkType'), 'Dependencies are checked');
    Assert.areEqual(
      'no-store, no-cache',
      RestTestUtil.getResponse().headers.get('Cache-Control'),
      'Health is never cached'
    );
  }

  @IsTest
  static void credentialCalloutTargetsSapiHealthWithTracingHeaders() {
    CredentialMock mock = new CredentialMock(200, false);

    callHealth(mock);

    Assert.areEqual(
      'callout:Portfolio_API/services/apexrest/sapi/v1/health',
      mock.received.getEndpoint(),
      'Goes through the Portfolio_API Named Credential to SAPI health'
    );
    Assert.areEqual('GET', mock.received.getMethod(), 'GET request');
    Assert.isTrue(
      UUID_PATTERN.matcher(mock.received.getHeader('X-Request-Id')).matches(),
      'SAPI rejects a missing or non-UUID X-Request-Id'
    );
    Assert.areEqual(
      'v1',
      mock.received.getHeader('X-API-Version'),
      'Version header sent'
    );
  }

  @IsTest
  static void credentialDownAndDegradedOn401() {
    Map<String, Object> body = callHealth(new CredentialMock(401, false));

    Assert.areEqual(
      'DOWN',
      dependenciesOf(body).get('credential'),
      'A rejected credential is DOWN'
    );
    Assert.areEqual(
      'DEGRADED',
      body.get('status'),
      'SAPI is up, so the service is degraded, not down'
    );
    Assert.areEqual(
      'HTTP 401',
      ((Map<String, Object>) body.get('details')).get('credential'),
      'Detail carries the status code'
    );
  }

  @IsTest
  static void credentialDownWhenCalloutThrows() {
    Map<String, Object> body = callHealth(new CredentialMock(0, true));

    Assert.areEqual(
      'DOWN',
      dependenciesOf(body).get('credential'),
      'An unreachable credential is DOWN'
    );
    Assert.areEqual(
      'System.CalloutException',
      ((Map<String, Object>) body.get('details')).get('credential'),
      'Detail carries the exception type, not its message'
    );
  }

  @IsTest
  static void sapiFailureMakesServiceDown() {
    PAPITransformer.forcedSectionFailures.add('sapi');

    Map<String, Object> body = callHealth(new CredentialMock(200, false));

    Assert.areEqual('DOWN', dependenciesOf(body).get('sapi'), 'SAPI failed');
    Assert.areEqual('DOWN', body.get('status'), 'No SAPI means DOWN');
  }

  @IsTest
  static void namedCredentialPresenceIsReported() {
    Map<String, Object> body = callHealth(new CredentialMock(200, false));

    Set<String> allowed = new Set<String>{ 'CONFIGURED', 'MISSING' };
    for (String key : new List<String>{ 'jira', 'github', 'gemini' }) {
      Assert.isTrue(
        allowed.contains((String) dependenciesOf(body).get(key)),
        key +
          ' presence is read from NamedCredential: ' +
          dependenciesOf(body).get(key)
      );
    }
  }

  @IsTest
  static void unreadableNamedCredentialsAreUnknown() {
    PAPITransformer.forcedSectionFailures.add('named-credentials');

    Map<String, Object> body = callHealth(new CredentialMock(200, false));

    Assert.areEqual('UNKNOWN', dependenciesOf(body).get('jira'), 'Jira');
    Assert.areEqual('UNKNOWN', dependenciesOf(body).get('github'), 'GitHub');
    Assert.areEqual('UNKNOWN', dependenciesOf(body).get('gemini'), 'Gemini');
    Assert.areEqual(
      'DEGRADED',
      body.get('status'),
      'Unknown credentials degrade the service'
    );
  }

  @IsTest
  static void overallStatusUpWhenEverythingIsHealthy() {
    Map<String, Object> dependencies = new Map<String, Object>{
      'sapi' => 'UP',
      'credential' => 'UP',
      'jira' => 'CONFIGURED',
      'github' => 'CONFIGURED',
      'gemini' => 'CONFIGURED'
    };

    Assert.areEqual(
      'UP',
      PAPIHealth.overallStatus(dependencies),
      'All dependencies healthy'
    );
  }

  @IsTest
  static void overallStatusDegradedWhenANamedCredentialIsMissing() {
    Map<String, Object> dependencies = new Map<String, Object>{
      'sapi' => 'UP',
      'credential' => 'UP',
      'jira' => 'CONFIGURED',
      'github' => 'MISSING',
      'gemini' => 'CONFIGURED'
    };

    Assert.areEqual(
      'DEGRADED',
      PAPIHealth.overallStatus(dependencies),
      'A missing Named Credential degrades the service'
    );
  }

  @IsTest
  static void credentialTimeoutComesFromItsSetting() {
    Integer shipped = PAPIHealth.credentialTimeoutMs();
    PortfolioSettings.overrideNumber('Health_Credential_Timeout_Ms', 2500);

    Integer overridden = PAPIHealth.credentialTimeoutMs();

    Assert.areEqual(
      PAPIHealth.CREDENTIAL_TIMEOUT_MS,
      shipped,
      'The shipped record matches the code default'
    );
    Assert.areEqual(2500, overridden, 'The setting changes the timeout');
  }

  @IsTest
  static void credentialTimeoutFallsBackWhenTheSettingIsMissing() {
    PortfolioSettings.overrides.put('Health_Credential_Timeout_Ms', null);

    Assert.areEqual(
      PAPIHealth.CREDENTIAL_TIMEOUT_MS,
      PAPIHealth.credentialTimeoutMs(),
      'No record means the code default'
    );
  }
}
