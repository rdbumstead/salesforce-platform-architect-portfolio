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
  static void calloutTimeoutIsTwentySeconds() {
    // The shipped Gemini record and the fallback both give 20 s (PD-D11).
    Assert.areEqual(20000, GeminiService.DEFAULT_TIMEOUT_MS, 'Default');
    Assert.areEqual(20000, GeminiService.timeoutMs(), 'Timeout in use');
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
