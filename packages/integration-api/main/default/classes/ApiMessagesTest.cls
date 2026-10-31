/**
 * @description       : Tests ApiMessages: the rules every message follows (a full sentence
 *                      with a closing period, none of the characters the writing rules ban, no
 *                      exception type or class name), the builders that fill in a value, and the
 *                      help link and its anchor.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/31/2026
 **/
@IsTest
private class ApiMessagesTest {
  private static final String TOKEN_URL = 'https://example.my.site.com/portfoliovforcesite/services/apexrest/papi/auth/token';

  // Every message the class can build, with sample values.
  private static List<String> allMessages() {
    List<String> allowed = new List<String>{ 'A', 'B' };
    return new List<String>{
      ApiMessages.VERSION_UNSUPPORTED,
      ApiMessages.LOCK_BUSY,
      ApiMessages.REQUEST_ID_MISSING,
      ApiMessages.REQUEST_ID_INVALID,
      ApiMessages.versionGone(Date.newInstance(2026, 11, 29)),
      ApiMessages.pathGone(Date.newInstance(2026, 11, 29), '/services/x'),
      ApiMessages.tierLimit('PAPI', 15, 30),
      ApiMessages.tokenLimit(1),
      ApiMessages.limitInvalid(200),
      ApiMessages.offsetInvalid(2000),
      ApiMessages.routeNotFound('GET', '/papi/nothing'),
      ApiMessages.needsToken('/papi/projects', TOKEN_URL),
      ApiMessages.tokensNotHere(TOKEN_URL),
      ApiMessages.methodNotAllowed(
        '/papi/auth/token',
        'POST',
        'GET',
        PAPIRouter.ROUTE_AUTH_TOKEN
      ),
      ApiMessages.methodNotAllowed(
        '/papi/ai/generate',
        'POST',
        'GET',
        PAPIRouter.ROUTE_AI_GENERATE
      ),
      ApiMessages.methodNotAllowed(
        '/papi/projects',
        'GET,HEAD',
        'POST',
        PAPIRouter.ROUTE_PROJECTS
      ),
      ApiMessages.keyRenamed('projectKey', 'projectId'),
      ApiMessages.keyInvalid('projectKey', '/sapi/projects'),
      ApiMessages.idInvalid('projectId', '/sapi/projects'),
      ApiMessages.PERSONA_LIST_INVALID,
      ApiMessages.PERSONA_INVALID,
      ApiMessages.projectNotFound('prj_x', true),
      ApiMessages.projectNotFound('prj_x', false),
      ApiMessages.PROFILE_ENDPOINT_INVALID,
      ApiMessages.RESUME_ENDPOINT_INVALID,
      ApiMessages.MODE_INVALID,
      ApiMessages.serverError('abc'),
      ApiMessages.partial(new List<String>{ 'skills', 'projects' }),
      ApiMessages.AI_BODY_MISSING,
      ApiMessages.AI_BODY_NOT_JSON,
      ApiMessages.AI_BODY_NOT_OBJECT,
      ApiMessages.AI_ALL_UNAVAILABLE,
      ApiMessages.AI_AGENTFORCE_BUDGET,
      ApiMessages.AI_AGENTFORCE_DOWN,
      ApiMessages.fieldMissing('type', allowed),
      ApiMessages.fieldInvalid('type', allowed),
      ApiMessages.TOKEN_BODY_NOT_JSON,
      ApiMessages.TOKEN_BODY_WRONG_SHAPE,
      ApiMessages.TOKEN_EMAIL_INVALID,
      ApiMessages.TOKEN_UNAVAILABLE,
      ApiMessages.tokenPurposeInvalid(280),
      ApiMessages.tokenCapReached(50, 5),
      ApiMessages.tokenNotConfigured('abc'),
      ApiMessages.openApiMissing('https://example.org/x'),
      ApiMessages.LAB_CATALOG_MISSING,
      ApiMessages.LAB_PATH_NOT_ALLOWED,
      ApiMessages.LAB_API_UNREACHABLE,
      ApiMessages.LAB_VERSION_NOT_ALLOWED,
      ApiMessages.labTooManyParams(10),
      ApiMessages.labParamName('a&b'),
      ApiMessages.labParamValue('limit', 200)
    };
  }

  @IsTest
  static void everyMessageIsAFullSentenceWithAClosingPeriod() {
    for (String message : allMessages()) {
      Assert.isTrue(message.endsWith('.'), 'Closing period: ' + message);
      Assert.isTrue(message.length() > 20, 'A sentence: ' + message);
    }
  }

  @IsTest
  static void noMessageHoldsABannedCharacterOrAnInternal() {
    for (String message : allMessages()) {
      Assert.isFalse(message.contains('—'), 'No em dash: ' + message);
      Assert.isFalse(message.contains('–'), 'No en dash: ' + message);
      Assert.isFalse(message.contains(';'), 'No semicolon: ' + message);
      Assert.isFalse(
        message.contains(' - '),
        'No dash between words: ' + message
      );
      for (
        String internal : new List<String>{
          'Exception',
          'System.',
          'Apex',
          'SOQL',
          'stack',
          'ApiRequestContext',
          'SAPIRouter',
          'PAPIRouter'
        }
      ) {
        Assert.isFalse(
          message.contains(internal),
          'No internal "' + internal + '": ' + message
        );
      }
    }
  }

  @IsTest
  static void shouldCountInWords() {
    Assert.areEqual('1 second', ApiMessages.seconds(1));
    Assert.areEqual('2 seconds', ApiMessages.seconds(2));
    Assert.areEqual('0 seconds', ApiMessages.seconds(0));
    Assert.areEqual('1 hour', ApiMessages.hours(1));
    Assert.areEqual('5 hours', ApiMessages.hours(5));
  }

  @IsTest
  static void shouldFillInTheValuesAMessageNames() {
    Assert.isTrue(
      ApiMessages.versionGone(Date.newInstance(2026, 11, 29))
        .contains('2026-11-29'),
      'The retirement date'
    );
    Assert.isTrue(
      ApiMessages.pathGone(Date.newInstance(2026, 11, 29), '/services/x')
        .contains('Call /services/x instead'),
      'The versionless URL'
    );
    String tier = ApiMessages.tierLimit('SAPI', 120, 1);
    Assert.isTrue(tier.contains('120 requests a minute on SAPI routes'), tier);
    Assert.isTrue(tier.contains('Wait 1 second '), 'Singular: ' + tier);
    Assert.isTrue(ApiMessages.tokenLimit(42).contains('42 seconds'), 'Token');
    Assert.isTrue(ApiMessages.limitInvalid(200).contains('1 to 200'), 'Limit');
    Assert.isTrue(
      ApiMessages.offsetInvalid(2000).contains('0 to 2000'),
      'Offset'
    );
    Assert.isTrue(
      ApiMessages.routeNotFound('GET', '/papi/x').contains('no GET /papi/x'),
      'Route'
    );
    Assert.isTrue(
      ApiMessages.tokenCapReached(50, 1).contains('50 evaluator tokens'),
      'Cap'
    );
    Assert.isTrue(
      ApiMessages.tokenCapReached(50, 1).contains('about 1 hour.'),
      'One hour is singular'
    );
    Assert.isTrue(
      ApiMessages.tokenNotConfigured('abc').contains('logged as abc.')
    );
    Assert.isTrue(ApiMessages.serverError('abc').contains('logged as abc.'));
    Assert.isTrue(
      ApiMessages.partial(new List<String>{ 'skills', 'projects' })
        .contains(': skills, projects.'),
      'Sections'
    );
    Assert.isTrue(
      ApiMessages.fieldMissing('type', new List<String>{ 'A', 'B' })
        .contains('Add type, one of A, B.'),
      'Missing'
    );
    Assert.isTrue(
      ApiMessages.fieldInvalid('tone', new List<String>{ 'A', 'B' })
        .startsWith('tone must be one of A, B'),
      'Invalid'
    );
  }

  @IsTest
  static void shouldWordTheTokenAndMethodMessages() {
    String needs = ApiMessages.needsToken('/papi/projects', TOKEN_URL);
    Assert.isTrue(needs.contains('POST ' + TOKEN_URL), 'Token URL');
    Assert.isTrue(needs.contains('/papi/projects'), 'Route');
    Assert.isTrue(needs.contains('Authorization: Bearer'), 'Header');
    Assert.isTrue(ApiMessages.tokensNotHere(TOKEN_URL).contains(TOKEN_URL));

    Assert.areEqual(
      '/papi/projects takes GET or HEAD, not POST.',
      ApiMessages.methodNotAllowed(
        '/papi/projects',
        'GET,HEAD',
        'POST',
        PAPIRouter.ROUTE_PROJECTS
      ),
      'Plain route'
    );
    Assert.isTrue(
      ApiMessages.methodNotAllowed(
          '/papi/auth/token',
          'POST',
          'GET',
          PAPIRouter.ROUTE_AUTH_TOKEN
        )
        .contains(ApiMessages.TOKEN_BODY_SAMPLE),
      'The token route shows its body'
    );
    Assert.isTrue(
      ApiMessages.methodNotAllowed(
          '/papi/ai/generate',
          'POST',
          'GET',
          PAPIRouter.ROUTE_AI_GENERATE
        )
        .contains('API reference'),
      'The AI route points at the reference'
    );
  }

  @IsTest
  static void shouldCutALongParameterNameInTheLabMessage() {
    String message = ApiMessages.labParamName('x'.repeat(100));
    Assert.isFalse(message.contains('x'.repeat(41)), 'Cut to 40: ' + message);
    Assert.isTrue(ApiMessages.labParamName(null).startsWith('An empty name'));
  }

  @IsTest
  static void shouldBuildTheHelpAnchorAndLink() {
    Assert.areEqual('error-bad-request', ApiMessages.helpAnchor('BAD_REQUEST'));
    Assert.areEqual(
      'error-rate-limit-exceeded',
      ApiMessages.helpAnchor('RATE_LIMIT_EXCEEDED')
    );
    Assert.areEqual('error-unknown', ApiMessages.helpAnchor(null));
    Assert.areEqual(
      'https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-gone',
      ApiMessages.helpUrl('GONE', 'papi')
    );
    Assert.areEqual(
      'https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-not-found',
      ApiMessages.helpUrl('NOT_FOUND', 'sapi')
    );
    Assert.isTrue(
      ApiMessages.helpUrl('GONE', null).contains('spec=papi'),
      'Anything but sapi is papi'
    );
  }
}
