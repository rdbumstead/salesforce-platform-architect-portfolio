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

  public class MockTrigger implements HttpCalloutMock {
    public HttpResponse respond(HttpRequest req) {
      CalloutException e = (CalloutException) CalloutException.class
        .newInstance();
      e.setMessage('Service Unavailable');
      throw e;
    }
  }
}
