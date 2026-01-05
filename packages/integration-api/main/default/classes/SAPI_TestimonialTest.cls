/**
 * @description       : Unit tests for SAPI_Testimonial REST resource.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 01/02/2026
 **/
@IsTest
private class SAPI_TestimonialTest {
  @TestSetup
  static void setup() {
    Testimonial__c t = new Testimonial__c(
      Author_Name__c = 'Jane Doe',
      Approved__c = true,
      Relationship_Type__c = 'Manager',
      Vibe_Mode__c = 'Professional',
      Sort_Order__c = 1
    );
    insert t;
  }

  @IsTest
  static void testGetTestimonialsSuccess() {
    RestRequest req = new RestRequest();
    RestResponse res = new RestResponse();

    req.requestURI = '/services/apexrest/sapi/v1/testimonials/';
    req.httpMethod = 'GET';
    RestContext.request = req;
    RestContext.response = res;

    System.runAs(new User(Id = UserInfo.getUserId())) {
      Test.startTest();
      SAPI_Testimonial.getTestimonials();
      Test.stopTest();

      if (res.statusCode != 200) {
        System.assert(false, 'ERR:' + res.responseBody.toString());
      }
      System.assertEquals(200, res.statusCode, 'Should return 200 OK');
      System.assertNotEquals(
        null,
        res.responseBody,
        'Response body should not be null'
      );

      String responseJson = res.responseBody.toString();
      System.assert(
        responseJson.contains('Jane Doe'),
        'Response should contain author name'
      );
    }
  }

  @IsTest
  static void testGetTestimonialsWithFilter() {
    RestRequest req = new RestRequest();
    RestResponse res = new RestResponse();
    req.params.put('vibeMode', 'Professional');

    req.requestURI = '/services/apexrest/sapi/v1/testimonials/';
    req.httpMethod = 'GET';
    RestContext.request = req;
    RestContext.response = res;

    System.runAs(new User(Id = UserInfo.getUserId())) {
      Test.startTest();
      SAPI_Testimonial.getTestimonials();
      Test.stopTest();

      System.assertEquals(200, res.statusCode, 'Should return 200 OK');
    }
  }

  @IsTest
  static void testGetTestimonialsInvalidLimit() {
    RestRequest req = new RestRequest();
    RestResponse res = new RestResponse();
    req.params.put('limit', '0');

    req.requestURI = '/services/apexrest/sapi/v1/testimonials/';
    req.httpMethod = 'GET';
    RestContext.request = req;
    RestContext.response = res;

    System.runAs(new User(Id = UserInfo.getUserId())) {
      Test.startTest();
      SAPI_Testimonial.getTestimonials();
      Test.stopTest();

      System.assertEquals(400, res.statusCode, 'Should return 400 Bad Request');
    }
  }
  @IsTest
  static void testGetTestimonialsInternalError() {
    RestRequest req = new RestRequest();
    RestResponse res = new RestResponse();
    // req.requestURI = null; // No longer needed
    req.httpMethod = 'GET';
    RestContext.request = req;
    RestContext.response = res;

    SAPI_Testimonial.throwException = true;

    Test.startTest();
    SAPI_Testimonial.getTestimonials();
    Test.stopTest();

    System.assertEquals(
      500,
      res.statusCode,
      'Should return 500 on internal error'
    );
  }
}
