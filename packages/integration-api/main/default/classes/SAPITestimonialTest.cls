/**
 * @description       : Unit tests for SAPITestimonial REST resource.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 01/02/2026
 **/
@IsTest
private class SAPITestimonialTest {
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
    RestTestUtil.initGet('/services/apexrest/sapi/v1/testimonials/');
    RestResponse res = RestTestUtil.getResponse();

    System.runAs(new User(Id = UserInfo.getUserId())) {
      Test.startTest();
      SAPITestimonial.getTestimonials();
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
      System.assertEquals(
        'no-store, no-cache',
        res.headers.get('Cache-Control'),
        'Testimonials are no-store per the spec header reference'
      );
    }
  }

  @IsTest
  static void testGetTestimonialsWithFilter() {
    RestTestUtil.initGet(
      '/services/apexrest/sapi/v1/testimonials/',
      new Map<String, String>{ 'vibeMode' => 'Professional' }
    );
    RestResponse res = RestTestUtil.getResponse();

    System.runAs(new User(Id = UserInfo.getUserId())) {
      Test.startTest();
      SAPITestimonial.getTestimonials();
      Test.stopTest();

      System.assertEquals(200, res.statusCode, 'Should return 200 OK');
    }
  }

  @IsTest
  static void testGetTestimonialsInvalidLimit() {
    RestTestUtil.initGet(
      '/services/apexrest/sapi/v1/testimonials/',
      new Map<String, String>{ 'limit' => '0' }
    );
    RestResponse res = RestTestUtil.getResponse();

    System.runAs(new User(Id = UserInfo.getUserId())) {
      Test.startTest();
      SAPITestimonial.getTestimonials();
      Test.stopTest();

      System.assertEquals(400, res.statusCode, 'Should return 400 Bad Request');
    }
  }
  @IsTest
  static void testGetTestimonialsInternalError() {
    RestTestUtil.initGet('/services/apexrest/sapi/v1/testimonials/');
    RestResponse res = RestTestUtil.getResponse();

    SAPITestimonial.throwException = true;

    Test.startTest();
    SAPITestimonial.getTestimonials();
    Test.stopTest();

    System.assertEquals(
      500,
      res.statusCode,
      'Should return 500 on internal error'
    );
  }
}
