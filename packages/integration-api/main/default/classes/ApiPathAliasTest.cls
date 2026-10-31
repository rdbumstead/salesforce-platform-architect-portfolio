/**
 * @description       : Tests the versionless URLs and the alias retirement of the old /v1/ URLs
 *                      (ADR-040): the canonical path function, the Link, Deprecation and Sunset
 *                      headers on an old URL, the 410 from the path sunset date with the dates
 *                      set and blank, how they combine with the v1 version dates (ADR-039), and
 *                      that the token and health exceptions still hold on both spellings.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/31/2026
 **/
@IsTest
private class ApiPathAliasTest {
  private static final String SAPI_OLD = '/services/apexrest/sapi/v1/skills';
  private static final String SAPI_NEW = '/services/apexrest/sapi/skills';
  private static final String SUCCESSOR = '<https://ryanbumstead.com/api-lab/reference?version=v2>; rel="successor-version"';
  private static final String CANONICAL = '<' + SAPI_NEW + '>; rel="canonical"';
  // 2026-11-01 00:00 UTC, a Sunday.
  private static final String NOV_1_DEPRECATION = '@1793491200';
  private static final String NOV_1_SUNSET = 'Sun, 01 Nov 2026 00:00:00 GMT';
  // 2026-12-01 00:00 UTC, a Tuesday.
  private static final String DEC_1_SUNSET = 'Tue, 01 Dec 2026 00:00:00 GMT';
  private static final String VERSION_GONE = ApiMessages.versionGone(
    Date.newInstance(2026, 11, 1)
  );

  private class CountingLimiter implements ApiRateLimiter {
    Integer checks = 0;
    String lastTier;
    public ApiRequestContext.RateDecision check(
      String tierKey,
      Integer limitPerMinute
    ) {
      checks++;
      lastTier = tierKey;
      return new ApiRequestContext.RateDecision(true, limitPerMinute, 5, 0);
    }
    public ApiRequestContext.RateDecision checkKey(
      String callerKey,
      Integer limitPerMinute
    ) {
      return check(callerKey, limitPerMinute);
    }
  }

  private static void send(
    String uri,
    String version,
    Map<String, String> params
  ) {
    Map<String, String> headers = new Map<String, String>{
      'X-Request-Id' => UUID.randomUUID().toString()
    };
    if (version != null) {
      headers.put('X-API-Version', version);
    }
    RestTestUtil.initGetRaw(uri, headers, params);
  }

  // Turns the date settings on. A date the test does not set reads as blank, never as the date
  // deployed to the org.
  private static void setting(String name, String text) {
    ApiRequestContext.readConfiguredDates = true;
    for (
      String dateSetting : new List<String>{
        ApiRequestContext.V1_DEPRECATION_SETTING,
        ApiRequestContext.V1_SUNSET_SETTING,
        ApiRequestContext.V1_PATH_DEPRECATION_SETTING,
        ApiRequestContext.V1_PATH_SUNSET_SETTING
      }
    ) {
      if (!PortfolioSettings.overrides.containsKey(dateSetting)) {
        PortfolioSettings.overrides.put(
          dateSetting,
          new Portfolio_Setting__mdt(DeveloperName = dateSetting)
        );
      }
    }
    PortfolioSettings.overrides.put(
      name,
      new Portfolio_Setting__mdt(DeveloperName = name, Text_Value__c = text)
    );
  }

  private static String header(String name) {
    return RestContext.response.headers.get(name);
  }

  private static Map<String, Object> bodyMap() {
    return (Map<String, Object>) JSON.deserializeUntyped(
      RestContext.response.responseBody.toString()
    );
  }

  // --- The canonical path ---

  @IsTest
  static void shouldTurnEveryUriIntoOneVersionlessPath() {
    Map<String, String> expected = new Map<String, String>{
      '/services/apexrest/papi/v1/health' => '/papi/health',
      '/services/apexrest/papi/health' => '/papi/health',
      '/services/apexrest/PAPI/V1/Health/' => '/papi/health',
      '/portfoliovforcesite/services/apexrest/papi/v1/auth/token' => '/papi/auth/token',
      '/services/apexrest/papi/auth/token?x=1' => '/papi/auth/token',
      '/services/apexrest/sapi/v1/projects/a015e00000ABCDE' => '/sapi/projects/a015e00000abcde',
      '/services/apexrest/papi/v1' => '/papi',
      '/services/apexrest/papi/v1/v1/x' => '/papi/v1/x',
      '/openapi' => '/openapi'
    };
    for (String uri : expected.keySet()) {
      Assert.areEqual(
        expected.get(uri),
        ApiRequestContext.canonicalPath(uri),
        uri
      );
    }
    Assert.isNull(ApiRequestContext.canonicalPath(null));
    Assert.isNull(ApiRequestContext.canonicalPath(' '));
  }

  @IsTest
  static void shouldRecogniseTheOldSpellingOnly() {
    Assert.isTrue(
      ApiRequestContext.isLegacyPath('/services/apexrest/papi/v1/health')
    );
    Assert.isTrue(
      ApiRequestContext.isLegacyPath('/services/apexrest/SAPI/V1/skills/')
    );
    Assert.isFalse(
      ApiRequestContext.isLegacyPath('/services/apexrest/papi/health')
    );
    Assert.isFalse(
      ApiRequestContext.isLegacyPath('/services/apexrest/papi/projects/v1')
    );
    Assert.isFalse(ApiRequestContext.isLegacyPath('/services/apexrest/papi'));
    Assert.isFalse(ApiRequestContext.isLegacyPath('/v1/other'));
    Assert.isFalse(ApiRequestContext.isLegacyPath(null));
  }

  @IsTest
  static void shouldSpellTheVersionlessUriWithThePrefixAndCaseKept() {
    Assert.areEqual(
      '/services/apexrest/sapi/projects/a015e00000ABCDE',
      ApiRequestContext.versionlessUri(
        '/services/apexrest/sapi/v1/projects/a015e00000ABCDE/'
      )
    );
    Assert.areEqual(
      '/services/apexrest/papi/health',
      ApiRequestContext.versionlessUri('/services/apexrest/papi/health')
    );
    Assert.isNull(ApiRequestContext.versionlessUri(null));
  }

  @IsTest
  static void shouldReadTheSameEndpointSegmentOnBothSpellings() {
    Map<String, String> expected = new Map<String, String>{
      '/services/apexrest/papi/v1/profile/full' => 'full',
      '/services/apexrest/papi/profile/full' => 'full',
      '/services/apexrest/papi/profile/summary/' => 'summary',
      '/services/apexrest/papi/profile/' => null,
      '/services/apexrest/papi/health' => null,
      '/services/apexrest/sapi/projects/a015e00000ABCDE' => 'a015e00000ABCDE',
      '/services/apexrest/sapi/v1/projects/a015e00000ABCDE' => 'a015e00000ABCDE'
    };
    for (String uri : expected.keySet()) {
      send(uri, 'v2', null);
      Assert.areEqual(
        expected.get(uri),
        ApiRequestContext.begin().endpointSegment(),
        uri
      );
    }
  }

  // --- The alias headers ---

  @IsTest
  static void shouldPointAnOldUrlAtTheVersionlessUrlWithALinkHeader() {
    send(
      SAPI_OLD,
      'v2',
      new Map<String, String>{ 'q' => 'x&y', 'limit' => '5' }
    );

    ApiRequestContext ctx = ApiRequestContext.begin();

    Assert.isFalse(ctx.isRejected(), 'Served: blank dates change nothing');
    Assert.areEqual(
      '<' + SAPI_NEW + '?limit=5&q=x%26y>; rel="canonical"',
      header('Link'),
      'The same request on the versionless URL, as v2 so no version link'
    );
    Assert.isNull(header('Deprecation'), 'No date, no Deprecation');
    Assert.isNull(header('Sunset'), 'No date, no Sunset');
  }

  @IsTest
  static void shouldPutThePlatformPrefixBackOnALinkBuiltFromTheShortUri() {
    // On the platform requestURI starts after /services/apexrest.
    send('/sapi/v1/skills', 'v2', null);

    ApiRequestContext.begin();

    Assert.areEqual(
      '<' + SAPI_NEW + '>; rel="canonical"',
      header('Link'),
      'The link is a working URL'
    );
  }

  @IsTest
  static void shouldKeepTheVersionLinkBesideTheCanonicalLinkOnAV1Call() {
    send(SAPI_OLD, 'v1', null);

    ApiRequestContext.begin();

    Assert.areEqual(
      SUCCESSOR + ', ' + CANONICAL,
      header('Link'),
      'Both relations'
    );
  }

  @IsTest
  static void shouldAddNothingToAVersionlessUrl() {
    send(SAPI_NEW, 'v2', null);
    ApiRequestContext.begin();
    Assert.isNull(header('Link'), 'v2 on the new URL carries no Link');

    send(SAPI_NEW, 'v1', null);
    ApiRequestContext.begin();
    Assert.areEqual(
      SUCCESSOR,
      header('Link'),
      'v1 on the new URL: ADR-039 only'
    );
  }

  @IsTest
  static void shouldNotCarryAPostsParametersInTheLink() {
    send('/services/apexrest/papi/v1/ai/generate', 'v2', null);
    RestContext.request.httpMethod = 'POST';
    RestContext.request.params.put('password', 'secret');

    ApiRequestContext.begin();

    Assert.areEqual(
      '<' + '/services/apexrest/papi/ai/generate' + '>; rel="canonical"',
      header('Link')
    );
  }

  @IsTest
  static void shouldSendTheOldUrlDatesWhenSet() {
    setting(ApiRequestContext.V1_PATH_DEPRECATION_SETTING, '2026-11-01');
    setting(ApiRequestContext.V1_PATH_SUNSET_SETTING, '2026-11-01');
    ApiRequestContext.nowOverride = Datetime.newInstanceGmt(2026, 10, 30);
    send(SAPI_OLD, 'v2', null);

    ApiRequestContext ctx = ApiRequestContext.begin();

    Assert.isFalse(ctx.isRejected(), 'Before the sunset the alias is served');
    Assert.areEqual(NOV_1_DEPRECATION, header('Deprecation'), 'Deprecation');
    Assert.areEqual(NOV_1_SUNSET, header('Sunset'), 'Sunset');
    Assert.areEqual(CANONICAL, header('Link'), 'Canonical only, v2 call');

    send(SAPI_NEW, 'v2', null);
    ApiRequestContext.begin();
    Assert.isNull(header('Deprecation'), 'The new URL carries neither date');
    Assert.isNull(header('Sunset'), 'The new URL carries neither date');
  }

  @IsTest
  static void shouldIgnoreAnOldUrlDateThatDoesNotParse() {
    setting(ApiRequestContext.V1_PATH_DEPRECATION_SETTING, 'next week');
    setting(ApiRequestContext.V1_PATH_SUNSET_SETTING, 'soon');
    send(SAPI_OLD, 'v2', null);

    ApiRequestContext ctx = ApiRequestContext.begin();

    Assert.isFalse(ctx.isRejected(), 'Served');
    Assert.isNull(header('Deprecation'), 'No Deprecation');
    Assert.isNull(header('Sunset'), 'No Sunset');
  }

  // --- How the old URL dates combine with the v1 version dates ---

  @IsTest
  static void shouldSendTheEarlierDateWhenBothRetirementsApply() {
    setting(ApiRequestContext.V1_DEPRECATION_SETTING, '2026-12-01');
    setting(ApiRequestContext.V1_SUNSET_SETTING, '2026-12-01');
    setting(ApiRequestContext.V1_PATH_DEPRECATION_SETTING, '2026-11-01');
    setting(ApiRequestContext.V1_PATH_SUNSET_SETTING, '2026-11-01');
    ApiRequestContext.nowOverride = Datetime.newInstanceGmt(2026, 10, 30);
    send(SAPI_OLD, 'v1', null);

    ApiRequestContext.begin();

    Assert.areEqual(
      NOV_1_DEPRECATION,
      header('Deprecation'),
      'Path is earlier'
    );
    Assert.areEqual(NOV_1_SUNSET, header('Sunset'), 'Path is earlier');
    Assert.areEqual(
      SUCCESSOR +
        ', <https://ryanbumstead.com/api-lab/reference?version=v2>; rel="deprecation"' +
        ', <https://ryanbumstead.com/api-lab/reference?version=v2>; rel="sunset"' +
        ', ' +
        CANONICAL,
      header('Link'),
      'Every relation'
    );

    send(SAPI_NEW, 'v1', null);
    ApiRequestContext.begin();
    Assert.areEqual(
      DEC_1_SUNSET,
      header('Sunset'),
      'v1 on the new URL: version date'
    );
  }

  @IsTest
  static void shouldSendTheVersionDateWhenItIsEarlier() {
    setting(ApiRequestContext.V1_SUNSET_SETTING, '2026-11-01');
    setting(ApiRequestContext.V1_PATH_SUNSET_SETTING, '2026-12-01');
    ApiRequestContext.nowOverride = Datetime.newInstanceGmt(2026, 10, 30);
    send(SAPI_OLD, 'v1', null);

    ApiRequestContext.begin();

    Assert.areEqual(NOV_1_SUNSET, header('Sunset'), 'Version is earlier');
  }

  @IsTest
  static void shouldIgnoreTheVersionDatesOnAV2CallToAnOldUrl() {
    setting(ApiRequestContext.V1_SUNSET_SETTING, '2026-11-01');
    setting(ApiRequestContext.V1_PATH_SUNSET_SETTING, '2026-12-01');
    ApiRequestContext.nowOverride = Datetime.newInstanceGmt(2026, 11, 15);
    send(SAPI_OLD, 'v2', null);

    ApiRequestContext ctx = ApiRequestContext.begin();

    Assert.isFalse(ctx.isRejected(), 'v1 is gone but a v2 call is not');
    Assert.areEqual(DEC_1_SUNSET, header('Sunset'), 'Only the URL date');
  }

  // --- While the Api_Versionless_Urls switch is Off ---

  private static void switchOff() {
    PortfolioSettings.overrides.put(
      ApiRoutes.SETTING,
      new Portfolio_Setting__mdt(
        DeveloperName = ApiRoutes.SETTING,
        Text_Value__c = 'Off'
      )
    );
  }

  @IsTest
  static void shouldTreatNoUrlAsAnAliasWhileSwitchedOff() {
    switchOff();
    setting(ApiRequestContext.V1_PATH_DEPRECATION_SETTING, '2026-01-01');
    setting(ApiRequestContext.V1_PATH_SUNSET_SETTING, '2026-01-02');
    ApiRequestContext.nowOverride = Datetime.newInstanceGmt(2027, 1, 1);

    send(SAPI_OLD, 'v2', null);
    ApiRequestContext ctx = ApiRequestContext.begin();

    Assert.isFalse(ctx.isRejected(), 'Never 410 while Off, whatever the date');
    Assert.isNull(header('Link'), 'No canonical Link');
    Assert.isNull(header('Deprecation'), 'No path Deprecation');
    Assert.isNull(header('Sunset'), 'No path Sunset');
  }

  @IsTest
  static void shouldKeepTheVersionRulesUnchangedWhileSwitchedOff() {
    switchOff();
    setting(ApiRequestContext.V1_DEPRECATION_SETTING, '2026-11-01');
    setting(ApiRequestContext.V1_SUNSET_SETTING, '2026-11-01');
    setting(ApiRequestContext.V1_PATH_SUNSET_SETTING, '2026-11-01');
    ApiRequestContext.nowOverride = Datetime.newInstanceGmt(2026, 10, 30);

    send(SAPI_OLD, 'v1', null);
    ApiRequestContext.begin();
    Assert.areEqual(NOV_1_SUNSET, header('Sunset'), 'The version Sunset');
    Assert.isTrue(header('Link').startsWith(SUCCESSOR), 'The version links');
    Assert.isFalse(header('Link').contains('canonical'), 'No canonical Link');

    ApiRequestContext.nowOverride = Datetime.newInstanceGmt(2027, 1, 1);
    send(SAPI_OLD, 'v1', null);
    Assert.isTrue(ApiRequestContext.begin().isRejected(), 'v1 is gone');
    Assert.areEqual(VERSION_GONE, bodyMap().get('message'), 'The version text');
    send(SAPI_OLD, 'v2', null);
    Assert.isFalse(ApiRequestContext.begin().isRejected(), 'v2 is served');
  }

  // --- The path sunset 410 ---

  @IsTest
  static void shouldAnswer410OnAnOldUrlFromThePathSunsetDate() {
    setting(ApiRequestContext.V1_PATH_SUNSET_SETTING, '2026-11-01');
    ApiRequestContext.nowOverride = Datetime.newInstanceGmt(
      2026,
      11,
      1,
      0,
      0,
      0
    );
    send(SAPI_OLD, 'v2', new Map<String, String>{ 'q' => 'secret' });

    Test.startTest();
    SAPISkill.getSkills();
    Test.stopTest();

    Assert.areEqual(410, RestContext.response.statusCode, 'Gone');
    Map<String, Object> error = bodyMap();
    Assert.areEqual(
      new Set<String>{
        'httpStatus',
        'errorCode',
        'message',
        'correlationId',
        'retryable',
        'help'
      },
      error.keySet(),
      'The existing error envelope'
    );
    Assert.areEqual('GONE', error.get('errorCode'), 'Code');
    Assert.areEqual(false, error.get('retryable'), 'Not retryable');
    String message = (String) error.get('message');
    Assert.isTrue(message.contains(SAPI_NEW), 'Names the versionless URL');
    Assert.isFalse(message.contains('secret'), 'Echoes no query value');
    Assert.isFalse(
      message.contains('API v1 was retired'),
      'Not the version text'
    );
    Assert.areEqual(NOV_1_SUNSET, header('Sunset'), 'Sunset on the 410');
    Assert.isTrue(
      header('Link').contains(CANONICAL.substringBefore('>') + '?q=secret>'),
      'Link has the request'
    );
  }

  @IsTest
  static void shouldServeTheVersionlessUrlAndTheDayBeforeTheSunset() {
    setting(ApiRequestContext.V1_PATH_SUNSET_SETTING, '2026-11-01');
    ApiRequestContext.nowOverride = Datetime.newInstanceGmt(2027, 1, 1);
    send(SAPI_NEW, 'v1', null);
    Assert.isFalse(
      ApiRequestContext.begin().isRejected(),
      'New URL, v1 header'
    );
    send(SAPI_NEW, 'v2', null);
    Assert.isFalse(
      ApiRequestContext.begin().isRejected(),
      'New URL, v2 header'
    );
    send(SAPI_NEW, null, null);
    Assert.isFalse(
      ApiRequestContext.begin().isRejected(),
      'New URL, no header'
    );

    ApiRequestContext.nowOverride = Datetime.newInstanceGmt(
      2026,
      10,
      31,
      23,
      59,
      59
    );
    send(SAPI_OLD, 'v2', null);
    Assert.isFalse(ApiRequestContext.begin().isRejected(), 'One second before');
    Assert.isFalse(ApiRequestContext.isV1PathGone(), 'Not gone');
  }

  @IsTest
  static void shouldChangeNothingWhileBothOldUrlDatesAreBlank() {
    ApiRequestContext.nowOverride = Datetime.newInstanceGmt(2030, 1, 1);
    setting(ApiRequestContext.V1_PATH_DEPRECATION_SETTING, '');
    setting(ApiRequestContext.V1_PATH_SUNSET_SETTING, '   ');

    send(SAPI_OLD, 'v2', null);
    ApiRequestContext ctx = ApiRequestContext.begin();

    Assert.isFalse(ctx.isRejected(), 'Never 410');
    Assert.isNull(header('Deprecation'), 'No Deprecation');
    Assert.isNull(header('Sunset'), 'No Sunset');
    Assert.isFalse(ApiRequestContext.isV1PathGone(), 'Blank is never gone');
    Assert.isNull(ApiRequestContext.v1PathSunsetDate(), 'Blank reads as null');
    Assert.isNull(
      ApiRequestContext.v1PathDeprecationDate(),
      'Blank reads as null'
    );
  }

  @IsTest
  static void shouldKeepTheVersionMessageWhenOnlyTheVersionIsGone() {
    setting(ApiRequestContext.V1_SUNSET_SETTING, '2026-11-01');
    ApiRequestContext.nowOverride = Datetime.newInstanceGmt(2027, 1, 1);
    send(SAPI_OLD, 'v1', null);

    ApiRequestContext ctx = ApiRequestContext.begin();

    Assert.isTrue(ctx.isRejected(), 'Gone');
    Assert.areEqual(
      VERSION_GONE,
      bodyMap().get('message'),
      'The version text exactly'
    );
    send(SAPI_OLD, 'v2', null);
    Assert.isFalse(
      ApiRequestContext.begin().isRejected(),
      'v2 on the old URL is served'
    );
  }

  @IsTest
  static void shouldNameBothFixesWhenTheVersionAndTheUrlAreGone() {
    setting(ApiRequestContext.V1_SUNSET_SETTING, '2026-11-01');
    setting(ApiRequestContext.V1_PATH_SUNSET_SETTING, '2026-11-01');
    ApiRequestContext.nowOverride = Datetime.newInstanceGmt(2027, 1, 1);
    send(SAPI_OLD, null, null);

    ApiRequestContext ctx = ApiRequestContext.begin();

    Assert.isTrue(ctx.isRejected(), 'Gone');
    String message = (String) bodyMap().get('message');
    Assert.isTrue(message.startsWith(VERSION_GONE), 'The version text first');
    Assert.isTrue(message.contains(SAPI_NEW), 'Then the versionless URL');
  }

  @IsTest
  static void shouldSpendNoQuotaOnAnOldUrl410() {
    CountingLimiter limiter = new CountingLimiter();
    ApiRequestContext.limiterOverride = limiter;
    setting(ApiRequestContext.V1_PATH_SUNSET_SETTING, '2026-11-01');
    ApiRequestContext.nowOverride = Datetime.newInstanceGmt(2027, 1, 1);

    send(SAPI_OLD, 'v2', null);
    Assert.isTrue(ApiRequestContext.begin().isRejected(), '410');
    Assert.areEqual(0, limiter.checks, 'A 410 spends none');

    send(SAPI_NEW, 'v2', null);
    Assert.isFalse(ApiRequestContext.begin().isRejected(), 'Served');
    Assert.areEqual(1, limiter.checks, 'A served request spends one');
  }

  @IsTest
  static void shouldKeepTokenAndHealthOpenOnBothSpellingsAfterEverySunset() {
    setting(ApiRequestContext.V1_SUNSET_SETTING, '2026-11-01');
    setting(ApiRequestContext.V1_PATH_SUNSET_SETTING, '2026-11-01');
    setting(ApiRequestContext.V1_PATH_DEPRECATION_SETTING, '2026-10-01');
    ApiRequestContext.nowOverride = Datetime.newInstanceGmt(2027, 1, 1);
    for (
      String path : new List<String>{
        '/services/apexrest/papi/v1/auth/token',
        '/services/apexrest/papi/v1/auth/token/',
        '/services/apexrest/papi/v1/health',
        '/services/apexrest/sapi/v1/health',
        '/services/apexrest/papi/auth/token',
        '/services/apexrest/papi/health',
        '/services/apexrest/sapi/health',
        '/portfoliovforcesite/services/apexrest/papi/v1/auth/token'
      }
    ) {
      send(path, null, null);
      Assert.isFalse(
        ApiRequestContext.begin().isRejected(),
        path + ' is not 410'
      );
      send(path, 'v2', null);
      Assert.isFalse(
        ApiRequestContext.begin().isRejected(),
        path + ' with v2 is not 410'
      );
    }
    send('/services/apexrest/papi/v1/auth/token', null, null);
    ApiRequestContext.begin();
    Assert.isNotNull(
      header('Deprecation'),
      'The old token URL keeps its dates'
    );
    Assert.isNotNull(header('Sunset'), 'The old token URL keeps its dates');
    Assert.isTrue(
      header('Link')
        .contains('</services/apexrest/papi/auth/token>; rel="canonical"'),
      'and points at the new token URL'
    );
    for (
      String path : new List<String>{
        '/services/apexrest/papi/v1/healthcheck',
        '/services/apexrest/papi/v1/auth/tokens',
        '/services/apexrest/papi/v1/ai/generate'
      }
    ) {
      send(path, 'v2', null);
      Assert.isTrue(ApiRequestContext.begin().isRejected(), path + ' is 410');
    }
  }

  // --- Shaping, the rate tier and the log line follow the canonical path ---

  @IsTest
  static void shouldLeaveTheSameBodiesUnshapedOnBothSpellings() {
    Map<String, Object> body = new Map<String, Object>{
      'id' => 'x',
      'name' => 'n'
    };
    for (
      String path : new List<String>{
        '/services/apexrest/papi/auth/token',
        '/services/apexrest/papi/v1/auth/token',
        '/services/apexrest/sapi/health',
        '/services/apexrest/sapi/v1/health',
        '/services/apexrest/papi/v1/resume/generate',
        '/services/apexrest/papi/ai/generate',
        '/services/apexrest/sapi/v1/portfolio-config'
      }
    ) {
      send(path, 'v2', null);
      ApiRequestContext.begin().ok(body);
      Assert.isTrue(bodyMap().containsKey('id'), path + ' is not shaped');
    }
    for (
      String path : new List<String>{
        '/services/apexrest/sapi/skills',
        '/services/apexrest/sapi/v1/skills'
      }
    ) {
      send(path, 'v2', null);
      ApiRequestContext.begin().ok(body);
      Assert.isFalse(bodyMap().containsKey('id'), path + ' is shaped');
    }
  }

  @IsTest
  static void shouldUseTheAiTierForBothSpellings() {
    CountingLimiter limiter = new CountingLimiter();
    ApiRequestContext.limiterOverride = limiter;

    send('/services/apexrest/papi/ai/generate', 'v2', null);
    ApiRequestContext.begin();
    Assert.areEqual('papi-ai', limiter.lastTier, 'Versionless');

    send('/services/apexrest/papi/v1/ai/generate', 'v2', null);
    ApiRequestContext.begin();
    Assert.areEqual('papi-ai', limiter.lastTier, 'Old spelling');

    send('/services/apexrest/papi/v1/health', 'v2', null);
    ApiRequestContext.begin();
    Assert.areEqual('papi', limiter.lastTier, 'Other PAPI paths');

    send('/services/apexrest/sapi/skills', 'v2', null);
    ApiRequestContext.begin();
    Assert.areEqual('sapi', limiter.lastTier, 'SAPI');
  }

  @IsTest
  static void shouldMarkTheOldSpellingInTheLogLine() {
    String versionless = RequestUtil.requestLine(
      '/sapi/skills',
      200,
      'id-1',
      3
    );
    String legacy = RequestUtil.requestLine(
      '/sapi/skills',
      200,
      'id-1',
      3,
      true
    );

    Assert.isFalse(versionless.contains('legacyPath'), versionless);
    Assert.isTrue(legacy.startsWith(versionless), legacy);
    Assert.isTrue(legacy.endsWith(' legacyPath=true'), legacy);
    Assert.areEqual(
      legacy,
      RequestUtil.logRequest('/sapi/skills', 200, 'id-1', 3, true),
      'logRequest writes the same line'
    );
  }
}
