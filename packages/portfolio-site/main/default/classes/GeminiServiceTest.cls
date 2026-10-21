/**
 * @description       : Unit tests for GeminiService class.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 01/03/2026
 **/
@isTest
private class GeminiServiceTest {
  @isTest
  static void testGenerateContentSuccess() {
    // 1. Set Mock
    Test.setMock(
      HttpCalloutMock.class,
      new TestFactory.MockResponseGenerator(
        200,
        'OK',
        TestFactory.getGeminiResponseJson()
      )
    );

    // 2. Run Test
    Test.startTest();
    String result = GeminiService.generateContentStatic('Define AI');
    Test.stopTest();

    // 3. Assert
    System.assertEquals(
      'AI is a simulation of human intelligence processes.',
      result
    );
  }

  @isTest
  static void testGenerateContentError() {
    // 1. Set Mock
    Test.setMock(
      HttpCalloutMock.class,
      new TestFactory.MockResponseGenerator(
        400,
        'Bad Request',
        '{"error": "Invalid API Key"}'
      )
    );

    // 2. Run Test
    Test.startTest();
    String result = GeminiService.generateContentStatic('Define AI');
    Test.stopTest();

    // 3. Assert
    System.assert(
      result.contains('Error: Unable to generate content'),
      'Should return error message'
    );
  }

  @isTest
  static void testGenerateContentException() {
    // 1. Set Mock to throw exception
    Test.setMock(
      HttpCalloutMock.class,
      new TestFactory.MockResponseGenerator(500, 'Error', 'Error')
    );
    // Since we rely on TestFactory mock generator which might not support throwing exceptions easily without modification,
    // we can use a custom inner mock here.
    Test.setMock(HttpCalloutMock.class, new MockTrigger());

    // 2. Run Test
    Test.startTest();
    String result = GeminiService.generateContentStatic('Define AI');
    Test.stopTest();

    // 3. Assert
    System.assert(
      result.contains('Exception:'),
      'Should handle exceptions gracefully'
    );
  }

  private class CapturingMock implements HttpCalloutMock {
    public HttpRequest received;
    private final String body;

    CapturingMock(String body) {
      this.body = body;
    }

    public HttpResponse respond(HttpRequest req) {
      received = req;
      HttpResponse res = new HttpResponse();
      res.setStatusCode(200);
      res.setBody(body);
      return res;
    }
  }

  @isTest
  static void endpointPathCarriesTheModelConstant() {
    // No record, so the constant is the model. The record case is tested below.
    useGeminiRecord(null);
    CapturingMock mock = new CapturingMock(TestFactory.getGeminiResponseJson());
    Test.setMock(HttpCalloutMock.class, mock);

    Test.startTest();
    GeminiService.generateContentStatic('Define AI');
    Test.stopTest();

    Assert.areEqual('gemma-4-31b-it', GeminiService.MODEL, 'Model id');
    Assert.areEqual(
      'callout:Gemini_API/v1beta/models/' +
        GeminiService.MODEL +
        ':generateContent',
      mock.received.getEndpoint(),
      'Endpoint is built from the model constant'
    );
    Assert.isFalse(
      mock.received.getBody().contains('systemInstruction'),
      'Gemma rejects systemInstruction'
    );
  }

  @isTest
  static void interfaceMethodsDelegateToTheStaticCall() {
    Test.setMock(
      HttpCalloutMock.class,
      new CapturingMock(TestFactory.getGeminiResponseJson())
    );
    GeminiService service = new GeminiService();

    Test.startTest();
    String result = service.generateContent('Define AI', null);
    Test.stopTest();

    Assert.isTrue(service.isAvailable(), 'Always offered');
    Assert.areEqual(
      'AI is a simulation of human intelligence processes.',
      result,
      'Instance call returns the parsed text'
    );
  }

  @isTest
  static void responseWithoutCandidatesYieldsEmptyText() {
    Test.setMock(HttpCalloutMock.class, new CapturingMock('{"candidates":[]}'));

    Test.startTest();
    String result = GeminiService.generateContentStatic('Define AI');
    Test.stopTest();

    Assert.areEqual('', result, 'No candidates means no text');
  }

  @isTest
  static void calloutTimeoutComesFromTheRecordElseTwentySeconds() {
    useGeminiRecord('{"Timeout_Ms__c":45000}');
    Integer configured = GeminiService.timeoutMs();
    useGeminiRecord(null);
    Integer fallback = GeminiService.timeoutMs();

    Assert.areEqual(45000, configured, 'Timeout_Ms__c is used');
    Assert.areEqual(20000, GeminiService.DEFAULT_TIMEOUT_MS, 'Default');
    Assert.areEqual(20000, fallback, 'No record means 20 s (PD-D11)');
  }

  // --- Thinking models and the configured model (WS5b) ---

  /** The response shape the owner captured from Gemma 4 31B: reasoning first, answer second. */
  private static final String TWO_PART_RESPONSE = JSON.serialize(
    new Map<String, Object>{
      'candidates' => new List<Object>{
        new Map<String, Object>{
          'content' => new Map<String, Object>{
            'parts' => new List<Object>{
              new Map<String, Object>{
                'text' => 'The user asks what AI does. I should answer in one sentence.',
                'thought' => true
              },
              new Map<String, Object>{
                'text' => 'It analyzes vast amounts of data to find patterns and make predictions.'
              }
            },
            'role' => 'model'
          },
          'finishReason' => 'STOP',
          'index' => 0
        }
      },
      'usageMetadata' => new Map<String, Object>{
        'thoughtsTokenCount' => 289,
        'totalTokenCount' => 310
      }
    }
  );

  private static final String THOUGHT_ONLY_RESPONSE = '{"candidates":[{"content":{"parts":[{"text":"Still thinking about it","thought":true}]},"finishReason":"MAX_TOKENS"}]}';

  private static void useGeminiRecord(String fieldsJson) {
    GeminiService.configOverridden = true;
    GeminiService.configOverride = fieldsJson == null
      ? null
      : (AI_Provider_Config__mdt) JSON.deserialize(
          fieldsJson,
          AI_Provider_Config__mdt.class
        );
  }

  private class StatusMock implements HttpCalloutMock {
    private final Integer status;
    private final String body;
    public HttpRequest received;

    StatusMock(Integer status, String body) {
      this.status = status;
      this.body = body;
    }

    public HttpResponse respond(HttpRequest req) {
      received = req;
      HttpResponse res = new HttpResponse();
      res.setStatusCode(status);
      res.setBody(body);
      return res;
    }
  }

  private static ContentGenerationController.GenerationResult dispatchCoverLetter() {
    AgentforceService.configOverridden = true;
    AgentforceService.configOverride = null;
    return ContentGenerationController.dispatch(
      new ContentGenerationController.GenerationRequest(
        'Write a cover letter',
        new Map<String, Object>{
          'companyName' => 'Acme',
          'jobTitle' => 'Architect'
        },
        true
      )
    );
  }

  @isTest
  static void ownersTwoPartResponseReturnsOnlyTheAnswer() {
    Test.setMock(HttpCalloutMock.class, new StatusMock(200, TWO_PART_RESPONSE));

    Test.startTest();
    String result = GeminiService.generateContentStatic('What does AI do?');
    Test.stopTest();

    Assert.areEqual(
      'It analyzes vast amounts of data to find patterns and make predictions.',
      result,
      'Only the answer part'
    );
    Assert.isFalse(result.contains('I should answer'), 'No reasoning text');
  }

  @isTest
  static void answerSplitAcrossPartsIsJoinedInOrder() {
    String body = '{"candidates":[{"content":{"parts":[{"text":"plan","thought":true},{"text":"Dear "},{"text":"thought","thought":true},{"text":"Hiring Manager"}]},"finishReason":"STOP"}]}';

    Assert.areEqual(
      'Dear Hiring Manager',
      GeminiService.parseResponse(body),
      'Answer parts joined in order, thoughts skipped'
    );
  }

  @isTest
  static void thoughtOnlyResponseFallsThroughToLocal() {
    Test.setMock(
      HttpCalloutMock.class,
      new StatusMock(200, THOUGHT_ONLY_RESPONSE)
    );

    Test.startTest();
    String direct = GeminiService.generateContentStatic('prompt');
    ContentGenerationController.GenerationResult result = dispatchCoverLetter();
    Test.stopTest();

    Assert.areEqual('', direct, 'No answer text, no content');
    Assert.areEqual('Local', result.provider, 'Failed attempt, Local serves');
    Assert.isFalse(
      result.content.contains('Still thinking'),
      'Thought text is never served'
    );
    Assert.areEqual(
      'failed',
      result.attempts[1].outcome,
      'Gemini attempt failed'
    );
  }

  @isTest
  static void singlePartWithoutThoughtReturnsItsText() {
    Test.setMock(
      HttpCalloutMock.class,
      new StatusMock(
        200,
        '{"candidates":[{"content":{"parts":[{"text":"Plain answer"}]},"finishReason":"STOP"}]}'
      )
    );

    Test.startTest();
    String result = GeminiService.generateContentStatic('prompt');
    Test.stopTest();

    Assert.areEqual('Plain answer', result, 'Non-thinking response works');
  }

  @isTest
  static void candidateWithoutContentReturnsNothing() {
    Assert.areEqual(
      '',
      GeminiService.parseResponse('{"candidates":[{"finishReason":"SAFETY"}]}'),
      'Blocked answer is empty'
    );
  }

  @isTest
  static void unavailableModelFallsThroughToLocal() {
    Test.setMock(
      HttpCalloutMock.class,
      new StatusMock(
        503,
        '{"error":{"code":503,"message":"This model is currently experiencing high demand.","status":"UNAVAILABLE"}}'
      )
    );

    Test.startTest();
    String direct = GeminiService.generateContentStatic('prompt');
    ContentGenerationController.GenerationResult result = dispatchCoverLetter();
    Test.stopTest();

    Assert.areEqual(
      'Error: Unable to generate content. (Status: 503)',
      direct,
      'Status kept in the failure text'
    );
    Assert.areEqual('Local', result.provider, 'Local serves');
    Assert.areEqual('failed', result.attempts[1].outcome, 'Gemini failed');
  }

  @isTest
  static void serverErrorAndRateLimitAreFailures() {
    Test.setMock(HttpCalloutMock.class, new StatusMock(500, '{}'));
    String serverError = GeminiService.generateContentStatic('prompt');
    Test.setMock(HttpCalloutMock.class, new StatusMock(429, '{}'));
    String rateLimited = GeminiService.generateContentStatic('prompt');

    Assert.isTrue(serverError.endsWith('(Status: 500)'), serverError);
    Assert.isTrue(rateLimited.endsWith('(Status: 429)'), rateLimited);
  }

  @isTest
  static void modelIdComesFromTheRecordForEndpointAndResult() {
    useGeminiRecord('{"Model_Or_Template__c":"gemini-test-model"}');
    StatusMock mock = new StatusMock(200, TWO_PART_RESPONSE);
    Test.setMock(HttpCalloutMock.class, mock);

    Test.startTest();
    ContentGenerationController.GenerationResult result = dispatchCoverLetter();
    Test.stopTest();

    Assert.areEqual(
      'callout:Gemini_API/v1beta/models/gemini-test-model:generateContent',
      mock.received.getEndpoint(),
      'Endpoint uses the record'
    );
    Assert.areEqual('Gemini', result.provider, 'Gemini served');
    Assert.areEqual('gemini-test-model', result.model, 'Reported model');
    Assert.areEqual(
      'gemini-test-model',
      ContentGenerationController.providerStatus()[1].model,
      'Footer view reports it too'
    );
  }

  @isTest
  static void blankOrInvalidRecordModelFallsBackToTheConstant() {
    useGeminiRecord(null);
    String noRecord = GeminiService.model();
    useGeminiRecord('{"Model_Or_Template__c":" "}');
    String blank = GeminiService.model();
    useGeminiRecord('{"Model_Or_Template__c":"../other:path"}');
    String invalid = GeminiService.model();

    Assert.areEqual(GeminiService.MODEL, noRecord, 'No record');
    Assert.areEqual(GeminiService.MODEL, blank, 'Blank value');
    Assert.areEqual(GeminiService.MODEL, invalid, 'Not a model id');
  }

  public class MockTrigger implements HttpCalloutMock {
    public HttpResponse respond(HttpRequest req) {
      CalloutException e = (CalloutException) CalloutException.class
        .newInstance();
      e.setMessage('Service Unavailable');
      throw e;
    }
  }
}
