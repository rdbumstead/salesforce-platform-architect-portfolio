/**
 * @description       : Tests for SiteActionsResource. Every action runs as a user on the
 *                      Portfolio API Integration profile holding only Portfolio_Site_Edge, so a
 *                      pass proves that permission set grants all the seven actions need. The
 *                      cover letter tests prove the letter stays on Agentforce through the
 *                      Portfolio_API call (the integration user) and never reaches the in
 *                      process Prompt Template path, which needs Prompt Template User.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 11/02/2026
 * @Test Class        : [SiteActionsResourceTest]
 **/
@isTest
private class SiteActionsResourceTest {
  private static final String CONTACT_BODY =
    '{"firstName":"Ada","lastName":"Lovelace","email":"ada@example.com",' +
    '"company":"Analytical","message":"Hello Ryan","website":"","elapsedMs":9000}';
  private static final String OWN_BODY =
    '{"mode":"own","authorName":"Ada","authorTitle":"CTO","relationship":"Peer",' +
    '"vibeMode":"Professional","ownWords":"Ryan rebuilt our release process.",' +
    '"website":"","elapsedMs":9000}';
  private static final String COVER_BODY = '{"companyName":"Acme","jobTitle":"Architect","jobDescription":"Build things."}';
  private static final String API_PREFIX = 'callout:Portfolio_API/services/apexrest/papi/ai/generate';
  private static final String AGENTFORCE_LETTER = 'Dear Acme team, an Agentforce letter.';
  private static final String GEMINI_ANSWER = 'Dear Hiring Manager, a Gemini letter.';

  /** Counts Prompt Template runs, so a test can prove the in process path is never used. */
  private class CountingClient implements PromptTemplateClient {
    public Integer runs = 0;
    public String generate(String templateName, Map<String, String> inputs) {
      runs++;
      return 'in process letter';
    }
  }

  /** Answers the API call with a letter or a status, and Gemini with a letter. */
  private class LetterMock implements HttpCalloutMock {
    public Integer apiCalls = 0;
    public Integer geminiCalls = 0;
    private final Integer apiStatus;

    LetterMock(Integer apiStatus) {
      this.apiStatus = apiStatus;
    }

    public HttpResponse respond(HttpRequest req) {
      HttpResponse res = new HttpResponse();
      res.setHeader('Content-Type', 'application/json');
      if (req.getEndpoint().startsWith(API_PREFIX)) {
        apiCalls++;
        res.setStatusCode(apiStatus);
        res.setHeader('X-RateLimit-Limit', '10');
        res.setBody(
          apiStatus == 200
            ? JSON.serialize(
                new Map<String, Object>{
                  'content' => AGENTFORCE_LETTER,
                  'provider' => 'Agentforce',
                  'model' => 'Portfolio_Cover_Letter',
                  'fallbackOccurred' => false,
                  'latencyMs' => 2700,
                  'attempts' => new List<Object>(),
                  'promptShown' => 'the prompt'
                }
              )
            : '{"message":"down"}'
        );
      } else if (req.getEndpoint().startsWith('callout:Gemini_API/')) {
        geminiCalls++;
        res.setStatusCode(200);
        res.setBody(
          '{"candidates":[{"content":{"parts":[{"text":"' +
            GEMINI_ANSWER +
            '"}]},"finishReason":"STOP"}]}'
        );
      } else {
        res.setStatusCode(500);
        res.setBody('{"message":"unexpected endpoint"}');
      }
      return res;
    }
  }

  @TestSetup
  static void setup() {
    SiteActionsTestSupport.createEdgeUser();
    SiteActionsTestSupport.createUserWithoutEdgePermission();
  }

  private static User edgeUser() {
    return [
      SELECT Id
      FROM User
      WHERE
        Username LIKE :SiteActionsTestSupport.EDGE_USERNAME_PREFIX + '%'
        AND Alias = 'siteedge'
      LIMIT 1
    ];
  }

  private static User plainUser() {
    return [
      SELECT Id
      FROM User
      WHERE
        Username LIKE :SiteActionsTestSupport.EDGE_USERNAME_PREFIX + '%'
        AND Alias = 'noedge'
      LIMIT 1
    ];
  }

  private static RestResponse post(String action, String body, String hash) {
    return SiteActionsTestSupport.call('POST', action, body, hash, null);
  }

  private static RestResponse get(String action) {
    return SiteActionsTestSupport.call('GET', action, null, null, null);
  }

  private static String text(RestResponse res) {
    return res.responseBody.toString();
  }

  private static void assertError(
    RestResponse res,
    Integer status,
    String code,
    String message
  ) {
    Map<String, Object> parsed = (Map<String, Object>) JSON.deserializeUntyped(
      text(res)
    );
    Assert.areEqual(status, res.statusCode, 'Status, body ' + text(res));
    Assert.areEqual(code, parsed.get('error'), 'Error code');
    if (message != null) {
      Assert.areEqual(message, parsed.get('message'), 'Message');
    }
  }

  private static void switchAgentforceOn() {
    AgentforceService.configOverridden = true;
    AgentforceService.configOverride = (AI_Provider_Config__mdt) JSON.deserialize(
      '{"DeveloperName":"Agentforce","Enabled__c":true}',
      AI_Provider_Config__mdt.class
    );
  }

  @isTest
  static void refusesACallerWithoutTheEdgePermission() {
    RestResponse res;
    System.runAs(plainUser()) {
      res = get(SiteActionsResource.ACTION_PIPELINE_STATUS);
    }
    assertError(
      res,
      403,
      'FORBIDDEN',
      'The site actions need the Site_Edge_Actions permission.'
    );
  }

  @isTest
  static void echoesTheRequestId() {
    RestResponse res;
    System.runAs(edgeUser()) {
      res = get(SiteActionsResource.ACTION_PIPELINE_STATUS);
    }
    Assert.areEqual(
      SiteActionsTestSupport.REQUEST_ID,
      res.headers.get('X-Request-Id'),
      'The id comes back'
    );
  }

  @isTest
  static void refusesUnknownActionsAndTheWrongMethod() {
    RestResponse unknown;
    RestResponse wrongGet;
    RestResponse wrongPost;
    System.runAs(edgeUser()) {
      unknown = get('nothing');
      wrongGet = get(SiteActionsResource.ACTION_CONTACT);
      wrongPost = post(SiteActionsResource.ACTION_GLASS_BOX, '{}', null);
    }
    assertError(unknown, 400, 'BAD_REQUEST', 'Unknown action.');
    assertError(wrongGet, 400, 'BAD_REQUEST', 'This action does not take GET.');
    assertError(
      wrongPost,
      400,
      'BAD_REQUEST',
      'This action does not take POST.'
    );
  }

  @isTest
  static void answers500WhenTheCallFailsUnexpectedly() {
    SiteActionsResource.throwException = true;
    RestResponse res;
    System.runAs(edgeUser()) {
      res = get(SiteActionsResource.ACTION_PIPELINE_STATUS);
    }
    assertError(
      res,
      500,
      'CALL_FAILED',
      'The call failed: System.CalloutException'
    );
  }

  @isTest
  static void refusesABadBodyBeforeAnythingRuns() {
    List<RestResponse> answers = new List<RestResponse>();
    System.runAs(edgeUser()) {
      answers.add(post('contact', null, null));
      answers.add(post('contact', 'not json', null));
      answers.add(post('contact', '[1]', null));
      answers.add(post('contact', '{"firstName":5}', null));
      answers.add(post('contact', '{"extra":"x"}', null));
      answers.add(post('contact', '{"elapsedMs":1.5}', null));
      answers.add(post('contact', '{"elapsedMs":-1}', null));
      answers.add(post('contact', '{"elapsedMs":99999999999}', null));
      answers.add(post('contact', '{"elapsedMs":"9000"}', null));
      answers.add(post('contact', 'x'.repeat(100001), null));
      answers.add(post('testimonial', '{"mode":"other"}', null));
      answers.add(post('testimonial', '{"mode":"own","note":"x"}', null));
      answers.add(
        post('lab-invoke', '{"path":"/sapi/skills","params":5}', null)
      );
      answers.add(
        post('lab-invoke', '{"path":"/sapi/skills","params":{"a":5}}', null)
      );
    }
    for (RestResponse res : answers) {
      Assert.areEqual(400, res.statusCode, 'Refused: ' + text(res));
    }
    Assert.areEqual(
      0,
      [SELECT COUNT() FROM Lead],
      'Nothing ran, so no lead was written'
    );
  }

  @isTest
  static void contactAcceptsAValidFormAndWritesALead() {
    RestResponse res;
    Test.startTest();
    System.runAs(edgeUser()) {
      res = post('contact', CONTACT_BODY, SiteActionsTestSupport.HASH_A);
    }
    Test.getEventBus().deliver();
    Test.stopTest();

    Assert.areEqual(200, res.statusCode, 'Accepted, body ' + text(res));
    Assert.areEqual(
      '{"result":{"received":true}}',
      text(res),
      'The result is the Result'
    );
    Assert.areEqual(
      1,
      [SELECT COUNT() FROM Lead WHERE Email = 'ada@example.com'],
      'The event wrote one lead'
    );
  }

  @isTest
  static void contactSaysWhatTheComponentSaysWhenAFieldIsMissing() {
    RestResponse res;
    System.runAs(edgeUser()) {
      res = post(
        'contact',
        '{"lastName":"Lovelace","email":"a@example.com","message":"Hi"}',
        null
      );
    }
    assertError(res, 400, 'BAD_REQUEST', 'Enter your first name.');
  }

  @isTest
  static void contactLimitsEachVisitorByHashAndNotTheWholeSite() {
    List<RestResponse> sameVisitor = new List<RestResponse>();
    RestResponse otherVisitor;
    System.runAs(edgeUser()) {
      for (Integer i = 0; i < 4; i++) {
        sameVisitor.add(
          post('contact', CONTACT_BODY, SiteActionsTestSupport.HASH_A)
        );
      }
      otherVisitor = post(
        'contact',
        CONTACT_BODY,
        SiteActionsTestSupport.HASH_B
      );
    }
    for (Integer i = 0; i < 3; i++) {
      Assert.areEqual(200, sameVisitor[i].statusCode, 'Within the limit ' + i);
    }
    assertError(
      sameVisitor[3],
      429,
      'RATE_LIMITED',
      ContactFormController.RATE_LIMITED_MESSAGE
    );
    Assert.areEqual(
      '60',
      sameVisitor[3].headers.get('Retry-After'),
      'Retry-After is set'
    );
    Assert.areEqual(
      200,
      otherVisitor.statusCode,
      'Another visitor is not limited'
    );
  }

  @isTest
  static void contactLimitFollowsTheSetting() {
    // The Form_Rate_Per_Hash_Per_Minute record ships at 3. The code default is the same.
    Assert.areEqual(
      3,
      PortfolioSettings.getInteger(
        SubmissionGuard.HASH_RATE_SETTING,
        SubmissionGuard.HASH_RATE_PER_MINUTE
      ),
      'Three a minute per visitor'
    );
  }

  @isTest
  static void aBlockedHashIsDroppedSilently() {
    insert new Submission_Block__c(
      Type__c = SubmissionGuard.TYPE_IP_HASH,
      Value__c = SiteActionsTestSupport.HASH_A,
      Active__c = true
    );
    RestResponse blocked;
    RestResponse other;
    Test.startTest();
    System.runAs(edgeUser()) {
      blocked = post('contact', CONTACT_BODY, SiteActionsTestSupport.HASH_A);
      other = post('contact', CONTACT_BODY, SiteActionsTestSupport.HASH_B);
    }
    Test.getEventBus().deliver();
    Test.stopTest();

    Assert.areEqual(200, blocked.statusCode, 'The bot sees the normal thanks');
    Assert.areEqual(200, other.statusCode, 'Another visitor is accepted');
    Assert.areEqual(
      1,
      [SELECT COUNT() FROM Lead WHERE Email = 'ada@example.com'],
      'Only the second visitor wrote a lead'
    );
    Submission_Block__c block = [
      SELECT Hit_Count__c
      FROM Submission_Block__c
    ];
    Assert.areEqual(1, block.Hit_Count__c, 'The block counted one hit');
  }

  @isTest
  static void testimonialOwnWordsSavesAnUnapprovedRow() {
    RestResponse res;
    System.runAs(edgeUser()) {
      res = post('testimonial', OWN_BODY, SiteActionsTestSupport.HASH_A);
    }
    Assert.areEqual(200, res.statusCode, 'Saved, body ' + text(res));
    Testimonial__c saved = [
      SELECT Approved__c, Context__c
      FROM Testimonial__c
      WHERE Author_Name__c = 'Ada'
    ];
    Assert.isFalse(saved.Approved__c, 'Waits for approval');
    Assert.areEqual(
      'Ryan rebuilt our release process.',
      saved.Context__c,
      'The words are kept'
    );
  }

  @isTest
  static void testimonialFragmentsSavesAnUnapprovedRow() {
    List<TestimonialController.Fragment> fragments = TestimonialController.getFragments();
    Assert.isFalse(fragments.isEmpty(), 'Fragments are deployed');
    String strengthId = 'Casual_Strength_01';
    String outcomeId = 'Casual_Outcome_05';
    String body =
      '{"mode":"fragments","authorName":"Grace","authorTitle":"Lead",' +
      '"relationship":"Peer","vibeMode":"Casual","strengthId":"' +
      strengthId +
      '","outcomeId":"' +
      outcomeId +
      '","note":"Great","website":"","elapsedMs":9000}';
    RestResponse res;
    System.runAs(edgeUser()) {
      res = post('testimonial', body, SiteActionsTestSupport.HASH_A);
    }
    Assert.areEqual(200, res.statusCode, 'Saved, body ' + text(res));
    Assert.areEqual(
      1,
      [SELECT COUNT() FROM Testimonial__c WHERE Author_Name__c = 'Grace'],
      'One row'
    );
  }

  @isTest
  static void testimonialLimitsEachVisitorByHash() {
    List<RestResponse> answers = new List<RestResponse>();
    RestResponse other;
    System.runAs(edgeUser()) {
      for (Integer i = 0; i < 4; i++) {
        answers.add(
          post('testimonial', OWN_BODY, SiteActionsTestSupport.HASH_A)
        );
      }
      other = post('testimonial', OWN_BODY, SiteActionsTestSupport.HASH_B);
    }
    assertError(
      answers[3],
      429,
      'RATE_LIMITED',
      TestimonialController.RATE_LIMITED_MESSAGE
    );
    Assert.areEqual(200, other.statusCode, 'Another visitor is not limited');
  }

  @isTest
  static void coverLetterStaysOnAgentforceThroughThePortfolioApiCall() {
    switchAgentforceOn();
    CountingClient client = new CountingClient();
    AgentforceService.clientOverride = client;
    LetterMock mock = new LetterMock(200);
    Test.setMock(HttpCalloutMock.class, mock);
    RestResponse res;
    Test.startTest();
    System.runAs(edgeUser()) {
      res = post('cover-letter', COVER_BODY, SiteActionsTestSupport.HASH_A);
    }
    Test.stopTest();

    Assert.areEqual(200, res.statusCode, 'Served, body ' + text(res));
    Map<String, Object> result = (Map<String, Object>) ((Map<String, Object>) JSON.deserializeUntyped(
        text(res)
      ))
      .get('result');
    Assert.areEqual(AGENTFORCE_LETTER, result.get('content'), 'The letter');
    Assert.areEqual('Agentforce', result.get('provider'), 'Provider');
    Assert.areEqual(1, mock.apiCalls, 'One post to /papi/ai/generate');
    Assert.areEqual(0, mock.geminiCalls, 'No fallback');
    Assert.areEqual(
      0,
      client.runs,
      'The in process Prompt Template path, which needs Prompt Template User, never ran'
    );
  }

  @isTest
  static void coverLetterFallsBackToGeminiWithoutThePromptTemplatePath() {
    switchAgentforceOn();
    CountingClient client = new CountingClient();
    AgentforceService.clientOverride = client;
    LetterMock mock = new LetterMock(503);
    Test.setMock(HttpCalloutMock.class, mock);
    RestResponse res;
    Test.startTest();
    System.runAs(edgeUser()) {
      res = post('cover-letter', COVER_BODY, SiteActionsTestSupport.HASH_A);
    }
    Test.stopTest();

    Assert.areEqual(200, res.statusCode, 'Served, body ' + text(res));
    Assert.isTrue(text(res).contains(GEMINI_ANSWER), 'Gemini wrote the letter');
    Assert.areEqual(
      1,
      mock.geminiCalls,
      'Gemini was called through its principal'
    );
    Assert.areEqual(0, client.runs, 'No Prompt Template run');
  }

  @isTest
  static void coverLetterRefusesMissingInputWithTheComponentText() {
    RestResponse res;
    System.runAs(edgeUser()) {
      res = post('cover-letter', '{"jobTitle":"Architect"}', null);
    }
    assertError(res, 400, 'BAD_REQUEST', 'Company name is required.');
  }

  @isTest
  static void labInvokeCountsTheCallAndRecordingDoesNot() {
    Test.setMock(
      HttpCalloutMock.class,
      new PortfolioApiCalloutMock().withRestResponse(200, '[{"id":"a"}]', null)
    );
    String body = '{"path":"/sapi/skills","params":{},"apiVersion":"v2"}';
    RestResponse live;
    RestResponse recorded;
    Test.startTest();
    System.runAs(edgeUser()) {
      recorded = SiteActionsTestSupport.call(
        'POST',
        'lab-invoke',
        body,
        null,
        new Map<String, String>{ 'X-Site-Recording' => '1' }
      );
    }
    Test.stopTest();
    Assert.areEqual(
      200,
      recorded.statusCode,
      'Recorded call, body ' + text(recorded)
    );
    Assert.areEqual(
      0,
      [SELECT COUNT() FROM Usage_Counter__c],
      'A recorded call writes no usage counter row'
    );
    Assert.isFalse(
      ApiLabController.suppressUsageCount,
      'The flag is cleared after the call'
    );

    Test.setMock(
      HttpCalloutMock.class,
      new PortfolioApiCalloutMock().withRestResponse(200, '[{"id":"a"}]', null)
    );
    System.runAs(edgeUser()) {
      live = post('lab-invoke', body, SiteActionsTestSupport.HASH_A);
    }
    Assert.areEqual(200, live.statusCode, 'Live call, body ' + text(live));
    Assert.isTrue(text(live).contains('"statusCode":200'), 'The API status');
    Assert.areEqual(
      1,
      [
        SELECT COUNT()
        FROM Usage_Counter__c
        WHERE Kind__c = :UsageCounterWriter.KIND_API_LAB_REQUEST
      ],
      'A live call writes one usage counter row'
    );
  }

  @isTest
  static void labInvokeRefusesAPathOutsideTheCatalog() {
    RestResponse res;
    System.runAs(edgeUser()) {
      res = post(
        'lab-invoke',
        '{"path":"/sapi/nothing-here","params":{}}',
        SiteActionsTestSupport.HASH_A
      );
    }
    assertError(res, 400, 'BAD_REQUEST', ApiMessages.LAB_PATH_NOT_ALLOWED);
  }

  @isTest
  static void labTokenKeysTheRequestByTheVisitorHash() {
    Test.setMock(HttpCalloutMock.class, new PortfolioApiCalloutMock());
    RestResponse res;
    Test.startTest();
    System.runAs(edgeUser()) {
      res = post(
        'lab-token',
        '{"email":"reviewer@example.com","purpose":"API Lab"}',
        SiteActionsTestSupport.HASH_A
      );
    }
    Test.stopTest();

    Assert.areEqual(200, res.statusCode, 'Answered, body ' + text(res));
    Assert.isTrue(text(res).contains('"statusCode":200'), 'Issued');
    API_Access_Request__c row = [
      SELECT Source_IP__c, Channel__c
      FROM API_Access_Request__c
    ];
    Assert.areEqual(
      SiteActionsTestSupport.HASH_A,
      row.Source_IP__c,
      'The audit row holds the hash, never an IP'
    );
  }

  @isTest
  static void labTokenFallsBackToTheSessionIpWithNoHash() {
    Test.setMock(HttpCalloutMock.class, new PortfolioApiCalloutMock());
    RestResponse res;
    System.runAs(edgeUser()) {
      res = post(
        'lab-token',
        '{"email":"reviewer@example.com","purpose":"API Lab"}',
        null
      );
    }
    Assert.areEqual(200, res.statusCode, 'Answered, body ' + text(res));
    Assert.areEqual(
      TokenExchangeService.IP_UNAVAILABLE,
      [SELECT Source_IP__c FROM API_Access_Request__c].Source_IP__c,
      'With no hash the old behaviour stands'
    );
  }

  @isTest
  static void glassBoxServesTheSnapshot() {
    RestResponse res;
    System.runAs(edgeUser()) {
      res = get(SiteActionsResource.ACTION_GLASS_BOX);
    }
    Assert.areEqual(200, res.statusCode, 'Served, body ' + text(res));
    Assert.isTrue(text(res).startsWith('{"result":{'), 'A result object');
    Assert.isTrue(
      text(res).contains('"orgQuotas"'),
      'The org quotas are in it'
    );
  }

  @isTest
  static void pipelineStatusShowsTheStaticSiteBuildRow() {
    insert new Pipeline_Run__c(
      Run_Key__c = 'site:1',
      Workflow__c = 'site',
      Status__c = 'Success',
      Run_Id__c = '1',
      Run_Url__c = 'https://github.com/rdbumstead/repo/actions/runs/1',
      Commit_Sha__c = 'sha1',
      Completed_At__c = Datetime.now().addHours(-1)
    );
    RestResponse res;
    System.runAs(edgeUser()) {
      res = get(SiteActionsResource.ACTION_PIPELINE_STATUS);
    }
    Assert.areEqual(200, res.statusCode, 'Served, body ' + text(res));
    Assert.isTrue(text(res).contains('"key":"site"'), 'The site row');
    Assert.isTrue(text(res).contains('Static site build green'), 'Its label');
  }
}
